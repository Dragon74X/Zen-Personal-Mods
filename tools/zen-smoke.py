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
    assert all(present for _, present in result["apis"]), result
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
        return {ordered,retries,named};
      } finally {
        document.getElementById('zen-sidebar-foot-buttons').removeAttribute('zen-library-stack-open');
        for(const d of downloads)await list.remove(d);
        Services.prefs.setIntPref('zzlib.stack.count',4);
        Services.prefs.clearUserPref('zen.downloads.download-animation');
      }
    })();""")
    assert library == {"ordered": True, "retries": 1, "named": True}, library
    result["libraryExtraRows"] = library
    m.script("""for(const k of ['__zzdlInstance','__zzglassInstance','__zzgroupInstance','__zzrouterInstance','__zzunloadInstance','__zzturboInstance']) window[k].retire();
      return true;""")
    result["pixelChecks"] = {"stripDifference": ImageStat.Stat(pixel_difference.crop(inside)).mean,
                             "outsideDifference": ImageStat.Stat(pixel_difference.crop(outside)).mean}
    return result


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
                 ".loadAndRegisterSheet(Services.io.newURI(" + json.dumps(sheet.as_uri()) + "),1);return true;")
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
    return {"libraryHoverChecks": len(cases), "libraryHistoryChecks": history_checks, "arc": bool(arc), "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--arc", type=Path)
    parser.add_argument("--transparent", type=Path, help="Optional sameerasw/zen-themes/TransparentZen directory (Normal sidebar mode)")
    parser.add_argument("--library-hover", action="store_true", help="Check compact sidebar pointer handoff from recent downloads")
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
                result = check_library_hover(m, root, args.arc) if args.library_hover else check(m, root, args.arc, args.transparent)
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
