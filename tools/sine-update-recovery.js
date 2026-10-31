// Paste this complete file into Zen's Browser Console. Runs one ordinary Sine
// update, waits for its transactions, and verifies the installed guard copies.
(async () => {
  const w = Services.wm.getMostRecentWindow("navigator:browser");
  const report = { tool: "sine-update-recovery-1", check: "not-started", readyToRestart: false };
  const known = new Set(["download-prompt","glassflow","glassflow-library","groupflow","iconflow",
    "mediaflow","peekflow","tab-router","tab-unloader","zen-turbo","zenslop"].map(n=>"zz-"+n));
  const guard = "sine-update-guard.sys.mjs", hash = "41cde009efbf677cb2f233f03611ca8c20650c097acd22bb3a287d14a2155af1";
  const clock = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  if (w?.__zzSineUpdateRecovery) return w.__zzSineUpdateRecovery;
  const run = async () => {
    try {
      const manager = ChromeUtils.importESModule("chrome://userscripts/content/core/manager.sys.mjs").default;
      const utils = ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default;
      if (!w || !manager.__zenPersonalModsUpdateGuardV1) { report.check = "no-active-guard"; return; }
      report.fixedGuardActive = Number(manager.__zenPersonalModsUpdateGuardV1) >= 2;
      let timer;
      try {
        report.check = await Promise.race([
          manager.updateMods("manual").then(changed => changed ? "updated" : "up-to-date", () => "rejected"),
          new Promise(resolve => { timer = clock.setTimeout(()=>resolve("still-running"), 180000); }),
        ]);
      } finally { clock.clearTimeout(timer); }
      // An outstanding update still owns its files. Never cancel it, inspect
      // an in-flight install or recommend restarting during the write.
      if (report.check === "still-running") return;
      const registry = await utils.getMods();
      report.enabledCopies = report.verifiedCopies = report.heldBack = 0;
      for (const [id, mod] of Object.entries(registry)) {
        if (!known.has(id) || !mod.enabled || !Object.hasOwn(mod.scripts || {},guard)) continue;
        report.enabledCopies++;
        const file = PathUtils.join(utils.getModFolder(id),guard);
        const source = (await IOUtils.readUTF8(file)).replaceAll("\r\n","\n");
        const digest = await w.crypto.subtle.digest("SHA-256",new TextEncoder().encode(source));
        const hex = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
        if (hex === hash) report.verifiedCopies++;
        else if (mod["no-updates"]) report.heldBack++;
      }
      report.readyToRestart = !report.fixedGuardActive && report.enabledCopies > 0 &&
        report.enabledCopies === report.verifiedCopies;
    } catch { report.check = "verification-unavailable"; }
  };
  const finish = async () => {
    try {
      const file = path => {const f=Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);f.initWithPath(path);return f;};
      const label = "zen-sine-update-"+Services.uuid.generateUUID().toString().slice(1,-1);
      const directory = PathUtils.join(PathUtils.tempDir,label), output=PathUtils.join(directory,"report.json");
      await IOUtils.makeDirectory(directory);
      report.archiveInTemp = label+".zip";
      await IOUtils.writeJSON(output,report);
      const zip=Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
      zip.open(file(PathUtils.join(PathUtils.tempDir,report.archiveInTemp)),0x04|0x08|0x80);
      try { zip.addEntryFile("report.json",6,file(output),false); } finally { zip.close(); }
    } catch { delete report.archiveInTemp; report.archiveError=true; }
    const text=JSON.stringify(report,null,2);
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
    console.info(text);return report;
  };
  const job=run().then(finish);
  if(w)w.__zzSineUpdateRecovery=job;
  try { return await job; } finally { if(w?.__zzSineUpdateRecovery===job)delete w.__zzSineUpdateRecovery; }
})();
