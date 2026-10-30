# Completion audit and native rendering checks

This reconciles earlier remaining-work notes with implementation and evidence.
Requested implementation and verification remain the implementer's work. A device
limitation is not permission to hand the implementation back to the user.

Follow-up: [returned v5 pixels and popup correction](NATIVE-BLUR-2026-10-30-CAPTURE-ANALYSIS.md)
show working generated-fixture loading/slide/overlay blur and expose a menu
defect fixed in Glassflow 3.74.20. The requested opaque/transparent backgrounds
painted alike; the short follow-up verifies their actual state and corrected menus. No other implementation is delegated.

## Missed work completed in this change

| Owner | Cause and resulting behavior |
| --- | --- |
| Groupflow 1.75.5 | Zen's selected-tab indicator scrolled the outer list while the selected tab remained clipped inside Groupflow's capped folder body. The existing body owner now cancels that body's pending glide/snap and reveals selection before Zen reads its coordinates. Zen retains the indicator, setting and outer scrolling. |
| Groupflow 1.75.5 | Saved label colors and collapsed dimming bypassed accessibility colors. Sidebar and Library headers now use opaque system backing; contrast mode uses system foreground and keeps keyboard focus visible. Normal saved appearance resumes when the signal clears. |
| Glassflow Library 1.4.4 | The actual native workspace-background child covered the supposedly opaque accessible card. Rendering exposed light text on a pale background despite the card's correct computed color. Accessibility now removes that decorative child as well as the pseudo layers and uses the system foreground for card controls. |
| Glassflow 3.74.19 | The Windows Mica popup tint could replace a high-contrast system palette with custom black/white. That tint now yields during chrome contrast/forced-color signals; normal and reduced-transparency behavior remain owned by their existing rules. Windows menu pixels require the capture below. |
| Tab Router 1.37.10 | An already-matching folder path returned early even with **Tabs already in a group** Off and an explicit Zen route naming another workspace. Off now honors that route. On retains the existing group contract; a missing destination with group creation Off leaves membership and workspace intact. No additional container inference policy was introduced. |
| Zen Turbo 1.13.6 | Zen 1.24's native session interval is 40000ms. Turbo forced 30000ms while describing fewer writes. The pack now raises only shorter intervals, releases its obsolete override after a native update, and preserves later manual edits and longer original user values. |

The selected-page blur completion trigger and paused-preview pointer ownership
were already implemented in [PR220's release](FIXES-2026-10-30-LOAD-AND-PREVIEW-HOVER.md).
Pause retains expanded geometry; leaving the preview releases it, including when
the pointer enters the media bar. They were not awaiting implementation by the user.

## Evidence

Repository gate with upstream Sine and PowerShell: **288 passed, 0 failed,
1 optional native entry skipped**; native runners were executed separately.
One earlier concurrent gate run exceeded the existing one-second limit on the
mocked folder-scroll test. The unchanged full gate passed on repeat (no cancelled
tests). This is a timing-sensitive test limit; its timeout was not raised and no
product change was made to hide it.

- The old nested-scroll implementation failed with selection outside a 120px
  body after a wheel scroll. The corrected owner passed on both sidebar sides.
  Actual native Library copies independently collapse/expand, select their real
  unloaded tabs, close the Library, and reveal selection without duplicating tabs.
- Six light/dark appearance states cover normal, reduced transparency and chrome
  contrast. Saved custom colors resume afterward. Actual Library card pixels
  matched Canvas exactly: `(255,255,255)` in the light fixture and `(28,27,34)` in
  the dark fixture. Header, nested label, card title and tab foreground checks pass.
  These are Linux rendered pixels, not Windows acrylic or OS high-contrast proof.
- The native indicator still respects its Off preference. Zen only offers its
  pill when the outer scrollbox is overflowing; no fake overflow, replacement
  indicator or polling was added for an inner-only overflow condition.
- A Library ResizeObserver warning was reproduced in stock Zen 1.24 with no mod
  scripts/styles. The runner records that exact warning separately and rejects
  other uncaught errors; it does not claim a warning-free native browser.
- The Router regression first failed against the prior production implementation.
  Its four grouped/create combinations pass in Node and with real native groups,
  workspace moves, preserved deeper manual subfolders and the native route matcher. Existing routing/session,
  artwork, Library-copy and shape checks pass with it.
- Automatic capture v4 completes all **102 real Zen chrome phases**, restores
  state, and creates its ZIP using a simulated screen backend. The shipped
  PowerShell transport separately passes readiness/trigger ordering, frame bounds,
  reader-held file handoff, and cancellation before/during sequences. Neither is
  a substitute for Windows screen pixels.
- Browser Console tests retain CSP, execute the local-file loader, auto-copy
  download/compile/precondition errors, remove temporary scripts, and verify the
  new console-origin collector against an actual native `nsIScriptError`.
  A native reinjection check releases the obsolete Turbo 30000ms override and
  exposes Zen's 40000ms default without a user preference.

Runnable checks: `node --test tools/*.test.mjs`,
`tools/native-blur-worker.test.ps1`, `tools/zen-smoke.py --native-integration`,
`tools/zen-smoke.py --probe-loader`, and `tools/zen-routing-smoke.py`.
Native commands require `--zen /path/to/zen`; they use disposable profiles.

## Turbo measurement

`tools/zen-turbo-benchmark.py --zen /path/to/zen` runs the actual pack owner in a
disposable profile. It alternates six stock/pack network pairs and three media
pairs, then observes native session-write notifications. No personal sites/history
or external service is used. Startup-history warming and graphics overrides are
disabled to isolate the packs. Fresh video URLs prevent decoder reuse between
samples; an earlier run without that isolation was rejected.

| Controlled workload | Stock | Packs enabled |
| --- | ---: | ---: |
| Median load: 48 local HTTP/1.1 images, 50ms server delay per response | 610.5ms | 500.5ms |
| Median seek event: generated 20.4MB WebM, four seeks per sample | 312.5ms | 352.5ms |
| Native session interval after correction | 40000ms | 40000ms |
| Write-complete notifications during each approximately 36s dirty-state window | 1 | 1 |

The network fixture benefits from the pack's different HTTP/1.1 scheduling and
connection limits. This does not establish WAN/DNS/TLS/HTTP2 savings. The larger
media cache avoided some repeat bytes but did not improve median seek latency in
this small sample. These are event timings, not presented-frame smoothness or
memory-pressure benchmarks. No broad pack/default change follows from them.
Native preferences were restored after the comparison. Startup preconnection
benefit on a real workload remains unmeasured; existing process/private-window
budget and partition tests verify behavior, not time saved.

## Historical handoff reconciliation

| Earlier item | Reconciled status |
| --- | --- |
| Native settings switches and Sine install/update recovery | Implemented; current native settings and updater suites exist. Not an outstanding user task. |
| Legacy YouTube/Nexus pictures, Nexus thumbnails/banners and refresh actions | Implemented and covered by native routing/restart checks. The old shelved-picture note is historical. Router file-backed storage already replaces the oversized preference cache path. |
| Image shape clipping, loaded/unloaded close entrance, centered icon scale and click bounce | Implemented. Earlier jitter notes predate the corrected engine and the user's smoothness confirmation. They are not requests to implement another animation engine. |
| Original window controls and PiP artwork | Preserved/restored in the existing implementation. Current code ownership and native regressions retain those exclusions. |
| Router majority-container inference | An unconfirmed behavior proposal, separate from the reproduced explicit-route contract bug fixed here. Its current policy remains unchanged. |
| Extra native shortcut registration | Guidance for future shortcuts, not a requested replacement shortcut feature left unimplemented. |
| Bare console exceptions | Still unattributed without an originating script/stack. The [automatic origin collector](../tools/CONSOLE-ORIGIN-PROBE.md) now captures those fields rather than guessing ownership from adjacent messages. Known SessionStore misuse was already fixed; native favicon warnings were separately identified. |
| Windows OS drag/drop, complete blocked-download states, screen-reader traversal and success-animation appearance | Earlier notes left these device-level checks unverified, not the corresponding feature implementations absent. Native APIs, eligibility, focus semantics and finite-animation checks do not prove physical Windows behavior. No claim of complete device validation is made here. |

## Explicit machine-data request

The full Windows v5 capture has been returned and analyzed. Run only the
[automatic short follow-up](../tools/NATIVE-BLUR-PROBE.md) with Glassflow 3.74.20
and return its ZIP plus copied JSON. It starts and advances by itself; the earlier
loading/sliding/overlay matrix is not requested again. Analysis and resulting
changes remain the implementer's work. No arbitrary page screenshots or uploads.

If the unattributed exceptions recur, run the separate
[60-second console-origin collector](../tools/CONSOLE-ORIGIN-PROBE.md) and return
its copied JSON. No start button or phase selection is required. A native error
that supplies no stack remains unknown; it is not automatically a mod defect.

No Windows machine is available on the implementation host. Physical OS drops,
screen-reader output and every Windows high-contrast theme are not certified by
the automated fixtures above. These are explicitly unverified evidence areas,
not an implementation checklist assigned to the user.
