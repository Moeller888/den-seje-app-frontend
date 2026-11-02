// D-305 — the owner's approval of 21 concrete SV1-V5 combinations (sv1-v5-owner-approval-v1.json) and the private runtime preparation:
// exactly D-304's recommended set, each tied to its locked layer; charcoal with the three long trousers not approved; nothing published
// or integrated (no file in assets/avatar-northstar/, no item in the runtime table). No private file is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

test("D-305 nothing is published or integrated: no staged file in assets/, no item in the runtime, the flag false", () => {
  for (const item of Object.values(P.RUNTIME_ITEMS)) { assert.ok(!Object.prototype.hasOwnProperty.call(AL.NORTHSTAR_ITEMS, item), item + " is in the runtime table");
    for (const f of [item + "-shoes-v1.webp", "hide-" + item + "-v1.webp"]) assert.ok(!existsSync(join(ROOT, "assets", "avatar-northstar", f)), f + " is published"); }
  assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, false);
  assert.deepEqual(Object.keys(P.RUNTIME_ITEMS), Object.keys(M.candidates));
  assert.deepEqual({ ...P.RUNTIME_ITEM_SHAPE, layers: [...P.RUNTIME_ITEM_SHAPE.layers], shadows: [...P.RUNTIME_ITEM_SHAPE.shadows] }, { ...AL.NORTHSTAR_ITEMS["shoes-sneakers-beige"], shadowsOf: "shoes-sneakers-beige" });
});
