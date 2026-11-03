// D-336 — the owner's visual approval of the 30 sweater combinations of D-335 v3 (ls2-owner-approval-v1.json) and the private runtime
// preparation (no private file read): exactly 6 designs (heather and navy, plain, teapot, fox) x the 5 shown bottoms x the beige sneakers,
// each tied to its approved layer, the hip seam and its approved rendering by sha256; navy shorts outside; the version names the merged
// method files by sha256; the extra draw step puts the hip seam right before the bottom and nowhere else; 24 of the 30 are reachable in
// today's opt-in, the 6 with olive trousers are not (no outfit is added); nothing is published or integrated; the flag is false.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as AL from "../../js/avatar-layers.js";
import * as P from "../../tools/avatar/northstar-ls2-runtime-prep.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex"), A = P.approval();
const DESIGNS = ["LS2-HEATHER", "LS2-HEATHER-TEAPOT", "LS2-HEATHER-FOX", "LS2-NAVY", "LS2-NAVY-TEAPOT", "LS2-NAVY-FOX"];
const BOTTOMS = ["skirt-sand", "capri-lightblue", "trousers-square-olive", "trousers-square-navy", "trousers-square-sand"];

test("D-336 the approval is exactly the 30 combinations: 6 designs x 5 bottoms x beige sneakers, each tied to its layer and rendering", () => {
  assert.equal(A.decision, "D-336"); assert.deepEqual(Object.values(A.designs).map((d) => d.id), DESIGNS);
  const want = DESIGNS.flatMap((d) => BOTTOMS.map((b) => d + "--" + b)).sort(); assert.deepEqual(A.combinations.map((c) => c.id).sort(), want); assert.equal(new Set(want).size, 30);
  for (const c of A.combinations) { assert.equal(c.shoes, "shoes-sneakers-beige"); assert.equal(c.id, c.designId + "--" + c.bottom.replace("bottom-", "")); assert.match(c.rendering.pixelSha256, /^[0-9a-f]{64}$/);
    assert.equal(c.top, Object.values(A.designs).find((d) => d.id === c.designId).proposedRuntimeItem); }
  for (const d of Object.values(A.designs)) { assert.match(d.layer.pixelSha256, /^[0-9a-f]{64}$/); assert.ok(d.proposedRuntimeItem.startsWith(P.CUT_ITEM + "-")); }
  assert.ok(!A.combinations.some((c) => c.bottom === "bottom-shorts-navy")); assert.deepEqual(A.notApproved.map((n) => n.bottom), ["bottom-shorts-navy"]);
  assert.deepEqual(Object.values(A.designs).filter((d) => d.print).map((d) => d.print.sha256).sort(), ["8df1696338145d5b553b8dec40f1134b4aef08affbe855e91019804fd3d529d1", "8df1696338145d5b553b8dec40f1134b4aef08affbe855e91019804fd3d529d1", "a7b321204599be347a790224974836adf88090d4d6cf847e062577da2003c219", "a7b321204599be347a790224974836adf88090d4d6cf847e062577da2003c219"]);
  assert.match(A.hipSeam.pixelSha256, /^[0-9a-f]{64}$/); assert.equal(A.hipSeam.drawn, "after the shoes, before the bottom");
});

test("D-336 the version: the merged method files by sha256 (PR #576 merge 5340c26)", () => {
  assert.match(A.version.mergedIn, /^5340c262bb3452271ab29385b72e6dfe52b96d0d/);
  for (const [f, h] of Object.entries(A.version.files)) assert.equal(sha(readFileSync(join(ROOT, f))), h, f);
});

test("D-336 the extra draw step: the hip seam right before the bottom's first draw, only for a top that names it", () => {
  const item = P.itemShape(["body", "arms"]), table = { ...AL.NORTHSTAR_ITEMS, "top-sweater-ls2-navy": item };
  for (const b of BOTTOMS) { const o = { top: "top-sweater-ls2-navy", bottom: "bottom-" + b, shoes: "shoes-sneakers-beige" }, plain = AL.northstarPlanFor(o, table, "ns"), plan = P.planWithHipSeam(AL, o, table, "ns");
    assert.equal(plan.length, plain.length + 1); const k = plan.findIndex((s) => s.src === "ns/" + P.HIP_SEAM_FILE), srcs = plan.map((s) => s.src);
    assert.equal(srcs[k + 1], "ns/bottom-" + b + "-pants-v1.webp"); assert.ok(srcs.indexOf("ns/shoes-sneakers-beige-shoes-v1.webp") < k); assert.ok(srcs.indexOf("ns/top-sweater-ls2-navy-top-body-v1.webp") > k);
    assert.ok(srcs.includes("ns/top-sweater-ls2-shadow-body-v1.webp") && srcs.includes("ns/top-sweater-ls2-shadow-arms-v1.webp")); }
  const tee = { top: "top-tee-hip-cream", bottom: "bottom-skirt-sand", shoes: "shoes-sneakers-beige" }; assert.deepEqual(P.planWithHipSeam(AL, tee, table, "ns"), AL.northstarPlanFor(tee, table, "ns"));
});

test("D-336 reachability in today's opt-in: 24 of 30 (skirt, capri, navy and sand trousers with the beige sneakers); olive trousers are not", () => {
  const keys = new Set(A.combinations.map((c) => c.bottom + "+" + c.shoes)), reach = new Set();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) {
    const o = AL.northstarOutfitFor(k, t, p, s); if (o && keys.has(o.bottom + "+" + o.shoes)) reach.add(o.bottom); }
  assert.deepEqual([...reach].sort(), ["bottom-capri-lightblue", "bottom-skirt-sand", "bottom-trousers-square-navy", "bottom-trousers-square-sand"]);
  assert.equal(A.combinations.filter((c) => reach.has(c.bottom)).length, 24);
});

test("D-336 nothing is published or integrated; the flag stays false", () => {
  assert.ok(!readdirSync(join(ROOT, "assets", "avatar-northstar")).some((f) => f.includes("sweater"))); assert.ok(!Object.keys(AL.NORTHSTAR_ITEMS).some((k) => k.includes("sweater")));
  assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, false);
});
