# Audit fixes — 9 October 2026

Baseline: `2d52e52a606b8e0e3065bc59976c80f3f2e8f3f5`.
Preserved branch: [`rollback/pre-audit-fixes-20261009`](https://github.com/Dragon74X/Zen-Personal-Mods/tree/rollback/pre-audit-fixes-20261009).

## Behavior

| Flow | Change |
|---|---|
| Native blur | Connect Glassflow to Zen 1.23.1b's separate sidebar and URL-bar acrylic preferences. Preserve an old explicit sidebar choice once unless a new native choice exists; retain the old preference for rollback. |
| Transparent-page strip | Read effective blur from computed panel CSS; preserve zero and resolved CSS lengths; refresh when native acrylic changes. |
| Boxed downloads | Shared overlay tokens respect both global Off and Downloads Off; box falls back to the window background. |
| Media preview state | Native video state events update controls independently from bitmap capture. |
| Media source ownership | Stop previous processing before switching; retain eligible source for fallback; identify embedded videos by their containing tab. |
| Media controls | Native range input supplies keyboard seeking; focus reveals controls; pop-out targets the mirrored video. |
| Download history | Render after a batch; select at most four older rows without copying history. |
| Peekflow pictures | Disabling pictures removes retained previews and prevents in-flight captures from restoring them. |
| Peekflow preference ownership | Preserve later manual changes; restore original native preferences only after the final active owner exits. |
| Icon generation | Keep shared SVG definitions once, outside generated animation frames. |
| Bookkeeping | Reuse Router ancestry traversal, consolidate pending timers, remove unused counters. |

Groupflow's unloaded-last-used-tab default remains off, as accepted by the user.
No choreography, icon set, settings range, or installed-mod separation is removed.
No dependency is added. Earlier migration removals remain documented in the
[original audit](AUDIT-2026-10-09.md); this patch does not rewrite existing profiles.

## Native blur

Native blur is not retired. Zen 1.23.1b declares
`zen.theme.acrylic-sidebar` and `zen.theme.acrylic-urlbar` instead of the old
`zen.theme.acrylic-elements` switch. Glassflow's native integration follows
those preferences. Glassflow keeps its existing `0.25` brightness preset
(native Zen uses `0.5`); custom blur values remain unchanged.

The page-strip fallback remains limited to transparent browser backgrounds
behind a visible compact sidebar whose computed backdrop blur is nonzero.
It filters current page content; it does not capture a frozen screenshot.
Native overlay CSS remains the overlay implementation.

Sources:

- [Zen 1.23.1b preferences](https://github.com/zen-browser/desktop/blob/1.23.1b/prefs/zen/theme.yaml)
- [Zen sidebar acrylic](https://github.com/zen-browser/desktop/blob/1.23.1b/src/zen/compact-mode/sidebar.inc.css)
- [Zen download batching](https://github.com/zen-browser/desktop/blob/1.23b/src/zen/library/ZenLibraryWidget.sys.mjs)

## Verification

All **157 Node tests passed**, including the upstream Sine update tests.
Zen **1.23.1b / Firefox 157.0.1** passed ten blur states, four boxed-download
states, and native keyboard seeking with focus-revealed controls. The icon
fixture kept one gradient definition across three frames with all three fills.
The live page filter changed only its intended strip; outside pixels were
identical. A second independent review found no remaining introduced defect.

The targeted 1,000-download fixture reduced layout reads from **1,001 to 1**
and copied history entries from **501,484 to 4**. These counts describe the
fixture, not a whole-browser performance benchmark.

Mediaflow versions both actor module URLs so Sine updates load new parent and
content code within the session. An isolated Zen test confirmed unchanged URLs
retained old code after replacement; versioned URLs loaded the new code.

Run the repository checks:

```sh
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs
python3 tools/zen-smoke.py --zen /path/to/zen
```

Optional `--arc` and `--transparent` paths load those installed styles into
the smoke test's temporary profile. The test never attaches to a user profile.
Marionette screenshots do not establish GPU backdrop-filter appearance or
Windows compositor performance; computed styles and page-filter checks cover
the integration contract.
The container required `MOZ_DISABLE_CONTENT_SANDBOX=1` for its isolated test
profile because UID mapping was blocked. No sandbox setting changed in the mods.

## Revert

Keep this change in one PR merge. Revert that merge to restore its source changes;
do not reset `main` or discard later commits. The baseline branch above keeps the
pre-fix source available independently of the working branch.

For the user: request **“Revert the 9 October audit fixes.”** The release reversal
must include new version numbers and fresh `updatedAt` values for the reverted
mods. Sine detects updates by timestamp: reverting source and restoring old
timestamps alone would not deliver the rollback to installed profiles.

The retired acrylic preference is copied once where needed, never deleted. This
keeps the prior Glassflow setting available if its code is restored. Groupflow settings and
user-authored Router rules are unchanged.
