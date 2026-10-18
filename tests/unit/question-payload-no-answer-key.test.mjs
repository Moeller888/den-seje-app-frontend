// Security regression: the question payload the browser receives BEFORE answering carries no answer key
// (audit finding E1, 2026-10-16). Offline — the real DTO module the Edge Function runs, plus a source
// check of get-next-question; no network, no Supabase.
//
// THE CONTRACT (supabase/functions/_shared/question-dto.ts)
//   content   exactly the whitelisted display keys: question, options (MC only, strings), type, force_text
//   metadata  only the whitelisted pedagogical tags, or null
// Tested per format — MC, number, short text and "stav til" — with the key fields the live bank holds
// (correct, accepted_answers, facit, tolerance, criteria, review_text) and with keys nested deeper or
// under names nobody has used yet: the payload is BUILT from a whitelist, so an unknown key never
// leaves. The deep scanner has a NEGATIVE CONTROL: it must flag the payload the function used to send.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  toPublicQuestion, PUBLIC_CONTENT_KEYS, PUBLIC_METADATA_KEYS,
} from "../../supabase/functions/_shared/question-dto.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const INDEX_CODE = stripComments(readFileSync(join(REPO, "supabase/functions/get-next-question/index.ts"), "utf8"));

// Field names that carry, or describe, the answer — at any depth.
const KEY_FIELD = /^(correct|correct_answer|correctanswer|accepted_answers?|answers?|answer_key|facit|solutions?|key|tolerance|criteria|review_text|explanation|is_correct|right)$/i;

function keyFieldPaths(value, path = "$") {
  const found = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...keyFieldPaths(v, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (KEY_FIELD.test(k)) found.push(`${path}.${k}`);
      found.push(...keyFieldPaths(v, `${path}.${k}`));
    }
  }
  return found;
}

// Every value that would give the answer away, so it can be searched for anywhere in the payload.
function secretValues(content) {
  const out = new Set();
  const add = (v) => { if (typeof v === "string" && v.trim()) out.add(v.trim()); if (typeof v === "number") out.add(String(v)); };
  // (tolerance/criteria are caught by name above; a value like 0 is too short to search for.)
  add(content.correct); add(content.facit);
  for (const a of content.accepted_answers ?? []) add(a);
  if (typeof content.review_text === "string") add(content.review_text);
  return [...out];
}

const META = {
  difficulty_type: "conceptual", cognitive_skill: "recall", challenge_role: "challenge",
  insight_type: "reframing", concepts: ["krig"], domain: "world_war_2",
  misconception_type: "causal_inversion", hidden_answer: "Polen",
};

const SAMPLES = {
  mc: {
    format: "mc",
    content: { question: "Hvilket land blev angrebet 1. september 1939?", options: ["Polen", "Norge", "Danmark", "Frankrig"],
      correct: "Polen", accepted_answers: ["Polen"], review_text: "Tyskland angreb Polen.", type: "mc",
      extra: { correct: "Polen", deeper: [{ answer: "Polen" }] }, solution: "Polen" },
  },
  number: {
    format: "number",
    content: { question: "Hvilket år sluttede 2. verdenskrig?", correct: 1945, facit: "1945", tolerance: 0,
      criteria: { exact: 1945 }, accepted_answers: ["1945"] },
  },
  short_text: {
    format: "text",
    content: { question: "Hvilket land besatte Tyskland 9. april 1940 ud over Danmark?", correct: "Norge",
      accepted_answers: ["Norge", "norge"], review_text: "Norge blev angrebet samme dag." },
  },
  stav_til: {
    // The live "stav til" rows (20261011094747): answer_format text / short.
    format: "text",
    content: { question: "Stav til: landet, som Tyskland angreb 1. september 1939.", correct: "Polen",
      accepted_answers: ["Polen"], review_text: "Det hedder Polen." },
  },
};

for (const [name, { format, content }] of Object.entries(SAMPLES)) {
  test(`${name}: the pre-answer payload holds only whitelisted display keys and no answer key`, () => {
    const pub = toPublicQuestion(content, format, META);
    // Whitelist, not blacklist: exactly the allowed keys, nothing else.
    for (const k of Object.keys(pub.content)) assert.ok(PUBLIC_CONTENT_KEYS.includes(k), `content.${k} is not public`);
    for (const k of Object.keys(pub.metadata ?? {})) assert.ok(PUBLIC_METADATA_KEYS.includes(k), `metadata.${k} is not public`);
    assert.deepEqual(keyFieldPaths(pub), [], "no key field at any depth");
    assert.equal(pub.content.question, content.question);
    // The answer value must not appear anywhere — except as one visible MC option among the others.
    const json = JSON.stringify(pub.metadata) + JSON.stringify({ ...pub.content, options: undefined });
    for (const secret of secretValues(content)) {
      assert.equal(json.includes(secret), false, `${name}: "${secret.slice(0, 12)}…" leaks outside the options`);
    }
    if (format === "mc") assert.deepEqual(pub.content.options, content.options);
    else assert.equal("options" in pub.content, false, "only MC sends options");
  });
}

test("metadata keeps only the pedagogical tags — never misconception_type or unknown keys", () => {
  const pub = toPublicQuestion(SAMPLES.mc.content, "mc", META);
  assert.deepEqual(Object.keys(pub.metadata).sort(), [...PUBLIC_METADATA_KEYS].sort());
  assert.equal(toPublicQuestion(SAMPLES.mc.content, "mc", null).metadata, null);
  assert.equal(toPublicQuestion(SAMPLES.mc.content, "mc", { hidden_answer: "Polen" }).metadata, null);
});

test("content the client could not render is rejected, never passed through", () => {
  assert.throws(() => toPublicQuestion(null, "mc", null), /Invalid content/);
  assert.throws(() => toPublicQuestion({ question: "  " }, "text", null), /Missing question text/);
  assert.throws(() => toPublicQuestion({ question: "Q", options: ["a"] }, "mc", null), /valid options/);
  // An option that is not plain text could carry a marker of the right answer.
  assert.throws(() => toPublicQuestion({ question: "Q", options: [{ text: "a", correct: true }, "b"] }, "mc", null),
    /non-text option/);
  assert.deepEqual(toPublicQuestion({ question: "Q", force_text: true, correct: "x" }, "text", null).content,
    { question: "Q", force_text: true });
});

test("negative control: the scanner flags the payload get-next-question used to send", () => {
  // The old normalizeContent output: { question, options, correct, review_text }.
  const old = { content: { question: "Q", options: ["Polen", "Norge"], correct: "Polen", review_text: "Polen." } };
  assert.deepEqual(keyFieldPaths(old), ["$.content.correct", "$.content.review_text"]);
  assert.deepEqual(keyFieldPaths({ content: { a: [{ b: { accepted_answers: ["x"] } }] } }),
    ["$.content.a[0].b.accepted_answers"]);
});

// ── get-next-question wiring (source level) ─────────────────────────────────────────────────────
test("every question response is built from toPublicQuestion — never from normalizeContent or raw content", () => {
  assert.match(INDEX_CODE, /import \{ toPublicQuestion \} from "\.\.\/_shared\/question-dto\.ts";/);
  const responses = [...INDEX_CODE.matchAll(/JSON\.stringify\(\{\s*question_instance_id:[\s\S]*?\}\)/g)].map((m) => m[0]);
  assert.equal(responses.length, 3, "due, repeat and new-question responses");
  for (const r of responses) {
    assert.match(r, /content: (inserted\.)?pub\.content,/, "content comes from the public DTO");
    assert.match(r, /metadata: (inserted\.)?pub\.metadata,/, "metadata comes from the public DTO");
    assert.equal(/normalized|q\.content|rq\.content|\.metadata \?\?/.test(r), false, "no raw or key-bearing source");
  }
  // normalizeContent (which extracts the key) is used only for the server-side insert.
  assert.equal((INDEX_CODE.match(/normalizeContent\(/g) ?? []).length, 2, "definition + the one insert-side use");
  assert.match(INDEX_CODE, /correctAnswer: normalized\.correct,/);
});

test("the key-bearing reads run on the backend client, scoped to the verified student", () => {
  // The due and repeat reads embed questions(content) — the key — so they must not depend on the
  // pupil being able to read it, and must be scoped to student_id.
  const reads = [...INDEX_CODE.matchAll(/await admin\(\)\s*\.from\("question_instances"\)[\s\S]*?;/g)].map((m) => m[0]);
  assert.equal(reads.length, 2);
  for (const r of reads) assert.match(r, /\.eq\("student_id", student_id\)/);
  assert.equal(/supabase\s*\.from\("question_instances"\)/.test(INDEX_CODE), false,
    "no question_instances read on the user client");
  assert.equal(/supabase\.rpc\(\s*"(get_unserved_questions|request_repeat_question)/.test(INDEX_CODE), false,
    "the key-bearing RPCs are never called on the user client");
});
