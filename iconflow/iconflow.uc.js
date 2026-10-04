// ==UserScript==
// @name           Iconflow
// @description    Writes Iconflow's preference variables and defaults; carries over Glassflow's Library button settings.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  // Sine can inject a second copy on a rebuild; retire the first.
  const INSTANCE_KEY = "__zziconInstance";
  const previous = window[INSTANCE_KEY];
  try { previous?.retire?.(); } catch {}
  const instance = { generation: (previous?.generation | 0) + 1, retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzicon.";
  const MOD_ID = "zz-iconflow";
  const root = document.documentElement;

  // Strings and ints become --zzlib-foo-bar on the root, as Sine names them,
  // written now rather than after Sine's async read. Booleans are read with
  // -moz-pref() and never written; reading one as a string would log an error.
  function write(full) {
    const P = Services.prefs, name = "--" + full.replace(/\./g, "-");
    let value = null;
    try {
      const type = P.getPrefType(full);
      if (type === P.PREF_STRING) value = P.getStringPref(full) || null;
      else if (type === P.PREF_INT) value = String(P.getIntPref(full));
    } catch {}
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
  const writeAll = () => {
    try { for (const leaf of Services.prefs.getBranch(PREFIX).getChildList("")) write(PREFIX + leaf); } catch {}
  };

  // Sine writes declared defaults only once its settings page is opened, so a
  // default-on checkbox would read as off until then. Write each unset one.
  async function seedDefaults() {
    const res = await fetch(`chrome://sine/content/${MOD_ID}/preferences.json`);
    const S = Services.prefs;
    for (const { property: name, defaultValue: value } of await res.json()) {
      if (!name?.startsWith(PREFIX) || value == null || S.getPrefType(name) !== S.PREF_INVALID) continue;
      if (typeof value === "boolean") S.setBoolPref(name, value);
      else if (typeof value === "number") S.setIntPref(name, value);
      else S.setStringPref(name, String(value));
    }
  }

  // Glassflow's Library button settings moved here; carry them over once.
  for (const [from, to] of [["zzglass.sidebar.library-style", "zzicon.library.style"], ["zzglass.sidebar.library-size", "zzicon.library.size"]]) {
    try {
      const S = Services.prefs;
      if (!S.prefHasUserValue(from) || S.prefHasUserValue(to)) continue;
      if (S.getPrefType(from) === S.PREF_BOOL) S.setBoolPref(to, S.getBoolPref(from));
      else S.setIntPref(to, S.getIntPref(from));
    } catch {}
  }

  const observer = { observe(_s, _t, data) { if (data?.startsWith(PREFIX)) write(data); } };
  writeAll();
  seedDefaults().catch(() => {});
  Services.prefs.addObserver(PREFIX, observer);
  const cleanup = () => {
    try { Services.prefs.removeObserver(PREFIX, observer); } catch {}
    if (window[INSTANCE_KEY] === instance) delete window[INSTANCE_KEY];
  };
  instance.retire = cleanup;
  window.addEventListener("unload", cleanup, { once: true });
})();
