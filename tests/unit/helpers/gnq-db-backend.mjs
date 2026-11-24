// Runs REAL get-next-question versions (this tree, or any commit materialised from git with tools/edge/gnq-release.mjs)
// against a REAL database: PGlite on a developer machine, a throwaway database on the unit job's PostgreSQL 17.6 service
// in CI (LEVEL_ENGINE_PG_URL). Built for the rollback matrix (tests/unit/laerligverse-rollback-matrix.test.mjs).
//
// supabase-js is replaced (module hooks) by a stand-in that turns each call chain a handler makes into ONE SQL statement
// in its own transaction: the backend client as service_role, the pupil's client as `authenticated` with auth.uid() = the
// pupil (production's grants and RLS from prod-base-schema.mjs). Generalised from the stand-in in
// l1-k1-served-snapshot-gnq-integration.test.mjs (that file is unchanged): any std http/server.ts and any esm.sh
// supabase-js version are stubbed, so older trees load too; an RPC's shape (set-returning or not) is read from pg_proc,
// so the stand-in never guesses it; an argument or chain operation it does not model THROWS — a test fails rather than
// being answered by something the database did not say.
import { registerHooks } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { ENTRY, gitReader, graphFiles } from "../../../tools/edge/gnq-release.mjs";

// ── Which database ──────────────────────────────────────────────────────────────────────────────────
export const PG_URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
export const PG_REQUIRED = process.env.LEVEL_ENGINE_PG_REQUIRED === "1";
function loadPg(root) {
  for (const base of [process.env.LEVEL_ENGINE_PG_MODULE_DIR, root].filter(Boolean)) {
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* next */ }
  }
  return null;
}

/**
 * One throwaway database: { onPg, q(sql, params) → rows, x(script), end() }. With `template` (from makeTemplate) it starts
 * as an exact copy of that database: PGlite loads the template's data directory, PostgreSQL uses CREATE DATABASE …
 * TEMPLATE. Building production's answer chain is the expensive part, so a test builds it once and copies it.
 */
export async function openDatabase(root, label, { template = null } = {}) {
  const pg = PG_URL ? loadPg(root) : null;
  if (!pg) {
    const db = template ? new PGlite({ loadDataDir: template.dump }) : new PGlite();
    return { onPg: false, db, q: async (s, p) => (await db.query(s, p)).rows, x: async (s) => { await db.exec(s); }, end: () => db.close() };
  }
  const name = `${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE ${template ? template.name : "template0"}`);
  await admin.end();
  const u = new globalThis.URL(PG_URL);
  u.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  const drop = async () => {
    const a = new pg.Client({ connectionString: PG_URL });
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await a.end();
  };
  return {
    onPg: true,
    name,
    drop,
    // Another connection to the SAME database (for requests that must run at the same time); close it yourself.
    connect: async () => {
      const c2 = new pg.Client({ connectionString: u.toString() });
      await c2.connect();
      return { onPg: true, q: async (s, p) => (await c2.query(s, p)).rows, x: async (s) => { await c2.query(s); }, close: async () => { await c2.end().catch(() => {}); } };
    },
    close: async () => { await c.end().catch(() => {}); },
    q: async (s, p) => (await c.query(s, p)).rows,
    x: async (s) => { await c.query(s); },
    end: async () => { await c.end().catch(() => {}); await drop(); },
  };
}

/** Turns a built database into a template for openDatabase; returns { dump | name, dispose() }. Closes `db`'s connection. */
export async function makeTemplate(db) {
  if (!db.onPg) {
    const dump = await db.db.dumpDataDir("none");
    await db.db.close();
    return { dump, dispose: async () => {} };
  }
  // PostgreSQL copies a template only while nobody is connected to it: close our connection, keep the database.
  await db.close();
  return { name: db.name, dispose: () => db.drop() };
}

// One statement in its own transaction, as `role` (and, for the pupil, auth.uid() = pupil via test.uid).
export async function as(conn, role, pupil, sql, params = []) {
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

// ── supabase-js stand-in ────────────────────────────────────────────────────────────────────────────
const IDENT = /^[a-z_]+$/;
const ident = (s) => { if (!IDENT.test(s)) throw new Error(`stand-in: unexpected identifier ${JSON.stringify(s)}`); return s; };
function parseSelect(s) {
  const embeds = [];
  const rest = String(s).replace(/(\w+)(!inner)?\s*\(([^)]*)\)/g, (_, table, inner, cols) => {
    embeds.push({ table: ident(table), inner: Boolean(inner), cols: cols.split(",").map((c) => ident(c.trim())).filter(Boolean) });
    return "";
  });
  return { cols: rest.split(",").map((c) => c.trim()).filter(Boolean).map(ident), embeds };
}
// Every named RPC argument any get-next-question version sends, with its SQL type (the database decides whether a
// function takes it: a call no function matches is PostgREST's PGRST202, modelled below).
const RPC_CAST = Object.freeze({
  p_student_id: "uuid", p_grade: "smallint", p_domains: "text[]", p_course_scope: "text", p_per_group: "integer",
  p_subject: "text", p_level: "integer", p_limit: "integer",
  // D-384's two parking RPCs (get-next-question with LAERLIGVERSE_COURSE_PARKING=on).
  p_objective: "text", p_step: "text",
  // process-event's answer RPCs (legacy, H5 _v2 and the L5/L3 wrappers): the same names the deployed functions take.
  p_question_instance_id: "uuid", p_answer: "text", p_question_shown_at: "bigint", p_instance_id: "uuid", p_user_id: "uuid",
  p_user_answer: "text", p_is_correct: "boolean", p_round_no: "integer", p_submission_id: "uuid", p_review_text: "text",
  p_misconception_type: "text", p_mode: "text", p_hints_used: "integer",
});
const TABLES = new Set(["profiles", "question_instances", "questions"]);

// Per request: the connection and the pupil. AsyncLocalStorage keeps two requests that run AT THE SAME TIME (each on its
// own connection to a real PostgreSQL server) apart; a single request behaves exactly as with one shared state.
const als = new AsyncLocalStorage();
const shared = { conn: null, pupil: null, calls: [] };
const current = () => als.getStore() ?? shared;
async function backend(client, kind, name, ops) {
  const state = current();
  const role = client === "admin" ? "service_role" : "authenticated";
  const pupil = client === "admin" ? null : state.pupil;
  const params = [];
  const p = (v) => { params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v); return `$${params.length}`; };
  let sql;
  let mode = "rows";
  if (kind === "rpc") {
    if (ops.length !== 1) throw new Error(`stand-in: rpc ${name} with chained ops`);
    const args = ops[0]?.[1] ?? {};
    const named = Object.entries(args).map(([k, v]) => {
      const cast = RPC_CAST[k];
      if (!cast) throw new Error(`stand-in: rpc argument ${k} is not modelled`);
      return `${ident(k)} => ${p(v)}::${cast}`;
    });
    const shape = await state.conn.q("SELECT bool_or(proretset) AS setof, count(*)::int AS n FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace", [ident(name)]);
    if (shape[0].n > 0 && shape[0].setof) sql = `SELECT * FROM public.${name}(${named.join(", ")})`;
    else { sql = `SELECT to_jsonb(public.${name}(${named.join(", ")})) AS v`; mode = "scalar"; }
  } else if (kind === "from") {
    if (!TABLES.has(name)) throw new Error(`stand-in: table ${name} is not modelled`);
    let select = null, row = null, set = null, order = null, limit = null;
    const where = [];
    const embedFilters = [];
    for (const [op, ...a] of ops) {
      if (op === "select") select = parseSelect(a[0]);
      else if (op === "insert") row = a[0];
      else if (op === "update") set = a[0];
      else if (op === "eq" && String(a[0]).startsWith("questions.")) {
        // A filter on an !inner embed keeps only the rows whose embedded question matches (PostgREST's inner join).
        embedFilters.push(`qf.${ident(String(a[0]).slice("questions.".length))} = ${p(a[1])}`);
      } else if (op === "eq") where.push(`t.${ident(a[0])} = ${p(a[1])}`);
      else if (op === "neq") where.push(`t.${ident(a[0])} <> ${p(a[1])}`);
      else if (op === "lte") where.push(`t.${ident(a[0])} <= ${p(a[1])}`);
      else if (op === "gte") where.push(`t.${ident(a[0])} >= ${p(a[1])}`);
      else if (op === "lt") where.push(`t.${ident(a[0])} < ${p(a[1])}`);
      else if (op === "in") where.push(`t.${ident(a[0])} = ANY(${p(a[1])})`);
      else if (op === "is" && a[1] === null) where.push(`t.${ident(a[0])} IS NULL`);
      else if (op === "not" && a[1] === "is" && a[2] === null) {
        const m = /^(w+)->(w+)$/.exec(a[0]);
        where.push(m ? `t.${ident(m[1])} -> ${p(m[2])} IS NOT NULL` : `t.${ident(a[0])} IS NOT NULL`);
      } else if (op === "order") order = `t.${ident(a[0])} ${a[1]?.ascending === false ? "DESC" : "ASC"}`;
      else if (op === "limit") limit = Number(a[0]);
      else if (op === "maybeSingle") mode = "single";
      else throw new Error(`stand-in: .${op}() is not modelled`);
    }
    if (set) {
      // PostgREST PATCH: the filters name the row(s); RETURNING only with .select() (without it data is null).
      if (row || order || limit !== null || embedFilters.length || where.length === 0 || select?.embeds.length) {
        throw new Error("stand-in: an update shape that is not modelled");
      }
      const cols = Object.keys(set).map(ident);
      sql = `UPDATE public.${name} AS t SET ${cols.map((c) => `${c} = ${p(set[c])}`).join(", ")} WHERE ${where.join(" AND ")}`
        + (select ? ` RETURNING ${select.cols.map((c) => `t.${c}`).join(", ")}` : "");
      if (!select) mode = "none";
    } else {
      if (!select) throw new Error("stand-in: a chain without select()");
      if (embedFilters.length) {
        if (name !== "question_instances" || !select.embeds.some((e) => e.table === "questions" && e.inner)) throw new Error("stand-in: an embed filter needs questions!inner");
        where.push(`EXISTS (SELECT 1 FROM public.questions qf WHERE qf.id = t.question_id AND ${embedFilters.join(" AND ")})`);
      }
      const embedSql = select.embeds.map((e) => {
        if (name !== "question_instances" || e.table !== "questions") throw new Error(`stand-in: embed ${e.table}`);
        return `(SELECT to_jsonb(e) FROM (SELECT ${e.cols.map((c) => `q.${c}`).join(", ")} FROM public.questions q
        WHERE q.id = t.question_id) e) AS questions`;
      });
      if (row) {
        if (where.length || order || select.embeds.length) throw new Error("stand-in: insert with filters");
        const cols = Object.keys(row).map(ident);
        sql = `INSERT INTO public.${name} AS t (${cols.join(", ")}) VALUES (${cols.map((c) => p(row[c])).join(", ")}) RETURNING ${select.cols.map((c) => `t.${c}`).join(", ")}`;
      } else {
        sql = `SELECT ${[...select.cols.map((c) => `t.${c}`), ...embedSql].join(", ")} FROM public.${name} t`
          + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + (order ? ` ORDER BY ${order}` : "")
          + (limit !== null ? ` LIMIT ${limit}` : "");
      }
    }
  } else {
    throw new Error(`stand-in: ${kind} is not modelled`);
  }
  state.calls.push({ client, kind, name, sql });
  try {
    const rows = await as(state.conn, role, pupil, sql, params);
    if (mode === "scalar") return { data: rows.length ? rows[0].v : null, error: null };
    if (mode === "single") return { data: rows[0] ?? null, error: null };
    if (mode === "none") return { data: null, error: null };
    return { data: rows, error: null };
  } catch (e) {
    // PostgREST resolves an RPC by its named arguments; none matching (PostgreSQL 42883) is PGRST202, nothing called.
    if (kind === "rpc" && e.code === "42883") return { data: null, error: { message: e.message, code: "PGRST202" } };
    return { data: null, error: { message: e.message, code: e.code ?? null } };
  }
}

const STUB_SERVE = `export function serve(h) { globalThis.__gnqDbHandlers.push(h); }`;
const STUB_SUPABASE = `
function chain(kind, name, client, ops) {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        const res = globalThis.__gnqDbBackend(client, kind, name, ops);
        return (ok, ko) => Promise.resolve(res).then(ok, ko);
      }
      return (...args) => chain(kind, name, client, [...ops, [String(prop), ...args]]);
    },
  });
}
export function createClient(_url, key) {
  const client = key === "SERVICE" ? "admin" : "user";
  return {
    auth: { getUser: async () => ({ data: { user: { id: globalThis.__gnqDbUser() } }, error: null }) },
    from: (table) => chain("from", table, client, []),
    rpc: (fn, args) => chain("rpc", fn, client, [["args", args]]),
  };
}`;
const dataUrl = (src) => "data:text/javascript," + encodeURIComponent(src);
const SERVE = /^https:\/\/deno\.land\/std@[\d.]+\/http\/server\.ts$/;
const SUPABASE = /^https:\/\/esm\.sh\/@supabase\/supabase-js@/;
const ENV = new Map([["SUPABASE_URL", "http://stub"], ["SUPABASE_SERVICE_ROLE_KEY", "SERVICE"], ["SUPABASE_ANON_KEY", "ANON"]]);
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (SERVE.test(specifier)) return { url: dataUrl(STUB_SERVE), shortCircuit: true };
      if (SUPABASE.test(specifier)) return { url: dataUrl(STUB_SUPABASE), shortCircuit: true };
      return next(specifier, context);
    },
  });
  globalThis.Deno = { env: { get: (k) => ENV.get(k), set: (k, v) => ENV.set(k, v), delete: (k) => ENV.delete(k) } };
  globalThis.__gnqDbBackend = backend;
  globalThis.__gnqDbUser = () => current().pupil;
}

/** Is the commit in this checkout (CI checks out shallow)? */
export function haveCommit(commit, root) {
  try { gitReader(commit, root)(ENTRY); return true; } catch { return false; }
}
/** Writes the commit's get-next-question graph (as gnq-release.mjs defines it) to a temp dir; returns its index.ts. */
export function materialise(commit, root) {
  const read = gitReader(commit, root);
  const dir = mkdtempSync(join(tmpdir(), `gnq-${commit}-`));
  for (const f of graphFiles(read)) {
    const out = join(dir, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, read(f));
  }
  return join(dir, "supabase", ENTRY);
}
/** Loads one index.ts; returns its request handler. */
export async function loadHandler(indexPath) {
  install();
  globalThis.__gnqDbHandlers = [];
  await import(pathToFileURL(indexPath).href);
  if (globalThis.__gnqDbHandlers.length !== 1) throw new Error(`expected one serve() handler, got ${globalThis.__gnqDbHandlers.length}`);
  return globalThis.__gnqDbHandlers[0];
}

/** Flags this matrix varies; every other secret stays unset (production's state for them). */
export const FLAG_NAMES = Object.freeze(["LEVEL_ENGINE", "QUESTION_MIX_ENGINE", "LAERLIGVERSE_OBJECTIVE_TARGETING",
  "LAERLIGVERSE_SEQUENCE", "LAERLIGVERSE_SERVED_MODE", "LAERLIGVERSE_HINTS", "K1_SERVED_SNAPSHOT",
  // D-384 (get-next-question AND process-event read it) and L5/L3's process-event switch.
  "LAERLIGVERSE_COURSE_PARKING", "LAERLIGVERSE_ATTEMPT_CONTEXT"]);

const setFlags = (flags) => { for (const k of FLAG_NAMES) { if (flags[k] === undefined) ENV.delete(k); else ENV.set(k, flags[k]); } };
async function run(handler, conn, pupil, flags, json, { capture = true } = {}) {
  setFlags(flags);
  const store = { conn, pupil, calls: [] };
  const logs = [];
  const { log, error, warn } = console;
  const sink = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  if (capture) { console.log = sink; console.error = sink; console.warn = sink; }
  try {
    return await als.run(store, async () => {
      const res = await handler(new Request("http://stub/", { method: "POST", headers: { Authorization: "Bearer pupil" }, body: JSON.stringify(json) }));
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* non-JSON stays null */ }
      return { status: res.status, body: parsed, text, logs, calls: [...store.calls] };
    });
  } finally {
    if (capture) { console.log = log; console.error = error; console.warn = warn; }
  }
}

/** One get-next-question request by `pupil` on `conn`, with exactly `flags` set. */
export function request(handler, conn, pupil, { flags = {}, body = {} } = {}) {
  return run(handler, conn, pupil, flags, { subject: "historie", session_context: { wave_phase: "challenge" }, ...body });
}

/**
 * One request with EXACTLY `body` (process-event's answer). `capture: false` for requests that run at the same time on
 * their own connections (each request's calls stay its own; console output is then not captured).
 */
export function post(handler, conn, pupil, { flags = {}, body = {}, capture = true } = {}) {
  return run(handler, conn, pupil, flags, body, { capture });
}
