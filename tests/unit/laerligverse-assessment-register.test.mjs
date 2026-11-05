// D-346 (F9, 05-11-2026): the teacher's decisions on the tests, registered and bound to content; the decided scoring
// rules (S2, S3, S4, S6, S7, T1) applied consistently; and the historical corrections that made a renewed approval
// necessary. The synthetic answers are the regression set: every change of score is pinned to the decision behind it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CRITERIA, FORMS, MUNDTLIG_OPFOELGNING, SCORING_RULES, TRANSFER, TRANSFER_CRITERIA, flags, subscores } from "../../tools/laerligverse/assessment-v1.mjs";
import { SHEET_COLUMNS, TEACHER } from "../../tools/laerligverse/assessment-pack.mjs";
import { AMBIGUITIES, FACT_CHECK, ITEMS, LP13, PAGE, contentFingerprints, currentStatus, validateReviewExport } from "../../tools/laerligverse/assessment-review.mjs";
import { PENDING, REGISTER, STORED, SUPPLEMENTS, ambiguityDecisions, approvalStatus, integrityProblems, readRegister } from "../../tools/laerligverse/assessment-register.mjs";
import { SYNTHETIC_RESPONSES, rubricTrial } from "../../tools/laerligverse/rehearsal.mjs";

const ORIGINAL_SHA = "61eec75348c5020e5f92deae3e9c28a85fa0d639bd30761fa48fd1247ebd93c6";
const APPROVED_FP = {
  A: "d56002dafa669ea5030608f41b25d06ef18c374fcf5939cef010061ac277d88a",
  B: "23aace8b367deb5fff617e2e4290728452fb610352c15e40c0b452df3ecc0e27",
  T: "14f03a5ba5aa5fba3163a73fdab8cbc50858ec290299eb6411eb87902c9e813a",
  C: "af34ad5ce4045ecde030d2dd2e1810b55924376c5c0fb775798dcbd4744f85e0",
  rubrik: "2da041a4515f26c03749ca68d1d21f1c901f2825215e3dfa4c73bd656104b354",
};
const stored = () => JSON.parse(readFileSync(STORED, "utf8"));

test("the teacher's file is stored byte for byte (SHA-256 61eec753…) and the register agrees with it", () => {
  assert.equal(createHash("sha256").update(readFileSync(STORED)).digest("hex"), ORIGINAL_SHA);
  const reg = readRegister();
  assert.equal(reg.sha256, ORIGINAL_SHA);
  assert.equal(reg.original_filnavn, "proeve-godkendelse.json");
  assert.equal(reg.format, "laerligverse-proeve-godkendelse/1");
  assert.equal(reg.version, "kildekritik-maaling-v1.2");
  assert.deepEqual(integrityProblems(), []);
  // Every approval is bound to the exact content the teacher saw.
  for (const id of ITEMS) assert.deepEqual(reg.afgoerelser[id], { status: "godkendt", fingeraftryk: APPROVED_FP[id] }, id);
});

test("the original values are kept as written (»chri«, »05-11/2026«) and flagged for the next registration, not corrected", () => {
  const reg = readRegister(), d = stored();
  assert.equal(d.laerer, "chri");
  assert.equal(d.dato, "05-11/2026");
  assert.equal(reg.laerer, "chri");
  assert.equal(reg.dato, "05-11/2026");
  assert.equal(reg.bemaerkninger.length, 2);
  assert.match(reg.bemaerkninger.join(" "), /Bevaret uændret.*fulde navn/);
  assert.match(reg.bemaerkninger.join(" "), /05-11-2026/);
});

test("S2, S3 and S4 are 'ikke_besluttet' IN THE FILE; the later decisions are a separate, labelled supplement", () => {
  const d = stored();
  for (const id of ["S2", "S3", "S4"]) assert.equal(d.tvetydigheder[id].valg, "ikke_besluttet", id);
  assert.equal(d.tvetydigheder.S6.valg, "foelgefejl");
  assert.equal(d.tvetydigheder.S7.valg, "spoerg");
  assert.equal(d.rubrikbeslutninger.T1.valg, "saerskilt");
  const dec = ambiguityDecisions();
  assert.deepEqual(Object.fromEntries(Object.entries(dec).map(([k, v]) => [k, [v.valg, v.kilde]])), {
    S6: ["foelgefejl", "fil"], S7: ["spoerg", "fil"], S2: ["1", "supplement-2026-11-05"], S3: ["1", "supplement-2026-11-05"], S4: ["1", "supplement-2026-11-05"],
  });
  assert.match(SUPPLEMENTS[0].kilde, /Ikke en del af proeve-godkendelse-2026-11-05\.json/);
  // Every supplement decision is a real option of its ambiguity.
  for (const [id, v] of Object.entries(SUPPLEMENTS[0].beslutninger)) assert.ok(AMBIGUITIES.find((a) => a.id === id).options.some((o) => o.id === v.valg), id);
  // The register never presents the supplement as file content.
  const reg = readRegister();
  for (const id of ["S2", "S3", "S4"]) assert.deepEqual(reg.tvetydigheder[id], { valg: "ikke_besluttet", kilde: "fil" });
});

test("the LP-13 choices are registered exactly as in the file — and nothing is activated", () => {
  const d = stored(), reg = readRegister();
  assert.deepEqual(Object.fromEntries(Object.entries(reg.lp13).map(([k, v]) => [k, v.valg])), Object.fromEntries(Object.entries(d.lp13).map(([k, v]) => [k, v.valg])));
  assert.deepEqual(Object.keys(reg.lp13), LP13.map((x) => x.id));
  assert.match(reg._om, /IKKE et GO til elevpilot, produktion, LP-13 eller merge/);
});

test("no approval carries over to changed content: all five changed after 05-11-2026 and await a renewed approval", () => {
  const st = approvalStatus();
  for (const id of ITEMS) {
    assert.equal(st[id].registreret, "godkendt", id);
    assert.equal(st[id].registreretFingeraftryk, APPROVED_FP[id], `${id}: the approved fingerprint is kept as history`);
    assert.notEqual(st[id].nuvaerendeFingeraftryk, APPROVED_FP[id], id);
    assert.equal(st[id].status, PENDING, id);
  }
  // The page and the validator say the same.
  for (const [id, s] of Object.entries(currentStatus())) assert.equal(s.status, PENDING, id);
  assert.deepEqual(validateReviewExport(readFileSync(STORED)).stale, ITEMS);
  // And an approval would still apply to UNCHANGED content (the rule works both ways).
  const same = approvalStatus({ current: { ...contentFingerprints(), A: APPROVED_FP.A } });
  assert.equal(same.A.status, "godkendt");
  const h = readFileSync(PAGE, "utf8");
  for (const id of ITEMS) assert.match(h, new RegExp(`data-reg="${id}"><strong>Afventer fornyet lærergodkendelse`));
});

test("S2: an imprecise purpose (»penge«) gives R4 = 1, a concrete one 2 — with examples from A, B and C", () => {
  assert.match(CRITERIA.R4.levels[1], /»penge«/);
  assert.match(CRITERIA.R4.levels[2], /konkret og korrekt/);
  const s2 = SYNTHETIC_RESPONSES.find((r) => r.id === "S2");
  assert.equal(s2.text.R4, "penge");
  assert.equal(s2.levels.R4, 1);
  assert.equal(s2.levelsV12.R4, 2);
  const rule = SCORING_RULES.find((r) => r.id === "S2");
  for (const f of ["A", "B", "C"]) assert.match(rule.examples[f], /0: .* · 1: .* · 2: /, f);
  assert.match(rule.origin, /supplement/);
});

test("S3: choosing a source because it has the same topic gives at most 1 — in every form", () => {
  assert.match(CRITERIA.B2.levels[1], /samme emne.*S3: højst 1/);
  assert.match(CRITERIA.B2.levels[2], /rigtigt valg.*relevant for netop påstanden/);
  assert.equal(SYNTHETIC_RESPONSES.find((r) => r.id === "S3").levels.B2, 1);
  const rule = SCORING_RULES.find((r) => r.id === "S3");
  for (const f of ["A", "B", "C"]) assert.match(rule.examples[f], /^1: .* · 2: /, f);
});

test("S4: a relevant reasoning that ends in a wrong answer gives at most 1 — the same rule in B1, B2 and T1", () => {
  assert.match(CRITERIA.B1.levels[1], /S4: højst 1/);
  assert.match(CRITERIA.B2.levels[1], /S4: højst 1/);
  assert.match(TRANSFER_CRITERIA.T1.levels[1], /S4: højst 1/);
  for (const k of ["B1", "B2"]) assert.match(CRITERIA[k].levels[2], /rigtig/, k);
  const s4 = rubricTrial().find((r) => r.id === "S4");
  assert.equal(s4.begrundelse, 2);
  assert.deepEqual(SYNTHETIC_RESPONSES.find((r) => r.id === "S4").levelsV12, { R1: 1, R2: 1, R3: 2, R4: 2, B1: 2, B2: 2 });
  // The pupil is still flagged for a closer look.
  assert.ok(s4.flags.some((f) => /begrunder fagligt, men vælger forkert/.test(f)));
  assert.ok(Object.keys(SCORING_RULES.find((r) => r.id === "S4").examples).includes("T"));
});

test("S6: a følgefejl counts once, is visible to a second rater, and never changes Valg", () => {
  const s6 = SYNTHETIC_RESPONSES.find((r) => r.id === "S6");
  const now = subscores("A", s6.answers, s6.levels), before = subscores("A", s6.answers, s6.levelsV12);
  assert.equal(before.identifikation, 1);
  assert.equal(now.identifikation, 4);
  assert.equal(now.valg, before.valg, "Valg is always scored against the key");
  assert.equal(s6.levels.R1, 0);
  assert.ok(flags(now, s6.levels).some((f) => /^følgefejl/.test(f)));
  for (const p of ["pre", "post", "C"]) assert.ok(SHEET_COLUMNS.includes(`${p}_foelgefejl`), p);
});

test("S7: one standard oral follow-up, the same in A, B and C; registered, and the outcome scored by the ordinary levels", () => {
  const m = MUNDTLIG_OPFOELGNING;
  assert.match(m.naar, /Aldrig under prøven/);
  assert.match(m.ordlyd, /Hvem er kilden skrevet til\?.*Hvorfor tror du, kilden er skrevet\?/);
  // The follow-up quotes the pupil's own questions word for word, and those are the same in A, B and C.
  for (const f of Object.values(FORMS)) assert.ok(m.ordlyd.includes(f.part1.questions[2]) && m.ordlyd.includes(f.part1.questions[3].split(" Skriv")[0]), f.id);
  assert.ok(m.maaIkke.length >= 4);
  assert.match(m.fortolkning, /B − A/);
  const s7 = SYNTHETIC_RESPONSES.find((r) => r.id === "S7");
  // Placed correctly: R3 2, but »at få penge« is still an imprecise purpose under S2 → R4 1.
  assert.deepEqual([s7.followUp.placed.R3, s7.followUp.placed.R4], [2, 1]);
  assert.deepEqual([s7.followUp.notPlaced.R3, s7.followUp.notPlaced.R4], [0, 0]);
  assert.ok(flags(subscores("A", s7.answers, s7.levels), s7.levels).some((f) => /mundtlig opfølgning \(S7\)/.test(f)));
  for (const p of ["pre", "post", "C"]) assert.ok(SHEET_COLUMNS.includes(`${p}_mundtlig_opfoelgning`), p);
});

test("T1: the answer is recorded apart (T_T1_svar) and gives no points; a bare »nej« never counts as understanding", () => {
  assert.ok(SHEET_COLUMNS.indexOf("T_T1_svar") >= 0 && SHEET_COLUMNS.indexOf("T_T1_svar") < SHEET_COLUMNS.indexOf("T_T1"));
  assert.match(TRANSFER_CRITERIA.T1.levels[0], /bart »ja« eller »nej«/);
  assert.match(SCORING_RULES.find((r) => r.id === "T1").examples.T, /»Nej\.« → T_T1_svar nej, T1 0/);
  const guide = readFileSync(TEACHER, "utf8");
  assert.match(guide, /T1 rapporteres særskilt/);
  assert.match(guide, /aldrig som forståelse/);
});

test("guessing: perfect choices by luck never show as a high competence — reasoning and identification stay 0 and are flagged", () => {
  const s5 = rubricTrial().find((r) => r.id === "S5");
  assert.equal(s5.valg, 6);
  assert.equal(s5.begrundelse, 0);
  assert.ok(s5.flags.some((f) => /uden begrundelse/.test(f)));
  // The three subscores are reported apart, with the weight on reasoning and identification (10 of 16 points).
  const max = (part) => Object.values(CRITERIA).filter((c) => c.part === part).reduce((n, c) => n + c.max, 0);
  assert.deepEqual([max("identifikation"), max("valg"), max("begrundelse")], [6, 6, 4]);
});

test("every rule can be applied by a second teacher: an origin, a rule text and examples for each test it covers", () => {
  assert.deepEqual(SCORING_RULES.map((r) => r.id), ["S2", "S3", "S4", "S6", "S7", "T1"]);
  for (const r of SCORING_RULES) {
    assert.ok(r.rule.length > 60, r.id);
    assert.match(r.origin, /fil|supplement/, r.id);
    assert.ok(Object.keys(r.examples).length >= 1, r.id);
  }
  // The synthetic regression set: every changed score names the decision behind it.
  for (const r of SYNTHETIC_RESPONSES.filter((x) => x.levelsV12)) {
    const changed = Object.keys(r.levelsV12).some((k) => r.levelsV12[k] !== r.levels[k]);
    if (changed) assert.ok(SCORING_RULES.some((x) => x.id === r.decidedBy), r.id);
  }
  const trial = Object.fromEntries(rubricTrial().map((r) => [r.id, [r.identifikation, r.valg, r.begrundelse]]));
  assert.deepEqual(trial, { S1: [6, 6, 4], S2: [5, 6, 0], S3: [4, 4, 2], S4: [6, 3, 2], S5: [2, 6, 0], S6: [4, 5, 3], S7: [2, 6, 3] });
});

test("historical fact check: each finding names its source and location; corrected wording is in the tests", () => {
  assert.deepEqual(FACT_CHECK.map((c) => c.id), ["FC-1", "FC-2", "FC-3", "FC-4"]);
  for (const c of FACT_CHECK) {
    assert.ok(c.sources.length >= 1, c.id);
    assert.match(c.verdict, /bekræftet|afkræftet|ikke dokumenterbar/, c.id);
  }
  // FC-1: »de fleste« is not documented.
  assert.equal(/de fleste/i.test(FORMS.A.source.text + FORMS.A.part2.claims.map((c) => c.text).join(" ")), false);
  // FC-2: Aarhus did not close its schools in 1918.
  assert.equal(/lukke|lukket/.test(FORMS.B.source.text + FORMS.B.part2.claims.map((c) => c.text).join(" ")), false);
  // FC-3: the amtmand's seat in Nykøbing Falster is not documented.
  assert.equal(FORMS.C.source.header.includes("Nykøbing"), false);
  // FC-4: the invented firm must not share a name with a registered company.
  assert.equal(JSON.stringify(TRANSFER).includes("Nordvask 60"), false);
  assert.equal(/firmaet Nordvask/.test(JSON.stringify(TRANSFER)), false);
  // Every source stays marked as constructed.
  for (const f of [...Object.values(FORMS), TRANSFER]) assert.equal(f.source.status, "didaktisk konstrueret", f.id);
  assert.ok(readFileSync(PAGE, "utf8").includes('id="faktatjek"'));
});

test("the register file is generated, never hand-written: it says so", () => {
  assert.match(readFileSync(REGISTER, "utf8"), /Genereret af tools\/laerligverse\/assessment-register\.mjs\. Ret ikke i hånden/);
});
