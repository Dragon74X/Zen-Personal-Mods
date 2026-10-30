// Disposable Zen chrome only. No claim about Windows Mica or screen pixels.
return (async () => {
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(ok,message,data)=>{if(!ok)throw Error(message+': '+JSON.stringify(data));};
  const settle=async host=>{
    for(let n=0;n<100;n++) {
      const pending=host.getAnimations({subtree:true}).some(a=>a.playState!=='finished'&&a.playState!=='idle'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
      if(!pending)return;
      await wait(25);
    }
    throw Error('Fixture menu motion did not settle');
  };
  const ss=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
  const sheet=css=>{const uri=Services.io.newURI('data:text/css,'+encodeURIComponent(css));ss.loadAndRegisterSheet(uri,1);return uri;};
  // Exact competing fill and stagger from Arc 2.0 at eaf001a7a2d9c797ba3af41fd50feefc657679b2:
  // modules/chrome/general.css 41–68; modules/chrome/animations.css 341–402.
  const arc=`.menupopup-arrowscrollbox {
    box-shadow:none!important;
    background-color:var(--arc-menu-opacity-value,light-dark(rgb(255 255 255 / 0%),rgb(0 0 0 / 0%)))!important;
  }
  menupopup,panel{&::part(content){color:var(--panel-color)!important;}}
  menupopup{animation:context-menu-slide-in .25s ease-out!important;transform-origin:top left;}
  @keyframes context-menu-slide-in{0%{opacity:0;transform:scale(.92) translateX(-5px)}100%{opacity:1;transform:scale(1) translateY(0)}}
  menuitem{transition:background-color .25s ease-out,transform .25s ease-out,opacity .25s ease-out!important;animation:menu-item-slide-in .25s ease-out backwards;}
  menuitem:nth-child(1){animation-delay:.03s}menuitem:nth-child(2){animation-delay:.06s}menuitem:nth-child(3){animation-delay:.09s}
  @keyframes menu-item-slide-in{0%{opacity:0;transform:translateX(-10px)}100%{opacity:1;transform:translateX(0)}}`;
  window.popupTestArc=arc;
  const popup=document.createXULElement('menupopup');
  for(const label of ['Enabled fixture','Selected fixture','Disabled fixture']) {
    const item=document.createXULElement('menuitem');item.setAttribute('label',label);
    if(label.startsWith('Disabled'))item.setAttribute('disabled','true');popup.append(item);
  }
  const panel=document.createXULElement('panel');panel.setAttribute('type','arrow');
  const text=document.createXULElement('label');text.setAttribute('value','Panel fixture');panel.append(text);
  const swatch=document.createElementNS('http://www.w3.org/1999/xhtml','div');document.documentElement.append(swatch);
  const popups=document.getElementById('mainPopupSet');popups.append(popup,panel);
  const result={cases:[],limits:'Actual Gecko popup/shadow CSS and animation states; simulated Mica media match, no Windows pixels or physical keyboard input.'};
  const inspect=host=>{
    const content=host.shadowRoot.querySelector('[part~="content"]'),s=getComputedStyle(content);
    return {fill:s.backgroundColor,color:s.color,scheme:s.colorScheme};
  };
  const palette=scheme=>{
    swatch.style.cssText='color-scheme:only '+scheme+';background:Menu;color:MenuText';
    const menu={fill:getComputedStyle(swatch).backgroundColor,color:getComputedStyle(swatch).color};
    swatch.style.cssText='color-scheme:only '+scheme+';background:Canvas;color:CanvasText';
    return {menu,panel:{fill:getComputedStyle(swatch).backgroundColor,color:getComputedStyle(swatch).color}};
  };
  // Keep the root dark to reproduce a theme that ignores the old ui override.
  document.documentElement.style.setProperty('color-scheme','only dark','important');
  // A fixed theme color must not replace the accessible system foreground.
  document.documentElement.style.setProperty('--panel-color','#161616');
  Services.prefs.setStringPref('zzglass.popups.opacity','37%');
  for(const order of ['arc-first','arc-last']) {
    const sheets=(order==='arc-first'?[arc,popupTestCSS]:[popupTestCSS,arc]).map(sheet);
    try {
      for(const mica of [false,true])for(const scheme of ['light','dark'])for(const mode of ['normal','reduced','contrast']) {
        Services.prefs.setBoolPref('test.mica',mica);
        Services.prefs.setIntPref('ui.prefersReducedTransparency',mode==='reduced'?1:0);
        Services.prefs.setIntPref('ui.useAccessibilityTheme',mode==='contrast'?1:0);
        Services.prefs.setIntPref('browser.display.document_color_use',mode==='contrast'?2:0);
        for(const host of [popup,panel])host.style.setProperty('color-scheme','only '+scheme,'important');
        await wait(60);
        const colors=palette(scheme),outputs={};
        for(const enabled of [false,true,false]) {
          Services.prefs.setBoolPref('zzglass.overlays.enabled',enabled);
          await wait(30);
          for(const host of [popup,panel]) {
            host.openPopupAtScreen(mozInnerScreenX+400,mozInnerScreenY+180,false);
            for(let n=0;n<40&&host.state!=='open';n++)await wait(25);
            check(host.state==='open','Popup did not open');
            // Finite transitions are allowed to finish, never disabled for the test.
            await settle(host);
            const name=host===popup?'menu':'panel',paint=inspect(host);
            const key=name+enabled;
            if(!enabled&&outputs[key])check(JSON.stringify(paint)===JSON.stringify(outputs[key]),'Off did not release appearance',{order,mica,scheme,mode,name,paint,previous:outputs[key]});
            outputs[key]=paint;
            if(enabled&&mode!=='normal') {
              check(paint.fill===colors[name].fill&&paint.color===colors[name].color,'Accessible painted palette mismatch',{order,mica,scheme,mode,name,paint,expected:colors[name]});
            }
            if(host===popup) {
              const before=[...popup.children].map(e=>getComputedStyle(e).color);
              if(enabled&&mode!=='normal')check(before[0]===colors.menu.color,'Enabled item lost native menu text',before);
              check(before[2]!==before[0],'Disabled item lost its native distinction',before);
              popup.children[1].setAttribute('_moz-menuactive','true');await settle(popup);
              const selected=getComputedStyle(popup.children[1]);
              check(selected.backgroundColor!=='rgba(0, 0, 0, 0)','Native selection highlight lost');
              if(!enabled)outputs.selection={fill:selected.backgroundColor,color:selected.color};
              else check(selected.backgroundColor===outputs.selection.fill&&selected.color===outputs.selection.color,'Accessibility changed native selection colors',{order,mica,scheme,mode,actual:{fill:selected.backgroundColor,color:selected.color},expected:outputs.selection});
              popup.children[1].removeAttribute('_moz-menuactive');
            }
            host.hidePopup();
          }
        }
        result.cases.push({order,mica,scheme,mode,paint:outputs.menutrue,offRestored:true});
      }
    } finally {for(const uri of sheets)ss.unregisterSheet(uri,1);}
  }
  check(Services.prefs.getStringPref('zzglass.popups.opacity')==='37%','Saved opacity changed');
  popup.remove();panel.remove();swatch.remove();
  return result;
})();
