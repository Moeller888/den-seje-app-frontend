// D-343 — the tank's own layer behind the bottom (the hem junction) on a SYNTHETIC figure (no private file, no C): it starts at the hem
// corners and never runs up the side, never touches the cut, stops rowsBelowShortsTop below C's shorts top, is opaque only in its first
// opaqueRowsBelowHem rows and takes C's own alpha below; the tank-v2 contract validates and keeps D-342's shape data; D-342's tank
// contract (the historical trial with the sweater's hip seam) is unchanged; a cut may have only one layer behind the bottom. Passing
// approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as K from "../../tools/avatar/northstar-top-cut-kit.mjs";

const { W, N } = WR, REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");
const CUTS = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "top-cuts");

/** C, synthetic: a body 380..644 x 400..1000 with a 1 px soft edge (alpha 100); its base top (lab 1) above row 790 (below the tank's hem, as on C), its base shorts
 *  (lab 2) from row 790. The tank: 404..620 x 450..780 with a dark 2 px contour. */
function synth() {
  const R = new Uint8ClampedArray(N * 4), lab = new Uint8Array(N), core = new Uint8Array(N), contour = new Uint8ClampedArray(N * 4);
  for (let y = 400; y <= 1000; y++) for (let x = 380; x <= 644; x++) { const i = y * W + x, edge = x === 380 || x === 644 || y === 400 || y === 1000; R.set([200, 160, 120, edge ? 100 : 255], i * 4); lab[i] = y < 790 ? 1 : 2; }
  for (let y = 450; y <= 780; y++) for (let x = 404; x <= 620; x++) { const i = y * W + x; core[i] = 1; if (x <= 405 || x >= 619 || y >= 779) contour.set([1, 9, 7, 255], i * 4); }
  return { base: { R, sep: { lab } }, t: { core, contour } };
}

test("D-343 the hem junction starts at the hem corners, never runs up the side or onto the cut, opaque near the hem, C's alpha below", () => {
  const { base, t } = synth(), c = K.loadCut("tank-v2"), j = c.hemJunction, r = K.hemJunctionLayer({ c, t, E: { base } });
  assert.deepEqual(r.hem, { left: 780, right: 780 }); assert.equal(r.shortsTop, 790); assert.ok(r.addedPx > 100, "a real junction was built");
  let left = 0, right = 0;
  for (let i = 0; i < N; i++) { const a = r.layer[i * 4 + 3]; if (!a) continue; const x = i % W, y = (i / W) | 0;
    assert.ok(y >= 780 - 2, "above the hem corner at " + x + "," + y); assert.ok(y <= 790 + j.rowsBelowShortsTop); assert.ok(!t.core[i], "on the cut");
    assert.deepEqual([...r.layer.subarray(i * 4, i * 4 + 3)], [1, 9, 7], "the cut's ink");
    assert.equal(a, y <= 780 + j.opaqueRowsBelowHem ? 255 : base.R[i * 4 + 3], "alpha at " + x + "," + y); if (x < W / 2) left++; else right++; }
  assert.ok(left > 0 && right > 0, "both sides");
});

test("D-343 tank-v2: one layer behind the bottom (the hem junction); D-342's shape data kept; D-342's trial contract unchanged", () => {
  const v1 = K.loadCut("tank"), v2 = K.loadCut("tank-v2");
  assert.equal(v2.hipSeam, null); assert.equal(v2.hemJunction.rule, "K.hemJunctionLayer"); assert.deepEqual([v2.hemJunction.outlinePx, v2.hemJunction.rowsBelowShortsTop, v2.hemJunction.opaqueRowsBelowHem], [3, 80, 24]);
  for (const k of ["source", "panels", "warp", "sleeves", "cuffs", "trim", "print", "shadow", "runtime"]) assert.deepEqual(v2[k], v1[k], k + " (the cut's shape, fabric and print are not changed)");
  assert.equal(sha(readFileSync(join(CUTS, "tank.json"))), "7af8034059eb9e56c86481aadfed0c77d41a74429eb5d71af5945d6562621297", "D-342's tank contract is kept as recorded");
  assert.throws(() => K.checkCut({ ...v2, hipSeam: v1.hipSeam }), /at most one layer behind the bottom/);
  assert.throws(() => K.checkCut({ ...v2, hemJunction: { ...v2.hemJunction, opaqueRowsBelowHem: -1 } }), /opaqueRowsBelowHem/);
});

test("D-343 the kit's behindBottom: the sweater gets its hip seam rule, the tank-v2 its junction, the tee none", () => {
  for (const id of ["tee-hip", "sweater-long", "tank", "tank-v2"]) K.loadCut(id);
  assert.equal(K.behindBottom({ c: K.loadCut("tee-hip") }), null);
  for (const [rel, want] of Object.entries(K.LOCKED)) assert.equal(sha(readFileSync(join(REPO, ...rel.split("/")))), want, rel);
});
