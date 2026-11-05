// INTEGRATION proof for L1 K1's delivered version (D-334): the REAL get-next-question handler
// (supabase/functions/get-next-question/index.ts, loaded as in gnq-parity-harness.mjs) with
// K1_SERVED_SNAPSHOT=on, against a REAL database with migration 20261103110000 applied — so the proposal
// gnq sends, the trigger that verifies it, the snapshot gnq serves from and the version _v2 grades are
// exercised together, end to end, with synthetic data only.
//
// HOW
//   * The database is the H5 integration chain (helpers/h5-integration-chain.mjs: production's schema,
//     production's H5 order, D-327, K1) plus D-316 (applied in production 2026-11-02) and
//     get_unserved_questions_for_student taken verbatim from its migration. In CI it is a throwaway
//     database on the unit job's PostgreSQL 17.6 service (LEVEL_ENGINE_PG_URL, LEVEL_ENGINE_PG_REQUIRED=1:
//     the test FAILS there if the server is missing). Without LEVEL_ENGINE_PG_URL (a developer machine)
//     it runs on PGlite, and the one case that needs two sessions (6) is skipped with the reason.
//   * supabase-js is replaced (module hooks, as in gnq-parity-harness.mjs) by a stand-in that turns each
//     call chain gnq makes into ONE SQL statement in its own transaction: the backend client as
//     service_role, the pupil's client as `authenticated` with auth.uid() = the pupil (production's
//     column grants and RLS policies, from prod-base-schema.mjs). A call shape the stand-in does not
//     model throws, so the test fails rather than silently answering.
//   * Answers are graded by the real public.process_question_attempt_v2, as process-event calls it (mode
//     'quiz_v1', no hints).
//
// TEST-ONLY RELAXATION (needed only for the Match par case, 4, and the unsupported-format case, 5)
//   a. questions_answer_format_check is dropped in the throwaway database: production's CHECK predates
//      Match par and Sandt/falsk and admits neither row (Match par's activation migration 20261105141500
//      and Sandt/falsk's 20261105120000 are not applied), so production holds none.
// Match par is servable since F-03 (interaction-kinds.ts, and v1's mapAnswerFormat knows "match"), so
// case 4 runs the unmodified handler under v1 and v2. The round is created as gnq's new-question path
// would create it (key + proposal), because the candidate windows are not part of this database. Case 5
// uses Sandt/falsk, which is still not servable, to show an unsupported delivered format is refused.
//
// CASES (owner's list, Opgave B)
//   1. a new question gets a correct, server-delivered snapshot; the response is built from it and the
//      same answer earns the same reward as with K1 off (which still writes no snapshot);
//   2. an open question fetched again after a content edit keeps its version (with K1 off it shows the edit,
//      as before);
//   3. a reopened repeat gets a NEW snapshot on the new round; round 1's attempt keeps its version;
//   4. Match par: the same key lays out the display, grades the answer and is recorded in history;
//   5. an unsupported format in a delivered version is still refused;
//   6. a concurrent edit never mixes versions A and B (PostgreSQL only: two sessions);
//   7. a round delivered without K1 (version unknown) records NULL, never a guessed fingerprint;
//   8. the pupil's own client can read neither the key nor the snapshot, and no response carries them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PROD_ORDER, uid, baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";
import { extractFunction } from "./helpers/answer-chain-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = join(ROOT, "supabase", "functions", "get-next-question", "index.ts");
const K1 = "20261103110000_l1_k1_attempt_context.sql";
const D327 = "20261103100000_question_attempts_history_no_action.sql";
const D316 = "20261102100000_release_open_rounds_on_inactive_questions.sql";
const RPCS = "20261016160000_answer_keys_server_side_rpcs.sql";

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

// One connection = { q(sql, params) → rows, x(script) for several statements, end() }.
const wrap = (c, end) => ({
  q: async (sql, params) => (await c.query(sql, params)).rows,
  x: async (script) => { await (c.exec ? c.exec(script) : c.query(script)); },
  end,
});
let dbName = null;
let pglite = null;
const opened = [];
async function connect() {
  if (!ON_PG) return wrap(pglite, async () => {});
  const u = new globalThis.URL(PG_URL);
  u.pathname = `/${dbName}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  const conn = wrap(c, () => c.end().catch(() => {}));
  opened.push(conn);
  return conn;
}
async function createDatabase() {
  if (ON_PG) {
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    dbName = `l1_k1_gnq_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
    await admin.end();
  } else {
    pglite = new PGlite();
  }
  const su = await connect();
  for (const sql of baseSql({ realServer: ON_PG })) await su.x(sql);
  await su.x(migrationSql(D316));
  for (const f of [...PROD_ORDER, D327]) await su.x(migrationSql(f));
  await su.x(migrationSql(K1));
  await su.x(extractFunction(RPCS, "get_unserved_questions_for_student"));
  await su.x(`REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;`);
  // Relaxation a (Match par and the unsupported Sandt/falsk case only, see the header).
  await su.x("ALTER TABLE public.questions DROP CONSTRAINT questions_answer_format_check");
  return su;
}
async function teardown() {
  for (const c of opened.splice(0)) await c.end();
  if (pglite) await pglite.close();
  if (ON_PG && dbName) {
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
}

// One statement in its own transaction, as `role` (and, for the pupil, auth.uid() = pupil).
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

// ── supabase-js stand-in: each call chain → one SQL statement ──────────────────────────────────────
const IDENT = /^[a-z_]+$/;
const ident = (s) => { if (!IDENT.test(s)) throw new Error(`stand-in: unexpected identifier ${JSON.stringify(s)}`); return s; };
function parseSelect(s) {
  const embeds = [];
  const rest = String(s).replace(/(\w+)\s*\(([^)]*)\)/g, (_, table, cols) => {
    embeds.push({ table: ident(table), cols: cols.split(",").map((c) => ident(c.trim())).filter(Boolean) });
    return "";
  });
  return { cols: rest.split(",").map((c) => c.trim()).filter(Boolean).map(ident), embeds };
}
const SCALAR_RPC = new Set(["release_open_question_outside", "request_repeat_question_for_student"]);
const SETOF_RPC = new Set(["get_unserved_questions_for_student"]);
const RPC_CAST = { p_student_id: "uuid", p_grade: "smallint", p_domains: "text[]" };
const TABLES = new Set(["profiles", "question_instances"]);

let backendConn = null; // the connection the handler's calls run on
const calls = [];       // every call the handler made: { client, kind, name, sql }
async function backend(client, kind, name, ops) {
  const role = client === "admin" ? "service_role" : "authenticated";
  const pupil = client === "admin" ? null : globalThis.__k1Pupil;
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
      return `(SELECT to_jsonb(e) FROM (SELECT ${e.cols.map((c) => `q.${c}`).join(", ")} FROM public.questions q
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
        const res = globalThis.__k1Backend(client, kind, name, ops);
        return (ok, ko) => Promise.resolve(res).then(ok, ko);
      }
      return (...args) => chain(kind, name, client, [...ops, [String(prop), ...args]]);
    },
  });
}
export function createClient(_url, key) {
  const client = key === "SERVICE" ? "admin" : "user";
  return {
    auth: { getUser: async () => ({ data: { user: { id: globalThis.__k1Pupil } }, error: null }) },
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
globalThis.__k1Backend = backend;
async function loadHandler() {
  globalThis.__gnqHandlers = [];
  await import(pathToFileURL(INDEX).href);
  assert.equal(globalThis.__gnqHandlers.length, 1);
  return globalThis.__gnqHandlers[0];
}
const setEnv = (k, v) => (v === undefined ? ENV.delete(k) : ENV.set(k, v));

// One get-next-question request by `pupil`. k1: K1_SERVED_SNAPSHOT=on; mix: QUESTION_MIX_ENGINE.
async function gnq(handler, pupil, { k1, mix, conn, subject = "historie" } = {}) {
  setEnv("K1_SERVED_SNAPSHOT", k1 ? "on" : undefined);
  setEnv("QUESTION_MIX_ENGINE", mix);
  setEnv("LEVEL_ENGINE", undefined);
  globalThis.__k1Pupil = pupil;
  backendConn = conn ?? mainConn;
  calls.length = 0;
  const logs = [];
  const { log, error } = console;
  console.log = (...a) => logs.push(a.map(String).join(" "));
  console.error = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  try {
    const res = await handler(new Request("http://stub/", {
      method: "POST", headers: { Authorization: "Bearer pupil" },
      body: JSON.stringify({ subject, session_context: { wave_phase: "challenge" } }),
    }));
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text), logs, calls: [...calls] };
  } finally {
    console.log = log;
    console.error = error;
  }
}

// ── Synthetic data ──────────────────────────────────────────────────────────────────────────────────
let mainConn = null;
let su = null;
let seq = 0;
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const mcContent = (question, correct, others) => ({ question, options: [correct, ...others], correct, accepted_answers: [correct],
  review_text: `Forklaring: ${correct}.` });
async function question(objective, content, { format = "mc", grade = 5, metadata = { domain: objective, concepts: ["k1-test"] } } = {}) {
  const id = uid(70000 + ++seq);
  await su.q(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, target_grade, difficulty_band, difficulty_level)
    VALUES ($1, 'mc_single', $2::jsonb, $3::jsonb, 1, true, 'auto', $4, $5, 'short', $6, 1, 1000)`,
  [id, JSON.stringify(content), JSON.stringify(metadata), objective, format, grade]);
  return id;
}
async function pupil(domains, grade = 7) {
  const id = uid(80000 + ++seq);
  await su.q("INSERT INTO auth.users VALUES ($1)", [id]);
  await su.q("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', $2, $3)", [id, grade, domains]);
  await su.q(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
    current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 0, 0, 1, 1, current_date - 1)`, [id]);
  return id;
}
const instance = async (id) => (await su.q(`SELECT id, question_id, answered, repeat_count, correct_answer, served_snapshot,
  served_content_sha256, served_at FROM public.question_instances WHERE id = $1`, [id]))[0];
const progress = async (p) => (await su.q("SELECT xp, coins, correct_answers FROM public.student_progress WHERE student_id = $1", [p]))[0];
const attempts = async (p) => su.q(`SELECT question_instance_id, attempt_no, was_correct, correct_answer_shown, question_content_sha256
  FROM public.question_attempts WHERE student_id = $1 ORDER BY attempt_no`, [p]);
let subNo = 0;
const answer = async (p, qi, a, round) => (await as(mainConn, "service_role", null,
  "SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, NULL, NULL, 'quiz_v1', 0) AS r",
  [p, qi, a, round, uid(90000 + ++subNo)]))[0].r;
const edit = (q, content) => su.q("UPDATE public.questions SET content = $2::jsonb WHERE id = $1", [q, JSON.stringify(content)]);

// The deliverable contract: the snapshot is the question row at delivery plus this instance's key, and its
// fingerprint is sha256 of the stored jsonb text.
async function assertSnapshotOf(qi, q) {
  const [row] = await su.q(`SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1`, [q]);
  const inst = await instance(qi);
  assert.deepEqual(inst.served_snapshot, { ...row, correct_answer: inst.correct_answer });
  const [{ text }] = await su.q("SELECT served_snapshot::text AS text FROM public.question_instances WHERE id = $1", [qi]);
  assert.equal(inst.served_content_sha256, sha256(text));
  assert.ok(inst.served_at);
  return inst;
}

// Nothing a response carries may name the answer, the key or the delivered version.
const FORBIDDEN = /"(correct|correct_answer|accepted_answers|review_text|served_snapshot|served_content_sha256|key)"\s*:/;
function assertPublic(res) {
  assert.equal(res.status, 200, res.text);
  assert.equal(FORBIDDEN.test(res.text), false, `the response carries a key field: ${res.text}`);
}

test("L1 K1 delivered version, end to end through the real get-next-question handler", { timeout: 300000 }, async (t) => {
  t.after(teardown);
  su = await createDatabase();
  mainConn = ON_PG ? await connect() : su;
  const handler = await loadHandler();

  await t.test("1. a new question gets a correct server-delivered snapshot; the same answer earns the same reward as with K1 off", async () => {
    const q = await question("vikings", mcContent("K1-1: Hvem plyndrede Lindisfarne i 793?", "Vikinger", ["Romere", "Normanner", "Kelter"]));
    const on = await pupil(["vikings"]);
    const off = await pupil(["vikings"]);
    const rOn = await gnq(handler, on, { k1: true });
    const rOff = await gnq(handler, off, { k1: false });
    assertPublic(rOn);
    assertPublic(rOff);
    // K1 off: the insert carries no proposal and the row has no delivered version — as before K1.
    const insOff = rOff.calls.find((c) => /^INSERT/.test(c.sql));
    assert.ok(insOff && !/served_snapshot/.test(insOff.sql), "K1 off sends no proposal");
    assert.equal((await instance(rOff.body.question_instance_id)).served_snapshot, null);
    assert.equal(rOff.calls.some((c) => /served_snapshot/.test(c.sql)), false, "K1 off reads no snapshot");
    // K1 on: the proposal is verified and stored as the delivered version; the response is built from it.
    const inst = await assertSnapshotOf(rOn.body.question_instance_id, q);
    assert.equal(inst.served_snapshot.correct_answer, "Vikinger");
    assert.deepEqual(rOn.body.content, { question: inst.served_snapshot.content.question, options: inst.served_snapshot.content.options });
    assert.equal(rOn.body.round_no, 1);
    // Every key-bearing read and the insert ran on the backend client; the pupil's client only read its
    // profile and released.
    for (const c of rOn.calls.filter((x) => x.client === "user")) assert.match(c.sql, /FROM public\.profiles|release_open_question_outside/);
    // The same answer earns exactly the same on both paths.
    const before = [await progress(on), await progress(off)];
    const gOn = await answer(on, rOn.body.question_instance_id, "Vikinger", 1);
    const gOff = await answer(off, rOff.body.question_instance_id, "Vikinger", 1);
    assert.equal(gOn.status, "correct");
    assert.deepEqual({ xp: gOn.xp_awarded, coins: gOn.coins_awarded }, { xp: gOff.xp_awarded, coins: gOff.coins_awarded });
    const after = [await progress(on), await progress(off)];
    assert.deepEqual(after.map((a, i) => a.xp - before[i].xp), [gOn.xp_awarded, gOn.xp_awarded]);
    assert.deepEqual(after.map((a, i) => a.coins - before[i].coins), [gOn.coins_awarded, gOn.coins_awarded]);
    const [aOn] = await attempts(on);
    const [aOff] = await attempts(off);
    assert.equal(aOn.question_content_sha256, inst.served_content_sha256, "the attempt records the delivered version");
    assert.equal(aOff.question_content_sha256, null, "K1 off: version unknown → NULL");
  });

  await t.test("2. an open question fetched again after a content edit keeps its delivered version", async () => {
    const A = mcContent("K1-2: Hvornår blev Danmark kristnet officielt?", "Omkring 965", ["Omkring 1100", "Omkring 800", "Omkring 1300"]);
    const B = mcContent("K1-2: Hvilken konge lod Jellingstenen rejse?", "Harald Blåtand", ["Gorm den Gamle", "Knud den Store", "Svend Tveskæg"]);
    const q = await question("middle_ages", A);
    const p = await pupil(["middle_ages"]);
    const first = await gnq(handler, p, { k1: true });
    assertPublic(first);
    const delivered = await assertSnapshotOf(first.body.question_instance_id, q);
    await edit(q, B);
    const again = await gnq(handler, p, { k1: true });
    assertPublic(again);
    assert.equal(again.body.question_instance_id, first.body.question_instance_id, "the open round is served again");
    assert.deepEqual(again.body.content, first.body.content, "…from its delivered version, not the edit");
    const still = await instance(first.body.question_instance_id);
    assert.equal(still.served_content_sha256, delivered.served_content_sha256);
    assert.deepEqual(still.served_snapshot, delivered.served_snapshot);
    // With K1 off the same reload shows the edit — the behaviour before K1, unchanged.
    const old = await gnq(handler, p, { k1: false });
    assertPublic(old);
    assert.equal(old.body.content.question, B.question);
    // Graded against what was delivered: A's answer is right, B's is not.
    const g = await answer(p, first.body.question_instance_id, "Omkring 965", 1);
    assert.equal(g.status, "correct");
    const [a] = await attempts(p);
    assert.equal(a.question_content_sha256, delivered.served_content_sha256);
    assert.equal(a.correct_answer_shown, "Omkring 965");
  });

  await t.test("3. a reopened repeat gets a new snapshot on the new round; round 1's history is untouched", async () => {
    const A = mcContent("K1-3: Hvornår faldt Berlinmuren?", "1989", ["1961", "1991", "1975"]);
    const B = mcContent("K1-3: Hvilket år blev Berlinmuren bygget?", "1961", ["1989", "1948", "1953"]);
    const q = await question("cold_war", A);
    const p = await pupil(["cold_war"]);
    const first = await gnq(handler, p, { k1: true });
    assertPublic(first);
    const r1 = await assertSnapshotOf(first.body.question_instance_id, q);
    const g1 = await answer(p, first.body.question_instance_id, "1961", 1);
    assert.equal(g1.status, "incorrect");
    const [h1] = await attempts(p);
    await edit(q, B);
    // The scope is exhausted (one question, answered): the repeat path reopens round 2.
    const rep = await gnq(handler, p, { k1: true });
    assertPublic(rep);
    assert.equal(rep.body.is_repeat, true);
    assert.equal(rep.body.question_instance_id, first.body.question_instance_id);
    assert.equal(rep.body.round_no, 2);
    const r2 = await assertSnapshotOf(first.body.question_instance_id, q);
    assert.notEqual(r2.served_content_sha256, r1.served_content_sha256, "the new round has its own version");
    assert.equal(rep.body.content.question, B.question, "the reopened round is served from its new snapshot");
    assert.ok(rep.calls.some((c) => /SELECT t\.served_snapshot/.test(c.sql)), "served from the delivered version");
    // A further edit while round 2 is open: a reload still shows round 2's version.
    await edit(q, mcContent("K1-3: Hvem var DDR's sidste leder?", "Egon Krenz", ["Erich Honecker", "Walter Ulbricht", "Hans Modrow"]));
    const reload = await gnq(handler, p, { k1: true });
    assertPublic(reload);
    assert.equal(reload.body.round_no, 2);
    assert.deepEqual(reload.body.content, rep.body.content);
    assert.equal((await instance(first.body.question_instance_id)).served_content_sha256, r2.served_content_sha256);
    const g2 =await answer(p, first.body.question_instance_id, "1961", 2);
    assert.equal(g2.status, "correct");
    const [h1after, h2] = await attempts(p);
    assert.deepEqual(h1after, h1, "round 1's attempt is not overwritten");
    assert.equal(h1after.question_content_sha256, r1.served_content_sha256);
    assert.equal(h2.attempt_no, 2);
    assert.equal(h2.question_content_sha256, r2.served_content_sha256);
  });

  await t.test("4. Match par: display, grading and history use the same key — the stored round's", async () => {
    const pairs = [{ left: "Danmark", right: "København" }, { left: "Norge", right: "Oslo" }, { left: "Sverige", right: "Stockholm" }];
    // content.correct only satisfies the base schema's content CHECKs; Match par reads the instance key.
    const A = { question: "K1-4: Forbind landet med hovedstaden", pairs, correct: "-" };
    const B = { question: "K1-4: Forbind landet med hovedstaden", correct: "-",
      pairs: [{ left: "Finland", right: "Helsinki" }, { left: "Island", right: "Reykjavík" }, { left: "Estland", right: "Tallinn" }] };
    const q = await question("enlightenment", A, { format: "match" });
    const p = await pupil(["enlightenment"]);
    const KEY = "0:2,1:0,2:1";
    // The round as gnq's new-question path creates it under K1 (normalised key + proposal of the row).
    const [row] = await su.q("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [q]);
    const [{ id: qi }] = await as(mainConn, "service_role", null, `INSERT INTO public.question_instances (student_id, question_id,
      correct_answer, next_review_at, served_snapshot) VALUES ($1, $2, $3, now(), $4::jsonb) RETURNING id`, [p, q, KEY, JSON.stringify(row)]);
    const delivered = await assertSnapshotOf(qi, q);
    await edit(q, B);
    await su.q("UPDATE public.question_instances SET correct_answer = '0:1,1:2,2:0' WHERE id = $1", [qi]);
    // v1 (today's engine, mapAnswerFormat) and v2 (the registry) serve the same open round the same way.
    for (const mix of [undefined, "v2"]) {
      const res = await gnq(handler, p, { k1: true, mix });
      assertPublic(res);
      assert.equal(res.body.question_instance_id, qi, `mix=${mix}`);
      assert.equal(res.body.answer_format, "match", `mix=${mix}`);
      // Layout from the stored round's key: right display position j shows pairs[i].right where key[i] = j.
      assert.deepEqual(res.body.content.match.left, ["Danmark", "Norge", "Sverige"]);
      assert.deepEqual(res.body.content.match.right, ["Oslo", "Stockholm", "København"]);
      assert.equal(res.calls.some((c) => /SELECT t\.correct_answer/.test(c.sql)), false, "K1 on: no separate key read");
    }
    // Graded against the same key: the connections the pupil sees as right are right.
    const g = await answer(p, qi, KEY, 1);
    assert.equal(g.status, "correct");
    const [h] = await attempts(p);
    assert.equal(h.correct_answer_shown, KEY, "history records the same key");
    assert.equal(h.question_content_sha256, delivered.served_content_sha256);
  });

  await t.test("5. an unsupported format in a delivered version is still refused", async () => {
    // Sandt/falsk: built, NOT servable — v1 skips it (mapAnswerFormat null) and v2 too (registry).
    const q = await question("enlightenment", { question: "K1-5: Solen er en stjerne.", correct: "Sandt" },
      { format: "true_false", grade: 9 });
    const p = await pupil(["revolutions_democracy"]);
    const [row] = await su.q("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [q]);
    const [{ id: qi }] = await as(mainConn, "service_role", null, `INSERT INTO public.question_instances (student_id, question_id,
      correct_answer, next_review_at, served_snapshot) VALUES ($1, $2, 'Sandt', now(), $3::jsonb) RETURNING id`, [p, q, JSON.stringify(row)]);
    assert.ok((await instance(qi)).served_snapshot);
    for (const mix of [undefined, "v2"]) {
      const res = await gnq(handler, p, { k1: true, mix });
      assert.ok(res.logs.some((l) => l.includes("Skipping due instance with bad content") && l.includes(qi)), `mix=${mix}: refused`);
      assert.notEqual(res.body.question_instance_id, qi);
      assert.equal(FORBIDDEN.test(res.text), false);
    }
  });

  await t.test("6. a concurrent edit never mixes versions A and B", { skip: ON_PG ? false : "needs two sessions: PostgreSQL only (CI)" }, async () => {
    const A = mcContent("K1-6: Hvem skrev Om samfundspagten?", "Rousseau", ["Voltaire", "Locke", "Montesquieu"]);
    const B = mcContent("K1-6: Hvem skrev Leviathan?", "Hobbes", ["Locke", "Rousseau", "Hume"]);
    const q = await question("revolutions_democracy", A, { grade: 3 });
    const p = await pupil(["revolutions_democracy"]);
    const editor = await connect();
    const gnqConn = await connect();
    await editor.q("BEGIN");
    await editor.q("UPDATE public.questions SET content = $2::jsonb WHERE id = $1", [q, JSON.stringify(B)]);
    // gnq reads A (the edit is not committed), proposes A, and the insert waits for the editor's row lock.
    const pending = gnq(handler, p, { k1: true, conn: gnqConn });
    for (let i = 0; ; i++) {
      const [{ n }] = await su.q(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock'`);
      if (n >= 1) break;
      if (i > 400) assert.fail("the delivery never waited for the edit");
      await new Promise((r) => setTimeout(r, 25));
    }
    await editor.q("COMMIT");
    const res = await pending;
    // The proposal (A) no longer matches the row (B): the insert is refused (40001), nothing is written,
    // and no response shows A while the database holds B.
    assert.ok(res.logs.some((l) => l.includes("INSTANCE INSERT FAILED") && l.includes("40001")), res.logs.join("\n"));
    assert.equal(res.body.step, "no_questions");
    assert.deepEqual(await su.q("SELECT id FROM public.question_instances WHERE student_id = $1", [p]), []);
    // The next request delivers B, consistently: response, snapshot and grading.
    const next = await gnq(handler, p, { k1: true });
    assertPublic(next);
    assert.equal(next.body.content.question, B.question);
    const inst = await assertSnapshotOf(next.body.question_instance_id, q);
    assert.equal(inst.served_snapshot.content.question, B.question);
    assert.equal(inst.correct_answer, "Hobbes");
    assert.equal((await answer(p, next.body.question_instance_id, "Hobbes", 1)).status, "correct");
  });

  await t.test("7. a round delivered without K1 (version unknown) records NULL, never a guessed fingerprint", async () => {
    const q = await question("world_war_2", mcContent("K1-7: Hvornår blev Danmark besat?", "9. april 1940", ["4. maj 1945", "1. september 1939", "29. august 1943"]));
    const p = await pupil(["world_war_2"]);
    const old = await gnq(handler, p, { k1: false });
    assertPublic(old);
    assert.equal((await instance(old.body.question_instance_id)).served_snapshot, null);
    // Switching K1 on later serves the open round from the question row, as before; still no version.
    const later = await gnq(handler, p, { k1: true });
    assertPublic(later);
    assert.equal(later.body.question_instance_id, old.body.question_instance_id);
    assert.equal(later.body.content.question, "K1-7: Hvornår blev Danmark besat?");
    const inst = await instance(old.body.question_instance_id);
    assert.equal(inst.served_snapshot, null);
    assert.equal(inst.served_content_sha256, null);
    assert.equal((await answer(p, old.body.question_instance_id, "9. april 1940", 1)).status, "correct");
    const [a] = await attempts(p);
    assert.equal(a.question_content_sha256, null);
    void q;
  });

  await t.test("8. the pupil's own client can read neither the key nor the delivered version", async () => {
    const q = await question("english", mcContent("K1-8: What is the past tense of 'go'?", "went", ["goed", "gone", "going"]));
    const p = await pupil(["english"]);
    const res = await gnq(handler, p, { k1: true, subject: "engelsk" });
    assertPublic(res);
    await assertSnapshotOf(res.body.question_instance_id, q);
    for (const col of ["served_snapshot", "served_content_sha256", "correct_answer", "*"]) {
      await assert.rejects(as(mainConn, "authenticated", p, `SELECT ${col} FROM public.question_instances WHERE id = $1`,
        [res.body.question_instance_id]), (e) => e.code === "42501", `pupil SELECT ${col}`);
    }
    // What the pupil may read of its own round carries neither.
    const own = await as(mainConn, "authenticated", p, "SELECT id, answered FROM public.question_instances WHERE id = $1",
      [res.body.question_instance_id]);
    assert.equal(own.length, 1);
    await assert.rejects(as(mainConn, "authenticated", p, "SELECT content FROM public.questions WHERE id = $1", [q])
      .then((rows) => { if (rows.length === 0) throw Object.assign(new Error("hidden"), { code: "RLS" }); }),
    (e) => e.code === "42501" || e.code === "RLS", "the question row (and its key) is not readable by the pupil");
  });
});
