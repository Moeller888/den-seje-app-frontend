// Race-safety test for failGenerationJob (FAIL-RACE-1).
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.fail.race.test.ts
//
// What is under test:
//   failGenerationJob guards its UPDATE with:
//     WHERE id = <jobId> AND status = 'generating' AND claimed_at = <token>
//
//   Two concurrent calls race to fail the same generating job using the same
//   valid claimed_at token. The { success: boolean } return value is the primary
//   proof: exactly one call must return success=true. PostgreSQL's row-level
//   locking ensures the second concurrent UPDATE finds no 'generating' row after
//   the first commits — it cannot return affected > 0.
//
// How single-write is proven:
//   Exactly one call returns success=true (1 row affected); the other returns
//   success=false (0 rows). A secondary consistency check (failure_details.source
//   must equal failure_reason) detects split-brain in the failure fields, which
//   can only occur if two writes landed and PostgreSQL merged data from both
//   UPDATE payloads — impossible with proper row-level locking, but verified
//   explicitly here.
//
// Cleanup:
//   Jobs are inserted directly in 'generating' state — no pipeline functions
//   are called, so no avatar_generation_events rows are created. Job rows can
//   be deleted freely in finally.
//
// This test FAILS if:
//   - Both calls return success=true (both writes landed)
//   - Both calls return success=false (no write — impossible with valid inputs)
//   - Either call throws unexpectedly
//   - failure_reason is null or not one of the two tags
//   - failure_details.source does not agree with failure_reason
//   - claimed_at was mutated
//   - retry_count changed from its initial value

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
    generation_prompt: "FAIL-RACE-1 race-safety test",
    policy_prompt: "Test policy",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-race-runner",
    status: "generating",
    claimed_at: claimedAt,
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT generating job) failed: ${error.message}`);
  }
}

// ── FAIL-RACE-1: parallel fail attempts are race-safe ─────────────────────────
//
// Two concurrent failGenerationJob calls with the same valid claimed_at token
// must result in exactly one DB mutation. Exactly one call must return
// success=true; the other must return success=false.

Deno.test(
  "FAIL-RACE-1: parallel fail attempts are race-safe — exactly one success=true",
  async (t) => {
    const supabase = getServiceClient();

    // ── retryable = true ──────────────────────────────────────────────────────
    await t.step("retryable=true — exactly one call wins (success=true); state consistent", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const claimedAt = new Date().toISOString();

      try {
        await insertGeneratingJob(supabase, jobId, targetAssetId, claimedAt);

        // Full snapshot BEFORE race — canonical values for all invariant checks.
        const before = await readJobRow(supabase, jobId);
        assertEquals(before?.status, "generating", "PRECONDITION: status must be 'generating'");
        assert(before?.claimed_at !== null, "PRECONDITION: claimed_at must be set");

        // PostgreSQL may normalise 'Z' to '+00:00' on round-trip — use the
        // canonical value from the DB to avoid spurious timestamp mismatches.
        const canonicalClaimedAt = before?.claimed_at as string;
        const initialRetryCount = before?.retry_count as number;

        // ── Race: same token, distinct failure_reason per caller ─────────────
        const [r1, r2] = await Promise.all([
          failGenerationJob(
            supabase,
            jobId,
            canonicalClaimedAt,
            true,
            "race-stage",
            "race-A",
            { source: "race-A" },
          ),
          failGenerationJob(
            supabase,
            jobId,
            canonicalClaimedAt,
            true,
            "race-stage",
            "race-B",
            { source: "race-B" },
          ),
        ]);

        // ── 1. Primary proof: exactly one write ───────────────────────────────
        // PostgreSQL's status guard ensures the second concurrent UPDATE finds
        // no 'generating' row after the first commits → success=false.
        assert(
          (r1.success && !r2.success) || (!r1.success && r2.success),
          `exactly one call must return success=true; got r1.success=${r1.success} r2.success=${r2.success}`,
        );

        // ── Read final DB state (ground truth) ───────────────────────────────
        const final = await readJobRow(supabase, jobId);
        assert(final !== null, "final row must exist");

        // ── 2. Final state valid ──────────────────────────────────────────────
        const finalStatus = final?.status as string;
        assert(
          finalStatus === "failed_retryable" || finalStatus === "failed_permanent",
          `status must be 'failed_retryable' or 'failed_permanent', got: ${JSON.stringify(finalStatus)}`,
        );
        assert(
          typeof final?.failure_stage === "string" &&
            (final.failure_stage as string).length > 0,
          `failure_stage must be set, got: ${JSON.stringify(final?.failure_stage)}`,
        );
        assert(
          typeof final?.failure_reason === "string" &&
            (final.failure_reason as string).length > 0,
          `failure_reason must be set, got: ${JSON.stringify(final?.failure_reason)}`,
        );

        // ── 3. CAS invariants ─────────────────────────────────────────────────
        assertEquals(
          final?.claimed_at,
          canonicalClaimedAt,
          "claimed_at must remain unchanged — failGenerationJob must never mutate it",
        );
        assertEquals(
          final?.retry_count,
          initialRetryCount,
          `retry_count must be exactly ${initialRetryCount} — failGenerationJob must not change it`,
        );

        // ── 4. Consistency: failure fields agree on one writer ────────────────
        // failure_reason identifies which writer won.
        // failure_details.source must match: a mismatch means fields from two
        // different UPDATE payloads were merged — only possible if both writes
        // landed and PostgreSQL interleaved them (split-brain).
        const reason = final?.failure_reason as string;
        assert(
          reason === "race-A" || reason === "race-B",
          `failure_reason must be exactly "race-A" or "race-B", got: ${JSON.stringify(reason)}`,
        );

        assertEquals(
          final?.failure_stage,
          "race-stage",
          "failure_stage must be 'race-stage'",
        );

        const details = final?.failure_details as Record<string, unknown> | null;
        assertEquals(
          details?.source,
          reason,
          `failure_details.source must match failure_reason "${reason}" — mismatch proves split-brain`,
        );

        assertEquals(
          final?.completed_at,
          null,
          "completed_at must be null for retryable=true",
        );
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── retryable = false ─────────────────────────────────────────────────────
    // This path additionally writes completed_at into the UPDATE payload.
    // The status guard must still prevent a second write from landing.
    await t.step(
      "retryable=false — exactly one call wins (success=true); completed_at set by winner",
      async () => {
        const jobId = crypto.randomUUID();
        const targetAssetId = deriveTargetAssetId("hat", jobId);
        const claimedAt = new Date().toISOString();

        try {
          await insertGeneratingJob(supabase, jobId, targetAssetId, claimedAt);

          const before = await readJobRow(supabase, jobId);
          assertEquals(before?.status, "generating", "PRECONDITION: status must be 'generating'");
          assert(before?.claimed_at !== null, "PRECONDITION: claimed_at must be set");

          const canonicalClaimedAt = before?.claimed_at as string;
          const initialRetryCount = before?.retry_count as number;

          const [r1, r2] = await Promise.all([
            failGenerationJob(
              supabase,
              jobId,
              canonicalClaimedAt,
              false,
              "race-stage",
              "race-A",
              { source: "race-A" },
            ),
            failGenerationJob(
              supabase,
              jobId,
              canonicalClaimedAt,
              false,
              "race-stage",
              "race-B",
              { source: "race-B" },
            ),
          ]);

          // ── 1. Primary proof: exactly one write ───────────────────────────────
          assert(
            (r1.success && !r2.success) || (!r1.success && r2.success),
            `exactly one call must return success=true; got r1.success=${r1.success} r2.success=${r2.success}`,
          );

          const final = await readJobRow(supabase, jobId);
          assert(final !== null, "final row must exist");

          const finalStatus = final?.status as string;
          assert(
            finalStatus === "failed_retryable" || finalStatus === "failed_permanent",
            `status must be 'failed_retryable' or 'failed_permanent', got: ${JSON.stringify(finalStatus)}`,
          );
          assert(
            typeof final?.failure_stage === "string" &&
              (final.failure_stage as string).length > 0,
            `failure_stage must be set, got: ${JSON.stringify(final?.failure_stage)}`,
          );
          assert(
            typeof final?.failure_reason === "string" &&
              (final.failure_reason as string).length > 0,
            `failure_reason must be set, got: ${JSON.stringify(final?.failure_reason)}`,
          );

          assertEquals(
            final?.claimed_at,
            canonicalClaimedAt,
            "claimed_at must remain unchanged — failGenerationJob must never mutate it",
          );
          assertEquals(
            final?.retry_count,
            initialRetryCount,
            `retry_count must be exactly ${initialRetryCount} — failGenerationJob must not change it`,
          );

          const reason = final?.failure_reason as string;
          assert(
            reason === "race-A" || reason === "race-B",
            `failure_reason must be exactly "race-A" or "race-B", got: ${JSON.stringify(reason)}`,
          );

          assertEquals(
            final?.failure_stage,
            "race-stage",
            "failure_stage must be 'race-stage'",
          );

          const details = final?.failure_details as Record<string, unknown> | null;
          assertEquals(
            details?.source,
            reason,
            `failure_details.source must match failure_reason "${reason}" — mismatch proves split-brain`,
          );

          assert(
            typeof final?.completed_at === "string" &&
              !isNaN(Date.parse(final.completed_at as string)),
            `completed_at must be a valid ISO timestamp for retryable=false, got: ${JSON.stringify(final?.completed_at)}`,
          );
        } finally {
          await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
        }
      },
    );
  },
);

// ── FAIL-RETRY-RACE-1: same worker retry must not double-write ────────────────
//
// Models the scenario where a single worker calls failGenerationJob twice
// concurrently on the same job with the same claimed_at token — e.g. a retry
// loop that fires before the first attempt completes. Exactly one write must
// land; fields from both payloads must not be merged (split-brain).

Deno.test("FAIL-RETRY-RACE-1: same worker retry must not double-write", async () => {
  const supabase = getServiceClient();

  const jobId = crypto.randomUUID();
  const targetAssetId = deriveTargetAssetId("hat", jobId);
  const claimedAt = new Date().toISOString();

  try {
    const { error: insertError } = await supabase.from("avatar_generation_jobs").insert({
      id: jobId,
      target_asset_id: targetAssetId,
      slot: "hat",
      generation_prompt: "FAIL-RETRY-RACE-1 test",
      policy_prompt: "Test policy",
      model_provider: "test-provider",
      model_version: "test-v1",
      initiated_by: "test-retry-race-runner",
      status: "generating",
      claimed_at: claimedAt,
      retry_count: 0,
      manual_review_required: false,
    });
    if (insertError) throw new Error(`Test setup failed: ${insertError.message}`);

    const before = await readJobRow(supabase, jobId);
    assert(before !== null, "PRECONDITION: job must exist after insert");

    const canonicalClaimedAt = before.claimed_at as string;
    const initialRetryCount = before.retry_count as number;

    // ── Race: same worker retrying twice concurrently ─────────────────────
    const [r1, r2] = await Promise.all([
      failGenerationJob(
        supabase,
        jobId,
        canonicalClaimedAt,
        true,
        "retry-race",
        "retry-1",
        { attempt: 1 },
      ),
      failGenerationJob(
        supabase,
        jobId,
        canonicalClaimedAt,
        true,
        "retry-race",
        "retry-2",
        { attempt: 2 },
      ),
    ]);

    // ── 1. Exactly one call must win ──────────────────────────────────────
    assert(
      (r1.success && !r2.success) || (!r1.success && r2.success),
      `exactly one call must return success=true; got r1.success=${r1.success} r2.success=${r2.success}`,
    );

    const final = await readJobRow(supabase, jobId);
    assert(final !== null, "final row must exist");

    // ── 2. Status must be failed_* ────────────────────────────────────────
    assert(
      (final.status as string).startsWith("failed"),
      `status must start with 'failed', got: ${JSON.stringify(final.status)}`,
    );

    // ── 3. No split-brain: failure fields must agree on one writer ────────
    const reason = final.failure_reason as string;
    assert(
      reason === "retry-1" || reason === "retry-2",
      `failure_reason must be "retry-1" or "retry-2", got: ${JSON.stringify(reason)}`,
    );

    const details = final.failure_details as Record<string, unknown> | null;
    assert(details !== null, "failure_details must be non-null");
    assert(typeof details.attempt === "number", "failure_details.attempt must be a number");

    const expectedAttempt = reason === "retry-1" ? 1 : 2;
    assertEquals(
      details.attempt,
      expectedAttempt,
      `failure_details.attempt must match failure_reason "${reason}" — mismatch proves split-brain`,
    );

    // ── 4. CAS invariants ─────────────────────────────────────────────────
    assertEquals(
      final.claimed_at,
      canonicalClaimedAt,
      "claimed_at must remain unchanged",
    );
    assertEquals(
      final.retry_count,
      initialRetryCount,
      `retry_count must remain exactly ${initialRetryCount}`,
    );
  } finally {
    await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
  }
});
