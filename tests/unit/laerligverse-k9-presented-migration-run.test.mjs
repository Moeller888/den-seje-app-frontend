// RUNTIME proof for the K9 prototype migration 20261109043500_laerligverse_presented_at (PGlite): presented_at is set
// once per round, in server time, only between delivery and the answer, by mark_presented (service_role only).
//
// Database: the FULL isolated replay → L1 K1 → Lærligverse L3/L5 (20261108043500) → this file, all UNMODIFIED.
// Proves: the guard (needs K1 + L3/L5; a re-run changes nothing); recorded / replay (set once, same time) /
// round_closed / stale_round / round_ahead / not_found (foreign instance) / invalid; the trigger refuses every
// direct way around it (twice, after the answer, in the answering statement, before delivery, in the future) and
// clears it on a reopen; no client privilege on the column or the function; it touches no XP/coins/attempt.
// HONEST LIMIT: what presented_at MEANS (a server-received report, never proof of reading) is a contract statement,
// not something a test can prove; one PGlite connection (the row lock is the same pattern as request_question_hint).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, readMigration } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261109043500_laerligverse_presented_at.sql";
const L35 = "20261108043500_laerligverse_served_mode_hint_log.sql";
const FN = "public.mark_presented(uuid,uuid,integer)";

let db;
let withoutL35;
let rerunSame;
before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(readMigration("20261103110000_l1_k1_attempt_context.sql"));
  withoutL35 = await code(db.exec(readMigration(FILE)));
  await db.exec(readMigration(L35));
  await db.exec(readMigration(FILE));
  const snap = async () => JSON.stringify((await db.query(`SELECT proname, md5(prosrc), proacl::text FROM pg_proc WHERE proname IN ('mark_presented','question_instances_presented_at') ORDER BY 1`)).rows);
  const s1 = await snap();
  await db.exec(readMigration(FILE));
  rerunSame = s1 === (await snap());
});

const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
let n = 0;
async function pupil() {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  await db.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)`, [id]);
  return id;
}
async function serve(p, { delivered = true } = {}) {
  n++;
  const content = { question: `K9 ${n}`, options: ["a", "b"], correct: "a" };
  const q = (await one(`INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective, answer_format,
    answer_type, metadata, target_grade) VALUES ('mc', $1::jsonb, 1, true, 'auto', 'test_k9', 'mc', 'short', '{}'::jsonb, 7) RETURNING id`, [JSON.stringify(content)])).id;
  const snap = delivered ? JSON.stringify({ content, metadata: {}, answer_format: "mc", answer_type: "short" }) : null;
  return (await one(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot,
    next_review_at, served_snapshot) VALUES ($1, $2, 'a', 1, 1, now(), $3::jsonb) RETURNING id`, [p, q, snap])).id;
}
async function as(role, sql, params = [], sub = null) {
  await db.exec(`SET ROLE ${role}`);
  if (sub) await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`); }
}
const mark = async (p, qi, round) => (await as("service_role", `SELECT public.mark_presented($1, $2, $3) AS r`, [p, qi, round]))[0].r;
const presentedAt = async (qi) => (await one(`SELECT presented_at FROM public.question_instances WHERE id = $1`, [qi])).presented_at;

test("the file: unique version after L3/L5, NOT_IN_PRODUCTION, one DO block, D-110 header; guarded; a re-run changes nothing", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.equal(files.filter((f) => f.slice(0, 14) === FILE.slice(0, 14)).length, 1);
  assert.ok(FILE > L35);
  assert.match(NOT_IN_PRODUCTION[FILE] ?? "", /not applied in production/);
  assert.equal(planReplay(files, readMigration).plan.find((p) => p.file === FILE).action, "skip");
  const sql = readMigration(FILE);
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.ok(body.startsWith("DO $k9$") && body.endsWith("$k9$;"));
  assert.equal(withoutL35, "P0001", "without L3/L5 the file stops");
  assert.equal(rerunSame, true);
});

test("mark_presented: recorded once in server time, replay returns the same time, closed/stale/ahead/foreign refused", async () => {
  const p = await pupil();
  const qi = await serve(p);
  const served = (await one(`SELECT served_at FROM public.question_instances WHERE id = $1`, [qi])).served_at;
  const a = await mark(p, qi, 1);
  assert.equal(a.outcome, "recorded");
  const at = await presentedAt(qi);
  assert.ok(at >= served, "never before delivery");
  const b = await mark(p, qi, 1);
  assert.equal(b.outcome, "replay");
  assert.equal(b.presented_at, a.presented_at);
  assert.deepEqual(await presentedAt(qi), at);
  assert.deepEqual(await mark(p, qi, 2), { outcome: "invalid_request", reason: "round_ahead" });
  assert.deepEqual(await mark(await pupil(), qi, 1), { outcome: "not_found" }, "another pupil's instance");
  assert.deepEqual(await mark(null, qi, 1), { outcome: "invalid_request", reason: "missing_identity" });
  assert.deepEqual(await mark(p, qi, 0), { outcome: "invalid_request", reason: "invalid_round" });
  // Answered before presented: refused, nothing set. A reopen is a new round without presented_at.
  const q2 = await serve(await pupil());
  const owner = (await one(`SELECT student_id FROM public.question_instances WHERE id = $1`, [q2])).student_id;
  await db.query(`UPDATE public.question_instances SET answered = true, answered_at = now(), was_correct = true WHERE id = $1`, [q2]);
  assert.deepEqual(await mark(owner, q2, 1), { outcome: "round_closed" });
  assert.equal(await presentedAt(q2), null);
  await db.query(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1`, [q2]);
  assert.deepEqual(await mark(owner, q2, 1), { outcome: "stale_round" });
  assert.equal((await mark(owner, q2, 2)).outcome, "recorded");
});

test("the trigger: set once, never after or with the answer, never before delivery or in the future; cleared on reopen; NULL on insert", async () => {
  const p = await pupil();
  const qi = await serve(p);
  assert.equal(await code(db.query(`UPDATE public.question_instances SET presented_at = now() + interval '1 hour' WHERE id = $1`, [qi])), "23514", "future");
  assert.equal(await code(db.query(`UPDATE public.question_instances SET presented_at = now() - interval '1 day' WHERE id = $1`, [qi])), "23514", "before delivery");
  assert.equal(await code(db.query(`UPDATE public.question_instances SET presented_at = now(), answered = true, answered_at = now(), was_correct = true WHERE id = $1`, [qi])), "23514", "with the answer");
  await mark(p, qi, 1);
  const at = await presentedAt(qi);
  await db.query(`UPDATE public.question_instances SET presented_at = NULL WHERE id = $1`, [qi]);
  assert.deepEqual(await presentedAt(qi), at, "set once: cannot be cleared");
  await as("service_role", `UPDATE public.question_instances SET presented_at = now() WHERE id = $1`, [qi]);
  assert.deepEqual(await presentedAt(qi), at, "set once: service_role cannot move it either");
  await db.query(`UPDATE public.question_instances SET answered = true, answered_at = now(), was_correct = true WHERE id = $1`, [qi]);
  assert.deepEqual(await presentedAt(qi), at, "answering keeps it");
  await db.query(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1`, [qi]);
  assert.equal(await presentedAt(qi), null, "a reopen is a new round");
  const p2 = await pupil();
  const q3 = (await one(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot, presented_at)
    SELECT $1, question_id, 'a', 1, 1, now() FROM public.question_instances WHERE id = $2 RETURNING id`, [p2, qi])).id;
  assert.equal(await presentedAt(q3), null, "an insert never carries it");
});

test("no client privilege: anon/authenticated can neither read nor write presented_at nor call mark_presented; SECURITY INVOKER", async () => {
  const p = await pupil();
  const qi = await serve(p);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await code(as(role, `SELECT presented_at FROM public.question_instances WHERE id = $1`, [qi], p)), "42501", role);
    assert.equal(await code(as(role, `UPDATE public.question_instances SET presented_at = now() WHERE id = $1`, [qi], p)), "42501", role);
    assert.equal(await code(as(role, `SELECT public.mark_presented($1, $2, 1)`, [p, qi], p)), "42501", role);
  }
  const f = await one(`SELECT prosecdef d, proconfig c FROM pg_proc WHERE oid = to_regprocedure($1)`, [FN]);
  assert.deepEqual(f, { d: false, c: ['search_path=""'] });
});

test("presenting changes no XP, coins, attempt or anything but presented_at", async () => {
  const p = await pupil();
  const qi = await serve(p);
  const tables = (await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`)).rows.map((r) => r.relname);
  const fp = async () => {
    const out = {};
    for (const t of tables) {
      const cols = t === "question_instances" ? "x.id, x.answered, x.was_correct, x.repeat_count, x.served_mode, x.served_at, x.correct_answer" : "x.*";
      out[t] = (await one(`SELECT md5(coalesce(string_agg((SELECT row_to_json(r)::text FROM (SELECT ${cols}) r), '|' ORDER BY x::text), '')) m FROM public.${t} x`)).m;
    }
    return out;
  };
  const before = await fp();
  await mark(p, qi, 1);
  assert.deepEqual(await fp(), before);
});
