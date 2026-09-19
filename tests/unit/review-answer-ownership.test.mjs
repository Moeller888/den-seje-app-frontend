// Guards for the cross-teacher ownership boundary in review-answer. Offline, no network, no
// database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// Being a teacher is not the same as being THIS student's teacher. Before this fix the function
// checked the caller's ROLE and then looked the instance up by id alone, so teacher A could grade
// a student belonging to teacher C simply by sending that instance's id.
//
// The id is not a secret. The RLS policy "Teachers can read question_instances" is
//     EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'teacher')
// with no student filter, so every teacher can SELECT every row and read the ids directly. The
// attack needs a teacher account and nothing else.
//
// Neither review_answer overload helps: the 4-argument one the function calls does no
// authorisation at all and writes `reviewed_by = p_teacher_id` straight from its parameter, and
// question_instances has no UPDATE policy and no triggers. The service client bypasses RLS anyway.
//
// The first test below MODELS the old decision sequence to demonstrate the hole concretely; the
// rest pin the fixed behaviour in the real source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EDGE = "supabase/functions/review-answer/index.ts";
const src = () => readFileSync(join(REPO, EDGE), "utf8");

// ── A model of the authorisation decision, used only to demonstrate the defect ────────────────
// Deliberately NOT the real handler: it is the smallest faithful model of the decision sequence,
// so the difference between "role only" and "role + ownership" can be shown as behaviour rather
// than as a diff. The world below is fictional — no real ids, no real names.
const WORLD = {
  profiles: {
    "teacher-A": { role: "teacher", teacher_id: null },
    "teacher-C": { role: "teacher", teacher_id: null },
    "student-A": { role: "student", teacher_id: "teacher-A" },   // belongs to teacher A
    "student-C": { role: "student", teacher_id: "teacher-C" },   // belongs to teacher C
    "student-orphan": { role: "student", teacher_id: null },     // no teacher at all
    "admin-1": { role: "super_admin", teacher_id: null },
  },
  instances: {
    "inst-own": "student-A",
    "inst-foreign": "student-C",
    "inst-orphan": "student-orphan",
  },
};

// The sequence as it was BEFORE the fix: verify the JWT, check the role, then look the instance up
// by id and write. Returns the step it reached.
function decideRoleOnly(callerId, instanceId) {
  const profile = WORLD.profiles[callerId];
  if (!profile) return { status: 401, reached: "auth" };
  if (profile.role !== "teacher" && profile.role !== "super_admin") return { status: 403, reached: "role" };
  const studentId = WORLD.instances[instanceId];
  if (!studentId) return { status: 500, reached: "instance-missing" };
  return { status: 200, reached: "WRITE" };           // RPC + XP would run here
}

// The sequence AFTER the fix: the same, plus the ownership comparison before any write.
function decideWithOwnership(callerId, instanceId) {
  const profile = WORLD.profiles[callerId];
  if (!profile) return { status: 401, reached: "auth" };
  if (profile.role !== "teacher" && profile.role !== "super_admin") return { status: 403, reached: "role" };
  const studentId = WORLD.instances[instanceId] ?? null;
  let owns = profile.role === "super_admin";
  if (!owns && studentId) {
    const student = WORLD.profiles[studentId];
    owns = !!student && student.role === "student" && student.teacher_id === callerId;
  }
  if (!owns) return { status: 403, reached: "ownership" };
  return { status: 200, reached: "WRITE" };
}

// ── 1. the defect, demonstrated ───────────────────────────────────────────────

test("DEFECT: with the role check alone, teacher A reaches the write for teacher C's student", () => {
  const before = decideRoleOnly("teacher-A", "inst-foreign");
  assert.equal(before.reached, "WRITE",
    "this is the hole: nothing between the role check and the RPC compares the student's teacher");
  assert.equal(before.status, 200);

  // The same request under the fixed sequence stops before anything is written.
  const after = decideWithOwnership("teacher-A", "inst-foreign");
  assert.equal(after.reached, "ownership");
  assert.equal(after.status, 403);
});

test("the fix does not disturb the legitimate case", () => {
  assert.deepEqual(decideWithOwnership("teacher-A", "inst-own"), { status: 200, reached: "WRITE" });
});

test("a student with no teacher relation is refused", () => {
  assert.equal(decideWithOwnership("teacher-A", "inst-orphan").status, 403);
});

test("an unknown instance is refused identically to a foreign one — no enumeration oracle", () => {
  const unknown = decideWithOwnership("teacher-A", "inst-does-not-exist");
  const foreign = decideWithOwnership("teacher-A", "inst-foreign");
  assert.deepEqual(unknown, foreign,
    "status and reason must match, or the endpoint tells a teacher which ids exist");
});

test("non-teachers are still refused at the role check, before ownership is even considered", () => {
  assert.equal(decideWithOwnership("student-A", "inst-own").reached, "role");
  assert.equal(decideWithOwnership("student-A", "inst-own").status, 403);
});

test("super_admin keeps the contract it already had", () => {
  assert.equal(decideWithOwnership("admin-1", "inst-foreign").status, 200,
    "super_admin was permitted to review before this change and still is");
});

// ── 2. the real source ────────────────────────────────────────────────────────

test("ownership is compared against the canonical relation, using the VERIFIED caller id", () => {
  const s = src();
  assert.match(
    s,
    /\.from\("profiles"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("id", student_id\)\s*\n\s*\.eq\("teacher_id", user\.id\)\s*\n\s*\.eq\("role", "student"\)/,
    "the lookup must pin the student, the owning teacher and the role together",
  );
  // The teacher side must never come from the request body.
  const destructured = s.match(/const \{([^}]*)\} = body;/);
  assert.ok(destructured && !/teacher/i.test(destructured[1]),
    `no teacher identity may come from the body, found: ${destructured?.[1]?.trim()}`);
});

test("the ownership check precedes EVERY write", () => {
  const s = src();
  const guard = s.indexOf("if (!ownsStudent)");
  assert.ok(guard !== -1, "the ownership guard must exist");
  for (const [label, needle] of [
    ["the RPC call", 'rpc("review_answer"'],
    ["the XP read", '.from("student_progress")'],
    ["the XP write", '.update({ xp:'],
  ]) {
    const at = s.indexOf(needle);
    assert.ok(at !== -1 && at > guard, `${label} must come after the ownership guard`);
  }
});

test("only reads happen before the guard — no write of any kind", () => {
  const s = src();
  const guard = s.indexOf("if (!ownsStudent)");
  const before = s.slice(0, guard);
  for (const write of [".update(", ".insert(", ".upsert(", ".delete(", '.rpc("']) {
    assert.ok(!before.includes(write),
      `no ${write} may appear before the ownership guard`);
  }
});

test("an unknown instance and a foreign one produce the SAME response in the source", () => {
  const s = src();
  // The old code threw "Instance not found", which told the caller the id did not exist.
  assert.ok(!s.includes('throw new Error("Instance not found")'),
    "a distinct not-found error would be an enumeration oracle");
  // A missing row must fall through to the shared 403, not to its own branch.
  assert.match(s, /const student_id = instance\?\.student_id \?\? null;/,
    "a missing instance must be carried to the shared refusal, not short-circuited");
});

test("a failed lookup is an error, never a silent pass", () => {
  const s = src();
  assert.match(s, /if \(instanceError\) \{[\s\S]{0,200}throw instanceError;/);
  assert.match(s, /if \(ownershipError\) \{[\s\S]{0,200}throw ownershipError;/);
});

test("super_admin is exempted explicitly, not by accident", () => {
  const s = src();
  assert.match(s, /let ownsStudent = callerProfile\.role === "super_admin";/,
    "the exemption must be a single, visible decision");
});

test("the role check and the key resolver are untouched by this change", () => {
  const s = src();
  assert.match(s, /if \(!callerProfile \|\| \(callerProfile\.role !== "teacher" && callerProfile\.role !== "super_admin"\)\)/);
  assert.match(s, /import \{ publishableKey, serviceKey \} from "\.\.\/_shared\/supabase-keys\.ts"/);
  assert.ok(!/Deno\.env\.get\("SUPABASE_(ANON|SERVICE_ROLE)_KEY"\)/.test(s),
    "no direct legacy key read may be reintroduced");
});

test("no lookup error detail is leaked to the caller", () => {
  const s = src();
  // Errors are logged server-side and re-thrown; the catch block returns a generic message.
  assert.match(s, /console\.error\("INSTANCE LOOKUP ERROR:"/);
  assert.match(s, /console\.error\("OWNERSHIP LOOKUP ERROR:"/);
  for (const m of s.matchAll(/console\.\w+\(([^;]*)\)/g)) {
    assert.ok(!/token|jwt|apikey|serviceKey\(|publishableKey\(|Authorization/i.test(m[1]),
      `a log statement may not carry credential material: ${m[1].slice(0, 70)}`);
  }
});
