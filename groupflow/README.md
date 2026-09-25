# Groupflow

Runtime compatibility requires testing against installed Zen, Firefox, and Sine versions.

Nested-group persistence, native controls and startup folding, with glass theming
for groups and subgroups in [Glassflow](../glassflow)'s visual language.
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

## Startup folding

After each window restores its session, top-level groups/folders open and all
nested groups/subfolders fold. This covers `tab-group` and `zen-folder` elements
across workspaces; split-view groups are excluded. Zen retains its native handling
of selected tabs inside collapsed folders.

Folding runs once per window, independently of styling and favicon settings.
Manual toggles, groups created later, and Sine reinjections do not repeat the pass.
When updating an already-running copy, restart Zen to apply the new startup behavior.

The pass waits for Zen startup initialization, restores saved nesting, then uses
the native `collapsed` setter, including accessibility updates and collapse events.
Hierarchy updates follow group events and flush before SessionStore closes the window.
Groupflow also saves parent labels, colours and workspace IDs in `groupflowGroups`:
Zen does not recreate plain groups containing only subgroups on its own.

Clicking a top-level group/folder header keeps the parent open and alternates
between collapsing and expanding its nested subgroups/subfolders. The selected
tab's entire folder path stays open. If any other subfolder is open, the click
collapses those other subfolders; the next click opens them. Nested headers and
groups without subfolders still toggle individually.
Close and reset controls retain their existing actions.
This works with or without ATG and does not change startup folding.

Folder labels retain the theme's toolbar text colour when a tab inside is selected.
The Label colour setting overrides this foreground without changing the header fill.
Subfolder state labels can override that shared setting.

## Subfolder states

**Separate subfolder styling** enables 3 profiles for nested group headers:

- **Active:** contains the selected tab, including deeper subfolders. Takes priority over hover.
- **Hovered:** inactive header under the pointer. Hovering a tab or subfolder body does not highlight its ancestors.
- **Inactive:** neither active nor hovered.

Each profile controls tint, background opacity, gradient direction, end mode,
end tint, spread, sheen, rim, glow, blur, blur radius and label colour.
Defaults retain the group's saved ATG colour or complete gradient. Without a
saved gradient, all 3 states start at 25% tint, fading left to right to transparent
at 50% of the header. Sheen, rim, glow and blur start off. Folder colours do not
inherit Glassflow's darkening; selecting **Glassflow accent** enables that source.
Choose another **Gradient end** mode to replace a saved gradient with the tint,
direction and spread controls. Other state controls also apply to saved gradients.
Background opacity leaves text and icons unchanged. Shared collapsed dimming
still applies to inactive collapsed headers. Colour source, icon settings,
roundness and connector geometry remain shared.

**Icon shape → Match folder corners** applies the header's corner shape to icon
crops and scales the radius to the icon size. Existing Circle, Rounded square,
Squircle, Square and Auto choices remain available.

Optional effects reuse Glassflow's shared sheen, rim colours, glass intensity and
filter tokens, with fallbacks when Glassflow is absent. Top-level groups use the
same 25% starting tint; native `zen-folder` styling is unchanged. Turning the
subfolder switch off uses the shared Header/States settings.
When replacing a saved ATG gradient, tint controls use its first valid colour stop;
an invalid colour falls back to the theme accent. Updating from 1.44.0 migrates
unchanged state profiles once. Edited profiles retain all their values.

## Without Advanced Tab Groups

Groupflow supplies group persistence and controls when ATG is absent:

- Click the header or favicon to fold/expand. Icon changes use Sine's Groupflow
  settings, including Icon rules; left-click does not open a picker.
- Right-click a header for Firefox's group editor: rename, 9 native colours,
  new tab, close and ungroup. Ungroup moves direct items out while retaining subgroups.
- On header hover or keyboard focus, the X replaces the favicon in the same slot.
  It uses the native close API, including beforeunload cancellation.
- Native drag handling supplies nesting and movement; header edges accept insertion.
- Saved ATG parents, icons and colours use the existing `tabGroupParents`,
  `tabGroupIcons` and `tabGroupColors` window values. Emoji, SVG icons, saved favicon
  colours and gradients are restored, including after Zen refreshes group colours.
  Native colour selections take precedence
  over previous ATG colours. Malformed maps are retained without overwriting them.
- Metadata remains while a group is open, saved or available in Firefox's
  closed-tab/group history. Restoring a closed parent retains its subgroups.
  Split groups and native pinned folders keep their native controls.

ATG's gradient editor, favicon-colour resampling, group/folder conversion and Zen
Library integration are not included. Existing gradients remain visible by default; new
colour selections use Firefox's palette. Groupflow icon rules override saved icons,
followed by Tab Router section icons and tab favicons.

**Label weight** now applies consistently with or without ATG. Choose **Regular**
for ATG's usual 400 weight; Semibold is 600 and Bold is 700. Existing settings are
retained.

When ATG is still loaded, it continues supplying these controls and persistence.
Groupflow loads after its scripts, disables ATG's force-open Arc behaviour and
updates its saved collapse states. Cleanup restores ATG's original method.

To switch: update Groupflow while ATG is still active so it records the existing
parents, disable ATG in Sine, then fully quit and reopen Zen.
Check the restored hierarchy and icons before uninstalling ATG. Restart after
uninstalling as well. ATG does not provide a complete live-unload path.

Groupflow enables native `browser.tabs.groups.enabled` when no user value exists;
an explicit user value is preserved. Checks: `node --test tools/lifecycle.test.mjs`
and `python tools/zen-routing-smoke.py --zen /path/to/zen`.

## What it styles

**Headers** — accent tint and gradient, roundness, optional sheen, rim light
and glass blur. The accent uses the group's own colour by default. **Tab container
colour** uses the most common container across all member tabs, including nested
groups; ties use the first encountered tied container. It reads Firefox's container
colour and follows container-colour edits. Empty groups and a majority of
non-container tabs fall back to the group colour. Glassflow accent and Custom
apply one colour across groups. Saved ATG gradients apply only with **Group's own
color**, so they cannot override a selected container or custom accent.

**Label text** — alignment, weight, size, colour, italic, underline,
uppercase, and a favicon in place of the group icon.

**States** — active-group highlight, collapsed-group dim.

**Nesting** — subgroup indent, row inset and gap, and a whole connector
system: accent guide lines with gradient, thickness, shape (including curves),
caps, sheen, rim, glow, shadow and blur; plus per-tab and per-subgroup
membership marks with their own shading, glow, shadow, size and opacity.
Headers can shrink per depth level.

Zen folder styling is untouched — `zen-folder` is a different element and Folder
Tree Connectors owns it. Split-view groups are excluded throughout.

## Favicons as group icons

`groupflow.uc.js` assigns each group the favicon of its dominant domain, as
`--zzgf-icon`. It counts the group's *direct* member tabs, so a subgroup
computes its own; a parent whose direct children are all subgroups borrows
from the first one, so it still gets an icon.

Icons use the member tab's cached favicon, including restored and unloaded tabs.
If unavailable, `page-icon:` reads Firefox's local favicon store for the dominant
host. Groups with no eligible web tabs show a native folder icon instead of an
empty backing plate. Icon rules and Tab Router's section pictures still take priority.

Favicon changes and new Tab Router pictures share a 500 ms debounce, with a
2-second startup pass. Standalone group lifecycle changes refresh during their
metadata update. Collapse/expand does not scan or serialize Groupflow metadata.
Icon removal and history clearing refresh immediately and cancel queued refreshes.

Turn off **Favicon as group icon** to stop favicon assignment; startup folding remains active.

### Pictures from Tab Router

Tab Router can hand a subgroup its own picture: a YouTube channel avatar, a
Nexus game cover, a GitHub avatar. **Pictures from Tab Router** draws them;
off, those groups fall back to the favicon. **Icon shape** applies to every
icon: auto draws avatars round and everything else as a rounded square, or
pick circle, rounded square, squircle or square for all of them. **Icon
size** sets the slot.

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

Zen **folders** (`<zen-folder>`) keep Zen's own icon, set from the folder's
right-click menu.

## How it overrides Advanced Tab Groups and Arc

The stylesheet for mod id `zz-groupflow` imports after `advanced-tab-groups`, `Arc-2.0` and
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

**Corner shape** defaults to *Follow Zen*, including Glassflow's **Turn squircles
off browser-wide** setting. Explicit shapes take precedence; *Round (classic)*
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
