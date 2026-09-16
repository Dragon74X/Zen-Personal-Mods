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
  // <folder>" chosen (the default), every download goes through
  // validateLeafName(), and that is the one line of Firefox that turns a
  // name already on disk into "file(1).ext" without asking. The other path
  // -- "Always ask you where to save files" -- opens the system save
  // dialog, which asks about replacing on its own, so it is left alone.
  const MODULE = "resource://gre/modules/HelperAppDlg.sys.mjs";
  const MARK = "__zzdlPatch";                 // our patch's marker on the shared prototype
  const ABORTED = 0x804b0002;                 // NS_BINDING_ABORTED

  const ASK = 0, REPLACE = 1, KEEP = 2, CANCEL = 3;

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
  // Enter and Escape both land on "Keep both": the answer that cannot lose
  // a file is the one a stray keypress gives you.
  let asking = false;
  function ask(leafName, folderPath) {
    const p = Services.prompt;
    const flags = p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING +
                  p.BUTTON_POS_1 * p.BUTTON_TITLE_IS_STRING +
                  p.BUTTON_POS_2 * p.BUTTON_TITLE_IS_STRING +
                  p.BUTTON_POS_1_DEFAULT;
    const again = { value: false };
    let pressed;
    asking = true;
    try {
      pressed = p.confirmEx(
        Services.wm.getMostRecentWindow("navigator:browser"),
        "Download",
        `${leafName} is already in ${folderPath}.`,
        flags,
        "Replace it", "Keep both", "Cancel",
        "Do this for every download from now on", again);
    } finally { asking = false; }
    const choice = pressed === 0 ? REPLACE : pressed === 2 ? CANCEL : KEEP;
    // Replace and Keep both are exactly the two settings; Cancel is not a
    // rule anyone would want applied to every download unattended.
    if (again.value && choice !== CANCEL) {
      try { Services.prefs.setIntPref(P + "mode", choice); } catch {}
    }
    return choice;
  }

  // ---- the decision ------------------------------------------------------
  // Returns the file the download should use, or null to leave the
  // browser's own naming alone.
  function decide(dialog, folder, leaf, ext, allowExisting, afterPicker) {
    // allowExisting means the save dialog already asked about replacing and
    // the user said yes. Asking twice would be rude.
    if (allowExisting || !folder || !leaf) return null;

    let target;
    try {
      target = folder.clone();
      // The browser sanitises the suggested name before looking on disk;
      // the same name has to be used here or the collision is missed.
      target.append(dialog?.getFinalLeafName ? dialog.getFinalLeafName(leaf, ext, afterPicker) : leaf);
      if (!target.exists() || !target.isFile()) return null;     // free name, or a folder in the way
    } catch (e) { note(`could not look at the target: ${e}`); return null; }

    let choice = mode();
    if (choice !== REPLACE && choice !== KEEP) {
      // Two downloads colliding at once would stack one modal window on
      // another; the second keeps both, which is what Firefox does anyway.
      choice = asking ? KEEP : ask(target.leafName, folder.path);
    }
    note(`${target.leafName} is taken -> ${{ [REPLACE]: "replace", [KEEP]: "keep both", [CANCEL]: "cancel" }[choice]}`);

    // Replacing is the browser's own job: the file saver writes to a .part
    // file and deletes whatever is at the destination when the download
    // finishes. A download that fails leaves the old file untouched.
    if (choice === REPLACE) return target;

    if (choice === CANCEL) {
      // Stop the download and hand back a path anyway: the browser drops a
      // destination for a cancelled launcher without touching it. If the
      // cancel does not take, keep both rather than replace something the
      // user asked not to download at all.
      try { dialog.mLauncher.cancel(ABORTED); return target; }
      catch (e) { note(`could not cancel, keeping both instead: ${e}`); return null; }
    }
    return null;
  }

  // ---- the patch ---------------------------------------------------------
  // One shared module serves every window, so the patch is installed once
  // and marked. The window that installed it owns it; when that window
  // goes, another live one takes over (see uninstall), so the browser's
  // module never holds a closed window's code.
  let mine = null;

  // The prototype the browser's own component actually uses. Importing the
  // module a second time is meant to hand back the same object, but a copy
  // living in another global would take the patch and change nothing, which
  // looks exactly like the mod not working. So the object is taken from an
  // instance of the very component the download code creates, and the
  // import is kept as a second candidate: if the two are not the same
  // object, both are patched.
  function targets() {
    const found = [];
    const keep = (p) => { if (p && typeof p.validateLeafName === "function" && !found.includes(p)) found.push(p); };
    try {
      const inst = Cc["@mozilla.org/helperapplauncherdialog;1"].createInstance(Ci.nsIHelperAppLauncherDialog);
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
      const has = proto[MARK];
      if (has) { held++; continue; }                 // this window's copy, or another window's
      const orig = proto.validateLeafName;
      const fn = function (folder, leaf, ext, allowExisting, afterPicker) {
        let chosen = null;
        try { chosen = decide(this, folder, leaf, ext, allowExisting, afterPicker); }
        catch (e) { note(`failed while deciding: ${e}`); }
        return chosen ?? orig.apply(this, arguments);
      };
      Object.defineProperty(proto, MARK, { value: { fn, orig }, configurable: true });
      proto.validateLeafName = fn;
      mine = fn;
      done++;
    }
    note(`install: ${done} patched, ${held} already had one`);
    return done ? "installed" : held ? "already installed" : "no hook";
  }

  function uninstall() {
    mine = null;
    for (const proto of targets()) {
      const held = proto[MARK];
      if (!held || proto.validateLeafName !== held.fn) continue;   // gone, or something else is on top
      proto.validateLeafName = held.orig;
      delete proto[MARK];
    }
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
        const proto = found[0];
        const held = proto?.[MARK];
        const m = mode();
        let toFolder = null;
        try { toFolder = Services.prefs.getBoolPref("browser.download.useDownloadDir", true); } catch {}
        return {
          setting: m === REPLACE ? "always replace" : m === KEEP ? "always keep both" : "ask",
          hookedCopies: found.length,
          hook: !proto ? "the browser's download module could not be read"
              : !held ? "not installed"
              : held.fn !== proto.validateLeafName ? "installed, but another patch sits on top"
              : held.fn === mine ? "installed (this window)" : "installed (another window)",
          // With this off the browser opens the system save dialog for every
          // download, that dialog asks about replacing itself, and nothing
          // here ever runs.
          savesStraightToTheDownloadFolder: toFolder,
          generation: instance.generation,
        };
      },
      install,
      log: () => log.slice(),
    };

    const cleanup = () => {
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
