# Zen Turbo

Preference packs and speculative connection requests for Zen. Requires Sine script loading and `sine.allow-unsafe-js=true` for installation outside its store.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/zen-turbo
```

Restart Zen after updating the bundled Sine update guard. Its replacement takes effect in the next browser session.

Shipped Turbo defaults are initialized on Firefox’s typed default preference branch before runtime startup. Explicit user values retain precedence; resetting an override reveals the shipped default. Existing user values are not cleared.

## Preference packs

| Pack | Default | Values requested |
|---|---|---|
| Network | on | 10 persistent connections per server; pacing disabled; speculative limit 12; DNS entries 2000; DNS expiration 3600 seconds; TLS token cache capacity 32768 |
| Native link hover | on | Firefox's `network.predictor.enable-hover-on-ssl=true` |
| Session store | on | Raise shorter write intervals to 30000 ms; preserve longer intervals |
| Media | on | `media.memory_cache_max_size=65536` (KiB) |
| Graphics | off | `gfx.webrender.all=true`; `gfx.canvas.accelerated=true` |

A value is changed only if the preference exists and differs from the requested value. Existence does not establish that the installed browser still reads that preference. Settings already at the requested value need no write.

Before changing a preference, the mod captures its user value, or records that no user value existed. Each sync reads one restoration snapshot and writes it at most once, only if changed. Re-syncing skips previously captured preferences, preserving later manual edits. Disabling a pack restores captured values only while the current value still equals the pack's value. Failed restorations retain their snapshots for retry.

These values are configuration choices, not measured speed improvements. Increasing caches trades memory for potential reuse; speculative requests can consume network resources without a later navigation. The session-store pack only raises intervals shorter than 30 seconds. Zen 1.24 uses 40 seconds already; Turbo leaves that native value intact and releases its previously owned 30-second override. Later manual edits retain precedence. Graphics overrides remain disabled by default.

## Connection requests

Favorites, Essentials, pinned tabs, and ordinary tabs use Zen/Firefox’s native hover warming and speculative connection path, including container handling. Turbo no longer installs duplicate tab-hover or bookmark-hover handlers or its own dwell timer. Existing retired hover preferences are left untouched but no longer add custom work.

Page-link hover uses Firefox's existing implementation. The native link-hover pack enables it on HTTPS pages; Turbo no longer wraps `XULBrowserWindow.setOverLink`. The retired `network.predictor.enable-prefetch` override is restored from its saved value when still owned by Turbo.

Requests use Firefox's principal-taking API, which derives the destination network partition, including HSTS upgrades. Supplying incomplete origin attributes to the alternative API would bypass that derivation.

Requests carry private-browsing origin attributes when triggered in a private window. Startup warmup does not query history in private windows. In other windows it can request the top `6` history origins after `4000` ms, spaced `250` ms apart; the configurable count is capped at `20`. The budget is claimed once per browser process/session. Additional windows and reinjection do not repeat it. A browser restart resets it. Idle scheduling defers optional startup work while the selected tab is busy.

The per-origin/container request throttle is half `network.http.keep-alive.timeout`, with a fallback of `115` seconds for that preference. It does not inspect socket state. A failed API call is not recorded as a completed request.

Clearing browsing history clears this window's warmup counters, origin records, logs, and pending warmups. Already-issued speculative connections remain under Firefox's control.

## Workspace animation CSS

`zzturbo.smooth-workspace-switch` pauses tab-strip transitions and animations and hides its videos during workspace motion. Zen's blur behind the sidebar stays on. Effects resume when the marker clears or after 1500 ms; a stale marker cannot freeze them indefinitely. Actual frame-time impact requires profiling the installed theme, browser, and hardware.

## Diagnostics and limits

```js
ZenTurbo.status()
ZenTurbo.stats()
ZenTurbo.log()
ZenTurbo.warm("https://example.com")
```

`stats().warmed` counts speculative API calls that returned without throwing. `hits` and `cold` count navigation matches and non-matches against recent origin/container requests. `hitRate` is the percentage of observed navigations matching those records within `windowMs`.

**These counters do not measure socket reuse, successful handshakes, bytes saved, or load-time savings.** Repeated navigations can match one request. Measurement defaults to off. Only explicit measurement installs the diagnostic navigation listener and collects counters; disabling it removes that listener and releases measurement data. Debug logs require their separate explicit setting. The functional recent-warm cache remains independent. Counters belong to the current window/script instance.

Turbo adds one bounded history warmup per session and configurable preference overrides. Zen/Firefox already provides tab and page-link warming. The [controlled workload comparison](../docs/FIXES-2026-10-30-COMPLETION-AUDIT.md) reports local HTTP/1.1 and media-seek results. They do not establish a universal speed advantage or justify changing saved choices; the packs remain optional configuration choices. Disabling a pack or removing the mod restores captured values still owned by Turbo. Closing a window or rebuilding enabled scripts keeps feature overrides active. Restart once after upgrading to the new shared lifecycle guard.

`status().managedPrefs` lists captured preference names. `unknownPrefs` lists missing preference names; neither field proves a performance benefit. `warmupRequests` counts accepted API calls, and `recentOriginContexts` counts retained origin/container records, capped at `200`.

Run `node --test tools/lifecycle.test.mjs` from the repository root for mocked lifecycle and preference checks. Runtime compatibility and performance require testing in Zen.

## License

MIT
