import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { setImmediate as tick } from "node:timers/promises";
import { test } from "node:test";
import { installSineUpdateGuard } from "../download-prompt/sine-update-guard.sys.mjs";

const mods = ["download-prompt", "glassflow", "groupflow", "tab-router", "tab-unloader", "zen-turbo"];
const guardName = "sine-update-guard.sys.mjs";
const root = new URL("../", import.meta.url);
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// Model Sine's public call graph and shared staging path. No browser/profile IO.
function fixture() {
  const files = new Map();
  let registry = {}, staging = null, active = 0, maxActive = 0, prefReads = 0;
  const events = [];
  const PathUtils = { join: (...parts) => parts.join("/") };
  const utils = {
    modsDir: "/test/sine-mods",
    async getMods() { return { ...registry }; },
    async getModPreferences(mod) {
      prefReads++;
      assert.equal(this, utils);
      if (!files.has(mod.id)) throw new Error("Failed to read mod preferences");
      return files.get(mod.id);
    },
  };
  const manager = {
    async updateMods(source) {
      assert.equal(this, manager);
      const snapshot = { ...registry };
      await Promise.all(mods.map(id => this.processModUpdate({ id }, snapshot, source)));
      return "updated";
    },
    async processModUpdate(mod, snapshot) {
      return this.syncModData(mod.id, snapshot, mod, mod);
    },
    async installMod(id, origin, reload = true) {
      const snapshot = { ...registry };
      const result = await this.syncModData(id, snapshot, { id });
      if (reload) events.push("rebuild:" + id);
      return result;
    },
    async syncModData(repo, snapshot, mod) {
      const tempFolder = PathUtils.join(utils.modsDir, "temp");
      active++;
      maxActive = Math.max(maxActive, active);
      events.push("start:" + mod.id);
      files.delete(mod.id);
      try {
        await tick();
        if (mod.id === "fail") throw new Error("download failed");
        assert.equal(staging, null, "shared temp collision: " + tempFolder);
        staging = mod.id;
        if (mod.wait) await mod.wait;
        await tick();
        assert.equal(staging, mod.id);
        files.set(mod.id, [{ property: mod.id + ".enabled" }]);
        staging = null;
        // Native dependency installs happen after moving the parent into place.
        if (mod.id === "parent") await this.installMod("child", null, false);
        snapshot[mod.id] = mod;
        registry = { ...registry, ...snapshot };
        return mod.id;
      } finally {
        active--;
        events.push("end:" + mod.id);
      }
    },
  };
  return { manager, utils, files, events, get prefReads() { return prefReads; },
    get maxActive() { return maxActive; }, get registry() { return registry; } };
}

test("unguarded 6-mod updates reproduce the shared-temp collision", async () => {
  const f = fixture();
  await assert.rejects(f.manager.updateMods(), /shared temp collision/);
  await tick();
  assert.equal(f.maxActive, 6);
});

test("guarded 6-mod update preserves all preference files; 1 sync at a time", async () => {
  const f = fixture();
  assert.equal(installSineUpdateGuard(f.manager, f.utils), true);
  assert.equal(await f.manager.updateMods("auto"), "updated");
  assert.equal(f.maxActive, 1);
  for (const id of mods) assert.deepEqual(await f.utils.getModPreferences({ id }), [{ property: id + ".enabled" }]);
});

test("separate batches and a manual install cannot overlap", async () => {
  const f = fixture();
  installSineUpdateGuard(f.manager, f.utils);
  await Promise.all([f.manager.updateMods(), f.manager.installMod("manual"), f.manager.updateMods()]);
  assert.equal(f.maxActive, 1);
  assert.equal(Object.keys(f.registry).length, 7);
  assert.equal(f.events.indexOf("start:manual"), 12);
});

test("rejected operation propagates and does not poison either queue", async () => {
  const f = fixture();
  installSineUpdateGuard(f.manager, f.utils);
  const failed = f.manager.installMod("fail");
  const next = f.manager.installMod("next");
  await assert.rejects(failed, /download failed/);
  assert.equal(await next, "next");
  await assert.rejects(f.manager.processModUpdate({ id: "fail" }, {}), /download failed/);
  assert.equal(await f.manager.processModUpdate({ id: "after" }, {}), "after");
});

test("recursive dependency install does not deadlock", { timeout: 2000 }, async () => {
  const f = fixture();
  installSineUpdateGuard(f.manager, f.utils);
  assert.equal(await f.manager.installMod("parent"), "parent");
  assert.ok(f.files.has("child"));
  assert.deepEqual(f.events.filter(e => e.startsWith("rebuild:")), ["rebuild:parent"]);
});

test("a failed batch drains its remaining updates before a queued install", async () => {
  const f = fixture();
  f.manager.updateMods = async function () {
    await Promise.all(["fail", "one", "two"].map(id => this.processModUpdate({ id }, {})));
  };
  installSineUpdateGuard(f.manager, f.utils);
  const failed = f.manager.updateMods();
  const next = f.manager.installMod("manual");
  await assert.rejects(failed, /download failed/);
  assert.equal(await next, "manual");
  assert.equal(f.maxActive, 1);
  assert.ok(f.events.indexOf("start:manual") > f.events.indexOf("end:two"));
});

test("preference reads wait for the replacement; missing files still reject", async () => {
  const f = fixture(), blocked = deferred();
  installSineUpdateGuard(f.manager, f.utils);
  const updating = f.manager.syncModData("one", {}, { id: "one", wait: blocked.promise });
  const reading = f.utils.getModPreferences({ id: "one" });
  await tick();
  assert.equal(f.prefReads, 0);
  blocked.resolve();
  await updating;
  assert.deepEqual(await reading, [{ property: "one.enabled" }]);
  await assert.rejects(f.utils.getModPreferences({ id: "missing" }), /Failed to read mod preferences/);
});

test("preference reads resume after a failed replacement", async () => {
  const f = fixture();
  installSineUpdateGuard(f.manager, f.utils);
  const updating = f.manager.syncModData("fail", {}, { id: "fail" });
  const reading = f.utils.getModPreferences({ id: "fail" });
  await assert.rejects(updating, /download failed/);
  await assert.rejects(reading, /Failed to read mod preferences/);
});

test("all 6 copies install one session guard without wrapping repeatedly", async () => {
  const f = fixture();
  installSineUpdateGuard(f.manager, f.utils);
  const wrapped = f.manager.syncModData;
  for (const mod of mods) {
    const { installSineUpdateGuard: install } = await import(new URL(mod + "/" + guardName, root));
    assert.equal(install(f.manager, f.utils), true);
    assert.equal(f.manager.syncModData, wrapped);
  }
});

test("unknown APIs and already-fixed staging implementations are unchanged", () => {
  const f = fixture();
  f.manager.syncModData = async () => "already fixed";
  const original = f.manager.updateMods;
  assert.equal(installSineUpdateGuard(f.manager, f.utils), false);
  assert.equal(f.manager.updateMods, original);
  assert.equal(installSineUpdateGuard({}, {}), false);
});

test("6 standalone manifests ship identical guards; all declared scripts exist", async () => {
  const canonical = await readFile(new URL(mods[0] + "/" + guardName, root), "utf8");
  for (const mod of mods) {
    assert.equal(await readFile(new URL(mod + "/" + guardName, root), "utf8"), canonical, mod);
    const manifest = JSON.parse(await readFile(new URL(mod + "/theme.json", root), "utf8"));
    assert.equal(manifest.scripts[guardName].loadOrder, 1);
    const files = await readdir(new URL(mod + "/", root));
    for (const script of Object.keys(manifest.scripts)) assert.ok(files.includes(script), mod + "/" + script);
    assert.ok(Array.isArray(JSON.parse(await readFile(new URL(mod + "/preferences.json", root), "utf8"))));
  }
  const router = await readFile(new URL("tab-router/tab-router.uc.js", root), "utf8");
  assert.ok(!router.includes("repairStrays") && !router.includes("IOUtils.move"));
});

test("standalone reload=false install still queues behind updates", async () => {
  const f = fixture();
  installSineUpdateGuard(f.manager, f.utils);
  await Promise.all([f.manager.updateMods(), f.manager.installMod("manual", null, false)]);
  assert.equal(f.maxActive, 1);
  assert.equal(Object.keys(f.registry).length, 7);
});

test("failed batch waits for producers still awaiting marketplace data", { timeout: 2000 }, async () => {
  const f = fixture(), marketplace = deferred();
  f.manager.updateMods = async function () {
    await Promise.all([
      this.processModUpdate({ id: "fail" }, {}),
      marketplace.promise.then(() => this.processModUpdate({ id: "late" }, {})),
    ]);
  };
  installSineUpdateGuard(f.manager, f.utils);
  const batch = f.manager.updateMods();
  const rejected = assert.rejects(batch, /download failed/);
  const next = f.manager.installMod("manual");
  for (let n = 0; n < 8; n++) await tick();
  assert.equal(f.events.includes("start:manual"), false);
  marketplace.resolve();
  await rejected; await next;
  assert.ok(f.events.indexOf("start:manual") > f.events.indexOf("end:late"));
});

test("remove and toggle wait for installs; toggle uses the current registry", async () => {
  const f = fixture(); let seen;
  f.manager.removeMod = async id => f.events.push("remove:" + id);
  f.manager.toggleTheme = async registry => { seen = registry; f.events.push("toggle"); };
  installSineUpdateGuard(f.manager, f.utils);
  await Promise.all([f.manager.installMod("new"), f.manager.removeMod("old"), f.manager.toggleTheme({})]);
  assert.ok(seen.new);
  assert.ok(f.events.indexOf("remove:old") > f.events.indexOf("end:new"));
});
