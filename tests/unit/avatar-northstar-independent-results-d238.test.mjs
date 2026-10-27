// D-238 — the recorded results of D-235's independent validation (independent-validation-results-v1.json) and its evaluation
// manifest. The pictures and layers are private (D-127 §2), so these tests check the record: six sends, spent and closed; the
// pins from the receipts; all 48 planned outfits in the denominator; the five axes apart; the decision the pre-registered rule
// gives from the recorded values; the method run as frozen; the findings register unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe");
const J = (n) => JSON.parse(readFileSync(join(FX, n), "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");
const R = J("independent-validation-results-v1.json"), CALLS = J("independent-validation-calls-v1.json"), MAN = J("item-pipeline-manifest-d235.json");

test("D-238 six new calls sent once each, in order, no stop; D-235's entries spent and closed", () => {
  assert.deepEqual(R.budget, { authorised: 6, sent: 6, reserve: 0, retries: 0, stops: 0, claimsConsumed: 6 }); assert.deepEqual(R.stopRulesHit, []);
  assert.deepEqual(R.sends.map((s) => s.callId), CALLS.calls.map((e) => e.callId));
  for (const s of R.sends) { const e = CALLS.calls.find((x) => x.callId === s.callId);
    assert.deepEqual([s.httpStatus, s.actuallySent, s.dispatchUndetermined, s.outcome], [200, 1, 0, "RECEIVED_FOR_BF_CHECK"], s.callId);
    assert.deepEqual([e.mandateState, e.closedBy, e.result.imageSha256], ["SPENT", "D-238", s.imageSha256], s.callId); }
  assert.deepEqual([CALLS.budget.actuallySent, CALLS.budget.closed], [6, true]);
});

test("D-238 the method ran as frozen: d232, seam-contract-v2, the pinned code, no correction; the manifest is D-235's matrix with the receipts' pins", () => {
  assert.deepEqual([R.method.frozen, R.method.contract, MAN.method], ["d232", "seam-contract-v2", "d232"]); assert.deepEqual(R.method.code, CALLS.frozen.code); assert.match(R.method.corrections, /^none/);
  assert.deepEqual([R.method.runs, R.method.byteIdentical], [2, true]);
  const M = CALLS.matrix; assert.deepEqual(MAN.items.map((i) => i.id), [...M.tops, ...M.bottoms, ...M.shoes]);
  for (const it of MAN.items) { const s = R.sends.find((x) => x.item === it.id), o = M.oldItems.find((x) => x.id === it.id);
    if (s) assert.equal(it.rawSha256, s.imageSha256, it.id); else assert.equal(it.rawSha256, o.rawSha256, it.id); }
});

test("D-238 every planned outfit counts; five axes apart; the decision is the pre-registered rule applied to the recorded values", () => {
  assert.deepEqual(Object.keys(R.axes), ["technical", "contract", "combinationFit", "manualFindings", "visualQuality"]); assert.match(R.axes.visualQuality, /owner's review — not inferred/);
  const O = R.axes.combinationFit.outfits; assert.equal(Object.keys(O).length, 48); assert.equal(R.axes.combinationFit.planned, 48);
  const passing = Object.values(O).filter((o) => o.status === "technically-ok" || o.status === "technically-ok-open-finding").length; assert.equal(passing, R.measures.K);
  assert.equal(R.axes.combinationFit.pass + R.axes.combinationFit.rejected, 48, "rejected and missing stay in the denominator");
  const newIds = CALLS.calls.map((e) => e.item), T = newIds.filter((id) => R.axes.technical[id].status !== "rejected").length; assert.equal(T, R.measures.T);
  assert.equal(R.measures.C, newIds.filter((id) => R.axes.contract[id].targetRulesMet).length); assert.equal(R.measures.MF, R.axes.manualFindings.findings.length);
  for (const f of R.axes.manualFindings.findings) assert.equal(f.reportedByACheck, false, f.id + " is a finding no check reports");
  const { T: t, K, MF } = R.measures, d = t >= 5 && K >= 39 && MF === 0 && !R.measures.CMF ? "largerBatch" : t <= 3 || K < 24 || MF >= 3 || R.measures.CMF ? "fundamentalMethodChange" : "targetedCorrection";
  assert.equal(R.decisionByPreRegisteredRule.result, d); assert.deepEqual(R.decisionByPreRegisteredRule.rule, CALLS.acceptance.decision);
  assert.match(R.noExpansion, /no further calls/);
});

test("D-238 the record: the findings register unchanged, a decision file, no legacy row, no H1", () => {
  assert.equal(R.method.registerSha256, sha(Buffer.from(JSON.stringify(J("findings-register.json"))))); assert.ok(existsSync(join(REPO, "docs", "decisions", "D-238.md")));
  assert.ok(!readFileSync(join(REPO, "docs", "project-state.md"), "utf8").includes("| **D-238** |")); assert.ok(!JSON.stringify(R).includes("fitting-base"));
});
