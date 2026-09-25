// ==UserScript==
// @name           Glassflow
// @description    Writes Glassflow's preference variables at startup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window. instance.retire is the
  // pending startup observer until start() swaps in the real cleanup.
  const INSTANCE_KEY = "__zzglassInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzglass.";


  // ---- pref variables at startup -----------------------------------------
  // Sine injects mod prefs as CSS variables, and current versions do it for
  // every chrome window as it opens rather than only after the settings
  // page or a reload (which is what made configured values appear only
  // after a reload on older ones). Two reasons this still writes its own:
  // that injection covers string prefs and dropdowns that ask for it, not
  // the integer prefs behind every numeric dropdown here; and it lands
  // after an async read of the mod store, where these are set synchronously
  // as the script loads, before first paint.
  //
  // Naming matches Sine's own convention exactly: PREFIX.foo-bar becomes
  // --PREFIX-foo-bar, dots to dashes. Booleans are skipped -- those are read
  // with -moz-pref(), never as variables.
  function injectPrefVars() {
    let names = [];
    try { names = Services.prefs.getBranch(PREFIX).getChildList(""); } catch { return; }
    const root = document.documentElement;
    for (const leaf of names) {
      const full = PREFIX + leaf;
      const value = readPrefValue(full);
      if (value === null) continue;
      try {
        root.style.setProperty("--" + full.replace(/\./g, "-"), value);
      } catch {}
    }
  }

  // The type is CHECKED, never guessed by attempting reads: calling
  // getStringPref on a boolean throws NS_ERROR_UNEXPECTED, and Firefox logs
  // every one of those even when it is caught -- which floods the console
  // with "failed to read pref" for every boolean in the branch. Booleans are
  // skipped entirely; they are read with -moz-pref(), never as variables.
  function readPrefValue(full) {
    const P = Services.prefs;
    let type;
    try { type = P.getPrefType(full); } catch { return null; }
    try {
      if (type === P.PREF_STRING) {
        const v = P.getStringPref(full);
        return v === "" ? null : v;     // empty would invalidate a declaration
      }
      if (type === P.PREF_INT) return String(P.getIntPref(full));
    } catch {}
    return null;                        // booleans and unknown types
  }


  // ---- instant UI animations ---------------------------------------------
  // Zen animates its interface through its vendored Motion library, which
  // exposes a global switch: with instantAnimations set, every animation jumps
  // straight to its final frame. This is the real lever -- no zen.animations
  // pref exists. It is a LOOK change, which is why it lives here and not in a
  // performance mod. In-memory, applies live, reverts live, touches nothing on
  // web pages.
  //
  // Restored: cd192ee deleted this body while leaving both call sites, so
  // start() threw ReferenceError on every window from then on. See the note
  // on startOnce() for why that took the other four mods down with it.
  let instantOverride = null;
  function restoreInstantUI() {
    if (!instantOverride) return;
    const { cfg, value, had } = instantOverride;
    if (cfg.instantAnimations === true) {
      if (had) cfg.instantAnimations = value;
      else delete cfg.instantAnimations;
    }
    instantOverride = null;
  }
  function syncInstantUI() {
    const cfg = window.Motion?.MotionGlobalConfig;
    if (!cfg) return;                      // not on this build; nothing to do
    let want = false;
    try { want = Services.prefs.getBoolPref(PREFIX + "instant-ui", false); } catch {}
    if (!want) { restoreInstantUI(); return; }
    if (!instantOverride) {
      instantOverride = { cfg, value: cfg.instantAnimations,
        had: Object.hasOwn(cfg, "instantAnimations") };
      cfg.instantAnimations = true;
    }
  }

  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
      if (data === PREFIX + "instant-ui") { syncInstantUI(); return; }
      const name = "--" + data.replace(/\./g, "-");
      const value = readPrefValue(data);
      try {
        if (value === null) document.documentElement.style.removeProperty(name);
        else document.documentElement.style.setProperty(name, value);
      } catch {}
      if (["sidebar.enabled", "sidebar.sample", "sidebar.sample-interval", "sidebar.blur",
           "sidebar.blur-through-transparent", "sidebar.blur-radius", "sidebar.blur-radius-corner"].some(k => data === PREFIX + k)) {
        if (sampleTimer) { clearTimeout(sampleTimer); sampleTimer = null; }
        syncSampling();
      } else trackNativeBlur(); // Shared corner/radius controls also affect the mask.
    },
  };


  // ---- sampled sidebar glass ----------------------------------------------
  // Optional snapshot fallback when native sidebar blur is insufficient.
  // Read the visible page at a small scale and paint it behind the panel.
  // This captures page pixels, not the complete composed window backdrop.
  // Native-only mode (sidebar.sample=false) needs no snapshot loop.
  const SAMPLE_SCALE = 0.1;                   // the viewport at a tenth
  let sampleTimer = null;
  let warmSampleTimer = null;
  let sampleChain = 0;                        // which chain owns sampleTimer
  let samplingEpoch = 0;                      // invalidates reads across cleanup
  let sampleMs = 250, lastPush = 0, frames = 0;
  const FAST_MS = 80;                         // read rate while the strip keeps changing (a scroll, a video)
  let sampleObserver = null;
  let sampleSig = null;
  let sampling = false;
  let lastSample = null;                      // { panel, at }: the panel's last settled box, for warm reads
  let opaquePage = null;                      // settled strip-opacity heuristic
  let opaqueLast = null;                      // the read before, for the two-in-a-row rule

  const isPrivate = () => {
    try {
      return ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
        .PrivateBrowsingUtils.isWindowPrivate(window);
    } catch { return false; }
  };
  // Forget the page the moment the user asks the browser to forget it.
  const purgeObserver = () => { try { clearSample(); } catch {} };

  // #titlebar is the floating panel in compact mode; the sample hangs on it.
  const sidebarEl = () => document.getElementById("titlebar");
  const SIDEBAR_SHOW_ATTRS = ["zen-has-hover", "zen-user-show", "zen-has-empty-tab",
    "flash-popup", "has-popup-menu", "movingtab", "zen-compact-mode-active"];
  const sidebarShown = () => {
    const root = document.documentElement, tb = document.getElementById("navigator-toolbox");
    return root.getAttribute("zen-compact-mode") === "true" && !!tb &&
      !root.hasAttribute("customizing") && root.getAttribute("inDOMFullscreen") !== "true" &&
      (SIDEBAR_SHOW_ATTRS.some(a => tb.hasAttribute(a)) || root.getAttribute("zen-renaming-tab") === "true");
  };

  // The layout already computed, rather than forcing a fresh one. Zen
  // switched its own measurements to this in the Firefox 156 sync. Every
  // read through here happens once the panel has settled, so there is
  // nothing newer to miss; placeLayers() below keeps the exact call,
  // because it runs DURING the slide and a frame of lag there is the
  // picture drifting behind the panel.
  const boxOf = (el) => {
    if (!el) return null;
    try { return window.windowUtils.getBoundsWithoutFlushing(el); }
    catch { return el.getBoundingClientRect(); }
  };

  // Native content-side blur for transparent pages. Replace only the covered
  // strip of SourceGraphic; preserving alpha lets the chrome backdrop show
  // through. Firefox repaints the filter as content changes: no readbacks,
  // PNGs or polling. Geometry tracking stops once the sidebar settles.
  let nativeSVG = null, nativeFilter, nativeBlur, nativeMask, nativeBox;
  let nativeRaf = 0, nativeResize = null, nativeGeometry = "";
  function updateNativeBlur() {
    const pref = k => Services.prefs.getBoolPref(PREFIX + k, false);
    const box = document.getElementById("tabbrowser-tabbox");
    const on = box && !document.hidden && sidebarShown() && pref("sidebar.enabled") &&
      pref("sidebar.blur") && pref("sidebar.blur-through-transparent") && !sampleOn();
    if (!on) {
      nativeBox?.removeAttribute("zzglass-native-strip");
      nativeGeometry = "";
      return "";
    }
    const panel = document.getElementById("zen-toolbar-background") ?? sidebarEl();
    const r = panel.getBoundingClientRect(), b = box.getBoundingClientRect();
    const width = b.right - b.left, height = b.bottom - b.top;
    const x = r.left - b.left, y = r.top - b.top, w = r.right - r.left, h = r.bottom - r.top;
    if (width <= 0 || height <= 0 || w <= 0 || h <= 0 || x >= width || y >= height || x + w <= 0 || y + h <= 0) {
      nativeBox?.removeAttribute("zzglass-native-strip");
      nativeGeometry = "";
      return "";
    }
    const css = getComputedStyle(panel);
    const requested = parseFloat(css.getPropertyValue("--zzglass-sidebar-blur-radius"));
    const radius = Math.max(0, Math.min(80, Number.isFinite(requested) ? requested : 25));
    const corner = Math.max(0, parseFloat(css.borderTopLeftRadius) || 0);
    const geometry = [x, y, w, h, width, height, radius, corner].join(",");
    if (geometry === nativeGeometry) return geometry;
    if (!nativeSVG) {
      const ns = "http://www.w3.org/2000/svg";
      const add = (parent, tag, attrs) => {
        const el = parent.appendChild(document.createElementNS(ns, tag));
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
      };
      nativeSVG = document.createElementNS(ns, "svg");
      nativeSVG.style.cssText = "position:absolute;width:0;height:0;pointer-events:none";
      nativeSVG.setAttribute("aria-hidden", "true");
      nativeFilter = add(nativeSVG, "filter", { id: "zzglass-native-strip-filter", x: 0, y: 0,
        filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
      nativeBlur = add(nativeFilter, "feGaussianBlur", { in: "SourceGraphic", result: "blurred" });
      nativeMask = add(nativeFilter, "feImage", { result: "mask", preserveAspectRatio: "none" });
      add(nativeFilter, "feComposite", { in: "blurred", in2: "mask", operator: "in", result: "inside" });
      add(nativeFilter, "feComposite", { in: "SourceGraphic", in2: "mask", operator: "out", result: "outside" });
      // Add complementary masks, including their antialiased edges.
      add(nativeFilter, "feComposite", { in: "inside", in2: "outside", operator: "arithmetic", k2: 1, k3: 1 });
      (document.body ?? document.documentElement).appendChild(nativeSVG);
    }
    nativeFilter.setAttribute("width", width); nativeFilter.setAttribute("height", height);
    nativeBlur.setAttribute("stdDeviation", radius);
    // Only the blurred result near the covered strip is needed.
    nativeBlur.setAttribute("x", x - 3 * radius); nativeBlur.setAttribute("y", y - 3 * radius);
    nativeBlur.setAttribute("width", w + 6 * radius); nativeBlur.setAttribute("height", h + 6 * radius);
    for (const [k, v] of Object.entries({ x, y, width: w, height: h })) nativeMask.setAttribute(k, v);
    const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="${corner}" fill="white"/></svg>`;
    const href = "data:image/svg+xml," + encodeURIComponent(mask);
    if (nativeMask.getAttribute("href") !== href) nativeMask.setAttribute("href", href);
    nativeBox = box;
    box.setAttribute("zzglass-native-strip", "");
    nativeGeometry = geometry;
    return geometry;
  }
  function trackNativeBlur() {
    cancelAnimationFrame(nativeRaf);
    const began = Date.now(), deadline = began + 1500;
    let last = null, still = 0;
    const step = () => {
      nativeRaf = 0;
      const geometry = updateNativeBlur();
      still = geometry === last ? still + 1 : 0;
      last = geometry;
      if (geometry && (still < 2 || Date.now() - began < 250) && Date.now() < deadline) nativeRaf = requestAnimationFrame(step);
    };
    step();
  }

  // The part of the page's box a panel box covers, in chrome px from the
  // page's top left; bw is the page box's width, to scale into the picture.
  function overlap(panel) {
    const browser = gBrowser?.selectedBrowser;
    if (!panel || !browser) return null;
    const b = boxOf(browser);
    const left = Math.max(panel.left, b.left), top = Math.max(panel.top, b.top);
    const right = Math.min(panel.right, b.right), bottom = Math.min(panel.bottom, b.bottom);
    if (right - left < 8 || bottom - top < 8) return null;
    return { x: left - b.left, y: top - b.top, width: right - left, height: bottom - top, bw: b.right - b.left };
  }

  // The picture lives on an element of our own, first child of the panel,
  // and an attribute on the panel says one is up. Zen animates the panel
  // and rewrites its style; neither touches a child we own or an attribute.
  let sampleEl = null;
  let lastError = null;
  // Two layers inside the host; a new frame fades in over the old one, so
  // a video behind the panel reads as moving blur rather than a slideshow.
  const XH = "http://www.w3.org/1999/xhtml";
  let layers = [];
  let front = 0;
  function sampleHost() {
    const tb = sidebarEl();
    if (!tb) return null;
    if (!sampleEl || !sampleEl.isConnected) {
      sampleEl = document.getElementById("zzglass-sample") || document.createElementNS(XH, "div");
      sampleEl.id = "zzglass-sample";
      if (!sampleEl.children.length) {
        layers = [0, 1].map(() => sampleEl.appendChild(document.createElementNS(XH, "div")));
      } else layers = [...sampleEl.children];
      if (sampleEl.parentNode !== tb) tb.insertBefore(sampleEl, tb.firstChild);
    }
    return sampleEl;
  }
  const urls = [null, null];
  function clearSample() {
    samplingEpoch++;
    sampling = false;
    try { sidebarEl()?.removeAttribute("zzglass-sample"); } catch {}
    for (const l of layers) { try { l.style.backgroundImage = ""; l.removeAttribute("front"); } catch {} }
    try { sampleEl?.removeAttribute("zzglass-fade"); } catch {}
    for (let i = 0; i < 2; i++) if (urls[i]) { try { URL.revokeObjectURL(urls[i]); } catch {} urls[i] = null; }
    sampleSig = null;
  }

  // The picture is the WHOLE viewport, laid over the page's own box (the
  // host clips it to the panel). So it never has to be cropped to where
  // the panel is: the panel sliding across it uncovers a picture that
  // stays put, like a window, and the settled read after a slide is the
  // same picture -- no new frame, nothing to fade. Returns the host's box.
  function placeLayers() {
    const host = sampleEl, browser = gBrowser?.selectedBrowser;
    if (!host?.isConnected || !browser) return null;
    const h = host.getBoundingClientRect(), b = browser.getBoundingClientRect();
    const css = { left: b.left - h.left, top: b.top - h.top, width: b.right - b.left, height: b.bottom - b.top };
    for (const l of layers) for (const k in css) {
      const value = css[k].toFixed(2) + "px";
      if (l.style[k] !== value) l.style[k] = value;
    }
    return h;
  }
  // Zen slides the panel with a plain CSS transition (no attribute marks
  // it), so a read taken then would crop a strip the panel is only
  // passing over. The picture is re-placed every frame until the panel
  // has held still for two, and only then is the strip beneath it read.
  let trackRaf = 0;
  function track() {
    cancelAnimationFrame(trackRaf);
    let last = null, still = 0;
    const step = () => {
      const h = placeLayers();
      if (h && last && Math.abs(h.left - last.left) < 0.01 && Math.abs(h.top - last.top) < 0.01) still++; else still = 0;
      last = h;
      if (!h || still >= 2) { trackRaf = 0; if (h && sampleTimer) sampleOnce(); return; }
      trackRaf = requestAnimationFrame(step);
    };
    trackRaf = requestAnimationFrame(step);
  }

  // warm: a read taken while the panel is hidden or about to slide in, at
  // the strip it covered last, so the frame is up before the slide.
  let ticks = 0, samplingSince = 0;
  async function sampleOnce(warm = false) {
    if (!sampleOn() || document.hidden || (isPrivate() && !sidebarShown())) return false;
    // A read that never came back (a tab torn down mid-snapshot) must not
    // wedge every read after it.
    if (sampling && Date.now() - samplingSince > 2000) sampling = false;
    if (sampling) return;
    const epoch = ++samplingEpoch;
    if (trackRaf && !warm) return;            // still sliding; track() reads once it settles
    const panel = warm ? (lastSample?.panel ?? (sidebarShown() ? boxOf(sidebarEl()) : null))
                       : boxOf(sidebarEl());
    // No overlap right now (docked, or the panel has not been over the page
    // yet): keep the frames that are up, so the next show has one at once.
    const strip = overlap(panel);
    if (!strip) return;
    sampling = true; samplingSince = Date.now(); ticks++;
    lastSample = { panel, at: Date.now() };
    try {
      const wg = gBrowser.selectedBrowser.browsingContext?.currentWindowGlobal;
      if (!wg?.drawSnapshot) return;
      const current = () => epoch === samplingEpoch && !document.hidden &&
        gBrowser.selectedBrowser.browsingContext?.currentWindowGlobal === wg;
      // A rect given to drawSnapshot is taken relative to the PAGE, not the
      // visible viewport; null is the viewport as seen. At a tenth scale
      // the whole viewport is a couple of hundred pixels a side.
      const bmp = await wg.drawSnapshot(null, SAMPLE_SCALE, "transparent");
      if (!current()) { bmp.close(); return false; }
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      // Only the strip under the panel says whether anything changed and
      // whether the page is see-through; the rest of the viewport may
      // play a video without a frame being pushed for it.
      const k = c.width / strip.bw;                     // picture px per chrome px
      const cx = Math.min(c.width - 1, Math.floor(strip.x * k)), cy = Math.min(c.height - 1, Math.floor(strip.y * k));
      const cw = Math.max(1, Math.min(c.width - cx, Math.ceil(strip.width * k)));
      const ch = Math.max(1, Math.min(c.height - cy, Math.ceil(strip.height * k)));
      const px = ctx.getImageData(cx, cy, cw, ch).data;
      // Prefer native blur when the strip is mostly opaque. This is an
      // opacity heuristic, not a test of compositor/backdrop availability.
      // Every pixel, colour and alpha: on a see-through page most pixels
      // are transparent black, so a sparse sample of one channel missed a
      // scroll entirely.
      let sig = 0, solid = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        // Preserve channel order: red and green with equal brightness differ.
        const rgba = (px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3];
        sig = (Math.imul(sig, 31) + rgba) | 0;
        n++; if (px[i + 3] === 255) solid++;
      }
      // Two reads in a row have to agree before the panel flips between the
      // backdrop blur and the sample; a single borderline read is not a
      // reason to blink.
      const opaqueNow = solid / n > 0.97;
      if (opaquePage === null || opaqueNow === opaqueLast) opaquePage = opaqueNow;
      opaqueLast = opaqueNow;
      if (opaquePage) { if (sidebarEl()?.hasAttribute("zzglass-sample")) clearSample(); return; }
      // Unchanged strip -> unchanged picture: no new blob, no repaint.
      if (sig === sampleSig) return false;
      // The host is taken BEFORE the blob: a panel that went away between
      // the read and the paint used to leave a whole viewport PNG with no
      // reference to revoke it, and a signature already advanced so the
      // frame was never retried.
      const host = sampleHost();
      if (!host) return false;
      const url = URL.createObjectURL(await c.convertToBlob({ type: "image/png" }));
      // A live reinjection can retire this copy while either await above is
      // pending. Never let the stale read recreate the host or paint over the
      // new generation; the just-created URL is ours to release.
      if (!current()) { URL.revokeObjectURL(url); return false; }
      const back = 1 - front;
      layers[back].style.backgroundImage = `url("${url}")`;
      layers[back].setAttribute("front", "");
      layers[front].removeAttribute("front");
      if (urls[back]) { try { URL.revokeObjectURL(urls[back]); } catch {} }
      urls[back] = url;
      front = back;
      // Commit only a painted frame: a stalled encoding must remain retryable.
      sampleSig = sig;
      placeLayers();
      // The first frame lands at once; later frames fade in -- briefly
      // while frames keep coming (a scroll should not trail), at the
      // idle rate after a pause.
      const now = Date.now(), moving = now - lastPush < 2 * sampleMs;
      lastPush = now;
      frames++;
      host.style.setProperty("--zzglass-sample-fade", (moving ? FAST_MS : sampleMs) + "ms");
      if (urls[1 - front]) host.setAttribute("zzglass-fade", "");
      sidebarEl()?.setAttribute("zzglass-sample", "");
      lastError = null;
      return true;
    } catch (e) {
      if (epoch !== samplingEpoch) return false;
      lastError = String(e);
      console.warn("[Glassflow] sample failed:", e);
      clearSample();
    } finally { if (epoch === samplingEpoch) sampling = false; }
  }

  function syncSampling() {
    trackNativeBlur();
    const on = sampleOn();
    const want = on && !document.hidden && sidebarShown();
    // Disabling the feature must also retire a snapshot already across an
    // await. Clearing only the visible frame allowed that read to paint the
    // frame straight back after the setting had been switched off.
    if (!on) {
      samplingEpoch++;
      if (warmSampleTimer) { clearTimeout(warmSampleTimer); warmSampleTimer = null; }
    }
    if (want && !sampleTimer) {
      // A text field, so a string pref; read either type.
      sampleMs = 250;
      try { const v = parseInt(readPrefValue(PREFIX + "sidebar.sample-interval"), 10); if (v >= 100) sampleMs = v; } catch {}
      sampleOnce(true);                      // the strip about to be covered, before the slide
      // The idle rate is the setting; a read that found a change is
      // followed quickly, so a scroll is tracked and a still page is not.
      // A hide and re-show during a read starts a second chain while the
      // first is still awaiting. Without this token the first one wakes up,
      // sees a live timer that belongs to the second, and re-arms: two
      // chains, two readbacks per interval, for the rest of the session.
      const chain = ++sampleChain;
      const next = (delay) => {
        sampleTimer = setTimeout(async () => {
          // Keep ticking while a snapshot/encoding is pending. Otherwise its
          // stall prevents sampleOnce's 2-second recovery check from running.
          if (!sampleTimer || chain !== sampleChain) return;
          next(sampleMs);
          const changed = await sampleOnce();
          if (changed && sampleTimer && chain === sampleChain) {
            clearTimeout(sampleTimer);
            next(FAST_MS);
          }
        }, delay);
      };
      next(sampleMs);
    } else if (!want && sampleTimer) {
      // The last frame stays up while hidden, so the next show is instant;
      // the next read replaces it. Not in a private window: a picture of
      // the page outliving the tab is exactly what those windows promise
      // not to do, and one extra read on the next hover is the price.
      clearTimeout(sampleTimer); sampleTimer = null;
      if (isPrivate()) clearSample();
    }
    // Shown or hidden, the panel is about to slide: keep the picture put.
    if (on && sampleEl?.isConnected) track();
    if (!on) clearSample();
  }

  function startSampling() {
    const tb = document.getElementById("navigator-toolbox");
    if (!tb) return;
    // Zen flips these attributes as the compact sidebar shows and hides;
    // the observer is the only thing that runs while it is hidden.
    sampleObserver = new MutationObserver(syncSampling);
    sampleObserver.observe(tb, { attributes: true, attributeFilter: SIDEBAR_SHOW_ATTRS });
    sampleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["zen-compact-mode", "zen-renaming-tab", "zen-right-side", "customizing", "inDOMFullscreen"] });
    nativeResize = new ResizeObserver(trackNativeBlur);
    for (const el of [sidebarEl(), document.getElementById("tabbrowser-tabbox")]) if (el) nativeResize.observe(el);
    window.addEventListener("resize", trackNativeBlur);
    gBrowser.tabContainer.addEventListener("TabSelect", syncSampleNow);
    document.addEventListener("visibilitychange", syncSampling);
    syncSampling();
    if (sampleOn()) {
      warmSampleTimer = setTimeout(() => {
        warmSampleTimer = null;
        sampleOnce(true);
      }, 1500);                              // warm the first frame
    }
  }
  const sampleOn = () => {
    try { return document.documentElement.getAttribute("zen-compact-mode") === "true" &&
      Services.prefs.getBoolPref(PREFIX + "sidebar.enabled", false) &&
      Services.prefs.getBoolPref(PREFIX + "sidebar.sample", false); }
    catch { return false; }
  };
  // A new tab in front: re-read now if shown, or warm a frame for it if not.
  const syncSampleNow = () => { clearSample(); if (sampleOn()) sampleOnce(!sampleTimer); };
  function stopSampling() {
    samplingEpoch++;
    try { sampleObserver?.disconnect(); } catch {}
    sampleObserver = null;
    nativeResize?.disconnect(); nativeResize = null;
    window.removeEventListener("resize", trackNativeBlur);
    cancelAnimationFrame(nativeRaf); nativeRaf = 0;
    nativeBox?.removeAttribute("zzglass-native-strip");
    nativeSVG?.remove(); nativeSVG = null; nativeGeometry = "";
    try { gBrowser.tabContainer.removeEventListener("TabSelect", syncSampleNow); } catch {}
    document.removeEventListener("visibilitychange", syncSampling);
    if (sampleTimer) { clearTimeout(sampleTimer); sampleTimer = null; }
    if (warmSampleTimer) { clearTimeout(warmSampleTimer); warmSampleTimer = null; }
    cancelAnimationFrame(trackRaf); trackRaf = 0;
    clearSample();
    try { sampleEl?.remove(); } catch {}
    sampleEl = null;
  }

  // ---- keep the favicon through a load ---------------------------------
  // Firefox (tabbrowser.js) forgets a tab's icon URL as a new document
  // starts loading, and when the load ENDS with no icon offered yet, takes
  // the image off the tab outright -- no event -- so the page's real
  // favicon, arriving later, comes in as a fresh image: a blank, then a
  // decode, on every load. Putting the image back after the fact still
  // showed that frame. So the icon URL is put back the moment it is
  // forgotten, for as long as the load stays on the SITE the icon came
  // from: the load then ends with the icon still on, and the page's own
  // icon, usually the very same file, lands without a repaint. A
  // different site starts clean and never wears the previous icon.
  const lastHost = new WeakMap();             // browser -> host of its last location
  const keepIconOn = () => { try { return Services.prefs.getBoolPref("zen.theme.hide-tab-throbber", false); } catch { return false; } };
  const hostOf = (uri) => { try { return /^https?$/.test(uri?.scheme) ? uri.host : null; } catch { return null; } };
  const iconKeeper = {
    onLocationChange(browser, webProgress, request, location) {
      // Subframes report here too -- tabbrowser.js says so in as many
      // words. An ad frame navigating would otherwise overwrite the tab's
      // host, and the next same-site load would look like a new site and
      // lose the icon: the hold quietly stopped working on half the web.
      if (!webProgress?.isTopLevel) return;
      const prev = lastHost.get(browser), host = hostOf(location);
      lastHost.set(browser, host);
      if (!keepIconOn() || !host || host !== prev || browser.mIconURL) return;
      const img = gBrowser.getTabForBrowser(browser)?.getAttribute("image");
      if (img) browser.mIconURL = img;
    },
  };

  function start() {
    syncInstantUI();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    try { startSampling(); } catch (e) { console.error("[Glassflow] sampled glass failed to start:", e); }
    try { gBrowser.addTabsProgressListener(iconKeeper); } catch (e) { console.error("[Glassflow] favicon hold failed to start:", e); }
    try { Services.obs.addObserver(purgeObserver, "browser:purge-session-history"); } catch {}
    // Glassflow.sample.status() says whether the sampled glass is running
    // and what strip of the page it last read; .now() forces one read.
    window.Glassflow = {
      native: { status: () => ({ active: !!nativeBox?.hasAttribute("zzglass-native-strip"),
        tracking: !!nativeRaf, geometry: nativeGeometry || null }) },
      sample: {
        status: () => ({ active: !!sampleTimer, shown: sidebarShown(), sliding: !!trackRaf, strip: overlap(boxOf(sidebarEl())),
                         last: lastSample, lastError, opaquePage, ticks, frames, busy: sampling,
                         busyForMs: sampling ? Date.now() - samplingSince : 0,
                         frameAgeMs: frames ? Date.now() - lastPush : null,
                         painted: !!(sampleEl?.isConnected && layers.some(l => l.style.backgroundImage)),
                         marked: !!sidebarEl()?.hasAttribute("zzglass-sample") }),
        now: () => { sampleSig = null; return sampleOnce(); },
      },
    };
    // Sine cleanup and window unload can both run; retire this copy once.
    let retired = false;
    const cleanup = () => {
      if (retired) return;
      retired = true;
      window.removeEventListener("unload", cleanup);
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
      restoreInstantUI();
      stopSampling();
      try { gBrowser.removeTabsProgressListener(iconKeeper); } catch {}
      try { Services.obs.removeObserver(purgeObserver, "browser:purge-session-history"); } catch {}
      try { delete window.Glassflow; } catch {}
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
  const MOD_ID = "zz-glassflow";
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs;
    let wrote = 0;
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

  // Written the moment this script is injected, not from start(). These
  // variables need only Services.prefs and the document element -- never
  // gBrowser -- and browser-delayed-startup-finished, which start() waits for,
  // fires well AFTER first paint. Deferring meant every window opened painting
  // the CSS fallbacks (10px roundness, the default tints) and then snapping to
  // the configured values. Doing it here is what actually makes the startup comment
  // above true.
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
      console.error("[Glassflow] failed to start:", e);
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
