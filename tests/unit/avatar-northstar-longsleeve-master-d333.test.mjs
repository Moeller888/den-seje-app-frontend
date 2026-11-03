// D-333 — the long-sleeve master prototype on SYNTHETIC inputs (no private file, no C): buildMasterFor is D-264's buildMaster with the
// per-cut data as a parameter — with the tee's own SPEC it reproduces TM.buildMaster exactly (panels, shading ratio, displacement, axes),
// so the long-sleeve master changes only data, never the method; the long-sleeve SPEC is one-time per-cut data (both seams run from the
// shoulder down to the armpit, mirrored about the figure's centre within a few px); the pinned tee master is untouched. Passing approves
// nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as R1 from "../../tools/avatar/northstar-r1-garment.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import * as LS from "../../tools/avatar/northstar-longsleeve-master.mjs";

const { W, N } = WR, REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** A SYNTHETIC short-sleeved top at the tee's coordinates: a body, two sleeves, a dark outline, a dark seam near the tee SPEC's lines
 *  and a few soft fold bands (so that ratio and displacement are not trivial). */
function synthTop() {
  const P = new Uint8ClampedArray(N * 4), inBody = (x, y) => x >= 400 && x <= 624 && y >= 470 && y <= 830, inSleeve = (x, y) => y >= 490 && y <= 640 && ((x >= 330 && x < 400) || (x > 624 && x <= 694));
  for (let y = 0; y < N / W; y++) for (let x = 0; x < W; x++) { if (!inBody(x, y) && !inSleeve(x, y)) continue; const i = (y * W + x) * 4, fold = 0.85 + 0.15 * Math.cos((x + y) / 23);
    const edge = !inBody(x - 2, y) && !inSleeve(x - 2, y) || !inBody(x + 2, y) && !inSleeve(x + 2, y) || !inBody(x, y - 2) && !inSleeve(x, y - 2) || !inBody(x, y + 2) && !inSleeve(x, y + 2);
    const seam = Math.abs(x - (381 + (y - 500) * 0.2)) < 1.5 || Math.abs(x - (642 - (y - 500) * 0.2)) < 1.5, l = edge || seam ? 25 : Math.round(200 * fold);
    P.set([l, Math.round(l * 0.95), Math.round(l * 0.9), 255], i); }
  return P;
}

test("D-333 buildMasterFor with the tee's own SPEC reproduces D-264's TM.buildMaster exactly (only the data differ)", () => {
  const layer = synthTop(), src = { layers: { topBody: layer } }, t = R1.templateFromLayers(src.layers, { category: "top", cut: "tee-hip" });
  const a = TM.buildMaster(t, src), b = LS.buildMasterFor(TM.SPEC, t, src);
  assert.equal(b.revision, TM.REVISION); assert.deepEqual(b.seams, a.seams); assert.deepEqual(b.sizes, a.sizes); assert.equal(b.base, a.base); assert.deepEqual(b.axes, a.axes);
  for (const k of ["panel", "ratio", "disp"]) assert.equal(sha(Buffer.from(b[k].buffer)), sha(Buffer.from(a[k].buffer)), k);
  assert.ok(a.sizes.left > 1000 && a.sizes.right > 1000 && a.sizes.body > 10000, "a real split (sleeves and body) was compared");
});

test("D-333 the long-sleeve SPEC is one-time per-cut data: seams from shoulder to armpit, mirrored; the source is pinned; the warp is D-264's", () => {
  const { left, right } = LS.SPEC.seams; assert.equal(left.length, right.length);
  for (const s of [left, right]) for (let k = 1; k < s.length; k++) assert.ok(s[k][1] > s[k - 1][1], "rows go down");
  for (let k = 0; k < left.length; k++) { assert.equal(left[k][1], right[k][1]); assert.ok(Math.abs(left[k][0] + right[k][0] - 1022) <= 3, "mirrored about the centre: " + k); }
  assert.deepEqual(LS.SPEC.warp, TM.SPEC.warp); assert.equal(LS.SPEC.seamSearchPx, TM.SPEC.seamSearchPx); assert.equal(LS.SPEC.extendPx, TM.SPEC.extendPx);
  assert.deepEqual({ ...LS.SOURCE }, { item: "top-sweater-green", run: "d-239-targeted-correction/final1-pilot", method: "d239", cut: "sweater-long" }); assert.equal(LS.REVISION, "ls-master-v1");
});

test("D-333 the pinned tee master is untouched (D-267/D-270's plans pin its sha256)", () => {
  const pin = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "tee-master", "tp-validation-plan-v1.json"), "utf8"));
  const want = JSON.stringify(pin).match(/"tools\/avatar\/northstar-tee-master\.mjs":"([0-9a-f]{64})"/)[1];
  assert.equal(sha(readFileSync(join(REPO, "tools", "avatar", "northstar-tee-master.mjs"))), want);
});
