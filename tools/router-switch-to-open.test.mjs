import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const childSource = (await readFile(new URL("../tab-router/links-child.sys.mjs", import.meta.url), "utf8"))
  .replace(/export /g, "");
const router = await readFile(new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");
const groupflow = await readFile(new URL("../groupflow/groupflow.uc.js", import.meta.url), "utf8");

function child(open = ["0|example.com/b"], pageTabs = []) {
  const sent = [];
  const ctx = vm.createContext({ URL, URLSearchParams,
    Services: { cpmm: { sharedData: { get: key => new Set(key === "zzrouter:page-tabs" ? pageTabs : open) } } },
    JSWindowActorChild: class { sendAsyncMessage(name, data) { sent.push(JSON.parse(JSON.stringify([name, data]))); } } });
  vm.runInContext(childSource + "\nthis.Child = ZzRouterLinksChild; this.pageKey = pageKey;", ctx);
  const actor = new ctx.Child();
  actor.document = { documentURI: "https://example.com/a" };
  actor.browsingContext = { originAttributes: { userContextId: 0 }, browserId: 7 };
  const click = (href, extra = {}) => {
    const link = { localName: "a", href, target: "", hasAttribute: () => false, ...(extra.link || {}) };
    const event = { type: "click", button: 0, isTrusted: true, defaultPrevented: false, altKey: false, shiftKey: false,
      ctrlKey: false, metaKey: false, composedPath: () => [link], prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    actor.handleEvent(event);
    return event;
  };
  return { actor, sent, click, pageKey: ctx.pageKey };
}

test("A real click on a link to an open page is cancelled and switched; everything else passes through", () => {
  const { sent, click } = child();
  let e = click("https://www.example.com/b/?utm_source=x#top");
  assert.ok(e.prevented && e.stopped, "the same page, ignoring www., a trailing slash, tracking and the anchor");
  assert.deepEqual(sent.pop(), ["ZzRouter:SwitchTo", { href: "https://www.example.com/b/?utm_source=x#top", newTab: false }]);
  e = click("https://example.com/b", { ctrlKey: true });
  assert.equal(sent.pop()[1].newTab, true, "a Ctrl-click is a new-tab click");
  for (const [why, href, extra] of [
    ["a page that is not open", "https://example.com/c", {}],
    ["this page's own anchor", "https://example.com/a#section", {}],
    ["Alt opens a copy", "https://example.com/b", { altKey: true }],
    ["Shift opens a window", "https://example.com/b", { shiftKey: true }],
    ["a download link", "https://example.com/b", { link: { hasAttribute: n => n === "download" } }],
    ["an untrusted (script) click", "https://example.com/b", { isTrusted: false }],
    ["a click the page already handled", "https://example.com/b", { defaultPrevented: true }],
    ["another container", "https://example.com/b", {}],
  ]) {
    const { actor, sent: out, click: c } = child();
    if (why === "another container") actor.browsingContext.originAttributes.userContextId = 2;
    const ev = c(href, extra);
    assert.ok(!ev.prevented && !out.some(([name]) => name === "ZzRouter:SwitchTo"), why);
  }
});

function opener({ open = new Map(), enabled = false, plan = null, native = null } = {}) {
  const src = router.slice(router.indexOf("  let copyNext = false;"), router.indexOf("  // One shared patch on Firefox's click handler"))
    + router.slice(router.indexOf("  function copyWhile(fn) {"), router.indexOf("  // A new tab whose first page is open elsewhere closes and switches there."))
    + router.slice(router.indexOf("  function allowCopy("), router.indexOf("  function takeCopy("));
  const log = { native: [], switched: [], placed: [] }, copies = new Map(), microtasks = [];
  const groups = { Local: { label: "Local", isConnected: true, addTabs(tabs) { for (const t of tabs) { t.group = this; log.placed.push(t.id); } } } };
  let ctx;
  ctx = vm.createContext({ URL, URLSearchParams, Services: { io: { newURI: url => { const u = new URL(url); return { spec: url, host: u.hostname }; } },
      scriptSecurityManager: { getSystemPrincipal: () => "system" } },
    window: { openLinkIn: native ? (...a) => native(log, ctx, ...a) : (...a) => log.native.push(a), gZenWorkspaces: { activeWorkspace: "ws1" } },
    gBrowser: { getTabForBrowser: () => null, addTab: () => null }, retired: false, note: () => {},
    bool: (k, d) => k === "enabled" ? enabled : k === "follow-containers" ? true : d, switchOn: () => true, privateWindow: false,
    pageKey: u => { try { return new URL(u).host + new URL(u).pathname; } catch { return null; } },
    contextOf: () => 0, copyAllowed: () => copies, COPY_MS: 10000, openTabFor: (c, key) => open.get(key) || null,
    openTargetFor: (c, key) => open.has(key) ? { tab: open.get(key) } : null,
    goTo: target => { log.switched.push(target.tab.id); return target.tab.id; },
    switchTo: tab => log.switched.push(tab.id),
    hostOf: t => t.linkedBrowser.currentURI.host, targetPath: () => (plan ? ["Local"] : null),
    resolveDestination: () => ({ ws: "ws1", ctx: plan?.ctx ?? null }), findChild: name => groups[name] || null,
    queueMicrotask: fn => microtasks.push(fn) });
  vm.runInContext(src + "\nthis.openLinkIn = openLinkIn; this.copyWhile = copyWhile; this.placeOpened = placeOpened;", ctx);
  return { ctx, log, copies, microtasks, groups };
}

test("A new-tab open of a page that is already open switches before any tab exists; Alt opens a counted copy", () => {
  const b = { id: "b" };
  const { ctx, log, copies } = opener({ open: new Map([["example.com/b", b]]) });
  ctx.openLinkIn("https://example.com/b", "tab", { userContextId: 0 });
  assert.deepEqual(log.switched, ["b"]);
  assert.equal(log.native.length, 0, "Firefox never creates the tab");
  copies.set("0|example.com/never-loaded", Date.now() - 10000);
  ctx.copyWhile(() => ctx.openLinkIn("https://example.com/b", "tab", {}));
  assert.equal(log.native.length, 1, "an Alt-click opens the copy");
  assert.ok(copies.has("0|example.com/b"), "and the copy's first page is not switched away afterwards");
  assert.ok(!copies.has("0|example.com/never-loaded"), "a copy whose tab never loaded is let go");
  ctx.openLinkIn("https://example.com/b", "current", {});
  ctx.openLinkIn("https://example.com/c", "tab", {});
  assert.equal(log.native.length, 3, "same-tab loads and pages that are not open go through");
  assert.deepEqual(log.switched, ["b"]);
});

test("With routing on, a new tab is filed into its existing folder as it is created, in the routed container", () => {
  const { ctx, log, microtasks } = opener({ enabled: true, plan: { ctx: 3 }, native: (log, ctx, url, where, params) => {
    log.native.push([url, where, params]);
    ctx.placeOpened({ target: { id: "new", group: null, pinned: false, closing: false, hasAttribute: () => false } });
  } });
  ctx.openLinkIn("https://example.com/c", "tab", { userContextId: 0 });
  assert.equal(log.native[0][2].userContextId, 3, "the container Zen's route asks for, before the tab exists");
  assert.equal(microtasks.length, 1);
  microtasks[0]();
  assert.deepEqual(log.placed, ["new"], "filed into the existing folder before anything is drawn");
});

test("Tab Router, its page side and Groupflow agree on what the same page is", () => {
  const extract = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
  const keys = [];
  for (const [src, start, end] of [
    [router, "  const TRACKING =", "  const switchOn ="],
    [groupflow, "  const TRACKING =", "  function startFolderPages()"]]) {
    const ctx = vm.createContext({ URL, URLSearchParams });
    vm.runInContext(extract(src, start, end) + "\nthis.pageKey = pageKey;", ctx);
    keys.push(ctx.pageKey);
  }
  keys.push(child().pageKey);
  for (const url of ["https://www.youtube.com/watch?v=x&si=a", "https://nexusmods.com/games/x/?utm_medium=y#mods",
    "http://127.0.0.1:8080/a/", "https://music.youtube.com/channel/z", "about:blank"]) {
    assert.equal(new Set(keys.map(k => k(url))).size, 1, url);
  }
});

test("An unloaded tab restored after a restart is known by its saved address", () => {
  const src = router.slice(router.indexOf("  const lazyURLs = new WeakMap();"), router.indexOf("  const forgetLazy ="));
  let reads = 0;
  const ctx = vm.createContext({ window: { SessionStore: { getTabState: () => { reads++; return JSON.stringify({ index: 2, entries: [{ url: "https://a.example/" }, { url: "https://b.example/page" }] }); } } } });
  vm.runInContext(src + "\nthis.tabURL = tabURL;", ctx);
  const tab = { linkedBrowser: { currentURI: { spec: "about:blank" } }, hasAttribute: n => n === "pending" };
  assert.equal(ctx.tabURL(tab), "https://b.example/page", "the current entry of its history");
  ctx.tabURL(tab);
  assert.equal(reads, 1, "read once while it stays unloaded");
  const loaded = { linkedBrowser: { currentURI: { spec: "https://c.example/" } }, hasAttribute: () => false };
  assert.equal(ctx.tabURL(loaded), "https://c.example/");
});

test("A link clicked in a folder's own page opens in its own tab; elsewhere it navigates as usual", () => {
  const { sent, click } = child([], [7]);
  let e = click("https://example.com/next");
  assert.ok(e.prevented);
  assert.deepEqual(sent.pop(), ["ZzRouter:OpenFromPage", { href: "https://example.com/next" }]);
  e = click("https://example.com/a#part");
  assert.ok(!e.prevented, "an anchor on the page itself stays");
  e = click("https://example.com/next", { altKey: true });
  assert.ok(!e.prevented, "Alt navigates the page itself");
  const other = child([], [99]);
  e = other.click("https://example.com/next");
  assert.ok(!e.prevented && other.sent.length === 0, "an ordinary tab navigates");
});

test("A link to a folder's page goes to the folder, ahead of a Favorite showing it, even before the folder's tab exists", () => {
  const fn = name => { const i = router.indexOf(`  function ${name}(`); return router.slice(i, router.indexOf("\n  }\n", i) + 4); };
  const gen = router.slice(router.indexOf("  const FOLDERS ="), router.indexOf("  function folderFor("));
  const opened = [], switched = [];
  const memberTab = { getAttribute: a => (a === "usercontextid" ? "0" : null), hasAttribute: () => false, closing: false };
  const folder = { id: "e33", label: "E33", tabs: [memberTab], closest: () => null };
  const favorite = { id: "fav", label: "Nexus", url: "https://nexusmods.com/games/e33" };
  const win = { closed: false, document: { querySelectorAll: () => [folder] },
    Groupflow: { folderPage: g => (g === folder ? "https://www.nexusmods.com/games/e33/" : null), openFolderPage: g => { opened.push(g.id); return true; } } };
  const ctx = vm.createContext({ window: win, Services: { wm: { getEnumerator: () => [win] } },
    pageKey: u => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""), contextOf: t => +(t.getAttribute("usercontextid") || 0),
    openTabFor: (c, key) => (key === "nexusmods.com/games/e33" || key === "nexusmods.com/other" ? favorite : null),
    switchTo: t => switched.push(t.id), note: () => {}, openPage: () => null });
  vm.runInContext(`${gen}\n${fn("folderFor")}\n${fn("openTargetFor")}\n${fn("goTo")}\nthis.openTargetFor = openTargetFor; this.goTo = goTo;`, ctx);
  const target = ctx.openTargetFor(0, "nexusmods.com/games/e33", favorite);
  assert.equal(target.folder?.group, folder, "the folder, not the Favorite");
  ctx.goTo(target);
  assert.deepEqual(opened, ["e33"], "Groupflow opens the folder's own tab, hidden as its header from the start");
  assert.equal(ctx.openTargetFor(0, "nexusmods.com/other").tab, favorite, "pages no folder stands for still go to their tab");
  assert.equal(ctx.openTargetFor(0, "nowhere.example"), null, "and pages open nowhere navigate as usual");
});

test("A folder's container is its other tabs'; a page tab alone in another container is Groupflow's to replace", () => {
  const fn = name => { const i = router.indexOf(`  function ${name}(`); return router.slice(i, router.indexOf("\n  }\n", i) + 4); };
  const gen = router.slice(router.indexOf("  const FOLDERS ="), router.indexOf("  function folderFor("));
  const opened = [], switched = [];
  const tab = (id, ctx, attrs = {}) => ({ id, closing: false, linkedBrowser: { currentURI: { spec: "https://www.youtube.com/" } },
    getAttribute: a => (a === "usercontextid" ? String(ctx) : attrs[a] ?? null), hasAttribute: a => a in attrs });
  const page = tab("page", 0, { "zzgf-page-of": "yt" }), video = tab("video", 6);
  const folder = { id: "yt", label: "Youtube", tabs: [page, video], closest: () => null };
  const win = { closed: false, document: { querySelectorAll: () => [folder] },
    Groupflow: { folderPage: () => "https://youtube.com/", openFolderPage: g => { opened.push(g.id); return true; } } };
  const ctx = vm.createContext({ window: win, Services: { wm: { getEnumerator: () => [win] } },
    pageKey: u => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""), contextOf: t => +(t.getAttribute("usercontextid") || 0),
    openTabFor: () => null, liveTwin: t => t, switchTo: t => switched.push(t.id), note: () => {}, openPage: () => null });
  vm.runInContext(`${gen}\n${fn("folderFor")}\n${fn("openTargetFor")}\n${fn("goTo")}\nthis.openTargetFor = openTargetFor; this.goTo = goTo;`, ctx);
  const target = ctx.openTargetFor(6, "youtube.com");
  assert.equal(target?.folder?.ctx, 6, "the folder counts in its signed-in tabs' container, not its page tab's");
  ctx.goTo(target);
  assert.deepEqual([switched, opened], [[], ["yt"]], "the page tab in no container is not shown: Groupflow replaces it");
  page.getAttribute = a => (a === "usercontextid" ? "6" : a === "zzgf-page-of" ? "yt" : null);
  ctx.goTo(ctx.openTargetFor(6, "youtube.com"));
  assert.deepEqual(switched, ["page"], "one in the folder's container is gone to directly");
  // This window's copy of the page tab is unloaded (after a restart, or a
  // window opened later): the switch goes to the copy showing it elsewhere.
  const twinB = tab("page-in-B", 6, { "zzgf-page-of": "yt" });
  ctx.liveTwin = t => (t === page ? twinB : t);
  ctx.goTo(ctx.openTargetFor(6, "youtube.com"));
  assert.equal(switched.pop(), "page-in-B", "a folder's unloaded page tab goes to its live copy in another window");
  ctx.liveTwin = t => t;
  // A no-container tab with history ahead of the rest sets the folder's
  // container, yet the page tab shares the other tabs': it is kept.
  folder.tabs.unshift(tab("old", 0));
  ctx.goTo(ctx.openTargetFor(0, "youtube.com"));
  assert.deepEqual([switched, opened], [["page", "page"], ["yt"]], "a page tab sharing its container is gone to directly too");
});

test("A folder's page tab is never switched away on its first load, redirects included", () => {
  const i = router.indexOf("  const passedTabs = new WeakSet();");
  const body = router.slice(i, router.indexOf("\n  }\n", router.indexOf("  function switchFirstRequest(", i)) + 4);
  const copies = new Map(), cancelled = [], favorite = { id: "fav" };
  const ctx = vm.createContext({ switchOn: () => true, contextOf: () => 0, pageKey: u => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""),
    takeCopy: (c, key) => { const at = copies.get(`${c}|${key}`); copies.delete(`${c}|${key}`); return !!at; },
    openTargetFor: () => ({ tab: favorite }), goTo: () => "", note: () => {}, setTimeout: fn => fn(), Components: { results: {} },
    gBrowser: { removeTab: () => { throw new Error("the folder's tab must not be closed"); } } });
  vm.runInContext(body + "\nthis.first = switchFirstRequest;", ctx);
  const tab = attrs => ({ hasAttribute: a => attrs.includes(a), isConnected: true, closing: false });
  const channel = url => ({ URI: { spec: url }, cancel: () => cancelled.push(url) });
  assert.equal(ctx.first(tab(["zzgf-page-of"]), channel("https://www.nexusmods.com/")), false, "a folder's own page tab loads");
  const copy = tab([]);
  copies.set("0|nexusmods.com", Date.now());
  assert.equal(ctx.first(copy, channel("https://nexusmods.com/")), false);
  assert.equal(ctx.first(copy, channel("https://www.nexusmods.com/")), false, "and its redirect is let through too");
  assert.deepEqual(cancelled, []);
});

// Two browser windows, each running the same production slice, and one
// URILoadingHelper shared by both. Its switch to an open tab is modelled on
// Firefox's own (which the address bar calls directly): raise the window
// holding the tab, then show it there through Zen's switchIfNeeded.
const between = (start, end) => router.slice(router.indexOf(start), router.indexOf(end));
function windows(slice, extra = () => ({})) {
  const focus = { activeWindow: null }, marked = [], raised = [], all = [];
  const helper = { switchToTabHavingURI: (source, target) => {
    target.focus(); target.gZenWorkspaces.switchIfNeeded(target.tab.linkedBrowser); return true; } };
  const native = helper.switchToTabHavingURI;
  const make = name => {
    const tab = { id: `${name}-tab`, linkedBrowser: {} };
    const win = { name, focus() { raised.push(name); },
      gBrowser: { getTabForBrowser: b => (b === tab.linkedBrowser ? tab : null) },
      gZenWorkspaces: { selected: null,
        switchIfNeeded(browser) { return this.switchTabIfNeeded(win.gBrowser.getTabForBrowser(browser)); },
        async switchTabIfNeeded(t) { this.selected = t; } },
      TabRouter: { copyWhile() {}, markArrival: t => marked.push([name, t.id]) } };
    tab.ownerDocument = { defaultView: win };
    const ctx = vm.createContext({ window: win, gBrowser: win.gBrowser, note: () => {},
      Services: { focus, wm: { getEnumerator: () => all } },
      ChromeUtils: { importESModule: () => ({ URILoadingHelper: helper }) },
      markArrival: t => marked.push([name, t.id]), liveTwin: t => t, ...extra(name) });
    vm.runInContext(slice, ctx);
    all.push(win);
    return Object.assign(win, { tab, ctx });
  };
  return { A: make("A"), B: make("B"), focus, marked, raised, helper, native };
}

test("Firefox's Switch to Tab marks the arrival in the window it lands in, and only there", () => {
  const patch = between("  // Firefox's own switch to an open tab", "  function copyWhile(fn) {");
  const { A, B, focus, marked, raised, helper, native } = windows(patch
    + "\npatchSwitchToTab(); window.gZenWorkspaces.switchIfNeeded = switchIfNeeded; this.unpatch = unpatchSwitchToTab;");
  assert.notEqual(helper.switchToTabHavingURI, native, "patched once, for every window");
  focus.activeWindow = A;
  assert.equal(helper.switchToTabHavingURI(A, B), true, "Firefox's answer is passed through");
  assert.deepEqual(raised, ["B"]);
  assert.deepEqual(marked, [["B", "B-tab"]], "the address bar in A lands in B: B marks its tab");
  assert.equal(B.gZenWorkspaces.selected, B.tab);
  marked.length = 0;
  helper.switchToTabHavingURI(A, A);
  assert.deepEqual(marked, [], "a switch within the window you are in is not an arrival");
  B.gZenWorkspaces.switchIfNeeded(B.tab.linkedBrowser);
  assert.deepEqual(marked, [], "nor is Zen's switchIfNeeded on its own (Picture-in-Picture's Back to tab)");
  focus.activeWindow = { name: "Library" };
  helper.switchToTabHavingURI(A, A);
  assert.deepEqual(marked, [["A", "A-tab"]], "asked from another window (a Library window), the browser window marks it");
  marked.length = 0;
  focus.activeWindow = null;
  helper.switchToTabHavingURI(A, B);
  assert.deepEqual(marked, [], "asked from another app, the window is raised with no cue");
  assert.equal(helper.switchToTabHavingURI.switchingFrom, undefined, "the note lasts only as long as the call");
  A.TabRouter = null;
  B.ctx.unpatch();
  assert.equal(helper.switchToTabHavingURI, native, "the last window to release restores Firefox's own");
});

test("An unloaded copy of a synced tab stands for the copy whose page is loaded in another window", () => {
  const fn = name => { const i = router.indexOf(`  function ${name}(`); return router.slice(i, router.indexOf("\n  }\n", i) + 4); };
  const make = name => ({ name, closed: false, gBrowser: { tabs: [] } });
  const A = make("A"), B = make("B");
  const tab = (win, id, url, attrs = {}) => {
    const t = { id, url, closing: false, ownerGlobal: win, get linkedBrowser() { return { currentURI: { spec: this.url } }; },
      hasAttribute: a => !!attrs[a], getAttribute: () => null };
    win.gBrowser.tabs.push(t);
    return t;
  };
  // After a restart every copy is restored unloaded with its page's address;
  // the page was then opened in B. A's copy still carries the address.
  const copyA = tab(A, "x", "b", { pending: true }), liveB = tab(B, "x", "b");
  const ctx = vm.createContext({ window: A, Services: { wm: { getEnumerator: () => [A, B] } },
    allWindowTabs: function* () { yield* A.gBrowser.tabs; yield* B.gBrowser.tabs; },
    eligibleTab: () => true, contextOf: () => 0, tabURL: t => t.url, pageKey: u => u });
  const line = start => { const i = router.indexOf(start); return router.slice(i, router.indexOf("\n", i) + 1); };
  vm.runInContext(`${line("  const windowTabs =")}${line("  const unloaded =")}${fn("liveTwin")}\n${fn("openTabFor")}\nthis.openTabFor = openTabFor; this.liveTwin = liveTwin;`, ctx);
  assert.equal(ctx.openTabFor(0, "b"), liveB, "the window showing the page, not A's unloaded copy");
  assert.equal(ctx.openTabFor(0, "b", liveB), null, "the tab asking is never its own answer");
  liveB.url = "c";
  assert.equal(ctx.openTabFor(0, "b"), null, "a copy whose page moved on in B is not that page");
  const other = tab(B, "y", "b");
  assert.equal(ctx.openTabFor(0, "b"), other, "another tab showing it still counts");
  B.gBrowser.tabs.length = 0;
  tab(B, "x", "b", { pending: true });
  assert.equal(ctx.openTabFor(0, "b"), copyA, "unloaded everywhere: the window you are in first, as before");
  const loadedA = tab(A, "z", "d");
  tab(B, "z", "about:blank");
  assert.equal(ctx.openTabFor(0, "d"), loadedA, "a loaded copy is itself");
  assert.equal(ctx.liveTwin(copyA), copyA, "copies elsewhere unloaded or blank: a copy stands for itself");
});

test("Pages open in any space of any window count, and a blank copy stands for the copy showing its page", () => {
  const fn = name => { const i = router.indexOf(`  function ${name}(`); return router.slice(i, router.indexOf("\n  }\n", i) + 4); };
  const gen = router.slice(router.indexOf("  const windowTabs ="), router.indexOf("  // Zen keeps a copy of every tab"));
  const line = start => { const i = router.indexOf(start); return router.slice(i, router.indexOf("\n", i) + 1); };
  const tab = (win, id, url, attrs = {}) => ({ id, url, closing: false, ownerGlobal: win,
    get linkedBrowser() { return { currentURI: { spec: this.url } }; }, hasAttribute: a => !!attrs[a], getAttribute: () => null });
  // Zen 1.24: gBrowser.tabs is the space on show; stored tabs are every space's.
  const A = { name: "A", closed: false, gBrowser: { tabs: [] }, gZenWorkspaces: { allStoredTabs: [] } };
  const B = { name: "B", closed: false, gBrowser: { tabs: [] }, gZenWorkspaces: { allStoredTabs: [] } };
  const hub = tab(A, "h", "hub");
  A.gBrowser.tabs.push(hub);
  const blankA = tab(A, "p", "about:blank"), otherSpaceB = tab(B, "p", "page");
  A.gZenWorkspaces.allStoredTabs.push(hub, blankA);
  B.gZenWorkspaces.allStoredTabs.push(tab(B, "h", "about:blank"), otherSpaceB);
  const ctx = vm.createContext({ window: A, Services: { wm: { getEnumerator: () => [A, B] } },
    eligibleTab: () => true, contextOf: () => 0, tabURL: t => t.url, pageKey: u => u });
  vm.runInContext(`${gen}${line("  const unloaded =")}${fn("liveTwin")}\n${fn("openTabFor")}\nthis.openTabFor = openTabFor; this.liveTwin = liveTwin;`, ctx);
  assert.equal(ctx.openTabFor(0, "page"), otherSpaceB, "a page in a space B is not showing is still open");
  assert.equal(ctx.liveTwin(blankA), otherSpaceB, "A's blank copy (a folder's page tab, say) stands for B's");
  assert.equal(ctx.liveTwin(hub), hub, "a copy showing its page is itself");
});

test("Firefox's Switch to Tab to an unloaded copy in your window goes to the window showing its page", () => {
  const patch = between("  // Firefox's own switch to an open tab", "  function copyWhile(fn) {");
  const switched = [];
  const { A, B, focus, marked, helper } = windows(patch
    + "\npatchSwitchToTab(); window.gZenWorkspaces.switchIfNeeded = switchIfNeeded;", name => ({
      liveTwin: t => (name === "A" && t.id === "A-tab" ? twinOf.B : t), switchTo: t => switched.push(t.id) }));
  const twinOf = { B: B.tab };
  A.tab.linkedBrowser.currentURI = B.tab.linkedBrowser.currentURI = { spec: "https://example.com/b" };
  focus.activeWindow = A;
  // Firefox looks in A first and finds A's copy, restored unloaded with the address.
  helper.switchToTabHavingURI(A, A);
  assert.deepEqual(switched, ["B-tab"], "Tab Router's switch to B: B is raised and marks the arrival");
  assert.equal(A.gZenWorkspaces.selected, null, "A's copy is not picked, so the page stays in B");
  B.tab.linkedBrowser.currentURI = { spec: "https://example.com/elsewhere" };
  switched.length = 0;
  helper.switchToTabHavingURI(A, A);
  assert.deepEqual([switched, A.gZenWorkspaces.selected, marked], [[], A.tab, []], "moved on in B: Firefox's own choice stands");
});

test("Tab Router's switch raises the window holding the tab, and marks the arrival when it is not the one you are in", () => {
  const { A, B, focus, marked, raised } = windows(between("  // The window you are in is the active one", "  // A switch that lands you in another window gives")
    + "\nthis.switchTo = switchTo;");
  const reset = () => { raised.length = 0; marked.length = 0; };
  focus.activeWindow = A;
  A.ctx.switchTo(B.tab);
  assert.deepEqual([raised, marked], [["B"], [["B", "B-tab"]]], "a link in A to a page open in B");
  reset();
  A.ctx.switchTo(A.tab);
  assert.deepEqual([raised, marked], [[], []], "a page open in the window you are in");
  focus.activeWindow = { name: "Library" };
  A.ctx.switchTo(A.tab);
  assert.deepEqual([raised, marked], [["A"], [["A", "A-tab"]]], "a bookmark opened from the Library brings its browser window forward");
  reset();
  focus.activeWindow = null;
  A.ctx.switchTo(A.tab);
  assert.deepEqual([raised, marked], [["A"], []], "from another app: raised, as Firefox would, with no cue");
});

// The opacity Web Animations computes at each millisecond: the effect's easing
// maps the time to the iteration's progress, then the keyframe that opens each
// interval eases it (CSS Easing's cubic-béziers).
const BEZIER = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
function ease(name = "linear", x) {
  const curve = BEZIER[name] || /^cubic-bezier\(([^)]*)\)$/.exec(name)?.[1].split(",").map(Number);
  assert.ok(curve?.length === 4, `known easing ${name}`);
  const [x1, y1, x2, y2] = curve, at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < x) lo = mid; else hi = mid; }
  return at(y1, y2, (lo + hi) / 2);
}
function valueByMs(keyframes, { duration, easing }, read) {
  const offsets = keyframes.map((k, i) => k.offset ?? (i === 0 ? 0 : i === keyframes.length - 1 ? 1 : null));
  assert.ok(!offsets.includes(null), "every middle keyframe names its offset");
  return Array.from({ length: duration + 1 }, (_, ms) => {
    const p = ease(easing, ms / duration);
    let i = 0;
    while (i < keyframes.length - 2 && p > offsets[i + 1]) i++;
    const local = (p - offsets[i]) / (offsets[i + 1] - offsets[i]);
    return read(keyframes[i]) + (read(keyframes[i + 1]) - read(keyframes[i])) * ease(keyframes[i].easing, local);
  });
}
const opacityByMs = (keyframes, options) => valueByMs(keyframes, options, k => k.opacity);
const scaleByMs = (keyframes, options) => valueByMs(keyframes, options, k => Number(/scaleX\(([\d.]+)\)/.exec(k.transform)[1]));
const atFullStrength = curve => [curve.findIndex(o => o >= 0.99), curve.findLastIndex(o => o >= 0.99)];

test("The timing model matches Web Animations: an effect's easing bends the time to every keyframe", () => {
  // 440fa45 ran ease-in-out over the whole effect: its 0.12 keyframe came at
  // 265 ms, not 132 (Windows CI measured full strength 269 ms after the ring was added).
  const [bent] = atFullStrength(opacityByMs([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }],
    { duration: 1100, easing: "ease-in-out" }));
  assert.ok(bent > 250 && bent < 290, `ease-in-out over the effect: full at ${bent} ms`);
  const [straight] = atFullStrength(opacityByMs([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 1100 }));
  assert.ok(Math.abs(straight - 131) <= 1, `linear: full at ${straight} ms`);
});

test("Two gleams slide in from the sides along the page's and the tab's bottom once the switch is done, meet, hold, and go", async () => {
  const appended = [], frames = [], settle = () => new Promise(setImmediate);
  let reduced = false;
  const element = () => ({ style: {}, children: [], setAttribute() {}, remove() { this.removed = true; },
    appendChild(child) { this.children.push(child); return child; },
    animate(keyframes, options) {
      let finish;
      const finished = new Promise(r => { finish = r; });
      (this.anims ||= []).push({ keyframes, options, finish });
      return { finished };
    } });
  // Boxes with a place on screen and rounded bottom corners; a holder takes gleams as children.
  const box = (left, top, width, height, position = "relative", radius = "0px") => ({ position, radius, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    appendChild(el) { appended.push(el); el.holder = this; } });
  const page = box(200, 8, 760, 1064, "absolute", "10px"), tabbox = box(200, 8, 760, 1064), panels = box(200, 8, 760, 1064);
  const stack = box(4, 156, 180, 44), background = { ...box(8, 160, 172, 36, "static", "6px"), parentNode: stack };
  const ctx = vm.createContext({ retired: false, innerHeight: 1080,
    document: { documentElement: {}, createElementNS: element, getElementById: id => ({ "tabbrowser-tabbox": tabbox, "tabbrowser-tabpanels": panels })[id] },
    getComputedStyle: el => ({ getPropertyValue: () => " rgb(1, 2, 3) ", position: el.position,
      borderBottomLeftRadius: el.radius, borderBottomRightRadius: el.radius }),
    matchMedia: () => ({ matches: reduced }), requestAnimationFrame: fn => frames.push(fn) });
  vm.runInContext(between("  // A switch that lands you in another window gives", "  // Every window publishes the whole set")
    + "\nthis.markArrival = markArrival; this.arrivals = arrivals;", ctx);
  const tab = { isConnected: true, closing: false, hasAttribute: () => false, linkedBrowser: { closest: () => page },
    querySelector: () => background };
  const draw = async (which = tab) => { ctx.markArrival(which); await settle(); frames.shift()(); };
  const props = k => Object.keys(k).filter(p => p !== "offset" && p !== "easing").join();
  let switched;
  ctx.markArrival(tab, new Promise(r => { switched = r; }));
  await settle();
  assert.equal(frames.length, 0, "nothing is drawn while the switch (or a change of space) is under way");
  switched();
  await settle();
  frames.shift()();
  assert.equal(appended.length, 2, "one pair below the page, one along the tab");
  const [pageLine, tabLine] = appended;
  // The tab panels are a deck that paints only the selected panel: the tab box holds it.
  assert.deepEqual([pageLine.holder === tabbox, pageLine.style.left, pageLine.style.top, pageLine.style.width, pageLine.style.height],
    [true, "10px", "1063px", "740px", "10px"], "the page's gleams run on the window's margin below it, centred in it, between the corners");
  assert.deepEqual([tabLine.holder === stack, tabLine.style.left, tabLine.style.top, tabLine.style.width, tabLine.style.height],
    [true, "10px", "32px", "160px", "8px"], "the tab's run along its bottom, in the tab, and move with it");
  assert.deepEqual([pageLine.style.position, pageLine.style.overflow, pageLine.style.pointerEvents], ["absolute", "clip", "none"]);
  const [left, right] = pageLine.children;
  assert.deepEqual([left.style.left, right.style.right, left.style.width, left.style.height, left.style.bottom],
    ["-220px", "-220px", "220px", "2px", "4px"], "each starts just beyond its side, a thin line centred in the margin");
  assert.match(left.style.background, /^linear-gradient\(to right, transparent, /, "brightest at its head");
  assert.match(right.style.background, /^linear-gradient\(to left, transparent, /);
  assert.ok(tabLine.children[0].style.width === "48px" && tabLine.children[0].style.bottom === "1px", "a tab's are shorter, at its edge");
  for (const [gleam, sign] of [[left, 1], [right, -1]]) {
    const [slide] = gleam.anims;
    assert.deepEqual(Array.from(slide.keyframes, props), ["transform", "transform", "transform"], "transform only");
    assert.equal(slide.keyframes[1].transform, `translateX(${sign * 370}px)`, "its head reaches the middle");
    const at = valueByMs(slide.keyframes, slide.options, k => Math.abs(Number(/translateX\((-?[\d.]+)(?:px)?\)/.exec(k.transform)[1]))),
      met = at.findIndex(v => v >= 369.9);
    assert.ok(at[0] < 1e-6 && met > 380 && met <= 450, `slides in and meets the other at ${met} ms`);
    assert.ok(at.every((v, ms) => !ms || v >= at[ms - 1] - 1e-9), "never slides back");
  }
  const [fade] = pageLine.anims;
  assert.deepEqual(Array.from(fade.keyframes, props), ["opacity", "opacity", "opacity"], "they fade together: opacity only");
  // Real times, as Web Animations runs them: a window drawing few frames as it
  // comes forward (software WebRender) still catches them while they hold.
  const curve = opacityByMs(fade.keyframes, fade.options), [, fullUntil] = atFullStrength(curve);
  assert.equal(fade.options.duration, 900);
  assert.ok(curve[0] === 1 && fullUntil >= 600 && curve.at(-1) < 1e-6, `whole until ${fullUntil} ms, then gone at 900`);
  assert.ok(curve.every((o, ms) => !ms || o <= curve[ms - 1] + 1e-9), "fades once, with no flicker");
  // A page-sized blurred shadow costs software WebRender hundreds of ms a frame (Windows CI, real pixels).
  for (const el of [pageLine, tabLine]) assert.ok(!el.style.boxShadow && !el.style.filter && !el.style.backdropFilter, "nothing page-sized is blurred");
  fade.finish();
  await settle();
  assert.ok(pageLine.removed && !ctx.arrivals.has(pageLine), "they remove themselves when they end");
  assert.equal(ctx.arrivals.size, 1, "the other pair is still live, for release to remove");
  reduced = true;
  await draw();
  const still = appended[2];
  assert.ok(still.children.every(g => !g.anims && g.style.transform === `translateX(${g.style.left ? 370 : -370}px)`), "with reduced motion they do not move: met at once");
  assert.equal(still.anims[0].options.duration, 700, "and fade");
  const quiet = opacityByMs(still.anims[0].keyframes, still.anims[0].options), [quietAt, quietUntil] = atFullStrength(quiet);
  assert.ok(quietAt === 0 && quietUntil >= 450 && quiet.at(-1) < 1e-6, `reduced motion: whole from 0 to ${quietUntil} ms`);
  reduced = false;
  // A page that reaches the window's bottom keeps them along its own edge.
  ctx.innerHeight = 1072;
  await draw();
  assert.ok(appended[4].holder === page && appended[4].style.top === "1056px" && appended[4].children[0].style.bottom === "1px",
    "with no margin below, along the page's own bottom edge");
  ctx.innerHeight = 1080;
  stack.position = "static";
  await draw();
  assert.equal(appended.length, 7, "a holder that cannot place them gets none");
  stack.position = "relative";
  // Below the fold: selecting it scrolls it into view, and its gleams ride along.
  await draw({ ...tab, querySelector: () => ({ ...box(8, 1808, 172, 36, "static", "6px"), parentNode: stack }) });
  assert.ok(appended.length === 9 && appended[8].holder === stack && appended[8].style.top === "1680px",
    "a tab still scrolling into view gets its gleams, in the tab");
  // A folder's page tab is hidden behind its header, which takes them.
  const header = box(5, 122, 176, 40);
  await draw({ ...tab, hasAttribute: name => name === "zzgf-page-tab", group: { querySelector: () => header },
    querySelector: () => ({ ...box(0, 0, 0, 0, "static"), parentNode: stack }) });
  assert.ok(appended.length === 11 && appended[10].holder === header && appended[10].style.left === "0px" && appended[10].style.top === "32px",
    "a folder's page is marked along its header's bottom");
  ctx.retired = true;
  ctx.markArrival(tab);
  await settle();
  frames.shift()();
  assert.equal(appended.length, 11, "a released copy draws nothing");
});

test("The arrival gleams are white on a dark window and the accent's hue at a lightness that shows on a light one", async () => {
  const bars = [], frames = [];
  const element = () => ({ style: {}, children: [], setAttribute() {}, remove() {}, appendChild(child) { this.children.push(child); return child; },
    animate: () => ({ finished: new Promise(() => {}) }) });
  const box = position => ({ position, clientLeft: 0, clientTop: 0, appendChild(el) { bars.push(el); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }) });
  const page = box("absolute"), background = { ...box("static"), parentNode: box("relative") };
  let relative = true;
  const ctx = vm.createContext({ retired: false, innerHeight: 40, CSS: { supports: (p, v) => relative && p === "color" && v.startsWith("light-dark(") },
    document: { documentElement: {}, createElementNS: element, getElementById: () => page },
    getComputedStyle: el => ({ getPropertyValue: () => " rgb(1, 2, 3) ", borderRadius: "8px", position: el.position }),
    matchMedia: () => ({ matches: false }), requestAnimationFrame: fn => frames.push(fn) });
  vm.runInContext(between("  // A switch that lands you in another window gives", "  // Every window publishes the whole set")
    + "\nthis.markArrival = markArrival;", ctx);
  const tab = { isConnected: true, closing: false, hasAttribute: () => false, linkedBrowser: { closest: () => page },
    querySelector: () => background };
  const draw = async () => { ctx.markArrival(tab); await new Promise(setImmediate); frames.shift()(); return bars.splice(0); };
  // Every colour a bar is drawn with, however it is drawn (its own fill and
  // any part inside it).
  const colours = el => [el, ...el.children].flatMap(e => Object.values(e.style).map(String)).filter(v => v.includes("rgb(1, 2, 3)"));
  // White light on a dark window, as a loading bar's; Zen hands a light
  // window a grey or pale accent as it is, so there it is darkened enough to show.
  const lifted = "light-dark(oklch(from rgb(1, 2, 3) min(l, 0.62) c h), white)";
  const drawn = await draw();
  assert.equal(drawn.length, 2, "page and tab");
  for (const bar of drawn) {
    const used = colours(bar);
    assert.ok(used.length && used.every(v => v.includes(lifted) && !v.replaceAll(lifted, "").includes("rgb(1, 2, 3)")),
      `every colour is white on dark, the accent's hue at a lightness that shows on light: ${used.join(" | ")}`);
  }
  relative = false;
  for (const bar of await draw())
    assert.ok(colours(bar).length && colours(bar).every(v => !v.includes("oklch(")), "Zen's accent as it is without relative colour");
  // The README says what the bar does on both kinds of window.
  const readme = (await readFile(new URL("../tab-router/README.md", import.meta.url), "utf8")).replace(/\s+/g, " ");
  const note = readme.match(/two gleams.*?\)\./)?.[0] || "";
  assert.ok(/dark window/.test(note) && /light (one|window)/.test(note), `the README names both windows: ${note}`);
});

test("Release restores Zen's switchIfNeeded and removes live bars", () => {
  const release = between("      // Zen's own switchIfNeeded lives on its prototype", "      // The other windows republish without this one's tabs.");
  const proto = { switchIfNeeded() {} }, workspaces = Object.create(proto), ours = () => {}, glow = { remove() { this.gone = true; } };
  workspaces.switchIfNeeded = ours;
  const ctx = vm.createContext({ workspaces, switchIfNeeded: ours, nativeSwitchIfNeeded: proto.switchIfNeeded, arrivals: new Set([glow]) });
  vm.runInContext(release, ctx);
  assert.ok(!Object.hasOwn(workspaces, "switchIfNeeded") && workspaces.switchIfNeeded === proto.switchIfNeeded, "Zen's own method shows through again");
  assert.ok(glow.gone && ctx.arrivals.size === 0);
});
