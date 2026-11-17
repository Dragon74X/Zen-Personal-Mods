import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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

test("A loading tab, and a folder whose own page loads, carry Blended Addressbar's glow bar as a light passing through", () => {
  const at = css.indexOf("/* Blended Addressbar's \"glow\" loading bar");
  const block = css.slice(at, css.indexOf("@keyframes zzg-loadbar-breathe", at));
  assert.ok(at > 0, "drawn by Glassflow");
  // Its own colour and glow strengths, with its defaults without it.
  assert.match(block, /--zzg-glow-color: var\(--blended-addressbar-dynamic-loadbar-color, var\(--zen-primary-color\)\);/);
  assert.match(block, /--zzg-glow-strong: var\(--blended-addressbar-loadbar-glow-strong-mix, 34%\);/);
  // The head runs from beyond the left edge (0) to beyond the right, tail and all (1); the tab masks both.
  assert.match(block, /--zzg-head: calc\(-1 \* var\(--zzg-lead\)\s*\+ clamp\(0, \(var\(--zzg-load-p, 0\) - \.08\) \/ \.87, 1\) \* \(100% \+ var\(--zzg-lead\)\)\s*\+ max\(0, var\(--zzg-load-p, 0\) - \.95\) \* 20 \* \(var\(--zzg-tail\) \+ var\(--zzg-lead\)\)\);/,
    "from off the left edge as a load starts, across with it, and out past the right, tail and all, only once done");
  assert.match(block, /overflow: hidden;/);
  assert.match(block, /left: calc\(var\(--zzg-head\) - var\(--zzg-tail\)\);\s*width: var\(--zzg-tail\);/, "the line ends at the head");
  assert.match(block, /left: calc\(var\(--zzg-head\) - 150px\);\s*width: 300px;/, "the glow is centred on the head");
  // Its layers (styles/loadbar.css, glow mode): the head's glow and core, a tail into a whitened head, breathing.
  assert.match(block, /radial-gradient\(ellipse 14px 7px at 150px 100%,/);
  assert.match(block, /radial-gradient\(ellipse 150px 32px at 150px 100%,/);
  assert.match(block, /transparent,\s*color-mix\(in srgb, var\(--zzg-glow-color\) 55%, transparent\) 35%,\s*var\(--zzg-glow-color\) 85%,\s*color-mix\(in srgb, var\(--zzg-glow-color\) 25%, white\)\);/);
  assert.match(block, /animation: zzg-loadbar-breathe 1\.8s ease-in-out infinite alternate;/);
  assert.match(block, /transition: left \.3s ease-out;/);
});

test("Each tab's load moves as Blended Addressbar's does: 8% to start, creeping to 90%, real progress to 95%, then the end", () => {
  const js = readFileSync(new URL("../glassflow/glassflow.uc.js", import.meta.url), "utf8");
  const fn = js.slice(js.indexOf("  function tabLoading() {"), js.indexOf("  function start() {"));
  assert.match(fn, /progress: 0\.08, loading: true, hideAt: 0/);
  assert.match(fn, /Math\.min\(0\.95, Math\.max\(0, fraction\)\) : load\.progress \+ Math\.max\(0, 0\.9 - load\.progress\) \* 0\.08/);
  assert.match(fn, /progress: 1, loading: false, hideAt: Date\.now\(\) \+ 450/);
  assert.match(fn, /setInterval\(tick, 250\)/);
  assert.match(fn, /bar\.style\.setProperty\("--zzg-load-p", load\.progress\.toFixed\(4\)\)/, "the head's place, 0 to 1");
  assert.match(fn, /tab\.hasAttribute\("zzgf-page-tab"\) && tab\.group\?\.querySelector\(":scope > \.tab-group-label-container"\)/, "a folder's header for its own page");
});
