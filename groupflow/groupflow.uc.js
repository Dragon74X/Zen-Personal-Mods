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
      if (["folder-height", "connector-scroll", "hover-count", "scroll-glow", "glow-follows"].some(k => data === PREFIX + k)) fitSoon();
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

  // A clone keeps the real group's attributes and inline styles (colour,
  // icon, shape) but builds its own header, so only the header is dressed:
  // the rim, the icon and the saved-gradient tint. Never the close control,
  // which would act on the clone.
  function dressCopy(copy) {
    const header = copy.labelContainerElement;
    if (!plainShape(copy) || !header || header.querySelector(".zzgf-rim")) return;
    for (const name of ["zzgf-rim", "zzgf-control zzgf-icon"]) {
      const span = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      span.className = name;
      span.setAttribute("aria-hidden", "true");
      header.appendChild(span);
    }
    const real = document.getElementById(copy.id.replace(/-copy$/, ""));
    const tint = real?.labelContainerElement?.style.getPropertyValue("--zzgf-saved-tint-background");
    if (tint) header.style.setProperty("--zzgf-saved-tint-background", tint);
  }
  const dressCopies = event => { if (isCopy(event.target)) dressCopy(event.target); };

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

  // Zen's library (1.23b) shows clones of every space's strip. A clone is a
  // picture of a real group: never one to save, nest, file, edit or close.
  const isCopy = el => !!el?.closest?.("zen-library");
  const plainShape = g => g?.tagName === "tab-group" && !g.isZenFolder && !g.hasAttribute("split-view-group");
  const plainGroup = g => plainShape(g) && !isCopy(g);
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

  function startCollapsedVisibility() {
    const groupsSelector = "tab-group:not([split-view-group]), zen-folder";
    const collapsedSelector = "tab-group[collapsed]:not([split-view-group]), zen-folder[collapsed]";
    const tabSelector = ".tabbrowser-tab";
    const marker = "zzgf-visible";
    const lastTabs = new WeakMap();
    const open = tab => tab.isOpen && !tab.hasAttribute("zen-empty-tab");
    let queued = false, retired = false;

    // CSS cannot change Zen's keyboard-navigation visibility. Keep its guards
    // for hidden/closing tabs and collapsed pinned sections, replacing only
    // the collapsed-folder decision. Leave native activeTabs/animations alone.
    const prototypes = [customElements.get("tabbrowser-tab").prototype,
      customElements.get("tab-group").prototype];
    const originals = prototypes.map(proto => Object.getOwnPropertyDescriptor(proto, "visible"));
    const getters = prototypes.map((_proto, index) => function() {
      const parent = index ? this.parentElement : this;
      if (!parent?.closest(collapsedSelector)) return originals[index].get.call(this);
      if (!index && (!open(this) || this.hidden)) return false;
      if (!index && (this.selected || this.multiselected)) return true;
      const pins = gZenWorkspaces.activeWorkspaceElement;
      if (this.pinned && pins?.hasCollapsedPinnedTabs && (index ||
          (!this.hasAttribute("zen-essential") && !pins.collapsiblePins.activeTabs?.includes(this)))) return false;
      return index ? !!this.querySelector(`${tabSelector}[${marker}]`) : this.hasAttribute(marker);
    });
    prototypes.forEach((proto, i) => Object.defineProperty(proto, "visible", { ...originals[i], get: getters[i] }));

    function sync() {
      const tabs = [...document.querySelectorAll(tabSelector)];
      const retained = new Set();
      // Off by default: an unloaded last-used tab stays hidden like the rest.
      const keepLast = bool("collapse-keep-last-used", false);
      for (const group of document.querySelectorAll(groupsSelector)) {
        const members = group.tabs.filter(open);
        let last = lastTabs.get(group);
        if (!members.includes(last)) last = null;
        for (const tab of members) {
          if (!last || tab.selected || (!last.selected && tab.lastSeenActive > last.lastSeenActive)) last = tab;
        }
        lastTabs.set(group, last);
        if (last && keepLast) retained.add(last);
      }
      const shown = new Set(tabs.filter(tab => open(tab) && !tab.hidden && tab.group &&
        (retained.has(tab) || tab.selected || tab.multiselected || tab.hasAttribute("visuallyselected") ||
          (!tab.hasAttribute("pending") && !tab.hasAttribute("discarded")))));
      for (const tab of shown) {
        if (tab.group.hasAttribute("split-view-group")) {
          for (const peer of tab.group.tabs) if (open(peer) && !peer.hidden) shown.add(peer);
        }
      }
      for (const tab of tabs) {
        const show = shown.has(tab), wasShown = tab.hasAttribute(marker);
        if (show !== wasShown) tab.toggleAttribute(marker, show);
        if (tab.closest(collapsedSelector) || wasShown) {
          const target = tab.splitview ?? tab;
          const accessible = tab.splitview ? tab.splitview.tabs.some(peer => shown.has(peer)) : show;
          if (accessible || !tab.closest(collapsedSelector)) target.removeAttribute("aria-hidden");
          else target.setAttribute("aria-hidden", "true");
        }
      }
      gBrowser.tabContainer._invalidateCachedVisibleTabs();
    }
    function changed(event) {
      if (event?.type === "TabSelect") {
        for (let group = event.target.group; group; group = group.group) {
          if (!group.hasAttribute("split-view-group")) lastTabs.set(group, event.target);
        }
      }
      if (queued || retired) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (!retired) sync(); });
    }
    const events = ["TabSelect", "TabGroupCollapse", "TabGroupExpand", "TabGrouped", "TabUngrouped",
      "TabGroupUpdate", "TabGroupRemovedFromDOM", "FolderGrouped", "FolderUngrouped",
      "TabClose", "SSTabRestoring", "SSTabRestored"];
    for (const event of events) window.addEventListener(event, changed, true);
    const keepLastPref = PREFIX + "collapse-keep-last-used";
    Services.prefs.addObserver(keepLastPref, changed);
    // Native restoration can clear pending without a TabAttrModified event.
    const observer = new MutationObserver(records => {
      if (records.some(record => record.target.matches(tabSelector))) changed();
    });
    observer.observe(gBrowser.tabContainer, { subtree: true, attributes: true,
      attributeFilter: ["pending", "discarded", "hidden", "multiselected", "visuallyselected"] });
    sync();
    return () => {
      retired = true;
      observer.disconnect();
      try { Services.prefs.removeObserver(keepLastPref, changed); } catch {}
      for (const event of events) window.removeEventListener(event, changed, true);
      prototypes.forEach((proto, i) => {
        if (Object.getOwnPropertyDescriptor(proto, "visible").get === getters[i]) {
          Object.defineProperty(proto, "visible", originals[i]);
        }
      });
      for (const tab of document.querySelectorAll(`${tabSelector}[${marker}]`)) {
        tab.removeAttribute(marker);
        const target = tab.splitview ?? tab;
        if (tab.group?.collapsed && !(tab.splitview?.tabs ?? [tab]).some(t => t.selected)) {
          target.setAttribute("aria-hidden", "true");
        }
      }
      gBrowser.tabContainer._invalidateCachedVisibleTabs();
    };
  }

  function toggleSubgroups(event) {
    if (event.button !== 0 || event.defaultPrevented || event.target.closest?.(
      "button, toolbarbutton, input, textarea, a, [contenteditable], .tab-close-button, .tab-reset-button, .tab-group-folder-button, .group-marker")) return;
    const group = event.target.closest?.(".tab-group-label-container")?.parentElement;
    const selector = "tab-group, zen-folder";
    if (!group?.matches(selector) || group.hasAttribute("split-view-group") ||
        group.parentElement?.closest(selector) || isCopy(group)) return;
    const children = [...group.querySelectorAll(selector)].filter(child => !child.hasAttribute("split-view-group"));
    if (!children.length) return;
    // Capture before Zen toggles the parent: this header controls its subfolders.
    event.preventDefault();
    event.stopPropagation();
    const collapse = children.some(child => !child.collapsed);
    // Loaded and last-used rows remain visible through collapsed ancestors.
    for (const child of children.reverse()) child.collapsed = collapse;
    group.collapsed = false;
    gBrowser.tabGroupMenu.close();
  }

  // A wheel landing on a group's own container is the connector gutter beside
  // its rows, not a tab. userChrome.css caps each top-level group's body
  // (zzgroup.folder-height); a wheel on any gutter inside it scrolls that body,
  // so subgroups slide past while its header and the other tabs stay put.
  const gutterOf = el => el?.classList?.contains("tab-group-container") &&
    el.parentElement?.matches("tab-group:not([split-view-group]), zen-folder") ? el : null;
  function folderBox(gutter) {
    let g = gutter.parentElement;
    for (let up; (up = g.parentElement?.closest("tab-group")); ) g = up;
    return g.tagName === "tab-group" && !g.hasAttribute("split-view-group")
      ? g.querySelector(":scope > .tab-group-container") : null;
  }
  // Row slots inside a box, in scroll coordinates: where each tab or subgroup
  // header begins, including its top margin. Scrolling stops only on these.
  function rowStops(box) {
    const top = box.getBoundingClientRect().top - box.scrollTop;
    const stops = new Set([0]);
    for (const row of box.querySelectorAll(".tabbrowser-tab, .tab-group-label-container")) {
      const r = row.getBoundingClientRect();
      if (r.height) stops.add(Math.round(r.top - top - (parseFloat(getComputedStyle(row).marginTop) || 0)));
    }
    return [...stops].sort((a, b) => a - b);
  }
  // Top-level folders stay on screen: their bodies share the height the rest
  // of the list leaves (shareList), each also capped by zzgroup.folder-height,
  // and scroll inside. A body's height is trimmed so its bottom edge lands
  // where a row begins, whatever spacing the theme gives rows, and never
  // below three rows. Returns the scroll positions and the height for each.
  const shares = new WeakMap();             // box -> height its list gives it
  const prefCap = box => parseFloat(getComputedStyle(box).getPropertyValue("--zzgf-box-cap")) || Infinity;
  function measureBox(box) {
    const end = box.scrollHeight;
    const stops = rowStops(box), ends = [...stops, end];
    // A registered <length> | none, so it computes to pixels without touching
    // the box's own height (which would clamp its scroll position).
    const cap = Math.max(shares.get(box) ?? prefCap(box), ends[Math.min(3, ends.length - 1)]);
    if (end <= cap) {
      for (const v of ["fit", "scroll"]) box.style.removeProperty("--zzgf-box-" + v);
      markEdges(box, false);
      return null;
    }
    const last = stops.find(y => end - y <= cap) ?? end - cap;
    const positions = stops.filter(y => y < last).concat(last);
    const fitAt = y => ends.filter(e => e > y && e - y <= cap).reduce((a, e) => Math.max(a, e - y), 0);
    return { positions, fitAt };
  }
  // Everything in a list but the folder bodies keeps its height; the bodies
  // share what is left, smallest first, so a folder that fits keeps its full
  // height and the rest split the remainder. With too little left the bodies
  // keep three rows each and the list scrolls as usual.
  function shareList(host) {
    const port = host.scrollbox, boxes = topBoxes(host);
    if (!port || !boxes.length) return;
    // The sections stretch to fill the list, so the content ends where its
    // last row does. A folder has no box of its own: its header and body do.
    const pad = parseFloat(getComputedStyle(port).paddingTop) || 0;
    const top = port.getBoundingClientRect().top - port.scrollTop + pad;
    let end = top;
    for (const row of host.querySelectorAll(":scope > * > :not(tab-group), :scope > * > tab-group > *")) {
      const r = row.getBoundingClientRect();
      if (r.height) end = Math.max(end, r.bottom);
    }
    const used = boxes.reduce((a, b) => a + b.getBoundingClientRect().height, 0);
    // The list shrinks to its content and Zen's empty space takes the rest,
    // so both count; otherwise folders could never grow back after tabs close.
    // One row of that empty space is left free to move the window by.
    const empty = host.parentElement?.querySelector(":scope > .zen-workspace-empty-space");
    const strip = Services.prefs.getBoolPref("zen.view.draggable-sidebar", false)
      ? parseFloat(getComputedStyle(host).getPropertyValue("--tab-min-height")) || 36 : 0;
    let room = port.clientHeight + (empty?.getBoundingClientRect().height || 0) - pad - strip - 1 - (end - top - used);
    const want = boxes.map(b => Math.min(b.scrollHeight, prefCap(b)));
    const order = boxes.map((_, i) => i).sort((a, b) => want[a] - want[b]);
    order.forEach((i, k) => {
      const share = Math.max(0, Math.min(want[i], room / (order.length - k)));
      shares.set(boxes[i], share);
      room -= share;
    });
  }
  const nearest = (list, y) => list.reduce((a, b) => Math.abs(b - y) < Math.abs(a - y) ? b : a);
  // Scroll and rail move in the same frame. Waiting for the scroll event left
  // the rail a frame behind, which showed as a gap at the box's edge.
  const glides = new Map();                // box -> { to, raf }; entries leave when done
  const setTops = new WeakMap();            // box -> the scrollTop this mod last set
  function scrollBox(box, to, instant, measured) {
    cancelAnimationFrame(glides.get(box)?.raf);
    glides.delete(box);
    if (measured) box.style.setProperty("--zzgf-box-fit", measured.fitAt(to) + "px");
    const set = y => {
      box.scrollTop = y;
      setTops.set(box, box.scrollTop);
      box.style.setProperty("--zzgf-box-scroll", box.scrollTop + "px");
      markEdges(box, true);
    };
    if (instant) { set(to); return; }
    const from = box.scrollTop, start = performance.now(), ms = 240;
    const step = now => {
      const k = Math.min(1, (now - start) / ms);
      set(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) glides.set(box, { to, raf: requestAnimationFrame(step) }); else glides.delete(box);
    };
    glides.set(box, { to, raf: requestAnimationFrame(step) });
  }
  // What is out of view. A body that scrolls is marked on the sides where
  // rows are hidden (edge fade), its header gets an up and a down arrow
  // (shown on hover, clicking pages that way), and its connector lines are
  // lit at one height that follows the scroll: at the top when the body is
  // at its top, sliding to the bottom as it reaches its end. Subfolder
  // lines get the same light, measured from their own tops.
  const HTML = "http://www.w3.org/1999/xhtml";
  function markEdges(box, scrolls) {
    const max = box.scrollHeight - box.clientHeight, y = box.scrollTop;
    scrolls &&= max > 0.5;
    box.toggleAttribute("zzgf-more-above", scrolls && y > 0.5);
    box.toggleAttribute("zzgf-more-below", scrolls && y < max - 0.5);
    box.toggleAttribute("zzgf-glow", scrolls);
    const header = box.parentElement?.labelContainerElement;
    if (!scrolls) { header?.querySelectorAll(":scope > .zzgf-more").forEach(a => a.remove()); lightSoon(); return; }
    // A folder lit at the selected tab's row is lit by lightLists.
    if (!holdsSelected(box)) box.style.setProperty("--zzgf-glow", y / max * box.clientHeight + "px");
    lightSoon();                              // its subfolders' lines follow
    if (!header) return;
    if (!header.querySelector(":scope > .zzgf-more")) {
      for (const dir of ["up", "down"]) {
        const arrow = document.createElementNS(HTML, "button");
        arrow.type = "button";
        arrow.tabIndex = -1;
        arrow.className = "zzgf-more " + dir;
        arrow.setAttribute("aria-label", dir === "up" ? "Scroll folder up" : "Scroll folder down");
        header.appendChild(arrow);
      }
    }
  }
  // Dynamic connectors: every connector line carries a light showing where
  // you are, scrolling or not, so a folder looks the same however it opens.
  // Each line, subfolders included, has its own: how far you are through
  // that line, like a scrollbar thumb. A folder that scrolls inside itself
  // lights its own line (markEdges) and is the view its subfolders are seen
  // through; one that fits shows how far it has travelled up through the
  // list, and rests at its top while no tab in it is loaded. A subfolder's
  // line starts at its own top and lights how much of it has scrolled past.
  // With "the selected tab", lines holding it light at its row, except in the
  // folder you point at or scroll from its connector: that one shows where
  // you are. The light glides between the two (userChrome.css). Every rect is
  // read before any light is written.
  const LOADED = ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab])";
  const listPorts = new Set();
  let listFrame = 0;
  const through = (top, height, vt, vh) => Math.min(1, Math.max(0, height > vh
    ? (vt - top) / (height - vh)
    : (vt + vh - top - height) / Math.max(vh - height, 1)));
  const past = (r, v) => r.height > v.height ? through(r.top, r.height, v.top, v.height) * r.height
    : Math.min(r.height, Math.max(0, v.top - r.top));
  // The folder whose connector is under the pointer (and so is scrolled from it).
  let pointed = null;
  const roams = box => box === pointed;
  const holdsSelected = box => !roams(box) && num("glow-follows", 1) === 1 && box.parentElement?.contains(gBrowser.selectedTab);
  let pointFrame = 0, pointEvent = null;
  function pointAt(event) {
    pointEvent = event.type === "mouseleave" ? null : event;
    pointFrame ||= requestAnimationFrame(() => {
      pointFrame = 0;
      const ev = pointEvent, hit = ev?.target;
      const box = hit && gBrowser.tabContainer.contains(hit) &&
        !hit.closest?.(".tabbrowser-tab, .tab-group-label-container, toolbarbutton, button") ? boxAt(ev, hit) : null;
      if (box !== pointed) { pointed = box; lightSoon(); }
    });
  }
  function lightLists() {
    listFrame = 0;
    const glow = bool("scroll-glow", true);
    const sel = glow && num("glow-follows", 1) === 1 ? gBrowser.selectedTab : null;
    const lit = [];
    for (const host of document.querySelectorAll("zen-workspace arrowscrollbox")) {
      const port = host.scrollbox;
      if (!port) continue;
      const view = port.getBoundingClientRect();
      for (const box of topBoxes(host)) {
        const b = box.getBoundingClientRect(), on = glow && b.height > 0, rails = [];
        if (on) {
          const own = box.hasAttribute("zzgf-glow"), roam = roams(box);
          // A folder that scrolls inside itself shows how far it has scrolled
          // unless its line is following the selected tab.
          const max = box.scrollHeight - box.clientHeight;
          rails.push([box, b, own ? b : view, false, roam, own ? box.scrollTop / max * box.clientHeight : null]);
          for (const c of box.querySelectorAll(bodySelector)) rails.push([c, c.getBoundingClientRect(), own ? b : view, true, roam]);
        }
        lit.push([box, on, rails]);
      }
    }
    const s = sel?.getBoundingClientRect();
    for (const [box, on, rails] of lit) {
      box.toggleAttribute("zzgf-list-glow", on);
      for (const [c, r, v, sub, roam, own] of rails) {
        const at = s?.height && !roam && c.parentElement?.contains(sel)
          ? Math.min(r.height, Math.max(0, s.top + s.height / 2 - r.top))
          : own != null ? own
          : sub ? past(r, v)
          : roam || c.parentElement?.querySelector(LOADED) ? through(r.top, r.height, v.top, v.height) * r.height : 0;
        c.style.setProperty("--zzgf-glow", at + "px");
      }
    }
  }
  const lightSoon = () => { listFrame ||= requestAnimationFrame(lightLists); };
  function watchLists() {
    for (const host of document.querySelectorAll("zen-workspace arrowscrollbox")) {
      const port = host.scrollbox;
      if (!port || listPorts.has(port)) continue;
      port.addEventListener("scroll", lightSoon, { passive: true });
      listPorts.add(port);
    }
    lightSoon();
  }
  function pageFolder(event) {
    const arrow = event.target.closest?.(".zzgf-more");
    if (!arrow) return;
    event.preventDefault();
    event.stopPropagation();                // never collapses the folder
    const box = arrow.parentElement.parentElement?.querySelector(":scope > .tab-group-container");
    const measured = box && measureBox(box);
    if (!measured) return;
    const from = glides.get(box)?.to ?? box.scrollTop, down = arrow.classList.contains("down");
    const ahead = measured.positions.filter(y => down ? y > from + 0.5 : y < from - 0.5);
    scrollBox(box, ahead.length ? nearest(ahead, from + (down ? 1 : -1) * box.clientHeight) : from, false, measured);
  }
  // How many tabs each folder holds, subfolders included, shown on hover.
  function countTabs() {
    const on = bool("hover-count", true);
    for (const g of plainGroups()) {
      const header = g.labelContainerElement;
      if (!header) continue;
      let badge = header.querySelector(":scope > .zzgf-count");
      if (!on) { badge?.remove(); continue; }
      if (!badge) {
        badge = document.createElementNS(HTML, "span");
        badge.className = "zzgf-count";
        badge.setAttribute("aria-hidden", "true");
        header.appendChild(badge);
      }
      const n = String(g.querySelectorAll(".tabbrowser-tab:not([zen-empty-tab], [closing])").length);
      if (badge.textContent !== n) badge.textContent = n;
    }
  }
  const settles = new Map();                // box -> timer: pixel scrolling snaps once it pauses
  // Glides and snaps in flight, stopped when the mod retires or folders stop scrolling.
  const stopScrolling = () => {
    for (const { raf } of glides.values()) cancelAnimationFrame(raf);
    for (const t of settles.values()) clearTimeout(t);
    glides.clear(); settles.clear();
  };
  const topBoxes = (root = document) => [...root.querySelectorAll("tab-group:not([split-view-group]) > .tab-group-container")]
    .filter(box => !box.parentElement.parentElement?.closest("tab-group") && !isCopy(box));
  // Firefox aims a whole burst of wheel events at whatever was under the
  // pointer when the burst began, until scrolling pauses for about 1.5s, so
  // event.target can be a section the pointer has since left. Go by position.
  const hitOf = event => document.elementFromPoint(event.clientX, event.clientY);
  // Anything in a top-level folder's body (its tabs, subfolders and
  // connector gutters), or any non-row point left of the body and level with
  // it: the strip left of the line belongs to the folder too. The folder's
  // own header is not in its body, so it scrolls the list.
  const bodySelector = "tab-group:not([split-view-group]) > .tab-group-container";
  function boxAt(event, hit = hitOf(event)) {
    const body = gutterOf(hit) || hit?.closest?.(bodySelector);
    if (body) return folderBox(body);
    if (hit?.closest?.(".tabbrowser-tab, .tab-group-label-container, toolbarbutton, button")) return null;
    for (const box of topBoxes()) {
      const r = box.getBoundingClientRect();
      if (event.clientY >= r.top && event.clientY < r.bottom &&
          event.clientX < r.left + (parseFloat(getComputedStyle(box).paddingLeft) || 0)) return box;
    }
    return null;
  }
  // Returns true when the wheel went to a folder box.
  function scrollFolder(event, hit) {
    const box = boxAt(event, hit);
    if (!box || box.scrollHeight <= box.clientHeight) return false;   // fits: the list scrolls (see below)
    const measured = measureBox(box);
    if (!measured) return false;
    const { positions } = measured;
    const from = glides.get(box)?.to ?? box.scrollTop;
    // At its end in the wheel's direction the folder passes the wheel on, so
    // the list carries on scrolling past it, as nested scrolling does natively.
    if (event.deltaY > 0 ? from >= positions.at(-1) - 0.5 : from <= 0.5) return false;
    event.preventDefault();                 // also cancels any tab switch by scrolling
    event.stopPropagation();
    if (event.deltaMode === event.DOM_DELTA_PIXEL) {
      // Touchpads send many small deltas: follow them, then settle on a row.
      scrollBox(box, Math.max(0, Math.min(positions.at(-1), box.scrollTop + event.deltaY)), true);
      clearTimeout(settles.get(box));
      settles.set(box, setTimeout(() => { settles.delete(box); scrollBox(box, nearest(positions, box.scrollTop), false, measured); }, 180));
      return true;
    }
    // A line matches the list's own native line scroll: one line of the font.
    const line = Math.round(parseFloat(getComputedStyle(box).fontSize) * 1.2) || 17;
    const step = event.deltaMode === event.DOM_DELTA_PAGE ? box.clientHeight : line;
    const target = from + event.deltaY * step;
    // At least one row per notch, then the row nearest the requested distance.
    const ahead = positions.filter(y => event.deltaY > 0 ? y > from + 0.5 : y < from - 0.5);
    scrollBox(box, ahead.length ? nearest(ahead, target) : from, false, measured);
    return true;
  }
  // Any other wheel in the sidebar scrolls the section under the pointer.
  // The sidebar below the tab list (empty space, bottom buttons) scrolls the
  // list. Native scrolling is left alone whenever it already goes there.
  const scrollerOf = el => {
    for (let n = el; n?.nodeType === 1; n = n.parentElement) {
      const s = n.localName === "arrowscrollbox" ? n.scrollbox : n;
      if (s && s.scrollHeight > s.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(s).overflowY)) return s;
    }
    return null;
  };
  function scrollHovered(event, hit) {
    let to = scrollerOf(hit);
    const list = document.querySelector("zen-workspace[active] arrowscrollbox")?.scrollbox;
    if (!to && list && event.clientY >= list.getBoundingClientRect().bottom) to = scrollerOf(list);
    if (to === scrollerOf(event.target)) return;
    event.preventDefault();
    if (!to) return;                        // over a section that cannot scroll
    const line = Math.round(parseFloat(getComputedStyle(to).fontSize) * 1.2) || 17;
    const unit = event.deltaMode === event.DOM_DELTA_PIXEL ? 1 : event.deltaMode === event.DOM_DELTA_PAGE ? to.clientHeight : line;
    // A smooth scrollBy adds to the destination of one already running.
    to.scrollBy({ top: event.deltaY * unit, behavior: event.deltaMode === event.DOM_DELTA_PIXEL ? "instant" : "smooth" });
  }
  // With Firefox's switch-tabs-by-scrolling on, the wheel over a tab selects
  // the next or previous tab; its folder then brings it into view.
  const switching = () => Services.prefs.getBoolPref("toolkit.tabbox.switchByScrolling", false);
  function onWheel(event) {
    if (!event.deltaY || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    const hit = hitOf(event);
    if (!hit || !gNavToolbox.contains(hit)) return;
    if (hit.closest?.(".tabbrowser-tab") && switching()) return;
    if (bool("connector-scroll", true) && scrollFolder(event, hit)) return;
    if (bool("hover-scroll", true)) scrollHovered(event, hit);
  }
  // Refit a resting box after tabs, folders or the window change: nearest row,
  // keeping a selected tab inside the box fully in view unless told to keep
  // the rows where they are.
  function fitBox(box, keep) {
    if (glides.has(box) && keep) return;
    const measured = measureBox(box);
    if (!measured) return;
    const y = box.scrollTop;
    let choices = measured.positions;
    const selected = box.querySelector(".tabbrowser-tab[selected]");
    const r = selected?.getBoundingClientRect();
    if (r?.height && !keep) {
      const top = r.top - box.getBoundingClientRect().top + y, bottom = top + r.height;
      const showing = choices.filter(p => top >= p && bottom <= p + measured.fitAt(p));
      if (showing.length) choices = showing;
    }
    scrollBox(box, nearest(choices, y), true, measured);
  }
  let fitTimer = null, showSelected = false;
  function fitAll(keep = true) {
    watchLists();                           // the list's light needs no folder scrolling
    if (!bool("connector-scroll", true)) {
      // Turned off: clear what folder scrolling left, so the list's light can take over.
      stopScrolling();
      for (const box of topBoxes()) {
        for (const v of ["fit", "scroll"]) box.style.removeProperty("--zzgf-box-" + v);
        markEdges(box, false);
      }
      return;
    }
    for (const host of document.querySelectorAll("zen-workspace arrowscrollbox")) shareList(host);
    for (const box of topBoxes()) fitBox(box, keep);
  }
  // A refit keeps each body's rows where they are, unless a tab was selected
  // or brought into view: then that tab is kept fully inside its body.
  const fitSoon = (select = false) => {
    showSelected ||= select === true;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { const keep = !showSelected; showSelected = false; countTabs(); fitAll(keep); }, 150);
  };
  const onFitEvent = event => {
    // A selected tab comes into view at once, so switching tabs by scrolling keeps up.
    const box = event.type === "TabSelect" && topBoxes().find(b => b.contains(event.target));
    if (box && bool("connector-scroll", true)) fitBox(box, false);
    lightSoon();
    fitSoon(event.type === "TabSelect");
  };
  const FIT_EVENTS = ["TabSelect", "TabOpen", "TabClose", "TabGroupCollapse", "TabGroupExpand",
                      "TabGrouped", "TabUngrouped", "TabMove", "TabPinned", "TabUnpinned", "resize",
                      "TabBrowserDiscarded", "SSTabRestoring"];   // a folder's line rests at its top once nothing in it is loaded
  // Scrolls this mod did not start, such as a selected tab brought into view.
  // Its own scrolls are recognised by position: refitting after them would
  // pull the body back to the selected tab, so a folder could not scroll away.
  function holdRail(event) {
    const box = event.target;
    if (box.classList?.contains("tab-group-container") && !glides.has(box)) {
      box.style.setProperty("--zzgf-box-scroll", box.scrollTop + "px");
      if (box.scrollTop !== setTops.get(box)) fitSoon(true);   // then settle it on a row
    }
  }
  // With toolkit.tabbox.switchByScrolling on, Firefox turns every wheel over
  // the tab strip into a tab switch (selecting, and so loading, the next tab).
  // Over the gutter of a group that fits, hide the legacy scroll event from
  // that handler so the list scrolls natively instead.
  function scrollOnConnectors(event) {
    const hit = hitOf(event);
    // A tab in a body that fits still switches tabs; only the gutters do not.
    if (bool("connector-scroll", true) && (gutterOf(hit) ||
        (boxAt(event, hit) && !hit?.closest?.(".tabbrowser-tab")))) event.stopPropagation();
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
    window.addEventListener("click", pageFolder, true);
    window.addEventListener("TabGroupCreate", dressCopies, true);
    // Capture on the strip runs before tabbox.js's bubble listener there.
    const strip = gBrowser.tabContainer;
    strip.addEventListener("DOMMouseScroll", scrollOnConnectors, { capture: true, passive: true });
    gNavToolbox.addEventListener("wheel", onWheel, { capture: true, passive: false });
    gNavToolbox.addEventListener("mousemove", pointAt, { passive: true });
    gNavToolbox.addEventListener("mouseleave", pointAt);
    strip.addEventListener("scroll", holdRail, { capture: true, passive: true });
    for (const ev of FIT_EVENTS) window.addEventListener(ev, onFitEvent, true);
    // The tab area also changes size without any event: the media bar or a
    // video preview (Mediaflow) appearing, essentials or the window toolbar.
    const tabArea = new ResizeObserver(() => fitSoon());
    const wrapper = document.getElementById("zen-tabs-wrapper");
    if (wrapper) tabArea.observe(wrapper);
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
    let cleanupVisibility = null;
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
      window.removeEventListener("click", pageFolder, true);
      stopScrolling();
      for (const mark of document.querySelectorAll(".tab-group-label-container > :is(.zzgf-more, .zzgf-count)")) mark.remove();
      for (const box of document.querySelectorAll(".tab-group-container[zzgf-glow]")) markEdges(box, false);
      for (const port of listPorts) port.removeEventListener("scroll", lightSoon);
      cancelAnimationFrame(listFrame);
      for (const box of document.querySelectorAll(".tab-group-container[zzgf-list-glow]")) box.removeAttribute("zzgf-list-glow");
      window.removeEventListener("TabGroupCreate", dressCopies, true);
      strip.removeEventListener("DOMMouseScroll", scrollOnConnectors, true);
      gNavToolbox.removeEventListener("wheel", onWheel, true);
      gNavToolbox.removeEventListener("mousemove", pointAt);
      gNavToolbox.removeEventListener("mouseleave", pointAt);
      cancelAnimationFrame(pointFrame);
      strip.removeEventListener("scroll", holdRail, true);
      for (const ev of FIT_EVENTS) window.removeEventListener(ev, onFitEvent, true);
      tabArea.disconnect();
      clearTimeout(fitTimer);
      try { Services.obs.removeObserver(schedule, "contextual-identity-updated"); } catch {}
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      clearTimeout(timer);
      clearTimeout(boot);
      clearTimeout(foldTimer);
      cleanupGroups?.();
      cleanupVisibility?.();
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
        cleanupVisibility = startCollapsedVisibility();
        foldStartupGroups();
        groupDetails.save();
        fitSoon();
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
    // 1.63.0: the light follows the selected tab by default; the folder you
    // point at shows where you are. Profiles still on the old default move once.
    if (!S.getBoolPref(PREFIX + "glow-follows-v2", false)) {
      if (S.getPrefType(PREFIX + "glow-follows") === S.PREF_INT && S.getIntPref(PREFIX + "glow-follows") === 0) {
        S.setIntPref(PREFIX + "glow-follows", 1);
        wrote++;
      }
      S.setBoolPref(PREFIX + "glow-follows-v2", true);
    }
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
