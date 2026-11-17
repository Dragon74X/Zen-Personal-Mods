import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const router = await readFile(new URL("../tab-router/tab-router.uc.js", import.meta.url), "utf8");
const childSource = (await readFile(new URL("../tab-router/links-child.sys.mjs", import.meta.url), "utf8")).replace(/export /g, "");
const body = router.slice(router.indexOf("  // ---- creators on any site"), router.indexOf("  // Read only bounded, inert metadata; no page execution or content polling.")) +
  router.slice(router.indexOf("  function rememberMetadata("), router.indexOf("  function fetchAnon(")) +
  router.slice(router.indexOf("  const FAILED_MAX ="), router.indexOf("\n", router.indexOf("  const RETRY_FAIL_MS =")) + 1);

function load(extra = {}) {
  const creators = new Map(), routed = [], fetched = [], metadata = new Map(), failed = new Map();
  const ctx = vm.createContext({ URL, creators, routed, fetched, metadata,
    baseDomain: host => host.split(".").slice(-2).join("."), scoped: (k, c) => `${c}:${k}`, contextOf: () => 0,
    creatorMap: () => creators, saveCreators: () => {}, targetGen: 0, queueRoute: (t, why) => routed.push(why),
    lookupOwner: () => ({ metadata }), ICON_MAX: 100, failed,
    privateWindow: false, retired: false, utf8: x => { if (typeof x !== "string") throw new TypeError("no body"); return x; },
    pageKey: u => { const x = new URL(u); return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, ""); },
    fetchAnon: (url, c, cb) => fetched.push([url, cb]), ...extra });
  vm.runInContext(body + "\nthis.profileOf = profileOf; this.creatorName = creatorName; this.learnCreator = learnCreator; this.genericCreator = genericCreator;", ctx);
  return ctx;
}

test("Profile addresses are recognised on any site, and at the root of sites that keep profiles there", () => {
  const { profileOf } = load();
  const key = u => profileOf(u)?.key ?? null;
  assert.equal(key("https://www.tiktok.com/@Some.One/video/1"), "https://tiktok.com/@some.one");
  assert.equal(key("https://www.twitch.tv/SomeStreamer/videos"), "https://twitch.tv/somestreamer");
  assert.equal(key("https://onlyfans.com/creatorname"), "https://onlyfans.com/creatorname");
  assert.equal(key("https://www.reddit.com/user/someone/comments"), "https://reddit.com/user/someone");
  assert.equal(key("https://www.reddit.com/r/gaming/comments/abc/x"), "https://reddit.com/r/gaming");
  assert.equal(key("https://bsky.app/profile/name.bsky.social"), "https://bsky.app/profile/name.bsky.social");
  assert.equal(key("https://www.linkedin.com/in/jane-doe"), "https://linkedin.com/in/jane-doe");
  assert.equal(key("https://example-tube.com/channel/AbC123"), "https://example-tube.com/channel/AbC123", "channel ids keep their case");
  assert.equal(profileOf("https://www.pornhub.com/model/somebody").weak, true, "shared words wait for the page to say it is a person");
  assert.equal(key("https://www.twitch.tv/directory"), null, "site sections are not profiles");
  assert.equal(key("https://x.com/home"), null);
  assert.equal(key("https://vimeo.com/123456"), null, "numeric root paths are content, not handles");
  assert.equal(key("https://example.com/about"), null, "unknown sites need a profile shape");
  assert.equal(key("https://www.youtube.com/@x"), null, "YouTube keeps its own adapter");
});

test("A page names its creator through structured data or oEmbed, only on its own site", () => {
  const ctx = load(), tab = { closing: false, hasAttribute: () => false, linkedBrowser: { currentURI: { spec: "https://vids.example.com/watch/42" } }, label: "x" };
  ctx.learnCreator(tab, "https://vids.example.com/watch/42", { siteName: "ExampleVids", authors: [
    { name: "Elsewhere", url: "https://other.net/@spoof" },
    { name: "Alice Art", url: "/@alice", image: "https://cdn.example.com/a.jpg" }] });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.genericCreator(tab, false))), { key: "https://vids.example.com/@alice", label: "Alice Art" });
  assert.deepEqual(ctx.routed, ["creator"]);
  const tab2 = { ...tab, linkedBrowser: { currentURI: { spec: "https://vimeo.com/987" } } };
  ctx.learnCreator(tab2, "https://vimeo.com/987", { oembed: "https://vimeo.com/api/oembed.json?url=x", authors: [] });
  assert.equal(ctx.fetched.length, 1);
  ctx.fetched[0][1](JSON.stringify({ author_name: "Bob Films", author_url: "https://vimeo.com/bobfilms" }));
  assert.equal(ctx.genericCreator(tab2, false).label, "Bob Films");
  assert.equal(ctx.metadata.get("0:https://vids.example.com/@alice").image, "https://cdn.example.com/a.jpg", "the page's picture is kept for the creator");
});

test("An oEmbed answer without a usable author is not asked for again until the retry delay passes", () => {
  let now = 1000000;
  const ctx = load({ Date: { now: () => now } }), spec = "https://vimeo.com/555";
  const tab = { closing: false, hasAttribute: () => false, linkedBrowser: { currentURI: { spec } }, label: "x" };
  const meta = { oembed: "https://vimeo.com/api/oembed.json?url=x", authors: [] };
  ctx.learnCreator(tab, spec, meta);
  ctx.fetched[0][1](JSON.stringify({ author_name: "", author_url: "https://vimeo.com/someone" }));
  ctx.learnCreator(tab, spec, { ...meta, title: "Retitled" });
  assert.equal(ctx.fetched.length, 1, "the next title asks nothing");
  now += 600000;
  ctx.learnCreator(tab, spec, meta);
  assert.equal(ctx.fetched.length, 2, "after the retry delay it asks again");
  ctx.fetched[1][1](null);
  ctx.learnCreator(tab, spec, meta);
  assert.equal(ctx.fetched.length, 2, "a failed request waits too");
  assert.equal(ctx.genericCreator(tab, false), null);
});

test("A profile page is named from its own title, without the site or handle", () => {
  const ctx = load(), spec = "https://www.instagram.com/someone/";
  const tab = { closing: false, hasAttribute: () => false, linkedBrowser: { currentURI: { spec } }, label: "x" };
  assert.equal(ctx.genericCreator(tab, false).label, "someone", "the handle until the page answers");
  ctx.learnCreator(tab, spec, { siteName: "Instagram", ogTitle: "Some One (@someone) • Instagram photos and videos" });
  assert.equal(ctx.genericCreator(tab, false).label, "Some One");
  assert.equal(ctx.creatorName("Streamer Name - Twitch", "Twitch"), "Streamer Name");
  assert.equal(ctx.creatorName("Watch Cool Clip | SiteX", "SiteX"), "Cool Clip");
  assert.equal(ctx.creatorName("\u202Eevil\u202C Name\u0085 - Site", "Site"), "evil Name", "no controls or bidi overrides");
  assert.equal(ctx.creatorName("Dev \u{1F469}\u200D\u{1F4BB} - Site", "Site"), "Dev \u{1F469}\u200D\u{1F4BB}", "joined emoji stay whole");
});

test("The page side reads authors from structured data, microdata and author links", () => {
  const ctx = vm.createContext({ JSWindowActorChild: class {} });
  vm.runInContext(childSource + "\nthis.readMeta = readMeta;", ctx);
  const el = (attrs, extra = {}) => ({ getAttribute: n => attrs[n] ?? null, textContent: extra.text || "", href: attrs.href || "", matches: () => !!extra.matches, querySelector: () => extra.child || null });
  const doc = { documentURI: "https://site.example/v/1", title: "Clip",
    querySelector: sel => sel.includes("og:site_name") ? el({ content: "Site" }) : sel.includes('rel~="author"') ? el({ href: "https://site.example/u/carol" }, { text: "Carol" }) : null,
    querySelectorAll: sel => sel.includes("ld+json") ? [{ textContent: JSON.stringify({ "@type": "VideoObject", author: { "@type": "Person", name: "Dana", url: "https://site.example/@dana" } }) }] : [] };
  const meta = JSON.parse(JSON.stringify(ctx.readMeta(doc)));
  assert.equal(meta.siteName, "Site");
  assert.deepEqual(meta.authors.map(a => a.name), ["Dana", "Carol"]);
  assert.ok(meta.types.includes("VideoObject"));
  const listed = { ...doc, querySelector: () => null, querySelectorAll: sel => sel.includes("ld+json") ? [{ textContent: JSON.stringify({ author: [
    { name: "Eve", sameAs: "https://site.example/@eve", image: [{ url: "https://cdn.example/eve.jpg" }] },
    { name: "Finn", sameAs: ["https://site.example/@finn"], image: "https://cdn.example/finn.jpg" }] }) }] : [] };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.readMeta(listed).authors)), [
    { name: "Eve", url: "https://site.example/@eve", image: "https://cdn.example/eve.jpg" },
    { name: "Finn", url: "https://site.example/@finn", image: "https://cdn.example/finn.jpg" }], "sameAs and image as one value or a list");
});
