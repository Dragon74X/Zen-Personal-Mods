// ==UserScript==
// @name           Tab Router
// @description    Sorts tabs into tab groups by domain, using your rules.
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

  // ---- rules -------------------------------------------------------------
  // One rule per line:  github.com, gitlab.com > Dev
  // Left side is a comma-separated list of domain fragments, right side is
  // the group name. First matching rule wins, so order is precedence.
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
      // drop pure ids and file names, which make useless folder names
      .filter(s => !/^\d+$/.test(s) && !/\.[a-z0-9]{2,4}$/i.test(s));
    return segs.slice(0, depth).map(titleCase);
  }

  function targetGroup(tab) {
    const host = hostOf(tab);
    if (!host) return null;
    for (const r of rules()) {
      if (r.domains.some(d => host === d || host.endsWith("." + d))) return r.group;
    }
    // Fully automatic: derive the folder path from the host itself, so a
    // site you have never visited before still lands somewhere sensible
    // without any rule existing for it.
    if (bool("auto-unmatched", false)) {
      const base = baseDomain(host);
      const parent = titleCase(base);
      if (!bool("auto-subdomains", true)) {
        const p = pathParts(tab);
        return p.length ? [parent, ...p].join(SEP()) : parent;
      }

      // "docs.proton.me" with base "proton.me" leaves "docs".
      // "www" is noise, not a meaningful subdomain.
      let sub = host.length > base.length
        ? host.slice(0, host.length - base.length - 1)
        : "";
      sub = sub.replace(/^www$/i, "").replace(/^www\./i, "");
      if (!sub) return parent;

      // a.b.example.com -> Example / B / A, outermost first
      const depth = Math.max(1, num("auto-depth", 1));
      const parts = sub.split(".").reverse().slice(0, depth).map(titleCase);
      return [parent, ...parts, ...pathParts(tab)].join(SEP());
    }
    return null;
  }

  // ---- group handling ----------------------------------------------------
  function groups() {
    try { return gBrowser.tabGroups.filter(g => g.tagName === "tab-group"); }
    catch { return []; }
  }
  const findGroup = (name) =>
    groups().find(g => (g.label ?? "").trim().toLowerCase() === name.trim().toLowerCase());

  // gBrowser.tabs does not cover everything in Zen: on a real profile it
  // reported 13 while the document held 56 .tabbrowser-tab elements, 25 of
  // them Essentials. Union both sources, de-duplicated.
  function allTabs() {
    const set = new Set();
    try { for (const t of gBrowser.tabs) set.add(t); } catch {}
    try { for (const t of document.querySelectorAll(".tabbrowser-tab")) set.add(t); } catch {}
    return [...set];
  }

  function placeInGroup(tab, name) {
    // Leaving a tab in its old group makes addTabs a no-op on some builds.
    if (tab.group && (tab.group.label ?? "").trim().toLowerCase() !== name.trim().toLowerCase()) {
      try { tab.group.ungroupTabs?.([tab]); } catch (e) { note(`ungroup failed: ${e}`); }
    }
    const existing = findGroup(name);
    if (existing) {
      if (tab.group === existing) return false;
      if (typeof existing.addTabs === "function") { existing.addTabs([tab]); return true; }
      // gBrowser.moveTabToGroup does not exist on Firefox 153 / Zen, so this
      // is the end of the line rather than a silent failure.
      note("no API to move a tab into an existing group on this build");
      return false;
    }
    if (!bool("create-groups", true)) {
      note(`"${name}" does not exist and group creation is switched off`);
      return false;
    }
    if (typeof gBrowser.addTabGroup !== "function") {
      note("gBrowser.addTabGroup missing -- cannot create groups on this build");
      return false;
    }
    try {
      // Zen's addTabGroup dereferences insertBefore without a null guard:
      //   addTabGroup@tabbrowser.js -> "can't access property before,
      //   insertBefore is null"
      // Firefox's own version tolerates null; Zen's does not. Passing the
      // tab itself puts the new group where that tab already sits.
      // Verified against a live profile: this exact shape returns a
      // tab-group. isUserTriggered:false plus a blank tab returned null,
      // so both are set the way that actually worked.
      const made = gBrowser.addTabGroup([tab], {
        label: name,
        insertBefore: tab,
        isUserTriggered: true,
      });
      if (!made) {
        note(`addTabGroup("${name}") returned nothing -- group NOT created`);
        return false;
      }
      // Zen routes some group creation through folders; report what we got
      // rather than assuming it is a plain tab-group.
      note(`created ${made.tagName || "?"} "${name}"` +
           (made.pinned ? " (pinned)" : ""));
      return true;
    } catch (e) {
      note(`addTabGroup("${name}") threw: ${e}`);
      return false;
    }
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
      // goes somewhere unrelated. With this on, a tab whose group no longer
      // matches where it belongs gets re-filed instead of being stranded.
      if (bool("refile-mismatched", true)) {
        const want = targetGroup(tab);
        const have = (tab.group.label ?? "").trim().toLowerCase();
        if (want && have && want.trim().toLowerCase() !== have) return null;
      }
      return "already in a group";
    }
    return null;
  }

  function route(tab, why) {
    if (!bool("enabled", false)) return;
    const s = skip(tab);
    if (s) { note(`skip ${tab.label}: ${s}`); return; }
    const name = targetGroup(tab);
    if (!name) { note(`no rule for ${hostOf(tab) ?? tab.label}`); return; }
    try {
      const useFolders = num("target", 0) === 1;
      const ok = useFolders ? placeInFolder(tab, name) : placeInGroup(tab, name);
      if (ok) note(`${why}: ${hostOf(tab)} -> ${name}${useFolders ? " (folder)" : " (group)"}`);
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

  // ---- Zen folders ------------------------------------------------------
  // Folders are native Zen (window.gZenFolders), not an Advanced Tab Groups
  // construct -- ATG only converts between groups and folders. The
  // zen-folder element exposes createSubfolder, addTabs, label, level and
  // allItemsRecursive, so folders genuinely nest and a rule naming
  // "Google / Docs" can become a real subfolder rather than a flat label.

  const SEP = () => str("folder-separator", " / ");

  function foldersAvailable() {
    return !!window.gZenFolders && typeof window.gZenFolders.createFolder === "function";
  }

  function allFolders() {
    return [...document.querySelectorAll("zen-folder")];
  }

  function directParentFolder(el) {
    return el.parentElement?.closest("zen-folder") ?? null;
  }

  function findFolder(label, parent) {
    const want = label.trim().toLowerCase();
    return allFolders().find(f =>
      (f.label ?? "").trim().toLowerCase() === want &&
      directParentFolder(f) === parent) ?? null;
  }

  // Walks a path like ["Google","Docs"], creating what is missing, and
  // returns the deepest folder. The tab is passed in at every level so no
  // folder is ever created empty -- ATG's own code bails on an empty tab
  // list, so an empty create is not a safe assumption.
  function ensureFolderPath(parts, tab) {
    let parent = null;
    for (const raw of parts) {
      const name = raw.trim();
      if (!name) continue;
      let folder = findFolder(name, parent);
      if (!folder) {
        try {
          if (!parent) {
            folder = window.gZenFolders.createFolder([tab], {
              label: name,
              renameFolder: false,
              workspaceId: window.gZenWorkspaces?.activeWorkspace,
            });
          } else if (typeof parent.createSubfolder === "function") {
            folder = parent.createSubfolder([tab], {
              label: name,
              renameFolder: false,
            });
          } else {
            note(`createSubfolder missing on "${parent.label}"; cannot nest`);
            return parent;
          }
        } catch (e) {
          note(`folder create failed at "${name}": ${e}`);
          return parent;
        }
        if (!folder) { note(`folder create returned nothing at "${name}"`); return parent; }
      }
      parent = folder;
    }
    return parent;
  }

  function placeInFolder(tab, name) {
    if (!foldersAvailable()) {
      note("gZenFolders unavailable; falling back to tab groups");
      return placeInGroup(tab, name);
    }
    const parts = name.split(SEP()).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return false;
    const target = ensureFolderPath(parts, tab);
    if (!target) return false;
    // ensureFolderPath seeds each level with the tab, so if the deepest
    // folder already existed the tab still needs adding explicitly.
    try {
      const already = [...(target.allItemsRecursive ?? [])].includes(tab);
      if (!already && typeof target.addTabs === "function") target.addTabs([tab]);
    } catch (e) {
      note(`addTabs failed on "${target.label}": ${e}`);
    }

    // Zen folders live in the pinned area: setFolderIndentation returns
    // early unless gZenPinnedTabManager.expandedSidebarMode is on, and
    // gZenFolders subscribes to tab pin/unpin. So a tab filed into a folder
    // arrives pinned. Whether it can be unpinned and STAY in the folder is
    // not documented anywhere, so this attempts it and reports the result
    // instead of assuming either way.
    if (bool("unpin-in-folders", false)) unpinAttempt(tab, target);
    return true;
  }

  // Zen folders sit in the pinned area by construction: setFolderIndentation
  // returns early unless gZenPinnedTabManager.expandedSidebarMode is on, and
  // gZenFolders subscribes to handleTabPin/handleTabUnpin. Two things are
  // worth trying and neither is documented, so both are attempted and the
  // outcome is reported rather than assumed.
  function unpinAttempt(tab, folder) {
    let folderResult = "not tried";
    try {
      if (folder && folder.pinned === true) {
        folder.pinned = false;
        folderResult = folder.pinned ? "refused" : "accepted";
      } else {
        folderResult = "already unpinned";
      }
    } catch (e) {
      folderResult = `threw (${e})`;
    }

    let tabResult = "not tried";
    let stillIn = true;
    try {
      if (tab.pinned && typeof gBrowser.unpinTab === "function") {
        gBrowser.unpinTab(tab);
        tabResult = tab.pinned ? "refused" : "accepted";
      } else {
        tabResult = "already unpinned";
      }
      stillIn = !!(tab.closest && tab.closest("zen-folder"));
    } catch (e) {
      tabResult = `threw (${e})`;
    }

    note(`unpin "${tab.label}": folder.pinned=${folderResult} ` +
         `tab.unpin=${tabResult} stillInFolder=${stillIn}` +
         (!stillIn ? "   <-- EJECTED: Zen requires folder members to be pinned" : ""));
    return stillIn;
  }

  // ---- rule generation --------------------------------------------------
  // Reads the tabs you actually have open and writes the rules block for
  // you. Output is text to paste into the Rules box, deliberately -- it is
  // a starting point to edit, not something applied behind your back.

  function titleCase(s) {
    return s.split(/[-.]/)[0].replace(/^./, c => c.toUpperCase());
  }

  function suggestRules(opts = {}) {
    const { minTabs = 1, subdomains = false, separator = " / " } = opts;

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
      const parent = titleCase(base);

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
                         .split(".").reverse().map(titleCase).join(separator);
        lines.push(`${host} > ${parent}${separator}${leaf}`.padEnd(0) +
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
          currentGroup: t.group?.label ?? "-",
          wouldGo: skip(t) ? `skipped (${skip(t)})` : (targetGroup(t) ?? "no rule"),
        }));
      },
      rules,
      // suggestRules()                        -> one rule per domain
      // suggestRules({subdomains:true})       -> plus a rule per subdomain
      // suggestRules({minTabs:2})             -> ignore one-off domains
      suggestRules,
      groups: () => groups().map(g => g.label),
      // Reports whether folders can hold unpinned tabs on this build.
      // Runs the unpin experiment on one folder tab and reports, without
      // touching anything else. Use this before enabling it for real.
      testUnpin() {
        const f = allFolders()[0];
        if (!f) return "no folders exist yet";
        const tab = [...(f.allItemsRecursive ?? [])].find(t => gBrowser.isTab(t));
        if (!tab) return `folder "${f.label}" has no tabs`;
        const kept = unpinAttempt(tab, f);
        return kept
          ? "tab stayed in the folder unpinned -- safe to enable"
          : "tab was ejected -- Zen folders require pinned members";
      },
      pinReport() {
        return allFolders().map(f => ({
          label: f.label,
          folderPinned: f.pinned,
          tabs: [...(f.allItemsRecursive ?? [])]
            .filter(t => gBrowser.isTab(t))
            .map(t => ({ title: t.label, pinned: t.pinned })),
        }));
      },
      folderTree() {
        const walk = (parent, depth) => allFolders()
          .filter(f => directParentFolder(f) === parent)
          .map(f => ({ label: f.label, depth,
                       level: f.level,
                       children: walk(f, depth + 1) }));
        return { api: foldersAvailable(), tree: walk(null, 0) };
      },
      folders: () => {
        // Folders are a Zen native feature (window.gZenFolders), separate
        // from the native tab groups this mod currently files into.
        const f = [...document.querySelectorAll("zen-folder")];
        return { api: !!window.gZenFolders, count: f.length,
                 labels: f.map(x => x.label) };
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
