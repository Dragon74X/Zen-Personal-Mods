// ==UserScript==
// @name           Zen Turbo
// @description    Real, reversible performance tuning: network prefs, hover connection warmup, startup warmup of frequent sites.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const P = "zzturbo.";
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(P + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref(P + k, d); } catch { return d; } };
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

  function num(k, d) { return prefNum(P + k, d); }

  let log = [];
  const note = (m) => {
    log.push([Date.now(), m]);
    if (log.length > 200) log.shift();
    if (bool("debug", false)) console.log("[ZenTurbo]", m);
  };

  // Only one window should own pref application; every window may warm
  // connections (hover is per-window anyway).
  const isMainAppWindow = () =>
    Services.wm.getMostRecentWindow("navigator:browser") === window;

  // ---- pref packs ---------------------------------------------------------
  // Each pack is a named, toggleable set. Values here are the tuned ones;
  // what the profile had before is snapshotted so turning a pack off puts
  // things back EXACTLY, including "no user value at all". A pref whose
  // current value no longer matches what this mod set is left alone -- the
  // user changed it by hand and owns it now.
  const PACKS = {
    // More parallel connections, no request pacing, bigger DNS/TLS caches.
    // The pacing pref removes small deliberate delays Firefox inserts
    // between bursts of requests; on fast lines it is pure latency.
    network: [
      ["network.http.max-persistent-connections-per-server", 10],
      ["network.http.pacing.requests.enabled", false],
      ["network.http.speculative-parallel-limit", 12],
      ["network.dnsCacheEntries", 2000],
      ["network.dnsCacheExpiration", 3600],
      ["network.ssl_tokens_cache_capacity", 32768],
    ],
    // Firefox's predictor learns which subresources a site needs and
    // preconnects for them; these extend it to hover on https links.
    predictor: [
      ["network.predictor.enable-hover-on-ssl", true],
      ["network.predictor.enable-prefetch", true],
    ],
    // Session state is written to disk every 15s by default; that write is
    // a periodic jank source on HDDs and busy systems. 30s halves it. Cost:
    // after a hard crash, up to 30s of very recent session changes instead
    // of 15s. Zen's own window sync is unaffected.
    "io-jank": [
      ["browser.sessionstore.interval", 30000],
    ],
    // Larger in-memory media cache keeps streamed video from re-fetching
    // on small seeks. 64 MB, memory-for-network trade.
    media: [
      ["media.memory_cache_max_size", 65536],
    ],
    // Forces GPU paths Mozilla blocklists conservatively. Only changes
    // anything on hardware where they are OFF; on broken drivers it can
    // glitch, and turning the pack off restores the profile exactly.
    gfx: [
      ["gfx.webrender.all", true],
      ["gfx.canvas.accelerated", true],
    ],
    // MSD-physics smooth scrolling: a mass-spring-damper response curve
    // instead of fixed-duration easing. Scrolling tracks the wheel with
    // less lag and settles without the floaty tail.
    scroll: [
      ["general.smoothScroll.msdPhysics.enabled", true],
      ["general.smoothScroll.msdPhysics.continuousMotionMaxDeltaMS", 12],
      ["general.smoothScroll.msdPhysics.motionBeginSpringConstant", 600],
      ["general.smoothScroll.msdPhysics.regularSpringConstant", 650],
      ["general.smoothScroll.msdPhysics.slowdownMinDeltaMS", 25],
      ["general.smoothScroll.msdPhysics.slowdownSpringConstant", 250],
    ],
  };

  const SAVED = P + "saved-prefs";   // JSON: { prefName: {had:bool, v:value} }

  function readSaved() {
    try { return JSON.parse(Services.prefs.getStringPref(SAVED, "{}")); }
    catch { return {}; }
  }
  function writeSaved(obj) {
    try { Services.prefs.setStringPref(SAVED, JSON.stringify(obj)); } catch {}
  }

  function getAny(name) {
    const b = Services.prefs;
    try {
      switch (b.getPrefType(name)) {
        case b.PREF_BOOL:   return b.getBoolPref(name);
        case b.PREF_INT:    return b.getIntPref(name);
        case b.PREF_STRING: return b.getStringPref(name);
      }
    } catch {}
    return undefined;
  }
  function setAny(name, v) {
    const b = Services.prefs;
    if (typeof v === "boolean") b.setBoolPref(name, v);
    else if (typeof v === "number") b.setIntPref(name, v);
    else b.setStringPref(name, String(v));
  }

  function applyPack(packName) {
    const saved = readSaved();
    for (const [name, v] of PACKS[packName]) {
      if (getAny(name) === v) continue;              // already there
      if (!(name in saved)) {
        saved[name] = Services.prefs.prefHasUserValue(name)
          ? { had: true, v: getAny(name) }
          : { had: false };
      }
      try { setAny(name, v); } catch (e) { note(`set ${name} failed: ${e}`); }
    }
    writeSaved(saved);
    note(`pack on: ${packName}`);
  }

  function revertPack(packName) {
    const saved = readSaved();
    for (const [name, v] of PACKS[packName]) {
      const s = saved[name];
      if (s === undefined) continue;                 // never touched by us
      // The user changed it since we set it; it is theirs now.
      if (getAny(name) !== v) { delete saved[name]; continue; }
      try {
        if (s.had) setAny(name, s.v);
        else Services.prefs.clearUserPref(name);
      } catch (e) { note(`revert ${name} failed: ${e}`); }
      delete saved[name];
    }
    writeSaved(saved);
    note(`pack off: ${packName} (restored)`);
  }

  function syncPacks() {
    if (!isMainAppWindow()) return;
    for (const packName of Object.keys(PACKS)) {
      if (bool("pack-" + packName, true)) applyPack(packName);
      else revertPack(packName);
    }
  }

  // ---- speculative connection warmup -------------------------------------
  // Pre-opens TCP + TLS to an origin so the next real request rides a warm
  // socket: DNS, handshake and certificate work happen during the hover or
  // at idle instead of after the click. The connection carries the right
  // container (OriginAttributes), otherwise it would warm a pool the actual
  // request never uses.
  const recentWarm = new Map();          // origin|ctx -> last warm time
  function warm(uriLike, userContextId = 0) {
    try {
      const uri = typeof uriLike === "string" ? Services.io.newURI(uriLike) : uriLike;
      if (!uri || !/^https?$/.test(uri.scheme)) return;
      const key = uri.prePath + "|" + userContextId;
      const now = Date.now();
      const last = recentWarm.get(key) || 0;
      if (now - last < 60000) return;    // a warmed socket keeps for a while
      recentWarm.set(key, now);
      if (recentWarm.size > 200) recentWarm.delete(recentWarm.keys().next().value);
      const principal = Services.scriptSecurityManager
        .createContentPrincipal(uri, { userContextId });
      Services.io.speculativeConnect(uri, principal, null, false);
      note(`warmed ${uri.prePath}${userContextId ? ` [container ${userContextId}]` : ""}`);
    } catch (e) { note(`warm failed: ${e}`); }
  }

  // Hover over an UNLOADED tab: by the time it is clicked and the page
  // starts reloading, the connection already exists. Loaded tabs need
  // nothing. Also warms bookmark hovers.
  function onHover(event) {
    if (!bool("hover-warmup", true)) return;
    const t = event.target;
    const tab = t?.closest?.(".tabbrowser-tab");
    if (tab && tab.hasAttribute("pending")) {
      let uri = null;
      try { uri = tab.linkedBrowser?.currentURI; } catch {}
      if (uri) {
        const ctx = parseInt(tab.getAttribute("usercontextid") || "0", 10);
        warm(uri, ctx);
      }
      return;
    }
    const bm = t?.closest?.(".bookmark-item");
    const url = bm?._placesNode?.uri;
    if (url) warm(url);
  }

  // ---- startup warmup -----------------------------------------------------
  // The first visit of the session to a favorite site pays DNS + TLS cold.
  // Reading the top origins by frecency from Places and warming them right
  // after startup makes that first navigation land warm. Read-only query,
  // small N, spread out to avoid a burst.
  async function startupWarmup() {
    const n = Math.max(0, Math.min(20, num("startup-warm-count", 6)));
    if (!n) return;
    try {
      const { PlacesUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/PlacesUtils.sys.mjs");
      const db = await PlacesUtils.promiseDBConnection();
      const rows = await db.executeCached(
        `SELECT prefix, host FROM moz_origins
         WHERE prefix IN ('https://', 'http://')
         ORDER BY frecency DESC LIMIT :n`, { n });
      let delay = 0;
      for (const row of rows) {
        const origin = row.getResultByName("prefix") + row.getResultByName("host");
        setTimeout(() => warm(origin), delay);
        delay += 250;                    // spread, not burst
      }
      note(`startup warmup queued for ${rows.length} origins`);
    } catch (e) { note(`startup warmup failed: ${e}`); }
  }

  // ---- wiring -------------------------------------------------------------
  // ---- instant UI animations ---------------------------------------------
  // Zen animates its UI (tabs, workspaces, folders) through its vendored
  // Motion library, which exposes a global switch: with instantAnimations
  // set, every animation jumps straight to its final frame. This is the
  // real lever -- no zen.animations pref exists. In-memory, applies live,
  // reverts live, touches nothing on web pages.
  function syncInstantUI() {
    const cfg = window.Motion?.MotionGlobalConfig;
    if (!cfg) { note("Motion library not found; instant UI unavailable on this build"); return; }
    const want = bool("instant-ui", false);
    if (cfg.instantAnimations !== want) {
      cfg.instantAnimations = want;
      note(`instant UI animations ${want ? "on" : "off"}`);
    }
  }

  const prefObserver = {
    observe(_s, _t, data) {
      if (data.startsWith(P + "pack-")) syncPacks();
      if (data === P + "instant-ui") syncInstantUI();
    },
  };

  function start() {
    Services.prefs.addObserver(P, prefObserver);
    syncPacks();
    syncInstantUI();

    // mouseover fires on element boundaries only, not per pixel; with the
    // per-origin 60s throttle inside warm() this is effectively free.
    document.addEventListener("mouseover", onHover, { passive: true });

    if (bool("startup-warmup", true) && isMainAppWindow()) {
      setTimeout(startupWarmup, Math.max(0, num("startup-warm-delay-ms", 4000)));
    }

    window.ZenTurbo = {
      status() {
        const saved = readSaved();
        return {
          packs: Object.fromEntries(Object.keys(PACKS).map(k => [k, bool("pack-" + k, true)])),
          managedPrefs: Object.keys(saved),
          instantUI: bool("instant-ui", false),
          hoverWarmup: bool("hover-warmup", true),
          startupWarmup: bool("startup-warmup", true),
          warmedThisSession: recentWarm.size,
        };
      },
      warm,                              // ZenTurbo.warm("https://example.com")
      log: () => log.map(([t, m]) => `${new Date(t).toLocaleTimeString()}  ${m}`),
    };
    note("loaded");

    window.addEventListener("unload", () => {
      try { Services.prefs.removeObserver(P, prefObserver); } catch {}
      try { document.removeEventListener("mouseover", onHover); } catch {}
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
