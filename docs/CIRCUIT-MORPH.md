# Circuit · Morph — production integration

Implemented against `0291897db4038e61bfb9650a08ecb0644f4e3608`, which remained the current remote `main` during this work. No reset or changes to other working copies. The supplied Morph baseline is approved; its former proposal wording does not gate this implementation.

## Install this update

In Zen **Settings → Sine**, use the existing repository-install field with each applicable URL below. Wait for each install to finish. These folders retain their existing mod IDs; keep modules you do not use disabled. Existing Sine JavaScript authorization is required, as with the previous releases.

| Module | Version | Sine installation URL |
|---|---|---|
| Glassflow | 3.74.0 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/glassflow |
| Groupflow | 1.75.0 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/groupflow |
| Iconflow | 1.21.0 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/iconflow |
| Glassflow Library | 1.4.0 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/glassflow-library |
| Download Prompt | 1.4.4 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/download-prompt |
| Tab Router | 1.37.4 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/tab-router |
| Tab Unloader | 1.15.4 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/tab-unloader |
| Mediaflow | 2.8.0 | https://github.com/Dragon74X/Zen-Personal-Mods/tree/circuit-morph/mediaflow |

Quit **all** Zen windows and restart once, so cached Mediaflow actors are replaced. In Iconflow, select **Icon set → Circuit · Morph** if upgrading from a saved older set. New/unset installations select Morph automatically. Controls set to follow the set use Morph; explicit native/still/per-button choices and animation-off remain intact. Library's existing **Follow icon set** choice is honored. No comparison UI or global SVG/security preference change is installed.

The ZIP contains these complete mod folders and the normal `theme.json` manifests, plus this report and machine-readable coverage. Sine installs from the repository URLs, not by opening that ZIP. The ZIP is the matching offline payload; do not manually overwrite a running Sine staging directory. `main` remains the normal automatic-update source after the PR lands. Existing disabled/update-disabled modules stay subject to their existing choices.

## Implementation

- Iconflow loads the approved 75 drawings for 125 action IDs from `morph.json`, with 193 semantically checked selector bindings. All parts, paint order, pivots, landmarks and per-part choreography match the supplied asset definitions. Geometry tests also freeze the Library, Reload, Extensions and History source SVG hashes.
- Chrome SVG **siblings** occupy native image boxes. A native XUL image does not render an inline SVG child; the installed Zen probe established this before choosing the rendering path. Native images, command elements, tooltips, hit targets, focus and accessible names remain present. Only owned presentation is hidden and restored. Native image decoding/security preferences are unchanged.
- Persistent paths and analytic position/velocity channels replace competing icon transforms and sprite presentation on Morph-owned slots. Reload retains `+360/+360/−360`, Stop `−90`, New Tab `+90`; commands are only observed. Native commands execute immediately and menus dismiss independently of animation. Shared per-window scheduling stops for settled, hidden, removed, disabled and reduced-motion records.
- Glassflow owns pointer input for existing rims. Each nested surface receives local geometry and continuous direction retargeting. Entry and return use the existing motion-profile scale; return reads the latest effective state origin. Layout events, resize observation and external style changes handle relocation without idle polling. No extra rim, blur owner or browser-wide shape override is introduced.
- Source-owned IDs replace translated-label matching in Glassflow, Groupflow, Router, Unloader and Mediaflow menus. Existing applicability checks and command-time eligibility remain in their source owners. Library forwarding retains the actual Download and releases its popup association.

## Action coverage

[circuit-morph-coverage.json](circuit-morph-coverage.json) enumerates **every one of the 125 IDs**, its glyph, selectors, owner, settings, and native observation status. All 125 have executable target bindings; an exported glyph alone is not counted. The disposable Zen run observed **73 distinct action IDs** on **current native/mod elements**; this is not a claim that every conditional action was executed.

Reconciliation includes native and mod download rows, current Library buttons, source-owned generated menus, and both `context_undoCloseTab` and `toolbar-context-undoCloseTab`. Native commands still determine visibility and availability. Site favicons, workspace symbols, Router pictures and user-selected identity artwork are excluded.

Three obsolete supplied selectors are recorded separately: `#context-sharepage`, `#context_shareTabURL`, and `#zen-toolbar-context-compact-mode-enable` (the last is a localization key, not the current element ID). Current native share IDs and `#zen-context-menu-compact-mode-toggle` are bound instead. The create-new menu launcher uses the menu action, close-tab uses close-tab, and selection-source uses developer. Reader artwork now targets the actual native reader control. Bookmark launchers remain launchers.

## Ten state adapters

The supplied six-pair inventory omitted menu, compact, sidebar and fullscreen controls. The production manifest contains all ten control definitions and explicit action-to-control associations.

| Control | Authority and target | Observed verification |
|---|---|---|
| Play/pause | Native card's controller state; Mediaflow's own actor/source | Source-isolation regression; Mediaflow state delivery in Zen. Audible playback blocked in container. |
| Bookmark | Star state; Places lookup for the actual context tab/link | Real external insert/removal and persistent path in Zen; background-target regression. |
| Volume/mute | Mediaflow actor volume and source-tab mute; native card's own mute | External numeric delivery, mute/unmute and source-isolation regressions. Zen adapter receives 37%, 18%, mute and restoration. Native Zen card has **no numeric meter source**; it does not borrow Mediaflow's value or write a default. |
| Download pause/resume | Actual Download selected by native list or captured stack context | Native Download initial/start/failure state and persistent path. Successful resumable network transfer remains a desktop check. |
| Maximize/restore | Native window state | Real maximize/restore in Zen. |
| Video visibility | Mediaflow's source-owned visibility toggle | Adapter and owner wiring regression; actual playable-source interaction remains blocked with native media. |
| Menu open/closed | Actual popup/open state | Real application-menu open/close in Zen. |
| Compact mode | Zen manager's effective root state | Real manager state changes in Zen. |
| Sidebar | Firefox SidebarController; separately Zen expansion root state | Real Firefox sidebar show/hide; separate-authority regression. Zen expansion widget was unavailable in this toolbar configuration. |
| Fullscreen | Native window fullscreen state | Real fullscreen entry/exit in Zen. |

State changes are not inferred from clicks. Source messages, Places/download observers, native attributes and lifecycle events update the model. A failed command leaves the observed state intact. Unknown native media volume uses the unmuted drawing without asserting a numeric level; unmuting never writes a fabricated previous level.

## Owned edges

| Existing painter | Inputs updated |
|---|---|
| Tabs, pinned tabs and favorites/Essentials | Existing directional relief/shadow |
| Group/folder headers and connector rails | Existing rim direction and gradient masks |
| Workspace capsule and active workspace | Existing inset rim; identity icon untouched |
| Toolbar plates, sidebar and compact background | Existing directional inset rim |
| Window controls | Existing button rim; glyph-on-hover and glyph size retained |
| Library cards, floating Library and download stack | Existing card rim/ring |
| Download Prompt panel, filename and buttons | Existing border colors and inset highlight |
| Group gradient dialog | Existing border colors |
| Media preview and caption | Existing physical border, target-local coordinates |
| Zap bar | Existing border colors |

Context rows and native popup shells in this repository have native fills/borders, not an authored directional rim. They receive their action icons but no additional edge painter. Native OS popup acrylic and unrelated native dialogs remain under their native owners. Per-state gates, colors, opacity, width, reach, offsets, depth, shapes and blur settings remain authoritative. Pointer tracking requires Glassflow's edge-input runtime; standalone consumers retain their existing static rim when it is absent.

## Checks and limits

One regression entry point:

```sh
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs \
ICONFLOW_APPROVED_DIR=/path/to/extracted/iconflow-orbit-morph-set \
ZEN_BINARY=/path/to/zen \
ZEN_MORPH_OUTPUT=/tmp/zen-morph-checks \
node --test tools/*.test.mjs
```

Optional inputs enable upstream Sine gates, the supplied 29-group browser check, and native Zen checks. Without them, the corresponding checks are explicitly skipped. Native smoke uses an isolated disposable profile and ffmpeg/Pillow already used by the local test environment; these are **test tools**, not mod dependencies.

Observed full run: **235 tests passed, 0 failed, 0 skipped**, including all **29 supplied preview groups** and **46 native/lifecycle assertions**. The native run loaded the production script manifests and CSS through the Sine chrome mapping. It exercised command dispatch, interruptions, external bookmark changes, native windows, dynamic popup lifecycle, pointer entry/state-change/exit, zero settled animation frames, animation-off, reduced motion, native-set disable/re-enable, reinjection, new windows, teardown and restart preference persistence. Production artwork was inspected at 16/24/32/48 px. The supplied browser checker used Firefox 153.0; that result is preview evidence only.

Native runtime: **Zen 1.23.4b**, Gecko **158.0.1**, build **20261020090730**, headless Linux. Sine source: `fb0bd4ca6af888f10648e126947f7d1f82228433`; its engine manifest lists **2.3.4.1c**, bootloader **0.1.4**. The Sine engine/bootloader themselves were **not installed and exercised** in this test profile: their install/update behavior was covered by repository gates, while native loading used their supported chrome/manifest mechanism. This is not a completed end-user Sine upgrade certification.

The container required `MOZ_DISABLE_CONTENT_SANDBOX=1` for its disposable browser processes. No such environment change or preference is shipped or required by the mods. Audible media did not start; OS-native Tools-menu opening and forced-colors activation were unavailable. Dynamic menu creation was exercised through its source-owned popup lifecycle. No native forced-colors pass is claimed.

Remaining exact desktop step: install the eight versioned folders through an existing authorized Sine installation, restart all Zen windows, then run one audible foreground/background media source (play/pause, external volume, mute/unmute, hide/show), one resumable download (pause/resume, complete/cancel/fail), the Zen expansion widget where available, actual context/Tools menus, forced colors and a screen-reader/focus pass. Exercise folders, Library/media surfaces and popups while moving/resizing them under a stationary pointer. These conditional/platform checks and actual Sine upgrade execution remain unverified; they are not counted as passing production checks.
