// ==UserScript==
// @name           Groupflow
// @description    Assigns each tab group's dominant-domain favicon to --zzgf-icon.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window. instance.retire is the
  // pending startup observer until start() swaps in the real cleanup.
  const INSTANCE_KEY = "__zzgroupInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzgroup.";
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(PREFIX + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref(PREFIX + k, d); } catch { return d; } };
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

  // A favicon change or a session restore names one tab; only that tab's
  // group chain can have changed. Group lifecycle events name a group whose
  // members moved, so its old and new parents are both in play -- those
  // refresh everything. Anything without a usable target also refreshes
  // everything, so the fallback is always the full pass.
  let timer = null;
  const dirty = new Set();
  let everything = false;
  const schedule = (event) => {
    const t = event?.target;
    if (t?.tagName === "tab" && t.group) {
      for (let g = t.group; g?.tagName === "tab-group"; g = g.parentElement?.closest("tab-group") ?? null) dirty.add(g);
    } else {
      everything = true;
    }
    clearTimeout(timer);
    timer = setTimeout(refreshDirty, 500);
  };
  function refreshDirty() {
    if (everything) { everything = false; dirty.clear(); refreshAll(); return; }
    if (!bool("favicons", true)) { dirty.clear(); return; }
    for (const g of dirty) if (g.isConnected && !g.isZenFolder) refreshGroup(g);
    dirty.clear();
  }

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
      dirty.clear();
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
