// Security: the D-110 migration that closes direct EXECUTE on public.process_question_attempt.
//
// The Edge half (process-event v31, PR #295) already calls this RPC only through a backend client,
// and is proven live on real MC / number traffic. This migration removes the direct client path.
// These tests pin that the file does exactly that and nothing else: four privilege statements on ONE
// signature, no search_path change (live already has public, pg_temp), no body change, no other
// function, no table or RLS change — and that the caller chain it relies on is still in the repo.
// Pattern: 20261003153220_process_text_answer_execute_lockdown.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261007182046_process_question_attempt_execute_lockdown.sql";
const SQL = readFileSync(join(REPO, "supabase", "migrations", FILE), "utf8");

// The executable SQL only: comments removed, whitespace collapsed, one statement per entry.
const CODE = SQL.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
const STATEMENTS = CODE.split(";").map((s) => s.trim()).filter(Boolean);

const SIG = "public.process_question_attempt(uuid, uuid, text, bigint)";
const ON_FN = `ON FUNCTION ${SIG}`;

test("the migration file exists under the CLI-generated name and sorts after the last live migration", () => {
  const files = readdirSync(join(REPO, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(FILE));
  assert.equal(files.filter((f) => f.startsWith("20261007182046_")).length, 1, "version is unique");
  assert.ok("20261007182046" > "20261004114651", "after the newest remote version");
});

test("exactly four statements, in the agreed order", () => {
  assert.deepEqual(STATEMENTS, [
    `REVOKE EXECUTE ${ON_FN} FROM PUBLIC`,
    `REVOKE EXECUTE ${ON_FN} FROM anon`,
    `REVOKE EXECUTE ${ON_FN} FROM authenticated`,
    `GRANT EXECUTE ${ON_FN} TO service_role`,
  ]);
});

test("every statement targets the full four-argument signature", () => {
  for (const s of STATEMENTS) assert.ok(s.includes(SIG), s);
  // A name-only REVOKE would silently miss a future overload.
  assert.equal(CODE.split(SIG).join("").includes("process_question_attempt"), false);
});

test("EXECUTE is revoked from PUBLIC, anon and authenticated", () => {
  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert.ok(STATEMENTS.includes(`REVOKE EXECUTE ${ON_FN} FROM ${role}`), role);
  }
  const revokes = STATEMENTS.filter((s) => /^REVOKE\b/i.test(s));
  assert.equal(revokes.length, 3);
  assert.equal(revokes.some((s) => /service_role/.test(s)), false, "service_role is never revoked");
});

test("EXECUTE is granted to service_role and to nobody else", () => {
  const grants = STATEMENTS.filter((s) => /^GRANT\b/i.test(s));
  assert.deepEqual(grants, [`GRANT EXECUTE ${ON_FN} TO service_role`]);
});

test("only privilege statements — no ALTER FUNCTION, no search_path change", () => {
  for (const s of STATEMENTS) assert.match(s, /^(REVOKE|GRANT) EXECUTE ON FUNCTION /, s);
  assert.equal(/ALTER\s+FUNCTION/i.test(CODE), false);
  assert.equal(/search_path/i.test(CODE), false, "live already has search_path = public, pg_temp");
});

test("the function body is not touched", () => {
  assert.equal(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(CODE), false);
  assert.equal(/\$\$|\$function\$|LANGUAGE\s+plpgsql|\bRETURNS\b|\bBEGIN\b/i.test(CODE), false);
  assert.equal(/DROP\s+FUNCTION/i.test(CODE), false);
  assert.equal(/SECURITY|OWNER\s+TO|RENAME/i.test(CODE), false);
});

test("no other function is granted, revoked or altered", () => {
  const fnRefs = [...CODE.matchAll(/FUNCTION\s+([\w.]+)\s*\(/gi)].map((m) => m[1]);
  assert.equal(fnRefs.length, 4);
  assert.deepEqual([...new Set(fnRefs)], ["public.process_question_attempt"]);
  assert.equal(/process_text_answer|update_streak|update_quest_progress|update_weekly_quest|review_answer|request_repeat_question|ALL\s+FUNCTIONS/i.test(CODE), false);
});

test("no table, RLS, policy, data or default-privilege change", () => {
  assert.equal(/\b(TABLE|POLICY|ROW\s+LEVEL\s+SECURITY|INSERT|UPDATE|DELETE|TRUNCATE|DEFAULT\s+PRIVILEGES|SCHEMA|VIEW|TRIGGER)\b/i.test(CODE), false);
});

test("the header explains why: SECURITY DEFINER, trusted p_student_id, process-event v31 as the only path", () => {
  for (const needle of ["SECURITY DEFINER", "p_student_id", "process-event", "v31", "secret-keys",
    "no CREATE OR REPLACE", "search_path = public, pg_temp"]) {
    assert.ok(SQL.includes(needle), `header mentions ${needle}`);
  }
});

test("this migration does not count as a (re)definition of process_question_attempt", () => {
  // The definition the reward and repeat guards pin stays 20261002000000's.
  const defining = readdirSync(join(REPO, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.process_question_attempt\s*\(/i
      .test(readFileSync(join(REPO, "supabase", "migrations", f), "utf8")));
  assert.equal(defining.includes(FILE), false);
  assert.equal(defining[defining.length - 1], "20261002000000_quiz_repeat_when_pool_exhausted.sql");
});

// ── The caller chain this lockdown relies on ────────────────────────────────────────────────────

const INDEX = readFileSync(join(REPO, "supabase/functions/process-event/index.ts"), "utf8");
const INDEX_CODE = INDEX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const RPC = readFileSync(join(REPO, "supabase/functions/process-event/text-answer-rpc.ts"), "utf8");

test("process-event calls process_question_attempt only through the admin helper", () => {
  assert.match(RPC, /const admin = makeAdminClient\(\);\s*return await admin\.rpc\("process_question_attempt",/);
  assert.match(INDEX_CODE, /await callProcessQuestionAttempt\(\s*makeAdminClient,/);
  assert.match(INDEX_CODE, /createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, serviceKey\(\), ADMIN_CLIENT_OPTIONS\)/);
  assert.equal(/\.rpc\(\s*["'`]process_question_attempt["'`]/.test(INDEX_CODE), false,
    "after the lockdown a user-client call would be denied");
});

test("p_student_id is the verified user.id, never a request field", () => {
  assert.match(RPC, /p_student_id: attempt\.studentId,/);
  assert.match(INDEX_CODE, /studentId:\s+user\.id,/);
  assert.equal(/body\??\.(student_id|p_student_id|studentId)/.test(INDEX_CODE), false);
});

test("the ownership check (403) runs before the RPC call", () => {
  const ownership = INDEX_CODE.indexOf("if (!isInstanceOwner(instanceData.student_id, user.id))");
  const call = INDEX_CODE.indexOf("await callProcessQuestionAttempt(");
  assert.ok(ownership > 0 && call > ownership);
  assert.match(INDEX_CODE.slice(ownership, call), /status: 403/);
});

test("no browser code or other Edge Function calls process_question_attempt", () => {
  const hits = [];
  const scan = (rel) => {
    const src = readFileSync(join(REPO, rel), "utf8");
    if (/["'`]process_question_attempt["'`]/.test(src)) hits.push(rel.replace(/\\/g, "/"));
  };
  const walk = (rel) => {
    for (const e of readdirSync(join(REPO, rel), { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (/\.(js|mjs|ts|html)$/.test(e.name)) scan(child);
    }
  };
  walk("js");
  walk("supabase/functions");
  for (const e of readdirSync(REPO, { withFileTypes: true })) {
    if (e.isFile() && /\.(js|mjs|html)$/.test(e.name)) scan(e.name);
  }
  assert.deepEqual(hits, ["supabase/functions/process-event/text-answer-rpc.ts"]);
});
