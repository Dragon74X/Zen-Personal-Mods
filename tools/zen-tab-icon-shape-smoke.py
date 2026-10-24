#!/usr/bin/env python3
"""Render all five icon shapes against Arc's overflow override in a disposable Zen profile.

python tools/zen-tab-icon-shape-smoke.py --zen /path/to/zen --output /tmp/icon-shapes
Requires Pillow, like zen-smoke.py. Uses the final production CSS and derives the
broken control by removing only its clipping declaration. Never uses a real profile.
"""
import argparse
import base64
import io
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zen', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('smoke', ROOT / 'tools/zen-smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='zen-tab-icon-shape-') as directory:
    profile = Path(directory)
    folder=profile/'chrome/sine-mods'
    folder.mkdir(parents=True)
    theme=json.loads((ROOT/'groupflow/theme.json').read_text())
    theme.update(enabled=True,origin='store')
    (folder/theme['id']).symlink_to(ROOT/'groupflow',target_is_directory=True)
    (folder/'mods.json').write_text(json.dumps({theme['id']:theme}))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    prefs = {'marionette.port': port, 'browser.shell.checkDefaultBrowser': False,
             'browser.aboutwelcome.enabled': False, 'zen.welcome-screen.seen': True,
             'zen.welcome-screen.enabled': False, 'sine.auto-update': False}
    (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k, v in prefs.items()))
    with (OUT / 'browser.log').open('w') as log:
        process = subprocess.Popen([str(args.zen.resolve()), '--headless', '--no-remote',
                                   '--profile', directory, '--marionette', '--remote-allow-system-access',
                                   'about:blank'], stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.2):
                        break
                except OSError:
                    if process.poll() is not None:
                        raise RuntimeError((OUT / 'browser.log').read_text()[-2000:])
                    time.sleep(.2)
            m = smoke.Marionette(port)
            m.script('return gZenStartup.promiseInitialized.then(()=>true);')
            m.call('WebDriver:SetWindowRect', {'width': 1280, 'height': 1200})
            defaults = {p['property']: p['defaultValue'] for p in json.loads((ROOT / 'groupflow/preferences.json').read_text()) if 'property' in p and 'defaultValue' in p}
            m.script('for(const [k,v] of Object.entries('+json.dumps(defaults)+')) Services.prefs[typeof v==="boolean"?"setBoolPref":typeof v==="number"?"setIntPref":"setStringPref"](k,v);return true;')

            source_css=(ROOT/'groupflow/userChrome.css').read_text()
            geometry='    corner-shape: var(--zzgf-tab-icon-corner) !important;'
            clip=geometry+'\n    overflow: clip !important;'
            assert source_css.count(clip)==1, 'Clipping must belong to the existing geometry rule'
            broken_css=profile/'groupflow-broken.css'
            broken_css.write_text(source_css.replace(clip, geometry))
            fixed_css=ROOT/'groupflow/userChrome.css'
            m.script('const ss=Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);ss.loadAndRegisterSheet(Services.io.newURI('+json.dumps(broken_css.as_uri())+'),ss.USER_SHEET);return true;')
            # Arc 2.0, commit eaf001a7a2d9c797ba3af41fd50feefc657679b2,
            # modules/chrome/borders.css lines 86-93, verbatim (including typo).
            arc_css=profile/'arc-icon-overflow.css'
            arc_css.write_text("""
/* Fix icon border radius */
.tab-icon-image,
.toolbarbutton-icon,
.toolbarbutton-animatable-iamge,
.unified-extensions-item-icon #downloads-indicator-icon {
  border-radius: 0 !important;
  overflow: visible !important;
}
/* Fixture: reproduce the captured 20px size and Arc round corners. */
.tab-icon-pending, .tab-icon-image, .tab-sharing-icon-overlay, .tab-icon-overlay {
  width: 20px !important;
  height: 20px !important;
}
*, ::before, ::after { corner-shape: round !important; }
""")
            m.script('Services.prefs.setBoolPref("layout.css.corner-shape.enabled",true);Services.prefs.setBoolPref("zen.theme.hide-tab-throbber",true);const ss=Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);ss.loadAndRegisterSheet(Services.io.newURI('+json.dumps(arc_css.as_uri())+'),ss.USER_SHEET);return true;')

            assets={}
            for fmt in ['PNG','WEBP']:
                for color in ['lime','red','transparent']:
                    fixture=Image.new('RGBA',(64,64),'lime' if color=='transparent' else color)
                    if color=='transparent': fixture.paste((0,0,0,0),(24,24,40,40))
                    b=io.BytesIO();fixture.save(b,format=fmt,lossless=True)
                    assets[fmt+color]='data:image/'+fmt.lower()+';base64,'+base64.b64encode(b.getvalue()).decode()
            setup=m.script('window.shapeAssets='+json.dumps(assets)+''';return (async()=>{
              const pause=ms=>new Promise(r=>setTimeout(r,ms));
              window.shapeTabs=[];
              const old=gBrowser.selectedTab;
              for(const fmt of ['PNG','WEBP'])for(const kind of ['native','router','manual'])for(const alpha of [false,true]){
                const tab=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true});
                tab.classList.add('shape-real');tab.setAttribute('label',fmt+' '+kind);
                await pause(80);
                const picture=shapeAssets[fmt+(alpha?'transparent':'lime')];
                gBrowser.setIcon(tab,kind==='router'?shapeAssets[fmt+'red']:picture);
                if(kind==='router'){tab.setAttribute('data-zzrouter-tab-icon',picture);tab.style.setProperty('--zzrouter-tab-icon','url("'+picture+'")');}
                if(kind==='manual'){tab.zenStaticIcon=picture;gZenPinnedTabManager.onTabIconChanged(tab);}
                const img=tab.querySelector('.tab-icon-image');img.id='shape-'+fmt+'-'+kind+(alpha?'-transparent':'');
                shapeTabs.push(tab);await img.decode();
              }
              const parent=gBrowser.addTabGroup(shapeTabs,{label:'YouTube fixture',insertBefore:shapeTabs[0]});
              const a=gBrowser.addTabGroup(shapeTabs.slice(0,6),{label:'PNG folder',insertBefore:shapeTabs[0]});
              const b=gBrowser.addTabGroup(shapeTabs.slice(6),{label:'WebP folder',insertBefore:shapeTabs[6]});
              for(const g of [a,b,parent])g.collapsed=false;
              gBrowser.selectedTab=old;
              // The native Library copies tabs with cloneNode(false). Display
              // those same custom elements in a fixed fixture beside the sidebar.
              const copies=document.createElementNS('http://www.w3.org/1999/xhtml','div');
              copies.style.cssText='position:fixed;left:500px;top:100px;width:260px;z-index:2147483647;background:#202020;';
              document.documentElement.append(copies);
              for(const tab of [...shapeTabs]) {
                const id=tab.querySelector('.tab-icon-image').id;
                if(id.includes('transparent') || id.includes('manual'))continue;
                const copy=tab.cloneNode(false);copy.id=id+'-library';copies.append(copy);
                copy.querySelector('.tab-icon-image').id=id+'-library';shapeTabs.push(copy);
              }
              window.shapeIndicators=()=>{
                const tab=shapeTabs[0], result={};
                for(const state of ['busy','muted','soundplaying','pictureinpicture','sharing']) {
                  tab.setAttribute(state,state==='sharing'?'camera':'true');
                  result[state]=['.tab-icon-stack','.tab-throbber','.tab-icon-pending','.tab-sharing-icon-overlay','.tab-icon-overlay','.tab-audio-button'].map(selector=>{
                    const node=tab.querySelector(selector);if(!node)return null;
                    const style=getComputedStyle(node);
                    return [style.display,style.visibility,style.opacity,style.width,style.height,style.overflow];
                  });
                  tab.removeAttribute(state);
                }
                return result;
              };
              await pause(300);
              return shapeTabs.map(t=>{const i=t.querySelector('.tab-icon-image'),s=getComputedStyle(i);return {id:i.id,srcIsNative:i.src===t.getAttribute('image'),rect:i.getBoundingClientRect().toJSON(),display:s.display,overflow:s.overflow,visibility:s.visibility,filter:s.filter,padding:s.padding};});
            })();''')
            print(json.dumps({'setup':setup}),flush=True)
            results=[]
            indicators={}
            for state in ['before','after','disabled']:
                if state=='after':
                    m.script('const ss=Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);ss.unregisterSheet(Services.io.newURI('+json.dumps(broken_css.as_uri())+'),ss.USER_SHEET);ss.loadAndRegisterSheet(Services.io.newURI('+json.dumps(fixed_css.as_uri())+'),ss.USER_SHEET);return true;')
                if state=='disabled':
                    m.script('Services.prefs.setBoolPref("zzgroup.enabled",false);return true;')
                for mode in [0,1,2,3,4]:
                    info=m.script('Services.prefs.setIntPref("zzgroup.tab-icon-shape",'+str(mode)+');return new Promise(resolve=>setTimeout(()=>resolve(shapeTabs.map(t=>{const i=t.querySelector(".tab-icon-image"),s=getComputedStyle(i);return {id:i.id,radius:s.borderTopLeftRadius,corner:s.cornerShape,rect:i.getBoundingClientRect().toJSON(),display:s.display,overflow:s.overflow,visibility:s.visibility};})),100));')
                    shot=m.shot();shot.save(OUT/f'{state}-full-{mode}.png')
                    for case in info:
                        r=case.pop('rect')
                        crop=shot.crop(tuple(round(r[k]) for k in ['left','top','right','bottom']))
                        crop.save(OUT/f'{state}-{mode}-{case["id"]}.png')
                        case.update(state=state,mode=mode,green=sum(g>200 and red<20 and b<20 for red,g,b in crop.get_flattened_data()),size=list(crop.size),cornerPixel=crop.getpixel((0,0)),centerPixel=crop.getpixel((10,10)))
                        results.append(case)
                indicators[state]=m.script('return shapeIndicators();')
            assert indicators['before']==indicators['after'], 'Sibling indicator presentation changed'
            for state in ['before','after','disabled']:
                rows=[r for r in results if r['state']==state]
                for ident in {r['id'] for r in rows}:
                    case=[r for r in rows if r['id']==ident]
                    assert len(case)==5,case
                    assert all(r['size']==[20,20] for r in case),case
                    assert all(r['overflow']==('clip' if state=='after' else 'visible') for r in case),case
                    transparent='transparent' in ident
                    for r in case:
                        red,g,b=r['centerPixel']
                        assert (g>200 and red<20 and b<20)!=transparent,r
                    if state!='after':
                        assert len({r['green'] for r in case})==1,case
                        assert all((r['green']<400) if transparent else (r['green']==400) for r in case),case
                    else:
                        assert len({r['green'] for r in case})==5,case
                        assert all(r['green']<400 for r in case if r['mode']!=4),case
                        assert case[4]['green']==max(r['green'] for r in case),case
                        if not transparent: assert case[4]['green']==400,case
                        assert [float(r['radius'].rstrip('%px')) for r in case[1:]]==[25,38,50,0],case
                        assert [r['corner'] for r in case[1:]]==['superellipse(1)','superellipse(2)','superellipse(1)','superellipse(1)'],case
            assert m.script('return Services.prefs.getIntPref("zzgroup.tab-icon-shape");')==4
            (OUT/'indicators.json').write_text(json.dumps(indicators,indent=2))
            (OUT/'results.json').write_text(json.dumps(results,indent=2))
            print(json.dumps({'cases':len(results),'beforeGreenPixels':[r['green'] for r in results if r['state']=='before' and r['id']=='shape-PNG-router'],'afterGreenPixels':[r['green'] for r in results if r['state']=='after' and r['id']=='shape-PNG-router'],'afterGeometry':[{k:r[k] for k in ['mode','radius','corner','overflow']} for r in results if r['state']=='after' and r['id']=='shape-PNG-router'],'indicatorStates':len(indicators['after']),'passed':True}),flush=True)
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
