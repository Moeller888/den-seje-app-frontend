// D-314 — the owner's approval of D-312's 305 candidates (sv1-shoe-tee-owner-approval-v1.json) in the Northstar opt-in (no private file
// needed): exactly the candidate file's 305 recommended IDs on its locked sha256; the 37 held out not approved; the runtime list is
// D-305's 21 + these 305 = 326; every reachable shoe outfit is approved (323), the held-out ones and unknown shoes are refused on every
// path the panel can build; no file was added to the public directory and the flag stays false.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { reachableShoeOutfits } from "../../tools/avatar/verify-northstar-sv1-shoes-runtime-d308.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), read = (f) => readFileSync(join(REPO, f), "utf8"), sha = (b) => createHash("sha256").update(b).digest("hex");
const FX = "tools/avatar/fixtures/northstar-wardrobe/shoe-source/", B = JSON.parse(read(FX + "sv1-shoe-tee-owner-approval-v1.json")), F = JSON.parse(read(FX + "sv1-shoe-tee-candidates-v1.json"));
const key = (top, bottom, s) => top + "+" + bottom + "+" + L.NORTHSTAR_SV1_SHOES[s].item;

test("D-314 the approval is exactly the candidate file's 305 recommended IDs, on its locked sha256; the 37 held out are not approved", () => {
  assert.equal(B.candidates.sha256, sha(readFileSync(join(REPO, B.candidates.file)))); assert.equal(B.candidates.sha256, "dbccc63179f07335fc37bc7f807b92420d70e2e76acb388255df29a486b5add1");
  assert.deepEqual(B.combinations.map((c) => c.id), F.recommended.map((u) => u.id)); assert.equal(B.combinations.length, 305);
  assert.deepEqual(B.notApproved, F.heldOut.map((u) => u.id)); assert.equal(B.notApproved.length, 37);
  assert.match(B.ownerWords, /alle 305 anbefalede kombinationer fra D-312/); assert.match(B.scope, /not shop, catalogue/);
  assert.match(B.limitations.join(" | "), /NOT independently validated/);
});

test("D-314 the runtime list is 21 + 305 = 326; 323 reachable, all approved; the held out and unknown shoes refused; no file added; flag false", () => {
  const A = JSON.parse(read(FX + "sv1-v5-owner-approval-v1.json")), want = [...A.combinations.map((c) => key(c.top, c.bottom, c.candidate)), ...B.combinations.map((c) => key(c.top, c.bottom, c.shoe))];
  assert.deepEqual([...L.NORTHSTAR_SV1_SHOE_COMBOS].sort(), want.sort());
  const reach = reachableShoeOutfits(L); assert.equal(reach.length, 323); assert.ok(reach.every(([, o]) => L.NORTHSTAR_SV1_SHOE_COMBOS.includes([o.top, o.bottom, o.shoes].join("+"))));
  for (const u of F.heldOut) assert.ok(!L.NORTHSTAR_SV1_SHOE_COMBOS.includes(key(u.top, u.bottom, u.shoe)), u.id);
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(L.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(L.NORTHSTAR_SOLID_PANTS)]) {
    const o = L.northstarOutfitFor(k, t, p); if (!o) continue;
    if (/trousers/.test(o.bottom)) assert.ok(!L.northstarShoeAllowed(k, t, p, "SV1-V5-CHARCOAL"), [k, t, p].join("+") + ": charcoal with long trousers");
    assert.ok(!L.northstarShoeAllowed(k, t, p, "SV1-V5-ORANGE") && !L.northstarShoeAllowed(k, t, p, null)); }
  const man = JSON.parse(read("assets/avatar-northstar/manifest.json")); assert.equal(readdirSync(join(REPO, "assets", "avatar-northstar")).filter((f) => f !== "manifest.json").length, 73); assert.equal(man.files.length, 73);
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});
