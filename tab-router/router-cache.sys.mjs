// One profile store shared by all windows. Native JSONFile coalesces writes and
// flushes them at shutdown; learned data no longer lives in large preferences.
let opening;
export function openRouterCache({ Services, IOUtils, PathUtils, JSONFile }) {
  return opening ||= (async () => {
    const path = PathUtils.join(PathUtils.profileDir, "zen-personal-mods-router-cache.json");
    const keys = ["creators", "avatars", "learned-names"];
    const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
    let data = {};
    if (await IOUtils.exists(path)) data = record(await IOUtils.readJSON(path));
    const migrated = new Map();
    for (const key of keys) {
      const text = Services.prefs.getStringPref("zzrouter." + key, "");
      if (text) {
        try { data[key] = { ...record(JSON.parse(text)), ...record(data[key]) }; migrated.set(key, text); }
        catch (error) { console.warn("[TabRouter] Retaining unreadable cache preference:", key, error); }
      }
    }
    if (migrated.size) {
      // Do not clear a single legacy byte until its replacement is durable.
      await IOUtils.writeJSON(path, data, { tmpPath: path + ".tmp" });
      for (const [key, text] of migrated) if (Services.prefs.getStringPref("zzrouter." + key, "") === text) Services.prefs.clearUserPref("zzrouter." + key);
    }
    const file = new JSONFile({ path, saveDelayMs: 500 });
    await file.load();
    return {
      read(key) { return structuredClone(record(file.data[key])); },
      write(key, value) {
        if (!keys.includes(key)) throw new Error("Unknown Router cache: " + key);
        file.data[key] = value;
        file.saveSoon();
        Services.obs.notifyObservers(null, "zzrouter-cache-changed", "zzrouter." + key);
      },
    };
  })().catch(error => { opening = null; throw error; });
}
