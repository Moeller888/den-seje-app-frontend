// D-352 — trim bands by the drawn seam (no private file needed): the seam rule finds the band between a cut's edge and the dark seam
// line the cut draws parallel to it (a column edge, a column edge limited by edgeY, an opening measured along a curved neckline); a
// recipe's trim is laid only on the band; a contract version with bands differs from its cut only in id, label, trim and the record of
// one-time work; the v2 recipes are D-351's with a trim on exactly the four patterns. Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../tools/avatar/northstar-top-cut-kit.mjs";
import * as RC from "../../tools/avatar/northstar-top-cut-recipes.mjs";
import { listOf } from "../../tools/avatar/northstar-top-cut-production-trial.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), W = 1024, N = W * 1536, CUTS = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "top-cuts");
const json = (f) => JSON.parse(readFileSync(join(CUTS, f), "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");

// a synthetic body panel 400..619 x 500..699 with a dark seam line 12 px above its bottom edge and a neck hole cut from its top
function synth({ hole = false } = {}) {
  const t = { core: new Uint8Array(N), alpha: new Uint8Array(N), contour: new Uint8ClampedArray(N * 4) }, panel = new Int8Array(N).fill(-1), ratio = new Float32Array(N).fill(1), disp = new Float32Array(N * 2);
  for (let y = 500; y < 700; y++) for (let x = 400; x < 620; x++) { const i = y * W + x, r = Math.hypot(x - 510, y - 500); if (hole && r < 40) continue; t.core[i] = 1; t.alpha[i] = 255; panel[i] = 0;
    if (y === 699 - 12) ratio[i] = 0.4; if (hole && Math.abs(r - 50) < 0.6) ratio[i] = 0.4; }
  return { t, master: { panel, ratio, disp, axes: [] } };
}

test("D-352 the seam rule: a bottom band ends at the drawn seam; edgeY skips columns whose edge is elsewhere; an opening band follows the curve", () => {
  const { t, master } = synth(), c = { trim: { bands: "seam-rule", regions: [{ name: "hem", panel: "body", edge: "bottom", depth: [6, 20] }] } };
  const b = K.seamBands(c, t, master); assert.deepEqual(b.regions.hem.depth, [12, 12, 12]); assert.equal(b.regions.hem.columns, 220);
  for (let x = 400; x < 620; x++) for (let y = 680; y < 700; y++) assert.equal(!!b.band[y * W + x], y >= 699 - 12, x + "," + y);
  const off = K.seamBands({ trim: { bands: "seam-rule", regions: [{ name: "hem", panel: "body", edge: "bottom", edgeY: [600, 650], depth: [6, 20] }] } }, t, master);
  assert.equal(off.regions.hem.columns, 0, "no column's edge lies in edgeY");
  const h = synth({ hole: true }), o = K.seamBands({ trim: { bands: "seam-rule", regions: [{ name: "neck", panel: "body", edge: "opening", hole: [470, 500, 550, 540], depth: [4, 16] }] } }, h.t, h.master);
  assert.ok(o.regions.neck.px > 0); assert.ok(Math.abs(o.regions.neck.depth[1] - 10) <= 1, JSON.stringify(o.regions.neck));
  for (let i = 0; i < N; i++) if (o.band[i]) { const x = i % W, y = (i / W) | 0, r = Math.hypot(x - 510, y - 500); assert.ok(r >= 39 && r <= 52, "band pixel at r=" + r.toFixed(1)); }
});

test("D-352 the trim swatch is laid only on the band; without a trim the fabric is laid everywhere as before", () => {
  const { t, master } = synth(), c = { trim: { bands: "seam-rule", regions: [{ name: "hem", panel: "body", edge: "bottom", depth: [6, 20] }] } }, b = K.seamBands(c, t, master).band;
  const body = RC.swatchOf({ type: "solid", base: [200, 200, 200] }), trim = RC.swatchOf({ type: "solid", base: [20, 40, 80] });
  const a = K.renderFabric(master, t, body, b, trim).layer, plain = K.renderFabric(master, t, body).layer, noTrim = K.renderFabric(master, t, body, b, null).layer;
  for (let i = 0; i < N; i++) { if (!t.alpha[i]) continue; const want = b[i] ? 20 : 200; assert.equal(a[i * 4 + 2] === Math.min(255, Math.round((b[i] ? 80 : 200) * master.ratio[i])), true); assert.equal(a[i * 4] , Math.min(255, Math.round(want * master.ratio[i]))); }
  assert.equal(sha(Buffer.from(plain.buffer)), sha(Buffer.from(noTrim.buffer)));
});

test("D-352 the contract versions: only id, label, trim, oneTimeWork and derivedFrom differ from their cut; they validate", () => {
  for (const [v, base] of [["sweater-long-v2", "sweater-long"], ["tank-v4", "tank-v3"]]) { const a = json(v + ".json"), b = json(base + ".json");
    assert.doesNotThrow(() => K.checkCut(a)); assert.equal(a.trim.bands, "seam-rule"); assert.equal(listOf(v), listOf(base));
    const strip = (o) => { const { id, label, trim, oneTimeWork, derivedFrom, ...rest } = o; return rest; }; assert.deepEqual(strip(a), strip(b), v);
    assert.deepEqual(a.oneTimeWork.slice(0, b.oneTimeWork.length), b.oneTimeWork); }
  assert.deepEqual(json("tank-v4.json").trim.regions.map((r) => r.name), ["neck binding"], "the tank: the neck binding only (armholes and hem keep the body fabric)");
  assert.deepEqual(json("sweater-long-v2.json").trim.regions.map((r) => r.name), ["neck rib", "hem rib", "cuff left", "cuff right"]);
  assert.throws(() => K.checkCut({ ...json("tank-v4.json"), trim: { bands: "seam-rule", regions: [{ name: "x", panel: "body", edge: "opening", depth: [5, 20] }] } }), /hole box/);
});

test("D-352 the v2 recipes are D-351's with a trim on exactly the four patterns, on the trim-band cut versions", () => {
  const v1 = json("production-trial-recipes-v1.json"), v2 = json("production-trial-recipes-v2.json");
  assert.doesNotThrow(() => RC.checkRecipes(v2)); assert.deepEqual(v2.cuts, ["tee-hip", "sweater-long-v2", "tank-v4"]);
  assert.deepEqual(v2.recipes.filter((r) => r.trim).map((r) => r.id), ["R05", "R06", "R07", "R08"]);
  assert.deepEqual(v2.recipes.map(({ trim, trimWhy, ...r }) => r), v1.recipes); assert.match(v2.kind, /NOT approved, NOT published/);
});
