// Zen Personal Mods -- settings and health check.
//
// Paste into the Browser Console (Ctrl+Shift+J), press Enter, then click
// back on the Zen window within 3 seconds: Zen draws its blur only in the
// active window. A few seconds later the report is on the clipboard.
//
// It reads settings, versions, styles and counts, never page titles or
// addresses, text settings that could hold them, or file paths. The one
// thing it changes: a playing tab with no media card asks Zen to make one.
//
// It answers three questions that have each cost a debugging session:
//   1. Is the mod's script actually running in this window?
//   2. Does every pref hold the TYPE its declaration says it should?
//   3. Is a settings row hidden because the pref its condition names has
//      never been written -- the default in preferences.json is not applied
//      to the profile, so an unset "true" default reads as false?
(async () => {
  const W = Services.wm.getMostRecentWindow("navigator:browser");
  const P = Services.prefs;
  const TYPE = { 0: "unset", 32: "string", 64: "int", 128: "bool" };
  // Web addresses are removed; other paths (a profile path names the Windows
  // user) shrink to their file name.
  const strip = s => String(s)
    .replace(/\b(?:https?|wss?|ftp):\/\/[^\s'"`()]*/gi, "<address>")
    .replace(/[^\s'"`()]*[\\/][^\s'"`()]*/g, u => u.split(/[\\/]/).pop()).slice(0, 220);
  // GitHub sources are public; anything else (a local folder) is stripped.
  const pub = u => /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//.test(u ?? "") ? u : strip(u ?? "");

  const MODS = [
    ["zz-download-prompt", "Download Prompt", "DownloadPrompt"],
    ["zz-glassflow", "Glassflow", null],
    ["zz-glassflow-library", "Glassflow Library", null],
    ["zz-groupflow",    "Groupflow",    "Groupflow"],
    ["zz-iconflow",     "Iconflow",     null],
    ["zz-tab-router",   "Tab Router",   "TabRouter"],
    ["zz-tab-unloader", "Tab Unloader", "TabUnloader"],
    ["zz-zen-turbo",    "Zen Turbo",    "ZenTurbo"],
    ["zz-mediaflow",    "Mediaflow",    "ZzMediaflowController"],
    ["zz-peekflow",     "Peekflow",     null],
  ];

  // What a declared pref type should be stored as. A dropdown is only an int
  // when its declaration says value:"number"; without that Sine stores the
  // chosen option as a string and every numeric -moz-pref() stops matching.
  const wantType = (pref) =>
    pref.type === "checkbox" ? "bool"
    : pref.type === "dropdown" ? (pref.value === "number" ? "int" : "string")
    : pref.type === "string" || pref.type === "text" ? "string"
    : null;

  const read = (name) => {
    const t = TYPE[P.getPrefType(name)] ?? "?";
    if (t === "unset") return { type: t, value: null };
    try {
      return { type: t, value:
        t === "bool" ? P.getBoolPref(name) :
        t === "int"  ? P.getIntPref(name)  : P.getStringPref(name) };
    } catch (e) { return { type: t, value: "ERROR " + strip(e) }; }
  };

  // Sine uses OR at the row level, AND inside an unlabelled nested group,
  // and typed false/0/"" defaults for unset dependencies.
  function conditionsPass(conditions, operator = "AND") {
    const rows = Array.isArray(conditions) ? conditions : [conditions];
    if (!rows.length) return true;
    const values = rows.map(cond => {
      const c = cond?.if || cond?.not;
      if (!c) return cond?.conditions ? conditionsPass(cond.conditions, cond.operator || "AND") : false;
      const actual = typeof c.value === "boolean" ? P.getBoolPref(c.property, false)
        : typeof c.value === "number" ? P.getIntPref(c.property, 0)
        : P.getCharPref(c.property, "");
      return cond.not ? actual !== c.value : actual === c.value;
    });
    return operator === "OR" ? values.some(Boolean) : values.every(Boolean);
  }

  const report = { mods: {} };
  let installed = null;
  try {
    const manager = ChromeUtils.importESModule(
      "chrome://userscripts/content/core/manager.sys.mjs").default;
    report.sineUpdateGuard = manager.__zenPersonalModsUpdateGuardV1 === true
      ? "active (session-scoped)" : "not active (restart, or engine no longer matches)";
  } catch (e) { report.sineUpdateGuard = "could not inspect: " + strip(e); }
  try {
    const utils = ChromeUtils.importESModule(
      "chrome://userscripts/content/core/utils.sys.mjs").default;
    installed = await utils.getMods();
    report.installedMods = Object.values(installed).map(m => [strip(m.name), m.version, !!m.enabled]);
    report.sineAutoUpdates = utils.autoUpdate;
  } catch (e) { report.sineUpdateSettings = "could not inspect: " + strip(e); }

  for (const [id, name, global] of MODS) {
    const out = { script: "(defines no global)", problems: [], hiddenRows: [] };
    if (installed) {
      const mod = installed[id];
      out.updates = mod ? {
        enabled: !!mod.enabled, blocked: !!mod["no-updates"],
        version: mod.version, updatedAt: mod.updatedAt,
        source: pub(mod.homepage), origin: pub(mod.origin),
      } : "not in Sine's installed-mod registry";
    }

    if (global) {
      out.script = typeof W[global] === "object" ? "alive" : "NOT RUNNING";
    }
    const gen = W[{ "zz-download-prompt":"__zzdlInstance",
                    "zz-glassflow":"__zzglassInstance", "zz-glassflow-library":"__zzlibInstance", "zz-groupflow":"__zzgroupInstance",
                    "zz-iconflow":"__zziconInstance", "zz-peekflow":"__zzpeekInstance",
                    "zz-tab-router":"__zzrouterInstance", "zz-tab-unloader":"__zzunloadInstance",
                    "zz-zen-turbo":"__zzturboInstance" }[id]];
    if (id !== "zz-mediaflow") out.injected = gen ? `yes${gen.generation ? ` (generation ${gen.generation})` : ""}` : "no marker -- old version or never injected";

    // The version actually on disk. Settings that exist in the repository but
    // not here mean Sine has not pulled the update -- which looks exactly like
    // a broken feature, and is the first thing to rule out.
    try {
      const t = await fetch(`chrome://sine/content/${id}/theme.json`);
      out.installedVersion = (await t.json())?.version ?? "(none)";
    } catch (e) { out.installedVersion = "could not read theme.json: " + strip(e); }

    let prefs = null;
    try {
      const res = await fetch(`chrome://sine/content/${id}/preferences.json`);
      const json = await res.json();
      prefs = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch (e) {
      out.problems.push(`could not read preferences.json: ${strip(e)}`);
      report.mods[name] = out;
      continue;
    }

    let checked = 0, unset = 0;
    for (const pref of prefs) {
      if (!pref || typeof pref !== "object" || !pref.property) continue;
      const want = wantType(pref);
      if (!want) continue;
      checked++;
      const got = read(pref.property);
      if (got.type === "unset") {
        unset++;
      } else if (got.type !== want) {
        out.problems.push(
          `${pref.property}: declared ${pref.type}${pref.value ? `/${pref.value}` : ""} ` +
          `wants ${want}, stored as ${got.type}` + (got.type === "string" ? "" : ` (${got.value})`));
      }

      if (pref.conditions) {
        try {
          // Rows on another page of a paged menu are hidden by design.
          if (!JSON.stringify(pref.conditions).includes('.ui.page"') &&
              !conditionsPass(pref.conditions, pref.operator || "OR")) {
            out.hiddenRows.push(`${pref.property} hidden: ${pref.operator || "OR"} ${JSON.stringify(pref.conditions)}`);
          }
        } catch (e) { out.problems.push(`${pref.property}: cannot evaluate visibility: ${strip(e)}`); }
      }
    }
    // Named explicitly: if one of these is absent the installed copy predates
    // the feature, and no amount of looking in the panel will find it.
    const EXPECT = {
      "zz-groupflow": ["zzgroup.icon-rules"],
      "zz-tab-router": ["zzrouter.media-subgroups", "zzrouter.section-icons", "zzrouter.auto-path-mode"],
    }[id];
    if (EXPECT) {
      const have = new Set(prefs.map((x) => x?.property).filter(Boolean));
      const absent = EXPECT.filter((n) => !have.has(n));
      out.featureSettings = absent.length
        ? `MISSING from the installed copy: ${absent.join(", ")}`
        : "present";
    }

    // Live state of the creator/avatar pipeline: counts only, never contents.
    try {
      if (id === "zz-tab-router" && W.TabRouter?.status) {
        const st = W.TabRouter.status();
        out.creators = { remembered: st.creatorsRemembered, sectionIcons: st.sectionIconsRemembered,
                         lookupsInFlight: st.creatorLookupsInFlight };
      }
    } catch (e) { out.problems.push(`live state: ${strip(e)}`); }

    // Sine finds a conditional row by its id or property; a separator with
    // conditions and neither makes its panel builder throw, and every row
    // after it vanishes. Checked here so it cannot recur.
    for (const pref of prefs) {
      if (pref?.type === "separator" && pref.conditions && !pref.id && !pref.property) out.problems.push(`separator "${pref.label}" has conditions: rows after it will not render`);
    }

    if (String(out.installedVersion).includes("NetworkError")) {
      out.problems.push("Sine cannot serve this mod's files: its folder is missing from chrome/sine-mods (a reinstall from the multi-mod repository can move it into another mod's folder)");
    }

    out.prefsChecked = checked;
    out.prefsNeverSet = `${unset} of ${checked} unset; behavior depends on each reader's fallback`;
    if (!out.problems.length) out.problems = "none -- every stored pref matches its declared type";
    if (!out.hiddenRows.length) out.hiddenRows = "none -- every row's condition is satisfied";
    report.mods[name] = out;
  }

  // Where Sine actually keeps the folders, and anything in the wrong place.
  // Sine installs one mod out of a multi-mod repository by moving it through
  // a fixed <sine-mods>/temp path, so two installs at once can leave a mod
  // nested inside another or stranded in temp. Sine then cannot read it
  // where it looks, which is the "failed to read preferences for mod <id>"
  // toast on every rebuild. Report only: moving folders here could steal
  // an active update's staging folder. The background guard prevents collisions.
  try {
    const dir = PathUtils.join(PathUtils.profileDir, "chrome", "sine-mods");
    const folders = [], strays = [];
    for (const p of await IOUtils.getChildren(dir)) {
      const name = PathUtils.filename(p);
      folders.push(name);
      if (name === "temp" && await IOUtils.exists(PathUtils.join(p, "theme.json"))) {
        strays.push("temp holds a mod: active or interrupted install");
      }
      let kids = [];
      try { kids = await IOUtils.getChildren(p); } catch { continue; }
      for (const k of kids) {
        if (!(await IOUtils.exists(PathUtils.join(k, "theme.json")))) continue;
        let id = "(unreadable theme.json)";
        try { id = (await IOUtils.readJSON(PathUtils.join(k, "theme.json")))?.id ?? id; } catch {}
        strays.push(`${name}/${PathUtils.filename(k)} contains mod "${id}": extraction in progress or leftover files`);
      }
    }
    report.modFolders = folders;
    report.strayFolders = strays.length ? strays : "none observed";
  } catch (e) { report.modFolders = `could not read chrome/sine-mods: ${strip(e)}`; }


  // Live state: what each mod is doing in this window right now.
  async function state(w) {
    const d = w.document, P = Services.prefs, cs = (e, p) => e ? w.getComputedStyle(e, p) : null;
    const wait = ms => new Promise(r => w.setTimeout(r, ms));
    const safeText = (n, v) => v.length < 60 && !/url|rule|alias|host|domain|site|ignore|path|list|name|title|folder|dir/i.test(n) && !/:\/\/|@|[a-z0-9-]\.[a-z]{2,}|[\\/]/i.test(v);
    const prefs = (...roots) => Object.fromEntries(roots.flatMap(r => P.getChildList(r)).sort().flatMap(n => {
      const t = P.getPrefType(n);
      if (t == 128) return [[n, P.getBoolPref(n)]];
      if (t == 64) return [[n, P.getIntPref(n)]];
      const v = t == 32 ? P.getStringPref(n) : "";
      return safeText(n, v) && !/^\{?[0-9a-f-]{36}\}?$/i.test(v) ? [[n, v]] : [];
    }));
    const box = e => { const r = e?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height].map(Math.round).join(" "); };

    await wait(3000);
    const out = {
      zen: Services.appinfo.version, os: Services.appinfo.OS, dpr: w.devicePixelRatio,
      windowActive: !d.documentElement.matches(":-moz-window-inactive"),
      reducedMotion: w.matchMedia("(prefers-reduced-motion: reduce)").matches,
      reducedTransparency: w.matchMedia("(prefers-reduced-transparency: reduce)").matches,
      compact: d.documentElement.getAttribute("zen-compact-mode"),
      sidebarExpanded: d.documentElement.getAttribute("zen-sidebar-expanded"),
      sidebarBox: box(d.getElementById("navigator-toolbox")),
    };
    out.zenPrefs = prefs("zen.view.", "zen.theme.", "zen.tabs.vertical", "zen.mediacontrols", "zen.glance.enabled", "zen.workspaces.", "browser.tabs.hoverPreview", "browser.tabs.fadeOutUnloadedTabs", "toolkit.tabbox.switchByScrolling", "ui.prefersReducedMotion");
    out.ourPrefs = prefs("zz");
    out.otherModPrefs = prefs("arc", "btr", "uc.", "mod.", "superpins", "sine.");

    // Glassflow: the blur layer behind the sidebar and the glass on overlays.
    const tb = d.getElementById("titlebar"), layer = cs(tb, "::before");
    const panel = d.querySelector("#navigator-toolbox .zen-toolbar-background, #zen-toolbar-background");
    const filter = sel => { const e = d.querySelector(sel); return e ? strip(cs(e).backdropFilter) : "absent"; };
    out.glass = {
      animating: d.getElementById("navigator-toolbox")?.getAttribute("animate"),
      layer: layer && { content: layer.content, filter: strip(layer.backdropFilter), clip: layer.clipPath, inset: [layer.top, layer.right, layer.bottom, layer.left].join(" "), padding: layer.padding, radius: layer.borderRadius },
      titlebarBox: box(tb), panel: panel && { filter: strip(cs(panel).backdropFilter), bg: cs(panel).backgroundColor, box: box(panel) },
      tokens: Object.fromEntries(["--zzg-acrylic", "--zzg-blur-size", "--zzg-blur-pad", "--zzg-panel-radius", "--arc-compact-sidebar-blur", "--zen-backdrop-underlay"].map(v => [v, cs(d.documentElement).getPropertyValue(v).trim()])),
      overlays: { media: filter("#zen-media-controls-toolbar > .zen-media-card"), urlbar: filter("#urlbar[breakout-extend] .urlbar-background"), menu: filter("menupopup"), } };

    // Mediaflow and Zen's media bar. If Zen has a playing tab but no card, it
    // is asked once to make one, to tell a missed start from a broken bar.
    const Z = w.gZenMediaController, bar = d.getElementById("zen-media-controls-toolbar"), ws = w.gZenWorkspaces?.activeWorkspace;
    const tabs = [...d.querySelectorAll(".tabbrowser-tab:not(zen-library *)")];
    const cards = () => [...(bar?.querySelectorAll(".zen-media-card") ?? [])].map(c => ({ hidden: c.hidden, hiding: c.getAttribute("zen-hiding"), playing: c.classList.contains("playing"), h: Math.round(c.getBoundingClientRect().height) }));
    const ctl = t => { try { const c = t.linkedBrowser?.browsingContext?.mediaController; return c && { active: c.isActive, playing: c.isPlaying, audible: c.isAudible, state: c.playbackState, pip: c.isBeingUsedInPIPModeOrFullscreen }; } catch (e) { return strip(e); } };
    const playing = tabs.filter(t => t.hasAttribute("soundplaying") || ctl(t)?.active);
    const pip = d.getElementById("zen-sidebar-pip-container");
    out.media = { prefs: prefs("media.mediacontrol", "media.hardwaremediakeys", "dom.media.mediasession", "media.autoplay"), zenReady: !!Z?.mediaControlBar, arcHooked: !!Z?.activateMediaControls?._arcHooked,
      bar: bar && { hidden: bar.hidden, display: cs(bar).display, opacity: cs(bar).opacity, box: box(bar), cards: cards() },
      tabs: playing.map(t => ({ sound: t.hasAttribute("soundplaying"), muted: t.hasAttribute("muted"), selected: t.selected, thisWorkspace: t.getAttribute("zen-workspace-id") == ws, inFolder: !!t.group, controller: ctl(t) })),
      mediaflow: { source: !!w.ZzMediaflowController?.getActiveBC?.(), preview: pip && { display: cs(pip).display, box: box(pip) } } };
    if (Z?.onAudioPlaybackStarted && playing.length && !cards().length) {
      for (const t of playing) Z.onAudioPlaybackStarted(t.linkedBrowser);
      await wait(1500);
      out.media.afterAskingZen = cards();
    }

    // Tab Unloader: why each loaded background tab is kept, without names.
    const T = w.TabUnloader, now = Date.now(), st = T ? T.status() : [];
    const count = a => a.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {});
    out.unloader = T ? { settings: T.settings(), anchors: Object.keys(T.anchors()).length, verdicts: count(st.map(s => s.verdict.replace(/^idle \d+s/, "idle"))),
      keptLoaded: tabs.flatMap((t, i) => t.selected || t.hasAttribute("pending") ? [] : [{ i, why: st[i]?.verdict, idle: Math.round((now - (t.lastAccessed || now)) / 1000), thisWorkspace: t.getAttribute("zen-workspace-id") == ws, essential: t.hasAttribute("zen-essential"), pinned: t.pinned, inFolder: !!t.group, sound: t.hasAttribute("soundplaying") }]),
      log: T.log().slice(-12).map(l => l.replace(/(unloaded:|failed on) .*/, "$1 <tab>")) } : "not running";

    out.tabs = { total: tabs.length, loaded: tabs.filter(t => !t.hasAttribute("pending")).length, essentials: tabs.filter(t => t.hasAttribute("zen-essential")).length, pinned: tabs.filter(t => t.pinned).length, workspaces: d.querySelectorAll("zen-workspace").length,
      folders: d.querySelectorAll("zen-folder:not(zen-library *)").length, subfolders: d.querySelectorAll("zen-folder zen-folder:not(zen-library *)").length, collapsed: d.querySelectorAll("zen-folder[collapsed]:not(zen-library *)").length, groupflowMarks: d.querySelectorAll("[class*='zzgf']").length };

    const ess = d.querySelector(".tabbrowser-tab[zen-essential='true']:not(zen-library *) .tab-icon-image");
    out.essentialIcon = ess && { transition: cs(ess).transition.slice(0, 60), scale: cs(ess).scale };
    try { out.turbo = (({ packs, unknownPrefs, hoverWarmup, warmupRequests }) => ({ packs, unknownPrefs, hoverWarmup, warmupRequests }))(w.ZenTurbo.status()); } catch {}
    try { out.downloadPrompt = (({ setting, hook }) => ({ setting, hook }))(w.DownloadPrompt.status()); } catch {}

    // Errors and warnings from mods, file names only.
    const ours = /sine|flow|unloader|router|turbo|download-prompt|zz|chrome\.css|userChrome/i;
    const errs = [];
    for (const m of Services.console.getMessageArray() ?? []) {
      if (!(m instanceof Ci.nsIScriptError) || !/^(chrome|file|resource):/.test(m.sourceName) || !ours.test(m.sourceName)) continue;
      errs.push(`${m.flags & 1 ? "warn" : "error"} ${strip(m.sourceName)}:${m.lineNumber} ${strip(m.errorMessage)}`);
    }
    try {
      for (const e of Cc["@mozilla.org/consoleAPI-storage;1"].getService(Ci.nsIConsoleAPIStorage).getEvents()) {
        if (!/^(error|warn)$/.test(e.level) || !/^(chrome|file|resource):/.test(e.filename ?? "") || !ours.test(e.filename)) continue;
        errs.push(`${e.level} ${strip(e.filename)}:${e.lineNumber} ${strip((e.arguments ?? []).map(a => a?.message ?? (typeof a === "object" ? "[object]" : a)).join(" "))}`);
      }
    } catch {}
    out.errors = [...new Set(errs)].slice(-30);
    return out;
  }
  try { report.state = await state(W); } catch (e) { report.state = "could not read: " + strip(e); }

  const text = JSON.stringify(report);
  try {
    Cc["@mozilla.org/widget/clipboardhelper;1"]
      .getService(Ci.nsIClipboardHelper).copyString(text);
    console.log(`Copied ${text.length} characters. Paste them into the chat.`);
  } catch { console.log(text); }
  return report;
})()
