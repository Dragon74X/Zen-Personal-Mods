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
  m.script("for(const id of ['sidebar-button','zen-expand-sidebar-button'])CustomizableUI.addWidgetToArea(id,'nav-bar');return true;")
  m.script('window.nativeFixtureURL='+json.dumps((profile/'index.html').as_uri())+';return true;')
  result=m.script((ROOT/'tools/morph-native-regressions.js').read_text())
  print('NATIVE',json.dumps(result),flush=True)
  # A relative SVG stroke using context-fill vanishes through a file import
  # with Gecko's default policy. Exercise the generated entrypoint correction.
  fixture=folder/'context-paint-check';fixture.mkdir()
  (fixture/'stroke.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="context-fill" stroke-opacity="context-fill-opacity" stroke-width="2"><path d="M2 2H14V14H2Z"/></g></svg>')
  (fixture/'style.css').write_text('#context-paint-check{background-image:url("stroke.svg")!important;background-size:32px 32px;background-repeat:no-repeat;fill:red;fill-opacity:1;-moz-context-properties:fill,fill-opacity}')
  entry='@import "'+(fixture/'style.css').as_uri()+'";\n'
  (folder/'chrome.css').write_text(entry)
  m.script("const e=document.createElementNS('http://www.w3.org/1999/xhtml','div');e.id='context-paint-check';e.style.cssText='position:fixed;left:400px;top:250px;width:32px;height:32px;z-index:2147483647;background-color:white';document.documentElement.append(e);return true;")
  paint_counts=[]
  for phase in ['before','after']:
   if phase=='after':
    m.script("return (async()=>{const {fixChromeStylesheetImports}=ChromeUtils.importESModule('chrome://sine/content/zz-iconflow/sine-update-guard.sys.mjs');const modsDir=PathUtils.join(PathUtils.profileDir,'chrome','sine-mods'),chromeFile=PathUtils.join(modsDir,'chrome.css');fixChromeStylesheetImports({modsDir,chromeFile},{IOUtils,PathUtils});await IOUtils.writeUTF8(chromeFile,"+json.dumps(entry)+");return true;})();")
   uri='chrome://sine/content/chrome.css?paint-check='+phase
   m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI('+json.dumps(uri)+'),1);return true;');time.sleep(.4)
   shot=m.shot().convert('RGB');factor=shot.width/m.script('return window.innerWidth;')
   r=m.script("return document.getElementById('context-paint-check').getBoundingClientRect().toJSON();")
   crop=shot.crop(tuple(round(r[k]*factor) for k in ['left','top','right','bottom']));crop.save(OUT/('context-paint-'+phase+'.png'))
   paint_counts.append(sum(red>green+20 and red>blue+20 for red,green,blue in crop.getdata()))
   m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).unregisterSheet(Services.io.newURI('+json.dumps(uri)+'),1);return true;')
  assert paint_counts[0]==0 and paint_counts[1]>50,paint_counts
  assert not m.script("return Services.prefs.getBoolPref('svg.context-properties.content.enabled');")
  result['contextStrokePixels']=paint_counts
  m.script("document.getElementById('context-paint-check').remove();return true;")
  # Preserve a native context-menu image through Morph Off -> On -> Off.
  # A text-only item stays text-only; Off must never erase an existing image.
  m.script("""window.menuFixture=document.createXULElement('menupopup');menuFixture.id='zz-menu-paint-check';document.getElementById('mainPopupSet').append(menuFixture);
   const original=document.createXULElement('menuitem');original.id='zz-menu-original';original.className='menuitem-iconic';original.setAttribute('label','Native context icon');original.setAttribute('image','chrome://browser/skin/zen-icons/close.svg');original.setAttribute('data-zz-action','glassflow--mods-report-copy');menuFixture.append(original);
   const plain=document.createXULElement('menuitem');plain.id='zz-menu-plain';plain.setAttribute('label','Original text-only row');plain.setAttribute('data-zz-action','glassflow--mods-report-copy');menuFixture.append(plain);
   menuFixture.openPopupAtScreen(500,300,false);return true;""");time.sleep(.3)
  original_menu=m.script("const e=document.getElementById('zz-menu-original'),i=e.querySelector('.menu-icon');return {image:e.getAttribute('image'),paint:i.currentSrc,content:getComputedStyle(i).content,display:getComputedStyle(i).display};")
  assert 'close.svg' in original_menu['paint'] and original_menu['display']!='none',original_menu
  m.script("Services.prefs.setBoolPref('zzicon.menu.animate',true);return true;");time.sleep(.5)
  assert m.script("return ['zz-menu-original','zz-menu-plain'].every(id=>{const e=document.getElementById(id),r=__zziconMorphInstance.records.get(e);return r?.paint===e.querySelector('.menu-icon')&&r.mode==='image'&&getComputedStyle(e,'::before').content==='none';});")
  m.script("Services.prefs.setBoolPref('zzicon.menu.animate',false);return true;");time.sleep(.3)
  assert m.script("return document.getElementById('zz-menu-original').classList.contains('menuitem-iconic')&&!document.getElementById('zz-menu-plain').classList.contains('menuitem-iconic')&&!menuFixture.querySelector('[zzicon-motion]');")
  assert original_menu==m.script("const e=document.getElementById('zz-menu-original'),i=e.querySelector('.menu-icon');return {image:e.getAttribute('image'),paint:i.currentSrc,content:getComputedStyle(i).content,display:getComputedStyle(i).display};"),'Menu Off changed original image ownership'
  result['originalMenuOwnershipRestored']=True
  m.script("menuFixture.hidePopup();menuFixture.remove();return true;")
  # Real pointer input: endpoint-only/pseudo-lock tests missed snapped presses.
  def pointer(actions):
   m.call('Marionette:SetContext',{'value':'chrome'})
   m.call('WebDriver:PerformActions',{'actions':[{'type':'pointer','id':'icon-motion','parameters':{'pointerType':'mouse'},'actions':actions}]})
  def move(x,y):pointer([{'type':'pointerMove','duration':0,'x':round(x),'y':round(y)}])
  def sample_motion(host,paint):
   m.script('window.motionHost=document.querySelector('+json.dumps(host)+');window.motionPaint=document.querySelector('+json.dumps(paint)+');return true;')
   r=m.script('return motionHost.getBoundingClientRect().toJSON();')
   move(r['x']+r['width']/2,r['y']+r['height']/2);time.sleep(.6)
   m.script("window.pressSamples=[];window.pressStart=performance.now();function pressTick(){const t=performance.now()-pressStart,s=getComputedStyle(motionPaint);pressSamples.push({t,transform:s.transform,scale:s.scale,rect:motionHost.getBoundingClientRect().toJSON()});if(t<1100)requestAnimationFrame(pressTick);}requestAnimationFrame(pressTick);return true;")
   pointer([{'type':'pointerDown','button':0},{'type':'pause','duration':400},{'type':'pointerMove','duration':0,'x':1000,'y':350},{'type':'pointerUp','button':0},{'type':'pause','duration':650}])
   time.sleep(.1)
   samples=m.script('return pressSamples;')
   # A real intermediate scale is required; a binary 1 -> .82 -> 1 fails.
   values=[float(x['transform'].split('(')[1].split(',')[0]) if x['transform'].startswith('matrix(') else float(x['scale'].split()[0]) if x['scale']!='none' else 1 for x in samples]
   assert min(values)<.99 and len({round(v,4) for v in values if .83<v<.99})>=3,(host,values)
   assert abs(values[-1]-1)<.001,(host,values[-1])
   return samples
  m.script("Services.prefs.setBoolPref('zzicon.click.press',true);return true;");time.sleep(.2)
  # Arc's captured button press transform must not scale the target as well.
  m.script("window.arcButtonFixture=Services.io.newURI('data:text/css,'+encodeURIComponent('#PanelUI-menu-button:active{opacity:.5;transform:scale(.95)}:is(#zen-toggle-compact-mode>toolbarbutton:nth-child(1)):hover{transform:scale(1.25)}'));Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(arcButtonFixture,1);return true;")
  result['iconPress']=sample_motion('#PanelUI-menu-button','#PanelUI-menu-button .toolbarbutton-icon')
  for axis in ['x','y','width','height']:
   assert max(x['rect'][axis] for x in result['iconPress'])-min(x['rect'][axis] for x in result['iconPress'])<.1,('Button hit box moved',axis)
  m.script("const h=document.querySelector('#zen-toggle-compact-mode>toolbarbutton');InspectorUtils.addPseudoClassLock(h,':hover');return true;")
  time.sleep(.35)
  assert m.script("return getComputedStyle(document.querySelector('#zen-toggle-compact-mode>toolbarbutton')).transform;")=='none','Compact parent scales under Morph'
  m.script("Services.prefs.setIntPref('zzicon.set',0);return true;");time.sleep(.35)
  assert m.script("return getComputedStyle(document.querySelector('#zen-toggle-compact-mode>toolbarbutton')).transform;")=='matrix(1.25, 0, 0, 1.25, 0, 0)','Native host not released when Morph off'
  m.script("InspectorUtils.removePseudoClassLock(document.querySelector('#zen-toggle-compact-mode>toolbarbutton'),':hover');Services.prefs.setIntPref('zzicon.set',4);Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).unregisterSheet(arcButtonFixture,1);return true;");time.sleep(.35)
  result['arcButtonOwnership']=True
  # Arc 2.0's captured workspace parent transforms must not compose with
  # Glassflow's child scale or move the hit target during the animation.
  m.script("window.arcWorkspaceFixture=Services.io.newURI('data:text/css,'+encodeURIComponent('#zen-workspaces-button .subviewbutton{transform:scale(1)!important;transform-origin:bottom center!important}#zen-workspaces-button .subviewbutton:hover{transform:scale(1.25)!important}#zen-workspaces-button .subviewbutton:active:hover{transform:scale(1)!important}'));Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(arcWorkspaceFixture,1);return true;")
  m.script("const h=document.querySelector('#zen-workspaces-button toolbarbutton');h.parentElement.removeAttribute('dont-show');const i=h.querySelector('.zen-workspace-icon');i.removeAttribute('no-icon');i.textContent='🌐';Services.prefs.setBoolPref('zzglass.workspaces.enabled',true);Services.prefs.setIntPref('zzglass.workspaces.hover',1);return true;")
  time.sleep(.3)
  result['workspacePress']=sample_motion('#zen-workspaces-button toolbarbutton','#zen-workspaces-button .zen-workspace-icon')
  boxes=result['workspacePress'];assert max(x['rect']['x'] for x in boxes)-min(x['rect']['x'] for x in boxes)<.1,'Workspace hit box moved'
  m.script("Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).unregisterSheet(arcWorkspaceFixture,1);Services.prefs.setBoolPref('zzicon.click.press',false);return true;")
  m.script((ROOT/'tools/icon-hover-probe.js').read_text()+'\nreturn true;')
  r=m.script("return document.querySelector('#PanelUI-menu-button').getBoundingClientRect().toJSON();")
  move(r['x']+r['width']/2,r['y']+r['height']/2);time.sleep(.25)
  m.script("document.getElementById('tabContextMenu').openPopupAtScreen(500,300,true);return true;");time.sleep(.65)
  m.script("document.getElementById('tabContextMenu').hidePopup();return true;")
  time.sleep(20)
  probe=json.loads(m.script("const t=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);t.init(null);t.addDataFlavor('text/plain');Services.clipboard.getData(t,Services.clipboard.kGlobalClipboard);const v={};t.getTransferData('text/plain',v);return v.value.QueryInterface(Ci.nsISupportsString).data;"))
  assert probe['probe']=='icon-hover-v2' and probe['motion'] and probe['menus'] and probe['versions']['iconflow']
  assert any('after500ms' in menu for menu in probe['menus'])
  assert probe['motion'][0]['samples'][-1]['ms']>=1000 and len(probe['motion'][0]['samples'])<=65
  assert m.script('return !window.__zzIconHoverProbe;')
  (OUT/'probe.json').write_text(json.dumps(probe,indent=2));result['probeAutoCopyCleanup']=True
  move(1000,350)
  # Native image rendering, including CSS-only visibility changes that broke 1.21.1.
  from PIL import ImageChops,ImageStat
  def settle():
   m.script('return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))));')
  def diff(box,a,b):
   scale=a.width/m.script('return innerWidth;')
   crop=tuple(round(box[k]*scale) for k in ['left','top','right','bottom'])
   return max(ImageStat.Stat(ImageChops.difference(a,b).crop(crop)).mean)
  m.script("window.nativeHide=Services.io.newURI('data:text/css,'+encodeURIComponent(':root#main-window #tabbrowser-tabs .tab-close-button[zzsmoke-hidden]{visibility:hidden!important}'));Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(nativeHide,1);return true;")
  paints=[]
  for dpi in ['1.0','1.25']:
   m.script('Services.prefs.setStringPref("layout.css.devPixelsPerPx",'+json.dumps(dpi)+');return true;');time.sleep(.3)
   for motion in [False,True]:
    for left in [False,True]:
     info=m.script('''return (async()=>{
      Services.prefs.setBoolPref('zzglass.motion.enabled',MOTION);Services.prefs.setBoolPref('zzglass.tabs.close-left',LEFT);
      InspectorUtils.addPseudoClassLock(nativeTab,':hover');await nativeWait(650);
      window.nativeClose=nativeTab.querySelector('.tab-close-button');const r=__zziconMorphInstance.records.get(nativeClose),s=getComputedStyle(nativeClose);
      nativeCheck('native close owns paint',r?.paint===nativeClose&&nativeClose.getAttribute('zzicon-motion')==='image');
      nativeCheck('native close visible',s.visibility==='visible'&&+s.opacity>0&&s.maskImage==='none');
      return nativeClose.getBoundingClientRect().toJSON();
     })();'''.replace('MOTION',json.dumps(motion)).replace('LEFT',json.dumps(left)))
     settle();shown=m.shot();m.script("nativeClose.setAttribute('zzsmoke-hidden','');return true;");settle();hidden=m.shot()
     amount=diff(info,shown,hidden);assert amount>0,(dpi,motion,left,amount)
     paints.append({'dpi':dpi,'motion':motion,'left':left,'pixelDifference':amount})
     m.script("nativeClose.removeAttribute('zzsmoke-hidden');InspectorUtils.removePseudoClassLock(nativeTab,':hover');return true;");time.sleep(.3)
  m.script("Services.prefs.setStringPref('layout.css.devPixelsPerPx','1.0');return true;");time.sleep(.3)
  # Freeze at browser-owned frames: rest, windup, action and settled. Real pixels.
  crops=[]
  for frame in [0,31,65,127]:
   box=m.script("const r=nativeRecord('#reload-button');r.paint.style.setProperty('--zzicon-frame','"+str(frame)+"');return r.paint.getBoundingClientRect().toJSON();")
   settle();im=m.shot();crop=im.crop(tuple(round(box[k]) for k in ['left','top','right','bottom']));crop.save(OUT/f'reload-{frame}.png');crops.append(crop.tobytes())
  assert len(set(crops))>=3,'windup/action must change rendered pixels'
  m.script("nativeRecord('#reload-button').paint.style.setProperty('--zzicon-frame','0');return true;")
  # Existing flex pseudo-elements own window glyphs; move the native row out of
  # Linux's hidden titlebar ancestor only for this disposable rendering fixture.
  m.script("Services.prefs.setBoolPref('zzglass.buttons.enabled',true);Services.prefs.setBoolPref('zzglass.buttons.glyph-on-hover',true);window.nativeBox=document.querySelector('.titlebar-buttonbox');window.nativePlaceholder=document.createComment('window test');nativeBox.replaceWith(nativePlaceholder);document.documentElement.append(nativeBox);nativeBox.style.cssText='position:fixed!important;left:500px!important;top:80px!important;z-index:2147483647!important';InspectorUtils.addPseudoClassLock(nativeBox,':hover');return true;");time.sleep(.5)
  window_paints=[]
  for state,cls in [('normal','titlebar-min'),('normal','titlebar-max'),('normal','titlebar-close'),('maximized','titlebar-restore')]:
   m.script('document.documentElement.setAttribute("sizemode",'+json.dumps(state)+');return true;');time.sleep(.2)
   info=m.script("window.nativeButton=nativeBox.querySelector('."+cls+"');const s=getComputedStyle(nativeButton,'::after');return {box:nativeButton.getBoundingClientRect().toJSON(),position:s.position,owned:nativeButton.hasAttribute('zzicon-motion-host')||!!nativeButton.querySelector('[zzicon-motion]'),image:s.backgroundImage};")
   assert info['position']=='static' and not info['owned'] and 'data:image/svg+xml' in info['image'],info
   settle();shown=m.shot();m.script("nativeButton.style.setProperty('--zzg-glyph','0');return true;");settle();hidden=m.shot()
   assert diff(info['box'],shown,hidden)>0,(cls,'original window glyph does not paint')
   m.script("nativeButton.style.removeProperty('--zzg-glyph');return true;");settle();enabled=m.shot()
   m.script("Services.prefs.setIntPref('zzicon.set',0);return true;");time.sleep(.25);settle();disabled=m.shot()
   assert diff(info['box'],enabled,disabled)==0,(cls,'Morph changes window glyph pixels')
   assert m.script("return getComputedStyle(nativeButton,'::after').backgroundImage;")==info['image']
   window_paints.append({'glyph':cls,'samePixelsWithMorphOff':True});m.script("Services.prefs.setIntPref('zzicon.set',4);return true;");time.sleep(.25)
  m.script("document.documentElement.setAttribute('sizemode','normal');InspectorUtils.removePseudoClassLock(nativeBox,':hover');nativePlaceholder.replaceWith(nativeBox);nativeBox.removeAttribute('style');return true;")
  owner_checks=m.script("""return (async()=>{
   const cases=[];
   for(const glass of [false,true])for(const glyph of [false,true]){
    Services.prefs.setBoolPref('zzglass.buttons.enabled',glass);Services.prefs.setBoolPref('zzglass.buttons.glyph-on-hover',glyph);await nativeWait(40);
    const buttons=[...document.querySelectorAll('.titlebar-button')];
    nativeCheck('window owner unchanged '+glass+'/'+glyph,buttons.every(e=>!__zziconMorphInstance.records.has(e)&&!e.hasAttribute('zzicon-motion-host')&&!e.querySelector('[zzicon-motion]')));cases.push({glass,glyph});
   }
   return cases;
  })();""")
  result['windowOwnership']=owner_checks
  # Every generated drawing paints at captured 20px size, at rest/wind/action.
  cells=m.script("""return (async()=>{
   const data=await (await fetch('chrome://sine/content/zz-iconflow/morph-frames.json')).json();
   const box=document.createElementNS('http://www.w3.org/1999/xhtml','div');box.id='native-sheet-fixture';box.style.cssText='position:fixed;left:400px;top:120px;z-index:2147483647;background:black;display:grid;grid-template-columns:repeat(15,24px);gap:2px;padding:2px;color:lime';document.documentElement.append(box);
   const cells=[];
   for(const [id,g]of Object.entries(data.glyphs)){
    const url='chrome://sine/content/zz-iconflow/icons/morph/'+id+'.svg',image=new Image();image.src=url;await image.decode();
    for(const frame of [0,31,65]){const el=document.createElementNS(box.namespaceURI,'span');el.setAttribute('zzicon-motion','image');el.style.cssText=`display:block;width:20px;height:20px;--zzicon-sprite:url("${url}");--zzicon-columns:128;--zzicon-rows:${g.rows.length};--zzicon-row-position:0%;--zzicon-frame:${frame}`;box.append(el);cells.push({id,frame,el});}
   }
   await nativeWait(80);return cells.map(({id,frame,el})=>({id,frame,box:el.getBoundingClientRect().toJSON()}));
  })();""")
  settle();pixels=m.shot();pixels.save(OUT/'all-sheets.png')
  for cell in cells:
   crop=pixels.crop(tuple(round(cell['box'][k]) for k in ['left','top','right','bottom']))
   green=sum(g>r+30 and g>b+30 for r,g,b in crop.get_flattened_data());assert green>0,(cell,green)
  m.script("document.getElementById('native-sheet-fixture').remove();return true;")
  result['windowPaint']=window_paints;result['spritePaintCases']=len(cells)
  result['closePaint']=paints;result['distinctReloadFrames']=len(set(crops))
  result['cleanup']=m.script('''return (async()=>{
   const instance=__zziconMorphInstance;Services.prefs.setIntPref('zzicon.set',0);await nativeWait(150);
   nativeCheck('other sets release native paint',instance.records.size===0&&!document.querySelector('[zzicon-motion]'));
   Services.prefs.setIntPref('zzicon.set',4);await nativeWait(300);nativeCheck('reenable native frames',instance.records.size>20);
   Services.scriptloader.loadSubScript('chrome://sine/content/zz-iconflow/iconflow-morph.uc.js',window);await nativeWait(400);
   nativeCheck('reinjection releases old records',instance.records.size===0);
   nativeCheck('one painter per host',document.querySelectorAll('[zzicon-motion-host]').length===__zziconMorphInstance.records.size);
   __zziconMorphInstance.retire();nativeCheck('retirement restores paint',!document.querySelector('[zzicon-motion],[zzicon-motion-host]'));
   return nativeChecks;
  })();''')
  result['limitations']=['Linux headless; Windows compositor smoothness/antialiasing not measured','Native file media may not play; numeric media states exercised through the existing Mediaflow adapter']
  (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2),flush=True)
 finally:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
  log.close()
