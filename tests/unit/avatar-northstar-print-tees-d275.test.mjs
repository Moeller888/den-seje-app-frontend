// D-275 — the 16 owner-approved print tees in the Northstar opt-in (no private file needed): only the approved IDs can be chosen
// (TP-FOX-COR and TP-FOX-MUS stay out), only on the outfits whose top is the cream tee (K01–K09, the partners the cut was checked
// with), the plan draws the print tee's own layers in the D-242 order and reuses the cream tee's published skin shadows, the
// figure cache key names the tee, nothing changes without the opt-in, ?northstar=0 forgets the tee, and the panel offers the tees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(REPO, f), "utf8");
const APPROVAL = JSON.parse(read("tools/avatar/fixtures/northstar-wardrobe/tee-master/tp-owner-approval-v1.json"));
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };
const ALLOWED = Object.keys(L.NORTHSTAR_OUTFITS).filter((k) => L.NORTHSTAR_OUTFITS[k].top === "top-tee-hip-cream");

test("D-275 only the 16 approved print tees can be chosen; TP-FOX-COR, TP-FOX-MUS and anything else are ignored; a blocked storage never throws", () => {
  assert.deepEqual(Object.keys(L.NORTHSTAR_PRINT_TEES), APPROVAL.approved);
  for (const id of APPROVAL.approved) assert.equal(withStorage({ avatar_northstar_tee: id }, () => L.northstarSelectedTee()), id);
  for (const v of ["TP-FOX-COR", "TP-FOX-MUS", "tp-tea-crm", "TP-TEA-XXX", "top-tee-hip-print-teapot-cream", "", "__proto__", "toString"]) assert.equal(withStorage({ avatar_northstar_tee: v }, () => L.northstarSelectedTee()), null, v);
  const prev = globalThis.localStorage; globalThis.localStorage = { getItem() { throw new Error("blocked"); } };
  try { assert.equal(L.northstarSelectedTee(), null); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; }
  for (const t of Object.values(L.NORTHSTAR_PRINT_TEES)) assert.deepEqual({ ...L.NORTHSTAR_ITEMS[t.item] }, { category: "top", layers: ["top-body", "sleeves"], shadows: ["body", "arms"], shadowsOf: "top-tee-hip-cream" });
});

test("D-275 a print tee replaces the top only on K01–K09 (the cream tee's checked partners); elsewhere the outfit stays as it is", () => {
  assert.deepEqual(ALLOWED, ["K01", "K02", "K03", "K04", "K05", "K06", "K07", "K08", "K09"]);
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) { const o = L.northstarOutfitFor(k, "TP-SHD-NAV");
    if (ALLOWED.includes(k)) assert.deepEqual(o, { ...L.NORTHSTAR_OUTFITS[k], top: "top-tee-hip-print-shield-navy" }, k); else assert.equal(o, L.NORTHSTAR_OUTFITS[k], k); }
  assert.equal(L.northstarOutfitFor("K04", "TP-FOX-COR"), L.NORTHSTAR_OUTFITS.K04); assert.equal(L.northstarOutfitFor("K99", "TP-TEA-CRM"), null); assert.equal(L.northstarTeeAllowed(null), false);
});

test("D-275 the plan: the D-242 stack with the print tee's own layers; the cream tee's published shadows; the figure key names the tee", () => {
  for (const t of Object.keys(L.NORTHSTAR_PRINT_TEES)) for (const k of ALLOWED) {
    const o = L.northstarOutfitFor(k, t), p = L.northstarPlanFor(o), item = L.NORTHSTAR_PRINT_TEES[t].item;
    assert.deepEqual(p.filter((s) => s.op === "draw").map((s) => s.src.split("/").pop()), ["figure-body-v1.webp", o.shoes + "-shoes-v1.webp", o.bottom + "-pants-v1.webp", item + "-top-body-v1.webp", "figure-arms-v1.webp", item + "-sleeves-v1.webp", "figure-head-v1.webp"], k + "+" + t);
    assert.deepEqual(p.filter((s) => s.op === "shade").map((s) => s.src.split("/").pop()).slice(0, 2), ["top-tee-hip-cream-shadow-body-v1.webp", "top-tee-hip-cream-shadow-arms-v1.webp"]); }
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K05", avatar_northstar_tee: "TP-TEA-COR" };
  const r = withStorage(on, () => L.northstarRenderFor("avatar", [])); assert.deepEqual([r.key, r.outfit, r.tee], ["K05+TP-TEA-COR", "K05", "TP-TEA-COR"]);
  const r2 = withStorage({ ...on, avatar_northstar_outfit: "K12" }, () => L.northstarRenderFor("avatar", [])); assert.deepEqual([r2.key, r2.tee], ["K12", null], "the blue tee's outfit ignores the stored tee");
  const r3 = withStorage({ avatar_northstar: "1", avatar_northstar_outfit: "K05" }, () => L.northstarRenderFor("quiz", [])); assert.deepEqual([r3.key, r3.tee], ["K05", null]);
  assert.deepEqual(r3.plan, L.northstarCanvasPlan("K05"), "without a tee the K plan is unchanged");
});

test("D-275 without the opt-in nothing changes, even with a stored tee; ?northstar=0 forgets the outfit and the tee", async () => {
  for (const st of [{ avatar_northstar_tee: "TP-TEA-CRM" }, { avatar_northstar_outfit: "K01", avatar_northstar_tee: "TP-TEA-CRM" }, { avatar_northstar: "1", avatar_northstar_tee: "TP-TEA-CRM" }])
    for (const s of ["quiz", "hub", "avatar", "shop"]) assert.equal(withStorage(st, () => L.northstarRenderFor(s, [])), null, JSON.stringify(st) + " " + s);
  const P = await import("../../js/avatar-northstar-panel.js");
  withStorage({ avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_tee: "TP-TEA-CRM" }, (m) => { P.applyNorthstarUrlOptIn("?northstar=0"); assert.deepEqual([...m.keys()], []); });
});

test("D-275 the panel offers the 16 tees (labels from the table) under the K outfits, only for K01–K09, and writes nothing but localStorage", () => {
  const P = read("js/avatar-northstar-panel.js");
  assert.match(P, /NORTHSTAR_PRINT_TEES/); assert.match(P, /T-shirt med tryk \(til K01–K09\)/); assert.match(P, /Outfittets egen T-shirt/); assert.match(P, /northstarTeeAllowed\(current\)/);
  assert.ok(!/supabase|fetch\(|insert|update\(/i.test(P));
  const labels = Object.values(L.NORTHSTAR_PRINT_TEES).map((t) => t.label); assert.equal(new Set(labels).size, 16); for (const l of labels) assert.match(l, /^(Tekande|Skjold|Ræv) · (creme|grå|navy|koral|skovgrøn|sennep)$/);
  assert.match(read("avatar.html"), /\.northstar-subtitle \{/);
});
