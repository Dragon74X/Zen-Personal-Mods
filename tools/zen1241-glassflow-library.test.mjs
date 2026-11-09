// Glassflow Library's Space cards against Zen 1.24b/1.24.1b's card structure.
// Source-level checks run everywhere. With ZEN_BINARY (and an X display, e.g.
// xvfb-run) the native probe measures every card setting in a disposable
// profile. With ZEN_UPSTREAM_SOURCE pointing at a Zen git checkout that has
// the release tags, the structure these rules target is read from Zen itself.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const css = readFileSync(new URL("glassflow-library/userChrome.css", root), "utf8");
const cards = css.slice(0, css.indexOf("   Floating Library."));
const prefs = JSON.parse(readFileSync(new URL("glassflow-library/preferences.json", root), "utf8"));
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, "");
const code = strip(cards);

// The body of the first rule whose selector line ends with `selector {`.
function block(source, selector) {
  const start = source.indexOf(selector + " {");
  assert.ok(start >= 0, `missing rule ${selector}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(source.indexOf("{", start) + 1, i);
  }
  throw new Error(`unclosed rule ${selector}`);
}
const own = body => body.replace(/\{[^{}]*\}/g, "{}"); // drop nested rules' bodies

// Specificity of a plain compound/complex selector (no :is/:where/:not).
function specificity(selector) {
  const s = selector.replace(/\[[^\]]*\]/g, " .attr ");
  return [(s.match(/#[\w-]+/g) || []).length,
    (s.match(/\.[\w-]+|:(?!:)[\w-]+/g) || []).length,
    (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length];
}
const beats = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

test("cards no longer depend on Zen 1.23's card gradient variable", () => {
  assert.doesNotMatch(css, /--zen-library-space-gradient/, "Zen 1.24 removed it; an undefined var() voids the whole background declaration");
  assert.doesNotMatch(code, /\.zen-library-space::before\s*\{[^}]*opacity/, "gradient strength must not target the card's own ::before");
  assert.match(cards, /Zen 1\.24b and later/);
});

test("gradient strength, radius, base, tint, blur and shadow are retargeted to Zen's background child", () => {
  const card = block(code, "zen-library .zen-library-space");
  const child = block(card, "& > .zen-library-space-background.zen-browser-generic-background");
  for (const declaration of [
    "opacity: var(--zzlib-card-gradient, 1) !important",
    "border-radius: inherit !important",
    "background: none !important",
    "backdrop-filter: none !important",
    "box-shadow: none !important",
    "z-index: -2 !important",
  ]) assert.ok(own(child).includes(declaration + ";"), `background child lacks ${declaration}`);
  assert.match(child, /&::before, &::after \{ border-radius: inherit !important; \}/, "Zen's compact outline follows the card radius");
  assert.match(own(card), /background: color-mix\(in srgb, var\(--zen-branding-bg\) var\(--zzlib-card-fill, 70%\), transparent\) !important;/);
  assert.match(own(card), /border-radius: var\(--zzlib-card-radius, 14px\) !important;/);
});

test("the card's ::before carries Zen's shadow and the sheen above the gradient", () => {
  const card = block(code, "zen-library .zen-library-space");
  const before = block(card, "&::before");
  for (const declaration of ['content: ""', "position: absolute", "inset: 0", "z-index: -1", "border-radius: inherit",
    "pointer-events: none", "box-shadow: 0 0 10px rgb(0 0 0 / 0.1)", "transition: box-shadow 0.2s ease"])
    assert.ok(before.includes(declaration + ";"), `::before lacks ${declaration}`);
  assert.match(card, /&\[dragging\]::before \{ box-shadow: 0 8px 16px rgb\(0 0 0 \/ 0\.3\); \}/, "Zen's lifted drag shadow");
  const shadowOff = block(code, '@media not (-moz-pref("zzlib.card.shadow"))');
  assert.match(shadowOff, /zen-library \.zen-library-space::before \{ box-shadow: none !important; \}/);
  const sheen = block(code, '@media (-moz-pref("zzlib.card.sheen"))');
  assert.match(sheen, /zen-library \.zen-library-space::before \{\s*background: var\(--zzg-sheen, linear-gradient\(/);
  assert.equal((sheen.match(/var\(/g) || []).length, 1, "the sheen needs nothing that can be undefined");
});

test("the rim stays on ::after and replaces Zen's compact outline", () => {
  const rim = block(code, '@media (-moz-pref("zzlib.card.rim"))');
  assert.match(rim, /zen-library \.zen-library-space::after \{[^}]*content: "";[^}]*z-index: 1;[^}]*pointer-events: none;/);
  assert.match(rim, /zen-library \.zen-library-space > \.zen-library-space-background::before,\s*zen-library \.zen-library-space > \.zen-library-space-background::after \{ outline: none !important; \}/);
});

test("Glassflow tokens keep their fallbacks in the card rules", () => {
  const tokens = [...code.matchAll(/var\((--zzg-[\w-]+)(\s*,)?/g)];
  assert.ok(tokens.length >= 6);
  for (const [whole, name, comma] of tokens) assert.ok(comma, `${name} has no fallback: ${whole}`);
});

test("the card child rule outranks Glassflow's acrylic on every compact toolbar background", () => {
  const glassflow = strip(readFileSync(new URL("glassflow/userChrome.css", root), "utf8"));
  const theirs = ':root[zen-compact-mode="true"] .zen-toolbar-background';
  assert.ok(glassflow.includes(theirs + " {\n    backdrop-filter: var(--zzg-acrylic) !important;"), "Glassflow's selector changed; recheck the card override");
  block(block(code, "zen-library .zen-library-space"), "& > .zen-library-space-background.zen-browser-generic-background");
  const ours = "zen-library .zen-library-space > .zen-library-space-background.zen-browser-generic-background"; // the nested rule, resolved
  assert.deepEqual(specificity(ours), [0, 3, 1]);
  assert.deepEqual(specificity(theirs), [0, 3, 0]);
  assert.ok(beats(specificity(ours), specificity(theirs)) > 0);
});

test("the accessibility fallback still owns the card", () => {
  const a11y = block(code, "@media (prefers-reduced-transparency: reduce), (forced-colors), (prefers-contrast)");
  assert.match(a11y, /zen-library \.zen-library-space, zen-library\[zzlib-float\] \{\s*background: Canvas !important;\s*color: CanvasText !important;/);
  assert.match(a11y, /zen-library \.zen-library-space::before,\s*zen-library \.zen-library-space::after,\s*zen-library \.zen-library-space-background \{ display: none !important; \}/);
});

test("every card setting is consumed by the card rules, with unchanged defaults", () => {
  const defaults = Object.fromEntries(prefs.filter(p => p.property?.startsWith("zzlib.card.")).map(p => [p.property, p.defaultValue]));
  assert.deepEqual(defaults, {
    "zzlib.card.fill": "70%", "zzlib.card.gradient": "1", "zzlib.card.rim": true, "zzlib.card.sheen": false,
    "zzlib.card.shadow": true, "zzlib.card.radius": "14px", "zzlib.card.width": "242px", "zzlib.card.gap": "24px",
    "zzlib.card.title-size": "13px",
  });
  for (const name of Object.keys(defaults)) {
    const leaf = name.slice("zzlib.card.".length);
    const used = typeof defaults[name] === "boolean" ? code.includes(`-moz-pref("${name}")`) : code.includes(`var(--zzlib-card-${leaf},`);
    assert.ok(used, `${name} is not read by the card rules`);
  }
});

const upstream = process.env.ZEN_UPSTREAM_SOURCE;
test("Zen 1.24b and 1.24.1b paint cards through the generic background child", { skip: !upstream }, () => {
  const show = (tag, path) => execFileSync("git", ["-C", upstream, "show", `${tag}:${path}`], { encoding: "utf8", maxBuffer: 2e7 });
  assert.match(show("1.23b", "src/zen/library/zen-library.css"), /background: var\(--zen-library-space-gradient\)/);
  for (const tag of ["1.24b", "1.24.1b"]) {
    const library = show(tag, "src/zen/library/zen-library.css");
    assert.doesNotMatch(library, /--zen-library-space-gradient/, tag);
    assert.match(library, /& > \.zen-library-space-background \{[^}]*z-index: -1;[^}]*border-radius: 14px;[^}]*box-shadow: 0 0 10px rgba\(0, 0, 0, 0\.1\);/, tag);
    const section = show(tag, "src/zen/library/sections/ZenLibrarySpacesSection.mjs");
    assert.match(section, /class="zen-library-space-background zen-browser-generic-background \$\{gZenCompactModeManager\.preference \? "zen-toolbar-background" : ""\}"/, tag);
    const compact = show(tag, "src/zen/compact-mode/zen-compact-mode.css");
    assert.match(compact, /\.zen-library-space\) \.zen-toolbar-background:not\(:-moz-window-inactive\)/, tag);
  }
  assert.match(show("1.24.1b", "src/zen/compact-mode/zen-compact-mode.css"), /background: light-dark\(rgb\(233 233 233 \/ 80%\), rgb\(19 19 19 \/ 80%\)\);/);
});

test("native card settings in a disposable profile", { skip: !process.env.ZEN_BINARY, timeout: 600000 }, () => {
  const output = process.env.ZEN_LIBRARY_CARDS_OUTPUT || mkdtempSync(join(tmpdir(), "zen1241-glassflow-library-"));
  console.log(execFileSync("python3", [new URL("tools/zen1241-glassflow-library-cards.py", root).pathname,
    "--zen", process.env.ZEN_BINARY, "--output", output, "--check", ...(process.env.DISPLAY ? [] : ["--headless"])],
  { timeout: 590000, encoding: "utf8", maxBuffer: 2e7 }));
});
