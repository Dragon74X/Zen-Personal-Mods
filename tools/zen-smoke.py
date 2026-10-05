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
                  "zen.view.compact.hide-tabbar": True, "arc.force-blur-rendering": False})
    for pack in ["network", "predictor", "io-jank", "media", "gfx"]:
        prefs["zzturbo.pack-" + pack] = False
    m.script("for (const [k,v] of Object.entries(" + json.dumps(prefs) + ")) {"
             "Services.prefs[typeof v==='boolean'?'setBoolPref':typeof v==='number'?'setIntPref':'setStringPref'](k,v); } return true;")
    page = """<!doctype html><style>html,body{margin:0;background:transparent}
      #pattern{position:fixed;inset:0;background:repeating-linear-gradient(90deg,black 0px 4px,transparent 4px 8px)}
      h1{position:absolute;left:20px;top:250px;font:40px sans-serif;color:red}</style>
      <div id=pattern></div><h1>Transparent page text</h1>"""
    m.call("Marionette:SetContext", {"value": "content"})
    m.call("WebDriver:Navigate", {"url": "data:text/html," + quote(page)})
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
      return true;""")
    for mod in mods:
        m.script((root / mod / (mod + ".uc.js")).read_text() + "\nreturn true;")
    time.sleep(0.8)
    result = m.script("""return {zen:Services.appinfo.version,firefox:Services.appinfo.platformVersion,
      apis:['DownloadPrompt','Groupflow','TabRouter','TabUnloader','ZenTurbo'].map(k=>[k,!!window[k]]),
      download:DownloadPrompt.status()};""")
    assert all(present for _, present in result["apis"]), result
    first = m.shot()
    outside = (220, 180, 350, 240)
    assert min(ImageStat.Stat(first.crop(outside)).stddev) > 40, "the page beside the sidebar changed"
    # The one blur is Zen's own, on Zen's panel, with Glassflow's values; the
    # page itself is never filtered, and Zen Turbo leaves it on during motion.
    filters = m.script("""document.documentElement.setAttribute('animating-background','true');
      return {sidebar:getComputedStyle(document.getElementById('zen-toolbar-background')).backdropFilter,
              page:getComputedStyle(document.getElementById('tabbrowser-tabbox')).filter};""")
    assert "zen-backdrop-filters.svg#underlay" in filters["sidebar"] and "blur(12px)" in filters["sidebar"] and filters["page"] == "none", filters
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
    result["pixelChecks"] = {"outsideDifferenceOnDisable": ImageStat.Stat(ImageChops.difference(first, off).crop(outside)).mean}
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
