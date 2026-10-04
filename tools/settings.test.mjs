// Settings menus: rows Sine can show and hide correctly, and the page picker
// on the large menus. Sine finds a conditional row by its id or property.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const mods = ["download-prompt", "glassflow", "glassflow-library", "groupflow", "iconflow", "tab-router", "tab-unloader", "zen-turbo", "mediaflow"];
const paged = { glassflow: "zzglass.ui.page", groupflow: "zzgroup.ui.page", iconflow: "zzicon.ui.page" };
const read = async mod => JSON.parse(await readFile(new URL(`../${mod}/preferences.json`, import.meta.url), "utf8"));
const watched = conditions => (Array.isArray(conditions) ? conditions : [conditions]).flatMap(c =>
  c.conditions ? watched(c.conditions) : [(c.if || c.not).property]);

for (const mod of mods) {
  test(`${mod}: conditional rows can be found and watch declared settings`, async () => {
    const prefs = await read(mod), declared = new Set(prefs.map(p => p.property).filter(Boolean));
    const ids = prefs.map(p => p.id ?? p.property).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "duplicate ids");
    for (const p of prefs) {
      if (!p.conditions) continue;
      assert.ok(p.id ?? p.property, `conditional row without id: ${p.label}`);
      for (const name of watched(p.conditions)) assert.ok(declared.has(name), `${p.id ?? p.property} watches ${name}`);
    }
  });
}

for (const [mod, nav] of Object.entries(paged)) {
  test(`${mod}: every row after the picker belongs to one of its pages`, async () => {
    const prefs = await read(mod), at = prefs.findIndex(p => p.property === nav);
    const picker = prefs[at], pages = new Set(picker.options.map(o => o.value));
    assert.ok(at > 0 && pages.has("all") && pages.has(picker.defaultValue));
    const seen = new Set();
    for (const p of prefs.slice(at + 1)) {
      const page = p.conditions?.[0]?.conditions;
      assert.ok(page && p.conditions[0].operator === "OR" && (p.operator === "AND" || p.type === "separator"), `${p.id ?? p.property} has no page`);
      const values = page.map(c => c.if.value);
      assert.ok(page.every(c => c.if.property === nav) && values.includes("all") && values.includes(""));
      seen.add(values[0]);
    }
    assert.deepEqual([...seen].sort(), [...pages].filter(v => v !== "all").sort(), "every page has rows");
  });
}
