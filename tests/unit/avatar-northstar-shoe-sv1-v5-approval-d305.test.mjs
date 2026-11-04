// D-305 — the owner's approval of 21 concrete SV1-V5 combinations (sv1-v5-owner-approval-v1.json) and the private runtime preparation:
// exactly D-304's recommended set, each tied to its locked layer; charcoal with the three long trousers not approved; nothing published
// or integrated by D-305 itself; D-308 then published exactly the staged files under the owner's permission. No private file is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as AL from "../../js/avatar-layers.js";
import * as P from "../../tools/avatar/northstar-sv1-v5-runtime-prep.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");
const A = JSON.parse(readFileSync(join(ROOT, P.APPROVAL_REL), "utf8")), M = JSON.parse(readFileSync(join(ROOT, A.package.file), "utf8"));
const BOTTOMS = ["bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"];

test("D-305 the approval is exactly D-304's 21 recommended combinations, on the locked package", () => {
  assert.equal(A.decision, "D-305"); assert.equal(sha(readFileSync(join(ROOT, A.package.file))), A.package.sha256);
  const want = [...["SV1-V5-CHALK", "SV1-V5-NAVYWHITE", "SV1-V5-BURGUNDYGUM"].flatMap((c) => BOTTOMS.map((b) => c + "--" + b.replace("bottom-", ""))), ...BOTTOMS.slice(0, 3).map((b) => "SV1-V5-CHARCOAL--" + b.replace("bottom-", ""))];
  assert.equal(A.combinations.length, 21); assert.deepEqual(new Set(A.combinations.map((c) => c.id)), new Set(want)); assert.equal(new Set(A.combinations.map((c) => c.id)).size, 21);
  for (const c of A.combinations) { assert.equal(c.id, c.candidate + "--" + c.bottom.replace("bottom-", "")); assert.equal(c.top, "top-tee-hip-cream"); assert.equal(c.layerSha256, M.candidates[c.candidate].layerSha256); }
  assert.deepEqual(A.notApproved, ["SV1-V5-CHARCOAL--trousers-square-olive", "SV1-V5-CHARCOAL--trousers-square-navy", "SV1-V5-CHARCOAL--trousers-square-sand"]);
  for (const n of A.notApproved) assert.ok(!A.combinations.some((c) => c.id === n));
});

test("D-305 the history and the limits are kept", () => {
  assert.match(A.limitations.join(" | "), /D-301.*REJECTED SOURCE/); assert.match(A.limitations.join(" | "), /D-302/); assert.match(A.limitations.join(" | "), /NOT independently validated/);
  assert.match(A.scope, /not general mass production/); assert.match(A.publication, /^NOT GRANTED/);
  assert.match(M.status, /NOT APPROVED/, "D-304's package record is history, unchanged");
});

test("D-305 published by D-308 exactly as staged: the 8 files with D-305's hashes, the item shape, the 21 combinations; the flag false", () => {
  const FILES = { "shoes-sneakers-low-sv1-chalk-shoes-v1.webp": ["917921f24e8b8093f24d2266bf3116ed7ce2c992b213acbc63b95c9bd2637cc7", 33100], "shoes-sneakers-low-sv1-charcoal-shoes-v1.webp": ["7f75aa7eb25d4e79b6b045f271f7c3cf3d200f81a081b159ad564d062a2eee33", 23364],
    "shoes-sneakers-low-sv1-navywhite-shoes-v1.webp": ["15a7e348694be940807b1cca97057ac5d95ec7c24ed81b493ec4b397798ae553", 32542], "shoes-sneakers-low-sv1-burgundygum-shoes-v1.webp": ["1363624ae8cc838e91c004495336726627558be9b7d3aef038739503df295b4f", 33766],
    ...Object.fromEntries(["chalk", "charcoal", "navywhite", "burgundygum"].map((c) => ["hide-shoes-sneakers-low-sv1-" + c + "-v1.webp", ["89dca922cc815e4e8774b419a451dfb7bd3370daa2351aca07dcdb176474ac64", 634]])) };
  const doc = readFileSync(join(ROOT, "docs", "decisions", "D-305.md"), "utf8");
  for (const [f, [h, n]] of Object.entries(FILES)) { const b = readFileSync(join(ROOT, "assets", "avatar-northstar", f)); assert.deepEqual([sha(b), b.length], [h, n], f); assert.ok(doc.includes(h), f + ": the hash D-305 listed"); }
  for (const [id, item] of Object.entries(P.RUNTIME_ITEMS)) { assert.equal(AL.NORTHSTAR_SV1_SHOES[id].item, item); assert.deepEqual({ ...AL.NORTHSTAR_ITEMS[item], layers: [...AL.NORTHSTAR_ITEMS[item].layers], shadows: [...AL.NORTHSTAR_ITEMS[item].shadows] }, { ...P.RUNTIME_ITEM_SHAPE, layers: [...P.RUNTIME_ITEM_SHAPE.layers], shadows: [...P.RUNTIME_ITEM_SHAPE.shadows] }); }
  const d305 = A.combinations.map((c) => c.top + "+" + c.bottom + "+" + P.RUNTIME_ITEMS[c.candidate]); assert.ok(d305.every((k) => AL.NORTHSTAR_SV1_SHOE_COMBOS.includes(k)), "D-305's 21 stay approved");
  assert.equal(AL.NORTHSTAR_SV1_SHOE_COMBOS.length, 21 + 305, "D-314 added exactly D-312's 305 candidates");
  assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, false); assert.deepEqual(Object.keys(P.RUNTIME_ITEMS), Object.keys(M.candidates));
});
