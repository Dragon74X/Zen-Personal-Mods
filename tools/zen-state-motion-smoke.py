#!/usr/bin/env python3
"""Real Zen state paint/motion/actions check in a disposable profile (Pillow).
Uses production sheets/scripts and native tabs. No user profile access.
"""
import argparse, json, runpy, socket, subprocess, tempfile, time, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
Marionette=runpy.run_path(str(ROOT/'tools/zen-smoke.py'))['Marionette']
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--zen',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='zen-state-motion-') as d:
    profile=Path(d);folder=profile/'chrome/sine-mods';folder.mkdir(parents=True)
    registry={}
    for mod in ['glassflow','groupflow','tab-router']:
        theme=json.loads((ROOT/mod/'theme.json').read_text());theme.update(enabled=True,origin='store');registry[theme['id']]=theme
        (folder/theme['id']).symlink_to(ROOT/mod,target_is_directory=True)
    (folder/'mods.json').write_text(json.dumps(registry))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'browser.aboutwelcome.enabled':False,'zen.welcome-screen.seen':True,'zen.welcome-screen.enabled':False,'sine.auto-update':False,'ui.prefersReducedMotion':0,'zzrouter.enabled':False}
    (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k,v in prefs.items()))
    with (OUT/'browser.log').open('w') as log:
        process=subprocess.Popen([str(args.zen.resolve()),'--headless','--no-remote','--profile',d,'--marionette','--remote-allow-system-access','about:blank'],stdout=log,stderr=log)
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                except OSError:time.sleep(.2)
            m=Marionette(port);m.script('return gZenStartup.promiseInitialized.then(()=>true);');m.call('WebDriver:SetWindowRect',{'width':1280,'height':1000})
            m.script('window.motionChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup).registerChrome(Services.io.newURI('+json.dumps((profile/'chrome.manifest').as_uri())+'),'+json.dumps([['content','sine',folder.as_uri()+'/']])+');return true;')
            for mod in ['glassflow','groupflow']:
                defaults={r['property']:r['defaultValue'] for r in json.loads((ROOT/mod/'preferences.json').read_text()) if 'property' in r and 'defaultValue' in r}
                m.script('for(const [k,v] of Object.entries('+json.dumps(defaults)+'))Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')
                m.script('Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService).loadAndRegisterSheet(Services.io.newURI('+json.dumps((ROOT/mod/'userChrome.css').as_uri())+'),1);return true;')
                m.script('Services.scriptloader.loadSubScript('+json.dumps('chrome://sine/content/zz-'+mod+'/'+mod+'.uc.js')+',window);return true;')
            time.sleep(1)
            assert m.script("return !Services.prefs.getBoolPref('zzglass.motion.enabled');"), 'motion should start disabled'
            m.script("Services.prefs.setBoolPref('zzglass.motion.enabled',true);Services.scriptloader.loadSubScript('chrome://sine/content/zz-glassflow/glassflow.uc.js',window);return true;")
            assert m.script("return Services.prefs.getBoolPref('zzglass.motion.enabled');"), 'explicit opt-in should survive reload'
            print('INIT',m.script('return {group:!!window.Groupflow,motion:!!window.__zzglassInstance,css:getComputedStyle(document.documentElement).getPropertyValue("--zzg-motion-time"),editor:!!Groupflow.editGradient};'),flush=True)
            setup=m.script('''return (async()=>{
              const pause=ms=>new Promise(r=>setTimeout(r,ms));window.motionPause=pause;
              Services.prefs.setBoolPref('zen.view.sidebar-expanded',true);
              document.documentElement.setAttribute('zen-sidebar-expanded','true');
              window.motionOutside=gBrowser.selectedTab;
              window.motionTab=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});
              motionTab.setAttribute('label','Existing text settles in place');
              const t=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});
              window.motionGroup=gBrowser.addTabGroup([t],{label:'Motion group',insertBefore:t});
              Services.prefs.setBoolPref('zzgroup.subfolder.include-folders',true);
              Services.prefs.setBoolPref('zzgroup.subfolder.states',true);
              for(const state of ['selected','unselected','hover','pending']){
                Services.prefs.setBoolPref('zzglass.'+state+'.enabled',true);Services.prefs.setBoolPref('zzglass.'+state+'.rim',true);
                Services.prefs.setBoolPref('zzglass.'+state+'.sheen',true);
              }
              Services.prefs.setIntPref('zzglass.unselected.direction',0);Services.prefs.setIntPref('zzglass.hover.direction',1);
              Services.prefs.setStringPref('zzglass.unselected.tint','12%');Services.prefs.setStringPref('zzglass.hover.tint','60%');
              Services.prefs.setIntPref('zzglass.edges.hover-edge',1);Services.prefs.setBoolPref('zzglass.edges.enabled',true);
              await pause(600);Groupflow.refresh();await pause(100);
              return {tab:motionTab.getBoundingClientRect().toJSON(),header:motionGroup.labelContainerElement.outerHTML};
            })();''')
            (OUT/'setup.json').write_text(json.dumps(setup,indent=2));print('SETUP',setup['tab'],flush=True)
            results=m.script('''return (async()=>{
              const tab=motionTab,bg=tab.querySelector('.tab-background'),label=tab.querySelector('.tab-label'),icon=tab.querySelector('.tab-icon-stack');
              const read=()=>{const s=getComputedStyle(tab);return {a:s.getPropertyValue('--zzg-a'),dir:s.getPropertyValue('--zzg-dir'),image:getComputedStyle(bg).backgroundImage,shadow:getComputedStyle(bg).boxShadow};};
              const results=[];
              for(let profile=0;profile<5;profile++){
                Services.prefs.setIntPref('zzglass.motion.profile',profile);InspectorUtils.removePseudoClassLock(tab,':hover');gBrowser.selectedTab=motionOutside;await motionPause(650);
                const before=read();InspectorUtils.addPseudoClassLock(tab,':hover');await motionPause(60);const during=read();await motionPause(650);const after=read();
                const box=bg.getBoundingClientRect().toJSON(), ibox=icon.getBoundingClientRect().toJSON();
                gBrowser.selectedTab=tab;await motionPause(35);const moved=getComputedStyle(label).transform;await motionPause(450);const settled=getComputedStyle(label).transform;
                results.push({profile,before,during,after,moved,settled,boxStable:JSON.stringify(box)===JSON.stringify(bg.getBoundingClientRect().toJSON()),iconStable:JSON.stringify(ibox)===JSON.stringify(icon.getBoundingClientRect().toJSON())});
              }
              InspectorUtils.removePseudoClassLock(tab,':hover');
              Services.prefs.setBoolPref('zzglass.edges.enabled',false);await motionPause(650);const off=getComputedStyle(bg).boxShadow;
              Services.prefs.setBoolPref('zzglass.edges.enabled',true);
              gBrowser.selectedTab=motionOutside;await motionPause(400);gBrowser.selectedTab=tab;Services.prefs.setIntPref('ui.prefersReducedMotion',1);await motionPause(50);
              const reduced={transform:getComputedStyle(label).transform,animations:label.getAnimations().length};Services.prefs.setIntPref('ui.prefersReducedMotion',0);
              return {profiles:results,off,reduced};
            })();''')
            (OUT/'motion.json').write_text(json.dumps(results,indent=2));print('MOTION',[(r['profile'],r['moved'],r['settled']) for r in results['profiles']],flush=True)
            for row in results['profiles']:
                assert row['before']['image'] != row['during']['image'] != row['after']['image'], row
                assert row['moved']!='none' and row['settled']=='none' and row['boxStable'] and row['iconStable'],row
            assert results['reduced']['transform']=='none' and results['reduced']['animations']==0,results['reduced']
            # Freeze actual CSS transitions for repeatable before/mid/after pixels.
            m.script("Services.prefs.setIntPref('zzglass.motion.profile',1);gBrowser.selectedTab=motionOutside;InspectorUtils.removePseudoClassLock(motionTab,':hover');return true;");time.sleep(.65)
            box=m.script("return motionTab.querySelector('.tab-background').getBoundingClientRect().toJSON();")
            def pixels(name):
                im=m.shot();crop=im.crop((round(box['x']),round(box['y']),round(box['right']),round(box['bottom'])));crop.save(OUT/(name+'.png'));return hashlib.sha256(crop.tobytes()).hexdigest()
            hover_hashes=[pixels('hover-before')]
            close_before=m.script("return motionTab.querySelector('.tab-close-button').getBoundingClientRect().toJSON();")
            m.script("return (async()=>{InspectorUtils.addPseudoClassLock(motionTab,':hover');await motionPause(70);motionTab.getAnimations({subtree:true}).forEach(a=>a.pause());return true;})();")
            hover_hashes.append(pixels('hover-middle'))
            m.script("motionTab.getAnimations({subtree:true}).forEach(a=>a.play());return true;");time.sleep(.65)
            hover_hashes.append(pixels('hover-after'))
            assert len(set(hover_hashes))==3,hover_hashes
            assert close_before==m.script("return motionTab.querySelector('.tab-close-button').getBoundingClientRect().toJSON();"),'Close target moved'
            repeat=m.script("return (async()=>{gBrowser.selectedTab=motionTab;await motionPause(30);gBrowser.selectedTab=motionOutside;gBrowser.selectedTab=motionTab;await motionPause(500);return getComputedStyle(motionTab.querySelector('.tab-label')).transform;})();")
            assert repeat=='none',repeat
            light_hashes=[]
            for light in range(4):
                m.script(f"Services.prefs.setIntPref('zzglass.motion.light',{light});return true;");time.sleep(.65)
                light_hashes.append(pixels(f'light-{light}'))
            assert len(set(light_hashes))==4,light_hashes
            (OUT/'pixels.json').write_text(json.dumps({'hover':hover_hashes,'lights':light_hashes},indent=2))
            m.script("Services.prefs.setBoolPref('zzglass.motion.enabled',false);Services.prefs.setBoolPref('zzglass.edges.calculated',true);Services.prefs.setStringPref('zzglass.edges.selected-thickness','3px');Services.prefs.setStringPref('zzglass.edges.selected-ring-width','2px');return true;")
            hashes=[]
            for surface in range(5):
                m.script(f"Services.prefs.setIntPref('zzglass.edges.surface',{surface});return true;");time.sleep(.1)
                box=m.script("return motionTab.querySelector('.tab-background').getBoundingClientRect().toJSON();")
                im=m.shot();im.save(OUT/f'surface-{surface}.png');crop=im.crop((round(box['x']),round(box['y']),round(box['right']),round(box['bottom'])))
                hashes.append(hashlib.sha256(crop.tobytes()).hexdigest())
            assert len(set(hashes))==5,hashes
            actions=m.script('''return (async()=>{
              const checks={};
              const group=motionGroup,tab=group.tabs[0];
              Groupflow.editGradient(group);
              let editor=document.querySelector('.zzgf-gradient-editor'),input=editor.querySelector('textarea');
              const gradient='linear-gradient(125deg, rgb(20 80 160) 0%, rgb(200 40 90) 45%, rgb(40 160 80) 100%)';
              input.value=gradient;input.dispatchEvent(new Event('input'));editor.querySelector('form').requestSubmit();await motionPause(100);
              checks.gradientSave=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupColors'))[group.id]===gradient&&!document.querySelector('.zzgf-gradient-editor');
              Groupflow.editGradient(group);editor=document.querySelector('.zzgf-gradient-editor');editor.querySelector('textarea').value='linear-gradient(red, blue)';editor.close();
              checks.gradientCancel=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupColors'))[group.id]===gradient;
              const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>');
              gBrowser.setIcon(tab,svg);checks.sample=await Groupflow.resampleColor(group);
              checks.sampleValue=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupColors'))[group.id]?.favicon==='rgb(255 0 0)';
              const selected=gBrowser.selectedTab,folder=Groupflow.convert(group);await motionPause(150);
              checks.toFolder=!!folder?.isZenFolder&&folder.tabs.includes(tab)&&tab.pinned&&folder.label==='Motion group'&&gBrowser.selectedTab===selected;
              const restored=Groupflow.convert(folder);await motionPause(150);
              checks.toGroup=!!restored&&!restored.isZenFolder&&restored.tabs.includes(tab)&&!tab.pinned&&gBrowser.selectedTab===selected;
              checks.convertKeepsColour=JSON.parse(SessionStore.getCustomWindowValue(window,'tabGroupColors'))[restored.id]?.favicon==='rgb(255 0 0)';
              const library=customElements.get('zen-library');library.toggle('spaces');await motionPause(800);
              const copy=document.querySelector(`zen-library tab-group[id="${restored.id}-copy"]`);
              checks.libraryCopy=!!copy;
              if(copy){
                copy.labelContainerElement.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,screenX:300,screenY:200}));await motionPause(80);
                const menu=document.getElementById('zzgf-library-actions');checks.libraryActions=menu?.querySelectorAll('menuitem').length>=2;
                menu?.hidePopup();
              }
              library.close();await motionPause(300);
              // State rim ownership and Essential inner/outer geometry (computed checks).
              InspectorUtils.removePseudoClassLock(motionTab,':hover');
              Services.prefs.setBoolPref('zzglass.edges.calculated',false);
              const bg=motionTab.querySelector('.tab-background');
              for(const state of ['selected','unselected','hover','pending']){
                gBrowser.selectedTab=state==='selected'?motionTab:motionOutside;
                motionTab.toggleAttribute('pending',state==='pending');
                if(state==='hover')InspectorUtils.addPseudoClassLock(motionTab,':hover');else InspectorUtils.removePseudoClassLock(motionTab,':hover');
                Services.prefs.setIntPref('zzglass.edges.'+state+'-edge',3);
                Services.prefs.setStringPref('zzglass.edges.'+state+'-thickness','7px');
                Services.prefs.setStringPref('zzglass.edges.'+state+'-ring-width','3px');
                await motionPause(30);
                const shadow=getComputedStyle(bg).boxShadow;
                const lengths=[...shadow.matchAll(/(-?[\d.e+-]+)px/g)].map(m=>Number(m[1]));
                checks[state+'Rim']=Math.abs(lengths[0]+7)<.001&&Math.abs(lengths[1])<.001&&lengths[2]===0&&lengths[3]===0&&shadow.includes('0px 0px 0px 3px');
                Services.prefs.setBoolPref('zzglass.'+state+'.enabled',false);await motionPause(30);
                checks[state+'Master']=!getComputedStyle(bg).boxShadow.includes(' -7px ');
                Services.prefs.setBoolPref('zzglass.'+state+'.enabled',true);
              }
              motionTab.removeAttribute('pending');InspectorUtils.removePseudoClassLock(motionTab,':hover');gBrowser.selectedTab=motionTab;
              Services.prefs.setBoolPref('zen.theme.essentials-favicon-bg',true);
              Services.prefs.setBoolPref('zzglass.corner.disable-platform',false);
              Services.prefs.setIntPref('zzglass.corner.mode',1);Services.prefs.setIntPref('zzglass.corner.essentials',2);
              Services.prefs.setStringPref('zzglass.tabs.roundness','4px');motionTab.setAttribute('zen-essential','true');await motionPause(30);
              checks.essentialShape=getComputedStyle(bg).cornerShape==='superellipse(2)'&&getComputedStyle(bg,'::before').cornerShape==='superellipse(2)';
              checks.essentialRadius=getComputedStyle(bg).borderTopLeftRadius==='4px'&&getComputedStyle(bg,'::before').borderTopLeftRadius==='2px';
              motionTab.removeAttribute('zen-essential');
              // Follow Zen consumes its native radius once, regardless of old Auto compensation.
              Services.prefs.setIntPref('zzglass.corner.radius-source',1);Services.prefs.setIntPref('zzglass.corner.radius-mode',1);
              Services.prefs.setIntPref('zzgroup.corner.radius-source',1);Services.prefs.setIntPref('zzgroup.corner.radius-mode',1);
              const probe=document.createElement('span');probe.style.cssText='position:absolute;display:block;width:var(--border-radius-medium)';document.documentElement.append(probe);
              await motionPause(100);const radius=parseFloat(getComputedStyle(probe).width);probe.remove();
              checks.nativeRadius=parseFloat(getComputedStyle(motionTab.querySelector('.tab-background')).borderTopLeftRadius)===radius;
              checks.folderRadius=parseFloat(getComputedStyle(restored.labelContainerElement).borderTopLeftRadius)===radius;
              console.info('Radius check',radius,getComputedStyle(motionTab.querySelector('.tab-background')).borderTopLeftRadius,getComputedStyle(restored.labelContainerElement).borderTopLeftRadius);
              // Real native JSONFile migration, including durable file bytes.
              Services.prefs.setStringPref('zzrouter.creators',JSON.stringify({'2:sample':'Saved creator'}));
              Services.prefs.setStringPref('zzrouter.avatars',JSON.stringify({'2:sample':{d:svg}}));
              const {openRouterCache}=ChromeUtils.importESModule('chrome://sine/content/zz-tab-router/router-cache.sys.mjs');
              const {JSONFile}=ChromeUtils.importESModule('resource://gre/modules/JSONFile.sys.mjs');
              const cache=await openRouterCache({Services,IOUtils,PathUtils,JSONFile});
              checks.cacheMigrated=!Services.prefs.prefHasUserValue('zzrouter.creators')&&!Services.prefs.prefHasUserValue('zzrouter.avatars')&&cache.read('creators')['2:sample']==='Saved creator';
              cache.write('creators',{...cache.read('creators'),'4:other':'Second window'});await motionPause(800);
              checks.cacheDurable=(await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir,'zen-personal-mods-router-cache.json'))).creators['4:other']==='Second window';
              return checks;
            })();''')
            (OUT/'actions.json').write_text(json.dumps(actions,indent=2));print('ACTIONS',actions,flush=True)
            assert all(actions.values()),actions
            print('PASS: 5 motion profiles, before/mid/after hover pixels, 4 light profiles, text-only settle, fixed icon/background geometry, live reduced motion, 5 distinct rendered relief surfaces.',flush=True)
        finally:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill()
