// 'cancelled' is a new terminal state on avatar_generation_jobs. It only works if the migration,
// the Edge Function's type contract and the admin UI all agree about it, and if the backfill can
// only ever reach the 45 rows it was reviewed against.
//
// WHAT THESE TESTS ARE, STATED PLAINLY: source-level structural assertions on the migration text,
// types.ts, index.ts and admin.js. They prove the SHAPE of the change — that the target set is
// pinned and cutoff-bounded, that every precondition exists with a fail-closed comparison, that the
// UPDATE cannot address a row outside the pinned set, and that the three consumers know the value.
//
// WHAT THEY ARE NOT: a database run. Docker is not installed on this machine, so `supabase db reset`
// cannot start a local Postgres and the SQL has NOT been executed anywhere. Runtime verification of
// this migration is OUTSTANDING and is recorded as such in the PR and in D-107.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

const SQL = read("supabase", "migrations", "20260826000000_avatar_jobs_cancelled_status.sql");
const ADMIN = read("js", "admin.js");
const TYPES = read("supabase", "functions", "avatar-generation", "types.ts");
const INDEX = read("supabase", "functions", "avatar-generation", "index.ts");
const INGEST = read("supabase", "functions", "avatar-ingestion", "types.ts");

// The migration's three regions, sliced once so every assertion below talks about the right one.
const PIN = SQL.slice(
  SQL.indexOf("create temporary table _d107_targets"),
  SQL.indexOf("-- ── 5 & 6."),
);
const DO_BLOCK = SQL.slice(SQL.indexOf("do $$"), SQL.indexOf("$$;"));
const UPDATE = DO_BLOCK.slice(
  DO_BLOCK.indexOf("update public.avatar_generation_jobs"),
  DO_BLOCK.indexOf("get diagnostics"),
);

const TOUCHED = [
  "generation_jobs_status_valid",
  "generation_jobs_completed_at_consistency",
  "generation_jobs_claimed_at_consistency",
];

// ── The constraint rewrites ──────────────────────────────────────────────────────────────────

test("every status-bearing constraint is dropped AND recreated, in that order", () => {
  for (const name of TOUCHED) {
    const drops = SQL.match(new RegExp(`drop constraint ${name}\\b`, "g")) ?? [];
    const adds = SQL.match(new RegExp(`add constraint ${name}\\b`, "g")) ?? [];
    assert.equal(drops.length, 1, `${name}: expected exactly one drop, got ${drops.length}`);
    assert.equal(adds.length, 1, `${name}: expected exactly one add, got ${adds.length}`);
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

// ── The target set is pinned, bounded and unreachable from outside ───────────────────────────

test("the ALTERs come FIRST, so ACCESS EXCLUSIVE is held before the set is pinned", () => {
  // The lock the ALTERs take is what stops the pg_cron sweeper (active, every 5 min) mutating the
  // table between the snapshot and the UPDATE. If the pin ran first, that window would be real.
  const lastAlter = SQL.lastIndexOf("alter table public.avatar_generation_jobs");
  const pin = SQL.indexOf("create temporary table _d107_targets");
  assert.ok(lastAlter < pin, "the target set is pinned before the table is locked");
  assert.ok(pin < SQL.indexOf("do $$"), "the preconditions run before the set is pinned");
});

test("the cutoff is part of the predicate that selects the targets", () => {
  assert.match(PIN, /initiated_at\s+<\s+timestamptz '2026-06-01T00:00:00Z'/,
    "no cutoff, so the backfill means 'whatever is failed or pending at deploy time'");
});

test("the cutoff is strictly BEFORE the boundary, not on-or-after", () => {
  const m = PIN.match(/initiated_at\s+(<=|<|>=|>)\s+timestamptz/);
  assert.ok(m, "no comparison against the cutoff at all");
  assert.equal(m[1], "<", `cutoff comparison is '${m[1]}', which does not bound the set to the past`);
});

test("the pin narrows on every documented axis", () => {
  assert.match(PIN, /status in \('failed_permanent', 'failed_retryable', 'pending'\)/);
  assert.match(PIN, /resulting_asset_id\s+is null/);
  for (const col of ["generated_glb_bucket", "generated_glb_path",
                     "generated_thumbnail_bucket", "generated_thumbnail_path"]) {
    assert.match(PIN, new RegExp(`${col}\\s+is null`), `the pin ignores ${col}`);
  }
});

test("a job created AFTER the cutoff cannot be reached, because the UPDATE has no status predicate", () => {
  // This is the structural form of "new pending/failed jobs are not touched": the UPDATE addresses
  // ids from the pinned snapshot and nothing else. Even if a job fails mid-deploy, it is not in
  // _d107_targets and there is no clause that could pick it up.
  assert.match(UPDATE, /where j\.id in \(select t\.id from _d107_targets t\)/,
    "the UPDATE re-evaluates a predicate instead of using the pinned ids");
  assert.ok(!/where[\s\S]*status\s+in\s*\(/.test(UPDATE),
    "the UPDATE carries its own status predicate, which can match rows outside the snapshot");
  assert.ok(!/initiated_at/.test(UPDATE),
    "the UPDATE re-evaluates the cutoff, so the pin is not the single source of the target set");
});

test("the snapshot is temporary and cannot outlive the transaction", () => {
  assert.match(PIN, /create temporary table _d107_targets on commit drop/);
});

// ── Fail-closed preconditions ────────────────────────────────────────────────────────────────

// Each entry: the guard's variable, the exact expected value, and what it protects.
const GUARDS = [
  ["v_total", 45, "D107_PRECONDITION_TOTAL"],
  ["v_perm", 21, "D107_PRECONDITION_FAILED_PERMANENT"],
  ["v_retry", 22, "D107_PRECONDITION_FAILED_RETRYABLE"],
  ["v_pending", 2, "D107_PRECONDITION_PENDING"],
  ["v_hard_fail", 0, "D107_PRECONDITION_HARD_FAIL"],
  ["v_asset", 0, "D107_PRECONDITION_RESULTING_ASSET"],
  ["v_gen_files", 19, "D107_PRECONDITION_GENERATED_FILES"],
];

test("every precondition compares with <> and raises — so 44 and 46 both abort", () => {
  for (const [v, expected, code] of GUARDS) {
    const re = new RegExp(`if ${v} <> ${expected} then\\s*\\n\\s*raise exception '${code}`);
    assert.match(DO_BLOCK, re,
      `${v}: expected a fail-closed 'if ${v} <> ${expected} then raise exception ${code}'`);
  }
});

test("no precondition uses a one-sided comparison", () => {
  // '>= 45' would accept 46; '<= 45' would accept 44. Only inequality is fail-closed.
  const oneSided = DO_BLOCK.match(/if v_\w+ (<|>|<=|>=) \d+ then/g) ?? [];
  assert.deepEqual(oneSided, [],
    `one-sided precondition(s) found: ${oneSided.join(", ")}`);
});

test("the distribution is checked per status, not only in total", () => {
  // 21/22/2 summing to 45 is not enough: 20/23/2 also sums to 45 and is a different backlog.
  for (const v of ["v_perm", "v_retry", "v_pending"]) {
    assert.ok(DO_BLOCK.includes(`if ${v} <> `), `${v} is counted but never asserted`);
  }
  const counted = DO_BLOCK.slice(DO_BLOCK.indexOf("select count(*)"), DO_BLOCK.indexOf("into"));
  assert.match(counted, /filter \(where status = 'failed_permanent'\)/);
  assert.match(counted, /filter \(where status = 'failed_retryable'\)/);
  assert.match(counted, /filter \(where status = 'pending'\)/);
});

test("asset and file references are asserted, and the counts come from the pinned set", () => {
  const counted = DO_BLOCK.slice(DO_BLOCK.indexOf("select count(*)"), DO_BLOCK.indexOf("from _d107_targets"));
  assert.match(counted, /filter \(where copyright_review_result = 'hard_fail'\)/);
  assert.match(counted, /filter \(where resulting_asset_id is not null\)/);
  assert.match(counted, /filter \(where generated_files is not null\)/);
  assert.match(DO_BLOCK, /from _d107_targets/,
    "the preconditions count the live table instead of the pinned snapshot");
});

test("the actual affected row count is checked, and must be exactly 45", () => {
  assert.match(DO_BLOCK, /get diagnostics v_updated = row_count/,
    "the UPDATE's real effect is never measured");
  assert.match(DO_BLOCK, /if v_updated <> 45 then\s*\n\s*raise exception 'D107_ROWCOUNT/,
    "the affected row count is measured but not asserted");
  assert.ok(DO_BLOCK.indexOf("get diagnostics") < DO_BLOCK.indexOf("D107_ROWCOUNT"),
    "the row count is asserted before it is read");
});

test("the whole thing is one transaction, so any raise rolls back the constraints too", () => {
  assert.match(SQL, /^begin;/m, "not wrapped in a transaction");
  assert.match(SQL, /^commit;/m, "not committed");
  assert.ok(SQL.indexOf("begin;") < SQL.indexOf("alter table"),
    "the constraint rewrites sit outside the transaction");
  assert.ok(SQL.lastIndexOf("raise exception") < SQL.indexOf("commit;"),
    "a guard can fire after commit, which would not roll anything back");
});

test("the migration deletes nothing", () => {
  assert.ok(!/\bdelete\s+from\b/i.test(SQL), "the migration contains a DELETE");
  assert.ok(!/\btruncate\b/i.test(SQL), "the migration contains a TRUNCATE");
  assert.ok(!/\bdrop\s+table\b(?!\s+_d107)/i.test(SQL), "the migration drops a table");
});

test("history is preserved: the prior status is captured before it is overwritten", () => {
  assert.match(UPDATE, /'cancelled_from', j\.status/,
    "the prior status is overwritten without being captured, and it exists nowhere else");
  assert.match(UPDATE, /coalesce\(j\.failure_details, '\{\}'::jsonb\)\s*\n?\s*\|\|/,
    "failure_details is replaced rather than merged, discarding what was already there");
  assert.match(UPDATE, /completed_at\s*=\s*coalesce\(j\.completed_at, now\(\)\)/,
    "an existing completion timestamp is overwritten with the migration's clock");
});

// ── The application state machine agrees ─────────────────────────────────────────────────────

test("GenerationJobStatus contains cancelled", () => {
  const union = TYPES.slice(TYPES.indexOf("export type GenerationJobStatus"),
                            TYPES.indexOf(";", TYPES.indexOf("export type GenerationJobStatus")));
  assert.match(union, /\|\s*"cancelled"/, "a status legal in the database is unknown to the function");
  for (const s of ["pending", "generating", "pending_manual_review",
                   "complete", "failed_retryable", "failed_permanent"]) {
    assert.match(union, new RegExp(`"${s}"`), `the union lost the existing status '${s}'`);
  }
});

test("the union matches the database allowlist exactly, in both directions", () => {
  const union = TYPES.slice(TYPES.indexOf("export type GenerationJobStatus"),
                            TYPES.indexOf(";", TYPES.indexOf("export type GenerationJobStatus")));
  const fromTs = [...union.matchAll(/"([a-z_]+)"/g)].map(m => m[1]).sort();
  const from = SQL.indexOf("add constraint generation_jobs_status_valid");
  const fromSql = [...SQL.slice(from, SQL.indexOf(";", from)).matchAll(/'([a-z_]+)'/g)]
    .map(m => m[1]).sort();
  assert.deepEqual(fromTs, fromSql, "the type union and the CHECK allowlist have drifted apart");
});

test("GET /status can return a cancelled job without breaking its contract", () => {
  // The endpoint returns the row as-is inside a GenerationResponse; the row is typed
  // GenerationJobRecord, whose status field is GenerationJobStatus. With the union extended the
  // contract holds. What must NOT appear is a filter that silently drops unknown statuses.
  const ep = INDEX.slice(INDEX.indexOf('segments[0] === "status"'), INDEX.indexOf("// ── POST"));
  assert.match(ep, /const body: GenerationResponse/, "the status endpoint no longer returns the typed shape");
  assert.match(ep, /job,/, "the status endpoint stopped returning the job row");
  assert.ok(!/status\s*===\s*"/.test(ep), "the status endpoint branches on specific statuses");
  assert.match(TYPES, /status: GenerationJobStatus;/, "the record's status field is no longer the union");
});

test("nothing claims or retries a cancelled job", () => {
  // /retry demands failed_retryable; the claim RPC demands pending. Neither can see 'cancelled',
  // so no code change is needed — but if that guard were ever loosened, this fails.
  assert.match(INDEX, /job\.status !== "failed_retryable"/,
    "the retry endpoint no longer restricts which status may be retried");
});

test("the ingestion state machine is a DIFFERENT table and was not touched", () => {
  const union = INGEST.slice(INGEST.indexOf("export type IngestionJobStatus"),
                             INGEST.indexOf(";", INGEST.indexOf("export type IngestionJobStatus")));
  assert.ok(!/cancelled/.test(union),
    "'cancelled' was added to avatar_ingestion_jobs, which this migration does not alter");
});

// ── The admin UI ─────────────────────────────────────────────────────────────────────────────

test("the admin UI renders 'cancelled' as a known status, not raw grey text", () => {
  const from = ADMIN.indexOf("function statusBadge(");
  const body = ADMIN.slice(from, ADMIN.indexOf("}", ADMIN.indexOf("};", from)));
  assert.match(body, /cancelled:\s*\["Cancelled"/, "cancelled falls through to the unknown-status default");
});

test("a cancelled job offers no action button", () => {
  const from = ADMIN.indexOf("Action buttons:");
  const body = ADMIN.slice(from, from + 800);
  assert.match(body, /row\.status === "failed_retryable"/);
  assert.match(body, /row\.status === "pending"/);
  assert.ok(!/row\.status === "cancelled"/.test(body),
    "cancelled rows offer an action, but the job is closed and must not be re-run");
});
