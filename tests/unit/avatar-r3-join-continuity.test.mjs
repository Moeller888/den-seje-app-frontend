// D-141 §3 — pre.join-continuity.
//
// pre.transition-silhouette checks rows 425-445. Under D-141's CORE-only API mask those are exactly
// the rows the model is told not to paint, so passing it proves nothing about the one place
// generated content meets preserved H1 content: the handover from row 424 to row 425. This gate
// closes that, and these tests exist so it cannot quietly stop closing it.
//
// The bound is H1's OWN discontinuity across the same row pair, recomputed on every run. The most
// important test here is the one that forbids the implementation from carrying it as a literal: a
// hardcoded 4 would make the constant the authority instead of the file, and would keep "passing"
// after the geometry it describes had changed.
//
// CI cannot prove the bound is 4 — H1 is external (D-127 §2). What CI proves is the algebra, on
// synthetic rows whose answers are computed independently, and the structural rule against a
// literal. The real H1 derivation is a separate, gated test and a merge precondition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../../tools/avatar/recompose-r3-head-edit.mjs";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H } from "../../tools/avatar/build-r3-head-edit-masks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SRC = readFileSync(join(REPO, "tools", "avatar", "recompose-r3-head-edit.mjs"), "utf8");
const CONTRACT = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const G = CONTRACT.joinContinuityGate;
const H1_SHA = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";

const W = 8;
/** A tiny canvas whose rows are given as strings of 'x' (solid) and '.' (transparent). */
function canvas(rows) {
  const h = rows.length;
  const buf = Buffer.alloc(W * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    buf[(y * W + x) * 4 + 3] = rows[y][x] === "x" ? 255 : 0;
  }
  return buf;
}
/** The same measure, written out by hand, so the test does not lean on the implementation. */
function expectedSymDiff(rowA, rowB) {
  let n = 0;
  for (let x = 0; x < W; x++) if ((rowA[x] === "x") !== (rowB[x] === "x")) n++;
  return n;
}

test("the pre-registered constants are what the contract says", () => {
  assert.equal(R.JOIN_TOP, 424);
  assert.equal(R.JOIN_BOT, 425);
  assert.equal(G.joinTop, 424);
  assert.equal(G.joinBot, 425);
  assert.equal(G.gate, "pre.join-continuity");
  assert.equal(G.decision, "D-141");
  assert.equal(G.runsBefore, "recomposition");
  assert.equal(G.pass, "observed <= bound");
});

test("S(m,y) is the set of solid x positions, at the alpha >= 128 boundary", () => {
  const buf = Buffer.alloc(W * 1 * 4);
  const alphas = [0, 1, 127, 128, 129, 254, 255, 200];
  for (let x = 0; x < W; x++) buf[x * 4 + 3] = alphas[x];
  const s = R.rowSolidSet(buf, 0, W);
  assert.deepEqual([...s].sort((a, b) => a - b), [3, 4, 5, 6, 7],
    "127 is not solid, 128 is — the D-071 boundary, inclusive at 128");
  assert.equal(s.has(2), false);
  assert.equal(s.has(3), true);
  assert.match(G.solidPixel, /alpha >= 128/);
});

test("the symmetric difference is computed, on synthetic rows with independently derived answers", () => {
  const cases = [
    ["xxxx....", "xxxx....", 0],
    ["xxxx....", "xxx.....", 1],
    ["xxxx....", "....xxxx", 8],
    ["........", "xxxxxxxx", 8],
    ["x.x.x.x.", ".x.x.x.x", 8],
    ["xx......", "xxxx....", 2],
  ];
  for (const [a, b, want] of cases) {
    assert.equal(expectedSymDiff(a, b), want, "the hand-computed answer for " + a + " / " + b);
    const setA = R.rowSolidSet(canvas([a]), 0, W);
    const setB = R.rowSolidSet(canvas([b]), 0, W);
    assert.equal(R.rowSymmetricDifference(setA, setB), want);
    assert.equal(R.rowSymmetricDifference(setB, setA), want, "the measure is symmetric");
  }
});

/** Builds a pair of images whose rows JOIN_TOP and JOIN_BOT are the ones under test. */
function pair(h1Top, h1Bot, genTop) {
  const h = R.JOIN_BOT + 1;
  const rows = new Array(h).fill("........");
  const h1Rows = rows.slice(); h1Rows[R.JOIN_TOP] = h1Top; h1Rows[R.JOIN_BOT] = h1Bot;
  const genRows = rows.slice(); genRows[R.JOIN_TOP] = genTop; genRows[R.JOIN_BOT] = "........";
  return { h1: canvas(h1Rows), gen: canvas(genRows) };
}

test("bound is H1's own discontinuity across the same row pair — never the candidate's", () => {
  const { h1, gen } = pair("xxxx....", "xxx.....", "xxxx....");
  const r = R.joinContinuity(h1, gen, W);
  assert.equal(r.bound, expectedSymDiff("xxxx....", "xxx....."), "bound comes from H1 alone");
  assert.equal(r.bound, 1);
  assert.equal(r.observed, expectedSymDiff("xxxx....", "xxx....."), "observed compares generated@424 with H1@425");
});

test("PASS exactly at the bound, FAIL at bound + 1", () => {
  // H1's own discontinuity here is 2, so a candidate may differ from H1@425 by at most 2.
  const h1Top = "xxxxxx..", h1Bot = "xxxx....";
  const atBound = "xxxxxx..";                       // differs from h1Bot by 2 -> equal to bound
  const overBound = "xxxxxxx.";                     // differs from h1Bot by 3 -> bound + 1
  const under = "xxxxx...";                         // differs by 1 -> below bound

  const b = R.joinContinuity(pair(h1Top, h1Bot, atBound).h1, pair(h1Top, h1Bot, atBound).gen, W);
  assert.equal(b.bound, 2);
  assert.equal(b.observed, 2);
  assert.equal(b.pass, true, "observed == bound must PASS");

  const o = R.joinContinuity(pair(h1Top, h1Bot, overBound).h1, pair(h1Top, h1Bot, overBound).gen, W);
  assert.equal(o.observed, 3);
  assert.equal(o.observed, b.bound + 1);
  assert.equal(o.pass, false, "observed == bound + 1 must FAIL");

  const u = R.joinContinuity(pair(h1Top, h1Bot, under).h1, pair(h1Top, h1Bot, under).gen, W);
  assert.equal(u.observed, 1);
  assert.equal(u.pass, true);
});

test("an image compared with itself always passes — the bound is its own discontinuity", () => {
  const rows = new Array(R.JOIN_BOT + 1).fill("........");
  rows[R.JOIN_TOP] = "xxxxxx..";
  rows[R.JOIN_BOT] = "xx......";
  const img = canvas(rows);
  const r = R.joinContinuity(img, img, W);
  assert.equal(r.observed, r.bound);
  assert.equal(r.pass, true);
});

test("THE BOUND IS NOT A LITERAL — the implementation must derive it", () => {
  // The failure mode: someone replaces the derivation with `const BOUND = 4`. It would pass every
  // numeric test above and stop tracking the file it claims to describe.
  const code = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  const joinFn = code.slice(code.indexOf("export function joinContinuity"));
  const body = joinFn.slice(0, joinFn.indexOf("\n}") + 2);
  assert.match(body, /rowSymmetricDifference\(h1Top, h1Bot\)/, "bound must be measured from H1's two rows");
  assert.ok(!/bound\s*=\s*\d/.test(body), "bound must not be assigned a numeric literal");
  assert.ok(!/BOUND\s*=\s*\d/.test(code), "no module-level numeric bound constant may exist");
  assert.match(G.boundDerivation, /MUST NOT carry it as a literal/);
});

test("the bound is described as a pre-registered, H1-derived tolerance — not as 'no tolerance'", () => {
  assert.match(G.boundCharacter, /objectively H1-derived, pre-registered tolerance with no freely chosen number/);
  assert.match(G.boundCharacter, /not candidate-dependent/);
  assert.match(G.boundCharacter, /not chosen after seeing any future output/);
  assert.equal(G.boundValueWithPinnedH1, 4);
});

test("recompose refuses on a join failure, and writes nothing", () => {
  const n = OUT_W * OUT_H;
  const h1 = Buffer.alloc(n * 4);
  const gen = Buffer.alloc(n * 4);
  // make rows 425-445 identical so the FIRST pre-gate passes and the join gate is the one that fires
  for (let y = 425; y <= 445; y++) for (let x = 400; x < 500; x++) {
    h1[(y * OUT_W + x) * 4 + 3] = 255;
    gen[(y * OUT_W + x) * 4 + 3] = 255;
  }
  // H1 row 424 continues the same column; the candidate's row 424 is far away -> a large step
  for (let x = 400; x < 500; x++) h1[(424 * OUT_W + x) * 4 + 3] = 255;
  for (let x = 700; x < 800; x++) gen[(424 * OUT_W + x) * 4 + 3] = 255;

  const edit = new Uint8Array(n), transition = new Uint8Array(n);
  for (let y = 425; y <= 445; y++) for (let x = 400; x < 500; x++) { edit[y * OUT_W + x] = 1; transition[y * OUT_W + x] = 1; }
  for (let x = 400; x < 500; x++) edit[424 * OUT_W + x] = 1;
  for (let x = 700; x < 800; x++) edit[424 * OUT_W + x] = 1;

  let err = null;
  try { R.recompose({ h1Rgba: h1, generatedRgba: gen, edit, transition }); } catch (e) { err = e; }
  assert.ok(err, "a large join step must be refused");
  assert.equal(err.gate, "pre.join-continuity", err.message);
  assert.match(err.message, /handover/);
  assert.ok(err.report.joinObserved > err.report.joinBound);
});

test("no output file exists after a join-gate failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "d141-join-"));
  const out = join(dir, "must-not-exist.png");
  const n = OUT_W * OUT_H;
  const h1 = Buffer.alloc(n * 4), gen = Buffer.alloc(n * 4);
  // rows 425-445 identical, so the FIRST pre-gate passes and the join gate is the one that fires
  for (let y = 425; y <= 445; y++) for (let x = 400; x < 500; x++) {
    h1[(y * OUT_W + x) * 4 + 3] = 255;
    gen[(y * OUT_W + x) * 4 + 3] = 255;
  }
  for (let x = 400; x < 500; x++) h1[(424 * OUT_W + x) * 4 + 3] = 255;
  for (let x = 700; x < 800; x++) gen[(424 * OUT_W + x) * 4 + 3] = 255;
  const edit = new Uint8Array(n), transition = new Uint8Array(n);
  for (let y = 425; y <= 445; y++) for (let x = 400; x < 500; x++) { edit[y * OUT_W + x] = 1; transition[y * OUT_W + x] = 1; }
  for (let x = 400; x < 500; x++) edit[424 * OUT_W + x] = 1;
  for (let x = 700; x < 800; x++) edit[424 * OUT_W + x] = 1;
  assert.throws(() => R.recompose({ h1Rgba: h1, generatedRgba: gen, edit, transition }), /pre\.join-continuity/);
  assert.equal(existsSync(out), false, "nothing may be written when a gate refuses");
  rmSync(dir, { recursive: true, force: true });
});

test("the join gate runs BEFORE any composition, beside the existing pre-gate", () => {
  const code = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  const iTransition = code.indexOf('GateError("pre.transition-silhouette"');
  const iJoin = code.indexOf('GateError("pre.join-continuity"');
  const iCompose = code.indexOf("const out = Buffer.alloc(n * 4);");
  assert.ok(iTransition > 0 && iJoin > 0 && iCompose > 0);
  assert.ok(iJoin < iCompose, "the join gate must fire before the canvas is composed");
  assert.ok(iTransition < iCompose, "the existing pre-gate still fires before composition");
});

test("the gate states what it proves, and what it does not", () => {
  assert.match(G.proves, /silhouette continuity across the y424\/y425 handover, and nothing else/);
  assert.deepEqual(G.doesNotProve, [
    "continuity of RGB or skin tone",
    "equal outline stroke",
    "absence of a visible seam",
    "visual quality",
    "that the API mask was followed byte-identically",
  ]);
  assert.equal(G.ownerVisualReviewRequired, true);
  assert.match(G.noAutomaticTolerance, /no RGB tolerance and no after-the-fact ignore mask is authorised/);
});

test("the required owner-visual review covers every scale and background the owner named", () => {
  const r = G.ownerVisualReviewMustShow;
  assert.equal(r.subject, "the head/neck join");
  for (const s of ["1:1", "52x78", "110x165", "100x150", "180x270"]) assert.ok(r.scales.includes(s), "missing scale " + s);
  for (const b of ["light", "the real dark avatar gradient", "checkerboard"]) assert.ok(r.backgrounds.includes(b), "missing background " + b);
  assert.deepEqual(r.sideBySide, ["H1", "the raw output", "the recomposed output"]);
});

test("the D-139 output is historical diagnostic only and may not be reclassified", () => {
  const h = G.historicalDiagnosticOnly;
  assert.equal(h.subject, "the D-139 output");
  assert.equal(h.observed, 33);
  assert.equal(h.bound, 4);
  assert.equal(h.result, "FAIL");
  assert.match(h.note, /never be used to set the bound/);
  assert.match(h.mayNotReclassify, /never be used to reclassify, re-judge or promote/);
  assert.match(h.mayNotReclassify, /noRefit stands/);
});

test("D-133's own rules are untouched by this gate", () => {
  assert.deepEqual([R.RAMP.yTop, R.RAMP.yBot, R.RAMP.denominator], [425, 445, 20]);
  assert.equal(typeof R.transitionSilhouetteDiff, "function", "the existing pre-gate still exists");
  assert.equal(typeof R.verifyRecomposed, "function", "the post-gates still exist");
  assert.match(CONTRACT.firstCall.recomposition.contract, /PRE-DEFINED, not after-the-fact repair/);
  assert.match(CONTRACT.prohibitions.noAutomaticRepair, /never warped, retried or repaired automatically/);
  const spec = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3-head-edit",
    "r3-head-edit-mask-spec-v1.json"), "utf8"));
  assert.match(spec.prohibitions.noRefit, /hard stop/, "D-133 noRefit is untouched");
  assert.equal(spec.band.yTop, 425);
  assert.equal(spec.band.yBot, 445);
  assert.equal(spec.masks.edit.px, 125423);
  assert.equal(spec.masks.transition.px, 1702);
});

test("the gate does no network, spends no claim and writes no asset", () => {
  for (const forbidden of ["fetch(", "OPENAI_API_KEY", "Authorization", "createClaim", "\"wx\""]) {
    assert.ok(!SRC.includes(forbidden), "the recomposition tool must not contain " + JSON.stringify(forbidden));
  }
});

// ── the real H1 derivation: a merge precondition, not something CI can decide ─────────────────
test("bound derived from the REAL pinned H1 is 4 (local only)", (t) => {
  const h1Path = process.env.FITTING_BASE_V1_PATH;
  if (!h1Path || !existsSync(h1Path)) {
    t.skip("H1 is external (D-127 §2); set FITTING_BASE_V1_PATH to prove the bound. CI cannot: "
      + "green CI is NOT evidence for the H1 derivation.");
    return;
  }
  const buf = readFileSync(h1Path);
  assert.equal(createHash("sha256").update(buf).digest("hex"), H1_SHA, "the supplied H1 is not the pinned file");
  const h1 = decodePng(buf, "H1");
  const r = R.joinContinuity(h1.rgba, h1.rgba);
  assert.equal(r.bound, 4, "H1's own discontinuity across y424/y425 must be 4");
  assert.equal(r.bound, G.boundValueWithPinnedH1, "the contract records the value the file yields");
});
