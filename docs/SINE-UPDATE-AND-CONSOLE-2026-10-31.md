# Update check stuck on “…” and related console findings

Two rejections point at the shared guard's installed-file validation. Sine's
archive discovery legitimately returns paths such as `styles/sidebar/userChrome.css`.
The guard passed that string as one leaf to Gecko's `PathUtils.join`, which
rejects embedded separators. This is a rejected registry commit, not evidence of
a deadlocked download. The export does not name the offending mod or file.
Sine's settings handler writes “…” before awaiting the update, and previously
never changed it when the promise rejected.

The guard now joins each validated archive component separately and reads
preferences from that same resolved file. Unsafe, absolute, traversing and
missing names still fail; the previous folder, registry and user controls
survive. The settings page keeps Sine's existing button and success labels.
Failure replaces that request's busy indicator and still rejects to the caller.
Newer requests and other settings windows retain their own status. There is no
polling, extra click handler or global filesystem-path override.

The guard ships with ten independently installable mods, so all ten have new
release metadata. The legacy Mediaflow forwarding manifest stays synchronized.
The [one-run recovery action](../tools/SINE-UPDATE-RECOVERY.md) uses the installed
updater and checks the fixed files before recommending a restart. In an offline
fixture, the previous guard rejected an unrelated nested-path mod, restored that
mod, and still installed all ten replacement guards. No settings reset or
reinstallation is needed for that case.

| Other console finding | Evidence and disposition |
| --- | --- |
| Remote SVG favicon rejected during restore | Glassflow's same-host favicon hold copied a tab's `image` attribute into `mIconURL`. Zen uses the attribute for a process-bound display wrapper and serializes `mIconURL` as the source. The old behavior fails on a real same-host navigation. Glassflow 3.74.22 retains the source accepted by tabbrowser, lets Zen safely wrap it for display, and releases it on a different host or when the hold is Off. This fixes a demonstrated contributor; the log doesn't identify every writer of prior session data. |
| Settings navigation: missing `handleSubcategory` | Earlier Sine registered an initializer but no module for its pane. On Zen 1.24, navigating to that pane also needs the module. The bridge uses the native registrar only if the slot is missing; current Cosine's own registration is preserved. |
| Settings search: missing `gZenMods.updatePref` | Sine removes Zen's marketplace backend and navigation, but Zen's search can still initialize its retired pane. The bridge marks that initializer complete when Sine's pane exists and the original navigation and backend are gone. The active native marketplace is left alone. |
| Pinned-tab reset exception | Zen 1.24b calls `createNullPrincipal()` without the required argument if its saved target cannot be parsed. Reproduced in the original native reset method. A [tested upstream source change](../tools/upstream/zen-1.24b-invalid-pinned-target.patch) leaves the live tab and history intact on an invalid target and preserves normal resets with the correct principal. It is **not installed by these mods**. No user session is altered to work around it. |
| Seven “unknown pref type: text” warnings | Sine explicitly accepts `text`, constructs its label, then warns because the control switch has no `text` arm. Its own settings use these as display headings. None of this repository's manifests declares a `text` control; the export doesn't name the emitting rows. No evidence of seven lost editable settings. |
| Jump List favicon lookups | These come from Firefox's Windows taskbar integration. They do not enter Sine's transaction or diagnose a failed tab-icon restore. No change to taskbar history, private page URLs or security checks. |
| Remaining messages | Extension Conduits rejection records a message outstanding when an extension actor closed; no extension is identified. Bare object exceptions and “Given tab is not restoring” lack a caller here. Session saves, portal checks, shortcut-layout warnings and the scroll-linked positioning advisory do not identify another failed mod transaction. |

Verification: the real Sine/Cosine manager and settings click handler run against
generated local archive bytes in a disposable profile. Native Zen checks the old
join failure, failed installation and rollback, retry, successful/no-update labels,
settings navigation, SVG session serialization and restore. The recovery script
also verifies an installed guard and creates a readable ZIP. The pinned-target
candidate is exercised separately from the installed browser implementation.
These tests do not access a user's profile or certify every third-party manifest.

Run `node --test tools/*.test.mjs` with `SINE_MANAGER_SOURCE` pointing to the
upstream manager to include transaction coverage; run
`python tools/zen-smoke.py --zen /path/to/zen --sine-update /path/to/Sine/src`
for the actual browser check. A Windows job uses the published, hash-verified
Zen 1.24b runtime on relevant pull requests.

Sources: [Gecko path API](https://searchfox.org/firefox-main/source/dom/chrome-webidl/PathUtils.webidl),
[Sine manager](https://github.com/CosmoCreeper/Sine/blob/fb0bd4ca6af888f10648e126947f7d1f82228433/src/core/manager.sys.mjs),
[Cosine settings](https://github.com/CosmoCreeper/Sine/blob/31ed34f7a5b724757cff8b59a511d10313191f8d/src/core/settings.mjs),
[Zen pinned-tab owner](https://github.com/zen-browser/desktop/blob/f75390aa2b797ddc3524ff9ed52ceb32a839f9fa/src/zen/tabs/ZenPinnedTabManager.mjs).
