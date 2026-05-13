// State-gate, zombie-worker, and concurrency tests for failGenerationJob.
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.fail.test.ts
//
// What is under test:
//   failGenerationJob guards its UPDATE with:
//     WHERE id = <jobId> AND status = 'generating' AND claimed_at = <token>
//
//   Only jobs in exactly the 'generating' state with a matching claimed_at can
//   be failed. Both guards must be present; this file proves each independently.
//   The function returns void — correctness is proven entirely by snapshot.
//
// Cleanup:
//   No pipeline functions are called — no avatar_generation_events rows are
//   created. Job rows can be deleted freely in finally.
//   The 'complete' sub-case creates permanent FK artifacts (validation run +
//   asset rows that cannot be deleted; see FAIL-STATE-1 complete case comment).
//
// Invariants under test:
//   FAIL-STATE-1: failGenerationJob cannot mutate a job whose status is not
//                 'generating'. For all cases with a real claimed_at, the ACTUAL
//                 token is passed — only the status guard is doing the work.
//
//   FAIL-ZOMBIE-1: A zombie worker holding a stale claimed_at token cannot fail
//                  a re-claimed job. Protection: WHERE claimed_at = <stale> does
//                  not match the DB row whose claimed_at has been updated.
//
//   FAIL-RACE-1:  Two concurrent failGenerationJob calls with the same valid
//                 token race to fail the same generating job. With the status
//                 guard in place, exactly one write lands; the second call finds
//                 status no longer 'generating' and matches 0 rows.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import {
  claimGenerationJob,
  deriveTargetAssetId,
  failGenerationJob,
} from "./database.ts";
import type { SupabaseClient } from "./supabase.ts";

// ── Shared helpers ────────────────────────────────────────────────────────────

async function readJobRow(
  supabase: SupabaseClient,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`Test DB read failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

// Compares every column in two snapshots. Keys are derived dynamically so new
// schema columns are covered automatically. No exemptions — nothing may change.
function assertNoMutation(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  label: string,
): void {
  const allFields = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  for (const field of allFields) {
    assertEquals(
      after?.[field],
      before?.[field],
      `[${label}] Field '${field}' must not be mutated`,
    );
  }
}

// Inserts a minimal avatar_assets row. Required as FK for the 'complete' case.
async function insertMinimalAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("avatar_assets").insert({
    asset_id: assetId,
    slot: "hat",
    display_name: `Test asset ${assetId.slice(0, 16)}`,
    current_status: "draft",
    production_enabled: false,
    storage_path: null,
    metadata: {
      identity: { asset_id: assetId, slot: "hat", display_name: "Test asset" },
      technical: {},
      deployment: { current_status: "draft", production_enabled: false },
      audit: { created_by: "test-fail-runner", created_at: now },
    },
    created_by: "test-fail-runner",
    last_modified_by: "test-fail-runner",
  });
  if (error) throw new Error(`Test setup (INSERT avatar_assets) failed: ${error.message}`);
}

// Inserts a minimal validation run row. Required as FK for the 'complete' case.
// PERMANENT ARTIFACT: prevent_validation_run_modification trigger blocks DELETE.
async function insertMinimalValidationRun(
  supabase: SupabaseClient,
  runId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_asset_validation_runs").insert({
    id: runId,
    asset_id: assetId,
    triggered_by: "test-fail-runner",
    payload: { test: true },
    response: { valid: true, errors: [], warnings: [], manual_review_flags: [] },
    valid: true,
    error_count: 0,
    warning_count: 0,
    manual_review_count: 0,
  });
  if (error) throw new Error(`Test setup (INSERT validation_run) failed: ${error.message}`);
}

// ── FAIL-STATE-1: status gate — only 'generating' jobs may be failed ──────────
//
// Design:
//   For 'pending': claimed_at = NULL in the DB; a fake token is passed.
//     Both the status guard and the NULL equality gate independently block the
//     write. This sub-case proves the baseline (pre-existing) NULL protection.
//
//   For 'failed_retryable', 'failed_permanent', 'complete':
//     claimed_at IS set in the DB and the ACTUAL token is passed to
//     failGenerationJob. The claimed_at guard WOULD match — only the status guard
//     blocks the write. These three sub-cases specifically isolate and prove the
//     WHERE status='generating' guard introduced to fix the FAIL-RACE-1 gap.
//
// This test FAILS if:
//   - The status guard is absent or wrong (WHERE clause uses != or IS NULL)
//   - failGenerationJob mutates any column on a non-generating job
//   - A trigger fires and writes to the row on any UPDATE attempt

Deno.test(
  "FAIL-STATE-1: failGenerationJob cannot mutate a job whose status is not 'generating'",
  async (t) => {
    const supabase = getServiceClient();
    const now = new Date().toISOString();

    // ── status = 'pending' ────────────────────────────────────────────────────
    // claimed_at = NULL. Fake token passed. Both the status guard and the NULL
    // equality gate block the write independently.
    await t.step("status='pending' — claimed_at=NULL and status guard both block", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "FAIL-STATE-1 — pending",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-fail-runner",
          status: "pending",
          retry_count: 0,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        assertEquals(before?.status, "pending", "PRECONDITION: status must be 'pending'");
        assertEquals(before?.claimed_at, null, "PRECONDITION: claimed_at must be NULL");

        // Fake token — claimed_at in DB is NULL so it cannot match any string.
        await failGenerationJob(supabase, jobId, "fake-token", true, "stage", "reason", null);

        const after = await readJobRow(supabase, jobId);
        assertNoMutation(before, after, "pending");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── status = 'failed_retryable' ───────────────────────────────────────────
    // claimed_at IS set. The ACTUAL token is passed — the claimed_at guard would
    // match. Only the status guard blocks the write here.
    await t.step("status='failed_retryable' — status guard blocks despite matching claimed_at", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const claimedAt = now;
      try {
        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "FAIL-STATE-1 — failed_retryable",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-fail-runner",
          status: "failed_retryable",
          claimed_at: claimedAt,
          failure_stage: "previous-stage",
          failure_reason: "Previous failure — must not be overwritten",
          retry_count: 1,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        // Read canonical claimed_at — PostgreSQL may normalise 'Z' to '+00:00'.
        const before = await readJobRow(supabase, jobId);
        assertEquals(before?.status, "failed_retryable", "PRECONDITION: status must be 'failed_retryable'");
        const canonicalClaimedAt = before?.claimed_at as string;

        // Pass the ACTUAL claimed_at. If the status guard is absent, this call
        // would write status='failed_retryable' (again) with new failure fields.
        await failGenerationJob(supabase, jobId, canonicalClaimedAt, true, "new-stage", "must-not-land", null);

        const after = await readJobRow(supabase, jobId);
        assertNoMutation(before, after, "failed_retryable");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── status = 'failed_permanent' ───────────────────────────────────────────
    // claimed_at IS set. Actual token passed. Only the status guard blocks.
    await t.step("status='failed_permanent' — status guard blocks despite matching claimed_at", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const claimedAt = now;
      try {
        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "FAIL-STATE-1 — failed_permanent",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-fail-runner",
          status: "failed_permanent",
          claimed_at: claimedAt,
          completed_at: now,
          failure_stage: "previous-stage",
          failure_reason: "Previous permanent failure — must not be overwritten",
          retry_count: 3,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        assertEquals(before?.status, "failed_permanent", "PRECONDITION: status must be 'failed_permanent'");
        const canonicalClaimedAt = before?.claimed_at as string;

        await failGenerationJob(supabase, jobId, canonicalClaimedAt, false, "new-stage", "must-not-land", null);

        const after = await readJobRow(supabase, jobId);
        assertNoMutation(before, after, "failed_permanent");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── status = 'complete' ───────────────────────────────────────────────────
    // Terminal state. Requires FK rows (resulting_asset_id → avatar_assets,
    // onboarding_validation_run_id → avatar_asset_validation_runs).
    // claimed_at IS set; actual token passed. Only the status guard blocks.
    //
    // Cleanup: validation run and asset become permanent artifacts because
    // prevent_validation_run_modification blocks DELETE on the run, and
    // ON DELETE RESTRICT on avatar_assets blocks deletion while the run exists.
    await t.step("status='complete' — status guard blocks despite matching claimed_at", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const runId = crypto.randomUUID();
      const claimedAt = now;
      try {
        await insertMinimalAsset(supabase, targetAssetId);
        await insertMinimalValidationRun(supabase, runId, targetAssetId);

        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "FAIL-STATE-1 — complete",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-fail-runner",
          status: "complete",
          claimed_at: claimedAt,
          completed_at: now,
          resulting_asset_id: targetAssetId,
          onboarding_validation_run_id: runId,
          retry_count: 0,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        assertEquals(before?.status, "complete", "PRECONDITION: status must be 'complete'");
        const canonicalClaimedAt = before?.claimed_at as string;

        await failGenerationJob(supabase, jobId, canonicalClaimedAt, true, "new-stage", "must-not-land", null);

        const after = await readJobRow(supabase, jobId);
        assertNoMutation(before, after, "complete");
      } finally {
        // Job row has no child events — safe to delete directly.
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
        // Validation run and asset are permanent artifacts — swallow FK errors.
        await supabase.from("avatar_asset_validation_runs").delete().eq("id", runId);
        await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
      }
    });
  },
);

// ── FAIL-ZOMBIE-1: Zombie worker cannot fail a re-claimed job ─────────────────
// Proves: a worker holding a stale claimed_at token (Token A) cannot call
//         failGenerationJob after another worker has taken over (Token B is now
//         in the DB). WHERE claimed_at = A does not match when DB holds B.
//
// Scenario:
//   Worker A claims → claimed_at = A, status = 'generating'
//   Worker B takes over → claimed_at = B (direct UPDATE simulating recovery)
//   Worker A (zombie) calls failGenerationJob with Token A
//   → WHERE status='generating' AND claimed_at=A: A doesn't match B → 0 rows
//   → All columns unchanged
//
// Two sub-cases cover both code paths (retryable=true and retryable=false).
//
// This test FAILS if:
//   - failGenerationJob drops the claimed_at guard
//   - A trigger fires and mutates a column on any UPDATE attempt

Deno.test(
  "FAIL-ZOMBIE-1: zombie worker with stale claimed_at cannot fail a re-claimed job",
  async (t) => {
    const supabase = getServiceClient();

    async function setupGeneratingJob(jobId: string, targetAssetId: string): Promise<string> {
      const { error } = await supabase.from("avatar_generation_jobs").insert({
        id: jobId,
        target_asset_id: targetAssetId,
        slot: "hat",
        generation_prompt: "FAIL-ZOMBIE-1 test",
        policy_prompt: "Test policy",
        model_provider: "test-provider",
        model_version: "test-v1",
        initiated_by: "test-fail-runner",
        status: "pending",
        retry_count: 0,
        manual_review_required: false,
      });
      if (error) throw new Error(`Setup failed: ${error.message}`);

      const claimed = await claimGenerationJob(supabase, jobId);
      if (claimed === null) throw new Error("Test setup: claimGenerationJob must succeed");

      const postClaimRow = await readJobRow(supabase, jobId);
      assertEquals(postClaimRow?.status, "generating", "PRECONDITION: must be 'generating'");
      return postClaimRow?.claimed_at as string;
    }

    // ── retryable = true ──────────────────────────────────────────────────────
    await t.step("retryable=true — zombie retryable fail must not mutate any column", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const tokenA = await setupGeneratingJob(jobId, targetAssetId);

        // Simulate Worker B takeover: update claimed_at to a new token.
        const tokenB = new Date(Date.now() + 60_000).toISOString();
        const { error } = await supabase
          .from("avatar_generation_jobs")
          .update({ claimed_at: tokenB })
          .eq("id", jobId);
        if (error) throw new Error(`Takeover setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        assertNotEquals(before?.claimed_at, tokenA, "PRECONDITION: Token B must differ from Token A");

        // Zombie: stale Token A. WHERE claimed_at=A fails (DB has B) → 0 rows.
        const zombieResult1 = await failGenerationJob(supabase, jobId, tokenA, true, "zombie-stage", "must-not-land", { zombie: true });
        assertEquals(zombieResult1.success, false, "zombie must be rejected: success must be false");

        const after = await readJobRow(supabase, jobId);
        assertNoMutation(before, after, "FAIL-ZOMBIE-1 retryable=true");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── retryable = false ─────────────────────────────────────────────────────
    // This code path additionally builds completed_at into the UPDATE payload.
    // It must be fully blocked when the claimed_at guard fails.
    await t.step("retryable=false — zombie permanent fail must not mutate any column", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const tokenA = await setupGeneratingJob(jobId, targetAssetId);

        const tokenB = new Date(Date.now() + 60_000).toISOString();
        const { error } = await supabase
          .from("avatar_generation_jobs")
          .update({ claimed_at: tokenB })
          .eq("id", jobId);
        if (error) throw new Error(`Takeover setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        assertNotEquals(before?.claimed_at, tokenA, "PRECONDITION: Token B must differ from Token A");

        const zombieResult2 = await failGenerationJob(supabase, jobId, tokenA, false, "zombie-stage", "must-not-land", null);
        assertEquals(zombieResult2.success, false, "zombie must be rejected: success must be false");

        const after = await readJobRow(supabase, jobId);
        assertNoMutation(before, after, "FAIL-ZOMBIE-1 retryable=false");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });
  },
);

// ── FAIL-RACE-1: Concurrent failGenerationJob calls with the same token ───────
//
// What the test proves:
//   With the status guard in place, exactly one concurrent call lands.
//   After the first write sets status='failed_*', the second call's
//   WHERE status='generating' predicate matches 0 rows — silent no-op.
//   The test verifies internal consistency: all failure fields agree on one
//   writer, and no split-brain (fields from different concurrent calls) exists.
//
// How the test detects the winning writer:
//   Each call is tagged with a distinct failure_reason ("race-writer-1" vs
//   "race-writer-2"). After the race, failure_reason, failure_stage, and
//   failure_details.writer must all agree on the same writer — a split-brain
//   (reason from writer-1, details from writer-2) would fail the assertion.
//   PostgreSQL row-level locking prevents split-brain; this test verifies it.
//
// This test FAILS if:
//   - Neither call mutates the row (status still 'generating')
//   - failure_reason is null or unexpected
//   - failure fields are internally inconsistent (different writers' data mixed)
//   - claimed_at was mutated (failGenerationJob must never change it)

Deno.test(
  "FAIL-RACE-1: concurrent failGenerationJob calls with same token — exactly one write lands",
  async (t) => {
    const supabase = getServiceClient();

    async function claimFreshJob(jobId: string, targetAssetId: string): Promise<string> {
      const { error } = await supabase.from("avatar_generation_jobs").insert({
        id: jobId,
        target_asset_id: targetAssetId,
        slot: "hat",
        generation_prompt: "FAIL-RACE-1 test",
        policy_prompt: "Test policy",
        model_provider: "test-provider",
        model_version: "test-v1",
        initiated_by: "test-fail-runner",
        status: "pending",
        retry_count: 0,
        manual_review_required: false,
      });
      if (error) throw new Error(`Setup failed: ${error.message}`);

      const claimed = await claimGenerationJob(supabase, jobId);
      if (claimed === null) throw new Error("Test setup: claimGenerationJob must succeed");

      const row = await readJobRow(supabase, jobId);
      assertEquals(row?.status, "generating", "PRECONDITION: must be 'generating'");
      return row?.claimed_at as string;
    }

    // ── retryable = true ──────────────────────────────────────────────────────
    await t.step("retryable=true — exactly one write lands; DB state is coherent", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const tokenA = await claimFreshJob(jobId, targetAssetId);

        const [r1, r2] = await Promise.all([
          failGenerationJob(supabase, jobId, tokenA, true, "race-stage", "race-writer-1", { writer: 1 }),
          failGenerationJob(supabase, jobId, tokenA, true, "race-stage", "race-writer-2", { writer: 2 }),
        ]);

        // Exactly one call must have won the race.
        assert(
          (r1.success && !r2.success) || (!r1.success && r2.success),
          `exactly one call must return success=true; got r1=${r1.success} r2=${r2.success}`,
        );

        const finalRow = await readJobRow(supabase, jobId);

        assertEquals(finalRow?.status, "failed_retryable", "status must be 'failed_retryable'");

        const reason = finalRow?.failure_reason as string;
        assert(
          reason === "race-writer-1" || reason === "race-writer-2",
          `failure_reason must be one of the two writer tags, got: ${JSON.stringify(reason)}`,
        );

        const winnerNumber = reason === "race-writer-1" ? 1 : 2;
        assertEquals(finalRow?.failure_stage, "race-stage", "failure_stage must match");
        assertEquals(
          (finalRow?.failure_details as Record<string, unknown>)?.writer,
          winnerNumber,
          `failure_details.writer must match failure_reason winner (${winnerNumber})`,
        );
        assertEquals(finalRow?.claimed_at, tokenA, "claimed_at must remain Token A");
        assertEquals(finalRow?.completed_at, null, "completed_at must be null for retryable=true");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── retryable = false ─────────────────────────────────────────────────────
    await t.step("retryable=false — exactly one write lands; completed_at is set", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const tokenA = await claimFreshJob(jobId, targetAssetId);

        const [r1, r2] = await Promise.all([
          failGenerationJob(supabase, jobId, tokenA, false, "race-stage", "race-writer-1", { writer: 1 }),
          failGenerationJob(supabase, jobId, tokenA, false, "race-stage", "race-writer-2", { writer: 2 }),
        ]);

        // Exactly one call must have won the race.
        assert(
          (r1.success && !r2.success) || (!r1.success && r2.success),
          `exactly one call must return success=true; got r1=${r1.success} r2=${r2.success}`,
        );

        const finalRow = await readJobRow(supabase, jobId);

        assertEquals(finalRow?.status, "failed_permanent", "status must be 'failed_permanent'");

        const reason = finalRow?.failure_reason as string;
        assert(
          reason === "race-writer-1" || reason === "race-writer-2",
          `failure_reason must be one of the two writer tags, got: ${JSON.stringify(reason)}`,
        );

        const winnerNumber = reason === "race-writer-1" ? 1 : 2;
        assertEquals(finalRow?.failure_stage, "race-stage", "failure_stage must match");
        assertEquals(
          (finalRow?.failure_details as Record<string, unknown>)?.writer,
          winnerNumber,
          `failure_details.writer must match failure_reason winner (${winnerNumber})`,
        );
        assertEquals(finalRow?.claimed_at, tokenA, "claimed_at must remain Token A");
        assert(
          typeof finalRow?.completed_at === "string" &&
            !isNaN(Date.parse(finalRow.completed_at as string)),
          `completed_at must be a valid ISO timestamp for retryable=false, got: ${JSON.stringify(finalRow?.completed_at)}`,
        );
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });
  },
);
