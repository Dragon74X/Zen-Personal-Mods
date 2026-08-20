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

Anything without a matching rule is left alone, unless **Sort everything automatically** is on (it is, by default). Automatic mode groups an unmatched tab under its own domain, and with **Use subdomains as subgroups** on it nests by subdomain as well.

## Safety

**Tabs already in a group are skipped by default.** Routing only touches loose tabs, so anything you filed by hand stays where you put it. Essentials and pinned tabs are skipped too, each its own toggle.

Glance tabs, split-view tabs and Zen's blank placeholder tabs are skipped unconditionally — they are not toggles. Placeholders in particular cannot be grouped at all; `addTabGroup` returns null for them.

**Re-file tabs that drifted** (on) is the one exception to *skip grouped*. A link opened from a grouped tab inherits that group even when it goes somewhere unrelated, so a tab whose group path no longer matches where it belongs gets re-filed rather than stranded. A tab that ends up suffix-filed under junk gets exactly one repair attempt, then is left alone.

Routing happens on page load, not tab open — a new tab has no URL yet. A short configurable delay (400ms) avoids chasing redirects and filing a tab under the redirector instead of the destination.

Only `http` and `https` tabs are considered. `about:`, `file:` and `chrome:` are ignored.

## Sorting

Separate from routing, and applied after it. **Order groups and subgroups**
sorts alphabetically (default), by creation date, or not at all. **Loose tabs
above subgroups** (on) keeps a group's own tabs above any subgroups it
contains, rather than interleaved. **Follow Zen routes and containers** (on)
respects Zen's own container routing rather than fighting it.

`TabRouter.applyOrder()` re-runs just the ordering pass.

## Inspecting it

```js
TabRouter.preview()      // every tab and the group it WOULD go to -- moves nothing
TabRouter.explain()      // how the selected tab resolves: host, base, path segments, target
TabRouter.sortAll()      // run one routing pass now
TabRouter.applyOrder()   // re-sort groups and push loose tabs above subgroups
TabRouter.groups()       // group names currently in this window
TabRouter.groupTree()    // the nesting as text, copied to the clipboard
TabRouter.log()
```

`preview()` is the way to test rules safely: write them, check the output, then
enable routing. `explain()` is the same question for one tab, with the
intermediate steps shown — useful when a rule matches but the path does not
come out as expected.

### Writing rules from what you already have

```js
TabRouter.suggestRules()                   // one rule per domain you have open
TabRouter.suggestRules({ subdomains: true })  // plus a nested rule per subdomain
TabRouter.suggestRules({ minTabs: 2 })     // ignore one-off domains
TabRouter.suggestAliases()                 // slug = Pretty Name lines, from page titles
```

Both copy to the clipboard, ready to paste into the **Rules** and **Path name
aliases** boxes.

### Learned names

Automatic mode learns pretty names for path slugs from tab titles as it goes.

```js
TabRouter.learned()        // slug -> name, everything learned so far
TabRouter.forget("slug")   // drop one
TabRouter.forget()         // drop all of them
```

### When filing goes wrong

```js
TabRouter.diag()   // runs the eject experiment on the selected tab
```

`diag()` reports the Zen version, which grouping APIs exist on your build, and
whether a tab can actually be ejected from its group — everything needed to
work out why a level refuses to nest. Run it on a tab that is already in a
group, and it copies the result to the clipboard.

## Subgroups

Nesting uses real tab groups, never Zen folders, so nothing gets pinned. Automatic mode builds the path for you: `docs.proton.me` becomes **Proton / Docs**, and with path depth on, `nexusmods.com/games/stalker2` becomes **Nexusmods / Stalker 2**. Slugs are prettified (`crimson-desert` → Crimson Desert); slugs without word boundaries need an alias (`baldursgate3 = Baldur's Gate 3`) — `TabRouter.suggestAliases()` writes those from your page titles.

Path subgroups are opt-in per site: **Sites that get path subgroups** lists which domains they apply to (`youtube.com` by default), so a deep path on every other site does not explode into subgroups. **Nesting limit** caps the total depth regardless of what the rules ask for.

`TabRouter.groupTree()` prints the current nesting.

## Notes

Uses `gBrowser.tabGroups` and `gBrowser.addTabGroup`. Subgroup creation relies on `addTabGroup({ insertBefore: tab })` placing the new group at the tab's position — a tab already inside a group therefore produces a group nested inside it. If a level refuses to nest on your build, the log says so and the group is kept flat rather than lost. Group matching is by label, case-insensitive, so a rule pointing at a group you already made will use it rather than creating a duplicate.

If group creation is unavailable on your build, the log says so explicitly rather than failing silently. Turn off **Create groups that do not exist yet** to only ever use groups you made by hand.

## License

MIT
