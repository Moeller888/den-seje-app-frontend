// Answer key guard for multiple-choice questions (tools/question-quality/answer-key.mjs).
//
// A pupil clicking an option is scored by process_question_attempt after lower() and stripping
// everything outside a-z0-9. If no option survives that normalisation equal to the stored correct
// answer, the question can never be answered correctly. Two active questions were in that state
// until migration 20261022120000.
//
// What this guards, and what it cannot:
//   - every question migration after LEGACY_UNTIL must be gradable;
//   - the legacy migrations contain exactly the known non-gradable questions, and each one is
//     resolved — superseded by a later migration with a gradable key, or fixed by 20261022120000;
//   - the normalisation mirrored here is the one in the newest process_question_attempt.
// It reads migration files, not the live database: which rows are active is production state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { gradingKey, isGradable } from "../../tools/question-quality/answer-key.mjs";
import { extractMcQuestions } from "../../tools/question-quality/length-cue.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "supabase", "migrations");
const FIX = "20261022120000_fix_mc_correct_answer_not_in_options.sql";

// Same cut as mc-length-cue.test.mjs: newest migration on main when the guards were introduced.
const LEGACY_UNTIL = "20261019150000";

const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
const read = (f) => readFileSync(join(MIGRATIONS, f), "utf8");
const all = files.map((f) => ({ file: f, questions: extractMcQuestions(read(f)) }));
const PATCHES = JSON.parse(read(FIX).match(/\$patches\$([\s\S]*?)\$patches\$/)[1]);

function nonGradable(entries) {
  const out = [];
  for (const { file, questions } of entries) {
    for (const q of questions) {
      if (!isGradable(q.options, q.correct)) out.push({ file, q });
    }
  }
  return out;
}

// Every non-gradable question in the legacy migrations, and how it is resolved.
const KNOWN = [
  { file: "20260529220626_industrialisation_content_sprint.sql", starts: "Hvad har industrialiseringens uligheder", fixedBy: "57c0e3db-090d-40fd-9a9b-a5609590f09a" },
  { file: "20260601050000_cold_war_band5.sql", starts: "Hvad viser den kolde krigs historiske forløb", supersededBy: "20260601095134_cold_war_band5.sql" },
  { file: "20260602192127_prehistoric_denmark_band5.sql", starts: "Gordon Childes begreb 'den neolitiske revolution'", fixedBy: "b66e1947-8217-4942-9893-aef3f256b488" },
  { file: "20260603030000_prehistoric_denmark_band3_reinforcement.sql", starts: "Solvognen fra Trundholm", supersededBy: "20260603041109_prehistoric_denmark_band3_reinforcement.sql" },
];

test("gradingKey mirrors the server: lower-case, then keep only a-z0-9", () => {
  assert.equal(gradingKey("  Velfærdsstat! "), "velfrdsstat");
  assert.equal(gradingKey("Århus, 1849."), "rhus1849");
  assert.equal(gradingKey("tok"), "tok");
  assert.notEqual(gradingKey("velfærdstat"), gradingKey("velfærdsstat"));
  assert.notEqual(gradingKey("tok"), gradingKey("tog"));
  assert.throws(() => gradingKey(null), /string/);
});

test("isGradable: one character off is not gradable; spacing and punctuation differences are", () => {
  assert.equal(isGradable(["den fremtidige velfærdsstat", "noget andet"], "den fremtidige velfærdstat"), false);
  assert.equal(isGradable(["svække Tyskland", "noget andet"], "svækketyskland"), true);
  assert.equal(isGradable(["Polen", "Norge"], "polen."), true);
});

test("isGradable throws on malformed questions instead of passing", () => {
  assert.throws(() => isGradable(null, "x"), /options/);
  assert.throws(() => isGradable(["a"], "a"), /options/);
  assert.throws(() => isGradable(["a", 1], "a"), /string/);
  assert.throws(() => isGradable(["a", "b"], ""), /correct/);
  assert.throws(() => isGradable(["a", "b"], undefined), /correct/);
});

test("the mirrored normalisation is the one in the newest process_question_attempt", () => {
  // CREATE only: REVOKE/GRANT ... ON FUNCTION also name it but do not redefine the comparison.
  const defining = files.filter((f) => /CREATE OR REPLACE FUNCTION public\.process_question_attempt\s*\(/.test(read(f)));
  assert.ok(defining.length > 0, "no migration defines process_question_attempt");
  const sql = read(defining.at(-1));
  assert.ok(
    sql.includes("trim(regexp_replace(lower(p_answer),                   '[^a-z0-9]', '', 'g'))"),
    `${defining.at(-1)}: pupil-answer normalisation changed — update gradingKey() and this test`,
  );
  assert.ok(
    sql.includes("trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'))"),
    `${defining.at(-1)}: answer-key normalisation changed — update gradingKey() and this test`,
  );
});

test("no question migration after LEGACY_UNTIL has a correct answer missing from its options", () => {
  const bad = nonGradable(all.filter(({ file }) => file.slice(0, 14) > LEGACY_UNTIL));
  assert.deepEqual(bad.map(({ file, q }) => `${file}: "${q.question}"`), []);
});

test("the legacy migrations hold exactly the known non-gradable questions", () => {
  const found = nonGradable(all.filter(({ file }) => file.slice(0, 14) <= LEGACY_UNTIL));
  const unknown = found.filter(({ file, q }) => !KNOWN.some((k) => k.file === file && q.question.startsWith(k.starts)));
  assert.deepEqual(unknown.map(({ file, q }) => `${file}: "${q.question}"`), [], "new non-gradable legacy question");
  for (const k of KNOWN) {
    const n = found.filter(({ file, q }) => file === k.file && q.question.startsWith(k.starts)).length;
    assert.equal(n, 1, `${k.file} "${k.starts}": expected exactly one non-gradable match, found ${n}`);
  }
  assert.equal(found.length, KNOWN.length);
});

test("each known legacy error is resolved: superseded by a gradable later version, or fixed by the migration", () => {
  for (const k of KNOWN) {
    const legacy = all.find((e) => e.file === k.file).questions.find((q) => q.question.startsWith(k.starts));
    assert.ok(legacy, `${k.file}: question not found`);
    if (k.supersededBy) {
      assert.ok(k.supersededBy > k.file, `${k.supersededBy} is not later than ${k.file}`);
      const later = all.find((e) => e.file === k.supersededBy).questions.find((q) => q.question === legacy.question);
      assert.ok(later, `${k.supersededBy}: same question not found`);
      assert.equal(isGradable(later.options, later.correct), true, `${k.supersededBy}: still not gradable`);
    } else {
      const patch = PATCHES.find((p) => p.id === k.fixedBy);
      assert.ok(patch, `${FIX}: no patch for ${k.fixedBy}`);
      assert.equal(gradingKey(patch.before), gradingKey(legacy.correct), `${k.fixedBy}: patch does not start from the broken key`);
      assert.ok(legacy.options.includes(patch.after), `${k.fixedBy}: new key is not verbatim one of the options`);
      assert.equal(isGradable(legacy.options, patch.after), true);
    }
  }
});

test("the migration fixes exactly the two known questions, each to its first option", () => {
  assert.deepEqual(PATCHES.map((p) => p.id).sort(), KNOWN.filter((k) => k.fixedBy).map((k) => k.fixedBy).sort());
  for (const p of PATCHES) {
    assert.notEqual(p.before, p.after);
    assert.equal(isGradable([p.after, "x y"], p.before), false, `${p.id}: before was already gradable against after`);
  }
});

test("the three errors already fixed in production: two are caught; Versailles was always gradable", () => {
  const caught = nonGradable(all).map(({ file, q }) => `${file} | ${q.question}`);
  assert.ok(caught.some((s) => s.startsWith("20260601050000_cold_war_band5.sql | Hvad viser den kolde krigs historiske forløb")));
  assert.ok(caught.some((s) => s.startsWith("20260603030000_prehistoric_denmark_band3_reinforcement.sql | Solvognen fra Trundholm")));
  // Its key only lacked a space ("svækketyskland"); the server strips spaces, so pupils were scored
  // correctly. It was a text mismatch, never a grading failure.
  const versailles = all
    .find((e) => e.file === "20260602000000_world_war_1_band5.sql")
    .questions.find((q) => q.question.startsWith("Var Versailles-traktaten af 1919"));
  assert.ok(versailles);
  assert.equal(versailles.options.some((o) => o.trim() === versailles.correct.trim()), false);
  assert.equal(isGradable(versailles.options, versailles.correct), true);
});
