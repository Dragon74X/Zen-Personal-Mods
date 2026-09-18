// ==UserScript==
// @name           Download Prompt
// @description    Asks whether to replace or keep both when a download's name is already taken.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window.
  const INSTANCE_KEY = "__zzdlInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const MOD_ID = "zz-download-prompt";
  const P = "zzdl.";

  // Where the browser decides a download's file name. With "Save files to
  // <folder>" chosen (the default), promptForSaveToFileAsync() shows no UI
  // at all: it takes the download folder, hands the name to
  // createNiceUniqueFile() if something is already there -- the silent
  // "file(1).ext" -- and reports the answer through the launcher. The other
  // path opens the system save dialog, which asks about replacing on its
  // own and is left alone.
  const MODULE = "resource://gre/modules/HelperAppDlg.sys.mjs";
  const CONTRACT = "@mozilla.org/helperapplauncherdialog;1";
  const MARK = "__zzdlPatch";                 // our patch's marker on the shared prototype

  const ASK = 0, REPLACE = 1, KEEP = 2, CANCEL = 3;
  const NAMES = { [REPLACE]: "replace", [KEEP]: "keep both", [CANCEL]: "cancel" };

  // Types are CHECKED, never guessed by attempting reads: calling
  // getIntPref on a string pref throws, and Firefox logs every one even
  // when it is caught.
  function prefNum(full, d) {
    const S = Services.prefs;
    let t;
    try { t = S.getPrefType(full); } catch { return d; }
    try {
      if (t === S.PREF_INT) { const v = S.getIntPref(full); return Number.isFinite(v) ? v : d; }
      if (t === S.PREF_STRING) { const v = parseFloat(S.getStringPref(full)); return Number.isFinite(v) ? v : d; }
    } catch {}
    return d;
  }
  const mode = () => prefNum(P + "mode", ASK);

  let log = [];
  const note = (m) => {
    log.push(`${new Date().toLocaleTimeString()}  ${m}`);
    if (log.length > 100) log.shift();
  };

  // ---- the question ------------------------------------------------------
  // Built inside the browser window rather than opened as a dialog window of
  // its own, so it is styled by this mod's userChrome.css and every
  // Glassflow token on :root -- roundness, corner shape, sheen, rim, the
  // sidebar panel's colour recipe -- applies to it directly.
  const XH = "http://www.w3.org/1999/xhtml";
  const QUESTION = "__zzdlQuestion";           // shared across hook ownership changes

  // The window the download came from, if it is a browser window; the one in
  // front otherwise. A window of some other kind has none of the styling.
  function browserWindow(context) {
    let w = null;
    try { w = context?.getInterface(Ci.nsIDOMWindow); } catch {}
    try { if (w?.document?.documentElement?.getAttribute("windowtype") !== "navigator:browser") w = null; }
    catch { w = null; }
    try { return w || Services.wm.getMostRecentWindow("navigator:browser"); } catch { return w; }
  }

  // The look lives in userChrome.css; this is only what it takes to be
  // seen and clicked when that sheet has not been loaded yet.
  function plainly(host, panel) {
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,0.45)";
    panel.style.cssText = "min-width:320px;max-width:460px;padding:18px;border-radius:12px;" +
      "background:Field;color:FieldText;box-shadow:0 18px 56px rgba(0,0,0,0.5)";
  }

  function ask(win, target, folderPath) {
    return new Promise((resolve) => {
      win[QUESTION]?.(KEEP);
      const doc = win.document;
      const host = doc.createElementNS(XH, "div");
      host.id = "zzdl-ask";
      const add = (parent, cls, text) => {
        const e = parent.appendChild(doc.createElementNS(XH, "div"));
        e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
      };
      const panel = add(host, "zzdl-panel");
      add(panel, "zzdl-title", "That name is already taken");
      add(panel, "zzdl-name", target.leafName);
      add(panel, "zzdl-where", folderPath);
      const row = add(panel, "zzdl-buttons");

      let done = false, bail = null;
      const finish = (choice) => {
        if (done) return;
        done = true;
        try { win.clearTimeout(bail); } catch {}
        try { win.removeEventListener("keydown", onKey, true); } catch {}
        try { win.removeEventListener("unload", onGone); } catch {}
        try { host.remove(); } catch {}
        if (win[QUESTION] === finish) delete win[QUESTION];
        resolve(choice);
      };
      // Escape keeps both: the answer that cannot lose a file is the one a
      // stray keypress gives you. Enter presses whatever button has focus,
      // which starts on Keep both for the same reason.
      const onKey = (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault(); e.stopPropagation();
        finish(KEEP);
      };
      const onGone = () => finish(KEEP);

      const button = (label, cls, choice) => {
        const b = row.appendChild(doc.createElementNS(XH, "button"));
        b.className = "zzdl-btn " + cls;
        b.textContent = label;
        b.addEventListener("click", () => finish(choice));
        return b;
      };
      button("Replace it", "zzdl-replace", REPLACE);
      const keep = button("Keep both", "zzdl-keep", KEEP);
      button("Cancel", "zzdl-cancel", CANCEL);

      win.addEventListener("keydown", onKey, true);
      win.addEventListener("unload", onGone, { once: true });
      (doc.body ?? doc.documentElement).appendChild(host);
      win[QUESTION] = finish;
      // A fresh install runs this script before its stylesheet is loaded.
      // Unstyled, this is a plain block inside a XUL box with no position
      // of its own -- quite possibly invisible, and an invisible question
      // is a download that never starts. Lay it out here if so.
      try { if (win.getComputedStyle(host).position !== "fixed") plainly(host, panel); } catch {}
      // And nothing gets to hold a download open forever on a question the
      // user may never have seen.
      try { bail = win.setTimeout(() => finish(KEEP), 120000); } catch {}
      try { keep.focus(); } catch {}
    });
  }

  // ---- the decision ------------------------------------------------------
  // True when the answer has been handed to the launcher and the browser's
  // own code must not run; false to leave the download entirely alone.
  async function preflight(dialog, launcher, context, name, ext, forcePrompt) {
    if (forcePrompt || !name || !launcher) return false;
    let toFolder = false;
    try { toFolder = Services.prefs.getBoolPref("browser.download.useDownloadDir", false); } catch {}
    if (!toFolder) return false;              // the system save dialog asks about replacing itself
    let m = mode();
    if (m === KEEP) return false;             // the mod is off in everything but name

    const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
    const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
    const dir = new FileUtils.File(await Downloads.getPreferredDownloadsDirectory());
    const target = dir.clone();
    target.append(dialog?.getFinalLeafName ? dialog.getFinalLeafName(name, ext) : name);
    // Nearly every download has a free name, and that costs one look at
    // the disk. Everything else is only worth asking about on a collision.
    if (!target.exists() || !target.isFile()) return false;   // free name, or a folder in the way
    // The same test the browser makes before using the folder. When it
    // fails the browser falls back to its save dialog, which asks anyway.
    if (!dir.exists() || !dir.isDirectory() || !dir.isWritable()) return false;

    if (m !== REPLACE) {
      const win = browserWindow(context);
      if (!win?.document) return false;
      // A second download colliding while a question is up IN THAT WINDOW
      // answers itself: keeping both is what the browser does anyway. A
      // download in another window gets its own question.
      m = win[QUESTION] ? KEEP : await ask(win, target, dir.path);
    }
    note(`${target.leafName} is taken -> ${NAMES[m]}`);
    if (m === KEEP) return false;

    // How the browser's own code hands back an answer: a file to use, or
    // null to cancel. Replacing is then the file saver's job -- it writes a
    // .part file and deletes whatever is at the destination only when the
    // download finishes, so a failed download leaves the old file alone.
    launcher.saveDestinationAvailable(m === REPLACE ? target : null);
    return true;
  }

  // ---- the patch ---------------------------------------------------------
  const mine = new Set();                     // the patches this window installed

  // Probe the component wrapper and imported prototype. Distinct candidates
  // do not prove which one Firefox invokes; keep both until runtime tracing.
  function targets() {
    const found = [];
    const keep = (p) => {
      if (p && typeof p.promptForSaveToFileAsync === "function" && !found.includes(p)) found.push(p);
    };
    try {
      const inst = Cc[CONTRACT].createInstance(Ci.nsIHelperAppLauncherDialog);
      keep(Object.getPrototypeOf(inst.wrappedJSObject ?? inst));
    } catch (e) { note(`could not create the download dialog component: ${e}`); }
    try { keep(ChromeUtils.importESModule(MODULE)?.nsUnknownContentTypeDialog?.prototype); }
    catch (e) { note(`could not read ${MODULE}: ${e}`); }
    if (!found.length) note("no hook: this browser's download code is not shaped the way the mod expects");
    return found;
  }

  function install() {
    let done = 0, held = 0;
    for (const proto of targets()) {
      if (proto[MARK]) { held++; continue; }            // this window's copy, or another window's
      const orig = proto.promptForSaveToFileAsync;
      const fn = async function (launcher, context, name, ext, forcePrompt) {
        let handled = false;
        try { handled = await preflight(this, launcher, context, name, ext, forcePrompt); }
        catch (e) { note(`failed while deciding: ${e}`); }
        if (handled) return undefined;
        try {
          return orig.apply(this, arguments);
        } catch (e) {
          // Inside an async function this would be a rejected promise
          // nobody reads, where the browser used to see the failure and
          // cancel: the download would sit forever with no destination.
          console.error("[DownloadPrompt] the browser's own save handler threw:", e);
          try { launcher?.saveDestinationAvailable(null); } catch {}
          return undefined;
        }
      };
      Object.defineProperty(proto, MARK, { value: { fn, orig }, configurable: true });
      proto.promptForSaveToFileAsync = fn;
      mine.add(fn);
      done++;
    }
    note(`install: ${done} patched, ${held} already had one`);
    return done ? "installed" : held ? "already installed" : "no hook";
  }

  function uninstall() {
    let removed = false;
    for (const proto of targets()) {
      const held = proto[MARK];
      if (!held || !mine.has(held.fn) || proto.promptForSaveToFileAsync !== held.fn) continue;   // gone, or something on top
      proto.promptForSaveToFileAsync = held.orig;
      delete proto[MARK];
      removed = true;
    }
    mine.clear();
    if (!removed) return;
    // The patch is shared by every window but its code lives in this one.
    // Hand it to a window that is staying, so the feature survives and
    // nothing of this window is kept alive by the browser's module.
    try {
      const e = Services.wm.getEnumerator("navigator:browser");
      while (e.hasMoreElements()) {
        const w = e.getNext();
        if (w !== window && !w.closed && w.DownloadPrompt?.install) { w.DownloadPrompt.install(); return; }
      }
    } catch {}
  }

  // ---- declared defaults --------------------------------------------------
  // Sine does not write the defaults declared in preferences.json into the
  // profile, so a row whose condition names an unset pref never shows.
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs;
    let wrote = 0;
    for (const pref of declared) {
      const name = pref?.property;
      const value = pref?.defaultValue;
      if (!name || !name.startsWith(P) || value === undefined || value === null) continue;
      try {
        if (S.getPrefType(name) !== S.PREF_INVALID) continue;   // already chosen
        if (typeof value === "boolean") S.setBoolPref(name, value);
        else if (typeof value === "number") S.setIntPref(name, value);
        else if (typeof value === "string") S.setStringPref(name, value);
        else continue;
        wrote++;
      } catch {}
    }
    return wrote > 0;
  }

  function start() {
    install();

    window.DownloadPrompt = {
      // Is the hook in, and would a download reach it at all?
      status: () => {
        const found = targets();
        const hooks = found.map(proto => {
          const held = proto[MARK];
          return !held ? "not installed"
            : held.fn !== proto.promptForSaveToFileAsync ? "installed, but another patch sits on top"
            : mine.has(held.fn) ? "installed (this window)" : "installed (another window)";
        });
        const m = mode();
        let toFolder = null;
        try { toFolder = Services.prefs.getBoolPref("browser.download.useDownloadDir", true); } catch {}
        return {
          setting: m === REPLACE ? "always replace" : m === KEEP ? "always keep both" : "ask",
          candidateCopies: found.length,
          hookedCopies: found.filter(proto => proto[MARK]?.fn === proto.promptForSaveToFileAsync).length,
          hook: hooks.length ? hooks.join("; ") : "the browser's download module could not be read",
          // With this off the browser opens the system save dialog for every
          // download, that dialog asks about replacing itself, and nothing
          // here ever runs.
          savesStraightToTheDownloadFolder: toFolder,
          generation: instance.generation,
        };
      },
      // Show the question against any name, to see the styling without
      // downloading anything. Returns what was chosen.
      preview: (name = "example.pdf") =>
        ask(window, { leafName: name }, "(preview -- nothing is downloaded)").then((c) => NAMES[c]),
      install,
      log: () => log.slice(),
    };

    // Sine cleanup and window unload can both run; retire this copy once.
    let retired = false;
    const cleanup = () => {
      if (retired) return;
      retired = true;
      // Questions in other windows retain their own handlers and timeout.
      try { window[QUESTION]?.(KEEP); } catch {}
      try { uninstall(); } catch {}
      try { if (window.DownloadPrompt?.install === install) delete window.DownloadPrompt; } catch {}
    };
    try { window.addUnloadListener?.(cleanup); } catch {}
    window.addEventListener("unload", cleanup, { once: true });
    instance.retire = cleanup;
  }

  seedDefaults().catch(() => {});
  try { start(); } catch (e) { console.error("[DownloadPrompt] failed to start:", e); }
})();
