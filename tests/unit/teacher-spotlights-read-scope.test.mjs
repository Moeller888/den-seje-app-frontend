// Contract guards for the read scope on teacher_spotlights. Offline, source-only: no network,
// no database, no production call.
//
// THE DEFECT THESE GUARD AGAINST
// The table's only policy was `FOR SELECT TO authenticated USING (true)`. That is not a predicate:
// every authenticated user — including every pupil account — could read every teacher's free-text
// recognition of every named pupil, across every classroom.
//
// THE FIX IS A DENIAL, NOT A NARROWING
// Every legitimate read goes through a SECURITY DEFINER RPC, which bypasses RLS and does its own
// pupil/classroom/teacher scoping. Nothing reads the table directly, so pupils and teachers need
// no direct SELECT at all and are given none. super_admin keeps direct access as an explicit
// owner decision for the operations role.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "supabase/migrations/20260924000000_teacher_spotlights_read_scope.sql";
const SOCIAL = "supabase/migrations/20260519000400_social.sql";
const sql = () => readFileSync(join(REPO, MIGRATION), "utf8");
// (12) Assertions run against EXECUTABLE SQL. The comments quote the old policy verbatim and name
// the policies this file must NOT create, so reading the prose would test the wrong text.
const stmts = () => sql()
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// ── A model of the direct-table read, before and after ───────────────────────
// Fictional world: no real ids, no real names, no real messages.
const WORLD = {
  profiles: {
    "teacher-A": { role: "teacher" },
    "teacher-C": { role: "teacher" },
    "pupil-A1":  { role: "student" },
    "pupil-C1":  { role: "student" },
    "admin-1":   { role: "super_admin" },
  },
  rows: [                                   // PRIMARY KEY (teacher_id, student_id)
    { teacher_id: "teacher-A", student_id: "pupil-A1" },
    { teacher_id: "teacher-C", student_id: "pupil-C1" },
  ],
};
const key = (r) => `${r.teacher_id}/${r.student_id}`;

// BEFORE: TO authenticated USING (true) — everything, for every signed-in caller.
const visibleBefore = (callerId) =>
  (callerId && WORLD.profiles[callerId]) ? WORLD.rows : [];

// AFTER: only super_admin has a direct SELECT policy. Everyone else matches no policy at all.
const visibleAfter = (callerId) => {
  const me = WORLD.profiles[callerId] ?? null;
  if (!me) return [];                                  // anon: auth.uid() is NULL
  return me.role === "super_admin" ? WORLD.rows : [];
};

test("DEFECT: USING (true) showed every spotlight to every authenticated user", () => {
  assert.deepEqual(visibleBefore("pupil-C1").map(key).sort(),
    ["teacher-A/pupil-A1", "teacher-C/pupil-C1"],
    "USING (true) is TRUE for every row — that is the exposure");
  assert.deepEqual(visibleBefore("teacher-C").map(key).sort(),
    ["teacher-A/pupil-A1", "teacher-C/pupil-C1"],
    "including rows authored by a different teacher");
});

// (2) A pupil gets nothing directly.
test("an ordinary pupil has NO direct read access, not even to the spotlight about them", () => {
  assert.deepEqual(visibleAfter("pupil-A1"), [],
    "hub.html reads the pupil's own spotlight through get_my_spotlight(), a SECURITY DEFINER RPC");
});

// (3) A teacher gets nothing directly — including their own rows.
test("a teacher has NO direct read access, including rows they authored themselves", () => {
  assert.deepEqual(visibleAfter("teacher-A"), [],
    "js/teacher.js reads them through get_my_students(), a SECURITY DEFINER RPC");
});

// (4) Another teacher likewise.
test("another teacher has NO direct read access", () => {
  assert.deepEqual(visibleAfter("teacher-C"), []);
});

// (5) anon.
test("anon has NO direct read access, before and after", () => {
  assert.deepEqual(visibleBefore(null), []);
  assert.deepEqual(visibleAfter(null), []);
  assert.deepEqual(visibleAfter("nobody"), []);
});

// (6) super_admin.
test("super_admin reads every row directly", () => {
  assert.deepEqual(visibleAfter("admin-1").map(key).sort(),
    ["teacher-A/pupil-A1", "teacher-C/pupil-C1"]);
});

// ── The migration itself ─────────────────────────────────────────────────────

// (1) The old policy is removed.
test("the blanket policy is dropped", () => {
  assert.match(stmts(),
    /DROP POLICY IF EXISTS "teacher_spotlights_select" ON public\.teacher_spotlights;/);
});

// (8) No USING (true) anywhere.
test("no USING (true) survives in executable SQL", () => {
  assert.ok(!/USING\s*\(\s*true\s*\)/i.test(stmts()),
    "a USING (true) would reintroduce exactly the defect being removed");
});

// (7) Exactly one policy is created, and it is the super_admin one.
test("exactly one SELECT policy is created, and it is the super_admin policy", () => {
  const s = stmts();
  const created = [...s.matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(created, ["super_admins read all spotlights"],
    "no pupil, teacher or general authenticated policy may be created");
});

// (7) And the pupil/teacher policies are affirmatively dropped, not merely absent.
test("any pupil or teacher policy from an earlier draft is dropped, so re-applying converges", () => {
  const s = stmts();
  for (const name of ["students read own spotlight", "teachers read spotlights they authored"]) {
    assert.ok(s.includes(`DROP POLICY IF EXISTS "${name}"`),
      `${name} must be dropped IF EXISTS`);
    assert.ok(!s.includes(`CREATE POLICY "${name}"`),
      `${name} must never be created`);
  }
});

test("the created policy is SELECT-only, targets authenticated, and never anon or PUBLIC", () => {
  const s = stmts();
  const at = s.indexOf('CREATE POLICY "super_admins read all spotlights"');
  const block = s.slice(at, at + 500);
  assert.match(block, /\n\s*FOR SELECT\n/);
  assert.match(block, /\n\s*TO authenticated\n/);
  assert.ok(!/TO PUBLIC/i.test(s), "no policy may target PUBLIC");
  assert.ok(!/TO anon/i.test(s), "anon must never be granted read access");
});

test("the super_admin role is read server-side from profiles, never from the token", () => {
  const s = stmts();
  assert.match(s, /EXISTS \(\s*SELECT 1\s*FROM public\.profiles p\s*WHERE p\.id = \(SELECT auth\.uid\(\)\)\s*AND p\.role = 'super_admin'/,
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

// (9) Nothing else may be introduced.
test("no SECURITY DEFINER, helper function, view, grant, write policy or data change", () => {
  const s = stmts();
  assert.ok(!/SECURITY\s+DEFINER/i.test(s));
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?FUNCTION/i.test(s), "no helper function may be added");
  assert.ok(!/CREATE\s+(OR REPLACE\s+)?VIEW/i.test(s), "no view may be added");
  for (const cmd of ["FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL"]) {
    assert.ok(!s.includes(cmd), `the migration must not create a ${cmd} policy`);
  }
  for (const stmt of ["GRANT ", "REVOKE ", "ALTER TABLE", "CREATE TABLE", "DROP TABLE",
                      "CREATE INDEX", "INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE"]) {
    assert.ok(!s.includes(stmt), `the migration must not contain ${stmt.trim()}`);
  }
});

test("only teacher_spotlights policies are affected; profiles is read, never altered", () => {
  const s = stmts();
  const targets = [...s.matchAll(/ON public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(targets)], ["teacher_spotlights"]);
  assert.ok(!/ON public\.profiles/.test(s), "profiles must not be altered here");
});

test("the migration is re-runnable", () => {
  const s = stmts();
  const drops = (s.match(/DROP POLICY IF EXISTS/g) ?? []).length;
  const creates = (s.match(/CREATE POLICY/g) ?? []).length;
  assert.equal(creates, 1);
  assert.equal(drops, 4,
    "the old policy, both earlier-draft policies, and the new one are each dropped IF EXISTS");
});

test("the migration sorts after every migration that touches teacher_spotlights", () => {
  // Deliberately NOT "last file in the directory": that would encode "nothing has been added
  // since" and break on the next unrelated migration. "Touches" means in executable SQL.
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

// ── (10) The RPC layer is the access model, so its contracts must hold ───────

test("every spotlight RPC is still SECURITY DEFINER", () => {
  const social = readFileSync(join(REPO, SOCIAL), "utf8");
  for (const fn of ["get_my_spotlight", "get_classroom_leaderboard", "get_my_students",
                    "set_spotlight", "remove_spotlight"]) {
    const at = social.indexOf(`FUNCTION public.${fn}`);
    assert.ok(at !== -1, `${fn} must exist`);
    assert.match(social.slice(at, at + 400), /SECURITY DEFINER/,
      `${fn} must stay SECURITY DEFINER — it is now the ONLY read path for pupils and teachers`);
  }
});

test("get_my_spotlight filters on the caller's own id", () => {
  const social = readFileSync(join(REPO, SOCIAL), "utf8");
  const at = social.indexOf("FUNCTION public.get_my_spotlight");
  const body = social.slice(at, social.indexOf("$$;", at));
  assert.match(body, /v_uid\s+UUID\s*:=\s*auth\.uid\(\)/, "the identity must come from auth.uid()");
  assert.match(body, /WHERE\s+ts\.student_id = v_uid/,
    "a pupil must only ever receive their own spotlight");
  assert.match(body, /IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'/,
    "an unauthenticated call must be refused, not treated as a wildcard");
});

test("get_classroom_leaderboard is scoped to one classroom and that classroom's teacher", () => {
  const social = readFileSync(join(REPO, SOCIAL), "utf8");
  const at = social.indexOf("FUNCTION public.get_classroom_leaderboard");
  const body = social.slice(at, social.indexOf("$$;", at));
  assert.match(body, /IF v_role = 'teacher' THEN\s*\n\s*v_teacher_id := v_uid;/,
    "a teacher's classroom is their own");
  assert.match(body, /WHERE\s+teacher_id = v_teacher_id AND role = 'student'/,
    "the roster must be restricted to that classroom");
  assert.match(body, /ON ts\.student_id = v\.student_id\s*\n\s*AND ts\.teacher_id = v_teacher_id/,
    "spotlights must be joined on that classroom's own teacher, never across classrooms");
});

test("set_spotlight verifies teacher role AND ownership of the pupil", () => {
  const social = readFileSync(join(REPO, SOCIAL), "utf8");
  const at = social.indexOf("FUNCTION public.set_spotlight");
  const body = social.slice(at, social.indexOf("$$;", at));
  assert.match(body, /IF v_role != 'teacher' THEN RAISE EXCEPTION 'not_teacher'/);
  assert.match(body, /WHERE\s+id = p_student_id AND teacher_id = v_uid AND role = 'student'/,
    "the pupil must belong to the calling teacher");
  assert.match(body, /RAISE EXCEPTION 'student_not_in_class'/);
  assert.match(body, /VALUES\s*\n?\s*\(v_uid,/,
    "the author must be the verified caller, never a parameter");
});

test("remove_spotlight is scoped to the calling teacher", () => {
  const social = readFileSync(join(REPO, SOCIAL), "utf8");
  const at = social.indexOf("FUNCTION public.remove_spotlight");
  const body = social.slice(at, social.indexOf("$$;", at));
  assert.match(body, /IF v_role != 'teacher' THEN RAISE EXCEPTION 'not_teacher'/);
  assert.match(body, /DELETE FROM public\.teacher_spotlights\s*\n\s*WHERE\s+teacher_id = v_uid AND student_id = p_student_id/,
    "a teacher must only be able to delete their own spotlight");
});

// (11) Nothing may start reading the table directly.
test("no client or test reads the table directly", () => {
  // This is load-bearing now: with no pupil/teacher policy, a direct query would return nothing.
  // If this ever fails, the caller must be moved to an RPC — not the policy re-broadened.
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
  ["js", "tests"].forEach(walk);
  assert.deepEqual(offenders, []);
});
