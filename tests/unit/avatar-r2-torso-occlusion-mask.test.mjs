// ── A1 torso occlusion mask + slot template (D-085): unit tests ─────────────
// Verifies the TRACKED template under tools/avatar/fixtures/r2-torso/ directly — geometry, banding,
// anatomy exclusions, feather limit, complement, binarity — plus the pinned input contract.
//
// The decoder tools/avatar/vendor/dwebp.exe is GITIGNORED, so the tests that must re-run the builder
// (determinism, verify-writes-nothing) are skipped with an explicit message when it is absent; every
// other test runs from the committed fixtures alone and always executes.
//
// A1 is not A2 and not A3: nothing here activates the torso slot, discharges D-037, or touches the
// D-083 whole-avatar C2 fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  decodePng, D084, OUT_W, OUT_H, INPUT_EXPECT_SHA, MIN_COMPONENT, FRINGE_TOLERANCE_PX, TOOL,
} from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const TOOL_PATH = join(REPO, "tools", "avatar", "build-r2-torso-occlusion-mask.mjs");
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const INPUT = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const V1_PNG = "body-neutral-medium-v1.png";

const spec = JSON.parse(readFileSync(join(FIX, "torso-mask-spec-v1.json"), "utf8"));
const load = (name) => decodePng(readFileSync(join(FIX, name)), name);
const alphaOf = (img) => { const a = new Uint8Array(img.w * img.h); for (let i = 0; i < a.length; i++) a[i] = img.rgba[i * 4 + 3]; return a; };
const hard = load("torso-occlusion-hard-v1.png");
const edit = load("torso-edit-allowed-v1.png");
const protect = load("torso-protect-v1.png");
const hardA = alphaOf(hard), editA = alphaOf(edit), protectA = alphaOf(protect);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ── input contract ──────────────────────────────────────────────────────────
test("the pinned input is the RUNTIME v2 WebP, and its SHA still matches the asset on disk", () => {
  assert.equal(spec.input.path, "assets/avatar-r2/base/body-neutral-medium-v2.webp");
  assert.equal(spec.input.sha256, INPUT_EXPECT_SHA);
  assert.ok(existsSync(INPUT), "runtime base present");
  assert.equal(sha256(readFileSync(INPUT)), INPUT_EXPECT_SHA, "the tracked template was derived from the asset that is on disk now");
  assert.equal(spec.input.width, 512);
  assert.equal(spec.input.height, 768);
});

test("the historical v1 PNG is never used as a geometric input", () => {
  const toolSrc = readFileSync(TOOL_PATH, "utf8");
  const specSrc = readFileSync(join(FIX, "torso-mask-spec-v1.json"), "utf8");
  // the tool may NAME v1 in prose; it must never reference it as a path
  assert.ok(!/assets[\\/]avatar-r2[\\/]base[\\/]body-neutral-medium-v1\.png/.test(toolSrc), "tool does not read the v1 asset");
  assert.ok(!specSrc.includes(V1_PNG), "spec does not reference the v1 asset");
});

test("tool identity and the D-084 landmarks it locks", () => {
  assert.equal(spec.tool, TOOL);
  assert.deepEqual(spec.landmarks.locked, { ...D084 });
  assert.deepEqual(D084, {
    shoulderY: 560, sleeveEndY: 714, hemY: 902, crotchY: 1000, fingertipY: 1054, seamX0: 372, seamX1: 640,
  });
  // every re-measured landmark stayed within tolerance of the locked value
  for (const [k, v] of Object.entries(spec.landmarks.locked)) {
    const delta = Math.abs(spec.landmarks.measured[k] - v);
    assert.ok(delta <= spec.landmarks.toleranceMasterPx, `${k} drift ${delta} within tolerance`);
  }
});

// ── dimensions + binarity ───────────────────────────────────────────────────
test("all three masks are exactly 1024x1536 (the Master canvas)", () => {
  for (const [name, img] of [["hard", hard], ["edit", edit], ["protect", protect]]) {
    assert.equal(img.w, OUT_W, name + " width");
    assert.equal(img.h, OUT_H, name + " height");
  }
});

test("masks are binary: alpha is only 0 or 255", () => {
  for (const [name, a] of [["hard", hardA], ["edit", editA], ["protect", protectA]]) {
    const bad = a.findIndex((v) => v !== 0 && v !== 255);
    assert.equal(bad, -1, `${name} has a non-binary alpha at index ${bad}`);
  }
});

test("protect is the EXACT complement of edit", () => {
  let mismatch = 0;
  for (let i = 0; i < editA.length; i++) if ((editA[i] > 0) === (protectA[i] > 0)) mismatch++;
  assert.equal(mismatch, 0);
});

test("hard is a subset of edit (the blend zone only ever adds)", () => {
  let outside = 0;
  for (let i = 0; i < hardA.length; i++) if (hardA[i] > 0 && editA[i] === 0) outside++;
  assert.equal(outside, 0);
});

// ── banding rules from D-084 ────────────────────────────────────────────────
test("no mask pixel above the shoulder line (head and neck are untouchable)", () => {
  let above = 0;
  for (let y = 0; y < D084.shoulderY; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (hardA[i] || editA[i]) above++;
  }
  assert.equal(above, 0);
});

test("no mask pixel at or below the crotch (legs are untouchable)", () => {
  let below = 0;
  for (let y = D084.crotchY; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (hardA[i] || editA[i]) below++;
  }
  assert.equal(below, 0);
});

test("below the sleeve end nothing sits outboard of the seam corridor (forearms and hands survive)", () => {
  let outboard = 0;
  for (let y = D084.sleeveEndY; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      if (x >= D084.seamX0 && x <= D084.seamX1) continue;
      const i = y * OUT_W + x;
      if (hardA[i] || editA[i]) outboard++;
    }
  }
  assert.equal(outboard, 0, "no mask pixel outside the corridor below the sleeve end");
});

test("the fingertip line is cleared with margin", () => {
  let contact = 0;
  for (let y = D084.fingertipY - 8; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) if (editA[y * OUT_W + x]) contact++;
  assert.equal(contact, 0);
  assert.ok(spec.masks["torso-edit-allowed-v1.png"].bbox.y1 < D084.crotchY, "edit ends above the crotch, far above the fingertips");
});

test("the hem extension stays inside the corridor between hem and crotch", () => {
  const hem = spec.hemExtension;
  assert.ok(hem.px > 0, "an optional hem extension exists");
  assert.ok(hem.bbox.y0 >= D084.hemY && hem.bbox.y1 < D084.crotchY, "hem band");
  assert.ok(hem.bbox.x0 >= D084.seamX0 && hem.bbox.x1 <= D084.seamX1, "hem corridor");
});

// ── feather discipline ──────────────────────────────────────────────────────
test("every edit pixel outside hard sits within 4 Master px of hard, or inside the hem band", () => {
  const R = 4, R2 = R * R;
  let violations = 0;
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const i = y * OUT_W + x;
      if (!editA[i] || hardA[i]) continue;
      if (y >= D084.hemY && y < D084.crotchY && x >= D084.seamX0 && x <= D084.seamX1) continue; // hem extension
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R2) continue;
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || yy >= OUT_H || xx < 0 || xx >= OUT_W) continue;
        if (hardA[yy * OUT_W + xx]) { near = true; break; }
      }
      if (!near) violations++;
    }
  }
  assert.equal(violations, 0, "no edit pixel is farther than 4 px from the hard mask");
});

// ── island freedom (8-connected) ────────────────────────────────────────────
test("the hard mask is a single connected region with no specks", () => {
  const seen = new Uint8Array(hardA.length); const sizes = [];
  const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let start = 0; start < hardA.length; start++) {
    if (!hardA[start] || seen[start]) continue;
    let n = 0; const stack = [start]; seen[start] = 1;
    while (stack.length) {
      const j = stack.pop(); n++;
      const y = (j / OUT_W) | 0, x = j % OUT_W;
      for (const [dx, dy] of NEIGH) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= OUT_W || yy >= OUT_H) continue;
        const k = yy * OUT_W + xx;
        if (hardA[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    sizes.push(n);
  }
  assert.equal(sizes.length, 1, "exactly one region, got sizes " + JSON.stringify(sizes.slice(0, 8)));
  assert.ok(sizes[0] >= MIN_COMPONENT);
});

// ── the recorded gate set ───────────────────────────────────────────────────
test("every gate recorded in the tracked spec passed, and the status is the A1 review status", () => {
  const failed = spec.gates.filter((g) => !g.pass);
  assert.deepEqual(failed, [], "recorded gate failures");
  assert.ok(spec.gates.length >= 20, "the gate set is substantial, got " + spec.gates.length);
  assert.equal(spec.status, "A1_BUILT_GATES_PASS_OWNER_VISUAL_REVIEW_REQUIRED");
});

test("the accepted residues are bounded and disclosed", () => {
  const fringe = spec.residues.detachedFringe;
  assert.ok(fringe.detachedFringePx <= FRINGE_TOLERANCE_PX, "detached fringe within tolerance");
  assert.equal(fringe.beyondMaxDistance, 0, "nothing detached beyond the max distance");
  const collar = spec.residues.garmentAboveShoulderLine;
  assert.ok(collar.px > 0, "the collar residue is reported, not hidden");
  assert.ok(collar.bbox.y1 < D084.shoulderY, "the residue lies entirely above the shoulder line");
});

test("the boundary record states what A1 does NOT do", () => {
  assert.equal(spec.boundaries.avatarR2, false);
  assert.equal(spec.boundaries.aiUsed, false);
  assert.equal(spec.boundaries.wroteRuntimeAsset, false);
  assert.equal(spec.boundaries.wroteR2Manifest, false);
  assert.match(spec.boundaries.d037, /CONDITIONAL/);
  assert.match(spec.boundaries.d083Fallback, /unchanged/);
});

test("no fixture leaked into a runtime asset directory", () => {
  const names = readdirSync(FIX).sort();
  assert.deepEqual(names, [
    "torso-edit-allowed-v1.png", "torso-mask-spec-v1.json", "torso-occlusion-hard-v1.png", "torso-protect-v1.png",
  ]);
  assert.ok(!existsSync(join(REPO, "assets", "avatar-r2", "torso")), "nothing was promoted to assets/avatar-r2/");
});

// ── malformed input ─────────────────────────────────────────────────────────
test("the PNG decoder rejects malformed input instead of guessing", () => {
  assert.throws(() => decodePng(Buffer.from("not a png at all"), "junk"), /not a PNG/);
  const truncated = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]);
  assert.throws(() => decodePng(truncated, "truncated"), /no IHDR/);
});

// ── builder round-trips (need the gitignored decoder) ───────────────────────
const haveDwebp = existsSync(DWEBP);
const runTool = (args) => spawnSync(process.execPath, [TOOL_PATH, ...args], { encoding: "utf8" });

test("verify mode reproduces the tracked masks byte-for-byte and writes nothing", (t) => {
  if (!haveDwebp) return t.skip("tools/avatar/vendor/dwebp.exe absent (gitignored) — run `node tools/avatar/fetch-dwebp.mjs` to cover this locally");
  const before = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  const res = runTool([]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /VERIFY OK/);
  const after = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  assert.deepEqual(after, before, "verify mode must not touch the tracked files");
});

test("two independent builds produce byte-identical outputs", (t) => {
  if (!haveDwebp) return t.skip("tools/avatar/vendor/dwebp.exe absent (gitignored)");
  const first = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  const res = runTool(["--write"]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const second = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  assert.deepEqual(second, first, "the build is deterministic");
  // and the SHAs recorded in the spec are the SHAs of the files on disk
  for (const [name, s] of Object.entries(spec.masks)) {
    assert.equal(sha256(readFileSync(join(FIX, name))), s.sha256, name + " SHA matches the spec record");
  }
});
