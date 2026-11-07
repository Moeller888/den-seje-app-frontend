// D-355 — D-354's 33 owner-approved tops in the Northstar opt-in (no private file needed): the approval names exactly R01–R11 on
// tee-hip-v2, sweater-long-v3 and tank-v5 with the hashes D-354 registered, never the planet; each top is an item of its cut's family with
// that family's published shadows and hip seam or hem junction; the proposed list is each cut's current (bottom, shoes) pairs and nothing
// else, without the sweater's olive trousers with the beige sneakers that no outfit can show (1441, every entry reachable); a top of the 33
// replaces the top only where its whole outfit is on the list, on the same stored choice as the sweaters and tank tops, whose behaviour is
// unchanged; the plan draws each family's own order; the owner's D-355 approval (55 files bound to the staging manifest's sha256, the 1441
// combinations, the tees' D-349 split) is exactly what is published and listed — the 55 files with their sha256 and bytes, in the manifest
// with decision D-355 and its extension, and no other file of the 33. D-357 turned the flag on (every pupil's wardrobe, the choice on the
// account): a top of the 33 is shown from the pupil's account where its outfit is listed, and never from another pupil's browser.
// Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { applyNorthstarUrlOptIn } from "../../js/avatar-northstar-panel.js";
import { approval, kitTopCombos, cutPairs, itemOfCandidate, itemShape, CUT_FAMILY, TOP_SPLIT, NOT_SHOWN } from "../../tools/avatar/northstar-kit-tops-d355.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), A = approval(), key = (o) => [o.top, o.bottom, o.shoes].join("+");
const D355 = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "top-cuts", "kit-tops-owner-approval-d355.json"), "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");
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

test("D-355 the proposed list: each cut's current pairs and nothing else, the unshowable olive with beige left out (1441); all reachable", () => {
  assert.deepEqual([...L.NORTHSTAR_KIT_TOP_COMBOS].sort(), kitTopCombos(L).map(key).sort()); assert.equal(L.NORTHSTAR_KIT_TOP_COMBOS.length, 1441);
  assert.deepEqual(NOT_SHOWN, { "sweater-long-v3": ["bottom-trousers-square-olive|shoes-sneakers-beige"] });
  assert.ok(!L.NORTHSTAR_KIT_TOP_COMBOS.some((k) => k.endsWith("+bottom-trousers-square-olive+shoes-sneakers-beige")));
  assert.equal(L.NORTHSTAR_LS2_COMBOS.filter((k) => k.endsWith("+bottom-trousers-square-olive+shoes-sneakers-beige")).length, 6, "the approved sweaters' list keeps the pair");
  const P = cutPairs(L); assert.deepEqual([P["tee-hip-v2"].size, P["sweater-long-v3"].size, P["tank-v5"].size], [43, 45, 44]);
  // no bottom or shoe is added: every pair is one the cut's family is already shown or approved with
  const used = new Set(), have = new Set(); for (const k of L.NORTHSTAR_KIT_TOP_COMBOS) { const [, b, s] = k.split("+"); used.add(b); used.add(s); }
  for (const k of [...L.NORTHSTAR_LS2_COMBOS, ...L.NORTHSTAR_TANK_COMBOS, ...L.NORTHSTAR_SV1_SHOE_COMBOS, ...L.NORTHSTAR_AB1_BOOT_COMBOS]) { const [, b, s] = k.split("+"); have.add(b); have.add(s); }
  for (const o of Object.values(L.NORTHSTAR_OUTFITS)) { have.add(o.bottom); have.add(o.shoes); } for (const u of used) assert.ok(have.has(u), u);
  for (const k of L.NORTHSTAR_KIT_TOP_COMBOS) { const [top] = k.split("+"); if (!top.startsWith("top-tee-hip-")) assert.ok(!k.includes("bottom-shorts-navy"), k); else assert.ok(!k.includes("trousers-square-olive") && !k.includes("ankleboots-brown"), k); }
  // reachability through the browser's own functions
  const reach = new Set(); for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(L.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(L.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(L.NORTHSTAR_KIT_TOPS)) {
    if (!L.northstarSweaterAllowed(k, t, p, s, w)) continue; const o = L.northstarOutfitFor(k, t, p, s, w); assert.equal(o.top, L.NORTHSTAR_KIT_TOPS[w].item); reach.add(key(o)); }
  const missing = L.NORTHSTAR_KIT_TOP_COMBOS.filter((k) => !reach.has(k)); assert.deepEqual(missing, [], "every proposed combination is selectable");
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

test("D-355 the stored choice on every surface; outside the list the own top with the choice kept; ?northstar=0 forgets it; D-357: the account decides", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TK-MUSTARD-DOTS" };
  for (const s of ["avatar", "quiz", "hub"]) { const r = withStorage(on, () => L.northstarRenderFor(s, [])); assert.deepEqual([r.key, r.sweater, r.tee], ["K01+TK-MUSTARD-DOTS", "TK-MUSTARD-DOTS", null]);
    assert.ok(r.plan.some((p) => p.src.endsWith("/top-tank-mustard-dots-top-body-v1.webp"))); }
  withStorage({ ...on, avatar_northstar_outfit: "K04" }, (m) => { assert.equal(L.northstarRenderFor("hub", []).key, "K04"); assert.equal(m.get("avatar_northstar_sweater"), "TK-MUSTARD-DOTS"); });
  assert.equal(withStorage({ ...on, avatar_northstar_outfit: "K04", avatar_northstar_sweater: "TEE-MINT-TEAPOT" }, () => L.northstarRenderFor("quiz", [])).key, "K04+TEE-MINT-TEAPOT");
  assert.equal(withStorage({ ...on, avatar_northstar_sweater: "LS2-NAVY" }, () => L.northstarRenderFor("hub", [])).key, "K01+LS2-NAVY", "an approved sweater as before");
  withStorage({ ...on }, (m) => { applyNorthstarUrlOptIn("?northstar=0"); assert.equal(m.has("avatar_northstar_sweater"), false); });
  // D-357: the flag is on and the named pupil's account decides — a top of the 33 from the account, never another pupil's browser choice
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, true);
  L.northstarUseAccount({ v: 1, northstar: { outfit: "K01", top: "TEE-SAND-FOX" } });
  for (const s of ["avatar", "quiz", "hub"]) assert.equal(withStorage({ avatar_northstar_outfit: "K07", avatar_northstar_sweater: "TK-NAVY" }, () => L.northstarRenderFor(s, [])).key, "K01+TEE-SAND-FOX");
  L.northstarUseAccount({ v: 1, northstar: { outfit: "K04", top: "LS2-SAND-FOX" } });
  assert.equal(withStorage({}, () => L.northstarRenderFor("hub", [])).key, "K04", "a sweater of the 33 is not listed with the shorts: the own top");
  for (const bad of ["TEE-CHARCOAL-PLANET", "LS2-CHARCOAL-PLANET", "top-tank-sand-fox"]) { L.northstarUseAccount({ v: 1, northstar: { outfit: "K01", top: bad } }); assert.equal(withStorage({}, () => L.northstarRenderFor("hub", [])).key, "K01", bad + " is ignored"); }
  L.northstarUseAccount({ v: 1 }); assert.equal(withStorage({ avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TEE-SAND-FOX" }, () => L.northstarRenderFor("hub", [])), null, "no choice on the account: today's avatar");
});

test("D-355 the plan: each family's own order and shared files; the tee's sleeves after the arms", () => {
  const order = (o) => L.northstarPlanFor(o).map((s) => s.src.split("/").pop());
  const tee = order({ top: "top-tee-hip-green-check", bottom: "bottom-skirt-sand", shoes: "shoes-sneakers-white" });
  assert.ok(tee.indexOf("top-tee-hip-green-check-top-body-v1.webp") < tee.indexOf("figure-arms-v1.webp") && tee.indexOf("figure-arms-v1.webp") < tee.indexOf("top-tee-hip-green-check-sleeves-v1.webp"));
  assert.ok(tee.includes("top-tee-hip-cream-shadow-body-v1.webp") && tee.includes("top-tee-hip-cream-shadow-arms-v1.webp") && !tee.some((f) => /hip-seam|hem-junction/.test(f)));
  const sw = order({ top: "top-sweater-ls2-denim-twill", bottom: "bottom-trousers-square-sand", shoes: "shoes-ankleboots-brown" }), k = sw.indexOf(L.NORTHSTAR_LS2_HIP_SEAM);
  assert.equal(sw[k - 1], "shoes-ankleboots-brown-shoes-v1.webp"); assert.equal(sw[k + 1], "bottom-trousers-square-sand-pants-v1.webp"); assert.ok(sw.includes("top-sweater-ls2-shadow-arms-v1.webp") && sw.includes("top-sweater-ls2-denim-twill-sleeves-v1.webp"));
  const tk = order({ top: "top-tank-sand-fox", bottom: "bottom-capri-lightblue", shoes: "shoes-sneakers-beige" }), j = tk.indexOf(L.NORTHSTAR_TANK_HEM_JUNCTION);
  assert.equal(tk[j + 1], "bottom-capri-lightblue-pants-v1.webp"); assert.ok(!tk.some((f) => f.includes("sleeves")) && tk.includes("top-tank-shadow-body-v1.webp") && !tk.includes("top-tank-shadow-arms-v1.webp"));
  for (const files of Object.values(CUT_FAMILY)) for (const p of files.shadows) assert.ok(existsSync(join(REPO, "assets", "avatar-northstar", files.shadowsOf + "-shadow-" + p + "-v1.webp")));
});

test("D-355 the owner's approval is what is published and listed: the 55 files (sha256, bytes, manifest), the 1441 combinations; no planet", () => {
  assert.equal(D355.decision, "D-355"); assert.equal(D355.owner[0], "Jeg godkender samlet:");
  assert.equal(D355.staging.manifestSha256, "1779129579b76014e252d49162dc45b43c3589ecd90cb782598cdbe0ef1cf457"); assert.equal(D355.staging.files.length, 55);
  assert.equal(D355.basedOn.head, "0d772cfaf20a19e41339eaaf14f0c3800b7fe006"); assert.equal(D355.count, 1441);
  assert.deepEqual(D355.combinations.map(key).sort(), [...L.NORTHSTAR_KIT_TOP_COMBOS].sort());
  const m = JSON.parse(readFileSync(join(REPO, "assets", "avatar-northstar", "manifest.json"), "utf8")), ext = m.extensions.find((e) => e.decision === "D-355");
  for (const f of D355.staging.files) { const b = readFileSync(join(REPO, "assets", "avatar-northstar", f.file)); assert.equal(sha(b), f.sha256, f.file); assert.equal(b.length, f.bytes);
    const e = m.files.find((x) => x.file === f.file); assert.ok(e && e.sha256 === f.sha256 && e.origin.decision === "D-355" && e.origin.approval.endsWith("kit-tops-owner-approval-d355.json"), f.file); }
  // exactly the 33's layer files are published: every one the plan can draw, nothing else of theirs, never the planet
  const want = Object.values(L.NORTHSTAR_KIT_TOPS).flatMap((t) => L.NORTHSTAR_ITEMS[t.item].layers.map((l) => t.item + "-" + l + "-v1.webp")).sort();
  assert.deepEqual(D355.staging.files.map((f) => f.file).sort(), want); assert.equal(want.length, 55);
  const kitFiles = readdirSync(join(REPO, "assets", "avatar-northstar")).filter((f) => Object.values(L.NORTHSTAR_KIT_TOPS).some((t) => f.startsWith(t.item + "-"))).sort(); assert.deepEqual(kitFiles, want);
  assert.ok(!readdirSync(join(REPO, "assets", "avatar-northstar")).some((f) => /planet/.test(f)));
  assert.equal(ext.publishedBy, "D-355"); assert.deepEqual(ext.files, want); assert.equal(ext.stagedManifestSha256, D355.staging.manifestSha256);
  assert.deepEqual([...ext.combinations].sort(), [...L.NORTHSTAR_KIT_TOP_COMBOS].sort()); assert.equal(ext.equivalence.outfitsDiffering, 0); assert.equal(ext.equivalence.approvedCombinations, 1441);
  for (const [id, it] of Object.entries(ext.itemTable)) assert.deepEqual(JSON.parse(JSON.stringify(L.NORTHSTAR_ITEMS[id])), it);
  assert.equal(m.counts.d355Files, 55); assert.equal(m.counts.files, m.files.length); assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, true, "D-357");
});

test("D-355 the list explained: each cut's pairs from its source, all 1441 selectable (the sweater's olive with beige left out), no restriction widened", async () => {
  const { lists } = await import("../../tools/avatar/northstar-kit-tops-review-d355.mjs"), r = lists(L, kitTopCombos, cutPairs, NOT_SHOWN);
  assert.deepEqual(r.total, { allowed: 1441, selectable: 1441, notSelectable: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(r.cuts).map(([k, v]) => [k, [v.pairs, v.allowed, v.selectable, v.notSelectable, v.omitted]])),
    { "tee-hip-v2": [43, 473, 473, [], []], "sweater-long-v3": [44, 484, 484, [], ["bottom-trousers-square-olive+shoes-sneakers-beige"]], "tank-v5": [44, 484, 484, [], []] });
  for (const [k, v] of Object.entries(r.checks)) assert.equal(v, true, k);
  assert.ok(r.cuts["tee-hip-v2"].rows.every((x) => typeof x.source === "string" && x.source.length));
});
