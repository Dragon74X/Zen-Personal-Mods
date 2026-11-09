// Favorite (Essentials) hover probe: does a Favorite's icon move on hover, and
// which stylesheet rule moves it? Paste into the Browser Console (Ctrl+Shift+J)
// and leave the window alone. It starts at once, hover-locks up to four
// Favorites (a synthetic CSS state), records Favorites the mouse crosses in the
// first 6 s (optional), restores every lock, stops within 15 s (zzFavStop()
// stops early) and copies the report. No page titles or addresses are reported.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), locked = new Set(), real = [], t0 = Date.now(); let done = false;
  const r = e => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(n => +n.toFixed(2)); };
  const name = e => e.localName + '.' + [...e.classList].join('.');
  const snap = tab => Object.fromEntries([...tab.querySelectorAll('.tab-content > *, .tab-icon-image')].map(e => { const s = getComputedStyle(e); return [name(e), [r(e), s.display, s.position, s.visibility, s.margin, s.translate, s.transform]]; }));
  const rules = e => (InspectorUtils.getMatchingCSSRules || InspectorUtils.getCSSStyleRules)(e).filter(x => !/^(chrome:\/\/global|resource:)/.test(x.parentStyleSheet?.href || '') && /display|position|margin|inset|left|right|translate|transform/.test(x.style.cssText))
    .map(x => (x.parentStyleSheet?.href || 'inline').split('/').slice(-3).join('/') + ' :: ' + x.selectorText + ' { ' + x.style.cssText.slice(0, 140) + ' }').slice(-8);
  const over = ev => { const t = ev.target.closest?.('.tabbrowser-tab[zen-essential]'); if (!t) return; const i = t.querySelector('.tab-icon-image'), a = r(i); setTimeout(() => real.push({ index: [...document.querySelectorAll('.tabbrowser-tab[zen-essential]')].indexOf(t), rest: a, hover: r(i) }), 450); };
  const stop = window.zzFavStop = () => { done = true; removeEventListener('mouseover', over, true); for (const t of locked) InspectorUtils.removePseudoClassLock(t, ':hover'); locked.clear(); };
  addEventListener('mouseover', over, true);
  const P = Services.prefs, report = { zen: Services.appinfo.version, os: Services.appinfo.OS, dpr: devicePixelRatio,
    sidebar: document.documentElement.getAttribute('zen-sidebar-expanded'), compact: gZenCompactModeManager?.preference, prefs: {}, favorites: [], realPointer: real,
    note: 'favorites[] = synthetic :hover CSS lock; realPointer = Favorites the mouse crossed in the first 6 s (optional)' };
  for (const k of ['zzicon.set', 'zzglass.tabs.close-left', 'zzglass.tabs.essentials-icon-grow', 'zzglass.motion.enabled', 'arc-essentials-unload-button'])
    report.prefs[k] = P.getPrefType(k) === 128 ? P.getBoolPref(k) : P.getPrefType(k) === 64 ? P.getIntPref(k) : P.getPrefType(k) === 32 ? P.getStringPref(k) : null;
  try { report.mods = Object.values(await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, 'chrome', 'sine-mods', 'mods.json'))).map(m => [m.name || m.id, m.version, m.enabled !== false]); } catch (e) { report.mods = String(e); }
  const run = async () => {
    for (const tab of [...document.querySelectorAll('.tabbrowser-tab[zen-essential="true"]')].filter(t => t.getBoundingClientRect().width).slice(0, 4)) {
      if (done) return;
      const rest = snap(tab); InspectorUtils.addPseudoClassLock(tab, ':hover'); locked.add(tab); await wait(450); if (done) return;
      const hover = snap(tab), changed = {}, c = a => [a[0] + a[2] / 2, a[1] + a[3] / 2], key = Object.keys(rest).find(k => k.startsWith('img.tab-icon-image'));
      for (const k in hover) if (JSON.stringify(hover[k]) !== JSON.stringify(rest[k])) changed[k] = { rest: rest[k], hover: hover[k] };
      const shown = [...tab.querySelectorAll('.tab-content > *')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width && !e.matches('.tab-icon-stack')).map(e => ({ el: name(e), rules: rules(e) }));
      InspectorUtils.removePseudoClassLock(tab, ':hover'); locked.delete(tab); await wait(300);
      report.favorites.push({ index: report.favorites.length, pending: tab.hasAttribute('pending'), iconShift: c(hover[key][0]).map((v, i) => +(v - c(rest[key][0])[i]).toFixed(2)), changed, visibleOnHover: shown });
    }
    await wait(Math.max(0, 6000 - (Date.now() - t0)));
  };
  try { await Promise.race([run(), wait(15000).then(() => { report.error = 'deadline'; })]); } catch (e) { report.error = String(e); } finally { stop(); }
  const text = JSON.stringify(report, null, 1); window.zzFavReport = report;
  Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);
  console.log('Favorite hover report (copied to clipboard):\n' + text);
})();
