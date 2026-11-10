#!/usr/bin/env python3
"""Exercise the passive freeze collector in two disposable Zen windows.

python3 tools/zen-freeze-smoke.py --zen /path/to/zen --output /tmp/zen-freeze-check
Does not attach to a user's profile. This tests the collector, not Windows lag.
"""
import argparse
import json
import os
from pathlib import Path
import runpy
import socket
import subprocess
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
Marionette = runpy.run_path(str(ROOT / 'tools/zen-smoke.py'))['Marionette']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zen', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory(prefix='zen-freeze-check-') as temporary:
    profile = Path(temporary)
    folder = profile / 'chrome/sine-mods'
    folder.mkdir(parents=True)
    mods = ['glassflow', 'groupflow', 'iconflow']
    for mod in mods:
        manifest = json.loads((ROOT / mod / 'theme.json').read_text())
        (folder / manifest['id']).symlink_to(ROOT / mod, target_is_directory=True)
    with socket.socket() as connection:
        connection.bind(('127.0.0.1', 0))
        port = connection.getsockname()[1]
    prefs = {'marionette.port': port, 'browser.shell.checkDefaultBrowser': False,
             'zen.welcome-screen.seen': True, 'zen.welcome-screen.enabled': False,
             'sine.auto-updates': False, 'browser.download.folderList': 2,
             'browser.download.dir': str(out), 'zen.window-sync.enabled': True}
    (profile / 'user.js').write_text('\n'.join(
        f'user_pref({json.dumps(key)}, {json.dumps(value)});' for key, value in prefs.items()))
    with (out / 'browser.log').open('w') as log:
        process = subprocess.Popen([str(args.zen.resolve()), '--headless', '--no-remote',
                                    '--profile', str(profile), '--marionette',
                                    '--remote-allow-system-access', 'about:blank'], stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.2):
                        break
                except OSError:
                    time.sleep(.2)
            browser = Marionette(port)
            browser.script('return gZenStartup.promiseInitialized.then(()=>true);')
            browser.script('window.freezeChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"]'
                           '.getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI('
                           + json.dumps((profile / 'chrome.manifest').as_uri()) + '),'
                           + json.dumps([['content', 'sine', folder.as_uri() + '/']]) + ');return true;')
            browser.script('''return (async()=>{
              window.freezeSecond=OpenBrowserWindow();
              for(let i=0;i<200&&!freezeSecond.gBrowserInit?.delayedStartupFinished;i++)
                await new Promise(resolve=>setTimeout(resolve,50));
              await freezeSecond.gZenStartup.promiseInitialized;return true;
            })();''')
            for mod in mods:
                manifest = json.loads((ROOT / mod / 'theme.json').read_text())
                defaults = {row['property']: row['defaultValue']
                            for row in json.loads((ROOT / mod / 'preferences.json').read_text())
                            if 'property' in row and 'defaultValue' in row}
                browser.script('for(const[k,v]of Object.entries(' + json.dumps(defaults)
                               + '))if(Services.prefs.getPrefType(k)===0)Services.prefs['
                               'typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
                base = 'chrome://sine/content/' + manifest['id'] + '/'
                browser.script('Cc["@mozilla.org/content/style-sheet-service;1"]'
                               '.getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI('
                               + json.dumps(base + 'userChrome.css') + '),1);return true;')
                for script in manifest['scripts']:
                    if script.endswith('.uc.js'):
                        browser.script('for(const w of [window,freezeSecond])Services.scriptloader.loadSubScript('
                                       + json.dumps(base + script) + ',w);return true;')
            time.sleep(1)
            browser.script('''window.freezePrefs=()=>JSON.stringify(Services.prefs.getChildList('zz').map(k=>[
              k,Services.prefs.prefHasUserValue(k),Services.prefs.getPrefType(k)===128?
              Services.prefs.getBoolPref(k):Services.prefs.getPrefType(k)===64?
              Services.prefs.getIntPref(k):Services.prefs.getStringPref(k)]));return true;''')
            before = browser.script('return freezePrefs();')
            source = (ROOT / 'tools/zen-freeze-probe.js').read_text()
            browser.script('window.freezeResult=null;window.freezePromise=' + source
                           + '\nfreezePromise.then(r=>{window.freezeResult=r;});return true;')
            time.sleep(1)
            # Known main-thread pause proves that the passive timer detects a stall.
            # It is not evidence that production code caused the user's freeze.
            browser.script('const until=performance.now()+160;while(performance.now()<until){};'
                           'for(const w of [window,freezeSecond])w.dispatchEvent(new CustomEvent("ZenWorkspacesUIUpdate"));return true;')
            deadline = time.monotonic() + 45
            report = None
            while time.monotonic() < deadline:
                report = browser.script('return freezeResult;')
                if report:
                    break
                time.sleep(.5)
            assert report is not None, 'Collector did not finish'
            assert len(report['windows']) == 2, report['windows']
            assert report['saved']['json'] == 1 and report['saved']['zip'] == 1, report
            assert report['heartbeat']['over100'] >= 1, report['heartbeat']
            assert report['profiler']['status'] == 'summarized', report['profiler']
            assert report['profiler']['summary']['samples'] > 0, report['profiler']
            assert browser.script('return freezePrefs();') == before, 'Preferences changed'
            assert browser.script('return !Services.profiler.IsActive();'), 'Profiler still running'
            assert browser.script('return ![...Services.wm.getEnumerator("navigator:browser")].some(w=>w.__zzZenFreezeProbe);'), 'Probe hook leaked'
            archives = list(out.glob('zen-freeze-report-*/report.zip'))
            assert archives, 'Report ZIP missing'
            with zipfile.ZipFile(archives[-1]) as archive:
                assert archive.testzip() is None
                saved = json.loads(archive.read('report.json'))
                assert saved['probe'] == report['probe']
            (out / 'validation.json').write_text(json.dumps({
                'windows': len(report['windows']), 'samples': report['profiler']['summary']['samples'],
                'detectedInjectedPause': True, 'prefsPreserved': True, 'zipValid': True,
                'limitations': 'Linux headless collector verification; no Windows freeze reproduction.'}, indent=2))
            print('PASS: two windows, sampled profile, injected-pause detection, ZIP, preference preservation and cleanup')
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
