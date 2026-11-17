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
    openTabFor: () => null, switchTo: t => switched.push(t.id), note: () => {}, openPage: () => null });
  vm.runInContext(`${gen}\n${fn("folderFor")}\n${fn("openTargetFor")}\n${fn("goTo")}\nthis.openTargetFor = openTargetFor; this.goTo = goTo;`, ctx);
  const target = ctx.openTargetFor(6, "youtube.com");
  assert.equal(target?.folder?.ctx, 6, "the folder counts in its signed-in tabs' container, not its page tab's");
  ctx.goTo(target);
  assert.deepEqual([switched, opened], [[], ["yt"]], "the page tab in no container is not shown: Groupflow replaces it");
  page.getAttribute = a => (a === "usercontextid" ? "6" : a === "zzgf-page-of" ? "yt" : null);
  ctx.goTo(ctx.openTargetFor(6, "youtube.com"));
  assert.deepEqual(switched, ["page"], "one in the folder's container is gone to directly");
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
function windows(slice) {
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
      markArrival: t => marked.push([name, t.id]) });
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
  assert.deepEqual(marked, [], "asked from another app, the window is raised with no ring");
  assert.equal(helper.switchToTabHavingURI.switchingFrom, undefined, "the note lasts only as long as the call");
  A.TabRouter = null;
  B.ctx.unpatch();
  assert.equal(helper.switchToTabHavingURI, native, "the last window to release restores Firefox's own");
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
  assert.deepEqual([raised, marked], [["A"], []], "from another app: raised, as Firefox would, with no ring");
});

test("The arrival ring fades on the compositor once the switch is done, removes itself, and goes on release", async () => {
  const appended = [], frames = [], settle = () => new Promise(setImmediate);
  let reduced = false;
  const element = () => ({ style: {}, children: [], setAttribute() {}, remove() { this.removed = true; },
    appendChild(child) { this.children.push(child); },
    animate(keyframes, options) {
      let finish;
      const finished = new Promise(r => { finish = r; });
      this.fade = { keyframes, options, finish };
      return { finished };
    } });
  // Boxes with a place on screen; a holder takes rings as children.
  const box = (left, top, width, height, position = "relative") => ({ position, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    appendChild(el) { appended.push(el); el.holder = this; } });
  const page = box(200, 8, 760, 1064, "absolute"), stack = box(4, 156, 180, 44);
  const background = { ...box(8, 160, 172, 36, "static"), parentNode: stack };
  const ctx = vm.createContext({ retired: false, innerWidth: 960, innerHeight: 1080,
    document: { documentElement: {}, createElementNS: element, getElementById: () => page },
    getComputedStyle: el => ({ getPropertyValue: () => " rgb(1, 2, 3) ", borderRadius: "8px", position: el.position }),
    matchMedia: () => ({ matches: reduced }), requestAnimationFrame: fn => frames.push(fn) });
  vm.runInContext(between("  // A switch that lands you in another window gives", "  // Every window publishes the whole set")
    + "\nthis.markArrival = markArrival; this.arrivals = arrivals;", ctx);
  const tab = { isConnected: true, closing: false, hasAttribute: () => false, linkedBrowser: { closest: () => page },
    querySelector: () => background };
  let switched;
  ctx.markArrival(tab, new Promise(r => { switched = r; }));
  await settle();
  assert.equal(frames.length, 0, "nothing is drawn while the switch (or a change of space) is under way");
  switched();
  await settle();
  frames.shift()();
  assert.equal(appended.length, 2, "one ring around the page, one around the tab");
  const [pageRing, tabRing] = appended;
  assert.ok(pageRing.holder === page && pageRing.style.left === "0px" && pageRing.style.height === "1064px", "the page's ring fills the page");
  assert.ok(tabRing.holder === stack && tabRing.style.left === "4px" && tabRing.style.top === "4px" && tabRing.style.width === "172px",
    "the tab's ring sits in the tab, over its background, and moves with it");
  assert.equal(tabRing.style.position, "absolute");
  assert.deepEqual(Array.from(appended[0].fade.keyframes, k => Object.keys(k).filter(p => p !== "offset").join() + k.opacity),
    ["opacity0", "opacity1", "opacity1", "opacity0"], "opacity only");
  const offsets = Array.from(appended[0].fade.keyframes, k => k.offset);
  assert.ok(offsets[1] <= 0.15 && offsets[2] >= 0.5, "in fast, then held at full strength before the fade: a window drawing few frames still shows it");
  assert.equal(appended[0].fade.options.duration, 1100);
  assert.equal(appended[0].style.border, "2px solid rgb(1, 2, 3)", "a line in Zen's accent");
  assert.equal(appended[0].style.boxSizing, "border-box", "inside what it rings");
  assert.equal(appended[0].children[0].style.inset, "-2px", "the soft band shares the ring's shape");
  assert.match(appended[0].children[0].style.border, /^8px solid color-mix\(in srgb, rgb\(1, 2, 3\) 22%, transparent\)$/);
  // A window-sized inset shadow costs software WebRender hundreds of ms a frame (Windows CI, real pixels).
  for (const el of [appended[0], appended[0].children[0], appended[1]])
    assert.ok(!el.style.boxShadow && !el.style.filter && !el.style.backdropFilter, "no shadows or filters");
  assert.equal(appended[0].style.pointerEvents, "none");
  appended[0].fade.finish();
  await settle();
  assert.ok(appended[0].removed && !ctx.arrivals.has(appended[0]), "a ring removes itself when it ends");
  assert.equal(ctx.arrivals.size, 1, "the other is still live, for release to remove");
  reduced = true;
  ctx.markArrival(tab);
  await settle();
  frames.shift()();
  assert.equal(appended[2].fade.options.duration, 700, "shorter with reduced motion");
  assert.deepEqual(Array.from(appended[2].fade.keyframes, k => k.opacity), [1, 1, 0], "with reduced motion it shows at once, holds, and fades out");
  stack.position = "static";
  ctx.markArrival(tab);
  await settle();
  frames.shift()();
  assert.equal(appended.length, 5, "a holder that cannot place it gets no ring");
  stack.position = "relative";
  // Below the fold: selecting it scrolls it into view, and its ring rides along.
  const far = { ...tab, querySelector: () => ({ ...box(8, 1808, 172, 36, "static"), parentNode: stack }) };
  ctx.markArrival(far);
  await settle();
  frames.shift()();
  assert.ok(appended.length === 7 && appended[6].holder === stack && appended[6].style.top === "1652px",
    "a tab still scrolling into view gets its ring, in the tab");
  // A folder's page tab is hidden behind its header, which takes the ring.
  const header = box(5, 122, 176, 40);
  const pageTab = { ...tab, hasAttribute: name => name === "zzgf-page-tab", group: { querySelector: () => header },
    querySelector: () => ({ ...box(0, 0, 0, 0, "static"), parentNode: stack }) };
  ctx.markArrival(pageTab);
  await settle();
  frames.shift()();
  assert.ok(appended.length === 9 && appended[8].holder === header && appended[8].style.left === "0px",
    "a folder's page is ringed at its header");
  ctx.retired = true;
  ctx.markArrival(tab);
  await settle();
  frames.shift()();
  assert.equal(appended.length, 9, "a released copy draws nothing");
});

test("Release restores Zen's switchIfNeeded and removes live rings", () => {
  const release = between("      // Zen's own switchIfNeeded lives on its prototype", "      // The other windows republish without this one's tabs.");
  const proto = { switchIfNeeded() {} }, workspaces = Object.create(proto), ours = () => {}, glow = { remove() { this.gone = true; } };
  workspaces.switchIfNeeded = ours;
  const ctx = vm.createContext({ workspaces, switchIfNeeded: ours, nativeSwitchIfNeeded: proto.switchIfNeeded, arrivals: new Set([glow]) });
  vm.runInContext(release, ctx);
  assert.ok(!Object.hasOwn(workspaces, "switchIfNeeded") && workspaces.switchIfNeeded === proto.switchIfNeeded, "Zen's own method shows through again");
  assert.ok(glow.gone && ctx.arrivals.size === 0);
});
