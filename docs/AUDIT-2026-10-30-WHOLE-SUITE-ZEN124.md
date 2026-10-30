# Whole-suite review against Zen 1.24

> Follow-up: [completion audit and native rendering checks](FIXES-2026-10-30-COMPLETION-AUDIT.md)
> reconciles the older remaining-work entries below, including nested scrolling,
> accessibility rendering, Router placement and the Turbo benchmark.

Reviewed on 30 October 2026. Latest published release: **1.24b**, commit
`f75390aa2b797ddc3524ff9ed52ceb32a839f9fa`. Development head inspected:
`46eb9b9ac6de8195f1842add3e2381977f66f703`, three commits ahead. This covers all
ten distinct mods; Zenslop is Mediaflow's manifest alias.

This is a source and compatibility review, not a performance benchmark. Items
marked candidates are not reproduced user-profile bugs and were not silently
enabled, removed or backported.

## Review status

| Priority | Finding at review | Current status or next check |
| --- | --- | --- |
| 1 | Glassflow still filters the page underneath a transparent compact sidebar and keeps a backdrop redraw nudge. Zen already has cross-slice backdrop support, enabled from its acrylic preferences at renderer startup. **Correction:** in 1.24 the `!frame_builder_config.is_software` restriction moved from slice creation to the caller; it was not removed. | [Completed Windows pixel comparison](AUDIT-2026-10-30-NATIVE-BLUR-PIXELS.md): native blur covers the tested settled cases. Glassflow 3.74.17 made the existing fallback opt-in. [Glassflow 3.74.18](FIXES-2026-10-30-LOAD-AND-PREVIEW-HOVER.md) adds the missing selected-page load-completion refresh through the same invalidation owner. Windows loading/transition pixels remain unverified; no performance savings measured. |
| 2 | Glassflow Library's optional **Code only** preload has a fixed five-section list and omits the new `SpaceRouting` module. Default **Built** mode calls `ZenLibrary.getInstance()` and already includes it. | **Completed in Glassflow Library 1.4.3:** code-only warm includes SpaceRouting; native runtime verifies no Library construction. [Implementation and checks](FIXES-2026-10-30-NATIVE-INTEGRATION.md). |
| 2 | Zen now provides the selected-tab-out-of-view indicator. Groupflow also manages visibility, nested scrolling and retained rows in collapsed folders. There is no dedicated combined regression for that indicator. | **Partly verified:** open/collapsed groups, left/right sidebar and native Off passed. Independently scrolled nested folder bodies and Library copies still need coverage. Keep the native indicator as owner. [Checks](FIXES-2026-10-30-NATIVE-INTEGRATION.md). |
| 2 | Router excludes native folders as destinations and normally skips pinned tabs, but `skip()` has no explicit `isLiveFolder` / `zen-live-folder-item-id` source exclusion. | **Completed in Tab Router 1.37.9:** shared Live Folder ownership checks protect routing, placement and artwork, including explicit refresh. Native routing/session checks passed. [Implementation](FIXES-2026-10-30-NATIVE-INTEGRATION.md). |
| 3 | Turbo still changes connection limits, pacing, caches, session-save timing and media cache size. Its counters measure accepted requests and navigation matches, not time saved. Native tab warming has already replaced the duplicate custom hover path. | Benchmark the remaining packs against stock 1.24 before retaining default-on tuning or changing defaults. Preserve existing user choices. Graphics overrides are already off by default. Windows CSIR PGO and upstream media fixes are browser-level benefits, not reasons to force more graphics preferences. |
| 3 | Zen moved shortcuts to Firefox's `about:keyboard`; its module now migrates old bindings to native `<key>` commands. Our modules do not depend on the removed keyboard-shortcut manager. | Use native commands/keys if adding shortcuts for Sort, Unload or preview actions. No replacement shortcut editor or global keydown dispatcher is needed. Native registration/display behavior for additional mod commands still needs checking. |
| 3 | Ctrl/Cmd-hover on New Tab now offers native **Paste & Search**, including a clipboard sublabel. Iconflow's optional hide-label rule still hides the primary label unconditionally. | **Completed in Iconflow 1.21.11:** the action label is visible during native Paste & Search; clipboard and commands stay native. Runtime synthetic-input check passed. [Implementation](FIXES-2026-10-30-NATIVE-INTEGRATION.md). |
| 3 | Upstream fixed high-contrast menus and reduced-motion panel behavior. Our Boost surface has explicit accessibility guards, but the broader glass surfaces do not have an equivalent complete runtime matrix. | **Partly verified:** shared/sidebar blur, Library and media backplates now honour accessibility signals; native runtime covers tokens and selected surfaces. Complete Windows theme/menu/contrast rendering remains open. [Implementation](FIXES-2026-10-30-NATIVE-INTEGRATION.md). |

## Already using native behavior

| Mod | Current integration and disposition |
| --- | --- |
| Glassflow | Native acrylic for normal surfaces; independent title `translate` lets Zen's sublabel `transform` remain live. Keep the verified image layout alignment and single CSS scale owner. Review the exceptional transparent-page filter separately. |
| Groupflow | Native tab groups/folders, session state and relayout remain in use. Additional collapse/visibility and bounded folder scrolling are mod behavior; native folder animations alone do not replace them. Preserve native split-view and Library-copy handling. |
| Tab Router | Delegates native URL/workspace/container routing through `gZenSpaceRoutingManager`. The new Library routing editor already edits that same native source. Keep custom folder/creator organization separate from native workspace decisions. |
| Mediaflow / Zenslop | Uses native media cards plus an actor for inline video preview/control. Native PiP is a separate window, so it is not a drop-in replacement for the inline preview. Keep original controls and the recently corrected single preview interaction state. |
| Iconflow | Uses existing icon slots; window controls and Mediaflow artwork remain excluded. The new upstream native sprites do not replace the optional Morph artwork. Avoid attaching another painter to their hosts. |
| Glassflow Library | Calls the native Library constructor, commands, download handlers and state. Native section hiding/customization and routing already work through that integration. Floating presentation remains custom because the native progress setter moves the page and sidebar. |
| Peekflow | Reuses native hover-preview machinery and available thumbnails. Its retained last view for unloaded tabs is additional behavior; native warming should not be replaced by loading tabs on hover. |
| Tab Unloader | Uses `prepareDiscardBrowser()` and the native discard gate, then rechecks protections. A timed idle policy still adds behavior beyond native memory-pressure unloading. Do not remove the flush, form-data guard or media/split-view exclusions. |
| Download Prompt | Delegates Keep both and forced file pickers to Firefox. Its collision choice still adds behavior; the 1.24 upload-folder fix does not replace this download hook. Real destination writes remain a separate integration test from dialog previews. |
| Zen Turbo | Native tab/link warming is already reused. Remaining packs and startup history preconnections need measured benefit, not another implementation of browser warming. |

## Compatibility findings during this pass

- The native routing fixture assumed that built-in containers 1 and 2 exist.
  Zen 1.24 can omit default identities. That made its container-color update
  fail before routing checks. The disposable test profile now explicitly
  enables default identities; user profiles and mod behavior are unchanged.
- The click regression now covers workspace, loaded Favorite and unloaded
  Favorite icons, repeated input, focused keyboard input, cancellation and
  live motion preferences. WebDriver input and computed geometry are not
  Windows physical input or presented-pixel measurements.
- YouTube identity tests cover handle versus `/channel/ID` metadata, both
  arrival orders, container isolation and preservation of manual organization.
  The native routing runner also exercises merging real duplicate groups.
- One full Morph run hit the existing probe frame-count threshold after a
  462ms diagnostic setup. The report had no probe errors; workspace and Favorite
  phases collected 55 and 49 intervals. The unchanged assertion passed on a
  repeat. This is recorded as timing sensitivity, not evidence of user smoothness.

## Development changes, not released fixes

The three commits after 1.24 are Settings layout alignment/wrapping and a
GitHub Live Folder query change from team-inclusive review requests to personal
review requests. Let Zen deliver these. They do not warrant an additional mod
layout override or a second GitHub polling provider. The new Arc/Dia importer
also belongs to Zen; our mods do not need a second importer.

## Checks completed for this change

- Repository gate with upstream Sine manager: **241 passed, 0 failed, 1 optional
  native entry skipped**. Native checks ran separately.
- Zen 1.24b Morph runner: full pass on repeat, including the new click cases;
  scales reach approximately **0.95 → 1.313 → 1.30**, with one scale owner and
  fixed image centers/hit boxes in the fixture.
- Zen 1.24b routing runner: **all three launches passed**, including actual
  channel/video consolidation, native removal after the empty group's close
  animation, container/workspace preservation and session restoration.
- No new Windows hardware pixel capture, full-suite performance comparison or
  installed Arc/transparent-theme combination was run during this pass.

## Primary sources

- [1.24b release](https://github.com/zen-browser/desktop/releases/tag/1.24b)
- [1.23.4b → 1.24b source comparison](https://github.com/zen-browser/desktop/compare/1.23.4b...1.24b)
- [1.24 backdrop implementation](https://github.com/zen-browser/desktop/blob/1.24b/src/external-patches/firefox/backdrop_filter_reads_web_content.patch)
- [1.23.4 backdrop implementation](https://github.com/zen-browser/desktop/blob/1.23.4b/src/external-patches/firefox/backdrop_filter_reads_web_content.patch)
- [Native Library lifecycle and sections](https://github.com/zen-browser/desktop/blob/1.24b/src/zen/library/ZenLibrary.mjs)
- [Native selected-tab indicator tests](https://github.com/zen-browser/desktop/blob/1.24b/src/zen/tests/tabs/browser_scroll_to_selected_tab.js)
- [Native shortcut migration and commands](https://github.com/zen-browser/desktop/blob/1.24b/src/zen/kbs/ZenKeyboardShortcuts.sys.mjs)
- [Native Paste & Search tests](https://github.com/zen-browser/desktop/blob/1.24b/src/zen/tests/spaces/browser_newtab_paste_and_search.js)
- [Container-default change](https://github.com/zen-browser/desktop/blob/1.24b/src/toolkit/components/contextualidentity/ContextualIdentityService-sys-mjs.patch)
- [Personal review-request change](https://github.com/zen-browser/desktop/commit/48093463fbaf3a6dad8d3deecfa5e76d57edecaf)
- [Settings wrapping change](https://github.com/zen-browser/desktop/commit/46eb9b9ac6de8195f1842add3e2381977f66f703)
