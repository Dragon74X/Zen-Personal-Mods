# Groupflow

Per-state glass theming for tab groups and subgroups, in
[Glassflow](../glassflow)'s visual language. A sibling mod, not a fork:
Glassflow's live tokens (roundness, accent tone, sheen recipe, rim strength,
glass intensity) are inherited directly, so knobs turned there carry over here
automatically. Without Glassflow installed, the fallbacks reproduce its
defaults.

## Install

Paste this folder's URL into Sine's install box, under Settings -> Mods:

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/groupflow
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config`. Group
styling is on out of the box; **Turn on group styling** is the master switch
if you want it off.

## What it styles

**Headers** — accent tint and gradient, roundness, optional sheen, rim light
and glass blur, close button on either side. The accent comes from the group's
own colour chip by default, so mixed-colour groups keep their identity;
Glassflow's accent or a custom colour unify everything instead.

**Label text** — alignment, weight, size, colour, italic, underline,
uppercase, and a favicon in place of the group icon.

**States** — active-group highlight, collapsed-group dim.

**Nesting** — subgroup indent, row inset and gap, and a whole connector
system: accent guide lines with gradient, thickness, shape (including curves),
caps, sheen, rim, glow, shadow and blur; plus per-tab and per-subgroup
membership marks with their own shading, glow, shadow, size and opacity.
Headers can shrink per depth level.

Zen folders are untouched — `zen-folder` is a different element and Folder
Tree Connectors owns it. Split-view groups are excluded throughout.

## Favicons as group icons

`groupflow.uc.js` assigns each group the favicon of its dominant domain, as
`--zzgf-icon`. It counts the group's *direct* member tabs, so a subgroup
computes its own; a parent whose direct children are all subgroups borrows
from the first one, so it still gets an icon.

Icons come from `page-icon:`, Firefox's own favicon protocol, served out of
the local favicon store — no network fetch happens. The pass runs on group
events and once a minute, to catch a member navigating to a different domain.

Turn off **Favicon as group icon** and the script does nothing.

## How it overrides Advanced Tab Groups and Arc

The mod id `zz-groupflow` imports after `advanced-tab-groups`, `Arc-2.0` and
`zz-glassflow` in Sine's lexicographic order, so header styling wins by plain
source order -- no `!important` escalation. Their group-body chrome can
additionally be stripped with **Strip other mods' group chrome**, off by
default: turn it on only if their *body* styling visibly fights this mod's,
since their headers are overridden either way.

**Hide other mods' group lines** does the same for competing connector
systems, and is on by default, so you do not end up with two sets of nesting
guides.

## Matching Glassflow

Most values inherit automatically. Three do not, because they are genuinely
separate surfaces:

- **Header roundness** is its own value — set it to Glassflow's tab roundness
  by hand to match. An empty value is not supported; Sine injects it as an
  empty variable, which invalidates the rule.
- **Header tint** defaults to Glassflow's unselected-tab tint, not its
  selected one.
- **Gradient direction** is set to *Match Glassflow* by default and tracks
  it live from there.

**Follow Glassflow's edge fade** is off by default, and is the one to turn on
if you want group headers and tabs to light and fade on the same axis: it
takes the fade axis and reach from Glassflow's tab edges. The per-state rim
strengths already reach this mod on their own — only the axis and reach need
adopting, and a different axis for groups is a fair choice, which is why it is
opt-in.

## Performance

Headers are few, so even the optional header blur is far cheaper than
per-tab blur -- and Zen Turbo's workspace-switch smoothing suspends it during
slides automatically, like everything else.

## License

MIT
