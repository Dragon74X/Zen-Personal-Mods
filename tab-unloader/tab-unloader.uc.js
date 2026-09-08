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

  // Two comma-separated URL-fragment lists, parsed once each; the pref
  // observer drops the cache on any change.
  const lists = {};
  function urlMatches(tab, prefKey) {
    const list = lists[prefKey] ??= str(prefKey, "").split(",").map(s => s.trim()).filter(Boolean);
    if (!list.length) return false;
    let url = "";
    try { url = tab.linkedBrowser?.currentURI?.spec ?? ""; } catch { return false; }
    return list.some(f => url.includes(f));
  }
  const formExempt = (tab) => urlMatches(tab, "forms-ignore-urls");
  const urlExcluded = (tab) => urlMatches(tab, "exclude-urls");

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

  // whyKeep was reading a dozen prefs PER TAB. On a 73-tab window that is
  // roughly nine hundred pref reads per sweep to decide something that does
  // not change between tabs. Read them once and pass them down.
  function sweepConfig() {
    return {
      idleSec: Math.max(5, num("idle-seconds", 1800)),
      anchor: bool("exclude-workspace-anchor", true),
      audio: bool("exclude-audio", true),
      attention: bool("exclude-attention", true),
      sharing: bool("exclude-sharing", true),
      pip: bool("exclude-pip", true),
      essentials: bool("exclude-essentials", true),
      pinned: bool("exclude-pinned", true),
      glance: bool("exclude-glance", true),
      split: bool("exclude-split", true),
      forms: bool("exclude-forms", true),
    };
  }

  function whyKeep(tab, now, cfg = sweepConfig()) {
    if (!tab || !tab.isConnected) return "gone";
    if (tab.closing) return "closing";
    if (tab.selected) return "active tab";
    if (tab.hasAttribute("pending")) return "already unloaded";
    if (!tab.linkedBrowser) return "no browser";
    if (tab.hasAttribute("zen-empty-tab")) return "empty tab";
    if (tab.hasAttribute("_forZenEmptyTab")) return "empty tab";

    const idleFor = (now - (tab.lastAccessed || now)) / 1000;
    if (idleFor < cfg.idleSec) return `idle ${Math.round(idleFor)}s of ${cfg.idleSec}s`;

    if (cfg.anchor && isWorkspaceAnchor(tab)) return "last tab in its workspace";
    if (cfg.audio && tab.hasAttribute("soundplaying")) return "playing audio";
    if (cfg.attention && tab.hasAttribute("attention")) return "wants attention";
    if (cfg.sharing && tab.hasAttribute("sharing")) return "sharing camera/mic/screen";
    if (cfg.pip && tab.hasAttribute("pictureinpicture")) return "picture-in-picture";
    if (cfg.essentials && tab.getAttribute("zen-essential") === "true") return "essential";
    if (cfg.pinned && tab.pinned) return "pinned";
    if (cfg.glance && tab.hasAttribute("zen-glance-tab")) return "glance";
    if (cfg.split && tab.hasAttribute("zen-split")) return "split view";
    // Last on purpose: this is the only check that costs real work.
    // SessionStore.getTabState() serialises the tab's whole state to JSON.
    if (cfg.forms && !formExempt(tab) && hasFormData(tab))
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

    const cap = num("max-per-sweep", 5);
    let budget = cap > 0 ? cap : tabs.length;

    const floor = num("keep-loaded", 0);
    if (floor > 0) {
      const loaded = tabs.filter(t => !t.hasAttribute("pending") && !t.closing).length;
      budget = Math.min(budget, Math.max(0, loaded - floor));
    }
    if (budget <= 0) { note(`sweep: budget 0 (floor ${floor}); nothing to do`); return; }

    // Oldest first, then stop as soon as the budget is filled.
    //
    // This used to run whyKeep() over EVERY tab, sort the survivors, and
    // unload the oldest few -- so on a 73-tab window it paid for 73 full
    // evaluations, including 73 SessionStore.getTabState() serialisations,
    // to unload at most five tabs. Sorting by age first and evaluating
    // lazily gives exactly the same tabs: the oldest N eligible is the same
    // set whether you filter then sort, or sort then take the first N that
    // pass. It just stops doing the work once it has them.
    const cfg = sweepConfig();
    const byAge = tabs
      .filter(t => t && !t.selected && !t.closing && !t.hasAttribute("pending"))
      .sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    let done = 0, examined = 0;
    for (const tab of byAge) {
      if (done >= budget) break;
      examined++;
      if (whyKeep(tab, now, cfg) !== null) continue;
      try { gBrowser.discardBrowser(tab); done++; note(`unloaded: ${tab.label}`); }
      catch (e) { note(`failed on ${tab.label}: ${e}`); }
    }

    if (done >= budget && examined < byAge.length) {
      note(`throttled at ${budget} (cap ${cap || "none"}, floor ${floor || "none"}) ` +
        `-- raise 'Unload at most' to go faster`);
    }
    note(`sweep: unloaded ${done}, examined ${examined} of ${byAge.length} candidates, ` +
      `${tabs.length} tabs total`);
  }

  function reschedule(firstDelay = 500) {
    if (timer) { clearInterval(timer); timer = null; }
    // A pending first sweep from a previous reschedule must be dropped too,
    // or toggling settings quickly queues one sweep per toggle.
    if (kick) { clearTimeout(kick); kick = null; }
    if (!bool("enabled", false)) { note("disabled"); return; }
    const every = Math.max(2, num("check-seconds", 60));
    timer = setInterval(sweep, every * 1000);
    note(`running every ${every}s, idle threshold ${Math.max(5, num("idle-seconds", 1800))}s, ` +
      `cap ${num("max-per-sweep", 5)}/sweep, floor ${num("keep-loaded", 0)}`);
    // Do not make the user wait a whole interval to see the first result --
    // but do not land the first sweep in the middle of session restore
    // either. At startup Zen is still rebuilding tabs, and a sweep there
    // competes with it for the main thread at the worst possible moment.
    // A settings change still gets near-instant feedback.
    kick = setTimeout(() => { kick = null; sweep(); }, Math.max(0, firstDelay));
  }

  const observer = {
    observe(_s, _t, data) {
      for (const k of Object.keys(lists)) delete lists[k];
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
    // Startup: hold the first sweep well clear of session restore.
    reschedule(Math.max(0, num("first-sweep-ms", 15000)));

    window.TabUnloader = {
      sweepNow: sweep,
      status() {
        const now = Date.now();
        const cfg = sweepConfig();
        return allTabs().map(t => ({
          title: t.label,
          idleSec: Math.round((now - (t.lastAccessed || now)) / 1000),
          verdict: whyKeep(t, now, cfg) ?? "ELIGIBLE",
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
  const MOD_ID = "zz-tab-unloader";
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
      if (!name || !name.startsWith(P) || value === undefined || value === null) continue;
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

  // Seed before starting where possible. start() reads prefs immediately, so
  // a mod that starts first would run one session on the wrong fallbacks.
  seedDefaults().catch(() => {});

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
      console.error("[TabUnloader] failed to start:", e);
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
