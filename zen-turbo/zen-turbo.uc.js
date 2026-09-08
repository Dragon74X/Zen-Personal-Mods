// ==UserScript==
// @name           Zen Turbo
// @description    Real, reversible performance tuning: network prefs, hover connection warmup, startup warmup of frequent sites.
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
  const INSTANCE_KEY = "__zzturboInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

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

  function applyPack(packName) {
    const saved = readSaved();
    for (const [name, v] of PACKS[packName]) {
      if (!prefExists(name)) {
        if (!unknown.has(name)) {
          unknown.add(name);
          note(`skipped ${name}: not a pref on this build (Firefox ${Services.appinfo?.platformVersion})`);
        }
        continue;
      }
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

  // A pack that no longer exists can still own prefs in the snapshot written by
  // an earlier version. The squircle pack, which moved to Glassflow where
  // appearance belongs, is exactly that case: 1.3.0 shipped it, so a profile
  // that enabled it holds layout.css.corner-shape.enabled = false plus a
  // snapshot entry, and with the pack gone nothing would ever revert it. Give
  // back anything the current packs no longer claim.
  function reclaimOrphans() {
    const saved = readSaved();
    const owned = new Set();
    for (const list of Object.values(PACKS)) for (const [name] of list) owned.add(name);
    let changed = false;
    for (const name of Object.keys(saved)) {
      if (owned.has(name)) continue;
      const s = saved[name];
      try {
        if (s?.had) setAny(name, s.v);
        else Services.prefs.clearUserPref(name);
        note(`reclaimed ${name}: no pack owns it any more, profile value restored`);
      } catch (e) { note(`reclaim ${name} failed: ${e}`); }
      delete saved[name];
      changed = true;
    }
    if (changed) writeSaved(saved);
  }

  function syncPacks() {
    if (!isMainAppWindow()) return;
    reclaimOrphans();
    for (const packName of Object.keys(PACKS)) {
      if (bool("pack-" + packName, PACK_DEFAULTS[packName] ?? true)) applyPack(packName);
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

  // Warm-hit measurement. A warmed socket is only worth opening if a real
  // request lands on it before it goes cold, and nothing in this mod could
  // tell you whether that ever happened -- "it feels faster" is exactly the
  // claim the README refuses to make. So each warm is counted, each navigation
  // is checked against what was warmed, and ZenTurbo.stats() reports the rate.
  // Costs one Map lookup per navigation.
  // How long a warmed socket actually survives, rather than a number picked to
  // flatter the result. A speculative connection is an ordinary idle
  // persistent connection once it is open, so Firefox reaps it on
  // network.http.keep-alive.timeout -- 115 seconds by default, and Zen does
  // not override it. Counting a navigation past that as a "hit" would credit
  // this mod for a socket the browser had already closed.
  const warmTtlMs = () => prefNum("network.http.keep-alive.timeout", 115) * 1000;
  const stats = { warmed: 0, hits: 0, cold: 0, byOrigin: new Map() };

  function recordHit(uri, userContextId) {
    if (!bool("measure", true)) return;
    try {
      if (!uri || !/^https?$/.test(uri.scheme)) return;
      const key = uri.prePath + "|" + userContextId;
      const at = recentWarm.get(key);
      const hit = at !== undefined && Date.now() - at < warmTtlMs();
      if (hit) stats.hits++; else stats.cold++;
      const e = stats.byOrigin.get(uri.prePath) || { warmed: 0, hits: 0 };
      if (hit) { e.hits++; stats.byOrigin.set(uri.prePath, e); }
      if (bool("debug", false)) note(`${hit ? "HIT" : "cold"} ${uri.prePath}`);
    } catch {}
  }
  function warm(uriLike, userContextId = 0) {
    try {
      const uri = typeof uriLike === "string" ? Services.io.newURI(uriLike) : uriLike;
      if (!uri || !/^https?$/.test(uri.scheme)) return;
      const key = uri.prePath + "|" + userContextId;
      const now = Date.now();
      const last = recentWarm.get(key) || 0;
      // Re-warming an origin whose socket is still alive is wasted work, so the
      // throttle tracks the socket lifetime rather than a fixed minute: half
      // of keep-alive leaves room to re-warm once before it is reaped.
      if (now - last < warmTtlMs() / 2) return;
      recentWarm.set(key, now);
      if (recentWarm.size > 200) recentWarm.delete(recentWarm.keys().next().value);
      // nsISpeculativeConnect offers this exact call: origin attributes, which
      // is all the network layer wants, rather than a content principal built
      // per warm purely to carry the container id. Falls back where the newer
      // entry point is missing.
      if (typeof Services.io.speculativeConnectWithOriginAttributes === "function") {
        Services.io.speculativeConnectWithOriginAttributes(uri, { userContextId }, null, false);
      } else {
        const principal = Services.scriptSecurityManager
          .createContentPrincipal(uri, { userContextId });
        Services.io.speculativeConnect(uri, principal, null, false);
      }
      stats.warmed++;
      const e = stats.byOrigin.get(uri.prePath) || { warmed: 0, hits: 0 };
      e.warmed++; stats.byOrigin.set(uri.prePath, e);
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
        warmAfterDwell(uri, ctx);
      }
      return;
    }
    const bm = t?.closest?.(".bookmark-item");
    const url = bm?._placesNode?.uri;
    if (url) warmAfterDwell(url, 0);
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

  // ---- link hover warmup --------------------------------------------------
  // A chrome-context mouseover listener cannot see into web content, so
  // hovering a link on a page is invisible to the handler above. Firefox
  // already computes that though: XULBrowserWindow.setOverLink(url) is what
  // fills the little status panel in the corner, and it fires on every link
  // hover in content. Wrapping it is the supported way to learn the URL the
  // pointer is on. Zen does not patch it and performs no speculative connect
  // of its own, so nothing here is duplicated.
  //
  // The container is the hovered TAB's, not the link's: a link opens in the
  // tab it was clicked from, and warming the wrong container pool would warm a
  // connection the real request never uses.
  let overLinkOriginal = null;
  let dwellTimer = null;

  // A socket, once opened, is Firefox's to close: there is no API to cancel a
  // speculative connection, so an unclicked one sits in the pool for the full
  // keep-alive. The fix is therefore not to open it for a hover that was never
  // going to convert. Sweeping the pointer across a page of links, or down the
  // tab strip, warms nothing; resting on one does. This is the whole reason
  // the cost of link warming stays bounded.
  function warmAfterDwell(url, ctx) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
    if (!url) return;                    // pointer left the link
    const delay = Math.max(0, num("hover-dwell-ms", 200));
    dwellTimer = setTimeout(() => { dwellTimer = null; warm(url, ctx); }, delay);
  }

  function hookOverLink() {
    const XBW = window.XULBrowserWindow;
    if (overLinkOriginal || !XBW || typeof XBW.setOverLink !== "function") return;
    overLinkOriginal = XBW.setOverLink;
    XBW.setOverLink = function (url, anchorElt) {
      try {
        // setOverLink("") fires when the pointer leaves a link; nothing to do.
        if (bool("hover-warmup", true) && bool("hover-links", true)) {
          let ctx = 0;
          try { ctx = parseInt(gBrowser.selectedTab?.getAttribute("usercontextid") || "0", 10); } catch {}
          // "" arrives when the pointer leaves a link, which cancels a pending warm.
          warmAfterDwell(url, ctx);
        }
      } catch {}
      return overLinkOriginal.call(this, url, anchorElt);
    };
    note("link hover warmup active");
  }

  function unhookOverLink() {
    const XBW = window.XULBrowserWindow;
    if (overLinkOriginal && XBW) XBW.setOverLink = overLinkOriginal;
    overLinkOriginal = null;
  }

  // Every navigation is checked against what was warmed, so the hit rate is
  // measured rather than asserted.
  const navListener = {
    onLocationChange(browser, _wp, _req, uri, flags) {
      if (flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) return;
      let ctx = 0;
      try { ctx = browser?.getAttribute?.("usercontextid") | 0; } catch {}
      recordHit(uri, ctx);
    },
  };

  // ---- wiring -------------------------------------------------------------
  const prefObserver = {
    observe(_s, _t, data) {
      if (data.startsWith(P + "pack-")) syncPacks();
    },
  };

  function start() {
    Services.prefs.addObserver(P, prefObserver);
    syncPacks();

    // mouseover fires on element boundaries only, not per pixel; with the
    // per-origin 60s throttle inside warm() this is effectively free.
    document.addEventListener("mouseover", onHover, { passive: true });
    hookOverLink();
    try { gBrowser.addTabsProgressListener(navListener); } catch {}

    if (bool("startup-warmup", true) && isMainAppWindow()) {
      setTimeout(startupWarmup, Math.max(0, num("startup-warm-delay-ms", 4000)));
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
          hoverWarmup: bool("hover-warmup", true),
          startupWarmup: bool("startup-warmup", true),
          warmedThisSession: recentWarm.size,
        };
      },
      // Measured, not claimed: how many warmed sockets a real request landed
      // on before they went cold. A low rate means the warming is aimed wrong.
      stats: () => ({
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

    const cleanup = () => {
      try { Services.prefs.removeObserver(P, prefObserver); } catch {}
      try { document.removeEventListener("mouseover", onHover); } catch {}
      try { unhookOverLink(); } catch {}
      try { clearTimeout(dwellTimer); dwellTimer = null; } catch {}
      try { gBrowser.removeTabsProgressListener(navListener); } catch {}
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
  // This script asks bool("favicons", true). Sine's settings panel, deciding
  // whether to show a row conditioned on that same pref, asks
  // getBoolPref("zzgroup.favicons", false). Both are reasonable in isolation
  // and together they produce a mod behaving as if a setting is on while
  // every row it governs is hidden as if it were off. A -moz-pref() media
  // query in the stylesheet is a third reader with its own answer.
  //
  // Writing each declared default once, and only when the pref has never
  // been set, removes the disagreement for all three at once. Nothing that
  // was already chosen is touched.
  const MOD_ID = "zz-zen-turbo";
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
