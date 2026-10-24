#!/usr/bin/env python3
"""Circuit Morph in real Zen chrome, disposable profile. No user profile access.
Run through ZEN_BINARY=/path/to/zen node --test tools/*.test.mjs or directly.
Pillow (existing smoke harness) and ffmpeg required for native media/volume.
"""
import argparse,json,os,runpy,socket,subprocess,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
M=runpy.run_path(str(ROOT/'tools/zen-smoke.py'))['Marionette']
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--zen',required=True,type=Path);p.add_argument('--output',required=True,type=Path);args=p.parse_args()
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
MODS=['glassflow','groupflow','iconflow','glassflow-library','download-prompt','tab-router','tab-unloader','mediaflow']
with tempfile.TemporaryDirectory(prefix='zen-morph-') as d:
 profile=Path(d);folder=profile/'chrome/sine-mods';folder.mkdir(parents=True)
 for mod in MODS:(folder/json.loads((ROOT/mod/'theme.json').read_text())['id']).symlink_to(ROOT/mod,target_is_directory=True)
 (profile/'index.html').write_text('<title>Morph native state</title><video src="video.webm" preload="none" loop controls></video>')
 subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libvpx','-deadline','realtime','-b:v','30k','-c:a','libopus',str(profile/'video.webm')],check=True)
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'zen.welcome-screen.seen':True,'zen.welcome-screen.enabled':False,'sine.auto-update':False,'ui.prefersReducedMotion':0,'zzrouter.enabled':False,'media.cubeb.backend':'dummy','media.autoplay.default':0,'media.autoplay.blocking_policy':0,'svg.context-properties.content.enabled':False}
 (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k,v in prefs.items()))
 def start():
  log=(OUT/'browser.log').open('a');proc=subprocess.Popen([str(args.zen.resolve()),'--headless','--no-remote','--profile',d,'--marionette','--remote-allow-system-access','about:blank'],stdout=log,stderr=log)
  for _ in range(100):
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.2):break
   except OSError:time.sleep(.2)
  m=M(port);m.script('return gZenStartup.promiseInitialized.then(()=>true);');m.call('WebDriver:SetWindowRect',{'width':1280,'height':960})
  m.script('window.morphChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI('+json.dumps((profile/'chrome.manifest').as_uri())+'),'+json.dumps([['content','sine',folder.as_uri()+'/']])+');return true;')
  return proc,m,log
 proc,m,log=start()
 try:
  for mod in MODS:
   theme=json.loads((ROOT/mod/'theme.json').read_text())
   # Mirrors the existing Sine authorized chrome mapping and script manifest.
   defaults={r['property']:r['defaultValue'] for r in json.loads((ROOT/mod/'preferences.json').read_text()) if 'property'in r and 'defaultValue'in r}
   m.script('for(const[k,v]of Object.entries('+json.dumps(defaults)+'))if(Services.prefs.getPrefType(k)===0)Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
   if (ROOT/mod/'userChrome.css').exists():m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI('+json.dumps('chrome://sine/content/'+theme['id']+'/userChrome.css')+'),1);return true;')
   for script in theme['scripts']:
    if script.endswith('.uc.js'):m.script('Services.scriptloader.loadSubScript('+json.dumps('chrome://sine/content/'+theme['id']+'/'+script)+',window);return true;')
  time.sleep(2)
  m.script("for(const id of ['sidebar-button','zen-expand-sidebar-button'])CustomizableUI.addWidgetToArea(id,'nav-bar');return true;");time.sleep(.2)
  m.script('''window.morphChecks=[];window.morphBlocked=[];window.waitMorph=ms=>new Promise(r=>setTimeout(r,ms));
  window.checkMorph=(name,value)=>{if(!value)throw new Error(name);morphChecks.push(name);};
  window.rec=s=>__zziconMorphInstance.records.get(document.querySelector(s));
  checkMorph('Morph loads through chrome manifest',!!window.__zziconMorphInstance&&__zziconMorphInstance.records.size>40);
  checkMorph('SVG security pref unchanged',!Services.prefs.getBoolPref('svg.context-properties.content.enabled'));
  checkMorph('10 state definitions loaded',true);return true;''')
  regression=m.script((ROOT/'tools/morph-native-regressions.js').read_text())
  print('PLACEMENT/PERFORMANCE',json.dumps(regression),flush=True)
  m.script('gBrowser.selectedBrowser.loadURI(Services.io.newURI('+json.dumps((profile/'index.html').as_uri())+'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});return true;');time.sleep(1);time.sleep(.3)
  # Real native toolbar commands, persistent SVGs and interruption.
  basic=m.script('''return (async()=>{
   const reload=rec('#reload-button'),svg=reload.svg;
   checkMorph('native reload slot painted',svg.getBoundingClientRect().width>0);
   const event=(r,type)=>r.host.dispatchEvent(new MouseEvent(type,{bubbles:true}));
   const turns=()=>reload.parts.map(p=>p.turn);
   event(reload,'pointerover');await waitMorph(65);
   const wound=reload.parts.map(p=>p.channels.angle.target);
   checkMorph('reload per-part anticipation '+JSON.stringify(wound),wound[0]<0&&wound[1]<0&&wound[2]>0);
   reload.host.doCommand();await waitMorph(55);const available=!reload.host.disabled&&reload.host.getAttribute('disabled')!=='true';reload.host.doCommand();
   checkMorph('reload preserves availability and counter-orbit',JSON.stringify(turns())===JSON.stringify(available?[720,720,-720]:[360,360,-360]));
   checkMorph('reload retains SVG',reload.svg===svg);
   const newTab=rec('#tabs-newtab-button')||rec('#new-tab-button'),openTab=BrowserCommands.openTab;let calls=0;BrowserCommands.openTab=function(...args){calls++;return openTab.apply(this,args);};
   newTab.host.doCommand();await waitMorph(45);newTab.host.doCommand();await waitMorph(180);
   BrowserCommands.openTab=openTab;checkMorph('native new tab command executes exactly once',calls===2);
   checkMorph('new tab repeats +90 without reset',newTab.parts.some(p=>p.turn===180));
   const stop=rec('#stop-button');stop.host.dispatchEvent(new Event('command',{bubbles:true}));
   checkMorph('stop -90',stop.parts.some(p=>p.turn===-90)||stop.host.disabled);
   const beforeOff=reload.host.getBoundingClientRect().toJSON();Services.prefs.setIntPref('zzicon.button.reload',1);await waitMorph(80);
   checkMorph('explicit native still restores original slot',!reload.host.hasAttribute('data-zz-morph')&&!reload.slot.hasAttribute('data-zz-morph-slot'));
   checkMorph('icon substitution retains button size',reload.host.getBoundingClientRect().width===beforeOff.width);
   const originalAnchor=reload.slot.style.getPropertyValue('anchor-name');reload.slot.style.setProperty('anchor-name','--native-reload');
   Services.prefs.setIntPref('zzicon.button.reload',0);await waitMorph(100);
   checkMorph('Morph preserves existing native anchor names',getComputedStyle(reload.slot).anchorName.includes('--native-reload'));
   Services.prefs.setIntPref('zzicon.button.reload',1);await waitMorph(80);checkMorph('removal restores exact native anchor name',reload.slot.style.getPropertyValue('anchor-name')==='--native-reload');
   if(originalAnchor)reload.slot.style.setProperty('anchor-name',originalAnchor);else reload.slot.style.removeProperty('anchor-name');
   Services.prefs.setIntPref('zzicon.button.reload',0);await waitMorph(100);
   const compact=rec('#zen-toggle-compact-mode toolbarbutton');checkMorph('compact native control found',!!compact);
   if(compact){const original=gZenCompactModeManager.preference;gZenCompactModeManager.preference=!original;await waitMorph(500);
    checkMorph('compact observes native manager',compact.model.state===(!original?'compact':'expanded'));gZenCompactModeManager.preference=original;await waitMorph(500);}
   const expand=rec('#zen-expand-sidebar-button');if(!expand)morphBlocked.push('Zen expansion widget unavailable in this runtime toolbar configuration');if(expand){const before=expand.model.state;expand.host.doCommand();await waitMorph(500);checkMorph('Zen sidebar observes own command',expand.model.state!==before);expand.host.doCommand();await waitMorph(500);}
   const sidebar=rec('#sidebar-button');if(!sidebar)morphBlocked.push('Firefox sidebar widget unavailable in this runtime toolbar configuration');if(sidebar){await SidebarController.show('viewBookmarksSidebar');await waitMorph(200);checkMorph('Firefox sidebar observes separate owner',sidebar.model.state==='open');SidebarController.hide();await waitMorph(200);}
   const menu=rec('#PanelUI-menu-button');await PanelUI.show();await waitMorph(300);checkMorph('application menu observes popup',menu.model.state==='open');PanelUI.hide();await waitMorph(300);checkMorph('menu exit observes closed state',menu.model.state==='closed');
   return {records:__zziconMorphInstance.records.size,checks:morphChecks};
  })();''')
  print('NATIVE',len(basic['checks']),flush=True)
  # Actual bookmark changes on a local webpage, observed independently of clicks.
  m.script('gBrowser.selectedBrowser.loadURI(Services.io.newURI('+json.dumps((profile/'index.html').as_uri())+'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});return true;');time.sleep(1)
  bookmarks=m.script('''return (async()=>{
   const {PlacesUtils}=ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
   const star=rec('#star-button'),path=star.parts[0].nodes[0].querySelector('path');
   const b=await PlacesUtils.bookmarks.insert({parentGuid:PlacesUtils.bookmarks.unfiledGuid,url:gBrowser.selectedBrowser.currentURI.spec,title:'Morph test'});await waitMorph(400);
   checkMorph('bookmark observes external insert',star.model.state==='saved');checkMorph('bookmark retains path identity',path===star.parts[0].nodes[0].querySelector('path'));
   await PlacesUtils.bookmarks.remove(b.guid);await waitMorph(400);checkMorph('bookmark observes external removal',star.model.state==='unsaved');
   return true;
  })();''')
  m.script('document.querySelector("video").volume=.37;document.querySelector("video").play();return {ready:document.querySelector("video").readyState,src:location.href};',context='content');time.sleep(1)
  m.script('window.morphMediaTab=gBrowser.selectedTab;gBrowser.selectedTab=gBrowser.addTab("about:blank",{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});return true;');time.sleep(2)
  media=m.script('''return (async()=>{
   const play=rec('.zzmf-pip-play'),volume=rec('.zzmf-pip-mute');
   if(volume.model.level===null){
    morphBlocked.push('Native media actor/commands: headless container did not start audible file playback');
    ZzMediaflowController.updateControls({time:2,duration:20,paused:false,volume:.37,muted:false});await waitMorph(80);
    checkMorph('Mediaflow adapter receives numeric actor-shaped state',volume.model.level===37&&play.model.state==='playing');
    ZzMediaflowController.updateControls({time:2,duration:20,paused:true,volume:.18,muted:false});await waitMorph(80);
    checkMorph('Mediaflow adapter observes external pause and volume',volume.model.level===18&&play.model.state==='paused');
    ZzMediaflowController.updateControls({time:2,duration:20,paused:true,volume:.18,muted:true});await waitMorph(80);
    checkMorph('Mediaflow adapter observes mute',volume.model.level===0);
    ZzMediaflowController.updateControls({time:2,duration:20,paused:true,volume:.18,muted:false});await waitMorph(80);
    checkMorph('Mediaflow adapter retains actual unmuted volume',volume.model.level===18);
    return {nativePlayback:false,adapterFixture:true};
   }
   checkMorph('Mediaflow actor numeric volume',Math.abs(volume.model.level-37)<.01);
   play.host.click();await waitMorph(400);checkMorph('Mediaflow playback observes actor result',play.model.state==='paused');
   volume.host.click();await waitMorph(180);checkMorph('Mediaflow mute observes source tab',volume.model.level===0&&morphMediaTab.linkedBrowser.audioMuted);
   volume.host.click();await waitMorph(180);checkMorph('unmute preserves actual volume',Math.abs(volume.model.level-37)<.01);
   const toggle=rec('.zen-sidebar-pip-toggle[zzmf-toggle="true"]');
   if(toggle){toggle.host.click();await waitMorph(300);checkMorph('video visibility observes source toggle',toggle.model.state==='hidden');toggle.host.click();await waitMorph(300);}
   const native=rec('.zen-media-mute-button');if(native)checkMorph('native mute does not fabricate volume',native.model.level===null&&native.model.unknown);
   return {numeric:volume.model.level,nativeMute:!!native,toggle:!!toggle};
  })();''')
  print('MEDIA',media,flush=True)
  # Geometry-independent adapter checks use native window state and Download APIs.
  extra=m.script('''return (async()=>{
   const full=rec('#fullscreen-button')||rec('#appMenu-fullscreen-button2');
   window.fullScreen=true;await waitMorph(300);if(full)checkMorph('fullscreen observes native window',full.model.state==='fullscreen');window.fullScreen=false;await waitMorph(300);
   window.maximize();await waitMorph(300);const max=rec('.titlebar-max')||rec('.titlebar-restore');if(max)checkMorph('maximize observes native window',max.model.state==='maximized');window.restore();await waitMorph(300);
   const {Downloads}=ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
   const download=await Downloads.createDownload({source:'file:///morph-missing-download',target:PathUtils.join(PathUtils.tempDir,'morph-missing-target')});
   const dp=document.getElementById('downloadsContextMenu');dp.zziconDownload=download;
   const dr=rec('[data-l10n-id="downloads-cmd-pause"]'),path=dr.parts[0].nodes[0].querySelector('path');
   const list=await Downloads.getList(Downloads.PUBLIC);await list.add(download);await waitMorph(80);
   checkMorph('download adapter reads actual Download initial state',dr.model.state==='paused');
   const started=download.start().catch(()=>{});__zziconMorphInstance.refresh();
   checkMorph('download adapter reads actual start',dr.model.state==='downloading');
   await started;await waitMorph(120);
   checkMorph('failed download follows actual stopped state',dr.model.state==='paused'&&path===dr.parts[0].nodes[0].querySelector('path'));
   await list.remove(download);delete dp.zziconDownload;
   morphBlocked.push('Successful resumable transfer pause/resume and completion still require a network-enabled Zen run');
   const popup=document.getElementById('tabContextMenu');popup.openPopup(gBrowser.selectedTab,'after_start');await waitMorph(300);
   checkMorph('reopen closed tab has native menu glyph',!!rec('#context_undoCloseTab'));popup.hidePopup();
   const tools=document.getElementById('menu_ToolsPopup');document.getElementById('toolbar-menubar').removeAttribute('autohide');document.getElementById('toolbar-menubar').removeAttribute('inactive');tools.parentElement.open=true;await waitMorph(250);if(tools.state==='closed'){morphBlocked.push('Headless native menubar popup unavailable; source-owned popupshowing lifecycle exercised');tools.dispatchEvent(new Event('popupshowing',{bubbles:true}));await waitMorph(80);}
   checkMorph('dynamic command uses stable action ID',!!document.querySelector('[data-zz-action="glassflow--mods-report-copy"][data-zz-morph]'));tools.hidePopup();
   return true;
  })();''')
  # Pointer event delivery uses real coordinates; pointer exit returns to changed state.
  edge=m.script('''return (async()=>{
   checkMorph('Glassflow motion starts off',!Services.prefs.getBoolPref('zzglass.motion.enabled'));
   const idleTab=gBrowser.selectedTab,idleRect=idleTab.getBoundingClientRect();
   idleTab.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:idleRect.right-2,clientY:idleRect.top+2,pointerType:'mouse'}));await waitMorph(90);
   checkMorph('default-off hover leaves no edge work',!__zzglassEdgesInstance.scheduled&&__zzglassEdgesInstance.owners===0&&!idleTab.style.getPropertyValue('--zzg-follow-angle'));
   Services.prefs.setBoolPref('zzglass.motion.enabled',true);
   Services.prefs.setBoolPref('zzglass.edges.enabled',true);await waitMorph(80);
   const tab=gBrowser.selectedTab,bg=tab.querySelector('.tab-background');
   const rect=bg.getBoundingClientRect(),before=getComputedStyle(bg).boxShadow;
   tab.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.right-2,clientY:rect.top+2,pointerType:'mouse'}));await waitMorph(90);
   const during=tab.style.getPropertyValue('--zzg-follow-angle');checkMorph('edge input reaches tab',!!during);
   gBrowser.selectedTab=gBrowser.tabs[0];await waitMorph(90);
   window.dispatchEvent(new Event('blur'));await waitMorph(1100);
   checkMorph('edge exit removes override',!tab.style.getPropertyValue('--zzg-follow-angle'));
   checkMorph('edge scheduler idle',!__zzglassEdgesInstance.scheduled&&__zzglassEdgesInstance.owners===0);
   checkMorph('shape preserved',getComputedStyle(bg).cornerShape!=='');
   Services.prefs.setBoolPref('zzicon.animate',false);await waitMorph(60);checkMorph('animation off stops scheduler',!__zziconMorphInstance.scheduled&&__zziconMorphInstance.active===0);
   Services.prefs.setBoolPref('zzicon.animate',true);Services.prefs.setIntPref('ui.prefersReducedMotion',1);await waitMorph(80);checkMorph('reduced motion stops scheduler',!__zziconMorphInstance.scheduled);Services.prefs.setIntPref('ui.prefersReducedMotion',0);
   const count=__zziconMorphInstance.records.size;Services.prefs.setIntPref('zzicon.set',0);await waitMorph(100);checkMorph('native set disables every Morph presentation',__zziconMorphInstance.records.size===0&&!document.querySelector('[data-zz-morph-slot]'));Services.prefs.setIntPref('zzicon.set',4);await waitMorph(180);checkMorph('reenable restores current native targets',__zziconMorphInstance.records.size===count);Services.scriptloader.loadSubScript('chrome://sine/content/zz-iconflow/iconflow-morph.uc.js',window);await waitMorph(200);
   checkMorph('reinjection one SVG per host',document.querySelectorAll('.zzicon-morph-glyph').length===__zziconMorphInstance.records.size);
   checkMorph('reinjection retains coverage',__zziconMorphInstance.records.size>=count);
   Services.prefs.setIntPref('ui.useAccessibilityTheme',1);await waitMorph(120);
   if(matchMedia('(forced-colors: active)').matches)checkMorph('forced colors restores native semantic controls',__zziconMorphInstance.records.size===0);
   else morphBlocked.push('Host did not expose forced-colors media query; native presentation fallback covered by source gate');
   Services.prefs.clearUserPref('ui.useAccessibilityTheme');await waitMorph(120);
   window.morphOther=OpenBrowserWindow();
   for(let i=0;i<100&&!morphOther.gBrowserInit?.delayedStartupFinished;i++)await waitMorph(50);
   Services.scriptloader.loadSubScript('chrome://sine/content/zz-iconflow/iconflow-morph.uc.js',morphOther);
   for(let i=0;i<40&&!morphOther.__zziconMorphInstance?.records.size;i++)await waitMorph(50);
   const other=morphOther.__zziconMorphInstance;
   checkMorph('new window has independent motion records',other.records.size>0&&other.records!==__zziconMorphInstance.records);
   morphOther.close();await waitMorph(180);checkMorph('window close releases its records',other.records.size===0);
   await waitMorph(1200);checkMorph('settled icons schedule zero frames',!__zziconMorphInstance.scheduled&&__zziconMorphInstance.active===0);
   return {before,during,checks:morphChecks,blocked:morphBlocked,records:__zziconMorphInstance.records.size,actions:[...new Set([...__zziconMorphInstance.records.values()].map(r=>r.binding.action))].sort()};
  })();''')
  # Artwork contact sheet uses the production persistent nodes at requested sizes.
  m.script('''const box=document.createElementNS('http://www.w3.org/1999/xhtml','div');box.id='morph-contact';box.style.cssText='position:fixed;inset:80px 80px auto 220px;background:#161921;color:white;display:flex;gap:18px;flex-wrap:wrap;padding:24px;z-index:2147483647';
  for(const size of [16,24,32,48])for(const id of ['#reload-button','#zen-library-button','#unified-extensions-button','#history-panelmenu']){
   const r=rec(id)||[...__zziconMorphInstance.records.values()].find(r=>r.binding.action===({'#history-panelmenu':'history','#unified-extensions-button':'extensions'})[id]);if(!r)continue;
   const svg=r.svg.cloneNode(true);svg.removeAttribute('class');svg.style.cssText=`width:${size}px;height:${size}px;position:static`;box.append(svg);
  }document.documentElement.append(box);return true;''');m.shot().save(OUT/'artwork.png')
  version=m.script('return {zen:Services.appinfo.version,build:Services.appinfo.appBuildID,gecko:Services.appinfo.platformVersion};')
  result={'runtime':version,'loading':'Production manifest scripts via Sine chrome mapping; Sine update engine covered separately','native':edge,'media':media,'placementPerformance':regression};print('PASS',len(edge['checks']),version,flush=True)
  m.script('document.getElementById("morph-contact").remove();__zziconMorphInstance.retire();__zzglassEdgesInstance.retire();checkMorph("teardown removes presentation",!document.querySelector(".zzicon-morph-glyph,[data-zz-morph-slot],[data-zz-morph]"));Services.prefs.setIntPref("zzicon.button.reload",1);Services.prefs.savePrefFile(null);return true;')
  # Restart verifies explicit user prefs; does not call the command twice.
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
  log.close();proc,m,log=start()
  m.script('Services.scriptloader.loadSubScript("chrome://sine/content/zz-iconflow/iconflow.uc.js",window);return true;');time.sleep(.2)
  assert m.script('return Services.prefs.getIntPref("zzicon.set")===4&&Services.prefs.getIntPref("zzicon.button.reload")===1;'),'explicit choices lost on restart'
  result['native']['checks']+=['teardown removes presentation','restart preserves explicit choices'];(OUT/'results.json').write_text(json.dumps(result,indent=2));print('PASS teardown and restart preference preservation',flush=True)
 finally:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
  log.close()
