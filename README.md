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

Run repository checks:

```sh
node tools/check.js
```

Individual READMEs define settings, exclusions, and known limits.
