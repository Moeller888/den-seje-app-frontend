// D-355 — D-354's 33 owner-approved tops PREPARED for the Northstar opt-in (no private file needed): the approval names exactly R01–R11 on
// tee-hip-v2, sweater-long-v3 and tank-v5 with the hashes D-354 registered, never the planet; each top is an item of its cut's family with
// that family's published shadows and hip seam or hem junction; the proposed list is each cut's current (bottom, shoes) pairs and nothing
// else (1452), every entry reachable but the sweater's olive trousers with the beige sneakers (as the approved sweaters'); a top of the 33
// replaces the top only where its whole outfit is on the list, on the same stored choice as the sweaters and tank tops, whose behaviour is
// unchanged; the plan draws each family's own order; nothing is published (no layer file, no manifest entry); the flag is false.
// Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { applyNorthstarUrlOptIn } from "../../js/avatar-northstar-panel.js";
import { approval, kitTopCombos, cutPairs, itemOfCandidate, itemShape, CUT_FAMILY, TOP_SPLIT } from "../../tools/avatar/northstar-kit-tops-d355.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), A = approval(), key = (o) => [o.top, o.bottom, o.shoes].join("+");
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  try { return fn(m); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };

test("D-355 the approval: exactly R01–R11 on the three cuts with D-354's registered hashes and the owner's words; the planet is excluded", () => {
  const doc = readFileSync(join(REPO, "docs", "decisions", "D-354.md"), "utf8"), table = Object.fromEntries([...doc.matchAll(/\| `([a-z0-9-]+--R\d\d-[a-z-]+)` \| `([0-9a-f]{64})` \|/g)].map((m) => [m[1], m[2]]));
  assert.equal(A.count, 33); assert.equal(A.approved.length, 33); assert.deepEqual(A.owner, ["det er godkendt", "Alle 36 undtagen planeten; registrér det i en dokumentations-PR"]);
  assert.deepEqual([...new Set(A.approved.map((c) => c.cut))], ["tee-hip-v2", "sweater-long-v3", "tank-v5"]);
  assert.deepEqual([...new Set(A.approved.map((c) => c.recipe))], ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11"]);
  for (const c of A.approved) { assert.equal(c.layer.sha256, table[c.id], c.id); assert.match(c.layer.pixelSha256, /^[0-9a-f]{64}$/); assert.ok(c.layer.file.startsWith("<Documents>/DenSejeApp-artefacts/d354-edge-fixes/layers/")); }
  assert.deepEqual(A.notApproved.map((c) => c.recipe), ["R12", "R12", "R12"]); for (const c of A.notApproved) assert.equal(c.layer.sha256, table[c.id]);
  assert.equal(Object.keys(table).length, 36); assert.ok(!A.approved.some((c) => /planet/.test(c.slug)));
});

test("D-355 the 33 in the runtime: one item per approved candidate, in its cut's family with that family's shared files; the planet nowhere", () => {
  assert.equal(Object.keys(L.NORTHSTAR_KIT_TOPS).length, 33);
  const items = Object.values(L.NORTHSTAR_KIT_TOPS).map((t) => t.item).sort(), want = A.approved.map((c) => itemOfCandidate(c.cut, c.slug)).sort(); assert.deepEqual(items, want);
  for (const c of A.approved) { const item = itemOfCandidate(c.cut, c.slug); assert.deepEqual(JSON.parse(JSON.stringify(L.NORTHSTAR_ITEMS[item])), itemShape(c.cut), item);
    const t = Object.values(L.NORTHSTAR_KIT_TOPS).find((x) => x.item === item); assert.equal(t.family, CUT_FAMILY[c.cut].base); assert.match(t.label, /^(T-shirt|Sweater|Tanktop) · \S/); }
  assert.ok(!JSON.stringify(L.NORTHSTAR_KIT_TOPS).includes("planet")); assert.ok(!L.NORTHSTAR_KIT_TOP_COMBOS.some((k) => k.includes("planet")));
  assert.deepEqual(TOP_SPLIT, { "tee-hip-v2": 1, "sweater-long-v3": 1, "tank-v5": 128 });
  const older = [...Object.values(L.NORTHSTAR_TOP_CHOICES), ...Object.values(L.NORTHSTAR_PRINT_TEES)].map((x) => x.item);
  for (const t of Object.values(L.NORTHSTAR_KIT_TOPS)) assert.ok(!older.includes(t.item) && !Object.keys(L.NORTHSTAR_TOP_CHOICES).includes(t.item), t.item + " is a new name");
});

test("D-355 the proposed list: each cut's current pairs and nothing else (1452); every entry reachable but the sweater's olive with beige", () => {
  assert.deepEqual([...L.NORTHSTAR_KIT_TOP_COMBOS].sort(), kitTopCombos(L).map(key).sort()); assert.equal(L.NORTHSTAR_KIT_TOP_COMBOS.length, 1452);
  const P = cutPairs(L); assert.deepEqual([P["tee-hip-v2"].size, P["sweater-long-v3"].size, P["tank-v5"].size], [43, 45, 44]);
  // no bottom or shoe is added: every pair is one the cut's family is already shown or approved with
  const used = new Set(), have = new Set(); for (const k of L.NORTHSTAR_KIT_TOP_COMBOS) { const [, b, s] = k.split("+"); used.add(b); used.add(s); }
  for (const k of [...L.NORTHSTAR_LS2_COMBOS, ...L.NORTHSTAR_TANK_COMBOS, ...L.NORTHSTAR_SV1_SHOE_COMBOS, ...L.NORTHSTAR_AB1_BOOT_COMBOS]) { const [, b, s] = k.split("+"); have.add(b); have.add(s); }
  for (const o of Object.values(L.NORTHSTAR_OUTFITS)) { have.add(o.bottom); have.add(o.shoes); } for (const u of used) assert.ok(have.has(u), u);
  for (const k of L.NORTHSTAR_KIT_TOP_COMBOS) { const [top] = k.split("+"); if (!top.startsWith("top-tee-hip-")) assert.ok(!k.includes("bottom-shorts-navy"), k); else assert.ok(!k.includes("trousers-square-olive") && !k.includes("ankleboots-brown"), k); }
  // reachability through the browser's own functions
  const reach = new Set(); for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(L.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(L.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(L.NORTHSTAR_KIT_TOPS)) {
    if (!L.northstarSweaterAllowed(k, t, p, s, w)) continue; const o = L.northstarOutfitFor(k, t, p, s, w); assert.equal(o.top, L.NORTHSTAR_KIT_TOPS[w].item); reach.add(key(o)); }
  const missing = L.NORTHSTAR_KIT_TOP_COMBOS.filter((k) => !reach.has(k)); assert.equal(missing.length, 11); assert.ok(missing.every((k) => k.startsWith("top-sweater-ls2-") && k.endsWith("+bottom-trousers-square-olive+shoes-sneakers-beige")));
  assert.ok([...reach].every((k) => L.NORTHSTAR_KIT_TOP_COMBOS.includes(k)), "nothing outside the list is reachable");
});

test("D-355 one stored choice: a top of the 33 where its whole outfit is listed; sweaters and tank tops unchanged; unknown IDs ignored", () => {
  assert.deepEqual(Object.keys(L.NORTHSTAR_TOP_CHOICES), [...Object.keys(L.NORTHSTAR_LS2_SWEATERS), ...Object.keys(L.NORTHSTAR_TANKS)]); assert.equal(Object.keys(L.NORTHSTAR_SELECTABLE_TOPS).length, 45);
  assert.equal(L.NORTHSTAR_LS2_COMBOS.length, 270); assert.equal(L.NORTHSTAR_TANK_COMBOS.length, 264);
  assert.equal(L.northstarOutfitFor("K04", null, null, null, "TEE-SAND-FOX").top, "top-tee-hip-sand-fox", "a tee of the 33 with the shorts (the cream tee's pair)");
  assert.equal(L.northstarOutfitFor("K04", null, null, null, "LS2-SAND-FOX").top, "top-tee-hip-cream", "a sweater never with the shorts");
  assert.equal(L.northstarOutfitFor("K18", null, null, null, "TEE-GREEN-CHECK").top, "top-tee-hip-blue", "the tee not with the olive trousers (no tee is)");
  assert.equal(L.northstarOutfitFor("K18", null, null, null, "TK-GREEN-CHECK").top, "top-tank-green-check");
  assert.equal(L.northstarOutfitFor("K07", "TP-FOX-NAV", null, null, "LS2-BRETON-STRIPE").top, "top-sweater-ls2-breton-stripe", "replaces a print tee too");
  for (const bad of ["TEE-CHARCOAL-PLANET", "TK-CHARCOAL-PLANET", "top-tank-sand-fox", "", null, 7]) assert.equal(L.northstarOutfitFor("K01", null, null, null, bad).top, "top-tee-hip-cream");
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(L.NORTHSTAR_SHOE_CHOICES)]) { const o = L.northstarOutfitFor(k, null, p, s);
    for (const w of Object.keys(L.NORTHSTAR_TOP_CHOICES)) { const list = Object.prototype.hasOwnProperty.call(L.NORTHSTAR_TANKS, w) ? L.NORTHSTAR_TANK_COMBOS : L.NORTHSTAR_LS2_COMBOS, on = list.includes(L.NORTHSTAR_TOP_CHOICES[w].item + "+" + o.bottom + "+" + o.shoes);
      assert.equal(L.northstarSweaterAllowed(k, null, p, s, w), on); }
    for (const w of Object.keys(L.NORTHSTAR_KIT_TOPS)) { const on = L.NORTHSTAR_KIT_TOP_COMBOS.includes(L.NORTHSTAR_KIT_TOPS[w].item + "+" + o.bottom + "+" + o.shoes);
      assert.deepEqual(L.northstarOutfitFor(k, null, p, s, w), on ? { ...o, top: L.NORTHSTAR_KIT_TOPS[w].item } : o); } }
});

test("D-355 the stored choice on every surface; outside the list the own top with the choice kept; no opt-in, nothing; ?northstar=0 forgets it", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TK-MUSTARD-DOTS" };
  for (const s of ["avatar", "quiz", "hub"]) { const r = withStorage(on, () => L.northstarRenderFor(s, [])); assert.deepEqual([r.key, r.sweater, r.tee], ["K01+TK-MUSTARD-DOTS", "TK-MUSTARD-DOTS", null]);
    assert.ok(r.plan.some((p) => p.src.endsWith("/top-tank-mustard-dots-top-body-v1.webp"))); }
  withStorage({ ...on, avatar_northstar_outfit: "K04" }, (m) => { assert.equal(L.northstarRenderFor("hub", []).key, "K04"); assert.equal(m.get("avatar_northstar_sweater"), "TK-MUSTARD-DOTS"); });
  assert.equal(withStorage({ ...on, avatar_northstar_outfit: "K04", avatar_northstar_sweater: "TEE-MINT-TEAPOT" }, () => L.northstarRenderFor("quiz", [])).key, "K04+TEE-MINT-TEAPOT");
  assert.equal(withStorage({ ...on, avatar_northstar_sweater: "LS2-NAVY" }, () => L.northstarRenderFor("hub", [])).key, "K01+LS2-NAVY", "an approved sweater as before");
  assert.equal(withStorage({ avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TEE-SAND-FOX" }, () => L.northstarRenderFor("hub", [])), null, "no opt-in: today's avatar");
  withStorage({ ...on }, (m) => { applyNorthstarUrlOptIn("?northstar=0"); assert.equal(m.has("avatar_northstar_sweater"), false); });
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});

test("D-355 the plan: each family's own order and shared files; the tee's sleeves after the arms; nothing of the 33 is published", () => {
  const order = (o) => L.northstarPlanFor(o).map((s) => s.src.split("/").pop());
  const tee = order({ top: "top-tee-hip-green-check", bottom: "bottom-skirt-sand", shoes: "shoes-sneakers-white" });
  assert.ok(tee.indexOf("top-tee-hip-green-check-top-body-v1.webp") < tee.indexOf("figure-arms-v1.webp") && tee.indexOf("figure-arms-v1.webp") < tee.indexOf("top-tee-hip-green-check-sleeves-v1.webp"));
  assert.ok(tee.includes("top-tee-hip-cream-shadow-body-v1.webp") && tee.includes("top-tee-hip-cream-shadow-arms-v1.webp") && !tee.some((f) => /hip-seam|hem-junction/.test(f)));
  const sw = order({ top: "top-sweater-ls2-denim-twill", bottom: "bottom-trousers-square-sand", shoes: "shoes-ankleboots-brown" }), k = sw.indexOf(L.NORTHSTAR_LS2_HIP_SEAM);
  assert.equal(sw[k - 1], "shoes-ankleboots-brown-shoes-v1.webp"); assert.equal(sw[k + 1], "bottom-trousers-square-sand-pants-v1.webp"); assert.ok(sw.includes("top-sweater-ls2-shadow-arms-v1.webp") && sw.includes("top-sweater-ls2-denim-twill-sleeves-v1.webp"));
  const tk = order({ top: "top-tank-sand-fox", bottom: "bottom-capri-lightblue", shoes: "shoes-sneakers-beige" }), j = tk.indexOf(L.NORTHSTAR_TANK_HEM_JUNCTION);
  assert.equal(tk[j + 1], "bottom-capri-lightblue-pants-v1.webp"); assert.ok(!tk.some((f) => f.includes("sleeves")) && tk.includes("top-tank-shadow-body-v1.webp") && !tk.includes("top-tank-shadow-arms-v1.webp"));
  const m = JSON.parse(readFileSync(join(REPO, "assets", "avatar-northstar", "manifest.json"), "utf8"));
  for (const t of Object.values(L.NORTHSTAR_KIT_TOPS)) for (const part of ["top-body", "sleeves"]) { const f = t.item + "-" + part + "-v1.webp"; assert.equal(existsSync(join(REPO, "assets", "avatar-northstar", f)), false, f + " is not published");
    assert.ok(!m.files.some((x) => x.file === f)); }
  for (const files of Object.values(CUT_FAMILY)) for (const p of files.shadows) assert.ok(existsSync(join(REPO, "assets", "avatar-northstar", files.shadowsOf + "-shadow-" + p + "-v1.webp")));
});

test("D-355 the list explained: each cut's pairs from its source, 1441 of 1452 selectable (the sweater's olive with beige never), no restriction widened", async () => {
  const { lists } = await import("../../tools/avatar/northstar-kit-tops-review-d355.mjs"), r = lists(L, kitTopCombos, cutPairs);
  assert.deepEqual(r.total, { allowed: 1452, selectable: 1441, notSelectable: 11 });
  assert.deepEqual(Object.fromEntries(Object.entries(r.cuts).map(([k, v]) => [k, [v.pairs, v.allowed, v.selectable, v.notSelectable]])),
    { "tee-hip-v2": [43, 473, 473, []], "sweater-long-v3": [45, 495, 484, ["bottom-trousers-square-olive+shoes-sneakers-beige"]], "tank-v5": [44, 484, 484, []] });
  for (const [k, v] of Object.entries(r.checks)) assert.equal(v, true, k);
  assert.ok(r.cuts["tee-hip-v2"].rows.every((x) => typeof x.source === "string" && x.source.length));
});
