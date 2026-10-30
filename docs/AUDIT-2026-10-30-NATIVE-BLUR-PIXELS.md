# Native blur: completed Windows pixel comparison

The `native-blur-v3` capture completed all **32 cases / 64 PNGs** on Zen
**1.24b**, with no reported errors. The private capture was decoded and compared
locally; raw images, reports, device identifiers and user paths are not committed.
Glassflow was **3.74.16**. Native acrylic was enabled; the custom panel recipe
computed to `blur(15px) saturate(0.75) brightness(0.5) contrast(1)`.

## Results

The matrix covered left/right sidebar, opaque/transparent fixture browser
background, normal/reduced transparency, and four variants: no-blur reference,
installed output, page-filter disabled, and page-filter plus redraw nudge disabled.
"Native" here retains Glassflow's configured backdrop recipe; it is not stock
Zen styling. These are desktop GDI pixels, not CSS-only assertions.

| Comparison | Pixel result |
| --- | --- |
| Opaque page, normal transparency, either side | Installed, native-only and native-without-nudge crops are identical. |
| Transparent page, normal transparency, either side | Native-only crops are identical to the corresponding opaque-page native crops. The sharp reference stripe pattern is blurred without the extra page filter. |
| Extra page filter on transparent pages | Small differences remain: mean absolute RGB channel differences are 0.222/0.247/0.281 on the left and 0.236/0.261/0.293 on the right, on a 0–255 scale; maximum channel difference is 6. |
| Native-only versus native-without-nudge | Identical in all eight page/side/transparency combinations. |
| Reduced transparency | All 16 sidebar crops are the same opaque, uniform fill, with no stripe detail. |
| Outside control crop | Identical across all four variants in every combination. |

## Change: Glassflow 3.74.17

**Extra blur for see-through pages (compatibility)**, formerly **Blur see-through
pages too**, now defaults off. The same preference key and boolean type remain.
Existing saved On and Off choices remain unchanged. Profiles represented by this
capture can turn the existing switch off without changing native blur values.

Off now removes the fallback SVG, observers, event listeners and pending animation
frame instead of running its geometry checks and retaining its SVG. Enabling it
creates one owner; disabling it restores any previous page filter, and never
overwrites a filter another owner has since installed. The shared preference
observer handles switching; no second idle observer or polling loop was added.

The fallback is retained for other renderer/theme combinations. Current acrylic
preferences do not expose the renderer's startup latch, so a version/pref test
cannot safely infer whether native cross-slice blur is available. Enable native
Zen acrylic and restart before comparing it.

The redraw nudge remains. Captures wait 900ms after showing the sidebar; identical
settled output does not establish the absence of transient stale backdrops during
slides or tab switches. This change claims less fallback work while off, not
measured FPS, latency, GPU savings or smoother animation.

## Upstream correction

The earlier whole-suite audit described the removal of a software-renderer check
at the slice-creation call site. In the complete
[Zen 1.24 patch](https://github.com/zen-browser/desktop/blob/1.24b/src/external-patches/firefox/backdrop_filter_reads_web_content.patch),
`!frame_builder_config.is_software` moved to `SceneBuilder` before the flag is
passed into `TileCacheBuilder`. The restriction still applies. Acrylic also
remains an `AtStartup()` input when creating WebRender. Neither a newer version
nor a computed `backdrop-filter` proves that this native path rendered pixels.

## Validation and limits

- Repository gate with upstream Sine and PowerShell available: **266 passed,
  0 failed, 1 optional native entry skipped**. Native checks ran separately.
- Zen **1.24b / Firefox 159.0** full browser run passed: the three new lifecycle
  states, 26 sidebar hover/pixel checks, 72 icon paint cases and the existing
  window-control, download, media-range, overlay and Library checks. The
  unchanged implementation also passed the original fallback checks in a
  separate disposable profile. Both produced the same fallback stripe-detail
  values (approximately 0.94 with filtering versus 116.49 without).
- Initial full runs failed the transparent-selection assertion while the
  redraw attribute was still present. The fixture now waits for two animation-frame callbacks
  before evaluating scheduled updates instead of assuming a 100ms timer means
  they ran. Assertions were retained; this is test synchronization, not a claim
  about animation performance.

- Regression tests execute the production preference/lifecycle functions with
  absent, saved On and saved Off choices, repeated enabling, queued notifications,
  filter restoration and another owner's replacement filter.
- The native Zen runner covers saved choices across script re-injection, one SVG
  owner, full removal on Off, page visibility/geometry and the existing fallback
  pixel checks. Its headless screenshots verify SVG content filtering, not GPU
  backdrop rendering; the Windows capture supplies the latter evidence.
- This is one configured Windows setup, one generated fixture and one settled
  snapshot per case. It does not cover every website/theme, animated content,
  physical hover timing, native acrylic disabled at startup, or performance.
