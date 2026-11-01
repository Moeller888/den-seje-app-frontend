// H5 integration (D-266, D-273, D-278, D-280): 20261101140000_question_attempts_v2_bootstrap.sql and
// 20261101140100_question_attempts_v2_align_d280.sql, executed UNMODIFIED on PGlite with every merged
// migration they meet, in both histories:
//
//   repository   20261030211428 → D-278 → D-280 part 1 → bootstrap → align   (isolated E2E replay)
//   production   D-280 part 1 → D-278 → bootstrap → align   (20261030211428 refuses after D-280, by design)
//
// What it proves: both histories end in the SAME public schema (fingerprint of every function body,
// trigger, constraint, index, policy, ACL and column); the bootstrap carries 20261030211428's DDL byte
// for byte and refuses every unknown state; the alignment changes only D-280's alias rule; after it,
// process_question_attempt_v2 grades exactly as process_question_attempt for the ten D-280 questions
// in every key/answer combination, first answers and repeats — with the real D-280 part 2 applied on
// top of an H5 database; replay, refusals, the round guard and append-only history still hold; D-278
// still counts and restricts; the rollback restores the pre-H5 schema.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x, one connection, superuser; simultaneous sessions are
// question-attempts-v2-bootstrap-concurrency.test.mjs on a real PostgreSQL 17. Passing is not
// permission to apply: production needs its own owner authorisation (D-110, apply_migration only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { splitStatements } from "./helpers/sql-statements.mjs";
import {
  H5, D278, D280_PATHS, D280_TOP10, BOOTSTRAP, ALIGN, REPO_ORDER, PROD_ORDER, MC_V2, TEXT_V2, PQA, MD5,
  TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL, ROLLBACK_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { planReplay, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL = (f) => migrationSql(f);
const ORIGINAL_DDL = (() => {
  const src = SQL(H5);
  return splitStatements(src.slice(src.indexOf("-- ── 1. Composite FK target")));
})();

async function freshDb() {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  return db;
}
async function migrated(order) {
  const db = await freshDb();
  for (const f of order) await db.exec(SQL(f));
  return db;
}
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;
const exists = async (db, sql) => (await db.query(`SELECT (${sql}) AS e`)).rows[0].e;
const h5Objects = async (db) => ({
  table: await exists(db, "to_regclass('public.question_attempts') IS NOT NULL"),
  mc: await exists(db, `to_regprocedure('${MC_V2}') IS NOT NULL`),
  guard: await exists(db, "EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'question_instances_round_guard')"),
  key: await exists(db, "EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_instances_id_student_id_key')"),
});
const NONE = { table: false, mc: false, guard: false, key: false };

let nextPupil = 700;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function serve(db, pupil, question, key, { repeat = 0 } = {}) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
    answered, next_review_at) VALUES ($1, $2, $3, $4, false, now()) RETURNING id`, [pupil, question, key, repeat])).rows[0].id;
}
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const legacy = async (db, p, qi, answer) => (await as(db, "service_role", `SELECT public.process_question_attempt($1, $2, $3, 0) AS r`, [p, qi, answer]))[0].r;
const v2 = async (db, p, qi, answer, round, sub = randomUUID()) =>
  (await as(db, "service_role", `SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, NULL, NULL) AS r`, [p, qi, answer, round, sub]))[0].r;
async function effects(db, pupil) {
  const rows = async (sql) => (await db.query(sql, [pupil])).rows;
  return {
    progress: await rows(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak
      FROM public.student_progress WHERE student_id = $1`),
    instances: await rows(`SELECT answered, user_answer, was_correct, repeat_count, correct_answer
      FROM public.question_instances WHERE student_id = $1`),
    daily: await rows(`SELECT d.quest_key, p.progress FROM public.student_quest_progress p
      JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    weekly: await rows(`SELECT w.quest_key, p.progress FROM public.student_weekly_quest_progress p
      JOIN public.weekly_quests w ON w.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
  };
}

// ── The files ────────────────────────────────────────────────────────────────────────────────────
test("the two files: unique versions after every merged migration; the merged ones are untouched", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  for (const f of [BOOTSTRAP, ALIGN]) {
    assert.ok(files.includes(f), f);
    assert.equal(files.filter((x) => x.slice(0, 14) === f.slice(0, 14)).length, 1, `${f}: version unique`);
  }
  assert.deepEqual(files.slice(-2), [BOOTSTRAP, ALIGN], "the newest two");
  assert.deepEqual([...REPO_ORDER], [H5, D278, D280_PATHS, BOOTSTRAP, ALIGN].sort(), "REPO_ORDER is file-name order");
  for (const f of [BOOTSTRAP, ALIGN]) {
    const code = SQL(f).replace(/--.*$/gm, "");
    // Outside function bodies (the _v2 bodies write attempts when CALLED; the file itself writes nothing).
    const outside = code.replace(/\$function\$[\s\S]*?\$function\$/g, "");
    assert.equal(/db\s+push/i.test(code), false);
    assert.equal(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\s+public\./i.test(outside), false, `${f}: writes no rows`);
    assert.equal(/UPDATE\s+public\.(question_instances|student_progress|questions|question_attempts)\b/i.test(outside), false,
      `${f}: no UPDATE outside function bodies`);
    assert.equal(/\bFUNCTION\s+public\.(process_question_attempt|process_text_answer|request_repeat_\w+|release_open_question_outside|update_best_session_streak|set_night_correct)\s*\(/i.test(code), false,
      `${f}: does not redefine a live answer, repeat or D-278 function`);
  }
});

test("the bootstrap executes 20261030211428's sections 1–6 byte for byte, in order, each once", () => {
  const src = SQL(BOOTSTRAP);
  const embedded = [...src.matchAll(/EXECUTE (\$h5_ddl_(\d\d)\$)([\s\S]*?)\1;/g)];
  assert.equal(ORIGINAL_DDL.length, 19);
  assert.deepEqual(embedded.map((m) => Number(m[2])), ORIGINAL_DDL.map((_, i) => i + 1));
  embedded.forEach((m, i) => assert.equal(m[3], ORIGINAL_DDL[i], `statement ${i + 1}`));
  // Outside the EXECUTEd statements there is no DDL: only the state check and the final check.
  const rest = splitStatements(src.replace(/EXECUTE (\$h5_ddl_\d\d\$)[\s\S]*?\1;/g, "NULL;"));
  assert.deepEqual(rest.map((s) => s.slice(0, 3)), ["DO ", "DO "]);
});

test("the alignment changes process_question_attempt_v2 in exactly the alias rule (and its comment)", () => {
  const original = ORIGINAL_DDL.find((s) => s.startsWith("CREATE FUNCTION public.process_question_attempt_v2("));
  const aligned = splitStatements(SQL(ALIGN)).find((s) => s.startsWith("CREATE OR REPLACE FUNCTION public.process_question_attempt_v2("));
  const a = original.split("\n");
  const b = aligned.split("\n");
  const removed = a.filter((l) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));
  assert.deepEqual(removed, [
    "CREATE FUNCTION public.process_question_attempt_v2(",
    "  -- Only the reviewed old/new spellings of this question's correct option are aliases.",
    "  IF jsonb_array_length(v_aliases) = 2",
  ]);
  assert.deepEqual(added, [
    "CREATE OR REPLACE FUNCTION public.process_question_attempt_v2(",
    "  -- Only reviewed earlier versions of this question's correct option are aliases: two or more",
    "  -- entries (D-280), always including both the stored key and the current content.correct.",
    "  IF jsonb_array_length(v_aliases) >= 2",
  ]);
  // Its alias rule is now D-280's, character for character.
  assert.match(SQL(D280_PATHS), /IF jsonb_array_length\(v_orthography_aliases\) >= 2\s+AND v_orthography_aliases \? v_instance\.correct_answer\s+AND v_orthography_aliases \? \(v_instance\.question_content->>'correct'\) THEN/);
  assert.match(aligned, /IF jsonb_array_length\(v_aliases\) >= 2\s+AND v_aliases \? v_instance\.correct_answer\s+AND v_aliases \? \(v_content ->> 'correct'\) THEN/);
});

// Builds on #519 (D-280 closeout): both D-280 files are applied in production (20261101101401,
// 20261101102339); part 1 is replayed, part 2 is data and skipped.
test("replay plan: H5, D-278, D-280 part 1 and both new files are replayed in file order; D-280 part 2 is not", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
  const plan = planReplay(files, (f) => SQL(f)).plan;
  const action = (f) => plan.find((p) => p.file === f)?.action;
  for (const f of [D280_PATHS, D280_TOP10]) assert.equal(NOT_IN_PRODUCTION[f], undefined, `${f}: applied in production`);
  for (const f of [H5, D278, D280_PATHS, BOOTSTRAP, ALIGN]) assert.equal(action(f), "apply", f);
  assert.equal(action(D280_TOP10), "skip");
  const applied = plan.filter((p) => p.action === "apply").map((p) => p.file).filter((f) => REPO_ORDER.includes(f));
  assert.deepEqual(applied, [...REPO_ORDER], "the replay applies REPO_ORDER, in that order");
});

// ── Both histories end in the same schema ──────────────────────────────────────────────────────
test("production history: 20261030211428 refuses after D-280 and leaves nothing; the bootstrap then succeeds", async () => {
  const db = await migrated([D280_PATHS, D278]);
  const before = await fingerprint(db);
  await assert.rejects(db.exec(SQL(H5)), /H5 PR 1: public\.process_question_attempt\(uuid,uuid,text,bigint\) er ændret siden analysen/);
  assert.deepEqual(await fingerprint(db), before, "nothing of 20261030211428 remains");
  assert.deepEqual(await h5Objects(db), NONE);
  await db.exec(SQL(BOOTSTRAP));
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Original, "the bootstrap creates the original _v2");
  await db.exec(SQL(ALIGN));
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Aligned);
});

test("repository and production histories end in exactly the same public schema", async () => {
  const repo = await fingerprint(await migrated(REPO_ORDER));
  const prod = await fingerprint(await migrated(PROD_ORDER));
  const prodOtherOrder = await fingerprint(await migrated([D278, D280_PATHS, BOOTSTRAP, ALIGN]));
  assert.deepEqual(prod, repo);
  assert.deepEqual(prodOtherOrder, repo, "D-278 and D-280 part 1 commute");
  assert.equal(repo.functions[MC_V2.replace("public.", "")][0], MD5.mcV2Aligned);
  assert.equal(repo.functions[PQA.replace("public.", "")][0], MD5.pqaD280);
  assert.equal(repo.functions[TEXT_V2.replace("public.", "")][0], MD5.textV2);
});

test("the bootstrap is a verified no-op on the repository history (only a NOTICE, no change)", async () => {
  const db = await migrated([H5, D278, D280_PATHS]);
  const before = await fingerprint(db);
  await db.exec(SQL(BOOTSTRAP));
  assert.deepEqual(await fingerprint(db), before);
});

// ── Unknown states are refused, and nothing is changed ──────────────────────────────────────────
test("the bootstrap refuses every unknown state and changes nothing", async () => {
  const cases = [
    ["without D-280 part 1 (production's bodies before 2026-11-01)", [], null, /har ikke D-280 del 1's krop \(md5 8f698c5b/],
    ["an unknown writer of answered", [D280_PATHS], `CREATE FUNCTION public.rogue() RETURNS void LANGUAGE sql AS
      $$ UPDATE public.question_instances SET answered = false $$;`, /ukendt funktion opdaterer answered\/repeat_count i question_instances: rogue\(\)/],
    ["another trigger on question_instances", [D280_PATHS], `CREATE FUNCTION public.t() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER other BEFORE UPDATE ON public.question_instances FOR EACH ROW EXECUTE FUNCTION public.t();`,
      /har allerede en trigger/],
    ["a partial H5 schema (round guard dropped)", [H5, D280_PATHS], "DROP TRIGGER question_instances_round_guard ON public.question_instances;",
      /findes kun delvist \(8 af 9 objekter\)/],
    ["a changed _v2 body", [H5, D280_PATHS], `CREATE OR REPLACE FUNCTION public.process_text_answer_v2(p_instance_id uuid, p_user_id uuid,
      p_user_answer text, p_is_correct boolean, p_round_no integer, p_submission_id uuid, p_review_text text, p_misconception_type text)
      RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '{}'::jsonb $$;`,
      /process_text_answer_v2\(uuid,uuid,text,boolean,integer,uuid,text,text\) har ikke den forventede krop/],
    ["_v2 granted to authenticated", [H5, D280_PATHS], `GRANT EXECUTE ON FUNCTION ${MC_V2} TO authenticated;`, /kan kaldes af PUBLIC, anon eller authenticated/],
    ["question_attempts granted to authenticated", [H5, D280_PATHS], "GRANT SELECT ON public.question_attempts TO authenticated;", /rettighederne på question_attempts/],
    ["a policy on question_attempts", [H5, D280_PATHS], "CREATE POLICY open ON public.question_attempts FOR SELECT USING (true);", /RLS slået til og ingen policies/],
    ["the round guard narrowed to one column", [H5, D280_PATHS], `DROP TRIGGER question_instances_round_guard ON public.question_instances;
      CREATE TRIGGER question_instances_round_guard BEFORE UPDATE OF answered ON public.question_instances
      FOR EACH ROW EXECUTE FUNCTION public.question_instances_round_guard();`, /ikke præcis de to H5-triggere/],
  ];
  for (const [label, order, tamper, error] of cases) {
    const db = await migrated(order);
    if (tamper) await db.exec(tamper);
    const before = await fingerprint(db);
    await assert.rejects(db.exec(SQL(BOOTSTRAP)), error, label);
    assert.deepEqual(await fingerprint(db), before, `${label}: nothing changed`);
  }
});

test("the alignment refuses without H5, without D-280, or with an unknown _v2 — and a second run changes nothing", async () => {
  await assert.rejects((await migrated([D280_PATHS])).exec(SQL(ALIGN)), /question_attempts findes ikke/);
  await assert.rejects((await migrated([H5])).exec(SQL(ALIGN)), /process_question_attempt har ikke D-280 del 1's krop/);
  const tampered = await migrated([H5, D280_PATHS, BOOTSTRAP]);
  await tampered.exec(`CREATE OR REPLACE FUNCTION ${MC_V2.replace(/\(.*/, "")}(p_student_id uuid, p_question_instance_id uuid, p_answer text,
    p_round_no integer, p_submission_id uuid, p_review_text text, p_misconception_type text)
    RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '{}'::jsonb $$;`);
  await assert.rejects(tampered.exec(SQL(ALIGN)), /process_question_attempt_v2 har en ukendt krop/);
  const db = await migrated(PROD_ORDER);
  const after = await fingerprint(db);
  await db.exec(SQL(ALIGN));
  assert.deepEqual(await fingerprint(db), after);
});

test("rollback before activation restores the pre-H5 schema; the two files then apply again", async () => {
  const pre = await fingerprint(await migrated([D280_PATHS, D278]));
  const db = await migrated(PROD_ORDER);
  const full = await fingerprint(db);
  await db.exec(ROLLBACK_SQL);
  assert.deepEqual(await fingerprint(db), pre);
  await db.exec(SQL(BOOTSTRAP));
  await db.exec(SQL(ALIGN));
  assert.deepEqual(await fingerprint(db), full);
});

// ── Grading: _v2 = process_question_attempt for the ten D-280 questions ─────────────────────────
// Every stored key a live instance can hold (the new text, the earlier text, an old spelling) × every
// text a pupil can send (the same, plus a wrong option) × first answer and repeat. Each combination
// runs on two pupils with identical instances: one through process_question_attempt, one through _v2.
async function gradingCases(db) {
  const rows = (await db.query(`SELECT id, content, metadata FROM public.questions WHERE id = ANY ($1) ORDER BY id`, [TOP10_ID])).rows;
  return rows.map((q) => {
    const aliases = Array.isArray(q.metadata?.danish_orthography_correct_aliases) ? q.metadata.danish_orthography_correct_aliases : [];
    const before = TOP10_BEFORE[TOP10_ID.indexOf(q.id)];
    const keys = [...new Set([q.content.correct, before.content.correct, ...aliases])];
    const wrong = q.content.options.find((o) => !keys.includes(o));
    return { id: q.id, aliases: aliases.length, keys, answers: [...keys, wrong] };
  });
}
async function compareAll(db, { v2Matches = () => true } = {}) {
  const diverged = new Set();
  let combos = 0;
  let expected = 0;
  for (const q of await gradingCases(db)) {
    expected += q.keys.length * q.answers.length * 2;
    for (const key of q.keys) for (const answer of q.answers) for (const repeat of [0, 1]) {
      const pl = await addPupil(db);
      const pv = await addPupil(db);
      const rl = await legacy(db, pl, await serve(db, pl, q.id, key, { repeat }), answer);
      const rv = await v2(db, pv, await serve(db, pv, q.id, key, { repeat }), answer, repeat + 1);
      combos++;
      assert.equal(rv.outcome, "recorded");
      const same = rv.status === rl.status && rv.correct_answer === rl.correct_answer
        && JSON.stringify(await effects(db, pv)) === JSON.stringify(await effects(db, pl));
      if (!same) diverged.add(q.aliases);
      if (v2Matches(q)) {
        assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, `${q.aliases} aliases, key ${key}, answer ${answer}, repeat ${repeat}`);
        assert.deepEqual(await effects(db, pv), await effects(db, pl), `effects: ${key} / ${answer} / ${repeat}`);
        assert.deepEqual([rv.xp_awarded, rv.coins_awarded], rl.status === "correct" ? (repeat ? [2, 1] : [10, 5]) : [0, 0]);
      }
    }
  }
  assert.equal(combos, expected);
  return { combos, diverged: [...diverged].sort() };
}
// The flint question: after D-280 part 2 its key is "Flint"; before it, the longer earlier text.
const FLINT = TOP10_BEFORE.findIndex((r) => r.content.correct.startsWith("Flint en hard sten"));

test("after D-280 part 2 on an H5 database: aligned _v2 grades and pays exactly as process_question_attempt", async () => {
  for (const order of [PROD_ORDER, REPO_ORDER]) {
    const db = await migrated(order);
    await db.exec(SQL(D280_TOP10));
    const { combos, diverged } = await compareAll(db);
    // 6 questions with 2 aliases (2 keys × 3 answers) + 4 with 3 (3 keys × 4 answers), × first/repeat.
    assert.equal(combos, (6 * 2 * 3 + 4 * 3 * 4) * 2);
    assert.deepEqual(diverged, []);
  }
});

test("why the alignment is needed: the original _v2 disagrees exactly on the four three-alias questions", async () => {
  const db = await migrated([D280_PATHS, D278, BOOTSTRAP]);            // H5 created, not aligned
  await db.exec(SQL(D280_TOP10));
  const { diverged } = await compareAll(db, { v2Matches: (q) => q.aliases !== 3 });
  assert.deepEqual(diverged, [3], "only questions with three aliases; the six with two agree");
  // The documented cases on the flint question: the earlier text on a re-keyed instance, and the new
  // text on an instance still holding the earlier key.
  const flint = { id: TOP10_ID[FLINT] };
  const earlier = TOP10_BEFORE[FLINT].content.correct;
  assert.equal((await db.query("SELECT content->>'correct' AS c FROM public.questions WHERE id = $1", [flint.id])).rows[0].c, "Flint");
  for (const [key, answer] of [["Flint", earlier], [earlier, "Flint"]]) {
    const p = await addPupil(db);
    assert.equal((await legacy(db, p, await serve(db, p, flint.id, key), answer)).status, "correct", `legacy: ${key} / ${answer}`);
    const q = await addPupil(db);
    assert.equal((await v2(db, q, await serve(db, q, flint.id, key), answer, 1)).status, "incorrect", `original _v2: ${key} / ${answer}`);
  }
});

test("before D-280 part 2 (production's questions today) the aligned _v2 also grades as process_question_attempt", async () => {
  const db = await migrated(PROD_ORDER);
  const { diverged } = await compareAll(db);
  assert.deepEqual(diverged, []);
});

// ── H5's guarantees on the final schema ────────────────────────────────────────────────────────
test("replay, conflict, round_closed, D-280's re-keying reopen, stale_round and append-only history", async () => {
  const db = await migrated(PROD_ORDER);
  await db.exec(SQL(D280_TOP10));
  const flint = { id: TOP10_ID[FLINT] };
  const old = TOP10_BEFORE[FLINT].content.correct;
  const p = await addPupil(db);
  const qi = await serve(db, p, flint.id, old);                          // an instance from before the change
  const sub = randomUUID();
  const first = await v2(db, p, qi, "Flint", 1, sub);
  assert.deepEqual([first.outcome, first.status, first.correct_answer, first.xp_awarded], ["recorded", "correct", "Flint", 10]);
  const afterFirst = await effects(db, p);
  const replay = await v2(db, p, qi, "Flint", 1, sub);
  assert.deepEqual({ ...replay, outcome: "recorded" }, first, "the frozen result");
  assert.deepEqual(await v2(db, p, qi, old, 1, sub), { outcome: "submission_conflict" });
  assert.deepEqual(await v2(db, p, qi, "Flint", 1), { outcome: "round_closed" });
  assert.deepEqual(await effects(db, p), afterFirst, "paid once");
  const attempt1 = (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1", [p])).rows;

  // A reopen through D-280's repeat path: round 2, key = the current text (it already is).
  // Repeats are a last resort: no unserved servable question may remain in the scope. Flint is made
  // the only active question of its subject for this test (test data, not a migration change).
  await db.query(`UPDATE public.questions SET is_active = false WHERE learning_objective = $1 AND id <> $2`,
    [TOP10_BEFORE[FLINT].learning_objective, flint.id]);
  const reopened = (await as(db, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 9::smallint, ARRAY[$2]) AS id`,
    [p, TOP10_BEFORE[FLINT].learning_objective]))[0].id;
  assert.equal(reopened, qi);
  assert.deepEqual((await db.query("SELECT repeat_count, answered, correct_answer FROM public.question_instances WHERE id = $1", [qi])).rows[0],
    { repeat_count: 1, answered: false, correct_answer: "Flint" });
  assert.deepEqual(await v2(db, p, qi, "Flint", 1), { outcome: "stale_round" });
  const second = await v2(db, p, qi, "Flint", 2);
  assert.deepEqual([second.outcome, second.round_no, second.xp_awarded, second.coins_awarded], ["recorded", 2, 2, 1]);
  const all = (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1 ORDER BY attempt_no", [p])).rows;
  assert.equal(all.length, 2);
  assert.equal(all[0].a, attempt1[0].a, "attempt 1 unchanged byte for byte");

  // The round guard still refuses a reopen that skips the round, and history cannot be edited.
  await assert.rejects(db.exec(`UPDATE public.question_instances SET answered = false WHERE id = '${qi}'`), /question_instances_round_guard/);
  await assert.rejects(db.exec(`UPDATE public.question_attempts SET xp_awarded = 99 WHERE student_id = '${p}'`), /append-only/);
});

test("D-280 part 2 on an H5 database with history: attempts unchanged, open keys re-keyed, no round guard error", async () => {
  const db = await migrated(PROD_ORDER);
  const p = await addPupil(db);
  const answered = await serve(db, p, TOP10_ID[0], TOP10_BEFORE[0].content.correct);
  await v2(db, p, answered, TOP10_BEFORE[0].content.correct, 1);
  const other = await addPupil(db);                                    // one instance per pupil and question
  const open = await serve(db, other, TOP10_ID[0], TOP10_BEFORE[0].content.correct);
  const history = (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a ORDER BY id")).rows;
  await db.exec(SQL(D280_TOP10));
  assert.deepEqual((await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a ORDER BY id")).rows, history);
  const q = (await db.query("SELECT content->>'correct' AS c FROM public.questions WHERE id = $1", [TOP10_ID[0]])).rows[0].c;
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [open])).rows[0].correct_answer, q);
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [answered])).rows[0].correct_answer,
    TOP10_BEFORE[0].content.correct, "an answered instance keeps its key");
});

// ── D-278 on the final schema ───────────────────────────────────────────────────────────────────
test("D-278 still counts from the answers _v2 records, and still restricts", async () => {
  const db = await migrated(PROD_ORDER);
  const p = await addPupil(db);
  for (let i = 0; i < 3; i++) await v2(db, p, await serve(db, p, TOP10_ID[i], TOP10_BEFORE[i].content.correct), TOP10_BEFORE[i].content.correct, 1);
  await db.exec(`SET test.uid = '${p}'`);
  await as(db, "authenticated", "SELECT public.update_best_session_streak(999)");
  assert.equal((await db.query("SELECT best_session_streak FROM public.student_progress WHERE student_id = $1", [p])).rows[0].best_session_streak, 3,
    "counted by the server (p_count ignored)");
  await as(db, "authenticated", "SELECT public.set_night_correct()");
  assert.equal((await db.query("SELECT night_correct FROM public.student_progress WHERE student_id = $1", [p])).rows[0].night_correct,
    (await db.query(`SELECT bool_or((answered_at AT TIME ZONE 'Europe/Copenhagen')::time < time '04:00') AS n FROM public.question_instances
      WHERE student_id = $1 AND was_correct`, [p])).rows[0].n === true, "only with a correct answer at night");
  await db.exec("RESET test.uid");
  assert.equal((await effects(db, p)).weekly.find((w) => w.quest_key === "w_answers").progress, 3, "weekly quests advanced by _v2 (SECURITY DEFINER)");
  await assert.rejects(as(db, "authenticated", `UPDATE public.student_weekly_quest_progress SET progress = 50 WHERE student_id = '${p}'`), /permission denied/);
  await assert.rejects(as(db, "anon", "SELECT public.update_best_session_streak(1)"), /permission denied/);
});
