// D-340 — the owner-approved extension of the sweater list (no private file needed): NORTHSTAR_LS2_COMBOS is exactly the union of
// D-336's 30 and D-340's 240 (ls2-shoe-owner-approval-v1.json, resting on D-339's candidate file by sha256); the navy shorts never, the
// charcoal SV1 sneakers only with the skirt and capri; 264 reachable; the whole effective outfit after the top, trousers and shoe choices
// decides; outside the list the outfit's own top with the choice kept; a shoe change keeps the sweater where the new outfit is listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { reachableSweaterOutfits } from "../../tools/avatar/verify-northstar-ls2-runtime-d337.mjs";
import { approvedUnion } from "../../tools/avatar/verify-northstar-ls2-shoes-runtime-d340.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };

test("D-340 the approval is exactly D-339's 240 candidates, on the candidate file's sha256", () => {
  const { B } = approvedUnion(), K = JSON.parse(readFileSync(join(ROOT, B.basis.candidates.file), "utf8"));
  assert.equal(B.decision, "D-340"); assert.equal(sha(readFileSync(join(ROOT, B.basis.candidates.file))), B.basis.candidates.sha256);
  assert.deepEqual(B.combinations.map((c) => c.id), K.candidates.map((c) => c.id)); assert.equal(B.combinations.length, 240);
});

test("D-340 the list is the union (270); the restrictions hold; 264 reachable, the olive six with the beige sneakers not", () => {
  const { keys } = approvedUnion(); assert.deepEqual([...L.NORTHSTAR_LS2_COMBOS].sort(), [...keys].sort()); assert.equal(new Set(L.NORTHSTAR_LS2_COMBOS).size, 270);
  assert.ok(!L.NORTHSTAR_LS2_COMBOS.some((k) => k.includes("shorts"))); assert.deepEqual([...new Set(L.NORTHSTAR_LS2_COMBOS.filter((k) => k.endsWith("sv1-charcoal")).map((k) => k.split("+")[1]))].sort(), ["bottom-capri-lightblue", "bottom-skirt-sand"]);
  const reach = reachableSweaterOutfits(L).map(([, o]) => [o.top, o.bottom, o.shoes].join("+")); assert.equal(reach.length, 264); assert.ok(reach.every((k) => keys.includes(k)));
  assert.deepEqual(keys.filter((k) => !reach.includes(k)).map((k) => k.split("+").slice(1).join("+")), Array(6).fill("bottom-trousers-square-olive+shoes-sneakers-beige"));
});

test("D-340 the whole effective outfit decides: shoes and trousers choices keep the sweater where listed; shorts never", () => {
  assert.equal(L.northstarOutfitFor("K01", null, null, "SV1-V5-CHALK", "LS2-HEATHER").top, "top-sweater-ls2-heather");
  assert.equal(L.northstarOutfitFor("K07", null, null, "AB1-BOOT-ORIGINAL", "LS2-NAVY-FOX").top, "top-sweater-ls2-navy-fox");
  assert.equal(L.northstarOutfitFor("K17", null, null, null, "LS2-HEATHER-TEAPOT").top, "top-sweater-ls2-heather-teapot", "olive with the white sneakers");
  assert.equal(L.northstarOutfitFor("K02", null, "TS-NAV", null, "LS2-NAVY").top, "top-sweater-ls2-navy", "navy trousers with the lace-up boots");
  for (const k of ["K04", "K05", "K06", "K10", "K11", "K12", "K16"]) for (const s of [null, ...Object.keys(L.NORTHSTAR_SHOE_CHOICES)]) assert.equal(L.northstarSweaterAllowed(k, null, null, s, "LS2-HEATHER"), false, k + " " + s);
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(L.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(L.NORTHSTAR_LS2_SWEATERS)) {
    const o = L.northstarOutfitFor(k, null, p, s), on = L.NORTHSTAR_LS2_COMBOS.includes(L.NORTHSTAR_LS2_SWEATERS[w].item + "+" + o.bottom + "+" + o.shoes);
    assert.equal(L.northstarSweaterAllowed(k, null, p, s, w), on); assert.equal(L.northstarOutfitFor(k, null, p, s, w).top, on ? L.NORTHSTAR_LS2_SWEATERS[w].item : o.top); }
});

test("D-340 the stored choice: a shoe choice keeps it; shorts show the own top with the choice kept on every load; returning brings it back", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER", avatar_northstar_shoes: "SV1-V5-CHALK" };
  assert.deepEqual(withStorage(on, () => { const r = L.northstarRenderFor("hub", []); return [r.key, r.sweater]; }), ["K01+SV1-V5-CHALK+LS2-HEATHER+hair:standard", "LS2-HEATHER"]);
  for (const load of [1, 2]) withStorage({ ...on, avatar_northstar_outfit: "K04" }, (m) => { const r = L.northstarRenderFor("quiz", []); assert.deepEqual([r.key, r.sweater], ["K04+SV1-V5-CHALK+hair:standard", null], "load " + load); assert.equal(m.get("avatar_northstar_sweater"), "LS2-HEATHER"); });
  assert.equal(withStorage({ ...on, avatar_northstar_outfit: "K07" }, () => L.northstarRenderFor("avatar", [])).key, "K07+SV1-V5-CHALK+LS2-HEATHER+hair:standard");
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, true);
});
