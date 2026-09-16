# Download Prompt

A replace-or-keep-both question for downloads, for [Zen Browser](https://zen-browser.app/) via [Sine](https://github.com/CosmoCreeper/Sine).

Download a file whose name is already in your downloads folder and Firefox says nothing: it saves the new one as `report(1).pdf` and leaves you to work out, later, which of the two is the one you wanted. Every other program on your machine asks. This mod asks.

## Install

```
https://github.com/Dragon74X/Zen-Personal-Mods/tree/main/download-prompt
```

Requires `sine.allow-unsafe-js` set to `true` in `about:config`. Sine only runs scripts from mods it did not install from its own store unless that flag is on.

Nothing else to turn on. The question starts appearing straight away.

## The question

```
report.pdf is already in /home/you/Downloads.

[ Replace it ]  [ Keep both ]  [ Cancel ]
[ ] Do this for every download from now on
```

**Replace it** hands the download the plain name. Nothing is deleted at that moment: the browser writes to a `.part` file and swaps it into place when the download finishes, so a download that fails or is cancelled halfway leaves your existing file exactly where it was.

**Keep both** is what Firefox does today, `report(1).pdf`.

**Cancel** stops the download.

Enter and Escape both choose **Keep both**. The answer that cannot lose a file is the one a stray keypress gives you.

The checkbox writes the setting below, so a habit only has to be stated once. It is offered for Replace and Keep both, never for Cancel.

## Setting

| Setting | Default | What it does |
|---|---|---|
| When a download's name is already taken | Ask me | **Ask me** shows the question. **Always replace the file** and **Always keep both** skip it. |

**Always keep both** is Firefox's own behaviour, so choosing it turns the mod off in everything but name.

## When it does not run

Zen's own setting **Always ask you where to save files** (`browser.download.useDownloadDir`) sends every download through the system save dialog instead, and that dialog asks about replacing on its own. This mod stays out of the way there, and `DownloadPrompt.status()` says so.

The same goes for **Save Link As...**, **Save Image As...** and **Save Page As...**: they open the save dialog, which asks.

## How it works

Firefox decides a download's file name in `validateLeafName()`, in `resource://gre/modules/HelperAppDlg.sys.mjs`. That function appends the suggested name to the download folder and, if something is already there, hands it to `DownloadPaths.createNiceUniqueFile()`, which counts up until it finds a free `(n)` and creates the file to reserve it. That is the whole of the silent rename, and it is the one function this mod wraps.

The wrapper looks at the name first. If it is free, or a folder is in the way, it steps aside and the browser does exactly what it always did. If a file is there it asks, and:

- **Replace** returns the plain path, never calling `createNiceUniqueFile`, so no `(1)` file is ever created. `BackgroundFileSaver` deletes whatever sits at the destination when it moves the finished `.part` file into place -- the same path the system save dialog's own replace takes.
- **Cancel** cancels the launcher and then returns that path anyway. `ContinueSave` drops a destination for a cancelled download without touching it, so nothing is written, renamed or deleted. If the cancel cannot be delivered, the mod keeps both rather than replacing something you asked not to download.

Two downloads colliding at the same moment would stack one modal window on another, so the second one keeps both.

That module is shared by every window, so the patch is installed once and marked. The window that installed it owns it; when that window closes, another live window installs its own copy and the browser's module is never left holding a closed window's code. If another mod has patched the same function on top, this one leaves the chain alone rather than ripping it out.

## Inspecting it

Browser Console (`Ctrl+Shift+J`):

```js
DownloadPrompt.status()   // the setting, whether the hook is in, and whether downloads reach it
DownloadPrompt.log()      // recent collisions and what was chosen
DownloadPrompt.install()  // re-install the hook, if something else removed it
```

`status()` answers "why did it not ask": `savesStraightToTheDownloadFolder: false` means the system save dialog is handling it, and `hook` reports anything else.

## License

MIT
