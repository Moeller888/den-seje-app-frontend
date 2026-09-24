// Contract guards for replacing the teacher_student_overview view with an authorising RPC.
// Offline, source-only: no network, no database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// public.teacher_student_overview was a view owned by postgres with no security_invoker, so it
// ran with owner rights and bypassed RLS on profiles, student_progress and auth.users. Its body
// had no teacher predicate, and SELECT was granted to anon. Measured on production: anon saw all
// 28 pupils, every one with an e-mail address.
//
// The replacement is a SECURITY DEFINER RPC that checks the caller's role server-side and returns
// only a pupil the caller is entitled to see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260926000000_teacher_student_overview_to_rpc.sql";
const CONSUMER = "js/student-detail.js";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// Assertions run against EXECUTABLE SQL. The comments quote the old view body verbatim and name
// the things this migration must not do, so reading the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// ── A model of the RPC's authorisation decision ──────────────────────────────
// Deliberately NOT the real function: the smallest faithful model of the decision sequence, so
// the difference between the view and the RPC shows as behaviour. Fictional world throughout.
const WORLD = {
  profiles: {
    "teacher-A": { role: "teacher" },
    "teacher-C": { role: "teacher" },
    "pupil-A1":  { role: "student", teacher_id: "teacher-A" },
    "pupil-C1":  { role: "student", teacher_id: "teacher-C" },
    "pupil-free":{ role: "student", teacher_id: null },
    "admin-1":   { role: "super_admin" },
  },
};
const ROW = { email: "<masked>", xp: 1, level: 1 };

// The OLD view: no caller predicate at all — every pupil row, for anyone who could read it.
function viewRows(_callerId) {
  return Object.entries(WORLD.profiles)
    .filter(([, p]) => p.role === "student")
    .map(([id]) => ({ student_id: id, ...ROW }));
}

// The NEW RPC.
function rpcRows(callerId, targetId) {
  if (!callerId) return [];                         // anon: auth.uid() IS NULL
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];                               // no profile row: unknown is not permission
  if (me.role !== "teacher" && me.role !== "super_admin") return [];
  const target = WORLD.profiles[targetId] ?? null;
  if (!target || target.role !== "student") return [];
  if (me.role !== "super_admin" && target.teacher_id !== callerId) return [];
  return [{ ...ROW }];
}

test("DEFECT: the view returned every pupil, with e-mail, to any reader", () => {
  assert.equal(viewRows("pupil-A1").length, 3, "a pupil saw every pupil");
  assert.equal(viewRows(null).length, 3, "and so did anon — the grant reached it");
  assert.ok(viewRows(null).every((r) => "email" in r), "including the e-mail column");
});

// (1) anon
test("anon receives no data", () => {
  assert.deepEqual(rpcRows(null, "pupil-A1"), []);
  // and is additionally blocked at the grant level — see the EXECUTE guards below.
});

// (2) pupil
test("an ordinary pupil receives no data, not even about themselves", () => {
  assert.deepEqual(rpcRows("pupil-A1", "pupil-A1"), []);
  assert.deepEqual(rpcRows("pupil-A1", "pupil-C1"), []);
});

// (3) teacher, own pupil
test("a teacher receives exactly their own pupil", () => {
  const rows = rpcRows("teacher-A", "pupil-A1");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["email", "level", "xp"]);
});

// (4) teacher, foreign pupil
test("a teacher receives nothing for another teacher's pupil", () => {
  assert.deepEqual(rpcRows("teacher-A", "pupil-C1"), []);
  assert.deepEqual(rpcRows("teacher-A", "pupil-free"), [],
    "a pupil with no teacher relation is nobody's to read");
});

// (5) super_admin
test("super_admin receives the requested pupil, whoever teaches them", () => {
  assert.equal(rpcRows("admin-1", "pupil-A1").length, 1);
  assert.equal(rpcRows("admin-1", "pupil-C1").length, 1);
});

// (6) unknown id — and no oracle
test("an unknown student_id yields zero rows, indistinguishable from a foreign pupil", () => {
  const unknown = rpcRows("teacher-A", "does-not-exist");
  const foreign = rpcRows("teacher-A", "pupil-C1");
  const notAPupil = rpcRows("teacher-A", "teacher-C");
  assert.deepEqual(unknown, []);
  assert.deepEqual(unknown, foreign,
    "identical results, or the endpoint tells a teacher which ids exist");
  assert.deepEqual(unknown, notAPupil);
});

// ── The migration itself ─────────────────────────────────────────────────────

// (8) the view is removed
test("the view is dropped, not merely restricted", () => {
  assert.match(stmts(), /DROP VIEW IF EXISTS public\.teacher_student_overview;/);
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?VIEW/i.test(stmts()),
    "no replacement view may be created");
});

// (9) only the needed columns
test("the RPC returns exactly email, xp and level", () => {
  const s = stmts();
  const at = s.indexOf("RETURNS TABLE");
  const block = s.slice(at, s.indexOf(")", at) + 1);
  assert.match(block, /email\s+text/);
  assert.match(block, /xp\s+integer/);
  assert.match(block, /level\s+integer/);
  for (const col of ["teacher_id", "mastery_level", "total_correct_answers", "student_id"]) {
    assert.ok(!new RegExp(`\\b${col}\\s+(uuid|integer|text)`).test(block),
      `${col} has no consumer and must not be returned`);
  }
});

// (7) EXECUTE is closed by default and opened narrowly
test("EXECUTE is revoked from PUBLIC and anon, and granted only to authenticated", () => {
  const s = stmts();
  assert.match(s, /REVOKE EXECUTE ON FUNCTION public\.get_student_overview\(uuid\) FROM PUBLIC;/);
  assert.match(s, /REVOKE EXECUTE ON FUNCTION public\.get_student_overview\(uuid\) FROM anon;/);
  assert.match(s, /GRANT\s+EXECUTE ON FUNCTION public\.get_student_overview\(uuid\) TO authenticated;/);
  assert.ok(!/GRANT[^;]*get_student_overview[^;]*TO\s+(anon|PUBLIC)/i.test(s),
    "anon and PUBLIC must never be granted EXECUTE");
  // service_role is deliberately not granted — no documented server-side consumer.
  assert.ok(!/GRANT[^;]*get_student_overview[^;]*TO\s+service_role/i.test(s),
    "service_role has no documented need; a grant without a need is what this series removes");
});

test("the function is SECURITY DEFINER with the project's pinned search_path", () => {
  const s = stmts();
  assert.match(s, /SECURITY DEFINER/);
  assert.match(s, /SET search_path = public, pg_temp/,
    "matches 20260919000000_review_answer_execute_lockdown.sql");
  assert.match(s, /\bSTABLE\b/, "the function only reads");
});

test("every table reference inside the function is schema-qualified", () => {
  const s = stmts();
  for (const t of ["public.profiles", "auth.users", "public.student_progress"]) {
    assert.ok(s.includes(t), `${t} must be referenced schema-qualified`);
  }
  // No bare references that search_path could redirect.
  assert.ok(!/\bFROM\s+profiles\b/.test(s));
  assert.ok(!/\bJOIN\s+users\b/.test(s));
  assert.ok(!/\bJOIN\s+student_progress\b/.test(s));
});

test("the role is read server-side from profiles, never from token metadata", () => {
  const s = stmts();
  assert.match(s, /SELECT p\.role INTO v_role\s*\n\s*FROM public\.profiles p\s*\n\s*WHERE p\.id = v_uid;/,
    "the role must be looked up by the verified auth.uid()");
  assert.match(s, /v_uid\s+uuid\s*:=\s*\(SELECT auth\.uid\(\)\)/);
  assert.ok(!/auth\.role\(\)/.test(s), "auth.role() must never authorise");
  assert.ok(!/user_metadata|raw_user_meta_data|jwt\(\)/i.test(s),
    "token metadata is caller-controlled and must never authorise");
});

test("the ownership predicate and the super_admin exemption are both explicit", () => {
  const s = stmts();
  assert.match(s, /v_role NOT IN \('teacher', 'super_admin'\)/,
    "only these two roles may proceed past the role gate");
  assert.match(s, /s\.teacher_id = v_uid/,
    "a teacher is scoped to the canonical profiles.teacher_id relation");
  assert.match(s, /v_role = 'super_admin'\s*\n\s*OR s\.teacher_id = v_uid/,
    "super_admin is exempted as a single visible decision");
  assert.match(s, /s\.role = 'student'/, "the target must actually be a pupil");
});

test("no RLS policy, table, index or data change", () => {
  const s = stmts();
  for (const stmt of ["CREATE POLICY", "DROP POLICY", "ALTER POLICY",
                      "ALTER TABLE", "CREATE TABLE", "DROP TABLE", "CREATE INDEX",
                      "INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
});

test("only the one function and the one view are touched", () => {
  const s = stmts();
  const fns = [...s.matchAll(/FUNCTION public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fns)], ["get_student_overview"]);
  const views = [...s.matchAll(/VIEW (?:IF EXISTS )?public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(views)], ["teacher_student_overview"]);
});

test("the migration sorts after every migration that touches teacher_student_overview", () => {
  // Originally scoped to "teacher_student_overview OR get_student_overview". The function is a
  // living object that later migrations may legitimately extend — 20260927000000 folds the
  // student_mastery_status fields into it — so including it made this guard assert "nothing has
  // touched the function since", which is not the property it names.
  // What must hold is that nothing re-creates the VIEW after it was dropped. That is scoped to
  // the view alone; the function's own contract is pinned by the tests above and by the
  // superseding migration's own suite.
  const dir = join(REPO, "supabase", "migrations");
  const executable = (body) => body
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => /teacher_student_overview/i.test(
      executable(readFileSync(join(dir, n), "utf8"))))
    .sort();
  assert.ok(touching.includes("20260926000000_teacher_student_overview_to_rpc.sql"));
  assert.equal(touching[touching.length - 1],
    "20260926000000_teacher_student_overview_to_rpc.sql",
    "it must apply last among the migrations touching the view");
});

test("no later migration recreates the view or re-opens EXECUTE", () => {
  const dir = join(REPO, "supabase", "migrations");
  const offenders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".sql") ||
        name === "20260926000000_teacher_student_overview_to_rpc.sql") continue;
    const body = readFileSync(join(dir, name), "utf8")
      .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
    if (/CREATE\s+(OR REPLACE\s+)?VIEW\s+public\.teacher_student_overview/i.test(body)) {
      offenders.push(`${name} (recreates the view)`);
    }
    if (/GRANT[^;]*get_student_overview[^;]*TO\s+(anon|PUBLIC)/i.test(body)) {
      offenders.push(`${name} (re-opens EXECUTE)`);
    }
    if (/GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+TO\s+(anon|public)/i.test(body)) {
      offenders.push(`${name} (blanket schema grant)`);
    }
  }
  assert.deepEqual(offenders, []);
});

// ── The consumer ─────────────────────────────────────────────────────────────

// (10) student-detail.js uses the RPC
test("student-detail.js calls the RPC and no longer reads the view", () => {
  const src = readFileSync(join(REPO, CONSUMER), "utf8");
  assert.match(src, /\.rpc\("get_student_overview", \{ p_student_id: studentId \}\)/,
    "it must call the RPC with the pupil id");
  assert.ok(!/\.from\("teacher_student_overview"\)/.test(src),
    "the view must no longer be queried");
});

test("the consumer treats the RPC result as a set, with a length check before indexing", () => {
  const src = readFileSync(join(REPO, CONSUMER), "utf8");
  assert.match(src,
    /Array\.isArray\(overviewRows\) && overviewRows\.length > 0 \? overviewRows\[0\] : null/,
    "arrays are not data — length must be checked before [0]");
  // The guard was "!overview || !mastery" while the page still made a second fetch to
  // student_mastery_status. 20260927000000 folded those fields into this RPC and removed that
  // fetch, so the second operand no longer exists. What must stay true is that a null overview —
  // which is what a foreign or unknown pupil yields — still short-circuits to the not-found path.
  assert.match(src, /if \(!overview\b[^)]*\) \{/,
    "the not-found guard must still cover a null overview");
});

test("no other file in the tree reads the view", () => {
  const SELF = "teacher-student-overview-rpc.test.mjs";   // this file names the string it hunts
  const needle = 'from("' + "teacher_student_overview" + '")';
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(REPO, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === SELF) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|ts|html)$/.test(e.name)) continue;
      if (readFileSync(join(REPO, p), "utf8").includes(needle)) offenders.push(p);
    }
  };
  ["js", "tests"].forEach(walk);
  for (const f of ["teacher.html", "student-detail.html", "admin.html", "hub.html", "app.js"]) {
    try {
      if (readFileSync(join(REPO, f), "utf8").includes(needle)) offenders.push(f);
    } catch { /* file may not exist */ }
  }
  assert.deepEqual(offenders, []);
});
