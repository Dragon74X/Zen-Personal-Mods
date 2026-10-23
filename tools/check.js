// Paste in Browser Console when the menu cannot be reached. Normal report is
// also available in Tools > Copy Zen Mods Report. Optional timed media trace:
// change timedMedia to true; collection lasts 15 seconds and remains read-only.
(async () => {
  const W = Services.wm.getMostRecentWindow("navigator:browser");
  const { collectReport } = ChromeUtils.importESModule("chrome://sine/content/zz-glassflow/zen-mods-report.sys.mjs");
  const report = await collectReport(W, { timedMedia: false });
  Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(JSON.stringify(report));
  return report;
})()
