// The luminance conversion is the one step between the model's output and the measured artefact,
// so it has to be provably narrow: it may change colour and nothing else.
//
// The pixel maths is not this tool's invention — it is the conversion the earlier hair rounds ran,
// recovered from the session transcript. These tests pin it so a later "improvement" to the
// formula shows up as a failure rather than as a quietly different asset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { luma, toLuminance, FORMULA } from "../../tools/avatar/to-luminance-map.mjs";

const W = 8, H = 6;
function canvas(fill) {
  const b = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) fill(b, i * 4, i % W, Math.floor(i / W));
  return b;
}

// ── the formula itself ────────────────────────────────────────────────────────────────────────

test("luma is Rec.709, rounded", () => {
  assert.equal(FORMULA, "y = round(0.2126*R + 0.7152*G + 0.0722*B); R=G=B=y; A unchanged");
  assert.equal(luma(0, 0, 0), 0);
  assert.equal(luma(255, 255, 255), 255);
  assert.equal(luma(255, 0, 0), Math.round(0.2126 * 255));   // 54
  assert.equal(luma(0, 255, 0), Math.round(0.7152 * 255));   // 182
  assert.equal(luma(0, 0, 255), Math.round(0.0722 * 255));   // 18
  assert.equal(luma(10, 20, 30), Math.round(0.2126 * 10 + 0.7152 * 20 + 0.0722 * 30));
});

test("the three channels come out equal, which is what makes it a luminance map", () => {
  const src = canvas((b, p) => { b[p] = 200; b[p + 1] = 30; b[p + 2] = 90; b[p + 3] = 255; });
  const { rgba } = toLuminance(src);
  for (let i = 0; i < rgba.length; i += 4) {
    assert.equal(rgba[i], rgba[i + 1]);
    assert.equal(rgba[i + 1], rgba[i + 2]);
  }
  assert.equal(rgba[0], luma(200, 30, 90));
});

test("an already-grey pixel is left exactly as it was", () => {
  const src = canvas((b, p) => { b[p] = 120; b[p + 1] = 120; b[p + 2] = 120; b[p + 3] = 200; });
  const { rgba, pixelsDesaturated } = toLuminance(src);
  assert.equal(pixelsDesaturated, 0, "a grey canvas needed no desaturation");
  assert.deepEqual(rgba, src);
});

// ── alpha ─────────────────────────────────────────────────────────────────────────────────────

test("ALPHA IS UNTOUCHED — every value, including 0 and the soft band", () => {
  const src = canvas((b, p, x, y) => { b[p] = 250; b[p + 1] = 10; b[p + 2] = 60; b[p + 3] = (x * 31 + y * 7) % 256; });
  const { rgba } = toLuminance(src);
  for (let i = 3; i < rgba.length; i += 4) assert.equal(rgba[i], src[i], `alpha moved at byte ${i}`);
});

test("a fully transparent pixel still has its colour normalised, and stays transparent", () => {
  // Colour under alpha 0 is invisible but not meaningless: `cwebp -exact` preserves it, so a
  // conversion that skipped these would leave a different file than the one the rounds produced.
  const src = canvas((b, p) => { b[p] = 255; b[p + 1] = 0; b[p + 2] = 0; b[p + 3] = 0; });
  const { rgba, pixelsDesaturated } = toLuminance(src);
  assert.equal(rgba[3], 0);
  assert.equal(rgba[0], luma(255, 0, 0));
  assert.equal(pixelsDesaturated, W * H, "transparent pixels are converted too");
});

// ── geometry and determinism ──────────────────────────────────────────────────────────────────

test("the buffer length is unchanged, so no pixel is added or dropped", () => {
  const src = canvas((b, p) => { b[p] = 1; b[p + 1] = 2; b[p + 2] = 3; b[p + 3] = 4; });
  const { rgba } = toLuminance(src);
  assert.equal(rgba.length, src.length);
  assert.equal(rgba.length, W * H * 4);
});

test("the source buffer is never mutated", () => {
  const src = canvas((b, p) => { b[p] = 200; b[p + 1] = 30; b[p + 2] = 90; b[p + 3] = 255; });
  const before = Buffer.from(src);
  toLuminance(src);
  assert.deepEqual(src, before, "toLuminance mutated its input");
});

test("two runs over the same input produce byte-identical output", () => {
  const src = canvas((b, p, x, y) => { b[p] = (x * 37) % 256; b[p + 1] = (y * 53) % 256; b[p + 2] = (x * y) % 256; b[p + 3] = 255 - (x % 4); });
  const a = toLuminance(src).rgba;
  const b = toLuminance(src).rgba;
  assert.deepEqual(a, b);
});

test("converting an already-converted map is a no-op — the operation is idempotent", () => {
  const src = canvas((b, p, x, y) => { b[p] = (x * 37) % 256; b[p + 1] = (y * 53) % 256; b[p + 2] = (x * y) % 256; b[p + 3] = 255; });
  const once = toLuminance(src).rgba;
  const twice = toLuminance(once);
  assert.equal(twice.pixelsDesaturated, 0, "a second pass still changed pixels");
  assert.deepEqual(twice.rgba, once);
});

// ── counting ──────────────────────────────────────────────────────────────────────────────────

test("the desaturated and opaque counts describe what actually happened", () => {
  const src = Buffer.alloc(4 * 4 * 4);
  const set = (i, r, g, b, a) => { const p = i * 4; src[p] = r; src[p + 1] = g; src[p + 2] = b; src[p + 3] = a; };
  for (let i = 0; i < 16; i++) set(i, 50, 50, 50, 0);   // grey, transparent
  set(0, 200, 10, 10, 255);                              // coloured + opaque
  set(1, 10, 200, 10, 128);                              // coloured + opaque (128 counts as ink)
  set(2, 90, 90, 90, 255);                               // grey + opaque
  set(3, 10, 10, 200, 127);                              // coloured, just under ink
  const { pixelsDesaturated, opaquePixels } = toLuminance(src);
  assert.equal(opaquePixels, 3, "alpha >= 128 is the ink threshold");
  assert.equal(pixelsDesaturated, 3, "only the three coloured pixels needed changing");
});
