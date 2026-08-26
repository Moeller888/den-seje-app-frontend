// 'cancelled' is a new terminal state on avatar_generation_jobs. It only works if the migration
// and the admin UI agree about it, and if the migration respects three things the table already
// guarantees:
//
//   1. the status allowlist admits it
//   2. the two timestamp-consistency constraints have a defined answer for it
//   3. closing the backlog neither deletes a row nor loses the prior status
//
// These are source-level assertions on the migration text and the page script. They pin the SHAPE
// of the change — that every constraint the new value touches was actually rewritten, and that no
// delete crept in. They are not a database run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SQL = readFileSync(
  join(ROOT, "supabase", "migrations", "20260826000000_avatar_jobs_cancelled_status.sql"),
  "utf8",
);
const ADMIN = readFileSync(join(ROOT, "js", "admin.js"), "utf8");

// The three constraints that mention a status by name. Each one has to be rewritten, because each
// one would otherwise reject or misfile the new value.
const TOUCHED = [
  "generation_jobs_status_valid",
  "generation_jobs_completed_at_consistency",
  "generation_jobs_claimed_at_consistency",
];

test("every status-bearing constraint is dropped AND recreated", () => {
  for (const name of TOUCHED) {
    const drops = SQL.match(new RegExp(`drop constraint ${name}\\b`, "g")) ?? [];
    const adds = SQL.match(new RegExp(`add constraint ${name}\\b`, "g")) ?? [];
    assert.equal(drops.length, 1, `${name}: expected exactly one drop, got ${drops.length}`);
    assert.equal(adds.length, 1, `${name}: expected exactly one add, got ${adds.length}`);
    // a drop with no matching add would leave the table permanently unguarded
    assert.ok(SQL.indexOf(`drop constraint ${name}`) < SQL.indexOf(`add constraint ${name}`),
      `${name}: recreated before it is dropped`);
  }
});

test("each recreated constraint actually names 'cancelled'", () => {
  for (const name of TOUCHED) {
    const from = SQL.indexOf(`add constraint ${name}`);
    const body = SQL.slice(from, SQL.indexOf(";", from));
    assert.match(body, /'cancelled'/, `${name}: rewritten without mentioning the new value`);
  }
});

test("the original six statuses survive the allowlist rewrite", () => {
  const from = SQL.indexOf("add constraint generation_jobs_status_valid");
  const body = SQL.slice(from, SQL.indexOf(";", from));
  for (const s of ["pending", "generating", "pending_manual_review",
                   "complete", "failed_retryable", "failed_permanent"]) {
    assert.match(body, new RegExp(`'${s}'`), `allowlist lost the existing status '${s}'`);
  }
});

test("cancelled is terminal: it requires a completed_at", () => {
  const from = SQL.indexOf("add constraint generation_jobs_completed_at_consistency");
  const body = SQL.slice(from, SQL.indexOf(";", from));
  // it must sit with the other terminal states, not with the in-flight ones
  assert.match(body, /in \('complete', 'failed_permanent', 'cancelled'\) and completed_at is not null/);
  assert.match(body, /not in \('complete', 'failed_permanent', 'cancelled'\) and completed_at is null/);
});

test("cancelled does NOT require a claimed_at — a queued job can be cancelled unclaimed", () => {
  const from = SQL.indexOf("add constraint generation_jobs_claimed_at_consistency");
  const body = SQL.slice(from, SQL.indexOf(";", from));
  assert.match(body, /\(status = 'cancelled'\)/,
    "cancelled is not exempted, so cancelling a never-claimed job would need a fabricated claimed_at");
  assert.match(body, /status = 'pending' and claimed_at is null/, "the pending rule was dropped");
});

test("the backlog update preserves the prior status before overwriting it", () => {
  assert.match(SQL, /'cancelled_from',\s*status/,
    "the prior status is overwritten without being captured, and it exists nowhere else");
  assert.match(SQL, /failure_details\s*=\s*coalesce\(failure_details, '\{\}'::jsonb\)/,
    "failure_details is replaced rather than merged, discarding what was already there");
});

test("a row that already has a completed_at keeps its original", () => {
  assert.match(SQL, /completed_at\s*=\s*coalesce\(completed_at, now\(\)\)/,
    "an existing completion timestamp is overwritten with the migration's clock");
});

test("the migration deletes nothing and is atomic", () => {
  assert.ok(!/\bdelete\s+from\b/i.test(SQL), "the migration contains a DELETE");
  assert.ok(!/\btruncate\b/i.test(SQL), "the migration contains a TRUNCATE");
  assert.ok(!/\bdrop\s+table\b/i.test(SQL), "the migration drops a table");
  assert.match(SQL, /^begin;/m, "not wrapped in a transaction");
  assert.match(SQL, /^commit;/m, "not committed");
});

test("only the abandoned statuses are closed — complete is never touched", () => {
  const from = SQL.indexOf("update public.avatar_generation_jobs");
  // to commit, not to the first ";" — the statement carries comments that contain one
  const body = SQL.slice(from, SQL.indexOf("commit;", from));
  assert.match(body, /where status in \('failed_permanent', 'failed_retryable', 'pending'\)/);
  assert.ok(!/'complete'/.test(body), "the update's predicate reaches completed jobs");
  assert.ok(!/'generating'/.test(body), "the update would close a job that is mid-flight");
});

test("the admin UI renders 'cancelled' as a known status, not raw grey text", () => {
  const from = ADMIN.indexOf("function statusBadge(");
  const body = ADMIN.slice(from, ADMIN.indexOf("}", ADMIN.indexOf("};", from)));
  assert.match(body, /cancelled:\s*\["Cancelled"/, "cancelled falls through to the unknown-status default");
});

test("a cancelled job offers no action button", () => {
  // the buttons are gated on exact statuses; cancelled must not be one of them
  const from = ADMIN.indexOf("Action buttons:");
  const body = ADMIN.slice(from, from + 800);
  assert.match(body, /row\.status === "failed_retryable"/);
  assert.match(body, /row\.status === "pending"/);
  assert.ok(!/row\.status === "cancelled"/.test(body),
    "cancelled rows offer an action, but the job is closed and must not be re-run");
});
