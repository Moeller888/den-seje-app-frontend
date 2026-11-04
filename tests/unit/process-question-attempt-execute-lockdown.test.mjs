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
  // The lockdown still changes no body. The reviewed spelling migration is now the latest
  // definition; its runtime suite pins the old reward body and proves preserved EXECUTE grants.
  // D-211 then re-creates it with only the repeat award changed (1 coin + 2 XP); its runtime suite
  // (repeat-answer-coin-reward-migration-run) proves EXECUTE stays service_role only, not PUBLIC.
  // D-280 (20261031194600, reviewed) re-creates it with only the alias count changed (two or more);
  // the test below pins its header, and its runtime suite (mc-length-cue-top10-migration-run) proves
  // owner, EXECUTE, SECURITY DEFINER, search_path and return type unchanged.
  const defining = readdirSync(join(REPO, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.process_question_attempt\s*\(/i
      .test(readFileSync(join(REPO, "supabase", "migrations", f), "utf8")));
  assert.equal(defining.includes(FILE), false);
  assert.deepEqual(defining.filter(f => f > "20261002000000_quiz_repeat_when_pool_exhausted.sql"),
    ["20261018143726_fix_danish_question_bank_text.sql",
     "20261027120000_repeat_answer_coin_reward.sql",
     "20261031194600_mc_length_cue_answer_paths.sql",
     "20261101150000_grading_meaningful_characters.sql"]);
});

test("D-290 G1's redefinition keeps the locked-down shape: signature, SECURITY DEFINER, search_path, owner, EXECUTE", () => {
  // D-290 G1 (20261101150000, reviewed) re-creates it from D-280's body with only the grading lines
  // changed; its runtime suite (grading-meaningful-characters-migration-run) proves rewards, metadata
  // and EXECUTE unchanged. Its two new helpers get REVOKE ALL; process_question_attempt itself none.
  const g1 = readFileSync(join(REPO, "supabase", "migrations", "20261101150000_grading_meaningful_characters.sql"), "utf8");
  const code = g1.replace(/--.*$/gm, "");
  const creates = [...code.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_question_attempt\s*\(/gi)];
  assert.equal(creates.length, 1, "exactly one redefinition");
  const header = code.slice(creates[0].index, code.indexOf("AS $function$", creates[0].index));
  assert.equal(header.replace(/\s+/g, " ").trim(),
    "CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, " +
    "p_answer text, p_question_shown_at bigint) RETURNS json LANGUAGE plpgsql SECURITY DEFINER " +
    "SET search_path TO 'public', 'pg_temp'");
  assert.equal(/OWNER\s+TO|ALTER\s+FUNCTION/i.test(code), false, "owner unchanged");
  assert.equal(/\b(GRANT|REVOKE)\b[^;]*process_question_attempt/i.test(code), false, "EXECUTE unchanged (service_role only)");
});

test("D-280's redefinition keeps the locked-down shape: signature, SECURITY DEFINER, search_path, owner, EXECUTE", () => {
  const d280 = readFileSync(join(REPO, "supabase", "migrations", "20261031194600_mc_length_cue_answer_paths.sql"), "utf8");
  const code = d280.replace(/--.*$/gm, "");
  const creates = [...code.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_question_attempt\s*\(/gi)];
  assert.equal(creates.length, 1, "exactly one redefinition");
  const header = code.slice(creates[0].index, code.indexOf("AS $function$", creates[0].index));
  assert.equal(header.replace(/\s+/g, " ").trim(),
    "CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, " +
    "p_answer text, p_question_shown_at bigint) RETURNS json LANGUAGE plpgsql SECURITY DEFINER " +
    "SET search_path TO 'public', 'pg_temp'");
  // CREATE OR REPLACE keeps owner and EXECUTE; nothing in the file may change either.
  assert.equal(/OWNER\s+TO|ALTER\s+FUNCTION/i.test(code), false, "owner unchanged");
  assert.equal(/\b(GRANT|REVOKE)\b[^;]*process_question_attempt/i.test(code), false, "EXECUTE unchanged (service_role only)");
  assert.equal(/SECURITY\s+INVOKER/i.test(header), false);
  assert.equal(/DROP\s+FUNCTION/i.test(code), false, "a DROP would reset owner and grants");
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
