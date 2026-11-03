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

test("D-335 v2 is v1's master with only the split added; the revision and the per-cut data are v1's", () => {
  assert.equal(LS2.REVISION, "ls-master-v2"); assert.equal(LS.REVISION, "ls-master-v1"); assert.equal(LS2.SLEEVE_FROM_ARM_ALPHA, 1);
  assert.equal(LS2.SPEC, LS.SPEC); assert.equal(LS2.SOURCE, LS.SOURCE); assert.equal(LS2.buildMasterFor, LS.buildMasterFor);
  assert.deepEqual(Object.keys(LS2).sort(), ["REVISION", "SLEEVE_FROM_ARM_ALPHA", "SOURCE", "SPEC", "buildMasterFor", "splitLayers"]);
});
