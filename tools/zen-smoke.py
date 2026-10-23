#!/usr/bin/env python3
"""Isolated Zen runtime check. Requires Pillow for PNG comparisons.

python tools/zen-smoke.py --zen /path/to/zen --arc /path/to/Arc-2.0
Uses a temporary profile; never attaches to the user's browser. Screenshots
test the SVG content filter, not compositor-only CSS backdrop-filter output.
"""
import argparse
import base64
import io
import json
from pathlib import Path
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
      const style=document.createElementNS('http://www.w3.org/1999/xhtml','style');
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
    def settle():
        m.script("return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));")

    def state():
        return m.script("""const panel=document.getElementById('zen-toolbar-background');return {
          custom:Services.prefs.getBoolPref("zzglass.sidebar.blur"),native:Services.prefs.getBoolPref("zen.theme.acrylic-sidebar"),
          sidebar:getComputedStyle(panel).backdropFilter,
          page:getComputedStyle(document.getElementById('tabbrowser-tabbox')).filter,
          radius:document.querySelector('#zzg-strip feGaussianBlur').getAttribute('stdDeviation'),
          bounds:panel.getBoundingClientRect().toJSON()};""")

    filters = state()
    assert "blur(12px)" in filters["sidebar"] and "zzg-strip" in filters["page"] and filters["radius"] == "12", filters
    first = m.shot()
    bounds = filters["bounds"]
    inside = (round(bounds["left"] + 30), 180, round(bounds["right"] - 30), 240)
    outside = (round(bounds["right"] + 30), 180, round(bounds["right"] + 150), 240)
    assert min(ImageStat.Stat(first.crop(outside)).stddev) > 40, "page beside sidebar lost its pattern"
    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',false);return true;")
    settle()
    unfiltered = m.shot()
    pixel_difference = ImageChops.difference(first, unfiltered)
    assert max(ImageStat.Stat(pixel_difference.crop(inside)).mean) > 1, "SVG fallback did not alter the page strip"
    assert max(ImageStat.Stat(pixel_difference.crop(outside)).mean) == 0, "strip fallback altered outside pixels"
    assert state()["page"] == "none"
    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur-transparent-pages',true);Services.prefs.setStringPref('zzglass.sidebar.blur-radius','0px');return true;")
    settle()
    filters = state()
    assert "blur(0px)" in filters["sidebar"] and filters["page"] == "none", filters
    m.script("Services.prefs.setStringPref('zzglass.sidebar.blur-radius','calc(1rem + 2px)');return true;")
    settle()
    filters = state()
    computed = float(filters["sidebar"].split("blur(", 1)[1].split("px)", 1)[0])
    assert computed > 2 and float(filters["radius"]) == computed, filters
    m.script("Services.prefs.setBoolPref('zzglass.sidebar.blur',false);return true;")
    settle()
    filters = state()
    assert "blur(42px)" in filters["sidebar"] and "brightness(0.25)" in filters["sidebar"] and filters["radius"] == "42", filters
    m.script("Services.prefs.setBoolPref('zen.theme.acrylic-sidebar',false);return true;")
    settle()
    assert state()["page"] == "none", state()
    m.script("Services.prefs.setBoolPref('zen.theme.acrylic-sidebar',true);return true;")
    settle()
    assert "zzg-strip" in state()["page"], state()
    m.script("document.documentElement.setAttribute('zzsmoke-opaque','');window.dispatchEvent(new Event('resize'));return true;")
    settle()
    assert state()["page"] == "none", state()
    m.script("document.documentElement.removeAttribute('zzsmoke-opaque');window.dispatchEvent(new Event('resize'));return true;")
    settle()
    assert "zzg-strip" in state()["page"], state()
    m.script("document.documentElement.setAttribute('zen-compact-mode','false');return true;")
    settle()
    assert state()["page"] == "none", state()
    m.script("document.documentElement.setAttribute('zen-compact-mode','true');Services.prefs.setBoolPref('zzglass.sidebar.blur',true);Services.prefs.setStringPref('zzglass.sidebar.blur-radius','12px');return true;")
    settle()
    # Wait for native slide completion; the filter must leave with the panel.
    for renaming in [False, True, False]:
        m.script("document.getElementById('navigator-toolbox').removeAttribute('zen-user-show');" +
                 "document.documentElement.setAttribute('zen-renaming-tab'," + json.dumps(str(renaming).lower()) + ");return true;")
        settle()
        m.script("return Promise.all(document.getElementById('navigator-toolbox').getAnimations().map(a=>a.finished.catch(()=>{})));")
        settle()
        assert ("zzg-strip" in state()["page"]) == renaming, state()
    m.script("document.documentElement.removeAttribute('zen-renaming-tab');document.getElementById('navigator-toolbox').setAttribute('zen-user-show','true');return true;")
    settle()
    m.script("return Promise.all(document.getElementById('navigator-toolbox').getAnimations().map(a=>a.finished.catch(()=>{})));")
    settle()
    result["blurChecks"] = ["transparent", "fallback-off", "zero", "css-length", "custom-off", "native-off-on", "opaque", "docked", "slide-hide", "rename"]
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
    off = m.shot()
    assert max(ImageStat.Stat(ImageChops.difference(first, off).crop(outside)).mean) == 0, "outside pixels changed on disable"
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
    result["pixelChecks"] = {"stripDifference": ImageStat.Stat(pixel_difference.crop(inside)).mean,
                             "outsideDifference": ImageStat.Stat(pixel_difference.crop(outside)).mean}
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--arc", type=Path)
    parser.add_argument("--transparent", type=Path, help="Optional sameerasw/zen-themes/TransparentZen directory (Normal sidebar mode)")
    parser.add_argument("--library-hover", action="store_true", help="Check compact sidebar pointer handoff from recent downloads")
    parser.add_argument("--actions", action="store_true", help="Check native menus, snapshots, diagnostics and scoped actions")
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
                result = check_actions(m, root) if args.actions else check_library_hover(m, root, args.arc) if args.library_hover else check(m, root, args.arc, args.transparent)
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
