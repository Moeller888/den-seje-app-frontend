// D-359: the wardrobe of single parts in the right-hand column.
//   1. Exactly the approved outfits are reachable: the list is built from the renderer's own gates, and every entry draws what it says.
//   2. Every part can always be put on, and the result is always an approved outfit.
//   3. As little as possible changes, deterministically, and the pupil is told what changed.
//   4. avatar.html shows parts and no sets, in the items column, and stores through the D-357 RPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as L from "../../js/avatar-layers.js";
import * as P from "../../js/avatar-northstar-panel.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const wear = (choice) => L.northstarUseAccount({ northstar: choice });

test("D-359: 1304 approved outfits and D-355's 1441 (2745); each stored choice draws exactly that outfit on the render path", () => {
  const all = L.northstarApprovedOutfits();
  assert.equal(all.size, 1304 + 1441, "D-359's 1304 and D-355's 1441");
  assert.equal([...all.values()].filter((o) => L.NORTHSTAR_KIT_TOP_COMBOS.includes(o.top + "+" + o.bottom + "+" + o.shoes)).length, 1441);
  for (const [id, o] of all) {
    wear(o.choice);
    const r = L.northstarRenderFor("avatar", []);
    assert.ok(r, id);
    const now = L.northstarOutfitNow();
    assert.equal(now.top + "+" + now.bottom + "+" + now.shoes, id);
    assert.deepEqual(r.plan, L.northstarPlanFor(now));
  }
});

test("D-359: the known faults and the excluded pairs are not in the list", () => {
  const all = L.northstarApprovedOutfits();
  for (const bad of L.NORTHSTAR_KNOWN_FAULTY) assert.equal(all.has(bad), false, bad);
  for (const o of all.values()) {
    assert.ok(!(o.shoes === "shoes-sneakers-low-sv1-charcoal" && /trousers/.test(o.bottom)), "charcoal never with long trousers");
    assert.ok(!(/shorts/.test(o.bottom) && /sweater|tank/i.test(o.top)), "no sweater or tank top with shorts");
  }
});

test("D-359: 46 single parts and D-355's 33 tops (79), each with a label and existing layer files, and no planet", () => {
  const pieces = L.northstarPieces();
  const by = (c) => pieces.filter((p) => p.category === c).length;
  assert.deepEqual([by("top"), by("bottom"), by("shoes")], [30 + 33, 6, 10]);
  const names = pieces.map((p) => P.northstarPieceLabel(p.item));
  assert.equal(new Set(names).size, 46 + 33, "every label is different");
  for (const n of names) { assert.ok(n && !/undefined|K\d/.test(n), n); assert.ok(!/planet/i.test(n), n); }
  for (const p of pieces) {
    const srcs = L.northstarPieceLayers(p.item);
    assert.ok(srcs.length >= 1, p.item);
    for (const s of srcs) assert.ok(read(s.slice(1)).length > 0, s);
  }
});

test("D-359/D-367: from every starting outfit, only the chosen part changes — the exact approved outfit, or a refusal", () => {
  // D-367 (owner, 2026-11-09) replaced D-359's "fewest other parts change": a part goes on only with the two parts already worn.
  const all = L.northstarApprovedOutfits(), pieces = L.northstarPieces();
  const starts = [...all.values()].filter((_o, i) => i % 37 === 0);
  L.northstarUseAccount({});
  for (const p of pieces) assert.ok(L.northstarFitPiece(p.item), "from today's avatar: " + p.item);
  for (const s of starts) {
    wear(s.choice);
    for (const p of pieces) {
      const f = L.northstarFitPiece(p.item);
      const want = { top: s.top, bottom: s.bottom, shoes: s.shoes, [p.category]: p.item };
      const exact = all.get(want.top + "+" + want.bottom + "+" + want.shoes);
      if (exact) {
        assert.deepEqual([f.top, f.bottom, f.shoes], [want.top, want.bottom, want.shoes], "exactly the chosen part changes: " + p.item);
        assert.deepEqual(f.changed, []);
        assert.equal(f.choice, exact.choice, "the approved outfit's own stored choice");
      } else {
        assert.deepEqual(f, { refused: true, category: p.category }, "refused, nothing else offered: " + p.item);
      }
      assert.deepEqual(L.northstarFitPiece(p.item), f, "deterministic");
    }
  }
});

test("D-367: every refusal is a combination that is not approved, and every accepted choice draws exactly what was asked", () => {
  const all = L.northstarApprovedOutfits(), pieces = L.northstarPieces();
  let accepted = 0, refused = 0;
  for (const s of [...all.values()].filter((_o, i) => i % 11 === 0)) {
    wear(s.choice);
    for (const p of pieces) {
      if (s[p.category] === p.item) continue;
      const f = L.northstarFitPiece(p.item);
      if (f.refused) { refused++; continue; }
      accepted++;
      wear(f.choice);
      const o = L.northstarOutfitNow();
      assert.deepEqual([o.top, o.bottom, o.shoes], [f.top, f.bottom, f.shoes], "the saved choice draws exactly the outfit shown");
      for (const c of ["top", "bottom", "shoes"]) if (c !== p.category) assert.equal(o[c], s[c], "the other parts stay: " + c);
      wear(s.choice);
    }
  }
  assert.ok(accepted > 0 && refused > 0, "both cases are covered");
});

test("D-367: a sweater over the navy shorts is refused with a short reason; over the light blue capris it goes on", () => {
  const all = [...L.northstarApprovedOutfits().values()];
  const start = all.find((o) => o.top === "top-tee-hip-blue" && o.bottom === "bottom-shorts-navy" && o.shoes === "shoes-sneakers-beige");
  wear(start.choice);
  const f = L.northstarFitPiece("top-sweater-ls2-green-check");
  assert.deepEqual(f, { refused: true, category: "top" });
  assert.equal(P.northstarRefusalNote("top"), "Den overdel passer ikke til dit nuværende outfit.");
  assert.equal(P.northstarRefusalNote("bottom"), "Den underdel passer ikke til dit nuværende outfit.");
  assert.equal(P.northstarRefusalNote("shoes"), "De sko passer ikke til dit nuværende outfit.");
  const capri = all.find((o) => o.top === "top-tee-hip-blue" && o.bottom === "bottom-capri-lightblue" && o.shoes === "shoes-sneakers-beige");
  wear(capri.choice);
  const g = L.northstarFitPiece("top-sweater-ls2-green-check");
  assert.deepEqual([g.top, g.bottom, g.shoes], ["top-sweater-ls2-green-check", "bottom-capri-lightblue", "shoes-sneakers-beige"]);
  assert.equal(P.northstarFitNote("top-sweater-ls2-green-check", g.changed), "", "nothing else changed, so nothing to explain");
});

test("D-367: the owner's case — a shoe that does not go with the worn top and bottom no longer changes them", () => {
  const all = [...L.northstarApprovedOutfits().values()];
  const start = all.find((o) => o.top === "top-tee-hip-cream" && o.bottom === "bottom-skirt-sand" && o.shoes === "shoes-sneakers-beige");
  wear(start.choice);
  assert.deepEqual(L.northstarFitPiece("shoes-ankleboots-brown"), { refused: true, category: "shoes" });
  const ok = L.northstarPieces().filter((p) => p.category === "shoes" && p.item !== start.shoes).map((p) => L.northstarFitPiece(p.item)).filter((f) => !f.refused);
  assert.ok(ok.length > 0, "some shoes go with it");
  for (const f of ok) assert.deepEqual([f.top, f.bottom], [start.top, start.bottom], "a fitting shoe keeps exactly the same top and bottom");
});

test("D-359: an unknown part is refused, and a pupil on today's avatar starts from the start outfit", () => {
  L.northstarUseAccount({});
  assert.equal(L.northstarOutfitNow(), null);
  for (const bad of ["top-planet", "", null, undefined, 7, "__proto__"]) { assert.equal(L.northstarFitPiece(bad), null); assert.deepEqual(L.northstarPieceLayers(bad), []); }
  const f = L.northstarFitPiece("shoes-sneakers-white");
  assert.equal(f.top, L.NORTHSTAR_OUTFITS[L.NORTHSTAR_START_OUTFIT].top);
  assert.equal(f.bottom, L.NORTHSTAR_OUTFITS[L.NORTHSTAR_START_OUTFIT].bottom);
});

test("D-359: the page shows the wardrobe in the items column, no sets, and saves on the account", () => {
  const H = read("avatar.html");
  const column = H.slice(H.indexOf('<div class="inventory-panel">'), H.indexOf("<!-- Titles panel -->"));
  assert.match(column, /id="northstarWardrobe" hidden/);
  assert.ok(!H.slice(H.indexOf('<div class="avatar-panel">'), H.indexOf('<div class="inventory-panel">')).includes("northstarWardrobe"));
  assert.ok(H.indexOf("await loadAll();") < H.indexOf('import("./js/avatar-northstar-panel.js")'), "the wardrobe waits for the profile");
  assert.ok(H.indexOf("northstarUseAccount(avatarIdentity)") < H.indexOf("ns.mountNorthstarWardrobe("));
  assert.match(H, /supabase\.rpc\("set_avatar_northstar", \{ p_choice: choice \}\)/);
  const src = read("js/avatar-northstar-panel.js"), w = src.slice(src.indexOf("export function mountNorthstarWardrobe"));
  assert.ok(!/NORTHSTAR_OUTFITS|K0|K1/.test(w), "the pupil's wardrobe shows no sets");
  assert.match(w, /Valget kunne ikke gemmes\. Prøv igen\./);
  assert.match(w, /Tag hat og andet udstyr af/);
  assert.match(w, /Brug min nuværende avatar/);
});

test("the avatar stands still: only the right column scrolls, and everything below the items stays inside it", () => {
  const H = read("avatar.html");
  assert.match(H, /body \{ overflow: hidden; \}/);
  assert.match(H, /\.right-column \{ min-height: 0; overflow-y: auto;/);
  const right = H.slice(H.indexOf('<div class="right-column">'), H.indexOf('<script type="module">'));
  for (const id of ['class="inventory-panel"', 'id="northstarWardrobe"', 'id="titlesPanel"', 'id="identityPanel"']) assert.ok(right.includes(id), id);
  assert.ok(H.indexOf('<div class="avatar-panel">') < H.indexOf('<div class="right-column">'), "the avatar is outside the scrolling column");
  assert.match(H, /document\.body\.style\.display = "block"/);
  assert.ok(H.indexOf('<div class="page-shell">') < H.indexOf('<div class="topbar">'), "the height lives on a wrapper, since the reveal sets the body to block");
});
