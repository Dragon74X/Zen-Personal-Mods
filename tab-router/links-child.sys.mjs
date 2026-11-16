// Tab Router: switch to an already open page instead of opening a copy.
// Runs in each page's top frame. Only a real click on a link is considered:
// back/forward, reloads, form submissions, redirects and script navigation
// never pass through here. Holding Alt opens a copy as usual.
const OPEN_PAGES = "zzrouter:open-pages", PAGE_TABS = "zzrouter:page-tabs";
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref_src|_hsenc|_hsmi)$/i;

// Same page: address without #anchor, tracking parameters, www. or a
// trailing slash. Groupflow's folder pages use the same rule.
export function pageKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const query = [...u.searchParams].filter(([k]) => !TRACKING.test(k));
    const search = query.length ? "?" + new URLSearchParams(query).toString() : "";
    return u.hostname.toLowerCase().replace(/^www\./, "") + (u.port ? ":" + u.port : "") +
      (u.pathname.replace(/\/+$/, "") || "") + search;
  } catch { return null; }
}

// Who made this page, read from the page itself when Tab Router asks: works
// for any site, signed in or age-gated, with no request of its own. Only
// inert markup is read (structured data, meta and link tags); every value is
// bounded here and checked again by the parent, which treats it as untrusted.
const MAX = 500;
const text = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX) : "";
function authorsFromJSON(node, out, types, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6 || out.length > 8) return;
  if (Array.isArray(node)) { for (const item of node) authorsFromJSON(item, out, types, depth + 1); return; }
  if (depth <= 2 && types.length < 20) for (const type of [].concat(node["@type"] || [])) if (typeof type === "string") types.push(text(type));
  for (const field of ["author", "creator"]) {
    for (const who of [].concat(node[field] || [])) {
      if (typeof who === "string") out.push({ name: text(who), url: "" });
      else if (who && typeof who === "object") out.push({ name: text(who.name || who.alternateName), url: text(who.url || who["@id"] || who.sameAs?.[0] || ""), image: text(typeof who.image === "string" ? who.image : who.image?.url || "") });
    }
  }
  for (const value of Object.values(node)) if (value && typeof value === "object") authorsFromJSON(value, out, types, depth + 1);
}
function readMeta(doc) {
  const meta = name => text(doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content"));
  const href = selector => { const el = doc.querySelector(selector); return el ? text(el.href || el.getAttribute("content") || "") : ""; };
  const authors = [], types = [];
  for (const script of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, 12)) {
    const raw = script.textContent;
    if (!raw || raw.length > 200000) continue;
    try { authorsFromJSON(JSON.parse(raw), authors, types); } catch {}
  }
  for (const el of [...doc.querySelectorAll('[itemprop~="author"], [itemprop~="creator"]')].slice(0, 4)) {
    const link = el.matches("a[href], link[href]") ? el : el.querySelector('[itemprop~="url"][href], [itemprop~="url"][content], a[href], link[href]');
    const name = el.querySelector('[itemprop~="name"]');
    authors.push({ name: text(name?.getAttribute("content") || name?.textContent || (el.matches("a") ? el.textContent : "")),
      url: text(link?.href || link?.getAttribute("content") || "") });
  }
  for (const el of [...doc.querySelectorAll("[itemtype]")].slice(0, 6)) {
    const type = /schema\.org\/(\w+)/.exec(el.getAttribute("itemtype") || "")?.[1];
    if (type && types.length < 20) types.push(type);
  }
  const rel = doc.querySelector('a[rel~="author"][href], link[rel~="author"][href]');
  if (rel) authors.push({ name: text(rel.textContent || rel.getAttribute("title")), url: text(rel.href) });
  const named = meta("author") || meta("article:author");
  if (named) authors.push(/^https?:/i.test(named) ? { name: "", url: named } : { name: named, url: "" });
  return {
    url: text(doc.documentURI), title: text(doc.title),
    siteName: meta("og:site_name"), ogTitle: meta("og:title"), ogImage: meta("og:image"), ogType: meta("og:type"),
    canonical: href('link[rel="canonical"]') || meta("og:url"),
    oembed: href('link[type="application/json+oembed"]'),
    touchIcon: href('link[rel~="apple-touch-icon"]'),
    twitterCreator: meta("twitter:creator"),
    authors: authors.filter(a => a.name || a.url).slice(0, 8), types,
  };
}

export class ZzRouterLinksChild extends JSWindowActorChild {
  receiveMessage(message) {
    if (message.name !== "ZzRouter:Meta") return null;
    try { return this.document ? readMeta(this.document) : null; } catch { return null; }
  }
  handleEvent(event) {
    // Middle-clicks never reach this listener; Tab Router checks them in the
    // parent, where Firefox opens the new tab, before the tab exists.
    if (!event.isTrusted || event.defaultPrevented || event.button !== 0) return;
    const link = event.composedPath().find(node =>
      (node?.localName === "a" || node?.localName === "area") && typeof node.href === "string" && node.href);
    if (!link || link.hasAttribute("download") || event.shiftKey) return;
    const href = link.href, key = pageKey(href);
    if (!key || key === pageKey(this.document.documentURI)) return;   // same page, #anchor or not a web page
    const ctx = this.browsingContext.originAttributes?.userContextId || 0;
    const newTab = event.ctrlKey || event.metaKey || link.target === "_blank";
    if (event.altKey) return;            // a deliberate copy
    let open = null, pageTabs = null;
    try { open = Services.cpmm.sharedData.get(OPEN_PAGES); pageTabs = Services.cpmm.sharedData.get(PAGE_TABS); } catch {}
    if (open?.has?.(`${ctx}|${key}`)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.sendAsyncMessage("ZzRouter:SwitchTo", { key, ctx, href, newTab });
      return;
    }
    // A folder's own page stays on it: the link opens in its own tab.
    if (!newTab && pageTabs?.has?.(this.browsingContext.browserId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.sendAsyncMessage("ZzRouter:OpenFromPage", { key, ctx, href });
    }
  }
}
