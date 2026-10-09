# Deferred decisions

Items reviewed in October 2026 and deliberately left unchanged for now. Each
entry says what is true today, what would change, and what to check first.

## Glassflow: native strip blur and the snapshot sampler (settled)

- **Done:** the snapshot sampler was removed in `4b68079` (5 October 2026,
  "One blur: Zen's own acrylic"). The see-through-page blur was rebuilt in
  `18bb149` (6 October 2026) with an `feFlood` mask instead of `feImage`, and
  is attached only while the compact sidebar shows over a see-through page.
- **Still open:** not measured on a GPU machine. The mask is a rectangle, so
  the panel's rounded corners may show a sliver of blurred page (the
  `ponytail:` note in `glassflow.uc.js` says what to do if it does).
- **Recorded:** 9 October 2026 audit ([AUDIT-2026-10-09.md](AUDIT-2026-10-09.md)).

## Glassflow: blur behind overlays

- **Today:** every overlay uses the native `backdrop-filter`, with Zen's recipe
  at its own strength (**Overlay blur**, 8px) and Zen's underlay laid again
  last (Glassflow 3.69.0).
- **Why:** the download stack's rows let the tabs and music player under them
  show through sharp (a Windows screenshot, 9 October 2026). Zen's recipe lays
  the underlay first and then blurs 42px. On an element much smaller than the
  blur, the underlay mixes with the clear space around it, the result turns
  see-through, and WebRender draws it over the sharp original. Measured on a
  52px box over the tabs, the share of edge detail left was 90% at 42px, 42%
  at 8px, and 40% with the underlay last at either strength. A big panel such
  as Zen's sidebar is not affected.
- **Corrected:** Glassflow 3.68.0 took this for Firefox not seeing the tab list
  and blurred it with an SVG filter instead, the see-through-page method
  (`transparentPageBlur()`). That was wrong: with a solid colour behind the
  tab list, the native blur of the rows blurred the tabs. 3.69.0 removed the
  filter.
- **Still open:** over the page, the test renderer showed no blur at any
  setting; not checked on a GPU.
- **Check first:** Zen run under Xvfb with software WebRender, captured from
  the X display (Marionette's own screenshots skip `backdrop-filter`); measure
  edge detail inside a box against the same area without it.

## Tab Router: grouped tabs and explicit Zen domain routes

- **Today:** a tab already filed under its target group path stays in its
  workspace even when an explicit Zen "route domain to space" rule names another
  workspace. With *Tabs already in a group* on (default), that matches the
  documented contract; with it off, rules are meant to override placement.
- **Change options:** relocate only for explicit Zen routes, either only when
  *Tabs already in a group* is off or behind a new setting.
- **Risk:** moving a tab out of a group in another workspace creates a
  same-named group in the routed workspace; *Sort all* could do that in bulk.

## Tab Router: container chosen by group majority

- **Today:** with *Follow Zen routes and containers* on and no Zen route naming
  a container, a tab is reopened in the container most tabs in its destination
  group use. That reload switches which account or session the page uses.
- **Change:** let only explicit Zen routes and workspace default containers
  choose a container; make the majority fallback optional or remove it.
- **Trade-off:** mixed-container groups stay mixed instead of converging.

## Zen Turbo: default-on packs and startup preconnections

- **Today:** the network, predictor, session-store and media packs, hover
  warmup and startup history warmup default on. `ZenTurbo.stats()` counts
  navigation matches; no time saved has been measured.
- **Change:** default the packs and startup warmup off; keep hover warmup and
  workspace-switch smoothing on. Only profiles that never set the preference
  would change; packs already applied stay applied until turned off.

## Already settled

- **Groupflow folder colour:** the default is the group's own colour; tab
  container colour is an explicit option. No change needed.
- **Six identical update guards:** each mod installs on its own, so each ships
  a copy. `tools/sine-update-guard.test.mjs` fails if the copies differ; a build
  step would add tooling without benefit.
- **Groupflow refresh traversal:** full refreshes are debounced and tab events
  refresh only the affected group chain. Profile before optimizing.

## Sine update guard

- Remove the guard once Sine stages each mod in its own directory and restores
  its backup when a download fails. Report both upstream.
- The guard wraps Sine internals by name and checks `syncModData` source text;
  an upstream refactor silently disables it (it logs that it was skipped).
- A download that fails partway through extraction leaves a partial folder that
  the guard does not repair; reinstall that mod.
