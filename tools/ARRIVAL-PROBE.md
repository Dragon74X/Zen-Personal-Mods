# Automatic window-arrival capture

When a switch lands you in another window, Tab Router fades a ring in Zen's
accent around that window's page and the tab. If you don't see it, paste the
complete [arrival-probe.js](arrival-probe.js) into Zen's **Browser Console**
(Ctrl+Shift+J) and press Enter, with your windows arranged as usual. It works
with any installed Tab Router (1.44, 1.45.0, 1.45.1); no update is needed.

1. **A few seconds, hands off** (up to about 15): the probe switches between
   two of your browser windows itself, arranged as they are. With only one
   window, a temporary second window opens and closes again. It uses a page
   already shown in the other window (or a temporary tab on port 9, which Gecko
   refuses to contact, so nothing loads). It calls Firefox's switch to an open
   tab, as the address bar's Switch to Tab does, and Tab Router's own switch,
   which handles link clicks and new tabs.
2. **40 s, your turn:** when the console says "Your turn", switch windows your
   usual way once or twice, the way that should show the ring.

The JSON report is copied and logged at the end (75 s at most). Return it for
diagnosis. `window.__zzArrivalProbe.stop()` ends early; it also restores
everything and copies the report. There are no buttons or choices.

Everything is restored on completion, Stop, the deadline or a closed window:
wrappers, observers and listeners are removed, the temporary tab and window
are closed, the selected tabs are re-selected and focus returns where it was.
The report names windows W1, W2…, never titles. A page appears as its host only.
It never changes preferences, uploads anything or stores a file.

## Reading the report

- `mods` shows Sine's installed versions, and `runtime` what is running:
  `switchToTabPatched`, and per window `markArrival` and `switchIfNeededWrapped`
  (all true from Tab Router 1.45.1). `env.prefs` lists window occlusion,
  WebRender, the address bar's `adoptIntoActiveWindow` and window sync.
- `auto.paths[]`: per switch, whether the destination became active
  (`destinationActiveMs`, `after.landed`) and which calls ran. `switchIfNeeded`
  shows `switchingFrom`, the window you came from as Tab Router saw it. The rings
  each switch produced are listed too.
- `rings[]`: where each ring was attached and with what style. `frames` and
  `paints` count the destination's refresh ticks and paints while it was
  attached; `opacity` samples it per frame. `pixels` compares a Gecko
  `drawSnapshot` of the ring's edge at its peak with the same area afterwards.
- `events` (activations with `framesIn1s`, tab selections, switch calls) and
  `passive`. `plainActivations` counts window switches with no switch to an
  open page around them (Alt+Tab, the taskbar, a click), which show no ring by
  design.

What it cannot show: the `auto` switches are direct calls, so they do not
exercise physical input. `pixels`, `frames` and `paints` are Gecko's own
rendering and refresh counts, not a capture of the physical screen, so DWM
composition and occlusion on the display stay unproven. Node checks
(`arrival-probe.test.mjs`) cover version detection (1.45.1 and 1.45.0 shapes),
restore on Stop and the deadline, the temporary window and tab, redaction, bounds
and the copied report.
