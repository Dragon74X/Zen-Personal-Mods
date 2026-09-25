// Execute production functions with browser API fakes; no browser/profile IO.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test as nodeTest } from "node:test";
const test = (name, fn) => nodeTest(name, { timeout: 1000 }, fn);

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
function clock() {
  const timers = new Map();
  let serial = 0;
  return { timers, setTimeout: fn => { timers.set(++serial, fn); return serial; },
    clearTimeout: id => timers.delete(id) };
}
function element() {
  const attrs = new Map(), events = new Map();
  return {
    children: [], style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" }, isConnected: true,
    setAttribute: (k, v) => attrs.set(k, v), getAttribute: k => attrs.get(k),
    hasAttribute: k => attrs.has(k), removeAttribute: k => attrs.delete(k),
    addEventListener: (k, fn) => events.set(k, fn), removeEventListener: k => events.delete(k),
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(child) { return this.appendChild(child); },
    remove() { this.isConnected = false; }, focus() {},
    showModal() { this.open = true; }, close() { this.open = false; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    fire: k => events.get(k)?.({}),
  };
}
function browser() {
  const root = element(), body = element();
  const w = { ...element(), ...clock(), getComputedStyle: () => ({ position: "fixed" }) };
  w.document = { body, documentElement: root, createElementNS: element };
  return w;
}
async function load(mod, names, context) {
  let source = await readFile(new URL(`../${mod}/${mod}.uc.js`, import.meta.url), "utf8");
  const marker = "  // ---- declared defaults";
  assert.ok(source.includes(marker));
  source = source.replace(marker, `  globalThis.harness = {${names}}; return;\n${marker}`);
  const sandbox = vm.createContext({ console, ...context });
  vm.runInContext(source, sandbox);
  return sandbox.harness;
}

async function downloadEnv() {
  const windows = [], proto = { promptForSaveToFileAsync() {} };
  const Services = { prefs: { getPrefType: () => 0, getBoolPref: (_k, d) => d },
    wm: { getEnumerator: () => {
      const it = windows[Symbol.iterator](); let next = it.next();
      return { hasMoreElements: () => !next.done, getNext: () => { const w = next.value; next = it.next(); return w; } };
    } } };
  async function add() {
    const w = browser(); windows.push(w);
    const h = await load("download-prompt", "start, ask", {
      window: w, Services, Cc: { "@mozilla.org/helperapplauncherdialog;1": {
        createInstance: () => Object.create(proto) } }, Ci: {},
      ChromeUtils: { importESModule: () => ({ nsUnknownContentTypeDialog: { prototype: proto } }) },
    });
    h.start();
    return { w, h };
  }
  return { add, proto };
}

test("closing a non-owner leaves the shared download hook unchanged", async () => {
  const e = await downloadEnv(), a = await e.add(), b = await e.add();
  const installed = e.proto.promptForSaveToFileAsync;
  b.w.__zzdlInstance.retire();
  assert.equal(e.proto.promptForSaveToFileAsync, installed);
  assert.equal(a.w.DownloadPrompt.status().hookedCopies, 1);
});

test("owner retirement preserves another window's question and hands off hook", async () => {
  const e = await downloadEnv(), a = await e.add(), b = await e.add();
  const choice = a.h.ask(b.w, { leafName: "file.txt" }, "/downloads");
  const installed = e.proto.promptForSaveToFileAsync;
  const host = b.w.document.body.children[0];
  assert.ok(host);
  a.w.__zzdlInstance.retire();
  assert.equal(host.isConnected, true);
  assert.equal(typeof b.w.__zzdlQuestion, "function");
  assert.notEqual(e.proto.promptForSaveToFileAsync, installed);
  b.w.fire("unload");
  assert.equal(await choice, 2);
  assert.equal(host.isConnected, false);
  assert.equal(b.w.timers.size, 0);
});

test("repeated preview resolves the old question before showing another", async () => {
  const e = await downloadEnv(), a = await e.add();
  const one = a.w.DownloadPrompt.preview();
  const two = a.w.DownloadPrompt.preview();
  assert.equal(await one, "keep both");
  a.w.__zzdlInstance.retire();
  assert.equal(await two, "keep both");
});

async function routerEnv(extra = {}) {
  const c = clock(), callbacks = [], prefs = new Map();
  let cancelled = 0;
  const NetUtil = { newChannel: () => ({ loadFlags: 0, cancel() { cancelled++; },
      asyncOpen(listener) { NetUtil.open(this, listener); } }),
    open: (channel, listener) => callbacks.push([channel, listener]),
    readInputStreamToString: (s, count) => s.body.slice(0, count) };
  const h = await load("tab-router", "fetchAnon, fetchCreator, fetchSectionIcon, creatorMap, iconMap, stampIcons, live, majorityContext, learnedMap, saveLearned, saveCreators, saveIcons, forgetAll, cancelLookups, rules, suggestRules, route, skip, targetPath, reopenInContainer, resolveDestination, prefObserver, progress, placeInPath, initialRequest, retire: () => retired = true", {
    ...c, window: {}, gBrowser: { tabGroups: [], tabs: [] }, document: { querySelectorAll: () => [] },
    ChromeUtils: { generateQI: () => () => {}, importESModule: name => name.includes("NetUtil") ? { NetUtil }
      : { PrivateBrowsingUtils: { isWindowPrivate: () => false } } },
    Services: { prefs: { PREF_INT: 64, PREF_STRING: 32, getPrefType: k => typeof prefs.get(k) === "number" ? 64 : 32,
      getIntPref: k => prefs.get(k), getBoolPref: (k, d) => prefs.get(k) ?? d, getStringPref: (k, d) => prefs.get(k) ?? d,
      setStringPref: (k, v) => prefs.set(k, v) },
      io: { newURI: url => { const u = new URL(url); return { scheme: u.protocol.slice(0, -1), host: u.hostname, userPass: u.username + u.password }; } },
      scriptSecurityManager: { createContentPrincipal() {} } },
    Ci: { nsILoadInfo: {}, nsIContentPolicy: { TYPE_DOCUMENT: 6 }, nsIRequest: {}, nsIWebProgressListener: { STATE_STOP: 16, STATE_IS_NETWORK: 0x40000 } },
    Components: { isSuccessCode: s => s === 0, results: { NS_BINDING_ABORTED: 0x804b0002 } },
    URLSearchParams, Blob, Uint8Array, OffscreenCanvas: class {}, ...extra,
  });
  const answer = body => {
    const [channel, listener] = callbacks.shift();
    listener.onStartRequest(channel);
    listener.onDataAvailable(channel, { body }, 0, body.length);
    listener.onStopRequest(channel, 0);
  };
  return { h, NetUtil, c, answer, prefs, get cancelled() { return cancelled; } };
}

test("synchronous fetch failure leaves no timeout or second completion", async () => {
  const e = await routerEnv(); let completions = 0;
  e.NetUtil.open = () => { throw new Error("setup failed"); };
  assert.throws(() => e.h.fetchAnon("https://example.com", 0, () => completions++), /setup failed/);
  assert.equal(e.c.timers.size, 0);
  assert.equal(completions, 0); // The caller's catch owns failure completion.
});

test("timeout and later network completion invoke callback once", async () => {
  const e = await routerEnv(); const results = [];
  e.h.fetchAnon("https://example.com", 0, body => results.push(body));
  [...e.c.timers.values()][0]();
  e.answer("late response");
  assert.deepEqual(results, [null]);
  assert.equal(e.c.timers.size, 0);
});

test("history purge and retirement discard pending creator/icon results", async () => {
  for (const action of ["forgetAll", "cancelLookups"]) {
    const e = await routerEnv();
    e.h.fetchCreator({ getAttribute: () => "0", isConnected: false }, "video");
    e.h.fetchSectionIcon("channel", "https://example.com/channel", 0, "round");
    e.h[action]();
    e.answer(JSON.stringify({ author_name: "Late creator" }));
    e.answer("no image");
    assert.equal(e.h.creatorMap().size, 0);
    assert.equal(e.h.iconMap().size, 0);
    assert.equal(e.c.timers.size, 0);
  }
});

async function glassEnv(privateWindow = false) {
  const root = element(), toolbox = element(), panel = element(), browser = element();
  root.setAttribute("zen-compact-mode", "true"); toolbox.setAttribute("zen-has-hover", "");
  const snapshot = deferred(), blob = deferred(), blobStarted = deferred(), c = clock();
  let snapshots = 0, closed = 0, conversions = 0, now = 10000;
  const snapshotQueue = [], blobQueue = [];
  const pixels = [0, 0, 0, 0];
  browser.browsingContext = { currentWindowGlobal: { drawSnapshot() { snapshots++; return snapshotQueue.length ? snapshotQueue.shift() : snapshot.promise; } } };
  const revoked = [], prefs = new Map();
  const h = await load("glassflow", "sampleOnce, clearSample, syncSampleNow, syncSampling, sidebarShown, hide: () => document.hidden = true, navigate: () => gBrowser.selectedBrowser.browsingContext.currentWindowGlobal = {}", {
    ...c, Date: { now: () => now }, window: { windowUtils: { getBoundsWithoutFlushing: el => el.getBoundingClientRect() } },
    document: { documentElement: root, getElementById: id => ({ titlebar: panel, "navigator-toolbox": toolbox })[id], createElementNS: element },
    gBrowser: { selectedBrowser: browser },
    Services: { prefs: { getBoolPref: k => prefs.get(k) ?? true } },
    ChromeUtils: { importESModule: () => ({ PrivateBrowsingUtils: { isWindowPrivate: () => privateWindow } }) },
    OffscreenCanvas: class {
      width = 10; height = 10;
      getContext() { return { drawImage() {}, getImageData: () => ({ data: pixels }) }; }
      convertToBlob() { conversions++; blobStarted.resolve(); return blobQueue.length ? blobQueue.shift() : blob.promise; }
    },
    URL: { createObjectURL: () => `blob:test-${conversions}`, revokeObjectURL: url => revoked.push(url) },
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
  });
  return { h, panel, toolbox, root, prefs, snapshot, blob, blobStarted, revoked, pixels, timers: c.timers,
    snapshotQueue, blobQueue, advance: ms => { now += ms; },
    fireTimer() {
      const [id, fn] = c.timers.entries().next().value;
      c.timers.delete(id);
      return fn();
    }, get conversions() { return conversions; }, get snapshots() { return snapshots; },
    bitmap: { width: 10, height: 10, close() { closed++; } }, get closed() { return closed; } };
}

test("history purge invalidates a pending snapshot before it paints", async () => {
  const e = await glassEnv(); const sample = e.h.sampleOnce();
  e.h.clearSample(); e.snapshot.resolve(e.bitmap);
  await sample;
  assert.equal(e.closed, 1);
  assert.equal(e.panel.hasAttribute("zzglass-sample"), false);
});

test("history purge invalidates pending blob conversion and revokes its URL", async () => {
  const e = await glassEnv(); const sample = e.h.sampleOnce();
  e.snapshot.resolve(e.bitmap); await e.blobStarted.promise;
  e.h.clearSample(); e.blob.resolve({}); await sample;
  assert.equal(e.panel.hasAttribute("zzglass-sample"), false);
  assert.deepEqual(e.revoked, ["blob:test-1"]);
});

test("hidden private sidebar does not warm a snapshot", async () => {
  const e = await glassEnv(true);
  e.toolbox.removeAttribute("zen-has-hover");
  await e.h.sampleOnce(true);
  assert.equal(e.snapshots, 0);
});

test("purge ignores an icon whose image decode completes afterward", async () => {
  const decode = deferred();
  const e = await routerEnv({ createImageBitmap: () => decode.promise,
    OffscreenCanvas: class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return { arrayBuffer: async () => new Uint8Array([1]).buffer }; }
    }, btoa: s => Buffer.from(s).toString("base64") });
  e.h.fetchSectionIcon("channel", "https://example.com/channel", 0, "round");
  e.answer('<meta property="og:image" content="https://example.com/avatar.png">');
  e.answer("image bytes");
  e.h.forgetAll();
  decode.resolve({ width: 64, height: 64, close() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.h.iconMap().size, 0);
  assert.equal(e.prefs.get("zzrouter.avatars"), "{}");
});

test("private sidebar hiding invalidates the snapshot already in flight", async () => {
  const e = await glassEnv(true);
  const sample = e.h.sampleOnce();
  e.h.syncSampling();
  e.toolbox.removeAttribute("zen-has-hover");
  e.h.syncSampling();
  e.snapshot.resolve(e.bitmap);
  await sample;
  assert.equal(e.closed, 1);
  assert.equal(e.panel.hasAttribute("zzglass-sample"), false);
});

test("question ownership remains visible after shared hook handoff", async () => {
  const e = await downloadEnv(), a = await e.add(), b = await e.add();
  const oldQuestion = a.h.ask(b.w, { leafName: "old.txt" }, "/downloads");
  a.w.__zzdlInstance.retire();
  const replacement = b.w.DownloadPrompt.preview();
  assert.equal(await oldQuestion, 2);
  b.w.__zzdlInstance.retire();
  assert.equal(await replacement, "keep both");
  assert.equal(b.w.timers.size, 0);
});

async function turboEnv({ privateWindow = false, rows = Promise.resolve([]), failConnect = false } = {}) {
  const c = clock(), w = browser(), values = new Map(), connects = [];
  let queries = 0, savedWrites = 0;
  const pref = {
    PREF_INVALID: 0, PREF_STRING: 32, PREF_INT: 64, PREF_BOOL: 128,
    getPrefType: k => !values.has(k) ? 0 : ({ string: 32, number: 64, boolean: 128 })[typeof values.get(k)],
    getStringPref: (k, d) => values.get(k) ?? d, getIntPref: (k, d) => values.get(k) ?? d,
    getBoolPref: (k, d) => values.get(k) ?? d,
    setStringPref: (k, v) => { if (k === "zzturbo.saved-prefs") savedWrites++; values.set(k, v); }, setIntPref: (k, v) => values.set(k, v),
    setBoolPref: (k, v) => values.set(k, v), clearUserPref: k => values.delete(k),
    prefHasUserValue: k => values.has(k), addObserver() {}, removeObserver() {},
  };
  const tabContainer = element(), root = element();
  w.XULBrowserWindow = { setOverLink: (...args) => args };
  const h = await load("zen-turbo", "start, syncPacks, startupWarmup, forgetWarmups, warmAfterDwell, cancelDwell, onHover, syncSmoothing", {
    ...c, window: w, gBrowser: { tabContainer, addTabsProgressListener() {}, removeTabsProgressListener() {} },
    document: { documentElement: root, getElementById: () => null },
    MutationObserver: class { observe() {} disconnect() {} },
    Services: { prefs: pref, wm: { getMostRecentWindow: () => w },
      obs: { addObserver() {}, removeObserver() {} },
      scriptSecurityManager: { createContentPrincipal: (uri, attrs) => ({ uri, originAttributes: attrs }) },
      io: { newURI: url => ({ scheme: new URL(url).protocol.slice(0, -1), prePath: new URL(url).origin }),
        speculativeConnect(uri, principal) {
          if (failConnect) throw new Error("connection unavailable");
          connects.push({ origin: uri.prePath, attrs: principal.originAttributes });
        } },
    },
    ChromeUtils: { importESModule: uri => uri.includes("PrivateBrowsing")
      ? { PrivateBrowsingUtils: { isWindowPrivate: () => privateWindow } }
      : { PlacesUtils: { promiseDBConnection: async () => ({ executeCached() { queries++; return rows; } }) } } },
  });
  return { h, w, c, root, values, connects, tabContainer, get queries() { return queries; }, get savedWrites() { return savedWrites; } };
}

test("Turbo re-sync and disable preserve a managed preference edited by the user", async () => {
  const e = await turboEnv();
  const pref = "network.http.max-persistent-connections-per-server";
  e.values.set(pref, 6);
  e.h.syncPacks(); assert.equal(e.values.get(pref), 10);
  e.values.set(pref, 7);
  e.h.syncPacks(); assert.equal(e.values.get(pref), 7);
  e.values.set("zzturbo.pack-network", false);
  e.h.syncPacks(); assert.equal(e.values.get(pref), 7);
});

test("Turbo writes one restoration snapshot per changed sync and none for unchanged packs", async () => {
  const e = await turboEnv(), pref = "network.http.max-persistent-connections-per-server";
  e.values.set(pref, 6);
  e.h.syncPacks(); assert.equal(e.savedWrites, 1);
  e.h.syncPacks(); assert.equal(e.savedWrites, 1);
  e.values.set("zzturbo.pack-network", false);
  e.h.syncPacks(); assert.equal(e.values.get(pref), 6);
  assert.equal(e.savedWrites, 2);
  assert.deepEqual(JSON.parse(e.values.get("zzturbo.saved-prefs")), {});
});

test("Turbo private startup never queries normal browsing history", async () => {
  const e = await turboEnv({ privateWindow: true });
  await e.h.startupWarmup();
  assert.equal(e.queries, 0);
  assert.equal(e.connects.length, 0);
});

test("Turbo purge invalidates a pending history query", async () => {
  const rows = deferred(), e = await turboEnv({ rows: rows.promise });
  const running = e.h.startupWarmup();
  await Promise.resolve();
  e.h.forgetWarmups();
  rows.resolve([{ getResultByName: k => k === "prefix" ? "https://" : "example.com" }]);
  await running;
  assert.equal(e.c.timers.size, 0);
  assert.equal(e.connects.length, 0);
});

test("Turbo cancels hover requests after leaving the surface or entering a loaded tab", async () => {
  const e = await turboEnv(); e.h.start();
  e.h.forgetWarmups(); // Remove the independent startup timer.
  e.h.warmAfterDwell("https://example.com", 0);
  e.tabContainer.fire("mouseleave");
  assert.equal(e.c.timers.size, 0);
  e.h.warmAfterDwell("https://example.com", 0);
  e.h.onHover({ target: { closest: () => null } });
  assert.equal(e.c.timers.size, 0);
});

test("Turbo leaves Firefox's native page-link hover handler unchanged", async () => {
  const e = await turboEnv(), original = e.w.XULBrowserWindow.setOverLink;
  e.h.start();
  assert.equal(e.w.XULBrowserWindow.setOverLink, original);
  e.w.__zzturboInstance.retire();
  assert.equal(e.w.XULBrowserWindow.setOverLink, original);
  assert.equal(e.c.timers.size, 0);
});

test("failed Turbo requests are not counted or throttled as successful warmups", async () => {
  const e = await turboEnv({ failConnect: true }); e.h.start();
  e.w.ZenTurbo.warm("https://example.com");
  assert.equal(e.w.ZenTurbo.stats().warmed, 0);
  assert.equal(e.w.ZenTurbo.status().recentOriginContexts, 0);
});

test("sidebar sampling distinguishes red from green at equal channel totals", async () => {
  const e = await glassEnv();
  e.pixels.splice(0, 4, 255, 0, 0, 128);
  const first = e.h.sampleOnce();
  e.snapshot.resolve(e.bitmap); e.blob.resolve({}); await first;
  e.pixels.splice(0, 4, 0, 255, 0, 128);
  await e.h.sampleOnce();
  assert.equal(e.conversions, 2);
});

test("hidden windows start no sidebar snapshots", async () => {
  const e = await glassEnv(); e.h.hide();
  await e.h.sampleOnce(true);
  assert.equal(e.snapshots, 0);
});

test("navigation discards an old document's pending sidebar snapshot", async () => {
  const e = await glassEnv(); const sample = e.h.sampleOnce();
  e.h.navigate(); e.snapshot.resolve(e.bitmap); await sample;
  assert.equal(e.conversions, 0);
  assert.equal(e.closed, 1);
});

test("router cancels the stream at 512 KiB and completes once", async () => {
  const e = await routerEnv(); const results = [];
  e.h.fetchAnon("https://example.com", 0, body => results.push(body));
  e.answer("x".repeat(600 * 1024));
  assert.equal(results.length, 1);
  assert.equal(results[0].length, 512 * 1024);
  assert.equal(e.cancelled, 1);
  assert.equal(e.c.timers.size, 0);
});

test("sidebar loop keeps refreshing without reopening the panel", async () => {
  const e = await glassEnv();
  e.snapshot.resolve(e.bitmap); e.blob.resolve({});
  e.h.syncSampling();
  await new Promise(resolve => setImmediate(resolve));
  for (let frame = 1; frame <= 3; frame++) {
    e.pixels[0] = frame;
    await e.fireTimer();
    assert.equal(e.conversions, frame + 1);
    assert.equal(e.timers.size, 1);
  }
});

test("sidebar loop recovers when a later snapshot stalls", async () => {
  const e = await glassEnv(), stalled = deferred();
  e.snapshot.resolve(e.bitmap); e.blob.resolve({});
  e.h.syncSampling();
  await new Promise(resolve => setImmediate(resolve));
  e.snapshotQueue.push(stalled.promise);
  const pending = e.fireTimer();
  assert.equal(e.timers.size, 1, "next tick must exist while snapshot is pending");
  e.advance(2001); e.pixels[0] = 42;
  await e.fireTimer();
  assert.equal(e.conversions, 2);
  const front = e.panel.children[0].children.find(layer => layer.hasAttribute("front"));
  assert.equal(front.style.backgroundImage, 'url("blob:test-2")');
  stalled.resolve(e.bitmap); await pending;
  assert.equal(e.conversions, 2, "late stale snapshot must not paint");
  assert.equal(e.timers.size, 1);
});

test("sidebar loop recovers when a later PNG encoding stalls", async () => {
  const e = await glassEnv(), stalled = deferred();
  e.snapshot.resolve(e.bitmap); e.blob.resolve({});
  e.h.syncSampling();
  await new Promise(resolve => setImmediate(resolve));
  e.pixels[0] = 1; e.blobQueue.push(stalled.promise);
  const pending = e.fireTimer();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.timers.size, 1, "next tick must exist while encoding is pending");
  e.advance(2001); e.pixels[0] = 2;
  await e.fireTimer();
  assert.equal(e.conversions, 3);
  stalled.resolve({}); await pending;
  assert.equal(e.timers.size, 1);
});

test("stalled encoding retries unchanged pixels without invalidating the newer painted frame", async () => {
  const e = await glassEnv();
  const stale = e.h.sampleOnce();
  e.snapshot.resolve(e.bitmap); await e.blobStarted.promise;
  e.advance(2001); e.blobQueue.push(Promise.resolve({}));
  await e.h.sampleOnce();
  assert.equal(e.conversions, 2);
  assert.equal(e.panel.hasAttribute("zzglass-sample"), true);
  e.blob.resolve({}); await stale;
  await e.h.sampleOnce();
  assert.equal(e.conversions, 2, "stale encoding must not clear the newer signature");
});

test("hiding the sidebar stops retries even if an old snapshot completes", async () => {
  const e = await glassEnv(), stalled = deferred();
  e.snapshot.resolve(e.bitmap); e.blob.resolve({});
  e.h.syncSampling();
  await new Promise(resolve => setImmediate(resolve));
  e.snapshotQueue.push(stalled.promise); e.pixels[0] = 7;
  const pending = e.fireTimer();
  e.toolbox.removeAttribute("zen-has-hover"); e.h.syncSampling();
  assert.equal(e.timers.size, 0);
  stalled.resolve(e.bitmap); await pending;
  assert.equal(e.timers.size, 0);
});

test("hide/reopen during a pending read leaves one refresh timer", async () => {
  const e = await glassEnv(), stalled = deferred();
  e.snapshot.resolve(e.bitmap); e.blob.resolve({});
  e.h.syncSampling();
  await new Promise(resolve => setImmediate(resolve));
  e.snapshotQueue.push(stalled.promise); e.pixels[0] = 7;
  const pending = e.fireTimer();
  e.toolbox.removeAttribute("zen-has-hover"); e.h.syncSampling();
  e.toolbox.setAttribute("zen-has-hover", ""); e.h.syncSampling();
  assert.equal(e.timers.size, 1);
  stalled.resolve(e.bitmap); await pending;
  assert.equal(e.timers.size, 1);
});

test("download question uses a labelled native modal", async () => {
  const e = await downloadEnv(), a = await e.add();
  const question = a.w.DownloadPrompt.preview();
  const host = a.w.document.body.children[0];
  assert.equal(host.open, true);
  assert.equal(host.getAttribute("aria-labelledby"), "zzdl-title");
  assert.equal(host.getAttribute("aria-describedby"), "zzdl-name zzdl-where");
  a.w.__zzdlQuestion(2);
  assert.equal(await question, "keep both");
  assert.equal(host.open, false);
});

test("Glassflow stops sampling when its sidebar master switch is disabled", async () => {
  const e = await glassEnv();
  e.h.syncSampling();
  e.prefs.set("zzglass.sidebar.enabled", false);
  e.h.syncSampling();
  e.snapshot.resolve(e.bitmap);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.timers.size, 0);
  assert.equal(e.panel.hasAttribute("zzglass-sample"), false);
  const before = e.snapshots;
  await e.h.sampleOnce(true);
  assert.equal(e.snapshots, before);
});

test("Glassflow recognises all Zen compact-sidebar reveal states", async () => {
  const e = await glassEnv(); e.toolbox.removeAttribute("zen-has-hover");
  for (const attr of ["zen-has-hover", "zen-user-show", "zen-has-empty-tab", "flash-popup", "has-popup-menu", "movingtab", "zen-compact-mode-active"]) {
    e.toolbox.setAttribute(attr, ""); assert.equal(e.h.sidebarShown(), true, attr);
    e.toolbox.removeAttribute(attr); assert.equal(e.h.sidebarShown(), false, attr);
  }
  e.root.setAttribute("zen-renaming-tab", "true"); assert.equal(e.h.sidebarShown(), true);
  e.root.setAttribute("inDOMFullscreen", "true"); assert.equal(e.h.sidebarShown(), false);
});

test("Glassflow restores only the animation setting it changed", async () => {
  const cfg = {}, values = new Map();
  const h = await load("glassflow", "syncInstantUI, restoreInstantUI", {
    window: { Motion: { MotionGlobalConfig: cfg } },
    Services: { prefs: { getBoolPref: (k, d) => values.get(k) ?? d } },
  });
  h.syncInstantUI(); assert.equal(Object.hasOwn(cfg, "instantAnimations"), false);
  values.set("zzglass.instant-ui", true); h.syncInstantUI(); assert.equal(cfg.instantAnimations, true);
  h.restoreInstantUI(); assert.equal(Object.hasOwn(cfg, "instantAnimations"), false);
  cfg.instantAnimations = false; h.syncInstantUI(); cfg.instantAnimations = false;
  h.restoreInstantUI(); assert.equal(cfg.instantAnimations, false);
});

test("Turbo passes a content principal with container/private attributes", async () => {
  const e = await turboEnv({ privateWindow: true }); e.h.start();
  e.w.ZenTurbo.warm("https://example.com", 7);
  assert.equal(e.connects.length, 1);
  assert.deepEqual({ ...e.connects[0].attrs }, { userContextId: 7, privateBrowsingId: 1 });
});

test("Turbo orphan restoration preserves manual changes and removes retired prefetch overrides", async () => {
  const e = await turboEnv(), key = "layout.css.corner-shape.enabled";
  e.values.set(key, true);
  e.values.set("zzturbo.saved-prefs", JSON.stringify({ [key]: { had: true, v: false } }));
  e.h.syncPacks();
  assert.equal(e.values.get(key), true);
  assert.deepEqual(JSON.parse(e.values.get("zzturbo.saved-prefs")), {});
  e.values.set("network.predictor.enable-prefetch", true);
  e.values.set("zzturbo.saved-prefs", JSON.stringify({ "network.predictor.enable-prefetch": { had: false } }));
  e.h.syncPacks();
  assert.equal(e.values.has("network.predictor.enable-prefetch"), false);
});

test("Router rejects image targets and redirects to local or non-HTTPS URLs", async () => {
  const e = await routerEnv();
  for (const url of ["https://127.0.0.1/icon", "https://localhost/icon", "http://example.com/icon", "https://user:pass@example.com/icon"]) {
    assert.throws(() => e.h.fetchAnon(url, 0, () => {}), /public HTTPS/);
  }
  let channel;
  e.NetUtil.open = c => { channel = c; };
  e.h.fetchAnon("https://example.com/icon", 0, () => {});
  for (const [scheme, host, code] of [["https", "localhost", 0x804b0002], ["http", "example.com", 0x804b0002], ["https", "cdn.example.com", 0]]) {
    let actual;
    channel.notificationCallbacks.asyncOnChannelRedirect(null, { URI: { scheme, host } }, 0, { onRedirectVerifyCallback: v => { actual = v; } });
    assert.equal(actual, code);
  }
  e.h.cancelLookups();
});

function tab(url = "https://example.com/crimsondesert") {
  const u = new URL(url);
  return { ...element(), label: url, lastAccessed: Date.now() - 3600000,
    linkedBrowser: { contentPrincipal: {}, currentURI: { spec: url, host: u.hostname, filePath: u.pathname, scheme: u.protocol.slice(0, -1), query: u.search.slice(1) } } };
}

test("Router recomputes a naming path when the title arrives at the same URL", async () => {
  const e = await routerEnv(), t = tab();
  for (const [k, v] of Object.entries({ "auto-unmatched": true, "auto-path-depth": 1, "auto-path-domains": "example.com", "section-icons": false })) e.prefs.set("zzrouter." + k, v);
  assert.equal(e.h.targetPath(t).at(-1), "Crimsondesert");
  t.label = "Crimson Desert - Example";
  assert.equal(e.h.targetPath(t).at(-1), "Crimson Desert");
});

test("Router skips split/pinned tabs before starting network lookups", async () => {
  const e = await routerEnv(); e.prefs.set("zzrouter.enabled", true);
  e.prefs.set("zzrouter.media-subgroups", true); e.prefs.set("zzrouter.auto-unmatched", true);
  for (const type of ["split-view", "pinned"]) {
    const t = tab("https://www.youtube.com/watch?v=video");
    if (type === "pinned") t.pinned = true; else t.setAttribute(type, "true");
    await e.h.route(t, "test");
  }
  assert.equal(e.c.timers.size, 0);
});

test("Router keeps its live learned/creator caches within their persisted limits", async () => {
  const e = await routerEnv();
  for (let i = 0; i < 350; i++) { e.h.learnedMap().set(String(i), "Name"); e.h.creatorMap().set(String(i), "Creator"); }
  e.h.saveLearned(); e.h.saveCreators();
  assert.equal(e.h.learnedMap().size, 200); assert.equal(e.h.creatorMap().size, 300);
});

async function unloaderEnv() {
  const tabs = [tab("https://example.com/old"), tab("https://example.com/new")];
  const values = new Map([["zzunload.enabled", true], ["zzunload.max-per-sweep", 1], ["zzunload.exclude-workspace-anchor", false]]);
  const states = new Map(), calls = [];
  const gBrowser = { tabs, async prepareDiscardBrowser(t) { calls.push(["prepare", t]); },
    discardBrowser(t) { calls.push(["discard", t]); t.setAttribute("pending", ""); return true; } };
  const h = await load("tab-unloader", "sweep, hasFields, whyKeep, retire: () => retired = true", {
    window: {}, document: { documentElement: element(), querySelectorAll: () => tabs }, gBrowser,
    SessionStore: { getTabState: t => JSON.stringify(states.get(t) ?? {}) },
    Services: { prefs: { PREF_INT: 64, getPrefType: () => 64, getIntPref: k => values.get(k),
      getBoolPref: (k, d) => values.get(k) ?? d, getStringPref: (_k, d) => d } },
  });
  return { h, tabs, values, states, calls, gBrowser };
}

test("Unloader flushes state and counts only successful native discards", async () => {
  const e = await unloaderEnv();
  e.gBrowser.discardBrowser = t => { e.calls.push(["discard", t]); return t === e.tabs[1]; };
  await e.h.sweep();
  assert.deepEqual(e.calls.map(c => c[0]), ["prepare", "discard", "prepare", "discard"]);
});

test("Unloader protects newly flushed forms and Firefox designMode data", async () => {
  const e = await unloaderEnv();
  e.gBrowser.prepareDiscardBrowser = async t => { e.states.set(t, { formdata: { innerHTML: "<p>Draft</p>" } }); };
  assert.equal(e.h.hasFields({ children: [{ innerHTML: "Draft" }] }), true);
  assert.equal(e.h.hasFields({ id: { empty: "", choice: { selectedIndex: 1, value: "Option" } } }), false);
  await e.h.sweep(); assert.equal(e.calls.length, 0);
});

test("Unloader serialises sweeps and rechecks selection/retirement after flushing", async () => {
  for (const retire of [false, true]) {
    const e = await unloaderEnv(), flush = deferred();
    e.gBrowser.prepareDiscardBrowser = async t => { e.calls.push(["prepare", t]); await flush.promise; };
    const first = e.h.sweep(); await e.h.sweep();
    assert.equal(e.calls.length, 1);
    if (retire) e.h.retire(); else e.tabs.forEach(t => { t.selected = true; });
    flush.resolve(); await first;
    assert.equal(e.calls.some(c => c[0] === "discard"), false);
  }
});

test("Unloader observes a keep-loaded floor raised during session flush", async () => {
  const e = await unloaderEnv(), flush = deferred();
  e.gBrowser.prepareDiscardBrowser = async () => { await flush.promise; };
  Object.defineProperty(e.gBrowser, "tabs", { get() { throw new Error("Use all-workspace DOM tabs"); } });
  const pending = e.h.sweep();
  e.values.set("zzunload.keep-loaded", 2);
  flush.resolve(); await pending;
  assert.equal(e.calls.some(c => c[0] === "discard"), false);
});

test("Router rejects empty or disconnected groups without collecting descendant tab arrays", async () => {
  const e = await routerEnv(), t = tab();
  const g = { isConnected: true, querySelector: () => t,
    get tabs() { throw new Error("Descendant arrays must not be rebuilt for existence checks"); } };
  assert.equal(e.h.live(g), true);
  g.querySelector = () => null; assert.equal(e.h.live(g), false);
  g.querySelector = () => t; g.isConnected = false; assert.equal(e.h.live(g), false);
  const members = [], group = { querySelectorAll: () => members };
  assert.equal(e.h.majorityContext(group), null);
  for (const id of [0, 2, 2, 0]) { const t = tab(); t.setAttribute("usercontextid", String(id)); members.push(t); }
  assert.equal(e.h.majorityContext(group), 0, "first container wins a tie, including container 0");
  members.push(members[1]); assert.equal(e.h.majorityContext(group), 2);
});

test("Unloader protects actual Zen split and native protected tabs", async () => {
  const e = await unloaderEnv(), t = e.tabs[0];
  t.setAttribute("split-view", "true"); assert.equal(e.h.whyKeep(t, Date.now()), "split view");
  t.removeAttribute("split-view"); t.zenModeActive = true;
  assert.equal(e.h.whyKeep(t, Date.now()), "browser-protected tab");
});

test("Router container changes preserve forms, history, POSTs and vetoed closes", async () => {
  for (const state of [{ entries: [{}, {}] }, { entries: [{}], formdata: { id: { draft: "text" } } }, { entries: [{ postdata: "encoded" }] }, { entries: [{ children: [null, { children: [{ postdata: "encoded" }] }] }] }, { entries: [{}], storage: {} }]) {
    let added = 0, flushed = 0;
    const e = await routerEnv({ window: { SessionStore: { getTabState: () => JSON.stringify(state) } },
      gBrowser: { async prepareDiscardBrowser() { flushed++; }, addTab() { added++; } } });
    e.prefs.set("zzrouter.enabled", true);
    const t = tab(); assert.equal(await e.h.reopenInContainer(t, 2, null), t);
    assert.equal(flushed, 1); assert.equal(added, 0);
  }
  const t = tab(), fresh = tab(), removed = [];
  const e = await routerEnv({ window: { SessionStore: { getTabState: () => JSON.stringify({ entries: [{}] }) } },
    gBrowser: { async prepareDiscardBrowser() {}, addTab: () => fresh, removeTab: t => removed.push(t) } });
  e.prefs.set("zzrouter.enabled", true);
  assert.equal(await e.h.reopenInContainer(t, 2, null), t);
  assert.deepEqual(removed, [t, fresh], "a veto must remove the unused replacement");
});

test("Router aborts a container reopen when disabled during state flush", async () => {
  const flush = deferred(); let added = false;
  const e = await routerEnv({ gBrowser: { prepareDiscardBrowser: () => flush.promise, addTab() { added = true; } } });
  e.prefs.set("zzrouter.enabled", true);
  const pending = e.h.reopenInContainer(tab(), 2, null);
  e.prefs.set("zzrouter.enabled", false); flush.resolve();
  assert.equal(await pending, null); assert.equal(added, false);
});

test("Router replaces a simple page only after flush and keeps its selection", async () => {
  const t = tab(), fresh = tab(), calls = [];
  t.selected = true;
  const gBrowser = { async prepareDiscardBrowser() { calls.push("flush"); },
    addTab(_url, options) { calls.push("add"); assert.equal(options.userContextId, 2); return fresh; },
    removeTab(old) { calls.push("close"); old.closing = true; } };
  const e = await routerEnv({ window: { SessionStore: { getTabState() {
    calls.push("state"); return JSON.stringify({ entries: [{ children: [null, { url: "https://example.com/frame" }] }] });
  } } }, gBrowser });
  e.prefs.set("zzrouter.enabled", true);
  assert.equal(await e.h.reopenInContainer(t, 2, null), fresh);
  assert.deepEqual(calls, ["flush", "state", "add", "close"]);
  assert.equal(gBrowser.selectedTab, fresh);
});

test("Router defers loading tabs and retries on top-level network completion", async () => {
  const t = tab(); t.setAttribute("busy", "true");
  let flushed = false;
  const e = await routerEnv({ gBrowser: {
    getTabForBrowser: () => t, prepareDiscardBrowser() { flushed = true; },
  } });
  e.prefs.set("zzrouter.enabled", true);
  assert.equal(await e.h.reopenInContainer(t, 2, null), null);
  assert.equal(flushed, false);
  e.h.progress.onStateChange({}, { isTopLevel: false }, null, 0x40010);
  e.h.progress.onStateChange({}, { isTopLevel: true }, null, 16);
  assert.equal(e.c.timers.size, 0);
  t.removeAttribute("busy");
  e.h.progress.onStateChange({}, { isTopLevel: true }, null, 0x40010);
  assert.equal(e.c.timers.size, 1);
});

test("Router repairs an already-filed container mismatch without flattening the path", async () => {
  const t = tab(), fresh = tab(); t.setAttribute("usercontextid", "1");
  const root = { ...element(), tagName: "tab-group", label: "Target", parentElement: { closest: () => null },
    querySelector: () => t,
    querySelectorAll: () => [{ getAttribute: () => "2" }] };
  const child = { ...element(), tagName: "tab-group", label: "Manual subgroup", parentElement: { closest: () => root },
    querySelector: () => t,
    addTabs(tabs) { tabs.forEach(t => { t.group = child; }); } };
  t.group = child;
  const e = await routerEnv({ document: { querySelectorAll: () => [root, child] },
    window: { SessionStore: { getTabState: () => JSON.stringify({ entries: [{}] }) } },
    gBrowser: { tabGroups: [root, child], async prepareDiscardBrowser() {}, addTab: () => fresh,
      removeTab(t) { t.closing = true; } },
  });
  e.prefs.set("zzrouter.enabled", true);
  e.prefs.set("zzrouter.rules", "example.com > Target");
  assert.equal(e.h.skip(t), null);
  await e.h.placeInPath(t, ["Target"]);
  assert.equal(fresh.group, child);
  e.prefs.set("zzrouter.follow-containers", false);
  t.closing = false;
  assert.equal(e.h.skip(t), "already in a group");
});

async function initialRouteEnv() {
  const t = tab("about:blank"), fresh = tab(), calls = [], removed = [];
  t.setAttribute("usercontextid", "1"); t.selected = true;
  const dest = { isRouteFound: true, userContextId: 2, targetRoute: "destination" };
  const context = { currentWindowGlobal: { isInitialDocument: true }, embedderElement: t.linkedBrowser };
  const channel = { URI: { spec: "https://example.com/target" }, requestMethod: "GET",
    loadInfo: { externalContentPolicyType: 6, browsingContext: context, triggeringPrincipal: { web: true } },
    referrerInfo: { referrer: "https://source.example/" },
    QueryInterface() { return this; }, cancel() { calls.push("cancel"); },
  };
  const w = { SessionStore: { isTabRestoring: () => false },
    gZenSpaceRoutingManager: { onBeforeAddTab: () => dest },
    gZenWorkspaces: { moveTabToWorkspace(t, ws) { t.setAttribute("zen-workspace-id", ws); } },
  };
  const gBrowser = { getTabForBrowser: b => b === t.linkedBrowser ? t : null,
    addTab(url, options) { calls.push({ url, options }); return fresh; },
    removeTab(t) { removed.push(t); t.closing = true; },
  };
  const e = await routerEnv({ window: w, gBrowser });
  e.prefs.set("zzrouter.enabled", true);
  return { ...e, w, gBrowser, t, fresh, calls, removed, dest, context, channel,
    observe: () => e.h.initialRequest.observe(channel) };
}

test("Router applies native rules to first requests before a page can create session state", async () => {
  for (const [url, ctx] of [["https://github.com/project", 2], ["https://nexusmods.com/mod", 3], ["https://example.org/", 0]]) {
    const e = await initialRouteEnv();
    e.channel.URI.spec = url; e.dest.userContextId = ctx;
    e.observe();
    assert.equal(e.calls[0].url, url);
    assert.equal(e.calls[0].options.userContextId, ctx);
    assert.equal(e.calls[0].options.triggeringPrincipal, e.channel.loadInfo.triggeringPrincipal);
    assert.equal(e.calls[0].options.referrerInfo, e.channel.referrerInfo);
    assert.equal(e.calls[1], "cancel");
    assert.equal(e.fresh.getAttribute("zen-workspace-id"), "destination");
    assert.equal(e.gBrowser.selectedTab, e.fresh);
    assert.deepEqual(e.removed, [e.t]);
  }
});

test("Router first-request routing excludes existing/restoring/foreign tabs and opt-outs", async () => {
  const exclusions = [
    e => e.context.currentWindowGlobal.isInitialDocument = false,
    e => e.w.SessionStore.isTabRestoring = () => true,
    e => e.context.embedderElement = {},
    e => e.channel.loadInfo.externalContentPolicyType = 7,
    e => e.t.pinned = true,
    e => e.t.setAttribute("zen-glance-tab", "true"),
    e => e.t.setAttribute("split-view", "true"),
    e => e.prefs.set("zzrouter.enabled", false),
    e => e.prefs.set("zzrouter.follow-containers", false),
    e => { e.t.group = {}; e.prefs.set("zzrouter.refile-mismatched", false); },
    e => e.dest.isRouteFound = false,
    e => e.dest.userContextId = 1,
    e => e.dest.userContextId = -1,
    e => e.h.retire(),
  ];
  for (const exclude of exclusions) {
    const e = await initialRouteEnv(); exclude(e); e.observe();
    assert.deepEqual(e.calls, [], String(exclude));
    assert.deepEqual(e.removed, []);
  }
});

test("Router leaves POSTs, form submissions and their GET redirects untouched", async () => {
  for (const method of ["POST", "GET"]) {
    const e = await initialRouteEnv();
    e.channel.requestMethod = method;
    e.channel.loadInfo.isFormSubmission = method === "GET";
    e.observe();
    e.channel.requestMethod = "GET"; e.channel.loadInfo.isFormSubmission = false;
    e.observe();
    assert.deepEqual(e.calls, []);
  }
});

test("Router keeps the first request when replacement fails or closing is vetoed", async () => {
  for (const fail of ["creation", "veto"]) {
    const e = await initialRouteEnv();
    if (fail === "creation") e.gBrowser.addTab = () => null;
    else e.gBrowser.removeTab = t => e.removed.push(t);
    e.observe();
    assert.ok(!e.calls.includes("cancel"));
    assert.deepEqual(e.removed, fail === "veto" ? [e.t, e.fresh] : []);
  }
});

test("Groupflow ignores split groups in dirty refreshes and refreshes on enabling favicons", async () => {
  const c = clock(); let writes = 0;
  const g = { ...element(), tagName: "tab-group", style: { removeProperty() { writes++; } } };
  g.setAttribute("split-view-group", "true");
  const h = await load("groupflow", "schedule, prefVarObserver", { ...c, window: {},
    Services: { prefs: { getBoolPref: (_k, d) => d, getPrefType: () => 0 } },
    document: { documentElement: element() }, gBrowser: {},
  });
  h.schedule({ target: { tagName: "tab", group: g } });
  [...c.timers.values()][0](); c.timers.clear(); assert.equal(writes, 0);
  h.prefVarObserver.observe(null, null, "zzgroup.favicons"); assert.equal(c.timers.size, 1);
});

test("Groupflow uses the restored tab favicon and gives iconless groups a folder fallback", async () => {
  const t = tab("http://example.com/specific-page");
  t.matches = name => name === "tab";
  t.setAttribute("image", "data:image/png;base64,YQ==");
  const styles = new Map();
  const g = { ...element(), tagName: "tab-group", groupContainer: { children: [t] },
    style: { setProperty: (k, v) => styles.set(k, v), getPropertyValue: k => styles.get(k) } };
  const h = await load("groupflow", "refreshGroup", { window: {}, gBrowser: {},
    Services: { prefs: { getBoolPref: (_k, d) => d, getStringPref: (_k, d) => d } },
  });
  h.refreshGroup(g);
  assert.equal(styles.get("--zzgf-icon"), 'url("data:image/png;base64,YQ==")');
  g.groupContainer.children = [];
  h.refreshGroup(g);
  assert.equal(styles.get("--zzgf-icon"), 'url("chrome://browser/skin/zen-icons/folder.svg")');
});

test("Groupflow container accent counts descendants, resolves ties and clears missing colours", async () => {
  const a = tab(), b = tab(), c = tab();
  a.setAttribute("usercontextid", "1");
  b.setAttribute("usercontextid", "2"); c.setAttribute("usercontextid", "2");
  const styles = new Map();
  const g = { ...element(), tabs: [a, b, c], style: {
    setProperty: (k, v) => styles.set(k, v), getPropertyValue: k => styles.get(k) || "",
    removeProperty: k => styles.delete(k) } };
  const h = await load("groupflow", "refreshGroup", { window: {}, gBrowser: {},
    Services: { prefs: { getIntPref: k => k === "zzgroup.color-source" ? 3 : 0,
      getBoolPref: () => false, getStringPref: (_k, d) => d } },
    getComputedStyle: t => ({ getPropertyValue: () => ({ 1: "#00f", 2: "#f00" })[t.getAttribute("usercontextid")] || "" }),
    CSS: { supports: (_p, v) => /^#[0-9a-f]+$/i.test(v) },
  });
  h.refreshGroup(g); assert.equal(styles.get("--zzgf-container-color"), "#f00");
  g.tabs = [a, b]; h.refreshGroup(g); assert.equal(styles.get("--zzgf-container-color"), "#00f");
  a.setAttribute("usercontextid", "0"); h.refreshGroup(g); assert.ok(!styles.has("--zzgf-container-color"));
  g.tabs = []; h.refreshGroup(g); assert.ok(!styles.has("--zzgf-container-color"));
});

test("Router restores a missing avatar for a cached creator without rerouting or clearing history", async () => {
  const t = tab("https://www.youtube.com/watch?v=video");
  const parent = { ...element(), tagName: "tab-group", label: "Youtube", tabs: [t], querySelector: () => t };
  const child = { ...element(), tagName: "tab-group", label: "Channel", tabs: [t], querySelector: () => t, parentElement: { closest: () => parent } };
  const refreshes = []; let opened = 0;
  const e = await routerEnv({ gBrowser: { tabGroups: [parent, child], tabs: [t] },
    document: { querySelectorAll: selector => selector === "tab-group" ? [parent, child] : [t] },
    window: { Groupflow: { refresh(defer) { refreshes.push(defer); } } },
    createImageBitmap: async () => ({ width: 64, height: 64, close() {} }),
    OffscreenCanvas: class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return { arrayBuffer: async () => new Uint8Array([1]).buffer }; }
    }, btoa: s => Buffer.from(s).toString("base64") });
  const open = e.NetUtil.open;
  e.NetUtil.open = (...args) => { opened++; open(...args); };
  e.prefs.set("zzrouter.enabled", true);
  e.prefs.set("zzrouter.creators", JSON.stringify({ video: "Channel" }));
  e.prefs.set("zzrouter.avatars", JSON.stringify({ channel: { d: null, s: "round" } }));
  e.h.stampIcons(true); assert.equal(opened, 1);
  e.answer(JSON.stringify({ author_name: "Channel", author_url: "https://www.youtube.com/@channel" }));
  e.answer("<meta content='https://example.com/avatar.png?a=1&amp;b=2' property='og:image'>");
  e.answer("image bytes"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened, 3); assert.deepEqual(refreshes, [true]);
  assert.equal(child.getAttribute("data-zzrouter-icon"), "data:image/webp;base64,AQ==");
  assert.equal(e.h.creatorMap().get("video"), "Channel");
  assert.equal(e.c.timers.size, 0, "cached creator recovery must not queue routing");
  e.h.stampIcons(true); assert.equal(opened, 3, "reuse successful avatar");
  e.h.forgetAll(); assert.equal(opened, 3, "history purge must not start recovery");
  assert.deepEqual(refreshes, [true, false], "history purge must remove rendered icons immediately");
});

test("Router retries missing metadata after 10 minutes without persisting a permanent null avatar", async () => {
  let now = 1000000, opened = 0;
  const e = await routerEnv({ Date: { now: () => now } });
  const open = e.NetUtil.open;
  e.NetUtil.open = (...args) => { opened++; open(...args); };
  e.h.fetchSectionIcon("Channel", "https://www.youtube.com/@channel", 2, "round");
  e.answer("<title>Consent</title>");
  assert.equal(e.h.iconMap().size, 0);
  e.h.fetchSectionIcon("Channel", "https://www.youtube.com/@channel", 2, "round");
  assert.equal(opened, 1);
  now += 600000;
  e.h.fetchSectionIcon("Channel", "https://www.youtube.com/@channel", 2, "round");
  assert.equal(opened, 2); e.h.cancelLookups();
});

async function groupflowStartupEnv() {
  const c = clock(), w = browser(), ready = deferred(), groups = [], writes = [];
  w.gZenStartup = { promiseInitialized: ready.promise };
  // These cases exercise the existing ATG coexistence path; the native smoke
  // check covers Groupflow's standalone controller and its persisted state.
  w.advancedTabGroups = {};
  const document = { documentElement: element(), querySelectorAll: selector =>
    groups.filter(g => selector.split(", ").includes(g.tagName)) };
  const gBrowser = { tabGroups: groups, selectedTab: { label: "selected tab" } };
  const stored = new Map();
  const SessionStore = { getCustomWindowValue: (_w, k) => stored.get(k) || "",
    setCustomWindowValue: (_w, k, v) => stored.set(k, v) };
  const Services = { prefs: {
    getBoolPref: () => false, getPrefType: () => 0,
    addObserver() {}, removeObserver() {},
  } };
  function group(name, { parent = null, folder = false, collapsed = false, split = false } = {}) {
    const g = { ...element(), tagName: folder ? "zen-folder" : "tab-group",
      id: name, label: name, closest: () => ({ id: "workspace" }),
      isZenFolder: folder, parentElement: { closest: () => parent },
      get collapsed() { return collapsed; },
      set collapsed(value) { writes.push(name); collapsed = value; },
    };
    if (split) g.setAttribute("split-view-group", "true");
    groups.push(g);
    return g;
  }
  async function inject() {
    const h = await load("groupflow", "start, schedule, prefVarObserver", {
      ...c, window: w, document, gBrowser, Services, SessionStore,
    });
    h.start();
    return h;
  }
  function tick() {
    for (const [id, fn] of [...c.timers]) { c.clearTimeout(id); fn(); }
  }
  return { c, w, ready, group, groups, writes, inject, tick, gBrowser };
}

test("Groupflow coalesces requested refreshes and immediate refresh cancels queued work", async () => {
  const e = await groupflowStartupEnv();
  await e.inject(); e.ready.resolve(); await Promise.resolve(); e.tick();
  e.c.timers.clear();
  e.w.Groupflow.refresh(true); e.w.Groupflow.refresh(true);
  assert.equal(e.c.timers.size, 1);
  e.w.Groupflow.refresh();
  assert.equal(e.c.timers.size, 0, "immediate purge must cancel queued avatar rendering");
});

test("Groupflow skips metadata work on collapse and reuses one scan for existing-group updates", async () => {
  const c = clock(), w = browser(), stored = new Map();
  let scans = 0, serializations = 0, reads = 0, unavailable = false;
  const h = await load("groupflow", "startStandaloneGroups", { ...c, window: w,
    document: { documentElement: element(), querySelectorAll() { scans++; return []; } },
    gBrowser: { createTabsForSessionRestore() {} },
    Services: { prefs: { prefHasUserValue: () => true } },
    JSON: { parse: JSON.parse, stringify(value) { serializations++; return JSON.stringify(value); } },
    SessionStore: {
      getCustomWindowValue: (_w, k) => stored.get(k) || "{}",
      setCustomWindowValue: (_w, k, v) => stored.set(k, v),
      getClosedTabGroups() { reads++; if (unavailable) throw new Error("Store unavailable"); return []; },
      getSavedTabGroups() { reads++; return []; }, getClosedTabData() { reads++; return []; },
    }, console: { error() {} },
  });
  const cleanup = h.startStandaloneGroups({});
  scans = serializations = reads = 0;
  w.fire("TabGroupCollapse"); w.fire("TabGroupExpand");
  assert.equal(c.timers.size, 0);
  assert.deepEqual([scans, serializations, reads], [0, 0, 0]);
  w.fire("TabGroupUpdate");
  for (const [id, fn] of [...c.timers]) { c.clearTimeout(id); fn(); }
  assert.deepEqual([scans, serializations, reads], [1, 4, 3]);
  unavailable = true; stored.set("tabGroupParents", "previous");
  w.fire("FolderGrouped");
  for (const [id, fn] of [...c.timers]) { c.clearTimeout(id); fn(); }
  assert.equal(stored.get("tabGroupParents"), "{}", "persist parent updates if pruning cannot read closed state");
  cleanup();
});

test("Groupflow waits for restore, opens roots and folds every nested depth with favicons disabled", async () => {
  const e = await groupflowStartupEnv();
  const selected = e.gBrowser.selectedTab;
  await e.inject();
  e.tick();
  assert.equal(e.w.__zzgroupInstance.startupFolded, false);
  const root = e.group("root", { folder: true, collapsed: true });
  const child = e.group("child", { parent: root, folder: true });
  const grandchild = e.group("grandchild", { parent: child });
  const otherRoot = e.group("other-workspace", { collapsed: true });
  const otherChild = e.group("other-child", { parent: otherRoot, folder: true });
  const split = e.group("split", { parent: child, split: true });
  const rootSplit = e.group("root-split", { split: true });
  assert.deepEqual(e.writes, []);
  // Zen queues saved collapse states while constructing restored folders.
  e.c.setTimeout(() => { child.collapsed = false; });
  e.ready.resolve();
  await Promise.resolve();
  assert.equal(root.collapsed, true);
  e.tick();
  assert.deepEqual([root, child, grandchild, otherRoot, otherChild, split, rootSplit].map(g => g.collapsed),
    [false, true, true, false, true, false, false]);
  assert.ok(e.writes.indexOf("grandchild") < e.writes.lastIndexOf("child"));
  assert.ok(e.writes.lastIndexOf("child") < e.writes.indexOf("root"));
  assert.ok(!e.writes.includes("split") && !e.writes.includes("root-split"));
  assert.equal(e.gBrowser.selectedTab, selected);
  assert.equal(e.c.timers.size, 0);
});

test("Groupflow leaves manual toggles and later groups unchanged across events and reinjection", async () => {
  const e = await groupflowStartupEnv();
  const root = e.group("root"), child = e.group("child", { parent: root });
  e.ready.resolve();
  const h = await e.inject();
  await Promise.resolve(); e.tick();
  assert.equal(child.collapsed, true);
  child.collapsed = false;
  root.collapsed = true;
  const later = e.group("later", { parent: root });
  e.writes.length = 0;
  h.schedule({ target: child });
  h.prefVarObserver.observe(null, null, "zzgroup.favicons");
  e.tick();
  await e.inject();
  await Promise.resolve(); e.tick();
  assert.deepEqual(e.writes, []);
  assert.deepEqual([root, child, later].map(g => g.collapsed), [true, false, false]);
});

test("Groupflow reinjection during restoration leaves one startup pass", async () => {
  const e = await groupflowStartupEnv();
  const root = e.group("root"); e.group("child", { parent: root });
  await e.inject();
  await e.inject();
  e.ready.resolve();
  await Promise.resolve(); e.tick();
  assert.deepEqual(e.writes, ["child", "root"]);
});

test("Groupflow retirement cancels pending restore callbacks and queued folding", async () => {
  for (const afterRestore of [false, true]) {
    const e = await groupflowStartupEnv();
    const root = e.group("root"); e.group("child", { parent: root });
    await e.inject();
    if (afterRestore) { e.ready.resolve(); await Promise.resolve(); }
    e.w.__zzgroupInstance.retire();
    e.ready.resolve();
    await Promise.resolve(); e.tick();
    assert.deepEqual(e.writes, []);
    assert.equal(e.c.timers.size, 0);
  }
});

test("Groupflow updating a pre-feature instance defers folding until next window", async () => {
  const e = await groupflowStartupEnv();
  const root = e.group("root"); e.group("child", { parent: root });
  let retired = 0;
  e.w.__zzgroupInstance = { generation: 1, retire() { retired++; } };
  e.ready.resolve();
  await e.inject();
  await Promise.resolve(); e.tick();
  assert.equal(retired, 1);
  assert.deepEqual(e.writes, []);
});

test("Groupflow restores ATG nesting before folding and releases its Arc override", async () => {
  const e = await groupflowStartupEnv();
  const root = e.group("root", { collapsed: true }), child = e.group("child");
  root.id = "root"; child.id = "child";
  const saved = new Map(), arcMode = () => true;
  e.w.advancedTabGroups = {
    isArcMode: arcMode,
    applySavedParents() { child.parentElement.closest = () => root; },
    saveGroupCollapsedState(id, value) { saved.set(id, value); },
  };
  e.ready.resolve(); await e.inject(); await Promise.resolve(); e.tick();
  assert.equal(root.collapsed, false); assert.equal(child.collapsed, true);
  assert.equal(e.w.advancedTabGroups.isArcMode(), false);
  assert.deepEqual([...saved], [["child", true], ["root", false]]);
  child.collapsed = false;
  await e.inject(); await Promise.resolve(); e.tick();
  assert.equal(child.collapsed, false, "reinjection must keep a manual expansion");
  assert.equal(e.w.advancedTabGroups.isArcMode(), false);
  e.w.__zzgroupInstance.retire();
  assert.equal(e.w.advancedTabGroups.isArcMode, arcMode);
});

test("Groupflow restores saved parents without cycles, cross-workspace moves or split changes", async () => {
  const groups = new Map();
  function group(id, workspace = "one", split = false) {
    const g = { ...element(), id, tagName: "tab-group", group: null,
      closest: () => ({ id: workspace }),
      contains(other) { for (let p = other; p; p = p.group) if (p === this) return true; return false; },
      groupContainer: { appendChild(child) { child.group = g; } },
    };
    if (split) g.setAttribute("split-view-group", "true");
    groups.set(id, g); return g;
  }
  const root = group("root"), child = group("child"), grandchild = group("grandchild");
  const foreign = group("foreign", "two"), split = group("split", "one", true);
  const h = await load("groupflow", "restoreParents, readGroupData, writeGroupData", {
    window: {}, document: { getElementById: id => groups.get(id), querySelectorAll: () => [...groups.values()] },
    SessionStore: { getCustomWindowValue: () => "[1,2]", setCustomWindowValue() { throw new Error("Invalid data overwritten"); } },
    console: { error() {} },
  });
  h.restoreParents({ grandchild: "child", child: "root", foreign: "root", split: "root" });
  assert.equal(child.group, root); assert.equal(grandchild.group, child);
  assert.equal(foreign.group, null); assert.equal(split.group, null);
  h.restoreParents({ root: "grandchild", child: "root", grandchild: "child" });
  assert.equal(root.group, null);
  child.group = null; grandchild.group = null;
  h.restoreParents({ child: "grandchild", grandchild: "child", root: "root" });
  assert.equal(child.group, null); assert.equal(grandchild.group, null);
  assert.equal(h.readGroupData("tabGroupParents"), null);
  h.writeGroupData("tabGroupParents", null);
});

test("Groupflow imports emoji as escaped images and rejects executable or CSS-breaking icon URIs", async () => {
  const h = await load("groupflow", "customIcon, setIcons(value) { savedGroupIcons = value; }", { window: {} });
  h.setIcons({ emoji: "🦊<&>", native: "chrome://browser/skin/zen-icons/folder.svg",
    bad: 'https://example.com/"icon', script: "javascript:alert(1)" });
  const svg = decodeURIComponent(h.customIcon({ id: "emoji" }).split(",")[1]);
  assert.ok(svg.includes("🦊&lt;&amp;&gt;"));
  assert.equal(h.customIcon({ id: "native" }), "chrome://browser/skin/zen-icons/folder.svg");
  assert.equal(h.customIcon({ id: "bad" }), null);
  assert.equal(h.customIcon({ id: "script" }), null);
});

test("Router diagnostic path calculation learns nothing and starts no lookups", async () => {
  const e = await routerEnv();
  for (const [k, v] of Object.entries({ "auto-unmatched": true, "auto-path-depth": 1, "auto-path-domains": "example.com", "media-subgroups": true })) e.prefs.set("zzrouter." + k, v);
  const t = tab(); t.label = "Crimson Desert - Example";
  assert.equal(e.h.targetPath(t, false).at(-1), "Crimson Desert");
  e.h.targetPath(tab("https://www.youtube.com/watch?v=video"), false);
  assert.equal(e.h.learnedMap().size, 0); assert.equal(e.h.creatorMap().size, 0);
  assert.equal(e.c.timers.size, 0);
});

test("Router starts no creator or icon requests in private windows", async () => {
  const e = await routerEnv({ ChromeUtils: { importESModule: () => ({ PrivateBrowsingUtils: { isWindowPrivate: () => true } }) } });
  e.h.fetchCreator(tab(), "video"); e.h.fetchSectionIcon("Icon", "https://example.com/icon", 0, "round");
  assert.equal(e.c.timers.size, 0); assert.equal(e.h.creatorMap().size, 0);
});

test("Turbo resumes tab effects after a stuck workspace marker and on retirement", async () => {
  const e = await turboEnv(); e.values.set("zzturbo.startup-warmup", false); e.h.start();
  e.root.setAttribute("animating-background", "true"); e.h.syncSmoothing();
  assert.equal(e.root.hasAttribute("zzturbo-smoothing"), true);
  [...e.c.timers.values()][0]();
  assert.equal(e.root.hasAttribute("zzturbo-smoothing"), false);
  e.h.syncSmoothing(); assert.equal(e.root.hasAttribute("zzturbo-smoothing"), false);
  e.root.removeAttribute("animating-background"); e.h.syncSmoothing();
  e.root.setAttribute("swipe-gesture", "true"); e.h.syncSmoothing();
  assert.equal(e.root.hasAttribute("zzturbo-smoothing"), true);
  e.w.__zzturboInstance.retire(); assert.equal(e.root.hasAttribute("zzturbo-smoothing"), false);
});
