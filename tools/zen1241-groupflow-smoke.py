#!/usr/bin/env python3
"""Groupflow on Zen 1.24.1b: Essentials from nested folders, restarts and a second window.

python tools/zen1241-groupflow-smoke.py --zen /path/to/zen [--json out.json]

Three launches of one disposable profile; never touches a real profile.
1. A pinned tab in a nested Zen folder and an unpinned tab in a nested plain
   group are added to Essentials through Zen's own context-menu command
   (Zen 1.24.1b, gh-16418, offers it for grouped tabs).
2. After a restart they stay Essentials, then Zen's Remove from Essentials
   command takes them out.
3. After another restart they stay outside every folder; a second synced window
   loads Groupflow too, mirrors the nested folders and follows a third
   Essentials move made in the first window.
   A nested folder made in the first window (gh-16390 stamps nested folders
   with the space id) keeps that space and its saved details in both windows.
Every launch checks the folders, the saved nesting, Groupflow's counts, startup
folding and collapse visibility. Saved-gradient headers are covered by
zen-routing-smoke.py.

Commands are dispatched directly (synthetic): this does not verify physical
pointer input or rendered pixels.
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

ROOT = Path(__file__).resolve().parent.parent
Marionette = runpy.run_path(str(Path(__file__).with_name("zen-smoke.py")))["Marionette"]


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        body = (f"<title>GF {self.path.strip('/')}</title><link rel='icon' href='data:image/svg+xml,"
                "%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22%3E"
                "%3Crect width=%2216%22 height=%2216%22 fill=%22teal%22/%3E%3C/svg%3E'>").encode()
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


# Fixture tabs carry a session-persisted name, so restored lazy tabs are found
# without depending on their (possibly unloaded) document.
HELPERS = """
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, what) => {
    for (let i = 0; i < 200; i++) { if (fn()) return; await pause(50); }
    throw new Error('Timed out: ' + what);
  };
  const real = el => !el.closest('zen-library');
  const container = (label, w = window) =>
    [...w.document.querySelectorAll('tab-group, zen-folder')].find(g => g.label === label && real(g));
  const fixture = name => [...gBrowser.tabs].find(t => !t.closing && SessionStore.getCustomTabValue(t, 'gfFixture') === name);
  const essential = t => !!t && t.hasAttribute('zen-essential') && t.pinned && !t.group &&
    !!t.closest('.zen-essentials-container') && !t.closest('tab-group, zen-folder');
  const loose = t => !!t && !t.hasAttribute('zen-essential') && !t.pinned && !t.group &&
    !t.closest('tab-group, zen-folder, .zen-essentials-container');
  // On screen and exposed, with no collapsed-folder marker left behind.
  const shown = t => t.visible && t.getBoundingClientRect().height > 0 && !t.hasAttribute('zzgf-visible') &&
    t.getAttribute('aria-hidden') !== 'true';
  const status = (g, w = window) => { const s = w.Groupflow.folderStatus(g); return [s.loaded, s.total]; };
  const badge = (g, w = window) => g.labelContainerElement.querySelector(':scope > .zzgf-count')?.textContent ?? null;
  const parents = (w = window) => JSON.parse(w.SessionStore.getCustomWindowValue(w, 'tabGroupParents') || '{}');
  const details = (w = window) => JSON.parse(w.SessionStore.getCustomWindowValue(w, 'groupflowGroups') || '{}');
  const command = async (tab, id, w = window) => {
    w.TabContextMenu.contextTab = tab;
    w.gZenPinnedTabManager.updatePinnedTabContextMenu(tab);
    w.document.getElementById(id).doCommand();
    await pause(700); // Groupflow refits after 150ms and saves on the next task.
  };
"""

SETUP = """
  const sys = Services.scriptSecurityManager.getSystemPrincipal();
  const add = name => {
    const t = gBrowser.addTab(fixtureURL + '/' + name, { triggeringPrincipal: sys, skipAnimation: true });
    SessionStore.setCustomTabValue(t, 'gfFixture', name);
    return t;
  };
  const names = ['folder-direct', 'pin-essential', 'pin-stay', 'root-direct', 'plain-essential', 'plain-stay'];
  const tabs = Object.fromEntries(names.map(name => [name, add(name)]));
  for (const t of Object.values(tabs)) {
    gBrowser.selectedTab = t;
    await until(() => /^http:/.test(t.linkedBrowser.currentURI.spec) && !t.hasAttribute('busy'), 'fixture load');
  }
  const folder = gZenFolders.createFolder([tabs['folder-direct']], { label: 'GF Folder', renameFolder: false });
  gZenFolders.createFolder([tabs['pin-essential'], tabs['pin-stay']],
    { label: 'GF Subfolder', renameFolder: false, insertAfter: folder.groupContainer.lastElementChild });
  const root = gBrowser.addTabGroup([tabs['root-direct']], { label: 'GF Root', insertBefore: tabs['root-direct'] });
  const child = gBrowser.addTabGroup([tabs['plain-essential'], tabs['plain-stay']],
    { label: 'GF Child', insertBefore: tabs['plain-essential'] });
  root.groupContainer.appendChild(child);
  // The tab used from the context menu is usually the one in front.
  gBrowser.selectedTab = tabs['pin-essential'];
  return true;
"""

# Console errors from Groupflow (console.error) and uncaught script errors.
ERRORS = """
  window.gfErrors = [];
  const storage = Cc['@mozilla.org/consoleAPI-storage;1'].getService(Ci.nsIConsoleAPIStorage);
  window.gfConsole = message => {
    if (message.level === 'error' && JSON.stringify(message.arguments ?? []).includes('Groupflow')) gfErrors.push(JSON.stringify(message.arguments).slice(0, 300));
  };
  storage.addLogEventListener(gfConsole, Services.scriptSecurityManager.getSystemPrincipal());
  window.gfScript = { observe(m) { if (m instanceof Ci.nsIScriptError && !(m.flags & 1) && /groupflow/i.test(m.sourceName + m.errorMessage)) gfErrors.push(m.errorMessage.slice(0, 300)); } };
  Services.console.registerListener(gfScript);
  return true;
"""

STRUCTURE = """
  const folder = container('GF Folder'), sub = container('GF Subfolder');
  const root = container('GF Root'), child = container('GF Child');
  const has = (g, name) => !!g && g.tabs.includes(fixture(name));
  return {
    zen: Services.appinfo.version,
    foldersNested: !!folder && !!sub && sub.group === folder && sub.isZenFolder && folder.isZenFolder,
    groupsNested: !!root && !!child && child.group === root && !child.isZenFolder,
    folderKeepsDirect: has(folder, 'folder-direct') && fixture('folder-direct').group === folder,
    rootKeepsDirect: has(root, 'root-direct') && fixture('root-direct').group === root,
    savedParent: !!root && !!child && parents()[child.id] === root.id,
    savedDetails: ['GF Folder', 'GF Subfolder', 'GF Root', 'GF Child'].every(label => {
      const g = container(label);
      return g && details()[g.id]?.label === label && details()[g.id]?.workspace === (g.closest('zen-workspace')?.id || g.getAttribute('zen-workspace-id'));
    }),
    ids: { folder: folder?.id, sub: sub?.id, root: root?.id, child: child?.id },
    counts: Object.fromEntries([['folder', folder], ['sub', sub], ['root', root], ['child', child]]
      .map(([key, g]) => [key, g ? status(g)[1] : null])),
    badgesMatch: [folder, sub, root, child].every(g => g && badge(g) === status(g).join('/')),
    collapsed: Object.fromEntries([['folder', folder], ['sub', sub], ['root', root], ['child', child]]
      .map(([key, g]) => [key, g?.collapsed ?? null])),
    errors: gfErrors.slice(),
  };
"""

FAILURES = []


def load_groupflow(m, windows="[window]"):
    # Sine loads mod scripts with loadSubScript; a resource: alias serves the checkout.
    m.script("""
      const handler = Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
      handler.setSubstitution('zzgf-smoke', Services.io.newURI(""" + json.dumps((ROOT / "groupflow").as_uri() + "/") + """));
      const ss = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
      const sheet = Services.io.newURI('resource://zzgf-smoke/userChrome.css');
      if (!ss.sheetRegistered(sheet, ss.USER_SHEET)) ss.loadAndRegisterSheet(sheet, ss.USER_SHEET);
      for (const w of """ + windows + """) Services.scriptloader.loadSubScript('resource://zzgf-smoke/groupflow.uc.js', w);
      return true;""")
    m.script("return (async()=>{" + HELPERS + """
      await until(() => window.Groupflow && window.__zzgroupInstance?.startupFolded, 'Groupflow ready');
      await pause(800);
      return true;
    })();""")


def run(m, script):
    return m.script("return (async()=>{" + HELPERS + script + "})();")


def expect(result, keys):
    failed = [k for k in keys if result.get(k) is not True]
    assert not failed, (failed, result)


def launch1(m, out):
    run(m, SETUP)
    m.script(ERRORS)
    load_groupflow(m)
    before = run(m, STRUCTURE)
    expect(before, ["foldersNested", "groupsNested", "folderKeepsDirect", "rootKeepsDirect", "savedParent", "savedDetails", "badgesMatch"])
    assert before["counts"] == {"folder": 3, "sub": 2, "root": 3, "child": 2}, before
    out["ids"] = before["ids"]
    added = run(m, """
      const pe = fixture('pin-essential'), pl = fixture('plain-essential');
      const offered = {};
      for (const [key, tab] of [['pinnedInFolder', pe], ['plainInGroup', pl]]) {
        TabContextMenu.contextTab = tab; gZenPinnedTabManager.updatePinnedTabContextMenu(tab);
        offered[key] = !document.getElementById('context_zen-add-essential').hidden &&
          !document.getElementById('cmd_contextZenAddToEssentials').hasAttribute('disabled');
      }
      await command(pe, 'cmd_contextZenAddToEssentials');
      await command(pl, 'cmd_contextZenAddToEssentials');
      // Collapse every container: Essentials stay on screen, folders keep their rules.
      const all = ['GF Folder', 'GF Subfolder', 'GF Root', 'GF Child'].map(l => container(l));
      for (const g of all) g.collapsed = true;
      await pause(300);
      const collapsedEssentialsShown = shown(pe) && shown(pl);
      for (const g of all) g.collapsed = false;
      await pause(300);
      return { offered, pinnedEssential: essential(pe), plainEssential: essential(pl),
        selectedStillFront: gBrowser.selectedTab === pe, collapsedEssentialsShown };
    """)
    expect(added, ["pinnedEssential", "plainEssential", "collapsedEssentialsShown"])
    after = run(m, STRUCTURE)
    expect(after, ["foldersNested", "groupsNested", "folderKeepsDirect", "rootKeepsDirect", "savedParent", "savedDetails", "badgesMatch"])
    assert after["counts"] == {"folder": 2, "sub": 1, "root": 2, "child": 1}, after
    assert after["ids"] == before["ids"], (before, after)
    assert not after["errors"], after
    out["launch1"] = {"before": before, "added": added, "after": after}


def launch2(m, out):
    ids = out["ids"]
    m.script(ERRORS)
    load_groupflow(m)
    restored = run(m, STRUCTURE)
    # Startup folding has collapsed their former subfolder and subgroup.
    essentials = run(m, """
      const pe = fixture('pin-essential'), pl = fixture('plain-essential');
      return { pinnedEssential: essential(pe), plainEssential: essential(pl),
        shownWhileFolded: container('GF Subfolder').collapsed && container('GF Child').collapsed && shown(pe) && shown(pl) };
    """)
    expect(restored, ["foldersNested", "groupsNested", "folderKeepsDirect", "rootKeepsDirect", "savedParent", "savedDetails", "badgesMatch"])
    expect(essentials, ["pinnedEssential", "plainEssential", "shownWhileFolded"])
    assert restored["ids"] == ids, (ids, restored)
    assert restored["counts"] == {"folder": 2, "sub": 1, "root": 2, "child": 1}, restored
    assert restored["collapsed"] == {"folder": False, "sub": True, "root": False, "child": True}, restored
    removed = run(m, """
      const pe = fixture('pin-essential'), pl = fixture('plain-essential');
      const offered = [pe, pl].every(t => {
        TabContextMenu.contextTab = t; gZenPinnedTabManager.updatePinnedTabContextMenu(t);
        return !document.getElementById('context_zen-remove-essential').hidden;
      });
      await command(pe, 'cmd_contextZenRemoveFromEssentials');
      await command(pl, 'cmd_contextZenRemoveFromEssentials');
      const active = gZenWorkspaces.activeWorkspace;
      return { offered, pinnedLoose: loose(pe), plainLoose: loose(pl), shown: shown(pe) && shown(pl),
        activeSpace: [pe, pl].every(t => t.getAttribute('zen-workspace-id') === active) };
    """)
    expect(removed, ["offered", "pinnedLoose", "plainLoose", "shown", "activeSpace"])
    after = run(m, STRUCTURE)
    expect(after, ["foldersNested", "groupsNested", "folderKeepsDirect", "rootKeepsDirect", "savedParent", "savedDetails", "badgesMatch"])
    assert after["counts"] == {"folder": 2, "sub": 1, "root": 2, "child": 1}, after
    assert not after["errors"], after
    out["launch2"] = {"restored": restored, "essentials": essentials, "removed": removed, "after": after}


def launch3(m, out):
    ids = out["ids"]
    m.script(ERRORS)
    load_groupflow(m)
    restored = run(m, STRUCTURE)
    stayed = run(m, "return { pinnedLoose: loose(fixture('pin-essential')), plainLoose: loose(fixture('plain-essential')) };")
    expect(restored, ["foldersNested", "groupsNested", "folderKeepsDirect", "rootKeepsDirect", "savedParent", "savedDetails", "badgesMatch"])
    expect(stayed, ["pinnedLoose", "plainLoose"])
    assert restored["ids"] == ids and restored["counts"] == {"folder": 2, "sub": 1, "root": 2, "child": 1}, restored
    # A second synced window runs its own Groupflow copy.
    m.script("""return (async()=>{""" + HELPERS + """
      const w = OpenBrowserWindow();
      await until(() => w.gBrowserInit?.delayedStartupFinished, 'second window');
      await w.gZenStartup.promiseInitialized;
      window.gfSecond = w;
      return true;
    })();""")
    load_groupflow(m, "[gfSecond]")
    second = run(m, """
      const w = gfSecond;
      await until(() => w.Groupflow && w.__zzgroupInstance?.startupFolded, 'second Groupflow');
      await pause(800);
      const folder = container('GF Folder'), sub = container('GF Subfolder');
      const mirror = id => w.gZenWindowSync?.getItemFromWindow(w, id);
      const f2 = mirror(folder.id), s2 = mirror(sub.id);
      const stay = fixture('pin-stay'), stay2 = mirror(stay.id);
      const firstCollapsed = [folder.collapsed, sub.collapsed];
      const result = {
        windowSync: !!w.gZenWindowSync,
        mirroredNested: !!f2 && !!s2 && s2.group === f2 && f2.label === 'GF Folder' && s2.label === 'GF Subfolder',
        sameSpace: !!f2 && !!s2 && f2.getAttribute('zen-workspace-id') === folder.getAttribute('zen-workspace-id') &&
          s2.getAttribute('zen-workspace-id') === sub.getAttribute('zen-workspace-id'),
        mirroredTab: !!stay2 && stay2.group === s2 && stay2 !== stay,
        secondCounts: f2 && s2 ? [status(f2, w)[1], status(s2, w)[1]] : null,
        secondBadges: !!f2 && !!s2 && badge(f2, w) === status(f2, w).join('/') && badge(s2, w) === status(s2, w).join('/'),
        secondFold: !!f2 && !!s2 && !f2.collapsed && s2.collapsed,
        secondDetails: !!f2 && details(w)[f2.id]?.label === 'GF Folder' && details(w)[s2.id]?.workspace === s2.getAttribute('zen-workspace-id'),
      };
      // Essentials from a nested folder, made in the first window.
      await command(stay, 'cmd_contextZenAddToEssentials');
      await until(() => mirror(stay.id)?.hasAttribute('zen-essential'), 'mirrored Essential');
      await pause(700);
      const m2 = mirror(stay.id);
      Object.assign(result, {
        firstEssential: essential(stay),
        secondEssential: !!m2 && m2.hasAttribute('zen-essential') && !m2.group && !m2.closest('tab-group, zen-folder'),
        firstCollapseUnchanged: JSON.stringify([folder.collapsed, sub.collapsed]) === JSON.stringify(firstCollapsed),
        countsAfter: [status(folder)[1], status(sub)[1], status(f2, w)[1], status(s2, w)[1]],
        badgesAfter: badge(sub) === status(sub).join('/') && badge(s2, w) === status(s2, w).join('/'),
      });
      // A nested folder made in the first window keeps its name and space in the second.
      const made = gZenFolders.createFolder([], { label: 'GF Synced', renameFolder: false, insertAfter: folder.groupContainer.lastElementChild });
      await until(() => mirror(made.id), 'mirrored new folder');
      await pause(700);
      const made2 = mirror(made.id);
      Object.assign(result, {
        newFolderMirrored: made2.label === 'GF Synced' && made2.group === f2 &&
          made.getAttribute('zen-workspace-id') === gZenWorkspaces.activeWorkspace &&
          made2.getAttribute('zen-workspace-id') === made.getAttribute('zen-workspace-id'),
        newFolderSaved: details(w)[made2.id]?.label === 'GF Synced' && details()[made.id]?.label === 'GF Synced',
      });
      made.delete();
      await until(() => !mirror(made.id), 'mirrored folder removed');
      w.close();
      await until(() => w.closed, 'second window closed');
      await pause(300);
      result.firstStillIntact = !!container('GF Folder') && container('GF Subfolder')?.group === container('GF Folder') &&
        essential(stay) && !!window.Groupflow;
      result.errors = gfErrors.slice();
      return result;
    """)
    expect(second, ["windowSync", "mirroredNested", "sameSpace", "mirroredTab", "secondBadges", "secondFold", "secondDetails",
                    "firstEssential", "secondEssential", "firstCollapseUnchanged", "badgesAfter", "newFolderMirrored",
                    "newFolderSaved", "firstStillIntact"])
    assert second["secondCounts"] == [2, 1] and second["countsAfter"] == [1, 0, 1, 0], second
    assert not second["errors"], second
    out["launch3"] = {"restored": restored, "stayed": stayed, "second": second}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zen", type=Path, required=True)
    parser.add_argument("--json", type=Path, help="Write all results here")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Page)
    Thread(target=server.serve_forever, daemon=True).start()
    out = {}
    with tempfile.TemporaryDirectory(prefix="zen1241-groupflow-") as directory:
        profile = Path(directory)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
        prefs = {"marionette.port": port, "browser.shell.checkDefaultBrowser": False,
                 "browser.aboutwelcome.enabled": False, "zen.welcome-screen.seen": True,
                 "zen.welcome-screen.enabled": False, "browser.startup.page": 3,
                 "zen.workspaces.continue-where-left-off": True,
                 "browser.tabs.groups.arc-style": True, "browser.tabs.groups.folder-look": True}
        for pref in json.loads((ROOT / "groupflow/preferences.json").read_text()):
            if "property" in pref and "defaultValue" in pref:
                prefs[pref["property"]] = pref["defaultValue"]
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
                    m.call("WebDriver:SetTimeouts", {"script": 120000})
                    m.script("return gZenStartup.promiseInitialized.then(()=>true);")
                    m.script("window.fixtureURL=" + json.dumps(f"http://127.0.0.1:{server.server_port}") + "; return true;")
                    try:
                        [launch1, launch2, launch3][launch](m, out)
                    except AssertionError as error:
                        FAILURES.append(f"launch {launch + 1}: {error}")
                        if "ids" not in out:
                            raise
                    m.call("Marionette:Quit", {"flags": ["eAttemptQuit"]})
                    process.wait(timeout=30)
                    m.sock.close()
                finally:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill(); process.wait()
    server.shutdown()
    if args.json:
        args.json.write_text(json.dumps(out, indent=1))
    print(json.dumps(out))
    assert not FAILURES, FAILURES


if __name__ == "__main__":
    main()
