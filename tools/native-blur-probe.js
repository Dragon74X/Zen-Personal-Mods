// Paste the complete IIFE into Zen's Browser Console. Starts automatically.
// Windows desktop pixels only: no drawSnapshot/Marionette blur claims.
(async () => {
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  if (!w) throw Error('No browser window');
  await w.__zzNativeBlurProbe?.stop?.('replaced');
  const report = { probe: 'native-blur-v4', started: new Date().toISOString(),
    browser: Services.appinfo.version, platform: Services.appinfo.OS, cases: [], errors: [],
    limitations: 'Generated fixture only. Desktop GDI crops test presented pixels, not animation FPS. Native acrylic must be enabled before browser startup; its renderer startup latch is not observable here. Compare native-only against installed output, including transparent pages. A computed filter alone is not visual proof.' };
  const P = Services.prefs, doc = w.document, root = doc.documentElement;
  // Window timers are canceled on close, which would strand global test prefs.
  const clock = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const wait = ms => new Promise(resolve => clock.setTimeout(resolve, ms));
  const read = fn => { try { return fn(); } catch (e) { return { error: String(e) }; } };
  const saved = new Map(), attributes = [], fixtures = new Set(), temporary = [];
  const addFixture = tab => { fixtures.add(tab); return tab; };
  let stopped = '', task, worker, directory, fixture, originalTab, status, deadline, restoreLibrary;
  let phaseSheet = null, maskSheet = null;
  const ss = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
  const setPref = (key, value) => {
    const type = typeof value, method = type === 'boolean' ? 'Bool' : type === 'number' ? 'Int' : 'String';
    if (!saved.has(key)) saved.set(key, { method, had: P.prefHasUserValue(key), value: P['get'+method+'Pref'](key, value) });
    P['set'+method+'Pref'](key, value);
  };
  const restorePref = key => {
    const prev = saved.get(key);
    if (prev) { if (prev.had) P['set'+prev.method+'Pref'](key, prev.value); else P.clearUserPref(key); }
  };
  const attr = (node, key, value) => {
    attributes.push([node, key, node.getAttribute(key)]);
    node.setAttribute(key, value);
  };
  const sheet = css => {
    const uri = Services.io.newURI('data:text/css,' + encodeURIComponent(css));
    ss.loadAndRegisterSheet(uri, ss.USER_SHEET); return uri;
  };
  const unSheet = uri => { if (uri && ss.sheetRegistered(uri, ss.USER_SHEET)) ss.unregisterSheet(uri, ss.USER_SHEET); };
  const abort = reason => { stopped ||= reason; };
  const guard = () => { if (stopped || w.closed) throw Error(stopped || 'window closed'); };
  const onSelect = () => { if (fixture && !fixtures.has(w.gBrowser.selectedTab)) abort('selected tab changed'); };
  const onUnload = () => {
    abort('window closed');
    try { if(worker?.isRunning)worker.kill(); } catch {}
    // Restore global prefs synchronously, even if this is the final window.
    for(const [key] of saved)try { restorePref(key); } catch(e) { report.errors.push('Unload: '+String(e)); }
  };
  const localFile = path => { const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); file.initWithPath(path); return file; };
  const readMessage = path => IOUtils.readJSON(path).catch(error => {
    if(error.name==='NotFoundError')return null;
    throw error;
  });
  const api = { stop: async reason => { abort(reason || 'stopped by user'); await task; } };
  w.__zzNativeBlurProbe = api;

  // A bounded, local Windows worker. It captures only requested fixture crops,
  // refuses a different/occluded window, and never accesses browser/profile data.
  const capturePS = String.raw`param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$stage = 'initialize'
try {
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BlurWindow {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L,T,R,B; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; public Point(int x,int y){X=x;Y=y;} }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr w,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr w,out Rect r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr w,ref Point p);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr w,uint f);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
}
'@
$null = [BlurWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
$utf8 = New-Object System.Text.UTF8Encoding($false)
$end = [DateTime]::UtcNow.AddSeconds(260)
$nextId = 1
while ([DateTime]::UtcNow -lt $end -and !(Test-Path (Join-Path $Directory 'stop'))) {
 # Publish each message once. Windows readers can hold a file against replacement.
 $requestPath = Join-Path $Directory ('request-{0:D2}.json' -f $nextId)
 $responsePath = Join-Path $Directory ('response-{0:D2}.json' -f $nextId)
 if (!(Test-Path $requestPath)) { Start-Sleep -Milliseconds 50; continue }
 $stage = 'read-request'
 $q = Get-Content -Raw -Encoding UTF8 -LiteralPath $requestPath | ConvertFrom-Json
 if ($q.id -ne $nextId) { throw 'Capture request id mismatch' }
 $answer = @{id=$q.id;files=@();error=$null}
 try {
  $frames = if ($null -ne $q.frames) { [int]$q.frames } else { 1 }
  if ($frames -lt 1 -or $frames -gt 64) { throw 'Invalid frame count' }
  if ($frames -gt 1) {
   $stage = 'sequence-ready'
   $ready = Join-Path $Directory ('ready-{0:D2}.json' -f $nextId)
   [IO.File]::WriteAllText(($ready+'.tmp'),('{"id":'+$q.id+'}'),$utf8)
   [IO.File]::Move(($ready+'.tmp'),$ready)
   $go = Join-Path $Directory ('go-{0:D2}' -f $nextId)
   $waitEnd = [DateTime]::UtcNow.AddSeconds(8)
   while (!(Test-Path $go)) {
    if ((Test-Path (Join-Path $Directory 'stop')) -or [DateTime]::UtcNow -gt $waitEnd) { throw 'Sequence trigger cancelled or timed out' }
    Start-Sleep -Milliseconds 10
   }
  }
  $sequence = [Diagnostics.Stopwatch]::StartNew()
  for ($frame=0; $frame -lt $frames; $frame++) {
  if (Test-Path (Join-Path $Directory 'stop')) { throw 'Capture stopped' }
  $stage = 'verify-window'
  $handle = [BlurWindow]::GetForegroundWindow()
  [uint32]$owner = 0
  $null = [BlurWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
  $title = New-Object System.Text.StringBuilder(1024)
  $null = [BlurWindow]::GetWindowText($handle,$title,1024)
  if ($owner -ne $q.pid -or !$title.ToString().Contains($q.marker)) { throw 'Fixture browser is not the foreground window; capture refused' }
  $client = New-Object BlurWindow+Rect
  $origin = New-Object BlurWindow+Point(0,0)
  if (![BlurWindow]::GetClientRect($handle,[ref]$client) -or ![BlurWindow]::ClientToScreen($handle,[ref]$origin)) { throw 'Cannot resolve physical client coordinates' }
  $stage = 'coordinate-scale'
  $sx = ($client.R-$client.L)/[double]$q.width
  $sy = ($client.B-$client.T)/[double]$q.height
  if ([Math]::Abs($sx-$sy) -gt .03 -or $sx -lt .5 -or $sx -gt 4) { throw 'Client/CSS scale mismatch; capture refused' }
  foreach ($roi in $q.rois) {
   $stage = 'crop-geometry'
   $x=[int][Math]::Round($origin.X+$roi.x*$sx); $y=[int][Math]::Round($origin.Y+$roi.y*$sy)
   $cw=[int][Math]::Round($roi.width*$sx); $ch=[int][Math]::Round($roi.height*$sy)
   if ($cw -lt 8 -or $ch -lt 8 -or $cw -gt 1600 -or $ch -gt 1600) { throw 'Invalid crop size' }
   $stage = 'check-occlusion'
   # Typed points keep coordinate arithmetic out of comma-array expressions.
   foreach ($point in @(
    [BlurWindow+Point]::new($x, $y)
    [BlurWindow+Point]::new(($x+$cw-1), $y)
    [BlurWindow+Point]::new($x, ($y+$ch-1))
    [BlurWindow+Point]::new(($x+$cw-1), ($y+$ch-1))
    [BlurWindow+Point]::new(($x+[int]($cw/2)), ($y+[int]($ch/2)))
   )) {
    $hit=[BlurWindow]::GetAncestor([BlurWindow]::WindowFromPoint($point),2)
    if ($hit -ne $handle -and !($q.ownedPopup -and [BlurWindow]::GetAncestor($hit,3) -eq $handle)) { throw 'Fixture crop is occluded or outside its window; capture refused' }
   }
   $stage = 'capture-pixels'
   $bitmap=New-Object System.Drawing.Bitmap($cw,$ch)
   $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
   try {
    $graphics.CopyFromScreen($x,$y,0,0,$bitmap.Size,[System.Drawing.CopyPixelOperation]::SourceCopy)
    $name=if ($frames -eq 1) { '{0:D2}-{1}.png' -f [int]$q.id,[string]$roi.name } else { '{0:D2}-{1:D2}-{2}.png' -f [int]$q.id,$frame,[string]$roi.name }
    $bitmap.Save((Join-Path $Directory $name),[System.Drawing.Imaging.ImageFormat]::Png)
    $answer.files += @{name=$name;width=$cw;height=$ch;frame=$frame;elapsedMs=$sequence.ElapsedMilliseconds;utcMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
   } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
  $answer.scale=$sx
  if ($frame -lt $frames-1) { Start-Sleep -Milliseconds ([Math]::Max(25,[Math]::Min(250,[int]$q.intervalMs))) }
  }
 } catch {
  $answer.error=$_.Exception.Message
  $answer.failure=@{stage=$stage;id=$_.FullyQualifiedErrorId;line=$_.InvocationInfo.ScriptLineNumber}
 }
 $stage = 'write-response'
 $tmp=Join-Path $Directory ('response-{0:D2}.tmp' -f $nextId)
 [IO.File]::WriteAllText($tmp,($answer|ConvertTo-Json -Depth 8),$utf8)
 [IO.File]::Move($tmp,$responsePath)
 $nextId++
}
} catch {
 [IO.File]::WriteAllText((Join-Path $Directory 'fatal.json'),(@{error=$_.Exception.Message;failure=@{stage=$stage;id=$_.FullyQualifiedErrorId;line=$_.InvocationInfo.ScriptLineNumber}}|ConvertTo-Json))
 exit 1
}
`;
  const run = async () => {
    if (Services.appinfo.OS !== 'WINNT') throw Error('Desktop blur capture requires Windows; no screenshot substitute was used');
    report.nativePrefs = Object.fromEntries(['zen.theme.acrylic-sidebar','zen.theme.acrylic-urlbar','zzglass.sidebar.blur','zzglass.sidebar.blur-transparent-pages']
      .map(key => [key, P.getBoolPref(key, false)]));
    if (!report.nativePrefs['zen.theme.acrylic-sidebar'] && !report.nativePrefs['zen.theme.acrylic-urlbar'])
      throw Error('Enable native Zen acrylic, restart Zen, then rerun. Cross-slice support is set at renderer startup.');
    report.versions = {};
    for (const mod of ['glassflow','groupflow','iconflow','mediaflow']) {
      report.versions[mod] = await w.fetch('chrome://sine/content/zz-'+mod+'/theme.json').then(r=>r.json()).then(j=>j.version).catch(()=>null);
    }
    const gfx = Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo);
    const features = read(()=>gfx.getFeatures());
    report.graphics = {compositor:features?.compositor, webrender:features?.webrender?.status, dpr:w.devicePixelRatio};
    const library=doc.querySelector?.('zen-library');
    if(library?.constructor.isLibraryOpen) {
      const section=library.activeTab;
      restoreLibrary=()=>{if(!w.closed && library.isConnected)library.constructor.toggle(section);};
      library.constructor.close();
      for(let n=0;n<80 && library.openProgress>.001;n++){guard();await wait(50);}
      if(library.openProgress>.001)throw Error('Library did not close for the generated capture');
    }
    directory = PathUtils.join(PathUtils.tempDir, 'zen-native-blur-'+Date.now());
    await IOUtils.makeDirectory(directory);
    await IOUtils.writeUTF8(PathUtils.join(directory,'capture.ps1'), capturePS);
    const marker = 'ZZBLUR-'+Date.now();
    originalTab = w.gBrowser.selectedTab;
    fixture = w.gBrowser.addTab('data:text/html,'+encodeURIComponent('<!doctype html><title>'+marker+'</title><style>html,body{margin:0;background:transparent}body{position:fixed;inset:0;background:repeating-linear-gradient(90deg,#000 0 4px,transparent 4px 8px)}</style>'),
      { triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true });
    addFixture(fixture);
    w.gBrowser.selectedTab = fixture;
    w.addEventListener('TabSelect',onSelect); w.addEventListener('unload',onUnload,{once:true});
    attr(root,'zz-native-blur-test',marker);
    maskSheet = sheet(':root[zz-native-blur-test]{background:#c0d8ff!important;--zen-main-browser-background:#c0d8ff!important}' +
      ':root[zz-native-blur-test] zen-library,:root[zz-native-blur-test] menupopup:not(#zz-render-menu),:root[zz-native-blur-test] panel[type="arrow"]{visibility:hidden!important}' +
      ':root[zz-native-blur-test] #titlebar > :not(#zen-toolbar-background),:root[zz-native-blur-test] #zen-sidebar-pip-container,:root[zz-native-blur-test] #zen-media-controls-toolbar{visibility:hidden!important}' +
      ':root[zz-native-blur-test] #zen-toolbar-background::before,:root[zz-native-blur-test] #zen-toolbar-background::after{display:none!important}' +
      ':root[zz-native-blur-test] #tabbrowser-tabbox browser{background-color:transparent!important}' +
      ':root[zz-native-blur-test][zz-blur-page="opaque"] #tabbrowser-tabbox browser{background-color:#fff!important}');
    attr(root,'zz-blur-page','transparent');
    setPref('zen.view.compact',true); setPref('zen.view.compact.hide-tabbar',true);
    attr(root,'zen-compact-mode','true');
    attr(doc.getElementById('navigator-toolbox'),'zen-user-show','true');
    status = doc.createElementNS('http://www.w3.org/1999/xhtml','button');
    status.style.cssText = 'position:fixed;top:60px;left:45%;z-index:2147483647;background:Canvas;color:CanvasText;padding:12px;border:1px solid;';
    status.textContent = 'Blur capture starting… Stop + copy';
    status.addEventListener('click',()=>abort('stopped by user')); root.appendChild(status);
    w.focus();
    for (let n=0;n<100 && (fixture.hasAttribute('busy') || !doc.title.includes(marker));n++) { guard(); await wait(50); }
    guard();
    const shell = PathUtils.join(Services.dirsvc.get('WinD',Ci.nsIFile).path,'System32','WindowsPowerShell','v1.0','powershell.exe');
    worker = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess); worker.init(localFile(shell));
    const args = ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',PathUtils.join(directory,'capture.ps1'),'-Directory',directory];
    worker.runwAsync(args,args.length,null,false);
    let id = 0;
    const panel = doc.getElementById('zen-toolbar-background'), toolbox=doc.getElementById('navigator-toolbox');

    const snapshot = () => ({utcMs:Date.now(),panel:read(()=>{const r=panel.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),
      filter:w.getComputedStyle(panel).backdropFilter,pageFilter:w.getComputedStyle(doc.getElementById('tabbrowser-tabbox')).filter});
    const capture = async (entry,start=null) => {
      const {id,rois}=entry;
      const messageId=String(id).padStart(2,'0');
      const responsePath=PathUtils.join(directory,'response-'+messageId+'.json');
      await IOUtils.writeUTF8(PathUtils.join(directory,'request-'+messageId+'.json'),JSON.stringify({id,pid:Services.appinfo.processID,marker,width:w.innerWidth,height:w.innerHeight,rois,frames:start?16:1,intervalMs:40,ownedPopup:!!entry.ownedPopup}),{tmpPath:PathUtils.join(directory,'request-'+messageId+'.tmp')});
      if(start) {
        const readyPath=PathUtils.join(directory,'ready-'+messageId+'.json');
        for(let n=0;n<160;n++) {
          guard();
          const ready=await readMessage(readyPath);
          if(ready) { if(ready.id!==id)throw Error('Sequence readiness id mismatch'); break; }
          if(!worker.isRunning)throw Error('Capture worker exited before sequence readiness');
          if(n===159)throw Error('Sequence readiness timed out');
          await wait(50);
        }
        await IOUtils.writeUTF8(PathUtils.join(directory,'go-'+messageId),'go');
        await wait(60); guard();
        entry.triggeredUtcMs=Date.now();
        await start();
        entry.samples=[];
      }
      let response;
      for(let n=0;n<200;n++) {
        guard();
        if(start && entry.samples.length<100)entry.samples.push(snapshot());
        response=await readMessage(responsePath);
        if(response){if(response.id!==id)throw Error('Capture response id mismatch');break;}
        if(!worker.isRunning) {
          const fatal=await readMessage(PathUtils.join(directory,'fatal.json'));
          if(fatal)report.workerFailure=fatal;
          throw Error(fatal?.error || 'Windows capture worker exited before replying');
        }
        await wait(50);
      }
      if(response?.id!==id)throw Error('Windows capture timed out');
      entry.capture=response; entry.after=snapshot(); report.cases.push(entry);
      if(response.error)throw Error(response.error);
    };
    for (const right of [false,true]) for (const page of ['opaque','transparent']) for (const reduced of [false,true]) {
      setPref('zen.tabs.vertical.right-side',right); setPref('ui.prefersReducedTransparency',reduced?1:0);
      root.setAttribute('zz-blur-page',page);
      for (const variant of ['reference','installed','native-only','native-no-nudge']) {
        guard();
        status.textContent = `${++id}/32: ${right?'right':'left'}, ${page}, ${reduced?'reduced':'normal'}, ${variant} — Stop + copy`;
        // Release the prior variant before changing the single strip-filter owner.
        unSheet(phaseSheet); phaseSheet=null;
        if (variant==='installed') restorePref('zzglass.sidebar.blur-transparent-pages');
        else setPref('zzglass.sidebar.blur-transparent-pages',false);
        // Test-only priority must also beat Glassflow's [zzg-redraw] rule.
        const base=':root[zz-native-blur-test] #navigator-toolbox#navigator-toolbox #titlebar #zen-toolbar-background';
        if(variant==='reference') phaseSheet=sheet(base+'{backdrop-filter:none!important}');
        else if(variant==='native-no-nudge') phaseSheet=sheet(base+','+base.replace(' #titlebar','[zzg-redraw] #titlebar')+'{backdrop-filter:var(--zzg-acrylic-flat)!important}');
        toolbox.removeAttribute('zen-user-show'); await wait(100);
        toolbox.setAttribute('zen-user-show','true'); await wait(900);
        guard();
        const p=panel.getBoundingClientRect(), b=w.gBrowser.selectedBrowser.getBoundingClientRect();
        const x=Math.max(p.left,b.left)+24, y=Math.max(p.top,b.top)+140;
        const width=Math.min(p.right,b.right)-x-24, height=Math.min(180,Math.min(p.bottom,b.bottom)-y-24);
        if(width<32||height<32)throw Error('Sidebar does not overlap the generated page; no valid blur crop');
        const controlX=right?b.left+40:Math.max(b.left,p.right)+40;
        if(controlX+128>b.right)throw Error('Window too narrow for the outside control crop');
        const rois=[{name:'sidebar',x,y,width,height},{name:'control',x:controlX,y,width:128,height}];
        const entry={id,right,page,reduced,variant,rois,computed:{filter:w.getComputedStyle(panel).backdropFilter,
          pageFilter:w.getComputedStyle(doc.getElementById('tabbrowser-tabbox')).filter,
          reduced:w.matchMedia('(prefers-reduced-transparency: reduce)').matches}};
        if(variant==='reference' && entry.computed.filter!=='none')throw Error('No-blur reference was overridden');
        if(variant!=='installed' && entry.computed.pageFilter.includes('zzg-strip'))throw Error('Page-filter owner did not release for native comparison');
        await capture(entry);
      }
    }
    await followUp();
    async function followUp() {
      const showAttrs=['zen-has-hover','zen-has-empty-tab','flash-popup','has-popup-menu','movingtab','zen-compact-mode-active'];
      for(const key of showAttrs)attributes.push([toolbox,key,toolbox.getAttribute(key)]);
      const show = value => {for(const key of showAttrs)toolbox.removeAttribute(key);if(value)toolbox.setAttribute('zen-user-show','true');else toolbox.removeAttribute('zen-user-show');};
      const pageURL = page => 'data:text/html,'+encodeURIComponent('<!doctype html><title>'+marker+'</title><style>html,body{margin:0;background:'+ (page==='opaque'?'white':'transparent') +'}body{position:fixed;inset:0;background:repeating-linear-gradient(90deg,#000 0 4px,transparent 4px 8px)}</style>');
      const alternate = addFixture(w.gBrowser.addTab(pageURL('transparent'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true}));
      const load = async (tab,page) => {
        const url=pageURL(page),browser=tab.linkedBrowser;
        browser.loadURI(Services.io.newURI(url),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
        for(let n=0;n<100;n++) {
          guard();await wait(30);
          if(browser.currentURI.spec===url && !browser.webProgress.isLoadingDocument)return;
        }
        throw Error('Generated document did not finish loading');
      };
      // Subsequent cases use real opaque/transparent document backgrounds,
      // rather than the browser backing used by the settled matrix.
      root.setAttribute('zz-blur-page','document');
      const sidebarCrops = () => {
        const p=panel.getBoundingClientRect(), b=w.gBrowser.selectedBrowser.getBoundingClientRect();
        const x=Math.max(p.left,b.left)+24,y=Math.max(p.top,b.top)+140;
        const width=Math.min(p.right,b.right)-x-24,height=Math.min(180,Math.min(p.bottom,b.bottom)-y-24);
        const controlX=P.getBoolPref('zen.tabs.vertical.right-side',false)?b.left+40:Math.max(b.left,p.right)+40;
        if(width<32 || height<32 || controlX+128>b.right)throw Error('No valid sequence crops');
        return [{name:'sidebar',x,y,width,height},{name:'control',x:controlX,y,width:128,height}];
      };
      setPref('ui.prefersReducedTransparency',0);
      for(const right of [false,true])for(const page of ['opaque','transparent'])for(const variant of ['installed','native-only','native-no-nudge']) {
        setPref('zen.tabs.vertical.right-side',right);
        await load(alternate,page);
        unSheet(phaseSheet);phaseSheet=null;
        if(variant==='installed')restorePref('zzglass.sidebar.blur-transparent-pages');else setPref('zzglass.sidebar.blur-transparent-pages',false);
        if(variant==='native-no-nudge')phaseSheet=sheet(':root[zz-native-blur-test] #navigator-toolbox#navigator-toolbox #titlebar #zen-toolbar-background{backdrop-filter:var(--zzg-acrylic-flat)!important}');
        for(const scenario of ['load-open','tab-switch-open','slide-open','slide-close']) {
          guard();w.gBrowser.selectedTab=fixture;
          await load(fixture,scenario==='load-open'?(page==='opaque'?'transparent':'opaque'):page);
          show(true);await wait(450);
          const rois=sidebarCrops();
          if(scenario==='slide-open'){show(false);await wait(450);}
          status.textContent=`${id+1}: ${scenario}, ${right?'right':'left'}, ${page}, ${variant} — Stop + copy`;
          const entry={id:++id,kind:'sequence',scenario,right,page,variant,rois,before:snapshot()};
          await capture(entry,()=>{
            if(scenario==='load-open')w.gBrowser.selectedBrowser.loadURI(Services.io.newURI(pageURL(page)),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
            else if(scenario==='tab-switch-open')w.gBrowser.selectedTab=alternate;
            else show(scenario==='slide-open');
          });
        }
      }
      unSheet(phaseSheet);phaseSheet=null;
      w.gBrowser.selectedTab=fixture;show(false);setPref('ui.prefersReducedTransparency',0);
      // Generated surfaces use the installed production selectors and recipe.
      // They contain no profile text, images, history or URLs.
      const host=doc.createElementNS('http://www.w3.org/1999/xhtml','div');
      host.id='zz-render-fixtures';root.appendChild(host);temporary.push(host);
      const overlay=doc.createElementNS(host.namespaceURI,'div');
      overlay.className='zen-library-media-preview-backdrop';host.appendChild(overlay);
      const place = (node,height=120) => {
        const b=w.gBrowser.selectedBrowser.getBoundingClientRect();
        node.style.cssText=`position:fixed!important;inset:auto!important;left:${Math.round(b.left+b.width/2-150)}px!important;top:${Math.round(b.top+160)}px!important;width:300px!important;height:${height}px!important;visibility:visible!important;display:block!important;opacity:1!important;transform:none!important;z-index:2147483600!important;pointer-events:none!important;`;
      };
      const crop = node => {const r=node.getBoundingClientRect();if(r.width<40||r.height<40)throw Error('Render fixture has no visible bounds');return [{name:'surface',x:r.left+12,y:r.top+12,width:r.width-24,height:r.height-24}];};
      setPref('zzglass.overlays.enabled',true);setPref('zzglass.overlays.media-preview',1);
      for(const page of ['opaque','transparent'])for(const height of [52,180])for(const radius of [8,42])for(const variant of ['reference','blur']) {
        guard();await load(fixture,page);place(overlay,height);setPref('zzglass.overlays.blur',radius+'px');
        unSheet(phaseSheet);phaseSheet=null;
        if(variant==='reference')phaseSheet=sheet(':root[zz-native-blur-test] #zz-render-fixtures .zen-library-media-preview-backdrop{backdrop-filter:none!important}');
        await wait(180);
        const computed=w.getComputedStyle(overlay);
        if(variant==='reference' && computed.backdropFilter!=='none')throw Error('Overlay reference overridden');
        if(variant==='blur' && computed.backdropFilter==='none')throw Error('Installed overlay blur rule missing');
        status.textContent=`${id+1}: page-backed overlay ${height}px, blur ${radius}px, ${variant} — Stop + copy`;
        await capture({id:++id,kind:'overlay',surface:'media-preview recipe fixture',page,height,radius,variant,rois:crop(overlay),computed:{filter:computed.backdropFilter,fill:computed.backgroundColor}});
      }
      unSheet(phaseSheet);phaseSheet=null;
      overlay.remove();
      // Native XUL popup with generated labels; allow only popups owned by the
      // verified fixture browser. The foreground/occlusion checks still run.
      const popup=doc.createXULElement('menupopup');popup.id='zz-render-menu';
      for(const [label,disabled] of [['Reload fixture',false],['Close fixture',false],['Disabled fixture',true]]) {
        const item=doc.createXULElement('menuitem');item.setAttribute('label',label);if(disabled)item.setAttribute('disabled','true');popup.appendChild(item);
      }
      doc.getElementById('mainPopupSet').appendChild(popup);temporary.push(popup);
      const swatch=doc.createElementNS(host.namespaceURI,'div');
      swatch.textContent='Fixture text — Aa 0123';host.appendChild(swatch);
      for(const dark of [false,true])for(const mode of ['normal','reduced-transparency','contrast']) {
        guard();setPref('ui.systemUsesDarkTheme',dark?1:0);setPref('ui.prefersReducedTransparency',mode==='reduced-transparency'?1:0);
        setPref('browser.display.document_color_use',mode==='contrast'?2:0);setPref('ui.useAccessibilityTheme',mode==='contrast'?1:0);
        place(swatch,100);swatch.style.setProperty('background','Canvas');swatch.style.setProperty('color','CanvasText');swatch.style.setProperty('padding','16px');swatch.style.setProperty('box-sizing','border-box');swatch.style.setProperty('font','20px system-ui');
        await wait(250);
        const b=w.gBrowser.selectedBrowser.getBoundingClientRect();
        popup.openPopupAtScreen(w.mozInnerScreenX+b.left+Math.max(100,b.width/2-140),w.mozInnerScreenY+b.top+320,false);
        for(let n=0;n<40 && popup.state!=='open';n++){guard();await wait(50);}
        if(popup.state!=='open')throw Error('Accessibility menu did not open');
        const r=popup.getBoundingClientRect(), cs=w.getComputedStyle(popup), text=w.getComputedStyle(swatch);
        const rois=[...crop(swatch),{name:'menu',x:r.x,y:r.y,width:r.width,height:r.height}];
        status.textContent=`${id+1}: ${dark?'dark':'light'} ${mode} native menu — Stop + copy`;
        await capture({id:++id,kind:'accessibility',dark,mode,ownedPopup:true,rois,signals:{contrast:w.matchMedia('(prefers-contrast)').matches,reduced:w.matchMedia('(prefers-reduced-transparency: reduce)').matches},computed:{menuFill:cs.backgroundColor,menuText:cs.color,canvas:text.backgroundColor,canvasText:text.color}});
        popup.hidePopup();
      }
      report.coverage={settled:32,sequences:48,overlay:16,accessibility:6};
    }

  };
  const finish = async () => {
    clock.clearTimeout(deadline);
    // Stop screen IO before restoring any user content. The worker also has
    // its own deadline and checks a stop file every request.
    if(directory)await IOUtils.writeUTF8(PathUtils.join(directory,'stop'),'stop').catch(()=>{});
    if(worker?.isRunning) {
      try { worker.kill(); } catch(e) {
        // A natural exit can race its main-thread ProcessComplete notification.
        for(let n=0;n<40 && worker.isRunning;n++)await wait(50);
        if(worker.isRunning)throw e;
      }
    }
    if(worker?.isRunning)throw Error('Capture worker still running; fixture retained to protect user content');
    const clean = fn => { try { fn(); } catch(e) { report.errors.push('Cleanup: '+String(e)); } };
    clean(()=>w.removeEventListener('TabSelect',onSelect)); clean(()=>w.removeEventListener('unload',onUnload));
    clean(()=>unSheet(phaseSheet)); clean(()=>unSheet(maskSheet)); clean(()=>status?.remove());
    for(const [key] of saved)clean(()=>restorePref(key));
    for(const [node,key,value] of attributes.reverse())clean(()=>{ if(value===null)node.removeAttribute(key);else node.setAttribute(key,value); });
    for(const node of temporary)clean(()=>{node.hidePopup?.();node.remove();});
    clean(()=>{ if(!w.closed) {
      if(fixtures.has(w.gBrowser.selectedTab) && originalTab?.isConnected)w.gBrowser.selectedTab=originalTab;
      for(const tab of fixtures)if(tab.isConnected)w.gBrowser.removeTab(tab,{animate:false,skipPermitUnload:true});
    } });
    clean(()=>restoreLibrary?.());
    report.finished=stopped||'completed'; report.ended=new Date().toISOString();
    if(directory) {
      report.directory=directory; report.archive=directory+'.zip';
      await IOUtils.writeJSON(PathUtils.join(directory,'report.json'),report);
      const zip=Cc['@mozilla.org/zipwriter;1'].createInstance(Ci.nsIZipWriter);
      try {
        zip.open(localFile(report.archive),0x04|0x08|0x20);
        for(const path of await IOUtils.getChildren(directory))if(/(?:\.png|report\.json)$/.test(path))
          zip.addEntryFile(PathUtils.filename(path),6,localFile(path),false);
      } finally { zip.close(); }
    }
  };
  deadline=clock.setTimeout(()=>abort('deadline reached'),240000);
  task=(async()=>{
    try { await run(); } catch(e) { stopped ||= 'error'; report.errors.push(String(e)); }
    try { await finish(); } catch(e) { report.errors.push('Cleanup/package: '+String(e)); }
    const text=JSON.stringify(report,null,2);
    console.log('[Native blur capture]',text);
    Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);
    try { if(w.__zzNativeBlurProbe===api)delete w.__zzNativeBlurProbe; } catch {}
    return report;
  })();
  return task;
})();
