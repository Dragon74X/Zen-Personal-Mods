# Tab Unloader

Time-based tab unloading for [Zen Browser](https://zen-browser.app/) via [Sine](https://github.com/CosmoCreeper/Sine).

Zen removed its own unload timer and now uses Firefox's native unloader, which only runs under memory pressure. `browser.tabs.min_inactive_duration_before_unload` is a minimum-age filter applied when that unloader runs -- it is not an interval, and on a machine that never runs low on memory it is never consulted. This mod supplies the missing timer.

**It unloads, it never closes.** The call is `gBrowser.discardBrowser(tab)`, the same one behind the tab context menu's *Unload Tab*. Tab, title, favicon, history and scroll position all survive; the page reloads when you return to it.

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
| Split view | `zen-split` | on |
| Unsubmitted form data | `SessionStore.getTabState().formdata` | on |
| URL matches your exclusion list | substring match | list is empty by default |

Whatever survives is sorted oldest-idle-first and discarded up to the per-sweep cap, respecting the minimum-loaded floor.

Every toggleable category is independent, and all of them default to on.

**Last tab per workspace** is worth understanding, because it is the one rule that is not a plain attribute check. Switching workspaces leaves the tab you were on still selected in *its* workspace, so the tab last selected in each workspace is exactly "the one you switched away from" -- and coming back to a workspace to find it blank is the thing this prevents. The anchor is a specific tab, dropped when that tab closes, so a closed tab never passes its protection on to whatever takes its place. `TabUnloader.anchors()` shows the current one per workspace.

Sweeps are skipped entirely while a workspace slide or trackpad swipe is in progress -- `discardBrowser` mid-animation contributes to stutter, and the next tick picks it up.

## Safety

The form-data check needs `SessionStore`. If it is unavailable the check is **skipped** and logged once, rather than treating every tab as dirty. Treating it as dirty is what kept every tab loaded in 1.0.

Each discard is wrapped individually, so one failure cannot abort the sweep.

## Cost

The sweep is an attribute scan over open tabs on a `setInterval`. There is no per-tab observer, no MutationObserver, and no work at all while disabled -- the interval is not scheduled until the master switch is on, and a pref observer reschedules it rather than polling.

The form-data check is the only non-trivial part, since it serialises tab state. It runs last, only on tabs that have already passed every cheaper test.

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
