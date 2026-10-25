// FAIL-CLOSED TARGET CHECK FOR THE SYNTHETIC SEED (isolated E2E only).
//
// The seed itself is INSERT-only (no DELETE, no TRUNCATE, no DROP — pinned by a unit test). Even so it
// may run only against the throwaway database this run created. Every check below is independent; ALL
// must pass, and each one refuses on anything it cannot read:
//
//   1. Environment   — isolation-guard: ISOLATED_E2E=1, loopback URLs only, nothing names production,
//                       no mail/AI key or production secret name present.
//   2. Run token     — the bootstrap wrote a fresh random token (ISOLATED_DB_TOKEN, ≥ 128 bit) into
//                       isolated_ci.environment of the NEW database before anything else ran. A port
//                       forward, proxy or copied connection string that reaches any other database
//                       finds no such schema, or a different token.
//   3. Cluster id    — when ISOLATED_DB_SYSID is set (captured at bootstrap), pg_control_system()
//                       must report exactly that system_identifier: a different PostgreSQL cluster is
//                       refused even if someone copied the token.
//   4. Content       — no question that is not synthetic, and no auth user outside @e2e.invalid. A real
//                       database has real rows; the throwaway one has none.
//   5. Size          — at most SIZE_LIMIT rows in questions and in auth.users (belt and braces).
//
// None of these is "it says localhost": a forwarded port is localhost too.
import { isolationViolations, SYNTHETIC_EMAIL_DOMAIN } from "../isolation-guard.mjs";

export const TOKEN_RE = /^[0-9a-f]{32,128}$/;
export const SIZE_LIMIT = 5000;

// Run ONCE, by the bootstrap, on the database it has just started — before migrations.
export function bootstrapMarkerSql(token) {
  if (!TOKEN_RE.test(String(token))) throw new Error("bootstrap: token must be 32–128 lowercase hex characters");
  return `CREATE SCHEMA isolated_ci;
CREATE TABLE isolated_ci.environment (token text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO isolated_ci.environment (token) VALUES ('${token}');
REVOKE ALL ON SCHEMA isolated_ci FROM PUBLIC;
`;
}

// During the replay only: content migrations that also carry schema insert real question rows; this
// trigger discards every row so none ever lands (no DELETE/TRUNCATE needed afterwards). Created
// after the target check, dropped right after the replay.
export function contentFilterOnSql() {
  return `CREATE FUNCTION isolated_ci.discard_question_rows() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE TRIGGER isolated_ci_discard_question_rows BEFORE INSERT ON public.questions FOR EACH ROW EXECUTE FUNCTION isolated_ci.discard_question_rows();
`;
}
export function contentFilterOffSql() {
  return `DROP TRIGGER isolated_ci_discard_question_rows ON public.questions;
DROP FUNCTION isolated_ci.discard_question_rows();
`;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// `query(sql)` → array of row objects. Read-only statements only. Throws (refuses) on any doubt.
export async function assertSeedTarget({ query, env }) {
  const refuse = (why) => { throw new Error("SEED REFUSED — " + why); };
  if (typeof query !== "function" || !env || typeof env !== "object") refuse("no query function or environment");

  const v = isolationViolations(env);
  if (v.length) refuse("environment is not isolated: " + v.join("; "));
  const token = env.ISOLATED_DB_TOKEN;
  if (!TOKEN_RE.test(String(token ?? ""))) refuse("ISOLATED_DB_TOKEN missing or malformed");

  let rows;
  try { rows = await query("SELECT to_regclass('isolated_ci.environment') IS NOT NULL AS has_marker"); }
  catch (e) { refuse("cannot read the database: " + e.message); }
  if (!rows?.[0]?.has_marker) refuse("database has no isolated_ci marker — not the database this run created");
  const marks = await query("SELECT token FROM isolated_ci.environment");
  if (!Array.isArray(marks) || marks.length !== 1 || marks[0].token !== token) refuse("run token does not match this database");

  if (env.ISOLATED_DB_SYSID !== undefined) {
    if (!/^\d{5,20}$/.test(String(env.ISOLATED_DB_SYSID))) refuse("ISOLATED_DB_SYSID malformed");
    const sys = await query("SELECT system_identifier::text AS id FROM pg_control_system()");
    if (sys?.[0]?.id !== String(env.ISOLATED_DB_SYSID)) refuse("PostgreSQL cluster identifier differs from the one captured at bootstrap");
  }

  const content = await query(
    `SELECT (SELECT count(*) FROM public.questions WHERE coalesce(metadata->>'synthetic', '') <> 'true')::int AS real_questions,
            (SELECT count(*) FROM public.questions)::int AS questions,
            (SELECT count(*) FROM auth.users WHERE coalesce(email, '') NOT LIKE ${lit("%@" + SYNTHETIC_EMAIL_DOMAIN)})::int AS real_users,
            (SELECT count(*) FROM auth.users)::int AS users`);
  const c = content?.[0];
  if (!c) refuse("content check returned nothing");
  if (c.real_questions !== 0) refuse(`unexpected existing content: ${c.real_questions} non-synthetic question(s)`);
  if (c.real_users !== 0) refuse(`unexpected existing content: ${c.real_users} non-synthetic auth user(s)`);
  if (c.questions > SIZE_LIMIT || c.users > SIZE_LIMIT) refuse("database larger than any throwaway isolated database");
  return { ok: true, questions: c.questions, users: c.users };
}

// Check first, then INSERT-only seed. `exec(sql)` is called only after every check passed.
export async function seedSyntheticQuestions({ query, exec, env, sql }) {
  await assertSeedTarget({ query, env });
  await exec(sql);
}
