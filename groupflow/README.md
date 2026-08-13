# Groupflow

Per-state glass theming for tab groups and subgroups, in Glassflow's visual
language. A sibling mod, not a fork: Glassflow's live tokens (roundness,
accent tone, sheen recipe, rim strength, glass intensity) are inherited
directly, so knobs turned there carry over here automatically. Without
Glassflow installed, the fallbacks reproduce its defaults.

## What it styles

Group headers (tint, optional sheen / rim / glass blur, roundness, label
weight / size / uppercase), states (active-group highlight, collapsed dim,
hover), and nesting (indent, accent guide lines, per-depth header scaling).

Zen folders are untouched -- `zen-folder` is a different element and Folder
Tree Connectors owns it.

## How it overrides Advanced Tab Groups and Arc

The mod id `zz-groupflow` imports after `advanced-tab-groups`, `Arc-2.0` and
`zz-glassflow` in Sine's lexicographic order, so header styling wins by plain
source order -- no `!important` escalation. Their group-body chrome can
additionally be stripped with the "Strip other mods' group chrome" toggle,
off by default.

## Performance

Headers are few, so even the optional header blur is far cheaper than
per-tab blur -- and Zen Turbo's workspace-switch smoothing suspends it during
slides automatically, like everything else.

## License

MIT
