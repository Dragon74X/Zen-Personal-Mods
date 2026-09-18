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

## Regression checks

```sh
node --test tools/*.test.mjs
SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/*.test.mjs
```

The second command also executes upstream Sine's update/install methods with mocked filesystem and network APIs. Tests target Sine commit `fb0bd4ca6af888f10648e126947f7d1f82228433`; browser API fakes do not verify live Zen compatibility.

Each mod ships the same Sine update guard so it can install independently. The guard serializes updates, installs, and sibling dependencies while upstream uses one shared `temp` directory. Restart Zen after updating this guard: its replacement takes effect in the next browser session.
