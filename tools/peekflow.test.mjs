import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Peekflow sets Firefox's preview switches from its own settings and, when
// Sine turns it off, hands back what was there before.
test("Peekflow takes Firefox's preview switches and gives them back", async () => {
  const source = await readFile(new URL("../peekflow/peekflow.uc.js", import.meta.url), "utf8");
  const prefs = new Map([["browser.tabs.hoverPreview.enabled", false], ["browser.tabs.hoverPreview.showThumbnails", true]]);
  const Services = { prefs: {
    getBoolPref: (k, d) => prefs.has(k) ? prefs.get(k) : d, setBoolPref: (k, v) => prefs.set(k, v),
    getIntPref: (k, d) => prefs.has(k) ? prefs.get(k) : d, getStringPref: (k, d) => prefs.has(k) ? prefs.get(k) : d,
    prefHasUserValue: k => prefs.has(k), clearUserPref: k => prefs.delete(k),
    addObserver() {}, removeObserver() {},
  }, obs: { addObserver() {}, removeObserver() {} } };
  let unload;
  const window = { gBrowserInit: { delayedStartupFinished: true }, addEventListener() {}, removeEventListener() {},
    addUnloadListener: fn => { unload = fn; } };
  const document = { getElementById: () => null };
  const gBrowser = { tabContainer: {} };
  vm.runInNewContext(source, { window, document, gBrowser, Services, Intl, URL });
  assert.equal(prefs.get("browser.tabs.hoverPreview.enabled"), true, "previews on, as Peekflow's default asks");
  assert.equal(prefs.get("zzpeek.saved.show"), false, "the old value is kept");
  prefs.set("zzpeek.show", false);
  unload();
  assert.equal(prefs.get("browser.tabs.hoverPreview.enabled"), false, "turning Peekflow off restores it");
  assert.ok(!prefs.has("zzpeek.saved.show") && !prefs.has("zzpeek.saved.pictures"), "and forgets the saved copies");
});
