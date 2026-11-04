// D-331 — the 2 owner-approved AB-1 ankle boots (D-326) in the Northstar opt-in (no private file needed): a boot is shown ONLY where the
// whole effective outfit (K outfit after the print tee and the trousers) is one of NORTHSTAR_AB1_BOOT_COMBOS — exactly D-326's 180, which
// are also exactly every outfit the opt-in can reach; outside its list a stored boot is ignored and the outfit keeps its own shoes, also
// after a reload (the choice is read from storage again) or a change of top, trousers or K outfit; the unapproved black + gum and unknown
// IDs are refused; the plan draws the boot with its own covering mask and the published ankle boots' shadow; the figure key names it;
// removing the choice returns to the outfit's own shoes; nothing changes without the opt-in; ?northstar=0 forgets it; the SV1-V5 shoes
// keep their own list (charcoal with long trousers stays refused). 10 of the 180 were shown to the owner, 170 checked technically.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../js/avatar-layers.js";
import { applyNorthstarUrlOptIn } from "../../js/avatar-northstar-panel.js";
import * as PREP from "../../tools/avatar/northstar-ab1-boot-runtime-prep.mjs";
import { reachableBootOutfits } from "../../tools/avatar/verify-northstar-ab1-boots-runtime-d331.mjs";

const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };
const key = (o) => [o.top, o.bottom, o.shoes].join("+"), A = PREP.approval();

test("D-331 the list is exactly D-326's 180 mapped combinations, every one reachable and nothing else reachable; 10 shown, 170 checked", () => {
  const mapped = PREP.combinations(L, A), want = mapped.map((c) => c.key).sort();
  assert.equal(want.length, 180); assert.deepEqual([...L.NORTHSTAR_AB1_BOOT_COMBOS].sort(), want); assert.equal(new Set(L.NORTHSTAR_AB1_BOOT_COMBOS).size, 180);
  assert.deepEqual(Object.keys(L.NORTHSTAR_AB1_BOOTS), ["AB1-BOOT-ORIGINAL", "AB1-BOOT-LIGHTSAND"]); assert.deepEqual(Object.keys(L.NORTHSTAR_SHOE_CHOICES), [...Object.keys(L.NORTHSTAR_SV1_SHOES), "AB1-BOOT-ORIGINAL", "AB1-BOOT-LIGHTSAND"]);
  assert.deepEqual(Object.values(L.NORTHSTAR_AB1_BOOTS).map((b) => b.label), ["Ankelstøvler · original brun", "Ankelstøvler · lys sand"]);
  assert.deepEqual(reachableBootOutfits(L).map(([, o]) => key(o)).sort(), want);
  assert.equal(mapped.filter((c) => c.shownInD325).length, 10); assert.ok(mapped.filter((c) => c.shownInD325).every((c) => c.top === "top-tee-hip-cream"));
  assert.equal(Object.keys(L.NORTHSTAR_OUTFITS).length, 19, "no outfit added");
});

test("D-331 the whole effective outfit decides; outside the list, unknown or unapproved IDs: the outfit's own shoes", () => {
  assert.equal(L.northstarOutfitFor("K16", null, null, "AB1-BOOT-ORIGINAL").shoes, "shoes-ankleboots-ab1-original");
  assert.equal(L.northstarOutfitFor("K04", "TP-TEA-NAV", "TS-SND", "AB1-BOOT-LIGHTSAND").shoes, "shoes-ankleboots-ab1-lightsand");
  assert.equal(L.northstarOutfitFor("K18", null, null, "AB1-BOOT-LIGHTSAND").shoes, "shoes-ankleboots-ab1-lightsand");
  for (const s of ["AB1-BOOT-BLACKGUM", "AB1-BOOT-ORANGE", "", null, 7]) { assert.equal(L.northstarShoeAllowed("K04", null, null, s), false); assert.equal(L.northstarOutfitFor("K04", null, null, s).shoes, "shoes-sneakers-beige"); }
  for (const s of Object.keys(L.NORTHSTAR_AB1_BOOTS)) { assert.equal(L.northstarShoeAllowed(null, null, null, s), false); assert.equal(L.northstarShoeAllowed("K99", null, null, s), false); assert.equal(L.northstarOutfitFor(null, null, null, s), null); }
  // every (K, tee, trousers): allowed exactly when the effective outfit with the boot is on the list
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(L.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const [s, b] of Object.entries(L.NORTHSTAR_AB1_BOOTS)) {
    const o = L.northstarOutfitFor(k, t, p), on = L.NORTHSTAR_AB1_BOOT_COMBOS.includes(o.top + "+" + o.bottom + "+" + b.item);
    assert.equal(L.northstarShoeAllowed(k, t, p, s), on); assert.equal(L.northstarOutfitFor(k, t, p, s).shoes, on ? b.item : o.shoes); }
  // the SV1-V5 shoes keep their own list
  assert.equal(L.northstarShoeAllowed("K04", null, "TS-NAV", "SV1-V5-CHARCOAL"), false); assert.equal(L.northstarOutfitFor("K04", null, "TS-NAV", "SV1-V5-CHARCOAL").shoes, "shoes-sneakers-beige");
  assert.ok(!L.NORTHSTAR_AB1_BOOT_COMBOS.some((c) => c.includes("sv1")) && !L.NORTHSTAR_SV1_SHOE_COMBOS.some((c) => c.includes("ab1")));
});

test("D-331 the stored choice: shown where allowed, ignored elsewhere and on every reload; removing it returns; no opt-in, nothing", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K16", avatar_northstar_shoes: "AB1-BOOT-ORIGINAL" };
  for (const s of ["avatar", "quiz", "hub"]) { const r = withStorage(on, () => L.northstarRenderFor(s, [])); assert.deepEqual([r.key, r.shoe], ["K16+AB1-BOOT-ORIGINAL", "AB1-BOOT-ORIGINAL"]); }
  const c = withStorage({ ...on, avatar_northstar_outfit: "K04", avatar_northstar_tee: "TP-FOX-NAV", avatar_northstar_pants: "TS-SND" }, () => L.northstarRenderFor("quiz", [])); assert.equal(c.key, "K04+TP-FOX-NAV+TS-SND+AB1-BOOT-ORIGINAL");
  // a stored unapproved or unknown ID: the outfit's own shoes, read again on each load (two reads = a reload), the stored value untouched
  for (const bad of ["AB1-BOOT-BLACKGUM", "AB1-BOOT-ORANGE"]) for (const load of [1, 2]) withStorage({ ...on, avatar_northstar_shoes: bad }, (m) => { const r = L.northstarRenderFor("hub", []); assert.deepEqual([r.key, r.shoe], ["K16", null], bad + " load " + load); assert.equal(m.get("avatar_northstar_shoes"), bad); });
  assert.equal(withStorage({ ...on, avatar_northstar_shoes: "AB1-BOOT-ORIGINAL" }, (m) => { m.delete("avatar_northstar_shoes"); return L.northstarRenderFor("hub", []); }).key, "K16");
  assert.equal(withStorage({ avatar_northstar_outfit: "K16", avatar_northstar_shoes: "AB1-BOOT-ORIGINAL" }, () => L.northstarRenderFor("hub", [])), null);
  withStorage({ ...on }, (m) => { applyNorthstarUrlOptIn("?northstar=0"); assert.equal(m.has("avatar_northstar_shoes"), false); assert.equal(m.has("avatar_northstar"), false); });
});

test("D-331 the plan draws the boot with its own covering mask and the published ankle boots' shadow; the files are D-326's", () => {
  for (const [s, b] of Object.entries(L.NORTHSTAR_AB1_BOOTS)) { const plan = L.northstarPlanFor(L.northstarOutfitFor("K16", null, "TS-NAV", s)), srcs = plan.flatMap((x) => [x.src, x.cut].filter(Boolean).map((f) => f.split("/").pop()));
    assert.ok(srcs.includes(b.item + "-shoes-v1.webp")); assert.ok(srcs.includes("hide-" + b.item + "-v1.webp")); assert.ok(srcs.includes("shoes-ankleboots-brown-shadow-body-v1.webp"));
    assert.ok(!srcs.includes("shoes-ankleboots-brown-shoes-v1.webp"), "the outfit's own boots are not drawn"); }
  assert.deepEqual(A.approved.map((b) => b.proposedRuntimeItem), Object.values(L.NORTHSTAR_AB1_BOOTS).map((b) => b.item)); assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});
