import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source = async mod => readFile(new URL(`../${mod}/${mod}.uc.js`, import.meta.url), 'utf8');
const block = (s, from, to) => s.slice(s.indexOf(from), s.indexOf(to, s.indexOf(from)));

test('Router reconciliation: 0 moves when sorted, 1 adjacent swap, native path and loose siblings retained', async () => {
  const s = await source('tab-router');
  const nodes = 'ABC'.split('').map(label => ({label, tabs: [], hasAttribute: () => false}));
  const loose = {label:'loose'};
  const parent = {children:[...nodes], insertBefore(node, anchor) {
    this.children.splice(this.children.indexOf(node),1);
    this.children.splice(anchor ? this.children.indexOf(anchor) : this.children.length,0,node);
  }};
  for (const node of [...nodes,loose]) Object.defineProperty(node,'nextSibling',{get:()=> parent.children[parent.children.indexOf(node)+1] || null});
  let moves = 0;
  const env = vm.createContext({domOrder: items => parent.children.filter(n=>items.includes(n)), placementLocked:()=>false,
    gBrowser:{zenHandleTabMove(node, fn) {assert.ok(nodes.includes(node)); moves++;fn();}}, note() {}});
  vm.runInContext(block(s,'  function mvEl(', '  function applyOrder()'),env);
  env.reorderBlock(parent,nodes,nodes); assert.equal(moves,0);
  env.reorderBlock(parent,nodes,[nodes[0],nodes[2],nodes[1]]); assert.equal(moves,1);
  assert.deepEqual(parent.children.map(n=>n.label),['A','C','B']);
  parent.children=[nodes[0],loose,nodes[1],nodes[2]]; moves=0;
  env.reorderBlock(parent,nodes,[nodes[0],nodes[2],nodes[1]]);
  assert.deepEqual(parent.children.map(n=>n.label),['A','loose','C','B']); assert.equal(moves,1);
});

test('Rules validate complete input, preserve first-match syntax and reject edits before writing', async () => {
  const s = await source('tab-router'), writes=[], alerts=[];
  const env=vm.createContext({SEP:()=> ' / ', retired:false, window:{}, P:'zzrouter.',
    Services:{prefs:{setStringPref:(...v)=>writes.push(v)},prompt:{
      prompt(_w,_t,_m,input) {input.value='bad entry';return true;}, alert:(_w,_t,m)=>alerts.push(m), confirmEx(){throw Error('must not apply invalid input');}
    }}});
  vm.runInContext(block(s,'  function validateRules(', '  const settingsDocs'),env);
  let result=env.validateRules('gist.github.com, gitlab.com > Dev / Tools; github.com > Dev\nyoutube.com > Watch');
  assert.equal(result.valid,true);assert.equal(result.rules.length,3);
  assert.equal(result.rules[0].group,'Dev / Tools');assert.equal(result.rules[0].domains[0],'gist.github.com');
  result=env.validateRules('github.com > Dev; broken\nyoutube.com >');
  assert.deepEqual(Array.from(result.errors,e=>[e.line,e.entry]),[[1,2],[2,1]]);
  assert.equal(env.validateRules('').valid,true);
  env.editRules('github.com > Dev');assert.equal(writes.length,0);assert.match(alerts[0],/Line 1, entry 1/);
  const events=[];
  vm.runInContext(block(s,'  const settingsDocs', '  function hostOf'),env);
  const input={value:'missing separator',closest:()=>true,setCustomValidity(v){this.error=v;},reportValidity(){events.push('reported');}};
  env.validateRuleEdit({target:input,type:'change',preventDefault(){events.push('prevented');},stopImmediatePropagation(){events.push('stopped');}});
  assert.deepEqual(events,['prevented','stopped','reported']);assert.equal(writes.length,0);
});

test('Turbo native default branch preserves typed overrides and reset reveals shipped values', async () => {
  const s=await source('zen-turbo'), declarations=JSON.parse(await readFile(new URL('../zen-turbo/preferences.json',import.meta.url),'utf8'));
  const defaults=new Map(), user=new Map([['zzturbo.measure',true],['zzturbo.startup-warm-count',3],['zzturbo.startup-warm-delay-ms','7000']]);
  const branch={setBoolPref:(k,v)=>defaults.set(k,v),setIntPref:(k,v)=>defaults.set(k,v),setStringPref:(k,v)=>defaults.set(k,v)};
  const env=vm.createContext({P:'zzturbo.',Services:{prefs:{getDefaultBranch:k=>{assert.equal(k,'');return branch;}}},fetch:async()=>({json:async()=>declarations})});
  vm.runInContext(block(s,'  const MOD_ID = "zz-zen-turbo";', '  // ---- startup'),env);
  await env.seedDefaults();
  const read=k=>user.has(k)?user.get(k):defaults.get(k);
  assert.equal(defaults.get('zzturbo.measure'),false);assert.equal(defaults.get('zzturbo.startup-warm-count'),'6');
  for (const [key,value] of user) assert.equal(read(key),value);
  user.delete('zzturbo.measure');assert.equal(read('zzturbo.measure'),false);
  await env.seedDefaults();assert.equal(user.get('zzturbo.startup-warm-count'),3);
  assert.match(s,/await defaultsReady;[\s\S]*?try \{ start\(\)/);
});

test('Media sizing: disabled has 0 subscriptions; toggles coalesce and teardown cancels writes', async () => {
  const s=await source('mediaflow'), observers=[], timers=new Map(), undo=[];
  let enabled=false, id=0, writes=0, onPref;
  class Observer { constructor(fn){this.fn=fn;this.targets=new Set();observers.push(this);}observe(t){this.targets.add(t);}disconnect(){this.targets.clear();} }
  const front={isConnected:true,matches:()=>false,getBoundingClientRect:()=>({height:80})};
  const bar={hidden:false,matches:()=>false,style:{setProperty(){writes++;}}};
  const env=vm.createContext({retired:false,mediaBar:bar,window:{gZenMediaController:{frontCard:{element:front}}},undo,ResizeObserver:Observer,MutationObserver:Observer,
    Services:{prefs:{getBoolPref:()=>enabled,addObserver:(_k,f)=>onPref=f,removeObserver(){}}},
    setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(block(s,'  const EXPANDED_PREF', '    // Zen makes a card')+'\n}',env);
  assert.equal(observers.reduce((n,o)=>n+o.targets.size,0),0); assert.equal(timers.size,1);
  for (let i=0;i<6;i++){enabled=!enabled;onPref();assert.equal(timers.size,1);}
  assert.equal(observers.reduce((n,o)=>n+o.targets.size,0),0);
  enabled=true;onPref();assert.equal(observers.reduce((n,o)=>n+o.targets.size,0),2);
  const pending=[...timers.values()][0];env.retired=true;undo[0]();const prior=writes;pending();
  assert.equal(writes,prior);assert.equal(timers.size,0);assert.equal(observers.reduce((n,o)=>n+o.targets.size,0),0);
});

test('Completion motion is finite, glyph-only, deduplicated and honors still/reduced/off choices', async () => {
  const s=await source('iconflow'), animations=[], prefs=new Map();let reduced=false;
  const glyph={isConnected:true,getClientRects:()=>[{}],animate(frames,opts){animations.push({frames,opts});return {finished:new Promise(()=>{})};}};
  const env=vm.createContext({retired:false,PREFIX:'zzicon.',Services:{prefs:{getIntPref:(k,d)=>prefs.get(k)??d,getBoolPref:(k,d)=>prefs.get(k)??d}},
    window:{matchMedia:()=>({matches:reduced})},document:{querySelectorAll:()=>[glyph]}});
  vm.runInContext(block(s,'  const completions =', '  function listenForCompletions()'),env);
  env.completion('downloads','#downloads-button .toolbarbutton-icon');env.completion('downloads','#downloads-button .toolbarbutton-icon');
  assert.equal(animations.length,1);assert.equal(animations[0].opts.duration,360);assert.deepEqual(Object.keys(animations[0].frames[0]),['scale']);
  vm.runInContext('completions.clear()',env);reduced=true;env.completion('downloads','glyph');assert.equal(animations.length,1);
  reduced=false;prefs.set('zzicon.button.downloads',1);env.completion('downloads','glyph');assert.equal(animations.length,1);
  prefs.set('zzicon.button.downloads',0);prefs.set('zzicon.animate',false);env.completion('downloads','glyph');assert.equal(animations.length,1);
  prefs.set('zzicon.animate',true);prefs.set('zzicon.library.style',2);env.completion('library','glyph');assert.equal(animations.length,1);
  prefs.set('zzicon.library.style',11);prefs.set('zzicon.button.downloads',1);env.completion('library','glyph');assert.equal(animations.length,2);
  vm.runInContext('completions.clear()',env);prefs.set('zzicon.button.bookmark',1);env.completion('bookmark','glyph');assert.equal(animations.length,2);
});

test('Groupflow unchanged metadata does not serialize or write; repeated renames save once', async () => {
  const s=await source('groupflow'), events=new Map(), timers=new Map(), data={}, stored=new Map();
  let serializations=0,writes=0,historyReads=0;
  const group={id:'group',label:'Original',color:'blue',hasAttribute:()=>false};
  const env=vm.createContext({readGroupData:()=>data,isCopy:()=>false,restoreParents(){},workspaceOf:()=> 'workspace',
    window:{addEventListener:(k,fn)=>events.set(k,fn),removeEventListener(){}},
    document:{querySelectorAll:()=>[group]},
    setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id),
    JSON:{stringify(value){serializations++;return JSON.stringify(value);}},
    SessionStore:{getCustomWindowValue:(_w,k)=>stored.get(k),setCustomWindowValue(_w,k,v){writes++;stored.set(k,v);},getClosedTabData(){historyReads++;return [];}}
  });
  vm.runInContext(block(s,'  function writeGroupData(', '  function restoreParents('),env);
  const tracker=env.trackGroupDetails();tracker.save();serializations=writes=historyReads=0;
  const flush=()=>{for(const [id,fn] of timers){timers.delete(id);fn();}};
  for(let i=0;i<5;i++)events.get('TabGroupUpdate')();flush();
  assert.deepEqual([serializations,historyReads,writes],[0,0,0]);
  for(let i=0;i<5;i++){group.label='Rename '+i;events.get('TabGroupUpdate')();}
  assert.equal(timers.size,1);flush();
  assert.deepEqual([serializations,historyReads,writes],[1,0,1]);
  assert.equal(JSON.parse(stored.get('groupflowGroups')).group.label,'Rename 4');
  tracker.retire();assert.equal(writes,1);
});

test('Appearance snapshot restore validates whole snapshot and clears absent user overrides',async()=>{
  const s=await source('glassflow'), store=new Map(), writes=[];
  const P={PREF_BOOL:128,PREF_INT:64,PREF_STRING:32,getStringPref:(k,d)=>store.get(k)??d,
    setBoolPref:(k,v)=>writes.push([k,v]),setIntPref:(k,v)=>writes.push([k,v]),setStringPref:(k,v)=>writes.push([k,v]),clearUserPref:k=>writes.push([k,'clear'])};
  const instance={},window={owner:instance};const env=vm.createContext({window,instance,INSTANCE_KEY:'owner',Services:{prefs:P},APPEARANCE:'saved'});
  vm.runInContext(block(s,'  let appearanceNames', '  appearancePrefs().then')+'\nappearanceNames=new Set(["zzglass.enabled","zzgroup.radius"]);',env);
  store.set('saved',JSON.stringify({version:1,values:{'zzglass.enabled':{type:128,had:true,value:true},'zzgroup.radius':{type:0,had:false,value:null}}}));
  assert.ok(env.savedAppearance());await env.restoreAppearance();assert.deepEqual(writes,[['zzglass.enabled',true],['zzgroup.radius','clear']]);
  writes.length=0;store.set('saved',JSON.stringify({version:1,values:{'zzglass.enabled':{type:128,had:true,value:true},'zzrouter.rules':{type:32,had:true,value:'secret'}}}));
  assert.equal(env.savedAppearance(),null);await env.restoreAppearance();assert.equal(writes.length,0);
});
