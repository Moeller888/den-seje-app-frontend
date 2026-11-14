// D-362 pilot scope: the 15 pilot rows (20261108090100 + 20261108090200) carry their own
// learning_objective 'pilot_d362', so they are servable ONLY to a pupil whose profiles.active_domains holds
// 'pilot_d362' — enforced on the server, not by any client parameter.
//
// Why that gates (docs/decisions/D-362.md "Pilotens adgang"):
//   - get-next-question derives the domains on the server (get-next-question/scope.ts deriveQuestionScope):
//     historie = the history part of profiles.active_domains, or the fixed HISTORY_DOMAINS when none are
//     assigned; engelsk/dansk = one fixed domain each. The request's subject only chooses among those.
//   - Every selection RPC get-next-question calls filters learning_objective = ANY(p_domains).
//   - A pupil cannot write profiles.active_domains (20261010102416_profiles_self_update_columns.sql);
//     only set_student_domains (SECURITY DEFINER, caller must be the pupil's teacher) can.
//
// What this proves on the isolated replayed schema (PGlite), with ALL 15 pilot rows ACTIVATED inside the
// test (simulating the later owner activation; nothing here is applied anywhere):
//   a. deriveQuestionScope never yields pilot_d362 for a regular pupil, whatever the client's subject;
//      it does when the profile's active_domains contains it.
//   b. With the domains a regular pupil gets, no selection RPC returns a pilot row (new or repeat), at
//      several levels across 5800–6800; a regular active history row is returned, so the RPCs are live.
//   c. Positive control: p_domains = ['pilot_d362'] (the approved test account) returns pilot rows of all
//      three forms.
//   d. A pupil (role authenticated, its own JWT sub) cannot UPDATE its own active_domains, cannot call
//      set_student_domains for itself, and cannot EXECUTE any selection RPC directly.
//   e. KNOWN, DOCUMENTED GAP before the lock migration (production today): the pupil's teacher CAN assign
//      pilot_d362 once the rows are active (not while inactive). 20261109151000_set_student_domains_pilot_lock.sql
//      (written, NOT applied) closes it; the last test applies it here, inside a rolled-back transaction, and
//      proves the gap is closed. Full proof: tests/unit/set-student-domains-pilot-lock-migration-run.test.mjs.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6); the platform stub's auth.uid() reads
// request.jwt.claim.sub (tests/isolated/schema/pglite-platform.sql), as other replay tests use it.
// Passing is not permission to apply (D-110).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { deriveQuestionScope, HISTORY_DOMAINS } from "../../supabase/functions/get-next-question/scope.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const read = (f) => readFileSync(join(MIGRATIONS, f), "utf8");
const STIMULUS_SQL = read("20261108090100_stimulus_pilot_content.sql");
const ACTIVATION_SQL = read("20261108090000_order_categorize_activation.sql");
const OC_SQL = read("20261108090200_order_categorize_pilot_content.sql");
const LOCK_SQL = read("20261109151000_set_student_domains_pilot_lock.sql");

const PILOT = "pilot_d362";
const GRADE = 7;
const LEVELS = [5800, 6050, 6300, 6550, 6800];
const PUPIL = "00000000-0000-4000-8000-0000000d3621";
const TEACHER = "00000000-0000-4000-8000-0000000d3622";
const CONTROL_QUESTION = "Kontrol D-362: hvilket år blev Grundloven underskrevet?";

// Every client subject value the request could carry, including hostile ones.
const SUBJECTS = [undefined, null, "", "historie", "engelsk", "dansk", PILOT, "pilot_d362 ", "PILOT_D362",
  ["pilot_d362"], { subject: PILOT }, 42, "garbage", "historie,pilot_d362"];

let db;
let pilotIds = [];
let controlId;

before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(STIMULUS_SQL);
  await db.exec(ACTIVATION_SQL);
  await db.exec(OC_SQL);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${TEACHER}', 'laerer-d362@example.test'), ('${PUPIL}', 'elev-d362@example.test');
                 INSERT INTO public.profiles (id, role) VALUES ('${TEACHER}', 'teacher');
                 INSERT INTO public.profiles (id, role, selected_grade, teacher_id) VALUES ('${PUPIL}', 'student', ${GRADE}, '${TEACHER}');`);
  // A regular, active history question in the pilot's subject, grade and level range: proves the RPCs are
  // live for the regular scope, so an empty pilot result is the domain filter, not an empty pool.
  controlId = (await db.query(`INSERT INTO public.questions (type, content, answer_format, answer_type, metadata, difficulty,
      question_type, is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
    VALUES ('mc_single', $1::jsonb, 'mc', 'short', '{"domain":"revolutions_democracy"}'::jsonb, 2, 'auto', true,
      'revolutions_democracy', ${GRADE}, 2, 6300) RETURNING id`,
  [JSON.stringify({ type: "mc", question: CONTROL_QUESTION, options: ["1660", "1788", "1849", "1915"], correct: "1849",
    accepted_answers: ["1849"], review_text: "Grundloven blev underskrevet den 5. juni 1849." })])).rows[0].id;
  // Simulate the later, separate owner activation of all 15 pilot rows.
  const act = await db.query(`UPDATE public.questions SET is_active = true WHERE metadata->>'pilot' = 'D-362' RETURNING id`);
  pilotIds = act.rows.map((x) => x.id);
  assert.equal(pilotIds.length, 15, "all 15 pilot rows are stored and activated in the test");
});
after(async () => { await db?.close(); });

const isPilot = (id) => pilotIds.includes(id);
const pilotRowsIn = (ids) => ids.filter(isPilot);
const formsOf = async (ids) => (await db.query(
  "SELECT DISTINCT metadata->>'pilot_form' AS f FROM public.questions WHERE id = ANY ($1::uuid[]) ORDER BY 1", [ids])).rows.map((x) => x.f);

// Domains a regular grade-7 pupil can end up with: unassigned (all history) and each single history domain.
const REGULAR_DOMAIN_SETS = [[...HISTORY_DOMAINS], ...HISTORY_DOMAINS.map((d) => [d])];

const level = async (lvl, domains) => (await db.query(
  "SELECT id FROM public.get_level_questions_for_student($1::uuid, $2::integer, $3::text[], 100)", [PUPIL, lvl, domains])).rows.map((x) => x.id);
const candidates = async (domains) => (await db.query(
  "SELECT id FROM public.get_question_candidates_for_student($1::uuid, $2::smallint, $3::text[], 100)", [PUPIL, GRADE, domains])).rows.map((x) => x.id);
const unserved = async (domains) => (await db.query(
  "SELECT id FROM public.get_unserved_questions_for_student($1::uuid, $2::smallint, $3::text[])", [PUPIL, GRADE, domains])).rows.map((x) => x.id);

// ── a. scope.ts ─────────────────────────────────────────────────────────────────────────────────────

test("a. deriveQuestionScope never yields pilot_d362 for a regular pupil, whatever subject the client sends", () => {
  assert.equal(HISTORY_DOMAINS.includes(PILOT), false, "pilot_d362 is not a fixed history domain");
  const profiles = [
    { selected_grade: GRADE, active_domains: null },
    { selected_grade: GRADE, active_domains: [] },
    { selected_grade: GRADE, active_domains: ["revolutions_democracy"] },
    { selected_grade: GRADE, active_domains: ["revolutions_democracy", "vikings", "english", "danish"] },
    ...HISTORY_DOMAINS.map((d) => ({ selected_grade: GRADE, active_domains: [d] })),
    null, undefined, "garbage", { selected_grade: GRADE, active_domains: "pilot_d362" },
    { selected_grade: GRADE, active_domains: [PILOT, 7] }, // malformed list → treated as unassigned
  ];
  for (const profile of profiles) {
    for (const subject of SUBJECTS) {
      const s = deriveQuestionScope(profile, subject);
      const where = `profile ${JSON.stringify(profile)}, subject ${JSON.stringify(subject)}`;
      assert.equal(s.subjectDomains.includes(PILOT), false, `subjectDomains: ${where}`);
      assert.equal(s.releaseDomains.includes(PILOT), false, `releaseDomains: ${where}`);
      assert.ok(s.subjectDomains.every((d) => typeof d === "string" && d.length > 0), where);
    }
  }
});

test("a. deriveQuestionScope yields pilot_d362 only when the profile's active_domains contains it (history subject)", () => {
  const approved = { selected_grade: GRADE, active_domains: [PILOT] };
  for (const subject of [undefined, null, "historie", PILOT, "garbage"]) {
    assert.deepEqual(deriveQuestionScope(approved, subject).subjectDomains, [PILOT], `subject ${JSON.stringify(subject)}`);
  }
  assert.deepEqual(deriveQuestionScope({ selected_grade: GRADE, active_domains: ["vikings", PILOT] }, "historie").subjectDomains,
    ["vikings", PILOT]);
  // English and Danish use their fixed domain even for the approved account.
  assert.deepEqual(deriveQuestionScope(approved, "engelsk").subjectDomains, ["english"]);
  assert.deepEqual(deriveQuestionScope(approved, "dansk").subjectDomains, ["danish"]);
  // releaseDomains (fagskift): the subject's fixed domains PLUS the pupil's own assigned history domains, so an
  // open pilot round survives a reload (D-362 P1, owner decision 2026-11-13). Only for historie, and only when the
  // profile itself holds pilot_d362; engelsk/dansk keep their single fixed domain.
  assert.deepEqual(deriveQuestionScope(approved, "historie").releaseDomains, [...HISTORY_DOMAINS, PILOT]);
  assert.deepEqual(deriveQuestionScope({ selected_grade: GRADE, active_domains: ["vikings", PILOT, PILOT] }, "historie").releaseDomains,
    [...HISTORY_DOMAINS, PILOT], "no duplicates");
  assert.deepEqual(deriveQuestionScope(approved, "engelsk").releaseDomains, ["english"]);
  assert.deepEqual(deriveQuestionScope(approved, "dansk").releaseDomains, ["danish"]);
});

// ── b. regular scope: no selection RPC returns a pilot row ──────────────────────────────────────────

test("b. get_level_questions_for_student: no pilot row for any regular domain set at levels 5800–6800", async () => {
  for (const domains of REGULAR_DOMAIN_SETS) {
    for (const lvl of LEVELS) {
      const got = await level(lvl, domains);
      assert.deepEqual(pilotRowsIn(got), [], `level ${lvl}, domains ${domains.join(",")}`);
    }
  }
  assert.ok((await level(6300, [...HISTORY_DOMAINS])).includes(controlId), "the regular history row is served (RPC is live)");
});

test("b. get_question_candidates_for_student and get_unserved_questions_for_student: no pilot row for any regular domain set", async () => {
  for (const domains of REGULAR_DOMAIN_SETS) {
    assert.deepEqual(pilotRowsIn(await candidates(domains)), [], `candidates, domains ${domains.join(",")}`);
    assert.deepEqual(pilotRowsIn(await unserved(domains)), [], `unserved, domains ${domains.join(",")}`);
  }
  assert.ok((await candidates([...HISTORY_DOMAINS])).includes(controlId), "candidates: the regular history row is returned");
  assert.ok((await unserved([...HISTORY_DOMAINS])).includes(controlId), "unserved: the regular history row is returned");
  // Both are live for the pilot domain too (so the empty results above are the domain filter).
  assert.equal((await candidates([PILOT])).filter(isPilot).length, 15);
  assert.equal((await unserved([PILOT])).filter(isPilot).length, 15);
});

// The repeat RPCs reopen an ANSWERED instance. A regular pupil can only own a pilot instance if it was
// served one before; seed that worst case anyway (wrong and oldest, so a pilot instance would be picked
// first if the domain filter let it through) next to one answered regular instance.
const REPEATS = [
  ["request_repeat_question_for_student", (d) => [PUPIL, GRADE, d], "$1::uuid, $2::smallint, $3::text[]"],
  ["request_repeat_question_servable_for_student", (d) => [PUPIL, GRADE, d], "$1::uuid, $2::smallint, $3::text[]"],
  ["request_repeat_level_question_for_student", (d) => [PUPIL, d], "$1::uuid, $2::text[]"],
];
async function withAnsweredHistory(fn) {
  await db.exec("BEGIN");
  try {
    for (const [i, q] of pilotIds.entries()) {
      await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot, repeat_count,
        answered, answered_at, user_answer, was_correct, next_review_at)
        VALUES ($1, $2, 'x', 1, 1, 0, true, now() - ($3 || ' days')::interval, 'y', false, now())`, [PUPIL, q, String(100 + i)]);
    }
    await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot, repeat_count,
      answered, answered_at, user_answer, was_correct, next_review_at)
      VALUES ($1, $2, '1849', 1, 1, 0, true, now() - interval '1 day', '1849', true, now())`,
    [PUPIL, controlId]);
    return await fn();
  } finally {
    await db.exec("ROLLBACK");
  }
}
const instanceQuestion = async (instanceId) => (await db.query(
  "SELECT question_id FROM public.question_instances WHERE id = $1", [instanceId])).rows[0]?.question_id ?? null;

for (const [name, args, sig] of REPEATS) {
  test(`b. ${name}: reopens no pilot instance for any regular domain set (and does for pilot_d362)`, async () => {
    for (const domains of REGULAR_DOMAIN_SETS) {
      await withAnsweredHistory(async () => {
        const id = (await db.query(`SELECT public.${name}(${sig}) AS id`, args(domains))).rows[0].id;
        const q = id === null ? null : await instanceQuestion(id);
        assert.equal(q !== null && isPilot(q), false, `${name} reopened a pilot row for domains ${domains.join(",")}`);
        if (domains.includes("revolutions_democracy")) assert.equal(q, controlId, `${name}: the regular row is reopened (RPC is live)`);
        else assert.equal(id, null, `${name}: nothing to repeat in ${domains.join(",")}`);
      });
    }
    await withAnsweredHistory(async () => {
      const id = (await db.query(`SELECT public.${name}(${sig}) AS id`, args([PILOT]))).rows[0].id;
      assert.ok(id !== null && isPilot(await instanceQuestion(id)), `${name}: positive control with pilot_d362`);
    });
  });
}

// ── c. positive control: the approved test account ─────────────────────────────────────────────────

test("c. positive control: p_domains = ['pilot_d362'] serves pilot rows of all three forms (and only pilot rows)", async () => {
  const seen = new Set();
  for (const lvl of LEVELS) {
    const got = await level(lvl, [PILOT]);
    assert.ok(got.length > 0, `level ${lvl}`);
    assert.deepEqual(got.filter((id) => !isPilot(id)), [], `level ${lvl}: only pilot rows in the pilot domain`);
    got.forEach((id) => seen.add(id));
  }
  assert.deepEqual(await formsOf([...seen]), ["categorize", "order", "stimulus"]);
  // The approved profile, through scope.ts, reaches the same rows.
  const scope = deriveQuestionScope({ selected_grade: GRADE, active_domains: [PILOT] }, "historie");
  assert.deepEqual(await formsOf(await level(6300, scope.subjectDomains)), ["categorize", "order", "stimulus"]);
});

// ── d. the pupil cannot widen its own scope ─────────────────────────────────────────────────────────

async function as(uid, fn) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec("SET ROLE authenticated");
  try { return await fn(); }
  finally {
    await db.exec("RESET ROLE");
    await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}
const activeDomainsOf = async (id) => (await db.query("SELECT active_domains FROM public.profiles WHERE id = $1", [id])).rows[0].active_domains;

test("d. a pupil (authenticated, own JWT) cannot UPDATE its own profiles.active_domains", async () => {
  const before_ = await activeDomainsOf(PUPIL);
  await as(PUPIL, async () => {
    assert.equal((await db.query("SELECT current_user AS u")).rows[0].u, "authenticated");
    await assert.rejects(db.query("UPDATE public.profiles SET active_domains = ARRAY['pilot_d362'] WHERE id = $1", [PUPIL]),
      /permission denied/);
  });
  assert.deepEqual(await activeDomainsOf(PUPIL), before_);
  // Catalog: no API role holds UPDATE on the column (only placement_band/current_band are client-writable).
  for (const role of ["anon", "authenticated"]) {
    const { ok } = (await db.query("SELECT has_column_privilege($1, 'public.profiles', 'active_domains', 'UPDATE') AS ok", [role])).rows[0];
    assert.equal(ok, false, `${role} can UPDATE profiles.active_domains`);
  }
});

test("d. a pupil cannot call set_student_domains for itself (it is not its own teacher)", async () => {
  await as(PUPIL, async () => {
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL]),
      /Not authorized: caller is not the teacher of this student/);
  });
  assert.equal(await activeDomainsOf(PUPIL), null);
});

test("d. no selection RPC is executable by a pupil (anon/authenticated); the scope is only the server's", async () => {
  const fns = [
    "get_level_questions_for_student(uuid, integer, text[], integer)",
    "get_question_candidates_for_student(uuid, smallint, text[], integer)",
    "get_unserved_questions_for_student(uuid, smallint, text[])",
    "request_repeat_question_for_student(uuid, smallint, text[])",
    "request_repeat_question_servable_for_student(uuid, smallint, text[])",
    "request_repeat_level_question_for_student(uuid, text[])",
  ];
  for (const fn of fns) {
    for (const role of ["anon", "authenticated"]) {
      const { ok } = (await db.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok", [role, `public.${fn}`])).rows[0];
      assert.equal(ok, false, `${role} can EXECUTE ${fn}`);
    }
  }
  await as(PUPIL, async () => {
    await assert.rejects(db.query("SELECT id FROM public.get_level_questions_for_student($1::uuid, 6300, ARRAY['pilot_d362'], 100)", [PUPIL]),
      /permission denied/);
  });
});

// ── e. KNOWN GAP before the lock migration (D-362; production runs the old function until it is applied) ─

test("e. KNOWN GAP before the lock migration (D-362, open in production until 20261109151000 is applied): the pupil's teacher CAN assign pilot_d362 once the rows are active, not while inactive", async () => {
  // While the pilot rows are inactive: refused (no active question in the domain at the pupil's grade).
  // Not inside a transaction: the expected error would abort it before RESET ROLE.
  await db.query("UPDATE public.questions SET is_active = false WHERE id = ANY ($1::uuid[])", [pilotIds]);
  try {
    await as(TEACHER, async () => {
      await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL]),
        /Domain "pilot_d362" has no accessible questions for grade 7 students/);
    });
  } finally {
    await db.query("UPDATE public.questions SET is_active = true WHERE id = ANY ($1::uuid[])", [pilotIds]);
  }
  assert.equal(await activeDomainsOf(PUPIL), null);

  // Once active: accepted. This is the residual the owner must close (plan in D-362), pinned so a fix shows.
  await db.exec("BEGIN");
  try {
    await as(TEACHER, async () => {
      await db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL]);
    });
    assert.deepEqual(await activeDomainsOf(PUPIL), [PILOT]);
    const profile = (await db.query("SELECT active_domains, selected_grade FROM public.profiles WHERE id = $1", [PUPIL])).rows[0];
    const scope = deriveQuestionScope(profile, "historie");
    assert.deepEqual(scope.subjectDomains, [PILOT]);
    assert.equal(pilotRowsIn(await level(6300, scope.subjectDomains)).length > 0, true);
  } finally {
    await db.exec("ROLLBACK");
  }
  assert.equal(await activeDomainsOf(PUPIL), null);
});

test("e. a teacher who is NOT the pupil's teacher cannot assign pilot_d362", async () => {
  const other = "00000000-0000-4000-8000-0000000d3623";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${other}', 'anden-laerer-d362@example.test');
                 INSERT INTO public.profiles (id, role) VALUES ('${other}', 'teacher');`);
  await as(other, async () => {
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL]),
      /Not authorized: caller is not the teacher of this student/);
  });
  assert.equal(await activeDomainsOf(PUPIL), null);
});

test("e. after the lock migration (20261109151000, applied here in a rolled-back transaction): the pupil's teacher can NOT assign pilot_d362, and an owner-granted pilot_d362 survives the teacher's save", async () => {
  await db.exec("BEGIN");
  try {
    await db.exec(LOCK_SQL);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [TEACHER]);
    await db.exec("SAVEPOINT refused");
    await db.exec("SET LOCAL ROLE authenticated");
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL]),
      /Domain "pilot_d362" is a pilot domain and cannot be assigned by a teacher\. Pilot access is granted by the project owner\./);
    await db.exec("ROLLBACK TO SAVEPOINT refused");
    assert.equal((await db.query("SELECT current_user AS u")).rows[0].u, "postgres");
    assert.equal(await activeDomainsOf(PUPIL), null);

    // Owner grant (superuser UPDATE), then the teacher's ordinary save keeps it.
    await db.query("UPDATE public.profiles SET active_domains = ARRAY['pilot_d362', 'vikings'] WHERE id = $1", [PUPIL]);
    await db.exec("SET LOCAL ROLE authenticated");
    await db.query("SELECT public.set_student_domains($1::uuid, ARRAY['revolutions_democracy'])", [PUPIL]);
    await db.exec("RESET ROLE");
    assert.deepEqual(await activeDomainsOf(PUPIL), ["revolutions_democracy", PILOT]);
    const profile = (await db.query("SELECT active_domains, selected_grade FROM public.profiles WHERE id = $1", [PUPIL])).rows[0];
    assert.deepEqual(deriveQuestionScope(profile, "historie").subjectDomains, ["revolutions_democracy", PILOT]);
  } finally {
    await db.exec("ROLLBACK");
  }
  assert.equal(await activeDomainsOf(PUPIL), null);
});
