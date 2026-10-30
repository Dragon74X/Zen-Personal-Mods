import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const CHANNEL = "https://www.youtube.com/@channel";
const GAME = "https://www.nexusmods.com/games/baldursgate3";
const AUTHOR = "https://www.nexusmods.com/profile/wesslen";
const ICON = "data:image/webp;base64,AQ==";
const BANNER = "data:image/webp;base64,Ag==";
const gameMetadata = (canonical = GAME, image = 'https://images.nexusmods.com/images/games/v2/3474/tile.jpg') =>
  `<meta property="og:url" content="${canonical}"><meta property="og:title" content="Baldur's Gate 3 Mods - Nexus Mods"><meta property="og:image" content="${image}">`;
function element(extra = {}) {
  const attrs = new Map(), style = new Map();
  return {
    isConnected: true, closest: () => null,
    getAttribute: key => attrs.get(key), hasAttribute: key => attrs.has(key),
    setAttribute: (key, value) => attrs.set(key, String(value)), removeAttribute: key => attrs.delete(key),
    style: { setProperty: (k,v) => style.set(k,v), removeProperty: k => style.delete(k), getPropertyValue: k => style.get(k) || "" },
    dispatchEvent() {}, ...extra,
  };
}
async function environment(options = {}) {
  const prefs = new Map(Object.entries({
    "zzrouter.enabled": true, "zzrouter.rules": "youtube.com > Youtube\nnexusmods.com > Nexus",
    "zzrouter.media-subgroups": true, "zzrouter.follow-containers": false,
    "zzrouter.auto-path-depth": 1, "zzrouter.auto-path-domains": "youtube.com,nexusmods.com",
    "zzrouter.creators": "{}", ...options,
  }));
  const tabs = [], groups = [], pending = [], requests = [], timers = new Map(), refreshes = [], values = new Map();
  let now = 1000000, serial = 0, scans = 0, privateWindow = false, moves = 0;
  function navigate(tab, spec) {
    const url = new URL(spec);
    tab.linkedBrowser = { currentURI: { spec, scheme: url.protocol.slice(0,-1), host: url.hostname,
      filePath: url.pathname, query: url.search.slice(1) } };
  }
  function addTab(spec = "https://www.youtube.com/watch?v=video", ctx = 0) {
    const tab = element({ label: "Video" }); navigate(tab, spec);
    tab.setAttribute("usercontextid", ctx); tab.setAttribute("zen-workspace-id", "ws"); tabs.push(tab); return tab;
  }
  function addGroup(label, parent = null, subject = null, ctx = 0, picture = subject) {
    const g = element({ id: `group-${++serial}`, label, tagName: "tab-group", parentElement: { closest: () => parent },
      tabs: [], querySelector() { return this.tabs.find(t => !t.closing) || groups.find(c => c.parentElement.closest() === this)?.querySelector(); },
      querySelectorAll() { return this.tabs; },
      addTabs(items) { for (const tab of items) {
        if (tab.group) tab.group.tabs = tab.group.tabs.filter(t => t !== tab);
        tab.group = g; g.tabs.push(tab); moves++;
      } },
    });
    g.setAttribute("zen-workspace-id", "ws");
    if (subject) {
      g.setAttribute("data-zzrouter-subject", subject); g.setAttribute("data-zzrouter-context", ctx);
      g.setAttribute("data-zzrouter-picture", picture);
    }
    groups.push(g); return g;
  }
  const NetUtil = {
    newChannel: ({ uri, loadingPrincipal }) => ({ loadFlags: 0, cancel() {},
      QueryInterface() { return this; }, setUploadStream(stream) { this.body=stream.data; },
      asyncOpen(listener) { pending.push([this, listener]); requests.push({ url: uri, ctx: loadingPrincipal.userContextId, body: this.body }); } }),
    readInputStreamToString: (stream, count) => stream.body.slice(0, count),
  };
  let source = await readFile(process.env.ROUTER_SOURCE || new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");
  const names = "fetchCreator,fetchSectionIcon,stampIcons,route,iconMap,creatorMap,updatePicture,pictureSubject,refreshPictures,chainOf,startsWithPath,findChild,targetPath,file,captureNexus,nexusGame,nexusURLFrom,musicPage,partLabel,onTabEvent,prefObserver,inFlight,saveNexus,savedNexus,cancelLookups,forgetAll,refreshSubject,fetchMetadata,saveIcons,flushWrites,toIcon,paintBanner".split(",");
  source = source.replace("  // ---- declared defaults", `globalThis.harness = {${names.map(n=>`${n}:typeof ${n} === 'undefined' ? null : ${n}`).join(',')}, observeQueues: cb => queueRoute=cb}; return;\n  // ---- declared defaults`);
  const window = { Groupflow: { refresh: defer => refreshes.push(defer), automaticPictureAllowed: g => !g.customIcon },
    SessionStore: { getCustomTabValue: (t,k) => values.get(t)?.[k] || "",
      setCustomTabValue(t,k,v) { values.set(t, {...values.get(t),[k]:v}); },
      deleteCustomTabValue(t,k) { if (values.has(t)) delete values.get(t)[k]; } },
  };
  const context = vm.createContext({
    window, gBrowser: { getTabForBrowser: b => tabs.find(t=>t.linkedBrowser===b),
      addTabGroup(items, opts) { const g=addGroup(opts.label, items[0].group);g.addTabs(items);return g; } },
    document: { getElementById: id => groups.find(g=>g.id===id), querySelectorAll: selector => {
      scans++; return selector.startsWith("tab-group") ? groups : tabs;
    } },
    Services: {
      prefs: { PREF_INT:64, PREF_STRING:32, getPrefType:k=>typeof prefs.get(k)==="number"?64:32,
        getIntPref:k=>prefs.get(k), getBoolPref:(key,fallback)=>prefs.get(key)??fallback,
        getStringPref:(key,fallback)=>prefs.get(key)??fallback, setStringPref:(key,value)=>prefs.set(key,value) },
      eTLD: { getBaseDomain:uri=>uri.host.split('.').slice(-2).join('.') },
      io: { newURI: value => { const url = new URL(value); return {
        scheme:url.protocol.slice(0,-1), host:url.hostname, userPass:url.username+url.password,
      }; } }, scriptSecurityManager: { createContentPrincipal:(_uri,attrs)=>attrs },
    },
    ChromeUtils: { generateQI:()=>()=>{}, importESModule:name=>name.includes("NetUtil")
      ? { NetUtil } : name.includes("Timer") ? {setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)} : { PrivateBrowsingUtils: { isWindowPrivate:()=>privateWindow } } },
    Ci: { nsILoadInfo:{}, nsIContentPolicy:{}, nsIRequest:{} },
    Cc: { "@mozilla.org/io/string-input-stream;1": { createInstance:()=>({}) } },
    Components: { isSuccessCode:status=>status===0 },
    Date: { now:()=>now }, setTimeout:fn=>{timers.set(++serial,fn);return serial;}, clearTimeout:id=>timers.delete(id),
    URLSearchParams, Blob, Uint8Array, CustomEvent: class { constructor(type, options) { Object.assign(this, {type}, options); } },
    createImageBitmap:async blob=>{
      const bytes=await blob.text();
      if(bytes==='invalid')throw new Error('decode failed');
      const [width,height]=bytes==='banner'?[1920,620]:bytes==='huge'?[5000,5000]:bytes==='portrait'?[400,600]:[64,64];
      return {width,height,close(){}};
    },
    OffscreenCanvas:class { constructor(w,h){this.width=w;this.height=h;} getContext(){return{drawImage(){}};} async convertToBlob(){return{arrayBuffer:async()=>new Uint8Array([this.width===384?2:1]).buffer};} },
    btoa:value=>Buffer.from(value).toString("base64"),
  });
  vm.runInContext(source, context);
  return { h:context.harness,prefs,tabs,groups,requests,pending,timers,refreshes,values,addTab,addGroup,navigate,window,
    advance:ms=>now+=ms,makePrivate:()=>privateWindow=true,get scans(){return scans;},get moves(){return moves;},
    answer(body) { body=Buffer.from(body).toString("latin1"); const [channel,listener]=pending.shift();listener.onStartRequest(channel);
      listener.onDataAvailable(channel,{body},0,body.length);listener.onStopRequest(channel,0); },
  };
}
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('Live Folder ownership prevents routing and artwork even with pinned/grouped exclusions off', async()=>{
  for (const kind of ['item', 'folder', 'ancestor']) {
    const e=await environment({'zzrouter.skip-pinned':false,'zzrouter.skip-grouped':false});
    const t=e.addTab(GAME), parent=e.addGroup('Provider');
    const g=kind==='ancestor'?e.addGroup('Nested',parent):parent;
    g.addTabs([t]);
    if(kind==='item')t.setAttribute('zen-live-folder-item-id','provider-item');
    else parent.isLiveFolder=true;
    t.pinned=true;
    t.setAttribute('image','native-provider-icon');
    t.setAttribute('data-zzrouter-tab-icon',ICON);
    t.style.setProperty('--zzrouter-tab-icon',`url("${ICON}")`);
    e.h.onTabEvent({type:'TabGrouped',target:t});
    await e.h.route(t,'test');
    assert.equal(e.h.file(t,['Nexus','Baldurs Gate 3']),false,'final placement boundary rejects provider tabs');
    assert.equal(t.group,g,kind);
    assert.equal(e.moves,1,kind);
    assert.equal(e.requests.length,0,kind);
    assert.equal(t.getAttribute('data-zzrouter-tab-icon'),undefined);
    assert.equal(t.style.getPropertyValue('--zzrouter-tab-icon'),'');
    assert.equal(t.getAttribute('image'),'native-provider-icon');
    assert.equal(e.h.pictureSubject(t),null);
    assert.equal(e.h.refreshSubject(t),null);
  }
});

test('Nexus defaults to verified square thumbnails, upgrades cached covers, and starts zero banner requests',async()=>{
  const e=await environment({'zzrouter.enabled':false}), t=e.addTab(GAME,2);
  e.h.iconMap().set('2:'+GAME,{d:BANNER,s:'square'});
  e.h.updatePicture(t);assert.equal(t.getAttribute('data-zzrouter-tab-icon'),BANNER,'old cover remains during upgrade');
  e.answer(gameMetadata());assert.equal(e.requests.at(-1).url,'https://images.nexusmods.com/images/games/v2/3474/thumbnail.jpg');
  e.answer('image bytes');await tick();
  assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
  assert.equal(e.h.iconMap().get('2:'+GAME).n,'thumbnail');
  assert.equal(e.h.iconMap().get('2:'+GAME).g,'3474');
  e.h.updatePicture(t);assert.equal(e.requests.length,2);
  assert.ok(e.requests.every(r=>r.ctx===2));assert.equal(e.moves,0);
});

test('Nexus game pictures accept official canonical host aliases without changing subject identity',async()=>{
  const game='https://www.nexusmods.com/games/clairobscurexpedition33';
  const cover='https://images.nexusmods.com/images/games/v2/7635/tile.jpg';
  // Both live Expedition 33 and BG3 pages returned next.nexusmods.com on 2026-10-29.
  for(const host of ['www.nexusmods.com','next.nexusmods.com','nexusmods.com'])for(const slash of ['', '/']){
    const e=await environment(),t=e.addTab(game,2);
    const root=e.addGroup('Nexus'),g=e.addGroup('Clair Obscur: Expedition 33',root,game,2);g.addTabs([t]);
    e.h.updatePicture(t);
    e.answer(gameMetadata(`https://${host}/games/clairobscurexpedition33${slash}`,cover));
    assert.equal(e.requests.at(-1).url,'https://images.nexusmods.com/images/games/v2/7635/thumbnail.jpg',host+slash);
    e.answer('image bytes');await tick();
    assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
    assert.equal(g.getAttribute('data-zzrouter-icon'),ICON);
    assert.equal(g.getAttribute('data-zzrouter-subject'),game);
    assert.equal(e.h.iconMap().get('2:'+game).g,'7635');
    assert.ok(e.requests.every(r=>r.ctx===2));
  }
});

test('Nexus thumbnail decode failure falls back to cover; cover choice and failed refresh retain pictures',async()=>{
  const e=await environment(),t=e.addTab(GAME);
  e.h.updatePicture(t);e.answer(gameMetadata());e.answer('invalid');await tick();
  assert.equal(e.requests.at(-1).url,'https://images.nexusmods.com/images/games/v2/3474/tile.jpg');
  e.answer('portrait');await tick();assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
  const before=e.requests.length;e.h.updatePicture(t);assert.equal(e.requests.length,before,'successful fallback is cached');
  e.prefs.set('zzrouter.nexus-icon',1);e.h.prefObserver.observe(null,null,'zzrouter.nexus-icon');
  assert.equal(e.requests.at(-1).url,'https://images.nexusmods.com/images/games/v2/3474/tile.jpg');
  e.answer('portrait');await tick();assert.equal(e.h.iconMap().get('0:'+GAME).n,'tile');
  e.h.fetchSectionIcon(GAME,GAME,0,'square',true);e.answer(gameMetadata());e.answer('');await tick();
  assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
});

test('Nexus rejects mismatched canonical and unverified image origins; V1 retains cover without invented hero',async()=>{
  for(const [canonical,img] of [[GAME+'/other','https://images.nexusmods.com/images/games/v2/3474/tile.jpg'],
    [GAME.replace('www.','next.')+'/mods','https://images.nexusmods.com/images/games/v2/3474/tile.jpg'],
    ['https://next.nexusmods.com/games/clairobscurexpedition33','https://images.nexusmods.com/images/games/v2/3474/tile.jpg'],
    [GAME.replace('www.nexusmods.com','next.nexusmods.com.evil.example'),'https://images.nexusmods.com/images/games/v2/3474/tile.jpg'],
    [GAME,'https://images.nexusmods.com.evil.example/images/games/v2/3474/tile.jpg'],
    [GAME,'https://images.nexusmods.com/images/games/v2/3474/tile.jpg/other'],
    [GAME,'https://example.com/3474/tile.jpg']]) {
    const e=await environment();e.h.updatePicture(e.addTab(GAME));e.answer(gameMetadata(canonical,img));
    assert.equal(e.requests.length,1,img);assert.equal(e.h.iconMap().size,0);
  }
  const e=await environment({'zzrouter.nexus-banners':3});e.h.updatePicture(e.addTab(GAME));
  const cover='https://images.nexusmods.com/images/games/4_3/tile_3474.jpg';
  e.answer(gameMetadata(GAME,cover));assert.equal(e.requests.at(-1).url,cover);
  e.answer('portrait');await tick();e.h.refreshPictures();assert.equal(e.requests.length,2);
});

test('four banner modes preserve folder identity, hierarchy, placement and manual icons',async()=>{
  for(const mode of [0,1,2,3]) {
    const e=await environment({'zzrouter.nexus-banners':mode,'zzrouter.enabled':false});
    const t=e.addTab(GAME),root=e.addGroup('Nexus'),g=e.addGroup('Renamed',root);
    g.addTabs([t]);g.setAttribute('data-zzrouter-picture',GAME);g.setAttribute('data-zzrouter-context','0');
    e.h.iconMap().set('0:'+GAME,{d:ICON,s:'square',n:'thumbnail',g:'3474',b:BANNER});
    e.h.updatePicture(t);e.h.stampIcons();
    assert.equal(g.hasAttribute('data-zzrouter-banner'),!!(mode&1));
    assert.equal(t.hasAttribute('data-zzrouter-banner'),!!(mode&2));
    assert.equal(g.label,'Renamed');assert.equal(t.group,g);assert.equal(g.parentElement.closest(),root);
    assert.equal(g.hasAttribute('data-zzrouter-subject'),false);assert.equal(e.moves,1);assert.equal(e.requests.length,0);
    t.zenStaticIcon='manual';g.customIcon='manual';e.h.updatePicture(t);e.h.stampIcons();
    assert.equal(t.hasAttribute('data-zzrouter-banner'),false);assert.equal(g.hasAttribute('data-zzrouter-banner'),false);
    assert.equal(t.zenStaticIcon,'manual');assert.equal(g.customIcon,'manual');
  }
});

test('banner lookup is opt-in, partitioned, deduplicated and inactive in private windows',async()=>{
  for(const mode of [0,1,2,3]) {
    const e=await environment({'zzrouter.nexus-banners':mode});
    for(const ctx of [0,0,2]) {
      e.h.iconMap().set(ctx+':'+GAME,{d:ICON,s:'square',n:'thumbnail',g:'3474'});
      e.h.updatePicture(e.addTab(GAME,ctx));
    }
    assert.equal(e.requests.length,mode&2?2:0,'folder-only does not warm artwork for ungrouped tabs');
    if(mode&2) {
      assert.deepEqual(e.requests.map(r=>r.ctx),[0,2]);
      assert.ok(e.requests.every(r=>r.url==='https://images.nexusmods.com/images/games/v2/3474/hero.jpg'));
      e.answer('banner');e.answer('banner');await tick();
      assert.ok(e.tabs.every(t=>t.hasAttribute('data-zzrouter-banner')));
    }
  }
  const e=await environment({'zzrouter.nexus-banners':3});e.makePrivate();
  e.h.iconMap().set('0:'+GAME,{d:ICON,s:'square',n:'thumbnail',g:'3474'});
  e.h.updatePicture(e.addTab(GAME));assert.equal(e.requests.length,0);
});

test('folder-only banners load for verified display-only groups',async()=>{
  const e=await environment({'zzrouter.nexus-banners':1}),root=e.addGroup('Nexus'),g=e.addGroup('Renamed',root);
  g.setAttribute('data-zzrouter-picture',GAME);g.setAttribute('data-zzrouter-context','2');
  g.addTabs([e.addTab(GAME,2)]);
  e.h.iconMap().set('2:'+GAME,{d:ICON,s:'square',n:'thumbnail',g:'3474'});
  e.h.stampIcons();assert.equal(e.requests.length,1);assert.equal(e.requests[0].ctx,2);
  e.answer('banner');await tick();assert.ok(g.hasAttribute('data-zzrouter-banner'));
  assert.equal(g.hasAttribute('data-zzrouter-subject'),false);assert.equal(e.moves,1);
});

test('banner opacity reuses raster cache, clamps 0–100, and never changes icon or fetch count',async()=>{
  const e=await environment({'zzrouter.nexus-banners':2}),t=e.addTab(GAME);
  e.h.iconMap().set('0:'+GAME,{d:ICON,s:'square',n:'thumbnail',g:'3474',b:BANNER});e.h.updatePicture(t);
  for(const [value,expected] of [['50','0.5'],['500','1'],['bad','0.25']]) {
    e.prefs.set('zzrouter.nexus-banner-opacity',value);e.h.prefObserver.observe(null,null,'zzrouter.nexus-banner-opacity');
    assert.ok(decodeURIComponent(t.style.getPropertyValue('--zzrouter-banner-data')).includes(`opacity="${expected}"`));
    assert.equal(e.h.iconMap().get('0:'+GAME).b,BANNER);assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
  }
  for(const value of ['0','-10']) {
    e.prefs.set('zzrouter.nexus-banner-opacity',value);e.h.prefObserver.observe(null,null,'zzrouter.nexus-banner-opacity');
    assert.equal(t.hasAttribute('data-zzrouter-banner'),false);
  }
  assert.equal(e.requests.length,0);
});

test('banner decoding rejects portrait/oversize/invalid bytes and preserves an old banner on failed refresh',async()=>{
  const e=await environment({'zzrouter.nexus-banners':2}),t=e.addTab(GAME);
  for(const bytes of ['portrait','huge'])assert.equal(await e.h.toIcon(bytes,true),null);
  await assert.rejects(e.h.toIcon('invalid',true));assert.equal(await e.h.toIcon('banner',true),BANNER);
  e.h.iconMap().set('0:'+GAME,{d:ICON,s:'square',n:'thumbnail',g:'3474',b:BANNER});
  e.h.fetchSectionIcon(GAME,GAME,0,'square',true);e.answer(gameMetadata());e.answer('image bytes');await tick();
  assert.equal(e.requests.at(-1).url,'https://images.nexusmods.com/images/games/v2/3474/hero.jpg');
  e.answer('invalid');await tick();assert.equal(e.h.iconMap().get('0:'+GAME).b,BANNER);
  e.h.updatePicture(t);assert.ok(t.hasAttribute('data-zzrouter-banner'));
});

test('disabling artwork cancels pending work; stale metadata starts no image requests',async()=>{
  const e=await environment({'zzrouter.nexus-banners':2}),t=e.addTab(GAME);
  e.h.updatePicture(t);e.prefs.set('zzrouter.section-icons',false);e.h.prefObserver.observe(null,null,'zzrouter.section-icons');
  e.answer(gameMetadata());await tick();assert.equal(e.requests.length,1);assert.equal(e.h.iconMap().size,0);
  assert.equal(t.hasAttribute('data-zzrouter-banner'),false);
});

test('banner persistence survives fresh instance; cross-window writes repaint and purge removes all artwork',async()=>{
  const e=await environment({'zzrouter.nexus-banners':2}),key='0:'+GAME;
  e.h.iconMap().set(key,{d:ICON,s:'square',n:'thumbnail',g:'3474',b:BANNER});e.h.saveIcons();e.h.flushWrites();
  const restored=await environment(Object.fromEntries(e.prefs)),t=restored.addTab(GAME);
  restored.h.updatePicture(t);assert.ok(t.hasAttribute('data-zzrouter-banner'));assert.equal(restored.requests.length,0);
  restored.prefs.set('zzrouter.avatars',JSON.stringify({[key]:{d:ICON,s:'square',n:'thumbnail',g:'3474',b:ICON}}));
  restored.h.prefObserver.observe(null,null,'zzrouter.avatars');assert.ok(t.getAttribute('data-zzrouter-banner').endsWith(ICON));
  restored.h.forgetAll();assert.equal(t.hasAttribute('data-zzrouter-banner'),false);
  assert.equal(t.style.getPropertyValue('--zzrouter-banner-data'),'');assert.equal(restored.requests.length,0);
});

test('banner cache sheds optional artwork before icons and stays below 900000 bytes',async()=>{
  const e=await environment();
  for(let i=0;i<100;i++)e.h.iconMap().set('0:https://www.nexusmods.com/games/game'+i,
    {d:ICON,s:'square',n:'thumbnail',g:String(i+1),b:'data:image/webp;base64,'+'A'.repeat(16000)});
  e.h.saveIcons();e.h.flushWrites();
  const stored=e.prefs.get('zzrouter.avatars'),entries=Object.values(JSON.parse(stored));
  assert.ok(stored.length<=900000);assert.equal(entries.length,100);
  assert.ok(entries.every(v=>v.d===ICON));assert.ok(entries.some(v=>!v.b));
});

test("every live waiter receives completed creator lookup", async()=>{
  const e=await environment(),a=e.addTab(),b=e.addTab(),notified=[];
  e.h.observeQueues(t=>notified.push(t));
  e.h.fetchCreator(a,"video");e.h.fetchCreator(b,"video");
  assert.equal(e.requests.length,1);
  e.answer(JSON.stringify({author_name:"Channel",author_url:CHANNEL}));
  assert.deepEqual(notified,[a,b]);
  assert.equal(e.h.inFlight?.size || 0,0);
});
test("completion ignores navigation and closure, retains correctly keyed metadata",async()=>{
  const e=await environment(),a=e.addTab(),b=e.addTab(),notified=[];
  e.h.observeQueues(t=>notified.push(t));e.h.fetchCreator(a,"video");e.h.fetchCreator(b,"video");
  e.navigate(a,"https://example.com/");b.closing=true;
  e.answer(JSON.stringify({author_name:"Channel",author_url:CHANNEL}));
  assert.deepEqual(notified,[]);assert.equal(e.h.creatorMap().get("0:video").key,CHANNEL);
  assert.equal(e.moves,0);assert.equal(e.h.inFlight.size,0);
});
test("pending lookups isolate containers and purge clears all waiters",async()=>{
  const e=await environment();e.h.fetchCreator(e.addTab(),"video");e.h.fetchCreator(e.addTab(undefined,2),"video");
  assert.deepEqual(e.requests.map(x=>x.ctx),[0,2]);e.h.cancelLookups();
  assert.equal(e.h.inFlight.size,0);assert.equal(e.timers.size,0);
});
test("channel metadata after 512 KiB reaches renamed semantic group and matching tabs",async()=>{
  const e=await environment(),t=e.addTab(),root=e.addGroup("Youtube"),g=e.addGroup("Renamed",root,CHANNEL);
  g.addTabs([t]);e.h.creatorMap().set("0:video",{key:CHANNEL,label:"Channel"});
  e.h.fetchSectionIcon(CHANNEL,CHANNEL,0,"round");
  e.answer("x".repeat(760*1024)+'<meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">');
  assert.equal(e.requests[1].url,"https://yt3.googleusercontent.com/avatar=s256");e.answer("image bytes");await tick();
  assert.equal(g.getAttribute("data-zzrouter-icon"),ICON);assert.equal(t.getAttribute("data-zzrouter-tab-icon"),ICON);
  assert.equal(root.getAttribute("data-zzrouter-icon"),undefined);assert.equal(g.label,"Renamed");
  assert.equal(e.timers.size,1, "coalesced persistence");
  for (const [id,fn] of [...e.timers]) { e.timers.delete(id); fn(); }
  assert.equal(e.timers.size,0);
});
test("section-page metadata stops at 1 MiB and failed pictures retry after 10 minutes",async()=>{
  const e=await environment();e.h.fetchSectionIcon(CHANNEL,CHANNEL,0,"round");
  e.answer("x".repeat(1024*1024)+'<meta property="og:image" content="https://example.com/late.png">');
  e.h.fetchSectionIcon(CHANNEL,CHANNEL,0,"round");assert.equal(e.requests.length,1);
  e.advance(600000);e.h.fetchSectionIcon(CHANNEL,CHANNEL,0,"round");assert.equal(e.requests.length,2);
});
test("same-name subjects have separate groups and pictures; ambiguous legacy folders stay unmanaged",async()=>{
  const e=await environment(),a=e.addTab(),b=e.addTab("https://www.youtube.com/watch?v=other"),root=e.addGroup("Youtube");
  const legacy=e.addGroup("Same",root);legacy.addTabs([e.addTab("https://example.com/")]);
  for(const [tab,id,key,picture] of [[a,"video",CHANNEL,ICON],[b,"other","https://www.youtube.com/@other","data:image/webp;base64,Ag=="]]) {
    e.h.creatorMap().set("0:"+id,{key,label:"Same"});e.h.iconMap().set("0:"+key,{d:picture,s:"round"});
    await e.h.route(tab,"test");assert.equal(tab.getAttribute("data-zzrouter-tab-icon"),picture);
  }
  assert.notEqual(a.group,b.group);assert.notEqual(a.group,legacy);assert.equal(a.group.label,b.group.label);
  assert.equal(legacy.getAttribute("data-zzrouter-subject"),undefined);
  assert.equal(legacy.getAttribute("data-zzrouter-icon"),undefined);
});
test('YouTube channel pages and videos reuse verified handle/ID identity in either opening order',async()=>{
  const id='https://www.youtube.com/channel/UCVerified';
  for(const videoFirst of [false,true]){
    const e=await environment({'zzrouter.section-icons':false}),channel=e.addTab(CHANNEL+'/videos'),video=e.addTab();
    e.h.creatorMap().set('0:'+CHANNEL,{key:id,label:'Channel'});
    e.h.creatorMap().set('0:'+id,{key:id,label:'Channel'});
    e.h.creatorMap().set('0:video',{key:CHANNEL,label:'Channel'});
    for(const tab of videoFirst?[video,channel]:[channel,video])await e.h.route(tab,'test');
    assert.equal(channel.group,video.group,'one channel group, not separate handle/ID groups');
    assert.equal(e.h.pictureSubject(video,false).key,id);
    assert.equal(e.groups.filter(g=>g.getAttribute('data-zzrouter-subject')).length,1);
  }
});
test('verified YouTube duplicate repair moves direct tabs; preserves manual names, icons and subfolders',async()=>{
  const id='https://www.youtube.com/channel/UCVerified';
  for(const protectedBy of ['', 'name', 'icon', 'subfolder']){
    const e=await environment({'zzrouter.section-icons':false}),root=e.addGroup('Youtube');
    const a=e.addGroup('Channel',root,id),b=e.addGroup(protectedBy==='name'?'Saved channel':'Channel',root,CHANNEL);
    a.setAttribute('data-zzrouter-created','1');b.setAttribute('data-zzrouter-created','2');
    if(protectedBy==='icon')b.customIcon=true;
    const channel=e.addTab(id),video=e.addTab();a.addTabs([channel]);
    const destination=protectedBy==='subfolder'?e.addGroup('Watch later',b):b;destination.addTabs([video]);
    e.h.creatorMap().set('0:'+CHANNEL,{key:id,label:'Channel'});
    e.h.creatorMap().set('0:'+id,{key:id,label:'Channel'});
    e.h.creatorMap().set('0:video',{key:CHANNEL,label:'Channel'});
    await e.h.route(video,'test');
    assert.equal(video.group,protectedBy?destination:a,protectedBy||'duplicate consolidated');
  }
});
test('channel metadata queues only verified duplicate repairs and keeps container identities separate',async()=>{
  const id='https://www.youtube.com/channel/UCVerified',e=await environment({'zzrouter.section-icons':false}),queued=[];
  e.h.observeQueues((tab,why)=>queued.push({tab,why}));
  const root=e.addGroup('Youtube'),a=e.addGroup('Channel',root,id),b=e.addGroup('Channel',root,CHANNEL);
  a.setAttribute('data-zzrouter-created','1');b.setAttribute('data-zzrouter-created','2');
  const channel=e.addTab(CHANNEL+'/videos'),video=e.addTab(),canonical=e.addTab(id),other=e.addTab('https://www.youtube.com/watch?v=other',2);
  a.addTabs([canonical]);b.addTabs([channel,video]);
  e.h.creatorMap().set('0:video',{key:CHANNEL,label:'Channel'});
  e.h.creatorMap().set('2:other',{key:CHANNEL,label:'Channel'});
  e.h.pictureSubject(channel);assert.equal(e.requests.length,1);
  e.answer(`<meta property="og:url" content="${id}"><meta property="og:title" content="Channel - YouTube">`);
  assert.ok(queued.some(r=>r.tab===video&&r.why==='channel identity'));
  assert.ok(queued.some(r=>r.tab===channel&&r.why==='channel identity'));
  assert.ok(queued.every(r=>r.tab!==canonical&&r.tab!==other));
  assert.equal(e.h.pictureSubject(other,false).key,CHANNEL,'another container has no verified alias');
  for(const tab of new Set(queued.map(r=>r.tab)))await e.h.route(tab,'metadata');
  assert.equal(channel.group,a);assert.equal(video.group,a);
});
test("picture-only updates work when movement disabled, creator grouping off, pinned, Essential or manually grouped",async()=>{
  for(const mode of ["disabled","creator-off","pinned","essential","grouped"]){
    const e=await environment(),t=e.addTab();
    if(mode==="disabled")e.prefs.set("zzrouter.enabled",false);
    if(mode==="creator-off")e.prefs.set("zzrouter.media-subgroups",false);
    if(mode==="pinned")t.pinned=true;
    if(mode==="essential")t.setAttribute("zen-essential","true");
    if(mode==="grouped")e.addGroup("Manual").addTabs([t]);
    e.h.creatorMap().set("0:video",{key:CHANNEL,label:"Channel"});e.h.iconMap().set("0:"+CHANNEL,{d:ICON,s:"round"});
    const before=e.moves;e.h.updatePicture(t);assert.equal(t.getAttribute("data-zzrouter-tab-icon"),ICON,mode);
    assert.equal(e.moves,before);assert.equal(t.getAttribute("usercontextid"),"0");
    assert.equal(t.getAttribute("zen-workspace-id"),"ws");
  }
});
test("manual icons, navigation, disable/re-enable and exclusion restore native fallback",async()=>{
  const e=await environment(),t=e.addTab();t.setAttribute("image","native");
  e.h.creatorMap().set("0:video",{key:CHANNEL,label:"Channel"});e.h.iconMap().set("0:"+CHANNEL,{d:ICON,s:"round"});
  e.h.updatePicture(t);assert.equal(t.getAttribute("data-zzrouter-tab-icon"),ICON);
  t.zenStaticIcon="manual";e.h.updatePicture(t);assert.equal(t.hasAttribute("data-zzrouter-tab-icon"),false);
  delete t.zenStaticIcon;e.h.updatePicture(t);assert.equal(t.getAttribute("data-zzrouter-tab-icon"),ICON);
  e.prefs.set("zzrouter.section-icons",false);e.h.updatePicture(t);assert.equal(t.hasAttribute("data-zzrouter-tab-icon"),false);
  e.prefs.set("zzrouter.section-icons",true);e.h.updatePicture(t);assert.equal(t.getAttribute("data-zzrouter-tab-icon"),ICON);
  e.prefs.set("zzrouter.auto-path-mode",1);e.h.updatePicture(t);assert.equal(t.hasAttribute("data-zzrouter-tab-icon"),false);
  e.navigate(t,"https://example.com/");e.h.updatePicture(t);assert.equal(t.getAttribute("image"),"native");assert.equal(e.moves,0);
});
test("private windows initiate no metadata/image requests or persist new context",async()=>{
  const e=await environment();e.makePrivate();const t=e.addTab(GAME);
  e.h.captureNexus(t);e.h.updatePicture(t);e.h.fetchCreator(t,"video");e.h.fetchSectionIcon(GAME,GAME,0,"square");
  assert.equal(e.requests.length,0);assert.equal(e.values.size,0);
});
test("Nexus same-tab and background authors retain source game despite later selection",async()=>{
  for(const background of [false,true]){
    const e=await environment(),source=e.addTab(GAME+"/mods/1");await e.h.route(source,"source");
    const parent=source.group, t=background?e.addTab("about:blank"):source;
    if(background){t.openerTab=source;e.h.onTabEvent({type:"TabOpen",target:t});await e.h.route(t,"initial blank");}
    e.navigate(t,AUTHOR+"/mods");await e.h.route(t,"author");
    assert.equal(t.group.parentElement.closest(),parent);assert.equal(t.group.getAttribute("data-zzrouter-picture"),GAME);
    assert.equal(t.getAttribute("usercontextid"),"0");assert.equal(e.h.savedNexus(t).game,GAME);
    assert.ok(e.requests.every(r=>!r.url.includes("avatars.nexusmods")));
  }
});
test("same author opened from two games keeps separate parent-scoped subgroups",async()=>{
  const e=await environment(),tabs=[];
  for(const game of [GAME,"https://www.nexusmods.com/games/skyrimspecialedition"]){
    const t=e.addTab(game);await e.h.route(t,"game");e.navigate(t,AUTHOR);await e.h.route(t,"author");tabs.push(t);
  }
  assert.notEqual(tabs[0].group,tabs[1].group);
  assert.notEqual(tabs[0].group.getAttribute("data-zzrouter-picture"),tabs[1].group.getAttribute("data-zzrouter-picture"));
});
test("author to same-game mod exits automatic Author layer; manual suffix stays",async()=>{
  const e=await environment(),t=e.addTab(GAME);await e.h.route(t,"game");const game=t.group;
  e.navigate(t,AUTHOR);await e.h.route(t,"author");assert.notEqual(t.group,game);
  e.navigate(t,GAME+"/mods/2");await e.h.route(t,"back");assert.equal(t.group,game);
  const manual=e.addGroup("Keep",game);manual.addTabs([t]);
  await e.h.route(t,"manual");assert.equal(t.group,manual);
});
test("unresolved direct author creates no root Author group and preserves existing placement",async()=>{
  const e=await environment(),t=e.addTab(AUTHOR);await e.h.route(t,"direct");
  assert.equal(t.group.label,"Nexus");assert.equal(e.groups.length,1);
  const manual=e.addGroup("Keep");manual.addTabs([t]);await e.h.route(t,"direct-again");assert.equal(t.group,manual);
});
test("restored ancestry and saved per-tab association recover game without loading tabs",async()=>{
  const e=await environment(),t=e.addTab(GAME);await e.h.route(t,"game");e.navigate(t,AUTHOR);await e.h.route(t,"author");
  const gameGroup=t.group.parentElement.closest();
  assert.equal(e.values.get(t)?.zzrouterNexus,undefined,"verified ancestry needs no duplicate record");
  e.addGroup("Manual profile placement").addTabs([t]);e.h.captureNexus(t);
  const saved=e.values.get(t).zzrouterNexus,restored=e.addTab(AUTHOR+"/about-me");
  const ancestry=e.addTab(AUTHOR);gameGroup.addTabs([ancestry]);e.h.captureNexus(ancestry);
  assert.equal(e.h.nexusGame(ancestry,false).key,GAME);
  e.values.set(restored,{zzrouterNexus:saved});restored.setAttribute("pending","true");
  e.h.captureNexus(restored);assert.equal(e.h.nexusGame(restored,false).key,GAME);
  assert.equal(restored.getAttribute("pending"),"true");
  e.navigate(restored,"https://example.com/");e.h.captureNexus(restored);assert.equal(e.values.get(restored).zzrouterNexus,undefined);
});
test("explicit numeric game filter overrides stale provenance only with verified game mapping",async()=>{
  const e=await environment(),t=e.addTab(GAME);e.h.captureNexus(t);e.navigate(t,AUTHOR+"?gameId=1704");
  assert.equal(e.h.nexusGame(t,false),null);
  const key="https://www.nexusmods.com/games/skyrimspecialedition";
  e.h.creatorMap().set("0:"+key,{key,label:"Skyrim Special Edition",gameId:"1704"});
  assert.equal(e.h.nexusGame(t,false).key,key);
});
test("current and legacy Nexus URL recognition excludes account/forum hosts and numeric display labels",async()=>{
  const e=await environment();
  assert.equal(e.h.nexusURLFrom("https://next.nexusmods.com/profile/wesslen/about-me?gameId=3474").author,AUTHOR);
  assert.equal(e.h.nexusURLFrom("https://www.nexusmods.com/baldursgate3/mods/1?tab=files").game,GAME);
  assert.equal(e.h.nexusURLFrom("https://www.nexusmods.com/users/89809?tab=user+files").author,"https://www.nexusmods.com/users/89809");
  assert.equal(e.h.nexusURLFrom("https://forums.nexusmods.com/profile/89809-wesslen"),null);
  assert.equal(e.h.nexusURLFrom("https://users.nexusmods.com/"),null);
});
test("Music opaque browse ID stays internal; collection metadata preserves punctuation and playback cannot rename it",async()=>{
  const e=await environment({"zzrouter.rules":"","zzrouter.auto-unmatched":true}),key="https://music.youtube.com/browse/MPREopaque";
  const t=e.addTab(key);const before=e.h.targetPath(t);assert.ok(before.every(p=>!(typeof p === "string" ? p : p.label).includes("MPRE")));
  e.answer(`<meta property="og:url" content="${key}"><meta property="og:title" content="夜 — Live! &amp; More - YouTube Music">`);
  const parts=e.h.targetPath(t);assert.equal(parts.at(-1).label,"夜 — Live! & More");
  t.label="Different track - YouTube Music";assert.equal(e.h.targetPath(t).at(-1).label,"夜 — Live! & More");
  assert.equal(e.requests.length,1);assert.ok(!e.h.pictureSubject(t,false));
});
test("Music explicit hierarchy and manual names remain unchanged; no title parsing or album-picture fetch",async()=>{
  const e=await environment({"zzrouter.rules":"music.youtube.com > Audio / Collections"}),t=e.addTab("https://music.youtube.com/browse/MPREopaque");
  t.label="Playing Song - Artist - YouTube Music";
  assert.deepEqual(Array.from(e.h.targetPath(t)),["Audio","Collections"]);assert.equal(e.requests.length,0);
});

test("direct numeric Nexus game filter resolves anonymously and wakes each current waiter",async()=>{
  const e=await environment(),a=e.addTab(AUTHOR+'?gameId=3474'),b=e.addTab(AUTHOR+'?gameId=3474'),notified=[];
  e.h.observeQueues(t=>notified.push(t));e.h.updatePicture(a);e.h.updatePicture(b);
  assert.equal(e.requests.length,1);assert.equal(e.requests[0].url,'https://api.nexusmods.com/v2/graphql');
  assert.equal(JSON.parse(e.requests[0].body).query,'{game(id:"3474"){id name domainName}}');
  e.answer(JSON.stringify({data:{game:{id:3474,name:"Baldur's Gate 3",domainName:"baldursgate3"}}}));
  assert.deepEqual(notified,[a,b]);assert.equal(e.h.nexusGame(a,false).key,GAME);
  assert.equal(e.h.nexusGame(b,false).label,"Baldur's Gate 3");assert.equal(e.moves,0);
});

test("manual or ambiguous legacy subfolders under matching root keep placement without gaining ownership",async()=>{
  const e=await environment(),t=e.addTab(),root=e.addGroup('Youtube'),manual=e.addGroup('Research',root);
  manual.addTabs([t]);e.h.creatorMap().set('0:video',{key:CHANNEL,label:'Channel'});
  e.h.iconMap().set('0:'+CHANNEL,{d:ICON,s:'round'});
  await e.h.route(t,'legacy');assert.equal(t.group,manual);
  assert.equal(manual.hasAttribute('data-zzrouter-subject'),false);
  assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
});

test("pre-1.35 YouTube and Nexus folders recover pictures from verified members without gaining ownership",async()=>{
  for(const [url,label,key,shape] of [
    ['https://www.youtube.com/watch?v=video','Channel',CHANNEL,'round'],
    [CHANNEL+'/videos','Channel',CHANNEL,'round'],
    ['https://music.youtube.com/watch?v=video','Channel',CHANNEL,'round'],
    ['https://www.nexusmods.com/baldursgate3/mods/1','Baldursgate 3',GAME,'square'],
    [GAME+'/mods/1',"Baldur's Gate 3",GAME,'square'],
  ]) {
    const e=await environment({'zzrouter.enabled':false,'zzrouter.media-subgroups':false});
    const t=e.addTab(url),root=e.addGroup(key===GAME?'Nexus':'Youtube'),g=e.addGroup(label,root);
    g.addTabs([t]);g.setAttribute('data-zzrouter-icon','data:image/webp;base64,Ag==');
    e.h.creatorMap().set('0:video',{key:CHANNEL,label:'Channel'});
    e.h.creatorMap().set('0:'+CHANNEL,{key:CHANNEL,label:'Channel'});
    e.h.creatorMap().set('0:'+GAME,{key:GAME,label:"Baldur's Gate 3"});
    e.h.iconMap().set('0:'+key,{d:ICON,s:shape});
    const before=e.moves;await e.h.route(t,'upgrade');
    assert.equal(g.getAttribute('data-zzrouter-icon'),ICON,url);
    assert.equal(g.getAttribute('data-zzrouter-icon-shape'),shape,url);
    assert.equal(g.hasAttribute('data-zzrouter-subject'),false);
    assert.equal(g.getAttribute('data-zzrouter-picture'),key);
    assert.equal(g.getAttribute('data-zzrouter-context'),'0');
    assert.equal(g.label,label);assert.equal(t.group,g);assert.equal(e.moves,before);
    assert.equal(root.hasAttribute('data-zzrouter-icon'),false);
    e.prefs.set('zzrouter.section-icons',false);e.h.stampIcons();
    assert.equal(g.hasAttribute('data-zzrouter-icon'),false);
    e.prefs.set('zzrouter.section-icons',true);e.h.stampIcons();
    assert.equal(g.getAttribute('data-zzrouter-icon'),ICON);
  }
});

test("legacy picture recovery refuses mixed subjects, unknown members, containers and manual names",async()=>{
  for(const mode of ['subject','unknown','container','manual']) {
    const e=await environment(),root=e.addGroup('Youtube'),g=e.addGroup(mode==='manual'?'Research':'Same',root);
    const a=e.addTab(),b=e.addTab(mode==='unknown'?'https://example.com/':'https://www.youtube.com/watch?v=other',mode==='container'?2:0);
    g.addTabs([a,b]);
    e.h.creatorMap().set('0:video',{key:CHANNEL,label:'Same'});
    e.h.creatorMap().set((mode==='container'?'2':'0')+':other',{key:mode==='subject'?'https://www.youtube.com/@other':CHANNEL,label:'Same'});
    e.h.iconMap().set('0:'+CHANNEL,{d:ICON,s:'round'});g.setAttribute('data-zzrouter-icon',ICON);
    e.h.stampIcons();assert.equal(g.hasAttribute('data-zzrouter-icon'),false,mode);
    assert.equal(g.hasAttribute('data-zzrouter-subject'),false,mode);
  }
});

test("metadata completion repairs a legacy folder even when its picture was already cached",async()=>{
  const e=await environment({'zzrouter.enabled':false}),t=e.addTab(),root=e.addGroup('Youtube'),g=e.addGroup('Channel',root);
  g.addTabs([t]);e.h.iconMap().set('0:'+CHANNEL,{d:ICON,s:'round'});
  await e.h.route(t,'before metadata');assert.equal(g.hasAttribute('data-zzrouter-icon'),false);
  e.answer(JSON.stringify({author_name:'Channel',author_url:CHANNEL}));
  await e.h.route(t,'metadata');assert.equal(g.getAttribute('data-zzrouter-icon'),ICON);
  assert.equal(e.requests.length,2,'one oEmbed request plus one channel identity lookup');
  const id='https://www.youtube.com/channel/UCVerified';
  e.answer(`<meta property="og:url" content="${id}"><meta property="og:title" content="Channel - YouTube">`);
  await e.h.route(t,'canonical');
  assert.equal(e.requests.length,2,'canonical identity reuses cached picture');
  assert.equal(g.getAttribute('data-zzrouter-icon'),ICON);assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);assert.equal(t.group,g);
});

test("pre-update label caches refetch verified YouTube and Nexus pictures without reusing ambiguous bytes",async()=>{
  for(const nexus of [false,true]) {
    const label=nexus?'Baldursgate 3':'Channel',key=nexus?GAME:CHANNEL;
    const e=await environment({'zzrouter.enabled':false,
      'zzrouter.creators':JSON.stringify({video:'Channel'}),
      'zzrouter.avatars':JSON.stringify({[label.toLowerCase()]:{d:'data:image/webp;base64,Ag==',s:'round'}})});
    const t=e.addTab(nexus?GAME:undefined),root=e.addGroup(nexus?'Nexus':'Youtube'),g=e.addGroup(label,root);
    g.addTabs([t]);const before=e.moves;await e.h.route(t,'old caches');
    assert.equal(e.h.iconMap().has(label.toLowerCase()),false);
    assert.equal(g.hasAttribute('data-zzrouter-icon'),false);
    if(!nexus) {
      e.answer(JSON.stringify({author_name:label,author_url:key}));await e.h.route(t,'verified channel');
    }
    assert.equal(e.requests.at(-1).url,key);
    e.answer(nexus?gameMetadata():`<meta property="og:url" content="${key}"><meta property="og:title" content="Channel - YouTube"><meta property="og:image" content="https://example.com/verified.png">`);
    if(!nexus)await e.h.route(t,'channel metadata');
    e.answer('image bytes');await tick();
    assert.equal(g.getAttribute('data-zzrouter-icon'),ICON);
    assert.equal(t.getAttribute('data-zzrouter-tab-icon'),ICON);
    assert.equal(g.getAttribute('data-zzrouter-picture'),key);
    assert.equal(g.hasAttribute('data-zzrouter-subject'),false);
    assert.equal(e.moves,before);assert.equal(t.group,g);assert.equal(g.label,label);
  }
});

test("Music rejects opaque-ID metadata labels and profile filters retain newly resolved game",async()=>{
  const e=await environment(),key='https://music.youtube.com/browse/MPREopaque',t=e.addTab(key);
  e.h.musicPage(t,true);e.answer(`<meta property="og:url" content="${key}"><meta property="og:title" content="MPREopaque">`);
  assert.equal(e.h.musicPage(t,false),null);
  e.navigate(t,GAME);e.h.captureNexus(t);
  const other='https://www.nexusmods.com/games/skyrimspecialedition';
  e.h.creatorMap().set('0:'+other,{key:other,label:'Skyrim Special Edition',gameId:'1704'});
  e.navigate(t,AUTHOR+'?gameId=1704');e.h.captureNexus(t);
  e.navigate(t,AUTHOR+'/about-me');e.h.captureNexus(t);
  assert.equal(e.h.nexusGame(t,false).key,other);
});

test("Music browse pages accept their verified canonical playlist identity",async()=>{
  const e=await environment(),browse='https://music.youtube.com/browse/MPREb_sduEupSYKJS';
  const playlist='https://music.youtube.com/playlist?list=OLAK5uy_kMPKRWKxFaMc_HSE4aYwMUTdfa-kBp5bo',t=e.addTab(browse);
  e.h.musicPage(t,true);
  e.answer(`<meta property="og:url" content="${playlist}"><meta property="og:title" content="Ciao ciao Lulù (Compilation estate 1999)">`);
  assert.equal(e.h.musicPage(t,false).key,playlist);
  assert.equal(e.h.musicPage(t,false).label,'Ciao ciao Lulù (Compilation estate 1999)');
  e.navigate(t,playlist);assert.equal(e.h.musicPage(t,true).key,playlist);assert.equal(e.requests.length,1);
});

test('Targeted refresh retains a verified picture on failure and leaves unrelated subjects intact',async()=>{
  const e=await environment(),tab=e.addTab(CHANNEL);e.h.iconMap().set('0:'+CHANNEL,{d:ICON,s:'round'});e.h.iconMap().set('0:'+GAME,{d:ICON,s:'square'});
  e.h.updatePicture(tab,false);e.h.fetchSectionIcon(CHANNEL,CHANNEL,0,'round',true);
  assert.equal(e.requests.length,1);assert.equal(e.h.refreshSubject(tab),null,'in-flight target absent');
  e.answer('no image');assert.equal(e.h.iconMap().get('0:'+CHANNEL).d,ICON);assert.equal(tab.getAttribute('data-zzrouter-tab-icon'),ICON);
  assert.equal(e.h.iconMap().get('0:'+GAME).d,ICON);assert.equal(e.h.refreshSubject(tab),null,'backoff respected');
  e.advance(11*60*1000);assert.equal(e.h.refreshSubject(tab).key,CHANNEL);
  tab.zenStaticIcon='manual';assert.equal(e.h.refreshSubject(tab),null);delete tab.zenStaticIcon;
  e.prefs.set('zzrouter.section-icons',false);assert.equal(e.h.refreshSubject(tab),null);e.prefs.set('zzrouter.section-icons',true);
  e.makePrivate();assert.equal(e.h.refreshSubject(tab),null);
});
