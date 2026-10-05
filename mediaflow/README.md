# Mediaflow

Everything about Zen's music bar, the player card at the bottom of the
sidebar:

- **Video preview.** While a video plays in another tab, a live preview of it
  sits above the player, with optional captions and a button to hide it.
- **Music bar options.** Keep the title and progress always showing, or hide
  any of its rows.

Colour and glass behind the player are Glassflow's, under **Overlays**, so
every colour setting lives in one place.

## Where it came from

Mediaflow joins two mods:

- **Zenslop** by Rishu Sharma ([Firebolt9907/Zenslop](https://github.com/Firebolt9907/Zenslop), MIT), forked from 1.2.0.
  The original's `theme.json` has no `updatedAt`, so Sine never offered its
  updates. Installs stayed on 1.1.1, which breaks on Zen 1.23b and leaves
  space under the tab list that cannot be used to move the window.
- **Better Music Bar** by rasyidrafi ([zen-always-show-music-bar](https://github.com/rasyidrafi/zen-always-show-music-bar), Apache 2.0).
  Its selectors target ids that Zen 1.23b replaced with a card layout, so
  only its background rule still applied. Its options are rewritten here for
  the card markup.

## Install

Remove **Zenslop** and **Better Music Bar** first, then add this folder's
URL in Sine. Your settings from both carry over, once.

If you had installed this repository's Zenslop fork, you do not need to do
anything: its next update turns it into Mediaflow.

## Changes from the originals

- Releases carry `updatedAt`, so Sine updates them like the other mods here.
- Internal names (window actor, resource alias, controller) are its own, so it
  cannot collide with the original Zenslop if both are installed.
- The mod finds its folder through Sine's registered chrome URL instead of a
  hardcoded profile path, so it works under Sine and Cosine alike.
- With **Always show title and progress** on, the player is measured again
  whenever its size changes, so the expanded rows push the tab list up
  instead of covering tabs.
- The preview sits in front of the tabs. With **Make room above the preview**
  on, its room is made just above the music bar instead, as space the tab list
  gives up, rather than by setting the tab list's height. On Zen 1.23b the bar
  follows the tab list, so the old way shrank the list to nothing and pushed
  the bar and a small preview to the top of the sidebar.
- Groupflow refits its folders when the preview takes or gives back room.
- The preview and its captions hang from their bottom edge and move with the
  bar frame by frame, instead of easing after it. They keep clear of the room
  the bar's hover rows rise into, so pointing at the bar moves nothing and
  the edge between the two stays put under the pointer. (The first time the
  rows open with a new set of cards, the preview may rise once.)
- Zen makes a music card only as a tab starts making sound, and only if the
  page's media controls are ready at that moment, so a video could play in a
  background tab with no bar at all. Mediaflow asks Zen again for a few
  seconds after a tab starts or stops sound, or loses its card.

## Settings

| Section | Setting | Default |
|---|---|---|
| Video preview | Video quality | 360p |
| | Frame rate (no frames are copied while the music bar can't be seen, such as compact mode's hidden sidebar) | 15 fps |
| | Captions | Follow YouTube |
| | Captions while the preview is hidden | off |
| | Grow on hover (1.5×, 2×, 3×, half the window, or off) | 2× |
| | Click the preview to go to its tab (switching workspace if it is in another) | on |
| | Make room above the preview (off: it sits in front of the tabs; on: the tab list ends above it) | off |
| Music bar | Always show title and progress | off |
| | Keep the player's size when pointed at (no extra space around the title and progress rows on hover) | on |
| | Hide the title row (also hides picture-in-picture and close) | off |
| | Hide the progress bar | off |
| | Hide the playback buttons | off |
| | Hide the floating music notes | off |

Hiding the title row, progress bar and playback buttons together hides the
player entirely.

## License

The MIT License (MIT)

Copyright (c) 2026 Rishu Sharma

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
