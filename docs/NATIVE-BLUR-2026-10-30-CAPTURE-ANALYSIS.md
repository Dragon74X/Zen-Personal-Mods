# Returned Windows pixels and popup accessibility

## Final Windows pixel check: Glassflow 3.74.22

**Confirmed on Zen 1.24b:** all eight reduced-transparency and forced-colors
menus painted the system background and text colors. All four normal menus kept
their glass appearance. Both generated pages refreshed the blur with the sidebar
already open. The archive passed its integrity check; all 88 PNGs decoded and
its report matched the separate JSON. The 14 cases completed without errors.

| Captured menu state | Result in the desktop pixels |
| --- | --- |
| Reduced transparency and contrast (8 cases) | All 2,880 sampled background pixels matched the system swatch exactly. Light and forced-color menus painted white; dark reduced-transparency menus painted RGB (28, 27, 34). The first enabled label contained pixels matching the system text color in every case. |
| Normal glass (4 cases) | None of the 1,440 background samples equaled the opaque swatch. Both light and dark menus remained tinted; their computed fill was 50%. |
| Ordinary, selected and disabled rows | In all six ordinary/selected pairs the second row gained a visible highlight; the disabled label remained visually distinct. Selection was set by the fixture, so this does not test physical keyboard input. |

Method: in each menu PNG compare the text-free 20 × 18 px rectangle starting
at (12, 12) to the RGB pixel 10 px in from the lower-right corner of its paired
system swatch. The rectangle avoids text, borders and the selected row. These
are comparisons of presented RGB values; the screenshot's alpha channel is
not a measurement of CSS opacity.

| Load with the sidebar open | Result in the 16 sidebar/control pairs |
| --- | --- |
| Transparent → opaque | The first sidebar sample was still cyan at +48 ms. The separately sampled outside band was already amber at +61 ms. The sidebar was blurred amber at +128 ms and stayed identical through the remaining samples. |
| Opaque → transparent | The blurred band changed to amber at +71 ms. Both regions briefly showed a darker background; the sidebar reached its final appearance at +134 ms and stayed there. |

The page-strip filter was off. Final mean horizontal luma differences
(0–255 scale) were **0.158 vs 41.407** for the opaque sidebar vs outside control,
and **0.132 vs 34.587** for the transparent pair. Fine stripes stayed visible
outside the sidebar and blurred behind it. Median sidebar sampling interval
was 62 ms; these are capture times, not exact latency or animation frame rates.

This closes the requested Windows pixel check. No further capture or production
change is indicated by these fixtures. They do not cover every site transition
or OS accessibility theme. Raw screenshots, reports and local paths stay private.

## Earlier v6 follow-up on Glassflow 3.74.20 and correction in 3.74.21

The short run completed **14 cases, 88 PNG crops, zero errors** on Glassflow
3.74.20. Raw reports, account paths and screenshots remain private.

| Evidence | Finding |
| --- | --- |
| Two open-sidebar loads | Actual HTML/body backgrounds change between transparent and white. Both the sidebar and outside control change from cyan to amber without reopening the sidebar, with the page-strip filter disabled. |
| Opaque destination | The first amber sidebar sample is 112ms after the load trigger; subsequent samples are identical. Final horizontal luma difference is 0.158 behind the sidebar versus 41.407 in the outside control, on the 0–255 scale. |
| Transparent destination | Amber appears after 73ms. One intermediate sample has a darker background in both the sidebar and outside control; the final appearance is present after 136ms and remains identical thereafter. Final luma difference is 0.132 behind the sidebar versus 34.587 outside. The blurred band is present in that intermediate sample too. |
| Twelve menus | Light/dark palettes differ correctly; entrance animations have settled, disabled text is distinct, and the selected item has a native highlight. Reduced-transparency and contrast menu fills still have alpha 0.6, while their Canvas control is opaque. |

There are no capture identity gaps. Median sidebar sample spacing is 62ms; these
samples establish refreshed blur in the two generated loads, not frame pacing or
the absence of every intermediate paint. They do not cover every cross-process
site transition. The finite redraw owner and saved optional page-filter choice
remain intact. The earlier loading/slide/overlay matrix is not requested again.

The remaining menu defect comes from the system color itself:
[Firefox 159 Windows LookAndFeel](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_159_0_RELEASE/widget/windows/nsLookAndFeel.cpp)
returns Menu with alpha **153/255** when Mica popups use non-native menu colors.
That is the exact 0.6 captured on Windows. An opaque host and a 100% custom opacity
variable cannot make that translucent color opaque. The prior Linux test compared
the fill with Menu, which accepted the wrong contract and missed this platform
difference.

Glassflow 3.74.21 uses the opaque **Canvas/CanvasText** pair for both menu and
arrow-panel accessibility surfaces in the existing policy. This consolidates the
two palette declarations; it adds no override block, setting or runtime work.
Normal glass, native disabled/selection styling and Off release stay intact.

The native regression now supplies the real 60% system Menu input through
Gecko's documented-in-source `ui.menu` / `ui.menu.dark` color preferences in a
disposable profile. It requires opaque painted content and matching system text,
independently of the Menu token. The previous 3.74.20 stylesheet fails with the
same `rgba(255, 255, 255, 0.6)` seen in the capture.

Checks for 3.74.21:

- Actual Zen 1.24 passes 24 popup configurations: two Arc stylesheet orders,
  opaque/translucent native Menu inputs, light/dark schemes and normal/reduced/
  contrast signals. Off restores its prior appearance, and native disabled/
  selected colors remain distinct and unchanged by the correction.
- The unchanged 14-case collector completes in native Zen with a simulated
  Windows worker. Its accessible menu fills now match the opaque Canvas control;
  foregrounds match CanvasText. Background verification and cleanup still pass.
- The full repository gate with upstream Sine and PowerShell passes **292 tests,
  zero failures/cancellations, one optional native entry skipped**. The native
  checks above ran separately. The final gate uses `--test-concurrency=1`.
- PowerShell 7.6.9 worker checks pass: five coordinate cases, nine refusals,
  error journaling, transient identity recovery, owned menus and cancellation.
  Win32 calls are substituted; this is not a Windows pixel test.
- Analyzer self-checks and `git diff --check` pass. An initial browser startup
  timed out, and the initial concurrent Node run cancelled three existing
  one-second lifecycle checks. The browser retry and serial gate passed without
  changing any timeout or product behavior to accommodate the test host.

The [automatic short capture](../tools/NATIVE-BLUR-PROBE.md) subsequently
verified the correction on Windows with Glassflow 3.74.22, as recorded above.

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

The v6 [automatic short follow-up](../tools/NATIVE-BLUR-PROBE.md) collects two
verified-background load sequences and 12 menu cases (88 crops), including native
selection styling. That 3.74.20 capture has now been returned and analyzed above.
It also runs on older installations for diagnosis, with the same native
acrylic startup settings as the returned v5 run. The full 108-case runner remains available.

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
  differ and every captured menu/item opacity is settled. The returned Windows
  results and verification of the system-color correction are above.
- The full 108-case collector also completes in native Zen with the simulated
  screen worker, creates its ZIP and restores preferences/selected tab/Library.
  Nested selected-tab return, independent Library copies and six existing
  accessibility appearance cases pass in the same serial run.
- Real Browser Console tests retain CSP, execute the local-file loader and check
  success/download/compile/precondition cleanup and clipboard reporting. The
  stale hard-coded v4 expectation now follows the tested source's probe version.
- The existing PowerShell 7.6.9 worker geometry, refusal, identity and journal
  checks pass; Win32 calls are substituted. Transport checks use real PowerShell
  processes and file handoff. The separate Windows capture above supplied screen pixels.
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

This collector repair left the redraw workaround and saved optional page-filter
choice intact. The subsequent v5/v6 captures above supplied the missing load,
overlay and menu evidence.
