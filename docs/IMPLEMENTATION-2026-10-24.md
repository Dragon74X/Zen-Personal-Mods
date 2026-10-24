# Approved motion and reliability release — 24 October 2026

Baseline: main `173182d`, Zen 1.23.4b (Linux), Sine
`fb0bd4ca6af888f10648e126947f7d1f82228433`. Work is isolated from the other dirty
checkout. Earlier local icon and Mediaflow corrections are included in this
release, not assumed to be published.

## Requirement → owner → delivered behaviour

| Requirement | Owner | Behaviour / evidence |
| --- | --- | --- |
| Five tab-icon shapes visibly clip | Groupflow's existing enabled image geometry rule | Adds only `overflow: clip !important` alongside radius and corner shape. Arc's exact competing overflow rule is reproduced. 240 pixel/geometry cases cover PNG/WebP, opaque/transparent, 20px native/Router/manual icons and Library copies, before/after/disabled; sibling overlays keep their geometry. Default and size remain unchanged. |
| Smooth existing states; crisp default | Glassflow CSS and `tabMotion()` | Five easing profiles, four subtle light distributions, continuously interpolated existing paint, close glyph and label spacing. Title alone moves +4px, rebounds −1px and returns. Native selection is immediate. Native pixels distinguish before/mid/after hover, four lights and five relief styles; rapid retarget and live reduced motion pass. |
| Calculated edges and consistent local geometry | Glassflow's owning state paint; Groupflow header rim | Five optional CSS relief surfaces, using existing colour/width/direction settings. Removes competing appended rim block. Shared shape has separate tab/folder radii; saved explicit choices retain their meaning; Follow Zen Auto does not compensate twice. Essentials derive inner radius from outer radius. |
| Restored standalone group features | Groupflow's standalone controller | Gradient editor, favicon colour sampling, leaf group/folder conversion, and Library menus targeting live originals. Native save/cancel, colour resampling, conversion round-trip, preserved colour/selection and Library target resolution pass. Nested, split and live-folder conversion is intentionally unavailable. |
| Header arrows excluded; scrolling works | Groupflow `pageFolder(box, dir)` | Removes arrows and their setting/adapter. Existing context-menu scroll actions retain the single implementation. |
| Stable Mediaflow controls and attempted-click evidence | Mediaflow preview geometry and controls probe | Captures current geometry while pointer/focus is on controls; no top-rise compensation. Native play/pause, eight seeks across four hover timings, keyboard focus/release and navigation pass. Probe records six presses, four commands and two misses, cleans up and copies automatically. |
| Large Router preference warnings | `router-cache.sys.mjs` and Router persistence | Shared native JSONFile store; durable migration before clearing legacy data, coalesced writes, container keys and bounds retained. Native migration/save passes; failure/concurrent-write cases pass in Node. |
| Failed-update recovery | Ten identical packaged Sine guards, one runtime owner | Explicit backup/commit/restore phases replace file-size inference. Validate files/preferences before registry commit; merge concurrent registry edits and preserve user install flags. Failure tests execute unmodified upstream Sine with a filesystem fixture, including failed restoration retaining its complete backup and blocking destructive retry. |
| Feature lifetime vs window lifetime | Shared Sine guard, Glassflow, Unloader, Turbo | Window close/update retains installed feature overrides; disable/removal restores still-owned values. Legacy Zenslop identity receives the same settings renderer. Node lifecycle/registry checks pass. |
| Bounded background work | Iconflow, Peekflow, Unloader, Mediaflow | Retired Iconflow cannot resume load/fetch work; Peekflow's show gate rejects queued captures and pending/discarded tabs; Unloader's ten-second deferral has its own deadline; Mediaflow has live reduced motion, non-poisoning missing-host startup and owned native-button restoration. |
| Transparent-page corners | Glassflow panel mask | Mask follows computed corner geometry and preserves pre-existing inline filters. Bounded two-frame compositor refresh remains. Pure mask geometry and native strip pixels/enable/disable checks pass; desktop compositor appearance is not claimed. |

## Checks actually run

- `SINE_MANAGER_SOURCE=.../Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs`:
  **227 passed, zero failed/skipped**, including unmodified upstream Sine flows.
- `tools/zen-tab-icon-shape-smoke.py`: **240 cases**, rendered corner pixels and
  final computed overflow, exact Arc rule, disabled release and overlay geometry.
- `tools/zen-state-motion-smoke.py`: five motion profiles, fixed background/icon
  and close target, repeated selection, live reduced motion, actual hover/light/
  relief pixels, native group actions and durable Router cache migration. Computed
  checks also cover all four state rim directions/widths/master gates and Essential
  inner/outer geometry; those assertions alone are not visual proof.
- `tools/zen-mediaflow-controls-smoke.py`: four entry timings, eight seeks,
  play/pause, focus hold/release, keyboard, navigation and auto-copy missed-click probe.
- `tools/zen-settings-smoke.py`: **96 native assertions**, 532 controls including
  181 booleans, two windows, keyboard/help/accessibility, light/dark/forced colours,
  zoom/narrow layout, rebuild and restart.
- `tools/zen-routing-smoke.py`: **two successful launches**, 240 header/rim geometry
  comparisons per launch, nested state, icons, saved colours/gradients, routing,
  manual choices, container isolation and restart restoration.
- `tools/zen-smoke.py --actions`: native action/target/privacy/default checks pass;
  source selection makes no playback commands and search artwork makes no requests.

- `tools/zen-smoke.py`: native transparent-page blur pixels and ten state gates,
  filter ownership, overlay toggles, icon paints, native media range and cleanup.
- `tools/zen-smoke.py --library-hover`: **32 pointer, 15 history and 12 backing
  checks** pass; the harness explicitly reports `compositorVerified=false`.

All browser runs use disposable profiles. No installed Arc files or user browser
profile were changed. New versions and UTC timestamps apply only to changed mod
packages, plus the matching legacy Zenslop forwarding manifest.

## Limits and installation

Fully quit and reopen Zen once after updating. Gecko/Sine caches the shared
background guard for the session; the new update recovery/lifecycle guard becomes
active on restart. Existing settings are preserved; calculated relief is opt-in,
and Crisp motion is the new default.

These runs do not certify the user's Windows profile, fractional scaling, GPU
backdrop compositor, every site-specific media player, or migration from a live
installed ATG version. Calculated edges are directional surface lighting, not
verified optical backdrop refraction. The existing bounded compositor refresh
remains because its underlying platform issue was not proven resolved. Browser
WebRequestUpload/Conduits console exceptions were not attributed to these mods
or suppressed. No measured performance speedup is claimed.
