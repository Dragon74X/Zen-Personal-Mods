# Automatic native-blur capture (Windows)

Enable Zen's native acrylic/sidebar blur and restart Zen before testing. The
cross-slice renderer switch is read at startup; changing a preference during a
probe cannot establish that the renderer enabled it.

Run the complete [native-blur-probe.js](native-blur-probe.js) in the **Browser
Console**, or run this loader there:

```js
(async () => {
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  if (!w) throw Error('No browser window');
  const response = await w.fetch('https://raw.githubusercontent.com/Dragon74X/Zen-Personal-Mods/63ef36b76074ef56cf24ea58bd7006cc762ec0bb/tools/native-blur-probe.js',
    { signal: w.AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Probe download: HTTP ' + response.status);
  const code = await response.text();
  const file = Services.dirsvc.get('TmpD', Ci.nsIFile);
  file.append('zen-native-blur-probe.js');
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  try {
    await IOUtils.writeUTF8(file.path, code);
    return await Services.scriptloader.loadSubScriptWithOptions(
      Services.io.newFileURI(file).spec,
      { target: w, ignoreCache: true, wantReturnValue: true, allowUnsafeURL: true }
    );
  } finally {
    await IOUtils.remove(file.path);
  }
})().catch(error => {
  const text = JSON.stringify({ probe: 'native-blur-loader', errors: [String(error)] }, null, 2);
  console.error(text);
  Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);
});
```

The loader uses a pinned revision and Firefox's local-file script loader. Its
`allowUnsafeURL` option permits that temporary `file:` URL; it does not change CSP
or enable page `eval()`. The old fetch-then-eval loader was blocked by chrome CSP
before the probe could start. The temporary script is removed after execution;
download/load errors are automatically copied too.

The report identifies this revision as `native-blur-v3`. Each case publishes its
own request and reply exactly once. Neither side replaces a file the other side
may still be reading. This removes version 2's Windows file-sharing race on the
reused `request.json` and `response.json`. Malformed or mismatched messages fail
explicitly instead of being silently polled until timeout.

Version 1 failed before
the first PNG: PowerShell's comma operator grouped a crop-coordinate expression
into an array before subtraction. Version 2 constructs typed points directly.
Worker failures now include the failing stage, PowerShell error identifier and
script line, including startup failures.

It starts immediately, requests focus for the fixture window, and normally takes
about 40 seconds. Keep that window in front and unobscured while it runs. The
foreground check refuses other windows, including the Browser Console. **Stop + copy** is
optional. There are no phase/start/rating buttons.

The probe creates a generated striped tab, masks sidebar labels, and compares:

- Left and right compact sidebar.
- Opaque and transparent page backgrounds.
- Normal and reduced-transparency preferences.
- No-blur reference; installed behavior; native backdrop with Glassflow's page
  strip filter disabled; that same comparison with the redraw nudge suppressed.

“Native” here retains the installed backdrop recipe and other installed theme
rules; it is **not a stock Zen profile**. The page-filter and redraw owners are
isolated, not all of Glassflow. The no-blur reference is checked before capture.
The probe never changes native acrylic or graphics startup preferences.

A local Windows PowerShell worker uses `Graphics.CopyFromScreen` for the two
small fixture crops in each case. It checks the foreground process, unique test
title, physical/CSS coordinate ratio, and crop occlusion before capture. The
worker is stopped before restoring user content. It neither uploads captures nor
reads site URLs. User preferences, selected tab, temporary styles and attributes
are restored; the fixture closes. A 150-second controller deadline and a
170-second independent worker deadline bound the run.

The JSON report automatically replaces the clipboard. Its `archive` field gives
the local ZIP containing PNG crops and `report.json`. Send that ZIP and the copied
JSON back. An unsupported platform, unavailable worker, blocked/occluded window,
or invalid geometry produces an explicit error report rather than invented
pixel results. A Windows policy that blocks PowerShell can prevent capture.

## Evidence and limits

- Node lifecycle checks exercise all 32 cases, cancellation, capture failure, window closure,
  unsupported OS, worker startup failure and cleanup failure.
- `powershell -NoProfile -File tools/native-blur-worker.test.ps1` executes the
  shipped worker's geometry and occlusion code, with only Win32 calls substituted.
  Five coordinate cases cover left/right crops, fractional scale, negative desktop
  coordinates, rounding and minimum crop size. Nine rejection cases retain
  occlusion, size and scale checks; the error-journal check verifies failure details.
  CI runs this on Windows PowerShell 5.1, the engine the probe launches. It also
  runs with `pwsh`. These are arithmetic/control-flow checks, not screen capture.
- `node --test tools/native-blur-ipc.test.mjs` exercises the shipped PowerShell
  transport in another process, substituting only desktop capture. On Windows it
  holds prior request/reply files open without delete sharing, reproduces the
  rejected replacement, then completes all 32 per-case exchanges. It also checks
  partial temporary files, invalid JSON, wrong IDs and stopping. Windows CI uses
  PowerShell 5.1; on other hosts set `PWSH` to a PowerShell executable. No screen
  pixels or user data are used by this check.
- `python3 tools/zen-smoke.py --zen /path/to/zen --probe-loader` exercises the
  documented loader through the actual Browser Console evaluation actor. It
  reproduces the old CSP failure, loads an unmodified probe from a local HTTP
  fixture, and checks clipboard reporting and temporary-file cleanup, including
  download/compile failures. It leaves CSP enabled and does not exercise Windows
  screen capture.
- A disposable Linux Zen 1.24b test exercises actual chrome geometry, the same
  phases, preference/UI restoration and ZIP creation with a **simulated screen
  worker**. It caught a reference-selector conflict with the redraw rule before
  delivery.
- The Windows worker/GDI path has produced PNGs in a partial desktop run. The
  complete 32-case Windows matrix remains **unverified**. Neither headless
  screenshots nor the simulated backend establish backdrop rendering.
- The PNGs are settled-state crops, not a measurement of animation smoothness,
  GPU frame pacing or performance savings. Compare stripe detail and the outside
  control crop; reduced-transparency cases should be opaque. Black/blank or
  unchanged crops are data to investigate, not an automatic pass.
- Keep the production transparent-page filter and redraw nudge until the Windows
  captures establish that removing each preserves the required rendering.

Primary APIs: [CopyFromScreen](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.graphics.copyfromscreen),
[ClientToScreen](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-clienttoscreen),
[GetClientRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclientrect),
[PowerShell operator precedence](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_operator_precedence).
