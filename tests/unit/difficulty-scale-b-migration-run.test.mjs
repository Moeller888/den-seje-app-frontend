// RUNTIME proof for migration 20261022120000_difficulty_scale_b (the level engine), executed UNMODIFIED on
// a real PostgreSQL (PGlite, in-process — no Docker, no network) in production order:
//   production-faithful base schema (helpers/prod-base-schema.mjs, read from the live catalog)
//   → 20261019150000 (#351) → 20261020120000 (A) → 20261022120000 (B), with inactive, levelled rows
//   shaped like the content PRs (#358…#365, inserted INACTIVE with metadata.level_batch).
// The live get_unserved_questions_for_student / request_repeat_question_for_student are read unmodified
// from 20261016160000 so the four flag combinations run against real SQL.
//
// What this proves:
//   1. PRIVILEGES: every new function is SECURITY INVOKER with a pinned search_path and EXECUTE for
//      service_role only (despite the live default privileges); the fold log has RLS and no client
//      privileges; a pupil cannot write her own level — not directly, not through the functions, not even
//      if EXECUTE were granted by mistake.
//   2. CANDIDATES: never inactive, never without difficulty_level, never served, never an unservable
//      format; nearest level first; no grade ceiling; deterministic per pupil; loud on bad input.
//   3. LEVEL: the SQL fold equals the TS twin (level-flow.ts foldLevel) on random sequences; seeds per
//      §4.2 (placement for historie only); only first, auto-graded verdicts of the subject move it; each
//      instance moves it exactly once — repeated calls (retry), a double submit that rewrites the verdict,
//      and a fold row written by a concurrent call between selection and insert are all no-ops.
//   4. REPEAT: the level pool's exhaustion and guards; never reopens an inactive or unlevelled question.
//   5. FLAGS: the four combinations (both off, only QUESTION_MIX_ENGINE, only LEVEL_ENGINE, both) through
//      the real TS flows and real SQL; with LEVEL_ENGINE off nothing level-related is read or written.
//   6. INDEXES: B's indexes exist next to A's.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6), single-connection and superuser. Two truly
// parallel advance_student_level calls cannot be raced here; the row lock is asserted in the SQL text and
// the exactly-once insert path (ON CONFLICT on the fold log's primary key) is exercised directly.
// PostgREST is not in the loop: RPCs are called as SQL with the same named arguments. Passing is not
// permission to apply (D-110).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PROD_BASE_SQL, LEVEL_ENGINE_MIGRATIONS } from "./helpers/prod-base-schema.mjs";
import {
  chooseSelectionRoute, foldLevel, loadLevelPlan, LEVEL_CANDIDATES_RPC, LEVEL_RPC,
} from "../../supabase/functions/get-next-question/level-flow.ts";
import { loadFormatMixPlan, HISTORY_SELECT } from "../../supabase/functions/get-next-question/mix-flow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mig = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
const [MIX, A, B] = LEVEL_ENGINE_MIGRATIONS.map(mig);
const LIVE_RPCS = mig("20261016160000_answer_keys_server_side_rpcs.sql");
const liveFunction = (name) => {
  const m = LIVE_RPCS.match(new RegExp(String.raw`CREATE FUNCTION public\.${name}\([\s\S]*?\n\$\$;\n\nREVOKE[^\n]*\nGRANT[^\n]*`));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
};

const uuid = (p, n) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PUPILS = Array.from({ length: 40 }, (_, i) => uuid("11111111", i));
const HISTORY = ["vikings", "middle_ages", "world_war_2", "cold_war"];

// Questions: 280 English + 280 history MC across grade 3-9 × band 1-5 (A gives them a level), plus
// special rows inserted AFTER migration A so they keep difficulty_level NULL, an inactive levelled row,
// an unservable row and a teacher-graded long answer.
const ROWS = [];
for (let i = 0; i < 560; i++) {
  const lo = i < 280 ? "english" : HISTORY[i % 4];
  ROWS.push({ id: uuid("22222222", i), lo, g: 3 + (i % 7), b: 1 + (Math.floor(i / 7) % 5), f: "mc", t: "short",
    c: { question: `Q${i}?`, options: ["a", "b", "c"], correct: "a", accepted_answers: ["a"] } });
}
const NULL_LEVEL = uuid("33333333", 1);
const INACTIVE_LEVELLED = uuid("33333333", 2);
const MATCH = uuid("33333333", 3);
const LONG = uuid("33333333", 4);

let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
async function insertQuestion(r, { active = true, level } = {}) {
  await db.exec(`INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, metadata, target_grade, difficulty_band${level === undefined ? "" : ", difficulty_level"})
    VALUES ('${r.id}', 'mc_single', ${sqlStr(JSON.stringify(r.c))}, 1, ${active}, 'auto', '${r.lo}', '${r.f}', '${r.t}', '{}',
      ${r.g ?? "NULL"}, ${r.b ?? "NULL"}${level === undefined ? "" : `, ${level === null ? "NULL" : level}`});`);
}

before(async () => {
  db = new PGlite();
  await db.exec(PROD_BASE_SQL);
  await db.exec(`INSERT INTO auth.users VALUES ${PUPILS.map((p) => `('${p}')`).join(", ")};`);
  await db.exec(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ${PUPILS.map((p, i) => `('${p}', 'student', ${3 + (i % 7)})`).join(", ")};`);
  for (const r of ROWS) await insertQuestion(r);
  await db.exec(liveFunction("get_unserved_questions_for_student"));
  await db.exec(liveFunction("request_repeat_question_for_student"));
  await db.exec(MIX);
  await db.exec(A);
  await db.exec(B);
  // Rows added after A: A's backfill has already run, so these keep NULL unless a level is given.
  await insertQuestion({ id: NULL_LEVEL, lo: "english", g: null, b: null, f: "mc", t: "short",
    c: { question: "No level?", options: ["x", "y"], correct: "x" } });
  await insertQuestion({ id: INACTIVE_LEVELLED, lo: "english", g: 5, b: 3, f: "mc", t: "short",
    c: { question: "Inactive levelled?", options: ["x", "y"], correct: "x" } }, { active: false, level: 5000 });
  // Unservable but allowed by the live constraints (questions_answer_format_check admits only mc /
  // number / text, so a "match" row cannot even be stored): a non-canonical answer_type.
  await insertQuestion({ id: MATCH, lo: "english", g: 5, b: 3, f: "mc", t: "SHORT",
    c: { question: "Unservable?", options: ["x", "y"], correct: "x" } }, { level: 5000 });
  await insertQuestion({ id: LONG, lo: "english", g: 5, b: 3, f: "text", t: "long",
    c: { question: "Explain?", correct: "x", type: "text" } }, { level: 5000 });
  // 40 inactive, levelled, tagged rows across the scale — the shape of the content PRs.
  for (let i = 0; i < 40; i++) {
    const lvl = 1 + i * 250;
    await db.exec(`INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
        answer_format, answer_type, metadata, target_grade, difficulty_band, difficulty_level)
      VALUES ('${uuid("55555555", i)}', 'mc_single', ${sqlStr(JSON.stringify({ question: `Pilot ${i}?`, options: ["a", "b"], correct: "a" }))},
        1, false, 'auto', 'english', 'mc', 'short', '{"level_batch": "pilot"}', 3, 1, ${lvl});`);
  }
});

// One statement as `role` with auth.uid() = uid, in a rolled-back transaction → { rows } | { error }.
async function as(role, uid, sql, params = []) {
  await db.exec("BEGIN");
  try {
    await db.exec(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('test.uid', $1, true)", [uid ?? ""]);
    return { rows: (await db.query(sql, params)).rows };
  } catch (e) {
    return { error: String(e.message) };
  } finally {
    await db.exec("ROLLBACK");
  }
}

// A supabase-js-shaped client over PGlite: rpc() → SELECT * FROM fn(named args); from() supports the one
// history read the flows make (HISTORY_SELECT), returning PostgREST's to-one embed shape.
function pgClient(log = []) {
  const typeOf = (k, v) => (Array.isArray(v) ? "::text[]" : k === "p_grade" ? "::smallint"
    : ["p_level", "p_limit", "p_per_group"].includes(k) ? "::integer" : k.endsWith("_id") ? "::uuid" : "::text");
  return {
    log,
    async rpc(fn, args) {
      log.push(`rpc:${fn}`);
      const keys = Object.keys(args);
      const sql = `SELECT * FROM public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${typeOf(k, args[k])}`).join(", ")})`;
      try {
        const rows = (await db.query(sql, keys.map((k) => args[k]))).rows;
        const scalar = rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === fn;
        return { data: scalar ? rows[0][fn] : rows, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    from(table) {
      return {
        select(cols) {
          assert.equal(table, "question_instances");
          assert.equal(cols, HISTORY_SELECT, "the only history read the flows make");
          return { eq: (_c, student) => ({ order: () => ({ limit: async (n) => {
            log.push("from:question_instances");
            const rows = (await db.query(`SELECT qi.created_at, q.answer_format, q.answer_type, q.difficulty_band,
                q.learning_objective, q.content -> 'force_text' AS force_text
              FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id
              WHERE qi.student_id = $1 ORDER BY qi.created_at DESC LIMIT $2`, [student, n])).rows;
            return { data: rows.map((r) => ({ created_at: r.created_at, questions: { answer_format: r.answer_format,
              answer_type: r.answer_type, difficulty_band: r.difficulty_band, learning_objective: r.learning_objective,
              force_text: r.force_text } })), error: null };
          } }) }) };
        },
      };
    },
  };
}

const serve = (student, questionId) =>
  q("INSERT INTO public.question_instances (student_id, question_id) VALUES ($1, $2) RETURNING id", [student, questionId]);
// What process_question_attempt does on an auto-graded answer: the verdict and answered_at = now() in one UPDATE.
async function answer(student, questionId, correct, at) {
  const [row] = await serve(student, questionId);
  await q(`UPDATE public.question_instances SET answered = true, was_correct = $2, user_answer = 'x',
    answered_at = $3::timestamptz WHERE id = $1`, [row.id, correct, at]);
  return row.id;
}
const advance = async (student, subject, grade) =>
  (await q("SELECT * FROM public.advance_student_level($1::uuid, $2, $3::smallint)", [student, subject, grade]))[0];
const candidates = (student, level, domains, limit) => q(
  `SELECT * FROM public.get_level_questions_for_student($1::uuid, $2::integer, $3::text[]${limit === undefined ? "" : ", $4::integer"})`,
  limit === undefined ? [student, level, domains] : [student, level, domains, limit]);
const english = ROWS.filter((r) => r.lo === "english");
const levelOf = async (id) => (await q("SELECT difficulty_level FROM public.questions WHERE id = $1", [id]))[0].difficulty_level;

// ── 1. Privileges ───────────────────────────────────────────────────────────
const FUNCS = [
  "advance_student_level(uuid,text,smallint)",
  "get_level_questions_for_student(uuid,integer,text[],integer)",
  "request_repeat_level_question_for_student(uuid,text[])",
];

test("every new function is SECURITY INVOKER, search_path-pinned and EXECUTE for service_role only", async () => {
  for (const f of FUNCS) {
    const [row] = await q(`SELECT p.prosecdef, p.proconfig,
        has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') AS auth,
        has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') AS svc,
        has_function_privilege('public', $1::regprocedure, 'EXECUTE') AS pub
      FROM pg_proc p WHERE p.oid = $1::regprocedure`, [`public.${f}`]);
    assert.equal(row.prosecdef, false, `${f} must be SECURITY INVOKER`);
    // The candidate search also plans with the call's values (its window needs real row estimates).
    assert.deepEqual(row.proconfig, f.startsWith("get_level_questions_for_student")
      ? ["search_path=public, pg_temp", "plan_cache_mode=force_custom_plan"] : ["search_path=public, pg_temp"], `${f} config`);
    assert.deepEqual([row.anon, row.auth, row.pub, row.svc], [false, false, false, true], f);
  }
  assert.doesNotMatch(B, /SECURITY DEFINER\s*\n/, "no SECURITY DEFINER in executable SQL");
});

test("the fold log has RLS, no policy and no client privilege; student_subject_level stays read-only for clients", async () => {
  const [rls] = await q("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_level_fold_log'::regclass");
  assert.equal(rls.relrowsecurity, true);
  assert.equal((await q("SELECT count(*)::int n FROM pg_policies WHERE tablename = 'student_level_fold_log'"))[0].n, 0);
  for (const role of ["anon", "authenticated"]) {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const [r] = await q(`SELECT has_table_privilege($1, 'public.student_level_fold_log', $2) AS ok`, [role, priv]);
      assert.equal(r.ok, false, `${role} ${priv} on the fold log`);
    }
    for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
      const [r] = await q(`SELECT has_table_privilege($1, 'public.student_subject_level', $2) AS ok`, [role, priv]);
      assert.equal(r.ok, false, `${role} ${priv} on student_subject_level`);
    }
  }
});

test("a pupil cannot change her own level: not directly, not via the functions, not even with a mistaken EXECUTE grant", async () => {
  const p = PUPILS[0];
  await advance(p, "engelsk", 3);
  for (const sql of [
    "UPDATE public.student_subject_level SET level = 10000 WHERE student_id = $1",
    "INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'dansk', 10000)",
    "DELETE FROM public.student_subject_level WHERE student_id = $1",
    "SELECT * FROM public.advance_student_level($1::uuid, 'engelsk', 3::smallint)",
    "SELECT * FROM public.get_level_questions_for_student($1::uuid, 5000, ARRAY['english'])",
    "SELECT public.request_repeat_level_question_for_student($1::uuid, ARRAY['english'])",
    "INSERT INTO public.student_level_fold_log (question_instance_id, student_id, subject, was_correct, level_before, level_after) SELECT id, $1, 'engelsk', true, 1, 10000 FROM public.question_instances LIMIT 1",
  ]) {
    for (const role of ["authenticated", "anon"]) {
      const r = await as(role, p, sql, [p]);
      assert.match(r.error ?? "", /permission denied/, `${role}: ${sql}`);
    }
  }
  // Defence in depth: even if EXECUTE were granted, SECURITY INVOKER runs with the pupil's own rights.
  await db.exec("BEGIN");
  try {
    await db.exec("GRANT EXECUTE ON FUNCTION public.advance_student_level(uuid, text, smallint) TO authenticated");
    await db.exec("SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('test.uid', $1, true)", [p]);
    await assert.rejects(db.query("SELECT * FROM public.advance_student_level($1::uuid, 'dansk', 3::smallint)", [p]),
      /permission denied/);
  } finally {
    await db.exec("ROLLBACK");
  }
  const [row] = await q("SELECT level FROM public.student_subject_level WHERE student_id = $1 AND subject = 'engelsk'", [p]);
  assert.equal(row.level, 143);
});

// ── 2. Candidates ───────────────────────────────────────────────────────────
test("candidates: never inactive, never unlevelled, never unservable, never served; nearest level first", async () => {
  const p = PUPILS[1];
  const pilotIds = new Set((await q("SELECT id FROM public.questions WHERE metadata->>'level_batch' = 'pilot'")).map((r) => r.id));
  assert.equal(pilotIds.size, 40);
  const served = english.slice(0, 5).map((r) => r.id);
  for (const [i, id] of served.entries()) await answer(p, id, i % 2 === 0, `2026-10-22T05:0${i}:00Z`);
  for (const lvl of [1, 143, 3000, 5000, 7777, 10000]) {
    const rows = await candidates(p, lvl, ["english"], 100);
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.ok(!pilotIds.has(r.id), "inactive pilot row returned");
      assert.notEqual(r.id, INACTIVE_LEVELLED);
      assert.notEqual(r.id, NULL_LEVEL);
      assert.notEqual(r.id, MATCH, "unservable format");
      assert.ok(!served.includes(r.id), "already served");
      assert.ok(Number.isInteger(r.difficulty_level));
      assert.equal(r.learning_objective, "english");
    }
    const d = rows.map((r) => Math.abs(r.difficulty_level - lvl));
    for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1], `nearest first at level ${lvl}`);
  }
});

test("candidates in a small pool: inactive and unlevelled rows are excluded, not merely sorted last", async () => {
  // In a large pool a NULL level would sort behind every levelled row and never reach the limit, so the
  // exclusion is proven where it would otherwise surface: a pool smaller than the limit.
  const mk = (i) => ({ id: uuid("66666666", i), lo: "small_pool", g: 5, b: 2, f: "mc", t: "short",
    c: { question: `Small ${i}?`, options: ["a", "b"], correct: "a" } });
  await insertQuestion(mk(1), { level: 2000 });
  await insertQuestion(mk(2), { level: null });
  await insertQuestion(mk(3), { active: false, level: 2000 });
  await insertQuestion({ ...mk(4), t: "SHORT" }, { level: 2000 });
  for (const lvl of [1, 2000, 10000]) {
    assert.deepEqual((await candidates(PUPILS[7], lvl, ["small_pool"], 100)).map((r) => r.id), [mk(1).id], `level ${lvl}`);
  }
});

test("candidates: no grade ceiling, deterministic per pupil, limits clamped, loud on bad input", async () => {
  const p = PUPILS[2]; // profile grade 5 — irrelevant: the function takes no grade
  const high = await candidates(p, 9800, ["english"], 10);
  assert.ok(high.every((r) => r.difficulty_level >= 9000), "a grade-5 pupil at level 9800 gets the top of the scale");
  assert.deepEqual(await candidates(p, 5000, ["english"], 20), await candidates(p, 5000, ["english"], 20));
  assert.equal((await candidates(p, 5000, ["english"], 1000)).length, 100);
  assert.equal((await candidates(p, 5000, ["english"], 0)).length, 1);
  assert.equal((await candidates(p, 5000, ["english"])).length, 50);
  // Different pupils break level ties differently (md5 of student and question).
  const tieA = (await candidates(PUPILS[3], 143, ["english"], 8)).map((r) => r.id);
  const tieB = (await candidates(PUPILS[4], 143, ["english"], 8)).map((r) => r.id);
  assert.notDeepEqual(tieA, tieB);
  for (const [lvl, domains, re] of [[0, ["english"], /invalid_level/], [10001, ["english"], /invalid_level/],
    [null, ["english"], /invalid_level/], [500, [], /missing_domains/], [500, null, /missing_domains/]]) {
    await assert.rejects(q("SELECT * FROM public.get_level_questions_for_student($1::uuid, $2::integer, $3::text[])", [p, lvl, domains]), re);
  }
  await assert.rejects(q("SELECT * FROM public.get_level_questions_for_student(NULL, 500, ARRAY['english'])"), /missing_student_id/);
});

// ── 3. The level ────────────────────────────────────────────────────────────
test("seed per §4.2: grade start band; placement seeds historie only; no grade → 143; fixed at creation", async () => {
  const p = PUPILS[5];
  assert.deepEqual(await advance(p, "engelsk", 9), { level: 9286, seed_level: 9286, seed_source: "grade", answered: 0, newly_folded: 0 });
  await q("INSERT INTO public.placement_sessions (student_id, completed_at, band) VALUES ($1, now(), 4)", [p]);
  assert.equal((await advance(p, "historie", 7)).level, 6714);                 // grade 7, placement band 4
  assert.equal((await advance(p, "historie", 7)).seed_source, "placement");
  assert.equal((await advance(p, "dansk", 7)).seed_source, "grade");           // placement measures history only
  assert.equal((await advance(PUPILS[6], "engelsk", null)).level, 143);
  // The grade is a starting point only: a later grade change does not reset the level.
  assert.equal((await advance(p, "engelsk", 3)).level, 9286);
  await assert.rejects(q("SELECT * FROM public.advance_student_level($1::uuid, 'matematik', 5::smallint)", [p]), /invalid_subject/);
  await assert.rejects(q("SELECT * FROM public.advance_student_level(NULL, 'engelsk', 5::smallint)"), /missing_student_id/);
});

test("the SQL fold equals the TS twin (foldLevel) on random answer sequences", async () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 6; k++) {
    const p = PUPILS[10 + k];
    const start = await advance(p, "engelsk", 3 + k);
    const verdicts = Array.from({ length: 25 }, () => rnd() < 0.7);
    const pool = english.filter((_r, i) => (i + k) % 3 === 0);
    for (let i = 0; i < verdicts.length; i++) {
      await answer(p, pool[i].id, verdicts[i], `2026-10-22T10:${String(i).padStart(2, "0")}:00Z`);
    }
    const sql = await advance(p, "engelsk", 3 + k);
    const ts = foldLevel({ level: start.level, answered: 0 }, verdicts);
    assert.deepEqual({ level: sql.level, answered: sql.answered }, ts, `pupil ${k}`);
    assert.equal(sql.newly_folded, 25);
  }
});

test("only first, auto-graded verdicts of the subject move the level", async () => {
  const p = PUPILS[20];
  const start = (await advance(p, "engelsk", 5)).level;
  // Ignored: another subject, an unanswered instance, a teacher-graded long answer, a teacher-scored
  // instance, a re-answered repeat.
  await answer(p, ROWS.find((r) => r.lo === "vikings").id, true, "2026-10-22T09:00:00Z");
  await serve(p, english[100].id).then(() => q("UPDATE public.question_instances SET answered = true WHERE student_id = $1 AND question_id = $2", [p, english[100].id]));
  const longId = await answer(p, LONG, true, "2026-10-22T09:01:00Z");
  const scored = await answer(p, english[101].id, true, "2026-10-22T09:02:00Z");
  await q("UPDATE public.question_instances SET teacher_score = 3 WHERE id = $1", [scored]);
  const rep = await answer(p, english[102].id, true, "2026-10-22T09:03:00Z");
  await q("UPDATE public.question_instances SET repeat_count = 1 WHERE id = $1", [rep]);
  const r1 = await advance(p, "engelsk", 5);
  assert.deepEqual([r1.level, r1.answered, r1.newly_folded], [start, 0, 0]);
  assert.ok(longId);
  // One valid first answer moves it once.
  await answer(p, english[103].id, true, "2026-10-22T09:04:00Z");
  const r2 = await advance(p, "engelsk", 5);
  assert.deepEqual([r2.level, r2.answered, r2.newly_folded], [start + 150, 1, 1]);
  // History is unaffected by English answers.
  assert.equal((await advance(p, "historie", 5)).answered, 1);
});

test("exactly once: retry after a lost response, a double submit and a concurrent fold row are all no-ops", async () => {
  const p = PUPILS[21];
  const start = (await advance(p, "engelsk", 4)).level;
  const inst = await answer(p, english[110].id, false, "2026-10-22T08:00:00Z");
  const first = await advance(p, "engelsk", 4);
  assert.deepEqual([first.level, first.newly_folded], [Math.max(1, start - 450), 1]);
  // Retry: the request committed, the response was lost, the client calls again.
  const retry = await advance(p, "engelsk", 4);
  assert.deepEqual([retry.level, retry.answered, retry.newly_folded], [first.level, 1, 0]);
  // Double submit that slipped past the answer path: same instance, new verdict, later timestamp.
  await q("UPDATE public.question_instances SET was_correct = true, answered_at = '2026-10-22T08:05:00Z' WHERE id = $1", [inst]);
  const dbl = await advance(p, "engelsk", 4);
  assert.deepEqual([dbl.level, dbl.answered, dbl.newly_folded], [first.level, 1, 0]);
  // A concurrent call folded this instance between our selection and our insert: we must not step.
  const inst2 = await answer(p, english[111].id, true, "2026-10-22T08:10:00Z");
  await q(`INSERT INTO public.student_level_fold_log (question_instance_id, student_id, subject, was_correct, level_before, level_after)
           VALUES ($1, $2, 'engelsk', true, 1, 1)`, [inst2, p]);
  const conc = await advance(p, "engelsk", 4);
  assert.deepEqual([conc.level, conc.answered, conc.newly_folded], [first.level, 1, 0]);
  assert.equal((await q("SELECT count(*)::int n FROM public.student_level_fold_log WHERE question_instance_id = $1", [inst2]))[0].n, 1);
  // The serialising row lock is in the function (PGlite cannot race two connections).
  assert.match(B, /FROM public\.student_subject_level sl\s+WHERE sl\.student_id = p_student_id AND sl\.subject = p_subject\s+FOR UPDATE;/);
  assert.match(B, /ON CONFLICT \(question_instance_id\) DO NOTHING;\s+GET DIAGNOSTICS v_rows = ROW_COUNT;/);
});

test("the level stays within 1..10000", async () => {
  const lo = PUPILS[22];
  await advance(lo, "engelsk", 3);
  for (let i = 0; i < 4; i++) await answer(lo, english[120 + i].id, false, `2026-10-22T07:0${i}:00Z`);
  assert.equal((await advance(lo, "engelsk", 3)).level, 1);
  const hi = PUPILS[23];
  await advance(hi, "engelsk", 9);
  for (let i = 0; i < 12; i++) await answer(hi, english[130 + i].id, true, `2026-10-22T07:${String(10 + i)}:00Z`);
  assert.equal((await advance(hi, "engelsk", 9)).level, 10000);
});

// ── 4. Repeat ───────────────────────────────────────────────────────────────
test("level repeat: only when the levelled pool is exhausted, never an inactive or unlevelled question", async () => {
  const p = PUPILS[24];
  const repeat = () => q("SELECT public.request_repeat_level_question_for_student($1::uuid, ARRAY['dummy_domain']) AS id", [p]);
  // A private domain: two levelled MC, one unlevelled, one inactive levelled.
  const mk = (i, extra = {}) => ({ id: uuid("44444444", i), lo: "dummy_domain", g: 5, b: 2, f: "mc", t: "short",
    c: { question: `Dummy ${i}?`, options: ["a", "b"], correct: "a" }, ...extra });
  await insertQuestion(mk(1), { level: 3000 });
  await insertQuestion(mk(2), { level: 3100 });
  await insertQuestion(mk(3), { level: null });
  await insertQuestion(mk(4), { active: false, level: 3200 });
  const a1 = await answer(p, mk(1).id, false, "2026-10-22T06:00:00Z");
  assert.equal((await repeat())[0].id, null, "a levelled unserved question is left");
  await answer(p, mk(2).id, true, "2026-10-22T06:01:00Z");
  // The unlevelled and the inactive row do not count as "left": the pool is exhausted → repeat.
  const [r] = await repeat();
  assert.equal(r.id, a1, "incorrect first");
  assert.equal((await repeat())[0].id, null, "an open instance blocks a second repeat");
  const reopened = await q("SELECT question_id, repeat_count, answered FROM public.question_instances WHERE id = $1", [a1]);
  assert.deepEqual(reopened[0], { question_id: mk(1).id, repeat_count: 1, answered: false });
});

// ── 5. The four flag combinations ───────────────────────────────────────────
test("flag matrix: both off / only QUESTION_MIX_ENGINE / only LEVEL_ENGINE / both", async () => {
  const p = PUPILS[30]; // grade 3
  const grade = 3;
  const base = { studentId: p, grade, domains: ["english"], wavePhase: "challenge", lastMisconceptionType: null };
  const levelRows = async () => (await q("SELECT count(*)::int n FROM public.student_subject_level WHERE student_id = $1", [p]))[0].n;
  const gradeOf = async (id) => (await q("SELECT target_grade FROM public.questions WHERE id = $1", [id]))[0].target_grade;

  // Both off: today's RPC, grade ceiling, nothing level-related touched.
  let route = chooseSelectionRoute("v1", "off");
  assert.equal(route.newQuestions, "v1");
  const v1 = (await pgClient().rpc("get_unserved_questions_for_student", { p_student_id: p, p_grade: grade, p_domains: ["english"] })).data;
  for (const r of v1) assert.ok((await gradeOf(r.id)) <= grade);
  assert.equal(await levelRows(), 0);

  // Only the format mix: its RPCs, grade ceiling, nothing level-related touched.
  route = chooseSelectionRoute("v2", "off");
  assert.equal(route.newQuestions, "mix");
  const mixLog = [];
  const mix = await loadFormatMixPlan(pgClient(mixLog), base);
  assert.ok(mix.plan.ordered.length > 0);
  for (const r of mix.plan.ordered) assert.ok((await gradeOf(r.id)) <= grade);
  assert.ok(!mixLog.some((l) => l.includes(LEVEL_RPC) || l.includes(LEVEL_CANDIDATES_RPC)));
  assert.equal(await levelRows(), 0, "LEVEL_ENGINE off writes no level");

  // Only the level engine: advance → nearest-level candidates, no grade ceiling once the level rises.
  route = chooseSelectionRoute("v1", "v1");
  assert.equal(route.newQuestions, "level");
  await q("INSERT INTO public.student_subject_level (student_id, subject, level) VALUES ($1, 'engelsk', 8000)", [p]);
  const lvlLog = [];
  const lvl = await loadLevelPlan(pgClient(lvlLog), { ...base, subject: "engelsk", mixEngine: "v1" });
  assert.deepEqual(lvlLog, [`rpc:${LEVEL_RPC}`, `rpc:${LEVEL_CANDIDATES_RPC}`], "no history read without the mix");
  assert.equal(lvl.level.level, 8000);
  assert.ok(lvl.ordered.length > 0);
  assert.ok((await gradeOf(lvl.ordered[0].id)) > grade, "a grade-3 pupil at level 8000 is served above grade 3");
  for (const r of lvl.ordered) {
    assert.ok(Number.isInteger(await levelOf(r.id)));
    assert.notEqual(r.id, INACTIVE_LEVELLED);
  }

  // Both: the level engine's candidates ordered by the format mix.
  route = chooseSelectionRoute("v2", "v1");
  assert.equal(route.newQuestions, "level+mix");
  const bothLog = [];
  const both = await loadLevelPlan(pgClient(bothLog), { ...base, subject: "engelsk", mixEngine: "v2" });
  assert.deepEqual(bothLog, [`rpc:${LEVEL_RPC}`, `rpc:${LEVEL_CANDIDATES_RPC}`, "from:question_instances"]);
  assert.ok(both.mixKind !== undefined);
  assert.deepEqual(new Set(both.ordered.map((r) => r.id)), new Set(lvl.ordered.map((r) => r.id)),
    "the mix only reorders the level engine's window");
});

// ── 6. Content and indexes ──────────────────────────────────────────────────
test("B's indexes exist next to A's; rows added after A keep difficulty_level NULL", async () => {
  const idx = (await q("SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_qi_student_answered', 'idx_questions_objective_level', 'idx_student_level_fold_log_student')")).map((r) => r.indexname).sort();
  assert.deepEqual(idx, ["idx_qi_student_answered", "idx_questions_objective_level", "idx_student_level_fold_log_student"]);
  assert.equal(await levelOf(NULL_LEVEL), null);
});

test("migration B touches no existing function, policy or grant", () => {
  const exec = B.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const created = [...exec.matchAll(/CREATE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(created, ["advance_student_level", "get_level_questions_for_student", "request_repeat_level_question_for_student"]);
  assert.doesNotMatch(exec, /CREATE OR REPLACE|DROP |ALTER TABLE public\.(questions|question_instances|profiles|student_subject_level)|CREATE POLICY|GRANT [^;]* TO (anon|authenticated)/);
  assert.match(B, /Må KUN anvendes via apply_migration med særskilt ejer-autorisation \(D-110\)/);
});
