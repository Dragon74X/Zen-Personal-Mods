// ==UserScript==
// @name           Tab Router
// @description    Sorts tabs into nested tab groups by domain, using your rules.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // ---- single instance ---------------------------------------------------
  // Sine has two injection paths and only one of them checks whether this
  // script is already in the window, so a rebuild can install a second copy.
  // Retire whatever is here, then claim the window. instance.retire is the
  // pending startup observer until start() swaps in the real cleanup.
  const INSTANCE_KEY = "__zzrouterInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const P = "zzrouter.";
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(P + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref(P + k, d); } catch { return d; } };
  // Types are CHECKED, never guessed by attempting reads. Calling
  // getIntPref on a string pref (or getStringPref on a bool) throws
  // NS_ERROR_UNEXPECTED, and Firefox logs every one even when it is
  // caught -- and num() runs per tab per sweep, so that logs continuously.
  function prefNum(full, d) {
    const S = Services.prefs;
    let t;
    try { t = S.getPrefType(full); } catch { return d; }
    try {
      if (t === S.PREF_INT) {
        const v = S.getIntPref(full);
        return Number.isFinite(v) ? v : d;
      }
      if (t === S.PREF_STRING) {
        const v = parseFloat(S.getStringPref(full));
        return Number.isFinite(v) ? v : d;
      }
    } catch {}
    return d;
  }

  function num(k, d) { return prefNum(P + k, d); }

  let log = [];
  const note = (m) => {
    log.push([Date.now(), m]);          // formatted lazily in log()
    if (log.length > 300) log.shift();
    if (bool("debug", false)) console.log("[TabRouter]", m);
  };
  const formatLog = () =>
    log.map(([t, m]) => `${new Date(t).toLocaleTimeString()}  ${m}`);

  // ---- caches ------------------------------------------------------------
  // Pref strings (rules, aliases, ignore words) were re-parsed on every tab
  // and every path segment. Parsed once, invalidated by a pref observer.
  const parsed = {};
  const prefObserver = { observe(_s, _t, data) {
    // saveLearned() writes learned-names from inside a routing pass. Treating
    // that like a user edit threw away every parsed rule, alias and domain
    // list and invalidated every tab's cached target -- once per name learned,
    // which on a fresh session is once per new site. The cache it feeds is
    // already current, so its own write is not a reason to reparse anything.
    if (data === P + "learned-names" || data === P + "avatars") return;
    if (data === P + "section-icons") { stampIcons(); return; }
    for (const k of Object.keys(parsed)) delete parsed[k]; learnedCache = null; targetGen++;
  } };
  function cached(key, make) {
    if (!(key in parsed)) parsed[key] = make();
    return parsed[key];
  }

  // Pref key kept as folder-separator so nobody's saved value is lost;
  // it now separates GROUP levels.
  const SEP = () => str("folder-separator", " / ");

  // ---- naming ------------------------------------------------------------
  // "baldursgate3" carries no word boundaries, so there is no reliable way
  // to recover "Baldur's Gate 3" from the slug alone -- that needs either a
  // dictionary or the page title. The alias map is the dependable answer;
  // prettify only handles the cases where separators DO exist. Aliases apply
  // to every name part: path slugs, subdomains and bare domain names alike,
  // so "nexusmods = Nexus Mods" works too.
  function aliasMap() {
    return cached("aliases", () => {
      const map = new Map();
      for (const pair of str("auto-path-aliases", "").split(/[\n,]+/)) {
        const i = pair.indexOf("=");
        if (i < 0) continue;
        const k = pair.slice(0, i).trim().toLowerCase();
        const v = pair.slice(i + 1).trim();
        if (k && v) map.set(k, v);
      }
      return map;
    });
  }

  function prettify(seg) {
    const alias = aliasMap().get(seg.trim().toLowerCase());
    if (alias) return alias;
    return seg
      .replace(/[-_+]+/g, " ")                    // kebab and snake case
      .replace(/([a-z])([A-Z])/g, "$1 $2")        // camelCase
      .replace(/([a-zA-Z])(\d)/g, "$1 $2")        // trailing version numbers
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // nexusmods.com -> Nexusmods, crimson-desert.gg -> Crimson Desert.
  // Alias the whole base domain if you want something else entirely.
  function domainName(base) {
    const alias = aliasMap().get(base.trim().toLowerCase());
    if (alias) return alias;
    return prettify(base.split(".")[0]);
  }

  // ---- learned names ------------------------------------------------------
  // "dragonage" is a slug; the tab title "Dragon Age: Origins Mods - Nexus
  // Mods" holds the human name. When a title chunk plausibly matches the
  // slug it is learned once and persisted, so every later tab files under
  // the good name with zero manual work. User aliases always win.
  let learnedCache = null;
  function learnedMap() {
    if (learnedCache) return learnedCache;
    try { learnedCache = new Map(Object.entries(JSON.parse(str("learned-names", "{}")))); }
    catch { learnedCache = new Map(); }
    return learnedCache;
  }
  function saveLearned() {
    try {
      Services.prefs.setStringPref(P + "learned-names",
        JSON.stringify(Object.fromEntries([...learnedMap()].slice(-200))));
    } catch {}
  }

  function titleNameFor(tab, slug) {
    let t = tab.label || "";
    if (!t || /^https?:/i.test(t) || t.includes("/")) return null;   // still loading
    // Titles are usually "Thing - Site" or "Thing | Site".
    let name = t.split(/\s+[-|\u2013\u2014\u00b7]\s+/)[0].trim();
    name = name.replace(/\s+(Mods|Mod|Wiki|Home|Official Site)$/i, "").trim();
    if (!name || name.length > 48) return null;
    // Relatedness guard: a deep page's title names the PAGE, not the
    // section. Only learn when title and slug visibly share a stem.
    const a = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const b = slug.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!a || !b) return null;
    if (!(a.includes(b.slice(0, 5)) || b.includes(a.slice(0, 5)))) return null;
    return name;
  }

  // alias > learned > learn-from-title-now > prettify
  function segName(tab, seg) {
    const slug = seg.trim().replace(/^@/, "").toLowerCase();
    const a = aliasMap().get(slug);
    if (a) return a;
    const l = learnedMap().get(slug);
    if (l) return l;
    const t = titleNameFor(tab, slug);
    if (t) {
      learnedMap().set(slug, t);
      targetGen++;                       // other tabs' cached paths may now differ
      saveLearned();
      note(`learned name: ${slug} = ${t}`);
      return t;
    }
    return prettify(seg.replace(/^@/, ""));
  }

  // ---- rules -------------------------------------------------------------
  // One rule per line:  github.com, gitlab.com > Dev
  // Left side is a comma-separated list of domain fragments, right side is
  // the group name. A name containing the separator nests: "Work / Email"
  // is a subgroup Email inside a group Work. First matching rule wins.
  function rules() {
    return cached("rules", () => str("rules", "")
      .split(/[\n;]+/)
      .map(line => {
        const i = line.indexOf(">");
        if (i < 0) return null;
        const domains = line.slice(0, i).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const group = line.slice(i + 1).trim();
        return domains.length && group ? { domains, group } : null;
      })
      .filter(Boolean));
  }

  function hostOf(tab) {
    try {
      const spec = tab.linkedBrowser?.currentURI?.spec ?? "";
      if (!/^https?:/i.test(spec)) return null;   // skip about:, file:, chrome:
      return tab.linkedBrowser.currentURI.host.toLowerCase();
    } catch { return null; }
  }

  function baseDomain(host) {
    try { return Services.eTLD.getBaseDomain(Services.io.newURI("https://" + host)); }
    catch { return host; }
  }

  // Many sites separate sections by PATH, not subdomain:
  //   nexusmods.com/games/cyberpunk2077   -> path
  //   docs.proton.me                      -> subdomain
  // www.nexusmods.com has no subdomain at all, so subdomain nesting can
  // never split it. This reads path segments instead.
  // Generic route words that make useless group names. Built in so search
  // engines don't produce a "Search" subgroup; the pref ADDS to this list.
  const BUILTIN_IGNORE = new Set(("search,results,watch,videos,video,shorts,feed," +
    "browse,explore,channel,playlist,games,game,category,categories,c,p,en,en-us," +
    "www,index,home,wiki,tag,tags,new,top,hot,trending,threads,posts,post,r,user,users")
    .split(","));

  function pathParts(tab) {
    const depth = num("auto-path-depth", 0);
    if (depth < 1) return [];
    // Path subgroups are opt-in per site. Deriving them from any URL made
    // sense on YouTube, where the first path segment is a creator handle,
    // and nonsense nearly everywhere else -- shops, docs and forums put
    // section names, ids and slugs there, so every site grew subgroups
    // nobody asked for. Only the domains listed here get them.
    const allow = cached("pathdomains", () => str("auto-path-domains", "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    if (!allow.length) return [];
    const host = hostOf(tab);
    if (!host || !allow.some(d => host === d || host.endsWith("." + d))) return [];
    let path = "";
    try { path = tab.linkedBrowser?.currentURI?.filePath ?? ""; } catch { return []; }
    const skipWords = cached("skipwords", () => new Set(
      str("auto-path-ignore", "")
        .split(",").map(s => s.trim().toLowerCase()).filter(Boolean)));
    // decodeURIComponent throws on a malformed escape, and this runs inside
    // route(): one bad %-sequence in a URL must not abort the pass.
    const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
    const segs = path.split("/")
      .map(s => decode(s).trim())
      .filter(Boolean)
      .filter(s => !BUILTIN_IGNORE.has(s.toLowerCase()) && !skipWords.has(s.toLowerCase()))
      // drop pure ids and file names, which make useless group names
      .filter(s => !/^\d+$/.test(s) && !/\.[a-z0-9]{2,4}$/i.test(s));
    const parts = segs.slice(0, depth).map(s => segName(tab, s));
    if (parts.length) wantSectionIcon(tab, host, segs[0], parts[0]);
    return parts;
  }

  // Retitle events repeat for an unchanged URL; the full computation
  // (eTLD, rules, path parsing, alias/learned lookups) is cached per tab by
  // URI spec. Invalidated by URL change per tab, and by any pref change.
  const targetCache = new WeakMap();
  let targetGen = 0;

  function targetPath(tab) {
    let spec = null;
    try { spec = tab.linkedBrowser?.currentURI?.spec ?? null; } catch {}
    if (spec) {
      const hit = targetCache.get(tab);
      if (hit && hit.spec === spec && hit.gen === targetGen) return hit.parts;
      const parts = withCreator(tab, computeTargetPath(tab));
      // A path still waiting on its creator must be recomputed next pass,
      // or the tab sits in the base group for as long as its URL is
      // unchanged -- on a watch page, the whole time it is open.
      const id = videoId(tab);
      if (!id || !bool("media-subgroups", false) || creatorMap().has(id)) {
        targetCache.set(tab, { spec, gen: targetGen, parts });
      }
      return parts;
    }
    return withCreator(tab, computeTargetPath(tab));
  }

  // Returns the target as a PATH: ["Nexusmods", "Stalker 2"]. Each level is
  // a nested tab group. A flat name is just a one-element path.
  // ---- creator via oEmbed -------------------------------------------------
  // A watch URL names the video, never the channel. The page's MediaSession
  // gives the channel for free but only while the video is PLAYING, so a tab
  // opened and never played could not be filed (docs/SHELVED.md). YouTube's
  // oEmbed endpoint answers for any video: one ~1KB JSON request, no key,
  // returns author_name. One request per new video, then remembered.
  //
  // The request is built INSIDE the tab's container and sent anonymously.
  // Container: the channel carries the tab's userContextId in its origin
  // attributes, so its cache entry lives in that container's partition and
  // nothing about it is visible from another container. Anonymous:
  // LOAD_ANONYMOUS strips cookies both ways, so YouTube cannot tie the
  // lookup to an account and the lookup writes no cookie back. Private
  // windows are skipped outright -- nothing leaves them.
  const OEMBED = "https://www.youtube.com/oembed?format=json&url=";
  const isPrivate = () => {
    try {
      return ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
        .PrivateBrowsingUtils.isWindowPrivate(window);
    } catch { return true; }             // cannot tell: treat as private
  };

  // Cache key: the video id, so &t= timestamps and tracking parameters do
  // not fragment one video into many entries.
  function videoId(tab) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      if (!uri || !/^https?$/.test(uri.scheme)) return null;
      const host = uri.host.toLowerCase();
      if (host === "youtu.be") return uri.filePath.replace(/^\/+/, "").split("/")[0] || null;
      if (!/(^|\.)youtube\.com$/.test(host)) return null;
      const v = new URLSearchParams(uri.query || "").get("v");
      if (v) return v;
      const m = uri.filePath.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  let creatorCache = null;
  function creatorMap() {
    if (creatorCache) return creatorCache;
    try { creatorCache = new Map(Object.entries(JSON.parse(str("creators", "{}")))); }
    catch { creatorCache = new Map(); }
    return creatorCache;
  }
  function saveCreators() {
    // Bounded, oldest out. This is a record of which videos were opened, so
    // it is kept small and forgetCreators() empties it.
    try {
      Services.prefs.setStringPref(P + "creators",
        JSON.stringify(Object.fromEntries([...creatorMap()].slice(-300))));
    } catch {}
  }

  const inFlight = new Map();            // videoId -> true while a request is out
  const failed = new Map();              // videoId -> when it last failed (memory only)
  const RETRY_FAIL_MS = 10 * 60 * 1000;

  // One request, built inside the tab's container and sent anonymously (see
  // above). cb(bytes) gets the raw body as a byte string, or null.
  function fetchAnon(url, ctx, cb) {
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    const principal = Services.scriptSecurityManager
      .createContentPrincipal(Services.io.newURI(url), { userContextId: ctx });
    const channel = NetUtil.newChannel({
      uri: url,
      loadingPrincipal: principal,
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
    });
    channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
    NetUtil.asyncFetch(channel, (stream, status) => {
      let body = null;
      try {
        if (Components.isSuccessCode(status)) body = NetUtil.readInputStreamToString(stream, stream.available());
      } catch {}
      cb(body);
    });
  }
  // Byte string -> JS string, for text bodies.
  const utf8 = (bytes) => decodeURIComponent(escape(bytes));

  function fetchCreator(tab, id) {
    if (inFlight.has(id)) return;
    const lastFail = failed.get(id);
    if (lastFail && Date.now() - lastFail < RETRY_FAIL_MS) return;
    inFlight.set(id, true);

    let watch = "";
    try { watch = tab.linkedBrowser.currentURI.spec; } catch {}
    const ctx = parseInt(tab.getAttribute("usercontextid") || "0", 10);
    const done = (name, channelUrl) => {
      inFlight.delete(id);
      if (!name) { failed.set(id, Date.now()); return; }
      creatorMap().set(id, name);
      saveCreators();
      note(`creator ${id}: ${name}`);
      if (tab.isConnected && !tab.closing) queueRoute(tab, "creator");
      if (channelUrl) fetchSectionIcon(name, channelUrl, ctx, ICON_SITES[0]);
    };
    try {
      fetchAnon(OEMBED + encodeURIComponent(watch), ctx, (body) => {
        let name = null, channelUrl = null;
        try {
          const j = JSON.parse(utf8(body));
          const n = String(j?.author_name ?? "").trim();
          if (n && n.length <= 80) name = n;
          const u = String(j?.author_url ?? "");
          if (/^https:\/\/www\.youtube\.com\/[@\w][\w.\-\/]{0,120}$/.test(u)) channelUrl = u;
        } catch {}
        done(name, channelUrl);
      });
    } catch (e) { note(`oembed setup failed for ${id}: ${e}`); done(null); }
  }

  // ---- section icons -----------------------------------------------------
  // A subgroup that stands for a creator, a game or an account gets that
  // thing's own picture as its icon; Groupflow reads data-zzrouter-icon off
  // the group before it computes a favicon. Probed on the live profile: a
  // YouTube channel page's og:image is the 900px avatar, a Nexus game page's
  // is the 400x600 cover tile, a GitHub owner page's is the 420px avatar.
  // Each is fetched once per section -- the page, then the picture, both in
  // the tab's container and anonymous -- cropped square, scaled to 64px and
  // kept as a data: URI, so showing it later never touches the network.
  // Only the named picture host is accepted per site, only bytes the image
  // decoder accepts are kept, and the store is bounded to 100 sections.
  const ICON_SITES = [
    { host: /(^|\.)youtube\.com$/, page: (seg) => seg.startsWith("@") ? `https://www.youtube.com/${seg}` : null,
      image: /^https:\/\/yt3\.(?:googleusercontent|ggpht)\.com\//, shape: "round" },
    { host: /(^|\.)nexusmods\.com$/, page: (seg) => `https://www.nexusmods.com/games/${seg}`,
      image: /^https:\/\/images\.nexusmods\.com\//, shape: "square" },
    { host: /^github\.com$/, page: (seg) => `https://github.com/${seg}`,
      image: /^https:\/\/avatars\.githubusercontent\.com\//, shape: "round" },
  ];
  const ICON_MAX = 100;
  const ICON_PX = 64;
  let iconCache = null;
  function iconMap() {
    if (iconCache) return iconCache;
    try {
      iconCache = new Map(Object.entries(JSON.parse(str("avatars", "{}")))
        .map(([k, v]) => [k, typeof v === "string" ? { d: v, s: "round" } : v]));   // 1.25.x stored bare avatars
    } catch { iconCache = new Map(); }
    return iconCache;
  }
  function saveIcons() {
    // A pref string is capped at 1 MB by Firefox; 100 icons at 64px are a
    // few hundred KB. Oldest out first if it ever gets close.
    const entries = [...iconMap()].slice(-ICON_MAX);
    let text = JSON.stringify(Object.fromEntries(entries));
    while (text.length > 900000 && entries.length) { entries.shift(); text = JSON.stringify(Object.fromEntries(entries)); }
    iconCache = new Map(entries);
    try { Services.prefs.setStringPref(P + "avatars", text); } catch {}
  }

  // Any size, any aspect -> a 64px square WebP data: URI. The decoder is
  // the validation: bytes that are not an image never get this far.
  async function toIcon(bytes) {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes, c => c.charCodeAt(0))]));
    const side = Math.min(bmp.width, bmp.height);
    const c = new OffscreenCanvas(ICON_PX, ICON_PX);
    c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, ICON_PX, ICON_PX);
    bmp.close();
    const buf = new Uint8Array(await (await c.convertToBlob({ type: "image/webp", quality: 0.85 })).arrayBuffer());
    let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
    return `data:image/webp;base64,${btoa(bin)}`;
  }

  // label: the group name this section files under (the store key).
  function fetchSectionIcon(label, pageUrl, ctx, site) {
    if (!bool("section-icons", true) || !pageUrl || isPrivate()) return;
    const key = label.trim().toLowerCase(), slot = "icon:" + key;
    if (!key || iconMap().has(key) || inFlight.has(slot)) return;
    const lastFail = failed.get(slot);
    if (lastFail && Date.now() - lastFail < RETRY_FAIL_MS) return;
    inFlight.set(slot, true);
    const done = (icon) => {
      inFlight.delete(slot);
      if (!icon) { failed.set(slot, Date.now()); return; }
      iconMap().set(key, { d: icon, s: site.shape });
      saveIcons();
      note(`icon for "${label}"`);
      stampIcons();
    };
    try {
      fetchAnon(pageUrl, ctx, (html) => {
        // og:image read with a string search, never parsed as a document.
        // A consent interstitial has none; the lookup is retried later.
        const m = html && /<meta property="og:image" content="([^"]{1,400})"/.exec(html);
        const img = m ? m[1].replace(/=s\d+/, "=s256") : null;   // YouTube sizes by suffix
        if (!img || !site.image.test(img)) return done(null);
        try {
          fetchAnon(img, ctx, (bytes) => {
            if (!bytes || bytes.length > 400000) return done(null);
            toIcon(bytes).then(done, (e) => { note(`icon convert failed for "${label}": ${e}`); done(null); });
          });
        } catch { done(null); }
      });
    } catch (e) { note(`icon setup failed for "${label}": ${e}`); done(null); }
  }

  // Called from pathParts() with the raw first segment and the label it
  // became; the site table decides whether that segment names a page.
  function wantSectionIcon(tab, host, seg, label) {
    const site = ICON_SITES.find(x => x.host.test(host));
    if (!site) return;
    const page = site.page(seg);
    if (page) fetchSectionIcon(label, page, parseInt(tab.getAttribute("usercontextid") || "0", 10), site);
  }

  // Subgroups whose label is a known section carry its picture; Groupflow
  // recomputes on request. Root groups are never stamped, so a section
  // named like a top-level group cannot take it over. Switched off: the
  // stamps come off and Groupflow falls back to favicons.
  function stampIcons() {
    const on = bool("section-icons", true);
    let changed = 0;
    for (const g of groups()) {
      const want = on && parentOf(g) ? iconMap().get((g.label ?? "").trim().toLowerCase()) : null;
      if (want) {
        if (g.getAttribute("data-zzrouter-icon") !== want.d) {
          g.setAttribute("data-zzrouter-icon", want.d);
          g.setAttribute("data-zzrouter-icon-shape", want.s);
          changed++;
        }
      } else if (g.hasAttribute("data-zzrouter-icon")) {
        g.removeAttribute("data-zzrouter-icon");
        g.removeAttribute("data-zzrouter-icon-shape");
        changed++;
      }
    }
    if (changed) try { window.Groupflow?.refresh?.(); } catch {}
  }

  // The creator for this tab if known; otherwise starts the lookup and
  // returns null so the tab files under its base path for now.
  function creatorOf(tab) {
    if (!bool("media-subgroups", false) || isPrivate()) return null;
    const id = videoId(tab);
    if (!id) return null;
    const known = creatorMap().get(id);
    if (known) return known;
    fetchCreator(tab, id);
    return null;
  }

  // Appends the creator to whatever path was computed, rule-made or
  // automatic: youtube.com > Watch becomes Watch / Creator. Unknown yet:
  // base path, and the route re-runs when the answer lands.
  function withCreator(tab, parts) {
    if (!parts?.length) return parts;
    const who = creatorOf(tab);
    if (!who || parts.some(p => p.toLowerCase() === who.toLowerCase())) return parts;
    return [...parts, who];
  }

  function computeTargetPath(tab) {
    const host = hostOf(tab);
    if (!host) return null;
    for (const r of rules()) {
      if (r.domains.some(d => host === d || host.endsWith("." + d)))
        return r.group.split(SEP()).map(s => s.trim()).filter(Boolean);
    }
    // Fully automatic: derive the path from the host itself, so a site you
    // have never visited still lands somewhere sensible without a rule.
    if (bool("auto-unmatched", false)) {
      const base = baseDomain(host);

      // Subdomain levels, if any. www is noise, not a real subdomain, so a
      // host like www.nexusmods.com contributes nothing here.
      let subParts = [];
      if (bool("auto-subdomains", true)) {
        let sub = host.length > base.length
          ? host.slice(0, host.length - base.length - 1)
          : "";
        sub = sub.replace(/^www$/i, "").replace(/^www\./i, "");
        if (sub) {
          const depth = Math.max(1, num("auto-depth", 1));
          subParts = sub.split(".").reverse().slice(0, depth).map(prettify);
        }
      }

      const all = [domainName(base), ...subParts, ...pathParts(tab)];
      // Redundancy killer: search.brave.com/search must not become
      // Brave > Search > Search. Any repeat of an earlier part is dropped.
      const out = [];
      for (const p of all) {
        if (out.some(x => x.toLowerCase() === p.toLowerCase())) continue;
        out.push(p);
      }
      return out;
    }
    return null;
  }

  // ---- groups, nested ----------------------------------------------------
  // Nesting mechanism, learned the hard way in 1.8.x when subgroups showed
  // up by accident: gBrowser.addTabGroup(..., { insertBefore: tab }) births
  // the group at the tab's DOM position. A tab already sitting inside a
  // group therefore produces a group INSIDE that group. 1.8.x tripped over
  // this; this version does it on purpose, one level at a time.

  // groups() ran two document queries per call and is called several times
  // per routed tab. Cached; invalidated by the group lifecycle events and by
  // this mod's own mutations.
  let groupsCache = null;
  const bustGroups = () => { groupsCache = null; };

  // A group whose last tab left stays in the DOM for the length of its close
  // animation (tabgroup-js.patch: TabGroupRemoved, then animateItemClose(),
  // then remove()). isConnected is true the whole time, so on its own it let
  // findChild() file a tab into a group that was already on its way out.
  // `tabs` is recursive on Zen -- a parent holding only subgroups counts
  // its grandchildren -- so zero means genuinely empty.
  const live = (g) => g.isConnected && (g.tabs?.length ?? 1) > 0;

  function groups() {
    if (groupsCache && groupsCache.every(live)) return groupsCache;
    const set = new Set();
    try { for (const g of gBrowser.tabGroups) set.add(g); } catch {}
    try { for (const g of document.querySelectorAll("tab-group")) set.add(g); } catch {}
    // Zen folders subclass tab-group but live pinned; split-view wrappers
    // are positional artifacts. Leave both alone.
    groupsCache = [...set].filter(g => g.tagName === "tab-group" && !g.isZenFolder &&
                                       !g.hasAttribute("split-view-group") && live(g));
    return groupsCache;
  }

  const parentOf = (g) => g?.parentElement?.closest("tab-group") ?? null;
  const wsOf = (el) => el?.getAttribute?.("zen-workspace-id") || null;
  // DOM truth: which <zen-workspace id="{uuid}"> section actually holds the
  // element. Groups made by hand carry no zen-workspace-id attribute, and
  // treating that as "matches any workspace" was the ghost bug: filing
  // pulled a tab's DOM into another workspace's section while the tab's
  // attribute said otherwise. Attribute first, section second, and the
  // attribute gets stamped from the section when missing.
  function wsOfEl(el) {
    const a = wsOf(el);
    if (a) return a;
    const sec = el?.closest?.("zen-workspace")?.id || null;
    if (sec && el?.setAttribute) el.setAttribute("zen-workspace-id", sec);
    return sec;
  }

  // ROOT-level groups are workspace-scoped: a "Youtube" in another workspace
  // must not be matched when filing within this one (that is decided
  // earlier, by moving the tab). Nested levels are scoped by parent already.
  function findChild(name, parent, ws) {
    const want = name.trim().toLowerCase();
    return groups().find(g =>
      (g.label ?? "").trim().toLowerCase() === want &&
      parentOf(g) === parent &&
      (parent || !ws || wsOfEl(g) === ws)) ?? null;
  }

  function rootGroupsNamed(name) {
    const want = name.trim().toLowerCase();
    return groups().filter(g =>
      !parentOf(g) && (g.label ?? "").trim().toLowerCase() === want);
  }

  // Ghost repair: a tab whose DOM sits inside a group in workspace B while
  // its own zen-workspace-id still says A is invisible in both. The DOM is
  // already right, so only the attribute needs fixing.
  function healWorkspace(tab) {
    if (!tab.group) return;
    const root = ancestorsOf(tab).at(-1);
    const gws = wsOfEl(root);
    if (gws && wsOf(tab) !== gws) {
      tab.setAttribute("zen-workspace-id", gws);
      try { gBrowser.tabContainer._invalidateCachedTabs(); } catch {}
      note(`healed workspace id on "${tab.label}" -> group's workspace`);
    }
  }

  // ["Work", "Email"] for a tab inside Email inside Work.
  function chainOf(tab) {
    const out = [];
    let g = tab.group ?? null;
    while (g && g.tagName === "tab-group") {
      out.unshift((g.label ?? "").trim());
      g = parentOf(g);
    }
    return out;
  }

  const samePath = (a, b) =>
    a.length === b.length && a.every((s, i) => s.toLowerCase() === b[i].toLowerCase());

  // gBrowser.tabs does not cover everything in Zen: on a real profile it
  // reported 13 while the document held 56 .tabbrowser-tab elements, 25 of
  // them Essentials. Union both sources, de-duplicated.
  function allTabs() {
    const set = new Set();
    try { for (const t of gBrowser.tabs) set.add(t); } catch {}
    try { for (const t of document.querySelectorAll(".tabbrowser-tab")) set.add(t); } catch {}
    return [...set];
  }

  // ---- ancestry ----------------------------------------------------------
  function ancestorsOf(tab) {
    const out = [];
    let g = tab.group ?? null;
    while (g && g.tagName === "tab-group") { out.push(g); g = parentOf(g); }
    return out;
  }

  // gBrowser.ungroupTab(tab) -> tab.group.after(tab): pops exactly ONE level,
  // in place, never across a workspace (verified on 1.22b). Looping it walks
  // the tab out to the root. Only needed when NO level of the target exists
  // yet; otherwise addTabs() reparents straight into the deepest one.
  function ungroupFully(tab) {
    for (let i = 0; i < 12 && tab.group; i++) {
      const g = tab.group;
      try { gBrowser.ungroupTab(tab); } catch (e) { note(`ungroup threw on "${g.label}": ${e}`); return false; }
      if (tab.group === g) { note(`ungroup made no progress on "${g.label}"`); return false; }
    }
    return !tab.group;
  }

  // Filed in ["Youtube", "Creator"] when ["Youtube"] was wanted: a DEEPER
  // subgroup of the right path is better organisation, not drift. Leave it.
  const startsWithPath = (chain, want) =>
    want.length && chain.length >= want.length && samePath(chain.slice(0, want.length), want);

  function placeInPath(tab, parts) {
    if (!parts?.length) return false;
    const cap = num("max-depth", 0);
    if (cap > 0) parts = parts.slice(0, cap);

    if (startsWithPath(chainOf(tab), parts)) {        // filed right (or deeper)
      healWorkspace(tab);
      return false;
    }

    // ---- destination resolution, systemic and in strict order ----------
    // Workspace:  Zen space-routing rule  >  workspace already holding the
    //             root group  >  the tab's current workspace.
    // Container:  the routed workspace's default (a Zen route carries no
    //             container of its own; per 1.21.4b source it IS the target
    //             workspace's containerTabId)  >  what the tabs already in
    //             the destination group use  >  workspace default  >  keep.
    // Containers are immutable on a live tab, so a change means reopening
    // through addTab (skipRoute on), exactly like Zen's own space routing.
    const dest = resolveDestination(tab, parts);
    const tabWs = wsOf(tab) || window.gZenWorkspaces?.activeWorkspace;
    const haveCtx = parseInt(tab.getAttribute("usercontextid") || "0", 10);

    if (bool("follow-containers", true) && dest.ctx != null && dest.ctx !== haveCtx) {
      const fresh = reopenInContainer(tab, dest.ctx, dest.ws);
      if (fresh !== tab) { bustGroups(); return file(fresh, parts); }
    }
    if (dest.ws && dest.ws !== tabWs) {
      try {
        window.gZenWorkspaces.moveTabToWorkspace(tab, dest.ws);
        note(`moved "${tab.label}" to ${dest.why}`);
      } catch (e) {
        note(`workspace move failed: ${e}; filing in current workspace instead`);
      }
    }
    return file(tab, parts);
  }

  function resolveDestination(tab, parts) {
    let ws = null, ctx = null, why = "", stay = false;
    // 1) Zen route for this URL (the "Add Route for Domain" rules).
    //    routeUri() returns "most-recent-space" both for an explicit
    //    stay-here rule AND for no rule at all, so the routes are matched
    //    directly to tell them apart: an explicit stay-here rule pins
    //    filing to the current workspace -- the group is created here
    //    rather than chasing a same-named group in another workspace.
    try {
      const url = tab.linkedBrowser?.currentURI?.spec;
      const m = window.gZenSpaceRoutingManager;
      if (url && m?.getAllRoutes && m?.isRouteMatching) {
        for (const route of m.getAllRoutes()) {
          if (!m.isRouteMatching(url, route)) continue;
          if (route.openIn === "most-recent-space") { stay = true; break; }
          const w = window.gZenWorkspaces?.getWorkspaceFromId?.(route.openIn);
          if (w) {
            ws = w.uuid ?? route.openIn;
            if (typeof w.containerTabId === "number") ctx = w.containerTabId;
            why = "the workspace named by a Zen route";
          }
          break;
        }
      }
    } catch (e) { note(`route lookup failed: ${e}`); }

    // 2) Existing root group decides the workspace when no route did, and
    //    its members' container is the next container fallback.
    const tabWs = wsOf(tab) || window.gZenWorkspaces?.activeWorkspace;
    const roots = rootGroupsNamed(parts[0]);
    const root = (ws && roots.find(g => wsOfEl(g) === ws))
              ?? roots.find(g => wsOfEl(g) === tabWs)
              ?? (stay ? null : roots[0] ?? null);
    if (!ws && !stay && root && wsOfEl(root) !== tabWs) {
      ws = wsOfEl(root);
      why = `the workspace holding "${parts[0]}"`;
    }
    if (ctx == null && root) ctx = majorityContext(root);

    if (!ws) ws = tabWs;
    // 3) Workspace default container.
    if (ctx == null) {
      try {
        const w = window.gZenWorkspaces?.getWorkspaceFromId?.(ws);
        if (typeof w?.containerTabId === "number") ctx = w.containerTabId;
      } catch {}
    }
    return { ws, ctx, why };
  }

  // Most common usercontextid among the tabs already in the group. 0 is a
  // real answer (no container) when the members say so; null only when the
  // group is empty, which falls through to the workspace default.
  function majorityContext(group) {
    const counts = new Map();
    for (const t of group.querySelectorAll(".tabbrowser-tab")) {
      const c = parseInt(t.getAttribute("usercontextid") || "0", 10);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (!counts.size) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Reopens the tab with the given container (and workspace, when given);
  // returns the tab to keep filing -- the fresh one, or the original on
  // failure.
  function reopenInContainer(tab, wantCtx, targetWs) {
    const url = (() => { try { return tab.linkedBrowser?.currentURI?.spec; } catch { return null; } })();
    if (!url || !/^https?:/i.test(url)) return tab;
    let fresh = null;
    try {
      // The navigating page's own principal, like Zen's routing redirect
      // uses; null principal as the safe fallback. Never the system
      // principal for a web URL.
      const principal = tab.linkedBrowser?.contentPrincipal ||
        Services.scriptSecurityManager.createNullPrincipal({});
      fresh = gBrowser.addTab(url, {
        userContextId: wantCtx,
        triggeringPrincipal: principal,
        inBackground: !tab.selected,
        skipRoute: true,
      });
    } catch (e) { note(`container reopen failed: ${e}`); return tab; }
    try {
      if (targetWs) window.gZenWorkspaces.moveTabToWorkspace(fresh, targetWs);
    } catch {}
    try { gBrowser.removeTab(tab); } catch {}
    note(`reopened "${url.slice(0, 60)}" in container ${wantCtx}`);
    return fresh;
  }

  // Files the tab under `parts`, touching only what differs. Verified
  // primitives on 1.22b: addTabGroup([tab], {insertBefore: tab}) is born at
  // the tab's DOM position, so inside a group it nests; group.addTabs([tab])
  // reparents from anywhere; a group Zen empties removes itself after its
  // close animation, so nothing here removes groups -- and removeTabGroup()
  // is never called, because it closes the tabs.
  function file(tab, parts) {
    const ws = wsOf(tab) || window.gZenWorkspaces?.activeWorkspace || null;

    // Deepest existing prefix of the path, root level scoped to the workspace.
    let parent = null, depth = 0;
    for (const name of parts) {
      const g = findChild(name, parent, parent ? null : ws);
      if (!g) break;
      parent = g; depth++;
    }

    // Put the tab in the deepest existing level. addTabs() moves it out of
    // wherever it sits; with no level existing, walk it out to the root.
    if (parent) {
      if (tab.group !== parent) {
        try { parent.addTabs([tab]); }
        catch (e) { note(`addTabs failed on "${parent.label}": ${e}`); return false; }
        if (tab.group !== parent) { note(`addTabs did not move "${tab.label}" into "${parent.label}"`); return false; }
      }
    } else if (tab.group && !ungroupFully(tab)) {
      return false;
    }

    // Create the missing levels beneath it, one at a time. Each new group is
    // born where the tab sits, i.e. inside the level just above.
    for (const name of parts.slice(depth)) {
      if (!bool("create-groups", true)) { note(`"${name}" does not exist and group creation is switched off`); return depth > 0; }
      if (typeof gBrowser.addTabGroup !== "function") { note("gBrowser.addTabGroup missing on this build"); return depth > 0; }
      let g;
      try { g = gBrowser.addTabGroup([tab], { label: name, insertBefore: tab, isUserTriggered: true }); }
      catch (e) { note(`addTabGroup("${name}") threw: ${e}`); return depth > 0; }
      if (!g) { note(`addTabGroup("${name}") returned nothing`); return depth > 0; }
      g.setAttribute("data-zzrouter-created", Date.now());
      if (!parent && ws && !wsOf(g)) g.setAttribute("zen-workspace-id", ws);
      if (parent && parentOf(g) !== parent) note(`"${name}" did not nest under "${parent.label}" on this build`);
      bustGroups();
      note(`created group "${name}"${parent ? ` under "${parent.label}"` : ""}`);
      parent = g; depth++;
    }
    return true;
  }

  // ---- ordering ----------------------------------------------------------
  // Inside every group: loose tabs on top, subgroups below them. Groups and
  // subgroups sorted alphabetically (default), by creation time, or left
  // manual. Pure sibling reordering inside one container -- never crosses a
  // group or workspace boundary, so it cannot ghost or refile anything.

  function orderCmp(mode) {
    return (a, b) => {
      if (mode === 1) {
        const ca = +(a.getAttribute("data-zzrouter-created") || 0);
        const cb = +(b.getAttribute("data-zzrouter-created") || 0);
        if (ca !== cb) return ca - cb;   // hand-made groups (no stamp) sort oldest
      }
      return (a.label || "").localeCompare(b.label || "", undefined, { sensitivity: "base" });
    };
  }

  const domOrder = (els) => els.slice().sort((a, b) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

  function mvEl(el, fn) {
    try {
      if (typeof gBrowser.zenHandleTabMove === "function") gBrowser.zenHandleTabMove(el, fn);
      else fn();
    } catch (e) { note(`order move failed on "${el.label ?? el.className}": ${e}`); }
  }

  // Reorders els among themselves at the position of their current block;
  // loose siblings outside `els` keep their place.
  const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  function reorderBlock(parentNode, els, sorted) {
    if (els.length < 2 || sameOrder(domOrder(els), sorted)) return;
    const next = domOrder(els).at(-1).nextSibling;
    for (const el of sorted) mvEl(el, () => parentNode.insertBefore(el, next));
  }

  function applyOrder() {
    const mode = num("sort-mode", 0);          // 0 alpha, 1 created, 2 manual
    const tabsFirst = bool("tabs-first", true);
    if (mode === 2 && !tabsFirst) return;
    const cmp = orderCmp(mode);
    const all = groups().filter(g => !g.pinned);

    // Root-level groups, per containing section (keeps workspaces intact).
    if (mode !== 2) {
      const byParent = new Map();
      for (const g of all) {
        if (parentOf(g)) continue;
        const p = g.parentElement;
        if (!p) continue;
        if (!byParent.has(p)) byParent.set(p, []);
        byParent.get(p).push(g);
      }
      for (const [p, gs] of byParent) reorderBlock(p, gs, gs.slice().sort(cmp));
    }

    // Inside each group.
    for (const g of all) {
      const c = g.groupContainer ?? g.querySelector(".tab-group-container");
      if (!c) continue;
      // A subgroup Zen is animating out still sits in the DOM with no
      // tabs; zenHandleTabMove throws on it (previousTabStates[0]).
      const subs = [...c.children].filter(el => el.tagName === "tab-group" && live(el));
      if (!subs.length) continue;
      const sorted = mode === 2 ? domOrder(subs) : subs.slice().sort(cmp);
      if (tabsFirst) {
        // Appending every subgroup to the container end leaves all loose
        // tabs above them, in their existing order -- including tabs that
        // were just filed below a subgroup. Skipped when nothing would move.
        const tail = [...c.children].slice(-subs.length);
        if (!sameOrder(tail, sorted)) for (const sg of sorted) mvEl(sg, () => c.appendChild(sg));
      } else {
        reorderBlock(c, subs, sorted);
      }
    }
  }

  let orderTimer = null;
  const MAX_ORDER_DEFER_MS = 10000;
  let orderDeferredSince = 0;
  function scheduleOrder() {
    clearTimeout(orderTimer);
    orderTimer = setTimeout(() => {
      // Re-sorting moves DOM nodes; doing that mid workspace-slide adds
      // stutter to the animation. Zen marks the slide on :root, so wait it
      // out and land the sort right after.
      // Bounded, for the same reason Tab Unloader bounds its sweep: Zen sets
      // animating-background from more than one path and clears it from one,
      // and treats the animation getting stuck as a known hazard. Unbounded,
      // this rescheduled itself every order-delay-ms forever -- ordering dead
      // for the session and a timer burning behind it.
      if (document.documentElement.hasAttribute("animating-background") ||
          document.documentElement.hasAttribute("swipe-gesture")) {
        if (!orderDeferredSince) orderDeferredSince = Date.now();
        if (Date.now() - orderDeferredSince < MAX_ORDER_DEFER_MS) {
          scheduleOrder();
          return;
        }
        note("animation marker stuck; ordering anyway");
      }
      orderDeferredSince = 0;
      try { applyOrder(); } catch (e) { note(`applyOrder: ${e}`); }
      try { stampIcons(); } catch (e) { note(`stampIcons: ${e}`); }
    }, num("order-delay-ms", 150));
  }

  function skip(tab, precomputedParts) {
    if (!tab || !tab.isConnected || tab.closing) return "gone";
    if (tab.hasAttribute("zen-glance-tab")) return "glance";
    // Zen's blank placeholder tabs cannot be grouped; addTabGroup returns
    // null for them rather than throwing.
    if (tab.hasAttribute("zen-empty-tab")) return "empty tab";
    if (tab.hasAttribute("_forZenEmptyTab")) return "empty tab";
    if (tab.hasAttribute("zen-split")) return "split view";
    if (bool("skip-essentials", true) && tab.getAttribute("zen-essential") === "true") return "essential";
    if (bool("skip-pinned", true) && tab.pinned) return "pinned";
    if (bool("skip-grouped", true) && tab.group) {
      healWorkspace(tab);   // ghost repair is safe and cheap; always do it
      // A link opened from a grouped tab inherits that group, even when it
      // goes somewhere unrelated. With this on, a tab whose group path no
      // longer matches where it belongs gets re-filed instead of stranded.
      if (bool("refile-mismatched", true)) {
        const want = precomputedParts !== undefined ? precomputedParts : targetPath(tab);
        const have = chainOf(tab);
        if (want?.length && have.length && !startsWithPath(have, want)) return null;
      }
      return "already in a group";
    }
    return null;
  }

  function route(tab, why) {
    if (!bool("enabled", false)) return;
    const parts = targetPath(tab);          // computed once, reused by skip()
    const s = skip(tab, parts);
    if (s) { note(`skip ${tab.label}: ${s}`); return; }
    if (!parts?.length) { note(`no rule for ${hostOf(tab) ?? tab.label}`); return; }
    const host = hostOf(tab);               // the tab may be reopened below
    try {
      if (placeInPath(tab, parts)) {
        note(`${why}: ${host} -> ${parts.join(SEP())}`);
        scheduleOrder();
      }
    } catch (e) {
      note(`failed routing ${tab.label}: ${e}`);
    }
  }

  // ---- events ------------------------------------------------------------
  // Route on load rather than on open: a brand new tab has no URL yet.
  // Redirect chains fire several location changes in a row; one pending
  // route per tab, restarted on each change, means only the final URL is
  // ever processed.
  const pendingRoute = new WeakMap();
  function queueRoute(tab, why) {
    if (!bool("enabled", false)) return;
    clearTimeout(pendingRoute.get(tab));
    pendingRoute.set(tab, setTimeout(() => {
      pendingRoute.delete(tab);
      route(tab, why);
    }, num("delay-ms", 400)));
  }
  const progress = {
    onLocationChange(browser, _wp, _req, _loc, _flags) {
      // Same-document changes are NOT skipped: SPAs like YouTube and Nexus
      // navigate by pushState, which is exactly that. Hash/query churn is
      // harmless -- the debounce coalesces it and an unchanged target path
      // no-ops in placeInPath.
      const tab = gBrowser.getTabForBrowser(browser);
      if (tab) queueRoute(tab, "navigate");
    },
  };

  // Second trigger for SPA navigation: sites like YouTube retitle the tab
  // on every pushState, and TabAttrModified(label) reliably fires for that
  // even when the same-document location change never reaches a tabs
  // progress listener. Converges on the same per-tab debounce; a title
  // change with an unchanged target path no-ops in placeInPath.
  function onAttrModified(event) {
    if (!event.detail?.changed?.includes("label")) return;
    const tab = event.target;
    if (tab?.linkedBrowser) queueRoute(tab, "retitle");
  }

  function sweepAll(why = "sweep") {
    if (!bool("enabled", false)) return 0;
    let n = 0;
    for (const tab of allTabs()) {
      const before = tab.group;
      route(tab, why);
      if (tab.group !== before) n++;
    }
    note(`${why}: moved ${n}`);
    if (n) scheduleOrder();
    return n;
  }

  // ---- rule generation ---------------------------------------------------
  // Reads the tabs you actually have open and writes the rules block for
  // you. Output is text to paste into the Rules box, deliberately -- it is
  // a starting point to edit, not something applied behind your back.

  function suggestRules(opts = {}) {
    const { minTabs = 1, subdomains = false } = opts;
    const separator = opts.separator ?? SEP();

    // base domain -> Map(host -> count)
    const tree = new Map();
    for (const tab of allTabs()) {
      if (skip(tab)) continue;
      const host = hostOf(tab);
      if (!host) continue;
      const base = baseDomain(host);
      if (!tree.has(base)) tree.set(base, new Map());
      const hosts = tree.get(base);
      hosts.set(host, (hosts.get(host) || 0) + 1);
    }

    const lines = [];
    const skipped = [];
    // Busiest domains first, so the rules you care about are at the top.
    const ordered = [...tree.entries()].sort((a, b) => {
      const ca = [...a[1].values()].reduce((x, y) => x + y, 0);
      const cb = [...b[1].values()].reduce((x, y) => x + y, 0);
      return cb - ca || a[0].localeCompare(b[0]);
    });

    for (const [base, hosts] of ordered) {
      const total = [...hosts.values()].reduce((x, y) => x + y, 0);
      if (total < minTabs) { skipped.push(`${base} (${total})`); continue; }
      const parent = domainName(base);

      if (!subdomains) {
        lines.push(`${base} > ${parent}`);
        continue;
      }

      // Subdomain mode. A rule for a specific host must come BEFORE the
      // catch-all for its base domain, because the first match wins.
      const subs = [...hosts.entries()]
        .filter(([h]) => h !== base && h !== "www." + base)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

      for (const [host, n] of subs) {
        const leaf = host.slice(0, host.length - base.length - 1)
                         .split(".").reverse().map(prettify).join(separator);
        lines.push(`${host} > ${parent}${separator}${leaf}` +
                   `   ${"#"} ${n} tab${n === 1 ? "" : "s"}`);
      }
      lines.push(`${base} > ${parent}`);
    }

    const text = lines.join("\n");
    console.log("--- suggested rules ---\n" + text +
      (skipped.length ? `\n\nbelow the minimum, not included: ${skipped.join(", ")}` : "") +
      "\n\nPaste into the Rules box, edit the names, then enable routing." +
      (subdomains ? "\nSubdomain rules are listed before their parent on purpose: first match wins." : ""));
    try {
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper).copyString(text);
      console.log("(copied to clipboard)");
    } catch {}
    return text;
  }

  function start() {
    gBrowser.addTabsProgressListener(progress);
    gBrowser.tabContainer.addEventListener("TabAttrModified", onAttrModified);
    try { Services.prefs.addObserver(P, prefObserver); } catch {}
    // Groups made or removed by hand must invalidate the cache too.
    // TabGroupUngroup does not exist in Zen 1.22b -- it was a dead listener.
    // TabGroupUpdate and TabGroupRemovedFromDOM are the real Zen events for a
    // group changing or leaving the DOM, and both must bust the cache.
    const groupEvents = ["TabGroupCreate", "TabGroupRemoved", "TabGroupRemovedFromDOM",
                         "TabGroupUpdate", "TabGrouped", "TabUngrouped"];
    for (const ev of groupEvents) window.addEventListener(ev, bustGroups, true);

    window.TabRouter = {
      sortAll: () => sweepAll("manual"),
      preview() {
        return allTabs().map(t => ({
          title: t.label,
          host: hostOf(t) ?? "-",
          currentGroup: chainOf(t).join(SEP()) || "-",
          wouldGo: skip(t) ? `skipped (${skip(t)})`
                           : (targetPath(t)?.join(SEP()) ?? "no rule"),
        }));
      },
      rules,
      // suggestRules()                        -> one rule per domain
      // suggestRules({subdomains:true})       -> plus a nested rule per subdomain
      // suggestRules({minTabs:2})             -> ignore one-off domains
      suggestRules,
      groups: () => groups().map(g => chainOf({ group: g }).join(SEP())),

      // Reads open tabs and proposes slug=Pretty Name lines from their
      // titles, which already contain the human name. Copies to clipboard.
      suggestAliases() {
        const seen = new Map();
        for (const t of allTabs()) {
          const host = hostOf(t);
          if (!host) continue;
          let path = "";
          try { path = t.linkedBrowser?.currentURI?.filePath ?? ""; } catch { continue; }
          const skipW = new Set(str("auto-path-ignore", "").split(",")
            .map(s => s.trim().toLowerCase()).filter(Boolean));
          const seg = path.split("/").map(s => decodeURIComponent(s).trim())
            .filter(Boolean).filter(s => !skipW.has(s.toLowerCase()))
            .filter(s => !/^\d+$/.test(s) && !/\.[a-z0-9]{2,4}$/i.test(s))[0];
          if (!seg) continue;
          const slug = seg.toLowerCase();
          if (seen.has(slug)) continue;
          // Page titles are usually "Thing - Site" or "Thing | Site".
          // Take the first chunk and drop a trailing generic word.
          let name = (t.label || "").split(/\s+[-|\u2013\u2014\u00b7]\s+/)[0].trim();
          name = name.replace(/\s+(Mods|Mod|Wiki|Home|Official Site)$/i, "").trim();
          if (!name || name.toLowerCase() === slug) continue;
          seen.set(slug, name);
        }
        const text = [...seen].map(([k, v]) => `${k} = ${v}`).join("\n");
        console.log("--- suggested aliases ---\n" + text +
          "\n\nPaste into 'Path name aliases'. Edit freely: these come from page" +
          "\ntitles, so a deep page may propose the wrong name for its section.");
        try {
          Cc["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Ci.nsIClipboardHelper).copyString(text);
          console.log("(copied to clipboard)");
        } catch {}
        return text;
      },

      // Dumps the group nesting as plain text, for sharing.
      groupTree() {
        const lines = [];
        const all = groups();
        const walk = (parent, depth) => {
          for (const g of all.filter(x => parentOf(x) === parent)) {
            const tabs = [...(g.tabs ?? [])].filter(t => gBrowser.isTab?.(t)).length;
            lines.push(`${"  ".repeat(depth)}- ${JSON.stringify(g.label)} tabs=${tabs}`);
            walk(g, depth + 1);
          }
        };
        walk(null, 0);
        const text = lines.join("\n") || "(no groups)";
        console.log(text);
        try {
          Cc["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Ci.nsIClipboardHelper).copyString(text);
          console.log("(copied to clipboard)");
        } catch {}
        return text;
      },

      // Shows how a host+path resolves, without moving anything.
      explain(tabOrIndex) {
        const t = typeof tabOrIndex === "number"
          ? allTabs()[tabOrIndex] : (tabOrIndex || gBrowser.selectedTab);
        if (!t) return "no tab";
        let uri = "";
        try { uri = t.linkedBrowser?.currentURI?.spec ?? ""; } catch {}
        return {
          title: t.label,
          url: uri.slice(0, 90),
          host: hostOf(t),
          base: hostOf(t) ? baseDomain(hostOf(t)) : null,
          pathDepthPref: num("auto-path-depth", 0),
          pathSegments: pathParts(t),
          currentGroup: chainOf(t).join(SEP()) || null,
          wouldGo: skip(t) ? `skipped (${skip(t)})` : targetPath(t)?.join(SEP()),
        };
      },
      // Runs the eject experiment on the SELECTED tab and reports every
      // fact needed to debug filing on this build. Copies to clipboard.
      diag() {
        const tab = gBrowser.selectedTab;
        const before = chainOf(tab);
        const g = tab.group;
        const r = {
          zen: Services.appinfo?.version,
          tab: tab.label,
          chainBefore: before.join(" > ") || "(none)",
          groupTag: g?.tagName ?? null,
          api: {
            ungroupTab: typeof gBrowser.ungroupTab,
            moveTabToExistingGroup: typeof gBrowser.moveTabToExistingGroup,
            addTabGroup: typeof gBrowser.addTabGroup,
            removeTabGroup: typeof gBrowser.removeTabGroup,
            // group-level; "(no group)" means run diag on a grouped tab
            addTabs: g ? typeof g.addTabs : "(no group)",
            ungroupTabs: g ? typeof g.ungroupTabs : "(no group)",
          },
        };
        if (before.length) {
          ungroupFully(tab);
          r.chainAfterEject = chainOf(tab).join(" > ") || "(none -- eject works)";
        } else {
          r.chainAfterEject = "(tab was not in a group; put it in one and rerun)";
        }
        const text = JSON.stringify(r, null, 2);
        console.log(text);
        try {
          Cc["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Ci.nsIClipboardHelper).copyString(text);
          console.log("(copied to clipboard)");
        } catch {}
        return r;
      },
      // Re-sorts groups/subgroups and pushes loose tabs above subgroups now.
      applyOrder,
      // Names learned automatically from tab titles (slug -> name).
      learned: () => Object.fromEntries(learnedMap()),
      forget(slug) {
        if (slug) learnedMap().delete(slug.toLowerCase());
        else learnedCache = new Map();
        saveLearned();
        return slug ? `forgot "${slug}"` : "forgot all learned names";
      },
      // videoId -> creator, everything looked up so far. A record of which
      // videos were opened: bounded to 300 and emptied by forgetCreators().
      creators: () => Object.fromEntries(creatorMap()),
      forgetCreators(id) {
        if (id) creatorMap().delete(id); else { creatorCache = new Map(); iconCache = new Map(); saveIcons(); }
        saveCreators();
        stampIcons();
        targetGen++;
        return id ? `forgot "${id}"` : "forgot every remembered creator";
      },
      log: formatLog,

      // Non-destructive counterpart to diag(), which ejects the selected tab
      // to prove the group API works. This one only reads, so it is safe to
      // run the moment something looks wrong.
      //
      // "stalled" is the list that matters: tabs that are NOT skipped, DO
      // have a target, and are still not sitting under it. Those are the
      // tabs the mod was supposed to file and did not, and every other field
      // here exists to explain why.
      status() {
        const reasons = {};
        const stalled = [];
        let withTarget = 0;
        for (const t of allTabs()) {
          const parts = targetPath(t);
          if (parts?.length) withTarget++;
          const why = skip(t, parts);
          if (why) { reasons[why] = (reasons[why] ?? 0) + 1; continue; }
          if (!parts?.length) { reasons["no rule"] = (reasons["no rule"] ?? 0) + 1; continue; }
          const have = chainOf(t);
          if (!startsWithPath(have, parts)) {
            stalled.push({
              tab: t.label,
              host: hostOf(t),
              is: have.join(SEP()) || "(ungrouped)",
              wants: parts.join(SEP()),
            });
          }
        }

        // Report "unknown" rather than false when the collection is not
        // where it is expected: a diagnostic that invents a detached
        // listener sends you hunting the wrong bug.
        let listenerAttached = "unknown";
        try {
          const set = gBrowser.mTabsProgressListeners;
          if (typeof set?.has === "function") listenerAttached = set.has(progress);
        } catch {}

        const r = {
          version: "1.26.0",
          zen: Services.appinfo?.version,
          enabled: bool("enabled", false),
          // >1 means this window has loaded the script more than once. The
          // guard at the top of the file retires the older copy, so a high
          // number is a record of re-injection, not of copies running now.
          instanceGeneration: instance.generation,
          // False while the mod is loaded means the progress listener was
          // dropped without the script being torn down -- routing on
          // navigation would be dead while a manual sortAll() still worked.
          navigationListenerAttached: listenerAttached,
          groupsCached: groupsCache ? groupsCache.length : "(cold)",
          // A count, not the contents: status() gets pasted into bug reports.
          creatorsRemembered: creatorMap().size,
          sectionIconsRemembered: iconMap().size,
          creatorLookupsInFlight: inFlight.size,
          tabs: allTabs().length,
          tabsWithATarget: withTarget,
          skipped: reasons,
          stalled,
          recentLog: formatLog().slice(-40),
        };
        const text = JSON.stringify(r, null, 2);
        console.log(text);
        try {
          Cc["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Ci.nsIClipboardHelper).copyString(text);
          console.log("(copied to clipboard)");
        } catch {}
        return r;
      },
    };

    if (bool("sort-on-startup", false)) setTimeout(() => sweepAll("startup"), num("startup-delay-ms", 2500));
    // Restored creator subgroups get their avatar back whether or not the
    // startup sort runs.
    setTimeout(() => { try { stampIcons(); } catch {} }, num("startup-delay-ms", 2500) + 500);
    note("loaded");

    // This script is injected per window and lives as long as the window
    // does, so every registration above has to be released here or it leaks
    // across window open/close cycles. The capture flag must match the one
    // used to add, or removeEventListener silently does nothing.
    const cleanup = () => {
      try { gBrowser.removeTabsProgressListener(progress); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabAttrModified", onAttrModified); } catch {}
      try { Services.prefs.removeObserver(P, prefObserver); } catch {}
      for (const ev of groupEvents) {
        try { window.removeEventListener(ev, bustGroups, true); } catch {}
      }
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Not registered with Sine's addUnloadListener() on purpose: that buys
    // hot-reload on update at the cost of tearing down and re-injecting every
    // script in every window, and one bad re-injection took four mods down.
    // Sine's own toast asks for a restart after a JS update; that is enough.
    // The DOM unload listener above is what releases these when the window
    // closes.
    instance.retire = cleanup;
  }


  // ---- declared defaults --------------------------------------------------
  // Sine does not write the defaults declared in preferences.json into the
  // profile. manager.sys.mjs says so outright: "TODO: Apply default
  // preferences." So an unset pref reads as whatever the READER falls back
  // to, and the readers disagree with each other.
  //
  // A mod's own reader falls back one way (this script's bool(name, true)),
  // Sine's settings panel another (getBoolPref(name, false) when deciding
  // whether a conditioned row shows), and a -moz-pref() media query in the
  // stylesheet a third. Each is reasonable alone; together they produce a mod
  // behaving as if a setting is on while every row it governs is hidden as if
  // it were off.
  //
  // Writing each declared default once, and only when the pref has never
  // been set, removes the disagreement for all three at once. Nothing that
  // was already chosen is touched.
  const MOD_ID = "zz-tab-router";
  async function seedDefaults() {
    let declared;
    try {
      const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
      const json = await res.json();
      declared = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch { return false; }

    const S = Services.prefs;
    let wrote = 0;
    for (const pref of declared) {
      const name = pref?.property;
      const value = pref?.defaultValue;
      if (!name || !name.startsWith(P) || value === undefined || value === null) continue;
      try {
        if (S.getPrefType(name) !== S.PREF_INVALID) continue;   // already chosen
        if (typeof value === "boolean") S.setBoolPref(name, value);
        else if (typeof value === "number") S.setIntPref(name, value);
        else if (typeof value === "string") S.setStringPref(name, value);
        else continue;
        wrote++;
      } catch {}
    }
    return wrote > 0;
  }

  // ---- startup ------------------------------------------------------------
  // browser-delayed-startup-finished fires once. A script injected after it
  // -- Sine's rebuild path does that -- would wait forever, so the observer
  // is backed by a bounded poll and startOnce() makes whichever loses a
  // no-op. start() is wrapped: a throw here escapes into Sine's injection
  // loop, which does not catch, and every mod queued after this one is never
  // injected.
  let started = false;
  let waitTimer = null;
  let obs = null;

  const stopWaiting = () => {
    if (obs) {
      try { Services.obs.removeObserver(obs, "browser-delayed-startup-finished"); } catch {}
      obs = null;
    }
    if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
  };

  // Seed before starting where possible. start() reads prefs immediately, so
  // a mod that starts first would run one session on the wrong fallbacks.
  seedDefaults().catch(() => {});

  const startOnce = () => {
    // A newer copy of this script may have claimed the window while this one
    // was waiting; that copy owns the registrations, so this one stays quiet.
    if (started || window[INSTANCE_KEY] !== instance) return;
    started = true;
    stopWaiting();
    try { start(); } catch (e) {
      console.error("[TabRouter] failed to start:", e);
    }
  };

  // Read through the window first, then the bare global. A sub-script loaded
  // with the window as its target sees the same object either way, but that
  // is a property of how Sine loads us, not a guarantee -- and reading only
  // one of the two is how this check silently returns false in a window that
  // is in fact ready.
  const windowReady = () => {
    try { return !!(window.gBrowserInit ?? gBrowserInit)?.delayedStartupFinished; }
    catch { return false; }
  };

  // Until start() swaps in the real cleanup, releasing this copy means
  // dropping whatever it is waiting on.
  instance.retire = stopWaiting;

  if (windowReady()) {
    startOnce();
  } else {
    obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) startOnce();
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");

    // The backstop. In the failure above the window is ALREADY past delayed
    // startup, so the first tick starts the mod half a second later. Bounded,
    // because a window that never gets there is not one this mod belongs in.
    const deadline = Date.now() + 60000;
    waitTimer = setInterval(() => {
      if (windowReady()) startOnce();
      else if (Date.now() > deadline) stopWaiting();
    }, 500);
  }
})();
