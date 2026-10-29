# Native engine, new motion

Iconflow 1.21.8 removes the Mediaflow replacements: 15 bindings, 10 drawings,
three state adapters and 4,122,492 bytes of generated sprites. The remaining
107 action IDs, 64 drawings and six state controls keep their approved geometry
and choreography. Mediaflow uses its original control glyphs. Its old background
sprite mode exposed neighboring 16/20px cells inside 26/34px button paint areas;
that mode and its Mediaflow-only rules are removed, not overlaid with overrides.

The 1.21.3 engine migration retained Circuit · Morph's 74 drawings, 122 action IDs and nine
semantic controls. Window close/minimize/maximize/restore are excluded; their
existing Glassflow/Zen glyphs and behavior remain untouched. It replaces the 1.21
live renderer with the earlier engine's
native image slots and vector strips. Set 4 remains the default; saved choices
are not remapped.

| Concern | Restored native engine | Removed live renderer |
|---|---|---|
| Placement | Original image or existing pseudo-element owns layout | Separate SVG sibling positioned against an anchor |
| Motion | Browser animates integer frames in a vector strip | JavaScript spring loop rewrites paths and transforms each frame |
| Visibility | Native visibility and opacity apply directly | Original masked; visibility copied into a second owner |
| Window glyphs | Existing Glassflow/Zen owner; no Morph binding | Absolutely positioned replacement SVG |
| Hover | Approved per-part windup; reverses from current frame | Approved windup through live spring channels |
| Activation | Baked release/settle; native command executes immediately | Live spring retargeting; native command executes immediately |

A native 1.21.1 reproduction found the close image changing from `collapse` to
`visible` on hover while its replacement SVG remained hidden. The presentation
cache missed CSS-only changes. Earlier tests forced state motion on and missed
this default-off path. The new renderer has no visibility cache, transparent
mask, geometry observer, or per-frame JavaScript callback.

`tools/iconflow-morph-frames.py` builds 128-frame SVG rows from the unchanged
approved definitions in `iconflow/morph.json`. Frames 0–31 wind up; the remaining
frames release and settle. Semantic transitions select a row for the observed
source/target states. Rendering starts only after the sheet decodes; native paint
remains visible before then. The runtime changes frame targets, not SVG nodes.

Saved legacy whole-glyph rotations are excluded while a Morph painter owns that
glyph, so they cannot run alongside its windup. They still apply to other sets
and explicit per-button styles.

Repeated actions execute immediately. Their visual sequence is bounded to one
additional cycle rather than building an unbounded queue. Frame reversal
preserves position, but is not a continuous
velocity-preserving physics solver. Menu Morph substitutions and animation share the existing menu switch, off by
default. Off preserves native icons and text-only menu entries, including panel menus.

Glassflow 3.74.3 restores ordinary state/spacing motion and basic rim light.
Pointer-following light has a separate switch, off by default. Detailed rim
control changes extra rim settings; it no longer suppresses ordinary rims when
disabled. The whole-page filter remains removed; favicon clipping is unchanged.

## Checks

- `SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs`
- `python tools/iconflow-morph-frames.py --check`
- `python tools/zen-morph-smoke.py --zen /path/to/zen --output /tmp/native-morph`
- `python tools/zen-mediaflow-controls-smoke.py --zen /path/to/zen --output /tmp/media-controls`
- `python tools/zen-smoke.py --zen /path/to/zen`
- `python tools/zen-state-motion-smoke.py --zen /path/to/zen --output /tmp/state-motion`

Native checks use disposable Zen profiles and rendered pixels, including the
close-button visibility path with state motion both off and on. They also check
windup/reversal, native command delivery, state authority, preferences, reduced
motion, reinjection and teardown. Frame advancement and DOM-write counts are not
FPS measurements. Windows/GPU frame pacing and movement antialiasing still need
the user's desktop; Linux headless rendering cannot certify them.

1.21.8 / Mediaflow 2.8.3 recorded run: same Zen/Gecko versions, Linux headless.
236 Node checks passed with upstream Sine; one optional native test was skipped
by Node and the native suites ran separately. All 192 remaining sprite poses,
eight close-glyph cases and four original window glyphs passed. The 64 remaining
sprite files are byte-identical to 1.21.7. Mediaflow's six original glyphs painted
with Morph enabled elsewhere. Control hover reached 352px from 176px; crossing
a control during growth also reached 352px instead of holding an intermediate
size. Four press timings, eight seeks, keyboard activation, focus hold/release,
sidebar hiding and the probe's successful/missed-click capture passed with zero
runtime errors. These measurements establish geometry and command behavior,
not desktop frame pacing.

1.21.3 recorded run: Zen 1.23.4b / Gecko 158.0.1, Linux headless.
233 Node checks passed with upstream Sine supplied; native checks ran separately.
61 native assertions, 222 sprite paint cases (74 drawings × three poses), eight
close-glyph paint cases at 100%/125%, and four original window glyphs passed.
Each window glyph painted identically with Morph on and off. All four combinations
of Glassflow window styling and hover-glyph settings retained their original owner.
Menu Off produced zero Morph menu owners; On/Off, panel menus and dynamically added
context commands passed. Earlier Glassflow/page checks are retained separately
because Glassflow is unchanged. [Recorded results](circuit-morph-coverage.json).
