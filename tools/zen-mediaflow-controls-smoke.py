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
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zen',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
Marionette=runpy.run_path(str(ROOT/'tools/zen-smoke.py'))['Marionette']
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='mediaflow-controls-') as d:
    p=Path(d);mod=p/'chrome/sine-mods/zz-mediaflow';mod.parent.mkdir(parents=True);mod.symlink_to(ROOT/'mediaflow',target_is_directory=True)
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
            defaults={r['property']:r['defaultValue'] for r in json.loads((ROOT/'mediaflow/preferences.json').read_text()) if 'property' in r and 'defaultValue' in r}
            m.script('for(const [k,v] of Object.entries('+json.dumps(defaults)+'))Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
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
            time.sleep(.5)
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
            (OUT/'checks.json').write_text(json.dumps({'hoverCases':results,'keyboard':True,'canvasNavigation':True,'probe':{'presses':6,'commands':4,'misses':2,'autoCopy':True,'cleanup':True}},indent=2))
            m.shot().save(OUT/'controls.png')
            print('PASS: 4 hover timings, 8 seeks, focus hold/release, keyboard, canvas navigation; probe captured 6 presses / 4 commands / 2 misses and auto-copied after cleanup.',flush=True)
        finally:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()
            server.shutdown()
