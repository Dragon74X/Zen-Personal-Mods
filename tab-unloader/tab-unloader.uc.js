// ==UserScript==
// @name           Glass Unloader
// @description    Time-based tab unloading with explicit exclusions.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

// Uses Services.prefs directly rather than UC_API, so the script has no
// dependency on the loader's API surface beyond running in browser scope.
// Unloading is gBrowser.discardBrowser(tab) -- the same call the tab context
// menu's "Unload Tab" uses. Nothing is ever closed.

(() => {
  "use strict";

  const P = "zzunload.";
  const getB = (k, d) => { try { return Services.prefs.getBoolPref(P + k, d); } catch { return d; } };
  const getI = (k, d) => { try { return Services.prefs.getIntPref(P + k, d); } catch { return d; } };
  const getS = (k, d) => { try { return Services.prefs.getStringPref(P + k, d); } catch { return d; } };

  let timer = null;
  let log = [];

  const note = (msg) => {
    if (!getB("debug", false)) return;
    log.push(`${new Date().toLocaleTimeString()}  ${msg}`);
    if (log.length > 200) log.shift();
    console.log("[GlassUnloader]", msg);
  };

  // --- exclusion checks -----------------------------------------------------

  function hasFormData(tab) {
    // SessionStore keeps unsubmitted input under formdata. Absent key = clean.
    try {
      const state = JSON.parse(SessionStore.getTabState(tab));
      const entries = state?.formdata;
      if (!entries) return false;
      return Object.keys(entries).length > 0;
    } catch (e) {
      // If we cannot tell, assume there is data and keep the tab.
      return true;
    }
  }

  function urlExcluded(tab) {
    const raw = getS("exclude-urls", "").trim();
    if (!raw) return false;
    let url = "";
    try { url = tab.linkedBrowser?.currentURI?.spec ?? ""; } catch { return true; }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .some((frag) => url.includes(frag));
  }

  function whyKeep(tab, now) {
    if (!tab || !tab.isConnected) return "gone";
    if (tab.selected) return "active";
    if (tab.hasAttribute("pending")) return "already unloaded";
    if (tab.closing) return "closing";

    // Zen splits its window into multiple tabbrowsers; skip anything without one.
    if (!tab.linkedBrowser) return "no browser";

    const idleMs = now - (tab.lastAccessed || now);
    const idleMin = getI("idle-minutes", 30);
    if (idleMs < idleMin * 60 * 1000) return "not idle long enough";

    if (getB("exclude-audio", true)) {
      if (tab.hasAttribute("soundplaying")) return "playing audio";
      if (getB("exclude-recently-audible", true) && tab.hasAttribute("attention")) return "attention";
    }
    if (getB("exclude-sharing", true) && tab.hasAttribute("sharing")) return "sharing camera/mic/screen";
    if (getB("exclude-pip", true) && tab.hasAttribute("pictureinpicture")) return "picture-in-picture";

    if (getB("exclude-essentials", true) && tab.getAttribute("zen-essential") === "true")
      return "essential";
    if (getB("exclude-pinned", true) && tab.pinned) return "pinned";
    if (getB("exclude-glance", true) && tab.hasAttribute("zen-glance-tab")) return "glance";
    if (getB("exclude-split", true) && tab.hasAttribute("zen-split")) return "split view";

    if (getB("exclude-forms", true) && hasFormData(tab)) return "unsubmitted form data";
    if (urlExcluded(tab)) return "url excluded";

    return null; // eligible
  }

  // --- the sweep ------------------------------------------------------------

  function sweep() {
    if (!getB("enabled", false)) return;

    const now = Date.now();
    const keepLoaded = getI("keep-loaded", 0);
    const maxPerSweep = getI("max-per-sweep", 5);

    const tabs = Array.from(gBrowser?.tabs ?? []);
    const eligible = [];

    for (const tab of tabs) {
      const reason = whyKeep(tab, now);
      if (reason === null) eligible.push(tab);
    }

    if (!eligible.length) return;

    // Oldest-idle first, so the least recently used go before the rest.
    eligible.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    let budget = maxPerSweep > 0 ? maxPerSweep : eligible.length;

    if (keepLoaded > 0) {
      const loaded = tabs.filter((t) => !t.hasAttribute("pending") && !t.closing).length;
      const canDrop = Math.max(0, loaded - keepLoaded);
      budget = Math.min(budget, canDrop);
    }

    let done = 0;
    for (const tab of eligible) {
      if (done >= budget) break;
      try {
        gBrowser.discardBrowser(tab);
        done++;
        note(`unloaded: ${tab.label}`);
      } catch (e) {
        note(`failed on ${tab.label}: ${e}`);
      }
    }

    if (done) note(`sweep unloaded ${done} of ${eligible.length} eligible`);
  }

  // --- scheduling -----------------------------------------------------------

  function reschedule() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!getB("enabled", false)) {
      note("disabled");
      return;
    }
    const everySec = Math.max(15, getI("check-seconds", 60));
    timer = setInterval(sweep, everySec * 1000);
    note(`scheduled every ${everySec}s, idle threshold ${getI("idle-minutes", 30)}min`);
  }

  const watched = [
    "enabled", "check-seconds", "idle-minutes", "keep-loaded", "max-per-sweep",
    "exclude-audio", "exclude-recently-audible", "exclude-sharing", "exclude-pip",
    "exclude-essentials", "exclude-pinned", "exclude-glance", "exclude-split",
    "exclude-forms", "exclude-urls", "debug",
  ];

  const observer = {
    observe(_subject, _topic, data) {
      if (data === P + "enabled" || data === P + "check-seconds") reschedule();
    },
  };

  function start() {
    Services.prefs.addObserver(P, observer);
    reschedule();

    // Manual sweep, for testing without waiting for the interval.
    window.GlassUnloader = {
      sweepNow: sweep,
      status: () => {
        const now = Date.now();
        return Array.from(gBrowser.tabs).map((t) => ({
          title: t.label,
          idleMin: Math.round((now - (t.lastAccessed || now)) / 60000),
          verdict: whyKeep(t, now) ?? "ELIGIBLE",
        }));
      },
      log: () => log.slice(),
    };

    window.addEventListener("unload", () => {
      if (timer) clearInterval(timer);
      Services.prefs.removeObserver(P, observer);
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
