// RUNTIME proof for migration 20261031194700_mc_length_cue_top10.sql (D-280). The SQL file is executed
// UNMODIFIED on PGlite, on top of production's answer chain with production's exact function bodies
// (helpers/answer-chain-schema.mjs pins every md5), seeded with the ten questions exactly as
// production holds them (fixtures/mc-length-cue-top10-before.json: content and metadata hash-identical
// to the read-only preflight 2026-10-31, no ids). Pupils, instances and every id are synthetic.
//
// What it proves: the new texts (one correct option, no length cue, no systematic length rank); the
// migration's writes (only the ten questions and the open instances' keys); grading during the
// transition (old and new correct text both accepted, old spellings kept); the three live repeat
// paths re-key an MC instance on reopen; idempotence; atomicity; zero changes on any deviation; and
// that process_question_attempt_v2 (not applied in production) grades the same and is not created.
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
const FILE = "20261031194700_mc_length_cue_top10.sql";
const MIGRATION = readMigration(FILE);
const BEFORE = JSON.parse(readFileSync(join(ROOT, "tests", "unit", "fixtures", "mc-length-cue-top10-before.json"), "utf8"));
const PATCHES = JSON.parse(/\$patches\$([\s\S]*?)\$patches\$/.exec(MIGRATION)[1]);

const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
const R1 = "public.request_repeat_question_for_student(uuid,smallint,text[])";
const R2 = "public.request_repeat_question_servable_for_student(uuid,smallint,text[])";
const R3 = "public.request_repeat_level_question_for_student(uuid,text[])";
const V2 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)";
const GUARD = JSON.parse(/expected CONSTANT jsonb := '([\s\S]*?)';/.exec(MIGRATION)[1]);
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

// Production's open instances at the preflight (aggregate only): per question, the stored keys and counts.
async function seedPreflightState(db) {
  const pupils = [];
  for (let i = 0; i < BEFORE.length; i++) {
    for (const [key, n] of Object.entries(patchOf(i).open_keys)) {
      for (let j = 0; j < n; j++) {
        const p = await addPupil(db);
        pupils.push(p);
        await instance(db, p, QID[i], key);
      }
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
      p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`),
  };
}

// ── The file ─────────────────────────────────────────────────────────────────

test("the file: unique version after the newest migration on main, D-110 wording, no ids, no db push", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  assert.equal(files.filter((f) => f.startsWith("20261031194700_")).length, 1, "version is unique");
  assert.ok(files.every((f) => f === FILE || f.slice(0, 14) < "20261031194700"), "newest migration when written");
  assert.match(MIGRATION, /IKKE anvendt i produktion\. Må KUN anvendes via apply_migration med særskilt ejer-autorisation/);
  assert.match(MIGRATION, /\(D-110, docs\/migration-workflow-policy\.md\)/);
  assert.equal(/db\s+push/i.test(MIGRATION), false);
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.equal(UUID.test(MIGRATION), false, "no production ids in the migration");
  assert.equal(UUID.test(JSON.stringify(BEFORE)), false, "no production ids in the fixture");
  assert.equal(/process_question_attempt_v2|request_repeat_question\s*\(/.test(MIGRATION.replace(/--.*$/gm, "")), false,
    "v2 and the uncalled auth.uid repeat are not touched");
});

test("isolated E2E mirrors production: the file is not replayed until it is applied there", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  const entry = planReplay(files, readMigration).plan.find((p) => p.file === FILE);
  assert.equal(entry.action, "skip");
  assert.match(NOT_IN_PRODUCTION[FILE], /not applied in production/);
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
  await db.exec(MIGRATION);
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
  }
  assert.equal(await md5Of(db, "public.request_repeat_question(smallint,text[])"), LIVE_PROSRC_MD5["public.request_repeat_question(smallint,text[])"]);
  assert.equal(await md5Of(db, V2), null, "process_question_attempt_v2 is not created");
});

test("only the ten questions and their open instances' keys change; history, rewards and statistics do not", async () => {
  const db = await chainDb();
  const seeded = await seedPreflightState(db);
  const before = await snapshot(db);
  await db.exec(MIGRATION);
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
  assert.equal(rekeyed, PATCHES.reduce((n, p) => n + Object.values(p.open_keys).reduce((s, v) => s + v, 0), 0));
  assert.equal(rekeyed, 4, "the preflight's four open instances");
  assert.deepEqual(after.progress, before.progress, "XP, coins and counters untouched");
  assert.deepEqual(after.quests, before.quests);
  assert.deepEqual(after.weekly, before.weekly);
  assert.ok(seeded.pupils.length === 4);
});

test("idempotent: a second run changes nothing", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  await db.exec(MIGRATION);
  const once = await snapshot(db);
  await db.exec(MIGRATION);
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
  "one more open instance than the preflight": async (db) => {
    const p = await addPupil(db);
    await instance(db, p, QID[BEFORE.findIndex((r) => r.content.question === "Hvad er Grundloven?")],
      BEFORE.find((r) => r.content.question === "Hvad er Grundloven?").content.correct);
  },
  "an open instance on a question that had none": async (db) => {
    const p = await addPupil(db);
    await instance(db, p, QID[0], BEFORE[0].content.correct);
  },
  "an open instance holds a key the preflight did not enumerate": (db) =>
    db.exec(`UPDATE public.question_instances SET correct_answer = 'noget andet'
             WHERE answered = false AND question_id = '${QID[BEFORE.findIndex((r) => r.content.question === "Hvad er Grundloven?")]}'`),
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
    const before = await snapshot(db);
    await assert.rejects(db.exec(MIGRATION), /MC_LENGTH_CUE/);
    assert.deepEqual(await snapshot(db), before, "nothing changed — not the questions, the keys or the functions");
  });
}

test("atomic: a failure after nine of ten questions were written rolls everything back", async () => {
  const db = await chainDb();
  await seedPreflightState(db);
  const last = PATCHES[PATCHES.length - 1];
  await db.exec(`CREATE FUNCTION public.t_fail() RETURNS trigger LANGUAGE plpgsql AS $t$
    BEGIN IF NEW.content ->> 'correct' = ${lit(last.correct_after).replace(/^'"|"'$/g, "'")} THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $t$;
    CREATE TRIGGER t_fail BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.t_fail();`);
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
  // Those are extra open instances: the preflight counts must match them, so run with them counted.
  const mig = MIGRATION.replace(/\$patches\$([\s\S]*?)\$patches\$/, (_, body) => "$patches$" + JSON.stringify(
    JSON.parse(body).map((p) => ({ ...p, open_keys: { [p.correct_before]: (p.open_keys[p.correct_before] ?? 0) + 4 } }))) + "$patches$");
  await db.exec(mig);
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
  await db.exec(MIGRATION);
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
  await db.exec(MIGRATION);
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
    await db.exec(MIGRATION);
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
  await db.exec(MIGRATION.replace(/DO \$mc_length_cue\$[\s\S]*\$mc_length_cue\$;/, ""));   // functions only
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
  await db.exec(MIGRATION.replace(/DO \$mc_length_cue\$[\s\S]*\$mc_length_cue\$;/, ""));
  const pupil = await addPupil(db);
  await instance(db, pupil, OTHER_MC, "Paris", { answered: true, wasCorrect: false, answer: "Rom" });
  await db.exec(`UPDATE public.questions SET is_active = false WHERE id <> '${OTHER_MC}'`);
  const id = (await as(db, "service_role",
    "SELECT public.request_repeat_question_for_student($1, 9::smallint, ARRAY['geografi']) AS id", [pupil]))[0].id;
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [id])).rows[0].correct_answer, "Paris");
});

// ── process_question_attempt_v2 (prepared, NOT applied in production) ───────

test("process_question_attempt_v2 grades the transition exactly as the live function, in either order", async () => {
  const V2_SQL = readMigration(ATTEMPTS_MIGRATION_FILE);
  assert.match(V2_SQL, /IF jsonb_array_length\(v_aliases\) >= 2\n/, "v2 uses the same two-or-more alias rule");
  for (const order of [[V2_SQL, MIGRATION], [MIGRATION, V2_SQL]]) {
    const db = await chainDb();
    await seedPreflightState(db);
    for (const sql of order) await db.exec(sql);
    for (const [i] of BEFORE.entries()) {
      const p = patchOf(i);
      for (const key of p.aliases_after) {
        for (const text of [...p.aliases_after, p.options_after[3]]) {
          const pupilA = await addPupil(db), pupilB = await addPupil(db);
          const qa = await instance(db, pupilA, QID[i], key), qb = await instance(db, pupilB, QID[i], key);
          const live = await grade(db, pupilA, qa, text);
          const v2 = (await as(db, "service_role", `SELECT public.process_question_attempt_v2($1, $2, $3, 1,
            gen_random_uuid(), NULL, NULL) AS r`, [pupilB, qb, text]))[0].r;
          assert.equal(v2.status, live, `${p.question_after}: key "${key}" / text "${text}"`);
        }
      }
    }
  }
});
