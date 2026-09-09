// ==UserScript==
// @name           Glassflow
// @description    Writes Glassflow's preference variables at startup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window. instance.retire is the
  // pending startup observer until start() swaps in the real cleanup.
  const INSTANCE_KEY = "__zzglassInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzglass.";


  // ---- pref variables at startup -----------------------------------------
  // Sine injects string and number prefs as CSS variables, but not until
  // something (the settings page, a mod reload) triggers it -- measured on a
  // fresh launch, every one of them was absent while the sheet itself was
  // loaded and working. So the CSS ran on its fallbacks and configured
  // values only appeared after a reload. These are written here instead,
  // from the prefs themselves, so they exist before first paint.
  //
  // Naming matches Sine's own convention exactly: PREFIX.foo-bar becomes
  // --PREFIX-foo-bar, dots to dashes. Booleans are skipped -- those are read
  // with -moz-pref(), never as variables.
  function injectPrefVars() {
    let names = [];
    try { names = Services.prefs.getBranch(PREFIX).getChildList(""); } catch { return; }
    const root = document.documentElement;
    for (const leaf of names) {
      const full = PREFIX + leaf;
      const value = readPrefValue(full);
      if (value === null) continue;
      try {
        root.style.setProperty("--" + full.replace(/\./g, "-"), value);
      } catch {}
    }
  }

  // The type is CHECKED, never guessed by attempting reads: calling
  // getStringPref on a boolean throws NS_ERROR_UNEXPECTED, and Firefox logs
  // every one of those even when it is caught -- which floods the console
  // with "failed to read pref" for every boolean in the branch. Booleans are
  // skipped entirely; they are read with -moz-pref(), never as variables.
  function readPrefValue(full) {
    const P = Services.prefs;
    let type;
    try { type = P.getPrefType(full); } catch { return null; }
    try {
      if (type === P.PREF_STRING) {
        const v = P.getStringPref(full);
        return v === "" ? null : v;     // empty would invalidate a declaration
      }
      if (type === P.PREF_INT) return String(P.getIntPref(full));
    } catch {}
    return null;                        // booleans and unknown types
  }


  // ---- instant UI animations ---------------------------------------------
  // Zen animates its interface through its vendored Motion library, which
  // exposes a global switch: with instantAnimations set, every animation jumps
  // straight to its final frame. This is the real lever -- no zen.animations
  // pref exists. It is a LOOK change, which is why it lives here and not in a
  // performance mod. In-memory, applies live, reverts live, touches nothing on
  // web pages.
  //
  // Restored: cd192ee deleted this body while leaving both call sites, so
  // start() threw ReferenceError on every window from then on. See the note
  // on startOnce() for why that took the other four mods down with it.
  function syncInstantUI() {
    const cfg = window.Motion?.MotionGlobalConfig;
    if (!cfg) return;                      // not on this build; nothing to do
    let want = false;
    try { want = Services.prefs.getBoolPref(PREFIX + "instant-ui", false); } catch {}
    if (cfg.instantAnimations !== want) cfg.instantAnimations = want;
  }

  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
      if (data === PREFIX + "instant-ui") { syncInstantUI(); return; }
      if (data === PREFIX + "sidebar.sample" || data === PREFIX + "sidebar.sample-interval") {
        if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
        syncSampling();
      }
      const name = "--" + data.replace(/\./g, "-");
      const value = readPrefValue(data);
      try {
        if (value === null) document.documentElement.style.removeProperty(name);
        else document.documentElement.style.setProperty(name, value);
      } catch {}
    },
  };


  // ---- sampled sidebar glass ----------------------------------------------
  // backdrop-filter in chrome cannot see web content: the content process
  // composites its own surface, so every "sidebar blur" mod blurs the window
  // background and goes flat once the page has painted. drawSnapshot() on
  // the content's WindowGlobalParent can: it hands back a bitmap of any
  // rectangle of the page. So while the compact sidebar floats over the
  // page, the strip beneath it is snapped at a small scale a few times a
  // second, and painted -- blurred, tinted -- behind the sidebar as a
  // background image. A tiny readback, a tiny image, no per-frame pass;
  // nothing at all while the sidebar is hidden or docked.
  const SAMPLE_SCALE = 0.1;                   // 300px strip -> 30px image
  let sampleTimer = null;
  let sampleObserver = null;
  let sampleUrl = null;
  let sampleSig = "";
  let sampling = false;
  let lastSample = null;

  // #titlebar is the floating panel in compact mode; the sample hangs on it.
  const sidebarEl = () => document.getElementById("titlebar");
  const sidebarShown = () => {
    const root = document.documentElement, tb = document.getElementById("navigator-toolbox");
    return root.getAttribute("zen-compact-mode") === "true" && !!tb &&
      (tb.hasAttribute("zen-has-hover") || tb.hasAttribute("zen-user-show") || tb.hasAttribute("has-popup-menu"));
  };

  // The page rectangle under the sidebar, in the content's own CSS pixels.
  function sampleRect() {
    const sb = sidebarEl(), browser = gBrowser?.selectedBrowser;
    if (!sb || !browser) return null;
    const s = sb.getBoundingClientRect(), b = browser.getBoundingClientRect();
    const left = Math.max(s.left, b.left), top = Math.max(s.top, b.top);
    const right = Math.min(s.right, b.right), bottom = Math.min(s.bottom, b.bottom);
    if (right - left < 8 || bottom - top < 8) return null;
    let zoom = 1;
    try { zoom = browser.browsingContext?.fullZoom || 1; } catch {}
    return new DOMRect((left - b.left) / zoom, (top - b.top) / zoom, (right - left) / zoom, (bottom - top) / zoom);
  }

  function clearSample() {
    try { sidebarEl()?.style.removeProperty("--zzglass-sidebar-sample"); } catch {}
    if (sampleUrl) { try { URL.revokeObjectURL(sampleUrl); } catch {} sampleUrl = null; }
    sampleSig = "";
  }

  async function sampleOnce() {
    if (sampling) return;
    const rect = sampleRect();
    if (!rect) { clearSample(); return; }
    sampling = true;
    lastSample = { rect, at: Date.now() };
    try {
      const wg = gBrowser.selectedBrowser.browsingContext?.currentWindowGlobal;
      if (!wg?.drawSnapshot) return;
      const bmp = await wg.drawSnapshot(rect, SAMPLE_SCALE, "transparent");
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      // Unchanged page -> unchanged image: no new blob, no repaint.
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let sig = "";
      for (let i = 0; i < px.length; i += 64) sig += String.fromCharCode(px[i] >> 3);
      if (sig === sampleSig) return;
      sampleSig = sig;
      const url = URL.createObjectURL(await c.convertToBlob({ type: "image/png" }));
      const sb = sidebarEl();
      if (sb) sb.style.setProperty("--zzglass-sidebar-sample", `url("${url}")`);
      if (sampleUrl) { try { URL.revokeObjectURL(sampleUrl); } catch {} }
      sampleUrl = url;
    } catch {
      clearSample();
    } finally { sampling = false; }
  }

  function syncSampling() {
    const on = (() => { try { return Services.prefs.getBoolPref(PREFIX + "sidebar.sample", false); } catch { return false; } })();
    const want = on && sidebarShown();
    if (want && !sampleTimer) {
      // A text field, so a string pref; read either type.
      let ms = 250;
      try { const v = parseInt(readPrefValue(PREFIX + "sidebar.sample-interval"), 10); if (v >= 100) ms = v; } catch {}
      sampleOnce();
      sampleTimer = setInterval(sampleOnce, ms);
    } else if (!want && sampleTimer) {
      clearInterval(sampleTimer); sampleTimer = null;
      clearSample();
    }
  }

  function startSampling() {
    const tb = document.getElementById("navigator-toolbox");
    if (!tb) return;
    // Zen flips these attributes as the compact sidebar shows and hides;
    // the observer is the only thing that runs while it is hidden.
    sampleObserver = new MutationObserver(syncSampling);
    sampleObserver.observe(tb, { attributes: true, attributeFilter: ["zen-has-hover", "zen-user-show", "has-popup-menu"] });
    sampleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["zen-compact-mode"] });
    gBrowser.tabContainer.addEventListener("TabSelect", syncSampleNow);
    syncSampling();
  }
  const syncSampleNow = () => { sampleSig = ""; if (sampleTimer) sampleOnce(); };
  function stopSampling() {
    try { sampleObserver?.disconnect(); } catch {}
    sampleObserver = null;
    try { gBrowser.tabContainer.removeEventListener("TabSelect", syncSampleNow); } catch {}
    if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
    clearSample();
  }

  function start() {
    syncInstantUI();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    try { startSampling(); } catch (e) { console.error("[Glassflow] sampled glass failed to start:", e); }
    // Glassflow.sample.status() says whether the sampled glass is running
    // and what strip of the page it last read; .now() forces one read.
    window.Glassflow = {
      sample: {
        status: () => ({ active: !!sampleTimer, shown: sidebarShown(), rect: sampleRect(), last: lastSample }),
        now: () => { sampleSig = ""; return sampleOnce(); },
      },
    };
    const cleanup = () => {
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      stopSampling();
      try { delete window.Glassflow; } catch {}
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Not registered with Sine's addUnloadListener() on purpose: that buys
    // hot-reload on update at the cost of tearing down and re-injecting every
    // script in every window, and one bad re-injection took four mods down.
    // Sine's own toast asks for a restart after a JS update; that is enough.
    // The DOM unload listener above is what releases these when the window
    // closes.
    instance.retire = cleanup;
  }

  // ---- declared defaults --------------------------------------------------
  // Sine does not write the defaults declared in preferences.json into the
  // profile. manager.sys.mjs says so outright: "TODO: Apply default
  // preferences." So an unset pref reads as whatever the READER falls back
  // to, and the readers disagree with each other.
  //
  // A mod's own reader falls back one way (this script's bool(name, true)),
  // Sine's settings panel another (getBoolPref(name, false) when deciding
  // whether a conditioned row shows), and a -moz-pref() media query in the
  // stylesheet a third. Each is reasonable alone; together they produce a mod
  // behaving as if a setting is on while every row it governs is hidden as if
  // it were off.
  //
  // Writing each declared default once, and only when the pref has never
  // been set, removes the disagreement for all three at once. Nothing that
  // was already chosen is touched.
  const MOD_ID = "zz-glassflow";
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs;
    let wrote = 0;
    for (const pref of declared) {
      const name = pref?.property;
      const value = pref?.defaultValue;
      if (!name || !name.startsWith(PREFIX) || value === undefined || value === null) continue;
      try {
        if (S.getPrefType(name) !== S.PREF_INVALID) continue;   // already chosen
        if (typeof value === "boolean") S.setBoolPref(name, value);
        else if (typeof value === "number") S.setIntPref(name, value);
        else if (typeof value === "string") S.setStringPref(name, value);
        else continue;
        wrote++;
      } catch {}
    }
    return wrote > 0;
  }

  // Written the moment this script is injected, not from start(). These
  // variables need only Services.prefs and the document element -- never
  // gBrowser -- and browser-delayed-startup-finished, which start() waits for,
  // fires well AFTER first paint. Deferring meant every window opened painting
  // the CSS fallbacks (10px roundness, the default tints) and then snapping to
  // the configured values. Doing it here is what actually makes the startup comment
  // above true.
  try { injectPrefVars(); } catch {}
  // Seeding is a file read, so it cannot happen before first paint like the
  // line above. Re-inject after it, and only if it actually wrote something,
  // so a profile that already has its prefs pays nothing.
  seedDefaults().then((wrote) => { if (wrote) injectPrefVars(); }).catch(() => {});


  // ---- startup ------------------------------------------------------------
  // browser-delayed-startup-finished fires once. A script injected after it
  // -- Sine's rebuild path does that -- would wait forever, so the observer
  // is backed by a bounded poll and startOnce() makes whichever loses a
  // no-op. start() is wrapped: a throw here escapes into Sine's injection
  // loop, which does not catch, and every mod queued after this one is never
  // injected.
  let started = false;
  let waitTimer = null;
  let obs = null;

  const stopWaiting = () => {
    if (obs) {
      try { Services.obs.removeObserver(obs, "browser-delayed-startup-finished"); } catch {}
      obs = null;
    }
    if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
  };

  const startOnce = () => {
    // A newer copy of this script may have claimed the window while this one
    // was waiting; that copy owns the registrations, so this one stays quiet.
    if (started || window[INSTANCE_KEY] !== instance) return;
    started = true;
    stopWaiting();
    try { start(); } catch (e) {
      console.error("[Glassflow] failed to start:", e);
    }
  };

  // Read through the window first, then the bare global. A sub-script loaded
  // with the window as its target sees the same object either way, but that
  // is a property of how Sine loads us, not a guarantee -- and reading only
  // one of the two is how this check silently returns false in a window that
  // is in fact ready.
  const windowReady = () => {
    try { return !!(window.gBrowserInit ?? gBrowserInit)?.delayedStartupFinished; }
    catch { return false; }
  };

  // Until start() swaps in the real cleanup, releasing this copy means
  // dropping whatever it is waiting on.
  instance.retire = stopWaiting;

  if (windowReady()) {
    startOnce();
  } else {
    obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) startOnce();
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");

    // The backstop. In the failure above the window is ALREADY past delayed
    // startup, so the first tick starts the mod half a second later. Bounded,
    // because a window that never gets there is not one this mod belongs in.
    const deadline = Date.now() + 60000;
    waitTimer = setInterval(() => {
      if (windowReady()) startOnce();
      else if (Date.now() > deadline) stopWaiting();
    }, 500);
  }
})();
