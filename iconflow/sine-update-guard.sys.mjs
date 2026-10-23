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
// Restrict presentation to metadata returned for these independently installable mods.
const settingScopes = new Map([
  ["zz-download-prompt", "zzdl."], ["zz-glassflow", "zzglass."],
  ["zz-glassflow-library", "zzlib."], ["zz-groupflow", "zzgroup."],
  ["zz-iconflow", "zzicon."], ["zz-tab-router", "zzrouter."],
  ["zz-tab-unloader", "zzunload."], ["zz-zen-turbo", "zzturbo."],
  ["zz-mediaflow", "zzmedia."], ["zz-peekflow", "zzpeek."],
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
  const observer = { observe(_s, _t, name) { for (const entry of watched.get(name) || []) entry.sync(name); } };
  const remove = entry => {
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
  window.addEventListener("unload", () => { for (const entry of entries) remove(entry); mutations.disconnect(); retire(); }, { once: true });
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
