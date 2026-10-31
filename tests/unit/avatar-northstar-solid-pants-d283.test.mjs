// D-283 — the 2 owner-approved solid trousers (D-281) in the Northstar opt-in (no private file needed): exactly the approved IDs and
// files (their registered sha256), the olive trousers' published shadow reused, the trousers offered only where the top and shoes are a
// pair D-281 checked (every reachable pair is one), the plan draws them in the D-242 order, the figure key names them, removing the choice
// returns to the outfit's own bottom, nothing changes without the opt-in, ?northstar=0 forgets them, and the panel offers them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { reachablePantsOutfits } from "../../tools/avatar/verify-northstar-solid-pants-runtime-d283.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(REPO, f), "utf8"), sha = (b) => createHash("sha256").update(b).digest("hex");
const APPROVAL = JSON.parse(read("tools/avatar/fixtures/northstar-wardrobe/pants-master/ps-owner-approval-v1.json"));
const CAND = JSON.parse(read("tools/avatar/fixtures/northstar-wardrobe/pants-master/ps-candidates-v1.json"));
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };

test("D-283 exactly the approved trousers and files: the registered sha256 and bytes, the approval resting on D-281's candidate file", () => {
  assert.match(APPROVAL.owner.message, /^D-281 GODKENDT: TS-NAV og TS-SND fra pants-master-v2/); assert.deepEqual(APPROVAL.approved, ["TS-NAV", "TS-SND"]);
  assert.equal(sha(readFileSync(join(REPO, APPROVAL.basis.candidates.file))), APPROVAL.basis.candidates.sha256);
  assert.deepEqual(Object.keys(L.NORTHSTAR_SOLID_PANTS), APPROVAL.approved);
  for (const id of APPROVAL.approved) assert.equal(L.NORTHSTAR_SOLID_PANTS[id].item, CAND.candidates[id].item);
  const doc = read("docs/decisions/D-281.md");
  for (const [f, e] of Object.entries(APPROVAL.files)) { const b = readFileSync(join(REPO, "assets", "avatar-northstar", f)); assert.deepEqual([sha(b), b.length], [e.sha256, e.bytes], f); assert.ok(doc.includes("`" + e.sha256 + "`"), f + " is D-281's listed hash"); }
  assert.ok(!Object.keys(L.NORTHSTAR_ITEMS).some((id) => /stripe|check/.test(id)), "no patterned trousers");
  for (const p of Object.values(L.NORTHSTAR_SOLID_PANTS)) assert.deepEqual({ ...L.NORTHSTAR_ITEMS[p.item] }, { category: "bottom", layers: ["pants"], shadows: ["body"], shadowsOf: "bottom-trousers-square-olive" });
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});

test("D-283 reachable: every outfit the trousers can join uses a top and shoes D-281 checked — 110 outfits, 55 top x shoe pairs", () => {
  const reach = reachablePantsOutfits(L), C = L.NORTHSTAR_SOLID_PANTS_CHECKED;
  assert.equal(reach.length, 110);
  for (const [k, o] of reach) { assert.ok(C.tops.includes(o.top) && C.shoes.includes(o.shoes), k); assert.ok(L.northstarPlanFor(o), k + " has a plan"); }
  assert.equal(new Set(reach.map(([, o]) => o.top + "+" + o.shoes)).size, 55);
  assert.deepEqual(C.shoes, CAND.controlledCombinations["D-279"].shoes); assert.deepEqual(C.tops.slice(0, 2), CAND.controlledCombinations["D-279"].tops);
  assert.deepEqual(C.tops.slice(2), Object.values(L.NORTHSTAR_PRINT_TEES).map((t) => t.item), "the 16 print tees D-281 checked");
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) assert.equal(L.northstarPantsAllowed(k, null), true, k);
  assert.equal(L.northstarPantsAllowed(null, null), false); assert.equal(L.northstarPantsAllowed("K99", null), false);
});

test("D-283 the choice: only the 2 IDs; it replaces the bottom only; removing it returns to the outfit's own bottom; a blocked storage never throws", () => {
  for (const id of ["TS-NAV", "TS-SND"]) assert.equal(withStorage({ avatar_northstar_pants: id }, () => L.northstarSelectedPants()), id);
  for (const v of ["ts-nav", "TS-STR", "bottom-trousers-square-navy", "", "__proto__", "toString"]) assert.equal(withStorage({ avatar_northstar_pants: v }, () => L.northstarSelectedPants()), null, v);
  const prev = globalThis.localStorage; globalThis.localStorage = { getItem() { throw new Error("blocked"); } };
  try { assert.equal(L.northstarSelectedPants(), null); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; }
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) { const o = L.NORTHSTAR_OUTFITS[k];
    assert.deepEqual(L.northstarOutfitFor(k, null, "TS-SND"), { ...o, bottom: "bottom-trousers-square-sand" }, k);
    assert.equal(L.northstarOutfitFor(k, null, null), o, k + ": no choice is the outfit itself"); assert.equal(L.northstarOutfitFor(k, null, "TS-XXX"), o); }
  assert.deepEqual(L.northstarOutfitFor("K04", "TP-TEA-NAV", "TS-NAV"), { ...L.NORTHSTAR_OUTFITS.K04, top: "top-tee-hip-print-teapot-navy", bottom: "bottom-trousers-square-navy" });
  assert.deepEqual(L.northstarOutfitFor("K12", "TP-TEA-NAV", "TS-NAV"), { ...L.NORTHSTAR_OUTFITS.K12, bottom: "bottom-trousers-square-navy" }, "the tee stays ignored on the blue tee");
});

test("D-283 the plan: the D-242 stack with the trousers' own layer; the olive trousers' published shadow; the figure key names the trousers", () => {
  for (const p of Object.keys(L.NORTHSTAR_SOLID_PANTS)) for (const k of ["K01", "K05", "K12", "K17", "K18"]) {
    const o = L.northstarOutfitFor(k, null, p), plan = L.northstarPlanFor(o), item = L.NORTHSTAR_SOLID_PANTS[p].item;
    assert.deepEqual(plan.filter((s) => s.op === "draw").map((s) => s.src.split("/").pop()), ["figure-body-v1.webp", o.shoes + "-shoes-v1.webp", item + "-pants-v1.webp", o.top + "-top-body-v1.webp", "figure-arms-v1.webp", o.top + "-sleeves-v1.webp", "figure-head-v1.webp"], k + "+" + p);
    assert.ok(plan.some((s) => s.op === "shade" && s.src.endsWith("/bottom-trousers-square-olive-shadow-body-v1.webp")), k + "+" + p); }
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K05", avatar_northstar_tee: "TP-TEA-COR", avatar_northstar_pants: "TS-SND" };
  const r = withStorage(on, () => L.northstarRenderFor("avatar", [])); assert.deepEqual([r.key, r.tee, r.pants], ["K05+TP-TEA-COR+TS-SND", "TP-TEA-COR", "TS-SND"]);
  const r2 = withStorage({ ...on, avatar_northstar_outfit: "K12" }, () => L.northstarRenderFor("hub", [])); assert.deepEqual([r2.key, r2.tee, r2.pants], ["K12+TS-SND", null, "TS-SND"]);
  const r3 = withStorage({ avatar_northstar: "1", avatar_northstar_outfit: "K05" }, () => L.northstarRenderFor("quiz", [])); assert.deepEqual([r3.key, r3.pants], ["K05", null]);
  assert.deepEqual(r3.plan, L.northstarCanvasPlan("K05"), "without trousers the K plan is unchanged");
});

test("D-283 without the opt-in nothing changes, even with stored trousers; ?northstar=0 forgets outfit, tee and trousers; the panel offers them", async () => {
  for (const st of [{ avatar_northstar_pants: "TS-NAV" }, { avatar_northstar_outfit: "K01", avatar_northstar_pants: "TS-NAV" }, { avatar_northstar: "1", avatar_northstar_pants: "TS-NAV" }])
    for (const s of ["quiz", "hub", "avatar", "shop"]) assert.equal(withStorage(st, () => L.northstarRenderFor(s, [])), null, JSON.stringify(st) + " " + s);
  const P = await import("../../js/avatar-northstar-panel.js");
  withStorage({ avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_tee: "TP-TEA-CRM", avatar_northstar_pants: "TS-NAV" }, (m) => { P.applyNorthstarUrlOptIn("?northstar=0"); assert.deepEqual([...m.keys()], []); });
  const src = read("js/avatar-northstar-panel.js");
  assert.match(src, /NORTHSTAR_SOLID_PANTS/); assert.match(src, /"Bukser"/); assert.match(src, /Outfittets egen underdel/); assert.match(src, /northstarPantsAllowed\(current, shown\)/);
  assert.ok(!/supabase|fetch\(|insert|update\(/i.test(src));
  assert.deepEqual(Object.values(L.NORTHSTAR_SOLID_PANTS).map((p) => p.label), ["Lige bukser · navy", "Lige bukser · sand"]);
});
