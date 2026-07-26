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
  function num(key, dflt) {
    const full = P + key;
    try {
      const v = Services.prefs.getIntPref(full);
      if (Number.isFinite(v)) return v;
    } catch {}
    try {
      const v = parseFloat(Services.prefs.getStringPref(full));
      if (Number.isFinite(v)) return v;
    } catch {}
    return dflt;
  }
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

  function urlExcluded(tab) {
    const raw = str("exclude-urls", "").trim();
    if (!raw) return false;
    let url = "";
    try { url = tab.linkedBrowser?.currentURI?.spec ?? ""; } catch { return false; }
    return raw.split(",").map(s => s.trim()).filter(Boolean).some(f => url.includes(f));
  }

  function whyKeep(tab, now) {
    if (!tab || !tab.isConnected) return "gone";
    if (tab.closing) return "closing";
    if (tab.selected) return "active tab";
    if (tab.hasAttribute("pending")) return "already unloaded";
    if (!tab.linkedBrowser) return "no browser";

    const idleSec = Math.max(5, num("idle-seconds", 1800));
    const idleFor = (now - (tab.lastAccessed || now)) / 1000;
    if (idleFor < idleSec) return `idle ${Math.round(idleFor)}s of ${idleSec}s`;

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
    // gBrowser.tabs covers every workspace in this window; other windows
    // have their own copy of this script.
    try { return Array.from(gBrowser?.tabs ?? []); } catch { return []; }
  }

  function sweep() {
    if (!bool("enabled", false)) return;
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
    note(`running every ${every}s, idle threshold ${Math.max(5, num("idle-seconds", 1800))}s`);
  }

  const observer = {
    observe(_s, _t, data) {
      if (data === P + "enabled" || data === P + "check-seconds") reschedule();
    },
  };

  function start() {
    Services.prefs.addObserver(P, observer);
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
