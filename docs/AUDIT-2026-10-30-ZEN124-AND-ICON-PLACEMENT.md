# Zen 1.24, icon placement and preview interaction

Releases: Glassflow **3.74.14**, Mediaflow **2.8.8**. The Zenslop manifest is
Mediaflow's existing alias and stays identical. Other mods retain their versions.

## What was reproduced

The supplied Windows `hover-ab-v3` capture is from Zen 1.24b at DPR 1. It has
16 automatic phases, no errors, no empty compositor segments and no recorded
transition cancellations. The workspace image is 18px square with a 9px center
origin; Favorites are 20px square with a 10px center origin. Their layout sizes
and host positions remain fixed. The workspace's resting left edge is **56.5px**.
One CSS scale transition owns each sampled image. Those measurements rule out
a corner transform origin in those samples; they do not measure painted pixels.

Windowed Zen 1.24b / Linux software WebRender reproduces the reported leftward
growth followed by a rightward snap when a symmetric SVG is placed on a half
pixel boundary. Its computed center stays fixed while its **painted** center
changes at the animation handoff. Whole-pixel placement removes that signature.

The existing `zen-morph-smoke.py --record-hover` harness captures X11 output at
120 samples/second without screenshots or style reads on every animation frame.
Each case includes hover entry, a held state and exit, with 360 captured frames.
The red-weighted centroid of a symmetric fixture measures paint placement:

| Native image, DPR 1 | Before: horizontal centroid travel | After |
| --- | ---: | ---: |
| Workspace, 18px | 0.501494 device pixels | 0.001494 |
| Favorite, 20px | 0.500444 device pixels | 0.002608 |

Switching from `scale` to `transform: scale()`, adding `will-change` or
`translateZ(0)`, removing clipping, or applying a compensating CSS translation
did not remove the approximately half-pixel travel. Changing the actual layout
position did. The same old spring curve on a half-pixel boundary can travel
approximately one pixel. Reverting timing alone is therefore insufficient.

## Replacement and ownership

Glassflow now has one layout-alignment controller for the existing workspace
images and Favorite images. It batches geometry reads and writes, aligns the
resting layout to the device-pixel grid, and then leaves interpolation to the
existing CSS scale transition. It does not resize artwork, replace images,
wrap elements, change glyphs or write a transform on every frame.

The correction is approximately half a device pixel or less per axis, rounded to Gecko's
layout unit. Absolute flex centering uses a margin correction for workspace
images; Favorite images use relative layout offsets. The original dimensions,
scale endpoints, clipping, transparency and motion preferences remain intact.
Cloned inline offsets are accounted for when an image is first acquired.

Resize, relevant icon insertion/removal and existing workspace/tab notifications
schedule a single update. Compact-sidebar translation is allowed to finish
before alignment; its first reveal works with animated and instant motion.
Disabling workspace styling, retiring the script and reloading it release or
reacquire only the controller's own offsets and observers. The recorded hover
entry and exit runs perform **zero image style writes**.

| Display scale | Workspace horizontal centroid travel after | Favorite after |
| --- | ---: | ---: |
| 100% | 0.001494 device pixels | 0.002608 |
| 125% | 0.003936 | 0.001113 |
| 200% | 0.001869 | 0.000895 |

Both axes are recorded. Antialiasing changes the vertical weighted centroid by
up to 0.039 device pixels in these fixtures, including already aligned layouts.
The regression threshold is 0.05 device pixels, well below the reproduced
0.5–1px handoff. This is a placement test, not an FPS or perceived-smoothness
score. Full-bleed fixtures separately verify that native ancestors do not cut
off the enlarged image.

## Comparison with the older implementation

Compared `f075bc1` from October 21 (Glassflow 3.70.0, Iconflow 1.19.1,
Mediaflow 2.6.3) and the relevant October 17 geometry with current source.
Workspace SVG generation, 18px geometry, center origin and image-level scale
were already present. The important timing change was the October 28 move from
the **450ms sampled spring** to the shared motion profile: Crisp is **150ms**.
At 16.7ms the old curve completes about 0.2% of its movement and Crisp about
44%; the old curve also overshoots. This explains a different wind-up and feel,
but does not establish frame stalls. The chosen profile is preserved.

Workspace and Favorite artwork is not animated by Iconflow's Morph sprite
engine. The existing Arc host-transform exclusions also remain. The confirmed
Arc 2.0 source was checked at
[`eaf001a`](https://github.com/YashjitPal/Arc-2.0/tree/eaf001a7a2d9c797ba3af41fd50feefc657679b2).
Its parent scaling and overflow-visible rules do not justify undoing the
already verified host ownership or Groupflow image-clipping fixes.

Correction to the earlier recording: an inactive/overflow workspace fixture
could include Zen's dot-to-image visibility change. It is now explicitly a
visible, active, non-overflow workspace. Earlier distinct-image counts must not
be treated as pure scale evidence or a frame-rate comparison.

## Mediaflow: replace split hover state

The preview previously took `getBoundingClientRect().bottom` on pointer entry
and fed it back into its CSS layout bottom. During entrance, that rectangle
already includes `scale(.9) translateY(8px)`, so the offset was applied twice.
The native regression changes the preview's bottom from **695.5833px to
702.7834px** before correction. It remains **695.5833px** afterward.

Separate hover/frozen-rectangle flags are replaced by one interaction state:
resting, waiting for growth, grown, or held for a control. It owns the growth
timer, original entry deadline, layout anchor and frozen control rectangle.
Geometry is read in CSS layout coordinates. Focus or press holds the current
rectangle; release resumes the remaining original delay. Hiding, changing
source, disabling controls and teardown reset that state. Late events cannot
hold a hidden preview or reopen a sidebar that has already gone away.

The final review also reproduced and corrected an initialization-order error
in the new refactor when loading with controls disabled in compact mode.
That startup case is part of the native regression suite. Original control
glyphs, actor commands and the existing native window-drag exclusion remain.

## Zen 1.24 adaptation

Checked the [official 1.24b release](https://github.com/zen-browser/desktop/releases/tag/1.24b)
and tagged source, including tabs, workspaces, native folders, Library, routing
and PiP changes. The release is based on Firefox 159 and adds Library section
customization and Space Routing settings there, alongside the native media
and Windows HDR fixes. Those release notes do not establish an icon-jitter fix.

One concrete collision was reproduced: Zen now moves `.tab-label` upward by
6px when its sublabel appears. Glassflow's click animation froze the title's
`transform`, blocking that native change for the animation's duration. The
horizontal settle now animates the independent **`translate`** property. Zen
retains live ownership of its transform throughout. The native test pauses a
real click animation and verifies title Y moves **252.1000 → 246.1000 →
252.1000px** as the sublabel appears and disappears, with X held fixed.

Router already delegates native tab routing to `gZenSpaceRoutingManager`.
Library's default warm mode already calls `ZenLibrary.getInstance()`, so the
new native sections/customization do not need a duplicate implementation.
Native folder relayout and Library-copy behavior are retained. No speculative
rewrite of those paths, browser graphics settings or installed Arc files is
included.

## Checks and limits

- Repository gate with upstream Sine manager: **238 passed, zero failed, one
  optional native entry skipped**. The native runners were executed separately.
- Native Morph runner on Zen 1.24b: existing context-menu ownership, wind-up,
  URL-bar binding, five scale profiles, hover/press interruption, reduced
  motion, original close/window-control paint, cleanup and automatic probe pass.
- Native state-motion runner: five profiles, rendered hover states, four light
  profiles, live reduced motion, native title lift, Library-copy actions and
  existing geometry checks pass.
- Native Mediaflow runner: disabled-controls compact startup, entrance-hover
  anchoring, six original glyph paints, four hover timings, eight seeks,
  focus hold/release, keyboard activation and canvas navigation pass. The
  diagnostic captures six presses, four commands and two deliberately missed
  clicks, then cleans up and auto-copies.
- Windowed pixel cases at DPR 1, 1.25 and 2: alignment, clipping bounds, zero
  animation-time style writes, disable/reload cleanup and first sidebar reveal.

Reproduce with the existing runners and a disposable profile:

```sh
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs
python3 tools/zen-morph-smoke.py --zen /path/to/zen --output /tmp/morph-check
python3 tools/zen-state-motion-smoke.py --zen /path/to/zen --output /tmp/state-check
python3 tools/zen-mediaflow-controls-smoke.py --zen /path/to/zen --output /tmp/media-check
DISPLAY=:99 python3 tools/zen-morph-smoke.py --zen /path/to/zen \
  --output /tmp/paint-check --record-hover --record-dpr 1.25 \
  --record-case workspace-production-half-pixel \
  --record-case favorite-production-half-pixel
```

Use an X11 display large enough for the scaled browser window. The constrained
test container required content/RDD/GPU sandbox overrides for video decoding;
without them the fixture stopped at readyState 1 on both Zen 1.23.4b and 1.24b.
No such overrides or graphics preferences are shipped to users.

**Remaining limits:** Linux software pixels cannot certify Windows hardware
WebRender smoothness, physical mouse delivery, or all installed custom CSS.
The user's newest capture had no active Mediaflow source. Low-resolution
favicons can still blur when enlarged; this correction does not invent image
detail. The user capture also reports `sine.auto-updates: false`, so a merged
release needs an explicit Sine update unless that preference is changed by the
user. No preferences are silently changed.
