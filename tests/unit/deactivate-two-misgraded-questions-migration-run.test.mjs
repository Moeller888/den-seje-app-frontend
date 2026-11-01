// RUNTIME proof for migration 20261101140000_deactivate_two_misgraded_questions (D-290, G2), PGlite.
// The file is executed UNMODIFIED on synthetic rows that carry the two production ids.
//
// Cases: it deactivates exactly the two questions and nothing else; each guard aborts and changes
// nothing (one already inactive, an open instance); a re-run aborts without change; the documented
// reactivation restores exactly the two rows; the file is data-only (the isolated replay skips it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { forbiddenMigrationTokens } from "../../.github/ci/classify-changes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261101140000_deactivate_two_misgraded_questions.sql";
const A = "08c1770e-b9e6-4a14-a5e0-6420337ba052";
const B = "3213c5be-71b8-4dab-817f-26a1deca5cb5";
const OTHER = "00000000-0000-4000-8000-0000000000f1";

function reactivateSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/deactivate-two-misgraded-questions.md"));
  assert.ok(m && /REACTIVATE D-290/.test(m[1]));
  return m[1];
}
async function db({ open = false, inactive = false } = {}) {
  const d = new PGlite();
  await d.exec(`
    CREATE TABLE public.questions (id uuid PRIMARY KEY, is_active boolean NOT NULL, content jsonb);
    CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id uuid NOT NULL REFERENCES public.questions(id), answered boolean NOT NULL, user_answer text);
    INSERT INTO public.questions VALUES ('${A}', ${!inactive}, '{"q":1}'), ('${B}', true, '{"q":2}'), ('${OTHER}', true, '{"q":3}');
    INSERT INTO public.question_instances (question_id, answered, user_answer) VALUES ('${A}', true, 'x'), ('${B}', true, 'y');
    ${open ? `INSERT INTO public.question_instances (question_id, answered) VALUES ('${B}', false);` : ""}`);
  return d;
}
const snap = async (d) => JSON.stringify((await d.query(`SELECT
  (SELECT json_agg(json_build_object('id', id, 'a', is_active, 'c', content) ORDER BY id) FROM public.questions) AS q,
  (SELECT json_agg(json_build_object('q', question_id, 'a', answered, 'u', user_answer) ORDER BY question_id, answered) FROM public.question_instances) AS i`)).rows[0]);
const active = async (d) => (await d.query("SELECT id FROM public.questions WHERE is_active ORDER BY id")).rows.map((r) => r.id);

test("deactivates exactly the two questions; nothing else changes", async () => {
  const d = await db();
  const before = JSON.parse(await snap(d));
  await d.exec(read(FILE));
  assert.deepEqual(await active(d), [OTHER]);
  const after = JSON.parse(await snap(d));
  assert.deepEqual(after.i, before.i, "instances and answers untouched");
  assert.deepEqual(after.q.map((r) => r.c), before.q.map((r) => r.c), "content untouched");
});

test("guard: one question already inactive → aborts, nothing changed", async () => {
  const d = await db({ inactive: true });
  const before = await snap(d);
  await assert.rejects(d.exec(read(FILE)), /D-290: expected 2 active questions, found 1/);
  assert.equal(await snap(d), before);
});

test("guard: an open instance of either question → aborts, nothing changed", async () => {
  const d = await db({ open: true });
  const before = await snap(d);
  await assert.rejects(d.exec(read(FILE)), /D-290: 1 open instance/);
  assert.equal(await snap(d), before);
});

test("a re-run aborts without change (applied once only)", async () => {
  const d = await db();
  await d.exec(read(FILE));
  const once = await snap(d);
  await assert.rejects(d.exec(read(FILE)), /found 0/);
  assert.equal(await snap(d), once);
});

test("the documented reactivation restores exactly the two rows", async () => {
  const d = await db();
  const before = await snap(d);
  await d.exec(read(FILE));
  await d.exec(reactivateSql());
  assert.equal(await snap(d), before);
});

test("the file is data-only: the isolated replay classifies it as skip (no schema token)", () => {
  assert.deepEqual(forbiddenMigrationTokens(read(FILE)), []);
});
