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
  let frameID = 0, reads = 0, transparent = true;
  const progress = new Set();
  const nodes = [];
  function node() {
    const attrs = new Map(), styles = new Map(), listeners = new Map();
    const e = { children: [], listeners, writes: [],
      style: { getPropertyValue: k => styles.get(k)?.[0] ?? '', getPropertyPriority: k => styles.get(k)?.[1] ?? '',
        setProperty: (k, v, p = '') => styles.set(k, [v, p]), removeProperty: k => styles.delete(k) },
      setAttribute(k, v) { attrs.set(k, v); this.writes.push(k); }, getAttribute: k => attrs.get(k),
      removeAttribute: k => attrs.delete(k),
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
  const context = vm.createContext({ console, Ci: { nsIWebProgressListener: { STATE_STOP: 16, STATE_IS_NETWORK: 0x40000 } }, PREFIX: 'zzglass.', Services: { prefs: services },
    document: { documentElement: root, createElementNS: node,
      getElementById: id => ({ 'navigator-toolbox': toolbox, 'tabbrowser-tabbox': box, 'zen-toolbar-background': panel })[id] },
    window: Object.assign(window, { matchMedia: () => transparency }), gBrowser: browser,
    getComputedStyle: () => ({ backgroundColor: transparent ? 'transparent' : 'white', backdropFilter: 'blur(15px)' }),
    requestAnimationFrame: fn => { frames.set(++frameID, fn); return frameID; }, cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class { constructor(fn) { this.callback = fn; } observe() { mutations.add(this); } disconnect() { mutations.delete(this); } },
  });
  vm.runInContext(observer + section + '\nglobalThis.api = { syncPageBlur, prefVarObserver, sidebarBackdrop };', context);
  services.addObserver('zzglass.', context.api.prefVarObserver);
  const notify = value => {
    prefs.set(key, value);
    // Deliver already queued notifications even after an observer is removed.
    for (const { branch, o } of [...prefObservers]) if (key.startsWith(branch)) o.observe(null, null, key);
  };
  return { prefs, root, box, toolbox, frames, mutations, notify, api: context.api, browser, progress,
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
