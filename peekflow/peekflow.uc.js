// ==UserScript==
// @name           Peekflow
// @description    Places Zen's tab hover preview and remembers how unloaded tabs looked.
// @include        chrome://browser/content/browser.xhtml
// @version        1.2.0
// ==/UserScript==

(() => {
  "use strict";

  // One copy per window: a second injection retires the first.
  const INSTANCE_KEY = "__zzpeekInstance";
  try { window[INSTANCE_KEY]?.retire?.(); } catch {}
  const instance = { retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const P = "zzpeek.", S = Services.prefs, HTML = "http://www.w3.org/1999/xhtml";
  const bool = (k, d) => { try { return S.getBoolPref(P + k, d); } catch { return d; } };
  const num = (k, d) => { try { return S.getIntPref(P + k, d); } catch { return d; } };
  const gap = () => { let v = NaN; try { v = parseFloat(S.getStringPref(P + "gap", "6")); } catch {} return Number.isFinite(v) ? v : 6; };

  // ---- Firefox's own switches ----------------------------------------------
  // The preview and its picture are Firefox prefs. Peekflow sets them from its
  // own settings and, when Sine turns Peekflow off, puts back what was there.
  const OWNED = { "browser.tabs.hoverPreview.enabled": "show", "browser.tabs.hoverPreview.showThumbnails": "pictures" };
  function syncFirefox(release) {
    for (const [pref, key] of Object.entries(OWNED)) {
      const saved = P + "saved." + key;
      try {
        if (release) {
          if (S.prefHasUserValue(saved)) { S.setBoolPref(pref, S.getBoolPref(saved)); S.clearUserPref(saved); }
          continue;
        }
        if (!S.prefHasUserValue(saved)) S.setBoolPref(saved, S.getBoolPref(pref, false));
        if (S.getBoolPref(pref, false) !== bool(key, true)) S.setBoolPref(pref, bool(key, true));
      } catch {}
    }
  }

  // ---- where the preview opens ---------------------------------------------
  // Anchor corner, then the preview's own corner, as XUL popups take them.
  const PLACES = {
    1: ["rightcenter leftcenter", 1, 0], 2: ["leftcenter rightcenter", -1, 0],
    3: ["topcenter bottomcenter", 0, -1], 4: ["bottomcenter topcenter", 0, 1],
    5: ["topright bottomleft", 1, -1], 6: ["topleft bottomright", -1, -1],
    7: ["bottomright topleft", 1, 1], 8: ["bottomleft topright", -1, 1],
  };

  // ---- last views of unloaded tabs -------------------------------------------
  // A tab is photographed once its first load finishes, and again as you
  // leave it after looking at it, while it is still loaded. Pictures
  // are small JPEG blobs held in memory against the tab: closing the tab or
  // the window drops them, and nothing is written to disk.
  const shots = new WeakMap();
  // A picture of a loaded tab at the preview's size, or null.
  async function capture(tab) {
    const canvas = document.createElementNS(HTML, "canvas"), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(280 * dpr); canvas.height = Math.round(140 * dpr);
    try { return (await window.PageThumbs.captureTabPreviewThumbnail(tab.linkedBrowser, canvas)) ? canvas : null; }
    catch { return null; }
  }
  async function photograph(tab) {
    if (!tab?.linkedBrowser || tab.closing || tab.hasAttribute("pending") || !bool("last-view", true)) return;
    (await capture(tab))?.toBlob(blob => { if (blob && !retired) shots.set(tab, { blob, at: Date.now() }); }, "image/jpeg", 0.82);
  }
  // Only a tab you actually looked at (selected for a second or more) is
  // photographed, at an idle moment: scrolling through tabs takes none.
  const LOOKED_MS = 1000;
  let selectedAt = Date.now();
  const onSelect = event => {
    const prev = event.detail?.previousTab, looked = Date.now() - selectedAt >= LOOKED_MS;
    selectedAt = Date.now();
    if (prev && looked) window.requestIdleCallback(() => photograph(prev), { timeout: 1500 });
  };
  // A tab's first finished load is photographed too, so one opened in the
  // background and unloaded before you looked at it still has a picture.
  const onLoaded = event => {
    const tab = event.target;
    if (!event.detail?.changed?.includes("busy") || tab.hasAttribute?.("busy") || shots.has(tab)) return;
    window.requestIdleCallback(() => { if (!shots.has(tab)) photograph(tab); }, { timeout: 3000 });
  };

  // ---- the preview panel ------------------------------------------------------
  let tabPanel = null, panel = null, current = null, retired = false;
  let shotImg = null, shotTab = null, shotURL = null;
  // Firefox shows the selected tab without a picture, as you are looking at
  // it; Peekflow takes one as you point at it, shown and not kept.
  let live = null;                          // { tab, canvas }
  const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  function since(ms) {
    const s = (ms - Date.now()) / 1000;
    for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
      if (Math.abs(s) >= size) return ago.format(Math.round(s / size), unit);
    }
    return "just now";
  }
  // After Firefox fills the preview: an unloaded tab gets its last view and a
  // line saying it is unloaded and when it was last used.
  function dress() {
    const tab = current;
    if (!panel || !tab) return;
    const box = panel.querySelector(".tab-preview-thumbnail-container");
    const text = panel.querySelector(".tab-preview-text-container");
    const unloaded = tab.hasAttribute("pending") || tab.hasAttribute("discarded"), selected = tab.selected;
    const shot = unloaded && !selected && bool("pictures", true) && bool("last-view", true) ? shots.get(tab) : null;
    let picture = selected && live?.tab === tab ? live.canvas : null;
    if (shot) {
      if (shotTab !== tab) {
        if (shotURL) URL.revokeObjectURL(shotURL);
        shotURL = URL.createObjectURL(shot.blob);
        shotImg ??= Object.assign(document.createElementNS(HTML, "img"), { className: "zzpeek-shot", alt: "" });
        shotImg.src = shotURL;
        shotTab = tab;
      }
      picture = shotImg;
    }
    if (box && picture) {
      if (box.firstChild !== picture) box.replaceChildren(picture);
      box.classList.remove("hide-thumbnail");
    }
    for (const own of [shotImg, live?.canvas]) if (own && own !== picture && own.isConnected) own.remove();
    let line = text?.querySelector(":scope > .zzpeek-seen");
    if (text && !line) {
      line = Object.assign(document.createElementNS(HTML, "div"), { className: "zzpeek-seen" });
      text.append(line);
    }
    if (line) {
      const used = shot?.at ?? tab.lastAccessed;
      line.hidden = !unloaded && !selected;
      line.textContent = selected ? "Current tab" : !unloaded ? "" : Number.isFinite(used) && used > 0
        ? `Unloaded · ${shot ? "seen" : "last used"} ${since(used)}` : "Unloaded";
    }
  }
  function adopt() {
    if (tabPanel || !bool("show", true)) return;
    const strip = gBrowser.tabContainer;
    try { strip.ensureTabPreviewPanelLoaded?.(); } catch {}
    tabPanel = strip.previewPanel?.tabPanel ?? null;
    panel = document.getElementById("tab-preview-panel");
    if (!tabPanel || !panel) { tabPanel = null; return; }
    const own = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tabPanel), "popupOptions")?.get;
    Object.defineProperty(tabPanel, "popupOptions", {
      configurable: true,
      get() {
        const place = PLACES[num("place", 0)];
        if (!place) return own.call(this);
        const g = gap();
        return { position: place[0], x: place[1] * g, y: place[2] * g };
      },
    });
    const activate = Object.getPrototypeOf(tabPanel).activate;
    tabPanel.activate = function (tab) {
      current = tab;
      if (live?.tab !== tab) live = null;
      if (tab?.selected && !tab.hasAttribute("pending") && bool("pictures", true)) {
        capture(tab).then(canvas => {
          if (!canvas || retired || current !== tab) return;
          canvas.className = "zzpeek-shot";
          live = { tab, canvas };
          dress();
        });
      }
      return activate.call(this, tab);
    };
    panel.addEventListener("TabPreviewUpdated", dress);
  }
  function release() {
    if (tabPanel) {
      delete tabPanel.popupOptions;
      delete tabPanel.activate;
    }
    panel?.removeEventListener("TabPreviewUpdated", dress);
    panel?.querySelectorAll(".zzpeek-seen").forEach(n => n.remove());
    shotImg?.remove();
    if (shotURL) URL.revokeObjectURL(shotURL);
    tabPanel = panel = current = shotImg = shotTab = shotURL = live = null;
  }

  const observer = { observe(_, __, name) { if (!name.startsWith(P + "saved.")) { syncFirefox(false); adopt(); } } };
  function start() {
    syncFirefox(false);
    adopt();
    S.addObserver(P, observer);
    window.addEventListener("TabSelect", onSelect, true);
    window.addEventListener("TabAttrModified", onLoaded, true);
  }
  function cleanup() {
    if (retired) return;
    retired = true;
    try { S.removeObserver(P, observer); } catch {}
    window.removeEventListener("TabSelect", onSelect, true);
    window.removeEventListener("TabAttrModified", onLoaded, true);
    release();
  }
  instance.retire = cleanup;
  window.addEventListener("unload", cleanup, { once: true });
  // Sine turning the mod off: also hand Firefox's switches back.
  try { window.addUnloadListener?.(() => { cleanup(); syncFirefox(true); }); } catch {}

  if (window.gBrowserInit?.delayedStartupFinished) start();
  else {
    const obs = (subject) => {
      if (subject !== window) return;
      Services.obs.removeObserver(obs, "browser-delayed-startup-finished");
      if (!retired) start();
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
  }
})();
