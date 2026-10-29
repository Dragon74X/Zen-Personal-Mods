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
