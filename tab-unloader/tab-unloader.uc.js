// ==UserScript==
// @name           Tab Unloader
// @description    Time-based tab unloading with explicit exclusions.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const P = "zzunload.";

  // Sine may store a pref as string or int depending on the control type,
  // so every read is type-tolerant rather than assuming.
  // No getPrefType: Services.prefs.PREF_INT is an interface constant and is
  // not guaranteed to be reachable on the branch object. If it resolves to
  // undefined the switch falls through to the default and every value
  // silently becomes the fallback -- which is why 1.1 behaved as if the
  // idle threshold were 1800 no matter what was typed. Try both reads.
  // Types are CHECKED, never guessed by attempting reads. Calling
  // getIntPref on a string pref (or getStringPref on a bool) throws
  // NS_ERROR_UNEXPECTED, and Firefox logs every one even when it is
  // caught -- and num() runs per tab per sweep, so that logs continuously.
  function prefNum(full, d) {
    const S = Services.prefs;
    let t;
    try { t = S.getPrefType(full); } catch { return d; }
    try {
      if (t === S.PREF_INT) {
        const v = S.getIntPref(full);
        return Number.isFinite(v) ? v : d;
      }
      if (t === S.PREF_STRING) {
        const v = parseFloat(S.getStringPref(full));
        return Number.isFinite(v) ? v : d;
      }
    } catch {}
    return d;
  }

  function num(key, dflt) { return prefNum(P + key, dflt); }
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(P + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref(P + k, d); } catch { return d; } };

  let timer = null;
  let log = [];
  let SS = null;          // SessionStore, resolved once
  let ssWarned = false;

  function note(msg) {
    log.push(`${new Date().toLocaleTimeString()}  ${msg}`);
    if (log.length > 300) log.shift();
    if (bool("debug", false)) console.log("[TabUnloader]", msg);
  }

  function sessionStore() {
    if (SS) return SS;
    if (typeof SessionStore !== "undefined") { SS = SessionStore; return SS; }
    try {
      SS = ChromeUtils.importESModule(
        "resource:///modules/sessionstore/SessionStore.sys.mjs"
      ).SessionStore;
    } catch (e) {
      if (!ssWarned) {
        ssWarned = true;
        note(`SessionStore unavailable (${e}); form-data check disabled`);
      }
      SS = null;
    }
    return SS;
  }

  // Returns true only when we positively found stored form data.
  // If SessionStore is missing the check is skipped rather than treating
  // every tab as dirty -- doing that kept every tab loaded in v1.0.
  function hasFormData(tab) {
    const ss = sessionStore();
    if (!ss) return false;
    try {
      const state = JSON.parse(ss.getTabState(tab));
      const fd = state && state.formdata;
      return !!fd && Object.keys(fd).length > 0;
    } catch {
      return false;
    }
  }

  let urlFilters = null;   // parsed once; pref observer resets it
  function urlExcluded(tab) {
    if (urlFilters === null) {
      urlFilters = str("exclude-urls", "").split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!urlFilters.length) return false;
    let url = "";
    try { url = tab.linkedBrowser?.currentURI?.spec ?? ""; } catch { return false; }
    return urlFilters.some(f => url.includes(f));
  }

  // ---- last tab per workspace --------------------------------------------
  // Switching workspaces leaves the tab you were on selected in ITS
  // workspace, so remembering the last tab selected in each workspace is
  // exactly "the one you switched away from". Recorded on TabSelect, and
  // dropped on TabClose so a closed tab cannot pass its protection on --
  // the anchor is a specific tab, never a slot that something else fills.
  const anchors = new Map();   // workspace id -> tab

  const workspaceOf = (tab) =>
    tab?.getAttribute?.("zen-workspace-id") ||
    tab?.closest?.("zen-workspace")?.id || null;

  function onTabSelect(event) {
    const tab = event.target;
    const ws = workspaceOf(tab);
    if (ws) anchors.set(ws, tab);
  }

  function onTabClose(event) {
    const tab = event.target;
    for (const [ws, held] of anchors) {
      if (held === tab) anchors.delete(ws);
    }
  }

  function isWorkspaceAnchor(tab) {
    const ws = workspaceOf(tab);
    if (!ws) return false;
    const held = anchors.get(ws);
    if (held && !held.isConnected) { anchors.delete(ws); return false; }
    return held === tab;
  }

  function whyKeep(tab, now) {
    if (!tab || !tab.isConnected) return "gone";
    if (tab.closing) return "closing";
    if (tab.selected) return "active tab";
    if (tab.hasAttribute("pending")) return "already unloaded";
    if (!tab.linkedBrowser) return "no browser";
    if (tab.hasAttribute("zen-empty-tab")) return "empty tab";
    if (tab.hasAttribute("_forZenEmptyTab")) return "empty tab";

    const idleSec = Math.max(5, num("idle-seconds", 1800));
    const idleFor = (now - (tab.lastAccessed || now)) / 1000;
    if (idleFor < idleSec) return `idle ${Math.round(idleFor)}s of ${idleSec}s`;

    if (bool("exclude-workspace-anchor", true) && isWorkspaceAnchor(tab))
      return "last tab in its workspace";
    if (bool("exclude-audio", true) && tab.hasAttribute("soundplaying")) return "playing audio";
    if (bool("exclude-attention", true) && tab.hasAttribute("attention")) return "wants attention";
    if (bool("exclude-sharing", true) && tab.hasAttribute("sharing")) return "sharing camera/mic/screen";
    if (bool("exclude-pip", true) && tab.hasAttribute("pictureinpicture")) return "picture-in-picture";
    if (bool("exclude-essentials", true) && tab.getAttribute("zen-essential") === "true") return "essential";
    if (bool("exclude-pinned", true) && tab.pinned) return "pinned";
    if (bool("exclude-glance", true) && tab.hasAttribute("zen-glance-tab")) return "glance";
    if (bool("exclude-split", true) && tab.hasAttribute("zen-split")) return "split view";
    if (bool("exclude-forms", true) && hasFormData(tab)) return "unsubmitted form data";
    if (urlExcluded(tab)) return "url excluded";

    return null;
  }

  function allTabs() {
    // gBrowser.tabs does NOT cover other workspaces on Zen: measured on a
    // real profile it reported 13 tabs while the document held 56
    // .tabbrowser-tab elements. The DOM query sees every workspace in this
    // window, open or not; union both, de-duplicated. Other windows run
    // their own copy of this script (Sine injects per window), so they
    // sweep themselves -- enumerating windows here would double-sweep.
    const set = new Set();
    try { for (const t of gBrowser?.tabs ?? []) set.add(t); } catch {}
    try { for (const t of document.querySelectorAll(".tabbrowser-tab")) set.add(t); } catch {}
    return [...set];
  }

  function sweep() {
    if (!bool("enabled", false)) return;
    // discardBrowser mid workspace-slide contributes to animation stutter;
    // Zen marks the slide on :root. Skip this tick, the interval retries.
    if (document.documentElement.hasAttribute("animating-background") ||
        document.documentElement.hasAttribute("swipe-gesture")) {
      note("sweep deferred: workspace animation in progress");
      return;
    }
    const now = Date.now();
    const tabs = allTabs();
    const eligible = tabs.filter(t => whyKeep(t, now) === null);

    if (!eligible.length) { note(`sweep: 0 of ${tabs.length} eligible`); return; }

    eligible.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    const cap = num("max-per-sweep", 5);
    let budget = cap > 0 ? cap : eligible.length;

    const floor = num("keep-loaded", 0);
    if (floor > 0) {
      const loaded = tabs.filter(t => !t.hasAttribute("pending") && !t.closing).length;
      budget = Math.min(budget, Math.max(0, loaded - floor));
    }

    if (budget < eligible.length) {
      note(`throttled: ${eligible.length} eligible but budget ${budget} ` +
        `(cap ${cap || "none"}, floor ${floor || "none"}) -- raise 'Unload at most' to go faster`);
    }

    let done = 0;
    for (const tab of eligible) {
      if (done >= budget) break;
      try { gBrowser.discardBrowser(tab); done++; note(`unloaded: ${tab.label}`); }
      catch (e) { note(`failed on ${tab.label}: ${e}`); }
    }
    note(`sweep: unloaded ${done} of ${eligible.length} eligible, ${tabs.length} total`);
  }

  function reschedule() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!bool("enabled", false)) { note("disabled"); return; }
    const every = Math.max(2, num("check-seconds", 60));
    timer = setInterval(sweep, every * 1000);
    note(`running every ${every}s, idle threshold ${Math.max(5, num("idle-seconds", 1800))}s, ` +
      `cap ${num("max-per-sweep", 5)}/sweep, floor ${num("keep-loaded", 0)}`);
    // Do not make the user wait a whole interval to see the first result.
    setTimeout(sweep, 500);
  }

  const observer = {
    observe(_s, _t, data) {
      urlFilters = null;
      if (data === P + "enabled" || data === P + "check-seconds") reschedule();
    },
  };

  function start() {
    Services.prefs.addObserver(P, observer);
    // Seed from the tab that is already selected, so the current
    // workspace is protected before any switch happens.
    try { if (gBrowser.selectedTab) onTabSelect({ target: gBrowser.selectedTab }); } catch {}
    gBrowser.tabContainer.addEventListener("TabSelect", onTabSelect);
    gBrowser.tabContainer.addEventListener("TabClose", onTabClose);
    reschedule();

    window.TabUnloader = {
      sweepNow: sweep,
      status() {
        const now = Date.now();
        return allTabs().map(t => ({
          title: t.label,
          idleSec: Math.round((now - (t.lastAccessed || now)) / 1000),
          verdict: whyKeep(t, now) ?? "ELIGIBLE",
        }));
      },
      // Which tab is currently protected in each workspace.
      anchors: () => Object.fromEntries(
        [...anchors].map(([ws, t]) => [ws, t?.label ?? "(gone)"])),
      settings: () => ({
        enabled: bool("enabled", false),
        idleSeconds: num("idle-seconds", 1800),
        checkSeconds: num("check-seconds", 60),
        maxPerSweep: num("max-per-sweep", 5),
        keepLoaded: num("keep-loaded", 0),
        sessionStore: !!sessionStore(),
        running: !!timer,
      }),
      log: () => log.slice(),
    };
    note("loaded");

    window.addEventListener("unload", () => {
      try { Services.prefs.removeObserver(P, observer); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabSelect", onTabSelect); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabClose", onTabClose); } catch {}
      try { clearTimeout(timer); clearInterval(timer); } catch {}
    }, { once: true });
  }

  if (gBrowserInit?.delayedStartupFinished) {
    start();
  } else {
    const obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) {
        Services.obs.removeObserver(obs, topic);
        start();
      }
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
  }
})();
