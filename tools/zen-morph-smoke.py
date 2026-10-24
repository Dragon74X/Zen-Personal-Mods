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
  for cls in ['titlebar-min','titlebar-max','titlebar-close']:
   info=m.script("window.nativeButton=nativeBox.querySelector('."+cls+"');if(!nativeButton.getBoundingClientRect().width&&nativeButton.classList.contains('titlebar-max'))nativeButton=nativeBox.querySelector('.titlebar-restore');const s=getComputedStyle(nativeButton,'::after');return {box:nativeButton.getBoundingClientRect().toJSON(),position:s.position,mode:nativeButton.getAttribute('zzicon-motion'),image:s.backgroundImage};")
   assert info['position']=='static' and info['mode']=='after' and '/morph/' in info['image'],info
   settle();shown=m.shot();m.script("nativeButton.style.setProperty('--zzg-glyph','0');return true;");settle();hidden=m.shot()
   shown.save(OUT/(cls+'-shown.png'));hidden.save(OUT/(cls+'-hidden.png'))
   assert diff(info['box'],shown,hidden)>0,(cls,'window glyph does not paint',info,m.script("const s=getComputedStyle(nativeButton,'::after');return {width:s.width,height:s.height,frame:s.getPropertyValue('--zzicon-frame'),y:s.getPropertyValue('--zzicon-row-position'),visibility:s.visibility,opacity:s.opacity,background:s.backgroundPosition,host:nativeButton.outerHTML};"))
   window_paints.append(cls);m.script("nativeButton.style.removeProperty('--zzg-glyph');return true;")
  m.script("InspectorUtils.removePseudoClassLock(nativeBox,':hover');nativePlaceholder.replaceWith(nativeBox);nativeBox.removeAttribute('style');return true;")
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
   Services.prefs.setIntPref('zzicon.set',4);await nativeWait(300);nativeCheck('reenable native frames',instance.records.size>40);
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
