# Zen Turbo

Real, reversible performance tuning for Zen. Requires `sine.allow-unsafe-js` set to `true`.

## What it actually does

**Pref packs** -- tuned network and IO settings, each its own toggle: more
parallel connections, request pacing off, larger DNS/TLS caches, extended
network predictor, halved session-store disk cadence, bigger in-memory media
cache. Every value is snapshotted before being changed. Turning a pack off
restores your profile exactly, including "no user value at all". A pref you
later change by hand is recognized as yours and never touched again.

**Hover warmup** -- hovering an unloaded tab or a bookmark pre-opens TCP+TLS
to its site, in the right container, so the click lands on a warm socket.
Pairs with Tab Unloader: unloaded tabs reload without paying DNS, handshake,
or certificate time. Throttled to once per site per minute.

**Startup warmup** -- shortly after startup, your most-visited sites (read
from local history, read-only) get connections pre-opened, spread out to
avoid a burst. The first navigation of the day lands warm.

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

## License

MIT
