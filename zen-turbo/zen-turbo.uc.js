// ==UserScript==
// @name           Zen Turbo
// @description    Preference packs and session-scoped startup connection warmup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window. instance.retire is the
  // pending startup observer until start() swaps in the real cleanup.
  const INSTANCE_KEY = "__zzturboInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const P = "zzturbo.";
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(P + k, d); } catch { return d; } };
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
    if (!bool("debug", false)) return;
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
    // Connection limits, pacing, and DNS/TLS cache values; no timing claim.
    network: [
      ["network.http.max-persistent-connections-per-server", 10],
      ["network.http.pacing.requests.enabled", false],
      ["network.http.speculative-parallel-limit", 12],
      ["network.dnsCacheEntries", 2000],
      ["network.dnsCacheExpiration", 3600],
      ["network.ssl_tokens_cache_capacity", 32768],
    ],
    // Reuse Firefox's native page-link hover preconnect on HTTPS pages.
    predictor: [
      ["network.predictor.enable-hover-on-ssl", true],
    ],
    // A minimum spacing, not a reason to shorten a newer native interval.
    // Zen 1.24 already uses 40s. applyPack releases our old 30s override there.
    "io-jank": [
      ["browser.sessionstore.interval", 30000],
    ],
    // Requests a 64 MiB media memory cache; actual reuse depends on workload.
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
  };

  // Packs default ON when the pref has not been written yet, EXCEPT these.
  // Without this, a pack whose preferences.json default is false would still
  // apply on a profile where Sine has not yet written the pref -- which is
  // what the plain `bool(..., true)` below used to do to the gfx pack.
  // Appearance belongs to the styling mods, so nothing that only changes how
  // the browser LOOKS gets a pack here.
  const PACK_DEFAULTS = { gfx: false };

  const SAVED = P + "saved-prefs";   // JSON: { prefName: {had:bool, v:value} }

  function readSaved() {
    try {
      const saved = JSON.parse(Services.prefs.getStringPref(SAVED, "{}"));
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch { return {}; }
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

  // A pref this browser does not have is not a tuning opportunity, it is a
  // dead entry: Firefox renames and removes prefs, and setting one it no
  // longer reads silently creates a user pref that does nothing forever, while
  // status() still reports the pack as managing it. That is exactly the snake
  // oil this mod promises not to be, so it is checked rather than assumed.
  const prefExists = (name) => {
    try { return Services.prefs.getPrefType(name) !== Services.prefs.PREF_INVALID; }
    catch { return false; }
  };

  const unknown = new Set();

  function applyPack(packName, saved) {
    let changed = false;
    for (const [name, v] of PACKS[packName]) {
      if (!prefExists(name)) {
        if (!unknown.has(name)) {
          unknown.add(name);
          note(`skipped ${name}: not a pref on this build (Firefox ${Services.appinfo?.platformVersion})`);
        }
        continue;
      }
      // An existing snapshot means this pack already applied. Re-syncing
      // must not overwrite a later user edit, including after a restart.
      const current = getAny(name);
      if (packName === "io-jank") {
        const prior = saved[name];
        let original = current;
        if (prior?.had) original = prior.v;
        else if (prior) {
          try { original = Services.prefs.getDefaultBranch("").getIntPref(name); }
          catch { original = undefined; }
        }
        if (typeof original === "number" && original >= v) {
          if (prior) changed = revertPack(packName, saved) || changed;
          continue;
        }
      }
      if (current === v || name in saved) continue;
      const before = Services.prefs.prefHasUserValue(name)
        ? { had: true, v: current } : { had: false };
      try { setAny(name, v); saved[name] = { ...before, applied: v }; changed = true; }
      catch (e) { note(`set ${name} failed: ${e}`); }
    }
    note(`pack on: ${packName}`);
    return changed;
  }

  function revertPack(packName, saved) {
    let changed = false;
    for (const [name, v] of PACKS[packName]) {
      const s = saved[name];
      if (s === undefined) continue;                 // never touched by us
      // The user changed it since we set it; it is theirs now.
      if (getAny(name) !== v) { delete saved[name]; changed = true; continue; }
      try {
        if (s.had) setAny(name, s.v);
        else Services.prefs.clearUserPref(name);
        delete saved[name];
        changed = true;
      } catch (e) { note(`revert ${name} failed: ${e}`); }
    }
    note(`pack off: ${packName} (restored)`);
    return changed;
  }

  // A pack that no longer exists can still own prefs in the snapshot written by
  // an earlier version. The squircle pack, which moved to Glassflow where
  // appearance belongs, is exactly that case: 1.3.0 shipped it, so a profile
  // that enabled it holds layout.css.corner-shape.enabled = false plus a
  // snapshot entry, and with the pack gone nothing would ever revert it. Give
  // back anything the current packs no longer claim.
  function reclaimOrphans(saved) {
    const owned = new Set();
    for (const list of Object.values(PACKS)) for (const [name] of list) owned.add(name);
    let changed = false;
    for (const name of Object.keys(saved)) {
      if (owned.has(name)) continue;
      const s = saved[name];
      // Older builds only recorded the original value. The removed
      // squircle pack's applied value is known; other unknown entries stay.
      const legacyApplied = { "layout.css.corner-shape.enabled": false, "network.predictor.enable-prefetch": true };
      const applied = s?.applied ?? legacyApplied[name];
      if (applied === undefined) continue;
      if (getAny(name) !== applied) { delete saved[name]; changed = true; continue; }
      try {
        if (s?.had) setAny(name, s.v);
        else Services.prefs.clearUserPref(name);
        note(`reclaimed ${name}: no pack owns it any more, profile value restored`);
      } catch (e) { note(`reclaim ${name} failed: ${e}`); continue; }
      delete saved[name];
      changed = true;
    }
    return changed;
  }

  function syncPacks(release = false) {
    if (!release && !isMainAppWindow()) return;
    const saved = readSaved();
    let changed = reclaimOrphans(saved);
    for (const packName of Object.keys(PACKS)) {
      const updated = !release && bool("pack-" + packName, PACK_DEFAULTS[packName] ?? true)
        ? applyPack(packName, saved) : revertPack(packName, saved);
      changed ||= updated;
    }
    if (changed) writeSaved(saved);
  }

  // ---- speculative connection warmup -------------------------------------
  // Pre-opens TCP + TLS to an origin so the next real request rides a warm
  // socket: DNS, handshake and certificate work happen during the hover or
  // at idle instead of after the click. The connection carries the right
  // container (OriginAttributes), otherwise it would warm a pool the actual
  // request never uses.
  const recentWarm = new Map();          // origin|ctx -> last warm time

  // Correlates navigation origin/container with recent warmup requests.
  // The keep-alive pref is a heuristic window, not an observed socket lifetime;
  // these counters cannot establish connection reuse or time saved.
  const warmTtlMs = () => prefNum("network.http.keep-alive.timeout", 115) * 1000;
  const stats = { warmed: 0, hits: 0, cold: 0, byOrigin: new Map() };
  const ORIGIN_MAX = 200;                // as bounded as recentWarm, and for the same reason
  function bumpOrigin(prePath, field) {
    const e = stats.byOrigin.get(prePath) || { warmed: 0, hits: 0 };
    e[field]++;
    stats.byOrigin.set(prePath, e);
    if (stats.byOrigin.size > ORIGIN_MAX) stats.byOrigin.delete(stats.byOrigin.keys().next().value);
  }

  function recordHit(uri, userContextId) {
    if (!bool("measure", false)) return;
    try {
      if (!uri || !/^https?$/.test(uri.scheme)) return;
      const key = uri.prePath + "|" + userContextId;
      const at = recentWarm.get(key);
      const hit = at !== undefined && Date.now() - at < warmTtlMs();
      if (hit) stats.hits++; else stats.cold++;
      if (hit) bumpOrigin(uri.prePath, "hits");
      if (bool("debug", false)) note(`${hit ? "HIT" : "cold"} ${uri.prePath}`);
    } catch {}
  }
  // A private window's warmups go to the private connection pool, never
  // the normal one: the origin attributes carry privateBrowsingId, and a
  // socket opened for a private tab is not one a normal tab can reuse.
  const isPrivate = () => {
    try {
      return ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
        .PrivateBrowsingUtils.isWindowPrivate(window);
    } catch { return false; }
  };
  function warm(uriLike, userContextId = 0) {
    try {
      const uri = typeof uriLike === "string" ? Services.io.newURI(uriLike) : uriLike;
      if (!uri || !/^https?$/.test(uri.scheme)) return;
      const key = uri.prePath + "|" + userContextId;
      const now = Date.now();
      const last = recentWarm.get(key) || 0;
      // Throttle repeat requests using half the configured keep-alive value.
      // No socket state is observed here.
      if (recentWarm.has(key) && now - last < warmTtlMs() / 2) return;
      // The principal-taking API derives the destination partition key,
      // including after HSTS upgrade. WithOriginAttributes uses it verbatim.
      const oa = { userContextId, privateBrowsingId: isPrivate() ? 1 : 0 };
      const principal = Services.scriptSecurityManager.createContentPrincipal(uri, oa);
      Services.io.speculativeConnect(uri, principal, null, false);
      recentWarm.set(key, now);
      if (recentWarm.size > 200) recentWarm.delete(recentWarm.keys().next().value);
      if (bool("measure", false)) { stats.warmed++; bumpOrigin(uri.prePath, "warmed"); }
      note(`requested ${uri.prePath}${userContextId ? ` [container ${userContextId}]` : ""}`);
    } catch (e) { note(`warm failed: ${e}`); }
  }

  let warmupTimer = null, warmIdle = null, startupDue = false;
  const startupWarmTimers = new Set();
  let warmupEpoch = 0;
  function cancelStartupWarmup() {
    warmupEpoch++;
    clearTimeout(warmupTimer); warmupTimer = null;
    if (warmIdle !== null) window.cancelIdleCallback(warmIdle);
    warmIdle = null; startupDue = false;
    for (const id of startupWarmTimers) clearTimeout(id);
    startupWarmTimers.clear();
  }
  let retired = false;
  // Favorites (Essentials/pinned tabs) use Firefox's existing tab hover
  // warmup and SessionStore.speculativeConnectOnTabHover, including containers.
  // A second request here bypassed native connectionPrepared deduplication.
  function warmWhenReady() {
    if (!startupDue || retired || gBrowser.selectedTab?.hasAttribute("busy") || warmIdle !== null) return;
    warmIdle = window.requestIdleCallback(() => {
      warmIdle = null;
      if (gBrowser.selectedTab?.hasAttribute("busy")) return;
      startupDue = false;
      startupWarmup();
    });
  }

  // ---- startup warmup -----------------------------------------------------
  // Read up to 20 history origins and space requests 250 ms apart.
  // Successful handshakes and later connection reuse are not observed.
  async function startupWarmup() {
    if (retired || isPrivate() || !bool("startup-warmup", true)) return;
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    // Process owner survives window close/reinjection; browser restart resets it.
    if (NetUtil.__zzturboStartupV1) return;
    NetUtil.__zzturboStartupV1 = true;
    const epoch = warmupEpoch;
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
      // The query can outlive either this script generation or a live
      // settings change. In both cases its result is stale and must not
      // enqueue a fresh batch of timers.
      if (retired || epoch !== warmupEpoch || !bool("startup-warmup", true)) return;
      let delay = 0;
      for (const row of rows) {
        const origin = row.getResultByName("prefix") + row.getResultByName("host");
        const id = setTimeout(() => {
          startupWarmTimers.delete(id);
          if (!retired && epoch === warmupEpoch && bool("startup-warmup", true)) warm(origin);
        }, delay);
        startupWarmTimers.add(id);
        delay += 250;                    // spread, not burst
      }
      note(`startup warmup queued for ${rows.length} origins`);
    } catch (e) { note(`startup warmup failed: ${e}`); }
  }

  function forgetWarmups() {
    cancelStartupWarmup();
    recentWarm.clear();
    stats.warmed = stats.hits = stats.cold = 0;
    stats.byOrigin.clear();
    log = [];
  }

  // Match top-level navigations to recent origin/container request records.
  const navListener = {
    onLocationChange(browser, wp, _req, uri, flags) {
      // Subframes report here too, and an ad frame is not the navigation
      // the warmup was for: counting them made the hit rate a fiction.
      if (!wp?.isTopLevel) return;
      if (flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) return;
      let ctx = 0;
      try { ctx = browser?.getAttribute?.("usercontextid") | 0; } catch {}
      recordHit(uri, ctx);
    },
  };

  let measuring = false;
  function syncMeasurement() {
    const enabled = !retired && bool("measure", false);
    if (enabled === measuring) return;
    measuring = enabled;
    if (enabled) gBrowser.addTabsProgressListener(navListener);
    else {
      gBrowser.removeTabsProgressListener(navListener);
      stats.warmed = stats.hits = stats.cold = 0;
      stats.byOrigin.clear();
    }
  }
  function onReadyEvent(event) {
    if (event.type === "TabSelect" || event.target === gBrowser.selectedTab && event.detail?.changed?.includes("busy")) warmWhenReady();
  }

  // ---- wiring -------------------------------------------------------------
  let smoothingObserver = null, smoothingTimer = null, smoothingMarked = false;
  function stopSmoothing() {
    clearTimeout(smoothingTimer); smoothingTimer = null;
    document.documentElement.removeAttribute("zzturbo-smoothing");
  }
  // Zen marks a trackpad swipe on the tab scroller, the workspaces and the
  // grain layer (ZenSpacesSwipe.mjs), never on :root. A workspace slide is
  // marked on #navigator-toolbox since Zen 1.23b, on :root before it.
  const swiping = () => !!document.getElementById?.("tabbrowser-arrowscrollbox")?.hasAttribute("swipe-gesture");
  const sliding = () => document.documentElement.hasAttribute("animating-background") ||
    !!document.getElementById?.("navigator-toolbox")?.hasAttribute("animating-background") || swiping();
  function syncSmoothing() {
    const root = document.documentElement;
    const marked = sliding();
    if (!marked || !bool("smooth-workspace-switch", true)) {
      stopSmoothing(); smoothingMarked = false; return;
    }
    if (smoothingMarked) return;
    smoothingMarked = true;
    root.setAttribute("zzturbo-smoothing", "");
    // A stuck native animation marker must not freeze tab effects indefinitely.
    smoothingTimer = setTimeout(stopSmoothing, 1500);
  }
  const prefObserver = {
    observe(_s, _t, data) {
      if (data === P + "measure") syncMeasurement();
      if (data === P + "debug" && !bool("debug", false)) log = [];
      if (data.startsWith(P + "pack-")) syncPacks();
      if (data === P + "smooth-workspace-switch") syncSmoothing();
      if (data === P + "startup-warmup" && !bool("startup-warmup", true)) cancelStartupWarmup();
    },
  };

  function start() {
    smoothingObserver = new MutationObserver(syncSmoothing);
    smoothingObserver.observe(document.documentElement, { attributes: true,
      attributeFilter: ["animating-background"] });
    const toolbox = document.getElementById("navigator-toolbox");
    if (toolbox) smoothingObserver.observe(toolbox, { attributes: true, attributeFilter: ["animating-background"] });
    const scroller = document.getElementById("tabbrowser-arrowscrollbox");
    if (scroller) smoothingObserver.observe(scroller, { attributes: true, attributeFilter: ["swipe-gesture"] });
    syncSmoothing();
    Services.prefs.addObserver(P, prefObserver);
    syncPacks();
    Services.obs.addObserver(forgetWarmups, "browser:purge-session-history");

    syncMeasurement();
    gBrowser.tabContainer.addEventListener("TabAttrModified", onReadyEvent);
    gBrowser.tabContainer.addEventListener("TabSelect", onReadyEvent);

    if (bool("startup-warmup", true) && !isPrivate() && isMainAppWindow()) {
      window.gZenStartup.promiseInitialized.then(() => {
        if (!retired) warmupTimer = setTimeout(() => { startupDue = true; warmWhenReady(); }, Math.max(0, num("startup-warm-delay-ms", 4000)));
      });
    }

    window.ZenTurbo = {
      status() {
        const saved = readSaved();
        return {
          packs: Object.fromEntries(Object.keys(PACKS).map(
            k => [k, bool("pack-" + k, PACK_DEFAULTS[k] ?? true)])),
          managedPrefs: Object.keys(saved),
          // Prefs this build does not have. Anything listed here is dead
          // weight in a pack and should be removed from the mod.
          unknownPrefs: [...unknown],
          hoverWarmup: "native tab hover (including Favorites/Essentials)",
          startupWarmup: bool("startup-warmup", true),
          warmupRequests: stats.warmed,
          recentOriginContexts: recentWarm.size,
        };
      },
      // Navigation correlation only; no socket-reuse or timing measurements.
      stats: () => ({
        measurement: "origin/container matches after warmup requests; not socket reuse or time saved",
        windowMs: warmTtlMs(),
        warmed: stats.warmed,
        hits: stats.hits,
        cold: stats.cold,
        hitRate: stats.hits + stats.cold
          ? `${Math.round((100 * stats.hits) / (stats.hits + stats.cold))}%`
          : "no navigations yet",
        byOrigin: Object.fromEntries(
          [...stats.byOrigin].sort((a, b) => b[1].warmed - a[1].warmed).slice(0, 20)),
      }),
      warm,                              // ZenTurbo.warm("https://example.com")
      log: () => log.map(([t, m]) => `${new Date(t).toLocaleTimeString()}  ${m}`),
    };
    note("loaded");

    // Sine cleanup and window unload can both run; retire this copy once.
    const cleanup = () => {
      if (retired) return;
      retired = true;
      window.removeEventListener("unload", cleanup);
      smoothingObserver?.disconnect(); smoothingObserver = null;
      stopSmoothing();
      try { Services.prefs.removeObserver(P, prefObserver); } catch {}
      try { delete window.ZenTurbo; } catch {}
      try { Services.obs.removeObserver(forgetWarmups, "browser:purge-session-history"); } catch {}
      cancelStartupWarmup();
      syncMeasurement();
      log = []; recentWarm.clear();
      gBrowser.tabContainer.removeEventListener("TabAttrModified", onReadyEvent);
      gBrowser.tabContainer.removeEventListener("TabSelect", onReadyEvent);
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Registered with Sine, so an update re-injects this script live, no
    // restart: Sine calls cleanup, then loads the new file into the same
    // window, and the instance guard at the top retires whatever copy is
    // still here. Safe now that start() is contained and the top level
    // does nothing that can throw; the DOM unload listener above still
    // releases everything when the window closes.
    try { window.addUnloadListener?.(() => {
      cleanup();
      if (!window.__zzSineWindowClosing && window.__zzSineUnloadReasons?.get("zz-zen-turbo") === "release") syncPacks(true);
    }); } catch {}
    instance.retire = cleanup;
  }


  // ---- declared defaults --------------------------------------------------
  // Native defaults serve CSS, Sine and runtime readers alike. Existing user
  // values always win, including values previously seeded into the user branch.
  const MOD_ID = "zz-zen-turbo";
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs.getDefaultBranch("");
    for (const pref of declared) {
      const name = pref?.property;
      const value = pref?.defaultValue;
      if (!name || !name.startsWith(P) || value === undefined || value === null) continue;
      try {
        if (typeof value === "boolean") S.setBoolPref(name, value);
        else if (typeof value === "number") S.setIntPref(name, value);
        else if (typeof value === "string") S.setStringPref(name, value);
      } catch {}
    }
  }

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

  // Seed before starting where possible. start() reads prefs immediately, so
  // a mod that starts first would run one session on the wrong fallbacks.
  const defaultsReady = seedDefaults();

  const startOnce = async () => {
    // A newer copy of this script may have claimed the window while this one
    // was waiting; that copy owns the registrations, so this one stays quiet.
    if (started || window[INSTANCE_KEY] !== instance) return;
    started = true;
    stopWaiting();
    await defaultsReady;
    if (retired || window[INSTANCE_KEY] !== instance) return;
    try { start(); } catch (e) {
      console.error("[ZenTurbo] failed to start:", e);
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
  instance.retire = () => { retired = true; stopWaiting(); };

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
