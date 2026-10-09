# Iconflow

Icon sets and hover motion for [Zen Browser](https://zen-browser.app/).

- **Zen's own**: Zen's icons (or New Icons', when installed) keep their
  artwork and animate part by part on hover. Each button has its own
  choreography with a lead and a follow-through:
  - back slides, its arrowhead a beat ahead of its tail;
  - reload's arc whips round behind its arrowhead;
  - the downloads arrow lands in the tray and the tray gives;
  - history, recently closed and forget rewind like a clock: the ring turns back and the hands run back;
  - paste writes lines onto its clipboard; find lifts and tilts like a magnifier picked up;
  - the site settings sliders run along their tracks;
  - close and plus whip round from the middle.

  Iconflow reads each button's own artwork in your browser and draws its
  frames there, so it follows whichever icons you have; nothing is copied
  into this mod. The motion builds up from rest, overshoots, falls back and
  settles (the Linger timing), holds while hovered, plays back when the
  pointer leaves, and picks up mid-way. Fast slides leave a faint trail.
  **Animate icons** off keeps them still.
- **Animate menu icons** (off by default): icons in context menus and other
  menus, Zen's or those Context Menu Icons adds, move when highlighted.
  Items that match a toolbar button (Back, Reload, Bookmark, Copy, Save and
  so on) move the same way; the rest pop gently.
- **Circuit**, an animated icon set. Each icon plays its own 96-frame
  animation while hovered and plays it back when the pointer leaves.
  - High-tech glass. Shapes are chamfered, with every corner rounded, even
    on pointed shapes. Closed shapes are glass: a translucent body, a sheen
    across the top and a rim. Lines are neon tubes. On hover, a light runs
    round outlines and along tubes.
  - Motion starts from rest, builds up speed, overshoots and settles back,
    like a spring, with a slower, longer settle (Linger). Parts that move fast leave smooth trails that stretch
    with their speed. Lines morph into one another rather than fading.
  - No full circles (arcs are always open), clock faces or five-point stars.
- **Glass behind buttons**: plates made like Glassflow's window buttons,
  while hovered or always.
- **Hover motion** for whole buttons, with any icon set: close buttons,
  plus and minus buttons, the Library button, toolbar buttons and media
  controls.
- **Library button** icons, which moved here from Glassflow.
- **New tab button** options, which replace Better New Tab button.
- **Icon picker**: 158 coloured icons at the top of the SVG page of Zen's
  icon picker (spaces, folders, new spaces), in Glass, Tile or Solid and ten
  colours, with a search; and the icons of sites open in the space.

Settings open on one page at a time through **Show settings for**.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/iconflow
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config`.

## Icon set

| Setting | Default | Notes |
|---|---|---|
| Icon set | Zen's own | Zen's icons, or New Icons' if that mod is installed; or Circuit |
| Icon size | Large (20px) | Zen's 16px, 18, 20 or 22px. Toolbar and sidebar icons grow into the padding of their buttons, so the buttons keep their size; the Library button follows |
| Animate menu icons | off | Context menus and other menus |
| Animate icons | on | Off keeps every icon still: Zen's own, Circuit, menu icons, hover motion, the Library button and the new tab button's press. Iconflow also stays still when the system asks for reduced motion |
| Animation speed | Smooth (0.45s) | Quick 0.3s, Slow 0.7s |
| Glow on hover | on | A soft light in the icon's own colour while hovered, for Circuit and Zen's own; it rises with the motion |
| Soft glow around lines | on | Circuit's faint neon halo; off draws crisp lines only |
| Glass plates | Off | While hovered, or Always. A light fill, a sheen across the top and a rim, over Zen's own blur behind the sidebar. With Glassflow installed, its own sheen and rim are used, so plates follow its Glass settings |
| Plate shape | Squircle | Pill or Circle |

**Each button** can follow the set, or use Zen's own icon (still or
animated) or Circuit (animated or still; bookmark and downloads also as line art). These buttons are covered:
- **Navigation:** back, forward, reload, stop, home, the new tab buttons, the application menu, the workspace "⋯", compact mode, the sidebar toggle and expand sidebar.
- **Address bar and toolbar:** site settings, downloads, extensions, the bookmark ribbon (saved or not, and the bookmarks menu button), reader view, share and copy link, history (a timeline), screenshot.
- **Overflow:** the more-tools and bookmarks overflow chevrons, and "clear unpinned tabs".
- **Media player:** play and pause, next, previous, mute and unmute, close, and picture-in-picture.
- **Menus and panels:** the application menu's items (new tab, windows, history, bookmarks, downloads, passwords, add-ons, print, save, find, zoom, full screen, settings, more tools, help, quit) and the History panel's (recently closed tabs and windows, search, clear recent history, manage history).
- **Tabs:** the pinned tab reset (−), which narrows like zoom out.
- **Buttons you can add under Customise toolbar:** save page, print, find in page, open file, zoom in and out, cut, copy and paste, text encoding, email link, passwords, sync, send tab to device, import, settings, forget, new private window, Firefox View, developer tools, new window, full screen, Firefox's Library and your account.

**Reload** has a **style**:
- **Orbit pair** (the default): two glass diamonds circle the open arc at
  different speeds.
- **Twin comets:** two comets go opposite ways and nearly meet at the end.

Bookmarks are filled once the page is saved, in every style.

New Icons keeps working alongside Iconflow: with **Zen's own**, Iconflow
leaves every icon alone, so New Icons' show. With **Circuit**, Circuit
replaces the icons it covers.

Iconflow 1.3 dropped the Flow set. Releases up to 1.18.0 moved anyone using
Flow to Circuit; that step was retired in the 9 October 2026 audit
([docs/AUDIT-2026-10-09.md](../docs/AUDIT-2026-10-09.md)).

### How the icons animate

Icons that only turn, slide or scale (close, new tab, back and forward,
settings, zoom, minus) are one drawing moved by CSS on the same spring, so
the motion is recomputed every screen refresh. Turns keep one rule in every
set: closing, cancelling, removing and rewinding turn counterclockwise;
opening and adding turn clockwise. Every other icon is a strip of 96 frames on Zen's 18-unit icon grid, scaled up as
far as its shape allows so it fills Zen's 16px slot, saved as its
own file under `icons/`. Zen only loads the icons a rule uses, so
`icons.css` stays small. Iconflow counts through the frames with a
transition, so leaving the button plays the strip in reverse, and nothing
plays when a window opens. The count is a whole number, so a hover that
interrupts one still playing picks up from the frame shown and never slides
between two. Open arcs, trails and comet tails taper smoothly to a point. Lines use the toolbar's icon colour. `tools/iconflow-icons.py`
draws every icon, writes the strips, and writes their rules to `icons.css`.

## Icon picker

Zen's icon picker draws any icon whose address ends in `.svg` as a picture,
so Iconflow adds its own at the top of the picker's SVG page, above Zen's.
Above them: Glass, Tile or Solid, ten colour swatches and a search. Each
picked icon is saved as self-contained picture data, so it stays if Iconflow
is turned off. Pinned tabs keep Zen's own picker, which would turn these into
text.

| Setting | Default | |
|---|---|---|
| Coloured icons in Zen's icon picker | on | |
| Style | Glass | Glass (gradient line and body, with a sheen), Tile (white symbol on a coloured plate), Solid (filled, in a gradient) |
| Colour | Aurora | Aurora, Frost, Silver, Graphite, Sapphire, Aquamarine, Emerald, Amethyst, Ruby, Topaz |
| Site icons in the picker | on | The icons of sites open in the space, as they are. The picture is saved with the space and stays on your computer |

The style and colour can also be switched in the picker; both places set the
same settings. In the workspace switcher Iconflow's icons draw at 18px, a
little larger than Zen's 14px slot for emoji, since they fill their box. Site
icons picked under 1.17.0 had a glass plate of their own; it is taken off on
startup, keeping the picture.

## Hover motion

Hover motion moves the whole icon while it is hovered, whichever icon set is
in use.

| Group | Default |
|---|---|
| Close buttons (tab close, Glance close, media close, stop) | Spin |
| Plus buttons (new tab, the + beside the workspace icons) | Leave as it is |
| Minus buttons (pinned tab reset) | Narrow (like zoom out) |
| Library button | Spin |
| Other toolbar buttons | Leave as it is |
| Media controls | Leave as it is |

The motions are:
- **Spin:** half a turn, the same as Arc's spin of the +.
- **Full turn.**
- **Pop:** grows, then settles.
- **Press:** shrinks, then settles.
- **Pulse.**
- **Wiggle.**
- **Bounce.**
- **Ripple:** a ring spreads out from the icon.
- **Wave.**
- **Narrow:** the icon narrows and settles, like zoom out.

An icon that plays its own animation (an animated Circuit button, or a
Library button icon drawn by Iconflow) does not also take a hover motion,
so the two never stack. Zen's own icons, such as the tab close button, do.

**Leave as it is** keeps Zen's motion, or another mod's; Arc spins the +.
**None** stops all motion. **Motion speed** defaults to 0.25s, which is Arc's.

## Library button

The Library button is the button at the bottom of the sidebar that opens
downloads and the Library.

The choices are:
- **Follow the icon set** (the default): Zen's icon with Zen's own set, and Circuit stack with Circuit. Circuit stack is the Firefox Library icon itself, played at 16px like the other buttons.
- **Zen's animated icon.**
- **An animated outline of Zen's icon.**
- **Eight animated line shapes:** Layers, Hex scan, Focus, Grid, Chevrons, Orbit, Split and Pulse.
- **Circuit stack:** three glass plates pull apart while a light runs round the top one.
- **Layers, still.**

The shapes use Zen's own 36-frame sprite format, so Zen's hover animation
plays them. **Same size as the other buttons** draws the icon at 16px.

Releases up to 1.18.0 carried settings chosen in Glassflow 3.50 over once;
that step was retired in the 9 October 2026 audit
([docs/AUDIT-2026-10-09.md](../docs/AUDIT-2026-10-09.md)).

## New tab button

These replace Better New Tab button; remove that mod once this is installed.

| Setting | Default |
|---|---|
| Hide the New Tab text | on |
| Press effect | on |
| Turn the + when pressed | on |
| Even spacing around the button | on |
| Custom roundness | off (8px when on) |

Tab and folder roundness, which Better New Tab button also set, are
Glassflow's **Tab roundness** and Groupflow's **Header roundness**.

## Credits

Better New Tab button by themaster5209 suggested the new tab options. They
are written anew here; none of its code is used. Circuit and the Library
shapes are drawn for this mod. No New Icons artwork is used.

The icon picker's symbols are [Phosphor Icons](https://phosphoricons.com)
2.1.1 (duotone and fill), MIT License, Copyright (c) 2023 Phosphor Icons; see
`icons/phosphor-LICENSE.txt`. The colours and plates are Iconflow's.
