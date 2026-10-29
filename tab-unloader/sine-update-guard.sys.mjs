// Identical copy shipped with each mod so every folder installs independently.
// Sine fb0bd4c: updateMods runs processModUpdate concurrently, but syncModData
// stages every host-repository mod through the same sine-mods/temp directory.
// Keep this in a background module: queues must outlive any browser window.
// Sine already registers sine-mods as chrome://sine/content/. Its generated
// chrome sheet instead imports file URLs, where stroked context-fill SVGs
// (including CMI ZenUI) paint nothing with the default SVG content policy.
export function fixChromeStylesheetImports(utils, { IOUtils, PathUtils } = globalThis) {
  if (utils.__zenPersonalModsChromeImports || !utils.chromeFile || !utils.modsDir ||
      !IOUtils?.writeUTF8 || !PathUtils?.toFileURI) return false;
  const prefix = `@import "${PathUtils.toFileURI(utils.modsDir)}/`;
  const write = IOUtils.writeUTF8;
  // ponytail: only Sine's generated chrome entrypoint; remove when upstream
  // emits chrome imports. Content sheets, external URLs and ordering stay native.
  IOUtils.writeUTF8 = function (file, source, ...args) {
    if (file === utils.chromeFile && typeof source === "string")
      source = source.replaceAll(prefix, '@import "chrome://sine/content/');
    return write.call(this, file, source, ...args);
  };
  utils.__zenPersonalModsChromeImports = true;
  return true;
}

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
  // Native extraction owns the shared staging path; this transaction owns
  // backup lifetime. A completed copy is the only evidence of a valid backup.
  // Keep it through relocation, dependency installation and registry commit.
  const transactions = new Map();
  const snapshots = new WeakMap();
  const registryWrites = serial();
  const getMods = utils.getMods;
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const reconcile = (before, next, current) => {
    if (equal(before, next)) return current;
    if (object(before) && object(next) && object(current)) {
      const result = { ...current };
      for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
        const value = reconcile(before[key], next[key], current[key]);
        if (value === undefined) delete result[key]; else result[key] = value;
      }
      return result;
    }
    return equal(before, current) ? next : current;
  };
  utils.getMods = async function (...args) {
    await registryWrites.drain();
    const value = await getMods.apply(this, args);
    snapshots.set(value, clone(value));
    return value;
  };
  const nativeIO = IOUtils && Object.fromEntries(
    ["copy", "remove", "writeJSON"].map(name => [name, IOUtils[name].bind(IOUtils)]));
  if (nativeIO) {
    IOUtils.copy = async function (from, to, ...args) {
      const result = await nativeIO.copy(from, to, ...args);
      const transaction = transactions.get(to);
      if (transaction?.folder === from) transaction.phase = "backed-up";
      return result;
    };
    IOUtils.remove = function (file, ...args) {
      if (transactions.get(file)?.phase === "backed-up") return Promise.resolve();
      return nativeIO.remove(file, ...args);
    };
    IOUtils.writeJSON = function (file, value, ...args) {
      if (file !== utils.modsDataFile) return nativeIO.writeJSON(file, value, ...args);
      // Includes Sine's Disable updates button, which bypasses manager methods.
      const before = snapshots.get(value);
      const intended = clone(value);
      return registryWrites(async () => {
        const current = await getMods.call(utils);
        const merged = before ? reconcile(before, intended, current) : intended;
        for (const transaction of transactions.values()) {
          const mod = intended[transaction.id];
          if (mod !== transaction.theme && !equal(mod, transaction.theme)) continue;
          const folder = transaction.folder;
          const required = [mod.preferences, ...Object.values(mod.style || {}), ...Object.keys(mod.scripts || {})].filter(Boolean);
          for (const name of required) {
            if (typeof name !== "string" || name.startsWith("/") || name.split(/[\\/]/).includes("..") ||
                !await IOUtils.exists(PathUtils.join(folder, name))) throw new Error(`Missing installed file: ${transaction.id}/${name}`);
          }
          if (transaction.hadPreferences && !mod.preferences) throw new Error(`Missing preferences: ${transaction.id}`);
          if (mod.preferences && IOUtils.readJSON) {
            const preferences = await IOUtils.readJSON(PathUtils.join(folder, mod.preferences));
            if (!Array.isArray(preferences)) throw new Error(`Invalid preferences: ${transaction.id}`);
          }
          // Updating code must not reset the user's install controls.
          for (const key of ["enabled", "no-updates"]) if (Object.hasOwn(current[transaction.id] || {}, key)) merged[transaction.id][key] = current[transaction.id][key];
        }
        await nativeIO.writeJSON(file, merged, ...args);
        for (const transaction of transactions.values()) {
          if (equal(intended[transaction.id], transaction.theme)) transaction.phase = "committed";
        }
        snapshots.set(value, clone(merged));
      });
    };
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
      const [, , theme, installed] = args;
      const backup = nativeIO && PathUtils.join(utils.modsDir, `tmp-${installed?.id || theme.id}`);
      const transaction = backup && { id: theme.id, theme, folder: utils.getModFolder(theme.id),
        phase: "preparing", hadPreferences: !!installed?.preferences };
      if (transaction) {
        if (await IOUtils.exists(backup)) throw new Error(`Recovery copy retained: ${backup}; resolve before updating`);
        transactions.set(backup, transaction);
      }
      try {
        const result = await original.syncModData.apply(receiver, args);
        await dependencies.drain();
        if (transaction && transaction.phase !== "committed") throw new Error(`Update did not commit: ${theme.id}`);
        return result;
      } catch (error) {
        await dependencies.drain();
        if (transaction?.phase === "backed-up") {
          try {
            await nativeIO.remove(transaction.folder, { recursive: true, ignoreAbsent: true });
            await IOUtils.copy(backup, transaction.folder, { recursive: true });
            transaction.phase = "restored";
          } catch (restoreError) {
            transaction.phase = "recovery-required";
            console.error(`[Zen Personal Mods] Retained recovery copy at ${backup}:`, restoreError);
          }
        }
        throw error;
      } finally {
        if (transaction) {
          transactions.delete(backup);
          // Failed backup creation never touched the installed folder. Failed
          // restoration retains the complete backup for recovery, even on retry.
          if (transaction.phase !== "recovery-required") {
            try { await nativeIO.remove(backup, { recursive: true, ignoreAbsent: true }); }
            catch (error) { console.warn(`[Zen Personal Mods] Retained backup at ${backup}:`, error); }
          }
        }
      }
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
  // Sine invokes identical callbacks for window close, rebuild and removal.
  // Carry the actual lifetime through those entrypoints; a browser preference
  // belongs to the installed feature, not to the window receiving cleanup.
  if (manager.removeListenersForDOM && manager.removeUnloadListeners && manager.triggerUnloadListener) {
    const close = manager.removeListenersForDOM, unload = manager.removeUnloadListeners;
    const replace = manager.triggerUnloadListener;
    const reasons = window => window.__zzSineUnloadReasons ||= new Map();
    manager.removeListenersForDOM = function (window) {
      window.__zzSineWindowClosing = true;
      try { return close.call(this, window); }
      finally { delete window.__zzSineWindowClosing; }
    };
    manager.removeUnloadListeners = async function (id) {
      const windows = [...Services.wm.getEnumerator("navigator:browser")];
      windows.forEach(window => reasons(window).set(id, "release"));
      try { return await unload.call(this, id); }
      finally { windows.forEach(window => reasons(window).delete(id)); }
    };
    manager.triggerUnloadListener = async function (script, window) {
      const id = /^chrome:\/\/sine\/content\/([^/]+)\//.exec(script)?.[1];
      const mods = await utils.getMods();
      reasons(window).set(id, mods[id]?.enabled && !Services.prefs.getBoolPref("sine.mods.disable-all", false) ? "update" : "release");
      try { return await replace.call(this, script, window); }
      finally { reasons(window).delete(id); }
    };
  }
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
// Restrict presentation to metadata returned for these independently installable mods.
const settingScopes = new Map([
  ["zz-download-prompt", "zzdl."], ["zz-glassflow", "zzglass."],
  ["zz-glassflow-library", "zzlib."], ["zz-groupflow", "zzgroup."],
  ["zz-iconflow", "zzicon."], ["zz-tab-router", "zzrouter."],
  ["zz-tab-unloader", "zzunload."], ["zz-zen-turbo", "zzturbo."],
  ["zz-mediaflow", "zzmedia."], ["zz-zenslop", "zzmedia."], ["zz-peekflow", "zzpeek."],
]);
const nativeSettings = new Set(["zen.theme.hide-tab-throbber", "zen.theme.acrylic-sidebar", "zen.theme.acrylic-urlbar"]);
const fractionSettings = new Set([
  ...["selected", "unselected", "hover", "pending"].map(s => `zzglass.${s}.opacity`),
  "zzglass.buttons.opacity", "zzgroup.collapsed-opacity",
  ...["active", "inactive", "hover"].map(s => `zzgroup.subfolder.${s}.opacity`),
  "zzgroup.line-opacity", "zzgroup.marker-opacity", "zzlib.card.gradient",
]);
export function displaySettingValue(property, value) {
  const raw = String(value ?? "");
  if (!fractionSettings.has(property) && property !== "zzrouter.nexus-banner-opacity") return raw;
  if (!/^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*%?\s*$/.test(raw)) return raw;
  const n = parseFloat(raw) * (fractionSettings.has(property) && !raw.includes("%") ? 100 : 1);
  return Number.isFinite(n) ? `${Number(n.toFixed(8))}%` : raw;
}
export function storedSettingValue(property, value, previous) {
  if (!fractionSettings.has(property) && property !== "zzrouter.nexus-banner-opacity") return value;
  if (!/^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*%?\s*$/.test(value)) return null;
  const n = parseFloat(value);
  if (n < 0 || n > 100) return null;
  // Keep previously stored CSS percentages; raw fraction consumers keep fractions.
  return fractionSettings.has(property)
    ? String(previous).includes("%") ? `${n}%` : String(Number((n / 100).toFixed(10)))
    : String(n);
}
const plainLabel = s => String(s || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
const labelParts = label => {
  const match = String(label || "").match(/^([\s\S]*?) \*([\s\S]*)\*$/);
  return match ? [plainLabel(match[1]), plainLabel(match[2])] : [plainLabel(label).replace(/^\*|\*$/g, ""), ""];
};
const settingCSS = `
.zzsettings-dialog { color: CanvasText; background: Canvas; width: min(54rem, calc(100vw - 24px)) !important; min-width: 0 !important; max-width: calc(100vw - 24px); padding: 20px !important; }
.zzsettings-dialog .sineItemPreferenceDialogContent { display: block; width: 100%; max-width: 100%; min-width: 0; }
.zzsettings-dialog .sineItemPreferenceDialogTopBar { gap: 12px; flex-wrap: wrap; border-color: ButtonBorder; }
.zzsettings-dialog .sineItemTitle { overflow-wrap: anywhere; }
.zzsettings-dialog .zzsettings-row { box-sizing: border-box; width: 100%; min-width: 0; gap: 16px; align-items: center; padding: 12px 0; margin: 0; border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); }
.zzsettings-dialog .zzsettings-copy { flex: 1 1 22rem; min-width: 0; }
.zzsettings-dialog .zzsettings-name { display: block; font-weight: 600; margin: 0 0 4px; overflow-wrap: anywhere; }
.zzsettings-dialog .zzsettings-help, .zzsettings-dialog .zzsettings-default { display: block; color: CanvasText; white-space: normal; overflow-wrap: anywhere; user-select: text; line-height: 1.5; }
.zzsettings-dialog .zzsettings-help { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); }
.zzsettings-dialog .zzsettings-described .zzsettings-name::after,
.zzsettings-dialog .zzsettings-described moz-toggle::part(label)::after { content: "i" / ""; display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; margin-inline-start: 6px; border: 1px solid currentColor; border-radius: 50%; font: italic bold 9px Georgia, serif; vertical-align: middle; cursor: help; }
.zzsettings-dialog .zzsettings-tooltip { position: fixed; inset: auto; margin: 0; box-sizing: border-box; width: max-content; max-width: min(340px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; padding: 8px 11px; border: 1px solid ButtonBorder; border-radius: 9px; background: Canvas; color: CanvasText; font: inherit; font-size: .9em; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; user-select: text; box-shadow: 0 4px 16px #0003; }
.zzsettings-dialog .zzsettings-default { margin-top: 6px; font-size: .9em; }
.zzsettings-dialog .zzsettings-row > :is(input, select, textarea) { flex: 0 1 17rem; width: 17rem; min-width: 0; max-width: 100%; box-sizing: border-box; margin: 0; }
.zzsettings-dialog .zzsettings-row > :is(input, textarea) { color: FieldText; background: Field; border: 1px solid ButtonBorder !important; border-radius: 4px; padding: 10px; font: inherit; }
.zzsettings-dialog .zzsettings-row > :is(input, textarea):focus-visible { outline: var(--focus-outline, 2px solid AccentColor); outline-offset: 2px; }
.zzsettings-dialog .zzsettings-row > select { font: inherit; padding-block: 8px; padding-inline: 8px 32px; }
.zzsettings-dialog .zzsettings-row > textarea { min-height: 8em; resize: vertical; white-space: pre-wrap; }
.zzsettings-dialog .zzsettings-rules { flex-direction: column; align-items: stretch; }
.zzsettings-dialog .zzsettings-rules > :is(.zzsettings-copy, textarea) { flex: auto; width: 100%; }
/* Zen replaces the native track accent without its contrasting dot colour.
   Keep Firefox's paired primary-button tokens and native control geometry. */
.zzsettings-dialog moz-toggle {
  --toggle-background-color-pressed: var(--button-background-color-primary);
  --toggle-background-color-pressed-hover: var(--button-background-color-primary-hover);
  --toggle-background-color-pressed-active: var(--button-background-color-primary-active);
  --toggle-dot-background-color-on-pressed: var(--button-text-color-primary);
  flex: 1; min-width: 0; overflow-wrap: anywhere; padding-block: 4px; }
.zzsettings-dialog moz-toggle::part(button) { margin: 12px 8px; flex-shrink: 0; }
.zzsettings-dialog moz-toggle::part(label) { font-weight: 600; }
.zzsettings-dialog .zzsettings-state { flex: 0 0 3ch; color: CanvasText; }
.zzsettings-dialog .zzsettings-heading { display: block; width: 100%; margin: 24px 0 4px; padding: 0; font-size: 1.15em; font-weight: 600; overflow-wrap: anywhere; }
.zzsettings-dialog .zzsettings-error { display: block; color: CanvasText; font-weight: 600; white-space: pre-wrap; }
.sineItem.zzsettings-card:not(:has(> .sineItemContent .sineItemPreferenceToggle[pressed])) > .sineItemActions > .sineItemConfigureButton { display: none !important; }
.sineItem.zzsettings-card:has(> .sineItemContent .sineItemPreferenceToggle[pressed]) > .sineItemActions > .sineItemConfigureButton { display: inline-flex !important; }
.sineItem.zzsettings-card:not(:has(> .sineItemContent .sineItemPreferenceToggle[pressed])) > .sineItemActions > .sineItemConfigureButton + button { margin-left: 0 !important; }
.sineItem.zzsettings-card:has(> .sineItemContent .sineItemPreferenceToggle[pressed]) > .sineItemActions > .sineItemConfigureButton + button { margin-left: 3.5px !important; }
@media (max-width: 600px) {
  .zzsettings-dialog { padding: 12px !important; }
  .zzsettings-dialog .zzsettings-row:not(.zzsettings-boolean) { flex-direction: column; align-items: stretch; gap: 8px; }
  .zzsettings-dialog .zzsettings-row > :is(.zzsettings-copy, input, select, textarea) { flex: auto; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .zzsettings-dialog { animation: none !important; } }
@media (forced-colors: active) {
  .zzsettings-dialog .zzsettings-row { border-color: CanvasText; }
  .zzsettings-dialog moz-toggle {
    --toggle-background-color: ButtonFace;
    --toggle-background-color-pressed: ButtonText;
    --toggle-background-color-pressed-hover: ButtonText;
    --toggle-background-color-pressed-active: ButtonText;
    --toggle-dot-background-color-on-pressed: ButtonFace;
    --toggle-dot-background-color: ButtonText;
    --toggle-dot-background-color-hover: ButtonText;
    --toggle-dot-background-color-active: ButtonText;
  }
  .zzsettings-dialog moz-toggle::part(button) { forced-color-adjust: none; }
}
`;

// One registry per settings document. No timer/polling, and one observer per
// watched preference, shared by value bindings and conditional rows.
function settingsDocument(window, retire) {
  const { document } = window, entries = new Set(), watched = new Map();
  // One native top-layer tooltip avoids clipping inside Sine's scrolling dialog.
  // Original help stays visually hidden in each control's accessible description.
  const tooltip = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  tooltip.className = "zzsettings-tooltip"; tooltip.popover = "auto"; tooltip.setAttribute("aria-hidden", "true");
  const hideHelp = () => { if (tooltip.matches(":popover-open")) tooltip.hidePopover(); tooltip.remove(); };
  const helpRow = node => node?.closest?.(".zzsettings-dialog .zzsettings-described");
  const showHelp = row => {
    if (!row || tooltip.parentElement === row) return;
    hideHelp();
    tooltip.textContent = row.querySelector(".zzsettings-help").textContent;
    row.append(tooltip); tooltip.showPopover();
    const label = row.querySelector(".zzsettings-name") || row.querySelector("moz-toggle").labelEl;
    const anchor = label.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12))}px`;
    const top = anchor.bottom + box.height <= window.innerHeight - 12 ? anchor.bottom : anchor.top - box.height;
    tooltip.style.top = `${Math.max(12, Math.min(top, window.innerHeight - box.height - 12))}px`;
  };
  const helpEvents = [
    ["pointerover", event => { const row = helpRow(event.target); if (row && !row.contains(event.relatedTarget)) showHelp(row); }],
    ["pointerout", event => { const row = helpRow(event.target); if (row && !row.contains(event.relatedTarget) && !row.matches(":focus-within")) hideHelp(); }],
    ["focusin", event => showHelp(helpRow(event.target))],
    ["focusout", event => { const row = helpRow(event.target); if (row && !row.contains(event.relatedTarget) && !row.matches(":hover")) hideHelp(); }],
    ["scroll", event => { if (event.target !== tooltip) hideHelp(); }],
    ["close", hideHelp],
  ];
  for (const [type, listener] of helpEvents) document.addEventListener(type, listener, true);
  window.addEventListener("resize", hideHelp);
  const observer = { observe(_s, _t, name) { for (const entry of watched.get(name) || []) {
    entry.sync(name);
    if (tooltip.parentElement === entry.row && entry.row.style.display === "none") hideHelp();
  } } };
  const remove = entry => {
    if (tooltip.parentElement === entry.row) hideHelp();
    entries.delete(entry);
    entry.dispose();
    for (const name of entry.names) {
      const users = watched.get(name);
      users.delete(entry);
      if (!users.size) { Services.prefs.removeObserver(name, observer); watched.delete(name); }
    }
  };
  const mutations = new window.MutationObserver(records => {
    if (records.some(r => r.removedNodes.length)) {
      for (const entry of entries) if (!entry.row.isConnected) remove(entry);
    }
  });
  mutations.observe(document.getElementById("sineModsList") || document.documentElement, { childList: true, subtree: true });
  window.addEventListener("unload", () => {
    hideHelp(); for (const [type, listener] of helpEvents) document.removeEventListener(type, listener, true);
    window.removeEventListener("resize", hideHelp);
    for (const entry of entries) remove(entry); mutations.disconnect(); retire();
  }, { once: true });
  const style = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
  style.textContent = settingCSS; document.documentElement.append(style);
  return entry => {
    // Called after Sine appends the row, so first-open conditions use mounted DOM.
    if (!entry.row.isConnected) { entry.dispose(); return; }
    const card = entry.row.closest(".sineItem");
    if (card?.getAttribute("mod-id") !== entry.mod) { entry.dispose(); return; }
    card.classList.add("zzsettings-card");
    const dialog = entry.row.closest("dialog"), title = dialog?.querySelector(".sineItemTitle");
    if (dialog && title) {
      dialog.classList.add("zzsettings-dialog");
      title.id = `${entry.mod}-settings-title`; dialog.setAttribute("aria-labelledby", title.id);
    }
    entries.add(entry);
    for (const name of entry.names) {
      if (!watched.has(name)) { watched.set(name, new Set()); Services.prefs.addObserver(name, observer); }
      watched.get(name).add(entry);
    }
    entry.sync();
  };
}

function presentSetting(pref, row, window, manager, mod, mount) {
  const doc = window.document, ns = "http://www.w3.org/1999/xhtml";
  const el = (tag, className, text) => { const n = doc.createElementNS(ns, tag); n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const [name, help] = labelParts(pref.label), id = row.id;
  const listeners = [];
  const on = (node, event, fn) => { node.addEventListener(event, fn); listeners.push(() => node.removeEventListener(event, fn)); };
  const read = () => {
    const P = Services.prefs, type = P.getPrefType(pref.property);
    return type === P.PREF_BOOL ? P.getBoolPref(pref.property) : type === P.PREF_INT ? P.getIntPref(pref.property)
      : type === P.PREF_STRING ? P.getStringPref(pref.property) : pref.defaultValue;
  };
  const restart = () => { if (pref.restart) ChromeUtils.importESModule("chrome://userscripts/content/utils/uc_api.sys.mjs").default.showToast({ id: "3" }); };
  const defaultOption = pref.options?.find(o => o.value === pref.defaultValue);
  const defaultText = `Default: ${pref.type === "checkbox" ? pref.defaultValue ? "On" : "Off"
    : defaultOption ? defaultOption.label : displaySettingValue(pref.property, pref.defaultValue) || "Empty"}`;
  const helpEl = el("span", "zzsettings-help", help), defaultEl = el("span", "zzsettings-default", defaultText);
  helpEl.id = id + "-help"; defaultEl.id = id + "-default";
  let syncValue = () => {};
  row.removeAttribute("tooltiptext");
  row.classList.add("zzsettings-row");
  if (pref.type === "separator") {
    row.replaceChildren(el("h3", "zzsettings-heading", name));
    row.style.removeProperty("font-size"); row.style.removeProperty("margin");
    row.classList.remove("zzsettings-row");
  } else if (pref.type === "checkbox") {
    // Replacing the ROW drops Sine's anonymous parent click handler, as well
    // as the checkbox's native event ownership. There is exactly one writer.
    row = row.cloneNode(false); row.removeAttribute("checked");
    row.className = "zzsettings-row zzsettings-boolean";
    const toggle = el("moz-toggle", ""), state = el("span", "zzsettings-state");
    toggle.inputLayout = "inline-end"; toggle.label = name;
    const description = el("span", ""); description.slot = "description"; description.append(helpEl, defaultEl); toggle.append(description);
    state.setAttribute("aria-hidden", "true"); row.append(toggle, state);
    syncValue = () => { toggle.pressed = !!read(); state.textContent = toggle.pressed ? "On" : "Off"; };
    syncValue();
    on(toggle, "toggle", () => { if (toggle.disabled || !row.isConnected) return; Services.prefs.setBoolPref(pref.property, toggle.pressed); restart(); });
    // Native graphic stays its original size; surrounding 44px hit area
    // forwards only otherwise-unhandled pointer clicks to the native button.
    on(toggle, "click", event => {
      if (toggle.disabled || event.defaultPrevented || event.composedPath().some(n => n.localName === "button" || n.localName === "label" || n === description)) return;
      const b = toggle.buttonEl?.getBoundingClientRect();
      if (b && Math.abs(event.clientX - (b.left + b.width / 2)) <= Math.max(44, b.width) / 2 &&
          Math.abs(event.clientY - (b.top + b.height / 2)) <= Math.max(44, b.height) / 2) { toggle.focus(); toggle.click(); }
    });
  } else {
    const copy = el("div", "zzsettings-copy"), label = el("label", "zzsettings-name", name);
    label.id = id + "-label"; copy.append(label, helpEl, defaultEl);
    row.querySelector(".sineItemPreferenceLabel")?.remove(); row.prepend(copy);
    let control = row.querySelector("input, menulist");
    const converted = fractionSettings.has(pref.property) || pref.property === "zzrouter.nexus-banner-opacity";
    const rules = pref.property === "zzrouter.rules";
    if (pref.type === "dropdown") {
      // Firefox's XUL combobox discards aria-describedby while closed. A native
      // HTML select exposes the name, inline help and default without a custom menu.
      const old = control; control = el("select", "");
      for (const option of pref.options) {
        const choice = el("option", "", option.label + (option.value === pref.defaultValue ? " — Default" : ""));
        choice.value = option.value; control.append(choice);
      }
      old.replaceWith(control);
      on(control, "change", () => {
        const option = pref.options.find(o => String(o.value) === control.value);
        if (!option) return;
        const value = option.value;
        Services.prefs[typeof value === "boolean" ? "setBoolPref" : typeof value === "number" ? "setIntPref" : "setStringPref"](pref.property, value);
        manager.rebuildMods(false, false); restart();
      });
    }
    if (converted || rules) {
      const old = control;
      control = rules ? el("textarea", "") : old.cloneNode(false);
      control.value = old.value; old.replaceWith(control);
      if (rules) { row.classList.add("zzsettings-rules"); control.rows = 5; control.spellcheck = false; }
      if (converted) control.placeholder = displaySettingValue(pref.property, pref.defaultValue);
      const error = el("span", "zzsettings-error"); error.id = id + "-error"; error.setAttribute("aria-live", "polite"); copy.append(error);
      on(control, "change", () => {
        let value = control.value, message = "";
        if (rules) {
          const browser = window.browsingContext?.topChromeWindow || Services.wm.getMostRecentWindow("navigator:browser");
          const result = browser?.TabRouter?.validateRules(value);
          if (!result) message = "Rule validation unavailable. Restart with Tab Router enabled before editing.";
          else if (!result.valid) message = result.errors.map(e => `Line ${e.line}, entry ${e.entry}: ${e.message}`).join("\n");
        } else {
          value = storedSettingValue(pref.property, value, read());
          // Existing CSS expressions remain valid for CSS opacity consumers.
          if (value === null && fractionSettings.has(pref.property) && /^(?:calc|var|clamp|min|max)\(/.test(control.value.trim()) && window.CSS.supports("opacity", control.value)) value = control.value;
          if (value === null) message = "Enter an opacity from 0% to 100%.";
        }
        error.textContent = message; control.toggleAttribute("aria-invalid", !!message);
        if (message) { control.setAttribute("aria-invalid", "true"); return; }
        if (value === read()) return;
        Services.prefs.setStringPref(pref.property, value); manager.rebuildMods(false, false); restart();
      });
    }
    control.id = id + "-control";
    label.htmlFor = control.id; label.setAttribute("control", control.id);
    control.setAttribute("aria-labelledby", label.id);
    control.setAttribute("aria-describedby", `${helpEl.id} ${defaultEl.id}${converted || rules ? " " + id + "-error" : ""}`);
    control.removeAttribute("tooltiptext");
    syncValue = () => {
      const value = read();
      if (pref.type === "dropdown") {
        const match = pref.options.find(o => String(o.value) === String(value));
        // Preserve unknown/empty saved values without selecting or writing a replacement.
        let saved = control.querySelector("[data-zzsettings-saved]");
        if (match) saved?.remove();
        else {
          if (!saved) { saved = el("option", ""); saved.setAttribute("data-zzsettings-saved", ""); saved.disabled = true; control.prepend(saved); }
          saved.setAttribute("value", value ?? "");
          saved.textContent = `Saved value: ${value === "" ? "Empty" : value}`;
        }
        control.value = value ?? "";
      } else control.value = converted ? displaySettingValue(pref.property, value) : value ?? "";
    };
    syncValue();
  }
  if (help && pref.type !== "separator") row.classList.add("zzsettings-described");
  const names = new Set(pref.property ? [pref.property] : []);
  const collect = conditions => { for (const c of Array.isArray(conditions) ? conditions : conditions ? [conditions] : []) {
    if (c.if || c.not) names.add((c.if || c.not).property); else collect(c.conditions);
  } };
  collect(pref.conditions);
  const entry = { row, mod, names, dispose: () => listeners.forEach(off => off()), sync(changed) {
    if (!changed || changed === pref.property) syncValue();
    row.style.display = !pref.conditions || allHold(pref.conditions, pref.operator || "OR") ? "flex" : "none";
  } };
  window.setTimeout(() => mount(entry));
  return row;
}

export function fixSettingsConditions(manager, utils) {
  const prefs = manager.preferences;
  if (!prefs || prefs.__zenPersonalModsConditions ||
      typeof prefs.parsePref !== "function" || typeof prefs.setupPrefObserver !== "function") return false;
  const owners = new WeakMap(), documents = new WeakMap();
  if (utils) {
    const get = utils.getModPreferences;
    utils.getModPreferences = async function (mod, ...args) {
      const result = await get.call(this, mod, ...args), prefix = settingScopes.get(mod.id);
      if (prefix) for (const pref of result) {
        const key = pref.property || pref.id;
        if (!key || key.startsWith(prefix) || mod.id === "zz-glassflow" && nativeSettings.has(key)) owners.set(pref, mod.id);
      }
      return result;
    };
  }
  manager.preferences = {
    ...prefs,
    __zenPersonalModsConditions: true,
    parsePref(pref, ...rest) {
      const window = rest[1], mod = owners.get(pref);
      if (mod) {
        // Sine mutates labels. Keep source metadata intact and let its original
        // parser initialize defaults and bind unchanged text inputs.
        // Conditions use the document registry instead of leaking Sine's
        // per-row observers across rebuilds; no second observer is installed.
        const parsed = { ...pref, conditions: undefined };
        const row = prefs.parsePref(parsed, ...rest);
        if (!row) return row;
        if (!documents.has(window)) documents.set(window, settingsDocument(window, () => documents.delete(window)));
        return presentSetting(pref, row, window, manager, mod, documents.get(window));
      }
      const row = prefs.parsePref(pref, ...rest);
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
    if (fixChromeStylesheetImports(utils)) {
      ChromeUtils.importESModule("chrome://userscripts/content/services/stylesheets.sys.mjs")
        .default.rebuildMods().catch(error => console.warn("[Zen Personal Mods] Chrome styles rebuild failed:", error));
    }
    if (!installSineUpdateGuard(manager, utils)) {
      console.info("[Zen Personal Mods] Sine update guard skipped: engine does not match the shared-temp implementation.");
    }
    fixSettingsConditions(manager, utils);
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
