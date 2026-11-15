import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const childSource = (await readFile(new URL("../tab-router/links-child.sys.mjs", import.meta.url), "utf8"))
  .replace(/export /g, "");
const router = await readFile(new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");
const groupflow = await readFile(new URL("../groupflow/groupflow.uc.js", import.meta.url), "utf8");

function child(open = ["0|example.com/b"]) {
  const sent = [];
  const ctx = vm.createContext({ URL, URLSearchParams,
    Services: { cpmm: { sharedData: { get: () => new Set(open) } } },
    JSWindowActorChild: class { sendAsyncMessage(name, data) { sent.push(JSON.parse(JSON.stringify([name, data]))); } } });
  vm.runInContext(childSource + "\nthis.Child = ZzRouterLinksChild; this.pageKey = pageKey;", ctx);
  const actor = new ctx.Child();
  actor.document = { documentURI: "https://example.com/a" };
  actor.browsingContext = { originAttributes: { userContextId: 0 } };
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
  assert.deepEqual(sent.pop(), ["ZzRouter:SwitchTo", { key: "example.com/b", ctx: 0, href: "https://www.example.com/b/?utm_source=x#top", newTab: false }]);
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
    + router.slice(router.indexOf("  function copyWhile(fn) {"), router.indexOf("  // A new tab whose first page is open elsewhere closes and switches there."));
  const log = { native: [], switched: [], placed: [] }, copies = new Map(), microtasks = [];
  const groups = { Local: { label: "Local", isConnected: true, addTabs(tabs) { for (const t of tabs) { t.group = this; log.placed.push(t.id); } } } };
  let ctx;
  ctx = vm.createContext({ URL, URLSearchParams, Services: { io: { newURI: url => { const u = new URL(url); return { spec: url, host: u.hostname }; } },
      scriptSecurityManager: { getSystemPrincipal: () => "system" } },
    window: { openLinkIn: native ? (...a) => native(log, ctx, ...a) : (...a) => log.native.push(a), gZenWorkspaces: { activeWorkspace: "ws1" } },
    gBrowser: { getTabForBrowser: () => null, addTab: () => null }, retired: false, note: () => {},
    bool: (k, d) => k === "enabled" ? enabled : k === "follow-containers" ? true : d, switchOn: () => true, isPrivate: () => false,
    pageKey: u => { try { return new URL(u).host + new URL(u).pathname; } catch { return null; } },
    contextOf: () => 0, copyAllowed: () => copies, openTabFor: (c, key) => open.get(key) || null,
    switchTo: tab => log.switched.push(tab.id),
    hostOf: t => t.linkedBrowser.currentURI.host, targetPath: () => (plan ? ["Local"] : null),
    resolveDestination: () => ({ ws: "ws1", ctx: plan?.ctx ?? null }), findChild: name => groups[name] || null,
    nativeManaged: () => false, queueMicrotask: fn => microtasks.push(fn) });
  vm.runInContext(src + "\nthis.openLinkIn = openLinkIn; this.copyWhile = copyWhile; this.placeOpened = placeOpened;", ctx);
  return { ctx, log, copies, microtasks, groups };
}

test("A new-tab open of a page that is already open switches before any tab exists; Alt opens a counted copy", () => {
  const b = { id: "b" };
  const { ctx, log, copies } = opener({ open: new Map([["example.com/b", b]]) });
  ctx.openLinkIn("https://example.com/b", "tab", { userContextId: 0 });
  assert.deepEqual(log.switched, ["b"]);
  assert.equal(log.native.length, 0, "Firefox never creates the tab");
  ctx.copyWhile(() => ctx.openLinkIn("https://example.com/b", "tab", {}));
  assert.equal(log.native.length, 1, "an Alt-click opens the copy");
  assert.ok(copies.has("0|example.com/b"), "and the copy's first page is not switched away afterwards");
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
