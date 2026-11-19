// Paste the complete file into Zen's Browser Console. Starts immediately.
// Automatically finds icons, exercises CSS hover/press, restores, and copies.
// No clicks, tab selection, preference writes, graphics changes or screenshots.
(() => {
  'use strict';
  const w=Services.wm.getMostRecentWindow('navigator:browser');
  if(!w)throw new Error('No Zen browser window');
  const KEY='__zzHoverABProbe';w[KEY]?.stop('replaced');w.__zzIconHoverProbe?.stop();
  const doc=w.document,utils=w.windowUtils,abort=new w.AbortController(),timers=new Map(),tags=new Map(),locks=new Map(),undo=[];
  const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService),attr='data-zz-hover-ab',token=Date.now().toString(36);
  let stopped=false,uri=null,active=null,frame=0;
  const report={probe:'hover-ab-v3',browser:Services.appinfo.version,platform:Services.appinfo.OS,dpr:w.devicePixelRatio,
    reducedMotion:w.matchMedia('(prefers-reduced-motion: reduce)').matches,instantMotion:!!w.Motion?.MotionGlobalConfig?.instantAnimations,
    automatic:true,versions:{},prefs:{},discovery:{},targets:[],phases:[],errors:[],
    limitations:'Automatic CSS :hover/:active locks; no pointer/click commands. Does not test OS input delivery, JS-driven Morph wind-up, or PiP controls. Up to 17 phases; 120-second deadline. At most 12 style snapshots, 100 events and 2000 rAF intervals per phase. Compositor collection is segmented at state checkpoints (at most 600ms scheduled) to avoid the default 600-frame ring wrapping at 240Hz. Empty segments are unavailable, not zero dropped frames. rAF is main-thread timing; compositor intervals cover the window and include idle time. Each segment may begin with a pre-capture interval. Neither proves pixel smoothness. No screenshots or page URLs. No preference changes.'};
  const attempt=fn=>{try{return fn();}catch(e){return {unavailable:String(e)};}};
  const listen=(el,type,fn)=>el.addEventListener(type,fn,{capture:true,signal:abort.signal});
  const sleep=ms=>new Promise(resolve=>{if(stopped){resolve(false);return;}const id=w.setTimeout(()=>{timers.delete(id);resolve(!stopped);},ms);timers.set(id,()=>resolve(false));});
  const clean=s=>String(s).replace(/url\([^)]*\)/gi,'url([omitted])');
  const names=['sine.auto-updates','zzglass.motion.enabled','zzglass.motion.profile','zzglass.instant-ui','zzglass.edges.follow-pointer','zzglass.workspaces.enabled','zzglass.workspaces.hover','zzglass.workspaces.inactive','zzglass.workspaces.steady-dots','zzglass.tabs.essentials-icon-grow','zzglass.tabs.close-left','zzicon.set','zzicon.animate','zzicon.speed','zzmedia.preview.controls'];
  for(const key of names){const p=Services.prefs,t=p.getPrefType(key);report.prefs[key]=t===p.PREF_BOOL?p.getBoolPref(key):t===p.PREF_INT?p.getIntPref(key):t===p.PREF_STRING?p.getStringPref(key):null;}
  for(const name of ['glassflow','groupflow','iconflow','mediaflow','glassflow-library','download-prompt','tab-router','tab-unloader','zen-turbo','peekflow']){
    w.fetch(`chrome://sine/content/zz-${name}/theme.json`).then(r=>r.json()).then(j=>{if(!stopped)report.versions[name]=j.version;}).catch(()=>{});
    w.fetch(`https://raw.githubusercontent.com/Dragon74X/Zen-Personal-Mods/main/${name}/theme.json`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(j=>{if(!stopped)(report.availableVersions??={})[name]={version:j.version,updatedAt:j.updatedAt};}).catch(()=>{});
  }
  w.fetch('chrome://sine/content/zz-iconflow/morph-frames.json').then(r=>r.json()).then(j=>{if(!stopped){const ratio=Math.max(.1,parseFloat(report.prefs['zzicon.speed']||'.45')/.45||1);report.configuredMorph={model:'Installed frame index, 450ms reference; not measured motion',windIntervals:j.wind,actionIntervals:j.frames-1-j.wind,windMs:180*ratio,actionMs:j.fireMs*ratio};}}).catch(()=>{});
  report.graphics=attempt(()=>{const g=Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo);return {adapter:attempt(()=>g.adapterDescription),driver:attempt(()=>g.adapterDriverVersion),features:attempt(()=>g.getFeatures()),monitors:attempt(()=>g.getMonitors())};});
  report.updater=attempt(()=>{const uri='chrome://userscripts/content/core/manager.sys.mjs',cu=Components.utils,autoUpdates=Services.prefs.getBoolPref('sine.auto-updates',true);if(typeof cu.isESModuleLoaded!=='function')return {available:false,autoUpdates};if(!cu.isESModuleLoaded(uri))return {available:true,loaded:false,autoUpdates};const m=ChromeUtils.importESModule(uri,{global:'shared'}).default;return {available:true,loaded:true,autoUpdates,guardInstalled:!!m.__zenPersonalModsUpdateGuardV1,periodicChecks:!!m.__zenPersonalModsUpdateTimer,versionComparatorPresent:/vc\??\.compare/.test(String(m.processModUpdate))};});
  const props=['width','height','transform-origin','transform-box','object-fit','object-position','scale','transform','rotate','translate','opacity','filter','transition','transition-property','transition-duration','transition-timing-function','transition-delay','border-radius','corner-shape','overflow','image-rendering'];
  const lights=['background-color','background-image','box-shadow','border-top-color','border-right-color','border-bottom-color','border-left-color','--zzg-a','--zzg-b','--zzg-dir','--zzg-spread','--zzg-edge-top','--zzg-edge-ring','--zzg-edge-angle','--zzg-edge-width','--zzg-ring-width','--zzg-state-glow','--zzg-sheen-level','--zzg-follow-angle','--zzg-follow-gradient','--zzg-follow-top','--zzg-follow-right','--zzg-follow-bottom','--zzg-follow-left'];
  const style=(el,list=props)=>{const s=w.getComputedStyle(el);return Object.fromEntries(list.map(p=>[p,s.getPropertyValue(p)]));};
  const bounds=el=>{const r=typeof utils.getBoundsWithoutFlushing==='function'?utils.getBoundsWithoutFlushing(el):el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
  const label=el=>el.id||el.localName+'.'+[...el.classList].join('.');
  const split=s=>{let depth=0,start=0,out=[];for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;else if(s[i]===')')depth--;else if(s[i]===','&&!depth){out.push(s.slice(start,i).trim());start=i+1;}}out.push(s.slice(start).trim());return out;};
  const scalar=s=>{if(s==='none')return 1;const a=s.trim().split(/\s+/).map(Number);return a.length<=2&&a.every(Number.isFinite)&&(a.length===1||a[0]===a[1])?a[0]:null;};
  const ns='http://www.w3.org/1999/xhtml',panel=doc.createElementNS(ns,'div');panel.id='zz-hover-ab-panel';panel.setAttribute('role','status');
  panel.style.cssText='all:initial;position:fixed;right:16px;top:16px;z-index:2147483647;width:330px;padding:14px;border:1px solid CanvasText;border-radius:8px;background:Canvas;color:CanvasText;font:14px system-ui;';
  const status=doc.createElementNS(ns,'p');status.textContent='Automatic icon comparison starting. No buttons or keys required.';panel.append(status);
  const cancel=doc.createElementNS(ns,'button');cancel.textContent='Stop + copy';cancel.style.cssText='font:13px system-ui;padding:5px 8px;';panel.append(cancel);doc.documentElement.append(panel);
  const rank=doc.documentElement.id?'#'+w.CSS.escape(doc.documentElement.id):':not(#zz-hover-ab-unused)';
  function tag(el){if(!tags.has(el)){const value=token+'-'+tags.size;tags.set(el,{value,old:el.getAttribute(attr)});el.setAttribute(attr,value);}}
  const selector=el=>':root'+rank.repeat(4)+` [${attr}="${tags.get(el).value}"]`;
  const declarations=(values,keys)=>keys.filter(k=>values[k]?.trim()).map(k=>`${k}:${values[k]}!important;`).join('');
  function clearSheet(){if(uri){ss.unregisterSheet(uri,ss.USER_SHEET);uri=null;}}
  function setState(el,pseudo,value){if(!locks.has(el))locks.set(el,new Map());const saved=locks.get(el);if(!saved.has(pseudo))saved.set(pseudo,{had:InspectorUtils.hasPseudoClassLock(el,pseudo),value:el.matches(pseudo)});InspectorUtils.addPseudoClassLock(el,pseudo,value);}
  function restoreLocks(){for(const[el,states]of locks)for(const[p,s]of states){if(s.had)InspectorUtils.addPseudoClassLock(el,p,s.value);else InspectorUtils.removePseudoClassLock(el,p);}locks.clear();}
  const animations=el=>el.getAnimations().map(a=>({property:a.transitionProperty||a.animationName||'WAAPI',state:a.playState,properties:attempt(()=>a.effect.getProperties().map(({property,runningOnCompositor,warning})=>({property,runningOnCompositor,warning})))}));
  function snapshot(reason,settled=false){
    if(!active||active.row.samples.length>=12||!active.t.image.isConnected)return;
    const {t,row,start}=active,before=w.performance.now(),s=style(t.image),hover=t.host.matches(':hover'),pressed=t.host.matches(':active');
    const extra={};for(const[name,q]of [['stack','.tab-icon-stack'],['label','.tab-label-container'],['close','.tab-close-button']]){const e=t.host.querySelector(q);if(e)extra[name]={box:bounds(e),opacity:w.getComputedStyle(e).opacity};}
    row.samples.push({ms:+(before-start).toFixed(2),reason,hover,pressed,style:s,hostStyle:style(t.host),hostBox:bounds(t.host),imageBox:bounds(t.image),extra,animations:animations(t.image)});row.readMs+=w.performance.now()-before;
    if(row.variant===0&&hover){const a=t.image.getAnimations().find(a=>a.transitionProperty==='scale'),end=a?.effect.getKeyframes().at(-1)?.scale;const value=end?scalar(end):settled?scalar(s.scale):null;if(value!==null){if(pressed)t.press=value;else t.hover=value;}}
  }
  function sample(stamp){frame=0;if(!active)return;if(active.previous!==undefined&&active.row.rafIntervalsMs.length<2000)active.row.rafIntervalsMs.push(+(stamp-active.previous).toFixed(3));active.previous=stamp;frame=w.requestAnimationFrame(sample);}
  function endSegment(reason){if(!active||active.recording===null)return;const {row,start,recording,segmentStart}=active,end=w.performance.now();active.recording=null;const intervalsMs=attempt(()=>typeof recording==='number'?utils.stopFrameTimeRecording(recording):recording);row.compositorSegments.push({reason,startMs:+(segmentStart-start).toFixed(2),endMs:+(end-start).toFixed(2),intervalsMs,...(Array.isArray(intervalsMs)&&!intervalsMs.length?{unavailable:'No intervals returned: idle or recorder data unavailable.'}:{})});}
  function endCapture(){if(!active)return;endSegment('finished');const {row,start}=active;snapshot('finished',true);active=null;w.cancelAnimationFrame(frame);frame=0;row.elapsedMs=+(w.performance.now()-start).toFixed(2);const boxes=row.samples.map(s=>s.hostBox);row.hostTravel=boxes.length?['x','y','width','height'].reduce((out,k,i)=>(out[k]=Math.max(...boxes.map(b=>b[i]))-Math.min(...boxes.map(b=>b[i])),out),{}):null;}
  const phases=['Current','450ms only','Fade/filter off','Lighting held','Transform scaling'];
  async function phase(t,variant){
    clearSheet();setState(t.host,':active',false);setState(t.host,':hover',false);if(!await sleep(650))return;
    if(!t.host.isConnected||!t.image.isConnected){report.errors.push('Target removed: '+t.kind);return;}
    if(!t.base){t.base=style(t.image);t.paint=t.nodes.map(el=>({el,values:style(el,[...props,...lights])}));}
    const row={target:t.kind,name:phases[variant],variant,samples:[],events:[],rafIntervalsMs:[],compositorSegments:[],readMs:0};report.phases.push(row);
    const s=t.base,properties=split(s['transition-property']),slot=properties.lastIndexOf('scale'),at=slot>=0?slot:Math.max(0,properties.lastIndexOf('all'));
    const component=p=>{const values=split(s[p]);return values[at%values.length];},easing=component('transition-timing-function'),duration=component('transition-duration'),delay=component('transition-delay');
    const interpolate=!report.reducedMotion&&!report.instantMotion&&!report.prefs['zzglass.instant-ui'];let css='';
    if((variant===1||variant===4)&&!interpolate)row.unavailable='Reduced/instant motion active; no interpolation override.';
    else if(variant===1)css=selector(t.image)+`{transition:${s.transition},scale 450ms ${easing} ${delay}!important;}`;
    else if(variant===2||variant===3)css=t.paint.map(({el,values})=>selector(el)+'{'+declarations(variant===2?{opacity:'1',filter:'none'}:values,variant===2?['opacity','filter']:lights)+'}').join('');
    else if(variant===4){const rest=scalar(s.scale);if(rest===null||t.hover===null||t.hover===rest||s.transform!=='none')row.unavailable='No supported scale change in baseline.';else{const paint=selector(t.image),owner=selector(t.host),child=`[${attr}="${tags.get(t.image).value}"]`;css=paint+`{scale:none!important;transform:scale(${rest})!important;transition:${s.transition},scale 0s,transform ${duration} ${easing} ${delay}!important;}`+owner+':hover '+child+`{transform:scale(${t.hover})!important;}`;if(t.press!==null)css+=owner+':active '+child+`{transform:scale(${t.press})!important;}`;}}
    if(css){uri=Services.io.newURI('data:text/css,'+encodeURIComponent(css));ss.loadAndRegisterSheet(uri,ss.USER_SHEET);}
    if(!await sleep(200))return;
    row.appliedStyle=style(t.image);const effective=split(row.appliedStyle['transition-property']).lastIndexOf('scale'),durations=split(row.appliedStyle['transition-duration']);
    row.overrideVerified=variant===1?effective>=0&&parseFloat(durations[effective%durations.length])===.45:variant===4?!row.unavailable&&row.appliedStyle.scale==='none'&&row.appliedStyle.transform.startsWith('matrix('):null;
    if((variant===1||variant===4)&&!row.overrideVerified&&!row.unavailable)row.unavailable='Override did not apply; ignore this condition.';
    status.textContent=`Automatic: ${t.kind} — ${phases[variant]}. Report copies when all phases finish.`;
    active={t,row,start:w.performance.now(),recording:null};frame=w.requestAnimationFrame(sample);snapshot('rest',true);
    for(const [hover,pressed,ms,reason,settled]of [[true,false,70,'hover transition',false],[true,false,530,'hovered',true],[false,false,70,'exit transition',false],[false,false,530,'restored',true],[true,false,600,'hover before press',true],[true,true,70,'press transition',false],[true,true,530,'pressed',true],[true,false,600,'released',true],[false,false,600,'rest end',true]]){active.segmentStart=w.performance.now();active.recording=attempt(()=>utils.startFrameTimeRecording());setState(t.host,':hover',hover);setState(t.host,':active',pressed);if(!await sleep(ms))return;endSegment(reason);snapshot(reason,settled);}
    endCapture();
  }
  function stop(reason='manual'){
    if(stopped)return;endCapture();stopped=true;for(const[id,resolve]of timers){w.clearTimeout(id);resolve();}timers.clear();abort.abort();
    for(const fn of [clearSheet,restoreLocks,...undo])try{fn();}catch(e){report.errors.push('Cleanup: '+String(e));}
    for(const[el,{value,old}]of tags)if(el.getAttribute(attr)===value){if(old===null)el.removeAttribute(attr);else el.setAttribute(attr,old);}
    panel.remove();if(w[KEY]?.stop===stop)delete w[KEY];report.finished=reason;
    report.mediaflow={present:!!w.ZzMediaflowController,activeSource:attempt(()=>!!w.ZzMediaflowController?.getActiveBC?.())};
    const text=JSON.stringify(report,(_key,value)=>typeof value==='string'?clean(value):value,2);w.__zzHoverABLastReport=text;
    try{Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);w.console.info('[Hover A/B] Automatic report copied; changes restored.',report);}catch(e){w.console.error('[Hover A/B] Clipboard failed; use window.__zzHoverABLastReport',e);}return text;
  }
  listen(cancel,'click',()=>stop());listen(w,'unload',()=>stop('window closed'));
  listen(w,'error',e=>{if(report.errors.length<12)report.errors.push(String(e.message).slice(0,200));});
  for(const type of ['transitionrun','transitionend','transitioncancel'])listen(w,type,e=>{if(active&&active.t.nodes.includes(e.target)&&active.row.events.length<100)active.row.events.push({ms:+(w.performance.now()-active.start).toFixed(2),type,property:e.propertyName,target:e.target===active.t.image?'image':e.target===active.t.host?'host':'ancestor'});});
  w[KEY]={stop};const deadline=w.setTimeout(()=>stop('120-second limit'),120000);timers.set(deadline,()=>{});
  (async()=>{
    if(!['addPseudoClassLock','removePseudoClassLock','hasPseudoClassLock'].every(k=>typeof InspectorUtils[k]==='function')){report.errors.push('CSS state-lock API unavailable');stop('unsupported');return;}
    attempt(()=>w.focus());
    const sidebar=doc.getElementById('navigator-toolbox');if(sidebar&&doc.documentElement.getAttribute('zen-compact-mode')==='true'&&!sidebar.hasAttribute('zen-user-show')){sidebar.setAttribute('zen-user-show','');undo.push(()=>{if(sidebar.getAttribute('zen-user-show')==='')sidebar.removeAttribute('zen-user-show');});}
    if(!await sleep(900))return;
    const groups=[['workspace','#zen-workspaces-button toolbarbutton'],['favorite-pending','.tabbrowser-tab[zen-essential][pending]'],['favorite-loaded','.tabbrowser-tab[zen-essential]:not([pending])'],['tab-pending','#tabbrowser-tabs .tabbrowser-tab[pending]:not([pinned],[zen-essential])'],['tab-loaded','#tabbrowser-tabs .tabbrowser-tab:not([pending],[pinned],[zen-essential])']];
    const targets=[];
    for(const[kind,q]of groups){const available=[...doc.querySelectorAll(q)].map(host=>({host,image:host.querySelector('.zen-workspace-icon,.tab-icon-image')})).filter(t=>{if(!t.image)return false;const r=t.host.getBoundingClientRect(),s=w.getComputedStyle(t.host);return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<w.innerWidth&&r.top<w.innerHeight&&s.visibility==='visible'&&t.host.contains(doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});report.discovery[kind]=available.length;
      if(!available.length)continue;available.sort((a,b)=>Number(a.host.hasAttribute('active'))-Number(b.host.hasAttribute('active')));const t={...available[0],kind,hover:null,press:null,nodes:[]};
      for(let e=t.image;e&&t.nodes.length<8;e=e.parentElement){t.nodes.push(e);tag(e);if(e.id==='navigator-toolbox'||e.classList.contains('zen-library-space-tabs'))break;}
      const src=t.image.currentSrc||t.image.getAttribute('src')||'';report.targets.push({kind,host:label(t.host),image:label(t.image),asset:{tag:t.image.localName,width:t.image.naturalWidth??null,height:t.image.naturalHeight??null,complete:t.image.complete??null,type:src.match(/^data:([^;,]+)/)?.[1]||src.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]||'unknown'}});targets.push(t);
    }
    if(!targets.length){report.errors.push('No visible workspace, Favorite or tab icon found');stop('no targets');return;}
    for(const t of targets){for(let i=0;i<(t.kind.startsWith('tab-')?1:5);i++){if(stopped)return;await phase(t,i);}restoreLocks();}
    stop('completed');
  })().catch(e=>{report.errors.push(String(e));stop('error');});
})();
