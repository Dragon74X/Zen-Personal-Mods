// Loaded by zen-smoke.py in a disposable Zen profile, never a user profile.
return (async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, message, details = null) => { if (!ok) throw Error(message + ': ' + JSON.stringify(details)); };
  const result = { zen: Services.appinfo.version, checks: [], limitations: 'Native DOM/state checks; not Windows physical input or backdrop pixels.' };
  const until = async (fn, label) => {
    for (let n = 0; n < 80; n++) { if (fn()) return; await wait(50); }
    throw Error(label);
  };
  const beforeLibrary = document.querySelector('zen-library');
  const beforeClass = customElements.get('zen-library');
  integrationWarmLibrary();
  check(document.querySelector('zen-library') === beforeLibrary && customElements.get('zen-library') === beforeClass,
    'Code-only warm constructed the Library');
  check(!!customElements.get('zen-library-space-routing-section'), 'Code-only warm omitted routing section');
  result.checks.push('Code-only warm: native routing section available, no Library construction');

  const closed = SessionStore.getClosedTabData({ sourceWindow: window, closedTabsFromAllWindows: false, closedTabsFromClosedWindows: false });
  check(Array.isArray(closed), 'Native closed-tab query');
  result.checks.push('SessionStore options object accepted by native 1.24');

  const button = gZenWorkspaces.activeWorkspaceElement.newTabButton;
  const label = button.querySelector('.toolbarbutton-text');
  check(getComputedStyle(label).display === 'none', 'Ordinary new-tab label should be hidden');
  Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('https://example.com/fixture');
  button.dispatchEvent(new MouseEvent('mouseenter', { ctrlKey: true, metaKey: true }));
  await until(() => button.hasAttribute('zen-paste-and-search'), 'Native Paste & Search state never activated');
  check(getComputedStyle(label).display !== 'none', 'Paste & Search action label hidden');
  check(button.querySelector('.zen-tab-sublabel').value === 'https://example.com/fixture', 'Native clipboard preview missing');
  button.dispatchEvent(new MouseEvent('mouseleave'));
  await wait(100);
  check(!button.hasAttribute('zen-paste-and-search') && getComputedStyle(label).display === 'none', 'Label preference not restored');
  result.checks.push('Native Paste & Search shows its action and preview, then restores hide-label (synthetic mouse event)');

  const root = document.documentElement;
  root.setAttribute('zen-compact-mode', 'true');
  const toolbox = document.getElementById('navigator-toolbox');
  toolbox.setAttribute('zen-user-show', 'true');
  Services.prefs.setIntPref('ui.prefersReducedTransparency', 1);
  await wait(250);
  check(matchMedia('(prefers-reduced-transparency: reduce)').matches, 'Reduced-transparency test override unavailable');
  const panel = document.getElementById('zen-toolbar-background');
  check(getComputedStyle(panel).backdropFilter === 'none', 'Custom sidebar ignores reduced transparency', getComputedStyle(panel).backdropFilter);
  const tokens = getComputedStyle(root);
  check(tokens.getPropertyValue('--zzg-ov-glass').trim() === 'none', 'Overlay glass ignores reduced transparency');
  const caption = document.getElementById('zen-sidebar-pip-caption');
  check(!getComputedStyle(caption).backgroundColor.includes(' / '), 'Media captions remain translucent', getComputedStyle(caption).backgroundColor);
  result.checks.push('Reduced transparency: custom sidebar and shared overlay blur disabled');
  Services.prefs.clearUserPref('ui.prefersReducedTransparency');
  root.setAttribute('zen-compact-mode', 'false');
  toolbox.removeAttribute('zen-user-show');
  await wait(250);

  const opened = [];
  const add = () => {
    const tab = gBrowser.addTab('about:blank', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), skipAnimation: true });
    opened.push(tab); return tab;
  };
  const selected = add();
  for (let n = 0; n < 35; n++) add();
  gBrowser.selectedTab = selected;
  const group = gBrowser.addTabGroup([selected, opened[1]], { label: 'Native indicator fixture', insertBefore: selected });
  const space = gZenWorkspaces.activeWorkspaceElement, scrollbox = space.scrollbox;
  const pill = space.querySelector('.zen-workspace-scroll-to-tab');
  scrollbox.smoothScroll = false;
  await wait(600);
  for (const right of [false, true]) {
    Services.prefs.setBoolPref('zen.tabs.vertical.right-side', right);
    for (const collapsed of [false, true]) {
      group.collapsed = collapsed;
      await wait(400);
      scrollbox.ensureElementIsVisible(opened.at(-1), true);
      await until(() => !pill.hidden, 'Native selected-tab indicator absent');
      pill.click();
      await until(() => pill.hidden, 'Native selected-tab indicator did not return to selection');
      const r = selected.getBoundingClientRect(), port = scrollbox.scrollClientRect;
      check(r.bottom > port.top && r.top < port.bottom, 'Selected row not brought back into view', {r:r.toJSON(),port});
    }
  }
  Services.prefs.setBoolPref('zen.view.show-scroll-to-selected-tab', false);
  scrollbox.ensureElementIsVisible(opened.at(-1), true); await wait(300);
  check(pill.hidden, 'Native indicator off preference lost');
  result.checks.push('Native selected-tab indicator: open/collapsed group, left/right sidebar, off preference');
  Services.prefs.setBoolPref('zen.view.show-scroll-to-selected-tab', true);
  Services.prefs.setStringPref('zzgroup.folder-height', '180px');
  const nested = gBrowser.addTabGroup([selected, ...opened.slice(2, 22)], {label:'Nested scrolling fixture',insertBefore:selected});
  group.groupContainer.append(nested);
  group.collapsed = nested.collapsed = false;
  const body = group.groupContainer;
  const inside = (row, box) => {
    const r=row.getBoundingClientRect(), b=box.getBoundingClientRect();
    return r.height > 0 && r.top >= b.top-1 && r.bottom <= b.bottom+1;
  };
  result.nested = [];
  for (const right of [false,true]) {
    Services.prefs.setBoolPref('zen.tabs.vertical.right-side',right);
    gBrowser.selectedTab=selected;
    scrollbox.ensureElementIsVisible(group.labelContainerElement,true);
    await wait(500);
    check(body.scrollHeight>body.clientHeight+20,'Nested fixture did not overflow');
    const point=body.getBoundingClientRect();
    body.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,
      clientX:point.left+20,clientY:Math.min(point.bottom,scrollbox.scrollClientRect.bottom)-12,
      deltaY:body.scrollHeight,deltaMode:0}));
    await wait(400);
    check(!inside(selected,body),'Nested fixture did not hide selection',
      {body:body.getBoundingClientRect().toJSON(),tab:selected.getBoundingClientRect().toJSON(),scrollTop:body.scrollTop});
    await until(()=>!pill.hidden,'Native indicator absent for nested clipping');
    pill.click();
    await wait(700);
    check(inside(selected,body),'Native jump left selected tab clipped inside folder',
      {right,pillHidden:pill.hidden,body:body.getBoundingClientRect().toJSON(),tab:selected.getBoundingClientRect().toJSON(),scrollTop:body.scrollTop});
    result.nested.push({right,returned:true});
  }
  const ZenLibrary = customElements.get('zen-library') ||
    ChromeUtils.importESModule('moz-src:///zen/library/ZenLibrary.mjs',{global:'current'}).ZenLibrary;
  result.libraryCopies=[];
  for (const right of [false,true]) {
    Services.prefs.setBoolPref('zen.tabs.vertical.right-side',right);
    const target=opened[right?20:21];
    check(gBrowser.discardBrowser(target,true),'Library fixture tab did not unload');
    await until(()=>target.hasAttribute('pending'),'Fixture pending state absent');
    const realCount=gBrowser.tabs.length;
    ZenLibrary.toggle('spaces');
    await until(()=>document.getElementById(nested.id+'-copy')?.querySelector('tab'),'Native Library nested copies absent');
    const copy=document.getElementById(nested.id+'-copy');
    const copyBody=copy.groupContainer;
    check(copyBody.style.getPropertyValue('--zzgf-box-fit')==='' && copyBody.scrollTop===0,
      'Library copy acquired sidebar scrolling ownership');
    copy.labelContainerElement.click(); await wait(350);
    check(copy.collapsed && !nested.collapsed,'Library copy collapse changed the real group');
    copy.labelContainerElement.click(); await wait(350);
    check(!copy.collapsed && !nested.collapsed,'Library copy expansion changed real state');
    check(gBrowser.tabs.length===realCount,'Library copies entered the real tab list');
    const tabCopy=document.getElementById(target.id+'-copy');
    check(tabCopy?.hasAttribute('pending'),'Library lost unloaded-tab state');
    tabCopy.click();
    await until(()=>gBrowser.selectedTab===target && !ZenLibrary.isLibraryOpen,'Library copy did not select its real tab and close');
    await until(()=>inside(target,body),'Selected Library copy remains clipped in real folder');
    check(gBrowser.tabs.length===realCount,'Library selection duplicated a tab');
    result.libraryCopies.push({right,independentCollapse:true,pendingSelection:true,nativeTabCount:realCount});
  }
  for(const tab of opened)if(!group.contains(tab))gBrowser.removeTab(tab,{animate:false});
  ZenLibrary.toggle('spaces');
  await until(()=>document.querySelector('zen-library .zen-library-space'),'Library card absent');
  await until(()=>document.getElementById(nested.id+'-copy'),'Appearance fixture nested copy absent');
  const card=document.querySelector('zen-library .zen-library-space');
  document.getElementById(nested.id+'-copy').collapsed=true;
  Services.prefs.setStringPref('zzgroup.label.color','#777777');
  Services.prefs.setStringPref('zzgroup.subfolder.active.label-color','#777777');
  Services.prefs.setStringPref('zzgroup.subfolder.inactive.label-color','#777777');
  const system=document.createElementNS('http://www.w3.org/1999/xhtml','div');
  system.style.cssText='color:CanvasText;background:Canvas';root.append(system);
  const palette=()=>({canvas:getComputedStyle(system).backgroundColor,text:getComputedStyle(system).color});
  window.integrationAppearance = async (dark,mode) => {
    Services.prefs.setIntPref('ui.systemUsesDarkTheme',dark?1:0);
    Services.prefs.setIntPref('ui.prefersReducedTransparency',mode==='reduced-transparency'?1:0);
    Services.prefs.setIntPref('browser.display.document_color_use',mode==='contrast'?2:0);
    Services.prefs.setIntPref('ui.useAccessibilityTheme',mode==='contrast'?1:0);
    await wait(400);
    const copy=document.getElementById(group.id+'-copy');
    const header=copy.labelContainerElement,label=copy.labelElement;
    if(mode==='normal')await until(()=>getComputedStyle(label).color==='rgb(119, 119, 119)','Saved folder colour did not settle after accessibility was released');
    const read=node=>{const cs=getComputedStyle(node),r=node.getBoundingClientRect();return {fill:cs.backgroundColor,text:cs.color,image:cs.backgroundImage,opacity:cs.opacity,rect:r.toJSON()};};
    const out={dark,mode,palette:palette(),card:read(card),folder:read(header),label:read(label),caption:read(caption),
      nestedLabel:read(document.getElementById(nested.id+'-copy').labelElement),
      title:read(card.querySelector('.zen-library-space-name')),tab:read(copy.querySelector('.tab-label')),
      workspaceBackground:getComputedStyle(card.querySelector('.zen-library-space-background')).display,
      contrast:matchMedia('(prefers-contrast)').matches,reduced:matchMedia('(prefers-reduced-transparency: reduce)').matches};
    if(mode!=='normal') {
      check(getComputedStyle(root).getPropertyValue('--zzg-ov-glass').trim()==='none','Accessible mode retained shared blur',out);
      check(out.card.fill===out.palette.canvas && out.card.text===out.palette.text,'Library lost system colors',out);
      check(getComputedStyle(card,'::before').display==='none','Library retained translucent decoration',out);
      check(out.workspaceBackground==='none','Workspace artwork covers accessible Library card',out);
    }
    if(mode==='contrast') {
      check(out.contrast,'Contrast signal not enabled');
      check(out.label.text===out.palette.text,'Custom folder label overrides accessible foreground',out);
      check(out.nestedLabel.text===out.palette.text,'Nested folder label overrides accessible foreground',out);
      check(out.title.text===out.palette.text && out.tab.text===out.palette.text,'Library title/tab text ignores system foreground',out);
      check(out.folder.opacity==='1','Folder text remains dimmed in contrast mode',out);
    }
    if(mode==='normal')check(out.label.text==='rgb(119, 119, 119)','Saved label colour did not resume',out);
    check(Services.prefs.getStringPref('zzgroup.label.color')==='#777777','Accessible mode rewrote saved colour');
    return out;
  };
  // Reproduced separately in stock Zen 1.24 with no mod scripts/styles loaded.
  result.nativeWarnings=integrationErrors.filter(e=>e==='ResizeObserver loop completed with undelivered notifications.');
  check(integrationErrors.length===result.nativeWarnings.length,'Uncaught native errors',integrationErrors);
  result.checks.push('Nested selected-tab return and native Library copies on both sides, including unloaded rows');
  return result;
})();
