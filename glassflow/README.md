# Glassflow

A [Zen Browser](https://zen-browser.app/) mod for [Sine](https://github.com/CosmoCreeper/Sine).

Four independent sections, all **off by default**:

- **Window buttons** — macOS-style traffic lights — round window buttons with soft glassy fills (purple close, blue minimise, green maximise), placeable at either end of the sidebar row.
- **Tabs** — container-, workspace-, folder- or custom-tinted gradients, with separate tint and opacity for selected, hovered, unselected and unloaded states.
- **Folders** — group labels and bodies restyled to match, using each group's own colour.
- **Sidebar** — tint, opacity, blur and rim.

Every section has its own master switch and reads from one shared colour and glass pipeline. Turning a section off costs nothing, and nothing in one section depends on another.

## Install

Paste this folder's URL into Sine's install box, under Settings -> Mods:

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/glassflow
```

Then open Glassflow's settings and enable the two master switches.

## Settings

### Font size (replaces Customize Font Size)

Covers the same four surfaces CFS does -- tab bar, workspace title, find bar, workspace icons -- plus folders, the URL bar, and menus. Turn CFS off once this is on; both set `font-size` on overlapping elements, and running both means whichever mod's stylesheet loads last silently wins.

### Window buttons

| Setting | Default | Notes |
|---|---|---|
| Enable traffic lights | off | |
| Side | Right end | Left end is true macOS placement |
| Show colour at rest | on | Off = grey until hovered |
| Close / Minimise / Maximise colour | purple / blue / green | Any CSS colour value; alpha below 1 is what makes them glassy |
| Resting shape (height) | `1.15` | Multiple of the diameter. 1.0 is a circle |
| Resting width | `1` | Independent of height. Combine both for a capsule in either orientation |
| Width on hover | `1` | Applied via a compositor transform, so it can never push neighbouring buttons |
| Diameter | `13px` | macOS uses 12px |
| Gap | `8px` | |
| Glyphs on hover | on | |
| Vertical oval on hover | on | Buttons stretch taller when the group is hovered |

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

## Tinting

By default tabs follow `--identity-tab-color`, the container colour, so tabs in different containers read differently at a glance. **Colour source** can switch this to `--zen-primary-color`, the workspace colour, which is uniform and shifts as you change spaces.

If everything looks the same grey-blue, neither is assigned — set container colours in Firefox's container settings, or workspace colours under Settings -> Appearance. The final fallback is `#7c8cf8`.

**Gradient across the whole tab strip** is a separate wash behind every tab rather than per-tab. It always uses the workspace colour, since container colour only exists per tab.

## Compatibility

**Arc 2.0** — turn off its *macOS style buttons* (`arc-macos-style-buttons`) before enabling Glassflow's. Two mods drawing the same three circles fight over layout, even though Glassflow wins the cascade.

**Other tab-styling mods** — Glassflow's id begins with `zz`, and Sine builds `chrome.css` with a plain lexicographic sort of mod ids, so it imports last and wins on source order. Sine also injects mod CSS as a `USER_SHEET`, and user-origin `!important` outranks author-origin `!important`.

**Transparency mods** — if tabs look muddy, disable **Frosted blur** first. `backdrop-filter` composes poorly when several mods are each contributing their own blur pass.

**Desktop blur** — `backdrop-filter` can only blur what the browser itself painted; it cannot blur the desktop. Real glass on Windows needs a compositor-level tool such as DWMBlurGlass or MicaForEveryone underneath.

## Troubleshooting

Enable **Outline every element Glassflow touches**. Tabs get a magenta dashed outline, buttons cyan. If something you expected to change has no outline, Glassflow is not matching it and the styling comes from another mod.

For anything else, open the Browser Console with `Ctrl+Shift+J` and filter for `Sine`.

## Notes

Tab tinting is painted as a `background-image` on `.tab-background` rather than on a pseudo-element. Zen and Arc both already use `.tab-background::before` and `::after`, so a layer built there is overridden by their opacity rules.

Setting descriptions are collapsed into hover-revealed info badges. Sine has no tooltip field in `preferences.json`, so each explanation is written in `*italics*` — `formatLabel()` turns that into an `<i>` element, which `userContent.css` restyles as a badge. Every rule is scoped to `[id^="zzglass-"]`, matching only this mod's preference rows, so other mods' settings panels are untouched.

Built against Zen 1.21.x with Sine 2.3.3. Uses the parenthesised `@media (-moz-pref("..."))` form throughout.

## License

MIT
