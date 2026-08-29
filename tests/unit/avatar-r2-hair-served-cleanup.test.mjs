// The served-scale cleanup pass. Its whole claim is that it applies the EXISTING rule to a
// different grid — so most of these tests are about what it does NOT do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { servedPass, postconditions, OUT_W, OUT_H, TOOL_VERSION } from "../../tools/avatar/clean-served-alpha.mjs";
import { cleanAlpha, ALPHA_FLOOR, SRC_W, SRC_H } from "../../tools/avatar/clean-r2-hair-alpha.mjs";
import { countOrphanSoft, isOrphanSoft, ALPHA_INK, HALO_TOLERANCE_SERVED } from "../../tools/avatar/check-r2-hair-candidate.mjs";
import { downscaleHalf } from "../../tools/avatar/promote-r2-torso-asset.mjs";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "avatar", "clean-served-alpha.mjs"), "utf8");

// An authoring canvas: a solid block plus scattered dust that survives into the served grid.
function authoring() {
  const rgba = Buffer.alloc(SRC_W * SRC_H * 4);
  const set = (x, y, a) => { const i = (y * SRC_W + x) * 4; rgba[i] = 128; rgba[i + 1] = 128; rgba[i + 2] = 128; rgba[i + 3] = a; };
  for (let y = 300; y < 700; y++) for (let x = 380; x < 660; x++) set(x, y, 255);
  for (let n = 0; n < 40; n++) set(40 + n * 8, 60, 6);          // dust, alpha 6
  return rgba;
}

test("the served canvas is exactly half the authoring canvas", () => {
  const { sw, sh } = servedPass(authoring(), SRC_W, SRC_H);
  assert.equal(sw, OUT_W); assert.equal(sh, OUT_H);
  assert.equal(sw, SRC_W >> 1); assert.equal(sh, SRC_H >> 1);
});

test("IT IS THE SAME RULE: the pass equals cleanAlpha applied to the downscale", () => {
  // The one claim that matters. If this ever diverges, a second, looser rule has appeared for the
  // smaller canvas — which is exactly the drift the shared definition exists to prevent.
  const a = authoring();
  const { cleaned } = servedPass(a, SRC_W, SRC_H);
  const authoringCleaned = cleanAlpha(a, SRC_W, SRC_H).rgba;
  const direct = cleanAlpha(downscaleHalf(SRC_W, SRC_H, authoringCleaned), OUT_W, OUT_H).rgba;
  assert.deepEqual(cleaned, direct);
});

test("it removes served orphans and leaves ink untouched", () => {
  const { served, cleaned, sw, sh } = servedPass(authoring(), SRC_W, SRC_H);
  const before = countOrphanSoft(served, sw, sh);
  const after = countOrphanSoft(cleaned, sw, sh);
  assert.ok(after <= before, "the pass increased the orphan count");
  let ink0 = 0, ink1 = 0;
  for (let i = 3; i < served.length; i += 4) { if (served[i] >= ALPHA_INK) ink0++; if (cleaned[i] >= ALPHA_INK) ink1++; }
  assert.equal(ink0, ink1, "geometry moved at served scale");
});

test("nothing at or above ALPHA_FLOOR is touched, and nothing with an ink neighbour", () => {
  const { served, cleaned, sw, sh } = servedPass(authoring(), SRC_W, SRC_H);
  for (let i = 0; i < served.length; i += 4) {
    if (served[i + 3] === cleaned[i + 3]) continue;
    assert.ok(served[i + 3] < ALPHA_FLOOR, `cleared a pixel at alpha ${served[i + 3]}`);
    const p = i / 4, x = p % sw, y = (p - x) / sw;
    assert.ok(isOrphanSoft(served, sw, sh, x, y), "cleared a pixel that had an ink neighbour");
    assert.equal(cleaned[i + 3], 0, "a cleared pixel must be fully transparent");
  }
});

test("the pass is idempotent — a second run finds nothing", () => {
  const { cleaned, sw, sh } = servedPass(authoring(), SRC_W, SRC_H);
  assert.equal(cleanAlpha(cleaned, sw, sh).report.pixelsChanged, 0);
});

test("it is deterministic across two independent runs", () => {
  const a = authoring();
  assert.deepEqual(servedPass(a, SRC_W, SRC_H).cleaned, servedPass(a, SRC_W, SRC_H).cleaned);
});

test("postconditions pass on a clean case and name the failure on a dirty one", () => {
  const { served, cleaned, sw, sh } = servedPass(authoring(), SRC_W, SRC_H);
  assert.deepEqual(postconditions(served, cleaned, sw, sh), []);

  // Hand it a "cleaned" buffer that erased an ink pixel: geometry must be reported as broken.
  const broken = Buffer.from(cleaned);
  for (let i = 0; i < broken.length; i += 4) {
    if (broken[i + 3] >= ALPHA_INK) { broken[i + 3] = 0; break; }
  }
  const fails = postconditions(served, broken, sw, sh);
  assert.ok(fails.some((f) => f.startsWith("geometryIdentical")), `expected a geometry failure, got ${fails}`);
});

test("the served budget is the gate's own constant, not a copy", () => {
  assert.equal(HALO_TOLERANCE_SERVED, 16);
  assert.match(SRC, /HALO_TOLERANCE_SERVED/, "the budget is not imported from the gate");
  assert.ok(!/=\s*16\b/.test(SRC.replace(/^\s*\/\/.*$/gm, "")), "a literal 16 has appeared");
});

test("SOURCE: it changes no gate, no postcondition and no runtime asset", () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/assets\/avatar-r2/.test(code), "it can reach the runtime asset directory");
  assert.ok(!/R2_MANIFEST/.test(code), "it can reach the manifest");
  assert.ok(!/ALPHA_FLOOR\s*=/.test(code), "it redefines ALPHA_FLOOR");
  // Call sites, not the import name: `writeFileSync` also appears in the import list.
  const calls = code.match(/writeFileSync\s*\(/g) || [];
  assert.equal(calls.length, 1, `expected exactly one write call, found ${calls.length}`);
  assert.match(code, /writeFileSync\(outAbs, outBuf\)/, "the single write does not go to the checked path");
});

test("the tool version is stated", () => {
  assert.equal(TOOL_VERSION, "1.0.0");
});
