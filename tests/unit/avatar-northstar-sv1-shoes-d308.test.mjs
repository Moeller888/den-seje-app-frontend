// D-308 — the 4 owner-approved SV1-V5 shoes (D-305) in the Northstar opt-in (no private file needed): a shoe is shown ONLY where the
// whole effective outfit (K outfit after the print tee and the trousers) is one of the 21 approved combinations — 18 reachable, the 3
// with olive trousers not (no outfit is added); charcoal with long trousers, a print tee and the blue tee are refused and the outfit
// keeps its own shoes, also after a reload or a change of top, trousers or K outfit; the plan draws the shoe with its own covering mask
// and the beige sneakers' shadow; the figure key names it; removing the choice returns to the outfit's own shoes; nothing changes
// without the opt-in; ?northstar=0 forgets it; the panel offers it with a reason for every unavailable choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { reachableShoeOutfits } from "../../tools/avatar/verify-northstar-sv1-shoes-runtime-d308.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(REPO, f), "utf8"), A = JSON.parse(read("tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-v5-owner-approval-v1.json"));
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };
const key = (o) => [o.top, o.bottom, o.shoes].join("+");

test("D-308 the list is exactly the approval file's 21 combinations; 18 reachable, the 3 olive ones not", () => {
  const want = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + L.NORTHSTAR_SV1_SHOES[c.candidate].item).sort();
  assert.deepEqual([...L.NORTHSTAR_SV1_SHOE_COMBOS].sort(), want); assert.deepEqual(Object.keys(L.NORTHSTAR_SV1_SHOES), ["SV1-V5-CHALK", "SV1-V5-CHARCOAL", "SV1-V5-NAVYWHITE", "SV1-V5-BURGUNDYGUM"]);
  for (const n of A.notApproved) assert.ok(!L.NORTHSTAR_SV1_SHOE_COMBOS.some((c) => c.includes("bottom-" + n.split("--")[1] + "+") && c.endsWith("sv1-charcoal")), n);
  const reach = reachableShoeOutfits(L), keys = reach.map(([, o]) => key(o));
  assert.equal(reach.length, 18); assert.ok(keys.every((k) => want.includes(k)));
  assert.deepEqual(want.filter((k) => !keys.includes(k)), want.filter((k) => k.includes("trousers-square-olive")));
  assert.equal(Object.keys(L.NORTHSTAR_OUTFITS).length, 19, "no outfit added");
});

test("D-308 the whole effective outfit decides: refused combinations keep the outfit's own shoes", () => {
  const own = (k, t, p) => L.northstarOutfitFor(k, t, p);
  // allowed
  assert.equal(L.northstarOutfitFor("K04", null, null, "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-low-sv1-charcoal");
  assert.equal(L.northstarOutfitFor("K01", null, "TS-NAV", "SV1-V5-CHALK").shoes, "shoes-sneakers-low-sv1-chalk");
  // refused: charcoal with long trousers, a print tee, the blue tee, an unknown ID, no outfit
  assert.deepEqual(L.northstarOutfitFor("K04", null, "TS-NAV", "SV1-V5-CHARCOAL"), own("K04", null, "TS-NAV")); assert.equal(L.northstarOutfitFor("K04", null, "TS-NAV", "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-beige");
  assert.equal(L.northstarOutfitFor("K04", "TP-TEA-NAV", null, "SV1-V5-CHALK").shoes, "shoes-sneakers-beige");
  assert.equal(L.northstarOutfitFor("K12", null, null, "SV1-V5-NAVYWHITE").shoes, "shoes-sneakers-white");
  assert.equal(L.northstarOutfitFor("K17", null, null, "SV1-V5-CHALK").shoes, "shoes-sneakers-white", "blue tee + olive: not approved");
  assert.deepEqual(L.northstarOutfitFor("K04", null, null, "SV1-V5-ORANGE"), own("K04", null, null)); assert.equal(L.northstarOutfitFor("K99", null, null, "SV1-V5-CHALK"), null);
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(L.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of Object.keys(L.NORTHSTAR_SV1_SHOES)) {
    const o = L.northstarOutfitFor(k, t, p, s); if (!o) continue; const swapped = o.shoes === L.NORTHSTAR_SV1_SHOES[s].item;
    assert.equal(swapped, L.NORTHSTAR_SV1_SHOE_COMBOS.includes(key(o)), [k, t, p, s].join("+")); if (!swapped) assert.deepEqual(o, own(k, t, p)); }
});

test("D-308 a stored shoe never appears on an unapproved outfit after a reload or a change of top, trousers or K outfit", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K04", avatar_northstar_shoes: "SV1-V5-CHARCOAL" };
  const r = withStorage(on, () => L.northstarRenderFor("avatar", [])); assert.deepEqual([r.key, r.shoe], ["K04+SV1-V5-CHARCOAL", "SV1-V5-CHARCOAL"]);
  for (const [change, want] of [[{ avatar_northstar_pants: "TS-NAV" }, "K04+TS-NAV"], [{ avatar_northstar_tee: "TP-SHD-FOR" }, "K04+TP-SHD-FOR"], [{ avatar_northstar_outfit: "K12" }, "K12"], [{ avatar_northstar_outfit: "K17" }, "K17"]]) {
    for (const s of ["avatar", "quiz", "hub"]) { const x = withStorage({ ...on, ...change }, () => L.northstarRenderFor(s, [])); assert.deepEqual([x.key, x.shoe], [want, null], JSON.stringify(change) + " " + s);
      assert.ok(!x.plan.some((st) => /sv1/.test(st.src)), "no SV1 file drawn"); } }
  // back to an approved outfit: the stored choice applies again (it was never rewritten)
  const back = withStorage({ ...on, avatar_northstar_pants: "TS-NAV" }, (m) => { m.delete("avatar_northstar_pants"); return L.northstarRenderFor("hub", []); }); assert.equal(back.key, "K04+SV1-V5-CHARCOAL");
  const c = withStorage({ ...on, avatar_northstar_shoes: "SV1-V5-CHALK", avatar_northstar_pants: "TS-SND", avatar_northstar_outfit: "K07" }, () => L.northstarRenderFor("quiz", [])); assert.deepEqual([c.key, c.pants, c.shoe], ["K07+TS-SND+SV1-V5-CHALK", "TS-SND", "SV1-V5-CHALK"]);
});

test("D-308 the plan: the shoe with its own covering mask, in the D-242 order, the beige sneakers' shadow; without a choice the K plan", () => {
  for (const [label, o, s] of reachableShoeOutfits(L)) { const plan = L.northstarPlanFor(o), item = L.NORTHSTAR_SV1_SHOES[s].item;
    assert.deepEqual(plan.filter((x) => x.op === "draw").map((x) => x.src.split("/").pop()), ["figure-body-v1.webp", item + "-shoes-v1.webp", o.bottom + "-pants-v1.webp", o.top + "-top-body-v1.webp", "figure-arms-v1.webp", o.top + "-sleeves-v1.webp", "figure-head-v1.webp"], label);
    for (const x of plan.filter((x) => x.figure)) assert.ok(x.cut.endsWith("/hide-" + item + "-v1.webp"), label);
    assert.ok(plan.some((x) => x.op === "shade" && x.src.endsWith("/shoes-sneakers-beige-shadow-body-v1.webp")), label); }
  const r = withStorage({ avatar_northstar: "1", avatar_northstar_outfit: "K05" }, () => L.northstarRenderFor("quiz", [])); assert.deepEqual([r.key, r.shoe], ["K05", null]); assert.deepEqual(r.plan, L.northstarCanvasPlan("K05"));
});

test("D-308 without the opt-in nothing changes, even with a stored shoe; ?northstar=0 forgets it; the panel offers it with reasons", async () => {
  for (const st of [{ avatar_northstar_shoes: "SV1-V5-CHALK" }, { avatar_northstar_outfit: "K01", avatar_northstar_shoes: "SV1-V5-CHALK" }, { avatar_northstar: "1", avatar_northstar_shoes: "SV1-V5-CHALK" }])
    for (const s of ["quiz", "hub", "avatar", "shop"]) assert.equal(withStorage(st, () => L.northstarRenderFor(s, [])), null, JSON.stringify(st) + " " + s);
  const P = await import("../../js/avatar-northstar-panel.js");
  withStorage({ avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_tee: "TP-TEA-CRM", avatar_northstar_pants: "TS-NAV", avatar_northstar_shoes: "SV1-V5-CHALK" }, (m) => { P.applyNorthstarUrlOptIn("?northstar=0"); assert.deepEqual([...m.keys()], []); });
  const src = read("js/avatar-northstar-panel.js");
  assert.match(src, /"Sko"/); assert.match(src, /Outfittets egne sko/); assert.match(src, /northstarShoeAllowed\(current, shown, shownPants, id\)/);
  assert.match(src, /kun godkendt med den cremefarvede T-shirt uden tryk/); assert.match(src, /Koks er ikke godkendt med lange bukser/);
  assert.ok(!/supabase|fetch\(|insert|update\(/i.test(src)); assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
  assert.deepEqual(Object.values(L.NORTHSTAR_SV1_SHOES).map((s) => s.label), ["Lave sneakers · kridt", "Lave sneakers · koks", "Lave sneakers · navy/hvid", "Lave sneakers · bordeaux/gummi"]);
});
