#!/usr/bin/env python3
"""Real Zen pointer/actor regression; disposable profile, no user profile access.

Requires ffmpeg and Pillow. Uses Zen's cloned native card markup with a silent
video fixture; the video, Mediaflow actors, hover layout,
and WebDriver pointer events are real. Does not test Windows window dragging.
"""
import argparse
import json, runpy, socket, subprocess, tempfile, time
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from threading import Thread
ROOT=Path(__file__).resolve().parents[1]
# Exact geometry rules from Arc 2.0, loaded AFTER Mediaflow to exercise priority:
# https://github.com/YashjitPal/Arc-2.0/blob/eaf001a7a2d9c797ba3af41fd50feefc657679b2/modules/chrome/media-player.css
ARC_MEDIA_HOVER='''
@media not (-moz-pref("arc-disable-media-player-styles")) {
  @media (-moz-pref("arc.media-controls-toolbar-bottom")) {
    #zen-media-controls-toolbar { order: 1 !important; }
    #zen-media-controls-toolbar:hover + #zen-sidebar-foot-buttons {
      transform: translateY(-36px);
      transition: transform 0.2s ease-in-out !important;
    }
  }
  @media not (-moz-pref("arc.media-controls-toolbar-bottom")) {
    #zen-media-controls-toolbar {
      &:hover { height: 120px !important; margin-top: -10px !important; }
    }
  }
  #zen-media-controls-toolbar { transition: height 0.25s ease-in-out !important; }
  #zen-media-controls-toolbar {
    & .show-on-hover {
      max-height: unset !important; opacity: 1 !important;
      transform: translateY(0) !important; padding-right: 6px;
      pointer-events: none;
      transition: max-height 0.5s ease, opacity 0.5s ease, transform 0.5s ease, padding 0.5s ease;
    }
  }
  #zen-media-controls-toolbar {
    .zen-media-controls-hbox {
      order: 0 !important; height: 0 !important; opacity: 0;
      transition: all 0.25s !important; pointer-events: none;
    }
    &:hover {
      .zen-media-controls-hbox {
        height: fit-content !important; opacity: 1 !important; pointer-events: all;
      }
    }
  }
  .zen-media-main-vbox > vbox { order: 1 !important; }
  #zen-sidebar-foot-buttons { margin-bottom: 5px !important; margin-top: 7px; }
}
'''
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zen',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
Marionette=runpy.run_path(str(ROOT/'tools/zen-smoke.py'))['Marionette']
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='mediaflow-controls-') as d:
    p=Path(d);mod=p/'chrome/sine-mods/zz-mediaflow';mod.parent.mkdir(parents=True);mod.symlink_to(ROOT/'mediaflow',target_is_directory=True)
    (mod.parent/'zz-iconflow').symlink_to(ROOT/'iconflow',target_is_directory=True)
    subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x180:r=15','-t','120','-c:v','libvpx','-deadline','realtime','-b:v','50k',str(p/'video.webm')],check=True)
    (p/'index.html').write_text('<video src="/video.webm" controls preload="none" loop></video>')
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(p)))
    Thread(target=server.serve_forever,daemon=True).start()
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'browser.aboutwelcome.enabled':False,'zen.welcome-screen.seen':True,'zen.welcome-screen.enabled':False,'sine.auto-update':False,'media.autoplay.default':0,'media.autoplay.blocking_policy':0}
    (p/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k,v in prefs.items()))
    with (OUT/'browser.log').open('w') as log:
        process=subprocess.Popen([str(args.zen.resolve()),'--headless','--no-remote','--profile',d,'--marionette','--remote-allow-system-access','about:blank'],stdout=log,stderr=log)
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                except OSError:time.sleep(.2)
            m=Marionette(port);m.script('return gZenStartup.promiseInitialized.then(()=>true);')
            m.script('window.mediaSmokeChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI('+json.dumps((p/'chrome.manifest').as_uri())+'),'+json.dumps([['content','sine',mod.parent.as_uri()+'/']])+');return true;')
            defaults={r['property']:r['defaultValue'] for r in json.loads((ROOT/'mediaflow/preferences.json').read_text()) if 'property' in r and 'defaultValue' in r}
            m.script('for(const [k,v] of Object.entries('+json.dumps(defaults)+'))Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
            m.script("window.mediaErrors=[];window.addEventListener('error',e=>mediaErrors.push(e.message));return true;")
            m.script((ROOT/'mediaflow/mediaflow.uc.js').read_text()+'\nreturn true;')
            m.call('Marionette:SetContext',{'value':'content'});m.call('WebDriver:Navigate',{'url':f'http://127.0.0.1:{server.server_port}/index.html'})
            m.script('document.querySelector("video").currentTime=35;document.querySelector("video").play();return true;',context='content')
            time.sleep(1)
            m.script('window.mediaSourceTab=gBrowser.selectedTab;gBrowser.selectedTab=window.mediaOtherTab=gBrowser.addTab("about:blank",{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});return true;')
            time.sleep(2)
            print('SOURCE',m.script('return {active:ZzMediaflowController.getActiveBC()?.id,source:mediaSourceTab.linkedBrowser.browsingContext.id,paused:document.querySelector("#zen-sidebar-pip-container").getAttribute("zzmf-paused")};'),flush=True)
            # Native card markup, but never force the preview's normal geometry.
            m.script("const bar=document.getElementById('zen-media-controls-toolbar');bar.append(document.getElementById('zen-media-card-template').content.cloneNode(true));bar.hidden=false;return true;")
            m.script("Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI("+json.dumps((ROOT/'mediaflow/userChrome.css').as_uri())+"),1);return true;")
            # The actual Morph engine remains enabled elsewhere while media
            # controls retain their original paint and commands.
            icon_defaults={r['property']:r['defaultValue'] for r in json.loads((ROOT/'iconflow/preferences.json').read_text()) if 'property' in r and 'defaultValue' in r}
            m.script('for(const[k,v]of Object.entries('+json.dumps(icon_defaults)+'))Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);Services.prefs.setIntPref("zzicon.set",4);Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI("chrome://sine/content/zz-iconflow/userChrome.css"),1);return true;')
            m.script((ROOT/'iconflow/iconflow-morph.uc.js').read_text()+'\nreturn true;')
            time.sleep(.5)
            assert m.script("return __zziconMorphInstance.records.size>0&&!document.querySelector('#zen-sidebar-pip-container [zzicon-motion],#zen-media-controls-toolbar [zzicon-motion],#zen-media-controls-toolbar [zzicon-motion-host]');"),'Media glyph ownership not released'
            def video():return m.script('const v=document.querySelector("video");return {time:v.currentTime,paused:v.paused};',context='content')
            def rect(selector='#zen-sidebar-pip-container'):
                return m.script('return document.querySelector('+json.dumps(selector)+').getBoundingClientRect().toJSON();')
            def center(selector):
                r=rect(selector);return round(r['x']+r['width']/2),round(r['y']+r['height']/2)
            def pointer(actions):
                m.call('Marionette:SetContext',{'value':'chrome'})
                m.call('WebDriver:PerformActions',{'actions':[{'type':'pointer','id':'mediaflow-test','parameters':{'pointerType':'mouse'},'actions':actions}]})
            def move(x,y,pause=0):pointer([{'type':'pointerMove','duration':0,'x':x,'y':y},{'type':'pause','duration':pause}])
            def click(selector,hold=30):
                move(*center(selector))
                pointer([{'type':'pointerDown','button':0},{'type':'pause','duration':hold},{'type':'pointerUp','button':0},{'type':'pause','duration':150}])
            def stable(before,after):
                assert all(abs(before[k]-after[k])<1 for k in ['x','y','width','height']), (before,after)
            def reset():
                move(1000,250)
                m.script("document.activeElement?.blur();gBrowser.selectedTab=mediaOtherTab;return true;")
                time.sleep(.5)
            # Exercise real entry from the bar below, including its collapsing
            # rows and the 300ms growth delay. Timer expiry must not swap the
            # card's top edge for its toolbar's top edge.
            boundary_cases=[]
            for expanded in [False,True]:
                m.script('Services.prefs.setBoolPref("zzmedia.bar.always-expanded",'+json.dumps(expanded)+');return true;')
                for direction in ['below','above']:
                    reset()
                    if direction=='below':move(*center('.zen-media-controls-hbox'),pause=700)
                    r=rect();x=round(r['x']+r['width']/2);y=round(r['bottom']-2) if direction=='below' else round(r['top']+2)
                    m.script("window.boundarySamples=[];window.boundaryStart=performance.now();function boundaryTick(){const p=document.getElementById('zen-sidebar-pip-container'),r=p.getBoundingClientRect();boundarySamples.push({t:performance.now()-boundaryStart,bottom:r.bottom,width:r.width,hover:p.matches(':hover')});if(performance.now()-boundaryStart<1700)requestAnimationFrame(boundaryTick);}requestAnimationFrame(boundaryTick);return true;")
                    move(x,y,pause=800);hovered=rect()
                    assert abs(hovered['bottom']-r['bottom'])<1,(expanded,direction,r,hovered)
                    assert hovered['width']>r['width']*1.95,(expanded,direction,hovered)
                    # Exit sideways while the bar is folded; its return must
                    # interpolate instead of jumping by the height of its rows.
                    move(1000,250,pause=850)
                    samples=m.script('return boundarySamples;')
                    active=[s for s in samples if s['hover']]
                    assert active and max(s['bottom'] for s in active)-min(s['bottom'] for s in active)<1,(expanded,direction,samples)
                    resting=rect();distance=abs(resting['bottom']-hovered['bottom'])
                    if distance>2:
                        middle=[s for s in samples if not s['hover'] and min(resting['bottom'],hovered['bottom'])+1<s['bottom']<max(resting['bottom'],hovered['bottom'])-1]
                        assert len(middle)>=3,('Return snapped',expanded,direction,samples)
                    # Wait beyond the tracking tail and trigger an unrelated
                    # layout update: idle and active geometry must agree.
                    time.sleep(.4);before=rect();m.script('dispatchEvent(new Event("resize"));return true;');time.sleep(.4);stable(before,rect())
                    boundary_cases.append({'expanded':expanded,'direction':direction,'hoverBottomRange':max(s['bottom'] for s in active)-min(s['bottom'] for s in active),'returnDistance':distance})
            m.script('Services.prefs.setBoolPref("zzmedia.bar.always-expanded",false);return true;')
            reset()
            # Hover the MUSIC BAR below the preview, without hovering the
            # preview itself. The former tests missed Arc resizing this anchor.
            m.script('window.arcMediaFixture=Services.io.newURI("data:text/css,"+encodeURIComponent('+json.dumps(ARC_MEDIA_HOVER)+'));Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(arcMediaFixture,1);return true;')
            arc_cases=[]
            for bottom in [False,True]:
                for still,expanded,room in [(True,False,False),(True,True,False),(True,False,True),(False,True,False),(False,False,False)]:
                    m.script('for(const[k,v]of Object.entries('+json.dumps({'arc.media-controls-toolbar-bottom':bottom,'zzmedia.bar.still-on-hover':still,'zzmedia.bar.always-expanded':expanded,'zzmedia.preview.make-room':room})+'))Services.prefs.setBoolPref(k,v);return true;')
                    reset();time.sleep(.3);before=rect();bar=rect('#zen-media-controls-toolbar')
                    m.script("window.barSamples=[];window.barStart=performance.now();function barTick(){const p=document.getElementById('zen-sidebar-pip-container'),r=p.getBoundingClientRect(),b=document.getElementById('zen-media-controls-toolbar'),s=getComputedStyle(b),br=b.getBoundingClientRect();barSamples.push({t:performance.now()-barStart,bottom:r.bottom,barHeight:br.height,margin:parseFloat(s.marginTop),hover:b.matches(':hover'),videoHover:p.matches(':hover')});if(performance.now()-barStart<1700)requestAnimationFrame(barTick);}requestAnimationFrame(barTick);return true;")
                    move(round(bar['x']+bar['width']/2),round(bar['bottom']-3),pause=800)
                    hovered=rect();move(1000,250,pause=950)
                    samples=m.script('return barSamples;');travel=max(s['bottom'] for s in samples)-min(s['bottom'] for s in samples)
                    assert any(s['hover'] for s in samples) and not any(s['videoHover'] for s in samples),(bottom,still,expanded,room,samples)
                    if still or expanded:
                        assert travel<1,(bottom,still,expanded,room,travel)
                        assert max(s['barHeight'] for s in samples)-min(s['barHeight'] for s in samples)<1,samples
                        margin=m.script("const b=document.getElementById('zen-media-controls-toolbar');return {actual:parseFloat(getComputedStyle(b).marginTop),reserved:parseFloat(b.style.getPropertyValue('--zzmf-reserve'))||0};")
                        assert abs(margin['actual']-margin['reserved'])<1,margin
                        assert (margin['reserved']>0)==room,margin
                        assert m.script("const s=getComputedStyle(document.querySelector('.zen-media-controls-hbox'));return parseFloat(s.height)>0&&s.opacity==='1'&&s.pointerEvents==='auto';")
                    else:
                        assert travel>10,('Off failed to release Arc layout',bottom,travel)
                    arc_cases.append({'bottomPlacement':bottom,'still':still,'expanded':expanded,'room':room,'previewTravel':travel})
            m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).unregisterSheet(arcMediaFixture,1);for(const k of ["arc.media-controls-toolbar-bottom","zzmedia.bar.always-expanded","zzmedia.preview.make-room"])Services.prefs.setBoolPref(k,false);Services.prefs.setBoolPref("zzmedia.bar.still-on-hover",true);return true;')
            reset()
            # Canvas hover must grow; the controls' transparent full-size layer
            # must not claim the pointer and cancel the growth timer.
            reset();resting=rect()
            move(round(resting['x']+resting['width']/2),round(resting['y']+25),700)
            grown=rect();assert grown['width']>resting['width']*1.5,(resting,grown)
            reset();stable(resting,rect())
            move(*center('.zzmf-pip-play'),pause=800)
            control_grown=rect();assert control_grown['width']>resting['width']*1.95,(resting,control_grown)
            assert m.script("return !document.getElementById('zen-sidebar-pip-container').hasAttribute('zzmf-interacting');")
            reset();r=rect();move(round(r['x']+r['width']/2),round(r['y']+25),350)
            mid_growth=rect();move(*center('.zzmf-pip-play'),pause=600)
            continued=rect();assert continued['width']>resting['width']*1.95,(mid_growth,continued)
            reset();stable(resting,rect())
            # The preview lives outside the toolbox. Hide it with the sidebar,
            # including while a control was focused, then restore without a hold.
            m.script("document.querySelector('.zzmf-pip-play').focus();document.documentElement.setAttribute('zen-compact-mode','true');Services.prefs.setBoolPref('zen.view.compact.hide-tabbar',true);const t=document.getElementById('navigator-toolbox');for(const a of ['zen-has-hover','zen-user-show','zen-has-empty-tab','flash-popup','has-popup-menu','movingtab','zen-compact-mode-active'])t.removeAttribute(a);return true;")
            time.sleep(.2)
            assert m.script("return getComputedStyle(document.getElementById('zen-sidebar-pip-container')).visibility==='hidden'&&!document.getElementById('zen-sidebar-pip-container').hasAttribute('zzmf-interacting');")
            m.script("document.documentElement.setAttribute('zen-compact-mode','false');return true;")
            reset()
            results=[]
            for delay in [40,250,340,700]:
                reset()
                resting=rect()
                assert resting['width']>100,resting
                move(*center('.zzmf-pip-play'),pause=delay)
                # Reacquire its current position, then hold across the growth boundary.
                was=video()
                click('.zzmf-pip-play',hold=140)
                after=video();assert after['paused'] != was['paused'], (delay,was,after)
                assert m.script("return gBrowser.selectedTab===mediaOtherTab;"), 'control click selected source'
                held=rect()
                move(1000,250,400)
                stable(held,rect())
                for cls,delta in [('forward',10),('back',-10)]:
                    # Pause first so the seek distance is exact.
                    if not video()['paused']:click('.zzmf-pip-play')
                    before=video();click('.zzmf-pip-'+cls);after=video()
                    assert abs(after['time']-before['time']-delta)<.01,(cls,before,after)
                    stable(held,rect())
                reset();stable(resting,rect())
                results.append({'hoverDelayMs':delay,'toggle':True,'seeks':2,'heldFocusGeometry':True,'releasedGeometry':True})
            # Keyboard activation remains native; the canvas still opens its source tab.
            m.script("document.querySelector('.zzmf-pip-play').focus();return true;")
            before=video()
            m.call('Marionette:SetContext',{'value':'chrome'})
            m.call('WebDriver:PerformActions',{'actions':[{'type':'key','id':'keys','actions':[{'type':'keyDown','value':' '},{'type':'keyUp','value':' '}]}]})
            time.sleep(.2);assert video()['paused']!=before['paused']
            reset();r=rect();move(round(r['x']+r['width']/2),round(r['y']+25))
            pointer([{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}])
            assert m.script('return gBrowser.selectedTab===mediaSourceTab;')
            reset()
            # Controlled movement tests probe coverage independently of the layout fix.
            m.script('const s=document.createElement("style");s.id="probe-fixture";s.textContent="#zen-sidebar-pip-container{display:block!important;visibility:visible!important;opacity:1!important;transform:none!important;transition:none!important;left:400px!important;top:120px!important;bottom:auto!important;width:320px!important;height:180px!important}.zzmf-pip-controls{opacity:1!important}";document.documentElement.append(s);return true;')
            m.script((ROOT/'tools/mediaflow-controls-probe.js').read_text()+'\nreturn true;')
            for cls in ['play','forward','back','play']:click('.zzmf-pip-'+cls)
            x,y=center('.zzmf-pip-play')
            move(x,y);pointer([{'type':'pointerDown','button':0}])
            m.script("document.getElementById('probe-fixture').textContent+='#zen-sidebar-pip-container{left:800px!important}';return true;")
            time.sleep(.2)
            pointer([{'type':'pointerUp','button':0}])
            # A second press at the former control position, now over remote content.
            pointer([{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}])
            time.sleep(30)
            report=json.loads(m.script('const t=Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);t.init(null);t.addDataFlavor("text/plain");Services.clipboard.getData(t,Services.clipboard.kGlobalClipboard);const value={};t.getTransferData("text/plain",value);return value.value.QueryInterface(Ci.nsISupportsString).data;'))
            (OUT/'probe.json').write_text(json.dumps(report,indent=2))
            commands=[e['action'] for e in report['events'] if e['type']=='command']
            assert commands==['toggle','seekBy','seekBy','toggle'],commands
            downs=[e for e in report['events'] if e['type']=='pointerdown']
            ups=[e for e in report['events'] if e['type']=='pointerup']
            assert len(downs)==len(ups)==6,(downs,ups)
            assert downs[-2]['target']=='zzmf-pip-play' and ups[-2]['target']=='browser',(downs[-2],ups[-2])
            assert downs[-1]['target']=='browser' and downs[-1]['inPreviousPreview'],downs[-1]
            assert report['probe']=='mediaflow-controls-v2'
            assert report['installedVersion']==json.loads((ROOT/'mediaflow/theme.json').read_text())['version']
            assert report['snapshots'][-1]['reason']=='finished'
            assert not report['droppedEvents'] and not report['droppedSnapshots']
            assert m.script('return !window.__zzmfControlProbe;')
            assert m.script('return !Object.hasOwn(ZzMediaflowController.getActiveBC().currentWindowGlobal.getActor("ZzMediaflow"),"sendAsyncMessage");')
            # Original glyphs actually paint with Morph enabled. Hide only the
            # glyph background for each pixel comparison, retaining its hit box.
            from PIL import ImageChops,ImageStat
            paints=[]
            for name in ['popout','close','back','play','forward','mute']:
                info=m.script("const b=document.querySelector('.zzmf-pip-"+name+"'),s=getComputedStyle(b);return {rect:b.getBoundingClientRect().toJSON(),image:s.backgroundImage,size:s.backgroundSize,owned:b.hasAttribute('zzicon-motion-host')};")
                assert not info['owned'] and 'chrome://' in info['image'] and '/morph/' not in info['image'],info
                before=m.shot();m.script("document.querySelector('.zzmf-pip-"+name+"').style.backgroundImage='none';return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))));");after=m.shot()
                r=info['rect'];factor=before.width/m.script('return innerWidth;');crop=tuple(round(r[k]*factor) for k in ['left','top','right','bottom'])
                amount=max(ImageStat.Stat(ImageChops.difference(before,after).crop(crop)).mean)
                assert amount>0,(name,'original glyph did not paint',info)
                m.script("document.querySelector('.zzmf-pip-"+name+"').style.removeProperty('background-image');return true;")
                paints.append({'control':name,'pixelDifference':amount,'size':info['size']})
            assert m.script('return mediaErrors;')==[],m.script('return mediaErrors;')
            (OUT/'checks.json').write_text(json.dumps({'runtimeErrors':0,'arcBarHover':arc_cases,'boundaryCases':boundary_cases,'canvasGrowth':True,'controlHoverGrowth':[resting['width'],control_grown['width']],'crossingControlDuringGrowth':[mid_growth['width'],continued['width']],'originalGlyphPaints':paints,'sidebarHide':True,'hoverCases':results,'keyboard':True,'canvasNavigation':True,'probe':{'presses':6,'commands':4,'misses':2,'autoCopy':True,'cleanup':True}},indent=2))
            m.shot().save(OUT/'controls.png')
            print('PASS: control hover growth, 6 original glyph paints, 4 hover timings, 8 seeks, focus hold/release, keyboard, canvas navigation; probe captured 6 presses / 4 commands / 2 misses and auto-copied after cleanup.',flush=True)
        finally:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()
            server.shutdown()
