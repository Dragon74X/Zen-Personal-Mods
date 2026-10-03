# Glassflow Library

Styles the space cards in Zen's Library (Zen 1.23b and later): the Spaces
view that shows every space's tabs side by side.

The cards hold copies of each space's tab strip. With **Glassflow** and
**Groupflow** installed, their tab glass and folder styling (headers, icons,
rails and connectors) already apply inside the cards and follow their own
settings. This mod styles the cards around them.

## Install

Add this folder's URL in Sine like the other mods. It works on its own; rim
and sheen use Glassflow's colours when Glassflow is installed.

## Space cards

| Setting | Default | Notes |
|---|---|---|
| Card fill | `70%` | Zen draws `100%`; lower lets the window background through |
| Space gradient strength | `1` | the space's own gradient; `0` hides it |
| Glass rim | on | Glassflow's rim colours when installed |
| Glass sheen | off | Glassflow's sheen when installed |
| Card shadow | on | Zen's own |
| Corner radius | `14px` | follows Zen's squircle corners when those are on |
| Card width / space between cards | `242px` / `24px` | Zen's sizes |
| Space name size | `13px` | |

There is no blur setting. The cards sit on the window background, a smooth
gradient, so a backdrop blur would have nothing to blur.

## Notes

Clicking a folder header in a card opens or closes that copy only, as in
stock Zen. Groupflow's close and icon controls are not added to the copies:
they would act on the copy, not the real folder.
