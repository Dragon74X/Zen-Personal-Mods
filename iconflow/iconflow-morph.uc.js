// ==UserScript==
// @name Iconflow native Morph frames
// @description Approved windup and release in native image slots; browser-managed frames.
// @include chrome://browser/content/browser.xhtml
// ==/UserScript==
(() => {
'use strict';
const KEY='__zziconMorphInstance';window[KEY]?.retire();
const S=Services.prefs,abort=new AbortController(),records=new Map(),pendingHosts=new Map(),images=new Map(),roots=new Set(),dirty=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
const downloadTargets=new WeakMap(),downloadStopped=new WeakMap();
let data,index,cfg,bindings=[],keyed,unkeyed,keyAttrs,selector='',queued=false,pruning=false,retired=false,contextDownload;
const int=(key,fallback=0)=>S.getIntPref('zzicon.'+key,fallback);
// Preferences are read once per sync(): allowed() filters the bindings there;
// placed() keeps menu and panel owners native unless menu animation is on.
const allowed=b=>b.setting==='library'?int('library.style',11)===11:!b.setting||int('button.'+b.setting)===0;
const placed=host=>cfg.menus||!host.closest('menupopup,panelview,menu,menuitem');
const listen=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal:abort.signal});
const namespace='http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const ownerSelector='toolbarbutton, button, menuitem, menu, .tab-close-button, .tab-reset-button, .urlbar-page-action, .identity-box-button';
const savedProperties=['--zzicon-frame','--zzicon-sprite','--zzicon-columns','--zzicon-rows','--zzicon-row-position'];
// A stateful record's state, read from its owner. r.control is the glyph's
// control id; stateless records have none and stay at rest.
function snapshot(r) {
 const {binding,host}=r;let state;
 switch(r.control){
 case 'bookmark-toggle': {
  if(binding.state==='bookmark-launcher'){state='unsaved';break;}
  // Native context refresh marks the actual target. Link/add commands remain add commands.
  if(host.id==='star-button-box')state=host.querySelector('#star-button')?.hasAttribute('starred')?'saved':'unsaved';
  else state=host.hasAttribute('starred')||host.zziconBookmarked===true?'saved':'unsaved';
  break;
 }
 case 'download-playback': {
  const popup=host.closest('menupopup');
  const row=popup?.triggerNode?.closest('.download, .download-state, .zen-library-download-list-download')||(popup?.id==='downloadsContextMenu'?document.getElementById('downloadsListBox')?.selectedItem:null);
  const download=downloadTargets.get(popup)||popup?.zziconDownload||row?.download||row?._shell?.download||row?._download;
  state=download?(!download.stopped?'downloading':'paused'):host.getAttribute('data-l10n-id')==='downloads-cmd-resume'?'paused':'downloading';break;
 }
 case 'menu-state':state=host.getAttribute('open')==='true'||document.getElementById('appMenu-popup')?.state==='open'?'open':'closed';break;
 case 'compact-mode':state=document.documentElement.getAttribute('zen-compact-mode')==='true'?'compact':'expanded';break;
 case 'sidebar-state':state=(host.id==='zen-expand-sidebar-button'?document.documentElement.getAttribute('zen-sidebar-expanded')==='true':!!window.SidebarController?.isOpen)?'open':'closed';break;
 case 'fullscreen-state':state=window.fullScreen?'fullscreen':'windowed';break;
 }
 return state;
}


function rowFor(r,from,to){return r.rows.findIndex(row=>row[0]===from&&(to===undefined||row[1]===to));}
function setRow(r,row){r.row=Math.max(0,row);r.paint.style.setProperty('--zzicon-row-position',(r.rows.length>1?r.row*100/(r.rows.length-1):0)+'%');}
function stop(r){const a=r.animation;r.animation=null;a?.cancel();}
function finish(r){
 stop(r);setRow(r,rowFor(r,r.state));r.paint.style.setProperty('--zzicon-frame','0');r.phase='rest';
}
function move(r,to,kind){
 const from=parseFloat(getComputedStyle(r.paint).getPropertyValue('--zzicon-frame'))||0;
 stop(r);r.phase=kind;
 if(cfg.still){finish(r);return;}
 if(from===to){if(kind==='fire')finish(r);else r.paint.style.setProperty('--zzicon-frame',String(to));return;}
 let frames=[{'--zzicon-frame':from},{'--zzicon-frame':to}],duration;
 if(kind==='fire'&&from<index.wind&&to>=index.wind){
  const lead=180*(index.wind-from)/index.wind;duration=lead+index.fireMs*(to-index.wind)/(index.frames-1-index.wind);
  frames=[frames[0],{'--zzicon-frame':index.wind,offset:lead/duration},frames[1]];
 }else duration=kind==='fire'?index.fireMs*Math.abs(to-from)/(index.frames-1-index.wind):180*Math.abs(to-from)/index.wind;
 // The inline frame is set to the run's last frame before the run starts, so
 // the run needs no fill and finish() after an action run always changes the
 // inline value. A paint without a box (Zen's hidden template #tabs-newtab-button)
 // restyles only on that change, not on animation ticks or cancel().
 r.paint.style.setProperty('--zzicon-frame',String(to));
 const animation=r.paint.animate(frames,{duration:Math.max(1,duration*cfg.ratio),easing:'linear'});r.animation=animation;
 animation.finished.then(()=>{
  if(r.animation!==animation||retired)return;
  if(kind==='fire')finish(r);
  else{r.animation=null;r.phase=to?'wind':'rest';}
 },()=>{});
}
function hover(r,on){
 r.hover=on;if(!on)r.consumed=false;if(r.phase==='fire')return;
 move(r,(on||r.focus)&&!r.consumed&&!r.host.disabled&&r.host.getAttribute('disabled')!=='true'?index.wind:0,'wind');
}
function fire(r){
 r.consumed=true;
 if(r.control){mark(r);return;}
 const frame=parseFloat(getComputedStyle(r.paint).getPropertyValue('--zzicon-frame'))||0;
 // ponytail: at most one additional visual cycle during a repeated action;
 // expand only if one visible cycle per command is required. Commands never queue.
 const end=(Math.floor(frame/index.frames)+(r.phase==='fire'?2:1))*index.frames-1;
 move(r,end,'fire');
}
function updateState(r){
 const next=snapshot(r);
 if(next===r.state)return;
 const previous=r.state;r.state=next;
 const pair=r.rows[r.row];
 if(pair[0]!==next&&pair[1]!==next){stop(r);setRow(r,rowFor(r,previous,next));r.paint.style.setProperty('--zzicon-frame','0');}
 move(r,r.rows[r.row][0]===next?0:index.frames-1,'fire');
}
function remove(r){
 stop(r);records.delete(r.host);dirty.delete(r);r.paint.removeAttribute('zzicon-motion');r.host.removeAttribute('zzicon-motion-host');
 for(const [key,value,priority]of r.saved)if(value)r.paint.style.setProperty(key,value,priority);else r.paint.style.removeProperty(key);
 if(r.addedClass)r.host.classList.remove(r.addedClass);
}
async function attach(binding,el){
 const host=el.matches(ownerSelector)?el:el.closest(ownerSelector)||el;
 if(!placed(host)||records.has(host)||pendingHosts.has(host))return;
 const token={};pendingHosts.set(host,token);
 const glyph=data.actions[binding.action].glyph,url='chrome://sine/content/zz-iconflow/icons/morph/'+glyph+'.svg';
 try{
  // A failed decode is dropped, so the next attach tries again.
  if(!images.has(url)){const image=new Image();image.src=url;images.set(url,image.decode().catch(error=>{images.delete(url);throw error;}));}
  await images.get(url);
  if(retired||pendingHosts.get(host)!==token||!host.isConnected||!placed(host)||!el.matches(binding.selector))return;
  // Gecko's menu icon is an HTML img (.menu-icon), created lazily by the native
  // menu renderer. Use that slot; adding a second pseudo icon hides CMI's
  // background and leaves an empty native gutter beside the replacement.
  const menuItem=host.localName==='menuitem'||host.localName==='menu';
  if(menuItem)host.render?.();
  const paint=el===host?host.querySelector('.toolbarbutton-icon,.menu-icon,image')||host:el;let addedClass=false;
  const menuClass=host.localName==='menu'?'menu-iconic':'menuitem-iconic';
  if(menuItem)addedClass=!host.classList.contains(menuClass);
  // Tab close and reset buttons are boxes: their padded content box is the
  // icon slot; their native line pseudo-elements are not sprite slots.
  const mode=paint.matches('.zen-library-sprite')||host.matches('.zzgf-close')||paint===host&&!paint.matches('image,img,.tab-close-button:not(.zzgf-close),.tab-reset-button')?'before':'image';
  if(paint.localName==='svg')return;
  const r={host,el,paint,mode,binding,control:data.glyphs[glyph].controlId,rows:index.glyphs[glyph].rows,row:0,phase:'rest',hover:false,focus:false,consumed:false,animation:null,addedClass:addedClass?menuClass:null,
   saved:savedProperties.map(key=>[key,paint.style.getPropertyValue(key),paint.style.getPropertyPriority(key)])};
  r.state=r.control?snapshot(r):'rest';
  paint.style.setProperty('--zzicon-sprite',`url("${url}")`);paint.style.setProperty('--zzicon-columns',index.frames);paint.style.setProperty('--zzicon-rows',r.rows.length);setRow(r,rowFor(r,r.state));paint.style.setProperty('--zzicon-frame','0');
  if(addedClass)host.classList.add(menuClass);
  paint.setAttribute('zzicon-motion',mode);host.setAttribute('zzicon-motion-host','');records.set(host,r);
  // Decode/refresh can finish after pointer entry or keyboard focus. No new
  // entry event will arrive while the pointer/focus stays on this button.
  const hovered=host.matches(':hover');r.focus=host.matches(':focus-visible');
  if(hovered||r.focus)hover(r,hovered);
 }catch(error){console.warn('[Iconflow] native sprite',binding.action,error);}
 finally{if(pendingHosts.get(host)===token)pendingHosts.delete(host);}
}
// A selector's leading #id or [attribute="value"] is on the element it binds or
// an ancestor (selectors use no comma or sibling combinator), so an element is
// tried only against the bindings keyed on its ancestry and the unkeyed ones.
function indexBindings(){
 keyed=new Map();unkeyed=[];keyAttrs=new Set();
 bindings.forEach((b,i)=>{
  const [,id,name,value]=/^(?:#([\w-]+)|\[([\w-]+)="([^"\\]*)"\])(?=[\s.#[:>]|$)/.exec(b.selector)||[];
  const key=id?'#'+id:name?(keyAttrs.add(name),name+'='+value):null;
  if(key)(keyed.get(key)||keyed.set(key,[]).get(key)).push(i);else unkeyed.push(i);
 });
}
// The lowest-index match, as bindings.find() would return.
function bindingFor(el){
 let best=Infinity;
 const scan=list=>{if(list)for(const i of list){if(i>=best)return;if(el.matches(bindings[i].selector)){best=i;return;}}};
 scan(unkeyed);
 for(let a=el;a;a=a.parentElement){
  if(a.id)scan(keyed.get('#'+a.id));
  for(const name of keyAttrs){const value=a.getAttribute(name);if(value!==null)scan(keyed.get(name+'='+value));}
 }
 return bindings[best];
}
function discover(root){
 if(!selector||!root.isConnected)return;
 for(const el of [...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)]){
  const binding=bindingFor(el);if(binding)attach(binding,el);
 }
}
const under=(node,set)=>{for(;node;node=node.parentNode)if(set.has(node))return true;return false;};
const mark=r=>{dirty.add(r);queue();};
const markControl=id=>{for(const r of records.values())if(r.control===id)mark(r);};
function flush(){
 queued=false;if(retired||!data)return;
 // Only a removal disconnects a host.
 if(pruning){pruning=false;for(const r of [...records.values()])if(!r.host.isConnected)remove(r);}
 if(roots.size){
  const changed=new Set(roots);roots.clear();
  // Under a changed subtree a record keeps its action and placement or is
  // released; discovering the subtree attaches its new binding.
  for(const r of [...records.values()]){
   if(!under(r.el,changed))continue;
   const b=r.el.matches(r.binding.selector)?r.binding:bindingFor(r.el);
   if(b?.action===r.binding.action&&placed(r.host))r.binding=b;else remove(r);
  }
  for(const root of changed)if(!under(root.parentNode,changed))discover(root);
 }
 for(const r of dirty)updateState(r);dirty.clear();
}
function queue(){if(!queued&&!retired){queued=true;queueMicrotask(flush);}}
function sync(){
 if(!data)return;
 cfg={menus:S.getBoolPref('zzicon.menu.animate',false),still:reduced.matches||forced.matches||!S.getBoolPref('zzicon.animate',true),
  ratio:Math.max(.1,parseFloat(S.getStringPref('zzicon.speed','0.45'))/.45||1)};
 bindings=!forced.matches&&int('set',4)===4?data.bindings.filter(allowed):[];indexBindings();selector=bindings.map(b=>b.selector).join(',');
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
// The app menu's state, and stateful commands in a popup, follow it opening and closing.
function popupChanged(event){
 const popup=event.target;if(popup.id==='appMenu-popup')markControl('menu-state');
 for(const r of records.values())if(r.control&&popup.contains(r.host))mark(r);
}
listen(window,'popupshown',popupChanged);listen(window,'popuphidden',popupChanged);
listen(window,'fullscreen',()=>markControl('fullscreen-state'));
listen(window,'aftercustomization',sync);listen(reduced,'change',sync);listen(forced,'change',sync);
listen(document,'visibilitychange',()=>{if(document.hidden)for(const r of records.values())finish(r);});
// Binding attributes re-bind their subtree; each state attribute marks the
// records that read it.
const structural=['id','class','data-zz-action','data-l10n-id','downloading','show-in-folder'];
const watch=new MutationObserver(changes=>{
 for(const c of changes){
  const target=c.target,name=c.attributeName;
  if(c.type==='childList'){if(c.removedNodes.length)pruning=true;for(const n of c.addedNodes)if(n.nodeType===1)roots.add(n);}
  else if(structural.includes(name))roots.add(target);
  else if(name==='starred')markControl('bookmark-toggle');
  else if(name==='open'){const r=records.get(target);if(r?.control)mark(r);}
  else if(name==='hidden'){if(target.id==='sidebar-box')markControl('sidebar-state');}
  else if(target===document.documentElement)markControl(name==='zen-compact-mode'?'compact-mode':'sidebar-state');
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
  if(!retired&&host.isConnected&&host.zziconBookmarkRequest===token){host.zziconBookmarked=!!saved;const r=records.get(host);if(r)mark(r);}
 }
}
listen(window,'popupshown',contextBookmarks);
// The star's own starred attribute reaches the observer above.
PlacesUtils.observers.addListener(['bookmark-added','bookmark-removed'],contextBookmarks);
teardown.push(()=>PlacesUtils.observers.removeListener(['bookmark-added','bookmark-removed'],contextBookmarks));
window.gZenStartup?.promiseInitialized?.then(()=>{
 if(retired)return;
 const {DownloadsCommon}=ChromeUtils.importESModule('moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs');
 // Pause/resume reads only a download's stopped flag: mark on its flips, not per progress tick.
 const downloads=DownloadsCommon.getData(window),view={onDownloadChanged(download){
  if(downloadStopped.get(download)!==download.stopped){downloadStopped.set(download,download.stopped);markControl('download-playback');}
 }};
 downloads.addView(view);teardown.push(()=>downloads.removeView(view));
}).catch(error=>console.warn('[Iconflow] download state',error));
// Only these preferences change which bindings apply or how they move.
const prefs={observe(_subject,_topic,name){if(/^zzicon\.(?:set|library\.style|menu\.animate|animate|speed|button\..+)$/.test(name))sync();}};S.addObserver('zzicon.',prefs);
const instance={retire(){
 if(retired)return;retired=true;abort.abort();watch.disconnect();for(const undo of teardown)undo();
 for(const host of document.querySelectorAll('#context_bookmarkTab,#context-bookmarklink,#context-bookmarkpage')){delete host.zziconBookmarked;delete host.zziconBookmarkRequest;}
 S.removeObserver('zzicon.',prefs);for(const r of [...records.values()])remove(r);pendingHosts.clear();roots.clear();images.clear();
 if(window[KEY]===instance)delete window[KEY];
},get records(){return records;},refresh:sync};window[KEY]=instance;
listen(window,'unload',()=>instance.retire());window.addUnloadListener?.(()=>instance.retire());
Promise.all(['morph.json','morph-frames.json'].map(name=>fetch('chrome://sine/content/zz-iconflow/'+name).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}))).then(values=>{
 if(retired)return;[data,index]=values;
 watch.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:[...structural,'starred','open','hidden','zen-sidebar-expanded','zen-compact-mode']});sync();
}).catch(error=>{console.error('[Iconflow] native frames',error);instance.retire();});
})();
