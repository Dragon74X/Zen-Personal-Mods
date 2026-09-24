# Zen Personal Mods

Source-targeted Zen Browser modifications.

| Mod | Function |
|---|---|
| [Download Prompt](download-prompt/) | Handles duplicate download filenames |
| [Glassflow](glassflow/) | Shared UI token and surface styles |
| [Groupflow](groupflow/) | Tab-group icons and styling |
| [Tab Router](tab-router/) | Rule-based tab grouping |
| [Tab Unloader](tab-unloader/) | Time-based tab unloading |
| [Zen Turbo](zen-turbo/) | Preference packs with captured-value restoration |

## Runtime requirements

Each mod contains a `.uc.js` script and requires Sine user-script loading. Compatibility depends on current Zen, Firefox, and Sine internals; test after updates.

Run `tools/check.js` in Firefox Browser Console (`Ctrl+Shift+J`). It requires Firefox chrome globals and does not run under Node.

Individual READMEs define settings, exclusions, and known limits.

[September 18 audit](docs/AUDIT-2026-09-18.md): findings, pinned upstream sources, native blur checks and remaining runtime limits.

## Regression checks

```sh
node --test tools/*.test.mjs
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs
```

The second command also executes upstream Sine's update/install methods with mocked filesystem and network APIs. Tests target Sine commit `fb0bd4ca6af888f10648e126947f7d1f82228433`; browser API fakes do not verify live Zen compatibility.

Each mod ships the same Sine update guard so it can install independently. The guard serializes updates, installs, and sibling dependencies while upstream uses one shared `temp` directory. Restart Zen after updating this guard: its replacement takes effect in the next browser session.

For an isolated runtime check with a disposable profile and Pillow installed:

```sh
python tools/zen-smoke.py --zen /path/to/zen --arc /path/to/Arc-2.0 --transparent /path/to/zen-themes/TransparentZen
```

This starts all six scripts, checks the native transparent-page blur and modal dialog, and verifies cleanup. It does not benchmark the GPU or contact an existing browser profile. Arc and Transparent Zen are optional.

For folder restoration and container routing with Advanced Tab Groups installed locally:

```sh
python tools/zen-routing-smoke.py --zen /path/to/zen --atg /path/to/Advanced-Tab-Groups
```

This uses a local fixture server and a disposable profile across three launches.
It checks nested folding with ATG's Arc mode, cached/custom icons, manual toggles,
loading iframe pages, and container repairs that preserve deeper subgroups.

## Sine update recovery

The guard prevents overlapping install/update operations while loaded. It cannot reconstruct files already missing from an interrupted install. Restart after obtaining the updated guard. If a mod still has missing files, reinstall affected mods one at a time from their folder URLs, waiting for each install to finish. Install a working guard copy and restart before attempting another batch update. Do not move Sine's `temp` or extracted subfolders during a running install; those paths can be legitimate staging files.
