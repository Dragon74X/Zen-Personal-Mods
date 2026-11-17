import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
const source = await readFile(new URL('./arrival-probe.js', import.meta.url), 'utf8');
const XHTML = 'http://www.w3.org/1999/xhtml', MARK = Symbol.for('zzrouter.switchToTabHavingURI'), ACCENT = [10, 20, 250];
const secret = 'PRIVATE_PERSON';

// A small Zen: windows with synced tab copies, Firefox's switch to an open tab,
// and Tab Router 1.45.1 (exposed markArrival, shared switch patch, own
// switchIfNeeded) or 1.45.0 (an internal fixed ring, nothing exposed).
function zen({ router = '1.45.1', windows: count = 2, lateRouter = false } = {}) {
  let time = 0, serial = 0, active = null, copied, syncing = false;
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
      browsingContext: { isActive: true, currentWindowGlobal: { drawSnapshot: async (rect) => ({ ring: [...rings].some(r => r.opacity() > 0.2), width: rect.width, close() {} }) } },
      matchMedia: () => ({ matches: false }), fetch: async url => ({ json: async () => ({ version: url.includes('tab-router') ? router : secret }) }),
      getComputedStyle: el => ({ opacity: String(el.opacity ? el.opacity() : 1), boxShadow: el.style.boxShadow || 'none', getPropertyValue: () => 'rgb(10, 20, 250)' }),
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
    win.ring = (holder, position) => {
      const node = element(doc), born = time;
      node.setAttribute('aria-hidden', 'true');
      Object.assign(node.style, { position, zIndex: '1', boxShadow: 'rgb(10, 20, 250) 0px 0px 0px 2px inset, color-mix(in srgb, rgb(10, 20, 250) 40%, transparent) 0px 0px 28px 0px inset' });
      node.parentNode = holder; node.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 500 });
      node.opacity = () => { const t = (time - born) / 900; return node.isConnected ? (t < 0.3 ? t / 0.3 : Math.max(0, (1 - t) / 0.7)) : 0; };
      node.getAnimations = () => [{ get currentTime() { return time - born; }, effect: { getTiming: () => ({ duration: 900 }) } }];
      node.remove = () => { if (!node.isConnected) return; node.isConnected = false; rings.delete(node); win.mutate({ addedNodes: [], removedNodes: [node] }); };
      rings.add(node); win.mutate({ addedNodes: [node], removedNodes: [] });
      clock.setTimeout(() => node.remove(), 900);
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
    scriptSecurityManager: { getSystemPrincipal: () => ({}) }, dirsvc: { get: () => ({ path: '/home/' + secret + '/profile' }) } };
  const ChromeUtils = { now: () => time, importESModule(path) {
    if (path.endsWith('Timer.sys.mjs')) return clock;
    if (path.endsWith('URILoadingHelper.sys.mjs')) return { URILoadingHelper: helper };
    if (path.endsWith('PrivateBrowsingUtils.sys.mjs')) return { PrivateBrowsingUtils: { isWindowPrivate: () => false } };
    if (path.endsWith('WindowsVersionInfo.sys.mjs')) return { WindowsVersionInfo: { get: () => ({ buildNumber: 22631 }) } };
    throw Error(secret);
  } };
  const IOUtils = { readJSON: async () => ({ 'zz-tab-router': { version: router, updatedAt: '2026-11-17T07:12:54Z', enabled: true, homepage: secret }, [secret]: { version: secret } }) };
  const Cc = { '@mozilla.org/widget/clipboardhelper;1': { getService: () => ({ copyString: text => { copied = text; } }) } };
  const context = vm.createContext({ Services, ChromeUtils, IOUtils, Cc, Ci: { nsIFile: {}, nsIClipboardHelper: {} }, PathUtils: { join: (...p) => p.join('/') },
    console: { log: (...args) => logs.push(args) }, Math, JSON, Promise, Symbol, Object, Number, String, Error, URL, Uint8ClampedArray, queueMicrotask });
  const result = vm.runInContext(source, context);
  return { windows, O, D, helper, original, originals, queue, observers, logs, result, advance, flush, uri, jump: ms => { time += ms; },
    get time() { return time; }, get copied() { return copied; }, get active() { return active; } };
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

test('Tab Router 1.45.1: both automatic switches reach the other window, ring and paint; your own switches are recorded within bounds', async () => {
  const z = zen();
  await z.advance(6000);
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
  const [uri, routed] = result.auto.paths;
  assert.deepEqual(uri.calls.switchToTabHavingURI, ['W1']);
  assert.deepEqual(uri.calls.switchIfNeeded.map(c => [c.win, c.switchingFrom]), [['W2', 'W1']]);
  assert.deepEqual(routed.calls.markArrival.map(c => c.win), ['W2']);
  for (const row of [uri, routed]) {
    assert.equal(row.returned, true); assert.equal(row.after.landed, 'destination'); assert.equal(row.after.destination.active, true);
    assert.equal(row.rings.length, 1);
    const ring = result.rings[row.rings[0]];
    assert.equal(ring.win, 'W2'); assert.equal(ring.holder, 'browserSidebarContainer'); assert.equal(ring.position, 'absolute');
    assert.ok(ring.frames > 40 && ring.maxOpacity > 0.9 && ring.removedAfterMs >= 880, 'ring tracked through its fade');
    assert.equal(ring.opacity.length, 40, 'opacity samples bounded');
    assert.equal(ring.pixels.method, 'drawSnapshot'); assert.equal(ring.pixels.towardAccent, ring.pixels.total);
  }
  assert.equal(result.passive.markArrival, 1); assert.equal(result.passive.rings, 1); assert.equal(result.passive.plainActivations, 1, 'the Alt+Tab back, not the switch');
  assert.ok(result.events.some(e => e.type === 'activate' && e.win === 'W2' && e.framesIn1s > 30), 'refresh ticks after activation');
  assert.equal(result.events.length, 200); assert.ok(result.dropped.events > 100);
  assert.deepEqual(result.cleanup.leftovers, []); assert.equal(result.cleanup.selectionRestored, true); assert.equal(result.cleanup.refocused, 'W1');
  clean(z, result);
});

test('Tab Router 1.45.0: no markArrival or switch patch, so Switch to Tab draws nothing; Stop + copy restores', async () => {
  const z = zen({ router: '1.45.0' });
  await z.advance(6000);
  assert.equal(z.O.__zzArrivalProbe.phase, 'passive');
  const stopping = z.D.__zzArrivalProbe.stop();
  await z.flush();
  const result = plain(await stopping);
  assert.equal(result.status, 'stopped');
  assert.equal(result.runtime.switchToTabPatched, false);
  assert.deepEqual(result.runtime.windows.map(w => [w.markArrival, w.switchIfOpen, w.switchIfNeededWrapped]), [[false, true, false], [false, true, false]]);
  assert.equal(result.runtime.routerApi.includes('markArrival'), false);
  const [uri, routed] = result.auto.paths;
  assert.deepEqual(uri.calls.switchToTabHavingURI, ['W1'], 'the unpatched switch is observed by a temporary wrapper');
  assert.deepEqual(uri.calls.switchIfNeeded.map(c => [c.win, c.switchingFrom]), [['W2', 'none']]);
  assert.equal(uri.after.landed, 'destination'); assert.deepEqual(uri.rings, []);
  assert.deepEqual(routed.calls.markArrival, []);
  assert.deepEqual(routed.rings.map(i => [result.rings[i].holder, result.rings[i].position]), [['root', 'fixed']]);
  assert.ok(result.rings[routed.rings[0]].pixels.towardAccent > 0);
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
  await z.advance(6000);
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
