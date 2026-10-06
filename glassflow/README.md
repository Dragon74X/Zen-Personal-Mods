# Glassflow

> Runtime compatibility requires testing against installed Zen, Firefox, and Sine versions.

A [Zen Browser](https://zen-browser.app/) mod for [Sine](https://github.com/CosmoCreeper/Sine).

Glass theming for the browser chrome, built out of one shared colour and glass
pipeline that every section reads from. Sections are independent: turning one
off costs nothing, and nothing in one depends on another.

- **Tabs** — container-, workspace- or custom-tinted gradients, with separate
  tint, opacity, gradient, sheen, rim and glow for the **selected**,
  **unselected**, **hovered** and **unloaded** states.
- **Tab strip** — one gradient wash across the whole sidebar, rather than per tab.
- **Sidebar** — tint, fill, sheen, rim, compact-mode glass, Zen's own blur
  made adjustable, and an optional blur of the page while the sidebar is out.
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

## Finding a setting

**Show settings for**, at the top of the settings page, shows one part of the
browser at a time (*Colour and glass*; *Tabs*; *Sidebar*; *Overlays, dialogs
and status*; *Blur and transparency*; *Window buttons*; *Corners, fonts and
motion*; *Other mods*; *Troubleshooting*) or *Everything*. *Blur and
transparency* gathers every blur and see-through setting in one place: Zen's
blur and its values, the sidebar panel's opacity and gradient, the page blur,
and each overlay's glass; they also stay on their own pages. Hidden settings
keep their values. Each row's tooltip shows the preference it
sets.

## Replaces these mods

Small single-purpose mods, folded in so they update with Glassflow. Each is
on by default, sits in the section it affects, and names the mod it replaces.
Remove the original once you have this version.

| Was | Now | Section |
|---|---|---|
| Left close button | Close button on the left | Tabs, shared |
| Remove Tabs Separator | Hide the pinned-tabs separator | Tabs, shared |
| Back Fwd Always Hidden | Hide back and forward | Sidebar |
| Floating Statusbar | Glass status pill | Overlays |
| Dialog Fix | Theme-coloured dialogs | Overlays |
| TitleBarButton UI Tweaks | Tidy system buttons (only while the traffic lights are off) | Window buttons |

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

An unloaded tab's **Opacity** fades its background, title and favicon;
**Greyscale favicon** (off by default) also drains the favicon's colour. The tab's tint,
rim and other colours are kept.
**Dim unloaded Essentials** and **Dim unloaded pinned tabs** (both off) leave
those at full strength while unloaded; they keep the Unloaded tint as the cue.

Keep a real gap between the selected and unselected tints. Past roughly 20% on
the unselected value the two states stop being distinguishable. If you prefer
subtle tints, turn on **Accent bar on the selected tab** instead — a bar reads
faster than a colour difference.

**Glass rim** is the difference between "glassy" and "just translucent".
Translucency alone tends to read as washed out.

Tabs have no blur of their own. In compact mode Zen's acrylic blurs the page
behind the whole sidebar, and every see-through tab shows it; a second blur per
tab cost a compositor pass each and added nothing you could see. Docked, nothing
moves behind the sidebar, so there is nothing to blur.

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
| Close button on the left | on | Hovering a regular tab swaps its icon for the close button. Pinned tabs keep their icon with the button beside it; Essentials keep their icon (the original mod left them blank) |
| Hide the pinned-tabs separator | on | SuperPins' *Show separator* controls the same line; set only one |
| Essentials favicon grows on hover | Medium (1.3×) | Off, 1.15×, 1.3× or 1.5×; it overshoots a little and settles, like Iconflow's icons (instant with reduced motion) |

## Tab strip

One wash across the whole sidebar rather than per tab, painted on the sidebar
itself (the floating panel in compact mode), so it reaches every edge and the
bottom bar. It always uses the workspace colour, since container colour only
exists per tab.

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
| Sidebar tint / fill strength | `0%` / `1` | docked gradient; off at 0% |
| Sidebar gradient direction | Top to bottom | |
| Glass sheen / glass rim | off / off | |
| Panel opacity | `70%` | dark and defined; `0%` is see-through |
| Panel colour | Neutral | Arc's plain dark glass; or the workspace colour, or a custom colour, mixed in at the accent tint |
| Panel border | Thin line | Arc's 1px edge, colour and width settable; or the tabs' glass rim; or none |
| Panel gradient direction / end / end tint / spread | Top to bottom / Flat / `8%` / `100%` | the same gradient model as a tab, flat by default |
| Glass sheen on the panel | off | |
| Workspace gradient through the panel | `0` | `1` lets Zen's gradient through, lighter and hazier |
| Panel shadow | on | Zen's own |
| Panel accent tint / corner radius | `10%` / `12px` | |
| Customise Zen's blur | off | Off keeps Zen's acrylic exactly as Zen sets it. On sets the four values below, see [Zen's blur](#zens-blur). Shown whether or not sidebar styling is on |
| Blur strength / brightness / saturation / contrast | `42px` / `0.25` / `1.1` / `1` | Zen's own values |
| Darken the sidebar's edges | Soft | Off, Soft, Medium or Strong: a shade painted just inside the compact sidebar's edges |
| Blur see-through pages too | on | A page made see-through (Transparent Zen, Zen Internet) leaves the sidebar's blur nothing to blur, so its text showed through sharp. While the compact sidebar shows, the page itself is blurred under it |

### Workspaces

The row of workspace icons at the bottom of the sidebar, in the same glass as
the tabs and window buttons. Pointing at an icon only ever moves the icon, so
the buttons beside it stay put. It moves like the rest of Glassflow: the glass
fades in 180ms, as on tabs, and icons grow on the spring the Essentials use,
one motion each (Zen's own shrink for dots is replaced, not stacked). While this is on, Arc 2.0's own workspace
styles are switched off (see [Other mods](#other-mods)).

| Setting | Default | |
|---|---|---|
| Style the workspace switcher | on | |
| Background | Glass capsule | None, or a capsule with the sheen and rim of Glassflow's glass |
| Pointed at | Grows | Stays still; Grows (the icon springs a little larger and settles); Dock (its neighbours grow a little too) |
| Other workspaces | Grey and faded (Zen's) | Faded colour, or full colour |
| Current workspace | Glass plate | As Zen marks it; a glass plate; a dot beneath; a glow |
| Steady dots | on | With more workspaces than fit, Zen shrinks the others to dots and widens the one you point at, pushing its neighbours; on, every dot keeps its width and shows its icon in place |

### Library button

The Library button's icon options moved to [Iconflow](../iconflow/), with the
other icon and hover-motion settings. Settings chosen here carry over.

### Zen's blur

Zen 1.23 blurs the page behind its compact sidebar and floating toolbar itself
(*acrylic elements*, on by default, and a row here): `blur(42px) saturate(110%)
brightness(0.25)`, over Zen's underlay, which lays the page on black or white
first so translucent pages still blur. That is the only live blur these mods
run. Tabs, folders and buttons sit on the panel and their see-through fills show
it; the overlays below and the other mods' glass use the same values.

Glassflow sets that blur on Zen's panels itself, on the same element and
property, so it stays one blur, and so another mod cannot remove it: Arc 2.0
replaces Zen's blur with its own *Compact sidebar blur*, which Glassflow used to
set to `0px`, leaving no blur at all. That value is now put back, and Glassflow's
blur wins on the panel. **Customise Zen's blur** changes the values. Glassflow's
panel needs **Panel opacity** below 100% for it to show through.

The sidebar's panel blurs without Zen's underlay, an SVG filter that a repaint
on the panel redrew unevenly. Glassflow used to draw the sidebar's blur on a
wider layer of its own, so the page did not show through clearer near the
panel's edges, but every repaint redrew that layer unevenly too, and its edges
flickered whenever the pointer moved over the sidebar. The panel now blurs
itself, as Zen's does. **Darken the sidebar's edges** shades the edges, which
also evens them out.

**Blur the page when the sidebar shows** (off) blurs the whole page while the
compact sidebar is out (`6px`, `160ms` fade by default), so the sidebar reads as
glass over content.

## Library

Tab styling also applies to the copies of each space's tabs in Zen's
Library (Spaces view), with the same settings. Style the cards around them
with the [Glassflow Library](../glassflow-library/) mod.

## Overlays

On by default. Glass behind what Zen floats inside the window, blurring whatever
is underneath with [Zen's blur](#zens-blur). Each surface has its own setting:
**Off** leaves it as Zen draws it, **Zen's blur** (the default) blurs without
darkening, since the glass brings its own fill, and **Zen's blur, darkened like
the sidebar** also applies the panel's brightness. All three follow **Customise
Zen's blur**.

| Surface | What changes |
|---|---|
| Library download stack (hover the library button) | Each entry gets glass. Zen fades the tabs out under the stack; they stay and show through blurred |
| Toasts | The accent fill turns translucent over a blur |
| Glance's side buttons | Translucent over a blur of the page |
| Library media preview | The dimmed window behind it is blurred too |
| Music player at the bottom of the sidebar | Glass; its title row floats over the tabs on hover |
| Download Prompt's question | Its own glass; this row only picks the blur |

| Setting | Default | Notes |
|---|---|---|
| Glass behind overlays | on | |
| Library download stack / Toasts / Glance's side buttons / Behind the library media preview / Music player / Download question | Zen's blur | Each: Off, Zen's blur, or darkened like the sidebar |
| Overlay fill | `55%` | `0%` is clear glass |
| Menu and panel fill (Windows 11) | `50%` | Zen's own value; lower shows more of the blur |
| Music player fill | the overlay fill | Any CSS colour. Mediaflow decides which rows the player shows |
| Glass status pill | on | The link address at the bottom of the page, as a floating glass pill. Turn off Arc 2.0's floating status bar so only one styles it |
| Status pill glass | Zen's blur | Off, Zen's blur, or darkened like the sidebar |
| Theme-coloured dialogs | on | Dialogs take the menu colour, their main button the accent colour |

Menus, context menus and panels (including the tab hover preview) are
separate windows, so CSS cannot blur what is behind them. On Windows 11 22H2
and later Firefox gives them Windows' own acrylic, which does, and Zen tints it
50%. On Windows 10, and on Windows 11 when title bars show an accent colour
with a custom inactive colour, Firefox turns that acrylic off and nothing can
blur behind menus.

Zen already blurs the floating urlbar (*acrylic elements*, on by default since
1.23b), the compact sidebar and notification bars. The share overlay is left
alone: the page under it is hidden, so there is nothing to blur.

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
| Glass sheen / rim | on / on | |
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

**Turn squircles off browser-wide** rounds the chrome, including Glassflow and
Groupflow surfaces set to **Follow Zen**. Explicit global or per-surface shape
choices still take precedence.

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

## Other mods

Other mods' settings are ordinary preferences, so Glassflow can set them. Each
row on the **Other mods** page switches off the settings of one mod that double
up with something Glassflow or Groupflow draws. It does so only while that part
of ours is on, and only for settings the other mod has actually written. The
value it finds is saved and put back when the row, or our part, is turned off.
A setting you change by hand in between is left as you set it. All rows are on
by default.

| Row | Switched off | While |
|---|---|---|
| Arc 2.0 | macOS-style buttons | Glassflow's window buttons are on |
| | Greyscale unloaded tabs | The Unloaded tab state is on |
| | Folder backgrounds, Arc tab groups | Groupflow is on |
| Arc 2.0 blur and transparency (also on *Blur and transparency*) | Compact sidebar fill | Sidebar styling is on |
| Arc 2.0 workspace icons | Workspace icon style, set to Disable | Style the workspace switcher is on |
| | Custom menu opacity | Overlays are on |
| Zen's unloaded-tab fade | `browser.tabs.fadeOutUnloadedTabs` | The Unloaded tab state is on |
| SuperPins | Unloaded dimming and strikethrough | The Unloaded tab state is on |
| Sidebar Expand on Hover | Fade sleeping tabs | The Unloaded tab state is on |
| Transparent Zen | Compact sidebar type set to Default (Push and Mask leave nothing to blur) | Zen's blur (acrylic) is on |

Left alone on purpose: Arc's font (it has no "off"), Arc's music player
background (a look you choose; it draws over the player glass), and
SuperPins' separator setting (the separator setting here hides it either
way). Tab Unloader has the row for Arc's own tab unloading.

## Compatibility

**Arc 2.0** — the *Other mods* page switches off its macOS style buttons while
Glassflow's are on: two mods drawing the same three circles fight over layout,
even though Glassflow wins the cascade. Its container glow can be hidden from
*Tabs, shared*.

**Other tab-styling mods** — Glassflow's id begins with `zz`, and Sine builds
`chrome.css` with a plain lexicographic sort of mod ids, so it imports last and
wins on source order. Sine also injects mod CSS as a `USER_SHEET`, and
user-origin `!important` outranks author-origin `!important`.

**Transparency mods** — Glassflow adds no blur over Zen's, so there is one pass
however the fills stack. If tabs look muddy, lower each state's tint or
opacity, and turn off any blur another mod adds to tabs.

**Transparent Zen** — use its *Normal* compact-sidebar mode for glass over
the page. *Mask* deliberately hides the page under the sidebar; *Push* moves
it away. Neither leaves the same page content beneath the panel to blur.

**Zen Turbo** — its *Smooth workspace switching* pauses transitions and
animations inside the tab strip during a workspace slide, with a 1500 ms limit
if Zen's animation marker sticks.

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

`glassflow.uc.js` initializes string and numeric CSS variables synchronously,
tracks native blur geometry, owns the optional snapshot fallback and restores
the Motion animation override. Current Sine also injects string variables,
asynchronously; Glassflow additionally covers numeric dropdowns. Booleans use
`-moz-pref()` directly.

Runtime checked in Zen 1.22.2b (Firefox 156). See the
[audit](../docs/AUDIT-2026-09-18.md) for source versions and rendering limits.

## License

MIT
