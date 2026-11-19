# Preview input and icon scaling

Reviewed Mediaflow's preview geometry, focus/press holds, native input regions,
source registry and parent/content control messages; Glassflow's tab/workspace
geometry, state transitions and transparent-page filter updates; and Iconflow's
Morph bindings, browser-owned frame runs and mutation scheduling.

## Corrections

**Mediaflow 2.8.6:** the preview is a fixed overlay outside the toolbox. It had
DOM hit testing (`pointer-events: auto`) but no native window-drag exclusion.
Zen can mark the empty tab strip underneath it as draggable. Gecko collects
drag and no-drag rectangles separately: an overlapping element's default value
does not remove the underlying drag region. Windows returns `HTCAPTION` for
that region, independently of DOM `elementFromPoint` results. This is a concrete
input-ownership gap consistent with unregistered clicks and window actions;
the user's physical Windows click failure has not been reproduced here.

The existing preview rule now declares `-moz-window-dragging: no-drag`. Canvas,
buttons and slider share that exclusion. No command handlers, glyphs, event
interception, timers, source arbitration or hover geometry are replaced.

Sources: [Gecko region construction](https://github.com/mozilla-firefox/firefox/blob/main/layout/painting/nsDisplayList.cpp),
[Windows hit testing](https://github.com/mozilla-firefox/firefox/blob/main/widget/windows/nsWindow.cpp).

**Glassflow 3.74.12:** its existing tab anchor cleared `transform` only. Zen's
native press rule uses the independent `scale` and `rotate` properties. In Zen
1.23.4b, pressing a native Favorite reduced its host from 176 × 50px to
172.4833 × 49.0333px and moved its left edge from 5px to 6.75px. The computed
host scale was .98; the native rule also supplies a .01deg rotation.

The same anchor now clears all three properties. Its existing drag/close
exceptions remain. Favorites previously had hover growth but no image-level
press state; they now press to .95 on the same image scale transition, then
return to the current hover/rest state. The existing motion switch disables
this press state; reduced motion skips interpolation. Five motion profiles,
icon dimensions, artwork, shape clipping and saved settings remain intact.

## What the Windows capture establishes

The supplied `icon-hover-v6` capture has 12 runs: six workspace, five Favorite
and one new-tab. Across 173 scale-animation samples, at most one scale
transition owns the image. There are zero sampled scale reversals while
hover/press state is unchanged and zero sampled host-box travel. Thus the
native press issue reproduced above does not establish the cause of the
remaining hover roughness in this capture.

Per-run compositor medians are 4.16–4.32ms. The 21–38ms intervals frequently
occur after growth settles; these window-wide idle/video intervals are not
evidence of dropped icon frames. Probe setup itself takes 35–43ms in four runs.
Hardware WebRender is enabled on the user's RTX 4080 SUPER, with two 240Hz
displays. No global graphics settings were changed.

Other code-level contributors remain distinguishable:

- Crisp is now 150ms instead of the earlier 450ms icon spring. Its curve
  completes about 60% of growth in 25ms and 86% in 50ms. That can explain a
  more abrupt feel; it does not prove frame stalls. Preserve the chosen profile.
- Workspace grayscale/opacity and Favorite lighting animate alongside scale.
  They affect paint, but this capture does not prove they cause visible jitter.
- Raster alignment is still a candidate. Forced Linux snapshot reads show
  stepped image sizes, but the passive headless composition recorder yields
  only one frame per run. These checks cannot certify Windows live rendering.
  Layer hints, perspective and tiny-rotation experiments are not shipped.
- The current transparent-page blur listener filters descendant transitions;
  the former per-icon filter-rewrite loop is already removed. Workspace and
  Favorite images are not Morph sprite records and have no JS frame loop.

## Validation boundary

The existing native Mediaflow harness checks the parsed no-drag declaration,
real video/actor commands at four hover timings, eight seeks, keyboard control,
canvas navigation, six original glyph paints, Arc hover geometry, focus holds,
and probe capture/clipboard cleanup. Parsed CSS and WebDriver input do not
verify Windows native hit testing.

The existing Morph harness adds Favorite press/release to all five profiles
(40 total scale cases), checks stationary targets, motion-off/reduced-motion
behavior and preservation of native drag/close properties. These are native
behavior/geometry checks, not visual certification of the user's hover motion.
The remaining Windows workspace/Favorite hover smoothness remains open.

Final results: 236 Node tests passed, zero failed, one optional native entry
skipped there and run separately. Both native harnesses passed on Zen 1.23.4b.
The additional native-Favorite before/after measurement confirms zero position
or size travel after the correction (176 × 50px throughout press/release).

## Follow-up: rendered frames and missing wind-up

**Iconflow 1.21.9:** attachment awaited image decoding, then initialized hover
and keyboard focus to false. Refreshing a hovered button reproduced
`matches(':hover') === true`, `record.hover === false`, phase `rest`, frame `0`.
No second pointer-entry event arrives while the pointer remains there.
Attachment now reads the current hover/focus state and invokes the existing
wind-up path only when either is present. Four native regression checks cover
hovered/focused attachment and the corresponding rest states. No new animation
engine, artwork, duration, selector, setting or per-frame callback was added.

The single-frame composition recorder was not treated as a stopping point.
Zen 1.23.4b was run in a disposable **windowed X11** profile and its screen output
captured through FFmpeg, without `drawSnapshot` or per-frame DOM/style reads.
The existing runner now exposes this diagnostic:

```sh
DISPLAY=:99 python3 tools/zen-morph-smoke.py --zen /path/to/zen \
  --output /tmp/zen-hover-render --record-hover
```

Requires an existing X11 display, FFmpeg and the runner's existing Pillow
dependency. Writes six lossless videos and `hover-result.json`; rejects missing
motion, ineffective duration overrides, empty captures and one-image captures.
Decoding preserves source frames rather than duplicating them to an inferred
frame rate. Test profiles and CSS overrides are disposable.

Final run: **2,160 captured frames**, six cases, 360 samples each. The symmetric
300px SVG/PNG fixture renders at 18px for workspaces/reference and 20px for the
native Favorite. Parent paint is frozen to isolate image scaling. All six scale
animations reported compositor execution.

| Case | Transition | Distinct captured images |
| --- | --- | ---: |
| Workspace, current timing | 150ms Crisp | 16 |
| Workspace, duration only | 450ms Crisp | 27 |
| Workspace SVG | 1000ms linear | 16 |
| Workspace PNG | 1000ms linear | 16 |
| Native Favorite SVG | 1000ms linear | 5 |
| Bare HTML image outside sidebar | 1000ms linear | 5 |

These counts are **not compositor FPS or a smoothness score**. Duplicate screen
samples and settled periods are included. Stepped raster output also occurs on
the bare reference, so it cannot establish a mod-specific cause. Earlier
isolated tests found the same nine distinct workspace images with or without
`will-change: transform`, `will-change: scale`, `translateZ(0)` or
`image-rendering: smooth`. None of those hints was shipped. A forced OpenGL
comparison produced black X11 captures and was rejected, not called a pass.
Available usable renderer: Linux software WebRender; Windows hardware output
remains unverified.

### Source comparison

- [Mozilla's icon animation reference](https://firefox-source-docs.mozilla.org/devtools-user/page_inspector/how_to/work_with_animations/index.html)
  scales and changes grayscale using compositor animation. Our workspace and
  Favorite images likewise use native CSS scale, not a JS resize/frame loop.
  A compositor flag alone does not certify the resulting pixels.
- [Zen 1.23.4b workspace CSS](https://github.com/zen-browser/desktop/blob/1.23.4b/src/zen/spaces/zen-workspaces.css)
  transitions parent filter/opacity and overflow widths. Its
  [overflow image rule](https://github.com/zen-browser/desktop/blob/1.23.4b/src/zen/spaces/overflow-icons.inc.css)
  also uses transform/opacity; Glassflow already replaces that transform with
  its single scale owner. The supplied non-overflow capture has zero host travel.
- [Mozilla browser performance guidance](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_158_0_1_RELEASE/docs/performance/bestpractices.md)
  recommends compositor transforms and avoiding layout/style read-write loops.
  Reviewed Morph discovery, edge following, page-blur updates and Mediaflow
  geometry. No new hover-driven resize loop was established for these images.
- Morph differs from continuous image scaling: 32 wind-up poses over 180ms
  (31 pose intervals), then 96 action intervals over 600ms at default speed.
  Those finite poses cannot provide one new pose at every 240Hz refresh.
  Workspace/Favorite images are not Morph sprites, so this cannot explain
  their scaling issue. The approved sprite artwork/choreography is preserved.

Validation: 236 Node tests pass, zero fail, one optional native entry skipped
there and run separately. Native runner passes 268 checks, 40 scale cases and
192 sprite-paint cases. Screen-capture mode passes all six cases. The confirmed
attachment bug is fixed; remaining Windows workspace/Favorite jitter is open.

## Automatic Windows comparison (v3)

The first Windows report had zero phases and `finished: manual`. Version 1
required selection, F8, Begin and rating choices before collecting data. That
interaction requirement was a diagnostic defect; it is removed rather than
retained as another mode.

Paste the complete `tools/icon-hover-ab-probe.js` source into Browser Console.
Execution starts the entire capture. It selects up to one visible workspace,
one pending Favorite, one loaded Favorite, one pending normal tab and one
loaded normal tab. There is no version gate, F8, start button or rating step.
The only control is optional Stop + copy.

Workspace/Favorite targets each receive five conditions: Current, 450ms only,
opacity/filter off, fixed lighting, and observed scale endpoints through
transform. Normal tabs receive the Current condition, including label/stack/
close-button geometry. At most 17 phases run; each applies a bounded automatic
hover/press/release sequence. A 120-second deadline restores and copies even
if capture cannot finish. Hidden/missing targets and unavailable APIs are
reported without inventing samples.

The probe temporarily reveals a compact sidebar through Zen's existing
`zen-user-show` attribute and restores it. CSS locks, including prior forced
on/off states, are saved and restored. No tab selection, click commands,
preference writes, graphics changes, screenshots or page URLs. Installed and
available versions, Sine auto-update/guard state, frame-index timing, window
compositor intervals and bounded style/geometry samples are collected.

Automated CSS states do not exercise JavaScript pointer handlers or OS input
routing. Timing and computed geometry do not certify Windows pixel smoothness.
No visual ratings are required or manufactured. The root-cause investigation
of remaining workspace/Favorite raster jitter remains open.

Run the existing native check:

```sh
MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 python3 tools/zen-morph-smoke.py --zen /path/to/zen \
  --output /tmp/zen-hover-ab --probe-ab
```

It supplies no pointer, keyboard, start or rating input. It checks autonomous
completion, all 17 phases across five native target categories, clipboard
output, unchanged saved preferences and tab selection, prior negative CSS-lock
restoration, and cancellation during an active override.

## Additional audit findings

The supplied report still has Glassflow 3.74.11, Mediaflow 2.8.5 and Iconflow
1.21.8. Those installed metadata versions predate the three previously merged
fixes. This does not prove an updater failure: the shared updater checks every
three hours and respects Sine auto-update. Installed metadata also does not
prove which cached runtime code is active.

A separate update bug **was reproduced against upstream Sine**. The shared
guard treated any different store version as newer, synthesizing a current
release date even for a stale older entry. A store `1.0.0` entry could replace
installed `9.9.9` with missing, older or equal timestamps. The guard now uses
Gecko's version comparator and supplies a synthetic date only for a greater
version. Explicit newer release dates retain native Sine behavior. The same
implementation is shipped in all ten standalone mods. These background
modules are cached; the revised guard takes effect after updating and
restarting Zen.

The speed label also hid a timing distinction. At the supplied `0.7s` setting,
Morph scales its 180ms wind-up and 600ms action by 0.7/0.45: **280ms and
933.33ms**, respectively. Its 31 and 96 pose intervals then provide at most
110.7 and 102.9 changes/second, below 240Hz. This is separate from continuous
workspace/Favorite scale transitions. Labels now expose Circuit duration and
Morph segment times; saved values and artwork/choreography are unchanged.

## Windows v2 capture: center and container-fit hypothesis

The next Windows capture completed 17 phases and 187 snapshots without reported
errors, on **Zen 1.24b**. All ten installed metadata versions match the available
versions. Metadata alone does not identify every cached runtime module.

The three Current scaling cases contradict corner-origin or container-fit
motion at the sampled times:

| Target | Rest / hovered image width | Maximum center range, either axis | Maximum size error against rest size × computed scale |
| --- | --- | --- | --- |
| Workspace | 18 / 23.4px | 0.000107px | 0.00310px |
| Pending Favorite | 20 / 26px | 0.008339px | 0.008281px |
| Loaded Favorite | 20 / 26px | 0.008339px | 0.008281px |

All sampled host boxes remain stationary. The inferred origins at the settled
1.3 scale are 9px/9px for the workspace and 10px/10px for both Favorites: half
the resting image dimensions. A top-left origin would shift these centers by
2.7px or 3px. No layout-size correction appears in the measured image boxes.
Across all 15 scaling comparisons, center range stays below 0.017px per axis.
Running image scale/transform samples each have one compositor animation owner.
This is sampled CSS/geometry evidence; it does not capture Windows pixels.

The Favorite sources report 16×16 intrinsic dimensions, displayed at 20×20
normally and 26×26 on hover (1.25× and 1.625× source size). Magnification can
affect raster detail; it does not explain the 300×300 SVG workspace source.
Crisp's 150ms curve completes about 93% of growth by the ~71ms hover samples.
No production sizing, origin, timing or artwork is changed on that evidence.

Across the whole report: 13,423 rAF intervals; 4.166ms median, 16.666ms maximum,
six intervals above 8.4ms. These are main-thread intervals, not image frame
delivery. The pending normal tab's close-button opacity passes through 0.9306
and its content through 22.333px of its 24px displacement at ~71ms: interpolation
is present in that sampled case. The loaded-tab target was at x=1326px; v2 did
not verify ancestor clipping or hit-test visibility, so that target cannot
establish behavior of a visible loaded tab.

### Measurement corrections

- The three 450ms phases returned no compositor intervals. Gecko's recorder has
  a default 600-frame ring and returns an empty array after it is overwritten.
  600 frames cover only 2.5 seconds at 240Hz; a 3.3-second phase can exceed it.
  V3 drains at existing state checkpoints, at most 600ms scheduled per segment,
  without changing preferences. Empty segments are explicitly unavailable.
- V2 released press after 300ms, cancelling its own 450ms comparison three
  times. V3 holds press for 600ms, as it already does for hover/release.
- Sine uses `sine.auto-updates`, not `sine.auto-update`. Module presence belongs
  to `Components.utils.isESModuleLoaded`, not `ChromeUtils.isESModuleLoaded`.
  The old `loaded:false` result did not establish an absent updater. V3 reports
  API availability separately and reads the shared loader without loading an
  absent manager.
- Target discovery now requires a center hit inside the host, excluding
  clipped/covered slots despite nonzero bounding boxes. Geometry samples now
  include layout width/height, transform origin/box and object fitting.

Sources: [Gecko recorder limits](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_159_0_RELEASE/dom/base/nsDOMWindowUtils.cpp),
[ring behavior](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_159_0_RELEASE/layout/painting/WindowRenderer.cpp),
[module-presence API](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_159_0_RELEASE/js/xpconnect/idl/xpccomponents.idl),
and upstream Sine `src/core/utils.sys.mjs`.

The existing native check now verifies centered scaling and fixed layout size,
proportional rendered bounds, segmented capture, absence of probe-induced
scale cancellations, clipped-target exclusion, and updater preference/API
reads, alongside automatic capture and restoration. Its cancellation check
waits for the actual 450ms override instead of assuming it from elapsed time.
Zen 1.24b requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` for this disposable-profile
test; its old command-line system-access flag alone is insufficient.

Validation: Zen 1.24b completed all 17 phases, 187 snapshots and 153 timing
segments; maximum segment 602.64ms, maximum image-center range 0.016694px.
Clipping exclusion, prior locks, saved preferences, selection, automatic
clipboard and cancellation during an observed override passed. The Node gate
passed 237 tests, zero failed, one optional native entry skipped there. These
native results use Linux rendering, not the user's Windows output.
