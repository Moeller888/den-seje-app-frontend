// The F-07 stimulus fixture of the isolated E2E database (tests/isolated/seed/stimulus-chain-questions.mjs),
// which tests/isolated/f07-stimulus-chain.isolated.spec.mjs drives through the real get-next-question, the
// real quiz and the real process-event (D-362, "vej B" readiness).
//
// What this proves:
//   1. FAITHFUL: the two rows are the D-362 pilot's image and source multiple-choice rows, read from
//      20261108090100_stimulus_pilot_content.sql — content, format, level and every pilot metadata field
//      unchanged. The only differences are the documented ones (active, synthetic, fixture marker,
//      misconception_type).
//   2. SCOPED: learning_objective pilot_d362, grade 7. No server-derived scope of a pupil without that domain
//      contains it (get-next-question/scope.ts), and on the replayed production schema (PGlite) the
//      selection RPCs serve the rows only to a pupil whose domains include pilot_d362.
//   3. SAFE TO SEED: the seed guard admits the rows (synthetic), the statement is INSERT-only, idempotent and
//      deterministic, and seed.mjs seeds it next to the synthetic bank.
//   4. NO LEAK: the browser payload the real toPublicQuestion builds from each row carries the stimulus and
//      no grading field.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as superuser. The browser chain itself
// runs only in the Isolated E2E workflow (local Supabase + Edge Runtime), not here.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql, seedSyntheticQuestions } from "../isolated/seed/seed-guard.mjs";
import { syntheticQuestionsSql } from "../isolated/seed/synthetic-questions.mjs";
import {
  stimulusChainQuestions, stimulusChainQuestionsSql, pilotStimulusRows,
  STIMULUS_CHAIN_OBJECTIVE, STIMULUS_CHAIN_GRADE, STIMULUS_CHAIN_FIXTURE, STIMULUS_PILOT_MIGRATION,
} from "../isolated/seed/stimulus-chain-questions.mjs";
import { deriveQuestionScope, HISTORY_DOMAINS } from "../../supabase/functions/get-next-question/scope.ts";
import { toPublicQuestion } from "../../supabase/functions/_shared/question-dto.ts";
import { checkStimulus } from "../../supabase/functions/_shared/stimulus.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PILOT_SQL = readFileSync(join(ROOT, "supabase", "migrations", STIMULUS_PILOT_MIGRATION), "utf8");
const ROWS = stimulusChainQuestions();
const PILOT_ROWS = pilotStimulusRows();
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "misconception_type", "facit", "tolerance", "criteria", "correct_answer"];

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  return out;
}

// ── 1. faithful ────────────────────────────────────────────────────────────────────────────────────

test("1. two rows: the pilot's first image and first source multiple-choice row, content byte for byte", () => {
  assert.equal(ROWS.length, 2);
  assert.deepEqual(ROWS.map((r) => r.content.stimulus.kind), ["image", "source"]);
  for (const r of ROWS) {
    const pilot = PILOT_ROWS.find((p) => p.content.question === r.content.question);
    assert.ok(pilot, `"${r.content.question}" is a pilot row`);
    assert.equal(JSON.stringify(r.content), JSON.stringify(pilot.content), "content unchanged");
    assert.equal(r.answer_format, "mc");
    assert.equal(r.answer_format, pilot.answer_format);
    assert.equal(r.type, pilot.type);
    assert.equal(r.difficulty_band, pilot.difficulty_band);
    assert.equal(r.difficulty, pilot.difficulty_band, "difficulty as the pilot SQL writes it");
    assert.equal(r.difficulty_level, pilot.difficulty_level);
    const { synthetic, fixture, misconception_type, ...rest } = r.metadata;
    assert.deepEqual(rest, pilot.metadata, "every pilot metadata field kept, nothing else changed");
    assert.equal(synthetic, true);
    assert.equal(fixture, STIMULUS_CHAIN_FIXTURE);
    assert.equal(typeof misconception_type, "string");
    assert.equal(pilot.metadata.misconception_type, undefined, "the pilot row itself has no misconception_type");
    assert.equal(r.is_active, true);
    assert.equal(r.question_type, "auto");
    assert.ok(r.content.options.includes(r.content.correct));
    assert.deepEqual(checkStimulus(r.content.stimulus), { errors: [], warnings: [] });
  }
  assert.equal(ROWS[0].content.stimulus.file, "grundloven-1849-tidslinje.svg");
  assert.ok(readFileSync(join(ROOT, "assets", "stimulus", ROWS[0].content.stimulus.file)).length > 0, "the image is in assets/stimulus/");
});

test("1. the pilot file is the one the pilot content test reads, and a broken pilot file fails loud", () => {
  assert.equal(pilotStimulusRows(PILOT_SQL).length, PILOT_ROWS.length);
  assert.throws(() => pilotStimulusRows("INSERT INTO public.questions VALUES (1);"), /\$pilot\$ JSON array is missing/);
  const noImage = PILOT_SQL.replace(/"kind":"image"/g, '"kind":"audio"');
  assert.throws(() => stimulusChainQuestions(noImage), /no multiple-choice row with a image stimulus/);
});

// ── 2. scoped ──────────────────────────────────────────────────────────────────────────────────────

test("2. scope: pilot_d362, grade 7, and only a pupil with that domain has it in scope", () => {
  for (const r of ROWS) {
    assert.equal(r.learning_objective, STIMULUS_CHAIN_OBJECTIVE);
    assert.equal(r.learning_objective, "pilot_d362");
    assert.equal(r.target_grade, STIMULUS_CHAIN_GRADE);
    assert.equal(r.target_grade, 7);
  }
  assert.equal(HISTORY_DOMAINS.includes("pilot_d362"), false);
  const others = [null, [], ...HISTORY_DOMAINS.map((d) => [d]), [...HISTORY_DOMAINS], ["english"], ["danish"]];
  for (const active_domains of others) {
    for (const subject of ["historie", "engelsk", "dansk", undefined]) {
      assert.equal(deriveQuestionScope({ selected_grade: 7, active_domains }, subject).subjectDomains.includes("pilot_d362"), false,
        `${JSON.stringify(active_domains)} / ${subject}`);
    }
  }
  assert.deepEqual(deriveQuestionScope({ selected_grade: 7, active_domains: ["pilot_d362"] }, "historie").subjectDomains, ["pilot_d362"]);
});

// ── 3. safe to seed ────────────────────────────────────────────────────────────────────────────────

test("3. the statement is INSERT-only, idempotent by construction and deterministic; seed.mjs seeds it", () => {
  const sql = stimulusChainQuestionsSql();
  assert.ok(sql.startsWith("INSERT INTO public.questions") && sql.trimEnd().endsWith("ON CONFLICT DO NOTHING;"));
  assert.equal(stimulusChainQuestionsSql(), sql);
  assert.ok(!/\b(hotmail|@[a-z0-9-]+\.(dk|com))\b/i.test(sql), "no real address");
  const src = readFileSync(new URL("../isolated/seed/stimulus-chain-questions.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+public)\b/i.test(src), "no TRUNCATE / DELETE / UPDATE");
  assert.ok(!/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i.test(src), "no DROP");
  const seed = readFileSync(new URL("../isolated/seed/seed.mjs", import.meta.url), "utf8");
  assert.ok(seed.includes("sql: syntheticQuestionsSql() + stimulusChainQuestionsSql() }"), "seeded behind the same target check");
  assert.throws(() => stimulusChainQuestionsSql([{ ...ROWS[0], difficulty_level: "6000; DROP TABLE x" }]), /expected an integer/);
});

// ── 4. no leak ─────────────────────────────────────────────────────────────────────────────────────

test("4. the browser payload carries the stimulus and no grading field", () => {
  for (const r of ROWS) {
    const pub = toPublicQuestion(r.content, r.answer_format, r.metadata);
    assert.deepEqual(Object.keys(pub.content).sort(), ["options", "question", "stimulus", "type"]);
    const keys = keysDeep(pub);
    for (const k of GRADING_KEYS) assert.equal(keys.has(k), false, `payload carries ${k}`);
    assert.ok(!JSON.stringify(pub).includes(r.content.review_text), "the explanation is not in the payload");
    assert.equal(pub.content.stimulus.kind, r.content.stimulus.kind);
  }
});

// ── 2 + 3 on the replayed production schema (PGlite) ───────────────────────────────────────────────

const TOKEN = "0123456789abcdef0123456789abcdef";
const ENV = Object.freeze({
  ISOLATED_E2E: "1",
  ISOLATED_BASE_URL: "http://127.0.0.1:8788",
  ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
  ISOLATED_DB_TOKEN: TOKEN,
});
const PUPIL = "00000000-0000-4000-8000-0000000f0701";
let db;
let fixtureIds = [];
const q = async (sql, params) => (await db.query(sql, params)).rows;

before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql(TOKEN));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  // Exactly what seed.mjs does, behind the same guard.
  const exec = (s) => db.exec(s);
  await seedSyntheticQuestions({ query: (s) => q(s), exec, env: ENV, sql: syntheticQuestionsSql() + stimulusChainQuestionsSql() });
  fixtureIds = (await q(`SELECT id FROM public.questions WHERE metadata->>'fixture' = '${STIMULUS_CHAIN_FIXTURE}' ORDER BY id`)).map((x) => x.id);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${PUPIL}', 'f07-pupil@e2e.invalid');
                 INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${PUPIL}', 'student', 7);`);
});
after(async () => { await db?.close(); });

const unserved = async (domains) => (await q(
  "SELECT id FROM public.get_unserved_questions_for_student($1::uuid, $2::smallint, $3::text[])", [PUPIL, 7, domains])).map((x) => x.id);

test("PGlite: the replayed schema stores both rows active (constraints accept them); a second seed changes nothing", async () => {
  assert.equal(fixtureIds.length, 2);
  const stored = await q(`SELECT is_active, learning_objective, target_grade, answer_format, content->'stimulus'->>'kind' AS kind
    FROM public.questions WHERE metadata->>'fixture' = '${STIMULUS_CHAIN_FIXTURE}' ORDER BY kind`);
  assert.deepEqual(stored, [
    { is_active: true, learning_objective: "pilot_d362", target_grade: 7, answer_format: "mc", kind: "image" },
    { is_active: true, learning_objective: "pilot_d362", target_grade: 7, answer_format: "mc", kind: "source" },
  ]);
  const before = (await q("SELECT count(*)::int AS n FROM public.questions"))[0].n;
  await seedSyntheticQuestions({ query: (s) => q(s), exec: (s) => db.exec(s), env: ENV, sql: syntheticQuestionsSql() + stimulusChainQuestionsSql() });
  assert.equal((await q("SELECT count(*)::int AS n FROM public.questions"))[0].n, before, "idempotent");
  const pilotOnly = await q("SELECT count(*)::int AS n FROM public.questions WHERE learning_objective = 'pilot_d362'");
  assert.equal(pilotOnly[0].n, 2, "nothing else in the pilot scope");
});

test("PGlite: get_unserved_questions_for_student serves the rows to a pilot_d362 pupil, never to a fixed history domain", async () => {
  assert.deepEqual((await unserved(["pilot_d362"])).sort(), [...fixtureIds].sort());
  // revolutions_democracy (the rows' faglige domain): 24 rows at grades 3–7, under the RPC's LIMIT 50.
  const rd = await unserved(["revolutions_democracy"]);
  assert.ok(rd.length > 0 && rd.length < 50, `the regular pool is live and complete (${rd.length})`);
  for (const d of HISTORY_DOMAINS) {
    const ids = await unserved([d]);
    assert.ok(ids.length < 50, `${d}: complete result`);
    for (const id of fixtureIds) assert.equal(ids.includes(id), false, `${d} serves a fixture row`);
  }
  for (const d of ["english", "danish"]) assert.deepEqual((await unserved([d])).filter((id) => fixtureIds.includes(id)), [], d);
});
