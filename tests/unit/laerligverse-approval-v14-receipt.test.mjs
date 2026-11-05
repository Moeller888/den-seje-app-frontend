// D-346 §16–17 (05-11-2026): the teacher's file on v1.4. On arrival (§16) S2 = 2 conflicted with the rubric it approved
// in the same file, so it was archived, not registered. The teacher settled it ("I alle prøver"); rubric v1.5 builds
// S2 = 2 in (§17), and the file is registered: its approvals apply where the content is unchanged (A, T), and the
// changed parts (rubric, B, C) await a renewed approval. S2 = 2 is kept exactly; the receipt keeps the conflict as history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CALIBRATION } from "../../tools/laerligverse/assessment-v1.mjs";
import { ITEMS, PAGE, contentFingerprints, currentStatus, decisionConflicts, liveConflicts, validateReviewExport } from "../../tools/laerligverse/assessment-review.mjs";
import { ARCHIVED_V14, AWAITING, PENDING, RESOLUTIONS, STORED, approvalStatus, integrityProblems, readReceipt, readRegister, readRegisterV14, receiptProblems } from "../../tools/laerligverse/assessment-register.mjs";

const V14_FP = {
  A: "4d71ac22bf2d8da716ca01574933328dc327ee283f5446bb5326d89763139c5a",
  B: "3abb09d8e596c48eb305f505168ed3edffb467833e408bd43ab7d49d3785347f",
  T: "bfb9fbb5eed21be9c4a8a3907ecc8493c817995fa97528986d2e20f8d01c4543",
  C: "e447393825fa6c2d4e55c33d52acaf85746780235dfe1e7388f54948603ab392",
  rubrik: "653b9b9456a5b0c8bb3ea9b71059b20c40302f8bd3a51d505770870c3e3db660",
};

const V14_SHA = "94b1f1631a9ac74e40220aa577bee5b4eaee90d10e1d0236bb28efc83f776c26";
const V12_SHA = "61eec75348c5020e5f92deae3e9c28a85fa0d639bd30761fa48fd1247ebd93c6";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const file = () => JSON.parse(readFileSync(ARCHIVED_V14, "utf8"));

test("the v1.4 file is archived byte for byte, made on v1.4, and at arrival every fingerprint was the content then", () => {
  assert.equal(sha(readFileSync(ARCHIVED_V14)), V14_SHA);
  const d = file();
  assert.equal(d.version, "kildekritik-maaling-v1.4");
  assert.equal(d.rubrikversion, "kildekritik-rubrik-v1.4");
  assert.equal(d.laerer, "Christopher møller");
  assert.equal(d.dato, "05-11-2026");
  assert.deepEqual(d.indhold, V14_FP);
  for (const id of ITEMS) assert.equal(d.proever[id].status, "godkendt", id);
  const rec = readReceipt();
  assert.equal(rec.sha256, V14_SHA);
  assert.deepEqual(Object.values(rec.fingeraftryk_stemmer), ITEMS.map(() => true));
  assert.deepEqual(receiptProblems(), []);
  // Now (v1.5): A and T are unchanged; the rubric, B and C changed after the decision.
  const now = contentFingerprints();
  assert.deepEqual(ITEMS.filter((id) => now[id] === V14_FP[id]), ["A", "T"]);
  const v = validateReviewExport(readFileSync(ARCHIVED_V14));
  assert.deepEqual(v.problems, []);
  assert.deepEqual(v.stale, ["B", "C", "rubrik"]);
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

test("the conflict at arrival is kept as history; v1.5 settles it, so S2 = 2 now agrees with the rubric", () => {
  const rec = readReceipt();
  assert.equal(rec.status, AWAITING);
  assert.deepEqual(rec.konflikter.map((c) => [c.id, c.decidedLevel, c.anchorLevel]), [["S2", 2, 1]]);
  // The rubric now gives »penge« 2, as S2 = 2 says; no conflict remains — and S2 = 1 would now conflict.
  assert.equal(CALIBRATION.find((a) => a.form === "A" && a.criterion === "R4" && a.answer === "penge").level, 2);
  assert.deepEqual(decisionConflicts(file().tvetydigheder), []);
  assert.deepEqual(liveConflicts(), []);
  assert.deepEqual(decisionConflicts({ S2: { valg: "1" } }).map((c) => c.id), ["S2"]);
  // Registered only with the teacher's settlement, which names his words and what follows.
  const reg = readRegisterV14();
  assert.match(reg.afklaringer.S2, /I alle prøver/);
  assert.equal(reg.afklaringer.S2, RESOLUTIONS.S2);
  assert.deepEqual(reg.konflikter_ved_modtagelse.map((c) => c.id), ["S2"]);
  assert.deepEqual(receiptProblems(), []);
  const page = readFileSync(PAGE, "utf8");
  assert.equal(/data-conflict="S2"/.test(page), false);
  assert.equal(/id="aaben-afklaring"/.test(page), false);
  assert.match(page, /data-received="registreret"/);
});

test("the v1.2 approval is untouched; the v1.4 approval applies only where the content is unchanged (A, T)", () => {
  assert.equal(sha(readFileSync(STORED)), V12_SHA);
  assert.notEqual(ARCHIVED_V14, STORED);
  assert.equal(readRegister().version, "kildekritik-maaling-v1.2");
  assert.deepEqual(integrityProblems(), []);
  const want = { A: "godkendt", T: "godkendt", B: PENDING, C: PENDING, rubrik: PENDING };
  for (const id of ITEMS) {
    assert.equal(currentStatus()[id].status, want[id], id);
    assert.equal(approvalStatus()[id].status, want[id], id);
  }
  // The v1.4 register records the file's own decisions, S2 = 2 among them.
  const reg = readRegisterV14();
  assert.equal(reg.sha256, V14_SHA);
  assert.equal(reg.tvetydigheder.S2.valg, "2");
  assert.equal(reg.version, "kildekritik-maaling-v1.4");
});

test("the v1.4 approvals cannot apply to changed content: one changed character makes the decision on it stale", () => {
  const d = file();
  assert.deepEqual(validateReviewExport(JSON.stringify(d)).stale, ["B", "C", "rubrik"]);
  d.indhold.A = "0".repeat(64);
  assert.deepEqual(validateReviewExport(JSON.stringify(d)).stale, ["A", "B", "C", "rubrik"]);
  assert.equal(approvalStatus({ current: { ...contentFingerprints(), T: "0".repeat(64) } }).T.status, PENDING);
});
