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

// Executable SQL that can change WHO MAY READ question_instances rows:
//   * policies on the table (CREATE / ALTER / DROP POLICY ... ON question_instances)
//   * row level security on the table (ALTER TABLE question_instances ... ROW LEVEL SECURITY)
//   * table privileges (GRANT / REVOKE ... ON question_instances)
//   * any READ of the table (SELECT ... FROM / JOIN question_instances) — a SECURITY DEFINER
//     function that reads rows bypasses RLS and is just as much a read-scope change
// A pure write (DELETE FROM / UPDATE / INSERT INTO) cannot widen who reads rows, so it does not
// count. Comment lines never count.
const executableSql = (body) => body
  .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
const QI = String.raw`(?:public\.)?question_instances\b`;
const READ_SCOPE_PATTERNS = [
  new RegExp(String.raw`\b(?:CREATE|ALTER|DROP)\s+POLICY\b[\s\S]*?\bON\s+${QI}`, "i"),
  new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?${QI}[^;]*\bROW\s+LEVEL\s+SECURITY\b`, "i"),
  new RegExp(String.raw`\b(?:GRANT|REVOKE)\b[^;]*\bON\s+(?:TABLE\s+)?${QI}`, "i"),
  new RegExp(String.raw`(?<!\bDELETE\s+)\bFROM\s+${QI}`, "i"),
  new RegExp(String.raw`\bJOIN\s+${QI}`, "i"),
];
const touchesReadScope = (body) => {
  const sqlText = executableSql(body);
  return READ_SCOPE_PATTERNS.some((re) => re.test(sqlText));
};

test("the read-scope classifier catches access changes and ignores pure writes", () => {
  // Must be caught: every way a later migration could widen who reads the rows.
  assert.ok(touchesReadScope(
    "CREATE POLICY \"x\" ON public.question_instances FOR SELECT TO authenticated USING (true);"));
  assert.ok(touchesReadScope("DROP POLICY IF EXISTS \"x\" ON public.question_instances;"));
  assert.ok(touchesReadScope("ALTER TABLE public.question_instances DISABLE ROW LEVEL SECURITY;"));
  assert.ok(touchesReadScope("GRANT SELECT ON public.question_instances TO anon;"));
  assert.ok(touchesReadScope(
    "CREATE FUNCTION f() RETURNS SETOF record SECURITY DEFINER AS $$ SELECT * FROM public.question_instances $$;"));
  assert.ok(touchesReadScope("SELECT 1 FROM profiles p JOIN question_instances qi ON qi.student_id = p.id;"));
  // Must NOT be caught: writes, and the name inside a comment.
  assert.equal(touchesReadScope(
    "DELETE FROM public.question_instances qi USING public.questions q WHERE qi.question_id = q.id;"), false);
  assert.equal(touchesReadScope("-- SELECT * FROM public.question_instances"), false);
});

// Later migrations that READ question_instances inside SECURITY DEFINER functions and were
// reviewed as not widening who may read rows. Each entry names the file and why. The exception
// covers reads only: an entry may never touch a policy, row level security or table privileges.
const REVIEWED_LATER_READERS = {
  "20261002000000_quiz_repeat_when_pool_exhausted.sql":
    "request_repeat_question and release_open_question_outside read only the caller's own rows " +
    "(auth.uid()) and return an id / a count; process_question_attempt reads one instance " +
    "matched on both id and student_id and returns only its status — the same reads the " +
    "production function already makes. No row data reaches a caller who could not already read it.",
  "20261009100000_get_teacher_visibility_caller_scope.sql":
    "get_teacher_visibility makes the same aggregate read of question_instances it has made since " +
    "20260608065035, but NARROWS who reaches it: rows are read only for pupils whose teacher_id is " +
    "the verified auth.uid() of a caller whose profiles.role is 'teacher', and EXECUTE is revoked " +
    "from PUBLIC, anon and service_role. No policy, RLS or table privilege is touched.",
  "20261016150000_analytics_views_lockdown.sql":
    "re-creates the owner-rights view question_performance with its exact live body (which already " +
    "JOINs question_instances for per-question aggregates, no student_id) plus a predicate that " +
    "NARROWS it to postgres, service_role and super_admin callers, and revokes anon and every " +
    "non-SELECT privilege on it. It touches no policy, RLS or privilege on question_instances.",
  "20261016160000_answer_keys_server_side_rpcs.sql":
    "get_unserved_questions_for_student and request_repeat_question_for_student read only the rows " +
    "of the student id they are given, and EXECUTE is revoked from PUBLIC, anon and authenticated and " +
    "granted to service_role only — get-next-question calls them with the verified user.id. They " +
    "narrow who can read (the browser can no longer name a scope); no policy, RLS or table privilege " +
    "on question_instances is touched.",
  "20261018143726_fix_danish_question_bank_text.sql":
    "a reviewed data fix of question text (#331) that also re-creates process_question_attempt " +
    "(SECURITY DEFINER, EXECUTE unchanged: backend only) with the same single read — one instance matched " +
    "on BOTH id and student_id, joined to its question — to accept two reviewed spellings of the correct " +
    "option. It returns only that instance's status and key after answering, as before; no policy, RLS " +
    "or privilege on question_instances is touched.",
  "20261019150000_question_format_mix.sql":
    "adds new functions only, each with search_path public, pg_temp and EXECUTE revoked from PUBLIC, anon " +
    "and authenticated, granted to service_role only. get_question_candidates_for_student reads " +
    "question_instances only in the NOT EXISTS of get_unserved_questions_for_student (qi.student_id = the " +
    "given id AND qi.question_id = q.id) and returns no instance column. " +
    "request_repeat_question_servable_for_student is the body of request_repeat_question_for_student " +
    "with the same reads and the same single UPDATE scoped to id AND student_id; it returns only an id. " +
    "advance_student_band reads only the given student's own verdicts (student_id, answered, was_correct, " +
    "answered_at, id) and returns a band, never instance data. Its only write is to the new table " +
    "student_band_state (RLS on, no policies, no client privileges). No policy, RLS, table privilege or " +
    "existing function on question_instances is touched (proven in question-format-mix-migration-run.test.mjs).",
  "20261025120000_student_rpc_caller_scope.sql":
    "re-creates get_concept_states with its exact aggregate read of question_instances (one student's answered " +
    "rows, returned only as concept → state labels) behind a NEW caller check: the pupil themself, the pupil's " +
    "teacher (profiles.teacher_id = auth.uid() and the caller's role is 'teacher'), a super_admin, or the internal database context (session_user " +
    "postgres/supabase_admin without a JWT subject) — everyone else gets 'forbidden'. EXECUTE only for " +
    "authenticated (revoked from PUBLIC, anon and service_role). It NARROWS who can reach the read; " +
    "no policy, RLS or table privilege on question_instances is touched (proven in " +
    "student-rpc-caller-scope-migration-run.test.mjs).",
  "20261027120000_repeat_answer_coin_reward.sql":
    "D-211: re-creates process_question_attempt from the exact live body of 20261018143726 (guarded on " +
    "md5(prosrc)), changing ONLY the repeat award to 1 coin + 2 XP. The single read of question_instances " +
    "is unchanged — one instance matched on BOTH id and student_id — and CREATE OR REPLACE keeps EXECUTE " +
    "backend only; no policy, RLS or privilege on question_instances is touched (proven in " +
    "repeat-answer-coin-reward-migration-run.test.mjs).",
  "20261029120000_difficulty_scale_b.sql":
    "adds new functions only, each SECURITY INVOKER with search_path public, pg_temp and EXECUTE revoked " +
    "from PUBLIC, anon and authenticated, granted to service_role only — so even a caller who obtained " +
    "EXECUTE would read with its own privileges and RLS. get_level_questions_for_student reads " +
    "question_instances only in a NOT EXISTS (qi.student_id = the given id AND qi.question_id = q.id) and " +
    "returns no instance column. request_repeat_level_question_for_student is #351's servable repeat with " +
    "the same reads and the same single UPDATE scoped to id AND student_id; it returns only an id. " +
    "advance_student_level reads only the given student's own first, auto-graded verdicts (id, was_correct) " +
    "and returns a level, never instance data; its writes go to student_subject_level and the new table " +
    "student_level_fold_log (RLS on, no policies, no client privileges). It also adds the plain index " +
    "idx_qi_student_answered. No policy, RLS, table privilege or existing function on question_instances " +
    "is touched (proven in difficulty-scale-b-migration-run.test.mjs).",
  "20261029150000_mc_grading_compensation.sql":
    "a one-off, owner-run data fix (D-254) in an anonymous DO block — no function, nothing a client can " +
    "call. It reads question_instances only to resolve two attempts of one question by SHA-256 of their id " +
    "(id, student_id) and returns nothing to anyone. Its writes go to student_progress and the new table " +
    "progress_corrections (RLS on, no policies, REVOKE ALL from PUBLIC, anon, authenticated and " +
    "service_role). No policy, RLS, table privilege or row of question_instances is touched (proven in " +
    "mc-grading-compensation-migration-run.test.mjs).",
};

// Later migrations that touch question_instances policies/privileges ONLY to take INSERT away from
// clients — they can narrow who writes, never widen who reads. Each entry is verified statement by
// statement below: nothing but DROP POLICY on a named INSERT policy and REVOKE INSERT is allowed.
const INSERT_POLICIES = ["Students can insert own instances", "students can insert their own instances"];
const REVIEWED_LATER_INSERT_NARROWING = {
  "20261015120000_question_instances_server_owned_insert.sql":
    "drops the two duplicate INSERT policies and revokes INSERT from PUBLIC, anon and authenticated, " +
    "so only the backend (get-next-question/instance-insert.ts) creates instances. Both SELECT " +
    "policies, RLS and every other privilege are untouched — no read can widen.",
};

test("reviewed INSERT-narrowing migrations contain only DROP of named INSERT policies and REVOKE INSERT", () => {
  const dir = join(REPO, "supabase", "migrations");
  assert.deepEqual(Object.keys(REVIEWED_LATER_INSERT_NARROWING),
    ["20261015120000_question_instances_server_owned_insert.sql"],
    "adding an exception is a reviewed decision — extend this list deliberately, never by pattern");
  const dropInsertPolicy = new RegExp(String.raw`^DROP POLICY "(${INSERT_POLICIES.join("|")})" ON public\.question_instances$`);
  const revokeInsert = /^REVOKE INSERT ON public\.question_instances FROM (PUBLIC|anon|authenticated)(, (PUBLIC|anon|authenticated))*$/;
  for (const [name, reason] of Object.entries(REVIEWED_LATER_INSERT_NARROWING)) {
    assert.ok(typeof reason === "string" && reason.length > 0, `${name} must state why it is safe`);
    const statements = executableSql(readFileSync(join(dir, name), "utf8"))
      .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    assert.ok(statements.length > 0, `${name} has no executable SQL`);
    for (const s of statements) {
      assert.ok(dropInsertPolicy.test(s) || revokeInsert.test(s),
        `${name}: "${s}" is not an INSERT-only narrowing — the exception does not cover it`);
    }
  }
});

// Later migrations that touch question_instances privileges ONLY to take the answer key away from
// clients (audit E1/P3) — table-level SELECT is replaced by a column grant that omits correct_answer.
// Rows stay governed by the unchanged SELECT policies; the set of client-readable COLUMNS shrinks.
// Verified statement by statement below: every statement that touches question_instances must be
// either a REVOKE SELECT from anon/authenticated or ONE column GRANT SELECT to authenticated whose
// column list excludes correct_answer and names only real columns. Statements on other objects in
// the file are not question_instances read-scope changes and are not constrained here.
const QI_ALL_COLUMNS = ["id", "student_id", "question_id", "correct_answer", "difficulty_at_time", "mastery_snapshot",
  "created_at", "answered", "answered_at", "is_correct", "xp_awarded", "next_due", "next_review_at",
  "incorrect_attempts", "user_answer", "was_correct", "teacher_feedback", "teacher_score", "reviewed_at",
  "reviewed_by", "misconception_signal", "repeat_count"];
const REVIEWED_LATER_SELECT_NARROWING = {
  "20261018170000_answer_keys_client_paths_lockdown.sql":
    "revokes table-level SELECT on question_instances from anon and authenticated and grants " +
    "authenticated SELECT on every column except correct_answer. No policy or RLS setting on the table " +
    "changes, so the readable ROWS are exactly as before; only the key column becomes unreadable.",
};

function selectNarrowingViolations(body) {
  const violations = [];
  const statements = executableSql(body).split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const touching = statements.filter((s) => touchesReadScope(s + ";"));
  const revoke = /^REVOKE SELECT ON (?:TABLE )?public\.question_instances FROM (anon|authenticated)(, (anon|authenticated))*$/;
  const grant = /^GRANT SELECT \(([^)]*)\) ON (?:TABLE )?public\.question_instances TO authenticated$/;
  let grants = 0;
  for (const s of touching) {
    if (revoke.test(s)) continue;
    const g = grant.exec(s);
    if (g) {
      grants++;
      const cols = g[1].split(",").map((c) => c.trim());
      if (cols.includes("correct_answer")) violations.push(`${s}: grants the key column`);
      for (const c of cols) if (!QI_ALL_COLUMNS.includes(c)) violations.push(`${s}: unknown column ${c}`);
      continue;
    }
    violations.push(`"${s}" is not a SELECT narrowing`);
  }
  if (grants > 1) violations.push("more than one column grant");
  if (!touching.some((s) => revoke.test(s))) violations.push("no REVOKE SELECT — nothing is narrowed");
  return violations;
}

test("reviewed SELECT-narrowing migrations only swap table SELECT for a key-less column grant", () => {
  const dir = join(REPO, "supabase", "migrations");
  assert.deepEqual(Object.keys(REVIEWED_LATER_SELECT_NARROWING),
    ["20261018170000_answer_keys_client_paths_lockdown.sql"],
    "adding an exception is a reviewed decision — extend this list deliberately, never by pattern");
  for (const [name, reason] of Object.entries(REVIEWED_LATER_SELECT_NARROWING)) {
    assert.ok(typeof reason === "string" && reason.length > 0, `${name} must state why it is safe`);
    assert.deepEqual(selectNarrowingViolations(readFileSync(join(dir, name), "utf8")), [], name);
  }
  // Negative controls: the checker rejects the shapes that would widen or leak.
  assert.ok(selectNarrowingViolations("REVOKE SELECT ON public.question_instances FROM authenticated; GRANT SELECT (id, correct_answer) ON public.question_instances TO authenticated;").length > 0);
  assert.ok(selectNarrowingViolations("GRANT SELECT ON public.question_instances TO anon;").length > 0);
  assert.ok(selectNarrowingViolations("REVOKE SELECT ON public.question_instances FROM authenticated; CREATE POLICY \"x\" ON public.question_instances FOR SELECT TO authenticated USING (true);").length > 0);
  assert.ok(selectNarrowingViolations("REVOKE SELECT ON public.question_instances FROM authenticated; GRANT SELECT (id, secret_col) ON public.question_instances TO authenticated;").length > 0);
});

test("the migration sorts after every migration that touches question_instances", () => {
  // Originally "sorts after every migration already in the tree", compared against the last file
  // in the whole directory. That encoded "nothing has been added since" rather than the property
  // it describes, so it had to fail on the next unrelated migration — and it did.
  // It was then narrowed to "names the table in executable SQL", which failed on the next
  // unrelated migration too: release_open_question_outside (2026-10-01) only DELETEs a caller's
  // own open row and cannot widen reads. What matters is that nothing which can change the READ
  // scope of this table sorts after it — see touchesReadScope above.
  //
  // A later migration that reads the table is still caught. It may sort after this one only by
  // being named in REVIEWED_LATER_READERS above — a deliberate, reviewed decision, never a
  // loosened pattern.
  const dir = join(REPO, "supabase", "migrations");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => touchesReadScope(readFileSync(join(dir, n), "utf8")))
    .filter((n) => !Object.hasOwn(REVIEWED_LATER_READERS, n))
    .filter((n) => !Object.hasOwn(REVIEWED_LATER_INSERT_NARROWING, n))
    .filter((n) => !Object.hasOwn(REVIEWED_LATER_SELECT_NARROWING, n))
    .sort();
  assert.ok(touching.includes("20260923000000_question_instances_teacher_read_scope.sql"),
    "this migration must be present in the tree");
  assert.equal(touching[touching.length - 1],
    "20260923000000_question_instances_teacher_read_scope.sql",
    "it must apply last among them, so nothing in the tree can re-broaden the scope");
});

test("reviewed later readers are exactly the named files, and change reads only", () => {
  const dir = join(REPO, "supabase", "migrations");
  assert.deepEqual(Object.keys(REVIEWED_LATER_READERS),
    ["20261002000000_quiz_repeat_when_pool_exhausted.sql",
     "20261009100000_get_teacher_visibility_caller_scope.sql",
     "20261016150000_analytics_views_lockdown.sql",
     "20261016160000_answer_keys_server_side_rpcs.sql",
     "20261018143726_fix_danish_question_bank_text.sql",
     "20261019150000_question_format_mix.sql",
     "20261025120000_student_rpc_caller_scope.sql",
     "20261027120000_repeat_answer_coin_reward.sql",
     "20261029120000_difficulty_scale_b.sql",
     "20261029150000_mc_grading_compensation.sql"],
    "adding an exception is a reviewed decision — extend this list deliberately, never by pattern");
  const ACCESS_PATTERNS = READ_SCOPE_PATTERNS.slice(0, 3); // policy, RLS, privileges
  for (const [name, reason] of Object.entries(REVIEWED_LATER_READERS)) {
    const body = readFileSync(join(dir, name), "utf8");
    assert.ok(typeof reason === "string" && reason.length > 0, `${name} must state why it is safe`);
    assert.ok(touchesReadScope(body),
      `${name} no longer reads the table — remove the stale exception`);
    const sqlText = executableSql(body);
    for (const re of ACCESS_PATTERNS) {
      assert.ok(!re.test(sqlText),
        `${name} changes a policy, RLS or table privilege — the exception does not cover that`);
    }
  }
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
  // student-detail.js used to carry its own `.eq("teacher_id", teacherId)` filter. That moved
  // server-side when teacher_student_overview was replaced by get_student_overview, which checks
  // the caller's role and the profiles.teacher_id relation inside a SECURITY DEFINER function.
  // The property this test names still holds, and holds more strongly: the scoping is no longer
  // a client filter a caller could drop. What must stay true is that the page resolves the pupil
  // through that authorising call rather than reading a pupil-wide source directly.
  assert.match(detail, /\.rpc\("get_student_overview", \{ p_student_id: studentId \}\)/,
    "student-detail.js must resolve the pupil through the authorising RPC");
  assert.ok(!/\.from\("teacher_student_overview"\)/.test(detail),
    "the unscoped view must not come back");
});
