// Run in Zen's Browser Console (Ctrl+Shift+J): the loader in ARRIVAL-PROBE.md, or this complete
// IIFE pasted. Recording starts at once.
// Up to about 15 s of automatic switches between two browser windows (with one window, a
// temporary second window opens and closes again), then 40 s in which you switch
// windows your usual way once or twice. The report is copied and logged at the end,
// 75 s at most. window.__zzArrivalProbe.stop() ends early, restores and copies.
(async () => {
  'use strict';
  const PROBE = 'zen-arrival-v2', DEADLINE = 75000, PASSIVE = 40000, XHTML = 'http://www.w3.org/1999/xhtml';
  const LIMITS = { events: 200, rings: 24, opacity: 40, pixels: 8, windows: 16 };
  const MARK = Symbol.for('zzrouter.switchToTabHavingURI'), OWN = Symbol('zzArrivalProbe'), ENDED = Symbol('ended');
  // The automatic switches: Firefox's switch to an open tab, Tab Router's own, then one of them again for pixels.
  const PATHS = ['switchToTabHavingURI', 'tabRouterSwitchIfOpen'], PIXELS = 'pixels';
  const browsers = () => [...Services.wm.getEnumerator('navigator:browser')].filter(w => !w.closed);
  const first = Services.wm.getMostRecentWindow('navigator:browser');
  if (!first) return { probe: PROBE, status: 'no-browser-window' };
  for (const w of browsers()) try { await w.__zzArrivalProbe?.stop('replaced'); } catch {}
  const clock = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const start = ChromeUtils.now(), now = () => Math.round(ChromeUtils.now() - start);
  const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const timers = new Set(), cleanups = [], tracked = new Map(), live = new Map(), pending = new Set(), rings = new WeakMap();
  let ended = false, phase = 'setup', callAt = 0, pixelBudget = LIMITS.pixels, resolveDone, api;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const later = (fn, ms) => { const id = clock.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  // Once the probe has ended, waits never resume: the automatic phase stops where it was.
  const sleep = ms => new Promise((resolve, reject) => later(() => ended ? reject(ENDED) : resolve(), ms));
  const within = (promise, ms) => new Promise((resolve, reject) => { later(() => reject(Error('timeout')), ms); Promise.resolve(promise).then(resolve, reject); });
  async function until(test, ms) {
    for (const end = now() + ms; ; await sleep(50)) { if (ended) throw ENDED; if (attempt(test, false)) return true; if (now() >= end) return false; }
  }
  const version = v => typeof v === 'string' && /^\d{1,4}(?:\.\d{1,4}){0,3}(?:[ab]\d{0,3}|esr)?$/.test(v) ? v : null;
  const stamp = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) ? v : null;
  const names = new WeakMap(); let serial = 0;
  // Windows are named W1, W2 ... in the report; other windows by kind only. Never titles.
  const id = win => {
    if (!win || names.has(win)) return win ? names.get(win) : 'none';
    const type = attempt(() => win.document.documentElement.getAttribute('windowtype'), '');
    if (type === 'navigator:browser') names.set(win, 'W' + ++serial);
    return names.get(win) || { 'devtools:webconsole': 'browser-console', 'Places:Organizer': 'library' }[type] || 'other-window';
  };
  const report = { probe: PROBE, status: 'running', elapsedMs: 0, startActive: null,
    evidence: 'auto: direct calls from this probe (synthetic). They test the switch code, window activation and Gecko rendering, not physical input or the physical screen. ' +
      'passive: your own switches. markArrival: calls through window.TabRouter.markArrival; Tab Router 1.45.1 draws Switch to Tab from its own switchIfNeeded instead ' +
      '(switchingFrom names the window you came from). pixels: drawSnapshot, a fresh Gecko rendering of the ring edge at its peak against the same area after it, ' +
      'not a screen capture, taken only in the extra auto "pixels" switch because each snapshot stalls the window for a moment. ' +
      'frames/paints/framesIn1s: refresh ticks and paints of that window, not proof that the screen showed them. ' +
      'opacity: worked out each frame from the ring animation\'s keyframes and progress, with no style read that would slow the ring it measures.',
    env: {}, mods: {}, runtime: {}, auto: { paths: [] }, passive: null, rings: [], events: [], dropped: { events: 0, rings: 0 }, cleanup: {}, failures: [] };
  const fail = code => { if (!report.failures.includes(code) && report.failures.length < 16) report.failures.push(code); };
  const event = (type, win, extra = {}) => {
    if (ended || report.events.length >= LIMITS.events) { if (!ended) report.dropped.events++; return null; }
    const entry = { ms: now(), phase, type, win: id(win), ...extra };
    report.events.push(entry); return entry;
  };
  const startActive = Services.focus.activeWindow;
  report.startActive = id(startActive);

  // ---- what is installed and what is running ----
  const SIZE = { 1: 'maximized', 2: 'minimized', 3: 'normal', 4: 'fullscreen' }, screens = [];
  const screenOf = win => attempt(() => {
    const s = win.screen, key = [s.left, s.top, s.width, s.height].map(Math.round).join(' ') + ' @' + Math.round(win.devicePixelRatio * 100) / 100;
    if (!screens.includes(key) && screens.length < 8) screens.push(key);
    return screens.indexOf(key);
  }, -1);
  const state = win => attempt(() => ({ active: Services.focus.activeWindow === win, focused: win.document.hasFocus(), sizemode: SIZE[win.windowState] || 'other',
    hidden: win.document.hidden, occluded: attempt(() => win.isFullyOccluded), painting: attempt(() => win.browsingContext.isActive),
    bounds: [win.screenX, win.screenY, win.outerWidth, win.outerHeight].map(Math.round), screen: screenOf(win) }), { closed: true });
  const PREFS = ['widget.windows.window_occlusion_tracking.enabled', 'widget.windows.window_occlusion_tracking_display_state.enabled',
    'widget.windows.window_occlusion_tracking_session_lock.enabled', 'gfx.webrender.all', 'gfx.webrender.software', 'gfx.webrender.compositor',
    'layers.acceleration.disabled', 'layout.frame_rate', 'ui.prefersReducedMotion', 'toolkit.cosmeticAnimations.enabled',
    'browser.urlbar.switchTabs.adoptIntoActiveWindow', 'browser.urlbar.switchTabs.searchAllContainers', 'browser.tabs.splitView.enabled',
    'zzrouter.enabled', 'zzrouter.switch-to-open'];
  const pref = key => attempt(() => {
    const p = Services.prefs, type = p.getPrefType(key), text = type === 32 ? p.getStringPref(key) : '';
    return type === 128 ? p.getBoolPref(key) : type === 64 ? p.getIntPref(key) : type === 32 ? (/^[\w.,: -]{0,40}$/.test(text) ? text : '<text>') : null;
  });
  const prefs = {};
  for (const key of [...PREFS, ...attempt(() => Services.prefs.getChildList('zen.window-sync.').sort().slice(0, 12), [])]) prefs[key] = pref(key);
  const OS = ['WINNT', 'Darwin', 'Linux'].includes(Services.appinfo.OS) ? Services.appinfo.OS : 'other';
  report.env = { os: OS, osVersion: attempt(() => /^[\w.-]{1,32}$/.exec(Services.sysinfo.getProperty('version'))[0]),
    osBuild: OS === 'WINNT' ? attempt(() => ChromeUtils.importESModule('resource://gre/modules/components-utils/WindowsVersionInfo.sys.mjs')
      .WindowsVersionInfo.get({ throwOnError: false }).buildNumber) : null,
    zen: version(Services.appinfo.version), firefox: version(Services.appinfo.platformVersion),
    renderer: attempt(() => String(first.windowUtils.layerManagerType).slice(0, 40)),
    reducedMotion: attempt(() => first.matchMedia('(prefers-reduced-motion: reduce)').matches),
    accent: attempt(() => first.getComputedStyle(first.document.documentElement).getPropertyValue('--zen-primary-color').trim().slice(0, 64)), screens, prefs };
  const MODS = ['tab-router', 'groupflow', 'glassflow'];
  const versions = Promise.all(MODS.map(async mod => {
    report.mods[mod] = { disk: null, registry: null };
    try { report.mods[mod].disk = version((await within(first.fetch(`chrome://sine/content/zz-${mod}/theme.json`).then(r => r.json()), 2000)).version); } catch {}
  })).then(async () => {
    const registry = await within(IOUtils.readJSON(PathUtils.join(Services.dirsvc.get('ProfD', Ci.nsIFile).path, 'chrome', 'sine-mods', 'mods.json')), 2000);
    for (const [mod, m] of MODS.map(mod => [mod, registry?.['zz-' + mod]]).filter(([, m]) => m))
      report.mods[mod].registry = { version: version(m.version), updatedAt: stamp(m.updatedAt), enabled: !!m.enabled, noUpdates: !!m['no-updates'] };
  }).catch(() => fail('sine-registry-unavailable'));
  const helper = attempt(() => ChromeUtils.importESModule('resource:///modules/URILoadingHelper.sys.mjs').URILoadingHelper);
  const PBU = attempt(() => ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs').PrivateBrowsingUtils);
  const isPrivate = win => !!attempt(() => PBU.isWindowPrivate(win), false);
  const runtime = win => attempt(() => {
    const router = win.TabRouter, ws = win.gZenWorkspaces;
    return { win: id(win), private: isPrivate(win), synced: !win.document.documentElement.hasAttribute('zen-unsynced-window'),
      tabs: win.gBrowser.tabs.length, liveTabs: win.gBrowser.tabs.filter(t => t._zenContentsVisible).length, tabRouter: !!router,
      markArrival: typeof router?.markArrival === 'function', switchIfOpen: typeof router?.switchIfOpen === 'function',
      switchIfNeededWrapped: !!ws && Object.hasOwn(ws, 'switchIfNeeded'), groupflow: !!win.Groupflow,
      renderer: attempt(() => String(win.windowUtils.layerManagerType).slice(0, 40)), state: state(win) };
  }, { win: id(win), unavailable: true });
  for (const w of browsers()) id(w);
  report.runtime = { routerApi: attempt(() => Object.keys(first.TabRouter).filter(k => /^[A-Za-z]{1,32}$/.test(k)).sort().slice(0, 64)),
    switchToTabPatched: !!attempt(() => helper.switchToTabHavingURI[MARK]), windows: browsers().slice(0, LIMITS.windows).map(runtime) };

  // ---- rings: Tab Router's arrival glow, found by its shape in any version ----
  // An inert positioned overlay drawn as a 2 px inset shadow (1.45.0, 1.45.1) or a solid border.
  const ringStyle = n => /0px 0px 0px 2px inset|inset 0px 0px 0px 2px/.test(n.style.boxShadow || '') ? 'box-shadow'
    : /^\d+(?:\.\d+)?px solid /.test(n.style.border || '') ? 'border' : null;
  const ringLike = n => n?.localName === 'div' && n.namespaceURI === XHTML && n.getAttribute?.('aria-hidden') === 'true' &&
    /^(?:absolute|fixed)$/.test(n.style?.position || '') && n.style.pointerEvents === 'none' && !!ringStyle(n);
  const rectOf = n => attempt(() => { const r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  const HOLDERS = ['browserSidebarContainer', 'tab-stack', 'tab-group-label-container'];
  const holderOf = n => attempt(() => n.parentNode === n.ownerDocument.documentElement ? 'root' : n.parentNode.id === 'tabbrowser-tabpanels' ? 'tabpanels'
    : HOLDERS.find(c => n.parentNode.classList.contains(c)) || 'other');
  const lastActivate = new WeakMap();
  // At most 240 x 240 px of the ring's left edge, full scale: shrinking a page-sized
  // ring to fit blends its 2 px border away.
  async function snapshot(win, [x, y, w, h]) {
    y += Math.max(0, Math.round((h - 240) / 2)); w = Math.max(1, Math.min(w, 240)); h = Math.max(1, Math.min(h, 240));
    const canvas = Object.assign(win.document.createElementNS(XHTML, 'canvas'), { width: w, height: h }), g = canvas.getContext('2d', { willReadFrequently: true });
    let method = 'drawSnapshot';
    try {
      const bitmap = await within(win.browsingContext.currentWindowGlobal.drawSnapshot(new win.DOMRect(x, y, w, h), 1, 'rgb(255,255,255)'), 2000);
      g.drawImage(bitmap, 0, 0); attempt(() => bitmap.close());
    } catch { method = 'drawWindow'; g.drawWindow(win, x, y, w, h, 'rgb(255,255,255)'); }
    return { method, size: [w, h], data: g.getImageData(0, 0, w, h).data };
  }
  function compare(peak, base, accent) {
    const out = { method: peak.method, size: peak.size, total: peak.size[0] * peak.size[1], changed: 0, towardAccent: 0 };
    if (!accent || peak.data.length !== base.data.length) return { ...out, error: accent ? 'size-mismatch' : 'accent-unknown' };
    const a = peak.data, b = base.data, far = (d, i) => Math.abs(d[i] - accent[0]) + Math.abs(d[i + 1] - accent[1]) + Math.abs(d[i + 2] - accent[2]);
    for (let i = 0; i < a.length; i += 4) {
      if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 24) out.changed++;
      if (far(b, i) - far(a, i) > 36) out.towardAccent++;
    }
    return out;
  }
  // A keyframe's easing: the CSS keywords and cubic-bezier(); anything else counts as linear.
  const BEZIER = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
  function easing(text) {
    const p = BEZIER[text] || /^cubic-bezier\(([^)]*)\)$/.exec(text || '')?.[1].split(',').map(Number);
    if (!p || p.length !== 4 || !p.every(Number.isFinite)) return t => t;
    const at = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    return x => { let lo = 0, hi = 1, t = x; for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (at(p[0], p[2], t) < x) lo = t; else hi = t; } return at(p[1], p[3], t); };
  }
  // The ring's opacity from its animation: keyframes read once, progress per frame. Reading
  // computed style every frame cut a box-shadow ring's window from about 60 to about 10
  // refresh ticks a second (Linux, software WebRender).
  function opacityCurve(anim) {
    const keys = attempt(() => anim.effect.getKeyframes().map(k => ({ at: k.computedOffset, value: Number(k.opacity), ease: easing(k.easing) }))
      .filter(k => Number.isFinite(k.at) && k.opacity !== '' && Number.isFinite(k.value)), []);
    if (keys.length < 2) return null;
    return () => {
      const p = attempt(() => anim.effect.getComputedTiming().progress);
      if (typeof p !== 'number') return null;
      let i = 0; while (i < keys.length - 2 && p > keys[i + 1].at) i++;
      const a = keys[i], b = keys[i + 1], span = b.at - a.at;
      return span > 0 ? a.value + (b.value - a.value) * a.ease(Math.min(1, Math.max(0, (p - a.at) / span))) : b.value;
    };
  }
  function ringAdded(win, n) {
    if (ended) return;
    if (report.rings.length >= LIMITS.rings) { report.dropped.rings++; return; }
    const anim = attempt(() => n.getAnimations()[0]), duration = attempt(() => anim.effect.getTiming().duration), curve = anim && opacityCurve(anim);
    // Snapshots stall the window, so only the extra pixels switch takes them: every other ring keeps clean frame counts.
    const sample = phase === 'auto:' + PIXELS;
    const ring = { ms: now(), phase, win: id(win), holder: holderOf(n), style: ringStyle(n), position: n.style.position || null, zIndex: n.style.zIndex || null, rect: rectOf(n),
      durationMs: typeof duration === 'number' ? Math.round(duration) : null, afterCallMs: phase.startsWith('auto:') ? now() - callAt : null,
      afterActivateMs: lastActivate.has(win) ? now() - lastActivate.get(win) : null, atAdd: state(win),
      frames: 0, paints: 0, opacitySource: curve ? 'animation' : 'none', opacity: [], maxOpacity: 0, removedAfterMs: null, connectedAtEnd: null, pixels: null };
    report.rings.push(ring);
    // Computed style once, at add: the accent comes from the shadow or the border, whichever draws the ring.
    const accent = attempt(() => { const cs = win.getComputedStyle(n);
      return (ring.style === 'border' ? cs.borderTopColor : cs.boxShadow).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/).slice(1, 4).map(Number); });
    ring.accent = accent;
    const paint = () => { ring.paints++; };
    win.addEventListener('MozAfterPaint', paint);
    let frame = 0, peak = null;
    const end = () => {
      if (!live.has(ring)) return;
      live.delete(ring); attempt(() => win.removeEventListener('MozAfterPaint', paint)); attempt(() => win.cancelAnimationFrame(frame));
      ring.connectedAtEnd = !!n.isConnected;
      if (!sample) return;
      if (!peak) { ring.pixels = { skipped: pixelBudget ? (ring.frames ? 'peak-not-sampled' : 'no-frames') : 'budget' }; return; }
      if (n.isConnected) { ring.pixels = { skipped: 'ring-still-attached' }; return; }
      const job = Promise.all([peak, snapshot(win, ring.rect)]).then(([a, b]) => { ring.pixels = compare(a, b, accent); }, () => { ring.pixels = { error: 'snapshot-failed' }; });
      pending.add(job); job.finally(() => pending.delete(job));
    };
    live.set(ring, end);
    rings.set(n, () => { ring.removedAfterMs = now() - ring.ms; end(); });
    const step = () => {
      if (!live.has(ring)) return;
      ring.frames++;
      const value = curve?.(), o = value == null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
      if (o != null) ring.maxOpacity = Math.max(ring.maxOpacity, o);
      if (ring.opacity.length < LIMITS.opacity) ring.opacity.push(o);
      if (sample && !peak && pixelBudget > 0 && (o >= 0.9 || attempt(() => anim.currentTime >= 0.3 * duration, false))) {
        pixelBudget--; ring.peakOpacity = o; peak = snapshot(win, ring.rect); peak.catch(() => {});
      }
      frame = win.requestAnimationFrame(step);
    };
    frame = win.requestAnimationFrame(step);
    later(end, 4000); // a window that never refreshes never removes its ring either
  }

  // ---- per window: activation, selection, rings, and the switch calls ----
  function wrap(win) {
    const undo = tracked.get(win), router = win.TabRouter, original = router?.markArrival;
    if (!undo) return;
    if (typeof original === 'function' && !original[OWN]) {
      const wrapped = function (tab, switching) { event('markArrival', win, { tabHere: attempt(() => tab.ownerDocument.defaultView === win),
        awaitsSwitch: typeof switching?.then === 'function', active: id(Services.focus.activeWindow) }); return original.apply(this, arguments); };
      wrapped[OWN] = true; router.markArrival = wrapped;
      undo.push(() => { if (router.markArrival === wrapped) router.markArrival = original; else fail('markArrival-replaced'); });
    }
    const ws = win.gZenWorkspaces, inner = ws?.switchIfNeeded;
    if (typeof inner === 'function' && !inner[OWN]) {
      const own = Object.getOwnPropertyDescriptor(ws, 'switchIfNeeded');
      const wrapped = function () { event('switchIfNeeded', win, { switchingFrom: id(attempt(() => helper.switchToTabHavingURI.switchingFrom)),
        active: id(Services.focus.activeWindow) }); return inner.apply(this, arguments); };
      wrapped[OWN] = true; ws.switchIfNeeded = wrapped;
      // Tab Router's own wrapper is an own property; Zen's switchIfNeeded lives on the prototype.
      undo.push(() => ws.switchIfNeeded !== wrapped ? fail('switchIfNeeded-replaced') : own ? Object.defineProperty(ws, 'switchIfNeeded', own) : delete ws.switchIfNeeded);
    }
  }
  function attach(win, opened = false) {
    if (ended || tracked.has(win) || tracked.size >= LIMITS.windows) return;
    const undo = []; tracked.set(win, undo); id(win);
    if (opened) event('window-opened', win);
    const listen = (target, type, fn) => { target.addEventListener(type, fn, true); undo.push(() => target.removeEventListener(type, fn, true)); };
    // An activated window that does not refresh (covered, minimised) cannot show a ring.
    let ticker = 0;
    listen(win, 'activate', () => {
      lastActivate.set(win, now());
      const s = state(win), entry = event('activate', win, { sizemode: s.sizemode, occluded: s.occluded, painting: s.painting, hidden: s.hidden, framesIn1s: 0 });
      if (!entry) return;
      const stop = now() + 1000, tick = () => { if (ended || now() > stop) return; entry.framesIn1s++; ticker = win.requestAnimationFrame(tick); };
      attempt(() => win.cancelAnimationFrame(ticker)); ticker = win.requestAnimationFrame(tick);
    });
    undo.push(() => attempt(() => win.cancelAnimationFrame(ticker)));
    listen(win, 'deactivate', () => event('deactivate', win));
    listen(win, 'TabSelect', e => event('TabSelect', win, { activeHere: Services.focus.activeWindow === win,
      sinceActivateMs: lastActivate.has(win) ? now() - lastActivate.get(win) : null, web: !!attempt(() => /^https?$/.test(e.target.linkedBrowser.currentURI.scheme)) }));
    listen(win, 'sizemodechange', () => event('sizemode', win, { sizemode: SIZE[win.windowState] || 'other' }));
    listen(win.document, 'visibilitychange', () => event('visibility', win, { hidden: win.document.hidden, occluded: attempt(() => win.isFullyOccluded) }));
    listen(win, 'unload', e => {
      if (e.target === win.document) { event('window-closed', win); tracked.delete(win); if (!browsers().some(w => w !== win)) finish('window-closed'); }
    });
    const observer = new win.MutationObserver(records => { for (const r of records) {
      for (const n of r.addedNodes) if (ringLike(n)) ringAdded(win, n);
      for (const n of r.removedNodes) rings.get(n)?.();
    } });
    observer.observe(win.document.documentElement, { childList: true, subtree: true });
    undo.push(() => observer.disconnect());
    // A window opened now is wrapped once its own Tab Router has wrapped Zen's
    // switchIfNeeded, so ours stays on top and comes off cleanly.
    if (!opened || win.TabRouter) wrap(win);
    else until(() => win.TabRouter, 8000).then(() => wrap(win), () => {});
    if (api) win.__zzArrivalProbe = api;
  }
  // Firefox's switch (Switch to Tab and friends). Tab Router 1.45.1 marks it and
  // notes the window you came from on itself; that note is watched, not replaced.
  const switchFn = helper?.switchToTabHavingURI;
  if (switchFn?.[MARK]) {
    const had = Object.getOwnPropertyDescriptor(switchFn, 'switchingFrom'), stack = [];
    let value = had?.value;
    Object.defineProperty(switchFn, 'switchingFrom', { configurable: true, get: () => value, set: v => {
      if (stack.length && v === stack[stack.length - 1]) stack.pop();
      else { stack.push(value); event('switchToTabHavingURI', v, { patched: true }); }
      value = v;
    } });
    cleanups.push(() => {
      if (!Object.getOwnPropertyDescriptor(switchFn, 'switchingFrom')?.get) return;
      delete switchFn.switchingFrom;
      if (had || value !== undefined) switchFn.switchingFrom = value;
    });
  } else if (typeof switchFn === 'function') {
    const wrapped = function () { event('switchToTabHavingURI', Services.focus.activeWindow, { patched: false }); return switchFn.apply(this, arguments); };
    wrapped[OWN] = true; helper.switchToTabHavingURI = wrapped;
    cleanups.push(() => { if (helper.switchToTabHavingURI === wrapped) helper.switchToTabHavingURI = switchFn; else fail('switchToTabHavingURI-replaced'); });
  }
  const opened = { observe: win => attach(win, true) };
  try { Services.obs.addObserver(opened, 'browser-delayed-startup-finished'); cleanups.push(() => Services.obs.removeObserver(opened, 'browser-delayed-startup-finished')); } catch {}
  // The probe's own code dies with the window it was pasted into: finish first.
  const hostUnload = e => { if (e.target === globalThis.document) finish('window-closed'); };
  attempt(() => { globalThis.addEventListener('unload', hostUnload, true); cleanups.push(() => globalThis.removeEventListener('unload', hostUnload, true)); });

  // ---- automatic phase: two windows, a page live in one, each switch from the other ----
  const temp = { win: null, tab: null, id: null, url: null }, selected = new Map();
  let origin = null, destination = null, autoDone = false;
  const webURI = tab => attempt(() => { const u = tab.linkedBrowser.currentURI; return /^https?$/.test(u.scheme) ? u : null; });
  const pageOf = uri => attempt(() => uri.host.replace(/^www\./, '') + uri.filePath.replace(/\/+$/, ''));
  async function activate(win) {
    const at = now(); attempt(() => win.focus());
    const ok = await until(() => Services.focus.activeWindow === win, 3000); await sleep(400); return { ok, ms: now() - at };
  }
  // A page shown in the destination and in no tab of the origin, in the destination's
  // current space: its selected tab first. Otherwise a temporary tab on a port Gecko
  // refuses to contact (9), so no request leaves the machine.
  function pickTarget(O, D) {
    const inOrigin = new Set(O.gBrowser.tabs.map(t => pageOf(webURI(t))).filter(Boolean));
    const fits = t => attempt(() => !t.closing && !t.hasAttribute('pending') && !t.hasAttribute('zen-glance-tab') && !t.hasAttribute('zen-empty-tab') &&
      !t.hasAttribute('zzgf-page-tab') && !t.splitView && !t.hasAttribute('split-view') && !!webURI(t) && !inOrigin.has(pageOf(webURI(t))) &&
      (t.selected || t.hasAttribute('zen-essential') || t.getAttribute('zen-workspace-id') === D.gZenWorkspaces?.activeWorkspace), false);
    const tab = [D.gBrowser.selectedTab, ...D.gBrowser.tabs].find(fits);
    return tab && { tab, source: tab.selected ? 'selected' : 'background' };
  }
  async function temporaryTab(D) {
    const url = temp.url = 'http://127.0.0.1:9/zz-arrival-probe-' + Math.random().toString(36).slice(2, 10);
    const tab = temp.tab = D.gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), skipAnimation: true });
    temp.id = tab.id;
    attempt(() => D.SessionStore.setCustomTabValue(tab, 'zzrouterLocked', 'true')); // Tab Router leaves it where it opened
    D.gBrowser.selectedTab = tab;
    await until(() => tab.linkedBrowser.currentURI.spec === url && !tab.hasAttribute('busy'), 8000);
    return { tab, source: 'temporary' };
  }
  async function automated() {
    const normal = browsers().filter(w => !isPrivate(w) && w.gBrowser && attempt(() => w.toolbar.visible, true));
    const O = origin = normal.includes(first) ? first : normal[0];
    if (!O) { report.auto.skipped = 'no-normal-window'; return; }
    const order = attempt(() => [...Services.wm.getZOrderDOMWindowEnumerator('navigator:browser', true)], []);
    let D = [...order, ...normal].find(w => w !== O && normal.includes(w) && w.windowState !== 2) || normal.find(w => w !== O);
    if (!D) {
      D = temp.win = O.OpenBrowserWindow();
      if (!await until(() => D.gBrowserInit?.delayedStartupFinished, 15000)) { report.auto.skipped = 'temporary-window-not-ready'; return; }
      try { await within(D.gZenStartup?.promiseInitialized, 5000); } catch {}
      attach(D, true);
      await until(() => D.TabRouter, 5000); await sleep(800);
    }
    destination = D;
    for (const w of [O, D]) selected.set(w, w.gBrowser.selectedTab);
    // The address bar hands switchToTabHavingURI the current tab's `splitview`: Firefox's own split
    // view, locked off in Zen 1.24.2b. Zen's split view (`splitView`) never reaches it.
    Object.assign(report.auto, { origin: id(O), destination: id(D), temporaryWindow: !!temp.win,
      originNativeSplitView: !!attempt(() => O.gBrowser.selectedTab.splitview), originZenSplitView: !!attempt(() => O.gBrowser.selectedTab.splitView) });
    report.auto.firstActivation = await activate(O);
    const target = pickTarget(O, D) || await temporaryTab(D), tab = target.tab;
    const uri = webURI(tab), ctx = parseInt(tab.getAttribute('usercontextid') || '0', 10);
    if (!uri) { report.auto.skipped = 'no-target-page'; return; }
    const copy = attempt(() => O.gBrowser.tabs.find(t => t.id === tab.id));
    report.auto.target = { source: target.source, host: attempt(() => uri.host.slice(0, 80)), container: ctx,
      originCopy: copy ? { pending: copy.hasAttribute('pending'), web: !!webURI(copy) } : null };
    const paths = [
      // As the address bar's Switch to Tab calls it, without adopting and never opening a new tab.
      [PATHS[0], typeof O.switchToTabHavingURI === 'function' && (() => O.switchToTabHavingURI(uri, false, {}, ctx, null))],
      // Tab Router's own switch to an open page (link clicks, new tabs, folder pages).
      [PATHS[1], typeof O.TabRouter?.switchIfOpen === 'function' && (() => O.TabRouter.switchIfOpen(uri.spec, ctx))],
      // Once more by the first switch that drew a ring, Tab Router's preferred: this time the ring edge is snapshotted.
      [PIXELS, () => { const [, call] = paths[pixelsVia === PATHS[1] ? 1 : 0]; return call(); }],
    ];
    let pixelsVia = null;
    for (const [path, call] of paths) {
      const row = { path };
      report.auto.paths.push(row);
      if (path === PIXELS) {
        pixelsVia = [PATHS[1], PATHS[0]].find(p => report.auto.paths.find(r => r.path === p)?.rings?.length) || null;
        if (!pixelsVia) { row.skipped = 'no-ring'; continue; }
        row.via = pixelsVia;
      }
      if (!call) { row.skipped = 'api-absent'; continue; }
      if (O.closed || D.closed) { row.skipped = 'window-closed'; continue; }
      row.activation = await activate(O);
      if (!tab.isConnected || tab.closing || !webURI(tab)) { row.skipped = 'target-gone'; continue; }
      row.before = { origin: state(O), destination: state(D) };
      const fromEvent = report.events.length, fromRing = report.rings.length;
      phase = 'auto:' + path; callAt = now();
      try { row.returned = !!call(); } catch { row.returned = 'threw'; }
      row.callMs = now() - callAt;
      row.destinationActiveMs = await until(() => Services.focus.activeWindow === D, 2000) ? now() - callAt : null;
      await until(() => now() - callAt >= 1500 && !live.size, 4000);
      if (path === PIXELS) await until(() => !pending.size, 3000);
      row.after = { origin: state(O), destination: state(D),
        landed: O.gBrowser.selectedTab?.id === tab.id ? 'origin' : D.gBrowser.selectedTab === tab ? 'destination' : 'neither' };
      const events = report.events.slice(fromEvent), of = type => events.filter(e => e.type === type);
      row.calls = { switchToTabHavingURI: of('switchToTabHavingURI').map(e => e.win),
        switchIfNeeded: of('switchIfNeeded').map(e => ({ win: e.win, ms: e.ms - callAt, switchingFrom: e.switchingFrom })),
        markArrival: of('markArrival').map(e => ({ win: e.win, ms: e.ms - callAt })), activate: of('activate').map(e => ({ win: e.win, ms: e.ms - callAt })) };
      row.rings = report.rings.slice(fromRing).map((_, i) => fromRing + i);
      phase = 'auto';
    }
    autoDone = true;
  }
  // A Stop, the deadline or a closed window during the automatic phase: every switch that has
  // no result says why. (Its pending wait is cancelled with the timers, so this runs in finish.)
  function markUnfinished(reason) {
    const a = report.auto;
    if (autoDone || a.skipped) return;
    a.unfinished = reason;
    for (const path of [...PATHS, PIXELS]) if (!a.paths.some(row => row.path === path)) a.paths.push({ path });
    for (const row of a.paths) if (!row.after && !row.skipped) row.skipped = reason;
  }
  // The temporary tab and its synced copies: closing a window hands its live tabs to another window.
  const strays = () => temp.tab ? browsers().flatMap(w => w.gBrowser.tabs.filter(t => !t.closing &&
    (t === temp.tab || t.id === temp.id || attempt(() => t.linkedBrowser.currentURI.spec === temp.url))).map(t => [w, t])) : [];
  const sweep = () => { for (const [w, t] of strays()) attempt(() => w.gBrowser.removeTab(t, { animate: false })); };
  let restored = false;
  function restoreAuto() {
    if (restored) return;
    const c = report.cleanup; restored = true;
    for (const [win, tab] of selected) if (!win.closed && win !== temp.win && tab.isConnected && !tab.closing && win.gBrowser.selectedTab !== tab) attempt(() => { win.gBrowser.selectedTab = tab; });
    c.selectionRestored = [...selected].every(([win, tab]) => win.closed || win === temp.win || win.gBrowser.selectedTab === tab);
    sweep();
    if (temp.win && !temp.win.closed) attempt(() => temp.win.close());
    // The stacking you had: the origin back over the destination, then whatever was in front.
    if (origin && !origin.closed && destination) attempt(() => origin.focus());
    const back = [startActive, origin].find(w => w && !w.closed && w !== temp.win);
    if (back) attempt(() => back.focus());
    c.refocused = id(back);
  }

  async function finish(reason = 'completed') {
    if (ended) return done;
    ended = true; report.status = reason;
    attempt(() => markUnfinished(reason));
    attempt(restoreAuto);
    for (const end of [...live.values()]) attempt(end);
    for (const undo of [...tracked.values()]) for (const fn of undo.reverse()) attempt(fn);
    tracked.clear();
    for (const fn of cleanups.reverse()) attempt(fn);
    try { await within(Promise.all([versions, ...pending]), 2500); } catch { fail('finish-timeout'); }
    for (let i = 0; temp.win && !temp.win.closed && i < 40; i++) await new Promise(r => clock.setTimeout(r, 50));
    if (temp.tab) { await new Promise(r => clock.setTimeout(r, 300)); sweep(); }
    for (const t of timers) clock.clearTimeout(t);
    timers.clear();
    if (report.passive) {
      const events = report.events.filter(e => e.phase === 'passive'), n = type => events.filter(e => e.type === type).length;
      const passiveRings = report.rings.filter(r => r.phase === 'passive');
      const marks = [...events.filter(e => /^(?:switchToTabHavingURI|switchIfNeeded|markArrival)$/.test(e.type)), ...passiveRings].map(e => e.ms);
      Object.assign(report.passive, { toMs: now(), activations: n('activate'), tabSelects: n('TabSelect'), switchToTabHavingURI: n('switchToTabHavingURI'),
        switchIfNeeded: n('switchIfNeeded'), markArrival: n('markArrival'), rings: passiveRings.length,
        // A window switch with no switch to an open page or ring around it (Alt+Tab, the taskbar, a click): no ring by design.
        plainActivations: events.filter(e => e.type === 'activate' && !marks.some(ms => ms >= e.ms - 1500 && ms <= e.ms + 1500)).length });
    }
    const c = report.cleanup, left = [];
    for (const w of browsers()) {
      if (attempt(() => w.TabRouter?.markArrival?.[OWN])) left.push(id(w) + ':markArrival');
      if (attempt(() => w.gZenWorkspaces?.switchIfNeeded?.[OWN])) left.push(id(w) + ':switchIfNeeded');
      if (w.__zzArrivalProbe === api) delete w.__zzArrivalProbe;
    }
    if (attempt(() => helper.switchToTabHavingURI[OWN] || Object.getOwnPropertyDescriptor(helper.switchToTabHavingURI, 'switchingFrom')?.get)) left.push('switchToTabHavingURI');
    if (temp.win && !temp.win.closed) left.push('temporary-window'); if (strays().length) left.push('temporary-tab');
    Object.assign(c, { leftovers: left, temporaryWindowClosed: temp.win ? temp.win.closed : null, temporaryTabRemoved: temp.tab ? !strays().length : null,
      ringsStillShown: browsers().reduce((sum, w) => sum + (attempt(() => [...w.document.querySelectorAll('div[aria-hidden="true"]')].filter(ringLike).length, 0)), 0) });
    report.runtime.windowsAtEnd = browsers().slice(0, LIMITS.windows).map(w => ({ win: id(w), ...state(w) }));
    report.elapsedMs = now();
    let json = JSON.stringify(report);
    try { Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(json); }
    catch { fail('clipboard-unavailable'); json = JSON.stringify(report); }
    console.log('[Zen arrival report]', json);
    resolveDone(JSON.parse(json)); // the copied report, whatever settles later
    return done;
  }

  api = { stop: reason => finish(reason === 'replaced' ? 'replaced' : 'stopped'), done, get phase() { return phase; } };
  for (const w of browsers()) attach(w);
  later(() => finish('deadline'), DEADLINE);
  console.log('[Zen arrival probe] Recording about 75 s: automatic window switches first (about 15 s), then switch windows your usual way once or twice. The report copies itself.');
  automated().catch(e => { if (e !== ENDED) fail('auto-error'); }).then(async () => {
    if (ended) return;
    phase = 'restore'; restoreAuto();
    try {
      await sleep(600); // the activations the restore itself causes stay out of the passive count
      sweep();
      phase = 'passive'; report.passive = { fromMs: now() };
      console.log('[Zen arrival probe] Your turn: switch between your windows your usual way, once or twice, within 40 s.');
      await sleep(PASSIVE); finish('completed');
    } catch {}
  });
  return done;
})();
