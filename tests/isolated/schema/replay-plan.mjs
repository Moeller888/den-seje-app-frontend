// Which repository migrations the ISOLATED CI database replays, and why each other one is not
// replayed (D-110). Pure: give it the migration file names and a reader; it returns one decision per
// file. It never touches a database and never decides anything about production.
//
// The isolated database is built as: local stack → CI baseline (ci-baseline.sql: pre-migration state
// of the tables the migrations ALTER but never CREATE; sanitised catalog DDL, public by owner decision
// 2026-10-27) → CI function stubs (ci-function-stubs.sql) → the migrations this plan marks "apply", in
// version order, with manually applied files at their place → synthetic seed data (tests/isolated/seed/).
// The engine is tests/isolated/schema/replay.mjs.
//
// Decisions, checked in this order:
//   skip     empty file                — 20260317165405_remote_schema.sql is 0 bytes (the D-110 root)
//   apply    app catalog data          — data-only, but shop items / themes (CATALOG_DATA): no pupil
//                                         data, and the app cannot be exercised without them
//   skip     data-only                 — no schema token (classify-changes forbiddenMigrationTokens):
//                                         question-bank content and data fixes; CI uses synthetic data
//   skip     question-bank content     — content migrations the token scan over-refuses (a word in a
//                                         question's text, e.g. "listen"); verified INSERT-only below
//   skip     dual-timestamp twin       — the same migration committed under two timestamps (41 names);
//                                         the first by version is applied. All schema twins are
//                                         token-equivalent (one differs only by a comment and ";;").
//   skip     data precondition         — asserts facts about production rows that synthetic data
//                                         cannot have; the schema effect is listed as a known gap
//   apply    schema part only          — data part needs production rows, schema part is applied
//                                         verbatim (SCHEMA_PART, exact markers)
//   skip     not in production         — merged but, on catalog evidence, never applied there
//   apply    repository ahead of prod  — never applied in production either, but the repository's
//                                         own code depends on it (REPO_AHEAD_OF_PRODUCTION; owner
//                                         decision 2026-10-28): the real file is applied, the drift
//                                         is recorded as an open production task
//
// Some content migrations also carry schema (e.g. an ALTER TABLE between INSERTs) and are therefore
// applied. Their rows never land: the replay runs with a temporary insert filter on public.questions
// (tests/isolated/seed/seed-guard.mjs contentFilterOnSql) — nothing is deleted or truncated, and the
// isolated E2E runs on synthetic questions only.
//   blocked  needs a definition that is not in the repository and awaits owner approval — a
//            blocked file makes schema validation FAIL (never a silent skip)
//   apply    everything else; a file with PRECONDITIONS is applied only after the runner has
//            verified that the baseline created the objects it needs (else: FAIL)
//
// Non-timestamped files (prestige.sql) are never replayed by Supabase either (the CLI requires
// <timestamp>_name.sql); they are reported, not applied.
import { forbiddenMigrationTokens } from "../../../.github/ci/classify-changes.mjs";

export const TIMESTAMPED = /^\d{14}_.+\.sql$/;

export const CONTENT_ONLY = Object.freeze({
  "20260602010000_democracy_power_band5.sql": "question-bank content (INSERT into questions only)",
  "20260602020000_industrialisation_band5.sql": "question-bank content (INSERT into questions only)",
  "20260602050000_middle_ages_band5.sql": "question-bank content (INSERT into questions only)",
  "20260602070000_prehistoric_denmark_band5.sql": "question-bank content (INSERT into questions only)",
  "20261019120002_danish_grade6_9.sql": "question-bank content (INSERT into questions only); token scan hit the word LISTEN in a question",
  "20261020130001_english_level_pilot_1.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and OWNER in a question",
  "20261020130002_english_level_pilot_2.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role)",
  "20261020130003_english_level_pilot_3.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and POLICY in a question",
  "20261020140001_english_level_batch2_1.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role)",
  "20261020140002_english_level_batch2_2.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role)",
  "20261020140003_english_level_batch2_3.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and DROP in a question",
  "20261020150001_english_level_batch3_1.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and LISTEN and DROP in questions",
  "20261020150002_english_level_batch3_2.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role)",
  "20261020150003_english_level_batch3_3.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and DROP and POLICY in questions",
  "20261020160001_english_level_batch4_1.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and LISTEN and DROP in questions",
  "20261020160002_english_level_batch4_2.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and LISTEN, DROP and IMPORT in questions",
  "20261020160003_english_level_batch4_3.sql": "question-bank content (INSERT into questions only); token scan hit ROLE (challenge_role) and IMPORT in a question",
});

export const DATA_PRECONDITION = Object.freeze({});

// Data-only migrations that are APP CATALOG, not question content or production rows: shop items,
// themes and their slot bindings. The app cannot be exercised without them, they contain no pupil
// data, and they are replayed (a unit test pins that each writes only to CATALOG_TABLES — plus the
// one profiles UPDATE named below, which matches no row in the throwaway database).
export const CATALOG_TABLES = Object.freeze(["shop_items", "themes", "titles", "achievements", "streak_milestones", "weekly_quests", "daily_quests"]);
export const CATALOG_DATA = Object.freeze({
  "20260517000001_themes_wave2.sql": "themes catalog",
  "20260521000001_wings_to_back_slot.sql": "shop_items slot binding; its profiles UPDATE re-slots equipped wings and matches no row in CI",
  "20260521000002_galaxy_cape_shop_item.sql": "shop_items catalog",
  "20260524000001_aura_shop_items.sql": "shop_items catalog",
  "20260612040000_avatar_cosmetics_154a.sql": "shop_items catalog",
  "20260623000000_bind_glasses_round_basic_svg.sql": "shop_items asset binding",
});

// Files whose DATA part needs production rows but which ALSO carry a schema change. Only the schema
// part is applied: the exact text between `start` and `end` (each must occur exactly once — anything
// else is a failure, never a guess). The data part is the reason given.
export const SCHEMA_PART = Object.freeze({
  "20260826000000_avatar_jobs_cancelled_status.sql": {
    start: "in access exclusive mode;",
    end: "create temporary table _d107_targets",
    reason: "data part asserts exactly 45 production avatar jobs before closing them; its schema part — the three avatar_generation_jobs CHECK constraints that add status 'cancelled' — is applied verbatim",
  },
  "20261018143726_fix_danish_question_bank_text.sql": {
    start: "EXECUTE $grading$",
    end: "$grading$;",
    reason: "data part rewrites production question rows and raises when they are absent; its schema part — process_question_attempt, created via EXECUTE $grading$ — is applied verbatim",
  },
  "20261029170000_mc_grading_compensation.sql": {
    start: "docs/migration-workflow-policy.md).",
    end: "DO $mc_grading_compensation$",
    reason: "data part compensates two production attempts (D-254) and raises when they are absent; its schema part — the locked public.progress_corrections table (RLS, REVOKE ALL) — is applied verbatim",
  },
  "20261101140000_deactivate_two_misgraded_questions.sql": {
    start: "DROP FUNCTION public.guard_open_round_requires_active_question();",
    end: "DO $g2$",
    reason: "data part (D-290 G2) deactivates two production questions and raises unless both exist with the reviewed content md5; its schema part — the open-round guard (guard_open_round_requires_active_question, its REVOKE and its trigger on question_instances) — is applied verbatim",
  },
});

// The schema part of a SCHEMA_PART file, verbatim. Throws unless both markers occur exactly once.
export function extractSchemaPart(file, sql) {
  const part = SCHEMA_PART[file];
  if (!part) throw new Error(`${file}: no SCHEMA_PART entry`);
  const once = (m) => sql.split(m).length === 2;
  if (!once(part.start) || !once(part.end)) throw new Error(`${file}: SCHEMA_PART markers must each occur exactly once`);
  const a = sql.indexOf(part.start) + part.start.length;
  const b = sql.indexOf(part.end, a);
  if (b < a) throw new Error(`${file}: SCHEMA_PART end marker precedes start`);
  return sql.slice(a, b).trim() + ";\n";
}

// Merged in the repository but NOT applied in production, on catalog evidence (read-only metadata,
// 2026-10-25). CI mirrors production, so they are not replayed; a PR that applies one of them must
// remove it from this list in the same change.
export const NOT_IN_PRODUCTION = Object.freeze({
  "20261107090000_minigame_break_interval_10min.sql":
    "D-364, not applied in production: minigame_break_after_answer there still has D-347's interval of 1200 s (20 minutes); this re-creates it with 600 s",
  "20261031230000_claim_daily_reward_exactly_once.sql":
    "D-284, not applied in production: it re-creates claim_daily_reward, whose production body is still the one before it",
  "20261101120000_night_owl_stop_new_awards.sql":
    "D-286, not applied in production: it re-creates evaluate_achievements and revokes set_night_correct from authenticated, which production still grants",
  "20261103110000_l1_k1_attempt_context.sql":
    "L1 K1, not applied in production: it extends H5's question_attempts (there since the bootstrap, 2026-11-04, still without these columns) with mode, hints and content fingerprint",
  "20261105130000_quiz_anti_guess_cooldown.sql":
    "anti-gætte-pause, not applied in production: it adds quiz_cooldown_* and two triggers on question_instances; not replayed in the isolated stack, where shared synthetic pupils answer many questions wrong in a row (the frontend treats the missing get_my_quiz_cooldown as no pause)",
  "20261105120000_true_false_activation.sql":
    "F-02 Sandt/falsk activation, not applied in production and not to be applied before the get-next-question deploy that makes true_false servable: it admits true_false rows in questions and flips question_is_servable for them",
  "20261108090000_order_categorize_activation.sql":
    "F-04 Rækkefølge + F-05 Kategorisering activation (D-362), not applied in production and not to be applied before the process-event deploy (Q-21) and the get-next-question deploy that make order/categorize servable: it admits order and categorize rows in questions and flips question_is_servable for them",
  "20261108090100_stimulus_pilot_content.sql":
    "F-07 stimulus pilot content (D-362), not applied in production: data only, inserts INACTIVE pilot questions that carry content.stimulus",
  "20261108090200_order_categorize_pilot_content.sql":
    "F-04/F-05 pilot content (D-362), not applied in production and not applicable before 20261108090000: data only, inserts INACTIVE order and categorize pilot questions",
  "20261109151000_set_student_domains_pilot_lock.sql":
    "D-362 pilot lock, not applied in production and to be applied before the pilot_d362 rows are activated: it re-creates set_student_domains so a teacher cannot add a pilot_* domain and a save keeps the pupil's existing pilot_* domains",
  "20261020170001_english_level_batch5_1.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020170002_english_level_batch5_2.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020170003_english_level_batch5_3.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020180001_english_level_batch6_1.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020180002_english_level_batch6_2.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020180003_english_level_batch6_3.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020190001_english_level_batch7_1.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020190002_english_level_batch7_2.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020190003_english_level_batch7_3.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020200001_english_level_batch8_1.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020200002_english_level_batch8_2.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020200003_english_level_batch8_3.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020210001_english_level_batch9_1.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020210002_english_level_batch9_2.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020210003_english_level_batch9_3.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020220001_english_level_batch10_1.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020220002_english_level_batch10_2.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
  "20261020220003_english_level_batch10_3.sql":
    "English 5,000 (owner decision 2026-11-05), not applied in production: data only, inserts inactive English questions (metadata.level_batch)",
});

// Merged in the repository, NOT applied in production, and APPLIED here anyway — by owner decision
// (2026-10-28, option B): the isolated CI tests the repository's code against the schema that code
// declares, so where the repository's own code depends on such a migration, CI applies the real
// migration file (never a stub). Each entry is schema drift between the repository and production,
// recorded as an open production task; nothing here changes production.
export const REPO_AHEAD_OF_PRODUCTION = Object.freeze({
  "20260808010000_password_help_reserve_rpc.sql":
    "repository ahead of production: the repository's request-password-help calls public.reserve_password_help, which production does not have (catalog, 2026-10-25) — open production task D-243",
  "20261030211428_question_attempts_v2.sql":
    "repository ahead of production: the repository's process-event calls process_question_attempt_v2 / process_text_answer_v2 behind the H5 switch, which production does not have (catalog, 2026-11-01) — open production task D-266/D-273 (H5)",
  "20261112150000_avatar_northstar_hair_d373.sql":
    "repository ahead of production: the repository's Northstar wardrobe saves the hairstyle (avatar_identity.northstar.hair) through set_avatar_northstar behind NORTHSTAR_HAIR_CHOICE, which production's validate_avatar_identity refuses — open production task D-373 (apply before the flag is turned on)",
});

// Every timestamped migration from ACCOUNTED_FROM on must be accounted for in exactly one place:
// NOT_IN_PRODUCTION (merged, not applied — not replayed, data-only files included), REPO_AHEAD_OF_PRODUCTION
// (not applied, replayed by owner decision) or APPLIED_IN_PRODUCTION below (applied AND verified, with
// the version production's ledger gave it). A new migration that is in none
// of them fails tests/unit/replay-accounting-complete.test.mjs, so a merge can no longer replay an
// unapplied file by omission. A file moves to APPLIED_IN_PRODUCTION only after its application in
// production is verified; it then leaves NOT_IN_PRODUCTION in the same change.
export const ACCOUNTED_FROM = "20261020000000";
export const APPLIED_IN_PRODUCTION = Object.freeze({
  "20261020120000_difficulty_scale_a.sql": "20261030045204",
  "20261020125000_english_grade6_9.sql": "20261106094831",
  "20261020130001_english_level_pilot_1.sql": "20261106192437",
  "20261020130002_english_level_pilot_2.sql": "20261106193242",
  "20261020130003_english_level_pilot_3.sql": "20261106194452",
  "20261020140001_english_level_batch2_1.sql": "20261107161010",
  "20261020140002_english_level_batch2_2.sql": "20261107162331",
  "20261020140003_english_level_batch2_3.sql": "20261108102751",
  "20261020150001_english_level_batch3_1.sql": "20261109142935",
  "20261020150002_english_level_batch3_2.sql": "20261109150712",
  "20261020150003_english_level_batch3_3.sql": "20261109151454",
  "20261020160001_english_level_batch4_1.sql": "20261111170401",
  "20261020160002_english_level_batch4_2.sql": "20261111173154",
  "20261020160003_english_level_batch4_3.sql": "20261111182211",
  "20261022120000_fix_mc_correct_answer_not_in_options.sql": "20261029141201",
  "20261025120000_student_rpc_caller_scope.sql": "20261025172041",
  "20261026110000_leaderboard_execute_containment.sql": "20261026113548",
  "20261026120000_leaderboard_identity_scope.sql": "20261026161704",
  "20261026170000_recalculate_prestige_execute_containment.sql": "20261026192215",
  "20261026180000_recalculate_prestige_caller_scope.sql": "20261027052218",
  "20261027090000_sweep_stale_generation_jobs_hardening.sql": "20261027102310",
  "20261027110000_avatar_generation_jobs_read_scope.sql": "20261027124113",
  "20261027120000_repeat_answer_coin_reward.sql": "20261027162102",
  "20261027130000_recover_stuck_job_atomic_execute_scope.sql": "20261027151432",
  "20261027160000_revoke_truncate_maintain_api_roles.sql": "20261104155040",
  "20261029120000_difficulty_scale_b.sql": "20261030094958",
  "20261029150000_teacher_stats_from_answers.sql": "20261030092931",
  "20261029170000_mc_grading_compensation.sql": "20261031171755",
  "20261030120000_student_subject_level_comment.sql": "20261030182931",
  "20261031190000_reward_integrity_server_authority.sql": "20261101101441",
  "20261031194600_mc_length_cue_answer_paths.sql": "20261101101401",
  "20261031194700_mc_length_cue_top10.sql": "20261101102339",
  "20261101140000_deactivate_two_misgraded_questions.sql": "20261102071826",
  "20261101150000_grading_meaningful_characters.sql": "20261102064630",
  "20261101170000_achievement_reward_exactly_once.sql": "20261102073618",
  "20261101190000_question_attempts_v2_bootstrap.sql": "20261104095423",
  "20261101190100_question_attempts_v2_align_grading.sql": "20261104140659",
  "20261101210000_question_history_restrict.sql": "20261102182750",
  "20261102100000_release_open_rounds_on_inactive_questions.sql": "20261102123618",
  "20261103100000_question_attempts_history_no_action.sql": "20261104163310",
  "20261105090000_minigame_breaks.sql": "20261105060103",
  "20261106120000_avatar_northstar_choice.sql": "20261106151348",
});

// Non-timestamped files the Supabase CLI never replays, but which production has (applied by hand),
// on catalog evidence. Applied AFTER the timestamped migrations; each must be idempotent.
// `before`: the timestamped migration it is applied immediately before — its place in production's
// history (prestige.sql was committed 2026-05-19, before the leaderboard that ranks by it, and later
// migrations change recalculate_prestige).
export const MANUALLY_APPLIED_IN_PRODUCTION = Object.freeze({
  "prestige.sql": {
    reason: "applied by hand in production: prestige_weight, recalculate_prestige and student_progress.prestige_score exist there (catalog 2026-10-25)",
    before: "20260519000300_leaderboard.sql",
  },
});

// Migrations whose definitions are not reproducible from the repository and that are therefore not
// replayed. A blocked file makes schema validation FAIL. Empty: review_answer's two overloads come from
// the CI function stubs (ci-function-stubs.sql) — see PRECONDITIONS.
export const BLOCKED = Object.freeze({});

// Objects a migration needs that no repository migration creates: they must come from the CI
// baseline. The runner checks each with to_regprocedure/to_regclass BEFORE applying the file and
// fails if one is missing — a baseline without them can never produce a green replay.
export const PRECONDITIONS = Object.freeze({
  "20260919000000_review_answer_execute_lockdown.sql": [
    "public.review_answer(uuid,integer,text,uuid)",
    "public.review_answer(uuid,integer,text)",
  ],
});

// SQL that returns one row per missing precondition object (empty result = all present).
export function preconditionCheckSql(file) {
  const objs = PRECONDITIONS[file] ?? [];
  if (objs.length === 0) return null;
  const rows = objs.map((o) => `SELECT ${"'" + o.replace(/'/g, "''") + "'"} AS missing WHERE to_regprocedure(${"'" + o.replace(/'/g, "''") + "'"}) IS NULL`);
  return rows.join("\nUNION ALL\n") + ";";
}

// TEST PROFILES (owner GO 2026-11-07, F10-B2: "K1 i isolerede integrationstests"). A profile replays,
// in the isolated CI database ONLY, a named set of files that are NOT_IN_PRODUCTION — so a test lane can
// exercise code that needs them (K1: process-event's H5 call with p_mode/p_hints_used) while the default
// plan keeps mirroring production exactly. Rules, enforced in planReplay and by
// tests/unit/replay-test-profiles.test.mjs:
//   - the default (no profile, or "production") is byte-for-byte today's plan; production's guards and
//     every existing replay test run against it unchanged;
//   - a profile may only name files that are in NOT_IN_PRODUCTION (it can never re-order, drop or
//     re-classify anything production has), and every file it names must exist;
//   - an unknown profile name fails loud;
//   - a profile never touches production: replay.mjs runs only after assertSeedTarget has proven the
//     target is this run's isolated database, and production migrations go only through
//     apply_migration with a separate owner authorisation (D-110).
export const DEFAULT_PROFILE = "production";
export const TEST_PROFILES = Object.freeze({
  k1: Object.freeze({
    "20261103110000_l1_k1_attempt_context.sql":
      "TEST PROFILE k1: L1 K1 is NOT applied in production; replayed only in the isolated K1 lane so H5 submissions (p_mode/p_hints_used → 9/10-parameter _v2) can be tested (D-341)",
  }),
});

export function profileFiles(profile = DEFAULT_PROFILE) {
  if (profile === undefined || profile === null || profile === DEFAULT_PROFILE) return Object.freeze({});
  if (!Object.hasOwn(TEST_PROFILES, profile)) {
    throw new Error(`unknown replay profile: ${JSON.stringify(profile)} (known: ${[DEFAULT_PROFILE, ...Object.keys(TEST_PROFILES)].join(", ")})`);
  }
  const files = TEST_PROFILES[profile];
  for (const f of Object.keys(files)) {
    if (!NOT_IN_PRODUCTION[f]) throw new Error(`replay profile ${profile}: ${f} is not in NOT_IN_PRODUCTION — a profile may only add test-only replays`);
  }
  return files;
}

export function planReplay(fileNames, readSql, { profile = DEFAULT_PROFILE } = {}) {
  const extra = profileFiles(profile);
  const files = [...fileNames].sort();
  for (const f of Object.keys(extra)) {
    if (!files.includes(f)) throw new Error(`replay profile ${profile}: ${f} does not exist`);
  }
  const timestamped = files.filter((f) => TIMESTAMPED.test(f));
  const seenNames = new Map(); // name without timestamp → first file
  const plan = [];
  for (const f of timestamped) {
    const sql = readSql(f);
    const name = f.slice(15);
    const twinOf = seenNames.get(name);
    if (!twinOf) seenNames.set(name, f);
    let d;
    if (typeof sql !== "string" || sql.trim() === "") d = { action: "skip", reason: "empty file (0 bytes) — the D-110 root" };
    else if (BLOCKED[f]) d = { action: "blocked", reason: BLOCKED[f] };
    else if (twinOf) d = { action: "skip", reason: `dual-timestamp twin of ${twinOf}` };
    else if (CONTENT_ONLY[f]) d = { action: "skip", reason: CONTENT_ONLY[f] };
    else if (DATA_PRECONDITION[f]) d = { action: "skip", reason: DATA_PRECONDITION[f] };
    else if (SCHEMA_PART[f]) d = { action: "apply", part: true, reason: SCHEMA_PART[f].reason, requires: PRECONDITIONS[f] ?? [] };
    else if (NOT_IN_PRODUCTION[f] && extra[f]) d = { action: "apply", reason: extra[f], profile, requires: PRECONDITIONS[f] ?? [] };
    else if (NOT_IN_PRODUCTION[f]) d = { action: "skip", reason: NOT_IN_PRODUCTION[f] };
    else if (REPO_AHEAD_OF_PRODUCTION[f]) d = { action: "apply", reason: REPO_AHEAD_OF_PRODUCTION[f], requires: PRECONDITIONS[f] ?? [] };
    else if (CATALOG_DATA[f]) d = { action: "apply", reason: `app catalog data: ${CATALOG_DATA[f]}`, requires: [] };
    else if (forbiddenMigrationTokens(sql).length === 0) d = { action: "skip", reason: "data-only (no schema token); synthetic data replaces it" };
    else d = { action: "apply", reason: "", requires: PRECONDITIONS[f] ?? [] };
    plan.push({ file: f, ...d });
  }
  const nonTimestamped = files.filter((f) => f.endsWith(".sql") && !TIMESTAMPED.test(f));
  const manual = nonTimestamped.filter((f) => MANUALLY_APPLIED_IN_PRODUCTION[f]);
  const notReplayed = nonTimestamped.filter((f) => !MANUALLY_APPLIED_IN_PRODUCTION[f]);
  return { plan, manual, notReplayed };
}

export function summarise(plan) {
  const by = (a) => plan.filter((p) => p.action === a).length;
  return { total: plan.length, apply: by("apply"), skip: by("skip"), blocked: by("blocked") };
}
