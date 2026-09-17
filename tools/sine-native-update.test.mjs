// Optional integration test using an unmodified upstream manager file:
// SINE_MANAGER_SOURCE=/path/to/Sine/src/core/manager.sys.mjs node --test tools/sine-native-update.test.mjs
// Verified against CosmoCreeper/Sine fb0bd4ca6af888f10648e126947f7d1f82228433.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { setImmediate as tick } from "node:timers/promises";
import { test } from "node:test";
import { installSineUpdateGuard } from "../download-prompt/sine-update-guard.sys.mjs";

const upstream = process.env.SINE_MANAGER_SOURCE;
const root = new URL("../", import.meta.url);
const mods = ["download-prompt", "glassflow", "groupflow", "tab-router", "tab-unloader", "zen-turbo"];

async function environment() {
  const source = await readFile(upstream, "utf8");
  const repo = new Map(), manifests = {};
  for (const mod of mods) {
    for (const name of await readdir(new URL(mod + "/", root))) {
      repo.set(mod + "/" + name, await readFile(new URL(mod + "/" + name, root), "utf8"));
    }
    const theme = JSON.parse(repo.get(mod + "/theme.json"));
    manifests[theme.id] = { ...theme, enabled: true, updatedAt: "2026-09-17T00:00:00Z" };
  }
  const fs = new Map();
  let registry = Object.fromEntries(Object.entries(manifests).map(([id, m]) => [id, { ...m, updatedAt: "2020-01-01T00:00:00Z" }]));
  const entries = p => [...fs].filter(([k]) => k === p || k.startsWith(p + "/"));
  const exists = p => entries(p).length > 0;
  const erase = p => { for (const [k] of entries(p)) fs.delete(k); };
  const copy = (from, to) => {
    const found = entries(from);
    if (!found.length) throw new Error("missing source: " + from);
    for (const [k, v] of found) fs.set(to + k.slice(from.length), v);
  };
  for (const [p, contents] of repo) {
    const [mod, ...rest] = p.split("/");
    fs.set("/sine-mods/zz-" + mod + "/" + rest.join("/"), contents);
  }
  const utils = {
    modsDir: "/sine-mods", modsDataFile: "/sine-mods/mods.json", autoUpdate: true,
    getModFolder: id => "/sine-mods/" + id,
    async getMods() { return structuredClone(registry); },
    rawURL: url => url.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/tree/", "/") + "/",
    async getModPreferences(mod) {
      const p = path.posix.join(this.getModFolder(mod.id), mod.preferences);
      if (!fs.has(p)) throw new Error("Failed to read mod preferences: " + p);
      return JSON.parse(fs.get(p));
    },
  };
  const IOUtils = {
    async exists(p) { await tick(); return exists(p); },
    async copy(from, to) { await tick(); copy(from, to); },
    async remove(p) { await tick(); erase(p); },
    async move(from, to) {
      await tick();
      // Model IOUtils directory move: an existing destination directory nests
      // the source rather than providing an exclusive staging reservation.
      if (exists(to)) to = path.posix.join(to, path.posix.basename(from));
      copy(from, to);
      erase(from);
    },
    async writeJSON(p, json) {
      await tick();
      assert.equal(p, utils.modsDataFile);
      registry = structuredClone(json);
    },
  };
  const ucAPI = {
    async fetch(url) {
      const mod = url.split("/").at(-2);
      return structuredClone(manifests["zz-" + mod]);
    },
    async unpackRemoteArchive({ id, extractDir }) {
      await tick();
      for (const [p, contents] of repo) fs.set(extractDir + "/" + id + "/" + p, contents);
      return [...repo.keys()].map(p => id + "/" + p);
    },
    showToast() {},
  };
  const context = vm.createContext({ utils, IOUtils, ucAPI, PathUtils: path.posix,
    ChromeUtils: { importESModule: () => ({ default: {} }) }, console });
  // Only replace import/export plumbing; execute native updateMods,
  // processModUpdate, installMod, syncModData, findFile and parseGitHubUrl.
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "")
    .replace("export default new Manager();", "globalThis.manager = new Manager();"), context);
  const manager = context.manager;
  manager.createThemeJSON = async (_url, _mods, data, minimal) =>
    minimal ? { theme: structuredClone(data), githubAPI: {} } : structuredClone(data);
  let lastLoad = Promise.resolve();
  manager.rebuildMods = () => {};
  manager.loadMods = () => {
    lastLoad = Promise.all(Object.values(registry).map(mod => utils.getModPreferences(mod)));
    return lastLoad;
  };
  return { manager, utils, fs, manifests, get lastLoad() { return lastLoad; },
    get registry() { return registry; } };
}

test("native Sine: unguarded parallel update reproduces folder loss", { skip: !upstream }, async () => {
  const env = await environment();
  // Sine starts all 6 sync jobs concurrently. Capture every rejection so all
  // filesystem operations settle before examining the resulting installation.
  const list = await env.utils.getMods();
  await Promise.allSettled(Object.values(list).map(mod => env.manager.processModUpdate(mod, list, null)));
  const missing = Object.keys(list).filter(id => !env.fs.has("/sine-mods/" + id + "/preferences.json"));
  assert.ok(missing.length > 0, "baseline must reproduce corruption");
});

test("native Sine: guarded update keeps 6 preferences and 6 metadata entries", { skip: !upstream }, async () => {
  const env = await environment();
  assert.equal(installSineUpdateGuard(env.manager, env.utils), true);
  assert.equal(await env.manager.updateMods("auto"), true);
  assert.equal((await env.lastLoad).length, 6);
  assert.equal(Object.keys(env.registry).length, 6);
  for (const mod of Object.values(env.registry)) {
    assert.equal(mod.preferences, "preferences.json");
    assert.deepEqual(await env.utils.getModPreferences(mod), JSON.parse(
      await readFile(new URL(mod.id.slice(3) + "/preferences.json", root), "utf8")));
  }
  assert.ok(![...env.fs.keys()].some(p => p.startsWith("/sine-mods/temp/")));
});

test("native Sine: update and reinstall queued together retain all 6 mods", { skip: !upstream }, async () => {
  const env = await environment();
  installSineUpdateGuard(env.manager, env.utils);
  await Promise.all([env.manager.updateMods(), env.manager.installMod(env.manifests["zz-glassflow"].homepage, null)]);
  assert.equal((await env.lastLoad).length, 6);
  assert.equal(Object.keys(env.registry).length, 6);
});
