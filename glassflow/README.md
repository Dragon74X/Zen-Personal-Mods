# Glassflow

A [Zen Browser](https://zen-browser.app/) mod for [Sine](https://github.com/CosmoCreeper/Sine).

Glass theming for the browser chrome, built out of one shared colour and glass
pipeline that every section reads from. Sections are independent: turning one
off costs nothing, and nothing in one depends on another.

- **Tabs** — container-, workspace- or custom-tinted gradients, with separate
  tint, opacity, gradient, sheen, rim, glow and blur for the **selected**,
  **unselected**, **hovered** and **unloaded** states.
- **Tab strip** — one gradient wash behind the whole strip, rather than per tab.
- **Sidebar** — tint, fill, sheen, rim, compact-mode glass, and optional
  blurring of the page behind or beside it.
- **Window buttons** — macOS-style traffic lights, round and glassy (purple
  close, blue minimise, green maximise), placeable at either end of the
  sidebar row.
- **Interface font** and **interface font size** — two separate switches,
  both off by default.

Tab group and subgroup styling is **not** here: that is
[Groupflow](../groupflow), a sibling mod that inherits Glassflow's tokens live.
Zen folders are untouched by both.

## Install

Paste this folder's URL into Sine's install box, under Settings -> Mods:

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/glassflow
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config` — Glassflow
ships a small script that writes its preference variables at startup, so
configured values apply on first paint instead of after a mod reload.

Tab styling is on out of the box. The sidebar, window buttons and both font
sections are off until you switch them on.

## Colour

| Setting | Default | Notes |
|---|---|---|
| Colour source | Container colour | Or workspace colour, custom, or the folder / group colour |
| Fallback colour | Workspace colour | Used when a tab has no container and no group |
| Custom colour | `#7c8cf8` | The last-resort colour, and the source when *Custom* is picked |
| Darkness | `25%` | How far the accent is pulled toward the second colour |
| Second gradient colour | `#1b1b2b` | What *Fade to the second colour* fades into |

By default tabs follow `--identity-tab-color`, the container colour, so tabs in
different containers read differently at a glance. **Workspace colour**
(`--zen-primary-color`) is uniform instead, and shifts as you change spaces.

If everything looks the same grey-blue, neither is assigned — set container
colours in Firefox's container settings, or workspace colours under
Settings -> Appearance. The final fallback is `#7c8cf8`.

## Glass

| Setting | Default | Notes |
|---|---|---|
| Colourless glass | on | Glass reads as light and depth rather than as a colour cast |
| Glass intensity | `1` | Master multiplier over every sheen and rim in the mod |
| Sheen strength | `1` | |
| Sheen direction | Top to bottom | |
| Stop flicker on window focus | on | |
| Snap into place at startup | on | Suppresses transitions during the first paint |

## Tab states

Each of **Selected**, **Unselected**, **Hovered** and **Unloaded** has the same
set of controls, so a state can be styled without touching the others.

| Setting | Selected | Unselected | Hovered | Unloaded |
|---|---|---|---|---|
| Style this state | on | on | on | on |
| Tint strength | `42%` | `12%` | `24%` | `7%` |
| Opacity | `1` | `1` | `1` | `0.62` |
| Gradient direction | Left to right | Left to right | Left to right | Right to left |
| Gradient end | Fade to transparent | Fade to transparent | Fade to transparent | Fade to transparent |
| End tint | `17%` | `4%` | `9%` | `2%` |
| Gradient spread | `100%` | `100%` | `100%` | `100%` |
| Glass sheen | on | off | off | off |
| Glass rim | on | off | off | off |
| Outer glow | off | off | off | off |
| Frosted blur | on | off | off | off |
| Blur strength | `20px` | `20px` | `20px` | `20px` |

Keep a real gap between the selected and unselected tints. Past roughly 20% on
the unselected value the two states stop being distinguishable. If you prefer
subtle tints, turn on **Accent bar on the selected tab** instead — a bar reads
faster than a colour difference.

**Glass rim** is the difference between "glassy" and "just translucent".
Translucency alone tends to read as washed out.

**Frosted blur** is a compositor pass per tab, and it is the first thing to
turn off if scrolling the tab strip feels heavy.

Turning on **Detailed rim control** (under *Tabs, shared*) exposes per-state rim
colour, edge, highlight thickness and ring thickness. Without it the rim uses
one white 1px top highlight and 1px ring per state.

## Tabs, shared

| Setting | Default | Notes |
|---|---|---|
| Detailed rim control | off | Reveals the per-state rim colour / edge / thickness knobs |
| Tab roundness | `10px` | Groupflow's header roundness is a separate value; match them by hand |
| Texture | None | Diagonal hatch, dots, horizontal lines or fine mesh over the tint |
| Accent bar on the selected tab | off | 3px bar |
| Hide Arc's container glow | on | Only matters with Arc 2.0 installed |

## Tab strip

A separate wash behind every tab rather than per tab. It always uses the
workspace colour, since container colour only exists per tab.

| Setting | Default |
|---|---|
| Gradient behind the whole strip | off |
| Strip strength | `16%` |
| Strip direction | Top to bottom |

## Sidebar

Off by default. Two states, two surfaces, nothing to pick. Docked, the sidebar
gets the tint gradient. In compact mode Zen floats the sidebar over the page
and paints it with a panel element; that panel gets the panel settings, the
same element Arc's compact sidebar section styles. Turn Arc's blur and opacity
down and let this own it.

| Setting | Default | Notes |
|---|---|---|
| Enable sidebar styling | off | |
| Sidebar tint / fill strength | `10%` / `1` | docked gradient |
| Sidebar gradient direction | Top to bottom | |
| Glass sheen / glass rim | off / off | |
| Panel opacity | `35%` | Arc's look; `0%` is see-through |
| Workspace gradient through the panel | `1` | `0` hides Zen's gradient |
| Panel shadow | on | Zen's own |
| Panel accent tint / corner radius | `22%` / `12px` | |
| Blur behind the floating panel | off | Real `backdrop-filter`. Cannot see the web page; no chrome blur can |
| Blur radius / contrast / saturation | `25px` / `1` / `1` | |
| Sampled glass (experimental) | off | Snaps the page strip under the panel a few times a second and paints it blurred behind the panel. The only way to blur the page itself |
| Sample blur / opacity / interval | `18px` / `1` / `250` | |

`Glassflow.sample.status()` in the console says whether sampling is running
and which strip of the page it last read.

Two optional page-side effects, both off:

- **Blur the page when the sidebar shows** — blurs the whole page while the
  compact sidebar is out (`6px`, `160ms` fade by default), so the sidebar
  reads as glass over content.
- **Blur a strip of the page** — blurs only a `260px` band along one edge,
  with its own radius, offsets, corner and feather.

## Window buttons

Off by default. Placement is set explicitly via `order`, so it does not depend
on `zen.view.experimental-force-window-controls-left`.

| Setting | Default | Notes |
|---|---|---|
| Enable macOS-style traffic lights | off | |
| Position | Right end | Left end is true macOS placement |
| Show colour at rest | on | Off = grey until hovered |
| Close / minimise / maximise colour | purple / blue / green | Any CSS colour; alpha below 1 is what makes them glassy |
| Diameter | `13px` | macOS uses 12px |
| Gap between buttons | `8px` | |
| Resting shape (height) | `1.15` | Multiple of the diameter; `1` is a circle |
| Resting width | `1` | Independent of height — combine both for a capsule either way up |
| Vertical oval on hover | on | |
| Oval height on hover | `1.3` | |
| Width on hover | `1` | Applied as a compositor transform, so it can never push neighbours |
| Show glyphs on hover | on | |
| Glyph size | `0.62` | |
| Button opacity | `1` | |
| Glass sheen / rim / frosted blur | on / on / on | |
| When the window is not focused | Keep my colours, slightly muted | Or unchanged, or neutral grey |
| On hover | Keep my colour, no change | Or deepen it, or use the three hover colours below |
| Hover intensity | `1` | Used by *Deepen my colour* |

## Interface font

Off by default. Sets the chrome font family, with presets covering the
accessibility faces (Atkinson Hyperlegible, Lexend, OpenDyslexic, Andika,
Luciole) alongside the usual system and UI fonts, plus a custom box.
Letter spacing, word spacing and line height are separate.

## Interface font size

Off by default. Replaces the **Customize Font Size** mod: the same four
surfaces it covered — tab bar (`1.3em`), workspace title (`1.5em`), find bar
(`1.4em`), workspace icons (`1.5em`) — plus folder labels (`1.1em`), the URL
bar (`1em`) and menus (`1em`).

Turn Customize Font Size off once this is on. Both set `font-size` on
overlapping elements, and running both means whichever stylesheet loads last
silently wins.

## Corner shape (Zen 1.22b squircles)

Zen 1.22b reshapes every corner in the browser with CSS `corner-shape:
superellipse()`, through a rule on the **universal selector** — so it reshapes
this mod's surfaces too, whether or not they were designed for it:

```css
--zen-squircle-value: 1.3;                                  /* most platforms */
@media (-moz-platform: windows) { --zen-squircle-value: 2.3; }   /* Windows   */
*:not(.no-squircles) { corner-shape: superellipse(var(--zen-squircle-value)); }
```

`squircle` is `superellipse(2)`, so **Windows sits past it**, heading toward
square. A superellipse consumes its radius differently from a circular corner,
so a radius tuned before 1.22b reads noticeably squarer now at the same number.
That is not the mod losing its styling — the radius is still applying exactly
as set, it is the corner *shape* underneath that moved.

Two independent levers, both applying only to Glassflow's own surfaces — the
rest of the browser keeps Zen's shape:

| Setting | Default | Notes |
|---|---|---|
| Corner shape | Follow Zen | Mirrors Zen's value, so nothing changes out of the box. **Round (classic)** is `superellipse(1)` and restores exactly how these surfaces looked before 1.22b |
| Custom superellipse value | `2.3` | 1 round, 2 squircle, higher squarer, negative scoops inward, `infinity` hard square |
| Radius source | My value | **Follow Zen's own corner radius** reads Zen's `--border-radius-medium` instead of the number you set |
| Radius compensation | Off | **Auto** follows Zen's own per-platform squircle value — the same factor Zen applies to its native radii |
| Custom radius multiplier | `1.5` | Only used when compensation is Custom |
| Corner shape, tabs / Essentials / window buttons / sidebar | Follow the setting above | Per-surface override |

**Radius source** is the answer to what went wrong at 1.22b. A pinned number
cannot follow a chrome that restyles itself: when Zen rescaled its radii for
squircles, a 12px tab sat inside a 16.8px world and read as square. Following
Zen's own `--border-radius-medium` keeps these surfaces in step through future
restyles automatically. Leave **Radius compensation** Off when following Zen —
that token already carries the squircle scaling, and applying it twice
over-rounds.

The per-surface knobs matter because the same corner reads differently at
different sizes: an Essentials card is far larger than a tab, and the window
buttons are the most visible place the change lands — `Round` is what makes
them read as circles and capsules at all.

**Quickest fix if 1.22b squared everything off:** set **Corner shape** to
*Round (classic)*. To keep the squircles but stop them reading as squares, set
**Radius compensation** to *Auto* instead.

**Turn squircles off browser-wide** rounds every corner in the rest of the
chrome — menus, panels, dialogs, the URL bar — leaving nothing squircled except
what the settings above govern, which keep working independently of it.

**It applies instantly, with no restart**, because it does not touch
`layout.css.corner-shape.enabled`. That pref is the obvious route and it is a
trap: it gates `corner-shape` when stylesheets are *parsed*, so flipping it
leaves every already-parsed declaration in place until the browser restarts —
verified in practice, not just in theory. Instead this out-cascades Zen. Sine
injects this mod as a `USER_SHEET`, and user-origin `!important` outranks the
author-origin declarations Zen's sheets carry, so a `-moz-pref()` media query —
which is live — flips the whole chrome the moment you tick the box. Nothing in
your profile is modified either way.

`corner-shape` applies per element *and* per pseudo-element, and a pseudo never
inherits its parent's, so the rule covers `*`, `*::before` and `*::after` to
reach what Zen paints on Essentials cards.

Where `corner-shape` is unsupported entirely, every declaration in this
section is ignored and nothing breaks.

## Animation

**Instant UI animations** (off by default) flips the global switch on Zen's
bundled Motion library, so every UI animation — tab open and close, workspace
switches, folders — jumps straight to its final frame and the interface
responds at input speed. There is no `zen.animations` pref; this is the real
lever. In-memory, applies and reverts live, and web pages are untouched.

## Compatibility

**Arc 2.0** — turn off its *macOS style buttons* (`arc-macos-style-buttons`)
before enabling Glassflow's. Two mods drawing the same three circles fight over
layout, even though Glassflow wins the cascade. Its container glow can be
hidden from *Tabs, shared*.

**Other tab-styling mods** — Glassflow's id begins with `zz`, and Sine builds
`chrome.css` with a plain lexicographic sort of mod ids, so it imports last and
wins on source order. Sine also injects mod CSS as a `USER_SHEET`, and
user-origin `!important` outranks author-origin `!important`.

**Transparency mods** — if tabs look muddy, turn off **Frosted blur** on each
state first. `backdrop-filter` composes poorly when several mods each
contribute their own blur pass.

**Zen Turbo** — its *Smooth workspace switching* suspends Glassflow's blurs
for the duration of a workspace slide and restores them the instant it ends,
which is worth having if switching feels framey.

**Desktop blur** — `backdrop-filter` can only blur what the browser itself
painted; it cannot blur the desktop. Real glass on Windows needs a
compositor-level tool such as DWMBlurGlass or MicaForEveryone underneath.

## Troubleshooting

Enable **Outline what Glassflow touches**. Tabs get a magenta dashed outline,
buttons cyan. If something you expected to change has no outline, Glassflow is
not matching it and the styling comes from another mod.

For anything else, open the Browser Console with `Ctrl+Shift+J` and filter for
`Sine`.

## Notes

Tab tinting is painted as a `background-image` on `.tab-background` rather than
on a pseudo-element. Zen and Arc both already use `.tab-background::before` and
`::after`, so a layer built there is overridden by their opacity rules.

Setting descriptions are collapsed into hover-revealed info badges. Sine has no
tooltip field in `preferences.json`, so each explanation is written in
`*italics*` — `formatLabel()` turns that into an `<i>` element, which
`userContent.css` restyles as a badge. Every rule is scoped to
`[id^="zzglass-"]`, matching only this mod's preference rows, so other mods'
settings panels are untouched.

`glassflow.uc.js` exists only to write string and number prefs as CSS variables
at startup. Sine injects them itself, but not until something (the settings
page, a mod reload) triggers it, so without the script the sheet runs on its
fallbacks until the first reload. Booleans are skipped — those are read with
`-moz-pref()`, never as variables.

Built against Zen 1.22b (Firefox 155) with Sine 2.3.4c2. Uses the parenthesised
`@media (-moz-pref("..."))` form throughout.

## License

MIT
