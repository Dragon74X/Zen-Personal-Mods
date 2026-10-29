# Zen animated icons

Design resources: 114 animated glyphs covering every Zen toolbar, app menu, sidebar,
address bar and context menu icon, plus every icon the mods in this repository add.
Window close, minimize, maximize and restore are deliberately excluded and keep their
existing glyphs. Nothing here is wired into a mod; these files are artwork and motion only.

Each glyph runs in 10 motion styles, from simple to multi-step effects that spill past the
button's 24-unit box. Every style defines four states:

| State | Trigger | Meaning |
| --- | --- | --- |
| Rest | pointer away | the plain icon |
| Hover windup | pointer enters, or keyboard focus | anticipation; loops in Sketch, Glitch and Orbit |
| Hold | pointer or Enter/Space held down | the pressed pose; Burst trembles, Orbit speeds up |
| Release, return to rest | pointer or key released, then pointer leaves | the payoff, then a spring back to rest |

Toggle glyphs (app menu, bookmark star, fullscreen, sidebar, compact mode, pin, folder,
sound, pause/resume, play/pause) change state on release and rest in the new state.

## View them

Download [Zen-Motion-Icons.html](Zen-Motion-Icons.html) and open it in a browser. GitHub's
file view shows source and does not run it. The page has three views:

- **Library**: every glyph, grouped by where it appears, in the selected style. Hover,
  press and hold icons; auto-play cycles them. Select an icon name for its inspector:
  sampled frames, the same icon in all ten styles, its Iconflow action IDs, and a button
  that records a per-icon style pick. Tuning sliders change tempo, bounce, intensity,
  overflow reach and line weight.
- **Eye test**: about 25 rounds of "this or that". It finds a favourite style (each
  challenger against the current winner), then narrows pace, spring, strength, overflow and
  line weight, then asks which style suits menus, media controls and mod panels. Answers
  save as you go; the results screen can apply them to the library or copy them as JSON.
- **Picks**: the per-icon style choices made in the inspector.

The page respects the system reduced-motion setting and offers a button to play anyway.

## Styles

| Style | Tier | Motion |
| --- | --- | --- |
| Clean | Simple | One soft lift on hover, a firm press, a single spring back. The whole icon moves as one piece. |
| Glide | Simple | Each icon moves the way its action does: arrows travel and re-enter, refresh spins, bells swing, warnings shake. |
| Morph | Medium | The outline reshapes: hover leans toward the action shape, holding commits to it, release springs past and settles. |
| Line draw | Medium | Strokes retract and redraw along their own paths; release erases forward and draws the next shape in. |
| Jelly | Medium | Squash and stretch with a rippling outline; release wobbles back to rest. |
| Halo | Medium, overflows | Rings gather while held and ripple outward past the box on release. |
| Sketch | Medium | Hand-drawn boil while hovered, harder scribble while held, redraw on release. |
| Glitch | Complex | Offset ghost copies flicker on stepped timing, the outline snaps to a pixel grid, release tears and resolves. |
| Orbit | Complex, overflows | Satellites on a tilted orbit wider than the icon; they tighten and speed up while held and fling outward on release. |
| Burst | Complex, overflows | Pieces part on hover, gather and tremble while held, then blast past the box with a shockwave and sparks before reassembling. |

## Files

| File | Purpose |
| --- | --- |
| `glyphs.js` | Glyph geometry, groups, where each icon is used, and the map from every `iconflow/morph.json` action ID to a glyph |
| `motion.js` | Spring engine, the ten styles, headless sampler and pointer driver |
| `page.html` | Library, inspector and eye test (loads the two scripts above) |
| `build.cjs` | Generates everything below; `--check` verifies it |
| `Zen-Motion-Icons.html` | Generated standalone page with both scripts inlined |
| `svg/<style>/<icon>.svg` | Generated per-style assets: rest pose, plus live motion when opened directly |
| `svg/static/<icon>.svg`, `<icon>--on.svg` | Generated still artwork; `--on` is a toggle's second state |

An `svg/<style>/` file shows its rest pose anywhere an SVG image works. Opened as its own
document from a checkout, it loads `../../glyphs.js` and `../../motion.js` and responds to
hover, press and release. Image contexts (`<img>`, CSS `list-style-image`) never run
scripts, so they show the rest pose only.

## How the motion works

Every glyph is a function of one value `k`: 0 is the rest shape and 1 is the action shape,
or the other state of a toggle. Paths use only `M`, `C` and `Z`, so any two values of `k`
interpolate point for point. A style turns that geometry into named poses (path points,
translate, rotate, scale, opacity, stroke draw and offset, line weight, fill) and timed
beats per state. Effects that leave the box (rings, satellites, sparks, ghosts) are extra
parts with their own poses.

The engine steps an exact damped spring per channel, following the critically damped step
in `resources/iconflow/motion-engine.js` on the `resources` branch, with an added damping
ratio for overshoot, a held state, loops and spin drives. Position and velocity survive
every retarget, so leaving or pressing mid-animation continues from the current pose
without a jump. Rotation takes the nearest equivalent turn, and a fast spin keeps its
direction. One animation-frame loop serves every active icon; settled icons stop costing
anything.

## Build and check

Run from the repository root with Node.js (no package dependencies):

```sh
node resources/animated-icons/build.cjs
node resources/animated-icons/build.cjs --check
```

`--check` also runs as `tools/animated-icons.test.mjs` in `node --test tools/*.test.mjs`.
It fails when an Iconflow action ID has no glyph, when a glyph changes path topology
across `k`, when any of the 1,140 icon and style combinations does not return exactly to
rest after a full hover, hold, release and leave cycle, or when generated files are stale.

## Limits

Verified in headless Chromium and Node only. Firefox/Zen rendering, desktop frame pacing
and 16 px toolbar legibility still need checking on a real Zen window. Integration would
need a host that lets overflowing effects draw outside the toolbar button, and a decision
between running this engine in chrome or baking frames the way Iconflow's Morph strips do.
