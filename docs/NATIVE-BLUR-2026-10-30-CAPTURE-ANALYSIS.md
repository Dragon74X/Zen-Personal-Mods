# Returned Windows pixels and popup accessibility

## Completed v5 capture

The returned v5 run completed **102 cases, 1,628 PNG crops, zero errors**:
32 settled cases, 48 sequences, 16 overlay cases and 6 menu cases. The report
identifies Glassflow 3.74.17, before the 3.74.18 selected-load refresh and the
3.74.19 Mica contrast gate. Raw captures, reports and account paths remain private.

| Evidence | Finding |
| --- | --- |
| 24 loads/tab switches | Both the outside control and sidebar change from the cyan challenge to amber, for both sides, requested background labels and all three variants. Native-only and native-no-nudge both show fresh backdrop color. |
| 24 sidebar slides | The sampled intermediate crops show blur on the moving sidebar. All 12 opening/closing pairs have pixel-identical corresponding open and closed endpoints; their outside controls are unchanged throughout. |
| Four settled native comparisons | Native-only and native-no-nudge sidebar crops are pixel-identical on both sides and requested backgrounds. |
| 16 overlays | The small/large recipe fixtures visibly suppress stripe detail over the generated content at both blur radii. Mean horizontal luma difference falls from 3.262 in the reference to 0.006–0.047 on the 0–255 scale. |
| Six menus | Contrast cases paint dark text on a black menu. The first normal capture is dim, consistent with the known staggered entrance animation. Both requested normal light/dark cases actually use the dark palette; their labels do not establish distinct theme coverage. |

The two recovered identity gaps retained the same process and window; only the
generated title marker was temporarily absent. The omissions were 32ms and 30ms.
The earlier combined error did not establish lost focus. Median sidebar sample
spacing is 62ms, range 50–100ms; these samples cannot certify monitor-frame pacing.

The generated loads, slides and overlays show working blur. However, the opaque
and transparent references both paint the same `(22,23,22)` background between
black stripes. Their labels do not establish both transparency states; v5 did
not read the remote document backgrounds. This also does not reproduce every
real-site cross-process transition or validate a later installed mod build. The bounded redraw workaround and saved
optional page-filter choice remain intact; another full-matrix rerun is not
required for the short follow-up.

## Glassflow 3.74.20 and collector v6

Auditing the menu failure exposed an additional path beyond the already-fixed
Mica tint: Arc's `!important` fill on `.menupopup-arrowscrollbox` can leave the
actual painted surface transparent during reduced-transparency/contrast modes.
The outer `menupopup` is transparent even when its shadow content paints, so
v5's host-only computed fields could not identify the winning painted fill.
An external `::part(content)` override also loses to the internal important rule.

The existing shared accessibility policy now assigns native Menu/MenuText or
Canvas/CanvasText and applies them to the actual native content surface. Normal
appearance and Off remain unchanged; disabled/selected native colors remain
owned by Zen. The normal Mica tint yields to all three accessibility signals.
Only Glassflow's release metadata changes; no preference migration or new setting.

V6 waits for finite popup/item animations, records the shadow content and item
colors/opacity/selection, and scopes light/dark color schemes to generated
surfaces. It does not switch the installed theme. A bounded failure replaces a
misleading capture if animation or fixture scheme cannot settle. Endless
decorative animations are reported separately, not awaited forever.

V6 also scopes a user stylesheet to its generated data URLs, so a theme forcing
page backgrounds cannot silently flatten the opaque/transparent comparison. The
generated page reports only its requested labels and computed HTML/body
backgrounds through its title. Load readiness and capture completion verify
those values. The settled matrix now loads the requested document too. No actor,
profile script, external page content or new production polling is introduced.

The [automatic short follow-up](../tools/NATIVE-BLUR-PROBE.md) collects two
verified-background load sequences and 12 menu cases (88 crops), including native
selection styling. Run it with Glassflow 3.74.20 installed and return its ZIP/copied JSON for the remaining Windows pixel checks.
It also runs on older installations for diagnosis, with the same native
acrylic startup settings as the returned v5 run. This is a machine-data request;
analysis and fixes remain implementer-owned. The full 108-case runner remains available.

## V6 checks

- Repository gate with upstream Sine and PowerShell: 292 passed, zero failed,
  one optional native entry skipped; native checks run separately.
- Actual Zen 1.24 renders the four cyan/amber and opaque/transparent combinations
  with an opposing user stylesheet forcing dark page backgrounds. Direct content
  styles and the generated title metadata both report the requested backgrounds;
  rendered challenge pixels match exactly.
- The previous Glassflow 3.74.19 stylesheet fails the new native popup check:
  Arc leaves the painted content transparent in reduced-transparency mode.
- The corrected stylesheet passes 24 native configurations: both stylesheet
  orders, both simulated Mica matches, both fixture schemes and all three
  appearance modes. Off restores prior styling; enabled, disabled and selected
  colors keep their native behavior. Native popup pixels are not included by
  Linux headless screenshots, so these are actual Gecko style/state checks.
- The shipped short collector completes all 14 cases in Zen with a simulated
  Windows worker. Both document backgrounds are verified, both fixture palettes
  differ and every captured menu/item opacity is settled. Full Windows pixel
  confirmation remains the explicit data request above.
- The full 108-case collector also completes in native Zen with the simulated
  screen worker, creates its ZIP and restores preferences/selected tab/Library.
  Nested selected-tab return, independent Library copies and six existing
  accessibility appearance cases pass in the same serial run.
- Real Browser Console tests retain CSP, execute the local-file loader and check
  success/download/compile/precondition cleanup and clipboard reporting. The
  stale hard-coded v4 expectation now follows the tested source's probe version.
- The existing PowerShell 7.6.9 worker geometry, refusal, identity and journal
  checks pass; Win32 calls are substituted. Transport checks use real PowerShell
  processes and file handoff. Windows screen pixels remain the explicit request.
- Concurrent browser/gate runs hit pre-existing short Sine/Library test limits.
  The final gate runs without concurrent browsers; no test timeout was relaxed.
  The new popup test also replaced a fixed wait with finite-animation settling
  before comparing native selection colors.

## Earlier v4 capture and v5 repair

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

That requested v5 capture has now been returned and analyzed above. The remaining
targeted request is the v6 short follow-up, not another full v5 run.
