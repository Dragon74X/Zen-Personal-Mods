# Glassflow Library

For Zen's Library (Zen 1.23b and later): it can float the Library over the
page, changes the recent-downloads list above the Library button, and styles
the space cards in the Spaces view.

Settings are in pages: pick **Library window**, **Recent downloads**,
**Space cards** or **Everything** at the top.

## Library window

Zen's own Library always slides in on the tab bar's side and pushes the page
and the sidebar aside; Zen has no setting for anything else. Floating keeps
the page and sidebar where they are and opens the Library as a panel over
them.

| Setting | Default | Notes |
|---|---|---|
| Get the Library ready after startup | built | Zen builds the Library the first time it opens, so a session's first open is the slow one. **Built**: done a few seconds after startup while the browser is idle; until you first open and close it, its page stays built and up to date, as Zen keeps it for 30 seconds after any close. **Code only**: loads its code and stylesheet, nothing keeps running. **Off**: Zen's |
| Float the Library | off | off is Zen's sliding Library |
| Where it floats | the tab bar's side | or left, right, centre of the window |
| Space from the window's edges | `10px` | |
| Corner radius | `14px` | |
| Clicking outside closes it | on | the page included; Escape and the back arrow close it either way |

The panel takes Zen's window background, since it now covers the page. It
stays inside the browser window.

## Recent downloads

The list that rises above the Library button.

| Setting | Default | Notes |
|---|---|---|
| Show recent downloads | when pointing at the button | Zen's. **On click**: the first click shows the list and a click while it shows opens the Library; with no downloads a click opens the Library. **Never** hides it and the button just opens the Library |
| How many | `4` | Zen's is 4; up to 8 |
| Order | newest at the bottom | or newest at the top |
| Size | Zen's | row height, picture and text together |
| One box behind them | off | one panel instead of a pill per download. With Glassflow it is glass, Glassflow's overlay fill and blur, with nothing showing between the downloads (Glassflow > Overlays, dialogs and status). Without, it is solid, Zen's window colour, and the tabs fade out under it as in Zen |

While the list is up it sits above the rest of the sidebar. Mediaflow's
video preview steps aside for it.

Rows past Zen's four open their download on click, like Zen's; they have no
right-click menu and can't be dragged out.

## Space cards

The Spaces view shows every space's tabs side by side.
The cards hold copies of each space's tab strip. With **Glassflow** and
**Groupflow** installed, their tab glass and folder styling (headers, icons,
rails and connectors) already apply inside the cards and follow their own
settings. This mod styles the cards around them.

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

## Install

Add this folder's URL in Sine like the other mods. It works on its own; rim,
sheen and the downloads box use Glassflow's colours and glass when Glassflow
is installed.

## Notes

Clicking a folder header in a card opens or closes that copy only, as in
stock Zen. Groupflow's close and icon controls are not added to the copies:
they would act on the copy, not the real folder.
