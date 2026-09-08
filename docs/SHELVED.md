# Shelved work

Removed to rule them out as the cause of a stutter that lands shortly after a
page loads -- not because they were wrong. Everything here worked and was
tested. Restore with `git show <sha> -- <path>` against the commits below.
The code, its comments and its tests are all in history; this file keeps the
reasoning with them.

## Creator subgrouping -- Tab Router

*Youtube* became *Youtube / Rick Astley*, with the name read from the page
itself: a site playing media registers a `MediaSession`, Firefox exposes it to
chrome as `browsingContext.mediaController`, and `getMetadata().artist` is the
channel. Zen reads the same object for its sidebar media card. No network, no
service, no key.

- `e458118f297d` -- the feature
- `184298188acf` -- the fix that made it work on background tabs

Two things it had to handle, both solved:

- **The name arrives late.** The session registers when the player initialises,
  so a tab files under its base path first and moves afterwards. A path still
  missing its creator must not be cached, or the tab stays put for as long as
  its URL is unchanged.
- **Unloading destroys it.** A discarded tab loses its media controller, so
  answers were remembered, keyed by video id so a `&t=` timestamp could not
  fragment one video into many entries.

Confirmed on the user's build (Zen 1.22b): on a playing tab the read returns
the channel name. On a controller that is not active -- paused, or not the tab
that is playing -- `getMetadata()` **throws `NS_ERROR_NOT_AVAILABLE`** rather
than returning null. Three states, not two. Zen guards this with
`mediaController.isActive` before reading; a rebuild should do the same and
hook the `activated` event Zen's media card already listens to, instead of
the retry loop the shelved version used.

**The real limit, confirmed:** the name exists only while the tab is actually
playing. A background tab that has never played has no active controller and
never will until it does, so no amount of retrying reaches it. The "timing
bug" framing above was half right: the retry helps a tab that is about to
play, and cannot help one that never does. Once played, the cached answer
covers it from then on.

So the zero-cost route sorts what you watch, not what you open. Filing a
never-played tab by creator needs the name from somewhere else: YouTube's
oEmbed endpoint (one ~1KB request per new video, no key, returns
`author_name`) or the page DOM through a JSWindowActor. Both are the
network/actor tier with the cookie and container caveats already noted.

Why shelved: it routed on every navigation and re-checked a session-less media
tab twelve times at 2.5s intervals -- per-page-load work in the same window as
the stutter. Suspected, not proven. Its cache (`zzrouter.creators`) was a
record of what had been watched and is cleared on load now.

## Automatic group images -- Groupflow

- **Page image** -- the `og:image` a page advertises, already stored by
  Firefox in `moz_places.preview_image_url`. A local read. `c0f081aaeb8e`
- **Subject image** -- for a subgroup named after something, the page in
  history that is *about* that name on the same site: channel page gives the
  avatar, game page gives the art. Host-first through the reversed-host index
  Places keeps, then title in JS. No site special-cased. `6a33b734b3d5`

Why shelved: both ran per group on every refresh, and refreshes are driven by
tab and favicon events -- again per-page-load. Its cache (`zzgroup.icon-cache`)
paired sites with names from history and is cleared on load now.

## What stays

- **Icon rules** -- naming a group's icon by hand. Parsed once, no lookups.
  This is how a per-game icon can still be set today.
- **Path subgrouping** -- Tab Router's path rules, which produce
  *Nexusmods / Crimson Desert*. Never involved the icon lookups; untouched.
