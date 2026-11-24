// F10-B2 (owner GO 2026-11-07): a permanent, reproducible K1 lane in the ISOLATED CI database, without
// loosening a single production guard.
//
// Proven here:
//   1. DEFAULT = PRODUCTION MIRROR: the plan with no profile, and with "production", is identical to the
//      plan built by the pre-profile call signature; K1 stays skipped there (the existing guards in
//      isolated-schema-replay, question-attempts-v2-bootstrap and l1-k1-attempt-context keep testing it).
//   2. THE K1 PROFILE changes exactly one decision — K1 from skip to apply — and nothing else (same files,
//      same order, every other action and reason identical).
//   3. A PROFILE CAN ONLY ADD TEST-ONLY REPLAYS: every file a profile names is in NOT_IN_PRODUCTION and
//      exists; an unknown profile fails loud; a profile naming a production file is refused.
//   4. THE K1 LANE IS REAL AND FENCED: on the full replay (PGlite), the k1 profile yields K1's schema
//      (mode/hints_used columns, the 9-parameter _v2) and the default yields none of it.
//   5. ONLY THE ISOLATED WORKFLOW USES A PROFILE: it passes --profile from its own matrix, the
//      production-mirror check name is unchanged, the k1 entry skips the frontend suite, a schema step
//      fails if K1 is missing in the lane or present in the mirror, and no workflow anywhere applies
//      migrations or deploys functions. replay.mjs reads the profile only from --profile (never the
//      environment) and validates it before connecting; it then runs only after assertSeedTarget.
// HONEST LIMITS: PGlite is PostgreSQL 18 (production 17.6) as superuser. The Playwright H5 specs
// themselves run in CI (isolated-e2e, K1-testprofil), not here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  planReplay, profileFiles, TEST_PROFILES, DEFAULT_PROFILE, NOT_IN_PRODUCTION,
} from "../isolated/schema/replay-plan.mjs";
import { replaySchema, migrationFiles, readMigration } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const K1 = "20261103110000_l1_k1_attempt_context.sql";
// PR #664: the introduction lane's chain, in its binding order. D-383 (20261120150000) is the fifth: the lane where
// course items and ordinary requests meet.
const INTRO_CHAIN = [K1, "20261108043500_laerligverse_served_mode_hint_log.sql", "20261109043500_laerligverse_presented_at.sql",
  "20261110043500_laerligverse_introductions.sql", "20261120150000_course_items_out_of_ordinary_quiz.sql",
  // D-383 follow-up: the shared candidate RPCs filter course items before their limit (requires D-383).
  "20261123100000_course_scope_before_candidate_limit.sql"];
const files = migrationFiles();

test("1. default = production mirror: no profile, 'production' and the old call give the same plan; K1 skipped", () => {
  const old = planReplay(files, readMigration);
  assert.deepEqual(planReplay(files, readMigration, {}), old);
  assert.deepEqual(planReplay(files, readMigration, { profile: DEFAULT_PROFILE }), old);
  assert.equal(DEFAULT_PROFILE, "production");
  const k1 = old.plan.find((p) => p.file === K1);
  assert.equal(k1.action, "skip");
  assert.equal(k1.profile, undefined);
  assert.ok(old.plan.every((p) => p.profile === undefined), "no decision carries a profile by default");
});

test("2. the k1 profile changes exactly one decision: K1 skip → apply", () => {
  const base = planReplay(files, readMigration).plan;
  const k1 = planReplay(files, readMigration, { profile: "k1" }).plan;
  assert.deepEqual(k1.map((p) => p.file), base.map((p) => p.file), "same files, same order");
  const changed = k1.filter((p, i) => JSON.stringify(p) !== JSON.stringify(base[i]));
  assert.equal(changed.length, 1);
  assert.equal(changed[0].file, K1);
  assert.equal(changed[0].action, "apply");
  assert.equal(changed[0].profile, "k1");
  assert.match(changed[0].reason, /NOT applied in production/);
});

test("2b. the introduction profile changes exactly its six decisions (K1 → L3/L5 → K9 → introductions → D-383 → its follow-up) skip → apply", () => {
  const base = planReplay(files, readMigration).plan;
  const intro = planReplay(files, readMigration, { profile: "introduction" }).plan;
  assert.deepEqual(intro.map((p) => p.file), base.map((p) => p.file), "same files, same order");
  const changed = intro.filter((p, i) => JSON.stringify(p) !== JSON.stringify(base[i]));
  assert.deepEqual(changed.map((p) => p.file), INTRO_CHAIN, "exactly the chain, in the binding order");
  for (const p of changed) {
    assert.equal(p.action, "apply");
    assert.equal(p.profile, "introduction");
    assert.match(p.reason, /NOT applied in production/);
    assert.equal(base.find((b) => b.file === p.file).action, "skip", `${p.file} is skipped in the mirror`);
  }
  // The course-progress read (#665), also NOT_IN_PRODUCTION, stays out of the lane: a profile names only what it needs.
  assert.equal(intro.find((p) => p.file === "20261109120000_laerligverse_course_progress_read.sql").action, "skip");
});

test("3. a profile can only add test-only replays; unknown or production-naming profiles fail loud", () => {
  assert.deepEqual(Object.keys(TEST_PROFILES), ["k1", "introduction"]);
  assert.deepEqual(Object.keys(TEST_PROFILES.k1), [K1]);
  assert.deepEqual(Object.keys(TEST_PROFILES.introduction), INTRO_CHAIN);
  for (const [name, list] of Object.entries(TEST_PROFILES)) {
    assert.ok(Object.isFrozen(list), `${name} is frozen`);
    for (const f of Object.keys(list)) {
      assert.ok(NOT_IN_PRODUCTION[f], `${name}: ${f} must be NOT_IN_PRODUCTION`);
      assert.ok(files.includes(f), `${name}: ${f} must exist`);
    }
  }
  assert.ok(Object.isFrozen(TEST_PROFILES));
  assert.throws(() => profileFiles("k2"), /unknown replay profile/);
  assert.throws(() => planReplay(files, readMigration, { profile: "K1" }), /unknown replay profile/);
  assert.throws(() => planReplay(files, readMigration, { profile: "" }), /unknown replay profile/);
  // The plan refuses a profile file that is missing from the tree (a renamed K1 cannot silently vanish).
  assert.throws(() => planReplay(files.filter((f) => f !== K1), readMigration, { profile: "k1" }), /does not exist/);
});

async function replayDb(profile) {
  const db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows, profile });
  return { db, r };
}
const k1Facts = async (db) => ({
  columns: (await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'question_attempts' AND column_name IN ('mode', 'hints_used')
    ORDER BY column_name`)).rows.map((r) => r.column_name),
  v2: (await db.query(`SELECT pronargs FROM pg_proc WHERE proname = 'process_question_attempt_v2'
    AND pronamespace = 'public'::regnamespace ORDER BY pronargs`)).rows.map((r) => r.pronargs),
});

test("4. on the full replay: the k1 profile yields K1's schema, the default none of it", async () => {
  // One database at a time: each PGlite is a whole PostgreSQL in WASM.
  const prod = await replayDb(undefined);
  assert.deepEqual(prod.r.failures, [], "the production-mirror replay builds");
  const p = await k1Facts(prod.db);
  await prod.db.close();
  assert.deepEqual(p.columns, [], "no K1 columns in the mirror");
  assert.ok(!p.v2.includes(9), "no 9-parameter _v2 in the mirror");

  const lane = await replayDb("k1");
  assert.deepEqual(lane.r.failures, [], "the K1 lane replay builds");
  const k = await k1Facts(lane.db);
  await lane.db.close();
  assert.deepEqual(k.columns, ["hints_used", "mode"]);
  assert.ok(k.v2.includes(9), "the 9-parameter _v2 exists in the K1 lane");
  assert.ok(lane.r.steps.some((s) => s.name === K1 && s.ok), "K1 itself was applied");
});

test("5. only the isolated workflow uses a profile, and it is fenced", () => {
  const wf = read(".github/workflows/isolated-e2e.yml");
  assert.match(wf, /name: isolated-e2e \(run \$\{\{ matrix\.run \}\}\$\{\{ matrix\.profile == 'k1' && ', K1-testprofil' \|\| matrix\.profile == 'introduction' && ', introduktion-testprofil' \|\| '' \}\}\)/,
    "the production-mirror check name stays 'isolated-e2e (run N)'; the lanes get their suffix");
  assert.match(wf, /profile: \[production\]\n\s+include:\n\s+- run: 1\n\s+profile: k1\n\s+- run: 1\n\s+profile: introduction\n\s+steps:/,
    "exactly one k1 entry and one introduction entry");
  assert.match(wf, /replay\.mjs --db-url "\$ISOLATED_DB_URL" --summary "\$GITHUB_STEP_SUMMARY" --profile "\$REPLAY_PROFILE"/);
  assert.match(wf, /REPLAY_PROFILE: \$\{\{ matrix\.profile \}\}/);
  assert.match(wf, /K1 lane without K1/);
  assert.match(wf, /K1 leaked into the production-mirror lane/);
  for (const m of ["introduction lane without K1", "introduction lane without L3/L5, K9 or the introductions",
    "introduction objects leaked into the K1 lane", "introduction objects leaked into the production-mirror lane"]) assert.ok(wf.includes(m), m);
  // The frontend suite runs only in the production mirror (every test lane runs the isolated specs instead).
  assert.match(wf, /- name: Existing Playwright suite against the isolated stack\n\s+if: needs\.plan\.outputs\.scope != 'docs-md' && matrix\.profile == 'production'/);
  // The introduction flags are switched on in the introduction lane ONLY, and nowhere else in any workflow.
  const edge = wf.split("- name: Edge Functions")[1].split("\n      - name:")[0];
  assert.match(edge, /REPLAY_PROFILE: \$\{\{ matrix\.profile \}\}/);
  assert.match(edge, /if \[ "\$REPLAY_PROFILE" = "introduction" \]; then\n\s+echo 'LAERLIGVERSE_INTRODUCTION=on' >> "\$RUNNER_TEMP\/functions\.env"\n\s+echo 'LAERLIGVERSE_PRESENTED=on' >> "\$RUNNER_TEMP\/functions\.env"\n\s+fi\n/);
  assert.equal(wf.split("LAERLIGVERSE_INTRODUCTION=on").length - 1, 1);
  assert.equal(wf.split("LAERLIGVERSE_PRESENTED=on").length - 1, 1);
  // The guard step that refuses non-isolated targets precedes everything and is unchanged.
  assert.match(wf, /- name: Guard — refuse anything that is not isolated/);

  const dir = join(ROOT, ".github", "workflows");
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const body = readFileSync(join(dir, f), "utf8");
    if (f !== "isolated-e2e.yml") assert.ok(!/--profile|replay\.mjs/.test(body), `${f} must not run the replay or pass a profile`);
    assert.ok(!/functions deploy|apply_migration|supabase\s+db\s+(push|reset --linked)/.test(body), `${f} must not deploy or apply migrations`);
    if (f !== "isolated-e2e.yml") assert.ok(!/LAERLIGVERSE_(INTRODUCTION|PRESENTED)/.test(body), `${f} must not switch on the introduction`);
  }

  const engine = read("tests/isolated/schema/replay.mjs");
  assert.match(engine, /const profile = arg\("--profile"\) \?\? DEFAULT_PROFILE;/);
  assert.ok(!/process\.env\.[A-Z_]*PROFILE/.test(engine), "the profile is never read from the environment");
  const i = engine.indexOf("profileFiles(profile);");
  assert.ok(i > 0 && i < engine.indexOf("psqlExecutor(dbUrl);", i) && engine.indexOf("assertSeedTarget(", i) > i,
    "validated before connecting, and the isolation guard still runs before the replay");
});
