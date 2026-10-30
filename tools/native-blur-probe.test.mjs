import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('./native-blur-probe.js',import.meta.url),'utf8');
const guide=await readFile(new URL('./NATIVE-BLUR-PROBE.md',import.meta.url),'utf8');
const loader=guide.match(/```js\n([\s\S]*?)\n```/)[1];

for(const failure of [null,'fetch','http','write','compile','run','remove'])test('Documented blur loader: '+(failure||'success'),async()=>{
  const files=new Map(),trace=[];
  let copied,signal;
  const payload='/* unchanged fetched script */',path='/tmp/zen-native-blur-probe-unique.js';
  const w={AbortSignal:{timeout:ms=>signal={ms}},fetch:async(url,options)=>{
    assert.match(url,/\/[0-9a-f]{40}\/tools\/native-blur-probe\.js$/);
    assert.equal(options.signal,signal);assert.equal(signal.ms,15000);
    if(failure==='fetch')throw Error('network fixture');
    return {ok:failure!=='http',status:503,text:async()=>payload};
  }};
  const file={path,append(name){assert.equal(name,'zen-native-blur-probe.js');},createUnique(type,mode){
    assert.equal(type,0);assert.equal(mode,0o600);files.set(path,'');trace.push('create');
  }};
  const Services={wm:{getMostRecentWindow:()=>w},dirsvc:{get:()=>file},io:{newFileURI:f=>({spec:'file://'+f.path})},
    scriptloader:{loadSubScriptWithOptions(url,options){
      assert.equal(url,'file://'+path);assert.equal(options.target,w);
      assert.equal(options.allowUnsafeURL,true);assert.equal(options.ignoreCache,true);assert.equal(options.wantReturnValue,true);
      assert.equal(files.get(path),payload);trace.push('load');
      if(failure==='compile')throw SyntaxError('compile fixture');
      return Promise.resolve().then(()=>{
        assert.ok(files.has(path));trace.push('finished');
        if(failure==='run')throw Error('run fixture');
        return 'probe result';
      });
    }}};
  const ctx=vm.createContext({Services,Ci:{nsIFile:{NORMAL_FILE_TYPE:0}},
    Cc:{'@mozilla.org/widget/clipboardhelper;1':{getService:()=>({copyString:text=>copied=JSON.parse(text)})}},
    IOUtils:{writeUTF8:async(p,text)=>{if(failure==='write')throw Error('write fixture');files.set(p,text);},
      remove:async p=>{trace.push('remove');if(failure==='remove')throw Error('remove fixture');files.delete(p);}},
    console:{error(){}}});
  const result=await vm.runInContext(loader,ctx);
  assert.equal(files.size,failure==='remove'?1:0);
  if(failure){assert.equal(copied.probe,'native-blur-loader');assert.equal(copied.errors.length,1);}
  else {assert.equal(result,'probe result');assert.equal(copied,undefined);assert.deepEqual(trace,['create','load','finished','remove']);}
  if(['fetch','http'].includes(failure))assert.deepEqual(trace,[],'failed download never creates or executes a file');
});

async function run({failAt=0,cancelAt=0,closeAt=0,platform='WINNT',cleanupFailure=false,fatalWorker=false,badReply=false,readFailure=false}={}) {
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
    setTimeout(){throw Error('Window timers cannot guarantee cleanup after close');},
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
  const IOUtils={makeDirectory:async()=>{},writeUTF8:async(path,text,options)=>{
    assert.equal(files.has(path),false,'Messages must never overwrite a reader-held file');
    files.set(path,text);
    if(/\/request-\d{2}\.json$/.test(path)) {
      const req=JSON.parse(text);
      assert.equal(path.split('/').at(-1),'request-'+String(req.id).padStart(2,'0')+'.json');
      assert.equal(options.tmpPath,path.replace(/\.json$/,'.tmp'));
      response={id:badReply?999:req.id,error:req.id===failAt?'capture refused':null,files:[{name:'fixture.png'}]};
      if(fatalWorker){workerRunning=false;response=undefined;}
      if(req.id===cancelAt)void window.__zzNativeBlurProbe.stop('test cancellation');
      if(req.id===closeAt){window.closed=true;events.get('unload')();assert.deepEqual(prefs,initial,'global prefs restore synchronously on window close');}
    }
  },readJSON:async path=>{
      if(fatalWorker&&path.endsWith('fatal.json'))return {error:'worker fixture failure',failure:{stage:'initialize',id:'fixture',line:4}};
      assert.match(path,/\/response-\d{2}\.json$/);
      if(readFailure)throw Object.assign(Error('unreadable response fixture'),{name:'NotAllowedError'});
      if(!response)throw Object.assign(Error('not published'),{name:'NotFoundError'});
      if(!badReply)assert.equal(path.split('/').at(-1),'response-'+String(response.id).padStart(2,'0')+'.json');
      return response;
    },
    writeJSON:async(p,j)=>files.set(p,JSON.stringify(j)),getChildren:async()=>[]};
  window.getComputedStyle=node=>({backdropFilter:'none',filter:'none'});
  const clock={setTimeout(fn,ms){if(ms<10000)queueMicrotask(fn);return ++timer;},clearTimeout(){}};
  const ctx=vm.createContext({Services,Cc,Ci:{},ChromeUtils:{importESModule:()=>clock},PathUtils:{tempDir:'/tmp',join:(...a)=>a.join('/'),filename:p=>p.split('/').at(-1)},IOUtils,
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
  assert.equal([...e.files.keys()].filter(p=>/\/request-\d{2}\.json$/.test(p)).length,32);
});
for(const options of [{failAt:3},{cancelAt:2},{closeAt:2},{platform:'Linux'},{cleanupFailure:true},{fatalWorker:true},{badReply:true},{readFailure:true}])test('Blur probe failure/cancel cleanup '+JSON.stringify(options),async()=>{
  const e=await run(options);
  assert.deepEqual(e.prefs,e.initial);assert.equal(e.registered.size,0);assert.equal(e.root.attrs.size,0);assert.equal(e.events.size,0);
  if(!options.cleanupFailure)assert.ok(e.report.finished!=='completed');assert.ok(e.report.errors.length);
  assert.ok(e.copied);assert.equal(e.window.__zzNativeBlurProbe,undefined);
  if(options.platform)assert.equal(e.files.size,0,'unsupported platform never starts screen capture');
  if(options.fatalWorker){assert.equal(e.report.workerFailure.failure.stage,'initialize');assert.equal(JSON.parse(e.copied).workerFailure.failure.line,4);}
  if(options.badReply)assert.match(e.report.errors[0],/response id mismatch/);
  if(options.readFailure)assert.match(e.report.errors[0],/unreadable response fixture/);
});
