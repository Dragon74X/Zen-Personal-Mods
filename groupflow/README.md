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
the local favicon store — no network fetch happens.

The pass is entirely event-driven; there is no timer. Zen patches a
`ZenTabIconChanged` event into `tabbrowser.setIcon()`, so it fires for every
tab whose favicon is set and it bubbles — which is exactly the signal this
needs, since a member navigating to another domain is only interesting because
its favicon changes. It used to poll once a minute for that, which meant a
group icon could sit wrong for up to sixty seconds and a timer ran in every
window for the life of the session.

Turn off **Favicon as group icon** and the script does nothing.

### Automatic: the page's own image

**Icon source** switches what the automatic icon is drawn from.

*Site favicon* (the default) is one picture per domain. It identifies
*Nexusmods* correctly and tells you nothing one level down, where every game
subgroup draws the same Nexus logo.

*Page image, favicon fallback* uses what the page advertises about itself — its
`og:image`. Firefox already has this: `ContentMetaHandler` reads that tag while
a page loads and writes it into your history through
`PlacesUtils.history.update`, so it is sitting in the profile for every page
already visited. Reading it is a local database lookup, not a scrape and not a
request to the site.

What it actually gives you varies by site, and it is the *page's* image rather
than the author's:

| Page | Image you get |
|---|---|
| Nexus or Steam game page | the game art |
| GitHub repository | the repository's social card |
| YouTube **channel** page | the channel avatar |
| YouTube **watch** page | the video thumbnail, not the creator |

The favicon is painted first and the page image replaces it when the lookup
resolves, so a group is never blank while that happens, and a group whose page
had no stored image simply keeps the favicon. Results are cached per URL.

Page images are wide banners, so they are cropped to the centre and the backing
plate is dropped — a photo does not need one. Displaying an image does load it,
normally from cache, since it came from a page you visited.

### Naming an icon yourself

The dominant-domain rule is right for *Nexusmods* and useless below it: every
game on a mod site shares that site's favicon, so *Crimson Desert*,
*Dawnwalker* and *Stalker 2* all end up with the same picture. **Icon rules**
gives a group an icon of its own. One per line, or separated by semicolons:

```
crimson desert     = file:///C:/icons/crimson.png
youtube / mandalore = file:///C:/icons/mandalore.png
nexusmods          = nexusmods.com
```

The left side matches the subgroup on its own (`crimson desert`) or its full
path (`youtube / crimson desert`) — the path form is there for when the same
leaf name sits under two different parents. Case and spacing around the slash
do not matter. A rule beats the automatic favicon.

The right side is one of:

| You write | What is used | Network |
|---|---|---|
| `nexusmods.com` | that site's favicon, from Firefox's local store | none |
| `file:///C:/icons/x.png` | your own image | none |
| `data:image/png;base64,…` | an embedded image | none |
| `chrome://browser/skin/…` | a built-in browser icon | none |
| `https://example.com/x.png` | a remote image | **a real fetch** |

Prefer a local file for artwork the browser has no favicon for. Values
containing a quote, a bracket or a backslash are ignored rather than allowed to
break the stylesheet.

Zen **folders** (`<zen-folder>`) are a different element and this mod does not
touch them; they carry Zen's own icon, set from the folder's right-click menu.

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

## Corner shape (Zen 1.22b squircles)

Zen 1.22b applies `corner-shape: superellipse(var(--zen-squircle-value))` to the
universal selector — 1.3 on most platforms, 2.3 on Windows — so group headers
are reshaped along with everything else, and a roundness tuned before 1.22b
reads squarer at the same number.

**Corner shape** defaults to *Follow Zen* and changes nothing; *Round (classic)*
restores the pre-1.22b look. **Radius source** can take the header radius from
Zen's own `--border-radius-medium` rather than a pinned number, so headers
track Zen's design language through future restyles. **Radius compensation** set to *Auto* keeps the
squircle but scales the header roundness by Zen's own per-platform factor.

Set both to match Glassflow's, or headers and tabs will disagree — this is the
one place the two mods do not inherit from each other automatically, because
header roundness has always been its own value.

## Performance

Headers are few, so even the optional header blur is far cheaper than
per-tab blur -- and Zen Turbo's workspace-switch smoothing suspends it during
slides automatically, like everything else.

## License

MIT
