// Security: the D-110 migration that closes direct EXECUTE on public.process_text_answer.
//
// The Edge half (process-event v30, PR #290) already calls this RPC only through a backend client.
// This migration removes the direct client path. These tests pin that the file does exactly that and
// nothing else: four privilege statements and one search_path property on ONE signature, no body
// change, no other function, no table or RLS change. Pattern: 20260919000000_review_answer_execute_lockdown.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20261003153220_process_text_answer_execute_lockdown.sql";
const SQL = readFileSync(join(REPO, MIGRATION), "utf8");

// The executable SQL only: comments removed, whitespace collapsed, one statement per entry.
const CODE = SQL.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
const STATEMENTS = CODE.split(";").map((s) => s.trim()).filter(Boolean);

const SIG = "public.process_text_answer(uuid, uuid, text, boolean)";
const ON_FN = `ON FUNCTION ${SIG}`;

test("the migration file exists under the CLI-generated name and sorts after the last live migration", () => {
  const files = readdirSync(join(REPO, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes("20261003153220_process_text_answer_execute_lockdown.sql"));
  assert.ok("20261003153220" > "20261002114647", "after the newest remote version");
});

test("exactly five statements, in the agreed order", () => {
  assert.deepEqual(STATEMENTS, [
    `REVOKE EXECUTE ${ON_FN} FROM PUBLIC`,
    `REVOKE EXECUTE ${ON_FN} FROM anon`,
    `REVOKE EXECUTE ${ON_FN} FROM authenticated`,
    `GRANT EXECUTE ${ON_FN} TO service_role`,
    `ALTER FUNCTION ${SIG} SET search_path = public, pg_temp`,
  ]);
});

test("every statement targets the full four-argument signature", () => {
  for (const s of STATEMENTS) assert.ok(s.includes(SIG), s);
  // A name-only REVOKE would silently miss a future overload.
  assert.equal(CODE.split(SIG).join("").includes("process_text_answer"), false);
});

test("EXECUTE is revoked from PUBLIC, anon and authenticated", () => {
  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert.ok(STATEMENTS.includes(`REVOKE EXECUTE ${ON_FN} FROM ${role}`), role);
  }
});

test("EXECUTE is granted to service_role and to nobody else", () => {
  const grants = STATEMENTS.filter((s) => /^GRANT\b/i.test(s));
  assert.deepEqual(grants, [`GRANT EXECUTE ${ON_FN} TO service_role`]);
});

test("search_path is pinned to public, pg_temp", () => {
  assert.ok(STATEMENTS.includes(`ALTER FUNCTION ${SIG} SET search_path = public, pg_temp`));
});

test("the function body is not touched", () => {
  assert.equal(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(CODE), false);
  assert.equal(/\$\$|\$function\$|LANGUAGE\s+plpgsql|\bRETURNS\b|\bBEGIN\b/i.test(CODE), false);
  assert.equal(/DROP\s+FUNCTION/i.test(CODE), false);
  // The only ALTER FUNCTION sets search_path — no SECURITY, OWNER or RENAME change.
  const alters = STATEMENTS.filter((s) => /^ALTER\s+FUNCTION/i.test(s));
  assert.equal(alters.length, 1);
  assert.equal(/SECURITY|OWNER\s+TO|RENAME/i.test(alters[0]), false);
});

test("no other function is granted, revoked or altered", () => {
  const fnRefs = [...CODE.matchAll(/FUNCTION\s+([\w.]+)\s*\(/gi)].map((m) => m[1]);
  assert.ok(fnRefs.length > 0);
  assert.deepEqual([...new Set(fnRefs)], ["public.process_text_answer"]);
  assert.equal(/process_question_attempt|review_answer|request_repeat_question|ALL\s+FUNCTIONS/i.test(CODE), false);
});

test("no table, RLS, policy, data or default-privilege change", () => {
  assert.equal(/\b(TABLE|POLICY|ROW\s+LEVEL\s+SECURITY|INSERT|UPDATE|DELETE|TRUNCATE|DEFAULT\s+PRIVILEGES|SCHEMA|VIEW|TRIGGER)\b/i.test(CODE), false);
});

test("the header explains why: SECURITY DEFINER, trusted parameters, process-event as the only path", () => {
  for (const needle of ["SECURITY DEFINER", "p_user_id", "p_is_correct", "process-event", "secret-keys", "no CREATE OR REPLACE"]) {
    assert.ok(SQL.includes(needle), `header mentions ${needle}`);
  }
});

test("the Edge half this migration depends on is in the repo", () => {
  const rpc = readFileSync(join(REPO, "supabase/functions/process-event/text-answer-rpc.ts"), "utf8");
  const index = readFileSync(join(REPO, "supabase/functions/process-event/index.ts"), "utf8");
  assert.match(rpc, /admin\.rpc\("process_text_answer",/);
  assert.match(index, /createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, serviceKey\(\), ADMIN_CLIENT_OPTIONS\)/);
  assert.equal(/supabase\s*\.rpc\(\s*["']process_text_answer["']/.test(index), false,
    "after the lockdown a user-client call would be denied");
});
