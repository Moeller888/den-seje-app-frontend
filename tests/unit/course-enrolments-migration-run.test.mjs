// D-362 / F-07: 20261115130000_course_enrolments.sql on production's replayed schema (PGlite), with the real
// database roles: anon, authenticated (pupil, teacher, super_admin through the JWT subject) and service_role.
// Proves: only catalogued courses; a pupil can neither enrol nor write; a teacher only for their own pupil and only a
// teacher_assignable course; super_admin for anyone; revoke keeps history and re-grant restores it; the first
// completion is recorded once by the backend only; the pupil can acknowledge only a recorded completion, once.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { NOT_IN_PRODUCTION, TEST_PROFILES } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261115130000_course_enrolments.sql";
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db;
const ADMIN = uid(7001), T1 = uid(7002), T2 = uid(7003), P1 = uid(7004), P2 = uid(7005), P3 = uid(7006);

async function as(sub, role, fn) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  await db.exec(`SET ROLE ${role}`);
  try { return await fn(); } finally { await db.exec("RESET ROLE"); await db.query("SELECT set_config('request.jwt.claim.sub', '', false)"); }
}
const pupil = (sub, fn) => as(sub, "authenticated", fn);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const fails = async (p, re) => { await assert.rejects(p, re); };

before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  assert.equal((await one("SELECT to_regclass('public.course_enrolments') AS t")).t, null, "the production mirror does not have it");
  await db.exec(read(`supabase/migrations/${FILE}`));
  for (const [id, role, teacher] of [[ADMIN, "super_admin", null], [T1, "teacher", null], [T2, "teacher", null], [P1, "student", T1], [P2, "student", T2], [P3, "student", T1]]) {
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `ce-${id.slice(-4)}@example.test`]);
    await db.query("INSERT INTO public.profiles (id, role, selected_grade, teacher_id) VALUES ($1, $2, 7, $3)", [id, role, teacher]);
  }
  // A second, teacher-assignable course, catalogued the only way a course can be: by the migration owner.
  await db.query("INSERT INTO public.courses (course_id, title, topics, teacher_assignable) VALUES ('pilot_test', 'Testforløb', ARRAY['x'], true)");
});
after(async () => { await db?.close(); });

test("bookkeeping: NOT_IN_PRODUCTION and replayed in the f07 lane only", () => {
  assert.ok(NOT_IN_PRODUCTION[FILE]);
  assert.ok(Object.keys(TEST_PROFILES.f07).includes(FILE));
  assert.ok(!Object.keys(TEST_PROFILES.k1).includes(FILE));
});

test("the catalogue holds exactly the approved pilot course; only pilot_* ids; not teacher-assignable", async () => {
  const c = await one("SELECT course_id, title, teacher_assignable, is_active, cardinality(topics) AS n FROM public.courses WHERE course_id = 'pilot_d362'");
  assert.deepEqual([c.course_id, c.title, c.teacher_assignable, c.is_active, c.n], ["pilot_d362", "Grundloven af 1849", false, true, 4]);
  await fails(db.query("INSERT INTO public.courses (course_id, title) VALUES ('revolutions_democracy', 'Nej')"), /check/i);
});

test("a pupil cannot enrol, write or record anything; anon reads nothing", async () => {
  await pupil(P1, async () => {
    await fails(db.query("INSERT INTO public.course_enrolments (student_id, course_id) VALUES ($1, 'pilot_d362')", [P1]), /permission denied/);
    await fails(db.query("SELECT public.grant_course_enrolment($1, 'pilot_d362')", [P1]), /not_authorized/);
    await fails(db.query("SELECT public.record_course_completion($1, 'pilot_d362')", [P1]), /permission denied/);
    await fails(db.query("SELECT public.course_enrolment_authorize($1, 'pilot_d362')", [P1]), /permission denied/);
  });
  await as(null, "anon", async () => {
    await fails(db.query("SELECT * FROM public.course_enrolments"), /permission denied/);
    await fails(db.query("SELECT public.acknowledge_course_summary('pilot_d362')"), /permission denied/);
  });
});

test("teacher: never the owner-only pilot; a teacher-assignable course only for their own pupil", async () => {
  await as(T1, "authenticated", async () => {
    await fails(db.query("SELECT public.grant_course_enrolment($1, 'pilot_d362')", [P1]), /not_authorized/);
    assert.equal((await one("SELECT public.grant_course_enrolment($1, 'pilot_test') AS r", [P1])).r, "granted");
    await fails(db.query("SELECT public.grant_course_enrolment($1, 'pilot_test')", [P2]), /not_authorized/, "not another teacher's pupil");
    await fails(db.query("SELECT public.grant_course_enrolment($1, 'pilot_test')", [T2]), /not_a_student/);
    await fails(db.query("SELECT public.grant_course_enrolment($1, 'pilot_nope')", [P1]), /course_not_available/);
    assert.equal((await one("SELECT public.revoke_course_enrolment($1, 'pilot_test') AS r", [P1])).r, "revoked");
  });
});

test("super_admin grants the pilot; idempotent; revoke keeps history; re-grant restores it", async () => {
  await as(ADMIN, "authenticated", async () => {
    assert.equal((await one("SELECT public.grant_course_enrolment($1, 'pilot_d362') AS r", [P1])).r, "granted");
    assert.equal((await one("SELECT public.grant_course_enrolment($1, 'pilot_d362') AS r", [P1])).r, "already_active");
  });
  await as(null, "service_role", async () => { await db.query("SELECT public.record_course_completion($1, 'pilot_d362')", [P1]); });
  await as(ADMIN, "authenticated", async () => {
    assert.equal((await one("SELECT public.revoke_course_enrolment($1, 'pilot_d362') AS r", [P1])).r, "revoked");
    assert.equal((await one("SELECT public.revoke_course_enrolment($1, 'pilot_d362') AS r", [P1])).r, "not_active");
  });
  const rv = await one("SELECT status, revoked_at IS NOT NULL AS ra, revoked_by, completed_at IS NOT NULL AS c FROM public.course_enrolments WHERE student_id = $1 AND course_id = 'pilot_d362'", [P1]);
  assert.deepEqual([rv.status, rv.ra, rv.revoked_by, rv.c], ["revoked", true, ADMIN, true], "revoked, nothing deleted");
  await as(ADMIN, "authenticated", async () => {
    assert.equal((await one("SELECT public.grant_course_enrolment($1, 'pilot_d362') AS r", [P1])).r, "reactivated");
  });
  const re = await one("SELECT status, revoked_at, completed_at IS NOT NULL AS c FROM public.course_enrolments WHERE student_id = $1 AND course_id = 'pilot_d362'", [P1]);
  assert.deepEqual([re.status, re.revoked_at, re.c], ["active", null, true], "the first completion survives a revoke/re-grant");
});

test("RLS: a pupil sees only their own enrolments; the catalogue only active courses", async () => {
  await as(ADMIN, "authenticated", async () => { await db.query("SELECT public.grant_course_enrolment($1, 'pilot_d362')", [P2]); });
  const mine = await pupil(P2, async () => (await db.query("SELECT student_id FROM public.course_enrolments")).rows);
  assert.deepEqual(mine.map((r) => r.student_id), [P2]);
  await db.query("UPDATE public.courses SET is_active = false WHERE course_id = 'pilot_test'");
  const cat = await pupil(P2, async () => (await db.query("SELECT course_id FROM public.courses ORDER BY 1")).rows.map((r) => r.course_id));
  assert.deepEqual(cat, ["pilot_d362"]);
  await db.query("UPDATE public.courses SET is_active = true WHERE course_id = 'pilot_test'");
});

test("completion: recorded once by the backend; a later call never moves it; none without an active enrolment", async () => {
  await as(ADMIN, "authenticated", async () => { await db.query("SELECT public.grant_course_enrolment($1, 'pilot_d362')", [P3]); });
  const a = await as(null, "service_role", async () => (await one("SELECT public.record_course_completion($1, 'pilot_d362') AS t", [P3])).t);
  assert.ok(a instanceof Date);
  await db.query("SELECT pg_sleep(0.01)");
  const b = await as(null, "service_role", async () => (await one("SELECT public.record_course_completion($1, 'pilot_d362') AS t", [P3])).t);
  assert.equal(b.getTime(), a.getTime(), "the first completion is the completion");
  const none = await as(null, "service_role", async () => (await one("SELECT public.record_course_completion($1, 'pilot_test') AS t", [P3])).t);
  assert.equal(none, null, "no enrolment → nothing recorded");
});

test("acknowledge: impossible before the server recorded a completion; once after; never for another pupil", async () => {
  const before0 = await pupil(P2, async () => (await one("SELECT public.acknowledge_course_summary('pilot_d362') AS r")).r);
  assert.equal(before0, false, "P2 has not completed: nothing to acknowledge");
  assert.equal((await one("SELECT summary_acknowledged_at FROM public.course_enrolments WHERE student_id = $1", [P2])).summary_acknowledged_at, null);
  assert.equal(await pupil(P3, async () => (await one("SELECT public.acknowledge_course_summary('pilot_d362') AS r")).r), true);
  const t1 = (await one("SELECT summary_acknowledged_at AS t FROM public.course_enrolments WHERE student_id = $1", [P3])).t;
  assert.equal(await pupil(P3, async () => (await one("SELECT public.acknowledge_course_summary('pilot_d362') AS r")).r), true, "idempotent");
  const t2 = (await one("SELECT summary_acknowledged_at AS t FROM public.course_enrolments WHERE student_id = $1", [P3])).t;
  assert.equal(t2.getTime(), t1.getTime(), "set once");
  await fails(pupil(P3, () => db.query("UPDATE public.course_enrolments SET summary_acknowledged_at = NULL")), /permission denied/, "a pupil cannot undo or forge the acknowledgement");
});

test("least privilege: only SELECT on the tables for every API role (service_role too); only the helper is invoker", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const t of ["courses", "course_enrolments"]) {
      for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        assert.equal((await one(`SELECT has_table_privilege($1, 'public.${t}', $2) AS h`, [role, priv])).h, false, `${role} ${priv} ${t}`);
      }
      assert.equal((await one(`SELECT has_table_privilege($1, 'public.${t}', 'SELECT') AS h`, [role])).h, role !== "anon", `${role} SELECT ${t}`);
    }
  }
  await fails(as(null, "service_role", () => db.query("UPDATE public.course_enrolments SET completed_at = NULL")), /permission denied/, "the backend writes only through record_course_completion");
  const fns = (await db.query("SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('course_enrolment_authorize','grant_course_enrolment','revoke_course_enrolment','record_course_completion','acknowledge_course_summary') ORDER BY 1")).rows;
  assert.equal(fns.length, 5);
  for (const f of fns) {
    assert.equal(f.prosecdef, f.proname !== "course_enrolment_authorize", `${f.proname}: definer only where it must write`);
    assert.ok((f.proconfig ?? []).some((c) => c.startsWith("search_path=")), `${f.proname}: pinned search_path`);
  }
  const exec = async (role, sig) => (await one("SELECT has_function_privilege($1, $2, 'EXECUTE') AS h", [role, sig])).h;
  assert.deepEqual(await Promise.all(["anon", "authenticated", "service_role"].map((r) => exec(r, "public.record_course_completion(uuid, text)"))), [false, false, true]);
  assert.deepEqual(await Promise.all(["anon", "authenticated"].map((r) => exec(r, "public.course_enrolment_authorize(uuid, text)"))), [false, false]);
});

test("races and order: a second grant is a no-op; revoke before a completion → nothing recorded, nothing to acknowledge; a revoke after acknowledging changes nothing", async () => {
  const P4 = uid(7007);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'ce-7007@example.test')", [P4]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)", [P4]);
  await as(ADMIN, "authenticated", async () => {
    assert.equal((await one("SELECT public.grant_course_enrolment($1, 'pilot_d362') AS r", [P4])).r, "granted");
    // A second grant arriving after the first (two admin tabs) is a no-op, never a primary-key error.
    assert.equal((await one("SELECT public.grant_course_enrolment($1, 'pilot_d362') AS r", [P4])).r, "already_active");
    assert.equal((await one("SELECT public.revoke_course_enrolment($1, 'pilot_d362') AS r", [P4])).r, "revoked");
  });
  // The pupil finishes the seventh task in a tab that was open when the enrolment was revoked: no completion.
  assert.equal(await as(null, "service_role", async () => (await one("SELECT public.record_course_completion($1, 'pilot_d362') AS t", [P4])).t), null);
  assert.equal(await pupil(P4, async () => (await one("SELECT public.acknowledge_course_summary('pilot_d362') AS r")).r), false);
  const row = await one("SELECT completed_at, summary_acknowledged_at FROM public.course_enrolments WHERE student_id = $1", [P4]);
  assert.deepEqual([row.completed_at, row.summary_acknowledged_at], [null, null]);
  // An acknowledged pupil whose enrolment is revoked: acknowledging again says false (no active course), nothing changes.
  await as(ADMIN, "authenticated", async () => { await db.query("SELECT public.revoke_course_enrolment($1, 'pilot_d362')", [P3]); });
  const before3 = await one("SELECT completed_at, summary_acknowledged_at FROM public.course_enrolments WHERE student_id = $1", [P3]);
  assert.equal(await pupil(P3, async () => (await one("SELECT public.acknowledge_course_summary('pilot_d362') AS r")).r), false);
  const after3 = await one("SELECT completed_at, summary_acknowledged_at FROM public.course_enrolments WHERE student_id = $1", [P3]);
  assert.deepEqual([after3.completed_at.getTime(), after3.summary_acknowledged_at.getTime()], [before3.completed_at.getTime(), before3.summary_acknowledged_at.getTime()]);
});
