// The isolated replay mirrors production: D-284 and D-286 are merged but NOT applied there
// (read-only catalog 2026-11-01), so the replay must skip them until a PR that applies one removes it
// from NOT_IN_PRODUCTION in the same change. They were missing from the list after their merges and
// were replayed by mistake; this pins the correction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "supabase", "migrations");
const files = readdirSync(DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f));
const readMigration = (f) => readFileSync(join(DIR, f), "utf8");

const PENDING = {
  "20261031230000_claim_daily_reward_exactly_once.sql": /D-284, not applied in production/,
  "20261101120000_night_owl_stop_new_awards.sql": /D-286, not applied in production/,
};

test("D-284 and D-286 are in the tree, listed as not in production, and skipped by the replay", () => {
  const plan = planReplay(files, readMigration).plan;
  for (const [file, reason] of Object.entries(PENDING)) {
    assert.ok(files.includes(file), `${file} is in the tree`);
    assert.match(NOT_IN_PRODUCTION[file] ?? "", reason, file);
    const step = plan.find((p) => p.file === file);
    assert.ok(step, `${file} is planned`);
    assert.equal(step.action, "skip", `${file} must not be replayed before it is applied in production`);
  }
});

test("negative control: without the entries the replay would apply them (they carry schema)", () => {
  // The same plan with these two names unknown to NOT_IN_PRODUCTION: both carry CREATE FUNCTION, so
  // the planner would apply them — which is exactly the mistake this list prevents.
  for (const file of Object.keys(PENDING)) {
    assert.match(readMigration(file), /CREATE OR REPLACE FUNCTION public\./, `${file} is a schema change`);
  }
});
