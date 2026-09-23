// Contract guards for the read scope on student_weekly_quest_progress. Offline, source-only:
// no network, no database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// "weekly_progress_select_teacher" used a USING expression that never referenced the row:
//     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher','super_admin'))
// A predicate about the CALLER rather than the ROW is TRUE for every row, so any teacher could
// read every pupil's weekly quest progress across every class. Same defect class as the ones
// already closed on question_instances and teacher_spotlights.
//
// The pupil's own read is KEPT — hub.html reads this table directly — and super_admin's access is
// preserved deliberately, on owner instruction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260925000000_weekly_quest_progress_read_scope.sql";
const ORIGIN = "supabase/migrations/20260524000000_weekly_quests.sql";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// Assertions run against EXECUTABLE SQL. The comments quote the old predicate verbatim and name
// the policies this file must not touch, so reading the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// ── A model of the two policy sets ───────────────────────────────────────────
// Fictional world: no real ids, no real progress values.
const WORLD = {
  profiles: {
    "teacher-A": { role: "teacher" },
    "teacher-C": { role: "teacher" },
    "pupil-A1":  { role: "student", teacher_id: "teacher-A" },
    "pupil-C1":  { role: "student", teacher_id: "teacher-C" },
    "admin-1":   { role: "super_admin" },
  },
  // PRIMARY KEY (student_id, quest_id, week_key)
  rows: [
    { student_id: "pupil-A1", quest_id: "q1", week_key: "2026-21" },
    { student_id: "pupil-A1", quest_id: "q2", week_key: "2026-21" },
    { student_id: "pupil-C1", quest_id: "q1", week_key: "2026-21" },
  ],
};
const key = (r) => `${r.student_id}/${r.quest_id}/${r.week_key}`;

// BEFORE: own-row OR (caller is any teacher/super_admin).
function visibleBefore(callerId) {
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];
  if (me.role === "teacher" || me.role === "super_admin") return WORLD.rows;  // row-independent
  return WORLD.rows.filter((r) => r.student_id === callerId);
}

// AFTER: own-row, or super_admin. Teachers get nothing.
function visibleAfter(callerId) {
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];
  if (me.role === "super_admin") return WORLD.rows;
  return WORLD.rows.filter((r) => r.student_id === callerId);
}

test("DEFECT: the old teacher predicate exposed every pupil's progress to any teacher", () => {
  const before = visibleBefore("teacher-C").map(key).sort();
  assert.deepEqual(before,
    ["pupil-A1/q1/2026-21", "pupil-A1/q2/2026-21", "pupil-C1/q1/2026-21"],
    "a caller-only predicate is TRUE for every row — that is the exposure");
  assert.deepEqual(visibleAfter("teacher-C"), [],
    "no teacher surface reads this table, so teachers get nothing");
});

test("a pupil still reads their own rows — hub.html depends on this", () => {
  assert.deepEqual(visibleAfter("pupil-A1").map(key).sort(),
    ["pupil-A1/q1/2026-21", "pupil-A1/q2/2026-21"]);
});

test("a pupil cannot read another pupil's rows", () => {
  assert.ok(!visibleAfter("pupil-A1").some((r) => r.student_id !== "pupil-A1"));
});

test("a teacher gets nothing, including for their own pupil", () => {
  assert.deepEqual(visibleAfter("teacher-A"), [],
    "teacher-A owns pupil-A1, and still gets no direct read");
});

test("another teacher gets nothing", () => {
  assert.deepEqual(visibleAfter("teacher-C"), []);
});

test("super_admin keeps the access it has today", () => {
  assert.equal(visibleAfter("admin-1").length, WORLD.rows.length);
  assert.equal(visibleBefore("admin-1").length, visibleAfter("admin-1").length,
    "super_admin's breadth is unchanged by this migration");
});

test("anon sees nothing, before and after", () => {
  assert.deepEqual(visibleBefore(null), []);
  assert.deepEqual(visibleAfter(null), []);
  assert.deepEqual(visibleAfter("nobody"), []);
});

// ── The migration itself ─────────────────────────────────────────────────────

test("the blanket teacher policy is dropped", () => {
  assert.match(stmts(),
    /DROP POLICY IF EXISTS "weekly_progress_select_teacher"\s*\n?\s*ON public\.student_weekly_quest_progress;/);
});

test("exactly one policy is created, and it is the super_admin one", () => {
  const created = [...stmts().matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(created, ["super_admins read all weekly quest progress"],
    "no teacher policy may be recreated in any form");
});

test("no teacher policy is created under any name", () => {
  const s = stmts();
  assert.ok(!/CREATE POLICY[^;]*'teacher'/i.test(s),
    "a teacher role test must not reappear");
  assert.ok(!/role\s+IN\s*\(\s*'teacher'/i.test(s));
  assert.ok(!/ARRAY\['teacher'/i.test(s));
});

test("the pupil's own read and both write policies are left untouched", () => {
  const s = stmts();
  for (const name of ["weekly_progress_select_own",
                      "weekly_progress_insert_own",
                      "weekly_progress_update_own"]) {
    assert.ok(!s.includes(name),
      `${name} must not be dropped, recreated or otherwise mentioned in executable SQL`);
  }
});

test("the created policy is SELECT-only, targets authenticated, never anon or PUBLIC", () => {
  const s = stmts();
  const at = s.indexOf('CREATE POLICY "super_admins read all weekly quest progress"');
  const block = s.slice(at, at + 500);
  assert.match(block, /\n\s*FOR SELECT\n/);
  assert.match(block, /\n\s*TO authenticated\n/);
  assert.ok(!/TO PUBLIC/i.test(s));
  assert.ok(!/TO anon/i.test(s));
});

test("the super_admin role is read server-side from profiles, never from the token", () => {
  const s = stmts();
  assert.match(s,
    /EXISTS \(\s*SELECT 1\s*FROM public\.profiles p\s*WHERE p\.id = \(SELECT auth\.uid\(\)\)\s*AND p\.role = 'super_admin'/,
    "it must pin the caller's own profile row and the super_admin role together");
  assert.ok(!/auth\.role\(\)/.test(s), "auth.role() must never authorise");
  assert.ok(!/user_metadata|raw_user_meta_data|jwt\(\)/i.test(s),
    "token metadata is caller-controlled and must never authorise");
});

test("auth.uid() is wrapped so it is evaluated once, not per row", () => {
  const s = stmts();
  const bare = [...s.matchAll(/auth\.uid\(\)/g)]
    .filter((m) => !/select\s*$/i.test(s.slice(Math.max(0, m.index - 8), m.index)));
  assert.equal(bare.length, 0, "every auth.uid() must be (SELECT auth.uid())");
});

test("no SECURITY DEFINER, helper function, view, grant, write policy or data change", () => {
  const s = stmts();
  assert.ok(!/SECURITY\s+DEFINER/i.test(s));
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?FUNCTION/i.test(s));
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?VIEW/i.test(s));
  for (const cmd of ["FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL"]) {
    assert.ok(!s.includes(cmd), `the migration must not create a ${cmd} policy`);
  }
  for (const stmt of ["GRANT ", "REVOKE ", "ALTER TABLE", "CREATE TABLE", "DROP TABLE",
                      "CREATE INDEX", "INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
});

test("only student_weekly_quest_progress policies are affected", () => {
  const s = stmts();
  const targets = [...s.matchAll(/ON public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(targets)], ["student_weekly_quest_progress"]);
  assert.ok(!/ON public\.profiles/.test(s), "profiles must not be altered here");
});

test("the migration is re-runnable", () => {
  const s = stmts();
  assert.equal((s.match(/CREATE POLICY/g) ?? []).length, 1);
  assert.equal((s.match(/DROP POLICY IF EXISTS/g) ?? []).length, 2,
    "the old teacher policy and the new super_admin policy are each dropped IF EXISTS");
});

test("the migration sorts after every migration that touches this table", () => {
  // Deliberately NOT "last file in the directory": that would encode "nothing has been added
  // since" and break on the next unrelated migration. "Touches" means in executable SQL.
  const dir = join(REPO, "supabase", "migrations");
  const executable = (body) => body
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => /student_weekly_quest_progress/i.test(
      executable(readFileSync(join(dir, n), "utf8"))))
    .sort();
  assert.ok(touching.includes("20260925000000_weekly_quest_progress_read_scope.sql"));
  assert.equal(touching[touching.length - 1],
    "20260925000000_weekly_quest_progress_read_scope.sql",
    "it must apply last among them, so nothing in the tree can re-broaden the scope");
});

test("no later migration re-broadens the read scope", () => {
  const dir = join(REPO, "supabase", "migrations");
  const offenders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".sql") ||
        name === "20260925000000_weekly_quest_progress_read_scope.sql") continue;
    const body = readFileSync(join(dir, name), "utf8")
      .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
    if (/CREATE POLICY[\s\S]{0,400}ON public\.student_weekly_quest_progress[\s\S]{0,200}FOR SELECT/i
        .test(body)) offenders.push(name);
  }
  assert.deepEqual(offenders, ["20260524000000_weekly_quests.sql"],
    "only the original weekly-quests migration may also create a SELECT policy on this table");
});

// ── The callers must stay compatible ─────────────────────────────────────────

test("hub.html reads only the pupil's own week, so the kept policy still covers it", () => {
  const hub = readFileSync(join(REPO, "hub.html"), "utf8");
  const at = hub.indexOf('from("student_weekly_quest_progress")');
  assert.ok(at !== -1, "hub.html must still be the direct reader");
  const call = hub.slice(at, at + 220);
  assert.match(call, /\.eq\("student_id", userId\)/,
    "it must scope to the signed-in pupil, which weekly_progress_select_own allows");
  assert.match(call, /\.eq\("week_key", currentWeekKey\)/);
});

test("no teacher or admin surface reads this table directly", () => {
  // Load-bearing: after this migration a teacher's direct query returns nothing. If this ever
  // fails, that caller must move to a SECURITY DEFINER RPC — not the policy re-broadened.
  const offenders = [];
  for (const f of ["js/teacher.js", "js/student-detail.js", "js/admin.js",
                   "teacher.html", "student-detail.html", "admin.html"]) {
    let body;
    try { body = readFileSync(join(REPO, f), "utf8"); } catch { continue; }
    if (body.includes("student_weekly_quest_progress")) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test("every write path into this table is still SECURITY DEFINER", () => {
  const origin = readFileSync(join(REPO, ORIGIN), "utf8");
  for (const fn of ["update_weekly_quest_progress_for_answer", "claim_weekly_quest_reward"]) {
    const at = origin.indexOf(`FUNCTION public.${fn}`);
    assert.ok(at !== -1, `${fn} must exist`);
    assert.match(origin.slice(at, at + 400), /SECURITY DEFINER/);
  }
  // and the claim RPC must stay scoped to the caller
  const at = origin.indexOf("FUNCTION public.claim_weekly_quest_reward");
  const body = origin.slice(at, origin.indexOf("$$;", at));
  assert.match(body, /WHERE student_id = auth\.uid\(\)/,
    "a pupil must only ever claim their own quest");
});
