import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../tab-unloader/tab-unloader.uc.js", import.meta.url), "utf8");

test("Keep Loaded marks the tabs it is used on undiscardable for this window only, and can be turned off", () => {
  const body = source.slice(source.indexOf("  const KEEP ="), source.indexOf("  const LOADED_EVENTS ="));
  const tab = id => ({ id, closing: false, multiselected: false, undiscardable: false, attrs: new Set(),
    hasAttribute(a) { return this.attrs.has(a); }, toggleAttribute(a, on) { on ? this.attrs.add(a) : this.attrs.delete(a); },
    removeAttribute(a) { this.attrs.delete(a); } });
  const a = tab("a"), b = tab("b"), held = tab("held");
  held.undiscardable = true;                                   // held by Firefox or an add-on
  const ctx = vm.createContext({ window: { TabContextMenu: { contextTab: a } }, gBrowser: { selectedTabs: [a, b] },
    note: () => {}, allTabs: () => [a, b, held], document: { getElementById: () => null } });
  vm.runInContext(body + "\nthis.toggleKeep = toggleKeep; this.removeKeepItem = removeKeepItem; this.kept = kept;", ctx);
  ctx.toggleKeep();
  assert.ok(a.undiscardable && ctx.kept(a) && !b.undiscardable);
  ctx.toggleKeep();
  assert.ok(!a.undiscardable, "toggles back off");
  a.multiselected = true; ctx.toggleKeep();
  assert.ok(a.undiscardable && b.undiscardable, "applies to every selected tab");
  ctx.removeKeepItem(true);
  assert.ok(!a.undiscardable && !b.undiscardable && held.undiscardable, "removing the mod releases only its own marks");
  assert.ok(!/persistTabAttribute|setCustomTabValue/.test(body), "nothing is saved with the session: it ends with the window");
});
