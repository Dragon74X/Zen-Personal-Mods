import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const data=JSON.parse(await read('iconflow/morph.json')),source=await read('iconflow/iconflow-morph.uc.js');
const glyph=id=>data.glyphs[data.actions[id].glyph];
test('Morph retains 107 action IDs, 64 drawings and 6 controls; media and window controls excluded',()=>{
 assert.equal(Object.keys(data.actions).length,107);assert.equal(Object.keys(data.glyphs).length,64);assert.equal(data.controls.length,6);
 for(const b of data.bindings)assert.doesNotMatch(b.selector,/titlebar|zzmf|zen-media|zen-sidebar-pip|mediaflow/);
 assert.doesNotMatch(source,/titlebar|window-size|zzglass\.buttons/);
 const signatures=d=>d.replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi,'#').replace(/[\s,]/g,'');
 for(const c of data.controls)for(const s of c.states)for(const [i,v] of s.values.entries()){
  assert.equal(signatures(v.d),signatures(c.states[0].values[i].d));assert.equal(signatures(s.wind[i].d),signatures(v.d));
 }
 for(const id of Object.keys(data.actions))assert.ok(data.bindings.some(b=>b.action===id),id);
 for(const b of data.bindings){assert.ok(data.actions[b.action]);assert.doesNotMatch(b.selector,/\[label|::before|::after/);
  // The binding index keys each selector by its leading compound, which must be the element or an ancestor.
  assert.doesNotMatch(b.selector,/[,+~]/,'one selector, no sibling combinator: '+b.selector);}
 for(const id of ['context_undoCloseTab','toolbar-context-undoCloseTab'])assert.ok(data.bindings.some(b=>b.selector==='#'+id));
});
test('approved Library, Reload, Extensions and History geometry and paint remain byte-identical',()=>{
 const hashes={reload:'88474ac6b23bf08ff54b385b70251bf6c5e58ea6ac1240ccf49b0d84dc6fe39d','firefox-library':'90a85a319f0308f883660b727e417a80757a1d4135db4d2b29e77ee4b4bbc3b7',extensions:'bf72bf9f093b9d1fcf9a7198d3902f08a046d73a7bf6c4dfe4a0b0a2e5181a69',history:'db4979b26b237c542cf338852d220abe3a080fe44dec3e90132fa3ce4b88f332'};
 for(const [id,hash]of Object.entries(hashes)){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'+glyph(id).parts.map(p=>p.svg).join('')+'</svg>';
  assert.equal(createHash('sha256').update(svg).digest('hex'),hash,id);
 }
});
test('all six state adapters read their own authorities, including background command targets',()=>{
 const node=(attrs={})=>({attrs,id:'',getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return k in this.attrs;},closest(){return null;}});
 const root=node({'zen-compact-mode':'false','zen-sidebar-expanded':'false'}),star=node({starred:''});
 const ids={'appMenu-popup':{state:'closed'}},win={windowState:1,STATE_MAXIMIZED:2,fullScreen:false,SidebarController:{isOpen:false}};
 const targets=new WeakMap(),env=vm.createContext({window:win,document:{documentElement:root,getElementById:id=>ids[id]},downloadTargets:targets});
 vm.runInContext(source.slice(source.indexOf('function snapshot('),source.indexOf('function rowFor(')),env);
 const read=(control,host=node(),binding={})=>({state:env.snapshot({control,host,binding})});
 // The star's owner is its box; the starred image inside it is the authority.
 const starBox=node();starBox.id='star-button-box';starBox.querySelector=s=>{assert.equal(s,'#star-button');return star;};
 assert.equal(read('bookmark-toggle',starBox).state,'saved');assert.equal(read('bookmark-toggle',starBox,{state:'bookmark-launcher'}).state,'unsaved');
 delete star.attrs.starred;assert.equal(read('bookmark-toggle',starBox).state,'unsaved');
 assert.equal(read('bookmark-toggle',node({starred:''})).state,'saved','Bookmark Page carries starred itself');
 const background=node();background.zziconBookmarked=false;assert.equal(read('bookmark-toggle',background).state,'unsaved','context target does not inherit selected tab bookmark');background.zziconBookmarked=true;assert.equal(read('bookmark-toggle',background).state,'saved');
 const popup=node(),download={stopped:false},pause=node();targets.set(popup,download);pause.closest=()=>popup;
 assert.equal(read('download-playback',pause).state,'downloading');download.stopped=true;assert.equal(read('download-playback',pause).state,'paused');
 assert.equal(read('menu-state').state,'closed');ids['appMenu-popup'].state='open';assert.equal(read('menu-state').state,'open');
 assert.equal(read('compact-mode').state,'expanded');root.attrs['zen-compact-mode']='true';assert.equal(read('compact-mode').state,'compact');
 const zen=node();zen.id='zen-expand-sidebar-button';win.SidebarController.isOpen=true;
 assert.equal(read('sidebar-state').state,'open');assert.equal(read('sidebar-state',zen).state,'closed');root.attrs['zen-sidebar-expanded']='true';assert.equal(read('sidebar-state',zen).state,'open');
 assert.equal(read('fullscreen-state').state,'windowed');win.fullScreen=true;assert.equal(read('fullscreen-state').state,'fullscreen');
});


test('menu opt-out applies before native paint in menu and panel owners',()=>{
 const prefs=new Map(),scope=vm.createContext({cfg:{menus:false},int:(k,f=0)=>prefs.get(k)??f});
 vm.runInContext(source.slice(source.indexOf('const allowed='),source.indexOf('const listen='))+';Object.assign(globalThis,{allowed,placed});',scope);
 const menu={closest:s=>{assert.equal(s,'menupopup,panelview,menu,menuitem');return {};}},toolbar={closest:()=>null};
 assert.equal(scope.placed(toolbar),true);assert.equal(scope.placed(menu),false);
 scope.cfg.menus=true;assert.equal(scope.placed(menu),true);
 // Per-button and Library choices other than following the set keep the native icon.
 assert.equal(scope.allowed({setting:null}),true);assert.equal(scope.allowed({setting:'reload'}),true);
 prefs.set('button.reload',1);assert.equal(scope.allowed({setting:'reload'}),false);
 assert.equal(scope.allowed({setting:'library'}),true);prefs.set('library.style',3);assert.equal(scope.allowed({setting:'library'}),false);
});

test('the binding index returns the first matching binding, as a full scan would',()=>{
 const env=vm.createContext({bindings:data.bindings});
 vm.runInContext('let keyed,unkeyed,keyAttrs;'+source.slice(source.indexOf('function indexBindings('),source.indexOf('function discover('))+';indexBindings();',env);
 // An element under ancestors carrying each binding's leading key, matching exactly the chosen selectors.
 const chain=chosen=>{
  let parent=null;
  for(const b of chosen){
   const [,id,name,value]=/^(?:#([\w-]+)|\[([\w-]+)="([^"]*)"\])/.exec(b.selector)||[];
   const attrs=name?{[name]:value}:{};parent={id:id||'',parentElement:parent,getAttribute:k=>attrs[k]??null};
  }
  const wanted=new Set(chosen.map(b=>b.selector));
  return {id:'',parentElement:parent,getAttribute:()=>null,matches:s=>wanted.has(s)};
 };
 const picks=[0,5,22,78,80,100,107,110,116,158,161,174].map(i=>data.bindings[i]);
 for(const a of picks)for(const b of picks){
  const el=chain([a,b]),want=data.bindings.find(x=>el.matches(x.selector));
  assert.equal(env.bindingFor(el),want,a.selector+' / '+b.selector);
 }
 assert.equal(env.bindingFor(chain([])),undefined);
});

test('native frame sheets reproduce the approved motion definitions',()=>{
 const out=execFileSync('python3',[new URL('tools/iconflow-morph-frames.py',root).pathname,'--check'],{encoding:'utf8'});console.log(out.trim());
});
test('native paint keeps command and geometry ownership; no JS animation loop',()=>{
 assert.doesNotMatch(source,/requestAnimationFrame|ResizeObserver|anchor-name|createElement|DOMParser|setInterval|setTimeout|dispatchEvent\(|preventDefault\(|stopPropagation\(/);
 assert.match(source,/image.decode\(\)/);assert.match(source,/r.paint.animate\(/);
 assert.doesNotMatch(source,/style\.(visibility|opacity|position|width|height)/);
});
test('native Zen commands, frames, visibility and teardown',{skip:!process.env.ZEN_BINARY,timeout:240000},()=>{
 console.log(execFileSync('python3',[new URL('tools/zen-morph-smoke.py',root).pathname,'--zen',process.env.ZEN_BINARY,'--output',process.env.ZEN_MORPH_OUTPUT||'/tmp/zen-native-morph-checks'],{timeout:235000,encoding:'utf8',maxBuffer:2e6}));
});

test('URL-bar click owners animate once; command widgets ignore duplicate clicks and disabled boxes stay still',()=>{
 const namespace='xul',calls=[];
 const host=(name,attrs={})=>({localName:name,namespaceURI:namespace,disabled:false,getAttribute:k=>attrs[k]??null,matches:()=>['toolbarbutton','button','menuitem','menu'].includes(name)});
 const scope=vm.createContext({namespace,records:new Map(),recordFor:e=>e.record,fire:r=>calls.push(r),index:{wind:31},move:(r,to)=>{r.frame=to;}});
 vm.runInContext(source.slice(source.indexOf('function activated('),source.indexOf("listen(window,'command'")),scope);
 vm.runInContext(source.slice(source.indexOf('function hover('),source.indexOf('function fire(')),scope);
 for(const name of ['box','hbox','toolbarbutton']){
  const r={host:host(name)},e={record:r,type:'click',button:0};const before=calls.length;
  scope.activated(e);if(name==='toolbarbutton')scope.activated({...e,type:'command'});
  assert.equal(calls.length,before+1,name);
  scope.activated({...e,button:2});assert.equal(calls.length,before+1,'right click ignored');
 }
 const disabled={host:host('hbox',{disabled:'true'})};scope.activated({record:disabled,type:'click',button:0});scope.hover(disabled,true);
 assert.equal(calls.length,3);assert.equal(disabled.frame,0);
});
