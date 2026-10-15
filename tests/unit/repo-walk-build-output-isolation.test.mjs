// Test isolation: unit tests that WALK the repository must not walk the generated Cloudflare build output.
//
// cloudflare-static-build.test.mjs deletes and rebuilds dist-cloudflare/ when it loads. node --test runs test files in
// parallel, so a test that walks the repository root at the same moment can read a directory listing and then fail to
// stat a file the build has just removed (ENOENT). This was observed in the full unit suite for the D-154 test
// ("R3 stays default OFF"), whose walk was copied verbatim into seven R3 tests. dist-cloudflare/ is a gitignored,
// generated copy of allowlisted sources that those walks already read, so skipping it removes the race without losing
// coverage. This guard keeps every such walk from reintroducing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, "..", "..");
const BUILD_DIR = (readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8").match(/export const OUT_DIR_NAME = "([^"]+)"/) || [])[1];
/** Every skip list of a recursive walk that starts at the repository root and skips node_modules and .git. */
const ROOT_WALK_SKIP_LIST = /const walk = \(dir\) => \{ for \(const n of readdirSync\(dir\)\)[^\n]*?if \(!(\[[^\]]*"node_modules", "\.git"[^\]]*\])\.includes\(n\)\)/g;

test("the Cloudflare build output directory is still dist-cloudflare", () => {
  assert.equal(BUILD_DIR, "dist-cloudflare");
});

test("every repository walk of this shape in the unit tests skips the generated build output", () => {
  const found = [];
  const self = "repo-walk-build-output-isolation.test.mjs";   // holds the negative-control sample below, not a walk
  for (const f of readdirSync(HERE).filter((n) => n.endsWith(".test.mjs") && n !== self).sort()) {
    for (const m of readFileSync(join(HERE, f), "utf8").matchAll(ROOT_WALK_SKIP_LIST)) found.push({ f, skip: JSON.parse(m[1]) });
  }
  assert.ok(found.length >= 7, "non-vacuity: the seven R3 repository walks are found (" + found.length + ")");
  const missing = found.filter((w) => !w.skip.includes(BUILD_DIR)).map((w) => w.f);
  assert.deepEqual(missing, [], "these walks read the build output that cloudflare-static-build.test.mjs rebuilds in parallel");
});

test("negative control: the pattern finds a walk that does not skip the build output", () => {
  const sample = '  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools"].includes(n)) walk(p); } } };';
  const m = [...sample.matchAll(ROOT_WALK_SKIP_LIST)];
  assert.equal(m.length, 1);
  assert.ok(!JSON.parse(m[0][1]).includes("dist-cloudflare"));
});
