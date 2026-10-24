import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { installSineUpdateGuard } from '../glassflow/sine-update-guard.sys.mjs';

let serial = 0;
async function cacheEnv({ fail = false, saved = {} } = {}) {
  const { openRouterCache } = await import('../tab-router/router-cache.sys.mjs?test=' + ++serial);
  const prefs = new Map([['zzrouter.creators', JSON.stringify({ old: 'Creator', ...saved })], ['zzrouter.avatars', JSON.stringify({ '2:example': { d: 'picture' } })]]);
  const disk = new Map(), events = []; let writes = 0, saves = 0;
  const deps = {
    PathUtils: { profileDir: '/profile', join: (...p) => p.join('/') },
    Services: { prefs: { getStringPref: (k,d) => prefs.get(k) ?? d, clearUserPref: k => prefs.delete(k) },
      obs: { notifyObservers: (_s,_topic,key) => events.push(key) } },
    IOUtils: { exists: async k => disk.has(k), readJSON: async k => structuredClone(disk.get(k)),
      writeJSON: async (k,v) => { writes++; if (fail) throw new Error('disk full'); disk.set(k,structuredClone(v)); } },
    JSONFile: class {
      constructor({path}) { this.path=path; }
      async load() { this.data=structuredClone(disk.get(this.path)||{}); }
      saveSoon() { saves++;disk.set(this.path,structuredClone(this.data)); }
    },
  };
  return { prefs, disk, deps, events, open: () => openRouterCache(deps), get writes(){return writes;},get saves(){return saves;} };
}
test('Router migrates caches once, shares writes across windows, and keeps container keys', async () => {
  const e=await cacheEnv();const [a,b]=await Promise.all([e.open(),e.open()]);
  assert.equal(a,b);assert.equal(e.writes,1);assert.equal(e.prefs.size,0);
  assert.equal(a.read('creators').old,'Creator');assert.deepEqual(b.read('avatars'),{'2:example':{d:'picture'}});
  a.write('creators',{...a.read('creators'),first:'A'});
  b.write('creators',{...b.read('creators'),second:'B'});
  assert.deepEqual(a.read('creators'),{old:'Creator',first:'A',second:'B'});
  const copy=a.read('creators');delete copy.first;assert.equal(a.read('creators').first,'A');
  assert.equal(e.saves,2);assert.deepEqual(e.events,['zzrouter.creators','zzrouter.creators']);
});
test('Router disk failure retains all legacy cache bytes for retry', async () => {
  const e=await cacheEnv({fail:true}),before=[...e.prefs];
  await assert.rejects(e.open(),/disk full/);assert.deepEqual([...e.prefs],before);
});
test('Router migration does not erase a legacy write arriving while disk IO is pending', async () => {
  const e=await cacheEnv(),write=e.deps.IOUtils.writeJSON;
  e.deps.IOUtils.writeJSON=async(...args)=>{await write(...args);e.prefs.set('zzrouter.creators','{"newer":"preserve"}');};
  await e.open();assert.equal(e.prefs.get('zzrouter.creators'),'{"newer":"preserve"}');
});

test('Sine teardown identifies window close, enabled rebuild, removal and disable-all', async () => {
  const windows=[{},{}],seen=[];let enabled=true,allOff=false;
  const old=globalThis.Services;
  globalThis.Services={wm:{getEnumerator:()=>windows.values()},prefs:{getBoolPref:()=>allOff}};
  const utils={modsDir:'/mods',getModPreferences:async()=>[],getMods:async()=>({mod:{enabled}})};
  const record=w=>seen.push([w.__zzSineWindowClosing||false,w.__zzSineUnloadReasons?.get('mod')]);
  const manager={ updateMods(){},processModUpdate(){},installMod(){},
    syncModData(){return PathUtils.join(utils.modsDir,'temp');},
    removeListenersForDOM(w){record(w);},async removeUnloadListeners(){windows.forEach(record);},
    async triggerUnloadListener(_s,w){record(w);},
  };
  try {
    assert.equal(installSineUpdateGuard(manager,utils),true);
    manager.removeListenersForDOM(windows[0]);
    await manager.triggerUnloadListener('chrome://sine/content/mod/mod.uc.js',windows[0]);
    await manager.removeUnloadListeners('mod');
    enabled=false;await manager.triggerUnloadListener('chrome://sine/content/mod/mod.uc.js',windows[0]);
    enabled=true;allOff=true;await manager.triggerUnloadListener('chrome://sine/content/mod/mod.uc.js',windows[1]);
    assert.deepEqual(seen,[[true,undefined],[false,'update'],[false,'release'],[false,'release'],[false,'release'],[false,'release']]);
    assert.ok(windows.every(w=>!w.__zzSineWindowClosing&&!w.__zzSineUnloadReasons?.size));
  } finally { if(old===undefined)delete globalThis.Services;else globalThis.Services=old; }
});

async function functions(mod, names, context={}) {
  let source=await readFile(new URL(`../${mod}/${mod}.uc.js`,import.meta.url),'utf8');
  source=source.replace('  // ---- declared defaults',`  globalThis.harness={${names}};return;\n  // ---- declared defaults`);
  const env=vm.createContext({console,...context});vm.runInContext(source,env);return env.harness;
}
test('Unloader reaches its ten-second deadline independently of the sweep interval', async () => {
  let now=1000,id=0;const timers=new Map(),root={hasAttribute:()=>true};
  const h=await functions('tab-unloader','sweep, retire:()=>retired=true',{
    window:{},document:{documentElement:root,querySelectorAll:()=>[]},
    Date:class extends Date { static now(){return now;} },setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    Services:{prefs:{getBoolPref:(_k,d)=>d===false?true:d,getPrefType:()=>0}},gBrowser:{tabs:[]},
  });
  await h.sweep();assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,10000);
  now+=5000;await h.sweep();assert.equal(timers.size,1,'one deadline despite repeated interval sweeps');
  now+=5000;const job=[...timers.values()][0];timers.clear();await job.fn();assert.equal(timers.size,0,'stuck marker cannot defer again');
  await h.sweep();assert.equal(timers.size,1);h.retire();const stopped=[...timers.values()][0];timers.clear();await stopped.fn();assert.equal(timers.size,0);
});
