// H5 integration (D-266, D-273, D-278, D-280, D-290 G1): 20261101190000_question_attempts_v2_bootstrap.sql
// and 20261101190100_question_attempts_v2_align_grading.sql, executed UNMODIFIED on PGlite with every
// merged migration they meet, in both histories:
//
//   repository   20261030211428 → D-278 → D-280 part 1 → G1 → bootstrap → align
//   production   D-280 part 1 → D-278 → G1 → bootstrap → align   (20261030211428 refuses after D-280)
//
// What it proves: both histories end in the SAME public schema (fingerprint of every function body,
// trigger, constraint, index, policy, ACL and column); the bootstrap carries 20261030211428's DDL byte
// for byte, refuses every unknown state (also D-280 part 1 without G1) and leaves the old-grading _v2
// callable by no API role; the alignment refuses without G1 or with altered G1 helpers and changes
// only the alias rule and the comparison (G1's lines); after it, process_question_attempt_v2 grades
// and pays exactly as process_question_attempt — the ten D-280 questions in every key/answer
// combination and G1's cases (apostrophes, æ/ø/å, numbers, empty key, aliases, Match key), first
// answers and repeats, XP, coins, counters and quests — also with the real D-280 part 2 applied on top
// of an H5 database; replay, refusals, the round guard and append-only history still hold; D-278
// still counts and restricts; the rollback restores the pre-H5 schema; rolling G1 back afterwards
// makes _v2 fail instead of grading the old way.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x, one connection, superuser; simultaneous sessions are
// question-attempts-v2-bootstrap-concurrency.test.mjs on a real PostgreSQL 17. Passing is not
// permission to apply: production needs its own owner authorisation (D-110, apply_migration only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { splitStatements } from "./helpers/sql-statements.mjs";
import {
  H5, D278, D280_PATHS, D280_TOP10, G1, BOOTSTRAP, ALIGN, REPO_ORDER, PROD_ORDER, MC_V2, TEXT_V2, PQA, MD5,
  NORMALIZE_CHOICE, NORMALIZE_NUMBER, withTop10,
  TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL, ROLLBACK_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { planReplay, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL = (f) => migrationSql(f);
const ORIGINAL_DDL = (() => {
  const src = SQL(H5);
  return splitStatements(src.slice(src.indexOf("-- ── 1. Composite FK target")));
})();

async function freshDb() {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  return db;
}
async function migrated(order) {
  const db = await freshDb();
  for (const f of order) await db.exec(SQL(f));
  return db;
}
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;
const exists = async (db, sql) => (await db.query(`SELECT (${sql}) AS e`)).rows[0].e;
const h5Objects = async (db) => ({
  table: await exists(db, "to_regclass('public.question_attempts') IS NOT NULL"),
  mc: await exists(db, `to_regprocedure('${MC_V2}') IS NOT NULL`),
  guard: await exists(db, "EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'question_instances_round_guard')"),
  key: await exists(db, "EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_instances_id_student_id_key')"),
});
const NONE = { table: false, mc: false, guard: false, key: false };

let nextPupil = 700;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function serve(db, pupil, question, key, { repeat = 0 } = {}) {
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
    answered, next_review_at) VALUES ($1, $2, $3, $4, false, now()) RETURNING id`, [pupil, question, key, repeat])).rows[0].id;
}
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const legacy = async (db, p, qi, answer) => (await as(db, "service_role", `SELECT public.process_question_attempt($1, $2, $3, 0) AS r`, [p, qi, answer]))[0].r;
const v2 = async (db, p, qi, answer, round, sub = randomUUID(), role = "service_role") =>
  (await as(db, role, `SELECT public.process_question_attempt_v2($1, $2, $3, $4, $5, NULL, NULL) AS r`, [p, qi, answer, round, sub]))[0].r;
async function effects(db, pupil) {
  const rows = async (sql) => (await db.query(sql, [pupil])).rows;
  return {
    progress: await rows(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak
      FROM public.student_progress WHERE student_id = $1`),
    instances: await rows(`SELECT answered, user_answer, was_correct, repeat_count, correct_answer
      FROM public.question_instances WHERE student_id = $1`),
    daily: await rows(`SELECT d.quest_key, p.progress FROM public.student_quest_progress p
      JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    weekly: await rows(`SELECT w.quest_key, p.progress FROM public.student_weekly_quest_progress p
      JOIN public.weekly_quests w ON w.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
  };
}

// ── The files ────────────────────────────────────────────────────────────────────────────────────
// Migrations after D-280 part 1 (whose bodies the bootstrap pins) that touch H5's surface: the seven
// writers, the H5 objects, or answered/repeat_count of question_instances. Each must be reviewed
// against the bootstrap's guards and listed here; an unlisted one fails. Unrelated later migrations
// are not refused for their timestamp alone. G1 (D-290) was reviewed: it changes only the grading of
// process_question_attempt; the bootstrap pins its body and the alignment gives _v2 its grading.
const H5_SURFACE = /\bFUNCTION\s+public\.(process_question_attempt|process_text_answer|release_open_question_outside|request_repeat_\w+)\s*\(|\bquestion_attempts\b|question_instances_round_guard|question_instances_id_student_id_key|\bUPDATE\s+(public\.)?question_instances\b[\s\S]{0,400}?\b(answered|repeat_count)\b/i;
const REVIEWED_H5_SURFACE_AFTER_D280 = Object.freeze([G1, BOOTSTRAP, ALIGN]);

test("the two files: unique versions, after their prerequisites, adjacent; later H5-surface changes need review", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  for (const f of [BOOTSTRAP, ALIGN]) {
    assert.ok(files.includes(f), f);
    assert.equal(files.filter((x) => x.slice(0, 14) === f.slice(0, 14)).length, 1, `${f}: version unique`);
  }
  for (const f of [H5, D278, D280_PATHS, D280_TOP10, G1]) assert.ok(f < BOOTSTRAP, `${f} sorts before the bootstrap`);
  assert.equal(files.indexOf(ALIGN), files.indexOf(BOOTSTRAP) + 1, "nothing sorts between the bootstrap and the alignment");
  const touching = files.filter((f) => f > D280_TOP10 && H5_SURFACE.test(SQL(f).replace(/^\s*--.*$/gm, "")));
  assert.deepEqual(touching, [...REVIEWED_H5_SURFACE_AFTER_D280],
    "a migration after D-280 changes H5's surface: review it against the bootstrap's guards, then list it");
  assert.deepEqual([...REPO_ORDER], [H5, D278, D280_PATHS, G1, BOOTSTRAP, ALIGN].sort(), "REPO_ORDER is file-name order");
  for (const f of [BOOTSTRAP, ALIGN]) {
    const code = SQL(f).replace(/--.*$/gm, "");
    // Outside function bodies (the _v2 bodies write attempts when CALLED; the file itself writes nothing).
    const outside = code.replace(/\$function\$[\s\S]*?\$function\$/g, "");
    assert.equal(/db\s+push/i.test(code), false);
    assert.equal(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\s+public\./i.test(outside), false, `${f}: writes no rows`);
    assert.equal(/UPDATE\s+public\.(question_instances|student_progress|questions|question_attempts)\b/i.test(outside), false,
      `${f}: no UPDATE outside function bodies`);
    assert.equal(/\bFUNCTION\s+public\.(process_question_attempt|process_text_answer|request_repeat_\w+|release_open_question_outside|update_best_session_streak|set_night_correct)\s*\(/i.test(code), false,
      `${f}: does not redefine a live answer, repeat or D-278 function`);
  }
});

test("the bootstrap executes 20261030211428's sections 1–6 byte for byte, in order, each once", () => {
  const src = SQL(BOOTSTRAP);
  const embedded = [...src.matchAll(/EXECUTE (\$h5_ddl_(\d\d)\$)([\s\S]*?)\1;/g)];
  assert.equal(ORIGINAL_DDL.length, 19);
  assert.deepEqual(embedded.map((m) => Number(m[2])), ORIGINAL_DDL.map((_, i) => i + 1));
  embedded.forEach((m, i) => assert.equal(m[3], ORIGINAL_DDL[i], `statement ${i + 1}`));
  // Outside the EXECUTEd statements there is no DDL but ONE more EXECUTE: service_role loses EXECUTE on
  // the old-grading _v2 (the alignment grants it back). The rest is the state check and the final
  // check, and the whole file is ONE statement (one DO block) — see the atomicity tests below.
  const holds = [...src.matchAll(/EXECUTE (\$h5_hold\$)([\s\S]*?)\1;/g)].map((m) => m[2]);
  assert.deepEqual(holds, ["REVOKE EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)\n  FROM service_role;"]);
  const stripped = src.replace(/EXECUTE (\$h5_ddl_\d\d\$|\$h5_hold\$)[\s\S]*?\1;/g, "NULL;");
  assert.equal(/\bEXECUTE\s+\$/.test(stripped), false, "no other EXECUTEd statement");
  const rest = splitStatements(stripped);
  assert.deepEqual(rest.map((s) => s.slice(0, 3)), ["DO "]);
});

test("the alignment changes process_question_attempt_v2 in exactly the alias rule and G1's comparison", () => {
  const original = ORIGINAL_DDL.find((s) => s.startsWith("CREATE FUNCTION public.process_question_attempt_v2("));
  // The whole file is ONE DO block; the function is EXECUTEd verbatim, and so are REVOKE and GRANT.
  assert.deepEqual(splitStatements(SQL(ALIGN)).map((s) => s.slice(0, 3)), ["DO "]);
  const executed = [...SQL(ALIGN).matchAll(/EXECUTE \$h5_align_ddl\$([\s\S]*?)\$h5_align_ddl\$;/g)].map((m) => m[1]);
  assert.deepEqual(executed.slice(1), ORIGINAL_DDL.filter((s) => /^(REVOKE|GRANT)/.test(s) && s.includes("process_question_attempt_v2(")));
  const aligned = executed[0];
  assert.ok(aligned.startsWith("CREATE OR REPLACE FUNCTION public.process_question_attempt_v2("));
  const a = original.split("\n");
  const b = aligned.split("\n");
  const removed = a.filter((l) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));
  assert.deepEqual(removed, [
    "CREATE FUNCTION public.process_question_attempt_v2(",
    "  -- Only the reviewed old/new spellings of this question's correct option are aliases.",
    "  IF jsonb_array_length(v_aliases) = 2",
    "  IF trim(regexp_replace(lower(p_answer), '[^a-z0-9]', '', 'g'))",
    "       = trim(regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g'))",
  ]);
  assert.deepEqual(added, [
    "CREATE OR REPLACE FUNCTION public.process_question_attempt_v2(",
    "  v_norm_answer text;",
    "  v_norm_key   text;",
    "  -- Only reviewed earlier versions of this question's correct option are aliases: two or more",
    "  -- entries (D-280), always including both the stored key and the current content.correct.",
    "  IF jsonb_array_length(v_aliases) >= 2",
    "  -- D-290 (G1): meaning-bearing characters count (letters incl. æøå, apostrophes, punctuation);",
    "  -- numbers compare numerically. An empty or unparseable key never matches. Aliases are unchanged.",
    "  IF v_format LIKE '%number%' THEN",
    "    v_norm_answer := public.normalize_number_answer(p_answer);",
    "    v_norm_key    := public.normalize_number_answer(v_key);",
    "    v_norm_answer := public.normalize_choice_answer(p_answer);",
    "    v_norm_key    := public.normalize_choice_answer(v_key);",
    "  IF (v_norm_key IS NOT NULL AND v_norm_key <> '' AND v_norm_answer = v_norm_key)",
  ]);
  // The comparison is G1's, line for line (only the variable names differ): the same branch on the
  // format, the same helpers, the same empty/unparseable-key rule, the same exact alias match.
  const g1 = SQL(G1);
  const g1Lines = [
    "  IF v_instance.answer_format LIKE '%number%' THEN",
    "    v_answer         := public.normalize_number_answer(p_answer);",
    "    v_correct_answer := public.normalize_number_answer(v_instance.correct_answer);",
    "  ELSE",
    "    v_answer         := public.normalize_choice_answer(p_answer);",
    "    v_correct_answer := public.normalize_choice_answer(v_instance.correct_answer);",
    "  END IF;",
    "",
    "  IF (v_correct_answer IS NOT NULL AND v_correct_answer <> '' AND v_answer = v_correct_answer)",
    "     OR v_orthography_aliases ? p_answer THEN",
  ].join("\n");
  const v2Lines = [
    "  IF v_format LIKE '%number%' THEN",
    "    v_norm_answer := public.normalize_number_answer(p_answer);",
    "    v_norm_key    := public.normalize_number_answer(v_key);",
    "  ELSE",
    "    v_norm_answer := public.normalize_choice_answer(p_answer);",
    "    v_norm_key    := public.normalize_choice_answer(v_key);",
    "  END IF;",
    "",
    "  IF (v_norm_key IS NOT NULL AND v_norm_key <> '' AND v_norm_answer = v_norm_key)",
    "     OR v_aliases ? p_answer THEN",
  ].join("\n");
  assert.ok(g1.includes(g1Lines), "G1's comparison as pinned here");
  assert.ok(aligned.includes(v2Lines), "_v2's comparison");
  const rename = (t) => t.replace(/v_instance\.answer_format/g, "F").replace(/v_format/g, "F")
    .replace(/v_instance\.correct_answer/g, "K").replace(/v_key/g, "K")
    .replace(/v_correct_answer\b/g, "NK").replace(/v_norm_key\b/g, "NK")
    .replace(/v_answer\b/g, "NA").replace(/v_norm_answer\b/g, "NA")
    .replace(/v_orthography_aliases/g, "AL").replace(/v_aliases/g, "AL").replace(/ +/g, " ");
  assert.equal(rename(v2Lines), rename(g1Lines), "same comparison up to variable names");
  // In both, the format is questions.answer_format and the key the alias-resolved instance key.
  assert.match(g1, /q\.answer_format, q\.content AS question_content/);
  assert.match(aligned, /SELECT q\.answer_format, q\.answer_type, q\.content, q\.metadata\s+INTO v_format, v_type, v_content, v_metadata/);
  // Its alias rule is now D-280's, character for character.
  assert.match(SQL(D280_PATHS), /IF jsonb_array_length\(v_orthography_aliases\) >= 2\s+AND v_orthography_aliases \? v_instance\.correct_answer\s+AND v_orthography_aliases \? \(v_instance\.question_content->>'correct'\) THEN/);
  assert.match(aligned, /IF jsonb_array_length\(v_aliases\) >= 2\s+AND v_aliases \? v_instance\.correct_answer\s+AND v_aliases \? \(v_content ->> 'correct'\) THEN/);
});

// Builds on #519 (D-280 closeout): both D-280 files are applied in production (20261101101401,
// 20261101102339); part 1 is replayed, part 2 is data and skipped. G1 and the two H5 integration files
// are not applied in production (catalog, 2026-11-01): the isolated database mirrors that and skips
// them until each is applied and verified there (tests/isolated/schema/REPLAY-ACCOUNTING.md). Their
// repository order is proven by the PGlite histories below, not by the replay.
test("replay plan: H5, D-278 and D-280 part 1 are replayed in file order; G1, the two new files and D-280 part 2 are not", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
  const plan = planReplay(files, (f) => SQL(f)).plan;
  const entry = (f) => plan.find((p) => p.file === f);
  for (const f of [D280_PATHS, D280_TOP10]) assert.equal(NOT_IN_PRODUCTION[f], undefined, `${f}: applied in production`);
  for (const f of [H5, D278, D280_PATHS]) assert.equal(entry(f).action, "apply", f);
  assert.equal(entry(D280_TOP10).action, "skip");
  for (const f of [G1, BOOTSTRAP, ALIGN]) {
    assert.equal(entry(f).action, "skip", f);
    assert.match(NOT_IN_PRODUCTION[f], /not applied in production/, f);
    assert.equal(entry(f).reason, NOT_IN_PRODUCTION[f], f);
  }
  assert.match(NOT_IN_PRODUCTION[BOOTSTRAP], /requires G1 \(20261101150000\) first/);
  assert.match(NOT_IN_PRODUCTION[ALIGN], /requires G1 and 20261101190000 first/);
  const applied = plan.filter((p) => p.action === "apply").map((p) => p.file).filter((f) => REPO_ORDER.includes(f));
  assert.deepEqual(applied, [H5, D278, D280_PATHS], "the replay applies what production has, in file order");
  // Each skip is lifted only once its file is applied in production, in REPO_ORDER: G1 first, then the
  // bootstrap, then the alignment — the order the files themselves enforce (the guards below).
  assert.deepEqual([G1, BOOTSTRAP, ALIGN], REPO_ORDER.slice(3));
});

// ── Both histories end in the same schema ──────────────────────────────────────────────────────
test("production history: 20261030211428 refuses after D-280 and leaves nothing; with G1 the bootstrap then succeeds", async () => {
  const db = await migrated([D280_PATHS, D278]);
  const before = await fingerprint(db);
  await assert.rejects(db.exec(SQL(H5)), /H5 PR 1: public\.process_question_attempt\(uuid,uuid,text,bigint\) er ændret siden analysen/);
  assert.deepEqual(await fingerprint(db), before, "nothing of 20261030211428 remains");
  assert.deepEqual(await h5Objects(db), NONE);
  // Without G1 (production today) the bootstrap refuses and changes nothing.
  await assert.rejects(db.exec(SQL(BOOTSTRAP)), /process_question_attempt\(uuid,uuid,text,bigint\) har ikke den gennemgåede krop efter D-280 del 1 og D-290 G1 \(md5 328ea8f9/);
  assert.deepEqual(await fingerprint(db), before);
  await db.exec(SQL(G1));
  assert.equal(await md5Of(db, PQA), MD5.pqaG1);
  await db.exec(SQL(BOOTSTRAP));
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Original, "the bootstrap creates the original _v2");
  await db.exec(SQL(ALIGN));
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Aligned);
});

test("repository and production histories end in exactly the same public schema", async () => {
  const repo = await fingerprint(await migrated(REPO_ORDER));
  const prod = await fingerprint(await migrated(PROD_ORDER));
  const prodOtherOrder = await fingerprint(await migrated([D278, D280_PATHS, G1, BOOTSTRAP, ALIGN]));
  assert.deepEqual(prod, repo);
  assert.deepEqual(prodOtherOrder, repo, "D-278 and D-280 part 1 commute");
  const fn = (sig) => repo.functions[sig.replace("public.", "")];
  assert.equal(fn(MC_V2)[0], MD5.mcV2Aligned);
  assert.equal(fn(PQA)[0], MD5.pqaG1);
  assert.equal(fn(TEXT_V2)[0], MD5.textV2);
  assert.equal(fn(NORMALIZE_CHOICE)[0], MD5.normalizeChoice);
  assert.equal(fn(NORMALIZE_NUMBER)[0], MD5.normalizeNumber);
  // The approved H5 schema: _v2 for service_role only, owned like the answer path and G1's helpers.
  assert.deepEqual(fn(MC_V2).slice(1), [true, ['search_path=""'], ["postgres=X/postgres", "service_role=X/postgres"], "postgres"]);
  for (const sig of [NORMALIZE_CHOICE, NORMALIZE_NUMBER]) {
    assert.deepEqual(fn(sig).slice(1), [false, ['search_path=""'], ["postgres=X/postgres"], "postgres"], `${sig}: owner only`);
  }
});

test("on the repository history the bootstrap verifies everything and changes ONLY service_role's EXECUTE on the old _v2", async () => {
  const db = await migrated([H5, D278, D280_PATHS, G1]);
  const before = await fingerprint(db);
  assert.equal(await exists(db, `has_function_privilege('service_role', '${MC_V2}', 'EXECUTE')`), true, "20261030211428 granted it");
  await db.exec(SQL(BOOTSTRAP));
  const after = await fingerprint(db);
  const sig = MC_V2.replace("public.", "");
  assert.deepEqual(before.functions[sig][3], ["postgres=X/postgres", "service_role=X/postgres"]);
  assert.deepEqual(after.functions[sig][3], ["postgres=X/postgres"]);
  after.functions[sig][3] = before.functions[sig][3];
  assert.deepEqual(after, before, "nothing else changes");
  // And production's history reaches the same state after its bootstrap.
  assert.deepEqual(await fingerprint(await migrated([D280_PATHS, D278, G1, BOOTSTRAP])), await fingerprint(db));
});

// ── Unknown states are refused, and nothing is changed ──────────────────────────────────────────
test("the bootstrap refuses every unknown state and changes nothing", async () => {
  const cases = [
    ["without D-280 part 1 (production's bodies before 2026-11-01)", [], null, /har ikke den gennemgåede krop efter D-280 del 1 og D-290 G1 \(md5 8f698c5b/],
    ["D-280 part 1 without G1 (production today)", [D280_PATHS], null, /process_question_attempt\(uuid,uuid,text,bigint\) har ikke den gennemgåede krop efter D-280 del 1 og D-290 G1 \(md5 328ea8f9/],
    ["D-280 part 1 without G1, H5 present", [H5, D280_PATHS], null, /har ikke den gennemgåede krop efter D-280 del 1 og D-290 G1 \(md5 328ea8f9/],
    ["an unknown process_question_attempt body", [D280_PATHS, G1], `CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid,
      p_question_instance_id uuid, p_answer text, p_question_shown_at bigint) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp' AS $$ BEGIN RETURN NULL; END $$;`, /process_question_attempt\(uuid,uuid,text,bigint\) har ikke den gennemgåede krop/],
    ["an unknown writer of answered", [D280_PATHS, G1], `CREATE FUNCTION public.rogue() RETURNS void LANGUAGE sql AS
      $$ UPDATE public.question_instances SET answered = false $$;`, /ukendt funktion opdaterer answered\/repeat_count i question_instances: rogue\(\)/],
    ["another trigger on question_instances", [D280_PATHS, G1], `CREATE FUNCTION public.t() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER other BEFORE UPDATE ON public.question_instances FOR EACH ROW EXECUTE FUNCTION public.t();`,
      /har allerede en trigger/],
    ["a partial H5 schema (round guard dropped)", [H5, D280_PATHS, G1], "DROP TRIGGER question_instances_round_guard ON public.question_instances;",
      /findes kun delvist \(8 af 9 objekter\)/],
    ["a changed _v2 body", [H5, D280_PATHS, G1], `CREATE OR REPLACE FUNCTION public.process_text_answer_v2(p_instance_id uuid, p_user_id uuid,
      p_user_answer text, p_is_correct boolean, p_round_no integer, p_submission_id uuid, p_review_text text, p_misconception_type text)
      RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '{}'::jsonb $$;`,
      /process_text_answer_v2\(uuid,uuid,text,boolean,integer,uuid,text,text\) har ikke den forventede krop/],
    ["_v2 granted to authenticated", [H5, D280_PATHS, G1], `GRANT EXECUTE ON FUNCTION ${MC_V2} TO authenticated;`, /kan kaldes af PUBLIC, anon eller authenticated/],
    ["question_attempts granted to authenticated", [H5, D280_PATHS, G1], "GRANT SELECT ON public.question_attempts TO authenticated;", /rettighederne på question_attempts/],
    ["a policy on question_attempts", [H5, D280_PATHS, G1], "CREATE POLICY open ON public.question_attempts FOR SELECT USING (true);", /RLS slået til og ingen policies/],
    ["the round guard narrowed to one column", [H5, D280_PATHS, G1], `DROP TRIGGER question_instances_round_guard ON public.question_instances;
      CREATE TRIGGER question_instances_round_guard BEFORE UPDATE OF answered ON public.question_instances
      FOR EACH ROW EXECUTE FUNCTION public.question_instances_round_guard();`, /ikke præcis de to H5-triggere/],
    ["the right body under another security mode (wrong database version)", [D280_PATHS, G1],
      `ALTER FUNCTION ${PQA} SECURITY INVOKER;`, /process_question_attempt\(uuid,uuid,text,bigint\) har ikke produktionens SECURITY DEFINER\/INVOKER/],
    ["the round-guard function as SECURITY DEFINER", [H5, D280_PATHS, G1],
      "ALTER FUNCTION public.question_instances_round_guard() SECURITY DEFINER;", /har ikke den forventede krop, SECURITY DEFINER eller search_path/],
    ["an H5 function owned by another role", [H5, D280_PATHS, G1],
      `CREATE ROLE h5_other; ALTER FUNCTION ${MC_V2} OWNER TO h5_other;`, /ejes ikke af samme rolle/],
  ];
  for (const [label, order, tamper, error] of cases) {
    const db = await migrated(order);
    if (tamper) await db.exec(tamper);
    const before = await fingerprint(db);
    await assert.rejects(db.exec(SQL(BOOTSTRAP)), error, label);
    assert.deepEqual(await fingerprint(db), before, `${label}: nothing changed`);
  }
});

// ── Atomicity: a failed run keeps nothing, in either transaction model ─────────────────────────
// Supabase does not document whether apply_migration wraps a file in one transaction, so each file
// is ONE statement (one DO block) and must leave nothing behind both when the runner wraps the file
// in a transaction and when it runs each statement on its own (autocommit).
const MODELS = {
  "one transaction for the file": async (db, sql) => {
    await db.exec("BEGIN");
    try { await db.exec(sql); await db.exec("COMMIT"); } catch (e) { await db.exec("ROLLBACK"); throw e; }
  },
  "each statement on its own (autocommit)": async (db, sql) => {
    for (const statement of splitStatements(sql)) await db.exec(statement);
  },
};

test("each file is a single statement, so no runner can commit part of it", () => {
  assert.equal(splitStatements(SQL(BOOTSTRAP)).length, 1);
  assert.equal(splitStatements(SQL(ALIGN)).length, 1);
});

test("atomic: a failure mid-creation leaves no partial H5 schema", async () => {
  // An index named like the attempts table's round key makes CREATE TABLE fail after the unique key
  // on question_instances was already added inside the same block.
  for (const [model, run] of Object.entries(MODELS)) {
    const db = await migrated([D280_PATHS, D278, G1]);
    await db.exec("CREATE INDEX question_attempts_round_key ON public.profiles (id);");
    const before = await fingerprint(db);
    await assert.rejects(run(db, SQL(BOOTSTRAP)), /question_attempts_round_key/, model);
    assert.deepEqual(await fingerprint(db), before, `${model}: the unique key rolled back with the rest`);
    assert.deepEqual(await h5Objects(db), NONE, model);
  }
});

test("atomic: when every object is created but the final check fails, nothing is kept and a fixed rerun succeeds", async () => {
  // Run as a role that is a member of the owner (so every statement is allowed) but is not the owner
  // itself: all 19 statements succeed and every H5 object is created, owned by that role; only the
  // final owner check fails.
  for (const [model, run] of Object.entries(MODELS)) {
    const db = await migrated([D280_PATHS, D278, G1]);
    await db.exec("CREATE ROLE h5_migrator; GRANT postgres TO h5_migrator;");
    const before = await fingerprint(db);
    await db.exec("SET ROLE h5_migrator");
    await assert.rejects(run(db, SQL(BOOTSTRAP)), /H5-objekterne ejes ikke af samme rolle/, model);
    await db.exec("RESET ROLE");
    assert.deepEqual(await fingerprint(db), before, `${model}: nothing of the creation is kept`);
    assert.deepEqual(await h5Objects(db), NONE, model);
    // The failure left no state behind, so the same file runs again unchanged once the cause is gone.
    await run(db, SQL(BOOTSTRAP));
    await run(db, SQL(ALIGN));
    assert.deepEqual(await fingerprint(db), await fingerprint(await migrated(PROD_ORDER)), `${model}: rerun ends in the full schema`);
  }
});

test("atomic: when the alignment's final check fails, the previous _v2 is kept", async () => {
  // An event trigger changes the new function's search_path right after CREATE OR REPLACE succeeded,
  // so only the alignment's final check fails.
  for (const [model, run] of Object.entries(MODELS)) {
    const db = await migrated([D280_PATHS, D278, G1, BOOTSTRAP]);
    await db.exec(`CREATE FUNCTION public.h5_tamper() RETURNS event_trigger LANGUAGE plpgsql AS $$
      BEGIN EXECUTE 'ALTER FUNCTION ${MC_V2} SET search_path = public'; END $$;
      CREATE EVENT TRIGGER h5_tamper ON ddl_command_end WHEN TAG IN ('CREATE FUNCTION') EXECUTE FUNCTION public.h5_tamper();`);
    const before = await fingerprint(db);
    await assert.rejects(run(db, SQL(ALIGN)), /process_question_attempt_v2 blev ikke som forventet/, model);
    assert.deepEqual(await fingerprint(db), before, `${model}: nothing changed`);
    assert.equal(await md5Of(db, MC_V2), MD5.mcV2Original, model);
  }
});

test("the alignment refuses without H5, without G1, with altered G1 helpers or an unknown _v2 — and a second run changes nothing", async () => {
  await assert.rejects((await migrated([D280_PATHS, G1])).exec(SQL(ALIGN)), /question_attempts findes ikke/);
  await assert.rejects((await migrated([H5])).exec(SQL(ALIGN)), /process_question_attempt har ikke D-290 G1's krop \(md5 8f698c5b/);
  await assert.rejects((await migrated([H5, D280_PATHS])).exec(SQL(ALIGN)), /process_question_attempt har ikke D-290 G1's krop \(md5 328ea8f9/,
    "D-280 part 1 without G1: never aligned with a grading the live path does not use");
  const helperCases = [
    ["a helper with another body", `CREATE OR REPLACE FUNCTION public.normalize_choice_answer(p text) RETURNS text LANGUAGE sql
      IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$ SELECT lower(p) $$;`, /normalize_choice_answer\(text\) har ikke D-290 G1's krop/],
    ["a helper made VOLATILE", `ALTER FUNCTION ${NORMALIZE_NUMBER} VOLATILE;`, /normalize_number_answer\(text\) har ikke D-290 G1's krop, IMMUTABLE/],
    ["a helper without its search_path", `ALTER FUNCTION ${NORMALIZE_CHOICE} RESET search_path;`, /normalize_choice_answer\(text\) har ikke D-290 G1's krop/],
    ["a helper owned by another role", `CREATE ROLE g1_other; ALTER FUNCTION ${NORMALIZE_NUMBER} OWNER TO g1_other;`, /normalize_number_answer\(text\) har ikke D-290 G1's krop, IMMUTABLE, search_path eller ejer/],
    ["a helper granted to service_role", `GRANT EXECUTE ON FUNCTION ${NORMALIZE_CHOICE} TO service_role;`, /normalize_choice_answer\(text\) kan kaldes af en API-rolle/],
    ["a helper granted to authenticated", `GRANT EXECUTE ON FUNCTION ${NORMALIZE_NUMBER} TO authenticated;`, /normalize_number_answer\(text\) kan kaldes af en API-rolle/],
    ["a helper granted to PUBLIC", `GRANT EXECUTE ON FUNCTION ${NORMALIZE_CHOICE} TO PUBLIC;`, /normalize_choice_answer\(text\) kan kaldes af en API-rolle/],
  ];
  for (const [label, tamper, error] of helperCases) {
    const db = await migrated([D280_PATHS, D278, G1, BOOTSTRAP]);
    await db.exec(tamper);
    const before = await fingerprint(db);
    await assert.rejects(db.exec(SQL(ALIGN)), error, label);
    assert.deepEqual(await fingerprint(db), before, `${label}: nothing changed`);
    assert.equal(await exists(db, `has_function_privilege('service_role', '${MC_V2}', 'EXECUTE')`), false, `${label}: _v2 stays uncallable`);
  }
  const tampered = await migrated([H5, D280_PATHS, G1, BOOTSTRAP]);
  await tampered.exec(`CREATE OR REPLACE FUNCTION ${MC_V2.replace(/\(.*/, "")}(p_student_id uuid, p_question_instance_id uuid, p_answer text,
    p_round_no integer, p_submission_id uuid, p_review_text text, p_misconception_type text)
    RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '{}'::jsonb $$;`);
  await assert.rejects(tampered.exec(SQL(ALIGN)), /process_question_attempt_v2 har en ukendt krop/);
  const db = await migrated(PROD_ORDER);
  const after = await fingerprint(db);
  await db.exec(SQL(ALIGN));
  assert.deepEqual(await fingerprint(db), after);
});

test("rollback before activation restores the pre-H5 schema; the two files then apply again", async () => {
  const pre = await fingerprint(await migrated([D280_PATHS, D278, G1]));
  const db = await migrated(PROD_ORDER);
  const full = await fingerprint(db);
  await db.exec(ROLLBACK_SQL);
  assert.deepEqual(await fingerprint(db), pre);
  await db.exec(SQL(BOOTSTRAP));
  await db.exec(SQL(ALIGN));
  assert.deepEqual(await fingerprint(db), full);
});

// ── Grading: _v2 = process_question_attempt for the ten D-280 questions ─────────────────────────
// Every stored key a live instance can hold (the new text, the earlier text, an old spelling) × every
// text a pupil can send (the same, plus a wrong option) × first answer and repeat. Each combination
// runs on two pupils with identical instances: one through process_question_attempt, one through _v2.
async function gradingCases(db) {
  const rows = (await db.query(`SELECT id, content, metadata FROM public.questions WHERE id = ANY ($1) ORDER BY id`, [TOP10_ID])).rows;
  return rows.map((q) => {
    const aliases = Array.isArray(q.metadata?.danish_orthography_correct_aliases) ? q.metadata.danish_orthography_correct_aliases : [];
    const before = TOP10_BEFORE[TOP10_ID.indexOf(q.id)];
    const keys = [...new Set([q.content.correct, before.content.correct, ...aliases])];
    const wrong = q.content.options.find((o) => !keys.includes(o));
    return { id: q.id, aliases: aliases.length, keys, answers: [...keys, wrong] };
  });
}
async function compareAll(db, { v2Matches = () => true, role = "service_role" } = {}) {
  const diverged = new Set();
  let combos = 0;
  let expected = 0;
  for (const q of await gradingCases(db)) {
    expected += q.keys.length * q.answers.length * 2;
    for (const key of q.keys) for (const answer of q.answers) for (const repeat of [0, 1]) {
      const pl = await addPupil(db);
      const pv = await addPupil(db);
      const rl = await legacy(db, pl, await serve(db, pl, q.id, key, { repeat }), answer);
      const rv = await v2(db, pv, await serve(db, pv, q.id, key, { repeat }), answer, repeat + 1, randomUUID(), role);
      combos++;
      assert.equal(rv.outcome, "recorded");
      const same = rv.status === rl.status && rv.correct_answer === rl.correct_answer
        && JSON.stringify(await effects(db, pv)) === JSON.stringify(await effects(db, pl));
      if (!same) diverged.add(q.aliases);
      if (v2Matches(q)) {
        assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, `${q.aliases} aliases, key ${key}, answer ${answer}, repeat ${repeat}`);
        assert.deepEqual(await effects(db, pv), await effects(db, pl), `effects: ${key} / ${answer} / ${repeat}`);
        assert.deepEqual([rv.xp_awarded, rv.coins_awarded], rl.status === "correct" ? (repeat ? [2, 1] : [10, 5]) : [0, 0]);
      }
    }
  }
  assert.equal(combos, expected);
  return { combos, diverged: [...diverged].sort() };
}
// The flint question: after D-280 part 2 its key is "Flint"; before it, the longer earlier text.
const FLINT = TOP10_BEFORE.findIndex((r) => r.content.correct.startsWith("Flint en hard sten"));

test("after D-280 part 2 on an H5 database: aligned _v2 grades and pays exactly as process_question_attempt", async () => {
  for (const order of [PROD_ORDER, REPO_ORDER]) {
    const db = await migrated(withTop10(order));
    const { combos, diverged } = await compareAll(db);
    // 6 questions with 2 aliases (2 keys × 3 answers) + 4 with 3 (3 keys × 4 answers), × first/repeat.
    assert.equal(combos, (6 * 2 * 3 + 4 * 3 * 4) * 2);
    assert.deepEqual(diverged, []);
  }
});

test("why the alignment is needed: the original _v2 disagrees exactly on the four three-alias questions", async () => {
  const db = await migrated(withTop10([D280_PATHS, D278, G1, BOOTSTRAP])); // H5 created, not aligned
  // service_role cannot call the original _v2; the comparison calls it as its owner to show the defect.
  const { diverged } = await compareAll(db, { v2Matches: (q) => q.aliases !== 3, role: "postgres" });
  assert.deepEqual(diverged, [3], "only questions with three aliases; the six with two agree");
  // The documented cases on the flint question: the earlier text on a re-keyed instance, and the new
  // text on an instance still holding the earlier key.
  const flint = { id: TOP10_ID[FLINT] };
  const earlier = TOP10_BEFORE[FLINT].content.correct;
  assert.equal((await db.query("SELECT content->>'correct' AS c FROM public.questions WHERE id = $1", [flint.id])).rows[0].c, "Flint");
  for (const [key, answer] of [["Flint", earlier], [earlier, "Flint"]]) {
    const p = await addPupil(db);
    assert.equal((await legacy(db, p, await serve(db, p, flint.id, key), answer)).status, "correct", `legacy: ${key} / ${answer}`);
    const q = await addPupil(db);
    assert.equal((await v2(db, q, await serve(db, q, flint.id, key), answer, 1, randomUUID(), "postgres")).status, "incorrect", `original _v2: ${key} / ${answer}`);
  }
});

test("before D-280 part 2 (production's questions today) the aligned _v2 also grades as process_question_attempt", async () => {
  const db = await migrated(PROD_ORDER);
  const { diverged } = await compareAll(db);
  assert.deepEqual(diverged, []);
});

// ── H5's guarantees on the final schema ────────────────────────────────────────────────────────
test("replay, conflict, round_closed, D-280's re-keying reopen, stale_round and append-only history", async () => {
  const db = await migrated(withTop10(PROD_ORDER));
  const flint = { id: TOP10_ID[FLINT] };
  const old = TOP10_BEFORE[FLINT].content.correct;
  const p = await addPupil(db);
  const qi = await serve(db, p, flint.id, old);                          // an instance from before the change
  const sub = randomUUID();
  const first = await v2(db, p, qi, "Flint", 1, sub);
  assert.deepEqual([first.outcome, first.status, first.correct_answer, first.xp_awarded], ["recorded", "correct", "Flint", 10]);
  const afterFirst = await effects(db, p);
  const replay = await v2(db, p, qi, "Flint", 1, sub);
  assert.deepEqual({ ...replay, outcome: "recorded" }, first, "the frozen result");
  assert.deepEqual(await v2(db, p, qi, old, 1, sub), { outcome: "submission_conflict" });
  assert.deepEqual(await v2(db, p, qi, "Flint", 1), { outcome: "round_closed" });
  assert.deepEqual(await effects(db, p), afterFirst, "paid once");
  const attempt1 = (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1", [p])).rows;

  // A reopen through D-280's repeat path: round 2, key = the current text (it already is).
  // Repeats are a last resort: no unserved servable question may remain in the scope. Flint is made
  // the only active question of its subject for this test (test data, not a migration change).
  await db.query(`UPDATE public.questions SET is_active = false WHERE learning_objective = $1 AND id <> $2`,
    [TOP10_BEFORE[FLINT].learning_objective, flint.id]);
  const reopened = (await as(db, "service_role", `SELECT public.request_repeat_question_servable_for_student($1, 9::smallint, ARRAY[$2]) AS id`,
    [p, TOP10_BEFORE[FLINT].learning_objective]))[0].id;
  assert.equal(reopened, qi);
  assert.deepEqual((await db.query("SELECT repeat_count, answered, correct_answer FROM public.question_instances WHERE id = $1", [qi])).rows[0],
    { repeat_count: 1, answered: false, correct_answer: "Flint" });
  assert.deepEqual(await v2(db, p, qi, "Flint", 1), { outcome: "stale_round" });
  const second = await v2(db, p, qi, "Flint", 2);
  assert.deepEqual([second.outcome, second.round_no, second.xp_awarded, second.coins_awarded], ["recorded", 2, 2, 1]);
  const all = (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a WHERE student_id = $1 ORDER BY attempt_no", [p])).rows;
  assert.equal(all.length, 2);
  assert.equal(all[0].a, attempt1[0].a, "attempt 1 unchanged byte for byte");

  // The round guard still refuses a reopen that skips the round, and history cannot be edited.
  await assert.rejects(db.exec(`UPDATE public.question_instances SET answered = false WHERE id = '${qi}'`), /question_instances_round_guard/);
  await assert.rejects(db.exec(`UPDATE public.question_attempts SET xp_awarded = 99 WHERE student_id = '${p}'`), /append-only/);
});

// Only the repository history has H5 before D-280 part 2 (production applied part 2 without H5, and
// part 2 cannot follow G1): history written by 20261030211428's _v2, then part 2, then G1 and the two
// H5 integration files on top of it.
test("D-280 part 2 on an H5 database with history: attempts unchanged, open keys re-keyed, no round guard error", async () => {
  const db = await migrated([H5, D278, D280_PATHS]);
  const p = await addPupil(db);
  const answered = await serve(db, p, TOP10_ID[0], TOP10_BEFORE[0].content.correct);
  await v2(db, p, answered, TOP10_BEFORE[0].content.correct, 1);
  const other = await addPupil(db);                                    // one instance per pupil and question
  const open = await serve(db, other, TOP10_ID[0], TOP10_BEFORE[0].content.correct);
  const history = (await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a ORDER BY id")).rows;
  await db.exec(SQL(D280_TOP10));
  assert.deepEqual((await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a ORDER BY id")).rows, history);
  const q = (await db.query("SELECT content->>'correct' AS c FROM public.questions WHERE id = $1", [TOP10_ID[0]])).rows[0].c;
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [open])).rows[0].correct_answer, q);
  assert.equal((await db.query("SELECT correct_answer FROM public.question_instances WHERE id = $1", [answered])).rows[0].correct_answer,
    TOP10_BEFORE[0].content.correct, "an answered instance keeps its key");
  for (const f of [G1, BOOTSTRAP, ALIGN]) await db.exec(SQL(f));
  assert.deepEqual((await db.query("SELECT to_jsonb(a)::text AS a FROM public.question_attempts a ORDER BY id")).rows, history,
    "G1 and the H5 integration leave the history untouched");
  assert.deepEqual(await fingerprint(db), await fingerprint(await migrated(withTop10(REPO_ORDER))));
});

// ── D-278 on the final schema ───────────────────────────────────────────────────────────────────
test("D-278 still counts from the answers _v2 records, and still restricts", async () => {
  const db = await migrated(PROD_ORDER);
  const p = await addPupil(db);
  for (let i = 0; i < 3; i++) await v2(db, p, await serve(db, p, TOP10_ID[i], TOP10_BEFORE[i].content.correct), TOP10_BEFORE[i].content.correct, 1);
  await db.exec(`SET test.uid = '${p}'`);
  await as(db, "authenticated", "SELECT public.update_best_session_streak(999)");
  assert.equal((await db.query("SELECT best_session_streak FROM public.student_progress WHERE student_id = $1", [p])).rows[0].best_session_streak, 3,
    "counted by the server (p_count ignored)");
  await as(db, "authenticated", "SELECT public.set_night_correct()");
  assert.equal((await db.query("SELECT night_correct FROM public.student_progress WHERE student_id = $1", [p])).rows[0].night_correct,
    (await db.query(`SELECT bool_or((answered_at AT TIME ZONE 'Europe/Copenhagen')::time < time '04:00') AS n FROM public.question_instances
      WHERE student_id = $1 AND was_correct`, [p])).rows[0].n === true, "only with a correct answer at night");
  await db.exec("RESET test.uid");
  assert.equal((await effects(db, p)).weekly.find((w) => w.quest_key === "w_answers").progress, 3, "weekly quests advanced by _v2 (SECURITY DEFINER)");
  await assert.rejects(as(db, "authenticated", `UPDATE public.student_weekly_quest_progress SET progress = 50 WHERE student_id = '${p}'`), /permission denied/);
  await assert.rejects(as(db, "anon", "SELECT public.update_best_session_streak(1)"), /permission denied/);
});

// ── G1 (D-290): _v2 grades and pays as process_question_attempt, also on G1's cases ─────────────
// Synthetic questions with the patterns G1 changes (as in grading-meaningful-characters-migration-
// run.test.mjs) plus aliases and a Match key. Every key × answer × first answer/repeat runs on two
// pupils with identical instances: one through process_question_attempt (G1), one through _v2.
const G1Q = Object.freeze({
  mc: uid(9401), poss: uid(9402), sent: uid(9403), oe: uid(9404), num: uid(9405), neg: uid(9406), thousand: uid(9407),
  blank: uid(9408), nonum: uid(9409), alias: uid(9410), match: uid(9411),
});
const qlit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
const g1Row = (id, format, content, metadata = {}) =>
  `('${id}', '${format}', ${qlit(content)}::jsonb, ${qlit(metadata)}::jsonb, 1, true, 'auto', 'english', '${format}', 'short', 5, 1, 1000)`;
const G1_SEED = `INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES
  ${g1Row(G1Q.mc, "mc", { question: "Hovedstad?", options: ["Paris", "Rom"], correct: "Paris" })},
  ${g1Row(G1Q.poss, "mc", { question: "sister___ room", options: ["s'", "s", "es", "'s"], correct: "'s" })},
  ${g1Row(G1Q.sent, "mc", { question: "Ejefald?", options: ["Tom's dog is big.", "Toms dog is big."], correct: "Tom's dog is big." })},
  ${g1Row(G1Q.oe, "mc", { question: "island?", options: ["ø", "å", "is"], correct: "ø" })},
  ${g1Row(G1Q.num, "number", { question: "Halvanden?", correct: "1,5" })},
  ${g1Row(G1Q.neg, "number", { question: "Minus tre?", correct: "-3" })},
  ${g1Row(G1Q.thousand, "number", { question: "Tusind?", correct: "1 000" })},
  ${g1Row(G1Q.blank, "mc", { question: "Tom nøgle?", options: ["   ", "x"], correct: "   " })},
  ${g1Row(G1Q.nonum, "number", { question: "Ugyldig nøgle?", correct: "abc" })},
  ${g1Row(G1Q.alias, "mc", { question: "Stavning?", options: ["prinsesse", "x"], correct: "prinsesse" },
    { danish_orthography_correct_aliases: ["prinsesse", "Prinsesse"] })},
  ${g1Row(G1Q.match, "mc", { question: "Forbind", options: ["0:2,1:0,2:1", "0:1,1:2,2:0"], correct: "0:2,1:0,2:1" })};`;
const G1_CASES = [
  [G1Q.mc, "Paris", ["Paris", "paris", " PARIS ", "Rom"]],
  [G1Q.poss, "'s", ["'s", "s'", "s", "’s", "es"]],
  [G1Q.sent, "Tom's dog is big.", ["Tom's dog is big.", "Toms dog is big.", "tom's dog is big"]],
  [G1Q.oe, "ø", ["ø", "Ø", "å", "is", "o"]],
  [G1Q.num, "1,5", ["1,5", "1.5", "15", "-1,5", "1,50", " 1,5 "]],
  [G1Q.neg, "-3", ["-3", "3", "−3", "-03"]],
  [G1Q.thousand, "1 000", ["1000", "1 000", "1.000"]],
  [G1Q.blank, "   ", ["   ", "x"]],
  [G1Q.nonum, "abc", ["abc", "0"]],
  [G1Q.alias, "prinsesse", ["prinsesse", "Prinsesse", "PRINSESSE", "prinsese"]],
  [G1Q.alias, "Prinsesse", ["prinsesse", "Prinsesse", "x"]],
  [G1Q.match, "0:2,1:0,2:1", ["0:2,1:0,2:1", "0:1,1:2,2:0", "021021"]],
];
async function compareG1(db, role = "service_role") {
  const out = [];
  for (const [question, key, answers] of G1_CASES) for (const answer of answers) for (const repeat of [0, 1]) {
    const pl = await addPupil(db);
    const pv = await addPupil(db);
    const rl = await legacy(db, pl, await serve(db, pl, question, key, { repeat }), answer);
    const rv = await v2(db, pv, await serve(db, pv, question, key, { repeat }), answer, repeat + 1, randomUUID(), role);
    out.push({ key, answer, repeat, rl, rv, el: await effects(db, pl), ev: await effects(db, pv) });
  }
  return out;
}

test("G1 parity: aligned _v2 grades and pays exactly as G1's process_question_attempt (first answers and repeats)", async () => {
  for (const order of [PROD_ORDER, REPO_ORDER]) {
    const db = await migrated(order);
    await db.exec(G1_SEED);
    const results = await compareG1(db);
    assert.equal(results.length, G1_CASES.reduce((n, [, , a]) => n + a.length, 0) * 2);
    for (const { key, answer, repeat, rl, rv, el, ev } of results) {
      const label = `${JSON.stringify(key)} / ${JSON.stringify(answer)} / repeat ${repeat}`;
      assert.equal(rv.outcome, "recorded", label);
      assert.deepEqual({ status: rv.status, correct_answer: rv.correct_answer }, rl, label);
      assert.deepEqual(ev, el, `effects (XP, coins, counters, streak, instance, quests): ${label}`);
      assert.deepEqual([rv.xp_awarded, rv.coins_awarded], rl.status === "correct" ? (repeat ? [2, 1] : [10, 5]) : [0, 0], label);
    }
    // G1's decisions, so that parity is not parity in a wrong grading.
    const status = (k, a) => results.find((r) => r.key === k && r.answer === a && r.repeat === 0).rl.status;
    for (const [k, a, s] of [["'s", "s'", "incorrect"], ["'s", "’s", "correct"], ["Tom's dog is big.", "Toms dog is big.", "incorrect"],
      ["ø", "å", "incorrect"], ["ø", "Ø", "correct"], ["1,5", "1.5", "correct"], ["1,5", "15", "incorrect"], ["1,5", "-1,5", "incorrect"],
      ["-3", "3", "incorrect"], ["-3", "−3", "correct"], ["1 000", "1000", "correct"], ["   ", "   ", "incorrect"], ["abc", "abc", "incorrect"],
      ["prinsesse", "Prinsesse", "correct"], ["0:2,1:0,2:1", "021021", "incorrect"], ["Paris", " PARIS ", "correct"]]) {
      assert.equal(status(k, a), s, `G1: key ${k} / answer ${a}`);
    }
  }
});

test("the original _v2 (old grading) disagrees with G1 — and service_role cannot call it", async () => {
  const db = await migrated([D280_PATHS, D278, G1, BOOTSTRAP]);
  await db.exec(G1_SEED);
  const p = await addPupil(db);
  await assert.rejects(v2(db, p, await serve(db, p, G1Q.poss, "'s"), "s'", 1), /permission denied for function process_question_attempt_v2/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.question_attempts")).rows[0].n, 0, "nothing registered");
  const results = await compareG1(db, "postgres");                  // as its owner, only to show the defect
  const diverged = results.filter((r) => r.rv.status !== r.rl.status).map((r) => `${r.key}|${r.answer}`);
  for (const c of ["'s|s'", "Tom's dog is big.|Toms dog is big.", "ø|å", "1,5|15", "1,5|-1,5", "-3|3", "0:2,1:0,2:1|021021"]) {
    assert.ok(diverged.includes(c), `the old grading differs on ${c}`);
  }
});

test("H5 can never run the old grading: no API role may call _v2 until it is aligned; then only service_role", async () => {
  const callable = async (db, role) => exists(db, `has_function_privilege('${role}', '${MC_V2}', 'EXECUTE')`);
  for (const order of [[D280_PATHS, D278, G1, BOOTSTRAP], [H5, D278, D280_PATHS, G1, BOOTSTRAP]]) {
    const db = await migrated(order);
    assert.equal(await md5Of(db, MC_V2), MD5.mcV2Original);
    for (const role of ["service_role", "authenticated", "anon"]) assert.equal(await callable(db, role), false, `${role} after the bootstrap`);
    assert.equal(await exists(db, `has_function_privilege('service_role', '${TEXT_V2}', 'EXECUTE')`), true, "process_text_answer_v2 does not grade");
    await db.exec(SQL(ALIGN));
    assert.equal(await md5Of(db, MC_V2), MD5.mcV2Aligned);
    assert.equal(await callable(db, "service_role"), true);
    for (const role of ["authenticated", "anon"]) assert.equal(await callable(db, role), false, `${role} after the alignment`);
  }
  // In production 20261030211428 cannot run (it refuses after D-280), so the only way to _v2 is the
  // bootstrap — which requires G1 — and then the alignment, which requires G1 and grants EXECUTE.
  const prod = await migrated([D280_PATHS, D278]);
  await assert.rejects(prod.exec(SQL(H5)), /er ændret siden analysen/);
  await assert.rejects(prod.exec(SQL(BOOTSTRAP)), /D-290 G1/);
  assert.deepEqual(await h5Objects(prod), NONE);
});

test("rolling G1 back after the alignment makes _v2 fail without registering or paying — never the old grading", async () => {
  const doc = readFileSync(join(ROOT, "docs", "operations", "grading-meaningful-characters-rollback.md"), "utf8").split("\r\n").join("\n");
  const rollback = /```sql\n([\s\S]*?)```/.exec(doc)[1];
  assert.match(rollback, /ROLLBACK D-290 G1/);
  const db = await migrated(PROD_ORDER);
  await db.exec(G1_SEED);
  await db.exec(rollback);
  assert.equal(await md5Of(db, PQA), MD5.pqaD280);
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Aligned, "the rollback leaves _v2 as it is");
  const p = await addPupil(db);
  const qi = await serve(db, p, G1Q.poss, "'s");
  const before = await effects(db, p);
  await assert.rejects(v2(db, p, qi, "s'", 1), /normalize_choice_answer\(text\) does not exist/);
  assert.deepEqual(await effects(db, p), before, "nothing answered, paid or advanced");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.question_attempts")).rows[0].n, 0);
  // Neither H5 file can be (re-)run on the rolled-back database.
  await assert.rejects(db.exec(SQL(ALIGN)), /process_question_attempt har ikke D-290 G1's krop \(md5 328ea8f9/);
  await assert.rejects(db.exec(SQL(BOOTSTRAP)), /D-290 G1 \(md5 328ea8f9/);
});
