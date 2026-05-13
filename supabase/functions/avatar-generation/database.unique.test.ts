// Ownership and UNIQUE constraint tests for avatar_generation_jobs.
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.unique.test.ts
//
// Each test inserts isolated rows, exercises the ownership/uniqueness invariants,
// then reads the row back directly to verify DB state — no mocks, no assumptions.
//
// Three invariants under test:
//   UNIQUE-1: Two concurrent jobs always derive different target_asset_ids (by construction).
//   UNIQUE-2: DB UNIQUE constraint catches a collision even if application logic fails to prevent it.
//   UNIQUE-3: Parallel completions both succeed with distinct resulting_asset_ids.

import { assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import { completeGenerationJob, deriveTargetAssetId } from "./database.ts";
import type { SupabaseClient } from "./supabase.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

// Inserts a generation job directly in 'generating' state with a controlled claimed_at.
// Direct INSERT avoids the full /init → /process path so tests are isolated and fast.
// The DB CHECK constraints that apply at INSERT time are satisfied:
//   - claimed_at IS NOT NULL when status != 'pending'
//   - completed_at IS NULL when status NOT IN ('complete', 'failed_permanent')
//   - copyright_review_result IS NULL → all copyright atomicity checks pass
//   - manual_review_required = false, copyright NULL → consistency check is NULL (passes)
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
    generation_prompt: "A stylish test hat for automated testing",
    policy_prompt: "Test policy — no copyright infringement",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-unique-runner",
    status: "generating",
    claimed_at: claimedAt,
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT generation job) failed: ${error.message}`);
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
      identity: { asset_id: assetId, slot: "hat", display_name: `Test asset` },
      technical: {},
      deployment: { current_status: "draft", production_enabled: false },
      audit: { created_by: "test-unique-runner", created_at: now },
    },
    created_by: "test-unique-runner",
    last_modified_by: "test-unique-runner",
  });
  if (error) {
    throw new Error(`Test setup (INSERT avatar_assets) failed: ${error.message}`);
  }
}

// Inserts a minimal avatar_asset_validation_runs row to satisfy the second FK
// required by completeGenerationJob (onboarding_validation_run_id).
async function insertMinimalValidationRun(
  supabase: SupabaseClient,
  runId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_asset_validation_runs").insert({
    id: runId,
    asset_id: assetId,
    triggered_by: "test-unique-runner",
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
    throw new Error(`Test DB read (generation_jobs) failed: ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────
// Must be called in FK-safe order (see finally blocks in tests):
//   1. deleteJob       — drops FK refs from generation_jobs → avatar_assets + validation_runs
//   2. deleteValidationRun — drops FK ref from validation_runs → avatar_assets
//   3. deleteAsset     — now safe to delete the asset

async function deleteJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
}

async function deleteValidationRun(supabase: SupabaseClient, runId: string): Promise<void> {
  await supabase.from("avatar_asset_validation_runs").delete().eq("id", runId);
}

async function deleteAsset(supabase: SupabaseClient, assetId: string): Promise<void> {
  await supabase.from("avatar_assets").delete().eq("asset_id", assetId);
}

// ── UNIQUE-1: Two concurrent jobs always derive different target_asset_ids ─────
// Proves: deriveTargetAssetId maps distinct UUIDs to distinct target_asset_ids.
// Proves: the DB UNIQUE constraint accepts both INSERT statements without error.
// Proves: SELECT-confirmed target_asset_ids match derived values and are distinct.

Deno.test("UNIQUE-1: two concurrent jobs always derive different target_asset_ids at DB level", async () => {
  const supabase = getServiceClient();
  const jobId1 = crypto.randomUUID();
  const jobId2 = crypto.randomUUID();
  const claimedAt = new Date().toISOString();

  const targetAssetId1 = deriveTargetAssetId("hat", jobId1);
  const targetAssetId2 = deriveTargetAssetId("hat", jobId2);

  // Pre-flight: assert derivation is distinct before touching the DB.
  // A broken deriveTargetAssetId implementation would be caught here first.
  assertNotEquals(
    targetAssetId1,
    targetAssetId2,
    "PRECONDITION: deriveTargetAssetId must produce distinct values for distinct UUIDs",
  );

  try {
    // Both inserts must succeed — no UNIQUE collision between distinct UUIDs.
    await Promise.all([
      insertGeneratingJob(supabase, jobId1, targetAssetId1, claimedAt),
      insertGeneratingJob(supabase, jobId2, targetAssetId2, claimedAt),
    ]);

    // Read back from DB directly — do not trust the INSERT return value.
    const [row1, row2] = await Promise.all([
      readJobRow(supabase, jobId1),
      readJobRow(supabase, jobId2),
    ]);

    // DB-confirmed values must match what was derived locally.
    assertEquals(
      row1?.target_asset_id,
      targetAssetId1,
      "job 1 target_asset_id in DB must equal the derived value",
    );
    assertEquals(
      row2?.target_asset_id,
      targetAssetId2,
      "job 2 target_asset_id in DB must equal the derived value",
    );

    // Core ownership invariant: two jobs must never share a target asset.
    assertNotEquals(
      row1?.target_asset_id,
      row2?.target_asset_id,
      "INVARIANT: two concurrent jobs must have distinct target_asset_ids in the DB",
    );
  } finally {
    await Promise.all([deleteJob(supabase, jobId1), deleteJob(supabase, jobId2)]);
  }
});

// ── UNIQUE-2: DB UNIQUE constraint rejects a duplicate target_asset_id ─────────
// Proves: even if application code somehow produces the same target_asset_id for
// two jobs, the DB rejects the second INSERT with a unique_violation (23505).
// This is a defence-in-depth test — the constraint must hold independent of the
// application layer that normally prevents collisions by construction.

Deno.test("UNIQUE-2: DB UNIQUE constraint rejects a second job with the same target_asset_id", async () => {
  const supabase = getServiceClient();
  const jobId1 = crypto.randomUUID();
  const jobId2 = crypto.randomUUID();
  const claimedAt = new Date().toISOString();

  // Force a collision: different UUIDs → same target_asset_id.
  // In production this cannot happen through deriveTargetAssetId (different UUIDs
  // always produce different 8-char prefixes). This test verifies the DB catches
  // the collision unconditionally, without relying on application logic to prevent it.
  const sharedTargetAssetId = "hat_gen_collision";

  try {
    // First INSERT must succeed.
    await insertGeneratingJob(supabase, jobId1, sharedTargetAssetId, claimedAt);

    // Second INSERT with the same target_asset_id must be rejected by the DB.
    // The error message from PostgreSQL includes "duplicate key" for any UNIQUE violation.
    await assertRejects(
      () => insertGeneratingJob(supabase, jobId2, sharedTargetAssetId, claimedAt),
      Error,
      "duplicate key",
    );
  } finally {
    // Only jobId1 was inserted; jobId2 was rejected before reaching the DB.
    await deleteJob(supabase, jobId1);
  }
});

// ── UNIQUE-3: Parallel completions both succeed with distinct resulting_asset_ids ─
// Proves: two jobs run in parallel (Promise.all) complete independently.
// Proves: each job's CAS guard on claimed_at ensures only the correct caller
//         can write to each row — parallel writes do not interfere.
// Proves: both status='complete' and distinct resulting_asset_ids confirmed by
//         direct DB SELECT — no trust in return values.

Deno.test("UNIQUE-3: parallel completion writes both succeed with distinct resulting_asset_ids", async () => {
  const supabase = getServiceClient();

  const jobId1 = crypto.randomUUID();
  const jobId2 = crypto.randomUUID();
  // Use 1 ms offset to make claimedAt values observably distinct in DB.
  const claimedAt1 = new Date().toISOString();
  const claimedAt2 = new Date(Date.now() + 1).toISOString();

  const targetAssetId1 = deriveTargetAssetId("hat", jobId1);
  const targetAssetId2 = deriveTargetAssetId("hat", jobId2);

  const runId1 = crypto.randomUUID();
  const runId2 = crypto.randomUUID();

  try {
    // ── Setup: insert generation jobs in 'generating' state ──────────────────
    await Promise.all([
      insertGeneratingJob(supabase, jobId1, targetAssetId1, claimedAt1),
      insertGeneratingJob(supabase, jobId2, targetAssetId2, claimedAt2),
    ]);

    // ── Setup: create avatar_assets rows required by the resulting_asset_id FK ─
    // production_enabled=false is required — the pipeline can never complete a
    // job whose target asset is already in production.
    await Promise.all([
      insertMinimalAsset(supabase, targetAssetId1),
      insertMinimalAsset(supabase, targetAssetId2),
    ]);

    // ── Setup: create validation_run rows required by the onboarding run FK ────
    await Promise.all([
      insertMinimalValidationRun(supabase, runId1, targetAssetId1),
      insertMinimalValidationRun(supabase, runId2, targetAssetId2),
    ]);

    // ── Exercise: complete both jobs in parallel ───────────────────────────────
    // resulting_asset_id must equal target_asset_id per the DB CHECK constraint.
    await Promise.all([
      completeGenerationJob(supabase, jobId1, targetAssetId1, runId1),
      completeGenerationJob(supabase, jobId2, targetAssetId2, runId2),
    ]);

    // ── Verify: read final state from DB without trusting return values ────────
    const [row1, row2] = await Promise.all([
      readJobRow(supabase, jobId1),
      readJobRow(supabase, jobId2),
    ]);

    // Both jobs must be complete.
    assertEquals(row1?.status, "complete", "job 1 status must be 'complete'");
    assertEquals(row2?.status, "complete", "job 2 status must be 'complete'");

    // Each resulting_asset_id must equal its own target (enforced by DB CHECK).
    assertEquals(
      row1?.resulting_asset_id,
      targetAssetId1,
      "job 1 resulting_asset_id must equal its target_asset_id",
    );
    assertEquals(
      row2?.resulting_asset_id,
      targetAssetId2,
      "job 2 resulting_asset_id must equal its target_asset_id",
    );

    // Core invariant: two completed jobs must never share a resulting_asset_id.
    assertNotEquals(
      row1?.resulting_asset_id,
      row2?.resulting_asset_id,
      "INVARIANT: two completed jobs must have distinct resulting_asset_ids",
    );

    // completed_at must be a valid ISO timestamp for both.
    if (typeof row1?.completed_at !== "string" || isNaN(Date.parse(row1.completed_at as string))) {
      throw new Error(
        `job 1 completed_at is not a valid ISO timestamp: ${JSON.stringify(row1?.completed_at)}`,
      );
    }
    if (typeof row2?.completed_at !== "string" || isNaN(Date.parse(row2.completed_at as string))) {
      throw new Error(
        `job 2 completed_at is not a valid ISO timestamp: ${JSON.stringify(row2?.completed_at)}`,
      );
    }

    // Failure fields must be null on a clean completion.
    assertEquals(row1?.failure_stage, null, "job 1 failure_stage must be null");
    assertEquals(row1?.failure_reason, null, "job 1 failure_reason must be null");
    assertEquals(row2?.failure_stage, null, "job 2 failure_stage must be null");
    assertEquals(row2?.failure_reason, null, "job 2 failure_reason must be null");

    // onboarding_validation_run_id must be preserved as the audit trail.
    assertEquals(
      row1?.onboarding_validation_run_id,
      runId1,
      "job 1 onboarding_validation_run_id must be set to the test run ID",
    );
    assertEquals(
      row2?.onboarding_validation_run_id,
      runId2,
      "job 2 onboarding_validation_run_id must be set to the test run ID",
    );

    // claimed_at must be preserved — it is the audit record of which worker ran the job.
    assertEquals(
      row1?.claimed_at,
      claimedAt1,
      "job 1 claimed_at must be preserved as audit trail",
    );
    assertEquals(
      row2?.claimed_at,
      claimedAt2,
      "job 2 claimed_at must be preserved as audit trail",
    );
  } finally {
    // Delete in FK-safe order:
    //   1. avatar_generation_jobs holds FKs to both avatar_assets and validation_runs
    //   2. avatar_asset_validation_runs holds FK to avatar_assets
    //   3. avatar_assets can now be deleted safely
    await Promise.all([deleteJob(supabase, jobId1), deleteJob(supabase, jobId2)]);
    await Promise.all([
      deleteValidationRun(supabase, runId1),
      deleteValidationRun(supabase, runId2),
    ]);
    await Promise.all([
      deleteAsset(supabase, targetAssetId1),
      deleteAsset(supabase, targetAssetId2),
    ]);
  }
});
