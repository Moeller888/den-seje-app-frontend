// ── D-042 expression-layer promotion — manifest coverage (dormant, not wired) ─
// The four owner-approved expression face layers are registered in R2_MANIFEST.face but must
// NOT change any active behaviour: the render only ever requests "neutral" (faceSrcForR2 is
// called solely with "neutral"), so the neutral stack is byte-for-byte unchanged and AVATAR_R2
// stays false. This test pins the registered versions/paths and the dormancy contract.
//
// Run: npm run test:unit   (node --test tests/unit/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";

import { AVATAR_R2, R2_MANIFEST, faceSrcForR2, r2StackSrcsFor } from "../../js/avatar-layers.js";

const NEUTRAL_MEDIUM = { body_type: "neutral", skin_tone: "medium" };

test("expression promotion did not change the render switch (now default-on, D-101)", () => {
  assert.equal(AVATAR_R2, true);
});

test("the manifest version is bumped whenever registrations change", () => {
  // 4 = expression registration (D-042). 5 = torso garment registration (D-090).
  assert.equal(R2_MANIFEST.version, 5);
});

test("the four owner-approved expressions are registered at their accepted versions", () => {
  assert.equal(R2_MANIFEST.face.proud, 1);       // proud v1 (accepted)
  assert.equal(R2_MANIFEST.face.curious, 1);     // curious v1 (accepted)
  assert.equal(R2_MANIFEST.face.focused, 2);     // focused v2 (accepted; v1 rejected)
  assert.equal(R2_MANIFEST.face.determined, 2);  // determined v2 (accepted; v1 rejected)
});

test("no v1 focused / v1 determined leaked in (rejected candidates never registered)", () => {
  // the only way v1 could show is version 1 on these keys
  assert.notEqual(R2_MANIFEST.face.focused, 1);
  assert.notEqual(R2_MANIFEST.face.determined, 1);
});

test("faceSrcForR2 resolves each expression to its tracked WebP path", () => {
  assert.equal(faceSrcForR2("proud"), "/assets/avatar-r2/face/face-proud-v1.webp");
  assert.equal(faceSrcForR2("curious"), "/assets/avatar-r2/face/face-curious-v1.webp");
  assert.equal(faceSrcForR2("focused"), "/assets/avatar-r2/face/face-focused-v2.webp");
  assert.equal(faceSrcForR2("determined"), "/assets/avatar-r2/face/face-determined-v2.webp");
});

test("DORMANCY: the neutral face + active stack are unchanged by the expression entries", () => {
  assert.equal(faceSrcForR2("neutral"), "/assets/avatar-r2/face/face-neutral-v1.webp");
  const stack = r2StackSrcsFor(NEUTRAL_MEDIUM);
  assert.ok(stack);
  assert.equal(stack.face, "/assets/avatar-r2/face/face-neutral-v1.webp"); // render still resolves neutral only
});

test("an unregistered expression falls back to null (no accidental resolution)", () => {
  assert.equal(faceSrcForR2("angry"), null);
  assert.equal(faceSrcForR2("surprised"), null);
});
