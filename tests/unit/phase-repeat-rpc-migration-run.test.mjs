// RUNTIME proof for migration 20261113170000_phase_repeat_rpc (D-362), PGlite on the replayed production schema.
// The migration file is executed UNMODIFIED (it is NOT_IN_PRODUCTION, so the replay skips it). Synthetic pupils only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "20261113170000_phase_repeat_rpc.sql";
const SIG = "public.request_repeat_phase_question_for_student(uuid,text[],uuid[],integer)";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db, ROWS;

before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(read("supabase/migrations/20261108090100_stimulus_pilot_content.sql"));
  ROWS = (await db.query(`UPDATE public.questions SET is_active = true WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = 'stimulus'
    RETURNING id, difficulty_level, content`)).rows.sort((a, b) => a.difficulty_level - b.difficulty_level);
  assert.equal(await fnExists(), false, "not part of the replayed production schema");
  await db.exec(read(`supabase/migrations/${FILE}`));
});
after(async () => { await db?.close(); });

const fnExists = async () => (await db.query("SELECT to_regprocedure($1) IS NOT NULL AS e", [SIG])).rows[0].e;
let n = 300;
async function pupil(domains = ["pilot_d362"]) {
  const id = uid(n++);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `phaserpc-${n}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', 7, $2::text[])", [id, domains]);
  return id;
}
// An answered round: was_correct as given, answered_at spaced so "oldest first" is deterministic.
async function answered(p, row, { correct, repeat = 0, minutesAgo = 10 }) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot,
      repeat_count, next_review_at, was_correct, user_answer, answered_at)
    VALUES ($1, $2, true, $3, 1, 1, $4, now(), $5, 'x', now() - make_interval(mins => $6)) RETURNING id`, [p, row.id, row.content.correct, repeat, correct, minutesAgo])).rows[0].id;
}
async function repeat(p, ids, { domains = ["pilot_d362"], max = 2 } = {}) {
  await db.exec("SET ROLE service_role");
  try { return (await db.query(`SELECT public.request_repeat_phase_question_for_student($1, $2::text[], $3::uuid[], $4) AS id`, [p, domains, ids, max])).rows[0].id; }
  finally { await db.exec("RESET ROLE"); }
}
const inst = async (id) => (await db.query("SELECT answered, was_correct, repeat_count, user_answer, correct_answer FROM public.question_instances WHERE id = $1", [id])).rows[0];

test("listed as NOT_IN_PRODUCTION; backend only (service_role), never anon/authenticated", async () => {
  assert.ok(NOT_IN_PRODUCTION[FILE]);
  assert.equal(await fnExists(), true);
  const priv = async (role) => (await db.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS p", [role, SIG])).rows[0].p;
  assert.equal(await priv("anon"), false);
  assert.equal(await priv("authenticated"), false);
  assert.equal(await priv("service_role"), true);
});

test("reopens the OLDEST WRONG answer among the given ids, exactly like the level repeat (repeat_count + 1, cleared verdict)", async () => {
  const p = await pupil();
  const newer = await answered(p, ROWS[1], { correct: false, minutesAgo: 5 });
  const older = await answered(p, ROWS[0], { correct: false, minutesAgo: 20 });
  const got = await repeat(p, [ROWS[0].id, ROWS[1].id]);
  assert.equal(got, older);
  assert.deepEqual(await inst(older), { answered: false, was_correct: null, repeat_count: 1, user_answer: null, correct_answer: ROWS[0].content.correct });
  assert.equal((await inst(newer)).answered, true, "only one reopened");
  assert.equal(await repeat(p, [ROWS[1].id]), null, "an open instance exists → nothing reopened");
});

test("never reopens: a correct answer, a question outside p_question_ids, another pupil's answer, outside the domains, an inactive question", async () => {
  const p = await pupil();
  const ok = await answered(p, ROWS[2], { correct: true });
  assert.equal(await repeat(p, [ROWS[2].id]), null, "a correct answer is never repeated here (no farming)");
  assert.equal((await inst(ok)).answered, true);
  const wrong = await answered(p, ROWS[3], { correct: false });
  assert.equal(await repeat(p, [ROWS[4].id]), null, "not among the server-derived ids");
  const other = await pupil();
  assert.equal(await repeat(other, [ROWS[3].id]), null, "another pupil's wrong answer");
  assert.equal(await repeat(p, [ROWS[3].id], { domains: ["revolutions_democracy"] }), null, "outside the pupil's domains");
  await db.query("UPDATE public.questions SET is_active = false WHERE id = $1", [ROWS[3].id]);
  assert.equal(await repeat(p, [ROWS[3].id]), null, "inactive question");
  await db.query("UPDATE public.questions SET is_active = true WHERE id = $1", [ROWS[3].id]);
  assert.equal(await repeat(p, [ROWS[3].id]), wrong, "and with everything right, it is reopened");
});

test("repeats are bounded: repeat_count ≥ p_max_repeats is never reopened; invalid arguments return null", async () => {
  const p = await pupil();
  const done = await answered(p, ROWS[4], { correct: false, repeat: 2 });
  assert.equal(await repeat(p, [ROWS[4].id], { max: 2 }), null, "exhausted");
  assert.equal(await repeat(p, [ROWS[4].id], { max: 3 }), done, "a larger bound reopens it (bound is the caller's MAX_REPEATS)");
  const q = await pupil();
  for (const [ids, domains, max] of [[[], ["pilot_d362"], 2], [null, ["pilot_d362"], 2], [[ROWS[0].id], [], 2], [[ROWS[0].id], ["pilot_d362"], 0], [[ROWS[0].id], ["pilot_d362"], 11]]) {
    await db.exec("SET ROLE service_role");
    try { assert.equal((await db.query(`SELECT public.request_repeat_phase_question_for_student($1, $2::text[], $3::uuid[], $4) AS id`, [q, domains, ids, max])).rows[0].id, null); }
    finally { await db.exec("RESET ROLE"); }
  }
});

test("a correct answer on the reopened round pays the repeat reward (2 XP + 1 coin) once", async () => {
  const p = await pupil();
  const id = await answered(p, ROWS[5], { correct: false });
  assert.equal(await repeat(p, [ROWS[5].id]), id);
  const xp0 = (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
  await db.exec("SET ROLE service_role");
  let r;
  try {
    r = (await db.query("SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, id, ROWS[5].content.correct])).rows[0].r;
    await db.query("SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, id, ROWS[5].content.correct]);
  } finally { await db.exec("RESET ROLE"); }
  const xp1 = (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
  assert.equal(r.status, "correct");
  assert.deepEqual([xp1.xp - xp0.xp, xp1.coins - xp0.coins], [2, 1]);
});
