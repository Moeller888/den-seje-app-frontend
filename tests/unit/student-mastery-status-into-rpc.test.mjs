// Contract guards for folding student_mastery_status into get_student_overview and removing the
// view. Offline, source-only: no network, no database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// public.student_mastery_status was a view owned by postgres with no security_invoker, so it ran
// with owner rights and bypassed RLS on public.student_progress. It had no teacher predicate and
// SELECT was granted to anon. Measured on production, the contrast with the base table is the
// proof: anon saw 28 rows; an ordinary pupil saw 28 through the view but 1 through the table; a
// teacher saw 28 through the view but 0 through the table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260927000000_student_mastery_status_into_rpc.sql";
const PRIOR = "supabase/migrations/20260926000000_teacher_student_overview_to_rpc.sql";
const CONSUMER = "js/student-detail.js";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// Assertions run against EXECUTABLE SQL. The comments quote the old view body verbatim and name
// the things this migration must not do, so reading the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// ── A model of the authorisation decision, unchanged by this migration ───────
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
const ROW = { email: "<masked>", xp: 1, level: 1,
              correct_ratio: 0, total_correct_answers: 0, total_attempts: 0 };

// The OLD view: no caller predicate at all — every pupil's statistics, for anyone who could read.
const viewRows = () => Object.entries(WORLD.profiles)
  .filter(([, p]) => p.role === "student")
  .map(([id]) => ({ student_id: id, mastery_level: 1, correct_ratio: 0 }));

function rpcRows(callerId, targetId) {
  if (!callerId) return [];
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];
  if (me.role !== "teacher" && me.role !== "super_admin") return [];
  const target = WORLD.profiles[targetId] ?? null;
  if (!target || target.role !== "student") return [];
  if (me.role !== "super_admin" && target.teacher_id !== callerId) return [];
  return [{ ...ROW }];
}

test("DEFECT: the view returned every pupil's statistics to any reader", () => {
  assert.equal(viewRows().length, 3);
  assert.ok(viewRows().every((r) => "correct_ratio" in r && "mastery_level" in r));
});

test("anon receives no data", () => {
  assert.deepEqual(rpcRows(null, "pupil-A1"), []);
});

test("an ordinary pupil receives no data, not even about themselves", () => {
  assert.deepEqual(rpcRows("pupil-A1", "pupil-A1"), []);
  assert.deepEqual(rpcRows("pupil-A1", "pupil-C1"), []);
});

test("a teacher receives exactly their own pupil, with all six fields", () => {
  const rows = rpcRows("teacher-A", "pupil-A1");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(),
    ["correct_ratio", "email", "level", "total_attempts", "total_correct_answers", "xp"]);
});

test("a teacher receives nothing for another teacher's pupil or an unattached pupil", () => {
  assert.deepEqual(rpcRows("teacher-A", "pupil-C1"), []);
  assert.deepEqual(rpcRows("teacher-A", "pupil-free"), []);
});

test("super_admin receives the requested pupil, whoever teaches them", () => {
  assert.equal(rpcRows("admin-1", "pupil-A1").length, 1);
  assert.equal(rpcRows("admin-1", "pupil-C1").length, 1);
});

test("an unknown student_id yields zero rows, indistinguishable from a foreign pupil", () => {
  const unknown = rpcRows("teacher-A", "does-not-exist");
  assert.deepEqual(unknown, rpcRows("teacher-A", "pupil-C1"));
  assert.deepEqual(unknown, rpcRows("teacher-A", "teacher-C"));
});

// ── The migration itself ─────────────────────────────────────────────────────

test("the view is dropped, not merely restricted, and no view is created", () => {
  assert.match(stmts(), /DROP VIEW IF EXISTS public\.student_mastery_status;/);
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?VIEW/i.test(stmts()));
});

test("the function is DROPped before being created — the return type changes", () => {
  const s = stmts();
  const dropAt = s.indexOf("DROP FUNCTION IF EXISTS public.get_student_overview(uuid);");
  const createAt = s.indexOf("CREATE FUNCTION public.get_student_overview(p_student_id uuid)");
  assert.ok(dropAt !== -1, "CREATE OR REPLACE cannot change a RETURNS TABLE signature");
  assert.ok(createAt !== -1, "the function must be recreated in the same migration");
  assert.ok(dropAt < createAt, "the drop must precede the create");
  assert.ok(!/CREATE OR REPLACE FUNCTION public\.get_student_overview/.test(s),
    "CREATE OR REPLACE would fail with 'cannot change return type of existing function'");
});

test("the RPC returns exactly the six fields the page renders", () => {
  const s = stmts();
  const at = s.indexOf("RETURNS TABLE");
  const block = s.slice(at, s.indexOf(")", s.indexOf("total_attempts", at)) + 1);
  for (const [col, type] of [["email", "text"], ["xp", "integer"], ["level", "integer"],
                             ["correct_ratio", "numeric"],
                             ["total_correct_answers", "integer"],
                             ["total_attempts", "integer"]]) {
    assert.match(block, new RegExp(`${col}\\s+${type}`), `${col} ${type} must be returned`);
  }
  // the five view columns with no consumer must not be carried over
  for (const col of ["mastery_level", "mastery_balance", "correct_answers",
                     "distance_up", "distance_down", "student_id"]) {
    assert.ok(!new RegExp(`\\b${col}\\s+(uuid|integer|numeric|text)\\b`).test(block),
      `${col} has no consumer and must not be returned`);
  }
});

test("correct_ratio keeps the view's zero-attempt guard", () => {
  const s = stmts();
  assert.match(s, /WHEN COALESCE\(sp\.total_attempts, 0\) > 0/,
    "a zero-attempt pupil must not divide by zero");
  assert.match(s, /ELSE 0::numeric/);
  assert.match(s, /\* 100::numeric, 1\)/, "the view rounded to one decimal; keep it");
});

test("the authorisation logic is unchanged from the prior migration", () => {
  const s = stmts();
  assert.match(s, /v_uid\s+uuid\s*:=\s*\(SELECT auth\.uid\(\)\)/);
  assert.match(s, /SELECT p\.role INTO v_role\s*\n\s*FROM public\.profiles p\s*\n\s*WHERE p\.id = v_uid;/);
  assert.match(s, /v_role NOT IN \('teacher', 'super_admin'\)/);
  assert.match(s, /s\.teacher_id = v_uid/);
  assert.match(s, /v_role = 'super_admin'\s*\n\s*OR s\.teacher_id = v_uid/);
  assert.match(s, /s\.role = 'student'/);
  assert.ok(!/auth\.role\(\)/.test(s), "auth.role() must never authorise");
  assert.ok(!/user_metadata|raw_user_meta_data|jwt\(\)/i.test(s),
    "token metadata is caller-controlled and must never authorise");
});

test("SECURITY DEFINER, STABLE, pinned search_path, schema-qualified references", () => {
  const s = stmts();
  assert.match(s, /SECURITY DEFINER/);
  assert.match(s, /\bSTABLE\b/);
  assert.match(s, /SET search_path = public, pg_temp/);
  for (const t of ["public.profiles", "auth.users", "public.student_progress"]) {
    assert.ok(s.includes(t), `${t} must be referenced schema-qualified`);
  }
  assert.ok(!/\bFROM\s+student_progress\b/.test(s));
  assert.ok(!/\bJOIN\s+users\b/.test(s));
});

test("EXECUTE is re-established after the DROP and opened only to authenticated", () => {
  const s = stmts();
  assert.match(s, /REVOKE EXECUTE ON FUNCTION public\.get_student_overview\(uuid\) FROM PUBLIC;/);
  assert.match(s, /REVOKE EXECUTE ON FUNCTION public\.get_student_overview\(uuid\) FROM anon;/);
  assert.match(s, /GRANT\s+EXECUTE ON FUNCTION public\.get_student_overview\(uuid\) TO authenticated;/);
  assert.ok(!/GRANT[^;]*get_student_overview[^;]*TO\s+(anon|PUBLIC)/i.test(s));
  // A DROP discards the old ACL, so the revokes are load-bearing, not decorative.
  const dropAt = s.indexOf("DROP FUNCTION");
  const revokeAt = s.indexOf("REVOKE EXECUTE");
  assert.ok(revokeAt > dropAt, "the grants must be re-applied after the function is recreated");
});

test("no RLS policy, table, index or data change", () => {
  const s = stmts();
  for (const stmt of ["CREATE POLICY", "DROP POLICY", "ALTER POLICY", "ALTER TABLE",
                      "CREATE TABLE", "DROP TABLE", "CREATE INDEX",
                      "INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
});

test("only the one function and the one view are touched", () => {
  const s = stmts();
  const fns = [...s.matchAll(/FUNCTION public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fns)], ["get_student_overview"]);
  const views = [...s.matchAll(/VIEW (?:IF EXISTS )?public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(views)], ["student_mastery_status"]);
});

test("the migration sorts after every migration that touches either object", () => {
  const dir = join(REPO, "supabase", "migrations");
  const executable = (body) => body
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => /student_mastery_status|get_student_overview/i.test(
      executable(readFileSync(join(dir, n), "utf8"))))
    .sort();
  assert.ok(touching.includes("20260927000000_student_mastery_status_into_rpc.sql"));
  assert.equal(touching[touching.length - 1],
    "20260927000000_student_mastery_status_into_rpc.sql",
    "it must apply last among them");
  assert.ok(touching.includes("20260926000000_teacher_student_overview_to_rpc.sql"),
    "the prior migration also touches the function and must sort before this one");
});

test("no later migration recreates the view or re-opens EXECUTE", () => {
  const dir = join(REPO, "supabase", "migrations");
  const offenders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".sql") ||
        name === "20260927000000_student_mastery_status_into_rpc.sql") continue;
    const body = readFileSync(join(dir, name), "utf8")
      .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
    if (/CREATE\s+(OR REPLACE\s+)?VIEW\s+public\.student_mastery_status/i.test(body)) {
      offenders.push(`${name} (recreates the view)`);
    }
    if (/GRANT[^;]*get_student_overview[^;]*TO\s+(anon|PUBLIC)/i.test(body)) {
      offenders.push(`${name} (re-opens EXECUTE)`);
    }
  }
  assert.deepEqual(offenders, []);
});

// ── The consumer ─────────────────────────────────────────────────────────────

test("student-detail.js reads everything through the one RPC", () => {
  const src = readFileSync(join(REPO, CONSUMER), "utf8");
  assert.match(src, /\.rpc\("get_student_overview", \{ p_student_id: studentId \}\)/);
  assert.ok(!/\.from\("student_mastery_status"\)/.test(src),
    "the removed view must no longer be queried");
  assert.ok(!/\.from\("teacher_student_overview"\)/.test(src),
    "the previously removed view must not come back either");
});

test("the mastery fields are rendered from the RPC row, not a second object", () => {
  const src = readFileSync(join(REPO, CONSUMER), "utf8");
  for (const f of ["correct_ratio", "total_correct_answers", "total_attempts"]) {
    assert.match(src, new RegExp(`\\$\\{student\\.${f} \\?\\? 0\\}`),
      `${f} must render from the RPC row with its zero fallback intact`);
  }
  assert.ok(!/mastery\.\w+/.test(src), "no separate mastery object may remain");
});

test("renderStudent's signature and call site agree", () => {
  const src = readFileSync(join(REPO, CONSUMER), "utf8");
  assert.match(src, /function renderStudent\(student, profileData\)/);
  assert.match(src, /renderStudent\(overview, profileData \?\? \{\}\)/);
});

test("the not-found guard still covers a null overview", () => {
  const src = readFileSync(join(REPO, CONSUMER), "utf8");
  assert.match(src, /if \(!overview\) \{/,
    "the guard must no longer depend on a second fetch that no longer happens");
  assert.match(src,
    /Array\.isArray\(overviewRows\) && overviewRows\.length > 0 \? overviewRows\[0\] : null/,
    "arrays are not data — length must be checked before [0]");
});

test("no other file in the tree reads the removed view", () => {
  const SELF = "student-mastery-status-into-rpc.test.mjs";   // this file names the string it hunts
  const needle = 'from("' + "student_mastery_status" + '")';
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

test("the prior migration's RPC contract is superseded, not contradicted", () => {
  // The earlier file still contains the three-column version; that is history, not a conflict,
  // because this migration sorts after it. Guard that it was not edited in place.
  const prior = readFileSync(join(REPO, PRIOR), "utf8");
  assert.match(prior, /RETURNS TABLE \(\s*\n\s*email\s+text,\s*\n\s*xp\s+integer,\s*\n\s*level\s+integer\s*\n\s*\)/,
    "the applied migration must stay byte-stable; supersede it with a new file instead");
});
