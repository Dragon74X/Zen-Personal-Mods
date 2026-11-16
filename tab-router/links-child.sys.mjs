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

export class ZzRouterLinksChild extends JSWindowActorChild {
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
