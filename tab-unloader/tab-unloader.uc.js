// ==UserScript==
// @name           Tab Unloader
// @description    Time-based tab unloading with explicit exclusions.
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
  const INSTANCE_KEY = "__zzunloadInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

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

  let timer = null;        // setInterval handle for the sweep loop
  let kick  = null;        // setTimeout handle for the first sweep after a reschedule
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
  // SessionStore records any field it considers changed -- which is far more
  // than "text the user would lose". Measured on a real profile: YouTube stores
  // its EMPTY comment textarea, Nexus stores 28 empty reply boxes,
  // about:preferences stores ~300 checkboxes and dropdowns. Every one of those
  // pinned a tab permanently under the old rule, which is why YouTube tabs
  // never unloaded no matter how long they sat.
  //
  // What separates real work from that noise is the VALUE, not the key. A
  // checkbox stores a boolean, a select stores an index or its option value, a
  // touched-but-empty textarea stores "". Only a non-empty string is something
  // a person typed and could lose.
  function meaningful(v) {
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.some(meaningful);
    // Objects cover nested shapes such as contenteditable's { innerHTML }.
    if (v && typeof v === "object") {
      // A <select> is stored as { selectedIndex, value }. Picking an option is
      // a choice, not text you would lose, and its option string would
      // otherwise read as typing -- which is how about:preferences ended up
      // looking like 300 fields of unsaved work.
      if ("selectedIndex" in v) return false;
      return Object.values(v).some(meaningful);
    }
    return false;                        // booleans and numbers are state, not text
  }

  function hasFields(fd) {
    if (!fd || typeof fd !== "object") return false;
    if (Object.values(fd.id || {}).some(meaningful)) return true;
    if (Object.values(fd.xpath || {}).some(meaningful)) return true;
    return Array.isArray(fd.children) && fd.children.some(hasFields);
  }

  function hasFormData(tab) {
    const ss = sessionStore();
    if (!ss) return false;
    try {
      return hasFields(JSON.parse(ss.getTabState(tab))?.formdata);
    } catch {
      return false;
    }
  }

  let formIgnore = null;
  function formExempt(tab) {
    if (formIgnore === null) {
      formIgnore = str("forms-ignore-urls", "").split(",")
        .map(s => s.trim()).filter(Boolean);
    }
    if (!formIgnore.length) return false;
    let url = "";
    try { url = tab.linkedBrowser?.currentURI?.spec ?? ""; } catch { return false; }
    return formIgnore.some(f => url.includes(f));
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
    if (bool("exclude-forms", true) && !formExempt(tab) && hasFormData(tab))
      return "unsubmitted form data";
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

  // Deferring on Zen's animation markers has to be BOUNDED. Zen sets
  // animating-background from more than one code path but removes it from only
  // one, and its own source calls the animation "stuck" as a known hazard
  // (desktop issue 9334) -- it races a timeout against it for exactly that
  // reason. An unbounded wait means one stuck attribute silently retires the
  // unloader for the rest of the session, which looks identical to the mod
  // being broken. Past the cap, sweep anyway: a little animation stutter is a
  // far better failure than never unloading again.
  const MAX_DEFER_MS = 10000;
  let deferredSince = 0;

  function sweep() {
    if (!bool("enabled", false)) return;
    // discardBrowser mid workspace-slide contributes to animation stutter;
    // Zen marks the slide on :root. Skip this tick, the interval retries.
    if (document.documentElement.hasAttribute("animating-background") ||
        document.documentElement.hasAttribute("swipe-gesture")) {
      if (!deferredSince) deferredSince = Date.now();
      const waited = Date.now() - deferredSince;
      if (waited < MAX_DEFER_MS) {
        note("sweep deferred: workspace animation in progress");
        return;
      }
      note(`animation marker stuck for ${Math.round(waited / 1000)}s; sweeping anyway`);
    }
    deferredSince = 0;
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
    // A pending first sweep from a previous reschedule must be dropped too,
    // or toggling settings quickly queues one sweep per toggle.
    if (kick) { clearTimeout(kick); kick = null; }
    if (!bool("enabled", false)) { note("disabled"); return; }
    const every = Math.max(2, num("check-seconds", 60));
    timer = setInterval(sweep, every * 1000);
    note(`running every ${every}s, idle threshold ${Math.max(5, num("idle-seconds", 1800))}s, ` +
      `cap ${num("max-per-sweep", 5)}/sweep, floor ${num("keep-loaded", 0)}`);
    // Do not make the user wait a whole interval to see the first result.
    kick = setTimeout(() => { kick = null; sweep(); }, 500);
  }

  const observer = {
    observe(_s, _t, data) {
      urlFilters = null;
      formIgnore = null;
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

    const cleanup = () => {
      try { Services.prefs.removeObserver(P, observer); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabSelect", onTabSelect); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabClose", onTabClose); } catch {}
      try { clearInterval(timer); timer = null; } catch {}
      try { clearTimeout(kick); kick = null; } catch {}
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
    start();
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
