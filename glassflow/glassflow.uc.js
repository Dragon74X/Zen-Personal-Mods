// ==UserScript==
// @name           Glassflow
// @description    Writes Glassflow's preference variables at startup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine can inject this script into a window that already has a live copy.
  // Its two load paths in manager.sys.mjs do not agree: the rebuild path
  // calls triggerUnloadListener() first and leaves the window alone if the
  // script is still loaded, but the window-open path (observe -> "load")
  // calls loadSubScriptWithOptions directly, with no handshake and no
  // marker registered. A rebuild landing on a window opened moments earlier
  // -- every settings change triggers one -- therefore installs a SECOND
  // copy, and nothing here used to stop it. Two copies means two of every
  // listener, observer and timer acting on the same window, which reads as
  // the mod working intermittently rather than as an obvious break.
  //
  // So: retire whatever instance is already on this window, then claim it.
  // instance.retire is the pending startup observer until start() replaces it
  // with the real cleanup, so a copy is releasable at either stage.
  const INSTANCE_KEY = "__zzglassInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzglass.";

  // An earlier version turned squircles off by writing
  // layout.css.corner-shape.enabled. That pref gates corner-shape at parse
  // time, so it only took effect after a restart -- the switch now does the
  // same job live from CSS instead. These two are kept solely to give back a
  // profile the old code changed; see reclaimPlatformPref() below.
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

  // One-shot cleanup for profiles touched by the old pref-writing switch.
  // Without it, anyone who used that switch keeps corner-shape disabled at the
  // platform level for good, with an orphaned snapshot and nothing left in the
  // mod that would ever put it back.
  // Sine only stores a dropdown as a number when the pref declares
  // value: "number"; without it, convertValueType() hands back the raw string
  // from the menulist. The corner dropdowns shipped without that key, so the
  // moment one was CHANGED its pref flipped from int to string -- and
  // @media (-moz-pref("name", 1)) never matches a string, so every corner
  // setting silently stopped applying while still reading correctly in the
  // settings panel. The declarations are fixed; these values were already
  // written, and a pref keeps its type until it is cleared.
  const NUMERIC_PREFS = ["corner.mode", "corner.radius-source", "corner.radius-mode", "corner.tabs", "corner.essentials", "corner.buttons", "corner.sidebar"];

  function repairNumericPrefs() {
    const P = Services.prefs;
    for (const key of NUMERIC_PREFS) {
      const full = PREFIX + key;
      try {
        if (P.getPrefType(full) !== P.PREF_STRING) continue;
        const raw = P.getStringPref(full, "").trim();
        if (!/^-?\d+$/.test(raw)) continue;   // not a dropdown index; leave it
        P.clearUserPref(full);                // type is fixed until cleared
        P.setIntPref(full, parseInt(raw, 10));
      } catch {}
    }
  }

  function reclaimPlatformPref() {
    if (!isMainAppWindow()) return;
    const P = Services.prefs;
    let saved = null;
    try { saved = JSON.parse(P.getStringPref(CS_SAVED, "null")); } catch {}
    if (!saved) return;
    try {
      if (saved.had) P.setBoolPref(CS, saved.v);
      else P.clearUserPref(CS);
    } catch {}
    try { P.clearUserPref(CS_SAVED); } catch {}
  }

  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
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
    reclaimPlatformPref();
    syncInstantUI();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    const cleanup = () => {
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Sine hot-reloads a mod's script when the mod updates, but ONLY if the
    // script registered an unload callback through Sine's own API. Without one,
    // manager.sys.mjs triggerUnloadListener() finds a null callback, reports
    // "still loaded", and the NEW script is never injected -- so an update
    // silently does nothing until the browser restarts, leaving stale code (or
    // none) in the running window. The DOM unload event below does not satisfy
    // that protocol: it only fires when the window itself closes.
    try { window.addUnloadListener?.(cleanup); } catch {}
    instance.retire = cleanup;
  }

  // Written the moment this script is injected, not from start(). These
  // variables need only Services.prefs and the document element -- never
  // gBrowser -- and browser-delayed-startup-finished, which start() waits for,
  // fires well AFTER first paint. Deferring meant every window opened painting
  // the CSS fallbacks (10px roundness, the default tints) and then snapping to
  // the configured values. Doing it here is what actually makes the comment
  // above true.
  try { repairNumericPrefs(); } catch {}
  try { injectPrefVars(); } catch {}

  if (gBrowserInit?.delayedStartupFinished) start();
  else {
    // A pending observer is a live registration like any other: if a newer
    // copy of this script claims the window before delayed startup fires,
    // this one must not start. retire() drops the observer; the identity
    // check covers a copy claimed after it already fired.
    const obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) {
        Services.obs.removeObserver(obs, topic);
        if (window[INSTANCE_KEY] === instance) start();
      }
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
    instance.retire = () => {
      try { Services.obs.removeObserver(obs, "browser-delayed-startup-finished"); } catch {}
    };
  }
})();
