// D-349 — U-343-1, the tee's warm dotted line (no private file needed): the repair is the sweater's split (threshold 1) of the published
// layers' union — it moves exactly the top-body pixels under C's soft arm edge (arm alpha 1..127) to the sleeve layer, keeps the union
// byte for byte, and refuses layers that are not the threshold-128 split; the plan names an item's layer files by its layerRev (default
// 1). Since the owner's publication (2026-11-05) exactly the 18 tees set layerRev 2 and draw their published -v2 layers (shadows v1);
// the v1 revision (the same items without layerRev) still draws exactly the v1 files, which stay published unchanged; the candidate
// list is the historical record and the approval file binds it by sha256. Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import { resplitTee, teeItems, NEW_REV, FROM_ARM_ALPHA } from "../../tools/avatar/northstar-tee-armline-d349.mjs";
import { v1Table, APPROVAL_REL } from "../../tools/avatar/verify-northstar-tee-armline-runtime-d349.mjs";

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

test("D-349 layerRev: exactly the 18 tees set 2 and draw their -v2 layers with v1 shadows; the v1 revision still draws the v1 files", () => {
  const tees = teeItems(L);
  assert.equal(tees.length, 18);
  for (const [k, it] of Object.entries(L.NORTHSTAR_ITEMS)) assert.equal(it.layerRev, tees.includes(k) ? NEW_REV : undefined, k);
  const T1 = v1Table(L.NORTHSTAR_ITEMS);
  for (const k of Object.keys(L.NORTHSTAR_OUTFITS)) { const now = L.northstarCanvasPlan(k).map((s) => s.src.split("/").pop()), then = L.northstarPlanFor(L.NORTHSTAR_OUTFITS[k], T1).map((s) => s.src.split("/").pop());
    assert.ok(then.every((f) => f.endsWith("-v1.webp")), k + ": the v1 revision");
    assert.deepEqual(now.filter((f, i) => f !== then[i]), [L.NORTHSTAR_OUTFITS[k].top + "-top-body-v2.webp", L.NORTHSTAR_OUTFITS[k].top + "-sleeves-v2.webp"], k); }
  const o = L.northstarOutfitFor("K07", "TP-FOX-NAV"), a = L.northstarPlanFor(o, T1).map((s) => s.src.split("/").pop()), b = L.northstarPlanFor(o).map((s) => s.src.split("/").pop());
  assert.deepEqual(b.filter((f, i) => f !== a[i]), [o.top + "-top-body-v2.webp", o.top + "-sleeves-v2.webp"]);
  const shades = L.northstarPlanFor(o).filter((s) => s.op === "shade").map((s) => s.src.split("/").pop());
  assert.ok(shades.length > 0 && shades.every((f) => f.endsWith("-v1.webp")), "shadows keep their files");
  for (const c of [...L.NORTHSTAR_LS2_COMBOS, ...L.NORTHSTAR_TANK_COMBOS]) { const [top, bottom, shoes] = c.split("+");
    assert.deepEqual(L.northstarPlanFor({ top, bottom, shoes }), L.northstarPlanFor({ top, bottom, shoes }, T1), c); }
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});

test("D-349 the candidate list (historical) and the publication: the 36 approved -v2 files are published with their sha256, the v1 files kept", () => {
  const man = JSON.parse(readFileSync(join(REPO, "assets", "avatar-northstar", "manifest.json"), "utf8")), want = teeItems(L).flatMap((t) => ["top-body", "sleeves"].map((l) => t + "-" + l + "-v2.webp")).sort();
  assert.ok(/NOT approved, NOT published/.test(CAND.kind)); assert.equal(CAND.newRev, 2); assert.deepEqual(CAND.files.map((f) => f.file).sort(), want);
  for (const f of CAND.files) { assert.equal(f.replaces, f.file.replace("-v2.webp", "-v1.webp")); const p = man.files.find((x) => x.file === f.replaces);
    assert.equal(p.sha256, f.oldSha256, f.replaces); assert.equal(sha(readFileSync(join(REPO, "assets", "avatar-northstar", f.replaces))), f.oldSha256); assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.notEqual(f.sha256, f.oldSha256);
    assert.equal(f.movedPx, f.file.startsWith("top-tee-hip-blue-") ? 233 : 248); }
  assert.deepEqual([CAND.check.outfits, CAND.check.tees, CAND.check.changedOutsideMoved, CAND.check.alphaLower], [776, 18, 0, 0]);
  const A = JSON.parse(readFileSync(join(REPO, ...APPROVAL_REL.split("/")), "utf8"));
  assert.equal(A.candidatesSha256, sha(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "tee", "tee-armline-v2-candidates.json"))));
  assert.deepEqual(A.files, CAND.files.map((f) => ({ file: f.file, replaces: f.replaces, sha256: f.sha256, bytes: f.bytes }))); assert.deepEqual(A.items, [...teeItems(L)].sort());
  const published = readdirSync(join(REPO, "assets", "avatar-northstar")).filter((f) => f.endsWith("-v2.webp")).sort();
  assert.deepEqual(published, want, "exactly the 36 approved -v2 files are published");
  for (const f of CAND.files) { const b = readFileSync(join(REPO, "assets", "avatar-northstar", f.file)); assert.equal(sha(b), f.sha256, f.file); assert.equal(b.length, f.bytes);
    const e = man.files.find((x) => x.file === f.file); assert.equal(e.sha256, f.sha256); assert.equal(e.origin.decision, "D-349"); }
  const ext = man.extensions.find((e) => e.decision === "D-349"); assert.deepEqual(ext.files, CAND.files.map((f) => f.file)); assert.equal(ext.approval, APPROVAL_REL);
  assert.equal(man.counts.d349Files, 36); assert.equal(man.counts.files, man.files.length);
});
