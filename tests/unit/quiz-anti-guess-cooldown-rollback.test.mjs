// Tilbagerulning af D-350's anti-gætte-pause (docs/operations/quiz-anti-guess-cooldown-rollback.{md,sql}),
// kørt i PGlite på produktionens svarkæde (helpers/h5-integration-chain.mjs, PROD_ORDER) + migrationen
// 20261105130000_quiz_anti_guess_cooldown.sql. Niveau 1 (nødstop) er SQL-blokken fra .md-filen, niveau 2
// er .sql-filen — begge læst direkte, så det testede er det, der står i proceduren.
//
// Låse og samtidige svar under tilbagerulning testes på rigtig PostgreSQL 17 i
// quiz-anti-guess-cooldown-concurrency.test.mjs (deltest 5–6); PGlite har kun én forbindelse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { baseSql, migrationSql, withTop10, PROD_ORDER, uid } from "./helpers/h5-integration-chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COOLDOWN_FILE = "20261105130000_quiz_anti_guess_cooldown.sql";
const MIGRATION = migrationSql(COOLDOWN_FILE);
const RB_SQL_PATH = join(ROOT, "docs", "operations", "quiz-anti-guess-cooldown-rollback.sql");
const RB_MD_PATH = join(ROOT, "docs", "operations", "quiz-anti-guess-cooldown-rollback.md");
const ROLLBACK = readFileSync(RB_SQL_PATH, "utf8");
const PLACEHOLDER = "c_events_exported CONSTANT bigint := -1;";
// Niveau 1: den første ```sql-blok under "## Niveau 1" i proceduren.
const LEVEL1 = (() => {
  const md = readFileSync(RB_MD_PATH, "utf8");
  const section = md.slice(md.indexOf("## Niveau 1"), md.indexOf("## Niveau 2"));
  const m = section.match(/```sql\n([\s\S]*?)```/);
  if (!m) throw new Error("niveau 1-blokken mangler i proceduren");
  return m[1];
})();
export const rollbackWith = (exported) => {
  if (!ROLLBACK.includes(PLACEHOLDER)) throw new Error("pladsholderen mangler i rollback-scriptet");
  return ROLLBACK.replace(PLACEHOLDER, `c_events_exported CONSTANT bigint := ${exported};`);
};

const POOL = Array.from({ length: 80 }, (_, i) => uid(9800 + i));
const SEED = `INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, difficulty_level) VALUES
  ${POOL.map((id, i) => `('${id}', 'mc', '{"type":"mc","question":"Rollback ${i}?","options":["A","B","C"],"correct":"A"}',
    1, true, 'auto', 'rollback-${i}', 'mc', 'short', '{}', 1000)`).join(",\n  ")};`;

// Hver test bygger sin egen kæde (ca. 9 s), fordi den ruller tilbage. Fire kæder i alt.
async function chainDb() {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  for (const f of withTop10(PROD_ORDER)) await db.exec(migrationSql(f));
  await db.exec(SEED);
  await db.exec(MIGRATION);
  return db;
}

function harness(db) {
  let n = 700;
  const used = new Map();
  const pupil = async () => {
    const id = uid(n++);
    await db.exec(`INSERT INTO auth.users VALUES ('${id}');
      INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
      INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
        current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 0, 0, 1, 1, current_date - 1);`);
    return id;
  };
  const serve = async (p) => {
    const i = used.get(p) ?? 0;
    used.set(p, i + 1);
    return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered)
      VALUES ($1, $2, 'A', false) RETURNING id`, [p, POOL[i]])).rows[0].id;
  };
  const answer = async (p, a) => {
    const qi = await serve(p);
    await db.exec("SET ROLE service_role");
    try { return (await db.query("SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, a])).rows[0].r; }
    finally { await db.exec("RESET ROLE"); }
  };
  const wrong = async (p, k) => { for (let i = 0; i < k; i++) await answer(p, "B"); };
  return { pupil, answer, wrong };
}

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
async function objects(db) {
  return one(db, `SELECT
      to_regclass('public.quiz_cooldown_config') IS NOT NULL AS config,
      to_regclass('public.quiz_cooldown_state')  IS NOT NULL AS state,
      to_regclass('public.quiz_cooldown_events') IS NOT NULL AS events,
      to_regclass('public.quiz_cooldown_events_id_seq') IS NOT NULL AS seq,
      to_regprocedure('public.get_my_quiz_cooldown()')   IS NOT NULL AS get_my,
      to_regprocedure('public.quiz_cooldown_guard()')    IS NOT NULL AS guard_fn,
      to_regprocedure('public.quiz_cooldown_register()') IS NOT NULL AS register_fn,
      (SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.question_instances'::regclass
         AND tgname IN ('quiz_cooldown_guard', 'quiz_cooldown_register')) AS triggers,
      (SELECT count(*)::int FROM pg_policy WHERE polname = 'quiz_cooldown_state_read_own_end') AS policy`);
}
const ALL = { config: true, state: true, events: true, seq: true, get_my: true, guard_fn: true, register_fn: true, triggers: 2, policy: 1 };
const NONE = { config: false, state: false, events: false, seq: false, get_my: false, guard_fn: false, register_fn: false, triggers: 0, policy: 0 };

// Alt, en tilbagerulning aldrig må ændre: elevdata, spørgsmål, rettigheder og de øvrige triggere.
async function untouchable(db) {
  return JSON.stringify((await db.query(`SELECT
      (SELECT md5(coalesce(string_agg(qi::text, ',' ORDER BY qi.id), '')) FROM public.question_instances qi) AS qi,
      (SELECT md5(coalesce(string_agg(sp::text, ',' ORDER BY sp.student_id), '')) FROM public.student_progress sp) AS sp,
      (SELECT md5(coalesce(string_agg(q::text, ',' ORDER BY q.id), '')) FROM public.questions q) AS q,
      (SELECT md5(coalesce(string_agg(x::text, ',' ORDER BY x::text), '')) FROM public.student_quest_progress x) AS quests,
      (SELECT md5(coalesce(string_agg(x::text, ',' ORDER BY x::text), '')) FROM public.student_weekly_quest_progress x) AS weekly,
      (SELECT md5(coalesce(string_agg(x::text, ',' ORDER BY x::text), '')) FROM public.question_attempts x) AS attempts,
      (SELECT relacl::text FROM pg_class WHERE oid = 'public.question_instances'::regclass) AS qi_acl,
      (SELECT string_agg(tgname || ':' || tgenabled::text, ',' ORDER BY tgname) FROM pg_trigger
        WHERE tgrelid = 'public.question_instances'::regclass AND NOT tgisinternal
          AND tgname NOT IN ('quiz_cooldown_guard', 'quiz_cooldown_register')) AS other_triggers,
      (SELECT md5(string_agg(p.oid::regprocedure::text || md5(p.prosrc), ',' ORDER BY p.oid::regprocedure::text))
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname NOT IN ('quiz_cooldown_guard', 'quiz_cooldown_register', 'get_my_quiz_cooldown')) AS functions`)).rows[0]);
}
const eventCount = async (db) => (await one(db, "SELECT count(*)::int AS n FROM public.quiz_cooldown_events")).n;
const activeCount = async (db) => (await one(db, "SELECT count(*)::int AS n FROM public.quiz_cooldown_state WHERE cooldown_until > now()")).n;

// ── Filerne ────────────────────────────────────────────────────────────────

test("filerne: rollback ligger uden for migrationskæden, har én pladsholder og rører ingen elevdata", () => {
  const migrations = readdirSync(join(ROOT, "supabase", "migrations"));
  assert.equal(migrations.some((f) => /rollback/i.test(f) && /cooldown/i.test(f)), false, "ikke en migration");
  assert.equal(ROLLBACK.split(PLACEHOLDER).length - 1, 1, "præcis én pladsholder");
  const code = ROLLBACK.replace(/^\s*--.*$/gm, "");
  assert.equal(/\bCASCADE\b/i.test(code), false, "aldrig CASCADE");
  assert.equal(/db\s+push/i.test(code), false);
  assert.equal(/\b(UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\s+public\.(?!quiz_cooldown_)/i.test(code), false,
    "skriver kun i D-350's egne tabeller (og her slet ikke)");
  // Rækkefølgen: triggere → statusfunktion → politik → triggerfunktioner → tabeller.
  const at = (s) => { const i = code.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [
    "DROP TRIGGER IF EXISTS quiz_cooldown_guard", "DROP TRIGGER IF EXISTS quiz_cooldown_register",
    "DROP FUNCTION IF EXISTS public.get_my_quiz_cooldown()", "DROP POLICY IF EXISTS quiz_cooldown_state_read_own_end",
    "DROP FUNCTION IF EXISTS public.quiz_cooldown_register()", "DROP FUNCTION IF EXISTS public.quiz_cooldown_guard()",
    "DROP TABLE IF EXISTS public.quiz_cooldown_events", "DROP TABLE IF EXISTS public.quiz_cooldown_state",
    "DROP TABLE IF EXISTS public.quiz_cooldown_config"].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(at("LOCK TABLE public.question_instances IN ACCESS EXCLUSIVE MODE") < order[0], "låsen før første DROP");
  // Niveau 1 rører kun D-350's egne objekter.
  assert.equal(/\b(UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\s+public\.(?!quiz_cooldown_state\b)/i.test(LEVEL1), false);
});

// ── Niveau 2 ───────────────────────────────────────────────────────────────

test("niveau 2 stopper uden ændringer: ikke-eksporteret hændelseslog, forkert antal, eller en afhængighed uden for D-350 (view, fremmednøgle)", async () => {
  const db = await chainDb();
  const h = harness(db);
  const p = await h.pupil();
  await h.wrong(p, 10);
  assert.equal(await eventCount(db), 1);
  assert.equal(await activeCount(db), 1);
  const before = await untouchable(db);
  await assert.rejects(db.exec(rollbackWith(-1)), /quiz_cooldown_events har 1 rækker, men c_events_exported = -1/);
  await assert.rejects(db.exec(rollbackWith(7)), /c_events_exported = 7/, "et forkert antal stopper også");
  assert.deepEqual(await objects(db), ALL);
  assert.equal(await activeCount(db), 1, "pausen står stadig");
  assert.equal(await untouchable(db), before);
  await assert.rejects(h.answer(p, "A"), (e) => e?.code === "LQ429", "og håndhæves stadig");

  // En afhængighed uden for D-350 stopper også scriptet, selv med korrekt eksporttal.
  await db.exec("CREATE VIEW public.cooldown_report AS SELECT student_id, started_at FROM public.quiz_cooldown_events");
  const before2 = await untouchable(db);
  await assert.rejects(db.exec(rollbackWith(1)), /views bruger D-350-tabellerne \(cooldown_report\)/);
  assert.deepEqual(await objects(db), ALL);
  assert.equal(await untouchable(db), before2);
  await db.exec("DROP VIEW public.cooldown_report");
  await db.exec("CREATE TABLE public.cooldown_ref (student_id uuid REFERENCES public.quiz_cooldown_state(student_id))");
  await assert.rejects(db.exec(rollbackWith(1)), /fremmednøgler peger på D-350-tabellerne \(cooldown_ref_student_id_fkey/);
  assert.deepEqual(await objects(db), ALL);
});

test("niveau 2 med eksport: alle D-350-objekter væk, elevdata og rettigheder uændret, svar accepteres igen", async () => {
  const db = await chainDb();
  const h = harness(db);
  const p1 = await h.pupil();
  const p2 = await h.pupil();
  await h.wrong(p1, 10);           // aktiv pause
  await h.wrong(p2, 4);            // halvvejs mod en pause
  await h.answer(p2, "A");
  const events = await eventCount(db);
  assert.equal(events, 1);
  const before = await untouchable(db);

  await db.exec(rollbackWith(events));

  assert.deepEqual(await objects(db), NONE);
  assert.equal(await untouchable(db), before, "elevdata, spørgsmål, quests, rettigheder og andre funktioner er uændrede");
  // Ingen rettigheder hænger tilbage (objekterne findes ikke), og ingen API-rolle har fået noget nyt.
  const grants = await one(db, `SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name LIKE 'quiz_cooldown%'`);
  assert.equal(grants.n, 0);
  // Svarene kører præcis som uden D-350: eleven, der var i pause, kan svare og belønnes.
  const xp = (await one(db, "SELECT xp FROM public.student_progress WHERE student_id = $1", [p1])).xp;
  const r = await h.answer(p1, "A");
  assert.equal(r.status, "correct");
  assert.ok((await one(db, "SELECT xp FROM public.student_progress WHERE student_id = $1", [p1])).xp > xp);
  await h.wrong(p1, 12);           // ingen ny pause, ingen fejl
});

test("niveau 2 på en tom hændelseslog kræver ingen eksport; kørt igen ændrer intet; migrationen kan anvendes forfra", async () => {
  const db = await chainDb();
  const h = harness(db);
  const q = await h.pupil();
  await h.wrong(q, 5);             // tilstand, men ingen pause og ingen hændelse: tom log kræver ingen eksport
  assert.equal(await eventCount(db), 0);
  await db.exec(rollbackWith(-1));
  assert.deepEqual(await objects(db), NONE);
  const before = await untouchable(db);
  await db.exec(rollbackWith(-1));              // intet at rulle tilbage: NOTICE, ingen fejl
  assert.equal(await untouchable(db), before);
  await db.exec(MIGRATION);                      // genanvendelse uændret
  assert.deepEqual(await objects(db), ALL);
  const p = await h.pupil();
  await h.wrong(p, 10);
  assert.equal(await activeCount(db), 1, "virker igen efter genanvendelse");
});


// ── Niveau 1 og kombinationen ──────────────────────────────────────────────

test("niveau 1 (nødstop): håndhævelsen fra, pauser ophævet, hændelsesloggen bevaret; niveau 2 derefter", async () => {
  const db = await chainDb();
  const h = harness(db);
  const p = await h.pupil();
  await h.wrong(p, 10);
  assert.equal(await activeCount(db), 1);
  const before = await untouchable(db);

  await db.exec(LEVEL1);

  assert.deepEqual(await objects(db), { ...ALL, triggers: 0 }, "kun triggerne er væk");
  assert.equal(await activeCount(db), 0, "ingen igangværende pause");
  assert.equal(await eventCount(db), 1, "loggen er bevaret");
  assert.equal(await untouchable(db), before);
  // get_my_quiz_cooldown melder ingen pause, og svar accepteres uden registrering.
  await db.exec(`SELECT set_config('test.uid', '${p}', false); SET ROLE authenticated;`);
  try {
    assert.equal((await one(db, "SELECT public.get_my_quiz_cooldown() AS s")).s.active, false);
  } finally { await db.exec("RESET ROLE"); }
  assert.equal((await h.answer(p, "A")).status, "correct");
  await h.wrong(p, 12);
  assert.equal(await eventCount(db), 1, "ingen nye pauser");

  await db.exec(rollbackWith(1));
  assert.deepEqual(await objects(db), NONE);
});
