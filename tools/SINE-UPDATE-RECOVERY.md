# Recover an update check stuck on “...”

In the [recovery script](sine-update-recovery.js), click **Copy raw file**. Paste
once into Zen's **Browser Console** (Ctrl+Shift+J), then press Enter.

It runs the ordinary Sine update check, including under the older installed guard.
The old guard can reject one mod with nested paths after the other mods have
updated. The recovery check waits for the transaction and verifies the release's
guard files on disk. It never reinstalls a mod, overrides a disabled update, or
deletes a profile, backup, session or preference.

- **`readyToRestart: true`**: restart Zen once. The corrected guard is on disk.
- **`fixedGuardActive: true`** with **`updated`** or **`up-to-date`**: the
  corrected check is already running. No restart is needed for this repair.
- Otherwise return the copied JSON or the ZIP named by `archiveInTemp` in
  **%TEMP%**. If `check` is `still-running`, leave Zen open; the three-minute
  reporting deadline never interrupts a native file operation.

The script creates its folder and ZIP locally and copies its result automatically.
Output contains fixed status labels and counts, without mod names, URLs, raw
exceptions, usernames or profile paths. No report is uploaded.
