// Zen 1.24.1b checks for Groupflow's saved-gradient headers, run on the
// production source. The 1.24.1b values are getGradient() output from the
// Linux build (light theme, opaque window): the two-colour value is rebuilt
// byte for byte, and the three-colour value keeps one real overlay strip.
// Native Essentials/restart coverage is tools/zen1241-groupflow-smoke.py;
// the native header paint is covered by zen-routing-smoke.py's saved-gradient tint.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../groupflow/groupflow.uc.js", import.meta.url), "utf8");

// getGradient([#336699, #993366], opacity 0.6).
const TWO_STOPS = [[158, 182, 207], [168, 180, 204], [175, 178, 201], [182, 176, 198], [187, 174, 195], [192, 171, 192],
  [197, 168, 189], [201, 164, 186], [206, 159, 183], [207, 158, 182], [207, 158, 182], [207, 158, 182]];
const TWO = "linear-gradient(var(--zen-gradient-base-angle), " + TWO_STOPS.map((rgb, i) =>
  `rgb(${rgb.join(", ")}) calc(var(--zen-gradient-base-start) + ${i / 11} * var(--zen-gradient-base-span))`).join(", ") +
  ") 0 0 / 100% 100% no-repeat";
// Strip 32 of the 64 overlay strips Zen draws for a third colour, above the base layer.
const strip = n => "linear-gradient(180deg, transparent 0%, rgba(86.12, 201.92, 102.54, 0.0818) 9.1%, rgba(87.38, 199.23, 100.57, 0.1636) 18.2%, " +
  "rgba(88.35, 196.62, 98.63, 0.2455) 27.3%, rgba(89.03, 194.06, 96.71, 0.3273) 36.4%, rgba(89.36, 191.52, 94.84, 0.4091) 45.5%, " +
  "rgba(89.30, 188.98, 93.01, 0.4909) 54.5%, rgba(88.76, 186.40, 91.24, 0.5727) 63.6%, rgba(87.63, 183.77, 89.52, 0.6545) 72.7%, " +
  "rgba(85.70, 181.07, 87.89, 0.7364) 81.8%, rgba(82.63, 178.25, 86.36, 0.8182) 90.9%, rgba(77.68, 175.29, 84.94, 0.9000) 100.0%) " +
  `calc(${n} * round(up, var(--zen-gradient-width) / 64, 1px)) 0 / round(up, var(--zen-gradient-width) / 64, 1px) 100% no-repeat`;
const OLDER = ["linear-gradient(-30deg, #336699 0%, #993366 100%)", "linear-gradient(-5deg, rgba(80, 176, 97, 1) 10%, transparent 80%), " +
  "radial-gradient(circle at 95% 0%, rgba(170, 89, 130, 1) 0%, transparent 75%), radial-gradient(circle at 0% 0%, rgba(89, 130, 171, 1) 10%, transparent 70%)"];

// Gecko rejects a background-image with var() left in it or a layer position/size.
const supports = (property, value) => property === "background-image" && !/var\(|no-repeat|\//.test(value) &&
  /^(?:linear|radial)-gradient\(.*\)$/.test(value);
const marker = "  // ---- declared defaults";
assert.ok(source.includes(marker));
const sandbox = vm.createContext({ console, window: {}, CSS: { supports } });
vm.runInContext(source.replace(marker, `  globalThis.headerGradient = headerGradient; return;\n${marker}`), sandbox);
const { headerGradient } = sandbox;
const colours = value => value.match(/rgba?\([^()]*\)/g);

test("a saved two-colour Zen 1.24.1b gradient is laid across the header with every stop", () => {
  assert.equal(supports("background-image", TWO), false, "Zen's raw value cannot paint a header");
  const result = headerGradient(TWO);
  assert.equal(supports("background-image", result), true);
  assert.match(result, /^linear-gradient\(90deg, rgb\(158, 182, 207\) 0%, rgb\(168, 180, 204\) 9\.091%, /);
  assert.match(result, /, rgb\(207, 158, 182\) 100%\)$/);
  assert.deepEqual(colours(result), colours(TWO));
});

test("a three-colour Zen 1.24.1b gradient keeps the base and the middle overlay strip", () => {
  const result = headerGradient([strip(0), strip(32), strip(63), TWO].join(", "));
  assert.equal(result, `${strip(32).replace(/\) calc\(32 .*$/, ")")}, ${headerGradient(TWO)}`);
  assert.equal(supports("background-image", result), true);
});

test("older and unknown values pass through or are dropped, and the saved path uses the conversion", () => {
  for (const value of OLDER) assert.equal(headerGradient(value), value);
  assert.equal(headerGradient("rgb(75, 120, 165)"), "rgb(75, 120, 165)");
  assert.equal(headerGradient(undefined), undefined);
  assert.equal(headerGradient("radial-gradient(var(--zen-gradient-base-angle), red 0%) 0 0 / 100% 100% no-repeat"), "");
  assert.equal(headerGradient("linear-gradient(var(--zen-gradient-other), red 0%, blue 100%)"), "");
  assert.equal(source.match(/picker\.getGradient\(saved\.gradientColors\)/g)?.length, 1);
  assert.match(source, /value = headerGradient\(picker\.getGradient\(saved\.gradientColors\)\);/);
  assert.doesNotMatch(source, /toolbarColor|getToolbarColor|blendWithWhiteOverlay/i, "fields Zen 1.24.1b removed");
});

// Needs MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 and a Zen build; about 20 seconds.
test("native Essentials from nested folders across restarts and a second window",
  { skip: !process.env.ZEN_BINARY, timeout: 400000 }, () => {
    const smoke = new URL("./zen1241-groupflow-smoke.py", import.meta.url).pathname;
    console.log(execFileSync("python3", [smoke, "--zen", process.env.ZEN_BINARY],
      { timeout: 390000, encoding: "utf8", maxBuffer: 4e6 }).slice(-2000));
  });
