// D-337 — the 6 owner-approved sweaters (D-336) in the Northstar opt-in (no private file needed): a sweater replaces the top ONLY where
// the whole effective outfit (after the print tee, the trousers and the shoe) with it is one of the 30 approved combinations (beige
// sneakers) — 24 reachable with today's outfits; outside the list the outfit keeps its own top and the stored choice stays untouched,
// also after a reload (the choice is read from storage again); the plan draws the cut's hip seam after the shoes and right before the
// bottom, the sweater's body after the bottom; the figure key names the sweater; no opt-in, nothing; ?northstar=0 forgets it.
// D-340 extended the list with D-339's 240 (the other shoes): the assertions below state D-337's 30 as a part of it and the rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../js/avatar-layers.js";
import { applyNorthstarUrlOptIn } from "../../js/avatar-northstar-panel.js";
import * as PREP from "../../tools/avatar/northstar-ls2-runtime-prep.mjs";
import { reachableSweaterOutfits } from "../../tools/avatar/verify-northstar-ls2-runtime-d337.mjs";

const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };
const A = PREP.approval(), key = (o) => [o.top, o.bottom, o.shoes].join("+");

test("D-337 D-336's 30 are on the list; with the beige sneakers 24 reachable (skirt, capri, navy and sand trousers), the olive six not; no outfit added", () => {
  const want = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + c.shoes).sort(); assert.ok(want.every((k) => L.NORTHSTAR_LS2_COMBOS.includes(k)));
  assert.deepEqual(Object.keys(L.NORTHSTAR_LS2_SWEATERS), Object.values(A.designs).map((d) => d.id)); for (const d of Object.values(A.designs)) assert.equal(L.NORTHSTAR_LS2_SWEATERS[d.id].item, d.proposedRuntimeItem);
  const reach = reachableSweaterOutfits(L).map(([, o]) => key(o)).filter((k) => k.endsWith("+shoes-sneakers-beige")); assert.equal(reach.length, 24); assert.ok(reach.every((k) => want.includes(k)));
  assert.deepEqual(want.filter((k) => !reach.includes(k)).map((k) => k.split("+")[1]), Array(6).fill("bottom-trousers-square-olive"));
  assert.equal(Object.keys(L.NORTHSTAR_OUTFITS).length, 19);
});

test("D-337 the whole effective outfit decides; outside the list, an unknown ID or another shoe: the outfit's own top", () => {
  assert.equal(L.northstarOutfitFor("K01", null, null, null, "LS2-HEATHER").top, "top-sweater-ls2-heather");
  assert.equal(L.northstarOutfitFor("K07", "TP-FOX-NAV", null, null, "LS2-NAVY-FOX").top, "top-sweater-ls2-navy-fox", "replaces a print tee too");
  assert.equal(L.northstarOutfitFor("K04", null, "TS-SND", null, "LS2-NAVY").top, "top-sweater-ls2-navy");
  for (const [k, t, p, s] of [["K04", null, null, null], ["K16", null, null, null], ["K05", null, null, null], ["K04", null, null, "SV1-V5-CHALK"]]) {   // the shorts: never on the list
    assert.equal(L.northstarSweaterAllowed(k, t, p, s, "LS2-HEATHER"), false, [k, t, p, s].join()); assert.equal(L.northstarOutfitFor(k, t, p, s, "LS2-HEATHER").top, L.northstarOutfitFor(k, t, p, s).top); }
  for (const bad of ["LS2-RED", "", null, 3]) assert.equal(L.northstarOutfitFor("K01", null, null, null, bad).top, "top-tee-hip-cream");
  assert.deepEqual(L.northstarOutfitFor("K01", null, null, null), L.NORTHSTAR_OUTFITS.K01, "without a sweater nothing changes");
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const w of Object.keys(L.NORTHSTAR_LS2_SWEATERS)) {
    const o = L.northstarOutfitFor(k, null, p), on = L.NORTHSTAR_LS2_COMBOS.includes(L.NORTHSTAR_LS2_SWEATERS[w].item + "+" + o.bottom + "+" + o.shoes);
    assert.equal(L.northstarSweaterAllowed(k, null, p, null, w), on); assert.equal(L.northstarOutfitFor(k, null, p, null, w).top, on ? L.NORTHSTAR_LS2_SWEATERS[w].item : o.top); }
});

test("D-337 the stored choice: shown where allowed; outside the list the own top with the choice kept, on every load; no opt-in, nothing", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER" };
  for (const s of ["avatar", "quiz", "hub"]) { const r = withStorage(on, () => L.northstarRenderFor(s, [])); assert.deepEqual([r.key, r.sweater, r.tee], ["K01+LS2-HEATHER", "LS2-HEATHER", null]); }
  assert.equal(withStorage({ ...on, avatar_northstar_pants: "TS-NAV" }, () => L.northstarRenderFor("hub", [])).key, "K01+TS-NAV+LS2-HEATHER");
  assert.equal(withStorage({ ...on, avatar_northstar_tee: "TP-FOX-NAV" }, () => L.northstarRenderFor("hub", [])).key, "K01+LS2-HEATHER", "the replaced tee is not named");
  for (const load of [1, 2]) withStorage({ ...on, avatar_northstar_outfit: "K16" }, (m) => { const r = L.northstarRenderFor("quiz", []); assert.deepEqual([r.key, r.sweater], ["K16", null], "load " + load); assert.equal(m.get("avatar_northstar_sweater"), "LS2-HEATHER"); });
  withStorage({ ...on, avatar_northstar_outfit: "K04", avatar_northstar_shoes: "SV1-V5-CHALK" }, (m) => { const r = L.northstarRenderFor("hub", []); assert.deepEqual([r.key, r.sweater], ["K04+SV1-V5-CHALK", null]); assert.equal(m.get("avatar_northstar_sweater"), "LS2-HEATHER"); });
  assert.equal(withStorage({ avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER" }, () => L.northstarRenderFor("hub", [])), null);
  withStorage({ ...on }, (m) => { applyNorthstarUrlOptIn("?northstar=0"); assert.equal(m.has("avatar_northstar_sweater"), false); });
});

test("D-337 the plan: the hip seam after the shoes and right before the bottom, the sweater's body after it; the tees' plans unchanged", () => {
  for (const c of A.combinations) { const srcs = L.northstarPlanFor({ top: c.top, bottom: c.bottom, shoes: c.shoes }).map((s) => s.src.split("/").pop()), k = srcs.indexOf(L.NORTHSTAR_LS2_HIP_SEAM);
    assert.equal(srcs[k - 1], c.shoes + "-shoes-v1.webp"); assert.equal(srcs[k + 1], c.bottom + "-pants-v1.webp"); assert.ok(srcs.indexOf(c.top + "-top-body-v1.webp") > k + 1);
    assert.ok(srcs.includes("top-sweater-ls2-shadow-body-v1.webp") && srcs.includes("top-sweater-ls2-shadow-arms-v1.webp")); }
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) assert.ok(!L.northstarPlanFor(L.NORTHSTAR_OUTFITS[k]).some((s) => s.src.includes("hip-seam")));
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});
