# Zen Turbo

Real, reversible performance tuning for Zen. Requires `sine.allow-unsafe-js`
set to `true`.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/zen-turbo
```

## What it actually does

**Pref packs** -- tuned network, IO, graphics and scrolling settings, each its
own toggle. Every value is snapshotted before being changed. Turning a pack off
restores your profile exactly, including "no user value at all". A pref you
later change by hand is recognized as yours and never touched again.

| Pack | Default | What it changes |
|---|---|---|
| Network tuning | on | 10 persistent connections per server instead of 6, request pacing off, 12 speculative connections, larger DNS and TLS-session caches |
| Predictor on https hover | on | Extends Firefox's network predictor to act on hover over https links, and to prefetch what it is confident about |
| Less session-store disk churn | on | Session state written every 30s instead of every 15s |
| Bigger in-memory media cache | on | 64 MB, so small seeks in video replay from memory instead of re-fetching |
| Force GPU rendering paths | off | WebRender and accelerated canvas on hardware where Mozilla's blocklist keeps them off conservatively |

Nothing here changes how the browser *looks*. Appearance belongs to the
styling mods: corner shapes and instant UI animations both live in
[Glassflow](../glassflow).

There is no scroll pack any more. Zen ships its own smooth-scroll tuning in
`prefs/fastfox/smoothscroll.yaml`, and it sets every value this mod used to
set, to the identical numbers -- MSD physics on, 12ms continuous-motion delta,
spring constants 600 / 650 / 250, 25ms slowdown minimum -- plus five more this
mod never touched. So the pack was a no-op wherever Zen applies those
defaults, and on macOS, where Zen deliberately excludes them, it overrode that
choice. Zen's tuning is better than what this mod was duplicating.

**Hover warmup** -- hovering an unloaded tab, a bookmark, or a link on a page
pre-opens TCP+TLS to its site, in the right container, so the click lands on a
warm socket. Pairs with Tab Unloader: unloaded tabs reload without paying DNS,
handshake, or certificate time.

Link hovers need a different hook, because a chrome script cannot see mouse
events inside a page. Firefox already computes the answer -- it is what fills
the little status panel showing a link's target -- so this wraps that, and it
fires on every link hover there is. The container used is the hovered tab's,
since that is where the link would open.

**How long a warmed socket lasts:** it becomes an ordinary idle persistent
connection the moment it opens, so Firefox reaps it on
`network.http.keep-alive.timeout` -- **115 seconds** by default, and Zen does
not override it. Hover a link, wait two minutes, and the work is gone. Warming
is re-thottled against that same number rather than a fixed interval, so an
origin is never re-warmed while its socket is still alive.

**Startup warmup** -- shortly after startup, your most-visited sites (read
from local history, read-only) get connections pre-opened, spread a quarter
second apart to avoid a burst. The first navigation of the day lands warm.
Six sites by default, after a 4 second delay so it never competes with session
restore.

**Smooth workspace switching** (on by default) -- pure CSS, no script. Zen
marks a workspace slide with `[animating-background]` on the root element, and
trackpad swipes with `[swipe-gesture]`. While the strip translates, every
`backdrop-filter` under it re-blurs per frame and any playing video in the
sidebar recomposites per frame -- with Glassflow and a transparency mod
stacked, that is two blur systems live at once for the whole slide. This
suspends chrome blurs, transitions and sidebar video for the duration of the
marker attribute only. Resting visuals are pixel-identical.

## What it does not do

It cannot make pages parse, script, or render faster; it cannot beat network
physics; it will not show up in a JavaScript benchmark. What it removes is
waiting: handshakes, lookups, pacing delays, and periodic disk writes. On a
fast machine with a fast connection the difference is small; on cold
connections, unloaded tabs, and busy disks it is real and repeatable.

## Inspecting it

```js
ZenTurbo.status()   // active packs, every pref currently managed, warm count
ZenTurbo.stats()    // did the warming actually help? hit rate, and by origin
ZenTurbo.log()      // recent activity, including each warmed connection
ZenTurbo.warm("https://example.com")   // warm one origin by hand
```

`stats()` is the one that keeps this mod honest. It counts every connection
opened ahead of time, then checks each navigation: did a real request land on
that socket before the 115-second keep-alive reaped it? A low `hitRate` means
the warming is aimed at the wrong things and is costing sockets for nothing --
which is a reason to turn it off, and exactly the kind of finding "it feels
faster" would hide. `byOrigin` shows where the waste is.

`status().managedPrefs` is the answer to "is this pack doing anything on my
machine" -- the GPU pack in particular changes nothing on hardware where those
paths already run, and shows up as an empty list there.

`status().unknownPrefs` is the other half, and it is the no-snake-oil promise
made mechanical. Firefox renames and removes prefs between versions. Setting
one it no longer reads does not fail -- it quietly creates a user pref that
does nothing, forever, while the mod goes on claiming to manage it. So every
pref is checked for existence before it is touched, skipped if this build does
not have it, and listed here. Anything that appears in that list is dead weight
and should come out of the mod.

Turn on **Log what it is doing** to have the same activity printed to the
Browser Console (`Ctrl+Shift+J`) under `[ZenTurbo]` as it happens.

## Notes

Pref application is done by one window only -- whichever is frontmost when the
script loads -- so multiple windows cannot race each other over the snapshot.
Connection warmup runs in every window, since hover is per-window anyway.

If the Motion library is not present on your build, instant UI animations are
unavailable and the log says so rather than failing silently.

## License

MIT
