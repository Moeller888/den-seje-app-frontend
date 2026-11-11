// D-345 — the tank top family (no private file needed): the pairs come from the TEE approvals only (264 = 44 pairs x 6 designs; the olive
// trousers with the beige sneakers excluded — no tee approval; the navy shorts never; charcoal SV1 only with skirt and capri); the runtime
// item a tank design would have draws its hem junction before the bottom and no sleeves (the browser's northstarPlanFor with a table);
// tank-v3 is tank-v2 with a fade only, and the fade goes from opaque down to C's alpha; D-343's tank-v2 is unchanged. D-345 did not change
// the runtime; D-348 (owner approval) added exactly the six tank items, checked here against the family's IDs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as AL from "../../js/avatar-layers.js";
import { beforeLayerFixes } from "../../tools/avatar/northstar-free-matrix.mjs";   // D-370: the plan without its two layer fixes
import * as K from "../../tools/avatar/northstar-top-cut-kit.mjs";
import * as TF from "../../tools/avatar/northstar-tank-family.mjs";

const { W, N } = WR, REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");

test("D-345 the family: 44 tee-approved pairs x 6 designs = 264; olive with beige sneakers and the navy shorts excluded", () => {
  const C = TF.combinations(AL), p = TF.pairs(AL);
  assert.equal(C.length, 264); assert.equal(p.keep.length, 44); assert.equal(new Set(C.map((c) => c.id)).size, 264);
  assert.ok(C.every((c) => c.prior), "every pair has a tee approval");
  assert.ok(!C.some((c) => c.bottom === "bottom-shorts-navy")); assert.ok(!C.some((c) => c.bottom === "bottom-trousers-square-olive" && c.shoes === TF.BEIGE));
  assert.deepEqual(p.excluded.map((e) => e.bottom + "+" + e.shoes), ["bottom-trousers-square-olive+shoes-sneakers-beige", "bottom-shorts-navy+*"]);
  assert.deepEqual([...new Set(C.filter((c) => c.shoes === "shoes-sneakers-low-sv1-charcoal").map((c) => c.bottom))].sort(), ["bottom-capri-lightblue", "bottom-skirt-sand"]);
  assert.equal(C.filter((c) => c.reviewedInD343).length, 24);
  // D-348 integrated the six after the owner's approval: the runtime's tank items are exactly the staged item table, nothing else
  // D-355: the 11 prepared tank tops of D-354 join the cut's family; exactly those, after the six
  assert.deepEqual(Object.keys(AL.NORTHSTAR_ITEMS).filter((k) => k.startsWith(TF.CUT_ITEM)), [...Object.keys(TF.DESIGNS).map(TF.itemOf), ...Object.values(AL.NORTHSTAR_KIT_TOPS).filter((t) => t.family === TF.CUT_ITEM).map((t) => t.item)], "the runtime's tank items are the six and D-355's eleven");
  assert.equal(Object.values(AL.NORTHSTAR_KIT_TOPS).filter((t) => t.family === TF.CUT_ITEM).length, 11);
  assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, true);   // D-357
});

test("D-345 the runtime item shape: the hem junction after the shoes and before the bottom, a body layer, no sleeves, the cut's shadow", () => {
  const table = { ...AL.NORTHSTAR_ITEMS, [TF.itemOf("TK-NAVY-FOX")]: TF.itemShape(["body"]) };
  const plan = AL.northstarPlanFor({ top: TF.itemOf("TK-NAVY-FOX"), bottom: "bottom-trousers-square-olive", shoes: "shoes-sneakers-white" }, table, "ns"), src = beforeLayerFixes(plan.map((s) => s.src.replace("ns/", "")));
  const j = src.indexOf(TF.JUNCTION_FILE); assert.ok(j > 0); assert.equal(src[j - 1], "shoes-sneakers-white-shoes-v1.webp"); assert.equal(src[j + 1], "bottom-trousers-square-olive-pants-v1.webp");
  assert.ok(src.includes("top-tank-navy-fox-top-body-v1.webp")); assert.ok(!src.some((f) => /top-tank.*sleeves/.test(f))); assert.ok(src.includes("top-tank-shadow-body-v1.webp"));
});

test("D-345 tank-v3 is tank-v2 with the fade only; the fade runs from opaque to C's alpha; tank-v2 unchanged", () => {
  const v2 = K.loadCut("tank-v2"), v3 = K.loadCut("tank-v3");
  for (const k of ["source", "panels", "warp", "sleeves", "cuffs", "trim", "print", "shadow", "hipSeam", "runtime"]) assert.deepEqual(v3[k], v2[k], k);
  assert.deepEqual({ ...v3.hemJunction, opaqueTaperRows: undefined }, { ...v2.hemJunction, opaqueTaperRows: undefined }); assert.equal(v3.hemJunction.opaqueTaperRows, 10); assert.equal(v2.hemJunction.opaqueTaperRows, undefined);
  assert.equal(sha(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "top-cuts", "tank-v2.json"))), "5d9468f8bdc42f0f7a1b571e4f9cad682695cbaf3a0e484febe1893407dfff57");
  // synthetic C and tank (D-343's test figure)
  const R = new Uint8ClampedArray(N * 4), lab = new Uint8Array(N), core = new Uint8Array(N), contour = new Uint8ClampedArray(N * 4);
  for (let y = 400; y <= 1000; y++) for (let x = 380; x <= 644; x++) { const i = y * W + x, edge = x === 380 || x === 644 || y === 1000; R.set([200, 160, 120, edge ? 100 : 255], i * 4); lab[i] = y < 790 ? 1 : 2; }
  for (let y = 450; y <= 780; y++) for (let x = 404; x <= 620; x++) { const i = y * W + x; core[i] = 1; if (x <= 405 || x >= 619 || y >= 779) contour.set([1, 9, 7, 255], i * 4); }
  const ctx = (c) => ({ c, t: { core, contour }, E: { base: { R, sep: { lab } } } }), a = K.hemJunctionLayer(ctx(v2)), b = K.hemJunctionLayer(ctx(v3)), end = 780 + v3.hemJunction.opaqueRowsBelowHem;
  for (let i = 0; i < N; i++) { const y = (i / W) | 0; assert.equal(!!a.layer[i * 4 + 3], !!b.layer[i * 4 + 3], "the same pixels");
    if (!b.layer[i * 4 + 3]) continue; const r = y - end;
    if (r <= 0 || r > 10) assert.equal(b.layer[i * 4 + 3], a.layer[i * 4 + 3], "outside the fade as v2 at row " + y);
    else { const ca = R[i * 4 + 3]; assert.ok(b.layer[i * 4 + 3] <= 255 && b.layer[i * 4 + 3] >= ca, "between opaque and C's alpha"); } }
});

test("D-345 the candidate file: exactly the family's 264 with full evidence, the exclusions, 8 staged tank files only, bound to tank-v3", () => {
  const F = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "tank", "tank-family-candidates-v1.json"), "utf8"));
  assert.deepEqual(F.combinations.map((c) => c.id), TF.combinations(AL).map((c) => c.id)); assert.equal(F.count, 264);
  for (const c of F.combinations) { assert.equal(c.evidence.technical, "PASS"); assert.equal(c.evidence.enclosedPx, 0); assert.ok(c.evidence.feetIdenticalToTeeOutfit && c.evidence.aboveFeetIdenticalToReviewedBeige, c.id); }
  assert.deepEqual(F.excluded.map((e) => e.bottom + "+" + e.shoes), ["bottom-trousers-square-olive+shoes-sneakers-beige", "bottom-shorts-navy+*"]);
  assert.equal(F.staging.files.length, 8); assert.ok(F.staging.files.every((f) => /^top-tank-[a-z-]+-v1\.webp$/.test(f.file) && /^[0-9a-f]{64}$/.test(f.sha256)));
  assert.deepEqual(F.staging.equivalence.combinations, 264); assert.equal(F.staging.equivalence.differing, 0);
  assert.equal(sha(readFileSync(join(REPO, ...F.cut.contract.split("/")))), F.cut.sha256);
  assert.ok(/NOT approved/.test(F.kind));
});
