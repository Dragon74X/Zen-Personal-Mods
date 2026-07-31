# Tab Router

Sorts tabs into nested tab groups -- groups and subgroups -- by domain and URL path, using rules you write once, or fully automatically.

Requires `sine.allow-unsafe-js` set to `true`.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/tab-router
```

## Rules

One per line, or separated by semicolons:

```
github.com, gitlab.com > Dev
youtube.com, twitch.tv > Watch
docs.google.com, sheets.google.com > Work
```

Left of the `>` is a comma-separated list of domains; right of it is the group name. A name containing the separator nests: `Work / Email` files the tab into an **Email** subgroup inside a **Work** group, created as needed. Subdomains match automatically — `github.com` also catches `gist.github.com`. The first matching rule wins, so put narrower rules first.

Anything without a matching rule is left alone, unless **Group anything without a rule by its domain** is on.

## Safety

**Tabs already in a group are skipped by default.** Routing only touches loose tabs, so anything you filed by hand stays where you put it. Essentials, pinned tabs, Glance and split-view tabs are skipped too, each independently.

Routing happens on page load, not tab open — a new tab has no URL yet. A short configurable delay avoids chasing redirects and filing a tab under the redirector instead of the destination.

Only `http` and `https` tabs are considered. `about:`, `file:` and `chrome:` are ignored.

## Inspecting it

```js
TabRouter.preview()   // every tab and the group it WOULD go to -- moves nothing
TabRouter.sortAll()   // run one pass now
TabRouter.groups()    // group names currently in this window
TabRouter.log()
```

`preview()` is the way to test rules safely: write them, check the output, then enable routing.

## Subgroups

Nesting uses real tab groups, never Zen folders, so nothing gets pinned. Automatic mode builds the path for you: `docs.proton.me` becomes **Proton / Docs**, and with path depth on, `nexusmods.com/games/stalker2` becomes **Nexusmods / Stalker 2**. Slugs are prettified (`crimson-desert` → Crimson Desert); slugs without word boundaries need an alias (`baldursgate3 = Baldur's Gate 3`) — `TabRouter.suggestAliases()` writes those from your page titles.

`TabRouter.groupTree()` prints the current nesting.

## Notes

Uses `gBrowser.tabGroups` and `gBrowser.addTabGroup`. Subgroup creation relies on `addTabGroup({ insertBefore: tab })` placing the new group at the tab's position — a tab already inside a group therefore produces a group nested inside it. If a level refuses to nest on your build, the log says so and the group is kept flat rather than lost. Group matching is by label, case-insensitive, so a rule pointing at a group you already made will use it rather than creating a duplicate.

If group creation is unavailable on your build, the log says so explicitly rather than failing silently. Turn off **Create groups that do not exist yet** to only ever use groups you made by hand.

## License

MIT
