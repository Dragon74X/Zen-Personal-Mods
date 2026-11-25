import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Design resources: every Iconflow action has a glyph, every icon x style cycle returns to rest, generated files are current.
test("animated icon resources build check", () => {
  const out = execFileSync(process.execPath, ["resources/animated-icons/build.cjs", "--check"], { encoding: "utf8" });
  assert.match(out, /every cycle returns to rest/);
});
