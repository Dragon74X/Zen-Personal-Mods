# Mod releases

Sine checks `theme.json.updatedAt`, not `version`, to discover updates.
Whenever changing an installable mod, bump its version and set `updatedAt` to the
current UTC ISO timestamp, strictly later than its previous release. Keep any
runtime version string in sync. Do not update unchanged mods' timestamps.

Run `node --test tools/*.test.mjs` before publishing. With upstream Sine available,
set `SINE_MANAGER_SOURCE` to its `src/core/manager.sys.mjs` to include update tests.
The automatic update source is `main`.

# Settings menus

Glassflow and Groupflow show one page at a time through `*.ui.page`. Every row
after the picker carries the page condition first, then its own conditions
(`tools/settings.test.mjs` enforces this). Colours belong to Glassflow; other
mods say where to find them rather than adding their own colour settings.

# Window controls

Preserve the existing close, minimize, maximize and restore button glyphs and
behavior. Keep them outside Iconflow/Morph artwork and animation changes unless
the user explicitly requests changes to those window controls.

# Diagnostics

Start collecting immediately when a probe runs. Discover targets and advance
phases automatically; never require F8, target selection, Begin/Next buttons or
rating choices. Keep only an optional Stop + copy control. Restore temporary
styles, CSS state locks and UI state on completion, cancellation and a bounded
deadline, then auto-copy the report. Diagnose installed versions and available
APIs without requiring a mod update merely to run the probe.

Distinguish automated CSS-state tests from real pointer/OS input and rendered
pixels. Synthetic clicks or direct commands cannot verify physical input
delivery. Timing/computed values alone cannot certify visual smoothness.
