#!/usr/bin/env python3
"""Isolated Zen runtime check. Requires Pillow for PNG comparisons.

python tools/zen-smoke.py --zen /path/to/zen --arc /path/to/Arc-2.0
Uses a temporary profile; never attaches to the user's browser. Screenshots
check page visibility and geometry; compositor-only backdrop blur is not certified.
"""
import argparse
import base64
import io
import json
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
from urllib.parse import quote

from PIL import Image, ImageChops, ImageStat


class Marionette:
    def __init__(self, port):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=30)
        self.serial = 0
        self.read()
        self.call("WebDriver:NewSession", {"capabilities": {}})

    def read(self):
        length = b""
        while not length.endswith(b":"):
            chunk = self.sock.recv(1)
            if not chunk:
                raise ConnectionError("Marionette closed")
            length += chunk
        data, size = b"", int(length[:-1])
        while len(data) < size:
            chunk = self.sock.recv(size - len(data))
            if not chunk:
                raise ConnectionError("Marionette closed")
            data += chunk
        return json.loads(data)

    def call(self, name, args=None):
        self.serial += 1
        data = json.dumps([0, self.serial, name, args or {}]).encode()
        self.sock.sendall(str(len(data)).encode() + b":" + data)
        response = self.read()
        if response[2]:
            raise RuntimeError(response[2])
        return response[3]

    def script(self, source, context="chrome"):
        self.call("Marionette:SetContext", {"value": context})
        return self.call("WebDriver:ExecuteScript", {
            "script": source, "args": [], "newSandbox": False,
            "sandbox": "default", "filename": "zen-mod-smoke",
        })["value"]

    def shot(self):
        self.call("Marionette:SetContext", {"value": "chrome"})
        data = self.call("WebDriver:TakeScreenshot", {"id": None, "full": False, "scroll": False})["value"]
        return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


def check_icons(m, root):
    # Use Sine's chrome mapping and Gecko's default SVG policy. A data/file
    # sprite can decode successfully yet lose all contextual fill or stroke.
    m.script("return gZenStartup.promiseInitialized.then(()=>true);")
    m.script("""Services.prefs.setBoolPref('svg.context-properties.content.enabled',false);
      Services.prefs.setBoolPref('zzicon.animate',true);Services.prefs.setIntPref('zzicon.set',0);
      const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      window.zzsmokeIconCSS=Services.io.newURI('chrome://sine/content/zz-iconflow/userChrome.css');
      ss.loadAndRegisterSheet(zzsmokeIconCSS,ss.USER_SHEET);return true;""")
    m.script((root / 'iconflow/iconflow-parts.uc.js').read_text() + '\nreturn true;')
    info = m.script("""return (async()=>{
      const selectors=['#back-button .toolbarbutton-icon','#reload-button .toolbarbutton-icon',
        '#PanelUI-menu-button .toolbarbutton-icon','#tabs-newtab-button .toolbarbutton-icon'];
      for(let i=0;i<100 && !selectors.every(s=>document.querySelector(s)?.hasAttribute('zzicon-own'));i++)
        await new Promise(r=>setTimeout(r,50));
      const native=selectors.map(s=>getComputedStyle(document.querySelector(s)).backgroundImage);
      if(native.some(s=>!s.includes('resource://zz-iconflow-')))throw new Error('Native icon cache missing: '+JSON.stringify(native));
      window.zzsmokeIconNative=native;
      Services.prefs.setIntPref('zzicon.set',2);await new Promise(r=>setTimeout(r,150));
      const circuit=selectors.map(s=>getComputedStyle(document.querySelector(s)).backgroundImage);
      if(circuit.some(s=>!s.includes('chrome://sine/content/zz-iconflow/')))throw new Error('Circuit lost chrome scope');
      Services.prefs.setIntPref('zzicon.set',3);await new Promise(r=>setTimeout(r,150));
      const clean=selectors.map(s=>getComputedStyle(document.querySelector(s)).backgroundImage);
      if(clean.some(s=>!s.includes('/icons/clean/')))throw new Error('Clean set not selected: '+JSON.stringify(clean));
      const cleanSize=selectors.map(s=>getComputedStyle(document.querySelector(s)).backgroundSize);
      if(cleanSize.join('|')!=='100% 100%|9600% 100%|9600% 100%|100% 100%')throw new Error('Clean frame sizing changed');
      Services.prefs.setIntPref('zzicon.library.style',11);
      const library=getComputedStyle(document.querySelector('#zen-library-button .zen-library-sprite'),'::before');
      if(!library.backgroundImage.includes('/icons/clean/firefox-library.svg') || library.backgroundSize!=='9600% 100%')throw new Error('Library did not follow clean set');
      const box=document.createElementNS('http://www.w3.org/1999/xhtml','div');
      box.id='zzsmoke-icons';box.style.cssText='position:fixed;left:400px;top:100px;z-index:2147483647;background:black;display:grid;grid-template-columns:repeat(8,40px);gap:4px;padding:4px;';
      document.documentElement.append(box);
      const cells=[];
      for(const [index,url] of [...native,...circuit,...clean].entries())for(const [width,height] of [[16,16],[24,16],[16,24]])for(const frame of [0,95]){
        const el=document.createElementNS(box.namespaceURI,'div');el.className='toolbarbutton-1';
        el.style.cssText=`width:${width}px;height:${height}px;padding:0;background-image:${url};background-size:${index>=4&&(index%4===0||index%4===3)?100:9600}% 100%;background-position:${frame/95*100}% 0;background-repeat:no-repeat;fill:lime;stroke:lime;fill-opacity:1;stroke-opacity:1;-moz-context-properties:fill,fill-opacity,stroke,stroke-opacity;`;
        box.append(el);cells.push({index,width,height,frame,rect:el.getBoundingClientRect().toJSON()});
      }
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return cells;
    })();""")
    pixels = m.shot()
    for case in info:
        r = case['rect']
        crop = pixels.crop((round(r['left']), round(r['top']), round(r['right']), round(r['bottom'])))
        painted = sum(g > red + 40 and g > b + 40 for red, g, b in crop.get_flattened_data())
        assert painted >= 8, (case, painted)
    cleanup = m.script("""return (async()=>{
      const uri=Services.io.newURI(zzsmokeIconNative[0].slice(5,-2));
      const res=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
      const dir=Services.io.newURI(res.resolveURI(uri)).QueryInterface(Ci.nsIFileURL).file.parent.path;
      await window.__zziconPartsInstance.retire();
      const clean=!res.hasSubstitution(uri.host) && !await IOUtils.exists(dir);
      document.getElementById('zzsmoke-icons').remove();
      Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).unregisterSheet(zzsmokeIconCSS,1);
      Services.prefs.clearUserPref('svg.context-properties.content.enabled');
      Services.prefs.setIntPref('zzicon.set',0);
      delete window.zzsmokeIconCSS;delete window.zzsmokeIconNative;return clean;
    })();""")
    assert cleanup, 'Icon cache survives retirement'
    return len(info)


def check_restored_chrome(m, root):
    """Native images and flex-owned window glyphs must actually paint."""
    m.script("document.getElementById('zzsmoke-hide-sidebar-content').sheet.disabled=true;return true;")
    m.script((root/'iconflow/iconflow-parts.uc.js').read_text()+'\nreturn true;')
    setup=m.script("""return (async()=>{
      window.restoreOriginalTab=gBrowser.selectedTab;
      window.restoreTab=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});gBrowser.selectedTab=restoreTab;
      document.documentElement.setAttribute('zen-compact-mode','false');document.documentElement.setAttribute('zen-sidebar-expanded','true');
      await new Promise(r=>setTimeout(r,500));
      return !window.__zziconMorphInstance&&!document.querySelector('.zzicon-morph-glyph,[data-zz-morph-slot]');
    })();""")
    assert setup, 'retired presentation remains'
    m.script((root/'glassflow/glassflow-edges.uc.js').read_text()+'\nreturn true;')
    m.script("window.restoreHide=Services.io.newURI('data:text/css,'+encodeURIComponent(':root#main-window #tabbrowser-tabs .tab-close-button[zzsmoke-hidden]{visibility:hidden!important}'));Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(restoreHide,1);return true;")
    checks=[]
    def painted(box, shown, hidden):
        scale=shown.width/m.script('return window.innerWidth;')
        crop=tuple(round(v*scale) for v in (box['left'],box['top'],box['right'],box['bottom']))
        assert min(crop)>=0 and crop[2]>crop[0] and crop[3]>crop[1],crop
        return max(ImageStat.Stat(ImageChops.difference(shown,hidden).crop(crop)).mean)>0
    for motion in [False,True]:
        for left in [False,True]:
            m.script('Services.prefs.setBoolPref("zzglass.motion.enabled",'+json.dumps(motion)+');Services.prefs.setBoolPref("zzglass.tabs.close-left",'+json.dumps(left)+');InspectorUtils.addPseudoClassLock(restoreTab,":hover");return true;')
            time.sleep(.5)
            info=m.script("""const e=restoreTab.querySelector('.tab-close-button'),s=getComputedStyle(e);
              window.restoreClose=e;window.restoreCloseStyle=e.getAttribute('style');
              return {box:e.getBoundingClientRect().toJSON(),visibility:s.visibility,opacity:s.opacity,mask:s.maskImage};""")
            assert info['visibility']=='visible' and float(info['opacity'])>0 and info['mask']=='none',info
            shown=m.shot();m.script("restoreClose.setAttribute('zzsmoke-hidden','');return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))));");hidden=m.shot()
            assert painted(info['box'],shown,hidden),(motion,left,'close glyph did not paint',info)
            m.script("restoreClose.removeAttribute('zzsmoke-hidden');if(restoreCloseStyle===null)restoreClose.removeAttribute('style');else restoreClose.setAttribute('style',restoreCloseStyle);InspectorUtils.removePseudoClassLock(restoreTab,':hover');return true;")
            time.sleep(.3);checks.append({'closeMotion':motion,'closeLeft':left,'painted':True})
    # Discard a real background tab: its pending fade used to replace the
    # spacing transition. Sample native animation times and rendered geometry.
    close_motion=m.script("""return (async()=>{
      const S=Services.prefs,wait=ms=>new Promise(r=>setTimeout(r,ms));
      const keys=['zzglass.motion.enabled','zzglass.instant-ui','zzglass.pending.enabled','zzglass.motion.profile','zzglass.tabs.close-left','ui.prefersReducedMotion'];
      const saved=keys.map(k=>{const had=S.prefHasUserValue(k);return [k,had,had?(S.getPrefType(k)===S.PREF_BOOL?S.getBoolPref(k):S.getIntPref(k)):null];});
      S.setBoolPref(keys[0],true);S.setBoolPref(keys[1],false);S.setBoolPref(keys[2],true);S.setIntPref(keys[5],0);
      const tab=gBrowser.addTab('data:text/html,<title>Close spacing test</title>',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});
      const stack=tab.querySelector('.tab-icon-stack'),label=tab.querySelector('.tab-label-container'),close=tab.querySelector('.tab-close-button');
      const cases=[],gates=[],rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
      try {
        await wait(800);
        for(const pending of [false,true]){
          if(pending){gBrowser.discardBrowser(tab);await wait(200);if(!tab.hasAttribute('pending'))throw new Error('Native discard failed');}
          for(const [profile,duration]of [150,210,240,270,290].entries())for(const left of [false,true]){
            S.setIntPref(keys[3],profile);S.setBoolPref(keys[4],left);await wait(350);
            const el=left?stack:label,property=left?'marginInlineStart':'marginInlineEnd';
            const anchor=rect(close),origin=rect(label),directions=[];
            for(const hover of [true,false]){
              InspectorUtils[hover?'addPseudoClassLock':'removePseudoClassLock'](tab,':hover');
              const slide=el.getAnimations().find(a=>a.transitionProperty?.startsWith('margin-'));
              const fade=close.getAnimations().find(a=>a.transitionProperty==='opacity');
              if(!slide||!fade||Math.abs(slide.effect.getTiming().duration-duration)>.01)throw new Error('Missing close transition '+JSON.stringify({pending,profile,left,hover,duration:slide?.effect.getTiming().duration,fade:!!fade,transition:getComputedStyle(el).transition}));
              const animations=[slide,fade];animations.forEach(a=>a.pause());
              const frames=[];
              for(const fraction of [0,.25,.5,.75,1]){
                animations.forEach(a=>a.currentTime=duration*fraction);
                const margin=parseFloat(getComputedStyle(el)[property]),box=rect(label),hit=rect(close);
                if(hit.some((v,i)=>Math.abs(v-anchor[i])>.02))throw new Error('Close target moved');
                const travel=left?box[0]-origin[0]:origin[2]-box[2];
                if(Math.abs(travel-margin)>.05)throw new Error('Label did not follow spacing');
                frames.push({margin,opacity:+getComputedStyle(close).opacity});
              }
              const end=hover?24:0;
              if(Math.abs(frames.at(-1).margin-end)>.02||new Set(frames.map(f=>f.margin.toFixed(2))).size<3)throw new Error('Spacing jumped');
              animations.forEach(a=>a.finish());directions.push({hover,frames});
            }
            cases.push({pending,profile,left,duration,directions});
          }
        }
        S.setBoolPref(keys[4],true);
        for(const [name,key,value]of [['disabled',keys[0],false],['instant',keys[1],true],['reduced',keys[5],1]]){
          const set=v=>S[typeof v==='boolean'?'setBoolPref':'setIntPref'](key,v);set(value);await wait(350);
          InspectorUtils.addPseudoClassLock(tab,':hover');
          if(stack.getAnimations().some(a=>a.transitionProperty?.startsWith('margin-'))||parseFloat(getComputedStyle(stack).marginInlineStart)!==24)throw new Error(name+' did not disable spacing motion');
          InspectorUtils.removePseudoClassLock(tab,':hover');set(name==='disabled'?true:name==='instant'?false:0);gates.push(name);
        }
        return {cases,gates};
      } finally {
        InspectorUtils.removePseudoClassLock(tab,':hover');gBrowser.removeTab(tab,{animate:false});
        for(const[k,had,v]of saved)if(!had)S.clearUserPref(k);else S[typeof v==='boolean'?'setBoolPref':'setIntPref'](k,v);
      }
    })();""")
    checks.append({'tabCloseMotion':close_motion})
    # The native image carries hover animation itself; its command owner stays put.
    motion=m.script("""return (async()=>{
      const host=document.getElementById('PanelUI-menu-button'),slot=host.querySelector('.toolbarbutton-icon');
      for(let i=0;i<100&&!slot.hasAttribute('zzicon-own');i++)await new Promise(r=>setTimeout(r,30));
      const bounds=host.getBoundingClientRect().toJSON(),image=getComputedStyle(slot).backgroundImage;
      const samples=[];InspectorUtils.addPseudoClassLock(host,':hover');
      for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,30));samples.push({frame:getComputedStyle(slot).getPropertyValue('--zzicon-frame'),bounds:host.getBoundingClientRect().toJSON()});}
      InspectorUtils.removePseudoClassLock(host,':hover');await new Promise(r=>setTimeout(r,700));
      return {bounds,image,samples,end:getComputedStyle(slot).getPropertyValue('--zzicon-frame'),same:slot===host.querySelector('.toolbarbutton-icon')};
    })();""")
    assert motion['same'] and 'resource://zz-iconflow-' in motion['image'],motion
    assert len({x['frame'] for x in motion['samples']})>2 and all(x['bounds']==motion['bounds'] for x in motion['samples']),motion
    assert float(motion['end'])==0,motion
    checks.append({'nativeSpriteFrames':len({x['frame'] for x in motion['samples']}),'hostStable':True})
    m.script("""Services.prefs.setBoolPref('zzglass.buttons.enabled',true);Services.prefs.setBoolPref('zzglass.buttons.glyph-on-hover',true);
      window.restoreBox=document.querySelector('.titlebar-buttonbox');window.restoreBoxStyle=restoreBox.getAttribute('style');window.restoreBoxPlaceholder=document.createComment('window glyph test');restoreBox.replaceWith(restoreBoxPlaceholder);document.documentElement.append(restoreBox);
      restoreBox.style.cssText='position:fixed!important;top:80px!important;left:500px!important;right:auto!important;z-index:2147483647!important';
      InspectorUtils.addPseudoClassLock(restoreBox,':hover');return true;""")
    time.sleep(.3)
    for cls in ['titlebar-min','titlebar-max','titlebar-close']:
        info=m.script("""window.restoreButton=restoreBox.querySelector('."""+cls+"""');if(!restoreButton.getBoundingClientRect().width&&restoreButton.classList.contains('titlebar-max'))restoreButton=restoreBox.querySelector('.titlebar-restore');const s=getComputedStyle(restoreButton,'::after');
          return {box:restoreButton.getBoundingClientRect().toJSON(),position:s.position,opacity:s.opacity,content:s.content,width:s.width,height:s.height,glyph:s.getPropertyValue('--zzg-glyph'),visibility:s.visibility,rect:restoreBox.getBoundingClientRect().toJSON()};""")
        assert info['position']=='static' and float(info['opacity'])>0 and info['content']!='none',info
        shown=m.shot();m.script("restoreButton.style.setProperty('--zzg-glyph','0');return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))));");hidden=m.shot()
        assert painted(info['box'],shown,hidden),(cls,'window glyph did not paint',info,m.script("return getComputedStyle(restoreButton,'::after').width;"))
        m.script("restoreButton.style.removeProperty('--zzg-glyph');return true;");checks.append({'windowGlyph':cls,'painted':True})
    m.script("""InspectorUtils.removePseudoClassLock(restoreBox,':hover');restoreBoxPlaceholder.replaceWith(restoreBox);if(restoreBoxStyle===null)restoreBox.removeAttribute('style');else restoreBox.setAttribute('style',restoreBoxStyle);
      Services.prefs.setBoolPref('zzglass.buttons.enabled',false);Services.prefs.setBoolPref('zzglass.motion.enabled',true);
      Services.prefs.setBoolPref('zzglass.edges.enabled',false);Services.prefs.setBoolPref('zzglass.selected.rim',true);
      return true;""")
    pointer=m.script("""return (async()=>{
      const move=()=>{const b=restoreTab.getBoundingClientRect();restoreTab.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:b.right-2,clientY:b.top+2}));};
      move();await new Promise(r=>setTimeout(r,100));const off=__zzglassEdgesInstance.owners===0&&!__zzglassEdgesInstance.scheduled;
      Services.prefs.setBoolPref('zzglass.edges.follow-pointer',true);move();await new Promise(r=>setTimeout(r,100));const on=!!restoreTab.style.getPropertyValue('--zzg-follow-angle');
      Services.prefs.setBoolPref('zzglass.edges.follow-pointer',false);const released=__zzglassEdgesInstance.owners===0&&!__zzglassEdgesInstance.scheduled;
      return {off,on,released};
    })();""")
    assert all(pointer.values()),pointer;checks.append(pointer)
    m.script("""Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService).unregisterSheet(restoreHide,1);__zzglassEdgesInstance.retire();__zziconPartsInstance.retire();gBrowser.selectedTab=restoreOriginalTab;gBrowser.removeTab(restoreTab,{animate:false,skipSessionStore:true});
      document.documentElement.setAttribute('zen-compact-mode','true');document.getElementById('zzsmoke-hide-sidebar-content').sheet.disabled=false;return true;""")
    return checks


def check_sidebar_hover(m):
    """Pixels and geometry outside the sidebar, including remote content."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread
    class Page(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.startswith('/load-'):
                time.sleep(.2)
            fill = 'white' if self.path == '/opaque' else 'transparent'
            html = f'''<!doctype html><style>html,body{{margin:0;background:{fill}}}
              #pattern{{position:fixed;inset:0;background:repeating-linear-gradient(90deg,black 0 4px,transparent 4px 8px)}}
              #card{{position:fixed;left:400px;top:300px;width:200px;height:100px;background:#b24bce;border-radius:32px;corner-shape:squircle}}
              </style><div id=pattern></div><div id=card></div>'''
            self.send_response(200); self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(html.encode())
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Page)
    Thread(target=server.serve_forever,daemon=True).start()
    checks=[]
    def hover(on):
        m.script("""return (async()=>{
          const box=document.getElementById('navigator-toolbox');
          box.removeAttribute('zen-user-show');box.toggleAttribute('zen-has-hover',"""+json.dumps(on)+""");
          if("""+json.dumps(on)+""")InspectorUtils.addPseudoClassLock(box,':hover');else InspectorUtils.removePseudoClassLock(box,':hover');
          await new Promise(r=>setTimeout(r,300));
          await Promise.all(box.getAnimations().map(a=>a.finished.catch(()=>{})));return true;
        })();""")
    try:
        # Navigate the current tab while its sidebar stays open. The late
        # transparency change models a theme applying to the loaded document;
        # the real top-level load callback must refresh both blur paths.
        for compatibility in [False, True]:
            m.script("document.documentElement.setAttribute('zzsmoke-opaque','');Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',"+json.dumps(compatibility)+");return true;")
            hover(True)
            url=f'http://127.0.0.1:{server.server_port}/load-{compatibility}'
            loaded=m.script("""return (async()=>{
              const browser=gBrowser.selectedBrowser, tab=gBrowser.selectedTab, toolbox=document.getElementById('navigator-toolbox');
              let timer, finish, done=false, redraws=0;
              const mo=new MutationObserver(()=>{if(done && toolbox.hasAttribute('zzg-redraw'))redraws++;});
              mo.observe(toolbox,{attributes:true,attributeFilter:['zzg-redraw']});
              const progress={onStateChange(b,wp,_r,flags){const W=Ci.nsIWebProgressListener;
                if(b!==browser || !wp?.isTopLevel || !(flags&W.STATE_STOP) || !(flags&W.STATE_IS_NETWORK))return;
                document.documentElement.removeAttribute('zzsmoke-opaque');done=true;finish();
              }};
              gBrowser.addTabsProgressListener(progress);
              try {
                await new Promise((resolve,reject)=>{finish=resolve;timer=setTimeout(()=>reject(Error('Load did not finish')),8000);
                  browser.loadURI(Services.io.newURI("""+json.dumps(url)+"""),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});});
                for(let n=0;n<4;n++)await new Promise(r=>requestAnimationFrame(r));
                return {redraws,sameTab:gBrowser.selectedTab===tab,open:toolbox.hasAttribute('zen-has-hover'),
                  background:getComputedStyle(browser).backgroundColor,filter:document.getElementById('tabbrowser-tabbox').style.filter};
              } finally {clearTimeout(timer);mo.disconnect();gBrowser.removeTabsProgressListener(progress);}
            })();""")
            assert loaded['sameTab'] and loaded['open'] and loaded['redraws']>0,loaded
            assert ('zzg-strip' in loaded['filter'])==compatibility,loaded
            checks.append({'page':'loaded-with-open-sidebar','compatibility':compatibility,**loaded})
        for name,url in [('transparent',f'http://127.0.0.1:{server.server_port}/transparent'),('opaque',f'http://127.0.0.1:{server.server_port}/opaque'),('settings','about:preferences')]:
            m.script('gBrowser.selectedTab=gBrowser.addTab('+json.dumps(url)+',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});return true;')
            time.sleep(.8)
            handles=m.call('WebDriver:GetWindowHandles');m.call('WebDriver:SwitchToWindow',{'handle':handles[-1]})
            m.script("""document.documentElement.setAttribute('zen-compact-mode','true');
              Services.prefs.setBoolPref('zzglass.sidebar.page-follow',false);
              // See-through pages get the strip filter only while the sidebar shows.
              Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',true);return true;""")
            remote=m.script('return gBrowser.selectedBrowser.remoteType;')
            assert bool(remote)==(name!='settings'),(name,remote)
            for previous in ['', 'brightness(0.9)']:
                m.script('document.getElementById("tabbrowser-tabbox").style.filter='+json.dumps(previous)+';return true;')
                hover(False)
                before=m.shot()
                geometry=m.script("return {box:document.getElementById('tabbrowser-tabbox').getBoundingClientRect().toJSON(),filter:document.getElementById('tabbrowser-tabbox').style.filter};")
                card=m.script("const e=document.querySelector('#card, .main-content');const s=getComputedStyle(e);return {box:e.getBoundingClientRect().toJSON(),radius:s.borderRadius,shape:s.cornerShape};",context='content')
                if name!='settings':
                    browser=m.script('return gBrowser.selectedBrowser.getBoundingClientRect().toJSON();')
                    scale=before.width/m.script('return window.innerWidth;')
                    def pixel(x,y):
                        return before.getpixel((round((browser['x']+card['box']['x']+x)*scale),round((browser['y']+card['box']['y']+y)*scale)))
                    colour=tuple(round(c*(.9 if previous else 1)) for c in (178,75,206))
                    assert max(abs(a-b) for a,b in zip(pixel(100,50),colour))<=2,(name,'fixture not painted',pixel(100,50))
                    assert pixel(0,0)!=pixel(100,50),(name,'rounded corner not painted')
                for visible in [True,False,True,False]:
                    hover(visible)
                    state=m.script("return {box:document.getElementById('tabbrowser-tabbox').getBoundingClientRect().toJSON(),filter:document.getElementById('tabbrowser-tabbox').style.filter};")
                    assert state['box']==geometry['box'],(name,visible,state,geometry)
                    # Only WebRender-native primitives: an feImage mask fell back to software.
                    assert m.script("return [...document.querySelectorAll('#zzg-strip > *')].every(e=>['feFlood','feGaussianBlur','feComposite','feMerge'].includes(e.localName));"),name
                    assert (state['filter'].startswith((previous+' ') if previous else '') and 'zzg-strip' in state['filter']) if visible else state['filter']==previous,(name,visible,state)
                    assert m.script("const e=document.querySelector('#card, .main-content');const s=getComputedStyle(e);return {box:e.getBoundingClientRect().toJSON(),radius:s.borderRadius,shape:s.cornerShape};",context='content')==card,(name,'card changed')
                    after=m.shot();scale=after.width/m.script('return window.innerWidth;')
                    area=tuple(round(v*scale) for v in (350,160,1000,550))
                    difference=ImageStat.Stat(ImageChops.difference(before,after).crop(area)).mean
                    assert max(difference)==0,(name,previous,visible,difference)
                    checks.append({'page':name,'remote':bool(remote),'hover':visible,'retainedFilter':previous,'outsideDifference':difference})
                assert m.script("return document.getElementById('tabbrowser-tabbox').style.filter;")==previous,(name,'page filter not restored')
                if name=='transparent' and not previous:
                    # The strip under the panel is blurred; the switch turns it off.
                    hover(True)
                    # Actual icon transitions must not dirty a stationary page
                    # blur. Count mutations, not just matching final geometry.
                    motion=m.script("""return (async()=>{
                      const wait=ms=>new Promise(r=>setTimeout(r,ms));
                      // Updates are scheduled on rAF. A 100ms timer can fire
                      // before a throttled headless chrome window runs one.
                      const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
                      const toolbox=document.getElementById('navigator-toolbox'),filter=document.getElementById('zzg-strip'),box=document.getElementById('tabbrowser-tabbox');
                      const keys=['zzglass.workspaces.enabled','zzglass.workspaces.hover','zzglass.tabs.essentials-icon-grow'],S=Services.prefs;
                      const saved=keys.map(k=>[k,S.prefHasUserValue(k),S.getPrefType(k)===S.PREF_BOOL?S.getBoolPref(k):S.getIntPref(k)]);
                      S.setBoolPref(keys[0],true);S.setIntPref(keys[1],1);S.setIntPref(keys[2],2);
                      const ws=document.querySelector('#zen-workspaces-button toolbarbutton'),tab=gBrowser.selectedTab;
                      const essential=tab.getAttribute('zen-essential');tab.setAttribute('zen-essential','true');
                      const writes=[];const mo=new MutationObserver(cs=>writes.push(...cs));mo.observe(filter,{attributes:true,subtree:true});mo.observe(box,{attributes:true,attributeFilter:['style']});
                      const cases=[];
                      try {
                        await wait(500);
                        for(const [name,host,icon] of [['workspace',ws,ws.querySelector('.zen-workspace-icon')],['favorite',tab,tab.querySelector('.tab-icon-image')]]){
                          writes.length=0;InspectorUtils.addPseudoClassLock(host,':hover');await wait(400);
                          const scale=getComputedStyle(icon).scale;
                          InspectorUtils.removePseudoClassLock(host,':hover');await wait(400);
                          if(scale!=='1.3'||writes.length)throw new Error(name+': '+JSON.stringify({scale,writes:writes.map(c=>c.attributeName)}));
                          cases.push({name,scale,filterWrites:writes.length});
                        }
                        writes.length=0;window.dispatchEvent(new Event('resize'));await settle();
                        if(writes.length)throw new Error('Unchanged geometry rewrote filter');
                        // Tab selection can change transparency without moving
                        // the sidebar. Re-evaluate it without relying on bubbling
                        // icon transitions; retain another owner's filter.
                        document.documentElement.setAttribute('zzsmoke-opaque','');tab.dispatchEvent(new Event('TabSelect',{bubbles:true}));await settle();
                        if(box.style.filter)throw new Error('Opaque selection retained strip filter');
                        document.documentElement.removeAttribute('zzsmoke-opaque');
                        tab.dispatchEvent(new Event('TabSelect',{bubbles:true}));await settle();
                        if(!box.style.filter.includes('zzg-strip'))throw new Error('Transparent selection lost strip filter: '+JSON.stringify({filter:box.style.filter,
                          background:getComputedStyle(gBrowser.selectedBrowser).backgroundColor,
                          backdrop:getComputedStyle(document.getElementById('zen-toolbar-background')).backdropFilter,
                          compact:document.documentElement.getAttribute('zen-compact-mode'),attributes:toolbox.getAttributeNames(),
                          enabled:S.getBoolPref('zzglass.sidebar.blur-transparent-pages'),svg:!!document.getElementById('zzg-strip')}));
                        writes.length=0;toolbox.dispatchEvent(new TransitionEvent('transitioncancel',{propertyName:'translate'}));await settle();
                        if(writes.length)throw new Error('Cancelled slide rewrote unchanged geometry');
                        return cases;
                      } finally {
                        mo.disconnect();for(const host of [ws,tab])InspectorUtils.removePseudoClassLock(host,':hover');
                        if(essential===null)tab.removeAttribute('zen-essential');else tab.setAttribute('zen-essential',essential);
                        for(const[k,had,v]of saved)if(!had)S.clearUserPref(k);else S[typeof v==='boolean'?'setBoolPref':'setIntPref'](k,v);
                      }
                    })();""")
                    checks.append({'page':name,'stationaryBlurMotion':motion})
                    panel=m.script("const p=document.getElementById('zen-toolbar-background').getBoundingClientRect();return [p.left,p.top,p.right,p.bottom];")
                    blurred=m.shot();scale=blurred.width/m.script('return window.innerWidth;')
                    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',false);return true;");time.sleep(.3)
                    sharp=m.shot()
                    assert m.script("return !document.getElementById('zzg-strip') && !document.getElementById('tabbrowser-tabbox').style.filter;"), 'Disabled compatibility retained its SVG or page filter'
                    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',true);return true;")
                    strip=tuple(round(v*scale) for v in (panel[0]+20,200,panel[2]-20,260))
                    detail=[max(ImageStat.Stat(im.crop(strip)).stddev) for im in (blurred,sharp)]
                    assert detail[0]<detail[1]/2,(name,'strip not blurred',detail)
                    assert max(ImageStat.Stat(ImageChops.difference(blurred,sharp).crop(area)).mean)==0,(name,'strip filter changed outside pixels')
                    hover(False)
                    checks.append({'page':name,'stripDetail':detail})
            m.script("document.getElementById('tabbrowser-tabbox').style.removeProperty('filter');return true;")
        hover(True)
        assert m.script("return getComputedStyle(document.getElementById('zen-toolbar-background')).backdropFilter.includes('blur(12px)');"),'native blur recipe lost'
    finally:
        server.shutdown();server.server_close()
    return checks


def check(m, root, arc, transparent):
    mods = ["download-prompt", "glassflow", "glassflow-library", "groupflow", "iconflow", "tab-router", "tab-unloader", "zen-turbo", "mediaflow"]
    prefs = {}
    pref_files = [p / "preferences.json" for p in [arc, transparent] if p] + [root / mod / "preferences.json" for mod in mods]
    for path in pref_files:
        for pref in json.loads(path.read_text()):
            if "property" in pref and "defaultValue" in pref:
                prefs[pref["property"]] = pref["defaultValue"]
    prefs.update({"zzglass.sidebar.enabled": True, "zzglass.sidebar.blur": True,
                  "zzglass.sidebar.blur-radius": "12px", "zzglass.sidebar.panel-opacity": "0%",
                  "zzrouter.enabled": False, "zzunload.enabled": False,
                  "zzturbo.startup-warmup": False, "zzturbo.hover-warmup": False,
                  "zen.view.compact.hide-tabbar": True, "zen.theme.acrylic-sidebar": True,
                  "arc.force-blur-rendering": False})
    for pack in ["network", "predictor", "io-jank", "media", "gfx"]:
        prefs["zzturbo.pack-" + pack] = False
    m.script("for (const [k,v] of Object.entries(" + json.dumps(prefs) + ")) {"
             "Services.prefs[typeof v==='boolean'?'setBoolPref':typeof v==='number'?'setIntPref':'setStringPref'](k,v); } return true;")
    icon_paint_checks = check_icons(m, root)
    page = """<!doctype html><style>html,body{margin:0;background:transparent}
      #pattern{position:fixed;inset:0;background:repeating-linear-gradient(90deg,black 0px 4px,transparent 4px 8px)}
      h1{position:absolute;left:20px;top:250px;font:40px sans-serif;color:red}</style>
      <div id=pattern></div><h1>Transparent page text</h1>"""
    # Zen may retire its startup placeholder browser before navigation.
    m.script("gBrowser.selectedTab=gBrowser.addTab(" + json.dumps("data:text/html," + quote(page)) +
             ",{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});return true;")
    sheets = ([arc / "userChrome.css"] if arc else []) + ([transparent / "chrome.css"] if transparent else []) + [root / mod / "userChrome.css" for mod in mods]
    m.script("""const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      for (const url of """ + json.dumps([p.resolve().as_uri() for p in sheets if p.exists()]) + """) {
        ss.loadAndRegisterSheet(Services.io.newURI(url),ss.USER_SHEET);
      }
      document.documentElement.setAttribute('zen-compact-mode','true');
      document.getElementById('navigator-toolbox').setAttribute('zen-user-show','true');
      document.documentElement.style.setProperty('--arc-website-tint','transparent');
      const style=document.createElementNS('http://www.w3.org/1999/xhtml','style');style.id='zzsmoke-hide-sidebar-content';
      style.textContent='#titlebar > :not(#zen-toolbar-background){visibility:hidden!important} #zen-toolbar-background::before,#zen-toolbar-background::after{display:none!important}';
      document.body.appendChild(style);
      ss.loadAndRegisterSheet(Services.io.newURI('data:text/css,'+encodeURIComponent(
        ':root #tabbrowser-tabbox browser {background-color:transparent!important;transition:none!important}' +
        ':root[zzsmoke-opaque] #tabbrowser-tabbox browser {background-color:white!important}')),ss.USER_SHEET);
      return true;""")
    for mod in mods:
        m.script((root / mod / (mod + ".uc.js")).read_text() + "\nreturn true;")
    time.sleep(0.8)
    result = m.script("""return {zen:Services.appinfo.version,firefox:Services.appinfo.platformVersion,
      apis:['DownloadPrompt','Groupflow','TabRouter','TabUnloader','ZenTurbo'].map(k=>[k,!!window[k]]),
      download:DownloadPrompt.status()};""")
    assert all(present for _, present in result["apis"]), (result, m.script("return (Services.console.getMessageArray()||[]).map(m=>m.message).filter(m=>/TabRouter|tab-router/.test(m));"))
    result['iconPaintChecks'] = icon_paint_checks
    # With compatibility off, native blur owns the surface without allocating
    # a page filter. Saved On is still honoured after re-injection.
    assert m.script("return !document.getElementById('zzg-strip') && !document.getElementById('tabbrowser-tabbox').style.filter;"), 'Default native path allocated a page filter'
    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',true);return true;")
    m.script((root / 'glassflow/glassflow.uc.js').read_text() + "\nreturn true;")
    assert m.script("return Services.prefs.getBoolPref('zzglass.sidebar.blur-transparent-pages') && document.querySelectorAll('#zzg-strip').length===1;"), 'Saved compatibility choice lost or duplicated on re-injection'
    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',false);return true;")
    m.script((root / 'glassflow/glassflow.uc.js').read_text() + "\nreturn true;")
    assert m.script("return !Services.prefs.getBoolPref('zzglass.sidebar.blur-transparent-pages') && !document.getElementById('zzg-strip') && !document.getElementById('tabbrowser-tabbox').style.filter;"), 'Off retained a page filter after re-injection'
    result['pageBlurLifecycle'] = ['default-off', 'saved-on-reinjection-single-owner', 'saved-off-reinjection-no-filter']
    def settle():
        m.script("return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));")

    result['restoredChrome'] = check_restored_chrome(m, root)
    result['sidebarHover'] = check_sidebar_hover(m)
    m.script("Services.prefs.setBoolPref('zzlib.stack.box',true);return true;")
    for master, downloads in [(True, 1), (False, 1), (True, 0), (True, 1)]:
        m.script("Services.prefs.setBoolPref('zzglass.overlays.enabled'," + json.dumps(master) +
                 ");Services.prefs.setIntPref('zzglass.overlays.downloads'," + str(downloads) + ");return true;")
        settle()
        box = m.script("""const s=getComputedStyle(document.getElementById('zen-library-download-list'),'::before');
          return {filter:s.backdropFilter,fill:s.backgroundColor};""")
        enabled = master and downloads != 0
        assert ("blur(" in box["filter"]) == enabled, box
        if not enabled:
            assert box["filter"] == "none" and box["fill"].startswith("rgb("), box
    result["downloadBoxChecks"] = ["on", "master-off", "downloads-off", "restored"]
    result["boostsChecks"] = check_boosts(m)
    # Run the sprite engine with Firefox's XML DOM; Node has no DOMParser.
    engine = (root / "iconflow/iconflow-parts.uc.js").read_text().split("  // ---- in the browser")[0]
    engine = engine.replace('if (typeof Services === "undefined")', 'if (true)') + "\n})();"
    icon = m.script(engine + """
      const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path fill="url(#paint)" d="M2 2H14V14H2Z"/></svg>';
      const doc=new DOMParser().parseFromString(IconParts.strip(svg,'reload',3),'image/svg+xml');
      return {gradients:doc.querySelectorAll('linearGradient#paint').length,
        frames:[...doc.documentElement.children].filter(e=>e.localName==='svg').length,
        filled:doc.querySelectorAll('path[fill="url(#paint)"]').length};""")
    assert icon == {"gradients": 1, "frames": 3, "filled": 3}, icon
    result["iconGradientCheck"] = icon
    # Expose the actual preview controls without requiring a remote video.
    # Only the fixture's visibility/position changes; range behavior and
    # focus-within use Mediaflow's DOM, CSS and Firefox's trusted key events.
    media = m.script("""const p=document.getElementById('zen-sidebar-pip-container'),t=p.querySelector('input');
      window.zzsmokeMediaEvents=[];
      window.zzsmokeMediaListen=e=>zzsmokeMediaEvents.push({type:e.type,trusted:e.isTrusted});
      for(const type of ['input','change'])t.addEventListener(type,zzsmokeMediaListen);
      const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      window.zzsmokeMediaSheet=Services.io.newURI('data:text/css,'+encodeURIComponent(
        '#zen-sidebar-pip-container{display:block!important;opacity:1!important;transform:none!important;left:1000px!important;top:80px!important;bottom:auto!important;width:240px!important;height:140px!important}' +
        '.zzmf-pip-controls{transition:none!important}'));
      ss.loadAndRegisterSheet(zzsmokeMediaSheet,ss.USER_SHEET);
      t.disabled=false;t.value='0.5';
      return {namespace:t.namespaceURI,html:t instanceof HTMLInputElement,type:t.type,
        hidden:getComputedStyle(p.querySelector('.zzmf-pip-controls')).opacity==='0'};""")
    assert media == {"namespace": "http://www.w3.org/1999/xhtml", "html": True, "type": "range", "hidden": True}, media
    m.script("document.querySelector('.zzmf-pip-track').focus();return true;")
    settle()
    m.call("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "media-range", "actions": [
        {"type": "keyDown", "value": "\ue014"}, {"type": "keyUp", "value": "\ue014"}]}]})
    m.call("WebDriver:ReleaseActions")
    media = m.script("""const p=document.getElementById('zen-sidebar-pip-container'),t=p.querySelector('input');
      return {value:t.valueAsNumber,events:zzsmokeMediaEvents,
        focused:document.activeElement===t,focusWithin:p.matches(':focus-within'),
        opacity:getComputedStyle(p.querySelector('.zzmf-pip-controls')).opacity};""")
    assert abs(media["value"] - 0.501) < 0.000001, media
    assert media["events"] == [{"type": "input", "trusted": True}, {"type": "change", "trusted": True}], media
    assert media["focused"] and media["focusWithin"] and media["opacity"] == "1", media
    result["mediaRangeCheck"] = media
    m.script("""const t=document.querySelector('.zzmf-pip-track');t.blur();t.disabled=true;
      for(const type of ['input','change'])t.removeEventListener(type,zzsmokeMediaListen);
      const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      ss.unregisterSheet(zzsmokeMediaSheet,ss.USER_SHEET);
      delete window.zzsmokeMediaEvents;delete window.zzsmokeMediaListen;delete window.zzsmokeMediaSheet;return true;""")
    m.script("document.documentElement.removeAttribute('animating-background'); DownloadPrompt.preview(); return true;")
    modal = m.script("""let d=document.getElementById('zzdl-ask');return {modal:d.matches(':modal'),
      focus:d.contains(document.activeElement),name:d.getAttribute('aria-labelledby')};""")
    assert modal == {"modal": True, "focus": True, "name": "zzdl-title"}, modal
    m.script("document.querySelector('#zzdl-ask .zzdl-keep').click(); return !document.getElementById('zzdl-ask');")
    m.script("Services.prefs.setBoolPref('zzglass.sidebar.enabled',false); return true;")
    time.sleep(0.1)
    # Trigger Zen's actual hidden-sidebar download pop-out, then change styles
    # while it is alive. The 60s duration belongs only to this temporary profile.
    m.script("""Services.prefs.setIntPref('zen.downloads.download-animation-duration',60000);
      for(const id of ['zen-library-button','downloads-button'])document.getElementById(id)?.style.setProperty('display','none','important');
      const host=document.createElement('zen-download-animation');document.body.appendChild(host);
      host.initializeAnimation({clientX:500,clientY:200});return true;""")
    icon_cases = [(0, button, icon_set) for icon_set in [0, 2, 3] for button in [0, 1, 4, 5, 6, 7]]
    icon_cases += [(library, 7, 2) for library in [1, 8, 12]]
    for library, button, icon_set in icon_cases:
        m.script(f"Services.prefs.setIntPref('zzicon.library.style',{library});Services.prefs.setIntPref('zzicon.button.downloads',{button});Services.prefs.setIntPref('zzicon.set',{icon_set});return true;")
        settle()
        icons = m.script("""const popup=document.querySelector('.zen-download-box-animation-icon');
          const p=getComputedStyle(popup);
          return {popup:p.backgroundImage,size:p.backgroundSize,
            position:p.backgroundPosition,transform:p.transform,animation:p.animationName,filter:p.filter};""")
        circuit = button in [4, 5, 7] or (button == 0 and icon_set in [2, 3])
        expected = "clean/downloads.svg" if button == 0 and icon_set == 3 else "circuit/downloads-line.svg" if button == 7 else "circuit/downloads.svg" if circuit else "skin/downloads/downloads.svg"
        assert expected in icons["popup"] and "library" not in icons["popup"], (library, button, icon_set, icons)
        assert icons["size"] == ("9600% 100%" if circuit else "100% 100%"), icons
        assert icons["position"] in ["0px 0px", "0% 0px", "0% 0%"], icons
        assert icons["transform"] == "none" and icons["animation"] == "none" and icons["filter"] == "none", icons
    m.script("""document.querySelector('.zen-download-box-animation').remove();
      document.querySelector('zen-download-animation').remove();
      for(const id of ['zen-library-button','downloads-button'])document.getElementById(id)?.style.removeProperty('display');
      Services.prefs.clearUserPref('zen.downloads.download-animation-duration');
      Services.prefs.setIntPref('zzicon.library.style',11);Services.prefs.setIntPref('zzicon.button.downloads',0);Services.prefs.setIntPref('zzicon.set',0);
      return true;""")
    result["downloadPopupIconChecks"] = len(icon_cases)
    # Native session downloads feed both Zen's four rows and our optional four.
    # Retry is intercepted on fixture objects; no network download is started.
    library = m.script("""return (async()=>{
      const {Downloads}=ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      const list=await Downloads.getList(Downloads.PUBLIC),downloads=[];
      Services.prefs.setBoolPref('zen.downloads.download-animation',false);
      Services.prefs.setIntPref('zzlib.stack.count',8);
      try {
        for(let i=0;i<8;i++){
          const d=await Downloads.createDownload({source:'https://example.invalid/fixture-'+i,
            target:PathUtils.join(PathUtils.tempDir,'zzsmoke-library-'+i)});
          d.canceled=true;d.startTime=new Date(Date.now()+i);downloads.push(d);await list.add(d);
        }
        document.getElementById('zen-sidebar-foot-buttons').setAttribute('zen-library-stack-open','');
        await new Promise(r=>setTimeout(r,150));
        const rows=[...document.querySelectorAll('#zen-library-download-list > .zzlib-extra')];
        const ordered=rows.length===4 && rows.every((r,i)=>r.download===downloads[i]);
        let retries=0;downloads[0].start=async()=>{retries++;};
        rows[0].dispatchEvent(new MouseEvent('click',{button:0}));
        const action=rows[0].querySelector('.zen-library-download-action');
        const named=action.getAttribute('data-l10n-id')==='library-downloads-show-tooltip';
        const before=new Set(document.getElementById('mainPopupSet').children);
        rows[0].dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}));
        const menu=[...document.getElementById('mainPopupSet').children].find(p=>!before.has(p));
        const command=id=>menu?.querySelector('[data-l10n-id="'+id+'"]');
        const nativeContext=!!command('library-downloads-menu-retry')&&!!command('downloads-cmd-copy-download-link')&&
          !command('downloads-cmd-show-menuitem-2')&&!command('downloads-cmd-delete-file');
        downloads[0].succeeded=true;downloads[0].canceled=false;
        command('library-downloads-menu-retry')?.dispatchEvent(new Event('command',{bubbles:true,cancelable:true}));
        const changedDownloadRejected=retries===1;menu?.hidePopup();
        const drag=new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()});
        rows[0].dispatchEvent(drag);
        return {ordered,retries,named,nativeContext,changedDownloadRejected,missingFileDragRejected:drag.defaultPrevented};
      } finally {
        document.getElementById('zen-sidebar-foot-buttons').removeAttribute('zen-library-stack-open');
        for(const d of downloads)await list.remove(d);
        Services.prefs.setIntPref('zzlib.stack.count',4);
        Services.prefs.clearUserPref('zen.downloads.download-animation');
      }
    })();""")
    assert library == {"ordered": True, "retries": 1, "named": True, "nativeContext": True,
                       "changedDownloadRejected": True, "missingFileDragRejected": True}, library
    result["libraryExtraRows"] = library
    m.script("""for(const k of ['__zzdlInstance','__zzglassInstance','__zzgroupInstance','__zzrouterInstance','__zzunloadInstance','__zzturboInstance']) window[k].retire();
      return true;""")
    return result


def check_boosts(m):
    """Theme Zen's real Zap bar without replacing its controls or layout."""
    result = m.script("""return (async()=>{
      const browser=gBrowser.selectedBrowser, container=browser.closest('.browserSidebarContainer');
      const bar=document.createElement('zen-zap-bar'), messages=[];
      bar.browser=browser;bar.actor={sendAsyncMessage:(name,data)=>messages.push({name,data})};
      bar.entries=[{selector:'#fixture',count:1}];
      const before=browser.getBoundingClientRect().height;
      browser.parentNode.insertAdjacentElement('afterend',bar);
      const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const state=()=>{const s=getComputedStyle(bar);return {fill:s.backgroundColor,filter:s.backdropFilter,color:s.color};};
      const root=document.documentElement, scheme=root.style.getPropertyValue('color-scheme');
      const cases=[];
      try {
        await customElements.whenDefined('zen-zap-bar');await bar.updateComplete;await settle();
        const reservesSpace=browser.getBoundingClientRect().height<before && container.hasAttribute('zen-zapping');
        for(const theme of ['light','dark'])for(const [master,mode] of [[true,0],[true,1],[true,2],[false,1]]){
          root.style.setProperty('color-scheme',theme);
          Services.prefs.setBoolPref('zzglass.overlays.enabled',master);
          Services.prefs.setIntPref('zzglass.overlays.boosts',mode);await settle();
          cases.push({theme,master,mode,...state()});
        }
        Services.prefs.setBoolPref('zzglass.overlays.enabled',true);
        Services.prefs.setIntPref('zzglass.overlays.boosts',1);
        Services.prefs.setIntPref('ui.prefersReducedTransparency',1);await settle();
        const reduced={matches:matchMedia('(prefers-reduced-transparency: reduce)').matches,...state()};
        bar.shadowRoot.querySelector('.zen-zap-bar-unzap').click();
        bar.shadowRoot.querySelector('.zen-zap-bar-done').click();
        return {reservesSpace,cases,reduced,messages};
      } finally {
        bar.remove();
        root.style.setProperty('color-scheme',scheme);
        Services.prefs.clearUserPref('ui.prefersReducedTransparency');
        Services.prefs.setBoolPref('zzglass.overlays.enabled',true);
        Services.prefs.setIntPref('zzglass.overlays.boosts',1);
      }
    })();""")
    assert result["reservesSpace"], result
    for case in result["cases"]:
        enabled = case["master"] and case["mode"] != 0
        assert ("blur(" in case["filter"]) == enabled, case
        assert ("brightness(" in case["filter"]) == (enabled and case["mode"] == 2), case
        if enabled:
            assert case["fill"].startswith("rgba(") and case["fill"] != case["color"], case
    assert result["reduced"]["matches"] and result["reduced"]["filter"] == "none", result
    assert result["reduced"]["fill"].startswith("rgb("), result
    assert result["messages"] == [{"name": "ZenBoost:ZapBarUnzap", "data": {"selector": "#fixture"}},
                                  {"name": "ZenBoost:DisableZapMode", "data": None}], result
    return {"appearanceCases": len(result["cases"]), "reducedTransparency": True, "nativeActions": 2, "reservesSpace": True}


def check_library_hover(m, root, arc):
    """Actual pointer handoff; never force zen-user-show or synthetic hover."""
    m.script("return gZenStartup.promiseInitialized.then(()=>true);")
    mods = ["glassflow", "glassflow-library"]
    prefs = {}
    for path in ([arc / "preferences.json"] if arc else []) + [root / mod / "preferences.json" for mod in mods]:
        for pref in json.loads(path.read_text()):
            if "property" in pref and "defaultValue" in pref:
                prefs[pref["property"]] = pref["defaultValue"]
    prefs.update({"zzlib.stack.box": True, "zen.view.compact.hide-tabbar": True,
                  "zen.view.compact.hide-toolbar": False, "zen.downloads.download-animation": False,
                  "zen.view.compact.sidebar-keep-hover.duration": 500})
    m.script("for(const [k,v] of Object.entries(" + json.dumps(prefs) + "))"
             "Services.prefs[typeof v==='boolean'?'setBoolPref':typeof v==='number'?'setIntPref':'setStringPref'](k,v);return true;")
    for sheet in ([arc / "userChrome.css"] if arc else []) + [root / mod / "userChrome.css" for mod in mods]:
        m.script("Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService)"
                 ".loadAndRegisterSheet(Services.io.newURI(" + json.dumps(sheet.resolve().as_uri()) + "),1);return true;")
    for mod in mods:
        m.script((root / mod / (mod + ".uc.js")).read_text() + "\nreturn true;")
    m.script("""return (async()=>{
      gZenCompactModeManager.preference=true;
      const {Downloads}=ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      const {DownloadHistory}=ChromeUtils.importESModule('resource://gre/modules/DownloadHistory.sys.mjs');
      for(let i=0;i<8;i++){
        const d=await Downloads.createDownload({source:'https://example.invalid/history-'+i,
          target:PathUtils.join(PathUtils.tempDir,'zzsmoke-history-'+i)});
        d.succeeded=true;d.startTime=new Date(Date.now()-100000+i*1000);d.endTime=d.startTime.getTime()+500;
        d.target.size=12;await DownloadHistory.addDownloadToHistory(d);await DownloadHistory.updateMetaData(d);
      }
      return true;
    })();""")

    def move(x, y, pause=0, click=False):
        actions = [{"type": "pointerMove", "duration": 0, "x": round(x), "y": round(y)}]
        if click:
            actions += [{"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]
        if pause:
            actions.append({"type": "pause", "duration": pause})
        m.call("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "library-hover",
               "parameters": {"pointerType": "mouse"}, "actions": actions}]})

    def center(id):
        return m.script("const r=document.getElementById(" + json.dumps(id) + ").getBoundingClientRect();"
                        "return [r.x+r.width/2,r.y+r.height/2];")

    def state():
        return m.script("""const n=gZenCompactModeManager.sidebar;return {
          hover:n.matches(':hover'),shown:n.hasAttribute('zen-has-hover'),
          stack:document.getElementById('zen-sidebar-foot-buttons').hasAttribute('zen-library-stack-open')};""")

    width = m.script("return window.innerWidth;")
    history_checks = 0
    backing_checks = 0
    expected = ["history-" + str(i) for i in range(8)]
    # Historical entries never enter Downloads.PUBLIC: this reproduces the
    # history-only state that previously opened the full Library on first click.
    for session_count in (0, 1, 4):
        if session_count:
            start = 0 if session_count == 1 else 1
            for i in range(start, session_count):
                m.script("""return (async()=>{
                  const {Downloads}=ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
                  const list=await Downloads.getList(Downloads.PUBLIC);
                  const i=""" + str(i) + """,d=await Downloads.createDownload({source:'https://example.invalid/hover-'+i,
                    target:PathUtils.join(PathUtils.tempDir,'zzsmoke-hover-'+i)});
                  d.canceled=true;d.startTime=new Date(Date.now()+i);await list.add(d);return true;
                })();""")
                expected.append("hover-" + str(i))
        for count in (1, 3, 4, 8):
            m.script("Services.prefs.setIntPref('zzlib.stack.open',1);Services.prefs.setIntPref('zzlib.stack.count'," + str(count) + ");return true;")
            move(width / 2, 200, 700)
            move(1, 200, 350)
            move(*center("zen-library-button"), pause=400, click=True)
            shown = m.script("""return [...document.querySelectorAll('#zen-library-download-list > .zen-library-download-list-download')]
              .filter(e=>!e.hidden && getComputedStyle(e).display!=='none')
              .map(e=>e.download.source.url.split('/').pop());""")
            assert state()["stack"] and shown == expected[-count:], (session_count, count, shown, state())
            assert not m.script("return !!customElements.get('zen-library')?.isLibraryOpen;"), 'First click opened full Library'
            history_checks += 1
            if count in (1, 8):
                for box in (False, True):
                    m.script('Services.prefs.setBoolPref("zzlib.stack.box",'+json.dumps(box)+');return true;')
                    backing = m.script('''return (async()=>{
                      await new Promise(r=>setTimeout(r,200));
                      const list=document.getElementById('zen-library-download-list'),back=getComputedStyle(list,'::before');
                      const rows=[...list.children].filter(n=>!n.hidden&&getComputedStyle(n).display!=='none');
                      return {opacity:back.opacity,backdrop:back.backdropFilter,pointer:back.pointerEvents,
                        rows:rows.map(n=>getComputedStyle(n).backdropFilter),
                        zIndex:getComputedStyle(document.getElementById('zen-sidebar-foot-buttons')).zIndex};
                    })();''')
                    assert backing['zIndex'] == '100', backing
                    if box:
                        assert backing['opacity'] == '1' and backing['pointer'] == 'auto', backing
                        assert all(v == 'none' for v in backing['rows']), backing
                    else:
                        assert all('blur(' in v for v in backing['rows']), backing
                    backing_checks += 1
                m.script('Services.prefs.setBoolPref("zzlib.stack.box",true);return true;')
        if session_count == 0:
            move(*center("zen-library-button"), pause=500, click=True)
            assert m.script("return customElements.get('zen-library').isLibraryOpen;"), 'Second click did not open Library'
            m.script("customElements.get('zen-library').close();return true;")
            move(width / 2, 200, 800)
            history_checks += 1
            private = m.script("""return (async()=>{
              const w=OpenBrowserWindow({private:true});
              try {
                await new Promise(resolve=>{
                  const observer=(subject,topic)=>{if(subject===w){Services.obs.removeObserver(observer,topic);resolve();}};
                  Services.obs.addObserver(observer,'browser-delayed-startup-finished');
                });
                await w.gZenStartup.promiseInitialized;
                Services.scriptloader.loadSubScript('chrome://sine/content/zz-glassflow-library/glassflow-library.uc.js',w);
                await new Promise(r=>setTimeout(r,250));
                const visible=()=>[...w.document.querySelectorAll('#zen-library-download-list > .zen-library-download-list-download')].filter(e=>!e.hidden);
                const empty=visible().length===0;
                const {Downloads}=ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
                const list=await Downloads.getList(Downloads.PRIVATE);
                const d=await Downloads.createDownload({source:{url:'https://example.invalid/private',isPrivate:true},
                  target:PathUtils.join(PathUtils.tempDir,'zzsmoke-private')});
                d.canceled=true;await list.add(d);await new Promise(r=>setTimeout(r,250));
                return {empty,privateOnly:visible().length===1 && visible()[0].download.source.isPrivate};
              } finally {w.close();}
            })();""")
            assert private == {"empty": True, "privateOnly": True}, private
            history_checks += 1
    # Removing saved history must remove only its added rows, retaining the
    # four native session entries and their native actions/context menus.
    m.script("return ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs').PlacesUtils.history.clear().then(()=>true);")
    move(width / 2, 200, 700)
    move(1, 200, 350)
    move(*center("zen-library-button"), pause=400, click=True)
    assert m.script("return document.querySelectorAll('#zen-library-download-list > .zzlib-extra').length;") == 0
    history_checks += 1
    m.script("Services.prefs.setIntPref('zzlib.stack.count',4);return true;")
    cases = []
    for right in (False, True):
        for expanded in (True, False):
            for mode in (0, 1):
                m.script("Services.prefs.setBoolPref('zen.tabs.vertical.right-side'," + json.dumps(right) + ");"
                         "Services.prefs.setBoolPref('zen.view.sidebar-expanded'," + json.dumps(expanded) + ");"
                         "Services.prefs.setIntPref('zzlib.stack.open'," + str(mode) + ");return true;")
                # Return directly, before/after the popup closes, or stay over
                # the page. Both returning paths must cancel Zen's hide timer.
                for gap in (0, 80, 260, None):
                    case = {"right": right, "expanded": expanded, "mode": mode, "gap": gap}
                    move(width / 2, 200, 700)
                    move(width - 1 if right else 1, 200, 350)
                    move(*center("zen-library-button"), pause=350, click=mode == 1)
                    assert state()["stack"], ("Stack did not open", case, state())
                    move(*center("zen-library-download-list"), pause=50)
                    side_x = center("navigator-toolbox")[0]
                    if gap:
                        move(width / 2, 200, gap)
                    if gap is None:
                        move(width / 2, 200, 800)
                        assert state() == {"hover": False, "shown": False, "stack": False}, (case, state())
                    else:
                        move(side_x, 200, 800)
                        assert state() == {"hover": True, "shown": True, "stack": False}, (case, state())
                    cases.append(case)
    return {"libraryHoverChecks": len(cases), "libraryHistoryChecks": history_checks,
            "libraryBackingChecks": backing_checks, "compositorVerified": False, "arc": bool(arc), "cases": cases}


def check_actions(m, root):
    mods = ['glassflow', 'glassflow-library', 'groupflow', 'iconflow', 'tab-router', 'tab-unloader', 'zen-turbo', 'mediaflow']
    prefs = {}
    for mod in mods:
        for pref in json.loads((root / mod / 'preferences.json').read_text()):
            if 'property' in pref and 'defaultValue' in pref:
                prefs[pref['property']] = pref['defaultValue']
    prefs.update({'zzrouter.enabled': False, 'zzrouter.section-icons': False, 'zzrouter.sort-on-startup': False,
                  'zzunload.enabled': False, 'zzturbo.startup-warmup': False, 'zzunload.exclude-workspace-anchor': False,
                  'zen.view.sidebar-expanded': True})
    m.script('return gZenStartup.promiseInitialized.then(()=>true);')
    m.script('for(const [k,v] of Object.entries('+json.dumps(prefs)+'))Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v); return true;')
    for mod in mods:
        m.script((root / mod / (mod + '.uc.js')).read_text() + '\nreturn true;')
    result = m.script('''return (async()=>{
      const pause=ms=>new Promise(r=>setTimeout(r,ms)), wait=async fn=>{for(let n=0;n<100;n++){if(fn())return;await pause(25);}throw Error('Action fixture timed out');};
      await wait(()=>window.TabRouter && window.Groupflow && window.TabUnloader && window.ZenTurbo);
      const result={};
      const {collectReport}=ChromeUtils.importESModule('chrome://sine/content/zz-glassflow/zen-mods-report.sys.mjs');
      const start=performance.now(), report=await collectReport(window);
      result.reportMs=performance.now()-start; result.reportCollected=typeof report.mods==='object';
      const tools=document.getElementById('menu_ToolsPopup');
      const showTools=()=>tools.dispatchEvent(new Event('popupshowing',{bubbles:true}));
      const command=(surface,label)=>{const item=[...surface.querySelectorAll('menuitem,toolbarbutton')].find(n=>n.getAttribute('label')===label);if(!item)throw Error('Missing '+label);item.dispatchEvent(new Event('command',{bubbles:true}));return item;};
      Services.prefs.clearUserPref('zzglass.selected.opacity');showTools();command(tools,'Save appearance');
      await wait(()=>Services.prefs.prefHasUserValue('zzglass-saved.appearance'));
      const saved=JSON.parse(Services.prefs.getStringPref('zzglass-saved.appearance'));
      result.snapshotWhitelist=Object.keys(saved.values).every(k=>/^(zzglass|zzgroup|zzicon)[.]/.test(k)) && !saved.values['zzglass.selected.opacity'].had;
      Services.prefs.setStringPref('zzglass.selected.opacity','0.41');showTools();command(tools,'Restore appearance');
      await wait(()=>!Services.prefs.prefHasUserValue('zzglass.selected.opacity'));result.snapshotClearsAbsent=true;
      Services.prefs.setStringPref('zzglass-saved.appearance','malformed');showTools();
      result.invalidRestoreHidden=![...tools.children].some(n=>n.getAttribute('label')==='Restore appearance');
      result.ruleCommands=['Generate routing rules from open tabs…','Validate routing rules','Edit routing rules…'].every(label=>[...tools.children].some(n=>n.getAttribute('label')===label));
      const add=label=>{const t=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});t.label=label;return t;};
      const selected=gBrowser.selectedTab,a=add('Background target'),b=add('Selected other');gBrowser.selectedTab=b;
      const popup=document.getElementById('tabContextMenu');popup.openPopup(a,'after_start');await pause(100);
      const keep=command(popup,'Keep here');
      result.backgroundLock=SessionStore.getCustomTabValue(a,'zzrouterLocked')==='true' && SessionStore.getCustomTabValue(b,'zzrouterLocked')!== 'true';
      popup.hidePopup();popup.openPopup(a,'after_start');await pause(100);command(popup,'Resume routing');
      result.resumeLock=!SessionStore.getCustomTabValue(a,'zzrouterLocked');popup.hidePopup();
      popup.openPopup(a,'after_start');await pause(100);const stale=[...popup.children].find(n=>n.getAttribute('label')==='Keep here');popup.hidePopup();
      gBrowser.removeTab(a,{animate:false});stale.dispatchEvent(new Event('command'));
      result.staleTargetNoFallback=SessionStore.getCustomTabValue(b,'zzrouterLocked')!== 'true';
      const c=add('Folder child'),d=add('Folder child two'),group=gBrowser.addTabGroup([c,d],{label:'Action folder',insertBefore:c});
      gBrowser.selectedTab=b;await pause(100);TabRouter.setPlacementLock(group,true);await pause(50);
      result.folderLockSaved=JSON.parse(SessionStore.getCustomWindowValue(window,'groupflowGroups'))[group.id]?.routerLocked===true;
      const count=await TabUnloader.unloadFolder(group);result.manualUnload=count>0 && group.tabs.some(t=>t.hasAttribute('pending'));
      const {UrlbarShared}=ChromeUtils.importESModule('chrome://browser/content/urlbar/UrlbarShared.mjs');
      result.nativeTabSwitchType=UrlbarShared.RESULT_TYPE.TAB_SWITCH;
      gBrowser.selectedTab=selected;for(const t of [b,c,d])if(t.isConnected)gBrowser.removeTab(t,{animate:false});
      return result;
    })();''')
    result.update(m.script('''return (async()=>{
      const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async (fn,label)=>{for(let n=0;n<120;n++){if(fn())return;await pause(25);}throw Error('Advanced action fixture timed out: '+(typeof label==='function'?label():label));};
      const result={},selected=gBrowser.selectedTab,system=Services.scriptSecurityManager.getSystemPrincipal();
      const tab=gBrowser.addTab('about:blank?zzpicture',{triggeringPrincipal:system,skipAnimation:true});
      await wait(()=>tab.linkedBrowser.currentURI.spec==='about:blank?zzpicture','tab ready');
      const other=gBrowser.addTab('about:blank',{triggeringPrincipal:system,skipAnimation:true});gBrowser.selectedTab=other;
      const popup=document.getElementById('tabContextMenu');
      const open=async target=>{popup.hidePopup();await pause(50);popup.openPopup(target,'after_start');await pause(75);};
      const item=label=>[...popup.children].find(n=>n.getAttribute('label')===label);
      await wait(()=>window.ZzMediaflowController,'media ready');
      const controller=ZzMediaflowController,bc=tab.linkedBrowser.browsingContext,owner={};let playbackCommands=0;
      controller.registerSource(bc.id,{owner,startTick(){},stopTick(){},setProcessingActive(){},control(){playbackCommands++;}});
      controller.offerVideo(640,360,bc);
      await open(other);result.unrelatedMediaHidden=!item('Show this video in sidebar');
      await open(tab);const show=item('Show this video in sidebar');result.backgroundVideoEligible=!!show;
      show.dispatchEvent(new Event('command'));await open(tab);
      const automatic=item('Sidebar video: Automatic');result.manualVideoAutomatic=!!automatic;
      automatic.dispatchEvent(new Event('command'));await open(tab);result.automaticClearsChoice=!item('Sidebar video: Automatic');
      const stale=item('Show this video in sidebar');controller.notifySourceStopped(bc);await pause(25);
      result.stoppedSourceHidden=!item('Show this video in sidebar');
      stale.dispatchEvent(new Event('command'));result.staleMediaSafe=!controller.chooseSource(bc.id);
      result.playbackCommands=playbackCommands;controller.unregisterSource(bc.id,owner);popup.hidePopup();

      const icon='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
      const group=gBrowser.addTabGroup([tab],{label:'PRIVATE_TITLE_SENTINEL',insertBefore:tab});
      group.setAttribute('data-zzrouter-icon',icon);tab.setAttribute('data-zzrouter-tab-icon',icon);
      const rules=Services.prefs.getStringPref('zzrouter.rules','');Services.prefs.setStringPref('zzrouter.rules','privacy-sentinel.invalid > PRIVATE_PATH_SENTINEL');
      const {collectReport}=ChromeUtils.importESModule('chrome://sine/content/zz-glassflow/zen-mods-report.sys.mjs');
      const before={selected:gBrowser.selectedTab,group:tab.group,label:group.label,rules:Services.prefs.getStringPref('zzrouter.rules')};
      const report=JSON.stringify(await collectReport(window));
      result.reportPrivacy=!/PRIVATE_TITLE_SENTINEL|PRIVATE_PATH_SENTINEL|privacy-sentinel[.]invalid/.test(report);
      result.reportReadOnly=before.selected===gBrowser.selectedTab&&before.group===tab.group&&before.label===group.label&&before.rules===Services.prefs.getStringPref('zzrouter.rules');
      Services.prefs.setStringPref('zzrouter.rules',rules);

      const {ProvidersManager}=ChromeUtils.importESModule('moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs');
      const {UrlbarResult}=ChromeUtils.importESModule('chrome://browser/content/urlbar/UrlbarResult.mjs');
      const {UrlbarShared}=ChromeUtils.importESModule('chrome://browser/content/urlbar/UrlbarShared.mjs');
      const manager=ProvidersManager.getInstanceForSap('urlbar');let manual=false,requests=0;const providerErrors=[];
      const nativeIcon='chrome://global/skin/icons/defaultFavicon.svg';
      const nativeSidebar=manager.providers.find(p=>p.name==='ZenUrlbarProviderSidebar');
      const provider=new class extends nativeSidebar.constructor {
        get name(){return 'ZenModsSmoke';}get type(){return UrlbarShared.PROVIDER_TYPE.PROFILE;}
        getPriority(){return 1000;}async isActive(ctx){return ctx.searchString.startsWith('zzpicture');}
        async startQuery(ctx,add){
          try {
          add(this,new UrlbarResult({type:UrlbarShared.RESULT_TYPE.TAB_SWITCH,source:UrlbarShared.RESULT_SOURCE.TABS,
            payload:{url:tab.linkedBrowser.currentURI.spec,title:'zzpicture tab',icon:nativeIcon,userContext:{id:0}}}));
          add(this,new UrlbarResult({type:UrlbarShared.RESULT_TYPE.DYNAMIC,source:UrlbarShared.RESULT_SOURCE.TABS,
            payload:{dynamicType:'zen-folders',titleL10n:'zen-action-open',path:'zzpicture folder',icon:nativeIcon,zenFolderId:group.id,userIcon:manual?nativeIcon:''}}));
          } catch(error){providerErrors.push(String(error));}
        }
      };
      const observer={observe(subject){if(/youtube|ytimg|ggpht|nexusmods/.test(subject.QueryInterface(Ci.nsIChannel).URI.host))requests++;}};
      manager.registerProvider(provider);Services.obs.addObserver(observer,'http-on-modify-request');
      try {
        // Rule-change notifications above clear unsupported fixture identities.
        // Seed display values after those notifications have finished; lookup
        // and recovery validation is covered by the routing/restart fixture.
        await pause(100);group.setAttribute('data-zzrouter-icon',icon);tab.setAttribute('data-zzrouter-tab-icon',icon);
        gURLBar.focus();gURLBar.value='zzpicture';gURLBar.startQuery({searchString:'zzpicture'});await gURLBar.lastQueryContextPromise;
        const rows=()=>[...gURLBar.view.panel.querySelectorAll('.urlbarView-row')].filter(r=>r.result?.providerName==='ZenModsSmoke');
        await wait(()=>rows().length===2,()=> 'search rows: '+JSON.stringify({providerErrors,rows:[...gURLBar.view.panel.querySelectorAll('.urlbarView-row')].map(r=>({provider:r.result?.providerName,payload:r.result?.payload}))}));await pause(50);
        const image=row=>row.querySelector('.urlbarView-favicon')?.getAttribute('src');
        result.nativeSearchPictures=rows().every(row=>image(row)===icon);
        manual=true;gURLBar.value='zzpicture manual';gURLBar.startQuery({searchString:'zzpicture manual'});await gURLBar.lastQueryContextPromise;await pause(100);
        const folderRows=rows().filter(r=>r.result.payload.zenFolderId);
        result.nativeSearchManualIcon=folderRows.length===1&&folderRows.every(row=>image(row)===nativeIcon);
        result.searchRequests=requests;
      } finally {gURLBar.view.close();manager.unregisterProvider(provider);Services.obs.removeObserver(observer,'http-on-modify-request');}

      const settings=gBrowser.addTab('about:preferences',{triggeringPrincipal:system,skipAnimation:true});
      await wait(()=>settings.linkedBrowser.contentDocument?.readyState==='complete'&&settings.linkedBrowser.currentURI.spec==='about:preferences','settings ready');
      const doc=settings.linkedBrowser.contentDocument,box=doc.createElement('div'),input=doc.createElement('input');
      box.id='zzrouter-rules';box.append(input);doc.documentElement.append(box);let writes=0;
      input.addEventListener('change',()=>{writes++;Services.prefs.setStringPref('zzrouter.rules',input.value);});
      input.value='malformed rule';input.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true,cancelable:true}));
      result.nativeInvalidRulesRejected=writes===0&&Services.prefs.getStringPref('zzrouter.rules')===rules;
      input.value='github.com > Dev / Tools';input.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true,cancelable:true}));
      result.nativeValidRulesAccepted=writes===1&&Services.prefs.getStringPref('zzrouter.rules')===input.value;
      Services.prefs.setStringPref('zzrouter.rules',rules);gBrowser.selectedTab=selected;
      for(const t of [tab,other,settings])if(t.isConnected)gBrowser.removeTab(t,{animate:false});
      return result;
    })();'''))
    result.update(m.script('''return (async()=>{
      const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async fn=>{for(let n=0;n<120;n++){if(fn())return;await pause(25);}throw Error('Turbo fixture timed out');};
      const {NetUtil}=ChromeUtils.importESModule('resource://gre/modules/NetUtil.sys.mjs');
      const old=Object.getOwnPropertyDescriptor(NetUtil,'__zzturboStartupV1');let claims=0,claimed=false;
      Object.defineProperty(NetUtil,'__zzturboStartupV1',{configurable:true,get:()=>claimed,set:value=>{claimed=value;if(value)claims++;}});
      const windows=[],open=async options=>{const w=OpenBrowserWindow(options);windows.push(w);await wait(()=>w.gBrowserInit?.delayedStartupFinished);await w.gZenStartup.promiseInitialized;return w;};
      const inject=w=>Services.scriptloader.loadSubScript('chrome://sine/content/zz-zen-turbo/zen-turbo.uc.js',w);
      const result={};
      try {
        Services.prefs.setBoolPref('zzturbo.startup-warmup',true);Services.prefs.setStringPref('zzturbo.startup-warm-delay-ms','0');
        Services.prefs.setStringPref('zzturbo.startup-warm-count','0');
        const privateWindow=await open({private:true});inject(privateWindow);await pause(300);
        result.privateStartupNoBudget=claims===0;
        privateWindow.close();await wait(()=>Services.wm.getMostRecentWindow('navigator:browser')===window);
        inject(window);await wait(()=>claims===1);
        const second=await open({});inject(second);inject(window);await pause(500);
        result.sessionBudgetClaims=claims;
        Services.prefs.clearUserPref('zzturbo.measure');Services.prefs.clearUserPref('zzturbo.startup-warm-count');
        result.nativeDefaults=Services.prefs.getBoolPref('zzturbo.measure')===false&&Services.prefs.getStringPref('zzturbo.startup-warm-count')==='6';
        Services.prefs.setStringPref('zzturbo.startup-warm-count','3');inject(second);await pause(150);
        result.nativeOverridePreserved=Services.prefs.getStringPref('zzturbo.startup-warm-count')==='3';
        Services.prefs.clearUserPref('zzturbo.startup-warm-count');result.nativeResetDefault=Services.prefs.getStringPref('zzturbo.startup-warm-count')==='6';
      } finally {
        Services.prefs.setBoolPref('zzturbo.startup-warmup',false);
        for(const w of windows)if(!w.closed)w.close();
        if(old)Object.defineProperty(NetUtil,'__zzturboStartupV1',old);else delete NetUtil.__zzturboStartupV1;
      }
      return result;
    })();'''))
    assert result['playbackCommands'] == 0, result
    assert result['searchRequests'] == 0, result
    assert result['sessionBudgetClaims'] == 1, result
    for key,value in result.items():
        if isinstance(value,bool): assert value, (key,result)
    return result


def check_native_integration(m, root):
    m.script('return gZenStartup.promiseInitialized.then(()=>true);')
    mods = ['glassflow', 'glassflow-library', 'groupflow', 'iconflow', 'tab-router', 'mediaflow']
    prefs = {}
    for mod in mods:
        for row in json.loads((root/mod/'preferences.json').read_text()):
            if 'property' in row and 'defaultValue' in row:
                prefs[row['property']] = row['defaultValue']
    prefs.update({'zzrouter.enabled': False, 'zzlib.warm': 1, 'zzglass.sidebar.blur': True,
                  'zzicon.newtab.hide-label': True, 'zen.view.show-scroll-to-selected-tab': True})
    m.script('for(const[k,v]of Object.entries('+json.dumps(prefs)+'))Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
    m.script('window.integrationErrors=[];window.addEventListener("error",e=>integrationErrors.push(e.message));return true;')
    for mod in mods:
        if (root/mod/'userChrome.css').exists():
            m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI('+json.dumps((root/mod/'userChrome.css').as_uri())+'),1);return true;')
        if mod == 'iconflow': continue
        source = (root/mod/(mod+'.uc.js')).read_text()
        if mod == 'glassflow-library':
            source = source.replace('  const warmReady =', '  window.integrationWarmLibrary = warmLibrary;\n  const warmReady =')
        m.script(source+'\nreturn true;')
    result = m.script((root/'tools/native-integration-checks.js').read_text())
    result['accessibility']=[]
    for dark in [False,True]:
        for mode in ['normal','reduced-transparency','contrast']:
            case=m.script('return integrationAppearance('+json.dumps(dark)+','+json.dumps(mode)+');')
            shot=m.shot().convert('RGB')
            shot.save('/tmp/zen-appearance-'+str(int(dark))+'-'+mode+'.png')
            if mode!='normal':
                r=case['card']['rect']
                actual=shot.getpixel((round(r['left']+3),round(r['top']+40)))
                expected=tuple(map(int,re.findall(r'\d+',case['palette']['canvas'])))
                assert max(abs(a-b) for a,b in zip(actual,expected))<=5, (case,actual,expected)
                case['cardPixel']={'actual':actual,'expected':expected}
            result['accessibility'].append(case)
    m.script("return integrationAppearance(false,'normal');")
    Path('/tmp/zen-native-appearance.json').write_text(json.dumps(result,indent=2))
    # Leave the real Library open: the capture must close/mask it and restore
    # its section after stopping the screen worker, without collecting its text.
    # Exercise real chrome geometry, pref restoration and ZIP APIs on Linux;
    # only the Windows screen worker is substituted. Never call this pixel proof.
    m.script('Services.prefs.clearUserPref("browser.display.document_color_use");Services.prefs.clearUserPref("ui.useAccessibilityTheme");Services.prefs.setBoolPref("zen.theme.acrylic-sidebar",true);window.integrationOriginalTab=gBrowser.selectedTab;return true;')
    probe = (root/'tools/native-blur-probe.js').read_text()
    probe = probe.replace("Services.appinfo.OS !== 'WINNT'", 'false')
    probe = probe.replace("const shell = PathUtils.join(Services.dirsvc.get('WinD',Ci.nsIFile).path,'System32','WindowsPowerShell','v1.0','powershell.exe');", "const shell = 'test-worker';")
    probe = probe.replace("worker = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess); worker.init(localFile(shell));", "worker = {isRunning:false,runwAsync(){this.isRunning=true;},kill(){this.isRunning=false;}};")
    probe = probe.replace("const readyPath=PathUtils.join(directory,'ready-'+messageId+'.json');", "const readyPath=PathUtils.join(directory,'ready-'+messageId+'.json');await IOUtils.writeJSON(readyPath,{id});")
    probe = probe.replace('      let response;', "      if(start)await wait(800);await IOUtils.writeJSON(responsePath,{id,files:[],simulated:true});\n      let response;")
    m.sock.settimeout(180)
    m.call('WebDriver:SetTimeouts', {'script':180000})
    capture = m.script('return (\n'+probe.rstrip().removesuffix(';')+'\n);')
    assert len(capture['cases']) == 102 and not capture['errors'], capture
    assert m.script('return gBrowser.selectedTab===integrationOriginalTab&&!document.documentElement.hasAttribute("zz-native-blur-test")&&!window.__zzNativeBlurProbe;')
    assert m.script("return customElements.get('zen-library').isLibraryOpen;")
    result['blurOrchestration'] = {'cases':len(capture['cases']), 'restored':True, 'zip':Path(capture['archive']).exists(), 'captureBackend':'simulated; no Windows pixels'}
    import shutil
    shutil.rmtree(capture['directory']); Path(capture['archive']).unlink()
    return result


def check_probe_loader(m, root):
    """Use the Browser Console's evaluation actor, not Marionette's eval sandbox."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread

    guide = (root/'tools/NATIVE-BLUR-PROBE.md').read_text()
    loader = re.search(r'```js\n([\s\S]*?)\n```', guide)[1]
    url = re.search(r"https://raw\.githubusercontent\.com/[^']+", loader)[0]
    fixtures = {
        '/success.js': "Promise.resolve('local script executed');",
        '/syntax-error.js': '(() => {',
        '/native-blur-probe.js': (root/'tools/native-blur-probe.js').read_text(),
    }

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = fixtures.get(self.path)
            self.send_response(200 if body is not None else 503)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.end_headers()
            self.wfile.write((body or '').encode())

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    m.script("""return (async()=>{
      await gZenStartup.promiseInitialized;
      // The unchanged probe must stop before screen capture on every platform.
      Services.prefs.setBoolPref('zen.theme.acrylic-sidebar',false);
      Services.prefs.setBoolPref('zen.theme.acrylic-urlbar',false);
      const {require}=ChromeUtils.importESModule('resource://devtools/shared/loader/Loader.sys.mjs');
      const {CommandsFactory}=require('resource://devtools/shared/commands/commands-factory.js');
      window.probeLoaderCommands=await CommandsFactory.forBrowserConsole();
      await probeLoaderCommands.targetCommand.startListening();
      return true;
    })();""")

    def evaluate(code):
        response = m.script("return probeLoaderCommands.scriptCommand.execute("+json.dumps(code)+""",
          {mapped:{await:true}}).then(r=>({result:typeof r.result==='string'?r.result:null,error:!!r.exceptionMessage,rejected:r.topLevelAwaitRejected}));""")
        assert not response.get('error') and not response.get('rejected'), response
        return response.get('result')

    def temp_files():
        return m.script("return IOUtils.getChildren(PathUtils.tempDir).then(paths=>paths.filter(p=>PathUtils.filename(p).startsWith('zen-native-blur-probe')).sort());")

    def clipboard():
        return json.loads(m.script("""const t=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
          t.init(null);t.addDataFlavor('text/plain');Services.clipboard.getData(t,Services.clipboard.kGlobalClipboard);
          const v={};t.getTransferData('text/plain',v);return v.value.QueryInterface(Ci.nsISupportsString).data;"""))

    try:
        # Same nested eval and async callback as the failed fetch-then-eval loader.
        blocked = "Promise.resolve('1').then(code=>(0,eval)(code)).then(()=>false,e=>e.name+': '+e.message)"
        before = evaluate(blocked)
        assert isinstance(before, str) and 'CSP' in before and 'EvalError' in before, before
        initial = temp_files()
        result = {'oldLoaderBlocked': before, 'cases': []}
        result['missingReplyError'] = m.script("return IOUtils.readJSON(PathUtils.join(PathUtils.tempDir,Services.uuid.generateUUID().toString())).then(()=>null,e=>e.name);")
        assert result['missingReplyError'] == 'NotFoundError', result
        for path in ['/success.js', '/download-error.js', '/syntax-error.js', '/native-blur-probe.js']:
            code = loader.replace(url, f'http://127.0.0.1:{server.server_port}{path}')
            value = evaluate(code)
            if path == '/success.js':
                assert value == 'local script executed', value
            else:
                report = clipboard()
                if path == '/native-blur-probe.js':
                    assert report['probe'] == 'native-blur-v4' and report['cases'] == [], report
                    assert report['finished'] == 'error' and len(report['errors']) == 1, report
                    assert any(s in report['errors'][0] for s in ['requires Windows', 'Enable native Zen acrylic']), report
                    assert m.script('return !window.__zzNativeBlurProbe;'), 'Probe lifecycle did not finish'
                else:
                    assert report['probe'] == 'native-blur-loader' and len(report['errors']) == 1, report
                    assert ('HTTP 503' if path == '/download-error.js' else 'SyntaxError') in report['errors'][0], report
            assert temp_files() == initial, (path, 'Temporary script remains')
            result['cases'].append({'fixture': path, 'passed': True, 'temporaryFileRemoved': True})
        assert evaluate(blocked) == before, 'CSP behavior changed'
        result['cspStillEnforced'] = True
        m.script((root/'tools/console-origin-probe.js').read_text()+'\nreturn true;')
        origin=m.script('''return (async()=>{
          const error=Cc['@mozilla.org/scripterror;1'].createInstance(Ci.nsIScriptError);
          error.init('Console origin fixture','chrome://sine/content/zz-groupflow/fixture.js',17,0,0,'chrome javascript');
          Services.console.logMessage(error);
          await new Promise(r=>setTimeout(r,100));
          return window.__zzConsoleOriginProbe.stop('native fixture completed');
        })();''')
        assert any(e['message']=='Console origin fixture' and e['line']==17 and e['source'].endswith('/fixture.js') for e in origin['entries']), origin
        assert clipboard()['probe']=='console-origin-v1'
        result['consoleOrigin']={'nativeScriptErrorSource':True,'clipboard':True,
          'cleaned':m.script('return !window.__zzConsoleOriginProbe;')}
        m.script('''for(const k of ['network','predictor','media','gfx'])Services.prefs.setBoolPref('zzturbo.pack-'+k,false);
          Services.prefs.setBoolPref('zzturbo.pack-io-jank',true);Services.prefs.setBoolPref('zzturbo.startup-warmup',false);
          Services.prefs.setStringPref('zzturbo.saved-prefs',JSON.stringify({'browser.sessionstore.interval':{had:false,applied:30000}}));
          Services.prefs.setIntPref('browser.sessionstore.interval',30000);return true;''')
        m.script((root/'zen-turbo/zen-turbo.uc.js').read_text()+'\nreturn true;')
        result['turboNativeIntervalRecovery']=m.script('''return (async()=>{
          for(let i=0;i<80 && Services.prefs.prefHasUserValue('browser.sessionstore.interval');i++)await new Promise(r=>setTimeout(r,50));
          return {value:Services.prefs.getIntPref('browser.sessionstore.interval'),owned:Services.prefs.prefHasUserValue('browser.sessionstore.interval')};
        })();''')
        assert result['turboNativeIntervalRecovery']=={'value':40000,'owned':False}, result
        result['captureBackend'] = 'Not invoked; tests console startup and reporting only'
        return result
    finally:
        m.script('return probeLoaderCommands.destroy().then(()=>{delete window.probeLoaderCommands;return true;});')
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--arc", type=Path)
    parser.add_argument("--transparent", type=Path, help="Optional sameerasw/zen-themes/TransparentZen directory (Normal sidebar mode)")
    parser.add_argument("--library-hover", action="store_true", help="Check compact sidebar pointer handoff from recent downloads")
    parser.add_argument("--actions", action="store_true", help="Check native menus, snapshots, diagnostics and scoped actions")
    parser.add_argument("--native-integration", action="store_true", help="Check Zen 1.24 native ownership and accessibility")
    parser.add_argument("--probe-loader", action="store_true", help="Check the blur loader through the actual Browser Console actor with CSP enabled")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix="zen-mod-smoke-") as directory:
        profile = Path(directory)
        (profile / 'sine-mods').mkdir()
        for theme in root.glob('*/theme.json'):
            mod_id = json.loads(theme.read_text())['id']
            target = profile / 'sine-mods' / mod_id
            if not target.exists():
                target.symlink_to(theme.parent, target_is_directory=True)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        prefs = {"marionette.port": port, "browser.shell.checkDefaultBrowser": False,
                 "browser.aboutwelcome.enabled": False, "zen.welcome-screen.seen": True,
                 "zen.welcome-screen.enabled": False, "browser.tabs.allow_transparent_browser": True}
        (profile / "user.js").write_text("\n".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in prefs.items()))
        with (profile / "browser.log").open("w") as log:
            process = subprocess.Popen([str(args.zen.resolve()), "--headless", "--no-remote", "--profile", directory,
                                        "--marionette", "--remote-allow-system-access", "about:blank"], stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                            break
                    except OSError:
                        if process.poll() is not None:
                            raise RuntimeError("Zen exited: " + (profile / "browser.log").read_text()[-2000:])
                        time.sleep(0.2)
                m = Marionette(port)
                m.script("""window.zzsmokeChrome=Cc['@mozilla.org/addons/addon-manager-startup;1']
                  .getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI(""" +
                  json.dumps((profile / 'chrome.manifest').as_uri()) + """),[['content','sine','sine-mods/']]);return true;""")
                result = check_probe_loader(m, root) if args.probe_loader else check_native_integration(m, root) if args.native_integration else check_actions(m, root) if args.actions else check_library_hover(m, root, args.arc) if args.library_hover else check(m, root, args.arc, args.transparent)
                print(json.dumps(result, indent=2))
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
