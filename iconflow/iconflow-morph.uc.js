// ==UserScript==
// @name Iconflow Morph
// @description Approved Circuit parts and semantic motion in existing native command slots.
// @include chrome://browser/content/browser.xhtml
// ==/UserScript==
(() => {
"use strict";
const numberPattern=/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi;
const cleanPath=d=>d?.replace(/^path\(["']?|["']?\)$/g,'');
const numbers=d=>(d.match(numberPattern)||[]).map(Number);
const rounded=value=>Number(value.toFixed(5));
function motionAt(c,time){
 const t=Math.max(0,(time-c.time)/1000),y=c.x-c.target,w=c.omega,b=c.v+w*y,e=Math.exp(-w*t);
 return {x:c.target+(y+b*t)*e,v:(c.v-w*b*t)*e};
}
function retarget(c,target,time,omega=8/.26,instant=false){
 const now=motionAt(c,time);
 Object.assign(c,{x:instant?target:now.x,v:instant?0:now.v,target,time,omega});
}
const channel=(x,time)=>({x,v:0,target:x,time,omega:8/.26});
function transform(value={}){
 if(!value.transform)return {x:value.x||0,y:value.y||0,angle:value.angle||0};
 const n=numbers(value.transform);return {x:n[0]||0,y:n[1]||0,angle:n[2]||0};
}
function mixPath(a,b,t){const target=numbers(b);let i=0;return a.replace(numberPattern,n=>String(Number(n)+(target[i++]-Number(n))*t))}
function pose(model,level=model.level){
 const def=model.definition;
 if(def.kind!=='volume')return def.states.find(s=>s.id===model.state);
 if(level===null)return def.states.find(s=>s.id==='100');
 if(level===0)return def.states.find(s=>s.id==='0');
 const states=def.states.filter(s=>+s.id>0).sort((a,b)=>+a.id-+b.id);
 const hi=states.find(s=>+s.id>=level)||states.at(-1),lo=states.filter(s=>+s.id<=level).at(-1)||states[0];
 const t=hi===lo?0:(level-(+lo.id))/((+hi.id)-(+lo.id));
 const interpolate=key=>lo[key].map((part,i)=>Object.fromEntries(Object.entries(part).map(([p,v])=>[p,p==='d'?mixPath(v,hi[key][i][p],t):typeof v==='number'?v+(hi[key][i][p]-v)*t:v])));
 return {id:String(level),label:'Mute',values:interpolate('values'),wind:interpolate('wind')};
}
function volumeWind(model,current){
 const next=pose(model,model.level===0?model.lastVolume ?? 1:0);
 return current.values.map((part,i)=>{
  if(i===0)return part;
  const own=numbers(part.d);if(Math.abs(own.at(-1)-own[1])<1)return part;
  const target=numbers(next.values[i].d);let j=0;
  return {...part,d:part.d.replace(numberPattern,n=>{const x=Number(n),delta=target[j++]-x;return String(x-Math.max(-.18,Math.min(.18,delta*.03)))})};
 });
}
function createRecord(button,definition,model){
 const time=performance.now(),current=model?pose(model):null;
 const record={id:definition.id,definition,model,svg:button,phase:'rest',hover:false,focus:false,consumed:false,parts:[]};
 record.parts=definition.parts.map((part,i)=>{
  const nodes=[...button.querySelectorAll(`[data-part="${i}"]`)];
  const paths=nodes.map(node=>node.querySelector('path')),path=paths[0],restFill=Number(path?.getAttribute('fill-opacity')??1),base=current?.values[i]||part.rest||{};
  const d=cleanPath(base.d||(part.morph?path?.getAttribute('d'):null));
  const at=transform(base),channels={x:channel(at.x,time),y:channel(at.y,time),angle:channel(at.angle,time),fillOpacity:channel(base.fillOpacity??restFill,time)};
  if(d)channels.d=numbers(d).map(n=>channel(n,time));
  return {definition:part,nodes,paths,paint:{},channels,template:d,restD:d,restFill,paintFill:!!model||part.rest?.fillOpacity!==undefined,turn:0,returnAt:null};
 });
 draw(record,time);return record;
}
function phase(record,value){
 record.phase=value;

}
function eachChannel(part,fn){
 for(const [key,value] of Object.entries(part.channels))if(key==='d')value.forEach(c=>fn(c,'d'));else fn(value,key);
}
function draw(record,time){
 const timeline=record.definition.timeline;
 const markerY=timeline?timeline.baselineY+motionAt(record.parts[timeline.marker].channels.y,time).x:0;
 for(const [index,part] of record.parts.entries()){
  const c=part.channels,x=motionAt(c.x,time).x,y=motionAt(c.y,time).x,a=motionAt(c.angle,time).x;
  const [cx,cy]=part.definition.pivot||[12,12];
  const tx=`translate(${rounded(x)} ${rounded(y)}) rotate(${rounded(a)} ${cx} ${cy})`;
  let d;if(c.d){let i=0;d=part.template.replace(numberPattern,()=>String(rounded(motionAt(c.d[i++],time).x)))}
  const fill=timeline&&index>0&&index<timeline.marker
   ?part.restFill+(1-part.restFill)*Math.max(0,Math.min(1,(timeline.thresholds[index-1]-markerY)/timeline.span))
   :Math.max(0,Math.min(1,motionAt(c.fillOpacity,time).x));
  const opacity=String(rounded(fill));
  for(const [i,node] of part.nodes.entries()){
   if(part.paint.transform!==tx)node.setAttribute('transform',tx);
   if(d&&part.paint.d!==d)part.paths[i].setAttribute('d',d);
   if((d||part.paintFill)&&part.paint.fill!==opacity)part.paths[i].setAttribute('fill-opacity',opacity);
  }
  part.paint={transform:tx,d,fill:opacity};
 }
}
function partTarget(record,index,kind,time,instant=false){
 const part=record.parts[index],definition=part.definition,model=record.model;
 const current=model?pose(model):null;
 const stateWind=model?.definition.kind==='volume'?volumeWind(model,current):current?.wind;
 const value=model?(kind==='wind'?stateWind[index]:current.values[index]):{fillOpacity:part.restFill,...definition.rest,...(kind==='wind'?definition.wind:kind==='fire'?definition.action:{})};
 const t=transform(value),c=part.channels;
 const response=kind==='wind'?180:model?260:definition.responseMs??(definition.spin?400+index*35:190+index*20);
 const omega=8/(response*speed()/1000);
 retarget(c.x,t.x,time,omega,instant);retarget(c.y,t.y,time,omega,instant);
 retarget(c.angle,part.turn+t.angle,time,omega,instant);
 retarget(c.fillOpacity,value?.fillOpacity??1,time,omega,instant);
 if(c.d){
  const raw=model?value.d:kind==='wind'?definition.morph?.wind:kind==='fire'?definition.morph?.action:part.restD;
  const target=numbers(cleanPath(raw||part.restD));
  if(target.length!==c.d.length)throw new Error('Incompatible path landmarks: '+record.id);
  c.d.forEach((ch,i)=>retarget(ch,target[i],time,omega,instant));
 }
}
function rest(record,time=performance.now(),instant=false){
 record.parts.forEach((part,i)=>{part.returnAt=null;partTarget(record,i,'rest',time,instant)});
 if(instant){active.delete(record);draw(record,time);phase(record,'rest')}
 else{phase(record,'return');active.add(record);schedule()}
}
function schedule(){if(frame===null&&!retired&&!document.hidden&&(pending||presentations.size||fading.size||active.size&&!reduced()))frame=requestAnimationFrame(tick)}
function tick(time){
 frame=null;flush();
 if(retired||document.hidden||reduced()){for(const record of [...active])rest(record,time,true);return}
 for(const record of [...active]){
  if (!visible(record)) { rest(record,time,true); continue; }
  for(let i=0;i<record.parts.length;i++){
   const part=record.parts[i];
   if(part.returnAt!==null&&time>=part.returnAt){const deadline=part.returnAt;part.returnAt=null;partTarget(record,i,'rest',deadline)}
  }
  let moving=false;
  for(const part of record.parts){
   if(part.returnAt!==null)moving=true;
   eachChannel(part,(c,key)=>{const v=motionAt(c,time),eps=key==='angle'?.002:.00015;
    if(Math.abs(v.x-c.target)>eps||Math.abs(v.v)>.012)moving=true;
    else if(c.x!==c.target||c.v!==0)Object.assign(c,{x:c.target,v:0,time});
   });
  }
  draw(record,time);
  if(!moving){active.delete(record);phase(record,record.phase==='wind'?'armed':'rest')}
 }
 schedule();
}
function setHover(id,hover){
 const record=id;if(!record)return;
 record.hover=hover;
 if(!hover)record.consumed=false;
 if(record.phase==='fire')return;
 if(stationary(record)||record.host?.disabled||record.host?.getAttribute('disabled')==='true'){rest(record,performance.now(),true);return}
 const time=performance.now();
 if((hover||record.focus)&&!record.consumed){record.parts.forEach((part,i)=>partTarget(record,i,'wind',time));phase(record,'wind');active.add(record);schedule()}
 else rest(record,time);
}
function action(record,time){
 record.consumed=true;
 record.parts.forEach((part,i)=>{
  if(!record.model)part.turn+=part.definition.spin||0;
  part.returnAt=record.model||part.definition.spin?null:time+(part.definition.returnMs??130+i*18);
  partTarget(record,i,'fire',time,stationary(record));
 });

 if(stationary(record)){rest(record,time,true);return}
 phase(record,'fire');active.add(record);schedule();
}
// The pure channels also run under node's existing regression entry point.
if (typeof window === 'undefined') { globalThis.IconMorph={motionAt,retarget,channel,pose,mixPath,transform}; return; }
const KEY='__zziconMorphInstance';
window[KEY]?.retire();
const S=Services.prefs, abort=new AbortController(), active=new Set(), instances=new Map(), positions=new Map(), slots=new Map();
const roots=new Set(), presentations=new Set(), fading=new Set();
const reduce=matchMedia('(prefers-reduced-motion: reduce)'), forced=matchMedia('(forced-colors: active)');
let retired=false, frame=null, pending=false, data=null, contextDownload=null, bindings=[], bindingSet=new Set(), selector='', serial=0, speedValue=1;
const downloadTargets=new WeakMap();
const int=(key,fallback=0)=>S.getIntPref('zzicon.'+key,fallback);
const reduced=()=>reduce.matches||forced.matches||!S.getBoolPref('zzicon.animate',true);
const stationary=r=>reduced()||(r.host?.closest('menuitem, menupopup')&&!S.getBoolPref('zzicon.menu.animate',false));
const speed=()=>speedValue;
const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:abort.signal});
const enabled=b=>!forced.matches&&int('set',4)===4&&(b.setting==='library'?int('library.style',11)===11:!b.setting||int('button.'+b.setting)===0);
const visible=r=>r.present&&r.host.isConnected;
const svgNS='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs={})=>{const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
const commandSelector='toolbarbutton, button, menuitem, menu, .tab-close-button, .tab-reset-button, .urlbar-icon';
function snapshot(binding,host,definition) {
 const control=data.controls.find(c=>c.id===definition.controlId);if(!control)return null;
 const card=host.closest('.zen-media-card'), pip=document.getElementById('zen-sidebar-pip-container');
 let state;
 switch(control.id){
 case 'playback': state=card?(card.classList.contains('playing')?'playing':'paused'):(pip?.hasAttribute('zzmf-paused')?'paused':'playing');break;
 case 'bookmark-toggle': {
  if(binding.state==='bookmark-launcher'){state='unsaved';break;}
  // Native context refresh marks the actual target. Link/add commands remain add commands.
  if(host.id==='star-button')state=host.hasAttribute('starred')?'saved':'unsaved';
  else state=host.hasAttribute('starred')||host.zziconBookmarked===true?'saved':'unsaved';
  break;
 }
 case 'volume-control': {
  const muted=card?card.hasAttribute('muted'):pip?.hasAttribute('zzmf-muted');
  const raw=card?card.getAttribute('data-zz-volume'):pip?.getAttribute('data-zz-volume');
  const level=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(+raw)?Math.max(0,Math.min(100,+raw)):null;
  // ponytail: native Zen exposes only tab mute; keep numeric state unknown
  // until its media controller supplies source volume. Null means unknown;
  // use the unmuted glyph endpoint without asserting or writing a volume level.
  return {definition:control,state:muted?'muted':'audible',level:muted?0:level,lastVolume:level,unknown:level===null};
 }
 case 'download-playback': {
  const popup=host.closest('menupopup');
  const row=popup?.triggerNode?.closest('.download, .download-state, .zen-library-download-list-download')||(popup?.id==='downloadsContextMenu'?document.getElementById('downloadsListBox')?.selectedItem:null);
  const download=downloadTargets.get(popup)||popup?.zziconDownload||row?.download||row?._shell?.download||row?._download;
  state=download?(!download.stopped?'downloading':'paused'):host.getAttribute('data-l10n-id')==='downloads-cmd-resume'?'paused':'downloading';break;
 }
 case 'window-size':state=window.windowState===window.STATE_MAXIMIZED?'maximized':'normal';break;
 case 'video-visibility':state=host.getAttribute('data-zz-video-visible')==='true'?'visible':'hidden';break;
 case 'menu-state':state=host.getAttribute('open')==='true'||document.getElementById('appMenu-popup')?.state==='open'?'open':'closed';break;
 case 'compact-mode':state=document.documentElement.getAttribute('zen-compact-mode')==='true'?'compact':'expanded';break;
 case 'sidebar-state':state=(host.id==='zen-expand-sidebar-button'?document.documentElement.getAttribute('zen-sidebar-expanded')==='true':!!window.SidebarController?.isOpen)?'open':'closed';break;
 case 'fullscreen-state':state=window.fullScreen?'fullscreen':'windowed';break;
 }
 return {definition:control,state};
}
function modelKey(model){return model?JSON.stringify([model.state,model.level,model.unknown]):'';}
// Gecko anchors follow the native slot through transforms, popup relocation,
// flex reordering and compact expansion. No screen-coordinate subtraction or
// per-icon geometry polling. Padding/visibility stay under the native owner.
function presentation(record){
 const {slot,host}=record,titlebar=host.classList.contains('titlebar-button')&&S.getBoolPref('zzglass.buttons.enabled',false);
 const source=titlebar?host:slot,css=getComputedStyle(source),popup=host.closest('menupopup, panel');
 const shown=source.isConnected&&css.display!=='none'&&css.visibility==='visible'&&source.getClientRects().length&&(!popup||['open','showing'].includes(popup.state));
 const opacity=slot===host&&!record.imageSlot?1:Number(css.opacity);
 const inset=side=>(parseFloat(css['padding'+side])||0)+(parseFloat(css['border'+side+'Width'])||0);
 return {record,shown,opacity,insets:['Left','Top','Right','Bottom'].map(inset)};
}
function paintPresentation({record:r,shown,opacity,insets}){
 r.present=!!shown&&opacity>0;
 const write=(key,value)=>{if(r.svg.style[key]!==value)r.svg.style[key]=value;};
 write('visibility',shown?'inherit':'hidden');write('opacity',String(opacity));
 if(r.slot!==r.host||r.imageSlot){
  const [left,top,right,bottom]=insets;
  write('left',`calc(anchor(left) + ${left}px)`);write('top',`calc(anchor(top) + ${top}px)`);
  write('width',`max(0px, calc(anchor-size(width) - ${left+right}px))`);
  write('height',`max(0px, calc(anchor-size(height) - ${top+bottom}px))`);
 }
 if(!r.present&&active.has(r))rest(r,performance.now(),true);
}
function present(root){
 for(const r of instances.values())if(root===document||root===r.slot||root.contains?.(r.host)||r.host.contains(root))presentations.add(r);
 schedule();
}

function remove(record){
 active.delete(record);instances.delete(record.host);slots.delete(record.slot);presentations.delete(record);fading.delete(record);resize.unobserve(record.slot);
 record.svg.remove();
 if(record.anchorValue)record.slot.style.setProperty('anchor-name',record.anchorValue,record.anchorPriority);else record.slot.style.removeProperty('anchor-name');
 record.slot.removeAttribute('data-zz-morph-slot');record.host.removeAttribute('data-zz-morph');
 if(record.addedClass)record.host.classList.remove('menuitem-iconic');
 if(record.ownedSlot)record.slot.remove();
 const parent=record.parent;
 const position=positions.get(parent);if(position&&!--position.users){positions.delete(parent);if(parent.style.position==='relative'){if(position.value)parent.style.setProperty('position',position.value,position.priority);else parent.style.removeProperty('position');}}
}
function attach(binding,el){
 const host=el.matches(commandSelector)?el:el.closest(commandSelector)||el;
 if(instances.has(host))return;
 let slot=el;
 if(el===host)slot=host.querySelector('.toolbarbutton-icon, .menu-iconic-icon, .titlebar-icon, image')||host;
 let addedClass=false;
 if(host.localName==='menuitem'&&slot===host){addedClass=!host.classList.contains('menuitem-iconic');host.classList.add('menuitem-iconic');slot=host.querySelector('.menu-iconic-icon')||host;}
 const definition={id:binding.action,...data.glyphs[data.actions[binding.action].glyph]};
 const model=snapshot(binding,host,definition), svg=svgNode('svg',{viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false',class:'zzicon-morph-glyph'});
 // Only packaged path primitives are parsed. No remote SVG, scripts, references or handlers.
 for(const [i,part] of definition.parts.entries()){
  const group=svgNode('g',{'data-part':i});
  const parsed=new DOMParser().parseFromString(`<svg xmlns="${svgNS}">${part.svg}</svg>`,'image/svg+xml');
  for(const path of parsed.documentElement.children){
   for(const node of [path,...path.querySelectorAll('*')])if(!['path','rect','circle','ellipse','polygon','polyline','line','g'].includes(node.localName)||[...node.attributes].some(a=>/^on|href/i.test(a.name)||/url\(/i.test(a.value)))throw new Error('Unsupported Morph primitive');
   group.append(document.importNode(path,true));
  }
  svg.append(group);
 }
 let ownedSlot=false;
 if(slot===host&&host.namespaceURI==='http://www.w3.org/1999/xhtml'&&host.textContent.trim()){
  slot=document.createElementNS('http://www.w3.org/1999/xhtml','span');slot.style.cssText='display:inline-block;width:16px;height:16px;margin-inline-end:5px;vertical-align:middle';host.prepend(slot);ownedSlot=true;
 }
 const imageSlot=['image','img'].includes(slot.localName);
 const parent=slot===host&&!imageSlot?host:slot.parentElement;
 if(!positions.has(parent)&&getComputedStyle(parent).position==='static'){positions.set(parent,{users:0,value:parent.style.getPropertyValue('position'),priority:parent.style.getPropertyPriority('position')});parent.style.position='relative';}
 if(positions.has(parent))positions.get(parent).users++;
 const anchorValue=slot.style.getPropertyValue('anchor-name'),anchorPriority=slot.style.getPropertyPriority('anchor-name');
 if(slot!==host||imageSlot){
  const anchor='--zzicon-slot-'+(++serial),native=getComputedStyle(slot).anchorName;
  slot.style.setProperty('anchor-name',native&&native!=='none'?native+', '+anchor:anchor,'important');svg.style.positionAnchor=anchor;
 }
 else svg.classList.add('zzicon-morph-centered');
 parent.append(svg);host.setAttribute('data-zz-morph',binding.action);if(slot!==host||imageSlot)slot.setAttribute('data-zz-morph-slot','');
 const record=createRecord(svg,definition,model);Object.assign(record,{host,slot,parent,el,imageSlot,anchorValue,anchorPriority,addedClass,ownedSlot,binding,key:modelKey(model),present:false});
 instances.set(host,record);slots.set(slot,record);resize.observe(slot);presentations.add(record);
}
function discover(root){
 if(!selector||!root.isConnected)return;
 const candidates=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
 for(const el of candidates){
  const binding=bindings.find(b=>el.matches(b.selector));if(!binding)continue;
  const host=el.matches(commandSelector)?el:el.closest(commandSelector)||el,old=instances.get(host);
  if(old?.binding.action===binding.action)continue;
  if(old)remove(old);attach(binding,el);
 }
}
function flush(){
 if(retired||!data)return;
 const statesChanged=pending;
 if(pending){
  pending=false;
  for(const r of [...instances.values()]){
   if(!r.el.isConnected){remove(r);continue;}
   if(bindingSet.has(r.binding)&&r.el.matches(r.binding.selector))continue;
   const next=bindings.find(b=>r.el.matches(b.selector));
   // Pause/resume may change localization selectors while retaining the same
   // native command and semantic control. Keep its paths and motion channels.
   if(next?.action===r.binding.action)r.binding=next;else remove(r);
  }
  // Only added/changed subtrees are discovered; state and layout events never
  // rescan 193 document-wide selectors. Coalesce overlapping mutation roots.
  const batch=[...roots];roots.clear();
  for(const root of batch)if(!batch.some(other=>other!==root&&other.contains(root)))discover(root);
 }
 const paints=[...new Set([...presentations,...fading])].filter(r=>instances.has(r.host)).map(presentation);presentations.clear();
 for(const paint of paints)paintPresentation(paint);
 if(!statesChanged)return;
 for(const r of instances.values()){
  if(!r.model)continue;
  const model=snapshot(r.binding,r.host,r.definition),key=modelKey(model);
  if(key!==r.key){r.model=model;r.key=key;if(visible(r))action(r,performance.now());else rest(r,performance.now(),true);}
 }
}
function sync(){
 if(!data||retired)return;
 speedValue=Math.max(.1,parseFloat(S.getStringPref('zzicon.speed','0.45'))/.45||1);
 bindings=data.bindings.filter(enabled);bindingSet=new Set(bindings);selector=bindings.map(b=>b.selector).join(',');
 roots.add(document.documentElement);pending=true;present(document);flush();schedule();
}
function soon(){pending=true;schedule();}
const resize=new ResizeObserver(entries=>{for(const e of entries){const r=slots.get(e.target);if(r)presentations.add(r);}schedule();});
const changes=new MutationObserver(records=>{
 for(const r of records){
  if(r.target.closest?.('.zzicon-morph-glyph')||r.attributeName==='style'&&!slots.has(r.target)&&!instances.has(r.target))continue;
  if(r.type==='childList'){
   const added=[...r.addedNodes].filter(n=>n.nodeType===1&&!n.matches('.zzicon-morph-glyph'));
   for(const node of added)roots.add(node);
   if(added.length||[...r.removedNodes].some(n=>n.nodeType===1&&!n.matches('.zzicon-morph-glyph')))pending=true;
  }else{
   if(['class','id','data-zz-action','data-l10n-id','zzmf-toggle','downloading','show-in-folder'].includes(r.attributeName))roots.add(r.target);
   present(r.target);pending=true;
  }
 }
 if(pending)schedule();
});
// Native opacity transitions (notably tab close buttons) remain authoritative.
// Sample only their own finite transition, never all controls or descendants.
for(const type of ['transitionrun','transitionend','transitioncancel'])listen(window,type,e=>{
 if(e.propertyName!=='opacity')return;const r=slots.get(e.target);if(!r)return;
 if(type==='transitionrun')fading.add(r);else fading.delete(r);
 presentations.add(r);schedule();
},{capture:true});

function recordFor(event){let el=event.target;while(el?.nodeType===1){if(instances.has(el))return instances.get(el);el=el.parentElement;}return event.sourceEvent&&event.sourceEvent!==event?recordFor(event.sourceEvent):null;}
listen(window,'pointerover',e=>{const r=recordFor(e);if(r&&!r.host.contains(e.relatedTarget)&&e.pointerType!=='touch')setHover(r,true);});
listen(window,'pointerout',e=>{const r=recordFor(e);if(r&&!r.host.contains(e.relatedTarget))setHover(r,false);});
listen(window,'DOMMenuItemActive',e=>{const r=recordFor(e);if(r)setHover(r,true);});
listen(window,'DOMMenuItemInactive',e=>{const r=recordFor(e);if(r)setHover(r,false);});
listen(window,'focusin',e=>{const r=recordFor(e);if(r){r.focus=r.host.matches(':focus-visible');setHover(r,r.hover);}});
listen(window,'focusout',e=>{const r=recordFor(e);if(r){r.focus=false;setHover(r,r.hover);}});
// Visual listeners never dispatch, suppress or defer the native command. XUL
// emits command as well as click; observe command for XUL, click for HTML only.
function activated(e){
 const direct=recordFor(e),targets=direct?[direct]:e.type==='command'&&e.target.localName==='command'?[...instances.values()].filter(r=>r.host.getAttribute('command')===e.target.id):[];
 for(const r of targets){
 if(r.host.disabled||r.host.getAttribute('disabled')==='true')continue;
 const xul=r.host.namespaceURI==='http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
 if(e.type==='click'&&(e.button!==0||(xul&&r.host.localName!=='image')))continue;
 if(r.model){r.consumed=true;rest(r,performance.now(),stationary(r)||!visible(r));soon();}else action(r,performance.now());
 }
}
listen(window,'command',activated,{capture:true});listen(window,'click',activated,{capture:true});
function layout(event){present(event?.target?.nodeType===1?event.target:document);soon();}
for(const type of ['popupshown','popuphidden','ViewShown','sizemodechange','fullscreen','TabSelect','TabAttrModified','ZenWorkspaceChanged'])listen(window,type,layout);
listen(window,'aftercustomization',sync);
function motionChanged(){if(frame!==null)cancelAnimationFrame(frame);frame=null;for(const r of instances.values())rest(r,performance.now(),true);sync();}
listen(reduce,'change',motionChanged);listen(forced,'change',motionChanged);listen(document,'visibilitychange',motionChanged);
// Zen's stack creates a fresh popup without a triggerNode. Capture its actual
// row before the native handler closes over that Download; never use another list.
listen(window,'contextmenu',event=>{
 const row=event.target.closest?.('.zen-library-download-list-download');
 contextDownload=row?.download||null;const target=contextDownload;
 queueMicrotask(()=>{if(contextDownload===target)contextDownload=null;});
},{capture:true});
listen(window,'popupshowing',event=>{
 const popup=event.target;
 if(contextDownload&&popup.localName==='menupopup'&&popup.querySelector('[data-l10n-id^="downloads-cmd-"], [data-l10n-id="library-downloads-menu-retry"]'))downloadTargets.set(popup,contextDownload);
});
listen(window,'popuphidden',event=>downloadTargets.delete(event.target));
const teardown=[];
const {PlacesUtils}=ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
async function contextBookmarks(){
 for(const id of ['context_bookmarkTab','context-bookmarklink','context-bookmarkpage']){
  const host=document.getElementById(id);if(!host||!host.closest('menupopup')||!['open','showing'].includes(host.closest('menupopup').state))continue;
  const uri=id==='context_bookmarkTab'?window.TabContextMenu?.contextTab?.linkedBrowser?.currentURI:
   id==='context-bookmarklink'?window.gContextMenu?.linkURI:gBrowser.selectedBrowser?.currentURI;
  if(!uri)continue;const url=uri.spec,token={};host.zziconBookmarkRequest=token;
  const saved=await PlacesUtils.bookmarks.fetch({url}).catch(()=>null);
  if(!retired&&host.isConnected&&host.zziconBookmarkRequest===token){host.zziconBookmarked=!!saved;soon();}
 }
}
listen(window,'popupshown',contextBookmarks);
const bookmarkChanged=()=>{contextBookmarks();soon();};
PlacesUtils.observers.addListener(['bookmark-added','bookmark-removed'],bookmarkChanged);
teardown.push(()=>PlacesUtils.observers.removeListener(['bookmark-added','bookmark-removed'],bookmarkChanged));
window.gZenStartup?.promiseInitialized?.then(()=>{
 if(retired)return;
 const {DownloadsCommon}=ChromeUtils.importESModule('moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs');
 const downloads=DownloadsCommon.getData(window),view={onDownloadAdded:soon,onDownloadChanged:soon,onDownloadRemoved:soon};
 downloads.addView(view);teardown.push(()=>downloads.removeView(view));
}).catch(error=>console.warn('[Iconflow] download state',error));
const prefs={observe:motionChanged},glassPrefs={observe:layout};S.addObserver('zzicon.',prefs);S.addObserver('zzglass.buttons.',glassPrefs);
const instance={retire(){
 if(retired)return;retired=true;abort.abort();for(const undo of teardown.splice(0))undo();
 for(const host of document.querySelectorAll('#context_bookmarkTab,#context-bookmarklink,#context-bookmarkpage')){delete host.zziconBookmarked;delete host.zziconBookmarkRequest;}changes.disconnect();resize.disconnect();
 S.removeObserver('zzicon.',prefs);S.removeObserver('zzglass.buttons.',glassPrefs);if(frame!==null)cancelAnimationFrame(frame);frame=null;roots.clear();presentations.clear();fading.clear();
 for(const r of [...instances.values()])remove(r);
 if(window[KEY]===instance)delete window[KEY];
},get records(){return instances;},get active(){return active.size;},get scheduled(){return frame!==null;},refresh:sync};
window[KEY]=instance;listen(window,'unload',()=>instance.retire(),{once:true});window.addUnloadListener?.(()=>instance.retire());
if(!CSS.supports('position-anchor','--zzicon-slot')){instance.retire();return;}
fetch('chrome://sine/content/zz-iconflow/morph.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(value=>{
 if(retired)return;data=value;
 changes.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','id','data-zz-action','zzmf-toggle','downloading','show-in-folder','starred','muted','open','hidden','collapsed','checked','disabled','sizemode','zen-sidebar-expanded','zen-compact-mode','zzmf-paused','zzmf-muted','data-zz-volume','data-zz-video-visible','data-l10n-id']});sync();
}).catch(error=>{console.error('[Iconflow] Morph loading failed',error);instance.retire();});
})();
