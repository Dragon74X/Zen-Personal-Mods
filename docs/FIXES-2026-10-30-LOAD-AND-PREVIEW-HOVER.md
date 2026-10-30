# Page loading and preview hover ownership

> Follow-up: [completion audit and native rendering checks](FIXES-2026-10-30-COMPLETION-AUDIT.md)
> reconciles the older remaining-work entries below, including nested scrolling,
> accessibility rendering, Router placement and the Turbo benchmark.

## Glassflow 3.74.18

An already-open compact sidebar received no blur refresh when its selected page
finished loading. The old invalidation listened only to tab selection and sidebar
slide completion. In a real Zen 1.24 navigation fixture, the old implementation
produced **0 redraws** while the same selected tab stayed open and became
transparent; the replacement produced **1 redraw** with compatibility both Off
and On. The On case also acquired the page filter after loading.

One owner now handles selected top-level network completion, tab selection and
slide completion. It coalesces finite frame work, skips hidden/docked/blur-disabled
surfaces, and cancels pending work and listeners on cleanup. Background tabs,
subframes and non-network progress notifications cannot trigger its load path.
The optional page filter exposes refresh/cleanup directly; its duplicate
TabSelect/slide-end listeners and indirect dependency on the redraw attribute
were removed.

This fixes the missing load-completion trigger in the mod. It does not establish
that Windows WebRender paints every loading/transition frame correctly. The
existing small native-filter invalidation remains a documented bounded workaround.
The previous 32-case Windows capture covered settled pages, not this sequence.

## Mediaflow 2.8.10

Mouse clicks leave a button focused. The previous preview owner treated that
focus as continuing hover, retaining expanded geometry over the music bar and
affecting the next preview entry. Pointer exit now releases that geometry while
leaving keyboard focus intact. Keyboard interactions still freeze their targets;
an unfinished pointer press/drag keeps its bounds until release or cancellation.
Window capture handles a release outside the preview before other handlers can
consume the event. Media-bar hover only updates layout; it never owns preview
growth or a held rectangle.

Running the new exit check against the previous 2.8.9 implementation reproduces
the retained `zzmf-interacting` state after leaving a clicked control. The changed
implementation passes that same check without removing DOM focus.

**Pause itself does not shrink the preview.** The verified interaction is:
expanded preview → pause at the same size → pointer leaves for the media bar →
resting size → pointer re-enters the paused preview → normal hover growth.
Native title/progress disclosure can still move the card's resting anchor when
enabled; re-entering the preview holds that current anchor. Existing settings,
glyphs, actor commands, paused still image and keyboard focus are preserved.
Zenslop's alias manifest points to the same release.

## Checks

- Repository gate with upstream Sine and PowerShell: **268 passed, 0 failed,
  1 optional native entry skipped**; the native runners were executed separately.
- Zen 1.24b navigation/layout runner: 28 sidebar checks including both load cases;
  the full suite also passed 72 icon paint cases and existing control/media/Library
  regressions. Final sidebar checks rerun after removing the duplicate slide-end
  callback.
- Zen 1.24b media runner: 10 Arc bar-layout cases, 4 entry/exit cases, 4 click
  timings, 8 seeks, 6 original glyph paints, keyboard activation and source-tab
  navigation; **0 runtime errors**. Pause kept the 352px preview, bar exit restored
  176px, and paused re-entry restored 352px. Outside press-release cancelled both
  the click and the geometry hold. The existing diagnostic captured 6 presses,
  4 commands and 2 deliberate misses, then cleaned up and auto-copied.
- A moving-button test initially used a stale coordinate between protocol calls.
  Captured down/up targets showed that the press missed the button before any
  hold began. WebDriver now resolves the current element center in the click
  action; bounded failure diagnostics retain the actual targets and bounds.
- Runnable unit checks: `node --test tools/glassflow-page-blur.test.mjs tools/audit-regressions.test.mjs`.
- Existing full gate: `node --test tools/*.test.mjs`, with upstream Sine and the
  portable PowerShell runtime available locally.
- Native navigation/fallback/layout regression: `python3 tools/zen-smoke.py --zen /path/to/zen`.
- Native media/actor/WebDriver regression: `python3 tools/zen-mediaflow-controls-smoke.py --zen /path/to/zen --output /tmp/media-check`.
- These disposable-profile checks do not certify physical Windows input or GPU
  backdrop pixels. No personal captures, identifiers or device details are published.

## Remaining work

| Item | Status |
| --- | --- |
| Windows blur during page load, slide and tab switches | Load trigger fixed and runtime-tested. Presented-pixel confirmation and eventual removal of the renderer workaround remain open. |
| Overlay blur over webpage content | GPU pixel comparison remains open; the sidebar matrix does not cover overlays. |
| Native selected-tab indicator | Basic groups, both sides and Off passed. Independently scrolled nested folder bodies and Library copies remain untested. |
| Windows accessibility appearance | Shared tokens and selected surfaces tested. Full palette/menu/contrast rendering remains unverified. |
| Turbo tuning | Stock-versus-pack workload benchmarks remain undone. Request counts are not time saved; defaults and saved choices have not been changed. |
| Router policy decisions | Explicit-route handling of already-grouped tabs and majority-container inference remain deferred behavior choices, not changes included in this release. |
| Unattributed console exceptions | Bare `NS_ERROR_NOT_AVAILABLE` / `Object { message }` reports without a source/stack remain unassigned. The Groupflow SessionStore call-site failure was fixed separately. |

Already shipped: Library code-only SpaceRouting preload, native Live Folder
protection, native Paste & Search labels, Groupflow SessionStore scope, shared
accessibility fixes, icon layout/scale ownership, click bounce and YouTube
channel-folder consolidation. The older audit's status column now points to
those implementations instead of presenting completed items as next work.
