// Race-condition test for recoverStuckJob vs failGenerationJob (RECOVER-STUCK-RACE).
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.recover.stuck.race.test.ts
//
// What is under test:
//   recoverStuckJob and failGenerationJob race on the same stuck 'generating' job
//   (claimed_at older than the 10-minute stale threshold).
//
//   Neither function increments version, so version is NOT used to identify the winner.
//   The winner is identified from failure_stage:
//     failure_stage = 'timeout'    → recoverStuckJob wrote.
//     failure_stage = 'race-stage' → failGenerationJob wrote.
//
//   version must remain exactly at initialVersion regardless of which function wins.
//   version = initialVersion + 1 or higher → a function unexpectedly incremented it.
//
// Both functions produce a failed_* status, so winner is determined from failure_stage.
//
// Cleanup:
//   Job is inserted directly in 'generating' state — no pipeline functions are called,
//   so no avatar_generation_events rows are created. Job row can be deleted freely in finally.
//
// This test FAILS if:
//   - version ≠ initialVersion (any function incremented version unexpectedly)
//   - failure_stage is neither 'timeout' nor 'race-stage' (unknown winner)
//   - winner-specific state fields are inconsistent with failure_stage
//   - failure_details.source does not match failure_reason (split-brain, failGenerationJob branch)
//   - claimed_at or retry_count were mutated

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import { deriveTargetAssetId, failGenerationJob, recoverStuckJob } from "./database.ts";
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

async function insertStuckGeneratingJob(
  supabase: SupabaseClient,
  jobId: string,
  targetAssetId: string,
  stuckClaimedAt: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_generation_jobs").insert({
    id: jobId,
    target_asset_id: targetAssetId,
    slot: "hat",
    generation_prompt: "RECOVER-STUCK-RACE test",
    policy_prompt: "Test policy",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-recover-stuck-race-runner",
    status: "generating",
    claimed_at: stuckClaimedAt,
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT stuck generating job) failed: ${error.message}`);
  }
}

// ── RECOVER-STUCK-RACE ────────────────────────────────────────────────────────

Deno.test(
  "RECOVER-STUCK-RACE: recoverStuckJob vs failGenerationJob — version reflects exactly one write; state is consistent",
  async (t) => {
    const supabase = getServiceClient();

    // ── retryable = true ──────────────────────────────────────────────────────
    await t.step(
      "retryable=true — version reflects exactly one valid write; winner state is consistent",
      async () => {
        const jobId = crypto.randomUUID();
        const targetAssetId = deriveTargetAssetId("hat", jobId);
        // 11 minutes: safely past the 10-minute stale threshold used by recoverStuckJob.
        const stuckClaimedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();

        try {
          await insertStuckGeneratingJob(supabase, jobId, targetAssetId, stuckClaimedAt);

          const before = await readJobRow(supabase, jobId);
          assert(before !== null, "before row must exist");
          assertEquals(before?.status, "generating", "PRECONDITION: status must be 'generating'");
          assert(before?.claimed_at !== null, "PRECONDITION: claimed_at must be set");

          const canonicalClaimedAt = before?.claimed_at as string;
          const initialVersion = before?.version as number;
          const initialRetryCount = before?.retry_count as number;

          // ── Race — outcomes are not examined ────────────────────────────────
          await Promise.all([
            recoverStuckJob(
              supabase,
              jobId,
              canonicalClaimedAt,
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

          // ── Read final DB state (sole source of truth) ──────────────────────
          const final = await readJobRow(supabase, jobId);
          assert(final !== null, "final row must exist");

          // ── 1. Winner-specific state and version (branched on failure_stage) ──
          // recover_stuck_job_atomic increments version; failGenerationJob does not.
          // Winner discriminant:
          //   'timeout-recovery' → recoverStuckJob won (version = initialVersion + 1)
          //   'race-stage'       → failGenerationJob won (version = initialVersion)
          if (final?.failure_stage === "timeout-recovery") {
            // recoverStuckJob won — recover_stuck_job_atomic increments version.
            assertEquals(
              final?.version,
              initialVersion + 1,
              `recoverStuckJob winner: version must be initialVersion+1 (${initialVersion + 1})`,
            );
            assertEquals(
              final?.status,
              "failed_retryable",
              "recoverStuckJob winner: status must be 'failed_retryable'",
            );
            assertEquals(
              final?.failure_stage,
              "timeout-recovery",
              "recoverStuckJob winner: failure_stage must be 'timeout-recovery'",
            );
            assert(
              typeof final?.failure_reason === "string" &&
                (final.failure_reason as string).length > 0,
              `recoverStuckJob winner: failure_reason must be non-empty, got: ${JSON.stringify(final?.failure_reason)}`,
            );
            const details = final?.failure_details as Record<string, unknown> | null;
            assert(
              details !== null,
              "recoverStuckJob winner: failure_details must be non-null",
            );
            assertEquals(
              final?.claimed_at,
              canonicalClaimedAt,
              "recoverStuckJob winner: claimed_at must remain unchanged",
            );
          } else {
            // failGenerationJob won — version unchanged.
            assertEquals(
              final?.version,
              initialVersion,
              `failGenerationJob winner: version must equal initialVersion (${initialVersion})`,
            );
            assertEquals(
              final?.failure_stage,
              "race-stage",
              "failGenerationJob winner: failure_stage must be 'race-stage'",
            );
            assert(
              (final?.status as string).startsWith("failed"),
              `failGenerationJob winner: status must start with 'failed', got: ${JSON.stringify(final?.status)}`,
            );
            assert(
              typeof final?.failure_reason === "string" &&
                (final.failure_reason as string).length > 0,
              `failGenerationJob winner: failure_reason must be non-empty, got: ${JSON.stringify(final?.failure_reason)}`,
            );
            const details = final?.failure_details as Record<string, unknown> | null;
            assert(details !== null, "failGenerationJob winner: failure_details must be non-null");
            assert(
              typeof details.source === "string",
              "failGenerationJob winner: failure_details.source must be a string",
            );
            assertEquals(
              details.source,
              final?.failure_reason,
              "failure_details.source must match failure_reason",
            );
            assertEquals(
              final?.claimed_at,
              canonicalClaimedAt,
              "failGenerationJob winner: claimed_at must remain unchanged",
            );
          }

          // ── 3. CAS invariants ────────────────────────────────────────────────
          assertEquals(
            final?.retry_count,
            initialRetryCount,
            `retry_count must remain exactly ${initialRetryCount}`,
          );
        } finally {
          await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
        }
      },
    );

    // ── retryable = false ─────────────────────────────────────────────────────
    // failGenerationJob produces 'failed_permanent'; recoverStuckJob always produces
    // 'failed_retryable'. failure_stage is the winner discriminant in both sub-steps.
    await t.step(
      "retryable=false — version reflects exactly one valid write; winner state is consistent",
      async () => {
        const jobId = crypto.randomUUID();
        const targetAssetId = deriveTargetAssetId("hat", jobId);
        const stuckClaimedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();

        try {
          await insertStuckGeneratingJob(supabase, jobId, targetAssetId, stuckClaimedAt);

          const before = await readJobRow(supabase, jobId);
          assert(before !== null, "before row must exist");
          assertEquals(before?.status, "generating", "PRECONDITION: status must be 'generating'");
          assert(before?.claimed_at !== null, "PRECONDITION: claimed_at must be set");

          const canonicalClaimedAt = before?.claimed_at as string;
          const initialVersion = before?.version as number;
          const initialRetryCount = before?.retry_count as number;

          // ── Race — outcomes are not examined ────────────────────────────────
          await Promise.all([
            recoverStuckJob(
              supabase,
              jobId,
              canonicalClaimedAt,
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

          // ── Read final DB state (sole source of truth) ──────────────────────
          const final = await readJobRow(supabase, jobId);
          assert(final !== null, "final row must exist");

          // ── 1. Global invariant: version unchanged ───────────────────────────
          // Neither recoverStuckJob nor failGenerationJob increments version.
          assertEquals(
            final?.version,
            initialVersion,
            `version must remain exactly ${initialVersion} — neither function increments version`,
          );

          // ── 2. Winner-specific state (branched on failure_stage) ─────────────
          if (final?.failure_stage === "timeout") {
            // recoverStuckJob won.
            assertEquals(
              final?.status,
              "failed_retryable",
              "recoverStuckJob winner: status must be 'failed_retryable'",
            );
            assertEquals(
              final?.failure_stage,
              "timeout",
              "recoverStuckJob winner: failure_stage must be 'timeout'",
            );
            assert(
              typeof final?.failure_reason === "string" &&
                (final.failure_reason as string).length > 0,
              `recoverStuckJob winner: failure_reason must be non-empty, got: ${JSON.stringify(final?.failure_reason)}`,
            );
            const details = final?.failure_details as Record<string, unknown> | null;
            assert(
              details !== null,
              "recoverStuckJob winner: failure_details must be non-null",
            );
            assertEquals(
              final?.claimed_at,
              canonicalClaimedAt,
              "recoverStuckJob winner: claimed_at must remain unchanged",
            );
          } else {
            // failGenerationJob won — version unchanged.
            assertEquals(
              final?.version,
              initialVersion,
              `failGenerationJob winner: version must equal initialVersion (${initialVersion})`,
            );
            assertEquals(
              final?.failure_stage,
              "race-stage",
              "failGenerationJob winner: failure_stage must be 'race-stage'",
            );
            assert(
              (final?.status as string).startsWith("failed"),
              `failGenerationJob winner: status must start with 'failed', got: ${JSON.stringify(final?.status)}`,
            );
            assert(
              typeof final?.failure_reason === "string" &&
                (final.failure_reason as string).length > 0,
              `failGenerationJob winner: failure_reason must be non-empty, got: ${JSON.stringify(final?.failure_reason)}`,
            );
            const details = final?.failure_details as Record<string, unknown> | null;
            assert(details !== null, "failGenerationJob winner: failure_details must be non-null");
            assert(
              typeof details.source === "string",
              "failGenerationJob winner: failure_details.source must be a string",
            );
            assertEquals(
              details.source,
              final?.failure_reason,
              "failure_details.source must match failure_reason",
            );
            assertEquals(
              final?.claimed_at,
              canonicalClaimedAt,
              "failGenerationJob winner: claimed_at must remain unchanged",
            );
          }

          // ── 3. CAS invariants ────────────────────────────────────────────────
          assertEquals(
            final?.retry_count,
            initialRetryCount,
            `retry_count must remain exactly ${initialRetryCount}`,
          );
        } finally {
          await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
        }
      },
    );
  },
);
