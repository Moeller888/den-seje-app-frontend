// D-349 — U-343-1, the tee's warm dotted line (no private file needed): the repair is the sweater's split (threshold 1) of the published
// layers' union — it moves exactly the top-body pixels under C's soft arm edge (arm alpha 1..127) to the sleeve layer, keeps the union
// byte for byte, and refuses layers that are not the threshold-128 split; the plan names an item's layer files by its layerRev (default
// 1) and no runtime item sets it yet, so every plan is unchanged; the candidate list names 36 new files, each replacing a published v1
// file with its manifest sha256; no v2 file is published. Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { resplitTee, teeItems, NEW_REV, FROM_ARM_ALPHA } from "../../tools/avatar/northstar-tee-armline-d349.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), W = 1024, N = W * 1536, sha = (b) => createHash("sha256").update(b).digest("hex");
const CAND = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "tee", "tee-armline-v2-candidates.json"), "utf8"));

test("D-349 the repair: the soft-edge pixels move to the sleeve layer, the union stays byte for byte; a non-128 split is refused", () => {
  const arms = new Uint8ClampedArray(N * 4), tb = new Uint8ClampedArray(N * 4), sl = new Uint8ClampedArray(N * 4);
  for (let y = 500; y < 520; y++) { for (let x = 380; x <= 400; x++) arms[(y * W + x) * 4 + 3] = x === 380 ? 60 : 255;   // an arm with a soft outer edge
    for (let x = 370; x <= 410; x++) { const i = y * W + x, a = arms[i * 4 + 3]; (a >= 128 ? sl : tb).set([200, 30, 40, 250], i * 4); } }
  const r = resplitTee(tb, sl, arms);
  assert.equal(FROM_ARM_ALPHA, 1); assert.equal(r.moved.length, 20); assert.ok(r.moved.every((i) => i % W === 380));
  for (let i = 0; i < N; i++) { const u0 = tb[i * 4 + 3] || sl[i * 4 + 3], u1 = r.tb[i * 4 + 3] || r.sl[i * 4 + 3]; assert.equal(u0, u1); if (r.tb[i * 4 + 3]) assert.equal(arms[i * 4 + 3], 0); }
  const bad = Uint8ClampedArray.from(sl); bad[(505 * W + 380) * 4 + 3] = 250; assert.throws(() => resplitTee(tb, bad, arms), /overlap/);
  const moved = Uint8ClampedArray.from(tb), sl2 = Uint8ClampedArray.from(sl); sl2.set(moved.subarray((505 * W + 380) * 4, (505 * W + 380) * 4 + 4), (505 * W + 380) * 4); moved.fill(0, (505 * W + 380) * 4, (505 * W + 380) * 4 + 4);
  assert.throws(() => resplitTee(moved, sl2, arms), /threshold-128/);
});

test("D-349 layerRev: no runtime item sets it, so every plan draws -v1 files; a table with layerRev 2 names only that item's layers -v2", () => {
  assert.ok(Object.values(L.NORTHSTAR_ITEMS).every((it) => it.layerRev === undefined));
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) assert.ok(L.northstarCanvasPlan(k).every((s) => s.src.endsWith("-v1.webp")));
  const o = L.northstarOutfitFor("K07", "TP-FOX-NAV"), table = { ...L.NORTHSTAR_ITEMS, [o.top]: { ...L.NORTHSTAR_ITEMS[o.top], layerRev: NEW_REV } };
  const a = L.northstarPlanFor(o).map((s) => s.src.split("/").pop()), b = L.northstarPlanFor(o, table).map((s) => s.src.split("/").pop());
  assert.deepEqual(b.filter((f, i) => f !== a[i]), [o.top + "-top-body-v2.webp", o.top + "-sleeves-v2.webp"]);
  const shades = L.northstarPlanFor(o, table).filter((s) => s.op === "shade").map((s) => s.src.split("/").pop());
  assert.ok(shades.length > 0 && shades.every((f) => f.endsWith("-v1.webp")), "shadows keep their files");
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});

test("D-349 the candidate list: 36 new files for the 18 tees, each replacing a published v1 file by its manifest sha256; none published", () => {
  const man = JSON.parse(readFileSync(join(REPO, "assets", "avatar-northstar", "manifest.json"), "utf8")), want = teeItems(L).flatMap((t) => ["top-body", "sleeves"].map((l) => t + "-" + l + "-v2.webp")).sort();
  assert.ok(/NOT approved, NOT published/.test(CAND.kind)); assert.equal(CAND.newRev, 2); assert.deepEqual(CAND.files.map((f) => f.file).sort(), want);
  for (const f of CAND.files) { assert.equal(f.replaces, f.file.replace("-v2.webp", "-v1.webp")); const p = man.files.find((x) => x.file === f.replaces);
    assert.equal(p.sha256, f.oldSha256, f.replaces); assert.equal(sha(readFileSync(join(REPO, "assets", "avatar-northstar", f.replaces))), f.oldSha256); assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.notEqual(f.sha256, f.oldSha256);
    assert.equal(f.movedPx, f.file.startsWith("top-tee-hip-blue-") ? 233 : 248); }
  assert.deepEqual([CAND.check.outfits, CAND.check.tees, CAND.check.changedOutsideMoved, CAND.check.alphaLower], [776, 18, 0, 0]);
  assert.ok(!readdirSync(join(REPO, "assets", "avatar-northstar")).some((f) => f.endsWith("-v2.webp")), "no v2 file is published");
});
