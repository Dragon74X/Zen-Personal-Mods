import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../glassflow/glassflow.uc.js', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('  const SHOWN ='), source.indexOf('  const APPEARANCE ='));
const observer = source.slice(source.indexOf('  const prefVarObserver ='), source.indexOf('  // ---- keep the favicon'));
const key = 'zzglass.sidebar.blur-transparent-pages';

function setup(saved) {
  const prefs = new Map([['zen.theme.acrylic-sidebar', true]]), prefObservers = new Set(), mutations = new Set(), frames = new Map();
  if (saved !== undefined) prefs.set(key, saved);
  let frameID = 0, reads = 0, transparent = true, timerID = 0;
  const timers = new Map();
  const progress = new Set();
  const nodes = [];
  function node() {
    const attrs = new Map(), styles = new Map(), listeners = new Map();
    const e = { children: [], listeners, writes: [],
      style: { getPropertyValue: k => styles.get(k)?.[0] ?? '', getPropertyPriority: k => styles.get(k)?.[1] ?? '',
        setProperty: (k, v, p = '') => styles.set(k, [v, p]), removeProperty: k => styles.delete(k) },
      setAttribute(k, v) { attrs.set(k, v); this.writes.push(k); }, getAttribute: k => attrs.get(k),
      removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k),
      append(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
      matches: () => true, getAnimations: () => [],
      getBoundingClientRect() { reads++; return { left: 0, top: 0, width: 300, height: 600 }; },
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    };
    nodes.push(e);
    return e;
  }
  const root = node(), box = node(), toolbox = node(), panel = node(), tabs = node(), window = node(), transparency = node();
  root.setAttribute('zen-compact-mode', 'true');
  const services = { getBoolPref: (k, fallback) => prefs.has(k) ? prefs.get(k) : fallback,
    addObserver: (branch, o) => prefObservers.add({ branch, o }),
    removeObserver(branch, o) { for (const entry of prefObservers) if (entry.branch === branch && entry.o === o) prefObservers.delete(entry); },
  };
  const browser = { selectedBrowser: {}, tabContainer: tabs, addTabsProgressListener: p => progress.add(p), removeTabsProgressListener: p => progress.delete(p) };
  const context = vm.createContext({ console, Ci: { nsIWebProgressListener: { STATE_START: 1, STATE_STOP: 16, STATE_IS_NETWORK: 0x40000, LOCATION_CHANGE_SAME_DOCUMENT: 1 } }, PREFIX: 'zzglass.', Services: { prefs: services },
    document: { documentElement: root, createElementNS: node,
      getElementById: id => ({ 'navigator-toolbox': toolbox, 'tabbrowser-tabbox': box, 'zen-toolbar-background': panel })[id] },
    window: Object.assign(window, { matchMedia: () => transparency }), gBrowser: browser,
    getComputedStyle: () => ({ backgroundColor: transparent ? 'transparent' : 'white', backdropFilter: 'blur(15px)' }),
    requestAnimationFrame: fn => { frames.set(++frameID, fn); return frameID; }, cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class { constructor(fn) { this.callback = fn; } observe() { mutations.add(this); } disconnect() { mutations.delete(this); } },
    setTimeout: (fn, ms) => { timers.set(++timerID, [fn, ms]); return timerID; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(observer + section + '\nglobalThis.api = { syncPageBlur, prefVarObserver, sidebarBackdrop };', context);
  services.addObserver('zzglass.', context.api.prefVarObserver);
  const notify = value => {
    prefs.set(key, value);
    // Deliver already queued notifications even after an observer is removed.
    for (const { branch, o } of [...prefObservers]) if (key.startsWith(branch)) o.observe(null, null, key);
  };
  return { prefs, root, box, toolbox, frames, mutations, notify, api: context.api, browser, progress, timers, window,
    setTransparent: value => { transparent = value; },
    flush() { for (let n = 0; frames.size && n < 10; n++) { const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(); } assert.equal(frames.size, 0, 'frame work must finish'); },
    reads: () => reads, prefObservers, listeners: () => nodes.reduce((n, e) => n + [...e.listeners.values()].reduce((n, s) => n + s.size, 0), 0) };
}

test('Native page blur path allocates no fallback and preserves absent or saved Off choices', () => {
  for (const saved of [undefined, false]) {
    const h = setup(saved);
    h.api.syncPageBlur();
    assert.equal(h.prefs.get(key), saved);
    assert.equal(h.root.children.length, 0);
    assert.equal(h.reads(), 0);
    assert.equal(h.listeners(), 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.mutations.size, 0);
    assert.equal(h.prefObservers.size, 1, 'only the existing shared preference observer');
  }
});

test('Saved On runs one compatibility filter; disabling releases resources and queued work', () => {
  const h = setup(true);
  h.box.style.setProperty('filter', 'brightness(0.9)', 'important');
  h.api.syncPageBlur();
  h.notify(true);
  assert.equal(h.prefs.get(key), true);
  assert.equal(h.root.children.length, 1);
  assert.equal(h.box.style.getPropertyValue('filter'), 'brightness(0.9) url(#zzg-strip)');
  const queuedObserver = [...h.mutations][0].callback;
  queuedObserver();
  assert.equal(h.frames.size, 1);
  h.notify(false);
  queuedObserver();
  assert.equal(h.frames.size, 0);
  assert.equal(h.mutations.size, 0);
  assert.equal(h.listeners(), 0);
  assert.equal(h.prefObservers.size, 1);
  assert.equal(h.root.children.length, 0);
  assert.equal(h.box.style.getPropertyValue('filter'), 'brightness(0.9)');
  assert.equal(h.box.style.getPropertyPriority('filter'), 'important');
  h.notify(true);
  assert.equal(h.root.children.length, 1);
  assert.equal(h.box.style.getPropertyValue('filter'), 'brightness(0.9) url(#zzg-strip)');
  h.notify(false);
  assert.equal(h.root.children.length, 0);
});

test('Disabling compatibility preserves a filter taken over by another owner', () => {
  const h = setup(true);
  h.api.syncPageBlur();
  h.box.style.setProperty('filter', 'contrast(0.8)');
  h.notify(false);
  assert.equal(h.box.style.getPropertyValue('filter'), 'contrast(0.8)');
  assert.equal(h.box.style.getPropertyPriority('filter'), '');
});

test('Open sidebar refreshes on selected top-level load completion, with fallback On or Off', () => {
  for (const enabled of [false, true]) {
    const h = setup(enabled);
    h.setTransparent(false);
    h.api.syncPageBlur();
    const stop = h.api.sidebarBackdrop(), listener = [...h.progress][0];
    const load = (browser, top = true, flags = 0x40010) => listener.onStateChange(browser, { isTopLevel: top }, null, flags);
    for (const [browser, top, flags] of [[{}, true, 0x40010], [h.browser.selectedBrowser, false, 0x40010], [h.browser.selectedBrowser, true, 16]]) load(browser, top, flags);
    assert.equal(h.frames.size, 0, 'background loads, subframes and non-network notifications are ignored');
    h.setTransparent(true);
    assert.equal(h.box.style.getPropertyValue('filter'), '');
    load(h.browser.selectedBrowser); load(h.browser.selectedBrowser);
    h.flush();
    assert.equal(h.toolbox.writes.filter(k => k === 'zzg-redraw').length, 1, 'one coalesced invalidation');
    assert.equal(h.toolbox.getAttribute('zzg-redraw'), undefined);
    assert.equal(h.box.style.getPropertyValue('filter').includes('zzg-strip'), enabled, 'fallback transparency follows the new page');
    load(h.browser.selectedBrowser);
    stop();
    load(h.browser.selectedBrowser);
    h.flush();
    assert.equal(h.progress.size, 0);
    assert.equal(h.toolbox.writes.filter(k => k === 'zzg-redraw').length, 1, 'retired callbacks cannot change a replacement instance');
    h.notify(false);
  }
});

test('Hidden and docked sidebar loads do not toggle the backdrop filter', () => {
  const h = setup(false), stop = h.api.sidebarBackdrop(), listener = [...h.progress][0];
  h.root.setAttribute('zen-compact-mode', 'false');
  listener.onStateChange(h.browser.selectedBrowser, { isTopLevel: true }, null, 0x40010); h.flush();
  h.root.setAttribute('zen-compact-mode', 'true'); h.toolbox.matches = () => false;
  listener.onStateChange(h.browser.selectedBrowser, { isTopLevel: true }, null, 0x40010); h.flush();
  assert.equal(h.toolbox.writes.length, 0);
  stop();
});

test('A sidebar redraw waits for a workspace switch to finish, then runs once', () => {
  const h = setup(false), stop = h.api.sidebarBackdrop();
  const select = () => { for (const fn of h.browser.tabContainer.listeners.get('TabSelect')) fn({}); };
  const redraws = () => h.toolbox.writes.filter(k => k === 'zzg-redraw').length;
  h.toolbox.setAttribute('animating-background', '');
  select(); select(); h.flush();
  assert.equal(redraws(), 0, 'Zen is already re-blurring the panel on every frame of the switch');
  assert.equal(h.mutations.size, 1, 'one waiter for the switch to end');
  const [waiter] = h.mutations;
  waiter.callback([]); h.flush();
  assert.equal(redraws(), 0, 'nothing while the switch is still running');
  h.toolbox.removeAttribute('animating-background');
  waiter.callback([]); h.flush();
  assert.equal(redraws(), 1, 'one redraw after it');
  assert.equal(h.mutations.size, 0, 'and the waiter is gone');
  h.toolbox.setAttribute('animating-background', '');
  select();
  assert.equal(h.mutations.size, 1);
  stop();
  assert.equal(h.mutations.size, 0, 'retiring drops a waiting redraw');
});

test('A changed page is repainted once, as the sidebar starts to slide in', () => {
  const h = setup(false), stop = h.api.sidebarBackdrop(), listener = [...h.progress][0];
  const slide = type => { for (const fn of h.toolbox.listeners.get(type)) fn({ type, target: h.toolbox, propertyName: 'translate' }); };
  const repaints = () => h.box.writes.filter(k => k === 'zzg-repaint').length;
  slide('transitionrun'); h.flush();
  assert.equal(repaints(), 1, 'the page after launch is repainted on the first open');
  assert.equal(h.box.getAttribute('zzg-repaint'), undefined, 'for two frames only');
  slide('transitionend'); slide('transitionrun'); h.flush();
  assert.equal(repaints(), 1, 'an unchanged page is not repainted again');
  assert.equal(h.toolbox.writes.filter(k => k === 'zzg-redraw').length, 2, 'the slide end still redraws; an unchanged open does not start one');
  listener.onStateChange(h.browser.selectedBrowser, { isTopLevel: true }, null, 0x40010); h.flush();
  slide('transitionrun'); h.flush();
  assert.equal(repaints(), 2, 'a page load makes the next open repaint it');
  for (const fn of h.browser.tabContainer.listeners.get('TabSelect')) fn({}); h.flush();
  assert.equal(repaints(), 3, 'so does selecting another tab with the sidebar open');
  stop();
  assert.equal(h.toolbox.listeners.get('transitionrun').size, 0);
});

test('A page still loading or still painting after its load is repainted under an open sidebar', () => {
  const h = setup(false), stop = h.api.sidebarBackdrop(), listener = [...h.progress][0];
  const slide = type => { for (const fn of h.toolbox.listeners.get(type)) fn({ type, target: h.toolbox, propertyName: 'translate' }); };
  const repaints = () => h.box.writes.filter(k => k === 'zzg-repaint').length;
  slide('transitionrun'); h.flush();                          // launch page
  const base = repaints();
  listener.onStateChange(h.browser.selectedBrowser, { isTopLevel: true }, null, 0x40001);   // START | IS_NETWORK
  slide('transitionrun'); h.flush();
  assert.equal(repaints(), base + 1, 'opening while the page loads repaints it');
  listener.onLocationChange(h.browser.selectedBrowser, { isTopLevel: true });
  slide('transitionrun'); h.flush();
  assert.equal(repaints(), base + 2, 'and so does a move within the page');
  listener.onStateChange(h.browser.selectedBrowser, { isTopLevel: true }, null, 0x40010);   // STOP | IS_NETWORK
  h.flush();
  assert.equal(repaints(), base + 3);
  assert.deepEqual([...h.timers.values()].map(t => t[1]), [400, 1500, 4000], 'three follow-ups as it settles');
  for (const [fn] of [...h.timers.values()]) { fn(); h.flush(); }
  assert.equal(repaints(), base + 6);
  listener.onStateChange(h.browser.selectedBrowser, { isTopLevel: true }, null, 0x40010);
  stop();
  assert.equal(h.timers.size, 0, 'retiring cancels pending follow-ups');
});

test('A site changing page in place, and a finished tab switch, repaint an open sidebar without any load', () => {
  const h = setup(false), stop = h.api.sidebarBackdrop(), listener = [...h.progress][0];
  const repaints = () => h.box.writes.filter(k => k === 'zzg-repaint').length;
  h.flush(); const base = repaints();
  listener.onLocationChange(h.browser.selectedBrowser, { isTopLevel: true }, null, {}, 1);   // same document (pushState)
  h.flush();
  assert.equal(repaints(), base + 1, 'an in-place page change repaints at once');
  assert.equal(h.timers.size, 3, 'and as it settles');
  listener.onLocationChange(h.browser.selectedBrowser, { isTopLevel: true }, null, {}, 0);   // a load: STATE_STOP repaints
  h.flush();
  assert.equal(repaints(), base + 1);
  for (const fn of h.window.listeners.get('TabSwitchDone')) fn({});
  h.flush();
  assert.equal(repaints(), base + 2, 'the switched-to tab is repainted once it is shown');
  stop();
  assert.equal(h.window.listeners.get('TabSwitchDone').size, 0);
  assert.equal(h.timers.size, 0);
});

test('A loaded page switched to is re-blurred the frame it appears, not only at TabSwitchDone', () => {
  const h = setup(false), stop = h.api.sidebarBackdrop();
  const redraws = () => h.toolbox.writes.filter(k => k === 'zzg-redraw').length;
  const batch = () => { const fns = [...h.frames.values()]; h.frames.clear(); for (const fn of fns) fn(); };
  const tab = {}, old = {};
  h.browser.selectedTab = tab; h.browser._switcher = { visibleTab: old };
  for (const fn of h.browser.tabContainer.listeners.get('TabSelect')) fn({});
  batch(); batch(); batch();
  assert.equal(redraws(), 1, 'one redraw at once, while the old page is still on screen');
  h.browser._switcher.visibleTab = tab;
  for (let n = 0; h.frames.size && n < 10; n++) batch();
  assert.equal(redraws(), 2, 'and again the frame the new page appears');
  assert.ok(h.box.writes.filter(k => k === 'zzg-repaint').length >= 2, 'with the page repainted under it');
  h.browser._switcher = null;
  stop();
});
