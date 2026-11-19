// Paste the complete expression into Zen's Browser Console. Auto-copies after 60s.
(() => {
  const w=Services.wm.getMostRecentWindow('navigator:browser');
  if(!w)throw Error('No browser window');
  w.__zzConsoleOriginProbe?.stop('replaced');
  const clock=ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const report={probe:'console-origin-v1',browser:Services.appinfo.version,entries:[],dropped:0,
    limitations:'At most 100 distinct chrome exceptions, recent console buffer plus 60 seconds. Web sources excluded; URL/path text redacted. Missing native stacks cannot be reconstructed.'};
  const scrub=(value,limit=2000)=>String(value??'')
    .replace(/\b(?:https?|ftp):\/\/[^\s"'<>)]*/gi,'<web-url>')
    .replace(/\b(?:file:\/\/\/|[a-z]:\\)[^\r\n]*/gi,'<local-path>')
    .replace(/(^|\s)\/(?:home|Users|tmp|workspace)\/[^\r\n]*/g,'$1<local-path>').slice(0,limit);
  let done=false,timer,resolve;
  const promise=new Promise(r=>{resolve=r;});
  const record=(kind,message,source,line,stack,recent=false)=>{
    if(done || /^(?:https?|file|data|blob):/i.test(source||''))return;
    const item={kind,message:scrub(message),source:scrub(source),line:Number(line)||0,stack:scrub(stack,6000),recent};
    const old=report.entries.find(e=>e.kind===item.kind&&e.message===item.message&&e.source===item.source&&e.line===item.line&&e.stack===item.stack);
    if(old){old.count++;return;}
    if(report.entries.length===100){report.dropped++;return;}
    report.entries.push({...item,count:1});
  };
  const read=(message,recent=false)=>{
    try {
      const error=message.QueryInterface(Ci.nsIScriptError);
      if(error.flags & Ci.nsIScriptError.warningFlag)return;
      record('console',error.errorMessage,error.sourceName,error.lineNumber,error.stack,recent);
    } catch {}
  };
  const listener={observe:message=>read(message)};
  const onError=e=>record('window',e.message,e.filename,e.lineno,e.error?.stack);
  const onRejection=e=>record('promise',e.reason?.message??e.reason,'',0,e.reason?.stack);
  const onClose=()=>finish('window closed');
  function finish(reason='completed') {
    if(done)return report;
    done=true;clock.clearTimeout(timer);
    Services.console.unregisterListener(listener);
    w.removeEventListener('error',onError);w.removeEventListener('unhandledrejection',onRejection);w.removeEventListener('unload',onClose);
    if(w.__zzConsoleOriginProbe===api)delete w.__zzConsoleOriginProbe;
    report.finished=reason;
    Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(JSON.stringify(report,null,2));
    resolve(report);return report;
  }
  const api={stop:finish};w.__zzConsoleOriginProbe=api;
  Services.console.registerListener(listener);
  w.addEventListener('error',onError);w.addEventListener('unhandledrejection',onRejection);w.addEventListener('unload',onClose,{once:true});
  for(const message of (Services.console.getMessageArray()||[]).slice(-100))read(message,true);
  timer=clock.setTimeout(()=>finish(),60000);
  return promise;
})();
