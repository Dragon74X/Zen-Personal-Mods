// ==UserScript==
// @name Glassflow edge input
// @description Retarget existing rim directions from current state to pointer and back.
// @include chrome://browser/content/browser.xhtml
// ==/UserScript==
(() => {
'use strict';
const KEY='__zzglassEdgesInstance';window[KEY]?.retire();
const abort=new AbortController(), records=new Map(), moving=new Set(), layouts=new Map();
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
let point=null, frame=null, dirty=false, retired=false;
const listen=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal:abort.signal});
const enabled=()=>!retired&&!document.hidden&&!reduced.matches&&!forced.matches&&Services.prefs.getBoolPref('zzglass.motion.enabled',true)&&!Services.prefs.getBoolPref('zzglass.instant-ui',false);
const selectors='.tabbrowser-tab, .tab-group-label-container, .tab-group-container, #navigator-toolbox, #zen-toolbar-background, .titlebar-button, #zen-workspaces-button, #zen-workspaces-button toolbarbutton, #navigator-toolbox .toolbarbutton-1, .zzicon-ws-swatch, .zzicon-ws-search, .zen-library-space, zen-library, #zen-library-download-list, .zzgf-gradient-editor, .zzdl-panel, .zzdl-name, .zzdl-btn, #zen-sidebar-pip-container, #zen-sidebar-pip-caption, zen-zap-bar';
const properties=['--zzg-follow-angle','--zzg-follow-gradient','--zzg-follow-top','--zzg-follow-right','--zzg-follow-bottom','--zzg-follow-left','--zzg-follow-ring-x','--zzg-follow-ring-y'];
function sample(c,time){const t=Math.max(0,(time-c.time)/1000),y=c.x-c.target,b=c.v+c.w*y,e=Math.exp(-c.w*t);return{x:c.target+(y+b*t)*e,v:(c.v-c.w*b*t)*e};}
function target(c,value,time,w){const p=sample(c,time);Object.assign(c,{x:p.x,v:p.v,target:value,time,w});}
const near=(angle,reference)=>reference+((angle-reference+540)%360+360)%360-180;
function origin(el,returning=false){
 const s=getComputedStyle(el);let kind=s.getPropertyValue('--zzg-edge-owner').trim();
 if(kind==='group'&&getComputedStyle(el.querySelector('.zzgf-rim')).display==='none')kind='header';
 if(!kind||kind==='none')return null;
 let a=kind==='tab'?s.getPropertyValue('--zzg-edge-angle'):kind==='group'?s.getPropertyValue('--zzgf-state-rim-dir'):kind==='header'?s.getPropertyValue('--zzgf-dir'):kind==='rail'?s.getPropertyValue('--zzgf-rimA'):'90deg';
 a=a.trim();const words={'to right':90,'to left':270,'to top':0,'to bottom':180};
 let value=words[a]??parseFloat(a);if(!Number.isFinite(value))value=90;
 // Gradients use 180deg for a top origin; inset shadows use 90deg.
 if(kind==='tab'||!['group','header','rail'].includes(kind))value+=90;
 return {angle:value,shadow:kind==='group'?value:value-90,kind,response:Math.max(1,(parseFloat(s.getPropertyValue('--zzg-motion-ms'))||150)/150*(returning?260:180))};
}
function schedule(){if(frame===null&&enabled()&&(dirty||moving.size||point&&layouts.size))frame=requestAnimationFrame(tick);}
function release(r,time){if(!r.hover)return;r.hover=false;const o=origin(r.el,true);target(r.weight,0,time,o?8/(o.response/1000):r.angle.w);resize.unobserve(r.observed||r.el);if(o){target(r.angle,near(o.angle,sample(r.angle,time).x),time,8/(o.response/1000));target(r.shadow,near(o.shadow,sample(r.shadow,time).x),time,8/(o.response/1000));}moving.add(r);}
function remove(r){for(const p of properties)r.el.style.removeProperty(p);resize.unobserve(r.observed||r.el);moving.delete(r);records.delete(r.el);}
function clear(){layouts.clear();point=null;dirty=false;if(frame!==null)cancelAnimationFrame(frame);frame=null;for(const r of [...records.values()])remove(r);}
function gather(time){
 dirty=false;const owners=new Set();
 let el=point?.target?.isConnected?point.target:null;
 if(point&&point.resolve)el=document.elementFromPoint(point.x,point.y)||el;
 const surfaces=[];for(;el?.nodeType===1;el=el.parentElement)surfaces.push(el);
 if(surfaces.some(el=>el.id==='navigator-toolbox'))surfaces.push(document.getElementById('zen-toolbar-background'));
 if(surfaces.some(el=>el.id==='zen-sidebar-pip-container'))surfaces.push(document.getElementById('zen-sidebar-pip-caption'));
 for(const el of surfaces){
  if(!el)continue;
  if(!el.matches(selectors))continue;const o=origin(el);if(!o)continue;
  const actual=o.kind==='tab'?el.querySelector('.tab-background')||el:el;
  const box=actual.getBoundingClientRect();if(!box.width||!box.height)continue;
  owners.add(el);let r=records.get(el);
  if(!r){r={el,hover:true,kind:o.kind,angle:{x:o.angle,v:0,target:o.angle,time,w:8/(o.response/1000)},shadow:{x:o.shadow,v:0,target:o.shadow,time,w:8/(o.response/1000)},weight:{x:0,v:0,target:0,time,w:8/(o.response/1000)}};records.set(el,r);resize.observe(actual);r.observed=actual;}
  if(!r.hover)resize.observe(r.observed||r.el);r.hover=true;target(r.weight,1,time,r.angle.w);
  const x=Math.max(0,Math.min(1,(point.x-box.left)/box.width)),y=Math.max(0,Math.min(1,(point.y-box.top)/box.height));
  const angle=Math.abs(x-.5)+Math.abs(y-.5)<.02?r.angle.target:Math.atan2(.5-x,y-.5)*180/Math.PI;
  target(r.angle,near(angle,sample(r.angle,time).x),time,8/(o.response/1000));target(r.shadow,near(angle-90,sample(r.shadow,time).x),time,8/(o.response/1000));moving.add(r);
 }
 for(const r of records.values())if(!owners.has(r.el))release(r,time);
}
function tick(time){
 frame=null;if(!enabled()){clear();return;}
 for(const [el,props] of layouts)if(!el.isConnected||!el.getAnimations({subtree:true}).some(a=>a.playState==='running'))layouts.delete(el);
 if(point&&layouts.size){point.resolve=true;dirty=true;}if(dirty)gather(time);
 for(const r of [...moving]){
  if(!r.el.isConnected||!r.el.getClientRects().length){remove(r);continue;}
  if(!r.hover){const o=origin(r.el,true);if(!o){remove(r);continue;}const angle=near(o.angle,sample(r.angle,time).x);if(Math.abs(angle-r.angle.target)>.01)target(r.angle,angle,time,8/(o.response/1000));const shadow=near(o.shadow,sample(r.shadow,time).x);if(Math.abs(shadow-r.shadow.target)>.01)target(r.shadow,shadow,time,8/(o.response/1000));}
  const at=sample(r.angle,time),weight=sample(r.weight,time),shade=sample(r.shadow,time),gradient=at.x,shadow=shade.x;
  r.el.style.setProperty('--zzg-follow-gradient',gradient+'deg');r.el.style.setProperty('--zzg-follow-angle',shadow+'deg');
  const x=Math.cos(shadow*Math.PI/180),y=Math.sin(shadow*Math.PI/180);
  for(const [side,strength] of [['top',y],['right',-x],['bottom',-y],['left',x]])r.el.style.setProperty('--zzg-follow-'+side,(100-35*weight.x*(1-Math.max(0,strength)))+'%');
  r.el.style.setProperty('--zzg-follow-ring-x',(x*.35*weight.x)+'px');r.el.style.setProperty('--zzg-follow-ring-y',(y*.35*weight.x)+'px');
  if(Math.abs(shade.x-r.shadow.target)<.01&&Math.abs(shade.v)<.02&&Math.abs(at.x-r.angle.target)<.01&&Math.abs(at.v)<.02&&Math.abs(weight.x-r.weight.target)<.001&&Math.abs(weight.v)<.01){moving.delete(r);if(!r.hover)remove(r);}
 }
 schedule();
}
const resize=new ResizeObserver(()=>layout());
function layout(){if(point){point.resolve=true;dirty=true;schedule();}}
function leave(){point=null;dirty=true;schedule();}
listen(window,'pointermove',e=>{if(!enabled()||e.pointerType==='touch')return;point={x:e.clientX,y:e.clientY,target:e.target};dirty=true;schedule();},{passive:true});
listen(window,'pointerout',e=>{if(!e.relatedTarget)leave();});listen(window,'pointercancel',leave);listen(window,'blur',leave);
for(const type of ['resize','scroll','popupshown','popuphidden','TabMove','TabSelect','TabAttrModified','ZenWorkspaceChanged','aftercustomization','animationend'])listen(window,type,layout,{capture:true,passive:true});
for(const type of ['transitionrun','transitionend','transitioncancel'])listen(window,type,e=>{
 if(!point||e.target.closest?.('.zzicon-morph-glyph')||e.propertyName.startsWith('--zzg-'))return;
 if(![...records.keys()].some(el=>e.target===el||e.target.contains(el)))return;
 if(type==='transitionrun'){let props=layouts.get(e.target);if(!props)layouts.set(e.target,props=new Set());props.add(e.propertyName);}
 else {const props=layouts.get(e.target);props?.delete(e.propertyName);if(!props?.size)layouts.delete(e.target);}
 layout();
},{capture:true});
// Layout/shape changes invalidate only while a pointer owns edges. Animated
// glyph path writes are excluded; no idle geometry reads or recurring timer.
const externalStyle=value=>(value||'').replace(/--zzg-follow-[^:;]+:[^;]*(?:;|$)/g,'').replace(/\s+/g,'');
const watch=new MutationObserver(changes=>{if(point&&changes.some(c=>!c.target.closest?.('.zzicon-morph-glyph')&&(c.attributeName!=='style'||externalStyle(c.oldValue)!==externalStyle(c.target.getAttribute('style')))))layout();});
watch.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['style','hidden','collapsed','zen-sidebar-expanded','zen-compact-mode','class','selected','visuallyselected','pending','zen-folder','zzgf-active']});
const changed={observe(){if(!enabled())clear();else layout();}};
for(const p of ['zzglass.','zzgroup.','zzlib.','zzmedia.','zzicon.'])Services.prefs.addObserver(p,changed);
listen(reduced,'change',clear);listen(forced,'change',clear);listen(document,'visibilitychange',clear);
const instance={retire(){if(retired)return;retired=true;clear();abort.abort();watch.disconnect();resize.disconnect();for(const p of ['zzglass.','zzgroup.','zzlib.','zzmedia.','zzicon.'])Services.prefs.removeObserver(p,changed);if(window[KEY]===instance)delete window[KEY];},get active(){return moving.size;},get owners(){return records.size;},get scheduled(){return frame!==null;}};
window[KEY]=instance;listen(window,'unload',()=>instance.retire(),{once:true});window.addUnloadListener?.(()=>instance.retire());
})();
