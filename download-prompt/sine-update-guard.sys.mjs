// Identical copy shipped with each mod so every folder installs independently.
// Sine fb0bd4c: updateMods runs processModUpdate concurrently, but syncModData
// stages every host-repository mod through the same sine-mods/temp directory.
// Keep this in a background module: queues must outlive any browser window.
export function installSineUpdateGuard(manager, utils, { IOUtils, PathUtils } = globalThis) {
  const marker = "__zenPersonalModsUpdateGuardV1";
  if (manager[marker]) return true;
  const names = ["updateMods", "processModUpdate", "installMod", "syncModData"];
  if (names.some(name => typeof manager[name] !== "function") ||
      typeof utils.getModPreferences !== "function" || typeof utils.getMods !== "function") return false;
  // Do not wrap an engine that no longer uses the shared staging path.
  if (!/PathUtils\.join\(\s*utils\.modsDir,\s*["']temp["']\s*\)/.test(
    Function.prototype.toString.call(manager.syncModData))) return false;

  const original = Object.fromEntries(names.map(name => [name, manager[name]]));
  const getPrefs = utils.getModPreferences;
  const writes = new Set();
  // ponytail: serialize engine operations while Sine has one shared temp path;
  // remove this guard when upstream uses transaction-local staging directories.
  const serial = () => {
    let tail = Promise.resolve();
    const enqueue = job => {
      const result = tail.then(job);
      tail = result.catch(() => {}); // A failed operation must not block the next.
      return result;               // The caller still receives the rejection.
    };
    enqueue.drain = () => tail;
    return enqueue;
  };
  const operations = serial();
  const updates = serial();
  let batchErrors = null;
  // Queue before updateMods/installMod read mods.json, preventing stale copies
  // from separate user actions overwriting each other's installed-mod entries.
  manager.updateMods = function (...args) {
    return operations(async () => {
      batchErrors = [];
      try {
        const result = await original.updateMods.apply(this, args);
        if (batchErrors.length) throw batchErrors[0];
        return result;
      } finally {
        await updates.drain();
        batchErrors = null;
      }
    });
  };
  manager.installMod = function (...args) {
    return operations(() => original.installMod.apply(this, args));
  };
  manager.processModUpdate = function (...args) {
    return updates(async () => {
      // Earlier mods may have installed dependencies absent from the batch's
      // original registry snapshot. Preserve those entries in the next write.
      try {
        args[1] = await utils.getMods();
        // Sine compares only updatedAt. Several store entries never get one,
        // or change version without a new date, so they never update. For
        // store mods, a different store version counts as newer.
        const [mod, , store] = args, entry = mod?.origin === "store" && store?.[mod.id];
        if (entry?.version && entry.version !== mod.version &&
            !(new Date(mod.updatedAt) < new Date(entry.updatedAt))) {
          args[2] = { ...store, [mod.id]: { ...entry, updatedAt: new Date().toISOString() } };
        }
        return await original.processModUpdate.apply(this, args);
      }
      catch (error) {
        if (!batchErrors) throw error;
        // Let native Promise.all await producers still fetching marketplace
        // data before releasing the outer operation queue; report afterward.
        batchErrors.push(error);
        return { changed: false };
      }
    });
  };
  // These UI actions also write mods.json and can overlap auto-updates.
  for (const name of ["removeMod", "toggleTheme"]) {
    const fn = manager[name];
    if (typeof fn !== "function") continue;
    manager[name] = function (...args) {
      return operations(async () => {
        if (name === "toggleTheme") args[0] = await utils.getMods();
        return fn.apply(this, args);
      });
    };
  }
  // An update copies the installed folder to tmp-<id>, deletes the folder,
  // then downloads the replacement. A failed download skips Sine's restore,
  // and every later update fails copying the missing folder: the mod stays
  // broken until reinstalled. Put the backup back before reads resume.
  // ponytail: restores only a folder that is gone entirely; an extraction
  // that failed midway leaves a partial folder, which still needs a reinstall.
  async function restoreBackup([, , theme, installed]) {
    if (!installed?.id || !theme?.id) return;
    try {
      const folder = utils.getModFolder(theme.id);
      const backup = PathUtils.join(utils.modsDir, `tmp-${installed.id}`);
      if (await IOUtils.exists(folder) || !await IOUtils.exists(backup)) return;
      await IOUtils.move(backup, folder);
      console.warn(`[Zen Personal Mods] Update of ${theme.id} failed; restored the installed copy.`);
    } catch (error) {
      console.warn(`[Zen Personal Mods] Could not restore ${theme.id} after a failed update:`, error);
    }
  }
  manager.syncModData = function (...args) {
    // Native sync starts sibling dependencies with Promise.all. Serialize
    // siblings inside this transaction; each child gets its own queue for
    // grandchildren, avoiding both shared-temp races and recursive deadlock.
    const dependencies = serial();
    const receiver = Object.create(this);
    receiver.installMod = (...childArgs) =>
      dependencies(() => original.installMod.apply(this, childArgs));
    const result = (async () => {
      try { return await original.syncModData.apply(receiver, args); }
      catch (error) { await restoreBackup(args); throw error; }
      finally { await dependencies.drain(); }
    })();
    writes.add(result);
    const done = () => writes.delete(result);
    result.then(done, done);
    return result;
  };
  utils.getModPreferences = async function (...args) {
    // A settings/style rebuild can read while syncModData has temporarily
    // removed the installed folder. Wait for replacements, never hide errors.
    while (writes.size) await Promise.allSettled([...writes]);
    return getPrefs.apply(this, args);
  };
  // The shared manager makes 6 copies and multiple windows install just once.
  // Deliberately session-scoped: no window unload may abandon pending updates.
  Object.defineProperty(manager, marker, { value: true });
  return true;
}

if (typeof ChromeUtils !== "undefined") {
  try {
    const manager = ChromeUtils.importESModule(
      "chrome://userscripts/content/core/manager.sys.mjs").default;
    const utils = ChromeUtils.importESModule(
      "chrome://userscripts/content/core/utils.sys.mjs").default;
    if (!installSineUpdateGuard(manager, utils)) {
      console.info("[Zen Personal Mods] Sine update guard skipped: engine does not match the shared-temp implementation.");
    }
    // Sine checks for updates only at launch. Check again every few hours,
    // honouring its auto-update setting; one timer however many copies load.
    const timer = "__zenPersonalModsUpdateTimer";
    if (!manager[timer]) {
      const { setInterval } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
      Object.defineProperty(manager, timer, { value: setInterval(() => {
        manager.updateMods("auto").catch(error => console.warn("[Zen Personal Mods] Update check failed:", error));
      }, 3 * 60 * 60 * 1000) });
    }
  } catch (error) {
    console.warn("[Zen Personal Mods] Could not install Sine update guard:", error);
  }
}
