// D-155 — deterministic gate- and request-design FEASIBILITY for a possible next R3 head-colour call.
// No network, no claim, no key, no call-id, no new call; the contract is unchanged.
//
// The control cases and the gate are proven on synthetic pixels in CI. The tests on D-153's real raw output need that
// local, gitignored file and the pinned H1; without them they are skipped (the raw output is never committed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SOLID_ALPHA } from "../../tools/avatar/build-r3-head-edit-masks.mjs";
import { SEAM } from "../../tools/avatar/build-r3-head-colour-fixtures.mjs";
import { LEAK_RULE } from "../../tools/avatar/r3-head-colour-opaque-output.mjs";
import * as G from "../../tools/avatar/r3-head-colour-coverage-gate.mjs";
import * as A from "../../tools/avatar/analyse-r3-head-colour-d155.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const W = 1024, N = 1024 * 1536;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const C = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
const REG = readFileSync(repoFile("docs/project-state.md"), "utf8").split("\n");
const TOOLS = ["tools/avatar/analyse-r3-head-colour-d155.mjs", "tools/avatar/r3-head-colour-coverage-gate.mjs"];
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && (() => { try { return sha256(readFileSync(H1_PATH)) === A.PINS.h1.sha256; } catch (_) { return false; } })();
const RAW_PATH = process.env.R3_D153_RAW_PATH || repoFile(A.PINS.raw.path);
const RAW_OK = existsSync(RAW_PATH) && sha256(readFileSync(RAW_PATH)) === A.PINS.raw.sha256;
const NEED_REAL = { skip: !(H1_OK && RAW_OK) && "the pinned H1 and the local D-153 raw output are needed (the raw output is never committed)" };

let ctxMemo = null, cmpMemo = null, realMemo = null;
const ctx = () => (ctxMemo ??= A.loadContext({ root: REPO }));
const cmp = () => (cmpMemo ??= A.compareDetectors(ctx()));
const real = () => (realMemo ??= A.analyse({ root: REPO, rawBuf: readFileSync(RAW_PATH), h1Buf: readFileSync(H1_PATH) }));

// ── no call, no claim, no contract change ────────────────────────────────────────────────────

test("D-155 adds no contract entry: no live permission, sent stays 5, D-153 stays closed", () => {
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.ok(!C.authorisedCalls.calls.some((e) => e.decision === "D-155" || e.decision === "D-154"));
  assert.equal(C.authorisedCalls.calls.length, 5);
  const d153 = C.authorisedCalls.calls.find((e) => e.decision === "D-153");
  assert.deepEqual([d153.mandateState, d153.neverReuse, d153.notAnActivePermission], ["SPENT", true, true]);
  const b = C.imageCallBudget;
  assert.equal(b.callsActuallySentSoFar.underlay, 5);
  assert.ok(!b.callsActuallySentSoFar.which.some((w) => w.startsWith("D-155")));
  assert.deepEqual([b.isAuthorisation, C.meta.authorisesImageRequest], [false, false]);
  assert.ok(!JSON.stringify(C).includes("D-155"), "the contract does not mention D-155");
});

test("the register: D-153 and D-154 rows are verbatim, D-155 follows D-154 once and records conclusion C", () => {
  const d153 = REG.filter((l) => l.startsWith("| **D-153** |"));
  assert.equal(d153.length, 1);
  assert.equal(sha256(d153[0]), "e5cbcb036520e951f2380ea99c1a090a612ccca01aa037e43dbcf38f642d53e9");
  const rows = REG.filter((l) => l.startsWith("| **D-155** |"));
  assert.equal(rows.length, 1);
  assert.equal(REG.findIndex((l) => l.startsWith("| **D-155** |")), REG.findIndex((l) => l.startsWith("| **D-154** |")) + 1);
  for (const needle of ["DETERMINISTIC GATE AND REQUEST-DESIGN FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED", "`UNASSIGNED`", "`NONE`",
    "C — NO NEW IMAGE CALL SHOULD BE AUTHORISED YET", "forbliver **5**", "default OFF", "**5.752**", "**5.520**", "**11.429**", "fastlagt før måling"])
    assert.ok(rows[0].includes(needle), "the D-155 row must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(rows[0]));
});

test("the D-155 tools have no network, no key, no claim, no child process and no writes; UNASSIGNED/NONE", () => {
  for (const rel of TOOLS) {
    const code = strip(readFileSync(repoFile(rel), "utf8"));
    for (const bad of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|node:dgram\b|node:child_process|undici|axios|XMLHttpRequest|WebSocket/, /https?:\/\//,
      /OPENAI|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/, /one-shot-claims|claim\w*\s*\(/, /\bretry\b|maxRetries/i, /\bexec(File)?(Sync)?\s*\(|\bspawn(Sync)?\s*\(/,
      /writeFile|appendFile|mkdirSync|renameSync|unlinkSync|copyFile/, /["']assets\//])
      assert.ok(!bad.test(code), rel + " must not match " + bad);
    for (const u of [...code.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])?/g)].map((m) => m[0])) assert.equal(u, "process.env.FITTING_BASE_V1_PATH");
  }
  assert.deepEqual([A.DECISION, A.CALL_ID, A.CLAIM_IDENTITY], ["D-155", "UNASSIGNED", "NONE"]);
  assert.equal(A.STATUS, "DETERMINISTIC GATE AND REQUEST-DESIGN FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED");
  for (const args of [["--send"], ["--owner-approval=D-155"], ["--call-id=x"], ["--out", "assets"], ["--claim"]]) {
    const r = spawnSync(process.execPath, [repoFile(TOOLS[0]), ...args], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /REFUSED/);
  }
});

test("every gate and acceptance constant is an existing contract value, fixed before measurement", () => {
  assert.equal(G.COVERAGE_RULE.halfCoverage, SOLID_ALPHA / 255);
  assert.deepEqual([...G.COVERAGE_RULE.skinReference], [...SEAM.S1.expectedNsMedianRGB]);
  assert.equal(G.COVERAGE_RULE.backgroundOnPaletteDE00, SEAM.S1.thresholdDE00);
  assert.equal(A.ACCEPTANCE.seamMedianMaxDE00, LEAK_RULE.jndDE00);
  assert.equal(A.ACCEPTANCE.seamP95MaxDE00, SEAM.S1.thresholdDE00);
  assert.deepEqual([A.ACCEPTANCE.visibleU1TotalMax, A.ACCEPTANCE.visibleU1RegionMax], [0.25, 0.5]);
  assert.deepEqual([...A.WIDTHS], [0, 4, 8, 12, 16, 20, 24, 28, 32]);
  assert.ok(Object.isFrozen(A.ACCEPTANCE) && Object.isFrozen(G.COVERAGE_RULE));
});

test("pins: a tampered raw output or H1 is refused before any work", () => {
  assert.throws(() => A.loadReal(ctx(), { rawBuf: Buffer.from("tampered"), h1Buf: Buffer.from("x") }), /raw output does not match its pin/);
  if (RAW_OK) {
    const raw = readFileSync(RAW_PATH), flipped = Buffer.from(raw); flipped[flipped.length - 20] ^= 1;
    assert.throws(() => A.loadReal(ctx(), { rawBuf: flipped, h1Buf: Buffer.from("x") }), /raw output does not match its pin/);
    assert.throws(() => A.loadReal(ctx(), { rawBuf: raw, h1Buf: Buffer.from("x") }), /H1 does not match its pin/);
  }
});

// ── control cases (CI, independent of D-153) ────────────────────────────────────────────────

test("edge distance: 1 at the E2 edge, 0 outside the head", () => {
  const { distance, head } = ctx();
  let outside = 0, ones = 0; for (let p = 0; p < N; p++) { if (!head[p] && distance[p]) outside++; if (head[p] && distance[p] === 1) ones++; }
  assert.equal(outside, 0); assert.ok(ones > 0);
});

test("the chosen gate (connectivity) has 0 false positives and 0 false negatives on every control case", () => {
  const { rows, errors } = cmp();
  assert.equal(rows.length, 12);
  assert.deepEqual(errors.M3_connectivity, { falsePositives: [], falseNegatives: [] });
  for (const r of rows) assert.equal(r.results.M3_connectivity, r.expect, r.id);
});

test("the comparison shows why the old gate and the colour-only detectors are not enough", () => {
  const { errors } = cmp();
  assert.deepEqual(errors.oldGate, { falsePositives: [], falseNegatives: ["halo-only", "on-palette-background"] });
  assert.deepEqual(errors.M1_fixedDE00_5.falseNegatives, ["halo-only"]);
  assert.deepEqual(errors.M2_twoTier.falseNegatives, ["halo-only"]);
  for (const k of ["oldGate", "M1_fixedDE00_5", "M2_twoTier", "M4_connectivityEdgeBand"]) assert.deepEqual(errors[k].falsePositives, [], k);
});

test("left and right are treated symmetrically; a one-sided leak is attributed to its own side", () => {
  const rows = Object.fromEntries(cmp().rows.map((r) => [r.id, r]));
  assert.deepEqual(rows["symmetric-ears"].leftRight.m3, [670, 670]);
  assert.deepEqual(rows["halo-ring"].leftRight.m3, [670, 670]);
  assert.equal(rows["small-leak-left-ear"].leftRight.m3[1], 0);
  assert.equal(rows["large-leak-right-ear"].leftRight.m3[0], 0);
});

test("the gate fails closed on a skin-coloured background and is not applicable to a transparent one", () => {
  const c = ctx(), h1 = A.syntheticH1(c);
  const on = A.controlCases(c).find((x) => x.id === "on-palette-background");
  const r = G.coverageGate(on.src, { h1Rgba: h1, geom: c.inp.geom, apiEdit: c.apiEdit, distance: c.distance });
  assert.deepEqual([r.pass, r.undecidable], [false, true]);
  const t = Buffer.alloc(N * 4);
  const r2 = G.coverageGate(t, { h1Rgba: h1, geom: c.inp.geom, apiEdit: c.apiEdit, distance: c.distance });
  assert.deepEqual([r2.pass, r2.applicable], [true, false]);
});

test("negative mutation: one background pixel connected to the outside makes a clean output fail", () => {
  const c = ctx(), h1 = A.syntheticH1(c);
  const clean = A.controlCases(c).find((x) => x.id === "u1-clean").src;
  const g = (s) => G.coverageGate(s, { h1Rgba: h1, geom: c.inp.geom, apiEdit: c.apiEdit, distance: c.distance });
  assert.equal(g(clean).pass, true);
  let edge = -1; for (let p = 0; p < N; p++) if (c.head[p] && c.distance[p] === 1) { edge = p; break; }
  const m = Buffer.from(clean); m.set([200, 175, 150, 255], edge * 4);
  const share = G.backgroundShare(m, [245, 245, 245]);
  assert.ok(share[edge] < SOLID_ALPHA / 255, "a mid-tone below half coverage is not background-like");
  m.set([240, 235, 228, 255], edge * 4);
  const r = g(m); assert.equal(r.pass, false); assert.equal(r.uncovered, 1);
});

test("the control cases and the comparison are deterministic", () => {
  const a = JSON.stringify(cmp()), b = JSON.stringify(A.compareDetectors(ctx()));
  assert.equal(sha256(a), sha256(b));
});

// ── the real D-153 raw output (local only) ───────────────────────────────────────────────────

test("real raw: the old gate's 5752 pixels are reproduced exactly, region by region", NEED_REAL, () => {
  const b = real().blindness;
  assert.equal(b.oldGate.total, 5752); assert.deepEqual(b.oldGate.background, [245, 245, 245]);
  assert.deepEqual(b.oldGate.byRegion, { crown: 285, "side-left": 1211, "side-right": 1099, "ear-left": 627, "ear-right": 673, "face-plane": 0, "lower-head": 1857 });
});

test("real raw: the 2.3–5 band is a connected rim, and the new gate catches core plus halo", NEED_REAL, () => {
  const b = real().blindness;
  assert.equal(b.band2_3to5.px, 5520); assert.equal(b.band2_3to5.isolated, 0); assert.equal(b.band2_3to5.maxDistanceFromEdge, 28);
  assert.deepEqual([b.newGate.pass, b.newGate.uncovered, b.newGate.coreLeak, b.newGate.haloOnly], [false, 11429, 5752, 5677]);
  assert.equal(b.legitimateColoursNearBackground.U1.withinDE00_5_ofBackground, 0);
});

test("real raw: no perimeter width and no adaptive rule meets every pre-set criterion — conclusion C", NEED_REAL, () => {
  const r = real();
  assert.equal(r.perimeter.length, 10);
  for (const s of r.perimeter) assert.equal(s.feasible, false, s.id);
  const by = Object.fromEntries(r.perimeter.map((s) => [s.id, s]));
  for (const w of [0, 4, 8, 12, 16, 20, 24]) assert.equal(by["perimeter-" + w + "px"].criteria.d155Coverage, false);
  for (const w of [28, 32]) { const s = by["perimeter-" + w + "px"]; assert.deepEqual([s.criteria.oldGates, s.criteria.d155Coverage, s.criteria.seamP95, s.criteria.visibleU1Total], [true, true, false, false]); }
  assert.deepEqual([r.conclusion.code, r.conclusion.feasible], ["C", []]);
  assert.equal(r.conclusion.text, "C — NO NEW IMAGE CALL SHOULD BE AUTHORISED YET");
  assert.deepEqual([r.callId, r.claimIdentity, r.notACandidate], ["UNASSIGNED", "NONE", true]);
});

test("real raw: the analysis is deterministic and leaves the raw file unchanged", NEED_REAL, () => {
  const a = JSON.stringify(real()), b = JSON.stringify(A.analyse({ root: REPO, rawBuf: readFileSync(RAW_PATH), h1Buf: readFileSync(H1_PATH) }));
  assert.equal(sha256(a), sha256(b));
  assert.equal(sha256(readFileSync(RAW_PATH)), A.PINS.raw.sha256);
});

// ── runtime boundary ─────────────────────────────────────────────────────────────────────────

test("R3 stays default OFF: no shipped file references the D-155 work", () => {
  const shipped = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools", "tests", "docs", "supabase"].includes(n)) walk(p); } else if (/\.(html|js|mjs|css)$/.test(n)) shipped.push(p); } };
  walk(REPO);
  for (const p of shipped) assert.ok(!/coverage-gate|head-colour-d155|r3-head-colour/.test(readFileSync(p, "utf8")), relative(REPO, p) + " must not reference the D-155 work");
});
