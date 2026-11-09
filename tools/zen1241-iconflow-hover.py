#!/usr/bin/env python3
"""Hover in real Zen chrome: Favorites (Essentials) keep their icon in place,
and a regular tab's close X grows in on the icon's resting slot.

python tools/zen1241-iconflow-hover.py --zen /path/to/zen [--root /path/to/mods]
Disposable profile only; never touches a user profile. Requires Pillow, like
zen-smoke.py. Loads every suite mod plus the captured Arc 2.0 Essentials unload
button rule, the theme case that shows a minus on a Favorite. Zen 1.24.1 gives
that minus position: relative, which outranks the theme's own position, so it
took a slot and pushed the Favorite's icon aside. Zen 1.24.1 also draws the
close X as two line pseudo-elements, which Glassflow scales in (the target
keeps its size; earlier Zen's X is the target itself). :hover locks and WebDriver
pointer moves are synthetic input; they do not certify physical input or
Windows compositor pixels.
"""
import argparse, contextlib, json, os, runpy, socket, subprocess, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M = runpy.run_path(str(ROOT / 'tools/zen-smoke.py'))['Marionette']
MODS = ['glassflow', 'groupflow', 'iconflow', 'glassflow-library', 'download-prompt', 'tab-router', 'tab-unloader', 'mediaflow']
# Captured from YashjitPal/Arc-2.0 49674d5, modules/chrome/tab-styles.css
# (Add *unload button* to Essentials, pref arc-essentials-unload-button).
ARC_ESSENTIALS = '''
.tab-close-button, .tab-reset-button { border-radius: calc(var(--arc-border-radius, 12px) - 4px) !important; transition: opacity 0.25s ease-out !important; }
.tabbrowser-tab:hover .tab-reset-button { opacity: 0.4 !important; }
.tabbrowser-tab .tab-reset-button:hover { opacity: 1 !important; }
@media (-moz-pref("arc-essentials-unload-button")) {
  .tabbrowser-tab[zen-essential="true"]:not([pending], [glance-id]):hover
    .tab-reset-button {
    display: block !important;
    position: absolute;
    top: 0 !important;
    right: 0% !important;
    background: light-dark(rgb(0 0 0 / 25%), rgb(255 255 255 / 25%)) !important;
    border-radius: 8px !important;
    transform: scale(0.75) translate(10%, -10%) !important;
  }
}
'''
SETS = {4: 'morph', 0: 'zen-own', 2: 'circuit', 3: 'clean'}

CHECKS = r'''
window.favCase = {failures: [], checks: 0, created: [], wait: ms => new Promise(r => setTimeout(r, ms)),
 ok(name, cond, detail) { this.checks++; if (!cond) this.failures.push({name, detail}); return cond; },
 center(tab) { const b = tab.querySelector('.tab-icon-image').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; },
 rect(e) { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; },
 moved(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); },
 saved: ['zzicon.set', 'zen.view.sidebar-expanded', 'arc-essentials-unload-button'].map(k => [k, Services.prefs.prefHasUserValue(k),
  Services.prefs.getPrefType(k) === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(k) : Services.prefs.getPrefType(k) === Services.prefs.PREF_INT ? Services.prefs.getIntPref(k) : null]),
};
return true;'''

SETUP = r'''
const c = favCase, art = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="120" fill="red"/></svg>');
const add = () => { const t = gBrowser.addTab('about:blank', {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), skipAnimation: true}); c.created.push(t); return t; };
c.selected = gBrowser.selectedTab;
for (const name of ['loaded', 'pending', 'other']) { const t = add(); gBrowser.pinTab(t); gZenPinnedTabManager.addToEssentials(t, {replicating: true}); gBrowser.setIcon(t, art); c[name] = t; }
c.pending.setAttribute('pending', 'true');
c.pinned = add(); gBrowser.pinTab(c.pinned); gBrowser.setIcon(c.pinned, art);
c.regular = add(); gBrowser.setIcon(c.regular, art);
c.ok('Favorites exist', [c.loaded, c.pending, c.other].every(t => t.getAttribute('zen-essential') === 'true' && t.closest('#zen-essentials')));
Services.prefs.setBoolPref('arc-essentials-unload-button', true);
return true;'''

CONFIG = r'''return (async () => {
 const c = favCase, v = VALUES, label = v.sidebar + '/' + v.name;
 Services.prefs.setBoolPref('zen.view.sidebar-expanded', v.sidebar === 'expanded');
 document.documentElement.setAttribute('zen-sidebar-expanded', String(v.sidebar === 'expanded'));
 Services.prefs.setIntPref('zzicon.set', v.set); await c.wait(700);
 const out = {label};
 for (const kind of ['loaded', 'pending']) {
  const tab = c[kind], reset = tab.querySelector('.tab-reset-button'), rest = c.center(tab);
  InspectorUtils.addPseudoClassLock(tab, ':hover'); await c.wait(450);
  const hover = c.center(tab), s = getComputedStyle(reset), tile = c.rect(tab), box = c.rect(reset);
  c.ok(label + ' ' + kind + ' Favorite icon stays in place on hover', c.moved(rest, hover) < .01, {rest, hover});
  if (kind === 'pending') c.ok(label + ' theme leaves the unloaded Favorite without a minus', s.display === 'none', s.display);
  else {
   c.ok(label + ' theme shows the Favorite minus', s.display !== 'none' && box[2] > 0, s.display);
   c.ok(label + ' Favorite minus takes no layout slot', s.position === 'absolute', s.position);
   c.ok(label + ' Favorite minus stays on its tile', box[0] >= tile[0] - 1 && box[1] >= tile[1] - 4 && box[0] + box[2] <= tile[0] + tile[2] + 4 && box[1] + box[3] <= tile[1] + tile[3] + 1, {tile, box});
   const pseudos = ['::before', '::after'].map(p => getComputedStyle(reset, p).content);
   if (v.set === 4) {
    const r = __zziconMorphInstance.records.get(reset);
    c.ok(label + ' Morph owns the Favorite minus', r?.paint === reset && r.mode === 'image', r?.mode);
    c.ok(label + ' Morph minus paints over the theme background', s.backgroundImage.includes('/icons/morph/minus.svg') && s.backgroundOrigin === 'content-box' && s.backgroundClip === 'content-box', s.backgroundImage);
   } else if (v.set !== 0) c.ok(label + ' Circuit minus paints over the theme background', s.backgroundImage.includes('/' + v.name + '/minus.svg'), s.backgroundImage);
   c.ok(label + ' replacement minus has no native bars', pseudos.every(p => ['none', 'normal'].includes(p)), pseudos);
   out.reset = box; out.tile = tile; out.position = s.position;
  }
  InspectorUtils.removePseudoClassLock(tab, ':hover'); await c.wait(350);
 }
 // Narrow: a pinned tab keeps Zen's own in-row minus.
 InspectorUtils.addPseudoClassLock(c.pinned, ':hover'); await c.wait(350);
 const pinned = c.pinned.querySelector('.tab-reset-button'), ps = getComputedStyle(pinned);
 if (ps.display !== 'none') c.ok(label + ' pinned tab minus keeps its native position', ps.position !== 'absolute', ps.position);
 out.pinned = {display: ps.display, position: ps.position};
 InspectorUtils.removePseudoClassLock(c.pinned, ':hover'); await c.wait(250);
 return out;
})();'''


CLOSE = r'''return (async () => {
 const c = favCase, out = [];
 for (const set of [0, 4]) {
  Services.prefs.setIntPref('zzicon.set', set); await c.wait(700);
  const x = c.regular.querySelector('.tab-close-button'), line = p => getComputedStyle(x, p);
  const icon = c.center(c.regular), rest = c.rect(x), restScale = line('::before').scale;
  InspectorUtils.addPseudoClassLock(c.regular, ':hover'); await c.wait(450);
  const now = c.rect(x), drawn = line('::before').content !== 'none', label = 'set ' + set + ' close X';
  c.ok(label + ' target keeps its size and place', c.moved(rest, now) < .01 && Math.abs(rest[2] - now[2]) < .01, {rest, now});
  c.ok(label + " is centred on the icon's resting slot", c.moved([now[0] + now[2] / 2, now[1] + now[3] / 2], icon) < .51, {now, icon});
  // Zen 1.24.1 draws two lines; earlier Zen's X is the target itself and only fades.
  if (set === 0 && x.localName === 'box')
   c.ok(label + ' lines grow in on hover', drawn && restScale === '0.65' && ['::before', '::after'].every(p => line(p).scale === '1'), [restScale, line('::before').scale, line('::after').scale]);
  if (set === 4) c.ok(label + ' is Morph artwork without native lines', !drawn, line('::before').content);
  InspectorUtils.removePseudoClassLock(c.regular, ':hover'); await c.wait(350);
  out.push({set, element: x.localName, rest, now, icon, restScale});
 }
 return out;
})();'''


@contextlib.contextmanager
def suite(zen, root, out, sheets=()):
    """Disposable profile with every suite mod at its defaults; yields Marionette.
    `sheets` are extra user sheets (path, text) registered after the mods."""
    with tempfile.TemporaryDirectory(prefix='zen-iconflow-1241-') as d:
        profile = Path(d); folder = profile / 'chrome/sine-mods'; folder.mkdir(parents=True)
        out.mkdir(parents=True, exist_ok=True)
        for mod in MODS:
            (folder / json.loads((root / mod / 'theme.json').read_text())['id']).symlink_to(root / mod, target_is_directory=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        prefs = {'marionette.port': port, 'browser.shell.checkDefaultBrowser': False, 'zen.welcome-screen.seen': True, 'zen.welcome-screen.enabled': False,
                 'browser.aboutwelcome.enabled': False, 'sine.auto-updates': False, 'ui.prefersReducedMotion': 0, 'zzrouter.enabled': False,
                 'svg.context-properties.content.enabled': False}
        (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k, v in prefs.items()))
        log = (out / 'browser.log').open('w')
        env = {**os.environ, 'MOZ_REMOTE_ALLOW_SYSTEM_ACCESS': '1'}
        proc = subprocess.Popen([str(zen.resolve()), '--headless', '--no-remote', '--profile', d, '--marionette', '--remote-allow-system-access', 'about:blank'], stdout=log, stderr=log, env=env)
        try:
            for _ in range(150):
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.2): break
                except OSError:
                    if proc.poll() is not None: raise RuntimeError('Zen exited; see ' + str(out / 'browser.log'))
                    time.sleep(.2)
            m = M(port)
            m.script('return gZenStartup.promiseInitialized.then(()=>true);')
            m.call('WebDriver:SetWindowRect', {'width': 1280, 'height': 960})
            m.script('window.favChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI(' + json.dumps((profile / 'chrome.manifest').as_uri()) + '),' + json.dumps([['content', 'sine', folder.as_uri() + '/']]) + ');return true;')
            for mod in MODS:
                theme = json.loads((root / mod / 'theme.json').read_text())
                defaults = {r['property']: r['defaultValue'] for r in json.loads((root / mod / 'preferences.json').read_text()) if 'property' in r and 'defaultValue' in r}
                m.script('for(const[k,v]of Object.entries(' + json.dumps(defaults) + '))if(Services.prefs.getPrefType(k)===0)Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
                if (root / mod / 'userChrome.css').exists():
                    m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI(' + json.dumps('chrome://sine/content/' + theme['id'] + '/userChrome.css') + '),1);return true;')
                for script in theme['scripts']:
                    if script.endswith('.uc.js'):
                        m.script('Services.scriptloader.loadSubScript(' + json.dumps('chrome://sine/content/' + theme['id'] + '/' + script) + ',window);return true;')
            # Extra sheets come last, so ties in specificity go to them.
            uris = []
            for name, text in sheets:
                (profile / name).write_text(text); uris.append((profile / name).as_uri())
                m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI(' + json.dumps(uris[-1]) + '),1);return true;')
            time.sleep(2)
            yield m, uris
        finally:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--zen', required=True, type=Path)
    p.add_argument('--root', type=Path, default=ROOT, help='Folder holding the mod folders (default: this checkout)')
    p.add_argument('--output', type=Path, help='Folder for the browser log and pixel crops')
    args = p.parse_args()
    with tempfile.TemporaryDirectory(prefix='zen-hover-out-') as scratch:
        out = (args.output or Path(scratch)).resolve()
        with suite(args.zen, args.root.resolve(), out, [('arc-essentials.css', ARC_ESSENTIALS)]) as (m, uris):
            fixture = uris[0]
            m.script(CHECKS); m.script(SETUP); time.sleep(.8)
            result = {'configs': []}

            def pointer(actions):
                m.call('Marionette:SetContext', {'value': 'chrome'})
                m.call('WebDriver:PerformActions', {'actions': [{'type': 'pointer', 'id': 'hover-mouse', 'parameters': {'pointerType': 'mouse'}, 'actions': actions}]})
            try:
                pointer([{'type': 'pointerMove', 'duration': 0, 'x': 900, 'y': 600}])
                # Regular tab close X, with Glassflow's defaults (motion on, X under the
                # icon), while the sidebar is still in its initial expanded layout.
                result['close'] = m.script(CLOSE)
                for sidebar in ['expanded', 'collapsed']:
                    for icon_set, name in SETS.items():
                        values = json.dumps({'sidebar': sidebar, 'set': icon_set, 'name': name})
                        result['configs'].append(m.script(CONFIG.replace('VALUES', values)))
                # Pixels: the Morph minus contributes paint inside the theme's button.
                m.script("Services.prefs.setBoolPref('zen.view.sidebar-expanded',true);document.documentElement.setAttribute('zen-sidebar-expanded','true');Services.prefs.setIntPref('zzicon.set',4);return true;"); time.sleep(.7)
                m.script("InspectorUtils.addPseudoClassLock(favCase.loaded,':hover');return true;"); time.sleep(.5)
                from PIL import ImageChops
                box = m.script("return favCase.loaded.querySelector('.tab-reset-button').getBoundingClientRect().toJSON();")
                crops = []
                for phase in ['painted', 'without-strip']:
                    if phase == 'without-strip':
                        m.script("const e=favCase.loaded.querySelector('.tab-reset-button');favCase.sprite=e.style.getPropertyValue('--zzicon-sprite');e.style.setProperty('--zzicon-sprite','none');return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))));")
                    shot = m.shot(); f = shot.width / m.script('return innerWidth;')
                    crop = shot.crop(tuple(round(box[k] * f) for k in ['left', 'top', 'right', 'bottom'])); crop.save(out / f'favorite-minus-{phase}.png'); crops.append(crop)
                m.script("const e=favCase.loaded.querySelector('.tab-reset-button');e.style.setProperty('--zzicon-sprite',favCase.sprite);InspectorUtils.removePseudoClassLock(favCase.loaded,':hover');return true;")
                changed = sum(ImageChops.difference(*crops).convert('L').histogram()[25:])
                result['morphMinusPixels'] = changed
                m.script("favCase.ok('Morph minus is visible inside the Favorite button',%d>=4,%d);return true;" % (changed, changed))
                # WebDriver pointer onto the Favorite. Tolerance covers Glassflow's
                # one-device-pixel alignment; the reported shift was 12px.
                time.sleep(.4)
                t = m.script("favCase.rest=favCase.center(favCase.loaded);const b=favCase.loaded.getBoundingClientRect();return [b.x,b.y,b.width,b.height];")
                pointer([{'type': 'pointerMove', 'duration': 120, 'x': round(t[0] + t[2] / 2), 'y': round(t[1] + t[3] / 2)}]); time.sleep(.8)
                result['pointer'] = m.script("const c=favCase,now=c.center(c.loaded),s=getComputedStyle(c.loaded.querySelector('.tab-reset-button'));c.ok('pointer hovers the Favorite',c.loaded.matches(':hover'));c.ok('pointer hover keeps the Favorite icon in place',c.moved(c.rest,now)<=1.01,{rest:c.rest,now});c.ok('pointer hover shows the out-of-flow minus',s.display!=='none'&&s.position==='absolute',[s.display,s.position]);return {rest:c.rest,now,display:s.display,position:s.position};")
                pointer([{'type': 'pointerMove', 'duration': 0, 'x': 900, 'y': 600}]); time.sleep(.5)
                # Without the theme, Zen keeps the Favorite minus hidden.
                m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).unregisterSheet(Services.io.newURI(' + json.dumps(fixture) + '),1);return true;'); time.sleep(.4)
                result['stock'] = m.script('''return (async()=>{const c=favCase,rest=c.center(c.loaded);InspectorUtils.addPseudoClassLock(c.loaded,':hover');await c.wait(450);
                  const now=c.center(c.loaded),d=getComputedStyle(c.loaded.querySelector('.tab-reset-button')).display;InspectorUtils.removePseudoClassLock(c.loaded,':hover');
                  c.ok('stock Zen keeps the Favorite minus hidden',d==='none',d);c.ok('stock Favorite icon stays in place on hover',c.moved(rest,now)<.01,{rest,now});return {display:d};})();''')
            finally:
                result['summary'] = m.script('''return (async()=>{const c=favCase;
                  for(const t of [c.loaded,c.pending,c.pinned,c.regular])if(t&&InspectorUtils.hasPseudoClassLock(t,':hover'))InspectorUtils.removePseudoClassLock(t,':hover');
                  for(const[k,user,value]of c.saved){if(user&&typeof value==='boolean')Services.prefs.setBoolPref(k,value);else if(user&&typeof value==='number')Services.prefs.setIntPref(k,value);else Services.prefs.clearUserPref(k);}
                  gBrowser.selectedTab=c.selected;for(const t of c.created)if(t.isConnected)gBrowser.removeTab(t,{animate:false});await c.wait(300);
                  return {checks:c.checks,failures:c.failures};})();''')
            print('FAVORITES', json.dumps(result), flush=True)
            failures = result['summary']['failures']
            assert not failures, json.dumps(failures, indent=1)
            print(f"PASS {result['summary']['checks']} hover checks", flush=True)


if __name__ == '__main__':
    main()
