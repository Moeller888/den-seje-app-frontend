// D-362 pilot lock: 20261109151000_set_student_domains_pilot_lock.sql (NOT applied in production).
//
// Runs the migration on the isolated replayed schema (PGlite) with all 15 D-362 pilot rows ACTIVATED inside
// the test (the state in which the old function lets any teacher assign pilot_d362) and proves:
//   1. a teacher cannot add pilot_d362 (or any pilot_* key, any case); the profile is unchanged;
//   2. pilot domains the pupil already has (set by an owner/superuser UPDATE) survive a teacher's save:
//      a list gets them appended, NULL or '{}' keeps exactly them;
//   3. every non-pilot input gives exactly the old function's outcome (same result or same error text),
//      measured on the SAME inputs against the old body before the migration runs;
//   4. signature, SECURITY DEFINER, search_path, owner and ACL are unchanged; no question row changes;
//   5. a pupil still cannot write its own active_domains or call the function for itself;
//   6. guard: an unreviewed or missing body is refused and nothing changes; both reviewed twin bodies are
//      accepted; a re-run is a no-op; the header's ROLLBACK block restores the old body (md5) and refuses
//      to run on anything but this file's body;
//   7. with the lock applied, scope.ts yields pilot_d362 only for the pupil whose profile has it.
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6); the platform stub's auth.uid() reads
// request.jwt.claim.sub (tests/isolated/schema/pglite-platform.sql). Production's md5 of the function has
// NOT been measured; it must be confirmed read-only before applying. Passing is not permission to apply.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";
import { deriveQuestionScope } from "../../supabase/functions/get-next-question/scope.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const read = (f) => readFileSync(join(MIGRATIONS, f), "utf8");
const LOCK_FILE = "20261109151000_set_student_domains_pilot_lock.sql";
const LOCK_SQL = read(LOCK_FILE);
const TWIN_085315 = read("20260608085315_fix_set_student_domains_null_grade.sql");
const TWIN_110000 = read("20260608110000_fix_set_student_domains_null_grade.sql");

const MD5_085315 = "953a299198a78899e9691686731899f8";
const MD5_110000 = "e4ac7f0a7bc9c940d9f06be6234e2cfd";
const MD5_LOCK = "f7c0a0099472b2d0f1c48362365b5ccf";

const PILOT = "pilot_d362";
const PILOT_ERROR = /Domain "[^"]+" is a pilot domain and cannot be assigned by a teacher\. Pilot access is granted by the project owner\./;
const NOT_TEACHER = /Not authorized: caller is not the teacher of this student/;

const TEACHER = "00000000-0000-4000-8000-00000d362a01";
const OTHER_TEACHER = "00000000-0000-4000-8000-00000d362a02";
const PUPIL = "00000000-0000-4000-8000-00000d362a03";        // grade 7, the test account's shape
const PUPIL_NO_GRADE = "00000000-0000-4000-8000-00000d362a04"; // selected_grade NULL
const PUPIL_REGULAR = "00000000-0000-4000-8000-00000d362a05";  // grade 7, never gets a pilot domain

let db;
let pilotIds = [];
let attrsBefore;
let questionsMd5Before;
const oldOutcomes = new Map();

const fnInfoSql = `SELECT md5(p.prosrc) AS md5, p.prosecdef, p.proconfig::text AS cfg, p.proacl::text AS acl,
    pg_get_userbyid(p.proowner) AS owner, pg_get_function_identity_arguments(p.oid) AS args,
    pg_get_function_result(p.oid) AS result, l.lanname AS lang, p.provolatile AS vol
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE p.oid = to_regprocedure('public.set_student_domains(uuid,text[])')`;
const fnInfo = async () => (await db.query(fnInfoSql)).rows[0] ?? null;
const fnMd5 = async () => (await fnInfo())?.md5 ?? null;
const questionsMd5 = async () => (await db.query(
  "SELECT md5(coalesce(string_agg(q::text, '|' ORDER BY q.id), '')) AS m FROM public.questions q")).rows[0].m;
const activeDomainsOf = async (id) => (await db.query("SELECT active_domains FROM public.profiles WHERE id = $1", [id])).rows[0].active_domains;
const setDomainsAsOwner = (id, domains) => db.query("UPDATE public.profiles SET active_domains = $2::text[] WHERE id = $1", [id, domains]);

const insertQuestion = (lo, grade, text) => db.query(`INSERT INTO public.questions (type, content, answer_format, answer_type, metadata,
    difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
  VALUES ('mc_single', $1::jsonb, 'mc', 'short', '{}'::jsonb, 2, 'auto', true, $2, $3, 2, 6300)`,
[JSON.stringify({ type: "mc", question: text, options: ["a", "b", "c", "d"], correct: "a", accepted_answers: ["a"], review_text: "Kontrol." }), lo, grade]);

// One call of set_student_domains as `caller` (role authenticated, JWT sub) on a pupil whose active_domains
// is first set to `initial` by the owner (superuser). Everything is rolled back afterwards.
async function attempt({ caller = TEACHER, student = PUPIL, domains, initial = null }) {
  await db.exec("BEGIN");
  try {
    await setDomainsAsOwner(student, initial);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [caller]);
    await db.exec("SET LOCAL ROLE authenticated");
    try {
      await db.query("SELECT public.set_student_domains($1::uuid, $2::text[])", [student, domains]);
    } catch (e) {
      return { error: e.message };
    }
    await db.exec("RESET ROLE");
    return { domains: await activeDomainsOf(student) };
  } finally {
    await db.exec("ROLLBACK");
  }
}

// Same, but outside a transaction (like the scope test's pattern) so "nothing changed" is the real profile.
async function as(uid, fn) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec("SET ROLE authenticated");
  try { return await fn(); }
  finally {
    await db.exec("RESET ROLE");
    await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}

// Non-pilot inputs: the lock must give exactly the old function's outcome for each.
const REGULAR_CASES = [
  { name: "one accessible domain", domains: ["revolutions_democracy"] },
  { name: "two accessible domains", domains: ["revolutions_democracy", "vikings"] },
  { name: "replaces an earlier non-pilot list", domains: ["vikings"], initial: ["revolutions_democracy", "middle_ages"] },
  { name: "NULL clears", domains: null, initial: ["vikings"] },
  { name: "empty list clears", domains: [], initial: ["vikings"] },
  { name: "NULL on NULL", domains: null },
  { name: "grade-inaccessible domain", domains: ["cold_war"] },
  { name: "inaccessible among accessible", domains: ["vikings", "cold_war"], initial: ["middle_ages"] },
  { name: "unknown domain, grade 7", domains: ["no_such_domain"] },
  { name: "no grade: unknown domain", student: PUPIL_NO_GRADE, domains: ["no_such_domain"] },
  { name: "no grade: any active domain is accepted", student: PUPIL_NO_GRADE, domains: ["cold_war"] },
  { name: "not your pupil", caller: OTHER_TEACHER, domains: ["vikings"] },
  { name: "not your pupil, NULL", caller: OTHER_TEACHER, domains: null },
  { name: "a pupil calling for itself", caller: PUPIL, domains: ["vikings"] },
];

before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(read("20261108090100_stimulus_pilot_content.sql"));
  await db.exec(read("20261108090000_order_categorize_activation.sql"));
  await db.exec(read("20261108090200_order_categorize_pilot_content.sql"));
  await db.exec(`INSERT INTO auth.users (id, email) VALUES
      ('${TEACHER}', 'laerer-lock@example.test'), ('${OTHER_TEACHER}', 'anden-laerer-lock@example.test'),
      ('${PUPIL}', 'elev-lock@example.test'), ('${PUPIL_NO_GRADE}', 'elev-uden-trin-lock@example.test'),
      ('${PUPIL_REGULAR}', 'elev-almindelig-lock@example.test');
    INSERT INTO public.profiles (id, role) VALUES ('${TEACHER}', 'teacher'), ('${OTHER_TEACHER}', 'teacher');
    INSERT INTO public.profiles (id, role, selected_grade, teacher_id) VALUES
      ('${PUPIL}', 'student', 7, '${TEACHER}'), ('${PUPIL_NO_GRADE}', 'student', NULL, '${TEACHER}'),
      ('${PUPIL_REGULAR}', 'student', 7, '${TEACHER}');`);
  // Regular active questions: two domains accessible at grade 7, one only at grade 9.
  await insertQuestion("revolutions_democracy", 7, "Kontrol lås: revolutions_democracy");
  await insertQuestion("vikings", 5, "Kontrol lås: vikings");
  await insertQuestion("middle_ages", 6, "Kontrol lås: middle_ages");
  await insertQuestion("cold_war", 9, "Kontrol lås: cold_war");
  pilotIds = (await db.query(`UPDATE public.questions SET is_active = true WHERE metadata->>'pilot' = 'D-362' RETURNING id`)).rows.map((x) => x.id);
  assert.equal(pilotIds.length, 15, "all 15 pilot rows are stored and activated in the test");

  // The OLD function (the replayed production body) on the same inputs, before the lock exists.
  assert.equal(await fnMd5(), MD5_085315, "the replay runs the body of 20260608085315");
  for (const c of REGULAR_CASES) oldOutcomes.set(c.name, await attempt(c));
  oldOutcomes.set("old: pilot add", await attempt({ domains: [PILOT] }));
  oldOutcomes.set("old: save on pilot pupil", await attempt({ domains: ["revolutions_democracy", "vikings"], initial: [PILOT, "vikings"] }));
  oldOutcomes.set("old: clear on pilot pupil", await attempt({ domains: null, initial: [PILOT, "vikings"] }));
  attrsBefore = await fnInfo();
  questionsMd5Before = await questionsMd5();

  await db.exec(LOCK_SQL);
});
after(async () => { await db?.close(); });

// ── 0. the gap the lock closes, on the old body ─────────────────────────────────────────────────────

test("0. before the lock (old body): the teacher could add pilot_d362, and a save or clear dropped it", () => {
  assert.deepEqual(oldOutcomes.get("old: pilot add"), { domains: [PILOT] });
  assert.deepEqual(oldOutcomes.get("old: save on pilot pupil"), { domains: ["revolutions_democracy", "vikings"] });
  assert.deepEqual(oldOutcomes.get("old: clear on pilot pupil"), { domains: null });
});

// ── 1. the teacher cannot add a pilot domain ───────────────────────────────────────────────────────

test("1. the teacher cannot add pilot_d362 (rows active): refused, the real profile is unchanged", async () => {
  for (const initial of [null, ["vikings"], [PILOT, "vikings"]]) {
    await setDomainsAsOwner(PUPIL, initial);
    for (const domains of [[PILOT], ["vikings", PILOT], ["revolutions_democracy", PILOT, "vikings"]]) {
      await as(TEACHER, async () => {
        await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, $2::text[])", [PUPIL, domains]), PILOT_ERROR);
      });
      assert.deepEqual(await activeDomainsOf(PUPIL), initial, `initial ${JSON.stringify(initial)}, domains ${domains}`);
    }
  }
  await setDomainsAsOwner(PUPIL, null);
});

test("1. every pilot_* key is refused, whatever its case, and the error names it", async () => {
  for (const key of [PILOT, "PILOT_D362", "Pilot_d362", "pilot_x", "pilot_"]) {
    const r = await attempt({ domains: [key] });
    assert.match(r.error ?? "", PILOT_ERROR, key);
    assert.ok(r.error.includes(`"${key}"`), `${key}: ${r.error}`);
  }
  // Keys that merely contain "pilot" are validated as before (and are unknown here).
  for (const key of ["d362_pilot", "copilot_x", "pilot-d362"]) {
    assert.match((await attempt({ domains: [key] })).error ?? "", /has no accessible questions for grade 7 students/, key);
  }
});

test("1. a teacher who is not the pupil's teacher still gets the old ownership error, also for pilot_d362", async () => {
  assert.match((await attempt({ caller: OTHER_TEACHER, domains: [PILOT] })).error ?? "", NOT_TEACHER);
});

// ── 2. existing pilot domains are preserved ────────────────────────────────────────────────────────

test("2. a normal save on a pupil with ['pilot_d362','vikings'] gives the chosen domains plus pilot_d362", async () => {
  const initial = [PILOT, "vikings"];
  assert.deepEqual(await attempt({ domains: ["revolutions_democracy", "vikings"], initial }),
    { domains: ["revolutions_democracy", "vikings", PILOT] });
  assert.deepEqual(await attempt({ domains: ["middle_ages"], initial }), { domains: ["middle_ages", PILOT] });
  // Order of several stored pilot domains is kept, appended after the teacher's list.
  assert.deepEqual(await attempt({ domains: ["vikings"], initial: ["pilot_b", "vikings", "pilot_a"] }),
    { domains: ["vikings", "pilot_b", "pilot_a"] });
});

test("2. clearing (NULL or empty) on a pilot pupil keeps exactly its pilot domains", async () => {
  for (const domains of [null, []]) {
    assert.deepEqual(await attempt({ domains, initial: [PILOT, "vikings"] }), { domains: [PILOT] }, JSON.stringify(domains));
    assert.deepEqual(await attempt({ domains, initial: [PILOT] }), { domains: [PILOT] }, JSON.stringify(domains));
  }
});

test("2. a refused save on a pilot pupil (inaccessible domain) changes nothing, with the old error", async () => {
  await setDomainsAsOwner(PUPIL, [PILOT, "vikings"]);
  await as(TEACHER, async () => {
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['cold_war'])", [PUPIL]),
      /Domain "cold_war" has no accessible questions for grade 7 students\. Choose a different domain or update the student's grade\./);
  });
  assert.deepEqual(await activeDomainsOf(PUPIL), [PILOT, "vikings"]);
  await setDomainsAsOwner(PUPIL, null);
});

test("2. a real (non-rolled-back) save persists the merge", async () => {
  await setDomainsAsOwner(PUPIL, [PILOT, "vikings"]);
  await as(TEACHER, async () => {
    await db.query("SELECT public.set_student_domains($1::uuid, ARRAY['revolutions_democracy'])", [PUPIL]);
  });
  assert.deepEqual(await activeDomainsOf(PUPIL), ["revolutions_democracy", PILOT]);
  await as(TEACHER, async () => { await db.query("SELECT public.set_student_domains($1::uuid, NULL)", [PUPIL]); });
  assert.deepEqual(await activeDomainsOf(PUPIL), [PILOT]);
  await setDomainsAsOwner(PUPIL, null);
});

// ── 3. everything else is unchanged ────────────────────────────────────────────────────────────────

for (const c of REGULAR_CASES) {
  test(`3. same outcome as the old function: ${c.name}`, async () => {
    const now = await attempt(c);
    assert.deepEqual(now, oldOutcomes.get(c.name));
  });
}

test("3. the regular cases cover success, NULL, '{}', both validation errors and the ownership error", () => {
  const all = [...oldOutcomes.entries()].filter(([k]) => !k.startsWith("old: ")).map(([, v]) => v);
  assert.ok(all.some((o) => Array.isArray(o.domains) && o.domains.length === 2));
  assert.ok(all.some((o) => "domains" in o && o.domains === null));
  assert.ok(all.some((o) => Array.isArray(o.domains) && o.domains.length === 0));
  assert.ok(all.some((o) => /has no accessible questions for grade 7 students/.test(o.error ?? "")));
  assert.ok(all.some((o) => /does not exist or has no questions\. Check the domain key and try again\./.test(o.error ?? "")));
  assert.ok(all.some((o) => NOT_TEACHER.test(o.error ?? "")));
});

test("4. signature, language, SECURITY DEFINER, search_path, owner and ACL are unchanged; no question row changed", async () => {
  const now = await fnInfo();
  assert.equal(now.md5, MD5_LOCK);
  const strip = ({ md5, ...rest }) => rest;
  assert.deepEqual(strip(now), strip(attrsBefore));
  assert.equal(now.prosecdef, true);
  assert.equal(now.cfg, "{search_path=public}");
  assert.equal(now.args, "p_student_id uuid, p_domains text[]");
  assert.equal(now.result, "void");
  assert.equal(await questionsMd5(), questionsMd5Before);
});

// ── 5. the pupil ───────────────────────────────────────────────────────────────────────────────────

test("5. a pupil still cannot UPDATE its own active_domains nor call set_student_domains for itself", async () => {
  await setDomainsAsOwner(PUPIL, [PILOT]);
  await as(PUPIL, async () => {
    await assert.rejects(db.query("UPDATE public.profiles SET active_domains = ARRAY['vikings'] WHERE id = $1", [PUPIL]), /permission denied/);
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['vikings'])", [PUPIL]), NOT_TEACHER);
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, NULL)", [PUPIL]), NOT_TEACHER);
  });
  assert.deepEqual(await activeDomainsOf(PUPIL), [PILOT]);
  await as(PUPIL_REGULAR, async () => {
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL_REGULAR]), NOT_TEACHER);
  });
  assert.equal(await activeDomainsOf(PUPIL_REGULAR), null);
  await setDomainsAsOwner(PUPIL, null);
});

// anon keeps EXECUTE on set_student_domains (production ACL, unchanged by the lock), so the only thing
// standing between an anonymous caller and a pupil's domains is the ownership check: with no JWT subject,
// auth.uid() is NULL and no teacher_id can equal it. Proven here for a regular list, a pilot domain, NULL
// and a forged-looking call on a pilot pupil — nothing is written in any case.
test("5b. an anonymous caller (role anon, no JWT subject) cannot change any pupil's domains", async () => {
  await setDomainsAsOwner(PUPIL, [PILOT, "vikings"]);
  const acl = (await db.query(`SELECT has_function_privilege('anon', 'public.set_student_domains(uuid,text[])', 'EXECUTE') AS x`)).rows[0].x;
  assert.equal(acl, true, "anon has EXECUTE today (production ACL); the ownership check is the barrier");
  await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec("SET ROLE anon");
  try {
    for (const domains of [["vikings"], [PILOT], null, []]) {
      await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, $2::text[])", [PUPIL, domains]), NOT_TEACHER,
        `anon with ${JSON.stringify(domains)}`);
      await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, $2::text[])", [PUPIL_REGULAR, domains]), NOT_TEACHER,
        `anon on a regular pupil with ${JSON.stringify(domains)}`);
    }
    await assert.rejects(db.query("UPDATE public.profiles SET active_domains = ARRAY['pilot_d362'] WHERE id = $1", [PUPIL_REGULAR]),
      /permission denied/);
  } finally {
    await db.exec("RESET ROLE");
  }
  assert.deepEqual(await activeDomainsOf(PUPIL), [PILOT, "vikings"]);
  assert.equal(await activeDomainsOf(PUPIL_REGULAR), null);
  await setDomainsAsOwner(PUPIL, null);
});

// ── 6. guard, re-run, rollback ─────────────────────────────────────────────────────────────────────

async function inRolledBackTx(fn) {
  await db.exec("BEGIN");
  try { return await fn(); } finally { await db.exec("ROLLBACK"); }
}

test("6. guard: an unreviewed body is refused and nothing changes", async () => {
  await inRolledBackTx(async () => {
    await db.exec(TWIN_085315.replace("v_bad_domain TEXT;", "v_bad_domain TEXT; -- edited"));
    const tampered = await fnMd5();
    assert.ok(![MD5_085315, MD5_110000, MD5_LOCK].includes(tampered));
    await db.exec("SAVEPOINT g");
    await assert.rejects(db.exec(LOCK_SQL), /D-362: set_student_domains has an unreviewed body \(md5 [0-9a-f]{32}\); nothing changed/);
    await db.exec("ROLLBACK TO SAVEPOINT g");
    assert.equal(await fnMd5(), tampered);
  });
  assert.equal(await fnMd5(), MD5_LOCK);
});

test("6. guard: a missing function is refused", async () => {
  await inRolledBackTx(async () => {
    await db.exec("DROP FUNCTION public.set_student_domains(uuid, text[])");
    await db.exec("SAVEPOINT g");
    await assert.rejects(db.exec(LOCK_SQL), /unreviewed body \(md5 missing\)/);
    await db.exec("ROLLBACK TO SAVEPOINT g");
    assert.equal(await fnMd5(), null);
  });
});

test("6. guard: both reviewed twin bodies are accepted and give the lock body", async () => {
  for (const [twin, md5] of [[TWIN_085315, MD5_085315], [TWIN_110000, MD5_110000]]) {
    await inRolledBackTx(async () => {
      await db.exec(twin);
      assert.equal(await fnMd5(), md5);
      await db.exec(LOCK_SQL);
      assert.equal(await fnMd5(), MD5_LOCK);
    });
  }
});

test("6. a re-run is a no-op (same body, same attributes, same behaviour)", async () => {
  const beforeRerun = await fnInfo();
  await db.exec(LOCK_SQL);
  assert.deepEqual(await fnInfo(), beforeRerun);
  assert.deepEqual(await attempt({ domains: ["vikings"], initial: [PILOT] }), { domains: ["vikings", PILOT] });
});

function rollbackSql() {
  const lines = LOCK_SQL.split("\n");
  const a = lines.indexOf("-- ROLLBACK BEGIN");
  const b = lines.indexOf("-- ROLLBACK END");
  assert.ok(a > 0 && b > a, "the header carries one ROLLBACK block");
  return lines.slice(a + 1, b).map((l) => {
    assert.ok(l === "--" || l.startsWith("-- "), `rollback line is a comment: ${l}`);
    return l === "--" ? "" : l.slice(3);
  }).join("\n") + "\n";
}

test("6. the header's ROLLBACK block restores the old body exactly, and refuses any other body", async () => {
  const sql = rollbackSql();
  await inRolledBackTx(async () => {
    await db.exec(sql);
    assert.equal(await fnMd5(), MD5_085315);
    const info = await fnInfo();
    const strip = ({ md5, ...rest }) => rest;
    assert.deepEqual(strip(info), strip(attrsBefore));
    await db.exec("SAVEPOINT r");
    await assert.rejects(db.exec(sql), /D-362 rollback: set_student_domains is not the pilot-lock body; nothing changed/);
    await db.exec("ROLLBACK TO SAVEPOINT r");
    assert.equal(await fnMd5(), MD5_085315);
    // After the rollback the old behaviour is back (the editor would drop pilot access again).
    await setDomainsAsOwner(PUPIL, [PILOT, "vikings"]);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [TEACHER]);
    await db.exec("SET LOCAL ROLE authenticated");
    await db.query("SELECT public.set_student_domains($1::uuid, ARRAY['vikings'])", [PUPIL]);
    await db.exec("RESET ROLE");
    assert.deepEqual(await activeDomainsOf(PUPIL), ["vikings"]);
  });
  assert.equal(await fnMd5(), MD5_LOCK);
  assert.equal(await activeDomainsOf(PUPIL), null);
});

test("6. the header names the three guard hashes and the migration is listed as not in production", () => {
  for (const m of [MD5_085315, MD5_110000, MD5_LOCK]) assert.ok(LOCK_SQL.includes(m), m);
  assert.match(LOCK_SQL, /NOT APPLIED IN PRODUCTION/);
  assert.match(LOCK_SQL, /`supabase db push` is forbidden/);
  assert.match(LOCK_SQL, /apply this BEFORE the D-362 pilot rows/);
  assert.ok(NOT_IN_PRODUCTION[LOCK_FILE], "replay-plan NOT_IN_PRODUCTION lists the file");
});

// ── 7. scope.ts with the lock applied ──────────────────────────────────────────────────────────────

test("7. with the lock, scope.ts yields pilot_d362 only for the pupil whose profile has it", async () => {
  await setDomainsAsOwner(PUPIL, [PILOT, "vikings"]);       // owner grant (test account)
  await as(TEACHER, async () => {
    await db.query("SELECT public.set_student_domains($1::uuid, ARRAY['revolutions_democracy'])", [PUPIL]);
    await db.query("SELECT public.set_student_domains($1::uuid, ARRAY['revolutions_democracy', 'vikings'])", [PUPIL_REGULAR]);
    await assert.rejects(db.query("SELECT public.set_student_domains($1::uuid, ARRAY['pilot_d362'])", [PUPIL_REGULAR]), PILOT_ERROR);
  });
  const profileOf = async (id) => (await db.query("SELECT active_domains, selected_grade FROM public.profiles WHERE id = $1", [id])).rows[0];
  const pilotScope = deriveQuestionScope(await profileOf(PUPIL), "historie");
  assert.deepEqual(pilotScope.subjectDomains, ["revolutions_democracy", PILOT]);
  const regularScope = deriveQuestionScope(await profileOf(PUPIL_REGULAR), "historie");
  assert.deepEqual(regularScope.subjectDomains, ["revolutions_democracy", "vikings"]);
  for (const subject of [undefined, null, "historie", "engelsk", "dansk", PILOT]) {
    assert.equal(deriveQuestionScope(await profileOf(PUPIL_REGULAR), subject).subjectDomains.includes(PILOT), false, String(subject));
  }
  // The selection RPC serves pilot rows to the pilot pupil's scope only.
  const level = async (domains) => (await db.query(
    "SELECT id FROM public.get_level_questions_for_student($1::uuid, 6300, $2::text[], 100)", [PUPIL_REGULAR, domains])).rows.map((x) => x.id);
  assert.equal((await level(regularScope.subjectDomains)).filter((id) => pilotIds.includes(id)).length, 0);
  assert.ok((await level(pilotScope.subjectDomains)).some((id) => pilotIds.includes(id)));
  await setDomainsAsOwner(PUPIL, null);
  await setDomainsAsOwner(PUPIL_REGULAR, null);
});
