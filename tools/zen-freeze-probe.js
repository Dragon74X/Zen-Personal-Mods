// Paste this complete IIFE into Zen's Browser Console. Capture starts immediately.
// Reproduce sidebar/workspace lag, then move outside the sidebar for comparison.
// Recording lasts 30 s; Stop + copy is optional.
// Saves only the redacted report, never raw profiler data, in Downloads.
(async () => {
  'use strict';
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  if (!w) return { probe: 'zen-freeze-v2', status: 'no-browser-window' };
  await w.__zzZenFreezeProbe?.stop();
  const clock = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const started = w.performance.now(); let lastNow = 0;
  const now = () => { try { lastNow = w.performance.now() - started; } catch {} return lastNow; };
  const cleanups = [], windows = [], seen = new WeakSet(), timers = new Set();
  let ended = false, frame = 0, overlay, profiler, profilerToken, resolveDone, api;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const count = n => Number.isFinite(n) && n >= 0 ? Math.min(1e9, Math.round(n)) : 0;
  const ms = n => Math.round(n * 100) / 100;
  const version = v => typeof v === 'string' && /^\d{1,4}(?:\.\d{1,4}){0,3}(?:[ab]\d{0,3}|esr)?$/.test(v) ? v : null;
  const report = { probe: 'zen-freeze-v2', requestedMs: 30000, elapsedMs: 0,
    platform: ['WINNT', 'Darwin', 'Linux'].includes(Services.appinfo.OS) ? Services.appinfo.OS : 'other',
    browser: version(Services.appinfo.version), renderer: 'unknown', versions: {}, prefs: {}, windows: [],
    limits: { windows: 64, eventTimesPerWindow: 128, edgeSamplesPerWindow: 64, profileSamples: 5000, stackDepth: 128, modLines: 40 },
    newWindows: 0, omittedWindows: 0, heartbeatGaps: [], failures: [],
    profiler: { status: 'unavailable', intervalMs: 10 }, saved: { json: 0, zip: 0 },
    limitations: 'Main-thread timers can finish late during a freeze. Counts and sampled stacks do not measure display presentation, OS cursor latency or prove causation. Launcher-window rAF can throttle while hidden or minimized. Profiles stay in memory; only allowlisted parent-module file/line counts and fixed categories are exported.' };
  const fail = code => { if (!report.failures.includes(code) && report.failures.length < 16) report.failures.push(code); };
  const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const timeout = (promise, delay) => new Promise((resolve, reject) => {
    const id = clock.setTimeout(() => { timers.delete(id); reject(); }, delay); timers.add(id);
    Promise.resolve(promise).then(value => { clock.clearTimeout(id); timers.delete(id); resolve(value); }, () => { clock.clearTimeout(id); timers.delete(id); reject(); });
  });
  const stats = () => ({ count: 0, sumMs: 0, maxMs: 0, over50: 0, over100: 0, over500: 0 });
  const add = (s, value) => { if (!Number.isFinite(value) || value < 0) return; s.count++; s.sumMs = ms(s.sumMs + value); s.maxMs = Math.max(s.maxMs, ms(value)); for (const n of [50, 100, 500]) if (value > n) s['over' + n]++; };
  report.heartbeat = { requestedIntervalMs: 50, ...stats() }; report.animationFrames = stats();
  const mods = ['glassflow', 'groupflow', 'iconflow', 'glassflow-library', 'mediaflow', 'download-prompt', 'tab-router', 'tab-unloader', 'zen-turbo', 'peekflow'];
  const instances = ['__zzglassInstance', '__zzglassEdgesInstance', '__zzgroupInstance', '__zziconInstance', '__zziconPartsInstance', '__zziconMorphInstance', '__zzlibInstance', 'ZzMediaflowController', '__zzdlInstance', '__zzrouterInstance', '__zzunloadInstance', '__zzturboInstance', '__zzpeekInstance'];
  const names = ['zzglass.edges.follow-pointer', 'zzglass.edges.calculated', 'zzglass.motion.enabled', 'zzglass.motion.profile', 'zzglass.motion.light', 'zzglass.instant-ui',
    'zzglass.sidebar.enabled', 'zzglass.sidebar.rim', 'zzglass.sidebar.panel-border', 'zzglass.sidebar.edge-shade', 'zzglass.sidebar.blur', 'zzglass.sidebar.blur-radius',
    'zzglass.sidebar.blur-transparent-pages', 'zzglass.sidebar.page-follow', 'zzglass.sidebar.page-follow-always', 'zzglass.sidebar.page-follow-radius', 'zzglass.sidebar.page-follow-speed',
    'zzglass.workspaces.enabled', 'zzglass.workspaces.hover', 'zzglass.tabs.essentials-icon-grow', 'zen.theme.acrylic-sidebar', 'zen.view.sidebar-expanded',
    'zzicon.set', 'zzicon.animate', 'zzicon.menu.animate', 'zzicon.speed', 'ui.prefersReducedMotion', 'ui.prefersReducedTransparency',
    'zen.window-sync.enabled', 'zen.window-sync.sync-only-pinned-tabs', 'zzgroup.hover-scroll', 'zzgroup.connector-scroll'];
  for (const key of names) report.prefs[key] = attempt(() => {
    const p = Services.prefs, type = p.getPrefType(key);
    if (type === 128) return !!p.getBoolPref(key);
    if (type === 64) { const n = p.getIntPref(key); return Number.isFinite(n) && Math.abs(n) <= 1e6 ? n : null; }
    const value = type === 32 ? p.getStringPref(key) : '';
    return /^[+-]?(?:\d{1,6}(?:\.\d{1,4})?|\.\d{1,4})(?:px|ms|s|%)?$/.test(value) ? value : null;
  });
  const buttons = 'back forward reload stop home new-tab menu app-menu compact sidebar expand-sidebar site-data downloads extensions bookmark reader share history reopen screenshot overflow chevron close-unpinned minus play next previous volume media-close pip save-page print find open-file zoom edit encoding email logins sync send-tab import settings forget private firefox-view developer new-window fullscreen firefox-library account help quit'.split(' ');
  report.nativeAnimatedButtonOverrides = buttons.filter(name => attempt(() => Services.prefs.getIntPref('zzicon.button.' + name, 0)) === 6);
  Promise.all(mods.map(async mod => {
    report.versions[mod] = null;
    try { const j = await timeout(w.fetch('chrome://sine/content/zz-' + mod + '/theme.json').then(r => r.json()), 2000); if (!ended) report.versions[mod] = version(j.version); } catch {}
  })).then(async () => {
    if (ended || mods.every(mod => report.versions[mod])) return;
    try {
      const path = PathUtils.join(Services.dirsvc.get('ProfD', Ci.nsIFile).path, 'chrome', 'sine-mods', 'mods.json');
      const registry = await timeout(IOUtils.readJSON(path), 2000);
      if (!ended) for (const mod of mods) if (!report.versions[mod]) report.versions[mod] = version(registry?.['zz-' + mod]?.version);
    } catch {}
  });
  const filter = value => {
    const result = { urlCount: (String(value).match(/url\(/gi) || []).length, functions: [] };
    for (const m of String(value).matchAll(/\b(blur|saturate|brightness|contrast|opacity|grayscale|sepia|invert|hue-rotate)\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%|deg)?\s*\)/g))
      if (result.functions.length < 12 && Math.abs(+m[2]) <= 1e6) result.functions.push({ name: m[1], value: +m[2], unit: m[3] || 'number' });
    return result;
  };
  const edges = win => { const e = win.__zzglassEdgesInstance; return { active: count(e?.active), owners: count(e?.owners), scheduled: +!!e?.scheduled, morphRecords: count(win.__zziconMorphInstance?.records?.size) }; };
  const scene = win => attempt(() => {
    if (win.closed) return { closed: 1 };
    const d = win.document, root = d.documentElement, panel = d.getElementById('zen-toolbar-background'), box = d.getElementById('tabbrowser-tabbox');
    const page = win.gBrowser?.selectedBrowser?.closest('.browserSidebarContainer');
    return { tabs: count(win.gBrowser?.tabs?.length), visibleTabs: count(win.gBrowser?.visibleTabs?.length),
      groups: d.querySelectorAll('tab-group,zen-folder').length, workspaceButtons: d.querySelectorAll('#zen-workspaces-button toolbarbutton').length,
      nodes: d.querySelectorAll('*').length, alignmentImages: d.querySelectorAll('#zen-workspaces-button img.zen-workspace-icon,.tabbrowser-tab[zen-essential="true"] .tab-icon-image').length,
      hidden: +!!d.hidden, ownIconNodes: d.querySelectorAll('[zzicon-own]').length, compact: +(root.getAttribute('zen-compact-mode') === 'true'), expanded: +(root.getAttribute('zen-sidebar-expanded') === 'true'),
      pageBlurSVG: +!!d.getElementById('zzg-strip'), instances: Object.fromEntries(instances.map(key => [key, +!!win[key]])), ...edges(win),
      filters: { panel: filter(panel ? win.getComputedStyle(panel).backdropFilter : 'none'), tabbox: filter(box ? win.getComputedStyle(box).filter : 'none'), page: filter(page ? win.getComputedStyle(page).filter : 'none') } };
  }, { unavailable: 1 });
  const listen = (target, type, handler) => { target.addEventListener(type, handler, { capture: true, passive: true }); cleanups.push(() => target.removeEventListener(type, handler, true)); };
  function observeWindow(win, opened = false) {
    if (ended || seen.has(win)) return; seen.add(win);
    if (windows.length >= report.limits.windows) { report.omittedWindows++; return; }
    const row = { index: windows.length + 1, observedAtMs: ms(now()), start: scene(win), events: {}, eventTimes: [], omittedEventTimes: 0, edges: [], unloads: 0 };
    windows.push({ win, row }); report.windows.push(row); if (api) win.__zzZenFreezeProbe = api; if (opened) report.newWindows++;
    const toolbox = win.document.getElementById('navigator-toolbox');
    const mark = type => { if (row.eventTimes.length < 128) row.eventTimes.push({ type, ms: ms(now()) }); else row.omittedEventTimes++; };
    row.sidebarInside = +!!attempt(() => toolbox.matches(':hover'), false); row.sidebarEntries = 0; row.sidebarExits = 0; row.lastPointerMoveMs = null;
    row.sidebarGeometryTransitions = { transitionrun: 0, transitionend: 0, transitioncancel: 0 };
    const geometry = /^(?:transform|translate|scale|rotate|(?:min-|max-)?(?:width|height)|(?:margin|padding|inset)(?:-.+)?|top|right|bottom|left|flex-basis|(?:row-|column-)?gap|border-.+-width|border-radius|corner-shape)$/;
    for (const type of ['transitionrun', 'transitionend', 'transitioncancel']) listen(win, type, event => {
      if (toolbox?.contains(event.target) && geometry.test(event.propertyName)) row.sidebarGeometryTransitions[type]++;
    });
    const sidebar = inside => { if (+inside !== row.sidebarInside) { row.sidebarInside = +inside; row[inside ? 'sidebarEntries' : 'sidebarExits']++; mark(inside ? 'sidebar-enter' : 'sidebar-leave'); } };
    for (const type of ['pointerover', 'pointerout']) listen(win, type, event => {
      if (!event.isTrusted || !toolbox?.contains(event.target) || toolbox.contains(event.relatedTarget)) return;
      sidebar(type === 'pointerover');
    });
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click']) {
      const metric = row.events[type] = { trusted: 0, untrusted: 0, invalidTimestamp: 0, delay: stats() };
      listen(win, type, event => {
        if (!event.isTrusted) { metric.untrusted++; return; } metric.trusted++;
        if (type === 'pointermove') { row.lastPointerMoveMs = ms(now()); sidebar(!!toolbox?.contains(event.target)); }
        const stamp = event.timeStamp >= win.performance.timeOrigin ? event.timeStamp - win.performance.timeOrigin : event.timeStamp;
        const delay = win.performance.now() - stamp;
        if (stamp > 0 && delay >= 0 && delay <= 3600000) add(metric.delay, delay); else metric.invalidTimestamp++;
      });
    }
    for (const type of ['TabSelect', 'ZenWorkspacesUIUpdate', 'ZenWorkspaceChanged']) {
      row.events[type] = 0; listen(win, type, () => { row.events[type]++; mark(type); });
    }
    listen(win, 'unload', event => { if (event.target === win.document) { row.unloads++; if (win === w) finish('window-closed'); } });
    row.redrawChanges = 0;
    if (toolbox) { const observer = new win.MutationObserver(() => { row.redrawChanges++; }); observer.observe(toolbox, { attributes: true, attributeFilter: ['zzg-redraw'] }); cleanups.push(() => observer.disconnect()); }
  }
  const enumerator = Services.wm.getEnumerator('navigator:browser'); while (enumerator.hasMoreElements()) observeWindow(enumerator.getNext());
  report.animationFrameWindowIndex = windows.find(({ win }) => win === w)?.row.index || 0;
  const opened = { observe: win => observeWindow(win, true) };
  attempt(() => { Services.obs.addObserver(opened, 'browser-delayed-startup-finished'); cleanups.push(() => Services.obs.removeObserver(opened, 'browser-delayed-startup-finished')); });
  const renderer = attempt(() => w.windowUtils.layerManagerType, '');
  report.renderer = /webrender/i.test(renderer) ? (/software/i.test(renderer) ? 'WebRender software' : 'WebRender') : renderer === 'Basic' ? 'Basic' : 'other';
  const moduleFiles = new Set([...mods.map(name => name + '.uc.js'), 'glassflow-edges.uc.js', 'iconflow-morph.uc.js', 'iconflow-parts.uc.js', 'sine-update-guard.sys.mjs']);
  const categories = new Set(['Idle', 'Other', 'Layout', 'JavaScript', 'GC / CC', 'Graphics', 'DOM', 'Network', 'IPC', 'Media', 'Memory', 'Navigation', 'Accessibility']);
  function summarize(profile) {
    const out = { samples: 0, categories: {}, unknownCategorySamples: 0, categoriesBySecond: [], modLines: [], truncated: 0 }, hits = new Map(), categorySeconds = new Map();
    const thread = profile?.threads?.find(t => t.name === 'GeckoMain' && String(t.pid) === String(Services.appinfo.processID));
    if (!thread?.samples?.schema || !thread.stackTable?.schema || !thread.frameTable?.schema) return out;
    const st = thread.stackTable, ft = thread.frameTable, cache = new Map(), rows = thread.samples.data || [];
    for (const sample of rows.slice(0, 5000)) {
      out.samples++; const found = new Set();
      const elapsed = profile.meta?.startTime + sample[thread.samples.schema.time] - w.performance.timeOrigin - started;
      const second = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= report.elapsedMs ? Math.floor(elapsed / 1000) : -1; let stack = sample[thread.samples.schema.stack], category = 'Other', categoryResolved = false, categoryKnown = false;
      for (let depth = 0; Number.isInteger(stack) && depth < 128; depth++) {
        const entry = st.data[stack]; if (!entry) break; const id = entry[st.schema.frame], f = ft.data[id]; if (!f) break;
        // Raw Gecko frames inherit a null category from their nearest ancestor.
        // An explicit category ends that search even when its name is not exported.
        const categoryIndex = Number.isInteger(ft.schema.category) ? f[ft.schema.category] : null;
        if (!categoryResolved && categoryIndex != null) {
          categoryResolved = true;
          const name = Number.isInteger(categoryIndex) && categoryIndex >= 0 ? profile.meta?.categories?.[categoryIndex]?.name : null;
          categoryKnown = categories.has(name); if (categoryKnown) category = name;
        }
        if (!cache.has(id)) {
          const location = thread.stringTable?.[f[ft.schema.location]], match = typeof location === 'string' && location.match(/(?:chrome:\/\/sine\/content\/zz-[a-z-]+\/|\/chrome\/sine-mods\/zz-[a-z-]+\/)([a-z-]+\.(?:uc\.js|sys\.mjs))(?::(\d+))?/);
          const line = count(Number(f[ft.schema.line] || match?.[2]));
          cache.set(id, match && moduleFiles.has(match[1]) && line > 0 ? { file: match[1], line } : null);
        }
        const item = cache.get(id); if (item) found.add(item.file + ':' + item.line);
        const prefix = entry[st.schema.prefix]; if (prefix === stack) break; stack = prefix;
      }
      out.categories[category] = (out.categories[category] || 0) + 1;
      if (!categoryKnown) out.unknownCategorySamples++;
      if (second >= 0 && (categorySeconds.size < 64 || categorySeconds.has(second))) {
        const counts = categorySeconds.get(second) || {}; counts[category] = (counts[category] || 0) + 1; categorySeconds.set(second, counts);
      }
      for (const key of found) {
        if (hits.size >= 1024 && !hits.has(key)) { out.truncated++; continue; }
        const hit = hits.get(key) || { samples: 0, categories: {}, seconds: new Map() }; hit.samples++; hit.categories[category] = (hit.categories[category] || 0) + 1;
        if (second >= 0 && (hit.seconds.size < 64 || hit.seconds.has(second))) hit.seconds.set(second, (hit.seconds.get(second) || 0) + 1);
        hits.set(key, hit);
      }
    }
    out.categoriesBySecond = [...categorySeconds].sort((a, b) => a[0] - b[0]);
    out.modLines = [...hits].sort((a, b) => b[1].samples - a[1].samples).slice(0, 40).map(([key, hit]) => { const [file, line] = key.split(':'); return { file, line: +line, samples: hit.samples, categories: hit.categories, samplesBySecond: [...hit.seconds] }; });
    out.truncated += Math.max(0, rows.length - 5000) + Math.max(0, hits.size - 40); return out;
  }
  // activeConfiguration carries a unique nonmatching thread filter, so a later
  // recording belongs to its owner and is never read or stopped by this probe.
  const ownsProfiler = () => attempt(() => !!profilerToken && profiler.IsActive() && profiler.activeConfiguration?.threads?.includes(profilerToken), false);
  try {
    profiler = Services.profiler;
    if (profiler.IsActive()) report.profiler.status = 'existing-recording-preserved';
    else if (!('activeConfiguration' in profiler)) report.profiler.status = 'ownership-check-unavailable';
    else {
      profilerToken = 'zen-freeze-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const starting = profiler.StartProfiler(200000, 10, ['js'], ['pid:' + Services.appinfo.processID, profilerToken], 0, 35);
      report.profiler.status = 'recording'; Promise.resolve(starting).catch(() => fail('profiler-start'));
    }
  } catch { fail('profiler-unavailable'); }
  api = { stop: () => finish('stopped'), done }; for (const { win } of windows) win.__zzZenFreezeProbe = api;
  function finish(reason = 'completed') {
    if (ended) return done; ended = true; report.elapsedMs = ms(now()); report.status = reason;
    for (const fn of cleanups.reverse()) attempt(fn); for (const id of timers) clock.clearTimeout(id); timers.clear();
    attempt(() => w.cancelAnimationFrame(frame)); attempt(() => overlay.remove());
    for (const { win, row } of windows) row.end = scene(win);
    (async () => {
      if (ownsProfiler()) {
        try { report.profiler.summary = summarize(await timeout(profiler.getProfileDataAsync(), 3000)); report.profiler.status = 'summarized'; }
        catch { report.profiler.status = 'export-unavailable'; fail('profiler-export'); }
        finally { if (ownsProfiler()) try { await timeout(profiler.StopProfiler(), 1000); } catch { fail('profiler-stop'); } }
      } else if (report.profiler.status === 'recording') report.profiler.status = 'recording-replaced-or-stopped';
      const folder = 'zen-freeze-report-' + new Date().toISOString().replace(/[^0-9]/g, ''); report.folder = folder;
      try {
        const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
        const base = await timeout(Downloads.getPreferredDownloadsDirectory(), 3000), dir = PathUtils.join(base, folder);
        await timeout(IOUtils.makeDirectory(dir), 3000);
        const file = path => { const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); f.initWithPath(path); return f; };
        report.saved.json = 1; report.saved.zip = 1;
        const path = PathUtils.join(dir, 'report.json'); await timeout(IOUtils.writeJSON(path, report), 3000);
        const zip = Cc['@mozilla.org/zipwriter;1'].createInstance(Ci.nsIZipWriter);
        try { zip.open(file(PathUtils.join(dir, 'report.zip')), 0x04 | 0x08 | 0x20); zip.addEntryFile('report.json', 6, file(path), false); }
        catch { report.saved.zip = 0; fail('zip-unavailable'); }
        finally { try { zip.close(); } catch { report.saved.zip = 0; fail('zip-unavailable'); } }
        if (!report.saved.zip) { attempt(() => IOUtils.remove(PathUtils.join(dir, 'report.zip')).catch(() => {})); await timeout(IOUtils.writeJSON(path, report), 3000); }
      } catch { report.saved.json = 0; report.saved.zip = 0; fail('local-save-unavailable'); }
      try { Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(JSON.stringify(report, null, 2)); } catch { fail('clipboard-unavailable'); }
      for (const id of timers) clock.clearTimeout(id); timers.clear();
      for (const { win } of windows) if (win.__zzZenFreezeProbe === api) delete win.__zzZenFreezeProbe;
      console.info('[Zen freeze report]', JSON.stringify(report)); resolveDone(report);
    })().catch(() => { fail('finish-unavailable'); for (const { win } of windows) if (win.__zzZenFreezeProbe === api) delete win.__zzZenFreezeProbe; resolveDone(report); });
    return done;
  }
  let lastBeat = now(), lastFrame;
  const beat = () => {
    if (ended) return; const time = now(), gap = time - lastBeat; add(report.heartbeat, Math.max(0, gap - 50));
    if (gap > 100 && report.heartbeatGaps.length < 128) report.heartbeatGaps.push({ fromMs: ms(lastBeat), toMs: ms(time) }); lastBeat = time;
    const id = clock.setTimeout(() => { timers.delete(id); beat(); }, 50); timers.add(id);
  };
  const sampleFrame = () => { if (ended) return; const time = now(); if (lastFrame !== undefined) add(report.animationFrames, time - lastFrame); lastFrame = time; frame = w.requestAnimationFrame(sampleFrame); };
  const sparse = () => { if (ended) return; for (const { win, row } of windows) if (!win.closed && row.edges.length < 64) row.edges.push({ ms: ms(now()), hidden: +!!win.document.hidden, sidebarInside: row.sidebarInside, pointerIdleMs: row.lastPointerMoveMs === null ? null : ms(now() - row.lastPointerMoveMs), transitions: { ...row.sidebarGeometryTransitions }, ...edges(win) }); const id = clock.setTimeout(() => { timers.delete(id); sparse(); }, 1000); timers.add(id); };
  attempt(() => { overlay = w.document.createElementNS('http://www.w3.org/1999/xhtml', 'button'); overlay.textContent = 'Recording lag for 30 s — Stop + copy';
    overlay.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;padding:8px 12px;font:13px sans-serif;background:#20242b;color:white;border:1px solid #778;border-radius:6px';
    overlay.addEventListener('click', () => finish('stopped'), { once: true }); w.document.documentElement.appendChild(overlay); });
  const deadline = clock.setTimeout(() => { timers.delete(deadline); finish(); }, 30000); timers.add(deadline);
  beat(); sparse(); frame = w.requestAnimationFrame(sampleFrame);
  return done;
})();
