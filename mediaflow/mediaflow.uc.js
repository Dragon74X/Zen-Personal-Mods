// ==UserScript==
// @name           Mediaflow
// @version        2.8.0
// @include        chrome://browser/content/browser.xhtml
// @description    Hooks into Zen's sidebar to render active video streams.
// ==/UserScript==

(function () {
  if (window.__zzMediaflowLoaded) return;
  // Everything this copy adds to the window is undone from here when Sine
  // disables or updates the mod, as well as when the window closes.
  const undo = [];
  let retired = false;
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); undo.push(() => target.removeEventListener(type, fn, opts)); };
  const watching = observer => { undo.push(() => observer.disconnect()); return observer; };

  const LOG_PREFIX = "[Mediaflow]";
  // Gecko caches actor modules across unregister/re-register. Bump with actor
  // changes so Sine updates load replacement code without a browser restart.
  const ACTOR_VERSION = "2.8.0";
  const CAPTIONS_PREF = "zzmedia.preview.captions";
  const CAPTIONS_WHEN_PIP_HIDDEN_PREF =
    "zzmedia.preview.captions-when-hidden";
  const CAPTION_MODES = new Set(["off", "on", "youtube"]);
  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);
  const err = (...a) => console.error(LOG_PREFIX, ...a);
  const safe = (fn) => {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  };

  const CONFIG = Object.freeze({
    GAP: 6,
    TAB_LIST_GAP: 6,
    ANIM_MS: 220,
    LAYOUT_ANIM_MS: 180,
    CAPTION_ANIM_MS: 180,
    CAPTION_GAP_GRACE_MS: 1000,
    ANIM_TAIL_MS: 350,
    DEFAULT_ASPECT: 16 / 9,
  });
  // The preview and its caption hang from their bottom edge, set every frame
  // from the bar's top, so they move with the bar instead of trailing it;
  // only their size and side ease, for the grow on hover.
  const LAYOUT_TRANSITION =
    `left ${CONFIG.LAYOUT_ANIM_MS}ms ease-out, ` +
    `width ${CONFIG.LAYOUT_ANIM_MS}ms ease-out, ` +
    `height ${CONFIG.LAYOUT_ANIM_MS}ms ease-out`;
  const ANIM_TRANSITION =
    `opacity ${CONFIG.ANIM_MS}ms ease, ` +
    `transform ${CONFIG.ANIM_MS}ms ease, ${LAYOUT_TRANSITION}`;

  const MUSIC_PLAYER_SELECTORS =
    "#zen-media-controls-toolbar, .zen-sidebar-bottom-buttons";
  const PIP_BUTTON_SELECTORS = [
    '[id*="pictureinpicture" i]',
    '[class*="pictureinpicture" i]',
    '[command*="pictureinpicture" i]',
    '[id*="pip" i]',
    '[class*="pip" i]',
    '[anonid*="pictureinpicture" i]',
  ].join(",");

  const musicPlayerUI = document.querySelector(MUSIC_PLAYER_SELECTORS);
  if (!musicPlayerUI) {
    err("Could not find the music player UI.");
    return;
  }

  window.__zzMediaflowLoaded = true;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionMs = ms => reducedMotion.matches ? 0 : ms;

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @media (prefers-reduced-motion: reduce) {
      #zen-sidebar-pip-container, #zen-sidebar-pip-caption {
        transition: none !important;
        transform: none !important;
      }
    }
    #zen-sidebar-pip-container {
      --zzg-edge-owner: plain;
      position: fixed;
      background: transparent;
      display: none;
      border-radius: var(--zen-border-radius);
      overflow: hidden;
      contain: strict;
      z-index: 10;
      pointer-events: auto;
      transform-origin: 50% 100%;
      transition: ${LAYOUT_TRANSITION};
      will-change: opacity, transform, bottom, left, width, height;
    }
    #zen-sidebar-pip-container[zzmf-clickable] { cursor: pointer; }
    #zen-sidebar-pip-container::after {
      content: "";
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      border: 1px solid color-mix(in srgb, white 8%, transparent);
  --zzg-edge-owner: plain;
  border-color: color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-top, 100%), transparent) color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-right, 100%), transparent) color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-bottom, 100%), transparent) color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-left, 100%), transparent);
      border-radius: inherit;
      z-index: 1;
      pointer-events: none;
    }
    #zen-sidebar-pip-container > canvas {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      min-width: 0;
      min-height: 0;
      border-radius: calc(var(--zen-border-radius) + 2px);
      object-fit: fill;
      display: block;
    }
    #zen-sidebar-pip-caption {
      position: fixed;
      display: none;
      box-sizing: border-box;
      padding: 7px 10px;
      color: white;
      background: color-mix(in srgb, black 78%, transparent);
      border: 1px solid color-mix(in srgb, white 8%, transparent);
  --zzg-edge-owner: plain;
  border-color: color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-top, 100%), transparent) color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-right, 100%), transparent) color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-bottom, 100%), transparent) color-mix(in srgb, color-mix(in srgb, white 8%, transparent) var(--zzg-follow-left, 100%), transparent);
      border-radius: var(--zen-border-radius);
      box-shadow: 0 3px 12px rgb(0 0 0 / 28%);
      font: 600 12px/1.35 system-ui, sans-serif;
      text-align: center;
      text-wrap: balance;
      overflow-wrap: anywhere;
      max-height: calc(4.05em + 14px);
      overflow: hidden;
      z-index: 11;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px) scale(0.96);
      transform-origin: 50% 100%;
      transition: opacity ${CONFIG.CAPTION_ANIM_MS}ms ease,
                  transform ${CONFIG.CAPTION_ANIM_MS}ms ease;
      will-change: opacity, transform, bottom;
    }
    #zen-sidebar-pip-caption[zzmf-caption-visible="true"] {
      opacity: var(--zzmf-caption-opacity, 1);
      transform: translateY(0) scale(1);
    }
    [zzmf-reserve="true"] {
      margin-top: var(--zzmf-reserve) !important;
    }
    .zen-sidebar-pip-toggle {
      flex: 0 0 auto;
      max-width: 24px !important;
      max-height: 24px !important;
      width: 24px !important;
      height: 24px !important;
      margin: 0 2px !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    .zen-media-card:not([can-pip]) .zen-sidebar-pip-toggle {
      display: none !important;
    }
    /* The preview's controls, after Firefox's Picture-in-Picture window:
       close and pop-out at the top, skip and play in the middle, the
       timeline and mute along the bottom. They show while pointing at the
       preview, and stay while it is paused from them. */
    .zzmf-pip-controls {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: none;
      opacity: 0;
      transition: opacity 150ms ease;
      background: linear-gradient(to bottom, rgb(0 0 0 / 0.45), transparent 30%, transparent 62%, rgb(0 0 0 / 0.6));
      color: white;
      font: 600 11px/1 system-ui, sans-serif;
    }
    #zen-sidebar-pip-container[zzmf-controls] .zzmf-pip-controls { display: block; }
    #zen-sidebar-pip-container[zzmf-interacting] { transition: none !important; }
    #zen-sidebar-pip-container:is(:hover, :focus-within, [zzmf-paused]) .zzmf-pip-controls { opacity: 1; }
    .zzmf-pip-controls button {
      appearance: none;
      position: absolute;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: center / 16px no-repeat var(--zzmf-icon);
      -moz-context-properties: fill;
      fill: white;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .zzmf-pip-controls button:hover { background-color: rgb(255 255 255 / 0.18); }
    .zzmf-pip-controls :is(button, input):focus-visible { outline: 2px solid white; outline-offset: 1px; }
    .zzmf-pip-close { top: 4px; right: 4px; --zzmf-icon: url("chrome://browser/skin/zen-icons/close.svg"); }
    .zzmf-pip-popout { top: 4px; left: 4px; --zzmf-icon: url("chrome://global/skin/media/picture-in-picture-open.svg"); }
    .zzmf-pip-back, .zzmf-pip-play, .zzmf-pip-forward { top: calc(50% - 14px); }
    .zzmf-pip-play { left: calc(50% - 17px); width: 34px; height: 34px; top: calc(50% - 19px); background-size: 20px;
      --zzmf-icon: url("chrome://browser/skin/zen-icons/media-pause.svg"); }
    #zen-sidebar-pip-container[zzmf-paused] .zzmf-pip-play { --zzmf-icon: url("chrome://browser/skin/zen-icons/media-play.svg"); }
    .zzmf-pip-back { left: calc(50% - 56px); --zzmf-icon: url("chrome://browser/skin/zen-icons/arrow-rotate-anticlockwise.svg"); }
    .zzmf-pip-forward { left: calc(50% + 30px); --zzmf-icon: url("chrome://browser/skin/zen-icons/arrow-rotate-anticlockwise.svg"); transform: scaleX(-1); }
    .zzmf-pip-back::after, .zzmf-pip-forward::after {
      content: attr(data-step);
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-size: 7px;
    }
    .zzmf-pip-forward::after { transform: scaleX(-1); }
    .zzmf-pip-mute { bottom: 3px; right: 4px; --zzmf-icon: url("chrome://browser/skin/zen-icons/media-unmute.svg"); }
    #zen-sidebar-pip-container[zzmf-muted] .zzmf-pip-mute { --zzmf-icon: url("chrome://browser/skin/zen-icons/media-mute.svg"); }
    .zzmf-pip-time { position: absolute; left: 8px; bottom: 11px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgb(0 0 0 / 0.6); }
    .zzmf-pip-track {
      appearance: none;
      position: absolute;
      left: 8px;
      width: calc(100% - 44px);
      bottom: 4px;
      height: 10px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
    }
    .zzmf-pip-track::-moz-range-track, .zzmf-pip-track::-moz-range-progress {
      height: 3px;
      border-radius: 2px;
    }
    .zzmf-pip-track::-moz-range-track { background: rgb(255 255 255 / 0.3); }
    .zzmf-pip-track::-moz-range-progress { background: var(--zen-primary-color, white); }
    .zzmf-pip-track::-moz-range-thumb { width: 0; height: 0; border: none; }
    .zzmf-pip-track:is(:hover, :focus-visible)::-moz-range-track,
    .zzmf-pip-track:is(:hover, :focus-visible)::-moz-range-progress { height: 5px; }
    #zen-sidebar-pip-container[zzmf-live] :is(.zzmf-pip-track, .zzmf-pip-time, .zzmf-pip-back, .zzmf-pip-forward) { display: none; }
    [zzmf-parked="true"] {
      display: none !important;
      visibility: collapse !important;
      width: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }
  `;
  document.documentElement.appendChild(styleEl);

  const pipContainer = document.createElement("div");
  pipContainer.id = "zen-sidebar-pip-container";
  const canvasEl = document.createElement("canvas");
  const canvasCtx = canvasEl.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });
  pipContainer.appendChild(canvasEl);
  document.documentElement.appendChild(pipContainer);

  const captionContainer = document.createElement("div");
  captionContainer.id = "zen-sidebar-pip-caption";
  captionContainer.setAttribute("aria-live", "off");
  document.documentElement.appendChild(captionContainer);

  let lastTop = -1,
    lastLeft = -1,
    lastWidth = -1;
  let lastVisible = null;
  let lastOpacity = NaN;
  let lastCaptionOpacity = NaN;
  let isStreaming = false;
  let userHidden = false;
  let scheduled = false;
  let activeUntil = 0;
  let hoverActive = false;
  let playerSeen = true;                    // the music bar is on screen (syncPosition)
  let animating = false;
  let animateOutTimer = null;
  let videoAspect = CONFIG.DEFAULT_ASPECT;
  let captionText = "";
  let captionHideTimer = null;
  let captionExitTimer = null;
  let browserWindowActive = true;
  let captureMaxDimension = -1;
  function getCaptionMode() {
    const mode = safe(() =>
      Services.prefs.getStringPref(CAPTIONS_PREF, "youtube"),
    );
    if (CAPTION_MODES.has(mode)) return mode;
    // The setting was briefly a checkbox; a profile may still hold that form.
    const checkbox = safe(() => Services.prefs.getBoolPref(CAPTIONS_PREF));
    return checkbox === false ? "off" : "youtube";
  }
  let captionMode = getCaptionMode();
  let captionsWhenPipHidden = safe(() =>
    Services.prefs.getBoolPref(CAPTIONS_WHEN_PIP_HIDDEN_PREF, false),
  ) === true;

  function setCanvasDimensions(w, h) {
    if (!(w > 0) || !(h > 0)) return;
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
  }

  function setSourceDimensions(w, h) {
    if (!(w > 0) || !(h > 0)) return;
    setCanvasDimensions(w, h);
    const nextAspect = w / h;
    if (nextAspect !== videoAspect) {
      videoAspect = nextAspect;
      lastTop = lastLeft = lastWidth = -1;
      bump();
    }
  }

  // Room for the preview is made above the music bar, as a top margin, so
  // the tab list gives it up wherever the bar sits. Sizing the tab list
  // instead looped wherever the bar follows the list (Zen 1.23 puts a spring
  // after it): the list shrank, the bar rose with it, the preview rose and
  // the list shrank again, until no tab was left.
  let lastReserve = -1;
  function clearReserve() {
    musicPlayerUI.removeAttribute("zzmf-reserve");
    musicPlayerUI.style.removeProperty("--zzmf-reserve");
    lastReserve = -1;
  }
  function setReserve(px) {
    if (px === lastReserve) return;
    musicPlayerUI.setAttribute("zzmf-reserve", "true");
    musicPlayerUI.style.setProperty("--zzmf-reserve", px + "px");
    lastReserve = px;
    bump();
  }
  // A live update from a version that sized the tab list.
  for (const el of document.querySelectorAll("[zzmf-tab-list-sized]")) {
    el.removeAttribute("zzmf-tab-list-sized");
    el.style.removeProperty("--zzmf-tab-list-height");
  }

  function getMediaTopEdge(walkDescendants) {
    const baseRect = musicPlayerUI.getBoundingClientRect();
    let top = baseRect.top;
    if (walkDescendants && (hoverActive || performance.now() < activeUntil)) {
      // Zen's cards hold every row that rises on hover, so their edges are
      // enough; other markup (another music-bar mod) falls back to all of it.
      let kids = musicPlayerUI.querySelectorAll(".zen-media-card");
      if (!kids.length) kids = musicPlayerUI.querySelectorAll("*");
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i];
        const r = kid.getBoundingClientRect();
        if (r.width !== 0 && r.height !== 0 && r.top < top) {
          const style = window.getComputedStyle(kid);
          if (style.position === "absolute" || style.position === "fixed") {
            continue;
          }
          if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
            continue;
          }
          top = r.top;
        }
      }
    }
    return {
      top,
      baseTop: baseRect.top,
      bottom: baseRect.bottom,
      left: baseRect.left,
      width: baseRect.width,
    };
  }

  function getMediaPlayerVisibility() {
    if (musicPlayerUI.hidden || musicPlayerUI.hasAttribute("hidden")) {
      return { visible: false, opacity: 0 };
    }
    const cs = window.getComputedStyle(musicPlayerUI);
    if (cs.display === "none" || cs.visibility === "hidden") {
      return { visible: false, opacity: 0 };
    }
    if (musicPlayerUI.offsetParent === null && cs.position !== "fixed") {
      return { visible: false, opacity: 0 };
    }
    const r = musicPlayerUI.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return { visible: false, opacity: 0 };
    }
    // Compact mode slides the hidden sidebar off the window, still laid out:
    // the layout stays, but nothing there can be seen.
    const onScreen = r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
    return { visible: true, opacity: parseFloat(cs.opacity), onScreen };
  }

  function syncPosition() {
    scheduled = false;
    if (!isStreaming) return;

    const { visible, opacity, onScreen } = getMediaPlayerVisibility();
    // No frames are copied, and no captions read, while the music bar cannot
    // be seen (compact mode's hidden sidebar, a collapsed or hidden bar).
    const seen = visible && opacity > 0.01 && onScreen && !sidebarAway() && !downloadsCovering();
    if (seen !== playerSeen) {
      playerSeen = seen;
      _notifyTickState();
    }
    const pipVisible =
      visible &&
      opacity > 0.01 &&
      !userHidden &&
      !sourceTabActive &&
      browserWindowActive;
    const captionVisible =
      visible &&
      opacity > 0.01 &&
      captionMode !== "off" &&
      (!userHidden || captionsWhenPipHidden) &&
      !sourceTabActive &&
      browserWindowActive;
    const visibilityState = `${pipVisible}:${captionVisible}`;
    if (visibilityState !== lastVisible) {
      if (!pipVisible) { focusedPreview = null; pipContainer.removeAttribute("zzmf-interacting"); restorePreviewFocus(); }
      pipContainer.style.visibility = pipVisible ? "visible" : "hidden";
      captionContainer.style.visibility = captionVisible
        ? "visible"
        : "hidden";
      lastVisible = visibilityState;
    }
    if (!animating) {
      const op = userHidden ? 0 : opacity;
      if (op !== lastOpacity) {
        pipContainer.style.opacity = String(op);
        lastOpacity = op;
      }
      const captionOpacity = captionVisible ? opacity : 0;
      if (captionOpacity !== lastCaptionOpacity) {
        captionContainer.style.setProperty(
          "--zzmf-caption-opacity",
          String(captionOpacity),
        );
        lastCaptionOpacity = captionOpacity;
      }
    }

    if (pipVisible || captionVisible) {
      const {
        top: mediaTopRaw,
        baseTop,
        bottom: mediaBottom,
        left,
        width: playerWidth,
      } = getMediaTopEdge(true);
      // Native card geometry is authoritative. Focused controls retain their
      // captured preview bounds below; old sources never set future clearance.
      if (playerWidth !== 0) {
        const mediaTop = mediaTopRaw;
        let captionHeight = 0;
        let videoBottom = mediaTop - CONFIG.GAP;
        let captionTop = null;
        if (captionVisible && captionText) {
          const cs = captionContainer.style;
          cs.display = "block";
          cs.width = playerWidth + "px";
          cs.left = left + "px";
          captionHeight = Math.ceil(captionContainer.getBoundingClientRect().height);
          captionTop = mediaTop - CONFIG.GAP - captionHeight;
          cs.bottom = window.innerHeight - (mediaTop - CONFIG.GAP) + "px";
          if (pipVisible) videoBottom = captionTop - CONFIG.GAP;
        } else {
          captionContainer.style.display = "none";
        }

        // Pointed at, the preview keeps the bottom edge it had: the bar folding
        // its hover rows away beneath it would otherwise drop it mid-grow.
        if (pipHover) videoBottom = hoverBottom ??= videoBottom;
        else hoverBottom = null;

        let height = 0;
        if (pipVisible) {
          // The bar's width, at the video's shape: never taller than wide,
          // nor than half the window.
          let width = playerWidth;
          height = width / videoAspect;
          const maxHeight = Math.max(2, Math.min(playerWidth, window.innerHeight * 0.5));
          if (height > maxHeight) {
            height = maxHeight;
            width = height * videoAspect;
          }
          let adjustedLeft = left + (playerWidth - width) / 2;
          // Pointed at, it grows over the page, away from the sidebar, with
          // its bottom edge where it was. The room it keeps above the bar
          // stays the resting size.
          let shownWidth = width, shownHeight = height;
          const grow = pipHover ? hoverGrowth(width) : 1;
          if (grow > 1) {
            shownWidth = width * grow;
            shownHeight = shownWidth / videoAspect;
            const room = Math.max(2, videoBottom - 8);
            if (shownHeight > room) { shownHeight = room; shownWidth = room * videoAspect; }
            const towardRight = left + playerWidth / 2 < window.innerWidth / 2;
            adjustedLeft = towardRight ? adjustedLeft : adjustedLeft + width - shownWidth;
            adjustedLeft = Math.max(4, Math.min(window.innerWidth - shownWidth - 4, adjustedLeft));
          }

          // A focused control must stay under the pointer through press/release
          // and repeated clicks, even during hover growth or a caption change.
          if (focusedPreview) {
            shownWidth = focusedPreview.width;
            shownHeight = focusedPreview.height;
            adjustedLeft = focusedPreview.left;
            videoBottom = focusedPreview.bottom;
          }

          const nextCaptureMaxDimension = Math.max(
            160,
            Math.ceil(Math.max(shownWidth, shownHeight)),
          );
          if (nextCaptureMaxDimension !== captureMaxDimension) {
            captureMaxDimension = nextCaptureMaxDimension;
            const info = sourceBC ? actorRegistry.get(sourceBC.id) : null;
            info?.setMaxDimension?.(captureMaxDimension);
          }

          const top = videoBottom - shownHeight;
          if (
            top !== lastTop ||
            adjustedLeft !== lastLeft ||
            shownWidth !== lastWidth
          ) {
            const s = pipContainer.style;
            s.width = shownWidth + "px";
            s.height = shownHeight + "px";
            s.left = adjustedLeft + "px";
            s.bottom = window.innerHeight - videoBottom + "px";
            lastTop = top;
            lastLeft = adjustedLeft;
            lastWidth = shownWidth;
            activeUntil = now + CONFIG.ANIM_TAIL_MS;
          }
        }
        // Keep a small separation between the final tab and what sits above
        // the bar, when room is made for it; otherwise it floats over the tabs.
        const above = (pipVisible ? height + CONFIG.GAP : 0) + (captionTop !== null ? captionHeight + CONFIG.GAP : 0);
        if (above && makeRoom()) setReserve(Math.ceil(above + CONFIG.TAB_LIST_GAP));
        else clearReserve();
      }
    } else {
      captionContainer.style.display = "none";
      clearReserve();
    }

    if (performance.now() < activeUntil) schedule();
  }

  function schedule() {
    if (scheduled || !isStreaming) return;
    scheduled = true;
    requestAnimationFrame(syncPosition);
  }

  function bump() {
    activeUntil = performance.now() + CONFIG.ANIM_TAIL_MS;
    schedule();
  }

  function clearCaptionTimers() {
    if (captionHideTimer) {
      clearTimeout(captionHideTimer);
      captionHideTimer = null;
    }
    if (captionExitTimer) {
      clearTimeout(captionExitTimer);
      captionExitTimer = null;
    }
  }

  function clearCaptionImmediately() {
    clearCaptionTimers();
    captionContainer.removeAttribute("zzmf-caption-visible");
    captionContainer.textContent = "";
    captionContainer.style.display = "none";
    captionText = "";
    lastTop = lastLeft = lastWidth = -1;
  }

  function showCaption(next) {
    const wasEmpty = !captionText;
    clearCaptionTimers();
    captionText = next;
    captionContainer.textContent = next;
    lastTop = lastLeft = lastWidth = -1;
    if (isStreaming) bump();

    if (wasEmpty) {
      captionContainer.removeAttribute("zzmf-caption-visible");
      requestAnimationFrame(() => {
        if (!captionText) return;
        // syncPosition has now made the caption measurable and positioned it.
        // Flush that hidden state so the following attribute change transitions.
        void captionContainer.getBoundingClientRect();
        captionContainer.setAttribute("zzmf-caption-visible", "true");
      });
    } else {
      captionContainer.setAttribute("zzmf-caption-visible", "true");
    }
  }

  function hideCaptionNow() {
    clearCaptionTimers();
    if (!captionText) {
      captionContainer.removeAttribute("zzmf-caption-visible");
      return;
    }
    captionContainer.removeAttribute("zzmf-caption-visible");
    captionExitTimer = setTimeout(() => {
      captionExitTimer = null;
      captionText = "";
      captionContainer.textContent = "";
      lastTop = lastLeft = lastWidth = -1;
      if (isStreaming) bump();
    }, motionMs(CONFIG.CAPTION_ANIM_MS));
  }

  function hideCaptionAfterGap() {
    if (!captionText || captionHideTimer || captionExitTimer) return;
    captionHideTimer = setTimeout(() => {
      captionHideTimer = null;
      captionContainer.removeAttribute("zzmf-caption-visible");
      captionExitTimer = setTimeout(() => {
        captionExitTimer = null;
        captionText = "";
        captionContainer.textContent = "";
        lastTop = lastLeft = lastWidth = -1;
        if (isStreaming) bump();
      }, motionMs(CONFIG.CAPTION_ANIM_MS));
    }, CONFIG.CAPTION_GAP_GRACE_MS);
  }

  function startTracking() {
    lastTop = lastLeft = lastWidth = -1;
    lastVisible = null;
    lastOpacity = NaN;
    lastCaptionOpacity = NaN;
    captureMaxDimension = -1;
    bump();
    _notifyTickState();
  }
  function stopTracking() {
    activeUntil = 0;
    hoverActive = false;
    clearReserve();
    sourceTabActive = false;
    _notifyTickState();
  }

  // Pointing at the preview grows it (Grow on hover); clicking it goes to the
  // tab the video plays in.
  let pipHover = false, hoverBottom = null, focusedPreview = null;
  const HOVER_PREF = "zzmedia.preview.hover-size", CLICK_PREF = "zzmedia.preview.click-to-tab";
  function hoverGrowth(width) {
    const v = safe(() => Services.prefs.getStringPref(HOVER_PREF, "2")) ?? "2";
    if (v === "half") return Math.max(1, window.innerWidth * 0.5 / width);
    const k = parseFloat(v);
    return Number.isFinite(k) && k > 1 ? k : 1;
  }
  const clickToTab = () => safe(() => Services.prefs.getBoolPref(CLICK_PREF, true)) ?? true;
  const syncClickable = () => pipContainer.toggleAttribute("zzmf-clickable", clickToTab());
  syncClickable();
  safe(() => Services.prefs.addObserver(CLICK_PREF, syncClickable));
  undo.push(() => safe(() => Services.prefs.removeObserver(CLICK_PREF, syncClickable)));
  // Off (the default), the preview sits in front of the tabs; on, the tab
  // list ends above it.
  const ROOM_PREF = "zzmedia.preview.make-room";
  const makeRoom = () => safe(() => Services.prefs.getBoolPref(ROOM_PREF, false)) ?? false;
  safe(() => Services.prefs.addObserver(ROOM_PREF, bump));
  undo.push(() => safe(() => Services.prefs.removeObserver(ROOM_PREF, bump)));
  // In compact mode Zen hides the sidebar once the pointer leaves it, and the
  // preview (growing over the page) sits outside it: pointing at the preview
  // keeps the sidebar open, through Zen's own hover state, and leaving it
  // starts Zen's usual countdown. Docked and other modes are untouched.
  let holdTimer = null;
  function holdSidebar(hold) {
    const cm = window.gZenCompactModeManager, side = cm?.sidebar;
    clearTimeout(holdTimer);
    if (!cm?.preference || !side) return;
    const id = "has-hover" + side.id;
    const keep = () => {
      safe(() => cm.clearFlashTimeout(id));
      if (!side.hasAttribute("zen-has-hover")) safe(() => cm._setElementExpandAttribute(side, true));
    };
    if (hold) {
      keep();
      // Zen checks the sidebar a moment after the pointer left it and starts
      // its hide countdown then; cancel that one too.
      holdTimer = setTimeout(() => { if (pipContainer.matches(":hover, :focus-within")) keep(); }, (cm.HOVER_HACK_DELAY || 0) + 40);
    } else if (!side.matches(":hover")) {
      const ms = safe(() => Services.prefs.getIntPref("zen.view.compact.sidebar-keep-hover.duration", 0)) ?? 0;
      safe(() => cm.flashElement(side, ms, id, "zen-has-hover"));
    }
  }
  undo.push(() => clearTimeout(holdTimer));
  // Wait before expanding: the preview grows, and the music bar's rows rise
  // (userChrome.css), only once the pointer has stayed a moment.
  const DELAY_PREF = "zzmedia.bar.hover-delay";
  let hoverDelay = 0, growTimer = null;
  const syncDelay = () => {
    hoverDelay = Math.max(0, parseFloat(safe(() => Services.prefs.getStringPref(DELAY_PREF, "0.3")) ?? "0.3") || 0);
    musicPlayerUI.style.setProperty("--zzmf-hover-delay", hoverDelay + "s");
  };
  syncDelay();
  safe(() => Services.prefs.addObserver(DELAY_PREF, syncDelay));
  undo.push(() => {
    safe(() => Services.prefs.removeObserver(DELAY_PREF, syncDelay));
    clearTimeout(growTimer);
    musicPlayerUI.style.removeProperty("--zzmf-hover-delay");
  });
  on(pipContainer, "mouseenter", () => {
    holdSidebar(true);
    clearTimeout(growTimer);
    growTimer = setTimeout(() => { pipHover = true; bump(); }, hoverDelay * 1000);
  });
  on(pipContainer, "mouseleave", () => { clearTimeout(growTimer); pipHover = false; if (!pipContainer.matches(":focus-within")) holdSidebar(false); bump(); });
  function holdPreview() {
    holdSidebar(true);
    clearTimeout(growTimer);
    if (focusedPreview) return;
    // Read the in-flight CSS geometry, not the hover animation's destination.
    const s = getComputedStyle(pipContainer);
    focusedPreview = { width: parseFloat(s.width), height: parseFloat(s.height),
      left: parseFloat(s.left), bottom: window.innerHeight - parseFloat(s.bottom) };
    pipContainer.setAttribute("zzmf-interacting", "");
    lastTop = lastLeft = lastWidth = -1;
    syncPosition();
  }
  on(pipContainer, "focusin", holdPreview);
  function releasePreview() {
    if (pipContainer.matches(":focus-within") || controls.matches(":hover")) return;
    focusedPreview = null;
    pipContainer.removeAttribute("zzmf-interacting");
    if (!pipContainer.matches(":hover")) holdSidebar(false);
    bump();
  }
  on(pipContainer, "focusout", e => {
    if (pipContainer.contains(e.relatedTarget)) return;
    releasePreview();
  });
  on(pipContainer, "click", event => {
    if (!clickToTab() || event.button !== 0) return;
    const browser = safe(() => sourceBC?.top?.embedderElement);
    const tab = browser && gBrowser.getTabForBrowser(browser);
    if (!tab) return;
    // A tab in another workspace needs that workspace first; selecting it
    // alone leaves you where you are. Zen's own music card does the same.
    if (window.gZenWorkspaces?.switchTabIfNeeded) window.gZenWorkspaces.switchTabIfNeeded(tab);
    else gBrowser.selectedTab = tab;
  });

  // Controls on the preview (Controls on the preview). They act on the video
  // through its actor; mute is the tab's, like Zen's own mute button.
  const CONTROLS_PREF = "zzmedia.preview.controls", STEP_PREF = "zzmedia.preview.seek-step";
  const controls = document.createElement("div");
  controls.className = "zzmf-pip-controls";
  on(controls, "mouseenter", holdPreview);
  on(controls, "mouseleave", releasePreview);
  const control = (cls, label, act) => {
    const b = document.createElement("button");
    b.className = cls;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", e => { e.stopPropagation(); safe(act); });
    controls.appendChild(b);
    return b;
  };
  const tell = (action, value) => safe(() => actorRegistry.get(sourceBC?.id)?.control?.(action, value));
  const sourceTab = () => safe(() => gBrowser.getTabForBrowser(sourceBC?.top?.embedderElement)) || null;
  const seekStep = () => parseFloat(safe(() => Services.prefs.getStringPref(STEP_PREF, "10")) ?? "10") || 10;
  control("zzmf-pip-popout", "Open in Picture-in-Picture", () => tell("popout"));
  control("zzmf-pip-close", "Hide the preview", () => setUserHidden(true));
  const back = control("zzmf-pip-back", "Back", () => tell("seekBy", -seekStep()));
  const play = control("zzmf-pip-play", "Play", () => tell("toggle"));
  const forward = control("zzmf-pip-forward", "Forward", () => tell("seekBy", seekStep()));
  const mute = control("zzmf-pip-mute", "Mute tab", () => { sourceTab()?.toggleMuteAudio(); syncMuted(); });
  const time = document.createElement("span");
  time.className = "zzmf-pip-time";
  const track = document.createElement("input");
  track.type = "range";
  track.min = "0";
  track.max = "1";
  track.step = "0.001";
  track.value = "0";
  track.disabled = true;
  track.setAttribute("aria-label", "Video position");
  track.className = "zzmf-pip-track";
  controls.append(time, track);
  pipContainer.appendChild(controls);
  const nameControl = (button, label) => { button.title = label; button.setAttribute("aria-label", label); };
  const syncMuted = () => {
    const muted = !!sourceTab()?.linkedBrowser?.audioMuted;
    pipContainer.toggleAttribute("zzmf-muted", muted); nameControl(mute, muted ? "Unmute tab" : "Mute tab");
  };
  const syncControls = () => {
    pipContainer.toggleAttribute("zzmf-controls", safe(() => Services.prefs.getBoolPref(CONTROLS_PREF, true)) ?? true);
    for (const b of [back, forward]) b.dataset.step = String(seekStep());
    nameControl(back, `Back ${seekStep()} seconds`); nameControl(forward, `Forward ${seekStep()} seconds`);
  };
  syncControls();
  for (const p of [CONTROLS_PREF, STEP_PREF]) {
    safe(() => Services.prefs.addObserver(p, syncControls));
    undo.push(() => safe(() => Services.prefs.removeObserver(p, syncControls)));
  }
  const clock = t => {
    const s = Math.max(0, Math.floor(t)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };
  // Dragging along the timeline shows where it will land; letting go seeks.
  let dragging = false, lastDuration = 0, lastPlaybackState = null;
  on(track, "click", e => e.stopPropagation());
  on(track, "input", () => {
    dragging = true;
    const label = `${clock(track.valueAsNumber * lastDuration)} / ${clock(lastDuration)}`;
    time.textContent = label;
    track.setAttribute("aria-valuetext", label);
  });
  on(track, "change", () => {
    dragging = false;
    if (!track.disabled) tell("seekTo", track.valueAsNumber);
  });
  for (const event of ["pointercancel", "blur"]) on(track, event, () => {
    dragging = false;
    if (lastPlaybackState) updateControls(lastPlaybackState);
  });
  function updateControls(state) {
    lastPlaybackState = state;
    const { time: t, duration: d, paused } = state;
    if (Number.isFinite(state.volume) && state.volume >= 0 && state.volume <= 1) {
      pipContainer.setAttribute("data-zz-volume", String(state.muted ? 0 : state.volume * 100));
    } else pipContainer.removeAttribute("data-zz-volume");
    pipContainer.toggleAttribute("zzmf-paused", !!paused);
    nameControl(play, paused ? "Play" : "Pause");
    const live = !(Number.isFinite(d) && d > 0);
    pipContainer.toggleAttribute("zzmf-live", live);
    syncMuted();
    lastDuration = live ? 0 : d;
    track.disabled = live;
    if (live) {
      dragging = false;
      track.value = "0";
      time.textContent = "";
      track.removeAttribute("aria-valuetext");
      return;
    }
    if (dragging) return;
    const position = Number.isFinite(t) ? Math.max(0, Math.min(d, t)) : 0;
    track.value = String(position / d);
    time.textContent = `${clock(position)} / ${clock(d)}`;
    track.setAttribute("aria-valuetext", time.textContent);
  }

  on(musicPlayerUI, "mouseenter", () => {
    hoverActive = true;
    bump();
  });
  on(musicPlayerUI, "mouseleave", () => {
    hoverActive = false;
    bump();
  });
  for (const ev of [
    "transitionrun",
    "transitionend",
    "animationstart",
    "animationend",
  ]) {
    on(musicPlayerUI, ev, bump);
  }

  safe(() => {
    const ro = watching(new ResizeObserver(bump));
    ro.observe(musicPlayerUI);
    ro.observe(document.documentElement);
  });

  watching(new MutationObserver(bump)).observe(musicPlayerUI, {
    attributes: true,
    attributeFilter: ["hidden", "style", "class", "open"],
  });
  on(window, "resize", bump);
  // Compact mode shows the hidden sidebar while one of these is on it (the
  // same test Glassflow uses); recheck as they change, so copying stops while
  // the sidebar is away and resumes as it comes back.
  const SIDEBAR_SHOW_ATTRS = ["zen-has-hover", "zen-user-show", "zen-has-empty-tab",
    "flash-popup", "has-popup-menu", "movingtab", "zen-compact-mode-active"];
  function sidebarAway() {
    const root = document.documentElement, toolbox = document.getElementById("navigator-toolbox");
    if (root.getAttribute("zen-compact-mode") !== "true" || !toolbox || root.hasAttribute("customizing")) return false;
    const hides = safe(() => Services.prefs.getBoolPref("zen.view.compact.hide-tabbar", true) ||
      Services.prefs.getBoolPref("zen.view.use-single-toolbar", false)) ?? true;
    return hides && root.getAttribute("zen-renaming-tab") !== "true" &&
      !SIDEBAR_SHOW_ATTRS.some(a => toolbox.hasAttribute(a));
  }
  safe(() => {
    const toolbox = document.getElementById("navigator-toolbox");
    const showing = watching(new MutationObserver(bump));
    if (toolbox) showing.observe(toolbox, { attributes: true, attributeFilter: SIDEBAR_SHOW_ATTRS });
    showing.observe(document.documentElement, { attributes: true, attributeFilter: ["zen-compact-mode", "zen-renaming-tab", "customizing", "inDOMFullscreen"] });
  });

  function updateBrowserActivity() {
    const nextActive =
      document.visibilityState !== "hidden" &&
      window.windowState !== window.STATE_MINIMIZED &&
      safe(() => Services.focus.activeWindow === window) !== false;
    if (nextActive === browserWindowActive) return;
    browserWindowActive = nextActive;
    if (!browserWindowActive) {
      pipContainer.style.visibility = "hidden";
      captionContainer.style.visibility = "hidden";
      clearReserve();
    }
    if (isStreaming) bump();
    _notifyTickState();
  }

  on(window, "activate", updateBrowserActivity);
  on(window, "deactivate", updateBrowserActivity);
  on(window, "sizemodechange", updateBrowserActivity);
  on(document, "visibilitychange", updateBrowserActivity);
  const firstCheck = setTimeout(updateBrowserActivity, 0);
  undo.push(() => clearTimeout(firstCheck));

  const EYE_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='context-fill' fill-opacity='context-fill-opacity'>" +
    "<path d='M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z'/></svg>";
  const EYE_OFF_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='context-fill' fill-opacity='context-fill-opacity'>" +
    "<path d='M2 2l20 20-1.4 1.4-3.5-3.5A12 12 0 0 1 12 21C5 21 1 14 1 14a20 20 0 0 1 4.6-5.6L.6 3.4 2 2zm10 6a4 4 0 0 1 4 4c0 .6-.1 1.1-.3 1.6l-5.3-5.3c.5-.2 1-.3 1.6-.3zM12 5c7 0 11 7 11 7a20 20 0 0 1-3.7 4.6l-2.1-2.1A8 8 0 0 0 12 7c-.7 0-1.4.1-2 .3L7.7 5C9 4.4 10.4 5 12 5z'/></svg>";
  const eyeUrl = (svg) =>
    `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  const EYE_URL = eyeUrl(EYE_SVG);
  const EYE_OFF_URL = eyeUrl(EYE_OFF_SVG);
  const STRIPPED_ATTRS = [
    "command",
    "oncommand",
    "onclick",
    "data-l10n-id",
    "style",
    "hidden",
    "collapsed",
    "disabled",
    "aria-hidden",
  ];

  let sourceBC = null;
  let sourceTabActive = false;
  // Keep the active entry too, so a pre-empted (including held-paused) source
  // remains eligible until its actor reports VideoStopped.
  const availableSources = new Map();
  let chosenSource = null;
  const downloadsCovering = () => !!document.querySelector("#zen-sidebar-foot-buttons[zen-library-stack-open], #TabsToolbar-customization-target[zen-library-stack-closing]");
  const actorRegistry = new Map();

  const togglesByNativeButton = new Map();
  const sourceItems = new Set();
  function updateSourceMenu() {
    for (const item of sourceItems) {
      if (!item.isConnected || item.zzmfEligible()) continue;
      const popup = item.closest("menupopup"), focused = document.activeElement === item;
      item.remove(); sourceItems.delete(item);
      if (focused) ([...popup.querySelectorAll("menuitem")].find(n => !n.hidden && !n.disabled) || popup.anchorNode)?.focus();
    }
  }

  function usableSource(source, tab = null) {
    if (retired || !source || availableSources.get(source.bc.id) !== source || !actorRegistry.has(source.bc.id) || source.bc.isDiscarded) return false;
    const browser = source.bc.top?.embedderElement, actual = browser && gBrowser.getTabForBrowser(browser);
    return !!actual?.isConnected && !actual.closing && (!tab || tab === actual) && source.width > 0 && source.height > 0;
  }
  function sourceForToggle(native) {
    const front = window.gZenMediaController?.frontCard;
    if (!front || front.element !== native.closest(".zen-media-card")) return null;
    const tab = gBrowser.getTabForBrowser(front.browser);
    return [...availableSources.values()].find(source => usableSource(source, tab)) || null;
  }
  function restorePreviewFocus() {
    if (!pipContainer.contains(document.activeElement)) return;
    const owner = [...togglesByNativeButton.values()].find(toggle => toggle.isConnected && toggle.getClientRects().length);
    (owner || window.gZenMediaController?.frontCard?.element.querySelector("button:not([hidden]), toolbarbutton:not([hidden])"))?.focus();
  }
  function syncToggleIcons() {
    for (const [nativeButton, toggle] of togglesByNativeButton) {
      if (!nativeButton.isConnected || !toggle.isConnected) {
        togglesByNativeButton.delete(nativeButton);
        continue;
      }
      const source = sourceForToggle(nativeButton);
      const showing = source?.bc.id === sourceBC?.id && !userHidden;
      toggle.setAttribute("data-zz-video-visible", String(showing));
      const label = showing ? "Hide sidebar video" : "Show this video in sidebar";
      toggle.setAttribute("aria-label", label); toggle.setAttribute("tooltiptext", label);
      const icon = showing ? EYE_URL : EYE_OFF_URL;
      if (toggle.style.listStyleImage !== icon) {
        toggle.style.listStyleImage = icon;
      }
    }
  }

  const parked = new Map();
  function unparkNativePipButton(btn) {
    const saved = parked.get(btn);
    if (!saved) return;
    if (btn.style.display === "none") {
      if (saved.display) btn.style.setProperty("display", saved.display, saved.priority);
      else btn.style.removeProperty("display");
    }
    if (btn.getAttribute("aria-hidden") === "true") {
      if (saved.aria === null) btn.removeAttribute("aria-hidden"); else btn.setAttribute("aria-hidden", saved.aria);
    }
    btn.removeAttribute("zzmf-parked"); parked.delete(btn);
  }
  function parkNativePipButton(btn) {
    if (!btn || btn.hasAttribute("zzmf-toggle")) return;
    if (!parked.has(btn)) parked.set(btn, { display: btn.style.getPropertyValue("display"),
      priority: btn.style.getPropertyPriority("display"), aria: btn.getAttribute("aria-hidden") });
    if (btn.getAttribute("zzmf-parked") !== "true") {
      btn.setAttribute("zzmf-parked", "true");
    }
    if (btn.style.display !== "none") {
      btn.style.display = "none";
    }
    if (btn.getAttribute("aria-hidden") !== "true") {
      btn.setAttribute("aria-hidden", "true");
    }
  }

  function buildToggle(template) {
    const btn = template.cloneNode(true);
    btn.removeAttribute("id");
    btn.classList.remove("zen-media-pip-button");
    btn.classList.add("zen-sidebar-pip-toggle");
    btn.removeAttribute("zzmf-parked");
    btn.setAttribute("zzmf-toggle", "true");
    btn.setAttribute("tooltiptext", "Toggle sidebar PiP");
    for (const a of STRIPPED_ATTRS) btn.removeAttribute(a);
    btn.style.listStyleImage = userHidden ? EYE_OFF_URL : EYE_URL;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const source = sourceForToggle(template);
      if (!source) return;
      const showing = sourceBC?.id === source.bc.id && !userHidden;
      if (!showing) window.ZzMediaflowController?.chooseSource(source.bc.id);
      setUserHidden(showing);
    });
    return btn;
  }

  function setUserHidden(hidden) {
    if (hidden) restorePreviewFocus();
    userHidden = hidden;
    syncToggleIcons();
    if (userHidden) clearReserve();
    bump();
    _notifyTickState();
  }

  function placeToggles() {
    for (const [nativeButton, toggle] of togglesByNativeButton) {
      if (!nativeButton.isConnected || !toggle.isConnected || !sourceForToggle(nativeButton)) {
        if (document.activeElement === toggle) window.gZenMediaController?.frontCard?.element.querySelector("button, toolbarbutton")?.focus();
        toggle.remove(); unparkNativePipButton(nativeButton);
        togglesByNativeButton.delete(nativeButton);
      }
    }

    const nativeButtons = musicPlayerUI.querySelectorAll(PIP_BUTTON_SELECTORS);
    for (const nativeButton of nativeButtons) {
      if (nativeButton.hasAttribute("zzmf-toggle") || !sourceForToggle(nativeButton)) continue;
      const existingToggle = togglesByNativeButton.get(nativeButton);
      if (existingToggle?.isConnected) {
        parkNativePipButton(nativeButton);
        continue;
      }
      if (!nativeButton.parentNode) continue;
      const toggle = buildToggle(nativeButton);
      nativeButton.parentNode.insertBefore(toggle, nativeButton);
      togglesByNativeButton.set(nativeButton, toggle);
      parkNativePipButton(nativeButton);
    }
    syncToggleIcons();
    updateSourceMenu();
  }

  placeToggles();
  watching(new MutationObserver(() => {
    placeToggles();
  })).observe(musicPlayerUI, {
    attributes: true,
    attributeFilter: ["hidden", "style", "class", "collapsed"],
    childList: true,
    subtree: true,
  });


  const captionsPrefObserver = {
    observe() {
      const nextMode = getCaptionMode();
      const nextWhenHidden = safe(() =>
        Services.prefs.getBoolPref(CAPTIONS_WHEN_PIP_HIDDEN_PREF, false),
      ) === true;
      if (nextMode === captionMode &&
          nextWhenHidden === captionsWhenPipHidden) return;
      captionMode = nextMode;
      captionsWhenPipHidden = nextWhenHidden;
      if (captionMode === "off") clearCaptionImmediately();
      if (isStreaming) bump();
      _notifyTickState();
    },
  };
  safe(() => Services.prefs.addObserver(CAPTIONS_PREF, captionsPrefObserver));
  safe(() => Services.prefs.addObserver(
    CAPTIONS_WHEN_PIP_HIDDEN_PREF,
    captionsPrefObserver,
  ));
  undo.push(() => {
    safe(() => Services.prefs.removeObserver(CAPTIONS_PREF, captionsPrefObserver));
    safe(() => Services.prefs.removeObserver(
      CAPTIONS_WHEN_PIP_HIDDEN_PREF,
      captionsPrefObserver,
    ));
  });

  function isTabPlaying(bc) {
    if (!bc) return false;
    try {
      for (const tab of gBrowser.tabs) {
        if (tab.linkedBrowser?.browsingContext?.id === bc.top.id) {
          return tab.hasAttribute("soundplaying");
        }
      }
    } catch (_) {}
    return false;
  }

  function _notifyTickState() {
    const frameProcessingActive =
      isStreaming && playerSeen && !userHidden && !sourceTabActive && browserWindowActive && !downloadsCovering();
    const info = sourceBC ? actorRegistry.get(sourceBC.id) : null;
    if (!info) return;

    const captionProcessingActive =
      isStreaming &&
      playerSeen &&
      captionMode !== "off" &&
      !sourceTabActive &&
      browserWindowActive &&
      (!userHidden || captionsWhenPipHidden) && !downloadsCovering();
    info.setProcessingActive?.(
      frameProcessingActive || captionProcessingActive,
      captionMode,
      captionProcessingActive,
    );
    if (frameProcessingActive) {
      info.startTick(info.win || window);
    } else {
      info.stopTick();
    }
  }

  const sourceFrames = new Map(), sourceTimers = new Map();
  let sourceEpoch = 0;
  function cancelSourceMotion() {
    sourceEpoch++;
    for (const id of sourceFrames.keys()) cancelAnimationFrame(id);
    for (const id of sourceTimers.keys()) clearTimeout(id);
    sourceFrames.clear(); sourceTimers.clear(); animateOutTimer = null; animating = false;
  }
  function sourceFrame(fn) {
    if (reducedMotion.matches) { fn(); return null; }
    const epoch = sourceEpoch;
    const run = () => { sourceFrames.delete(id); if (!retired && epoch === sourceEpoch) fn(); };
    const id = requestAnimationFrame(run);
    sourceFrames.set(id, run); return id;
  }
  function sourceDelay(fn, ms) {
    if (reducedMotion.matches) { fn(); return null; }
    const epoch = sourceEpoch;
    const run = () => { sourceTimers.delete(id); if (!retired && epoch === sourceEpoch) fn(); };
    const id = setTimeout(run, ms);
    sourceTimers.set(id, run); return id;
  }
  on(reducedMotion, "change", () => {
    if (!reducedMotion.matches) return;
    for (const [id, run] of [...sourceFrames]) { cancelAnimationFrame(id); run(); }
    for (const [id, run] of [...sourceTimers]) { clearTimeout(id); run(); }
    if (captionExitTimer) hideCaptionNow();
    bump();
  });
  undo.push(cancelSourceMotion);
  window.ZzMediaflowController = {
    getActiveBC() {
      return sourceBC;
    },
    drawFrame(frame) {
      const { buf, width, height } = frame;
      safe(() => updateControls(frame));
      try {
        // Adaptive capture resolution is independent from layout. The source
        // aspect is established by MirrorStarted/offerVideo; using each
        // downscaled frame here created a resolution -> aspect -> layout
        // feedback loop because even-number rounding slightly changes ratios.
        setCanvasDimensions(width, height);
        const img = new ImageData(new Uint8ClampedArray(buf), width, height);
        canvasCtx.putImageData(img, 0, 0);
      } catch (e) {
        err("drawFrame error:", e?.name, e?.message);
      }
    },
    updateControls,
    setCaption(text) {
      if (captionMode === "off") {
        clearCaptionImmediately();
        return;
      }
      const next = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1000);
      if (next) {
        if (next === captionText && !captionHideTimer && !captionExitTimer) return;
        showCaption(next);
      } else {
        hideCaptionAfterGap();
      }
    },
    hideCaption() {
      hideCaptionNow();
    },
    setSourceTabActive(active) {
      if (sourceTabActive === active) return;
      sourceTabActive = active;
      if (sourceTabActive) clearReserve();
      if (isStreaming) bump();
      _notifyTickState();
    },
    isSource(id, owner) { return actorRegistry.get(id)?.owner === owner; },
    registerSource(id, callbacks) {
      const old = actorRegistry.get(id);
      if (old && old.owner !== callbacks.owner) { old.stopTick(); old.setProcessingActive?.(false, "off", false); }
      actorRegistry.set(id, callbacks);
      placeToggles();
    },
    unregisterSource(id, owner) {
      if (actorRegistry.get(id)?.owner !== owner) return false;
      actorRegistry.delete(id);
      placeToggles();
      return true;
    },
    chooseSource(id = null) {
      if (retired || (id !== null && !usableSource(availableSources.get(id))) || id === null && chosenSource === null) return false;
      chosenSource = id;
      if (id !== null) setUserHidden(false);
      const next = id === null ? [...availableSources.values()].find(s => isTabPlaying(s.bc)) || availableSources.values().next().value : availableSources.get(id);
      if (next) { this._activateSource(next.width, next.height, next.bc); _notifyTickState(); }
      return true;
    },
    offerVideo(width, height, browsingContext) {
      const id = browsingContext.id;
      availableSources.set(id, { bc: browsingContext, width, height });
      placeToggles();
      if (chosenSource !== null && chosenSource !== id && availableSources.has(chosenSource)) return;

      // Only defer when a *different* tab is already mirroring. A re-offer from
      // the same tab (e.g. YouTube swapping an ad for the real video on the same
      // <video>, which fires emptied -> playing) must re-activate immediately
      // instead of queuing behind its own in-flight hide animation.
      if (chosenSource === null && sourceBC && sourceBC.id !== id && isTabPlaying(sourceBC)) {
        log("source queued (existing still playing):", id, "active:", sourceBC.id);
        return;
      }

      this._activateSource(width, height, browsingContext);
    },
    notifySourceStopped(bc) {
      const old = actorRegistry.get(bc.id); old?.stopTick(); old?.setProcessingActive?.(false, "off", false);
      availableSources.delete(bc.id);
      placeToggles();
      if (chosenSource === bc.id) chosenSource = null;

      if (sourceBC && sourceBC.id === bc.id) {
        if (availableSources.size > 0) {
          this._activateSourceAfterHide();
        } else {
          this.hideVideo();
        }
      }
    },
    _activateSourceAfterHide() {
      cancelSourceMotion();
      if (animateOutTimer) return;
      const s = pipContainer.style;
      animating = true;
      s.transition = "none";
      s.opacity = userHidden ? "0" : "1";
      s.transform = "scale(1) translateY(0)";
      void pipContainer.getBoundingClientRect();

      sourceFrame(() => {
        s.transition = ANIM_TRANSITION;
        sourceFrame(() => {
          s.opacity = "0";
          s.transform = "scale(0.9) translateY(8px)";
        });
      });

      animateOutTimer = sourceDelay(() => {
        animateOutTimer = null;
        animating = false;
        sourceBC = null;
        isStreaming = false;
        stopTracking();

        if (availableSources.size > 0) {
          const next = availableSources.get(chosenSource) || availableSources.values().next().value;
          this._activateSource(next.width, next.height, next.bc);
        }
      }, CONFIG.ANIM_MS + 60);
    },
    _activateSource(width, height, browsingContext) {
      cancelSourceMotion();
      log("showVideo", width, "x", height, "tab", browsingContext?.id);
      setSourceDimensions(width, height);
      const previousSourceBC = sourceBC;
      const nextSourceBC = browsingContext || null;
      const sourceChanged =
        previousSourceBC && nextSourceBC && previousSourceBC.id !== nextSourceBC.id;
      if (sourceChanged) {
        const previous = actorRegistry.get(previousSourceBC.id);
        previous?.setProcessingActive?.(false, captionMode, false);
        previous?.stopTick();
        clearCaptionImmediately();
      }
      sourceBC = nextSourceBC;
      syncToggleIcons();
      dragging = false;
      updateControls({ time: 0, duration: 0, paused: false });

      if (sourceBC) {
        try {
          sourceTabActive = gBrowser?.selectedBrowser?.browsingContext?.id === sourceBC.top.id;
        } catch (_) {
          sourceTabActive = false;
        }
      }

      if (animateOutTimer) {
        // We're pre-empting an in-flight hide to re-activate; we're no longer
        // animating out, so clear the flag or it stays stuck true.
        clearTimeout(animateOutTimer);
        animateOutTimer = null;
        animating = false;
      }

      const wasStreaming = isStreaming;
      isStreaming = true;
      startTracking();

      if (wasStreaming && !sourceChanged) {
        const s = pipContainer.style;
        s.opacity = userHidden || sourceTabActive ? "0" : "1";
        s.visibility = userHidden || sourceTabActive ? "hidden" : "visible";
        s.transform = "";
        return;
      }

      const s = pipContainer.style;
      s.display = "block";
      s.visibility = userHidden || sourceTabActive ? "hidden" : "visible";

      if (sourceTabActive) {
        isStreaming = true;
        animating = false;
        startTracking();
      } else {
        animating = true;
        s.transition = "none";
        s.opacity = "0";
        s.transform = "scale(0.9) translateY(8px)";
        void pipContainer.getBoundingClientRect();

        sourceFrame(() => {
          s.transition = ANIM_TRANSITION;
          sourceFrame(() => {
            s.opacity = userHidden ? "0" : "1";
            s.transform = "scale(1) translateY(0)";
          });
        });
        sourceDelay(() => {
          animating = false;
          lastOpacity = NaN;
          lastCaptionOpacity = NaN;
          s.transition = "";
        }, CONFIG.ANIM_MS + 60);
      }
    },

    hideVideo() {
      cancelSourceMotion();
      log("hideVideo");
      if (!isStreaming && !animating) return;
      if (animateOutTimer) {
        clearTimeout(animateOutTimer);
        animateOutTimer = null;
      }

      animating = true;
      const s = pipContainer.style;
      s.transition = "none";
      s.opacity = userHidden ? "0" : "1";
      s.transform = "scale(1) translateY(0)";
      void pipContainer.getBoundingClientRect();

      sourceFrame(() => {
        s.transition = ANIM_TRANSITION;
        sourceFrame(() => {
          s.opacity = "0";
          s.transform = "scale(0.9) translateY(8px)";
        });
      });

      animateOutTimer = sourceDelay(() => {
        animateOutTimer = null;
        animating = false;
        safe(() => canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height));
        clearCaptionImmediately();
        sourceBC = null;
        s.display = "none";
        s.transition = "";
        s.transform = "";
        isStreaming = false;
        stopTracking();
        lastOpacity = NaN;
        lastCaptionOpacity = NaN;
        lastVisible = null;

        // A different source may have been queued while this hide was running;
        // drain it so it isn't stranded until the next pause/play.
        if (availableSources.size > 0) {
          const next = availableSources.get(chosenSource) || availableSources.values().next().value;
          this._activateSource(next.width, next.height, next.bc);
        }
      }, CONFIG.ANIM_MS + 60);
    },
  };

  on(window, "popupshowing", event => {
    if (event.target.id !== "tabContextMenu") return;
    for (const item of sourceItems) item.remove(); sourceItems.clear();
    const tab = event.target.triggerNode?.closest?.(".tabbrowser-tab") || event.target.anchorNode?.closest?.(".tabbrowser-tab") || window.TabContextMenu?.contextTab;
    if (!tab?.isConnected || tab.closing || tab.closest?.("zen-library")) return;
    const sources = [...availableSources.values()].filter(source => usableSource(source, tab));
    for (const [i, source] of sources.entries()) {
      const owner = actorRegistry.get(source.bc.id)?.owner;
      const item = document.createXULElement("menuitem");
      item.setAttribute("data-zz-action", "mediaflow--sidebar-source");
      item.zzmfEligible = () => usableSource(source, tab) && actorRegistry.get(source.bc.id)?.owner === owner;
      item.setAttribute("label", "Show this video in sidebar" + (sources.length > 1 ? ` (${i + 1})` : ""));
      item.addEventListener("command", () => {
        if (item.zzmfEligible()) window.ZzMediaflowController?.chooseSource(source.bc.id);
      });
      event.target.appendChild(item); sourceItems.add(item);
    }
    const manual = availableSources.get(chosenSource);
    if (usableSource(manual, tab)) {
      const automatic = document.createXULElement("menuitem");
      automatic.setAttribute("data-zz-action", "mediaflow--sidebar-automatic");
      automatic.zzmfEligible = () => chosenSource === manual.bc.id && usableSource(manual, tab);
      automatic.setAttribute("label", "Sidebar video: Automatic");
      automatic.addEventListener("command", () => { if (automatic.zzmfEligible()) window.ZzMediaflowController?.chooseSource(); });
      event.target.appendChild(automatic); sourceItems.add(automatic);
    }
  });
  undo.push(() => { for (const item of sourceItems) item.remove(); sourceItems.clear(); });
  const downloadState = watching(new MutationObserver(() => { _notifyTickState(); bump(); }));
  for (const id of ["zen-sidebar-foot-buttons", "TabsToolbar-customization-target"]) {
    const host = document.getElementById(id);
    if (host) downloadState.observe(host, { attributes: true, attributeFilter: ["zen-library-stack-open", "zen-library-stack-closing"] });
  }
  on(window, "TabClose", event => {
    for (const { bc } of [...availableSources.values()]) if (bc.top.id === event.target.linkedBrowser?.browsingContext?.id)
      window.ZzMediaflowController.notifySourceStopped(bc);
  }, true);

  function instantiateActorForOpenTabs() {
    try {
      for (const browser of gBrowser?.browsers || []) {
        const pending = [browser.browsingContext];
        while (pending.length) {
          const bc = pending.pop();
          if (!bc) continue;
          safe(() => bc.currentWindowGlobal?.getActor("ZzMediaflow"));
          safe(() => pending.push(...bc.children));
        }
      }
    } catch (e) {
      warn("Could not initialize actors for open tabs:", e);
    }
  }

  try {
    // The mod's own folder, wherever Sine or Cosine keeps it: its chrome URL
    // resolves to the files on disk. The folder is named after the installed
    // id, which is still zz-zenslop for copies installed before the rename,
    // so read it from this script's own URL. The profile path is the fallback.
    const id = /^chrome:\/\/sine\/content\/([^/]+)\//.exec(Components.stack.filename)?.[1] || "zz-mediaflow";
    let modUri;
    try {
      modUri = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry)
        .convertChromeURL(Services.io.newURI(`chrome://sine/content/${id}/`));
    } catch {
      const modDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      for (const seg of ["chrome", "sine-mods", id]) modDir.append(seg);
      modUri = Services.io.newFileURI(modDir);
    }
    const resProto = Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    if (!resProto.hasSubstitution("zz-mediaflow")) {
      resProto.setSubstitution("zz-mediaflow", modUri);
    }
    log("resource mapped to:", modUri.spec);

    ChromeUtils.registerWindowActor("ZzMediaflow", {
      parent: {
        esModuleURI: `resource://zz-mediaflow/parent-actor.sys.mjs?v=${ACTOR_VERSION}`,
      },
      child: {
        esModuleURI: `resource://zz-mediaflow/content-actor.sys.mjs?v=${ACTOR_VERSION}`,
        events: {
          DOMContentLoaded: {},
          pageshow: {},
          play: { capture: true, mozSystemGroup: true },
          playing: { capture: true, mozSystemGroup: true },
          loadedmetadata: { capture: true, mozSystemGroup: true },
          canplay: { capture: true, mozSystemGroup: true },
          pause: { capture: true, mozSystemGroup: true },
          ended: { capture: true, mozSystemGroup: true },
          emptied: { capture: true, mozSystemGroup: true },
          volumechange: { capture: true, mozSystemGroup: true },
          durationchange: { capture: true, mozSystemGroup: true },
          seeked: { capture: true, mozSystemGroup: true },
        },
      },
      messageManagerGroups: ["browsers"],
      allFrames: true,
      safeForUntrustedWebProcess: true,
    });
  } catch (e) {
    if (e.name !== "NotSupportedError")
      err("Failed to register JSWindowActor:", e);
  }

  // Actor registration is process-global and lazy. Force an instance for
  // already-open documents so restored playback is discovered, then retry as
  // the registration reaches existing content processes.
  instantiateActorForOpenTabs();
  for (const ms of [500, 1500]) {
    const t = setTimeout(instantiateActorForOpenTabs, ms);
    undo.push(() => clearTimeout(t));
  }

  // ---- music bar ----------------------------------------------------------
  // Zen measures the player's height once, when it appears, and floats the
  // hover rows above that height. Always expanded, those rows are part of the
  // player, so measure again whenever the front card's size changes.
  const mediaBar = document.getElementById("zen-media-controls-toolbar");
  const EXPANDED_PREF = "zzmedia.bar.always-expanded";
  const remeasure = () => {
    if (retired || !mediaBar || mediaBar.hidden || mediaBar.matches(":hover")) return;
    const front = window.gZenMediaController?.frontCard?.element;
    if (front && !front.matches("[zen-removing], [zen-hiding]")) {
      mediaBar.style.setProperty("--zen-media-collapsed-height", front.getBoundingClientRect().height + "px");
    }
  };
  if (mediaBar) {
    let remeasureTimer = null;
    const sizes = new ResizeObserver(remeasure);
    const watchCards = () => {
      sizes.disconnect();
      if (retired || !Services.prefs.getBoolPref(EXPANDED_PREF, false)) return;
      const front = window.gZenMediaController?.frontCard?.element;
      if (front && front.isConnected && !front.matches("[zen-removing], [zen-hiding]")) sizes.observe(front);
      remeasure();
    };
    const cards = new MutationObserver(watchCards);
    const onPref = () => {
      clearTimeout(remeasureTimer); remeasureTimer = null;
      sizes.disconnect(); cards.disconnect();
      if (retired) return;
      if (Services.prefs.getBoolPref(EXPANDED_PREF, false)) {
        cards.observe(mediaBar, { childList: true, subtree: true, attributes: true,
          attributeFilter: ["zen-removing", "zen-hiding"] });
        watchCards();
      }
      // Folding still needs one settled native height, with no ongoing subscriptions.
      remeasureTimer = setTimeout(() => { remeasureTimer = null; remeasure(); }, 350);
    };
    Services.prefs.addObserver(EXPANDED_PREF, onPref);
    onPref();
    undo.push(() => {
      Services.prefs.removeObserver(EXPANDED_PREF, onPref);
      sizes.disconnect(); cards.disconnect(); clearTimeout(remeasureTimer);
    });

    // Zen makes a card only as a tab starts making sound, and only if the
    // tab's media controller is active at that moment. A video whose
    // controller wakes a little later, or whose card went with a page change
    // while the sound played on, is left with no bar. Ask Zen again for a
    // while after each sound change or lost card; it skips a tab that
    // already has a card.
    let tries = 0, retry = null;
    const askZen = () => {
      retry = null;
      if (retired) return;
      const playing = document.querySelectorAll(".tabbrowser-tab[soundplaying]:not(zen-library *)");
      if (playing.length <= mediaBar.querySelectorAll(":scope > .zen-media-card.playing").length) return;
      for (const tab of playing) {
        const c = safe(() => tab.linkedBrowser.browsingContext.mediaController);
        if (c?.isActive && c.isPlaying) safe(() => window.gZenMediaController.onAudioPlaybackStarted(tab.linkedBrowser));
      }
      if (++tries < 8) retry = setTimeout(askZen, 2000);
    };
    const askSoon = () => { tries = 0; clearTimeout(retry); retry = setTimeout(askZen, 1500); };
    const onSound = e => { if (e.detail?.changed?.includes("soundplaying")) askSoon(); };
    window.addEventListener("TabAttrModified", onSound);
    watching(new MutationObserver(records => {
      if (records.some(r => [...r.removedNodes].some(n => n.classList?.contains("zen-media-card")))) askSoon();
    })).observe(mediaBar, { childList: true });
    askSoon();
    undo.push(() => { window.removeEventListener("TabAttrModified", onSound); clearTimeout(retry); });
  }

  // Retire: stop every source this window drives, put Zen's own controls
  // back, remove what was added, and release the actor once no window
  // still uses it. Sine calls this on disable and before an update loads
  // the new copy; the window's unload calls it too.
  const retire = () => {
    if (retired) return;
    retired = true;
    for (const info of actorRegistry.values()) safe(() => { info.stopTick(); info.setProcessingActive?.(false, "off", false); });
    actorRegistry.clear();
    availableSources.clear(); chosenSource = null;
    for (const fn of undo.splice(0).reverse()) safe(fn);
    for (const t of [animateOutTimer, captionHideTimer, captionExitTimer]) clearTimeout(t);
    isStreaming = false;
    activeUntil = 0;
    safe(clearReserve);
    for (const [nativeButton, toggle] of togglesByNativeButton) {
      toggle.remove();
      unparkNativePipButton(nativeButton);
    }
    togglesByNativeButton.clear();
    mediaBar?.style.removeProperty("--zen-media-collapsed-height");
    for (const el of [styleEl, pipContainer, captionContainer]) el.remove();
    delete window.ZzMediaflowController;
    delete window.__zzMediaflowLoaded;
    const others = [...Services.wm.getEnumerator("navigator:browser")].some(w => w !== window && w.ZzMediaflowController);
    if (!others) safe(() => ChromeUtils.unregisterWindowActor("ZzMediaflow"));
  };
  window.addEventListener("unload", retire, { once: true });
  safe(() => window.addUnloadListener?.(retire));

  log("Mediaflow initialized.");
})();
