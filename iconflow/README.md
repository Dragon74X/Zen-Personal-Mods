# Iconflow

Icon sets and hover motion for [Zen Browser](https://zen-browser.app/).

- Two animated icon sets, each icon playing its own 48-frame animation
  while hovered and playing it back when the pointer leaves:
  - **Flow**: clean line icons with softened corners, round line ends and
    squircle-like rectangles.
  - **Circuit**: high-tech glass. Shapes are chamfered, with every corner
    rounded, even on pointed shapes. Closed shapes are glass: a translucent
    body, a sheen across the top and a rim. Lines are neon tubes. On hover,
    a light runs round outlines and along tubes.
  - Neither set uses full circles (arcs are always open), clock faces or stars;
    the bookmark is a ribbon.
- **Glass behind buttons**: plates made like Glassflow's window buttons,
  while hovered or always.
- **Hover motion** for whole buttons, with any icon set: close buttons,
  plus and minus buttons, the Library button, toolbar buttons and media
  controls.
- **Library button** icons, which moved here from Glassflow.
- **New tab button** options, which replace Better New Tab button.

Settings open on one page at a time through **Show settings for**.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/iconflow
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config`.

## Icon set

| Setting | Default | Notes |
|---|---|---|
| Icon set | Zen's own | Zen's icons, or New Icons' if that mod is installed; Flow; or Circuit |
| Animate icons on hover | on | |
| Animation speed | Smooth (0.45s) | Quick 0.3s, Slow 0.7s |
| Circuit icons glow on hover | on | A soft light in the icon's own colour, like a lit neon tube |
| Glass plates | Off | While hovered, or Always. A light fill, a sheen across the top, a rim and an 8px blur of what is behind. With Glassflow installed, its own sheen and rim are used, so plates follow its Glass settings |
| Plate shape | Squircle | Pill or Circle |

**Each button** can follow the set, or use Zen's own icon, Flow (animated or
still), or Circuit (animated or still). These buttons are covered:
- **Navigation:** back, forward, reload, stop, home, the new tab buttons, the menu and workspace "⋯", the sidebar toggle and expand sidebar.
- **Address bar and toolbar:** site settings, downloads, extensions, the bookmark ribbon (saved or not), reader view, share and copy link, history (a stack of pages), screenshot.
- **Overflow:** the more-tools and bookmarks overflow chevrons, and "clear unpinned tabs".
- **Media player:** play and pause, next, previous, mute and unmute, close, and picture-in-picture.

New Icons keeps working alongside Iconflow: with **Zen's own**, Iconflow
leaves every icon alone, so New Icons' show. With **Flow**, Flow replaces
the icons it covers.

### How Flow animates

Each icon is a strip of 48 frames on Zen's 18-unit icon grid, saved as its
own file under `icons/`. Zen only loads the icons a rule uses, so
`icons.css` stays small. Iconflow steps through the strip with a transition,
so leaving the button plays the strip in reverse, and nothing plays when a
window opens. Lines use the toolbar's icon colour. `tools/iconflow-icons.py`
draws every icon, writes the strips, and writes their rules to `icons.css`.

## Hover motion

Hover motion moves the whole icon while it is hovered, whichever icon set is
in use.

| Group | Default |
|---|---|
| Close buttons (tab close, Glance close, media close, stop) | Spin |
| Plus buttons (new tab, the + beside the workspace icons) | Leave as it is |
| Minus buttons (pinned tab reset) | Pop |
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

**Leave as it is** keeps Zen's motion, or another mod's; Arc spins the +.
**None** stops all motion. **Motion speed** defaults to 0.25s, which is Arc's.

## Library button

The Library button is the button at the bottom of the sidebar that opens
downloads and the Library.

The choices are:
- **Follow the icon set** (the default): Zen's icon with Zen's own set, Layers with Flow, and Circuit stack with Circuit.
- **Zen's animated icon.**
- **An animated outline of Zen's icon.**
- **Eight animated line shapes:** Layers, Hex scan, Focus, Grid, Chevrons, Orbit, Split and Pulse.
- **Circuit stack:** three glass plates pull apart while a light runs round the top one.
- **Layers, still.**

The shapes use Zen's own 36-frame sprite format, so Zen's hover animation
plays them. **Same size as the other buttons** draws the icon at 16px.

Settings chosen in Glassflow 3.50 carry over.

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
are written anew here; none of its code is used. Flow, Circuit and the
Library shapes are drawn for this mod. No New Icons artwork is used.
