// Execute affected production paths with browser fakes; no profile or network IO.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

test("Glassflow upgrades legacy sidebar blur once and preserves explicit native choices", async () => {
  const source = await readFile(new URL("../glassflow/glassflow.uc.js", import.meta.url), "utf8");
  const migration = source.slice(source.indexOf("  // Preserve the existing sidebar switch once;"), source.indexOf("  // Written the moment this script is injected,"));
  const old = "zen.theme.acrylic-elements", native = "zen.theme.acrylic-sidebar", urlbar = "zen.theme.acrylic-urlbar";
  function run(entries) {
    const prefs = new Map(entries);
    const context = vm.createContext({ PREFIX: "zzglass.", Services: { prefs: {
      getBoolPref: (key, fallback) => prefs.has(key) ? prefs.get(key) : fallback,
      prefHasUserValue: key => prefs.has(key), setBoolPref: (key, value) => prefs.set(key, value),
    } } });
    const migrate = () => vm.runInContext(migration, context);
    migrate();
    return { prefs, migrate };
  }
  for (const value of [false, true]) {
    const { prefs, migrate } = run([[old, value]]);
    assert.equal(prefs.get(native), value);
    assert.equal(prefs.get(old), value, "rollback retains the old choice");
    assert.equal(prefs.has(urlbar), false);
    prefs.delete(native);
    migrate();
    assert.equal(prefs.has(native), false, "later reset to native default wins");
    const explicit = run([[old, value], [native, !value], [urlbar, true]]).prefs;
    assert.equal(explicit.get(native), !value);
    assert.equal(explicit.get(urlbar), true);
  }
  assert.equal(run([]).prefs.has(native), false, "fresh installs keep native defaults");
});

test("Library downloads batch once and select only the four older rows", async () => {
  const source = await readFile(new URL("../glassflow-library/glassflow-library.uc.js", import.meta.url), "utf8");
  let view, flushes = 0, copied = 0, count = 8;
  const rows = [], style = { setProperty() {}, removeProperty() {} };
  function row() {
    const badge = { style, toggleAttribute() {}, firstElementChild: { style } }, title = {}, subtitle = {};
    return { style, addEventListener() {}, toggleAttribute() {},
      remove() { rows.splice(rows.indexOf(this), 1); },
      querySelector(s) { return s.includes("badge") ? badge : s.endsWith("subtitle") ? subtitle : title; } };
  }
  const list = { querySelectorAll: () => rows, prepend: r => rows.unshift(r), getBoundingClientRect: () => ({ height: 400 }) };
  const context = vm.createContext({ console,
    Services: { prefs: { PREF_INT: 64, getPrefType: () => 64, getIntPref: () => count } },
    document: { documentElement: { style }, getElementById: id => id === "zen-library-download-list" ? list
      : id === "zen-sidebar-foot-buttons" ? { hasAttribute: () => true } : { style } },
    customElements: { whenDefined: () => new Promise(() => {}) },
    window: { addEventListener() {}, MozXULElement: { parseXULToFragment: () => ({ firstElementChild: row() }) },
      promiseDocumentFlushed: fn => { flushes++; return Promise.resolve(fn()); } },
    ChromeUtils: { defineESModuleGetters: lazy => Object.assign(lazy, {
      DownloadsCommon: { strings: { stateFailed: "failed" }, getData: () => ({ addView: v => { view = v; } }) },
    }) }, countCopy: n => { copied += n; },
  });
  vm.runInContext(`const originalSlice = Array.prototype.slice;
    Array.prototype.slice = function(...args) { const result = originalSlice.apply(this, args); countCopy(result.length); return result; };`, context);
  vm.runInContext(source.slice(0, source.indexOf("  const footWatch =")) +
    "globalThis.harness = { watchDownloads, fillExtras }; })();", context);
  context.harness.watchDownloads();
  view.onDownloadBatchStarting();
  const downloads = Array.from({ length: 1000 }, (_, id) => ({ id, stopped: true, target: { path: "" }, source: { url: `https://example.com/${id}` } }));
  for (const download of downloads) view.onDownloadAdded(download);
  assert.equal(flushes, 0, "no layout reads inside batch");
  view.onDownloadBatchEnded();
  assert.equal(flushes, 1);
  assert.equal(copied, 4, "copy only rendered entries, not download history");
  assert.deepEqual(rows.map(r => r.download.id), [992, 993, 994, 995]);
  view.onDownloadRemoved(downloads.at(-1));
  assert.deepEqual(rows.map(r => r.download.id), [991, 992, 993, 994]);
  count = 5;
  context.harness.fillExtras();
  assert.deepEqual(rows.map(r => r.download.id), [994]);
  count = 4;
  context.harness.fillExtras();
  assert.equal(rows.length, 0);
});

const mediaRoot = new URL("../mediaflow/", import.meta.url);
const mediaSource = readFileSync(new URL("mediaflow.uc.js", mediaRoot), "utf8");
function mediaActor(file, name, base) {
  const messages = [];
  const env = vm.createContext({
    [base]: class { sendAsyncMessage(type, data) { messages.push([type, data]); } },
    console: { log() {}, error() {} },
  });
  const source = readFileSync(new URL(file, mediaRoot), "utf8").replace("export class", "class");
  vm.runInContext(source + `\nthis.Actor = ${name};`, env);
  return { actor: new env.Actor(), messages };
}

test("Mediaflow: native state survives same-time pause and hidden capture; PiP targets the mirrored element", () => {
  const { actor, messages } = mediaActor("content-actor.sys.mjs", "ZzMediaflowChild", "JSWindowActorChild");
  const video = {
    tagName: "VIDEO", currentTime: 30, duration: 100, readyState: 3,
    videoWidth: 640, videoHeight: 360, paused: false, seeking: false,
    pause() { this.paused = true; actor.handleEvent({ type: "pause", target: this }); },
    play() { this.paused = false; actor.handleEvent({ type: "play", target: this }); },
  };
  actor._video = video;
  actor._processingActive = true;
  actor._scaleCanvas = { width: 2, height: 2 };
  actor._ensureScaleContext = () => ({ drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; } });
  actor._captureFrame("240");
  actor._control("toggle");
  actor._captureFrame("240");
  assert.equal(messages.filter(([name]) => name === "ZenPiP:Frame").length, 1);
  assert.equal(messages.at(-1)[0], "ZenPiP:PlaybackState");
  assert.equal(messages.at(-1)[1].paused, true);
  assert.equal(actor._video, video);
  actor._processingActive = false;
  const beforeHidden = messages.length;
  actor.handleEvent({ type: "durationchange", target: video });
  actor._captureFrame("240");
  assert.equal(messages.length, beforeHidden, "hidden sources send no timeline/capture work");
  actor._control("toggle");
  assert.equal(messages.at(-1)[1].paused, false, "play state follows native event while capture is hidden");
  actor._control("toggle");
  actor._stopCaptionTracking = () => {};
  actor._setProcessingActive(true, "off", false);
  actor._captureFrame("240");
  assert.equal(messages.filter(([name]) => name === "ZenPiP:Frame").length, 2,
    "restoring a held-paused source must replace the other source's bitmap");
  let launched;
  actor.manager = { getActor(name) {
    assert.equal(name, "PictureInPictureLauncher");
    return { togglePictureInPicture({ video: target }) { launched = target; return Promise.resolve(); } };
  } };
  actor._control("popout");
  assert.equal(launched, video);
});

function mediaController() {
  const calls = [], timers = new Map();
  let timerId = 0;
  const registry = new Map([11, 22].map(id => [id, {
    startTick() { calls.push(`${id}.start`); }, stopTick() { calls.push(`${id}.stop`); },
    setProcessingActive(active, mode, captions) { calls.push(`${id}.processing=${active}:${captions}`); },
  }]));
  const env = vm.createContext({
    window: {}, actorRegistry: registry, sourceBC: null, availableSources: new Map(),
    isStreaming: false, playerSeen: true, userHidden: false, sourceTabActive: false,
    browserWindowActive: true, captionMode: "youtube", captionsWhenPipHidden: false,
    animateOutTimer: null, animating: false, dragging: false,
    gBrowser: { selectedBrowser: { browsingContext: { id: 99 } }, tabs: [] },
    pipContainer: { style: {}, getBoundingClientRect() {} },
    setSourceDimensions() {}, clearCaptionImmediately() {}, log() {}, updateControls() {},
    requestAnimationFrame() {}, setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); }, CONFIG: { ANIM_MS: 220 },
    lastOpacity: 0, lastCaptionOpacity: 0,
    startTracking() { vm.runInContext("_notifyTickState()", env); }, stopTracking() {},
  });
  vm.runInContext(mediaSource.slice(mediaSource.indexOf("  function isTabPlaying(bc)"), mediaSource.indexOf("\n  function instantiateActorForOpenTabs()")), env);
  return { env, calls, controller: env.window.ZzMediaflowController, runTimer(id) { const fn = timers.get(id); timers.delete(id); fn(); } };
}

test("Mediaflow: source pre-emption stops both clocks and restores the retained source", () => {
  const { env, calls, controller, runTimer } = mediaController();
  const a = { id: 11, top: { id: 1 } }, b = { id: 22, top: { id: 2 } };
  controller.offerVideo(640, 360, a);
  calls.length = 0;
  controller.offerVideo(640, 360, b);
  assert.deepEqual(calls, ["11.processing=false:false", "11.stop", "22.processing=true:true", "22.start"]);
  assert.equal(env.availableSources.has(11), true);
  assert.equal(controller.getActiveBC(), b);
  controller.unregisterSource(22);
  controller.notifySourceStopped(b);
  runTimer(env.animateOutTimer);
  assert.equal(controller.getActiveBC(), a);
  assert.equal(calls.at(-1), "11.start");
  assert.equal(env.availableSources.has(22), false);
  env.userHidden = true;
  calls.length = 0;
  vm.runInContext("_notifyTickState()", env);
  assert.deepEqual(calls, ["11.processing=false:false", "11.stop"]);
});

test("Mediaflow: embedded playback consults its tab and never captures its selected tab", () => {
  const { env, calls, controller } = mediaController();
  const a = { id: 11, top: { id: 1 } }, b = { id: 22, top: { id: 2 } };
  env.gBrowser.tabs = [{ linkedBrowser: { browsingContext: { id: 1 } }, hasAttribute: name => name === "soundplaying" }];
  env.gBrowser.selectedBrowser.browsingContext.id = 1;
  controller.offerVideo(640, 360, a);
  assert.equal(env.sourceTabActive, true);
  assert.equal(calls.includes("11.start"), false);
  calls.length = 0;
  controller.offerVideo(640, 360, b);
  assert.equal(controller.getActiveBC(), a, "iframe playback retains priority while its top-level tab plays sound");
  assert.deepEqual(calls, []);
  assert.equal(env.availableSources.has(22), true);
});

test("Mediaflow: inactive actor state, frames, and stops cannot change active controls/captions", async () => {
  const { actor } = mediaActor("parent-actor.sys.mjs", "ZzMediaflowParent", "JSWindowActorParent");
  const calls = [];
  const controller = {
    getActiveBC: () => ({ id: 11 }), updateControls: state => calls.push(state),
    drawFrame: () => calls.push("frame"), hideCaption: () => calls.push("hide"),
    setCaption: () => calls.push("caption"), unregisterSource: id => calls.push(`unregister:${id}`),
    notifySourceStopped: bc => calls.push(`stopped:${bc.id}`),
  };
  actor.browsingContext = { id: 22, topChromeWindow: { ZzMediaflowController: controller } };
  actor._stopTicking = () => calls.push("stopTick");
  await actor.receiveMessage({ name: "ZenPiP:PlaybackState", data: { paused: true } });
  await actor.receiveMessage({ name: "ZenPiP:Frame", data: {} });
  assert.deepEqual(calls, []);
  await actor.receiveMessage({ name: "ZenPiP:VideoStopped", data: { reason: "pause" } });
  assert.deepEqual(calls, ["stopTick", "unregister:22", "stopped:22"]);
  actor.browsingContext.id = 11;
  const state = { time: 30, duration: 100, paused: true };
  await actor.receiveMessage({ name: "ZenPiP:PlaybackState", data: state });
  assert.equal(calls.at(-1), state);
});

test("Mediaflow: native range seeks once on commit and cancels preview state without seeking", () => {
  const nodes = [], sent = [], attrs = new Map();
  const node = tag => {
    const n = { tag, handlers: {}, attrs: new Map(), style: {}, dataset: {},
      addEventListener(event, fn) { this.handlers[event] = fn; }, append() {}, appendChild() {},
      setAttribute(k, v) { this.attrs.set(k, v); }, removeAttribute(k) { this.attrs.delete(k); },
      get valueAsNumber() { return Number(this.value); },
    };
    nodes.push(n);
    return n;
  };
  const env = vm.createContext({
    document: { createElement: node }, pipContainer: { appendChild() {}, toggleAttribute(k, v) { attrs.set(k, v); } },
    safe: fn => fn(), on: (n, event, fn) => n.addEventListener(event, fn), undo: [],
    Services: { prefs: { getBoolPref: () => true, getStringPref: () => "10", addObserver() {} } },
    sourceBC: { id: 11, top: { embedderElement: {} } },
    gBrowser: { getTabForBrowser: () => ({ linkedBrowser: { audioMuted: false } }) },
    actorRegistry: new Map([[11, { control: (action, value) => sent.push([action, value]) }]]),
    setUserHidden() {},
  });
  vm.runInContext(mediaSource.slice(mediaSource.indexOf('  const CONTROLS_PREF ='), mediaSource.indexOf('\n  on(musicPlayerUI, "mouseenter"')) + "\nthis.update = updateControls;", env);
  const track = nodes.find(n => n.tag === "input");
  assert.equal(track.type, "range");
  assert.equal(track.attrs.get("aria-label"), "Video position");
  env.update({ time: 20, duration: 100, paused: false });
  assert.equal(track.valueAsNumber, 0.2);
  track.value = "0.65";
  track.handlers.input();
  env.update({ time: 21, duration: 100, paused: true });
  assert.equal(track.valueAsNumber, 0.65, "playback updates do not interrupt scrubbing");
  assert.equal(attrs.get("zzmf-paused"), true);
  track.handlers.change();
  assert.deepEqual(sent, [["seekTo", 0.65]]);
  track.value = "0.75";
  track.handlers.input();
  track.handlers.pointercancel();
  assert.equal(track.valueAsNumber, 0.21);
  assert.equal(sent.length, 1);
  env.update({ time: 300, duration: Infinity, paused: false });
  assert.equal(track.disabled, true);
  assert.equal(track.valueAsNumber, 0);
  assert.equal(track.attrs.has("aria-valuetext"), false);
  assert.match(mediaSource, /:is\(:hover, :focus-within, \[zzmf-paused\]\)/);
});
