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
  const num  = (k, d) => { try { return Services.prefs.getIntPref(PREFIX + k, d); } catch { return d; } };
  const HTML = "http://www.w3.org/1999/xhtml";
  // ---- pref variables at startup -----------------------------------------
  // Sine injects string prefs as CSS variables for every chrome window as it
  // opens, but only after an async read of the mod store. These are written
  // synchronously as the script loads, from the prefs themselves, so they
  // exist before first paint.
  //
  // Naming matches Sine's own convention exactly: zzgroup.foo-bar becomes
  // --zzgroup-foo-bar, dots to dashes. Booleans and numbers are skipped: the
  // stylesheet reads them with -moz-pref() and this script with bool() and num().
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
  // "failed to read pref" for every boolean in the branch. Only strings
  // become variables.
  function readPrefValue(full) {
    const P = Services.prefs;
    try {
      if (P.getPrefType(full) !== P.PREF_STRING) return null;
      const v = P.getStringPref(full);
      return v === "" ? null : v;
    } catch { return null; }
  }


  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
      if (data === PREFIX + "icon-rules") iconRules = null;   // reparsed on the next refresh
      if (["favicons", "icon-rules", "section-icons", "icon-shape", "color-source", "subfolder.include-folders"].some(k => data === PREFIX + k)) schedule();
      if (data === PREFIX + "hover-count") countsDirty = true;
      if (["folder-height", "folder-rows", "connector-scroll", "hover-count", "scroll-glow", "glow-follows"].some(k => data === PREFIX + k)) fitSoon();
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
      if (uri && /^https?$/.test(uri.scheme)) { savedURLs.delete(tab); return uri.host; }
    } catch {}
    // An unloaded restored tab can report no address (Zen 1.24.1b's lazy
    // tabs do); its session still has it, as for Tab Router and folder pages.
    if (!tab.hasAttribute?.("pending")) return null;
    try {
      const url = new URL(savedURL(tab));
      return /^https?:$/.test(url.protocol) ? url.host : null;
    } catch { return null; }
  }
  // Read once per unloaded tab, and forgotten when it loads (it may come back
  // unloaded on another page); an address not there yet is asked for again.
  const savedURLs = new WeakMap();
  function savedURL(tab) {
    if (savedURLs.has(tab)) return savedURLs.get(tab);
    let url = "";
    try { url = window.TabRouter?.tabURL?.(tab) || ""; } catch {}
    if (!/^https?:/i.test(url)) {
      try {
        const state = JSON.parse(SessionStore.getTabState(tab));
        url = state.entries?.[(state.index || state.entries.length) - 1]?.url || "";
      } catch { url = ""; }
    }
    if (url) savedURLs.set(tab, url);
    return url;
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

  // Zen 1.24.1b's getGradient() returns window-sized `background` layers whose
  // base stops use variables only Zen's own backgrounds define, so a header
  // drops the value. Lay the base stops across the header (Zen's angle formula
  // gives ~90deg at header proportions) and keep the middle strip of a third
  // colour's overlay. Older values pass through; unknown layers yield "".
  function headerGradient(value) {
    if (typeof value !== "string" || !value.includes("var(--zen-gradient-")) return value;
    const images = [];
    let depth = 0, start = 0, image = "";
    for (let i = 0; i <= value.length; i++) {
      const c = value[i];
      if (c === "(") depth++;
      else if (c === ")" && !--depth && !image) image = value.slice(start, i + 1).trim();
      else if ((c === "," && !depth) || i === value.length) {
        if (!/^linear-gradient\(/.test(image)) return "";
        images.push(image); image = ""; start = i + 1;
      }
    }
    // Zen paints overlay strips above its base layer, which comes last.
    const base = images.pop().replace("var(--zen-gradient-base-angle)", "90deg").replace(
      /calc\(var\(--zen-gradient-base-start\) \+ ([\d.e+-]+) \* var\(--zen-gradient-base-span\)\)/g,
      (_match, position) => `${+(position * 100).toFixed(3)}%`);
    const result = [images[images.length >> 1], base].filter(Boolean).join(", ");
    return !result.includes("var(") && CSS.supports("background-image", result) ? result : "";
  }

  function tintGradient(background) {
    // The browser serializes colour stops, including names and nested colour
    // functions, to flat computed colours. Keep every stop and gradient intact.
    return background.replace(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi,
      color => `rgb(from ${color} r g b / calc(alpha * var(--zzgf-saved-tint-factor, 100%) * var(--zzgf-saved-weight, 1)))`);
  }

  function setSavedBackground(g, background) {
    const header = g.labelContainerElement;
    if (g.style.getPropertyValue("--zzgf-saved-background") === background &&
        (!background || header?.style.getPropertyValue("--zzgf-saved-tint-background"))) return;
    if (background) g.style.setProperty("--zzgf-saved-background", background);
    else g.style.removeProperty("--zzgf-saved-background");
    g.toggleAttribute("zzgf-saved-gradient", !!background);
    header?.style.removeProperty("--zzgf-saved-tint-background");
    if (header) header.style.setProperty("--zzgf-saved-available", background ? "1" : "0");
    if (!background || !header) return;
    const probe = document.createElementNS(HTML, "span");
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

  // A decorative span at the end of a group header, hidden from assistive technology.
  function decorSpan(header, className) {
    const span = document.createElementNS(HTML, "span");
    span.className = className;
    span.setAttribute("aria-hidden", "true");
    return header.appendChild(span);
  }

  // A clone keeps the real group's attributes and inline styles (colour,
  // icon, shape) but builds its own header, so only the header is dressed:
  // the rim, the saved-gradient tint and, without ATG, the icon control
  // (with ATG the label draws the icon). Never the close control, which
  // would act on the clone.
  function dressCopy(copy) {
    const header = copy.labelContainerElement;
    if (!plainShape(copy) || !header || header.querySelector(".zzgf-rim")) return;
    decorSpan(header, "zzgf-rim");
    if (!window.advancedTabGroups) decorSpan(header, "zzgf-control zzgf-icon");
    const real = document.getElementById(copy.id.replace(/-copy$/, ""));
    const tint = real?.labelContainerElement?.style.getPropertyValue("--zzgf-saved-tint-background");
    if (tint) { header.style.setProperty("--zzgf-saved-tint-background", tint); header.style.setProperty("--zzgf-saved-available", "1"); }
  }
  const dressCopies = event => { if (isCopy(event.target)) dressCopy(event.target); };

  function refreshGroup(g) {
    const header = g.labelContainerElement;
    if (header && !header.querySelector(".zzgf-rim")) decorSpan(header, "zzgf-rim");
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
    if (g.isZenFolder) return;
    const rule = ruledIcon(g) ?? customIcon(g);
    const picture = !rule && bool("section-icons", true) ? stampedIcon(g) : null;
    setShape(g, picture);
    const ruled = rule ?? picture;
    if (ruled) { setIcon(g, `url("${ruled}")`); return; }
    if (!bool("favicons", true)) {
      setIcon(g, 'url("chrome://browser/skin/zen-icons/folder.svg")'); return;
    }
    // Dominant base host among the group's DIRECT tabs; subgroups compute
    // their own, so "Youtube > Creator" shows youtube's icon on the parent
    // and (usually the same) icon on the child from its own members.
    const counts = new Map(), icons = new Map();
    const count = tab => {
      const h = hostOf(tab);
      if (!h) return;
      counts.set(h, (counts.get(h) || 0) + 1);
      // Zen retains the tab's actual favicon across restore/unloading. A
      // synthetic https://host/ lookup can miss icons stored for another URL.
      const icon = gBrowser.getIcon(tab) || tab.getAttribute("image");
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
        if (!gBrowser.isTabGroup(el)) continue;
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

  // A member's favicon changes on every page load, and writing an inline
  // style invalidates style on its element even when the value is
  // identical; these groups carry the glass effects. Only a changed icon is
  // written.
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
    if (isCopy(t)) return;
    if (t?.tagName === "tab" && t.group) {
      for (let g = t.group; g; g = g.parentElement?.closest("tab-group, zen-folder") ?? null) dirty.add(g);
    } else {
      everything = true;
    }
    if (timer === null) timer = setTimeout(refreshDirty, 0);
  };
  function refreshDirty() {
    timer = null;
    if (everything) { everything = false; dirty.clear(); refreshAll(); return; }
    for (const g of dirty) {
      if (g.isConnected && !g.hasAttribute("split-view-group") &&
          (plainGroup(g) || bool("subfolder.include-folders", false))) refreshGroup(g);
    }
    dirty.clear();
  }

  // ZenTabIconChanged is dispatched from tabbrowser.setIcon() for every tab
  // whose favicon is set, and bubbles: a member navigating to another domain
  // gets a new favicon, the only reason its group's icon needs recomputing.
  // The group events change what a group contains or, for TabGroupUpdate,
  // its colour and the label icon rules match on.
  const EVENTS = ["TabGroupCreate", "TabGrouped", "TabUngrouped",
                  "TabGroupRemoved", "TabGroupRemovedFromDOM", "TabGroupUpdate",
                  "FolderGrouped", "FolderUngrouped",
                  "SSTabRestored", "ZenTabIconChanged"];

  // Zen's Library shows clones of every space's strip, which fire the same
  // group events as the real ones. A clone is a picture of a real group:
  // never one to save, nest, file, edit, close or refit; only dressCopy
  // handles its events.
  const isCopy = el => !!el?.closest?.("zen-library, [zen-library-copy]");
  const plainShape = g => g?.tagName === "tab-group" && !g.isZenFolder && !g.hasAttribute("split-view-group");
  const plainGroup = g => plainShape(g) && !isCopy(g);
  const plainGroups = () => [...document.querySelectorAll("tab-group")].filter(plainGroup);
  const workspaceOf = g => g.closest("zen-workspace")?.id || g.getAttribute("zen-workspace-id");

  // A group's two menus: Firefox's editor panel and Zen's folder context menu.
  // Answers the group shown and where its items go, or null for any other popup.
  function groupMenu(popup) {
    const panel = popup.matches?.(".tab-group-editor-panel");
    if (!panel && popup.id !== "zenFolderActions") return null;
    return { panel, group: panel ? gBrowser.tabGroupMenu.activeGroup : popup.triggerNode?.closest?.("tab-group, zen-folder"),
      parent: panel ? popup.querySelector(".tab-group-edit-actions") : popup };
  }
  function menuItem(parent, panel, id, label, command) {
    const item = document.createXULElement(panel ? "toolbarbutton" : "menuitem");
    item.setAttribute("label", label); item.setAttribute("class", "subviewbutton"); item.setAttribute("data-zz-action", "groupflow--" + id);
    item.addEventListener("command", command);
    return parent.appendChild(item);
  }

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
    const restored = new WeakSet();
    function save() {
      if (!data || closed) return;
      let changed = false;
      for (const group of document.querySelectorAll("tab-group:not([split-view-group]), zen-folder")) {
        if (isCopy(group)) continue;
        if (!restored.has(group)) {
          restoreParents(null, [group], data);
          if (data[group.id]?.routerLocked) group.setAttribute("data-zzrouter-locked", "");
          restored.add(group);
        }
        const next = {
        routerLocked: group.hasAttribute("data-zzrouter-locked"),
        label: group.label, color: group.color, workspace: workspaceOf(group),
        ...(group.hasAttribute("data-zzrouter-subject") || group.hasAttribute("data-zzrouter-picture") ? { router: {
          ...(group.hasAttribute("data-zzrouter-subject") ? { subject: group.getAttribute("data-zzrouter-subject") } : {}),
          context: group.getAttribute("data-zzrouter-context"),
          picture: group.getAttribute("data-zzrouter-picture"),
        } } : {}),
      };
        const old = data[group.id];
        if (!old || ["label", "color", "workspace", "routerLocked"].some(k => old[k] !== next[k]) ||
            ["subject", "context", "picture"].some(k => old.router?.[k] !== next.router?.[k])) {
          data[group.id] = next; changed = true;
        }
      }
      if (changed) writeGroupData("groupflowGroups", data);
    }
    function changed(event) { if (timer === null && !isCopy(event?.target)) timer = setTimeout(() => { timer = null; save(); }, 0); }
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
    const restoreRouter = group => {
      if (!plainGroup(group)) return;
      if (details?.[group.id]?.routerLocked) group.setAttribute("data-zzrouter-locked", "");
      const saved = details?.[group.id]?.router;
      if (!saved || !/^\d+$/.test(saved.context) || typeof saved.picture !== "string" ||
          (saved.picture !== "" && !/^https:\/\//.test(saved.picture))) return;
      // A picture association alone never makes a legacy/manual folder managed.
      for (const key of ["context", "picture"]) group.setAttribute(`data-zzrouter-${key}`, saved[key]);
      if (typeof saved.subject === "string" && /^https:\/\//.test(saved.subject))
        group.setAttribute("data-zzrouter-subject", saved.subject);
    };
    for (const group of candidates) restoreRouter(group);
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
        restoreRouter(parent);
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
    let known = new Set(), pending = null, retired = false, closing = false, pruneNeeded = true;
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
            value = headerGradient(picker.getGradient(saved.gradientColors));
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

    const editors = new Set();
    const live = group => !retired && group?.isConnected && !isCopy(group) && !group.closing &&
      !group.hasAttribute("split-view-group") && (plainGroup(group) || group.isZenFolder);
    const leafTabs = group => live(group) && !group.isLiveFolder && !group.group && !group.groupContainer?.querySelector("tab-group, zen-folder, tab-split-view-wrapper") &&
      [...group.tabs].filter(tab => !tab.hasAttribute("zen-empty-tab") && !tab.closing);
    function saveColor(group, value) {
      if (!live(group) || !colors) return false;
      colors[group.id] = value;
      writeGroupData("tabGroupColors", colors);
      colorCache.delete(group.id); appliedColors.delete(group);
      group.color = group.id;
      applyColor(group); refreshGroup(group);
      // An open Library rebuilds its copies, which carry the group's inline colours.
      document.querySelector("zen-library-spaces-section")?.refreshStripsNow();
      return true;
    }
    function editGradient(group) {
      if (!live(group) || !colors) return;
      const html = (tag, parent, attrs = {}) => {
        const node = document.createElementNS(HTML, tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        parent?.appendChild(node); return node;
      };
      const dialog = html("dialog", document.documentElement, { class: "zzgf-gradient-editor", "aria-label": "Group gradient" });
      editors.add(dialog);
      const title = html("h3", dialog); title.textContent = "Gradient · " + group.label;
      const preview = html("div", dialog, { class: "zzgf-gradient-preview", "aria-hidden": "true" });
      const form = html("form", dialog), label = html("label", form);
      label.textContent = "Gradient";
      const input = html("textarea", label, { rows: 4, required: "", "aria-label": "Gradient" });
      input.value = group.style.getPropertyValue("--zzgf-saved-background") || "linear-gradient(90deg, #7c8cf8, transparent)";
      const controls = html("div", form), a = html("input", controls, { type: "color", value: "#7c8cf8", "aria-label": "Start colour" });
      const b = html("input", controls, { type: "color", value: "#1b1b2b", "aria-label": "End colour" });
      const angle = html("input", controls, { type: "number", value: "90", min: "0", max: "360", "aria-label": "Direction in degrees" });
      const build = html("button", controls, { type: "button" }); build.setAttribute("data-zz-action", "groupflow--use-colours"); build.textContent = "Use these two colours";
      const valid = () => /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(input.value.trim()) &&
        !/url\s*\(/i.test(input.value) && CSS.supports("background-image", input.value);
      const update = () => {
        input.setCustomValidity(valid() ? "" : "Enter a valid CSS gradient.");
        if (valid()) preview.style.backgroundImage = input.value;
      };
      build.addEventListener("click", () => { input.value = `linear-gradient(${Number(angle.value) || 0}deg, ${a.value}, ${b.value})`; update(); });
      input.addEventListener("input", update); update();
      const save = html("button", form, { type: "submit" }); save.setAttribute("data-zz-action", "groupflow--save-gradient"); save.textContent = "Save gradient";
      const cancel = html("button", form, { type: "button" }); cancel.setAttribute("data-zz-action", "groupflow--cancel-gradient"); cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => dialog.close());
      form.addEventListener("submit", event => {
        event.preventDefault(); update();
        if (input.reportValidity() && saveColor(group, input.value.trim())) dialog.close();
      });
      dialog.addEventListener("close", () => { editors.delete(dialog); dialog.remove(); }, { once: true });
      dialog.showModal(); input.focus();
    }
    async function resampleColor(group) {
      if (!live(group) || !colors) return false;
      const before = group.color, saved = JSON.stringify(colors[group.id]);
      const sources = [...new Set(group.tabs.map(tab => tab.getAttribute("image")).filter(Boolean))];
      const canvas = document.createElementNS(HTML, "canvas");
      canvas.width = canvas.height = 16;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const sum = [0, 0, 0]; let weight = 0;
      for (const src of sources) {
        if (!live(group)) return false;
        try {
          const image = new Image(); image.src = src; await image.decode();
          if (!live(group)) return false;
          ctx.clearRect(0, 0, 16, 16); ctx.drawImage(image, 0, 0, 16, 16);
          const pixels = ctx.getImageData(0, 0, 16, 16).data;
          for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255; weight += alpha;
            for (let c = 0; c < 3; c++) sum[c] += pixels[i + c] * alpha;
          }
        } catch {} // A missing favicon never replaces the saved colour.
      }
      return weight > 0 && live(group) && group.color === before && JSON.stringify(colors[group.id]) === saved &&
        saveColor(group, { favicon: `rgb(${sum.map(value => Math.round(value / weight)).join(" ")})` });
    }
    function convert(group) {
      const tabs = leafTabs(group);
      if (!tabs?.length) return null;
      const fromFolder = group.isZenFolder, label = group.label, workspaceId = workspaceOf(group);
      const color = colors?.[group.id], icon = icons?.[group.id], collapsed = group.collapsed;
      const selected = gBrowser.selectedTab;
      // Native pin/unpin owns workspace placement and session events. Restrict
      // conversion to leaf containers: never flatten a nested group or split.
      let target;
      if (fromFolder) {
        for (const tab of tabs) gBrowser.unpinTab(tab);
        target = gBrowser.addTabGroup(tabs, { label, insertBefore: tabs[0] });
      } else target = gZenFolders.createFolder(tabs, { label, workspaceId, renameFolder: false });
      if (!target) return null;
      target.setAttribute("zen-workspace-id", workspaceId);
      for (const tab of tabs) {
        for (const animation of tab.getAnimations()) animation.cancel();
        for (const prop of ["opacity", "height", "min-height", "margin-top", "--zen-folder-indent"]) tab.style.removeProperty(prop);
        tab.removeAttribute("folder-active");
      }
      if (color) saveColor(target, color);
      if (icon && icons) { icons[target.id] = icon; writeGroupData("tabGroupIcons", icons); }
      target.collapsed = collapsed;
      if (selected?.isConnected && !selected.closing) gBrowser.selectedTab = selected;
      // Only an empty native placeholder may remain. Never close a real tab.
      if (group.isConnected && !group.tabs.some(tab => !tab.hasAttribute("zen-empty-tab"))) {
        if (fromFolder) group.delete(); else gBrowser.removeTabGroup(group);
      }
      changed();
      return target;
    }
    const actionItems = new Set();
    function addActions(parent, group, panel = false) {
      const actions = [
        ["edit-gradient", "Edit gradient…", () => !!colors, () => editGradient(group)],
        ["resample-favicon-colour", "Resample favicon colour", () => !!colors && group.tabs.some(tab => tab.hasAttribute("image")), () => resampleColor(group)],
        [group.isZenFolder ? "convert-to-tab-group" : "convert-to-folder", group.isZenFolder ? "Convert to tab group" : "Convert to folder", () => !!leafTabs(group)?.length, () => convert(group)],
        // A new tab in a new subfolder of this one, named as you make it.
        ["new-subfolder", "New subfolder", () => !group.isZenFolder, () => {
          const tab = gBrowser.addTab(window.BROWSER_NEW_TAB_URL || "about:newtab", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), tabGroup: group });
          if (tab && tab.group !== group) { try { group.addTabs([tab]); } catch {} }
          if (tab) { newSubfolder([tab], group); gBrowser.selectedTab = tab; }
        }],
      ];
      for (const [id, label, eligible, action] of actions) {
        if (!live(group) || !eligible()) continue;
        actionItems.add(menuItem(parent, panel, id, label, () => {
          if (live(group) && eligible()) Promise.resolve(action()).catch(error => console.error("[Groupflow] Action failed:", error));
        }));
      }
    }
    function actionsMenu(event) {
      const menu = groupMenu(event.target);
      if (!menu) return;
      for (const item of actionItems) item.remove(); actionItems.clear();
      if (menu.parent && live(menu.group)) addActions(menu.parent, menu.group, menu.panel);
    }
    let libraryMenu = null;
    function libraryContext(event) {
      const copy = event.target.closest?.("tab-group, zen-folder");
      if (!isCopy(copy)) return;
      const group = document.getElementById(copy.id.replace(/-copy$/, ""));
      if (!live(group)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!libraryMenu) {
        libraryMenu = document.createXULElement("menupopup");
        libraryMenu.id = "zzgf-library-actions";
        document.getElementById("mainPopupSet").appendChild(libraryMenu);
      }
      for (const item of actionItems) item.remove(); actionItems.clear();
      libraryMenu.replaceChildren();
      addActions(libraryMenu, group);
      libraryMenu.openPopupAtScreen(event.screenX, event.screenY, true);
    }
    window.addEventListener("popupshowing", actionsMenu);
    window.addEventListener("contextmenu", libraryContext, true);
    if (window.Groupflow) Object.assign(window.Groupflow, { editGradient, resampleColor, convert });

    function decorate(group) {
      const header = group.labelContainerElement;
      if (!header) return;
      if (!decorated.has(group)) {
        decorated.add(group);
        header.classList.add("zen-drop-target");
        decorSpan(header, "zzgf-control zzgf-icon");
        const close = document.createElementNS(HTML, "button");
        close.className = "zzgf-control zzgf-close tab-close-button";
        close.type = "button";
        close.setAttribute("aria-label", "Close group");
        close.title = "Close group";
        header.appendChild(close);
      }
      const ws = workspaceOf(group);
      if (ws && group.getAttribute("zen-workspace-id") !== ws) group.setAttribute("zen-workspace-id", ws);
      try { applyColor(group); } catch (error) { console.error("[Groupflow] Cannot restore group colour:", error); }
      refreshGroup(group);
    }

    function updateParents(groups) {
      if (!parents) return false;
      let changed = false;
      for (const group of groups) {
        const parent = group.parentElement?.closest("tab-group");
        const id = plainGroup(parent) ? parent.id : undefined;
        if (parents[group.id] === id) continue;
        if (id) parents[group.id] = id;
        else delete parents[group.id];
        changed = true;
      }
      return changed;
    }
    function saveParents() {
      if (updateParents(plainGroups())) writeGroupData("tabGroupParents", parents);
    }

    function pruneClosedState() {
      // Retain metadata while Firefox can undo the close, including descendants
      // of a closed parent. Never prune against an unavailable closed-tabs store.
      const scope = { sourceWindow: window, closedTabsFromAllWindows: false, closedTabsFromClosedWindows: false };
      const closed = [...SessionStore.getClosedTabGroups(scope), ...SessionStore.getSavedTabGroups()];
      const closedTabs = SessionStore.getClosedTabData(scope);
      if (!Array.isArray(closedTabs) || closed.some(g => !g || typeof g.id !== "string" || !Array.isArray(g.tabs)) ||
          closedTabs.some(t => !t || !t.state)) throw new Error("Unavailable closed history");
      const retained = new Set(closed.map(group => group.id));
      for (const group of closed) for (const tab of group.tabs) if (tab.state?.groupId) retained.add(tab.state.groupId);
      for (const tab of closedTabs) if (tab.state?.groupId) retained.add(tab.state.groupId);
      let size;
      do {
        size = retained.size;
        for (const [child, parent] of Object.entries(parents || {})) if (retained.has(parent)) retained.add(child);
      } while (size !== retained.size);
      for (const group of document.querySelectorAll("tab-group, zen-folder")) if (!isCopy(group)) retained.add(group.id);
      do {
        size = retained.size;
        for (const [child, parent] of Object.entries(parents || {})) if (retained.has(child)) retained.add(parent);
      } while (size !== retained.size);
      for (const [key, data] of [["tabGroupParents", parents], ["tabGroupIcons", icons],
        ["tabGroupColors", colors], ["groupflowGroups", details]]) {
        if (!data) continue;
        let changed = false;
        for (const id of Object.keys(data)) if (!retained.has(id)) { delete data[id]; colorCache.delete(id); changed = true; }
        if (changed) writeGroupData(key, data);
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
      if (updateParents(groups)) writeGroupData("tabGroupParents", parents);
      if (pruneNeeded) { pruneNeeded = false; prune(); }
    }
    function changed(event) {
      if (isCopy(event?.target)) return;
      if (event?.type === "TabGroupRemoved" || event?.type === "TabGroupRemovedFromDOM") pruneNeeded = true;
      if (pending === null) pending = setTimeout(sync, 0);
    }
    let pruneTimer = null;
    function prune() {
      clearTimeout(pruneTimer); pruneTimer = null;
      if (closing) return;
      try { pruneClosedState(); } catch (error) {
        console.error("[Groupflow] Retaining closed group data:", error);
      }
    }
    // Closed history changes with every tab closed in any window. That only
    // retires metadata, so it prunes without a sync, at most once a second.
    const historyChanged = () => { pruneTimer ??= setTimeout(prune, 1000); };
    Services.obs.addObserver(historyChanged, "sessionstore-closed-objects-changed");

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
    for (const folder of document.querySelectorAll("zen-folder")) if (!isCopy(folder)) applyColor(folder);
    sync();
    return () => {
      retired = true;
      for (const dialog of editors) { dialog.close(); dialog.remove(); }
      for (const item of actionItems) item.remove();
      libraryMenu?.remove();
      window.removeEventListener("popupshowing", actionsMenu);
      window.removeEventListener("contextmenu", libraryContext, true);
      if (gBrowser.createTabsForSessionRestore === restoreTabs) gBrowser.createTabsForSessionRestore = nativeRestore;
      if (!closing) saveParents();
      clearTimeout(pending); clearTimeout(pruneTimer);
      Services.obs.removeObserver(historyChanged, "sessionstore-closed-objects-changed");
      for (const event of events) window.removeEventListener(event, changed, true);
      for (const [event, fn] of [["click", click], ["contextmenu", edit], ["command", ungroup], ["dragover", drag],
        ["dragend", resetDrag], ["drop", resetDrag], ["SSWindowClosing", beforeClose]]) {
        window.removeEventListener(event, fn, true);
      }
      for (const group of plainGroups()) group.labelContainerElement?.classList.remove("zen-drop-target");
      root.removeAttribute("zzgf-standalone");
      savedGroupIcons = null;
      savedGroupColors = null;
    };
  }

  // ---- folder pages --------------------------------------------------------
  // A folder can be a page itself: Tab Router's YouTube folder is youtube.com,
  // a creator subfolder that creator's page, a Nexus game folder that game's
  // page. Clicking the folder's icon opens that page, or switches to it when it
  // is already open; clicking its name or anywhere else on the header folds. The
  // page's own tab row is hidden and its header shows it instead. A page tab
  // that navigates elsewhere becomes an ordinary tab in the folder again.
  const PAGE_KEY = "groupflowPages", PAGE_OF = "zzgfPageOf";
  let pageHeaderClick = null;
  // Same page: address without #anchor, tracking parameters, www. or a
  // trailing slash. Tab Router's duplicate check uses the same rule.
  const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref_src|_hsenc|_hsmi)$/i;
  function pageKey(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      const query = [...u.searchParams].filter(([k]) => !TRACKING.test(k));
      const search = query.length ? "?" + new URLSearchParams(query).toString() : "";
      return u.hostname.toLowerCase().replace(/^www\./, "") + (u.port ? ":" + u.port : "") +
        (u.pathname.replace(/\/+$/, "") || "") + search;
    } catch { return null; }
  }
  function startFolderPages() {
    const enabled = () => bool("folder-pages", true);
    const saved = readGroupData(PAGE_KEY);
    const pages = saved || Object.create(null);         // group id -> page URL, "" when cleared by hand
    const groupSelector = "tab-group:not([split-view-group]), zen-folder";
    const live = g => g?.isConnected && !isCopy(g) && g.matches?.(groupSelector);
    // Tab Router reads an unloaded restored tab's address from its session.
    const urlOf = tab => { try { return window.TabRouter?.tabURL?.(tab) || tab.linkedBrowser?.currentURI?.spec || ""; } catch { return ""; } };
    const ctxOf = tab => parseInt(tab?.getAttribute("usercontextid") || "0", 10);
    let retired = false, frame = 0, lastSignature = "";
    const save = () => { if (saved !== null) writeGroupData(PAGE_KEY, pages); };
    function pageOf(group) {
      if (!enabled() || !live(group)) return null;
      if (group.id in pages) return pages[group.id] || null;
      const routed = group.getAttribute("data-zzrouter-page");
      if (routed && pageKey(routed)) { pages[group.id] = routed; save(); return routed; }
      return null;
    }
    const markedFor = tab => tab.getAttribute("zzgf-page-of") ||
      (() => { try { return SessionStore.getCustomTabValue(tab, PAGE_OF) || ""; } catch { return ""; } })();
    // Hidden from the moment it is the page tab, so it never shows as a row.
    function mark(tab, group) {
      tab.setAttribute("zzgf-page-of", group.id);
      try { SessionStore.setCustomTabValue(tab, PAGE_OF, group.id); } catch {}
      if (!tab.hasAttribute("zzgf-page-tab") && pageOf(group)) {
        tab.setAttribute("zzgf-page-tab", "");
        window.dispatchEvent(new CustomEvent("GroupflowPageTabs"));
      }
    }
    function unmark(tab) {
      tab.removeAttribute("zzgf-page-of");
      try { SessionStore.deleteCustomTabValue(tab, PAGE_OF); } catch {}
    }
    // A folder's tabs, its subfolders' included; members are its own.
    const folderTabs = group => group.tabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab"));
    const members = group => folderTabs(group).filter(t => t.group === group);
    // The folder's container: its tabs' (a site's top-level folder can hold
    // only subfolders), its own page tab last. Tab Router finds folders by
    // the same rule.
    function folderContext(group) {
      const tabs = folderTabs(group);
      return ctxOf(tabs.find(t => t.getAttribute("zzgf-page-of") !== group.id) || tabs[0]);
    }
    // A page tab in a container none of the folder's other tabs use is
    // signed out of the site (earlier versions opened a folder of
    // subfolders' page in none): it is replaced in the folder's container.
    // Tab Router leaves such a tab to Groupflow by the same rule.
    const strayPage = (group, tab) => !!tab && ctxOf(tab) !== folderContext(group) &&
      !folderTabs(group).some(t => t !== tab && ctxOf(t) === ctxOf(tab));
    // The page tab: the member marked for it, else a member already showing
    // it. The folder always has its own: a Favorite (Essential) showing the
    // same page stays a Favorite, and the header never stands for it.
    function pageTab(group, page = pageOf(group)) {
      if (!page) return null;
      const key = pageKey(page), own = members(group);
      return own.find(t => markedFor(t) === group.id) ||
        own.find(t => pageKey(urlOf(t)) === key) || null;
    }
    function refresh() {
      frame = 0;
      if (retired) return;
      let signature = "";
      for (const group of document.querySelectorAll(groupSelector)) {
        if (isCopy(group)) continue;
        const page = pageOf(group), tab = page ? pageTab(group, page) : null;
        if (page) signature += `${group.id}=${page}\n`;
        // The page tab carries the mark: a member showing the page takes it, and
        // one marked only in the session (after a restart or a live update) gets
        // its attribute back.
        if (tab && tab.getAttribute("zzgf-page-of") !== group.id) mark(tab, group);
        group.toggleAttribute("zzgf-has-page", !!page);
      }
      // Tab Router counts folder pages as open, with or without their tab.
      let pageTabsChanged = signature !== lastSignature;
      lastSignature = signature;
      for (const tab of gBrowser.tabs) {
        const owner = tab.getAttribute("zzgf-page-of");
        const group = owner && tab.group?.id === owner ? tab.group : null;
        const isPage = !!group && !!pageOf(group);
        if (tab.hasAttribute("zzgf-page-tab") !== isPage) { tab.toggleAttribute("zzgf-page-tab", isPage); pageTabsChanged = true; }
        if (owner && !group && !tab.closing) unmark(tab);
      }
      // Tab Router opens links clicked in a page tab in their own tab, and
      // goes to a folder whose page is opened anywhere.
      if (pageTabsChanged) window.dispatchEvent(new CustomEvent("GroupflowPageTabs"));
    }
    const soon = () => { if (!retired) frame ||= requestAnimationFrame(refresh); };
    // Opening tabs is Tab Router's: it switches to the page if it is open
    // anywhere (changing space as needed), brings a loose copy in this space
    // into the folder, or opens it there. Without Tab Router, it opens here.
    function open(group) {
      const page = pageOf(group);
      if (!page) return false;
      const ctx = folderContext(group);
      let tab = pageTab(group, page);
      // A stray page tab closes for real, not unloaded as a page tab.
      if (strayPage(group, tab)) {
        unmark(tab);
        tab.removeAttribute("zzgf-page-tab");
        gBrowser.removeTab(tab, { animate: false });
        tab = null;
      }
      if (tab) { gBrowser.selectedTab = tab; soon(); return true; }
      const router = window.TabRouter?.openPage;
      if (router) tab = router(page, group, ctx);
      else {
        try {
          tab = gBrowser.addTab(page, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
            userContextId: ctx, tabGroup: group });
        } catch (error) { console.error("[Groupflow] Cannot open folder page:", error); return false; }
        if (tab && tab.group !== group) { try { group.addTabs([tab]); } catch {} }
        if (tab) gBrowser.selectedTab = tab;
      }
      if (!tab) return false;
      if (tab.group === group) {
        if (pageKey(urlOf(tab)) !== pageKey(page)) tab.zzgfFreshPage = true;
        mark(tab, group);
      }
      soon();
      return true;
    }
    // The folder's icon is its page: clicking it switches to the page, or
    // folds the folder when you are already on it. The name and the rest of
    // the header fold. Called first by toggleSubgroups, so folders with
    // subfolders behave alike.
    function headerClick(event) {
      if (event.button !== 0 || event.defaultPrevented || !enabled()) return false;
      const header = event.target.closest?.(".tab-group-label-container");
      const group = header?.parentElement;
      if (!live(group) || !pageOf(group)) return false;
      if (event.target.closest(".zzgf-close, .tab-close-button, .tab-reset-button, button, input, [editing]")) return false;
      // The icon slides over the name on hover, where the name wins the hit
      // test: go by where the icon is drawn now.
      const iconNode = header.querySelector(":scope > :is(.zzgf-icon, .tab-group-folder-icon)");
      const icon = iconNode?.getBoundingClientRect();
      const onIcon = !!event.target.closest(".zzgf-icon, .tab-group-folder-icon") || (!!icon?.width &&
        event.clientX >= icon.left && event.clientX <= icon.right && event.clientY >= icon.top && event.clientY <= icon.bottom);
      if (!onIcon) return false;
      const tab = pageTab(group);
      if (tab?.selected && !strayPage(group, tab)) return false;   // on the page: fold as usual
      event.preventDefault(); event.stopImmediatePropagation();
      open(group);
      return true;
    }
    pageHeaderClick = headerClick;
    // A redirect on first load fixes the page's address. Later moves (a
    // site's own in-page navigation, redirects, back/forward) keep the tab as
    // the folder's page, so it never pops out as a row; links clicked in it
    // open in their own tab (Tab Router).
    const progress = {
      onLocationChange(browser, webProgress, _request, location) {
        if (!webProgress?.isTopLevel || retired) return;
        const tab = gBrowser.getTabForBrowser(browser), owner = tab?.getAttribute("zzgf-page-of");
        if (!owner) { if (tab?.group) soon(); return; }     // a folder member may now show its page
        if (location?.spec === "about:blank") return;
        const group = tab.group?.id === owner ? tab.group : null, page = group && pageOf(group);
        if (!page) { soon(); return; }
        if (tab.zzgfFreshPage) {
          delete tab.zzgfFreshPage;
          if (pageKey(location.spec) !== pageKey(page)) { pages[group.id] = location.spec; save(); }
        }
        soon();
      },
    };
    function setPage(group, url) {
      for (const t of members(group)) if (markedFor(t) === group.id) unmark(t);
      pages[group.id] = url; save();
      const tab = url && gBrowser.selectedTab;
      if (tab && tab.group === group && pageKey(urlOf(tab)) === pageKey(url)) mark(tab, group);
      soon();
    }
    const items = new Set();
    function menu(event) {
      const target = groupMenu(event.target);
      if (!target) return;
      for (const item of items) item.remove(); items.clear();
      const { group, parent, panel } = target;
      if (!enabled() || !live(group) || !parent) return;
      const selected = gBrowser.selectedTab, url = urlOf(selected);
      const actions = [
        ["use-page", "Use selected tab as folder page", selected?.group === group && !!pageKey(url), () => setPage(group, url)],
        ["clear-page", "Clear folder page", !!pageOf(group), () => setPage(group, "")],
      ];
      for (const [id, label, eligible, action] of actions) {
        if (eligible) items.add(menuItem(parent, panel, id, label, () => { if (!retired && live(group)) action(); }));
      }
    }
    // A page tab is the folder itself: closing it (a shortcut, the menu,
    // Close Other Tabs) unloads it, as a Favorite does, so a folder is never
    // emptied or lost by accident. Closing the folder closes it with the rest.
    const removing = new WeakSet();
    const groupRemoving = event => removing.add(event.target);
    function keepAsPage(tab) {
      return enabled() && !retired && tab?.hasAttribute?.("zzgf-page-tab") && !tab.closing &&
        live(tab.group) && !removing.has(tab.group) && ![...ancestorsOfGroup(tab.group)].some(g => removing.has(g));
    }
    function* ancestorsOfGroup(group) { for (let g = group?.group; g; g = g.group) yield g; }
    function unloadPage(tab) {
      if (tab.selected) {
        const next = gBrowser._findTabToBlurTo(tab) || gBrowser.visibleTabs.find(t => t !== tab && !t.closing);
        if (next) gBrowser.selectedTab = next;
      }
      if (!tab.selected && !tab.hasAttribute("pending")) { try { gBrowser.discardBrowser(tab); } catch {} }
      soon();
    }
    // A folder that holds nothing else -- no other tab, loaded or not, only
    // page tabs of empty subfolders -- closes with its page: when you close
    // the page you are on, and when Close Other Tabs (or any close of several
    // tabs at once) takes everything else in it. Firefox keeps it among
    // recently closed groups.
    let bulk = null;                                   // tabs closing together
    const nothingElse = (group, tab) => !folderTabs(group).some(t => t !== tab && !t.closing &&
      !bulk?.has(t) && !t.hasAttribute("zzgf-page-tab"));
    const onlyPage = tab => (tab.selected || !!bulk) && nothingElse(tab.group, tab);
    function closeFolder(group) {
      removing.add(group);
      try {
        const done = group.isZenFolder && typeof group.delete === "function" ? group.delete() : gBrowser.removeTabGroup(group, { isUserTriggered: true });
        Promise.resolve(done).catch(error => { removing.delete(group); console.error("[Groupflow] Cannot close folder:", error); });
      } catch (error) { removing.delete(group); console.error("[Groupflow] Cannot close folder:", error); return false; }
      return true;
    }
    const nativeRemoveTab = gBrowser.removeTab, ownRemoveTab = Object.prototype.hasOwnProperty.call(gBrowser, "removeTab");
    const removeTab = function (tab, ...rest) {
      if (keepAsPage(tab)) {
        // Closing several at once: the page closes with them, and Firefox
        // drops the folder once it is empty.
        if (onlyPage(tab) && bulk) return nativeRemoveTab.call(this, tab, ...rest);
        if (onlyPage(tab) && closeFolder(tab.group)) return;
        unloadPage(tab); return;
      }
      return nativeRemoveTab.call(this, tab, ...rest);
    };
    gBrowser.removeTab = removeTab;
    const nativeRemoveTabs = gBrowser.removeTabs, ownRemoveTabs = Object.prototype.hasOwnProperty.call(gBrowser, "removeTabs");
    const removeTabs = function (tabs, ...rest) {
      if (!enabled() || retired || !Array.isArray(tabs)) return nativeRemoveTabs.apply(this, [tabs, ...rest]);
      const outer = bulk, folders = new Set();
      for (const t of tabs) for (let g = t.group; g; g = g.group) folders.add(g);
      bulk = new Set([...(outer || []), ...tabs]);
      try { return nativeRemoveTabs.apply(this, [tabs, ...rest]); }
      finally {
        bulk = outer;
        // A folder left with no tab at all (its subfolders emptied) goes too.
        // Plain groups only: Zen keeps its own folders, empty or not.
        if (!bulk) for (const g of folders) if (live(g) && !g.isZenFolder && !removing.has(g) && !folderTabs(g).length) closeFolder(g);
      }
    };
    if (typeof nativeRemoveTabs === "function") gBrowser.removeTabs = removeTabs;
    // A page tab's row is hidden: closing another tab never lands on one
    // (where closing again would only unload it and land on the next), unless
    // nothing else is left.
    const nativeBlurTo = gBrowser._findTabToBlurTo, ownBlurTo = Object.prototype.hasOwnProperty.call(gBrowser, "_findTabToBlurTo");
    // Closing the last tab of a folder that has a page lands on that page, so
    // closing one tab after another stays in the folder; closing the page
    // then closes the folder and lands on its parent's page the same way.
    function folderPageAfter(tab) {
      for (let g = tab.group; g && live(g); g = g.group) {
        if (!nothingElse(g, tab)) return null;
        const page = pageOf(g) ? pageTab(g) : null;
        if (page && page !== tab && !page.closing && !bulk?.has(page)) return page;
      }
      return null;
    }
    const blurTo = function (tab, exclude = [], ...rest) {
      if (!enabled() || retired || typeof nativeBlurTo !== "function") return nativeBlurTo?.call(this, tab, exclude, ...rest) ?? null;
      const page = tab?.selected ? folderPageAfter(tab) : null;
      if (page && !(exclude || []).includes(page)) return page;
      const pageTabs = gBrowser.tabs.filter(t => t !== tab && t.hasAttribute("zzgf-page-tab"));
      const found = pageTabs.length ? nativeBlurTo.call(this, tab, [...(exclude || []), ...pageTabs], ...rest) : null;
      return found || nativeBlurTo.call(this, tab, exclude, ...rest);
    };
    if (typeof nativeBlurTo === "function") gBrowser._findTabToBlurTo = blurTo;
    // Membership, restores and Tab Router's pages move folder pages;
    // addresses come through the progress listener.
    const events = ["TabOpen", "TabClose", "TabGrouped", "TabUngrouped",
      "TabGroupCreate", "TabGroupRemoved", "FolderGrouped", "FolderUngrouped", "SSTabRestored", "ZzRouterPagesChanged"];
    const onEvent = event => { if (!isCopy(event.target)) soon(); };
    window.addEventListener("TabGroupRemoveRequested", groupRemoving, true);
    for (const type of events) window.addEventListener(type, onEvent, true);
    window.addEventListener("popupshowing", menu);
    gBrowser.addTabsProgressListener(progress);
    const prefs = { observe: soon };
    Services.prefs.addObserver(PREFIX + "folder-pages", prefs);
    refresh();
    if (window.Groupflow) Object.assign(window.Groupflow, { folderPage: g => pageOf(g), openFolderPage: g => open(g), setFolderPage: setPage, pageKey });
    return () => {
      retired = true;
      cancelAnimationFrame(frame);
      for (const type of events) window.removeEventListener(type, onEvent, true);
      window.removeEventListener("TabGroupRemoveRequested", groupRemoving, true);
      if (gBrowser.removeTab === removeTab) { if (ownRemoveTab) gBrowser.removeTab = nativeRemoveTab; else delete gBrowser.removeTab; }
      if (gBrowser._findTabToBlurTo === blurTo) { if (ownBlurTo) gBrowser._findTabToBlurTo = nativeBlurTo; else delete gBrowser._findTabToBlurTo; }
      if (gBrowser.removeTabs === removeTabs) { if (ownRemoveTabs) gBrowser.removeTabs = nativeRemoveTabs; else delete gBrowser.removeTabs; }
      if (pageHeaderClick === headerClick) pageHeaderClick = null;
      window.removeEventListener("popupshowing", menu);
      try { gBrowser.removeTabsProgressListener(progress); } catch {}
      try { Services.prefs.removeObserver(PREFIX + "folder-pages", prefs); } catch {}
      for (const item of items) item.remove();
      // Tab Router keys off these; the session keeps each tab's mark for the next start.
      for (const el of document.querySelectorAll("[zzgf-has-page], [zzgf-page-tab], [zzgf-page-of]")) {
        for (const a of ["zzgf-has-page", "zzgf-page-tab", "zzgf-page-of"]) el.removeAttribute(a);
      }
    };
  }

  // ---- idle tabs ------------------------------------------------------------
  // A tab in a folder that has been unloaded and unused for **Idle after**
  // (1d by default; days, hours, minutes), or that you send there from its
  // menu, goes behind an "N idle tabs" row at the bottom of its folder. It
  // stays hidden, folder unfolded or not, until you click that row. Opening
  // it brings it out; **Keep visible** exempts a tab.
  const IDLE_VALUE = "zzgfIdle", KEEP_VALUE = "zzgfKeep";
  function parseDuration(text) {
    const value = String(text ?? "").trim().toLowerCase();
    if (!value) return 864e5;
    if (/^0+(?:\.0+)?$|^off$/.test(value)) return 0;
    let total = 0, matched = "";
    for (const m of value.matchAll(/(\d+(?:\.\d+)?)\s*(d|days?|h|hours?|hrs?|m|mins?|minutes?)\b/g)) {
      total += Number(m[1]) * ({ d: 864e5, h: 36e5, m: 6e4 })[m[2][0]];
      matched += m[0];
    }
    if (!matched && /^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 6e4;   // a bare number is minutes
    return total > 0 ? total : 864e5;
  }
  // Folders made and filled by hand: Tab Router leaves them where you put them.
  const lockPlacement = scope => { try { window.TabRouter?.setPlacementLock?.(scope, true); } catch {} };
  function newSubfolder(tabs, parent) {
    tabs = tabs.filter(t => t?.isConnected && !t.closing && !t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zzgf-page-tab") &&
      !t.splitview && !t.group?.hasAttribute("split-view-group"));
    if (!tabs.length) return null;
    // Made where the first of them is, whichever folder was clicked in.
    parent = tabs[0].group ?? parent;
    const into = parent?.tagName === "tab-group" && !parent.isZenFolder && !parent.hasAttribute("split-view-group") && parent.isConnected ? parent : null;
    const box = into?.groupContainer, at = box ? [...box.children].indexOf(tabs[0]) : -1;
    let group = null;
    try { group = gBrowser.addTabGroup(tabs, { insertBefore: tabs[0], label: "New folder", color: into?.color }); }
    catch (error) { console.error("[Groupflow] Cannot make a subfolder:", error); return null; }
    if (!group) return null;
    if (box && group.parentElement !== box) box.insertBefore(group, box.children[Math.max(0, at)] ?? null);
    lockPlacement(group);
    group.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
    try { gBrowser.tabGroupMenu?.openEditModal?.(group); } catch {}
    return group;
  }
  function moveToFolder(tabs, group) {
    tabs = tabs.filter(t => t?.isConnected && !t.closing && !t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zzgf-page-tab") && t.group !== group &&
      !t.splitview && !t.group?.hasAttribute("split-view-group"));
    if (!tabs.length || !group?.isConnected) return;
    try { group.addTabs(tabs); } catch (error) { console.error("[Groupflow] Cannot move tabs:", error); return; }
    for (const tab of tabs) lockPlacement(tab);
  }
  // The folders of a space, nested ones under their parent, as menu rows.
  function folderRows(workspace) {
    return [...document.querySelectorAll("tab-group:not([split-view-group])")]
      .filter(g => !isCopy(g) && (!workspace || (g.closest("zen-workspace")?.id || g.getAttribute("zen-workspace-id")) === workspace))
      .map(g => { let depth = 0; for (let p = g.parentElement?.closest("tab-group"); p; p = p.parentElement?.closest("tab-group")) depth++; return { g, depth }; });
  }

  function startIdleTabs() {
    const enabled = () => bool("idle-tabs", true);
    const flag = (tab, key) => { try { return SessionStore.getCustomTabValue(tab, key) === "1"; } catch { return false; } };
    const setFlag = (tab, key, on) => {
      try { if (on) SessionStore.setCustomTabValue(tab, key, "1"); else SessionStore.deleteCustomTabValue(tab, key); } catch {}
    };
    let retired = false, queued = false;
    const rows = new Map();               // group -> its idle row
    function idle(tab, now, after) {
      const group = tab.group;
      // Plain groups only: Zen's own folders count every child of theirs as an
      // item, and keep their pinned tabs unloaded as a matter of course.
      if (!group || group.isZenFolder || group.tagName !== "tab-group" || isCopy(tab) || group.hasAttribute("split-view-group") || tab.closing || tab.hidden ||
          tab.selected || tab.multiselected || tab.hasAttribute("zen-empty-tab") || tab.hasAttribute("zzgf-page-tab")) return false;
      if (flag(tab, KEEP_VALUE)) return false;
      if (flag(tab, IDLE_VALUE)) return true;
      if (!after || (!tab.hasAttribute("pending") && !tab.hasAttribute("discarded"))) return false;
      return now - (tab.lastAccessed || 0) >= after;
    }
    function row(group) {
      let el = rows.get(group);
      if (!el) {
        el = document.createElementNS(HTML, "div");
        el.className = "zzgf-idle-row";
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        const toggle = event => {
          if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault(); event.stopPropagation();
          group.toggleAttribute("zzgf-show-idle");
          soon();
        };
        el.addEventListener("click", toggle);
        el.addEventListener("keydown", toggle);
        el.addEventListener("mousedown", event => event.stopPropagation());
        rows.set(group, el);
      }
      return el;
    }
    function sync() {
      queued = false;
      if (retired) return;
      const on = enabled(), now = Date.now(), after = parseDuration(str("idle-after", "1d"));
      const counts = new Map();
      for (const tab of gBrowser.tabs) {
        const isIdle = on && idle(tab, now, after);
        const hide = isIdle && !tab.group.hasAttribute("zzgf-show-idle");
        if (tab.hasAttribute("zzgf-idle") !== isIdle) tab.toggleAttribute("zzgf-idle", isIdle);
        if (tab.hasAttribute("zzgf-idle-hidden") !== hide) tab.toggleAttribute("zzgf-idle-hidden", hide);
        if (isIdle) counts.set(tab.group, (counts.get(tab.group) || 0) + 1);
      }
      for (const [group, el] of rows) {
        if (counts.has(group) && group.isConnected) continue;
        el.remove(); rows.delete(group); group.removeAttribute("zzgf-show-idle");
      }
      for (const [group, n] of counts) {
        const box = group.groupContainer;
        if (!box) continue;
        const el = row(group), open = group.hasAttribute("zzgf-show-idle");
        const label = `${open ? "Hide" : "Show"} ${n} idle tab${n === 1 ? "" : "s"}`;
        if (el.textContent !== label) el.textContent = label;
        el.toggleAttribute("open", open);
        el.setAttribute("aria-expanded", String(open));
        if (el.parentElement !== box || box.lastElementChild !== el) box.appendChild(el);
      }
      gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
    }
    const soon = () => { if (!queued && !retired) { queued = true; queueMicrotask(sync); } };
    // Opening a tab brings it out of the idle row.
    const selected = event => { const tab = event.target; if (flag(tab, IDLE_VALUE)) setFlag(tab, IDLE_VALUE, false); soon(); };
    const events = ["TabOpen", "TabClose", "TabGrouped", "TabUngrouped", "FolderGrouped", "FolderUngrouped",
      "TabGroupRemovedFromDOM", "SSTabRestored", "TabMultiSelect"];
    for (const type of events) window.addEventListener(type, soon, true);
    gBrowser.tabContainer.addEventListener("TabSelect", selected);
    const watch = new MutationObserver(soon);
    watch.observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["pending", "discarded"] });
    const prefs = { observe: soon };
    for (const k of ["idle-tabs", "idle-after"]) Services.prefs.addObserver(PREFIX + k, prefs);
    // Time alone makes a tab idle.
    const tick = setInterval(soon, 60000);
    sync();
    const tabsOf = tabs => tabs.filter(t => t?.isConnected && !t.closing && t.group?.tagName === "tab-group" && !t.group.isZenFolder && !t.group.hasAttribute("split-view-group"));
    const api = {
      // Unloads them too; a selected tab hands the selection on first.
      sendToIdle(tabs) {
        tabs = tabsOf(tabs);
        if (!tabs.length) return;
        for (const tab of tabs) { setFlag(tab, KEEP_VALUE, false); setFlag(tab, IDLE_VALUE, true); }
        if (tabs.includes(gBrowser.selectedTab)) {
          const next = gBrowser._findTabToBlurTo?.(gBrowser.selectedTab, tabs) || gBrowser.visibleTabs.find(t => !tabs.includes(t));
          if (next) gBrowser.selectedTab = next;
        }
        if (gBrowser.selectedTabs?.length > 1) gBrowser.clearMultiSelectedTabs?.();
        for (const tab of tabs) if (!tab.selected && !tab.hasAttribute("pending")) { try { gBrowser.discardBrowser(tab); } catch {} }
        soon();
      },
      keepVisible(tabs, on) {
        for (const tab of tabsOf(tabs)) { setFlag(tab, KEEP_VALUE, on); if (on) setFlag(tab, IDLE_VALUE, false); }
        soon();
      },
      kept: tab => flag(tab, KEEP_VALUE),
      idle: tab => tab.hasAttribute("zzgf-idle"),
    };
    if (window.Groupflow) Object.assign(window.Groupflow, { sendToIdle: api.sendToIdle, keepVisible: api.keepVisible, newSubfolder, moveToFolder });
    // The tab menu, for the tab or the tabs selected with it.
    const menuItems = new Set();
    function tabMenu(event) {
      const popup = event.target;
      if (popup.id !== "tabContextMenu") return;
      for (const el of menuItems) el.remove(); menuItems.clear();
      const context = window.TabContextMenu?.contextTab;
      if (!context?.isConnected || isCopy(context)) return;
      const tabs = (context.multiselected ? gBrowser.selectedTabs : [context]).filter(t => t.isConnected && !t.closing && !t.hasAttribute("zen-empty-tab"));
      const add = el => { popup.appendChild(el); menuItems.add(el); return el; };
      const item = (id, label, command, attrs = {}, parent = null) => {
        const el = document.createXULElement("menuitem");
        el.setAttribute("label", label); el.setAttribute("data-zz-action", "groupflow--" + id);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        el.addEventListener("command", () => { if (!retired) command(); });
        return parent ? parent.appendChild(el) : add(el);
      };
      const split = t => !!t.splitview || !!t.group?.hasAttribute("split-view-group");
      const inFolders = tabsOf(tabs).filter(t => !t.hasAttribute("zzgf-page-tab"));
      const movable = tabs.filter(t => !t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zzgf-page-tab") && !split(t));
      if (!inFolders.length && !movable.length) return;
      add(document.createXULElement("menuseparator"));
      const many = tabs.length > 1 ? ` (${tabs.length})` : "";
      if (enabled() && inFolders.length) {
        item("send-to-idle", "Send to idle tabs" + many, () => api.sendToIdle(inFolders));
        const kept = inFolders.every(t => flag(t, KEEP_VALUE));
        item("keep-visible", "Keep visible (never idle)", () => api.keepVisible(inFolders, !kept), { type: "checkbox", checked: String(kept) });
      }
      if (movable.length) {
        item("new-subfolder", "Move to new subfolder" + many, () => newSubfolder(movable, context.group));
        const menu = document.createXULElement("menu"), list = document.createXULElement("menupopup");
        menu.setAttribute("label", "Move to folder" + many); menu.setAttribute("data-zz-action", "groupflow--move-to-folder");
        menu.appendChild(list);
        const space = context.closest?.("zen-workspace")?.id || context.getAttribute("zen-workspace-id");
        for (const { g, depth } of folderRows(space)) {
          item("move-to-" + (g.id || "folder"), "\u2003".repeat(depth) + (g.label || "Unnamed folder"), () => moveToFolder(movable, g),
            movable.every(t => t.group === g) ? { disabled: "true" } : {}, list);
        }
        if (list.childElementCount) add(menu);
      }
    }
    window.addEventListener("popupshowing", tabMenu);
    return { api, cleanup() {
      retired = true;
      window.removeEventListener("popupshowing", tabMenu);
      for (const el of menuItems) el.remove(); menuItems.clear();
      clearInterval(tick);
      for (const type of events) window.removeEventListener(type, soon, true);
      gBrowser.tabContainer.removeEventListener("TabSelect", selected);
      watch.disconnect();
      for (const k of ["idle-tabs", "idle-after"]) { try { Services.prefs.removeObserver(PREFIX + k, prefs); } catch {} }
      for (const el of rows.values()) el.remove();
      rows.clear();
      for (const el of document.querySelectorAll("[zzgf-idle], [zzgf-idle-hidden], [zzgf-show-idle]"))
        for (const a of ["zzgf-idle", "zzgf-idle-hidden", "zzgf-show-idle"]) el.removeAttribute(a);
      gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
    } };
  }

  function startCollapsedVisibility() {
    const groupsSelector = "tab-group:not([split-view-group]), zen-folder";
    const collapsedSelector = "tab-group[collapsed]:not([split-view-group]), zen-folder[collapsed]";
    const tabSelector = ".tabbrowser-tab:not(zen-library *)";
    const marker = "zzgf-visible";
    const lastTabs = new WeakMap();
    const open = tab => tab.isOpen && !tab.hasAttribute("zen-empty-tab");
    let queued = false, retired = false, membershipDirty = true, allDirty = true;
    let members = new Map();
    const affected = new Set();
    // A tab showing in a folded folder keeps showing when it unloads: only
    // folding the folder again by hand decides afresh which rows it keeps.
    const stayed = new WeakSet();          // shown when they unloaded

    // CSS cannot change Zen's keyboard-navigation visibility. Keep its guards
    // for hidden/closing tabs and collapsed pinned sections, replacing only
    // the collapsed-folder decision. Leave native activeTabs/animations alone.
    const prototypes = [customElements.get("tabbrowser-tab").prototype,
      customElements.get("tab-group").prototype];
    const originals = prototypes.map(proto => Object.getOwnPropertyDescriptor(proto, "visible"));
    const getters = prototypes.map((_proto, index) => function() {
      if (!index && this.hasAttribute("zzgf-idle-hidden") && !this.selected && !this.multiselected) return false;
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
      if (membershipDirty) {
        members = new Map([...document.querySelectorAll(groupsSelector)].filter(g => !isCopy(g))
          .map(g => [g, g.tabs.filter(open)]));
        membershipDirty = false;
      }
      const targets = new Set(allDirty ? document.querySelectorAll(tabSelector) : affected);
      // A split wrapper is one visibility/accessibility unit, including its
      // unloaded peer when a targeted update touches either member.
      for (const tab of targets) for (const peer of tab.splitview?.tabs ||
        (tab.group?.hasAttribute("split-view-group") ? tab.group.tabs : [])) targets.add(peer);
      const tabs = [...targets];
      const retained = new Set();
      const groups = allDirty ? members.keys() : new Set(tabs.flatMap(tab => {
        const chain = []; for (let g = tab.group; g; g = g.group) chain.push(g); return chain;
      }));
      // Existing explicit/seeded false values remain unchanged.
      const keepLast = bool("collapse-keep-last-used", true);
      // lastSeenActive looks up the frontmost window on every read: once per tab a pass.
      const seen = new Map();
      const seenAt = tab => { if (!seen.has(tab)) seen.set(tab, tab.lastSeenActive); return seen.get(tab); };
      for (const group of groups) {
        const groupTabs = members.get(group) || [];
        let last = lastTabs.get(group);
        if (!groupTabs.includes(last)) last = null;
        if (allDirty || !last) for (const tab of groupTabs) {
          if (!last || tab.selected || (!last.selected && seenAt(tab) > seenAt(last))) last = tab;
        }
        lastTabs.set(group, last);
        if (last && keepLast) retained.add(last);
      }
      // Zen may leave visuallyselected on a restored, unloaded pin. It is
      // native paint state, not an additional selection/retention authority.
      const shown = new Set(tabs.filter(tab => open(tab) && !tab.hidden && tab.group &&
        (!tab.hasAttribute("zzgf-idle-hidden") || tab.selected || tab.multiselected) &&
        (retained.has(tab) || tab.selected || tab.multiselected ||
          (!tab.hasAttribute("pending") && !tab.hasAttribute("discarded")) ||
          stayed.has(tab))));
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
      affected.clear(); allDirty = false;
      gBrowser.tabContainer._invalidateCachedVisibleTabs();
    }
    function changed(event) {
      if (isCopy(event?.target)) return;
      if (event?.type === "TabSelect") {
        for (const tab of [event.target, event.detail?.previousTab]) {
          if (!tab) continue;
          affected.add(tab);
          for (let group = tab.group; group; group = group.group) {
            const previous = lastTabs.get(group);
            if (previous) affected.add(previous);
            if (tab === event.target && !group.hasAttribute("split-view-group")) lastTabs.set(group, tab);
          }
        }
      } else if (event?.type !== "rows") {
        // Folded (by hand, or by a parent header): its rows are decided afresh.
        if (event?.type === "TabGroupCollapse" && event.target?.tabs) for (const tab of event.target.tabs) stayed.delete(tab);
        allDirty = true;
        if (!event || ["TabOpen", "TabClose", "TabGrouped", "TabUngrouped", "FolderGrouped", "FolderUngrouped",
          "TabGroupRemovedFromDOM"].includes(event.type)) membershipDirty = true;
      }
      if (queued || retired) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (!retired) sync(); });
    }
    const events = ["TabOpen", "TabSelect", "TabGroupCollapse", "TabGroupExpand", "TabGrouped", "TabUngrouped",
      "TabGroupRemovedFromDOM", "FolderGrouped", "FolderUngrouped",
      "TabClose", "SSTabRestoring", "SSTabRestored"];
    for (const event of events) window.addEventListener(event, changed, true);
    const keepLastPref = PREFIX + "collapse-keep-last-used";
    // A changed setting decides every folder's rows afresh.
    const keepLastChanged = () => { for (const tab of document.querySelectorAll(tabSelector)) stayed.delete(tab); changed(); };
    Services.prefs.addObserver(keepLastPref, keepLastChanged);
    // Native restoration can clear pending without a TabAttrModified event.
    // Each of these attributes changes only its own row (sync adds a split
    // peer), never membership or a folder's last-used tab, so only those
    // rows are updated.
    const observer = new MutationObserver(records => {
      const relevant = records.filter(record => record.target.matches(tabSelector));
      if (!relevant.length) return;
      for (const record of relevant) {
        const tab = record.target;
        affected.add(tab);
        // Unloaded while showing: it stays. Loaded again: an ordinary row.
        if (!record.attributeName || record.attributeName === "pending" || record.attributeName === "discarded") {
          const unloaded = tab.hasAttribute("pending") || tab.hasAttribute("discarded");
          if (unloaded && tab.hasAttribute(marker)) stayed.add(tab); else if (!unloaded) stayed.delete(tab);
        }
      }
      changed({ type: "rows" });
    });
    observer.observe(gBrowser.tabContainer, { subtree: true, attributes: true,
      attributeFilter: ["pending", "discarded", "hidden", "multiselected", "zzgf-idle-hidden"] });

    // Firefox unfolds a collapsed group whenever a tab is inserted into it
    // (bug 1997096); Zen unfolds one when a tab joins it without an active
    // tab, and a collapsed folder once every tab in it would show. A collapsed group now stays folded until it is unfolded by
    // hand; the new tab shows through it like any loaded or selected tab.
    const groupProto = customElements.get("tab-group").prototype;
    const nativeCollapsed = Object.getOwnPropertyDescriptor(groupProto, "collapsed");
    let automatic = 0;
    const keptFolded = new WeakSet();
    const keepFolded = { ...nativeCollapsed, set(value) {
      if (!value && automatic && this.collapsed && !this.hasAttribute("split-view-group")) {
        keptFolded.add(this);
        changed({ type: "state" });
        return;
      }
      nativeCollapsed.set.call(this, value);
    } };
    const holds = !!(nativeCollapsed?.configurable && nativeCollapsed.set);
    if (holds) Object.defineProperty(groupProto, "collapsed", keepFolded);
    const unwraps = [];
    const wrap = (owner, name, after = result => result) => {
      if (!holds || typeof owner?.[name] !== "function") return;
      const own = Object.prototype.hasOwnProperty.call(owner, name), original = owner[name];
      const wrapper = function (...args) {
        automatic++;
        try { return after(original.apply(this, args), args); } finally { automatic--; }
      };
      owner[name] = wrapper;
      unwraps.push(() => {
        if (owner[name] !== wrapper) return;
        if (own) owner[name] = original; else delete owner[name];
      });
    };
    wrap(gBrowser, "addTab");
    // Zen sets a collapsed group's state from has-active when a tab joins it,
    // which unfolds one with no active tab (tabs opened or moved into it).
    wrap(window.gZenFolders, "on_TabGrouped");
    // Zen asks again while this answers "expanded": a folder kept folded is
    // reported as not expanded, so its loop ends.
    wrap(window.gZenFolders, "animateSelect", (result, [group]) => {
      if (!keptFolded.has(group)) return result;
      keptFolded.delete(group);
      return Promise.resolve(false);
    });

    sync();
    return () => {
      retired = true;
      for (const unwrap of unwraps) unwrap();
      if (Object.getOwnPropertyDescriptor(groupProto, "collapsed")?.set === keepFolded.set) {
        Object.defineProperty(groupProto, "collapsed", nativeCollapsed);
      }
      observer.disconnect();
      try { Services.prefs.removeObserver(keepLastPref, keepLastChanged); } catch {}
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
    if (pageHeaderClick?.(event)) return;
    if (event.button !== 0 || event.defaultPrevented || event.target.closest?.(
      "button, toolbarbutton, input, textarea, a, [contenteditable], .tab-close-button, .tab-reset-button, .tab-group-folder-button, .group-marker")) return;
    const group = event.target.closest?.(".tab-group-label-container")?.parentElement;
    const selector = "tab-group, zen-folder";
    if (!group?.matches(selector) || group.hasAttribute("split-view-group") ||
        group.parentElement?.closest(selector) || isCopy(group)) return;
    // Only the subfolders directly under it; theirs keep their own state.
    const children = [...group.querySelectorAll(selector)].filter(child => !child.hasAttribute("split-view-group") &&
      child.parentElement?.closest(selector) === group);
    if (!children.length) return;
    // Capture before Zen toggles the parent: this header controls its subfolders.
    event.preventDefault();
    event.stopPropagation();
    const collapse = children.some(child => !child.collapsed);
    // Loaded and last-used rows (and rows that were showing) remain visible
    // through collapsed ancestors.
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
      if (r.height) stops.add(Math.round(restTop(row, r) - top - (parseFloat(getComputedStyle(row).marginTop) || 0)));
    }
    return [...stops].sort((a, b) => a - b);
  }
  // The selected tab is held in view at an edge of a scrolling folder
  // (position: sticky, userChrome.css), away from its own place in the rows.
  // Where it rests: after the row before it, or at the top of its folder.
  function restTop(row, r) {
    if (!row.matches?.(".tabbrowser-tab:is([selected], [visuallyselected])") || getComputedStyle(row).position !== "sticky") return r.top;
    const px = (el, side) => parseFloat(getComputedStyle(el)[side]) || 0;
    for (let prev = row.previousElementSibling; prev; prev = prev.previousElementSibling) {
      const p = prev.getBoundingClientRect();
      if (p.height) return p.bottom + px(prev, "marginBottom") + px(row, "marginTop");
    }
    const parent = row.parentElement;
    return parent ? parent.getBoundingClientRect().top + px(parent, "paddingTop") + px(parent, "borderTopWidth") + px(row, "marginTop") : r.top;
  }
  // Top-level folders stay on screen: their bodies share the height the rest
  // of the list leaves (shareList), each also capped by zzgroup.folder-height,
  // and scroll inside. A body's height is trimmed so its bottom edge lands
  // where a row begins, whatever spacing the theme gives rows, and never
  // below three rows. Returns the scroll positions and the height for each.
  const shares = new WeakMap();             // box -> height its list gives it
  const prefCap = box => parseFloat(getComputedStyle(box).getPropertyValue("--zzgf-box-cap")) || Infinity;
  // **Rows shown per folder** (5; 0 for no limit): the height of that many
  // rows, tabs and subfolder headers alike, from the top of the body.
  const rowsCap = ends => { const n = num("folder-rows", 5); return n > 0 && ends.length > n ? ends[n] : Infinity; };
  // Reads only: null when the body fits (releaseBox then clears it).
  function measureBox(box) {
    const end = box.scrollHeight;
    const stops = rowStops(box), ends = [...stops, end];
    // A registered <length> | none, so it computes to pixels without touching
    // the box's own height (which would clamp its scroll position).
    const cap = Math.max(Math.min(shares.get(box) ?? prefCap(box), rowsCap(ends)), ends[Math.min(3, ends.length - 1)]);
    if (end <= cap) return null;
    const last = stops.find(y => end - y <= cap) ?? end - cap;
    const positions = stops.filter(y => y < last).concat(last);
    const fitAt = y => ends.filter(e => e > y && e - y <= cap).reduce((a, e) => Math.max(a, e - y), 0);
    return { positions, fitAt };
  }
  function releaseBox(box) {
    for (const v of ["fit", "scroll"]) box.style.removeProperty("--zzgf-box-" + v);
    markEdges(box, false);
  }
  // One measurement per wheel gesture, mouse notches as much as touchpads:
  // rows and caps change only with tabs, folders or sizes, whose refit clears
  // it (fitSoon), as does a pause in the wheel.
  const measures = new Map();
  let measureTimer = null;
  const forgetMeasures = () => { measures.clear(); clearTimeout(measureTimer); measureTimer = null; };
  function gestureMeasure(box) {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(forgetMeasures, 400);
    if (!measures.has(box)) measures.set(box, measureBox(box));
    return measures.get(box);
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
    const want = boxes.map(b => Math.min(b.scrollHeight, prefCap(b), rowsCap([...rowStops(b), b.scrollHeight])));
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
  let motionQuery = null;                   // one live query, asked per rail per frame
  const reducedMotion = () => (motionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
  function scrollBox(box, to, instant, measured) {
    instant ||= reducedMotion();
    if (!instant && glides.get(box)?.to === to) return;   // already gliding there
    // Already there: settle in one frame. A glide to where the box already is
    // re-lit every list for 240ms on each tab switch.
    if (!instant && !glides.has(box) &&
        Math.abs(Math.max(0, Math.min(to, box.scrollHeight - box.clientHeight)) - box.scrollTop) < 0.5) instant = true;
    cancelAnimationFrame(glides.get(box)?.raf);
    glides.delete(box);
    if (measured) box.style.setProperty("--zzgf-box-fit", measured.fitAt(to) + "px");
    let max;
    const set = y => {
      box.scrollTop = y;
      const top = box.scrollTop;
      setTops.set(box, top);
      box.style.setProperty("--zzgf-box-scroll", top + "px");
      markEdges(box, true, max);
    };
    if (instant) { set(to); return; }
    // Measured once: each frame then writes without forcing a layout.
    max = box.scrollHeight - box.clientHeight;
    const from = box.scrollTop, start = performance.now(), ms = 240;
    const step = now => {
      const k = Math.min(1, (now - start) / ms);
      set(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) glides.set(box, { to, raf: requestAnimationFrame(step) }); else glides.delete(box);
    };
    glides.set(box, { to, raf: requestAnimationFrame(step) });
  }
  // What is out of view. A body that scrolls is marked on the sides where
  // rows are hidden (edge fade), its connector lines are
  // lit at one height that follows the scroll: at the top when the body is
  // at its top, sliding to the bottom as it reaches its end. Subfolder
  // lines get the same light, measured from their own tops. Layout is read
  // only for a body that scrolls, and max only when the caller has not.
  function markEdges(box, scrolls, max) {
    if (scrollItems.size) pruneScrollItems();
    if (scrolls) max ??= box.scrollHeight - box.clientHeight;
    scrolls &&= max > 0.5;
    const y = scrolls ? box.scrollTop : 0;
    box.toggleAttribute("zzgf-more-above", scrolls && y > 0.5);
    box.toggleAttribute("zzgf-more-below", scrolls && y < max - 0.5);
    box.toggleAttribute("zzgf-glow", scrolls);
    lightSoon();
    outSoon(box);
  }
  // How many rows are out of view above and below, on the folder's header
  // (each half scrolls a page that way), and whether the selected tab, which
  // stays in view at an edge (userChrome.css), is lying over another row.
  // Counted once the scrolling settles, not on every frame of a glide.
  const outBoxes = new Set();
  let outTimer = null;
  function outSoon(box) {
    outBoxes.add(box);
    clearTimeout(outTimer);
    outTimer = setTimeout(() => { outTimer = null; for (const b of outBoxes) markOut(b); outBoxes.clear(); }, 90);
  }
  function markOut(box) {
    const header = box.parentElement?.querySelector?.(":scope > .tab-group-label-container");
    if (!header?.matches?.(".tab-group-label-container")) return;
    let chip = header.querySelector(":scope > .zzgf-out");
    for (const tab of box.querySelectorAll(".tabbrowser-tab[zzgf-pinned]")) tab.removeAttribute?.("zzgf-pinned");
    if (!box.isConnected || !header || !box.hasAttribute("zzgf-glow") || box.parentElement.collapsed) { chip?.remove(); return; }
    const view = box.getBoundingClientRect();
    let above = 0, below = 0;
    const rows = [];
    for (const row of box.querySelectorAll(".tabbrowser-tab, .tab-group-label-container")) {
      const r = row.getBoundingClientRect();
      if (!r.height) continue;
      rows.push([row, r]);
      if (row.matches(".tabbrowser-tab:is([selected], [visuallyselected])")) continue;   // held in view
      if (r.bottom <= view.top + 1) above++; else if (r.top >= view.bottom - 1) below++;
    }
    const held = rows.find(([row]) => row.matches(".tabbrowser-tab[selected]"));
    if (held && rows.some(([row, r]) => row !== held[0] && Math.min(r.bottom, held[1].bottom) - Math.max(r.top, held[1].top) > 4)) held[0].setAttribute("zzgf-pinned", "");
    if (!above && !below) { chip?.remove(); return; }
    if (!chip) {
      chip = document.createElementNS(HTML, "span");
      chip.className = "zzgf-out";
      // The half pressed decides: its count changes, and it may move, before the click lands.
      let pressed = null;
      chip.addEventListener("mousedown", event => { event.stopPropagation(); pressed = event.target.closest?.("button")?.dataset.dir ?? null; });
      chip.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const dir = pressed ?? event.target.closest?.("button")?.dataset.dir;
        pressed = null;
        if (dir) pageFolder(box, dir);
      });
      for (const dir of ["up", "down"]) {
        const b = document.createElementNS(HTML, "button");
        b.type = "button"; b.className = "zzgf-out-" + dir; b.dataset.dir = dir; b.tabIndex = -1;
        chip.appendChild(b);
      }
      header.appendChild(chip);
    }
    const [up, down] = chip.children;
    const set = (b, n, arrow, where) => {
      const text = n ? arrow + n : "";
      if (b.textContent !== text) b.textContent = text;
      b.hidden = !n;
      b.title = n ? `${n} more ${where}` : "";
    };
    set(up, above, "\u2191", "above"); set(down, below, "\u2193", "below");
  }

  function canScroll(box, dir) {
    return !!box?.isConnected && !isCopy(box) && bool("connector-scroll", true) &&
      !box.parentElement.collapsed && (dir === "up" ? box.scrollTop > 0.5 : box.scrollTop < box.scrollHeight - box.clientHeight - 0.5);
  }
  function pageFolder(box, dir) {
    if (!canScroll(box, dir)) return;
    const measured = measureBox(box);
    if (!measured) { releaseBox(box); return; }
    showWhere(box, true);
    const from = glides.get(box)?.to ?? box.scrollTop, down = dir === "down";
    const ahead = measured.positions.filter(y => down ? y > from + 0.5 : y < from - 0.5);
    if (ahead.length) scrollBox(box, nearest(ahead, from + (down ? 1 : -1) * box.clientHeight), false, measured);
  }
  const scrollItems = new Set();
  // An open folder menu drops a scroll item the folder can no longer follow.
  function pruneScrollItems() {
    for (const item of scrollItems) {
      if (!item.isConnected || item.zzgfEligible()) continue;
      const popup = item.closest("menupopup, panel"), focused = document.activeElement === item;
      item.remove(); scrollItems.delete(item);
      if (focused) ([...popup.querySelectorAll("menuitem, toolbarbutton")].find(n => !n.hidden && !n.disabled) || popup.anchorNode)?.focus();
    }
  }
  function scrollMenu(event) {
    const menu = groupMenu(event.target);
    if (!menu) return;
    for (const item of scrollItems) item.remove(); scrollItems.clear();
    const { group, parent, panel } = menu;
    if (!group?.isConnected || isCopy(group) || !parent) return;
    const box = group.querySelector(":scope > .tab-group-container");
    for (const dir of ["up", "down"]) {
      if (!canScroll(box, dir)) continue;
      const item = menuItem(parent, panel, "scroll-folder-" + dir, "Scroll folder " + dir, () => { if (item.zzgfEligible()) pageFolder(box, dir); });
      item.zzgfEligible = () => group.isConnected && group.contains(box) && canScroll(box, dir);
      scrollItems.add(item);
    }
  }

  // Dynamic connectors: every connector line carries a light showing where
  // you are, scrolling or not, so a folder looks the same however it opens.
  // Each line, subfolders included, has its own: how far you are through
  // that line, like a scrollbar thumb. A folder that scrolls inside itself
  // lights its own line (markEdges) and is the view its subfolders are seen
  // through. With "the selected tab", lines holding it light at its row,
  // except a scrolling folder you point at or scroll from its connector: its
  // line shows where you are. Every other line goes by its own tabs only,
  // never by where it sits (other folders move that): the selected tab,
  // else its most recently used loaded tab, else its own top. With "where
  // you are", a folder that fits shows how far it has travelled up through
  // the list (resting at its top while nothing in it is loaded), and a
  // subfolder's line how much of it has scrolled past. The light glides between positions
  // (userChrome.css). lightLists is the only writer; every rect is read
  // before any light is written, and unchanged lights are not rewritten.
  const LOADED = ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab])";
  const listPorts = new Set();
  let listFrame = 0;
  const through = (top, height, vt, vh) => Math.min(1, Math.max(0, height > vh
    ? (vt - top) / (height - vh)
    : (vt + vh - top - height) / Math.max(vh - height, 1)));
  const past = (r, v) => r.height > v.height ? through(r.top, r.height, v.top, v.height) * r.height
    : Math.min(r.height, Math.max(0, v.top - r.top));
  // Whatever you did or pointed at last decides a folder's own line. Its
  // tabs and subfolders (pointing at them, or selecting a tab, by scrolling
  // over the tabs or otherwise) light the selected tab; its own connector
  // and the strip left of it (pointing at them, or scrolling the folder by
  // wheel or from its menu) light where you are in it. Leaving the sidebar
  // keeps whichever it was.
  const scrolled = new WeakSet();           // boxes whose line shows where you are
  const roams = box => scrolled.has(box);
  function showWhere(box, where) {
    if (!box || scrolled.has(box) === where) return;
    if (where) scrolled.add(box); else scrolled.delete(box);
    lightSoon();
  }
  // Firefox also sends a mousemove when the rows scroll under a pointer that
  // has not moved; only a pointer that moved counts, or the light would flip
  // between the two as tabs and gutters pass beneath it.
  // A subfolder (its header, line and tabs) counts as tabs, for pointing and
  // for the wheel alike, so rows passing under a still pointer never flip a
  // folder between switching tabs and scrolling.
  function asTab(hit) {
    if (hit?.closest?.(".tabbrowser-tab")) return true;
    const body = hit?.closest?.(bodySelector), box = body && folderBox(body);
    return !!box && hit.closest("tab-group, zen-folder") !== box.parentElement;
  }
  let pointFrame = 0, pointEvent = null, pointX = NaN, pointY = NaN;
  let pointTab = null, startTab = null;     // the tab the pointer moved onto; where the next scroll starts
  function pointAt(event) {
    if (event.screenX === pointX && event.screenY === pointY) return;
    pointX = event.screenX; pointY = event.screenY;
    const tab = event.target.closest?.(".tabbrowser-tab") ?? null;
    if (tab !== pointTab) startTab = pointTab = tab;
    pointEvent = event;
    pointFrame ||= requestAnimationFrame(() => {
      pointFrame = 0;
      const ev = pointEvent, hit = ev.target;
      if (!hit?.closest || !gBrowser.tabContainer.contains(hit)) return;
      const body = hit.closest(bodySelector);
      if (body && asTab(hit)) showWhere(folderBox(body), false);
      else if (!hit.closest(".tab-group-label-container, toolbarbutton, button")) showWhere(boxAt(ev, hit), true);
    });
  }
  // The tab a subfolder's line marks when the selected tab is elsewhere, and
  // whether a folder holds a loaded tab. Both only change when tabs do, so
  // they are kept until the next tab event (onFitEvent) rather than looked
  // up on every frame of a scroll.
  let tabFacts = new WeakMap();
  function recentTab(group) {
    if (tabFacts.has(group)) return tabFacts.get(group);
    let best = null;
    for (const t of group.querySelectorAll(LOADED)) if (!best || t.lastAccessed > best.lastAccessed) best = t;
    tabFacts.set(group, best);
    return best;
  }
  const gliding = new Set();
  let glideTimer = null;
  const endGlides = () => { for (const c of gliding) c.toggleAttribute("zzgf-glide", false); gliding.clear(); };
  // Where a tab sits on a line: by its place among the line's own rows (its
  // tabs and subfolders), first at the top and last at the bottom, so a lone
  // tab or a lone subfolder is at the top. Rows are counted, not measured,
  // so the light does not move while the list scrolls.
  function placeOf(container, tab) {
    // A collapsed folder shows only the rows it keeps (loaded and last-used tabs).
    const folded = container.parentElement?.hasAttribute("collapsed");
    const rows = [...container.children].filter(n => n.matches?.(".tabbrowser-tab, tab-group, zen-folder") && !n.hidden &&
      (!folded || n.hasAttribute("zzgf-visible") || !!n.querySelector?.("[zzgf-visible]")));
    const i = rows.findIndex(n => n === tab || n.contains(tab));
    return i < 0 ? null : rows.length > 1 ? i / (rows.length - 1) : 0;
  }
  function lightLists() {
    listFrame = 0;
    const glow = bool("scroll-glow", true);
    const sel = glow && num("glow-follows", 1) === 1 ? gBrowser.selectedTab : null;
    const lit = [];
    // Only the space on screen. The others stay laid out, so measuring them
    // cost a pass over every folder in every space on each frame of a glide;
    // a space is lit again when it becomes active.
    const shown = document.querySelectorAll("zen-workspace[active] arrowscrollbox");
    for (const host of shown.length ? shown : document.querySelectorAll("zen-workspace arrowscrollbox")) {
      const port = host.scrollbox;
      if (!port) continue;
      const view = port.getBoundingClientRect();
      for (const box of topBoxes(host)) {
        const b = box.getBoundingClientRect(), on = glow && b.height > 0, rails = [];
        if (on) {
          const own = box.hasAttribute("zzgf-glow"), roam = roams(box);
          const max = box.scrollHeight - box.clientHeight, holds = sel && box.contains(sel);
          // A folder that fits has no scroll of its own to show, and never goes
          // by where it sits in the list (other folders move it there): like a
          // subfolder, it lights the selected tab, else its last used loaded tab.
          const t = own ? !roam && holds && sel : holds ? sel : sel && recentTab(box.parentElement);
          rails.push({ c: box, r: b, v: own ? b : view, roam, place: t ? placeOf(box, t) : null,
            own: own ? box.scrollTop / max * box.clientHeight : null });
          for (const c of box.querySelectorAll(bodySelector)) {
            const g = c.parentElement, t = sel && (g.contains(sel) ? sel : recentTab(g));
            rails.push({ c, r: c.getBoundingClientRect(), v: own ? b : view, sub: true, place: t ? placeOf(c, t) : null });
          }
        }
        lit.push([box, on, rails]);
      }
    }
    for (const [box, on, rails] of lit) {
      box.toggleAttribute("zzgf-list-glow", on);
      for (const { c, r, v, sub, roam, place, own } of rails) {
        const at = place != null ? place * r.height
          : sub ? (sel ? 0 : past(r, v))
          : own != null ? own
          : !sel && (roam || recentTab(c.parentElement)) ? through(r.top, r.height, v.top, v.height) * r.height : 0;
        const px = at + "px", was = parseFloat(c.style.getPropertyValue("--zzgf-glow"));
        if (c.style.getPropertyValue("--zzgf-glow") === px) continue;
        // Glide only when the light jumps (a tab selected, a switch between
        // the tab and where you are); while scrolling it follows directly, so
        // no line animates on every frame.
        if (!reducedMotion() && Math.abs(at - was) > 12) { c.toggleAttribute("zzgf-glide", true); gliding.add(c); clearTimeout(glideTimer); glideTimer = setTimeout(endGlides, 320); }
        c.style.setProperty("--zzgf-glow", px);
      }
    }
  }
  const lightSoon = () => { listFrame ||= requestAnimationFrame(lightLists); };
  // Only "where you are" reads the list's own scroll; following the selected
  // tab, every line goes by its own rows or its own scroll, so scrolling the
  // list re-measures nothing.
  const onListScroll = () => { if (num("glow-follows", 1) !== 1) lightSoon(); };
  function watchLists() {
    for (const host of document.querySelectorAll("zen-workspace arrowscrollbox")) {
      const port = host.scrollbox;
      if (!port || listPorts.has(port)) continue;
      port.addEventListener("scroll", onListScroll, { passive: true });
      listPorts.add(port);
    }
    lightSoon();
  }
  // Visit each real tab once, accumulating into its ancestors. Selection does
  // not invalidate these facts; loading/playback and membership do.
  let countsDirty = true;
  const folderStatus = new WeakMap();
  function countTabs() {
    if (!countsDirty) return;
    countsDirty = false;
    const groups = [...document.querySelectorAll("tab-group:not([split-view-group]), zen-folder")].filter(g => !isCopy(g));
    const totals = new Map(groups.map(g => [g, { loaded: 0, total: 0, playing: 0 }]));
    for (const tab of document.querySelectorAll(".tabbrowser-tab:not(zen-library *)")) {
      if (tab.closing || tab.hasAttribute("zen-empty-tab")) continue;
      for (let g = tab.group; g; g = g.parentElement?.closest("tab-group, zen-folder")) {
        const n = totals.get(g);
        if (!n) continue;
        n.total++;
        if (!tab.hasAttribute("pending") && !tab.hasAttribute("discarded")) n.loaded++;
        if (tab.hasAttribute("soundplaying")) n.playing++;
      }
    }
    const on = bool("hover-count", true);
    for (const [g, n] of totals) {
      folderStatus.set(g, n);
      const header = g.labelContainerElement;
      if (!header) continue;
      const text = `${n.loaded}/${n.total} loaded${n.playing ? ` · ${n.playing} playing` : ""}`;
      // Unchanged text is not rewritten (each write fires mutation and
      // accessibility events).
      const put = (el, name) => { if (el && el.getAttribute(name) !== text) el.setAttribute(name, text); };
      put(header, "tooltiptext"); put(header, "aria-description"); put(g.labelElement, "aria-description");
      let badge = header.querySelector(":scope > .zzgf-count");
      // Native folders keep their own header controls: the tooltip carries their count.
      if (!on || g.isZenFolder) { badge?.remove(); continue; }
      badge ??= decorSpan(header, "zzgf-count");
      if (badge.textContent !== `${n.loaded}/${n.total}`) badge.textContent = `${n.loaded}/${n.total}`;
    }
  }
  // Loading changes counts, rows and lights; playback only the counts' text.
  let countTimer = null;
  function onStatusEvent(event) {
    const changed = event.detail?.changed;
    if (changed?.some(name => name === "pending" || name === "discarded")) { countsDirty = true; fitSoon(); }
    else if (changed?.includes("soundplaying")) {
      countsDirty = true;
      countTimer ??= setTimeout(() => { countTimer = null; countTabs(); }, 150);
    }
  }
  const settles = new Map();                // box -> timer: pixel scrolling snaps once it pauses
  // Glides and snaps in flight, stopped when the mod retires or folders stop scrolling.
  const stopScrolling = (boxes = new Set([...glides.keys(), ...settles.keys()])) => {
    for (const box of boxes) {
      cancelAnimationFrame(glides.get(box)?.raf);
      clearTimeout(settles.get(box));
      glides.delete(box); settles.delete(box);
    }
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
    // Other workspaces retain layout while visually hidden. Only the space
    // under this pointer can own its outer gutter; empty space stays in it too.
    const workspace = hit?.closest?.("zen-workspace");
    if (!workspace) return null;
    for (const box of topBoxes(workspace)) {
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
    const measured = gestureMeasure(box);
    if (!measured) { releaseBox(box); return false; }
    const { positions } = measured;
    const from = glides.get(box)?.to ?? box.scrollTop;
    // At its end in the wheel's direction the folder passes the wheel on, so
    // the list carries on scrolling past it, as nested scrolling does natively.
    if (event.deltaY > 0 ? from >= positions.at(-1) - 0.5 : from <= 0.5) return false;
    event.preventDefault();                 // also cancels any tab switch by scrolling
    event.stopPropagation();
    showWhere(box, true);
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
    to.scrollBy({ top: event.deltaY * unit, behavior: reducedMotion() || event.deltaMode === event.DOM_DELTA_PIXEL ? "instant" : "smooth" });
  }
  // With Firefox's switch-tabs-by-scrolling on, the wheel over a tab selects
  // the next or previous tab; its folder then brings it into view. Moving
  // the pointer onto a tab makes the next scroll start there; from then on
  // it carries on tab to tab, however the rows move under a still pointer,
  // until the pointer moves onto another tab (pointAt sets startTab).
  const switching = () => Services.prefs.getBoolPref("toolkit.tabbox.switchByScrolling", false);
  function onWheel(event) {
    if (!event.deltaY || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    const hit = hitOf(event);
    if (!hit || !gNavToolbox.contains(hit)) return;
    if (switching() && asTab(hit)) {
      const start = startTab, overTab = hit.closest(".tabbrowser-tab");
      startTab = null;
      if (overTab && start === overTab && overTab !== gBrowser.selectedTab) {
        event.preventDefault();             // start here, not next to the old tab
        event.stopPropagation();
        gBrowser.selectedTab = overTab;
      }
      return;
    }
    if (bool("connector-scroll", true) && scrollFolder(event, hit)) return;
    if (bool("hover-scroll", true)) scrollHovered(event, hit);
  }
  // Refit a resting box after tabs, folders or the window change: nearest row,
  // keeping a selected tab inside the box fully in view unless told to keep
  // the rows where they are.
  // Where a resting box should sit (reads only): null when it fits.
  function planFit(box, keep) {
    const measured = measureBox(box);
    if (!measured) return null;
    const y = box.scrollTop;
    let choices = measured.positions;
    const selected = box.querySelector(".tabbrowser-tab[selected]");
    const r = selected?.getBoundingClientRect();
    if (r?.height && !keep) {
      const top = restTop(selected, r) - box.getBoundingClientRect().top + y, bottom = top + r.height;
      const showing = choices.filter(p => top >= p && bottom <= p + measured.fitAt(p));
      if (showing.length) choices = showing;
    }
    return { measured, to: nearest(choices, y) };
  }
  function fitBox(box, keep, glide = false) {
    if (glides.has(box) && !glide) return;
    const plan = planFit(box, keep);
    if (plan) scrollBox(box, plan.to, !glide, plan.measured);
    else releaseBox(box);
  }
  // Zen's button owns the outer list. Reveal our capped body first so its
  // native click handler reads the selected tab's final layout coordinates.
  function revealSelected(event) {
    if (!event.target.closest?.('.zen-workspace-scroll-to-tab') ||
        !Services.prefs.getBoolPref('zen.view.show-scroll-to-selected-tab', true) ||
        !bool('connector-scroll', true)) return;
    const box = topBoxes().find(body => body.contains(gBrowser.selectedTab));
    if (!box) return;
    stopScrolling([box]);
    fitBox(box, false);
  }
  let fitTimer = null, showSelected = false;
  function fitAll(keep = true) {
    watchLists();                           // the list's light needs no folder scrolling
    if (!bool("connector-scroll", true)) {
      // Turned off: clear what folder scrolling left, so the list's light can take over.
      stopScrolling();
      for (const box of topBoxes()) releaseBox(box);
      return;
    }
    // The space on screen; another is fitted as it becomes active.
    const spaces = document.querySelectorAll("zen-workspace[active]");
    const roots = spaces.length ? [...spaces] : [document];
    for (const root of roots) for (const host of root.querySelectorAll("arrowscrollbox")) shareList(host);
    // Every read, then every write, then the edges' one read: a refit costs a
    // few layout passes in all rather than a few per folder.
    const plans = roots.flatMap(root => topBoxes(root)).filter(box => !glides.has(box))
      .map(box => [box, planFit(box, keep)]);
    for (const [box, plan] of plans) {
      if (plan) box.style.setProperty("--zzgf-box-fit", plan.measured.fitAt(plan.to) + "px");
      else for (const v of ["fit", "scroll"]) box.style.removeProperty("--zzgf-box-" + v);
    }
    for (const [box, plan] of plans) if (plan) { box.scrollTop = plan.to; setTops.set(box, box.scrollTop); }
    for (const [box, plan] of plans) if (plan) box.style.setProperty("--zzgf-box-scroll", setTops.get(box) + "px");
    const maxes = plans.map(([box]) => box.scrollHeight - box.clientHeight);
    plans.forEach(([box, plan], i) => markEdges(box, !!plan, maxes[i]));
  }
  // A refit keeps each body's rows where they are, unless a tab was selected
  // or brought into view: then that tab is kept fully inside its body.
  const fitSoon = (select = false) => {
    forgetMeasures();                       // whatever asked for a refit moved rows or sizes
    showSelected ||= select === true;
    if (fitTimer === null) fitTimer = setTimeout(() => { fitTimer = null; const keep = !showSelected; showSelected = false; countTabs(); fitAll(keep); }, 150);
  };
  const onFitEvent = event => {
    if (isCopy(event.target)) return;
    // A selected tab glides into view at once, so switching tabs by scrolling keeps up.
    const box = event.type === "TabSelect" && topBoxes().find(b => b.contains(event.target));
    if (event.type === "TabSelect") {
      for (const tab of [event.target, event.detail?.previousTab])
        for (let g = tab?.group; g; g = g.group) tabFacts.delete(g);
    } else {
      tabFacts = new WeakMap();
      if (!["TabGroupCollapse", "TabGroupExpand"].includes(event.type)) countsDirty = true;
    }
    if (box) {
      // Selecting a tab is the latest thing done here: its line follows the tab.
      showWhere(box, false);
      if (bool("connector-scroll", true)) fitBox(box, false, true);
    }
    lightSoon();
    fitSoon(event.type === "TabSelect");
  };
  const FIT_EVENTS = ["TabSelect", "TabOpen", "TabClose", "TabGroupCollapse", "TabGroupExpand",
                      "TabGrouped", "TabUngrouped", "FolderGrouped", "FolderUngrouped", "TabGroupCreate", "TabGroupRemoved", "TabMove", "TabPinned", "TabUnpinned",
                      "TabBrowserDiscarded", "SSTabRestoring", "SSTabRestored"];   // a folder's line rests at its top once nothing in it is loaded
  // Scrolls this mod did not start, such as a selected tab brought into view.
  // Its own scrolls are recognised by position: refitting after them would
  // pull the body back to the selected tab, so a folder could not scroll away.
  function holdRail(event) {
    const box = event.target;
    if (box.classList?.contains("tab-group-container") && !glides.has(box)) {
      box.style.setProperty("--zzgf-box-scroll", box.scrollTop + "px");
      // Then settle it on a row. The selected tab is held in view at the
      // box's edge, so the body is not pulled back to where that tab rests.
      if (box.scrollTop !== setTops.get(box)) fitSoon();
    }
  }
  // With toolkit.tabbox.switchByScrolling on, Firefox turns every wheel over
  // the tab strip into a tab switch (selecting, and so loading, the next tab).
  // Over the gutter of a group that fits, hide the legacy scroll event from
  // that handler so the list scrolls natively instead.
  function scrollOnConnectors(event) {
    const hit = hitOf(event);
    // Tabs and subfolders still switch tabs; only the folder's own gutters do not.
    if (bool("connector-scroll", true) && !asTab(hit) && (gutterOf(hit) || boxAt(event, hit))) event.stopPropagation();
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
    window.addEventListener("click", revealSelected, true);
    window.addEventListener("TabGroupCreate", dressCopies, true);
    // Capture on the strip runs before tabbox.js's bubble listener there.
    const strip = gBrowser.tabContainer;
    window.addEventListener("popupshowing", scrollMenu);
    strip.addEventListener("DOMMouseScroll", scrollOnConnectors, { capture: true, passive: true });
    gNavToolbox.addEventListener("wheel", onWheel, { capture: true, passive: false });
    gNavToolbox.addEventListener("mousemove", pointAt, { passive: true });
    strip.addEventListener("scroll", holdRail, { capture: true, passive: true });
    for (const ev of FIT_EVENTS) window.addEventListener(ev, onFitEvent, true);
    window.addEventListener("TabAttrModified", onStatusEvent, true);
    // The tab area changes size with the window, and without any event of
    // its own: the media bar or a video preview (Mediaflow) appearing,
    // essentials or the window toolbar. Without the wrapper, the window's
    // resize stands in.
    const resized = () => fitSoon();
    const tabArea = new ResizeObserver(resized);
    const wrapper = document.getElementById("zen-tabs-wrapper");
    if (wrapper) tabArea.observe(wrapper);
    else window.addEventListener("resize", resized);
    // Lists are lit only in the active space; light a space as it becomes
    // active, even when no tab is selected on the way (an Essential kept).
    const spaceShown = new MutationObserver(records => {
      if (records.some(r => r.target.localName === "zen-workspace" && r.target.hasAttribute("active"))) { lightSoon(); fitSoon(); }
    });
    spaceShown.observe(strip, { subtree: true, attributes: true, attributeFilter: ["active"] });
    // Container colours matter only to the Tab container colour accent.
    const identityChanged = () => { if (num("color-source", 0) === 3) schedule(); };
    try { Services.obs.addObserver(identityChanged, "contextual-identity-updated"); } catch {}

    window.Groupflow = {
      automaticPictureAllowed: group => plainGroup(group) && !ruledIcon(group) && !customIcon(group) && bool("section-icons", true),
      pictureForSearch: group => group && !ruledIcon(group) && !customIcon(group) && bool("section-icons", true) ? stampedIcon(group) : null,
      folderStatus(group) { countTabs(); return folderStatus.get(group) || { loaded: 0, total: 0, playing: 0 }; },
      // Additions may batch; removals/history purge and console calls stay immediate.
      refresh(defer = false, targets = null) {
        if (targets) {
          for (const group of targets) dirty.add(group);
          if (defer) { if (timer === null) timer = setTimeout(refreshDirty, 0); }
          else { clearTimeout(timer); refreshDirty(); }
          return;
        }
        if (defer) { schedule(); return; }
        clearTimeout(timer); timer = null; dirty.clear(); everything = false;
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
    refreshAll();
    let foldTimer = null;
    let cleanupGroups = null;
    let cleanupVisibility = null;
    let cleanupPages = null;
    let idleTabs = null;
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
      window.removeEventListener("click", revealSelected, true);
      stopScrolling(); forgetMeasures();
      for (const port of listPorts) port.removeEventListener("scroll", onListScroll);
      cancelAnimationFrame(listFrame);
      for (const box of document.querySelectorAll(".tab-group-container")) {
        for (const name of ["zzgf-glow", "zzgf-more-above", "zzgf-more-below", "zzgf-list-glow"]) box.removeAttribute(name);
        for (const name of ["--zzgf-glow", "--zzgf-box-fit", "--zzgf-box-scroll"]) box.style.removeProperty(name);
      }
      window.removeEventListener("TabGroupCreate", dressCopies, true);
      window.removeEventListener("popupshowing", scrollMenu);
      for (const item of scrollItems) item.remove(); scrollItems.clear();
      strip.removeEventListener("DOMMouseScroll", scrollOnConnectors, true);
      gNavToolbox.removeEventListener("wheel", onWheel, true);
      gNavToolbox.removeEventListener("mousemove", pointAt);
      cancelAnimationFrame(pointFrame);
      clearTimeout(glideTimer);
      endGlides();
      strip.removeEventListener("scroll", holdRail, true);
      for (const ev of FIT_EVENTS) window.removeEventListener(ev, onFitEvent, true);
      window.removeEventListener("TabAttrModified", onStatusEvent, true);
      tabArea.disconnect();
      window.removeEventListener("resize", resized);
      spaceShown.disconnect();
      clearTimeout(fitTimer); clearTimeout(countTimer); clearTimeout(outTimer);
      for (const tab of document.querySelectorAll(".tabbrowser-tab[zzgf-pinned]")) tab.removeAttribute("zzgf-pinned");
      try { Services.obs.removeObserver(identityChanged, "contextual-identity-updated"); } catch {}
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      clearTimeout(timer);
      clearTimeout(foldTimer);
      cleanupGroups?.();
      cleanupVisibility?.();
      cleanupPages?.();
      idleTabs?.cleanup();
      groupDetails?.retire();
      // What refreshGroup (setSavedBackground included), countTabs and dressCopy wrote on groups and headers.
      for (const group of document.querySelectorAll("tab-group, zen-folder")) {
        for (const name of ["--zzgf-icon", "--zzgf-group-color", "--zzgf-container-color", "--zzgf-saved-background"]) group.style.removeProperty(name);
        for (const name of ["zzgf-shape", "zzgf-picture", "zzgf-saved-gradient"]) group.removeAttribute(name);
        const header = group.labelContainerElement;
        if (!header) continue;
        for (const child of header.querySelectorAll(":scope > :is(.zzgf-count, .zzgf-rim, .zzgf-control, .zzgf-out)")) child.remove();
        for (const name of ["tooltiptext", "aria-description"]) header.removeAttribute(name);
        for (const name of ["--zzgf-saved-tint-background", "--zzgf-saved-available"]) header.style.removeProperty(name);
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
        try { cleanupPages = startFolderPages(); } catch (error) { console.error("[Groupflow] folder pages failed to start:", error); }
        try { idleTabs = startIdleTabs(); } catch (error) { console.error("[Groupflow] idle tabs failed to start:", error); }
        foldStartupGroups();
        groupDetails.save();
        refreshAll();
        window.dispatchEvent(new CustomEvent("GroupflowReady"));
        fitSoon();
      }, 0);
    }).catch(e => console.error("[Groupflow] startup folding failed:", e));
  }

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
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs;
    let wrote = false;
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
        wrote = true;
      } catch {}
    }
    return wrote;
  }

  // Written the moment this script is injected, not from start(). These
  // variables need only Services.prefs and the document element -- never
  // gBrowser -- and browser-delayed-startup-finished, which start() waits for,
  // fires well AFTER first paint: deferred, every window would paint the CSS
  // fallbacks (10px roundness, the default tints) and then snap to the
  // configured values.
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
    // A window closed before delayed startup never fires the topic, and the
    // observer service would keep this whole window alive for the session.
    window.addEventListener("unload", stopWaiting, { once: true });

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
