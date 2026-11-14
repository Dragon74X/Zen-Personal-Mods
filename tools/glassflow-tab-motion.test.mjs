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
  const motion = css.match(/--zzg-state-motion: ([^;]+);/)[1];
  for (const name of animated) assert.match(motion, new RegExp(`${name} var\\(--zzg-motion-light\\) var\\(--zzg-motion-ease\\)`), name);
  const states = css.match(/transition: opacity var\(--zzg-motion-light\)[^;]*;/g);
  assert.equal(states.length, 4, "selected, unselected, hover and pending backgrounds");
  for (const rule of states) assert.ok(rule.includes("var(--zzg-state-motion)"), rule);
});
