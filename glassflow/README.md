# Glassflow

A [Zen Browser](https://zen-browser.app/) mod for [Sine](https://github.com/CosmoCreeper/Sine).

Two features, both **off by default**:

- **macOS-style traffic lights** — round window buttons with soft glassy fills (purple close, blue minimise, green maximise), placeable at either end of the sidebar row.
- **Glassy tabs** — workspace-tinted gradients on tabs, with separate tint levels for selected, hovered and unselected states so they stay distinguishable at a glance.

## Install

Paste this folder's URL into Sine's install box, under Settings -> Mods:

```
https://github.com/USERNAME/REPO/tree/main/glassflow
```

Then open Glassflow's settings and enable the two master switches.

## Settings

### Window buttons

| Setting | Default | Notes |
|---|---|---|
| Enable traffic lights | off | |
| Side | Right end | Left end is true macOS placement |
| Show colour at rest | on | Off = grey until hovered |
| Close / Minimise / Maximise colour | purple / blue / green | Any CSS colour value; alpha below 1 is what makes them glassy |
| Diameter | `13px` | macOS uses 12px |
| Gap | `8px` | |
| Glyphs on hover | on | |

Placement is set explicitly via `order`, so it does not depend on `zen.view.experimental-force-window-controls-left`.

### Glassy tabs

| Setting | Default | Notes |
|---|---|---|
| Enable glassy tabs | off | |
| Selected tint | `38%` | |
| Unselected tint | `10%` | |
| Hover tint | `20%` | |
| Gradient direction | Left to right | Or top-to-bottom, diagonal, flat |
| Frosted blur | on | A compositor pass per tab — the first thing to disable if scrolling feels heavy |
| Blur strength | `14px` | |
| Glass rim | on | 1px inner highlight along the top edge |
| Selected glow | on | |
| Accent bar | off | 3px bar on the selected tab |

Keep a real gap between the selected and unselected tints. Past roughly 20% on the unselected value the two states stop being distinguishable. If you prefer subtle tints, enable **Accent bar** instead — a bar reads faster than a colour difference.

**Glass rim** is the difference between "glassy" and "just translucent". Translucency alone tends to read as washed out.

## Workspace tinting

Tab colour follows `--zen-primary-color`, which Zen recolours per workspace, so tabs shift as you switch spaces. If everything looks the same grey-blue, your workspaces have no colours assigned — set them under Settings -> Appearance. The fallback chain is `--zen-colors-primary`, then `#7c8cf8`.

## Compatibility

**Arc 2.0** — turn off its *macOS style buttons* (`arc-macos-style-buttons`) before enabling Glassflow's. Two mods drawing the same three circles fight over layout, even though Glassflow wins the cascade.

**Other tab-styling mods** — Glassflow's id begins with `zz`, and Sine builds `chrome.css` with a plain lexicographic sort of mod ids, so it imports last and wins on source order. Sine also injects mod CSS as a `USER_SHEET`, and user-origin `!important` outranks author-origin `!important`.

**Transparency mods** — if tabs look muddy, disable **Frosted blur** first. `backdrop-filter` composes poorly when several mods are each contributing their own blur pass.

**Desktop blur** — `backdrop-filter` can only blur what the browser itself painted; it cannot blur the desktop. Real glass on Windows needs a compositor-level tool such as DWMBlurGlass or MicaForEveryone underneath.

## Troubleshooting

Enable **Outline every element Glassflow touches**. Tabs get a magenta dashed outline, buttons cyan. If something you expected to change has no outline, Glassflow is not matching it and the styling comes from another mod.

For anything else, open the Browser Console with `Ctrl+Shift+J` and filter for `Sine`.

## Notes

Built against Zen 1.21.x with Sine 2.3.3. Uses the parenthesised `@media (-moz-pref("..."))` form throughout.

## License

MIT
