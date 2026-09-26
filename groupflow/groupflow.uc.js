// ==UserScript==
// @name           Groupflow
// @description    Persists nested groups, supplies native group controls, and folds subgroups at startup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window. instance.retire is the
  // pending startup observer until start() swaps in the real cleanup.
  const INSTANCE_KEY = "__zzgroupInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = {
    generation: (previous?.generation | 0) + 1,
    // A live update from an older version waits until the next window startup.
    startupFolded: previous?.startupFolded ?? !!previous,
    retire: () => {},
  };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzgroup.";
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(PREFIX + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref(PREFIX + k, d); } catch { return d; } };
  const num  = (k, d) => { try { return Services.prefs.getIntPref(PREFIX + k); } catch { return d; } };
  // ---- pref variables at startup -----------------------------------------
  // Sine injects string and number prefs as CSS variables, but not until
  // something (the settings page, a mod reload) triggers it -- measured on a
  // fresh launch, every one of them was absent while the sheet itself was
  // loaded and working. So the CSS ran on its fallbacks and configured
  // values only appeared after a reload. These are written here instead,
  // from the prefs themselves, so they exist before first paint.
  //
  // Naming matches Sine's own convention exactly: zzgroup.foo-bar becomes
  // --zzgroup-foo-bar, dots to dashes. Booleans are skipped -- those are read
  // with -moz-pref(), never as variables.
  function injectPrefVars() {
    let names = [];
    try { names = Services.prefs.getBranch(PREFIX).getChildList(""); } catch { return; }
    const root = document.documentElement;
    for (const leaf of names) {
      const full = PREFIX + leaf;
      const value = readPrefValue(full);
      if (value === null) continue;
      try { root.style.setProperty("--" + full.replace(/\./g, "-"), value); } catch {}
    }
  }

  // The type is CHECKED, never guessed by attempting reads: calling
  // getStringPref on a boolean throws NS_ERROR_UNEXPECTED, and Firefox logs
  // every one of those even when caught -- which floods the console with
  // "failed to read pref" for every boolean in the branch. Booleans are
  // skipped; they are read with -moz-pref(), never as variables.
  function readPrefValue(full) {
    const P = Services.prefs;
    let type;
    try { type = P.getPrefType(full); } catch { return null; }
    try {
      if (type === P.PREF_STRING) {
        const v = P.getStringPref(full);
        return v === "" ? null : v;
      }
      if (type === P.PREF_INT) return String(P.getIntPref(full));
    } catch {}
    return null;
  }


  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
      iconRules = null;                    // reparsed on the next refresh
      if (["favicons", "icon-rules", "section-icons", "icon-shape", "color-source", "subfolder.include-folders"].some(k => data === PREFIX + k)) schedule();
      const name = "--" + data.replace(/\./g, "-");
      const value = readPrefValue(data);
      try {
        if (value === null) document.documentElement.style.removeProperty(name);
        else document.documentElement.style.setProperty(name, value);
      } catch {}
    },
  };


  function hostOf(tab) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      return uri && /^https?$/.test(uri.scheme) ? uri.host : null;
    } catch { return null; }
  }

  // ---- icon rules ---------------------------------------------------------
  // The automatic icon is the group's dominant domain, which is right for
  // "Nexusmods" and useless for "Crimson Desert" -- every game on a mod site
  // shares that site's favicon, so every subgroup under it looks identical.
  // A rule names the group and gives it an icon of its own.
  //
  //   crimson desert = file:///C:/icons/crimson.png
  //   dawnwalker     = file:///C:/icons/dawnwalker.png
  //   nexusmods      = nexusmods.com
  //
  // A bare host on the right means "that site's favicon", which Firefox
  // serves from its own store with no network request. Anything carrying a
  // scheme is used as written, so file:, data: and chrome: all work -- and
  // https: works too, at the cost of an actual fetch.
  let iconRules = null;

  const normName = (s) => s.trim().toLowerCase().replace(/\s*\/\s*/g, "/");

  function parseIconRules() {
    if (iconRules) return iconRules;
    iconRules = [];
    for (const line of str("icon-rules", "").split(/[\n;]/)) {
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const name = normName(line.slice(0, eq));
      const value = line.slice(eq + 1).trim();
      // A quote would close the url() this ends up inside; a rule is not
      // worth breaking the whole sheet over, so such a value is dropped.
      if (!name || !value || /["'()\\]/.test(value)) continue;
      iconRules.push([name, /^[a-z][a-z0-9+.\-]*:/i.test(value)
        ? value
        : `page-icon:https://${value.replace(/^\/+|\/+$/g, "")}/`]);
    }
    return iconRules;
  }

  // Both the full path and the leaf are matchable, so "Crimson Desert" hits
  // wherever it sits while "Youtube / Crimson Desert" can single one out when
  // the same leaf name appears under two parents.
  function pathOf(g) {
    const out = [];
    for (let cur = g; cur?.tagName === "tab-group";
         cur = cur.parentElement?.closest("tab-group") ?? null) {
      out.unshift((cur.label ?? "").trim());
    }
    return out;
  }

  function ruledIcon(g) {
    const rules = parseIconRules();
    if (!rules.length) return null;
    const path = pathOf(g);
    if (!path.length) return null;
    const full = normName(path.join("/"));
    const leaf = normName(path.at(-1));
    for (const [name, url] of rules) if (name === full || name === leaf) return url;
    return null;
  }

  // Another mod may hand a group its icon: Tab Router stamps a creator,
  // game or account subgroup with its picture as a data: URI, round or
  // square by a second attribute. A rule still wins, and anything that
  // could break out of the url() is refused.
  function stampedIcon(g) {
    const v = g.getAttribute("data-zzrouter-icon");
    return v && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
  }

  // Dominant base host among the group's DIRECT tabs; subgroups compute
  // their own, so "Youtube > Creator" shows youtube's icon on the parent
  // and (usually the same) icon on the child from its own members.
  // Shape of the icon slot. Auto draws an avatar round, as its page does,
  // and everything else as a rounded square; the other settings apply to
  // every icon alike. The CSS selects on attributes since it cannot read
  // a custom property.
  const SHAPES = ["", "circle", "rounded", "squircle", "square", "folder"];
  let savedGroupIcons = null;
  let savedGroupColors = null;

  function customIcon(g) {
    const value = savedGroupIcons?.[g.id];
    if (typeof value !== "string" || !value) return null;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(value)) {
      return /^(?:chrome|resource|file|https?|page-icon|moz-anno):|^data:image\//i.test(value) &&
        !/["'()\\]/.test(value) ? value : null;
    }
    // ATG stored emoji as text. Escape it before constructing an image URI.
    const text = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="0" y="28" font-size="28">${text}</text></svg>`);
  }

  function setShape(g, picture) {
    const mode = num("icon-shape", 0);
    const shape = SHAPES[mode] ||
      (picture && g.getAttribute("data-zzrouter-icon-shape") !== "square" ? "circle" : "rounded");
    if (g.getAttribute("zzgf-shape") !== shape) g.setAttribute("zzgf-shape", shape);
    if (g.hasAttribute("zzgf-picture") !== !!picture) g.toggleAttribute("zzgf-picture", !!picture);
  }

  function tintGradient(background) {
    // The browser serializes colour stops, including names and nested colour
    // functions, to flat computed colours. Keep every stop and gradient intact.
    return background.replace(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi,
      color => `rgb(from ${color} r g b / calc(alpha * var(--zzgf-saved-tint-factor, 100%)))`);
  }

  function setSavedBackground(g, background) {
    const header = g.labelContainerElement;
    if (g.style.getPropertyValue("--zzgf-saved-background") === background &&
        (!background || header?.style.getPropertyValue("--zzgf-saved-tint-background"))) return;
    if (background) g.style.setProperty("--zzgf-saved-background", background);
    else g.style.removeProperty("--zzgf-saved-background");
    g.toggleAttribute("zzgf-saved-gradient", !!background);
    header?.style.removeProperty("--zzgf-saved-tint-background");
    if (!background || !header) return;
    const probe = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    probe.style.display = "none";
    probe.style.backgroundImage = background;
    header.appendChild(probe);
    try {
      const adjusted = tintGradient(getComputedStyle(probe).backgroundImage);
      if (CSS.supports("background-image", adjusted)) {
        // State tokens resolve on the header, never on its parent group.
        header.style.setProperty("--zzgf-saved-tint-background", adjusted);
      }
    } finally { probe.remove(); }
  }

  function refreshGroup(g) {
    const header = g.labelContainerElement;
    if (header && !header.querySelector(".zzgf-rim")) {
      const rim = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      rim.className = "zzgf-rim";
      rim.setAttribute("aria-hidden", "true");
      header.appendChild(rim);
    }
    // ATG may put a full gradient in this token; colour mixing needs one colour.
    let groupColor = getComputedStyle(g).getPropertyValue("--tab-group-color").trim();
    if (window.advancedTabGroups) {
      const background = groupColor.includes("gradient(") && !/url\s*\(/i.test(groupColor) &&
        CSS.supports("background-image", groupColor) ? groupColor : "";
      setSavedBackground(g, background);
    }
    if (!CSS.supports("color", groupColor)) {
      const saved = window.advancedTabGroups?.savedColors?.[g.id] ?? savedGroupColors?.[g.id];
      groupColor = "";
      for (const stop of Array.isArray(saved?.gradientColors) ? saved.gradientColors : []) {
        const color = Array.isArray(stop?.c) && stop.c.length === 3 && stop.c.every(Number.isFinite)
          ? `rgb(${stop.c.join(" ")})` : stop?.c;
        if (typeof color === "string" && CSS.supports("color", color)) { groupColor = color; break; }
      }
    }
    if (g.style.getPropertyValue("--zzgf-group-color") !== groupColor) {
      if (groupColor) g.style.setProperty("--zzgf-group-color", groupColor);
      else g.style.removeProperty("--zzgf-group-color");
    }
    if (num("color-source", 0) === 3) {
      const counts = new Map();
      let dominant = null, most = 0;
      for (const tab of g.tabs ?? []) {
        if (tab.closing || tab.hasAttribute("zen-empty-tab")) continue;
        const id = tab.getAttribute("usercontextid") || "0";
        const entry = counts.get(id) || { tab, count: 0 };
        entry.count++;
        counts.set(id, entry);
      }
      for (const { tab, count } of counts.values()) {
        if (count > most) { dominant = tab; most = count; }
      }
      const style = Number(dominant?.getAttribute("usercontextid")) > 0 ? getComputedStyle(dominant) : null;
      const token = style?.getPropertyValue("--identity-tab-color").trim();
      const color = token?.toLowerCase() === "currentcolor" ? style.color : token;
      const value = color && CSS.supports("color", color) ? color : "";
      if (g.style.getPropertyValue("--zzgf-container-color") !== value) {
        if (value) g.style.setProperty("--zzgf-container-color", value);
        else g.style.removeProperty("--zzgf-container-color");
      }
    }
    // Native folders keep their icon and controls; only their palette is shared.
    if (g.isZenFolder || g.tagName === "zen-folder") return;
    const rule = ruledIcon(g) ?? customIcon(g);
    const picture = !rule && bool("section-icons", true) ? stampedIcon(g) : null;
    setShape(g, picture);
    const ruled = rule ?? picture;
    if (ruled) { setIcon(g, `url("${ruled}")`); return; }
    if (!bool("favicons", true)) {
      setIcon(g, 'url("chrome://browser/skin/zen-icons/folder.svg")'); return;
    }
    const counts = new Map(), icons = new Map();
    const count = tab => {
      const h = hostOf(tab);
      if (!h) return;
      counts.set(h, (counts.get(h) || 0) + 1);
      // Zen retains the tab's actual favicon across restore/unloading. A
      // synthetic https://host/ lookup can miss icons stored for another URL.
      const icon = gBrowser.getIcon?.(tab) || tab.getAttribute("image");
      if (icon && !/["'()\\]/.test(icon)) icons.set(h, icon);
    };
    for (const el of g.groupContainer?.children ?? []) {
      if (!el.matches?.("tab")) continue;
      count(el);
    }
    // A parent whose direct children are all subgroups: borrow the first
    // subgroup's members so the parent still gets an icon.
    if (!counts.size) {
      for (const el of g.groupContainer?.children ?? []) {
        if (!gBrowser.isTabGroup?.(el)) continue;
        for (const t of el.tabs ?? []) count(t);
        if (counts.size) break;
      }
    }
    if (!counts.size) { setIcon(g, 'url("chrome://browser/skin/zen-icons/folder.svg")'); return; }
    let host, most = 0;
    for (const [candidate, count] of counts) {
      if (count > most) { host = candidate; most = count; }
    }
    // page-icon: is Firefox's own favicon protocol, served from the local
    // favicon store -- no network fetch happens here.
    setIcon(g, `url("${icons.get(host) ?? `page-icon:https://${host}/`}")`);
  }

  // refreshAll runs half a second after any tab's favicon changes -- so
  // after every page load -- and rewrote every group's icon each time.
  // Writing an inline style invalidates style on that element even when
  // the value is identical, and these groups carry the glass effects. In
  // the steady state nothing has changed, so nothing is written.
  function setIcon(g, value) {
    if (g.style.getPropertyValue("--zzgf-icon") !== value) g.style.setProperty("--zzgf-icon", value);
  }

  function refreshAll() {
    for (const g of plainGroups()) refreshGroup(g);
    refreshFolders();
  }

  function refreshFolders() {
    if (bool("subfolder.include-folders", false)) {
      for (const g of document.querySelectorAll("zen-folder")) refreshGroup(g);
    }
  }

  // A favicon change or a session restore names one tab; only that tab's
  // group chain can have changed. Group lifecycle events name a group whose
  // members moved, so its old and new parents are both in play -- those
  // refresh everything. Anything without a usable target also refreshes
  // everything, so the fallback is always the full pass.
  let timer = null;
  const dirty = new Set();
  let everything = false;
  const schedule = (event) => {
    const t = event?.target;
    if (t?.tagName === "tab" && t.group) {
      for (let g = t.group; g; g = g.parentElement?.closest("tab-group, zen-folder") ?? null) dirty.add(g);
    } else {
      everything = true;
    }
    clearTimeout(timer);
    timer = setTimeout(refreshDirty, 500);
  };
  function refreshDirty() {
    if (everything) { everything = false; dirty.clear(); refreshAll(); return; }
    for (const g of dirty) {
      if (g.isConnected && !g.hasAttribute("split-view-group") &&
          (plainGroup(g) || bool("subfolder.include-folders", false))) refreshGroup(g);
    }
    dirty.clear();
  }

  // ZenTabIconChanged is patched into tabbrowser.setIcon(), so it fires for
  // EVERY tab whose favicon is set, and it bubbles -- which is precisely the
  // signal this mod used to poll for. A member navigating to another domain
  // gets a new favicon, which is the only reason the icon needs recomputing.
  // TabGroupUpdate and TabGroupRemovedFromDOM are Zen's own group events; both
  // change what a group contains and neither was being watched.
  const EVENTS = ["TabGroupCreate", "TabGrouped", "TabUngrouped",
                  "TabGroupRemoved", "TabGroupRemovedFromDOM", "TabGroupUpdate",
                  "FolderGrouped", "FolderUngrouped",
                  "SSTabRestored", "ZenTabIconChanged"];

  const plainGroup = g => g?.tagName === "tab-group" && !g.isZenFolder && !g.hasAttribute("split-view-group");
  const plainGroups = () => [...document.querySelectorAll("tab-group")].filter(plainGroup);
  const workspaceOf = g => g.closest("zen-workspace")?.id || g.getAttribute("zen-workspace-id");

  function readGroupData(key) {
    try {
      const data = JSON.parse(SessionStore.getCustomWindowValue(window, key) || "{}");
      if (data && typeof data === "object" && !Array.isArray(data)) return Object.assign(Object.create(null), data);
      throw new Error("Expected an object");
    } catch (error) {
      // Preserve malformed stored data instead of replacing it with an empty map.
      console.error(`[Groupflow] Cannot read ${key}:`, error);
      return null;
    }
  }

  function writeGroupData(key, data) {
    if (!data) return;
    const value = JSON.stringify(data);
    if (SessionStore.getCustomWindowValue(window, key) !== value) {
      SessionStore.setCustomWindowValue(window, key, value);
    }
  }

  function trackGroupDetails() {
    // Firefox restores only groups referenced directly by a tab. Keep the few
    // fields needed to rebuild parents containing only subgroups, also while
    // ATG is still installed so a live update can prepare the migration.
    const data = readGroupData("groupflowGroups");
    let timer = null, closed = false;
    function save() {
      if (!data || closed) return;
      for (const group of plainGroups()) data[group.id] = {
        label: group.label, color: group.color, workspace: workspaceOf(group),
      };
      writeGroupData("groupflowGroups", data);
    }
    function changed() { if (timer === null) timer = setTimeout(() => { timer = null; save(); }, 0); }
    function closing() { save(); closed = true; }
    const events = ["TabGroupCreate", "TabGroupUpdate", "FolderGrouped", "FolderUngrouped"];
    for (const event of events) window.addEventListener(event, changed, true);
    window.addEventListener("SSWindowClosing", closing, true);
    return { data, save, retire() {
      save(); clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, changed, true);
      window.removeEventListener("SSWindowClosing", closing, true);
    } };
  }

  function restoreParents(parents, candidates = plainGroups(), details = null) {
    if (!parents) return;
    for (const group of candidates) {
      if (!plainGroup(group)) continue;
      const seen = new Set([group.id]), chain = [];
      let id = parents[group.id];
      while (typeof id === "string" && id && !seen.has(id)) { seen.add(id); chain.push(id); id = parents[id]; }
      if (id) continue; // Reject saved cycles before creating or moving anything.
      let child = group;
      for (const parentId of chain) {
        let parent = document.getElementById(parentId);
        if (!parent) {
          const saved = details?.[parentId];
          if (!saved || saved.workspace !== workspaceOf(child) || typeof saved.label !== "string") break;
          parent = document.createXULElement("tab-group");
          parent.id = parentId; parent.label = saved.label; parent.color = saved.color;
          child.before(parent);
        }
        if (!plainGroup(parent) || child.contains(parent) || workspaceOf(child) !== workspaceOf(parent)) break;
        if (child.group !== parent) parent.groupContainer.appendChild(child);
        child = parent;
      }
    }
  }

  function startStandaloneGroups(details) {
    const parents = readGroupData("tabGroupParents");
    const icons = readGroupData("tabGroupIcons");
    const colors = readGroupData("tabGroupColors");
    savedGroupIcons = icons || {};
    savedGroupColors = colors;
    const decorated = new WeakSet(), appliedColors = new WeakMap(), colorCache = new Map();
    let known = new Set(), pending = null, retired = false, closing = false;
    // A native closed/saved parent records all descendant tabs but only its own
    // group descriptor. Supply the missing descriptors to the native restorer.
    const nativeRestore = gBrowser.createTabsForSessionRestore;
    function restoreTabs(...args) {
      const groups = [...args[3]], included = new Set(groups.map(group => group.id));
      for (const { groupId } of args[2]) {
        const saved = details?.[groupId];
        if (included.has(groupId) || !saved) continue;
        const seen = new Set([groupId]);
        let parent = parents?.[groupId];
        while (parent && !included.has(parent) && !seen.has(parent)) { seen.add(parent); parent = parents?.[parent]; }
        if (!included.has(parent)) continue;
        groups.push({ id: groupId, name: saved.label, color: saved.color, collapsed: false });
        included.add(groupId);
      }
      args[3] = groups;
      return nativeRestore.apply(this, args);
    }
    gBrowser.createTabsForSessionRestore = restoreTabs;
    const root = document.documentElement;
    root.setAttribute("zzgf-standalone", "");
    // Native tab-group creation/dragging is disabled by Zen's default preference.
    // An explicit user choice still wins.
    if (!Services.prefs.prefHasUserValue("browser.tabs.groups.enabled")) {
      Services.prefs.setBoolPref("browser.tabs.groups.enabled", true);
    }

    function applyColor(group) {
      if (appliedColors.has(group) && appliedColors.get(group) === group.color) return;
      const saved = colors?.[group.id];
      setSavedBackground(group, "");
      if (!saved || !String(group.color || "").startsWith(group.id)) { appliedColors.set(group, group.color); return; }
      let value = colorCache.get(group.id);
      if (!value) {
        if (typeof saved === "string") value = saved;
        else if (typeof saved.favicon === "string") value = saved.favicon;
        else if (Array.isArray(saved.gradientColors)) {
          const picker = window.gZenThemePicker;
          const opacity = picker.currentOpacity, algorithm = picker.useAlgo;
          try {
            picker.currentOpacity = saved.opacity ?? 1;
            value = picker.getGradient(saved.gradientColors);
          } finally {
            picker.currentOpacity = opacity;
            const theme = gZenWorkspaces.getWorkspaceFromId(gZenWorkspaces.activeWorkspace)?.theme;
            picker.getGradient(theme?.gradientColors || []);
            picker.useAlgo = algorithm;
          }
        }
        if (typeof value !== "string") return;
        colorCache.set(group.id, value);
      }
      if (CSS.supports("color", value)) {
        // Zen reapplies these references even when the colour code is unchanged.
        // Define its source tokens so a theme/workspace refresh retains the colour.
        group.style.setProperty(`--tab-group-${group.color}`, value);
        group.style.setProperty(`--tab-group-${group.color}-invert`, value);
        group.style.setProperty("--tab-group-color", value);
        group.style.setProperty("--tab-group-color-invert", value);
      } else if (value.includes("gradient(") && !/url\s*\(/i.test(value) && CSS.supports("background-image", value)) {
        setSavedBackground(group, value);
      }
      appliedColors.set(group, group.color);
    }

    function decorate(group) {
      const header = group.labelContainerElement;
      if (!header) return;
      if (!decorated.has(group)) {
        decorated.add(group);
        header.classList.add("zen-drop-target");
        for (const action of ["icon", "close"]) {
          const close = action === "close";
          const control = document.createElementNS("http://www.w3.org/1999/xhtml", close ? "button" : "span");
          control.className = "zzgf-control zzgf-" + action + (close ? " tab-close-button" : "");
          if (close) {
            control.type = "button";
            control.setAttribute("aria-label", "Close group");
            control.title = "Close group";
          } else control.setAttribute("aria-hidden", "true");
          header.appendChild(control);
        }
      }
      const ws = workspaceOf(group);
      if (ws && group.getAttribute("zen-workspace-id") !== ws) group.setAttribute("zen-workspace-id", ws);
      try { applyColor(group); } catch (error) { console.error("[Groupflow] Cannot restore group colour:", error); }
      refreshGroup(group);
    }

    function updateParents(groups) {
      if (!parents) return;
      for (const group of groups) {
        const parent = group.parentElement?.closest("tab-group");
        if (plainGroup(parent)) parents[group.id] = parent.id;
        else delete parents[group.id];
      }
    }
    function saveParents() {
      updateParents(plainGroups());
      writeGroupData("tabGroupParents", parents);
    }

    function pruneClosedState(groups) {
      // Retain metadata while Firefox can undo the close, including descendants
      // of a closed parent. Never prune against an unavailable closed-tabs store.
      const closed = [...SessionStore.getClosedTabGroups({ sourceWindow: window,
        closedTabsFromAllWindows: false, closedTabsFromClosedWindows: false }), ...SessionStore.getSavedTabGroups()];
      const retained = new Set(closed.map(group => group.id));
      for (const group of closed) for (const tab of group.tabs) if (tab.state?.groupId) retained.add(tab.state.groupId);
      for (const tab of SessionStore.getClosedTabData(window)) if (tab.state?.groupId) retained.add(tab.state.groupId);
      let size;
      do {
        size = retained.size;
        for (const [child, parent] of Object.entries(parents || {})) if (retained.has(parent)) retained.add(child);
      } while (size !== retained.size);
      for (const group of groups) retained.add(group.id);
      do {
        size = retained.size;
        for (const [child, parent] of Object.entries(parents || {})) if (retained.has(child)) retained.add(parent);
      } while (size !== retained.size);
      for (const [key, data] of [["tabGroupParents", parents], ["tabGroupIcons", icons],
        ["tabGroupColors", colors], ["groupflowGroups", details]]) {
        if (!data) continue;
        for (const id of Object.keys(data)) if (!retained.has(id)) { delete data[id]; colorCache.delete(id); }
        writeGroupData(key, data);
      }
    }

    function sync() {
      pending = null;
      if (retired) return;
      let groups = plainGroups();
      // Closed-group restoration creates new elements; ordinary drag/reparenting
      // keeps the same element and must not replay its previous saved parent.
      const added = groups.filter(group => !known.has(group));
      if (parents && added.length) {
        restoreParents(parents, added, details);
        groups = plainGroups();
      }
      known = new Set(groups);
      for (const group of groups) decorate(group);
      refreshFolders();
      updateParents(groups);
      try { pruneClosedState(groups); } catch (error) {
        console.error("[Groupflow] Retaining closed group data:", error);
        writeGroupData("tabGroupParents", parents);
      }
    }
    function changed() {
      if (pending === null) pending = setTimeout(sync, 0);
    }

    async function click(event) {
      const button = event.target.closest?.(".zzgf-close");
      const group = button?.closest("tab-group");
      if (!plainGroup(group)) return;
      event.preventDefault(); event.stopPropagation();
      try {
        await gBrowser.removeTabGroup(group);
      } catch (error) {
        console.error("[Groupflow] Group close failed:", error);
      }
    }

    function edit(event) {
      const header = event.target.closest?.(".tab-group-label-container");
      const group = header?.parentElement;
      if (!plainGroup(group)) return;
      event.preventDefault(); event.stopPropagation();
      gBrowser.tabGroupMenu.openEditModal(group);
    }

    function ungroup(event) {
      const group = gBrowser.tabGroupMenu.activeGroup;
      if (event.target.id !== "tabGroupEditor_ungroupTabs" || !plainGroup(group)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      gBrowser.tabGroupMenu.close();
      // Firefox's ungroupTabs reads direct children of <tab-group>. Zen moved
      // them into groupContainer. Move each direct item out through native APIs,
      // retaining nested groups and split views as units.
      for (const item of [...group.groupContainer.children]) {
        if (gBrowser.isTab(item) || gBrowser.isTabGroup(item) || gBrowser.isSplitViewWrapper(item)) {
          gBrowser.moveTabBefore(item, group);
        }
      }
    }

    // Native drag code handles the move. Header edges request insertion;
    // the middle retains Zen's drop-into target, matching native folders.
    function drag(event) {
      const header = event.target.closest?.(".tab-group-label-container");
      if (!plainGroup(header?.parentElement)) return;
      const rect = header.getBoundingClientRect();
      const threshold = Math.max(0, Math.min(45,
        Services.prefs.getIntPref("zen.tabs.folder-dragover-threshold-percent", 20))) / 100;
      const fraction = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
      header.classList.toggle("zen-drop-target", fraction >= threshold && fraction <= 1 - threshold);
    }
    function resetDrag() {
      for (const group of plainGroups()) group.labelContainerElement?.classList.add("zen-drop-target");
    }
    function beforeClose() { saveParents(); closing = true; }
    const events = ["TabGroupCreate", "TabGroupUpdate", "TabGroupRemoved", "TabGroupRemovedFromDOM",
      "TabGrouped", "TabUngrouped", "FolderGrouped", "FolderUngrouped"];
    for (const event of events) window.addEventListener(event, changed, true);
    window.addEventListener("click", click, true);
    window.addEventListener("contextmenu", edit, true);
    window.addEventListener("command", ungroup, true);
    window.addEventListener("dragover", drag, true);
    window.addEventListener("dragend", resetDrag, true);
    window.addEventListener("drop", resetDrag, true);
    window.addEventListener("SSWindowClosing", beforeClose, true);
    sync();
    return () => {
      retired = true;
      if (gBrowser.createTabsForSessionRestore === restoreTabs) gBrowser.createTabsForSessionRestore = nativeRestore;
      if (!closing) saveParents();
      clearTimeout(pending);
      for (const event of events) window.removeEventListener(event, changed, true);
      for (const [event, fn] of [["click", click], ["contextmenu", edit], ["command", ungroup], ["dragover", drag],
        ["dragend", resetDrag], ["drop", resetDrag], ["SSWindowClosing", beforeClose]]) {
        window.removeEventListener(event, fn, true);
      }
      for (const group of plainGroups()) {
        for (const button of group.querySelectorAll(":scope > .tab-group-label-container > .zzgf-control")) button.remove();
        group.labelContainerElement?.classList.remove("zen-drop-target");
        group.style.removeProperty("--zzgf-saved-background");
        group.removeAttribute("zzgf-saved-gradient");
      }
      root.removeAttribute("zzgf-standalone");
      savedGroupIcons = null;
      savedGroupColors = null;
    };
  }

  function toggleSubgroups(event) {
    if (event.button !== 0 || event.defaultPrevented || event.target.closest?.(
      "button, toolbarbutton, input, textarea, a, [contenteditable], .tab-close-button, .tab-reset-button, .tab-group-folder-button, .group-marker")) return;
    const group = event.target.closest?.(".tab-group-label-container")?.parentElement;
    const selector = "tab-group, zen-folder";
    if (!group?.matches(selector) || group.hasAttribute("split-view-group") ||
        group.parentElement?.closest(selector)) return;
    const children = [...group.querySelectorAll(selector)].filter(child => !child.hasAttribute("split-view-group"));
    if (!children.length) return;
    // Capture before Zen toggles the parent: this header controls its subfolders.
    event.preventDefault();
    event.stopPropagation();
    const selected = gBrowser.selectedTab;
    const collapse = children.some(child => !child.contains(selected) && !child.collapsed);
    // Keep the selected tab's whole path open without blocking the next expand.
    for (const child of children.reverse()) child.collapsed = collapse && !child.contains(selected);
    group.collapsed = false;
    gBrowser.tabGroupMenu.close();
  }

  function foldStartupGroups() {
    if (instance.startupFolded) return;
    // Finish ATG's restore when it is present. Standalone nesting is already
    // restored before this pass decides which groups are roots.
    const atg = window.advancedTabGroups;
    atg?.applySavedParents?.();
    // Descendants first: expanding a parent must see its children's final state.
    const selector = "tab-group, zen-folder";
    for (const group of [...document.querySelectorAll(selector)].reverse()) {
      if (group.hasAttribute("split-view-group")) continue;
      group.collapsed = !!group.parentElement?.closest(selector);
      // ATG also reapplies its saved states later, even if its observers have
      // not started yet. Give that restore the same startup state.
      if (group.tagName === "tab-group") atg?.saveGroupCollapsedState?.(group.id, group.collapsed);
    }
    instance.startupFolded = true;
  }

  function start() {
    // ATG's Arc behavior forcibly removes every collapsed attribute. Its
    // isArcMode method only controls collapse restoration/observers; the
    // appearance still follows the user's unchanged CSS preferences.
    const atg = window.advancedTabGroups;
    const arcMode = atg?.isArcMode;
    const allowCollapse = () => false;
    if (typeof arcMode === "function") atg.isArcMode = allowCollapse;
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    // Standalone sync refreshes group lifecycle changes in its existing pass.
    const iconEvents = atg ? EVENTS : ["SSTabRestored", "ZenTabIconChanged"];
    for (const ev of iconEvents) window.addEventListener(ev, schedule, true);
    window.addEventListener("click", toggleSubgroups, true);
    try { Services.obs.addObserver(schedule, "contextual-identity-updated"); } catch {}

    window.Groupflow = {
      // Additions may batch; removals/history purge and console calls stay immediate.
      refresh(defer = false) {
        if (defer) { schedule(); return; }
        clearTimeout(timer); dirty.clear(); everything = false;
        refreshAll();
      },
      // Which group would get which icon, and from where. Reads only.
      explain() {
        const out = [];
        for (const g of document.querySelectorAll("tab-group")) {
          if (g.isZenFolder || g.hasAttribute("split-view-group")) continue;
          out.push({
            group: (g.label ?? "").trim(),
            icon: (g.style.getPropertyValue("--zzgf-icon") || "(none)").slice(0, 60),
            from: ruledIcon(g) ? "icon rule" : customIcon(g) ? "saved group icon" :
              (bool("section-icons", true) && stampedIcon(g)) ? "Tab Router section icon" : "favicon",
          });
        }
        console.log(out);
        return out;
      },
    };
    const boot = setTimeout(refreshAll, 2000);
    let foldTimer = null;
    let cleanupGroups = null;
    let groupDetails = null;

    // This script is injected per window and lives as long as the window
    // does, so every registration has to be released here or it leaks
    // across window open/close cycles. The capture flag must match the
    // one used to add, or removeEventListener silently does nothing.
    // Sine cleanup and window unload can both run; retire this copy once.
    let retired = false;
    const cleanup = () => {
      if (retired) return;
      retired = true;
      if (atg?.isArcMode === allowCollapse) atg.isArcMode = arcMode;
      try { delete window.Groupflow; } catch {}
      for (const ev of iconEvents) window.removeEventListener(ev, schedule, true);
      window.removeEventListener("click", toggleSubgroups, true);
      try { Services.obs.removeObserver(schedule, "contextual-identity-updated"); } catch {}
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      clearTimeout(timer);
      clearTimeout(boot);
      clearTimeout(foldTimer);
      cleanupGroups?.();
      groupDetails?.retire();
      for (const rim of document.querySelectorAll(".tab-group-label-container > .zzgf-rim")) {
        rim.parentElement.style.removeProperty("--zzgf-saved-tint-background");
        rim.remove();
      }
      window.removeEventListener("unload", cleanup);
      dirty.clear();
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Registered with Sine, so an update re-injects this script live, no
    // restart: Sine calls cleanup, then loads the new file into the same
    // window, and the instance guard at the top retires whatever copy is
    // still here. Safe now that start() is contained and the top level
    // does nothing that can throw; the DOM unload listener above still
    // releases everything when the window closes.
    try { window.addUnloadListener?.(cleanup); } catch {}
    instance.retire = cleanup;

    // Zen resolves this after workspace/session restoration. Its folder
    // creation code also queues collapsed-state writes on the next task.
    window.gZenStartup.promiseInitialized.then(() => {
      if (retired) return;
      foldTimer = setTimeout(() => {
        if (retired) return;
        groupDetails = trackGroupDetails();
        if (!atg) cleanupGroups = startStandaloneGroups(groupDetails.data);
        else restoreParents(readGroupData("tabGroupParents"), plainGroups(), groupDetails.data);
        foldStartupGroups();
        groupDetails.save();
      }, 0);
    }).catch(e => console.error("[Groupflow] startup folding failed:", e));
  }

  // Written the moment this script is injected, not from start(). These
  // variables need only Services.prefs and the document element -- never
  // gBrowser -- and browser-delayed-startup-finished, which start() waits for,
  // fires well AFTER first paint. Deferring meant every window opened painting
  // the CSS fallbacks (10px roundness, the default tints) and then snapping to
  // the configured values. Doing it here is what actually makes the comment
  // above true.
  // ---- declared defaults --------------------------------------------------
  // Sine does not write the defaults declared in preferences.json into the
  // profile. manager.sys.mjs says so outright: "TODO: Apply default
  // preferences." So an unset pref reads as whatever the READER falls back
  // to, and the readers disagree with each other.
  //
  // A mod's own reader falls back one way (this script's bool(name, true)),
  // Sine's settings panel another (getBoolPref(name, false) when deciding
  // whether a conditioned row shows), and a -moz-pref() media query in the
  // stylesheet a third. Each is reasonable alone; together they produce a mod
  // behaving as if a setting is on while every row it governs is hidden as if
  // it were off.
  //
  // Writing each declared default once, and only when the pref has never
  // been set, removes the disagreement for all three at once. Nothing that
  // was already chosen is touched.
  const MOD_ID = "zz-groupflow";
  function migrateFolderDefaults(declared) {
    const S = Services.prefs, marker = PREFIX + "folder-defaults-v1";
    if (S.getBoolPref(marker, false)) return false;
    // Only unchanged 1.44.0 profiles migrate; edited profiles keep every value.
    const common = { opacity: "1", direction: 0, "end-mode": 0, spread: "100%", glow: false,
      "blur-radius": "20px", "label-color": "var(--zzgroup-label-color, inherit)" };
    const oldProfiles = {
      active: { ...common, tint: "42%", "end-tint": "17%", sheen: true, rim: true, blur: true },
      inactive: { ...common, tint: "12%", "end-tint": "4%", sheen: false, rim: false, blur: false },
      hover: { ...common, tint: "24%", "end-tint": "9%", sheen: false, rim: false, blur: false },
    };
    const read = (key, value) => {
      try { return S[typeof value === "boolean" ? "getBoolPref" :
        typeof value === "number" ? "getIntPref" : "getStringPref"](key, value); }
      catch { return undefined; } // A different pref type counts as an edit.
    };
    const replacements = new Map();
    for (const [state, values] of Object.entries(oldProfiles)) {
      const prefix = PREFIX + "subfolder." + state + ".";
      if (Object.entries(values).every(([key, value]) => read(prefix + key, value) === value)) {
        for (const key of Object.keys(values)) replacements.set(prefix + key, values[key]);
      }
    }
    for (const [key, value] of [["gradient-direction", 0], ["active-tint", "42%"]]) {
      if (read(PREFIX + key, value) === value) replacements.set(PREFIX + key, value);
    }
    let wrote = false;
    for (const pref of declared) {
      const value = pref.defaultValue;
      if (!replacements.has(pref.property) || replacements.get(pref.property) === value) continue;
      S[typeof value === "boolean" ? "setBoolPref" : typeof value === "number" ? "setIntPref" : "setStringPref"](pref.property, value);
      wrote = true;
    }
    S.setBoolPref(marker, true);
    return wrote;
  }
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs;
    let wrote = migrateFolderDefaults(declared) ? 1 : 0;
    for (const pref of declared) {
      const name = pref?.property;
      const value = pref?.defaultValue;
      if (!name || !name.startsWith(PREFIX) || value === undefined || value === null) continue;
      try {
        if (S.getPrefType(name) !== S.PREF_INVALID) continue;   // already chosen
        if (typeof value === "boolean") S.setBoolPref(name, value);
        else if (typeof value === "number") S.setIntPref(name, value);
        else if (typeof value === "string") S.setStringPref(name, value);
        else continue;
        wrote++;
      } catch {}
    }
    return wrote > 0;
  }

  try { injectPrefVars(); } catch {}
  // Seeding is a file read, so it cannot happen before first paint like the
  // line above. Re-inject after it, and only if it actually wrote something,
  // so a profile that already has its prefs pays nothing.
  seedDefaults().then((wrote) => { if (wrote) injectPrefVars(); }).catch(() => {});



  // ---- startup ------------------------------------------------------------
  // browser-delayed-startup-finished fires once. A script injected after it
  // -- Sine's rebuild path does that -- would wait forever, so the observer
  // is backed by a bounded poll and startOnce() makes whichever loses a
  // no-op. start() is wrapped: a throw here escapes into Sine's injection
  // loop, which does not catch, and every mod queued after this one is never
  // injected.
  let started = false;
  let waitTimer = null;
  let obs = null;

  const stopWaiting = () => {
    if (obs) {
      try { Services.obs.removeObserver(obs, "browser-delayed-startup-finished"); } catch {}
      obs = null;
    }
    if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
  };

  const startOnce = () => {
    // A newer copy of this script may have claimed the window while this one
    // was waiting; that copy owns the registrations, so this one stays quiet.
    if (started || window[INSTANCE_KEY] !== instance) return;
    started = true;
    stopWaiting();
    try { start(); } catch (e) {
      console.error("[Groupflow] failed to start:", e);
    }
  };

  // Read through the window first, then the bare global. A sub-script loaded
  // with the window as its target sees the same object either way, but that
  // is a property of how Sine loads us, not a guarantee -- and reading only
  // one of the two is how this check silently returns false in a window that
  // is in fact ready.
  const windowReady = () => {
    try { return !!(window.gBrowserInit ?? gBrowserInit)?.delayedStartupFinished; }
    catch { return false; }
  };

  // Until start() swaps in the real cleanup, releasing this copy means
  // dropping whatever it is waiting on.
  instance.retire = stopWaiting;

  if (windowReady()) {
    startOnce();
  } else {
    obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) startOnce();
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");

    // The backstop. In the failure above the window is ALREADY past delayed
    // startup, so the first tick starts the mod half a second later. Bounded,
    // because a window that never gets there is not one this mod belongs in.
    const deadline = Date.now() + 60000;
    waitTimer = setInterval(() => {
      if (windowReady()) startOnce();
      else if (Date.now() > deadline) stopWaiting();
    }, 500);
  }
})();
