#!/usr/bin/env python3
"""Native folder/container regression check in a disposable profile.

python tools/zen-routing-smoke.py --zen /path/to/zen --atg /path/to/Advanced-Tab-Groups
Requires the same Pillow dependency as zen-smoke.py. Never uses a real profile.
"""
import argparse
import json
from pathlib import Path
import runpy
import socket
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

Marionette = runpy.run_path(str(Path(__file__).with_name("zen-smoke.py")))["Marionette"]


class Page(BaseHTTPRequestHandler):
    posts = []

    def do_POST(self):
        self.posts.append(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode())
        self.send_response(302)
        self.send_header("Location", "/native-result")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path == "/slowframe":
            time.sleep(1.5)
        frame = '<iframe src="/slowframe"></iframe>' if self.path == "/frames" else ""
        port = self.server.server_port
        links = (f'<a id="native" target="_blank" href="http://localhost:{port}/native-state">Route</a>'
                 f'<a id="opener" target="_blank" rel="opener" href="http://localhost:{port}/native-opener">Opener</a>'
                 f'<a id="reverse" target="_blank" href="http://127.0.0.1:{port}/native-back">Reverse</a>'
                 f'<form id="post" method="post" target="_blank" action="http://localhost:{port}/native-post">'
                 '<input name="draft" value="keep this"></form>')
        state = '<script>sessionStorage.setItem("site-state","keep")</script>' if self.path.startswith("/native-") else ""
        body = ('<title>Routing fixture</title><link rel="icon" href="data:image/svg+xml,'
                '%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22%3E'
                '%3Crect width=%2216%22 height=%2216%22 fill=%22red%22/%3E%3C/svg%3E">'
                '<input id="draft">' + frame + links + state).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def log_message(self, *_args):
        pass


HELPERS = """
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const until = async fn => {
    for (let i=0; i<200; i++) { if (fn()) return; await pause(50); }
    throw new Error('Fixture timed out');
  };
  const group = name => [...document.querySelectorAll('tab-group')].find(g => g.label === name);
  const add = (url, ctx=1) => gBrowser.addTab(url, {userContextId:ctx,
    triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(), skipAnimation:true});
  const loaded = async t => { gBrowser.selectedTab=t;
    await until(() => /^http:/.test(t.linkedBrowser.currentURI.spec) && !t.hasAttribute('busy') && t.getAttribute('image'));
  };
"""


def check_native_routes(m, root):
    m.script("return (async()=>{" + HELPERS + """
      window.routeSource=group('Source').tabs[0];
      const source=gZenWorkspaces.getWorkspaceFromId(routeSource.getAttribute('zen-workspace-id'));
      source.containerTabId=1; gZenWorkspaces.saveWorkspace(source);
      window.routeSourceID=source.uuid;
      window.routeTarget=await gZenWorkspaces.createAndSaveWorkspace('Native destination',undefined,false,2);
      for(const [reference,matchType,openIn] of [
        ['localhost','contains',routeTarget.uuid],
        [fixtureURL+'/native-back','equal-to',source.uuid],
      ]) {
        const rule=gZenSpaceRoutingManager.createNewRoute();
        Object.assign(rule,{reference,matchType,openIn});gZenSpaceRoutingManager.updateRoute(rule);
      }
      gZenSpaceRoutingManager.saveRoutes();
      await gZenWorkspaces.changeWorkspace(source);gBrowser.selectedTab=routeSource;
      return true;
    })();""")
    results = {}
    for name, source, action, path, ctx in [
        ("nativeBlankLink", "/source", "native", "/native-state", 2),
        ("nativeOpenerLink", "/source", "opener", "/native-opener", 2),
        ("nativeReverseRule", "/native-state", "reverse", "/native-back", 1),
        ("nativePostRedirect", "/source", "post", "/native-result", 1),
    ]:
        # Select the content handle, not merely gBrowser.selectedTab: Marionette
        # otherwise keeps addressing the original about:blank document.
        m.script("return (async()=>{ const suffix=" + json.dumps(source) + """;
          const tab=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec.endsWith(suffix));
          await gZenWorkspaces.changeWorkspace(gZenWorkspaces.getWorkspaceFromId(tab.getAttribute('zen-workspace-id')));
          gBrowser.selectedTab=tab;return true; })();""")
        m.call("Marionette:SetContext", {"value": "content"})
        for handle in m.call("WebDriver:GetWindowHandles"):
            m.call("WebDriver:SwitchToWindow", {"handle": handle})
            if m.script("return document.URL;", "content").endswith(source):
                break
        else:
            raise AssertionError("Fixture source tab missing: " + source)
        method = "submit" if action == "post" else "click"
        m.script(f"document.getElementById({json.dumps(action)}).{method}(); return true;", "content")
        result = m.script("return (async()=>{" + HELPERS + """
          const path=""" + json.dumps(path) + """;
          const matches=()=>[...document.querySelectorAll('tab')].filter(t=>!t.closing && t.linkedBrowser?.currentURI?.spec.endsWith(path));
          await until(()=>matches().length && !matches()[0].hasAttribute('busy'));
          await pause(500);
          const tabs=matches(), t=tabs[0];await gBrowser.prepareDiscardBrowser(t);
          const state=JSON.parse(SessionStore.getTabState(t));
          return {count:tabs.length,ctx:t.userContextId,
            workspace:t.getAttribute('zen-workspace-id')===(path==='/native-back'?routeSourceID:routeTarget.uuid),
            storage:Object.keys(state.storage||{}).some(key=>key.endsWith('^userContextId='+t.userContextId))};
        })();""")
        assert result == {"count": 1, "ctx": ctx, "workspace": True, "storage": True}, (name, result)
        results[name] = True
        if action == "opener":
            # Reinject between link tests to exercise observer retirement.
            m.script((root / "tab-router/tab-router.uc.js").read_text() + "\nreturn true;")
    assert Page.posts == ["draft=keep+this"], Page.posts
    return results


def check(m, root, atg, port, first):
    m.script("return gZenStartup.promiseInitialized.then(()=>true);")
    m.script("window.fixtureURL=" + json.dumps(f"http://127.0.0.1:{port}") + "; return true;")
    if first:
        m.script("return (async()=>{" + HELPERS + """
          const rt=add(fixtureURL+'/root'), ct=add(fixtureURL+'/child');
          await loaded(rt); await loaded(ct); gBrowser.selectedTab=rt;
          const root=gBrowser.addTabGroup([rt],{label:'Root',insertBefore:rt});
          const child=gBrowser.addTabGroup([ct],{label:'Child',insertBefore:ct});
          SessionStore.setCustomWindowValue(window,'tabGroupParents',JSON.stringify({[child.id]:root.id}));
          SessionStore.setCustomWindowValue(window,'tabGroupIcons',JSON.stringify({[root.id]:'📁',[child.id]:'🦊'}));
          root.collapsed=true;
          return true;
        })();""")
    sheets = [atg / "userChrome.css", root / "groupflow/userChrome.css"]
    m.script("""const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      for(const url of """ + json.dumps([p.resolve().as_uri() for p in sheets]) + """)
        ss.loadAndRegisterSheet(Services.io.newURI(url),ss.USER_SHEET);
      return true;""")
    m.script((atg / "advanced-tab-groups.uc.js").read_text() + "\nwindow.advancedTabGroups=globalThis.advancedTabGroups; return true;")
    if (atg / "folder-look.uc.js").exists():
        m.script((atg / "folder-look.uc.js").read_text() + "\nreturn true;")
    groupflow = (root / "groupflow/groupflow.uc.js").read_text()
    m.script(groupflow + "\nreturn true;")
    result = m.script("return (async()=>{" + HELPERS + """
      await pause(2200); // Past both ATG delayed restore passes and Groupflow's icon refresh.
      const root=group('Root'), child=group('Child');
      if(!root || !child) throw new Error('Session did not restore fixture groups');
      const ct=child.tabs[0], icon=child.style.getPropertyValue('--zzgf-icon');
      const image=new Image(); image.src=icon.slice(5,-2); await image.decode();
      return {zen:Services.appinfo.version, rootOpen:!root.collapsed, childFolded:child.collapsed,
        nested:child.parentElement.closest('tab-group')===root,
        bodyHidden:getComputedStyle(child.groupContainer).display==='none', iconDecoded:image.naturalWidth>0,
        cachedIcon:icon.includes(gBrowser.getIcon(ct)), savedIcon:advancedTabGroups.savedIcons[child.id]==='🦊'};
    })();""")
    assert all(value is True for key, value in result.items() if key != "zen"), result
    # Manual expansion survives a Sine-style reinjection.
    m.script("[...document.querySelectorAll('tab-group')].find(g=>g.label==='Child').collapsed=false; return true;")
    m.script(groupflow + "\nreturn true;")
    assert m.script("return ![...document.querySelectorAll('tab-group')].find(g=>g.label==='Child').collapsed;")
    if first:
        m.script("return (async()=>{" + HELPERS + """
          const target=add(fixtureURL.replace('127.0.0.1','localhost')+'/target',2);
          const source=add(fixtureURL+'/source'); await loaded(target); await loaded(source);
          gBrowser.addTabGroup([target],{label:'Destination',insertBefore:target});
          gBrowser.addTabGroup([source],{label:'Source',insertBefore:source});
          Services.prefs.setStringPref('zzrouter.rules','localhost > Destination');
          Services.prefs.setBoolPref('zzrouter.enabled',true);
          return true;
        })();""")
        m.script((root / "tab-router/tab-router.uc.js").read_text() + "\nreturn true;")
        routed = m.script("return (async()=>{" + HELPERS + """
          const url=fixtureURL.replace('127.0.0.1','localhost')+'/frames';
          const t=add(url); group('Source').addTabs([t]); gBrowser.selectedTab=t;
          await until(()=>t.linkedBrowser.currentURI.spec===url && t.hasAttribute('busy'));
          await pause(300);
          const deferred=t.isConnected && t.getAttribute('usercontextid')==='1' && t.group===group('Source');
          await until(()=>!t.isConnected);
          await until(()=>[...document.querySelectorAll('tab')].some(t=>t.linkedBrowser?.currentURI?.spec===url));
          const fresh=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec===url);
          await loaded(fresh);
          const routed=fresh.getAttribute('usercontextid')==='2' && fresh.group===group('Destination');
          // Reproduce an old-version tab already filed in the right group with the wrong container.
          Services.prefs.setBoolPref('zzrouter.enabled',false);
          const old=add(fixtureURL.replace('127.0.0.1','localhost')+'/filed');
          const child=gBrowser.addTabGroup([old],{label:'Manual subgroup',insertBefore:old});
          advancedTabGroups.nestGroupUnder(child,group('Destination'));
          await loaded(old);
          Services.prefs.setBoolPref('zzrouter.enabled',true);
          await TabRouter.sortAll();
          await until(()=>!old.isConnected);
          await until(()=>[...document.querySelectorAll('tab')].some(t=>t.linkedBrowser?.currentURI?.spec.endsWith('/filed')));
          const repaired=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec.endsWith('/filed'));
          await loaded(repaired);
          return {deferred,routed,repaired:repaired.getAttribute('usercontextid')==='2' && repaired.group.label==='Manual subgroup'};
        })();""")
        assert all(routed.values()), routed
        result.update(routed)
        result.update(check_native_routes(m, root))
    # Leave the child open in the saved session: the next launch must fold it again.
    m.script("""Services.prefs.setBoolPref('zzrouter.enabled',false);
      const root=[...document.querySelectorAll('tab-group')].find(g=>g.label==='Root');
      gBrowser.selectedTab=root.tabs[0]; return true;""")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--atg", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    server = ThreadingHTTPServer(("127.0.0.1", 0), Page)
    Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="zen-routing-smoke-") as directory:
        profile = Path(directory)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
        prefs = {"marionette.port": port, "browser.shell.checkDefaultBrowser": False,
                 "browser.aboutwelcome.enabled": False, "zen.welcome-screen.seen": True,
                 "zen.welcome-screen.enabled": False, "browser.startup.page": 3,
                 "browser.tabs.groups.arc-style": True, "browser.tabs.groups.folder-look": True}
        for mod in ["groupflow", "tab-router"]:
            for pref in json.loads((root / mod / "preferences.json").read_text()):
                if "property" in pref and "defaultValue" in pref:
                    prefs[pref["property"]] = pref["defaultValue"]
        prefs.update({"zzrouter.enabled": False, "zzrouter.sort-on-startup": False,
                      "zzrouter.delay-ms": 100, "zzrouter.auto-unmatched": False,
                      "zzrouter.media-subgroups": False, "zzrouter.section-icons": False})
        (profile / "user.js").write_text("\n".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in prefs.items()))
        for launch in range(3):
            with (profile / "browser.log").open("w") as log:
                process = subprocess.Popen([str(args.zen.resolve()), "--headless", "--no-remote", "--profile", directory,
                                            "--marionette", "--remote-allow-system-access"], stdout=log, stderr=log)
                try:
                    for _ in range(100):
                        try:
                            with socket.create_connection(("127.0.0.1", port), timeout=.2):
                                break
                        except OSError:
                            if process.poll() is not None:
                                raise RuntimeError((profile / "browser.log").read_text()[-2000:])
                            time.sleep(.2)
                    m = Marionette(port)
                    print(json.dumps({"launch": launch + 1, **check(m, root, args.atg, server.server_port, launch == 0)}), flush=True)
                    m.call("Marionette:Quit", {"flags": ["eAttemptQuit"]})
                    process.wait(timeout=20)
                    m.sock.close()
                finally:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill(); process.wait()
    server.shutdown()


if __name__ == "__main__":
    main()
