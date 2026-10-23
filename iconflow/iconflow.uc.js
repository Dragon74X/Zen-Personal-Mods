// ==UserScript==
// @name           Iconflow
// @description    Writes Iconflow's preference variables and defaults; adds coloured and site icons to Zen's icon picker.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // Sine can inject a second copy on a rebuild; retire the first.
  const INSTANCE_KEY = "__zziconInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzicon.";
  const MOD_ID = "zz-iconflow";
  const root = document.documentElement;
  let retired = false;

  // Strings and ints become --zzicon-foo-bar on the root, as Sine names them,
  // written now rather than after Sine's async read. Booleans are read with
  // -moz-pref() and never written; reading one as a string would log an error.
  function write(full) {
    const P = Services.prefs, name = "--" + full.replace(/\./g, "-");
    let value = null;
    try {
      const type = P.getPrefType(full);
      if (type === P.PREF_STRING) value = P.getStringPref(full) || null;
      else if (type === P.PREF_INT) value = String(P.getIntPref(full));
    } catch {}
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
  const writeAll = () => {
    try { for (const leaf of Services.prefs.getBranch(PREFIX).getChildList("")) write(PREFIX + leaf); } catch {}
  };

  // Sine writes declared defaults only once its settings page is opened, so a
  // default-on checkbox would read as off until then. Write each unset one.
  async function seedDefaults() {
    const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
    const S = Services.prefs;
    const defaults = await res.json();
    if (retired) return;
    for (const { property: name, defaultValue: value } of defaults) {
      if (!name?.startsWith(PREFIX) || value == null || S.getPrefType(name) !== S.PREF_INVALID) continue;
      if (typeof value === "boolean") S.setBoolPref(name, value);
      else if (typeof value === "number") S.setIntPref(name, value);
      else S.setStringPref(name, String(value));
    }
  }

  // ---- Zen's icon picker -----------------------------------------------------
  // Zen draws any workspace, folder or new-space icon whose value ends in
  // ".svg" as a picture, so Iconflow's coloured icons go at the top of the
  // picker's SVG page as self-contained data (they keep working without
  // Iconflow), with a style, a colour and a search above them, then the
  // icons of sites open in this workspace.
  const COLOURS = {
    aurora: ["#5ee0c8", "#9a7bff"], frost: ["#ffffff", "#a9c6dd"], silver: ["#f4f6fa", "#8a94a6"],
    graphite: ["#d9dee8", "#5b6b86"], sapphire: ["#8fc2ff", "#2c4fd6"], aquamarine: ["#b6f4ff", "#2aa8c4"],
    emerald: ["#8ff0c4", "#0e8f63"], amethyst: ["#dcb6ff", "#7338c9"], ruby: ["#ff9db0", "#b3123f"], topaz: ["#ffe09a", "#d9821c"],
  };
  const HTML = "http://www.w3.org/1999/xhtml";
  const svgURL = body => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${body}</svg>`) + "#.svg";
  const SHEEN = `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  function art([, , tint, line, fill], style, [a, b]) {
    const g = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    if (style === 1) return svgURL(`<defs>${g}${SHEEN}</defs><rect width="256" height="256" rx="64" fill="url(#g)"/><rect width="256" height="256" rx="64" fill="url(#s)" opacity=".55"/><path d="${fill}" fill="#fff" transform="translate(38 38) scale(.703)"/>`);
    if (style === 2) return svgURL(`<defs>${g}</defs><path d="${fill}" fill="url(#g)"/>`);
    return svgURL(`<defs>${g}${SHEEN}</defs><path d="${tint}" fill="url(#g)" opacity=".5"/><path d="${tint}" fill="url(#s)" opacity=".6"/><path d="${line}" fill="url(#g)"/>`);
  }
  let iconData = null;
  const loadIcons = () => iconData ??= fetch(`chrome://sine/content/${MOD_ID}/workspace-icons.json`).then(r => r.json()).then(j => j.icons).catch(() => (iconData = null, []));
  // A site's icon as it is; the switcher's button is its plate. Pictures
  // can't load anything from inside an icon, so it is copied in as PNG.
  async function siteIcon(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElementNS(HTML, "canvas");
    c.width = c.height = 64;
    c.getContext("2d").drawImage(img, 0, 0, 64, 64);
    return svgURL(`<image href="${c.toDataURL("image/png")}" width="256" height="256"/>`);
  }
  function siteSources() {
    const ws = window.gZenWorkspaces?.activeWorkspace, seen = new Set(), out = [];
    for (const tab of gBrowser.tabs) {
      if (tab.hasAttribute("zen-glance-tab") || !(tab.hasAttribute("zen-essential") || tab.getAttribute("zen-workspace-id") === ws)) continue;
      const src = tab.getAttribute("image");
      let host = "";
      try { host = tab.linkedBrowser.currentURI.host; } catch {}
      const key = host || src;
      if (!src || seen.has(key)) continue;
      seen.add(key);
      out.push({ src, host });
      if (out.length >= 18) break;
    }
    return out;
  }
  function item(url, tip) {
    // The emoji class makes Zen select the label as the icon.
    const b = document.createXULElement("toolbarbutton");
    b.className = "toolbarbutton-1 zen-emojis-picker-emoji zzicon-ws";
    b.setAttribute("label", url);
    b.setAttribute("tooltiptext", tip);
    b.setAttribute("aria-label", tip);
    b.style.listStyleImage = `url("${url}")`;
    return b;
  }
  const heading = text => Object.assign(document.createElementNS(HTML, "div"), { className: "zzicon-ws-heading", textContent: text });
  async function fillPicker(event) {
    const panel = event.target, list = document.getElementById("PanelUI-zen-emojis-picker-svgs");
    if (panel.id !== "PanelUI-zen-emojis-picker" || !list || !Services.prefs.getBoolPref(PREFIX + "picker.enabled", true)) return;
    // Pinned tabs wrap whatever is picked as emoji text; leave them Zen's icons.
    if (document.querySelector("[zen-emoji-open]")?.closest(".tabbrowser-tab")) return;
    const icons = await loadIcons();
    if (retired || panel.state === "closed" || panel.state === "hiding") return;
    list.querySelector(".zzicon-ws-block")?.remove();
    const S = Services.prefs, block = document.createElementNS(HTML, "div");
    block.className = "zzicon-ws-block";
    const bar = document.createElementNS(HTML, "div"), grid = document.createElementNS(HTML, "div"), search = document.createElementNS(HTML, "input");
    bar.className = "zzicon-ws-bar"; grid.className = "zzicon-ws-grid";
    search.setAttribute("aria-label", "Search icons");
    search.type = "search"; search.placeholder = "Search icons"; search.className = "zzicon-ws-search";
    const style = () => S.getIntPref(PREFIX + "picker.style", 0), colour = () => COLOURS[S.getStringPref(PREFIX + "picker.colour", "aurora")] || COLOURS.aurora;
    const draw = () => {
      const q = search.value.trim().toLowerCase(), s = style(), c = colour();
      const hadGridFocus = grid.contains(document.activeElement);
      grid.replaceChildren(...icons.filter(i => !q || i[0].includes(q) || i[1].includes(q)).map(i => item(art(i, s, c), i[0].replace(/-/g, " "))));
      if (hadGridFocus) (grid.firstElementChild || search).focus();
      for (const b of bar.querySelectorAll("[data-style]")) { const selected = +b.dataset.style === s; b.toggleAttribute("selected", selected); b.setAttribute("aria-pressed", String(selected)); }
      for (const b of bar.querySelectorAll("[data-colour]")) { const selected = b.dataset.colour === S.getStringPref(PREFIX + "picker.colour", "aurora"); b.toggleAttribute("selected", selected); b.setAttribute("aria-pressed", String(selected)); }
    };
    ["Glass", "Tile", "Solid"].forEach((label, i) => {
      const b = Object.assign(document.createElementNS(HTML, "button"), { textContent: label, className: "zzicon-ws-style" });
      b.dataset.style = i;
      b.addEventListener("click", () => { S.setIntPref(PREFIX + "picker.style", i); draw(); });
      bar.append(b);
    });
    for (const [name, [a, b2]] of Object.entries(COLOURS)) {
      const b = Object.assign(document.createElementNS(HTML, "button"), { className: "zzicon-ws-swatch", title: name[0].toUpperCase() + name.slice(1) });
      b.setAttribute("aria-label", b.title);
      b.dataset.colour = name;
      b.style.background = `linear-gradient(135deg, ${a}, ${b2})`;
      b.addEventListener("click", () => { S.setStringPref(PREFIX + "picker.colour", name); draw(); });
      bar.append(b);
    }
    search.addEventListener("input", draw);
    block.append(bar, search, grid);
    if (S.getBoolPref(PREFIX + "picker.sites", true)) {
      const sites = document.createElementNS(HTML, "div");
      sites.className = "zzicon-ws-grid";
      for (const { src, host } of siteSources()) siteIcon(src).then(url => { if (!retired && block.isConnected && !["closed", "hiding"].includes(panel.state)) sites.append(item(url, host || "Site")); }).catch(() => {});
      block.append(heading("Sites open in this space"), sites);
    }
    block.append(heading("Zen"));
    draw();
    list.prepend(block);
  }
  // Site icons picked under 1.17.0 carry a glass plate of their own inside
  // the switcher button's; take it off, keeping the picture.
  const PLATED = "data:image/svg+xml,";
  window.gZenWorkspaces?.promiseInitialized?.then(() => {
    if (retired) return;
    for (const ws of gZenWorkspaces.getWorkspaces()) {
      const icon = ws.icon;
      if (!icon?.startsWith(PLATED) || !icon.endsWith("#.svg")) continue;
      const svg = decodeURIComponent(icon.slice(PLATED.length, -5));
      const png = svg.includes('rx="60"') && svg.match(/<image href="(data:image\/png;base64,[^"]+)" x="52"/)?.[1];
      if (!png) continue;
      ws.icon = svgURL(`<image href="${png}" width="256" height="256"/>`);
      gZenWorkspaces.saveWorkspace(ws);
    }
  }).catch(() => {});
  const onPicker = e => { fillPicker(e).catch(err => console.error("[Iconflow] icon picker:", err)); };
  document.getElementById("PanelUI-zen-emojis-picker")?.addEventListener("popupshowing", onPicker);

  // Confirmed native successes only. Individual scale composes with hover
  // transforms; only transparent glyph elements move, never button backgrounds.
  const completions = new Map(), completionUndo = [];
  function completion(setting, selector) {
    const S = Services.prefs, choice = S.getIntPref(PREFIX + (setting === "library" ? "library.style" : "button." + setting), 0);
    if (retired || !S.getBoolPref(PREFIX + "animate", true) || (setting === "library" ? choice === 2 : [1, 5].includes(choice)) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const glyph of document.querySelectorAll(selector)) {
      if (!glyph.isConnected || !glyph.getClientRects().length || completions.has(glyph)) continue;
      const motion = glyph.animate([{ scale: "1" }, { scale: "1.22", offset: .35 }, { scale: "1" }], { duration: 360, easing: "ease-out" });
      completions.set(glyph, motion);
      motion.finished.catch(() => {}).finally(() => { if (completions.get(glyph) === motion) completions.delete(glyph); });
    }
  }
  function listenForCompletions() {
    if (retired) return;
    const manager = window.gZenUIManager, nativeToast = manager?.showToast;
    if (nativeToast) {
      const toast = function(id, ...args) {
        const result = nativeToast.call(this, id, ...args);
        if (["zen-copy-current-url-confirmation", "zen-copy-current-url-as-markdown-confirmation"].includes(id)) completion("share", "#zen-copy-current-url-button .toolbarbutton-icon");
        return result;
      };
      manager.showToast = toast;
      completionUndo.push(() => { if (manager.showToast === toast) manager.showToast = nativeToast; });
    }
    const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
    const bookmarks = events => {
      if (events.some(e => !e.isTagging && e.url && e.url === gBrowser.selectedBrowser?.currentURI?.spec)) completion("bookmark", "#star-button");
    };
    PlacesUtils.observers.addListener(["bookmark-added"], bookmarks);
    completionUndo.push(() => PlacesUtils.observers.removeListener(["bookmark-added"], bookmarks));
    const { DownloadsCommon } = ChromeUtils.importESModule("moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs");
    const data = DownloadsCommon.getData(window), succeeded = new WeakMap();
    const view = {
      onDownloadAdded(d) { succeeded.set(d, !!d.succeeded); },
      onDownloadChanged(d) {
        const prior = succeeded.get(d); succeeded.set(d, !!d.succeeded);
        if (prior === false && d.succeeded) {
          completion("downloads", "#downloads-button .toolbarbutton-icon");
          completion("library", "#zen-library-button .zen-library-sprite");
        }
      },
      onDownloadRemoved(d) { succeeded.delete(d); },
    };
    data.addView(view); completionUndo.push(() => data.removeView(view));
  }
  window.gZenStartup?.promiseInitialized?.then(() => { try { listenForCompletions(); } catch (error) { console.error("[Iconflow] completion hooks", error); } });

  const observer = { observe(_s, _t, data) { if (data?.startsWith(PREFIX)) write(data); } };
  writeAll();
  seedDefaults().catch(() => {});
  Services.prefs.addObserver(PREFIX, observer);
  const cleanup = () => {
    if (retired) return; retired = true;
    for (const undo of completionUndo.splice(0).reverse()) { try { undo(); } catch {} }
    for (const motion of completions.values()) motion.cancel(); completions.clear();
    document.querySelectorAll(".zzicon-ws-block").forEach(block => block.remove());
    try { Services.prefs.removeObserver(PREFIX, observer); } catch {}
    window.removeEventListener("unload", cleanup);
    document.getElementById("PanelUI-zen-emojis-picker")?.removeEventListener("popupshowing", onPicker);
    // The variables written above go with the mod (an update writes them again).
    for (const name of [...root.style]) if (name.startsWith("--zzicon-")) root.style.removeProperty(name);
    if (window[INSTANCE_KEY] === instance) delete window[INSTANCE_KEY];
  };
  instance.retire = cleanup;
  window.addEventListener("unload", cleanup, { once: true });
  try { window.addUnloadListener?.(cleanup); } catch {}   // Sine disable or update
})();
