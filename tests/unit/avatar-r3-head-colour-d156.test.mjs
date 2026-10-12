// D-156 — deterministic OFFLINE feasibility of an overscan / bleed design for a possible R3 head-colour request.
// No network, no claim, no key, no call-id, no request package; the contract is unchanged.
//
// Geometry, clipping, protection and the synthetic control cases run in CI on the tracked fixtures. The tests on
// D-153's real raw output need that local, gitignored file and the pinned H1; without them they are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAK_RULE } from "../../tools/avatar/r3-head-colour-opaque-output.mjs";
import { SEAM } from "../../tools/avatar/build-r3-head-colour-fixtures.mjs";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import * as O from "../../tools/avatar/r3-head-colour-overscan.mjs";
import * as D from "../../tools/avatar/analyse-r3-head-colour-d156.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const W = 1024, N = 1024 * 1536;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const C = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
const REG = readFileSync(repoFile("docs/project-state.md"), "utf8").split("\n");
const TOOLS = ["tools/avatar/analyse-r3-head-colour-d156.mjs", "tools/avatar/r3-head-colour-overscan.mjs"];
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && (() => { try { return sha256(readFileSync(H1_PATH)) === "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4"; } catch (_) { return false; } })();
const RAW_PATH = process.env.R3_D153_RAW_PATH || repoFile("tools/avatar/build/r3-head-colour-d153/r3-head-colour-d153.raw.png");
const RAW_OK = existsSync(RAW_PATH) && sha256(readFileSync(RAW_PATH)) === "c397168d63cd3405055d18153dc004615154cbd079b2736d4171a06377df1e78";
const NEED_H1 = { skip: !H1_OK && "the pinned H1 is needed (external, never committed)" };
const NEED_REAL = { skip: !(H1_OK && RAW_OK) && "the pinned H1 and the local D-153 raw output are needed (the raw output is never committed)" };

let ctxMemo = null, realMemo = null; const geoMemo = new Map();
const ctx = () => (ctxMemo ??= D.loadOverscanContext({ root: REPO }));
const geo = (B) => { if (!geoMemo.has(B)) geoMemo.set(B, D.geometry(ctx(), ctx().h1T, B)); return geoMemo.get(B); };
const real = () => (realMemo ??= D.analyse({ root: REPO, rawBuf: readFileSync(RAW_PATH), h1Buf: readFileSync(H1_PATH) }));

// ── no call, no claim, no contract change ────────────────────────────────────────────────────

test("D-156 adds no contract entry: no live permission, sent stays 5, the contract does not mention D-156", () => {
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.equal(C.authorisedCalls.calls.length, 5);
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 5);
  assert.deepEqual([C.imageCallBudget.isAuthorisation, C.meta.authorisesImageRequest, C.architecture.defaultEnabled], [false, false, false]);
  assert.ok(!JSON.stringify(C).includes("D-156"));
});

test("the register: D-153–D-155 rows are verbatim, D-156 follows D-155 once and records conclusion B", () => {
  const one = (k) => { const r = REG.filter((l) => l.startsWith("| **" + k + "** |")); assert.equal(r.length, 1, k); return r[0]; };
  assert.equal(sha256(one("D-153")), "e5cbcb036520e951f2380ea99c1a090a612ccca01aa037e43dbcf38f642d53e9");
  assert.ok(one("D-155").includes("C — NO NEW IMAGE CALL SHOULD BE AUTHORISED YET"));
  const row = one("D-156");
  assert.equal(REG.findIndex((l) => l.startsWith("| **D-156** |")), REG.findIndex((l) => l.startsWith("| **D-155** |")) + 1);
  for (const needle of ["DETERMINISTIC OVERSCAN / BLEED DESIGN FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED", "`UNASSIGNED`", "`NONE`",
    "B — OVERSCAN DESIGN NOT GEOMETRICALLY FEASIBLE", "forbliver i kraft", "forbliver **5**", "default OFF", "ikke relevante", "Manglende evidens", "skakbræt"])
    assert.ok(row.includes(needle), "the D-156 row must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(row));
});

test("the D-156 tools have no network, no key, no claim, no child process and no writes; UNASSIGNED/NONE", () => {
  for (const rel of TOOLS) {
    const code = strip(readFileSync(repoFile(rel), "utf8"));
    for (const bad of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|node:dgram\b|node:child_process|undici|axios|XMLHttpRequest|WebSocket/, /https?:\/\//,
      /OPENAI|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/, /one-shot-claims|claim\w*\s*\(/, /\bretry\b|maxRetries/i, /\bexec(File)?(Sync)?\s*\(|\bspawn(Sync)?\s*\(/,
      /writeFile|appendFile|mkdirSync|renameSync|unlinkSync|copyFile|encodePng/, /["']assets\//])
      assert.ok(!bad.test(code), rel + " must not match " + bad);
    for (const u of [...code.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])?/g)].map((m) => m[0])) assert.equal(u, "process.env.FITTING_BASE_V1_PATH");
  }
  assert.deepEqual([D.DECISION, D.CALL_ID, D.CLAIM_IDENTITY], ["D-156", "UNASSIGNED", "NONE"]);
  assert.equal(D.STATUS, "DETERMINISTIC OVERSCAN / BLEED DESIGN FEASIBILITY ONLY — NO IMAGE REQUEST AUTHORISED");
  for (const args of [["--send"], ["--owner-approval=D-156"], ["--call-id=x"], ["--out", "assets"], ["--mask"], ["--raw"]]) {
    const r = spawnSync(process.execPath, [repoFile(TOOLS[0]), ...args], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /REFUSED|required/);
  }
});

test("the widths, the warp range and the limits are fixed constants, the inherited limits come from existing contract values", () => {
  assert.deepEqual([...D.WIDTHS], [2, 8, 16, 24, 32, 40, 48]);
  assert.equal(D.WARP_L, 60);
  assert.deepEqual(D.SHIFTS.map((s) => [...s]), [[8, 0], [-8, 0], [0, 8], [0, -8]]);
  assert.equal(D.ACCEPTANCE.seamMedianMaxDE00, LEAK_RULE.jndDE00); assert.equal(D.ACCEPTANCE.seamP95MaxDE00, SEAM.S1.thresholdDE00);
  assert.deepEqual([D.ACCEPTANCE.visibleU1TotalMax, D.ACCEPTANCE.visibleU1RegionMax], [0.25, 0.5]);
  assert.match(D.ACCEPTANCE.notRelevant, /NOT RELEVANT/);
  assert.ok(Object.isFrozen(D.ACCEPTANCE) && Object.isFrozen(O.OVERSCAN_RULE));
});

// ── geometry (CI) ────────────────────────────────────────────────────────────────────────────

test("FINAL is never changed: every width keeps all 66,162 head px editable and nothing of FINAL is bleed", () => {
  const c = ctx(); let head = 0; for (let p = 0; p < N; p++) if (c.head[p]) head++;
  assert.equal(head, 66162);
  for (const B of [8, 32, 48]) { const s = geo(B).sets; for (let p = 0; p < N; p++) { if (c.head[p]) { assert.equal(s.paint[p], 1); assert.equal(s.bleed[p], 0); } } }
});

test("bleed never touches a protected pixel or row >= 425, at every width", () => {
  for (const B of D.WIDTHS) {
    const g = geo(B);
    assert.ok(g.paintValid.ok, B + ": " + g.paintValid.problems.join("; "));
    assert.deepEqual(g.protectedOverlap, { transition: 0, belowHeadMaxY: 0, h1VisibleProtect2: 0, marginOutsideHeadRows: 0 });
    for (let p = 425 * W; p < N; p++) assert.equal(g.sets.paint[p], 0);
    assert.ok(g.bleedBbox[0] >= 0 && g.bleedBbox[2] < W && g.bleedBbox[1] >= 0 && g.bleedBbox[3] <= 424);
  }
});

test("both ears and the crown get the full bleed; the sides up to 40 px (61/73 at 48 px); left and right are identical", () => {
  for (const B of D.WIDTHS) {
    const r = geo(B).reach.byRegion;
    for (const k of ["ear-left", "ear-right", "crown"]) assert.equal(r[k].full, r[k].edges, B + " " + k);
    for (const k of ["side-left", "side-right"]) assert.deepEqual([r[k].full, r[k].edges, r[k].minReach], B === 48 ? [61, 73, 44] : [73, 73, B], B + " " + k);
    assert.deepEqual(r["ear-left"], r["ear-right"]); assert.deepEqual(r["side-left"], r["side-right"]);
    assert.equal(r["ear-left"].edges, 132);
    assert.deepEqual(geo(B).notchFill.left, geo(B).notchFill.right);
  }
});

test("the jaw underside cannot receive the full bleed next to the protected neck rows — the geometric failure", () => {
  const want = { 2: 214, 8: 192, 16: 168, 24: 146, 32: 126, 40: 110, 48: 88 };
  for (const B of D.WIDTHS) {
    const g = geo(B), lh = g.reach.byRegion["lower-head"];
    assert.equal(lh.edges, 218); assert.equal(lh.full, want[B], "B " + B); assert.equal(lh.minReach, 1);
    assert.equal(g.reach.neckHandoverEdgePx, 114);
    assert.equal(g.pass, false);
  }
});

test("D-149's mask rule rejects every overscan PAINT set (a new rule would be needed), and validatePaint rejects mutations", () => {
  const c = ctx(), B = 16, g = geo(B);
  for (const b of D.WIDTHS) assert.equal(geo(b).d149MaskRule.accepts, false);
  const forbidden = O.forbiddenSet(c.inp, c.h1T), v = (paint) => O.validatePaint(paint, { head: c.head, forbidden, sdf: c.sdf, B });
  const tr = Buffer.from(g.sets.paint); for (let p = 0; p < N; p++) if (c.inp.transition[p]) { tr[p] = 1; break; }
  assert.match(v(tr).problems.join(";"), /protected/);
  const below = Buffer.from(g.sets.paint); below[430 * W + 100] = 1;
  assert.equal(v(below).ok, false);
  const missing = Buffer.from(g.sets.paint); for (let p = 0; p < N; p++) if (c.head[p]) { missing[p] = 0; break; }
  assert.match(v(missing).problems.join(";"), /FINAL px are not editable/);
  const beyond = Buffer.from(g.sets.paint); beyond[60 * W + 512] = 1;
  assert.match(v(beyond).problems.join(";"), /beyond the bleed width/);
  assert.throws(() => O.overscanSets(c.head, c.sdf, forbidden, 64), /0\.\.63/);
  assert.throws(() => O.overscanSets(c.head, c.sdf, forbidden, 2.5), /integer/);
});

test("the clip line lies under full K4 on every bleedable E2 edge", () => {
  assert.deepEqual(D.clipUnderK4(ctx()), { edges: 734, hidden: 734 });
});

test("the warp with B = 0 is the identity; it refuses B >= L", () => {
  const c = ctx(), src = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) src.set([p % 251, (p >> 3) % 253, (p >> 7) % 241, 255], p * 4);
  assert.equal(Buffer.compare(O.warpOutward(src, c.sdf, 0), src), 0);
  assert.throws(() => O.warpOutward(src, c.sdf, 60), /B < L/);
});

// ── controls and clipping (CI) ───────────────────────────────────────────────────────────────

test("all 12 synthetic control cases get the expected verdict; asymmetric cases attribute the right side", () => {
  const rows = D.runControls(ctx()), by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(rows.length, 12);
  for (const r of rows) assert.ok(r.correct, r.id + " expected " + r.expect + ", got " + r.verdict);
  assert.equal(by["asymmetric-ears"].leftRight[0], 0); assert.ok(by["asymmetric-ears"].leftRight[1] > 0);
  assert.equal(by["shift-large"].leftRight[1], 0);
  assert.equal(by["symmetric-short"].leftRight[0], by["symmetric-short"].leftRight[1]);
  assert.equal(by["skin-coloured-background"].undecidable, true);
  assert.equal(by["neck-handover-gap"].leftRight[0], by["neck-handover-gap"].leftRight[1]);
});

test("the clip discards every bleed pixel: 0 magenta in the final, alpha = E2, protected bytes = H1", () => {
  const r = D.clipControl(ctx());
  assert.ok(r.magentaBleedPxIn > 20000);
  assert.deepEqual([r.magentaPxInFinal, r.alphaNotE2, r.protectedBytes, r.rows425to445], [0, 0, 0, 0]);
});

test("the conclusion rule: geometry failure → B; geometry, controls and a robust width → A; otherwise C", () => {
  const ok = { pass: true }, bad = { pass: false }, ctrl = [{ correct: true }], clip = { magentaPxInFinal: 0, alphaNotE2: 0, protectedBytes: 0, rows425to445: 0 };
  const sims = (passing) => D.WIDTHS.flatMap((B) => [{ B, shift: [0, 0], pass: passing(B) }, ...D.SHIFTS.map((s) => ({ B, shift: s, pass: passing(B) }))]);
  assert.equal(D.conclusion({ geometryAll: [ok, bad], controls: ctrl, clip, sims: sims(() => true) }).code, "B");
  const a = D.conclusion({ geometryAll: [ok], controls: ctrl, clip, sims: sims((B) => B >= 24) });
  assert.deepEqual([a.code, a.recommendedWidth], ["A", 32]);
  assert.equal(D.conclusion({ geometryAll: [ok], controls: ctrl, clip, sims: sims(() => false) }).code, "C");
  assert.equal(D.conclusion({ geometryAll: [ok], controls: [{ correct: false }], clip, sims: sims(() => true) }).code, "C");
});

test("geometry and controls are deterministic", () => {
  const strip = ({ sets, ...g }) => g;
  assert.equal(JSON.stringify(strip(geo(32))), JSON.stringify(strip(D.geometry(ctx(), ctx().h1T, 32))));
  assert.equal(JSON.stringify(D.runControls(ctx())), JSON.stringify(D.runControls(ctx())));
});

// ── with the real H1 and D-153 raw output (local only) ───────────────────────────────────────

test("real H1: the protection rules give the same PAINT as the synthetic H1 at every width", NEED_H1, () => {
  const h1 = decodePng(readFileSync(H1_PATH), "H1").rgba;
  for (const B of D.WIDTHS) {
    const g = D.geometry(ctx(), h1, B);
    assert.equal(g.blockedByProtection, 0); assert.ok(g.paintValid.ok);
    assert.deepEqual(g.protectedOverlap, { transition: 0, belowHeadMaxY: 0, h1VisibleProtect2: 0, marginOutsideHeadRows: 0 });
    assert.equal(Buffer.compare(Buffer.from(g.sets.paint), Buffer.from(geo(B).sets.paint)), 0, "B " + B);
  }
});

test("real raw: the probe is unchanged by overscan, but the D-153 background is a two-tone pattern split almost 50/50", NEED_REAL, () => {
  const r = real();
  assert.deepEqual([r.d152Probe.px, r.d152Probe.background], [103507, [245, 245, 245]]);
  for (const s of r.simulations.filter((x) => !x.shift[0] && !x.shift[1])) assert.deepEqual([s.probe.px, s.probe.background], [103507, [245, 245, 245]]);
  assert.deepEqual(r.d153Diagnostics.probeBimodality, { px: 103507, below238: 51529, atOrAbove238: 51978, lowShare: 0.4978 });
});

test("real raw: the diagnostic simulation never reaches 0 uncovered; processor gates pass; conclusion B", NEED_REAL, () => {
  const r = real(), un = r.simulations.filter((s) => !s.shift[0] && !s.shift[1]).map((s) => s.d155Uncovered);
  assert.deepEqual(un, [10828, 9045, 6290, 3103, 764, 327, 238]);
  for (const s of r.simulations) { assert.equal(s.pass, false); assert.equal(s.processor, "pass"); assert.equal(s.visibleU1, 0); }
  assert.deepEqual([r.conclusion.code, r.conclusion.feasible], ["B", []]);
  assert.equal(r.conclusion.text, "B — OVERSCAN DESIGN NOT GEOMETRICALLY FEASIBLE");
  assert.deepEqual([r.callId, r.claimIdentity, r.notACandidate], ["UNASSIGNED", "NONE", true]);
});

test("real raw: D-153 drew its own ears and outline; part of its gap sits at the non-bleedable neck handover", NEED_REAL, () => {
  const d = real().d153Diagnostics;
  assert.equal(d.uncovered, 11429); assert.equal(d.neckBoundUncovered, 697); assert.equal(d.interiorDarkPx, 1202);
  assert.deepEqual(d.ears, { left: { gapDepth: 22.76, thickness: 22.76 }, right: { gapDepth: 22.76, thickness: 22.76 } });
});

test("real raw: the analysis is deterministic and leaves the raw file unchanged", NEED_REAL, () => {
  const a = JSON.stringify(real()), b = JSON.stringify(D.analyse({ root: REPO, rawBuf: readFileSync(RAW_PATH), h1Buf: readFileSync(H1_PATH) }));
  assert.equal(sha256(a), sha256(b));
  assert.equal(sha256(readFileSync(RAW_PATH)), "c397168d63cd3405055d18153dc004615154cbd079b2736d4171a06377df1e78");
});

// ── runtime boundary ─────────────────────────────────────────────────────────────────────────

test("R3 stays default OFF: no shipped file references the D-156 work", () => {
  const shipped = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools", "tests", "docs", "supabase"].includes(n)) walk(p); } else if (/\.(html|js|mjs|css)$/.test(n)) shipped.push(p); } };
  walk(REPO);
  for (const p of shipped) assert.ok(!/overscan|head-colour-d156|r3-head-colour/.test(readFileSync(p, "utf8")), relative(REPO, p) + " must not reference the D-156 work");
});
