// RUNTIME proof for migration 20261101140000_deactivate_two_misgraded_questions (D-290, G2), PGlite.
// The file is executed UNMODIFIED on rows that carry the two production ids and their production
// content and metadata (fixtures/d290-two-questions.json, read 2026-11-01).
//
// Cases: it deactivates exactly the two questions and nothing else; each guard aborts the whole file
// and changes nothing — the open-round guard included (one already inactive, changed content, changed
// metadata, an open instance); a re-run aborts without change; the documented reactivation restores
// exactly the two rows; the documented guard rollback removes only the trigger and the function, and
// with the reactivation restores the state before the migration exactly; the open-round guard refuses a new open round on an inactive question and
// leaves every other write alone; the guard function is no API; the file is no longer data-only, so
// the isolated replay skips it as not applied in production. The interleavings with simultaneous
// sessions are proven on a real PostgreSQL in deactivate-two-misgraded-questions-concurrency.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { forbiddenMigrationTokens } from "../../.github/ci/classify-changes.mjs";
import { planReplay, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const NAME = "20261101140000_deactivate_two_misgraded_questions.sql";
const FILE = `supabase/migrations/${NAME}`;
const FIXTURE = JSON.parse(read("tests/unit/fixtures/d290-two-questions.json"));
const [A, B] = FIXTURE.map((q) => q.id);
const OTHER = "00000000-0000-4000-8000-0000000000f1";
const PUPIL = "00000000-0000-4000-8000-0000000000a1";
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

// A ```sql block of the runbook, found by its marker line — executed verbatim.
function runbookSql(marker) {
  const blocks = [...read("docs/operations/deactivate-two-misgraded-questions.md").matchAll(/```sql\n([\s\S]*?)```/g)]
    .map((m) => m[1]).filter((b) => b.includes(marker));
  assert.equal(blocks.length, 1, `exactly one runbook block marked ${marker}`);
  return blocks[0];
}
const reactivateSql = () => runbookSql("REACTIVATE D-290");
const rollbackGuardSql = () => runbookSql("ROLLBACK D-290 GUARD");
async function db({ open = false, inactive = false, content = null, metadata = null } = {}) {
  const d = new PGlite();
  await d.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.questions (id uuid PRIMARY KEY, is_active boolean NOT NULL, content jsonb, metadata jsonb);
    CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid,
      question_id uuid NOT NULL REFERENCES public.questions(id), answered boolean NOT NULL, user_answer text);
    CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE (answered = false);
    INSERT INTO public.questions VALUES
      ('${A}', ${!inactive}, ${lit(content ?? FIXTURE[0].content)}::jsonb, ${lit(metadata ?? FIXTURE[0].metadata)}::jsonb),
      ('${B}', true, ${lit(FIXTURE[1].content)}::jsonb, ${lit(FIXTURE[1].metadata)}::jsonb),
      ('${OTHER}', true, '{"q":3}', '{}');
    INSERT INTO public.question_instances (question_id, answered, user_answer) VALUES ('${A}', true, 'x'), ('${B}', true, 'y');
    ${open ? `INSERT INTO public.question_instances (question_id, answered) VALUES ('${B}', false);` : ""}`);
  return d;
}
const snap = async (d) => JSON.stringify((await d.query(`SELECT
  (SELECT json_agg(json_build_object('id', id, 'a', is_active, 'c', content, 'm', metadata) ORDER BY id) FROM public.questions) AS q,
  (SELECT json_agg(json_build_object('q', question_id, 'a', answered, 'u', user_answer) ORDER BY question_id, answered) FROM public.question_instances) AS i,
  (SELECT count(*) FROM pg_proc WHERE proname = 'guard_open_round_requires_active_question') AS fn,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'open_round_requires_active_question') AS tg`)).rows[0]);
const active = async (d) => (await d.query("SELECT id FROM public.questions WHERE is_active ORDER BY id")).rows.map((r) => r.id);

test("the fixture is production's text: its md5 is what the migration's guard requires", async () => {
  const d = await db();
  const rows = (await d.query(`SELECT id, md5(content::text) AS c, md5(metadata::text) AS m FROM public.questions
    WHERE id = ANY($1::uuid[]) ORDER BY id`, [[A, B]])).rows;
  const sql = read(FILE);
  for (const [i, r] of rows.entries()) {
    assert.equal(r.c, FIXTURE[i].content_md5);
    assert.equal(r.m, FIXTURE[i].metadata_md5);
    assert.ok(sql.includes(`('${r.id}'::uuid, '${r.c}', '${r.m}')`), `${r.id}: guard pins this content and metadata`);
  }
});

test("deactivates exactly the two questions; nothing else changes", async () => {
  const d = await db();
  const before = JSON.parse(await snap(d));
  await d.exec(read(FILE));
  assert.deepEqual(await active(d), [OTHER]);
  const after = JSON.parse(await snap(d));
  assert.deepEqual(after.i, before.i, "instances and answers untouched");
  assert.deepEqual(after.q.map((r) => [r.c, r.m]), before.q.map((r) => [r.c, r.m]), "content and metadata untouched");
  assert.deepEqual([after.fn, after.tg], [1, 1], "the open-round guard is installed");
});

for (const [label, opts, error] of [
  ["one question already inactive", { inactive: true }, /D-290: expected 2 active questions with the reviewed content and metadata, found 1/],
  ["changed content", { content: FIXTURE[0].content.replace("min søsters", "min søsters ") }, /found 1/],
  ["changed metadata", { metadata: FIXTURE[0].metadata.replace("grammatik", "grammar") }, /found 1/],
  ["an open instance of either question", { open: true }, /D-290: 1 open instance/],
]) {
  test(`guard: ${label} → aborts, nothing changed (the open-round guard is not installed either)`, async () => {
    const d = await db(opts);
    const before = await snap(d);
    await assert.rejects(d.exec(read(FILE)), error);
    assert.equal(await snap(d), before);
    assert.match(before, /"fn":0,"tg":0/);
  });
}

test("a re-run aborts without change (applied once only)", async () => {
  const d = await db();
  await d.exec(read(FILE));
  const once = await snap(d);
  await assert.rejects(d.exec(read(FILE)), /already exists/);
  assert.equal(await snap(d), once);
});

test("the documented reactivation restores exactly the two rows; the open-round guard stays", async () => {
  const d = await db();
  const before = JSON.parse(await snap(d));
  await d.exec(read(FILE));
  await d.exec(reactivateSql());
  const after = JSON.parse(await snap(d));
  assert.deepEqual(after.q, before.q);
  assert.deepEqual(after.i, before.i);
  assert.deepEqual([after.fn, after.tg], [1, 1]);
});

test("the documented guard rollback removes only the trigger and the function; no row changes", async () => {
  const d = await db();
  await d.exec(read(FILE));
  const applied = JSON.parse(await snap(d));
  await d.exec(rollbackGuardSql());
  const after = JSON.parse(await snap(d));
  assert.deepEqual([after.fn, after.tg], [0, 0], "guard gone");
  assert.deepEqual(after.q, applied.q, "questions unchanged (both stay inactive)");
  assert.deepEqual(after.i, applied.i, "instances unchanged");
  // Behaviour as before the migration: an open round on an inactive question is no longer refused.
  await d.query(`INSERT INTO public.question_instances (student_id, question_id, answered) VALUES ($1, $2, false)`, [PUPIL, A]);
  // The migration header names the same two statements.
  const statements = rollbackGuardSql().split("\n").filter((l) => /^DROP /.test(l));
  assert.equal(statements.length, 2);
  for (const st of statements) assert.ok(read(FILE).includes(`--   ${st}`), `header: ${st}`);
  // Without the guard present the block fails and changes nothing.
  const d2 = await db();
  const before = await snap(d2);
  await assert.rejects(d2.exec(rollbackGuardSql()), /does not exist/);
  assert.equal(await snap(d2), before);
});

test("guard rollback + reactivation restore the state before the migration exactly", async () => {
  const d = await db();
  const before = await snap(d);
  await d.exec(read(FILE));
  await d.exec(rollbackGuardSql());
  await d.exec(reactivateSql());
  assert.equal(await snap(d), before);
});

test("open-round guard: refuses a NEW open round on an inactive question, nothing else", async () => {
  const d = await db();
  // A legacy open instance on a question that was already inactive is left exactly as it is.
  await d.exec(`INSERT INTO public.questions VALUES ('00000000-0000-4000-8000-0000000000f2', false, '{"q":4}', '{}');
    INSERT INTO public.question_instances (student_id, question_id, answered)
      VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000f2', false);`);
  await d.exec(read(FILE));
  const refused = /open round refused: question .* is not active/;
  // insert of an open instance on an inactive question
  await assert.rejects(d.query(`INSERT INTO public.question_instances (student_id, question_id, answered) VALUES ($1, $2, false)`,
    [PUPIL, A]), (e) => e.code === "23514" && refused.test(e.message));
  // reopen of an answered instance on an inactive question
  await assert.rejects(d.query(`UPDATE public.question_instances SET answered = false WHERE question_id = $1`, [B]),
    (e) => e.code === "23514" && refused.test(e.message));
  // moving an open instance onto an inactive question
  await d.query(`INSERT INTO public.question_instances (student_id, question_id, answered) VALUES ($1, $2, false)`, [PUPIL, OTHER]);
  await assert.rejects(d.query(`UPDATE public.question_instances SET question_id = $1 WHERE student_id = $2 AND answered = false`,
    [A, PUPIL]), (e) => e.code === "23514");
  // the pupil is not stuck: the open round on the active question is theirs and can be answered
  await d.query(`UPDATE public.question_instances SET answered = true, user_answer = 'z' WHERE student_id = $1 AND answered = false`, [PUPIL]);
  // writes that open no new round pass: an answered row, updates of existing rows, the legacy open row
  await d.query(`INSERT INTO public.question_instances (question_id, answered, user_answer) VALUES ($1, true, 'w')`, [A]);
  await d.query(`UPDATE public.question_instances SET user_answer = 'v' WHERE question_id = $1`, [B]);
  await d.query(`UPDATE public.question_instances SET user_answer = 'legacy', answered = false
    WHERE question_id = '00000000-0000-4000-8000-0000000000f2'`);
  const open = (await d.query(`SELECT q.is_active, count(*)::int AS n FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id WHERE NOT qi.answered GROUP BY 1`)).rows;
  assert.deepEqual(open, [{ is_active: false, n: 1 }], "only the legacy open row, untouched by the guard");
});

test("the guard function is no API: SECURITY DEFINER, empty search_path, no role may execute it", async () => {
  const d = await db();
  await d.exec(read(FILE));
  const f = (await d.query(`SELECT prosecdef, proconfig, prorettype::regtype::text AS ret FROM pg_proc
    WHERE proname = 'guard_open_round_requires_active_question'`)).rows[0];
  assert.equal(f.prosecdef, true);
  assert.deepEqual(f.proconfig, ['search_path=""']);
  assert.equal(f.ret, "trigger");
  for (const role of ["anon", "authenticated", "service_role"]) {
    const r = (await d.query(`SELECT has_function_privilege($1, 'public.guard_open_round_requires_active_question()', 'EXECUTE') AS x`, [role])).rows[0];
    assert.equal(r.x, false, role);
  }
  const t = (await d.query(`SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname = 'open_round_requires_active_question'`)).rows[0];
  assert.match(t.def, /BEFORE INSERT OR UPDATE OF answered, question_id ON public\.question_instances FOR EACH ROW/);
});

test("not data-only any more: the isolated replay skips it as not applied in production", () => {
  assert.ok(forbiddenMigrationTokens(read(FILE)).length > 0, "it creates a function and a trigger");
  assert.match(NOT_IN_PRODUCTION[NAME], /not applied in production/);
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  const step = planReplay(files, (f) => read(`supabase/migrations/${f}`)).plan.find((p) => p.file === NAME);
  assert.equal(step?.action, "skip");
});
