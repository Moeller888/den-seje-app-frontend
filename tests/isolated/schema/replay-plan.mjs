// Which repository migrations the ISOLATED CI database replays, and why each other one is not
// replayed (D-110). Pure: give it the migration file names and a reader; it returns one decision per
// file. It never touches a database and never decides anything about production.
//
// The isolated database is built as: platform stub/stack → CI baseline (pre-migration state of the
// eight tables the migrations ALTER but never CREATE; kept outside this public repository until its
// security review is approved) → the migrations this plan marks "apply", in version order →
// synthetic seed data (tests/isolated/seed/).
//
// Decisions, checked in this order:
//   skip     empty file                — 20260317165405_remote_schema.sql is 0 bytes (the D-110 root)
//   skip     data-only                 — no schema token (classify-changes forbiddenMigrationTokens):
//                                         question-bank content and data fixes; CI uses synthetic data
//   skip     question-bank content     — content migrations the token scan over-refuses (a word in a
//                                         question's text, e.g. "listen"); verified INSERT-only below
//   skip     dual-timestamp twin       — the same migration committed under two timestamps (41 names);
//                                         the first by version is applied. All schema twins are
//                                         token-equivalent (one differs only by a comment and ";;").
//   skip     data precondition         — asserts facts about production rows that synthetic data
//                                         cannot have; the schema effect is listed as a known gap
//   skip     not in production         — merged but, on catalog evidence, never applied there
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

export const DATA_PRECONDITION = Object.freeze({
  "20260826000000_avatar_jobs_cancelled_status.sql":
    "asserts exactly 45 production avatar jobs before closing them; known gap: avatar_generation_jobs status 'cancelled' is not added in CI",
  "20261018143726_fix_danish_question_bank_text.sql":
    "rewrites production question rows and raises when they are absent; no schema effect after its run",
});

// Merged in the repository but NOT applied in production, on catalog evidence (read-only metadata,
// 2026-10-25). CI mirrors production, so they are not replayed; a PR that applies one of them must
// remove it from this list in the same change.
export const NOT_IN_PRODUCTION = Object.freeze({
  "20260808010000_password_help_reserve_rpc.sql":
    "not applied in production: public.reserve_password_help does not exist there (the request-password-help Edge Function calls it — reported to the owner)",
  "20261020120000_difficulty_scale_a.sql":
    "not applied in production (owner decision pending): student_subject_level and difficulty_level_from_grade_band do not exist there",
});

// Non-timestamped files the Supabase CLI never replays, but which production has (applied by hand),
// on catalog evidence. Applied AFTER the timestamped migrations; each must be idempotent.
export const MANUALLY_APPLIED_IN_PRODUCTION = Object.freeze({
  "prestige.sql":
    "applied by hand in production: prestige_weight, recalculate_prestige and student_progress.prestige_score exist there (catalog 2026-10-25)",
});

// Migrations whose definitions are not reproducible from the repository and that are therefore not
// replayed. A blocked file makes schema validation FAIL. Empty since 2026-10-25: review_answer was
// read with owner approval and moved into the (private) CI baseline — see PRECONDITIONS.
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
    else if (NOT_IN_PRODUCTION[f]) d = { action: "skip", reason: NOT_IN_PRODUCTION[f] };
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
