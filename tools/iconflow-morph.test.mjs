import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const data=JSON.parse(await read('iconflow/morph.json')),source=await read('iconflow/iconflow-morph.uc.js');
const glyph=id=>data.glyphs[data.actions[id].glyph];
test('Morph preserves all 125 action IDs, 75 drawings and 10 compatible semantic path controls',()=>{
 assert.equal(Object.keys(data.actions).length,125);assert.equal(Object.keys(data.glyphs).length,75);assert.equal(data.controls.length,10);
 const signatures=d=>d.replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi,'#').replace(/[\s,]/g,'');
 for(const c of data.controls)for(const s of c.states)for(const [i,v] of s.values.entries()){
  assert.equal(signatures(v.d),signatures(c.states[0].values[i].d));assert.equal(signatures(s.wind[i].d),signatures(v.d));
 }
 for(const id of Object.keys(data.actions))assert.ok(data.bindings.some(b=>b.action===id),id);
 for(const b of data.bindings){assert.ok(data.actions[b.action]);assert.doesNotMatch(b.selector,/\[label|::before|::after/);}
 for(const id of ['context_undoCloseTab','toolbar-context-undoCloseTab'])assert.ok(data.bindings.some(b=>b.selector==='#'+id));
});
test('approved Library, Reload, Extensions and History geometry and paint remain byte-identical',()=>{
 const hashes={reload:'88474ac6b23bf08ff54b385b70251bf6c5e58ea6ac1240ccf49b0d84dc6fe39d','firefox-library':'90a85a319f0308f883660b727e417a80757a1d4135db4d2b29e77ee4b4bbc3b7',extensions:'bf72bf9f093b9d1fcf9a7198d3902f08a046d73a7bf6c4dfe4a0b0a2e5181a69',history:'db4979b26b237c542cf338852d220abe3a080fe44dec3e90132fa3ce4b88f332'};
 for(const [id,hash]of Object.entries(hashes)){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'+glyph(id).parts.map(p=>p.svg).join('')+'</svg>';
  assert.equal(createHash('sha256').update(svg).digest('hex'),hash,id);
 }
});
test('all ten adapters read their own authorities, including background targets and unknown native volume',()=>{
 const node=(attrs={})=>({attrs,id:'',getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return k in this.attrs;},closest(){return null;}});
 const root=node({'zen-compact-mode':'false','zen-sidebar-expanded':'false'}),pip=node({'data-zz-volume':'37'}),star=node({starred:''});star.id='star-button';
 const ids={'zen-sidebar-pip-container':pip,'appMenu-popup':{state:'closed'}},win={windowState:1,STATE_MAXIMIZED:2,fullScreen:false,SidebarController:{isOpen:false}};
 const targets=new WeakMap(),env=vm.createContext({data,window:win,document:{documentElement:root,getElementById:id=>ids[id]},downloadTargets:targets});
 vm.runInContext(source.slice(source.indexOf('function snapshot('),source.indexOf('function stateKey(')),env);
 const read=(id,host=node(),binding={})=>env.snapshot(binding,host,{controlId:id});
 assert.equal(read('playback').state,'playing');pip.attrs['zzmf-paused']='';assert.equal(read('playback').state,'paused');
 const card=node({});card.classList={contains:()=>true};const native=node();native.closest=selector=>selector==='.zen-media-card'?card:null;
 assert.equal(read('playback',native).state,'playing','another source remains playing');
 assert.equal(read('bookmark-toggle',star).state,'saved');assert.equal(read('bookmark-toggle',star,{state:'bookmark-launcher'}).state,'unsaved');
 const background=node();background.zziconBookmarked=false;assert.equal(read('bookmark-toggle',background).state,'unsaved','context target does not inherit selected tab bookmark');background.zziconBookmarked=true;assert.equal(read('bookmark-toggle',background).state,'saved');
 assert.equal(read('volume-control').level,37);pip.attrs['zzmf-muted']='';assert.equal(read('volume-control').level,0);assert.equal(read('volume-control').lastVolume,37);delete pip.attrs['zzmf-muted'];assert.equal(read('volume-control').level,37);
 assert.equal(read('volume-control',native).level,null);assert.equal(read('volume-control',native).unknown,true);
 const popup=node(),download={stopped:false},pause=node();targets.set(popup,download);pause.closest=()=>popup;
 assert.equal(read('download-playback',pause).state,'downloading');download.stopped=true;assert.equal(read('download-playback',pause).state,'paused');
 assert.equal(read('window-size').state,'normal');win.windowState=2;assert.equal(read('window-size').state,'maximized');
 const toggle=node({'data-zz-video-visible':'false'});assert.equal(read('video-visibility',toggle).state,'hidden');toggle.attrs['data-zz-video-visible']='true';assert.equal(read('video-visibility',toggle).state,'visible');
 assert.equal(read('menu-state').state,'closed');ids['appMenu-popup'].state='open';assert.equal(read('menu-state').state,'open');
 assert.equal(read('compact-mode').state,'expanded');root.attrs['zen-compact-mode']='true';assert.equal(read('compact-mode').state,'compact');
 const zen=node();zen.id='zen-expand-sidebar-button';win.SidebarController.isOpen=true;
 assert.equal(read('sidebar-state').state,'open');assert.equal(read('sidebar-state',zen).state,'closed');root.attrs['zen-sidebar-expanded']='true';assert.equal(read('sidebar-state',zen).state,'open');
 assert.equal(read('fullscreen-state').state,'windowed');win.fullScreen=true;assert.equal(read('fullscreen-state').state,'fullscreen');
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
