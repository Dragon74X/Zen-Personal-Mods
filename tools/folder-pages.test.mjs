import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const groupflow = await readFile(new URL("../groupflow/groupflow.uc.js", import.meta.url), "utf8");
const router = await readFile(new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");

function node(attrs = {}, extra = {}) {
  const a = new Map(Object.entries(attrs));
  return { isConnected: true, closing: false, matches: () => true, closest: () => null,
    getAttribute: k => a.get(k) ?? null, hasAttribute: k => a.has(k), setAttribute: (k, v) => a.set(k, String(v)),
    removeAttribute: k => a.delete(k), toggleAttribute: (k, on = !a.has(k)) => { if (on) a.set(k, ""); else a.delete(k); return on; }, ...extra };
}
// Groupflow's folder pages, run with their tabs and groups.
function folderPages(tabs, groups, TabRouter = null) {
  for (const g of groups) Object.defineProperty(g, "tabs", { get: () => tabs.filter(t => t.group === g) });
  const start = groupflow.indexOf("  const PAGE_KEY =");
  const source = groupflow.slice(start, groupflow.indexOf("\n  }\n", groupflow.indexOf("  function startFolderPages() {")) + 4);
  const frames = [], events = [];
  let progress = null;
  const ctx = vm.createContext({ URL, URLSearchParams, console, PREFIX: "zzgroup.", bool: (_k, d) => d,
    readGroupData: () => null, writeGroupData() {}, isCopy: () => false,
    SessionStore: { getCustomTabValue: () => "", setCustomTabValue() {}, deleteCustomTabValue() {} },
    Services: { prefs: { addObserver() {}, removeObserver() {} } }, CustomEvent: class { constructor(type) { this.type = type; } },
    requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame() {},
    document: { querySelectorAll: () => groups },
    gBrowser: { tabs, removeTab() {}, addTabsProgressListener: listener => { progress = listener; },
      getTabForBrowser: browser => tabs.find(t => t.linkedBrowser === browser) },
    window: { Groupflow: {}, TabRouter, addEventListener() {}, removeEventListener() {}, dispatchEvent: event => events.push(event.type) } });
  vm.runInContext(source + "\nstartFolderPages();", ctx);
  return { events, progress, groupflow: ctx.window.Groupflow, settle: () => { while (frames.length) frames.shift()(); } };
}
const tabAt = (spec, extra = {}) => node(extra.attrs, { linkedBrowser: { currentURI: { spec } }, ...extra });

test("Folder pages treat an address as the same page without anchors, tracking, www. or a trailing slash", () => {
  const ctx = vm.createContext({ URL, URLSearchParams });
  vm.runInContext(groupflow.slice(groupflow.indexOf("  const TRACKING ="), groupflow.indexOf("  function startFolderPages()")) + "\nthis.pageKey = pageKey;", ctx);
  const same = (a, b) => assert.equal(ctx.pageKey(a), ctx.pageKey(b), `${a} ~ ${b}`);
  same("https://www.youtube.com/@creator/", "https://youtube.com/@creator#about");
  same("https://www.nexusmods.com/games/crimsondesert?utm_source=x&fbclid=1", "https://nexusmods.com/games/crimsondesert");
  same("https://youtu.be/abc?si=share", "https://youtu.be/abc");
  assert.notEqual(ctx.pageKey("https://www.youtube.com/watch?v=a"), ctx.pageKey("https://www.youtube.com/watch?v=b"), "real query parameters still count");
  assert.notEqual(ctx.pageKey("https://music.youtube.com/"), ctx.pageKey("https://youtube.com/"), "subdomains are different sites");
  assert.equal(ctx.pageKey("about:blank"), null);
  assert.equal(ctx.pageKey("not a url"), null);
});

test("Tab Router gives each level its page: site, subdomain, channel, game, author or section", () => {
  const ctx = vm.createContext({
    hostOf: tab => tab.host,
    baseDomain: host => host.split(".").slice(-2).join("."),
    domainName: base => base.split(".")[0].replace(/^\w/, c => c.toUpperCase()),
    prettify: seg => seg.replace(/^\w/, c => c.toUpperCase()),
  });
  vm.runInContext(router.slice(router.indexOf("  function levelPages(tab, parts) {"), router.indexOf("  const canCreateGroups = () =>")) + "\nthis.levelPages = levelPages;", ctx);
  const pages = (host, parts) => JSON.parse(JSON.stringify(ctx.levelPages({ host }, parts)));
  assert.deepEqual(pages("www.youtube.com", ["Youtube", { key: "https://www.youtube.com/@creator", label: "Creator" }]),
    ["https://youtube.com/", "https://www.youtube.com/@creator"]);
  assert.deepEqual(pages("music.youtube.com", ["Youtube", "Music", { key: "https://music.youtube.com/channel/x", label: "Artist" }]),
    ["https://youtube.com/", "https://music.youtube.com/", "https://music.youtube.com/channel/x"]);
  assert.deepEqual(pages("www.nexusmods.com", ["Nexusmods", { key: "https://www.nexusmods.com/games/crimsondesert", label: "Crimson Desert" },
    { key: "https://www.nexusmods.com/profile/author", label: "Author" }]),
    ["https://nexusmods.com/", "https://www.nexusmods.com/games/crimsondesert", "https://www.nexusmods.com/profile/author"]);
  assert.deepEqual(pages("github.com", ["Dev", "Work"]), [null, null], "a rule's own group names have no page");
  assert.deepEqual(pages("github.com", [{ key: "", label: "No key" }]), [null]);
});

test("A folder's page tab is hidden from the moment it is marked, and stays its page when the site moves on", () => {
  const group = node({ "data-zzrouter-page": "https://www.example.com/" }, { id: "g1" });
  const other = tabAt("https://example.com/more", { group }), tabs = [other];
  let page = null;
  const f = folderPages(tabs, [group], { openPage: url => { page = tabAt(url, { group }); tabs.push(page); return page; } });
  assert.ok(!other.hasAttribute("zzgf-page-of") && !other.hasAttribute("zzgf-page-tab"), "a member on another page is not the page tab");
  assert.equal(f.groupflow.openFolderPage(group), true, "Tab Router opens the page");
  assert.equal(page.getAttribute("zzgf-page-of"), "g1");
  assert.ok(page.hasAttribute("zzgf-page-tab"), "hidden as soon as it is marked, before the next frame");
  assert.ok(f.events.includes("GroupflowPageTabs"), "and Tab Router hears of it");
  f.settle();
  page.linkedBrowser.currentURI.spec = "https://example.com/elsewhere";
  f.progress.onLocationChange(page.linkedBrowser, { isTopLevel: true }, null, { spec: page.linkedBrowser.currentURI.spec });
  f.settle();
  assert.equal(page.getAttribute("zzgf-page-of"), "g1", "the site moving on does not release it");
  assert.ok(page.hasAttribute("zzgf-page-tab"), "and it never shows as a row");
  assert.equal(f.groupflow.folderPage(group), "https://www.example.com/", "and the folder keeps its page");
});

test("A Favorite showing a folder's page never stands for the folder", () => {
  const group = node({ "data-zzrouter-page": "https://www.nexusmods.com/" }, { id: "g2" });
  const favorite = tabAt("https://nexusmods.com/", { group: null, pinned: true, attrs: { "zen-essential": "true" } });
  const member = tabAt("https://other.example/", { group });
  let opened = null;
  const f = folderPages([favorite, member], [group], { openPage: url => opened = tabAt(url, { group }) });
  assert.ok(!favorite.hasAttribute("zzgf-page-of") && !favorite.hasAttribute("zzgf-page-tab"));
  assert.ok(!member.hasAttribute("zzgf-page-tab"));
  assert.ok(group.hasAttribute("zzgf-has-page") && !member.hasAttribute("zzgf-page-of"), "the folder has no page tab yet");
  assert.equal(f.groupflow.openFolderPage(group), true);
  assert.ok(opened, "opening the folder's page opens its own tab, not the Favorite");
});

test("A folder whose page is also a Favorite opens its own tab; the Favorite is never the folder's", () => {
  const fn = name => router.slice(router.indexOf(`  function ${name}(`), router.indexOf("\n  }\n", router.indexOf(`  function ${name}(`)) + 4);
  const group = { isConnected: true, closest: () => ({ id: "ws" }), getAttribute: () => null };
  const tab = (id, url, attrs = []) => ({ id, url, closing: false, linkedBrowser: {}, group: null, pinned: false,
    hasAttribute: a => attrs.includes(a), getAttribute: () => "ws" });
  const favorite = tab("fav", "https://www.nexusmods.com/", ["zen-essential"]);
  const loose = tab("loose", "https://other.example/");
  const copies = new Map(), switched = [], added = [];
  const ctx = vm.createContext({
    tabs: [favorite, loose], copies, switched, added, group,
    eligibleTab: t => !t.closing, contextOf: () => 0, tabURL: t => t.url, switchOn: () => true,
    pageKey: u => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""),
    copyAllowed: () => copies, COPY_MS: 10000, switchTo: t => switched.push(t.id), note: () => {},
    Services: { scriptSecurityManager: { getSystemPrincipal: () => ({}) } },
    gBrowser: { addTab(url) { const t = { id: "new", url, group }; added.push(t); return t; } },
  });
  vm.runInContext(`function* allWindowTabs() { yield* tabs; }\n${fn("openTabFor")}\n${fn("allowCopy")}\n${fn("openPage")}\nthis.openPage = openPage;`, ctx);
  const opened = ctx.openPage("https://nexusmods.com", group, 0);
  assert.equal(opened.id, "new", "a new tab in the folder, not the Favorite");
  assert.deepEqual(switched, ["new"]);
  assert.ok(copies.has("0|nexusmods.com"), "the new-tab check lets the folder's own tab load");
});
