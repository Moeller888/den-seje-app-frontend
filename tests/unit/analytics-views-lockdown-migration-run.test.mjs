// RUNTIME proof for migration 20261016150000_analytics_views_lockdown. The SQL file is executed
// UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on a
// fixture that reproduces the LIVE state of 2026-10-16 (read-only audit): the six owner-rights views
// with their exact pg_get_viewdef bodies, owned by the bootstrap superuser (postgres in production)
// and granted ALL to anon/authenticated/service_role; the base tables with RLS on, not forced, and
// their live policies and grants; and public.auth_profile_role() as live (SECURITY DEFINER).
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.uid() reads `test.uid`. PostgREST is not in the loop: a REST call is modelled as the same
//     statement run as role anon / authenticated with auth.uid() = the caller.
//   - The fixture's data is synthetic. No production row was read to build it.
//   - attempt_stats, question_performance and analytics_question_attempts use the live bodies
//     verbatim. analytics_student_summary and question_diagnostics have their CASE expressions put on
//     one line, and ww2_taxonomy_audit keeps only one of its live CASE columns: what matters for those
//     three is their shape (aggregate / auto-updatable over questions), which is unchanged.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261016150000_analytics_views_lockdown.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const ADMIN = "00000000-0000-4000-8000-0000000000ad";   // super_admin
const T1 = "00000000-0000-4000-8000-0000000000a1";      // teacher of P1
const P1 = "00000000-0000-4000-8000-000000000001";      // pupil
const P2 = "00000000-0000-4000-8000-000000000002";      // another pupil
const Q1 = "00000000-0000-4000-8000-0000000000c1";
const Q2 = "00000000-0000-4000-8000-0000000000c2";
const QW = "00000000-0000-4000-8000-0000000000c3";      // an 'auto' ww2 question (ww2_taxonomy_audit)
const I1 = "00000000-0000-4000-8000-0000000000e1";
const I2 = "00000000-0000-4000-8000-0000000000e2";

const LOCKED = ["analytics_question_attempts", "analytics_student_summary", "question_diagnostics", "ww2_taxonomy_audit"];
const ADMIN_VIEWS = ["attempt_stats", "question_performance"];
const ALL_VIEWS = [...LOCKED, ...ADMIN_VIEWS];

// Live view bodies (pg_get_viewdef, 2026-10-16), verbatim.
const LIVE_VIEWS = `
CREATE VIEW public.analytics_question_attempts AS
 SELECT student_id,
    (payload ->> 'question_instance_id'::text) AS question_instance_id,
    (payload ->> 'question_id'::text) AS question_id,
    ((payload ->> 'difficulty'::text))::integer AS difficulty,
    ((payload ->> 'mastery_level'::text))::integer AS mastery_level,
    ((payload ->> 'mastery_balance'::text))::integer AS mastery_balance,
    ((payload ->> 'response_time_ms'::text))::integer AS response_time_ms,
        CASE
            WHEN (type = 'OPEN_CORRECT'::text) THEN true
            WHEN (type = 'OPEN_WRONG'::text) THEN false
            ELSE NULL::boolean
        END AS is_correct,
    created_at
   FROM student_events
  WHERE (type = ANY (ARRAY['OPEN_CORRECT'::text, 'OPEN_WRONG'::text]));

CREATE VIEW public.analytics_student_summary AS
 SELECT student_id,
    count(*) AS total_attempts,
    sum(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_answers,
    sum(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong_answers,
    round(((sum(CASE WHEN is_correct THEN 1 ELSE 0 END))::numeric / (count(*))::numeric), 2) AS success_rate,
    avg(response_time_ms) AS avg_response_time_ms
   FROM analytics_question_attempts
  GROUP BY student_id;

CREATE VIEW public.attempt_stats AS
 SELECT student_id,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE ((is_correct = true) AND (already_processed = false))) AS correct_attempts,
    count(*) FILTER (WHERE ((is_correct = false) AND (already_processed = false))) AS incorrect_attempts,
    count(*) FILTER (WHERE (already_processed = true)) AS retry_attempts,
    sum(xp_awarded) AS total_xp_awarded,
    max(created_at) AS last_attempt_at
   FROM question_attempt_audit
  GROUP BY student_id;

CREATE VIEW public.question_diagnostics AS
 SELECT q.id,
    (q.content ->> 'question'::text) AS question,
    count(qi.id) AS attempts,
    sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END) AS correct,
    round(((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric), 2) AS success_rate,
        CASE
            WHEN (count(qi.id) < 10) THEN 'insufficient_data'::text
            WHEN (((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric) < 0.35) THEN 'likely_bad_question'::text
            WHEN (((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric) < 0.6) THEN 'very_difficult'::text
            WHEN (((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric) < 0.85) THEN 'good_difficulty'::text
            ELSE 'too_easy'::text
        END AS quality_flag
   FROM (questions q
     LEFT JOIN question_instances qi ON ((qi.question_id = q.id)))
  GROUP BY q.id, q.content;

CREATE VIEW public.question_performance AS
 SELECT qi.question_id,
    count(*) FILTER (WHERE (a.already_processed = false)) AS total_attempts,
    count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))) AS correct_attempts,
    count(*) FILTER (WHERE ((a.is_correct = false) AND (a.already_processed = false))) AS incorrect_attempts,
    count(*) FILTER (WHERE (a.already_processed = true)) AS retry_attempts,
    round(((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric), 2) AS success_rate_percent,
    sum(a.xp_awarded) AS total_xp_generated,
        CASE
            WHEN ((count(*) FILTER (WHERE (a.already_processed = false)) >= 10) AND (((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric) < (40)::numeric)) THEN 'problem'::text
            WHEN ((count(*) FILTER (WHERE (a.already_processed = false)) >= 5) AND (((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric) < (60)::numeric)) THEN 'warning'::text
            ELSE 'healthy'::text
        END AS health_status
   FROM (question_attempt_audit a
     JOIN question_instances qi ON ((qi.id = a.question_instance_id)))
  GROUP BY qi.question_id;

CREATE VIEW public.ww2_taxonomy_audit AS
 SELECT id,
    learning_objective,
        CASE
            WHEN (learning_objective ~~ 'ww2_event_%'::text) THEN 'event'::text
            ELSE NULL::text
        END AS entity_type,
    (learning_objective ~ '^ww2_[a-z0-9]+_[a-z0-9_]+_[a-z0-9_]+$'::text) AS structure_ok
   FROM questions
  WHERE ((question_type = 'auto'::text) AND (learning_objective ~~ 'ww2_%'::text));
`;

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid);
  INSERT INTO public.profiles VALUES ('${ADMIN}', 'super_admin', NULL), ('${T1}', 'teacher', NULL),
    ('${P1}', 'student', '${T1}'), ('${P2}', 'student', NULL);
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
  GRANT SELECT ON public.profiles TO anon, authenticated, service_role;

  -- Live helper, as in production.
  CREATE FUNCTION public.auth_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public' AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$;

  CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, question_type text,
    learning_objective text, is_active boolean NOT NULL DEFAULT true);
  INSERT INTO public.questions VALUES
    ('${Q1}', '{"question":"Hvem?","correct":"Polen"}', 'manual', 'world_war_2', true),
    ('${Q2}', '{"question":"Hvor?","correct":"Norge"}', 'manual', 'vikings', true),
    ('${QW}', '{"question":"Hvornår?","correct":"1939"}', 'auto', 'ww2_event_start_year', true);
  ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow read questions" ON public.questions FOR SELECT TO public USING (true);
  GRANT ALL ON public.questions TO anon, authenticated, service_role;

  CREATE TABLE public.question_instances (id uuid PRIMARY KEY, student_id uuid NOT NULL,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE, is_correct boolean);
  INSERT INTO public.question_instances VALUES ('${I1}', '${P1}', '${Q1}', true), ('${I2}', '${P2}', '${QW}', false);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "students read own question_instances" ON public.question_instances FOR SELECT TO authenticated
    USING (student_id = (SELECT auth.uid()));
  GRANT SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.question_instances TO anon, authenticated;
  GRANT ALL ON public.question_instances TO service_role;

  CREATE TABLE public.student_events (id serial PRIMARY KEY, student_id uuid NOT NULL, type text NOT NULL,
    payload jsonb, created_at timestamptz NOT NULL DEFAULT '2026-03-01T00:00:00Z');
  INSERT INTO public.student_events (student_id, type, payload) VALUES
    ('${P1}', 'OPEN_CORRECT', '{"mastery_level":3,"response_time_ms":900}'),
    ('${P2}', 'OPEN_WRONG',   '{"mastery_level":1,"response_time_ms":4000}'),
    ('${P2}', 'LOGIN',        '{}');
  ALTER TABLE public.student_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Students can insert own events" ON public.student_events FOR INSERT TO public WITH CHECK (true);
  CREATE POLICY "Students can read own events" ON public.student_events FOR SELECT TO public USING (auth.uid() = student_id);
  GRANT ALL ON public.student_events TO anon, authenticated, service_role;

  -- Dormant audit table: RLS on, NO policies, grants only to service_role (as live).
  CREATE TABLE public.question_attempt_audit (id serial PRIMARY KEY, student_id uuid NOT NULL,
    question_instance_id uuid NOT NULL, is_correct boolean, already_processed boolean NOT NULL DEFAULT false,
    xp_awarded integer, created_at timestamptz NOT NULL DEFAULT '2026-03-01T00:00:00Z');
  INSERT INTO public.question_attempt_audit (student_id, question_instance_id, is_correct, already_processed, xp_awarded) VALUES
    ('${P1}', '${I1}', true, false, 10), ('${P1}', '${I1}', true, true, 0), ('${P2}', '${I2}', false, false, 0);
  ALTER TABLE public.question_attempt_audit ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.question_attempt_audit FROM PUBLIC;
  GRANT ALL ON public.question_attempt_audit TO service_role;

  ${LIVE_VIEWS}
  GRANT ALL ON ${ALL_VIEWS.map((v) => `public.${v}`).join(", ")} TO anon, authenticated, service_role;
`;

async function db({ migrated }) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  if (migrated) await pg.exec(MIGRATION);
  return pg;
}

// One statement as `role` with auth.uid() = uid, always rolled back.
async function as(pg, role, uid, sql) {
  await pg.exec("BEGIN");
  try {
    if (role) await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid ?? ""]);
    const r = await pg.query(sql);
    return { rows: r.rows, affected: r.affectedRows ?? 0 };
  } catch (e) {
    return { error: String(e.message) };
  } finally {
    await pg.exec("ROLLBACK");
  }
}

const denied = (r) => Boolean(r.error) && /permission denied/i.test(r.error);
// A write through a view must fail. Non-updatable (aggregate) views fail before the privilege check
// ("cannot delete from view"); updatable ones must fail on the privilege. Either way: no write.
const refused = (r) => Boolean(r.error) && /permission denied|cannot (delete from|update|insert into) view/i.test(r.error);
// ACL entries compared as a set: GRANT order is not meaningful.
const aclSet = (rows) => rows.map((r) => ({ ...r, relacl: r.relacl ? r.relacl.replace(/[{}]/g, "").split(",").sort().join(",") : null }));
const sel = (v) => `SELECT * FROM public.${v} ORDER BY 1`;
const snapshot = async (pg) => {
  const out = {};
  for (const t of ["profiles", "questions", "question_instances", "student_events", "question_attempt_audit"]) {
    out[t] = (await pg.query(`SELECT * FROM public.${t} ORDER BY 1`)).rows;
  }
  return out;
};
const viewColumns = async (pg, v) => (await pg.query(
  `SELECT attname, format_type(atttypid, atttypmod) AS type FROM pg_attribute
   WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`, [`public.${v}`])).rows;

// ── The fixture reproduces the live holes (so the "after" assertions mean something) ─────────────

test("before: anon reads every pupil's analytics rows through the owner-rights views", async () => {
  const pg = await db({ migrated: false });
  const r = await as(pg, "anon", null, sel("analytics_question_attempts"));
  assert.equal(r.rows?.length, 2, "anon sees both pupils' events — the base table's RLS is bypassed");
  const s = await as(pg, "anon", null, sel("attempt_stats"));
  assert.equal(s.rows?.length, 2, "anon sees question_attempt_audit, which grants anon nothing itself");
  const direct = await as(pg, "anon", null, "SELECT * FROM public.question_attempt_audit");
  assert.ok(denied(direct), "the base table is closed directly — only the view leaks it");
});

test("before: anon can delete questions (and cascade pupil history) through ww2_taxonomy_audit", async () => {
  const pg = await db({ migrated: false });
  const r = await as(pg, "anon", null, "DELETE FROM public.ww2_taxonomy_audit");
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.affected, 1, "the auto-updatable view deletes the base question as the view owner");
  const direct = await as(pg, "anon", null, "DELETE FROM public.questions");
  assert.equal(direct.affected, 0, "directly, RLS (no DELETE policy) stops the same delete");
});

test("before: anon can rewrite student_events through analytics_question_attempts", async () => {
  const pg = await db({ migrated: false });
  const r = await as(pg, "anon", null, "DELETE FROM public.analytics_question_attempts");
  assert.equal(r.affected, 2, "both pupils' events are deletable through the view");
});

// ── After the migration ────────────────────────────────────────────────────────────────────────────

test("after: anon has no access to any of the six views — read or write", async () => {
  const pg = await db({ migrated: true });
  for (const v of ALL_VIEWS) {
    assert.ok(denied(await as(pg, "anon", null, sel(v))), `anon SELECT ${v}`);
    assert.ok(refused(await as(pg, "anon", null, `DELETE FROM public.${v}`)), `anon DELETE ${v}`);
  }
  assert.ok(denied(await as(pg, "anon", null, "UPDATE public.ww2_taxonomy_audit SET learning_objective = 'x'")));
  assert.ok(denied(await as(pg, "anon", null,
    `INSERT INTO public.analytics_question_attempts (student_id, created_at) VALUES ('${P1}', now())`)));
});

test("after: a pupil cannot read the four locked views and sees zero rows in the two admin views", async () => {
  const pg = await db({ migrated: true });
  for (const v of LOCKED) assert.ok(denied(await as(pg, "authenticated", P1, sel(v))), `pupil SELECT ${v}`);
  for (const v of ADMIN_VIEWS) {
    const r = await as(pg, "authenticated", P1, sel(v));
    assert.equal(r.error, undefined, String(r.error));
    assert.deepEqual(r.rows, [], `pupil sees no rows in ${v} — not even their own`);
  }
});

test("after: a teacher sees nothing either — no view is a teacher surface", async () => {
  const pg = await db({ migrated: true });
  for (const v of LOCKED) assert.ok(denied(await as(pg, "authenticated", T1, sel(v))), `teacher SELECT ${v}`);
  for (const v of ADMIN_VIEWS) assert.deepEqual((await as(pg, "authenticated", T1, sel(v))).rows, [], v);
});

test("after: authenticated can no longer write through any view", async () => {
  const pg = await db({ migrated: true });
  for (const v of ALL_VIEWS) {
    assert.ok(refused(await as(pg, "authenticated", ADMIN, `DELETE FROM public.${v}`)), `DELETE ${v} (even super_admin)`);
  }
  assert.ok(denied(await as(pg, "authenticated", P1, "UPDATE public.ww2_taxonomy_audit SET learning_objective = 'x'")));
});

test("after: the super_admin page (authenticated, profile role super_admin) gets exactly the old rows", async () => {
  const before = await db({ migrated: false });
  const after = await db({ migrated: true });
  for (const v of ADMIN_VIEWS) {
    const old = await as(before, "authenticated", ADMIN, sel(v));
    const now = await as(after, "authenticated", ADMIN, sel(v));
    assert.equal(now.error, undefined, String(now.error));
    assert.ok(old.rows.length > 0, `fixture has data in ${v}`);
    assert.deepEqual(now.rows, old.rows, `${v} is unchanged for the super_admin`);
  }
});

test("after: server roles (service_role, postgres) keep every view, with identical rows", async () => {
  const before = await db({ migrated: false });
  const after = await db({ migrated: true });
  for (const v of ALL_VIEWS) {
    for (const role of ["service_role", null]) {
      const old = await as(before, role, null, sel(v));
      const now = await as(after, role, null, sel(v));
      assert.equal(now.error, undefined, `${role ?? "postgres"} ${v}: ${now.error}`);
      assert.deepEqual(now.rows, old.rows, `${role ?? "postgres"} ${v}`);
    }
  }
});

test("after: view columns are unchanged, and no table data, policy or table grant moved", async () => {
  const before = await db({ migrated: false });
  const after = await db({ migrated: true });
  for (const v of ALL_VIEWS) assert.deepEqual(await viewColumns(after, v), await viewColumns(before, v), v);
  assert.deepEqual(await snapshot(after), await snapshot(before));
  const pol = "SELECT tablename, policyname, cmd, roles::text, qual, with_check FROM pg_policies ORDER BY 1, 2";
  assert.deepEqual((await after.query(pol)).rows, (await before.query(pol)).rows);
  const acl = `SELECT relname, relacl::text FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace ORDER BY 1`;
  assert.deepEqual((await after.query(acl)).rows, (await before.query(acl)).rows);
});

test("after: re-running the migration is a no-op", async () => {
  const pg = await db({ migrated: true });
  const acl = `SELECT relname, relacl::text FROM pg_class WHERE relnamespace = 'public'::regnamespace ORDER BY 1`;
  const once = (await pg.query(acl)).rows;
  await pg.exec(MIGRATION);
  assert.deepEqual((await pg.query(acl)).rows, once);
});

test("the documented rollback restores the old grants and the old rows for every role", async () => {
  const before = await db({ migrated: false });
  const pg = await db({ migrated: true });
  const rollback = MIGRATION
    .split("\n").filter((l) => !l.startsWith("--")).join("\n")
    .replace(/^REVOKE[\s\S]*?;\s*/gm, "")
    .replace(/\n  WHERE \(\(CURRENT_USER[^\n]*\n/g, "\n");
  await pg.exec(`GRANT ALL ON ${ALL_VIEWS.map((v) => `public.${v}`).join(", ")} TO anon, authenticated;`);
  await pg.exec(rollback);
  const acl = `SELECT relname, relacl::text FROM pg_class WHERE relkind = 'v' AND relnamespace = 'public'::regnamespace ORDER BY 1`;
  assert.deepEqual(aclSet((await pg.query(acl)).rows), aclSet((await before.query(acl)).rows));
  for (const v of ADMIN_VIEWS) {
    assert.deepEqual((await as(pg, "authenticated", P1, sel(v))).rows, (await as(before, "authenticated", P1, sel(v))).rows, v);
  }
});

// ── Full role × view × operation matrix ─────────────────────────────────────────────────────────
// Every client caller (anon, pupil, teacher, super_admin) against every view and every statement
// kind. Reads must match the contract exactly; no write of any kind may succeed for anyone.

const CALLERS = [
  { name: "anon", role: "anon", uid: null },
  { name: "pupil", role: "authenticated", uid: P1 },
  { name: "teacher", role: "authenticated", uid: T1 },
  { name: "super_admin", role: "authenticated", uid: ADMIN },
];
const writeRefused = (r) => Boolean(r.error) &&
  /permission denied|cannot (delete from|update|insert into|truncate) view|is not a table/i.test(r.error);

test("matrix: SELECT for every caller and view matches the contract exactly", async () => {
  const pg = await db({ migrated: true });
  for (const c of CALLERS) {
    for (const v of ALL_VIEWS) {
      const r = await as(pg, c.role, c.uid, sel(v));
      const where = `${c.name} SELECT ${v}`;
      if (c.name === "anon" || LOCKED.includes(v)) {
        assert.ok(denied(r), `${where} must be denied, got ${JSON.stringify(r).slice(0, 120)}`);
      } else if (c.name === "super_admin") {
        assert.equal(r.error, undefined, `${where}: ${r.error}`);
        assert.ok(r.rows.length > 0, `${where} must see the statistics`);
      } else {
        assert.equal(r.error, undefined, `${where}: ${r.error}`);
        assert.deepEqual(r.rows, [], `${where} must see zero rows`);
      }
    }
  }
});

test("matrix: INSERT, UPDATE, DELETE and TRUNCATE are refused for every caller on every view", async () => {
  const pg = await db({ migrated: true });
  for (const v of ALL_VIEWS) {
    const [first] = await viewColumns(pg, v);
    const writes = {
      INSERT: `INSERT INTO public.${v} DEFAULT VALUES`,
      UPDATE: `UPDATE public.${v} SET ${first.attname} = ${first.attname}`,
      DELETE: `DELETE FROM public.${v}`,
      TRUNCATE: `TRUNCATE public.${v}`,
    };
    for (const c of CALLERS) {
      for (const [op, sql] of Object.entries(writes)) {
        const r = await as(pg, c.role, c.uid, sql);
        assert.ok(writeRefused(r), `${c.name} ${op} ${v} must be refused, got ${JSON.stringify(r).slice(0, 160)}`);
      }
    }
  }
  // And nothing a refused statement could have reached has moved.
  assert.deepEqual(await snapshot(pg), await snapshot(await db({ migrated: false })));
});

test("after: the ww2_taxonomy_audit → questions → question_instances cascade is closed to clients", async () => {
  const pg = await db({ migrated: true });
  for (const c of CALLERS) {
    assert.ok(writeRefused(await as(pg, c.role, c.uid, "DELETE FROM public.ww2_taxonomy_audit")), c.name);
  }
  // The base table stays as before: clients hold DELETE on questions, but RLS has no DELETE policy.
  for (const c of CALLERS) {
    const r = await as(pg, c.role, c.uid, "DELETE FROM public.questions");
    assert.equal(r.affected, 0, `${c.name} deletes no question directly`);
  }
  const hist = await pg.query("SELECT count(*)::int AS n FROM public.question_instances WHERE question_id = $1", [QW]);
  assert.equal(hist.rows[0].n, 1, "the pupil's history row on the ww2 question survives");
});

// ── Static shape of the file ─────────────────────────────────────────────────────────────────────

const statements = () => MIGRATION.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

test("the file only revokes view privileges and re-creates the two admin views", () => {
  const s = statements();
  assert.equal(s.length, 5, "3 REVOKE + 2 CREATE OR REPLACE VIEW");
  const kinds = s.map((x) => x.split(/\s+/).slice(0, 4).join(" "));
  assert.deepEqual(kinds.slice(0, 3).map((k) => k.split(" ")[0]), ["REVOKE", "REVOKE", "REVOKE"]);
  assert.match(s[3], /^CREATE OR REPLACE VIEW public\.attempt_stats AS/);
  assert.match(s[4], /^CREATE OR REPLACE VIEW public\.question_performance AS/);
  const body = s.join("\n");
  for (const forbidden of [/\bGRANT\b/i, /\bDROP\b/i, /\bALTER\b/i, /\bINSERT\b(?!, UPDATE)/, /\bTABLE\b/i, /POLICY/i]) {
    assert.doesNotMatch(body, forbidden, `unexpected ${forbidden}`);
  }
  for (const r of s.slice(0, 3)) assert.doesNotMatch(r, /service_role/, "service_role keeps its grants");
});

// Originally "sorts after every migration already in the tree" (last file in the directory). That
// encoded "nothing has been added since" instead of the property it protects, and failed on the
// first unrelated migration (20261016160000_answer_keys_server_side_rpcs.sql, PR #330). The
// property is: nothing that sorts after this file can touch the six views again (a later GRANT or
// CREATE OR REPLACE would silently undo the lockdown). Comment lines never count.
test("the migration sorts after every migration that touches the six views", () => {
  const dir = join(ROOT, "supabase", "migrations");
  const names = new RegExp(String.raw`\b(?:public\.)?(?:${ALL_VIEWS.join("|")})\b`, "i");
  const executable = (body) => body.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .filter((f) => names.test(executable(readFileSync(join(dir, f), "utf8")))).sort();
  assert.ok(touching.includes(FILE), "this migration must be present in the tree");
  assert.equal(touching[touching.length - 1], FILE,
    `a later migration touches the locked views and could re-open them: ${touching.filter((f) => f > FILE).join(", ")}`);
});
