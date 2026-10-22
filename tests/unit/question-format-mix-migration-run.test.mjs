// RUNTIME proof for migration 20261019150000_question_format_mix. The SQL file is executed UNMODIFIED on
// a real PostgreSQL (PGlite, in-process — no Docker, no network), next to the LIVE
// get_unserved_questions_for_student and request_repeat_question_for_student read UNMODIFIED from
// migration A (20261016160000; both bodies verified identical to production by md5, 2026-10-20).
//
// What this proves:
//   1. SERVABLE RULE: public.question_is_servable agrees with the TS registry (classifyQuestion +
//      servable) on every combination in the matrix — the two can only change together.
//   2. CANDIDATES: never outside the old scope predicate; servable formats only (Match par and unknown
//      formats are never candidates); rows placed physically LAST are in every pupil's window where the
//      old LIMIT 50 misses them; ≤ p_per_group per stratum; deterministic per pupil.
//   3. REPEAT: with answered MC and only unsupported new questions left, the old function refuses a
//      repeat (the mismatch) and the new one gives one; every old guard still holds.
//   4. BAND: advance_student_band equals the TS specification (server-band.ts foldBand) on random
//      sequences, keeps earned progression (12 correct → 5, then 60 alternating → still 5), folds each
//      attempt once (a re-answered repeat counts again, a repeated call counts nothing), restarts on a
//      seed change or deleted history, and is not reachable or readable by clients.
//   5. POSTGREST FORM: the history select, sent by a real supabase-js client (captured fetch, no
//      network), names exactly the columns, the embed and the JSON path the fixture schema has, and the
//      to-one embed shape PostgREST returns is what toMixHistory reads.
//   6. INTEGRATION: real SQL output → real mix plan → the public DTO carries no key.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and single-connection, so the row lock
// that serialises concurrent advance_student_band calls is asserted in the SQL text, not raced.
// PostgREST itself is not in the loop: its request is captured and its response shape is modelled.
// Passing is not permission to apply (D-110).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { planNextQuestions, toMixHistory } from "../../supabase/functions/get-next-question/format-mix.ts";
import { foldBand, initialFoldState, startBand } from "../../supabase/functions/get-next-question/server-band.ts";
import { loadFormatMixPlan, HISTORY_SELECT, HISTORY_LIMIT } from "../../supabase/functions/get-next-question/mix-flow.ts";
import { classifyQuestion, isServableKind, servableWireFormat } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { toPublicQuestion } from "../../supabase/functions/_shared/question-dto.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261019150000_question_format_mix.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");
const MIGRATION_A = readFileSync(join(ROOT, "supabase", "migrations", "20261016160000_answer_keys_server_side_rpcs.sql"), "utf8");
const liveFunction = (name) => {
  const m = MIGRATION_A.match(new RegExp(String.raw`CREATE FUNCTION public\.${name}\([\s\S]*?\n\$\$;\n\nREVOKE[^\n]*\nGRANT[^\n]*`));
  if (!m) throw new Error(`${name} not found in migration A`);
  return m[0];
};

const HISTORY = ["vikings", "middle_ages", "world_war_2", "cold_war", "industrialisation"];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pupil = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PUPILS = Array.from({ length: 80 }, (_, i) => pupil(i));

// 400 MC rows first (grades 3–9, bands 1–5, history + english), then the rare kinds LAST.
const ROWS = [];
for (let i = 0; i < 400; i++) {
  ROWS.push({ id: uuid(i), f: "mc", t: "short", g: 3 + (i % 7), b: 1 + (i % 5), lo: i % 9 === 0 ? "english" : HISTORY[i % 4],
    c: { question: `MC ${i}?`, options: ["a", "b", "c"], correct: "a", accepted_answers: ["a"] } });
}
const STAV = [uuid(900), uuid(901)];
ROWS.push({ id: STAV[0], f: "text", t: "short", g: 7, b: 1, lo: "world_war_2", c: { question: "Stav: Polen?", correct: "Polen", review_text: "Polen." } });
ROWS.push({ id: STAV[1], f: "text", t: "short", g: 7, b: 1, lo: "world_war_2", c: { question: "Stav: Norge?", correct: "Norge" } });
const NUMS = Array.from({ length: 30 }, (_, i) => uuid(1000 + i));
NUMS.forEach((id, i) => ROWS.push({ id, f: "number", t: "short", g: 7, b: 1 + (i % 3), lo: "industrialisation", c: { question: `Tal ${i}?`, correct: String(i) } }));
const MATCH = uuid(1100);
ROWS.push({ id: MATCH, f: "match", t: "short", g: 7, b: 1, lo: "vikings", c: { question: "Par?", pairs: [["a", "b"]] } });
const UNKNOWN = uuid(1101);
ROWS.push({ id: UNKNOWN, f: "drag_drop", t: "short", g: 7, b: 1, lo: "vikings", c: { question: "Træk?", options: ["x", "y"], correct: "x" } });
const INACTIVE = uuid(1200);
ROWS.push({ id: INACTIVE, f: "text", t: "short", g: 7, b: 1, lo: "world_war_2", c: { question: "Inaktiv?" }, inactive: true });
const FORCE = uuid(1300);
ROWS.push({ id: FORCE, f: "mc", t: "short", g: 7, b: 1, lo: "vikings", c: { question: "Fri tekst?", options: ["x", "y"], correct: "x", force_text: true } });
// A tiny repeat scope: domain "democracy_power" holds 3 MC (to be answered), 1 long answer (answered,
// teacher-graded) and 2 new Match par rows — nothing servable left once the MC are answered.
const RP_MC = [uuid(2000), uuid(2001), uuid(2002)];
RP_MC.forEach((id, i) => ROWS.push({ id, f: "mc", t: "short", g: 7, b: 1, lo: "democracy_power", c: { question: `RP ${i}?`, options: ["a", "b"], correct: "a" } }));
const RP_LONG = uuid(2010);
ROWS.push({ id: RP_LONG, f: "text", t: "long", g: 7, b: 1, lo: "democracy_power", c: { question: "Forklar?" } });
const RP_MATCH = [uuid(2020), uuid(2021)];
RP_MATCH.forEach((id, i) => ROWS.push({ id, f: "match", t: "short", g: 7, b: 1, lo: "democracy_power", c: { question: `Par ${i}?` } }));

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
    -- The LIVE default privileges (pg_default_acl, read 2026-10-21): every new table in public is
    -- arwdDxtm and every new function EXECUTE for anon and authenticated. Without these in the
    -- fixture a missing REVOKE in the migration would go unnoticed.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, answer_format text NOT NULL,
      answer_type text DEFAULT 'short', metadata jsonb, difficulty_band smallint, is_active boolean NOT NULL DEFAULT true,
      target_grade smallint, learning_objective text);
    CREATE TABLE public.question_instances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
      correct_answer text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
      answered boolean NOT NULL DEFAULT false, answered_at timestamptz, next_review_at timestamptz,
      user_answer text, was_correct boolean, teacher_score integer, repeat_count integer NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances (student_id, question_id);
    CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE (answered = false);
    CREATE TABLE public.placement_sessions (student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      question_ids uuid[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
      band smallint CHECK (band BETWEEN 1 AND 4));
    GRANT USAGE ON SCHEMA auth TO service_role;
    GRANT ALL ON public.questions, public.question_instances, public.placement_sessions TO service_role;
    GRANT SELECT ON public.questions TO authenticated;
  `);
  await db.exec(`INSERT INTO auth.users VALUES ${PUPILS.map((p) => `('${p}')`).join(", ")};`);
  for (const r of ROWS) {
    await db.exec(`INSERT INTO public.questions (id, content, answer_format, answer_type, metadata, difficulty_band, is_active, target_grade, learning_objective)
      VALUES ('${r.id}', ${sqlStr(JSON.stringify(r.c))}, '${r.f}', '${r.t}', '{}', ${r.b}, ${r.inactive ? "false" : "true"}, ${r.g}, '${r.lo}');`);
  }
  await db.exec(liveFunction("get_unserved_questions_for_student"));
  await db.exec(liveFunction("request_repeat_question_for_student"));
  await db.exec(MIGRATION);
});

const q1 = async (sql, params = []) => (await db.query(sql, params)).rows;
const callNew = async (student, grade, domains, perGroup) => {
  const args = perGroup === undefined ? "" : `, ${perGroup === null ? "NULL" : perGroup}`;
  return q1(`SELECT * FROM public.get_question_candidates_for_student($1::uuid, $2::smallint, $3::text[]${args})`, [student, grade, domains]);
};
const callOld = (student, grade, domains) =>
  q1("SELECT * FROM public.get_unserved_questions_for_student($1::uuid, $2::smallint, $3::text[])", [student, grade, domains]);
const eligible = async (student, grade, domains) => (await q1(`
  SELECT q.id FROM public.questions q WHERE q.is_active
    AND ($2::smallint IS NULL OR q.target_grade IS NULL OR q.target_grade <= $2::smallint)
    AND ($3::text[] IS NULL OR q.learning_objective = ANY($3::text[]))
    AND NOT EXISTS (SELECT 1 FROM public.question_instances qi WHERE qi.student_id = $1::uuid AND qi.question_id = q.id)`,
  [student, grade, domains])).map((r) => r.id);
const serve = (student, questionId) => q1(
  "INSERT INTO public.question_instances (student_id, question_id) VALUES ($1, $2) RETURNING id", [student, questionId]);
const answer = (instanceId, correct, at) => q1(
  "UPDATE public.question_instances SET answered = true, was_correct = $2, answered_at = $3::timestamptz WHERE id = $1",
  [instanceId, correct, at]);
const advance = async (student, grade = 7) => (await q1("SELECT * FROM public.advance_student_band($1::uuid, $2::smallint)", [student, grade]))[0];

// ── 1. One servable rule in SQL and TS ───────────────────────────────────────────────────────────
test("question_is_servable agrees with the TS registry (classifyQuestion + servable) on the whole matrix", async () => {
  const formats = ["mc", "mc_single", "number", "numbers", "text", "match", "match_pairs", "MC", "Text", " mc", "longtext",
    "mc_number", "drag_drop", "", null];
  const types = ["short", "long", "Long", "", null, "medium", " short"];
  let checked = 0;
  for (const f of formats) for (const t of types) for (const force of [false, true]) {
    const content = force ? { question: "?", force_text: true } : { question: "?" };
    const [{ ok }] = await q1("SELECT public.question_is_servable($1::text, $2::text, $3::jsonb) AS ok", [f, t, JSON.stringify(content)]);
    const ts = isServableKind(classifyQuestion({ answer_format: f, answer_type: t, content }));
    assert.equal(ok, ts, JSON.stringify({ f, t, force }));
    checked++;
  }
  assert.equal(checked, 15 * 7 * 2);
});

// ── 2. Candidates ────────────────────────────────────────────────────────────────────────────────
test("candidates: never outside the old predicate, servable formats only — Match par and unknown formats never", async () => {
  for (const [grade, domains] of [[7, HISTORY], [9, null], [3, ["vikings"]], [null, ["english"]], [7, ["world_war_2"]]]) {
    const full = await eligible(pupil(1), grade, domains);
    const got = (await callNew(pupil(1), grade, domains)).map((r) => r.id);
    assert.ok(got.every((id) => full.includes(id)), `grade ${grade} ${domains}`);
    assert.equal(new Set(got).size, got.length, "no duplicates");
    assert.equal(got.includes(MATCH) || got.includes(UNKNOWN) || got.some((id) => RP_MATCH.includes(id)), false);
  }
  const all = await callNew(pupil(1), 9, null, 50);
  for (const r of all) assert.ok(isServableKind(classifyQuestion(r)), `${r.id} ${r.answer_format}`);
  assert.equal(all.some((r) => r.id === INACTIVE), false, "inactive never");
  assert.equal((await callNew(pupil(1), 6, HISTORY, 50)).some((r) => STAV.includes(r.id)), false, "grade 7 rows not for grade 6");
  assert.deepEqual(await callNew(null, 7, HISTORY), [], "a NULL student id returns nothing");
  // With a generous limit and a small scope: exactly the servable eligible set.
  const ww2 = (await eligible(pupil(1), 7, ["world_war_2"])).filter((id) => id !== INACTIVE).sort();
  assert.deepEqual((await callNew(pupil(1), 7, ["world_war_2"], 50)).map((r) => r.id).sort(), ww2);
});

test("candidates: rows placed physically LAST are in every pupil's window; the old LIMIT 50 misses them", async () => {
  for (let p = 10; p < 30; p++) {
    const old = await callOld(pupil(p), 7, HISTORY);
    assert.equal(old.length, 50);
    assert.equal(old.some((r) => STAV.includes(r.id)), false, "old: physical order, the text rows are never reached");
    const ids = (await callNew(pupil(p), 7, HISTORY)).map((r) => r.id);
    assert.ok(STAV.every((id) => ids.includes(id)), `pupil ${p}: both Stav til rows`);
    assert.ok(ids.some((id) => NUMS.includes(id)), `pupil ${p}: number rows`);
    assert.ok(ids.includes(FORCE), "force_text MC is its own stratum, not crowded out by MC");
  }
});

test("candidates: ≤ p_per_group per stratum (default 20, clamped 1..50); deterministic per pupil, different between pupils", async () => {
  const strata = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = `${r.answer_format}/${r.answer_type}/${r.content?.force_text === true}/${r.difficulty_band}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.values()];
  };
  const def = await callNew(pupil(3), 9, null);
  assert.equal(Math.max(...strata(def)), 20);
  assert.ok(strata(await callNew(pupil(3), 9, null, 0)).every((n) => n <= 1), "0 clamps to 1");
  assert.ok(strata(await callNew(pupil(3), 9, null, 999)).every((n) => n <= 50), "999 clamps to 50");
  assert.ok(strata(await callNew(pupil(3), 9, null, null)).every((n) => n <= 20), "NULL = 20");
  const a1 = (await callNew(pupil(4), 9, null)).map((r) => r.id);
  assert.deepEqual((await callNew(pupil(4), 9, null)).map((r) => r.id), a1);
  assert.notDeepEqual((await callNew(pupil(5), 9, null)).map((r) => r.id), a1);
  const ordered = (await q1("SELECT id FROM unnest($1::uuid[]) id ORDER BY md5($2::text || id::text), id", [a1, pupil(4)])).map((r) => r.id);
  assert.deepEqual(ordered, a1);
});

// ── 3. Repeat exhaustion on the servable pool ────────────────────────────────────────────────────
test("REGRESSION: answered MC + only unsupported new questions left → the old repeat refuses, the new one repeats", async () => {
  const P = pupil(40);
  const scope = ["democracy_power"];
  // Answer all three MC (one wrong); the long answer is answered and teacher-graded.
  for (const [i, id] of RP_MC.entries()) {
    const [{ id: inst }] = await serve(P, id);
    await answer(inst, i !== 1, `2026-10-0${i + 1}T08:00:00Z`);
  }
  const [{ id: longInst }] = await serve(P, RP_LONG);
  await q1("UPDATE public.question_instances SET answered = true, teacher_score = 3, answered_at = '2026-10-05T08:00:00Z' WHERE id = $1", [longInst]);

  assert.deepEqual((await callNew(P, 7, scope)).map((r) => r.id), [], "the servable pool is empty");
  assert.equal((await eligible(P, 7, scope)).length, 2, "…but 2 Match par rows are unserved");
  const [{ id: oldId }] = await q1("SELECT public.request_repeat_question_for_student($1, 7::smallint, $2::text[]) AS id", [P, scope]);
  assert.equal(oldId, null, "THE MISMATCH: the old exhaustion check counts Match par and refuses — 'no questions'");

  const [{ id: repeatId }] = await q1("SELECT public.request_repeat_question_servable_for_student($1, 7::smallint, $2::text[]) AS id", [P, scope]);
  assert.ok(repeatId, "the servable repeat reopens an answered MC");
  const [row] = await q1("SELECT qi.question_id, qi.answered, qi.was_correct, qi.repeat_count FROM public.question_instances qi WHERE qi.id = $1", [repeatId]);
  assert.equal(row.question_id, RP_MC[1], "incorrect first");
  assert.deepEqual([row.answered, row.was_correct, row.repeat_count], [false, null, 1]);

  // One open instance: no second repeat.
  const [{ id: again }] = await q1("SELECT public.request_repeat_question_servable_for_student($1, 7::smallint, $2::text[]) AS id", [P, scope]);
  assert.equal(again, null, "never a second repeat while one is open");
});

test("servable repeat keeps every guard: scope, servable unserved left, teacher-graded/text/long/unservable never", async () => {
  const P = pupil(41);
  const call = async (grade, scope) => (await q1(
    "SELECT public.request_repeat_question_servable_for_student($1, $2::smallint, $3::text[]) AS id", [P, grade, scope]))[0].id;
  assert.equal(await call(7, ["democracy_power"]), null, "nothing answered yet and servable MC unserved → no repeat");
  const [{ id: i0 }] = await serve(P, RP_MC[0]);
  await answer(i0, false, "2026-10-01T08:00:00Z");
  assert.equal(await call(7, ["democracy_power"]), null, "two servable MC still unserved → no repeat");
  for (const id of RP_MC.slice(1)) { const [{ id: inst }] = await serve(P, id); await answer(inst, true, "2026-10-02T08:00:00Z"); }
  assert.equal(await call(7, ["democracy_power"]), null, "an unserved long answer is servable: the pool is not exhausted");
  const [{ id: longInst }] = await serve(P, RP_LONG);
  await q1("UPDATE public.question_instances SET answered = true, teacher_score = 2, answered_at = '2026-10-03T08:00:00Z' WHERE id = $1", [longInst]);
  assert.equal(await call(6, ["democracy_power"]), null, "out of grade scope (target_grade 7 > 6): nothing to repeat");
  assert.equal(await call(7, ["vikings"]), null, "another domain: its own unserved pool is not empty");
  const got = await call(7, ["democracy_power"]);
  assert.ok(got);
  const [{ question_id }] = await q1("SELECT question_id FROM public.question_instances WHERE id = $1", [got]);
  assert.ok(RP_MC.includes(question_id), "only an auto-graded, servable MC is ever reopened");
  assert.equal(await call(7, ["democracy_power"]), null, "the reopened one is open now");
  assert.equal(await (async () => (await q1("SELECT public.request_repeat_question_servable_for_student(NULL, 7::smallint, NULL) AS id"))[0].id)(), null);
});

// ── 4. Server-owned band ─────────────────────────────────────────────────────────────────────────
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test("advance_student_band equals the TS specification on random sequences, folded incrementally", async () => {
  // Production invariant this relies on: answered_at = now() is written in the SAME UPDATE as the
  // verdict, and a pupil's next answer can only start after the previous one committed (one open
  // instance), so one pupil's verdict timestamps strictly increase in commit order.
  for (let n = 50; n < 58; n++) {
    const P = pupil(n);
    const r = lcg(n);
    const rows = [];
    const qs = ROWS.filter((q) => q.f === "mc" && q.lo !== "english").slice(0, 25 + (n % 5) * 5);
    for (const [i, q] of qs.entries()) {
      const [{ id }] = await serve(P, q.id);
      const at = new Date(Date.UTC(2026, 8, 1, 8, 0, i)).toISOString();
      const correct = r() < 0.6;
      await answer(id, correct, at);
      rows.push({ id, was_correct: correct, answered_at: at });
      if (r() < 0.25) await advance(P, 8);     // fold incrementally at random points
    }
    const sql = await advance(P, 8);
    const { seed } = startBand(8, null);
    const ts = foldBand(initialFoldState(seed), rows);
    assert.deepEqual([sql.band, sql.seed, sql.seed_source, sql.folded], [ts.band, seed, "grade", ts.folded], `pupil ${n}`);
  }
});

test("advance_student_band: equal timestamps in one fold are ordered by id, exactly like the TS specification", async () => {
  const P = pupil(58);
  const rows = [];
  for (const [i, q] of ROWS.filter((q) => q.f === "mc" && q.lo !== "english").slice(0, 24).entries()) {
    const [{ id }] = await serve(P, q.id);
    const at = new Date(Date.UTC(2026, 8, 2, 8, 0, Math.floor(i / 3))).toISOString(); // triples share a timestamp
    const correct = i % 4 !== 1;
    await answer(id, correct, at);
    rows.push({ id, was_correct: correct, answered_at: at });
  }
  const sql = await advance(P, 7);                 // one full fold
  const ts = foldBand(initialFoldState(1), rows);
  assert.deepEqual([sql.band, sql.folded], [ts.band, ts.folded]);
});

test("REGRESSION: 12 correct from band 1 reach band 5, and 60 further alternating answers keep band 5", async () => {
  const P = pupil(60);
  const qs = ROWS.filter((q) => q.f === "mc").slice(0, 72);
  for (const [i, q] of qs.entries()) {
    const [{ id }] = await serve(P, q.id);
    await answer(id, i < 12 ? true : i % 2 === 0, new Date(Date.UTC(2026, 8, 1, 8, i)).toISOString());
    if (i === 11) assert.equal((await advance(P, 7)).band, 5, "12 correct");
  }
  const after = await advance(P, 7);
  assert.equal(after.band, 5, "the old newest-60 replay returned band 1 here");
  assert.equal(after.folded, 72);
  assert.equal(after.newly_folded, 60);
});

test("band: each attempt folded once — a re-answered repeat counts again, a repeated call counts nothing", async () => {
  const P = pupil(61);
  const ids = [];
  for (const [i, q] of ROWS.filter((q) => q.f === "mc").slice(0, 2).entries()) {
    const [{ id }] = await serve(P, q.id); ids.push(id);
    await answer(id, true, `2026-10-01T08:0${i}:00Z`);
  }
  assert.deepEqual([(await advance(P)).band, (await advance(P)).newly_folded], [1, 0], "2 correct; the second call folds nothing");
  // Repeat: reopen the first instance (as the repeat function does) and answer it again, correctly.
  await q1("UPDATE public.question_instances SET answered = false, was_correct = NULL, answered_at = NULL, repeat_count = repeat_count + 1 WHERE id = $1", [ids[0]]);
  assert.equal((await advance(P)).newly_folded, 0, "an open repeat is not a verdict");
  await answer(ids[0], true, "2026-10-01T09:00:00Z");
  const r = await advance(P);
  assert.deepEqual([r.band, r.folded, r.newly_folded], [2, 3, 1], "3 correct attempts, 2 of them on the same instance → band 2");
});

test("band: seed from a completed placement; a seed change or deleted history refolds from the seed", async () => {
  const P = pupil(62);
  for (const [i, q] of ROWS.filter((q) => q.f === "mc").slice(0, 3).entries()) {
    const [{ id }] = await serve(P, q.id); await answer(id, true, `2026-10-01T08:0${i}:00Z`);
  }
  assert.deepEqual(Object.values(await advance(P, 7)), [2, 1, "grade", 3, 3]);
  await q1("INSERT INTO public.placement_sessions (student_id, completed_at, band) VALUES ($1, now(), 3)", [P]);
  assert.deepEqual(Object.values(await advance(P, 7)), [4, 3, "placement", 3, 3], "placement seed 3 + the same 3 correct");
  await q1("UPDATE public.placement_sessions SET completed_at = NULL WHERE student_id = $1", [P]);
  assert.equal((await advance(P, 9)).seed_source, "grade", "an open placement is no seed; grade 9 starts at 3");
  await q1("DELETE FROM public.question_instances WHERE student_id = $1", [P]);
  assert.deepEqual(Object.values(await advance(P, 9)), [3, 3, "grade", 0, 0], "history gone → back to the seed");
  const [state] = await q1("SELECT band, correct_run, incorrect_run, folded, cursor_at, cursor_id FROM public.student_band_state WHERE student_id = $1", [P]);
  assert.deepEqual(state, { band: 3, correct_run: 0, incorrect_run: 0, folded: 0, cursor_at: null, cursor_id: null });
  await assert.rejects(advance(null), /missing_student_id/);
});

test("band: serialised per pupil (row lock) and the fold order is (answered_at, id) — asserted in the SQL text", () => {
  const body = MIGRATION.slice(MIGRATION.indexOf("CREATE FUNCTION public.advance_student_band"));
  assert.match(body, /ON CONFLICT \(student_id\) DO NOTHING;\s*SELECT \*\s*INTO v_state\s*FROM public\.student_band_state st\s*WHERE st\.student_id = p_student_id\s*FOR UPDATE;/);
  assert.match(body, /ORDER BY qi\.answered_at, qi\.id/);
  assert.match(body, /\(qi\.answered_at, qi\.id\) > \(v_cursor_at, v_cursor_id\)/);
});

// ── 5. Privileges ────────────────────────────────────────────────────────────────────────────────
test("privileges: every new function EXECUTE for service_role only; student_band_state closed to clients", async () => {
  const sigs = [
    "public.question_is_servable(text, text, jsonb)",
    "public.get_question_candidates_for_student(uuid, smallint, text[], integer)",
    "public.request_repeat_question_servable_for_student(uuid, smallint, text[])",
    "public.advance_student_band(uuid, smallint)",
  ];
  for (const sig of sigs) {
    for (const [role, expected] of [["anon", false], ["authenticated", false], ["public", false], ["service_role", true]]) {
      const [{ ok }] = await q1(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS ok`);
      assert.equal(ok, expected, `${sig} ${role}`);
    }
    const [{ proconfig }] = await q1(`SELECT proconfig FROM pg_proc WHERE oid = '${sig}'::regprocedure`);
    assert.deepEqual(proconfig, ["search_path=public, pg_temp"], sig);
  }
  const definer = await q1(`SELECT proname, prosecdef FROM pg_proc WHERE proname IN
    ('question_is_servable','get_question_candidates_for_student','request_repeat_question_servable_for_student','advance_student_band') ORDER BY proname`);
  assert.deepEqual(definer.map((r) => [r.proname, r.prosecdef]), [["advance_student_band", true], ["get_question_candidates_for_student", true],
    ["question_is_servable", false], ["request_repeat_question_servable_for_student", true]]);
  // The fixture grants what live default privileges grant; the migration must take all of it back.
  const [{ ok: defaultsWork }] = await q1("SELECT has_function_privilege('authenticated', 'public.get_unserved_questions_for_student(uuid, smallint, text[])', 'EXECUTE') AS ok");
  assert.equal(defaultsWork, false, "migration A's own REVOKE holds under the live defaults too");
  for (const role of ["anon", "authenticated"]) {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
      const [{ ok }] = await q1(`SELECT has_table_privilege('${role}', 'public.student_band_state', '${priv}') AS ok`);
      assert.equal(ok, false, `${role} ${priv}`);
    }
  }
  const [{ relrowsecurity }] = await q1("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_band_state'::regclass");
  assert.equal(relrowsecurity, true);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(db.query(`SELECT * FROM public.advance_student_band('${pupil(1)}'::uuid, 7::smallint)`), /permission denied/);
  await assert.rejects(db.query("SELECT * FROM public.student_band_state"), /permission denied/);
  await db.exec("RESET ROLE");
});

test("the migration only ADDS: old functions unchanged, no policy/privilege change on existing tables", async () => {
  const [{ d }] = await q1("SELECT pg_get_functiondef('public.get_unserved_questions_for_student(uuid,smallint,text[])'::regprocedure) AS d");
  assert.match(d, /LIMIT 50;/);
  const sql = MIGRATION.replace(/--[^\n]*/g, "");
  assert.equal(/\b(DROP|CREATE OR REPLACE|CREATE POLICY|ALTER POLICY)\b/i.test(sql), false);
  assert.equal(/\bALTER TABLE (?!public\.student_band_state\b)/i.test(sql), false, "only the new table is altered");
  assert.equal(/\b(GRANT|REVOKE)\b[^;]*\bON (TABLE )?public\.(questions|question_instances|placement_sessions|profiles)\b/i.test(sql), false);
});

// ── 6. The history select's PostgREST form ───────────────────────────────────────────────────────
test("PostgREST form: supabase-js sends exactly this select; it names real columns, the FK embed and a jsonb path", async () => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET" });
    const u = new URL(String(url));
    const body = u.pathname.endsWith("/rpc/advance_student_band")
      ? [{ band: 1, seed: 1, seed_source: "grade", folded: 0, newly_folded: 0 }] : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = createClient("http://postgrest.invalid", "service-role-placeholder",
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakeFetch } });
  await loadFormatMixPlan(client, { studentId: pupil(1), grade: 7, domains: ["world_war_2"], wavePhase: "challenge", lastMisconceptionType: null });

  const hist = requests.find((r) => new URL(r.url).pathname.endsWith("/rest/v1/question_instances"));
  assert.ok(hist, "the history read reached PostgREST's table endpoint");
  const params = new URL(hist.url).searchParams;
  assert.equal(params.get("select"), HISTORY_SELECT.replace(/\s+/g, ""), "supabase-js strips whitespace, nothing else");
  assert.equal(params.get("student_id"), `eq.${pupil(1)}`);
  assert.equal(params.get("order"), "created_at.desc");
  assert.equal(params.get("limit"), String(HISTORY_LIMIT));
  assert.deepEqual(requests.filter((r) => new URL(r.url).pathname.includes("/rpc/")).map((r) => [new URL(r.url).pathname, r.method]),
    [["/rest/v1/rpc/get_question_candidates_for_student", "POST"], ["/rest/v1/rpc/advance_student_band", "POST"]]);

  // Parse the select (top-level columns, one embed with its columns and an aliased JSON path) and check
  // every name against the fixture schema — the same names the live tables have.
  const sel = params.get("select");
  const m = sel.match(/^([a-z_,]+),questions\(([^)]*)\)$/);
  assert.ok(m, sel);
  const cols = async (t) => (await q1("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t]));
  const qiCols = new Set((await cols("question_instances")).map((c) => c.column_name));
  for (const c of m[1].split(",").filter(Boolean)) assert.ok(qiCols.has(c), `question_instances.${c}`);
  const qCols = new Map((await cols("questions")).map((c) => [c.column_name, c.data_type]));
  for (const c of m[2].split(",")) {
    const path = c.match(/^([a-z_]+):([a-z_]+)->([a-z_]+)$/);
    if (path) { assert.equal(qCols.get(path[2]), "jsonb", `${path[2]} must be jsonb for ->`); continue; }
    assert.ok(qCols.has(c), `questions.${c}`);
  }
  const fks = await q1(`SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'public.question_instances'::regclass
    AND contype = 'f' AND confrelid = 'public.questions'::regclass`);
  assert.equal(fks[0].n, 1, "exactly one FK to questions — the embed is unambiguous (live: question_instances_question_id_fkey)");
});

test("PostgREST form: the to-one embed shape (an object) is what toMixHistory reads — modelled in SQL", async () => {
  const P = pupil(63);
  for (const id of [STAV[0], FORCE, NUMS[0], uuid(1)]) await serve(P, id).then(async ([{ id: inst }]) => answer(inst, true, "2026-10-01T08:00:00Z"));
  const rows = (await q1(`
    SELECT json_build_object('created_at', qi.created_at,
      'questions', json_build_object('answer_format', q.answer_format, 'answer_type', q.answer_type,
        'difficulty_band', q.difficulty_band, 'learning_objective', q.learning_objective,
        'force_text', q.content -> 'force_text')) AS r
    FROM public.question_instances qi LEFT JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id = $1 ORDER BY qi.created_at DESC, qi.id LIMIT 20`, [P])).map((x) => x.r);
  const kinds = toMixHistory(rows).map((h) => h.kind).sort();
  assert.deepEqual(kinds, ["choice", "force_text", "number", "short_text"]);
});

// ── 7. Integration: real SQL → real plan → public DTO without key ────────────────────────────────
test("integration: the real SQL window fed to the real mix plan serves every qualified kind; the public DTO has no key", async () => {
  const rows = await callNew(pupil(7), 7, HISTORY);
  const choice = (n) => Array.from({ length: n }, () => ({ kind: "choice", domain: null }));
  const at = (history) => planNextQuestions({ candidates: rows, history, targetBand: 1, wavePhase: "challenge", lastMisconceptionType: null });
  assert.deepEqual(at(choice(0)).decision.qualified, ["short_text", "number", "force_text"]);
  assert.equal(at(choice(8)).decision.kind, "choice", "0.10 · 9 < 1");
  const due = at(choice(9));
  assert.equal(due.decision.kind, "short_text");
  assert.ok(STAV.includes(due.ordered[0].id));
  const next = at([...choice(3), { kind: "short_text", domain: "world_war_2" }, ...choice(9)]);
  assert.equal(next.decision.kind, "number");
  for (const q of [...due.ordered, ...next.ordered]) {
    assert.notEqual(q.id, MATCH);
    const format = servableWireFormat(q);
    assert.ok(format, q.id);
    const pub = toPublicQuestion(q.content, format, q.metadata);
    for (const key of ["correct", "accepted_answers", "review_text", "pairs"]) {
      assert.equal(Object.hasOwn(pub.content, key), false, `${q.id} leaks ${key}`);
    }
  }
});
