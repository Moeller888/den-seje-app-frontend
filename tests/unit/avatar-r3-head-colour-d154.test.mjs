// D-154 — the closure of D-153's one send (HTTP 200, candidate rejected by background-leak) and the deterministic
// salvage FEASIBILITY of its raw output with "S0 — exact leak fallback to U1". No network, no claim, no key, no new call.
//
// Synthetic tests prove the algorithm in CI. The tests on the real D-153 raw output need that local, gitignored file and
// the pinned H1; without them they are skipped (the raw output is never committed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT_W, OUT_H } from "../../tools/avatar/build-r3-head-edit-masks.mjs";
import { loadInputs, apiMaskToEditable, finalModelRgbRegion, FIXTURE_DIR, FILES, REGIONS, regionOf } from "../../tools/avatar/build-r3-head-colour-fixtures.mjs";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { backgroundLeakGate } from "../../tools/avatar/r3-head-colour-opaque-output.mjs";
import * as S from "../../tools/avatar/salvage-r3-head-colour-d154.mjs";
import { preD154Contract, PRE_D154_CONTRACT_CANONICAL_SHA256, D154_ADDED_D153_KEYS, PRE_D154 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const N = OUT_W * OUT_H;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const C = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
const REG = readFileSync(repoFile("docs/project-state.md"), "utf8").split("\n");
const D153 = C.authorisedCalls.calls.find((e) => e.decision === "D-153");
const TOOL_REL = "tools/avatar/salvage-r3-head-colour-d154.mjs";
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && (() => { try { return sha256(readFileSync(H1_PATH)) === S.PINS.h1.sha256; } catch (_) { return false; } })();
const RAW_PATH = process.env.R3_D153_RAW_PATH || repoFile(S.PINS.raw.path);
const RAW_OK = existsSync(RAW_PATH) && sha256(readFileSync(RAW_PATH)) === S.PINS.raw.sha256;
const NEED_REAL = { skip: !(H1_OK && RAW_OK) && "the pinned H1 and the local D-153 raw output are needed (the raw output is never committed)" };

// ── D-153 closed ─────────────────────────────────────────────────────────────────────────────

test("D-153 is closed in place: SPENT, never reused, not a permission, with its exact outcome", () => {
  assert.equal(D153.status, "SPENT — SENT ONCE, HTTP 200, RAW RECEIVED, CANDIDATE REJECTED BY background-leak, NOTHING PROMOTED");
  assert.deepEqual([D153.mandateState, D153.neverReuse, D153.notAnActivePermission, D153.closure.closedBy], ["SPENT", true, true, "D-154"]);
  const x = D153.execution;
  assert.deepEqual([x.request.fetches, x.request.retried, x.response.httpStatus, x.response.imagesReturned], [1, false, 200, 1]);
  assert.equal(x.request.parameters.background, "opaque");
  assert.equal(x.raw.sha256, S.PINS.raw.sha256); assert.equal(x.raw.bytes, S.PINS.raw.bytes);
  assert.deepEqual([x.evaluation.verdict, x.evaluation.rejectedAt, x.evaluation.leakPx, x.evaluation.maxDepthPxFromE2Edge], ["REJECTED", "background-leak", 5752, 28]);
  assert.deepEqual(x.evaluation.leaksByRegion, { crown: 285, "side-left": 1211, "side-right": 1099, "ear-left": 627, "ear-right": 673, "face-plane": 0, "lower-head": 1857 });
  assert.match(x.candidate, /^NONE/); assert.equal(x.promotion, "NONE");
  assert.ok(Date.parse(x.claim.claimedAt) <= Date.parse(x.response.finishedAt));
});

test("the closure changed only status, mandateState and added keys; the D-153 commit's contract is reproduced canonically", () => {
  const pre = preD154Contract(C);
  assert.equal(sha256(JSON.stringify(pre)), PRE_D154_CONTRACT_CANONICAL_SHA256);
  const preEntry = pre.authorisedCalls.calls.find((e) => e.decision === "D-153");
  assert.equal(sha256(JSON.stringify(preEntry)), D153.closure.snapshotCanonicalSha256BeforeClosure);
  for (const k of Object.keys(preEntry)) if (!["status", "mandateState"].includes(k)) assert.deepEqual(D153[k], preEntry[k], "authorisation field " + k + " is unchanged");
  assert.deepEqual(Object.keys(D153).filter((k) => !(k in preEntry)).sort(), [...D154_ADDED_D153_KEYS].sort());
  assert.equal(PRE_D154.d153.mandateState, "UNSPENT");
});

test("no live permission remains; the budget counts D-153's one send; D-154 adds nothing", () => {
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.ok(!C.authorisedCalls.calls.some((e) => e.decision === "D-154"));
  assert.match(C.prohibitions.noImageRequestAuthorised, /\(5\) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission/);
  assert.match(C.prohibitions.noImageRequestAuthorised, /D-154 is feasibility analysis only and adds no entry/);
  const b = C.imageCallBudget;
  assert.equal(b.callsActuallySentSoFar.underlay, 5);
  assert.equal(b.callsActuallySentSoFar.which.filter((w) => w.startsWith("D-153 ")).length, 1);
  assert.ok(!b.callsActuallySentSoFar.which.some((w) => w.startsWith("D-154")));
  assert.deepEqual([b.callsPlannedAndAuthorised.underlay, b.minimum, b.maximum, C.assets[0].calls, b.isAuthorisation, C.meta.authorisesImageRequest], [5, 19, 20, 5, false, false]);
});

test("the register: D-153's row is verbatim, D-154's follows it once and records the outcome and the salvage verdict", () => {
  const d153 = REG.filter((l) => l.startsWith("| **D-153** |"));
  assert.equal(d153.length, 1);
  assert.equal(sha256(d153[0]), "e5cbcb036520e951f2380ea99c1a090a612ccca01aa037e43dbcf38f642d53e9", "the D-153 row is byte-identical to its commit");
  const rows = REG.filter((l) => l.startsWith("| **D-154** |"));
  assert.equal(rows.length, 1);
  assert.equal(REG.findIndex((l) => l.startsWith("| **D-154** |")), REG.findIndex((l) => l.startsWith("| **D-153** |")) + 1);
  for (const needle of ["DETERMINISTIC SALVAGE FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED", "`UNASSIGNED`", "`NONE`", "**HTTP 200**", S.PINS.raw.sha256,
    "**5.752**", "**28 px**", "`callsActuallySentSoFar.underlay` bliver **5**", "S0 — exact leak fallback to U1", "SALVAGE NOT VIABLE", "default OFF", "fuld E2-dækning"])
    assert.ok(rows[0].includes(needle), "the D-154 row must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(rows[0]));
});

// ── the salvage tool cannot send and changes nothing outside its build area ─────────────────

test("the D-154 tool has no network, no key, no claim, no retry and no child process; UNASSIGNED/NONE", () => {
  const code = strip(readFileSync(repoFile(TOOL_REL), "utf8"));
  for (const bad of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|node:dgram\b|node:child_process|undici|axios|XMLHttpRequest|WebSocket/, /https?:\/\//,
    /OPENAI_API_KEY|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/, /one-shot-claims|claim\w*\s*\(/, /\bretry\b|maxRetries/i, /\bexec(File)?(Sync)?\s*\(|\bspawn(Sync)?\s*\(/, /["']assets\//])
    assert.ok(!bad.test(code), TOOL_REL + " must not match " + bad);
  for (const u of [...code.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])?/g)].map((m) => m[0])) assert.equal(u, "process.env.FITTING_BASE_V1_PATH");
  assert.equal(S.CALL_ID, "UNASSIGNED"); assert.equal(S.CLAIM_IDENTITY, "NONE");
  assert.equal(S.STATUS, "DETERMINISTIC SALVAGE FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED");
  assert.ok(S.OUT_DIR.startsWith("tools/avatar/build/"));
  for (const args of [["--send"], ["--owner-approval=D-154"], ["--call-id=x"], ["--out", "assets"]]) {
    const r = spawnSync(process.execPath, [repoFile(TOOL_REL), ...args], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /REFUSED/);
  }
});

test("pins: a tampered raw output, a wrong U1 or a missing H1 is refused before any work", () => {
  const ok = (k) => (k === "h1" ? Buffer.from("x") : Buffer.alloc(1));
  assert.throws(() => S.salvage({ rawBuf: Buffer.from("tampered"), h1Buf: ok("h1"), u1Buf: ok("u1"), maskBuf: ok("mask") }), /raw does not match its pin/);
  if (RAW_OK) {
    const raw = readFileSync(RAW_PATH);
    const flipped = Buffer.from(raw); flipped[flipped.length - 20] ^= 1;
    assert.throws(() => S.salvage({ rawBuf: flipped, h1Buf: ok("h1"), u1Buf: ok("u1"), maskBuf: ok("mask") }), /raw does not match its pin/);
    assert.throws(() => S.salvage({ rawBuf: raw, h1Buf: undefined, u1Buf: ok("u1"), maskBuf: ok("mask") }), /h1 was not supplied/);
    if (H1_OK) assert.throws(() => S.salvage({ rawBuf: raw, h1Buf: readFileSync(H1_PATH), u1Buf: Buffer.concat([readFileSync(repoFile(S.PINS.u1.path)), Buffer.from([0])]), maskBuf: ok("mask") }), /u1 does not match its pin/);
  }
});

// ── the algorithm, on synthetic pixels (CI) ──────────────────────────────────────────────────

const INP = loadInputs(REPO);
const HEAD = finalModelRgbRegion(INP.geom);
const API_EDIT = apiMaskToEditable(readFileSync(join(REPO, FIXTURE_DIR, FILES.mask)));
const U1 = decodePng(readFileSync(repoFile(S.PINS.u1.path)), "U1").rgba;
const NECK = [253, 197, 128];
/** Synthetic H1 (solid only on TRANSITION, in the neck skin) and an opaque output on a white background whose head misses the left ear and a crown band. */
function synthetic() {
  const h1 = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) if (INP.transition[p]) h1.set([...NECK, 255], p * 4);
  const raw = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    const x = p % OUT_W, y = (p / OUT_W) | 0;
    const painted = (HEAD[p] && !(x < 366) && !(y < 175)) || INP.transition[p];
    raw.set(painted ? [250, 192, 125, 255] : [245, 245, 245, 255], p * 4);
  }
  return { h1, raw };
}

test("S0 on synthetic pixels: exactly the gate's leak pixels take U1, nothing else changes, provenance is complete", () => {
  const { h1, raw } = synthetic();
  const gate = backgroundLeakGate(raw, { h1Rgba: h1, geom: INP.geom, apiEdit: API_EDIT });
  assert.equal(gate.pass, false); assert.ok(gate.leaks["ear-left"] > 0 && gate.leaks.crown > 0);
  const r = S.salvageFromPixels({ raw, h1, u1: U1, apiEdit: API_EDIT });
  const pr = r.report.proofs;
  assert.equal(pr.fallbackPx, gate.total); assert.equal(pr.fallbackEqualsLeakMask, true);
  assert.deepEqual([pr.changedOutsideLeakMask, pr.nonLeakModelPxChangedBeforeProcessing, pr.u1NotSolidAtFallback], [0, 0, 0]);
  assert.equal(pr.rawPixelsUnchanged, true);
  for (let p = 0; p < N; p++) {
    if (r.leak[p]) { for (let k = 0; k < 3; k++) assert.equal(r.s0[p * 4 + k], U1[p * 4 + k]); }
    else if (r.s0.compare(raw, p * 4, p * 4 + 4, p * 4, p * 4 + 4) !== 0) assert.fail("a non-leak pixel changed at " + p);
    if (r.leak[p] && !HEAD[p]) assert.fail("a fallback pixel lies outside FINAL_MODEL_RGB_REGION");
  }
  assert.equal(pr.provenanceSumsToCanvas, true);
  assert.equal(Object.values(r.report.provenance.counts).reduce((a, b) => a + b, 0), N);
  assert.equal(r.report.provenance.counts.S1, 0, "S1 is a gate and changes no pixel");
  assert.equal(r.report.gates.backgroundLeakAfterFallback.pass, true);
  assert.equal(r.report.allBindingGatesPass, true);
  assert.deepEqual([pr.finalAlphaNotE2, pr.modelRgbOutsideFinalRegion, pr.transitionOrProtect2NotH1], [0, 0, 0]);
});

test("S0 is deterministic: two runs give byte-identical pixels, provenance and report", () => {
  const { h1, raw } = synthetic();
  const a = S.salvageFromPixels({ raw, h1, u1: U1, apiEdit: API_EDIT }), b = S.salvageFromPixels({ raw, h1, u1: U1, apiEdit: API_EDIT });
  assert.equal(Buffer.compare(a.s0, b.s0), 0); assert.equal(Buffer.compare(a.out, b.out), 0); assert.equal(Buffer.compare(Buffer.from(a.prov), Buffer.from(b.prov)), 0);
  assert.equal(JSON.stringify(a.report), JSON.stringify(b.report));
});

test("the provenance map uses fixed, distinct colours for every class", () => {
  const cols = Object.values(S.PROVENANCE).map((v) => v.rgb.join(","));
  assert.equal(new Set(cols).size, cols.length);
  assert.deepEqual(Object.keys(S.PROVENANCE), ["MODEL_RGB", "U1_LEAK_FALLBACK", "S1", "S2", "K4", "TRANSITION", "PROTECT2", "E2_ALPHA"]);
});

// ── the real D-153 raw output (local) ────────────────────────────────────────────────────────

const real = () => S.salvage({ rawBuf: readFileSync(RAW_PATH), h1Buf: readFileSync(H1_PATH), u1Buf: readFileSync(repoFile(S.PINS.u1.path)), maskBuf: readFileSync(repoFile(S.PINS.mask.path)) });

test("real raw: exactly 5752 pixels get U1, region by region as D-153's evaluation; the raw file is unchanged", NEED_REAL, () => {
  const before = sha256(readFileSync(RAW_PATH));
  const r = real();
  assert.equal(r.report.proofs.fallbackPx, 5752);
  assert.equal(r.report.leakBefore.total, 5752);
  assert.deepEqual(r.report.leakBefore.byRegion, D153.execution.evaluation.leaksByRegion);
  assert.deepEqual(r.report.leakBefore.background, [245, 245, 245]);
  assert.equal(r.report.diagnostics.maxFallbackDepthPxFromE2Edge, 28);
  assert.deepEqual([r.report.proofs.changedOutsideLeakMask, r.report.proofs.nonLeakModelPxChangedBeforeProcessing], [0, 0]);
  assert.equal(r.report.proofs.rawUnchanged, true);
  assert.equal(sha256(readFileSync(RAW_PATH)), before);
  assert.equal(r.report.inputs.raw.sha256, S.PINS.raw.sha256);
});

test("real raw: every existing binding gate passes unchanged, alpha/geometry = E2, TRANSITION/PROTECT₂ = H1", NEED_REAL, () => {
  const r = real(), g = r.report.gates;
  assert.equal(r.report.failedGate, null); assert.equal(r.report.allBindingGatesPass, true);
  assert.equal(g.format.colourType, 2);
  assert.equal(g.backgroundLeakAfterFallback.pass, true); assert.equal(g.backgroundLeakAfterFallback.total, 0);
  assert.ok(g.s1.pass && g.s1.de00Exact <= 4.5);
  assert.ok(g.joinContinuity.pass);
  for (const k of ["protectedBytes", "transitionAlpha", "residueOutsideGeometry", "asymmetry", "rows425to445BytesVsH1", "alphaEqualsGeometry"]) assert.equal(g[k].value, 0, k);
  assert.deepEqual([r.report.proofs.finalAlphaNotE2, r.report.proofs.modelRgbOutsideFinalRegion, r.report.proofs.transitionOrProtect2NotH1], [0, 0, 0]);
  const c = r.report.provenance.counts;
  assert.equal(c.U1_LEAK_FALLBACK + r.report.provenance.s2Underlying.U1_LEAK_FALLBACK + r.report.diagnostics.overlaps.k4FullCoverage + r.report.diagnostics.overlaps.k4PartialCoverage, 5752,
    "every fallback pixel is accounted for: visible as fallback, under S2, or under K4");
});

test("real raw: the seam is far outside natural neighbour variation, and a near-background halo remains (the reason for SALVAGE NOT VIABLE)", NEED_REAL, () => {
  const d = real().report.diagnostics;
  assert.ok(d.seamPairs > 1000);
  assert.ok(d.seamDE00.median > 20 && d.seamDE00.p95 > 20, "model↔fallback seam median " + d.seamDE00.median);
  assert.ok(d.naturalNeighbourDE00.rawNonLeakSkin.median < 1 && d.naturalNeighbourDE00.rawNonLeakSkin.p90 < 2, "natural skin neighbours stay below 2");
  assert.ok(d.seamDE00.median > 10 * d.naturalNeighbourDE00.rawNonLeakSkin.p90);
  assert.equal(d.fallbackVisibleInFinal, 5752 - d.overlaps.k4FullCoverage);
  assert.ok(d.fallbackComponents.count > 1 && d.fallbackComponents.largest > 0);
});

test("real raw: the run is deterministic and the files land only in the build area, never over an existing file", NEED_REAL, () => {
  const a = real(), b = real();
  assert.equal(Buffer.compare(a.out, b.out), 0); assert.equal(JSON.stringify(a.report), JSON.stringify(b.report));
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d154-out-")));
  const w1 = S.writeOutputs(a, { root });
  assert.ok(existsSync(join(root, ...S.OUT_DIR.split("/"), "report.json")));
  assert.throws(() => S.writeOutputs(a, { root }), /refusing to replace an existing file/);
  const root2 = realpathSync.native(mkdtempSync(join(tmpdir(), "d154-out-")));
  const w2 = S.writeOutputs(b, { root: root2 });
  assert.deepEqual(w1.hashes, w2.hashes); assert.equal(w1.reportSha256, w2.reportSha256);
  assert.equal(a.report.notACandidate, "D-154 SALVAGE FEASIBILITY — NOT AN APPROVED CANDIDATE"); assert.equal(a.report.promoted, false);
});

// ── runtime boundary ─────────────────────────────────────────────────────────────────────────

test("R3 stays default OFF: no shipped file references the head-colour work, and nothing is promoted", () => {
  const shipped = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools", "tests", "docs", "supabase"].includes(n)) walk(p); } else if (/\.(html|js|mjs|css)$/.test(n)) shipped.push(p); } };
  walk(REPO);
  for (const p of shipped) assert.ok(!/r3-head-colour|salvage-r3|head-colour-d15/.test(readFileSync(p, "utf8")), relative(REPO, p) + " must not reference the R3 head-colour work");
});
