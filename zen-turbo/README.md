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
| Physics-based smooth scrolling | on | MSD-physics scroll response instead of fixed-duration easing: tracks the wheel with less lag, settles without the floaty tail |
| Force GPU rendering paths | off | WebRender and accelerated canvas on hardware where Mozilla's blocklist keeps them off conservatively |

**Hover warmup** -- hovering an unloaded tab or a bookmark pre-opens TCP+TLS
to its site, in the right container, so the click lands on a warm socket.
Pairs with Tab Unloader: unloaded tabs reload without paying DNS, handshake,
or certificate time. Throttled to once per site per minute.

**Startup warmup** -- shortly after startup, your most-visited sites (read
from local history, read-only) get connections pre-opened, spread a quarter
second apart to avoid a burst. The first navigation of the day lands warm.
Six sites by default, after a 4 second delay so it never competes with session
restore.

**Instant UI animations** (off by default) -- Zen animates its interface
through its bundled Motion library, which exposes a global switch. With this
on, every UI animation jumps straight to its final frame, so the interface
responds at input speed instead of animation speed. In-memory, applies and
reverts live, and web pages are untouched. There is no `zen.animations` pref;
this is the real lever. It is a look change by design -- leave it off if you
like the motion.

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
ZenTurbo.log()      // recent activity, including each warmed connection
ZenTurbo.warm("https://example.com")   // warm one origin by hand
```

`status().managedPrefs` is the answer to "is this pack doing anything on my
machine" -- the GPU pack in particular changes nothing on hardware where those
paths already run, and shows up as an empty list there.

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
