import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {test} from "node:test";
const read=p=>readFile(new URL(p,import.meta.url),"utf8");
const source=await read("./sine-update-recovery.js"), guard=await read("../download-prompt/sine-update-guard.sys.mjs");
async function run({stale=false,held=false,timeout=false,active=true}={}) {
  let copied, reads=0, checks=0, zipped=false;
  const secret="/private-identifying-path",w={crypto:webcrypto};
  const manager={__zenPersonalModsUpdateGuardV1:active,updateMods(source){
    assert.equal(source,"manual");checks++;return timeout?new Promise(()=>{}):Promise.reject(Error(secret));
  }};
  const registry={"zz-download-prompt":{enabled:true,"no-updates":held,scripts:{"sine-update-guard.sys.mjs":{}}},
    "private-mod":{enabled:true,scripts:{"sine-update-guard.sys.mjs":{}}}};
  const utils={getMods:async()=>{reads++;return registry;},getModFolder:id=>{assert.equal(id,"zz-download-prompt");return secret;}};
  const clock={setTimeout(fn){if(timeout)queueMicrotask(fn);return 1;},clearTimeout(){}};
  const context=vm.createContext({TextEncoder,Services:{wm:{getMostRecentWindow:()=>w},uuid:{generateUUID:()=>"{fixture}"}},
    ChromeUtils:{importESModule:p=>p.includes("Timer")?clock:{default:p.includes("manager")?manager:utils}},
    PathUtils:{tempDir:secret,join:(...s)=>s.join("/")},IOUtils:{readUTF8:async()=>stale?"old":guard.replaceAll("\n","\r\n"),makeDirectory:async()=>{},writeJSON:async()=>{}},
    Ci:{},Cc:new Proxy({},{get:(_t,k)=>({getService:()=>({copyString:s=>copied=s}),createInstance:()=>k.includes("zipwriter")?
      {open(){},addEntryFile(name){assert.equal(name,"report.json");},close(){zipped=true;}}:{initWithPath(){}}})}),console:{info(){}}});
  const result=await vm.runInContext(source,context);
  assert.ok(zipped);assert.deepEqual(JSON.parse(copied),JSON.parse(JSON.stringify(result)));
  assert.ok(!copied.includes(secret)&&!copied.includes("private-mod"));assert.equal(w.__zzSineUpdateRecovery,undefined);
  return {result,reads,checks};
}
test("older guard: a rejected batch can still have safely delivered every replacement",async()=>{
  const {result}=await run();assert.equal(result.check,"rejected");assert.equal(result.readyToRestart,true);
  const held=(await run({stale:true,held:true})).result;assert.equal(held.readyToRestart,false);assert.equal(held.heldBack,1);
});
test("recovery deadline never interrupts or inspects a pending update, and unguarded updates never start",async()=>{
  const pending=await run({timeout:true});assert.equal(pending.result.check,"still-running");assert.equal(pending.reads,0);assert.equal(pending.result.readyToRestart,false);
  const absent=await run({active:false});assert.equal(absent.result.check,"no-active-guard");assert.equal(absent.checks,0);
});
