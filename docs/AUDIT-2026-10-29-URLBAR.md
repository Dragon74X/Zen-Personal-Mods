# URL-bar hover and missing windups

The 59.67-second, 30 fps recording still shows uneven workspace movement.
The preceding motion-profile change is not evidence that desktop rendering is
smooth. Workspace icons are native SVG images, not Morph frame strips. Their
child scale and parent greyscale/opacity transitions have separate roles;
the earlier live capture did not show two competing size controllers.
Workspace frame pacing and Windows antialiasing remain unresolved.

## Confirmed defects and corrections

- Arc's exact `#urlbar:hover` rule translates the whole target upward 2px over
  500ms. Native pointer movement along its bottom edge reproduced 17 hover
  changes in 1.6 seconds. Glassflow's existing motion switch now anchors only
  the closed bar. The same input produces one entry and zero vertical travel.
  Disabling the switch releases the rule; the open bar accepts its native
  search-mode scale animation. Arc's installed files are unchanged.
- Copy URL is now `#zen-copy-url-button .urlbar-icon`, and Downloads paints
  `#downloads-indicator-icon`. The old selectors missed these slots. Update
  Morph bindings, the canonical legacy generator/targets and completion hooks
  together; retain the separate customisable Copy URL toolbar button.
- URL-bar page actions and identity buttons own events; their inner images own
  paint. Binding the image missed padding hover/clicks. Click-driven XUL boxes
  now animate; command-driven buttons still ignore their duplicate click.
  Disabled boxes do not wind up. Bookmark state still reads the inner star.
  These marked button hosts also retain their stationary target under Arc press.
- The legacy icon generator deleted every SVG subdirectory, including Morph's
  independent output. Limit deletion to its own Circuit/Clean/Library folders.
  Regeneration leaves all 206 existing SVG files byte-identical.

No artwork, windup definitions, workspace motion, settings values or native
window-control glyphs are changed. Releases: Iconflow 1.21.7, Glassflow 3.74.9.

## Windup visibility is a separate gap

The approved semantic-control definitions contain extremely small geometric
windups. Maximum path-coordinate changes scaled to an 18px icon are:

| Control | Change |
| --- | ---: |
| Compact | 0.0675px |
| Bookmark | 0.0113px |
| Closed sidebar | 0px |
| Application menu | 0.15px |

These are coordinate differences in the supplied poses, not screenshot-derived
travel. A frame counter can advance through all 31 windup frames without a
clearly perceptible shape change. Binding corrections cannot fix that amplitude
gap; this release preserves the approved poses rather than globally magnifying
or replacing their choreography.

## Verification

Use the existing `tools/zen-morph-smoke.py` with Zen 1.23.4b and upstream Sine for
`node --test tools/*.test.mjs`. Added native checks exercise the exact Arc rule,
real pointer motion, real Copy URL and Site Settings padding, fixed-frame pixel
comparisons under identical hover styling, one native Copy URL command, disabled
state, and open URL-bar transforms. Downloads uses native-shaped markup because
Zen's Library replaces that widget in the test profile. Existing bookmark,
menu opt-out, cleanup, reduced-motion and unchanged-window-paint checks remain.

Probe v4 (`tools/icon-hover-probe.js`) records every animation-frame callback
interval, parent animations/filter/opacity, SVG intrinsic dimensions and URL-bar
hover. Style/box reads remain throttled. It auto-copies after 20 seconds and
removes its hooks. These main-thread timings can be affected by sampling and
are not compositor present times or an FPS benchmark. Current live measurements
are still needed to diagnose the recorded workspace stutter.

Recorded final checks: 235 Node checks passed, zero failed, one optional native
entry skipped there and run separately. The full native suite passed 181 named
assertions, 30 scale-profile cases, 222 sprite-paint cases, eight close-glyph
cases, four unchanged window-glyph comparisons and probe v4 auto-copy/cleanup.
The strengthened fixed-frame URL-button pixel check also passed in a separate
run of the exact new harness block. Arc edge tests showed 17–18 hover changes
without the correction, one with it, and vertical travel of 2px versus 0px.
These results do not close the workspace rendering or subpixel-windup gaps.
