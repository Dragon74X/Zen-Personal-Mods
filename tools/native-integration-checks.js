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
  const cardFixture = document.createElementNS('http://www.w3.org/1999/xhtml', 'zen-library');
  const card = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  card.className = 'zen-library-space'; card.textContent = 'Library contrast fixture';
  cardFixture.append(card); root.append(cardFixture);
  Services.prefs.setIntPref('browser.display.document_color_use', 2);
  Services.prefs.setIntPref('ui.useAccessibilityTheme', 1);
  await wait(300);
  check(matchMedia('(prefers-contrast)').matches, 'High-contrast override unavailable');
  result.contrastSignals = {forced:matchMedia('(forced-colors)').matches,contrast:matchMedia('(prefers-contrast)').matches};
  check(getComputedStyle(card).backgroundImage === 'none' && getComputedStyle(card, '::before').display === 'none', 'Library decorations survive forced colors');
  check(getComputedStyle(root).getPropertyValue('--zzg-ov-glass').trim() === 'none', 'Forced colors keeps blur');
  result.accessibility = { card: { fill:getComputedStyle(card).backgroundColor, text:getComputedStyle(card).color },
    caption:{fill:getComputedStyle(caption).backgroundColor,text:getComputedStyle(caption).color},
    folder:{fill:getComputedStyle(group).backgroundColor,text:getComputedStyle(group).color},
    menu:{fill:getComputedStyle(document.getElementById('tabContextMenu')).backgroundColor,text:getComputedStyle(document.getElementById('tabContextMenu')).color} };
  check(result.accessibility.card.fill !== result.accessibility.card.text, 'Library text blends into fill');
  result.checks.push('High contrast: Library decorations removed, shared blur disabled; native menu/folder/caption colors recorded');
  cardFixture.remove();
  check(integrationErrors.length === 0, 'Uncaught native errors', integrationErrors);
  return result;
})();
