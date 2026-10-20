// RUNTIME proof for migration 20261019150000_question_candidates_stratified (the format mix's candidate
// window). The SQL file is executed UNMODIFIED on a real PostgreSQL (PGlite, in-process — no Docker,
// no network), next to the LIVE get_unserved_questions_for_student read UNMODIFIED from migration A
// (20261016160000; live body verified identical with pg_get_functiondef on 2026-10-19).
//
// What this proves:
//   1. SCOPE: the new function returns only rows the old predicate allows (active, grade, domains,
//      not yet served, NULL student = nothing) — and with a generous per-group limit, exactly those.
//   2. THE FIX: rare kinds placed physically LAST (as the two live Stav til rows are, at 1846–1847 of
//      2,101) are in every pupil's window, where the old LIMIT 50 never reaches them.
//   3. STRATIFICATION: ≤ p_per_group per (answer_format, answer_type, force_text, band); a new format
//      gets its own group with no change to the SQL.
//   4. DETERMINISM: same pupil → same rows in the same order; different pupils → different order.
//   5. PRIVILEGES: EXECUTE for service_role only; the old functions are untouched.
//   6. INTEGRATION: the real format-mix plan, fed with the real SQL output, puts Stav til in front once
//      it is due.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6). Roles are modelled (anon,
// authenticated, service_role); PostgREST is not in the loop. Passing is not permission to apply (D-110).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { planNextQuestions } from "../../supabase/functions/get-next-question/format-mix.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", "20261019150000_question_candidates_stratified.sql"), "utf8");
const MIGRATION_A = readFileSync(join(ROOT, "supabase", "migrations", "20261016160000_answer_keys_server_side_rpcs.sql"), "utf8");
const OLD_FUNCTION = (() => {
  const m = MIGRATION_A.match(/CREATE FUNCTION public\.get_unserved_questions_for_student\([\s\S]*?\n\$\$;\n\nREVOKE[^\n]*\nGRANT[^\n]*/);
  if (!m) throw new Error("get_unserved_questions_for_student not found in migration A");
  return m[0];
})();

const HISTORY = ["vikings", "middle_ages", "world_war_2", "cold_war"];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pupil = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

// 400 MC rows first (grades 3–9, bands 1–5, 4 history domains + english), then the rare kinds LAST.
const ROWS = [];
for (let i = 0; i < 400; i++) {
  ROWS.push({ id: uuid(i), f: "mc", t: "short", g: 3 + (i % 7), b: 1 + (i % 5), lo: i % 9 === 0 ? "english" : HISTORY[i % 4],
    c: { question: `MC ${i}?`, options: ["a", "b", "c"], correct: "a" } });
}
const STAV = [uuid(900), uuid(901)];
ROWS.push({ id: STAV[0], f: "text", t: "short", g: 7, b: 1, lo: "world_war_2", c: { question: "Stav: Polen?", correct: "Polen" } });
ROWS.push({ id: STAV[1], f: "text", t: "short", g: 7, b: 1, lo: "world_war_2", c: { question: "Stav: Norge?", correct: "Norge" } });
const NUMS = Array.from({ length: 30 }, (_, i) => uuid(1000 + i));
NUMS.forEach((id, i) => ROWS.push({ id, f: "number", t: "short", g: 7, b: 1 + (i % 3), lo: "industrialisation", c: { question: `Tal ${i}?`, correct: String(i) } }));
const MATCH = uuid(1100);
ROWS.push({ id: MATCH, f: "match", t: "short", g: 7, b: 1, lo: "vikings", c: { question: "Par?", pairs: [["a", "b"]] } });
const INACTIVE = uuid(1200);
ROWS.push({ id: INACTIVE, f: "text", t: "short", g: 7, b: 1, lo: "world_war_2", c: { question: "Inaktiv?" }, inactive: true });
const FORCE = uuid(1300);
ROWS.push({ id: FORCE, f: "mc", t: "short", g: 7, b: 1, lo: "vikings", c: { question: "Fri tekst?", options: ["x", "y"], correct: "x", force_text: true } });

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, answer_format text NOT NULL,
      answer_type text DEFAULT 'short', metadata jsonb, difficulty_band smallint, is_active boolean NOT NULL DEFAULT true,
      target_grade smallint, learning_objective text);
    CREATE TABLE public.question_instances (id serial PRIMARY KEY, student_id uuid NOT NULL, question_id uuid NOT NULL);
    CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances (student_id, question_id);
    GRANT ALL ON public.questions, public.question_instances TO service_role;
  `);
  for (const r of ROWS) {
    await db.exec(`INSERT INTO public.questions (id, content, answer_format, answer_type, metadata, difficulty_band, is_active, target_grade, learning_objective)
      VALUES ('${r.id}', ${sqlStr(JSON.stringify(r.c))}, '${r.f}', '${r.t}', '{}', ${r.b}, ${r.inactive ? "false" : "true"}, ${r.g}, '${r.lo}');`);
  }
  await db.exec(OLD_FUNCTION);
  await db.exec(MIGRATION);
});

const callNew = async (student, grade, domains, perGroup) => {
  const args = perGroup === undefined ? "" : `, ${perGroup === null ? "NULL" : perGroup}`;
  const res = await db.query(`SELECT * FROM public.get_question_candidates_for_student($1::uuid, $2::smallint, $3::text[]${args})`,
    [student, grade, domains]);
  return res.rows;
};
const callOld = async (student, grade, domains) =>
  (await db.query("SELECT * FROM public.get_unserved_questions_for_student($1::uuid, $2::smallint, $3::text[])", [student, grade, domains])).rows;
// The old predicate WITHOUT its LIMIT — the full eligible set.
const eligible = async (student, grade, domains) => (await db.query(`
  SELECT q.id FROM public.questions q WHERE q.is_active
    AND ($2::smallint IS NULL OR q.target_grade IS NULL OR q.target_grade <= $2::smallint)
    AND ($3::text[] IS NULL OR q.learning_objective = ANY($3::text[]))
    AND NOT EXISTS (SELECT 1 FROM public.question_instances qi WHERE qi.student_id = $1::uuid AND qi.question_id = q.id)`,
  [student, grade, domains])).rows.map((r) => r.id).sort();

const ALL_HISTORY = [...HISTORY, "industrialisation"];

test("scope: never outside the old predicate; with a large per-group limit exactly the eligible set", async () => {
  for (const [grade, domains] of [[7, ALL_HISTORY], [9, null], [3, ["vikings"]], [null, ["english"]], [7, ["world_war_2"]]]) {
    const full = await eligible(pupil(1), grade, domains);
    const got = (await callNew(pupil(1), grade, domains)).map((r) => r.id);
    assert.ok(got.every((id) => full.includes(id)), `grade ${grade} ${domains}`);
    assert.equal(new Set(got).size, got.length, "no duplicates");
  }
  // Generous limit and a small scope: exactly the eligible set.
  assert.deepEqual((await callNew(pupil(1), 7, ["world_war_2"], 50)).map((r) => r.id).sort(), await eligible(pupil(1), 7, ["world_war_2"]));
  assert.equal((await callNew(pupil(1), 7, ALL_HISTORY, 50)).some((r) => r.id === INACTIVE), false, "inactive never");
  assert.equal((await callNew(pupil(1), 6, ALL_HISTORY, 50)).some((r) => STAV.includes(r.id)), false, "grade 7 rows not for grade 6");
  assert.equal((await callNew(pupil(1), 9, ["english"], 50)).some((r) => r.learning_objective !== "english"), false);
  assert.deepEqual(await callNew(null, 7, ALL_HISTORY), [], "a NULL student id returns nothing");
});

test("served questions are excluded, exactly like the old function", async () => {
  await db.exec(`INSERT INTO public.question_instances (student_id, question_id) VALUES ('${pupil(2)}', '${STAV[0]}'), ('${pupil(2)}', '${uuid(3)}');`);
  const rows = await callNew(pupil(2), 9, null, 50);
  assert.equal(rows.some((r) => r.id === STAV[0] || r.id === uuid(3)), false);
  assert.equal(rows.some((r) => r.id === STAV[1]), true);
});

test("the fix: rows placed physically LAST are in every pupil's window; the old LIMIT 50 misses them", async () => {
  for (let p = 10; p < 40; p++) {
    const old = await callOld(pupil(p), 7, ALL_HISTORY);
    assert.equal(old.length, 50);
    assert.equal(old.some((r) => STAV.includes(r.id)), false, "old: physical order, the text rows are never reached");
    const ids = (await callNew(pupil(p), 7, ALL_HISTORY)).map((r) => r.id);
    assert.ok(STAV.every((id) => ids.includes(id)), `pupil ${p}: both Stav til rows`);
    assert.ok(ids.some((id) => NUMS.includes(id)), `pupil ${p}: number rows`);
    assert.ok(ids.includes(MATCH), "a new format gets its own group without any SQL change");
    assert.ok(ids.includes(FORCE), "force_text MC is its own group, not crowded out by MC");
  }
});

test("stratified: at most p_per_group per (format, type, force_text, band); default 20, clamped 1..50", async () => {
  const count = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = `${r.answer_format}/${r.answer_type}/${r.content?.force_text === true}/${r.difficulty_band}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const def = await callNew(pupil(3), 9, null);
  assert.ok([...count(def).values()].every((n) => n <= 20));
  assert.equal(Math.max(...count(def).values()), 20, "default per group is 20");
  assert.ok([...count(await callNew(pupil(3), 9, null, 5)).values()].every((n) => n <= 5));
  assert.ok([...count(await callNew(pupil(3), 9, null, 0)).values()].every((n) => n <= 1), "0 clamps to 1");
  assert.ok([...count(await callNew(pupil(3), 9, null, 999)).values()].every((n) => n <= 50), "999 clamps to 50");
  assert.ok([...count(await callNew(pupil(3), 9, null, null)).values()].every((n) => n <= 20), "NULL = 20");
  const numberBands = new Set(def.filter((r) => r.answer_format === "number").map((r) => r.difficulty_band));
  assert.deepEqual([...numberBands].sort(), [1, 2, 3], "every band of a kind is represented");
});

test("deterministic per pupil, different between pupils; ordered by md5(student || question)", async () => {
  const a1 = (await callNew(pupil(4), 9, null)).map((r) => r.id);
  const a2 = (await callNew(pupil(4), 9, null)).map((r) => r.id);
  const b = (await callNew(pupil(5), 9, null)).map((r) => r.id);
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1, b);
  const { rows } = await db.query(`SELECT id FROM unnest($1::uuid[]) id ORDER BY md5($2::text || id::text), id`, [a1, pupil(4)]);
  assert.deepEqual(rows.map((r) => r.id), a1);
  const firstMc = (ids) => ids.find((id) => ROWS.find((r) => r.id === id)?.f === "mc");
  assert.notEqual(firstMc(a1), firstMc(b), "two pupils do not start on the same question");
});

test("returns exactly the old columns plus learning_objective", async () => {
  const { fields } = await db.query("SELECT * FROM public.get_question_candidates_for_student($1::uuid, 7::smallint, NULL)", [pupil(6)]);
  assert.deepEqual(fields.map((f) => f.name),
    ["id", "content", "answer_format", "answer_type", "metadata", "difficulty_band", "learning_objective"]);
});

test("privileges: EXECUTE for service_role only; SECURITY DEFINER with a pinned search_path", async () => {
  const sig = "public.get_question_candidates_for_student(uuid, smallint, text[], integer)";
  for (const [role, expected] of [["anon", false], ["authenticated", false], ["public", false], ["service_role", true]]) {
    const { rows } = await db.query(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS ok`);
    assert.equal(rows[0].ok, expected, role);
  }
  const { rows } = await db.query(`SELECT p.prosecdef, p.provolatile, p.proconfig FROM pg_proc p WHERE p.oid = '${sig}'::regprocedure`);
  assert.equal(rows[0].prosecdef, true);
  assert.equal(rows[0].provolatile, "s");
  assert.deepEqual(rows[0].proconfig, ["search_path=public, pg_temp"]);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(db.query(`SELECT * FROM ${sig.replace("(uuid, smallint, text[], integer)", "")}('${pupil(1)}'::uuid, 7::smallint, NULL)`), /permission denied/);
  await db.exec("RESET ROLE");
});

test("the migration only ADDS: the old function is still there, unchanged (LIMIT 50)", async () => {
  const { rows } = await db.query("SELECT pg_get_functiondef('public.get_unserved_questions_for_student(uuid,smallint,text[])'::regprocedure) AS d");
  assert.match(rows[0].d, /LIMIT 50;/);
  assert.equal(/\b(DROP|ALTER|UPDATE|DELETE|INSERT|POLICY|CREATE OR REPLACE)\b/i.test(MIGRATION.replace(/--[^\n]*/g, "")), false);
});

test("integration: the real SQL window fed to the real mix plan serves every qualified kind, never Match par", async () => {
  const rows = await callNew(pupil(7), 7, ALL_HISTORY);
  const choice = (n) => Array.from({ length: n }, () => ({ kind: "choice", domain: null }));
  const at = (history) => planNextQuestions({ candidates: rows, history, targetBand: 1, wavePhase: "challenge", lastMisconceptionType: null });
  // Qualified non-base kinds in this scope: short_text, number, force_text → share = min(0.15, 0.30/3) = 0.10.
  assert.deepEqual(at(choice(0)).decision.qualified, ["short_text", "number", "force_text"]);
  assert.equal(at(choice(8)).decision.kind, "choice", "0.10 · 9 < 1");
  const due = at(choice(9));
  assert.equal(due.decision.kind, "short_text", "0.10 · 10 = 1 — registry order breaks the tie");
  assert.ok(STAV.includes(due.ordered[0].id));
  const next = at([...choice(3), { kind: "short_text", domain: "world_war_2" }, ...choice(9)]);
  assert.equal(next.decision.kind, "number");
  assert.ok(NUMS.includes(next.ordered[0].id));
  for (const p of [due, next, at(choice(20))]) assert.equal(p.ordered.some((r) => r.id === MATCH), false);
});
