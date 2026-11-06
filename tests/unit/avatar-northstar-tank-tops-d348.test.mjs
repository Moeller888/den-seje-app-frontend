// D-348 — the 6 owner-approved tank tops (D-345 candidates, approved on tank-v3) in the Northstar opt-in (no private file needed): a tank
// replaces the top ONLY where the whole effective outfit (after the print tee, the trousers and the shoe) with it is one of the 264
// approved combinations — never with the shorts, never the olive trousers with the beige sneakers; tank and sweater share one stored
// choice, so at most one is drawn, and every sweater keeps its own list; outside the list the outfit keeps its own top and the stored
// choice stays untouched, also after a reload; the plan draws the hem junction after the shoes and right before the bottom, the body
// after it, no sleeves; the 8 published files are the approval's; the manifest records them; no opt-in, nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { applyNorthstarUrlOptIn } from "../../js/avatar-northstar-panel.js";
import * as TF from "../../tools/avatar/northstar-tank-family.mjs";
import { approval, reachableTankOutfits } from "../../tools/avatar/verify-northstar-tank-runtime-d348.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };
const A = approval(), key = (o) => [o.top, o.bottom, o.shoes].join("+"), want = A.combinations.map(key).sort();

test("D-348 the approval: D-345's 264 candidates on tank-v3, the owner's words; the list is exactly them, all reachable", () => {
  const F = JSON.parse(readFileSync(join(REPO, ...A.candidates.file.split("/"))));
  assert.equal(sha(readFileSync(join(REPO, ...A.candidates.file.split("/")))), A.candidates.sha256); assert.equal(sha(readFileSync(join(REPO, ...A.cut.contract.split("/")))), A.cut.sha256);
  assert.equal(A.cut.contract, "tools/avatar/fixtures/northstar-wardrobe/top-cuts/tank-v3.json"); assert.equal(A.owner, "Jeg godkender de 264 tanktopkombinationer på tank-v3");
  assert.deepEqual(A.combinations.map((c) => c.id), F.combinations.map((c) => c.id)); assert.equal(A.count, 264); assert.deepEqual(A.staging.files, F.staging.files);
  assert.ok(A.combinations.every((c) => /^[0-9a-f]{64}$/.test(c.rendering.pixelSha256) && c.rendering.file.startsWith("<Documents>/DenSejeApp-artefacts/d345-tank-family/")));
  assert.deepEqual([...L.NORTHSTAR_TANK_COMBOS].sort(), want); assert.deepEqual(want, TF.combinations(L).map(key).sort());
  assert.deepEqual(Object.keys(L.NORTHSTAR_TANKS), Object.keys(TF.DESIGNS)); for (const [id, t] of Object.entries(L.NORTHSTAR_TANKS)) { assert.equal(t.item, TF.itemOf(id)); assert.deepEqual(L.NORTHSTAR_ITEMS[t.item], A.staging.itemTable[t.item]); }
  const reach = reachableTankOutfits(L).map(([, o]) => key(o)).sort(); assert.deepEqual(reach, want, "every approved combination is reachable, nothing else");
  assert.ok(!L.NORTHSTAR_TANK_COMBOS.some((k) => k.includes("bottom-shorts-navy"))); assert.ok(!L.NORTHSTAR_TANK_COMBOS.some((k) => k.endsWith("+bottom-trousers-square-olive+shoes-sneakers-beige")));
  assert.equal(Object.keys(L.NORTHSTAR_OUTFITS).length, 19); assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, true);
});

test("D-348 one top choice: a tank or a sweater, each by its own list; the sweaters' behaviour is unchanged; unknown IDs ignored", () => {
  assert.deepEqual(Object.keys(L.NORTHSTAR_TOP_CHOICES), [...Object.keys(L.NORTHSTAR_LS2_SWEATERS), ...Object.keys(L.NORTHSTAR_TANKS)]);
  assert.equal(L.northstarOutfitFor("K01", null, null, null, "TK-NAVY").top, "top-tank-navy");
  assert.equal(L.northstarOutfitFor("K07", "TP-FOX-NAV", null, null, "TK-HEATHER-FOX").top, "top-tank-heather-fox", "replaces a print tee too");
  assert.equal(L.northstarOutfitFor("K04", null, "TS-SND", null, "TK-NAVY-TEAPOT").top, "top-tank-navy-teapot");
  for (const [k, t, p, s] of [["K04", null, null, null], ["K16", null, null, null], ["K05", null, null, null], ["K04", null, null, "SV1-V5-CHALK"]]) {   // the shorts
    assert.equal(L.northstarSweaterAllowed(k, t, p, s, "TK-HEATHER"), false); assert.equal(L.northstarOutfitFor(k, t, p, s, "TK-HEATHER").top, L.northstarOutfitFor(k, t, p, s).top); }
  for (const bad of ["TK-RED", "top-tank-navy", "", null, 3]) assert.equal(L.northstarOutfitFor("K01", null, null, null, bad).top, "top-tee-hip-cream");
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, "TP-FOX-NAV"]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(L.NORTHSTAR_SHOE_CHOICES)]) {
    const o = L.northstarOutfitFor(k, t, p, s);
    for (const w of Object.keys(L.NORTHSTAR_LS2_SWEATERS)) { const on = L.NORTHSTAR_LS2_COMBOS.includes(L.NORTHSTAR_LS2_SWEATERS[w].item + "+" + o.bottom + "+" + o.shoes);
      assert.equal(L.northstarSweaterAllowed(k, t, p, s, w), on); assert.equal(L.northstarOutfitFor(k, t, p, s, w).top, on ? L.NORTHSTAR_LS2_SWEATERS[w].item : o.top); }
    for (const w of Object.keys(L.NORTHSTAR_TANKS)) { const on = L.NORTHSTAR_TANK_COMBOS.includes(L.NORTHSTAR_TANKS[w].item + "+" + o.bottom + "+" + o.shoes);
      assert.equal(L.northstarSweaterAllowed(k, t, p, s, w), on); assert.deepEqual(L.northstarOutfitFor(k, t, p, s, w), on ? { ...o, top: L.NORTHSTAR_TANKS[w].item } : o); } }
  assert.equal(L.NORTHSTAR_LS2_COMBOS.length, 270); assert.equal(L.NORTHSTAR_TANK_COMBOS.length, 264);
});

test("D-348 the stored choice: shown where allowed; outside the list the own top with the choice kept, on every load; ?northstar=0 forgets it", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TK-NAVY-FOX" };
  for (const s of ["avatar", "quiz", "hub"]) { const r = withStorage(on, () => L.northstarRenderFor(s, [])); assert.deepEqual([r.key, r.sweater, r.tee], ["K01+TK-NAVY-FOX", "TK-NAVY-FOX", null]);
    assert.ok(r.plan.some((p) => p.src.endsWith("/top-tank-navy-fox-top-body-v1.webp"))); }
  assert.equal(withStorage({ ...on, avatar_northstar_pants: "TS-NAV", avatar_northstar_shoes: "AB1-BOOT-LIGHTSAND" }, () => L.northstarRenderFor("hub", [])).key, "K01+TS-NAV+AB1-BOOT-LIGHTSAND+TK-NAVY-FOX");
  for (const load of [1, 2]) withStorage({ ...on, avatar_northstar_outfit: "K16" }, (m) => { const r = L.northstarRenderFor("quiz", []); assert.deepEqual([r.key, r.sweater], ["K16", null], "load " + load); assert.equal(m.get("avatar_northstar_sweater"), "TK-NAVY-FOX"); });
  withStorage({ ...on, avatar_northstar_outfit: "K04" }, (m) => { assert.equal(L.northstarRenderFor("hub", []).key, "K04"); assert.equal(m.get("avatar_northstar_sweater"), "TK-NAVY-FOX"); });
  assert.equal(withStorage({ ...on, avatar_northstar_sweater: "LS2-NAVY" }, () => L.northstarRenderFor("hub", [])).key, "K01+LS2-NAVY", "a stored sweater as before");
  assert.equal(withStorage({ avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TK-NAVY" }, () => L.northstarRenderFor("hub", [])), null, "no opt-in: today's avatar");
  withStorage({ ...on }, (m) => { applyNorthstarUrlOptIn("?northstar=0"); assert.equal(m.has("avatar_northstar_sweater"), false); });
});

test("D-348 the plan: hem junction after the shoes and right before the bottom, body after it, no sleeves; tees' and sweaters' plans unchanged", () => {
  for (const c of A.combinations) { const srcs = L.northstarPlanFor({ top: c.top, bottom: c.bottom, shoes: c.shoes }).map((s) => s.src.split("/").pop()), k = srcs.indexOf(L.NORTHSTAR_TANK_HEM_JUNCTION);
    assert.equal(srcs[k - 1], c.shoes + "-shoes-v1.webp"); assert.equal(srcs[k + 1], c.bottom + "-pants-v1.webp"); assert.ok(srcs.indexOf(c.top + "-top-body-v1.webp") > k + 1);
    assert.ok(!srcs.some((f) => f.includes("sleeves"))); assert.ok(srcs.includes("top-tank-shadow-body-v1.webp")); assert.ok(!srcs.some((f) => f.includes("hip-seam"))); }
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) assert.ok(!L.northstarPlanFor(L.NORTHSTAR_OUTFITS[k]).some((s) => s.src.includes("top-tank")));
  for (const c of L.NORTHSTAR_LS2_COMBOS.slice(0, 12)) { const [top, bottom, shoes] = c.split("+"); assert.ok(!L.northstarPlanFor({ top, bottom, shoes }).some((s) => s.src.includes("top-tank"))); }
});

test("D-348 the published files: exactly the 8 staged files with their sha256, in the manifest's D-345 extension with the 264", () => {
  const m = JSON.parse(readFileSync(join(REPO, "assets", "avatar-northstar", "manifest.json"), "utf8")), ext = m.extensions.find((e) => e.decision === "D-345");
  for (const f of A.staging.files) { const b = readFileSync(join(REPO, "assets", "avatar-northstar", f.file)); assert.equal(sha(b), f.sha256, f.file); assert.equal(b.length, f.bytes);
    const e = m.files.find((x) => x.file === f.file); assert.ok(e && e.sha256 === f.sha256 && e.origin.decision === "D-345", f.file); }
  assert.equal(m.files.filter((f) => f.file.startsWith("top-tank-")).length, 8); assert.equal(m.counts.d345Files, 8); assert.equal(m.counts.files, m.files.length);
  assert.equal(ext.publishedBy, "D-348"); assert.deepEqual([...ext.combinations].sort(), want); assert.equal(ext.equivalence.outfitsDiffering, 0); assert.equal(ext.equivalence.approvedCombinations, 264);
  assert.deepEqual(ext.files, A.staging.files.map((f) => f.file).sort()); assert.equal(ext.ownerApproval, A.owner);
});
