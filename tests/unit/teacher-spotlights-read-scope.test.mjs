// Contract guards for the read scope on teacher_spotlights. Offline, source-only: no network,
// no database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// The table's only policy was `FOR SELECT TO authenticated USING (true)`. That is not a predicate:
// every authenticated user could read every teacher's free-text recognition of every named pupil,
// across every classroom. The first test models it to show the breadth as behaviour; the rest pin
// the migration that replaces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260924000000_teacher_spotlights_read_scope.sql";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// Executable SQL only. The comments quote the OLD policy verbatim and name the things this
// migration must NOT do, so an assertion that read the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// ── A model of the two policy sets ───────────────────────────────────────────
// Fictional world: no real ids, no real names, no real messages.
const WORLD = {
  profiles: {
    "teacher-A": { role: "teacher" },
    "teacher-C": { role: "teacher" },
    "pupil-A1":  { role: "student", teacher_id: "teacher-A" },
    "pupil-A2":  { role: "student", teacher_id: "teacher-A" },
    "pupil-C1":  { role: "student", teacher_id: "teacher-C" },
    "admin-1":   { role: "super_admin" },
  },
  // PRIMARY KEY (teacher_id, student_id)
  rows: [
    { teacher_id: "teacher-A", student_id: "pupil-A1" },
    { teacher_id: "teacher-A", student_id: "pupil-A2" },
    { teacher_id: "teacher-C", student_id: "pupil-C1" },
  ],
};
const key = (r) => `${r.teacher_id}/${r.student_id}`;

// BEFORE: TO authenticated USING (true).
function visibleBefore(callerId) {
  if (!callerId || !WORLD.profiles[callerId]) return [];   // anon: not authenticated
  return WORLD.rows;                                       // everything, for everyone
}

// AFTER: own-row (pupil), authored-row (teacher), or super_admin.
function visibleAfter(callerId) {
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];                                      // anon: auth.uid() is NULL
  if (me.role === "super_admin") return WORLD.rows;
  return WORLD.rows.filter(
    (r) => r.student_id === callerId || r.teacher_id === callerId,
  );
}

test("DEFECT: USING (true) shows every pupil's spotlight to every authenticated user", () => {
  // A pupil who has no spotlight of their own still saw all of them.
  const before = visibleBefore("pupil-C1").map(key).sort();
  assert.deepEqual(before, ["teacher-A/pupil-A1", "teacher-A/pupil-A2", "teacher-C/pupil-C1"],
    "USING (true) is TRUE for every row — that is the exposure");
  const after = visibleAfter("pupil-C1").map(key);
  assert.deepEqual(after, ["teacher-C/pupil-C1"], "the scoped policy leaves only their own");
});

test("a pupil reads only the spotlight about them", () => {
  assert.deepEqual(visibleAfter("pupil-A1").map(key), ["teacher-A/pupil-A1"]);
});

test("a pupil cannot read another pupil's spotlight, even a classmate's", () => {
  // pupil-A1 and pupil-A2 share teacher-A, so this is the same-classroom case.
  assert.ok(!visibleAfter("pupil-A1").some((r) => r.student_id === "pupil-A2"),
    "classmates see each other's spotlight through get_classroom_leaderboard(), " +
    "a SECURITY DEFINER RPC — never through a direct table read");
});

test("a teacher reads the spotlights they authored", () => {
  assert.deepEqual(visibleAfter("teacher-A").map(key).sort(),
    ["teacher-A/pupil-A1", "teacher-A/pupil-A2"]);
});

test("another teacher gets none of them", () => {
  assert.deepEqual(visibleAfter("teacher-C").map(key), ["teacher-C/pupil-C1"]);
  assert.ok(!visibleAfter("teacher-C").some((r) => r.teacher_id === "teacher-A"));
});

test("super_admin keeps the visibility it has today", () => {
  assert.equal(visibleAfter("admin-1").length, WORLD.rows.length);
});

test("anon sees nothing, before and after", () => {
  assert.deepEqual(visibleBefore(null), []);
  assert.deepEqual(visibleAfter(null), []);
  assert.deepEqual(visibleAfter("nobody"), []);
});

// ── The migration itself ─────────────────────────────────────────────────────

test("the blanket policy is dropped", () => {
  assert.match(stmts(),
    /DROP POLICY IF EXISTS "teacher_spotlights_select" ON public\.teacher_spotlights;/);
});

test("no blanket read survives: USING (true) appears nowhere in executable SQL", () => {
  assert.ok(!/USING\s*\(\s*true\s*\)/i.test(stmts()),
    "a USING (true) would reintroduce exactly the defect being removed");
});

test("every created policy is SELECT and targets authenticated explicitly", () => {
  const s = stmts();
  const creates = [...s.matchAll(/CREATE POLICY "([^"]+)"[\s\S]*?USING \(/g)];
  assert.equal(creates.length, 3, "exactly three SELECT policies are created");
  for (const m of creates) {
    const block = s.slice(m.index, m.index + 400);
    assert.match(block, /\n\s*FOR SELECT\n/, `${m[1]} must be SELECT-only`);
    assert.match(block, /\n\s*TO authenticated\n/, `${m[1]} must name its role`);
  }
  assert.ok(!/TO PUBLIC/i.test(s), "no policy may target PUBLIC");
  assert.ok(!/TO anon/i.test(s), "anon must never be granted read access");
});

test("the pupil and teacher predicates are row-anchored on the real columns", () => {
  const s = stmts();
  assert.match(s, /USING \(student_id = \(select auth\.uid\(\)\)\)/,
    "the pupil predicate must key on student_id, the pupil the row is about");
  assert.match(s, /USING \(teacher_id = \(select auth\.uid\(\)\)\)/,
    "the teacher predicate must key on teacher_id, the author of the row");
});

test("auth.uid() is wrapped so it is evaluated once, not per row", () => {
  const s = stmts();
  const bare = [...s.matchAll(/auth\.uid\(\)/g)]
    .filter((m) => !s.slice(Math.max(0, m.index - 8), m.index).includes("select "));
  assert.equal(bare.length, 0, "every auth.uid() must be (select auth.uid())");
});

test("super_admin is the ONLY caller-only predicate, and it is role-checked server-side", () => {
  const s = stmts();
  // It reads profiles; that is the documented, deliberate exception.
  const callerOnly = [...s.matchAll(/EXISTS \(\s*SELECT 1\s*FROM public\.profiles/g)];
  assert.equal(callerOnly.length, 1,
    "exactly one policy may use a caller-only predicate — the super_admin one");
  assert.match(s, /p\.id = \(select auth\.uid\(\)\)\s*\n\s*AND p\.role = 'super_admin'/,
    "it must pin the caller's own row and the super_admin role together");
  // And it must not be reachable by claiming a role in the token.
  assert.ok(!/auth\.role\(\)/.test(s), "auth.role() must never be used for authorisation");
  assert.ok(!/user_metadata|raw_user_meta_data|jwt\(\)/i.test(s),
    "token metadata is caller-controlled and must never authorise");
});

test("no SECURITY DEFINER and no new function is introduced", () => {
  const s = stmts();
  assert.ok(!/SECURITY\s+DEFINER/i.test(s));
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?FUNCTION/i.test(s));
});

test("no write policy, grant or data change", () => {
  const s = stmts();
  for (const cmd of ["FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL"]) {
    assert.ok(!s.includes(cmd), `the migration must not create a ${cmd} policy`);
  }
  for (const stmt of ["GRANT ", "REVOKE ", "ALTER TABLE", "CREATE TABLE", "DROP TABLE",
                      "CREATE INDEX", "INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
});

test("only teacher_spotlights policies are affected", () => {
  const s = stmts();
  const targets = [...s.matchAll(/ON public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(targets)], ["teacher_spotlights"]);
  // public.profiles may be READ inside the super_admin predicate, never altered.
  assert.ok(!/ON public\.profiles/.test(s), "profiles must not be altered here");
});

test("the migration is re-runnable", () => {
  const s = stmts();
  const drops = (s.match(/DROP POLICY IF EXISTS/g) ?? []).length;
  const creates = (s.match(/CREATE POLICY/g) ?? []).length;
  assert.equal(creates, 3);
  assert.ok(drops >= creates + 1,
    "the old policy plus each new one is dropped IF EXISTS first, so re-applying converges");
});

test("the migration sorts after every migration that touches teacher_spotlights", () => {
  // Deliberately NOT "last file in the directory": that would encode "nothing has been added
  // since" and break on the next unrelated migration. What matters is that nothing touching this
  // table can override it. "Touches" means in executable SQL, not in a comment.
  const dir = join(REPO, "supabase", "migrations");
  const executable = (body) => body
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  const touching = readdirSync(dir)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .filter((n) => /teacher_spotlights/i.test(executable(readFileSync(join(dir, n), "utf8"))))
    .sort();
  assert.ok(touching.includes("20260924000000_teacher_spotlights_read_scope.sql"));
  assert.equal(touching[touching.length - 1],
    "20260924000000_teacher_spotlights_read_scope.sql",
    "it must apply last among them, so nothing in the tree can re-broaden the scope");
});

test("no later migration re-broadens the read scope", () => {
  const dir = join(REPO, "supabase", "migrations");
  const offenders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".sql") || name === "20260924000000_teacher_spotlights_read_scope.sql") continue;
    const body = readFileSync(join(dir, name), "utf8")
      .split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
    if (/CREATE POLICY[\s\S]{0,400}ON public\.teacher_spotlights/i.test(body)) offenders.push(name);
  }
  assert.deepEqual(offenders, ["20260519000400_social.sql"],
    "only the original social migration may also create a policy on this table");
});

// ── The documented access model must stay true ───────────────────────────────

test("every legitimate consumer still goes through a SECURITY DEFINER RPC", () => {
  const social = readFileSync(
    join(REPO, "supabase", "migrations", "20260519000400_social.sql"), "utf8");
  for (const fn of ["get_my_spotlight", "get_classroom_leaderboard", "get_my_students",
                    "set_spotlight", "remove_spotlight"]) {
    const at = social.indexOf(`FUNCTION public.${fn}`);
    assert.ok(at !== -1, `${fn} must exist`);
    assert.match(social.slice(at, at + 400), /SECURITY DEFINER/,
      `${fn} must stay SECURITY DEFINER, or narrowing the policy would break it`);
  }
});

test("no client or test reads the table directly — the policy is not on a live path", () => {
  // If this ever stops being true, the new policies must be re-checked against that caller.
  const roots = ["js", "tests"];
  const SELF = "teacher-spotlights-read-scope.test.mjs";   // this file names the string it hunts
  const needle = 'from("' + "teacher_spotlights" + '")';
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
  roots.forEach(walk);
  assert.deepEqual(offenders, []);
});
