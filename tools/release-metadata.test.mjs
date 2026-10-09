import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("every mod supplies the explicit release timestamp Sine uses for updates", async () => {
  for (const mod of ["download-prompt", "glassflow", "glassflow-library", "groupflow", "iconflow", "tab-router", "tab-unloader", "zen-turbo", "mediaflow", "peekflow"]) {
    const theme = JSON.parse(await readFile(new URL(`../${mod}/theme.json`, import.meta.url), "utf8"));
    assert.match(theme.updatedAt ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, mod);
    assert.equal(new Date(theme.updatedAt).toISOString(), theme.updatedAt.replace("Z", ".000Z"), mod);
  }
});

test("the old zenslop folder forwards installs to Mediaflow", async () => {
  const read = path => readFile(new URL(`../${path}/theme.json`, import.meta.url), "utf8");
  // An installed zz-zenslop reads this file, sees a newer release, and takes
  // its homepage, files and settings from mediaflow while keeping its id.
  assert.equal(await read("zenslop"), await read("mediaflow"));
  assert.match(JSON.parse(await read("zenslop")).homepage, /\/tree\/main\/mediaflow$/);
});

test("Mediaflow actor module cache keys match its release", async () => {
  const theme = JSON.parse(await readFile(new URL("../mediaflow/theme.json", import.meta.url), "utf8"));
  const source = await readFile(new URL("../mediaflow/mediaflow.uc.js", import.meta.url), "utf8");
  assert.equal(source.match(/const ACTOR_VERSION = "([^"]+)"/)?.[1], theme.version);
  for (const actor of ["parent", "content"]) {
    assert.ok(source.includes(`${actor}-actor.sys.mjs?v=\${ACTOR_VERSION}`), actor);
  }
});
