// INTEGRATION proof for D-383's follow-up (#740, migration 20261123100000_course_scope_before_candidate_limit.sql): the
// REAL get-next-question handler (supabase/functions/get-next-question/index.ts, loaded as in
// l1-k1-served-snapshot-gnq-integration.test.mjs) against a REAL database, on every selection route the ordinary quiz
// has, at the boundaries of every candidate limit. Synthetic data only. Nothing here touches production.
//
// THE LIMITS (read from the code, not assumed)
//   classic   get_unserved_questions_for_student         LIMIT 50, no ORDER BY            (20261016160000 / 20261123100000)
//   v2        get_question_candidates_for_student        p_per_group = CANDIDATES_PER_GROUP = 20 per group (cap 50)
//   level     get_level_questions_for_student            p_limit = LEVEL_CANDIDATE_LIMIT = 50 (cap 100); fast path
//                                                        v_window = 300 rows per side, then the FALLBACK full search
//
// THREE DATABASES (each built from the migration files, unmodified)
//   PROD   production today: the answer chain, D-280, D-316 and get_unserved from 20261016160000 — no D-383.
//   D383   PROD + 20261120150000 (#739, merged, NOT applied): course items out of the level candidates and repeats;
//          the two SHARED candidate functions still apply their limit before get-next-question sees the tag.
//   NEW    D383 + 20261123100000 (#740): p_course_scope filters before the limit.
// On PROD and D383 the handler's scoped call gets PGRST202 (no function takes p_course_scope) and falls back once to
// today's arguments (COURSE_SCOPE_FALLBACK) — exactly what the deployed candidate would do on such a database.
//
// NEGATIVE CONTROLS — honest about what they prove
//   The controls run the UNCHANGED earlier function bodies (taken verbatim from their migration files) with the CURRENT
//   handler, and show the defect #740 fixes: enough course items ahead of the ordinary ones, and the ordinary quiz gets
//   nothing although ordinary questions exist. No function body is altered for a control.
//   * classic: the old body has LIMIT 50 WITHOUT ORDER BY, so which 50 rows it returns is the plan's business. The data
//     makes every plausible plan agree: the course items are inserted first (sequential and bitmap scans return heap
//     order) AND have the lower difficulty_level (idx_questions_objective_level returns level order, then heap order).
//     The test asserts the outcome on the run itself, so a plan that disagreed would fail loudly, never pass silently.
//   * v2: the old body orders by md5(student_id || question_id); the ids are CHOSEN so that every course item ranks
//     before every ordinary one for this pupil — fully deterministic.
//   * level: production's 20261029120000 body orders by distance to the pupil's level; the course items are nearer.
//
// WHICH DATABASE ENGINE
//   CI: a throwaway database per variant on the unit job's PostgreSQL 17.6 service (LEVEL_ENGINE_PG_URL,
//   LEVEL_ENGINE_PG_REQUIRED=1: the test FAILS there if the server is missing). A developer machine without
//   LEVEL_ENGINE_PG_URL runs the same cases on PGlite. PostgREST itself is not in this test: supabase-js is replaced by
//   the same stand-in as the K1 integration test (each call chain → one SQL statement as service_role / authenticated,
//   42883 on an rpc → PGRST202). PostgREST's own resolution of the named argument is proven by the isolated stack's
//   introduction lane, which replays D-383 and 20261123100000.
//
// CI WEIGHT: the file name ends in -pg.test.mjs (a heavy file: it builds three databases). PR #741's test requires a
// measured weight in tests/unit-ci-weights.json for every heavy file; whichever of the two PRs merges second adds it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { answerChainSql, extractFunction, readMigration } from "./helpers/answer-chain-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = join(ROOT, "supabase", "functions", "get-next-question", "index.ts");
const D383 = "20261120150000_course_items_out_of_ordinary_quiz.sql";
const SCOPE = "20261123100000_course_scope_before_candidate_limit.sql";

// The limits, read from the code this test exercises (a change there must be reflected here).
const { LEVEL_CANDIDATE_LIMIT } = await import(pathToFileURL(join(ROOT, "supabase/functions/get-next-question/level-flow.ts")).href);
const { CANDIDATES_PER_GROUP } = await import(pathToFileURL(join(ROOT, "supabase/functions/get-next-question/mix-flow.ts")).href);
const CLASSIC_LIMIT = 50;
const LEVEL_WINDOW = 300;
test("the limits this file is built around are the code's", () => {
  assert.equal(LEVEL_CANDIDATE_LIMIT, 50);
  assert.equal(CANDIDATES_PER_GROUP, 20);
  const scope = readMigration(SCOPE);
  assert.match(scope, /\n  LIMIT 50;\n\$\$;/, "classic: LIMIT 50");
  assert.match(scope, /least\(greatest\(coalesce\(p_per_group, 20\), 1\), 50\)/, "v2: per group, capped at 50");
  assert.match(readMigration(D383), /v_window    CONSTANT integer := 300;/, "level: the fast path's window");
});

// ── Which database ──────────────────────────────────────────────────────────────────────────────────
const PG_URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
const REQUIRED = process.env.LEVEL_ENGINE_PG_REQUIRED === "1";
function loadPg() {
  for (const base of [process.env.LEVEL_ENGINE_PG_MODULE_DIR, ROOT].filter(Boolean)) {
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* next */ }
  }
  return null;
}
const pg = PG_URL ? loadPg() : null;
const ON_PG = Boolean(PG_URL && pg);

test("a real PostgreSQL server is present where it is required (CI)", { skip: !REQUIRED }, () => {
  assert.ok(ON_PG, `LEVEL_ENGINE_PG_REQUIRED=1, but ${PG_URL ? "the pg client cannot be resolved" : "LEVEL_ENGINE_PG_URL is not set"}`);
});

const wrap = (c, end) => ({
  q: async (sql, params) => (await c.query(sql, params)).rows,
  x: async (script) => { await (c.exec ? c.exec(script) : c.query(script)); },
  end,
});
const cleanups = [];
async function createDatabase(variant) {
  let conn;
  if (ON_PG) {
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    const name = `course_scope_gnq_${variant.toLowerCase()}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
    await admin.end();
    const u = new globalThis.URL(PG_URL);
    u.pathname = `/${name}`;
    const c = new pg.Client({ connectionString: u.toString() });
    await c.connect();
    conn = wrap(c, () => c.end().catch(() => {}));
    cleanups.push(async () => {
      await conn.end();
      const a = new pg.Client({ connectionString: PG_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    });
  } else {
    const db = new PGlite();
    conn = wrap(db, async () => {});
    cleanups.push(() => db.close());
  }
  // PROD: production's chain, as course-scope-candidate-limit-migration-run.test.mjs builds it.
  for (const s of answerChainSql({ realServer: ON_PG })) await conn.x(s);
  await conn.x(extractFunction("20261016160000_answer_keys_server_side_rpcs.sql", "get_unserved_questions_for_student"));
  await conn.x(`REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  for (const f of ["20261031194600_mc_length_cue_answer_paths.sql", "20261102100000_release_open_rounds_on_inactive_questions.sql"]) {
    await conn.x(readMigration(f));
  }
  if (variant === "D383" || variant === "NEW") await conn.x(readMigration(D383));
  if (variant === "NEW") await conn.x(readMigration(SCOPE));
  return conn;
}

async function as(conn, role, pupil, sql, params = []) {
  await conn.q("BEGIN");
  try {
    await conn.q(`SET LOCAL ROLE ${role}`);
    if (pupil) await conn.q("SELECT set_config('test.uid', $1, true)", [pupil]);
    const rows = await conn.q(sql, params);
    await conn.q("COMMIT");
    return rows;
  } catch (e) {
    await conn.q("ROLLBACK");
    throw e;
  }
}

// ── supabase-js stand-in (as in the K1 integration test; extended with the v2 and level calls) ─────────
const IDENT = /^[a-z_]+$/;
const ident = (s) => { if (!IDENT.test(s)) throw new Error(`stand-in: unexpected identifier ${JSON.stringify(s)}`); return s; };
// One embedded column: `col`, or PostgREST's `alias:col->key` (mix-flow.ts HISTORY_SELECT's force_text).
function embedColumn(c) {
  const m = /^([a-z_]+):([a-z_]+)->([a-z_]+)$/.exec(c);
  if (m) return `q.${ident(m[2])} -> '${ident(m[3])}' AS ${ident(m[1])}`;
  return `q.${ident(c)}`;
}
function parseSelect(s) {
  const embeds = [];
  const rest = String(s).replace(/(\w+)\s*\(([^)]*)\)/g, (_, table, cols) => {
    embeds.push({ table: ident(table), cols: cols.split(",").map((c) => c.trim()).filter(Boolean) });
    return "";
  });
  return { cols: rest.split(",").map((c) => c.trim()).filter(Boolean).map(ident), embeds };
}
const SCALAR_RPC = new Set(["release_open_question_outside", "request_repeat_question_for_student",
  "request_repeat_question_servable_for_student", "request_repeat_level_question_for_student"]);
const SETOF_RPC = new Set(["get_unserved_questions_for_student", "get_question_candidates_for_student",
  "get_level_questions_for_student", "advance_student_level", "advance_student_band"]);
const RPC_CAST = { p_student_id: "uuid", p_grade: "smallint", p_domains: "text[]", p_course_scope: "text",
  p_per_group: "integer", p_subject: "text", p_level: "integer", p_limit: "integer" };
const TABLES = new Set(["profiles", "question_instances"]);

let backendConn = null;
let currentPupil = null;
const calls = [];
// The format mix and the level engine issue two calls at once (Promise.all); the real PostgREST serves each on its own
// connection. Here they share one, so they are SERIALISED — each still runs as one statement in its own transaction.
let queue = Promise.resolve();
function backend(client, kind, name, ops) {
  const run = queue.then(() => backendOnce(client, kind, name, ops));
  queue = run.catch(() => {});
  return run;
}
async function backendOnce(client, kind, name, ops) {
  const role = client === "admin" ? "service_role" : "authenticated";
  const pupil = client === "admin" ? null : currentPupil;
  let sql;
  const params = [];
  const p = (v) => { params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v); return `$${params.length}`; };
  let single = false;
  let scalar = false;
  if (kind === "rpc") {
    const args = ops[0]?.[1] ?? {};
    const named = Object.entries(args).map(([k, v]) => `${ident(k)} => ${p(v)}::${RPC_CAST[k] ?? (() => { throw new Error(`stand-in: rpc arg ${k}`); })()}`);
    if (SCALAR_RPC.has(name)) { sql = `SELECT public.${ident(name)}(${named.join(", ")}) AS v`; scalar = true; }
    else if (SETOF_RPC.has(name)) sql = `SELECT * FROM public.${ident(name)}(${named.join(", ")})`;
    else throw new Error(`stand-in: rpc ${name} is not modelled`);
    if (ops.length !== 1) throw new Error(`stand-in: rpc ${name} with chained ops`);
  } else if (kind === "from") {
    if (!TABLES.has(name)) throw new Error(`stand-in: table ${name} is not modelled`);
    let select = null, row = null, order = null, limit = null;
    const where = [];
    for (const [op, ...a] of ops) {
      if (op === "select") select = parseSelect(a[0]);
      else if (op === "insert") row = a[0];
      else if (op === "eq") where.push(`t.${ident(a[0])} = ${p(a[1])}`);
      else if (op === "lte") where.push(`t.${ident(a[0])} <= ${p(a[1])}`);
      else if (op === "order") order = `t.${ident(a[0])} ${a[1]?.ascending === false ? "DESC" : "ASC"}`;
      else if (op === "limit") limit = Number(a[0]);
      else if (op === "maybeSingle") single = true;
      else throw new Error(`stand-in: .${op}() is not modelled`);
    }
    if (!select) throw new Error("stand-in: a chain without select()");
    const embedSql = select.embeds.map((e) => {
      if (name !== "question_instances" || e.table !== "questions") throw new Error(`stand-in: embed ${e.table}`);
      return `(SELECT to_jsonb(e) FROM (SELECT ${e.cols.map(embedColumn).join(", ")} FROM public.questions q
        WHERE q.id = t.question_id) e) AS questions`;
    });
    if (row) {
      if (where.length || order || select.embeds.length) throw new Error("stand-in: insert with filters");
      const cols = Object.keys(row).map(ident);
      const vals = cols.map((c) => p(row[c]));
      sql = `INSERT INTO public.${name} AS t (${cols.join(", ")}) VALUES (${vals.join(", ")}) RETURNING ${select.cols.map((c) => `t.${c}`).join(", ")}`;
    } else {
      sql = `SELECT ${[...select.cols.map((c) => `t.${c}`), ...embedSql].join(", ")} FROM public.${name} t`
        + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + (order ? ` ORDER BY ${order}` : "")
        + (limit !== null ? ` LIMIT ${limit}` : "");
    }
  } else {
    throw new Error(`stand-in: ${kind} is not modelled`);
  }
  calls.push({ client, kind, name, sql });
  try {
    const rows = await as(backendConn, role, pupil, sql, params);
    if (scalar) return { data: rows.length ? rows[0].v : null, error: null };
    return { data: single ? rows[0] ?? null : rows, error: null };
  } catch (e) {
    if (kind === "rpc" && e.code === "42883") return { data: null, error: { message: e.message, code: "PGRST202" } };
    return { data: null, error: { message: e.message, code: e.code ?? null } };
  }
}

const SERVE_URL = "https://deno.land/std@0.168.0/http/server.ts";
const SUPABASE_PREFIX = "https://esm.sh/@supabase/supabase-js@";
const STUB_SERVE = `export function serve(h) { globalThis.__gnqHandlers.push(h); }`;
const STUB_SUPABASE = `
function chain(kind, name, client, ops) {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        const res = globalThis.__csBackend(client, kind, name, ops);
        return (ok, ko) => Promise.resolve(res).then(ok, ko);
      }
      return (...args) => chain(kind, name, client, [...ops, [String(prop), ...args]]);
    },
  });
}
export function createClient(_url, key) {
  const client = key === "SERVICE" ? "admin" : "user";
  return {
    auth: { getUser: async () => ({ data: { user: { id: globalThis.__csPupil() } }, error: null }) },
    from: (table) => chain("from", table, client, []),
    rpc: (fn, args) => chain("rpc", fn, client, [["args", args]]),
  };
}`;
const dataUrl = (src) => "data:text/javascript," + encodeURIComponent(src);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === SERVE_URL) return { url: dataUrl(STUB_SERVE), shortCircuit: true };
    if (specifier.startsWith(SUPABASE_PREFIX)) return { url: dataUrl(STUB_SUPABASE), shortCircuit: true };
    return next(specifier, context);
  },
});

const ENV = new Map([["SUPABASE_URL", "http://stub"], ["SUPABASE_SERVICE_ROLE_KEY", "SERVICE"], ["SUPABASE_ANON_KEY", "ANON"]]);
globalThis.Deno = { env: { get: (k) => ENV.get(k), set: (k, v) => ENV.set(k, v), delete: (k) => ENV.delete(k) } };
globalThis.__csBackend = backend;
globalThis.__csPupil = () => currentPupil;
async function loadHandler() {
  globalThis.__gnqHandlers = [];
  await import(pathToFileURL(INDEX).href);
  assert.equal(globalThis.__gnqHandlers.length, 1);
  return globalThis.__gnqHandlers[0];
}
const setEnv = (k, v) => (v === undefined ? ENV.delete(k) : ENV.set(k, v));

// The ordinary quiz's request (no targeting, no sequence) on `route`.
const ROUTES = Object.freeze({
  classic: { mix: undefined, level: undefined },
  v2: { mix: "v2", level: undefined },
  level: { mix: undefined, level: "v1" },
  "level+mix": { mix: "v2", level: "v1" },
});
async function gnq(handler, conn, pupilId, route) {
  setEnv("QUESTION_MIX_ENGINE", ROUTES[route].mix);
  setEnv("LEVEL_ENGINE", ROUTES[route].level);
  setEnv("K1_SERVED_SNAPSHOT", undefined);
  currentPupil = pupilId;
  backendConn = conn;
  calls.length = 0;
  const logs = [];
  const { log, error } = console;
  console.log = (...a) => logs.push(a.map(String).join(" "));
  console.error = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  try {
    const res = await handler(new Request("http://stub/", {
      method: "POST", headers: { Authorization: "Bearer pupil" },
      body: JSON.stringify({ subject: "historie", session_context: { wave_phase: "challenge" } }),
    }));
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text), logs, calls: [...calls] };
  } finally {
    console.log = log;
    console.error = error;
  }
}

// ── Synthetic data: every case has its own pupil and its own learning objective ──────────────────────
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let seq = 0;
const COURSE = { learning_step: "guided_practice" };
const content = (n) => ({ question: `Kandidatgrænse ${n}?`, options: ["Rigtigt", "Forkert", "Ved ikke"], correct: "Rigtigt",
  accepted_answers: ["Rigtigt"], review_text: "Forklaring." });
/** Inserts rows in ONE statement, in the given order (heap order = insertion order on a fresh table). */
async function insertQuestions(conn, objective, rows) {
  if (rows.length === 0) return;
  const values = [];
  const params = [];
  for (const r of rows) {
    params.push(r.id, JSON.stringify(content(r.id)), JSON.stringify(r.metadata), objective, r.level);
    const b = params.length - 4;
    values.push(`($${b}, 'mc_single', $${b + 1}::jsonb, $${b + 2}::jsonb, 1, true, 'auto', $${b + 3}, 'mc', 'short', 5, 1, $${b + 4}::integer)`);
  }
  await conn.q(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES ${values.join(",\n")}`, params);
}
async function addPupil(conn, objective) {
  const id = uid(500000 + ++seq);
  await conn.q("INSERT INTO auth.users VALUES ($1)", [id]);
  await conn.q("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', 6, $2)", [id, [objective]]);
  await conn.q(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
    current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 0, 0, 1, 1, current_date - 1)`, [id]);
  return id;
}
const newIds = (n) => Array.from({ length: n }, () => uid(600000 + ++seq));
const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

/**
 * One scenario: `courseCount` course items AHEAD of `ordinaryCount` ordinary ones for this route's ordering, then one
 * ordinary-quiz request. Returns the response and the two id lists.
 *   classic: course items first in heap order AND lower difficulty_level (see the header);
 *   v2:      ids chosen so md5(pupil||id) ranks every course item first;
 *   level:   course items nearest the pupil's level (alternating above/below, distance 0, 1, 1, 2, 2 …, all within the
 *            fast path's window when courseCount ≤ 300 per side), the ordinary ones 3000 levels away — so with ≥ 300
 *            course items on a side the window is truncated and full of them, and only the FALLBACK finds the ordinary.
 */
async function scenario(handler, conn, route, courseCount, { ordinaryCount = 10, oneSide = false } = {}) {
  const objective = `cs_${route.replace("+", "_")}_${courseCount}_${++seq}`;
  const pupilId = await addPupil(conn, objective);
  let course, ordinary, rows;
  if (route === "classic") {
    course = newIds(courseCount);
    ordinary = newIds(ordinaryCount);
    rows = [...course.map((id) => ({ id, metadata: COURSE, level: 1000 })), ...ordinary.map((id) => ({ id, metadata: {}, level: 2000 }))];
  } else if (route === "v2") {
    const pool = newIds(courseCount + ordinaryCount).sort((a, b) => (md5(pupilId + a) < md5(pupilId + b) ? -1 : 1));
    course = pool.slice(0, courseCount);
    ordinary = pool.slice(courseCount);
    rows = [...ordinary.map((id) => ({ id, metadata: {}, level: 1000 })), ...course.map((id) => ({ id, metadata: COURSE, level: 1000 }))];
  } else {
    // The level the handler will use: the pupil's seeded level (advance_student_level is idempotent without answers).
    const [{ level }] = await as(conn, "service_role", null, "SELECT level FROM public.advance_student_level($1, 'historie', 6::smallint)", [pupilId]);
    course = newIds(courseCount);
    ordinary = newIds(ordinaryCount);
    const far = level > 5000 ? level - 3000 : level + 3000;
    const near = (i) => {
      if (oneSide) return level + i;                                   // all on one side: that branch's window
      const d = Math.ceil(i / 2);
      return i % 2 === 0 ? level + d : Math.max(1, level - d);
    };
    rows = [...course.map((id, i) => ({ id, metadata: COURSE, level: near(i) })), ...ordinary.map((id) => ({ id, metadata: {}, level: far }))];
  }
  await insertQuestions(conn, objective, rows);
  const res = await gnq(handler, conn, pupilId, route);
  const served = await conn.q("SELECT question_id FROM public.question_instances WHERE student_id = $1", [pupilId]);
  return { res, course, ordinary, pupilId, served: served.map((r) => r.question_id) };
}

function assertServedOrdinary(s, label) {
  assert.equal(s.res.status, 200, `${label}: ${s.res.text}`);
  assert.ok(s.res.body.question_instance_id, `${label}: a question is served, not ${s.res.text}`);
  assert.equal(s.served.length, 1, `${label}: exactly one round created`);
  assert.ok(s.ordinary.includes(s.served[0]), `${label}: the served question is an ordinary one`);
  assert.equal(s.course.includes(s.served[0]), false, `${label}: never a course item`);
}
function assertStarved(s, label) {
  assert.equal(s.res.status, 200, `${label}: ${s.res.text}`);
  assert.equal(s.res.body.step, "no_questions", `${label}: the ordinary quiz is starved (the defect): ${s.res.text}`);
  assert.equal(s.served.length, 0, `${label}: nothing created`);
  assert.ok(s.ordinary.length > 0, `${label}: although ordinary questions exist`);
}
const rpcCalls = (s, name) => s.res.calls.filter((c) => c.kind === "rpc" && c.name === name).map((c) => c.sql);

test("candidate filtering before the limit — real get-next-question, real database, every route and boundary", { timeout: 900000 }, async (t) => {
  t.after(async () => { for (const c of cleanups.splice(0)) await c(); });
  const handler = await loadHandler();
  const db = { PROD: await createDatabase("PROD"), D383: await createDatabase("D383"), NEW: await createDatabase("NEW") };

  // ── #740 (NEW): the ordinary quiz always gets an ordinary question, on every route, at every boundary ──
  for (const n of [0, CLASSIC_LIMIT - 1, CLASSIC_LIMIT, CLASSIC_LIMIT + 1, 100]) {
    await t.test(`NEW classic: ${n} course items ahead of the LIMIT ${CLASSIC_LIMIT} → an ordinary question; no fallback`, async () => {
      const s = await scenario(handler, db.NEW, "classic", n);
      assertServedOrdinary(s, `classic ${n}`);
      const u = rpcCalls(s, "get_unserved_questions_for_student");
      assert.equal(u.length, 1, "one scoped call, no fallback");
      assert.match(u[0], /p_course_scope/);
      assert.equal(s.res.logs.some((l) => l.includes("COURSE_SCOPE_FALLBACK")), false);
    });
  }
  for (const n of [CANDIDATES_PER_GROUP - 1, CANDIDATES_PER_GROUP, CANDIDATES_PER_GROUP + 1, CLASSIC_LIMIT, 100]) {
    await t.test(`NEW v2: ${n} course items ranked ahead in the group window of ${CANDIDATES_PER_GROUP} → an ordinary question`, async () => {
      const s = await scenario(handler, db.NEW, "v2", n);
      assertServedOrdinary(s, `v2 ${n}`);
      const c = rpcCalls(s, "get_question_candidates_for_student");
      assert.equal(c.length, 1, "one scoped call, no fallback");
      assert.match(c[0], /p_course_scope/);
    });
  }
  for (const n of [LEVEL_CANDIDATE_LIMIT - 1, LEVEL_CANDIDATE_LIMIT, LEVEL_CANDIDATE_LIMIT + 1, 100, 2 * LEVEL_WINDOW + 1]) {
    await t.test(`NEW level (LEVEL_ENGINE=v1): ${n} course items nearest the level → an ordinary question (fast path or fallback)`, async () => {
      const s = await scenario(handler, db.NEW, "level", n);
      assertServedOrdinary(s, `level ${n}`);
      assert.equal(rpcCalls(s, "get_level_questions_for_student").length, 1);
      assert.ok(s.res.logs.some((l) => l.startsWith("LEVEL_ENGINE:")), "the level route ran");
    });
  }
  for (const n of [LEVEL_WINDOW - 1, LEVEL_WINDOW, LEVEL_WINDOW + 1]) {
    await t.test(`NEW level: ${n} course items on ONE side (window ${LEVEL_WINDOW}) → the fallback search still finds the ordinary`, async () => {
      const s = await scenario(handler, db.NEW, "level", n, { oneSide: true });
      assertServedOrdinary(s, `level one side ${n}`);
    });
  }
  for (const n of [LEVEL_CANDIDATE_LIMIT + 1, LEVEL_WINDOW + 1]) {
    await t.test(`NEW level+mix (LEVEL_ENGINE=v1, QUESTION_MIX_ENGINE=v2): ${n} course items nearest → an ordinary question`, async () => {
      const s = await scenario(handler, db.NEW, "level+mix", n, { oneSide: n > LEVEL_WINDOW });
      assertServedOrdinary(s, `level+mix ${n}`);
    });
  }
  await t.test("NEW: only course items → no course item is ever served; the ordinary quiz reports no_questions, nothing created", async () => {
    for (const route of Object.keys(ROUTES)) {
      const s = await scenario(handler, db.NEW, route, 60, { ordinaryCount: 0 });
      assert.equal(s.res.status, 200, s.res.text);
      assert.equal(s.res.body.step, "no_questions", `${route}: ${s.res.text}`);
      assert.equal(s.served.length, 0, `${route}: nothing created`);
    }
  });

  // ── The fallback (database without 20261123100000): one scoped call, PGRST202, one call as before ──
  await t.test("D383 (no p_course_scope): exactly one COURSE_SCOPE_FALLBACK per candidate call; course items still withheld", async () => {
    for (const route of ["classic", "v2"]) {
      const s = await scenario(handler, db.D383, route, 5);
      assertServedOrdinary(s, `fallback ${route}`);
      const name = route === "classic" ? "get_unserved_questions_for_student" : "get_question_candidates_for_student";
      const c = rpcCalls(s, name);
      assert.equal(c.length, 2, `${route}: the scoped call and one fallback`);
      assert.match(c[0], /p_course_scope/);
      assert.doesNotMatch(c[1], /p_course_scope/);
      assert.equal(s.res.logs.filter((l) => l.includes("COURSE_SCOPE_FALLBACK")).length, 1);
    }
  });

  // ── NEGATIVE CONTROLS: the unchanged earlier bodies starve the ordinary quiz exactly at the limit ──
  await t.test(`CONTROL D383 classic (unchanged 20261016160000 body): ${CLASSIC_LIMIT - 1} course items → served; ${CLASSIC_LIMIT}, ${CLASSIC_LIMIT + 1}, 100 → starved`, async () => {
    assertServedOrdinary(await scenario(handler, db.D383, "classic", CLASSIC_LIMIT - 1), "control classic 49");
    for (const n of [CLASSIC_LIMIT, CLASSIC_LIMIT + 1, 100]) assertStarved(await scenario(handler, db.D383, "classic", n), `control classic ${n}`);
  });
  await t.test(`CONTROL D383 v2 (unchanged 20261019150000 body): ${CANDIDATES_PER_GROUP - 1} course items → served; ${CANDIDATES_PER_GROUP}, ${CANDIDATES_PER_GROUP + 1} → starved`, async () => {
    assertServedOrdinary(await scenario(handler, db.D383, "v2", CANDIDATES_PER_GROUP - 1), "control v2 19");
    for (const n of [CANDIDATES_PER_GROUP, CANDIDATES_PER_GROUP + 1]) assertStarved(await scenario(handler, db.D383, "v2", n), `control v2 ${n}`);
  });
  await t.test(`CONTROL PROD level (unchanged 20261029120000 body, before D-383): ${LEVEL_CANDIDATE_LIMIT - 1} → served; ${LEVEL_CANDIDATE_LIMIT}, ${LEVEL_CANDIDATE_LIMIT + 1} → starved`, async () => {
    assertServedOrdinary(await scenario(handler, db.PROD, "level", LEVEL_CANDIDATE_LIMIT - 1), "control level 49");
    for (const n of [LEVEL_CANDIDATE_LIMIT, LEVEL_CANDIDATE_LIMIT + 1]) assertStarved(await scenario(handler, db.PROD, "level", n), `control level ${n}`);
  });
  await t.test("CONTROL D383 level: D-383 (#739) already fixed the level route in SQL — 51 course items nearest → served", async () => {
    assertServedOrdinary(await scenario(handler, db.D383, "level", LEVEL_CANDIDATE_LIMIT + 1), "D383 level 51");
  });
});
