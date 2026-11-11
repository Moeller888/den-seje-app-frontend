// D-346 (F9): regression tests for the answer shortcuts found in the measurement material. Each test pins one
// finding (G1–G9, assessment-review.mjs SHORTCUT_FINDINGS): the rule-based strategy that exploited it must not
// beat guessing on the current tests, and the frozen v1.1 tests prove the strategy really did find the shortcut.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORMS, HANDOVER, TRANSFER } from "../../tools/laerligverse/assessment-v1.mjs";
import { STUDENT } from "../../tools/laerligverse/assessment-pack.mjs";
import { AMBIGUITIES, LP13, PAGE, RUBRIC_DECISIONS, SHORTCUT_FINDINGS, validateReviewExport, FORMAT, contentFingerprints } from "../../tools/laerligverse/assessment-review.mjs";
import { NEEDS_PUPIL_DATA, comparability, lix } from "../../tools/laerligverse/comparability.mjs";
import { TRANSFER_CRITERIA } from "../../tools/laerligverse/assessment-v1.mjs";
import { CHOICE_STRATEGIES, PART2_STRATEGIES, PERSONAL_LABELS, SENDER_TERMS, audit, cueWords, loadBefore, positionAgreement, words } from "../../tools/laerligverse/shortcut-audit.mjs";

const after = audit(FORMS, TRANSFER);
const before = loadBefore();
const was = audit(before.forms, before.transfer);
const row = (rows, id) => rows.find((r) => r.id === id);

test("the frozen v1.1 tests are the ones the shortcuts were found in (the before measurement is real)", () => {
  assert.equal(before.version, "kildekritik-maaling-v1.1");
  // G1, G2, G3: the sender, the opinion word and the length each gave (almost) full marks in part 2.
  assert.equal(row(was.part2, "afsender-foerst").right, 9);
  assert.equal(row(was.part2, "holdningsord").right, 9);
  assert.equal(row(was.part2, "laengst-ja").right, 8);
  // G6: word matching solved part 3 in A and C.
  assert.equal(row(was.part3, "noegleord").right, 6);
  // G5: words that appeared only in "ja" or only in "nej" claims.
  assert.ok(cueWords(before.forms).length >= 5);
});

test("part 2: no rule-based strategy gets a whole test right, and none beats guessing by much across A, B and C", () => {
  for (const r of after.part2) {
    for (const [id, p] of Object.entries(r.per)) assert.ok(p.right < p.of, `${r.id} solves ${id}`);
    assert.ok(r.right / r.of <= 7 / 12, `${r.id}: ${r.right}/${r.of}`);
  }
  // G1–G4 at chance in total: neither the rule nor its opposite gains more than 10 percentage points.
  for (const id of ["afsender-naevnt", "afsender-foerst", "holdningsord", "maengdeord-nej", "laengst-ja", "altid-nej", "altid-ja", "ordoverlap"]) {
    const pct = row(after.part2, id).pct;
    assert.ok(pct >= 40 && pct <= 60, `${id}: ${pct} %`);
  }
});

test("G10: in the pretest A every rule — and its opposite — scores exactly 2 of 4 (no test-wise rule of thumb helps)", () => {
  for (const r of after.part2) if (r.per.A) assert.equal(r.per.A.right, 2, `${r.id}: ${r.per.A.right}/4 in A`);
});

test("G1: the sender is named in a 'ja' AND a 'nej' claim in every form, and every form has the same four claim types", () => {
  for (const f of Object.values(FORMS)) {
    const named = f.part2.claims.filter((c) => words(c.text).some((w) => SENDER_TERMS[f.id].some((t) => w.startsWith(t))));
    assert.ok(named.some((c) => c.answer === "ja"), `${f.id}: no 'ja' claim names the sender`);
    assert.ok(named.some((c) => c.answer === "nej"), `${f.id}: no 'nej' claim names the sender`);
    const types = Object.fromEntries(f.part2.claims.map((c) => [c.type, c.answer]));
    assert.deepEqual(types, { J1: "ja", J2: "ja", N1: "nej", N2: "nej" }, f.id);
  }
});

test("G5: no word appears only in 'ja' claims (or only in 'nej' claims) across forms", () => {
  assert.deepEqual(cueWords(FORMS), []);
});

test("G6, G7: part 3 and the transfer choice cannot be solved by words, year, source type, length or position", () => {
  for (const r of after.part3) {
    for (const [id, p] of Object.entries(r.per)) assert.ok(p.right < p.of, `${r.id} solves ${id}`);
    assert.ok(r.right / r.of <= 0.5, `${r.id}: ${r.right}/${r.of}`);
  }
  // Each form: two personal sources from different times, and two official sources from the time of the claims.
  for (const f of Object.values(FORMS)) {
    const personal = f.part3.sources.filter((s) => PERSONAL_LABELS.includes(s.label));
    assert.equal(personal.length, 2, f.id);
    const years = personal.map((s) => Number(s.meta.match(/\b\d{4}\b/)[0]));
    assert.ok(Math.abs(years[0] - years[1]) >= 30, `${f.id}: ${years}`);
    for (const c of f.part3.claims) {
      const y = c.text.match(/\b\d{4}\b/)?.[0];
      assert.ok(y && f.part3.sources.find((s) => s.label === c.answer).meta.includes(y), `${f.id}${c.id}: the answer is from the claim's time`);
    }
    assert.equal(f.part3.sources.filter((s) => !PERSONAL_LABELS.includes(s.label) && s.meta.includes(f.part3.sources.find((x) => x.label === f.part3.claims.find((c) => c.sourceKind === "officiel").answer).meta.match(/\b\d{4}\b/)[0])).length, 2, `${f.id}: two official sources from the time`);
  }
});

test("G9: memorising the pretest's key (or its opposite) does not pay on B and C", () => {
  for (const [pair, n] of Object.entries(positionAgreement(FORMS))) assert.equal(n, 2, `${pair} agree on ${n} of 4`);
  assert.equal(row(after.part2, "praetest-raekkefoelge").pct, 50);
  assert.equal(row(after.part2, "praetest-omvendt").pct, 50);
  for (const f of [FORMS.B, FORMS.C]) {
    const pos = (form) => form.part3.claims.map((c) => form.part3.sources.findIndex((s) => s.label === c.answer));
    assert.notDeepEqual(pos(f), pos(FORMS.A), f.id);
  }
});

test("G8: part 1 (in T: questions 1–2) is handed in before the page that names the receiver and the purpose", () => {
  const sheet = readFileSync(STUDENT, "utf8");
  for (const f of Object.values(FORMS)) {
    const start = sheet.indexOf(`## Opgave ${f.id}:`);
    const p1 = sheet.indexOf("### Del 1", start), hand = sheet.indexOf(HANDOVER, start), p2 = sheet.indexOf("### Del 2", start);
    assert.ok(start >= 0 && p1 > start && hand > p1 && p2 > hand, f.id);
    // The claims that name the receiver or the purpose come only after the handover.
    for (const c of f.part2.claims) assert.ok(sheet.indexOf(c.text, start) > hand, `${f.id}: ${c.text}`);
    // Page 2 repeats the source, so part 2 can be answered.
    assert.ok(sheet.indexOf(f.source.text, hand) > hand, f.id);
  }
  const t = sheet.indexOf(`## Opgave ${TRANSFER.id}:`);
  const q2 = sheet.indexOf(TRANSFER.open[1], t), hand = sheet.indexOf(HANDOVER, t);
  assert.ok(q2 > t && hand > q2, "T: handover after question 2");
  for (const s of TRANSFER.choice.sources) assert.ok(sheet.indexOf(s.meta, t) > hand, `T: ${s.label} is on page 2`);
});

test("every finding names its strategies, and every strategy is run", () => {
  const ids = new Set([...PART2_STRATEGIES, ...CHOICE_STRATEGIES].map((s) => s.id));
  for (const g of SHORTCUT_FINDINGS) for (const s of g.strategies) assert.ok(ids.has(s), `${g.id}: ${s}`);
  assert.deepEqual(SHORTCUT_FINDINGS.map((g) => g.id), ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"]);
});

test("the approval page shows the shortcut check, the exact before/after text, and the page break in every test", () => {
  const h = readFileSync(PAGE, "utf8");
  assert.ok(h.includes('id="svargenveje"'));
  for (const g of SHORTCUT_FINDINGS) assert.ok(h.includes(`<td>${g.id}</td>`), g.id);
  const students = [...h.matchAll(/<div class="student"[\s\S]*?<div class="ra"/g)].map((m) => m[0]);
  assert.equal(students.length, 4);
  for (const s of students) assert.ok(s.includes(HANDOVER), "page break in the student view");
  // The before/after tables are inside the teacher's fold (they contain the key), one per test.
  const teacher = [...h.matchAll(/<details class="teacher">[\s\S]*?<\/details>/g)].map((m) => m[0]);
  assert.equal(teacher.filter((t) => t.includes('<table class="diff">')).length, 4);
  assert.equal((h.match(/<table class="diff">/g) ?? []).length, 4);
  // Nothing is pre-approved: every test and the rubric start as "Ikke gennemgået".
  for (const id of ["A", "B", "T", "C", "rubrik"]) assert.match(h, new RegExp(`name="st-${id}" value="ikke_gennemgaaet" checked`));
});

test("T1 is a separate teacher decision: shown undecided on the page, validated — and, once decided (»saerskilt«), built into the rubric", () => {
  const h = readFileSync(PAGE, "utf8");
  assert.deepEqual(RUBRIC_DECISIONS.map((d) => d.id), ["T1"]);
  assert.match(h, /name="rb-T1" value="ikke_besluttet" checked/);
  for (const o of RUBRIC_DECISIONS[0].options) assert.match(h, new RegExp(`name="rb-T1" value="${o.id}"`));
  assert.ok(RUBRIC_DECISIONS[0].options.some((o) => o.id === RUBRIC_DECISIONS[0].recommendation));
  // Decided 05-11-2026 (file: »saerskilt«): a bare "nej" gives T1 = 0; the answer itself is recorded apart.
  assert.match(TRANSFER_CRITERIA.T1.levels[0], /bart »ja« eller »nej« uden begrundelse.*T_T1_svar/);
  assert.equal(/svarer nej uden at sige hvorfor/.test(JSON.stringify(TRANSFER_CRITERIA.T1)), false);
  const base = { format: FORMAT, laerer: "", dato: "", indhold: contentFingerprints(), proever: Object.fromEntries(["A", "B", "T", "C", "rubrik"].map((id) => [id, { status: "ikke_gennemgaaet" }])),
    tvetydigheder: Object.fromEntries(AMBIGUITIES.map((a) => [a.id, { valg: "ikke_besluttet" }])), lp13: Object.fromEntries(LP13.map((x) => [x.id, { valg: "ikke_besluttet" }])) };
  assert.deepEqual(validateReviewExport(JSON.stringify(base)).problems, []);
  assert.match(validateReviewExport(JSON.stringify({ ...base, rubrikbeslutninger: { T1: { valg: "hack" } } })).problems.join(), /T1: invalid choice hack/);
  assert.match(validateReviewExport(JSON.stringify({ ...base, rubrikbeslutninger: { T1: { valg: "saerskilt" } } })).problems.join(), /without a teacher name/);
});

test("comparability: A, B and C have the same structure; the measures are on the page; what needs pupil data is said", () => {
  const c = comparability();
  for (const m of c.forms) {
    assert.equal(m.minutes, 13, m.id);
    assert.deepEqual(m.part2Types.split(" ").sort(), ["J1", "J2", "N1", "N2"], m.id);
    assert.ok(m.totalLix >= 25 && m.totalLix <= 44, `${m.id}: LIX ${m.totalLix} (easy–medium)`);
  }
  const total = c.forms.map((m) => m.totalWords);
  assert.ok(Math.max(...total) / Math.min(...total) <= 1.2, `reading load ${total}`);
  // 6 words, 2 sentences, 1 word over six letters: 3 + 100/6 = 19.7 → 20.
  assert.equal(lix("Et kort ord. En sætning mere."), 20);
  const h = readFileSync(PAGE, "utf8");
  assert.ok(h.includes('id="sammenlignelighed"'));
  for (const t of NEEDS_PUPIL_DATA) assert.ok(h.includes(t.replace(/&/g, "&amp;")), t.slice(0, 40));
});
