// NORTHSTAR BASE FIGURE — D-201: the diagnosis of D-199's rejected call A, the fix of the neck line in the recomposition, the
// PROPOSED (not adopted) revisions of BF4, BF9 and BF14 with their control stimuli, and the draft prompt v2. Everything here
// runs on Northstar v2 and stimuli derived from it — the private candidate A never enters the repository or CI (D-127 §2).
// Nothing re-classifies A: the binding gates and their thresholds are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const w = WR.buildWardrobe(), spec = BF.loadSpec(), Z = BF.zones(w, spec), { W, H, N } = WR;
const GATES_AT_D200 = { borderTransparentShare: 0.98, maxShiftPx: 6, minHeadIoU: 0.97, maxNeckEdgeDeltaPx: 2, centreTolPx: 4, groundTolPx: 4, minHandIoU: 0.94, maxOutsideEnvelopePx: 0,
  maxGarmentShareInLimbZone: 0.015, maxLimbWidthStepPx: 3, maxInkRowShare: 0.2, minLegWidthPx: 45, minCoreCoverage: 0.995, minGarmentSkinDistance: 60, minGarmentGarmentDistance: 30,
  maxSkinToneDistance: 30, minOutlineShare: 0.45, minSharpness: 0.7, maxHazeShare: 0.06, maxDressBackVisibleBasePx: 50, minDressBackIoU: 0.985 };

test("the binding gates and targets are unchanged; the revisions are PROPOSED, not adopted; A stays TECHNICAL_REJECT", () => {
  assert.deepEqual(spec.gates, GATES_AT_D200);
  assert.deepEqual([spec.targets.baseTopHemY, spec.targets.baseShortsHemY], [[786, 798], [920, 990]]);
  assert.match(spec.proposedRevisions.status, /NOT ADOPTED/); assert.match(spec.proposedRevisions.status, /A stays TECHNICAL_REJECT/);
  assert.deepEqual(Object.keys(spec.proposedRevisions).filter((k) => k.startsWith("P-")), ["P-BF4-BARE-FEET", "P-BF9-CHEST-BAND", "P-BF14-ALPHA"]);
  assert.match(spec.proposedRevisions.unchanged, /BF5 and BF15 are NOT revised/);
  const calls = JSON.parse(file("tools/avatar/fixtures/northstar-wardrobe/base-figure-calls-v1.json").toString("utf8"));
  assert.deepEqual([calls.authorisedCalls.calls[0].outcome, calls.authorisedCalls.calls[1].mandateState, calls.budget.actuallySent], ["TECHNICAL_REJECT", "UNSPENT", 1]);
});

test("the neck line: D-194's rule draws it over a continuous generated neck; the D-201 rule never does, and Northstar is untouched", () => {
  // a synthetic generated neck: Northstar with the head's lower neck rows replaced by the neck's own flat skin, continuing down
  const cand = new Uint8ClampedArray(w.fg.master), edge = BF.neckEdgeMask(w);
  for (let y = 441; y < 500; y++) for (let x = 465; x < 560; x++) { const i = y * W + x; if (w.fg.master[i * 4 + 3] >= 250 && BF.classify(w.fg.master, i) !== "ink") cand.set([254, 195, 127, 255], i * 4); }
  let n = 0; for (let i = 0; i < N; i++) if (edge[i]) n++; assert.ok(n > 50, "the head's leftover collar edge is found (" + n + " px)");
  const old = BF.neckLine(w, cand, BF.recompose(w, cand, "d194").figure), fixed = BF.neckLine(w, cand, BF.recompose(w, cand).figure);
  assert.ok(old.linePx > 0, "the D-194 rule draws the line over a generated neck: " + JSON.stringify(old));
  assert.deepEqual(fixed, { linePx: 0, maxDeviation: 0 });
  assert.deepEqual(BF.neckLine(w, w.fg.master, BF.recompose(w, w.fg.master).figure), { linePx: 0, maxDeviation: 0 }, "Northstar itself: no line either way");
  const fig = BF.recompose(w, cand).figure; let headPx = 0, differs = 0; for (let i = 441 * W; i < N; i++) if (!edge[i] && w.head[i * 4 + 3] >= 250) { headPx++; if ([0, 1, 2].some((c) => Math.abs(fig[i * 4 + c] - w.head[i * 4 + c]) > 1)) differs++; }
  assert.ok(headPx > 1000); assert.equal(differs, 0, "outside the collar edge, the opaque head stack still lies over the body unchanged");
});

test("every BF verdict on Northstar is the same with the D-194 and the D-201 seam rule", () => {
  const a = BF.checkBaseFigure(w, w.fg.master, Z, spec, "d194"), b = BF.checkBaseFigure(w, w.fg.master, Z, spec, "generated");
  assert.deepEqual(a.checks.map((c) => [c.id, c.ok]), b.checks.map((c) => [c.id, c.ok]));
});

test("the proposed revisions on their control stimuli: each passes the sound case and fails the faults it exists for", () => {
  const S = BF.proposalStimuli(w);
  for (const [id, s] of Object.entries(S)) {
    const reg = BF.register(s.image, w.fg.master), R = BF.shift(s.image, reg.dx, reg.dy), { body } = BF.recompose(w, R), p = Object.fromEntries(BF.proposedChecks(w, R, body, Z, spec).map((c) => [c.id, c]));
    if (s.proposal === "all") for (const [k, v] of Object.entries(s.expect)) assert.equal(p[k].ok, v, id + " " + k + " " + JSON.stringify(p[k].value));
    else assert.equal(p[s.proposal].ok, s.expect, id + " " + JSON.stringify(p[s.proposal].value));
  }
  for (const k of ["P-BF4-BARE-FEET", "P-BF9-CHEST-BAND", "P-BF14-ALPHA"]) { const c = spec.proposedRevisions[k].controls; for (const id of [...c.pass, ...c.fail]) assert.ok(id in S, k + " names the stimulus " + id); }
  assert.equal(BF.outsoleRows(w), 17);
});

test("P-BF14 is stricter where it matters: a translucent interior patch passes today's BF14 but not P-BF14; invisible dust the other way round", () => {
  const S = BF.proposalStimuli(w), bf14 = (img) => BF.checkBaseFigure(w, img, Z, spec).checks.find((c) => c.id === "BF14-ALPHA").ok;
  const p14 = (img) => { const R = BF.shift(img, 0, 0), { body } = BF.recompose(w, R); return BF.proposedChecks(w, R, body, Z, spec).find((c) => c.id === "P-BF14-ALPHA").ok; };
  assert.deepEqual([bf14(S["interior-patch-alpha-100"].image), p14(S["interior-patch-alpha-100"].image)], [true, false]);
  assert.deepEqual([bf14(S["encoder-dust"].image), p14(S["encoder-dust"].image)], [false, true]);
});

test("prompt v2 is a DRAFT: v1 plus exactly one sentence about the shorts' width and crotch height; v1 stays frozen", () => {
  const v1 = file("tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v1.txt").toString("utf8"), v2b = file("tools/avatar/fixtures/northstar-wardrobe/base-figure-prompt-v2-draft.txt");
  assert.equal(sha256(Buffer.from(v1, "utf8")), "8076c3d1a6f7fd141af3fbacd9f7a8f21b8aa6bc8d6ead0dd018a2172f61fd99");
  assert.equal(sha256(v2b), spec.promptV2Draft.sha256); assert.equal(v2b.length, spec.promptV2Draft.bytes); assert.match(spec.promptV2Draft.status, /DRAFT — not frozen, not authorised/);
  const a = v1.split("\n"), b = v2b.toString("utf8").split("\n"), added = b.filter((l) => !a.includes(l));
  assert.equal(b.length, a.length + 1); assert.equal(added.length, 1);
  assert.match(added[0], /no wider than the jeans/); assert.match(added[0], /crotch of the shorts is at the same height as the crotch of the jeans/);
  assert.ok(a.every((l) => b.includes(l)), "nothing of v1 is removed: style, pose, skin tone and the rest stay");
});

test("the diagnosis refuses to write inside the repository (D-127 §2)", () => {
  const out = join(REPO, "tools", "avatar", "build", "d201-refusal-probe");
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-base-figure.mjs"), "--diagnose", join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png"), "--out", out],
    { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out is inside the repository/); assert.equal(existsSync(out), false);
});
