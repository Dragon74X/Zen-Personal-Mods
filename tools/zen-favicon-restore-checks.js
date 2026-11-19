// Actual tabbrowser, navigations, SessionStore image and a fresh restore tab.
return (async()=>{
  const check=(v,msg)=>{if(!v)throw Error(msg);}, wait=ms=>new Promise(r=>setTimeout(r,ms));
  const principal=Services.scriptSecurityManager.getSystemPrincipal(), P=Services.prefs;
  P.setBoolPref("zen.theme.hide-tab-throbber",true);P.setBoolPref("browser.tabs.remoteSVGIconDecoding",true);
  const tab=gBrowser.addTab("about:blank",{triggeringPrincipal:principal}), browser=tab.linkedBrowser;
  gBrowser.selectedTab=tab;
  const load=async(host,page)=>{
    const spec="http://"+host+":"+faviconPort+"/"+page;
    browser.loadURI(Services.io.newURI(spec),{triggeringPrincipal:principal});
    for(let i=0;i<150;i++){
      await wait(30);
      if(browser.currentURI.spec===spec&&!browser.webProgress.isLoadingDocument&&browser.contentTitle==="/"+page)return;
    }
    throw Error("Local favicon navigation did not settle");
  };
  await load("127.0.0.1","first");
  const svg="data:image/svg+xml;base64,"+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>');
  gBrowser.setIcon(tab,svg);
  check(tab.getAttribute("image").startsWith("moz-remote-image:"),"Missing remote SVG display fixture");
  await load("127.0.0.1","second");
  check(gBrowser.getIcon(tab)===svg,"Same-host navigation did not retain the original SVG source");
  const state=JSON.parse(SessionStore.getTabState(tab));
  check(state.image===svg,"SessionStore did not serialize the original SVG source");
  const other=gBrowser.addTab("about:blank",{triggeringPrincipal:principal});
  SessionStore.setTabState(other,state);
  for(let i=0;i<100&&!other.getAttribute("image")?.startsWith("moz-remote-image:");i++)await wait(20);
  check(other.getAttribute("image")?.startsWith("moz-remote-image:"),"Restored favicon was not safely wrapped");
  await load("localhost","different-site");
  check(browser.mIconURL!==svg,"Cross-site favicon leak");
  gBrowser.setIcon(tab,svg);P.setBoolPref("zen.theme.hide-tab-throbber",false);
  await load("localhost","disabled");check(browser.mIconURL!==svg,"Off retained an icon");
  gBrowser.removeTab(other,{animate:false});gBrowser.removeTab(tab,{animate:false});
  return {sameHost:true,sourceSerialized:true,nativeRestore:true,crossHostReleased:true,offReleased:true};
})();
