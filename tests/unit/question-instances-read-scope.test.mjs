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
import { createHash } from "node:crypto";
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
    "besides fixing questions.content/metadata text, it CREATE OR REPLACEs process_question_attempt with the " +
    "identical signature (uuid, uuid, text, bigint) RETURNS json, SECURITY DEFINER, search_path public, pg_temp — " +
    "the same function, no new overload, so its owner and its EXECUTE (service_role only since " +
    "20261007182046) are unchanged. Its one read of question_instances is the same single instance matched on " +
    "BOTH qi.id = p_question_instance_id AND qi.student_id = p_student_id, now also reading that question's " +
    "content and metadata; it still returns only status and correct_answer. The orthography-alias grading is a " +
    "separate behaviour change and is NOT reviewed here. Pinned by content (REVIEWED_LATER_READER_PINS).",
};

// A reviewed exception added from 2026-10-18 on is bound to the exact reviewed bytes: if the file changes, the
// exception no longer applies and a new review is needed. (The earlier entries predate this pin.)
const REVIEWED_LATER_READER_PINS = {
  "20261018143726_fix_danish_question_bank_text.sql": "efe71e74e53373c77779928ac0bba9044a68c0807e723d76120d422fa276b793",
};
const sha256Hex = (s) => createHash("sha256").update(s).digest("hex");
// A reviewed reader is excused only while its content is the reviewed content (where it is pinned).
const isReviewedLaterReader = (name, body) =>
  Object.hasOwn(REVIEWED_LATER_READERS, name) && (!Object.hasOwn(REVIEWED_LATER_READER_PINS, name) || sha256Hex(body) === REVIEWED_LATER_READER_PINS[name]);
// The migrations that can change the read scope and are not excused, sorted — the scope migration must be last.
const unexcusedReadScopeTouchers = (entries) => entries
  .filter(({ name }) => /^\d{14}_.*\.sql$/.test(name))
  .filter(({ body }) => touchesReadScope(body))
  .filter(({ name, body }) => !isReviewedLaterReader(name, body))
  .filter(({ name }) => !Object.hasOwn(REVIEWED_LATER_INSERT_NARROWING, name))
  .map(({ name }) => name).sort();

// The executable statements of a body that READ question_instances, normalised to single spaces.
const readStatements = (body) => executableSql(body)
  .split(";").map((s) => s.replace(/\s+/g, " ").trim())
  .filter((s) => new RegExp(String.raw`(?<!\bDELETE\s+)\bFROM\s+${QI}|\bJOIN\s+${QI}`, "i").test(s));

// The review of 20261018143726 as a function, so the negative controls below run the SAME checks on variants.
// It returns the problems found; an empty list means the reviewed properties hold. Static only: it reads the
// migration's text and proves nothing about what is applied in the live database.
function reviewProcessQuestionAttemptRedefinition(body) {
  const problems = [];
  const sqlText = executableSql(body);
  for (const re of READ_SCOPE_PATTERNS.slice(0, 3)) if (re.test(sqlText)) problems.push("changes a policy, RLS or table privilege: " + re);
  const defs = [...sqlText.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.process_question_attempt\s*\(([^)]*)\)\s*RETURNS\s+(\w+)\s+LANGUAGE\s+plpgsql\s+(SECURITY\s+DEFINER\s+)?SET\s+search_path\s+(?:TO|=)\s*([^\n]*)/gi)];
  if (defs.length !== 1) problems.push(`expected exactly one process_question_attempt definition, found ${defs.length}`);
  else {
    const [, params, returns, definer, searchPath] = defs[0];
    const types = params.split(",").map((p) => p.trim().split(/\s+/).pop().toLowerCase());
    if (types.join(",") !== "uuid,uuid,text,bigint") problems.push("signature " + types.join(",") + " is not (uuid, uuid, text, bigint) — a new overload would get default privileges");
    if (returns.toLowerCase() !== "json") problems.push("returns " + returns);
    if (!definer) problems.push("not SECURITY DEFINER");
    if (searchPath.replace(/['\s]/g, "") !== "public,pg_temp") problems.push("search_path " + searchPath.trim());
  }
  const reads = readStatements(body);
  if (reads.length !== 1) problems.push(`expected exactly one read of question_instances, found ${reads.length}`);
  else {
    const m = /\bFROM question_instances qi JOIN questions q ON q\.id = qi\.question_id WHERE (.+)$/i.exec(reads[0]);
    if (!m) problems.push("the read is not the single-instance lookup joined only to its question: " + reads[0]);
    else {
      const where = m[1];
      if (/\bOR\b|[()]/i.test(where)) problems.push("the WHERE clause is not a plain conjunction: " + where);
      const conjuncts = where.split(/\s+AND\s+/i).map((c) => c.trim()).sort();
      if (JSON.stringify(conjuncts) !== JSON.stringify(["qi.id = p_question_instance_id", "qi.student_id = p_student_id"])) {
        problems.push("the lookup is not bound to exactly the instance id AND the student id: " + where);
      }
    }
  }
  const fn = /\$function\$([\s\S]*?)\$function\$/.exec(sqlText);
  if (!fn) problems.push("no $function$ body");
  else {
    const keys = jsonBuildObjectKeys(fn[1]);
    if (!keys.length || keys.some((k) => !["status", "correct_answer"].includes(k))) problems.push("returns keys " + JSON.stringify(keys) + ", not only status and correct_answer");
  }
  return problems;
}
// Every key of every json_build_object(...) call: the arguments are split at top-level commas (parentheses and
// single-quoted strings respected); the even-indexed arguments are the keys.
function jsonBuildObjectKeys(code) {
  const keys = [];
  for (const m of code.matchAll(/json_build_object\s*\(/gi)) {
    let i = m.index + m[0].length, depth = 1, inStr = false, cur = "";
    const args = [];
    for (; i < code.length && depth > 0; i++) {
      const ch = code[i];
      if (inStr) { cur += ch; if (ch === "'") inStr = false; continue; }
      if (ch === "'") { inStr = true; cur += ch; continue; }
      if (ch === "(") depth++;
      if (ch === ")") { depth--; if (depth === 0) break; }
      if (ch === "," && depth === 1) { args.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    args.push(cur.trim());
    for (let k = 0; k < args.length; k += 2) keys.push(/^'([^']*)'$/.test(args[k]) ? args[k].slice(1, -1) : "<non-literal key: " + args[k] + ">");
  }
  return keys;
}

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
  // A pinned reviewed reader is excused only while its content is the reviewed content.
  const dir = join(REPO, "supabase", "migrations");
  const touching = unexcusedReadScopeTouchers(readdirSync(dir).map((name) => ({ name, body: readFileSync(join(dir, name), "utf8") })));
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
     "20261018143726_fix_danish_question_bank_text.sql"],
    "adding an exception is a reviewed decision — extend this list deliberately, never by pattern");
  assert.deepEqual(Object.keys(REVIEWED_LATER_READER_PINS), ["20261018143726_fix_danish_question_bank_text.sql"],
    "every exception added from 2026-10-18 on is pinned to its reviewed content");
  for (const [name, pin] of Object.entries(REVIEWED_LATER_READER_PINS)) {
    assert.ok(Object.hasOwn(REVIEWED_LATER_READERS, name), `${name} is pinned but not a reviewed reader`);
    assert.equal(sha256Hex(readFileSync(join(dir, name), "utf8")), pin, `${name} changed since it was reviewed — a new review is needed`);
  }
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

// ── 20261018143726: the reviewed redefinition of process_question_attempt ─────────────────────────────────────
// These checks are STATIC: they prove what the tracked migration text says. They do not prove what is applied in the
// live database (that needs a read-only catalogue check there), and they review the READ scope only — the
// orthography-alias grading the same file introduces is a separate behaviour change, not reviewed here.
const DANISH_TEXT = "20261018143726_fix_danish_question_bank_text.sql";
const danishText = () => readFileSync(join(REPO, "supabase", "migrations", DANISH_TEXT), "utf8");

test("20261018143726: the redefinition keeps the one read bound to the instance id AND the student id, same signature, same returns", () => {
  assert.deepEqual(reviewProcessQuestionAttemptRedefinition(danishText()), []);
  // the same exact signature the EXECUTE lockdown names: CREATE OR REPLACE replaces that function, no new overload
  const lockdown = readFileSync(join(REPO, "supabase", "migrations", "20261007182046_process_question_attempt_execute_lockdown.sql"), "utf8");
  assert.match(executableSql(lockdown), /GRANT EXECUTE\s+ON FUNCTION public\.process_question_attempt\(uuid, uuid, text, bigint\)\s+TO service_role;/);
  // no later migration re-grants or redefines it
  const later = readdirSync(join(REPO, "supabase", "migrations")).filter((n) => n.slice(0, 14) > "20261007182046" && n !== DANISH_TEXT && /\.sql$/.test(n));
  for (const n of later) {
    const s = executableSql(readFileSync(join(REPO, "supabase", "migrations", n), "utf8"));
    assert.ok(!/process_question_attempt/.test(s), `${n} touches process_question_attempt in executable SQL — review it`);
  }
});

test("negative controls: every weakening of the reviewed redefinition is caught", () => {
  const body = danishText();
  const variants = {
    "student_id bound removed": (b) => b.replace(/\s+AND qi\.student_id = p_student_id;/, ";"),
    "student_id bound weakened": (b) => b.replace("qi.student_id = p_student_id", "qi.student_id = qi.student_id"),
    "instance id bound removed": (b) => b.replace(/qi\.id\s+= p_question_instance_id\s+AND\s+/, ""),
    "instance id bound weakened": (b) => b.replace(/qi\.id\s+= p_question_instance_id/, "qi.id IS NOT NULL"),
    "OR widening": (b) => b.replace("AND qi.student_id = p_student_id;", "AND qi.student_id = p_student_id OR true;"),
    "policy added": (b) => b + "\nCREATE POLICY \"x\" ON public.question_instances FOR SELECT TO authenticated USING (true);\n",
    "RLS changed": (b) => b + "\nALTER TABLE public.question_instances DISABLE ROW LEVEL SECURITY;\n",
    "privilege granted": (b) => b + "\nGRANT SELECT ON public.question_instances TO anon;\n",
    "new overload": (b) => b.replace("p_question_shown_at bigint)", "p_question_shown_at bigint, p_scope text)"),
    "SECURITY DEFINER dropped": (b) => b.replace(" SECURITY DEFINER\n SET search_path", " SET search_path"),
    "extra returned field": (b) => b.replace("'correct_answer', null)", "'correct_answer', null, 'user_answer', v_instance.user_answer)"),
    "a second read": (b) => b + "\nSELECT count(*) FROM public.question_instances;\n",
  };
  for (const [label, mutate] of Object.entries(variants)) {
    const v = mutate(body);
    assert.notEqual(v, body, `${label}: the variant must actually differ from the reviewed text`);
    assert.ok(reviewProcessQuestionAttemptRedefinition(v).length > 0, `${label} must be caught`);
  }
});

test("negative controls: an unknown later reader and a changed reviewed file are not excused", () => {
  const scope = { name: "20260923000000_question_instances_teacher_read_scope.sql", body: sql() };
  const reviewed = { name: DANISH_TEXT, body: danishText() };
  assert.deepEqual(unexcusedReadScopeTouchers([scope, reviewed]).at(-1), scope.name, "the reviewed, unchanged file is excused");
  const unknown = { name: "20261231000000_new_reader.sql", body: "CREATE FUNCTION f() RETURNS bigint SECURITY DEFINER AS $$ SELECT count(*) FROM public.question_instances $$ LANGUAGE sql;" };
  assert.equal(unexcusedReadScopeTouchers([scope, reviewed, unknown]).at(-1), unknown.name, "an unknown later reader sorts after the scope migration and fails the order test");
  const changed = { name: DANISH_TEXT, body: danishText() + "\n-- a later edit\n" };
  assert.equal(unexcusedReadScopeTouchers([scope, changed]).at(-1), DANISH_TEXT, "changed reviewed content needs a new review");
  assert.equal(isReviewedLaterReader(DANISH_TEXT, changed.body), false);
  const write = { name: "20261231000001_pure_write.sql", body: "DELETE FROM public.question_instances WHERE id = $1;" };
  assert.deepEqual(unexcusedReadScopeTouchers([scope, write]), [scope.name], "a pure write is still not a read-scope change");
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
