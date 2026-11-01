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
  "20261031194600_mc_length_cue_answer_paths.sql":
    "D-280 part 1, not applied in production: it changes process_question_attempt and the three repeat functions production runs",
  "20261031194700_mc_length_cue_top10.sql":
    "D-280 part 2, not applied in production: it rewrites ten production questions and the keys of their open instances, and requires part 1",
  "20261031230000_claim_daily_reward_exactly_once.sql":
    "D-284, not applied in production: it re-creates claim_daily_reward, whose production body is still the one before it",
  "20261101120000_night_owl_stop_new_awards.sql":
    "D-286, not applied in production: it re-creates evaluate_achievements and revokes set_night_correct from authenticated, which production still grants",
});

// Merged in the repository, NOT applied in production, and APPLIED here anyway — by owner decision
// (2026-10-28, option B): the isolated CI tests the repository's code against the schema that code
// declares, so where the repository's own code depends on such a migration, CI applies the real
// migration file (never a stub). Each entry is schema drift between the repository and production,
// recorded as an open production task; nothing here changes production.
export const REPO_AHEAD_OF_PRODUCTION = Object.freeze({
  "20260808010000_password_help_reserve_rpc.sql":
    "repository ahead of production: the repository's request-password-help calls public.reserve_password_help, which production does not have (catalog, 2026-10-25) — open production task D-243",
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

export function planReplay(fileNames, readSql) {
  const files = [...fileNames].sort();
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
