import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const groupflow = await readFile(new URL("../groupflow/groupflow.uc.js", import.meta.url), "utf8");
const router = await readFile(new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");

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
