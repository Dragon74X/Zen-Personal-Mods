#!/usr/bin/env python3
"""Circuit Morph in real Zen chrome, disposable profile. No user profile access.
Run through ZEN_BINARY=/path/to/zen node --test tools/*.test.mjs or directly.
Pillow (existing smoke harness) and ffmpeg required for native media/volume.
"""
import argparse,base64,io,json,os,runpy,socket,subprocess,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
M=runpy.run_path(str(ROOT/'tools/zen-smoke.py'))['Marionette']
def check_icon_click(m,out):
 """Native CSS ownership and WebDriver input; not Windows physical-input certification."""
 m.script('''window.clickTabs=[];window.clickWait=ms=>new Promise(r=>setTimeout(r,ms));
  Services.prefs.setBoolPref('zzglass.motion.enabled',true);Services.prefs.setBoolPref('zzglass.instant-ui',false);
  Services.prefs.setIntPref('zzglass.motion.profile',0);Services.prefs.setBoolPref('zzglass.workspaces.enabled',true);
  Services.prefs.setIntPref('zzglass.workspaces.hover',1);Services.prefs.setIntPref('zzglass.tabs.essentials-icon-grow',2);
  window.clickWorkspace=document.querySelector('#zen-workspaces-button toolbarbutton');clickWorkspace.parentElement.removeAttribute('dont-show');
  window.clickOldImage=clickWorkspace.querySelector('.zen-workspace-icon');
  const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="120" fill="red"/></svg>');
  const image=document.createElementNS('http://www.w3.org/1999/xhtml','img');image.className='zen-workspace-icon';image.src=art;image.style.cssText='width:18px;height:18px';clickOldImage.replaceWith(image);
  for(const pending of [false,true]){const t=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});
    gBrowser.pinTab(t);gZenPinnedTabManager.addToEssentials(t,{replicating:true});gBrowser.setIcon(t,art);if(pending)t.setAttribute('pending','true');clickTabs.push(t);}
  gZenWorkspaces.onWindowResize();return true;''')
 time.sleep(.5)
 def pointer(actions):m.call('WebDriver:PerformActions',{'actions':[{'type':'pointer','id':'click-mouse','parameters':{'pointerType':'mouse'},'actions':actions}]})
 results=[]
 try:
  for name,host in [('workspace','clickWorkspace'),('favorite-loaded','clickTabs[0]'),('favorite-pending','clickTabs[1]')]:
   m.script('window.clickHost='+host+";window.clickImage=clickHost.querySelector('.zen-workspace-icon,.tab-icon-image');return true;")
   r=m.script('return clickHost.getBoundingClientRect().toJSON();');assert r['width']>0 and r['height']>0,(name,r)
   pointer([{'type':'pointerMove','duration':0,'x':round(r['x']+r['width']/2),'y':round(r['y']+r['height']/2)},{'type':'pause','duration':400}])
   assert abs(m.script("return parseFloat(getComputedStyle(clickImage).scale);")-1.3)<.001,name
   m.script('''window.clickSamples=[];window.clickStart=performance.now();
    function sample(){const s=getComputedStyle(clickImage),r=clickImage.getBoundingClientRect();clickSamples.push({t:performance.now()-clickStart,scale:parseFloat(s.scale),duration:s.transitionDuration,easing:s.transitionTimingFunction,pressed:clickHost.hasAttribute('zzg-icon-pressed'),click:clickHost.hasAttribute('zzg-icon-click'),x:r.x+r.width/2,y:r.y+r.height/2,
      owners:clickImage.getAnimations().filter(a=>a.effect.getProperties().some(p=>p.property==='scale')).length,host:clickHost.getBoundingClientRect().toJSON()});if(performance.now()-clickStart<600)requestAnimationFrame(sample);}requestAnimationFrame(sample);return true;''')
   pointer([{'type':'pointerDown','button':0},{'type':'pause','duration':25}])
   if name.startswith('favorite'):assert m.script('return gBrowser.selectedTab===clickHost;'),name+' selection delayed'
   pointer([{'type':'pointerUp','button':0},{'type':'pause','duration':650}])
   samples=m.script('return clickSamples;');values=[s['scale'] for s in samples]
   (out/(name+'-click.json')).write_text(json.dumps(samples,indent=2))
   assert min(values)<.97 and 1.305<max(values)<1.32,(name,min(values),max(values))
   assert abs(values[-1]-1.3)<.001 and max(s['owners'] for s in samples)==1,(name,values[-1])
   assert max(s['x'] for s in samples)-min(s['x'] for s in samples)<.03,name+' center moved'
   assert max(s['y'] for s in samples)-min(s['y'] for s in samples)<.03,name+' center moved vertically'
   assert all(abs(s['host'][k]-r[k])<.03 for s in samples for k in ['x','y','width','height']),name+' target moved'
   assert m.script("return !clickHost.hasAttribute('zzg-icon-click')&&!clickHost.hasAttribute('zzg-icon-pressed');"),name+' state retained'
   results.append({'target':name,'minScale':min(values),'maxScale':max(values),'finalScale':values[-1],'maxScaleOwners':1,'samples':samples})
  # Repeated activation of the selected Favorite retargets its existing scale.
  pointer([{'type':'pointerDown','button':0},{'type':'pointerUp','button':0},{'type':'pause','duration':130},
    {'type':'pointerDown','button':0},{'type':'pause','duration':25},{'type':'pointerUp','button':0},{'type':'pause','duration':450}])
  assert m.script("return !clickHost.hasAttribute('zzg-icon-click')&&Math.abs(parseFloat(getComputedStyle(clickImage).scale)-1.3)<.001;"),'repeat did not settle'
  for host,key in [('clickWorkspace','\ue007'),('clickTabs[0]',' ')]:
   focused=m.script('window.clickHost='+host+";window.clickTabIndex=clickHost.getAttribute('tabindex');clickHost.setAttribute('tabindex','0');clickHost.focus();return {focused:document.activeElement===clickHost,tag:document.activeElement?.localName,id:document.activeElement?.id};")
   assert focused['focused'],(host,focused)
   m.call('WebDriver:PerformActions',{'actions':[{'type':'key','id':'click-key','actions':[{'type':'keyDown','value':key},{'type':'pause','duration':25}]}]})
   assert m.script("return clickHost.hasAttribute('zzg-icon-pressed');"),host+' keyboard press missing'
   m.call('WebDriver:PerformActions',{'actions':[{'type':'key','id':'click-key','actions':[{'type':'keyUp','value':key},{'type':'pause','duration':450}]}]})
   assert m.script("return !clickHost.hasAttribute('zzg-icon-click');"),host+' keyboard release retained'
   m.script("if(clickTabIndex===null)clickHost.removeAttribute('tabindex');else clickHost.setAttribute('tabindex',clickTabIndex);return true;")
  # Interruption must release input state; reduced motion cannot queue a spring.
  cleanup=m.script('''return (async()=>{
   const host=clickTabs[0],image=host.querySelector('.tab-icon-image'),down=()=>host.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true}));
   const empty=()=>!host.hasAttribute('zzg-icon-click')&&!host.hasAttribute('zzg-icon-pressed');
   const results={};for(const type of ['pointercancel','dragstart','deactivate']){down();window.dispatchEvent(new Event(type));results[type]=empty();}
   down();Services.prefs.setIntPref('ui.prefersReducedMotion',1);await clickWait(60);results.reduced=empty();down();results.reducedBlocks=empty();Services.prefs.setIntPref('ui.prefersReducedMotion',0);await clickWait(60);
   down();Services.prefs.setBoolPref('zzglass.motion.enabled',false);results.disabled=empty();Services.prefs.setBoolPref('zzglass.motion.enabled',true);
   down();Services.prefs.setBoolPref('zzglass.instant-ui',true);results.instant=empty();Services.prefs.setBoolPref('zzglass.instant-ui',false);
   return results;
  })();''')
  assert all(cleanup.values()),cleanup
  (out/'icon-click.json').write_text(json.dumps({'cases':results,'cleanup':cleanup,'limits':'WebDriver input and computed animation behavior; Windows physical input and presented pixels not certified.'},indent=2))
  print('CLICK PASS',[(r['target'],round(r['minScale'],4),round(r['maxScale'],4))for r in results],cleanup,flush=True)
 finally:
  pointer([{'type':'pointerMove','duration':0,'x':1000,'y':700}])
  m.script("for(const t of clickTabs)gBrowser.removeTab(t,{skipPermitUnload:true,animate:false});clickWorkspace.querySelector('.zen-workspace-icon').replaceWith(clickOldImage);return true;")

def record_hover(m,out):
 """Sample X11 output, not drawSnapshot. Diagnostic counts are not an FPS score."""
 from PIL import Image,ImageDraw
 if not os.environ.get('DISPLAY'):raise RuntimeError('--record-hover requires an X11 DISPLAY')
 png=Image.new('RGBA',(300,300));draw=ImageDraw.Draw(png)
 draw.rectangle((50,50,249,249),fill='white');draw.rectangle((80,80,219,219),fill='red');draw.ellipse((110,110,190,190),fill='black')
 buffer=io.BytesIO();png.save(buffer,format='PNG')
 svg='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect x="50" y="50" width="200" height="200" fill="white"/><rect x="80" y="80" width="140" height="140" fill="red"/><circle cx="150" cy="150" r="40" fill="black"/></svg>'
 assets={'svg':'data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode(),'png':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()}
 m.script('window.hfAssets='+json.dumps(assets)+''';
  Services.prefs.setBoolPref('zzglass.workspaces.enabled',true);Services.prefs.setIntPref('zzglass.workspaces.hover',1);
  Services.prefs.setIntPref('zzglass.tabs.essentials-icon-grow',2);Services.prefs.setIntPref('zzglass.motion.profile',0);
  Services.prefs.setBoolPref('zzglass.edges.follow-pointer',false);
  window.hfWorkspace=document.querySelector('#zen-workspaces-button toolbarbutton');hfWorkspace.parentElement.removeAttribute('dont-show');
  hfWorkspace.setAttribute('active','true');hfWorkspace.querySelector('.zen-workspace-icon').remove();
  const image=document.createElementNS('http://www.w3.org/1999/xhtml','img');image.className='zen-workspace-icon';image.style.cssText='width:18px;height:18px';image.src=hfAssets.svg;hfWorkspace.append(image);gZenWorkspaces.onWindowResize();hfWorkspace.parentElement.removeAttribute('icons-overflow');
  window.hfFavorite=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});
  gBrowser.pinTab(hfFavorite);gZenPinnedTabManager.addToEssentials(hfFavorite,{replicating:true});gBrowser.setIcon(hfFavorite,hfAssets.svg);
  window.hfReference=document.createElementNS('http://www.w3.org/1999/xhtml','div');hfReference.style.cssText='position:fixed;left:400px;top:400px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;z-index:2147483647';
  const ref=image.cloneNode();hfReference.append(ref);document.documentElement.append(hfReference);
  window.hfSS=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);window.hfURI=null;
  window.hfCSS=css=>{if(hfURI)hfSS.unregisterSheet(hfURI,1);hfURI=Services.io.newURI('data:text/css,'+encodeURIComponent(css));hfSS.loadAndRegisterSheet(hfURI,1);};
  return true;''')
 time.sleep(.5)
 # Exact shared icon curve from f075bc1 (2026-10-21, Glassflow 3.70.0).
 legacy='linear(0.000, 0.000, 0.001, 0.007, 0.023, 0.053, 0.104, 0.181, 0.280, 0.389, 0.501, 0.613, 0.721, 0.820, 0.910, 0.988, 1.053, 1.106, 1.146, 1.174, 1.192, 1.199, 1.198, 1.190, 1.177, 1.159, 1.139, 1.117, 1.094, 1.072, 1.051, 1.031, 1.013, 0.998, 0.986, 0.975, 0.968, 0.963, 0.959, 0.958, 0.958, 0.959, 0.961, 0.964, 0.967, 0.970, 0.974, 0.977, 0.980, 0.983, 0.986, 0.988, 0.990, 0.992, 0.994, 0.996, 0.997, 0.998, 0.999, 0.999, 1.000)'
 cases=[('workspace-current','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-oct21-spring','hfWorkspace',450,legacy,'svg'),
        ('workspace-current-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-oct21-half-pixel','hfWorkspace',450,legacy,'svg'),
        ('workspace-transform-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-will-change-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-3d-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-unclipped-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-aligned-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-margin-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-production-half-pixel','hfWorkspace',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('favorite-current-half-pixel','hfFavorite',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('favorite-production-half-pixel','hfFavorite',150,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-duration-only','hfWorkspace',450,'cubic-bezier(.2,.85,.25,1)','svg'),
        ('workspace-linear-svg','hfWorkspace',1000,'linear','svg'),
        ('workspace-linear-png','hfWorkspace',1000,'linear','png'),
        ('favorite-linear-svg','hfFavorite',1000,'linear','svg'),
        ('reference-linear-svg','hfReference',1000,'linear','svg')]
 report={'browser':m.script('return Services.appinfo.version;'),'graphics':m.script('return Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo).getFeatures();'),'cases':[],
  'limitations':['Disposable Linux X11 window; cannot certify Windows GPU output.','120 screen samples/second; duplicate images are retained. Distinct images are not compositor FPS.','Synthetic symmetric fixtures; visible non-overflow workspace; frozen parent paint isolates image scaling. No per-frame DOM/style reads.','A bare HTML reference distinguishes sidebar-specific behavior from renderer behavior. Timing counters and computed values alone do not prove smoothness.']}
 try:
  for name,host,duration,easing,asset in cases:
   if args.record_case and name not in args.record_case:continue
   m.script("hfWorkspace.style.left=hfFavorite.style.left="+json.dumps('.5px' if 'half-pixel' in name else '0px')+";return true;")
   m.script('window.hfHost='+host+''';window.hfImage=hfHost.querySelector('.zen-workspace-icon,.tab-icon-image');hfHost.id='zz-hover-host';hfImage.id='zz-hover-image';
    InspectorUtils.removePseudoClassLock(hfHost,':hover');hfImage.setAttribute('src',hfAssets.'''+asset+''');return true;''')
   # Multiple IDs deliberately outrank existing user-sheet rules; verify the
   # applied duration below so an ineffective test override cannot pass.
   owner='#zz-hover-host#zz-hover-host#zz-hover-host';paint='#zz-hover-image#zz-hover-image#zz-hover-image'
   css=owner+'{background:black!important;box-shadow:none!important;filter:none!important;opacity:1!important;transition:none!important;}'
   css+=owner+' .tab-background{background:black!important;box-shadow:none!important;}'
   prop='transform' if 'transform-half' in name else 'scale'
   css+=paint+'{width:'+('20' if host=='hfFavorite' else '18')+'px!important;height:'+('20' if host=='hfFavorite' else '18')+'px!important;scale:1!important;'+('transform:scale(1)!important;' if prop=='transform' else '')+'transition:'+prop+' '+str(duration)+'ms '+easing+'!important;}'
   css+=owner+':hover '+paint+'{'+('transform:scale(1.3)' if prop=='transform' else 'scale:1.3')+'!important;}'
   if '-production-' not in name:css+=paint+'{--zzg-icon-align:none!important;}'
   if 'will-change' in name:css+=paint+'{will-change:scale,transform!important;}'
   if '-3d-' in name:css+=paint+'{transform:translateZ(0)!important;}'
   if '-unclipped-' in name:css+=paint+'{overflow:visible!important;clip-path:none!important;}'
   if '-aligned-' in name:css+=paint+'{translate:.5px 0!important;}'
   if '-margin-' in name:css+=paint+'{margin-left:1px!important;}'
   m.script('hfCSS('+json.dumps(css)+');dispatchEvent(new Event("resize"));return true;');time.sleep(1.2)
   info=m.script('const s=getComputedStyle(hfImage);return {rect:hfImage.getBoundingClientRect().toJSON(),duration:parseFloat(s.transitionDuration)*1000,easing:s.transitionTimingFunction,dpr:devicePixelRatio,offset:[mozInnerScreenX,mozInnerScreenY]};')
   assert abs(info['duration']-duration)<.01,(name,info)
   r=info['rect'];assert r['width']>0 and r['height']>0,(name,r)
   radius=round(14*info['dpr']);side=radius*2
   x=round((info['offset'][0]+r['x']+r['width']/2)*info['dpr'])-radius;y=round((info['offset'][1]+r['y']+r['height']/2)*info['dpr'])-radius
   m.script("window.hfAlignWrites=0;window.hfAlignWatch=new MutationObserver(rs=>hfAlignWrites+=rs.length);hfAlignWatch.observe(hfImage,{attributes:true,attributeFilter:['style']});return true;")
   movie=out/(name+'.mkv')
   with (out/(name+'.log')).open('w') as log:
    capture=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate','120','-video_size',f'{side}x{side}','-i',os.environ['DISPLAY']+f'+{x},{y}','-t','3','-c:v','ffv1',str(movie)],stdout=subprocess.DEVNULL,stderr=log)
    try:
     time.sleep(.5);m.script("InspectorUtils.addPseudoClassLock(hfHost,':hover');return true;")
     time.sleep(.07)
     info['animation']=m.script('return hfImage.getAnimations().map(a=>({property:a.transitionProperty,properties:a.effect.getProperties()}));')
     assert any(a['property']==prop for a in info['animation']),(name,'No running '+prop+' transition')
     time.sleep(1.13);m.script("InspectorUtils.removePseudoClassLock(hfHost,':hover');return true;")
     assert capture.wait(timeout=10)==0,name
    finally:
     if capture.poll() is None:capture.terminate();capture.wait(timeout=5)
   raw=subprocess.check_output(['ffmpeg','-loglevel','error','-i',str(movie),'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','-'])
   size=side*side*3;frames=[raw[i:i+size] for i in range(0,len(raw),size)]
   assert len(frames)>1 and all(len(f)==size for f in frames),(name,'Incomplete capture')
   distinct=len(set(frames));assert distinct>1,(name,'No visible changes; capture cannot validate motion')
   changes=[i for i in range(1,len(frames)) if frames[i]!=frames[i-1]]
   centers=[];centers_y=[]
   for data in frames:
    weights=[max(0,data[i]-max(data[i+1],data[i+2])) for i in range(0,len(data),3)]
    assert sum(weights)>0,(name,'Fixture invisible in a captured frame')
    centers.append(sum((i%side)*w for i,w in enumerate(weights))/sum(weights))
    centers_y.append(sum((i//side)*w for i,w in enumerate(weights))/sum(weights))
   writes=m.script('hfAlignWatch.disconnect();return hfAlignWrites;')
   row={'name':name,'sampledFrames':len(frames),'distinctImages':distinct,'changeFrames':changes,'paintCenterRangeX':max(centers)-min(centers),'paintCenterRangeY':max(centers_y)-min(centers_y),'paintCentersX':centers,'paintCentersY':centers_y,'styleWritesDuringMotion':writes,**info};report['cases'].append(row)
   (out/'hover-result.json').write_text(json.dumps(report,indent=2))
   print(json.dumps({k:row[k] for k in ['name','sampledFrames','distinctImages','paintCenterRangeX']}),flush=True)
   if '-production-' in name:
    # Antialiasing changes the weighted centroid by up to .039 device pixels
    # in these fixtures. Reject handoff movement, not raster-weight symmetry.
    assert max(row['paintCenterRangeX'],row['paintCenterRangeY'])<.05,(name,'Painted center shifted',row['paintCenterRangeX'],row['paintCenterRangeY'])
    assert writes==0,(name,'Style writes during motion',writes)
   m.script("hfHost.removeAttribute('id');hfImage.removeAttribute('id');return true;")
  (out/'hover-result.json').write_text(json.dumps(report,indent=2))
  # Full-bleed art exposes clipping by an ancestor; the normal inset fixture
  # above cannot. Read one screenshot per endpoint, not inside the animation.
  report['bounds']=[]
  for name,host in [('workspace','hfWorkspace'),('favorite','hfFavorite')]:
   m.script('window.hfHost='+host+''';window.hfImage=hfHost.querySelector('.zen-workspace-icon,.tab-icon-image');hfHost.id='zz-hover-host';hfImage.id='zz-hover-image';
    InspectorUtils.removePseudoClassLock(hfHost,':hover');
    hfImage.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="red"/></svg>');
    hfCSS('#zz-hover-host#zz-hover-host{background:black!important;box-shadow:none!important;filter:none!important;opacity:1!important;}#zz-hover-host .tab-background{background:black!important;box-shadow:none!important;}#zz-hover-image#zz-hover-image{width:'''+('20' if host=='hfFavorite' else '18')+'''px!important;height:'''+('20' if host=='hfFavorite' else '18')+'''px!important;}');return true;''')
   for hovered in [False,True]:
    m.script('InspectorUtils.'+('add' if hovered else 'remove')+"PseudoClassLock(hfHost,':hover');return true;");time.sleep(.65)
    info=m.script('''const r=hfImage.getBoundingClientRect(),ancestors=[];
     for(let n=hfImage;n&&n!==document.documentElement;n=n.parentElement){const s=getComputedStyle(n);ancestors.push({tag:n.localName,id:n.id,classes:n.className,box:n.getBoundingClientRect().toJSON(),overflow:s.overflow,clip:s.clipPath,mask:s.maskImage,contain:s.contain,scale:s.scale,transform:s.transform,origin:s.transformOrigin,objectFit:s.objectFit});}
     return {rect:r.toJSON(),ancestors};''')
    r=info['rect'];shot=m.shot();ratio=shot.width/m.script('return innerWidth;')
    cx=(r['x']+r['width']/2)*ratio;cy=(r['y']+r['height']/2)*ratio
    radius=round(20*ratio)
    crop=shot.crop((round(cx)-radius,round(cy)-radius,round(cx)+radius,round(cy)+radius)).convert('RGB');crop.save(out/f'{name}-bounds-{hovered}.png')
    red=[x for x in range(radius*2) if (lambda c:c[0]>180 and c[1]<60 and c[2]<60)(crop.getpixel((x,radius)))]
    visible=(max(red)-min(red)+1)/ratio if red else 0
    assert abs(visible-r['width'])<=2,(name,hovered,'Ancestor clipped image',visible,r)
    report['bounds'].append({'name':name,'hovered':hovered,'visibleCenterRowWidth':visible,**info})
   m.script("InspectorUtils.removePseudoClassLock(hfHost,':hover');hfHost.removeAttribute('id');hfImage.removeAttribute('id');return true;")
  report['alignmentLifecycle']=m.script('''return (async()=>{
   const pause=ms=>new Promise(r=>setTimeout(r,ms));
   const ws=hfWorkspace.querySelector('.zen-workspace-icon'),fav=hfFavorite.querySelector('.tab-icon-image');
   Services.prefs.setBoolPref('zzglass.workspaces.enabled',false);await pause(100);
   const workspaceOff=!ws.style.getPropertyValue('--zzg-icon-pixel-x');
   const favoriteKept=!!fav.style.getPropertyValue('--zzg-icon-pixel-x');
   Services.prefs.setBoolPref('zzglass.workspaces.enabled',true);await pause(100);
   const restored=!!ws.style.getPropertyValue('--zzg-icon-pixel-x');
   window.__zzglassInstance.retire();dispatchEvent(new Event('resize'));await pause(100);
   const retired=!ws.style.getPropertyValue('--zzg-icon-pixel-x')&&!fav.style.getPropertyValue('--zzg-icon-pixel-x');
   Services.scriptloader.loadSubScript('chrome://sine/content/zz-glassflow/glassflow.uc.js',window);await pause(150);
   const reloaded=!!fav.style.getPropertyValue('--zzg-icon-pixel-x');
   const toolbox=document.getElementById('navigator-toolbox'),wasHover=toolbox.hasAttribute('zen-has-hover');
   const hiddenStart=[];
   for(const duration of [180,0]){
     hfCSS('#navigator-toolbox{translate:-2000px 0!important;transition:translate '+duration+'ms linear!important}#navigator-toolbox[zen-has-hover]{translate:0!important}');
     toolbox.removeAttribute('zen-has-hover');await pause(250);
     window.__zzglassInstance.retire();
     Services.scriptloader.loadSubScript('chrome://sine/content/zz-glassflow/glassflow.uc.js',window);await pause(100);
     if(fav.getBoundingClientRect().right>0)throw new Error('Sidebar fixture did not start offscreen');
     toolbox.setAttribute('zen-has-hover','true');await pause(300);
     hiddenStart.push(!!fav.style.getPropertyValue('--zzg-icon-pixel-x'));
   }
   hfCSS('');toolbox.toggleAttribute('zen-has-hover',wasHover);await pause(200);
   return {workspaceOff,favoriteKept,restored,retired,reloaded,hiddenStartAnimated:hiddenStart[0],hiddenStartInstant:hiddenStart[1]};
  })();''')
  assert all(report['alignmentLifecycle'].values()),report['alignmentLifecycle']
  (out/'hover-result.json').write_text(json.dumps(report,indent=2))
 finally:
  m.script("InspectorUtils.removePseudoClassLock(hfHost,':hover');if(hfURI)hfSS.unregisterSheet(hfURI,1);return true;")

def check_hover_ab(m,out):
 """Automatic capture must finish without pointer, keyboard or start controls."""
 read_clip="const t=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);t.init(null);t.addDataFlavor('text/plain');Services.clipboard.getData(t,Services.clipboard.kGlobalClipboard);const v={};t.getTransferData('text/plain',v);return v.value.QueryInterface(Ci.nsISupportsString).data;"
 m.script("window.abPrefs=()=>JSON.stringify(Services.prefs.getChildList('zz').map(k=>[k,Services.prefs.prefHasUserValue(k),Services.prefs.getPrefType(k)===128?Services.prefs.getBoolPref(k):Services.prefs.getPrefType(k)===64?Services.prefs.getIntPref(k):Services.prefs.getStringPref(k)]));window.abSource='data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"300\" height=\"300\"%3E%3Ccircle cx=\"150\" cy=\"150\" r=\"120\" fill=\"red\"/%3E%3C/svg%3E';const h=document.querySelector('#zen-workspaces-button toolbarbutton');h.parentElement.removeAttribute('dont-show');h.removeAttribute('active');const i=h.querySelector('.zen-workspace-icon');i.removeAttribute('no-icon');i.textContent='🌐';gZenWorkspaces.onWindowResize();window.abFavorite=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.pinTab(abFavorite);gZenPinnedTabManager.addToEssentials(abFavorite,{replicating:true});gBrowser.setIcon(abFavorite,abSource);window.abPendingFavorite=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.pinTab(abPendingFavorite);gZenPinnedTabManager.addToEssentials(abPendingFavorite,{replicating:true});gBrowser.setIcon(abPendingFavorite,abSource);window.abPendingTab=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.setIcon(abPendingTab,abSource);window.abLoadedTab=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.setIcon(abLoadedTab,abSource);Services.prefs.setIntPref('zzglass.workspaces.hover',1);Services.prefs.setIntPref('zzglass.tabs.essentials-icon-grow',2);return true;")
 time.sleep(.7)
 assert m.script("const h=document.querySelector('#zen-workspaces-button toolbarbutton'),i=document.createElementNS('http://www.w3.org/1999/xhtml','img');i.className='zen-workspace-icon';i.src=abSource;h.querySelector('.zen-workspace-icon').replaceWith(i);const clip=document.createElementNS('http://www.w3.org/1999/xhtml','div');clip.style.cssText='position:fixed;left:400px;top:300px;width:100px;height:100px;overflow:hidden';const t=document.createElementNS('http://www.w3.org/1999/xhtml','div');t.id='ab-clipped-tab';t.className='tabbrowser-tab';t.setAttribute('pending','true');t.style.cssText='position:absolute;left:200px;top:0;width:200px;height:40px';const icon=i.cloneNode();icon.className='tab-icon-image';t.append(icon);clip.append(t);document.getElementById('tabbrowser-tabs').prepend(clip);const r=t.getBoundingClientRect();return r.width>0&&r.left<innerWidth&&!t.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));"),'Clipped fixture must have a positive in-window box'
 m.script("abPendingFavorite.setAttribute('pending','true');abPendingTab.setAttribute('pending','true');InspectorUtils.addPseudoClassLock(abFavorite,':hover',false);return true;")
 before=m.script('return abPrefs();');selected=m.script('return gBrowser.selectedTab.id;')
 assert m.script("return [Services.vc.compare('1.0.0','9.9.9'),Services.vc.compare('9.9.9','1.0.0'),Services.vc.compare('1.0.0','1.0.0')].map(Math.sign);")==[-1,1,0]
 m.script((ROOT/'tools/icon-hover-ab-probe.js').read_text()+'\nreturn true;')
 assert m.script("return [...document.querySelector('#zz-hover-ab-panel').querySelectorAll('button')].map(b=>b.textContent);")==['Stop + copy']
 for _ in range(250):
  if not m.script('return !!window.__zzHoverABProbe;'):break
  time.sleep(.5)
 else:raise AssertionError('Automatic probe did not finish')
 report=json.loads(m.script(read_clip));(out/'automatic-ab.json').write_text(json.dumps(report,indent=2))
 assert report['probe']=='hover-ab-v3' and report['automatic'] and report['finished']=='completed',report['finished']
 assert report['updater']['available'] and not report['updater']['autoUpdates'],report['updater']
 assert report['prefs']['sine.auto-updates'] is False
 assert all(t['host']!='ab-clipped-tab' for t in report['targets']),'Clipped target selected'
 kinds={t['kind'] for t in report['targets']};assert kinds=={'workspace','favorite-pending','favorite-loaded','tab-pending','tab-loaded'},kinds
 assert len(report['phases'])==17,len(report['phases'])
 for row in report['phases']:
  assert row['samples'] and row['rafIntervalsMs'],(row['target'],row['name'])
  assert len(row['samples'])<=12 and len(row['events'])<=100 and len(row['rafIntervalsMs'])<=2000
  segments=row['compositorSegments'];assert len(segments)==9 and all(s['endMs']-s['startMs']<1000 for s in segments),segments
  assert all(isinstance(s['intervalsMs'],list) for s in segments) and any(s['intervalsMs'] for s in segments),('Missing compositor capture',row['target'],row['name'])
  assert all(s.get('unavailable') for s in segments if not s['intervalsMs']),'Empty timing segment reported as valid'
  assert not [e for e in row['events'] if e['target']=='image' and e['property'] in ('scale','transform') and e['type']=='transitioncancel'],row['events']
  if not row['target'].startswith('tab-'):
   samples=row['samples'];base=samples[0]['style'];width=float(base['width'].removesuffix('px'));height=float(base['height'].removesuffix('px'))
   for s in samples:
    assert s['style']['width']==base['width'] and s['style']['height']==base['height'],'Layout size changed during scale'
    origin=[float(v.removesuffix('px')) for v in s['style']['transform-origin'].split()];assert abs(origin[0]-width/2)<.01 and abs(origin[1]-height/2)<.01,origin
    scale=float(s['style']['transform'].split('(')[1].split(',')[0]) if row['variant']==4 else 1 if s['style']['scale']=='none' else float(s['style']['scale'])
    assert abs(s['imageBox'][2]-width*scale)<.04 and abs(s['imageBox'][3]-height*scale)<.04,(row['target'],s)
   for axis in (0,1):
    centers=[s['imageBox'][axis]+s['imageBox'][axis+2]/2 for s in samples]
    assert max(centers)-min(centers)<.04,(row['target'],'Image center moved',centers)
  if row['variant'] in [1,4]:assert row['overrideVerified'],(row['target'],row['name'],row.get('unavailable'))
 assert m.script('return abPrefs();')==before,'Probe changed saved preferences'
 assert m.script('return gBrowser.selectedTab.id;')==selected,'Probe selected a tab'
 assert m.script("return InspectorUtils.hasPseudoClassLock(abFavorite,':hover')&&!abFavorite.matches(':hover');"),'Prior negative pseudo lock lost'
 assert m.script("return !window.__zzHoverABProbe&&!document.querySelector('#zz-hover-ab-panel,[data-zz-hover-ab]');"),'Probe leaked UI/markers'
 print('PASS automatic 17 phases / 5 targets; centered scaling, segmented timing, clipped-target exclusion, clipboard and restoration',flush=True)
 m.script((ROOT/'tools/icon-hover-ab-probe.js').read_text()+'\nreturn true;')
 for _ in range(60):
  if m.script("return getComputedStyle(document.querySelector('#zen-workspaces-button .zen-workspace-icon')).transitionDuration.includes('0.45s');"):break
  time.sleep(.2)
 else:raise AssertionError('Cancellation fixture never reached its override')
 m.script("__zzHoverABProbe.stop();return true;")
 assert json.loads(m.script(read_clip))['finished']=='manual'
 assert m.script("return !window.__zzHoverABProbe&&!document.querySelector('#zz-hover-ab-panel,[data-zz-hover-ab]');")
 assert m.script('return abPrefs();')==before
 print('PASS cancellation restores active override',flush=True)

p=argparse.ArgumentParser(description=__doc__);p.add_argument('--zen',required=True,type=Path);p.add_argument('--output',required=True,type=Path);modes=p.add_mutually_exclusive_group();modes.add_argument('--record-hover',action='store_true',help='Record current/Oct 21 hover comparisons and clipping bounds from an existing X11 DISPLAY');modes.add_argument('--probe-ab',action='store_true',help='Check the user-facing hover A/B probe and clipboard cleanup in native Zen');modes.add_argument('--clicks',action='store_true',help='Check workspace/Favorite click spring and cleanup');p.add_argument('--record-case',action='append',help='Run only this named hover recording case (repeatable)');p.add_argument('--record-dpr',type=float,default=1,help='Device pixel ratio for the disposable recording profile');args=p.parse_args()
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
MODS=['glassflow','groupflow','iconflow','glassflow-library','download-prompt','tab-router','tab-unloader','mediaflow']
with tempfile.TemporaryDirectory(prefix='zen-morph-') as d:
 profile=Path(d);folder=profile/'chrome/sine-mods';folder.mkdir(parents=True)
 for mod in MODS:(folder/json.loads((ROOT/mod/'theme.json').read_text())['id']).symlink_to(ROOT/mod,target_is_directory=True)
 (profile/'index.html').write_text('<title>Morph native state</title><video src="video.webm" preload="none" loop controls></video>')
 subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libvpx','-deadline','realtime','-b:v','30k','-c:a','libopus',str(profile/'video.webm')],check=True)
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'zen.welcome-screen.seen':True,'zen.welcome-screen.enabled':False,'sine.auto-updates':False,'ui.prefersReducedMotion':0,'zzrouter.enabled':False,'media.cubeb.backend':'dummy','media.autoplay.default':0,'media.autoplay.blocking_policy':0,'svg.context-properties.content.enabled':False}
 if args.record_hover:prefs['layout.css.devPixelsPerPx']=str(args.record_dpr)
 (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k,v in prefs.items()))
 def start():
  log=(OUT/'browser.log').open('a');proc=subprocess.Popen([str(args.zen.resolve()),*([] if args.record_hover else ['--headless']),'--no-remote','--profile',d,'--marionette','--remote-allow-system-access','about:blank'],stdout=log,stderr=log)
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
  if args.record_hover:
   record_hover(m,OUT)
   raise SystemExit(0)
  if args.probe_ab:
   check_hover_ab(m,OUT)
   raise SystemExit(0)
  check_icon_click(m,OUT)
  if args.clicks:raise SystemExit(0)
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
  # Real pointer motion along Arc's moving bottom edge, not a forced :hover.
  # The captured Arc rule is intentionally loaded after our sheet.
  m.script("window.arcURLFixture=Services.io.newURI('data:text/css,'+encodeURIComponent('#urlbar{transition:transform 0.5s ease-out,box-shadow 0.5s ease-out}#urlbar:hover{transform:translateY(-2px)!important;box-shadow:0 12px 12px -12px light-dark(rgb(255 255 255 / 10%),rgb(0 0 0 / 10%));transition-duration:0.5s!important}#zen-site-data-icon-button:active,#zen-copy-url-button:active{opacity:.5;transform:scale(.95)}'));Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(arcURLFixture,1);return true;")
  result['urlbarEdge']=[]
  for enabled in [False,True]:
   move(1000,350)
   m.script('Services.prefs.setBoolPref("zzglass.motion.enabled",'+json.dumps(enabled)+');return true;');time.sleep(.65)
   r=m.script("return document.getElementById('urlbar').getBoundingClientRect().toJSON();")
   m.script("window.urlSamples=[];window.urlStart=performance.now();function sampleURL(){const u=document.getElementById('urlbar');urlSamples.push({t:performance.now()-urlStart,hover:u.matches(':hover'),y:u.getBoundingClientRect().y});if(performance.now()-urlStart<1600)requestAnimationFrame(sampleURL);}requestAnimationFrame(sampleURL);return true;")
   for i in range(35):move(r['x']+r['width']/2+(i%2),int(r['bottom'])-1);time.sleep(.045)
   time.sleep(.15);samples=m.script('return urlSamples;')
   changes=sum(a['hover']!=b['hover'] for a,b in zip(samples,samples[1:]));travel=max(x['y'] for x in samples)-min(x['y'] for x in samples)
   assert (changes<=1 and travel<.1) if enabled else (changes>=3 and travel>1), (enabled,changes,travel)
   result['urlbarEdge'].append(dict(enabled=enabled,hoverChanges=changes,travel=travel,samples=samples))
  move(1000,350)
  m.script("gURLBar.focus();gURLBar.value='zz-native-motion-check';gURLBar.startQuery({searchString:gURLBar.value});return gURLBar.lastQueryContextPromise.then(()=>true);");time.sleep(.5)
  if not m.script("return document.getElementById('urlbar').hasAttribute('breakout-extend');"):
   r=m.script("return gURLBar.getBoundingClientRect().toJSON();");move(r['x']+r['width']/2,r['y']+r['height']/2);pointer([{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}]);time.sleep(.5)
  assert m.script("return document.getElementById('urlbar').hasAttribute('breakout-extend');")
  move(1100,850);time.sleep(.65)
  # Native search-mode motion uses scale; prove the open bar still accepts it.
  assert m.script("const a=gURLBar.animate([{transform:'scale(.98)'},{transform:'scale(.98)'}],{duration:250,fill:'forwards'});a.pause();a.currentTime=100;const t=getComputedStyle(gURLBar).transform;a.cancel();return t;").startswith('matrix(0.98'), 'Open URL bar transform overridden'
  m.script("gURLBar.blur();gURLBar.view.close();return true;");time.sleep(.5)
  # Native URL-bar boxes receive events over their padding; child images do not.
  # Keep the real DOM/handlers. A local HTTP page makes Copy URL natively enabled.
  import http.server,threading,functools
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=d))
  threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   url='http://127.0.0.1:'+str(server.server_port)+'/index.html'
   m.script('gBrowser.selectedBrowser.loadURI(Services.io.newURI('+json.dumps(url)+'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});return true;');time.sleep(1)
   # Reveal the native page actions by hovering the valid closed URL bar.
   bar=m.script("return gURLBar.getBoundingClientRect().toJSON();")
   move(bar['x']+bar['width']/2,bar['y']+bar['height']/2);time.sleep(.5)
   result['urlbarBindings']=[]
   for selector in ['#zen-copy-url-button','#zen-site-data-icon-button']:
    move(bar['x']+30,bar['y']+bar['height']/2);time.sleep(.4)
    info=m.script('const h=document.querySelector('+json.dumps(selector)+'),r=__zziconMorphInstance.records.get(h);return {owner:!!r,box:h.getBoundingClientRect().toJSON(),paint:r?.paint.getBoundingClientRect().toJSON(),disabled:h.getAttribute("disabled")};')
    assert info['owner'] and info['box']['width']>0,(selector,info)
    h=info['box'];i=info['paint'];x=round(h['left']+1);y=round(h['top']+h['height']/2)
    assert not (i['left']<=x<i['right'] and i['top']<=y<i['bottom']),('Point must be padding',selector,info)
    assert m.script('return document.elementFromPoint('+str(x)+','+str(y)+')?.closest('+json.dumps(selector)+')===document.querySelector('+json.dumps(selector)+');'),('Padding is not hit-testable',selector,info)
    box=m.script('return __zziconMorphInstance.records.get(document.querySelector('+json.dumps(selector)+')).paint.getBoundingClientRect().toJSON();')
    move(x,y);time.sleep(.4)
    state=m.script('const r=__zziconMorphInstance.records.get(document.querySelector('+json.dumps(selector)+'));return {hover:r.hover,frame:+getComputedStyle(r.paint).getPropertyValue("--zzicon-frame")};')
    assert state['hover'] and state['frame']==31,(selector,state)
    # Compare fixed frames under identical settled hover styling. Native
    # opacity/background changes must not masquerade as a Morph windup.
    shots=[]
    for fixed in [0,31]:
     m.script('const r=__zziconMorphInstance.records.get(document.querySelector('+json.dumps(selector)+'));r.paint.style.setProperty("--zzicon-frame",'+json.dumps(str(fixed))+');return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));')
     shots.append(m.shot())
    before,after=shots
    from PIL import ImageChops,ImageStat
    factor=before.width/m.script('return innerWidth;');crop=tuple(round(box[k]*factor) for k in ['left','top','right','bottom'])
    pixel_change=sum(ImageStat.Stat(ImageChops.difference(before,after).crop(crop)).sum)
    assert pixel_change>0,(selector,box,pixel_change)
    result['urlbarBindings'].append(dict(selector=selector,padding=[x,y],pixelChange=pixel_change,**state))
   move(bar['x']+30,bar['y']+bar['height']/2);time.sleep(.4)
   m.script("window.copyCalls=0;window.copyCommand=document.getElementById('cmd_zenCopyCurrentURL');window.countCopy=()=>copyCalls++;copyCommand.addEventListener('command',countCopy);return true;")
   r=m.script("return document.getElementById('zen-copy-url-button').getBoundingClientRect().toJSON();")
   move(r['x']+1,r['y']+r['height']/2);time.sleep(.3)
   pointer([{'type':'pointerDown','button':0},{'type':'pause','duration':200}])
   assert m.script("return getComputedStyle(document.getElementById('zen-copy-url-button')).transform;")=='none','Copy URL hit box scales under Arc'
   pointer([{'type':'pointerUp','button':0}])
   assert m.script("const r=__zziconMorphInstance.records.get(document.getElementById('zen-copy-url-button'));return copyCalls===1&&r.phase==='fire'&&r.animation?.effect.getKeyframes().at(-1)['--zzicon-frame']==='127';"),'Copy URL did not execute/animate exactly once'
   m.script("copyCommand.removeEventListener('command',countCopy);document.getElementById('zen-copy-url-button').setAttribute('disabled','true');return true;");time.sleep(1.5)
   move(1000,700);move(r['x']+1,r['y']+r['height']/2);time.sleep(.4)
   assert m.script("const r=__zziconMorphInstance.records.get(document.getElementById('zen-copy-url-button'));return +getComputedStyle(r.paint).getPropertyValue('--zzicon-frame')===0&&!r.animation;"),'Disabled box winds up'
   m.script("document.getElementById('zen-copy-url-button').removeAttribute('disabled');gURLBar.blur();gURLBar.view.close();gBrowser.selectedBrowser.loadURI(Services.io.newURI(nativeFixtureURL),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});return true;");time.sleep(.8)
  finally:
   server.shutdown();server.server_close()
   m.script("Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).unregisterSheet(arcURLFixture,1);return true;")
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
  # Sample browser-owned transitions at fixed times, including release. This
  # catches oscillation that endpoint and anchored-hit-box checks cannot see.
  result['scaleProfiles']=m.script("""return (async()=>{
   const cases=[],durations=[150,210,240,270,290];
   const ws=document.querySelector('#zen-workspaces-button toolbarbutton'),wi=ws.querySelector('.zen-workspace-icon');
   const button=document.getElementById('PanelUI-menu-button'),bi=button.querySelector('.toolbarbutton-icon');
   const essential=nativeTab.querySelector('.tab-icon-image');nativeTab.setAttribute('zen-essential','true');
   Services.prefs.setIntPref('zzglass.tabs.essentials-icon-grow',2);Services.prefs.setBoolPref('zzicon.click.press',true);
   const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const read=(el,property)=>{const s=getComputedStyle(el);return property==='scale'?(s.scale==='none'?1:parseFloat(s.scale)):(s.transform==='none'?1:parseFloat(s.transform.slice(7)));};
   for(let profile=0;profile<5;profile++){
    Services.prefs.setIntPref('zzglass.motion.profile',profile);await nativeWait(400);
    for(const [name,host,el,pseudo,property,target,rest=1]of [['workspace',ws,wi,':hover','scale',1.3],['essential',nativeTab,essential,':hover','scale',1.3],['essential-press',nativeTab,essential,':active','scale',.95,1.3],['press',button,bi,':active','transform',.82]]){
     if(pseudo===':active'){InspectorUtils.addPseudoClassLock(host,':hover');await tick();await nativeWait(350);}
     const box=host.getBoundingClientRect();
     for(const on of [true,false]){
      InspectorUtils[on?'addPseudoClassLock':'removePseudoClassLock'](host,pseudo);await tick();
      const a=el.getAnimations().find(a=>a.transitionProperty===property);nativeCheck(name+' transition exists',!!a);a.pause();
      const duration=a.effect.getTiming().duration,values=[];for(let i=0;i<=40;i++){a.currentTime=duration*i/40;values.push(read(el,property));}
      if(profile<2){const low=Math.min(rest,target),high=Math.max(rest,target),direction=(target-rest)*(on?1:-1);
       nativeCheck(name+' profile '+profile+' zero overshoot '+on,values.every(v=>v>=low-.0001&&v<=high+.0001));
       nativeCheck(name+' profile '+profile+' no reversals '+on,values.every((v,i)=>!i||(v-values[i-1])*direction>=-.00001));
      }
      nativeCheck(name+' profile duration '+profile+': '+duration,Math.abs(duration-(name==='essential-press'&&on?90:durations[profile]))<.01);
      nativeCheck(name+' endpoint '+on,Math.abs(values.at(-1)-(on?target:rest))<.0001);
      const next=host.getBoundingClientRect();nativeCheck(name+' hit box fixed', ['x','y','width','height'].every(k=>Math.abs(next[k]-box[k])<.1));
      cases.push({profile,name,on,duration,min:Math.min(...values),max:Math.max(...values)});a.finish();await tick();
     }
     if(pseudo===':active')InspectorUtils.removePseudoClassLock(host,':hover');
    }
   }
   Services.prefs.setIntPref('zzglass.motion.profile',0);
   // A release during growth must finish without a second hover cycle.
   InspectorUtils.addPseudoClassLock(ws,':hover');await tick();await nativeWait(60);
   InspectorUtils.removePseudoClassLock(ws,':hover');await tick();await nativeWait(350);
   nativeCheck('interrupted hover settles',read(wi,'scale')===1&&!wi.getAnimations().some(a=>a.transitionProperty==='scale'));
   Services.prefs.setIntPref('ui.prefersReducedMotion',1);await nativeWait(100);InspectorUtils.addPseudoClassLock(ws,':hover');await tick();
   nativeCheck('reduced motion has no scale transition',!wi.getAnimations().some(a=>a.transitionProperty==='scale'));InspectorUtils.removePseudoClassLock(ws,':hover');
   InspectorUtils.addPseudoClassLock(nativeTab,':active');await tick();
   nativeCheck('reduced motion Favorite press has no transition',read(essential,'scale')===.95&&!essential.getAnimations().some(a=>a.transitionProperty==='scale'));
   Services.prefs.setBoolPref('zzglass.motion.enabled',false);await tick();
   nativeCheck('motion off releases Favorite press',read(essential,'scale')===1);
   InspectorUtils.removePseudoClassLock(nativeTab,':active');Services.prefs.setBoolPref('zzglass.motion.enabled',true);
   // The anchor owns ordinary interaction only, not drag/close geometry.
   nativeTab.style.transform='scale(.9)';nativeTab.style.scale='.9';nativeTab.style.rotate='1deg';
   for(const [owner,attr]of [[nativeTab,'closing'],[nativeTab,'drag-image'],[gBrowser.tabContainer,'movingtab']]){
    owner.setAttribute(attr,'true');await tick();const s=getComputedStyle(nativeTab);
    nativeCheck(attr+' releases native motion',s.transform.startsWith('matrix(0.9')&&s.scale==='0.9'&&s.rotate==='1deg');owner.removeAttribute(attr);
   }
   for(const p of ['transform','scale','rotate'])nativeTab.style.removeProperty(p);
   Services.prefs.setIntPref('ui.prefersReducedMotion',0);Services.prefs.setBoolPref('zzicon.click.press',false);nativeTab.removeAttribute('zen-essential');
   return cases;
  })();""")
  m.script("window.probeFavorite=gBrowser.addTab(nativeFixtureURL,{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.pinTab(probeFavorite);gZenPinnedTabManager.addToEssentials(probeFavorite,{replicating:true});gURLBar.blur();gURLBar.view.close();return true;");time.sleep(.3)
  m.script((ROOT/'tools/icon-hover-probe.js').read_text()+'\nreturn true;')
  r=m.script("return document.querySelector('#PanelUI-menu-button').getBoundingClientRect().toJSON();")
  move(r['x']+r['width']/2,r['y']+r['height']/2);time.sleep(.25)
  m.script("document.getElementById('tabContextMenu').openPopupAtScreen(500,300,true);return true;");time.sleep(.65)
  m.script("document.getElementById('tabContextMenu').hidePopup();PanelUI.hide();return true;")
  time.sleep(.4);move(1000,700)
  r=m.script("return document.querySelector('#zen-workspaces-button toolbarbutton').getBoundingClientRect().toJSON();")
  move(r['x']+r['width']/2,r['y']+r['height']/2);time.sleep(1.2);move(1000,700)
  r=m.script("const r=probeFavorite.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...r.toJSON(),hit:hit?.localName,hitFavorite:hit?.closest('.tabbrowser-tab')===probeFavorite,probeActive:!!window.__zzIconHoverProbe};")
  assert r['width']>0 and r['height']>0,r
  assert r['hitFavorite'] and r['probeActive'],r
  move(r['x']+r['width']/2,r['y']+r['height']/2);time.sleep(1.2);move(1000,700)
  # Wait for the probe's own timer/cleanup, not a race with the next command.
  for _ in range(100):
   if m.script('return !window.__zzIconHoverProbe;'):break
   time.sleep(.25)
  assert m.script('return !window.__zzIconHoverProbe;'),'Probe did not auto-stop'
  probe=json.loads(m.script("const t=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);t.init(null);t.addDataFlavor('text/plain');Services.clipboard.getData(t,Services.clipboard.kGlobalClipboard);const v={};t.getTransferData('text/plain',v);return v.value.QueryInterface(Ci.nsISupportsString).data;"))
  (OUT/'probe.json').write_text(json.dumps(probe,indent=2))
  assert probe['probe']=='icon-hover-v6' and probe['motion'] and probe['menus'] and probe['versions']['iconflow']
  assert probe['graphics']['windowRenderer'].startswith('WebRender') and probe['graphics']['features']['compositor']
  assert probe['graphics']['monitors'] and probe['graphics']['TargetFrameRate']>0
  scale_runs=[run for run in probe['motion'] if any(e.get('property')=='scale' for e in run['events'])]
  assert len(scale_runs)>=2,'Workspace and Favorite transition events missing'
  for run in scale_runs:
   assert len(run['compositorIntervalsMs'])>1 and all(t>=0 for t in run['compositorIntervalsMs']),run
   assert 0<=run['setupMs']<run['elapsedMs'] and 0<=run['sampleReadMs']<run['elapsedMs']
   assert all(isinstance(s['paintCount'],int) for s in run['samples'])
  assert probe['motion'][0]['ancestors']
  properties=[p for run in probe['motion'] for s in run['samples'] for a in s['animations']+s['hostAnimations'] for p in a['compositor'] if isinstance(a['compositor'],list)]
  assert properties and all(isinstance(p['runningOnCompositor'],bool) for p in properties),properties
  assert sum(any(p['property']=='scale' for s in run['samples'] for a in s['animations'] for p in a['compositor'] if isinstance(a['compositor'],list)) for run in probe['motion'])>=2,'Workspace and Favorite compositor capture missing'
  assert any('after500ms' in menu for menu in probe['menus'])
  assert probe['motion'][0]['samples'][-1]['ms']>=1000 and len(probe['motion'][0]['samples'])<=65
  assert len(probe['motion'][0]['frameIntervals'])>20 and 'hostAnimations' in probe['motion'][0]['samples'][0]
  assert m.script('return !window.__zzIconHoverProbe;')
  m.script("gBrowser.removeTab(probeFavorite,{skipPermitUnload:true,animate:false});return true;")
  result['probeAutoCopyCleanup']=True
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
  result['limitations']=['Linux headless; Windows compositor smoothness/antialiasing not measured','Media state is injected into Mediaflow here; real playback and control commands are checked by zen-mediaflow-controls-smoke.py']
  (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2),flush=True)
 finally:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
  log.close()
