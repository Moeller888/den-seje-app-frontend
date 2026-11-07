// RUNTIME proof for migration 20261108043500_laerligverse_served_mode_hint_log (Lærligverse L5 + L3), PGlite.
//
// Built on the FULL isolated replay (tests/isolated/schema/replay.mjs: CI baseline → stubs → every planned
// migration, production's grants included) plus L1 K1 (20261103110000), which the default replay does not
// apply (NOT_IN_PRODUCTION) and which this file depends on. The migration file runs UNMODIFIED. Synthetic
// pupils and questions only.
//
// What this proves:
//   * The file: unique version after K1, NOT_IN_PRODUCTION (so the default isolated stack never has it), one
//     DO block, D-110 header. Without K1 it aborts and changes nothing; a second run changes nothing.
//   * L5 served_mode: CHECK (no 'diagnostic', no free text); the trigger keeps a matching proposal, refuses a
//     mode that is not the question's learning_step mode, NULLs an answered insert and a reopen, and keeps
//     the value byte for byte on every other UPDATE (even service_role's). get-next-question's real insert
//     payload (instance-insert.ts) is accepted.
//   * Privileges: anon/authenticated can neither read nor write served_mode (SELECT/INSERT/UPDATE all refused as
//     the role itself), while their privileges on every OTHER column are exactly as before the file (RLS still
//     yields 0 rows for an UPDATE). The hint log: RLS on, no privilege for anon/authenticated (read or write),
//     service_role SELECT/INSERT only; request_question_hint EXECUTE for service_role only, SECURITY INVOKER.
//   * request_question_hint: recorded / replay (same request id: no new row) / already_recorded (a level is
//     never counted twice) / level_out_of_order / invalid level / hint_unavailable (nothing logged) /
//     request_conflict / not_found for a foreign instance / round_closed / stale_round / round_ahead; the hint
//     text is the DELIVERED version (K1 snapshot) even after the question is edited; the SQL count rule equals
//     _shared/hints.ts on a matrix of contents.
//   * Hints change nothing else: every other public table is byte-identical before and after a series of
//     hint requests, and no database function but request_question_hint names the log.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6), one connection (no true concurrency: the
// FOR UPDATE serialisation is reasoned, not raced), and the superuser builds the fixtures.
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
import { hintsAvailable, hintText } from "../../supabase/functions/_shared/hints.ts";
import { STEPS } from "../../supabase/functions/_shared/learning-sequence.ts";
import { insertQuestionInstance } from "../../supabase/functions/get-next-question/instance-insert.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLATFORM = readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8");
const K1 = "20261103110000_l1_k1_attempt_context.sql";
const FILE = "20261108043500_laerligverse_served_mode_hint_log.sql";
const SQL = () => readMigration(FILE);
const HINT_FN = "public.request_question_hint(uuid,uuid,integer,integer,uuid)";
const MODE_FN = "public.question_instances_served_mode()";
const MD5 = { hint: "f02402e6a546ad3b3c3351182b32148b", mode: "af725afa35dcae57ff14a20be9b754ab" };

const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];

// Every column privilege anon/authenticated hold on question_instances (column name → privileges).
const COLUMN_PRIVS = `SELECT r.rolname AS role, a.attname AS col,
    has_column_privilege(r.rolname, 'public.question_instances', a.attname, 'SELECT') AS s,
    has_column_privilege(r.rolname, 'public.question_instances', a.attname, 'INSERT') AS i,
    has_column_privilege(r.rolname, 'public.question_instances', a.attname, 'UPDATE') AS u,
    has_column_privilege(r.rolname, 'public.question_instances', a.attname, 'REFERENCES') AS f
  FROM pg_attribute a CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')) r
  WHERE a.attrelid = 'public.question_instances'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  ORDER BY 1, 2`;
const TABLE_PRIVS = `SELECT r.rolname AS role, p AS priv, has_table_privilege(r.rolname, 'public.question_instances', p) AS ok
  FROM (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) r,
       unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p ORDER BY 1, 2`;

let db;
let noK1Error;
let privsBefore;
let tablePrivsBefore;
let rerunSame;
before(async () => {
  db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, [], "the full isolated replay must succeed");
  noK1Error = await code(db.exec(SQL()));
  noK1Error = { code: noK1Error, column: (await one(db, `SELECT count(*)::int n FROM pg_attribute WHERE attrelid = 'public.question_instances'::regclass AND attname = 'served_mode'`)).n };
  await db.exec(readMigration(K1));
  privsBefore = (await db.query(COLUMN_PRIVS)).rows;
  tablePrivsBefore = (await db.query(TABLE_PRIVS)).rows;
  await db.exec(SQL());
  const snap = async () => JSON.stringify([(await db.query(COLUMN_PRIVS)).rows, (await db.query(TABLE_PRIVS)).rows,
    (await db.query(`SELECT proname, md5(prosrc) m, proacl::text a FROM pg_proc WHERE proname IN ('request_question_hint','question_instances_served_mode') ORDER BY 1`)).rows,
    (await db.query(`SELECT relacl::text a, relrowsecurity r FROM pg_class WHERE oid = 'public.question_hint_requests'::regclass`)).rows]);
  const s1 = await snap();
  await db.exec(SQL());
  rerunSame = s1 === (await snap());
});

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────────
let n = 0;
async function addPupil() {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  await db.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)`, [id]);
  return id;
}
async function addQuestion({ step = null, hints, content = null } = {}) {
  n++;
  const c = content ?? { question: `L3/L5-testspørgsmål ${n}`, options: ["a", "b"], correct: "a", ...(hints === undefined ? {} : { hints }) };
  const meta = step === null ? {} : { learning_step: step };
  return (await one(db, `INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective,
      answer_format, answer_type, metadata, target_grade) VALUES ('mc', $1::jsonb, 1, true, 'auto', 'test_l35', 'mc', 'short', $2::jsonb, 7)
      RETURNING id`, [JSON.stringify(c), JSON.stringify(meta)])).id;
}
async function serve(pupil, question, { mode = null, delivered = false, answered = false } = {}) {
  const q = await one(db, `SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1`, [question]);
  const snap = delivered ? JSON.stringify({ content: q.content, metadata: q.metadata, answer_format: q.answer_format, answer_type: q.answer_type }) : null;
  return (await one(db, `INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time,
      mastery_snapshot, next_review_at, answered, served_mode, served_snapshot)
      VALUES ($1, $2, 'a', 1, 1, now(), $3, $4, $5::jsonb) RETURNING id`, [pupil, question, answered, mode, snap])).id;
}
async function as(role, sql, params = [], sub = null) {
  await db.exec(`SET ROLE ${role}`);
  if (sub) await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return (await db.query(sql, params)).rows; } finally {
    await db.exec("RESET ROLE");
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}
const hint = async (pupil, qi, round, level, requestId = randomUUID()) =>
  (await as("service_role", `SELECT public.request_question_hint($1, $2, $3, $4, $5) AS r`, [pupil, qi, round, level, requestId]))[0].r;
const logRows = async (qi) => (await db.query(`SELECT round_no, hint_level, request_id FROM public.question_hint_requests
  WHERE question_instance_id = $1 ORDER BY round_no, hint_level`, [qi])).rows;
const modeOf = async (qi) => (await one(db, `SELECT served_mode FROM public.question_instances WHERE id = $1`, [qi])).served_mode;
const HINTS = ["Læs påstanden igen.", "  Se på afsenderen.  ", "Kun én kilde er fra regeringen."];

// ── The file ──────────────────────────────────────────────────────────────────────────────────────────
test("the file: unique version after K1, NOT_IN_PRODUCTION (never replayed by default), one DO block, D-110 header", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.equal(files.filter((f) => f.slice(0, 14) === FILE.slice(0, 14)).length, 1, "version unique");
  assert.ok(FILE > K1, "sorts after K1");
  assert.match(NOT_IN_PRODUCTION[FILE] ?? "", /not applied in production/);
  assert.equal(planReplay(files, readMigration).plan.find((p) => p.file === FILE).action, "skip");
  const sql = SQL();
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.ok(body.startsWith("DO $l35$") && body.endsWith("$l35$;"), "exactly one DO block");
});

test("guard: without K1 the file aborts and changes nothing; a second run changes nothing", () => {
  assert.equal(noK1Error.column, 0, "no served_mode column after the refused run");
  assert.ok(noK1Error.code, "the run without K1 must fail");
  assert.equal(rerunSame, true, "a re-run leaves functions, privileges and RLS identical");
});

test("objects: bodies as pinned, SECURITY INVOKER both, EXECUTE service_role only, trigger enabled", async () => {
  const f = async (sig) => one(db, `SELECT md5(prosrc) m, prosecdef d, proconfig c FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig]);
  assert.deepEqual(await f(HINT_FN), { m: MD5.hint, d: false, c: ['search_path=""'] });
  assert.deepEqual(await f(MODE_FN), { m: MD5.mode, d: false, c: ['search_path=""'] });
  for (const role of ["anon", "authenticated", "service_role"]) {
    const r = await one(db, `SELECT has_function_privilege($1, $2, 'EXECUTE') h, has_function_privilege($1, $3, 'EXECUTE') t`, [role, HINT_FN, MODE_FN]);
    assert.deepEqual(r, { h: role === "service_role", t: false }, role);
  }
  const t = await one(db, `SELECT pg_get_triggerdef(oid) d FROM pg_trigger WHERE tgname = 'question_instances_served_mode'`);
  assert.match(t.d, /BEFORE INSERT OR UPDATE ON public\.question_instances FOR EACH ROW EXECUTE FUNCTION question_instances_served_mode\(\)/);
});

// ── L5: served_mode ─────────────────────────────────────────────────────────────────────────────────
test("served_mode CHECK: the five server modes or NULL; 'diagnostic' and anything else refused", async () => {
  const q = await addQuestion();
  for (const bad of ["diagnostic", "Check", "independent", ""]) {
    assert.equal(await code(serve(await addPupil(), q, { mode: bad })), "23514", bad);
  }
  assert.ok(await serve(await addPupil(), q, { mode: "quiz_v1" }), "quiz_v1 on any question");
  assert.equal(await modeOf(await serve(await addPupil(), q)), null, "no proposal = NULL");
});

test("served_mode trigger: kept when it is the question's step mode (every STEPS entry), refused otherwise", async () => {
  for (const s of STEPS) {
    const q = await addQuestion({ step: s.id });
    assert.equal(await modeOf(await serve(await addPupil(), q, { mode: s.mode })), s.mode, s.id);
    for (const other of ["practice", "check", "review", "application"].filter((m) => m !== s.mode)) {
      assert.equal(await code(serve(await addPupil(), q, { mode: other })), "23514", `${s.id} served as ${other}`);
    }
  }
  const untagged = await addQuestion();
  assert.equal(await code(serve(await addPupil(), untagged, { mode: "check" })), "23514", "an untagged question is never a step");
});

test("served_mode trigger: an answered insert is NULL; no UPDATE can change it; a reopen clears it", async () => {
  const q = await addQuestion({ step: "independent_application" });
  assert.equal(await modeOf(await serve(await addPupil(), q, { mode: "check", answered: true })), null);
  const qi = await serve(await addPupil(), q, { mode: "check" });
  await db.query(`UPDATE public.question_instances SET served_mode = 'practice' WHERE id = $1`, [qi]);
  assert.equal(await modeOf(qi), "check", "superuser cannot rewrite it");
  await as("service_role", `UPDATE public.question_instances SET served_mode = NULL, next_review_at = now() WHERE id = $1`, [qi]);
  assert.equal(await modeOf(qi), "check", "service_role cannot clear it");
  await db.query(`UPDATE public.question_instances SET answered = true, answered_at = now(), was_correct = true WHERE id = $1`, [qi]);
  assert.equal(await modeOf(qi), "check", "answering keeps the round's mode");
  await db.query(`UPDATE public.question_instances SET answered = false, repeat_count = 1, served_mode = 'check' WHERE id = $1`, [qi]);
  assert.equal(await modeOf(qi), null, "a reopen is a new round without a served mode — even if the statement proposes one");
});

test("get-next-question's real insert payload (LAERLIGVERSE_SERVED_MODE on, a check step) is accepted as service_role", async () => {
  const q = await addQuestion({ step: "independent_application" });
  const pupil = await addPupil();
  let values = null;
  const capture = () => ({ from: () => ({ insert: (v) => { values = v; return { select: () => ({ limit: async () => ({ data: [], error: null }) }) }; } }) });
  await insertQuestionInstance(capture, { studentId: pupil, questionId: q, correctAnswer: "a", nowIso: new Date().toISOString(), servedMode: "check" });
  assert.equal(values.served_mode, "check");
  const cols = Object.keys(values);
  const rows = await as("service_role", `INSERT INTO public.question_instances (${cols.join(", ")}) SELECT ${cols.map((_, i) => `$${i + 1}`).join(", ")} RETURNING served_mode`, cols.map((k) => values[k]));
  assert.deepEqual(rows, [{ served_mode: "check" }]);
});

test("privileges: anon/authenticated can neither read nor write served_mode and exactly their old privileges on every other column", async () => {
  const after = (await db.query(COLUMN_PRIVS)).rows;
  assert.deepEqual(after.filter((r) => r.col !== "served_mode"), privsBefore, "every other column unchanged");
  // REFERENCES stays table-level (it was before, on every column): it only lets a role name the column in a
  // foreign key of a table it owns, and grants neither read nor write of the value.
  assert.deepEqual(after.filter((r) => r.col === "served_mode"), [
    { role: "anon", col: "served_mode", s: false, i: false, u: false, f: true },
    { role: "authenticated", col: "served_mode", s: false, i: false, u: false, f: true },
  ]);
  const tableAfter = (await db.query(TABLE_PRIVS)).rows;
  const diff = tableAfter.filter((r, i) => r.ok !== tablePrivsBefore[i].ok);
  assert.deepEqual(diff.map((r) => `${r.role}:${r.priv}`), ["anon:UPDATE", "authenticated:UPDATE"], "only table-level UPDATE moved to column level");
  assert.ok(privsBefore.some((r) => r.u), "the comparison is not vacuous: some column was UPDATE-able before");
});

test("privileges, as the role itself: a pupil can neither read, set nor change served_mode; other updates behave as before", async () => {
  const q = await addQuestion({ step: "transfer" });
  const pupil = await addPupil();
  const qi = await serve(pupil, q, { mode: "application" });
  assert.equal(await code(as("authenticated", `UPDATE public.question_instances SET served_mode = 'check' WHERE id = $1`, [qi], pupil)), "42501");
  assert.equal(await code(as("authenticated", `SELECT served_mode FROM public.question_instances WHERE id = $1`, [qi], pupil)), "42501");
  assert.equal(await code(as("authenticated", `INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot, served_mode)
    VALUES ($1, $2, 'a', 1, 1, 'check')`, [pupil, q], pupil)), "42501");
  assert.equal(await code(as("anon", `UPDATE public.question_instances SET served_mode = 'check' WHERE id = $1`, [qi])), "42501");
  // The column-level UPDATE kept for the other columns: allowed by privilege, 0 rows by RLS (no UPDATE policy).
  const r = await as("authenticated", `UPDATE public.question_instances SET next_review_at = now() WHERE id = $1 AND student_id = $2 RETURNING id`, [qi, pupil], pupil);
  assert.deepEqual(r, []);
  assert.equal(await modeOf(qi), "application");
});

// ── L3: the hint log ──────────────────────────────────────────────────────────────────────────────────
test("hint log privileges: RLS on, no read or write for anon/authenticated, service_role SELECT/INSERT only, no direct RPC", async () => {
  assert.equal((await one(db, `SELECT relrowsecurity r FROM pg_class WHERE oid = 'public.question_hint_requests'::regclass`)).r, true);
  const pupil = await addPupil();
  const qi = await serve(pupil, await addQuestion({ hints: HINTS }));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await code(as(role, `SELECT * FROM public.question_hint_requests`, [], pupil)), "42501", `${role} read`);
    assert.equal(await code(as(role, `INSERT INTO public.question_hint_requests (student_id, question_instance_id, round_no, hint_level, request_id)
      VALUES ($1, $2, 1, 1, $3)`, [pupil, qi, randomUUID()], pupil)), "42501", `${role} insert`);
    assert.equal(await code(as(role, `SELECT public.request_question_hint($1, $2, 1, 1, $3)`, [pupil, qi, randomUUID()], pupil)), "42501", `${role} rpc`);
  }
  assert.equal((await hint(pupil, qi, 1, 1)).outcome, "recorded");
  for (const stmt of [`UPDATE public.question_hint_requests SET hint_level = 3`, `DELETE FROM public.question_hint_requests`, `TRUNCATE public.question_hint_requests`]) {
    assert.equal(await code(as("service_role", stmt)), "42501", stmt);
  }
  assert.equal((await logRows(qi)).length, 1, "append-only");
});

test("request_question_hint: recorded, replay without a new row, a level never counted twice, sequential levels", async () => {
  const pupil = await addPupil();
  const qi = await serve(pupil, await addQuestion({ step: "guided_practice", hints: HINTS }), { mode: "practice" });
  const id1 = randomUUID();
  const a = await hint(pupil, qi, 1, 1, id1);
  assert.equal(a.outcome, "recorded");
  assert.deepEqual({ level: a.hint_level, text: a.hint_text, avail: a.hints_available, round: a.round_no, id: a.request_id },
    { level: 1, text: HINTS[0], avail: 3, round: 1, id: id1 });
  const b = await hint(pupil, qi, 1, 1, id1);
  assert.equal(b.outcome, "replay");
  assert.equal(b.requested_at, a.requested_at);
  assert.equal(b.hint_text, HINTS[0]);
  const c = await hint(pupil, qi, 1, 1);
  assert.equal(c.outcome, "already_recorded", "another request id for the same level");
  assert.equal(c.request_id, id1);
  assert.equal((await logRows(qi)).length, 1, "retries and repeats never double-count");
  assert.deepEqual(await hint(pupil, qi, 1, 3), { outcome: "invalid_request", reason: "level_out_of_order" });
  const two = await hint(pupil, qi, 1, 2);
  assert.equal(two.outcome, "recorded");
  assert.equal(two.hint_text, "Se på afsenderen.", "trimmed as _shared/hints.ts trims");
  assert.equal((await hint(pupil, qi, 1, 3)).outcome, "recorded");
  assert.deepEqual((await logRows(qi)).map((r) => r.hint_level), [1, 2, 3]);
  for (const bad of [0, 4, -1]) assert.deepEqual(await hint(pupil, qi, 1, bad), { outcome: "invalid_request", reason: "invalid_level" }, String(bad));
  assert.deepEqual(await hint(pupil, qi, 0, 1), { outcome: "invalid_request", reason: "invalid_round" });
  assert.deepEqual(await hint(pupil, qi, 2, 1), { outcome: "invalid_request", reason: "round_ahead" });
  assert.deepEqual(await hint(null, qi, 1, 1), { outcome: "invalid_request", reason: "missing_identity" });
  assert.deepEqual(await hint(pupil, qi, 1, 2, id1), { outcome: "request_conflict" }, "a request id is bound to its level");
});

test("request_question_hint: a foreign instance is not_found; a closed round is refused; a stale round is refused", async () => {
  const owner = await addPupil();
  const other = await addPupil();
  const qi = await serve(owner, await addQuestion({ hints: HINTS }));
  assert.deepEqual(await hint(other, qi, 1, 1), { outcome: "not_found" }, "wrong student");
  assert.deepEqual(await hint(owner, randomUUID(), 1, 1), { outcome: "not_found" });
  assert.deepEqual(await logRows(qi), []);
  await db.query(`UPDATE public.question_instances SET answered = true, answered_at = now(), was_correct = false WHERE id = $1`, [qi]);
  assert.deepEqual(await hint(owner, qi, 1, 1), { outcome: "round_closed" });
  await db.query(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1`, [qi]);
  assert.deepEqual(await hint(owner, qi, 1, 1), { outcome: "stale_round" });
  assert.equal((await hint(owner, qi, 2, 1)).outcome, "recorded", "the new round starts at level 1 again");
  assert.deepEqual((await logRows(qi)).map((r) => [r.round_no, r.hint_level]), [[2, 1]]);
});

test("request_question_hint: no hints in content → hint_unavailable and nothing logged; the text is the DELIVERED version", async () => {
  const pupil = await addPupil();
  const none = await serve(pupil, await addQuestion());
  assert.deepEqual(await hint(pupil, none, 1, 1), { outcome: "hint_unavailable", hints_available: 0 });
  assert.deepEqual(await logRows(none), []);
  // Delivered with two hints (K1 snapshot), then the question is edited: the round still gets the delivered text.
  const p2 = await addPupil();
  const q = await addQuestion({ hints: ["Første version.", "Anden version."] });
  const qi = await serve(p2, q, { delivered: true });
  await db.query(`UPDATE public.questions SET content = jsonb_set(content, '{hints}', '["Ny tekst."]') WHERE id = $1`, [q]);
  const a = await hint(p2, qi, 1, 1);
  assert.equal(a.hint_text, "Første version.");
  assert.equal(a.hints_available, 2);
  assert.equal((await hint(p2, qi, 1, 2)).hint_text, "Anden version.");
  assert.deepEqual(await hint(p2, qi, 1, 3), { outcome: "hint_unavailable", hints_available: 2 });
});

test("the SQL count rule equals _shared/hints.ts on a matrix of contents", async () => {
  const matrix = [
    undefined, null, "tekst", 7, {}, [], [""], ["  "], ["a"], ["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d"],
    ["a", "", "c"], ["a", 5, "c"], [5, "b"], ["a", null], [" \t a \n", "b"], [{ t: "x" }], ["a", "b", " "],
  ];
  for (const hints of matrix) {
    const pupil = await addPupil();
    const base = { question: `matrix ${++n}`, options: ["a", "b"], correct: "a" };
    const content = hints === undefined ? base : { ...base, hints };
    const qi = await serve(pupil, await addQuestion({ content }));
    const r = await hint(pupil, qi, 1, 1);
    const sqlAvail = r.hints_available;
    assert.equal(sqlAvail, hintsAvailable(content), JSON.stringify(hints));
    assert.equal(r.outcome === "recorded" ? r.hint_text : null, hintText(content, 1), JSON.stringify(hints));
  }
});

test("hints change no XP, coins, streak, quest, attempt, instance or teacher data; only request_question_hint names the log", async () => {
  const pupil = await addPupil();
  await db.query(`INSERT INTO public.student_progress (student_id, xp, coins) VALUES ($1, 100, 50) ON CONFLICT DO NOTHING`, [pupil]);
  const qi = await serve(pupil, await addQuestion({ step: "guided_practice", hints: HINTS }), { mode: "practice" });
  const tables = (await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'question_hint_requests' ORDER BY 1`)).rows.map((r) => r.relname);
  const fingerprint = async () => {
    const out = {};
    for (const t of tables) out[t] = (await one(db, `SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) m FROM public.${t} x`)).m;
    return out;
  };
  const before = await fingerprint();
  for (const lvl of [1, 1, 2, 3, 3]) await hint(pupil, qi, 1, lvl);
  await hint(pupil, qi, 1, 9);
  assert.deepEqual(await fingerprint(), before, "every other public table byte-identical");
  assert.ok(tables.includes("student_progress") && tables.includes("question_attempts") && tables.includes("question_instances"));
  const readers = (await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public' AND p.prosrc ILIKE '%question_hint_requests%' ORDER BY 1`)).rows.map((r) => r.proname);
  assert.deepEqual(readers, ["request_question_hint"]);
});
