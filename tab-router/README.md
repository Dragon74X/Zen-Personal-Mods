# Tab Router

Sorts tabs into nested tab groups -- groups and subgroups -- by domain and URL path, using rules you write once, or with automatic rules.

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

Routing starts as soon as the tab's URL is known, without waiting for page load.
Events within one event-loop turn share a single route using the latest URL;
title changes cannot postpone it. Redirects and SPA navigation route again as
their destination becomes known. The old **Wait before routing** setting is
removed; saved values no longer add a delay. Group ordering has its own timer.

Only `http` and `https` tabs are considered. `about:`, `file:` and `chrome:` are ignored.

## Sorting

Separate from routing, and applied after it. **Order groups and subgroups**
sorts alphabetically (default), by creation date, or not at all. **Loose tabs
above subgroups** (on) keeps a group's own tabs above any subgroups it
contains, rather than interleaved. **Follow Zen routes and containers** (on)
uses the destination workspace's container.

For a new tab's first HTTP GET, the native request observer checks Zen's domain
rule before the response loads. If the tab inherited another container, it
opens the request in the routed workspace's container and closes the blank tab.
This also covers `target="_blank"` links, whose destination is unknown when Zen
creates the initial `about:blank` tab. It works without a Tab Router group rule;
Zen's domain matcher selects the destination. POSTs, form submissions, their
redirects, and session restoration are excluded from this first-request path.
External links that redirect to a matching domain follow that same path: the
router remembers the original request until the first page commits. Zen clears
its initial-document flag at a redirect, so relying on that flag alone missed
these container changes. Only that recorded redirect chain can use this path;
later navigation in a loaded page still gets the session-state checks.

For already-loaded pages, a container change waits for the load to finish, then flushes session
state. Ordinary iframes do not block it. Tabs with back history, form state,
session storage, or POST data (including nested frames) keep their current
container. The native close veto remains active. Group/workspace filing
proceeds immediately, including while a page is loading. A pending
container check retries on network completion even if the tab has already been
filed and **Re-file tabs that drifted** is off. Pending tabs do not influence
their destination group's container choice. Already-filed tabs with a matching
rule can also repair a container mismatch; deeper manual subgroups are preserved.
`sortAll()` returns a Promise;
use `await TabRouter.sortAll()` when you need completion.

`TabRouter.applyOrder()` re-runs just the ordering pass.

## Splitting YouTube by creator

A watch address names the video and never the channel, so no path rule can
split YouTube tabs by creator. **Subgroup by creator** asks YouTube's oEmbed
endpoint for the video's author — one ~1KB JSON request per *new* video, no
key — and files the tab as *Youtube / Creator*. Off by default.

What the request is, exactly, because it is a network request:

- **Built inside the tab's container.** The channel carries the tab's
  `userContextId`, so its cache entry lives in that container's partition and
  is not visible from any other container.
- **Anonymous.** `LOAD_ANONYMOUS` strips cookies in both directions: YouTube
  receives no account cookies from this lookup and it writes no cookie back.
  The request still exposes your network address and the requested resource.
- **Bounded.** Section pages read at most 1 MiB so metadata after a site's
  inline styles is reachable; other requests remain capped at 512 KiB. Each gives up
  after fifteen seconds, and a picture that decodes larger than 4096
  square is refused before it is drawn.
- **Never from a private window.**
- Creator names are cached by video ID, so `&t=` timestamps do not create extra
  entries. Missing avatars can repeat the oEmbed lookup for the channel URL.
  Failed requests or unusable metadata have a 10-minute retry cooldown.

**Pictures on tabs and subgroups** operates independently of movement and
**Subgroup by creator**. It includes pinned tabs, Essentials and already-grouped
tabs. Enable Groupflow to render the pictures. Zen's manual tab icons take
precedence; loading/audio/PiP controls and native favicons remain native.
Navigation, picture disable and Router unload remove owned overrides. Library
copies display the same token but never route.

Cache keys use container IDs and verified subject URLs, not folder names.
Different channels named alike get separate automatic groups and pictures;
renaming a managed group preserves its association. Groupflow saves semantic
ownership in its existing `groupflowGroups` window record. Historical groups
without identity remain unmanaged; their names and member tabs do not establish
ownership. Their pictures recover when the folder name matches a verified
member subject and every live member agrees on its picture and container.
This changes presentation only; root site folders and mixed subjects retain
favicons. Groupflow persists the recovered picture and container independently
of routing ownership. Label-only picture caches are refetched from verified
member URLs because the old format contains no subject or container identity.
Manual subfolders below a matching root keep their placement.

One pending metadata request retains all interested tabs in its container.
Completion checks each tab's current navigation; closed or navigated-away tabs
are not routed. Failed requests retry on activity after 10 minutes. There is no
periodic retry. Clearing history cancels requests and removes learned pictures
without starting another lookup.

```js
TabRouter.creators()          // container:resource -> verified subject record
TabRouter.forgetCreators()    // clear metadata and pictures
TabRouter.forgetCreators(id)  // remove this video/resource in each container
```

`zzrouter.creators` retains at most 300 metadata records; `zzrouter.avatars`
retains at most 100 subjects with 64px icons and optional 384px-wide banners.
Anonymous requests use the tab's container.
Private windows start **0** metadata/image requests and persist **0** new records.
Literal IPs, local hostnames, URL credentials and non-HTTPS lookup/redirect
targets are rejected; the hostname check does not classify DNS results.

### Nexus game and author hierarchy

Enable URL path subgroups and include `nexusmods.com` in the allowed domain list.
Game/mod/file pages use **Nexus / Game**; profiles with verified source context
use **Nexus / Game / Author**. Both author folders and profile tabs use the game
cover, with **0** author-avatar requests. A one-level explicit root rule such as
`nexusmods.com > Mods` retains that root; explicit multi-level destinations remain
fixed. The nesting limit still applies.

Context comes from the preceding game URL, actual opener, restored semantic
ancestry, or one optional `zzrouterNexus` tab record for profiles whose placement
cannot reconstruct their game. No selected-tab inference or global author/game
mapping. Explicit numeric `gameId` filters use cached game metadata or Nexus's
anonymous public GraphQL `game(id:)` query. Native container replacement transfers
context, while author nesting itself keeps the tab's container.

Navigating from an automatic author group to a same-game mod exits the Author
level. Manual deeper folders remain intact. Direct profiles without a game keep
existing placement; newly opened unresolved profiles stay directly in the Nexus
root. Navigation away from Nexus clears inherited context.

### YouTube Music names

Music `/browse/` and `/playlist` collections use names from canonical page
metadata. Opaque IDs stay internal; missing or inaccessible metadata leaves the
tab at its configured destination. Explicit hierarchy, aliases, punctuation and
non-Latin names remain intact. Playback/tab-title changes cannot rename a
collection. Verified track channels can supply pictures; album artwork is never
used as an artist portrait. No artist/album/playlist hierarchy is imposed.

## Inspecting it

```js
TabRouter.status()       // what routed, what did not, and why -- copied to the clipboard
TabRouter.preview()      // every tab and the group it WOULD go to -- moves nothing
TabRouter.explain()      // how the selected tab resolves: host, base, path segments, target
await TabRouter.sortAll() // run a routing pass and wait for container checks
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

Start with `status()`. It reads only — nothing moves — so it is safe to run the
moment something looks off, and it copies itself to the clipboard.

Its **stalled** list is the one to read first: tabs that are not skipped, do
have a target, and are still not under it. Those are the tabs the mod was
supposed to file and did not. Everything else in the report explains why —
the skip histogram, whether the navigation listener is still attached, and the
last forty log lines.

`instanceGeneration` above 1 means this window loaded the script more than
once. The mod retires the older copy when that happens, so a high number is a
record of re-injection rather than of copies running at the same time.

```js
TabRouter.status() // read-only; stalled tabs, skip reasons, recent log
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

If group creation is unavailable on your build, the log says so explicitly rather than failing silently. Turn off **Create groups that do not exist yet** to only ever use groups you made by hand. A rule naming a group that does not exist then leaves the tab where it is: no container reopen, no workspace move, no leaving its current group. If only a subgroup is missing, the tab still goes into the existing parent.

## When Sine says it cannot read a mod's preferences

Sine installs one mod out of a multi-mod repository by moving the folder it
wants through a fixed `chrome/sine-mods/temp` path, deleting the rest of the
extracted repository, then moving it into place. Two installs at once -- the
startup auto-update is several at once, and every mod in this repository takes
that path -- can leave one mod's folder nested inside another's, or stranded
in `temp`. Sine then looks for it where it should be, finds nothing, and warns
`Failed to read preferences for mod <id>` on every rebuild.

Every mod now includes a session-scoped Sine update guard. It serializes
install/update operations and waits for file replacement before preference
reads. Tab Router no longer moves stray folders: that scan could steal an
active update's staging folder. See [update recovery](../README.md#sine-update-recovery)
for the one-time bootstrap and existing missing folders.

## License

MIT

## October 2026 update

Existing tab/folder menus offer Why here?, Preview sorting, Keep here / Resume routing, and eligible Refresh automatic picture. Locks persist through native tab values or Groupflow session metadata without suppressing picture/title updates. Verified local pictures decorate native search results without requests per keystroke. Tools exposes rule generation, validation, and editing; invalid edits preserve stored rules. Requests share bounded process ownership while revalidating each consumer; affected picture writes/repaints coalesce. Sorting skips already-correct nodes.

## Nexus artwork (1.37.0)

**Nexus game icon** defaults to the site's square `thumbnail.jpg`, with **Cover**
as an option. A canonical game page and its numeric artwork ID must agree before
any rendition is used. Existing cached covers remain visible while thumbnails
load; unavailable thumbnails fall back to covers. V1 artwork retains its cover.
Manual icons retain priority. “Refresh automatic picture” retries the preferred
source and refreshes an enabled banner while retaining usable cached artwork.

**Nexus game banners** offers **Off** (default), **Folders**, **Tabs**, or
**Folders and tabs**. **Banner opacity (%)** accepts 0–100, default 25. Artwork
sits beneath existing tint, sheen and rim layers; text, controls, loading/media
indicators, corner geometry, hover and selection styling remain unchanged.
Update Groupflow and Glassflow alongside Router for these layers.

Only the game's `hero.jpg` is used—not promotional strips or mod-author images.
Nexus documents [V2 artwork](https://graphql.nexusmods.com/#definition-ArtworkSchemaV2)
and [thumbnail/cover URLs](https://github.com/Nexus-Mods/Vortex/blob/master/docs/game-art-assets.md).
The downloaded banner is decoded, limited to 4096 pixels per source dimension,
and scaled to 384 pixels wide. Icons and optional banners share the existing
100-subject, 900000-character cache; banners are discarded before icons at the
size limit. A failed request retries on activity after 10 minutes. Off starts
no banner requests; private windows start no artwork requests. Container
partitioning, anonymous requests and the 15-second timeout remain in force.

Recovered display associations continue through Groupflow's session mechanism.
Artwork changes never claim routing ownership, rename/reparent folders, or move
tabs. Opacity changes reuse cached raster bytes without fetching another image.
