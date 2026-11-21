// Every migration version (the 14-digit YYYYMMDDHHMMSS prefix) is used by exactly one file.
//
// WHY: the migration ledger is keyed on the version. Two files with one version collide when applied, and
// two PRs can each be green on their own while sharing a version — F10-B2 found exactly that (#647 and #651
// both used 20261107090000; only a merge conflict revealed it). A pull_request CI run tests the PR's MERGE
// commit with main, so this check sees main's files and the PR's together and fails before the merge.
// Per-migration tests already assert their own version ("the version is unique"); this is the general rule
// for every file, including ones without a dedicated test. Proposal (b) in
// docs/operations/branch-protection-forslag.md. Runs inside the required `unit` check: no new check name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
const files = readdirSync(DIR).filter((n) => n.endsWith(".sql"));
const versioned = files.filter((n) => /^\d{14}_.+\.sql$/.test(n));

test("every migration version is used by exactly one file", () => {
  const byVersion = new Map();
  for (const f of versioned) byVersion.set(f.slice(0, 14), [...(byVersion.get(f.slice(0, 14)) ?? []), f]);
  const clashes = [...byVersion.entries()].filter(([, list]) => list.length > 1).map(([v, list]) => `${v}: ${list.join(", ")}`);
  assert.deepEqual(clashes, [], "two files share a migration version — renumber the newer one to a free version");
});

test("a versioned migration file name is well formed (14 digits, underscore, a name, .sql)", () => {
  assert.ok(versioned.length > 100, `found ${versioned.length} versioned migrations`);
  for (const f of versioned) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, f);
  // The only unversioned file is the historical prestige.sql (manually applied, see replay-plan.mjs).
  assert.deepEqual(files.filter((n) => !/^\d{14}_/.test(n)), ["prestige.sql"]);
});

test("negative control: the rule catches a clash", () => {
  const sample = ["20261107090000_a.sql", "20261107090000_b.sql", "20261108150000_c.sql"];
  const seen = new Set(); const dup = [];
  for (const f of sample) { const v = f.slice(0, 14); if (seen.has(v)) dup.push(v); seen.add(v); }
  assert.deepEqual(dup, ["20261107090000"]);
});
