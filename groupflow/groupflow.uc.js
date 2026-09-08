// ==UserScript==
// @name           Groupflow
// @description    Assigns each tab group's dominant-domain favicon to --zzgf-icon.
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
  const INSTANCE_KEY = "__zzgroupInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const bool = (k, d) => { try { return Services.prefs.getBoolPref("zzgroup." + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref("zzgroup." + k, d); } catch { return d; } };

  const PREFIX = "zzgroup.";
  // ---- pref variables at startup -----------------------------------------
  // Sine injects string and number prefs as CSS variables, but not until
  // something (the settings page, a mod reload) triggers it -- measured on a
  // fresh launch, every one of them was absent while the sheet itself was
  // loaded and working. So the CSS ran on its fallbacks and configured
  // values only appeared after a reload. These are written here instead,
  // from the prefs themselves, so they exist before first paint.
  //
  // Naming matches Sine's own convention exactly: zzgroup.foo-bar becomes
  // --zzgroup-foo-bar, dots to dashes. Booleans are skipped -- those are read
  // with -moz-pref(), never as variables.
  function injectPrefVars() {
    let names = [];
    try { names = Services.prefs.getBranch(PREFIX).getChildList(""); } catch { return; }
    const root = document.documentElement;
    for (const leaf of names) {
      const full = PREFIX + leaf;
      const value = readPrefValue(full);
      if (value === null) continue;
      try { root.style.setProperty("--" + full.replace(/\./g, "-"), value); } catch {}
    }
  }

  // The type is CHECKED, never guessed by attempting reads: calling
  // getStringPref on a boolean throws NS_ERROR_UNEXPECTED, and Firefox logs
  // every one of those even when caught -- which floods the console with
  // "failed to read pref" for every boolean in the branch. Booleans are
  // skipped; they are read with -moz-pref(), never as variables.
  function readPrefValue(full) {
    const P = Services.prefs;
    let type;
    try { type = P.getPrefType(full); } catch { return null; }
    try {
      if (type === P.PREF_STRING) {
        const v = P.getStringPref(full);
        return v === "" ? null : v;
      }
      if (type === P.PREF_INT) return String(P.getIntPref(full));
    } catch {}
    return null;
  }

  // Sine only stores a dropdown as a number when the pref declares
  // value: "number"; without it, convertValueType() hands back the raw string
  // from the menulist. The corner dropdowns shipped without that key, so the
  // moment one was CHANGED its pref flipped from int to string -- and
  // @media (-moz-pref("name", 1)) never matches a string, so every corner
  // setting silently stopped applying while still reading correctly in the
  // settings panel. The declarations are fixed; these values were already
  // written, and a pref keeps its type until it is cleared.
  const NUMERIC_PREFS = ["corner.mode", "corner.radius-source", "corner.radius-mode"];

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

  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
      iconRules = null;                    // reparsed on the next refresh
      if (data === PREFIX + "icon-rules") schedule();
      const name = "--" + data.replace(/\./g, "-");
      const value = readPrefValue(data);
      try {
        if (value === null) document.documentElement.style.removeProperty(name);
        else document.documentElement.style.setProperty(name, value);
      } catch {}
    },
  };


  function hostOf(tab) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      return uri && /^https?$/.test(uri.scheme) ? uri.host : null;
    } catch { return null; }
  }

  // ---- icon rules ---------------------------------------------------------
  // The automatic icon is the group's dominant domain, which is right for
  // "Nexusmods" and useless for "Crimson Desert" -- every game on a mod site
  // shares that site's favicon, so every subgroup under it looks identical.
  // A rule names the group and gives it an icon of its own.
  //
  //   crimson desert = file:///C:/icons/crimson.png
  //   dawnwalker     = file:///C:/icons/dawnwalker.png
  //   nexusmods      = nexusmods.com
  //
  // A bare host on the right means "that site's favicon", which Firefox
  // serves from its own store with no network request. Anything carrying a
  // scheme is used as written, so file:, data: and chrome: all work -- and
  // https: works too, at the cost of an actual fetch.
  let iconRules = null;

  const normName = (s) => s.trim().toLowerCase().replace(/\s*\/\s*/g, "/");

  function parseIconRules() {
    if (iconRules) return iconRules;
    iconRules = [];
    for (const line of str("icon-rules", "").split(/[\n;]/)) {
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const name = normName(line.slice(0, eq));
      const value = line.slice(eq + 1).trim();
      // A quote would close the url() this ends up inside; a rule is not
      // worth breaking the whole sheet over, so such a value is dropped.
      if (!name || !value || /["'()\\]/.test(value)) continue;
      iconRules.push([name, /^[a-z][a-z0-9+.\-]*:/i.test(value)
        ? value
        : `page-icon:https://${value.replace(/^\/+|\/+$/g, "")}/`]);
    }
    return iconRules;
  }

  // Both the full path and the leaf are matchable, so "Crimson Desert" hits
  // wherever it sits while "Youtube / Crimson Desert" can single one out when
  // the same leaf name appears under two parents.
  function pathOf(g) {
    const out = [];
    for (let cur = g; cur?.tagName === "tab-group";
         cur = cur.parentElement?.closest("tab-group") ?? null) {
      out.unshift((cur.label ?? "").trim());
    }
    return out;
  }

  function ruledIcon(g) {
    const rules = parseIconRules();
    if (!rules.length) return null;
    const path = pathOf(g);
    if (!path.length) return null;
    const full = normName(path.join("/"));
    const leaf = normName(path.at(-1));
    for (const [name, url] of rules) if (name === full || name === leaf) return url;
    return null;
  }

  // Dominant base host among the group's DIRECT tabs; subgroups compute
  // their own, so "Youtube > Creator" shows youtube's icon on the parent
  // and (usually the same) icon on the child from its own members.
  function refreshGroup(g) {
    const ruled = ruledIcon(g);
    if (ruled) { setIcon(g, `url("${ruled}")`); return; }
    const counts = new Map();
    for (const el of g.groupContainer?.children ?? []) {
      if (!el.matches?.("tab")) continue;
      const h = hostOf(el);
      if (h) counts.set(h, (counts.get(h) || 0) + 1);
    }
    // A parent whose direct children are all subgroups: borrow the first
    // subgroup's members so the parent still gets an icon.
    if (!counts.size) {
      for (const el of g.groupContainer?.children ?? []) {
        if (!gBrowser.isTabGroup?.(el)) continue;
        for (const t of el.tabs ?? []) {
          const h = hostOf(t);
          if (h) counts.set(h, (counts.get(h) || 0) + 1);
        }
        if (counts.size) break;
      }
    }
    if (!counts.size) { g.style.removeProperty("--zzgf-icon"); return; }
    const host = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // page-icon: is Firefox's own favicon protocol, served from the local
    // favicon store -- no network fetch happens here.
    setIcon(g, `url("page-icon:https://${host}/")`);
  }

  // refreshAll runs half a second after any tab's favicon changes -- so
  // after every page load -- and rewrote every group's icon each time.
  // Writing an inline style invalidates style on that element even when
  // the value is identical, and these groups carry the glass effects. In
  // the steady state nothing has changed, so nothing is written.
  function setIcon(g, value) {
    if (g.style.getPropertyValue("--zzgf-icon") !== value) g.style.setProperty("--zzgf-icon", value);
  }

  function refreshAll() {
    if (!bool("favicons", true)) return;
    const seen = new Set();
    try { for (const g of gBrowser.tabGroups) seen.add(g); } catch {}
    try { for (const g of document.querySelectorAll("tab-group")) seen.add(g); } catch {}
    for (const g of seen) {
      if (g.tagName !== "tab-group" || g.isZenFolder || g.hasAttribute("split-view-group")) continue;
      refreshGroup(g);
    }
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refreshAll, 500); };

  // ZenTabIconChanged is patched into tabbrowser.setIcon(), so it fires for
  // EVERY tab whose favicon is set, and it bubbles -- which is precisely the
  // signal this mod used to poll for. A member navigating to another domain
  // gets a new favicon, which is the only reason the icon needs recomputing.
  // TabGroupUpdate and TabGroupRemovedFromDOM are Zen's own group events; both
  // change what a group contains and neither was being watched.
  const EVENTS = ["TabGroupCreate", "TabGrouped", "TabUngrouped",
                  "TabGroupRemoved", "TabGroupRemovedFromDOM", "TabGroupUpdate",
                  "SSTabRestored", "ZenTabIconChanged"];

  function start() {
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    for (const ev of EVENTS) window.addEventListener(ev, schedule, true);

    window.Groupflow = {
      // Recompute every group icon now.
      refresh: refreshAll,
      // Which group would get which icon, and from where. Reads only.
      explain() {
        const out = [];
        for (const g of document.querySelectorAll("tab-group")) {
          if (g.isZenFolder || g.hasAttribute("split-view-group")) continue;
          out.push({
            group: (g.label ?? "").trim(),
            icon: g.style.getPropertyValue("--zzgf-icon") || "(none)",
          });
        }
        console.log(out);
        return out;
      },
    };
    const boot = setTimeout(refreshAll, 2000);

    // This script is injected per window and lives as long as the window
    // does, so every registration has to be released here or it leaks
    // across window open/close cycles. The capture flag must match the
    // one used to add, or removeEventListener silently does nothing.
    const cleanup = () => {
      try { delete window.Groupflow; } catch {}
      for (const ev of EVENTS) window.removeEventListener(ev, schedule, true);
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      clearTimeout(timer);
      clearTimeout(boot);
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Deliberately NOT registered with Sine's addUnloadListener().
    //
    // Handing Sine this callback buys hot-reload on update: triggerUnloadListener()
    // runs it, reports the script unloaded, and rebuildMods() injects the new
    // file. Without it Sine finds the null marker it registered itself, reports
    // "still loaded", and leaves the running mod alone -- an update takes effect
    // on the next restart, which is exactly what Sine's own toast tells you to
    // do ("A mod utilizing JS has been updated. For it to work properly,
    // restart your browser").
    //
    // The cost was not worth it. Registering turned every mod update into a
    // teardown-and-reinject of every script in every window, and each of those
    // re-runs the startup gate below. One of them landed wrong and Tab Router,
    // Tab Unloader and Zen Turbo were all left injected but never started, with
    // nothing logged. The gate is now backstopped, but re-injecting on a
    // schedule to gain something Sine does not even promise is a bad trade.
    //
    // The DOM unload listener above is the one that matters: it fires when the
    // window closes, which is when these registrations actually need releasing.
    instance.retire = cleanup;
  }

  // Written the moment this script is injected, not from start(). These
  // variables need only Services.prefs and the document element -- never
  // gBrowser -- and browser-delayed-startup-finished, which start() waits for,
  // fires well AFTER first paint. Deferring meant every window opened painting
  // the CSS fallbacks (10px roundness, the default tints) and then snapping to
  // the configured values. Doing it here is what actually makes the comment
  // above true.
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
  const MOD_ID = "zz-groupflow";
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

  try { repairNumericPrefs(); } catch {}
  try { injectPrefVars(); } catch {}
  // Seeding is a file read, so it cannot happen before first paint like the
  // line above. Re-inject after it, and only if it actually wrote something,
  // so a profile that already has its prefs pays nothing.
  seedDefaults().then((wrote) => { if (wrote) injectPrefVars(); }).catch(() => {});


  // ---- retired feature cleanup --------------------------------------------
  // Automatic image lookup is gone, and its cache was built out of browsing: site-and-subject pairs matched out of history.
  // Leaving that sitting in prefs.js after the feature that justified it has
  // been removed is not acceptable, so it is cleared once. Harmless when the
  // pref was never written.
  try { Services.prefs.clearUserPref("zzgroup.icon-cache"); } catch {}

  // ---- startup ------------------------------------------------------------
  // browser-delayed-startup-finished is a ONE-SHOT notification, and waiting
  // on it alone is not safe. Sine does not always inject through its
  // window-open path: a rebuildMods() injects into whatever windows already
  // exist, so this script can land in a window where gBrowserInit is not
  // reachable yet AND the notification has already fired. The observer then
  // waits for an event that will never come again, and the mod sits loaded,
  // parsed, and never started for the life of the window -- no error, no log
  // line, nothing to notice.
  //
  // That is not hypothetical. It is how Tab Router, Tab Unloader and Zen Turbo
  // all ended up injected with their globals never defined, while Glassflow --
  // whose pref-variable injection runs outside start() -- looked fine.
  //
  // So the observer is kept for the fast path and a bounded poll backs it up.
  // Whichever fires first wins; startOnce() makes the other a no-op.
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
    // Contained on purpose. Sine's window-open loop calls
    // loadSubScriptWithOptions for each mod in turn and does NOT wrap it, so a
    // throw that escapes this script propagates into that loop and every mod
    // queued after it is silently never injected. That is not hypothetical:
    // one missing function in Glassflow -- the first mod loaded -- left Tab
    // Router, Tab Unloader and Zen Turbo uninjected, which read as three
    // unrelated mods breaking at once. A broken mod should break only itself,
    // and should say so rather than failing quietly.
    try { start(); } catch (e) {
      console.error("[Groupflow] failed to start:", e);
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
