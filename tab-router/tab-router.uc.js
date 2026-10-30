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
  let retired = false;
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
  // Learned names, creators and icons are one shared pref each, and every
  // window keeps its own copy. A write from THIS window is the copy it
  // already holds (writing is up while it lands); a write from another
  // window is news, and just that copy is dropped so the next read is the
  // shared one -- never the parsed rules, which that write did not touch.
  let fileCache = null;
  let writing = false;
  const prefObserver = { observe(_s, _t, data) {
    if (writing) return;
    updateOpenMenu();
    if (data === P + "learned-names") { learnedCache = null; targetGen++; return; }
    if (data === P + "creators") { creatorCache = null; targetGen++; return; }
    if (data === P + "avatars") {
      const before = iconCache || new Map(); iconCache = null;
      const after = iconMap(), keys = new Set([...before.keys(), ...after.keys()]);
      for (const key of keys) if (before.get(key)?.d === after.get(key)?.d && before.get(key)?.s === after.get(key)?.s && before.get(key)?.b === after.get(key)?.b) keys.delete(key);
      repaintSubjects(keys); return;
    }
    if (["section-icons", "nexus-icon", "nexus-banners"].some(k => data === P + k)) {
      cancelLookups(); stampIcons(true); refreshPictures(); return;
    }
    if (data === P + "nexus-banner-opacity") { stampIcons(); refreshPictures(false); return; }
    for (const k of Object.keys(parsed)) delete parsed[k]; learnedCache = null; targetGen++;
    stampIcons(); refreshPictures();
  } };
  const pendingWrites = new Map(), cacheSnapshots = new Map();
  let writeTimer = null;
  function readCache(key) {
    let data;
    try { data = fileCache ? fileCache.read(key) : JSON.parse(str(key, "{}")); } catch { data = {}; }
    if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    for (const [id, value] of pendingWrites.get(key) || []) {
      if (value === undefined) delete data[id]; else data[id] = value;
    }
    cacheSnapshots.set(key, data);
    return data;
  }
  function flushWrites() {
    clearTimeout(writeTimer); writeTimer = null;
    for (const [key, changes] of pendingWrites) {
      const data = readCache(key); // Merge other windows' records before writing our delta.
      const entries = Object.entries(data).slice(-(key === "avatars" ? 100 : key === "learned-names" ? 200 : 300));
      const text = key === "avatars" ? boundedIcons(entries) : JSON.stringify(Object.fromEntries(entries));
      write(key, text);
      if (key === "avatars") iconCache = null; else if (key === "creators") creatorCache = null; else learnedCache = null;
    }
    pendingWrites.clear();
  }
  function persist(key, text) {
    const before = cacheSnapshots.get(key) || readCache(key), after = JSON.parse(text);
    const changes = pendingWrites.get(key) || new Map();
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[id]) !== JSON.stringify(after[id])) changes.set(id, after[id]);
    }
    cacheSnapshots.set(key, after);
    if (!changes.size) return;
    pendingWrites.set(key, changes);
    if (writeTimer === null) writeTimer = setTimeout(flushWrites, 0);
  }
  function write(key, text) {
    writing = true;
    try {
      if (fileCache && ["creators", "avatars", "learned-names"].includes(key)) fileCache.write(key, JSON.parse(text));
      else Services.prefs.setStringPref(P + key, text);
    } catch (error) { console.error("[TabRouter] Cache write failed:", error); } finally { writing = false; }
  }
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
    try { learnedCache = new Map(Object.entries(readCache("learned-names"))); }
    catch { learnedCache = new Map(); }
    return learnedCache;
  }
  function saveLearned() {
    learnedCache = new Map([...learnedMap()].slice(-200));
    if (isPrivate()) return;            // a private window learns for its session only
    persist("learned-names", JSON.stringify(Object.fromEntries(learnedCache)));
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
  function segName(tab, seg, learn = true) {
    const slug = seg.trim().replace(/^@/, "").toLowerCase();
    const a = aliasMap().get(slug);
    if (a) return a;
    const l = learnedMap().get(slug);
    if (l) return l;
    const t = titleNameFor(tab, slug);
    if (t) {
      if (learn) {
        learnedMap().set(slug, t);
        targetGen++;
        saveLearned();
        note(`learned name: ${slug} = ${t}`);
      }
      return t;
    }
    return prettify(seg.replace(/^@/, ""));
  }

  // ---- rules -------------------------------------------------------------
  // One rule per line:  github.com, gitlab.com > Dev
  // Left side is a comma-separated list of domain fragments, right side is
  // the group name. A name containing the separator nests: "Work / Email"
  // is a subgroup Email inside a group Work. First matching rule wins.
  function validateRules(text) {
    const rules = [], errors = [];
    String(text).split("\n").forEach((line, row) => line.split(";").forEach((entry, column) => {
      entry = entry.trim(); if (!entry) return;
      const fail = message => errors.push({ line: row + 1, entry: column + 1, message });
      const i = entry.indexOf(">");
      if (i < 0) { fail("Missing > between domains and destination"); return; }
      const domains = entry.slice(0, i).split(",").map(s => s.trim().toLowerCase());
      const group = entry.slice(i + 1).trim();
      if (domains.some(d => !d || /[\s/]/.test(d))) { fail("Enter comma-separated domain names before >"); return; }
      if (!group || group.split(SEP()).some(part => !part.trim())) { fail("Enter a destination; each folder level needs a name"); return; }
      rules.push({domains, group});
    }));
    return { valid: !errors.length, rules, errors };
  }
  function rules() { return cached("rules", () => validateRules(str("rules", "")).rules); }
  function editRules(initial) {
    const input = { value: initial };
    if (!Services.prompt.prompt(window, "Routing rules — inspect or edit", "Domains > Parent / Child. OK validates; nothing is applied until confirmation.", input, null, {})) return;
    const result = validateRules(input.value);
    if (!result.valid) { Services.prompt.alert(window, "Rules unchanged", result.errors.map(e => `Line ${e.line}, entry ${e.entry}: ${e.message}`).join("\n")); return; }
    // A native confirmation keeps generation/validation separate from an explicit write.
    const choice = Services.prompt.confirmEx(window, "Validated routing rules", input.value || "Empty rules", Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING |
      Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL | Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_IS_STRING,
      "Apply rules", null, "Copy rules", null, {});
    if (retired) return;
    if (choice === 0) Services.prefs.setStringPref(P + "rules", input.value);
    if (choice === 2) Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(input.value);
  }
  const settingsDocs = new Set();
  function validateRuleEdit(event) {
    const input = event.target;
    if (!input.closest?.("#zzrouter-rules")) return;
    const result = validateRules(input.value);
    input.setCustomValidity?.(result.errors.map(e => `Line ${e.line}, entry ${e.entry}: ${e.message}`).join("\n"));
    if (event.type === "change" && !result.valid) { event.preventDefault(); event.stopImmediatePropagation(); input.reportValidity?.(); }
  }
  function watchRuleSettings(event) {
    const doc = event.target;
    if (!doc?.documentURI?.startsWith("about:preferences") || settingsDocs.has(doc)) return;
    settingsDocs.add(doc); doc.addEventListener("change", validateRuleEdit, true); doc.addEventListener("input", validateRuleEdit, true);
    doc.defaultView.addEventListener("unload", () => settingsDocs.delete(doc), {once: true});
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
    "browse,explore,channel,playlist,games,game,category,categories,en-us,en-gb," +
    "www,index,home,wiki,tag,tags,new,top,hot,trending,threads,posts,post,user,users," +
    "web,app,apps,dashboard,login,signin,logout,account,accounts,myaccount,portal," +
    "settings,profile,mail,inbox,folders,products,product,item,items,shop,store,cart," +
    "checkout,docs,doc,help,support,about,blog,news,article,articles,page,pages,view," +
    "share,embed,api,static,assets,cdn,images,img,media,files,download,downloads")
    .split(","));

  function pathEnabled(tab) {
    const depth = num("auto-path-depth", 0);
    if (depth < 1) return false;
    // The domain list is read either way round: only these sites, or
    // every site except these. Everywhere means shops, docs and forums
    // too, which put section names, ids and slugs in the first segment;
    // the ignore list below and the short-segment rule take the worst of
    // that out, and the ignore words setting takes the rest.
    const list = cached("pathdomains", () => str("auto-path-domains", "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    const host = hostOf(tab);
    if (!host) return false;
    const listed = list.some(d => host === d || host.endsWith("." + d));
    if (num("auto-path-mode", 0) === 1 ? listed : !listed) return false;
    return true;
  }

  const partLabel = part => typeof part === "string" ? part : part.label;
  const contextOf = tab => parseInt(tab.getAttribute("usercontextid") || "0", 10);
  const scoped = (key, ctx) => `${ctx}:${key}`;
  const partFor = (record, tab, picture = record.key) => ({
    label: aliasMap().get(record.key) || aliasMap().get(record.label?.toLowerCase()) || record.label,
    key: record.key, ctx: contextOf(tab), picture,
  });

  function pathParts(tab, learn = true) {
    if (!pathEnabled(tab)) return [];
    const host = hostOf(tab), nx = nexusURL(tab);
    if (nx) {
      const game = nexusGame(tab, learn);
      if (!game) return [];
      const parts = [partFor(game, tab)];
      const author = nx.author && authorRecord(tab, nx, learn);
      if (author) parts.push(partFor(author, tab, game.key));
      return parts;
    }
    if (host === "music.youtube.com") {
      const page = musicPage(tab, learn);
      return page ? [partFor(page, tab, "")] : [];
    }
    const channel = channelRecord(tab);
    if (channel) {
      if (!channel.label && learn) fetchPageName(tab, channel.key, "channel");
      return channel.label ? [partFor(channel, tab)] : [];
    }
    let path = "";
    try { path = tab.linkedBrowser?.currentURI?.filePath ?? ""; } catch { return []; }
    const skipWords = cached("skipwords", () => new Set(str("auto-path-ignore", "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean)));
    const raw = path.split("/").filter(Boolean), parts = [];
    for (let i = 0; i < raw.length && parts.length < num("auto-path-depth", 0); i++) {
      let seg;
      try { seg = decodeURIComponent(raw[i]).trim(); } catch { continue; }
      const low = seg.toLowerCase();
      if (low.length < 3 || BUILTIN_IGNORE.has(low) || skipWords.has(low) ||
          /^\d+$/.test(seg) || /\.[a-z0-9]{2,4}$/i.test(seg) || /[=?&]/.test(seg)) continue;
      const page = `https://${host}/${raw.slice(0, i + 1).join("/")}`;
      const record = { key: page, label: segName(tab, seg, learn) };
      parts.push(partFor(record, tab));
      if (learn) fetchSectionIcon(record.key, page, contextOf(tab), ROUND_HOSTS.test(host) ? "round" : "square");
    }
    return parts;
  }

  // Retitle events repeat for an unchanged URL; the full computation
  // (eTLD, rules, path parsing, alias/learned lookups) is cached per tab by
  // URI and title. Invalidated by URL/title changes and naming preferences.
  const targetCache = new WeakMap();
  let targetGen = 0;

  function targetPath(tab, learn = true) {
    if (!learn) return withCreator(tab, computeTargetPath(tab, false), false);
    let spec = null;
    try { spec = tab.linkedBrowser?.currentURI?.spec ?? null; } catch {}
    if (spec) {
      const hit = targetCache.get(tab);
      if (hit && hit.spec === spec && hit.label === tab.label && hit.ctx === contextOf(tab) && hit.gen === targetGen) return hit.parts;
      const parts = withCreator(tab, computeTargetPath(tab));
      // A path still waiting on its creator must be recomputed next pass,
      // or the tab sits in the base group for as long as its URL is
      // unchanged -- on a watch page, the whole time it is open.
      const id = videoId(tab);
      if (!id || !bool("media-subgroups", false) || creatorMap().has(scoped(id, contextOf(tab)))) {
        targetCache.set(tab, { spec, label: tab.label, ctx: contextOf(tab), gen: targetGen, parts });
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
  // Requests carry the tab's container and omit cookies via LOAD_ANONYMOUS.
  // Private windows reuse cached names but start no creator/icon requests.
  const OEMBED = "https://www.youtube.com/oembed?format=json&url=";
  const isPrivate = () => {
    try {
      return ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
        .PrivateBrowsingUtils.isWindowPrivate(window);
    } catch { return false; }
  };
  const originOf = (ctx) => ({ userContextId: ctx, privateBrowsingId: isPrivate() ? 1 : 0 });

  // Video IDs exclude timestamps/tracking; stored records additionally carry
  // the container ID and a verified subject URL, separate from display text.
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
    try { creatorCache = new Map(Object.entries(readCache("creators"))); }
    catch { creatorCache = new Map(); }
    return creatorCache;
  }
  function saveCreators() {
    creatorCache = new Map([...creatorMap()].slice(-300));
    if (isPrivate()) return;            // a private window learns for its session only
    // Bounded, oldest out. This is a record of which videos were opened, so
    // it is kept small and forgetCreators() empties it.
    persist("creators", JSON.stringify(Object.fromEntries(creatorCache)));
  }

  let lookupEpoch = 0;
  const requests = new Set();
  const refreshCancels = new Set();
  let refreshOperations = 0;
  function cancelLookups() {
    lookupEpoch++;
    for (const cancel of [...requests]) cancel();
    for (const release of [...refreshCancels]) release();
    inFlight.clear();
    failed.clear();
  }
  const inFlight = new Map();            // container + resource -> pending request
  const failed = new Map();              // request key -> failure time (memory only)
  const FAILED_MAX = 200;
  const noteFail = (k) => {
    failed.set(k, Date.now());
    if (failed.size > FAILED_MAX) failed.delete(failed.keys().next().value);
  };
  const RETRY_FAIL_MS = 10 * 60 * 1000;

  // One request, built inside the tab's container and sent anonymously (see
  // above). cb(bytes) gets the raw body as a byte string, or null.
  // A page is read for one <meta> tag and an icon is a few tens of KB;
  // neither is a reason to hold a whole response in the parent process,
  // and a server that simply never answers must not wedge the slot it
  // holds in inFlight.
  const MAX_FETCH_BYTES = 512 * 1024;
  const FETCH_TIMEOUT_MS = 15000;
  const NS_BINDING_ABORTED = 0x804b0002;
  const lookupURIAllowed = uri => uri.scheme === "https" && !uri.userPass && !INTERNAL_HOST.test(uri.host);
  // NetUtil already has process lifetime. Only bounded anonymous public lookups
  // live here; each window owns its subscription and can cancel independently.
  function lookupOwner() {
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    return NetUtil.__zzrouterLookupsV1 ??= { requests: new Map(), metadata: new Map() };
  }
  function fetchAnon(url, ctx, cb, maxBytes = MAX_FETCH_BYTES, jsonBody = null) {
    const uri = Services.io.newURI(url);
    if (!lookupURIAllowed(uri)) throw new Error("Lookup requires a public HTTPS hostname");
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    const shared = lookupOwner().requests;
    const key = JSON.stringify([originOf(ctx), url, maxBytes, jsonBody]);
    let entry = shared.get(key);
    const deliver = body => { requests.delete(unsubscribe); cb(body); };
    const unsubscribe = () => {
      requests.delete(unsubscribe);
      entry.consumers.delete(deliver);
      if (!entry.consumers.size) entry.cancel?.();
    };
    if (entry) { requests.add(unsubscribe); entry.consumers.add(deliver); return; }
    entry = { consumers: new Set([deliver]), cancel: null };
    const principal = Services.scriptSecurityManager
      .createContentPrincipal(uri, originOf(ctx));
    const channel = NetUtil.newChannel({
      uri: url,
      loadingPrincipal: principal,
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
    });
    channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
    if (jsonBody !== null) {
      const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      stream.data = JSON.stringify(jsonBody);
      channel.QueryInterface(Ci.nsIUploadChannel).setUploadStream(stream, "application/json", -1);
      channel.QueryInterface(Ci.nsIHttpChannel).requestMethod = "POST";
    }
    channel.notificationCallbacks = {
      QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor", "nsIChannelEventSink"]),
      getInterface(iid) { return this.QueryInterface(iid); },
      asyncOnChannelRedirect(_old, next, _flags, callback) {
        let allowed = false;
        try { allowed = lookupURIAllowed(next.URI); } catch {}
        callback.onRedirectVerifyCallback(allowed ? 0 : NS_BINDING_ABORTED);
      },
    };
    let done = false;
    let timer = null;
    const clock = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    const finish = (body) => {
      if (done) return;
      done = true;
      clock.clearTimeout(timer);
      shared.delete(key);
      for (const consumer of entry.consumers) { try { consumer(body); } catch {} }
      entry.consumers.clear();
    };
    const cancel = () => {
      done = true;
      clock.clearTimeout(timer);
      shared.delete(key);
      try { channel.cancel(NS_BINDING_ABORTED); } catch {}
    };
    entry.cancel = cancel;
    requests.add(unsubscribe); shared.set(key, entry);
    timer = clock.setTimeout(() => {
      try { channel.cancel(NS_BINDING_ABORTED); } catch {}
      note(`gave up on ${url.slice(0, 60)} after ${FETCH_TIMEOUT_MS / 1000}s`);
      finish(null);
    }, FETCH_TIMEOUT_MS);
    let body = "";
    try { channel.asyncOpen({
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
      onStartRequest() {},
      onDataAvailable(_request, stream, _offset, count) {
        if (done) return;
        try {
          body += NetUtil.readInputStreamToString(stream, Math.min(count, maxBytes - body.length));
          // Retain the same prefix as before, but stop receiving at the cap.
          // NetUtil.asyncFetch buffered the entire response before truncation.
          if (body.length === maxBytes) {
            finish(body);
            try { channel.cancel(NS_BINDING_ABORTED); } catch {}
          }
        } catch {
          finish(null);
          try { channel.cancel(NS_BINDING_ABORTED); } catch {}
        }
      },
      onStopRequest(_request, status) {
        finish(Components.isSuccessCode(status) ? body : null);
      },
    }); } catch (error) {
      finish(null);
      try { channel.cancel(NS_BINDING_ABORTED); } catch {}
    }
  }
  // Byte string -> JS string, for text bodies.
  const utf8 = (bytes) => decodeURIComponent(escape(bytes));

  // Each container has its own request and records. Waiters retain their own
  // navigation/provenance; a shared response never supplies a shared destination.
  function beginLookup(slot, tab) {
    if (isPrivate() || retired) return null;
    const pending = inFlight.get(slot);
    const spec = tab?.linkedBrowser?.currentURI?.spec;
    if (pending) { if (tab) pending.waiters?.set(tab, spec); return null; }
    if (failed.has(slot) && Date.now() - failed.get(slot) < RETRY_FAIL_MS) return null;
    const request = { epoch: lookupEpoch, waiters: new Map(tab ? [[tab, spec]] : []) };
    inFlight.set(slot, request);
    return request;
  }

  function finishLookup(slot, request) {
    if (request.epoch !== lookupEpoch) return;
    inFlight.delete(slot);
    for (const [tab, spec] of request.waiters) {
      if (tab.isConnected && !tab.closing && tab.linkedBrowser?.currentURI?.spec === spec &&
          slot.startsWith(`${contextOf(tab)}:`)) queueRoute(tab, "metadata");
    }
    request.waiters.clear();
  }

  function fetchCreator(tab, id) {
    const ctx = contextOf(tab), slot = scoped(id, ctx), request = beginLookup(slot, tab);
    if (!request) return;
    const done = record => {
      if (request.epoch !== lookupEpoch) return;
      if (record) { creatorMap().set(slot, record); saveCreators(); targetGen++; }
      else noteFail(slot);
      finishLookup(slot, request);
    };
    try {
      fetchAnon(OEMBED + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`), ctx, body => {
        let record = null;
        try {
          const j = JSON.parse(utf8(body)), label = String(j.author_name || "").trim();
          const key = channelKey(j.author_url);
          if (key && label && label.length <= 80) record = { key, label };
        } catch {}
        done(record);
      });
    } catch (e) { note(`oembed setup failed for ${id}: ${e}`); done(null); }
  }

  function channelKey(url) {
    // Keep IDs case-sensitive. Handles are case-insensitive; no title-derived IDs.
    if (typeof url !== "string") return null;
    const m = /^https:\/\/(?:www\.|music\.)?youtube\.com\/(channel\/[A-Za-z0-9_-]+|@[\w.%~-]+|(?:c|user)\/[\w.%~-]+)(?:[/?#]|$)/.exec(url);
    if (!m) return null;
    return "https://www.youtube.com/" + (m[1].startsWith("channel/") ? m[1] : m[1].toLowerCase());
  }

  // oEmbed returns handles; channel metadata can return /channel/ID. Only
  // verified, container-scoped metadata connects them, never display names.
  function subjectKey(key, ctx) {
    const channel = channelKey(key);
    return channel ? channelKey(creatorMap().get(scoped(channel, ctx))?.key) || channel : key;
  }

  function channelRecord(tab) {
    const key = channelKey(tab.linkedBrowser?.currentURI?.spec);
    if (!key) return null;
    const known = creatorMap().get(scoped(key, contextOf(tab)));
    return known || { key, label: null };
  }

  // Read only bounded, inert metadata; no page execution or content polling.
  function metaValue(html, name) {
    const tags = html?.match(/<meta\b[^>]{0,2048}>/gi) || [];
    const tag = tags.find(t => new RegExp(`\\b(?:property|name)\\s*=\\s*(["'])${name}\\1`, "i").test(t));
    const value = tag && /\bcontent\s*=\s*(["'])(.{1,1000}?)\1/i.exec(tag)?.[2];
    return value?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  function fetchMetadata(url, ctx, cb, fresh = false) {
    const cache = lookupOwner().metadata, key = scoped(url, ctx);
    const hit = cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < RETRY_FAIL_MS) { cb(hit); return; }
    fetchAnon(url, ctx, body => {
      if (!body) { cb(null); return; }
      let value;
      try {
        const html = utf8(body);
        value = { title: metaValue(html, "og:title"), canonical: metaValue(html, "og:url"),
          image: metaValue(html, "og:image"), at: Date.now() };
      } catch { cb(null); return; }
      cache.set(key, value);
      // Only a verified channel/game canonical can merge aliases.
      const canonical = channelKey(url) && channelKey(value.canonical) ||
        (nexusURLFrom(url)?.game && nexusURLFrom(value.canonical)?.game);
      if (canonical) cache.set(scoped(canonical, ctx), value);
      while (cache.size > ICON_MAX) cache.delete(cache.keys().next().value);
      cb(value);
    }, 1024 * 1024);
  }

  function fetchPageName(tab, key, kind) {
    const ctx = contextOf(tab), slot = scoped(key, ctx), request = beginLookup(slot, tab);
    if (!request) return;
    const done = record => {
      if (request.epoch !== lookupEpoch) return;
      if (record) {
        creatorMap().set(slot, record);
        if (record.key !== key) creatorMap().set(scoped(record.key, ctx), record);
        const picture = iconMap().get(slot), canonical = scoped(record.key, ctx);
        if (kind === "channel" && picture?.d && !iconMap().get(canonical)?.d) {
          iconMap().set(canonical, picture); saveIcons();
        }
        saveCreators(); targetGen++;
        if (kind === "channel") queueChannelDuplicates();
      }
      else noteFail(slot);
      finishLookup(slot, request);
    };
    try {
      fetchMetadata(key, ctx, metadata => {
        let record = null;
        try {
          const canonical = metadata?.canonical;
          let label = metadata?.title;
          let canonicalKey = kind === "author" ? nexusURLFrom(canonical)?.author : channelKey(canonical);
          if (kind === "music") {
            // ponytail: canonical public metadata only; add a native page adapter
            // when a reproducible collection lacks it. Never use active-track titles.
            canonicalKey = musicKey(canonical);
            if (!canonicalKey) return done(null);
            label = label?.replace(/ - YouTube Music$/, "");
            const opaque = key.includes("?list=") ? key.split("?list=")[1] : key.split("/").at(-1);
            if (label === opaque || label === canonicalKey.split(/[/?=]/).at(-1)) return done(null);
          } else if (kind === "author") {
            if (!canonicalKey) return done(null);
            label = label?.replace(/'s Profile(?: - Nexus Mods)?$/, "");
          } else if (canonicalKey) label = label?.replace(/ - YouTube$/, "");
          else return done(null);
          if (label && label.length <= 160 && !/^(?:YouTube Music|YouTube|Nexus Mods)$/.test(label))
            record = { key: canonicalKey || key, label };
        } catch {}
        done(record);
      });
    } catch { done(null); }
  }

  function musicKey(spec) {
    const m = /^https:\/\/music\.youtube\.com\/browse\/([\w-]+)(?:[?#]|$)/.exec(spec || "");
    if (m) return `https://music.youtube.com/browse/${m[1]}`;
    const list = /^https:\/\/music\.youtube\.com\/playlist\?/.test(spec || "") &&
      new URLSearchParams(spec.split("?")[1]).get("list");
    return list && /^[\w-]+$/.test(list) ? `https://music.youtube.com/playlist?list=${list}` : null;
  }
  function musicPage(tab, learn) {
    const key = musicKey(tab.linkedBrowser?.currentURI?.spec);
    if (!key) return null;
    const known = creatorMap().get(scoped(key, contextOf(tab)));
    if (!known && learn) fetchPageName(tab, key, "music");
    return known || null;
  }

  function nexusURLFrom(spec) {
    const m = /^https?:\/\/(?:www\.|next\.)?nexusmods\.com(\/[^?#]*)?(?:\?([^#]*))?/.exec(spec || "");
    if (!m || !/^https?:\/\/(?:www\.|next\.)?nexusmods\.com(?:[/?#]|$)/.test(spec)) return null;
    const path = (m[1] || "/").split("/").filter(Boolean), query = new URLSearchParams(m[2] || "");
    const author = path[0] === "profile" && /^[\w%-]+$/.test(path[1] || "")
      ? `https://www.nexusmods.com/profile/${path[1].toLowerCase()}`
      : path[0] === "users" && /^\d+$/.test(path[1] || "") ? `https://www.nexusmods.com/users/${path[1]}` : null;
    const slug = path[0] === "games" ? path[1]
      : path.length === 1 || ["mods", "files", "images", "videos", "articles"].includes(path[1]) ? path[0] : null;
    const game = !author && slug && /^[a-z0-9][a-z0-9-]*$/.test(slug) &&
      !BUILTIN_IGNORE.has(slug) && !["mods", "collections", "vortex", "premium", "site"].includes(slug)
      ? `https://www.nexusmods.com/games/${slug}` : null;
    const gameId = query.get("gameId") || query.get("game_id");
    return { author, game, gameId: /^\d+$/.test(gameId || "") ? gameId : null };
  }
  const nexusURL = tab => nexusURLFrom(tab.linkedBrowser?.currentURI?.spec);
  const nexusContext = new WeakMap();
  const NEXUS_CONTEXT = "zzrouterNexus";

  function savedNexus(tab) {
    if (nexusContext.has(tab)) return nexusContext.get(tab);
    let value = null;
    try {
      const saved = JSON.parse(window.SessionStore.getCustomTabValue(tab, NEXUS_CONTEXT) || "null");
      if (saved && nexusURLFrom(saved.game)?.game === saved.game &&
          saved.ctx === contextOf(tab) && saved.ws === wsOf(tab)) value = saved;
    } catch {}
    nexusContext.set(tab, value);
    return value;
  }
  function saveNexus(tab, value) {
    if (JSON.stringify(savedNexus(tab)) !== JSON.stringify(value)) {
      nexusContext.set(tab, value); targetCache.delete(tab);
    }
    if (isPrivate()) return;
    // Current game URLs and verified ancestry already restore themselves. Only
    // loose/manually placed profiles need the optional per-tab session record.
    const needsRecord = value && nexusURL(tab)?.author && !ancestorsOf(tab).some(g =>
      g.getAttribute("data-zzrouter-subject") === value.game &&
      Number(g.getAttribute("data-zzrouter-context")) === value.ctx);
    try {
      const text = needsRecord ? JSON.stringify(value) : "";
      if (window.SessionStore.getCustomTabValue(tab, NEXUS_CONTEXT) === text) return;
      if (text) window.SessionStore.setCustomTabValue(tab, NEXUS_CONTEXT, text);
      else window.SessionStore.deleteCustomTabValue(tab, NEXUS_CONTEXT);
    } catch {}
  }
  function captureNexus(tab, source = null) {
    if (nativeManaged(tab)) return;
    const nx = nexusURL(tab), prior = savedNexus(tab);
    if (!nx) {
      if (tab.linkedBrowser?.currentURI?.spec === "about:blank" && (source || prior?.initial)) {
        const inherited = source ? savedNexus(source) : prior;
        if (inherited) saveNexus(tab, { ...inherited, initial: true, ctx: contextOf(tab), ws: inherited.ws || wsOf(tab) });
      } else saveNexus(tab, null);
      return;
    }
    const currentGame = nx.game || (!nx.author && nx.gameId ? nexusGame(tab, false)?.key : null);
    if (currentGame) {
      const parent = ancestorsOf(tab).find(g => g.getAttribute("data-zzrouter-subject") === currentGame);
      saveNexus(tab, { game: currentGame, parent: parent?.id || null, ws: wsOf(tab), ctx: contextOf(tab) });
      return;
    }
    if (!nx.author) { saveNexus(tab, null); return; }
    const inherited = prior || (source && savedNexus(source));
    const explicit = nx.gameId ? nexusGame(tab, false)?.key : null;
    if (nx.gameId && !explicit) { saveNexus(tab, null); return; }
    const parent = ancestorsOf(tab).find(g => nexusURLFrom(g.getAttribute("data-zzrouter-subject"))?.game &&
      (!explicit || g.getAttribute("data-zzrouter-subject") === explicit) &&
      Number(g.getAttribute("data-zzrouter-context")) === contextOf(tab));
    const game = explicit || parent?.getAttribute("data-zzrouter-subject") || inherited?.game;
    if (game) saveNexus(tab, { game, parent: parent?.id || inherited?.parent || null,
      ws: inherited?.ws || wsOf(tab), ctx: contextOf(tab) });
  }
  function nexusGame(tab, learn = true) {
    const nx = nexusURL(tab);
    if (!nx) return null;
    let key = nx.game || (nx.author ? savedNexus(tab)?.game : null);
    if (nx.gameId && (nx.author || !nx.game)) {
      // Numeric query context is authoritative. Use verified cached game
      // metadata or Nexus's public game lookup; never guess from selection.
      const match = [...creatorMap()].find(([k, v]) => k.startsWith(`${contextOf(tab)}:https://www.nexusmods.com/games/`) && v.gameId === nx.gameId);
      key = match ? match[0].slice(match[0].indexOf(":") + 1) : null;
      if (!key && learn) fetchNexusGame(tab, nx.gameId);
    }
    if (!key) return null;
    const slug = key.split("/").at(-1);
    const label = aliasMap().get(slug) || creatorMap().get(scoped(key, contextOf(tab)))?.label || segName(tab, slug, learn);
    return { key, label };
  }
  function fetchNexusGame(tab, id) {
    const ctx = contextOf(tab), slot = scoped("nexus-game:" + id, ctx), request = beginLookup(slot, tab);
    if (!request) return;
    const done = body => {
      if (request.epoch !== lookupEpoch) return;
      let record = null;
      try {
        const game = JSON.parse(utf8(body))?.data?.game;
        if (String(game?.id) === id && /^[a-z0-9][a-z0-9-]*$/.test(game.domainName) &&
            typeof game.name === "string" && game.name.trim() && game.name.length <= 160) {
          record = { key: `https://www.nexusmods.com/games/${game.domainName}`, label: game.name, gameId: id };
          creatorMap().set(scoped(record.key, ctx), record); saveCreators(); targetGen++;
        }
      } catch {}
      if (!record) noteFail(slot);
      finishLookup(slot, request);
    };
    // Documented public query: graphql.nexusmods.com/#query-game (3 fields).
    try { fetchAnon("https://api.nexusmods.com/v2/graphql", ctx, done, MAX_FETCH_BYTES,
      { query: `{game(id:"${id}"){id name domainName}}` }); }
    catch { done(null); }
  }

  function authorRecord(tab, nx, learn) {
    const known = creatorMap().get(scoped(nx.author, contextOf(tab)));
    if (!known && learn) fetchPageName(tab, nx.author, "author");
    if (known) return known;
    if (nx.author.includes("/profile/")) {
      let label; try { label = decodeURIComponent(nx.author.split("/").at(-1)); } catch { return null; }
      return { key: nx.author, label };
    }
    return null; // Numeric legacy IDs never become display names.
  }

  // ---- section icons -----------------------------------------------------
  // A subgroup that stands for a creator, a game or an account gets that
  // thing's own picture as its icon; Groupflow reads data-zzrouter-icon off
  // the group before it computes a favicon. Generic: the page a subgroup is
  // named after is the URL up to the naming segment -- abc.com/creator/name
  // names a subgroup "Name", and abc.com/creator/name is the page asked for
  // its og:image. Sites where that page is elsewhere get one line in the
  // table (Nexus keeps a game at /games/<slug>, not at /<slug>). Probed on
  // the live profile: a YouTube channel page's og:image is the 900px
  // avatar, a Nexus game page identifies its square thumbnail, a GitHub owner
  // page's the 420px avatar. A wide share banner, which is what most other
  // pages offer, is refused by aspect and the favicon stays.
  //
  // Each picture is fetched once per section -- the page, then the image,
  // both in the tab's container and anonymous -- cropped square, scaled to
  // 64px and kept as a data: URI, so showing it later never touches the
  // network. https only, only bytes the image decoder accepts are kept, and
  // the store is bounded to 100 sections.
  const ROUND_HOSTS = /(^|\.)(youtube\.com|github\.com|twitch\.tv|tiktok\.com|x\.com|twitter\.com|instagram\.com|threads\.net|bsky\.app|mastodon\.social|reddit\.com|patreon\.com|kick\.com)$/;
  const ICON_ASPECT = [0.6, 1.6];         // 1:1 avatars and 2:3 covers in, 1.9:1 banners out
  const ICON_MAX = 100;
  const ICON_PX = 64;
  const bannerMode = () => [1, 2, 3].includes(num("nexus-banners", 0)) ? num("nexus-banners", 0) : 0;
  const nexusRendition = () => num("nexus-icon", 0) === 1 ? "tile" : "thumbnail";
  const imageData = value => typeof value === "string" && /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(value);
  let iconCache = null;
  function iconMap() {
    if (iconCache) return iconCache;
    try {
      iconCache = new Map(Object.entries(readCache("avatars"))
        .map(([k, v]) => [k, typeof v === "string" ? { d: v, s: "round" } : v])
        // Label-only caches carry no verified subject or container. Refetch
        // those pictures through member URLs; never guess ownership from a name.
        .filter(([k, v]) => /^\d+:https:\/\//.test(k) && v?.d));
    } catch { iconCache = new Map(); }
    return iconCache;
  }
  function saveIcons() {
    // A pref string is capped at 1 MB by Firefox; 100 icons at 64px are a
    // few hundred KB. Oldest out first if it ever gets close.
    const entries = [...iconMap()].slice(-ICON_MAX);
    const text = boundedIcons(entries);
    iconCache = new Map(entries);
    if (isPrivate()) return;
    persist("avatars", text);
  }

  function boundedIcons(entries) {
    let text = JSON.stringify(Object.fromEntries(entries));
    // Drop optional banners before icons when approaching Firefox's pref cap.
    for (const entry of entries) {
      if (text.length <= 900000) break;
      if (!entry[1]?.b) continue;
      entry[1] = { ...entry[1] }; delete entry[1].b;
      noteFail("banner:" + entry[0]);
      text = JSON.stringify(Object.fromEntries(entries));
    }
    while (text.length > 900000 && entries.length) { entries.shift(); text = JSON.stringify(Object.fromEntries(entries)); }
    return text;
  }

  // Decode to raster WebP: 64px square icons or 384px-wide game banners.
  // Reject unsupported aspects and oversized sources before drawing.
  async function toIcon(bytes, banner = false) {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes, c => c.charCodeAt(0))]));
    // A small file can still decode to an enormous surface, and this one
    // is about to become 64 square anyway.
    if (bmp.width > 4096 || bmp.height > 4096) { bmp.close(); return null; }
    const aspect = bmp.width / bmp.height;
    const bounds = banner ? [2, 8] : ICON_ASPECT;
    if (aspect < bounds[0] || aspect > bounds[1]) { bmp.close(); return null; }
    const side = Math.min(bmp.width, bmp.height);
    const width = banner ? 384 : ICON_PX, height = banner ? Math.round(width / aspect) : ICON_PX;
    const c = new OffscreenCanvas(width, height);
    if (banner) c.getContext("2d").drawImage(bmp, 0, 0, width, height);
    else c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, width, height);
    bmp.close();
    const buf = new Uint8Array(await (await c.convertToBlob({ type: "image/webp", quality: 0.85 })).arrayBuffer());
    let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
    return `data:image/webp;base64,${btoa(bin)}`;
  }

  function fetchPicture(url, ctx, banner, done) {
    try { fetchAnon(url, ctx, bytes => {
      if (!bytes || bytes.length > (banner ? MAX_FETCH_BYTES - 1 : 400000)) return done(null);
      toIcon(bytes, banner).then(done, () => done(null));
    }); } catch { done(null); }
  }

  function fetchSectionBanner(label, ctx, gameId, refresh = false) {
    if (retired || isPrivate() || !bool("section-icons", true) || !bannerMode() || !/^[1-9]\d*$/.test(gameId || "")) return;
    if (nexusURLFrom(label)?.game !== label) return;
    const key = scoped(label, ctx), slot = "banner:" + key;
    if ((!refresh && iconMap().get(key)?.b) || inFlight.has(slot) || Date.now() - (failed.get(slot) || 0) < RETRY_FAIL_MS) return;
    if (!(bannerMode() & 2) && !groups().some(g => g.getAttribute("data-zzrouter-picture") === label &&
        Number(g.getAttribute("data-zzrouter-context")) === ctx && window.Groupflow?.automaticPictureAllowed?.(g))) return;
    inFlight.set(slot, true);
    const epoch = lookupEpoch;
    fetchPicture(`https://images.nexusmods.com/images/games/v2/${gameId}/hero.jpg`, ctx, true, banner => {
      if (epoch !== lookupEpoch) return;
      inFlight.delete(slot);
      if (!banner) { noteFail(slot); return; }
      const current = iconMap().get(key);
      if (current?.g !== gameId) return;
      iconMap().set(key, { ...current, b: banner }); saveIcons(); repaintSubjects(new Set([key]));
    });
  }

  // SVG supplies alpha to this raster layer only. No remote references or
  // executable page content; the browser sizes/crops it inside the existing fill.
  function paintBanner(node, data) {
    const opacity = Math.max(0, Math.min(100, num("nexus-banner-opacity", 25))) / 100;
    const value = imageData(data) && opacity ? `${opacity}:${data}` : null;
    if ((node.getAttribute("data-zzrouter-banner") || null) === value) return false;
    if (value) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><image width="100%" height="100%" preserveAspectRatio="xMidYMid slice" opacity="${opacity}" href="${data}"/></svg>`;
      node.setAttribute("data-zzrouter-banner", value);
      node.style?.setProperty("--zzrouter-banner-data", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    } else {
      node.removeAttribute("data-zzrouter-banner"); node.style?.removeProperty("--zzrouter-banner-data");
    }
    return true;
  }

  // label is the canonical subject URL, never a folder display name.
  function fetchSectionIcon(label, pageUrl, ctx, shape, refresh = false) {
    if (retired || isPrivate() || !bool("section-icons", true) || !pageUrl) return;
    try { if (!lookupURIAllowed(Services.io.newURI(pageUrl))) return; } catch { return; }
    const key = scoped(label, ctx), slot = "icon:" + key;
    // The pending channel lookup supplies this same metadata; its completion
    // queues the tab again. Do not fetch the channel page twice in parallel.
    if (!refresh && channelKey(pageUrl) && inFlight.has(scoped(pageUrl, ctx))) return;
    const nexus = nexusURLFrom(pageUrl)?.game === pageUrl, rendition = nexus ? nexusRendition() : null;
    const cachedIcon = iconMap().get(key);
    if (!refresh && cachedIcon?.d && (!nexus || cachedIcon.n === rendition)) {
      if (nexus) fetchSectionBanner(label, ctx, cachedIcon.g);
      return;
    }
    if (!key || inFlight.has(slot)) return;
    const lastFail = failed.get(slot);
    if (lastFail && Date.now() - lastFail < RETRY_FAIL_MS) return;
    inFlight.set(slot, true);
    const epoch = lookupEpoch;
    const refreshes = lookupOwner().refreshes ??= new Map();
    if (refresh && refreshes.has(key)) { inFlight.delete(slot); return; }
    const operation = {};
    if (refresh) { refreshes.set(key, operation); refreshOperations++; }
    const release = () => { if (refreshes.get(key) === operation) refreshes.delete(key); refreshCancels.delete(release); };
    if (refresh) refreshCancels.add(release);
    // Consent pages, missing metadata and decode failures use the same bounded
    // retry delay as network errors; only successful pictures persist.
    const done = (icon, gameId = null) => {
      release();
      if (epoch !== lookupEpoch) return;
      inFlight.delete(slot);
      if (!icon) { noteFail(slot); note(`no usable picture for "${label}"; favicon stays`); return; }
      const old = iconMap().get(key);
      iconMap().set(key, { d: icon, s: shape, ...(nexus ? { n: rendition, g: gameId } : {}),
        ...(gameId && old?.g === gameId && old.b ? { b: old.b } : {}) });
      saveIcons();
      note(`icon for "${label}"`);
      repaintSubjects(new Set([key]));
      if (nexus) fetchSectionBanner(label, ctx, gameId, refresh);
    };
    try {
      fetchMetadata(pageUrl, ctx, metadata => {
        if (epoch !== lookupEpoch) return;
        if (!metadata) return done(null);
        const img = metadata.image?.replace(/=s\d+/, "=s256");
        if (nexus) {
          // Nexus's documented V2 thumbnail/hero templates are keyed by the
          // numeric ID in a canonically verified game page, never a folder name.
          const art = /^https:\/\/images\.nexusmods\.com\/images\/games\/(?:v2\/([1-9]\d*)\/tile|4_3\/tile_([1-9]\d*))\.(?:jpg|png|webp)(?:\?[^\s"'<>\\]*)?$/.exec(img || "");
          // Nexus serves www pages with next-host canonical metadata too.
          // Normalize only official host aliases; keep the complete path check.
          const canonical = metadata.canonical?.replace(/^https:\/\/(?:next\.)?nexusmods\.com\//, "https://www.nexusmods.com/").replace(/\/$/, "");
          if (!art || canonical !== pageUrl) return done(null);
          const gameId = art[1] || art[2];
          const name = metadata.title?.replace(/ Mods(?: - Nexus Mods)?$/, "");
          if (!refresh && name && name.length <= 160) {
            creatorMap().set(key, { key: pageUrl, label: name, gameId }); saveCreators(); targetGen++;
            for (const tab of allTabs()) {
              const nx = nexusURL(tab);
              if (nx?.author && nx.gameId === gameId && contextOf(tab) === ctx) queueRoute(tab, "game metadata");
            }
          }
          const finish = icon => done(icon, art[1] || null);
          const cover = () => fetchPicture(img, ctx, false, finish);
          // V1 games have no thumbnail/hero contract; retain their cover.
          if (!art[1] || rendition === "tile") return cover();
          return fetchPicture(`https://images.nexusmods.com/images/games/v2/${gameId}/thumbnail.jpg`, ctx, false,
            icon => { if (epoch !== lookupEpoch) return; if (icon) finish(icon); else cover(); });
        }
        if (!img || !/^https:\/\/[^\s"'<>\\]+$/.test(img)) return done(null);
        fetchPicture(img, ctx, false, done);
      }, refresh);
    } catch (e) { note(`icon setup failed for "${label}": ${e}`); done(null); }
  }

  // Reject literal addresses and local-only hostnames, including image URLs
  // and redirects. This does not classify the IPs returned by DNS.
  const INTERNAL_HOST = /^(?:localhost|[^.]+|\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]*\]|.+\.(?:local|localhost|internal|lan|home|corp|intranet))$/i;

  function picturesEnabled(host) {
    const excluded = num("auto-path-mode", 0) === 1 && cached("pathdomains", () => str("auto-path-domains", "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
      .some(d => host === d || host?.endsWith("." + d));
    return bool("section-icons", true) && !excluded;
  }

  // Pre-1.35 groups have no subject stamp. Recover presentation from their
  // members, never routing ownership from a label. Every live member must
  // verify the same picture and container; manual names and mixed groups stay.
  function legacyPicture(g) {
    const label = (g.label || "").trim().toLowerCase();
    let picture = null;
    for (const tab of g.tabs ?? []) {
      if (!tab.isConnected || tab.closing) continue;
      const record = pictureSubject(tab, false), parts = pathParts(tab, false);
      if (record) {
        parts.push(partFor(record, tab));
        const seg = record.key.split("/").at(-1);
        for (const name of [record.label, segName(tab, seg, false), prettify(seg.replace(/^@/, ""))])
          if (name) parts.push({ ...partFor(record, tab), label: name });
      }
      const part = parts.find(p => p.picture && p.label?.trim().toLowerCase() === label);
      if (!part || !picturesEnabled(hostOf(tab)) ||
          (picture && (picture.key !== part.picture || picture.ctx !== part.ctx))) return null;
      picture = { key: part.picture, ctx: part.ctx };
    }
    return picture;
  }

  function stampIcons(learn = false, targets = groups()) {
    const on = !retired && bool("section-icons", true);
    const changed = [];
    let removed = false;
    for (const g of targets) {
      let picture = null;
      if (on && !nativeManaged(g) && parentOf(g)) {
        const key = g.getAttribute("data-zzrouter-picture"), ctx = g.getAttribute("data-zzrouter-context");
        if (key && /^https:\/\//.test(key) && /^\d+$/.test(ctx || "")) picture = { key, ctx: Number(ctx) };
        else if (!g.hasAttribute("data-zzrouter-subject")) {
          picture = legacyPicture(g);
          if (picture) {
            g.setAttribute("data-zzrouter-picture", picture.key);
            g.setAttribute("data-zzrouter-context", picture.ctx);
            // Groupflow saves these two display fields independently of subject
            // ownership, through its existing group-details/session lifecycle.
            g.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
          }
        }
      }
      const want = picture?.key && picturesEnabled(/^https:\/\/([^/]+)/.exec(picture.key)?.[1])
        ? iconMap().get(scoped(subjectKey(picture.key, picture.ctx), picture.ctx)) || iconMap().get(scoped(picture.key, picture.ctx)) : null;
      const automatic = window.Groupflow?.automaticPictureAllowed?.(g);
      const nexus = picture && nexusURLFrom(picture.key)?.game === picture.key;
      paintBanner(g, automatic && nexus && (bannerMode() & 1) ? want?.b : null);
      if (on && automatic && picture) {
        if (learn) fetchSectionIcon(picture.key, picture.key, picture.ctx, nexus ? "square" : "round");
        if (want?.g && (bannerMode() & 1)) fetchSectionBanner(picture.key, picture.ctx, want.g);
      }
      if (want?.d) {
        if (g.getAttribute("data-zzrouter-icon") !== want.d || g.getAttribute("data-zzrouter-icon-shape") !== want.s) {
          g.setAttribute("data-zzrouter-icon", want.d);
          g.setAttribute("data-zzrouter-icon-shape", want.s); changed.push(g);
        }
      } else if (g.hasAttribute("data-zzrouter-icon")) {
        g.removeAttribute("data-zzrouter-icon"); g.removeAttribute("data-zzrouter-icon-shape");
        removed = true; changed.push(g);
      }
    }
    if (changed.length) try { window.Groupflow?.refresh?.(!removed, changed); } catch {}
  }

  function pictureSubject(tab, learn = true) {
    if (nativeManaged(tab)) return null;
    const nx = nexusURL(tab);
    if (nx) return nexusGame(tab, learn);
    const channel = channelRecord(tab);
    if (channel) {
      if (learn && !creatorMap().has(scoped(channel.key, contextOf(tab)))) fetchPageName(tab, channel.key, "channel");
      return channel;
    }
    const id = videoId(tab);
    if (!id) return null;
    const known = creatorMap().get(scoped(id, contextOf(tab)));
    if (!known?.key && learn) fetchCreator(tab, id);
    if (!known?.key) return null;
    if (learn && !creatorMap().has(scoped(known.key, contextOf(tab)))) fetchPageName(tab, known.key, "channel");
    return { ...known, key: subjectKey(known.key, contextOf(tab)) };
  }

  function presentable(tab) {
    return tab?.isConnected && !tab.closing && !tab.closest?.("zen-library") && !heldElsewhere(tab);
  }
  // Live Folder providers own placement and artwork, regardless of the user's
  // ordinary pinned/grouped routing choices. Also cover items during reparenting.
  function nativeManaged(tab) {
    if (tab?.hasAttribute("zen-live-folder-item-id")) return true;
    let group = ["tab-group", "zen-folder"].includes(tab?.tagName) ? tab : tab?.group;
    for (; group; group = parentOf(group)) if (group.isLiveFolder) return true;
    return false;
  }
  function updatePicture(tab, learn = true) {
    if (!presentable(tab)) return;
    const enabled = !retired && picturesEnabled(hostOf(tab));
    const record = enabled ? pictureSubject(tab, learn && !tab.zenStaticIcon) : null;
    const key = record && scoped(record.key, contextOf(tab));
    if (record && learn && !tab.zenStaticIcon) fetchSectionIcon(record.key, record.key, contextOf(tab),
      nexusURL(tab) ? "square" : "round");
    const icon = !tab.zenStaticIcon && key ? iconMap().get(key)?.d : null;
    const bannerChanged = paintBanner(tab, !tab.zenStaticIcon && key && nexusURLFrom(record.key)?.game === record.key &&
      (bannerMode() & 2) ? iconMap().get(key)?.b : null);
    updateOpenMenu();
    const old = tab.getAttribute("data-zzrouter-tab-icon");
    if (icon && /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(icon)) {
      if (old === icon && !bannerChanged) return;
      tab.setAttribute("data-zzrouter-tab-icon", icon);
      tab.style?.setProperty("--zzrouter-tab-icon", `url("${icon}")`);
    } else {
      if (!old && !bannerChanged) return;
      tab.removeAttribute("data-zzrouter-tab-icon");
      tab.style?.removeProperty("--zzrouter-tab-icon");
    }
    // Zen Library rebuilds copies for image changes. The native image attribute
    // stays untouched, so site-level folder icons keep their site attribution.
    tab.dispatchEvent?.(new CustomEvent("TabAttrModified", { bubbles: true, detail: { changed: ["image"] } }));
  }
  function refreshPictures(learn = true) {
    for (const tab of allTabs()) { captureNexus(tab); updatePicture(tab, learn); }
  }

  function creatorOf(tab, learn = true) {
    if (!bool("media-subgroups", false)) return null;
    // Collection/browse pages must never be named after the playing track.
    if (hostOf(tab) === "music.youtube.com" && !videoId(tab)) return null;
    return pictureSubject(tab, learn);
  }
  function withCreator(tab, parts, learn = true) {
    if (!parts?.length || nexusURL(tab)) return parts;
    const who = creatorOf(tab, learn);
    if (!who?.label || parts.some(p => typeof p === "object" && p.key === who.key) ||
        parts.some(p => typeof p === "string" && p.toLowerCase() === who.label.toLowerCase())) return parts;
    return [...parts, partFor(who, tab)];
  }

  function computeTargetPath(tab, learn = true) {
    const host = hostOf(tab);
    if (!host) return null;
    for (const r of rules()) {
      if (r.domains.some(d => host === d || host.endsWith("." + d))) {
        const parts = r.group.split(SEP()).map(s => s.trim()).filter(Boolean);
        return nexusURL(tab) && parts.length === 1 ? [...parts, ...pathParts(tab, learn)] : parts;
      }
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

      const all = [domainName(base), ...subParts, ...pathParts(tab, learn)];
      // Redundancy killer: search.brave.com/search must not become
      // Brave > Search > Search. Any repeat of an earlier part is dropped.
      const out = [];
      for (const p of all) {
        if (out.some(x => typeof x === "string" && typeof p === "string" && x.toLowerCase() === p.toLowerCase())) continue;
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
  // A descendant query includes nested groups and stops at the first tab;
  // Zen's `tabs` getter instead collects every descendant into new arrays.
  const live = (g) => g.isConnected && !!g.querySelector("tab");

  function groups() {
    if (groupsCache && groupsCache.every(live)) return groupsCache;
    // Zen folders subclass tab-group but live pinned; split-view wrappers
    // are positional artifacts. Leave both alone.
    // Zen's library holds clones of every strip; never file into those.
    groupsCache = [...document.querySelectorAll("tab-group:not(zen-library *)")].filter(g =>
      !g.isZenFolder && !nativeManaged(g) && !g.hasAttribute("split-view-group") && live(g));
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
    return sec;
  }

  // ROOT-level groups are workspace-scoped: a "Youtube" in another workspace
  // must not be matched when filing within this one (that is decided
  // earlier, by moving the tab). Nested levels are scoped by parent already.
  function findChild(name, parent, ws) {
    return groups().find(g =>
      matchesPart(g, name) &&
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
  function groupPart(g) {
    const key = g.getAttribute("data-zzrouter-subject");
    return key ? { label: (g.label ?? "").trim(), key, ctx: Number(g.getAttribute("data-zzrouter-context")),
      picture: g.getAttribute("data-zzrouter-picture") || "" } : (g.label ?? "").trim();
  }
  const chainOf = tab => ancestorsOf(tab).reverse().map(groupPart);
  const matchesPart = (g, part) => samePath([groupPart(g)], [part]);

  const samePath = (a, b) =>
    a.length === b.length && a.every((s, i) => typeof b[i] === "object"
      ? typeof s === "object" && s.ctx === b[i].ctx && subjectKey(s.key, s.ctx) === subjectKey(b[i].key, b[i].ctx)
      : partLabel(s).toLowerCase() === partLabel(b[i]).toLowerCase());

  // DOM tabs include all workspaces and Essentials; gBrowser.tabs is a subset.
  // The library's clones of each strip are not tabs.
  function allTabs() {
    return [...document.querySelectorAll(".tabbrowser-tab:not(zen-library *)")];
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
    want.length && chain.length >= want.length && samePath(chain.slice(0, want.length), want) &&
    // Remove obsolete automatic Author layers; retain manually organized suffixes.
    !(chain.slice(want.length).some(p => typeof p === "object" && nexusURLFrom(p.key)?.author) &&
      chain.slice(want.length).every(p => typeof p === "object"));

  function duplicateChannelGroup(tab, want) {
    const group = tab?.group, key = group?.getAttribute("data-zzrouter-subject");
    if (!channelKey(key) || !group.hasAttribute("data-zzrouter-created") ||
        window.Groupflow?.automaticPictureAllowed?.(group) === false ||
        !want?.length || !samePath(chainOf(tab), want) ||
        group.label?.trim().toLowerCase() !== partLabel(want.at(-1))?.toLowerCase()) return null;
    const first = findChild(want.at(-1), parentOf(group), wsOfEl(group));
    return first && first !== group && first.hasAttribute("data-zzrouter-created") &&
      first.label?.trim().toLowerCase() === group.label.trim().toLowerCase() ? first : null;
  }

  function queueChannelDuplicates() {
    if (!bool("enabled", false) || !bool("refile-mismatched", true)) return;
    for (const tab of allTabs()) if (duplicateChannelGroup(tab, targetPath(tab, false))) queueRoute(tab, "channel identity");
  }

  function placedInPath(chain, want, tab) {
    if (startsWithPath(chain, want)) return !duplicateChannelGroup(tab, want);
    let at = 0;
    while (at < chain.length && at < want.length && samePath([chain[at]], [want[at]])) at++;
    // Unowned subfolders below a matching prefix remain manual. Their labels
    // cannot establish semantic ownership, even when they resemble this route.
    return at > 0 && typeof chain[at] === "string" && typeof want[at] === "object";
  }

  const deferredContainers = new WeakSet();
  async function placeInPath(tab, parts) {
    if (!parts?.length) return false;
    const nx = nexusURL(tab);
    if (nx?.author && !nexusGame(tab, false) && tab.group) return false;
    const provenance = nx?.author && savedNexus(tab);
    const gameGroup = provenance?.parent && document.getElementById?.(provenance.parent);
    if (gameGroup && live(gameGroup) && wsOfEl(gameGroup) === provenance.ws &&
        gameGroup.getAttribute("data-zzrouter-subject") === nexusGame(tab, false)?.key &&
        Number(gameGroup.getAttribute("data-zzrouter-context")) === contextOf(tab) &&
        parts.some(p => typeof p === "object" && p.key === gameGroup.getAttribute("data-zzrouter-subject"))) {
      parts = [...chainOf({ group: gameGroup }), ...parts.slice(parts.findIndex(p =>
        typeof p === "object" && p.key === gameGroup.getAttribute("data-zzrouter-subject")) + 1)];
    }
    const cap = num("max-depth", 0);
    if (cap > 0) parts = parts.slice(0, cap);

    const chain = chainOf(tab);
    const filed = placedInPath(chain, parts, tab);

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
    const relocate = filed && !bool("skip-grouped", true) && dest.explicit && dest.ws && dest.ws !== tabWs;
    const haveCtx = parseInt(tab.getAttribute("usercontextid") || "0", 10);
    // With group creation off, a rule naming a missing group does nothing:
    // no container reopen, no workspace move, no leaving the current group.
    // An existing parent of a missing subgroup still receives the tab.
    if ((!filed || relocate) && !canCreateGroups() && !findChild(parts[0], null, dest.ws || tabWs)) {
      note(`"${parts[0]}" does not exist and group creation is switched off`);
      return false;
    }

    if (bool("follow-containers", true) && dest.ctx != null && dest.ctx !== haveCtx) {
      if (tab.hasAttribute("busy")) {
        // Filing can happen now; only replacing a loaded page needs to wait.
        deferredContainers.add(tab);
      } else {
        const fresh = await reopenInContainer(tab, dest.ctx, dest.ws);
        if (!fresh) return false;
        deferredContainers.delete(tab);
        if (fresh !== tab) {
          bustGroups();
          return file(fresh, (filed ? chain : parts).map(part => typeof part === "object"
            ? { ...part, ctx: contextOf(fresh) } : part));
        }
      }
    } else deferredContainers.delete(tab);
    if (filed && !relocate) { healWorkspace(tab); return false; }
    if (dest.ws && dest.ws !== tabWs) {
      try {
        window.gZenWorkspaces.moveTabToWorkspace(tab, dest.ws);
        note(`moved "${tab.label}" to ${dest.why}`);
      } catch (e) {
        note(`workspace move failed: ${e}; filing in current workspace instead`);
      }
    }
    // A workspace-only correction retains deeper manual subfolders in an
    // already-matching path, just as container replacement does above.
    return file(tab, filed ? chain : parts);
  }

  function resolveDestination(tab, parts) {
    const nx = nexusURL(tab), provenance = nx?.author && savedNexus(tab);
    if (nx?.author) return { ws: provenance?.ws || wsOf(tab), ctx: contextOf(tab), why: "the originating game" };
    let ws = null, ctx = null, why = "", stay = false, explicit = false;
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
            explicit = true;
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
    const roots = rootGroupsNamed(partLabel(parts[0]));
    const root = ws ? roots.find(g => wsOfEl(g) === ws)
      : roots.find(g => wsOfEl(g) === tabWs) ?? (stay ? null : roots[0] ?? null);
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
    return { ws, ctx, why, explicit };
  }

  // Most common usercontextid among the tabs already in the group. 0 is a
  // real answer (no container) when the members say so; null only when the
  // group is empty, which falls through to the workspace default.
  function majorityContext(group) {
    const counts = new Map();
    for (const t of group.querySelectorAll(".tabbrowser-tab")) {
      // A tab filed before its container check must not vote for that old container.
      if (deferredContainers.has(t)) continue;
      const c = parseInt(t.getAttribute("usercontextid") || "0", 10);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    let context = null, most = 0;
    for (const [c, count] of counts) {
      if (count > most) { context = c; most = count; }
    }
    return context;
  }

  // Reopens the tab with the given container (and workspace, when given);
  // returns the tab to keep filing -- the fresh one, or the original on
  // failure.
  async function reopenInContainer(tab, wantCtx, targetWs) {
    const url = (() => { try { return tab.linkedBrowser?.currentURI?.spec; } catch { return null; } })();
    if (!url || !/^https?:/i.test(url)) return tab;
    // Only container replacement waits for network STOP and session state.
    if (tab.hasAttribute("busy")) return null;
    try {
      // Routing runs after load. Unlike Zen's navigation-time redirect, a
      // reload here can erase back history, a POST result or an edited form.
      await gBrowser.prepareDiscardBrowser(tab);
      if (retired || window[INSTANCE_KEY] !== instance || !bool("enabled", false) || skip(tab)) return null;
      if (tab.linkedBrowser.currentURI.spec !== url) {
        queueRoute(tab, "navigation changed while routing");
        return null;
      }
      if (tab.hasAttribute("busy")) return null;
      const state = JSON.parse(window.SessionStore.getTabState(tab));
      const entry = state.entries?.[0];
      const hasPost = e => !!e && (!!e.postdata || e.children?.some(hasPost));
      if (state.entries?.length !== 1 || state.formdata || state.storage ||
          hasPost(entry)) {
        note(`kept container for "${tab.label}": page has session state`);
        return tab;
      }
    } catch (e) { note(`container state check failed: ${e}`); return tab; }
    return replaceInContainer(tab, url, wantCtx, targetWs);
  }

  function replaceInContainer(tab, url, wantCtx, targetWs, loadOptions = {}) {
    let fresh;
    const wasSelected = tab.selected;
    try {
      // Keep the navigation's principal/referrer when intercepting a first
      // request; otherwise use the loaded page's principal. Never system.
      fresh = gBrowser.addTab(url, {
        triggeringPrincipal: tab.linkedBrowser?.contentPrincipal ||
          Services.scriptSecurityManager.createNullPrincipal({}),
        ...loadOptions,
        userContextId: wantCtx,
        inBackground: !wasSelected,
        skipRoute: true,
      });
    } catch (e) { note(`container reopen failed: ${e}`); return tab; }
    if (!fresh) return tab;
    const provenance = savedNexus(tab);
    if (provenance) saveNexus(fresh, { ...provenance, ctx: wantCtx, ws: targetWs || wsOf(tab) });
    try {
      if (targetWs) window.gZenWorkspaces.moveTabToWorkspace(fresh, targetWs);
    } catch {}
    try { gBrowser.removeTab(tab); } catch {}
    if (tab.isConnected && !tab.closing) {
      // A beforeunload veto keeps the original. Do not leave a duplicate.
      try { gBrowser.removeTab(fresh); } catch {}
      return tab;
    }
    if (wasSelected) gBrowser.selectedTab = fresh;
    note(`reopened "${url.slice(0, 60)}" in container ${wantCtx}`);
    return fresh;
  }

  // Files the tab under `parts`, touching only what differs. Verified
  // primitives on 1.22b: addTabGroup([tab], {insertBefore: tab}) is born at
  // the tab's DOM position, so inside a group it nests; group.addTabs([tab])
  // reparents from anywhere; a group Zen empties removes itself after its
  // close animation, so nothing here removes groups -- and removeTabGroup()
  // is never called, because it closes the tabs.
  const canCreateGroups = () => bool("create-groups", true) && typeof gBrowser.addTabGroup === "function";

  function file(tab, parts) {
    if (nativeManaged(tab)) return false;
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
      try { g = gBrowser.addTabGroup([tab], { label: partLabel(name), insertBefore: tab, isUserTriggered: true }); }
      catch (e) { note(`addTabGroup("${name}") threw: ${e}`); return depth > 0; }
      if (!g) { note(`addTabGroup("${name}") returned nothing`); return depth > 0; }
      g.setAttribute("data-zzrouter-created", Date.now());
      if (typeof name === "object") {
        g.setAttribute("data-zzrouter-subject", name.key);
        g.setAttribute("data-zzrouter-context", name.ctx);
        g.setAttribute("data-zzrouter-picture", name.picture || "");
      }
      if (!parent && ws && !wsOf(g)) g.setAttribute("zen-workspace-id", ws);
      if (parent && parentOf(g) !== parent) note(`"${name}" did not nest under "${parent.label}" on this build`);
      bustGroups();
      note(`created group "${name}"${parent ? ` under "${parent.label}"` : ""}`);
      parent = g; depth++;
    }
    captureNexus(tab);
    stampIcons(false, ancestorsOf(tab));
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
    if (els.length < 2 || els.some(g => g.hasAttribute("data-zzrouter-locked") || g.tabs?.some(placementLocked))) return;
    const current = domOrder(els);
    if (sameOrder(current, sorted)) return;
    const members = new Set(els);
    let cursor = current[0];
    for (const el of sorted) {
      while (cursor && !members.has(cursor)) cursor = cursor.nextSibling;
      if (el === cursor) cursor = cursor.nextSibling;
      else mvEl(el, () => parentNode.insertBefore(el, cursor));
    }
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
      if (g.hasAttribute("data-zzrouter-locked") || g.tabs?.some(placementLocked)) continue;
      const c = g.groupContainer ?? g.querySelector(".tab-group-container");
      if (!c) continue;
      // A subgroup Zen is animating out still sits in the DOM with no
      // tabs; zenHandleTabMove throws on it (previousTabStates[0]).
      const subs = [...c.children].filter(el => el.tagName === "tab-group" && live(el));
      if (!subs.length) continue;
      const sorted = mode === 2 ? subs : subs.slice().sort(cmp);
      if (tabsFirst) {
        // Appending every subgroup to the container end leaves all loose
        // tabs above them, in their existing order -- including tabs that
        // were just filed below a subgroup. Skipped when nothing would move.
        const tail = [...c.children].slice(-subs.length);
        if (!sameOrder(tail, sorted) && !subs.some(g => g.hasAttribute("data-zzrouter-locked") || g.tabs?.some(placementLocked))) {
          let next = null;
          for (const sg of sorted.slice().reverse()) {
            if (sg.nextSibling !== next) mvEl(sg, () => c.insertBefore(sg, next));
            next = sg;
          }
        }
      } else {
        reorderBlock(c, subs, sorted);
      }
    }
  }

  // Zen marks a trackpad swipe on the tab scroller, the workspaces and the
  // grain layer (ZenSpacesSwipe.mjs), never on :root. A workspace slide is
  // marked on #navigator-toolbox since Zen 1.23b, on :root before it.
  const swiping = () => !!document.getElementById?.("tabbrowser-arrowscrollbox")?.hasAttribute("swipe-gesture");
  const sliding = () => document.documentElement.hasAttribute("animating-background") ||
    !!document.getElementById?.("navigator-toolbox")?.hasAttribute("animating-background") || swiping();
  let orderTimer = null;
  const startupTimers = [];
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
      if (sliding()) {
        if (!orderDeferredSince) orderDeferredSince = Date.now();
        if (Date.now() - orderDeferredSince < MAX_ORDER_DEFER_MS) {
          scheduleOrder();
          return;
        }
        note("animation marker stuck; ordering anyway");
      }
      orderDeferredSince = 0;
      try { applyOrder(); } catch (e) { note(`applyOrder: ${e}`); }
      try { stampIcons(true); } catch (e) { note(`stampIcons: ${e}`); }
    }, num("order-delay-ms", 150));
  }

  // Zen's window sync mirrors every tab and group into every other
  // window, and the page itself lives in exactly one of them at a time
  // (the one that last showed it); elsewhere the tab is a shell with the
  // label copied over. Only the window holding the page can read its URL,
  // and whatever it does -- a group made, a tab moved -- Zen mirrors to
  // the rest. So each window routes the tabs it holds and leaves the
  // shells alone; two windows routing the same tab is how folders
  // doubled and tabs bounced.
  function heldElsewhere(tab) {
    if (!tab.id || tab._zenContentsVisible) return false;
    try {
      if (window.gZenWorkspaces?.privateWindowOrDisabled) return false;
      if (!Services.prefs.getBoolPref("zen.window-sync.enabled", true)) return false;
      if (Services.prefs.getBoolPref("zen.window-sync.sync-only-pinned-tabs", true) && !tab.pinned) return false;
      const e = Services.wm.getEnumerator("navigator:browser");
      while (e.hasMoreElements()) {
        const w = e.getNext();
        if (w === window || w.closed) continue;
        if (w.document?.getElementById(tab.id)?._zenContentsVisible) return true;
      }
    } catch {}
    return false;
  }

  const LOCK = "zzrouterLocked";
  function placementLocked(tab) {
    try { if (window.SessionStore.getCustomTabValue(tab, LOCK) === "true") return true; } catch {}
    for (let g = tab?.group; g; g = g.parentElement?.closest("tab-group, zen-folder"))
      if (g.hasAttribute("data-zzrouter-locked")) return true;
    return false;
  }
  function setPlacementLock(scope, locked) {
    if (retired || !scope?.isConnected || scope.closest?.("zen-library")) return;
    if (scope.matches?.("tab-group, zen-folder")) {
      scope.toggleAttribute("data-zzrouter-locked", locked);
      scope.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
    } else {
      if (locked) window.SessionStore.setCustomTabValue(scope, LOCK, "true");
      else window.SessionStore.deleteCustomTabValue(scope, LOCK);
    }
    if (!locked) for (const tab of scope.matches?.("tab-group, zen-folder") ? scope.tabs : [scope]) queueRoute(tab, "resume routing");
  }

  function skip(tab, precomputedParts) {
    if (!tab || !tab.isConnected || tab.closing) return "gone";
    if (nativeManaged(tab)) return "live folder";
    if (placementLocked(tab)) return "placement locked";
    if (heldElsewhere(tab)) return "held by another window";
    if (tab.hasAttribute("zen-glance-tab")) return "glance";
    // Zen's blank placeholder tabs cannot be grouped; addTabGroup returns
    // null for them rather than throwing.
    if (tab.hasAttribute("zen-empty-tab")) return "empty tab";
    if (tab.hasAttribute("_forZenEmptyTab")) return "empty tab";
    if (tab.splitView || tab.hasAttribute("split-view") ||
        tab.group?.hasAttribute("split-view-group")) return "split view";
    if (bool("skip-essentials", true) && tab.getAttribute("zen-essential") === "true") return "essential";
    if (bool("skip-pinned", true) && tab.pinned) return "pinned";
    if (bool("skip-grouped", true) && tab.group) {
      // Finish our own pending container check even when grouped tabs are skipped.
      if (deferredContainers.has(tab) && !tab.hasAttribute("busy")) return null;
      // A link opened from a grouped tab inherits that group, even when it
      // goes somewhere unrelated. With this on, a tab whose group path no
      // longer matches where it belongs gets re-filed instead of stranded.
      if (bool("refile-mismatched", true)) {
        const want = precomputedParts !== undefined ? precomputedParts : targetPath(tab);
        const have = chainOf(tab);
        if (want?.length && have.length) {
          if (!placedInPath(have, want, tab)) return null;
          // The previous version could file a tab before changing its
          // container. Also repair that case without flattening subgroups.
          const ctx = bool("follow-containers", true) ? resolveDestination(tab, want).ctx : null;
          if (ctx != null && ctx !== parseInt(tab.getAttribute("usercontextid") || "0", 10)) return null;
        }
      }
      return "already in a group";
    }
    return null;
  }

  const routing = new WeakSet();
  const reroute = new WeakMap();
  async function route(tab, why) {
    if (retired || !presentable(tab)) return;
    captureNexus(tab);
    updatePicture(tab);
    stampIcons(false, ancestorsOf(tab));
    if (!bool("enabled", false)) return;
    if (routing.has(tab)) { reroute.set(tab, why); return; }
    const s = skip(tab);
    if (s) {
      if (s === "already in a group") {
        healWorkspace(tab);
      }
      note(`skip ${tab.label}: ${s}`); return;
    }
    const parts = targetPath(tab);          // skip() may already have cached this
    if (!parts?.length) { note(`no rule for ${hostOf(tab) ?? tab.label}`); return; }
    const host = hostOf(tab);               // the tab may be reopened below
    routing.add(tab);
    try {
      if (await placeInPath(tab, parts)) {
        note(`${why}: ${host} -> ${parts.map(partLabel).join(SEP())}`);
        scheduleOrder();
      }
    } catch (e) {
      note(`failed routing ${tab.label}: ${e}`);
    } finally {
      routing.delete(tab);
      const again = reroute.get(tab);
      reroute.delete(tab);
      if (again) queueRoute(tab, again);
    }
  }

  // ---- events ------------------------------------------------------------
  // Zen's addTab preserves an inherited userContextId. target=_blank also
  // creates about:blank first, so the domain is unknown at tab creation.
  // Route that first GET before any response/session storage reaches the
  // wrong container. Loaded/restoring tabs retain the state checks above.
  const initialPosts = new WeakSet();
  const initialNavigations = new WeakMap();
  const initialRequest = { observe(subject) {
    if (retired) return;
    try {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      const info = channel.loadInfo;
      if (info.externalContentPolicyType !== Ci.nsIContentPolicy.TYPE_DOCUMENT) return;
      const context = info.browsingContext;
      const browser = context?.embedderElement;
      if (!browser) return;
      const tab = gBrowser.getTabForBrowser(browser);
      if (!tab || window.SessionStore.isTabRestoring(tab)) return;
      const original = channel.originalURI?.spec ?? channel.URI.spec;
      // A 302 clears isInitialDocument before a real page commits. Follow
      // only the request chain we saw start in this tab's initial document.
      if (context.currentWindowGlobal?.isInitialDocument) initialNavigations.set(tab, original);
      else if (initialNavigations.get(tab) !== original || browser.currentURI?.spec !== "about:blank") return;
      // A POST -> GET redirect still belongs to the submitted form's
      // container. Do not turn it into a fresh GET in another container.
      if (channel.requestMethod !== "GET" || info.isFormSubmission) {
        initialPosts.add(tab); return;
      }
      if (initialPosts.has(tab) || !bool("enabled", false) || !bool("follow-containers", true)) return;
      const why = skip(tab, []);
      if (why && !(why === "already in a group" && bool("refile-mismatched", true))) return;
      const url = channel.URI.spec;
      const dest = window.gZenSpaceRoutingManager.onBeforeAddTab(url, {}, window);
      if (!dest.isRouteFound || !Number.isInteger(dest.userContextId) || dest.userContextId < 0 ||
          dest.userContextId === parseInt(tab.getAttribute("usercontextid") || "0", 10)) return;
      const fresh = replaceInContainer(tab, url, dest.userContextId, dest.targetRoute, {
        triggeringPrincipal: info.triggeringPrincipal,
        referrerInfo: channel.referrerInfo,
      });
      // Creation failure/close veto leaves the original request untouched.
      if (fresh !== tab) channel.cancel(Components.results.NS_BINDING_ABORTED);
    } catch (e) { note(`initial container route failed: ${e}`); }
  } };

  // File as soon as a URL is known. Coalesce only the current event turn;
  // title/redirect bursts must not keep postponing a tab's move.
  const pendingRoute = new Map();
  function queueRoute(tab, why) {
    if (retired || pendingRoute.has(tab)) return;
    const id = setTimeout(() => {
      pendingRoute.delete(tab);
      route(tab, why);
    }, 0);
    pendingRoute.set(tab, id);
  }
  const progress = {
    onStateChange(browser, wp, _req, flags) {
      if (!wp?.isTopLevel || !(flags & Ci.nsIWebProgressListener.STATE_STOP) ||
          !(flags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) return;
      const tab = gBrowser.getTabForBrowser(browser);
      if (tab) {
        if (!tab.hasAttribute("busy")) initialNavigations.delete(tab);
        queueRoute(tab, "loaded");
      }
    },
    onLocationChange(browser, wp, _req, _loc, _flags) {
      // Subframes report here too; only the tab's own URL decides its route.
      if (!wp?.isTopLevel) return;
      // Same-document changes are NOT skipped: SPAs like YouTube and Nexus
      // navigate by pushState, which is exactly that. Hash/query churn is
      // harmless -- the queue coalesces it and an unchanged target path
      // no-ops in placeInPath.
      const tab = gBrowser.getTabForBrowser(browser);
      if (tab) {
        if (browser.currentURI?.spec !== "about:blank") initialNavigations.delete(tab);
        for (const request of inFlight.values()) request?.waiters?.delete(tab);
        captureNexus(tab);
        updatePicture(tab, false);
        queueRoute(tab, "navigate");
      }
    },
  };

  // Second trigger for SPA navigation: sites like YouTube retitle the tab
  // on every pushState, and TabAttrModified(label) reliably fires for that
  // even when the same-document location change never reaches a tabs
  // progress listener. Converges on the same per-tab queue; a title
  // change with an unchanged target path no-ops in placeInPath.
  function onTabEvent(event) {
    const tab = event.detail?.tab || event.target;
    if (!tab || tab.closest?.("zen-library")) return;
    updateOpenMenu();
    if (event.type === "TabClose") {
      for (const request of inFlight.values()) request?.waiters?.delete(tab);
      clearTimeout(pendingRoute.get(tab)); pendingRoute.delete(tab);
      return;
    }
    if (!presentable(tab)) return;
    if (event.type === "TabOpen") {
      const source = tab.openerTab;
      if (source && presentable(source)) captureNexus(source);
      captureNexus(tab, source);
    }
    if (event.type === "TabGrouped" || event.type === "TabUngrouped") {
      captureNexus(tab);
      updatePicture(tab, false);
      return;
    }
    if (event.type === "ZenTabIconChanged") updatePicture(tab, false);
    else queueRoute(tab, event.type);
  }
  function onAttrModified(event) {
    if (!event.detail?.changed?.includes("label")) return;
    const tab = event.target;
    if (tab?.linkedBrowser) queueRoute(tab, "retitle");
  }

  async function sweepAll(why = "sweep") {
    let n = 0;
    for (const tab of allTabs()) {
      const before = tab.group;
      await route(tab, why);
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
    const { minTabs = 1, subdomains = false, copy = true } = opts;
    const separator = opts.separator ?? SEP();

    // base domain -> Map(host -> count)
    const tree = new Map();
    for (const tab of allTabs()) {
      if (!presentable(tab)) continue;
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
        .sort((a, b) => b[0].split(".").length - a[0].split(".").length || b[1] - a[1] || a[0].localeCompare(b[0]));

      for (const [host] of subs) {
        const leaf = host.slice(0, host.length - base.length - 1)
                         .split(".").reverse().map(prettify).join(separator);
        lines.push(`${host} > ${parent}${separator}${leaf}`);
      }
      lines.push(`${base} > ${parent}`);
    }

    const text = lines.join("\n");
    if (copy) {
      console.log("--- suggested rules ---\n" + text);
      try { Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text); } catch {}
    }
    return text;
  }

  // "Clear history" in Firefox's own dialog also clears what this mod
  // learned from browsing: creator names, section pictures, learned names.
  const purgeObserver = () => { try { forgetAll(); } catch {} };
  function forgetAll() {
    cancelLookups();
    lookupOwner().metadata.clear();
    creatorCache = new Map(); iconCache = new Map(); learnedCache = new Map();
    saveCreators(); saveIcons(); saveLearned();
    stampIcons();
    refreshPictures(false);
    targetGen++;
    log = [];
  }

  const liveScope = scope => !retired && !!scope?.isConnected && !scope.closing && !scope.closest?.("zen-library") && !nativeManaged(scope) &&
    (scope.matches?.("tab-group:not([split-view-group]), zen-folder") || !!scope.linkedBrowser && gBrowser.getTabForBrowser(scope.linkedBrowser) === scope);
  function refreshSubject(scope) {
    if (!liveScope(scope) || isPrivate()) return null;
    const group = scope.matches?.("tab-group, zen-folder");
    if (group ? !window.Groupflow?.automaticPictureAllowed?.(scope) : scope.zenStaticIcon) return null;
    const key = group ? scope.getAttribute("data-zzrouter-picture") : pictureSubject(scope, false)?.key;
    if (!key || !(channelKey(key) || nexusURLFrom(key)?.game === key)) return null;
    const host = /^https:\/\/([^/]+)/.exec(key)?.[1];
    if (!picturesEnabled(host)) return null;
    const ctx = group ? Number(scope.getAttribute("data-zzrouter-context")) : contextOf(scope);
    if (!Number.isInteger(ctx) || ctx < 0) return null;
    const slot = "icon:" + scoped(key, ctx);
    if (inFlight.has(slot) || lookupOwner().refreshes?.has(scoped(key, ctx)) || Date.now() - (failed.get(slot) || 0) < RETRY_FAIL_MS) return null;
    try { if (!lookupURIAllowed(Services.io.newURI(key))) return null; } catch { return null; }
    return { key, ctx };
  }
  function repaintSubjects(keys) {
    const affected = allTabs().filter(tab => keys.has(scoped(pictureSubject(tab, false)?.key, contextOf(tab))));
    for (const tab of affected) updatePicture(tab, false);
    const ancestors = new Set(affected.flatMap(ancestorsOf));
    stampIcons(false, groups().filter(g => keys.has(scoped(g.getAttribute("data-zzrouter-picture"), Number(g.getAttribute("data-zzrouter-context")))) || ancestors.has(g)));
  }
  const menuNodes = new Set();
  function updateOpenMenu() {
    for (const node of menuNodes) {
      if (!node.isConnected || node.zzrouterEligible?.()) continue;
      const popup = node.closest("menupopup, panel");
      const focused = document.activeElement === node;
      node.remove(); menuNodes.delete(node);
      if (focused) ([...popup.querySelectorAll("menuitem, toolbarbutton")].find(n => !n.hidden && !n.disabled && n.getClientRects().length) || popup.anchorNode)?.focus();
    }
  }
  function routingMenu(event) {
    const popup = event.target;
    const panel = popup.matches?.(".tab-group-editor-panel");
    if (!panel && !["tabContextMenu", "zenFolderActions", "menu_ToolsPopup"].includes(popup.id)) return;
    for (const node of menuNodes) node.remove(); menuNodes.clear();
    const container = panel ? popup.querySelector(".tab-group-edit-actions") : popup;
    if (!container) return;
    const item = (id, label, eligible, action) => {
      if (!eligible()) return;
      const node = document.createXULElement(panel ? "toolbarbutton" : "menuitem");
      node.zzrouterEligible = eligible;
      node.setAttribute("data-zz-action", "tab-router--" + id);
      node.setAttribute("label", label); node.setAttribute("class", "subviewbutton");
      node.addEventListener("command", () => { if (!retired && eligible()) action(); });
      container.appendChild(node); menuNodes.add(node); return node;
    };
    const show = (title, value) => Services.prompt.alert(window, title, JSON.stringify(value, null, 2));
    if (popup.id === "menu_ToolsPopup") {
      item("generate-routing-rules", "Generate routing rules from open tabs…", () => true, () => editRules(suggestRules({subdomains: true, copy: false})));
      item("validate-routing-rules", "Validate routing rules", () => true, () => show("Routing rules", validateRules(str("rules", ""))));
      item("edit-routing-rules", "Edit routing rules…", () => true, () => editRules(str("rules", "")));
      return;
    }
    const scope = panel ? gBrowser.tabGroupMenu.activeGroup : popup.id === "tabContextMenu"
      ? (popup.triggerNode?.closest?.(".tabbrowser-tab") || popup.anchorNode?.closest?.(".tabbrowser-tab") || window.TabContextMenu?.contextTab) : popup.triggerNode?.closest?.("zen-folder, tab-group");
    const eligible = () => liveScope(scope);
    if (!eligible()) return;
    const group = scope.matches?.("tab-group, zen-folder");
    const tabs = () => group ? [...scope.tabs].filter(liveScope) : [scope];
    item("why-here", "Why here?", eligible, () => show("Why here?", tabs().map(tab => window.TabRouter.explain(tab))));
    item("preview-sorting", "Preview sorting", eligible, () => show("Preview sorting — no tabs moved", window.TabRouter.preview(tabs())));
    const ownLock = () => group ? scope.hasAttribute("data-zzrouter-locked") : window.SessionStore.getCustomTabValue(scope, LOCK) === "true";
    const locked = ownLock();
    item(locked ? "resume-routing" : "keep-here", locked ? "Resume routing" : "Keep here", () => eligible() && ownLock() === locked, () => setPlacementLock(scope, !locked));
    const subject = refreshSubject(scope);
    if (subject) item("refresh-automatic-picture", "Refresh automatic picture", () => {
      const next = refreshSubject(scope); return next?.key === subject.key && next.ctx === subject.ctx;
    }, () => fetchSectionIcon(subject.key, subject.key, subject.ctx, channelKey(subject.key) ? "round" : "square", true));
  }

  // Native result identity/ranking stays untouched. Read only current pictures;
  // no metadata discovery, tab restoration or requests during a query.
  const searchPictures = { onQueryResults() {
    queueMicrotask(() => {
      if (retired) return;
      for (const row of window.gURLBar?.view.panel.querySelectorAll(".urlbarView-row") || []) {
        const result = row.result, payload = result?.payload;
        if (!payload) continue;
        let icon = null;
        if (payload.zenFolderId && !payload.userIcon) {
          const group = document.getElementById(payload.zenFolderId);
          icon = window.Groupflow?.pictureForSearch?.(group);
        } else if (row.getAttribute("type") === "switchtab") { // Native TAB_SWITCH rendering
          const ctx = payload.userContext?.id ?? payload.userContextId ?? 0;
          const matches = allTabs().filter(tab => contextOf(tab) === ctx && tab.linkedBrowser?.currentURI?.spec === payload.url);
          if (matches.length && matches.every(tab => !tab.zenStaticIcon)) {
            const pictures = new Set(matches.map(tab => tab.getAttribute("data-zzrouter-tab-icon")));
            if (pictures.size === 1) icon = [...pictures][0];
          }
        }
        if (!icon) continue;
        const image = row._elements?.get("icon") || row._elements?.get("favicon") || row.querySelector(".urlbarView-favicon");
        if (image) image.setAttribute("src", icon);
      }
    });
  } };

  function pictureReady() { if (!retired) { stampIcons(); refreshPictures(); queueChannelDuplicates(); } }

  function start() {
    Services.obs.addObserver(prefObserver, "zzrouter-cache-changed");
    window.addEventListener("GroupflowReady", pictureReady);
    window.addEventListener("popupshowing", routingMenu);
    window.addEventListener("DOMContentLoaded", watchRuleSettings, true);
    for (const browser of gBrowser.browsers) { try { watchRuleSettings({target: browser.contentDocument}); } catch {} }
    window.gURLBar?.controller.addListener(searchPictures);
    gBrowser.addTabsProgressListener(progress);
    gBrowser.tabContainer.addEventListener("TabAttrModified", onAttrModified);
    const tabEvents = ["TabOpen", "TabClose", "SSTabRestored", "ZenTabIconChanged", "TabGrouped", "TabUngrouped"];
    for (const event of tabEvents) window.addEventListener(event, onTabEvent, true);
    try { Services.prefs.addObserver(P, prefObserver); } catch {}
    try { Services.obs.addObserver(purgeObserver, "browser:purge-session-history"); } catch {}
    Services.obs.addObserver(initialRequest, "http-on-modify-request");
    // Groups made or removed by hand must invalidate the cache too.
    // TabGroupUngroup does not exist in Zen 1.22b -- it was a dead listener.
    // TabGroupUpdate and TabGroupRemovedFromDOM are the real Zen events for a
    // group changing or leaving the DOM, and both must bust the cache.
    const groupEvents = ["TabGroupCreate", "TabGroupRemoved", "TabGroupRemovedFromDOM",
                         "TabGroupUpdate", "TabGrouped", "TabUngrouped"];
    for (const ev of groupEvents) window.addEventListener(ev, bustGroups, true);

    window.TabRouter = {
      sortAll: () => sweepAll("manual"),
      setPlacementLock,
      pictureCounts: () => ({ creators: creatorMap().size, icons: iconMap().size, inFlight: inFlight.size, refreshOperations }),
      preview(tabs = allTabs()) {
        return tabs.map(t => {
          const parts = targetPath(t, false), why = skip(t, parts);
          const dest = parts?.length ? resolveDestination(t, parts) : null;
          return { title: t.label, host: hostOf(t) ?? "-",
            workspace: dest?.ws, container: dest?.ctx, locked: placementLocked(t),
            currentGroup: chainOf(t).map(partLabel).join(SEP()) || "-",
            wouldGo: why ? `skipped (${why})` : (parts?.map(partLabel).join(SEP()) ?? "no rule") };
        });
      },
      rules,
      // suggestRules()                        -> one rule per domain
      // suggestRules({subdomains:true})       -> plus a nested rule per subdomain
      // suggestRules({minTabs:2})             -> ignore one-off domains
      suggestRules, validateRules,
      groups: () => groups().map(g => chainOf({ group: g }).map(partLabel).join(SEP())),

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
          const seg = path.split("/").map(s => { try { return decodeURIComponent(s).trim(); } catch { return s.trim(); } })
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
        const parts = targetPath(t, false), why = skip(t, parts);
        const dest = parts?.length ? resolveDestination(t, parts) : null;
        return {
          title: t.label,
          url: uri.slice(0, 90),
          host: hostOf(t),
          base: hostOf(t) ? baseDomain(hostOf(t)) : null,
          matchedRule: rules().find(rule => rule.domains.some(domain => hostOf(t) === domain || hostOf(t)?.endsWith("." + domain))) || "automatic / no matching rule",
          placementLocked: placementLocked(t),
          nativePolicy: "Keep here suppresses Router relocation only; native Zen routes still apply to navigation/new tabs.",
          destinationReason: dest?.why || "current workspace and destination container policy",
          routingEnabled: bool("enabled", false),
          pathDepthPref: num("auto-path-depth", 0),
          pathSegments: pathParts(t, false).map(partLabel),
          currentGroup: chainOf(t).map(partLabel).join(SEP()) || null,
          currentContainer: parseInt(t.getAttribute("usercontextid") || "0", 10),
          targetContainer: bool("follow-containers", true) ? dest?.ctx ?? null : null,
          currentWorkspace: wsOf(t),
          targetWorkspace: dest?.ws ?? null,
          pendingContainerCheck: deferredContainers.has(t),
          wouldGo: why ? `skipped (${why})` : parts?.map(partLabel).join(SEP()),
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
          chainBefore: before.map(partLabel).join(" > ") || "(none)",
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
          r.chainAfterEject = chainOf(tab).map(partLabel).join(" > ") || "(none -- eject works)";
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
        targetGen++;
        return slug ? `forgot "${slug}"` : "forgot all learned names";
      },
      // videoId -> creator, everything looked up so far. A record of which
      // videos were opened: bounded to 300 and emptied by forgetCreators().
      creators: () => Object.fromEntries(creatorMap()),
      forgetCreators(id) {
        cancelLookups();
        if (id) {
          for (const key of creatorMap().keys()) if (key === id || key.slice(key.indexOf(":") + 1) === id) creatorMap().delete(key);
        } else { creatorCache = new Map(); iconCache = new Map(); saveIcons(); }
        saveCreators();
        stampIcons(); refreshPictures(false);
        targetGen++;
        return id ? `forgot "${id}"` : "forgot every remembered creator and picture";
      },
      // Everything learned from browsing, at once. Clearing history does this too.
      forgetAll() { forgetAll(); return "forgot every learned name, creator and picture"; },
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
          const parts = targetPath(t, false);
          if (parts?.length) withTarget++;
          const why = skip(t, parts);
          if (why) { reasons[why] = (reasons[why] ?? 0) + 1; continue; }
          if (!parts?.length) { reasons["no rule"] = (reasons["no rule"] ?? 0) + 1; continue; }
          const have = chainOf(t);
          if (!placedInPath(have, parts, t)) {
            stalled.push({
              tab: t.label,
              host: hostOf(t),
              is: have.map(partLabel).join(SEP()) || "(ungrouped)",
              wants: parts.map(partLabel).join(SEP()),
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
          version: "1.37.10",
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

    if (bool("sort-on-startup", false)) startupTimers.push(setTimeout(() => sweepAll("startup"), num("startup-delay-ms", 2500)));
    // Restored creator subgroups get their avatar back whether or not the
    // startup sort runs.
    pictureReady();
    window.gZenStartup?.promiseInitialized.then(pictureReady).catch(() => {});
    note("loaded");

    // This script is injected per window and lives as long as the window
    // does, so every registration above has to be released here or it leaks
    // across window open/close cycles. The capture flag must match the one
    // used to add, or removeEventListener silently does nothing.
    // Sine cleanup and window unload can both run; retire this copy once.
    const cleanup = () => {
      if (retired) return;
      flushWrites();
      retired = true;
      Services.obs.removeObserver(prefObserver, "zzrouter-cache-changed");
      window.removeEventListener("unload", cleanup);
      cancelLookups();
      window.removeEventListener("GroupflowReady", pictureReady);
      window.removeEventListener("popupshowing", routingMenu);
      window.removeEventListener("DOMContentLoaded", watchRuleSettings, true);
      for (const doc of settingsDocs) { doc.removeEventListener("change", validateRuleEdit, true); doc.removeEventListener("input", validateRuleEdit, true); }
      settingsDocs.clear();
      window.gURLBar?.controller.removeListener(searchPictures);
      for (const node of menuNodes) node.remove(); menuNodes.clear();
      stampIcons(); refreshPictures(false);
      for (const event of tabEvents) window.removeEventListener(event, onTabEvent, true);
      try { delete window.TabRouter; } catch {}
      clearTimeout(orderTimer); orderTimer = null;
      for (const id of pendingRoute.values()) clearTimeout(id);
      pendingRoute.clear();
      for (const id of startupTimers) clearTimeout(id);
      startupTimers.length = 0;
      try { gBrowser.removeTabsProgressListener(progress); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabAttrModified", onAttrModified); } catch {}
      try { Services.prefs.removeObserver(P, prefObserver); } catch {}
      try { Services.obs.removeObserver(purgeObserver, "browser:purge-session-history"); } catch {}
      try { Services.obs.removeObserver(initialRequest, "http-on-modify-request"); } catch {}
      for (const ev of groupEvents) {
        try { window.removeEventListener(ev, bustGroups, true); } catch {}
      }
    };
    window.addEventListener("unload", cleanup, { once: true });
    // Registered with Sine, so an update re-injects this script live, no
    // restart: Sine calls cleanup, then loads the new file into the same
    // window, and the instance guard at the top retires whatever copy is
    // still here. Safe now that start() is contained and the top level
    // does nothing that can throw; the DOM unload listener above still
    // releases everything when the window closes.
    try { window.addUnloadListener?.(cleanup); } catch {}
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
    for (const pref of declared) {
      const name = pref?.property;
      const value = pref?.defaultValue;
      if (!name || !name.startsWith(P) || value === undefined || value === null) continue;
      try {
        if (S.getPrefType(name) !== S.PREF_INVALID) continue;   // already chosen
        if (typeof value === "boolean") S.setBoolPref(name, value);
        else if (typeof value === "number") S.setIntPref(name, value);
        else if (typeof value === "string") S.setStringPref(name, value);
      } catch {}
    }
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

  const startOnce = async () => {
    // A newer copy of this script may have claimed the window while this one
    // was waiting; that copy owns the registrations, so this one stays quiet.
    if (started || window[INSTANCE_KEY] !== instance) return;
    started = true;
    stopWaiting();
    try {
      const { openRouterCache } = ChromeUtils.importESModule("chrome://sine/content/zz-tab-router/router-cache.sys.mjs");
      const { JSONFile } = ChromeUtils.importESModule("resource://gre/modules/JSONFile.sys.mjs");
      fileCache = await openRouterCache({ Services, IOUtils, PathUtils, JSONFile });
    } catch (error) { console.error("[TabRouter] Retaining legacy caches; disk store unavailable:", error); }
    if (window.closed || retired || window[INSTANCE_KEY] !== instance) return;
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
  instance.retire = () => { retired = true; stopWaiting(); };
  try { window.addUnloadListener?.(() => instance.retire()); } catch {}

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
