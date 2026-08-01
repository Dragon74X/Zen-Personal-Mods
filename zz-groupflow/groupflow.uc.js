// ==UserScript==
// @name           Groupflow
// @description    Assigns each tab group's dominant-domain favicon to --zzgf-icon.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const bool = (k, d) => { try { return Services.prefs.getBoolPref("zzgroup." + k, d); } catch { return d; } };

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
