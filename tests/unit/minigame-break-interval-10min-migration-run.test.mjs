// RUNTIME proof for migration 20261107090000_minigame_break_interval_10min (D-364), in PGlite.
//
// D-364 changes ONE thing in D-347: minigame_break_after_answer's interval goes from 1200 to 600 seconds
// (spillepauser every 10 minutes). Production order: D-347 (20261105090000, live as 20261105060103), then
// D-364. This file applies exactly that chain on the same fixture as minigame-breaks-migration-run.test.mjs
// (production's columns and default ACL) and proves:
//   1. the function body is D-347's, byte for byte, except the one constant line;
//   2. 599 s → no offer; 600 s → exactly one offer and a new period;
//   3. pupils who earned 600..1200 s under D-347 get their offer at the next answer, once;
//   4. nothing else moves: every other function, table, index, policy and grant is identical before/after;
//   5. re-applying D-364 is harmless (idempotent);
//   6. negative control: D-347 alone does NOT offer at 600 s, so (2) really proves the change.
// Synthetic users only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const D347 = "supabase/migrations/20261105090000_minigame_breaks.sql";
const D364 = "supabase/migrations/20261107090000_minigame_break_interval_10min.sql";

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
  GRANT anon, authenticated, service_role TO authenticator;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  INSERT INTO auth.users VALUES ('${P1}'), ('${P2}');
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
  INSERT INTO public.profiles VALUES ('${P1}', 'student'), ('${P2}', 'student');
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    answered boolean NOT NULL DEFAULT false,
    answered_at timestamptz,
    user_answer text);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  -- Production's default privileges (pg_default_acl): new tables and functions go to all three API roles.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

async function db347() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(read(D347));
  return db;
}
async function db364() {
  const db = await db347();
  await db.exec(read(D364));
  return db;
}

const q = (s) => String(s).split("'").join("''");

async function afterAnswer(db, sub, id, visible = "NULL") {
  const claims = JSON.stringify({ role: "authenticated", sub });
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(claims)}', false), set_config('request.jwt.claim.sub', '', false);
      SET ROLE authenticated;`);
    return (await db.query(`SELECT public.minigame_break_after_answer('${id}'::uuid, ${visible}) AS r`)).rows[0].r;
  } finally {
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function respond(db, sub, id, accept) {
  const claims = JSON.stringify({ role: "authenticated", sub });
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(claims)}', false), set_config('request.jwt.claim.sub', '', false);
      SET ROLE authenticated;`);
    return (await db.query(`SELECT public.minigame_break_respond('${id}'::uuid, ${accept}) AS r`)).rows[0].r;
  } finally {
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function answered(db, student, servedAgo, answeredAgo, answer = "x") {
  const r = await db.query(`INSERT INTO public.question_instances (student_id, created_at, answered, answered_at, user_answer)
    VALUES ('${student}', now() - interval '${servedAgo} seconds', true, now() - interval '${answeredAgo} seconds', '${q(answer)}')
    RETURNING id`);
  return r.rows[0].id;
}
async function setProgress(db, student, seconds, lastAgo) {
  await db.query(`INSERT INTO public.minigame_break_progress (student_id, active_seconds, last_credit_at)
    VALUES ('${student}', ${seconds}, now() - interval '${lastAgo} seconds')
    ON CONFLICT (student_id) DO UPDATE SET active_seconds = EXCLUDED.active_seconds, last_credit_at = EXCLUDED.last_credit_at`);
}
const seconds = async (db, s) =>
  (await db.query(`SELECT active_seconds FROM public.minigame_break_progress WHERE student_id = '${s}'`)).rows[0]?.active_seconds ?? null;
const offerCount = async (db, s) =>
  (await db.query(`SELECT count(*)::int AS n FROM public.minigame_break_offers WHERE student_id = '${s}'`)).rows[0].n;

// Everything D-347 created except after_answer's body: functions (definition, flags, owner, ACL, config),
// tables (columns, RLS, ACL), indexes, policies, constraints.
async function snapshot(db, { includeAfterAnswerBody }) {
  const fns = (await db.query(`
    SELECT p.oid::regprocedure::text AS sig,
           CASE WHEN p.proname = 'minigame_break_after_answer' AND NOT $1 THEN '<body>' ELSE md5(p.prosrc) END AS body,
           p.prosecdef, p.proconfig::text AS cfg, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' ORDER BY 1`, [includeAfterAnswerBody])).rows;
  const tables = (await db.query(`
    SELECT c.relname, c.relrowsecurity, c.relacl::text AS acl,
           (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' ORDER BY a.attnum)
              FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS cols
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'i') ORDER BY 1`)).rows;
  const cons = (await db.query(`
    SELECT conrelid::regclass::text AS t, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`)).rows;
  const pols = (await db.query(`SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`)).rows;
  return { fns, tables, cons, pols };
}

// ── 1. the change is exactly one line ───────────────────────────────────────────────────────────────

test("1: D-364's function is D-347's, byte for byte, except the interval constant", () => {
  const fn = (sql) => {
    const a = sql.indexOf("CREATE OR REPLACE FUNCTION public.minigame_break_after_answer(");
    const b = sql.indexOf("$function$;", a);
    assert.ok(a >= 0 && b > a);
    return sql.slice(a, b + "$function$;".length).split("\n");
  };
  const old = fn(read(D347));
  const neu = fn(read(D364));
  assert.equal(neu.length, old.length);
  const diff = old.map((l, i) => [l, neu[i]]).filter(([x, y]) => x !== y);
  assert.deepEqual(diff, [[
    "  c_interval    CONSTANT integer  := 1200;               -- MINIGAME_INTERVAL_SECONDS: 20 minutes",
    "  c_interval    CONSTANT integer  := 600;                -- MINIGAME_INTERVAL_SECONDS: 10 minutes (D-364)",
  ]]);
  // The file creates nothing else: one function, the same two grant statements D-347 has for it.
  const stmts = read(D364).replace(/--.*$/gm, "").replace(/\$function\$[\s\S]*?\$function\$/g, "").trim();
  assert.equal((stmts.match(/CREATE /g) || []).length, 1);
  assert.equal((stmts.match(/\b(DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE)\b/g) || []).length, 0);
  assert.match(stmts, /REVOKE ALL ON FUNCTION public\.minigame_break_after_answer\(uuid, integer\) FROM PUBLIC, anon;/);
  assert.match(stmts, /GRANT EXECUTE ON FUNCTION public\.minigame_break_after_answer\(uuid, integer\) TO authenticated;/);
});

// ── 2. the new interval ─────────────────────────────────────────────────────────────────────────────

test("2: after D-364, 599 s give no offer and reaching 600 s with an answer gives exactly one", async () => {
  const db = await db364();
  const first = await afterAnswer(db, P1, await answered(db, P1, 70, 10, "a"));
  assert.equal(first.interval_seconds, 600);
  assert.equal(first.offer, null);
  await setProgress(db, P1, 590, 400);
  let r = await afterAnswer(db, P1, await answered(db, P1, 300, 290, "b"), 9);   // → 599 = 9:59
  assert.equal(r.active_seconds, 599);
  assert.equal(r.offer, null);
  assert.equal(await offerCount(db, P1), 0);
  r = await afterAnswer(db, P1, await answered(db, P1, 240, 200, "c"), 1);      // → 600 = 10:00
  assert.equal(r.reason, "offer");
  assert.ok(r.offer && typeof r.offer.id === "string" && typeof r.offer.game === "string");
  assert.equal(r.active_seconds, 0, "a new period starts");
  assert.equal(r.interval_seconds, 600);
  assert.equal(await offerCount(db, P1), 1);
});

test("2b: both choices start a new 10-minute period, and the next offer needs 600 s again", async () => {
  for (const accept of [true, false]) {
    const db = await db364();
    await setProgress(db, P1, 599, 600);
    const r = await afterAnswer(db, P1, await answered(db, P1, 100, 0, "a"));
    assert.equal(r.reason, "offer");
    await respond(db, P1, r.offer.id, accept);
    assert.equal(await seconds(db, P1), 0, String(accept));
    // Five minutes of quiz work after the choice (an accepted, unplayed break ends at this answer — D-347).
    await db.query(`UPDATE public.minigame_break_progress SET last_credit_at = now() - interval '300 seconds' WHERE student_id = '${P1}'`);
    const next = await afterAnswer(db, P1, await answered(db, P1, 300, 0, "b"));
    assert.equal(next.active_seconds, 300);
    assert.equal(next.offer, null, "300 s is half a period");
    assert.equal(await offerCount(db, P1), 1);
  }
});

test("2c: the 300 s per-answer cap still holds — two capped answers make one period", async () => {
  const db = await db364();
  const a = await afterAnswer(db, P1, await answered(db, P1, 3600, 0, "a"));
  assert.equal(a.active_seconds, 300);
  await db.query(`UPDATE public.minigame_break_progress SET last_credit_at = now() - interval '900 seconds' WHERE student_id = '${P1}'`);
  const b = await afterAnswer(db, P1, await answered(db, P1, 3600, 0, "b"));
  assert.equal(b.reason, "offer");
});

// ── 3. pupils in the middle of a D-347 period ───────────────────────────────────────────────────────

test("3: a pupil with 600..1200 s earned under D-347 gets one offer at the next answer, and no extra from the surplus", async () => {
  for (const stored of [600, 900, 1199, 1200]) {
    const db = await db364();
    await setProgress(db, P1, stored, 600);
    assert.equal(await offerCount(db, P1), 0, "no offer exists before an answer");
    const r = await afterAnswer(db, P1, await answered(db, P1, 30, 0, "a"));
    assert.equal(r.reason, "offer", String(stored));
    await respond(db, P1, r.offer.id, false);
    const next = await afterAnswer(db, P1, await answered(db, P1, 60, 0, "b"));
    assert.equal(next.offer, null, "surplus does not pile up: " + stored);
    assert.equal(await offerCount(db, P1), 1);
  }
});

test("3b: a pupil below 600 s keeps the seconds already earned", async () => {
  const db = await db347();
  await setProgress(db, P2, 450, 600);
  await db.exec(read(D364));
  assert.equal(await seconds(db, P2), 450);
  const r = await afterAnswer(db, P2, await answered(db, P2, 100, 0, "a"), 100);
  assert.equal(r.active_seconds, 550);
  assert.equal(r.offer, null);
});

// ── 4. nothing else moves ───────────────────────────────────────────────────────────────────────────

test("4: every other function, table, index, constraint, policy and grant is identical before and after D-364", async () => {
  const before = await snapshot(await db347(), { includeAfterAnswerBody: false });
  const after = await snapshot(await db364(), { includeAfterAnswerBody: false });
  assert.deepEqual(after, before);
  // The body itself DID change (the snapshot is not blind to it).
  const b = await snapshot(await db347(), { includeAfterAnswerBody: true });
  const a = await snapshot(await db364(), { includeAfterAnswerBody: true });
  assert.notDeepEqual(a.fns, b.fns);
});

test("4b: after D-364 the RPC is callable by pupils, not by anon; the internal helpers by no API role", async () => {
  const db = await db364();
  const priv = async (role, sig) =>
    (await db.query(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS ok`)).rows[0].ok;
  assert.equal(await priv("anon", "public.minigame_break_after_answer(uuid,integer)"), false);
  assert.equal(await priv("authenticated", "public.minigame_break_after_answer(uuid,integer)"), true);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(await priv(role, "public._minigame_break_expire(uuid)"), false, role);
    assert.equal(await priv(role, "public._minigame_break_lock_pupil()"), false, role);
  }
  const fn = (await db.query(`SELECT prosecdef, proconfig::text AS cfg FROM pg_proc WHERE proname = 'minigame_break_after_answer'`)).rows;
  assert.deepEqual(fn, [{ prosecdef: true, cfg: "{search_path=public}" }]);
});

// ── 5. idempotent ───────────────────────────────────────────────────────────────────────────────────

test("5: applying D-364 twice changes nothing", async () => {
  const once = await db364();
  const twice = await db364();
  await twice.exec(read(D364));
  assert.deepEqual(await snapshot(twice, { includeAfterAnswerBody: true }), await snapshot(once, { includeAfterAnswerBody: true }));
});

// ── 6. negative control ─────────────────────────────────────────────────────────────────────────────

test("6: negative control — under D-347 alone 600 s is no offer (the interval was 1200)", async () => {
  const db = await db347();
  await setProgress(db, P1, 590, 400);
  const r = await afterAnswer(db, P1, await answered(db, P1, 300, 290, "a"), 10);
  assert.equal(r.active_seconds, 600);
  assert.equal(r.interval_seconds, 1200);
  assert.equal(r.offer, null);
});
