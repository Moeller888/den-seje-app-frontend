// CAS (compare-and-set) concurrency tests for the avatar-generation pipeline.
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/pipeline.completion.test.ts
//
// What is under test:
//   The generation pipeline guards every mutating DB write with claimed_at.
//   completeGenerationJob and failGenerationJob both include .eq("claimed_at", claimedAt)
//   in their UPDATE WHERE clause. If a zombie worker holds a stale token — one that
//   no longer matches the DB row because the job was recovered and re-claimed —
//   its writes must match 0 rows and leave the DB state completely unchanged.
//
// Test strategy:
//   Rather than waiting for a real 10-minute timeout, we insert the job directly
//   in 'generating' state with claimed_at set 15 minutes in the past. This makes
//   recoverStuckJob succeed immediately (its threshold is 10 minutes). The full
//   lifecycle — stale claim → recovery → retry reset → re-claim — is exercised
//   against the real DB in a single isolated test.
//
// Cleanup:
//   COMPLETION-1: No pipeline functions are called (no events are written), so
//     the job row has no child avatar_generation_events rows and can be deleted
//     freely in finally.
//   COMPLETION-2: completeGenerationJob requires real FK rows (avatar_assets +
//     avatar_asset_validation_runs). The validation run is immutable
//     (prevent_validation_run_modification trigger blocks DELETE). The asset
//     cannot be deleted while the validation run exists (ON DELETE RESTRICT).
//     Both are PERMANENT TEST ARTIFACTS. Only the job row is cleaned up.
//
// Invariants under test:
//   COMPLETION-1: A stale claimed_at token cannot mutate job state.
//   COMPLETION-2: Parallel completion attempts are race-safe and idempotent —
//                 exactly one logical completion wins; DB state is consistent.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import {
  CasMismatchError,
  claimGenerationJob,
  completeGenerationJob,
  deriveTargetAssetId,
  failGenerationJob,
  recoverStuckJob,
  resetJobForRetry,
} from "./database.ts";
import type { SupabaseClient } from "./supabase.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

// Inserts a generation job directly in 'generating' state with a controlled
// claimed_at. The past timestamp makes the job immediately eligible for
// recoverStuckJob (threshold: 10 minutes). Direct INSERT avoids the /init →
// /process path so the test is isolated and does not create storage objects
// or pipeline events.
//
// DB CHECK constraints satisfied:
//   - claimed_at IS NOT NULL (required when status != 'pending') ✓
//   - completed_at IS NULL (required when status NOT IN ('complete','failed_permanent')) ✓
//   - manual_review_required = false, copyright_review_result NULL → consistency check NULL ✓
async function insertGeneratingJob(
  supabase: SupabaseClient,
  jobId: string,
  targetAssetId: string,
  claimedAt: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_generation_jobs").insert({
    id: jobId,
    target_asset_id: targetAssetId,
    slot: "hat",
    generation_prompt: "CAS concurrency test job",
    policy_prompt: "Test policy — no copyright infringement",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-cas-runner",
    status: "generating",
    claimed_at: claimedAt,
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT generating job) failed: ${error.message}`);
  }
}

// Direct SELECT — verifies DB state without trusting any function's return value.
async function readJobRow(
  supabase: SupabaseClient,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    throw new Error(`Test DB read (avatar_generation_jobs) failed: ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

// Inserts a generation job in 'pending' state (no claimed_at).
// Used by COMPLETION-2 which exercises the full claim → parallel completion lifecycle.
async function insertPendingJob(
  supabase: SupabaseClient,
  jobId: string,
  targetAssetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_generation_jobs").insert({
    id: jobId,
    target_asset_id: targetAssetId,
    slot: "hat",
    generation_prompt: "CAS parallel completion test job",
    policy_prompt: "Test policy — no copyright infringement",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-cas-runner",
    status: "pending",
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT pending job) failed: ${error.message}`);
  }
}

// Inserts a minimal avatar_assets row to satisfy the FK required by completeGenerationJob.
// Service role bypasses RLS; all NOT NULL columns are populated with test values.
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
      audit: { created_by: "test-cas-runner", created_at: now },
    },
    created_by: "test-cas-runner",
    last_modified_by: "test-cas-runner",
  });
  if (error) {
    throw new Error(`Test setup (INSERT avatar_assets) failed: ${error.message}`);
  }
}

// Inserts a minimal avatar_asset_validation_runs row to satisfy the second FK
// required by completeGenerationJob (onboarding_validation_run_id).
// PERMANENT ARTIFACT: prevent_validation_run_modification trigger blocks DELETE.
async function insertMinimalValidationRun(
  supabase: SupabaseClient,
  runId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_asset_validation_runs").insert({
    id: runId,
    asset_id: assetId,
    triggered_by: "test-cas-runner",
    payload: { test: true },
    response: { valid: true, errors: [], warnings: [], manual_review_flags: [] },
    valid: true,
    error_count: 0,
    warning_count: 0,
    manual_review_count: 0,
  });
  if (error) {
    throw new Error(`Test setup (INSERT validation_run) failed: ${error.message}`);
  }
}

// ── COMPLETION-1: Zombie worker cannot overwrite active job ───────────────────
// Proves: once a stale job is recovered and re-claimed by a new worker, the
//         zombie holding the old claimed_at cannot write anything — neither
//         completeGenerationJob nor failGenerationJob changes the DB row.
// This test FAILS if either CAS guard is absent or incorrectly implemented.

Deno.test(
  "COMPLETION-1: zombie worker holding stale claimed_at cannot overwrite active job",
  async () => {
    const supabase = getServiceClient();

    const jobId = crypto.randomUUID();
    const targetAssetId = deriveTargetAssetId("hat", jobId);

    // Worker A claimed this job 15 minutes ago — past the 10-minute stale threshold.
    // In a real system Worker A's Edge Function timed out; we simulate that by
    // inserting with a past timestamp instead of waiting for the real timeout.
    const claimedAtA = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    try {
      // ── Step 1: Insert job as if Worker A already claimed it ─────────────
      await insertGeneratingJob(supabase, jobId, targetAssetId, claimedAtA);

      // Read back immediately to get the canonical DB-normalized timestamp format.
      // PostgreSQL stores TIMESTAMPTZ and may return '+00:00' instead of 'Z'.
      // All string assertions use this canonical value; function calls use the
      // original claimedAtA (PostgreSQL compares timestamp values, not strings).
      const initialRow = await readJobRow(supabase, jobId);
      assertEquals(initialRow?.status, "generating", "PRECONDITION: job must start in 'generating'");
      const canonicalClaimedAtA = initialRow?.claimed_at as string;
      assert(
        typeof canonicalClaimedAtA === "string" && canonicalClaimedAtA.length > 0,
        "PRECONDITION: claimed_at must be set after insert",
      );

      // ── Step 2: Recovery — job is stale, recover it to failed_retryable ──
      // recoverStuckJob succeeds only when claimed_at < now() - 10 minutes.
      const recovered = await recoverStuckJob(supabase, jobId, claimedAtA);
      assertNotEquals(
        recovered,
        null,
        "recoverStuckJob must succeed: job has been stale for 15 minutes",
      );

      // ── Step 3: Reset for retry ───────────────────────────────────────────
      // Transitions status back to 'pending', clears claimed_at, increments retry_count.
      const reset = await resetJobForRetry(supabase, jobId, recovered!.retry_count);
      assertNotEquals(reset, null, "resetJobForRetry must succeed");
      assertEquals(reset!.status, "pending", "job must be 'pending' after retry reset");
      assertEquals(reset!.claimed_at, null, "claimed_at must be cleared after retry reset");

      // ── Step 4: Worker B claims the reset job ─────────────────────────────
      const workerBClaim = await claimGenerationJob(supabase, jobId);
      assertNotEquals(workerBClaim, null, "Worker B must successfully claim the pending job");
      const claimedAtB = workerBClaim!.claimed_at!;
      assert(
        typeof claimedAtB === "string" && claimedAtB.length > 0,
        "Worker B's claimed_at must be a non-empty string",
      );

      // ── Step 5: Confirm claimed_at tokens are distinct ────────────────────
      assertNotEquals(
        canonicalClaimedAtA,
        claimedAtB,
        "Worker A's and Worker B's claimed_at tokens must differ",
      );

      // Confirm Worker B's state directly from DB before zombie attacks.
      const beforeZombieRow = await readJobRow(supabase, jobId);
      assertEquals(
        beforeZombieRow?.status,
        "generating",
        "Job must be in 'generating' state before zombie attempt",
      );
      assertEquals(
        beforeZombieRow?.claimed_at,
        claimedAtB,
        "claimed_at must be Worker B's token before zombie attempt",
      );

      // ── Step 6: Zombie Worker A attempts to complete the job ──────────────
      // completeGenerationJob guards on status='generating' AND claimed_at=claimedAtA.
      // Since claimed_at is now claimedAtB, 0 rows match → the function throws.
      // We catch the throw — it is expected and must NOT abort the test.
      let zombieCompleteThrew = false;
      try {
        await completeGenerationJob(
          supabase,
          jobId,
          targetAssetId,
          crypto.randomUUID(),
        );
      } catch {
        zombieCompleteThrew = true;
      }
      assert(
        zombieCompleteThrew,
        "completeGenerationJob with stale claimed_at must throw (CAS mismatch detected)",
      );

      // ── Step 6b: Zombie Worker A attempts to fail the job ────────────────
      // failGenerationJob guards on claimed_at=claimedAtA. Since claimedAtA ≠ claimedAtB
      // in DB, 0 rows match → silent no-op. Must NOT throw.
      await failGenerationJob(
        supabase,
        jobId,
        claimedAtA,
        false,
        "zombie-stage",
        "Zombie worker — this must never be written to the DB",
        null,
      );

      // ── Step 7: Read final DB state — primary assertions ─────────────────
      // Both zombie calls must have produced zero DB changes.
      const finalRow = await readJobRow(supabase, jobId);

      // Core invariant: job must still reflect Worker B's active claim.
      assertEquals(
        finalRow?.claimed_at,
        claimedAtB,
        "claimed_at must still be Worker B's token — zombie must not have overwritten it",
      );
      assertEquals(
        finalRow?.status,
        "generating",
        "status must still be 'generating' — zombie must not have changed it",
      );

      // Ownership fields must be untouched.
      assertEquals(
        finalRow?.resulting_asset_id,
        null,
        "resulting_asset_id must be null — zombie completeGenerationJob must not have written it",
      );
      assertEquals(
        finalRow?.onboarding_validation_run_id,
        null,
        "onboarding_validation_run_id must be null — zombie must not have written it",
      );

      // Failure fields must be untouched by the zombie failGenerationJob call.
      assertEquals(
        finalRow?.failure_stage,
        null,
        "failure_stage must be null — zombie failGenerationJob must not have written it",
      );
      assertEquals(
        finalRow?.failure_reason,
        null,
        "failure_reason must be null — zombie failGenerationJob must not have written it",
      );
      assertEquals(
        finalRow?.failure_details,
        null,
        "failure_details must be null — zombie failGenerationJob must not have written it",
      );

      // completed_at must not have been written.
      assertEquals(
        finalRow?.completed_at,
        null,
        "completed_at must be null — zombie must not have completed the job",
      );

      // Explicitly confirm Worker A's stale token is absent.
      assertNotEquals(
        finalRow?.claimed_at,
        canonicalClaimedAtA,
        "claimed_at must not have reverted to Worker A's stale token",
      );
    } finally {
      // No pipeline was run, so no avatar_generation_events rows were created.
      // The job row can be deleted directly without FK interference.
      await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
    }
  },
);

// ── COMPLETION-2: Parallel completion attempts are race-safe ──────────────────
// Proves: two concurrent completeGenerationJob calls with the same claimed_at
//         cannot both write — PostgreSQL row-level locking ensures exactly one
//         UPDATE matches WHERE status='generating' AND claimed_at=X. The second
//         caller finds status='complete' → 0 rows → throws. The winning write is
//         stable: a subsequent SELECT confirms consistent DB state.
// This test FAILS if completeGenerationJob is missing either CAS guard (status or
// claimed_at), since both callers would then write and the race would be silent.

Deno.test(
  "COMPLETION-2: parallel completion attempts are race-safe — exactly one wins",
  async () => {
    const supabase = getServiceClient();

    const jobId = crypto.randomUUID();
    const targetAssetId = deriveTargetAssetId("hat", jobId);
    const runId = crypto.randomUUID();

    try {
      // ── Step 1: Insert job in 'pending' state ─────────────────────────────
      await insertPendingJob(supabase, jobId, targetAssetId);

      // ── Step 2: Claim the job ─────────────────────────────────────────────
      const claimed = await claimGenerationJob(supabase, jobId);
      assertNotEquals(claimed, null, "claimGenerationJob must succeed for a pending job");

      // Read canonical claimed_at from DB immediately after claim.
      // PostgreSQL may return '+00:00' instead of 'Z' for TIMESTAMPTZ columns;
      // using the DB-returned value avoids string equality failures.
      const claimedRow = await readJobRow(supabase, jobId);
      const canonicalClaimedAt = claimedRow?.claimed_at as string;
      assert(
        typeof canonicalClaimedAt === "string" && canonicalClaimedAt.length > 0,
        "PRECONDITION: claimed_at must be set after claim",
      );
      assertEquals(
        claimedRow?.status,
        "generating",
        "PRECONDITION: job must be in 'generating' state after claim",
      );

      // ── Step 3: Create FK dependencies ───────────────────────────────────
      // completeGenerationJob requires:
      //   - avatar_assets row with asset_id = targetAssetId (resulting_asset_id FK)
      //   - avatar_asset_validation_runs row with id = runId (onboarding run FK)
      // Both become permanent artifacts — see COMPLETION-2 cleanup note in file header.
      await insertMinimalAsset(supabase, targetAssetId);
      await insertMinimalValidationRun(supabase, runId, targetAssetId);

      // ── Step 4: Race two completions in parallel ──────────────────────────
      // Both calls are identical: same jobId, same claimed_at token, same result args.
      // PostgreSQL serialises the two concurrent UPDATE statements via row-level locking:
      //   - Winner: WHERE status='generating' AND claimed_at=X → 1 row → completes.
      //   - Loser:  lock acquired after winner commits → status='complete' → 0 rows
      //             → completeGenerationJob throws (CAS mismatch).
      //
      // Each promise is wrapped in .then/.catch to capture its outcome without
      // suppressing it — the loser's throw is expected and asserted below.
      type Outcome = { ok: true } | { ok: false; error: unknown };

      const [outcome1, outcome2] = await Promise.all([
        completeGenerationJob(supabase, jobId, targetAssetId, runId)
          .then((): Outcome => ({ ok: true }))
          .catch((e: unknown): Outcome => ({ ok: false, error: e })),
        completeGenerationJob(supabase, jobId, targetAssetId, runId)
          .then((): Outcome => ({ ok: true }))
          .catch((e: unknown): Outcome => ({ ok: false, error: e })),
      ]);

      // Exactly one must have succeeded; the other must have thrown.
      const successes = [outcome1, outcome2].filter((o) => o.ok).length;
      const failures = [outcome1, outcome2].filter((o) => !o.ok).length;
      assertEquals(
        successes,
        1,
        `Exactly one completion must win the race (got ${successes} successes, ${failures} failures)`,
      );
      assertEquals(
        failures,
        1,
        `Exactly one completion must be rejected by CAS guard (got ${successes} successes, ${failures} failures)`,
      );

      const failure = [outcome1, outcome2].find((o) => !o.ok) as { ok: false; error: unknown };

      assert(
        failure.error instanceof CasMismatchError,
        `Failure must be a CasMismatchError — got: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
      );

      // ── Step 5: Read final DB state — primary assertions ─────────────────
      // DB must reflect the winner's write; no ambiguous or conflicting state.
      const finalRow = await readJobRow(supabase, jobId);

      // Status must be 'complete' after the winning write.
      assertEquals(
        finalRow?.status,
        "complete",
        "status must be 'complete' after one winner completes the job",
      );

      // resulting_asset_id must be set to the correct target asset.
      assertEquals(
        finalRow?.resulting_asset_id,
        targetAssetId,
        "resulting_asset_id must equal targetAssetId",
      );

      // onboarding_validation_run_id must be set — it is the audit FK.
      assertEquals(
        finalRow?.onboarding_validation_run_id,
        runId,
        "onboarding_validation_run_id must be set to the test run ID",
      );

      // claimed_at must be unchanged — both callers used the correct token.
      // This confirms the winner did not clear or overwrite the ownership record.
      assertEquals(
        finalRow?.claimed_at,
        canonicalClaimedAt,
        "claimed_at must be preserved unchanged as the audit record of who ran the job",
      );

      // completed_at must be a valid ISO timestamp.
      if (
        typeof finalRow?.completed_at !== "string" ||
        isNaN(Date.parse(finalRow.completed_at as string))
      ) {
        throw new Error(
          `completed_at is not a valid ISO timestamp: ${JSON.stringify(finalRow?.completed_at)}`,
        );
      }

      // Failure fields must be null — a clean completion must not write failure state.
      assertEquals(
        finalRow?.failure_stage,
        null,
        "failure_stage must be null after clean completion",
      );
      assertEquals(
        finalRow?.failure_reason,
        null,
        "failure_reason must be null after clean completion",
      );
      assertEquals(
        finalRow?.failure_details,
        null,
        "failure_details must be null after clean completion",
      );

      // Stable-witness invariant: retry_count must be exactly 0.
      // completeGenerationJob never touches this column. If a partial write
      // triggered a reset or recovery path alongside completion, retry_count
      // would be incremented and this assertion would catch it.
      //
      // NOTE: This detects reset/recovery side effects, but does NOT prove
      // that only one write occurred. A full guarantee would require
      // an updated_at column or event log.
      assertEquals(
        finalRow?.retry_count,
        0,
        "retry_count must remain 0 — no reset or recovery writes must have occurred during the completion race",
      );
    } finally {
      // completeGenerationJob writes no avatar_generation_events rows, so the job
      // row has no child FK rows blocking its deletion.
      await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      // Validation run and asset are permanent artifacts (prevent_validation_run_modification
      // blocks delete; ON DELETE RESTRICT on asset blocks delete while run exists).
      // Swallow errors intentionally — these rows will outlive the test run.
      await supabase.from("avatar_asset_validation_runs").delete().eq("id", runId);
      await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
    }
  },
);
