// D-346 §16 (05-11-2026): the teacher's file on v1.4, received and verified, but NOT a final registration while one of
// its decisions conflicts with the rubric it approves in the same file. S2 = 2 is the teacher's deliberate, confirmed
// decision ("Det var meningen") and is kept exactly; the conflict is shown, never resolved silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CALIBRATION, RUBRIC_VERSION, VERSION } from "../../tools/laerligverse/assessment-v1.mjs";
import { ITEMS, PAGE, contentFingerprints, currentStatus, decisionConflicts, validateReviewExport } from "../../tools/laerligverse/assessment-review.mjs";
import { ARCHIVED_V14, AWAITING, PENDING, STORED, approvalStatus, integrityProblems, readReceipt, readRegister, receiptProblems } from "../../tools/laerligverse/assessment-register.mjs";

const V14_SHA = "94b1f1631a9ac74e40220aa577bee5b4eaee90d10e1d0236bb28efc83f776c26";
const V12_SHA = "61eec75348c5020e5f92deae3e9c28a85fa0d639bd30761fa48fd1247ebd93c6";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const file = () => JSON.parse(readFileSync(ARCHIVED_V14, "utf8"));

test("the v1.4 file is archived byte for byte, on v1.4, and every fingerprint is the current content", () => {
  assert.equal(sha(readFileSync(ARCHIVED_V14)), V14_SHA);
  const d = file();
  assert.equal(d.version, VERSION);
  assert.equal(d.rubrikversion, RUBRIC_VERSION);
  assert.equal(d.laerer, "Christopher møller");
  assert.equal(d.dato, "05-11-2026");
  assert.deepEqual(d.indhold, contentFingerprints());
  for (const id of ITEMS) assert.equal(d.proever[id].status, "godkendt", id);
  const v = validateReviewExport(readFileSync(ARCHIVED_V14));
  assert.deepEqual(v, { problems: [], stale: [], notes: [] });
  const rec = readReceipt();
  assert.equal(rec.sha256, V14_SHA);
  assert.deepEqual(Object.values(rec.fingeraftryk_stemmer), ITEMS.map(() => true));
  assert.deepEqual(receiptProblems(), []);
});

test("S2 = 2 is kept exactly as the teacher chose it — never turned back into 1 — with his confirmation", () => {
  const d = file(), rec = readReceipt();
  assert.equal(d.tvetydigheder.S2.valg, "2");
  assert.equal(rec.tvetydigheder.S2.valg, "2");
  assert.match(rec.bekraeftelser.S2, /Det var meningen/);
  assert.match(rec.erstatter.S2, /supplement-2026-11-05/);
  // The other decisions, and LP-13, exactly as in the file.
  assert.deepEqual(Object.fromEntries(Object.entries(rec.tvetydigheder).map(([k, v]) => [k, v.valg])), { S2: "2", S3: "1", S4: "1", S6: "foelgefejl", S7: "spoerg" });
  assert.equal(rec.rubrikbeslutninger.T1.valg, "saerskilt");
  assert.deepEqual(Object.fromEntries(Object.entries(rec.lp13).map(([k, v]) => [k, v.valg])), Object.fromEntries(Object.entries(d.lp13).map(([k, v]) => [k, v.valg])));
  // On the page, the newest decision at S2 is the file's 2 — not the earlier supplement's 1.
  const page = readFileSync(PAGE, "utf8");
  const s2 = page.slice(page.indexOf('id="tv-S2"'), page.indexOf("</section>", page.indexOf('id="tv-S2"')));
  assert.match(s2, /Nyeste lærerbeslutning:<\/strong> 2 point: hensigten i ét ord er nok/);
  assert.equal(s2.includes("Registreret beslutning:</strong> 1 point"), false);
});

test("the conflict is real and visible: S2 = 2 gives »penge« 2, the approved rubric gives it 1 — so the file is archived, not registered", () => {
  assert.equal(CALIBRATION.find((a) => a.form === "A" && a.criterion === "R4" && a.answer === "penge").level, 1);
  const conflicts = decisionConflicts(file().tvetydigheder);
  assert.deepEqual(conflicts.map((c) => c.id), ["S2"]);
  assert.equal(conflicts[0].decidedLevel, 2);
  assert.equal(conflicts[0].anchorLevel, 1);
  // S3 = 1 and S4 = 1 agree with the rubric; a chosen S2 = 1 would too (the check is not a blanket alarm).
  assert.deepEqual(decisionConflicts({ S2: { valg: "1" }, S3: { valg: "1" }, S4: { valg: "1" } }), []);
  const rec = readReceipt();
  assert.equal(rec.status, AWAITING);
  assert.notEqual(rec.status, "registreret");
  assert.ok(rec.spoergsmaal && rec.spoergsmaal.svar.length === 2);
  // A green technical check cannot hide it: a receipt that claimed a final or ready status would fail the integrity check.
  const page = readFileSync(PAGE, "utf8");
  assert.match(page, /data-conflict="S2"/);
  assert.match(page, /id="aaben-afklaring"/);
  assert.match(page, new RegExp(`data-received="${AWAITING}"`));
});

test("the v1.2 approval is untouched, and nothing in the v1.4 file is carried into the item status while the conflict stands", () => {
  assert.equal(sha(readFileSync(STORED)), V12_SHA);
  assert.notEqual(ARCHIVED_V14, STORED);
  assert.equal(readRegister().version, "kildekritik-maaling-v1.2");
  assert.deepEqual(integrityProblems(), []);
  for (const id of ITEMS) {
    assert.equal(currentStatus()[id].status, PENDING, id);
    assert.equal(approvalStatus()[id].status, PENDING, id);
  }
});

test("the v1.4 approvals cannot apply to changed content: one changed character makes every decision on it stale", () => {
  const d = file();
  d.indhold.B = "0".repeat(64);
  assert.deepEqual(validateReviewExport(JSON.stringify(d)).stale, ["B"]);
});
