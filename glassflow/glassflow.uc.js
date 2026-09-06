// ==UserScript==
// @name           Glassflow
// @description    Writes Glassflow's preference variables at startup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const PREFIX = "zzglass.";

  // Zen 1.22b's squircles are gated behind this platform pref. It is a browser
  // pref rather than CSS, so the stylesheet cannot reach it -- but it is an
  // appearance control, so it belongs here with Corner shape rather than in a
  // performance mod. Declared up here because readPrefValue() below skips the
  // snapshot key, and a const referenced before its declaration line would sit
  // in the temporal dead zone if anything ever moved the call order.
  const CS = "layout.css.corner-shape.enabled";
  const CS_SAVED = PREFIX + "corner.platform-saved";

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
    // Bookkeeping, not a style value: this holds JSON and has no business
    // being written into a CSS custom property.
    if (full === CS_SAVED) return null;
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

  // ---- browser-wide squircle switch --------------------------------------
  // Zen 1.22b draws every corner in the chrome with corner-shape:
  // superellipse(), gated behind the platform pref below. That is a browser
  // pref rather than CSS, so the stylesheet cannot reach it -- but it is an
  // appearance control, so it belongs here with the rest of Corner shape and
  // not in a performance mod.
  //
  // Snapshotted before it is touched and restored EXACTLY when switched back
  // off, including "no user value at all". If the pref no longer matches what
  // this mod set, the user changed it by hand and it is left alone.
  // One window owns this; the pref is global and every window runs this script.
  const isMainAppWindow = () =>
    Services.wm.getMostRecentWindow("navigator:browser") === window;

  function syncPlatformSquircles() {
    if (!isMainAppWindow()) return;
    const P = Services.prefs;
    let want = false;
    try { want = P.getBoolPref(PREFIX + "corner.disable-platform", false); } catch {}

    let saved = null;
    try { saved = JSON.parse(P.getStringPref(CS_SAVED, "null")); } catch {}

    if (want) {
      if (saved) return;                       // already ours
      const snap = P.prefHasUserValue(CS)
        ? { had: true, v: P.getBoolPref(CS, true) }
        : { had: false };
      try {
        P.setStringPref(CS_SAVED, JSON.stringify(snap));
        P.setBoolPref(CS, false);
      } catch {}
      return;
    }

    if (!saved) return;                        // nothing of ours to undo
    try {
      // Changed by hand since we set it: it is theirs now, leave it.
      if (P.getBoolPref(CS, false) === false) {
        if (saved.had) P.setBoolPref(CS, saved.v);
        else P.clearUserPref(CS);
      }
    } catch {}
    try { P.clearUserPref(CS_SAVED); } catch {}
  }

  // ---- instant UI animations ---------------------------------------------
  // Zen animates its interface through its vendored Motion library, which
  // exposes a global switch: with instantAnimations set, every animation jumps
  // straight to its final frame. This is the real lever -- no zen.animations
  // pref exists. It is a LOOK change, which is why it lives here and not in a
  // performance mod. In-memory, applies live, reverts live, touches nothing on
  // web pages.
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
      if (data === PREFIX + "corner.disable-platform") { syncPlatformSquircles(); return; }
      if (data === PREFIX + "instant-ui") { syncInstantUI(); return; }
      const name = "--" + data.replace(/\./g, "-");
      const value = readPrefValue(data);
      try {
        if (value === null) document.documentElement.style.removeProperty(name);
        else document.documentElement.style.setProperty(name, value);
      } catch {}
    },
  };


  function start() {
    injectPrefVars();
    syncPlatformSquircles();
    syncInstantUI();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    window.addEventListener("unload", () => {
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
    }, { once: true });
  }

  if (gBrowserInit?.delayedStartupFinished) start();
  else {
    const obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) {
        Services.obs.removeObserver(obs, topic);
        start();
      }
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
  }
})();
