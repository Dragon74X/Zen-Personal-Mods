import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const CHANNEL = "https://www.youtube.com/@channel";
const GAME = "https://www.nexusmods.com/games/baldursgate3";
const AUTHOR = "https://www.nexusmods.com/profile/wesslen";
const ICON = "data:image/webp;base64,AQ==";
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
  const names = "fetchCreator,fetchSectionIcon,stampIcons,route,iconMap,creatorMap,updatePicture,pictureSubject,refreshPictures,chainOf,startsWithPath,findChild,targetPath,file,captureNexus,nexusGame,nexusURLFrom,musicPage,partLabel,onTabEvent,prefObserver,inFlight,saveNexus,savedNexus,cancelLookups,forgetAll".split(",");
  source = source.replace("  // ---- declared defaults", `globalThis.harness = {${names.map(n=>`${n}:typeof ${n} === 'undefined' ? null : ${n}`).join(',')}, observeQueues: cb => queueRoute=cb}; return;\n  // ---- declared defaults`);
  const window = { Groupflow: { refresh: defer => refreshes.push(defer) },
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
      ? { NetUtil } : { PrivateBrowsingUtils: { isWindowPrivate:()=>privateWindow } } },
    Ci: { nsILoadInfo:{}, nsIContentPolicy:{}, nsIRequest:{} },
    Cc: { "@mozilla.org/io/string-input-stream;1": { createInstance:()=>({}) } },
    Components: { isSuccessCode:status=>status===0 },
    Date: { now:()=>now }, setTimeout:fn=>{timers.set(++serial,fn);return serial;}, clearTimeout:id=>timers.delete(id),
    URLSearchParams, Blob, Uint8Array, CustomEvent: class { constructor(type, options) { Object.assign(this, {type}, options); } },
    createImageBitmap:async()=>({width:64,height:64,close(){}}),
    OffscreenCanvas:class { getContext(){return{drawImage(){}};} async convertToBlob(){return{arrayBuffer:async()=>new Uint8Array([1]).buffer};} },
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
  assert.equal(e.requests.length,1);assert.equal(t.group,g);
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
    e.answer('<meta property="og:image" content="https://example.com/verified.png">');e.answer('image bytes');await tick();
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
