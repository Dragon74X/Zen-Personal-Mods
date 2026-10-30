// Executed in disposable Zen chrome by zen-morph-smoke.py.
return (async()=>{
 window.nativeChecks=[];window.nativeWait=ms=>new Promise(r=>setTimeout(r,ms));
 window.nativeCheck=(name,ok)=>{if(!ok)throw new Error(name);nativeChecks.push(name);};
 window.nativeRecord=s=>__zziconMorphInstance.records.get(document.querySelector(s));
 const wait=nativeWait,check=nativeCheck,rec=nativeRecord;
 const frame=r=>+getComputedStyle(r.paint).getPropertyValue('--zzicon-frame');
 const event=(r,type)=>r.host.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse'}));
 check('native renderer attached',__zziconMorphInstance.records.size>20);
 // Zen's Library replaces this widget in this profile. Exercise the native
 // Downloads markup (an indicator image, not .toolbarbutton-icon) as a fixture.
 const downloadFixture=document.createXULElement('toolbarbutton');downloadFixture.id='downloads-button';
 const anchor=document.createXULElement('box');anchor.id='downloads-indicator-anchor';
 const downloadImage=document.createXULElement('image');downloadImage.id='downloads-indicator-icon';anchor.append(downloadImage);downloadFixture.append(anchor);
 document.getElementById('nav-bar-customization-target').append(downloadFixture);await wait(300);
 check('Downloads binds its native indicator slot',rec('#downloads-button')?.paint===downloadImage);
 let downloadCommands=0;downloadFixture.addEventListener('command',()=>downloadCommands++);
 event(rec('#downloads-button'),'pointerover');await wait(250);check('Downloads winds up',frame(rec('#downloads-button'))===31);
 downloadFixture.doCommand();await wait(40);check('Downloads command fires once',downloadCommands===1&&rec('#downloads-button').phase==='fire');
 const downloadRecord=rec('#downloads-button');downloadFixture.remove();await wait(50);
 check('removed Downloads releases its animation',!rec('#downloads-button')&&!downloadRecord.animation);
 check('no replacement SVG or transparent mask',!document.querySelector('.zzicon-morph-glyph,[data-zz-morph-slot]'));
 check('SVG context policy unchanged',!Services.prefs.getBoolPref('svg.context-properties.content.enabled'));
 await PanelUI.show();await wait(200);
 const menuSelector='menupopup,panelview,menu,menuitem';
 const menuRecords=()=>[...__zziconMorphInstance.records.values()].filter(r=>r.host.closest(menuSelector));
 check('menu off default leaves zero Morph owners',!Services.prefs.getBoolPref('zzicon.menu.animate')&&menuRecords().length===0);
 check('context command unchanged while off',!rec('#context_undoCloseTab'));
 check('panel command unchanged while off',!rec('#appMenu-settings-button'));
 Services.prefs.setBoolPref('zzicon.menu.animate',true);
 for(let i=0;i<60&&(!rec('#context_undoCloseTab')||!rec('#appMenu-settings-button'));i++)await wait(50);
 check('menu on attaches context and panel commands',!!rec('#context_undoCloseTab')&&!!rec('#appMenu-settings-button'));
 const menuItem=rec('#appMenu-settings-button');event(menuItem,'pointerover');await wait(40);
 check('menu on starts windup',!!menuItem.animation);
 Services.prefs.setBoolPref('zzicon.menu.animate',false);await wait(150);
 check('menu off cancels motion and removes native paint',!menuItem.animation&&menuRecords().length===0&&!menuItem.paint.hasAttribute('zzicon-motion'));
 // Added commands must obey the same opt-out before creating icon slots.
 const dynamic=document.createXULElement('menuitem');dynamic.setAttribute('data-zz-action','glassflow--mods-report-copy');dynamic.setAttribute('label','Menu opt-out check');document.getElementById('tabContextMenu').append(dynamic);await wait(120);
 check('new context commands respect menu off',!dynamic.hasAttribute('zzicon-motion-host')&&!dynamic.classList.contains('menuitem-iconic')&&!dynamic.querySelector('[zzicon-motion]'));dynamic.remove();PanelUI.hide();await wait(1000);
 Services.prefs.setBoolPref('zen.view.sidebar-expanded',true);document.documentElement.setAttribute('zen-sidebar-expanded','true');document.documentElement.setAttribute('zen-compact-mode','false');
 window.nativeTab=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.selectedTab=nativeTab;
 await wait(500);
 const reload=rec('#reload-button'),menu=rec('#PanelUI-menu-button'),slot=menu.paint,bounds=menu.host.getBoundingClientRect().toJSON();
 check('native image owns icon',slot===menu.host.querySelector('.toolbarbutton-icon'));
 const writes=[];const observe=new MutationObserver(changes=>writes.push(...changes));observe.observe(slot,{attributes:true});
 event(menu,'pointerover');await wait(40);const a=frame(menu);await wait(50);const b=frame(menu);await wait(200);const wind=frame(menu);
 check('hover windup advances integer frames',a>0&&b>a&&wind===31);
 check('host stays anchored during windup',JSON.stringify(bounds)===JSON.stringify(menu.host.getBoundingClientRect().toJSON()));
 check('windup not driven by per-frame DOM writes',writes.length<=4);observe.disconnect();
 event(menu,'pointerout');await wait(50);const reversing=frame(menu);event(menu,'pointerover');const resumed=frame(menu);await wait(250);
 check('hover reversal starts from current frame',reversing>0&&reversing<31&&Math.abs(resumed-reversing)<=1);
 event(menu,'pointerout');await wait(250);check('pointer exit settles at rest',frame(menu)===0&&!menu.animation);
 // Refresh/decode can attach while the pointer or keyboard focus is already
 // present. Reattachment must not wait for a second entry event.
 for(const pseudo of [':hover',':focus-visible']){
  InspectorUtils.addPseudoClassLock(menu.host,pseudo);__zziconMorphInstance.refresh();await wait(300);
  const attached=rec('#PanelUI-menu-button');
  check('reattach reads '+pseudo,frame(attached)===31&&(pseudo===':hover'?attached.hover:attached.focus));
  InspectorUtils.removePseudoClassLock(menu.host,pseudo);__zziconMorphInstance.refresh();await wait(80);
  check('reattach without '+pseudo+' stays at rest',frame(rec('#PanelUI-menu-button'))===0&&!rec('#PanelUI-menu-button').animation);
 }
 const newTab=rec('#tabs-newtab-button')||rec('#new-tab-button'),openTab=BrowserCommands.openTab;let calls=0;
 BrowserCommands.openTab=function(...args){calls++;return openTab.apply(this,args);};
 try{newTab.host.doCommand();await wait(45);newTab.host.doCommand();await wait(180);}finally{BrowserCommands.openTab=openTab;}
 check('native commands execute exactly once per activation',calls===2);check('action uses browser animation',!!newTab.animation);
 await wait(1500);check('repeated action settles',frame(newTab)===0&&!newTab.animation);
 for(const [pref,selector]of [['toolbar','#reload-button'],['plus','#tabs-newtab-button'],['close','.tab-close-button']]){
  Services.prefs.setIntPref('zzicon.motion.'+pref,2);await wait(100);const r=rec(selector);InspectorUtils.addPseudoClassLock(r.host,':hover');await wait(40);
  check('one motion owner with custom '+pref+' animation',getComputedStyle(r.paint).animationName==='none');InspectorUtils.removePseudoClassLock(r.host,':hover');Services.prefs.clearUserPref('zzicon.motion.'+pref);
 }await wait(100);
 const originalSlot=reload.paint;Services.prefs.setIntPref('zzicon.button.reload',1);await wait(120);
 check('per-button choice restores image paint',!originalSlot.hasAttribute('zzicon-motion'));
 Services.prefs.setIntPref('zzicon.button.reload',0);await wait(250);check('per-button choice keeps native node',rec('#reload-button').paint===originalSlot);
 const compact=rec('#zen-toggle-compact-mode toolbarbutton');
 if(compact){const original=gZenCompactModeManager.preference;gZenCompactModeManager.preference=!original;await wait(500);check('compact reads native owner',compact.model.state===(!original?'compact':'expanded'));gZenCompactModeManager.preference=original;await wait(500);}
 await PanelUI.show();await wait(300);check('menu reads native open state',rec('#PanelUI-menu-button').state==='open');PanelUI.hide();await wait(800);check('menu returns to closed state',rec('#PanelUI-menu-button').state==='closed');
 await SidebarController.show('viewBookmarksSidebar');await wait(250);check('Firefox sidebar reads own owner',rec('#sidebar-button').state==='open');SidebarController.hide();await wait(300);
 const {PlacesUtils}=ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
 const url=nativeFixtureURL;gBrowser.selectedBrowser.loadURI(Services.io.newURI(url),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});await wait(900);
 const saved=await PlacesUtils.bookmarks.insert({parentGuid:PlacesUtils.bookmarks.unfiledGuid,url,title:'Icon check'});await wait(400);check('bookmark reads external insert',rec('#star-button-box').state==='saved');await PlacesUtils.bookmarks.remove(saved.guid);await wait(400);check('bookmark reads external removal',rec('#star-button-box').state==='unsaved');
 check('window controls excluded from Morph',![...__zziconMorphInstance.records.keys()].some(e=>e.matches('.titlebar-button'))&&!document.querySelector('.titlebar-button[zzicon-motion-host],.titlebar-button [zzicon-motion]'));
 ZzMediaflowController.updateControls({time:2,duration:20,paused:true,volume:.37,muted:false});await wait(100);
 const mediaButtons=[...document.querySelectorAll('.zzmf-pip-controls button')];
 check('media retains original six controls',mediaButtons.length===6&&mediaButtons.every(b=>!__zziconMorphInstance.records.has(b)&&!b.hasAttribute('zzicon-motion')&&getComputedStyle(b,'::before').content==='none'));
 check('media original paused glyph',getComputedStyle(document.querySelector('.zzmf-pip-play')).backgroundImage.includes('/media-play.svg'));
 ZzMediaflowController.updateControls({time:2,duration:20,paused:false,volume:.37,muted:true});await wait(100);
 check('media original playing glyph',getComputedStyle(document.querySelector('.zzmf-pip-play')).backgroundImage.includes('/media-pause.svg'));
 Services.prefs.setBoolPref('zzicon.animate',false);await wait(150);event(rec('#PanelUI-menu-button'),'pointerover');await wait(50);check('animation off stays at rest',frame(rec('#PanelUI-menu-button'))===0&&!rec('#PanelUI-menu-button').animation);
 Services.prefs.setBoolPref('zzicon.animate',true);Services.prefs.setIntPref('ui.prefersReducedMotion',1);await wait(150);event(rec('#PanelUI-menu-button'),'pointerover');check('reduced motion stays at rest',frame(rec('#PanelUI-menu-button'))===0&&!rec('#PanelUI-menu-button').animation);Services.prefs.setIntPref('ui.prefersReducedMotion',0);await wait(150);
 gBrowser.selectedTab=nativeTab;document.documentElement.setAttribute('zen-compact-mode','false');document.documentElement.setAttribute('zen-sidebar-expanded','true');await wait(500);
 return {checks:nativeChecks,records:__zziconMorphInstance.records.size,windupWrites:writes.length,paintTypes:[...new Set([...__zziconMorphInstance.records.values()].map(r=>r.paint.localName+':'+r.mode))],windupFrames:[a,b,wind],actions:[...new Set([...__zziconMorphInstance.records.values()].map(r=>r.binding.action))].sort()};
})();
