# Iconflow design resources

23 monochrome themes, 6 actions per theme, 138 toolbar buttons. Snapshot: 2026-10-05.
Actions: Back, Reload, Download, Bookmark, History, Library.

## Preview

Download [Iconflow-Theme-Explorer.html](Iconflow-Theme-Explorer.html), then open it
in a browser. GitHub's file view displays source and does not run the preview.
The HTML embeds its SVG, JavaScript, CSS, and 4 reference image sheets; no server,
installation, or external assets are required.

Hover or click buttons. Each theme includes an action selector, Rest/Hover/Click
poses, 4 sampled click frames, and 16 px / 18 px previews. Motion can be disabled
or slowed; the system reduced-motion setting is respected.

These files are design resources. They do not install a Zen/Sine theme or replace
the repository's [Iconflow mod](../../iconflow/).

## Source and build

Run from the repository root with Node.js. Verified using Node.js 24.19.0;
0 package dependencies.

```sh
node resources/iconflow/build-motion.cjs
node resources/iconflow/check-iconflow-motion.cjs
```

| File | Purpose |
| --- | --- |
| `Iconflow-Theme-Explorer.html` | Generated, standalone preview |
| `motion-*-art.js` | 5 theme families: SVG paths, part connections, state poses, event sequences |
| `motion-engine.js` | SVG generation, masks, circular/elliptical flow, spring transitions, preview controls |
| `motion-shell-base.html` | Page layout and embedded reference sheets |
| `references.json` | Theme labels and reference-image crop coordinates |
| `build-motion.cjs` | Generates the preview from source |
| `check-iconflow-motion.cjs` | Offline geometry and event-runtime checks |

Edit source, then rebuild. Static SVG mask IDs are deterministic; live previews
use a separate ID namespace. Rebuilding unchanged source produces unchanged HTML.

## Integration boundary

Artwork uses SVG `currentColor`. Animation requires the part paths, flow tracks,
occlusion masks, state poses, and event sequences; a static SVG export contains
only one pose. The preview runs one shared animation-frame scheduler and stops
when active transitions settle.

Zen integration still requires binding selected designs to toolbar actions and
validating their sizing, focus behavior, and lifecycle in the browser. Preview
cards clip overflow; effects crossing toolbar controls need an integration layer
that supports that drawing area.

## Verification

The offline check covers 23 themes, 138 buttons, 1,128 parts, 389 declared seams,
4-frame storyboard generation, winding anchors, depth masks, interrupted motion,
input timing, reduced motion, and settlement. SVG stills were inspected during
design work. Live browser rendering and Zen integration remain untested.

Motion-study links and original-image comparisons are embedded in the preview.
