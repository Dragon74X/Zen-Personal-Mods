# Automatic console-origin capture

For recurring bare `NS_ERROR_NOT_AVAILABLE` or `Object { message }` exceptions,
paste the complete [console-origin-probe.js](console-origin-probe.js) into Zen's
**Browser Console**. It starts immediately, includes available recent native
console errors, listens for 60 seconds, then removes its listeners and auto-copies
JSON. Use the browser normally while it records; no Begin/Next buttons or manual
phase selection are needed. Return the copied JSON for diagnosis.

The bounded report includes source, line and supplied stack, consolidates repeats,
excludes web-page error sources and redacts URL/path text. It never uploads data,
changes preferences or stores a recording in the profile. Missing native stacks
cannot be reconstructed. Do not publish raw user reports in the repository.

For an early exit only, `window.__zzConsoleOriginProbe?.stop()` also cleans up and
copies. Closing the browser window finishes the capture. Node checks cover bounds,
redaction and deadline/window-close cleanup; the native console runner checks a
real `nsIScriptError` source and clipboard output.
