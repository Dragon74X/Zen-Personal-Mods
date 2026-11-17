import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(new URL("../glassflow/userChrome.css", import.meta.url), "utf8");
const animated = ["--zzg-a", "--zzg-b", "--zzg-dir", "--zzg-spread", "--zzg-edge-top", "--zzg-edge-ring", "--zzg-edge-angle",
  "--zzg-edge-width", "--zzg-ring-width", "--zzg-state-glow", "--zzg-sheen-level"];

// Animating the state inputs on the tab restyled every element inside it on
// each frame of a selection or hover change (measured on Zen 1.24.1b: 1008
// against 664 elements styled per workspace switch). They animate on the only
// element that paints them.
test("Tab-state inputs animate on .tab-background, not on the tab", () => {
  const tab = [...css.matchAll(/\n:is\(#navigator-toolbox, \.zen-library-space-tabs\) \.tabbrowser-tab \{[^]*?\n\}/g)].map(m => m[0]).find(r => r.includes("--zzg-sheen-level: 0;"));
  assert.ok(tab, "base tab rule");
  assert.match(tab, /transition: none !important;/);
  assert.doesNotMatch(tab, /transition: --zzg/);
  assert.doesNotMatch(tab, /--zzg-state-shadow:|--zzg-state-sheen:/, "derived paint resolves where it animates");
  const bg = css.match(/\n:is\(#navigator-toolbox, \.zen-library-space-tabs\) \.tabbrowser-tab \.tab-background \{[^]*?\n\}/)[0];
  for (const name of ["--zzg-ex:", "--zzg-ey:", "--zzg-shade:", "--zzg-band:", "--zzg-state-shadow:", "--zzg-state-sheen:"]) assert.ok(bg.includes(name), name);
  assert.match(css, /\.tabbrowser-tab > \.tab-stack,\n[^{]*\.tabbrowser-tab > \.tab-stack > \.tab-background \{\n  --zzg-follow-angle: inherit;\n\}/,
    "the pointer-follow angle set on the tab still reaches the rim");
  const motion = css.match(/--zzg-state-motion: ([^;]+);/)[1];
  for (const name of animated) assert.match(motion, new RegExp(`${name} var\\(--zzg-motion-light\\) var\\(--zzg-motion-ease\\)`), name);
  const states = css.match(/transition: opacity var\(--zzg-motion-light\)[^;]*;/g);
  assert.equal(states.length, 4, "selected, unselected, hover and pending backgrounds");
  for (const rule of states) assert.ok(rule.includes("var(--zzg-state-motion)"), rule);
});

test("A loading tab, and a folder whose own page loads, carry a copy of Zen's loading indicator", () => {
  const rule = css.slice(css.indexOf(":is(#navigator-toolbox, .zen-library-space-tabs) .tabbrowser-tab:is([busy], [progress]) > .tab-stack::after"));
  const body = rule.slice(0, rule.indexOf("\n}\n"));
  assert.match(body, /tab-group, zen-folder\):has\(> \.tab-group-container > \.tabbrowser-tab\[zzgf-page-tab\]:is\(\[busy\], \[progress\]\)\)\s*> \.tab-group-label-container > \.tab-group-label::after/,
    "on a folder's header while its own page tab loads");
  // Zen's own colour and pill (zen-single-components.css #zen-loading-progress-bar).
  assert.match(body, /--zzg-loading: color-mix\(in srgb, var\(--zen-primary-color\), light-dark\(rgba\(0, 0, 0, \.5\), rgba\(255, 255, 255, \.5\)\) 70%\);/);
  assert.match(body, /border-radius: 100px;/);
  // Its pulse for three seconds, then the long-load track and sweep.
  assert.match(body, /animation: zzg-tab-loading-pulse 1s ease-in-out 3 alternate,\s*zzg-tab-loading-settle \.3s ease-out 3s forwards,\s*zzg-tab-loading-long 1s ease-in-out 3\.3s infinite;/);
  assert.match(css, /@keyframes zzg-tab-loading-pulse \{\s*from \{ transform: translateX\(-50%\) scale\(\.85\); opacity: \.6; \}\s*to \{ transform: translateX\(-50%\) scale\(\.95\); opacity: 1; \}/);
  assert.match(css, /@keyframes zzg-tab-loading-settle \{\s*to \{ background-color: light-dark\(rgba\(0, 0, 0, \.1\), rgba\(255, 255, 255, \.1\)\); \}/);
  assert.match(css, /@keyframes zzg-tab-loading-long \{\s*from \{ background-position: -400% 0; \}\s*to \{ background-position: 400% 0; \}/);
  assert.match(body, /pointer-events: none;/);
  assert.match(body, /@media \(prefers-reduced-motion: reduce\) \{\s*animation: none;/, "still with reduced motion");
});
