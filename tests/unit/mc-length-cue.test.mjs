// Length cue guard for multiple-choice questions (tools/question-quality/length-cue.mjs).
//
// Every question migration NEWER than LEGACY_UNTIL must be free of length cues: the correct option
// may not be clearly longer than every wrong option. Migrations up to LEGACY_UNTIL hold the
// existing bank, which is known to fail (measured 2026-10-22); rewriting it is a separate content
// task, so this test only stops the problem from growing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MAX_RATIO,
  MIN_GAP_CHARS,
  findLengthCue,
  extractMcQuestions,
} from "../../tools/question-quality/length-cue.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "supabase", "migrations");

// Newest migration on main when the guard was introduced. Do not move this forward to make a
// failing migration pass — fix the question instead.
const LEGACY_UNTIL = "20261019150000";

const OPTIONS_KEY = /"(options|o)"\s*:\s*\[/;

function readMigration(name) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

function guardedMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      const m = /^(\d{14})_/.exec(f);
      return m !== null && m[1] > LEGACY_UNTIL;
    })
    .sort();
}

test("rule constants are the agreed thresholds", () => {
  assert.equal(MAX_RATIO, 1.25);
  assert.equal(MIN_GAP_CHARS, 10);
});

test("a full sentence against three short claims is a length cue", () => {
  const cue = findLengthCue(
    [
      "En fredsaftale fra 1919 der pålagde Tyskland store krigsofre og ydmygelser",
      "En militærpagt mellem England og Frankrig",
      "En handelsaftale mod Tyskland",
      "En europæisk grundlov",
    ],
    "En fredsaftale fra 1919 der pålagde Tyskland store krigsofre og ydmygelser",
  );
  assert.ok(cue !== null);
  assert.equal(cue.longestWrong, [..."En militærpagt mellem England og Frankrig"].length);
  assert.ok(cue.gap >= MIN_GAP_CHARS);
  assert.ok(cue.ratio > MAX_RATIO);
});

test("balanced options pass", () => {
  assert.equal(
    findLengthCue(
      ["En fredsaftale der straffede Tyskland", "En militærpagt mod Tyskland i 1930'erne", "En handelsaftale der isolerede Tyskland", "En grundlov der afskaffede kejserne"],
      "En fredsaftale der straffede Tyskland",
    ),
    null,
  );
});

test("short one-word answers are never flagged, whatever the ratio", () => {
  assert.equal(findLengthCue(["been", "be", "was", "being"], "being"), null);
  assert.equal(findLengthCue(["Polen", "Norge", "Ur"], "Polen"), null);
});

test("ratio alone or gap alone is not enough", () => {
  // gap 10, ratio 1.2 -> passes
  assert.equal(findLengthCue(["a".repeat(60), "b".repeat(50)], "a".repeat(60)), null);
  // ratio 3, gap 8 -> passes
  assert.equal(findLengthCue(["a".repeat(12), "b".repeat(4)], "a".repeat(12)), null);
  // ratio 1.26, gap 13 -> flagged
  assert.ok(findLengthCue(["a".repeat(63), "b".repeat(50)], "a".repeat(63)) !== null);
});

test("the correct answer is compared trimmed and counted in characters, not bytes", () => {
  assert.equal(findLengthCue(["  ææææææææææææ ", "øøøøøøøøøøøø"], "ææææææææææææ"), null);
});

test("malformed questions throw instead of passing", () => {
  assert.throws(() => findLengthCue(null, "x"), /options/);
  assert.throws(() => findLengthCue(["a"], "a"), /options/);
  assert.throws(() => findLengthCue(["a", 2], "a"), /string/);
  assert.throws(() => findLengthCue(["a", "b"], ""), /correct/);
  assert.throws(() => findLengthCue(["a", "b"], null), /correct/);
  assert.throws(() => findLengthCue(["a", "b"], "c"), /not among the options/);
  assert.throws(() => findLengthCue(["a", "a"], "a"), /no wrong options/);
});

test("extractor reads the long key shape ({question, options, correct})", () => {
  const sql = `INSERT INTO public.questions (content) VALUES ($c1q${JSON.stringify({
    question: "Hvad?",
    options: ["ja", "nej {ikke}"],
    correct: "ja",
    review_text: "Fordi \"ja\".",
  })}$c1q$::jsonb);`;
  const qs = extractMcQuestions(sql);
  assert.equal(qs.length, 1);
  assert.deepEqual(qs[0], { question: "Hvad?", options: ["ja", "nej {ikke}"], correct: "ja" });
});

test("extractor reads the short key shape ({q, o, a}) inside a JSON array", () => {
  const sql = `FROM jsonb_array_elements($$[
{"g":5,"b":3,"k":"g","q":"Hvilket ord?","o":["done","did"],"a":"done","r":"x"},
{"g":5,"b":3,"k":"g","q":"Og her?","o":["seen","saw"],"a":"seen","r":"y"}
]$$::jsonb) e;`;
  const qs = extractMcQuestions(sql);
  assert.deepEqual(qs.map((q) => q.correct), ["done", "seen"]);
});

test("extractor ignores JSON without options + correct", () => {
  assert.deepEqual(extractMcQuestions(`SELECT '{"question":"Hvad?","correct":"Polen"}'::jsonb, '{"a":1}';`), []);
  assert.throws(() => extractMcQuestions(null), /string/);
});

test("extractor finds every question in real legacy migrations of both shapes", () => {
  // Counts match the files' own header comments.
  assert.equal(extractMcQuestions(readMigration("20261002000006_english_batch2_g5_b34.sql")).length, 166);
  assert.equal(extractMcQuestions(readMigration("20260608150000_world_war_2_grade7_147c.sql")).length, 20);
});

test("LEGACY_UNTIL names a migration that exists", () => {
  const names = readdirSync(MIGRATIONS);
  assert.ok(names.some((f) => f.startsWith(LEGACY_UNTIL + "_")), `no migration ${LEGACY_UNTIL}_*`);
});

test("no question migration after LEGACY_UNTIL gives the answer away by length", () => {
  const problems = [];
  for (const file of guardedMigrations()) {
    const sql = readMigration(file);
    const qs = extractMcQuestions(sql);
    if (qs.length === 0 && OPTIONS_KEY.test(sql)) {
      problems.push(`${file}: has answer options but no question could be read — write content as JSON with options + correct`);
      continue;
    }
    qs.forEach((q, i) => {
      let cue;
      try {
        cue = findLengthCue(q.options, q.correct);
      } catch (err) {
        problems.push(`${file} #${i + 1} "${q.question}": ${err.message}`);
        return;
      }
      if (cue) {
        problems.push(
          `${file} #${i + 1} "${q.question}": correct answer ${cue.correctLen} chars vs longest wrong ${cue.longestWrong} ` +
            `(×${cue.ratio.toFixed(2)}, +${cue.gap}) — shorten it or lengthen the wrong options`,
        );
      }
    });
  }
  assert.deepEqual(problems, []);
});
