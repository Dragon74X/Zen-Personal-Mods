// Loaded only by zen-morph-smoke.py in disposable native chrome, never shipped.
return (async()=>{
 const report={checks:[]},verify=(name,pass)=>{report.checks.push({name,pass:!!pass});if(!window.morphMeasureOnly)checkMorph(name,pass);};
 const wait=waitMorph,toolbox=document.getElementById('navigator-toolbox'),originalTab=gBrowser.selectedTab;
 const tabs=[],restore=[],originalStyle=toolbox.getAttribute('style');
 let watched=null;
 const edgePrefs=['zzglass.edges.enabled','zzglass.sidebar.enabled','zzglass.sidebar.rim','zzglass.motion.enabled'];
 const previous=edgePrefs.map(key=>[key,Services.prefs.getBoolPref(key)]);
 const aligned=r=>{
  const q=r.slot.getBoxQuads({box:'content'})[0],b=r.svg.getBoundingClientRect();
  return q&&Math.abs((q.p1.x+q.p3.x)/2-(b.left+b.width/2))<.7&&Math.abs((q.p1.y+q.p3.y)/2-(b.top+b.height/2))<.7&&Math.abs(Math.hypot(q.p2.x-q.p1.x,q.p2.y-q.p1.y)-b.width)<.7;
 };
 try{
  for(const key of edgePrefs)Services.prefs.setBoolPref(key,true);
  for(let i=0;i<36;i++)tabs.push(gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true}));
  gBrowser.selectedTab=tabs.at(-1);await wait(500);
  const menu=rec('#PanelUI-menu-button');
  verify('badge stack glyph aligns with native content box',aligned(menu));
  toolbox.style.transform='translate(17px,31px) scale(.8)';await wait(100);
  verify('glyph stays aligned under translated scaled sidebar',aligned(menu));
  const margin=menu.slot.style.marginInlineStart;menu.slot.style.marginInlineStart='23px';await wait(80);
  verify('glyph follows position-only native slot movement',aligned(menu));menu.slot.style.marginInlineStart=margin;
  toolbox.setAttribute('style',originalStyle||'');await wait(180);
  const tab=gBrowser.selectedTab,close=__zziconMorphInstance.records.get(tab.querySelector('.tab-close-button'));
  InspectorUtils.addPseudoClassLock(tab,':hover');await wait(250);
  verify('native hover reveals aligned close icon',aligned(close)&&Number(getComputedStyle(close.svg).opacity)>.9);
  InspectorUtils.removePseudoClassLock(tab,':hover');await wait(300);
  verify('native hidden close icon stays hidden',Number(getComputedStyle(close.slot).opacity)===0&&Number(getComputedStyle(close.svg).opacity)===0);
  const popup=document.createXULElement('menupopup');popup.id='morph-regression-popup';document.getElementById('mainPopupSet').append(popup);
  const item=document.createXULElement('menuitem');item.setAttribute('label','Stable action');item.setAttribute('data-zz-action','groupflow--edit-gradient');popup.append(item);await wait(100);
  verify('dynamic source-owned action attaches once',!!__zziconMorphInstance.records.get(item)&&item.querySelectorAll('.zzicon-morph-glyph').length===1);
  const pause=document.createXULElement('menuitem');pause.setAttribute('data-l10n-id','downloads-cmd-pause');popup.append(pause);await wait(80);
  const pauseRecord=__zziconMorphInstance.records.get(pause),pausePath=pauseRecord.parts[0].paths?.[0]||pauseRecord.parts[0].nodes[0].querySelector('path');
  pause.setAttribute('data-l10n-id','downloads-cmd-resume');await wait(80);
  verify('pause resume selector changes retain paths and instance',__zziconMorphInstance.records.get(pause)===pauseRecord&&pausePath===(pauseRecord.parts[0].paths?.[0]||pauseRecord.parts[0].nodes[0].querySelector('path'))&&pauseRecord.model.state==='paused');
  popup.remove();await wait(80);verify('dynamic removal releases instance',!__zziconMorphInstance.records.has(item));
  const asset=await (await fetch('chrome://sine/content/zz-iconflow/morph.json')).json(),selectors=new Set(asset.bindings.map(b=>b.selector));
  const counts={documentQueries:0,slotGeometryReads:0,glyphWrites:0},query=document.querySelectorAll;
  document.querySelectorAll=function(s){if(selectors.has(s)||s.includes('#back-button .toolbarbutton-icon'))counts.documentQueries++;return query.call(this,s);};restore.push(()=>{document.querySelectorAll=query;});
  for(const r of __zziconMorphInstance.records.values())for(const method of ['getBoundingClientRect','getClientRects']){
   const own=Object.hasOwn(r.slot,method),original=r.slot[method];
   r.slot[method]=function(...args){counts.slotGeometryReads++;return original.apply(this,args);};
   restore.push(()=>{if(own)r.slot[method]=original;else delete r.slot[method];});
  }
  watched=new MutationObserver(changes=>{counts.glyphWrites+=changes.filter(c=>c.target.closest?.('.zzicon-morph-glyph')).length;});
  watched.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['transform','d','fill-opacity']});
  await wait(1200);counts.documentQueries=counts.slotGeometryReads=counts.glyphWrites=0;
  const label=tab.querySelector('.tab-label'),box=tab.querySelector('.tab-background').getBoundingClientRect();
  for(let i=0;i<20;i++){
   tab.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:box.right-3-i%4,clientY:box.top+4,pointerType:'mouse'}));
   for(let j=0;j<10;j++)tab.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'box-shadow'}));
   label.classList.toggle('morph-unrelated-style');await wait(17);
  }
  await wait(80);report.workload={tabs:tabs.length,frames:20,paintTransitionEvents:200,...counts};
  verify('hover paint workload performs no full document icon scans',counts.documentQueries===0);
  verify('hover paint workload avoids per-icon geometry reads',counts.slotGeometryReads<100);
  verify('hidden settled glyphs are not repainted by unrelated classes',counts.glyphWrites===0);
  watched.disconnect();watched=null;for(const undo of restore.splice(0))undo();
  const child=tab.querySelector('.tab-label');
  verify('workload exercises live tab and sidebar edges',!!tab.style.getPropertyValue('--zzg-follow-angle')&&!!toolbox.style.getPropertyValue('--zzg-follow-angle'));
  verify('pointer input stays local to its edge owner',getComputedStyle(child).getPropertyValue('--zzg-follow-angle').trim()==='');
  await wait(1200);verify('stationary hover stops edge frames',!__zzglassEdgesInstance.scheduled);
  toolbox.style.transition='translate .15s linear';toolbox.style.translate='10px 0px';await wait(700);
  verify('geometry transition settles without idle polling',!__zzglassEdgesInstance.scheduled);
  toolbox.style.translate='20px 0px';await wait(30);window.dispatchEvent(new Event('blur'));await wait(500);
  const moved=tab.querySelector('.tab-background').getBoundingClientRect();tab.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:moved.right-3,clientY:moved.top+3,pointerType:'mouse'}));await wait(1200);
  verify('exit during geometry motion leaves no stale layout scheduler on reentry',!__zzglassEdgesInstance.scheduled);
  window.dispatchEvent(new Event('blur'));await wait(1100);
  verify('hover exit clears local edge inputs',__zzglassEdgesInstance.owners===0&&!__zzglassEdgesInstance.scheduled);
  const group=gBrowser.addTabGroup(tabs.slice(0,2),{label:'Morph rim ownership',insertBefore:tabs[0]});await wait(180);
  const header=group.querySelector('.tab-group-label-container'),rim=header.querySelector('.zzgf-rim'),rail=group.querySelector('.tab-group-container');
  header.style.setProperty('--zzg-follow-gradient','217deg');header.style.setProperty('--zzg-follow-angle','127deg');
  verify('group child rim inherits only its parent light inputs',rim&&getComputedStyle(rim).getPropertyValue('--zzg-follow-gradient').trim()==='217deg'&&getComputedStyle(rim).getPropertyValue('--zzg-follow-angle').trim()==='127deg');
  rail.style.setProperty('--zzg-follow-gradient','145deg');verify('rail pseudo retains local gradient input',getComputedStyle(rail,'::before').getPropertyValue('--zzg-follow-gradient').trim()==='145deg');
  report.instances=__zziconMorphInstance.records.size;
 }finally{
  watched?.disconnect();for(const undo of restore)undo();
  for(const [key,value] of previous)Services.prefs.setBoolPref(key,value);
  toolbox.setAttribute('style',originalStyle||'');
  for(const tab of tabs){InspectorUtils.removePseudoClassLock(tab,':hover');if(tab.isConnected)gBrowser.removeTab(tab,{animate:false,skipSessionStore:true});}
  gBrowser.selectedTab=originalTab;await wait(300);
 }
 return report;
})();
