// Paste in Zen's Browser Console, then hover/click icons and open a context
// menu. Read-only; copies the report after 20 seconds and removes all hooks.
(() => {
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  w.__zzIconHoverProbe?.stop();
  const undo = [], started = w.performance.now(), report = {
    probe: 'icon-hover-v5', browser: Services.appinfo.version,
    platform: Services.appinfo.OS, dpr: w.devicePixelRatio,
    reducedMotion: w.matchMedia('(prefers-reduced-motion: reduce)').matches,
    instantMotion: !!w.Motion?.MotionGlobalConfig?.instantAnimations,
    versions: {}, prefs: {}, menus: [], motion: [], errors: [],
    limit: '20 seconds; up to 12 one-second motion runs, style/box samples at most once/16ms plus every rAF interval; 6 menus with a 500ms follow-up. Reads can affect timing. Main-thread callbacks are not GPU present times or an FPS benchmark.',
  };
  const names = ['zzicon.set', 'zzicon.animate', 'zzicon.speed', 'zzicon.menu.animate',
    'svg.context-properties.content.enabled', 'cmi-Switch-Icon-Package', 'arc-workspace-style', 'arc-disable-tab-hover-animations', 'zzicon.click.press', 'zzicon.plate', 'zzicon.size', 'zzicon.motion.toolbar',
    'zzglass.motion.enabled', 'zzglass.motion.profile', 'zzglass.tabs.essentials-icon-grow', 'zzglass.edges.follow-pointer', 'zzglass.instant-ui',
    'zzglass.workspaces.enabled', 'zzglass.workspaces.hover', 'zzglass.workspaces.steady-dots', 'zzglass.workspaces.inactive', 'zzglass.workspaces.active',
    'zzglass.sidebar.blur-transparent-pages', 'zzmedia.bar.hover-delay',
    'zzmedia.preview.hover-size', 'zzmedia.preview.controls'];
  for (const key of names) {
    const P = Services.prefs, type = P.getPrefType(key);
    report.prefs[key] = type === P.PREF_BOOL ? P.getBoolPref(key) :
      type === P.PREF_INT ? P.getIntPref(key) : type === P.PREF_STRING ? P.getStringPref(key) : null;
  }
  for (const name of ['iconflow', 'glassflow', 'mediaflow'])
    w.fetch(`chrome://sine/content/zz-${name}/theme.json`).then(r => r.json())
      .then(j => { report.versions[name] = j.version; }).catch(() => {});
  const listen = (node, type, fn) => {
    node.addEventListener(type, fn, true);
    undo.push(() => node.removeEventListener(type, fn, true));
  };
  const id = e => e ? e.id || e.localName + '.' + [...e.classList].join('.') : null;
  const source = s => (s || '').replace(/file:\/\/\/[^"\n]*?\/chrome\//g, 'file://[profile]/chrome/')
    .replace(/data:[^"\s)]+/g, 'data:[omitted]').slice(0,300);
  const props = ['display','visibility','opacity','filter','transform','transform-origin','scale','translate','rotate',
    'transition','animation','will-change','contain','backdrop-filter','corner-shape','border-radius','overflow','clip-path','image-rendering','background-image','background-size',
    'background-position','content','list-style-image','mask-image','fill','fill-opacity','-moz-context-properties'];
  const style = (el, pseudo) => {
    const s = w.getComputedStyle(el, pseudo), r = {};
    for (const p of props) r[p] = source(s.getPropertyValue(p));
    return r;
  };
  const rules = el => {
    const result = [];
    for (const r of InspectorUtils.getMatchingCSSRules(el)) {
      if (!r.style) continue;
      const values = {};
      for (const p of props) if (r.style.getPropertyValue(p))
        values[p] = source(r.style.getPropertyValue(p)) + (r.style.getPropertyPriority(p) ? ' !important' : '');
      if (Object.keys(values).length) result.push({selector:r.selectorText, source:source(r.parentStyleSheet?.href), values});
    }
    return result.slice(-30);
  };
  let frame = 0, timer, active, stopped = false;
  const animationIds = new WeakMap(); let nextAnimationId = 0;
  const animations = el => el.getAnimations().map(a => {
    if (!animationIds.has(a)) animationIds.set(a, ++nextAnimationId);
    let compositor;
    try { compositor = a.effect.getProperties().map(({property,runningOnCompositor,warning}) => ({property,runningOnCompositor,warning})); }
    catch (e) { compositor = {unavailable:String(e)}; }
    return {id:animationIds.get(a), property:a.transitionProperty || a.animationName || 'WAAPI',
      time:a.currentTime, startTime:a.startTime, state:a.playState, compositor};
  });
  function sample(stamp) {
    frame = 0;
    if (!active || stopped) return;
    const {el, host, run, start} = active, now = w.performance.now();
    if (!el.isConnected) { active = null; return; }
    // Record every callback, including displays faster than 60 Hz. Style/box
    // reads remain throttled. These are main-thread timings, not GPU present times.
    if (Number.isFinite(stamp)) {
      if (active.previousFrame !== undefined) run.frameIntervals.push(+(stamp-active.previousFrame).toFixed(2));
      active.previousFrame = stamp;
    }
    if (now - active.last < 16) { frame = w.requestAnimationFrame(sample); return; }
    active.last = now;
    const s = w.getComputedStyle(el), r = el.getBoundingClientRect();
    const hs = w.getComputedStyle(host), hr = host.getBoundingClientRect();
    run.samples.push({ms:Math.round(now-start), frame:s.getPropertyValue('--zzicon-frame'),
      scale:s.scale, transform:s.transform, backgroundPosition:s.backgroundPosition,
      hover:host.matches(':hover'), pressed:host.matches(':active'), focusVisible:host.matches(':focus-visible'),
      hostScale:hs.scale, hostTransform:hs.transform, hostBox:[hr.x,hr.y,hr.width,hr.height],
      hostOpacity:hs.opacity, hostFilter:hs.filter,
      box:[r.x,r.y,r.width,r.height], animations:animations(el), hostAnimations:animations(host)});
    if (now-start < 1000) frame = w.requestAnimationFrame(sample);
    else active = null;
  }
  listen(w, 'pointerover', e => {
    if (active || report.motion.length >= 12) return;
    const host = e.target.closest?.('[zzicon-motion-host], #zen-workspaces-button toolbarbutton, .tabbrowser-tab, #urlbar');
    if (!host || host.contains(e.relatedTarget)) return;
    const record = w.__zziconMorphInstance?.records.get(host);
    const el = record?.paint || host.querySelector('.zen-workspace-icon,.tab-icon-image') || host;
    const run = {host:id(host), icon:id(el), action:record?.binding?.action,
      image:el.localName==='img'?{source:source(el.currentSrc),complete:el.complete,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight}:null,
      style:style(el), rules:rules(el), hostStyle:style(host), hostRules:rules(host), frameIntervals:[], samples:[]};
    run.ancestors=[];
    for(let parent=el.parentElement;parent && run.ancestors.length<6;parent=parent.parentElement)
      run.ancestors.push({id:id(parent),style:style(parent)});
    report.motion.push(run); active = {el,host,run,start:w.performance.now(),last:-Infinity}; sample();
  });
  listen(w, 'popupshown', e => {
    if (e.target.localName !== 'menupopup' || report.menus.length >= 6) return;
    const popup=e.target, items=[...popup.querySelectorAll('menuitem,menu')].slice(0,60);
    const menu={id:id(popup), items:items.map(el => ({
      id:id(el), morph:el.hasAttribute('zzicon-motion-host'), style:style(el), before:style(el,'::before'), rules:rules(el),
      images:[...el.querySelectorAll('.menu-icon,.menu-iconic-icon,image')].slice(0,2).map(i => ({id:id(i), source:source(i.currentSrc), style:style(i)})),
    }))};
    report.menus.push(menu);
    const later=w.setTimeout(()=>{
      if (stopped || popup.state!=='open') return;
      menu.after500ms=items.filter(el=>el.isConnected).map(el=>({id:id(el),style:style(el),before:style(el,'::before')}));
    },500);
    undo.push(()=>w.clearTimeout(later));
  });
  listen(w, 'error', e => {
    if (report.errors.length < 20) report.errors.push({message:String(e.message).slice(0,200), file:source(e.filename),line:e.lineno});
  });
  function stop() {
    if (stopped) return;
    stopped = true; w.clearTimeout(timer); w.cancelAnimationFrame(frame); undo.forEach(fn=>fn());
    report.elapsedMs = Math.round(w.performance.now()-started);
    if (w.__zzIconHoverProbe?.stop === stop) delete w.__zzIconHoverProbe;
    const text = JSON.stringify(report,null,2);
    Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);
    w.console.log('[Iconflow probe] Report copied; hooks removed.', report);
  }
  w.__zzIconHoverProbe = {stop}; timer = w.setTimeout(stop,20000);
  w.console.log('[Iconflow probe] Hover/click affected icons and open a context menu. Auto-copy in 20 seconds.');
})();
