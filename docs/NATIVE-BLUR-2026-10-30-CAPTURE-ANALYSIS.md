# Returned v4 capture and corrected v5 evidence collection

The returned Windows run completed 32 settled cases and 28 transition sequences,
then stopped in case 61, two frames into a right-side, opaque, native-only load.
It contains 964 PNG crops. Overlay and accessibility-menu phases were not reached.
Raw screenshots, reports, account paths and device identifiers are not committed.

## What the pixels establish

- Native-only and native-no-nudge settled sidebar crops were pixel-identical in
  all four side/background combinations. This is settled-state evidence, not
  permission to remove the redraw workaround during navigation or movement.
- In the left opaque case, mean adjacent horizontal luma difference fell from
  4.104 to 0.143 on the 0–255 scale; the outside control retained 5.795. The
  rendered stripe detail is suppressed behind the sidebar. This metric is not
  frame pacing, FPS or a claim about every page/renderer.
- Reduced-transparency crops were uniform opaque fills in the captured fixture.
- The sequence fixture reused the same stripes before and after navigation.
  An unchanged backdrop could therefore resemble a correct new one. Some control
  frames change during navigation, but the settled pattern does not identify the
  new document. This capture cannot certify fresh backdrop pixels after loading.
- The reported Glassflow version was 3.74.17, before the selected-load completion
  refresh shipped in 3.74.18. It does not validate that later fix.

The case-61 error conflated a different foreground process, a different browser
window and an absent fixture title marker. Its available data cannot establish
which condition occurred. Do not infer a user focus change from that message.

## Corrections in the collector

The v5 worker keeps process, unique title and authenticated window checks. It
omits screenshots during an identity gap, waits at most 2000ms for recovery and
records the omitted interval. Persistent failures identify the failing condition
without storing another window's title, PID or HWND. Fixture menus use their
verified owning browser. Foreground, geometry and occlusion checks remain active.

Loads and tab switches now change a wide cyan band to amber; slides retain one
challenge. Fine stripes remain for blur measurements. The report records only
generated document labels, load state and title-match booleans. A fixture leaving
the known generated URLs aborts the run. No mod update is required to run it;
installed versions still determine which production behavior it measures.

The local [analyzer](../tools/analyze-native-blur.py) reads a ZIP without extracting
it, measures stripe contrast, crop changes, paint signals and sample intervals,
and omits private paths, dates, graphics details and images from its output.
It deliberately produces measurements rather than an automatic pass for blur
freshness or visual smoothness.

## Checks run

- Repository gate with upstream Sine and PowerShell: 289 passed, 0 failed,
  1 optional native entry skipped; native checks ran separately.
- Real PowerShell worker code: five coordinate cases, nine refusal cases,
  error-journal behavior, transient title recovery, owned-menu identity, three
  distinct persistent identity refusals and cancellation. Win32 calls substituted.
- Real PowerShell transport and Node capture lifecycle checks passed, including
  immutable file handoff, sequence bounds, cleanup and unexpected navigation.
- Actual Zen 1.24 rendered the shipped cyan `(32,200,255)` and amber `(255,144,32)`
  pixels exactly for both opaque and transparent documents. The test driver had
  to select the generated content browsing context explicitly; the final check
  reads the intended tab, not the original blank tab.
- All 102 phases completed in actual Zen chrome with a simulated screen worker;
  preferences/UI restored and ZIP creation passed. This is not Windows pixels.
- Analyzer self-checks passed against generated flat, striped and color-change
  images; analysis of the returned ZIP reproduced the counts and equalities above.

Production mod files/defaults are unchanged by this collector repair. The redraw
workaround and saved optional page-filter choice remain intact. The next Windows
capture must establish changing backdrop pixels, plus the previously unreached
overlay/menu phases, before another production decision follows.

Run the [automatic v5 capture](../tools/NATIVE-BLUR-PROBE.md) from the Browser
Console and return its ZIP and copied JSON. It creates its directory and package,
advances automatically and restores temporary state. Analysis and resulting fixes
remain implementation work, not a task assigned to the person running the probe.
