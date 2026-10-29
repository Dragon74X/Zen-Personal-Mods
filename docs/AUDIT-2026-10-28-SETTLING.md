# Icon settling follow-up — 28 October 2026

The updated Windows capture reports Iconflow 1.21.5, Glassflow 3.74.7 and
Mediaflow 2.8.2. All 12 motion runs keep parent transforms at `none`; the six
Morph runs keep image centers fixed. Menu assets now resolve through chrome
URLs, with zero Morph menu owners when menu animation is off. The accompanying
10.7-second, 30fps video isolates workspace-icon resizing.

Workspace hover still used a separate 450ms spring with 19.9% overshoot of the
travel distance, regardless of Motion feel. The capture reaches scale 1.35966
for a 1.30 target, then crosses below the target before settling. At 18px that
is approximately 24.47px instead of the intended 23.4px. A native regression
fails on the released code with `workspace profile 0 zero overshoot true`.

Reuse the existing five Motion feel curves for workspace and Essentials sizing,
the workspace active dot, and Morph image press feedback. Delete Glassflow's
unused duplicate spring. Crisp now uses 150ms with no overshoot; Soft uses 210ms
with no overshoot. Spring, Bounce and Rebound retain their existing 240/270/290ms
curves. Iconflow alone falls back to Crisp. Size targets, approved Morph artwork,
windup choreography, native window controls, stored settings and commands remain
unchanged. No new settings, dependencies, timers or runtime JavaScript.

Probe v3 adds the selected profile and hover/press/focus state to distinguish
pointer-triggered reversals from spontaneous restarts. Existing 20-second
clipboard capture and teardown remain.

An isolated native pixel experiment at DPR 1 compared 32 frames each of compact
and overflow sprites at 18/20/22px: duplicate static drawings were byte-identical
across frames, and compact's stationary right edge did not change. This does not
establish Windows frame pacing or antialiasing. Fractional DPR 1.25 showed sampling
variation at 18/22px, outside this capture's DPR 1; no rasterization change is
included in this release.

## Verification and release

- Required Node gate with upstream Sine: 234 passed, zero failures, one optional
  native test skipped; native checks ran separately.
- Native Zen 1.23.4b: 177 assertions, 30 profile/direction cases (five profiles,
  three targets, enter/leave), 222 sprite paint cases, eight close-glyph cases
  and four unchanged window-control pixel comparisons. Crisp and Soft have zero
  measured overshoot and no direction reversals. Interrupted hover settles;
  reduced motion, native commands and cleanup pass.
- Probe v3 automatically copies and removes hooks. The harness waits for actual
  probe cleanup before reading the clipboard, avoiding a fixed-delay race.
- `git diff --check` passes. Windows GPU frame pacing remains unmeasured.

Release: Glassflow 3.74.8 and Iconflow 1.21.6. Mediaflow remains 2.8.2.

## Competing-owner check

Five workspace runs contain 298 samples, each with at most one image scale
animation; every parent scale/transform is `none`. Six Morph runs contain 364
samples, each with at most one frame animation and fixed host/image bounds.
Zen 1.23.4b's bundled `ZenSpaceIcons.mjs` scrolls hovered buttons into view and
handles reordering; it does not run a second icon scale animation. Native
workspace CSS has a dot-shrink transform, overridden by Glassflow's existing
image rule. The selected Arc workspace style 3 disables Arc's workspace pulse.
Iconflow's completion pulse explicitly excludes Morph-owned images and hosts.

Workspace grayscale/opacity transitions run on the parent while scale runs on
the image. They affect appearance concurrently, but this capture contains no
second size controller. These findings cover the sampled paths, not every
possible source of Windows rendering artifacts.
