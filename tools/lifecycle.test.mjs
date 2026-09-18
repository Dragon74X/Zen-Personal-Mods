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
    children: [], style: { setProperty() {} }, isConnected: true,
    setAttribute: (k, v) => attrs.set(k, v), getAttribute: k => attrs.get(k),
    hasAttribute: k => attrs.has(k), removeAttribute: k => attrs.delete(k),
    addEventListener: (k, fn) => events.set(k, fn), removeEventListener: k => events.delete(k),
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(child) { return this.appendChild(child); },
    remove() { this.isConnected = false; }, focus() {},
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
  const h = await load("tab-router", "fetchAnon, fetchCreator, fetchSectionIcon, creatorMap, iconMap, forgetAll, cancelLookups, rules, suggestRules", {
    ...c, window: {}, gBrowser: { tabGroups: [], tabs: [] }, document: { querySelectorAll: () => [] },
    ChromeUtils: { generateQI: () => () => {}, importESModule: name => name.includes("NetUtil") ? { NetUtil }
      : { PrivateBrowsingUtils: { isWindowPrivate: () => false } } },
    Services: { prefs: { getBoolPref: (_k, d) => d, getStringPref: (k, d) => prefs.get(k) ?? d,
      setStringPref: (k, v) => prefs.set(k, v) },
      io: { newURI: url => url }, scriptSecurityManager: { createContentPrincipal() {} } },
    Ci: { nsILoadInfo: {}, nsIContentPolicy: {}, nsIRequest: {} },
    Components: { isSuccessCode: s => s === 0 },
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
  const revoked = [];
  const h = await load("glassflow", "sampleOnce, clearSample, syncSampleNow, syncSampling, hide: () => document.hidden = true, navigate: () => gBrowser.selectedBrowser.browsingContext.currentWindowGlobal = {}", {
    ...c, Date: { now: () => now }, window: { windowUtils: { getBoundsWithoutFlushing: el => el.getBoundingClientRect() } },
    document: { documentElement: root, getElementById: id => ({ titlebar: panel, "navigator-toolbox": toolbox })[id], createElementNS: element },
    gBrowser: { selectedBrowser: browser },
    Services: { prefs: { getBoolPref: () => true } },
    ChromeUtils: { importESModule: () => ({ PrivateBrowsingUtils: { isWindowPrivate: () => privateWindow } }) },
    OffscreenCanvas: class {
      width = 10; height = 10;
      getContext() { return { drawImage() {}, getImageData: () => ({ data: pixels }) }; }
      convertToBlob() { conversions++; blobStarted.resolve(); return blobQueue.length ? blobQueue.shift() : blob.promise; }
    },
    URL: { createObjectURL: () => `blob:test-${conversions}`, revokeObjectURL: url => revoked.push(url) },
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
  });
  return { h, panel, toolbox, snapshot, blob, blobStarted, revoked, pixels, timers: c.timers,
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
  e.answer('<meta property="og:image" content="https://example.com/avatar.png"');
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
  let queries = 0;
  const pref = {
    PREF_INVALID: 0, PREF_STRING: 32, PREF_INT: 64, PREF_BOOL: 128,
    getPrefType: k => !values.has(k) ? 0 : ({ string: 32, number: 64, boolean: 128 })[typeof values.get(k)],
    getStringPref: (k, d) => values.get(k) ?? d, getIntPref: (k, d) => values.get(k) ?? d,
    getBoolPref: (k, d) => values.get(k) ?? d,
    setStringPref: (k, v) => values.set(k, v), setIntPref: (k, v) => values.set(k, v),
    setBoolPref: (k, v) => values.set(k, v), clearUserPref: k => values.delete(k),
    prefHasUserValue: k => values.has(k), addObserver() {}, removeObserver() {},
  };
  const tabContainer = element();
  w.XULBrowserWindow = { setOverLink: (...args) => args };
  const h = await load("zen-turbo", "start, applyPack, revertPack, startupWarmup, forgetWarmups, warmAfterDwell, cancelDwell, onHover, hookOverLink, unhookOverLink", {
    ...c, window: w, gBrowser: { tabContainer, addTabsProgressListener() {}, removeTabsProgressListener() {} },
    document: { getElementById: () => null },
    Services: { prefs: pref, wm: { getMostRecentWindow: () => w },
      obs: { addObserver() {}, removeObserver() {} },
      io: { newURI: url => ({ scheme: new URL(url).protocol.slice(0, -1), prePath: new URL(url).origin }),
        speculativeConnectWithOriginAttributes(uri, attrs) {
          if (failConnect) throw new Error("connection unavailable");
          connects.push({ origin: uri.prePath, attrs });
        } },
    },
    ChromeUtils: { importESModule: uri => uri.includes("PrivateBrowsing")
      ? { PrivateBrowsingUtils: { isWindowPrivate: () => privateWindow } }
      : { PlacesUtils: { promiseDBConnection: async () => ({ executeCached() { queries++; return rows; } }) } } },
  });
  return { h, w, c, values, connects, tabContainer, get queries() { return queries; } };
}

test("Turbo re-sync and disable preserve a managed preference edited by the user", async () => {
  const e = await turboEnv();
  const pref = "network.http.max-persistent-connections-per-server";
  e.values.set(pref, 6);
  e.h.applyPack("network"); assert.equal(e.values.get(pref), 10);
  e.values.set(pref, 7);
  e.h.applyPack("network"); assert.equal(e.values.get(pref), 7);
  e.h.revertPack("network"); assert.equal(e.values.get(pref), 7);
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

test("Turbo retirement preserves later wrappers and their original call chain", async () => {
  const e = await turboEnv(); e.h.start();
  const ours = e.w.XULBrowserWindow.setOverLink;
  const later = (...args) => ours(...args);
  e.w.XULBrowserWindow.setOverLink = later;
  e.w.__zzturboInstance.retire();
  assert.equal(e.w.XULBrowserWindow.setOverLink, later);
  assert.deepEqual(later("https://example.com", null, "extra"), ["https://example.com", null, "extra"]);
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
