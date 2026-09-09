// D-133 §5 — the recomposition contract, exercised on SYNTHETIC fixtures only.
//
// No real candidate exists and none may be produced: the tool composes, it never generates.
// Everything here runs on small hand-built canvases, so CI needs neither H1 nor any artwork.
// The canvases are 460 rows tall because the ramp is defined on ABSOLUTE master rows 425-445;
// using real row numbers is the point, not an accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RAMP, generatedWeightNumerator, blendChannel, recompose, verifyRecomposed,
  transitionSilhouetteDiff, TOOL, TOOL_VERSION, DECISION,
} from "../../tools/avatar/recompose-r3-head-edit.mjs";
import { SOLID_ALPHA, BAND_Y_TOP, BAND_Y_BOT } from "../../tools/avatar/build-r3-head-edit-masks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const W = 8, H = 460;                 // small, but with real master row numbers
const N = W * H;
const idx = (x, y) => y * W + x;

/** A flat RGBA canvas. */
function canvas(r, g, b, a) {
  const buf = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) { buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = a; }
  return buf;
}
/** EDIT = every row above the band bottom; TRANSITION = the band rows. Column-wide, like the real
 *  regions are figure-wide: what matters here is the row arithmetic, not the silhouette. */
function regions() {
  const edit = new Uint8Array(N), transition = new Uint8Array(N);
  for (let y = 0; y <= BAND_Y_BOT; y++) for (let x = 0; x < W; x++) {
    edit[idx(x, y)] = 1;
    if (y >= BAND_Y_TOP) transition[idx(x, y)] = 1;
  }
  return { edit, transition };
}
const px = (buf, x, y) => [buf[idx(x, y) * 4], buf[idx(x, y) * 4 + 1], buf[idx(x, y) * 4 + 2], buf[idx(x, y) * 4 + 3]];
const setPx = (buf, x, y, [r, g, b, a]) => { const i = idx(x, y) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };

test("the tool is the D-133 one and the ramp is the approved one", () => {
  assert.equal(TOOL, "recompose-r3-head-edit");
  assert.equal(TOOL_VERSION, "1.0.0");
  assert.equal(DECISION, "D-133");
  assert.equal(RAMP.yTop, 425);
  assert.equal(RAMP.yBot, 445);
  assert.equal(RAMP.denominator, 20);
});

test("the ramp endpoints are 20/20 generated at y425 and 0/20 at y445", () => {
  assert.equal(generatedWeightNumerator(425), 20, "the band's first row is fully generated");
  assert.equal(generatedWeightNumerator(445), 0, "the band's last row is fully H1");
  assert.equal(generatedWeightNumerator(424), 20, "above the band the pixel is CORE, weight 20/20");
  assert.equal(generatedWeightNumerator(446), 0, "below the band nothing generated survives");
  // and it decreases by exactly one numerator step per row
  for (let y = RAMP.yTop; y < RAMP.yBot; y++)
    assert.equal(generatedWeightNumerator(y) - generatedWeightNumerator(y + 1), 1, `step at y=${y}`);
});

test("blendChannel is integer arithmetic with round-half-up, and the endpoints are exact", () => {
  assert.equal(blendChannel(200, 40, 20), 200, "num 20/20 must return the generated channel exactly");
  assert.equal(blendChannel(200, 40, 0), 40, "num 0/20 must return the H1 channel exactly");
  // exact halves round UP: 0 and 255 at num 10 gives 127.5 -> 128, from both directions
  assert.equal(blendChannel(0, 255, 10), 128);
  assert.equal(blendChannel(255, 0, 10), 128);
  // a hand-checked intermediate: (1*255 + 19*0 + 10) / 20 = 13.25 -> 13
  assert.equal(blendChannel(255, 0, 1), 13);
  // and (19*255 + 1*0 + 10)/20 = 242.75 -> 242
  assert.equal(blendChannel(255, 0, 19), 242);
  // never floating point: every result is an integer in range for every input triple sampled
  for (const g of [0, 1, 127, 128, 254, 255]) for (const h of [0, 1, 127, 128, 254, 255]) for (let num = 0; num <= 20; num++) {
    const v = blendChannel(g, h, num);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `blend(${g},${h},${num}) = ${v}`);
    assert.ok(v >= Math.min(g, h) && v <= Math.max(g, h), "a blend may never leave the interval of its inputs");
  }
});

test("a synthetic good candidate composes with 0 protected diff and 0 silhouette diff", () => {
  const h1 = canvas(10, 20, 30, 255);
  const generated = canvas(210, 220, 230, 255);
  const { edit, transition } = regions();
  const { rgba, report } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  assert.equal(report.protectedDiffBytes, 0);
  assert.equal(report.protectedDiffPixels, 0);
  assert.equal(report.transitionSilhouetteDiffPixels, 0);
  assert.equal(report.preGateSilhouetteDiffPixels, 0);
  assert.equal(report.corePx + report.transitionPx + report.protectPx, N);
  assert.match(report.outputSha256, /^[0-9a-f]{64}$/);
  assert.equal(rgba.length, N * 4);
});

test("CORE takes the generated RGBA directly", () => {
  const h1 = canvas(10, 20, 30, 255), generated = canvas(210, 220, 230, 200);
  const { edit, transition } = regions();
  // make the silhouettes agree in the band so the pre-gate passes, while CORE alpha differs
  for (let y = BAND_Y_TOP; y <= BAND_Y_BOT; y++) for (let x = 0; x < W; x++) generated[idx(x, y) * 4 + 3] = 255;
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  assert.deepEqual(px(rgba, 3, 100), [210, 220, 230, 200], "a CORE pixel is the generated one, alpha included");
  assert.deepEqual(px(rgba, 0, BAND_Y_TOP - 1), [210, 220, 230, 200], "the row just above the band is still CORE");
});

test("PROTECT takes H1's RGBA byte-identically", () => {
  const h1 = canvas(10, 20, 30, 255), generated = canvas(210, 220, 230, 255);
  // give H1 a distinctive protected pixel so a copy could not be mistaken for a coincidence
  const p = idx(5, 450);
  h1[p * 4] = 77; h1[p * 4 + 1] = 88; h1[p * 4 + 2] = 99; h1[p * 4 + 3] = 111;
  const { edit, transition } = regions();
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  assert.deepEqual(px(rgba, 5, 450), [77, 88, 99, 111]);
  for (let y = BAND_Y_BOT + 1; y < H; y++) for (let x = 0; x < W; x++)
    assert.deepEqual(px(rgba, x, y), px(h1, x, y), `protected pixel (${x},${y}) must be H1's`);
});

test("TRANSITION ramps RGB and keeps H1's alpha byte-identical", () => {
  const h1 = canvas(0, 0, 0, 255), generated = canvas(255, 255, 255, 255);
  // H1 alpha varies across the band; the output must copy it, never the generated alpha
  for (let y = BAND_Y_TOP; y <= BAND_Y_BOT; y++) for (let x = 0; x < W; x++) h1[idx(x, y) * 4 + 3] = 200 + (y % 40);
  for (let y = BAND_Y_TOP; y <= BAND_Y_BOT; y++) for (let x = 0; x < W; x++) generated[idx(x, y) * 4 + 3] = 255;
  const { edit, transition } = regions();
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  for (let y = BAND_Y_TOP; y <= BAND_Y_BOT; y++) {
    const num = generatedWeightNumerator(y);
    const want = blendChannel(255, 0, num);
    assert.deepEqual(px(rgba, 4, y), [want, want, want, 200 + (y % 40)], `band row ${y}`);
  }
  assert.deepEqual(px(rgba, 4, BAND_Y_TOP).slice(0, 3), [255, 255, 255], "y425 is fully generated");
  assert.deepEqual(px(rgba, 4, BAND_Y_BOT).slice(0, 3), [0, 0, 0], "y445 is fully H1");
});

test("no generated residue survives at the y445/y446 boundary", () => {
  // The guarantee is per-row: y445 equals H1's OWN y445 because the generated weight there is
  // 0/20, and y446 equals H1's OWN y446 because that row is already PROTECT. It is NOT a claim
  // that H1's rows 445 and 446 are byte-identical to each other — so this synthetic H1 makes
  // them deliberately different. A test on a flat canvas would prove nothing here.
  const h1 = canvas(90, 100, 110, 255), generated = canvas(1, 2, 3, 255);
  for (let x = 0; x < W; x++) {
    setPx(h1, x, BAND_Y_BOT, [10, 11, 12, 250]);
    setPx(h1, x, BAND_Y_BOT + 1, [201, 202, 203, 240]);
  }
  const { edit, transition } = regions();
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  for (let x = 0; x < W; x++) {
    assert.notDeepEqual(px(h1, x, BAND_Y_BOT), px(h1, x, BAND_Y_BOT + 1),
      "the two H1 rows must differ, or this test proves nothing");
    assert.deepEqual(px(rgba, x, BAND_Y_BOT), px(h1, x, BAND_Y_BOT),
      "y445 must equal H1's own y445 — the generated weight there is 0/20");
    assert.deepEqual(px(rgba, x, BAND_Y_BOT + 1), px(h1, x, BAND_Y_BOT + 1),
      "y446 must equal H1's own y446 — that row is PROTECT");
    // and nothing of the generated image reached either row
    for (const y of [BAND_Y_BOT, BAND_Y_BOT + 1])
      assert.notDeepEqual(px(rgba, x, y), [1, 2, 3, 255], "no generated pixel may survive at the boundary");
  }
});

test("a transition silhouette deviation is a hard failure, before anything is composed", () => {
  const h1 = canvas(10, 20, 30, 255), generated = canvas(210, 220, 230, 255);
  generated[idx(2, 430) * 4 + 3] = SOLID_ALPHA - 1;    // one pixel drops below solid inside the band rows
  const { edit, transition } = regions();
  const pre = transitionSilhouetteDiff(h1, generated, W, RAMP.yTop, RAMP.yBot);
  assert.equal(pre.count, 1);
  assert.deepEqual(pre.sample[0], [2, 430]);
  assert.throws(
    () => recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H }),
    /hard gate FAILED \[pre\.transition-silhouette\]/,
    "generated alpha may never decide the transition silhouette");
});

test("a protected byte deviation is a hard failure when a candidate output is audited", () => {
  const h1 = canvas(10, 20, 30, 255), generated = canvas(210, 220, 230, 255);
  const { edit, transition } = regions();
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  // a clean composite audits clean
  assert.equal(verifyRecomposed({ outRgba: rgba, h1Rgba: h1, edit, transition, width: W, height: H }).protectedDiffBytes, 0);
  // corrupt one protected pixel — exactly the leak the gate exists to catch
  const tampered = Buffer.from(rgba);
  tampered[idx(1, 455) * 4 + 1] ^= 0xff;
  const post = verifyRecomposed({ outRgba: tampered, h1Rgba: h1, edit, transition, width: W, height: H });
  assert.equal(post.protectedDiffBytes, 1);
  assert.equal(post.protectedDiffPixels, 1);
  assert.deepEqual(post.protectedDiffSample[0], [1, 455]);
});

test("a solidity change inside TRANSITION is caught by the post-gate too", () => {
  const h1 = canvas(10, 20, 30, 255), generated = canvas(210, 220, 230, 255);
  const { edit, transition } = regions();
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  const tampered = Buffer.from(rgba);
  tampered[idx(6, 440) * 4 + 3] = SOLID_ALPHA - 1;
  const post = verifyRecomposed({ outRgba: tampered, h1Rgba: h1, edit, transition, width: W, height: H });
  assert.equal(post.transitionSilhouetteDiffPixels, 1);
});

test("no pixel outside EDIT can originate from the generated image", () => {
  // every generated channel is distinct from every H1 channel, so any leak would be visible
  const h1 = canvas(0, 0, 0, 255), generated = canvas(255, 255, 255, 255);
  const { edit, transition } = regions();
  const { rgba } = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  for (let p = 0; p < N; p++) {
    if (edit[p]) continue;
    for (let c = 0; c < 4; c++)
      assert.equal(rgba[p * 4 + c], h1[p * 4 + c], `protected pixel ${p} channel ${c} leaked from the generated image`);
  }
});

test("the composition is deterministic: the same inputs give the same output hash", () => {
  const h1 = canvas(11, 22, 33, 255), generated = canvas(211, 222, 233, 255);
  const { edit, transition } = regions();
  const a = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  const b = recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition, width: W, height: H });
  assert.equal(a.report.outputSha256, b.report.outputSha256);
  assert.ok(a.rgba.equals(b.rgba));
});

test("malformed inputs are refused rather than coerced", () => {
  const h1 = canvas(1, 2, 3, 255), generated = canvas(4, 5, 6, 255);
  const { edit, transition } = regions();
  assert.throws(() => recompose({ h1Rgba: h1.subarray(0, 10), generatedRgba: generated, edit, transition, width: W, height: H }), /hard gate FAILED \[input\]/);
  assert.throws(() => recompose({ h1Rgba: h1, generatedRgba: generated.subarray(0, 10), edit, transition, width: W, height: H }), /hard gate FAILED \[input\]/);
  const bad = new Uint8Array(N); bad[idx(0, 458)] = 1;   // a TRANSITION pixel outside EDIT
  assert.throws(() => recompose({ h1Rgba: h1, generatedRgba: generated, edit, transition: bad, width: W, height: H }), /TRANSITION is not a subset of EDIT/);
});

test("the tool composes and cannot generate: no model, no network, no image call", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "recompose-r3-head-edit.mjs"), "utf8");
  for (const forbidden of ["openai", "fetch(", "https://", "node:http", "api_key", "apiKey"])
    assert.ok(!src.toLowerCase().includes(forbidden.toLowerCase()), `the recomposition tool must not contain ${forbidden}`);
  assert.match(src, /It composes; it never generates/);
});
