// State-gate race test for failGenerationJob (FAIL-STATE-RACE).
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.fail.state.race.test.ts
//
// What is under test:
//   failGenerationJob guards its SELECT with a status pre-check:
//     if (row.status !== 'generating') return;
//
//   A job already in 'failed_retryable' state must be completely immune to
//   concurrent failGenerationJob calls — no field may change, version must
//   remain exactly at its initial value, and neither call may throw.
//
// How no-write is proven:
//   The version column is the definitive proof. If any write landed,
//   version would advance. version === initialVersion proves zero writes.
//
// Cleanup:
//   Job is inserted directly in 'failed_retryable' state — no pipeline
//   functions are called, so no avatar_generation_events rows are created.
//   Job rows can be deleted freely in finally.
//
// This test FAILS if:
//   - version changed from its initial value (any write occurred)
//   - Either call throws unexpectedly
//   - Any field was mutated (status, failure_reason, failure_stage, claimed_at,
//     retry_count)

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import { deriveTargetAssetId, failGenerationJob } from "./database.ts";
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

async function insertFailedRetryableJob(
  supabase: SupabaseClient,
  jobId: string,
  targetAssetId: string,
  claimedAt: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_generation_jobs").insert({
    id: jobId,
    target_asset_id: targetAssetId,
    slot: "hat",
    generation_prompt: "FAIL-STATE-RACE test",
    policy_prompt: "Test policy",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-state-race-runner",
    status: "failed_retryable",
    claimed_at: claimedAt,
    failure_stage: "original-stage",
    failure_reason: "original-failure — must not be overwritten",
    failure_details: { source: "original" },
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT failed_retryable job) failed: ${error.message}`);
  }
}

// ── FAIL-STATE-RACE: already-failed job is immune to concurrent fail calls ────
//
// Two concurrent failGenerationJob calls on a job in 'failed_retryable' state
// must both be silent no-ops. The status pre-check rejects them before any
// UPDATE is attempted. version must remain exactly at initialVersion.

Deno.test(
  "FAIL-STATE-RACE: concurrent failGenerationJob calls on already-failed job — zero writes",
  async (t) => {
    const supabase = getServiceClient();

    // ── retryable = true ──────────────────────────────────────────────────────
    await t.step("retryable=true — version unchanged; all fields intact", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const claimedAt = new Date().toISOString();

      try {
        await insertFailedRetryableJob(supabase, jobId, targetAssetId, claimedAt);

        // Full snapshot BEFORE race — every field is ground truth.
        const before = await readJobRow(supabase, jobId);
        assert(before !== null, "before row must exist");
        assertEquals(before?.status, "failed_retryable", "PRECONDITION: status must be 'failed_retryable'");

        const canonicalClaimedAt = before?.claimed_at as string;
        const initialVersion = before?.version as number;
        const initialRetryCount = before?.retry_count as number;

        // ── Race: two concurrent calls with matching claimed_at ───────────────
        const [resultA, resultB] = await Promise.all([
          failGenerationJob(
            supabase,
            jobId,
            canonicalClaimedAt,
            true,
            "new-stage-A",
            "race-A",
            { source: "race-A" },
          ),
          failGenerationJob(
            supabase,
            jobId,
            canonicalClaimedAt,
            true,
            "new-stage-B",
            "race-B",
            { source: "race-B" },
          ),
        ]);

        // ── 1. Both calls must report no write (status guard blocked them) ───
        assertEquals(resultA.success, false, "race-A must return success=false on non-generating job");
        assertEquals(resultB.success, false, "race-B must return success=false on non-generating job");

        // ── Read final DB state (ground truth) ───────────────────────────────
        const final = await readJobRow(supabase, jobId);
        assert(final !== null, "final row must exist");

        // ── 2. Hard proof: zero writes ────────────────────────────────────────
        assertEquals(
          final?.version,
          initialVersion,
          `version must remain exactly ${initialVersion} — any change proves a write landed on a non-generating job`,
        );

        // ── 3. State integrity ────────────────────────────────────────────────
        assertEquals(
          final?.status,
          before?.status,
          "status must remain unchanged",
        );
        assertEquals(
          final?.failure_reason,
          before?.failure_reason,
          "failure_reason must remain unchanged",
        );
        assertEquals(
          final?.failure_stage,
          before?.failure_stage,
          "failure_stage must remain unchanged",
        );
        assertEquals(
          final?.failure_details,
          before?.failure_details,
          "failure_details must remain unchanged",
        );
        assertEquals(
          final?.completed_at,
          before?.completed_at,
          "completed_at must remain unchanged",
        );

        // ── 4. CAS invariants ─────────────────────────────────────────────────
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
      }
    });

    // ── retryable = false ─────────────────────────────────────────────────────
    await t.step("retryable=false — version unchanged; all fields intact", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const claimedAt = new Date().toISOString();

      try {
        await insertFailedRetryableJob(supabase, jobId, targetAssetId, claimedAt);

        const before = await readJobRow(supabase, jobId);
        assert(before !== null, "before row must exist");
        assertEquals(before?.status, "failed_retryable", "PRECONDITION: status must be 'failed_retryable'");

        const canonicalClaimedAt = before?.claimed_at as string;
        const initialVersion = before?.version as number;
        const initialRetryCount = before?.retry_count as number;

        const [resultA, resultB] = await Promise.all([
          failGenerationJob(
            supabase,
            jobId,
            canonicalClaimedAt,
            false,
            "new-stage-A",
            "race-A",
            { source: "race-A" },
          ),
          failGenerationJob(
            supabase,
            jobId,
            canonicalClaimedAt,
            false,
            "new-stage-B",
            "race-B",
            { source: "race-B" },
          ),
        ]);

        // ── Both calls must report no write (status guard blocked them) ───────
        assertEquals(resultA.success, false, "race-A must return success=false on non-generating job");
        assertEquals(resultB.success, false, "race-B must return success=false on non-generating job");

        const final = await readJobRow(supabase, jobId);
        assert(final !== null, "final row must exist");

        assertEquals(
          final?.version,
          initialVersion,
          `version must remain exactly ${initialVersion} — any change proves a write landed on a non-generating job`,
        );

        assertEquals(
          final?.status,
          before?.status,
          "status must remain unchanged",
        );
        assertEquals(
          final?.failure_reason,
          before?.failure_reason,
          "failure_reason must remain unchanged",
        );
        assertEquals(
          final?.failure_stage,
          before?.failure_stage,
          "failure_stage must remain unchanged",
        );
        assertEquals(
          final?.failure_details,
          before?.failure_details,
          "failure_details must remain unchanged",
        );
        assertEquals(
          final?.completed_at,
          before?.completed_at,
          "completed_at must remain unchanged",
        );

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
      }
    });
  },
);
