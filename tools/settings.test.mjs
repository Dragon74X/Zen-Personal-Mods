// Settings menus: rows Sine can show and hide correctly, and the page picker
// on the large menus. Sine finds a conditional row by its id or property.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const mods = ["download-prompt", "glassflow", "glassflow-library", "groupflow", "iconflow", "tab-router", "tab-unloader", "zen-turbo", "mediaflow", "peekflow"];
const paged = { glassflow: "zzglass.ui.page", "glassflow-library": "zzlib.ui.page", groupflow: "zzgroup.ui.page", iconflow: "zzicon.ui.page" };
const read = async mod => JSON.parse(await readFile(new URL(`../${mod}/preferences.json`, import.meta.url), "utf8"));
const watched = conditions => (Array.isArray(conditions) ? conditions : [conditions]).flatMap(c =>
  c.conditions ? watched(c.conditions) : [(c.if || c.not).property]);

for (const mod of mods) {
  test(`${mod}: conditional rows can be found and watch declared settings`, async () => {
    const prefs = await read(mod), declared = new Set(prefs.map(p => p.property).filter(Boolean));
    const ids = prefs.map(p => p.id ?? p.property).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "duplicate ids");
    for (const p of prefs) {
      if (!p.conditions) continue;
      assert.ok(p.id ?? p.property, `conditional row without id: ${p.label}`);
      for (const name of watched(p.conditions)) assert.ok(declared.has(name), `${p.id ?? p.property} watches ${name}`);
    }
  });
}

for (const [mod, nav] of Object.entries(paged)) {
  test(`${mod}: every row after the picker belongs to one of its pages`, async () => {
    const prefs = await read(mod), at = prefs.findIndex(p => p.property === nav);
    const picker = prefs[at], pages = new Set(picker.options.map(o => o.value));
    assert.ok(at > 0 && pages.has("all") && pages.has(picker.defaultValue));
    const seen = new Set();
    for (const p of prefs.slice(at + 1)) {
      const page = p.conditions?.[0]?.conditions;
      assert.ok(page && p.conditions[0].operator === "OR" && (p.operator === "AND" || p.type === "separator"), `${p.id ?? p.property} has no page`);
      const values = page.map(c => c.if.value);
      assert.ok(page.every(c => c.if.property === nav) && values.includes("all") && values.includes(""));
      seen.add(values[0]);
    }
    assert.deepEqual([...seen].sort(), [...pages].filter(v => v !== "all").sort(), "every page has rows");
  });
}

// Storage contract captured from 7a1d2c8, before presentation changes. Navigation
// choices are excluded. This release explicitly removes header arrows, adds
// motion/relief controls, and defaults only NEW profiles to the shared shape.
test('existing storage contracts remain unchanged except approved shape/arrow choices and retired page filter', async () => {
  const { createHash } = await import('node:crypto');
  const navigation = new Set(['zzglass.ui.tab-state', 'zzgroup.ui.folder-state', 'zzicon.ui.button-category',
    'zzglass.motion.enabled', 'zzglass.motion.profile', 'zzglass.motion.light', 'zzglass.edges.calculated', 'zzglass.edges.surface', 'zzglass.edges.depth']);
  const rows = (await Promise.all(mods.map(async mod => (await read(mod)).filter(p => p.property && !navigation.has(p.property))
    .map(p => [mod, p.property, p.type, p.value ?? null, p.defaultValue ?? null, p.options?.map(o => o.value) ?? null]))))
    .flat().sort((a,b) => a[1].localeCompare(b[1], 'en'));
  assert.equal(rows.length, 522);
  assert.ok(!rows.some(r => r[1] === 'zzgroup.scroll-arrows'));
  const shape = rows.find(r => r[1] === 'zzgroup.corner.mode');
  assert.equal(shape[4], 8); assert.deepEqual(shape[5], [0,1,2,3,4,5,6,7,8]);
  shape[4] = 0; shape[5].pop();
  const icons=rows.find(r=>r[1]==='zzicon.set');
  assert.equal(icons[4],4); assert.deepEqual(icons[5],[4,0,2,3]);
  icons[4]=0;icons[5].shift();
  assert.ok(!rows.some(row=>row[1]==='zzglass.sidebar.blur-transparent-pages'));
  rows.push(['glassflow','zzglass.sidebar.blur-transparent-pages','checkbox',null,true,null]);
  rows.push(['groupflow','zzgroup.scroll-arrows','checkbox',null,true,null]);
  rows.sort((a,b) => a[1].localeCompare(b[1], 'en'));
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), '0316bd0c2a6cd4f0a3cc1f7873bfef32fa762ccb8058e7aaff2cf1b2c6c5a038');
});

test('opacity presentation preserves fraction, percentage and numeric-percent contracts', async () => {
  const { displaySettingValue: show, storedSettingValue: store } = await import('../download-prompt/sine-update-guard.sys.mjs');
  for (const [key, value, shown] of [
    ['zzglass.selected.opacity', '1', '100%'], ['zzglass.pending.opacity', '0.62', '62%'],
    ['zzgroup.collapsed-opacity', '0.75', '75%'], ['zzgroup.marker-opacity', '0.85', '85%'],
    ['zzlib.card.gradient', '1', '100%'], ['zzrouter.nexus-banner-opacity', '25', '25%'],
    ['zzglass.buttons.opacity', '75%', '75%'], ['zzlib.card.fill', '70%', '70%'],
  ]) {
    assert.equal(show(key,value), shown);
    assert.equal(store(key,shown,value), value);
  }
  for (const value of ['', 'calc(1 - var(--dim))', 'var(--alpha)', 'unknown', '9'.repeat(400)]) {
    assert.equal(show('zzglass.pending.opacity',value),value);
    assert.equal(store('zzglass.pending.opacity',value,'0.62'),null);
  }
  for (const value of ['-1%', '101%', 'Infinity', 'NaN']) assert.equal(store('zzgroup.marker-opacity',value,'0.85'),null);
  assert.equal(store('zzgroup.marker-opacity','42','0.85'),'0.42');
  assert.equal(store('zzgroup.marker-opacity','42%','85%'),'42%');
  assert.equal(store('zzrouter.nexus-banner-opacity','42%','25'),'42');
});

function matches(conditions, values, operator='OR') {
  const list = Array.isArray(conditions) ? conditions : [conditions];
  const result = list.map(c => c.conditions ? matches(c.conditions, values, c.operator || 'AND')
    : c.if ? values[c.if.property] === c.if.value : values[c.not.property] !== c.not.value);
  return operator === 'AND' ? result.every(Boolean) : result.some(Boolean);
}
async function menu(mod) {
  const rows=await read(mod), values=Object.fromEntries(rows.filter(p=>p.property).map(p=>[p.property,p.defaultValue]));
  return {rows,values,visible(key,overrides={}) {const row=rows.find(p=>(p.property||p.id)===key);assert.ok(row,key);
    return !row.conditions || matches(row.conditions,{...values,...overrides},row.operator||'OR');}};
}

test('Glassflow conditions match custom, secondary, end-tint and rim consumers', async () => {
  const m=await menu('glassflow');
  for (const source of [0,1,2,3]) for (const fallback of [0,1,2])
    assert.equal(m.visible('zzglass.color.custom',{'zzglass.color.source':source,'zzglass.color.fallback':fallback}),source===2||fallback===1);
  assert.equal(m.visible('zzglass.color.secondary'),true);
  for (const state of ['selected','unselected','hover','pending']) {
    const values={'zzglass.ui.page':'tabs','zzglass.ui.tab-state':state,[`zzglass.${state}.enabled`]:true};
    for (const mode of [0,1,2,3]) assert.equal(m.visible(`zzglass.${state}.end-tint`,{...values,[`zzglass.${state}.end-mode`]:mode}),mode===1||mode===2);
    assert.equal(m.visible(`zzglass.${state}.end-tint`,{...values,[`zzglass.${state}.enabled`]:false}),false);
    assert.equal(m.visible(`zzglass.edges.${state}-thickness`,{...values,'zzglass.edges.enabled':false}),false);
    assert.equal(m.visible(`zzglass.edges.${state}-thickness`,{...values,'zzglass.edges.enabled':true,[`zzglass.${state}.rim`]:true,[`zzglass.edges.${state}-edge`]:4}),false);
  }
  assert.ok(m.rows.findIndex(p=>p.property==='zzglass.edges.enabled')<m.rows.findIndex(p=>p.property==='zzglass.selected.enabled'));
});

test('Groupflow curve, connector, marker and rim conditions replace CSS backstops',async()=>{
  const m=await menu('groupflow'),page={'zzgroup.ui.page':'lines','zzgroup.enabled':true};
  for(const connector of [0,1,2,3,4,5]) for(const shape of [0,1,2,3,4,5,6,7]) {
    const values={...page,'zzgroup.connector':connector,'zzgroup.line-shape':shape};
    for(const key of ['zzgroup.curve-weight','zzgroup.curve-amplitude']) assert.equal(m.visible(key,values),connector!==0&&(shape!==0||connector===5),key);
    assert.equal(m.visible('zzgroup.line.match-tab',values),connector!==0);
  }
  for(const marker of [0,1,2]) for(const sub of [0,1,2]) assert.equal(m.visible('zzgroup.marker-opacity',{...page,'zzgroup.marker':marker,'zzgroup.marker-sub':sub}),marker!==0||sub===2);
  assert.equal(m.visible('zzgroup.rim-thickness',{'zzgroup.ui.page':'headers','zzgroup.header.rim':false}),false);
});

test('Router pictures, path parsing, empty sections, Unloader and Peekflow applicability',async()=>{
  const router=await menu('tab-router');
  for(const enabled of [false,true]) for(const pictures of [false,true]) {
    const values={'zzrouter.enabled':enabled,'zzrouter.section-icons':pictures};
    for(const key of ['zzrouter.auto-path-mode','zzrouter.auto-path-domains']) assert.equal(router.visible(key,values),enabled||pictures);
  }
  for(const key of ['zzrouter.auto-path-depth','zzrouter.auto-path-ignore','zzrouter.auto-path-aliases']) assert.equal(router.visible(key,{'zzrouter.enabled':true,'zzrouter.auto-unmatched':false}),true);
  for(const row of router.rows.filter(p=>p.type==='separator'&&/^(Sorting|Leave alone|Timing|Troubleshooting)$/.test(p.label))) assert.equal(router.visible(row.id,{'zzrouter.enabled':false}),false);
  const unload=await menu('tab-unloader');assert.equal(unload.visible('zzunload.other.arc',{'zzunload.enabled':false}),false);
  const peek=await menu('peekflow');
  for(const show of [false,true]) for(const place of [0,1,2]) assert.equal(peek.visible('zzpeek.gap',{'zzpeek.show':show,'zzpeek.place':place}),show&&place!==0);
  for(const show of [false,true]) for(const pictures of [false,true]) assert.equal(peek.visible('zzpeek.last-view',{'zzpeek.show':show,'zzpeek.pictures':pictures}),show&&pictures);
});

test('navigation filters preserve Everything and legacy empty-page fallback',async()=>{
  for(const [mod,nav,page,selector,cases] of [
    ['glassflow','zzglass.ui.page','tabs','zzglass.ui.tab-state',[['selected','zzglass.selected.enabled'],['unselected','zzglass.unselected.enabled'],['hover','zzglass.hover.enabled'],['pending','zzglass.pending.enabled']]],
    ['groupflow','zzgroup.ui.page','states','zzgroup.ui.folder-state',[['active','zzgroup.subfolder.active.tint'],['inactive','zzgroup.subfolder.inactive.tint'],['hover','zzgroup.subfolder.hover.tint']]],
    ['iconflow','zzicon.ui.page','buttons','zzicon.ui.button-category',[['navigation','zzicon.button.back'],['page','zzicon.button.bookmark']]],
  ]) {
    const m=await menu(mod);
    const base={'zzgroup.subfolder.states':true,'zzgroup.enabled':true};
    for(const [state,key] of cases) {
      assert.equal(m.visible(key,{...base,[nav]:page,[selector]:state}),true,key);
      for(const value of ['all','']) assert.equal(m.visible(key,{...base,[nav]:page,[selector]:value}),true,key);
      for(const value of ['all','']) assert.equal(m.visible(key,{...base,[nav]:value,[selector]:'other'}),true,key);
    }
  }
});

test('covered enumerations suppress injected None; stable headings and declared defaults remain',async()=>{
  for(const mod of mods)for(const p of await read(mod)) {
    if(p.type==='separator')assert.ok(p.id,p.label);
    if(p.type==='dropdown'&&p.options.some(o=>o.value===p.defaultValue))assert.equal(p.placeholder,false,p.property);
  }
});

test('shared renderer requires both exact mod identity and its preference namespace',async()=>{
  const {fixSettingsConditions}=await import('../download-prompt/sine-update-guard.sys.mjs');
  const conditions=[{if:{property:'zzgroup.enabled',value:true}}],seen=[];
  const utils={async getModPreferences(mod){return [{type:'checkbox',property:mod.key,label:'Setting',defaultValue:true,conditions}];}};
  const manager={preferences:{parsePref(pref){seen.push(pref);return null;},setupPrefObserver(){throw Error('unexpected observer');}}};
  assert.equal(fixSettingsConditions(manager,utils),true);
  for(const [id,key,owned] of [
    ['zz-groupflow','zzgroup.enabled',true],['other-mod','zzgroup.enabled',false],
    ['zz-groupflow','other.enabled',false],['zz-glassflow','zen.theme.acrylic-sidebar',true],
    ['zz-groupflow','zen.theme.acrylic-sidebar',false],['zz-groupflow-copy','zzgroup.enabled',false],
  ]) {
    const [pref]=await utils.getModPreferences({id,key});manager.preferences.parsePref(pref,manager,{});
    assert.equal(seen.at(-1).conditions===undefined,owned,`${id}: ${key}`);
    assert.equal(pref.conditions,conditions,'source metadata stays intact');
  }
  assert.equal(fixSettingsConditions(manager,utils),false);
});
