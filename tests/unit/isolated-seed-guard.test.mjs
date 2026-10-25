// The synthetic seed may only ever reach the throwaway database this run created. Every refusal case
// below asserts that the seed's write path (`exec`) was NEVER called — not just that an error came
// back. The positive and port-forward cases also run against a real PostgreSQL (PGlite, in-process).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import {
  assertSeedTarget, seedSyntheticQuestions, bootstrapMarkerSql, contentFilterOnSql, contentFilterOffSql, TOKEN_RE,
} from "../isolated/seed/seed-guard.mjs";
import { syntheticQuestionsSql } from "../isolated/seed/synthetic-questions.mjs";

const TOKEN = "a".repeat(32);
const ENV = Object.freeze({
  ISOLATED_E2E: "1",
  ISOLATED_BASE_URL: "http://127.0.0.1:8788",
  ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
  ISOLATED_DB_TOKEN: TOKEN,
});

// A fake database: answers the guard's read-only queries from `state`; records every exec.
function fakeDb(state) {
  const execs = [];
  const query = async (sql) => {
    if (/to_regclass\('isolated_ci\.environment'\)/.test(sql)) return [{ has_marker: state.marker !== undefined }];
    if (/FROM isolated_ci\.environment/.test(sql)) return state.marker === undefined ? [] : state.marker.map((t) => ({ token: t }));
    if (/pg_control_system/.test(sql)) return [{ id: state.sysid }];
    if (/real_questions/.test(sql)) return [{ real_questions: state.realQ ?? 0, questions: state.q ?? 0, real_users: state.realU ?? 0, users: state.u ?? 0 }];
    throw new Error("unexpected query: " + sql.slice(0, 60));
  };
  const exec = async (sql) => { execs.push(sql); };
  return { query, exec, execs };
}
const GOOD = { marker: [TOKEN], sysid: "7700558536814592042" };

async function refused(state, env, pattern) {
  const db = fakeDb(state);
  await assert.rejects(seedSyntheticQuestions({ ...db, env, sql: "INSERT INTO public.questions DEFAULT VALUES;" }), pattern);
  assert.equal(db.execs.length, 0, "no SQL may be executed when the target is refused");
}

test("positive: the right database, fresh and empty → the INSERT-only seed runs once", async () => {
  const db = fakeDb(GOOD);
  await seedSyntheticQuestions({ ...db, env: { ...ENV, ISOLATED_DB_SYSID: GOOD.sysid }, sql: "INSERT 1" });
  assert.deepEqual(db.execs, ["INSERT 1"]);
});

test("refuses an unknown database (no isolated_ci marker)", async () => {
  await refused({ ...GOOD, marker: undefined }, ENV, /no isolated_ci marker/);
});

test("refuses when the environment marker is missing or not exactly \"1\"", async () => {
  const { ISOLATED_E2E, ...noMarker } = ENV;
  await refused(GOOD, noMarker, /not isolated/);
  await refused(GOOD, { ...ENV, ISOLATED_E2E: "true" }, /not isolated/);
});

test("refuses production-like connection details", async () => {
  await refused(GOOD, { ...ENV, ISOLATED_SUPABASE_URL: "https://tjzbehwfagiwpwodsgwg.supabase.co" }, /not isolated/);
  await refused(GOOD, { ...ENV, DATABASE_URL: "postgres://postgres@db.example.supabase.co:5432/postgres" }, /not isolated/);
  await refused(GOOD, { ...ENV, SUPABASE_DB_PASSWORD: "x" }, /not isolated/);
});

test("refuses a misconfigured environment (token missing, malformed, or cluster id malformed)", async () => {
  const { ISOLATED_DB_TOKEN, ...noToken } = ENV;
  await refused(GOOD, noToken, /ISOLATED_DB_TOKEN/);
  for (const bad of ["short", "Z".repeat(32), "a".repeat(129), "aaaa-".repeat(8)]) await refused(GOOD, { ...ENV, ISOLATED_DB_TOKEN: bad }, /ISOLATED_DB_TOKEN/);
  await refused(GOOD, { ...ENV, ISOLATED_DB_SYSID: "abc" }, /SYSID malformed/);
});

test("refuses unexpected existing content (real questions, real users, or too large)", async () => {
  await refused({ ...GOOD, realQ: 1, q: 1 }, ENV, /non-synthetic question/);
  await refused({ ...GOOD, realU: 3, u: 3 }, ENV, /non-synthetic auth user/);
  await refused({ ...GOOD, q: 6000 }, ENV, /larger than any throwaway/);
});

test("refuses a local port that forwards to another database (token or cluster differ)", async () => {
  await refused({ ...GOOD, marker: ["b".repeat(32)] }, ENV, /run token does not match/);
  await refused({ ...GOOD, marker: [TOKEN, "c".repeat(32)] }, ENV, /run token does not match/);
  await refused({ ...GOOD, sysid: "1111111111111111111" }, { ...ENV, ISOLATED_DB_SYSID: GOOD.sysid }, /cluster identifier differs/);
});

test("refuses when the database cannot be read at all", async () => {
  const exec = async () => { throw new Error("must not be called"); };
  const query = async () => { throw new Error("connection refused"); };
  await assert.rejects(seedSyntheticQuestions({ query, exec, env: ENV, sql: "X" }), /cannot read the database/);
});

test("bootstrap marker only accepts a strong hex token", () => {
  assert.throws(() => bootstrapMarkerSql("abc"));
  assert.throws(() => bootstrapMarkerSql("a".repeat(31)));
  const t = randomBytes(16).toString("hex");
  assert.ok(TOKEN_RE.test(t));
  assert.match(bootstrapMarkerSql(t), new RegExp(`VALUES \\('${t}'\\)`));
});

// ── real PostgreSQL (PGlite) ────────────────────────────────────────────────────────────────
const require = createRequire(new URL("../../package.json", import.meta.url));
const { PGlite } = await import(pathToFileURL(require.resolve("@electric-sql/pglite")).href.replace(/index\.cjs$/, "index.js"));

// Minimal shape the seed writes to (columns the repository's own question inserts use).
const SHAPE = `
  CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, content jsonb, difficulty int,
    is_active boolean, question_type text, learning_objective text, answer_format text, answer_type text, metadata jsonb,
    target_grade smallint, difficulty_band smallint);
  CREATE UNIQUE INDEX unique_question_text ON public.questions ((content ->> 'question'));
`;
async function realDb({ marker }) {
  const db = new PGlite();
  await db.exec(SHAPE);
  const token = randomBytes(16).toString("hex");
  if (marker) await db.exec(bootstrapMarkerSql(token));
  const sysid = (await db.query("SELECT system_identifier::text AS id FROM pg_control_system()")).rows[0].id;
  const execs = [];
  return { db, token, sysid, execs, query: async (s) => (await db.query(s)).rows, exec: async (s) => { execs.push(s); await db.exec(s); } };
}

test("PGlite: the database this run bootstrapped is seeded; a second seed changes nothing", async () => {
  const r = await realDb({ marker: true });
  const env = { ...ENV, ISOLATED_DB_TOKEN: r.token, ISOLATED_DB_SYSID: r.sysid };
  await seedSyntheticQuestions({ query: r.query, exec: r.exec, env, sql: syntheticQuestionsSql() });
  const n1 = (await r.query("SELECT count(*)::int n FROM public.questions"))[0].n;
  await seedSyntheticQuestions({ query: r.query, exec: r.exec, env, sql: syntheticQuestionsSql() });
  const n2 = (await r.query("SELECT count(*)::int n FROM public.questions"))[0].n;
  assert.ok(n1 >= 450);
  assert.equal(n2, n1, "idempotent");
});

test("PGlite: an unmarked database (a forwarded port to someone else's DB) is refused and stays untouched", async () => {
  const r = await realDb({ marker: false });
  await r.db.exec(`INSERT INTO public.questions (content, metadata) VALUES ('{"question":"echte"}', '{}')`);
  await assert.rejects(seedSyntheticQuestions({ query: r.query, exec: r.exec, env: { ...ENV, ISOLATED_DB_TOKEN: r.token }, sql: syntheticQuestionsSql() }), /no isolated_ci marker/);
  assert.equal(r.execs.length, 0);
  assert.equal((await r.query("SELECT count(*)::int n FROM public.questions"))[0].n, 1, "nothing written, nothing removed");
});

test("PGlite: a marked database with real content is refused and stays untouched", async () => {
  const r = await realDb({ marker: true });
  await r.db.exec(`INSERT INTO public.questions (content, metadata) VALUES ('{"question":"echte"}', '{}')`);
  await assert.rejects(seedSyntheticQuestions({ query: r.query, exec: r.exec, env: { ...ENV, ISOLATED_DB_TOKEN: r.token }, sql: syntheticQuestionsSql() }), /non-synthetic question/);
  assert.equal(r.execs.length, 0);
});

test("PGlite: the replay content filter discards question rows, then is removed", async () => {
  const r = await realDb({ marker: true });
  await r.db.exec(contentFilterOnSql());
  await r.db.exec(`INSERT INTO public.questions (content, metadata) VALUES ('{"question":"replayed"}', '{}')`);
  assert.equal((await r.query("SELECT count(*)::int n FROM public.questions"))[0].n, 0, "replayed content never lands");
  await r.db.exec(contentFilterOffSql());
  await r.db.exec(`INSERT INTO public.questions (content, metadata) VALUES ('{"question":"after"}', '{"synthetic":true}')`);
  assert.equal((await r.query("SELECT count(*)::int n FROM public.questions"))[0].n, 1);
});
