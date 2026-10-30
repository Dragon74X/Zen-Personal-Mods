import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('./native-blur-probe.js',import.meta.url),'utf8');

async function run({failAt=0,cancelAt=0,platform='WINNT',cleanupFailure=false}={}) {
  const prefs=new Map([['zen.theme.acrylic-sidebar',true],['zen.theme.acrylic-urlbar',false],['zzglass.sidebar.blur-transparent-pages',true]]);
  const initial=new Map(prefs), files=new Map(), registered=new Set(), events=new Map(), trace=[];
  const element=()=>{const attrs=new Map();return{style:{},isConnected:true,attrs,
    getAttribute:k=>attrs.has(k)?attrs.get(k):null,setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),
    appendChild(){},addEventListener(){},remove(){this.isConnected=false;}};};
  const root=element(),panel=element(),toolbox=element(),box=element(),userTab=element();
  panel.getBoundingClientRect=()=>prefs.get('zen.tabs.vertical.right-side')?{left:800,top:0,right:1000,bottom:800}:{left:0,top:0,right:200,bottom:800};
  let timer=0,workerRunning=false,copied,response,fixture;
  const doc={documentElement:root,title:'User page',getElementById:id=>({'zen-toolbar-background':panel,'navigator-toolbox':toolbox,'tabbrowser-tabbox':box}[id]),createElementNS:()=>element()};
  const browser={selectedTab:userTab,selectedBrowser:{getBoundingClientRect:()=>({left:0,top:80,right:1000,bottom:800})},
    addTab(url){doc.title=decodeURIComponent(url).match(/<title>([^<]+)/)[1];fixture=element();return fixture;},
    removeTab(tab){trace.push('restore tab');tab.isConnected=false;}};
  const window={document:doc,gBrowser:browser,innerWidth:1000,innerHeight:800,devicePixelRatio:1,
    setTimeout(fn,ms){if(ms<10000)queueMicrotask(fn);return ++timer;},clearTimeout(){},
    addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k),focus(){},
    matchMedia:()=>({matches:!!prefs.get('ui.prefersReducedTransparency')}),fetch:async()=>({json:async()=>({version:'test'})})};
  const worker={get isRunning(){return workerRunning;},init(){},runwAsync(){workerRunning=true;trace.push('worker start');},kill(){workerRunning=false;trace.push('worker stopped');}};
  const Services={wm:{getMostRecentWindow:()=>window},appinfo:{OS:platform,version:'1.24b',processID:123},
    prefs:{prefHasUserValue:k=>prefs.has(k),clearUserPref:k=>prefs.delete(k)},io:{newURI:s=>s},
    scriptSecurityManager:{getSystemPrincipal:()=>({})},dirsvc:{get:()=>({path:'C:/Windows'})}};
  for(const type of ['Bool','Int','String']){
    Services.prefs['get'+type+'Pref']=(k,d)=>prefs.has(k)?prefs.get(k):d;
    Services.prefs['set'+type+'Pref']=(k,v)=>prefs.set(k,v);
  }
  const sheet={USER_SHEET:1,loadAndRegisterSheet:uri=>registered.add(uri),sheetRegistered:uri=>registered.has(uri),unregisterSheet(uri){
    trace.push('unmask');registered.delete(uri);if(cleanupFailure && registered.size===0)throw Error('sheet cleanup fixture');}};
  const gfx={adapterDescription:'fixture',getFeatures:()=>({}),getMonitors:()=>[]};
  const zip={open(){trace.push('zip');},addEntryFile(){},close(){}};
  const Cc=new Proxy({}, {get:(_t,k)=>({getService:()=>k.includes('style-sheet')?sheet:k.includes('clipboard')?{copyString:s=>copied=s}:gfx,
    createInstance:()=>k.includes('process')?worker:k.includes('zipwriter')?zip:{initWithPath(){}}})});
  const IOUtils={makeDirectory:async()=>{},writeUTF8:async(path,text)=>{
    files.set(path,text);
    if(path.endsWith('request.json')) {
      const req=JSON.parse(text);
      response={id:req.id,error:req.id===failAt?'capture refused':null,files:[{name:'fixture.png'}]};
      if(req.id===cancelAt)void window.__zzNativeBlurProbe.stop('test cancellation');
    }
  },readJSON:async()=>response,writeJSON:async(p,j)=>files.set(p,JSON.stringify(j)),getChildren:async()=>[]};
  window.getComputedStyle=node=>({backdropFilter:'none',filter:'none'});
  const ctx=vm.createContext({Services,Cc,Ci:{},PathUtils:{tempDir:'/tmp',join:(...a)=>a.join('/'),filename:p=>p.split('/').at(-1)},IOUtils,
    console:{log(){}},getComputedStyle:window.getComputedStyle});
  const report=await vm.runInContext(source,ctx);
  return {report,prefs,initial,registered,trace,copied,events,window,root,fixture,files};
}

test('Blur probe automatically completes 32 cases and restores state before copying',async()=>{
  const e=await run();
  assert.equal(e.report.cases.length,32);
  assert.equal(e.report.errors.length,0);
  assert.equal(e.report.finished,'completed');
  assert.deepEqual(e.prefs,e.initial);
  assert.equal(e.registered.size,0);assert.equal(e.events.size,0);assert.equal(e.root.attrs.size,0);
  assert.ok(e.trace.indexOf('worker stopped')<e.trace.lastIndexOf('unmask'));
  assert.ok(e.trace.indexOf('worker stopped')<e.trace.indexOf('restore tab'));
  assert.equal(JSON.parse(e.copied).cases.length,32);
  assert.equal(e.window.__zzNativeBlurProbe,undefined);
});
for(const options of [{failAt:3},{cancelAt:2},{platform:'Linux'},{cleanupFailure:true}])test('Blur probe failure/cancel cleanup '+JSON.stringify(options),async()=>{
  const e=await run(options);
  assert.deepEqual(e.prefs,e.initial);assert.equal(e.registered.size,0);assert.equal(e.root.attrs.size,0);assert.equal(e.events.size,0);
  if(!options.cleanupFailure)assert.ok(e.report.finished!=='completed');assert.ok(e.report.errors.length);
  assert.ok(e.copied);assert.equal(e.window.__zzNativeBlurProbe,undefined);
  if(options.platform)assert.equal(e.files.size,0,'unsupported platform never starts screen capture');
});
