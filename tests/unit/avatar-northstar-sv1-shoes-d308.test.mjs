// D-308 — the 4 owner-approved SV1-V5 shoes (D-305) in the Northstar opt-in (no private file needed): a shoe is shown ONLY where the
// whole effective outfit (K outfit after the print tee and the trousers) is one of the 21 approved combinations — 18 reachable, the 3
// with olive trousers not (no outfit is added); charcoal with long trousers, a print tee and the blue tee are refused and the outfit
// keeps its own shoes, also after a reload or a change of top, trousers or K outfit; the plan draws the shoe with its own covering mask
// and the beige sneakers' shadow; the figure key names it; removing the choice returns to the outfit's own shoes; nothing changes
// without the opt-in; ?northstar=0 forgets it; the panel offers it with a reason for every unavailable choice.
// D-314: the owner approved D-312's 305 candidates — the list is now 21 + 305 = 326 (the blue tee and the 16 print tees too), 323
// reachable; charcoal with long trousers stays refused on every top. The assertions below state that approved state.
// D-349: the tees' layer files are now revision 2 (U-343-1); the D-242 stack is checked on the v1 revision (the items without layerRev)
// and the runtime plan is that stack with exactly the tee's two layers as -v2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { reachableShoeOutfits } from "../../tools/avatar/verify-northstar-sv1-shoes-runtime-d308.mjs";
import { v1Table } from "../../tools/avatar/verify-northstar-tee-armline-runtime-d349.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(REPO, f), "utf8"), A = JSON.parse(read("tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-v5-owner-approval-v1.json"));
const B = JSON.parse(read("tools/avatar/fixtures/northstar-wardrobe/shoe-source/sv1-shoe-tee-owner-approval-v1.json"));
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };
const key = (o) => [o.top, o.bottom, o.shoes].join("+");

test("D-308/D-314 the list is exactly the two approval files' 326 combinations; 323 reachable, the 3 cream + olive ones not", () => {
  const want = [...A.combinations.map((c) => c.top + "+" + c.bottom + "+" + L.NORTHSTAR_SV1_SHOES[c.candidate].item), ...B.combinations.map((c) => c.top + "+" + c.bottom + "+" + L.NORTHSTAR_SV1_SHOES[c.shoe].item)].sort();
  assert.equal(want.length, 326); assert.equal(new Set(want).size, 326);
  assert.deepEqual([...L.NORTHSTAR_SV1_SHOE_COMBOS].sort(), want); assert.deepEqual(Object.keys(L.NORTHSTAR_SV1_SHOES), ["SV1-V5-CHALK", "SV1-V5-CHARCOAL", "SV1-V5-NAVYWHITE", "SV1-V5-BURGUNDYGUM"]);
  for (const n of [...A.notApproved, ...B.notApproved]) assert.ok(!L.NORTHSTAR_SV1_SHOE_COMBOS.some((c) => c.includes("bottom-" + n.split("--").pop() + "+") && c.endsWith("sv1-charcoal")), n);
  const reach = reachableShoeOutfits(L), keys = reach.map(([, o]) => key(o));
  assert.equal(reach.length, 323); assert.ok(keys.every((k) => want.includes(k)));
  assert.deepEqual(want.filter((k) => !keys.includes(k)), want.filter((k) => k.startsWith("top-tee-hip-cream+bottom-trousers-square-olive")));
  assert.equal(Object.keys(L.NORTHSTAR_OUTFITS).length, 19, "no outfit added");
});

test("D-308 the whole effective outfit decides: refused combinations keep the outfit's own shoes", () => {
  const own = (k, t, p) => L.northstarOutfitFor(k, t, p);
  // allowed
  assert.equal(L.northstarOutfitFor("K04", null, null, "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-low-sv1-charcoal");
  assert.equal(L.northstarOutfitFor("K01", null, "TS-NAV", "SV1-V5-CHALK").shoes, "shoes-sneakers-low-sv1-chalk");
  // D-314: a print tee and the blue tee with every bottom they were checked with
  assert.equal(L.northstarOutfitFor("K04", "TP-TEA-NAV", null, "SV1-V5-CHALK").shoes, "shoes-sneakers-low-sv1-chalk");
  assert.equal(L.northstarOutfitFor("K12", null, null, "SV1-V5-NAVYWHITE").shoes, "shoes-sneakers-low-sv1-navywhite");
  assert.equal(L.northstarOutfitFor("K17", null, null, "SV1-V5-CHALK").shoes, "shoes-sneakers-low-sv1-chalk", "blue tee + olive");
  assert.equal(L.northstarOutfitFor("K02", "TP-FOX-FOR", null, "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-low-sv1-charcoal", "charcoal with a skirt and a print tee");
  // refused: charcoal with long trousers on every top, an unknown ID, no outfit
  assert.deepEqual(L.northstarOutfitFor("K04", null, "TS-NAV", "SV1-V5-CHARCOAL"), own("K04", null, "TS-NAV")); assert.equal(L.northstarOutfitFor("K04", null, "TS-NAV", "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-beige");
  assert.equal(L.northstarOutfitFor("K04", "TP-TEA-NAV", "TS-SND", "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-beige", "print tee + sand trousers");
  assert.equal(L.northstarOutfitFor("K17", null, null, "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-white", "blue tee + olive");
  assert.equal(L.northstarOutfitFor("K12", null, "TS-NAV", "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-white", "blue tee + navy trousers");
  assert.deepEqual(L.northstarOutfitFor("K04", null, null, "SV1-V5-ORANGE"), own("K04", null, null)); assert.equal(L.northstarOutfitFor("K99", null, null, "SV1-V5-CHALK"), null);
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(L.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of Object.keys(L.NORTHSTAR_SV1_SHOES)) {
    const o = L.northstarOutfitFor(k, t, p, s); if (!o) continue; const swapped = o.shoes === L.NORTHSTAR_SV1_SHOES[s].item;
    assert.equal(swapped, L.NORTHSTAR_SV1_SHOE_COMBOS.includes(key(o)), [k, t, p, s].join("+")); if (!swapped) assert.deepEqual(o, own(k, t, p)); }
});

test("D-308 a stored shoe never appears on an unapproved outfit after a reload or a change of top, trousers or K outfit", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K04", avatar_northstar_shoes: "SV1-V5-CHARCOAL" };
  const r = withStorage(on, () => L.northstarRenderFor("avatar", [])); assert.deepEqual([r.key, r.shoe], ["K04+SV1-V5-CHARCOAL", "SV1-V5-CHARCOAL"]);
  // D-314: with a print tee or on K12 (blue tee + shorts) charcoal is approved; with long trousers on any top it is not
  for (const [change, want] of [[{ avatar_northstar_tee: "TP-SHD-FOR" }, "K04+TP-SHD-FOR+SV1-V5-CHARCOAL"], [{ avatar_northstar_outfit: "K12" }, "K12+SV1-V5-CHARCOAL"]])
    for (const s of ["avatar", "quiz", "hub"]) assert.equal(withStorage({ ...on, ...change }, () => L.northstarRenderFor(s, [])).key, want, JSON.stringify(change) + " " + s);
  for (const [change, want] of [[{ avatar_northstar_pants: "TS-NAV" }, "K04+TS-NAV"], [{ avatar_northstar_tee: "TP-SHD-FOR", avatar_northstar_pants: "TS-SND" }, "K04+TP-SHD-FOR+TS-SND"], [{ avatar_northstar_outfit: "K17" }, "K17"], [{ avatar_northstar_outfit: "K18" }, "K18"], [{ avatar_northstar_outfit: "K12", avatar_northstar_pants: "TS-SND" }, "K12+TS-SND"]]) {
    for (const s of ["avatar", "quiz", "hub"]) { const x = withStorage({ ...on, ...change }, () => L.northstarRenderFor(s, [])); assert.deepEqual([x.key, x.shoe], [want, null], JSON.stringify(change) + " " + s);
      assert.ok(!x.plan.some((st) => /sv1/.test(st.src)), "no SV1 file drawn"); } }
  // back to an approved outfit: the stored choice applies again (it was never rewritten)
  const back = withStorage({ ...on, avatar_northstar_pants: "TS-NAV" }, (m) => { m.delete("avatar_northstar_pants"); return L.northstarRenderFor("hub", []); }); assert.equal(back.key, "K04+SV1-V5-CHARCOAL");
  const c = withStorage({ ...on, avatar_northstar_shoes: "SV1-V5-CHALK", avatar_northstar_pants: "TS-SND", avatar_northstar_outfit: "K07" }, () => L.northstarRenderFor("quiz", [])); assert.deepEqual([c.key, c.pants, c.shoe], ["K07+TS-SND+SV1-V5-CHALK", "TS-SND", "SV1-V5-CHALK"]);
});

test("D-308 the plan: the shoe with its own covering mask, in the D-242 order, the beige sneakers' shadow; without a choice the K plan", () => {
  const T1 = v1Table(L.NORTHSTAR_ITEMS);
  for (const [label, o, s] of reachableShoeOutfits(L)) { const plan = L.northstarPlanFor(o), plan1 = L.northstarPlanFor(o, T1), item = L.NORTHSTAR_SV1_SHOES[s].item;
    assert.deepEqual(plan1.filter((x) => x.op === "draw").map((x) => x.src.split("/").pop()), ["figure-body-v1.webp", item + "-shoes-v1.webp", o.bottom + "-pants-v1.webp", o.top + "-top-body-v1.webp", "figure-arms-v1.webp", o.top + "-sleeves-v1.webp", "figure-head-v1.webp"], label);
    assert.ok(o.top.startsWith("top-tee-"), label); assert.deepEqual(plan.filter((x) => x.op === "draw").map((x) => x.src.split("/").pop()), ["figure-body-v1.webp", item + "-shoes-v1.webp", o.bottom + "-pants-v1.webp", o.top + "-top-body-v2.webp", "figure-arms-v1.webp", o.top + "-sleeves-v2.webp", "figure-head-v1.webp"], label + " (D-349)");
    for (const x of plan1.filter((x) => x.figure)) assert.ok(x.cut.endsWith("/hide-" + item + "-v1.webp"), label);
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
  assert.match(src, /Koks er ikke godkendt med lange bukser/); assert.ok(!/kun godkendt med den cremefarvede T-shirt/.test(src), "D-314: the cream-only reason is gone");
  assert.ok(!/supabase|fetch\(|insert|update\(/i.test(src)); assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
  assert.deepEqual(Object.values(L.NORTHSTAR_SV1_SHOES).map((s) => s.label), ["Lave sneakers · kridt", "Lave sneakers · koks", "Lave sneakers · navy/hvid", "Lave sneakers · bordeaux/gummi"]);
});
