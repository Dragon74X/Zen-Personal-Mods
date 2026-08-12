// ==UserScript==
// @name           Groupflow
// @description    Assigns each tab group's dominant-domain favicon to --zzgf-icon.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const bool = (k, d) => { try { return Services.prefs.getBoolPref("zzgroup." + k, d); } catch { return d; } };

const PREFIX = "zzgroup.";
  // ---- pref variables at startup -----------------------------------------
  // Sine injects string and number prefs as CSS variables, but not until
  // something (the settings page, a mod reload) triggers it -- measured on a
  // fresh launch, every one of them was absent while the sheet itself was
  // loaded and working. So the CSS ran on its fallbacks and configured
  // values only appeared after a reload. These are written here instead,
  // from the prefs themselves, so they exist before first paint.
  //
  // Naming matches Sine's own convention exactly: "zzgroup.".foo-bar becomes
  // --"zzgroup."-foo-bar, dots to dashes. Booleans are skipped -- those are read
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

  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
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

  // Dominant base host among the group's DIRECT tabs; subgroups compute
  // their own, so "Youtube > Creator" shows youtube's icon on the parent
  // and (usually the same) icon on the child from its own members.
  function refreshGroup(g) {
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
    g.style.setProperty("--zzgf-icon", `url("page-icon:https://${host}/")`);
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

  const EVENTS = ["TabGroupCreate", "TabGrouped", "TabUngrouped",
                  "TabGroupRemoved", "SSTabRestored"];

  function start() {
    injectPrefVars();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    for (const ev of EVENTS) window.addEventListener(ev, schedule, true);
    // Domain of an existing member can change by navigation; a light
    // periodic pass covers that without watching every location change.
    const interval = setInterval(() => { if (bool("favicons", true)) refreshAll(); }, 60000);
    const boot = setTimeout(refreshAll, 2000);

    // This script is injected per window and lives as long as the window
    // does, so every registration has to be released here or it leaks
    // across window open/close cycles. The capture flag must match the
    // one used to add, or removeEventListener silently does nothing.
    window.addEventListener("unload", () => {
      for (const ev of EVENTS) window.removeEventListener(ev, schedule, true);
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      clearTimeout(timer);
      clearTimeout(boot);
      clearInterval(interval);
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
