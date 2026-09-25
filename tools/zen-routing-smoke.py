#!/usr/bin/env python3
"""Native folder/container regression check in a disposable profile.

python tools/zen-routing-smoke.py --zen /path/to/zen [--atg /path/to/Advanced-Tab-Groups]
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
        if self.path == "/external-short":
            self.send_response(302)
            self.send_header("Location", f"http://localhost:{self.server.server_port}/native-external-redirect")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/slowframe":
            time.sleep(1.5)
        frame = '<iframe src="/slowframe"></iframe>' if self.path.startswith("/frames") else ""
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
        ("nativeExternal", "/source", "external", "/native-external", 2),
        ("nativeExternalRedirect", "/source", "external-redirect", "/native-external-redirect", 2),
    ]:
        # Select the content handle, not merely gBrowser.selectedTab: Marionette
        # otherwise keeps addressing the original about:blank document.
        m.script("return (async()=>{ const suffix=" + json.dumps(source) + """;
          const tab=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec.endsWith(suffix));
          await gZenWorkspaces.changeWorkspace(gZenWorkspaces.getWorkspaceFromId(tab.getAttribute('zen-workspace-id')));
          gBrowser.selectedTab=tab;return true; })();""")
        if action.startswith("external"):
            # Firefox's OS-link entry point, with a source tab in container 1.
            m.script("""
              const url=""" + ("fixtureURL+'/external-short'" if action == "external-redirect" else
                    "fixtureURL.replace('127.0.0.1','localhost')+" + json.dumps(path)) + """;
              window.browserDOMWindow.openURI(Services.io.newURI(url),null,
                Ci.nsIBrowserDOMWindow.OPEN_NEWTAB,Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL,
                Services.scriptSecurityManager.getSystemPrincipal());return true;
            """)
        else:
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


def check_subfolder_styles(m):
    profiles = {
        "inactive": {"tint": "31%", "opacity": "0.32", "direction": 1, "end-mode": 0,
                     "end-tint": "41%", "spread": "53%", "sheen": False, "rim": False,
                     "glow": False, "blur": False, "blur-radius": "4px", "label-color": "#a1b2c3"},
        "hover": {"tint": "47%", "opacity": "0.54", "direction": 4, "end-mode": 1,
                  "end-tint": "23%", "spread": "79%", "sheen": True, "rim": True,
                  "glow": True, "blur": True, "blur-radius": "7px", "label-color": "#b2c3d4"},
        "active": {"tint": "63%", "opacity": "0.76", "direction": 3, "end-mode": 3,
                   "end-tint": "35%", "spread": "91%", "sheen": False, "rim": True,
                   "glow": False, "blur": True, "blur-radius": "11px", "label-color": "#c3d4e5"},
    }
    baseline = m.script("return (async()=>{" + HELPERS + """
      const outside=add('about:blank'),selected=gBrowser.selectedTab;
      gBrowser.selectedTab=outside;await pause(250);
      const read=g=>{
        const h=g.labelContainerElement,s=getComputedStyle(h),p=getComputedStyle(h,'::before');
        return {tokens:Object.fromEntries(['--zzgf-accent','--zzgf-raw','--tab-group-color',
            '--zzgf-state-a','--zzgf-state-b','--zzgf-state-dir','--zzgf-state-spread','--zzgf-state-sheen']
            .map(k=>[k,s.getPropertyValue(k)])),background:s.backgroundImage,paint:p.backgroundImage,opacity:p.opacity,
          shadow:p.boxShadow,blur:p.backdropFilter,width:parseFloat(p.width),
          label:getComputedStyle(g.labelElement).color,
          labelOpacity:getComputedStyle(g.labelElement).opacity,headerOpacity:s.opacity};
      };
      const ownGradient=(g,header=false)=>{
        const probe=document.createElement('span');
        const raw=getComputedStyle(g).getPropertyValue('--zzgf-raw');
        const end=header?`color-mix(in srgb,${raw} 0%,transparent)`:'transparent';
        probe.style.backgroundImage=`linear-gradient(to right,color-mix(in srgb,${raw} 25%,transparent) 0%,${end} 50%)`;
        document.documentElement.append(probe);
        const expected=getComputedStyle(probe).backgroundImage;probe.remove();return expected;
      };
      const nativeFolder=[...document.querySelectorAll('zen-folder')].find(g=>g.label==='Folder');
      const baseline={root:read(group('Root')),folder:read(nativeFolder),child:read(group('Child'))};
      const prefs=[];
      for(const [state,values] of Object.entries(""" + json.dumps(profiles) + """)) {
        for(const [name,value] of Object.entries(values)) {
          const key='zzgroup.subfolder.'+state+'.'+name;
          const type=typeof value==='boolean'?'Bool':typeof value==='number'?'Int':'String';
          prefs.push([key,type,Services.prefs.prefHasUserValue(key),Services.prefs['get'+type+'Pref'](key,value),value]);
        }
      }
      window.subfolderStyleFixture={outside,selected,read,baseline,prefs,nativeFolder,ownGradient,
        source:Services.prefs.getIntPref('zzgroup.color-source'),
        tone:document.documentElement.style.getPropertyValue('--zzg-tone'),
        tonePriority:document.documentElement.style.getPropertyPriority('--zzg-tone')};
      Services.prefs.setBoolPref('zzgroup.subfolder.states',true);await pause(100);
      const current={root:read(group('Root')),folder:read(nativeFolder)};
      return {untouched:JSON.stringify(current.root)===JSON.stringify(baseline.root) &&
        JSON.stringify(current.folder)===JSON.stringify(baseline.folder),
        labelOpacity:baseline.child.labelOpacity,headerOpacity:baseline.child.headerOpacity,
        savedImage:baseline.child.background,rootImage:ownGradient(group('Root'),true),plainImage:ownGradient(group('Grandchild'))};
    })();""")
    assert baseline['untouched'], 'Subfolder states changed a root or native folder'

    def point(group_name=None):
        xy = m.script(HELPERS + """
          const name=""" + json.dumps(group_name) + """;
          if(!name) return {x:800,y:400};
          const r=group(name).labelContainerElement.getBoundingClientRect();
          return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
        """)
        m.call('WebDriver:PerformActions', {'actions': [{'type': 'pointer', 'id': 'mouse',
            'parameters': {'pointerType': 'mouse'}, 'actions': [
                {'type': 'pointerMove', 'duration': 0, 'x': xy['x'], 'y': xy['y']}]}]})
        return m.script("return (async()=>{" + HELPERS + """
          await pause(250);
          return Object.fromEntries(['Root','Child','Grandchild'].map(name=>[name,subfolderStyleFixture.read(group(name))]));
        })();""")

    def matches(value, state):
        p = profiles[state]
        colour = {"inactive": "rgb(161, 178, 195)", "hover": "rgb(178, 195, 212)", "active": "rgb(195, 212, 229)"}[state]
        direction = {"inactive": "to left", "hover": "135deg", "active": "to top"}[state]
        assert value['label'] == colour, (state, value)
        assert value['opacity'] == p['opacity'] and value['headerOpacity'] == baseline['headerOpacity'] and value['labelOpacity'] == baseline['labelOpacity'], (state, value)
        assert value['width'] > 0 and direction in value['paint'] and p['spread'] in value['paint'], (state, value)
        assert value['blur'] == (f"blur({p['blur-radius']})" if p['blur'] else 'none'), (state, value)

    try:
        # Defaults retain each folder's own palette across all three states.
        # A saved multi-colour gradient is an image, not a tab accent colour.
        normalize = lambda image: image.removeprefix('none, ')
        default_inactive = point()
        default_hover = point('Child')
        default_plain_hover = point('Grandchild')
        m.script(HELPERS + "gBrowser.selectedTab=group('Grandchild').tabs[0];return true;")
        default_active = point('Grandchild')
        for values in (default_inactive, default_hover, default_plain_hover, default_active):
            assert normalize(values['Child']['paint']) == normalize(baseline['savedImage']), values
            assert normalize(values['Grandchild']['paint']) == baseline['plainImage'], values
            assert normalize(values['Root']['background']) == baseline['rootImage'], values
            assert all(values[name]['opacity'] == '1' and values[name]['blur'] == 'none'
                       for name in ('Child', 'Grandchild')), values
        m.script("document.documentElement.style.setProperty('--zzg-tone','100%');return true;")
        toned = point('Grandchild')
        assert all(toned[name][prop] == default_active[name][prop]
                   for name, prop in [('Root', 'background'), ('Child', 'paint'), ('Grandchild', 'paint')]), toned
        container_image = m.script("return (async()=>{" + HELPERS + """
          Services.prefs.setIntPref('zzgroup.color-source',3);Groupflow.refresh();await pause(100);
          return subfolderStyleFixture.ownGradient(group('Child'));
        })();""")
        container = point('Child')
        assert normalize(container['Child']['paint']) == container_image and container_image != normalize(baseline['savedImage']), container
        m.script("""const f=subfolderStyleFixture;
          Services.prefs.setIntPref('zzgroup.color-source',f.source);Groupflow.refresh();
          document.documentElement.style.setProperty('--zzg-tone',f.tone,f.tonePriority);
          gBrowser.selectedTab=f.outside;
          for(const [key,type,,,value] of f.prefs) Services.prefs['set'+type+'Pref'](key,value);
          return true;
        """)
        inactive = point()['Child']
        matches(inactive, 'inactive')
        hover = point('Child')
        matches(hover['Child'], 'hover')
        matches(hover['Grandchild'], 'inactive')
        descendant_hover = point('Grandchild')
        matches(descendant_hover['Child'], 'inactive')
        matches(descendant_hover['Grandchild'], 'hover')
        m.script(HELPERS + "gBrowser.selectedTab=group('Grandchild').tabs[0];return true;")
        active = point('Child')
        matches(active['Child'], 'active')
        matches(active['Grandchild'], 'active')
        assert len({inactive['paint'], hover['Child']['paint'], active['Child']['paint']}) == 3
        assert len({inactive['shadow'], hover['Child']['shadow'], active['Child']['shadow']}) == 3
        assert m.script("return (async()=>{" + HELPERS + """
          const original=Services.prefs.getStringPref('zzgroup.label.color');
          try {
            Services.prefs.setStringPref('zzgroup.label.color','inherit');
            Services.prefs.setStringPref('zzgroup.subfolder.active.label-color','var(--zzgroup-label-color, inherit)');
            await pause(100);
            const expected=getComputedStyle(subfolderStyleFixture.nativeFolder.labelElement).color;
            return ['Child','Grandchild'].every(name=>getComputedStyle(group(name).labelElement).color===expected);
          } finally { Services.prefs.setStringPref('zzgroup.label.color',original); }
        })();"""), 'Active subfolder default label colour differs from native folder foreground'
        m.script("gBrowser.selectedTab=subfolderStyleFixture.outside;Services.prefs.setBoolPref('zzgroup.subfolder.states',false);return true;")
        point()
        assert m.script(HELPERS + "return JSON.stringify(subfolderStyleFixture.read(group('Child')))===JSON.stringify(subfolderStyleFixture.baseline.child);"), 'Disabling subfolder states did not restore legacy styling'
        return {"subfolderStateStyles": True, "subfolderActivePrecedence": True,
                "subfolderHoverIsolation": True, "subfolderLegacyFallback": True, "subfolderDefaultForeground": True,
                "subfolderDefaultPalette": True, "subfolderSavedGradientStates": True,
                "folderToneIndependent": True, "subfolderContainerOverride": True}
    finally:
        m.script("""const f=window.subfolderStyleFixture;
          Services.prefs.setBoolPref('zzgroup.subfolder.states',false);
          Services.prefs.setIntPref('zzgroup.color-source',f.source);
          document.documentElement.style.setProperty('--zzg-tone',f.tone,f.tonePriority);
          for(const [key,type,had,value] of f.prefs) {
            if(had) Services.prefs['set'+type+'Pref'](key,value);else Services.prefs.clearUserPref(key);
          }
          gBrowser.selectedTab=f.selected;gBrowser.removeTab(f.outside);
          delete window.subfolderStyleFixture;return true;
        """)


def check(m, root, atg, port, first):
    m.script("return gZenStartup.promiseInitialized.then(()=>true);")
    m.script("window.fixtureURL=" + json.dumps(f"http://127.0.0.1:{port}") + "; return true;")
    if first:
        m.script("return (async()=>{" + HELPERS + """
          const rt=add(fixtureURL+'/root'), ct=add(fixtureURL+'/child'), gt=add(fixtureURL+'/grandchild');
          await loaded(rt); await loaded(ct); await loaded(gt); gBrowser.selectedTab=rt;
          const root=gBrowser.addTabGroup([rt],{label:'Root',insertBefore:rt});
          const child=gBrowser.addTabGroup([ct],{label:'Child',insertBefore:ct});
          const grandchild=gBrowser.addTabGroup([gt],{label:'Grandchild',insertBefore:gt});
          child.groupContainer.appendChild(grandchild);
          grandchild.addTabs([ct]); // Parent with no direct tabs must also survive restart.
          const folder=gZenFolders.createFolder([],{label:'Folder',renameFolder:false});
          gZenFolders.createFolder([],{label:'Subfolder',renameFolder:false,insertAfter:folder.groupContainer.lastElementChild});
          SessionStore.setCustomWindowValue(window,'tabGroupParents',JSON.stringify({[child.id]:root.id,[grandchild.id]:child.id}));
          SessionStore.setCustomWindowValue(window,'tabGroupIcons',JSON.stringify({[root.id]:'📁',[child.id]:'🦊'}));
          root.color=root.id+'-favicon'; child.color=child.id;
          SessionStore.setCustomWindowValue(window,'tabGroupColors',JSON.stringify({
            [root.id]:{favicon:'rgb(72, 120, 180)'},
            [child.id]:{gradientColors:[{c:'#336699',isCustom:true},{c:'#993366',isCustom:true}],opacity:0.6},
          }));
          root.collapsed=true;
          return true;
        })();""")
    sheets = ([atg / "userChrome.css"] if atg else []) + [root / "groupflow/userChrome.css"]
    m.script("""const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      for(const url of """ + json.dumps([p.resolve().as_uri() for p in sheets]) + """)
        ss.loadAndRegisterSheet(Services.io.newURI(url),ss.USER_SHEET);
      return true;""")
    # Sine sorts scripts by loadOrder, preserving installation order on ties.
    # Start with Groupflow installed first and inject after Zen is ready: this
    # reproduced ATG undoing the fold when Groupflow had no explicit loadOrder.
    scripts = []
    for directory in [root / "groupflow"] + ([atg] if atg else []):
        for filename, options in json.loads((directory / "theme.json").read_text())["scripts"].items():
            if filename.endswith(".uc.js"):
                scripts.append((options.get("loadOrder") or 10, directory / filename))
    for _, path in sorted(scripts, key=lambda entry: entry[0]):
        source = path.read_text()
        if path.name == "advanced-tab-groups.uc.js":
            source += "\nwindow.advancedTabGroups=globalThis.advancedTabGroups;"
        m.script(source + "\nreturn true;")
    groupflow = (root / "groupflow/groupflow.uc.js").read_text()
    result = m.script("return (async()=>{" + HELPERS + """
      await pause(2200); // Past both ATG delayed restore passes and Groupflow's icon refresh.
      const root=group('Root'), child=group('Child'), grandchild=group('Grandchild');
      if(!root || !child || !grandchild) throw new Error('Session did not restore fixture groups: '+
        JSON.stringify([...document.querySelectorAll('tab-group')].map(g=>[g.id,g.label])));
      const ct=grandchild.tabs[0], icon=grandchild.style.getPropertyValue('--zzgf-icon');
      const image=new Image(); image.src=icon.slice(5,-2); await image.decode();
      const folders=[...document.querySelectorAll('zen-folder')].filter(g=>['Folder','Subfolder'].includes(g.label));
      return {zen:Services.appinfo.version, rootOpen:!root.collapsed, childFolded:child.collapsed,
        nested:child.parentElement.closest('tab-group')===root && grandchild.group===child,
        grandchildFolded:grandchild.collapsed,
        nativeFolders:folders.length===2 && folders.every(g=>g.collapsed===(g.label==='Subfolder')),
        bodyHidden:getComputedStyle(child.groupContainer).display==='none', iconDecoded:image.naturalWidth>0,
        cachedIcon:icon.includes(gBrowser.getIcon(ct)),
        savedIcon:JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupIcons'))[child.id]==='🦊'};
    })();""")
    assert all(value is True for key, value in result.items() if key != "zen"), result
    # Manual expansion survives a Sine-style reinjection.
    m.script("[...document.querySelectorAll('tab-group')].find(g=>g.label==='Child').collapsed=false; return true;")
    m.script(groupflow + "\nreturn true;")
    assert m.script("return ![...document.querySelectorAll('tab-group')].find(g=>g.label==='Child').collapsed;")
    recursive = m.script("return (async()=>{" + HELPERS + """
      const click=g=>g.labelElement.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
      const tree=g=>[g,...g.querySelectorAll('tab-group:not([split-view-group]), zen-folder')];
      const root=group('Root'), child=group('Child'), grandchild=group('Grandchild');
      const folder=[...document.querySelectorAll('zen-folder')].find(g=>g.label==='Folder');
      const selected=gBrowser.selectedTab;
      const cycle=async g=>{
        const children=tree(g).slice(1), first=children.some(n=>!n.collapsed);
        let parentChanges=0;
        const observer=new MutationObserver(records=>parentChanges+=records.length);
        observer.observe(g,{attributes:true,attributeFilter:['collapsed']});
        try {
          for(const folded of [first,!first]) {
            click(g);await pause(100);
            if(g.collapsed || g.labelElement.getAttribute('aria-expanded')!=='true' ||
              !children.every(n=>n.collapsed===folded &&
                n.labelElement.getAttribute('aria-expanded')===String(!folded))) return false;
          }
          // Leave every tree open for the independent nested-header checks.
          if(!first) { click(g);await pause(100); }
          return parentChanges===0 && tree(g).every(n=>!n.collapsed);
        } finally { observer.disconnect(); }
      };
      const recursiveGroups=await cycle(root);
      const separateTree=tree(folder).every(g=>g.collapsed===(g!==folder));
      click(child);await pause(100);
      const nestedIndependent=child.collapsed && !root.collapsed && !grandchild.collapsed;
      click(child);await pause(100);
      const recursiveFolders=await cycle(folder);
      const otherTreeUnchanged=tree(root).every(g=>!g.collapsed);
      const siblingTab=add('about:blank');
      const sibling=gBrowser.addTabGroup([siblingTab],{label:'Inactive branch',insertBefore:siblingTab});
      root.groupContainer.appendChild(sibling);
      gBrowser.selectedTab=grandchild.tabs[0];
      for(const g of tree(root)) g.collapsed=false;
      await pause(100);
      click(root);await pause(100);
      const activePathOpen=[root,child,grandchild].every(g=>!g.collapsed &&
        g.labelElement.getAttribute('aria-expanded')==='true') && sibling.collapsed &&
        sibling.labelElement.getAttribute('aria-expanded')==='false';
      click(root);await pause(100);
      const otherBranchesReopen=tree(root).every(g=>!g.collapsed);
      gBrowser.selectedTab=selected;gBrowser.removeTab(siblingTab);
      const tab=add('about:blank'), leaf=gBrowser.addTabGroup([tab],{label:'Leaf toggle fixture',insertBefore:tab});
      leaf.collapsed=false;
      click(leaf);await pause(100);
      const leafCollapsed=leaf.collapsed;
      click(leaf);await pause(100);
      const leafIndependent=leafCollapsed && !leaf.collapsed;
      gBrowser.removeTab(tab);
      return {recursiveGroups,recursiveFolders,separateTree,nestedIndependent,otherTreeUnchanged,
        leafIndependent,activePathOpen,otherBranchesReopen,selectedTabRetained:gBrowser.selectedTab===selected};
    })();""")
    assert all(recursive.values()), recursive
    result.update(recursive)
    colours = m.script("return (async()=>{" + HELPERS + """
      const nodes=['Root','Child','Grandchild'].map(group);
      const oldBackground=getComputedStyle(nodes[1].labelContainerElement).backgroundImage;
      Services.prefs.setIntPref('zzgroup.color-source',3);
      Services.prefs.setBoolPref('zzgroup.favicons',false);
      Groupflow.refresh();await pause(100);
      const expected=getComputedStyle(nodes[0].tabs[0]).getPropertyValue('--identity-tab-color').trim();
      const containerColour=!!expected && nodes.every(g=>getComputedStyle(g).getPropertyValue('--zzgf-raw').trim()===expected);
      const gradientOverride=getComputedStyle(nodes[1].labelContainerElement).backgroundImage!==oldBackground;
      const {ContextualIdentityService:identities}=ChromeUtils.importESModule('moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs');
      const original={...identities.getPublicIdentityFromId(1),name:identities.getUserContextLabel(1)};
      let liveColour=false;
      try {
        identities.update(1,original.name,original.icon,original.color==='red'?'blue':'red');
        await until(()=>nodes.every(g=>g.style.getPropertyValue('--zzgf-container-color')!==expected));
        liveColour=nodes.every(g=>g.style.getPropertyValue('--zzgf-container-color')===
          getComputedStyle(g.tabs[0]).getPropertyValue('--identity-tab-color').trim());
      } finally {
        identities.update(1,original.name,original.icon,original.color);
        Services.prefs.setBoolPref('zzgroup.favicons',true);
        Services.prefs.setIntPref('zzgroup.color-source',0);Groupflow.refresh();
      }
      return {containerColour,gradientOverride,liveColour};
    })();""")
    assert all(colours.values()), colours
    result.update(colours)
    result['labelForeground'] = m.script("return (async()=>{" + HELPERS + """
      const nodes=['Root','Child','Grandchild'].map(group), selected=gBrowser.selectedTab;
      const folder=[...document.querySelectorAll('zen-folder')].find(g=>g.label==='Folder');
      const original=Services.prefs.getStringPref('zzgroup.label.color');
      const source=Services.prefs.getIntPref('zzgroup.color-source');
      const outside=add('about:blank');
      try {
        for(const label of ['inherit','#dbb4ff']) {
          Services.prefs.setStringPref('zzgroup.label.color',label);
          for(const accent of [0,2,3]) {
            Services.prefs.setIntPref('zzgroup.color-source',accent);
            for(const tab of [outside,nodes[2].tabs[0]]) {
              gBrowser.selectedTab=tab;
              for(const collapsed of [true,false]) {
                nodes[2].collapsed=collapsed;await pause(50);
                // Zen folders already use toolbar foreground, independent of group colours.
                const expected=label==='inherit'?getComputedStyle(folder.labelElement).color:'rgb(219, 180, 255)';
                if(!nodes.every(g=>getComputedStyle(g.labelElement).color===expected)) return false;
              }
            }
          }
        }
        return true;
      } finally {
        nodes[2].collapsed=false;gBrowser.selectedTab=selected;gBrowser.removeTab(outside);
        Services.prefs.setStringPref('zzgroup.label.color',original);
        Services.prefs.setIntPref('zzgroup.color-source',source);
      }
    })();""")
    assert result['labelForeground'], 'Group label colour changed with selection, collapse or accent source'
    result.update(check_subfolder_styles(m))
    if not atg:
        controls = m.script("return (async()=>{" + HELPERS + """
          await pause(100);
          const root=group('Root'), child=group('Child'), grandchild=group('Grandchild');
          const header=child.labelContainerElement;
          header.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0})); await pause(50);
          const toggled=child.collapsed && child.labelElement.getAttribute('aria-expanded')==='false';
          header.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0})); await pause(50);
          const manual=!child.collapsed;
          const icon=child.style.getPropertyValue('--zzgf-icon');
          const image=new Image(); image.src=icon.slice(5,-2); await image.decode();
          const colour=getComputedStyle(root).getPropertyValue('--tab-group-color').trim();
          const savedColour=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupColors'))[root.id].favicon;
          root.color=root.color; // Zen refreshes the same code without emitting TabGroupUpdate.
          const refreshedColour=getComputedStyle(root).getPropertyValue('--tab-group-color').trim();
          const gradient=getComputedStyle(child.labelContainerElement).backgroundImage;
          child.labelContainerElement.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));
          await pause(100);
          const editor=gBrowser.tabGroupMenu.activeGroup===child && gBrowser.tabGroupMenu.panel.state==='open';
          gBrowser.tabGroupMenu.close();
          // A cancelled native close must retain tabs and all saved state.
          const before=child.tabs.length, permit=gBrowser.runBeforeUnloadForTabs;
          try {
            gBrowser.runBeforeUnloadForTabs=async()=>true;
            child.labelContainerElement.querySelector('.zzgf-close').click(); await pause(100);
          } finally { gBrowser.runBeforeUnloadForTabs=permit; }
          const veto=child.isConnected && child.tabs.length===before &&
            JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupIcons'))[child.id]==='🦊';
          root.before(child); await pause(100);
          const moved=!JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupParents'))[child.id];
          root.groupContainer.appendChild(child); await pause(100);
          const a=add(fixtureURL+'/ungroup-a'), b=add(fixtureURL+'/ungroup-b');
          await loaded(a); await loaded(b);
          const outer=gBrowser.addTabGroup([a,b],{label:'Ungroup fixture',insertBefore:a});
          const inner=gBrowser.addTabGroup([a],{label:'Retained child',insertBefore:a});
          await pause(100);
          gBrowser.tabGroupMenu.openEditModal(outer);
          document.getElementById('tabGroupEditor_ungroupTabs').dispatchEvent(new Event('command',{bubbles:true,cancelable:true}));
          await until(()=>!outer.isConnected);
          const ungroup=inner.isConnected && !inner.group && a.group===inner && !b.group;
          const picker=gZenEmojiPicker.open;
          let pickerCalls=0;
          try {
            gZenEmojiPicker.open=async()=>{pickerCalls++;return null;};
            const before=inner.collapsed;
            inner.labelContainerElement.querySelector('.zzgf-icon').click();await pause(100);
            if(inner.collapsed===before) throw new Error('Favicon click did not toggle the group');
          } finally { gZenEmojiPicker.open=picker; }
          const id=inner.id;
          // Replay a saved ATG icon through the same live-update path as Sine.
          const icons=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupIcons'));
          icons[id]='chrome://browser/skin/zen-icons/folder.svg';
          SessionStore.setCustomWindowValue(window,'tabGroupIcons',JSON.stringify(icons));
          return {toggled,manual,customIconDecoded:image.naturalWidth>0,editor,veto,moved,
            ungroup,iconClickToggles:pickerCalls===0,
            savedColour:colour===savedColour && refreshedColour===savedColour,
            savedGradient:gradient.includes('linear-gradient'),
            oneSet:header.querySelectorAll('.zzgf-control').length===2 && !header.querySelector('.zzgf-toggle'),
            standalone:!window.advancedTabGroups};
        })();""")
        m.script(groupflow + "\nreturn true;")
        controls.update(m.script("return (async()=>{" + HELPERS + """
          await pause(100);
          const inner=group('Retained child'), id=inner.id;
          const b=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec.endsWith('/ungroup-b'));
          await gBrowser.removeTabGroup(inner); await until(()=>!inner.isConnected); await pause(100);
          const kept=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupIcons'))[id];
          const reopened=SessionStore.undoCloseTabGroup(window,id,window); await pause(200);
          const undo=kept==='chrome://browser/skin/zen-icons/folder.svg' &&
            reopened.style.getPropertyValue('--zzgf-icon').includes(kept);
          const parent=gBrowser.addTabGroup([b],{label:'Undo parent',insertBefore:b});
          parent.groupContainer.appendChild(reopened); reopened.addTabs([b]);
          await pause(100);
          const parentId=parent.id;
          await gBrowser.removeTabGroup(parent); await until(()=>!parent.isConnected); await pause(100);
          SessionStore.undoCloseTabGroup(window,parentId,window); await pause(200);
          const restored=document.getElementById(parentId), restoredChild=document.getElementById(id);
          const undoNested=restored?.tabs.length===2 && restoredChild?.group===restored &&
            restoredChild.style.getPropertyValue('--zzgf-icon').includes(kept);
          if (restored) gBrowser.removeTabs([...restored.tabs]);
          return {undo,undoNested};
        })();"""))
        assert all(controls.values()), controls
        result.update(controls)
        # Drive real pointer movement: .click() cannot detect a hidden hover control.
        for left in (False, True):
            xy = m.script("Services.prefs.setBoolPref('zzgroup.close-left'," + json.dumps(left) + ");" + HELPERS + """
              const r=group('Root').labelContainerElement.getBoundingClientRect();
              return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
            """)
            for x, y, visible in [(xy['x'], xy['y'], True), (800, 400, False)]:
                m.call('WebDriver:PerformActions', {'actions': [{'type': 'pointer', 'id': 'mouse',
                    'parameters': {'pointerType': 'mouse'}, 'actions': [
                        {'type': 'pointerMove', 'duration': 0, 'x': x, 'y': y}]}]})
                m.script("return (async()=>{" + HELPERS + """
                  const h=group('Root').labelContainerElement,b=h.querySelector('.zzgf-close'),icon=h.querySelector('.zzgf-icon');
                  const visible=""" + json.dumps(visible) + """;
                  await until(()=>{
                    const s=getComputedStyle(b);
                    return visible ? h.matches(':hover') && s.visibility==='visible' &&
                      +s.opacity>.99 && b.getBoundingClientRect().width>0 && +getComputedStyle(icon).opacity<.01 : +s.opacity<.01;
                  }); return true;
                })();""")
            assert m.script(HELPERS + """
              const h=group('Root').labelContainerElement;
              const a=h.querySelector('.zzgf-icon').getBoundingClientRect(),b=h.querySelector('.zzgf-close').getBoundingClientRect();
              return Math.abs(a.x-b.x)<1 && Math.abs(a.y-b.y)<1 && Math.abs(a.width-b.width)<1 && Math.abs(a.height-b.height)<1;
            """), 'Close button moved outside the favicon slot'
            assert m.script("return (async()=>{" + HELPERS + """
              const b=group('Root').labelContainerElement.querySelector('.zzgf-close');b.focus();
              await until(()=>getComputedStyle(b).opacity==='1' && b.getBoundingClientRect().width>0);
              const visible=getComputedStyle(b).visibility==='visible';b.blur();return visible;
            })();""")
        result['hoverAndFocusClose'] = True
        result['nativeCloseImageSize'] = m.script(HELPERS + """
          const close=group('Root').labelContainerElement.querySelector('.zzgf-close');
          const image=getComputedStyle(close,'::before');
          const native=getComputedStyle(group('Root').tabs[0].querySelector('.tab-close-button'));
          const width=parseFloat(native.width)-parseFloat(native.paddingLeft)-parseFloat(native.paddingRight);
          const height=parseFloat(native.height)-parseFloat(native.paddingTop)-parseFloat(native.paddingBottom);
          return !close.textContent && image.backgroundImage.includes('zen-icons/close.svg') &&
            native.listStyleImage.includes('zen-icons/close.svg') && width>0 && height>0 &&
            image.getPropertyValue('-moz-context-properties').includes('fill') &&
            image.fill===getComputedStyle(close).color &&
            Math.abs(parseFloat(image.width)-width)<1 && Math.abs(parseFloat(image.height)-height)<1;
        """)
        assert result['nativeCloseImageSize'], 'Folder close image differs from native tab close image'
        result['iconMatchesFolderCorners'] = m.script("return (async()=>{" + HELPERS + """
          const g=group('Child'),h=g.labelContainerElement,icon=h.querySelector('.zzgf-icon');
          const prefs=[['icon-shape','Int'],['corner.mode','Int'],['header-roundness','String'],['icon-size','String']]
            .map(([name,type])=>['zzgroup.'+name,type,Services.prefs['get'+type+'Pref']('zzgroup.'+name)]);
          try {
            Services.prefs.setIntPref('zzgroup.icon-shape',5);Groupflow.refresh();
            for(const [shape,radius,size] of [[1,12,14],[1,18,14],[5,18,24]]) {
              Services.prefs.setIntPref('zzgroup.corner.mode',shape);
              Services.prefs.setStringPref('zzgroup.header-roundness',radius+'px');
              Services.prefs.setStringPref('zzgroup.icon-size',size+'px');await pause(50);
              const image=getComputedStyle(icon,'::before'),header=getComputedStyle(h);
              const expected=parseFloat(header.borderTopLeftRadius)*size/36;
              if(g.getAttribute('zzgf-shape')!=='folder' || image.cornerShape!==header.cornerShape ||
                Math.abs(parseFloat(image.width)-size)>.1 ||
                Math.abs(parseFloat(image.borderTopLeftRadius)-expected)>.1) throw new Error(JSON.stringify({
                  shape,radius,size,expected,mode:g.getAttribute('zzgf-shape'),imageShape:image.cornerShape,
                  headerShape:header.cornerShape,width:image.width,iconRadius:image.borderTopLeftRadius,
                  headerRadius:header.borderTopLeftRadius}));
            }
            Services.prefs.setIntPref('zzgroup.icon-shape',1);Groupflow.refresh();await pause(50);
            const image=getComputedStyle(icon,'::before');
            return g.getAttribute('zzgf-shape')==='circle' && ['round','superellipse(1)'].includes(image.cornerShape) && image.borderTopLeftRadius==='50%';
          } finally {
            for(const [key,type,value] of prefs) Services.prefs['set'+type+'Pref'](key,value);
            Groupflow.refresh();
          }
        })();""")
        assert result['iconMatchesFolderCorners'], 'Folder icon crop does not follow header shape, radius or icon size'
    if first:
        m.script("return (async()=>{" + HELPERS + """
          const target=add(fixtureURL.replace('127.0.0.1','localhost')+'/target',2);
          const source=add(fixtureURL+'/source'); await loaded(target); await loaded(source);
          const destination=await gZenWorkspaces.createAndSaveWorkspace('Folder destination',undefined,false,2);
          gZenWorkspaces.moveTabToWorkspace(target,destination.uuid);
          window.fixtureDestinationID=destination.uuid;
          gBrowser.addTabGroup([target],{label:'Destination',insertBefore:target});
          gBrowser.addTabGroup([source],{label:'Source',insertBefore:source});
          Services.prefs.setStringPref('zzrouter.rules','localhost > Destination');
          Services.prefs.setBoolPref('zzrouter.enabled',true);
          return true;
        })();""")
        m.script((root / "tab-router/tab-router.uc.js").read_text() + "\nreturn true;")
        routed = m.script("return (async()=>{" + HELPERS + """
          const url=fixtureURL.replace('127.0.0.1','localhost')+'/frames';
          // A legacy delay preference and continuous title events must not
          // postpone group/workspace filing until a slow subframe finishes.
          Services.prefs.setIntPref('zzrouter.delay-ms',5000);
          const t=add(url);group('Source').addTabs([t]);gBrowser.selectedTab=t;
          let labels=0;
          const chatter=setInterval(()=>{
            labels++;
            t.dispatchEvent(new CustomEvent('TabAttrModified',{bubbles:true,detail:{changed:['label']}}));
          },20);
          let routeBeforeLoad;
          try {
            await until(()=>t.linkedBrowser.currentURI.spec===url && t.hasAttribute('busy'));
            await pause(100);
            routeBeforeLoad=t.isConnected && t.hasAttribute('busy') && t.userContextId===1 &&
              t.group===group('Destination') && t.getAttribute('zen-workspace-id')===fixtureDestinationID;
          } finally { clearInterval(chatter); }
          if(!routeBeforeLoad) throw new Error('Busy tab did not file immediately with delay-ms=5000 and title events');
          await until(()=>!t.isConnected);
          await until(()=>[...document.querySelectorAll('tab')].some(t=>t.linkedBrowser?.currentURI?.spec===url));
          const fresh=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec===url);
          await loaded(fresh);
          const routed=fresh.userContextId===2 && fresh.group===group('Destination');
          // Once filed, pending container repair must survive skip-grouped
          // even when refile-mismatched is disabled.
          Services.prefs.setBoolPref('zzrouter.skip-grouped',true);
          Services.prefs.setBoolPref('zzrouter.refile-mismatched',false);
          let strictRepair;
          try {
            const strictURL=url+'?strict',strict=add(strictURL);
            await until(()=>strict.linkedBrowser.currentURI.spec===strictURL && strict.hasAttribute('busy'));
            await pause(100);
            if(strict.group!==group('Destination') || !strict.hasAttribute('busy') || strict.userContextId!==1)
              throw new Error('Ungrouped busy tab did not file before strict container retry');
            await until(()=>!strict.isConnected);
            await until(()=>[...document.querySelectorAll('tab')].some(t=>t.linkedBrowser?.currentURI?.spec===strictURL));
            const replacement=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec===strictURL);
            await loaded(replacement);
            strictRepair=replacement.userContextId===2 && replacement.group===group('Destination') &&
              replacement.getAttribute('zen-workspace-id')===fixtureDestinationID;
          } finally {
            Services.prefs.setBoolPref('zzrouter.refile-mismatched',true);
            Services.prefs.clearUserPref('zzrouter.delay-ms');
          }
          // Reproduce an old-version tab already filed in the right group with the wrong container.
          Services.prefs.setBoolPref('zzrouter.enabled',false);
          const old=add(fixtureURL.replace('127.0.0.1','localhost')+'/filed');
          const child=gBrowser.addTabGroup([old],{label:'Manual subgroup',insertBefore:old});
          group('Destination').groupContainer.appendChild(child);
          await loaded(old);
          Services.prefs.setBoolPref('zzrouter.enabled',true);
          await TabRouter.sortAll();
          await until(()=>!old.isConnected);
          await until(()=>[...document.querySelectorAll('tab')].some(t=>t.linkedBrowser?.currentURI?.spec.endsWith('/filed')));
          const repaired=[...document.querySelectorAll('tab')].find(t=>t.linkedBrowser?.currentURI?.spec.endsWith('/filed'));
          await loaded(repaired);
          return {routeBeforeLoad,retitleNoStarvation:labels>0,routed,strictRepair,
            repaired:repaired.getAttribute('usercontextid')==='2' && repaired.group.label==='Manual subgroup'};
        })();""")
        assert all(routed.values()), routed
        result.update(routed)
        result.update(check_native_routes(m, root))
    else:
        m.script((root / "tab-router/tab-router.uc.js").read_text() + "\nreturn true;")
    result['channelAvatarRendered'] = m.script("return (async()=>{" + HELPERS + """
      const canvas=new OffscreenCanvas(64,64),ctx=canvas.getContext('2d');
      ctx.fillStyle='#f80';ctx.fillRect(0,0,64,64);
      const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      const avatar='data:image/png;base64,'+btoa(String.fromCharCode(...bytes));
      Services.prefs.setBoolPref('zzrouter.section-icons',true);
      Services.prefs.setStringPref('zzrouter.avatars',JSON.stringify({grandchild:{d:avatar,s:'round'}}));
      const g=group('Grandchild');await until(()=>g.style.getPropertyValue('--zzgf-icon').includes(avatar));
      const image=new Image();image.src=avatar;await image.decode();
      return g.getAttribute('zzgf-shape')==='circle' && image.naturalWidth===64;
    })();""")
    assert result['channelAvatarRendered'], result
    # Leave the child open in the saved session: the next launch must fold it again.
    m.script("""Services.prefs.setBoolPref('zzrouter.enabled',false);
      const root=[...document.querySelectorAll('tab-group')].find(g=>g.label==='Root');
      gBrowser.selectedTab=root.tabs[0]; return true;""")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--atg", type=Path, help="Load ATG on launch 1, then test migration without it on launches 2 and 3")
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
                      "zzrouter.media-subgroups": False, "zzrouter.section-icons": False,
                      "zzgroup.subfolder.states": False})
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
                                raise RuntimeError(f"Zen exited {process.returncode}: " + (profile / "browser.log").read_text()[-2000:])
                            time.sleep(.2)
                    m = Marionette(port)
                    atg = args.atg if launch == 0 else None
                    print(json.dumps({"launch": launch + 1, **check(m, root, atg, server.server_port, launch == 0)}), flush=True)
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
