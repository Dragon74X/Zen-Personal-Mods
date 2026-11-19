#!/usr/bin/env python3
"""The Library button keeps Zen's proportion to the other icons at every Icon size.

python tools/zen1241-iconflow-library.py --zen /path/to/zen [--root /path/to/mods]
Disposable profile only; never touches a user profile. Zen 1.24 drew the Library
sprite 18px scaled 1.08; Zen 1.24.1 draws it 20px unscaled. At Icon size 0
Iconflow leaves Zen's size alone; a larger size must grow Zen's own sprite by
the same factor as the other icons (box / 16), on either version. Circuit stack
and "Same size as the other buttons" keep their own fixed sizes. Measures layout
boxes only (getBoundingClientRect); it does not certify rendered smoothness.
"""
import argparse, json, runpy, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
suite = runpy.run_path(str(ROOT / 'tools/zen1241-iconflow-hover.py'))['suite']
BOX = {0: 16, 1: 18, 2: 20, 3: 22}
# (zzicon.set, zzicon.library.style, label). 11 follows the set; 12 is Circuit stack.
CASES = [(0, 0, "Zen's animated icon"), (4, 11, 'Morph follows the set'), (0, 11, "Zen's own follows the set"),
         (4, 1, 'outline of Zen\'s icon'), (4, 3, 'Layers line style'), (4, 10, 'line style 10'),
         (2, 11, 'Circuit stack (follows Circuit)'), (4, 12, 'Circuit stack')]

MEASURE = r'''return (async () => {
 const v = VALUES, P = Services.prefs, wait = ms => new Promise(r => setTimeout(r, ms));
 P.setIntPref('zzicon.set', v.set); P.setIntPref('zzicon.library.style', v.style); P.setIntPref('zzicon.size', v.size);
 P.setBoolPref('zzicon.library.size', v.same); await wait(500);
 const b = document.getElementById('zen-library-button'), s = b.querySelector('.zen-library-sprite');
 const r = e => { const x = e.getBoundingClientRect(); return [x.x, x.y, x.width, x.height]; };
 return {button: r(b), sprite: r(s), scale: getComputedStyle(s).scale, zoom: getComputedStyle(s).zoom};
})();'''


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--zen', required=True, type=Path)
    p.add_argument('--root', type=Path, default=ROOT, help='Folder holding the mod folders (default: this checkout)')
    p.add_argument('--output', type=Path, help='Folder for the browser log')
    args = p.parse_args()
    failures, checks, rows = [], 0, []
    with tempfile.TemporaryDirectory(prefix='zen-library-out-') as scratch:
        with suite(args.zen, args.root.resolve(), (args.output or Path(scratch)).resolve()) as (m, _):
            names = ['zzicon.set', 'zzicon.library.style', 'zzicon.size', 'zzicon.library.size', 'zen.view.sidebar-expanded']
            saved = m.script('return ' + json.dumps(names) + '.map(k=>[k,Services.prefs.prefHasUserValue(k),Services.prefs.getPrefType(k)===Services.prefs.PREF_BOOL?Services.prefs.getBoolPref(k):Services.prefs.getPrefType(k)===Services.prefs.PREF_INT?Services.prefs.getIntPref(k):null]);')
            m.script("Services.prefs.setBoolPref('zen.view.sidebar-expanded',true);document.documentElement.setAttribute('zen-sidebar-expanded','true');return true;")
            try:
                measure = lambda **v: m.script(MEASURE.replace('VALUES', json.dumps(v)))
                # Zen's own rendered size, untouched by Iconflow at Icon size 0.
                zen = measure(set=0, style=0, size=0, same=False)['sprite'][2]
                for size, box in BOX.items():
                    for icon_set, style, label in CASES:
                        for same in (False, True):
                            got = measure(set=icon_set, style=style, size=size, same=same)
                            stack = style == 12 or (style == 11 and icon_set in (2, 3))
                            want = box if same else (16 if size == 0 else box * 1.125) if stack else zen * box / 16
                            name = f'size {size} ({box}px) {label}' + (' same size' if same else '')
                            checks += 1
                            if abs(got['sprite'][2] - want) > .05 or abs(got['sprite'][3] - want) > .05:
                                failures.append({'name': name + ' has the expected size', 'want': round(want, 3), 'got': got})
                            if not same:  # "Same size" keeps its existing 1px nudge.
                                checks += 1
                                b, s = got['button'], got['sprite']
                                if max(abs(b[0] + b[2] / 2 - s[0] - s[2] / 2), abs(b[1] + b[3] / 2 - s[1] - s[3] / 2)) > .05:
                                    failures.append({'name': name + ' stays centred in its button', 'got': got})
                            rows.append({'name': name, 'want': round(want, 3), 'sprite': [round(x, 3) for x in got['sprite']], 'scale': got['scale'], 'zoom': got['zoom']})
            finally:
                m.script('for(const[k,user,value]of ' + json.dumps(saved) + '){if(user&&typeof value==="boolean")Services.prefs.setBoolPref(k,value);else if(user&&typeof value==="number")Services.prefs.setIntPref(k,value);else Services.prefs.clearUserPref(k);}return true;')
    print('LIBRARY', json.dumps({'zen': zen, 'rows': rows, 'failures': failures}), flush=True)
    assert not failures, json.dumps(failures, indent=1)
    print(f'PASS {checks} Library size checks (Zen draws {round(zen, 3)}px at Icon size 0)', flush=True)


if __name__ == '__main__':
    main()
