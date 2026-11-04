// RUNTIME proof for D-280's two migrations: 20261031194600_mc_length_cue_answer_paths.sql (the answer
// paths) and 20261031194700_mc_length_cue_top10.sql (the ten questions), applied in that order as two
// transactions, as production must. Both files are executed UNMODIFIED on PGlite, on top of production's answer chain with production's exact function bodies
// (helpers/answer-chain-schema.mjs pins every md5), seeded with the ten questions exactly as
// production holds them (fixtures/mc-length-cue-top10-before.json: content and metadata hash-identical
// to the read-only preflight 2026-10-31, no ids). Pupils, instances and every id are synthetic.
//
// What it proves: the new texts (one correct option, no length cue, no systematic length rank); the
// migration's writes (only the ten questions and the open instances' keys); grading during the
// transition (old and new correct text both accepted, old spellings kept); the three live repeat
// paths re-key an MC instance on reopen; idempotence; atomicity; zero changes on any deviation; and
// what the unchanged process_question_attempt_v2 (not applied in production) does next to them.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x and runs as superuser; calls run under SET ROLE
// service_role, as get-next-question's and process-event's admin client do. Passing is not
// permission to apply: production needs its own owner authorisation (D-110, apply_migration only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, LIVE_PROSRC_MD5, readMigration, ATTEMPTS_MIGRATION_FILE } from "./helpers/answer-chain-schema.mjs";
import { findLengthCue } from "../../tools/question-quality/length-cue.mjs";
import { planReplay, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PATHS_FILE = "20261031194600_mc_length_cue_answer_paths.sql";
const FILE = "20261031194700_mc_length_cue_top10.sql";
const FUNCTIONS = readMigration(PATHS_FILE);
const MIGRATION = readMigration(FILE);
// Production applies the two files one after the other, each its own transaction.
async function migrate(db) { await db.exec(FUNCTIONS); await db.exec(MIGRATION); }
const BEFORE = JSON.parse(readFileSync(join(ROOT, "tests", "unit", "fixtures", "mc-length-cue-top10-before.json"), "utf8"));
const PATCHES = JSON.parse(/\$patches\$([\s\S]*?)\$patches\$/.exec(MIGRATION)[1]);

const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const R1 = "public.request_repeat_question_for_student(uuid,smallint,text[])";
const R2 = "public.request_repeat_question_servable_for_student(uuid,smallint,text[])";
const R3 = "public.request_repeat_level_question_for_student(uuid,text[])";
const V2 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)";
const GUARD = JSON.parse(/expected CONSTANT jsonb := '([\s\S]*?)';/.exec(FUNCTIONS)[1]);
const DATA_GUARD = JSON.parse(/expected CONSTANT jsonb := '([\s\S]*?)';/.exec(MIGRATION)[1]);
const AFTER_MD5 = Object.fromEntries(Object.entries(GUARD).map(([sig, [, after]]) => [sig, after]));

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const QID = BEFORE.map((_, i) => uid(9100 + i));
const OTHER_MC = uid(9200);      // an unrelated MC question: must not change
const NUMBER_Q = uid(9201);      // a non-MC question: its key must survive a reopen
const patchOf = (i) => PATCHES.find((p) => p.question_before === BEFORE[i].content.question);
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;

const SEED = [
  `INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
     answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES ` +
  BEFORE.map((r, i) => `('${QID[i]}', '${r.type}', ${lit(r.content)}::jsonb, ${lit(r.metadata)}::jsonb, ${r.difficulty}, true,
     '${r.question_type}', '${r.learning_objective}', '${r.answer_format}', '${r.answer_type}', ${r.target_grade},
     ${r.difficulty_band}, ${r.difficulty_level})`).join(",\n") + ";",
  `INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
     answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES
   ('${OTHER_MC}', 'mc_single', '{"question":"Hovedstad i Frankrig?","options":["Paris","Rom"],"correct":"Paris"}', '{}', 1, true,
     'auto', 'geografi', 'mc', 'short', 5, 1, 1000),
   ('${NUMBER_Q}', 'number', '{"type":"number","question":"Hvad er 2 + 2?","correct":"4"}', '{}', 1, true,
     'auto', 'matematik', 'number', 'short', 5, 1, 1000);`,
  `INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
     ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10);
   INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
     ('w_answers', 'Svar', 'answer_count', 50, 50);`,
];

async function chainDb() {
  const db = new PGlite();
  for (const sql of answerChainSql()) await db.exec(sql);
  for (const sql of SEED) await db.exec(sql);
  return db;
}

let nextPupil = 100;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 9);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function instance(db, pupil, question, key, { answered = false, wasCorrect = null, answer = null, repeat = 0 } = {}) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered,
      answered_at, was_correct, user_answer, repeat_count, next_review_at)
    VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() - interval '1 day' END, $5, $6, $7, now()) RETURNING id`,
    [pupil, question, key, answered, wasCorrect, answer, repeat])).rows[0].id;
}
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const grade = async (db, pupil, qi, answer) => (await as(db, "service_role",
  "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [pupil, qi, answer]))[0].r.status;
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;

// Open instances are live data, so the seed varies them: none, one and several per question, keyed
// with the current text and — for the four alias questions — with the old spelling too.
const idx = (q) => BEFORE.findIndex((r) => r.content.question === q);
const ALIAS_Q = BEFORE.map((r, i) => (r.metadata.danish_orthography_correct_aliases ? i : -1)).filter((i) => i >= 0);
function defaultOpenPlan() {
  const plan = BEFORE.map(() => []);
  plan[idx("Hvad var formålet med propaganda under Første Verdenskrig?")] = ["current", "current", "current"];
  plan[idx("Hvad er Grundloven?")] = ["current"];
  for (const i of ALIAS_Q) plan[i] = ["old_spelling", "current"];
  return plan;   // the rest: none
}
const keyOf = (i, kind) => kind === "old_spelling" ? BEFORE[i].metadata.danish_orthography_correct_aliases[0] : BEFORE[i].content.correct;
async function seedPreflightState(db, plan = defaultOpenPlan()) {
  const pupils = [];
  for (let i = 0; i < BEFORE.length; i++) {
    for (const kind of plan[i]) {
      const p = await addPupil(db);
      pupils.push(p);
      await instance(db, p, QID[i], keyOf(i, kind));
    }
  }
  // Finished history: every question answered under its current key, the four alias questions also
  // under their old spelling — right and wrong — plus an unrelated open instance and a non-MC one.
  const historian = await addPupil(db);
  const historian2 = await addPupil(db);
  for (let i = 0; i < BEFORE.length; i++) {
    const c = BEFORE[i].content;
    await instance(db, historian, QID[i], c.correct, { answered: true, wasCorrect: true, answer: c.correct });
    const old = BEFORE[i].metadata.danish_orthography_correct_aliases?.[0] ?? c.correct;
    await instance(db, historian2, QID[i], old, { answered: true, wasCorrect: false, answer: c.options[1] });
  }
  const other = await addPupil(db);
  await instance(db, other, OTHER_MC, "Paris");
  return { pupils, historian, historian2, other };
}

async function snapshot(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r));
  return {
    questions: await q("SELECT to_jsonb(q) AS r FROM public.questions q ORDER BY id"),
    instances: await q("SELECT to_jsonb(i) AS r FROM public.question_instances i ORDER BY id"),
    progress: await q("SELECT to_jsonb(p) AS r FROM public.student_progress p ORDER BY student_id"),
    quests: await q("SELECT to_jsonb(s) AS r FROM public.student_quest_progress s ORDER BY student_id, quest_id"),
    weekly: await q("SELECT to_jsonb(s) AS r FROM public.student_weekly_quest_progress s ORDER BY student_id, quest_id"),
    functions: await q(`SELECT p.oid::regprocedure::text AS f, md5(p.prosrc) AS h, p.prosecdef, p.proacl::text AS acl,
      p.proconfig, p.proowner::regrole::text AS owner, pg_get_function_result(p.oid) AS returns FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`),
  };
}

// ── The file ─────────────────────────────────────────────────────────────────

test("the files: unique versions after the newest migration on main, in order, D-110 wording, no ids", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  for (const f of [PATHS_FILE, FILE]) {
    assert.equal(files.filter((x) => x.startsWith(f.slice(0, 15))).length, 1, `${f}: version is unique`);
  }
  assert.ok(PATHS_FILE < FILE, "the answer paths sort first");
  assert.ok(PATHS_FILE.slice(0, 14) > "20261030211428", "after the newest migration on main when written");
  // Part 2 must follow part 1 directly: no other migration may sort between them. (Originally
  // "newest in the directory", which encoded "nothing has been added since" and failed on the next
  // unrelated migration — the same defect class question-instances-read-scope.test.mjs documents.)
  assert.ok(files.every((f) => f === FILE || f === PATHS_FILE || f.slice(0, 14) < "20261031194600" || f.slice(0, 14) > "20261031194700"),
    "nothing sorts between part 1 and part 2");
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const sql of [FUNCTIONS, MIGRATION]) {
    assert.match(sql, /IKKE anvendt i produktion\. Må KUN anvendes via apply_migration med særskilt ejer-autorisation/);
    assert.match(sql, /\(D-110, docs\/migration-workflow-policy\.md\)/);
    assert.equal(/db\s+push/i.test(sql), false);
    assert.equal(UUID.test(sql), false, "no production ids in the migrations");
    assert.equal(/process_question_attempt_v2|request_repeat_question\s*\(/.test(sql.replace(/--.*$/gm, "")), false,
      "v2 and the uncalled auth.uid repeat are not touched");
  }
  assert.equal(UUID.test(JSON.stringify(BEFORE)), false, "no production ids in the fixture");
  assert.equal(/\bopen_keys\b|åbne besvarelser,? forventede/.test(MIGRATION), false, "no hard-coded count of open instances");
  assert.equal(/UPDATE\s+public\.(questions|question_instances)\s+(qi\s+)?SET\s+(content|correct_answer)/i.test(
    FUNCTIONS.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;|CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g, "")), false,
    "the answer-path file changes no data");
  assert.deepEqual(DATA_GUARD, AFTER_MD5, "the data file requires exactly the answer paths of the first file");
});

test("isolated E2E mirrors production after the 2026-11-01 application: part 1 replays, part 2 is data", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  const plan = planReplay(files, readMigration).plan;
  for (const f of [PATHS_FILE, FILE]) assert.equal(NOT_IN_PRODUCTION[f], undefined, f);
  assert.equal(plan.find((p) => p.file === PATHS_FILE).action, "apply", "the answer paths production now runs");
  const data = plan.find((p) => p.file === FILE);
  assert.equal(data.action, "skip");
  assert.match(data.reason, /data-only/, "the ten production questions are not in the isolated database");
});

test("the data file refuses to run before the answer paths, with zero changes", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  const before = await snapshot(db);
  await assert.rejects(db.exec(MIGRATION), /MC_LENGTH_CUE: .* er ikke D-280-versionen; anvend 20261031194600 først/);
  assert.deepEqual(await snapshot(db), before);
});

// ── The new texts ────────────────────────────────────────────────────────────

test("the ten new texts: one byte-identical correct option, four distinct options, owner-approved wording", () => {
  assert.equal(PATCHES.length, 10);
  assert.deepEqual(PATCHES.map((p) => p.question_before).sort(), BEFORE.map((r) => r.content.question).sort());
  for (const p of PATCHES) {
    assert.equal(p.options_after.length, 4, p.question_after);
    assert.equal(new Set(p.options_after).size, 4, p.question_after);
    assert.equal(p.options_after.filter((o) => o === p.correct_after).length, 1, p.question_after);
    assert.equal(p.options_after.indexOf(p.correct_after), 0, "the correct option keeps its position");
    for (const t of [p.question_after, ...p.options_after]) {
      assert.equal(t, t.trim(), "no surrounding whitespace");
      assert.doesNotMatch(t, /Ã|�|\b(ae|oe|aa)\b/, "Danish letters, no mojibake");
    }
  }
  const byQ = Object.fromEntries(PATCHES.map((p) => [p.question_after, p]));
  assert.equal(byQ["Hvad er en ret — og hvad er en pligt — i et demokrati?"].correct_after,
    "En ret har du krav på – en pligt er noget, du er forpligtet til");
  assert.ok(byQ["Hvorfor er regelmæssige valg vigtige for demokratiet?"], "#5 grammar fixed");
  assert.ok(byQ["Hvilken slags sten brugte folk i Stenalderen til skarpe redskaber som økser og knive?"]);
  assert.ok(byQ["Hvorfor blev børn brugt som arbejdskraft i miner og fabrikker under industrialiseringen?"]);
});

test("no length cue: the guard passes, no correct option is the unique longest, the rank varies", () => {
  const ranks = [];
  for (const p of PATCHES) {
    assert.equal(findLengthCue(p.options_after, p.correct_after), null, p.question_after);
    const len = (s) => [...s].length;
    const c = len(p.correct_after);
    const wrong = p.options_after.filter((o) => o !== p.correct_after).map(len);
    assert.ok(Math.max(...wrong) >= c, `${p.question_after}: the correct option is the unique longest`);
    ranks.push(1 + wrong.filter((w) => w > c).length);
  }
  assert.ok(new Set(ranks).size >= 3, `length rank of the correct option must vary, got ${ranks}`);
});

test("aliases keep every earlier correct text and end with the new one", () => {
  for (const p of PATCHES) {
    const prev = p.aliases_before ?? [p.correct_before];
    assert.deepEqual(p.aliases_after, [...prev, p.correct_after], p.question_after);
    assert.ok(p.aliases_after.includes(p.correct_before));
  }
  assert.equal(PATCHES.filter((p) => p.aliases_after.length === 3).length, 4, "four questions keep their old spelling");
});

test("the fixture is production's before-state and the patch hashes match PostgreSQL's own", async () => {
  const db = new PGlite();
  for (const [i, r] of BEFORE.entries()) {
    const p = patchOf(i);
    const h = (await db.query("SELECT md5(($1::jsonb)::text) AS c, md5(($2::jsonb)::text) AS m",
      [JSON.stringify(r.content), JSON.stringify(r.metadata)])).rows[0];
    assert.equal(h.c, r.content_md5); assert.equal(h.c, p.before_hash);
    assert.equal(h.m, r.metadata_md5); assert.equal(h.m, p.before_metadata_hash);
    assert.equal(r.content.correct, p.correct_before);
  }
});

// ── The migration's writes ───────────────────────────────────────────────────

test("the chain is production's before, and only the four named functions change", async () => {
  const db = await chainDb();
  for (const [sig, md5] of Object.entries(LIVE_PROSRC_MD5)) assert.equal(await md5Of(db, sig), md5, sig);
  for (const [sig, [before]] of Object.entries(GUARD)) assert.equal(await md5Of(db, sig), before, sig);
  const s0 = await snapshot(db);
  await seedPreflightState(db);
  await migrate(db);
  for (const [sig, after] of Object.entries(AFTER_MD5)) assert.equal(await md5Of(db, sig), after, sig);
  const s1 = await snapshot(db);
  const changed = s1.functions.filter((f) => !s0.functions.includes(f)).map((f) => JSON.parse(f).f).sort();
  assert.deepEqual(changed, [
    "process_question_attempt(uuid,uuid,text,bigint)",
    "request_repeat_level_question_for_student(uuid,text[])",
    "request_repeat_question_for_student(uuid,smallint,text[])",
    "request_repeat_question_servable_for_student(uuid,smallint,text[])",
  ]);
  for (const f of s1.functions.map((x) => JSON.parse(x)).filter((x) => changed.includes(x.f))) {
    const was = s0.functions.map((x) => JSON.parse(x)).find((x) => x.f === f.f);
    assert.equal(f.acl, was.acl, `${f.f}: EXECUTE unchanged`);
    assert.equal(f.prosecdef, was.prosecdef, `${f.f}: security unchanged`);
    assert.deepEqual(f.proconfig, was.proconfig, `${f.f}: search_path unchanged`);
    assert.equal(f.owner, was.owner, `${f.f}: owner unchanged`);
    assert.equal(f.returns, was.returns, `${f.f}: return type unchanged`);
  }
  assert.equal(await md5Of(db, "public.request_repeat_question(smallint,text[])"), LIVE_PROSRC_MD5["public.request_repeat_question(smallint,text[])"]);
  assert.equal(await md5Of(db, V2), null, "process_question_attempt_v2 is not created");
});

test("only the ten questions and their open instances' keys change; history, rewards and statistics do not", async () => {
  const db = await chainDb();
  const seeded = await seedPreflightState(db);
  const before = await snapshot(db);
  await migrate(db);
  const after = await snapshot(db);

  const q0 = before.questions.map((r) => JSON.parse(r).r), q1 = after.questions.map((r) => JSON.parse(r).r);
  for (const [i, id] of QID.entries()) {
    const a = q0.find((r) => r.id === id), b = q1.find((r) => r.id === id), p = patchOf(i);
    assert.deepEqual({ ...b, content: null, metadata: null }, { ...a, content: null, metadata: null }, "no other column changes");
    assert.deepEqual(b.content, { ...a.content, question: p.question_after, options: p.options_after, correct: p.correct_after });
    assert.deepEqual(b.metadata, { ...a.metadata, danish_orthography_correct_aliases: p.aliases_after });
  }
  assert.deepEqual(q1.filter((r) => !QID.includes(r.id)), q0.filter((r) => !QID.includes(r.id)), "other questions untouched");

  const i0 = before.instances.map((r) => JSON.parse(r).r), i1 = after.instances.map((r) => JSON.parse(r).r);
  let rekeyed = 0;
  for (const a of i0) {
    const b = i1.find((r) => r.id === a.id);
    const k = QID.indexOf(a.question_id);
    if (k >= 0 && a.answered === false) {
      rekeyed++;
      assert.deepEqual({ ...b, correct_answer: null }, { ...a, correct_answer: null }, "only the key moves");
      assert.equal(b.correct_answer, patchOf(k).correct_after);
    } else {
      assert.deepEqual(b, a, "answered and unrelated instances are byte-identical");
    }
  }
  assert.equal(rekeyed, seeded.pupils.length, "every open instance of the ten, whatever old key it held");
  assert.equal(rekeyed, defaultOpenPlan().flat().length);
  assert.deepEqual(after.progress, before.progress, "XP, coins and counters untouched");
  assert.deepEqual(after.quests, before.quests);
  assert.deepEqual(after.weekly, before.weekly);
});

// ── Open instances are live data: none, one, several; every reviewed old key ──

for (const [name, plan] of Object.entries({
  "no open instance at all": BEFORE.map(() => []),
  "exactly one open instance": BEFORE.map((_, i) => (i === 3 ? ["current"] : [])),
  "several open instances on every question": BEFORE.map(() => ["current", "current", "current"]),
})) {
  test(`open instances: ${name} — all end on the new key, nothing else moves`, async () => {
    const db = await chainDb();
    const seeded = await seedPreflightState(db, plan);
    const before = await snapshot(db);
    await migrate(db);
    const open = (await db.query(`SELECT question_id, correct_answer FROM public.question_instances
      WHERE answered = false AND question_id = ANY($1::uuid[])`, [QID])).rows;
    assert.equal(open.length, plan.flat().length);
    for (const r of open) assert.equal(r.correct_answer, patchOf(QID.indexOf(r.question_id)).correct_after);
    const after = await snapshot(db);
    assert.deepEqual(after.progress, before.progress);
    assert.equal(seeded.pupils.length, plan.flat().length);
  });
}

test("every reviewed old spelling as an open instance's key is re-keyed to the new text", async () => {
  const db = await chainDb();
  const plan = BEFORE.map(() => []);
  for (const i of ALIAS_Q) plan[i] = ["old_spelling"];
  await seedPreflightState(db, plan);
  await migrate(db);
  for (const i of ALIAS_Q) {
    const rows = (await db.query("SELECT correct_answer FROM public.question_instances WHERE answered = false AND question_id = $1",
      [QID[i]])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].correct_answer, patchOf(i).correct_after, BEFORE[i].content.question);
  }
  assert.equal(ALIAS_Q.length, 4);
});

test("idempotent: a second run changes nothing", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  await migrate(db);
  const once = await snapshot(db);
  await migrate(db);
  assert.deepEqual(await snapshot(db), once);
});

// ── Zero changes on any deviation; atomic ────────────────────────────────────

const DEVIATIONS = {
  "a question's content differs (review_text edited)": (db) =>
    db.exec(`UPDATE public.questions SET content = jsonb_set(content, '{review_text}', '"Ændret."') WHERE id = '${QID[3]}'`),
  "a question's metadata differs": (db) =>
    db.exec(`UPDATE public.questions SET metadata = metadata || '{"concepts":[]}' WHERE id = '${QID[5]}'`),
  "a question is missing": (db) => db.exec(`DELETE FROM public.questions WHERE id = '${QID[0]}'`),
  "a question is inactive": (db) => db.exec(`UPDATE public.questions SET is_active = false WHERE id = '${QID[2]}'`),
  "an open instance holds an unknown key": async (db) => {
    const p = await addPupil(db);
    await instance(db, p, QID[idx("Hvad er Grundloven?")], "noget helt andet");
  },
  "an open instance holds another question's key": async (db) => {
    const p = await addPupil(db);
    await instance(db, p, QID[0], BEFORE[1].content.correct);
  },
  "an open instance holds an empty key (the column default)": async (db) => {
    const p = await addPupil(db);
    await instance(db, p, QID[2], "");
  },
  "a repeat function drifted from production": (db) =>
    db.exec(`CREATE OR REPLACE FUNCTION public.request_repeat_question_for_student(p_student_id uuid, p_grade smallint, p_domains text[])
             RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT NULL::uuid $$`),
  "process_question_attempt drifted from production": (db) =>
    db.exec(`COMMENT ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) IS 'x';
             CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
             RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT NULL::json $$`),
  "mixed state: one question already carries the new text": async (db) => {
    const p = PATCHES[0];
    const i = BEFORE.findIndex((r) => r.content.question === p.question_before);
    await db.query(`UPDATE public.questions SET content = content || jsonb_build_object('question', $2::text, 'options', $3::jsonb, 'correct', $4::text),
      metadata = metadata || jsonb_build_object('danish_orthography_correct_aliases', $5::jsonb) WHERE id = $1`,
      [QID[i], p.question_after, JSON.stringify(p.options_after), p.correct_after, JSON.stringify(p.aliases_after)]);
  },
};

for (const [name, deviate] of Object.entries(DEVIATIONS)) {
  test(`a deviating before-state gives zero changes: ${name}`, async () => {
    const db = await chainDb();
    await seedPreflightState(db);
    await deviate(db);
    const before0 = await snapshot(db);
    const paths = await db.exec(FUNCTIONS).then(() => null, (e) => e);
    if (paths) {
      // A drifted answer path stops the first file: nothing at all changes.
      assert.match(paths.message, /MC_LENGTH_CUE/);
      assert.deepEqual(await snapshot(db), before0, "nothing changed");
      return;
    }
    const before = await snapshot(db);
    await assert.rejects(db.exec(MIGRATION), /MC_LENGTH_CUE/);
    assert.deepEqual(await snapshot(db), before, "nothing changed — not the questions, not the keys");
  });
}

test("atomic: a failure after nine of ten questions were written rolls everything back", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  const last = PATCHES[PATCHES.length - 1];
  await db.exec(`CREATE FUNCTION public.t_fail() RETURNS trigger LANGUAGE plpgsql AS $t$
    BEGIN IF NEW.content ->> 'correct' = ${lit(last.correct_after).replace(/^'"|"'$/g, "'")} THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $t$;
    CREATE TRIGGER t_fail BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.t_fail();`);
  await db.exec(FUNCTIONS);
  const before = await snapshot(db);
  await assert.rejects(db.exec(MIGRATION), /injected failure/);
  assert.deepEqual(await snapshot(db), before);
});

// ── Grading during and after the transition ──────────────────────────────────

test("an open instance accepts both the old and the new correct text; wrong options stay wrong", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  // Before the migration: pages already open, keyed with the current text.
  const open = [];
  for (const [i, r] of BEFORE.entries()) {
    for (const answer of ["old", "new", "oldWrong", "newWrong"]) {
      const p = await addPupil(db);
      open.push({ i, p, answer, qi: await instance(db, p, QID[i], r.content.correct) });
    }
  }
  await migrate(db);
  for (const o of open) {
    const p = patchOf(o.i);
    const text = { old: p.correct_before, new: p.correct_after, oldWrong: BEFORE[o.i].content.options[2], newWrong: p.options_after[2] }[o.answer];
    const want = o.answer === "old" || o.answer === "new" ? "correct" : "incorrect";
    assert.equal(await grade(db, o.p, o.qi, text), want, `${p.question_after} / ${o.answer}`);
  }
});

test("every realistic old, current and new text is accepted, whatever key the instance holds", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  await migrate(db);
  let checked = 0;
  for (const [i] of BEFORE.entries()) {
    const p = patchOf(i);
    // Keys an instance can hold: the old spelling (history), the previous text (a page served in the
    // race before the lock), the new text (re-keyed, reopened or new). Texts a pupil can send: the same.
    for (const key of p.aliases_after) {
      for (const text of p.aliases_after) {
        const pupil = await addPupil(db);
        const qi = await instance(db, pupil, QID[i], key);
        assert.equal(await grade(db, pupil, qi, text), "correct", `${p.question_after}: key "${key}" / text "${text}"`);
        checked++;
      }
    }
  }
  assert.equal(checked, 4 * 9 + 6 * 4);
});

test("a new instance takes the new key and is graded and rewarded like any first answer", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  await migrate(db);
  for (const [i] of BEFORE.entries()) {
    const pupil = await addPupil(db);
    // get-next-question stores the raw content.correct as the MC key (normalizeContent, instance-insert.ts).
    const key = (await db.query("SELECT content ->> 'correct' AS k FROM public.questions WHERE id = $1", [QID[i]])).rows[0].k;
    assert.equal(key, patchOf(i).correct_after);
    const qi = await instance(db, pupil, QID[i], key);
    assert.equal(await grade(db, pupil, qi, key), "correct");
    const pr = (await db.query("SELECT xp, coins, correct_answers AS c, total_correct_answers AS t FROM public.student_progress WHERE student_id = $1", [pupil])).rows[0];
    assert.deepEqual(pr, { xp: 110, coins: 55, c: 8, t: 8 });
  }
});

test("an instance landing with the earlier key after part 2: valid question, both texts right, one reward, no re-run", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  await migrate(db);
  const changed = (await db.query("SELECT count(*)::int AS n FROM public.questions")).rows[0].n;
  for (const [i] of BEFORE.entries()) {
    const p = patchOf(i);
    // get-next-question read the question just before the lock: the instance carries the earlier key.
    const q = (await db.query("SELECT is_active, answer_format, content FROM public.questions WHERE id = $1", [QID[i]])).rows[0];
    assert.equal(q.is_active, true); assert.equal(q.answer_format, "mc");
    assert.equal(q.content.options.filter((o) => o === q.content.correct).length, 1, "a valid question");
    for (const text of [p.correct_before, p.correct_after]) {
      const pupil = await addPupil(db);
      const qi = await instance(db, pupil, QID[i], p.correct_before);
      const r = (await as(db, "service_role", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [pupil, qi, text]))[0].r;
      assert.deepEqual(r, { status: "correct", correct_answer: p.correct_after }, `${p.question_after}: "${text}"`);
      assert.equal(await grade(db, pupil, qi, text), "correct", "a second submission replays");
      const pr = (await db.query("SELECT xp, coins, correct_answers AS c, total_correct_answers AS t FROM public.student_progress WHERE student_id = $1", [pupil])).rows[0];
      assert.deepEqual(pr, { xp: 110, coins: 55, c: 8, t: 8 }, "exactly one reward");
    }
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.questions")).rows[0].n, changed, "nothing re-run");
});

test("an earlier key on an answered instance is replaced by an ordinary reopen, no migration needed", async () => {
  const db = await chainDb();
  await migrate(db);
  const flint = idx("Hvad lavede folk redskaber af i Stenalderen?");
  const pupil = await addPupil(db);
  for (const i of PREHISTORIC) {
    const wrong = i === flint;
    await instance(db, pupil, QID[i], BEFORE[i].content.correct,
      { answered: true, wasCorrect: !wrong, answer: wrong ? "Kridt" : patchOf(i).correct_after });
  }
  const id = (await as(db, "service_role",
    "SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['prehistoric_denmark']) AS id", [pupil]))[0].id;
  const row = (await db.query("SELECT question_id, correct_answer FROM public.question_instances WHERE id = $1", [id])).rows[0];
  assert.equal(row.question_id, QID[flint]);
  assert.equal(row.correct_answer, patchOf(flint).correct_after);
});

// ── The three live repeat paths ──────────────────────────────────────────────

const PREHISTORIC = BEFORE.map((r, i) => [r, i]).filter(([r]) => r.learning_objective === "prehistoric_denmark").map(([, i]) => i);

async function exhaustedPupil(db, keyFor) {
  // A pupil who has answered every prehistoric question, the flint question wrong under its OLD key.
  const pupil = await addPupil(db);
  for (const i of PREHISTORIC) {
    const wrong = BEFORE[i].content.question === "Hvad lavede folk redskaber af i Stenalderen?";
    await instance(db, pupil, QID[i], keyFor(i),
      { answered: true, wasCorrect: !wrong, answer: wrong ? BEFORE[i].content.options[1] : keyFor(i) });
  }
  return pupil;
}
const REPEATS = {
  [R1]: (p) => ["SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['prehistoric_denmark']) AS id", [p]],
  [R2]: (p) => ["SELECT public.request_repeat_question_servable_for_student($1, 9::smallint, ARRAY['prehistoric_denmark']) AS id", [p]],
  [R3]: (p) => ["SELECT public.request_repeat_level_question_for_student($1, ARRAY['prehistoric_denmark']) AS id", [p]],
};

for (const [sig, call] of Object.entries(REPEATS)) {
  test(`${sig.split("(")[0]}: reopening an MC instance re-keys it to the current content.correct`, async () => {
    const db = await chainDb();
    await seedPreflightState(db);
    await migrate(db);
    const flint = BEFORE.findIndex((r) => r.content.question === "Hvad lavede folk redskaber af i Stenalderen?");
    // History holds both the old spelling (before 20261018143726) and the previous text.
    const oldSpelling = (i) => BEFORE[i].metadata.danish_orthography_correct_aliases?.[0] ?? BEFORE[i].content.correct;
    for (const keyFor of [oldSpelling, (i) => BEFORE[i].content.correct]) {
      const pupil = await exhaustedPupil(db, keyFor);
      const [sql, params] = call(pupil);
      const id = (await as(db, "service_role", sql, params))[0].id;
      const row = (await db.query("SELECT * FROM public.question_instances WHERE id = $1", [id])).rows[0];
      assert.equal(row.question_id, QID[flint], "the wrong answer is reopened first");
      assert.equal(row.correct_answer, patchOf(flint).correct_after, "key follows the corrected question");
      assert.equal(row.answered, false); assert.equal(row.user_answer, null); assert.equal(row.was_correct, null);
      assert.equal(row.repeat_count, 1);
      assert.equal(await grade(db, pupil, id, "Flint"), "correct", "the new option is graded right");
      const pr = (await db.query("SELECT xp, coins, correct_answers AS c FROM public.student_progress WHERE student_id = $1", [pupil])).rows[0];
      assert.deepEqual(pr, { xp: 102, coins: 51, c: 7 }, "a repeat still pays the repeat amount only");
    }
  });
}

test("a reopened non-MC instance keeps its own key", async () => {
  const db = await chainDb();
  await db.exec(FUNCTIONS);   // the answer paths only
  const pupil = await addPupil(db);
  await instance(db, pupil, NUMBER_Q, "KEPT", { answered: true, wasCorrect: false, answer: "5" });
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id <> '${NUMBER_Q}'`);
  const id = (await as(db, "service_role",
    "SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['matematik']) AS id", [pupil]))[0].id;
  assert.ok(id);
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [id])).rows[0].correct_answer, "KEPT");
});

test("an unrelated MC question keeps its key on reopen (content.correct unchanged)", async () => {
  const db = await chainDb();
  await db.exec(FUNCTIONS);
  const pupil = await addPupil(db);
  await instance(db, pupil, OTHER_MC, "Paris", { answered: true, wasCorrect: false, answer: "Rom" });
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id <> '${OTHER_MC}'`);
  const id = (await as(db, "service_role",
    "SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['geografi']) AS id", [pupil]))[0].id;
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [id])).rows[0].correct_answer, "Paris");
});

// ── process_question_attempt_v2 (prepared, NOT applied in production; file unchanged) ──

// D-110 does not permit editing a merged migration, so 20261030211428 is left as it is. These tests
// record what that means for the H5 track: v2's own guard refuses to run after D-280, and v2 accepts
// only exactly two aliases. Both must be resolved in a reviewed v2 change before v2 is applied.
test("v2 after D-280: v2's own guard refuses, with zero changes", async () => {
  const V2_SQL = readMigration(ATTEMPTS_MIGRATION_FILE);
  const db = await chainDb();
  await seedPreflightState(db);
  await migrate(db);
  const before = await snapshot(db);
  await assert.rejects(db.exec(V2_SQL), /H5 PR 1: public\.(process_question_attempt|request_repeat_[a-z_]+)\(.*er ændret siden analysen/);
  assert.deepEqual(await snapshot(db), before);
  assert.equal(await md5Of(db, V2), null);
});

test("v2 before D-280: D-280 still applies; v2 grades like the live function except old texts on three-alias questions", async () => {
  const V2_SQL = readMigration(ATTEMPTS_MIGRATION_FILE);
  assert.match(V2_SQL, /IF jsonb_array_length\(v_aliases\) = 2\n/, "v2 keeps the exactly-two rule (file unchanged)");
  const db = await chainDb();
  await seedPreflightState(db);
  await db.exec(V2_SQL);
  await migrate(db);
  let differ = 0;
  for (const [i] of BEFORE.entries()) {
    const p = patchOf(i);
    for (const text of [...p.aliases_after, p.options_after[3]]) {
      const pupilA = await addPupil(db), pupilB = await addPupil(db);
      const qa = await instance(db, pupilA, QID[i], p.correct_after), qb = await instance(db, pupilB, QID[i], p.correct_after);
      const live = await grade(db, pupilA, qa, text);
      const v2 = (await as(db, "service_role", `SELECT public.process_question_attempt_v2($1, $2, $3, 1,
        gen_random_uuid(), NULL, NULL) AS r`, [pupilB, qb, text]))[0].r;
      const oldTextOnThreeAliases = p.aliases_after.length === 3 && text !== p.correct_after && p.aliases_after.includes(text);
      if (oldTextOnThreeAliases) {
        assert.equal(live, "correct");
        assert.equal(v2.status, "incorrect", "known gap: v2 needs the two-or-more rule before it is applied");
        differ++;
      } else {
        assert.equal(v2.status, live, `${p.question_after}: "${text}"`);
      }
    }
  }
  assert.equal(differ, 4 * 2, "exactly the old spelling and the previous text of the four alias questions");
});
