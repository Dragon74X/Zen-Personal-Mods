# Mod releases

Sine checks `theme.json.updatedAt`, not `version`, to discover updates.
Whenever changing an installable mod, bump its version and set `updatedAt` to the
current UTC ISO timestamp, strictly later than its previous release. Keep any
runtime version string in sync. Do not update unchanged mods' timestamps.

Run `node --test tools/*.test.mjs` before publishing. With upstream Sine available,
set `SINE_MANAGER_SOURCE` to its `src/core/manager.sys.mjs` to include update tests.
The automatic update source is `main`.
