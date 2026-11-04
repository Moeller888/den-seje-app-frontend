// The comment-only correction of student_subject_level (20261030120000), as production has it.
//
// Applied in production as remote 20261030182931 student_subject_level_comment (2026-10-30), so the
// isolated replay applies it too: #351 → A → B → comment. This test compares that replay with the same
// replay stopped just before the file, and proves the file changes the table comment and nothing else:
// function bodies, SECURITY INVOKER, ACLs and grants, RLS and policies, tables, columns, indexes and rows
// are identical.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, migrationFiles, readMigration } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLATFORM = readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8");
const FILE = "20261030120000_student_subject_level_comment.sql";
const SQL = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const A_COMMENT = "The pupil's level 1-10000 per subject. Server-owned: written only by SECURITY DEFINER functions and the backend key.";
const NEW_COMMENT = "Elevens niveau 1–10.000 pr. fag. Serverejet: skrivning kan kun ske med service_role, herunder gennem advance_student_level, som er SECURITY INVOKER og kun kan kaldes af service_role. Authenticated-brugere kan via RLS kun læse deres egne rækker og kan ikke skrive.";
const LEVEL_FNS = ["advance_student_level", "get_level_questions_for_student", "request_repeat_level_question_for_student"];
const ROLES = ["public", "anon", "authenticated", "service_role"];
const TABLE_PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];

const rows = async (db, sql) => (await db.query(sql)).rows;
const one = async (db, sql) => (await db.query(sql)).rows[0];

// Everything in public except comments: functions, relations, columns, indexes, constraints, policies.
async function schemaFingerprint(db) {
  return {
    functions: await rows(db, `SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, md5(p.prosrc) m,
                                      p.prosecdef, p.proconfig::text cfg, p.proacl::text acl
                               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1, 2`),
    relations: await rows(db, `SELECT c.relname, c.relkind::text kind, c.relacl::text acl, c.relrowsecurity rls, c.relforcerowsecurity force_rls
                               FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace ORDER BY 1`),
    columns: await rows(db, `SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) t, a.attnotnull nn, a.attacl::text acl,
                                    pg_get_expr(d.adbin, d.adrelid) dflt
                             FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                             LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                             WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1, 2`),
    indexes: await rows(db, `SELECT i.indexrelid::regclass::text n, pg_get_indexdef(i.indexrelid) d FROM pg_index i
                             JOIN pg_class c ON c.oid = i.indrelid WHERE c.relnamespace = 'public'::regnamespace ORDER BY 1`),
    constraints: await rows(db, `SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d FROM pg_constraint
                                 WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`),
    policies: await rows(db, `SELECT polrelid::regclass::text t, polname, polcmd::text cmd, polpermissive perm, polroles::regrole[]::text roles,
                                     pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) wc
                              FROM pg_policy ORDER BY 1, 2`),
  };
}

async function levelState(db) {
  const fns = await rows(db, `SELECT p.proname, md5(p.prosrc) m, p.prosecdef, p.proacl::text acl,
                                     ${ROLES.map((r) => `has_function_privilege('${r}', p.oid, 'EXECUTE') "${r}"`).join(", ")}
                              FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                                AND p.proname IN (${LEVEL_FNS.map((f) => `'${f}'`).join(", ")}) ORDER BY 1`);
  const grants = {};
  for (const t of ["student_subject_level", "student_level_fold_log"]) {
    for (const r of ROLES.slice(1)) {
      const g = await one(db, `SELECT ${TABLE_PRIVS.map((p) => `has_table_privilege('${r}', 'public.${t}', '${p}') "${p}"`).join(", ")}`);
      grants[`${t}/${r}`] = TABLE_PRIVS.filter((p) => g[p]);
    }
  }
  const tables = await rows(db, `SELECT c.relname, c.relrowsecurity rls, c.relacl::text acl,
                                        (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) policies
                                 FROM pg_class c WHERE c.oid IN ('public.student_subject_level'::regclass, 'public.student_level_fold_log'::regclass)
                                 ORDER BY 1`);
  const counts = {};
  for (const t of ["student_subject_level", "student_level_fold_log"]) counts[t] = (await one(db, `SELECT count(*)::int n FROM public.${t}`)).n;
  return { fns, grants, tables, counts };
}

// Every comment in the database except the one this migration is allowed to change.
const otherComments = (db) => rows(db, `SELECT classoid::regclass::text k, objoid::text o, objsubid s, description d FROM pg_description
                                        WHERE NOT (classoid = 'pg_class'::regclass AND objoid = 'public.student_subject_level'::regclass AND objsubid = 0)
                                        ORDER BY 1, 2, 3`);
const tableComment = async (db) => (await one(db, `SELECT obj_description('public.student_subject_level'::regclass, 'pg_class') c`)).c;

async function replayed(files) {
  const d = new PGlite();
  await d.exec(PLATFORM);
  await d.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => d.exec(s), query: async (s) => (await d.query(s)).rows, files, readSql: readMigration });
  return { d, r };
}

// db: the production replay (#351 → A → B → comment). prior: the same replay without this file.
let db, replay, prior, before_;
before(async () => {
  ({ d: db, r: replay } = await replayed(migrationFiles()));
  ({ d: prior } = await replayed(migrationFiles().filter((f) => f !== FILE)));
  before_ = { schema: await schemaFingerprint(prior), level: await levelState(prior), comments: await otherComments(prior), comment: await tableComment(prior) };
});

test("the file is exactly one COMMENT ON TABLE public.student_subject_level, with the owner's text", () => {
  const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n").trim();
  const expected = `COMMENT ON TABLE public.student_subject_level IS\n  '${NEW_COMMENT.replace(/'/g, "''")}';`;
  assert.equal(code, expected);
  assert.equal((code.match(/;/g) || []).length, 1, "one statement");
});

test("the production replay runs #351 → A → B → this file, each applied without failure", () => {
  assert.deepEqual(replay.failures, []);
  assert.equal(NOT_IN_PRODUCTION[FILE], undefined);
  const order = replay.plan.filter((p) => p.action === "apply").map((p) => p.file);
  const at = ["20261019150000_question_format_mix.sql", "20261020120000_difficulty_scale_a.sql", "20261029120000_difficulty_scale_b.sql", FILE].map((f) => order.indexOf(f));
  assert.ok(at[0] >= 0 && at[0] < at[1] && at[1] < at[2] && at[2] < at[3], `#351 → A → B → comment, got positions ${at}`);
  assert.ok(replay.steps.some((s) => s.name === FILE && s.ok), "the file is a replay step");
  // Without this file the replayed table carries A's (wrong) comment — as production did before it.
  assert.equal(before_.comment, A_COMMENT);
});

test("after the file: the exact new table comment", async () => {
  assert.equal(await tableComment(db), NEW_COMMENT);
});

test("after the file: function hashes, SECURITY INVOKER and EXECUTE grants unchanged", async () => {
  const now = await levelState(db);
  assert.deepEqual(now.fns, before_.level.fns);
  assert.deepEqual(now.fns.map((f) => [f.proname, f.m]), [
    ["advance_student_level", "4147c559353946a64c3ea1c791d19635"],
    ["get_level_questions_for_student", "9e5862b287f6f41066eb876667c426a7"],
    // D-280 part 1 (20261031194600, remote 20261101101401) later replaced it; the replay includes that.
    ["request_repeat_level_question_for_student", "db8280ddee20254e876be7fb1fc57e4d"],
  ]);
  for (const f of now.fns) {
    assert.equal(f.prosecdef, false, `${f.proname} is SECURITY INVOKER`);
    assert.equal(f.acl, "{postgres=X/postgres,service_role=X/postgres}", f.proname);
    assert.deepEqual(ROLES.map((r) => f[r]), [false, false, false, true], f.proname);
  }
});

test("after the file: table ACLs and grants, RLS and policy counts unchanged — and what the comment says holds", async () => {
  const now = await levelState(db);
  assert.deepEqual(now.grants, before_.level.grants);
  assert.deepEqual(now.tables, before_.level.tables);
  assert.deepEqual(now.tables.map((t) => [t.relname, t.rls, t.policies]), [["student_level_fold_log", true, 0], ["student_subject_level", true, 1]]);
  // "Authenticated-brugere kan via RLS kun læse deres egne rækker og kan ikke skrive."
  assert.deepEqual(now.grants["student_subject_level/authenticated"], ["SELECT"]);
  assert.deepEqual(now.grants["student_subject_level/anon"], []);
  const pol = await one(db, `SELECT polcmd::text cmd, polroles::regrole[]::text roles, pg_get_expr(polqual, polrelid) q
                             FROM pg_policy WHERE polrelid = 'public.student_subject_level'::regclass`);
  assert.equal(pol.cmd, "r");
  assert.equal(pol.roles, "{authenticated}");
  assert.match(pol.q, /auth\.uid\(\)/);
  assert.match(pol.q, /student_id/);
});

test("after the file: no function, relation, column, index, constraint, policy or other comment changed", async () => {
  assert.deepEqual(await schemaFingerprint(db), before_.schema);
  assert.deepEqual(await otherComments(db), before_.comments);
});

test("after the file: both level tables still have 0 rows", async () => {
  assert.deepEqual((await levelState(db)).counts, { student_subject_level: 0, student_level_fold_log: 0 });
  assert.deepEqual(before_.level.counts, { student_subject_level: 0, student_level_fold_log: 0 });
});
