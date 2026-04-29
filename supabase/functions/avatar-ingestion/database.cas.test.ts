// CAS protection tests for completeIngestionJob.
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-ingestion/database.cas.test.ts
//
// Each test inserts an isolated job row, exercises completeIngestionJob,
// then reads the row back directly to verify DB state — no mocks, no assumptions.

import { assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import { completeIngestionJob } from "./database.ts";
import type { SupabaseClient } from "./supabase.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

// Unique asset_id per test run so the partial unique index
// (one 'validating' job per asset_id) is never violated across tests.
function uniqueAssetId(): string {
  return `test_cas_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

// Inserts a job row directly in 'validating' state with an explicit claimed_at.
// Using direct INSERT rather than createIngestionJob + claimIngestionJob because
// the stale-worker tests require a controlled claimed_at value that is in the past.
async function insertValidatingJob(
  supabase: SupabaseClient,
  jobId: string,
  assetId: string,
  claimedAt: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_ingestion_jobs").insert({
    id: jobId,
    asset_id: assetId,
    slot: "head",
    status: "validating",
    retry_count: 0,
    initiated_by: "test-cas-runner",
    staging_glb_path: `${jobId}/source.glb`,
    staging_thumbnail_path: `${jobId}/thumbnail.png`,
    claimed_at: claimedAt,
  });
  if (error) {
    throw new Error(`Test setup (INSERT) failed: ${error.message}`);
  }
}

// Direct SELECT — used to verify DB state independently of any function return value.
async function readJobRow(
  supabase: SupabaseClient,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("avatar_ingestion_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    throw new Error(`Test DB read failed: ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

async function deleteJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase.from("avatar_ingestion_jobs").delete().eq("id", jobId);
}

// ── CAS-1: Stale worker is rejected ──────────────────────────────────────────
// Proves: a zombie holding an old claimed_at cannot complete a recovered/retried job.
// Proves: the rejection surfaces as an explicit Error, not a silent no-op.

Deno.test("CAS-1: stale worker holding old claimed_at is rejected with explicit error", async () => {
  const supabase = getServiceClient();
  const jobId = crypto.randomUUID();
  const assetId = uniqueAssetId();

  // Active worker claimed the job at T2.
  const activeClaimedAt = new Date().toISOString();
  // Zombie holds T1 — 15 minutes in the past, past the stale threshold.
  const staleClaimedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  await insertValidatingJob(supabase, jobId, assetId, activeClaimedAt);

  try {
    await assertRejects(
      () => completeIngestionJob(supabase, jobId, staleClaimedAt, assetId, "run-zombie-001"),
      Error,
      "modified concurrently",
    );
  } finally {
    await deleteJob(supabase, jobId);
  }
});

// ── CAS-2: DB state is unchanged after stale completion attempt ───────────────
// Proves: the rejected write leaves no trace — status, claimed_at, and onboarding
// fields are exactly as they were before the stale call.

Deno.test("CAS-2: DB state is unchanged after stale completion attempt", async () => {
  const supabase = getServiceClient();
  const jobId = crypto.randomUUID();
  const assetId = uniqueAssetId();

  const activeClaimedAt = new Date().toISOString();
  const staleClaimedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  await insertValidatingJob(supabase, jobId, assetId, activeClaimedAt);

  try {
    // Stale attempt — expected to throw. Catch so we can verify DB state after.
    try {
      await completeIngestionJob(supabase, jobId, staleClaimedAt, assetId, "run-zombie-002");
    } catch {
      // Expected rejection. Continue to DB verification.
    }

    const row = await readJobRow(supabase, jobId);

    // Job row must be byte-for-byte identical to what was inserted.
    assertEquals(row?.status, "validating", "status must remain 'validating'");
    assertEquals(row?.claimed_at, activeClaimedAt, "claimed_at must not be overwritten");
    assertEquals(row?.onboarding_asset_id, null, "onboarding_asset_id must not be written");
    assertEquals(row?.onboarding_validation_run_id, null, "onboarding_validation_run_id must not be written");
    assertEquals(row?.completed_at, null, "completed_at must not be written");
    assertEquals(row?.failure_stage, null, "failure_stage must remain null");
    assertEquals(row?.failure_reason, null, "failure_reason must remain null");
  } finally {
    await deleteJob(supabase, jobId);
  }
});

// ── CAS-3: Legitimate re-claimed worker completes without error ───────────────
// Proves: the CAS guard does not block the correct holder of claimed_at.

Deno.test("CAS-3: legitimate worker holding active claimed_at completes without error", async () => {
  const supabase = getServiceClient();
  const jobId = crypto.randomUUID();
  const assetId = uniqueAssetId();
  const claimedAt = new Date().toISOString();

  await insertValidatingJob(supabase, jobId, assetId, claimedAt);

  try {
    // Must not throw.
    await completeIngestionJob(supabase, jobId, claimedAt, assetId, "run-legit-003");
  } finally {
    await deleteJob(supabase, jobId);
  }
});

// ── CAS-4: DB state after legitimate completion is correct and auditable ──────
// Proves: status=complete, onboarding FK fields written, claimed_at preserved
// (audit trail), failure fields null, completed_at is a valid ISO timestamp.

Deno.test("CAS-4: DB state after legitimate completion is correct and auditable", async () => {
  const supabase = getServiceClient();
  const jobId = crypto.randomUUID();
  const assetId = uniqueAssetId();
  const claimedAt = new Date().toISOString();
  const onboardingAssetId = `onb_${crypto.randomUUID()}`;
  const onboardingRunId = `run_${crypto.randomUUID()}`;

  await insertValidatingJob(supabase, jobId, assetId, claimedAt);

  try {
    await completeIngestionJob(supabase, jobId, claimedAt, onboardingAssetId, onboardingRunId);

    // Read back from DB directly — not trusting the function's return value.
    const row = await readJobRow(supabase, jobId);

    assertEquals(row?.status, "complete", "status must be 'complete'");
    assertEquals(
      row?.onboarding_asset_id,
      onboardingAssetId,
      "onboarding_asset_id must match what was passed",
    );
    assertEquals(
      row?.onboarding_validation_run_id,
      onboardingRunId,
      "onboarding_validation_run_id must match what was passed",
    );
    // claimed_at must be preserved — it is the audit record of which worker ran this job.
    assertEquals(row?.claimed_at, claimedAt, "claimed_at must be preserved as audit trail");
    // Failure fields must not be present on a clean completion.
    assertEquals(row?.failure_stage, null, "failure_stage must be null on clean completion");
    assertEquals(row?.failure_reason, null, "failure_reason must be null on clean completion");
    assertEquals(row?.failure_details, null, "failure_details must be null on clean completion");
    // completed_at must be a valid ISO timestamp set by the function.
    if (typeof row?.completed_at !== "string" || isNaN(Date.parse(row.completed_at as string))) {
      throw new Error(
        `completed_at is not a valid ISO timestamp: ${JSON.stringify(row?.completed_at)}`,
      );
    }
  } finally {
    await deleteJob(supabase, jobId);
  }
});
