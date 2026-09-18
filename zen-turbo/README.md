# Zen Turbo

Preference packs and speculative connection requests for Zen. Requires Sine script loading and `sine.allow-unsafe-js=true` for installation outside its store.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/zen-turbo
```

Restart Zen after updating the bundled Sine update guard. Its replacement takes effect in the next browser session.

## Preference packs

| Pack | Default | Values requested |
|---|---|---|
| Network | on | 10 persistent connections per server; pacing disabled; speculative limit 12; DNS entries 2000; DNS expiration 3600 seconds; TLS token cache capacity 32768 |
| Predictor | on | HTTPS hover prediction and prefetch enabled |
| Session store | on | Write interval 30000 ms |
| Media | on | `media.memory_cache_max_size=65536` (KiB) |
| Graphics | off | `gfx.webrender.all=true`; `gfx.canvas.accelerated=true` |

A value is changed only if the preference exists and differs from the requested value. Existence does not establish that the installed browser still reads that preference. Settings already at the requested value need no write.

Before changing a preference, the mod captures its user value, or records that no user value existed. Re-syncing skips previously captured preferences, preserving later manual edits. Disabling a pack restores captured values only while the current value still equals the pack's value. Failed restorations retain their snapshots for retry.

These values are configuration choices, not measured speed improvements. Increasing caches trades memory for potential reuse; speculative requests can consume network resources without a later navigation. The 30-second session-store interval changes session persistence timing. Graphics overrides remain disabled by default.

## Connection requests

Hovering an unloaded tab, bookmark, or page link schedules a speculative connection request after `200` ms by default. Leaving the tab/bookmark surface, moving to a non-target, disabling hover settings, or unloading the script cancels a pending request. Page links use the selected tab's container; unloaded tabs use their own container; bookmarks use container `0`.

Requests carry private-browsing origin attributes when triggered in a private window. Startup warmup does not query history in private windows. In other windows it can request the top `6` history origins after `4000` ms, spaced `250` ms apart; the configurable count is capped at `20`. This runs on eligible window startup, not necessarily once per browser session.

The per-origin/container request throttle is half `network.http.keep-alive.timeout`, with a fallback of `115` seconds for that preference. It does not inspect socket state. A failed API call is not recorded as a completed request.

Clearing browsing history clears this window's warmup counters, origin records, logs, and pending warmups. Already-issued speculative connections remain under Firefox's control.

## Workspace animation CSS

`zzturbo.smooth-workspace-switch` disables selected blur effects, transitions, and sidebar video rendering while Zen's workspace-animation attributes are present. Actual frame-time impact requires profiling the installed theme, browser, and hardware. A stale animation attribute can keep these CSS rules active.

## Diagnostics and limits

```js
ZenTurbo.status()
ZenTurbo.stats()
ZenTurbo.log()
ZenTurbo.warm("https://example.com")
```

`stats().warmed` counts speculative API calls that returned without throwing. `hits` and `cold` count navigation matches and non-matches against recent origin/container requests. `hitRate` is the percentage of observed navigations matching those records within `windowMs`.

**These counters do not measure socket reuse, successful handshakes, bytes saved, or load-time savings.** Repeated navigations can match one request. Disabling `zzturbo.measure` stops navigation counting. Counters belong to the current window/script instance.

`status().managedPrefs` lists captured preference names. `unknownPrefs` lists missing preference names; neither field proves a performance benefit. `warmupRequests` counts accepted API calls, and `recentOriginContexts` counts retained origin/container records, capped at `200`.

Run `node --test tools/lifecycle.test.mjs` from the repository root for mocked lifecycle and preference checks. Runtime compatibility and performance require testing in Zen.

## License

MIT
