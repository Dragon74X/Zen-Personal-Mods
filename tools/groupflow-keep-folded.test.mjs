import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../groupflow/groupflow.uc.js", import.meta.url), "utf8");
const start = source.indexOf("    const groupProto = customElements.get(\"tab-group\").prototype;");
const end = source.indexOf("\n    sync();\n", start);

function setup() {
  class Group {
    constructor(collapsed) { this.attrs = new Set(collapsed ? ["collapsed"] : []); }
    hasAttribute(name) { return this.attrs.has(name); }
    get collapsed() { return this.attrs.has("collapsed"); }
    set collapsed(value) { if (value) this.attrs.add("collapsed"); else this.attrs.delete("collapsed"); }
  }
  const changes = [];
  const gBrowser = { addTab(group) { group.collapsed = false; return "tab"; } };       // Firefox, bug 1997096
  const folders = {
    animateSelect(group) { group.collapsed = false; return Promise.resolve(true); },   // Zen: every tab would show
    on_TabGrouped(group) { group.collapsed = group.hasAttribute("has-active"); },
  };
  const ctx = vm.createContext({ customElements: { get: () => Group }, gBrowser, window: { gZenFolders: folders },
    changed: e => changes.push(e.type), Object, Promise, WeakSet });
  vm.runInContext(source.slice(start, end) + "\nthis.cleanup = () => { for (const u of unwraps) u(); Object.defineProperty(groupProto, 'collapsed', nativeCollapsed); };", ctx);
  return { Group, gBrowser, folders, changes, cleanup: ctx.cleanup };
}

test("A collapsed group stays folded when a tab opens or moves into it, and still unfolds by hand", async () => {
  const { Group, gBrowser, folders, changes, cleanup } = setup();
  const group = new Group(true);
  assert.equal(gBrowser.addTab(group), "tab");
  assert.equal(group.collapsed, true, "Firefox's unfold on insert is held");
  folders.on_TabGrouped(group);
  assert.equal(group.collapsed, true, "Zen's unfold when a tab joins without an active tab is held");
  assert.equal(await folders.animateSelect(group), false, "a held folder reports not expanded, so Zen's loop ends");
  assert.equal(group.collapsed, true);
  assert.ok(changes.length >= 3, "visibility is resynced so the new tab shows through");
  const active = new Group(false); active.attrs.add("has-active");
  folders.on_TabGrouped(active);
  assert.equal(active.collapsed, true, "Zen may still fold");
  group.collapsed = false;
  assert.equal(group.collapsed, false, "unfolding by hand is untouched");
  cleanup();
  const later = new Group(true);
  gBrowser.addTab(later);
  assert.equal(later.collapsed, false, "retiring restores the native behaviour");
});
