// Contract guards for the read scope on question_instances. Offline, source-only: no network,
// no database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// "Teachers can read question_instances" used a USING expression that never referenced the row:
//     EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='teacher')
// A predicate about the CALLER rather than the ROW is TRUE for every row, so any teacher could
// read every pupil's answer text, feedback and score across every class.
//
// The first test models that expression against a fictional world to show the breadth concretely;
// the rest pin the migration that replaces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260923000000_question_instances_teacher_read_scope.sql";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// Executable SQL only. The comments deliberately quote the OLD predicate and name the things this
// migration must NOT do, so an assertion that reads the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// ── A model of the two predicates, to demonstrate the difference as behaviour ─────────────────
// Fictional world: no real ids, no real names, no real answers.
const WORLD = {
  profiles: {
    "teacher-A": { role: "teacher", teacher_id: null },
    "teacher-C": { role: "teacher", teacher_id: null },
    "pupil-A":   { role: "student", teacher_id: "teacher-A" },
    "pupil-C":   { role: "student", teacher_id: "teacher-C" },
    "pupil-free":{ role: "student", teacher_id: null },
    "admin-1":   { role: "super_admin", teacher_id: null },
  },
  rows: [
    { id: "row-A",    student_id: "pupil-A" },
    { id: "row-C",    student_id: "pupil-C" },
    { id: "row-free", student_id: "pupil-free" },
  ],
};

// The OLD policy set: student-own OR (caller is any teacher).
function visibleBefore(callerId) {
  const me = WORLD.profiles[callerId];
  return WORLD.rows.filter((r) =>
    r.student_id === callerId ||                       // pupil reads own
    (!!me && me.role === "teacher")                    // row-independent: every row
  );
}

// The NEW policy set: student-own OR (this row's pupil belongs to the caller).
function visibleAfter(callerId) {
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];                                   // anon: auth.uid() is NULL
  return WORLD.rows.filter((r) => {
    if (r.student_id === callerId) return true;
    const pupil = WORLD.profiles[r.student_id];
    return !!pupil && pupil.role === "student" && pupil.teacher_id === callerId;
  });
}

test("DEFECT: the old teacher predicate exposes every pupil's rows to any teacher", () => {
  const before = visibleBefore("teacher-A").map((r) => r.id).sort();
  assert.deepEqual(before, ["row-A", "row-C", "row-free"],
    "a caller-only predicate is TRUE for every row — that is the exposure");
  const after = visibleAfter("teacher-A").map((r) => r.id);
  assert.deepEqual(after, ["row-A"], "the scoped predicate leaves only the teacher's own pupil");
});

test("a pupil reads only their own rows", () => {
  assert.deepEqual(visibleAfter("pupil-A").map((r) => r.id), ["row-A"]);
});

test("a pupil cannot read another pupil's rows", () => {
  assert.ok(!visibleAfter("pupil-A").some((r) => r.student_id !== "pupil-A"));
});

test("a teacher cannot read another teacher's pupil", () => {
  assert.ok(!visibleAfter("teacher-A").some((r) => r.id === "row-C"));
});

test("a teacher cannot read a pupil with no teacher relation", () => {
  assert.ok(!visibleAfter("teacher-A").some((r) => r.id === "row-free"));
});

test("an authenticated user who is neither the pupil nor their teacher sees nothing", () => {
  assert.deepEqual(visibleAfter("teacher-C").map((r) => r.id), ["row-C"]);
  assert.deepEqual(visibleAfter("admin-1").map((r) => r.id), [],
    "super_admin had no access under the old policy either — the contract is preserved");
});

test("anon sees nothing", () => {
  assert.deepEqual(visibleAfter(null), []);
  assert.deepEqual(visibleAfter("nobody"), []);
});

// ── The migration itself ──────────────────────────────────────────────────────

test("the broad teacher policy is dropped", () => {
  assert.match(stmts(),
    /DROP POLICY IF EXISTS "Teachers can read question_instances" ON public\.question_instances;/);
});

test("both replacement policies target authenticated explicitly, never PUBLIC", () => {
  const s = stmts();
  const creates = [...s.matchAll(/CREATE POLICY "([^"]+)"[\s\S]*?USING \(/g)];
  assert.equal(creates.length, 2, "exactly two SELECT policies are created");
  for (const m of creates) {
    const block = s.slice(m.index, m.index + 400);
    assert.match(block, /\n\s*TO authenticated\n/, `${m[1]} must name its role`);
  }
  assert.ok(!/TO PUBLIC/i.test(s), "no policy may target PUBLIC");
  assert.ok(!/TO anon/i.test(s), "anon must never be granted read access");
});

test("the teacher policy is a ROW predicate keyed on the canonical relation", () => {
  const s = stmts();
  assert.match(s, /s\.id = question_instances\.student_id/,
    "the predicate must reference the row being read");
  assert.match(s, /s\.teacher_id = \(select auth\.uid\(\)\)/,
    "ownership must be the canonical profiles.teacher_id compared to the caller");
  assert.match(s, /s\.role = 'student'/, "the related row must actually be a pupil");
});

test("auth.uid() is wrapped so it is evaluated once, not per row", () => {
  const s = stmts();
  const bare = [...s.matchAll(/(?<!select )auth\.uid\(\)/g)]
    .filter((m) => !s.slice(Math.max(0, m.index - 8), m.index).includes("select "));
  assert.equal(bare.length, 0, "every auth.uid() in a policy body must be (select auth.uid())");
});

test("no SECURITY DEFINER shortcut is introduced", () => {
  assert.ok(!/SECURITY\s+DEFINER/i.test(stmts()),
    "a definer helper would hide the dependency behind a privilege escalation surface");
});

test("write permissions are untouched", () => {
  const s = stmts();
  for (const cmd of ["FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL"]) {
    assert.ok(!s.includes(cmd), `the migration must not create a ${cmd} policy`);
  }
  for (const stmt of ["GRANT ", "REVOKE ", "ALTER TABLE", "CREATE TABLE", "DROP TABLE", "CREATE INDEX"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
  // Only the three known SELECT policies may be dropped.
  const drops = [...s.matchAll(/DROP POLICY IF EXISTS "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(drops, [
    "Students can view own instances",
    "Teachers can read question_instances",
    "students can read their own instances",
  ]);
});

test("the review_answer EXECUTE lockdown is not touched", () => {
  assert.ok(!/review_answer/i.test(stmts()),
    "this migration must not reference the RPC lockdown at all");
});

test("only question_instances policies are affected", () => {
  const s = stmts();
  const targets = [...s.matchAll(/ON public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(targets)], ["question_instances"]);
});

test("the migration is re-runnable", () => {
  const s = stmts();
  const drops = (s.match(/DROP POLICY IF EXISTS/g) ?? []).length;
  const creates = (s.match(/CREATE POLICY/g) ?? []).length;
  assert.equal(drops, 3, "every policy touched is dropped IF EXISTS first");
  assert.ok(creates === 2 && drops >= creates,
    "each created policy is preceded by a conditional drop, so re-applying converges");
});

test("the migration sorts after every migration that touches question_instances", () => {
  // Originally "sorts after every migration already in the tree", compared against the last file
  // in the whole directory. That encoded "nothing has been added since" rather than the property
  // it describes, so it had to fail on the next unrelated migration — and it did.
  // What matters is that nothing which touches this table can override it. "Touches" means in
  // executable SQL: a migration that only names the table in a comment does not.
  const dir = join(REPO, "supabase", "migrations");
  const executable = (body) => body
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => /question_instances/i.test(executable(readFileSync(join(dir, n), "utf8"))))
    .sort();
  assert.ok(touching.includes("20260923000000_question_instances_teacher_read_scope.sql"),
    "this migration must be present in the tree");
  assert.equal(touching[touching.length - 1],
    "20260923000000_question_instances_teacher_read_scope.sql",
    "it must apply last among them, so nothing in the tree can re-broaden the scope");
});

test("no later migration re-broadens the read scope", () => {
  const dir = join(REPO, "supabase", "migrations");
  const offenders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".sql") || name === "20260923000000_question_instances_teacher_read_scope.sql") continue;
    const body = readFileSync(join(dir, name), "utf8");
    if (/CREATE POLICY[\s\S]{0,400}ON public\.question_instances[\s\S]{0,400}FOR SELECT/i.test(body)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(offenders, [],
    "a later migration creating another SELECT policy would widen the scope again");
});

// ── The callers must stay compatible ──────────────────────────────────────────

test("the teacher surfaces already scope their queries to their own pupils", () => {
  // If this stops being true, the policy would start changing legitimate results.
  const teacher = readFileSync(join(REPO, "js", "teacher.js"), "utf8");
  const detail = readFileSync(join(REPO, "js", "student-detail.js"), "utf8");
  assert.match(teacher, /\.eq\("teacher_id", teacherId\)/,
    "teacher.js must resolve its own pupils before reading their instances");
  assert.match(teacher, /\.in\("student_id", studentIds\)/,
    "and then filter instances to that set");
  assert.match(detail, /\.eq\("teacher_id", teacherId\)/,
    "student-detail.js must validate the pupil belongs to the teacher");
});
