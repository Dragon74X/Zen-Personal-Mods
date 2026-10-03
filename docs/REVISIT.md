# Deferred decisions

Items reviewed in October 2026 and deliberately left unchanged for now. Each
entry says what is true today, what would change, and what to check first.

## Glassflow: native strip blur and the snapshot sampler

- **Today:** *Native blur through transparent pages* filters `#tabbrowser-tabbox`
  with an SVG filter whose mask is an `feImage`. Firefox 156 ships
  `gfx.webrender.svg-filter-effects.feimage` disabled, so the filter graph
  likely falls back to CPU painting of the whole content area on GPU builds.
  This is from Firefox source; it has not been measured on a GPU machine.
- **Change:** build the mask from `feFlood` with a primitive subregion instead
  of `feImage`; keep the filter attached while enabled and park the strip when
  the sidebar hides, so the stacking context is not rebuilt as the slide starts.
- **Then:** test on the actual machine. Remove the snapshot sampler only if the
  live path covers every case. The sampler is off by default, so removing it
  saves no work on the default path.

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
