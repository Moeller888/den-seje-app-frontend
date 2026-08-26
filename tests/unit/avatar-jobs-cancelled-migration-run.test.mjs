// RUNTIME proof for migration 20260826000000. The sibling file
// avatar-jobs-cancelled-status.test.mjs asserts what the SQL SAYS; this one EXECUTES it against a
// real PostgreSQL and asserts what it DOES.
//
// HOW, GIVEN THERE IS NO DOCKER: PGlite is PostgreSQL compiled to WebAssembly and runs in-process
// as an ordinary npm dependency — no daemon, no system PostgreSQL, no container, no network, and
// nothing outside this repository. Each scenario gets its own throwaway database.
//
// HONEST LIMITS, because this is evidence and evidence has edges:
//   - PGlite here is PostgreSQL 18.x; production is 17.6. Everything the migration uses (plpgsql,
//     DO, GET DIAGNOSTICS, FILTER, jsonb, temp tables, ALTER ... DROP/ADD CONSTRAINT) is long
//     stable across both, but it is not the same build.
//   - The fixture replicates the table and all 24 CHECK constraints, not RLS, grants, pg_cron, the
//     events FK or the copyright trigger. The migration cannot exercise those: it writes no
//     events, deletes nothing, and never touches copyright_review_result.
//   - Passing here is not permission to deploy. It proves the SQL behaves as claimed on a faithful
//     replica of the schema; the production run is still outstanding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SCHEMA = readFileSync(join(ROOT, "tests", "fixtures", "avatar-generation-jobs.schema.sql"), "utf8");
const MIGRATION = readFileSync(
  join(ROOT, "supabase", "migrations", "20260826000000_avatar_jobs_cancelled_status.sql"), "utf8");

const CUTOFF = "2026-06-01T00:00:00Z";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// A row that satisfies every NOT NULL and every "not empty" constraint, so each scenario only has
// to say what makes its row interesting.
function row(n, over = {}) {
  return {
    id: uuid(n),
    target_asset_id: `hat_gen_${n}`,
    slot: "hat",
    generation_prompt: "p",
    policy_prompt: "pol",
    model_provider: "prov",
    model_version: "v1",
    initiated_by: "runner",
    initiated_at: "2026-05-08T12:00:00Z",
    status: "failed_retryable",
    claimed_at: "2026-05-08T12:00:01Z",
    completed_at: null,
    generated_files: null,
    resulting_asset_id: null,
    copyright_review_result: null,
    copyright_reviewed_by: null,
    copyright_reviewed_at: null,
    manual_review_required: false,
    generated_glb_bucket: null,
    generated_glb_path: null,
    failure_details: null,
    ...over,
  };
}

const COLS = ["id", "target_asset_id", "slot", "generation_prompt", "policy_prompt",
  "model_provider", "model_version", "initiated_by", "initiated_at", "status", "claimed_at",
  "completed_at", "generated_files", "resulting_asset_id", "copyright_review_result",
  "copyright_reviewed_by", "copyright_reviewed_at", "manual_review_required",
  "generated_glb_bucket", "generated_glb_path", "failure_details"];

async function seed(db, rows) {
  const params = COLS.map((_, i) => `$${i + 1}`).join(", ");
  for (const r of rows) {
    await db.query(`insert into public.avatar_generation_jobs (${COLS.join(", ")}) values (${params})`,
      COLS.map((c) => r[c]));
  }
}

// The real distribution, to the row: 21 failed_permanent, 22 failed_retryable, 2 pending, of which
// 19 carry generated_files (2 + 16 + 1, exactly as production does).
function backlog() {
  const out = [];
  const files = JSON.stringify({
    glb_bucket: "avatar-generation-staging", glb_path: "x/generated.glb",
    thumbnail_bucket: "avatar-generation-staging", thumbnail_path: "x/thumbnail.png",
  });
  for (let i = 0; i < 21; i++) {
    out.push(row(100 + i, {
      status: "failed_permanent",
      completed_at: "2026-05-08T13:00:00Z",       // failed_permanent must carry one
      generated_files: i < 2 ? files : null,
    }));
  }
  for (let i = 0; i < 22; i++) {
    out.push(row(200 + i, { status: "failed_retryable", generated_files: i < 16 ? files : null }));
  }
  for (let i = 0; i < 2; i++) {
    out.push(row(300 + i, {
      status: "pending", claimed_at: null,        // pending must NOT carry one
      generated_files: i < 1 ? files : null,
    }));
  }
  return out;
}

// Rows that must survive untouched. Each one is a way the backfill could over-reach.
function decoys() {
  return [
    row(900, { status: "failed_retryable", initiated_at: "2026-08-26T09:00:00Z" }), // after cutoff
    row(901, { status: "pending", claimed_at: null, initiated_at: "2026-08-26T09:00:00Z" }),
    row(902, { status: "complete", completed_at: "2026-05-01T10:00:00Z", resulting_asset_id: "hat_gen_902" }),
    row(903, { status: "generating" }),
    row(904, { status: "failed_retryable", generated_glb_bucket: "b", generated_glb_path: "p" }),
  ];
}

async function fresh(rows) {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await seed(db, rows);
  return db;
}

async function runMigration(db) {
  try {
    await db.exec(MIGRATION);
    return { ok: true, error: null };
  } catch (err) {
    // The migration opened its own transaction; make sure this connection is usable again.
    try { await db.exec("rollback;"); } catch { /* already rolled back */ }
    return { ok: false, error: String(err.message ?? err) };
  }
}

const count = async (db, where) =>
  Number((await db.query(`select count(*)::int as c from public.avatar_generation_jobs where ${where}`)).rows[0].c);

// ── The happy path ───────────────────────────────────────────────────────────────────────────

test("RUNTIME: the migration applies cleanly and cancels exactly the 45 backlog rows", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  const res = await runMigration(db);
  assert.equal(res.error, null, `migration failed: ${res.error}`);

  assert.equal(await count(db, "status = 'cancelled'"), 45, "wrong number of rows cancelled");
  assert.equal(await count(db, "failure_details ? 'cancelled_from'"), 45, "cancel trace missing");
  await db.close();
});

test("RUNTIME: every decoy survives untouched", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  assert.equal((await runMigration(db)).error, null);

  // The two post-cutoff rows are the ones the sweeper could realistically create mid-deploy.
  for (const [id, expected, why] of [
    [900, "failed_retryable", "a job that failed AFTER the cutoff was swept up"],
    [901, "pending", "a job queued AFTER the cutoff was swept up"],
    [902, "complete", "a completed job was cancelled"],
    [903, "generating", "a job mid-flight was cancelled"],
    [904, "failed_retryable", "a job with generated shadow files was cancelled"],
  ]) {
    const r = await db.query("select status from public.avatar_generation_jobs where id = $1", [uuid(id)]);
    assert.equal(r.rows[0].status, expected, why);
  }
  assert.equal(await count(db, "failure_details ? 'cancelled_from'"), 45, "a decoy got a cancel trace");
  await db.close();
});

test("RUNTIME: the prior status is preserved per row, not flattened", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  assert.equal((await runMigration(db)).error, null);

  const r = await db.query(`select failure_details->>'cancelled_from' as f, count(*)::int as c
                              from public.avatar_generation_jobs
                             where status = 'cancelled' group by 1 order by 1`);
  assert.deepEqual(r.rows.map((x) => [x.f, x.c]),
    [["failed_permanent", 21], ["failed_retryable", 22], ["pending", 2]],
    "the failed_permanent/failed_retryable distinction did not survive");
  await db.close();
});

test("RUNTIME: an existing completed_at is kept; a missing one is filled", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  assert.equal((await runMigration(db)).error, null);

  // the 21 that already had 2026-05-08T13:00:00Z must still have exactly that
  assert.equal(await count(db,
    `status = 'cancelled' and failure_details->>'cancelled_from' = 'failed_permanent'
     and completed_at = timestamptz '2026-05-08T13:00:00Z'`), 21, "an original timestamp was overwritten");
  // and every cancelled row now has one, because cancelled is terminal
  assert.equal(await count(db, "status = 'cancelled' and completed_at is null"), 0);
  await db.close();
});

test("RUNTIME: the two never-claimed jobs stay never-claimed — no fabricated claim", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  assert.equal((await runMigration(db)).error, null);

  assert.equal(await count(db,
    "status = 'cancelled' and failure_details->>'cancelled_from' = 'pending' and claimed_at is null"), 2,
    "a claimed_at was invented for a job no worker ever picked up");
  await db.close();
});

test("RUNTIME: nothing is deleted", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  const before = await count(db, "true");
  assert.equal((await runMigration(db)).error, null);
  assert.equal(await count(db, "true"), before, "the migration removed rows");
  await db.close();
});

// ── The constraints still bite afterwards ────────────────────────────────────────────────────

test("RUNTIME: after the rewrite the constraints still reject what they always rejected", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  assert.equal((await runMigration(db)).error, null);

  const rejects = async (r, why) => {
    await assert.rejects(() => seed(db, [r]), why);
  };
  await rejects(row(1000, { status: "bogus" }), "an unknown status was accepted");
  await rejects(row(1001, { status: "generating", claimed_at: null }), "generating without claimed_at accepted");
  await rejects(row(1002, { status: "complete", completed_at: null, resulting_asset_id: "hat_gen_1002" }),
    "complete without completed_at accepted");
  await rejects(row(1003, { status: "pending", claimed_at: "2026-05-08T12:00:01Z" }),
    "pending WITH claimed_at accepted");
  // and the new value obeys its own rules
  await rejects(row(1004, { status: "cancelled", completed_at: null }),
    "cancelled without completed_at accepted — it is terminal");
  await db.close();
});

test("RUNTIME: a cancelled job may legitimately have no claimed_at", async () => {
  const db = await fresh([...backlog(), ...decoys()]);
  assert.equal((await runMigration(db)).error, null);
  // the exemption is the whole point: cancelling a queued job must not require inventing a claim
  await seed(db, [row(1100, {
    status: "cancelled", claimed_at: null, completed_at: "2026-08-26T10:00:00Z",
  })]);
  assert.equal(await count(db, `id = '${uuid(1100)}' and claimed_at is null`), 1);
  await db.close();
});

// ── Fail-closed: the preconditions actually abort, and abort EVERYTHING ───────────────────────

async function expectAbort(rows, code) {
  const db = await fresh(rows);
  const res = await runMigration(db);
  assert.equal(res.ok, false, `the migration committed when it should have aborted (${code})`);
  assert.match(res.error, new RegExp(code), `aborted for the wrong reason: ${res.error}`);

  // The rollback must take the constraint rewrites with it, or the table is left in a half-migrated
  // state: a status allowlist that admits 'cancelled' with no backfill behind it.
  assert.equal(await count(db, "status = 'cancelled'"), 0, "rows were cancelled despite the abort");
  await assert.rejects(
    () => seed(db, [row(2000, { status: "cancelled", completed_at: "2026-08-26T10:00:00Z" })]),
    "the status allowlist still admits 'cancelled', so the constraint rewrite was NOT rolled back");
  await db.close();
}

test("RUNTIME: 44 targets aborts", async () => {
  await expectAbort([...backlog().slice(0, 44), ...decoys()], "D107_PRECONDITION_TOTAL");
});

test("RUNTIME: 46 targets aborts", async () => {
  await expectAbort([...backlog(), row(400, { status: "failed_retryable" }), ...decoys()],
    "D107_PRECONDITION_TOTAL");
});

test("RUNTIME: the right total with the WRONG distribution aborts", async () => {
  // 20 / 23 / 2 also sums to 45. A total-only check would wave this through.
  const rows = backlog();
  const swap = rows.findIndex((r) => r.status === "failed_permanent" && r.generated_files === null);
  rows[swap] = row(500, { status: "failed_retryable" });
  assert.equal(rows.length, 45);
  await expectAbort([...rows, ...decoys()], "D107_PRECONDITION_FAILED_PERMANENT");
});

test("RUNTIME: a changed staging-file count aborts", async () => {
  const rows = backlog();
  const plain = rows.findIndex((r) => r.status === "failed_retryable" && r.generated_files === null);
  rows[plain] = { ...rows[plain], generated_files: JSON.stringify({ glb_bucket: "b", glb_path: "p" }) };
  await expectAbort([...rows, ...decoys()], "D107_PRECONDITION_GENERATED_FILES");
});

test("RUNTIME: a hard_fail verdict in the target set aborts", async () => {
  const rows = backlog();
  const i = rows.findIndex((r) => r.status === "failed_permanent" && r.generated_files === null);
  rows[i] = { ...rows[i],
    copyright_review_result: "hard_fail",
    copyright_reviewed_by: "reviewer",
    copyright_reviewed_at: "2026-05-08T13:00:00Z" };
  await expectAbort([...rows, ...decoys()], "D107_PRECONDITION_HARD_FAIL");
});

test("RUNTIME: an empty table aborts rather than quietly doing nothing", async () => {
  await expectAbort(decoys(), "D107_PRECONDITION_TOTAL");
});
