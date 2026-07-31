// ==UserScript==
// @name           Tab Router
// @description    Sorts tabs into nested tab groups by domain, using your rules.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const P = "zzrouter.";
  const bool = (k, d) => { try { return Services.prefs.getBoolPref(P + k, d); } catch { return d; } };
  const str  = (k, d) => { try { return Services.prefs.getStringPref(P + k, d); } catch { return d; } };
  function num(k, d) {
    const f = P + k;
    try { const v = Services.prefs.getIntPref(f); if (Number.isFinite(v)) return v; } catch {}
    try { const v = parseFloat(Services.prefs.getStringPref(f)); if (Number.isFinite(v)) return v; } catch {}
    return d;
  }

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
  const prefObserver = { observe() { for (const k of Object.keys(parsed)) delete parsed[k]; learnedCache = null; targetGen++; } };
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
    let path = "";
    try { path = tab.linkedBrowser?.currentURI?.filePath ?? ""; } catch { return []; }
    const skipWords = cached("skipwords", () => new Set(
      str("auto-path-ignore", "")
        .split(",").map(s => s.trim().toLowerCase()).filter(Boolean)));
    const segs = path.split("/")
      .map(s => decodeURIComponent(s).trim())
      .filter(Boolean)
      .filter(s => !BUILTIN_IGNORE.has(s.toLowerCase()) && !skipWords.has(s.toLowerCase()))
      // drop pure ids and file names, which make useless group names
      .filter(s => !/^\d+$/.test(s) && !/\.[a-z0-9]{2,4}$/i.test(s));
    return segs.slice(0, depth).map(s => segName(tab, s));
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
      const parts = computeTargetPath(tab);
      targetCache.set(tab, { spec, gen: targetGen, parts });
      return parts;
    }
    return computeTargetPath(tab);
  }

  // Returns the target as a PATH: ["Nexusmods", "Stalker 2"]. Each level is
  // a nested tab group. A flat name is just a one-element path.
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

  function groups() {
    if (groupsCache && groupsCache.every(g => g.isConnected)) return groupsCache;
    const set = new Set();
    try { for (const g of gBrowser.tabGroups) set.add(g); } catch {}
    try { for (const g of document.querySelectorAll("tab-group")) set.add(g); } catch {}
    // Zen folders subclass tab-group but live pinned; split-view wrappers
    // are positional artifacts. Leave both alone.
    groupsCache = [...set].filter(g => g.tagName === "tab-group" && !g.isZenFolder &&
                                       !g.hasAttribute("split-view-group"));
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

  // ---- ejection ----------------------------------------------------------
  // Verified against Zen 1.21 source (tabbrowser-js.patch):
  //   gBrowser.ungroupTab(tab)  ->  tab.group.after(tab)
  // pops exactly ONE level and leaves the tab adjacent to the group it left,
  // so it never crosses a workspace boundary. Looping it walks the tab out
  // of every ancestor, in place. (group.ungroupTabs() takes NO argument and
  // dissolves the whole group -- last resort only.)
  function ancestorsOf(tab) {
    const out = [];
    let g = tab.group ?? null;
    while (g && g.tagName === "tab-group") { out.push(g); g = parentOf(g); }
    return out;
  }

  function ejectAll(tab) {
    const left = ancestorsOf(tab);
    for (let i = 0; i < 10 && tab.group; i++) {
      const g = tab.group;
      try {
        if (typeof gBrowser.ungroupTab === "function") gBrowser.ungroupTab(tab);
        else g.ungroupTabs?.();   // dissolves g entirely; siblings spill out
      } catch (e) { note(`eject threw on "${g.label}": ${e}`); break; }
      if (tab.group === g) { note(`eject made no progress on "${g.label}"`); break; }
    }
    return left;
  }

  const endsWithPath = (chain, want) =>
    want.length && chain.length >= want.length && samePath(chain.slice(-want.length), want);

  // Want ["Youtube"], filed in ["Youtube", "XP To Level 3"]: the tab sits in
  // a DEEPER subgroup of the right path, e.g. inherited from the creator
  // page it was opened from. That is better organization, not drift --
  // leave it. This is what keeps a creator's videos in the creator's group.
  const startsWithPath = (chain, want) =>
    want.length && chain.length >= want.length && samePath(chain.slice(0, want.length), want);

  // One repair attempt per tab: if it is suffix-filed under junk and the
  // junk cannot be ejected on this build, stop touching it instead of
  // looping forever.
  const repaired = new WeakSet();

  function placeInPath(tab, parts) {
    if (!parts?.length) return false;
    const cap = num("max-depth", 0);
    if (cap > 0) parts = parts.slice(0, cap);

    const chain = chainOf(tab);
    if (startsWithPath(chain, parts)) {                // filed right (or deeper)
      healWorkspace(tab);
      return false;
    }
    if (endsWithPath(chain, parts)) {                  // filed right, junk above
      if (repaired.has(tab)) return false;
      repaired.add(tab);                               // one shot at cleaning up
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
      if (fresh !== tab) { bustGroups(); return placeInPathTail(fresh, parts); }
    }
    if (dest.ws && dest.ws !== tabWs) {
      try {
        window.gZenWorkspaces.moveTabToWorkspace(tab, dest.ws);
        note(`moved "${tab.label}" to ${dest.why}`);
      } catch (e) {
        note(`workspace move failed: ${e}; filing in current workspace instead`);
      }
    }
    return placeInPathTail(tab, parts);
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

  function placeInPathTail(tab, parts) {
    const left = ejectAll(tab);

    // THE loop-killer: never create groups while the tab still sits inside
    // an old chain -- that is exactly what manufactured the staircase.
    if (chainOf(tab).length) {
      note(`eject FAILED for "${tab.label}" -- still in ` +
           `${chainOf(tab).join(" > ")}; leaving it alone. Run TabRouter.diag() and report.`);
      return false;
    }

    const ok = walkPath(tab, parts);

    // Groups the eject emptied are residue (1.9 flat joined-label groups,
    // 1.10.x staircases). No tab anywhere under them = removing closes nothing.
    for (const g of left) {
      if (!g.isConnected) continue;
      if (g.querySelector(".tabbrowser-tab")) continue;
      try { gBrowser.removeTabGroup(g); bustGroups(); note(`removed empty group "${g.label}"`); }
      catch (e) { note(`could not remove empty "${g.label}": ${e}`); }
    }
    return ok;
  }

  function walkPath(tab, parts) {
    let parent = null;
    const ws = wsOf(tab) || window.gZenWorkspaces?.activeWorkspace || null;
    for (const name of parts) {
      let g = findChild(name, parent, parent ? null : ws);
      if (g) {
        // Move the tab in at this level so the next creation nests here.
        if (tab.group !== g) {
          try { g.addTabs?.([tab]); } catch (e) { note(`addTabs failed on "${g.label}": ${e}`); return !!parent; }
        }
        parent = g;
        continue;
      }
      if (!bool("create-groups", true)) {
        note(`"${name}" does not exist and group creation is switched off`);
        return !!parent;
      }
      if (typeof gBrowser.addTabGroup !== "function") {
        note("gBrowser.addTabGroup missing -- cannot create groups on this build");
        return !!parent;
      }
      try {
        // Zen's addTabGroup dereferences insertBefore without a null guard,
        // so the tab itself is passed: the group is born where the tab sits.
        // If the tab sits inside `parent`, the new group is born nested --
        // that IS the subgroup mechanism.
        g = gBrowser.addTabGroup([tab], {
          label: name,
          insertBefore: tab,
          isUserTriggered: true,
        });
      } catch (e) {
        note(`addTabGroup("${name}") threw: ${e}`);
        return !!parent;
      }
      if (!g) { note(`addTabGroup("${name}") returned nothing`); return !!parent; }
      g.setAttribute("data-zzrouter-created", Date.now());
      if (!parent && ws && !wsOf(g)) g.setAttribute("zen-workspace-id", ws);
      if (parent && parentOf(g) !== parent) {
        // ponytail: no repair attempt; report and keep the flat group
        note(`"${name}" was created but did NOT nest under "${parent.label}" on this build`);
      }
      bustGroups();
      note(`created group "${name}"${parent ? ` under "${parent.label}"` : ""}`);
      parent = g;
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
      const subs = [...c.children].filter(el => el.tagName === "tab-group");
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
  function scheduleOrder() {
    clearTimeout(orderTimer);
    orderTimer = setTimeout(() => { try { applyOrder(); } catch (e) { note(`applyOrder: ${e}`); } }, num("order-delay-ms", 150));
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
        if (want?.length && have.length && !startsWithPath(have, want)) {
          // Suffix-filed under junk gets exactly one repair attempt;
          // placeInPath marks it and this stops routing it afterwards.
          if (!endsWithPath(have, want) || !repaired.has(tab)) return null;
        }
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
    const groupEvents = ["TabGroupCreate", "TabGroupRemoved", "TabGroupUngroup", "TabGrouped", "TabUngrouped"];
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
          ejectAll(tab);
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
      log: formatLog,
    };

    if (bool("sort-on-startup", false)) setTimeout(() => sweepAll("startup"), num("startup-delay-ms", 2500));
    note("loaded");

    window.addEventListener("unload", () => {
      try { gBrowser.removeTabsProgressListener(progress); } catch {}
      try { gBrowser.tabContainer.removeEventListener("TabAttrModified", onAttrModified); } catch {}
      try { Services.prefs.removeObserver(P, prefObserver); } catch {}
    }, { once: true });
  }

  if (gBrowserInit?.delayedStartupFinished) start();
  else {
    const obs = (subject, topic) => {
      if (topic === "browser-delayed-startup-finished" && subject === window) {
        Services.obs.removeObserver(obs, topic);
        start();
      }
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
  }
})();
