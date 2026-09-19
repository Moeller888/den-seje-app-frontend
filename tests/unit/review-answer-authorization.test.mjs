// Guards for the review_answer authorisation fix. Offline, source-only, no network, no database.
//
// THE DEFECT THESE GUARD AGAINST
// public.review_answer is SECURITY DEFINER, lives in the PostgREST-exposed `public` schema, and
// checks nothing about its caller: it reads no role, and it takes the teacher id as a PARAMETER.
// EXECUTE was held by PUBLIC, anon and authenticated, so a signed-in student could call
// /rest/v1/rpc/review_answer directly and grade any answer — the Edge Function's role check
// guards the function, not the database.
//
// Two layers now close that, and these tests hold both in place:
//   1. the Edge Function rejects a non-teacher before it writes anything;
//   2. the database grants direct EXECUTE to service_role alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

const EDGE = "supabase/functions/review-answer/index.ts";
const MIGRATION = "supabase/migrations/20260919000000_review_answer_execute_lockdown.sql";

// The two live signatures, taken from pg_proc on the production project.
const SIGNATURES = [
  "public.review_answer(uuid, integer, text, uuid)",
  "public.review_answer(uuid, integer, text)",
];

// ── Edge layer ───────────────────────────────────────────────────────────────

test("an unverified JWT is rejected with 401 before anything else happens", () => {
  const src = read(EDGE);
  const authAt = src.indexOf("await supabaseUser.auth.getUser()");
  const unauthorised = src.indexOf('status: 401');
  assert.ok(authAt !== -1, "the caller's JWT must be verified");
  assert.ok(unauthorised > authAt, "a failed verification must answer 401");
  assert.ok(
    unauthorised < src.indexOf('rpc("review_answer"'),
    "the 401 path must precede the RPC",
  );
});

test("the role is read server-side from the VERIFIED identity, never from the body", () => {
  const src = read(EDGE);
  assert.match(
    src,
    /\.from\("profiles"\)\s*\n\s*\.select\("role"\)\s*\n\s*\.eq\("id", user\.id\)/,
    "the role must be looked up by the id from the verified JWT",
  );
  // The body is destructured for instance_id/score/feedback only. A teacher id arriving from the
  // client must never be read at all — supplying your own authority is not authorisation.
  const destructured = src.match(/const \{([^}]*)\} = body;/);
  assert.ok(destructured, "the request body destructuring must be findable");
  assert.ok(
    !/teacher/i.test(destructured[1]),
    `no teacher identity may come from the request body, found: ${destructured[1].trim()}`,
  );
  assert.match(
    src,
    /p_teacher_id: user\.id/,
    "the teacher id sent to the RPC must be the verified user's own id",
  );
});

test("only teacher and super_admin pass; every other role and a missing profile get 403", () => {
  const src = read(EDGE);
  assert.match(
    src,
    /if \(!callerProfile \|\| \(callerProfile\.role !== "teacher" && callerProfile\.role !== "super_admin"\)\)/,
    "the allowed set must be exactly teacher and super_admin, and a missing profile must fail",
  );
  const guard = src.indexOf("!callerProfile ||");
  const forbidden = src.indexOf('status: 403', guard);
  assert.ok(forbidden > guard, "a disallowed role must answer 403");
});

test("a failed role lookup is an error, not a silent pass", () => {
  const src = read(EDGE);
  assert.match(
    src,
    /if \(callerProfileError\) \{[\s\S]{0,200}throw callerProfileError;/,
    "an unreadable role must throw rather than be treated as 'not a teacher' or as permission",
  );
});

test("NOTHING is read or written before the role check", () => {
  const src = read(EDGE);
  const roleCheck = src.indexOf('!callerProfile ||');
  assert.ok(roleCheck !== -1, "the role check must exist");

  // Every privileged operation must appear after the guard.
  for (const [label, needle] of [
    ["the instance lookup", '.from("question_instances")'],
    ["the RPC call", 'rpc("review_answer"'],
    ["the XP read", '.from("student_progress")'],
    ["the XP write", '.update({ xp:'],
  ]) {
    const at = src.indexOf(needle);
    assert.ok(at !== -1, `${label} must be present`);
    assert.ok(at > roleCheck, `${label} must come AFTER the role check, not before`);
  }
});

test("the role is read with the privileged client, so RLS cannot shape the answer", () => {
  const src = read(EDGE);
  const serviceClient = src.indexOf("serviceKey()");
  const roleLookup = src.indexOf('.select("role")');
  assert.ok(serviceClient !== -1 && roleLookup > serviceClient,
    "the role lookup must use the service client created above it");
});

test("the key migration and the observability wiring are preserved", () => {
  const src = read(EDGE);
  assert.match(src, /import \{ publishableKey, serviceKey \} from "\.\.\/_shared\/supabase-keys\.ts"/,
    "both resolver helpers must still be imported from the shared module");
  assert.ok(!/Deno\.env\.get\("SUPABASE_(ANON|SERVICE_ROLE)_KEY"\)/.test(src),
    "no direct legacy key read may be reintroduced");
  assert.match(src, /publishableKey\(\)/, "the user client must use the publishable resolver");
  assert.match(src, /serviceKey\(\)/, "the privileged client must use the secret resolver");
});

test("no JWT, key or secret is ever logged", () => {
  const src = read(EDGE);
  for (const m of src.matchAll(/console\.\w+\(([^;]*)\)/g)) {
    assert.ok(
      !/token|jwt|apikey|serviceKey\(|publishableKey\(|authHeader|Authorization/i.test(m[1]),
      `a log statement may not carry credential material: ${m[1].slice(0, 80)}`,
    );
  }
});

// ── Database layer ───────────────────────────────────────────────────────────

test("the migration revokes EXECUTE from PUBLIC, anon and authenticated on BOTH overloads", () => {
  const sql = read(MIGRATION);
  for (const sig of SIGNATURES) {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      const re = new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${sig.replace(/[().]/g, "\\$&")}\\s+FROM\\s+${role}\\s*;`,
        "i",
      );
      assert.match(sql, re, `EXECUTE must be revoked from ${role} on ${sig}`);
    }
  }
});

test("service_role is the only role granted EXECUTE", () => {
  const sql = read(MIGRATION);
  const grants = [...sql.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+[^;]*?\s+TO\s+(\w+)\s*;/gi)]
    .map((m) => m[1].toLowerCase());
  assert.deepEqual([...new Set(grants)], ["service_role"],
    "no role other than service_role may be granted direct EXECUTE");
  assert.equal(grants.length, SIGNATURES.length, "each overload must be granted exactly once");
});

test("both live signatures are named explicitly — no name-only wildcard", () => {
  const sql = read(MIGRATION);
  for (const sig of SIGNATURES) {
    assert.ok(sql.includes(sig), `the exact signature ${sig} must appear`);
  }
  // A bare `ON FUNCTION public.review_answer FROM ...` would be ambiguous with two overloads.
  assert.ok(
    !/ON\s+FUNCTION\s+public\.review_answer\s+(FROM|TO)/i.test(sql),
    "a signature-less reference would be ambiguous while two overloads exist",
  );
});

test("the SECURITY DEFINER search_path is pinned on both overloads", () => {
  const sql = read(MIGRATION);
  for (const sig of SIGNATURES) {
    const re = new RegExp(
      `ALTER\\s+FUNCTION\\s+${sig.replace(/[().]/g, "\\$&")}\\s+SET\\s+search_path\\s*=\\s*public,\\s*pg_temp\\s*;`,
      "i",
    );
    assert.match(sql, re, `search_path must be pinned on ${sig}`);
  }
});

test("the migration changes no grading or XP logic", () => {
  const sql = read(MIGRATION);
  assert.ok(!/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(sql),
    "this migration must not redefine the function body");
  for (const forbidden of ["UPDATE ", "INSERT ", "DELETE ", "DROP "]) {
    assert.ok(!new RegExp(`^\\s*${forbidden}`, "im").test(sql),
      `the migration must not contain a ${forbidden.trim()} statement`);
  }
});

test("no later migration re-opens EXECUTE on review_answer", () => {
  const dir = join(REPO, "supabase", "migrations");
  const offenders = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".sql") || name === "20260919000000_review_answer_execute_lockdown.sql") continue;
    const sql = readFileSync(join(dir, name), "utf8");
    if (/GRANT\s+EXECUTE[^;]*review_answer[^;]*TO\s+(anon|authenticated|public)/i.test(sql)) {
      offenders.push(name);
    }
    // A blanket grant across the schema would silently undo the lockdown too.
    if (/GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+TO\s+(anon|authenticated|public)/i.test(sql)) {
      offenders.push(`${name} (blanket schema grant)`);
    }
  }
  assert.deepEqual(offenders, [],
    "a later migration must not re-open direct EXECUTE, individually or via a blanket grant");
});

test("the lockdown migration sorts after every migration that exists today", () => {
  const dir = join(REPO, "supabase", "migrations");
  const timestamped = readdirSync(dir).filter((n) => /^\d{14}_.*\.sql$/.test(n)).sort();
  assert.equal(
    timestamped[timestamped.length - 1],
    "20260919000000_review_answer_execute_lockdown.sql",
    "the lockdown must apply last, so nothing already in the tree can override it",
  );
});
