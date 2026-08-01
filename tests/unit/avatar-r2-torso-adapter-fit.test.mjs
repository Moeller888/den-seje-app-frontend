// ── A2 torso adapter: fit + clip (D-087) unit tests ─────────────────────────
// The adapter's generation step needs the network and an API key; its fit+clip step does not, and it
// is the part that decides whether a generated image can be judged at all. These tests cover that part
// with a synthetic "generated" image, so the pipeline is verified without spending an API call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fitAndClip } from "../../tools/avatar/openai-generate-torso-item.mjs";
import { decodePng, encodePngRGBA, OUT_W, OUT_H } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function maskOf(name) {
  const img = decodePng(readFileSync(join(FIX, name)), name);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
const hard = maskOf("torso-occlusion-hard-v1.png");
const edit = maskOf("torso-edit-allowed-v1.png");

// A stand-in for a generated image: an opaque block on a transparent canvas, deliberately the wrong
// size and off-centre, exactly like a real text-to-image result would be.
function fakeGenerated(w = 1024, h = 1536, box = { x0: 120, y0: 300, x1: 900, y1: 1200 }) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = y * w + x;
    rgba[i * 4] = 160; rgba[i * 4 + 1] = 165; rgba[i * 4 + 2] = 175; rgba[i * 4 + 3] = 255;
  }
  return encodePngRGBA(w, h, rgba);
}

test("fit+clip returns the Master canvas regardless of what the generator produced", () => {
  const out = fitAndClip(fakeGenerated(), hard, edit);
  const img = decodePng(out.png, "fitted");
  assert.equal(img.w, OUT_W);
  assert.equal(img.h, OUT_H);
});

test("clipping is absolute: nothing survives outside the edit zone", () => {
  const img = decodePng(fitAndClip(fakeGenerated(), hard, edit).png, "fitted");
  let stray = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) if (img.rgba[i * 4 + 3] > 0 && !edit[i]) stray++;
  assert.equal(stray, 0, "the clip step is what guarantees nothing lands on protected anatomy");
});

test("the fit COVERS the mandatory region rather than fitting inside it", () => {
  // A shortfall would leave the base tee visible; leftover artwork is clipped away instead.
  const res = fitAndClip(fakeGenerated(), hard, edit);
  const img = decodePng(res.png, "fitted");
  let hardTotal = 0, hardCovered = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    if (!hard[i]) continue;
    hardTotal++;
    if (img.rgba[i * 4 + 3] >= 250) hardCovered++;
  }
  assert.equal(hardCovered, hardTotal, "a solid block scaled to cover must cover the whole mandatory region");
  assert.ok(res.scale > 0, "a scale factor is reported");
  assert.deepEqual(res.targetBbox, { x0: 328, y0: 524, x1: 697, y1: 903, w: 370, h: 380 });
});

test("fit+clip is deterministic: the same raw image yields byte-identical output", () => {
  const raw = fakeGenerated();
  assert.equal(sha256(fitAndClip(raw, hard, edit).png), sha256(fitAndClip(raw, hard, edit).png));
});

test("a differently framed generation lands in the same place", () => {
  // Same content, different position and scale on the source canvas — the fit must normalise both.
  const a = fitAndClip(fakeGenerated(1024, 1536, { x0: 120, y0: 300, x1: 900, y1: 1200 }), hard, edit);
  const b = fitAndClip(fakeGenerated(1024, 1536, { x0: 300, y0: 500, x1: 700, y1: 962 }), hard, edit);
  assert.deepEqual(a.targetBbox, b.targetBbox);
  const ia = decodePng(a.png, "a"), ib = decodePng(b.png, "b");
  let onlyA = 0, onlyB = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    const pa = ia.rgba[i * 4 + 3] > 0, pb = ib.rgba[i * 4 + 3] > 0;
    if (pa && !pb) onlyA++; if (pb && !pa) onlyB++;
  }
  assert.equal(onlyA, 0); assert.equal(onlyB, 0);
});

test("an empty generation fails loudly instead of producing a blank candidate", () => {
  const blank = encodePngRGBA(64, 64, Buffer.alloc(64 * 64 * 4));
  assert.throws(() => fitAndClip(blank, hard, edit), /no opaque pixels/);
});

test("the adapter reads the key from the environment only and promotes nothing", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "openai-generate-torso-item.mjs"), "utf8");
  assert.ok(/process\.env\.OPENAI_API_KEY/.test(src), "key comes from the environment");
  assert.ok(!/sk-[A-Za-z0-9]{10,}/.test(src), "no key literal in the source");
  assert.ok(!/assets[\\/]avatar-r2/.test(src), "never writes into the runtime asset tree");
  assert.ok(/"n": 1|n: 1/.test(src), "exactly one image per run");
});
