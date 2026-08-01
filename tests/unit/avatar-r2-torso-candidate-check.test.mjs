// ── A2 candidate QA harness (D-086): unit tests ─────────────────────────────
// The harness is the judge for A2 artwork. These tests prove it accepts a correct candidate and
// rejects the four failure modes that matter, using SYNTHETIC candidates built from the accepted A1
// masks — so no artwork is needed to test the judge, and a rejection can be reproduced exactly.
//
// A2 is artwork; this file tests the gate, not the art. Nothing here activates the torso slot,
// discharges anything, or touches the runtime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  checkCandidate, synthesize, TOOL, OPAQUE, MIN_COMPONENT, MAX_ORPHAN_SOFT_PX,
  RENDER_SIZES, MIN_SCALE_COVERAGE,
} from "../../tools/avatar/check-r2-torso-candidate.mjs";
import { decodePng, OUT_W, OUT_H } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const spec = JSON.parse(readFileSync(join(FIX, "torso-mask-spec-v1.json"), "utf8"));
function maskOf(name) {
  const img = decodePng(readFileSync(join(FIX, name)), name);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
const masks = {
  spec,
  hard: maskOf("torso-occlusion-hard-v1.png"),
  edit: maskOf("torso-edit-allowed-v1.png"),
  protect: maskOf("torso-protect-v1.png"),
};
const run = (kind) => checkCandidate(synthesize(masks, kind), masks, "test:" + kind);
const gate = (res, id) => res.gates.find((g) => g.id === id);

test("the harness judges against the ACCEPTED A1 template, verified by SHA", () => {
  for (const [name, rec] of Object.entries(spec.masks)) {
    assert.equal(sha256(readFileSync(join(FIX, name))), rec.sha256, name + " matches the spec record");
  }
  assert.equal(spec.status, "A1_BUILT_GATES_PASS_OWNER_VISUAL_REVIEW_REQUIRED");
});

test("a candidate that fills the mandatory region exactly is accepted", () => {
  const res = run("pass");
  assert.equal(res.verdict, "PASS_AUTOMATED", JSON.stringify(res.blocking));
  assert.deepEqual(res.blocking, []);
  assert.equal(gate(res, "hard-region-fully-opaque").detail.gapPx, 0);
  assert.equal(gate(res, "no-ink-outside-edit-zone").detail.strayPx, 0);
});

test("PASS_AUTOMATED is explicitly not an approval", () => {
  const res = run("pass");
  assert.match(res.note, /precondition, not an approval/);
  assert.match(res.note, /owner visual sign-off/);
});

test("ink on protected anatomy is rejected, and reported as landing on the protect mask", () => {
  const res = run("stray");
  assert.equal(res.verdict, "REJECT");
  assert.ok(res.blocking.includes("no-ink-outside-edit-zone"));
  const d = gate(res, "no-ink-outside-edit-zone").detail;
  assert.ok(d.strayPx > 0, "stray pixels counted");
  assert.equal(d.strayPx, d.onProtectMask, "every stray pixel is on the anatomy lock");
  assert.ok(d.sample.length > 0, "coordinates are reported, not just a count");
});

test("a hole in the mandatory region is rejected — the base tee would show through", () => {
  const res = run("hole");
  assert.equal(res.verdict, "REJECT");
  assert.ok(res.blocking.includes("hard-region-fully-opaque"));
  const d = gate(res, "hard-region-fully-opaque").detail;
  assert.ok(d.gapPx > 0);
  assert.ok(d.coverage < 1);
  assert.ok(d.ofWhichSemiTransparent > 0, "a semi-transparent garment counts as a hole, not as style");
});

test("a detached semi-transparent fringe is rejected by the halo gate specifically", () => {
  const res = run("halo");
  assert.equal(res.verdict, "REJECT");
  assert.deepEqual(res.blocking, ["alpha-clean-no-halo"], "this case must exercise the halo gate alone");
  const d = gate(res, "alpha-clean-no-halo").detail;
  assert.ok(d.orphanSoftPx > MAX_ORPHAN_SOFT_PX, `${d.orphanSoftPx} > ${MAX_ORPHAN_SOFT_PX}`);
});

test("a wrong canvas size is rejected before anything else is judged", () => {
  const res = run("wrong-size");
  assert.equal(res.verdict, "REJECT");
  assert.match(res.reason, /wrong canvas size/);
  assert.equal(gate(res, "canvas-is-master-1024x1536").pass, false);
});

test("legibility is measured at the four D-071 render sizes", () => {
  assert.deepEqual(RENDER_SIZES, [[180, 270], [112, 168], [72, 108], [52, 78]]);
  const res = run("pass");
  const d = gate(res, "legible-at-render-sizes").detail;
  assert.equal(d.scales.length, 4);
  for (const s of d.scales) assert.ok(s.coverage >= MIN_SCALE_COVERAGE, `${s.size}: ${s.coverage}`);
});

test("the budget gate is advisory, because the real budget applies to the encoded WebP", () => {
  const res = run("pass");
  const g = gate(res, "budget-advisory");
  assert.equal(g.advisory, true);
  assert.equal(g.pass, true);
  assert.match(g.detail.note, /advisory only/);
  assert.ok(!res.blocking.includes("budget-advisory"), "an advisory never blocks");
});

test("thresholds are explicit numbers a reviewer can argue with", () => {
  assert.equal(OPAQUE, 250);
  assert.equal(MIN_COMPONENT, 64);
  assert.equal(MIN_SCALE_COVERAGE, 0.55);
  assert.equal(TOOL, "check-r2-torso-candidate");
});

test("the harness is a judge, not a promoter: no artwork or runtime path is written", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "check-r2-torso-candidate.mjs"), "utf8");
  assert.ok(!/assets[\\/]avatar-r2/.test(src), "never writes into the runtime asset tree");
  assert.ok(!/R2_MANIFEST/.test(src.replace(/\/\/.*$/gm, "")), "never touches the manifest");
  assert.ok(!/OPENAI|api\.openai|fetch\(/i.test(src), "contains no generator and no network call");
  assert.ok(!existsSync(join(REPO, "assets", "avatar-r2", "torso")), "nothing has been promoted to assets/");
});

test("the torso slot is still gated and D-037 is not discharged by this harness", async () => {
  const layers = await import("../../js/avatar-layers.js");
  assert.deepEqual(layers.R2_SUPPORTED_COSMETIC_SLOTS, ["aura", "back", "headwear", "eyes", "face"]);
  assert.equal(layers.isR2SupportedCosmeticSlot("torso"), false);
  assert.equal(layers.AVATAR_R2, false);
});
