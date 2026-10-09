# Peekflow

Zen's tab hover preview, placed where you choose, with a picture of unloaded
tabs as you last left them.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Preview tabs on hover | On | Turns on Firefox's tab preview (`browser.tabs.hoverPreview.enabled`), which Zen ships off. |
| Where it opens | Beside the tab | Zen's default, or right, left, above, below, or any of the four diagonals of the tab you point at. If there is no room on that side, the preview moves to fit on screen. |
| Gap from the tab | 6 | Pixels between the tab and the preview, for every place but Zen's default. |
| Picture of the page | On | Loaded tabs show a live picture (`browser.tabs.hoverPreview.showThumbnails`). Off removes current pictures and stops new captures, including last views. |
| Last view of unloaded tabs | On | An unloaded tab shows the page as you last left it and how long ago that was. |

Unloaded tabs also get a line under the site: "Unloaded · seen 5 minutes ago",
or "last used" when there is no picture of them yet.

The current tab previews too. Firefox shows it without a picture, as you are
already looking at it; Peekflow takes one as you point at it (shown, not kept)
and the line reads "Current tab".

## Privacy

A tab is photographed once when its first load finishes, and again when you
switch away from it after looking at it for a second or more, always while it
is still loaded and at an idle moment: scrolling through tabs takes no pictures. Pictures are small JPEGs held in memory against the tab. They are never
written to disk, closing the tab or window drops them, and a private window's
pictures are gone when it closes. Tabs restored at startup have no picture until
you have visited them in this session.

## Turning it off

Peekflow sets the two Firefox switches above from its own settings. When Sine
turns Peekflow off in the final active window, it restores the previous values
and removes user overrides that did not exist before. Later manual edits to
the native switches survive settings refreshes and shutdown. Changing the
corresponding Peekflow setting applies that choice again.

Snapshots from versions before 1.2.1 lack the original override-presence flag;
their saved values are restored as user overrides on the first disable.

## Not included

Loading an unloaded tab when you point at it, to show a live picture. Firefox
already warms up loaded tabs on hover and prepares the connection for unloaded
ones; fully loading them would undo what unloading saves and fetch pages you
only pointed at. The last view covers the same need without that cost.
