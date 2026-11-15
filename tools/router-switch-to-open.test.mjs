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

test("Alt with a middle-click marks the new tab as a copy; a plain middle-click is left to the new-tab check", () => {
  const { sent, click } = child();
  let e = click("https://example.com/b", { type: "auxclick", button: 1, altKey: true });
  assert.ok(!e.prevented);
  assert.deepEqual(sent.pop(), ["ZzRouter:AllowCopy", { key: "example.com/b", ctx: 0 }]);
  e = click("https://example.com/b", { type: "auxclick", button: 1 });
  assert.ok(!e.prevented && sent.length === 0);
  e = click("https://example.com/b", { type: "auxclick", button: 0 });
  assert.ok(!e.prevented && sent.length === 0, "auxclick only counts the middle button");
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
