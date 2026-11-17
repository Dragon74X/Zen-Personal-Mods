// The longest captured edge when a tick names no size.
const FALLBACK_FRAME_DIMENSION = 480;
const CAPTION_TRACK_CHECK_MS = 2000;
// A video taken out of its document is paused there, and events at a detached
// element never reach the window's listeners.
const DETACHED_STOP_EVENTS = ["pause", "ended", "emptied"];

// youtube.com and youtube-nocookie.com, and their subdomains.
const isYouTubeHost = host => /(?:^|\.)youtube(?:-nocookie)?\.com$/.test(host);

export class ZzMediaflowChild extends JSWindowActorChild {
  actorCreated() {
    this._processingActive = false;
    this._captionsActive = false;
    this._captionMode = "off";
    this._lastCaptionText = "";
    this._captionText = "";
    this._captionCues = null;
    this._captionTrackKey = "";
    this._captionTrackCheckAt = 0;
    this._captionLoadSerial = 0;
    this._captionMissKey = "";
  }

  _encodeSize(w, h, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(w, h));
    let tw = Math.max(2, Math.round(w * scale));
    let th = Math.max(2, Math.round(h * scale));
    tw -= tw % 2;
    th -= th % 2;
    return { tw, th };
  }

  handleEvent(event) {
    const target = event.target;
    if (event.type === "DOMContentLoaded" || event.type === "pageshow") {
      this._scanForPlayingVideo();
      return;
    }

    if (!target || target.tagName !== "VIDEO") return;

    if (
      event.type === "play" ||
      event.type === "playing" ||
      event.type === "loadedmetadata" ||
      event.type === "canplay"
    ) {
      if (target === this._video && (event.type === "play" || event.type === "playing")) this._holdPaused = false;
      this._tryStart(target);
      if (target === this._video) this._sendPlaybackState();
      return;
    }

    if (event.type === "durationchange" || event.type === "seeked") {
      if (target === this._video && this._processingActive) this._sendPlaybackState();
      return;
    }

    if (event.type === "volumechange") {
      if (this._isAudible(target)) {
        if (!this._video && !target.paused && !target.ended) {
          this._tryStart(target);
        }
      } else if (target === this._video) {
        this._stopAndNotify("volumechange:muted");
      }
      return;
    }

    if (event.type === "pause" || event.type === "ended" || event.type === "emptied") {
      if (target !== this._video) return;
      // Paused from the preview's own controls: it stays up with a play button.
      if (event.type === "pause" && this._holdPaused) {
        this._sendPlaybackState();
        return;
      }
      this._stopAndNotify("event:" + event.type);
    }
  }

  _isAudible(video) {
    return !video.muted && video.volume > 0;
  }

  _scanForPlayingVideo() {
    if (this._video) return;
    let videos;
    try {
      videos = this.contentWindow?.document?.querySelectorAll("video");
    } catch (_) {
      return;
    }
    if (!videos) return;

    for (const video of videos) {
      if (
        !video.paused &&
        !video.ended &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        this._isAudible(video)
      ) {
        this._tryStart(video);
        break;
      }
    }
  }

  _tryStart(target) {
    if (this._video) return;
    if (target.paused || target.ended) return;
    if (target.readyState < 2 || target.videoWidth === 0) return;
    if (!this._isAudible(target)) return;

    this._attachVideoListeners(target);
    this._startMirror(target);
  }

  _attachVideoListeners(video) {
    const onDetached = e => {
      if (!video.isConnected) this._stopAndNotify("detached:" + e.type);
    };
    for (const type of DETACHED_STOP_EVENTS) video.addEventListener(type, onDetached);
    this._videoListeners = { onDetached };

    if (!this._pageHideBound) {
      this._pageHideBound = () => this._stopAndNotify("pagehide");
      this.contentWindow.addEventListener("pagehide", this._pageHideBound, {
        once: true,
      });
    }
  }

  _startMirror(video) {
    const srcWidth = video.videoWidth;
    const srcHeight = video.videoHeight;

    this._video = video;
    this.sendAsyncMessage("ZenPiP:MirrorStarted", {
      width: srcWidth,
      height: srcHeight,
    });
    this._sendPlaybackState();

    const doc = this.contentWindow?.document;
    if (doc && !this._visBound) {
      this._visBound = () => {
        const d = this.contentWindow?.document;
        if (d) this.sendAsyncMessage("ZenPiP:SourceVisibility", { hidden: d.hidden });
      };
      doc.addEventListener("visibilitychange", this._visBound);
    }
    if (doc) {
      this.sendAsyncMessage("ZenPiP:SourceVisibility", { hidden: doc.hidden });
    }
  }

  _isYouTubeDocument() {
    try {
      return isYouTubeHost(this.contentWindow?.location?.hostname || "");
    } catch (_) {
      return false;
    }
  }

  _startCaptionTracking() {
    if (!this._video || !this._captionsActive || this._captionMode === "off" ||
        !this._isYouTubeDocument()) {
      return;
    }
    if (this._captionRootObserver) {
      this._refreshCaptionRoot();
      this._syncCaption();
      return;
    }

    const win = this.contentWindow;
    const doc = win?.document;
    const player = doc?.querySelector(".html5-video-player") || doc?.documentElement;
    if (!win || !player) return;

    try {
      // This lightweight observer only looks for YouTube replacing its caption
      // container. Caption text itself is observed on the much smaller
      // container below, rather than on the entire player subtree.
      this._captionRootObserver = new win.MutationObserver(() => {
        this._refreshCaptionRoot();
      });
      this._captionRootObserver.observe(player, {
        childList: true,
        subtree: true,
      });

      const ccButton = doc.querySelector(".ytp-subtitles-button");
      if (ccButton) {
        this._ccButtonObserver = new win.MutationObserver(() => {
          this._queueCaptionSync();
        });
        this._ccButtonObserver.observe(ccButton, {
          attributes: true,
          attributeFilter: ["aria-pressed"],
        });
      }
    } catch (_) {
      this._captionRootObserver = null;
      this._ccButtonObserver = null;
    }
    this._refreshCaptionRoot();
    this._syncCaption();
  }

  _refreshCaptionRoot() {
    const win = this.contentWindow;
    const doc = win?.document;
    const nextRoot = doc?.querySelector(".ytp-caption-window-container") || null;
    if (nextRoot === this._captionRoot) return;

    try {
      this._captionObserver?.disconnect();
    } catch (_) {}
    this._captionObserver = null;
    this._captionRoot = nextRoot;

    if (win && nextRoot) {
      this._captionObserver = new win.MutationObserver(() => {
        this._queueCaptionSync();
      });
      this._captionObserver.observe(nextRoot, {
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-hidden"],
        subtree: true,
      });
    }
    this._queueCaptionSync();
  }

  // Loaded timed cues drive the caption from the clock; the page's caption
  // text is read only without them.
  _queueCaptionSync() {
    if (this._captionSyncQueued || !this._captionsActive || this._captionCues?.length) return;
    const win = this.contentWindow;
    if (!win) return;
    this._captionSyncQueued = true;
    win.queueMicrotask(() => {
      this._captionSyncQueued = false;
      const text = this._syncCaption();
      if (!this._captionCues?.length) this._sendCaption(text);
    });
  }

  _visibleCaptionText(root) {
    const win = this.contentWindow;
    if (!win || !root) return "";
    const pieces = [];
    const visit = (node) => {
      if (node.nodeType === 3) {
        pieces.push(node.nodeValue || "");
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.getAttribute("aria-hidden") === "true") return;
      const style = win.getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        Number.parseFloat(style.opacity) === 0
      ) {
        return;
      }
      for (const child of node.childNodes) visit(child);
    };
    visit(root);
    return pieces.join("").replace(/\s+/g, " ").trim();
  }

  _joinDistinctCaptionWindows(values) {
    const seen = new Set();
    const distinct = [];
    for (const value of values) {
      const normalized = String(value || "").replace(/\s+/g, " ").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      distinct.push(normalized);
    }
    return distinct.join(" ");
  }

  _sourceCaptionsEnabled() {
    if (this._captionMode === "on") return true;
    if (this._captionMode !== "youtube") return false;

    const ccButton = this.contentWindow?.document?.querySelector(".ytp-subtitles-button");
    return !!ccButton && (
      ccButton.getAttribute("aria-pressed") === "true" ||
      ccButton.classList.contains("ytp-button-active")
    );
  }

  _appendCaptionText(previous, next) {
    previous = String(previous || "").replace(/\s+/g, " ").trim();
    next = String(next || "").replace(/\s+/g, " ").trim();
    if (!previous) return next;
    if (!next || previous === next || previous.endsWith(` ${next}`)) {
      return previous;
    }
    if (next.startsWith(`${previous} `)) return next;

    const previousWords = previous.split(" ");
    const nextWords = next.split(" ");
    const maxOverlap = Math.min(previousWords.length, nextWords.length);
    for (let count = maxOverlap; count >= 2; count--) {
      if (
        previousWords.slice(-count).join(" ") ===
        nextWords.slice(0, count).join(" ")
      ) {
        return previousWords.concat(nextWords.slice(count)).join(" ");
      }
    }
    return `${previous} ${next}`;
  }

  _syncCaption() {
    if (!this._video || !this._captionsActive || this._captionMode === "off" ||
        !this._isYouTubeDocument()) {
      this._captionText = "";
      return "";
    }

    const doc = this.contentWindow?.document;
    if (!doc) return this._captionText;
    let text = "";
    if (this._sourceCaptionsEnabled()) {
      const windowParts = new Map();
      for (const segment of doc.querySelectorAll(".ytp-caption-segment")) {
        const windowEl = segment.closest(".caption-window");
        const windowStyle = windowEl
          ? this.contentWindow.getComputedStyle(windowEl)
          : null;
        if (
          windowStyle?.display === "none" ||
          windowStyle?.visibility === "hidden" ||
          windowStyle?.opacity === "0"
        ) {
          continue;
        }
        // YouTube sometimes inserts a complete automatic-caption cue and
        // reveals its descendants word by word. Reading only visible text
        // keeps those rolling words incremental instead of exposing the full
        // cue early.
        const value = this._visibleCaptionText(segment);
        if (!value) continue;
        const windowKey = windowEl || segment;
        const parts = windowParts.get(windowKey) || [];
        parts.push(value);
        windowParts.set(windowKey, parts);
      }
      text = this._joinDistinctCaptionWindows(
        Array.from(windowParts.values(), parts => parts.join(" ")),
      );
    }

    this._captionText = text;
    return text;
  }

  _extractJSONAt(text, start) {
    const objectStart = text.indexOf("{", start);
    if (objectStart < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = objectStart; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(objectStart, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
    return null;
  }

  _getInlinePlayerResponse(doc) {
    const marker = "ytInitialPlayerResponse";
    for (const script of doc?.scripts || []) {
      const text = script.textContent || "";
      let offset = 0;
      while ((offset = text.indexOf(marker, offset)) >= 0) {
        const response = this._extractJSONAt(text, offset + marker.length);
        if (response?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks?.length) {
          return response;
        }
        offset += marker.length;
      }
    }
    return null;
  }

  _getCaptionTrackInfo() {
    const win = this.contentWindow;
    const doc = win?.document;
    if (!win || !doc) return null;

    try {
      // Prefer the exact caption request YouTube's player made. It can contain
      // session-bound proof tokens that are absent from the public track URL
      // in ytInitialPlayerResponse. Resource timing keeps the request URL even
      // after YouTube has consumed its response.
      const resources = win.performance?.getEntriesByType?.("resource") || [];
      const pageUrl = new win.URL(win.location.href);
      const currentVideoId = pageUrl.searchParams.get("v") ||
        /^\/(?:shorts|embed|live)\/([^/?]+)/.exec(pageUrl.pathname)?.[1] ||
        "";
      for (let i = resources.length - 1; i >= 0; i--) {
        try {
          const url = new win.URL(resources[i].name);
          if (isYouTubeHost(url.hostname) &&
              url.pathname.endsWith("/api/timedtext")) {
            const resourceVideoId = url.searchParams.get("v") || "";
            if (currentVideoId && resourceVideoId &&
                resourceVideoId !== currentVideoId) {
              continue;
            }
            const baseUrl = url.href;
            return {
              baseUrl,
              translationCode: "",
              key: `loaded|${baseUrl}`,
            };
          }
        } catch (_) {}
      }

      const pageWindow = win.wrappedJSObject || win;
      const playerElement = doc.querySelector("#movie_player, .html5-video-player");
      const player = playerElement?.wrappedJSObject || playerElement;
      let playerResponse = null;
      try {
        playerResponse = player?.getPlayerResponse?.() || null;
      } catch (_) {}
      let globalResponse = null;
      try {
        globalResponse = pageWindow.ytInitialPlayerResponse || null;
      } catch (_) {}
      // The page's inline scripts are walked only when neither response
      // lists any tracks.
      const response = [playerResponse, globalResponse].find(candidate =>
        candidate?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks?.length,
      ) || this._getInlinePlayerResponse(doc);
      const renderer = response?.captions?.playerCaptionsTracklistRenderer;
      const tracks = Array.from(renderer?.captionTracks || []);
      if (!tracks.length) return null;

      let selected = null;
      let current = null;
      try {
        current = player?.getOption?.("captions", "track") || null;
      } catch (_) {}

      if (current) {
        selected = tracks.find(track =>
          current.vssId && track.vssId === current.vssId,
        ) || tracks.find(track =>
          current.languageCode &&
          track.languageCode === current.languageCode &&
          (!current.kind || track.kind === current.kind),
        );
      }

      if (!selected) {
        const audioIndex = Number(renderer.defaultAudioTrackIndex) || 0;
        const captionIndex = Number(
          renderer.audioTracks?.[audioIndex]?.defaultCaptionTrackIndex,
        );
        if (Number.isInteger(captionIndex)) selected = tracks[captionIndex];
      }
      selected ||= tracks[0];

      const baseUrl = String(selected?.baseUrl || "");
      if (!baseUrl) return null;
      const translationCode = String(
        current?.translationLanguage?.languageCode ||
        current?.translationLanguage?.id ||
        "",
      );
      const key = [baseUrl, translationCode].join("|");
      return { baseUrl, translationCode, key };
    } catch (_) {
      return null;
    }
  }

  _parseCaptionJSON3(data) {
    if (!Array.isArray(data?.events)) return [];
    const cues = [];
    for (const event of data.events) {
      if (!Array.isArray(event?.segs)) continue;
      const startMs = Number(event.tStartMs);
      if (!Number.isFinite(startMs)) continue;
      const durationMs = Number(event.dDurationMs);
      const endMs = startMs +
        (Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 3000);
      const segments = event.segs
        .map(segment => {
          const text = String(segment?.utf8 || "");
          const offsetMs = Number(segment?.tOffsetMs);
          return {
            text,
            startMs: startMs +
              (Number.isFinite(offsetMs) && offsetMs > 0 ? offsetMs : 0),
          };
        })
        .filter(segment => segment.text && segment.text !== "\n");
      if (!segments.length) continue;
      cues.push({
        startMs,
        endMs,
        segments,
        windowId: event.wWinId,
        append: Boolean(event.aAppend),
      });
    }
    return this._finalizeCaptionCues(cues);
  }

  _parseCaptionXML(text) {
    if (!text) return [];
    const parser = new this.contentWindow.DOMParser();
    const doc = parser.parseFromString(text, "text/xml");
    if (doc.querySelector("parsererror")) return [];
    const cues = [];

    for (const paragraph of doc.querySelectorAll("p")) {
      const startValue = paragraph.getAttribute("t");
      if (startValue === null) continue;
      const startMs = Number(startValue);
      if (!Number.isFinite(startMs)) continue;
      const durationMs = Number(paragraph.getAttribute("d"));
      const segments = Array.from(paragraph.querySelectorAll(":scope > s"))
        .map(segment => ({
          text: segment.textContent || "",
          startMs: startMs + (Number(segment.getAttribute("t")) || 0),
        }))
        .filter(segment => segment.text && segment.text !== "\n");
      if (!segments.length && paragraph.textContent) {
        segments.push({ text: paragraph.textContent, startMs });
      }
      if (!segments.length) continue;
      cues.push({
        startMs,
        endMs: startMs +
          (Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 3000),
        segments,
        windowId: paragraph.getAttribute("w") || undefined,
        append: paragraph.getAttribute("a") === "1",
      });
    }

    for (const node of doc.querySelectorAll("transcript > text")) {
      const startValue = node.getAttribute("start");
      if (startValue === null) continue;
      const startSeconds = Number(startValue);
      if (!Number.isFinite(startSeconds)) continue;
      const durationSeconds = Number(node.getAttribute("dur"));
      const startMs = startSeconds * 1000;
      const value = node.textContent || "";
      if (!value.trim()) continue;
      cues.push({
        startMs,
        endMs: startMs +
          (Number.isFinite(durationSeconds) && durationSeconds > 0
            ? durationSeconds * 1000
            : 3000),
        segments: [{ text: value, startMs }],
        windowId: undefined,
        append: false,
      });
    }
    return this._finalizeCaptionCues(cues);
  }

  _finalizeCaptionCues(cues) {
    cues.sort((a, b) => a.startMs - b.startMs);
    let maxEndThrough = -Infinity;
    for (const cue of cues) {
      maxEndThrough = Math.max(maxEndThrough, cue.endMs);
      cue.maxEndThrough = maxEndThrough;
    }
    return cues;
  }

  // Called from the caption clock while captions are wanted from this video.
  // A track that loaded, is loading or failed is not fetched again; another
  // track (the player's own request, a new language) is. A video with no
  // tracks is not looked at again until it plays something else.
  async _ensureCaptionTrack() {
    const now = this.contentWindow?.performance?.now?.() ?? Date.now();
    if (now < this._captionTrackCheckAt) return;
    this._captionTrackCheckAt = now + CAPTION_TRACK_CHECK_MS;
    const sourceKey = `${this.contentWindow.location.href}|${this._video.currentSrc}`;
    if (sourceKey === this._captionMissKey) return;

    const track = this._getCaptionTrackInfo();
    if (!track) {
      this._captionMissKey = sourceKey;
      return;
    }
    if (track.key === this._captionTrackKey) return;

    const serial = ++this._captionLoadSerial;
    this._captionTrackKey = track.key;
    this._captionCues = null;
    const video = this._video;
    try {
      const url = new this.contentWindow.URL(track.baseUrl);
      if (!isYouTubeHost(url.hostname)) throw new Error("Unexpected caption host");
      if (track.translationCode) {
        url.searchParams.set("tlang", track.translationCode);
      }
      let cues = [];
      for (const format of ["json3", "srv3", ""]) {
        if (format) url.searchParams.set("fmt", format);
        else url.searchParams.delete("fmt");
        const response = await this.contentWindow.fetch(url.href, {
          credentials: "include",
        });
        if (!response.ok) continue;
        const body = await response.text();
        if (!body) continue;
        if (format === "json3") {
          try {
            cues = this._parseCaptionJSON3(JSON.parse(body));
          } catch (_) {
            cues = [];
          }
        } else {
          cues = this._parseCaptionXML(body);
        }
        if (cues.length) break;
      }
      if (!cues.length) throw new Error("Caption track contained no cues");
      if (serial !== this._captionLoadSerial || video !== this._video) return;
      this._captionCues = cues;
      this._updateCaptionFromClock();
    } catch (_) {
      // The caption is read from the page instead.
    }
  }

  _timedCaptionAt(timeMs) {
    const cues = this._captionCues;
    if (!cues?.length) return "";

    // Find the last cue that has started, then walk backward only while some
    // earlier cue can still be active. The prefix maximum handles unusually
    // long manual cues without scanning the full transcript on every tick.
    let low = 0;
    let high = cues.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (cues[mid].startMs <= timeMs) low = mid + 1;
      else high = mid;
    }

    const active = [];
    for (let i = low - 1; i >= 0; i--) {
      const cue = cues[i];
      if (cue.maxEndThrough <= timeMs) break;
      if (timeMs < cue.endMs) active.push([i, cue]);
    }
    active.reverse();

    const windows = new Map();
    for (const [i, cue] of active) {
      const text = cue.segments
        .filter(segment => segment.startMs <= timeMs + 25)
        .map(segment => segment.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const windowKey = cue.windowId ?? `cue-${i}`;
      const previous = windows.get(windowKey) || "";
      windows.set(
        windowKey,
        cue.append && previous
          ? this._appendCaptionText(previous, text)
          : text,
      );
    }
    return this._joinDistinctCaptionWindows(windows.values());
  }

  _updateCaptionFromClock() {
    if (!this._video || !this._captionsActive || this._captionMode === "off" ||
        !this._isYouTubeDocument()) {
      return;
    }
    let text = "";
    if (this._sourceCaptionsEnabled()) {
      this._ensureCaptionTrack();
      text = this._captionCues
        ? this._timedCaptionAt(this._video.currentTime * 1000)
        : this._syncCaption();
    }
    this._sendCaption(text);
  }

  _sendCaption(text) {
    if (text === this._lastCaptionText) return;
    this._lastCaptionText = text;
    try {
      this.sendAsyncMessage("ZenPiP:Caption", { text });
    } catch (_) {}
  }

  _stopCaptionTracking(clear = true) {
    try {
      this._captionObserver?.disconnect();
      this._captionRootObserver?.disconnect();
      this._ccButtonObserver?.disconnect();
    } catch (_) {}
    this._captionObserver = null;
    this._captionRootObserver = null;
    this._captionRoot = null;
    this._ccButtonObserver = null;
    this._captionSyncQueued = false;
    this._captionText = "";
    if (clear) {
      this._captionLoadSerial++;
      this._captionCues = null;
      this._captionTrackKey = "";
      this._captionTrackCheckAt = 0;
      this._captionMissKey = "";
      this._sendCaption("");
    }
  }

  _setProcessingActive(
    active,
    captionMode = "off",
    captionsActive = active,
  ) {
    active = Boolean(active);
    captionMode = captionMode === "on" || captionMode === "youtube"
      ? captionMode
      : "off";
    captionsActive = Boolean(captionsActive) && captionMode !== "off";
    if (this._processingActive === active &&
        this._captionMode === captionMode &&
        this._captionsActive === captionsActive) return;
    this._processingActive = active;
    this._captionMode = captionMode;
    this._captionsActive = captionsActive;
    if (active) {
      // The chrome canvas may now contain another source. Restore even a
      // held paused frame once when this source becomes visible again.
      this._sentAt = undefined;
      this._sendPlaybackState();
    }
    if (captionsActive) {
      this._startCaptionTracking();
    } else {
      this._stopCaptionTracking(captionMode === "off");
    }
  }

  _ensureScaleContext(tw, th) {
    if (this._scaleCtx) return this._scaleCtx;
    try {
      this._scaleCanvas = new this.contentWindow.OffscreenCanvas(tw, th);
      this._scaleCtx = this._scaleCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    } catch (_) {
      this._stopAndNotify("canvas:construct");
    }
    return this._scaleCtx;
  }

  _captureFrame(quality) {
    const video = this._video;
    if (!video || !this._processingActive) return;
    if (!(video.videoWidth > 0) || video.readyState < 2) return;
    // Note: we intentionally do NOT bail on video.seeking here. Holding the
    // last frame through a fast-forward reads as a disruptive "buffering"
    // freeze, and for music videos the visual is secondary — keeping the feed
    // live is preferable to a stall.

    // A held pause sends one still frame (and one after each seek), then the
    // parent's keepalive tick is all that runs.
    if (video.paused && this._sentAt === video.currentTime) return;

    const maxDim = parseInt(quality, 10) || FALLBACK_FRAME_DIMENSION;
    const { tw, th } = this._encodeSize(video.videoWidth, video.videoHeight, maxDim);

    const ctx = this._ensureScaleContext(tw, th);
    const canvas = this._scaleCanvas;
    if (!ctx || !canvas) return;
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }

    try {
      // Synchronous downscale + readback, shipped as a transferable RGBA
      // buffer. An ImageBitmap cannot cross the JSActor boundary — Gecko's
      // structured clone restricts it to same-process scope — so a copied
      // ArrayBuffer is the wire format. willReadFrequently keeps the
      // getImageData readback cheap.
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.sendAsyncMessage("ZenPiP:Frame", {
        buf: img.data.buffer,
        width: canvas.width,
        height: canvas.height,
        // Preserve progress at the capture cadence; state events still update
        // play/pause and seeks when an unchanged bitmap is suppressed.
        time: video.currentTime,
        duration: video.duration,
        paused: video.paused,
      }, [img.data.buffer]);
      this._sentAt = video.seeking ? undefined : video.currentTime;
    } catch (_) {}
  }

  _sendPlaybackState() {
    const video = this._video;
    if (!video) return;
    // Native media events update controls even when a paused bitmap is unchanged.
    this.sendAsyncMessage("ZenPiP:PlaybackState", {
      time: video.currentTime,
      duration: video.duration,
      paused: video.paused,
    });
  }

  _stopAndNotify(reason) {
    if (!this._video) return;
    this._teardown();
    try {
      this.sendAsyncMessage("ZenPiP:VideoStopped", { reason });
    } catch (e) {}
  }

  _teardown() {
    this._stopCaptionTracking(true);
    if (this._video && this._videoListeners) {
      try {
        for (const type of DETACHED_STOP_EVENTS) {
          this._video.removeEventListener(type, this._videoListeners.onDetached);
        }
      } catch (_) {}
    }
    if (this._pageHideBound) {
      try {
        this.contentWindow?.removeEventListener("pagehide", this._pageHideBound);
      } catch (_) {}
      this._pageHideBound = null;
    }
    if (this._visBound) {
      try {
        this.contentWindow?.document.removeEventListener("visibilitychange", this._visBound);
      } catch (_) {}
      this._visBound = null;
    }
    this._video = null;
    this._holdPaused = false;
    this._sentAt = undefined;
    this._videoListeners = null;
    this._scaleCanvas = null;
    this._scaleCtx = null;
    // The parent sends no state to a stopped source; the next video here
    // waits for its own.
    this._processingActive = false;
    this._captionsActive = false;
  }

  async receiveMessage(msg) {
    if (msg.name === "ZenPiP:Tick") {
      // No doc.hidden gate here: the mirror is shown precisely when the
      // source tab is backgrounded, so hidden is the state we capture in.
      // Visibility gating is controlled by the chrome-window controller.
      this._captureFrame(msg.data?.quality);
      return;
    }
    if (msg.name === "ZenPiP:CaptionTick") {
      this._updateCaptionFromClock();
      return;
    }
    // Sent as Mediaflow starts: a video already playing then sends no event.
    if (msg.name === "ZenPiP:Scan") {
      this._scanForPlayingVideo();
      return;
    }
    if (msg.name === "ZenPiP:Control") {
      this._control(msg.data?.action, msg.data?.value);
      return;
    }
    // A state sent before the parent heard of the stop is stale.
    if (msg.name === "ZenPiP:SetProcessingState" && this._video) {
      this._setProcessingActive(
        msg.data?.active,
        msg.data?.captionMode,
        msg.data?.captionsActive,
      );
    }
  }

  // The preview's controls act on the mirrored video itself.
  _control(action, value) {
    const video = this._video;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    if (action === "toggle") {
      if (video.paused) {
        this._holdPaused = false;
        video.play()?.catch?.(() => {});
      } else {
        this._holdPaused = true;
        video.pause();
      }
    } else if (action === "seekBy" && Number.isFinite(value)) {
      video.currentTime = Math.max(0, Math.min(end, video.currentTime + value));
    } else if (action === "seekTo" && Number.isFinite(value) && Number.isFinite(end)) {
      video.currentTime = Math.max(0, Math.min(1, value)) * end;
    } else if (action === "popout") {
      // Firefox's keyboard command chooses a document-wide candidate. Pass the
      // mirrored element to its native launcher instead.
      this.manager.getActor("PictureInPictureLauncher")
        .togglePictureInPicture({ video }).catch(() => {});
    }
  }

  didDestroy() {
    this._teardown();
  }
}
