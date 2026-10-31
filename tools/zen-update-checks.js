// Disposable profile only; archive bytes and metadata are local fixtures.
return (async () => {
  const check=(v,msg)=>{if(!v)throw Error(msg);}, wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await wait(30);}throw Error("Update fixture timed out: "+fn);};
  await until(()=>updateSettingsTab.linkedBrowser.contentWindow?.gCategoryInits?.has("panePrivacy"));
  const win=updateSettingsTab.linkedBrowser.contentWindow, doc=win.document;
  const manager=ChromeUtils.importESModule("chrome://userscripts/content/core/manager.sys.mjs").default;
  const utils=ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default;
  const uc=ChromeUtils.importESModule("chrome://userscripts/content/utils/uc_api.sys.mjs").default;
  const dir=PathUtils.join(PathUtils.profileDir,"synthetic-update");await IOUtils.makeDirectory(dir);
  Object.defineProperty(utils,"modsDir",{get:()=>dir});
  const id="fixture", folder=utils.getModFolder(id), pref="config/menu/preferences.json", style="styles/sidebar/userChrome.css", script="scripts/check.uc.js";
  const manifest={id,name:"Fixture",description:"Offline update fixture",origin:"store",homepage:"https://github.com/example/fixture",
    version:"2.1",commit:"fixture",updatedAt:"2026-01-02T00:00:00Z",preferences:pref,style:{chrome:style},scripts:{[script]:{}}};
  const installed={...manifest,enabled:true,version:"2.0",updatedAt:"2026-01-01T00:00:00Z","no-updates":false,preferences:"preferences.json"};
  await IOUtils.makeDirectory(folder);await IOUtils.writeUTF8(PathUtils.join(folder,"preferences.json"),"[]");
  await IOUtils.writeJSON(utils.modsDataFile,{[id]:installed});
  let badArchive=true, requests=0;
  uc.fetch=async()=>({[id]:structuredClone(manifest)});uc.showToast=()=>{};
  uc.unpackRemoteArchive=async()=>{
    const files={"theme.json":"{}",[pref]:"[]",[style]:"/* generated */"};
    if(!badArchive)files[script]="// generated";requests++;
    for(const [name,body] of Object.entries(files)){
      const dest=PathUtils.join(folder,...name.split("/"));await IOUtils.makeDirectory(PathUtils.parent(dest));await IOUtils.writeUTF8(dest,body);
    }
    return Object.keys(files).map(name=>id+"/"+name);
  };
  manager.rebuildMods=()=>{};manager.loadMods=async()=>{};
  const el=(tag,id)=>{const n=doc.createElementNS("http://www.w3.org/1999/xhtml",tag);if(id)n.id=id;return n;};
  const stock=doc.getElementById("category-zen-marketplace");
  if(stock)stock.remove();
  const isZen=!!win.gCategoryInits.get("paneZenMarketplace");
  if(isZen){delete window.gZenMods;delete win.gZenMods;win.gCategoryInits.get("paneZenMarketplace")._initted=false;}
  const nav=doc.getElementById("category-general").cloneNode(false);nav.id="category-sine-mods";nav.setAttribute("view","paneSineMods");nav.setAttribute("value","paneSineMods");doc.getElementById("categories").append(nav);
  win.gCategoryInits.set("paneSineMods",{_initted:true,init(){}});
  const group=el("div","sineInstalledGroup");group.setAttribute("data-category","paneSineMods");doc.documentElement.append(group);
  const button=el("button"),indicator=el("div");button.className="manual-update";indicator.className="update-indicator";group.append(button,indicator);
  const before=(()=>{try{PathUtils.join(folder,style);return "";}catch(e){return String(e);}})();
  check(before.includes("NS_ERROR_FILE_UNRECOGNIZED_PATH"),"Old nested join did not reproduce");
  ChromeUtils.importESModule("chrome://sine/content/zz-download-prompt/sine-update-guard.sys.mjs");
  await manager.loadMods(win);
  check(win.gCategoryModules.has("paneSineMods"),"Sine navigation has no module");
  await win.gotoPref("paneSineMods");
  if(isZen)check(win.gCategoryInits.get("paneZenMarketplace")._initted,"Retired marketplace still pending");
  bindUpdateButton(doc,group,manager);
  button.click();await until(()=>indicator.querySelector('[role="alert"]'));
  check(indicator.textContent.includes("failed")&&!indicator.querySelector(".checked"),"Failure reported as success");
  check((await utils.getMods())[id].version==="2.0" && await IOUtils.readUTF8(PathUtils.join(folder,"preferences.json"))==="[]","Failed update was not rolled back");
  badArchive=false;button.click();await until(()=>indicator.querySelector('[data-l10n-id="sine-mods-updated"]'));
  const updated=(await utils.getMods())[id];
  check(updated.version==="2.1"&&updated.preferences===pref&&Array.isArray(await utils.getModPreferences(updated)),"Nested update failed");
  check(await IOUtils.exists(PathUtils.join(folder,...script.split("/"))),"Nested script missing");
  button.click();await until(()=>indicator.querySelector('[data-l10n-id="sine-mods-update-checked"]'));
  check(requests===2,"Unexpected archive download");
  return {platform:Services.appinfo.OS,oldJoinRejected:true,buttonFailure:true,rollback:true,nestedRetry:true,noUpdate:true,navigation:true,zenMarketplace:isZen?"retired":"not installed"};
})();
