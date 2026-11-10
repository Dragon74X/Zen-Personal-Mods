import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
const source = await readFile(new URL('./zen-freeze-probe.js', import.meta.url), 'utf8');
const secret = 'PRIVATE_PERSON_DEVICE_URL';
const profile = () => ({ meta: { startTime: 1000000, oscpu: secret, categories: [{ name: 'JavaScript' }, { name: secret }] },
  pages: [{ url: 'https://' + secret }], libs: [{ path: '/home/' + secret }],
  threads: [{ name: 'GeckoMain', pid: 12345, markers: { secret }, stringTable: [
    secret + ' (chrome://sine/content/zz-glassflow/glassflow.uc.js:212:4)',
    'secret (chrome://sine/content/zz-iconflow/iconflow-morph.uc.js:121:8)',
    'https://' + secret + '/private.js:999', 'chrome://sine/content/zz-other/private-script.uc.js:222',
  ], samples: { schema: { stack: 0, time: 1 }, data: [[1, 1100], [1, 2100], [2, 2200], [3, 2300]] },
  stackTable: { schema: { prefix: 0, frame: 1 }, data: [[null, 0], [0, 1], [null, 2], [null, 3]] },
  frameTable: { schema: { location: 0, line: 1, category: 2 }, data: [[0, 212, 0], [1, null, 0], [2, 999, 1], [3, 222, 1]] } },
  { name: 'GeckoMain', pid: 54321, stringTable: [secret], samples: { data: [[0, 10]] } }], processes: [{ pages: [{ url: secret }] }] });

async function fixture({ existing = false, profileFailure = false, profilePending = false, saveFailure = false, zipFailure = false, profilerFailure = false, profileData = profile() } = {}) {
  let time = 1000, serial = 0, copied, styleReads = 0;
  const queue = new Map(), logs = [], files = new Map(), archives = new Map(), observers = new Map(), mutations = [], trace = [];
  const clock = { setTimeout(fn, delay) { const id = ++serial; queue.set(id, { at: time + delay, fn }); return id; }, clearTimeout(id) { queue.delete(id); } };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  async function advance(duration) {
    const end = time + duration;
    while (true) {
      const next = [...queue].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; time = next[1].at; queue.delete(next[0]); next[1].fn(); await flush();
    }
    time = end; await flush();
  }
  function makeWindow(index) {
    const events = new Map(), nodes = [], box = { inside: true }, outside = { inside: false };
    const root = { getAttribute: key => key === 'zen-compact-mode' ? 'true' : 'false', appendChild(node) { node.connected = true; nodes.push(node); } };
    const toolbox = { matches: () => false, contains: node => node === toolbox || node?.inside === true };
    const page = {}, panel = {}, tabbox = {};
    const doc = { documentElement: root, hidden: false,
      get title() { throw Error(secret); }, getElementById: id => ({ 'navigator-toolbox': toolbox, 'zen-toolbar-background': panel, 'tabbrowser-tabbox': tabbox, 'zzg-strip': index === 1 ? {} : null }[id] || null),
      querySelectorAll(selector) { return { length: selector === '*' ? 300 + index : selector.includes('workspace') ? 3 : selector.includes('tab-group') ? index + 1 : selector === '[zzicon-own]' ? 4 : 2 }; },
      createElementNS() { const listeners = new Map(); return { style: {}, listeners, connected: false, addEventListener: (type, fn) => listeners.set(type, fn), remove() { this.connected = false; } }; } };
    const win = { document: doc, closed: false, performance: { now: () => time, timeOrigin: 1000000 }, windowUtils: { layerManagerType: 'WebRender' },
      __zzglassInstance: {}, __zzgroupInstance: {}, __zziconMorphInstance: { records: { size: 15 + index } },
      __zzglassEdgesInstance: { active: index, owners: index + 1, scheduled: index > 0 },
      gBrowser: { tabs: { length: 5 + index }, visibleTabs: { length: 3 }, selectedBrowser: { closest: () => page } },
      fetch: async url => ({ json: async () => ({ version: url.includes('zz-iconflow/') ? '1.21.14' : secret }) }),
      getComputedStyle(node) { styleReads++; return { backdropFilter: 'url("file:///home/' + secret + '/blur.svg") blur(42px) saturate(110%)', filter: node === page ? 'url(https://' + secret + ') blur(6px)' : 'none' }; },
      requestAnimationFrame: fn => clock.setTimeout(() => fn(time), 16), cancelAnimationFrame: id => clock.clearTimeout(id),
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
      removeEventListener(type, fn) { events.get(type)?.delete(fn); },
      MutationObserver: class { constructor(fn) { this.fn = fn; this.active = false; mutations.push(this); } observe() { this.active = true; } disconnect() { this.active = false; } },
    };
    win.emit = (type, data = {}) => { for (const fn of [...events.get(type) || []]) fn({ target: box, timeStamp: time - 12, isTrusted: true, ...data }); };
    return { win, events, nodes, box, outside, toolbox };
  }
  const entries = [makeWindow(0), makeWindow(1)];
  const profiler = { active: existing, activeConfiguration: existing ? { threads: ['GeckoMain'] } : null,
    IsActive() { return this.active; }, StartProfiler(...args) { trace.push(['start', args]); if (profilerFailure) throw Error(secret); this.active = true; this.activeConfiguration = { threads: args[3] }; return Promise.resolve(); },
    getProfileDataAsync() { trace.push(['profile']); if (profileFailure) return Promise.reject(Error(secret)); if (profilePending) return new Promise(() => {}); return Promise.resolve(profileData); },
    StopProfiler() { trace.push(['stop']); this.active = false; this.activeConfiguration = null; return Promise.resolve(); } };
  const prefReads = [], prefs = { getPrefType(key) { prefReads.push(key); return key.endsWith('blur-radius') ? 32 : key === 'zzicon.set' ? 64 : 128; }, getBoolPref: () => false,
    getStringPref: () => 'file:///home/' + secret, getIntPref: key => key === 'zzicon.button.minus' ? 6 : key === 'zzicon.set' ? 4 : 0,
    setBoolPref() { throw Error('Probe must not change preferences'); }, setIntPref() { throw Error('Probe must not change preferences'); }, setStringPref() { throw Error('Probe must not change preferences'); } };
  const Services = { wm: { getMostRecentWindow: () => entries[0].win, getEnumerator() { let i = 0; return { hasMoreElements: () => i < entries.length, getNext: () => entries[i++].win }; } },
    appinfo: { OS: 'WINNT', version: '159.0.1', processID: 12345 }, prefs, profiler,
    obs: { addObserver(o, topic) { observers.set(topic, o); }, removeObserver(o, topic) { if (observers.get(topic) === o) observers.delete(topic); } },
    dirsvc: { get: () => ({ path: '/home/' + secret + '/profile' }) } };
  const IOUtils = { makeDirectory: async path => { if (saveFailure) throw Error(secret); trace.push(['mkdir', path]); },
    readJSON: async path => { assert.match(path, /chrome\/sine-mods\/mods.json$/); return { 'zz-glassflow': { version: '3.74.23', homepage: secret }, [secret]: { version: secret } }; },
    writeJSON: async (path, value) => { files.set(path, JSON.stringify(value)); }, remove: async path => { files.delete(path); archives.delete(path); trace.push(['remove', path]); } };
  const Cc = { '@mozilla.org/widget/clipboardhelper;1': { getService: () => ({ copyString: text => { copied = text; } }) },
    '@mozilla.org/file/local;1': { createInstance: () => ({ initWithPath(path) { this.path = path; } }) },
    '@mozilla.org/zipwriter;1': { createInstance: () => ({ open(file) { this.path = file.path; archives.set(this.path, new Map()); }, addEntryFile(name, level, file) { assert.equal(name, 'report.json'); assert.equal(level, 6); archives.get(this.path).set(name, files.get(file.path)); }, close() { if (zipFailure) throw Error(secret); } }) } };
  const ChromeUtils = { importESModule(path) { if (path.endsWith('Timer.sys.mjs')) return clock; if (path.endsWith('Downloads.sys.mjs')) return { Downloads: { getPreferredDownloadsDirectory: async () => '/home/' + secret + '/Downloads' } }; throw Error(secret); } };
  const context = vm.createContext({ Services, ChromeUtils, Cc, Ci: { nsIFile: {}, nsIZipWriter: {}, nsIClipboardHelper: {} }, IOUtils,
    PathUtils: { join: (...parts) => parts.join('/') }, console: { info: (...args) => logs.push(args) }, Date, Math });
  const result = vm.runInContext(source, context); await flush();
  return { entries, profiler, trace, queue, files, archives, observers, mutations, result, advance, flush, prefReads, jump: duration => { time += duration; },
    get copied() { return copied; }, get styleReads() { return styleReads; }, logs,
    openWindow() { const item = makeWindow(entries.length); entries.push(item); observers.get('browser-delayed-startup-finished').observe(item.win); return item; } };
}
const object = value => JSON.parse(JSON.stringify(value));
function clean(e) {
  assert.equal(e.queue.size, 0, 'All timers and animation callbacks removed');
  assert.equal(e.observers.size, 0, 'Window observer removed');
  assert.ok(e.mutations.every(o => !o.active), 'Mutation observers disconnected');
  for (const { win, events, nodes } of e.entries) {
    assert.equal(win.__zzZenFreezeProbe, undefined);
    assert.ok([...events.values()].every(v => v.size === 0)); assert.ok(nodes.every(n => !n.connected));
  }
}
function privateOutput(e, result) {
  const payload = JSON.stringify([result, e.copied, [...e.files.values()], [...e.archives.values()].map(a => [...a.values()]), e.logs]);
  assert.ok(!payload.includes(secret)); assert.ok(!payload.includes('file:///')); assert.ok(!payload.includes('https://'));
  assert.ok(!payload.includes('12345')); assert.ok(!payload.includes('54321')); assert.ok(!payload.includes('private-script'));
}

test('30 s multiwindow capture saves/copies only allowlisted metadata and parent samples', async () => {
  const e = await fixture(); const reads = e.styleReads;
  e.entries[0].win.emit('pointermove'); e.entries[1].win.emit('pointerdown'); e.entries[1].win.emit('ZenWorkspacesUIUpdate');
  e.entries[0].win.emit('transitionrun', { propertyName: 'scale' });
  e.entries[0].win.emit('transitionend', { propertyName: 'scale' });
  e.entries[0].win.emit('transitionrun', { propertyName: secret });
  e.entries[0].win.emit('pointermove', { isTrusted: false, timeStamp: secret, target: { id: secret } });
  await e.advance(1000); assert.equal(e.styleReads, reads, 'No style reads in the frame/heartbeat loops');
  e.entries[0].win.emit('pointerout', { relatedTarget: e.entries[0].outside }); await e.advance(29000);
  const result = object(await e.result);
  assert.equal(result.status, 'completed'); assert.equal(result.elapsedMs, 30000); assert.equal(result.windows.length, 2);
  assert.equal(result.windows[1].start.tabs, 6); assert.equal(result.windows[1].start.morphRecords, 16);
  assert.equal(result.windows[0].events.pointermove.trusted, 1); assert.equal(result.windows[0].events.pointermove.untrusted, 1);
  assert.equal(result.windows[0].sidebarEntries, 1); assert.equal(result.windows[0].sidebarExits, 1);
  assert.equal(result.windows[1].events.ZenWorkspacesUIUpdate, 1); assert.equal(result.heartbeat.maxMs, 0);
  assert.deepEqual(result.windows[0].sidebarGeometryTransitions, { transitionrun: 1, transitionend: 1, transitioncancel: 0 });
  assert.equal(result.windows[0].edges[1].pointerIdleMs, 1000);
  assert.equal(result.versions.glassflow, '3.74.23'); assert.equal(result.versions.iconflow, '1.21.14'); assert.equal(result.versions.mediaflow, null);
  assert.equal(result.prefs['zzglass.sidebar.blur-radius'], null); assert.deepEqual(result.nativeAnimatedButtonOverrides, ['minus']);
  assert.deepEqual(result.profiler.summary.categories, { JavaScript: 2, Other: 2 });
  assert.equal(result.profiler.summary.unknownCategorySamples, 2);
  assert.deepEqual(result.profiler.summary.categoriesBySecond, [[0, { JavaScript: 1 }], [1, { JavaScript: 1, Other: 2 }]]);
  assert.deepEqual(result.profiler.summary.modLines.map(x => [x.file, x.line, x.samples]), [['iconflow-morph.uc.js', 121, 2], ['glassflow.uc.js', 212, 2]]);
  assert.deepEqual(result.profiler.summary.modLines[0].samplesBySecond, [[0, 1], [1, 1]]);
  assert.deepEqual(result.saved, { json: 1, zip: 1 }); assert.equal(e.files.size, 1); assert.equal(e.archives.size, 1);
  assert.deepEqual(JSON.parse(e.copied), result); assert.deepEqual(JSON.parse([...e.files.values()][0]), result);
  assert.equal([...e.archives.values()][0].get('report.json'), [...e.files.values()][0]);
  assert.equal(e.trace.filter(x => x[0] === 'start').length, 1); assert.equal(e.trace.filter(x => x[0] === 'stop').length, 1);
  assert.equal(e.trace.find(x => x[0] === 'start')[1][3][0], 'pid:12345'); privateOutput(e, result); clean(e);
});

test('Raw Gecko null leaf categories inherit the nearest explicit ancestor without leaking unknown names', async () => {
  const data = profile(), thread = data.threads[0];
  data.meta.categories = [{ name: 'Other' }, { name: 'JavaScript' }, { name: 'Layout' }, { name: secret }];
  thread.frameTable = {
    schema: { location: 0, relevantForJS: 1, innerWindowID: 2, implementation: 3, line: 4, column: 5, category: 6, subcategory: 7 },
    data: [1, null, 2, 3, 0, null, 999].map(category => [0, true, 0, null, 212, null, category, category === null ? null : 0]),
  };
  thread.stackTable.data = [[null, 0], [0, 1], [1, 2], [0, 3], [0, 4], [null, 5], [0, 6]];
  thread.samples.data = [[1, 1100], [2, 2100], [3, 2200], [4, 2300], [5, 3100], [6, 3200]];
  const e = await fixture({ profileData: data }); await e.advance(30000); const result = object(await e.result);
  assert.deepEqual(result.profiler.summary.categories, { JavaScript: 1, Layout: 1, Other: 4 });
  assert.equal(result.profiler.summary.unknownCategorySamples, 3, 'Unknown explicit categories must not fall back to their JavaScript ancestor');
  assert.deepEqual(result.profiler.summary.categoriesBySecond, [[0, { JavaScript: 1 }], [1, { Layout: 1, Other: 2 }], [2, { Other: 2 }]]);
  privateOutput(e, result); clean(e);
});

test('Missing category schema and missing metadata remain distinguishable from known Other', async () => {
  for (const missing of ['schema', 'metadata']) {
    const data = profile();
    if (missing === 'schema') delete data.threads[0].frameTable.schema.category;
    else delete data.meta.categories;
    const e = await fixture({ profileData: data }); await e.advance(30000); const result = object(await e.result);
    assert.deepEqual(result.profiler.summary.categories, { Other: 4 });
    assert.equal(result.profiler.summary.unknownCategorySamples, 4); privateOutput(e, result); clean(e);
  }
});

test('Each retained mod line counts inclusive samples in their inherited category without exporting private data', async () => {
  const data = profile(), thread = data.threads[0];
  data.meta.categories = [{ name: 'JavaScript' }, { name: 'Layout' }, { name: 'GC / CC' }, { name: secret }];
  thread.frameTable.data = [[0, 212, 0], [1, null, null], [2, 999, 1], [3, 222, 2], [2, 999, 3]];
  thread.stackTable.data = [[null, 0], [0, 1], [1, 2], [1, 3], [1, 4]];
  thread.samples.data = [[1, 1100], [2, 1200], [3, 2100], [4, 2200]];
  const e = await fixture({ profileData: data }); await e.advance(30000); const result = object(await e.result), summary = result.profiler.summary;
  const expected = { JavaScript: 1, Layout: 1, 'GC / CC': 1, Other: 1 };
  assert.equal(summary.samples, 4); assert.equal(summary.unknownCategorySamples, 1);
  assert.deepEqual(summary.categories, expected);
  assert.deepEqual(summary.modLines.map(hit => [hit.file, hit.line, hit.samples, hit.categories]), [
    ['iconflow-morph.uc.js', 121, 4, expected], ['glassflow.uc.js', 212, 4, expected],
  ]);
  assert.equal(summary.modLines.reduce((sum, hit) => sum + hit.samples, 0), 8, 'One sample can include multiple retained caller lines');
  for (const hit of summary.modLines) assert.equal(Object.values(hit.categories).reduce((sum, n) => sum + n, 0), hit.samples);
  privateOutput(e, result); clean(e);
});

test('Category timeline stays bounded to 64 seconds when a stalled timer finishes late', async () => {
  const data = profile(); data.threads[0].samples.data = Array.from({ length: 80 }, (_, i) => [1, 1100 + i * 1000]);
  const e = await fixture({ profileData: data }); e.jump(80000);
  const result = object(await e.entries[0].win.__zzZenFreezeProbe.stop());
  assert.equal(result.profiler.summary.samples, 80);
  assert.deepEqual(result.profiler.summary.categories, { JavaScript: 80 });
  assert.equal(result.profiler.summary.categoriesBySecond.length, 64);
  assert.deepEqual(result.profiler.summary.categoriesBySecond[63], [63, { JavaScript: 1 }]);
  privateOutput(e, result); clean(e);
});

test('Stop + copy includes new windows and removes every window hook', async () => {
  const e = await fixture(); const third = e.openWindow(); await e.advance(100);
  third.win.emit('TabSelect'); third.win.emit('pointerover', { relatedTarget: third.outside });
  const stopping = e.entries[1].win.__zzZenFreezeProbe.stop(); await e.flush(); const result = object(await stopping);
  assert.equal(result.status, 'stopped'); assert.equal(result.newWindows, 1); assert.equal(result.windows.length, 3);
  assert.equal(result.windows[2].events.TabSelect, 1); assert.equal(result.windows[2].sidebarEntries, 1); clean(e);
});

test('An existing profiler is not read, started, paused or stopped', async () => {
  const e = await fixture({ existing: true }); await e.advance(30000); const result = await e.result;
  assert.equal(result.profiler.status, 'existing-recording-preserved'); assert.equal(e.profiler.active, true);
  assert.equal(e.trace.filter(x => ['start', 'profile', 'stop'].includes(x[0])).length, 0); clean(e);
});

test('A recording that replaces this probe remains owned by its caller', async () => {
  const e = await fixture(); e.profiler.activeConfiguration = { threads: ['GeckoMain', 'replacement'] };
  await e.advance(30000); const result = await e.result;
  assert.equal(result.profiler.status, 'recording-replaced-or-stopped'); assert.equal(e.profiler.active, true);
  assert.equal(e.trace.filter(x => ['profile', 'stop'].includes(x[0])).length, 0); clean(e);
});

for (const kind of ['profileFailure', 'profilePending', 'saveFailure', 'profilerFailure']) test('Capture completes with sanitized ' + kind, async () => {
  const e = await fixture({ [kind]: true }); await e.advance(kind === 'profilePending' ? 33000 : 30000); const result = object(await e.result);
  assert.ok(result.failures.length); assert.ok(e.copied); privateOutput(e, result); clean(e);
  if (kind.startsWith('profile') && kind !== 'profilerFailure') assert.equal(e.profiler.active, false);
});

test('ZIP close failure is reported and partial ZIP removed', async () => {
  const e = await fixture({ zipFailure: true }); await e.advance(30000); const result = object(await e.result);
  assert.deepEqual(result.saved, { json: 1, zip: 0 }); assert.ok(result.failures.includes('zip-unavailable'));
  assert.equal(e.archives.size, 0); assert.deepEqual(JSON.parse([...e.files.values()][0]), result); privateOutput(e, result); clean(e);
});

test('Closing the launcher window stops capture before its clock disappears', async () => {
  const e = await fixture(); await e.advance(100);
  e.entries[0].win.emit('unload', { target: e.entries[0].win.document });
  e.entries[0].win.closed = true; e.entries[0].win.cancelAnimationFrame = () => { throw Error(secret); };
  await e.flush(); const result = object(await e.result);
  assert.equal(result.status, 'window-closed'); assert.equal(result.windows[0].unloads, 1); assert.equal(e.profiler.active, false); privateOutput(e, result); clean(e);
});
