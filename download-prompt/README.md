# Download Prompt

Asks how to handle an existing filename when Firefox saves a download directly to its configured download folder.

## Install

Add this URL in Sine:

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/download-prompt
```

Requires Sine script loading and `sine.allow-unsafe-js=true` for installation outside its store. Restart Zen after updating the bundled Sine update guard; that guard stays installed for the browser session.

## Choices

| Choice | Behavior |
|---|---|
| Replace it | Returns the existing destination path to Firefox's download launcher. Firefox handles the file replacement. |
| Keep both | Delegates to Firefox's original save handler, which selects a unique filename. |
| Cancel | Returns a null destination to the launcher. |

Focus starts on **Keep both**. Enter activates the focused button; Escape chooses **Keep both**. An unanswered question chooses **Keep both** after 120 seconds. Closing the window displaying a question also chooses **Keep both**. Closing the window that installed the shared hook preserves questions displayed in other windows.

A second colliding download in the same window keeps both files. Other windows can display separate questions. The `zzdl.mode` setting selects Ask (`0`), Always replace (`1`), or Always keep both (`2`).

## Scope

The mod wraps `promptForSaveToFileAsync` from `resource://gre/modules/HelperAppDlg.sys.mjs`. It checks the preferred download directory, sanitizes the filename with the dialog's `getFinalLeafName`, and asks only when that target is an existing file.

Forced save dialogs and `browser.download.useDownloadDir=false` use Firefox's original handler. Missing or unwritable directories also fall back to that handler. Download entry points that bypass this method are outside the hook's scope.

The question is a labelled native HTML modal dialog appended to `document.body`, with a document-root fallback. Firefox contains keyboard focus and restores it on close. Its stylesheet uses Glassflow tokens with fallback values; inline positioning is applied if the stylesheet has not loaded.

## Hook ownership and diagnostics

The mod probes both the component wrapper's prototype and the imported module prototype. Distinct objects are patched separately. Candidate count cannot establish which object Firefox invokes; that requires runtime tracing on the installed browser.

Only a window that owns a patch removes it during cleanup. When that window retires, another loaded window can install the replacement. A method wrapped by another patch is left intact.

Browser Console (`Ctrl+Shift+J`):

```js
DownloadPrompt.status()
DownloadPrompt.log()
DownloadPrompt.preview()
DownloadPrompt.install()
```

`status()` reports candidate count, active patch count, each candidate's hook state, and the download-folder setting. These fields inspect JavaScript objects; they do not prove that a real download reached the hook. Repeated `preview()` calls resolve the previous preview before displaying another.

## Verification

Run `node --test tools/lifecycle.test.mjs` from the repository root for mocked lifecycle checks. Actual download behavior, file replacement, styling, and XPConnect prototype identity require testing in Zen.

## License

MIT
