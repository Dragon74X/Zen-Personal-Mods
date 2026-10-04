import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The engine half of iconflow-parts.uc.js runs without a browser; outside one
// it only publishes IconParts.
const source = await readFile(new URL("../iconflow/iconflow-parts.uc.js", import.meta.url), "utf8");
new Function(source)();
const { parsePath, writePath, linger, settle, MOTION, FRAMES } = globalThis.IconParts;

test("Paths survive the round trip, minified arcs included", () => {
  // Zen's back arrow: relative arcs, flags packed against numbers, q curves.
  const back = "M7.47 3.22a.75.75 0 1 1 1.06 1.06L4.56 8.25h10.69a.75.75 0 0 1 0 1.5H4.56l3.97 3.97a.75.75 0 1 1-1.06 1.06L2.22 9.53a.75.75 0 0 1-.165-.812l.004-.01q.018-.04.042-.078a.8.8 0 0 1 .119-.16z";
  const subs = parsePath(back);
  assert.equal(subs.length, 1);
  assert.ok(subs[0].closed);
  const again = parsePath(writePath(subs, p => p));
  assert.deepEqual(again[0].segs.map(s => s.t), subs[0].segs.map(s => s.t));
  const end = s => s.segs.at(-1).p;
  assert.ok(Math.hypot(end(again[0])[0] - end(subs[0])[0], end(again[0])[1] - end(subs[0])[1]) < 0.01);
  // A lone M with implicit lines, then H/V, S and T reflections.
  const multi = parsePath("M1 1 2 2 3 1zm2 0h2v2S8 6 9 9T12 12");
  assert.equal(multi.length, 2);
  assert.deepEqual(multi[0].segs.map(s => s.t), ["L", "L"]);
  assert.deepEqual(multi[1].start, [3, 1], "m after z is relative to the closed subpath's start");
  assert.deepEqual(multi[1].segs.at(-1).p, [12, 12]);
});

test("Timing starts at rest and lands exactly, on the Linger curve", () => {
  assert.equal(linger(0), 0);
  assert.ok(Math.abs(linger(1) - 1) < 1e-9);
  for (let i = 1; i <= 100; i++) assert.ok(linger(i / 100) >= linger((i - 1) / 100), "never runs backwards");
  assert.ok(linger(0.03) < 0.03 * 0.5, "starts from rest");
  assert.ok(linger(0.2) > 0.15, "a short wind-up: up to speed early");
  assert.equal(settle(0), 0);
  assert.equal(settle(1), 1);
  assert.ok(Math.max(...Array.from({ length: 100 }, (_, i) => settle(i / 100))) > 1.15, "overshoots before settling");
});

test("Every button Iconflow covers is a target, with a choreography or the fallback", async () => {
  const targets = source.match(/const TARGETS = \{([\s\S]*?)\n  \};/)[1];
  const keys = [...targets.matchAll(/^\s+"([^"]+)": \{ setting:/gm)].map(m => m[1]);
  assert.ok(keys.length > 50);
  const missing = keys.filter(k => !MOTION[k]);
  assert.ok(missing.length <= 3, "few buttons on the plain fallback: " + missing.join(", "));
  const css = await readFile(new URL("../iconflow/icons.css", import.meta.url), "utf8");
  const parted = css.split("Zen's own animated */").slice(1).filter(block => /\[zzicon-own\]/.test(block.split("/* ")[0]));
  assert.equal(parted.length, keys.length, "each button's Zen's own rule plays the strip once it is drawn");
  assert.equal(FRAMES, 96, "the frame counter's last frame, 95, is the strip's");
});
