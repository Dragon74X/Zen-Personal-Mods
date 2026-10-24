// Run once in Zen's Browser Console, then try Play/Pause, Back and Forward.
// Records DOM-delivered presses/releases even without a click or preview target.
// Copies once after 30 seconds, after removing its temporary observers.
(() => {
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  if (!win) throw new Error("No browser window found");
  win.__zzmfControlProbe?.stop();
  const doc = win.document, controller = win.ZzMediaflowController;
  const started = Date.now(), undo = [], timers = new Set(), actors = new WeakSet();
  let stopped = false, lastPlayback = null;
  const report = {
    probe: "mediaflow-controls-v2", browser: Services.appinfo.version,
    coverage: "DOM-delivered input in this browser window; cannot count OS-intercepted physical presses.",
    controllerPresent: !!controller, events: [], snapshots: [], counts: {},
    droppedEvents: 0, droppedSnapshots: 0,
  };
  const elapsed = () => Date.now() - started;
  const attempt = fn => { try { return fn(); } catch (e) { return { error: e.name }; } };
  const add = (type, data) => {
    report.counts[type] = (report.counts[type] || 0) + 1;
    report.events.push({ ms: elapsed(), type, ...data });
    if (report.events.length > 600) { report.events.shift(); report.droppedEvents++; }
  };
  const bounds = n => {
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const nodeName = n => buttonName(n) || (n === win ? 'window' : n?.localName) || null;
  const previousBounds = [];
  const inBounds = (x, y, r) => r && r.width > 0 && r.height > 0 &&
    x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn, true);
    undo.push(() => target.removeEventListener(type, fn, true));
  };
  const buttonName = node => node?.closest?.(".zzmf-pip-controls button")?.className || null;
  const later = (fn, ms) => {
    const id = win.setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, ms);
    timers.add(id);
  };
  // Forward every call unchanged; restore the exact prior property descriptor.
  function observeMethod(target, name, observe) {
    if (!target || typeof target[name] !== "function") return;
    const original = target[name], descriptor = Object.getOwnPropertyDescriptor(target, name);
    const wrapped = function (...args) {
      attempt(() => observe(...args));
      return Reflect.apply(original, this, args);
    };
    Object.defineProperty(target, name, { configurable: true, writable: true, value: wrapped });
    undo.push(() => {
      if (target[name] !== wrapped) return;
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    });
  }
  function source() {
    return attempt(() => {
      const bc = controller?.getActiveBC?.();
      if (!bc) return { active: false };
      const actor = bc.currentWindowGlobal?.getActor("ZzMediaflow");
      if (actor && !actors.has(actor)) {
        actors.add(actor);
        const result = attempt(() => observeMethod(actor, "sendAsyncMessage", (name, data) => {
          if (name === "ZenPiP:Control") add("command", { source: bc.id, action: data?.action, value: data?.value });
        }));
        if (result?.error) add("observer-unavailable", result);
      }
      return { active: true, id: bc.id, top: bc.top?.id,
        registered: !!controller.isSource?.(bc.id, actor), actorPresent: !!actor,
        parentForwardsControls: !!actor && String(actor.receiveMessage).includes("ZenPiP:Control"),
        sourceSelected: win.gBrowser.selectedBrowser?.browsingContext?.id === bc.top?.id };
    });
  }
  let lastGeometry = null;
  function snapshot(reason) {
    const preview = doc.getElementById("zen-sidebar-pip-container");
    const sidebar = win.gZenCompactModeManager?.sidebar;
    const rect = bounds(preview);
    if (rect?.width && rect.height && JSON.stringify(rect) !== JSON.stringify(previousBounds.at(-1))) {
      previousBounds.push(rect);
      if (previousBounds.length > 120) previousBounds.shift();
    }
    const ps = preview && win.getComputedStyle(preview);
    const buttons = [...doc.querySelectorAll(".zzmf-pip-controls button")].map(b => {
      const s = win.getComputedStyle(b), r = b.getBoundingClientRect();
      const hit = doc.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { name: b.className, disabled: b.disabled, display: s.display,
        visibility: s.visibility, opacity: s.opacity, pointerEvents: s.pointerEvents,
        rect: bounds(b), drag: s.getPropertyValue("-moz-window-dragging"),
        hit: nodeName(hit) };
    });
    const geometry = { rect, buttons, sidebar: bounds(sidebar),
      sidebarShown: sidebar?.getAttribute("zen-has-hover"),
      bar: bounds(doc.getElementById("zen-media-controls-toolbar")),
      visibility: ps?.visibility, opacity: ps?.opacity, display: ps?.display,
      pointerEvents: ps?.pointerEvents, drag: ps?.getPropertyValue("-moz-window-dragging"),
      transform: ps?.transform, hover: preview?.matches(":hover"),
      focusWithin: preview?.matches(":focus-within"), focus: nodeName(doc.activeElement),
      windowActive: Services.focus.activeWindow === win };
    const key = JSON.stringify(geometry);
    if (reason === "geometry" && key === lastGeometry) return;
    lastGeometry = key;
    report.snapshots.push({ ms: elapsed(), reason, source: source(), ...geometry,
      previewPresent: !!preview, paused: preview?.hasAttribute("zzmf-paused"),
      live: preview?.hasAttribute("zzmf-live"), controls: preview?.hasAttribute("zzmf-controls"),
      playback: lastPlayback });
    if (report.snapshots.length > 180) { report.snapshots.shift(); report.droppedSnapshots++; }
  }
  function copyReport() {
    const text = JSON.stringify(report, null, 2);
    try {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
      console.info("[Mediaflow probe] Report copied to clipboard.");
    } catch (e) {
      console.error("[Mediaflow probe] Clipboard failed:", e.name, text);
    }
    return text;
  }
  function stop() {
    if (stopped) return JSON.stringify(report, null, 2);
    attempt(() => snapshot("finished")); stopped = true;
    for (const id of timers) win.clearTimeout(id);
    for (const restore of undo.reverse()) attempt(restore);
    if (win.__zzmfControlProbe === instance) delete win.__zzmfControlProbe;
    return copyReport();
  }
  const instance = { stop };
  win.__zzmfControlProbe = instance;
  // Report the installed version, not a claim about cached actor versions.
  (async () => {
    const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const uri = Services.io.newURI(resources.resolveURI(Services.io.newURI("resource://zz-mediaflow/theme.json")));
    const metadata = await win.IOUtils.readJSON(uri.QueryInterface(Ci.nsIFileURL).file.path);
    if (!stopped) report.installedVersion = metadata.version;
  })().catch(e => { if (!stopped) add("metadata-unavailable", { error: e.name }); });
  const observed = attempt(() => observeMethod(controller, "updateControls", state => {
    const next = { time: state.time, duration: Number.isFinite(state.duration) ? state.duration : null, paused: state.paused };
    if (!lastPlayback || next.paused !== lastPlayback.paused || Math.abs(next.time - lastPlayback.time) > 2)
      add("playback", next);
    lastPlayback = next;
  }));
  if (observed?.error) add("observer-unavailable", observed);
  const input = event => {
    // No target filter: a moving/hidden preview can expose another chrome node.
    const x = event.clientX, y = event.clientY;
    const hit = Number.isFinite(x) && Number.isFinite(y) ? doc.elementFromPoint(x, y) : null;
    add(event.type, { target: nodeName(event.target), hit: nodeName(hit),
      x, y, screenX: event.screenX, screenY: event.screenY,
      button: event.button, buttons: event.buttons, pointerId: event.pointerId,
      trusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
      inPreviousPreview: previousBounds.some(r => inBounds(x, y, r)) });
    snapshot(event.type);
    later(() => snapshot("after " + event.type), 250);
  };
  for (const type of ["pointerdown", "pointerup", "pointercancel", "mousedown", "mouseup", "click", "dblclick", "gotpointercapture", "lostpointercapture"])
    listen(win, type, input);
  for (const type of ["activate", "deactivate", "sizemodechange"])
    listen(win, type, () => { add(type, {}); snapshot(type); });
  const preview = doc.getElementById("zen-sidebar-pip-container");
  if (preview) {
    for (const type of ["mouseenter", "mouseleave", "focusin", "focusout", "transitionrun", "transitionend", "transitioncancel"])
      listen(preview, type, event => {
        if ((type.startsWith("transition") || type.startsWith("mouse")) && event.target !== preview) return;
        add(type, { target: nodeName(event.target), related: nodeName(event.relatedTarget), property: event.propertyName });
        snapshot(type);
      });
    const resized = new win.ResizeObserver(() => snapshot("geometry"));
    resized.observe(preview);
    const changed = new win.MutationObserver(() => snapshot("geometry"));
    for (const n of [preview, win.gZenCompactModeManager?.sidebar, doc.getElementById("zen-media-controls-toolbar")])
      if (n) changed.observe(n, { attributes: true, attributeFilter: ["style", "class", "hidden", "zen-has-hover", "zen-user-show"] });
    undo.push(() => { resized.disconnect(); changed.disconnect(); });
  }
  win.addEventListener("unload", stop, { once: true });
  undo.push(() => win.removeEventListener("unload", stop));
  snapshot("started"); later(stop, 30000);
  console.info("[Mediaflow probe] Try Play/Pause, Back and Forward. Press/release and geometry capture active. Report copies once after 30 seconds.");
})();
