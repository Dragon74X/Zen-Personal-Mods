// Shared by the Node tests: the list of installable mods, and a loader that
// runs a mod's production script against browser API fakes.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

// Every folder with a theme.json, except zenslop, which only forwards old
// Zenslop installs to Mediaflow.
export const mods = readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== "zenslop" && existsSync(new URL(`${entry.name}/theme.json`, root)))
  .map(entry => entry.name).sort();

// Runs <mod>/<mod>.uc.js in a fresh context up to its declared-defaults
// section, so nothing starts, and returns `names` (an object-literal body
// evaluated inside the script, such as "start, retire: () => retired = true").
export async function load(mod, names, context) {
  const marker = "  // ---- declared defaults";
  const source = await readFile(new URL(`${mod}/${mod}.uc.js`, root), "utf8");
  assert.ok(source.includes(marker), `${mod} has no declared-defaults section`);
  const sandbox = vm.createContext({ console, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }, ...context });
  vm.runInContext(source.replace(marker, `  globalThis.harness = {${names}}; return;\n${marker}`), sandbox);
  return sandbox.harness;
}
