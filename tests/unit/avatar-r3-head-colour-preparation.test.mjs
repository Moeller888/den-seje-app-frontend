// R3 head colour — PREPARATION ONLY (no decision, no call, no claim).
//
// Proves, without H1 wherever possible, that the preparation for ONE possible later colour call:
//   · keeps the R3 layer contract (D-132/D-135): the underlay is bald and blank; face, eyes, iris,
//     blush, expressions and hair stay separate layers
//   · builds the U1/U2 underpaintings and the API mask API_EDIT = FINAL_MODEL_RGB_REGION (GEOM) ∪
//     API_CONTEXT_MARGIN deterministically; P2 EDIT₂/PROTECT₂/TRANSITION stay the D-148 fixtures
//   · discards every API_CONTEXT_MARGIN pixel of the output; S1 palette gate and S2 tone continuity
//   · post-processes a model output so that geometry, alpha, K4, TRANSITION and PROTECT₂ are fixed
//     deterministically, with per-region coverage and every D-148 gate
//   · cannot send, cannot create a claim and makes zero network calls
// H1-dependent checks (the full preflight and dry-run) run only when FITTING_BASE_V1_PATH is set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H } from "../../tools/avatar/build-r3-head-edit-masks.mjs";
import { pngToContour, FIXTURE_DIR as GEO_DIR, FILES as GEO_FILES, K4 } from "../../tools/avatar/build-r3-head-geometry.mjs";
import { transitionSilhouetteDiff } from "../../tools/avatar/recompose-r3-head-edit.mjs";
import { verifyOutput } from "../../tools/avatar/recompose-r3-head-geometry.mjs";
import {
  run, loadInputs, buildU1, buildU2, buildEditable, editableToApiMask, apiMaskToEditable, validateEditable, validateUnderpainting,
  sampleSkin, regionOf, REGIONS, SKIN_RULE, D148, NORTHSTAR, FIXTURE_DIR, FILES, sha256,
  finalModelRgbRegion, apiContextMargin, MARGIN_EXCEPTIONS, SEAM, toLab, deltaE00, northstarSkinStats, neckTarget,
} from "../../tools/avatar/build-r3-head-colour-fixtures.mjs";
import {
  extractPrompt, promptViolations, promptRequirements, layerContractViolations, attemptSend, buildImage1, loadAll, preflight, dryRun,
  REQUEST, CALL_ID, STATUS, R3_CONTRACT_PATH, apiEditProtectedOverlap, PINNED, refusedArgs,
} from "../../tools/avatar/prepare-r3-head-colour-call.mjs";
import { processOutput, decodeOutput, regionCoverage, writeCandidate, ColourGateError, applyS2, paletteCheck, S2_PIN, S1_PIN, s1Passes } from "../../tools/avatar/process-r3-head-colour-output.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const N = OUT_W * OUT_H;
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_AVAILABLE = !!H1_PATH && existsSync(H1_PATH);
const INP = loadInputs(REPO);
const SPEC = JSON.parse(readFileSync(join(REPO, FIXTURE_DIR, FILES.spec), "utf8"));
const R3 = JSON.parse(readFileSync(join(REPO, R3_CONTRACT_PATH), "utf8"));
const PROMPT = extractPrompt(readFileSync(join(REPO, FIXTURE_DIR, FILES.prompt)));
const CONTOUR = pngToContour(readFileSync(join(REPO, GEO_DIR, GEO_FILES.contour)));
const REGIONS2 = { EDIT: INP.edit, PROTECT: INP.protect, TRANSITION: INP.transition, CORE: new Uint8Array(N) };
for (let p = 0; p < N; p++) REGIONS2.CORE[p] = INP.edit[p] && !INP.transition[p] ? 1 : 0;
const SKIN = [...SKIN_RULE.expected];
const yOf = (p) => (p / OUT_W) | 0;
const MASK = apiMaskToEditable(readFileSync(join(REPO, FIXTURE_DIR, FILES.mask)));
const MARGIN = apiContextMargin(INP.geom);
const head = (p) => INP.geom[p] === 1 && yOf(p) <= 424;

// ── fixtures, determinism, identity ──────────────────────────────────────────
test("fixtures reproduce byte-for-byte from tracked inputs (twice), and the spec pins them", () => {
  for (let i = 0; i < 2; i++) assert.equal(run({ check: true, repoRoot: REPO, log: () => {} }).ok, true);
  for (const k of ["u1", "u2", "mask", "margin"]) assert.equal(sha256(readFileSync(join(REPO, FIXTURE_DIR, FILES[k]))), k === "mask" ? SPEC.apiMask.sha256 : k === "margin" ? SPEC.apiContextMargin.sha256 : SPEC.underpainting[k].sha256);
  assert.equal(SPEC.prompt.sha256, sha256(readFileSync(join(REPO, FIXTURE_DIR, FILES.prompt))));
  assert.equal(SPEC.status, "PREPARED — NOT AUTHORISED"); assert.equal(SPEC.callId, "UNASSIGNED"); assert.equal(SPEC.claimIdentity, "NONE");
});

test("the skin colour is re-derived from Northstar by the recorded rule, not chosen", () => {
  const s = sampleSkin(INP.ns);
  assert.deepEqual(s.rgb, [254, 197, 128]); assert.equal(s.n, 462);
  assert.deepEqual(SPEC.skin.rgb, [254, 197, 128]);
});

test("U1 and U2 cover exactly the whole D-148 head (both ears), are symmetric and carry no interior marks", () => {
  for (const img of [buildU1(INP.geom, SKIN), buildU2(INP.geom, INP.transition, SKIN)]) {
    const v = validateUnderpainting(img, INP.geom, INP.transition, SKIN);
    assert.equal(v.ok, true, v.problems.join("; "));
  }
});

test("API_EDIT = FINAL_MODEL_RGB_REGION ∪ API_CONTEXT_MARGIN: every head region incl. both ears fully, nothing of TRANSITION or rows > 424", () => {
  const ed = apiMaskToEditable(readFileSync(join(REPO, FIXTURE_DIR, FILES.mask)));
  const v = validateEditable(ed, INP);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(v.stats.editablePx, 68374); assert.deepEqual(v.stats.bbox, [339, 158, 684, 424]);
  assert.equal(v.stats.headPx, 66162); assert.equal(v.stats.marginPx, 2212);
  assert.equal(v.perRegion["ear-left"].editable, 1315); assert.equal(v.perRegion["ear-right"].editable, 1315);
  const head = finalModelRgbRegion(INP.geom), m = apiContextMargin(INP.geom);
  let both = 0, tr = 0, low = 0, union = 0;
  for (let p = 0; p < N; p++) { if (head[p] && m[p]) both++; if (ed[p] && INP.transition[p]) tr++; if (ed[p] && yOf(p) > 424) low++; if ((head[p] || m[p]) !== ed[p]) union++; }
  assert.deepEqual([both, tr, low, union], [0, 0, 0, 0], "disjoint, no TRANSITION, no row > 424, exactly the union");
  assert.equal(SPEC.finalModelRgbRegion.sameAs.sha256, D148.geometry.sha256, "FINAL_MODEL_RGB_REGION is D-148's E2 geometry");
});
test("edge margin: 730 of 734 head-edge px have the full 2-px margin; the exception list is exactly the 4 pinned jaw corners", () => {
  // the complete, pinned list — it cannot grow or change unnoticed
  assert.deepEqual(MARGIN_EXCEPTIONS.map((xy) => [...xy]), [[453, 423], [454, 423], [569, 423], [570, 423]]);
  assert.ok(Object.isFrozen(MARGIN_EXCEPTIONS) && MARGIN_EXCEPTIONS.every((xy) => Object.isFrozen(xy)), "the list and each entry are frozen");
  assert.deepEqual(SPEC.apiMask.edgeMargin.exceptions.map((e) => [e.x, e.y, e.margin]), [[453, 423, 1], [454, 423, 1], [569, 423, 1], [570, 423, 1]], "the spec records the same four");
  const v = validateEditable(MASK, INP);
  assert.equal(v.edgeMargin.edgePx, 734);
  assert.deepEqual(v.edgeMargin.lacking.map((l) => [l.x, l.y, l.margin]), MARGIN_EXCEPTIONS.map(([x, y]) => [x, y, 1]), "no other edge pixel lacks the 2-px margin");
  const inHead = (x, y) => y <= 424 && INP.geom[y * OUT_W + x] === 1;
  for (const [x, y] of MARGIN_EXCEPTIONS) {
    assert.ok(inHead(x, y), `(${x},${y}) is a head pixel`);
    const outward = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !inHead(x + dx, y + dy) && y + dy <= 424);
    assert.ok(outward.length > 0, "it is an outer edge pixel");
    for (const [dx, dy] of outward) assert.equal(MASK[(y + dy) * OUT_W + x + dx], 1, `(${x},${y}) keeps at least 1 px of request margin`);
    // the missing 2nd margin pixel: straight down, in row 425 — the protected neck
    const q = 425 * OUT_W + x;
    assert.equal(MASK[q], 0, "row 425 is not opened");
    assert.ok(INP.transition[q] === 1 || INP.edit[q] !== 1, "that pixel is protected (TRANSITION or PROTECT₂)");
  }
  let row425 = 0; for (let x = 0; x < OUT_W; x++) if (MASK[425 * OUT_W + x]) row425++;
  assert.equal(row425, 0, "API_EDIT opens no pixel of row 425");
  const xs = MARGIN_EXCEPTIONS.map(([x]) => x).sort((a, b) => a - b);
  assert.deepEqual(xs.map((x, i) => x + xs[xs.length - 1 - i]), [1023, 1023, 1023, 1023], "mirror pairs about x = 511.5");
});
test("FINAL_MODEL_RGB_REGION is exactly GEOM in rows ≤ 424, and API_CONTEXT_MARGIN is exactly the Chebyshev-2 ring outside it, rows ≤ 424 (independent recomputation)", () => {
  const head = finalModelRgbRegion(INP.geom), m = apiContextMargin(INP.geom);
  let bad = 0;
  for (let p = 0; p < N; p++) if (head[p] !== (INP.geom[p] === 1 && yOf(p) <= 424 ? 1 : 0)) bad++;
  assert.equal(bad, 0, "FINAL_MODEL_RGB_REGION = GEOM ∩ rows ≤ 424");
  let ringBad = 0;
  for (let y = 0; y <= 430; y++) for (let x = 0; x < OUT_W; x++) {
    const p = y * OUT_W + x; let near = false;
    if (!head[p] && y <= 424) for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < OUT_W && yy >= 0 && head[yy * OUT_W + xx]) { near = true; break; } }
    if (m[p] !== (near ? 1 : 0)) ringBad++;
  }
  assert.equal(ringBad, 0, "API_CONTEXT_MARGIN = {p ∉ GEOM, row ≤ 424, Chebyshev distance to GEOM ≤ 2}");
  for (let p = 431 * OUT_W; p < N; p++) assert.equal(m[p], 0);
});
test("a too narrow API_CONTEXT_MARGIN and a margin reaching into TRANSITION are refused", () => {
  const head = finalModelRgbRegion(INP.geom);
  assert.ok(validateEditable(head, INP).problems.some((q) => /too narrow/.test(q)), "GEOM alone (no margin) is refused");
  const one = new Uint8Array(head), m1 = apiContextMargin(INP.geom, 1); for (let p = 0; p < N; p++) if (m1[p]) one[p] = 1;
  assert.ok(validateEditable(one, INP).problems.some((q) => /too narrow|2-px/.test(q)), "a 1-px margin is refused");
  const deep = new Uint8Array(MASK); for (let p = 425 * OUT_W; p < 428 * OUT_W; p++) if (head[424 * OUT_W + (p % OUT_W)]) deep[p] = 1;
  const v = validateEditable(deep, INP).problems; assert.ok(v.some((q) => /TRANSITION/.test(q)) && v.some((q) => /below row/.test(q)));
});

test("the coverage regions partition the head geometry exactly", () => {
  let total = 0; const seen = Object.fromEntries(REGIONS.map((r) => [r, 0]));
  for (let p = 0; p < N; p++) if (head(p)) { total++; seen[regionOf(p % OUT_W, yOf(p))]++; }
  assert.equal(Object.values(seen).reduce((a, b) => a + b, 0), total);
  for (const r of REGIONS) assert.ok(seen[r] > 0, r + " is not empty");
});

// ── layer contract ───────────────────────────────────────────────────────────
test("layer contract: the underlay is BALD and BLANK, the separate layers stay separate (D-132/D-135 unchanged)", () => {
  assert.deepEqual(layerContractViolations(SPEC, R3), []);
  assert.match(SPEC.layerContract.underlay, /BALD, BLANK FACE/);
  for (const l of ["face", "eyes", "iris", "blush", "expressions", "hair"]) assert.ok(SPEC.layerContract.separateLayersUntouched.includes(l));
});
test("layer contract: a spec without 'bald' or without 'blank/featureless' is refused", () => {
  const noBald = structuredClone(SPEC); noBald.layerContract.underlay = "BLANK FACE";
  assert.ok(layerContractViolations(noBald, R3).some((v) => /BALD/.test(v)));
  const noBlank = structuredClone(SPEC); noBlank.layerContract.underlay = "BALD head";
  assert.ok(layerContractViolations(noBlank, R3).some((v) => /BLANK/.test(v)));
  const merged = structuredClone(SPEC); merged.layerContract.separateLayersUntouched = ["hair"];
  assert.ok(layerContractViolations(merged, R3).length >= 5, "dropping the separate face/eyes/iris/blush/expression layers is refused");
  const r3b = structuredClone(R3); r3b.layerContract.slots.find((s) => s.slot === "base").content = "underlay with a neutral face";
  assert.ok(layerContractViolations(SPEC, r3b).some((v) => /base slot/.test(v)));
});

// ── prompt ───────────────────────────────────────────────────────────────────
test("prompt: names every facial feature and hair only in negated sentences, and states every requirement", () => {
  assert.deepEqual(promptViolations(PROMPT), []);
  const req = promptRequirements(PROMPT);
  for (const [k, ok] of Object.entries(req)) assert.ok(ok, "prompt must state " + k);
  for (const t of ["eyes", "irises", "eye whites", "eyelashes", "eyebrows", "nose", "nostrils", "mouth", "lips", "teeth", "smile", "blush", "freckles", "hair", "hairline", "beard", "expression"])
    assert.ok(PROMPT.includes(t), "the negative list names " + t);
  assert.ok(!/pixel[- ]identical|guarantee/i.test(PROMPT), "the prompt does not claim the model guarantees geometry");
});
test("prompt: positive instructions for features are caught", () => {
  for (const bad of ["Add large brown eyes with two highlights.", "Draw thin dark eyebrows.", "Paint a small friendly smile.", "Give the head short spiky hair.",
    "Add a discreet nose.", "Include a soft blush on the cheeks.", "Show a happy expression."])
    assert.ok(promptViolations(bad).length > 0, "caught: " + bad);
  assert.equal(promptRequirements("Colour the head.").bald, false);
});

// ── negative inputs (a temp copy of exactly the files the tools read) ───────
function tempRepo(corrupt) {
  const root = mkdtempSync(join(tmpdir(), "r3colour-"));
  const files = [...Object.values(D148).map((d) => d.path), NORTHSTAR.path, R3_CONTRACT_PATH, ...Object.values(FILES).map((f) => [FIXTURE_DIR, f].join("/").split("\\").join("/"))];
  for (const rel of files) { const dst = join(root, rel); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(join(REPO, rel), dst); }
  if (corrupt) { const p = join(root, corrupt); const b = readFileSync(p); b[b.length - 5] ^= 0xff; writeFileSync(p, b); }
  return root;
}
for (const [label, rel] of [["G1V3", D148.g1v3.path], ["E2 geometry", D148.geometry.path], ["K4 contour", D148.contour.path], ["P2 EDIT", D148.edit.path], ["P2 PROTECT", D148.protect.path],
  ["TRANSITION", D148.transition.path], ["Northstar", NORTHSTAR.path]]) {
  test(`a wrong ${label} hash is refused`, () => assert.throws(() => loadInputs(tempRepo(rel)), /sha256/));
}
test("a wrong underpainting or mask hash is refused by the adapter", () => {
  for (const f of [FILES.u1, FILES.mask, FILES.margin]) assert.throws(() => loadAll({ repoRoot: tempRepo([FIXTURE_DIR, f].join("/").split("\\").join("/")), h1Path: "x" }), /sha256|pinned/);
});
test("a wrong H1 is refused (any file whose hash is not the pinned authoring base)", () => {
  assert.throws(() => loadAll({ repoRoot: REPO, h1Path: join(REPO, NORTHSTAR.path) }), /H1 sha256/);
  assert.throws(() => loadAll({ repoRoot: REPO, h1Path: undefined }), /--h1/);
});
test("a wrong canvas size is refused (mask and model output)", () => {
  assert.throws(() => apiMaskToEditable(encodePngRGBA(10, 10, Buffer.alloc(400))), /1024x1536/);
  assert.throws(() => decodeOutput(encodePngRGBA(512, 768, Buffer.alloc(512 * 768 * 4))), (e) => e.gate === "format");
});

// ── mask negatives ───────────────────────────────────────────────────────────
test("a mask with editable body pixels is refused", () => {
  const ed = new Uint8Array(MASK); ed[700 * OUT_W + 512] = 1;           // a torso pixel (PROTECT₂)
  assert.ok(validateEditable(ed, INP).problems.some((p) => /PROTECT₂|outside EDIT₂|below row/.test(p)));
});
test("a mask without the left ear / right ear / with TRANSITION editable is refused", () => {
  const noL = new Uint8Array(MASK), noR = new Uint8Array(MASK), tr = new Uint8Array(MASK);
  for (let p = 0; p < N; p++) { if (p % OUT_W < 366) noL[p] = 0; if (p % OUT_W > 657) noR[p] = 0; if (INP.transition[p]) tr[p] = 1; }
  assert.ok(validateEditable(noL, INP).problems.some((p) => /ear-left/.test(p)));
  assert.ok(validateEditable(noR, INP).problems.some((p) => /ear-right/.test(p)));
  assert.ok(validateEditable(tr, INP).problems.some((p) => /TRANSITION/.test(p)));
  assert.equal(editableToApiMask(buildEditable(INP)).equals(readFileSync(join(REPO, FIXTURE_DIR, FILES.mask))), true);
});

// ── underpainting negatives ──────────────────────────────────────────────────
test("an underpainting with transparent holes, paint outside the head or drawn face marks is refused", () => {
  const u = buildU1(INP.geom, SKIN);
  let face = 0; while (!(head(face) && regionOf(face % OUT_W, yOf(face)) === "face-plane" && yOf(face) === 330)) face++;
  const hole = Buffer.from(u); hole[(face + 20) * 4 + 3] = 0;
  assert.ok(validateUnderpainting(hole, INP.geom, INP.transition, SKIN).problems.some((p) => /holes/.test(p)));
  const out = Buffer.from(u); out[(100 * OUT_W + 100) * 4 + 3] = 255;
  assert.ok(validateUnderpainting(out, INP.geom, INP.transition, SKIN).problems.some((p) => /outside/.test(p)));
  const mark = Buffer.from(u); for (const dx of [-30, 30]) for (let k = 0; k < 3; k++) mark[(face + dx + 40) * 4 + k] = 30;   // two "eye" dots, symmetric
  assert.ok(validateUnderpainting(mark, INP.geom, INP.transition, SKIN).problems.some((p) => /interior/.test(p)));
});

// ── output post-processing (synthetic H1: solid exactly on TRANSITION, in H1's measured neck skin) ───
const NECK = [...SEAM.S2.neckTargetExpected];
function synth() {
  const h1 = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (INP.transition[p]) h1.set([...NECK, 255], p * 4);
  const src = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (head(p) || INP.transition[p]) src.set([250, 192, 125, 255], p * 4);
  return { h1, src };
}
const proc = (h1, src, extra = {}) => processOutput({ srcRgba: src, h1Rgba: h1, geom: INP.geom, contour: CONTOUR, regions: REGIONS2, nsRgba: INP.ns, ...extra });
const rgbOf = (img, p) => [img[p * 4], img[p * 4 + 1], img[p * 4 + 2]];
const de00 = (a, b) => deltaE00(toLab(a), toLab(b));
test("a fully covering output passes every gate; TRANSITION/PROTECT₂ are H1, alpha is the geometry", () => {
  const { h1, src } = synth(); const r = proc(h1, src);
  for (const k of REGIONS) assert.equal(r.report.coverage[k].uncovered, 0);
  assert.equal(r.report.rows425to445BytesVsH1, 0); assert.equal(r.report.residueOutsideGeometry, 0); assert.equal(r.report.alphaNotGeometry, 0);
  assert.ok(r.report.join.pass);
});
for (const [label, xTest] of [["left ear", (x) => x < 366], ["right ear", (x) => x > 657]]) {
  test(`an output without the ${label} is refused per region`, () => {
    const { h1, src } = synth(); for (let p = 0; p < N; p++) if (xTest(p % OUT_W)) src[p * 4 + 3] = 0;
    assert.throws(() => proc(h1, src), (e) => e instanceof ColourGateError && e.gate === (label === "left ear" ? "coverage.ear-left" : "coverage.ear-right"));
  });
}
test("an output that narrows the transition is refused; one that recolours it cannot change a single byte", () => {
  const { h1, src } = synth(); let p0 = 0; while (!INP.transition[p0]) p0++;
  const narrow = Buffer.from(src); narrow[p0 * 4 + 3] = 0;
  assert.throws(() => proc(h1, narrow), (e) => e.gate === "pre.transition-uncovered");
  const recol = Buffer.from(src); for (let p = 0; p < N; p++) if (INP.transition[p]) recol.set([10, 200, 10, 255], p * 4);
  assert.equal(proc(h1, recol).report.rows425to445BytesVsH1, 0, "TRANSITION is taken from H1, never from the model");
});
test("output pixels outside the geometry never survive; an injected residue/ghost arc is caught", () => {
  const { h1, src } = synth(); for (let p = 100 * OUT_W; p < 120 * OUT_W; p++) if (REGIONS2.CORE[p] && !INP.geom[p]) src.set([60, 40, 20, 255], p * 4);   // "hair" in CORE₂ outside the head
  const r = proc(h1, src); assert.equal(r.report.residueOutsideGeometry, 0);
  const ghost = Buffer.from(r.rgba); let q = 0; while (INP.geom[q] || yOf(q) > 424 || !REGIONS2.CORE[q]) q++; ghost[q * 4 + 3] = 40;
  assert.equal(verifyOutput({ outRgba: ghost, h1Rgba: h1, geom: INP.geom, regions: REGIONS2 }).residueOutsideGeometry, 1);
});
test("API_CONTEXT_MARGIN is discarded: strong margin colours leave the candidate byte-identical; TRANSITION, PROTECT₂ and body untouched", () => {
  const { h1, src } = synth(); const base = proc(h1, src).rgba;
  for (const c of [[255, 0, 255], [0, 255, 0], [0, 0, 0], [255, 255, 255]]) {
    const loud = Buffer.from(src); for (let p = 0; p < N; p++) if (MARGIN[p]) loud.set([...c, 255], p * 4);
    const r = proc(h1, loud);
    assert.equal(Buffer.compare(r.rgba, base), 0, "margin colour " + c + " does not survive");
    let marginVisible = 0, keep = 0;
    for (let p = 0; p < N; p++) { if (MARGIN[p] && r.rgba[p * 4 + 3]) marginVisible++; if ((!INP.edit[p] || INP.transition[p]) && Buffer.compare(r.rgba.subarray(p * 4, p * 4 + 4), h1.subarray(p * 4, p * 4 + 4))) keep++; }
    assert.equal(marginVisible, 0); assert.equal(keep, 0); assert.equal(r.report.residueOutsideGeometry, 0); assert.equal(r.report.protectedBytes, 0);
  }
});

test("no model pixel outside FINAL_MODEL_RGB_REGION survives: loud colour everywhere else leaves the candidate byte-identical", () => {
  const { h1, src } = synth(); const base = proc(h1, src).rgba;
  const head = finalModelRgbRegion(INP.geom), loud = Buffer.from(src);
  for (let p = 0; p < N; p++) if (!head[p]) loud.set([255, 0, 255, 255], p * 4);
  assert.equal(Buffer.compare(proc(h1, loud).rgba, base), 0);
});

// ── tone continuity: S1 palette gate, S2 interior transition ─────────────────
const headFilled = (c) => { const { h1, src } = synth(); const o = Buffer.from(src); for (let p = 0; p < N; p++) if (head(p)) o.set([...c, 255], p * 4); return { h1, src: o }; };
test("S1 boundary: ΔE00 just below 4.50 passes; exactly 4.50 passes; just above — even 4.5003, which rounds to 4.50 — is refused without a candidate", () => {
  assert.equal(s1Passes(4.5), true, "exactly at the limit passes");
  assert.equal(s1Passes(4.5 + 1e-9), false); assert.equal(s1Passes(4.4999), true); assert.equal(s1Passes(Number.NaN), false);
  const ns = [...SEAM.S1.expectedNsMedianRGB];
  const below = [234, 181, 108], justAbove = [247, 191, 101], above = [234, 183, 108];
  assert.ok(de00(below, ns) < 4.5 && de00(below, ns) > 4.49);
  assert.ok(de00(justAbove, ns) > 4.5 && de00(justAbove, ns) < 4.505, "rounds to 4.50 but is above the limit");
  assert.ok(de00(above, ns) > 4.5 && de00(above, ns) < 4.53);
  const ok = headFilled(below); const r = proc(ok.h1, ok.src);
  assert.equal(r.report.s1.pass, true); assert.ok(r.report.s1.de00Exact < 4.5);
  const dir = mkdtempSync(join(tmpdir(), "r3colour-s1-"));
  for (const c of [justAbove, above]) {
    const bad = headFilled(c); let result = null;
    assert.throws(() => { result = proc(bad.h1, bad.src); }, (e) => e instanceof ColourGateError && e.gate === "s1.palette" && e.report.de00Exact > 4.5);
    assert.throws(() => writeCandidate(result, join(dir, "c.png")), (e) => e.gate === "write");
  }
  assert.equal(readdirSync(dir).length, 0, "no candidate file exists after an S1 refusal");
});
test("S1 and S2 are contract-locked: code pins, spec and SEAM agree; the formula text is exact", () => {
  assert.equal(S1_PIN, "4.5|254,197,128|300-416");
  assert.equal(SEAM.S1.thresholdDE00, 4.5); assert.deepEqual([...SEAM.S1.expectedNsMedianRGB], [254, 197, 128]); assert.deepEqual([...SEAM.S1.headRows], [300, 416]);
  assert.equal(SPEC.toneContinuity.S1.thresholdDE00, 4.5); assert.deepEqual(SPEC.toneContinuity.S1.expectedNsMedianRGB, [254, 197, 128]);
  assert.deepEqual(SPEC.toneContinuity.S1.measuredNorthstar, { medianRGB: [254, 197, 128], n: 19925, p95DE00: 4.5 });
  assert.equal(S2_PIN, "417|424|9|253,197,128");
  assert.deepEqual({ top: SPEC.toneContinuity.S2.top, bottom: SPEC.toneContinuity.S2.bottom, d: SPEC.toneContinuity.S2.denominator, t: SPEC.toneContinuity.S2.neckTargetExpected }, { top: 417, bottom: 424, d: 9, t: [253, 197, 128] });
  assert.equal(SEAM.S2.formula, "out = floor((w·neck + (9 − w)·rgb + 4) / 9), w = y − 416, head pixels of rows 417–424 only, before K4");
  assert.equal(SPEC.toneContinuity.S2.formula, SEAM.S2.formula);
  assert.ok(Object.isFrozen(SEAM) && Object.isFrozen(SEAM.S1) && Object.isFrozen(SEAM.S2));
});
test("K4 is applied after S2: a contour pixel in rows 417–424 is the K4 blend of the S2 value", () => {
  const { h1, src } = synth(); const r = proc(h1, src), s2 = applyS2(src, INP.geom, NECK);
  let checked = 0;
  for (let y = 417; y <= 424; y++) for (let x = 0; x < OUT_W; x++) {
    const p = y * OUT_W + x, c = CONTOUR[p]; if (!head(p) || !c || c === 255) continue;
    for (let k = 0; k < 3; k++) assert.equal(r.rgba[p * 4 + k], Math.floor((c * K4.line[k] + (255 - c) * s2[p * 4 + k] + 127) / 255));
    checked++;
  }
  assert.ok(checked > 10, "partially covered contour pixels exist in the S2 band (" + checked + ")");
});
test("S2 pins its parameters and its neck target; a changed parameter or a drifted neck is refused", () => {
  assert.equal(S2_PIN, `${SEAM.S2.top}|${SEAM.S2.bottom}|${SEAM.S2.denominator}|${NECK.join(",")}`);
  const { h1, src } = synth();
  for (const bad of [{ denominator: 10 }, { top: 416 }, { bottom: 425 }, { neckTargetExpected: [250, 190, 120] }])
    assert.throws(() => proc(h1, src, { s2: { ...SEAM.S2, ...bad } }), (e) => e.gate === "s2.parameters");
  const h1b = Buffer.from(h1); for (let p = 0; p < N; p++) if (INP.transition[p]) h1b.set([240, 180, 110, 255], p * 4);
  assert.throws(() => proc(h1b, src), (e) => e.gate === "s2.neck-target");
  assert.deepEqual(neckTarget(h1, INP.transition), NECK);
});
test("S2 touches only head pixels of rows 417–424, before K4; rows ≤ 416, TRANSITION and alpha are unchanged", () => {
  const { src } = synth(); const s2 = applyS2(src, INP.geom, NECK);
  let outside = 0, inside = 0;
  for (let p = 0; p < N; p++) {
    if (s2.compare(src, p * 4, p * 4 + 4, p * 4, p * 4 + 4) === 0) continue;
    if (head(p) && yOf(p) >= 417 && yOf(p) <= 424 && s2[p * 4 + 3] === src[p * 4 + 3]) inside++; else outside++;
  }
  assert.equal(outside, 0); assert.ok(inside > 0);
  const x = 512;
  for (let y = 417; y <= 424; y++) { const w = y - 416; for (let k = 0; k < 3; k++) assert.equal(s2[(y * OUT_W + x) * 4 + k], Math.floor((w * NECK[k] + (9 - w) * src[(y * OUT_W + x) * 4 + k] + 4) / 9)); }
});
test("an artificial seam at rows 424/425 is closed by S2 (ΔE00 well below the S0 seam), with no stripe", () => {
  const { h1, src } = synth(); const dark = Buffer.from(src);
  for (let p = 0; p < N; p++) if (head(p) && yOf(p) >= 405) dark.set([222, 158, 92, 255], p * 4);   // a darker chin band: S1 still passes, a seam appears
  const r = proc(h1, dark);
  assert.ok(r.report.s1.pass, "S1 ΔE00 " + r.report.s1.de00);
  const cols = []; for (let x = 0; x < OUT_W; x++) { const pH = 424 * OUT_W + x; if (head(pH) && !CONTOUR[pH] && INP.transition[pH + OUT_W]) cols.push(x); }
  assert.ok(cols.length > 40);
  const s0 = Math.max(...cols.map((x) => de00(rgbOf(dark, 424 * OUT_W + x), NECK)));
  const s2 = Math.max(...cols.map((x) => de00(rgbOf(r.rgba, 424 * OUT_W + x), rgbOf(r.rgba, 425 * OUT_W + x))));
  assert.ok(s0 > 3, "the synthetic seam is visible without S2 (" + s0.toFixed(2) + ")"); assert.ok(s2 < 1.0, "S2 closes it (" + s2.toFixed(2) + ")");
  for (let y = 416; y < 424; y++) assert.ok(de00(rgbOf(r.rgba, y * OUT_W + 512), rgbOf(r.rgba, (y + 1) * OUT_W + 512)) < 1.5, "no stripe between rows " + y + "/" + (y + 1));
});
test("S1 refuses an off-palette head (extreme light, extreme dark, too red), and the threshold is the Northstar skin p95", () => {
  const ns = northstarSkinStats(INP.ns);
  assert.deepEqual(ns.medianRGB, [...SEAM.S1.expectedNsMedianRGB]); assert.equal(ns.p95DE00, SEAM.S1.thresholdDE00);
  const { h1, src } = synth();
  for (const c of [[255, 250, 240], [120, 80, 50], [70, 45, 30], [250, 160, 150]]) {
    const off = Buffer.from(src); for (let p = 0; p < N; p++) if (head(p)) off.set([...c, 255], p * 4);
    assert.throws(() => proc(h1, off), (e) => e.gate === "s1.palette", "refused: " + c);
  }
  assert.ok(paletteCheck(src, INP.geom, CONTOUR, ns.medianRGB).pass);
  assert.throws(() => proc(h1, src, { nsRgba: Buffer.alloc(N * 4) }), (e) => e instanceof ColourGateError && e.gate === "s1.reference");
});
test("no candidate file is written unless every gate passed, and never over an existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "r3colour-out-"));
  assert.throws(() => writeCandidate(null, join(dir, "c.png")), (e) => e.gate === "write");
  assert.equal(readdirSync(dir).length, 0);
  const { h1, src } = synth(); const r = proc(h1, src); writeCandidate(r, join(dir, "c.png"));
  assert.throws(() => writeCandidate(r, join(dir, "c.png")), /overwrite/);
});

// ── the D-139 / D-143 failure classes ────────────────────────────────────────
const RAWS = { "D-139": process.env.R3_D139_RAW_PATH || "", "D-143": process.env.R3_D143_RAW_PATH || join(REPO, "tools", "avatar", "build", "r3-underlay-core", "r3-underlay-core.raw.png") };
for (const [id, path] of Object.entries(RAWS)) {
  test(`${id}'s output is refused by the colour post-processing (coverage), ears included`, { skip: !(path && existsSync(path)) && "local raw not available" }, () => {
    const src = decodeOutput(readFileSync(path));
    const cov = regionCoverage(src, INP.geom);
    assert.ok(cov["ear-left"].uncovered > 0 && cov["ear-right"].uncovered > 0, "both ears were under-covered");
    const { h1 } = synth();
    assert.throws(() => proc(h1, src), (e) => e instanceof ColourGateError && e.gate.startsWith("coverage."));
  });
}

// ── cannot send, cannot claim, zero network ──────────────────────────────────
const SOURCES = ["tools/avatar/prepare-r3-head-colour-call.mjs", "tools/avatar/process-r3-head-colour-output.mjs", "tools/avatar/build-r3-head-colour-fixtures.mjs"];
test("no send path: no fetch, no network module, no key read, no claim, no retry, no hidden send path", () => {
  for (const f of SOURCES) {
    const code = readFileSync(join(REPO, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const re of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|undici|XMLHttpRequest|WebSocket|\bhttps?:\/\//, /OPENAI_API_KEY|process\.env\.[A-Z_]*KEY/, /["']wx["']|\bclaim\w*\s*\(/i, /\bretry\b/i, /owner-approval|ownerApproval/])
      assert.ok(!re.test(code), `${f} must not contain ${re}`);
  }
  const r = attemptSend(); assert.equal(r.allowed, false); assert.equal(r.reasons.length, 3);
  assert.equal(CALL_ID, "UNASSIGNED"); assert.equal(STATUS, "PREPARED — NOT AUTHORISED");
});
test("the CLI refuses --send and every send-like or unknown flag, exits non-zero and writes nothing", () => {
  for (const args of [["--send"], ["--send", "--h1", "x"], ["--send=1"], ["--SEND"], ["--execute"], ["--live"], ["--h1", "x", "--call"], ["--owner-approval=D-149"], ["--dry-run", "--submit"]]) {
    const r = spawnSync(process.execPath, [join(REPO, SOURCES[0]), ...args], { encoding: "utf8" });
    assert.notEqual(r.status, 0, args.join(" ")); assert.match(r.stderr, /REFUSED/, args.join(" "));
  }
  assert.deepEqual(refusedArgs(["--h1", "a.png", "--dry-run", "--underpainting=u1"]), []);
  assert.deepEqual(refusedArgs(["--h1=a.png", "--underpainting", "u2"]), []);
  assert.deepEqual(refusedArgs(["--h1", "--send"]), ["--h1", "--send"], "a flag cannot hide behind --h1");
});
test("fixture hashes agree across spec, adapter pins and files", () => {
  assert.equal(PINNED.mask, SPEC.apiMask.sha256); assert.equal(PINNED.margin, SPEC.apiContextMargin.sha256);
  assert.equal(PINNED.u1, SPEC.underpainting.u1.sha256); assert.equal(PINNED.u2, SPEC.underpainting.u2.sha256);
  assert.equal(PINNED.mask, "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1");
  assert.equal(PINNED.margin, "1bb3ca1b2fa307c023c26ce52f93b989320c0707e2c7d0f10694901788248e03");
  for (const k of ["u1", "u2", "mask", "margin"]) assert.equal(sha256(readFileSync(join(REPO, FIXTURE_DIR, FILES[k]))), PINNED[k], k);
});
test("building every fixture makes zero network calls", () => {
  const real = globalThis.fetch; let calls = 0; globalThis.fetch = () => { calls++; throw new Error("network"); };
  try { run({ check: true, repoRoot: REPO, log: () => {} }); } finally { globalThis.fetch = real; }
  assert.equal(calls, 0);
});

// ── no personal paths, no credentials ────────────────────────────────────────
const LEAK = /[A-Za-z]:[\\/]|\/Users\/|AppData|DenSejeApp-artefacts|sk-[A-Za-z0-9]{16,}|OPENAI_API_KEY|Bearer\s|req_[0-9a-f]{8,}|claim\.json/;
test("the spec and the prompt carry no absolute path, credential, request id or claim", () => {
  for (const f of [FILES.spec, FILES.prompt]) assert.ok(!LEAK.test(readFileSync(join(REPO, FIXTURE_DIR, f), "utf8")), f);
});
test("a manifest carrying a personal path or a key would be caught by the same scan", () => {
  assert.ok(LEAK.test(JSON.stringify({ image: "C:\\Users\\someone\\h1.png" })));
  assert.ok(LEAK.test(JSON.stringify({ auth: "Bearer sk-abcdefghijklmnopqrstuvwx" })));
});

// ── the separate layers are untouched ────────────────────────────────────────
test("no face/eyes/iris/blush/expression/hair asset or the R3 contract is modified, and the tools never read them", () => {
  const paths = ["assets/avatar-r2/face", "assets/avatar-r2/eyes", "assets/avatar-r2/hair", "assets/avatar/hair", R3_CONTRACT_PATH, GEO_DIR.split("\\").join("/")];
  let status = "";
  try { status = execFileSync("git", ["status", "--porcelain", "--", ...paths], { cwd: REPO, encoding: "utf8" }); } catch { status = "git unavailable"; }
  assert.equal(status.trim(), "", "those paths are unchanged against HEAD");
  // asset paths of the separate layers (the words "face"/"expressions" may appear — the adapter LISTS them as separate)
  const LAYER_ASSET = /avatar-r2\/(face|eyes|hair)|assets\/avatar\/(hair|face|eyes|expressions?)\/|face-[a-z]+-v\d|eyes-[a-z]+-(iris|fixed)/;
  for (const f of SOURCES) assert.ok(!LAYER_ASSET.test(readFileSync(join(REPO, f), "utf8").replace(/^\s*\/\/.*$/gm, "")), `${f} never reads a face/eye/hair layer asset`);
});

// ── H1-dependent: the full preflight and dry run ─────────────────────────────
test("with H1: preflight passes, Image 1 keeps TRANSITION/PROTECT₂ as H1, and the dry run makes zero network calls",
  { skip: !H1_AVAILABLE && "FITTING_BASE_V1_PATH not set" }, () => {
    const all = loadAll({ repoRoot: REPO, h1Path: H1_PATH, underpainting: "u1" });
    const pre = preflight(all);
    assert.deepEqual(pre.ov, { transition: 0, belowHeadMaxY: 0, h1VisibleProtect2: 0, marginOutsideHeadRows: 0 }, "API_EDIT ∩ (TRANSITION ∪ H1-visible PROTECT₂) = ∅");
    assert.deepEqual(apiEditProtectedOverlap(MASK, all.h1, all.inp), pre.ov);
    const img1 = buildImage1(all.h1, all.up, all.inp);
    let diff = 0; for (let p = 0; p < N; p++) if (!all.inp.edit[p] || all.inp.transition[p]) for (let k = 0; k < 4; k++) if (img1[p * 4 + k] !== all.h1[p * 4 + k]) diff++;
    assert.equal(diff, 0);
    assert.equal(transitionSilhouetteDiff(all.h1, img1).count, 0);
    const real = globalThis.fetch; let calls = 0; globalThis.fetch = () => { calls++; throw new Error("network"); };
    let r; try { r = dryRun({ repoRoot: REPO, h1Path: H1_PATH, underpainting: "u1" }); } finally { globalThis.fetch = real; }
    assert.equal(calls, 0);
    assert.ok(!LEAK.test(JSON.stringify(r.manifest)), "the manifest has no path, key or claim");
    assert.equal(r.manifest.request.model, REQUEST.model); assert.equal(r.manifest.callId, "UNASSIGNED");
    const real1 = proc(all.h1, img1);
    assert.equal(real1.report.rows425to445BytesVsH1, 0, "the underpainting itself passes the post-processing");
    assert.deepEqual(real1.report.s2.neckTarget, NECK, "H1's measured neck skin is the pinned S2 target");
    const loud = Buffer.from(img1); for (let p = 0; p < N; p++) if (MARGIN[p]) loud.set([255, 0, 255, 255], p * 4);
    assert.equal(Buffer.compare(proc(all.h1, loud).rgba, real1.rgba), 0, "with real H1: margin colours do not survive");
    let body = 0; for (let p = 0; p < N; p++) if (!all.inp.edit[p] || all.inp.transition[p]) for (let k = 0; k < 4; k++) if (real1.rgba[p * 4 + k] !== all.h1[p * 4 + k]) body++;
    assert.equal(body, 0, "TRANSITION, PROTECT₂ and body are H1 bytes");
  });

// ── decision register: D-149 records exactly this preparation and authorises no call ──
test("D-149 exists exactly once, matches the pinned fixtures, and authorises no image call, call-id or claim", () => {
  const rows = readFileSync(join(REPO, "docs", "project-state.md"), "utf8").split("\n").filter((l) => l.startsWith("| **D-149** |"));
  assert.equal(rows.length, 1, "D-149 must appear exactly once");
  const row = rows[0];
  assert.match(row, /autoriserer INTET billed- eller API-kald/); assert.match(row, /`UNASSIGNED`/); assert.match(row, /default OFF/);
  assert.match(row, /intet runtime-asset er ændret eller promoveret/);
  for (const t of ["FINAL_MODEL_RGB_REGION", "API_CONTEXT_MARGIN", "API_EDIT", "ΔE00 ≤ 4,50", "417–424", "før K4", "(453,423), (454,423), (569,423), (570,423)"]) assert.ok(row.includes(t), "D-149 names " + t);
  assert.ok(row.includes(PINNED.mask) && row.includes(PINNED.u1), "D-149 cites the pinned mask and U1 hashes");
  assert.equal(SPEC.apiMask.editablePx, 68374); assert.ok(row.includes("68.374 px") && row.includes("66.162 px") && row.includes("2.212 px"), "pixel counts match the spec");
});
