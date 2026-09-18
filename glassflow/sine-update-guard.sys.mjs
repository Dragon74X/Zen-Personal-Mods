// Identical copy shipped with each mod so every folder installs independently.
// Sine fb0bd4c: updateMods runs processModUpdate concurrently, but syncModData
// stages every host-repository mod through the same sine-mods/temp directory.
// Keep this in a background module: queues must outlive any browser window.
export function installSineUpdateGuard(manager, utils) {
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
  // Queue before updateMods/installMod read mods.json, preventing stale copies
  // from separate user actions overwriting each other's installed-mod entries.
  manager.updateMods = function (...args) {
    return operations(async () => {
      try { return await original.updateMods.apply(this, args); }
      finally { await updates.drain(); } // Promise.all can reject before queued mods finish.
    });
  };
  manager.installMod = function (...args) {
    return operations(() => original.installMod.apply(this, args));
  };
  manager.processModUpdate = function (...args) {
    return updates(async () => {
      // Earlier mods may have installed dependencies absent from the batch's
      // original registry snapshot. Preserve those entries in the next write.
      args[1] = await utils.getMods();
      return original.processModUpdate.apply(this, args);
    });
  };
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
  } catch (error) {
    console.warn("[Zen Personal Mods] Could not install Sine update guard:", error);
  }
}
