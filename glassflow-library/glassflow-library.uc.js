// ==UserScript==
// @name           Glassflow Library
// @description    Writes Glassflow Library's preference variables and defaults.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // Sine can inject a second copy on a rebuild; retire the first.
  const INSTANCE_KEY = "__zzlibInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzlib.";
  const MOD_ID = "zz-glassflow-library";
  const root = document.documentElement;

  // Strings and ints become --zzlib-foo-bar on the root, as Sine names them,
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
    for (const { property: name, defaultValue: value } of await res.json()) {
      if (!name?.startsWith(PREFIX) || value == null || S.getPrefType(name) !== S.PREF_INVALID) continue;
      if (typeof value === "boolean") S.setBoolPref(name, value);
      else if (typeof value === "number") S.setIntPref(name, value);
      else S.setStringPref(name, String(value));
    }
  }

  const pref = (name, fallback) => {
    const P = Services.prefs;
    try {
      switch (P.getPrefType(name)) {
        case P.PREF_BOOL: return P.getBoolPref(name);
        case P.PREF_INT: return P.getIntPref(name);
        case P.PREF_STRING: return P.getStringPref(name);
      }
    } catch {}
    return fallback;
  };
  const Library = () => customElements.get("zen-library");
  const libraryNode = () => document.querySelector("zen-library");

  // ---- Floating Library ----
  // Zen's openProgress setter slides the Library in and moves the page, the
  // toasts and the sidebar aside. Floating, those stay put and the panel
  // slides in from its own side (or rises in the centre) over them.
  const floating = () => pref("zzlib.float.enabled", false);
  const floatSide = () => {
    const side = pref("zzlib.float.side", 0);
    if (side == 1) return "left";
    if (side == 2) return "right";
    if (side == 3) return "centre";
    return window.gZenVerticalTabsManager?._prefsRightSide ? "right" : "left";
  };
  function place(lib, progress) {
    if (!floating()) {
      if (lib.hasAttribute("zzlib-float")) {
        lib.removeAttribute("zzlib-float");
        lib.style.removeProperty("opacity");
      }
      return;
    }
    const side = floatSide();
    if (lib.getAttribute("zzlib-float") !== side) lib.setAttribute("zzlib-float", side);
    for (const id of ["zen-appcontent-wrapper", "zen-toast-container"]) document.getElementById(id)?.style.removeProperty("transform");
    window.gNavToolbox?.style.removeProperty("transform");
    window.gNavToolbox?.style.removeProperty("opacity");
    const hidden = 1 - progress;
    if (side === "centre") {
      lib.style.transform = `translateY(calc(18px * ${hidden})) scale(${0.96 + 0.04 * progress})`;
      lib.style.opacity = String(Math.max(0, Math.min(1, progress * 1.5)));
    } else {
      lib.style.transform = `translateX(calc(${side === "left" ? -1 : 1} * (100% + var(--zzlib-float-gap, 10px)) * ${hidden}))`;
      lib.style.removeProperty("opacity");
    }
  }
  let unpatch = null;
  customElements.whenDefined("zen-library").then(Lib => {
    if (window[INSTANCE_KEY] !== instance) return;
    const proto = Lib.prototype, original = Object.getOwnPropertyDescriptor(proto, "openProgress");
    Object.defineProperty(proto, "openProgress", {
      configurable: true,
      enumerable: original.enumerable,
      get: original.get,
      set(value) {
        original.set.call(this, value);
        try { place(this, value); } catch (e) { console.error(e); }
      },
    });
    unpatch = () => Object.defineProperty(proto, "openProgress", original);
    replace();
  }).catch(() => {});
  // Re-run Zen's setter at the current progress so a changed setting shows at once.
  function replace() {
    const lib = libraryNode();
    if (lib) lib.openProgress = lib.openProgress;
  }

  // ---- Recent downloads ----
  const foot = () => document.getElementById("zen-sidebar-foot-buttons");
  const stackOpen = () => !!foot()?.hasAttribute("zen-library-stack-open");
  const stackMode = () => pref("zzlib.stack.open", 0);   // 0 hover (Zen's), 1 click, 2 never
  let letEnter = false;
  // Zen opens the list on the button's mouseenter. Stop it on its way down,
  // except for the one the script sends on click, and while the list is up
  // (so moving back onto the button keeps it open).
  function onEnter(event) {
    if (letEnter || event.target?.id !== "zen-library-button") return;
    const mode = stackMode();
    if (mode == 0 || (mode == 1 && stackOpen())) return;
    event.stopImmediatePropagation();
  }
  // On click the button drops Zen's command, so its click arrives here first.
  function syncButton() {
    const button = document.getElementById("zen-library-button");
    if (!button) return;
    if (stackMode() == 1) button.removeAttribute("command");
    else if (!button.hasAttribute("command")) button.setAttribute("command", "cmd_zenToggleLibrary");
  }
  function onCommand(event) {
    const button = event.target;
    if (button?.id !== "zen-library-button" || button.hasAttribute("command")) return;
    const anyShown = document.querySelector("#zen-library-download-list > .zen-library-download-list-download:not([hidden])");
    if (!stackOpen() && anyShown && !Library()?.isLibraryOpen) {
      letEnter = true;
      try { button.dispatchEvent(new MouseEvent("mouseenter")); } finally { letEnter = false; }
    } else {
      document.getElementById("cmd_zenToggleLibrary")?.doCommand();
    }
  }
  function onDown(event) {
    const target = event.originalTarget?.nodeType === 1 ? event.originalTarget : event.originalTarget?.parentElement;
    if (target?.closest("#zen-library-button")) syncButton();
    if (!floating() || !pref("zzlib.float.click-away", true) || !Library()?.isLibraryOpen) return;
    if (target?.closest('zen-library, #zen-library-button, menupopup, panel, [class*="zen-library-media-preview"]')) return;
    Library().close();
  }
  window.addEventListener("mouseenter", onEnter, true);
  window.addEventListener("command", onCommand, true);
  window.addEventListener("mousedown", onDown, true);

  // Zen builds four rows and fills them with the newest downloads. Above
  // four, older ones get rows of the same make above Zen's, filled here.
  // ponytail: these extra rows open on click but have no context menu or drag; add both if they are missed.
  const EXTRA = "zzlib-extra";
  let downloads = [], data = null, view = null;
  const lazy = {};
  function watchDownloads() {
    if (view || pref("zzlib.stack.count", 4) <= 4) return;
    ChromeUtils.defineESModuleGetters(lazy, {
      DownloadsCommon: "moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs",
      DownloadsViewUI: "moz-src:///browser/components/downloads/DownloadsViewUI.sys.mjs",
      DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
      BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
    });
    view = {
      onDownloadBatchStarting() {},
      onDownloadBatchEnded() { if (stackOpen()) fillExtras(); },
      onDownloadAdded(download, { insertBefore } = {}) {
        const at = insertBefore ? downloads.indexOf(insertBefore) : -1;
        if (at < 0) downloads.push(download); else downloads.splice(at, 0, download);
        if (stackOpen()) fillExtras();
      },
      onDownloadChanged() { if (stackOpen()) fillExtras(); },
      onDownloadRemoved(download) {
        const at = downloads.indexOf(download);
        if (at >= 0) downloads.splice(at, 1);
        if (stackOpen()) fillExtras();
      },
    };
    data = lazy.DownloadsCommon.getData(window, true);
    data.addView(view);
  }
  function status(download) {
    const strings = lazy.DownloadsCommon.strings, total = download.hasProgress ? download.totalBytes : -1;
    const join = (...parts) => parts.filter(Boolean).reduce((a, b) => strings.statusSeparator(a, b));
    if (!download.stopped) return lazy.DownloadUtils.getDownloadStatus(download.currentBytes, total, download.speed)[0];
    if (download.deleted) return strings.fileDeleted;
    if (download.succeeded) {
      if (!download.target.exists) return strings.fileMovedOrMissing;
      const url = URL.parse(download.source.url);
      const host = url ? lazy.BrowserUtils.formatURIForDisplay(Services.io.newURI(url.href), { onlyBaseDomain: true }) : "";
      return join(lazy.DownloadsViewUI.getSizeWithUnits(download), host, lazy.DownloadUtils.getReadableDates(new Date(download.endTime))[0]);
    }
    if (download.canceled && download.hasPartialData) return join(strings.statePaused, lazy.DownloadUtils.getTransferTotal(download.currentBytes, total));
    return download.canceled ? strings.stateCanceled : strings.stateFailed;
  }
  function makeRow() {
    const row = window.MozXULElement.parseXULToFragment(`
      <div class="zen-library-download-list-download ${EXTRA}">
        <span class="zen-library-download-badge no-squircles"><span class="zen-library-download-progress no-squircles"></span></span>
        <vbox class="zen-library-download-list-title-container">
          <span class="zen-library-download-list-title"></span>
          <span class="zen-library-download-list-subtitle"></span>
        </vbox>
      </div>`).firstElementChild;
    row.addEventListener("click", event => {
      const download = row.download;
      if (event.button !== 0 || !download?.stopped) return;
      if (download.succeeded) lazy.DownloadsCommon.openDownload(download).catch(console.error);
      else if (download.source?.url) window.openTrustedLinkIn(download.source.url, "tab");
    });
    return row;
  }
  function fillExtras() {
    const list = document.getElementById("zen-library-download-list");
    if (!list) return;
    const want = view ? Math.max(0, Math.min(8, pref("zzlib.stack.count", 4)) - 4) : 0;
    const older = want ? downloads.slice(0, -4).slice(-want) : [];   // oldest first, like Zen's rows
    const rows = [...list.querySelectorAll(`:scope > .${EXTRA}`)];
    while (rows.length > older.length) rows.shift().remove();
    while (rows.length < older.length) { const row = makeRow(); list.prepend(row); rows.unshift(row); }
    older.forEach((download, i) => {
      const row = rows[i], badge = row.querySelector(".zen-library-download-badge"), pending = !download.stopped || (download.canceled && download.hasPartialData);
      row.download = download;
      row.style.setProperty("--zen-library-entry-index", older.length - i + 3);   // rises after Zen's four
      row.toggleAttribute("downloading", !download.stopped);
      badge.toggleAttribute("downloading", pending);
      const path = download.target.path;
      badge.style.setProperty("--download-image", path ? `url('moz-icon://${path}?size=32${download.succeeded ? "&state=normal" : ""}')` : "url('moz-icon://.unknown?size=32')");
      badge.firstElementChild.style.setProperty("--value", download.hasProgress ? download.progress : 0);
      row.querySelector(".zen-library-download-list-title").textContent = path ? PathUtils.filename(path) : download.source.url;
      row.querySelector(".zen-library-download-list-subtitle").textContent = status(download);
    });
    measure(list);
  }
  // Zen masks the tab list down to the list's height, measured when a
  // download changes; rows added or hidden here change that height.
  function measure(list) {
    window.promiseDocumentFlushed(() => list.getBoundingClientRect().height).then(height => {
      document.getElementById("TabsToolbar-customization-target")?.style.setProperty("--zen-library-stack-height", `${height}px`);
    }).catch(() => {});
  }
  const footWatch = new MutationObserver(() => { if (stackOpen()) { watchDownloads(); fillExtras(); } });
  // The list may be built after this runs; watch the attribute wherever it lands.
  footWatch.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["zen-library-stack-open"] });

  // ---- Get the Library ready after startup ----
  // Zen builds the Library the first time it opens, so the first open of a
  // session waits on loading its code and stylesheet and building its page.
  // 2 builds it once the browser has settled (the page then stays built,
  // and up to date, until the Library is first opened and closed, as Zen
  // keeps it for 30 seconds after any close); 1 only loads the code and
  // stylesheet; 0 leaves it to Zen.
  const SECTIONS = ["History", "Downloads", "Boosts", "Media", "Spaces"];
  let warmTimer = null, warmIdle = null, preload = null;
  function warmLibrary() {
    warmIdle = null;
    const how = pref("zzlib.warm", 2);
    if (window[INSTANCE_KEY] !== instance || !how || !pref("zen.library.enabled", true) || libraryNode()) return;
    const load = url => ChromeUtils.importESModule(url, { global: "current" });
    try {
      if (how == 2) {
        (Library() ?? load("moz-src:///zen/library/ZenLibrary.mjs").ZenLibrary).getInstance();
        return;
      }
      for (const name of SECTIONS) load(`moz-src:///zen/library/sections/ZenLibrary${name}Section.mjs`);
      preload = document.createElementNS("http://www.w3.org/1999/xhtml", "link");
      Object.assign(preload, { rel: "preload", as: "style", href: "chrome://browser/content/zen-styles/zen-library.css" });
      document.documentElement.appendChild(preload);
    } catch (e) { console.error(e); }
  }
  warmTimer = setTimeout(() => { warmIdle = window.requestIdleCallback(warmLibrary, { timeout: 5000 }); }, 4000);

  const onSetting = name => {
    if (name.startsWith("zzlib.float.")) replace();
    if (name === "zzlib.stack.open") syncButton();
    if (name.startsWith("zzlib.stack.")) { watchDownloads(); fillExtras(); }
  };
  const observer = { observe(_s, _t, data) { if (data?.startsWith(PREFIX)) { write(data); try { onSetting(data); } catch (e) { console.error(e); } } } };
  const sideObserver = { observe() { replace(); } };
  writeAll();
  seedDefaults().catch(() => {});
  syncButton();
  Services.prefs.addObserver(PREFIX, observer);
  Services.prefs.addObserver("zen.tabs.vertical.right-side", sideObserver);
  const cleanup = () => {
    try { Services.prefs.removeObserver(PREFIX, observer); } catch {}
    try { Services.prefs.removeObserver("zen.tabs.vertical.right-side", sideObserver); } catch {}
    window.removeEventListener("mouseenter", onEnter, true);
    window.removeEventListener("command", onCommand, true);
    window.removeEventListener("mousedown", onDown, true);
    footWatch.disconnect();
    clearTimeout(warmTimer);
    if (warmIdle) window.cancelIdleCallback(warmIdle);
    preload?.remove();
    try { data?.removeView(view); } catch {}
    for (const row of document.querySelectorAll(`#zen-library-download-list > .${EXTRA}`)) row.remove();
    document.getElementById("zen-library-button")?.setAttribute("command", "cmd_zenToggleLibrary");
    try { unpatch?.(); } catch {}
    const lib = libraryNode();
    if (lib?.hasAttribute("zzlib-float")) {
      lib.removeAttribute("zzlib-float");
      lib.style.removeProperty("opacity");
      lib.openProgress = lib.openProgress;
    }
    if (window[INSTANCE_KEY] === instance) delete window[INSTANCE_KEY];
  };
  instance.retire = cleanup;
  window.addEventListener("unload", cleanup, { once: true });
  try { window.addUnloadListener?.(cleanup); } catch {}   // Sine disable or update
})();
