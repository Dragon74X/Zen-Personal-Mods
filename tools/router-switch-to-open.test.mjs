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
  const focus = { activeWindow: null }, marked = [], raised = [], departed = [], all = [];
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
      TabRouter: { copyWhile() {}, markArrival: t => marked.push([name, t.id]), markDeparture: () => departed.push(name) } };
    tab.ownerDocument = { defaultView: win };
    const ctx = vm.createContext({ window: win, gBrowser: win.gBrowser, note: () => {},
      Services: { focus, wm: { getEnumerator: () => all } },
      ChromeUtils: { importESModule: () => ({ URILoadingHelper: helper }) },
      markArrival: t => marked.push([name, t.id]), liveTwin: t => t, ...extra(name) });
    vm.runInContext(slice, ctx);
    all.push(win);
    return Object.assign(win, { tab, ctx });
  };
  return { A: make("A"), B: make("B"), focus, marked, raised, departed, helper, native };
}

test("Firefox's Switch to Tab marks the arrival in the window it lands in, and only there", () => {
  const patch = between("  // Firefox's own switch to an open tab", "  function copyWhile(fn) {");
  const { A, B, focus, marked, raised, departed, helper, native } = windows(patch
    + "\npatchSwitchToTab(); window.gZenWorkspaces.switchIfNeeded = switchIfNeeded; this.unpatch = unpatchSwitchToTab;");
  assert.notEqual(helper.switchToTabHavingURI, native, "patched once, for every window");
  focus.activeWindow = A;
  assert.equal(helper.switchToTabHavingURI(A, B), true, "Firefox's answer is passed through");
  assert.deepEqual(raised, ["B"]);
  assert.deepEqual(marked, [["B", "B-tab"]], "the address bar in A lands in B: B marks its tab");
  assert.deepEqual(departed, ["A"], "and A, the window you leave, its departure");
  assert.equal(B.gZenWorkspaces.selected, B.tab);
  marked.length = 0;
  helper.switchToTabHavingURI(A, A);
  assert.deepEqual(marked, [], "a switch within the window you are in is not an arrival");
  B.gZenWorkspaces.switchIfNeeded(B.tab.linkedBrowser);
  assert.deepEqual(marked, [], "nor is Zen's switchIfNeeded on its own (Picture-in-Picture's Back to tab)");
  focus.activeWindow = { name: "Library" };
  helper.switchToTabHavingURI(A, A);
  assert.deepEqual(marked, [["A", "A-tab"]], "asked from another window (a Library window), the browser window marks it");
  assert.deepEqual(departed, ["A"], "a Library window has no departure to show");
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
  const { A, B, focus, marked, raised, departed } = windows(between("  // The window you are in is the active one", "  // A switch that lands you in another window gives")
    + "\nthis.switchTo = switchTo;");
  const reset = () => { raised.length = 0; marked.length = 0; departed.length = 0; };
  focus.activeWindow = A;
  A.ctx.switchTo(B.tab);
  assert.deepEqual([raised, marked, departed], [["B"], [["B", "B-tab"]], ["A"]], "a link in A to a page open in B: B marks the arrival, A the departure");
  reset();
  A.ctx.switchTo(A.tab);
  assert.deepEqual([raised, marked, departed], [[], [], []], "a page open in the window you are in");
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

test("Two pills run in from the sides along the bottom of the page once the switch is done, merge in the middle, and go", async () => {
  const appended = [], frames = [], settle = () => new Promise(setImmediate);
  let reduced = false;
  const element = () => ({ style: {}, children: [], setAttribute() {}, remove() { this.removed = true; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    get lastChild() { return this.children.at(-1); },
    animate(keyframes, options) {
      let finish;
      const finished = new Promise(r => { finish = r; });
      (this.anims ||= []).push({ keyframes, options, finish });
      return { finished };
    } });
  // Boxes with a place on screen and rounded bottom corners; a holder takes them as children.
  const box = (left, top, width, height, position = "relative", radius = "0px") => ({ position, radius, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    appendChild(el) { appended.push(el); el.holder = this; } });
  const page = box(200, 8, 760, 1064, "absolute", "10px"), tabbox = box(200, 8, 760, 1064), panels = box(200, 8, 760, 1064);
  const stack = box(4, 156, 180, 44), background = { ...box(8, 160, 172, 36, "static", "6px"), parentNode: stack };
  // Zen's loading indicator, which carries its colour variable; the Deta
  // Loading Bar mod's colours when it is on.
  let switchDone = null;
  const vars = {};
  const probes = [], indicator = { appendChild(el) { probes.push(el); el.remove = () => { el.removed = true; }; return el; } };
  const colourOf = value => value.startsWith("var(--zen-loading-progress-bar-color") ? "rgba(200, 180, 230, 0.65)"
    : value.startsWith("var(--blended-addressbar-dynamic-loadbar-color") ? "rgb(50, 29, 70)"
    : value === "color-mix(in srgb, rgb(50, 29, 70) 25%, white)" ? "rgb(204, 199, 209)"
    : value.startsWith("var(--mod-detaloadingbar-primarycolor-final") ? "rgb(140, 80, 200)" : value.startsWith("var(--mod-detaloadingbar-secondarycolor-final") ? "rgb(255, 255, 255)" : "?";
  const gBrowser = { _switcher: null, addEventListener: (type, fn) => { if (type === "TabSwitchDone") switchDone = fn; }, removeEventListener() {} };
  const ctx = vm.createContext({ retired: false, innerHeight: 1080, gBrowser, performance,
    setTimeout: (fn, ms) => { if (ms < 1000) fn(); return 0; }, clearTimeout() {},
    document: { documentElement: indicator, createElementNS: element,
      getElementById: id => ({ "tabbrowser-tabbox": tabbox, "tabbrowser-tabpanels": panels, "zen-loading-progress-bar": indicator })[id] },
    getComputedStyle: el => (el.style?.color ? { color: colourOf(el.style.color) }
      : { position: el.position, borderBottomLeftRadius: el.radius, borderBottomRightRadius: el.radius, getPropertyValue: name => vars[name] || "" }),
    matchMedia: () => ({ matches: reduced }), requestAnimationFrame: fn => frames.push(fn) });
  vm.runInContext(between("  // A window that has to show another page first is still painting it", "  // Every window publishes the whole set")
    + "\nthis.markArrival = markArrival; this.markDeparture = markDeparture; this.arrivals = arrivals;", ctx);
  const tab = { isConnected: true, closing: false, hasAttribute: () => false, linkedBrowser: { closest: () => page },
    querySelector: () => background };
  gBrowser.selectedTab = tab;
  const draw = async (which = tab) => { ctx.markArrival(which); await settle(); frames.shift()(); };
  const props = k => Object.keys(k).filter(p => p !== "offset" && p !== "easing").join();
  const shift = k => Number(/translateX\((-?[\d.]+)(?:px)?\)/.exec(k.transform)?.[1] ?? 0);
  let switched;
  ctx.markArrival(tab, new Promise(r => { switched = r; }));
  await settle();
  assert.equal(frames.length, 0, "nothing is drawn while the switch (or a change of space) is under way");
  switched();
  await settle();
  frames.shift()();
  assert.equal(appended.length, 1, "one pair, below the page; none on the tab");
  const [pageLine] = appended;
  // The tab panels are a deck that paints only the selected panel: the tab box holds it.
  assert.deepEqual([pageLine.holder === tabbox, pageLine.style.left, pageLine.style.top, pageLine.style.width, pageLine.style.height],
    [true, "10px", "1063px", "740px", "10px"], "the page's run on the window's margin below it, centred in it, between the corners");
  assert.deepEqual([pageLine.style.position, pageLine.style.overflow, pageLine.style.pointerEvents], ["absolute", "clip", "none"]);
  const [merged, left, right] = pageLine.children;
  // Pills: rounded ends front and back, in the colour Zen's loading indicator is drawn in, read inside it.
  for (const pill of [merged, left, right]) {
    assert.deepEqual([pill.style.height, pill.style.borderRadius, pill.style.bottom], ["4px", "4px", "3px"], "a pill, centred in the margin");
    assert.ok(pill.style.background.includes("rgba(200, 180, 230, 0.65)") && !pill.style.background.includes("var("),
      `Zen's loading indicator's own colour: ${pill.style.background}`);
  }
  assert.ok(probes.length && probes.every(p => p.removed && p.style.color.startsWith("var(--zen-loading-progress-bar-color, color-mix(in srgb, var(--zen-primary-color), ")),
    "read inside the indicator, from its variable or Zen's own mix, and nothing left behind");
  assert.deepEqual([left.style.left, right.style.right, left.style.width, merged.style.left, merged.style.width],
    ["-184px", "-184px", "160px", "258px", "224px"], "each starts beyond its side, glow and all off screen; they merge into one centred pill");
  for (const [gleam, sign] of [[left, 1], [right, -1]]) {
    const [run] = gleam.anims;
    assert.deepEqual(Array.from(run.keyframes, props), ["transform,opacity", "transform,opacity", "transform,opacity", "transform,opacity"],
      "transform and opacity only");
    assert.equal(shift(run.keyframes[1]), sign * 398, "its head runs from off screen to just past the middle, into the other");
    const at = valueByMs(run.keyframes, run.options, k => Math.abs(shift(k))).slice(0, 501);
    const speed = at.slice(1).map((v, ms) => v - at[ms]);
    assert.ok(at[0] < 1e-6 && Math.abs(at.at(-1) - 398) < 1e-6, "from off its side to the middle in 500 ms");
    assert.ok(speed.slice(-50).reduce((a, b) => a + b) > 2 * speed.slice(0, 50).reduce((a, b) => a + b), "gathering speed, like a wave");
    assert.deepEqual(Array.from(run.keyframes, k => k.opacity), [1, 1, 0, 0], "then gone into the merged pill");
  }
  const [swell] = merged.anims;
  assert.deepEqual(Array.from(swell.keyframes, props).every(p => p === "opacity,transform"), true, "the merged pill: opacity and transform only");
  const curve = opacityByMs(swell.keyframes, swell.options), [fullAt, fullUntil] = atFullStrength(curve);
  assert.equal(swell.options.duration, 1000);
  assert.ok(curve[470] < 1e-6 && fullAt > 500 && fullAt <= 630 && fullUntil >= 740 && curve.at(-1) < 1e-6,
    `appears as they meet, whole from ${fullAt} to ${fullUntil} ms, gone at 1000`);
  // A page-sized blurred shadow costs software WebRender hundreds of ms a frame (Windows CI, real pixels).
  for (const el of [pageLine]) assert.ok(!el.style.boxShadow && !el.style.filter && !el.style.backdropFilter, "nothing page-sized is blurred");
  swell.finish();
  await settle();
  assert.ok(pageLine.removed && !ctx.arrivals.has(pageLine), "they remove themselves when they end");
  assert.equal(ctx.arrivals.size, 0, "nothing left live");
  reduced = true;
  await draw();
  const still = appended[1];
  assert.ok(still.children.length === 1 && still.children[0].style.opacity === "1", "with reduced motion nothing runs: only the merged pill");
  assert.equal(still.children[0].anims[0].options.duration, 700, "which fades");
  const quiet = opacityByMs(still.children[0].anims[0].keyframes, still.children[0].anims[0].options), [quietAt, quietUntil] = atFullStrength(quiet);
  assert.ok(quietAt === 0 && quietUntil >= 450 && quiet.at(-1) < 1e-6, `reduced motion: whole from 0 to ${quietUntil} ms`);
  reduced = false;
  // A page that reaches the window's bottom keeps them along its own edge.
  ctx.innerHeight = 1072;
  await draw();
  assert.ok(appended[2].holder === page && appended[2].style.top === "1058px" && appended[2].children[0].style.bottom === "1px",
    "with no margin below, along the page's own bottom edge");
  ctx.innerHeight = 1080;
  // A window still switching to the page waits for it to show.
  gBrowser._switcher = {};
  ctx.markArrival(tab);
  await settle();
  assert.equal(frames.length, 0, "nothing while the window still paints the page it switches to");
  gBrowser._switcher = null;
  switchDone();
  await settle();
  frames.shift()();
  assert.equal(appended.length, 4, "then the pills");
  // An address bar mod that draws a loading bar gives the colours, known by the variable its stylesheet sets
  // (a disabled mod's leftover settings set none): Blended Addressbar's, its head whitened as it draws it.
  vars["--blended-addressbar-dynamic-loadbar-color"] = " rgb(50, 29, 70)";
  await draw();
  assert.match(appended[4].children[1].style.background, /^linear-gradient\(to right, transparent, rgb\(50, 29, 70\) 60%, rgb\(204, 199, 209\)\)$/);
  delete vars["--blended-addressbar-dynamic-loadbar-color"];
  // The Deta Loading Bar's: its main colour, brightest at the head in its middle one.
  vars["--mod-detaloadingbar-primarycolor-final"] = " rgb(140, 80, 200)";
  await draw();
  assert.match(appended[5].children[1].style.background, /^linear-gradient\(to right, transparent, rgb\(140, 80, 200\) 60%, rgb\(255, 255, 255\)\)$/);
  delete vars["--mod-detaloadingbar-primarycolor-final"];
  // The window you leave plays it the other way, at once: even mid-switch, after one frame.
  gBrowser._switcher = {};
  ctx.markDeparture();
  assert.equal(frames.length, 1, "no waiting for any switch");
  frames.shift()();
  gBrowser._switcher = null;
  const leaving = appended[6], [parting, outLeft, outRight] = leaving.children;
  assert.ok(appended.length === 7 && leaving.holder === tabbox, "below the page you leave, and not on its tab");
  const [rise] = parting.anims, risen = opacityByMs(rise.keyframes, rise.options), [riseAt, riseUntil] = atFullStrength(risen);
  const lift = valueByMs(rise.keyframes, rise.options, k => Number(/translateY\((-?[\d.]+)(?:px)?\)/.exec(k.transform)[1]));
  assert.ok(parting.style.opacity === "0" && risen[0] < 1e-6 && lift[0] === 7 && lift[180] < 1e-6,
    "the merged pill wells up from underneath, not popping in");
  assert.ok(riseAt > 120 && riseAt <= 180 && riseUntil >= 239 && risen[360] < 1e-6, `whole from ${riseAt} to ${riseUntil} ms, parted by 360`);
  for (const [gleam, sign] of [[outLeft, 1], [outRight, -1]]) {
    const [run] = gleam.anims, at = valueByMs(run.keyframes, run.options, k => Math.abs(shift(k)));
    assert.ok(shift(run.keyframes[0]) === sign * 398 && at[320] === 398 && at[880] < 1e-6 && run.options.duration === 1000,
      "each leaves the pill as it parts and runs out past its side");
    assert.deepEqual(Array.from(run.keyframes, k => k.opacity), [0, 0, 1, 1, 0], "unseen until the pill parts");
    const speed = at.slice(321, 881).map((v, i) => at[320 + i] - v);
    assert.ok(speed.slice(0, 50).reduce((a, b) => a + b) > 2 * speed.slice(-50).reduce((a, b) => a + b), "fast out of the middle, easing as it leaves");
  }
  ctx.retired = true;
  ctx.markArrival(tab);
  await settle();
  frames.shift()();
  assert.equal(appended.length, 7, "a released copy draws nothing");
  // The README says what it looks like.
  const readme = (await readFile(new URL("../tab-router/README.md", import.meta.url), "utf8")).replace(/\s+/g, " ");
  assert.match(readme, /two pill-shaped gleams in the loading bar's colour \(Blended Addressbar's or the Deta Loading Bar's when one draws it, else Zen's own loading indicator's\) run in from the sides/);
});

test("Switching tabs plays the pills by Tab switch animation: in by default, following the load, out then in, out or none", async () => {
  const drawn = [], settle = () => new Promise(setImmediate), timers = [];
  let mode = 1, listener = null;
  const tab = { linkedBrowser: {}, id: "t", busy: false, hasAttribute(n) { return n === "busy" && this.busy; } };
  const other = { ...tab, id: "o" };
  const stale = { remove() { this.gone = true; } };
  const handle = { places: [], finished: false, progress(p) { this.places.push(p); }, finish() { this.finished = true; }, cancel() { this.cancelled = true; } };
  const ctx = vm.createContext({ retired: false, num: (k, d) => (k === "tab-switch-cue" ? mode : d), performance,
    Ci: { nsIWebProgressListener: { STATE_STOP: 16, STATE_IS_WINDOW: 0x80000 } },
    setTimeout: (fn, ms) => { if (ms < 1000) timers.push(fn); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    gBrowser: { selectedTab: tab, addTabsProgressListener: l => { listener = l; }, removeTabsProgressListener: () => { listener = null; } },
    arrivals: new Set([stale]), tabSwitched: () => Promise.resolve(), requestAnimationFrame: fn => fn(),
    drawGleams: (t, kind) => { drawn.push([t.id, kind]); return kind === "follow" ? handle : null; } });
  vm.runInContext(between("  const arriving = new WeakMap();", "  // The window you leave plays it the other way at once")
    + "\nthis.tabSwitchCue = tabSwitchCue; this.markArrival = markArrival;", ctx);
  const flush = async () => { while (timers.length) { timers.shift()(); await settle(); } };
  const switchTo = async t => { ctx.gBrowser.selectedTab = t; ctx.tabSwitchCue({ target: t }); await flush(); };
  await switchTo(tab);
  assert.deepEqual(drawn, [["t", "in"]], "In by default, at once: no waiting for the page");
  assert.ok(stale.gone && ctx.arrivals.size === 0, "a quick run of switches shows only the latest");
  for (const [m, want] of [[3, [["t", "out"], ["t", "in"]]], [2, [["t", "out"]]], [0, []]]) {
    mode = m; drawn.length = 0;
    await switchTo(tab);
    assert.deepEqual(drawn, want, `mode ${m}`);
  }
  // Following the load: a loading page's pills run in with its progress and merge once it is done.
  mode = 4; drawn.length = 0;
  await switchTo(tab);
  assert.deepEqual(drawn, [["t", "in"]], "a page already loaded plays In");
  drawn.length = 0; tab.busy = true;
  await switchTo(tab);
  assert.deepEqual(drawn, [["t", "follow"]]);
  assert.equal(handle.places[0], 0.08, "starting where a load starts");
  listener.onProgressChange(tab.linkedBrowser, {}, null, 0, 0, 60, 100);
  assert.equal(handle.places.at(-1), 0.6, "following real progress");
  listener.onProgressChange(tab.linkedBrowser, {}, null, 0, 0, 99, 100);
  assert.equal(handle.places.at(-1), 0.95, "to 95% at most before it is done");
  assert.ok(!handle.finished);
  listener.onStateChange(tab.linkedBrowser, { isTopLevel: true }, null, 16 | 0x80000);
  assert.ok(handle.finished && handle.places.at(-1) === 1 && listener === null, "done: met, merged, and no longer listening");
  tab.busy = false;
  // A switch that lands here from another window is that one's to mark.
  mode = 3; drawn.length = 0;
  ctx.markArrival(other, Promise.resolve());
  await switchTo(other);
  assert.deepEqual(drawn.filter(([, kind]) => kind === "out"), [], "no tab-switch cue over a cross-window arrival");
  // The setting is offered, In by default.
  const prefs = JSON.parse(await readFile(new URL("../tab-router/preferences.json", import.meta.url), "utf8"));
  const setting = prefs.find(p => p.property === "zzrouter.tab-switch-cue");
  assert.deepEqual([setting?.type, setting?.defaultValue, setting?.options.map(o => o.value)], ["dropdown", 1, [1, 4, 3, 2, 0]]);
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

test("A tab's own cover art: video thumbnails, Nexus page pictures and other pages' previews, each by its own setting", async () => {
  const settings = { "video-covers": true, "nexus-page-covers": false, "page-covers": false };
  const fetched = [], finish = [], repainted = [], settle = () => new Promise(setImmediate);
  const tabs = [], store = {};
  const make = (url, { busy = false, pending = false, meta = null } = {}) => {
    const tab = { url, label: url, closing: false, isConnected: true, attrs: { busy, pending },
      hasAttribute(n) { return !!this.attrs[n]; },
      linkedBrowser: { currentURI: { spec: url }, browsingContext: { currentWindowGlobal: { getActor: () => ({ sendQuery: async () => meta }) } } } };
    tabs.push(tab);
    return tab;
  };
  const ctx = vm.createContext({ retired: false, privateWindow: false, noLookups: () => false, bool: (k, d) => settings[k] ?? d,
    num: (k, d) => settings[k] ?? d, modTabsUseGameBanner: () => settings["nexus-page-covers"] && settings["nexus-page-cover-source"] === 1,
    pageKey: url => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), tabURL: t => t.url, contextOf: () => 0,
    scoped: (k, c) => `${c}|${k}`, hostOf: t => new URL(t.url).hostname.replace(/^www\./, ""),
    videoId: t => /youtube\.com\/watch\?v=([\w-]+)/.exec(t.url)?.[1] ?? null,
    bounded: (v, max = 500) => typeof v === "string" && v.length <= max ? v : "",
    fetchPicture: (url, c, kind, done) => { fetched.push([url, kind]); finish.push(done); },
    allTabs: () => tabs, updatePicture: t => repainted.push(t.url), URL,
    readCache: k => ({ ...(store[k] || {}) }), persist: (k, d) => { store[k] = d; } });
  vm.runInContext(between("  // A tab's own cover art, in place of its game's banner", "  // label is the canonical subject URL")
    + "\ncoversLoaded = true; this.wantCover = wantCover; this.coverFor = coverFor;", ctx);
  // A YouTube video's thumbnail comes from its address, loaded or not.
  const video = make("https://www.youtube.com/watch?v=abcdef12345", { pending: true });
  ctx.wantCover(video);
  assert.deepEqual(fetched, [["https://i.ytimg.com/vi/abcdef12345/mqdefault.jpg", "cover"]], "fetched as a cover, decoded to fit a tab");
  finish.shift()("data:image/webp;base64,AAAA");
  assert.equal(ctx.coverFor(video), "data:image/webp;base64,AAAA");
  assert.deepEqual(repainted, [video.url], "its tab is repainted with it");
  assert.deepEqual(JSON.parse(JSON.stringify(store.covers)), { "0|youtube.com/watch?v=abcdef12345": { d: "data:image/webp;base64,AAAA", kind: "video" } },
    "kept in Tab Router's cache file");
  // A restart reads it back: shown at once, nothing fetched.
  const again = vm.createContext({ ...ctx, fetchPicture: () => { throw new Error("fetched again"); } });
  vm.runInContext(between("  // A tab's own cover art, in place of its game's banner", "  // label is the canonical subject URL")
    + "\nloadCovers(); this.wantCover = wantCover; this.coverFor = coverFor;", again);
  again.wantCover(video);
  assert.equal(again.coverFor(video), "data:image/webp;base64,AAAA");
  settings["video-covers"] = false;
  assert.equal(ctx.coverFor(video), null, "its own setting off, none");
  // A Nexus mod's tab: its page's own picture, by its own setting; a game's own page keeps its banner.
  const mod = make("https://www.nexusmods.com/skyrimspecialedition/mods/266", { meta: { ogImage: "https://staticdelivery.nexusmods.com/mod.jpg" } });
  const game = make("https://www.nexusmods.com/games/skyrimspecialedition", { meta: { ogImage: "https://staticdelivery.nexusmods.com/game.jpg" } });
  ctx.wantCover(mod); await settle();
  assert.equal(fetched.length, 1, "nothing while Nexus page covers is off");
  settings["nexus-page-covers"] = true;
  mod.label += " "; ctx.wantCover(mod); ctx.wantCover(game); await settle();
  assert.deepEqual(fetched.slice(1), [["https://staticdelivery.nexusmods.com/mod.jpg", "cover"]], "the mod's picture; the game page left to its banner");
  // Any other page: its preview picture, by its own setting, once it has loaded.
  settings["page-covers"] = true;
  const page = make("https://example.com/article", { busy: true, meta: { ogImage: "https://example.com/share.png" } });
  ctx.wantCover(page); await settle();
  assert.equal(fetched.length, 2, "not while it is still loading");
  page.attrs.busy = false; ctx.wantCover(page); await settle();
  assert.equal(fetched.at(-1)[0], "https://example.com/share.png");
  // A frame from the video instead of its thumbnail, cached on its own.
  settings["video-covers"] = true; settings["video-cover-source"] = 1;
  const framed = make("https://www.youtube.com/watch?v=frame123456", { pending: true });
  ctx.wantCover(framed);
  assert.equal(fetched.at(-1)[0], "https://i.ytimg.com/vi/frame123456/mq2.jpg", "a still from the video, no thumbnail text");
  finish.pop()("data:image/webp;base64,FRAME");
  assert.equal(ctx.coverFor(framed), "data:image/webp;base64,FRAME");
  settings["video-cover-source"] = 0;
  assert.equal(ctx.coverFor(framed), null, "the thumbnail is a different picture");
  ctx.wantCover(framed);
  assert.equal(fetched.at(-1)[0], "https://i.ytimg.com/vi/frame123456/mqdefault.jpg");
  finish.pop()(null);
  fetched.splice(-2); settings["video-covers"] = false;
  // Nexus mod tabs set to their game's banner: the mod's own picture is not shown or asked for.
  settings["nexus-page-cover-source"] = 1;
  assert.equal(ctx.coverFor(mod), null);
  settings["nexus-page-cover-source"] = 0;
  // Three at a time; a failed one is not asked for again.
  for (let i = 0; i < 4; i++) ctx.wantCover(make(`https://www.youtube.com/watch?v=queued${i}000`));
  settings["video-covers"] = true;
  for (let i = 0; i < 4; i++) ctx.wantCover(tabs.at(-4 + i));
  assert.equal(fetched.length, 4, "only the first runs while two are still fetching");
  finish.shift()(null);
  assert.equal(fetched.length, 5, "the next starts as one ends");
  mod.label += " "; ctx.wantCover(mod); await settle();
  assert.equal(fetched.filter(([url]) => url.endsWith("mod.jpg")).length, 1, "a failed cover is not fetched again");
});

test("Pictures are kept for what is open when a window closes", () => {
  const store = {
    avatars: { "0|https://a/": { d: "A" }, "0|https://gone/": { d: "G" }, "0|https://b/": { d: "B" } },
    covers: { "0|v1": { d: "x", kind: "video" }, "0|v2": { d: "y", kind: "video" } },
  };
  const own = { closed: false, TabRouter: null }, other = { closed: false };
  let windows = [own, other], flushed = 0;
  other.TabRouter = { liveCacheKeys: () => ({ avatars: new Set(["0|https://b/"]), covers: new Set(["0|v2"]) }) };
  const ctx = vm.createContext({ privateWindow: false, fileCache: {}, window: own, iconCache: new Map(),
    Services: { wm: { getEnumerator: () => windows } }, ChromeUtils: { importESModule: () => ({ PrivateBrowsingUtils: { isWindowPrivate: () => false } }) },
    liveCacheKeys: () => ({ avatars: new Set(["0|https://a/"]), covers: new Set(["0|v1"]) }),
    readCache: k => ({ ...store[k] }), persist: (k, d) => { store[k] = d; }, flushWrites: () => flushed++ });
  vm.runInContext(between("  // Pictures are kept for what is open when a window closes", "  const quitObserver")
    + "\nthis.pruneCaches = pruneCaches;", ctx);
  // Closing one of two windows: only the other's pictures stay.
  ctx.pruneCaches(false);
  assert.deepEqual(Object.keys(store.avatars), ["0|https://b/"]);
  assert.deepEqual(Object.keys(store.covers), ["0|v2"]);
  assert.equal(flushed, 1, "written at once, before the window goes");
  // Quitting (or the last window): its own count too.
  store.avatars = { "0|https://a/": { d: "A" }, "0|https://b/": { d: "B" }, "0|https://gone/": { d: "G" } };
  ctx.pruneCaches(true);
  assert.deepEqual(Object.keys(store.avatars).sort(), ["0|https://a/", "0|https://b/"]);
  // By its unload a closing window has left the window list; the last one still counts its own.
  windows = [];
  store.avatars = { "0|https://a/": { d: "A" }, "0|https://gone/": { d: "G" } };
  ctx.pruneCaches(true);
  assert.deepEqual(Object.keys(store.avatars), ["0|https://a/"]);
  windows = [own, other];
  // A window that cannot say what it shows: nothing is dropped.
  other.TabRouter = {};
  store.avatars = { "0|https://gone/": { d: "G" } };
  ctx.pruneCaches(true);
  assert.deepEqual(Object.keys(store.avatars), ["0|https://gone/"]);
});

test("YouTube channel banners: a banner source on the channel's page; blur softens cover art", async () => {
  const html = 'x'.repeat(200) + '"banner":{"imageBannerViewModel":{"image":{"sources":[{"url":"https://yt3.googleusercontent.com/abc=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj","width":1060,"height":175},' +
    '{"url":"https://yt3.googleusercontent.com/abc=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj","width":2120,"height":351}]}}}' +
    '"url":"https://yt3.googleusercontent.com/zzz=w9000","width":9000';
  const ctx = vm.createContext({});
  vm.runInContext(between("  function channelBannerURL(html) {", "  function fetchChannelBanner(") + "\nthis.channelBannerURL = channelBannerURL;", ctx);
  assert.equal(ctx.channelBannerURL(html), "https://yt3.googleusercontent.com/abc=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj", "the smallest at least 768px wide");
  assert.equal(ctx.channelBannerURL('"avatar":{"url":"https://yt3.googleusercontent.com/a=s176"}'), null, "no banner, none");
  assert.equal(ctx.channelBannerURL('"banner":{"imageBannerViewModel":{"image":{"sources":[{"url":"https://evil.example/x","width":1060}]}}}'), null, "only YouTube's image host");
  const prefs = { "nexus-banner-opacity": 25, "cover-blur": 0 };
  const paint = vm.createContext({ num: (k, d) => prefs[k] ?? d, imageData: v => /^data:image\/webp;base64,/.test(v) });
  vm.runInContext(between("  function paintBanner(node, data) {", "  // A tab's own cover art, in place of its game's banner") + "\nthis.paintBanner = paintBanner;", paint);
  const node = { attrs: {}, props: {}, getAttribute(n) { return this.attrs[n] ?? null; }, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; },
    style: { setProperty(n, v) { node.props[n] = v; }, removeProperty(n) { delete node.props[n]; } } };
  paint.paintBanner(node, "data:image/webp;base64,AAAA");
  assert.equal(node.attrs["data-zzrouter-banner"], "0.25:data:image/webp;base64,AAAA");
  assert.doesNotMatch(decodeURIComponent(node.props["--zzrouter-banner-data"]), /feGaussianBlur/);
  prefs["cover-blur"] = 6;
  assert.equal(paint.paintBanner(node, "data:image/webp;base64,AAAA"), true, "a blur change repaints");
  assert.equal(node.attrs["data-zzrouter-banner"], "0.25:6:data:image/webp;base64,AAAA");
  const svg = decodeURIComponent(node.props["--zzrouter-banner-data"]);
  assert.match(svg, /<feGaussianBlur stdDeviation="6"\/>/);
  assert.match(svg, /x="-8%" y="-8%" width="116%" height="116%"/, "drawn larger, so the blur never fades its edges");
  assert.doesNotMatch(svg, /href="(?!data:)/, "no remote reference");
  prefs["cover-blur"] = 99;
  paint.paintBanner(node, "data:image/webp;base64,AAAA");
  assert.match(node.attrs["data-zzrouter-banner"], /^0\.25:20:/, "at most 20");
});

test("A cover's black bars are cut off; a picture without them, or all dark, stays whole", () => {
  const picture = (w, h, lit) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lit(x, y)) data.fill(200, (y * w + x) * 4, (y * w + x) * 4 + 3);
    return { width: w, height: h, data };
  };
  let current = null;
  const ctx = vm.createContext({ OffscreenCanvas: class { getContext() { return { drawImage() {}, getImageData: () => ({ data: current.data }) }; } } });
  vm.runInContext(between("  function letterbox(bmp) {", "  function fetchPicture(") + "\nthis.letterbox = letterbox;", ctx);
  const crop = bmp => { current = bmp; return Array.from(ctx.letterbox(bmp)); };
  assert.deepEqual(crop(picture(320, 180, x => x >= 40 && x < 280)), [40, 0, 240, 180], "a 4:3 frame's pillarbox");
  assert.deepEqual(crop(picture(320, 180, (x, y) => y >= 22 && y < 158)), [0, 22, 320, 136], "a letterbox");
  assert.deepEqual(crop(picture(320, 180, () => true)), [0, 0, 320, 180], "no bars");
  assert.deepEqual(crop(picture(320, 180, () => false)), [0, 0, 320, 180], "an all-dark picture");
  assert.deepEqual(crop(picture(320, 180, x => x >= 1)), [0, 0, 320, 180], "a one-pixel edge is not a bar");
});
