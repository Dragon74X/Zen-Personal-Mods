# Zen Personal Mods

Six [Sine](https://github.com/CosmoCreeper/Sine) mods for [Zen Browser](https://zen-browser.app/).
Entirely vibe-coded with various LLMs.

Install any of them by pasting its folder URL into Sine's install box, under
**Settings -> Mods**.

| Mod | What it does | Script |
|---|---|---|
| [**Download Prompt**](download-prompt) | Asks whether to replace or keep both when a download's name is already taken, instead of quietly saving `name(1).ext`. Wears Glassflow's glass. | yes |
| [**Glassflow**](glassflow) | Per-state glass theming for tabs, tab strip, sidebar and window buttons, plus interface font and font-size control. | yes |
| [**Groupflow**](groupflow) | The same visual language applied to tab groups and subgroups: headers, nesting guides, markers, per-group favicons. | yes |
| [**Tab Router**](tab-router) | Files tabs into nested tab groups by domain and URL path, from rules you write or fully automatically. | yes |
| [**Tab Unloader**](tab-unloader) | Time-based tab unloading with per-category exclusions. Unloads, never closes. | yes |
| [**Zen Turbo**](zen-turbo) | Reversible network and IO pref packs, connection warmup, UI animation controls. | yes |

## Requirements

Every mod here ships a `.uc.js` script, so all of them need
`sine.allow-unsafe-js` set to `true` in `about:config`. Sine only runs scripts
from mods it did not install from its own store when that flag is on.

## How they fit together

Glassflow and Groupflow are siblings, not a fork of one another: Groupflow
reads Glassflow's live tokens (roundness, accent tone, sheen recipe, rim
strength, glass intensity), so knobs turned in Glassflow carry over
automatically. Either works on its own.

Tab Router files tabs into groups; Groupflow styles the groups it makes.
Tab Unloader unloads idle tabs; Zen Turbo's hover warmup pre-opens the
connection so they reload onto a warm socket, and Glassflow's **Unloaded
tab** state gives them their own look. Download Prompt touches downloads
rather than tabs, but its question reads Glassflow's tokens, so it is
glass too when Glassflow is installed and plain when it is not. Nothing depends on anything else being
installed.

Every mod id starts with `zz`, because Sine builds `chrome.css` by importing
mod stylesheets in plain lexicographic order of mod id -- so these import
last and win on source order without escalating `!important`.

## License

MIT

## Checking a profile

`tools/check.js` reports, for every mod: whether its script is actually running
in this window, whether each pref holds the type its declaration calls for, and
which settings rows are hidden because the pref their condition names has never
been written. Paste it into the Browser Console (Ctrl+Shift+J); it reads only
and copies its report to the clipboard.

## Sine update recovery

Each mod includes the same `sine-update-guard.sys.mjs` background script.
It installs once per Sine session, independently of which of the 6 mods are
enabled. It serializes top-level installs/update batches and the mods within
each batch, preventing collisions in Sine's shared `sine-mods/temp` folder.
Preference reads wait until file replacement finishes; unreadable files still
produce Sine's original error. No browser preference values or engine files
are changed. The guard remains active until restart, including after disabling
its originating mod, so closing a window or updating that mod cannot abandon
an operation. Sine's recursive dependency-install behavior is retained.

One-time bootstrap from an older installation:

1. Let any current update finish. Update/reinstall **Tab Router only** first
   if installed (this also removes its old folder-moving repair). Otherwise
   install/update any one of these mods; do not start concurrent installs.
2. Restart Zen. Run `tools/check.js` and confirm `sineUpdateGuard` says `active`.
3. Update the remaining mods. If files were already lost, reinstall those
   affected mods once. Back up your profile first; the guard does not recover
   deleted files or move unknown/stray folders.

Requires `sine.allow-unsafe-js=true`, as do the existing scripts. The guard
only activates when the installed Sine API still contains the shared-temp
implementation; newer/unrecognized implementations are left unchanged. It
cannot protect an update that started before the guard was loaded.

Regression checks (Node.js 18+): `node --test tools/sine-update-guard.test.mjs`.
The test also checks that all 6 shipped guard copies and manifest entries match.
For native updater coverage (Node.js 20+), set `SINE_MANAGER_SOURCE` to a local
Sine `src/core/manager.sys.mjs`, then run `node --test tools/sine-native-update.test.mjs`.
That test runs upstream updater methods with in-memory filesystem/network
substitutes; it is not a live Zen test.

## Shelved features

`docs/SHELVED.md` records work that was removed on purpose -- what it did, why it
was pulled, and the commits to restore it from.
