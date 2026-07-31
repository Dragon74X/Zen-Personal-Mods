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
    log.push(`${new Date().toLocaleTimeString()}  ${m}`);
    if (log.length > 300) log.shift();
    if (bool("debug", false)) console.log("[TabRouter]", m);
  };

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
    const map = new Map();
    for (const pair of str("auto-path-aliases", "").split(/[\n,]+/)) {
      const i = pair.indexOf("=");
      if (i < 0) continue;
      const k = pair.slice(0, i).trim().toLowerCase();
      const v = pair.slice(i + 1).trim();
      if (k && v) map.set(k, v);
    }
    return map;
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

  // ---- rules -------------------------------------------------------------
  // One rule per line:  github.com, gitlab.com > Dev
  // Left side is a comma-separated list of domain fragments, right side is
  // the group name. A name containing the separator nests: "Work / Email"
  // is a subgroup Email inside a group Work. First matching rule wins.
  function rules() {
    return str("rules", "")
      .split(/[\n;]+/)
      .map(line => {
        const i = line.indexOf(">");
        if (i < 0) return null;
        const domains = line.slice(0, i).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const group = line.slice(i + 1).trim();
        return domains.length && group ? { domains, group } : null;
      })
      .filter(Boolean);
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
  function pathParts(tab) {
    const depth = num("auto-path-depth", 0);
    if (depth < 1) return [];
    let path = "";
    try { path = tab.linkedBrowser?.currentURI?.filePath ?? ""; } catch { return []; }
    const skipWords = new Set(
      str("auto-path-ignore", "games,category,categories,c,p,en,en-us,www,index,home")
        .split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    const segs = path.split("/")
      .map(s => decodeURIComponent(s).trim())
      .filter(Boolean)
      .filter(s => !skipWords.has(s.toLowerCase()))
      // drop pure ids and file names, which make useless group names
      .filter(s => !/^\d+$/.test(s) && !/\.[a-z0-9]{2,4}$/i.test(s));
    return segs.slice(0, depth).map(prettify);
  }

  // Returns the target as a PATH: ["Nexusmods", "Stalker 2"]. Each level is
  // a nested tab group. A flat name is just a one-element path.
  function targetPath(tab) {
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

      return [domainName(base), ...subParts, ...pathParts(tab)];
    }
    return null;
  }

  // ---- groups, nested ----------------------------------------------------
  // Nesting mechanism, learned the hard way in 1.8.x when subgroups showed
  // up by accident: gBrowser.addTabGroup(..., { insertBefore: tab }) births
  // the group at the tab's DOM position. A tab already sitting inside a
  // group therefore produces a group INSIDE that group. 1.8.x tripped over
  // this; this version does it on purpose, one level at a time.

  function groups() {
    const set = new Set();
    try { for (const g of gBrowser.tabGroups) set.add(g); } catch {}
    try { for (const g of document.querySelectorAll("tab-group")) set.add(g); } catch {}
    // Zen folders subclass tab-group but live pinned; leave them alone.
    return [...set].filter(g => g.tagName === "tab-group" && !g.isZenFolder);
  }

  const parentOf = (g) => g?.parentElement?.closest("tab-group") ?? null;

  function findChild(name, parent) {
    const want = name.trim().toLowerCase();
    return groups().find(g =>
      (g.label ?? "").trim().toLowerCase() === want && parentOf(g) === parent) ?? null;
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

  // One repair attempt per tab: if it is suffix-filed under junk and the
  // junk cannot be ejected on this build, stop touching it instead of
  // looping forever.
  const repaired = new WeakSet();

  function placeInPath(tab, parts) {
    if (!parts?.length) return false;
    const cap = num("max-depth", 0);
    if (cap > 0) parts = parts.slice(0, cap);

    const chain = chainOf(tab);
    if (samePath(chain, parts)) return false;          // filed right
    if (endsWithPath(chain, parts)) {                  // filed right, junk above
      if (repaired.has(tab)) return false;
      repaired.add(tab);                               // one shot at cleaning up
    }

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
      try { gBrowser.removeTabGroup(g); note(`removed empty group "${g.label}"`); }
      catch (e) { note(`could not remove empty "${g.label}": ${e}`); }
    }
    return ok;
  }

  function walkPath(tab, parts) {
    let parent = null;
    for (const name of parts) {
      let g = findChild(name, parent);
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
      if (parent && parentOf(g) !== parent) {
        // ponytail: no repair attempt; report and keep the flat group
        note(`"${name}" was created but did NOT nest under "${parent.label}" on this build`);
      }
      note(`created group "${name}"${parent ? ` under "${parent.label}"` : ""}`);
      parent = g;
    }
    return true;
  }

  function skip(tab) {
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
      // A link opened from a grouped tab inherits that group, even when it
      // goes somewhere unrelated. With this on, a tab whose group path no
      // longer matches where it belongs gets re-filed instead of stranded.
      if (bool("refile-mismatched", true)) {
        const want = targetPath(tab);
        const have = chainOf(tab);
        if (want?.length && have.length && !samePath(want, have)) {
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
    const s = skip(tab);
    if (s) { note(`skip ${tab.label}: ${s}`); return; }
    const parts = targetPath(tab);
    if (!parts?.length) { note(`no rule for ${hostOf(tab) ?? tab.label}`); return; }
    try {
      if (placeInPath(tab, parts))
        note(`${why}: ${hostOf(tab)} -> ${parts.join(SEP())}`);
    } catch (e) {
      note(`failed routing ${tab.label}: ${e}`);
    }
  }

  // ---- events ------------------------------------------------------------
  // Route on load rather than on open: a brand new tab has no URL yet.
  const progress = {
    onLocationChange(browser, _wp, _req, _loc, flags) {
      if (flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) return;
      const tab = gBrowser.getTabForBrowser(browser);
      if (tab) setTimeout(() => route(tab, "navigate"), num("delay-ms", 400));
    },
  };

  function sweepAll(why = "sweep") {
    if (!bool("enabled", false)) return 0;
    let n = 0;
    for (const tab of allTabs()) {
      const before = tab.group;
      route(tab, why);
      if (tab.group !== before) n++;
    }
    note(`${why}: moved ${n}`);
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
      log: () => log.slice(),
    };

    if (bool("sort-on-startup", false)) setTimeout(() => sweepAll("startup"), 2500);
    note("loaded");

    window.addEventListener("unload", () => {
      try { gBrowser.removeTabsProgressListener(progress); } catch {}
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
