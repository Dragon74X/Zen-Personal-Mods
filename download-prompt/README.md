# Download Prompt

> Scope: source at commit `7528d67`; runtime compatibility requires testing against installed Zen, Firefox, and Sine versions.

A replace-or-keep-both question for downloads, for [Zen Browser](https://zen-browser.app/) via [Sine](https://github.com/CosmoCreeper/Sine).

Download a file whose name is already in your downloads folder and Firefox says nothing: it saves the new one as `report(1).pdf` and leaves you to work out, later, which of the two is the one you wanted. Every other program on your machine asks. This mod asks, in the browser window, wearing Glassflow's glass.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/download-prompt
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config`. Sine only runs scripts from mods it did not install from its own store unless that flag is on.

Nothing else to turn on. The question starts appearing straight away.

## The question

It is built inside the browser window, not opened as a dialog window of its own, so it wears Glassflow's look: the sidebar panel's colour recipe, its roundness and corner shape, the sheen, the rim, and glass buttons that pick up the workspace accent.

**Replace it** hands the download the plain name. Nothing is deleted at that moment: the browser writes to a `.part` file and swaps it into place when the download finishes, so a download that fails or is cancelled halfway leaves your existing file exactly where it was.

**Keep both** is what Firefox does today, `report(1).pdf`.

**Cancel** stops the download.

Focus starts on **Keep both**, and Enter and Escape both choose it. The answer that cannot lose a file is the one a stray keypress gives you. A question left unanswered for two minutes chooses it too, so a download is released after the two-minute timeout.

If the mod's stylesheet has not loaded yet, which happens on a fresh install before a restart, the question lays itself out inline instead. The fallback uses inline layout.

`DownloadPrompt.preview()` in the console shows the question against a made-up name, so you can see the styling without downloading anything.

## Styling

Every colour and shape comes from a Glassflow token with a fallback, so turning a knob in Glassflow moves this too and the mod still looks right on its own:

| Part | Follows |
|---|---|
| Panel fill | The floating sidebar panel's recipe: workspace accent, panel opacity, blur tint |
| Shape | Glassflow roundness, and Zen's corner shape |
| Highlight and edges | Glassflow's sheen, rim and glass intensity |
| Buttons | The same sheen and rim, tinted with the accent |

The page behind is **dimmed rather than blurred**. Chrome CSS cannot blur web content, which is the whole reason Glassflow samples the page for its sidebar. The `backdrop-filter` is real all the same: it blurs the browser's own chrome behind the panel, and with Glassflow's **Blur through transparent pages** turned on it starts blurring the page as well.

## Setting

| Setting | Default | What it does |
|---|---|---|
| When a download's name is already taken | Ask me | **Ask me** shows the question. **Always replace the file** and **Always keep both** skip it. |

**Always keep both** is Firefox's own behaviour, so choosing it turns the mod off in everything but name.

## When it does not run

Zen's own setting **Always ask you where to save files** (`browser.download.useDownloadDir`) sends every download through the system save dialog instead, and that dialog asks about replacing on its own. This mod stays out of the way there, and `DownloadPrompt.status()` says so.

The same goes for **Save Link As...**, **Save Image As...** and **Save Page As...**: they open the save dialog, which asks.

## How it works

With **Save files to <folder>** chosen, `promptForSaveToFileAsync()` in `resource://gre/modules/HelperAppDlg.sys.mjs` shows no UI at all: it takes the download folder, hands the name to `DownloadPaths.createNiceUniqueFile()` when something is already there -- that is the silent `(1)` -- and reports the answer back through the download's launcher. The mod wraps that one method.

The wrapper works out the same target the browser is about to use: the preferred download folder, checked the same way the browser checks it, plus the name run through the browser's own sanitiser. If the name is free, a folder is in the way, or the folder is not usable, it steps aside and the browser does exactly what it always did. If a file is there it asks, and answers through the same channel the browser's own code uses:

- **Replace** hands back the plain path, so `createNiceUniqueFile` is never called and no `(1)` file is created. `BackgroundFileSaver` deletes whatever sits at the destination when it moves the finished `.part` file into place, the same path the system save dialog's own replace takes.
- **Cancel** hands back nothing, which is how the browser's code says a download was cancelled.
- **Keep both** delegates to the browser's own method, untouched.

Because the wrapper is async, the question is a plain element in the browser window rather than a modal dialog window: nothing blocks, and the download keeps streaming into its temporary file while you decide. A second download colliding while the question is up keeps both rather than stacking a second question.

The prototype it patches is taken from an instance of the component the download code itself creates, not from a second import of the module: a copy loaded into another global would take the patch and change nothing, which looks exactly like the mod not working. If the import hands back a different object, that one is patched as well, and `status()` reports how many copies were found.

That module is shared by every window, so the patch is installed once and marked. The window that installed it owns it; when that window closes, another live window installs its own copy and the browser's module is never left holding a closed window's code. If another mod has patched the same method on top, this one leaves the chain alone rather than ripping it out.

## Inspecting it

Browser Console (`Ctrl+Shift+J`):

```js
DownloadPrompt.status()   // the setting, whether the hook is in, how many copies of the module carry it, and whether downloads reach it
DownloadPrompt.log()      // recent collisions and what was chosen
DownloadPrompt.preview()  // show the question against a made-up name, to see the styling
DownloadPrompt.install()  // re-install the hook, if something else removed it
```

`status()` answers "why did it not ask": `savesStraightToTheDownloadFolder: false` means the system save dialog is handling it, and `hook` reports anything else.

## License

MIT
