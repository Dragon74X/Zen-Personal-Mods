// ==UserScript==
// @name Iconflow native Morph frames
// @description Approved windup and release in native image slots; browser-managed frames.
// @include chrome://browser/content/browser.xhtml
// ==/UserScript==
(() => {
'use strict';
const KEY='__zziconMorphInstance';window[KEY]?.retire();
const S=Services.prefs,abort=new AbortController(),records=new Map(),pendingHosts=new Map(),images=new Map(),roots=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
const downloadTargets=new WeakMap();
let data,index,bindings=[],selector='',queued=false,retired=false,contextDownload;
const int=(key,fallback=0)=>S.getIntPref('zzicon.'+key,fallback);
const enabled=(b,host)=>!forced.matches&&int('set',4)===4&&(b.setting==='library'?int('library.style',11)===11:!b.setting||int('button.'+b.setting)===0)&&
 (!host||!host.closest('menupopup,panelview,menu,menuitem')||S.getBoolPref('zzicon.menu.animate',false));
const still=()=>reduced.matches||forced.matches||!S.getBoolPref('zzicon.animate',true);
const listen=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal:abort.signal});
const namespace='http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const ownerSelector='toolbarbutton, button, menuitem, menu, .tab-close-button, .tab-reset-button, .urlbar-page-action, .identity-box-button';
const savedProperties=['--zzicon-frame','--zzicon-sprite','--zzicon-columns','--zzicon-rows','--zzicon-row-position','--zzicon-row'];
function snapshot(binding,host,definition) {
 const control=data.controls.find(c=>c.id===definition.controlId);if(!control)return null;
 const card=host.closest('.zen-media-card'), pip=document.getElementById('zen-sidebar-pip-container');
 let state;
 switch(control.id){
 case 'playback': state=card?(card.classList.contains('playing')?'playing':'paused'):(pip?.hasAttribute('zzmf-paused')?'paused':'playing');break;
 case 'bookmark-toggle': {
  if(binding.state==='bookmark-launcher'){state='unsaved';break;}
  // Native context refresh marks the actual target. Link/add commands remain add commands.
  if(host.id==='star-button'||host.id==='star-button-box')state=(host.querySelector?.('#star-button')||host).hasAttribute('starred')?'saved':'unsaved';
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
 case 'video-visibility':state=host.getAttribute('data-zz-video-visible')==='true'?'visible':'hidden';break;
 case 'menu-state':state=host.getAttribute('open')==='true'||document.getElementById('appMenu-popup')?.state==='open'?'open':'closed';break;
 case 'compact-mode':state=document.documentElement.getAttribute('zen-compact-mode')==='true'?'compact':'expanded';break;
 case 'sidebar-state':state=(host.id==='zen-expand-sidebar-button'?document.documentElement.getAttribute('zen-sidebar-expanded')==='true':!!window.SidebarController?.isOpen)?'open':'closed';break;
 case 'fullscreen-state':state=window.fullScreen?'fullscreen':'windowed';break;
 }
 return {definition:control,state};
}


function stateKey(model){
 if(!model)return 'rest';
 if(model.definition.kind!=='volume')return model.state;
 // The approved volume drawing has six landmarks. Native numeric volume and
 // the command target remain untouched; its icon selects the nearest landmark.
 const level=model.level??100;
 return model.definition.states.reduce((a,b)=>Math.abs(+a.id-level)<=Math.abs(+b.id-level)?a:b).id;
}
function rowFor(r,from,to){return r.rows.findIndex(row=>row[0]===from&&(to===undefined||row[1]===to));}
function setRow(r,row){r.row=Math.max(0,row);r.paint.style.setProperty('--zzicon-row',r.row);r.paint.style.setProperty('--zzicon-row-position',(r.rows.length>1?r.row*100/(r.rows.length-1):0)+'%');}
function stop(r){const a=r.animation;r.animation=null;a?.cancel();}
function finish(r){
 stop(r);setRow(r,rowFor(r,r.state));r.paint.style.setProperty('--zzicon-frame','0');r.phase='rest';
}
function move(r,to,kind){
 const from=parseFloat(getComputedStyle(r.paint).getPropertyValue('--zzicon-frame'))||0;
 stop(r);r.phase=kind;
 if(still(r)){finish(r);return;}
 if(from===to){if(kind==='fire')finish(r);else r.paint.style.setProperty('--zzicon-frame',String(to));return;}
 const ratio=Math.max(.1,parseFloat(S.getStringPref('zzicon.speed','0.45'))/.45||1);
 let frames=[{'--zzicon-frame':from},{'--zzicon-frame':to}],duration;
 if(kind==='fire'&&from<index.wind&&to>=index.wind){
  const lead=180*(index.wind-from)/index.wind;duration=lead+index.fireMs*(to-index.wind)/(index.frames-1-index.wind);
  frames=[frames[0],{'--zzicon-frame':index.wind,offset:lead/duration},frames[1]];
 }else duration=kind==='fire'?index.fireMs*Math.abs(to-from)/(index.frames-1-index.wind):180*Math.abs(to-from)/index.wind;
 const animation=r.paint.animate(frames,{duration:Math.max(1,duration*ratio),easing:'linear',fill:'forwards'});r.animation=animation;
 animation.finished.then(()=>{
  if(r.animation!==animation||retired)return;
  if(kind==='fire')finish(r);
  else{r.paint.style.setProperty('--zzicon-frame',String(to));stop(r);r.phase=to?'wind':'rest';}
 },()=>{});
}
function hover(r,on){
 r.hover=on;if(!on)r.consumed=false;if(r.phase==='fire')return;
 move(r,(on||r.focus)&&!r.consumed&&!r.host.disabled&&r.host.getAttribute('disabled')!=='true'?index.wind:0,'wind');
}
function fire(r){
 r.consumed=true;
 if(r.model){queue();return;}
 const frame=parseFloat(getComputedStyle(r.paint).getPropertyValue('--zzicon-frame'))||0;
 // ponytail: at most one additional visual cycle during a repeated action;
 // expand only if one visible cycle per command is required. Commands never queue.
 const end=(Math.floor(frame/index.frames)+(r.phase==='fire'?2:1))*index.frames-1;
 move(r,end,'fire');
}
function updateState(r){
 if(!r.model)return;
 const model=snapshot(r.binding,r.host,r.definition),next=stateKey(model);r.model=model;
 if(next===r.state)return;
 const previous=r.state;r.state=next;
 const pair=r.rows[r.row];
 if(pair[0]!==next&&pair[1]!==next){stop(r);setRow(r,rowFor(r,previous,next));r.paint.style.setProperty('--zzicon-frame','0');}
 move(r,r.rows[r.row][0]===next?0:index.frames-1,'fire');
}
function remove(r){
 stop(r);records.delete(r.host);r.paint.removeAttribute('zzicon-motion');r.host.removeAttribute('zzicon-motion-host');
 for(const [key,value,priority]of r.saved)if(value)r.paint.style.setProperty(key,value,priority);else r.paint.style.removeProperty(key);
 if(r.addedClass)r.host.classList.remove(r.addedClass);
}
async function attach(binding,el){
 const host=el.matches(ownerSelector)?el:el.closest(ownerSelector)||el;
 if(!enabled(binding,host)||records.has(host)||pendingHosts.has(host))return;
 const token={};pendingHosts.set(host,token);
 const glyph=data.actions[binding.action].glyph,url='chrome://sine/content/zz-iconflow/icons/morph/'+glyph+'.svg';
 try{
  if(!images.has(url)){const image=new Image();image.src=url;images.set(url,image.decode());}
  await images.get(url);
  if(retired||pendingHosts.get(host)!==token||!host.isConnected||!enabled(binding,host)||!el.matches(binding.selector))return;
  // Gecko's menu icon is now an HTML img, created lazily by the native
  // menu renderer. Use that slot; adding a second pseudo icon hides CMI's
  // background and leaves an empty native gutter beside the replacement.
  const menuItem=host.localName==='menuitem'||host.localName==='menu';
  if(menuItem)host.render?.();
  let slot=el===host?host.querySelector('.toolbarbutton-icon,.menu-icon,.menu-iconic-icon,image')||host:el,addedClass=false;
  const menuClass=host.localName==='menu'?'menu-iconic':'menuitem-iconic';
  if(menuItem)addedClass=!host.classList.contains(menuClass);
  let mode='image',paint=slot;
  if(host.matches('.zzmf-pip-controls button')){mode='background';paint=host;}
  else if(slot.matches('.zen-library-sprite')||host.matches('.zzgf-close')||slot===host&&!['image','img'].includes(slot.localName)){mode='before';paint=slot===host?host:slot;}
  if(slot.localName==='svg')return;
  const definition=data.glyphs[glyph],model=snapshot(binding,host,definition),r={host,el,paint,mode,binding,definition,model,rows:index.glyphs[glyph].rows,row:0,state:stateKey(model),phase:'rest',hover:false,focus:false,consumed:false,animation:null,addedClass:addedClass?menuClass:null,
   saved:savedProperties.map(key=>[key,paint.style.getPropertyValue(key),paint.style.getPropertyPriority(key)])};
  paint.style.setProperty('--zzicon-sprite',`url("${url}")`);paint.style.setProperty('--zzicon-columns',index.frames);paint.style.setProperty('--zzicon-rows',r.rows.length);setRow(r,rowFor(r,r.state));paint.style.setProperty('--zzicon-frame','0');
  if(addedClass)host.classList.add(menuClass);
  paint.setAttribute('zzicon-motion',mode);host.setAttribute('zzicon-motion-host','');records.set(host,r);
 }catch(error){console.warn('[Iconflow] native sprite',binding.action,error);}
 finally{if(pendingHosts.get(host)===token)pendingHosts.delete(host);}
}
function discover(root){
 if(!selector||!root.isConnected)return;
 for(const el of [...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)]){
  const binding=bindings.find(b=>el.matches(b.selector));if(binding)attach(binding,el);
 }
}
function flush(){
 queued=false;if(retired||!data)return;
 for(const r of [...records.values()]){
  if(!r.host.isConnected||!enabled(r.binding,r.host)){remove(r);continue;}
  const b=r.el.matches(r.binding.selector)?r.binding:bindings.find(b=>r.el.matches(b.selector));
  if(b?.action===r.binding.action)r.binding=b;else{remove(r);roots.add(r.el);continue;}
  updateState(r);
 }
 const batch=[...roots];roots.clear();
 for(const root of batch)if(!batch.some(other=>other!==root&&other.contains(root)))discover(root);
}
function queue(){if(!queued&&!retired){queued=true;queueMicrotask(flush);}}
function sync(){
 if(!data)return;bindings=data.bindings.filter(b=>enabled(b));selector=bindings.map(b=>b.selector).join(',');
 for(const r of [...records.values()])remove(r);pendingHosts.clear();roots.add(document.documentElement);queue();
}
function recordFor(event){let el=event.target;while(el?.nodeType===1){if(records.has(el))return records.get(el);el=el.parentElement;}return event.sourceEvent&&event.sourceEvent!==event?recordFor(event.sourceEvent):null;}
listen(window,'pointerover',e=>{const r=recordFor(e);if(r&&!r.host.contains(e.relatedTarget)&&e.pointerType!=='touch')hover(r,true);});
listen(window,'pointerout',e=>{const r=recordFor(e);if(r&&!r.host.contains(e.relatedTarget))hover(r,false);});
for(const [type,on]of [['DOMMenuItemActive',true],['DOMMenuItemInactive',false]])listen(window,type,e=>{const r=recordFor(e);if(r)hover(r,on);});
listen(window,'focusin',e=>{const r=recordFor(e);if(r){r.focus=r.host.matches(':focus-visible');hover(r,r.hover);}});
listen(window,'focusout',e=>{const r=recordFor(e);if(r){r.focus=false;hover(r,r.hover);}});
function activated(e){
 const direct=recordFor(e),targets=direct?[direct]:e.type==='command'&&e.target.localName==='command'?[...records.values()].filter(r=>r.host.getAttribute('command')===e.target.id):[];
 for(const r of targets){if(r.host.disabled||r.host.getAttribute('disabled')==='true')continue;
  // XUL buttons/menus emit command as well as click; URL-bar boxes use click.
  if(e.type==='click'&&(e.button!==0||(r.host.namespaceURI===namespace&&r.host.matches('toolbarbutton,button,menuitem,menu'))))continue;fire(r);
 }
}
listen(window,'command',activated,{capture:true});listen(window,'click',activated,{capture:true});
for(const type of ['popupshown','popuphidden','fullscreen','TabSelect','TabAttrModified','ZenWorkspaceChanged'])listen(window,type,queue);
listen(window,'aftercustomization',sync);listen(reduced,'change',sync);listen(forced,'change',sync);
listen(document,'visibilitychange',()=>{if(document.hidden)for(const r of records.values())finish(r);});
const watch=new MutationObserver(changes=>{
 for(const c of changes){
  if(c.type==='childList'){for(const n of c.addedNodes)if(n.nodeType===1)roots.add(n);}
  else if(['id','data-zz-action','data-l10n-id','class','zzmf-toggle','downloading','show-in-folder'].includes(c.attributeName))roots.add(c.target);
 }queue();
});
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
  if(!retired&&host.isConnected&&host.zziconBookmarkRequest===token){host.zziconBookmarked=!!saved;queue();}
 }
}
listen(window,'popupshown',contextBookmarks);
const bookmarkChanged=()=>{contextBookmarks();queue();};
PlacesUtils.observers.addListener(['bookmark-added','bookmark-removed'],bookmarkChanged);
teardown.push(()=>PlacesUtils.observers.removeListener(['bookmark-added','bookmark-removed'],bookmarkChanged));
window.gZenStartup?.promiseInitialized?.then(()=>{
 if(retired)return;
 const {DownloadsCommon}=ChromeUtils.importESModule('moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs');
 const downloads=DownloadsCommon.getData(window),view={onDownloadAdded:queue,onDownloadChanged:queue,onDownloadRemoved:queue};
 downloads.addView(view);teardown.push(()=>downloads.removeView(view));
}).catch(error=>console.warn('[Iconflow] download state',error));
const prefs={observe:sync};S.addObserver('zzicon.',prefs);
const instance={retire(){
 if(retired)return;retired=true;abort.abort();watch.disconnect();for(const undo of teardown)undo();
 for(const host of document.querySelectorAll('#context_bookmarkTab,#context-bookmarklink,#context-bookmarkpage')){delete host.zziconBookmarked;delete host.zziconBookmarkRequest;}
 S.removeObserver('zzicon.',prefs);for(const r of [...records.values()])remove(r);pendingHosts.clear();roots.clear();images.clear();
 if(window[KEY]===instance)delete window[KEY];
},get records(){return records;},refresh:sync};window[KEY]=instance;
listen(window,'unload',()=>instance.retire());window.addUnloadListener?.(()=>instance.retire());
Promise.all(['morph.json','morph-frames.json'].map(name=>fetch('chrome://sine/content/zz-iconflow/'+name).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}))).then(values=>{
 if(retired)return;[data,index]=values;
 watch.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','id','data-zz-action','data-l10n-id','zzmf-toggle','starred','muted','open','hidden','collapsed','checked','disabled','zen-sidebar-expanded','zen-compact-mode','zzmf-paused','zzmf-muted','data-zz-volume','data-zz-video-visible','downloading','show-in-folder']});sync();
}).catch(error=>{console.error('[Iconflow] native frames',error);instance.retire();});
})();
