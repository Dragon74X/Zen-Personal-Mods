import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../peekflow/peekflow.uc.js", import.meta.url), "utf8");
const SHOW = "browser.tabs.hoverPreview.enabled", PICTURES = "browser.tabs.hoverPreview.showThumbnails";
const flush = () => new Promise(resolve => setImmediate(resolve));

function events() {
  const listeners = new Map();
  return {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
    fire: (name, event = {}) => listeners.get(name)?.(event),
  };
}
function environment(initial = {}, defaults = { [SHOW]: false, [PICTURES]: true }) {
  const user = new Map(Object.entries(initial)), windows = [], observers = new Set();
  const get = (name, fallback) => user.has(name) ? user.get(name) : defaults[name] ?? fallback;
  function set(name, value) {
    if (user.has(name) && user.get(name) === value) return;
    user.set(name, value);
    for (const item of [...observers]) if (name.startsWith(item.prefix)) item.observer.observe(null, null, name);
  }
  const Services = { prefs: {
    getBoolPref: get, getIntPref: get, getStringPref: get, setBoolPref: set,
    prefHasUserValue: name => user.has(name), clearUserPref: name => user.delete(name),
    addObserver: (prefix, observer) => observers.add({ prefix, observer }),
    removeObserver: (_, observer) => { for (const item of observers) if (item.observer === observer) observers.delete(item); },
  }, obs: { addObserver() {}, removeObserver() {} }, wm: { getEnumerator: () => windows.values() } };
  function add() {
    const pending = [], idle = [], unloaders = [], classes = new Set();
    const box = { firstChild: null, classList: { add: v => classes.add(v), remove: v => classes.delete(v) },
      replaceChildren(child) { this.firstChild?.remove(); this.firstChild = child; child.isConnected = true; child.parent = this; } };
    const panel = { ...events(), querySelector: selector => selector === ".tab-preview-thumbnail-container" ? box : null,
      querySelectorAll: () => [] };
    const tabPanel = Object.create({ get popupOptions() { return {}; }, activate() {} });
    const window = { ...events(), gBrowserInit: { delayedStartupFinished: true },
      addUnloadListener: fn => unloaders.push(fn), requestIdleCallback: fn => idle.push(fn),
      PageThumbs: { captureTabPreviewThumbnail: (_, canvas) => new Promise(resolve => pending.push({ resolve, canvas })) } };
    const document = { getElementById: () => panel, createElementNS: (_, tag) => ({ tag, isConnected: false,
      remove() { this.isConnected = false; if (this.parent?.firstChild === this) this.parent.firstChild = null; },
      toBlob: fn => fn({}),
    }) };
    const gBrowser = { tabContainer: { previewPanel: { tabPanel } } };
    const context = { window, document, gBrowser, Services, Intl, URL };
    windows.push(window);
    const inject = () => vm.runInNewContext(source, context);
    inject();
    return { window, tabPanel, box, classes, pending, idle, inject, unload: () => unloaders.forEach(fn => fn()) };
  }
  return { user, get, set, add };
}
function tab(selected = true) {
  return { selected, linkedBrowser: {}, hasAttribute: () => false };
}

test("Peekflow restores original native values and user-value absence", () => {
  const e = environment({ [SHOW]: false }), w = e.add();
  assert.equal(e.get(SHOW), true);
  assert.equal(e.user.get("zzpeek.saved.show"), false);
  assert.equal(e.user.get("zzpeek.saved.pictures.had"), false);
  e.set("zzpeek.show", false);
  e.set("zzpeek.show", true);
  w.unload();
  assert.equal(e.user.get(SHOW), false);
  assert.equal(e.user.has(PICTURES), false);
  assert.equal([...e.user.keys()].filter(k => k.startsWith("zzpeek.saved.")).length, 0);
});

test("manual native changes survive unrelated settings, new windows, and unload", () => {
  const e = environment({}, { [SHOW]: true, [PICTURES]: true }), a = e.add();
  e.set(SHOW, false);
  e.set("zzpeek.gap", "8");
  const b = e.add();
  assert.equal(e.get(SHOW), false);
  a.unload();
  b.unload();
  assert.equal(e.user.get(SHOW), false);
});

test("clearing a native user value remains cleared on unload", () => {
  const e = environment({ [SHOW]: false }, { [SHOW]: true, [PICTURES]: true }), w = e.add();
  e.user.delete(SHOW);
  w.unload();
  assert.equal(e.user.has(SHOW), false);
  assert.equal(e.get(SHOW), true);
});

test("only final active window restores shared prefs, independent of unload order", () => {
  for (const reverse of [false, true]) {
    const e = environment({ [SHOW]: false }), windows = [e.add(), e.add()];
    if (reverse) windows.reverse();
    windows[0].unload();
    assert.equal(e.get(SHOW), true);
    assert.equal(e.user.has("zzpeek.saved.show"), true);
    windows[1].unload();
    assert.equal(e.get(SHOW), false);
    assert.equal(e.user.has("zzpeek.saved.show"), false);
  }
});

test("reinjection keeps ownership until the replacement unloads", () => {
  const e = environment({ [SHOW]: false }), w = e.add();
  w.inject();
  assert.equal(e.get(SHOW), true);
  w.unload();
  assert.equal(e.get(SHOW), false);
  assert.equal(e.user.has("zzpeek.saved.show"), false);
});

test("legacy snapshots retain their saved value across upgrade", () => {
  const e = environment({ [SHOW]: true, "zzpeek.saved.show": false }), w = e.add();
  e.set("zzpeek.show", false);
  e.set("zzpeek.show", true);
  w.unload();
  assert.equal(e.user.get(SHOW), false);
});

test("disabling pictures immediately removes selected-tab canvas", async () => {
  const e = environment(), w = e.add();
  w.tabPanel.activate(tab());
  const capture = w.pending.shift();
  capture.resolve(true);
  await flush();
  assert.equal(w.box.firstChild, capture.canvas);
  e.set("zzpeek.pictures", false);
  assert.equal(w.box.firstChild, null);
  assert.equal(capture.canvas.isConnected, false);
  assert.equal(w.classes.has("hide-thumbnail"), true);
  w.tabPanel.activate(tab());
  assert.equal(w.pending.length, 0);
});

test("queued capture cannot return after pictures off, including off then on", async () => {
  for (const enableAgain of [false, true]) {
    const e = environment(), w = e.add();
    w.tabPanel.activate(tab());
    const capture = w.pending.shift();
    e.set("zzpeek.pictures", false);
    if (enableAgain) e.set("zzpeek.pictures", true);
    capture.resolve(true);
    await flush();
    assert.equal(w.box.firstChild, null);
    assert.equal(capture.canvas.isConnected, false);
  }
});

test("same-tab captures resolving out of order cannot replace latest picture", async () => {
  const e = environment(), w = e.add(), current = tab();
  w.tabPanel.activate(current);
  w.tabPanel.activate(current);
  const [first, second] = w.pending;
  second.resolve(true);
  await flush();
  first.resolve(true);
  await flush();
  assert.equal(w.box.firstChild, second.canvas);
  w.unload();
  assert.equal(w.box.firstChild, null);
});

test("idle last-view capture does no work after pictures disabled or window retired", () => {
  for (const retire of [false, true]) {
    const e = environment(), w = e.add();
    w.window.fire("TabAttrModified", { target: tab(false), detail: { changed: ["busy"] } });
    assert.equal(w.idle.length, 1);
    if (retire) w.window.fire("unload");
    else e.set("zzpeek.pictures", false);
    w.idle.shift()();
    assert.equal(w.pending.length, 0);
  }
});
