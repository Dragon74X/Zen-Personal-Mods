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
        ':root #tabbrowser-tabbox browser {background-color:transparent!important}' +
        ':root[zzsmoke-opaque] #tabbrowser-tabbox browser {background-color:white!important}')),ss.USER_SHEET);
      return true;""")
    for mod in mods:
        m.script((root / mod / (mod + ".uc.js")).read_text() + "\nreturn true;")
    time.sleep(0.8)
    result = m.script("""return {zen:Services.appinfo.version,firefox:Services.appinfo.platformVersion,
      apis:['DownloadPrompt','Groupflow','TabRouter','TabUnloader','ZenTurbo'].map(k=>[k,!!window[k]]),
      download:DownloadPrompt.status()};""")
    assert all(present for _, present in result["apis"]), result
    def settle():
        m.script("return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));")

    def state():
        return m.script("""const panel=document.getElementById('zen-toolbar-background');return {
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
    m.script("""for(const k of ['__zzdlInstance','__zzglassInstance','__zzgroupInstance','__zzrouterInstance','__zzunloadInstance','__zzturboInstance']) window[k].retire();
      return true;""")
    result["pixelChecks"] = {"stripDifference": ImageStat.Stat(pixel_difference.crop(inside)).mean,
                             "outsideDifference": ImageStat.Stat(pixel_difference.crop(outside)).mean}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--arc", type=Path)
    parser.add_argument("--transparent", type=Path, help="Optional sameerasw/zen-themes/TransparentZen directory (Normal sidebar mode)")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix="zen-mod-smoke-") as directory:
        profile = Path(directory)
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
                print(json.dumps(check(m, root, args.arc, args.transparent), indent=2))
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
