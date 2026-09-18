// Zen Personal Mods -- settings and health check.
//
// Paste into the Browser Console (Ctrl+Shift+J). Reads only; copies its
// report to the clipboard.
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

  const MODS = [
    ["zz-download-prompt", "Download Prompt", "DownloadPrompt"],
    ["zz-glassflow", "Glassflow", "Glassflow"],
    ["zz-groupflow",    "Groupflow",    "Groupflow"],
    ["zz-tab-router",   "Tab Router",   "TabRouter"],
    ["zz-tab-unloader", "Tab Unloader", "TabUnloader"],
    ["zz-zen-turbo",    "Zen Turbo",    "ZenTurbo"],
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
    } catch (e) { return { type: t, value: "ERROR " + e }; }
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

  const report = { window: W?.location?.href, mods: {} };
  try {
    const manager = ChromeUtils.importESModule(
      "chrome://userscripts/content/core/manager.sys.mjs").default;
    report.sineUpdateGuard = manager.__zenPersonalModsUpdateGuardV1 === true
      ? "active (session-scoped)" : "not active (restart, or engine no longer matches)";
  } catch (e) { report.sineUpdateGuard = "could not inspect: " + e; }

  for (const [id, name, global] of MODS) {
    const out = { script: "(defines no global)", problems: [], hiddenRows: [] };

    if (global) {
      out.script = typeof W[global] === "object" ? "alive" : "NOT RUNNING";
    }
    const gen = W[{ "zz-download-prompt":"__zzdlInstance",
                    "zz-glassflow":"__zzglassInstance", "zz-groupflow":"__zzgroupInstance",
                    "zz-tab-router":"__zzrouterInstance", "zz-tab-unloader":"__zzunloadInstance",
                    "zz-zen-turbo":"__zzturboInstance" }[id]];
    out.injected = gen ? `yes (generation ${gen.generation})` : "no marker -- old version or never injected";

    // The version actually on disk. Settings that exist in the repository but
    // not here mean Sine has not pulled the update -- which looks exactly like
    // a broken feature, and is the first thing to rule out.
    try {
      const t = await fetch(`chrome://sine/content/${id}/theme.json`);
      out.installedVersion = (await t.json())?.version ?? "(none)";
    } catch (e) { out.installedVersion = "could not read theme.json: " + e; }

    let prefs = null;
    try {
      const res = await fetch(`chrome://sine/content/${id}/preferences.json`);
      const json = await res.json();
      prefs = Array.isArray(json) ? json : (json.preferences ?? []);
    } catch (e) {
      out.problems.push(`could not read preferences.json: ${e}`);
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
          `wants ${want}, stored as ${got.type} (${JSON.stringify(got.value)})`);
      }

      if (pref.conditions) {
        try {
          if (!conditionsPass(pref.conditions, pref.operator || "OR")) {
            out.hiddenRows.push(`${pref.property} hidden: ${pref.operator || "OR"} ${JSON.stringify(pref.conditions)}`);
          }
        } catch (e) { out.problems.push(`${pref.property}: cannot evaluate visibility: ${e}`); }
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
      if (id === "zz-glassflow" && W.Glassflow?.native?.status) {
        out.nativeBlur = W.Glassflow.native.status();
        out.sampledBlur = W.Glassflow.sample.status();
      }
      if (id === "zz-tab-router" && W.TabRouter?.status) {
        const st = W.TabRouter.status();
        out.creators = { remembered: st.creatorsRemembered, sectionIcons: st.sectionIconsRemembered,
                         lookupsInFlight: st.creatorLookupsInFlight };
      }
      if (id === "zz-groupflow" && W.Groupflow?.explain) {
        const tally = {};
        for (const row of W.Groupflow.explain()) tally[row.from ?? "(pre-1.37)"] = (tally[row.from ?? "(pre-1.37)"] || 0) + 1;
        out.iconSources = tally;
      }
    } catch (e) { out.problems.push(`live state: ${e}`); }

    // A separator carrying conditions makes Sine's panel builder throw on
    // it, and every row after it vanishes. Checked here so it cannot recur.
    for (const pref of prefs) {
      if (pref?.type === "separator" && pref.conditions) out.problems.push(`separator "${pref.label}" has conditions: rows after it will not render`);
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
  } catch (e) { report.modFolders = `could not read chrome/sine-mods: ${e}`; }

  const text = JSON.stringify(report, null, 2);
  console.log(text);
  try {
    Cc["@mozilla.org/widget/clipboardhelper;1"]
      .getService(Ci.nsIClipboardHelper).copyString(text);
    console.log("(copied to clipboard)");
  } catch {}
  return report;
})()
