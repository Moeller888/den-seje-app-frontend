// D-335 — the sweater master v2's one repair on SYNTHETIC inputs (no private file, no C): the cut's own layer split puts a fabric pixel
// in the sleeve layer (drawn over C's arms) wherever C's arm has ANY alpha, so the fabric covers the arm's soft edge — the production rule
// (>= 128) left those pixels in the body layer under the arm, and the arm's warm edge showed through as a dotted line. The split changes
// no pixel's colour or alpha, only its layer; pixels away from the arm stay in the body layer; v1 (D-333) is unchanged. Passing approves
// nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as LS from "../../tools/avatar/northstar-longsleeve-master.mjs";
import * as LS2 from "../../tools/avatar/northstar-longsleeve-master-v2.mjs";

const { W, N } = WR;

test("D-335 splitLayers: fabric over any part of C's arm (its soft edge included) is in the sleeve layer; colours and alpha unchanged", () => {
  const layer = new Uint8ClampedArray(N * 4), arms = new Uint8ClampedArray(N * 4), base = { arms };
  // a row of fabric across an arm: x 100..109 no arm, 110..114 the arm's soft edge (alpha 85..115), 115..119 the arm (alpha 255)
  for (let x = 100; x < 120; x++) { const i = 600 * W + x; layer.set([158, 160, 164, 250 + (x % 5)], i * 4); if (x >= 110) arms[i * 4 + 3] = x < 115 ? 85 + (x - 110) * 7 : 255; }
  const { layers, moved } = LS2.splitLayers(layer, base);
  for (let x = 100; x < 120; x++) { const i = (600 * W + x) * 4, inSleeve = layers.sleeves[i + 3] > 0, inBody = layers.topBody[i + 3] > 0;
    assert.equal(inSleeve, x >= 110, "x " + x); assert.equal(inBody, x < 110, "x " + x); assert.ok(inSleeve !== inBody, "exactly one layer");
    const L = inSleeve ? layers.sleeves : layers.topBody; assert.deepEqual([...L.subarray(i, i + 4)], [...layer.subarray(i, i + 4)], "colour and alpha unchanged"); }
  assert.equal(moved, 5, "the 5 soft-edge pixels the production rule (>= 128) would have left under the arm");
  // the production rule for comparison: the soft edge stays in the body layer
  assert.equal(LS2.splitLayers(layer, base, 128).moved, 0); assert.equal(LS2.splitLayers(layer, base, 128).layers.topBody[(600 * W + 112) * 4 + 3] > 0, true);
});

test("D-335 v2 is v1's master with only the split and the hip seam added; the revision and the per-cut data are v1's", () => {
  assert.equal(LS2.REVISION, "ls-master-v2"); assert.equal(LS.REVISION, "ls-master-v1"); assert.equal(LS2.SLEEVE_FROM_ARM_ALPHA, 1);
  assert.equal(LS2.SPEC, LS.SPEC); assert.equal(LS2.SOURCE, LS.SOURCE); assert.equal(LS2.buildMasterFor, LS.buildMasterFor);
  assert.deepEqual(Object.keys(LS2).sort(), ["HIP_ROWS", "REVISION", "SLEEVE_FROM_ARM_ALPHA", "SOURCE", "SPEC", "buildMasterFor", "coverBaseTopStrip", "splitLayers"]);
});

test("D-335 coverBaseTopStrip: C's base-top strip connected below the cut becomes the cut's contour (its ink, C's alpha); nothing else changes", () => {
  const lab = new Uint8Array(N), R = new Uint8ClampedArray(N * 4), core = new Uint8Array(N), alpha = new Uint8Array(N), contour = new Uint8ClampedArray(N * 4);
  for (let y = 700; y < 760; y++) for (let x = 60; x < 140; x++) lab[y * W + x] = 2;                                   // C's base shorts from row 700
  for (const sx of [100, 300]) for (let y = 690; y <= 720; y++) for (const x of [sx, sx + 1]) { lab[y * W + x] = 1; R[(y * W + x) * 4 + 3] = x === sx ? 250 : 140; }   // two base-top strips
  for (let y = 650; y <= 700; y++) for (let x = 90; x <= 101; x++) { const i = y * W + x; core[i] = 1; alpha[i] = 254; if (x >= 100) contour.set([10, 12, 8, 240], i * 4); }   // the cut, its side ink
  const t = { core, alpha, contour }, master = { panel: new Int8Array(N).fill(-1), ratio: new Float32Array(N), disp: new Float32Array(N * 2) }, base = { sep: { lab }, R };
  const r = LS2.coverBaseTopStrip(t, master, base);
  assert.equal(r.addedPx, 40, "rows 701-720 x 100-101 (the strip at x 300 is not connected to the cut)"); assert.deepEqual(r.box, [100, 701, 101, 720]); assert.deepEqual(r.ink, [10, 12, 8]);
  for (let y = 701; y <= 720; y++) for (const x of [100, 101]) { const i = y * W + x; assert.equal(r.t.core[i], 1); assert.equal(r.t.alpha[i], R[i * 4 + 3]); assert.deepEqual([...r.t.contour.subarray(i * 4, i * 4 + 4)], [10, 12, 8, R[i * 4 + 3]]); assert.equal(r.master.panel[i], 0); }
  for (let y = 690; y <= 720; y++) assert.equal(r.t.core[y * W + 300], 0);
  let changed = 0; for (let i = 0; i < N; i++) if (r.t.core[i] !== core[i] || r.t.alpha[i] !== alpha[i]) changed++; assert.equal(changed, 40);
  assert.equal(t.core[710 * W + 100], 0, "the input cut is not mutated");
});
