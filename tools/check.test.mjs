import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

test("health report follows Sine OR, nested AND, negation and unset defaults", async () => {
  const leaf = (property, value, not = false) => ({ [not ? "not" : "if"]: { property, value } });
  const rows = [
    { property: "or-visible", conditions: [leaf("missing", true), leaf("on", true)] },
    { property: "and-hidden", operator: "AND", conditions: [leaf("missing", true), leaf("on", true)] },
    { property: "not-visible", conditions: leaf("missing", true, true) },
    { property: "not-hidden", conditions: leaf("missing", false, true) },
    { property: "string-hidden", conditions: leaf("missing", "chosen") },
    { property: "zero-visible", conditions: leaf("missing", 0) },
    { property: "nested-hidden", conditions: [{ conditions: [leaf("on", true), leaf("missing", true)] }] },
    { property: "nested-or-visible", conditions: [{ operator: "OR", conditions: [leaf("on", true), leaf("missing", true)] }] },
  ].map(row => ({ type: "checkbox", ...row }));
  const source = await readFile(new URL("check.js", import.meta.url), "utf8");
  const sandbox = {
    console: { log() {} },
    Services: { wm: { getMostRecentWindow: () => ({}) }, prefs: {
      getPrefType: k => k === "on" ? 128 : 0,
      getBoolPref: (k, fallback) => k === "on" ? true : fallback,
      getIntPref: (_k, fallback) => fallback, getCharPref: (_k, fallback) => fallback,
    } },
    fetch: async url => ({ json: async () => url.endsWith("theme.json") ? { version: "test" } : rows }),
    PathUtils: { profileDir: "/test", join: (...parts) => parts.join("/") },
    IOUtils: { getChildren: async () => [] },
  };
  const report = await vm.runInNewContext(source, sandbox);
  for (const mod of Object.values(report.mods)) {
    assert.deepEqual(Array.from(mod.hiddenRows, row => row.split(" ")[0]),
      ["and-hidden", "not-hidden", "string-hidden", "nested-hidden"]);
  }
});
