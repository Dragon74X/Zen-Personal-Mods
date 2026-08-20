# Zen Personal Mods

Five [Sine](https://github.com/CosmoCreeper/Sine) mods for [Zen Browser](https://zen-browser.app/).
Entirely vibe-coded with various LLMs.

Install any of them by pasting its folder URL into Sine's install box, under
**Settings -> Mods**.

| Mod | What it does | Script |
|---|---|---|
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
tab** state gives them their own look. Nothing depends on anything else
being installed.

Every mod id starts with `zz`, because Sine builds `chrome.css` by importing
mod stylesheets in plain lexicographic order of mod id -- so these import
last and win on source order without escalating `!important`.

## License

MIT
