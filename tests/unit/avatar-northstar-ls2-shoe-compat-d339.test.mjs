// D-339 — the sweaters (D-337) with the other existing shoes, offline (no private file read): the candidate list is exactly what the
// browser's own functions reach today (40 bottom x shoes pairs x 6 sweaters = 240), every pair approved before with a tee; the navy shorts
// and charcoal with long trousers stay outside; the review groups (5 hip, 40 hem, 54 colour) are complete; the runtime list is NOT
// extended (30) and the flag is false. Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as AL from "../../js/avatar-layers.js";
import * as C from "../../tools/avatar/northstar-ls2-shoe-compat.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), K = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "sweater", "ls2-shoe-candidates-v1.json"), "utf8"));

test("D-339 the candidates are exactly the 240 combinations the opt-in reaches today, each pair approved before with a tee", () => {
  const map = C.combinations(AL); assert.equal(map.length, 240); assert.deepEqual(K.candidates.map((c) => c.id), map.map((c) => c.id)); assert.equal(new Set(map.map((c) => c.id)).size, 240);
  for (const c of map) { assert.ok(c.prior, c.id + " has an earlier approval"); assert.ok(C.BOTTOMS.includes(c.bottom)); assert.notEqual(c.shoes, C.APPROVED_SHOES); assert.ok(Object.values(AL.NORTHSTAR_LS2_SWEATERS).some((s) => s.item === c.top)); }
  assert.equal(K.count, 240);
});

test("D-339 the restrictions hold: no navy shorts, no charcoal with long trousers, no beige sneakers (already approved)", () => {
  for (const c of K.candidates) { assert.notEqual(c.bottom, "bottom-shorts-navy"); assert.ok(!(c.shoes === "shoes-sneakers-low-sv1-charcoal" && /trousers/.test(c.bottom)), c.id); assert.notEqual(c.shoes, "shoes-sneakers-beige"); }
  assert.deepEqual(K.heldOut.map((h) => h.what), ["bottom-shorts-navy with every shoe", "SV1-V5-CHARCOAL with long trousers"]);
});

test("D-339 the review groups: 5 hip joins, 40 hem joins (both already reviewed), 54 colour pairs to judge", () => {
  const g = (k) => new Set(K.candidates.map((c) => c.groups[k])).size; assert.deepEqual([g("hip"), g("hem"), g("colour")], [5, 40, 54]);
  assert.deepEqual([K.reviewGroups.hip.count, K.reviewGroups.hem.count, K.reviewGroups.colour.count], [5, 40, 54]);
  for (const c of K.candidates) { assert.equal(c.evidence.technical, "PASS"); assert.equal(c.evidence.enclosedPx, 0); assert.equal(c.evidence.runtimeBytesDiffering, 0); assert.ok(c.evidence.hipOpen.right <= 1 && c.evidence.hipOpen.left === 0); }
});

test("D-339 nothing is extended: the runtime list stays D-336's 30, the flag false", () => {
  assert.equal(AL.NORTHSTAR_LS2_COMBOS.length, 30); assert.ok(AL.NORTHSTAR_LS2_COMBOS.every((k) => k.endsWith("+shoes-sneakers-beige"))); assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, false);
});
