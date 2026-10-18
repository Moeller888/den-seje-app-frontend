// "Stav til" in question selection — deterministic proof of WHEN a short-text question can be chosen.
//
// get-next-question (v174) picks new questions from public.get_unserved_questions_for_student and only
// then sorts THOSE candidates (sortByWave). The function body below is read UNMODIFIED from the repo
// migration (20261016160000_answer_keys_server_side_rpcs.sql, live as remote 20261018095931) and run
// on a real PostgreSQL (PGlite). It ends in `LIMIT 50` with no ORDER BY, so the 50 candidates are
// whatever the scan meets first — on a heap, the physical row order.
//
// What this file proves:
//   1. SCOPE: both live Stav til questions (Polen, Norge: grade 7, band 1, world_war_2, active, text)
//      are ELIGIBLE for exactly the right pupils — history, grade >= 7 or no grade, World War 2 or no
//      domain filter — and never for English or a lower grade.
//   2. THE PROBLEM: eligible is not the same as reachable. When text rows sit behind 50+ MC rows in
//      physical order (as they do live: positions 326–327 of 492 for grade 7 on 2026-10-18, after the
//      #331 text fix rewrote 254 rows), a new pupil cannot get them until enough MC questions have been
//      served to pull them into the 50-row window. The live position also moves whenever rows are
//      UPDATEd, so it is neither fair nor predictable.
//   3. THE PROPOSAL (NOT shipped — selection is owned by the security track's RPC and needs its own
//      reviewed migration): ordering the same candidates by md5(student_id || question_id) before the
//      LIMIT is deterministic per pupil, independent of physical order, and lets text questions reach
//      the window at a fair rate. Shown here on a COPY of the function text, clearly separated.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6). A fresh PGlite heap is scanned in
// insertion order; production's order is physical too but changes with UPDATEs — which is the point.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION_A = readFileSync(
  join(ROOT, "supabase", "migrations", "20261016160000_answer_keys_server_side_rpcs.sql"), "utf8");

const LIVE_FUNCTION = (() => {
  const m = MIGRATION_A.match(/CREATE FUNCTION public\.get_unserved_questions_for_student\([\s\S]*?\n\$\$;/);
  if (!m) throw new Error("get_unserved_questions_for_student not found in migration A");
  return m[0];
})();

// Must match get-next-question's HISTORY_DOMAINS (subject "historie").
const HISTORY = ["prehistoric_denmark", "vikings", "middle_ages", "reformation_monarchy", "enlightenment",
  "revolutions_democracy", "industrialisation", "world_war_1", "world_war_2", "cold_war", "democracy_power"];

const POLEN = "00000000-0000-4000-8000-00000000b88f";
const NORGE = "00000000-0000-4000-8000-0000000088b6";
const TEXT_IDS = [POLEN, NORGE];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pupil = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SCHEMA = `
  CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, answer_format text NOT NULL,
    answer_type text, metadata jsonb, difficulty_band integer, is_active boolean NOT NULL DEFAULT true,
    target_grade smallint, learning_objective text);
  CREATE TABLE public.question_instances (id serial PRIMARY KEY, student_id uuid NOT NULL, question_id uuid NOT NULL);
`;

const insertMc = (from, count, grade = 7, lo = "vikings") => {
  const rows = [];
  for (let i = from; i < from + count; i++) {
    rows.push(`('${uuid(i)}', '{"question":"MC ${i}","options":["a","b"]}', 'mc', 'short', null, ${1 + (i % 5)}, true, ${grade}, '${lo}')`);
  }
  return `INSERT INTO public.questions VALUES ${rows.join(",")};`;
};
// Shaped like the live rows (b88f169a… / 88b65a03…): grade 7, band 1, world_war_2, short text.
const INSERT_TEXT = `INSERT INTO public.questions VALUES
  ('${POLEN}', '{"question":"Hvilket land blev invaderet af Tyskland den 1. september 1939?"}', 'text', 'short', null, 1, true, 7, 'world_war_2'),
  ('${NORGE}', '{"question":"Hvilket naboland blev besat af Tyskland den 9. april 1940 ligesom Danmark?"}', 'text', 'short', null, 1, true, 7, 'world_war_2');`;

async function db(fnText, ...inserts) {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  await pg.exec(fnText);
  for (const sql of inserts) await pg.exec(sql);
  return pg;
}
const candidates = async (pg, student, grade, domains) => (await pg.query(
  "SELECT id FROM public.get_unserved_questions_for_student($1, $2, $3)", [student, grade, domains])).rows.map((r) => r.id);
const serve = (pg, student, questionId) =>
  pg.query("INSERT INTO public.question_instances (student_id, question_id) VALUES ($1, $2)", [student, questionId]);

// ── 1. Scope ────────────────────────────────────────────────────────────────────────────────────
test("scope: both Stav til questions are eligible for history pupils in grade 7, 8, 9 or with no grade", async () => {
  const pg = await db(LIVE_FUNCTION, insertMc(1, 3), INSERT_TEXT);
  for (const grade of [7, 8, 9, null]) {
    const ids = await candidates(pg, pupil(1), grade, HISTORY);
    for (const t of TEXT_IDS) assert.ok(ids.includes(t), `grade ${grade}: ${t}`);
  }
  // A teacher's WW2-only filter, and "no domain filter at all", both include them.
  for (const domains of [["world_war_2"], null]) {
    const ids = await candidates(pg, pupil(1), 7, domains);
    for (const t of TEXT_IDS) assert.ok(ids.includes(t), JSON.stringify(domains));
  }
});

test("scope: never for English, a lower grade, another history domain, or once served to that pupil", async () => {
  const pg = await db(LIVE_FUNCTION, insertMc(1, 3), INSERT_TEXT);
  const none = async (...args) => {
    const ids = await candidates(pg, ...args);
    for (const t of TEXT_IDS) assert.ok(!ids.includes(t), JSON.stringify(args));
  };
  await none(pupil(1), 7, ["english"]);
  await none(pupil(1), 6, HISTORY);
  await none(pupil(1), 7, ["vikings"]);
  await serve(pg, pupil(1), POLEN);
  await serve(pg, pupil(1), NORGE);
  await none(pupil(1), 7, HISTORY);
  const other = await candidates(pg, pupil(2), 7, HISTORY);
  for (const t of TEXT_IDS) assert.ok(other.includes(t), "another pupil still gets them");
});

// ── 2. The problem: eligible, but not reachable ─────────────────────────────────────────────────
test("PROBLEM: behind 60 MC rows, a new pupil's 50 candidates contain no Stav til question at all", async () => {
  const pg = await db(LIVE_FUNCTION, insertMc(1, 60), INSERT_TEXT);
  const ids = await candidates(pg, pupil(1), 7, HISTORY);
  assert.equal(ids.length, 50);
  for (const t of TEXT_IDS) assert.ok(!ids.includes(t), "sortByWave can only reorder what it is given");
});

test("PROBLEM: the pupil must first be served (position − 50) other questions — here 11 of 60", async () => {
  const pg = await db(LIVE_FUNCTION, insertMc(1, 60), INSERT_TEXT);
  let served = 0;
  for (;;) {
    const ids = await candidates(pg, pupil(1), 7, HISTORY);
    if (ids.some((id) => TEXT_IDS.includes(id))) break;
    await serve(pg, pupil(1), ids[0]);
    served++;
    assert.ok(served <= 60, "terminates");
  }
  assert.equal(served, 11, "position 61 enters a 50-row window after 11 earlier rows are served");
  // Live, grade 7: positions 326–327 of 492 ⇒ roughly 276 questions before Stav til can even be picked.
});

test("PROBLEM: the same rows move when an earlier row is rewritten — physical order is not a rule", async () => {
  const pg = await db(LIVE_FUNCTION, INSERT_TEXT, insertMc(1, 60));
  const before = await candidates(pg, pupil(1), 7, HISTORY);
  assert.ok(TEXT_IDS.every((t) => before.includes(t)), "inserted first: in the window");
  // A bulk text fix (like #331) rewrites the text rows: each UPDATE writes a new row version at the end.
  await pg.exec(`UPDATE public.questions SET content = content || '{"note":"fixed"}' WHERE answer_format = 'text'`);
  const after = await candidates(pg, pupil(1), 7, HISTORY);
  assert.ok(TEXT_IDS.every((t) => !after.includes(t)), "after the rewrite: out of the window, nothing else changed");
});

// ── 3. Proposal (NOT shipped): a per-pupil deterministic order before the LIMIT ──────────────────
const PROPOSED_FUNCTION = LIVE_FUNCTION.replace(
  /\n  LIMIT 50;/,
  "\n  ORDER BY md5(p_student_id::text || q.id::text), q.id\n  LIMIT 50;");

test("proposal is a one-line change to the live body (ORDER BY before the unchanged LIMIT 50)", () => {
  assert.notEqual(PROPOSED_FUNCTION, LIVE_FUNCTION);
  assert.equal(PROPOSED_FUNCTION.replace("\n  ORDER BY md5(p_student_id::text || q.id::text), q.id", ""), LIVE_FUNCTION);
});

test("proposal: deterministic per pupil, independent of physical order, fair to Stav til", async () => {
  const a = await db(PROPOSED_FUNCTION, insertMc(1, 60), INSERT_TEXT);
  const b = await db(PROPOSED_FUNCTION, INSERT_TEXT, insertMc(1, 60));
  let pupilsReaching = 0;
  for (let n = 1; n <= 40; n++) {
    const ia = await candidates(a, pupil(n), 7, HISTORY);
    assert.deepEqual(ia, await candidates(a, pupil(n), 7, HISTORY), "same pupil, same order");
    assert.deepEqual(ia, await candidates(b, pupil(n), 7, HISTORY), "insertion order does not matter");
    if (ia.some((id) => TEXT_IDS.includes(id))) pupilsReaching++;
  }
  // 50 of 62 rows per window: ~97 % of pupils get at least one Stav til question among their first
  // candidates, instead of 0 % with the live physical order above.
  assert.ok(pupilsReaching >= 34, `pupils whose first window holds a Stav til question: ${pupilsReaching}/40`);
});
