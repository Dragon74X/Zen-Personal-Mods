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
  // then extracts the replacement. When that fails, Sine skips its restore
  // and every later update fails copying a missing or partial folder: the
  // mod stays broken until reinstalled. The update failed, so mods.json
  // still names the old version; put the old copy back before reads resume.
  // Which copy is whole depends on where it failed:
  // - the backup copy itself failed: the folder was never deleted and is
  //   intact, and the backup is a partial subset of it. Keep the folder.
  // - the download or extraction failed: the folder is missing or partial,
  //   and the backup is the complete old version. Restore it.
  const listing = async (root, dir = root, out = new Map()) => {
    for (const path of await IOUtils.getChildren(dir)) {
      const info = await IOUtils.stat(path);
      if (info.type === "directory") await listing(root, path, out);
      else out.set(path.slice(root.length), info.size);
    }
    return out;
  };
  async function restoreBackup([, , theme, installed]) {
    if (!installed?.id || !theme?.id) return;
    try {
      const folder = utils.getModFolder(theme.id);
      const backup = PathUtils.join(utils.modsDir, `tmp-${installed.id}`);
      if (!await IOUtils.exists(backup)) return;
      if (await IOUtils.exists(folder)) {
        const [kept, saved] = await Promise.all([listing(folder), listing(backup)]);
        if ([...saved].every(([file, size]) => kept.get(file) === size)) {
          await IOUtils.remove(backup, { recursive: true });   // the copy failed; the folder is whole
          return;
        }
        await IOUtils.remove(folder, { recursive: true });
      }
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

// Sine builds each settings row before adding it to the page, and checks the
// row's conditions at that moment, when the row cannot be found yet. So every
// conditional row shows when a mod's settings open, until one of the settings
// it depends on changes. Sine's own observers stay registered and handle
// later changes; check visibility once more when the row is on the page,
// with the same rules (preferences.sys.mjs), registering nothing.
const holds = cond => {
  const c = cond.if || cond.not, P = Services.prefs;
  const v = typeof c.value === "boolean" ? P.getBoolPref(c.property, false)
    : typeof c.value === "number" ? P.getIntPref(c.property, 0) : P.getCharPref(c.property, "");
  return cond.not ? v !== c.value : v === c.value;
};
const allHold = (conditions, operator = "AND") => {
  const list = Array.isArray(conditions) ? conditions : [conditions];
  if (!list.length) return true;
  const results = list.map(c => c.if || c.not ? holds(c) : c.conditions ? allHold(c.conditions, c.operator || "AND") : false);
  return operator === "OR" ? results.some(Boolean) : results.every(Boolean);
};
export function fixSettingsConditions(manager) {
  const prefs = manager.preferences;
  if (!prefs || prefs.__zenPersonalModsConditions ||
      typeof prefs.parsePref !== "function" || typeof prefs.setupPrefObserver !== "function") return false;
  manager.preferences = {
    ...prefs,
    __zenPersonalModsConditions: true,
    parsePref(pref, ...rest) {
      const row = prefs.parsePref(pref, ...rest), window = rest[1];
      if (row && pref.conditions) window.setTimeout(() => {
        if (!row.isConnected) return;
        const id = (pref.id ?? pref.property).replaceAll(".", "-");
        const el = window.document.getElementById(id);
        if (el) el.style.display = allHold(pref.conditions, pref.operator || "OR") ? "flex" : "none";
      });
      return row;
    },
  };
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
    fixSettingsConditions(manager);
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
