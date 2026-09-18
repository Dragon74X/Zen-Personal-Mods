# Tab Unloader

Time-based tab unloading for [Zen Browser](https://zen-browser.app/) via [Sine](https://github.com/CosmoCreeper/Sine).

Zen removed its own unload timer and now uses Firefox's native unloader, which only runs under memory pressure. `browser.tabs.min_inactive_duration_before_unload` is a minimum-age filter applied when that unloader runs -- it is not an interval, and on a machine that never runs low on memory it is never consulted. This mod supplies the missing timer.

**Operation:** unloads tabs without closing them. Each candidate first awaits `gBrowser.prepareDiscardBrowser(tab)` to flush session state, then rechecks exclusions before calling `gBrowser.discardBrowser(tab)`. The native discard gate can refuse; only successful discards consume the sweep budget. The page reloads when selected. Firefox's session store controls which page state is restored.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/tab-unloader
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config`. Sine only runs scripts from mods it did not install from its own store unless that flag is on.

Enable **Turn on automatic unloading** in the mod's settings. Nothing happens until you do -- no timer is even scheduled while it is off.

## How it decides

Every sweep, each tab is checked in order and kept if any rule matches:

| Kept because | Signal | Toggle |
|---|---|---|
| Active tab | `tab.selected` | always |
| Already unloaded | `pending` attribute | always |
| Closing, or has no browser | `tab.closing`, no `linkedBrowser` | always |
| Zen's blank placeholder tab | `zen-empty-tab`, `_forZenEmptyTab` | always |
| Not idle long enough | `tab.lastAccessed` vs the idle threshold in seconds | always |
| Last tab you used in its workspace | recorded on `TabSelect`, per workspace | on |
| Playing audio or video | `soundplaying` attribute | on |
| Asking for attention | `attention` attribute | on |
| Sharing camera, mic or screen | `sharing` attribute | on |
| Picture-in-picture | `pictureinpicture` attribute | on |
| Essential | `zen-essential="true"` | on |
| Pinned | `tab.pinned` | on |
| Glance | `zen-glance-tab` | on |
| Split view | `splitView`, `split-view`, or a `split-view-group` parent | on |
| Native browser protection | `undiscardable` or `zenModeActive` | always |
| Unsubmitted form data | a real field entry in `SessionStore.getTabState().formdata`, unless the site is exempted | on |
| URL matches your exclusion list | substring match | list is empty by default |

Candidates are sorted oldest-idle-first; eligibility is evaluated only until the successful-discard budget is filled. A concurrent sweep is skipped. After each state flush, selection, protection settings and the loaded-tab floor are checked again.

Every toggleable category is independent, and all of them default to on.

**Last tab per workspace** is worth understanding, because it is the one rule that is not a plain attribute check. Switching workspaces leaves the tab you were on still selected in *its* workspace, so the tab last selected in each workspace is exactly "the one you switched away from" -- and coming back to a workspace to find it blank is the thing this prevents. The anchor is a specific tab, dropped when that tab closes, so a closed tab never passes its protection on to whatever takes its place. `TabUnloader.anchors()` shows the current one per workspace.

A workspace animation defers a sweep for at most 10 seconds. A stale animation marker therefore cannot disable unloading indefinitely.

## Safety

The form-data check uses `SessionStore`. If it is unavailable or unreadable,
form protection keeps the tab loaded. Empty strings, booleans and select-box
state do not count as drafts. Non-empty `id`/`xpath` fields, frame records and
`innerHTML` from designMode documents do count.

This checks data Firefox serializes, not every web application's in-memory
state. Native unload vetoes still apply. Use URL exclusions for editors whose
drafts are not represented in session form data.

Each discard is wrapped individually, so one failure cannot abort the sweep.

## Cost

The sweep is an attribute scan over open tabs on a `setInterval`. There is no per-tab observer, no MutationObserver, and no work at all while disabled -- the interval is not scheduled until the master switch is on, and a pref observer reschedules it rather than polling.

The form-data check serializes tab state and runs after URL and attribute checks. An eligible tab also incurs a native asynchronous state flush before discard.

## Inspecting it

Turn on **Log what it is doing**, then open the Browser Console (`Ctrl+Shift+J`):

```js
TabUnloader.status()    // every tab, its idle seconds, and why it was kept
TabUnloader.sweepNow()  // run a sweep immediately
TabUnloader.anchors()   // the protected tab in each workspace
TabUnloader.settings()  // the values actually in effect, and whether the timer is running
TabUnloader.log()       // recent decisions
```

`status()` is the fastest way to answer "why is this tab still loaded" -- it returns the exact rule that matched. `settings()` answers the other half: whether the sweep timer is actually running, and what the thresholds parsed to.

`about:unloads` is Firefox's own view of unload candidates and is useful alongside this.

## Relationship to the native unloader

This runs independently of Firefox's memory-pressure unloader; both can be active. If you also want the native one to work, `browser.low_commit_space_threshold_mb` is its trigger, defaulting to roughly 200 MB of free commit space on Windows.

Zen's `zen.tab-unloader.excluded-urls` does not apply here. Use this mod's own URL exclusion list.

## License

MIT
