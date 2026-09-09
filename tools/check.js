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
    ["zz-glassflow",    "Glassflow",    null],
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

  const report = { window: W?.location?.href, mods: {} };

  for (const [id, name, global] of MODS) {
    const out = { script: "(defines no global)", problems: [], hiddenRows: [] };

    if (global) {
      out.script = typeof W[global] === "object" ? "alive" : "NOT RUNNING";
    }
    const gen = W[{ "zz-glassflow":"__zzglassInstance", "zz-groupflow":"__zzgroupInstance",
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

      // A row whose condition names a pref that is unset, or set against it,
      // will not be shown in the settings panel.
      for (const cond of [].concat(pref.conditions ?? [])) {
        const c = cond?.if ?? cond?.not;
        if (!c?.property) continue;
        const dep = read(c.property);
        const fails = dep.type === "unset"
          ? c.value === true || (typeof c.value === "number" && c.value !== 0)
          : cond.if ? dep.value !== c.value : dep.value === c.value;
        if (fails) {
          out.hiddenRows.push(
            `${pref.property} hidden: needs ${c.property}` +
            `=${JSON.stringify(c.value)}, ` +
            (dep.type === "unset" ? "but it has never been set (default not applied)"
                                  : `but it is ${JSON.stringify(dep.value)}`));
        }
      }
    }
    // Named explicitly: if one of these is absent the installed copy predates
    // the feature, and no amount of looking in the panel will find it.
    const EXPECT = {
      "zz-groupflow": ["zzgroup.icon-rules"],
      "zz-tab-router": ["zzrouter.media-subgroups", "zzrouter.section-icons"],
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
      if (id === "zz-groupflow" && W.Groupflow?.explain) {
        const tally = {};
        for (const row of W.Groupflow.explain()) tally[row.from ?? "(pre-1.37)"] = (tally[row.from ?? "(pre-1.37)"] || 0) + 1;
        out.iconSources = tally;
      }
    } catch (e) { out.problems.push(`live state: ${e}`); }

    out.prefsChecked = checked;
    out.prefsNeverSet = `${unset} of ${checked} still on their declared default`;
    if (!out.problems.length) out.problems = "none -- every stored pref matches its declared type";
    if (!out.hiddenRows.length) out.hiddenRows = "none -- every row's condition is satisfied";
    report.mods[name] = out;
  }

  const text = JSON.stringify(report, null, 2);
  console.log(text);
  try {
    Cc["@mozilla.org/widget/clipboardhelper;1"]
      .getService(Ci.nsIClipboardHelper).copyString(text);
    console.log("(copied to clipboard)");
  } catch {}
  return report;
})()
