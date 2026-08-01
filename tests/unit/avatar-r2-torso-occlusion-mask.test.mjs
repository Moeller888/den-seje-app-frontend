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
  decodePng, D084, OUT_W, OUT_H, INPUT_EXPECT_SHA, MIN_COMPONENT, FRINGE_TOLERANCE_PX, TOOL, build,
} from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { verifyVendoredDwebp, EXE_SHA256, VERSION as DWEBP_VERSION } from "../../tools/avatar/fetch-dwebp.mjs";

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
test("above the shoulder line the mask carries the tee's COLLAR CURVE — and only that (D-085 revision)", () => {
  // The first A1 cut obeyed a flat "0 px above y=560" rule and left 2,740 px of the base tee's collar
  // uncovered, which breaks D-037's full-occlusion requirement. The collar is now inside the mask.
  let above = 0, minY = OUT_H, minX = OUT_W, maxX = 0;
  for (let y = 0; y < D084.shoulderY; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (!hardA[i]) continue;
    above++; if (y < minY) minY = y; if (x < minX) minX = x; if (x > maxX) maxX = x;
  }
  assert.ok(above > 2000, `the collar curve must be masked, got ${above} px`);
  assert.ok(minY >= 500, `the collar zone must not climb into the head, topmost row ${minY}`);
  assert.ok(minX >= D084.seamX0 - 20 && maxX <= D084.seamX1 + 80, `collar stays over the shoulders, x ${minX}..${maxX}`);
  // and the recorded residue says the same thing
  assert.equal(spec.residues.collarAboveShoulderLine.status, "CLOSED");
  assert.equal(spec.residues.collarAboveShoulderLine.uncoveredPx, 0);
});

test("fabric-coloured NON-garment pixels in the collar band stay out (jaw/ear AA, not tee)", () => {
  const r = spec.residues.nonTeeGreyInCollarBand;
  assert.ok(r.px > 0, "the metric is reported, not silently dropped");
  // They are anti-aliased blends along the head contour, so at most a stray pixel abuts the garment.
  assert.ok(r.adjacentToTee <= 2, `essentially none touches the garment, got ${r.adjacentToTee}`);
  assert.ok(r.fartherThan10px > 0, "a large share sits well away from the garment");
  assert.ok(r.px < 200, "and the whole set stays small, got " + r.px);
});

test("no mask pixel at or below the crotch (legs are untouchable)", () => {
  let below = 0;
  for (let y = D084.crotchY; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (hardA[i] || editA[i]) below++;
  }
  assert.equal(below, 0);
});

test("below the sleeve end only TEE FABRIC may sit outboard of the corridor — never anatomy", () => {
  let outboard = 0;
  for (let y = D084.sleeveEndY; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      if (x >= D084.seamX0 && x <= D084.seamX1) continue;
      const i = y * OUT_W + x;
      if (hardA[i] || editA[i]) outboard++;
    }
  }
  const gate = spec.gates.find((g) => g.id === "outboard-below-sleeve-end-is-tee-fabric-only");
  assert.ok(gate && gate.pass, "the recorded gate passed");
  assert.equal(gate.detail.nonTeePx, 0, "no non-garment pixel outboard");
  assert.equal(outboard, gate.detail.teeFabricPx, "every outboard pixel in the fixture is accounted for as fabric");
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

test("the one remaining residue is bounded and disclosed; the collar residue is closed", () => {
  // The 6 px detached sleeve-tip fringe stays: it cannot enter the mask without breaking the
  // island-free rule, the 4 px feather or the alpha>=128 solidity convention. It is sub-pixel at
  // render size and hard-bounded.
  const fringe = spec.residues.detachedFringe;
  assert.ok(fringe.detachedFringePx <= FRINGE_TOLERANCE_PX, "detached fringe within tolerance");
  assert.equal(fringe.beyondMaxDistance, 0, "nothing detached beyond the max distance");
  // The collar residue that blocked owner acceptance is gone, not re-labelled.
  const collar = spec.residues.collarAboveShoulderLine;
  assert.equal(collar.status, "CLOSED");
  assert.equal(collar.uncoveredPx, 0);
  assert.ok(collar.teeCollarPx > 2000, "the collar curve is genuinely in the mask, got " + collar.teeCollarPx);
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
  // A1 itself still promotes nothing. The torso asset that exists from D-089 onwards was placed by
  // the separate, owner-gated promotion tool — never by this builder, which may only write the
  // template and its gitignored review artifacts.
  // (The builder READS the runtime base as its input, so the check is on WRITES: every write goes
  // through `guardedPath`, whose allowlist is the fixture dir and the gitignored build dir only.)
  const builderSrc = readFileSync(join(REPO, "tools", "avatar", "build-r2-torso-occlusion-mask.mjs"), "utf8");
  assert.match(builderSrc, /function guardedPath\(/, "the A1 builder must keep its write guard");
  assert.match(builderSrc, /const allowed = \[resolve\(FIX_DIR\) \+ sep, resolve\(BUILD_DIR\) \+ sep\]/,
    "the write allowlist must stay the fixture + build dirs — never the runtime asset tree");
});

// ── malformed input ─────────────────────────────────────────────────────────
test("the PNG decoder rejects malformed input instead of guessing", () => {
  assert.throws(() => decodePng(Buffer.from("not a png at all"), "junk"), /not a PNG/);
  const truncated = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]);
  assert.throws(() => decodePng(truncated, "truncated"), /no IHDR/);
});

// ── decoder bootstrap contract (D-085 phase 2) ──────────────────────────────
// The decoder is gitignored, so a fresh clone bootstraps it with `node tools/avatar/fetch-dwebp.mjs`.
// That script now pins a CHECKSUM as well as the version+URL. These tests never skip: a missing or
// wrong decoder is a loud failure, because "skipped" would mean reproducibility was never proven.
const runTool = (args) => spawnSync(process.execPath, [TOOL_PATH, ...args], { encoding: "utf8" });
function requireDecoder() {
  const v = verifyVendoredDwebp();
  assert.ok(v.ok,
    `vendored WebP decoder unusable (${v.reason}). ${v.how || ""}\n` +
    "This test must NOT be skipped: without the decoder the builder's reproducibility is unproven (D-085 phase 2).");
}

test("the decoder is version- AND checksum-pinned, and the guard reports both failure modes", () => {
  assert.equal(DWEBP_VERSION, "1.5.0");
  assert.match(EXE_SHA256, /^[0-9a-f]{64}$/);
  // missing binary → actionable bootstrap instruction, never a silent pass
  const missing = verifyVendoredDwebp(join(REPO, "tools", "avatar", "vendor", "definitely-not-here.exe"));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing");
  assert.match(missing.how, /fetch-dwebp\.mjs/);
  // wrong content at the right path → checksum mismatch, not acceptance
  const wrong = verifyVendoredDwebp(INPUT);           // a real file, but not dwebp
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "checksum-mismatch");
  assert.equal(wrong.expected, EXE_SHA256);
});

test("the vendored decoder present in this working copy is the pinned one", () => {
  requireDecoder();
  assert.equal(verifyVendoredDwebp().sha256, EXE_SHA256);
  assert.equal(spec.decoder.sha256, EXE_SHA256, "the spec records which decoder produced the template");
  assert.equal(spec.decoder.version, DWEBP_VERSION);
});

test("no critical test in this file is skipped", () => {
  const src = readFileSync(join(HERE, "avatar-r2-torso-occlusion-mask.test.mjs"), "utf8");
  assert.ok(!/\bt\.skip\(/.test(src), "builder/determinism tests must fail loudly, never skip");
});

// ── builder round-trips ─────────────────────────────────────────────────────
test("verify mode reproduces the tracked masks byte-for-byte and writes nothing", () => {
  requireDecoder();
  const before = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  const res = runTool([]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /VERIFY OK/);
  const after = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  assert.deepEqual(after, before, "verify mode must not touch the tracked files");
});

test("two independent builds produce byte-identical outputs", () => {
  requireDecoder();
  // Compare BUILD against BUILD, not checkout against build: on Windows git checks the JSON out with
  // CRLF (core.autocrlf) while the tool writes LF, so the first write legitimately changes those bytes
  // once. The property under test is that the builder is deterministic, not that git's line-ending
  // normalisation matches it — the PNGs, being binary, are unaffected either way.
  const w1 = runTool(["--write"]);
  assert.equal(w1.status, 0, w1.stdout + w1.stderr);
  const first = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  const w2 = runTool(["--write"]);
  assert.equal(w2.status, 0, w2.stdout + w2.stderr);
  const second = readdirSync(FIX).map((f) => [f, sha256(readFileSync(join(FIX, f)))]);
  assert.deepEqual(second, first, "the build is deterministic");
  for (const [name, s] of Object.entries(spec.masks)) {
    assert.equal(sha256(readFileSync(join(FIX, name))), s.sha256, name + " SHA matches the spec record");
  }
});

// ── the D-037 core requirement, verified against the BASE, not just the fixtures ──
test("every pixel of the base tee is paintable, and its FABRIC is fully mandatory — on the decoded base", () => {
  requireDecoder();
  const r = build();
  let teeTotal = 0, unpaintable = 0, editOnly = 0, fabricTotal = 0, fabricUncovered = 0, onAnatomy = 0;
  for (let i = 0; i < r.m.tee.length; i++) {
    if (r.m.teeFabric[i]) { fabricTotal++; if (!r.masks.hard[i]) fabricUncovered++; }
    if (!r.m.tee[i]) continue;
    teeTotal++;
    if (r.masks.hard[i]) continue;
    if (r.masks.edit[i]) editOnly++; else unpaintable++;
  }
  for (let i = 0; i < r.masks.edit.length; i++) {
    if (r.masks.edit[i] && (r.z.headNeck[i] || r.z.forearmHand[i] || r.z.leg[i])) onAnatomy++;
  }
  assert.ok(teeTotal > 90000, "the garment was actually found, got " + teeTotal);
  assert.equal(unpaintable, 0, "D-037: no part of the base tee may fall outside both masks");
  assert.equal(fabricUncovered, 0, "all garment FABRIC is mandatory, not merely paintable");
  assert.ok(editOnly <= FRINGE_TOLERANCE_PX, `island-rule casualties bounded, got ${editOnly}`);
  assert.equal(onAnatomy, 0, "no overlap with head, neck, forearms, hands or legs");
  assert.equal(r.m.teeTop, spec.tee.topY);
  assert.equal(r.gates.filter((g) => !g.pass).length, 0, "all gates pass on a live build");
});

// ── the semantic gates the revision-2 classifier could not express ──────────
test("SEMANTIC: no skin is inside the mask, at any brightness (the inversion the owner caught)", () => {
  requireDecoder();
  const r = build();
  // hue-based, independent of the tool's landmark swatches: shadowed skin keeps its warmth
  let skinInHard = 0, skinInEdit = 0;
  for (let i = 0; i < r.masks.hard.length; i++) {
    const R = r.base.rgba[i * 4], B = r.base.rgba[i * 4 + 2], A = r.base.rgba[i * 4 + 3];
    if (A < 128 || !(R - B >= 50 && R >= 110)) continue;
    if (r.masks.hard[i]) skinInHard++;
    if (r.masks.edit[i]) skinInEdit++;
  }
  assert.equal(skinInHard, 0, "no skin in the hard mask");
  assert.equal(skinInEdit, 0, "no feather on skin either");
  const gate = spec.gates.find((g) => g.id === "no-semantic-skin-in-mask");
  assert.ok(gate && gate.pass && gate.detail.skinInHard === 0 && gate.detail.skinInEdit === 0);
});

test("SEMANTIC: the tee's own dark line work is inside the mask (the collar ring belongs to the shirt)", () => {
  const gate = spec.gates.find((g) => g.id === "tee-line-work-covered");
  assert.ok(gate && gate.pass, "recorded gate passed");
  assert.ok(gate.detail.ownedTotal > 1500, "line work was actually identified, got " + gate.detail.ownedTotal);
  assert.ok(gate.detail.ratio >= 0.99, "coverage ratio " + gate.detail.ratio);
});

test("SEMANTIC: the mask's neckline contour follows the garment's visible edge row by row", () => {
  const gate = spec.gates.find((g) => g.id === "neckline-contour-matches-garment");
  assert.ok(gate && gate.pass, "recorded gate passed");
  assert.ok(gate.detail.rowsChecked >= 40, "enough rows checked, got " + gate.detail.rowsChecked);
  assert.equal(gate.detail.rowsOutOfTolerance, 0);
  assert.ok(gate.detail.worstDeltaPx <= gate.detail.tolerancePx, "worst delta " + gate.detail.worstDeltaPx);
});

test("SEMANTIC: all garment fabric is mandatory coverage", () => {
  const gate = spec.gates.find((g) => g.id === "tee-fabric-fully-covered");
  assert.ok(gate && gate.pass);
  assert.equal(gate.detail.fabricCovered, gate.detail.fabricTotal);
  assert.equal(gate.detail.coverage, 1);
});
