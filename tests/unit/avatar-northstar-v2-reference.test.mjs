// North Star v2 is a DESIGN reference (D-124). This test exists to keep it one.
//
// It guards two things that are easy to lose by accident:
//   1. the file's identity — the exact bytes and PNG properties D-124 adopted, so a later
//      "small tidy-up" of the reference cannot silently change what new art is drawn against;
//   2. the boundary — that nothing in runtime reaches for it. The R2 stack is a separate-layer
//      system and v2 is a single flat figure with face, eyes, hair and clothing baked in; wiring
//      one to the other would not merely be wrong, it would be a different architecture.
//
// What this test deliberately does NOT do: it does not make the reference a runtime dependency.
// No page loads it, no manifest names it, and nothing here asserts that any of them should.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

const V2_REL = "assets/avatar/reference/Northstar Master v2.png";
const V2 = join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png");
const V2_BYTES = 761394;
const V2_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const MASTER_SHA_D032 = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const LAYERS = join(REPO, "js", "avatar-layers.js");
const REGISTER = join(REPO, "docs", "project-state.md");

test("the v2 design reference is exactly the file D-124 adopted", () => {
  assert.ok(existsSync(V2), "the North Star v2 reference must exist in the repository");
  const b = readFileSync(V2);
  assert.equal(b.length, V2_BYTES, "byte count changed");
  assert.equal(sha(b), V2_SHA, "the reference bytes changed — that needs a new owner decision");
});

test("it is a 1024x1536 8-bit RGBA PNG, read from the IHDR", () => {
  const b = readFileSync(V2);
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature");
  assert.equal(b.toString("ascii", 12, 16), "IHDR");
  assert.equal(b.readUInt32BE(16), 1024, "width");
  assert.equal(b.readUInt32BE(20), 1536, "height");
  assert.equal(b[24], 8, "bit depth");
  assert.equal(b[25], 6, "colour type must be 6 (truecolour + alpha)");
});

test("the old master is preserved byte-identical — D-032 is untouched", () => {
  // Every existing tool and gate hash-locks against this file. Adopting v2 must not disturb it.
  assert.ok(existsSync(MASTER), "the original master must still exist");
  assert.equal(sha(readFileSync(MASTER)), MASTER_SHA_D032, "the D-032 master changed");
});

test("no runtime file reaches for the v2 reference", () => {
  // The R2 stack is separate-layer; v2 is one flat baked figure. Loading it at runtime would not
  // be a small mistake, it would be a different architecture.
  const runtime = ["js/avatar-layers.js", "js/supabase.js", "app.js", "supabaseClient.js",
    "index.html", "hub.html", "shop.html", "avatar.html", "teacher.html", "admin.html", "login.html"];
  for (const rel of runtime) {
    const p = join(REPO, rel);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    assert.ok(!src.includes("Northstar Master v2"), rel + " references the v2 design reference");
    assert.ok(!src.includes("avatar/reference"), rel + " reaches into the reference directory");
  }
});

test("R2_MANIFEST and the resolver do not name the reference directory", () => {
  const src = readFileSync(LAYERS, "utf8");
  assert.ok(src.includes("R2_MANIFEST"), "the manifest must still live here");
  assert.ok(!src.includes("Northstar Master"), "the manifest or resolver names a reference file");
  assert.ok(!src.includes("avatar/reference"), "the manifest or resolver reaches into the reference directory");
  // Not every runtime asset lives under avatar-r2 — the C2 render path legitimately loads
  // /assets/avatar/base/*.svg. The boundary that matters is the REFERENCE directory: design
  // references are drawn against, never loaded.
  for (const m of src.matchAll(/["'`]([^"'`]*assets\/[^"'`]*)["'`]/g)) {
    assert.ok(!m[1].includes("assets/avatar/reference"),
      "a runtime asset path reaches into the reference directory: " + m[1]);
  }
});

test("D-124 is in the register once, and cites the path and the hash", () => {
  const rows = readFileSync(REGISTER, "utf8").split("\n").filter((l) => l.startsWith("| **D-124** |"));
  assert.equal(rows.length, 1, "D-124 must appear exactly once");
  const row = rows[0];
  assert.ok(row.includes(V2_REL), "D-124 must name the tracked path");
  assert.ok(row.includes(V2_SHA), "D-124 must cite the adopted hash");
  assert.ok(/DESIGN AUTHORITY ONLY|NO RUNTIME CHANGE/.test(row), "D-124 must state that it grants no runtime authority");
});

test("the design reference is not wired into the deploy by name", () => {
  // assets/ is inside the Cloudflare allowlist, so the file is COPIED into the deploy exactly as the
  // reference files already there are. D-124 section 10 states that plainly. What must not happen is
  // the build singling it out, or any page linking it.
  const build = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  assert.ok(!build.includes("Northstar Master v2"), "the build names the v2 reference explicitly");
});