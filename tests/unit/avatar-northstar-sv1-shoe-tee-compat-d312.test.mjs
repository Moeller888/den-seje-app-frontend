// D-312 — the map of the new combinations the Northstar opt-in can already compose from its existing tops, bottoms and the 4 SV1-V5 shoes
// (no private file needed): 342 stable IDs, none of the 21 approved ones, none known-faulty; charcoal with the three long trousers held
// out (37); the runtime list is unchanged (an extension needs the owner's approval). Passing approves no combination.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../js/avatar-layers.js";
import { readFileSync } from "node:fs";
import { newCombinations, HELD_OUT_BOTTOMS } from "../../tools/avatar/northstar-sv1-shoe-tee-compat.mjs";

// D-312's map was taken against D-305's 21 approved combinations (D-314 then approved the 305 candidates into the runtime list)
const A = JSON.parse(readFileSync(new URL("../../tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-v5-owner-approval-v1.json", import.meta.url), "utf8"));
const D305 = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + L.NORTHSTAR_SV1_SHOES[c.candidate].item), C = newCombinations(L, D305);

test("D-312 the map: 342 new composable combinations with stable, unique IDs; none approved, none known-faulty", () => {
  assert.equal(C.length, 342); assert.equal(new Set(C.map((c) => c.id)).size, 342);
  for (const c of C) { assert.equal(c.id, c.shoe + "--" + c.id.split("--")[1] + "--" + c.bottom.replace("bottom-", "")); assert.ok(!D305.includes(c.top + "+" + c.bottom + "+" + c.item), c.id);
    assert.ok(L.northstarPlanFor({ top: c.top, bottom: c.bottom, shoes: c.item }), c.id + ": a plan exists"); }
  const by = (f) => C.filter(f).length;
  assert.equal(by((c) => c.top === "top-tee-hip-blue"), 20); assert.equal(by((c) => /print/.test(c.top)), 320); assert.equal(by((c) => c.top === "top-tee-hip-cream"), 2);
  assert.ok(!C.some((c) => c.top === "top-tee-hip-blue" && c.bottom === "bottom-skirt-sand"), "the known-faulty blue tee + skirt is not offered");
});

test("D-312 charcoal with the three long trousers is held out (37), everything else is a candidate (305); after D-314 only the 37 remain outside the runtime list", () => {
  const held = C.filter((c) => c.heldOut); assert.equal(held.length, 37); assert.ok(held.every((c) => c.shoe === "SV1-V5-CHARCOAL" && HELD_OUT_BOTTOMS.includes(c.bottom)));
  assert.equal(C.filter((c) => c.shoe === "SV1-V5-CHARCOAL" && HELD_OUT_BOTTOMS.includes(c.bottom)).length, 37); assert.equal(C.length - held.length, 305);
  assert.equal(L.NORTHSTAR_SV1_SHOE_COMBOS.length, 21 + 305); assert.deepEqual(newCombinations(L).map((c) => c.id), held.map((c) => c.id), "D-314: only the held-out 37 stay outside"); assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, true);
});

test("D-312 the candidate file is the map: 305 recommended (all technical PASS, runtime byte-identical, no missing asset), 37 held out", async () => {
  const { readFileSync } = await import("node:fs"), F = JSON.parse(readFileSync(new URL("../../tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-shoe-tee-candidates-v1.json", import.meta.url), "utf8"));
  assert.match(F.status, /NOT APPROVED/); assert.deepEqual(F.counts, { newComposable: 342, checked: 342, recommended: 305, heldOut: 37, technicalFailOutsideHeldOut: 0 });
  assert.deepEqual(F.recommended.map((u) => u.id), C.filter((c) => !c.heldOut).map((c) => c.id)); assert.deepEqual(F.heldOut.map((u) => u.id), C.filter((c) => c.heldOut).map((c) => c.id));
  for (const u of F.recommended) assert.deepEqual([u.technical, u.runtimeBytesDiffering, u.missingAssets], ["PASS", 0, 0], u.id);
  for (const u of F.heldOut) assert.deepEqual(u.failed, ["COMBO-2-DOUBLE-CONTOUR"], u.id);
  assert.equal(F.recommended.filter((u) => u.top === "top-tee-hip-blue").length, 17); assert.equal(F.recommended.filter((u) => /print/.test(u.top)).length, 288);
});
