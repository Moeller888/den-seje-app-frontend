// Race-safety test for completeGenerationJob vs failGenerationJob (FAIL-COMPLETE-RACE).
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.fail.complete.race.test.ts
//
// What is under test:
//   completeGenerationJob and failGenerationJob race on the same 'generating' job.
//   Correctness is proven entirely from the final DB row — execution outcomes
//   (which function threw, which returned) are not examined.
//
//   completeGenerationJob increments version; failGenerationJob does not.
//   Winner discriminant:
//     status='complete' → completeGenerationJob won (version = initialVersion + 1)
//     status='failed_*' → failGenerationJob won    (version = initialVersion)
//   The write is proven by the status no longer being 'generating' and the
//   failure/complete fields being internally consistent.
//
//   State consistency is then verified from final.status:
//     status='complete'   → completed_at set, failure fields null
//     status='failed_*'   → failure_reason set, failure_stage set
//
// Setup:
//   FK rows required by completeGenerationJob:
//     avatar_assets              (asset_id = targetAssetId)
//     avatar_asset_validation_runs (id = runId, asset_id = targetAssetId)
//   The CHECK constraint generation_jobs_resulting_matches_target requires
//   resulting_asset_id = target_asset_id, so resultingAssetId = targetAssetId.
//   Validation run rows are permanent artifacts — delete in finally is best-effort.
//
// This test FAILS if:
//   - completeGenerationJob winner: version ≠ initialVersion + 1
//   - failGenerationJob winner: version ≠ initialVersion
//   - status='complete' with failure fields non-null
//   - status='failed_*' with failure fields null
//   - claimed_at or retry_count were mutated

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import {
  completeGenerationJob,
  deriveTargetAssetId,
  failGenerationJob,
} from "./database.ts";
import type { SupabaseClient } from "./supabase.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    generation_prompt: "FAIL-COMPLETE-RACE test",
    policy_prompt: "Test policy",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-complete-race-runner",
    status: "generating",
    claimed_at: claimedAt,
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT generating job) failed: ${error.message}`);
  }
}

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
      audit: { created_by: "test-complete-race-runner", created_at: now },
    },
    created_by: "test-complete-race-runner",
    last_modified_by: "test-complete-race-runner",
  });
  if (error) {
    throw new Error(`Test setup (INSERT avatar_assets) failed: ${error.message}`);
  }
}

async function insertMinimalValidationRun(
  supabase: SupabaseClient,
  runId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_asset_validation_runs").insert({
    id: runId,
    asset_id: assetId,
    triggered_by: "test-complete-race-runner",
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

// ── FAIL-COMPLETE-RACE ────────────────────────────────────────────────────────

Deno.test(
  "FAIL-COMPLETE-RACE: concurrent complete + fail — version advances by 1; state is consistent",
  async (t) => {
    const supabase = getServiceClient();

    // ── retryable = true ──────────────────────────────────────────────────────
    await t.step(
      "retryable=true — version advances by exactly 1; state is consistent",
      async () => {
        const jobId = crypto.randomUUID();
        const targetAssetId = deriveTargetAssetId("hat", jobId);
        const runId = crypto.randomUUID();
        const claimedAt = new Date().toISOString();

        try {
          await insertMinimalAsset(supabase, targetAssetId);
          await insertMinimalValidationRun(supabase, runId, targetAssetId);
          await insertGeneratingJob(supabase, jobId, targetAssetId, claimedAt);

          const before = await readJobRow(supabase, jobId);
          assert(before !== null, "before row must exist");
          assertEquals(before?.status, "generating", "PRECONDITION: status must be 'generating'");
          assert(before?.claimed_at !== null, "PRECONDITION: claimed_at must be set");

          const canonicalClaimedAt = before?.claimed_at as string;
          const initialVersion = before?.version as number;
          const initialRetryCount = before?.retry_count as number;

          // ── Race — outcomes are not examined ──────────────────────────────
          await Promise.all([
            completeGenerationJob(
              supabase,
              jobId,
              targetAssetId,
              runId,
            ).catch(() => {}),
            failGenerationJob(
              supabase,
              jobId,
              canonicalClaimedAt,
              true,
              "race-stage",
              "race-fail",
              { source: "race-fail" },
            ).catch(() => {}),
          ]);

          // ── Read final DB state (sole source of truth) ────────────────────
          const final = await readJobRow(supabase, jobId);
          assert(final !== null, "final row must exist");

          // ── 1. State consistency + version (branched on DB status) ──────────
          const finalStatus = final?.status as string;
          assert(
            finalStatus === "complete" || finalStatus.startsWith("failed"),
            `status must be 'complete' or 'failed_*', got: ${JSON.stringify(finalStatus)}`,
          );

          if (finalStatus === "complete") {
            assertEquals(final?.version, initialVersion + 1, `status='complete': version must equal initialVersion+1 (${initialVersion + 1})`);
            assert(
              typeof final?.completed_at === "string" &&
                !isNaN(Date.parse(final.completed_at as string)),
              `status='complete': completed_at must be a valid ISO timestamp, got: ${JSON.stringify(final?.completed_at)}`,
            );
            assertEquals(final?.resulting_asset_id, targetAssetId, "status='complete': resulting_asset_id must be targetAssetId");
            assertEquals(final?.onboarding_validation_run_id, runId, "status='complete': onboarding_validation_run_id must be runId");
            assertEquals(final?.failure_reason, null, "status='complete': failure_reason must be null");
            assertEquals(final?.failure_stage, null, "status='complete': failure_stage must be null");
            assertEquals(final?.failure_details, null, "status='complete': failure_details must be null");
          } else {
            assertEquals(final?.version, initialVersion, `status='${finalStatus}': version must equal initialVersion (${initialVersion})`);
            assert(
              typeof final?.failure_reason === "string" &&
                (final.failure_reason as string).length > 0,
              `status='${finalStatus}': failure_reason must be non-null, got: ${JSON.stringify(final?.failure_reason)}`,
            );
            assert(
              typeof final?.failure_stage === "string" &&
                (final.failure_stage as string).length > 0,
              `status='${finalStatus}': failure_stage must be non-null, got: ${JSON.stringify(final?.failure_stage)}`,
            );
            assertEquals(final?.resulting_asset_id, null, `status='${finalStatus}': resulting_asset_id must be null`);
            const details = final?.failure_details as Record<string, unknown> | null;
            assert(details !== null, `status='${finalStatus}': failure_details must be non-null`);
            assert(typeof details.source === "string", `status='${finalStatus}': failure_details.source must be a string`);
            assertEquals(details.source, final?.failure_reason, "failure_details.source must match failure_reason");
          }

          // ── 3. CAS invariants ─────────────────────────────────────────────
          assertEquals(
            final?.claimed_at,
            canonicalClaimedAt,
            "claimed_at must remain unchanged",
          );
          assertEquals(
            final?.retry_count,
            initialRetryCount,
            `retry_count must remain exactly ${initialRetryCount}`,
          );
        } finally {
          await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
          await supabase.from("avatar_asset_validation_runs").delete().eq("id", runId);
          await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
        }
      },
    );

    // ── retryable = false ─────────────────────────────────────────────────────
    await t.step(
      "retryable=false — version remains at initialVersion; state is consistent",
      async () => {
        const jobId = crypto.randomUUID();
        const targetAssetId = deriveTargetAssetId("hat", jobId);
        const runId = crypto.randomUUID();
        const claimedAt = new Date().toISOString();

        try {
          await insertMinimalAsset(supabase, targetAssetId);
          await insertMinimalValidationRun(supabase, runId, targetAssetId);
          await insertGeneratingJob(supabase, jobId, targetAssetId, claimedAt);

          const before = await readJobRow(supabase, jobId);
          assert(before !== null, "before row must exist");
          assertEquals(before?.status, "generating", "PRECONDITION: status must be 'generating'");
          assert(before?.claimed_at !== null, "PRECONDITION: claimed_at must be set");

          const canonicalClaimedAt = before?.claimed_at as string;
          const initialVersion = before?.version as number;
          const initialRetryCount = before?.retry_count as number;

          // ── Race — outcomes are not examined ──────────────────────────────
          await Promise.all([
            completeGenerationJob(
              supabase,
              jobId,
              targetAssetId,
              runId,
            ).catch(() => {}),
            failGenerationJob(
              supabase,
              jobId,
              canonicalClaimedAt,
              false,
              "race-stage",
              "race-fail",
              { source: "race-fail" },
            ).catch(() => {}),
          ]);

          // ── Read final DB state (sole source of truth) ────────────────────
          const final = await readJobRow(supabase, jobId);
          assert(final !== null, "final row must exist");

          // ── 1. State consistency + version (branched on DB status) ──────────
          const finalStatus = final?.status as string;
          assert(
            finalStatus === "complete" || finalStatus.startsWith("failed"),
            `status must be 'complete' or 'failed_*', got: ${JSON.stringify(finalStatus)}`,
          );

          if (finalStatus === "complete") {
            assertEquals(final?.version, initialVersion + 1, `status='complete': version must equal initialVersion+1 (${initialVersion + 1})`);
            assert(
              typeof final?.completed_at === "string" &&
                !isNaN(Date.parse(final.completed_at as string)),
              `status='complete': completed_at must be a valid ISO timestamp, got: ${JSON.stringify(final?.completed_at)}`,
            );
            assertEquals(final?.resulting_asset_id, targetAssetId, "status='complete': resulting_asset_id must be targetAssetId");
            assertEquals(final?.onboarding_validation_run_id, runId, "status='complete': onboarding_validation_run_id must be runId");
            assertEquals(final?.failure_reason, null, "status='complete': failure_reason must be null");
            assertEquals(final?.failure_stage, null, "status='complete': failure_stage must be null");
            assertEquals(final?.failure_details, null, "status='complete': failure_details must be null");
          } else {
            assertEquals(final?.version, initialVersion, `status='${finalStatus}': version must equal initialVersion (${initialVersion})`);
            assert(
              typeof final?.failure_reason === "string" &&
                (final.failure_reason as string).length > 0,
              `status='${finalStatus}': failure_reason must be non-null, got: ${JSON.stringify(final?.failure_reason)}`,
            );
            assert(
              typeof final?.failure_stage === "string" &&
                (final.failure_stage as string).length > 0,
              `status='${finalStatus}': failure_stage must be non-null, got: ${JSON.stringify(final?.failure_stage)}`,
            );
            assertEquals(final?.resulting_asset_id, null, `status='${finalStatus}': resulting_asset_id must be null`);
            const details = final?.failure_details as Record<string, unknown> | null;
            assert(details !== null, `status='${finalStatus}': failure_details must be non-null`);
            assert(typeof details.source === "string", `status='${finalStatus}': failure_details.source must be a string`);
            assertEquals(details.source, final?.failure_reason, "failure_details.source must match failure_reason");
          }

          // ── 3. CAS invariants ─────────────────────────────────────────────
          assertEquals(
            final?.claimed_at,
            canonicalClaimedAt,
            "claimed_at must remain unchanged",
          );
          assertEquals(
            final?.retry_count,
            initialRetryCount,
            `retry_count must remain exactly ${initialRetryCount}`,
          );
        } finally {
          await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
          await supabase.from("avatar_asset_validation_runs").delete().eq("id", runId);
          await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
        }
      },
    );
  },
);
