# Zen mods implementation — 23 October 2026

Base: `f41778cae818eec3f6f326a943c23e264630ff64`. Changes reduce repeated work and add scoped controls through existing native surfaces. No new dependency, polling service, search index, or settings application was added.

The base already contains the legacy YouTube/Nexus picture recovery, tab corner options, and X-only close animation fixes. This release retains and retests those paths. Display-only folder picture metadata remains separate from Router ownership; recovery does not rename/reparent folders or relocate tabs. Member identity and metadata establish the subject, rather than folder-name equality. Explicit icons take priority.

## Requirements 1–25

| # | Implemented behavior | Verification |
|---|---|---|
| 1 | Cached pictures paint on readiness; non-resetting coalescing prevents starvation. Bounded requests and verified metadata/aliases share process ownership with per-consumer cancellation and partition checks. Affected consumers and cache writes coalesce. | Node lookup/cache/waiter/partition tests; native cached pictures and restart. |
| 2 | Selection reuses membership counts; Peekflow shares captures for a document revision and reuses native thumbnails. Favorites/Essentials/tab hover uses Zen's native warming. Optional startup work yields to busy foreground tabs. Unloader filters age before sorting. | Node count/capture/lifecycle checks; native selection, split view, routing, POST, redirects, external links and restoration. |
| 3 | Why here?, Preview sorting, Keep here and Resume routing use the actual target and existing resolver. Tab locks use native custom values; folder locks use Groupflow session data. Native routing constraints still apply. | Node resolution; native background target, stale target, lock persistence. |
| 4 | Folder status counts real descendants and reports loaded/total/playing. Scoped unload uses existing protections, final checks and the global loaded floor, even when automatic unloading is off. | Node eligibility/floor/session checks; native manual unload with automatic off. |
| 5 | Current verified folder/tab pictures decorate native URL-bar results through existing identity/render hooks; explicit icons win. | Native provider, query and row rendering; zero picture requests during queries. |
| 6 | Tools offers one Save/Restore/Copy appearance snapshot. A typed whitelist excludes functional/private state; restore clears overrides that were originally absent. Invalid snapshots cannot partially apply. | Node whole-snapshot validation; native save/restore/invalid menu checks. |
| 7 | Tools offers Copy Zen Mods Report using the shared collector from `tools/check.js`. Immediate collection is read-only; optional timed media diagnostics remain separate. | Node privacy checks; native version/settings collection, sentinel exclusion and no functional mutations. |
| 8 | Supported video targets offer Show this video in sidebar and Automatic. Actor identity and target are rechecked; ended/replaced sources remove stale actions. One pipeline remains active; choosing a source reveals a hidden preview. | Node actor/preemption/lifecycle; native background/unrelated/stopped-source menus and zero playback commands. |
| 9 | Added history rows delegate to native download handlers with execution-time checks. Collision prompts show known existing size/mtime and incoming size. | Native history order/privacy, retry/context actions, changed-state rejection and missing-file drag rejection; native blocked-confirmation delegation unit checks. Actual OS drop remains a device check. |
| 10 | Confirmed copy/bookmark/download success triggers one finite glyph pulse; independent still settings, animation off and reduced motion are respected. | Native event sources inspected; Node finite/dedup/motion checks; native close-X-only checks. Full on-device success choreography remains unverified. |
| 11 | Last-used unloaded visibility defaults on for unset/new configurations. Explicit false and indistinguishable historically seeded false values remain untouched. | Node defaults and nested native collapse/restoration across three launches. |
| 12 | Startup history warmup claims one process/session budget, default 6, maximum 20. Private windows do not query normal history or claim the budget. | Node bounded query/partition/cancellation; native private/second-window/reinjection budget checks using zero-request fixtures. |
| 13 | One PR workflow runs the existing Node suite. Changed installable mods receive version/timestamp updates; runtime versions stay synchronized. | Full Node suite including actual upstream Sine update tests; native disposable-profile suites; release/settings tests. |
| 14 | Single-box backing uses the actual open attribute, not sibling badge progress. One continuous backing covers gaps without double filtering. Footer elevation and Mediaflow yielding use the actual wrapper closing state. | Native backing/row filters/z-order at 1 and 8 rows with session/history combinations; 32 trusted pointer cases. Actual compositor-visible blur remains unverified. |
| 15 | Both Groupflow rim branches inherit effective radius/corner shape with `!important`, matching fill geometry without changing appearance settings. | 720 native geometry comparisons across shapes, states, nesting and compact/docked modes at DPR 1. |
| 16 | Metadata writes depend on changed fields. Ordinary updates avoid closed-history pruning and unchanged-map serialization. Removal/history transitions prune conservatively; unavailable/malformed history preserves data. | Node operation counts; native parent/descendant undo and restart. |
| 17 | Reordering skips already-correct nodes while retaining the native move path and mixed siblings. | Node: 0 moves when sorted; 1 move for A B C → A C B; mixed tab/group layout retained. No general minimum-move claim. |
| 18 | Expanded-card sizing observers exist only while needed. Delayed remeasurement coalesces and is canceled on retirement. | Node: zero disabled subscriptions and zero stale callback writes; native media layout smoke. |
| 19 | Turbo measurement and retained debug logging default off. Diagnostic listeners/data exist only during opt-in; disabling releases them. Functional warmup deduplication remains separate. | Node listener/counter/lifecycle checks; native effective defaults. |
| 20 | Turbo's typed native default branch initializes before startup consumers. User values retain precedence; resetting an override reveals its default. Defaults survive window retirement. | Node boolean/integer/string coverage; native second-window, reinjection and reset. No claim of eliminating per-window JSON loading. |
| 21 | Still-on-hover hides during always-expanded media layout; new-tab press/press-spin hide with animation disabled. Stored values remain. | Existing settings condition/page-first suite. |
| 22 | Three Glassflow opacity descriptions accurately say background opacity; Mediaflow frame-rate text makes no unsupported CPU ratio claim. | Settings diff and suite; choices/defaults retained. |
| 23 | Folder scrolling exposes eligible menu directions, respects reduced motion, and removes unavailable controls. Picker names/state and media labels/focus use current state. | Node lifecycle/semantics; native seek keyboard and close motion. Full screen-reader/focus traversal remains a device check. |
| 24 | Refresh automatic picture is limited to an eligible verified subject, allowed context and enabled feature. Manual/private/backoff/in-flight targets are excluded. Failed refresh retains the working picture. | Node eligibility/partition/backoff and old-picture retention; operation count is separate from HTTP count. |
| 25 | Tools exposes generation, validation and native inspect/edit/apply/copy. Shared grammar preserves first match, domain lists and parent/child destinations. Invalid edits leave stored rules intact. | Node syntax/line-entry errors; native Tools commands and Sine-shaped settings input rejection/acceptance. |

All item actions capture the actual target, evaluate cheap eligibility before display, and recheck before execution. No selected-object fallback is used for stale targets. Existing source, preference, popup and tab events remove newly ineligible actions; focus moves only when the removed action owned it. Global report/snapshot/rule commands remain in Tools.

## Checks and measured work

Run from the repository root:

```sh
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs
python tools/zen-routing-smoke.py --zen /path/to/zen
python tools/zen-smoke.py --actions --zen /path/to/zen
python tools/zen-smoke.py --library-hover --zen /path/to/zen
python tools/zen-smoke.py --zen /path/to/zen
```

Node: **197 passing, zero failures/skips**, including current upstream Sine. Native runtime: **Zen 1.23.4b / Firefox 158.0.1**, Linux headless, DPR 1. Three routing launches cover live update, restart, hierarchy, ownership, custom icons, tab placement, native indicators and Library copies. They include **720 geometry comparisons**. Library checks cover **32 trusted-pointer cases, 15 history/privacy checks and 12 backing checks**.

The execution host disallows Firefox's nested content sandbox user-namespace setup (`uid_map: EPERM`). Disposable test processes used `MOZ_DISABLE_CONTENT_SANDBOX=1`; no shipped code or browser preference changes sandbox protections.

| Deterministic workload | Observed work after change |
|---|---:|
| Selection-only Groupflow updates | 0 membership reads |
| Unchanged group metadata update | 0 serializations, 0 closed-history reads, 0 writes |
| Five coalesced renames | 1 serialization, 1 write |
| Already sorted groups | 0 moves |
| A B C → A C B | 1 move |
| Concurrent Peekflow capture, same document revision | 1 capture |
| Media expanded sizing disabled | 0 sizing observer subscriptions |
| Retired Media sizing callback | 0 writes |
| Turbo diagnostics off | 0 diagnostic navigation listeners or retained diagnostic aggregation |
| Native search picture decoration | 0 picture HTTP requests |
| Startup budget: normal/second window/reinjection | 1 claim total; private window 0 |

These are operation counts, not measured CPU, GPU, load-time, server-latency or network-saving percentages.

## Release versions

Download Prompt **1.4.0**; Glassflow **3.71.0**; Glassflow Library **1.3.0**; Groupflow **1.72.0**; Iconflow **1.20.0**; Mediaflow **2.7.0**; Peekflow **1.3.0**; Tab Router **1.36.0**; Tab Unloader **1.15.0**; Zen Turbo **1.13.0**. Each changed mod has a later UTC `updatedAt`. The legacy Zenslop manifest remains byte-identical to Mediaflow's forwarding manifest. Bundled Sine guard files are unchanged.

## Verification limits

No graphical compositor is available. Computed backdrop values, opacity and z-order checks establish the corrected structure, but do **not** prove live media blur. Existing Marionette screenshot checks test SVG content filtering, not compositor backdrop output. Blur-off/on over a stable high-contrast underlay and live native media remains an on-device check.

Windows/GPU/fractional scaling, full screen-reader/focus traversal, OS drag/drop, and all blocked-download states remain device checks. Confirmed native success hooks were source-verified and their motion logic tested; complete copy/bookmark/download success animation appearance was not checked on-device.
