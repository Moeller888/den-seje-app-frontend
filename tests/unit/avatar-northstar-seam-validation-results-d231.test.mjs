// D-231 — the recorded results of D-228's seam validation (seam-validation-results-v1.json) and its evaluation manifest. The six
// pictures and every layer are private (D-127 §2, outside both clones), so these tests check the record: the pins agree with the
// receipts and the authorisation file, the budget is spent and closed, the four axes stay apart, the verdict follows the frozen
// rule from the recorded values, the diagnostic stays outside the verdict and the findings register is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe");
const J = (n) => JSON.parse(readFileSync(join(FX, n), "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");
const RES = J("seam-validation-results-v1.json"), CALLS = J("seam-validation-calls-v1.json"), MAN = J("item-pipeline-manifest-d228.json"), M225 = J("item-pipeline-manifest-d225.json");

test("D-231 the six calls were sent once each, in order, with no stop; every D-228 entry is spent and closed", () => {
  assert.deepEqual(RES.budget, { authorised: 6, sent: 6, reserve: 0, retries: 0, stops: 0, claimsConsumed: 6 }); assert.equal(RES.imageCalls, 6); assert.deepEqual(RES.stopRulesHit, []);
  assert.deepEqual(RES.sends.map((s) => s.callId), CALLS.calls.map((e) => e.callId));
  for (const s of RES.sends) { const e = CALLS.calls.find((x) => x.callId === s.callId);
    assert.deepEqual([s.httpStatus, s.actuallySent, s.dispatchUndetermined, s.outcome, s.receipt], [200, 1, 0, "RECEIVED_FOR_BF_CHECK", "RECEIVED_FOR_BF_CHECK"], s.callId);
    assert.deepEqual([e.mandateState, e.closedBy, e.result.imageSha256, e.result.requestId], ["SPENT", "D-231", s.imageSha256, s.requestId], s.callId); }
  assert.equal(CALLS.budget.actuallySent, 6); assert.equal(CALLS.budget.closed, true);
});

test("D-231 the evaluation manifest is D-228's frozen matrix: existing pins from the d225 manifest, new pins from the receipts, method d225", () => {
  assert.ok(IP.validateManifest(MAN)); assert.equal(MAN.method, CALLS.evaluation.method); assert.equal(MAN.method, "d225");
  const M = CALLS.evaluation.reuseMatrix; assert.deepEqual(MAN.items.map((i) => i.id), [...M.tops, ...M.bottoms, ...M.shoes]);
  for (const it of MAN.items) { const old = M225.items.find((x) => x.id === it.id), s = RES.sends.find((x) => x.item === it.id);
    if (old) assert.equal(it.rawSha256, old.rawSha256, it.id); else { assert.ok(s, it.id); assert.equal(it.rawSha256, s.imageSha256, it.id); assert.equal(it.raw, "d-228-seam-validation/" + s.callId + "/d228.image-1.png"); } }
  assert.deepEqual([RES.method.runs, RES.method.byteIdentical], [2, true]);
});

test("D-231 the four axes stay apart and the verdict is the frozen rule applied to the recorded values", () => {
  assert.deepEqual(Object.keys(RES.axes), ["technical", "contract", "combinationFit", "visualQuality"]); assert.match(RES.axes.visualQuality, /owner's review — not inferred/);
  const target = Object.fromEntries(CALLS.calls.map((e) => [e.item, e.targetRules]));
  const met = (id) => target[id].every((r) => !RES.axes.contract[id].failed.some((f) => f.startsWith(r)));
  const q1 = CALLS.calls.filter((e) => met(e.item)).length, q2 = ["top-tee-hip-blue", "top-longsleeve-waist-purple"].filter((id) => !RES.axes.contract[id].failed.includes("SC-W2-TOP-COVERS-HIP")).length;
  const cf = RES.axes.combinationFit, q3 = cf.outfitCheckOk / cf.available;
  assert.deepEqual([RES.questions.Q1.met, RES.questions.Q2.met, RES.questions.Q3.pass, RES.questions.Q3.available], [q1, q2, cf.outfitCheckOk, cf.available]);
  const v = q2 === 2 && q1 >= 4 && q3 >= 0.9 ? "improves" : q2 === 0 && q1 <= 2 ? "doesNotImprove" : "partial";
  assert.equal(RES.verdict.byFrozenRule, v); assert.deepEqual(RES.verdict.rule, CALLS.acceptance.verdict);
  // an available outfit has three technically OK items; every other one of the 40 is listed as not composable
  const ok = (id) => RES.axes.technical[id].status !== "rejected";
  assert.equal(cf.available, Object.keys(cf.outfits).length); for (const n of Object.keys(cf.outfits)) assert.ok(n.split("+").every(ok), n);
  assert.equal(cf.available + cf.notComposable.length, 40); for (const o of cf.notComposable) assert.ok(o.rejectedItems.length && o.rejectedItems.every((id) => !ok(id)), o.outfit);
});

test("D-231 the diagnostic is outside the verdict; failure classes are named; the findings register is unchanged", () => {
  assert.match(RES.diagnostic.note, /OUTSIDE the verdict/); assert.equal(Object.values(RES.diagnostic.counts).reduce((a, b) => a + b, 0), 40);
  assert.equal(RES.diagnostic.counts["available/outfitCheckOk"], RES.axes.combinationFit.outfitCheckOk);
  for (const c of Object.values(RES.classification)) { assert.ok(Object.keys(c.classes).length); for (const k of Object.keys(c.classes)) assert.ok(["generation", "extraction", "composition", "contract"].includes(k), k); assert.equal(c.markColoursDrawn, false); }
  const reg = readFileSync(join(FX, "findings-register.json"));
  assert.equal(RES.method.registerSha256, sha(Buffer.from(JSON.stringify(JSON.parse(reg.toString("utf8"))))), "the run used the register as it stands");
  assert.equal(RES.method.registerSha256, J("item-method-results-d225.json").reproducibility.registerSha256, "no finding was added: D-225's pinned register");
  assert.ok(existsSync(join(REPO, "docs", "decisions", "D-231.md"))); assert.ok(!readFileSync(join(REPO, "docs", "project-state.md"), "utf8").includes("| **D-231** |"));
  assert.ok(!JSON.stringify(RES).includes("fitting-base"), "no H1");
});
