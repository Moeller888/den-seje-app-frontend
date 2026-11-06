// D-336 — the owner's visual approval of the 30 sweater combinations of D-335 v3 (ls2-owner-approval-v1.json) and the private runtime
// preparation (no private file read): exactly 6 designs (heather and navy, plain, teapot, fox) x the 5 shown bottoms x the beige sneakers,
// each tied to its approved layer, the hip seam and its approved rendering by sha256; navy shorts outside; the version names the merged
// method files by sha256; the extra draw step puts the hip seam right before the bottom and nowhere else; 24 of the 30 are reachable in
// today's opt-in, the 6 with olive trousers are not (no outfit is added); nothing published or integrated by D-336 itself — D-337 then
// published exactly the 15 staged files and offered the sweaters for the 30 combinations under the owner's permission; the flag is false.
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
  const item = P.itemShape(["body", "arms"]), table = { ...AL.NORTHSTAR_ITEMS, "top-sweater-ls2-navy": item }, noSeam = { ...item }; delete noSeam.hipSeam; const tableNoSeam = { ...table, "top-sweater-ls2-navy": noSeam };
  for (const b of BOTTOMS) { const o = { top: "top-sweater-ls2-navy", bottom: "bottom-" + b, shoes: "shoes-sneakers-beige" }, plain = AL.northstarPlanFor(o, tableNoSeam, "ns"), plan = P.planWithHipSeam(AL, o, table, "ns");
    assert.deepEqual(plan, AL.northstarPlanFor(o, table, "ns"), "D-337: the runtime's own plan draws the seam; planWithHipSeam adds no second one");
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

// D-336's registered files (the staging table in docs/decisions/D-336.md)
const STAGED = { "top-sweater-ls2-heather-top-body-v1.webp": "0ad6d6adbc0399d2f961676c9d14fd17a739b2fcb9a510861d0d512f9a8d5939", "top-sweater-ls2-heather-teapot-top-body-v1.webp": "f8bfa47a3d6595eaaa5a42b978c49fce226cf38ac06f6ff5d8aba9b88c0b3629",
  "top-sweater-ls2-heather-fox-top-body-v1.webp": "955e95df798a8210a0b34af2a5b46de46f9a4dafe3b52718f2b96c8d99173eb0", "top-sweater-ls2-navy-top-body-v1.webp": "afa517e9d08a2d6b374a52162246bf4dbb99ae7fa5de15fe5fe7404b90f7336a",
  "top-sweater-ls2-navy-teapot-top-body-v1.webp": "5982ecf04755696180e10e4e052e372d4db0ccb3822d0e80210bdefa806b34a6", "top-sweater-ls2-navy-fox-top-body-v1.webp": "9822f123ba3b4188531e87b29cf6e979b7e991b3f7d014aefe72ea34fde7a5ff",
  "top-sweater-ls2-heather-sleeves-v1.webp": "dcaed7063a0ae149d62b73be8c9232510f7ac118d9ec63e88ec96c0417915a2e", "top-sweater-ls2-heather-teapot-sleeves-v1.webp": "dcaed7063a0ae149d62b73be8c9232510f7ac118d9ec63e88ec96c0417915a2e",
  "top-sweater-ls2-heather-fox-sleeves-v1.webp": "dcaed7063a0ae149d62b73be8c9232510f7ac118d9ec63e88ec96c0417915a2e", "top-sweater-ls2-navy-sleeves-v1.webp": "b28f4ea7ab9cc520c0dc334cd78fcf29b49534fb63db31a2b24801f1eab978be",
  "top-sweater-ls2-navy-teapot-sleeves-v1.webp": "b28f4ea7ab9cc520c0dc334cd78fcf29b49534fb63db31a2b24801f1eab978be", "top-sweater-ls2-navy-fox-sleeves-v1.webp": "b28f4ea7ab9cc520c0dc334cd78fcf29b49534fb63db31a2b24801f1eab978be",
  "top-sweater-ls2-hip-seam-v1.webp": "953ed60f4f9298352eaf040bc61020f04b4fb2deb5d0d8e575945c97cd5358ac", "top-sweater-ls2-shadow-body-v1.webp": "68a1f71d0574ad2fddd0184280a652663335db851a3e3751bf0274231da5b6c2",
  "top-sweater-ls2-shadow-arms-v1.webp": "fe9c36b61f72d96d58a1c272613a3575cb9b8301a577fb6ed71f616fda421bf4" };

test("D-336/D-337 published under the owner's permission: exactly the 15 registered files; the sweaters offered for the 30 (D-340: part of 270); flag false", () => {
  const pub = readdirSync(join(ROOT, "assets", "avatar-northstar")).filter((f) => f.includes("sweater")).sort(); assert.deepEqual(pub, Object.keys(STAGED).sort());
  for (const [f, h] of Object.entries(STAGED)) assert.equal(sha(readFileSync(join(ROOT, "assets", "avatar-northstar", f))), h, f);
  const mine = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + c.shoes); assert.ok(mine.every((k) => AL.NORTHSTAR_LS2_COMBOS.includes(k)));   // D-340 extended the list to 270
  for (const d of Object.values(A.designs)) { const it = AL.NORTHSTAR_ITEMS[d.proposedRuntimeItem]; assert.equal(it.shadowsOf, P.CUT_ITEM); assert.equal(it.hipSeam, P.HIP_SEAM_FILE); }
  assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, true);
});
