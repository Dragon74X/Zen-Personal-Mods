import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

function element(extra = {}) {
  const attrs = new Map();
  return {
    isConnected: true, closest: () => null,
    getAttribute: key => attrs.get(key), hasAttribute: key => attrs.has(key),
    setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key),
    ...extra,
  };
}

async function environment() {
  const prefs = new Map(Object.entries({
    "zzrouter.enabled": true, "zzrouter.rules": "youtube.com > Youtube",
    "zzrouter.media-subgroups": true, "zzrouter.follow-containers": false,
    "zzrouter.creators": JSON.stringify({ video: "Channel" }),
  }));
  const tab = element({ label: "Video", linkedBrowser: { currentURI: {
    spec: "https://www.youtube.com/watch?v=video", scheme: "https", host: "www.youtube.com",
    filePath: "/watch", query: "v=video",
  } } });
  const root = element({ label: "Youtube", tagName: "tab-group", tabs: [tab], querySelector: () => tab });
  const group = element({ label: "Channel", tagName: "tab-group", tabs: [tab], querySelector: () => tab,
    parentElement: { closest: () => root } });
  tab.group = group;
  const pending = [], requests = [], timers = new Map(), refreshes = [];
  let now = 1000000, serial = 0, scans = 0, privateWindow = false;
  const NetUtil = {
    newChannel: ({ uri }) => ({ loadFlags: 0, cancel() {},
      asyncOpen(listener) { pending.push([this, listener]); requests.push(uri); } }),
    readInputStreamToString: (stream, count) => stream.body.slice(0, count),
  };
  let source = await readFile(new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");
  source = source.replace("  // ---- declared defaults", "  globalThis.harness = {fetchSectionIcon, stampIcons, route, iconMap}; return;\n  // ---- declared defaults");
  const context = vm.createContext({
    window: { Groupflow: { refresh: defer => refreshes.push(defer) } }, gBrowser: {},
    document: { querySelectorAll: () => { scans++; return [root, group]; } },
    Services: {
      prefs: { getBoolPref: (key, fallback) => prefs.get(key) ?? fallback,
        getStringPref: (key, fallback) => prefs.get(key) ?? fallback,
        setStringPref: (key, value) => prefs.set(key, value) },
      io: { newURI: value => { const url = new URL(value); return {
        scheme: url.protocol.slice(0, -1), host: url.hostname, userPass: url.username + url.password,
      }; } }, scriptSecurityManager: { createContentPrincipal() {} },
    },
    ChromeUtils: { generateQI: () => () => {}, importESModule: name => name.includes("NetUtil")
      ? { NetUtil } : { PrivateBrowsingUtils: { isWindowPrivate: () => privateWindow } } },
    Ci: { nsILoadInfo: {}, nsIContentPolicy: {}, nsIRequest: {} },
    Components: { isSuccessCode: status => status === 0 },
    Date: { now: () => now }, setTimeout: fn => { timers.set(++serial, fn); return serial; },
    clearTimeout: id => timers.delete(id), URLSearchParams, Blob, Uint8Array,
    createImageBitmap: async () => ({ width: 64, height: 64, close() {} }),
    OffscreenCanvas: class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return { arrayBuffer: async () => new Uint8Array([1]).buffer }; }
    }, btoa: value => Buffer.from(value).toString("base64"),
  });
  vm.runInContext(source, context);
  return {
    h: context.harness, prefs, tab, group, requests, pending, timers, refreshes,
    advance: ms => now += ms, makePrivate: () => privateWindow = true, get scans() { return scans; },
    answer(body) {
      const [channel, listener] = pending.shift();
      listener.onStartRequest(channel);
      listener.onDataAvailable(channel, { body }, 0, body.length);
      listener.onStopRequest(channel, 0);
    },
  };
}

test("channel metadata after 512 KiB is read and its avatar reaches the subgroup", async () => {
  const e = await environment();
  e.h.fetchSectionIcon("Channel", "https://www.youtube.com/@channel", 0, "round");
  // Current YouTube channel pages put og:image after roughly 750 KiB of styles.
  e.answer("x".repeat(760 * 1024) + '<meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">' + "x".repeat(400 * 1024));
  assert.equal(e.requests[1], "https://yt3.googleusercontent.com/avatar=s256");
  e.answer("image bytes");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.group.getAttribute("data-zzrouter-icon"), "data:image/webp;base64,AQ==");
  assert.deepEqual(e.refreshes, [true]);
  assert.equal(e.timers.size, 0);
});

test("section-page metadata still stops at the bounded 1 MiB limit", async () => {
  const e = await environment();
  e.h.fetchSectionIcon("Channel", "https://www.youtube.com/@channel", 0, "round");
  e.answer("x".repeat(1024 * 1024) + '<meta property="og:image" content="https://example.com/late.png">');
  assert.equal(e.requests.length, 1);
  assert.equal(e.h.iconMap().size, 0);
  assert.equal(e.timers.size, 0);
});

test("already-filed tab activity retries failed avatars after cooldown without a group scan", async () => {
  const e = await environment();
  e.h.fetchSectionIcon("Channel", "https://www.youtube.com/@channel", 0, "round");
  e.answer("consent page");
  await e.h.route(e.tab, "retitle");
  assert.equal(e.requests.length, 1, "cooldown blocks repeat requests");
  e.advance(600000);
  await e.h.route(e.tab, "retitle");
  assert.equal(e.requests.length, 2, "an unchanged cached route must still recover its avatar");
  assert.equal(e.scans, 0, "recovery only inspects this tab's group");
  e.answer(JSON.stringify({ author_name: "Channel", author_url: "https://www.youtube.com/@channel" }));
  e.answer('<meta property="og:image" content="https://example.com/avatar.png">');
  e.answer("image bytes");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.group.getAttribute("data-zzrouter-icon"), "data:image/webp;base64,AQ==");
  assert.equal(e.tab.group, e.group, "recovery must not move the tab");
  assert.equal(e.timers.size, 0, "a cached creator must not reroute itself");
  await e.h.route(e.tab, "retitle");
  assert.equal(e.requests.length, 4, "successful avatars are reused");
});

test("already-filed avatar recovery respects private windows and disabled section icons", async () => {
  for (const disabled of [false, true]) {
    const e = await environment();
    if (disabled) e.prefs.set("zzrouter.section-icons", false); else e.makePrivate();
    await e.h.route(e.tab, "retitle");
    assert.equal(e.requests.length, 0);
  }
});
