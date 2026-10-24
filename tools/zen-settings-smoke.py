#!/usr/bin/env python3
"""Native Sine settings verification in disposable Zen profiles.

MOZ_DISABLE_CONTENT_SANDBOX=1 python tools/zen-settings-smoke.py --zen ../zen/zen --sine ../Sine/src --output ../settings-evidence
Uses unmodified upstream parsePref/loadMods and Firefox moz-toggle, not an HTML mock.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time

spec = importlib.util.spec_from_file_location('zen_smoke', Path(__file__).with_name('zen-smoke.py'))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
MODS = ['download-prompt', 'glassflow', 'glassflow-library', 'groupflow', 'iconflow',
        'tab-router', 'tab-unloader', 'zen-turbo', 'mediaflow', 'peekflow']


def check(m, root, sine, profile, output, restarted=False):
    m.script('return gZenStartup.promiseInitialized.then(()=>true);')
    mappings = [['content', 'userscripts', sine.resolve().as_uri() + '/'],
                ['content', 'sine', (profile / 'chrome/sine-mods').as_uri() + '/'],
                ['content', 'locales', (sine.parent / 'locales').resolve().as_uri() + '/']]
    m.script('window.settingsChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI(' + json.dumps((profile / 'chrome.manifest').as_uri()) + '),' + json.dumps(mappings) + ');return true;')
    m.script('''gBrowser.selectedTab=gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});return true;''')
    for _ in range(100):
        if m.script("return !!gBrowser.selectedBrowser.contentWindow?.document.getElementById('mainPrefPane');"):
            break
        time.sleep(.1)
    print(m.script('''return (async()=>{
      window.settingsWin=gBrowser.selectedBrowser.contentWindow;
      const w=settingsWin,d=w.document;
      L10nRegistry.getInstance().registerSources([new L10nFileSource('sine-locales','app',Services.locale.appLocalesAsLangTags,'chrome://locales/content/')]);
      d.l10n.addResourceIds(['en-US/sine-preferences.ftl']);
      window.settingsManager=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
      window.settingsUtils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
      window.settingsGuard=ChromeUtils.importESModule('chrome://sine/content/zz-download-prompt/sine-update-guard.sys.mjs');
      window.settingsRebuilds=0;settingsManager.rebuildMods=()=>{settingsRebuilds++;};
      await new Promise(r=>setTimeout(r,500));
      const main=d.getElementById('mainPrefPane');for(const child of main.children)child.hidden=true;
      const list=d.createElementNS('http://www.w3.org/1999/xhtml','div');list.id='sineModsList';main.append(list);
      const sheet=d.createElementNS('http://www.w3.org/1999/xhtml','link');sheet.rel='stylesheet';sheet.href='chrome://userscripts/content/styles/settings.css';d.head.append(sheet);
      await settingsManager.loadMods(w);
      for(let i=0;i<100&&!d.querySelector('#zzpeek-last-view moz-toggle');i++)await new Promise(r=>setTimeout(r,50));
      await new Promise(r=>setTimeout(r,250));
      return {cards:d.querySelectorAll('.sineItem').length,rows:d.querySelectorAll('.zzsettings-row').length,toggles:d.querySelectorAll('.zzsettings-boolean moz-toggle').length,errors:(Services.console.getMessageArray()||[]).map(m=>m.message).filter(s=>/Error|exception/i.test(s)).slice(-8)};
    })();'''), flush=True)
    if restarted:
        result=m.script("""const d=settingsWin.document;return {
          restartedBoolean:Services.prefs.getBoolPref('zzgroup.enabled')===false&&d.querySelector('#zzgroup-enabled moz-toggle').pressed===false,
          restartedOpacity:Services.prefs.getStringPref('zzglass.pending.opacity')==='0.4'&&d.getElementById('zzglass-pending-opacity-control').value==='40%',
          restartedHiddenValue:Services.prefs.getStringPref('zzglass.unselected.tint')==='37%'&&d.getElementById('zzglass-unselected-tint-control').value==='37%'&&d.getElementById('zzglass-unselected-tint').style.display==='none',
          restartedPage:Services.prefs.getStringPref('zzglass.ui.page')==='tabs'&&Services.prefs.getStringPref('zzglass.ui.tab-state')==='hover'
        };""")
        result['restartedHoverHelp']=m.script("""return (async()=>{const d=settingsWin.document,dialog=d.querySelector('[mod-id="zz-groupflow"] dialog');
          dialog.showModal();await new Promise(r=>setTimeout(r,400));d.querySelector('#zzgroup-enabled moz-toggle').focus();
          const tip=d.querySelector('#zzgroup-enabled .zzsettings-tooltip:popover-open'),shown=!!tip&&tip.textContent===d.getElementById('zzgroup-enabled-help').textContent;
          dialog.close();return shown;})();""")
        print('restart',result,flush=True);assert all(result.values()),result
        return result
    result = m.script('''return (async()=>{
      const d=settingsWin.document,pause=()=>new Promise(r=>setTimeout(r,100));
      const row=p=>d.getElementById(p.replaceAll('.','-'));
      const visible=p=>settingsWin.getComputedStyle(row(p)).display!=='none';
      const set=(p,v)=>Services.prefs[typeof v==='boolean'?'setBoolPref':typeof v==='number'?'setIntPref':'setStringPref'](p,v);
      const result={allMenus:d.querySelectorAll('.zzsettings-dialog').length===10,booleans:d.querySelectorAll('.zzsettings-boolean moz-toggle').length};
      const card=d.querySelector('[mod-id="zz-groupflow"]'),dialog=card.querySelector('dialog');
      dialog.showModal();await pause();
      const toggle=row('zzgroup.enabled').querySelector('moz-toggle');await toggle.updateComplete;
      result.toggleNative=!!toggle.buttonEl&&toggle.buttonEl.getAttribute('aria-pressed')===String(toggle.pressed)&&!!toggle.labelEl.textContent.trim();
      result.defaultAnnotation=row('zzgroup.enabled').textContent.includes('Default: On');
      const start=Services.prefs.getBoolPref('zzgroup.enabled');let writes=0;const obs={observe(){writes++;}};
      Services.prefs.addObserver('zzgroup.enabled',obs);
      toggle.buttonEl.click();await pause();result.pointerOneWrite=writes===1&&toggle.pressed===!start;
      toggle.labelEl.click();await pause();result.labelOneWrite=writes===2&&toggle.pressed===start;
      toggle.disabled=true;await toggle.updateComplete;toggle.buttonEl.click();toggle.labelEl.click();await pause();result.disabledNoWrite=writes===2;
      toggle.disabled=false;await toggle.updateComplete;
      Services.prefs.removeObserver('zzgroup.enabled',obs);
      set('zzgroup.enabled',false);await pause();result.externalSync=toggle.pressed===false&&toggle.buttonEl.getAttribute('aria-pressed')==='false';
      set('zzgroup.enabled',true);await pause();
      const header=card.querySelector('.sineItemPreferenceToggle'),configure=card.querySelector('.sineItemConfigureButton');
      header.pressed=false;await header.updateComplete;result.configureOff=settingsWin.getComputedStyle(configure).display==='none';
      for(const t of card.querySelectorAll('.zzsettings-boolean moz-toggle')){t.pressed=false;await t.updateComplete;}
      header.pressed=true;await header.updateComplete;result.configureOn=settingsWin.getComputedStyle(configure).display!=='none';
      dialog.close();
      set('zzglass.ui.page','colour');set('zzglass.color.source',0);set('zzglass.color.fallback',1);
      result.customFallback=visible('zzglass.color.custom');result.sharedSecondColour=visible('zzglass.color.secondary');
      set('zzglass.ui.page','tabs');set('zzglass.ui.tab-state','selected');set('zzglass.selected.enabled',true);
      set('zzglass.selected.end-mode',2);result.endTint2=visible('zzglass.selected.end-tint');
      set('zzglass.selected.end-mode',3);result.endTint3=!visible('zzglass.selected.end-tint');
      result.statePicker=visible('zzglass.selected.enabled')&&!visible('zzglass.unselected.enabled');
      set('zzglass.ui.page','all');result.everything=visible('zzglass.unselected.enabled');
      set('zzgroup.ui.page','lines');set('zzgroup.connector',5);set('zzgroup.line-shape',0);
      result.flowStraight=visible('zzgroup.curve-weight')&&visible('zzgroup.curve-amplitude');
      set('zzgroup.connector',1);set('zzgroup.line-shape',7);result.curvedShape=visible('zzgroup.curve-weight');
      set('zzrouter.enabled',false);set('zzrouter.section-icons',true);result.pictureExclusions=visible('zzrouter.auto-path-mode')&&visible('zzrouter.auto-path-domains');
      set('zzpeek.show',true);set('zzpeek.place',0);result.nativeGap=!visible('zzpeek.gap');set('zzpeek.place',1);result.placedGap=visible('zzpeek.gap');
      set('zzpeek.pictures',false);result.noPictureLastView=!visible('zzpeek.last-view');
      for(const [p,v,shown] of [['zzglass.pending.opacity','0.62','62%'],['zzgroup.collapsed-opacity','0.75','75%'],['zzgroup.marker-opacity','0.85','85%'],['zzlib.card.gradient','1','100%'],['zzrouter.nexus-banner-opacity','25','25%']]){
        set(p,v);result[p]=row(p).querySelector('input').value===shown&&Services.prefs.getStringPref(p)===v;
      }
      const input=row('zzglass.pending.opacity').querySelector('input');input.value='40%';input.dispatchEvent(new settingsWin.Event('change'));result.opacityEdit=Services.prefs.getStringPref('zzglass.pending.opacity')==='0.4';
      result.labels=[...d.querySelectorAll('.zzsettings-row input,.zzsettings-row select,.zzsettings-row textarea')].every(c=>c.getAttribute('aria-labelledby')&&c.getAttribute('aria-describedby'));
      const ids=[...d.querySelectorAll('.sineItem [id]')].map(n=>n.id).filter(id=>id!=='sineItemContentHeader');result.uniqueIDs=new Set(ids).size===ids.length;
      result.unrelatedGuard=settingsGuard.fixSettingsConditions(settingsManager,settingsUtils)===false;
      set('zzglass.ui.page','colour');d.querySelector('[mod-id="zz-glassflow"] dialog').showModal();await new Promise(r=>setTimeout(r,500));
      const ds=settingsWin.getComputedStyle(d.querySelector('[mod-id="zz-glassflow"] dialog'));
      window.settingsAppearance={opacity:ds.opacity,background:ds.backgroundColor,filter:ds.filter,animation:ds.animation,body:settingsWin.getComputedStyle(d.body).opacity};
      return result;
    })();''')
    print(json.dumps(result, indent=2), flush=True)
    print(m.script("return settingsAppearance;"),flush=True)
    if output:
        output.mkdir(parents=True, exist_ok=True)
        m.shot().save(output / 'native-settings-initial.png')
    assert result['booleans'] == sum(sum(r.get('type') == 'checkbox' for r in json.loads((root / mod / 'preferences.json').read_text())) for mod in MODS), result
    assert all(v for v in result.values()), result
    result.update(extended(m, root, output))
    return result


def extended(m, root, output):
    result = {}
    m.script("window.settingsExpectedRows=settingsWin.document.querySelectorAll('.zzsettings-row').length;window.settingsExpectedBooleans=settingsWin.document.querySelectorAll('.zzsettings-boolean').length;return true;")
    handles=m.call('WebDriver:GetWindowHandles')
    m.call('WebDriver:SwitchToWindow',{'handle':handles[-1]})
    m.script("""return (async()=>{
      const d=settingsWin.document;d.querySelector('dialog[open]').close();
      Services.prefs.setStringPref('zzgroup.ui.page','headers');
      window.settingsDialog=d.querySelector('[mod-id="zz-groupflow"] dialog');settingsDialog.showModal();
      window.settingsToggle=d.querySelector('#zzgroup-enabled moz-toggle');settingsToggle.pressed=true;await settingsToggle.updateComplete;
      window.settingsWrites=0;window.settingsWriteObserver={observe(){settingsWrites++;}};Services.prefs.addObserver('zzgroup.enabled',settingsWriteObserver);
      settingsToggle.focus();await new Promise(r=>setTimeout(r,400));return true;
    })();""")
    m.call('Marionette:SetContext', {'value':'content'})
    m.call('WebDriver:PerformActions', {'actions':[{'type':'key','id':'settings-tab','actions':[
        {'type':'keyDown','value':'\ue008'},{'type':'keyDown','value':'\ue004'},{'type':'keyUp','value':'\ue004'},{'type':'keyUp','value':'\ue008'},
        {'type':'keyDown','value':'\ue004'},{'type':'keyUp','value':'\ue004'}]}]})
    m.call('WebDriver:ReleaseActions')
    for key, name in [(' ', 'space'), ('\ue007', 'enter')]:
        m.call('Marionette:SetContext', {'value': 'content'})
        m.call('WebDriver:PerformActions', {'actions': [{'type': 'key', 'id': 'settings-key', 'actions': [
            {'type': 'keyDown', 'value': key}, {'type': 'keyUp', 'value': key}]}]})
        m.call('WebDriver:ReleaseActions')
        time.sleep(.15)
        state=m.script("return {writes:settingsWrites,pressed:settingsToggle.pressed,stored:Services.prefs.getBoolPref('zzgroup.enabled'),focus:settingsToggle.buttonEl.matches(':focus-visible'),active:settingsWin.document.activeElement?.outerHTML.slice(0,100),shadow:settingsToggle.shadowRoot.activeElement?.outerHTML.slice(0,150)};")
        result[name]=state['writes']==(1 if name=='space' else 2) and state['pressed']==state['stored'] and state['focus']
        assert result[name], (name,state)
    for target in ['button', 'label', 'hitArea', 'description']:
        point=m.script("""const t=settingsToggle,e="""+json.dumps(target)+"""==='label'?t.labelEl:"""+json.dumps(target)+"""==='description'?t.querySelector('.zzsettings-default'):t.buttonEl;
          const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2+("""+json.dumps(target)+"""==='hitArea'?20:0)),before:settingsWrites};""")
        m.call('Marionette:SetContext', {'value':'content'})
        m.call('WebDriver:PerformActions', {'actions':[{'type':'pointer','id':'settings-mouse','parameters':{'pointerType':'mouse'},'actions':[
            {'type':'pointerMove','duration':0,'x':point['x'],'y':point['y']},{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}]}]})
        m.call('WebDriver:ReleaseActions');time.sleep(.15)
        after=m.script("return {writes:settingsWrites,pressed:settingsToggle.pressed,stored:Services.prefs.getBoolPref('zzgroup.enabled')};")
        result['trusted'+target]=after['writes']==point['before']+(target!='description') and after['pressed']==after['stored']
        assert result['trusted'+target], (target,point,after)
    accessibility=m.script("""return (async()=>{
      window.settingsA11y=Cc['@mozilla.org/accessibilityService;1'].getService(Ci.nsIAccessibilityService);
      await new Promise(r=>setTimeout(r,300));
      const a=settingsA11y.getAccessibleFor(settingsToggle.buttonEl),state={},extra={};a.getState(state,extra);
      return {name:a.name,description:a.description,role:settingsA11y.getStringRole(a.role),pressed:!!(state.value&Ci.nsIAccessibleStates.STATE_PRESSED),stored:Services.prefs.getBoolPref('zzgroup.enabled'),dialog:settingsA11y.getAccessibleFor(settingsDialog)?.name};
    })();""")
    result['accessibleState']=bool(accessibility['name'] and accessibility['description'] and accessibility['dialog']) and accessibility['pressed']==accessibility['stored']
    print('accessibility',accessibility,flush=True)
    checks=m.script("""return (async()=>{
      Services.prefs.removeObserver('zzgroup.enabled',settingsWriteObserver);
      const d=settingsWin.document,pause=()=>new Promise(r=>setTimeout(r,300));
      Services.prefs.clearUserPref('zzgroup.enabled');await pause();
      const result={reset:settingsToggle.pressed===true};
      settingsDialog.close();settingsDialog.showModal();await pause();result.reopen=settingsToggle.pressed===true;
      settingsDialog.close();
      window.settingsAccessibleCount=0;const unnamed=[];
      for(const dialog of d.querySelectorAll('.zzsettings-dialog')){dialog.showModal();await pause();result[dialog.getAttribute('aria-labelledby')]=dialog.open;
        for(const row of dialog.querySelectorAll('.zzsettings-row')){if(!row.getClientRects().length)continue;const c=row.querySelector('moz-toggle,input,select,textarea'),a=settingsA11y.getAccessibleFor(c.buttonEl||c);settingsAccessibleCount++;if(!a?.name||!a?.description)unnamed.push({id:row.id,name:a?.name,description:a?.description});}
        dialog.close();}
      result.nativeControlNames=unnamed.length===0;window.settingsUnnamed=unnamed;
      Services.prefs.setStringPref('zzglass.ui.page','');result.emptyPage=d.getElementById('zzglass-unselected-enabled').style.display==='flex';
      Services.prefs.setStringPref('zzglass.ui.page','unknown-saved');
      const unknown=d.getElementById('zzglass-ui-page-control');result.unknownPreserved=unknown.selectedOptions[0].textContent==='Saved value: unknown-saved'&&Services.prefs.getStringPref('zzglass.ui.page')==='unknown-saved';
      const input=d.getElementById('zzglass-pending-opacity-control'),raw=Services.prefs.getStringPref('zzglass.pending.opacity');
      input.value='101%';input.dispatchEvent(new settingsWin.Event('change'));result.invalidOpacity=Services.prefs.getStringPref('zzglass.pending.opacity')===raw&&input.getAttribute('aria-invalid')==='true';
      const old=d.querySelector('#zzgroup-enabled moz-toggle');window.retiredSettings=new WeakRef(old.closest('dialog'));
      await settingsManager.loadMods(settingsWin);await pause();
      Services.prefs.setBoolPref('zzgroup.enabled',false);await pause();result.detachedRetired=old.pressed===true&&!d.contains(old);
      result.rebuiltSync=d.querySelector('#zzgroup-enabled moz-toggle').pressed===false;
      let writes=0;const obs={observe(){writes++;}};Services.prefs.addObserver('zzgroup.enabled',obs);
      d.querySelector('#zzgroup-enabled moz-toggle').click();await pause();result.rebuiltOneWrite=writes===1;Services.prefs.removeObserver('zzgroup.enabled',obs);
      result.singleCopies=d.querySelectorAll('.zzsettings-row').length===settingsExpectedRows&&d.querySelectorAll('.zzsettings-boolean').length===settingsExpectedBooleans;
      const writesObserver={observe(){writes++;}};writes=0;Services.prefs.addObserver('zz',writesObserver);
      await settingsManager.loadMods(settingsWin);await pause();Services.prefs.removeObserver('zz',writesObserver);
      result.noPresentationWrites=writes===0;
      const select=d.getElementById('zzpeek-place-control');let selectWrites=0;const selectObserver={observe(){selectWrites++;}};Services.prefs.addObserver('zzpeek.place',selectObserver);
      select.value='4';select.dispatchEvent(new settingsWin.Event('change'));Services.prefs.removeObserver('zzpeek.place',selectObserver);
      result.dropdownTypeAndBinding=selectWrites===1&&Services.prefs.getPrefType('zzpeek.place')===Services.prefs.PREF_INT&&Services.prefs.getIntPref('zzpeek.place')===4;
      Services.prefs.setIntPref('zzpeek.place',2);await pause();result.dropdownExternalSync=select.value==='2';
      await settingsManager.toggleTheme(await settingsUtils.getMods(),'zz-groupflow');await settingsManager.loadMods(settingsWin);await pause();
      result.disableRetires=!d.querySelector('#zzgroup-enabled');
      await settingsManager.toggleTheme(await settingsUtils.getMods(),'zz-groupflow');await settingsManager.loadMods(settingsWin);await pause();
      result.enableRestores=!!d.querySelector('#zzgroup-enabled moz-toggle')&&d.querySelectorAll('.zzsettings-row').length===settingsExpectedRows;
      window.settingsDialog=null;window.settingsToggle=null;return result;
    })();""")
    result.update(checks)
    print('native accessible controls',m.script('return {count:settingsAccessibleCount,unnamed:settingsUnnamed};'),flush=True)
    result['retiredDialogCollected']=collected(m,'retiredSettings')
    # Use the shipped Router validator in the browser; no copied grammar.
    m.script("Services.prefs.setBoolPref('zzrouter.enabled',false);return true;")
    m.script((root/'tab-router/tab-router.uc.js').read_text()+'\nreturn true;')
    result.update(m.script(r"""return (async()=>{
      for(let i=0;i<100&&!window.TabRouter;i++)await new Promise(r=>setTimeout(r,50));
      const d=settingsWin.document,input=d.getElementById('zzrouter-rules-control'),before=Services.prefs.getStringPref('zzrouter.rules');
      input.value='broken rule';input.dispatchEvent(new settingsWin.Event('change',{bubbles:true}));
      const invalid=Services.prefs.getStringPref('zzrouter.rules')===before;
      input.value='example.com > Examples\nexample.org > Work / Research';input.dispatchEvent(new settingsWin.Event('change',{bubbles:true}));
      const valid=Services.prefs.getStringPref('zzrouter.rules')===input.value;
      Services.prefs.setStringPref('zzrouter.rules',before);
      return {invalidRules:invalid,validRules:valid,nativeMultiline:input.localName==='textarea'};
    })();"""))
    print('extended',json.dumps(result,indent=2),flush=True)
    assert all(result.values()),result
    result.update(hover_checks(m, output))
    result.update(layout_checks(m, output))
    result.update(window_checks(m))
    return result


def collected(m, name):
    # Drain native deferred deletion/caches before testing reachability.
    m.script('return new Promise(resolve=>Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager).minimizeMemoryUsage(()=>resolve(true)));')
    for _ in range(20):
        m.script('Cu.forceGC();Cu.forceCC();Cu.forceGC();return true;')
        time.sleep(.15)
        if m.script('return !'+name+'.deref();'):return True
    return False


def hover_checks(m, output):
    result={}
    def pointer(x,y,click=False):
        m.call('Marionette:SetContext',{'value':'content'})
        actions=[{'type':'pointerMove','duration':0,'x':round(x),'y':round(y)}]
        if click:actions += [{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}]
        m.call('WebDriver:PerformActions',{'actions':[{'type':'pointer','id':'hover-help','parameters':{'pointerType':'mouse'},'actions':actions}]})
        m.call('WebDriver:ReleaseActions');time.sleep(.1)
    m.script("""Services.prefs.setBoolPref('zzgroup.enabled',true);Services.prefs.setStringPref('zzgroup.ui.page','headers');
      settingsWin.document.querySelector('[mod-id="zz-groupflow"] dialog').showModal();
      const active=settingsWin.document.activeElement;(active?.shadowRoot?.activeElement||active)?.blur();return true;""")
    pointer(1,1)
    resting=m.script("""const d=settingsWin.document,h=d.querySelector('#zzgroup-enabled .zzsettings-help');
      return {open:!!d.querySelector('.zzsettings-tooltip:popover-open'),height:h.getBoundingClientRect().height,clip:settingsWin.getComputedStyle(h).clipPath};""")
    result['helpHiddenAtRest']=not resting['open'] and 0<resting['height']<=1.1 and resting['clip']=='inset(50%)'
    print('resting help',resting,flush=True)
    for key in ['zzgroup-enabled','zzgroup-ui-page','zzgroup-header-tint']:
        point=m.script("""const row=settingsWin.document.getElementById("""+json.dumps(key)+""");row.scrollIntoView({block:'center'});
          const label=row.querySelector('.zzsettings-name')||row.querySelector('moz-toggle').labelEl,b=label.getBoundingClientRect();return {x:b.x+8,y:b.y+b.height/2};""")
        pointer(point['x'],point['y'])
        state=m.script("""const d=settingsWin.document,row=d.getElementById("""+json.dumps(key)+"""),tip=row.querySelector('.zzsettings-tooltip:popover-open'),c=row.querySelector('moz-toggle,input,select');
          const a=settingsA11y.getAccessibleFor(c.buttonEl||c);return {shown:!!tip&&tip.textContent===row.querySelector('.zzsettings-help').textContent,accessible:a.description.includes(row.querySelector('.zzsettings-help').textContent),count:d.querySelectorAll('.zzsettings-tooltip').length};""")
        result['hover-'+key]=state['shown'] and state['accessible'] and state['count']==1
        assert result['hover-'+key],state
        if key=='zzgroup-enabled':
            point=m.script("""const b=settingsWin.document.querySelector('.zzsettings-tooltip:popover-open').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,value:Services.prefs.getBoolPref('zzgroup.enabled')};""")
            pointer(point['x'],point['y'],True)
            result['hoverableHelpNoToggle']=m.script("return !!settingsWin.document.querySelector('.zzsettings-tooltip:popover-open')&&Services.prefs.getBoolPref('zzgroup.enabled')===true;")
            if output:m.shot().save(output/'native-settings-hover.png')
        pointer(1,1)
    m.script("settingsWin.document.getElementById('zzgroup-header-tint-control').focus();return true;")
    result['focusHelp']=m.script("return !!settingsWin.document.querySelector('#zzgroup-header-tint .zzsettings-tooltip:popover-open');")
    m.call('Marionette:SetContext',{'value':'content'})
    m.call('WebDriver:PerformActions',{'actions':[{'type':'key','id':'help-escape','actions':[{'type':'keyDown','value':'\ue00c'},{'type':'keyUp','value':'\ue00c'}]}]})
    m.call('WebDriver:ReleaseActions');time.sleep(.1)
    result['escapeHelpKeepsDialog']=m.script("return !settingsWin.document.querySelector('.zzsettings-tooltip:popover-open')&&!!settingsWin.document.querySelector('dialog[open]');")
    result['dismissedHelpAccessible']=m.script("""const d=settingsWin.document,c=d.getElementById('zzgroup-header-tint-control');return settingsA11y.getAccessibleFor(c).description.includes(d.getElementById('zzgroup-header-tint-help').textContent);""")
    m.script("settingsWin.document.querySelector('dialog[open]').close();return true;")
    result['closedHelpRetired']=m.script("return !settingsWin.document.querySelector('.zzsettings-tooltip');")
    print('hover',result,flush=True);assert all(result.values()),result
    return result


def layout_checks(m, output):
    result={}
    # Open the shortest settings page containing both checked and unchecked switches.
    m.script("""Services.prefs.setBoolPref('zzgroup.enabled',true);Services.prefs.setStringPref('zzgroup.ui.page','headers');
      settingsWin.document.querySelector('[mod-id="zz-groupflow"] dialog').showModal();return true;""")
    for mode in ['light','dark','forced','reduced','zoom','narrow']:
        m.script("return (async()=>{const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');const theme=await AddonManager.getAddonByID('firefox-compact-"+('dark' if mode=='dark' else 'light')+"@mozilla.org');if(theme)await theme.enable();return !!theme;})();")
        m.script("Services.prefs.setIntPref('ui.systemUsesDarkTheme',"+str(int(mode=='dark'))+");Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override',"+str(0 if mode=='dark' else 1)+");Services.prefs.setIntPref('browser.display.document_color_use',"+str(2 if mode=='forced' else 0)+");Services.prefs.setIntPref('ui.prefersReducedMotion',"+str(int(mode=='reduced'))+");gBrowser.selectedBrowser.browsingContext.fullZoom="+str(2 if mode=='zoom' else 1)+";return true;")
        if mode=='narrow':
            # Fit actual browser content to 320 CSS px; do not use an HTML preview.
            m.call('WebDriver:SetWindowRect',{'width':520,'height':950})
            time.sleep(.25)
            delta=m.script('return 320-settingsWin.innerWidth;')
            m.call('WebDriver:SetWindowRect',{'width':520+delta,'height':950})
        time.sleep(.45)
        data=m.script(r"""const w=settingsWin,d=w.document,dialog=d.querySelector('dialog[open]'),ds=w.getComputedStyle(dialog);
          const canvas=d.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
          const rgb=s=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data];c[3]/=255;return c;},solid=(s,bg)=>{const c=rgb(s),a=c[3]??1;return c.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));},lum=s=>s.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
          const contrast=(a,b)=>{const bg=solid(b,rgb(ds.backgroundColor));a=lum(solid(a,bg));b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
          const switches=[...dialog.querySelectorAll('moz-toggle')].filter(t=>t.getClientRects().length);
          const measures=switches.map(t=>{const b=t.buttonEl,bs=w.getComputedStyle(b),dot=w.getComputedStyle(b,'::before');return {pressed:t.pressed,colors:[bs.backgroundColor,bs.borderColor,dot.backgroundColor],dot:contrast(dot.backgroundColor,bs.backgroundColor),boundary:Math.max(contrast(bs.borderColor,ds.backgroundColor),contrast(bs.backgroundColor,ds.backgroundColor)),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,transition:dot.transitionDuration};});
          const bad=[...dialog.querySelectorAll('.zzsettings-row')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2).map(e=>e.id);
          return {width:w.innerWidth,dialog:dialog.getBoundingClientRect().toJSON(),overflow:dialog.scrollWidth>dialog.clientWidth+2,bad,
            textContrast:contrast(ds.color,ds.backgroundColor),switches:measures,forced:w.matchMedia('(forced-colors: active)').matches,reduced:w.matchMedia('(prefers-reduced-motion: reduce)').matches,dark:w.matchMedia('(prefers-color-scheme: dark)').matches,animation:ds.animationName};""")
        print(mode,json.dumps(data),flush=True)
        result[mode]=not data['overflow'] and not data['bad'] and data['textContrast']>=4.5 and all(t['dot']>=3 and t['boundary']>=3 for t in data['switches'])
        if mode=='narrow':result[mode]=result[mode] and data['width']==320
        if mode=='forced':result[mode]=result[mode] and data['forced']
        if mode=='dark':result[mode]=result[mode] and data['dark']
        if mode=='reduced':result[mode]=result[mode] and data['reduced'] and data['animation']=='none' and all(t['transition']=='0s' for t in data['switches'])
        m.script("""const d=settingsWin.document,rows=[...d.querySelectorAll('dialog[open] .zzsettings-described')].filter(r=>r.getClientRects().length);
          window.edgeHelpRow=rows.at(-1);edgeHelpRow.scrollIntoView({block:'end'});d.activeElement?.blur();return true;""")
        time.sleep(.1)
        m.script("edgeHelpRow.querySelector('moz-toggle,input,select,textarea').focus({preventScroll:true});return true;")
        time.sleep(.1)
        result[mode+'HelpBounds']=m.script("""const w=settingsWin,t=w.document.querySelector('.zzsettings-tooltip:popover-open');if(!t)return false;
          const b=t.getBoundingClientRect();return b.left>=0&&b.top>=0&&b.right<=w.innerWidth&&b.bottom<=w.innerHeight&&t.scrollWidth<=t.clientWidth+2;""")
        if output:m.shot().save(output/f'native-settings-{mode}.png')
    assert all(result.values()),result
    m.call('WebDriver:SetWindowRect',{'width':1366,'height':768})
    m.script("settingsWin.document.querySelector('dialog[open]').close();return true;")
    return result


def window_checks(m):
    result=m.script(r"""return (async()=>{
      const pause=()=>new Promise(r=>setTimeout(r,100));
      const browser=OpenBrowserWindow();
      for(let i=0;i<100&&!browser.gBrowserInit?.delayedStartupFinished;i++)await pause();await browser.gZenStartup.promiseInitialized;
      browser.gBrowser.selectedTab=browser.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
      let w;
      for(let i=0;i<100;i++){w=browser.gBrowser.selectedBrowser.contentWindow;if(w?.document.getElementById('mainPrefPane'))break;await pause();}
      const list=w.document.createElementNS('http://www.w3.org/1999/xhtml','div');list.id='sineModsList';w.document.getElementById('mainPrefPane').append(list);
      await settingsManager.loadMods(w);for(let i=0;i<100&&!w.document.querySelector('#zzpeek-last-view moz-toggle');i++)await pause();await pause();
      const second=w.document.querySelector('#zzgroup-enabled moz-toggle'),first=settingsWin.document.querySelector('#zzgroup-enabled moz-toggle');
      Services.prefs.setBoolPref('zzgroup.enabled',false);await pause();
      const result={twoWindows:second.pressed===false&&first.pressed===false};window.retiredSecondSettings=new WeakRef(second.closest('dialog'));
      browser.close();await pause();
      Services.prefs.setBoolPref('zzgroup.enabled',true);await pause();result.closedWindowRetired=first.pressed===true&&second.pressed===false;
      Services.prefs.setBoolPref('zzgroup.enabled',false);Services.prefs.setStringPref('zzglass.ui.page','tabs');Services.prefs.setStringPref('zzglass.ui.tab-state','hover');Services.prefs.setStringPref('zzglass.unselected.tint','37%');Services.prefs.savePrefFile(null);
      return result;
    })();""")
    closed_collected=collected(m,'retiredSecondSettings')
    result['closedDialogCollected']=closed_collected
    print('windows',result,flush=True);assert all(result.values()),result
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zen',type=Path,required=True);parser.add_argument('--sine',type=Path,required=True);parser.add_argument('--output',type=Path)
    args=parser.parse_args();root=Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix='zen-settings-smoke-') as directory:
        profile=Path(directory);folder=profile/'chrome/sine-mods';folder.mkdir(parents=True)
        registry={}
        for mod in MODS:
            data=json.loads((root/mod/'theme.json').read_text());data.update(enabled=True,origin='store');registry[data['id']]=data
            (folder/data['id']).symlink_to(root/mod,target_is_directory=True)
        (folder/'mods.json').write_text(json.dumps(registry))
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'browser.aboutwelcome.enabled':False,'zen.welcome-screen.seen':True,'zen.welcome-screen.enabled':False,'sine.auto-update':False}
        (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()))
        reports=[]
        for launch in range(2):
            with (profile/f'browser-{launch}.log').open('w') as log:
                process=subprocess.Popen([str(args.zen.resolve()),'--headless','--no-remote','--profile',directory,'--marionette','--remote-allow-system-access','about:blank'],stdout=log,stderr=log)
                try:
                    for _ in range(100):
                        try:
                            with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                        except OSError:
                            if process.poll() is not None:raise RuntimeError((profile/f'browser-{launch}.log').read_text()[-3000:])
                            time.sleep(.2)
                    reports.append(check(smoke.Marionette(port),root,args.sine,profile,args.output,restarted=bool(launch)))
                finally:
                    process.terminate()
                    try:process.wait(timeout=5)
                    except subprocess.TimeoutExpired:process.kill();process.wait()
        if args.output:(args.output/'results.json').write_text(json.dumps(reports,indent=2)+'\n')
        print('Native settings assertions:',sum(len(r) for r in reports),flush=True)


if __name__=='__main__':main()
