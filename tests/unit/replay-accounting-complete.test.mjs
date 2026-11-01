// Migration accounting is COMPLETE: every timestamped migration from ACCOUNTED_FROM on is in exactly one
// of NOT_IN_PRODUCTION, REPO_AHEAD_OF_PRODUCTION or APPLIED_IN_PRODUCTION (tests/isolated/schema/
// replay-plan.mjs). A PR that adds a migration without accounting for it fails here — so a merged but
// unapplied file can no longer be replayed in the isolated CI by omission (D-284 and D-286 were, 2026-11-01).
// A file moves to APPLIED_IN_PRODUCTION only with the version production's ledger gave it, after its
// application is verified.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ACCOUNTED_FROM, APPLIED_IN_PRODUCTION, NOT_IN_PRODUCTION, REPO_AHEAD_OF_PRODUCTION, planReplay,
} from "../isolated/schema/replay-plan.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
const files = readdirSync(DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const readMigration = (f) => readFileSync(join(DIR, f), "utf8");
const LISTS = { NOT_IN_PRODUCTION, REPO_AHEAD_OF_PRODUCTION, APPLIED_IN_PRODUCTION };

function unaccounted(names) {
  return names
    .filter((f) => f.slice(0, 14) >= ACCOUNTED_FROM)
    .filter((f) => Object.values(LISTS).filter((l) => Object.hasOwn(l, f)).length !== 1);
}

test("every migration from ACCOUNTED_FROM on is accounted for in exactly one list", () => {
  assert.deepEqual(unaccounted(files), [],
    "add the new migration to NOT_IN_PRODUCTION (merged, not applied) in the same PR; move it to " +
    "APPLIED_IN_PRODUCTION only after its application in production is verified");
});

test("negative control: an unlisted new migration is caught, and so is one listed twice", () => {
  assert.deepEqual(unaccounted([...files, "20991231235959_unlisted.sql"]), ["20991231235959_unlisted.sql"]);
  const twice = Object.keys(APPLIED_IN_PRODUCTION)[0];
  const saved = NOT_IN_PRODUCTION;
  const both = { ...saved, [twice]: "not applied in production: test" };
  const count = [both, REPO_AHEAD_OF_PRODUCTION, APPLIED_IN_PRODUCTION].filter((l) => Object.hasOwn(l, twice)).length;
  assert.equal(count, 2, "a file in two lists is not 'exactly one'");
});

test("every listed name exists; applied versions are 14 digits; nothing unapplied is replayed", () => {
  for (const [name, list] of Object.entries(LISTS)) {
    for (const f of Object.keys(list)) assert.ok(files.includes(f), `${name}: ${f} is not in the tree`);
  }
  for (const [f, v] of Object.entries(APPLIED_IN_PRODUCTION)) assert.match(v, /^\d{14}$/, f);
  const plan = planReplay(files, readMigration).plan;
  for (const f of Object.keys(NOT_IN_PRODUCTION)) {
    assert.equal(plan.find((p) => p.file === f)?.action, "skip", `${f} is not applied in production and must not be replayed`);
  }
});
