# Whole-suite review against Zen 1.24

Reviewed on 30 October 2026. Latest published release: **1.24b**, commit
`f75390aa2b797ddc3524ff9ed52ceb32a839f9fa`. Development head inspected:
`46eb9b9ac6de8195f1842add3e2381977f66f703`, three commits ahead. This covers all
ten distinct mods; Zenslop is Mediaflow's manifest alias.

This is a source and compatibility review, not a performance benchmark. Items
marked candidates are not reproduced user-profile bugs and were not silently
enabled, removed or backported.

## Work worth doing next

| Priority | Finding | Next change or check |
| --- | --- | --- |
| 1 | Glassflow still filters the page underneath a transparent compact sidebar and keeps a backdrop redraw nudge. Zen already has cross-slice backdrop support, enabled from its acrylic preferences at renderer startup. In 1.24 the patch no longer has the old `!frame_builder_config.is_software` condition at slice creation. | Repeat a rendered A/B with native acrylic enabled before restart, opaque and transparent pages, both sidebar sides, reduced transparency and current Windows WebRender. If native output covers those cases, remove the custom page filter and then test whether the redraw nudge is still needed. This could remove work; no savings have been measured. The patch alone does not prove that transparent-page cases are fixed. |
| 2 | Glassflow Library's optional **Code only** preload has a fixed five-section list and omits the new `SpaceRouting` module. Default **Built** mode calls `ZenLibrary.getInstance()` and already includes it. | Update the optional preload with compatibility for older Zen versions, or preload the native entry module instead if measurements support it. Verify imports without creating the Library or background section observers. This is an incomplete optimization, not broken routing. |
| 2 | Zen now provides the selected-tab-out-of-view indicator. Groupflow also manages visibility, nested scrolling and retained rows in collapsed folders. There is no dedicated combined regression for that indicator. | Test selected loaded/unloaded rows, nested body scrolling, collapsed folders, compact/right sidebar and Library copies. Keep Zen's indicator and `zen.view.show-scroll-to-selected-tab` as the owner; do not add a second one. |
| 2 | Router excludes native folders as destinations and normally skips pinned tabs, but `skip()` has no explicit `isLiveFolder` / `zen-live-folder-item-id` source exclusion. | Test routing with **skip pinned** off against provider-managed Live Folder items. An explicit exclusion may be needed to prevent refile rules from competing with the provider. This is a source-level risk, not a reproduced failure in this review. |
| 3 | Turbo still changes connection limits, pacing, caches, session-save timing and media cache size. Its counters measure accepted requests and navigation matches, not time saved. Native tab warming has already replaced the duplicate custom hover path. | Benchmark the remaining packs against stock 1.24 before retaining default-on tuning or changing defaults. Preserve existing user choices. Graphics overrides are already off by default. Windows CSIR PGO and upstream media fixes are browser-level benefits, not reasons to force more graphics preferences. |
| 3 | Zen moved shortcuts to Firefox's `about:keyboard`; its module now migrates old bindings to native `<key>` commands. Our modules do not depend on the removed keyboard-shortcut manager. | Use native commands/keys if adding shortcuts for Sort, Unload or preview actions. No replacement shortcut editor or global keydown dispatcher is needed. Native registration/display behavior for additional mod commands still needs checking. |
| 3 | Ctrl/Cmd-hover on New Tab now offers native **Paste & Search**, including a clipboard sublabel. Iconflow's optional hide-label rule still hides the primary label unconditionally. | Check the new state with that setting on. Consider showing the action label only while `zen-paste-and-search` is active, while retaining Zen's native command and clipboard handling. This is an affordance decision, not a demonstrated command failure. |
| 3 | Upstream fixed high-contrast menus and reduced-motion panel behavior. Our Boost surface has explicit accessibility guards, but the broader glass surfaces do not have an equivalent complete runtime matrix. | Add rendered forced-colors and reduced-transparency coverage for menus, Library, folders and media controls. Existing reduced-motion icon checks are useful but do not establish contrast or legibility. |

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
