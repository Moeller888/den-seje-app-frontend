// RUNTIME proof that get_level_questions_for_student's candidate WINDOW (migration 20261029120000) returns
// exactly what the full search returns — the same ids in the same order — and that the fast path really
// is fast: it reads through idx_questions_objective_level and calls question_is_servable on at most the
// window, never on the whole subject. Executed UNMODIFIED on PGlite in production order
// (production-faithful base → #351 → A → B), like difficulty-scale-b-migration-run.test.mjs.
//
// The reference is the full search written out below (FULL_SEARCH): the function's definition before the
// window existed, and still its fallback. Every assertion compares against it.
//
// Which path ran is read from the database's own counters inside the call's transaction, not from timing:
//   question_is_servable calls (pg_stat_xact_user_functions, track_functions = all) and the scans of
//   idx_questions_objective_level (pg_stat_user_indexes). No fixed time limit — CI machines vary.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PROD_BASE_SQL, LEVEL_ENGINE_MIGRATIONS } from "./helpers/prod-base-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mig = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
const [MIX, A, B] = LEVEL_ENGINE_MIGRATIONS.map(mig);
const LIVE_RPCS = mig("20261016160000_answer_keys_server_side_rpcs.sql");
const liveFunction = (name) => {
  const m = LIVE_RPCS.match(new RegExp(String.raw`CREATE FUNCTION public\.${name}\([\s\S]*?\n\$\$;\n\nREVOKE[^\n]*\nGRANT[^\n]*`));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
};

const WINDOW = 300; // v_window in the function
const uuid = (p, n) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PUPILS = Array.from({ length: 12 }, (_, i) => uuid("11111111", i));

// Deterministic pseudo-random numbers (no Math.random: a failure must be reproducible).
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// The full search: the definition the window must reproduce.
const FULL_SEARCH = `SELECT q.id FROM public.questions q
  WHERE q.is_active = true AND q.difficulty_level IS NOT NULL AND q.learning_objective = ANY ($3::text[])
    AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
    AND NOT EXISTS (SELECT 1 FROM public.question_instances qi WHERE qi.student_id = $1::uuid AND qi.question_id = q.id)
  ORDER BY abs(q.difficulty_level - $2::integer), md5($1::text || q.id::text), q.id
  LIMIT least(greatest(coalesce($4::integer, 50), 1), 100)`;

let db;
let nextId = 0;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

// Bulk insert: [{ lo, level, active = true, servable = true }].
async function addQuestions(rows) {
  const ids = [];
  for (let i = 0; i < rows.length; i += 500) {
    const values = rows.slice(i, i + 500).map((r) => {
      const id = uuid("44444444", nextId++);
      ids.push(id);
      const c = { question: `W${id}?`, options: ["a", "b"], correct: "a" };
      // Unservable but allowed by the live constraints: a non-canonical answer_type (as in the run test).
      return `('${id}', 'mc_single', ${sqlStr(JSON.stringify(c))}, 1, ${r.active ?? true}, 'auto', '${r.lo}', 'mc',
        '${r.servable === false ? "SHORT" : "short"}', '{}', 5, 1, ${r.level})`;
    });
    await db.exec(`INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
        answer_format, answer_type, metadata, target_grade, difficulty_band, difficulty_level) VALUES ${values.join(",")};`);
  }
  return ids;
}
// Served = answered instances (several may exist; only one OPEN instance is allowed per pupil).
async function serveAll(student, ids) {
  for (let i = 0; i < ids.length; i += 500) {
    await db.exec(`INSERT INTO public.question_instances (student_id, question_id, answered, was_correct, answered_at)
      VALUES ${ids.slice(i, i + 500).map((id) => `('${student}', '${id}', true, true, now())`).join(",")};`);
  }
}

// One call of the function plus the counters that say which path ran.
async function call(student, level, domains, limit) {
  const before = await indexScans();
  await db.exec("BEGIN");
  let rows;
  let servableCalls;
  try {
    rows = (await db.query(
      `SELECT * FROM public.get_level_questions_for_student($1::uuid, $2::integer, $3::text[]${limit === undefined ? "" : ", $4::integer"})`,
      limit === undefined ? [student, level, domains] : [student, level, domains, limit])).rows;
    const s = (await db.query("SELECT calls FROM pg_stat_xact_user_functions WHERE funcname = 'question_is_servable'")).rows;
    servableCalls = s.length === 0 ? 0 : Number(s[0].calls);
  } finally {
    await db.exec("COMMIT");
  }
  const after = await indexScans();
  return { rows, ids: rows.map((r) => r.id), servableCalls, levelIndexScans: after.scans - before.scans,
    levelIndexRowsRead: after.read - before.read };
}
async function indexScans() {
  await db.query("SELECT pg_stat_force_next_flush()");
  const [r] = await q(`SELECT idx_scan, idx_tup_read FROM pg_stat_user_indexes WHERE indexrelname = 'idx_questions_objective_level'`);
  return { scans: Number(r.idx_scan), read: Number(r.idx_tup_read) };
}
const reference = async (student, level, domains, limit) =>
  (await q(FULL_SEARCH, [student, level, domains, limit ?? null])).map((r) => r.id);
const activeCount = async (domains) =>
  Number((await q("SELECT count(*) AS n FROM public.questions WHERE is_active AND learning_objective = ANY ($1::text[])", [domains]))[0].n);

// The function's answer equals the full search, in order — and says which path ran.
async function assertExact(student, level, domains, limit, label) {
  const got = await call(student, level, domains, limit);
  const want = await reference(student, level, domains, limit);
  assert.deepEqual(got.ids, want, `${label}: window result differs from the full search`);
  return got;
}
const isFastPath = (r, domains) => r.servableCalls <= 2 * WINDOW * domains.length;

before(async () => {
  db = new PGlite();
  await db.exec(PROD_BASE_SQL);
  await db.exec(`INSERT INTO auth.users VALUES ${PUPILS.map((p) => `('${p}')`).join(", ")};`);
  await db.exec(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ${PUPILS.map((p) => `('${p}', 'student', 5)`).join(", ")};`);
  await db.exec(liveFunction("get_unserved_questions_for_student"));
  await db.exec(liveFunction("request_repeat_question_for_student"));
  await db.exec(MIX);
  await db.exec(A);
  await db.exec(B);

  // english: 2,400 active questions across the whole scale (every level 1..10000 region, both ends
  // included), a cluster of 120 ties at exactly 5000, and 400 INACTIVE rows packed around 7000.
  const r = rng(20261022);
  const english = [];
  for (let i = 0; i < 2400; i++) english.push({ lo: "english", level: 1 + Math.floor(r() * 10000) });
  for (let i = 0; i < 40; i++) english.push({ lo: "english", level: 1 }, { lo: "english", level: 10000 });
  for (let i = 0; i < 120; i++) english.push({ lo: "english", level: 5000 });
  for (let i = 0; i < 400; i++) english.push({ lo: "english", level: 6900 + Math.floor(r() * 200), active: false });
  await addQuestions(english);

  // cold_war: 1,500 active, but the 900 nearest to 3000 are UNSERVABLE → the window cannot fill.
  const cold = [];
  for (let i = 0; i < 900; i++) cold.push({ lo: "cold_war", level: 2700 + Math.floor(r() * 600), servable: false });
  for (let i = 0; i < 600; i++) cold.push({ lo: "cold_war", level: r() < 0.5 ? 1 + Math.floor(r() * 2500) : 3500 + Math.floor(r() * 6500) });
  await addQuestions(cold);

  // vikings: a small bank — 30 servable + 700 unservable, so fewer than 50 valid exist at all.
  const vik = [];
  for (let i = 0; i < 30; i++) vik.push({ lo: "vikings", level: 1 + Math.floor(r() * 10000) });
  for (let i = 0; i < 700; i++) vik.push({ lo: "vikings", level: 4000 + Math.floor(r() * 2000), servable: false });
  await addQuestions(vik);

  // middle_ages: a bank smaller than one window — nothing is ever truncated.
  const mid = [];
  for (let i = 0; i < 120; i++) mid.push({ lo: "middle_ages", level: 1 + Math.floor(r() * 10000) });
  await addQuestions(mid);

  // democracy_power: 600 ties at exactly 5100 and nothing else — one window holds an arbitrary half of them.
  await addQuestions(Array.from({ length: 600 }, () => ({ lo: "democracy_power", level: 5100 })));

  await db.exec("ANALYZE");
  await db.exec("SET track_functions = 'all'; SET stats_fetch_consistency = 'none'");
});

test("the nearest 50 valid questions are returned, through the level index, with question_is_servable on the window only", async () => {
  const domains = ["english"];
  for (const level of [5000, 2500, 7000, 9100]) {
    const r = await assertExact(PUPILS[0], level, domains, undefined, `english @ ${level}`);
    assert.equal(r.ids.length, 50);
    assert.ok(isFastPath(r, domains), `@${level}: question_is_servable ran ${r.servableCalls}× — more than the window`);
    assert.ok(r.levelIndexScans >= 2, `@${level}: idx_questions_objective_level not used (${r.levelIndexScans} scans)`);
    // The index may be read as an ordered scan (stops after the window) or, on a small table, as a bitmap
    // over one side of the level; either way the costly per-row check stays within the window.
    assert.ok(r.levelIndexRowsRead > 0, `@${level}: idx_questions_objective_level read no rows`);
  }
  // The point of the window: the full subject is far larger than what question_is_servable saw.
  assert.ok(await activeCount(domains) > 4 * 2 * WINDOW);
});

test("inactive questions packed around the level never enter the window, so they need no fallback", async () => {
  const domains = ["english"];
  const r = await assertExact(PUPILS[1], 7000, domains, undefined, "english @ 7000 (400 inactive nearby)");
  assert.equal(r.ids.length, 50);
  assert.ok(isFastPath(r, domains), "inactive rows must not push the call onto the fallback");
  const levels = (await q("SELECT is_active FROM public.questions WHERE id = ANY ($1::uuid[])", [r.ids])).map((x) => x.is_active);
  assert.ok(levels.every(Boolean), "an inactive question was returned");
});

test("a window full of already-served questions triggers the fallback, and the answer is still exact", async () => {
  const domains = ["english"];
  // Serve the pupil the 560 active questions nearest to 5000 — the whole window and more.
  const near = (await q(`SELECT id FROM public.questions WHERE is_active AND learning_objective = 'english'
    ORDER BY abs(difficulty_level - 5000), id LIMIT 560`)).map((x) => x.id);
  await serveAll(PUPILS[2], near);
  const r = await assertExact(PUPILS[2], 5000, domains, undefined, "english @ 5000, window served");
  assert.equal(r.ids.length, 50);
  assert.ok(!isFastPath(r, domains), `expected the fallback, but question_is_servable ran only ${r.servableCalls}×`);
  assert.ok(r.ids.every((id) => !near.includes(id)), "a served question was returned");
  // Another pupil at the same level still takes the fast path — served is per pupil.
  const other = await assertExact(PUPILS[3], 5000, domains, undefined, "english @ 5000, other pupil");
  assert.ok(isFastPath(other, domains));
});

test("a window full of unservable questions triggers the fallback, and the answer is still exact", async () => {
  const domains = ["cold_war"];
  const r = await assertExact(PUPILS[0], 3000, domains, undefined, "cold_war @ 3000");
  assert.equal(r.ids.length, 50);
  assert.ok(!isFastPath(r, domains), `expected the fallback, but question_is_servable ran only ${r.servableCalls}×`);
  const kinds = await q("SELECT answer_type FROM public.questions WHERE id = ANY ($1::uuid[])", [r.ids]);
  assert.ok(kinds.every((k) => k.answer_type === "short"), "an unservable question was returned");
});

test("fewer than 50 valid questions in the whole bank: the fallback returns exactly those", async () => {
  for (const level of [1, 5000, 10000]) {
    const r = await assertExact(PUPILS[0], level, ["vikings"], undefined, `vikings @ ${level}`);
    assert.equal(r.ids.length, 30, "all 30 valid questions, nothing else");
  }
  // And once the pupil has seen all 30, nothing at all (the repeat path takes over, not this function).
  const valid = (await q(`SELECT id FROM public.questions WHERE is_active AND learning_objective = 'vikings'
    AND answer_type = 'short'`)).map((x) => x.id);
  await serveAll(PUPILS[4], valid);
  const none = await assertExact(PUPILS[4], 5000, ["vikings"], undefined, "vikings exhausted");
  assert.deepEqual(none.ids, []);
});

test("both sides of the pupil's level, and the boundaries 1 and 10,000", async () => {
  const domains = ["english"];
  const mid = await assertExact(PUPILS[5], 3000, domains, 100, "english @ 3000, limit 100");
  assert.ok(mid.rows.some((x) => x.difficulty_level > 3000) && mid.rows.some((x) => x.difficulty_level < 3000), "both sides of 3000");
  const ties = await assertExact(PUPILS[5], 5000, domains, 100, "english @ 5000, limit 100");
  assert.ok(ties.rows.every((x) => x.difficulty_level === 5000), "the 120 ties at exactly 5000 come first at 5000");
  for (const level of [1, 2, 9999, 10000]) {
    const r = await assertExact(PUPILS[5], level, domains, undefined, `english @ ${level}`);
    assert.equal(r.ids.length, 50);
    assert.ok(isFastPath(r, domains), `@${level}: one side is empty, the other alone must suffice`);
  }
  // The boundary rows themselves come first at the boundary.
  const top = await call(PUPILS[6], 10000, domains, 40);
  assert.ok(top.rows.every((x) => x.difficulty_level === 10000), "the 40 rows at 10000 come first at 10000");
  const bottom = await call(PUPILS[6], 1, domains, 40);
  assert.ok(bottom.rows.every((x) => x.difficulty_level === 1), "the 40 rows at 1 come first at 1");
});

test("ties at the window's edge are never cut: 120 questions at exactly one level", async () => {
  // At 5000 the 120 ties plus their neighbours straddle the truncation point for several limits.
  for (const limit of [1, 37, 50, 100, 150]) {
    for (const level of [4990, 5000, 5010]) {
      await assertExact(PUPILS[7], level, ["english"], limit, `english @ ${level}, limit ${limit}`);
    }
  }
});

test("a tie group cut in half by the window's edge sends the call to the fallback, never to a partial tie", async () => {
  // At 5000 the up-branch fetches 300 of the 600 rows at 5100 (which 300 is up to the plan). Their
  // distance equals the cut, so none is proven complete: the full search must decide, by md5.
  for (const pupil of [PUPILS[7], PUPILS[8], PUPILS[11]]) {
    for (const limit of [1, 50, 100]) {
      await assertExact(pupil, 5000, ["democracy_power"], limit, `democracy_power @ 5000, limit ${limit}`);
    }
  }
});

test("several domains at once, and a bank smaller than one window", async () => {
  for (const level of [1, 3000, 5000, 8000, 10000]) {
    await assertExact(PUPILS[8], level, ["english", "cold_war"], undefined, `english+cold_war @ ${level}`);
    await assertExact(PUPILS[8], level, ["vikings", "middle_ages"], undefined, `vikings+middle_ages @ ${level}`);
    const small = await assertExact(PUPILS[8], level, ["middle_ages"], undefined, `middle_ages @ ${level}`);
    assert.ok(isFastPath(small, ["middle_ages"]), "a bank that fits the window is answered by the window");
  }
  // Duplicate and unknown domains change nothing.
  await assertExact(PUPILS[8], 4321, ["english", "english", "nope"], undefined, "duplicate + unknown domain");
});

test("randomised: 300 calls over pupils, levels, limits and domain sets all equal the full search", async () => {
  const r = rng(7);
  const sets = [["english"], ["cold_war"], ["vikings"], ["middle_ages"], ["english", "cold_war"], ["english", "vikings", "middle_ages"]];
  // Give a few pupils a scattered history so "served" varies.
  const sample = (await q("SELECT id FROM public.questions WHERE is_active ORDER BY md5(id::text) LIMIT 900")).map((x) => x.id);
  await serveAll(PUPILS[9], sample.slice(0, 300));
  await serveAll(PUPILS[10], sample.slice(300, 900));
  for (let i = 0; i < 300; i++) {
    const pupil = PUPILS[[0, 2, 9, 10, 11][Math.floor(r() * 5)]];
    const level = r() < 0.1 ? [1, 10000][Math.floor(r() * 2)] : 1 + Math.floor(r() * 10000);
    const limit = [undefined, 1, 10, 50, 100, 500][Math.floor(r() * 6)];
    const domains = sets[Math.floor(r() * sets.length)];
    await assertExact(pupil, level, domains, limit, `#${i} ${domains.join("+")} @ ${level} limit ${limit}`);
  }
});

test("the function keeps the full search as its fallback, word for word", () => {
  const body = B.slice(B.indexOf("CREATE FUNCTION public.get_level_questions_for_student"),
    B.indexOf("COMMENT ON FUNCTION public.get_level_questions_for_student"));
  const fallback = body.slice(body.indexOf("-- FALLBACK"));
  for (const part of ["q.is_active = true", "q.difficulty_level IS NOT NULL", "q.learning_objective = ANY (p_domains)",
    "public.question_is_servable(q.answer_format, q.answer_type, q.content)",
    "qi.student_id = p_student_id AND qi.question_id = q.id",
    "ORDER BY abs(q.difficulty_level - p_level), md5(p_student_id::text || q.id::text), q.id"]) {
    assert.ok(fallback.includes(part), `fallback lost: ${part}`);
  }
  assert.match(body, /v_window\s+CONSTANT integer := 300;/, "the window size the tests assume");
});
