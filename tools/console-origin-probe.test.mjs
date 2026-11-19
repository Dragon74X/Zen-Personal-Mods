import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('./console-origin-probe.js',import.meta.url),'utf8');
for(const closed of [false,true])test('Console origin probe auto-collects, bounds, redacts and cleans up; close='+closed,async()=>{
  let listener,copied,finish;const events=new Map();
  const w={addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
  const error=(message='NS_ERROR_NOT_AVAILABLE',sourceName='chrome://sine/content/zz-groupflow/groupflow.uc.js')=>({QueryInterface(){return this;},flags:0,errorMessage:message,sourceName,lineNumber:123,stack:'frame@resource://example.sys.mjs:22'});
  const context=vm.createContext({Services:{wm:{getMostRecentWindow:()=>w},appinfo:{version:'fixture'},console:{
    registerListener:l=>listener=l,unregisterListener:l=>{assert.equal(l,listener);listener=null;},getMessageArray:()=>[error()] }},
    ChromeUtils:{importESModule:()=>({setTimeout(fn,ms){assert.equal(ms,60000);finish=fn;return 1;},clearTimeout:id=>assert.equal(id,1)})},
    Ci:{nsIScriptError:{warningFlag:1}},Cc:{'@mozilla.org/widget/clipboardhelper;1':{getService:()=>({copyString:text=>copied=JSON.parse(text)})}}});
  const task=vm.runInContext(source,context);
  listener.observe(error());
  listener.observe(error('secret content','https://private.invalid/page'));
  listener.observe(error('failed https://private.invalid/path at C:\\Users\\private-name\\file.js'));
  events.get('unhandledrejection')({reason:{message:'promise fixture',stack:'function@chrome://sine/content/zz-mediaflow/mediaflow.uc.js:20'}});
  for(let i=0;i<110;i++)listener.observe(error('fixture-'+i));
  if(closed)events.get('unload')();else finish();
  const result=await task;
  assert.equal(result.entries.length,100);assert.equal(result.dropped,13);
  assert.equal(result.entries[0].count,2);assert.equal(result.entries[0].line,123);
  assert.equal(result.entries[1].message,'failed <web-url> at <local-path>');
  assert.equal(result.entries[2].kind,'promise');
  assert.doesNotMatch(JSON.stringify(copied),/private.invalid|private-name|secret content/);
  assert.equal(listener,null);assert.equal(events.size,0);assert.equal(w.__zzConsoleOriginProbe,undefined);
  assert.equal(result.finished,closed?'window closed':'completed');
});
