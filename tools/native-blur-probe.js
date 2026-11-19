// Paste the complete IIFE into Zen's Browser Console. Starts automatically.
// Windows desktop pixels only: no drawSnapshot/Marionette blur claims.
(async () => {
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  if (!w) throw Error('No browser window');
  const followUpOnly = w.__zzNativeBlurFollowUpOnly === true;
  delete w.__zzNativeBlurFollowUpOnly;
  await w.__zzNativeBlurProbe?.stop?.('replaced');
  const report = { probe: 'native-blur-v6', scope: followUpOnly ? 'follow-up' : 'all', started: new Date().toISOString(),
    browser: Services.appinfo.version, platform: Services.appinfo.OS, cases: [], errors: [],
    limitations: 'Generated fixture only. Desktop GDI crops test presented pixels, not animation FPS. Native acrylic must be enabled before browser startup; its renderer startup latch is not observable here. Compare native-only against installed output, including transparent pages. A computed filter alone is not visual proof.' };
  const P = Services.prefs, doc = w.document, root = doc.documentElement;
  // Window timers are canceled on close, which would strand global test prefs.
  const clock = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const wait = ms => new Promise(resolve => clock.setTimeout(resolve, ms));
  const read = fn => { try { return fn(); } catch (e) { return { error: String(e) }; } };
  const saved = new Map(), attributes = [], fixtures = new Set(), fixtureDocuments = new Map(), temporary = [];
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
  const guard = () => {
    if (stopped || w.closed) throw Error(stopped || 'window closed');
    const browser = w.gBrowser.selectedBrowser;
    if (fixture && fixtures.has(w.gBrowser.selectedTab) && browser.currentURI.spec !== 'about:blank' &&
        !fixtureDocuments.has(browser.currentURI.spec)) throw Error('Fixture navigated away; capture refused');
  };
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
$fixtureHandle = [IntPtr]::Zero
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
  # Navigation can briefly replace a window title. Never capture through that
  # gap: wait at most 2s, reverify every condition, and record omitted time.
  $identityWait = [Diagnostics.Stopwatch]::StartNew()
  $miss = $null
  do {
   $handle = [BlurWindow]::GetForegroundWindow()
   if ($q.ownedPopup) { $handle = [BlurWindow]::GetAncestor($handle,3) }
   [uint32]$owner = 0
   $null = [BlurWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
   $title = New-Object System.Text.StringBuilder(1024)
   $null = [BlurWindow]::GetWindowText($handle,$title,1024)
   $identity = @{processMatches=($owner -eq $q.pid);titleMatches=$title.ToString().Contains($q.marker);windowMatches=($fixtureHandle -eq [IntPtr]::Zero -or $handle -eq $fixtureHandle)}
   if ($identity.processMatches -and $identity.titleMatches -and $identity.windowMatches) { break }
   $miss = $identity
   if (Test-Path (Join-Path $Directory 'stop')) { throw 'Capture stopped' }
   if ($identityWait.ElapsedMilliseconds -ge 2000) {
    $answer.identity=$identity
    if (!$identity.processMatches) { throw 'Foreground process changed; capture refused' }
    if (!$identity.windowMatches) { throw 'Foreground browser window changed; capture refused' }
    throw 'Fixture title marker unavailable; capture refused'
   }
   Start-Sleep -Milliseconds 25
  } while ($true)
  if ($fixtureHandle -eq [IntPtr]::Zero) { $fixtureHandle=$handle }
  if ($miss) { $answer.gaps += @(@{frame=$frame;waitMs=$identityWait.ElapsedMilliseconds;identity=$miss}) }
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
    // Fine stripes reveal blur; wide cyan/amber bands distinguish a freshly
    // painted document from a stale backdrop even after strong blur/dimming.
    const fixtureCSS='@-moz-document url-prefix('+JSON.stringify('data:text/html,'+encodeURIComponent('<!doctype html><title>'+marker))+') {'+
      ['opaque','transparent'].map(page=>':root:has(body#zz-blur-fixture[data-page="'+page+'"]),body#zz-blur-fixture[data-page="'+page+'"]{background:'+(page==='opaque'?'white':'transparent')+'!important}').join('')+'}';
    const pageURL = (page,paint='stripes') => {
      const color=paint==='cyan'?'#20c8ff':'#ff9020';
      const html='<!doctype html><title>'+marker+'</title><style>html,body{margin:0!important;background:'+(page==='opaque'?'white':'transparent')+'!important;color-scheme:only light;forced-color-adjust:none}svg{position:fixed;inset:0;width:100%;height:100%}</style>'+
        '<body id="zz-blur-fixture" data-page="'+page+'"><svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="8" fill="#000"/></pattern></defs><rect width="100%" height="100%" fill="url(#stripes)"/>'+
        (paint==='stripes'?'':'<rect y="176" width="100%" height="64" fill="'+color+'"/>')+'</svg><script>{const state='+JSON.stringify({page,paint})+';'+
        'const report=()=>{state.html=getComputedStyle(document.documentElement).backgroundColor;state.body=getComputedStyle(document.body).backgroundColor;document.title='+JSON.stringify(marker+'|')+'+JSON.stringify(state);};report();for(const ms of [100,500,1500])setTimeout(report,ms);}</script>';
      const url='data:text/html,'+encodeURIComponent(html);
      fixtureDocuments.set(url,{page,paint});return url;
    };
    fixture = w.gBrowser.addTab(pageURL('transparent'),
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
      ':root[zz-native-blur-test][zz-blur-page="opaque"] #tabbrowser-tabbox browser{background-color:#fff!important}'+fixtureCSS);
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

    // Only generated documents can report these fields; never copy an arbitrary title.
    const backgrounds = browser => {
      if(!fixtureDocuments.has(browser.currentURI.spec))return null;
      try {
        const title=browser.contentTitle, prefix=marker+'|';
        if(!title.startsWith(prefix))return null;
        const data=JSON.parse(title.slice(prefix.length)), expected=fixtureDocuments.get(browser.currentURI.spec);
        if(data.page!==expected.page || data.paint!==expected.paint)return null;
        return {html:data.html,body:data.body};
      } catch { return null; }
    };
    const validBackground = browser => {
      const expected=fixtureDocuments.get(browser.currentURI.spec)?.page==='opaque'?'rgb(255, 255, 255)':'rgba(0, 0, 0, 0)', actual=backgrounds(browser);
      return actual?.html===expected && actual?.body===expected;
    };
    const snapshot = () => ({utcMs:Date.now(),document:fixtureDocuments.get(w.gBrowser.selectedBrowser.currentURI.spec) || null,
      backgrounds:backgrounds(w.gBrowser.selectedBrowser),
      loading:!!w.gBrowser.selectedBrowser.webProgress.isLoadingDocument,titleMatches:doc.title.includes(marker),
      panel:read(()=>{const r=panel.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),
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
      if(!validBackground(w.gBrowser.selectedBrowser))throw Error('Generated page background did not match its requested state');
    };
    const load = async (tab,page,paint='stripes') => {
      const url=pageURL(page,paint),browser=tab.linkedBrowser;
      browser.loadURI(Services.io.newURI(url),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
      for(let n=0;n<100;n++) {
        guard();await wait(30);
        if(browser.currentURI.spec===url && !browser.webProgress.isLoadingDocument && validBackground(browser))return;
      }
      throw Error('Generated document or its requested background did not finish loading');
    };
    for (const right of followUpOnly ? [] : [false,true]) for (const page of ['opaque','transparent']) for (const reduced of [false,true]) {
      setPref('zen.tabs.vertical.right-side',right); setPref('ui.prefersReducedTransparency',reduced?1:0);
      await load(fixture,page);
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
      const alternate = followUpOnly ? null : addFixture(w.gBrowser.addTab(pageURL('transparent'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true}));
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
      // The short follow-up verifies both actual canvas backgrounds while an
      // already-open sidebar tracks a newly painted document on the saved side.
      if(followUpOnly) {
        setPref('zzglass.sidebar.blur-transparent-pages',false);
        for(const page of ['opaque','transparent']) {
          await load(fixture,page==='opaque'?'transparent':'opaque','cyan');show(true);await wait(450);
          status.textContent=`${id+1}/14: verified ${page} document load — Stop + copy`;
          await capture({id:++id,kind:'sequence',scenario:'load-open',right:P.getBoolPref('zen.tabs.vertical.right-side',false),page,variant:'native-only',rois:sidebarCrops(),before:snapshot(),expectedPaint:'amber'},
            ()=>w.gBrowser.selectedBrowser.loadURI(Services.io.newURI(pageURL(page,'amber')),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()}));
        }
      }
      for(const right of followUpOnly ? [] : [false,true])for(const page of ['opaque','transparent'])for(const variant of ['installed','native-only','native-no-nudge']) {
        setPref('zen.tabs.vertical.right-side',right);
        await load(alternate,page,'amber');
        unSheet(phaseSheet);phaseSheet=null;
        if(variant==='installed')restorePref('zzglass.sidebar.blur-transparent-pages');else setPref('zzglass.sidebar.blur-transparent-pages',false);
        if(variant==='native-no-nudge')phaseSheet=sheet(':root[zz-native-blur-test] #navigator-toolbox#navigator-toolbox #titlebar #zen-toolbar-background{backdrop-filter:var(--zzg-acrylic-flat)!important}');
        for(const scenario of ['load-open','tab-switch-open','slide-open','slide-close']) {
          guard();w.gBrowser.selectedTab=fixture;
          await load(fixture,scenario==='load-open'?(page==='opaque'?'transparent':'opaque'):page,'cyan');
          show(true);await wait(450);
          const rois=sidebarCrops();
          if(scenario==='slide-open'){show(false);await wait(450);}
          status.textContent=`${id+1}: ${scenario}, ${right?'right':'left'}, ${page}, ${variant} — Stop + copy`;
          const entry={id:++id,kind:'sequence',scenario,right,page,variant,rois,before:snapshot(),
            expectedPaint:scenario==='load-open'||scenario==='tab-switch-open'?'amber':'cyan'};
          await capture(entry,()=>{
            if(scenario==='load-open')w.gBrowser.selectedBrowser.loadURI(Services.io.newURI(pageURL(page,'amber')),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
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
      for(const page of followUpOnly ? [] : ['opaque','transparent'])for(const height of [52,180])for(const radius of [8,42])for(const variant of ['reference','blur']) {
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
      const settleMenu = async () => {
        const started=Date.now();
        for(let n=0;n<40;n++) {
          guard();
          const pending=popup.getAnimations({subtree:true}).filter(a=>a.playState!=='finished' && a.playState!=='idle');
          if(!pending.some(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)))
            return {waitedMs:Date.now()-started,infiniteAnimations:pending.length};
          await wait(50);
        }
        throw Error('Native menu animations did not settle within 2 seconds');
      };
      for(const fixtureScheme of ['light','dark'])for(const mode of ['normal','reduced-transparency','contrast']) {
        guard();setPref('ui.prefersReducedTransparency',mode==='reduced-transparency'?1:0);
        setPref('browser.display.document_color_use',mode==='contrast'?2:0);setPref('ui.useAccessibilityTheme',mode==='contrast'?1:0);
        place(swatch,100);swatch.style.setProperty('background','Canvas');swatch.style.setProperty('color','CanvasText');swatch.style.setProperty('padding','16px');swatch.style.setProperty('box-sizing','border-box');swatch.style.setProperty('font','20px system-ui');
        // A fixed installed theme can ignore ui.systemUsesDarkTheme. Narrow
        // only the generated surfaces; do not claim to switch the user's theme.
        for(const node of [popup,swatch])node.style.setProperty('color-scheme','only '+fixtureScheme,'important');
        await wait(250);
        const b=w.gBrowser.selectedBrowser.getBoundingClientRect();
        popup.openPopupAtScreen(w.mozInnerScreenX+b.left+Math.max(100,b.width/2-140),w.mozInnerScreenY+b.top+320,false);
        for(let n=0;n<40 && popup.state!=='open';n++){guard();await wait(50);}
        if(popup.state!=='open')throw Error('Accessibility menu did not open');
        const content=popup.shadowRoot?.querySelector('[part~="content"]');
        if(!content)throw Error('Native menu painted content unavailable');
        for(const selected of [false,true]) {
          // Native selection styling only; not a physical keyboard-input test.
          if(selected)popup.children[1].setAttribute('_moz-menuactive','true');
          const motion=await settleMenu();
          const r=popup.getBoundingClientRect(), cs=w.getComputedStyle(content), outer=w.getComputedStyle(popup), text=w.getComputedStyle(swatch);
          if(!cs.colorScheme.split(' ').includes(fixtureScheme))throw Error('Native menu fixture color scheme was overridden');
          const rois=[...crop(swatch),{name:'menu',x:r.x,y:r.y,width:r.width,height:r.height}];
          status.textContent=`${id+1}: ${fixtureScheme} ${mode} native menu — Stop + copy`;
          await capture({id:++id,kind:'accessibility',fixtureScheme,mode,selected,motion,ownedPopup:true,rois,
            signals:{contrast:w.matchMedia('(prefers-contrast)').matches,forced:w.matchMedia('(forced-colors)').matches,reduced:w.matchMedia('(prefers-reduced-transparency: reduce)').matches,documentDark:w.matchMedia('(prefers-color-scheme: dark)').matches},
            computed:{menuFill:cs.backgroundColor,menuText:cs.color,menuOpacity:outer.opacity,contentOpacity:cs.opacity,colorScheme:cs.colorScheme,canvas:text.backgroundColor,canvasText:text.color,
              items:[...popup.children].map(item=>{const s=w.getComputedStyle(item);return {fill:s.backgroundColor,color:s.color,opacity:s.opacity,disabled:item.hasAttribute('disabled'),selected:item.hasAttribute('_moz-menuactive')};})}});
        }
        popup.children[1].removeAttribute('_moz-menuactive');
        popup.hidePopup();
      }
      report.coverage={settled:followUpOnly?0:32,sequences:followUpOnly?2:48,overlay:followUpOnly?0:16,accessibility:12};
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
