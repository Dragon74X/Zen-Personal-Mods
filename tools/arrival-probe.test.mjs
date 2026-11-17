import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
const source = await readFile(new URL('./arrival-probe.js', import.meta.url), 'utf8');
const guide = await readFile(new URL('./ARRIVAL-PROBE.md', import.meta.url), 'utf8');
const XHTML = 'http://www.w3.org/1999/xhtml', MARK = Symbol.for('zzrouter.switchToTabHavingURI'), ACCENT = [10, 20, 250];
const secret = 'PRIVATE_PERSON';

// A small Zen: windows with synced tab copies, Firefox's switch to an open tab,
// and Tab Router 1.45.1 (exposed markArrival, shared switch patch, own
// switchIfNeeded) or 1.45.0 (an internal fixed ring, nothing exposed). Rings are
// drawn with inset shadows as released, or with borders (ring: 'border') as the
// Windows ring fix draws them. styleReads counts getComputedStyle calls.
// entry: the code the Browser Console runs (the probe itself, or the loader that fetches it).
function zen({ router = '1.45.1', windows: count = 2, lateRouter = false, ring: ringKind = 'shadow', zenSplitView = false, entry = source } = {}) {
  let time = 0, serial = 0, active = null, copied, syncing = false, styleReads = 0, snapshots = 0;
  const files = new Map(), fetched = [];
  const queue = new Map(), observers = new Map(), logs = [], windows = [];
  const clock = { setTimeout(fn, ms) { const id = ++serial; queue.set(id, { at: time + ms, fn }); return id; }, clearTimeout(id) { queue.delete(id); } };
  const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
  async function advance(ms) {
    await flush();
    const end = time + ms;
    for (;;) {
      const next = [...queue].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = Math.max(time, next[1].at); queue.delete(next[0]); next[1].fn(); await flush();
    }
    time = end; await flush();
  }
  const uri = spec => { const u = new URL(spec), web = /^https?:$/.test(u.protocol);
    return { spec, displaySpec: spec, scheme: u.protocol.slice(0, -1), filePath: u.pathname, get host() { if (!web) throw Error('no host'); return u.hostname; } }; };
  const helper = {};
  const nativeSwitch = function (win, target) {
    for (const w of [win, ...windows.filter(x => x !== win)]) {
      const browser = w.gBrowser.browsers.find(b => b.currentURI.spec === target.spec);
      if (browser) { w.focus(); w.gZenWorkspaces.switchIfNeeded(browser); return true; }
    }
    return false;
  };
  helper.switchToTabHavingURI = nativeSwitch;
  if (router === '1.45.1') {
    const patched = function (...args) { const outer = patched.switchingFrom; patched.switchingFrom = active; try { return nativeSwitch.apply(this, args); } finally { patched.switchingFrom = outer; } };
    patched[MARK] = nativeSwitch; helper.switchToTabHavingURI = patched;
  }
  const original = { uri: helper.switchToTabHavingURI };
  function element(doc, props = {}) {
    const attrs = new Map(), el = { localName: 'div', namespaceURI: XHTML, style: {}, classes: [], ownerDocument: doc, isConnected: true,
      getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, String(v)), hasAttribute: k => attrs.has(k), ...props };
    el.classList = { contains: c => el.classes.includes(c) };
    return el;
  }
  function makeWindow(n) {
    const listeners = new Map(), docListeners = new Map(), rings = new Set(), mutationObservers = [];
    const on = map => ({ add(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); }, remove(type, fn) { map.get(type)?.delete(fn); } });
    const doc = { hidden: false, hasFocus: () => active === win, querySelectorAll: () => [...rings],
      addEventListener: (t, f) => on(docListeners).add(t, f), removeEventListener: (t, f) => on(docListeners).remove(t, f),
      createElementNS(ns, tag) {
        if (tag !== 'canvas') return element(doc);
        return { width: 0, height: 0, getContext: () => ({ bitmap: null, drawImage(b) { this.bitmap = b; }, scale() {}, drawWindow() { throw Error('drawSnapshot expected'); },
          getImageData(x, y, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < data.length; i += 4) data.set([...(this.bitmap?.ring ? ACCENT : [255, 255, 255]), 255], i); return { data }; } }) };
      } };
    doc.documentElement = element(doc, { localName: 'html' });
    // No ownerGlobal: Zen 1.24.2b chrome code reaches a tab's window through its document.
    doc.documentElement.setAttribute('windowtype', 'navigator:browser');
    const page = element(doc), stack = element(doc);
    page.classes.push('browserSidebarContainer'); stack.classes.push('tab-stack');
    const proto = { switchIfNeeded(browser) { win.gBrowser.selectedTab = win.gBrowser.getTabForBrowser(browser); return Promise.resolve(); }, switchTabIfNeeded(tab) { win.gBrowser.selectedTab = tab; return Promise.resolve(); } };
    const ws = Object.assign(Object.create(proto), { activeWorkspace: 'space' });
    const win = { name: 'W' + n, closed: false, document: doc, windowState: 3, isFullyOccluded: false, devicePixelRatio: 1, screenX: n * 900, screenY: 0, outerWidth: 900, outerHeight: 1000,
      screen: { left: 0, top: 0, width: 1920, height: 1080 }, toolbar: { visible: true }, windowUtils: { layerManagerType: 'WebRender' }, gZenWorkspaces: ws,
      gBrowserInit: { delayedStartupFinished: true }, gZenStartup: { promiseInitialized: Promise.resolve() }, rings, mutationObservers, listeners, docListeners, page,
      SessionStore: { setCustomTabValue(tab, k, v) { tab.custom[k] = v; } }, DOMRect: class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } },
      // A snapshot holds the main thread for a moment (150 ms here), as it does in Zen.
      browsingContext: { isActive: true, currentWindowGlobal: { drawSnapshot: async (rect) => { const ring = [...rings].some(r => r.opacity() > 0.2); snapshots++; time += 150;
        return { ring, width: rect.width, close() {} }; } } },
      matchMedia: () => ({ matches: false }), AbortSignal: { timeout: ms => ({ timeout: ms }) },
      fetch: async url => { fetched.push(url); if (url.startsWith('https://')) return { ok: true, status: 200, text: async () => source };
        return { json: async () => ({ version: url.includes('tab-router') ? router : secret }) }; },
      getComputedStyle: el => { styleReads++; return { opacity: String(el.opacity ? el.opacity() : 1), boxShadow: el.style.boxShadow || 'none',
        borderTopColor: /rgb\([^)]*\)/.exec(el.style.border || '')?.[0] || 'rgb(0, 0, 0)', getPropertyValue: () => 'rgb(10, 20, 250)' }; },
      addEventListener: (t, f) => on(listeners).add(t, f), removeEventListener: (t, f) => on(listeners).remove(t, f),
      requestAnimationFrame: fn => clock.setTimeout(() => { fn(time); win.emit('MozAfterPaint'); }, 16), cancelAnimationFrame: id => clock.clearTimeout(id),
      emit(type, data = {}) { for (const fn of [...listeners.get(type) || []]) fn({ type, target: doc, ...data }); },
      mutate(record) { for (const o of mutationObservers) if (o.active) queueMicrotask(() => o.active && o.callback([record])); },
      MutationObserver: class { constructor(callback) { this.callback = callback; this.active = false; mutationObservers.push(this); } observe() { this.active = true; } disconnect() { this.active = false; } },
      focus() { if (active === win) return; const before = active; active = win; before?.emit('deactivate'); win.emit('activate'); },
      close() {
        win.closed = true; windows.splice(windows.indexOf(win), 1); if (active === win) active = null;
        // Zen hands a closing window's live pages to the copies in another window.
        for (const tab of gBrowser.tabs) for (const w of windows) for (const copy of w.gBrowser.tabs) if (copy.id === tab.id && /^http/.test(tab.linkedBrowser.currentURI.spec)) copy.linkedBrowser.currentURI = tab.linkedBrowser.currentURI;
        for (const fn of [...docListeners.get('unload') || []]) fn({}); win.emit('unload');
      },
      switchToTabHavingURI: (...args) => helper.switchToTabHavingURI(win, ...args),
      OpenBrowserWindow() { const w = makeWindow(windows.length + 1); windows.push(w); w.addTab('about:blank').setAttribute('zen-empty-tab', 'true'); w.gBrowser.selectedTab = w.gBrowser.tabs[0];
        clock.setTimeout(() => { observers.get('browser-delayed-startup-finished')?.observe(w); w.focus(); }, 100);
        // Sine starts a new window's scripts after its delayed startup.
        if (lateRouter) clock.setTimeout(() => { w.TabRouter = makeRouter(w); }, 400); else w.TabRouter = makeRouter(w);
        return w; } };
    const gBrowser = win.gBrowser = { tabs: [], current: null, get selectedTab() { return this.current; },
      set selectedTab(tab) { const before = this.current; this.current = tab; if (before !== tab) win.emit('TabSelect', { target: tab }); },
      get browsers() { return this.tabs.map(t => t.linkedBrowser); }, getTabForBrowser: b => gBrowser.tabs.find(t => t.linkedBrowser === b),
      addTab(url, { id = 'tab' + ++serial, copy = false } = {}) { const tab = element(doc, { localName: 'tab', id, closing: false, custom: {}, linkedBrowser: { currentURI: uri(url) } });
        Object.defineProperty(tab, 'selected', { get: () => gBrowser.current === tab }); gBrowser.tabs.push(tab);
        if (syncing && !copy) for (const w of windows) if (w !== win) w.gBrowser.addTab('about:blank', { id, copy: true });
        return tab; },
      removeTab(tab) {
        if (tab.closing) return;
        tab.closing = true; tab.isConnected = false; gBrowser.tabs.splice(gBrowser.tabs.indexOf(tab), 1); if (gBrowser.current === tab) gBrowser.current = gBrowser.tabs[0];
        if (syncing) clock.setTimeout(() => { for (const w of windows) for (const copy of w.gBrowser.tabs.filter(t => t.id === tab.id)) w.gBrowser.removeTab(copy); }, 10);
      } };
    win.addTab = url => gBrowser.addTab(url);
    doc.defaultView = win;
    // Tab Router's ring: 1.45.1's inset shadow over 900 ms, or the border ring (full
    // strength at 12 %, held to 55 %, 1100 ms). Opacity is the animation's alone.
    win.ring = (holder, position) => {
      const node = element(doc), born = time, border = ringKind === 'border', duration = border ? 1100 : 900;
      const keys = border ? [[0, 0, 'ease-out'], [0.12, 1, 'linear'], [0.55, 1, 'ease-in-out'], [1, 0, 'linear']] : [[0, 0, 'linear'], [0.3, 1, 'linear'], [1, 0, 'linear']];
      node.setAttribute('aria-hidden', 'true');
      Object.assign(node.style, { position, zIndex: '1', pointerEvents: 'none', opacity: '0' }, border ? { border: '2px solid rgb(10, 20, 250)', boxSizing: 'border-box' }
        : { boxShadow: 'rgb(10, 20, 250) 0px 0px 0px 2px inset, color-mix(in srgb, rgb(10, 20, 250) 40%, transparent) 0px 0px 28px 0px inset' });
      node.parentNode = holder; node.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 500 });
      const progress = () => { const t = (time - born) / duration; return node.isConnected && t >= 0 && t <= 1 ? t : null; };
      node.opacity = () => { const p = progress(); if (p === null) return 0; let i = 0; while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
        const [a, b] = [keys[i], keys[i + 1]]; return a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0]); };
      node.getAnimations = () => [{ get currentTime() { return time - born; }, effect: { getTiming: () => ({ duration, easing: 'linear' }),
        getComputedTiming: () => ({ progress: progress() }),
        getKeyframes: () => keys.map(([offset, opacity, easing]) => ({ offset, computedOffset: offset, easing, composite: 'auto', opacity: String(opacity) })) } }];
      node.remove = () => { if (!node.isConnected) return; node.isConnected = false; rings.delete(node); win.mutate({ addedNodes: [], removedNodes: [node] }); };
      rings.add(node); win.mutate({ addedNodes: [node], removedNodes: [] });
      clock.setTimeout(() => node.remove(), duration);
    };
    return win;
  }
  function makeRouter(win) {
    const mark = () => win.requestAnimationFrame(() => { win.ring(win.page, 'absolute'); });
    const switchTo = tab => {
      const dest = tab.ownerDocument.defaultView, here = active;
      if (router === '1.45.0') { if (dest !== win) dest.focus(); dest.gBrowser.selectedTab = tab; if (dest !== win) dest.requestAnimationFrame(() => dest.ring(dest.document.documentElement, 'fixed')); return; }
      if (dest !== here) dest.focus();
      dest.gBrowser.selectedTab = tab;
      if (here && dest !== here) dest.TabRouter?.markArrival?.(tab, Promise.resolve());
    };
    const api = { copyWhile: fn => fn(), switchIfOpen(url) {
      const tab = [win, ...windows.filter(w => w !== win)].flatMap(w => w.gBrowser.tabs).find(t => t.linkedBrowser.currentURI.spec === url);
      if (!tab) return false; switchTo(tab); return true; } };
    if (router === '1.45.1') {
      api.markArrival = function markArrival() { mark(); };
      const ws = win.gZenWorkspaces, native = ws.switchIfNeeded;
      ws.switchIfNeeded = function switchIfNeeded(browser) {
        const from = helper.switchToTabHavingURI.switchingFrom, result = native.apply(this, arguments);
        if (from && from !== win) mark();
        return result;
      };
    }
    return api;
  }
  for (let i = 1; i <= count; i++) windows.push(makeWindow(i));
  const [O, D] = windows;
  O.gBrowser.selectedTab = O.addTab(`https://user:${secret}@origin.example/${secret}/a?q=${secret}`);
  if (zenSplitView) O.gBrowser.selectedTab.splitView = true; // Zen's own split view (Firefox's is `splitview`)
  if (D) {
    // Synced copies: the live page b is in D; O's copy of it is blank.
    D.addTab(`https://user:${secret}@origin.example/${secret}/a?q=${secret}`).linkedBrowser.currentURI = uri('about:blank');
    D.gBrowser.selectedTab = D.gBrowser.addTab(`https://www.dest.example/${secret}/b?token=${secret}#${secret}`, { id: 'b' });
    O.gBrowser.addTab('about:blank', { id: 'b' });
  }
  for (const w of windows) w.TabRouter = makeRouter(w);
  if (router === '1.45.0') for (const w of windows) delete w.TabRouter.markArrival;
  const originals = windows.map(w => ({ w, markArrival: w.TabRouter.markArrival, ownSwitch: Object.getOwnPropertyDescriptor(w.gZenWorkspaces, 'switchIfNeeded') }));
  active = O; syncing = true;
  const prefs = { getPrefType: k => k === 'zen.window-sync.enabled' || k.startsWith('widget.') ? 128 : k === 'layout.frame_rate' ? 64 : k === 'zzrouter.rules' ? 32 : 0,
    getBoolPref: () => true, getIntPref: () => -1, getStringPref: () => 'https://' + secret, getChildList: () => ['zen.window-sync.enabled'] };
  const Services = { prefs, focus: { get activeWindow() { return active; } },
    wm: { getEnumerator: () => windows.filter(w => !w.closed), getMostRecentWindow: () => O, getZOrderDOMWindowEnumerator() { throw Error('not implemented'); } },
    appinfo: { OS: 'WINNT', version: '1.24.2b', platformVersion: '160.0' }, sysinfo: { getProperty: () => '10.0' },
    obs: { addObserver(o, topic) { observers.set(topic, o); }, removeObserver(o, topic) { if (observers.get(topic) === o) observers.delete(topic); } },
    scriptSecurityManager: { getSystemPrincipal: () => ({}) },
    dirsvc: { get: key => key === 'TmpD' ? { path: '/tmp', append(name) { this.path += '/' + name; }, createUnique() { this.path = this.path.replace(/\.js$/, '-1.js'); } }
      : { path: '/home/' + secret + '/profile' } },
    io: { newFileURI: file => ({ spec: 'file://' + file.path }) },
    // Firefox's local-file script loader: runs the file into the target window, returning its value.
    scriptloader: { loadSubScriptWithOptions(spec, options) {
      assert.ok(windows.includes(options.target) && options.wantReturnValue && options.allowUnsafeURL, 'loaded into a browser window, with its value');
      return vm.runInContext(files.get(spec.replace(/^file:\/\//, '')), context);
    } } };
  const ChromeUtils = { now: () => time, importESModule(path) {
    if (path.endsWith('Timer.sys.mjs')) return clock;
    if (path.endsWith('URILoadingHelper.sys.mjs')) return { URILoadingHelper: helper };
    if (path.endsWith('PrivateBrowsingUtils.sys.mjs')) return { PrivateBrowsingUtils: { isWindowPrivate: () => false } };
    if (path.endsWith('WindowsVersionInfo.sys.mjs')) return { WindowsVersionInfo: { get: () => ({ buildNumber: 22631 }) } };
    throw Error(secret);
  } };
  const IOUtils = { writeUTF8: async (path, text) => { files.set(path, text); }, remove: async path => { files.delete(path); }, readJSON: async () => ({ 'zz-tab-router': { version: router, updatedAt: '2026-11-17T07:12:54Z', enabled: true, homepage: secret }, [secret]: { version: secret } }) };
  const Cc = { '@mozilla.org/widget/clipboardhelper;1': { getService: () => ({ copyString: text => { copied = text; } }) } };
  const context = vm.createContext({ Services, ChromeUtils, IOUtils, Cc, Ci: { nsIFile: {}, nsIClipboardHelper: {} }, PathUtils: { join: (...p) => p.join('/') },
    console: { log: (...args) => logs.push(args) }, Math, JSON, Promise, Symbol, Object, Number, String, Error, URL, Uint8ClampedArray, queueMicrotask });
  const result = vm.runInContext(entry, context);
  return { windows, O, D, helper, original, originals, queue, observers, logs, result, advance, flush, uri, jump: ms => { time += ms; },
    get time() { return time; }, get copied() { return copied; }, get active() { return active; }, get styleReads() { return styleReads; }, get snapshots() { return snapshots; }, files, fetched };
}
const plain = value => JSON.parse(JSON.stringify(value));
function clean(z, result) {
  const payload = JSON.stringify([result, z.copied, z.logs]);
  for (const text of [secret, 'user:', '/b', 'token', 'q=', 'https://', '/home/']) assert.ok(!payload.includes(text), 'report leaks ' + text);
  assert.deepEqual(JSON.parse(z.copied), plain(result), 'the copied report is the returned one');
  assert.equal(z.queue.size, 0, 'no timer or frame callback left');
  assert.equal(z.observers.size, 0, 'new-window observer removed');
  assert.equal(z.helper.switchToTabHavingURI, z.original.uri, 'Firefox switch restored');
  assert.equal(Object.getOwnPropertyDescriptor(z.helper.switchToTabHavingURI, 'switchingFrom')?.get, undefined, 'switch note is plain data again');
  for (const { w, markArrival, ownSwitch } of z.originals) {
    if (w.closed) continue;
    assert.equal(w.TabRouter.markArrival, markArrival);
    assert.deepEqual(Object.getOwnPropertyDescriptor(w.gZenWorkspaces, 'switchIfNeeded'), ownSwitch);
    assert.equal(w.__zzArrivalProbe, undefined);
    for (const set of [...w.listeners.values(), ...w.docListeners.values()]) assert.equal(set.size, 0, 'listeners removed from ' + w.name);
    assert.ok(w.mutationObservers.every(o => !o.active), 'mutation observers disconnected');
  }
}

test('Tab Router 1.45.1: the automatic switches reach the other window and ring, only the pixels switch snapshots; your own switches are recorded within bounds', async () => {
  const z = zen();
  await z.advance(9000);
  assert.equal(z.O.__zzArrivalProbe.phase, 'passive');
  // Your switch: a link to a page open in the other window, then a burst of selections.
  z.O.TabRouter.switchIfOpen(z.D.gBrowser.tabs[1].linkedBrowser.currentURI.spec);
  await z.advance(2000);
  z.O.focus(); // back with Alt+Tab: a plain activation
  await z.advance(500);
  for (let i = 0; i < 300; i++) z.D.gBrowser.selectedTab = z.D.gBrowser.tabs[i % 2];
  await z.advance(40000);
  const result = plain(await z.result);
  assert.equal(result.status, 'completed');
  assert.ok(result.elapsedMs <= 75000);
  assert.deepEqual(result.mods['tab-router'].registry, { version: '1.45.1', updatedAt: '2026-11-17T07:12:54Z', enabled: true, noUpdates: false });
  assert.equal(result.runtime.switchToTabPatched, true);
  assert.deepEqual(result.runtime.windows.map(w => [w.win, w.markArrival, w.switchIfNeededWrapped]), [['W1', true, true], ['W2', true, true]]);
  assert.equal(result.env.osBuild, 22631);
  assert.equal(result.env.prefs['zzrouter.rules'], undefined);
  assert.deepEqual(result.auto.target, { source: 'selected', host: 'www.dest.example', container: 0, originCopy: { pending: false, web: false } });
  assert.deepEqual([result.auto.originNativeSplitView, result.auto.originZenSplitView], [false, false]);
  const [uri, routed, pixels] = result.auto.paths;
  assert.deepEqual(result.auto.paths.map(row => row.path), ['switchToTabHavingURI', 'tabRouterSwitchIfOpen', 'pixels']);
  assert.deepEqual(uri.calls.switchToTabHavingURI, ['W1']);
  assert.deepEqual(uri.calls.switchIfNeeded.map(c => [c.win, c.switchingFrom]), [['W2', 'W1']]);
  assert.deepEqual(routed.calls.markArrival.map(c => c.win), ['W2']);
  assert.equal(pixels.via, 'tabRouterSwitchIfOpen'); assert.deepEqual(pixels.calls.markArrival.map(c => c.win), ['W2']);
  for (const row of [uri, routed, pixels]) {
    assert.equal(row.returned, true); assert.equal(row.after.landed, 'destination'); assert.equal(row.after.destination.active, true);
    assert.equal(row.rings.length, 1);
    const ring = result.rings[row.rings[0]];
    assert.equal(ring.win, 'W2'); assert.equal(ring.holder, 'browserSidebarContainer'); assert.equal(ring.position, 'absolute');
    assert.ok(ring.frames > 40 && ring.maxOpacity > 0.9 && ring.removedAfterMs >= 880, 'ring tracked through its fade');
    assert.equal(ring.opacity.length, 40, 'opacity samples bounded');
    assert.equal(ring.style, 'box-shadow'); assert.equal(ring.opacitySource, 'animation'); assert.deepEqual(ring.accent, ACCENT);
  }
  // Only the pixels switch snapshots (a snapshot stalls the window): the others keep every frame.
  for (const ring of [uri, routed].map(row => result.rings[row.rings[0]])) { assert.equal(ring.pixels, null); assert.ok(ring.frames >= 54, 'clean frames: ' + ring.frames); }
  const sampled = result.rings[pixels.rings[0]];
  assert.equal(sampled.pixels.method, 'drawSnapshot'); assert.equal(sampled.pixels.towardAccent, sampled.pixels.total);
  assert.equal(z.snapshots, 2, 'the peak and the area after it, once');
  assert.equal(result.rings.filter(r => r.phase === 'passive').every(r => r.pixels === null && r.frames >= 54), true, 'your own switches are not slowed');
  assert.equal(result.passive.markArrival, 1); assert.equal(result.passive.rings, 1); assert.equal(result.passive.plainActivations, 1, 'the Alt+Tab back, not the switch');
  // Reading the ring's computed style each frame restyles it on the main thread and slows
  // the window being measured: once for the accent at start, then once per ring when it is added.
  assert.ok(result.rings.reduce((sum, r) => sum + r.frames, 0) > 120);
  assert.ok(z.styleReads <= 1 + result.rings.length, `computed style read ${z.styleReads} times for ${result.rings.length} rings`);
  assert.ok(result.events.some(e => e.type === 'activate' && e.win === 'W2' && e.framesIn1s > 30), 'refresh ticks after activation');
  assert.equal(result.events.length, 200); assert.ok(result.dropped.events > 100);
  assert.deepEqual(result.cleanup.leftovers, []); assert.equal(result.cleanup.selectionRestored, true); assert.equal(result.cleanup.refocused, 'W1');
  clean(z, result);
});

test('Tab Router 1.45.0: no markArrival or switch patch, so Switch to Tab draws nothing; Stop + copy restores', async () => {
  const z = zen({ router: '1.45.0' });
  await z.advance(9000);
  assert.equal(z.O.__zzArrivalProbe.phase, 'passive');
  const stopping = z.D.__zzArrivalProbe.stop();
  await z.flush();
  const result = plain(await stopping);
  assert.equal(result.status, 'stopped');
  assert.equal(result.runtime.switchToTabPatched, false);
  assert.deepEqual(result.runtime.windows.map(w => [w.markArrival, w.switchIfOpen, w.switchIfNeededWrapped]), [[false, true, false], [false, true, false]]);
  assert.equal(result.runtime.routerApi.includes('markArrival'), false);
  const [uri, routed, pixels] = result.auto.paths;
  assert.deepEqual(uri.calls.switchToTabHavingURI, ['W1'], 'the unpatched switch is observed by a temporary wrapper');
  assert.deepEqual(uri.calls.switchIfNeeded.map(c => [c.win, c.switchingFrom]), [['W2', 'none']]);
  assert.equal(uri.after.landed, 'destination'); assert.deepEqual(uri.rings, []);
  assert.deepEqual(routed.calls.markArrival, []);
  assert.deepEqual(routed.rings.map(i => [result.rings[i].holder, result.rings[i].position]), [['root', 'fixed']]);
  assert.equal(pixels.via, 'tabRouterSwitchIfOpen', 'the switch that drew a ring');
  assert.ok(result.rings[pixels.rings[0]].pixels.towardAccent > 0);
  assert.equal(result.passive.rings, 0);
  clean(z, result);
});

test('One window: a temporary window and tab are used, and the deadline closes both and restores focus', async () => {
  const z = zen({ windows: 1 });
  const before = z.O.gBrowser.selectedTab;
  await z.advance(1500);
  assert.equal(z.windows.length, 2, 'temporary window opened');
  const D = z.windows[1];
  await z.advance(1500);
  const temporary = D.gBrowser.tabs.find(t => /zz-arrival-probe/.test(t.linkedBrowser.currentURI.spec));
  assert.ok(temporary, 'temporary tab opened'); assert.equal(temporary.custom.zzrouterLocked, 'true');
  assert.ok(z.O.gBrowser.tabs.some(t => t.id === temporary.id), 'with a synced copy in the origin');
  z.jump(80000); await z.advance(0); await z.advance(3000);
  const result = plain(await z.result);
  assert.equal(result.status, 'deadline');
  assert.equal(result.auto.temporaryWindow, true); assert.equal(result.auto.target.source, 'temporary'); assert.equal(result.auto.target.host, '127.0.0.1');
  assert.equal(result.passive, null);
  assert.equal(D.closed, true); assert.equal(z.windows.length, 1);
  assert.equal(result.cleanup.temporaryWindowClosed, true); assert.equal(result.cleanup.temporaryTabRemoved, true); assert.deepEqual(result.cleanup.leftovers, []);
  assert.equal(z.O.gBrowser.selectedTab, before); assert.equal(z.active, z.O);
  assert.ok(!z.O.gBrowser.tabs.some(t => t.id === temporary.id || /zz-arrival-probe/.test(t.linkedBrowser.currentURI.spec)), 'no copy or handed-over temporary page left');
  clean(z, result);
});

test('A window opened during the probe is watched, and wrapped only after its own Tab Router', async () => {
  const z = zen({ lateRouter: true });
  await z.advance(9000);
  const W3 = z.O.OpenBrowserWindow();
  await z.advance(1000);
  W3.gBrowser.selectedTab = W3.gBrowser.addTab('https://third.example/page');
  z.O.focus(); await z.advance(500);
  z.O.switchToTabHavingURI(z.uri('https://third.example/page'), false, {}, 0, null);
  await z.advance(2000);
  const result = plain(await z.O.__zzArrivalProbe.stop());
  assert.deepEqual(result.failures, []);
  assert.ok(result.events.some(e => e.type === 'window-opened' && e.win === 'W3'));
  assert.deepEqual(result.events.filter(e => e.type === 'switchIfNeeded' && e.phase === 'passive').map(e => [e.win, e.switchingFrom]), [['W3', 'W1']], 'one wrapper, over Tab Router\'s');
  assert.equal(result.rings.filter(r => r.phase === 'passive' && r.win === 'W3').length, 1);
  assert.equal(W3.gZenWorkspaces.switchIfNeeded.name, 'switchIfNeeded', 'Tab Router\'s own wrapper is back on top');
  assert.equal(W3.__zzArrivalProbe, undefined);
  clean(z, result);
});

test('Border rings (the Windows ring fix) are found, followed through their animation and compared in their accent', async () => {
  const z = zen({ ring: 'border' });
  await z.advance(9000);
  z.O.TabRouter.switchIfOpen(z.D.gBrowser.tabs[1].linkedBrowser.currentURI.spec);
  await z.advance(2000);
  const result = plain(await z.O.__zzArrivalProbe.stop());
  assert.equal(result.rings.length, 4, 'the three automatic switches and your own');
  assert.deepEqual(result.auto.paths.map(row => row.rings.length), [1, 1, 1]);
  assert.equal(result.passive.rings, 1);
  for (const ring of result.rings) {
    assert.equal(ring.style, 'border'); assert.equal(ring.durationMs, 1100); assert.deepEqual(ring.accent, ACCENT);
    assert.equal(ring.maxOpacity, 1, 'held at full strength'); assert.ok(ring.removedAfterMs >= 1080);
    assert.equal(ring.opacity[0] < 0.5 && ring.opacity.filter(o => o === 1).length > 20, true, 'fades in, then holds');
  }
  const sampled = result.rings[result.auto.paths[2].rings[0]];
  assert.equal(sampled.pixels.method, 'drawSnapshot'); assert.equal(sampled.pixels.towardAccent, sampled.pixels.total);
  assert.ok(z.styleReads <= 1 + result.rings.length, `computed style read ${z.styleReads} times`);
  clean(z, result);
});

test('Zen\'s own split view is reported apart from Firefox\'s, which the address bar passes to Switch to Tab', async () => {
  const z = zen({ zenSplitView: true });
  await z.advance(9000);
  const result = plain(await z.O.__zzArrivalProbe.stop());
  assert.equal(result.auto.originZenSplitView, true);
  assert.equal(result.auto.originNativeSplitView, false, 'tab.splitview, Firefox\'s split view, locked off in Zen');
  assert.equal('originSplitView' in result.auto, false);
  assert.ok('browser.tabs.splitView.enabled' in result.env.prefs);
  assert.equal(result.auto.paths[0].after.landed, 'destination');
  clean(z, result);
});

test('Stop during the automatic phase: every switch without a result says it was stopped', async () => {
  const seen = new Set();
  for (const at of [0, 300, 900, 1500, 2100, 2700, 3300, 3900]) {
    const z = zen();
    await z.advance(at);
    const result = plain(await z.O.__zzArrivalProbe.stop());
    assert.equal(result.status, 'stopped');
    const { paths } = result.auto;
    assert.deepEqual(paths.map(row => row.path), ['switchToTabHavingURI', 'tabRouterSwitchIfOpen', 'pixels'], 'at ' + at + ' ms');
    for (const row of paths) {
      assert.ok(row.after || row.skipped === 'stopped', `at ${at} ms ${row.path} has no result and no reason: ${JSON.stringify(row)}`);
      seen.add(row.after ? 'done' : row.activation || row.returned !== undefined ? 'mid-switch' : 'not-started');
    }
    assert.equal(result.auto.unfinished, paths.some(row => row.skipped) ? 'stopped' : undefined);
    assert.deepEqual(result.cleanup.leftovers, []);
    assert.equal(z.queue.size <= 1, true, 'at most Zen\'s own ring or frame for a switch in flight');
    await z.advance(2000); // which then ends by itself
    clean(z, result);
  }
  assert.deepEqual([...seen].sort(), ['done', 'mid-switch', 'not-started'], 'stops before, during and after a switch');
});

test('The loader in ARRIVAL-PROBE.md fetches the probe at a pinned commit, runs it into a browser window and removes its file', async t => {
  const loader = /```js\n([\s\S]*?)\n```/.exec(guide)?.[1];
  assert.ok(loader, 'a loader to paste');
  const pinned = /'https:\/\/raw\.githubusercontent\.com\/Dragon74X\/Zen-Personal-Mods\/([0-9a-f]{40})\/tools\/arrival-probe\.js'/.exec(loader);
  assert.ok(pinned, 'a full commit hash, not a branch');
  // Where git has that commit (not in a shallow checkout), it must hold this very probe.
  let published = null;
  try { published = execFileSync('git', ['show', pinned[1] + ':tools/arrival-probe.js'], { cwd: new URL('.', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
  if (published === null) t.diagnostic('pinned commit not in this checkout: content not compared');
  else assert.equal(published, source, 'the pinned commit holds this arrival-probe.js: re-pin the loader after changing it');
  const z = zen({ entry: loader });
  await z.advance(0);
  assert.equal(z.files.size, 0, 'the temporary file is removed once the probe is running');
  assert.equal(z.O.__zzArrivalProbe.phase !== undefined, true, 'the probe is running');
  await z.advance(9000);
  const result = plain(await z.O.__zzArrivalProbe.stop());
  assert.deepEqual(plain(await z.result), result, 'the loader returns the report');
  assert.equal(z.fetched.filter(url => url.startsWith('https://')).length, 1);
  assert.equal(result.status, 'stopped'); assert.equal(result.failures.length, 0);
  assert.deepEqual(result.auto.paths.map(row => row.after.landed), ['destination', 'destination', 'destination']);
  clean(z, result);
});
