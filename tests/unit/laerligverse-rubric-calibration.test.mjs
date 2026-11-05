// D-346 §15 (F9, v1.4): the rubric correction. A topic is not a purpose; a full purpose needs the same two parts in
// A, B and C; the shared principles P1–P5; the anchor answers (CALIBRATION); the approval flow for the corrected
// material; and the remaining shortcut checks (answer position, phrases shared with the game).
//
// The open answers are scored by the TEACHER. These tests do not score pupils: they check that the rubric, the
// keys, the rule examples and the anchor answers agree with each other, so a teacher who follows them gives the
// same answer the same score in every test. Passing them is not evidence of learning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ARCHIVE_ITEMS } from "../../laerligverse/host/dev/archive-items.js";
import { CALIBRATION, CRITERIA, FORMS, RUBRIC_VERSION, SCORING_RULES, TRANSFER, TRANSFER_CRITERIA, VERSION, flags } from "../../tools/laerligverse/assessment-v1.mjs";
import { FACT_CHECK, FORMAT, ITEMS, PAGE, ROUND, contentFingerprints, currentStatus, validateReviewExport } from "../../tools/laerligverse/assessment-review.mjs";
import { PENDING, STORED, approvalStatus, integrityProblems, readRegister } from "../../tools/laerligverse/assessment-register.mjs";
import { CHOICE_STRATEGIES, answerPositions, audit, pupilTexts, sharedPhrases, stems } from "../../tools/laerligverse/shortcut-audit.mjs";

const ORIGINAL_SHA = "61eec75348c5020e5f92deae3e9c28a85fa0d639bd30761fa48fd1247ebd93c6";
const MAX = { ...Object.fromEntries(Object.entries(CRITERIA).map(([k, c]) => [k, c.max])), ...Object.fromEntries(Object.entries(TRANSFER_CRITERIA).map(([k, c]) => [k, c.max])) };
const anchors = (criterion, form) => CALIBRATION.filter((a) => a.criterion === criterion && (!form || a.form === form));
const keyOf = (form) => FORMS[form].part1.key.R4;
const overlapWithKey = (answer, form) => { const k = new Set(keyOf(form).flatMap(stems)); return stems(answer).filter((s) => k.has(s)).length; };

// ── Pointgivning ────────────────────────────────────────────────────────────────────────────────────────────
test("a topic answer gives 0 in purpose (R4) and in T3 — in every test, never 1", () => {
  for (const form of ["A", "B", "C"]) {
    const topic = anchors("R4", form).filter((a) => a.kind === "emne");
    assert.ok(topic.length >= 1, form);
    for (const a of topic) assert.equal(a.level, 0, `${form}: »${a.answer}«`);
  }
  assert.deepEqual(anchors("T3").filter((a) => a.kind === "emne").map((a) => a.level), [0]);
  // The level texts say so: the topic is named at level 0 and nowhere above it.
  assert.match(CRITERIA.R4.levels[0], /EMNE/);
  assert.equal(/handler om/.test(CRITERIA.R4.levels[1] + CRITERIA.R4.levels[2]), false);
  assert.match(TRANSFER_CRITERIA.T3.levels[0], /om vaskemaskiner/);
  assert.equal(TRANSFER_CRITERIA.T3.levels[1].includes("om vaskemaskiner"), false);
  // The flag for R4 = 1 no longer calls a topic answer imprecise.
  assert.equal(flags({ valg: 4, begrundelse: 2, part3BothRight: true }, { R1: 1, R3: 2, R4: 1 }).some((f) => /emne/.test(f)), false);
});

test("purpose: a vague intention gives 1, the sender's intention (named alone or explained) 2 — the same standard in A, B and C", () => {
  for (const form of ["A", "B", "C"]) {
    const kinds = new Set(anchors("R4", form).map((a) => a.kind));
    for (const k of ["emne", "generisk", "modtager", "noegleord", "upraecist", "hensigt", "praecist", "synonym"]) assert.ok(kinds.has(k), `${form}: no ${k} anchor`);
    for (const a of anchors("R4", form)) {
      const want = { emne: 0, generisk: 0, modtager: 0, noegleord: 0, intet: 0, upraecist: 1, hensigt: 2, praecist: 2, synonym: 2 }[a.kind];
      assert.equal(a.level, want, `${form}: »${a.answer}« (${a.kind})`);
    }
    // Every accepted answer in the key is a full purpose (level 2) — the key and the rubric agree.
    for (const k of keyOf(form)) assert.equal(CALIBRATION.find((a) => a.form === form && a.criterion === "R4" && a.answer === k)?.level, 2, `${form} key »${k}«`);
  }
  // v1.5 (S2 = 2 in all tests): the intention named alone is 2 in every test — the same answer type, the same score.
  for (const [form, answer] of [["A", "penge"], ["B", "at advare"], ["B", "at begrænse smitten"], ["C", "penge og korn"]]) assert.equal(CALIBRATION.find((a) => a.form === form && a.answer === answer).level, 2, `${form} »${answer}«`);
  for (const [form, answer] of [["A", "hjælp"], ["B", "råd"], ["C", "hjælp"]]) assert.equal(CALIBRATION.find((a) => a.form === form && a.answer === answer).level, 1, `${form} »${answer}«`);
});

test("not a word list: other words with the right meaning score 2, the key's words with a wrong meaning score 0 (P4)", () => {
  for (const form of ["A", "B", "C"]) {
    for (const a of anchors("R4", form).filter((x) => x.kind === "synonym")) {
      assert.equal(a.level, 2);
      assert.equal(overlapWithKey(a.answer, form), 0, `${form}: synonym »${a.answer}« shares words with the key`);
    }
    for (const a of anchors("R4", form).filter((x) => x.kind === "noegleord")) {
      assert.equal(a.level, 0);
      assert.ok(overlapWithKey(a.answer, form) >= 2, `${form}: trap »${a.answer}« should reuse the key's words`);
    }
  }
  // A keyword scorer (2 if two key words, 1 if one, else 0) would disagree with the anchors.
  const r4 = CALIBRATION.filter((a) => a.criterion === "R4");
  const kw = (a) => Math.min(2, overlapWithKey(a.answer, a.form));
  assert.ok(r4.filter((a) => kw(a) !== a.level).length >= 6);
});

test("generic answers and bare conclusions earn nothing for understanding (P3, P5); a wrong conclusion with relevant reasoning gets 1 (S4)", () => {
  for (const a of CALIBRATION.filter((x) => x.kind === "generisk")) assert.equal(a.level, a.criterion === "R4" ? 0 : 1, `${a.criterion} »${a.answer}«`);
  for (const a of CALIBRATION.filter((x) => x.kind === "konklusion")) assert.equal(a.level, 0, `${a.criterion} »${a.answer}«`);
  for (const a of CALIBRATION.filter((x) => x.kind === "forkert-relevant")) assert.equal(a.level, 1, `${a.criterion} »${a.answer}«`);
  // Naming the sender, the source type, or copying the table is never full credit (P2).
  for (const a of CALIBRATION.filter((x) => ["kildetype", "navn", "afskrift"].includes(x.kind))) assert.ok(a.level <= 1, `${a.criterion} »${a.answer}«`);
  // Every reasoning criterion has a right and well-reasoned answer at 2 and one in other words at 2 (B1, B2).
  for (const c of ["B1", "B2"]) for (const k of ["praecist", "synonym"]) assert.equal(anchors(c, "A").find((a) => a.kind === k)?.level, 2, `${c} ${k}`);
});

test("every anchor is in range and names an existing rule; the S2 examples and the anchors give the same scores", () => {
  const rules = new Set([...SCORING_RULES.map((r) => r.id), ...Object.keys(CRITERIA), ...Object.keys(TRANSFER_CRITERIA)]);
  for (const a of CALIBRATION) {
    assert.ok(Number.isInteger(a.level) && a.level >= 0 && a.level <= MAX[a.criterion], `${a.criterion} »${a.answer}«`);
    assert.ok(rules.has(a.rule), `unknown rule ${a.rule}`);
    assert.ok(["A", "B", "C", "T"].includes(a.form));
  }
  const keys = new Set(CALIBRATION.map((a) => `${a.form}|${a.criterion}|${a.answer}`));
  assert.equal(keys.size, CALIBRATION.length, "duplicate anchor");
  // S2's examples are written as "0: »…«, »…« · 1: … · 2: …" per test; each quoted answer is an anchor at that level.
  const s2 = SCORING_RULES.find((r) => r.id === "S2");
  let checked = 0;
  for (const [form, text] of Object.entries(s2.examples)) {
    for (const part of text.split(" · ")) {
      const level = Number(part.slice(0, 1));
      for (const m of part.matchAll(/»([^«]+)«/g)) {
        const a = CALIBRATION.find((x) => x.form === form && x.criterion === "R4" && x.answer === m[1]);
        assert.ok(a, `S2 ${form}: »${m[1]}« is not an anchor`);
        assert.equal(a.level, level, `S2 ${form}: »${m[1]}«`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 20);
});

test("the decisions hold: S2 = 2 (intention named alone, v1.5), S3 (topic match at most 1), S4, S6, S7, T1", () => {
  assert.equal(CALIBRATION.find((a) => a.form === "A" && a.answer === "penge").level, 2);
  assert.equal(CALIBRATION.find((a) => a.criterion === "B2" && a.kind === "emne").level, 1);
  assert.equal(CALIBRATION.find((a) => a.criterion === "B1" && a.kind === "forkert-relevant").rule, "S4");
  assert.match(SCORING_RULES.find((r) => r.id === "S6").rule, /kun tæller én gang/);
  assert.match(SCORING_RULES.find((r) => r.id === "S7").rule, /MUNDTLIG_OPFOELGNING/);
  assert.equal(CALIBRATION.find((a) => a.criterion === "T1" && a.answer === "Nej.").level, 0);
  // S7: the follow-up uses the ordinary levels — with S2 = 2, »at begrænse smitten« (B) is R4 2, »hjælp« (C) is 1.
  assert.match(SCORING_RULES.find((r) => r.id === "S7").examples.B, /R4 2/);
  assert.match(SCORING_RULES.find((r) => r.id === "S7").examples.C, /R4 1/);
  // P1 says how it differs from S3, so the two rules are not read as a conflict.
  assert.match(SCORING_RULES.find((r) => r.id === "P1").rule, /S3/);
});

// ── Godkendelsesflow ────────────────────────────────────────────────────────────────────────────────────────
test("all five parts changed since the approved v1.2; the v1.2 approval is kept unchanged and approves nothing now", () => {
  assert.equal(VERSION, "kildekritik-maaling-v1.5");
  assert.equal(RUBRIC_VERSION, "kildekritik-rubrik-v1.5");
  assert.equal(createHash("sha256").update(readFileSync(STORED)).digest("hex"), ORIGINAL_SHA);
  assert.deepEqual(integrityProblems(), []);
  const reg = readRegister(), now = contentFingerprints();
  for (const id of ITEMS) {
    assert.notEqual(reg.afgoerelser[id].fingeraftryk, now[id], id);
  }
  assert.deepEqual(Object.values(approvalStatus({ reg })).map((s) => s.status), ITEMS.map(() => PENDING));
  // The old file cannot approve the new content: every decision in it is stale.
  const v = validateReviewExport(readFileSync(STORED));
  assert.deepEqual(v.problems, []);
  assert.deepEqual(v.stale, [...ITEMS]);
  assert.ok(v.notes.some((n) => /kildekritik-maaling-v1\.2/.test(n) && /v1\.5/.test(n)));
});

test("fingerprints are per part: changing one test changes only its own fingerprint, and the rubric covers the anchors", () => {
  const base = contentFingerprints();
  const B = JSON.parse(JSON.stringify(FORMS.B));
  B.part2.claims[0].text += " ";
  const after = contentFingerprints({ forms: { ...FORMS, B } });
  for (const id of ITEMS) (id === "B" ? assert.notEqual : assert.equal)(after[id], base[id], id);
  assert.equal(contentFingerprints({ transfer: TRANSFER }).T, base.T);
  // The anchors are part of the rubric's fingerprint (checked in the source, since CALIBRATION is frozen).
  assert.match(readFileSync(new URL("../../tools/laerligverse/assessment-review.mjs", import.meta.url), "utf8"), /MUNDTLIG_OPFOELGNING, CALIBRATION \}\)\)/);
});

test("an export is version-bound and valid; a missing or short teacher name and a wrong date are reported clearly", () => {
  const fps = contentFingerprints();
  const make = (laerer, dato) => JSON.stringify({
    format: FORMAT, version: VERSION, rubrikversion: RUBRIC_VERSION, laerer, dato, indhold: fps,
    proever: Object.fromEntries(ITEMS.map((id) => [id, { status: "godkendt" }])), tvetydigheder: {}, rubrikbeslutninger: {}, lp13: {},
  });
  // Undecided ambiguities, rubric decisions and LP-13 are "ikke_besluttet"; leaving them out is a validation problem.
  const full = (laerer, dato) => {
    const d = JSON.parse(make(laerer, dato));
    for (const id of ["S2", "S3", "S4", "S6", "S7"]) d.tvetydigheder[id] = { valg: "ikke_besluttet" };
    d.rubrikbeslutninger.T1 = { valg: "ikke_besluttet" };
    for (const id of ["LP13-1", "LP13-2", "LP13-3", "LP13-4", "LP13-5", "genbesoeg", "forsinket", "LP13-7", "pilot"]) d.lp13[id] = { valg: "ikke_besluttet" };
    return JSON.stringify(d);
  };
  const ok = validateReviewExport(full("Christopher Møller", "05-11-2026"));
  assert.deepEqual(ok, { problems: [], stale: [], notes: [] });
  assert.ok(validateReviewExport(full("chri", "05-11-2026")).notes.some((n) => /full name/.test(n)));
  assert.ok(validateReviewExport(full("Christopher Møller", "05-11/2026")).notes.some((n) => /DD-MM/.test(n)));
  assert.ok(validateReviewExport(full("", "")).problems.includes("decisions without a teacher name or date"));
  // The page refuses to save without a full name and a DD-MM-ÅÅÅÅ date, and writes the rubric version into the file.
  const page = readFileSync(PAGE, "utf8");
  assert.match(page, /Skriv dit fulde navn \(fornavn og efternavn\)/);
  assert.match(page, /rubrikversion: RUBRIC_VERSION/);
});

test("the page states the version, what changed and why, what needs approval, what is still to decide, and readiness", () => {
  const page = readFileSync(PAGE, "utf8");
  assert.match(page, /id="runde"/);
  assert.ok(page.includes(`Denne gennemgang: ${VERSION}`));
  // v1.5: A and T keep the v1.4 approval (unchanged); the rubric, B and C await a renewed one.
  for (const id of ["A", "T"]) assert.match(page, new RegExp(`data-round="${id}"><strong>Godkendt 05-11-2026 \\(v1\\.4, uændret siden\\)`));
  for (const id of ["B", "C", "rubrik"]) assert.match(page, new RegExp(`data-round="${id}"><strong>Afventer fornyet lærergodkendelse`));
  assert.match(page, /Klar til godkendelse:/);
  assert.match(page, /Hvad det betyder fagligt/);
  assert.ok(ROUND.open.some((t) => /rubrikken/.test(t) && /B og C/.test(t)));
  // The rubric's change since the v1.4 approval is shown word for word.
  assert.match(page, /id="rubrik-siden-v14"/);
  assert.match(page, /id="ankersvar"/);
  for (const a of CALIBRATION) assert.ok(page.includes(`»${a.answer.replace(/&/g, "&amp;")}«`), a.answer);
  // No server needed: one self-contained file, no external resources.
  assert.equal(/<script[^>]+src=|<link[^>]+href=|https?:\/\/[^"' ]+\.(js|css)/.test(page), false);
});

// ── Gætteri og genkendelse ──────────────────────────────────────────────────────────────────────────────────
test("answer position: every row of the source table is right exactly twice; no fixed row beats chance (G11)", () => {
  assert.deepEqual(answerPositions(FORMS, TRANSFER), [2, 2, 2, 2]);
  const part3 = audit(FORMS, TRANSFER).part3;
  for (const id of ["foerste-kilde", "anden-kilde", "tredje-kilde", "sidste-kilde"]) {
    const r = part3.find((x) => x.id === id);
    assert.ok(r, id);
    assert.equal(r.right, 2, id);
    assert.ok(CHOICE_STRATEGIES.some((s) => s.id === id));
  }
  // No rule-based choice strategy beats guessing (25 %), except the known one: the contemporary personal source
  // (time is part of the competence; it can only answer the personal claim, so it stops at half).
  for (const r of part3) {
    if (r.id === "samtidig-personlig") { assert.equal(r.right, 4); continue; }
    assert.ok(r.right / r.of <= 0.25, `${r.id}: ${r.right}/${r.of}`);
  }
});

test("the posttest, the delayed test and the transfer test share no phrase with the game (no recognised explanation)", () => {
  const strs = (o, out = []) => { if (typeof o === "string") out.push(o); else if (o && typeof o === "object") for (const v of Object.values(o)) strs(v, out); return out; };
  const game = strs(ARCHIVE_ITEMS);
  assert.ok(game.length > 20);
  for (const f of [FORMS.B, FORMS.C, TRANSFER]) assert.deepEqual(sharedPhrases(game, pupilTexts(f), 4), [], f.id);
});

// ── Historiske påstande ─────────────────────────────────────────────────────────────────────────────────────
test("the three open historical points are checked with sources and a decision category (FC-5, FC-6, FC-7)", () => {
  const byId = Object.fromEntries(FACT_CHECK.map((c) => [c.id, c]));
  assert.equal(byId["FC-5"].status, "A");
  assert.equal(byId["FC-6"].status, "B");
  assert.equal(byId["FC-7"].status, "B");
  for (const id of ["FC-5", "FC-6", "FC-7"]) {
    assert.ok(byId[id].sources.length >= 1, id);
    assert.equal(byId[id].changed, false, id);
  }
  assert.match(byId["FC-5"].sources[0], /Københavns Kommune \(Forvaltningshistorie\)/);
  assert.match(byId["FC-7"].sources.join(" "), /§ 21/);
  // The teacher's frame says the part 3 claims are claims to investigate, not facts of the test.
  assert.match(FORMS.A.frameToCheck, /FC-5/);
  assert.match(FORMS.A.frameToCheck, /påstand, eleven skal finde en kilde til at undersøge/);
  assert.match(FORMS.B.frameToCheck, /FC-7/);
  // The pupil text is unchanged on these points.
  assert.match(FORMS.A.source.text, /^Til Magistraten\./);
  assert.ok(FORMS.A.part3.claims.some((c) => c.text === "Eleverne skulle i 1955 rejse sig, når læreren kom ind i klassen."));
  assert.ok(FORMS.B.part3.claims.some((c) => c.text === "Arbejderne skulle i 1910 møde på fabrikken klokken seks om morgenen."));
});
