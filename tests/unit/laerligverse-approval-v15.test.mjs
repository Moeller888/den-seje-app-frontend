// D-346 §18 (05-11-2026): the teacher's approval of v1.5 — all five parts, S2 = 2 — registered byte for byte with its
// own register. The newest register decides the status; the v1.2 and v1.4 approvals stay as history. An approval is
// bound to its content: the tests prove it applies now, and that it would stop applying the moment content changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUBRIC_VERSION, VERSION } from "../../tools/laerligverse/assessment-v1.mjs";
import { ITEMS, PAGE, contentFingerprints, currentStatus, decisionConflicts, newestRegistered, pendingItems, validateReviewExport, versionedRegisters } from "../../tools/laerligverse/assessment-review.mjs";
import { ARCHIVED_V14, PENDING, STORED, approvalStatus, integrityProblems, readRegister, readRegisterV14, receiptProblems, storedFileFor, versionedRegisterProblems } from "../../tools/laerligverse/assessment-register.mjs";

const V15_SHA = "141eaffd573b2cce99773db5fc6368f40c096913dc4500ff8cf9e9b430daa27f";
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

test("the v1.5 file is stored byte for byte, under its date and version, beside — not over — the earlier approvals", () => {
  const stored = storedFileFor(VERSION, "05-11-2026");
  assert.equal(sha(readFileSync(stored)), V15_SHA);
  assert.notEqual(stored, STORED);
  assert.notEqual(stored, ARCHIVED_V14);
  const reg = newestRegistered();
  assert.equal(reg.version, VERSION);
  assert.equal(reg.rubrikversion, RUBRIC_VERSION);
  assert.equal(reg.sha256, V15_SHA);
  assert.equal(join(ROOT, reg.godkendelsesfil), stored);
  assert.deepEqual(versionedRegisters().map((x) => x.reg.version), ["kildekritik-maaling-v1.4", "kildekritik-maaling-v1.5"]);
  assert.deepEqual([...integrityProblems(), ...receiptProblems(), ...versionedRegisterProblems()], []);
});

test("all five parts are approved on exactly the current content; S2 = 2 and every other decision as the teacher saved them", () => {
  const d = JSON.parse(readFileSync(storedFileFor(VERSION, "05-11-2026"), "utf8"));
  assert.equal(d.version, VERSION);
  assert.equal(d.rubrikversion, RUBRIC_VERSION);
  assert.deepEqual(d.indhold, contentFingerprints());
  assert.deepEqual(validateReviewExport(readFileSync(storedFileFor(VERSION, "05-11-2026"))), { problems: [], stale: [], notes: [] });
  for (const id of ITEMS) {
    assert.equal(d.proever[id].status, "godkendt", id);
    assert.equal(currentStatus()[id].status, "godkendt", id);
    assert.equal(approvalStatus()[id].status, "godkendt", id);
  }
  assert.deepEqual(pendingItems(), []);
  assert.deepEqual(Object.fromEntries(Object.entries(d.tvetydigheder).map(([k, v]) => [k, v.valg])), { S2: "2", S3: "1", S4: "1", S6: "foelgefejl", S7: "spoerg" });
  assert.equal(d.rubrikbeslutninger.T1.valg, "saerskilt");
  assert.deepEqual(decisionConflicts(d.tvetydigheder), []);
  // LP-13 exactly as in the v1.4 file (and not activated: nothing here reads it as a rule).
  const v14 = JSON.parse(readFileSync(ARCHIVED_V14, "utf8"));
  assert.deepEqual(Object.fromEntries(Object.entries(d.lp13).map(([k, v]) => [k, v.valg])), Object.fromEntries(Object.entries(v14.lp13).map(([k, v]) => [k, v.valg])));
});

test("the approval is bound to its content: change any part, and only that part falls back to awaiting a renewed approval", () => {
  for (const id of ITEMS) {
    const st = approvalStatus({ current: { ...contentFingerprints(), [id]: "0".repeat(64) } });
    for (const other of ITEMS) assert.equal(st[other].status, other === id ? PENDING : "godkendt", `${id} changed → ${other}`);
  }
});

test("the earlier approvals are history and approve nothing now; the v1.2 and v1.4 files are unchanged", () => {
  assert.equal(sha(readFileSync(STORED)), "61eec75348c5020e5f92deae3e9c28a85fa0d639bd30761fa48fd1247ebd93c6");
  assert.equal(sha(readFileSync(ARCHIVED_V14)), "94b1f1631a9ac74e40220aa577bee5b4eaee90d10e1d0236bb28efc83f776c26");
  assert.deepEqual(Object.values(approvalStatus({ reg: readRegister() })).map((s) => s.status), ITEMS.map(() => PENDING));
  const v14 = approvalStatus({ reg: readRegisterV14() });
  assert.deepEqual(ITEMS.filter((id) => v14[id].status === "godkendt"), ["A", "T"]);
});

test("the page shows the approval as the register has it, and says it is not a GO", () => {
  const page = readFileSync(PAGE, "utf8");
  assert.match(page, new RegExp(`data-final="${VERSION}"><strong>Registreret</strong> \\(SHA-256 141eaffd…\\)`));
  assert.match(page, /data-alle-godkendt="ja"/);
  assert.match(page, /Elevpilot og produktion<\/td><td><strong>Ikke autoriseret/);
  const s2 = page.slice(page.indexOf('id="tv-S2"'), page.indexOf("</section>", page.indexOf('id="tv-S2"')));
  assert.match(s2, /Registreret beslutning:<\/strong> 2 point: hensigten i ét ord er nok/);
  assert.match(s2, /registreret som kildekritik-maaling-v1\.5/);
});
