// Run in Zen's Browser Console. Hover a workspace/Favorite, then press F8.
// Five 6-second comparisons; auto-copy and restore on Finish, Stop or 3 minutes.
// No preference writes, graphics changes, synthetic icon clicks or pixel capture.
(() => {
  'use strict';
  const w=Services.wm.getMostRecentWindow('navigator:browser');
  if(!w)throw new Error('No Zen browser window');
  const KEY='__zzHoverABProbe';w[KEY]?.stop('replaced');
  w.__zzIconHoverProbe?.stop();
  const doc=w.document,utils=w.windowUtils,abort=new w.AbortController(),timers=new Set(),tagged=[];
  const attr='data-zz-hover-ab',token=Date.now().toString(36),ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
  const report={probe:'hover-ab-v1',browser:Services.appinfo.version,platform:Services.appinfo.OS,dpr:w.devicePixelRatio,
    reducedMotion:w.matchMedia('(prefers-reduced-motion: reduce)').matches,instantMotion:!!w.Motion?.MotionGlobalConfig?.instantAnimations,
    versions:{},prefs:{},phases:[],errors:[],
    limitations:'6 seconds per phase; at most 2000 rAF intervals and 16 style snapshots per phase; 3-minute total limit. rAF is main-thread timing, compositor intervals are window-wide, neither proves icon pixel smoothness. First compositor interval can predate capture; idle gaps are not dropped icon frames. Your comparison supplies the visual observation. No screenshots or page URLs collected. No preference changes.'};
  const attempt=fn=>{try{return fn();}catch(e){return {unavailable:String(e)};}};
  const listen=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal:abort.signal});
  const later=(fn,ms)=>{const id=w.setTimeout(()=>{timers.delete(id);if(!stopped)try{fn();}catch(e){report.errors.push(String(e));stop('error');}},ms);timers.add(id);return id;};
  const names=['zzglass.motion.enabled','zzglass.motion.profile','zzglass.instant-ui','zzglass.edges.follow-pointer',
    'zzglass.workspaces.enabled','zzglass.workspaces.hover','zzglass.workspaces.inactive','zzglass.workspaces.steady-dots',
    'zzglass.tabs.essentials-icon-grow','zzicon.set','zzicon.animate','zzicon.speed','zzmedia.preview.controls'];
  for(const key of names){const p=Services.prefs,t=p.getPrefType(key);report.prefs[key]=t===p.PREF_BOOL?p.getBoolPref(key):t===p.PREF_INT?p.getIntPref(key):t===p.PREF_STRING?p.getStringPref(key):null;}
  for(const name of ['glassflow','iconflow','mediaflow'])w.fetch(`chrome://sine/content/zz-${name}/theme.json`).then(r=>r.json()).then(j=>{if(!stopped)report.versions[name]=j.version;}).catch(()=>{});
  report.graphics=attempt(()=>{const g=Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo);return {adapter:attempt(()=>g.adapterDescription),driver:attempt(()=>g.adapterDriverVersion),features:attempt(()=>g.getFeatures()),monitors:attempt(()=>g.getMonitors())};});
  const props=['scale','transform','rotate','translate','opacity','filter','transition','transition-property','transition-duration','transition-timing-function','transition-delay','border-radius','corner-shape','overflow','image-rendering'];
  const lights=['background-color','background-image','box-shadow','border-top-color','border-right-color','border-bottom-color','border-left-color',
    '--zzg-a','--zzg-b','--zzg-dir','--zzg-spread','--zzg-edge-top','--zzg-edge-ring','--zzg-edge-angle','--zzg-edge-width','--zzg-ring-width','--zzg-state-glow','--zzg-sheen-level',
    '--zzg-follow-angle','--zzg-follow-gradient','--zzg-follow-top','--zzg-follow-right','--zzg-follow-bottom','--zzg-follow-left'];
  const clean=s=>String(s).replace(/url\([^)]*\)/gi,'url([omitted])');
  const style=(el,list=props)=>{const s=w.getComputedStyle(el);return Object.fromEntries(list.map(p=>[p,s.getPropertyValue(p)]));};
  const bounds=el=>{const r=typeof utils.getBoundsWithoutFlushing==='function'?utils.getBoundsWithoutFlushing(el):el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
  const label=el=>el.id||el.localName+'.'+[...el.classList].join('.');
  const split=s=>{let depth=0,start=0,out=[];for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;else if(s[i]===')')depth--;else if(s[i]===','&&!depth){out.push(s.slice(start,i).trim());start=i+1;}}out.push(s.slice(start).trim());return out;};
  const scalar=s=>{if(s==='none')return 1;const a=s.trim().split(/\s+/).map(Number);return a.length<=2&&a.every(Number.isFinite)&&(a.length===1||a[0]===a[1])?a[0]:null;};
  let stopped=false,candidate=null,host=null,image=null,nodes=[],baseline=null,uri=null,index=-1,active=null,frame=0,nativeHoverScale=null,nativePressScale=null,started=0,ready=false;
  const phases=[['Current','Repeat the affected hover/click movement.'],['450ms only','Same easing; only image scale duration changes.'],
    ['Fade/filter off','Current timing; opacity 1 and filter none on image and ancestors.'],
    ['Lighting held','Current timing; ancestor background, rim and lighting inputs held at rest values.'],
    ['Transform scaling','Hover only: current timing and measured hover sizes through transform.']];
  const ns='http://www.w3.org/1999/xhtml';
  function node(name,text,parent){const e=doc.createElementNS(ns,name);if(text)e.textContent=text;if(parent)parent.append(e);return e;}
  const panel=node('div');panel.id='zz-hover-ab-panel';panel.setAttribute('role','region');panel.setAttribute('aria-label','Icon hover comparison');
  panel.style.cssText='all:initial;position:fixed;right:16px;top:16px;z-index:2147483647;width:345px;padding:14px;border:1px solid CanvasText;border-radius:8px;background:Canvas;color:CanvasText;font:14px system-ui;box-shadow:0 2px 12px #0006;';
  node('strong','Icon hover comparison',panel);const status=node('p','Hover a workspace or Favorite icon, then press F8.',panel);status.setAttribute('aria-live','polite');
  const buttons=node('div',null,panel);buttons.style.cssText='display:flex;gap:6px;flex-wrap:wrap;';
  const begin=node('button','Begin',buttons),less=node('button','Fewer jumps',buttons),same=node('button','Same jumps',buttons),more=node('button','More jumps',buttons),unknown=node('button','Cannot compare',buttons),finish=node('button','Stop + copy',buttons);
  for(const b of [begin,less,same,more,unknown,finish])b.style.cssText='font:13px system-ui;padding:5px 8px;';
  begin.hidden=true;for(const b of [less,same,more,unknown])b.hidden=true;
  doc.documentElement.append(panel);
  function clearSheet(){if(uri){ss.unregisterSheet(uri,ss.USER_SHEET);uri=null;}}
  function tag(el){const value=token+'-'+tagged.length,old=el.getAttribute(attr);tagged.push({el,value,old});el.setAttribute(attr,value);return value;}
  const rank=doc.documentElement.id?'#'+w.CSS.escape(doc.documentElement.id):':not(#zz-hover-ab-unused)';
  const selector=el=>':root'+rank.repeat(4)+` [${attr}="${el.getAttribute(attr)}"]`;
  const declarations=(values,keys)=>keys.filter(k=>values[k]?.trim()).map(k=>`${k}:${values[k]}!important;`).join('');
  function pick(h){
    if(host||!h?.isConnected)return;
    host=h;image=host.querySelector('.zen-workspace-icon,.tab-icon-image');if(!image){host=null;return;}
    for(let e=image;e&&nodes.length<8;e=e.parentElement){nodes.push(e);if(e.id==='navigator-toolbox'||e.classList.contains('zen-library-space-tabs'))break;}
    for(const e of nodes)tag(e);
    report.target={kind:host.closest('#zen-workspaces-button')?'workspace':'favorite',host:label(host),image:label(image)};
    const src=image.currentSrc||image.getAttribute('src')||'';
    report.target.asset={tag:image.localName,width:image.naturalWidth??null,height:image.naturalHeight??null,complete:image.complete??null,type:src.match(/^data:([^;,]+)/)?.[1]||src.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]||'unknown'};
    status.textContent='Selected '+report.target.kind+'. Move off the icon, then click Begin. No settings changed.';begin.hidden=false;candidate=null;
  }
  listen(w,'pointerover',e=>{if(host)return;candidate=e.target.closest?.('#zen-workspaces-button toolbarbutton,.tabbrowser-tab[zen-essential="true"]')||null;});
  listen(w,'keydown',e=>{if(e.key==='F8'&&!host){e.preventDefault();pick(candidate);}}, {capture:true});
  function animations(el){return el.getAnimations().map(a=>({property:a.transitionProperty||a.animationName||'WAAPI',state:a.playState,
    properties:attempt(()=>a.effect.getProperties().map(({property,runningOnCompositor,warning})=>({property,runningOnCompositor,warning})))}));}
  function snapshot(row,reason){
    if(row.samples.length>=16||!image.isConnected)return;
    const start=w.performance.now(),s=style(image),hover=host.matches(':hover'),pressed=host.matches(':active');
    row.samples.push({ms:+(start-started).toFixed(2),reason,hover,pressed,style:s,hostStyle:style(host),hostBox:bounds(host),imageBox:bounds(image),animations:animations(image)});
    row.readMs+=w.performance.now()-start;
    if(index===0&&hover){
      const a=image.getAnimations().find(a=>a.transitionProperty==='scale'),end=a?.effect.getKeyframes().at(-1)?.scale;
      const target=scalar(end||s.scale);
      if(target!==null){if(pressed)nativePressScale=target;else if(end||reason==='settled')nativeHoverScale=target;}
    }
  }
  function sample(stamp){frame=0;if(!active)return;if(active.previous!==undefined&&active.row.rafIntervalsMs.length<2000)active.row.rafIntervalsMs.push(+(stamp-active.previous).toFixed(3));active.previous=stamp;frame=w.requestAnimationFrame(sample);}
  function endCapture(){
    if(!active)return;
    const {row,recording}=active;active=null;w.cancelAnimationFrame(frame);frame=0;
    row.elapsedMs=+(w.performance.now()-started).toFixed(2);
    row.compositorIntervalsMs=attempt(()=>typeof recording==='number'?utils.stopFrameTimeRecording(recording):recording);
    snapshot(row,'finished');
  }
  function advance(){
    if(stopped)return;ready=false;for(const b of [begin,less,same,more,unknown])b.hidden=true;
    clearSheet();index++;if(index===phases.length){stop('completed');return;}
    status.textContent=`Preparing ${index+1}/${phases.length}: ${phases[index][0]}. Keep pointer off the icon for 0.6 seconds.`;
    later(()=>{
      if(!host.isConnected||!image.isConnected){stop('target removed');return;}
      if(!baseline){baseline={image:style(image),nodes:nodes.map(el=>({el,values:style(el,[...props,...lights])}))};report.rest={image:Object.fromEntries(Object.entries(baseline.image).map(([k,v])=>[k,clean(v)])),ancestors:baseline.nodes.map(({el,values})=>({node:label(el),style:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,clean(v)]))}))};}
      const row={name:phases[index][0],samples:[],events:[],rafIntervalsMs:[],readMs:0,verdict:null};report.phases.push(row);
      const s=baseline.image,properties=split(s['transition-property']),slot=properties.lastIndexOf('scale'),fallback=properties.lastIndexOf('all'),at=slot>=0?slot:fallback>=0?fallback:0;
      const component=p=>{const values=split(s[p]);return values[at%values.length];};
      const easing=component('transition-timing-function'),duration=component('transition-duration'),delay=component('transition-delay');
      let css='';
      const interpolate=!report.reducedMotion&&!report.instantMotion&&!report.prefs['zzglass.instant-ui'];
      if(index===1){if(interpolate)css=selector(image)+`{transition:${s.transition},scale 450ms ${easing} ${delay}!important;}`;else row.unavailable='Reduced/instant motion is active; interpolation override is not applied.';}
      if(index===2||index===3)css=baseline.nodes.map(({el,values})=>selector(el)+'{'+declarations(index===2?{opacity:'1',filter:'none'}:values,index===2?['opacity','filter']:lights)+'}').join('');
      if(index===4){
        const rest=scalar(s.scale);
        if(!interpolate)row.unavailable='Reduced/instant motion is active; interpolation override is not applied.';
        else if(rest===null||nativeHoverScale===null||s.transform!=='none'||host.matches(':hover'))row.unavailable='Baseline did not establish supported rest/hover scale endpoints. Rerun and complete one hover in Current.';
        else{const paint=selector(image),owner=selector(host);css=paint+`{scale:none!important;transform:scale(${rest})!important;transition:${s.transition},scale 0s,transform ${duration} ${easing} ${delay}!important;}`+owner+':hover '+`[${attr}="${image.getAttribute(attr)}"]{transform:scale(${nativeHoverScale})!important;}`;
          if(nativePressScale!==null)css+=owner+':active '+`[${attr}="${image.getAttribute(attr)}"]{transform:scale(${nativePressScale})!important;}`;
        }
      }
      if(css){uri=Services.io.newURI('data:text/css,'+encodeURIComponent(css));ss.loadAndRegisterSheet(uri,ss.USER_SHEET);}
      row.appliedStyle=style(image);row.overrideVerified=index===1?row.appliedStyle['transition-duration'].split(',').some(v=>parseFloat(v)===.45):index===4?!row.unavailable&&row.appliedStyle.scale==='none'&&row.appliedStyle.transform.startsWith('matrix('):null;
      if((index===1||index===4)&&!row.overrideVerified&&!row.unavailable)row.unavailable='Temporary override did not apply; do not interpret this comparison.';
      started=w.performance.now();active={row,recording:attempt(()=>utils.startFrameTimeRecording())};frame=w.requestAnimationFrame(sample);
      status.textContent=`${index+1}/${phases.length}: ${phases[index][0]}. ${row.unavailable||phases[index][1]} Move on/off the SAME icon for 6 seconds.`;
      later(()=>{endCapture();ready=true;if(index===0){begin.textContent='Next comparison';begin.hidden=false;status.textContent='Current recorded. Click Next comparison.';}else{for(const b of [less,same,more,unknown])b.hidden=false;status.textContent=phases[index][0]+': compare jumps against Current, then choose.';}},6000);
    },600);
  }
  listen(begin,'click',()=>{if(index<0||ready)advance();});
  for(const [b,value]of [[less,'fewer'],[same,'same'],[more,'more'],[unknown,'cannot compare']])listen(b,'click',()=>{if(!ready)return;report.phases.at(-1).verdict=value;advance();});
  for(const type of ['pointerover','pointerout','pointerdown','pointerup','transitionrun','transitionend','transitioncancel'])listen(w,type,e=>{
    if(!active||!host)return;
    if(type.startsWith('transition')?e.target!==image&&!nodes.includes(e.target):!host.contains(e.target)||((type==='pointerover'||type==='pointerout')&&host.contains(e.relatedTarget)))return;
    const row=active.row;if(row.events.length<100)row.events.push({ms:+(w.performance.now()-started).toFixed(2),type,property:e.propertyName,target:e.target===image?'image':e.target===host?'host':'ancestor'});
    if((type==='pointerover'||type==='pointerdown')&&(row.scheduledSnapshots||0)<14){row.scheduledSnapshots=(row.scheduledSnapshots||0)+2;later(()=>{if(active?.row===row)snapshot(row,'transition');},70);later(()=>{if(active?.row===row&&host.matches(':hover'))snapshot(row,'settled');},500);}
  },{capture:true});
  listen(w,'error',e=>{if(report.errors.length<12)report.errors.push(String(e.message).slice(0,200));});
  function stop(reason='manual'){
    if(stopped)return;endCapture();stopped=true;
    for(const id of timers)w.clearTimeout(id);timers.clear();abort.abort();
    try{clearSheet();}catch(e){report.errors.push('Style cleanup: '+String(e));}
    for(const {el,value,old}of tagged)if(el.getAttribute(attr)===value){if(old===null)el.removeAttribute(attr);else el.setAttribute(attr,old);}
    panel.remove();if(w[KEY]?.stop===stop)delete w[KEY];report.finished=reason;
    report.mediaflow={present:!!w.ZzMediaflowController,activeSource:attempt(()=>!!w.ZzMediaflowController?.getActiveBC?.())};
    const text=JSON.stringify(report,(_key,value)=>typeof value==='string'?clean(value):value,2);w.__zzHoverABLastReport=text;
    try{Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);w.console.info('[Hover A/B] Report copied; temporary styles removed.',report);}catch(e){w.console.error('[Hover A/B] Clipboard failed; report available as window.__zzHoverABLastReport',e);}
    return text;
  }
  listen(finish,'click',()=>stop());listen(w,'unload',()=>stop('window closed'),{once:true});
  w[KEY]={stop};later(()=>stop('3-minute limit'),180000);
  w.console.info('[Hover A/B] Point at workspace/Favorite, press F8. Five 6-second phases. Report auto-copies after final choice.');
})();
