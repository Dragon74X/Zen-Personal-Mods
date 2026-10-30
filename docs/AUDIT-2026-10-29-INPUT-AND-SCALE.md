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

## Windows user comparison

`tools/icon-hover-ab-probe.js` runs from the Browser Console against installed
mods; it has no version gate and writes no preferences. It presents five
6-second phases on one selected workspace or Favorite icon:

1. Current behavior.
2. Same easing, with image scale duration changed to 450ms.
3. Current scale timing, with image/ancestor opacity fixed at 1 and filters off.
4. Current scale timing, with ancestor lighting/background inputs fixed.
5. Hover-only comparison through `transform`, using observed scale endpoints
   and the existing timing. The separate scale transition is disabled for this
   phase, so two properties cannot simultaneously resize the icon.

Hover an affected icon, press F8, move off it, then click Begin. Move on/off the
same icon during each recording. After Current, click Next comparison; after
each other phase choose Fewer jumps, Same jumps, More jumps, or Cannot compare.
The final choice copies one JSON report and removes temporary styling/UI.
Stop + copy does the same early; a 3-minute deadline also restores and copies.
Repeat with the other icon type for a second report.

Copy and paste the complete self-contained file into Browser Console
(Ctrl+Shift+J on Windows). No update is required to run it. Do not use an
`eval()` or data/file subscript download launcher: Zen's chrome CSP/trust checks
reject those paths. No security preference change is required. Reduced/instant
motion disables the probe's interpolation overrides and is reported explicitly.

The probe records installed versions, graphics details, relevant preferences,
interaction/transition events, observed animation owners, rAF intervals and
window-wide compositor intervals. It limits each phase to 16 style snapshots,
100 events and 2,000 rAF intervals. It never captures pixels or page URLs.
Visual choices are required because timing/computed values alone cannot certify
the icon's raster output. URL-valued CSS is omitted from exported data.

The first compositor interval can begin before the phase. Idle window gaps are
not evidence of dropped icon frames. The report marks ineffective overrides or
unsupported transform endpoints unavailable rather than counting them as a
successful comparison. An opacity of zero is not frozen in the fade test:
overflow workspace icons must remain visible for the comparison.

Interpret fewer jumps by condition: timing -> test the shared scale duration;
fade/filter -> isolate state filtering/opacity from scaling; lighting -> inspect
paint invalidation; transform -> compare the shared transform path. All-same
results require further renderer/asset isolation; no global graphics setting
change follows from these counters alone.

Runnable native check, reusing the existing runner:

```sh
python3 tools/zen-morph-smoke.py --zen /path/to/zen \
  --output /tmp/zen-hover-ab --probe-ab
```

Checks all five phases on native workspace and Favorite slots, verifies the
duration/transform overrides, reads the auto-copied report, checks unchanged
saved preferences, and checks cleanup after completion and cancellation.
Its scripted Same verdicts exercise the controls; they are not visual findings.
