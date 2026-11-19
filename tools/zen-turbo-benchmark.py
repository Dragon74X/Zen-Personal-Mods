#!/usr/bin/env python3
"""Bounded stock/Turbo comparison in a disposable Zen profile, with local fixtures.

No user profile or internet traffic. Reports measurements, not inferred speedups.
Requires the existing zen-smoke.py runtime dependency and ffmpeg for the media fixture.
"""
import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import runpy
import socket
import statistics
import subprocess
import tempfile
from threading import Thread
import time
from urllib.parse import urlsplit

Marionette = runpy.run_path(str(Path(__file__).with_name('zen-smoke.py')))['Marionette']
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3n8AAAAASUVORK5CYII=')


class Fixture(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    video = b''
    bytes_sent = 0
    requests = 0

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/image/'):
            time.sleep(.05)
            body, kind = PNG, 'image/png'
        elif path == '/video.webm':
            body, kind = self.video, 'video/webm'
        elif path == '/media':
            # Decoder/resource sharing can survive HTTP no-store. A distinct URL
            # prevents a prior mode's fully decoded video becoming the next sample.
            body = ('<title>Media benchmark</title><video id="v" preload="auto" src="/video.webm?'+urlsplit(self.path).query+'"></video>').encode()
            kind = 'text/html'
        else:
            body = ('<title>Network benchmark</title>' + ''.join(
                f'<img src="/image/{i}?{time.monotonic_ns()}">' for i in range(48))).encode()
            kind = 'text/html'
        status = 200
        bounds = re.fullmatch(r'bytes=(\d+)-(\d*)', self.headers.get('Range', ''))
        total = len(body)
        if bounds:
            start = int(bounds[1]); end = min(int(bounds[2]) if bounds[2] else total-1,total-1)
            if start >= total:
                self.send_response(416); self.send_header('Content-Length','0'); self.end_headers(); return
            body = body[start:end+1]; status = 206
        self.send_response(status)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        if kind == 'video/webm': self.send_header('Accept-Ranges','bytes')
        if bounds: self.send_header('Content-Range',f'bytes {start}-{end}/{total}')
        self.end_headers()
        try:
            self.wfile.write(body)
            Fixture.bytes_sent += len(body); Fixture.requests += 1
        except (BrokenPipeError,ConnectionResetError):
            pass

    def log_message(self,*args):
        pass

    def handle(self):
        try: super().handle()
        except ConnectionResetError: pass  # Normal decoder cancellation/keepalive closure.


def benchmark(m, root, origin):
    source=(root/'zen-turbo/zen-turbo.uc.js').read_text()
    # Expose the shipped pack definitions for reporting; ownership/startup stay intact.
    source=source.replace('  const SAVED =','  window.benchmarkPacks = PACKS;\n  const SAVED =')
    m.script('return gZenStartup.promiseInitialized.then(()=>true);')
    m.script("Services.prefs.setBoolPref('zzturbo.startup-warmup',false);return true;")
    m.script(source+'\nreturn true;')
    m.script("return new Promise(r=>setTimeout(()=>r(true),800));")
    packs=m.script('return benchmarkPacks;')
    results={'browser':m.script('return Services.appinfo.version;'),'packRequests':packs,
             'network':[],'media':[],'session':[],
             'limitations':'Linux headless, local HTTP/1.1, 50ms per image response; no WAN/DNS/TLS/HTTP2, Windows GPU, memory-pressure or crash-recovery timing claims. Session observations count native write-complete notifications, not CPU time saved. Media measurements are seek event latency, not presented-frame smoothness. Startup history warmup is disabled to isolate packs.'}

    def configure(enabled):
        m.script('for(const k of Object.keys(benchmarkPacks))Services.prefs.setBoolPref("zzturbo.pack-"+k,'+
                 ('true' if enabled else 'false')+' && k!=="gfx");return new Promise(r=>setTimeout(()=>r(true),150));')
        return m.script('''return Object.fromEntries(Object.values(benchmarkPacks).flat().map(([k])=>[k,
          Services.prefs.getPrefType(k)===128?Services.prefs.getBoolPref(k):Services.prefs.getPrefType(k)===64?Services.prefs.getIntPref(k):null]));''')

    results['stockPrefs']=configure(False)
    results['turboPrefs']=configure(True)
    # Alternating pair order avoids always giving the pack the warmer process.
    for pair in range(6):
        for enabled in ([False,True] if pair%2==0 else [True,False]):
            configure(enabled)
            m.call('Marionette:SetContext',{'value':'content'})
            before=Fixture.requests
            m.call('WebDriver:Navigate',{'url':origin+f'/network?pair={pair}&pack={enabled}'})
            data=m.script('const n=performance.getEntriesByType("navigation")[0];return {loadMs:n.loadEventEnd,resources:performance.getEntriesByType("resource").filter(r=>new URL(r.name).pathname.startsWith("/image/")).length};','content')
            assert data['resources']==48 and data['loadMs']>0, data
            results['network'].append({'pair':pair,'turbo':enabled,**data,'requests':Fixture.requests-before})
    for pair in range(3):
        for enabled in ([False,True] if pair%2==0 else [True,False]):
            configure(enabled)
            m.call('Marionette:SetContext',{'value':'content'})
            before=Fixture.bytes_sent
            m.call('WebDriver:Navigate',{'url':origin+f'/media?pair={pair}&pack={enabled}'})
            data=m.script('''return (async()=>{
              const v=document.getElementById('v'),wait=ms=>new Promise(r=>setTimeout(r,ms));
              for(let i=0;i<200 && v.readyState<3;i++)await wait(50);
              if(v.readyState<3 || !Number.isFinite(v.duration))throw Error('Media not ready');
              const times=[];
              for(const fraction of [.85,.2,.95,0]) {
                const start=performance.now();
                await new Promise((resolve,reject)=>{
                  const timer=setTimeout(()=>reject(Error('Seek timed out')),10000);
                  v.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});
                  v.currentTime=v.duration*fraction;
                });
                times.push(performance.now()-start);
              }
              return {duration:v.duration,seekMs:times};
            })();''','content')
            results['media'].append({'pair':pair,'turbo':enabled,**data,'servedBytes':Fixture.bytes_sent-before})
    for enabled in [False,True]:
        configure(enabled)
        m.call('Marionette:SetContext',{'value':'content'})
        m.call('WebDriver:Navigate',{'url':origin+'/session'})
        data=m.script('''return (async()=>{
          const writes=[],started=performance.now(),observer=()=>writes.push(performance.now()-started);
          const clock=ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
          Services.obs.addObserver(observer,'sessionstore-state-write-complete');
          const tab=gBrowser.selectedTab;
          try {
            for(let n=0;performance.now()-started<35000;n++) {
              gBrowser.setTabTitle(tab);SessionStore.setCustomTabValue(tab,'benchmark-dirty',String(n));
              await new Promise(r=>clock.setTimeout(r,1000));
            }
          } finally {Services.obs.removeObserver(observer,'sessionstore-state-write-complete');SessionStore.deleteCustomTabValue(tab,'benchmark-dirty');}
          return {durationMs:performance.now()-started,writeMs:writes};
        })();''')
        results['session'].append({'turbo':enabled,**data})
    results['networkMediansMs']={str(mode):statistics.median(r['loadMs'] for r in results['network'] if r['turbo']==mode) for mode in [False,True]}
    results['mediaSeekMediansMs']={str(mode):statistics.median(t for r in results['media'] if r['turbo']==mode for t in r['seekMs']) for mode in [False,True]}
    configure(False)
    results['restoredPrefs']=configure(False)==results['stockPrefs']
    assert results['restoredPrefs'], results
    return results


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zen',type=Path,required=True)
    args=parser.parse_args();root=Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix='zen-turbo-bench-') as directory:
        profile=Path(directory)
        video=profile/'fixture.webm'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i',
          'testsrc2=size=640x360:rate=30,noise=alls=25:allf=t','-t','20','-c:v','libvpx','-deadline','realtime',
          '-cpu-used','8','-b:v','8M','-an',str(video)],check=True,timeout=90)
        Fixture.video=video.read_bytes()
        server=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'browser.aboutwelcome.enabled':False,
               'zen.welcome-screen.seen':True,'zen.welcome-screen.enabled':False,'zzturbo.startup-warmup':False}
        (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k,v in prefs.items()))
        (profile/'sine-mods').mkdir();(profile/'sine-mods/zz-zen-turbo').symlink_to(root/'zen-turbo',target_is_directory=True)
        with (profile/'browser.log').open('w') as log:
            process=subprocess.Popen([str(args.zen.resolve()),'--headless','--no-remote','--profile',directory,
              '--marionette','--remote-allow-system-access','about:blank'],stdout=log,stderr=log)
            try:
                for n in range(100):
                    try: m=Marionette(port);break
                    except OSError:
                        if process.poll() is not None: raise RuntimeError((profile/'browser.log').read_text()[-2000:])
                        time.sleep(.2)
                else: raise RuntimeError('Zen did not start')
                m.sock.settimeout(120);m.call('WebDriver:SetTimeouts',{'script':90000})
                m.script('window.benchmarkChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI('+json.dumps((profile/'chrome.manifest').as_uri())+'),[["content","sine","sine-mods/"]]);return true;')
                result=benchmark(m,root,f'http://127.0.0.1:{server.server_port}')
                result['mediaFixtureBytes']=len(Fixture.video)
                print(json.dumps(result,indent=2))
            finally:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill();process.wait()
                server.shutdown();server.server_close();thread.join(timeout=2)


if __name__=='__main__':main()
