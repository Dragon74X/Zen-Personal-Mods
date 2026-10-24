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
  // Sine injects mod prefs as CSS variables, and current versions do it for
  // every chrome window as it opens rather than only after the settings
  // page or a reload (which is what made configured values appear only
  // after a reload on older ones). Two reasons this still writes its own:
  // that injection covers string prefs and dropdowns that ask for it, not
  // the integer prefs behind every numeric dropdown here; and it lands
  // after an async read of the mod store, where these are set synchronously
  // as the script loads, before first paint.
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
  let instantOverride = null;
  function restoreInstantUI() {
    if (!instantOverride) return;
    const { cfg, value, had } = instantOverride;
    if (cfg.instantAnimations === true) {
      if (had) cfg.instantAnimations = value;
      else delete cfg.instantAnimations;
    }
    instantOverride = null;
  }
  function syncInstantUI() {
    const cfg = window.Motion?.MotionGlobalConfig;
    if (!cfg) return;                      // not on this build; nothing to do
    let want = false;
    try { want = Services.prefs.getBoolPref(PREFIX + "instant-ui", false); } catch {}
    if (!want) { restoreInstantUI(); return; }
    if (!instantOverride) {
      instantOverride = { cfg, value: cfg.instantAnimations,
        had: Object.hasOwn(cfg, "instantAnimations") };
      cfg.instantAnimations = true;
    }
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


  // ---- keep the favicon through a load ---------------------------------
  // Firefox (tabbrowser.js) forgets a tab's icon URL as a new document
  // starts loading, and when the load ENDS with no icon offered yet, takes
  // the image off the tab outright -- no event -- so the page's real
  // favicon, arriving later, comes in as a fresh image: a blank, then a
  // decode, on every load. Putting the image back after the fact still
  // showed that frame. So the icon URL is put back the moment it is
  // forgotten, for as long as the load stays on the SITE the icon came
  // from: the load then ends with the icon still on, and the page's own
  // icon, usually the very same file, lands without a repaint. A
  // different site starts clean and never wears the previous icon.
  const lastHost = new WeakMap();             // browser -> host of its last location
  const keepIconOn = () => { try { return Services.prefs.getBoolPref("zen.theme.hide-tab-throbber", false); } catch { return false; } };
  const hostOf = (uri) => { try { return /^https?$/.test(uri?.scheme) ? uri.host : null; } catch { return null; } };
  const iconKeeper = {
    onLocationChange(browser, webProgress, request, location) {
      // Subframes report here too -- tabbrowser.js says so in as many
      // words. An ad frame navigating would otherwise overwrite the tab's
      // host, and the next same-site load would look like a new site and
      // lose the icon: the hold quietly stopped working on half the web.
      if (!webProgress?.isTopLevel) return;
      const prev = lastHost.get(browser), host = hostOf(location);
      lastHost.set(browser, host);
      if (!keepIconOn() || !host || host !== prev || browser.mIconURL) return;
      const img = gBrowser.getTabForBrowser(browser)?.getAttribute("image");
      if (img) browser.mIconURL = img;
    },
  };

  const APPEARANCE = "zzglass-saved.appearance";
  async function appearancePrefs() {
    // Only declared appearance settings, never an entire profile branch.
    const names = new Set();
    for (const mod of ["glassflow", "groupflow", "iconflow"]) {
      const rows = await (await fetch(`chrome://sine/content/zz-${mod}/preferences.json`)).json();
      for (const row of rows) {
        const name = row.property;
        if (!/^zz(?:glass|group|icon)\./.test(name || "") ||
            /\.ui\.|\.other\.|icon-rules|collapse-keep-last-used|neutralize-others/.test(name)) continue;
        if (["checkbox", "dropdown", "string", "text"].includes(row.type)) names.add(name);
      }
    }
    return names;
  }
  async function appearanceSnapshot() {
    const S = Services.prefs, values = {};
    for (const name of await appearancePrefs()) {
      const type = S.getPrefType(name), had = S.prefHasUserValue(name);
      const value = !had ? null : type === S.PREF_BOOL ? S.getBoolPref(name)
        : type === S.PREF_INT ? S.getIntPref(name) : S.getStringPref(name);
      // No embedded image/file URLs in an export, even in a CSS text setting.
      if (typeof value === "string" && /(?:url\s*\(|[\\/]|(?:https?|file|data|resource|chrome):)/i.test(value)) continue;
      values[name] = { had, type, value };
    }
    return { version: 1, values };
  }
  let appearanceNames = null;
  function savedAppearance() {
    try {
      const saved = JSON.parse(Services.prefs.getStringPref(APPEARANCE, "null"));
      if (saved?.version !== 1 || !saved.values || Array.isArray(saved.values) || !appearanceNames) return null;
      const S = Services.prefs;
      for (const [name, entry] of Object.entries(saved.values)) {
        if (!appearanceNames.has(name) || typeof entry?.had !== "boolean") return null;
        if (!entry.had) { if (entry.value !== null) return null; continue; }
        const v = entry.value;
        if (!(entry.type === S.PREF_BOOL && typeof v === "boolean" || entry.type === S.PREF_INT && Number.isInteger(v) ||
          entry.type === S.PREF_STRING && typeof v === "string" && !/(?:url\s*\(|[\\/]|(?:https?|file|data|resource|chrome):)/i.test(v))) return null;
      }
      return saved;
    } catch { return null; }
  }
  async function restoreAppearance() {
    const saved = savedAppearance(), S = Services.prefs;
    if (!saved || window[INSTANCE_KEY] !== instance) return false;
    for (const [name, entry] of Object.entries(saved.values)) {
      if (!entry.had) S.clearUserPref(name);
      else if (entry.type === S.PREF_BOOL) S.setBoolPref(name, entry.value);
      else if (entry.type === S.PREF_INT) S.setIntPref(name, entry.value);
      else S.setStringPref(name, entry.value);
    }
    return true;
  }
  appearancePrefs().then(names => { if (window[INSTANCE_KEY] === instance) appearanceNames = names; }).catch(() => {});
  const toolItems = new Set();
  function toolsMenu(event) {
    if (event.target.id !== "menu_ToolsPopup") return;
    for (const node of toolItems) node.remove(); toolItems.clear();
    const actions = [
      ["appearance-save", "Save appearance", async () => {
        const saved = await appearanceSnapshot();
        if (window[INSTANCE_KEY] === instance) Services.prefs.setStringPref(APPEARANCE, JSON.stringify(saved));
      }],
      ["appearance-restore", "Restore appearance", restoreAppearance],
      ["appearance-copy", "Copy appearance", appearanceSnapshot],
      ["mods-report-copy", "Copy Zen Mods Report", async () => {
        const { collectReport } = ChromeUtils.importESModule("chrome://sine/content/zz-glassflow/zen-mods-report.sys.mjs");
        return collectReport(window);
      }],
    ];
    for (const [id, label, action] of actions) {
      if (label === "Restore appearance" && !savedAppearance()) continue;
      const item = document.createXULElement("menuitem"); item.setAttribute("label", label); item.setAttribute("data-zz-action", "glassflow--" + id);
      item.addEventListener("command", async () => {
        try {
          if (window[INSTANCE_KEY] !== instance) return;
          const value = await action();
          if (window[INSTANCE_KEY] !== instance) return;
          if (label.startsWith("Copy ")) Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(JSON.stringify(value));
        } catch (error) { console.error("[Glassflow] Tools action failed", error); }
      });
      event.target.appendChild(item); toolItems.add(item);
    }
  }

  // One retargetable animation on the existing title; selection is never delayed.
  function tabMotion() {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const active = new Map();
    const enabled = () => !reduced.matches && Services.prefs.getBoolPref(PREFIX + "motion.enabled", false) &&
      !Services.prefs.getBoolPref(PREFIX + "instant-ui", false) && !window.Motion?.MotionGlobalConfig?.instantAnimations;
    function cancel() { for (const { animation } of active.values()) animation.cancel(); active.clear(); }
    function settle(label) {
      if (!label?.isConnected || !enabled()) return;
      const old = active.get(label), from = getComputedStyle(label).transform;
      const base = old?.base ?? (from === "none" ? "" : from);
      old?.animation.cancel();
      const style = getComputedStyle(document.documentElement);
      const duration = 90 + (parseFloat(style.getPropertyValue("--zzg-motion-ms")) || 150);
      const easing = style.getPropertyValue("--zzg-motion-ease").trim() || "cubic-bezier(.2,.85,.25,1)";
      const animation = label.animate([
        { transform: from, offset: 0, easing: "cubic-bezier(.2,.7,.3,1)" },
        { transform: `translateX(4px) ${base}`, offset: .24, easing: "cubic-bezier(.3,0,.35,1)" },
        { transform: `translateX(-1px) ${base}`, offset: .65, easing },
        { transform: base || "none", offset: 1 },
      ], { duration });
      active.set(label, { animation, base });
      animation.finished.then(() => { if (active.get(label)?.animation === animation) active.delete(label); }, () => {});
    }
    const selected = event => settle(event.target.querySelector?.(".tab-label"));
    const clicked = event => {
      if (event.button !== 0 || event.target.closest?.("button, toolbarbutton, input, menuitem, .zzgf-control")) return;
      const header = event.target.closest?.(".tab-group-label-container");
      if (header?.closest(":is(#navigator-toolbox, .zen-library-space-tabs)")) settle(header.querySelector(".tab-group-label"));
    };
    const changed = { observe: cancel };
    gBrowser.tabContainer.addEventListener("TabSelect", selected);
    window.addEventListener("click", clicked);
    reduced.addEventListener("change", cancel);
    Services.prefs.addObserver(PREFIX + "motion.", changed);
    Services.prefs.addObserver(PREFIX + "instant-ui", changed);
    return () => {
      cancel();
      gBrowser.tabContainer.removeEventListener("TabSelect", selected);
      window.removeEventListener("click", clicked);
      reduced.removeEventListener("change", cancel);
      Services.prefs.removeObserver(PREFIX + "motion.", changed);
      Services.prefs.removeObserver(PREFIX + "instant-ui", changed);
    };
  }

  function start() {
    const stopMotion = tabMotion();
    window.addEventListener("popupshowing", toolsMenu);
    syncInstantUI();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    try { syncOtherMods(); } catch (e) { console.error("[Glassflow] other mods failed:", e); }
    for (const branch of OTHER_WATCH) Services.prefs.addObserver(branch, otherModsObserver);
    try { gBrowser.addTabsProgressListener(iconKeeper); } catch (e) { console.error("[Glassflow] favicon hold failed to start:", e); }
    // The compact sidebar's blur sometimes stayed missing after the sidebar
    // slid in, until the page under it repainted. Redraw it once the slide
    // ends and on every tab switch: a filter that looks the same but is not,
    // for two frames (userChrome.css, [zzg-redraw]).
    // ponytail: a nudge, not a cause found; drop it if Firefox fixes stale backdrops.
    const toolbox = document.getElementById("navigator-toolbox");
    const redraw = e => {
      if (e.type === "transitionend" && (e.target !== toolbox || e.propertyName !== "translate")) return;
      toolbox?.setAttribute("zzg-redraw", "");
      requestAnimationFrame(() => requestAnimationFrame(() => toolbox?.removeAttribute("zzg-redraw")));
    };
    toolbox?.addEventListener("transitionend", redraw);
    gBrowser.tabContainer.addEventListener("TabSelect", redraw);
    // Sine cleanup and window unload can both run; retire this copy once.
    let retired = false;
    const cleanup = () => {
      if (retired) return;
      retired = true;
      stopMotion();
      window.removeEventListener("popupshowing", toolsMenu);
      for (const item of toolItems) item.remove(); toolItems.clear();
      window.removeEventListener("unload", cleanup);
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      for (const branch of OTHER_WATCH) try { Services.prefs.removeObserver(branch, otherModsObserver); } catch {}
      restoreInstantUI();
      try { gBrowser.removeTabsProgressListener(iconKeeper); } catch {}
      toolbox?.removeEventListener("transitionend", redraw);
      gBrowser.tabContainer.removeEventListener("TabSelect", redraw);
      toolbox?.removeAttribute("zzg-redraw");
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Registered with Sine, so an update re-injects this script live, no
    // restart: Sine calls cleanup, then loads the new file into the same
    // window, and the instance guard at the top retires whatever copy is
    // still here. Safe now that start() is contained and the top level
    // does nothing that can throw; the DOM unload listener above still
    // releases everything when the window closes.
    // Sine's own unload (disable, removal or update) also hands back other
    // mods' settings; closing a window does not. An update re-applies them.
    try { window.addUnloadListener?.(() => { cleanup(); if (!window.__zzSineWindowClosing && window.__zzSineUnloadReasons?.get("zz-glassflow") === "release") try { syncOtherMods(true); } catch {} }); } catch {}
    instance.retire = cleanup;
  }

  // ---- other mods ---------------------------------------------------------
  // Other mods' settings are ordinary prefs, so they can be set from here.
  // Each row under "Other mods" switches off the ones that double up with
  // something Glassflow or Groupflow draws, but only while that feature of
  // ours is on, and only settings the other mod has actually written. The
  // value found is saved and put back when the row or our feature goes off;
  // a setting changed by hand since then is left alone.
  const OTHER_MODS = {
    arc: [
      ["arc-macos-style-buttons", false, "zzglass.buttons.enabled"],
      ["arc-grayscale-unloaded-tabs", false, "zzglass.pending.enabled"],
      ["arc-folder-bg", false, "zzgroup.enabled"],
      ["arc.tab-groups-disable", 1, "zzgroup.enabled"],
    ],
    // Arc's blur and transparency settings that sit on the same surfaces as
    // ours. Its compact-sidebar blur is not here: Glassflow's Zen blur
    // replaces it on the panel itself.
    "arc-glass": [
      ["arc-compact-sidebar-bg", "transparent", "zzglass.sidebar.enabled"],
      ["arc-menu-opacity", false, "zzglass.overlays.enabled"],
    ],
    // Arc's workspace icon styles sit on the same switcher as ours; 3 is its
    // "Disable".
    "arc-workspaces": [["arc-workspace-style", 3, "zzglass.workspaces.enabled"]],
    "zen-fade": [["browser.tabs.fadeOutUnloadedTabs", false, "zzglass.pending.enabled"]],
    superpins: [
      ["uc.tabs.dim-type", "", "zzglass.pending.enabled"],
      ["uc.tabs.strikethrough-on-pending", false, "zzglass.pending.enabled"],
    ],
    "sidebar-expand": [["mod.autoexpand.fade_sleeping_tabs", false, "zzglass.pending.enabled"]],
    "transparent-zen": [["mod.sameerasw_zen_compact_sidebar_type", "0", "zen.theme.acrylic-sidebar"]],
  };
  const OTHER_SAVED = "zzglass-saved.other-mods";   // outside PREFIX: not a CSS variable
  // release: Glassflow is being disabled or removed, so every override goes back.
  function syncOtherMods(release = false) {
    if (!release && Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const S = Services.prefs;
    const get = name => {
      try {
        switch (S.getPrefType(name)) {
          case S.PREF_BOOL: return S.getBoolPref(name);
          case S.PREF_INT: return S.getIntPref(name);
          case S.PREF_STRING: return S.getStringPref(name);
        }
      } catch {}
      return undefined;
    };
    const set = (name, v) => typeof v === "boolean" ? S.setBoolPref(name, v)
      : typeof v === "number" ? S.setIntPref(name, v) : S.setStringPref(name, v);
    let saved = {};
    try { saved = JSON.parse(S.getStringPref(OTHER_SAVED, "{}")) || {}; } catch {}
    for (const [row, entries] of Object.entries(OTHER_MODS)) {
      const rowOn = S.getBoolPref(PREFIX + "other." + row, true);
      for (const [name, value, when] of entries) {
        const now = get(name), was = saved[name];
        try {
          if (!release && rowOn && S.getBoolPref(when, false)) {
            if (was || now === undefined || now === value) continue;
            saved[name] = { had: S.prefHasUserValue(name), v: now, applied: value };
            set(name, value);
          } else if (was) {
            if (now === was.applied) was.had ? set(name, was.v) : S.clearUserPref(name);
            delete saved[name];
          }
        } catch (e) { console.warn("[Glassflow] other mods:", name, e); }
      }
    }
    // A setting no longer on any row (Arc's compact-sidebar blur, which this
    // used to zero) goes back to what it was, unless changed by hand since.
    const listed = new Set(Object.values(OTHER_MODS).flat().map(([name]) => name));
    for (const [name, was] of Object.entries(saved)) {
      if (listed.has(name)) continue;
      try { if (get(name) === was.applied) was.had ? set(name, was.v) : S.clearUserPref(name); } catch {}
      delete saved[name];
    }
    try { S.setStringPref(OTHER_SAVED, JSON.stringify(saved)); } catch {}
  }
  const OTHER_WATCH = [PREFIX, "zzgroup.enabled", "zen.theme.acrylic-sidebar"];
  const otherModsObserver = { observe: () => syncOtherMods() };

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

  // Start the experimental motion opt-in once, including upgrades that seeded
  // the former On default. Later user choices survive reloads and updates.
  try {
    const S = Services.prefs, done = PREFIX + "migrated.motion-opt-in";
    if (!S.getBoolPref(done, false)) {
      S.setBoolPref(PREFIX + "motion.enabled", false);
      S.setBoolPref(done, true);
    }
  } catch {}

  // Preserve the existing sidebar switch once; keep the old value for rollback.
  // An explicit new native choice, including Off, always wins.
  try {
    const S = Services.prefs, done = PREFIX + "migrated.acrylic-sidebar";
    if (!S.getBoolPref(done, false)) {
      if (S.prefHasUserValue("zen.theme.acrylic-elements") && !S.prefHasUserValue("zen.theme.acrylic-sidebar")) {
        S.setBoolPref("zen.theme.acrylic-sidebar", S.getBoolPref("zen.theme.acrylic-elements"));
      }
      S.setBoolPref(done, true);
    }
  } catch {}

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
