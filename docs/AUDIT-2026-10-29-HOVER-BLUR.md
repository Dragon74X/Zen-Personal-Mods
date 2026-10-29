# Favorites and workspace hover: redundant page-filter updates

Glassflow 3.74.10 removes a shared source of repaint work during icon hover.
This is a measured invalidation fix, not confirmation that all reported Windows
animation stutter is resolved. Iconflow artwork, windups, scale profiles,
preferences and native window controls are unchanged.

## User evidence

Probe v4 reports Zen 1.23.4b on Windows at DPR 1, Glassflow 3.74.9,
Iconflow 1.21.7 and Mediaflow 2.8.2. These are the current preceding releases;
the symptoms cannot be dismissed as an older installation.

The 11 captured runs contain workspace icons only. Favorites appear later in
the accompanying 35.83-second, 30 fps recording, outside those probe runs.
There are 602 style/geometry samples and 2,233 animation-frame intervals:
median 4.17ms, 95th percentile 8.33ms, maximum 216.66ms; 29 exceed 20ms and
seven exceed 33.34ms. These are main-thread callback intervals, affected by
sampling, not compositor presentation times or an FPS benchmark.

The sampled icons have one scale transition at a time, with no observed clock
restart while hover/press state stays unchanged. Parent opacity/greyscale and
child scale have separate roles. The capture does not demonstrate competing
size controllers. It does demonstrate callback gaps, including while hover is
held. No easing or SVG artwork changes follow from that evidence alone.

## Reproduced cause

`transparentPageBlur()` listened to all bubbling `transitionrun` and
`transitionend` events on the toolbox. Descendant icon scale and tab background
transitions therefore scheduled page-filter updates even when the sidebar was
stationary. Each update wrote 13 unchanged SVG attributes: filter bounds,
flood/blur bounds and blur radius.

Native Zen 1.23.4b / Gecko 158.0.1, temporary Linux profile, transparent page,
compact sidebar shown, actual CSS hover-in/out transitions:

| Target | Transition events | SVG writes before | SVG writes after |
| --- | ---: | ---: | ---: |
| Workspace | 4 | 52 | 0 |
| Favorite / Essential | 8 | 78 | 0 |

Updates now respond to the toolbox's own `translate` transition, including
cancellation. Existing sidebar state, resize and preference observers remain.
The running slide still follows its native animation frame by frame. Attribute
writes compare values first, and the inline filter is assigned only when first
acquired. A `TabSelect` listener explicitly checks page transparency instead of
depending on unrelated descendant transitions. Cleanup removes that listener.

## Verification

```sh
MOZ_DISABLE_CONTENT_SANDBOX=1 MOZ_DISABLE_RDD_SANDBOX=1 \
  python3 tools/zen-smoke.py --zen /path/to/zen
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs \
  node --test tools/*.test.mjs
```

The repository gate passed 235 checks with zero failures; its one optional
Morph runtime entry was skipped. The separate full `zen-smoke.py` native run
passed. Added assertions verify both icons still reach 1.30x scale with zero
filter mutations, unchanged resize/cancel events do not write filter values,
and simulated tab-selection notifications release and restore the filter as
browser transparency changes. Existing checks cover 24 sidebar visibility cases
across remote transparent/opaque pages and settings, including preservation
and restoration of another inline filter. Pixels outside the sidebar have zero
measured difference. The under-panel stripe fixture remains blurred (channel
standard deviation 0.94 versus 116.49 with blur off in the original run).
The fixture explicitly controls browser background transparency; this is not
an end-to-end test of third-party transparency mods.

After workspace cleanup, the production JavaScript and native harness were
recovered byte-identically (Git blobs d58e4bb274e4b70cbddaee89ad8d7b00ceb63975
and 0269fffc3bacb9d799f4635d54e71befc72441d0); both checks were rerun before release.
Windows desktop compositor pacing and moving-SVG antialiasing remain unverified
by the Linux run. Recheck Favorites/workspace motion after this release before
changing their animation curves or rasterization strategy.
