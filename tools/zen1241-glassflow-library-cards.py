#!/usr/bin/env python3
"""Measure Glassflow Library's Space-card settings in a disposable Zen profile.

python tools/zen1241-glassflow-library-cards.py --zen /path/to/zen --output /tmp/cards [--check]
        [--css /path/to/other/glassflow-library/userChrome.css] [--headless]

Loads Glassflow and Glassflow Library (CSS as user sheets, scripts injected as
Sine would), gives the active space a two-colour gradient with grain, opens the
Library's Spaces section and records, for every card setting, the computed
styles of the card, its pseudo-elements and Zen's background child, plus
screenshot pixels: the card's interior, a corner, the top edge and the window
just outside the card. It runs in normal and compact mode (with Zen's acrylic
sidebar preference on, which is what gives Zen 1.24.1b's card its 80% tint)
and with reduced transparency and contrast. In compact mode it also puts Zen's
42px card blur back for a moment and reports how much it changes the card,
against a control blur. --css swaps in another copy of the Library stylesheet
(for example main's) so the two can be compared; --check asserts the expected
behaviour of the stylesheet in this checkout; --shots saves a crop per case.

Pixels are Gecko's own rendering under Xvfb (Marionette screenshots, and the X
screen for the blur comparison): they show where layers paint and what colour
they composite to, not a Windows compositor's acrylic or frame pacing, and
nothing here is real pointer input. Never touches a real profile.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.parse import quote

from PIL import ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('smoke', ROOT / 'tools/zen-smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

GRADIENT = ("{type:'gradient',opacity:0.25,texture:0.5,textureType:'grain',gradientColors:["
            "{c:[40,120,220],isCustom:false,isPrimary:true,algorithm:'analogous',lightness:50},"
            "{c:[220,60,140],isCustom:false,algorithm:'analogous',lightness:50}]}")

MEASURE = r"""return (async()=>{
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  await new Promise(r=>setTimeout(r,250)); await frame();
  const card=document.querySelector('zen-library .zen-library-space');
  const bg=card.querySelector(':scope > .zen-library-space-background');
  const grain=bg.querySelector('.zen-browser-grain');
  const pick=(el,pseudo)=>{const cs=getComputedStyle(el,pseudo||null);return {
    content:cs.content,display:cs.display,fill:cs.backgroundColor,image:cs.backgroundImage.slice(0,160),
    opacity:cs.opacity,radius:cs.borderTopLeftRadius,shadow:cs.boxShadow,backdrop:cs.backdropFilter,
    outline:cs.outlineStyle==='none'?'none':cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor,
    zIndex:cs.zIndex,position:cs.position,color:cs.color};};
  const r=card.getBoundingClientRect(),lib=document.querySelector('zen-library').getBoundingClientRect();
  return {card:pick(card),before:pick(card,'::before'),after:pick(card,'::after'),
    background:pick(bg),backgroundBefore:pick(bg,'::before'),backgroundAfter:pick(bg,'::after'),
    grain:pick(grain),toolbarClass:bg.classList.contains('zen-toolbar-background'),
    windowActive:!document.documentElement.matches(':-moz-window-inactive'),
    title:getComputedStyle(card.querySelector('.zen-library-space-header')).fontSize,
    rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
    gap:(()=>{const c=[...document.querySelectorAll('zen-library .zen-library-space')];
      return c.length>1?c[1].getBoundingClientRect().left-c[0].getBoundingClientRect().right:null;})(),
    dpr:devicePixelRatio,libraryLeft:lib.left,
    acrylic:matchMedia("-moz-pref('zen.theme.acrylic-sidebar')").matches,
    compact:document.documentElement.getAttribute('zen-compact-mode')==='true',
    gradientStop:(getComputedStyle(card).getPropertyValue('--zen-main-browser-background').match(/rgba?\([^)]*\)/)||[''])[0],
    toolbarStop:(getComputedStyle(card).getPropertyValue('--zen-main-browser-background-toolbar').match(/rgba?\([^)]*\)/)||[''])[0]};
})();"""

# name, preference changes from the defaults
CONFIGS = [
    ('defaults', {}),
    ('fill-0-gradient-0', {'zzlib.card.fill': '0%', 'zzlib.card.gradient': '0'}),
    ('fill-70-gradient-0', {'zzlib.card.gradient': '0'}),
    ('fill-100-gradient-0', {'zzlib.card.fill': '100%', 'zzlib.card.gradient': '0'}),
    ('gradient-50', {'zzlib.card.gradient': '0.5'}),
    ('gradient-50-percent', {'zzlib.card.gradient': '50%'}),
    ('shadow-off', {'zzlib.card.shadow': False}),
    ('sheen-on', {'zzlib.card.sheen': True}),
    ('rim-off', {'zzlib.card.rim': False}),
    # A solid grey card against the coloured window makes corners easy to read.
    ('solid', {'zzlib.card.fill': '100%', 'zzlib.card.gradient': '0'}),
    ('solid-radius-0', {'zzlib.card.fill': '100%', 'zzlib.card.gradient': '0', 'zzlib.card.radius': '0px'}),
    ('solid-radius-30', {'zzlib.card.fill': '100%', 'zzlib.card.gradient': '0', 'zzlib.card.radius': '30px'}),
    ('radius-30', {'zzlib.card.radius': '30px'}),
    ('size', {'zzlib.card.width': '300px', 'zzlib.card.gap': '40px', 'zzlib.card.title-size': '16px'}),
]


def set_prefs(m, prefs):
    m.script('for(const[k,v]of Object.entries(' + json.dumps(prefs) + '))'
             'Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')


def pixels(m, rect, scale):
    shot = m.shot()
    at = lambda x, y: shot.getpixel((round(x * scale), round(y * scale)))
    l, t, r, b = rect['left'], rect['top'], rect['right'], rect['bottom']
    return shot, {
        'interior': at(l + 60, t + 300),     # empty body, below the header
        'sheenZone': at(l + 60, t + 100),    # upper part, where a top-lit sheen is strongest
        'lowerZone': at(l + 60, b - 120),
        'corner1': at(l + 1, t + 1),         # outside a 14px corner, inside a square one
        'corner6': at(l + 6, t + 6),         # outside a 30px corner, inside a 14px one
        'topEdge': at(l + 120, t),           # the rim's top highlight row
        'outside3': at(l - 3, t + 400),      # window just outside the card: shadow
        'below': at(l + 120, b + 30),        # window below the card, past the shadow
    }


def blur_effect(m, rect, scale, save=None):
    """Put Zen's 42px backdrop blur back on the card's background child (a
    synthetic user sheet; every other layer unchanged) and compare the card's
    pixels. The same kind of blur over the Library's side labels is the control
    that the capture shows backdrop filters at all. Marionette's chrome
    screenshot does not draw them, so this reads the X screen (Xvfb here)
    when there is one."""
    sheet = 'data:text/css,' + quote('zen-library .zen-library-space > .zen-library-space-background'
                                     '.zen-browser-generic-background.zen-toolbar-background{backdrop-filter:blur(42px)!important}')
    try:
        from PIL import ImageGrab
        ImageGrab.grab()
        ox, oy = m.script('return [mozInnerScreenX, mozInnerScreenY];')
        capture, source = ImageGrab.grab, 'X screen'
    except Exception:
        ox = oy = 0
        capture, source = m.shot, 'Marionette chrome screenshot'
    at = lambda l, t, r, b: tuple(round(v) for v in ((ox + l) * scale, (oy + t) * scale, (ox + r) * scale, (oy + b) * scale))
    box = at(rect['left'] + 2, rect['top'] + 2, rect['right'] - 2, rect['bottom'] - 2)
    control = at(8, 190, 102, 250)
    settle = 'return new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))),400));'
    m.script(settle)
    plain = capture()
    m.script("const d=document.createElementNS('http://www.w3.org/1999/xhtml','div');d.id='zzcards-blur-control';"
             "d.style.cssText='position:fixed;left:8px;top:190px;width:94px;height:60px;z-index:2147483647;pointer-events:none;backdrop-filter:blur(6px)';"
             "document.documentElement.append(d);const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);"
             "ss.loadAndRegisterSheet(Services.io.newURI(" + json.dumps(sheet) + "),ss.USER_SHEET);" + settle)
    try:
        blurred = capture()
        backdrop = m.script("return getComputedStyle(document.querySelector('zen-library .zen-library-space > .zen-library-space-background')).backdropFilter;")
    finally:
        m.script("document.getElementById('zzcards-blur-control')?.remove();const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);"
                 "ss.unregisterSheet(Services.io.newURI(" + json.dumps(sheet) + "),ss.USER_SHEET);" + settle)
    if save:
        for label, im in (('plain', plain), ('blurred', blurred)):
            im.crop((min(control[0], box[0]), min(control[1], box[1]), box[2] + 40, box[3])).save(save / f'compact-blur-{label}.png')
    card = ImageChops.difference(plain.crop(box), blurred.crop(box))
    return {'capture': source, 'backdrop': backdrop,
            'cardMeanDiff': max(ImageStat.Stat(card).mean), 'cardMaxDiff': max(b[1] for b in card.getextrema()),
            'controlMaxDiff': max(b[1] for b in ImageChops.difference(plain.crop(control), blurred.crop(control)).getextrema())}


def run(args):
    css = (args.css or ROOT / 'glassflow-library/userChrome.css').resolve()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    report = {'css': str(css), 'cases': {}, 'notes': []}
    with tempfile.TemporaryDirectory(prefix='zen1241-glassflow-library-') as directory:
        profile = Path(directory)
        (profile / 'sine-mods').mkdir()
        for theme in ROOT.glob('*/theme.json'):
            target = profile / 'sine-mods' / json.loads(theme.read_text())['id']
            if not target.exists():
                target.symlink_to(theme.parent, target_is_directory=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        prefs = {'marionette.port': port, 'browser.shell.checkDefaultBrowser': False,
                 'browser.aboutwelcome.enabled': False, 'zen.welcome-screen.seen': True,
                 'zen.welcome-screen.enabled': False,
                 # Zen 1.24.1b tints and blurs compact-mode cards only with its acrylic
                 # sidebar switch (Glassflow's "Zen sidebar blur"); its gradient
                 # generator reads the switch once, at window startup.
                 'zen.theme.acrylic-sidebar': True}
        (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k, v in prefs.items()))
        with (out / 'browser.log').open('w') as log:
            process = subprocess.Popen([str(args.zen.resolve()), *(['--headless'] if args.headless else []),
                                        '--no-remote', '--profile', directory, '--marionette',
                                        '--remote-allow-system-access', 'about:blank'], stdout=log, stderr=log)
            m = None
            try:
                for _ in range(150):
                    try:
                        with socket.create_connection(('127.0.0.1', port), timeout=.2):
                            break
                    except OSError:
                        if process.poll() is not None:
                            raise RuntimeError((out / 'browser.log').read_text()[-2000:])
                        time.sleep(.2)
                m = smoke.Marionette(port)
                m.script("Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup)"
                         ".registerChrome(Services.io.newURI(" + json.dumps((profile / 'chrome.manifest').as_uri()) +
                         "),[['content','sine','sine-mods/']]);return true;")
                m.script('return gZenStartup.promiseInitialized.then(()=>true);')
                m.call('WebDriver:SetWindowRect', {'width': 1500, 'height': 1000})
                report['zen'] = m.script('return Services.appinfo.version;')
                defaults = {}
                for mod in ['glassflow', 'glassflow-library']:
                    for row in json.loads((ROOT / mod / 'preferences.json').read_text()):
                        if 'property' in row and 'defaultValue' in row:
                            defaults[row['property']] = row['defaultValue']
                defaults['zen.theme.acrylic-sidebar'] = True
                set_prefs(m, defaults)
                sheets = [ROOT / 'glassflow/userChrome.css', css]
                m.script("const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);"
                         "for(const u of " + json.dumps([s.resolve().as_uri() for s in sheets]) + ")"
                         "ss.loadAndRegisterSheet(Services.io.newURI(u),ss.USER_SHEET);return true;")
                for mod in ['glassflow', 'glassflow-library']:
                    m.script((ROOT / mod / (mod + '.uc.js')).read_text() + '\nreturn true;')
                # A second space gives a measurable gap; both get the same gradient,
                # translucent enough that compact mode's acrylic layers show under it,
                # and the window takes it too, so the fill has something to show.
                m.script("""return (async()=>{
                  if(gZenWorkspaces.getWorkspaces().length<2)await gZenWorkspaces.createAndSaveWorkspace('Second');
                  for(const ws of gZenWorkspaces.getWorkspaces()){ws.theme=""" + GRADIENT + """;await gZenWorkspaces.saveWorkspace(ws);}
                  gZenThemePicker.onWorkspaceChange(gZenWorkspaces.getActiveWorkspace());
                  await new Promise(r=>setTimeout(r,600));return true;})();""")
                for mode in ['normal', 'compact']:
                    m.script("""return (async()=>{const L=customElements.get('zen-library');
                      if(L.isLibraryOpen){L.close();await new Promise(r=>setTimeout(r,700));}
                      gZenCompactModeManager.preference=""" + json.dumps(mode == 'compact') + """;
                      await new Promise(r=>setTimeout(r,500));
                      L.toggle('spaces');
                      for(let i=0;i<100&&!document.querySelector('zen-library .zen-library-space');i++)await new Promise(r=>setTimeout(r,50));
                      await new Promise(r=>setTimeout(r,900));return true;})();""")
                    for name, change in CONFIGS:
                        set_prefs(m, {**defaults, **change})
                        state = m.script(MEASURE)
                        scale = state['dpr']
                        shot, px = pixels(m, state['rect'], scale)
                        state['pixels'] = px
                        if args.shots:
                            r = state['rect']
                            shot.crop(tuple(round(v * scale) for v in (r['left'] - 40, r['top'] - 20, r['right'] + 40, r['top'] + 420))).save(out / f'{mode}-{name}.png')
                        report['cases'][f'{mode}/{name}'] = state
                    set_prefs(m, defaults)
                    if mode == 'compact':
                        report['compactBlur'] = blur_effect(m, m.script(MEASURE)['rect'], scale, out if args.shots else None)
                # Accessibility fallback in compact mode, which has the most layers.
                for a11y in ['reduced-transparency', 'contrast']:
                    m.script("Services.prefs.setIntPref('ui.prefersReducedTransparency'," + str(int(a11y == 'reduced-transparency')) + ");"
                             "Services.prefs.setIntPref('browser.display.document_color_use'," + ('2' if a11y == 'contrast' else '0') + ");"
                             "Services.prefs.setIntPref('ui.useAccessibilityTheme'," + str(int(a11y == 'contrast')) + ");return true;")
                    state = m.script(MEASURE)
                    state['canvas'] = m.script("const d=document.createElementNS('http://www.w3.org/1999/xhtml','div');"
                                               "d.style.cssText='background:Canvas;color:CanvasText';document.documentElement.append(d);"
                                               "const cs=getComputedStyle(d),v=[cs.backgroundColor,cs.color];d.remove();return v;")
                    shot, px = pixels(m, state['rect'], state['dpr'])
                    state['pixels'] = px
                    if args.shots:
                        shot.save(out / f'a11y-{a11y}.png')
                    report['cases'][f'a11y/{a11y}'] = state
                m.script("for(const k of ['ui.prefersReducedTransparency','browser.display.document_color_use','ui.useAccessibilityTheme'])Services.prefs.clearUserPref(k);return true;")
            finally:
                if m:
                    try:
                        m.call('Marionette:Quit', {'flags': ['eForceQuit']})
                    except Exception:
                        pass
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
    (out / 'report.json').write_text(json.dumps(report, indent=1))
    return report


def diff(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def check(report):
    """Expectations for this checkout's stylesheet; returns the list of checks run."""
    c, done = report['cases'], []

    def ok(cond, label, *detail):
        assert cond, (label, *detail)
        done.append(label)

    for mode in ['normal', 'compact']:
        d = c[f'{mode}/defaults']
        bg, px = d['background'], d['pixels']
        ok(bg['radius'] == d['card']['radius'] == '14px', f'{mode}: card and its background share the radius', bg, d['card'])
        ok(bg['shadow'] == 'none' and 'rgba(0, 0, 0, 0.1) 0px 0px 10px' in d['before']['shadow'], f"{mode}: Zen's shadow drawn once, by the card", d['before'], bg)
        ok(d['before']['content'] != 'none' and d['before']['zIndex'] == '-1' and int(bg['zIndex']) < -1, f"{mode}: ::before sits above Zen's background child", d['before'], bg)
        ok(bg['opacity'] == '1', f'{mode}: full gradient by default', bg)
        ok(bg['fill'] == 'rgba(0, 0, 0, 0)' and bg['backdrop'] == 'none', f'{mode}: no base, tint or blur on the background child', bg)
        ok('inset' in d['after']['shadow'] and d['backgroundAfter']['outline'] == 'none', f"{mode}: rim on by default, replacing Zen's outline", d['after'], d['backgroundAfter'])
        f0, f70, f100 = (c[f'{mode}/fill-{n}-gradient-0']['pixels']['interior'] for n in (0, 70, 100))
        ok(c[f'{mode}/fill-0-gradient-0']['background']['opacity'] == '0', f'{mode}: gradient 0 hides the background child')
        ok(diff(f0, f100) > 8 and diff(f70, f0) > 4 and diff(f70, f100) > 2, f'{mode}: card fill changes the pixels', f0, f70, f100)
        g50, g50p = c[f'{mode}/gradient-50'], c[f'{mode}/gradient-50-percent']
        ok(g50['background']['opacity'] == '0.5' and g50p['background']['opacity'] == '0.5', f'{mode}: fraction and percent strengths', g50['background'], g50p['background'])
        ok(diff(g50['pixels']['interior'], px['interior']) > 4 and diff(g50['pixels']['interior'], f70) > 4, f'{mode}: half strength sits between gradient and fill')
        ok(g50['before']['shadow'] == d['before']['shadow'], f'{mode}: the shadow does not fade with the gradient', g50['before'])
        s = c[f'{mode}/shadow-off']
        ok(s['before']['shadow'] == 'none' and s['background']['shadow'] == 'none', f'{mode}: shadow off removes it', s['before'])
        ok(diff(px['outside3'], s['pixels']['outside3']) >= 3, f'{mode}: shadow pixels', px, s['pixels'])
        sh = c[f'{mode}/sheen-on']
        ok(sh['before']['image'].startswith('linear-gradient'), f'{mode}: sheen paints', sh['before'])
        ok(sum(sh['pixels']['sheenZone']) > sum(px['sheenZone']) + 6 and sum(sh['pixels']['lowerZone']) < sum(px['lowerZone']), f'{mode}: sheen lights the top and shades the bottom', sh['pixels'], px)
        rim = c[f'{mode}/rim-off']
        ok(rim['after']['content'] == 'none' or rim['after']['shadow'] == 'none', f'{mode}: rim off', rim['after'])
        ok(sum(px['topEdge']) > sum(rim['pixels']['topEdge']) + 12, f'{mode}: rim lightens the top edge', px, rim['pixels'])
        solid, r0, r30 = c[f'{mode}/solid'], c[f'{mode}/solid-radius-0'], c[f'{mode}/solid-radius-30']
        ok(c[f'{mode}/radius-30']['background']['radius'] == '30px' and r0['background']['radius'] == '0px', f'{mode}: radius reaches the background child', r0['background'])
        ok(diff(r0['pixels']['corner1'], solid['pixels']['corner1']) > 8 and diff(r0['pixels']['corner1'], r0['pixels']['interior']) <= 3,
           f'{mode}: a square card fills its corner', r0['pixels'], solid['pixels'])
        ok(diff(r30['pixels']['corner6'], solid['pixels']['corner6']) > 8 and diff(solid['pixels']['corner6'], solid['pixels']['interior']) <= 3,
           f'{mode}: a 30px corner leaves the corner pixel to the window', r30['pixels'], solid['pixels'])
        z = c[f'{mode}/size']
        ok(abs(z['rect']['width'] - 300) < 1 and z['gap'] is not None and abs(z['gap'] - 40) < 1 and z['title'] == '16px', f'{mode}: width, gap and title size', z['rect'], z['gap'], z['title'])
    cm = c['compact/defaults']
    ok(cm['toolbarClass'] and cm['acrylic'], "compact: Zen's toolbar-background card with the acrylic switch on", cm)
    rim = c['compact/rim-off']['backgroundAfter']
    ok(rim['outline'].startswith('1px solid') and rim['radius'] == '14px', "compact, rim off: Zen's own outline, on the card's corners", rim)
    blur = report.get('compactBlur')
    if blur and blur['capture'] == 'X screen':
        ok(blur['controlMaxDiff'] > 30 and blur['cardMaxDiff'] <= 12, "compact: Zen's blur on the card changes little (the control shows it renders)", blur)
    for a11y in ['reduced-transparency', 'contrast']:
        a = c[f'a11y/{a11y}']
        ok(a['card']['fill'] == a['canvas'][0] and a['background']['display'] == 'none' and a['before']['display'] == 'none' and a['after']['display'] == 'none',
           f'{a11y}: Canvas card without decoration', a)
        ok(diff(a['pixels']['interior'], tuple(int(v) for v in a['canvas'][0][4:-1].split(','))) <= 3, f'{a11y}: Canvas pixels', a['pixels'], a['canvas'])
    return done


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--zen', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--css', type=Path, help='Glassflow Library stylesheet to load instead of this checkout\'s')
    parser.add_argument('--check', action='store_true', help='Assert the expected behaviour (for this checkout\'s stylesheet)')
    parser.add_argument('--shots', action='store_true', help='Save a cropped screenshot per case')
    parser.add_argument('--headless', action='store_true')
    args = parser.parse_args()
    report = run(args)
    print('Zen', report.get('zen'), '|', report['css'])
    for name, v in report['cases'].items():
        b, before = v['background'], v['before']
        print(f"{name:28} background: opacity {b['opacity']}, fill {b['fill']}, radius {b['radius']}, backdrop {b['backdrop'][:16]}, "
              f"shadow {b['shadow'][:12]} | ::before {before['content'][:4]} shadow {before['shadow'][:12]} | interior {tuple(v['pixels']['interior'])}")
    print('compact blur:', report.get('compactBlur'))
    if args.check:
        report['checks'] = check(report)
        (args.output / 'report.json').write_text(json.dumps(report, indent=1))
        print(len(report['checks']), 'checks passed')


if __name__ == '__main__':
    main()
