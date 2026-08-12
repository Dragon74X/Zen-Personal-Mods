// ==UserScript==
// @name           Glassflow
// @description    Writes Glassflow's preference variables at startup.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const PREFIX = "zzglass.";

  // ---- pref variables at startup -----------------------------------------
  // Sine injects string and number prefs as CSS variables, but not until
  // something (the settings page, a mod reload) triggers it -- measured on a
  // fresh launch, every one of them was absent while the sheet itself was
  // loaded and working. So the CSS ran on its fallbacks and configured
  // values only appeared after a reload. These are written here instead,
  // from the prefs themselves, so they exist before first paint.
  //
  // Naming matches Sine's own convention exactly: PREFIX.foo-bar becomes
  // --PREFIX-foo-bar, dots to dashes. Booleans are skipped -- those are read
  // with -moz-pref(), never as variables.
  function injectPrefVars() {
    let names = [];
    try { names = Services.prefs.getBranch(PREFIX).getChildList(""); } catch { return; }
    const root = document.documentElement;
    for (const leaf of names) {
      const full = PREFIX + leaf;
      let value = null;
      // getPrefType constants are not reliable on a branch object, so the
      // type is discovered by attempting each read.
      try { value = Services.prefs.getStringPref(full); } catch {}
      if (value === null) {
        try { value = String(Services.prefs.getIntPref(full)); } catch {}
      }
      if (value === null || value === "") continue;   // empty would invalidate
      root.style.setProperty("--" + (PREFIX + leaf).replace(/\./g, "-").replace(/-$/, ""), value);
    }
  }

  const prefVarObserver = {
    observe(_s, _t, data) {
      if (!data || !data.startsWith(PREFIX)) return;
      let value = null;
      try { value = Services.prefs.getStringPref(data); } catch {}
      if (value === null) { try { value = String(Services.prefs.getIntPref(data)); } catch {} }
      const name = "--" + data.replace(/\./g, "-");
      if (value === null || value === "") document.documentElement.style.removeProperty(name);
      else document.documentElement.style.setProperty(name, value);
    },
  };

  function start() {
    injectPrefVars();
    Services.prefs.addObserver(PREFIX, prefVarObserver);
    window.addEventListener("unload", () => {
      try { Services.prefs.removeObserver(PREFIX, prefVarObserver); } catch {}
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
