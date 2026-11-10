# Lag after opening and closing windows (Zen 1.24.1b)

Report: workspace switching and hovering the sidebar lag heavily, the whole
system stutters and the mouse locks up. It began after several windows were
open and stays after closing them.

Measured on 10 November 2026 on Linux under Xvfb (software WebRender,
synthetic WebDriver input) with Zen 1.24.1b, upstream Sine and the whole suite
in throwaway profiles. Every timer, observer and listener a mod registers was
attributed to its window and source line. Each run timed 20 workspace switches
and 8 sidebar sweeps, opened 3 windows, switched in each, closed them, forced
GC/CC and timed again. 28 configurations were run: stock Zen, Sine only, all
mods, each mod alone, compact, acrylic and Glassflow glass. These numbers do
not certify Windows GPU cost, OS cursor behaviour or visual smoothness.

## What the windows leave behind

**No mod.** After 3- and 6-window cycles, no mod observer, timer or listener
belonging to a closed window could still run, and no callback ran for one.
Switch and hover cost after closing stayed within noise.

**Zen itself.** Stock Zen 1.24.1b keeps closed browser windows alive for the
rest of the session. In a run without the test driver, all 6 closed windows
were still reachable after 8 GC/CC rounds. Forced GC went from 20 to 49 ms,
forced CC from 3 to 20 ms, and the JS heap from 30 to 47 MB, so collection
pauses grow with every window opened since launch. One retainer is
`<zen-library>`'s strong `zen.library.hidden-tabs` pref observer, which is
removed only in `disconnectedCallback`. Removing it alone did not free the
windows, so others exist. Sine's `injectLocale()` also leaves one
`intl.locale.requested` observer per closed window. Restarting Zen after
closing extra windows clears all of this.

**A likely Windows-only amplifier.** In compact mode Zen's
`ZenMouseTrackerWin` installs a `WH_MOUSE_LL` low-level mouse hook on the
browser's main thread when the pointer leaves through the sidebar edge, and
keeps it until the sidebar collapses. While it is installed, every mouse move
anywhere in the system waits for Zen's main thread, so any stall (GC/CC, a
switch, a hover preview) freezes the OS cursor. This fits the system-wide
symptom but cannot run on Linux; it is inferred from source.

## Fixed

| Mod | Release | Change |
| --- | --- | --- |
| Zen Turbo | 1.13.8 | Smooth workspace switch marked the document root, and a universal rule then restyled every space's tab strip twice per switch. Only the moving strips are marked now. Alone: 148/151 → 124/130 ms main thread per switch (stock 114–122), style thread halved. All mods, compact glass: 162/168 → 150/146 ms per switch, switch stalls over 100 ms 2/2 → 0/0. |
| Groupflow | 1.75.9 | A folder fit started a 240 ms rail glide even when the folder was already in place; each frame re-measured the rails of every space. It now settles in one frame, and rails are lit only in the active space (a space is lit when it becomes active). |
| Glassflow | 3.74.24 | The sidebar redraw nudge, a two-frame filter swap that forces a fresh 42px blur, landed inside Zen's switch animation, which already re-blurs the panel every frame. It now waits for the switch to end and runs once. GPU effect not measured. |
| Mediaflow | 2.8.12 | Actor timers were cleared on whichever window held the browser at that moment. Once ZenWindowSync moved a playing tab's browser, the 20 Hz caption clock kept running, another was added at each activation, and an unrelated timer with the same id could be cancelled. Each timer is now cleared on its own window. |
| Glassflow, Groupflow, Tab Unloader, Zen Turbo, Peekflow | 3.74.24, 1.75.9, 1.15.8, 1.13.8, 1.3.7 | A window closed before delayed startup left a `browser-delayed-startup-finished` observer that kept the whole window alive. It is now removed on unload. |

## Measured, not changed

- **Peekflow's hover preview over a blurred compact sidebar** gave 14–23
  main-thread stalls over 100 ms per 8 sweeps (worst 275 ms), against 0 with
  the preview off. The cost is Firefox's native preview: stock Zen with the
  same prefs forced on behaved the same, and Peekflow's own code added
  nothing measurable. Turning off **Preview tabs on hover** is the A/B test.
- **Glassflow's stylesheet** adds about 30 ms of restyle per switch (CSS
  emptied: stock; JS disabled: unchanged). Finding which rules cost it needs
  a CSS audit; a narrow JS change moved the flush without reducing it.
- **Pref writes while several windows are open** run every window's
  observers (about 10 → 31 ms per round of 10 writes with 4 windows). No pref
  is written on the switch or hover paths.

Lower-confidence static findings (Iconflow Morph's per-tab records,
ZenWindowSync lazy shells looking loaded, Groupflow's collapsed-visibility
full scan, cleanup ordering) are left for a later pass.

## Checks

`node --test tools/*.test.mjs` with upstream Sine: 337 tests, 324 passed,
0 failed, 13 skipped (Windows PowerShell). New regression tests fail on the
previous code: Zen Turbo strip marks, Groupflow active-space lighting and
in-place fit, Glassflow redraw deferral, Mediaflow timer ownership, and the
startup observer removal.

## On Windows

1. With the usual compact mode and blur, restart Zen and keep one window
   open. Paste [`tools/zen-freeze-probe.js`](../tools/zen-freeze-probe.js) into
   the Browser Console (Ctrl+Shift+J); during its 30 seconds hover up and down
   the tabs and switch spaces about 10 times. Keep the saved report.
2. Set **Preview tabs on hover** off (Peekflow) and repeat step 1.
3. Open two more windows, close them, open `about:memory`, click
   **Measure**, and note the `ghost-windows` count and the number of
   `window-objects/top(...)/detached` entries.
