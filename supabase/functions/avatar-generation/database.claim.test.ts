// CAS (compare-and-set) claim test for avatar_generation_jobs.
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/database.claim.test.ts
//
// What is under test:
//   claimGenerationJob guards its UPDATE with WHERE status='pending'.
//   Two concurrent callers racing to claim the same job must produce exactly
//   one winner (non-null return) and one loser (null return, 0 rows updated).
//   PostgreSQL row-level locking serialises the two UPDATEs: the loser finds
//   status='generating' after the winner commits and matches 0 rows.
//
//   Unlike completeGenerationJob (which throws on CAS miss), claimGenerationJob
//   returns null silently — both promises always fulfill; the loser is
//   identified by its null return value, not by a caught exception.
//
// Cleanup:
//   No pipeline functions are called, so no avatar_generation_events rows are
//   created. The job row can be deleted freely in finally.
//
// Invariant under test:
//   CLAIM-1: Parallel claim attempts are race-safe — exactly one worker claims
//            a pending job; the DB ends in a single consistent 'generating'
//            state with exactly one claimed_at timestamp.

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import { claimGenerationJob, deriveTargetAssetId } from "./database.ts";
import type { SupabaseClient } from "./supabase.ts";
import type { GenerationJobRecord } from "./types.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

async function insertPendingJob(
  supabase: SupabaseClient,
  jobId: string,
  targetAssetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_generation_jobs").insert({
    id: jobId,
    target_asset_id: targetAssetId,
    slot: "hat",
    generation_prompt: "CAS claim race test job",
    policy_prompt: "Test policy — no copyright infringement",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-claim-runner",
    status: "pending",
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`Test setup (INSERT pending job) failed: ${error.message}`);
  }
}

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

// ── CLAIM-1: Parallel claim attempts are race-safe ────────────────────────────
// Proves: two concurrent claimGenerationJob calls cannot both succeed.
// Proves: DB ends up in a single consistent 'generating' state with one
//         claimed_at value — no double-claim, no split brain.
//
// This test FAILS if claimGenerationJob is missing the WHERE status='pending'
// guard: without it both UPDATEs match, both return non-null, successes === 2.

Deno.test(
  "CLAIM-1: parallel claim attempts are race-safe — exactly one worker claims the job",
  async () => {
    const supabase = getServiceClient();

    const jobId = crypto.randomUUID();
    const targetAssetId = deriveTargetAssetId("hat", jobId);

    try {
      // ── Step 1: Insert job in 'pending' state ─────────────────────────────
      await insertPendingJob(supabase, jobId, targetAssetId);

      // Confirm precondition directly from DB — do not trust the INSERT return.
      // Also captures a pre-race snapshot of every column claimGenerationJob must
      // NOT touch. Compared against DB state after the race in Step 4.
      const preconditionRow = await readJobRow(supabase, jobId);
      assertEquals(
        preconditionRow?.status,
        "pending",
        "PRECONDITION: job must start in 'pending' state",
      );
      assertEquals(
        preconditionRow?.claimed_at,
        null,
        "PRECONDITION: claimed_at must be null before any claim attempt",
      );

      // Declare what claimGenerationJob is PERMITTED to mutate.
      // Everything else is automatically protected — no manual field list needed.
      // Adding a column to the schema makes it immutable by default; only an
      // explicit entry here can exempt it from the snapshot check.
      const CLAIM_MUTATED_FIELDS = new Set(["status", "claimed_at"]);

      // ── Step 2: Race two claim attempts in parallel ───────────────────────
      // claimGenerationJob returns a GenerationJobRecord on success, or null
      // when the WHERE status='pending' predicate matches 0 rows (CAS miss).
      // It only throws on a real DB/network error — never on a CAS miss.
      //
      // Outcome encoding:
      //   ok: true  → winner, job is the claimed record
      //   ok: false, error: undefined → loser, null return (expected CAS miss)
      //   ok: false, error: unknown  → unexpected DB error (test must fail)
      type ClaimOutcome =
        | { ok: true; job: GenerationJobRecord }
        | { ok: false; job: null; error?: unknown };

      const [outcome1, outcome2] = await Promise.all([
        claimGenerationJob(supabase, jobId)
          .then((job): ClaimOutcome =>
            job !== null ? { ok: true, job } : { ok: false, job: null }
          )
          .catch((e: unknown): ClaimOutcome => ({ ok: false, job: null, error: e })),
        claimGenerationJob(supabase, jobId)
          .then((job): ClaimOutcome =>
            job !== null ? { ok: true, job } : { ok: false, job: null }
          )
          .catch((e: unknown): ClaimOutcome => ({ ok: false, job: null, error: e })),
      ]);

      // Surface unexpected DB errors before count assertions — a network or auth
      // error is not a CAS miss and must not be silently counted as a "failure".
      for (const outcome of [outcome1, outcome2]) {
        if (!outcome.ok && outcome.error !== undefined) {
          throw new Error(
            `claimGenerationJob threw unexpectedly (expected null return, not an exception): ${
              outcome.error instanceof Error
                ? outcome.error.message
                : String(outcome.error)
            }`,
          );
        }
      }

      // Exactly one must have received a non-null job; the other must have seen null.
      const successes = [outcome1, outcome2].filter((o) => o.ok).length;
      const failures = [outcome1, outcome2].filter((o) => !o.ok).length;
      assertEquals(
        successes,
        1,
        `Exactly one claim must succeed (got ${successes} successes, ${failures} null-returns) — WHERE status='pending' CAS guard may be missing`,
      );
      assertEquals(
        failures,
        1,
        `Exactly one claim must be rejected with null (got ${successes} successes, ${failures} null-returns)`,
      );

      // ── Step 3: Verify the winner's returned job record ───────────────────
      const winner = [outcome1, outcome2].find((o) => o.ok) as {
        ok: true;
        job: GenerationJobRecord;
      };

      assertEquals(
        winner.job.status,
        "generating",
        "Winner's returned job must have status 'generating'",
      );
      assert(
        typeof winner.job.claimed_at === "string" &&
          winner.job.claimed_at.length > 0,
        "Winner's returned job must have a non-empty claimed_at string",
      );
      assert(
        !isNaN(Date.parse(winner.job.claimed_at!)),
        `Winner's claimed_at must be a parseable ISO timestamp, got: ${winner.job.claimed_at}`,
      );

      // ── Step 4: Read final DB state — ground truth ────────────────────────
      const finalRow = await readJobRow(supabase, jobId);

      // Status must be 'generating' — exactly one claim landed.
      assertEquals(
        finalRow?.status,
        "generating",
        "DB status must be 'generating' after the race",
      );

      // claimed_at must be set and parseable.
      assert(
        typeof finalRow?.claimed_at === "string" &&
          (finalRow.claimed_at as string).length > 0,
        "DB claimed_at must be a non-empty string after the race",
      );
      assert(
        !isNaN(Date.parse(finalRow?.claimed_at as string)),
        `DB claimed_at must be a parseable ISO timestamp, got: ${JSON.stringify(finalRow?.claimed_at)}`,
      );

      // The winner's in-memory claimed_at must match the DB value.
      // PostgreSQL may return '+00:00' instead of 'Z' for TIMESTAMPTZ;
      // compare by numeric millisecond value rather than string equality.
      assertEquals(
        new Date(winner.job.claimed_at!).getTime(),
        new Date(finalRow?.claimed_at as string).getTime(),
        "Winner's claimed_at must match the DB-stored value (timestamp value, not string equality)",
      );

      // ── Exhaustive snapshot comparison ────────────────────────────────────
      // Derive the full column set from both snapshots so schema additions are
      // automatically covered without touching this test. For every column not
      // in CLAIM_MUTATED_FIELDS, the post-race value must be identical to the
      // pre-race value. Catches: trigger side effects, partial writes from the
      // losing caller, and any buggy mutation of an unrelated column.
      //
      // Edge-case notes:
      //   JSON/JSONB columns  — assertEquals uses deep structural equality; no
      //                         special handling needed.
      //   Timestamp columns   — both reads use the same client and format; string
      //                         equality is safe for non-mutated timestamps.
      //   null vs undefined   — Supabase client always returns null (never
      //                         undefined) for absent DB values; assertEquals
      //                         distinguishes them, which is intentional.
      //   New nullable column — arrives as null in both snapshots; equality holds
      //                         automatically without any test change.
      //
      // NOTE: Does NOT prove only one write occurred — that requires an
      //       updated_at column or event log. It proves no UNINTENDED columns
      //       were mutated.
      const allFields = new Set([
        ...Object.keys(preconditionRow ?? {}),
        ...Object.keys(finalRow ?? {}),
      ]);
      for (const field of allFields) {
        if (CLAIM_MUTATED_FIELDS.has(field)) continue;
        assertEquals(
          finalRow?.[field],
          preconditionRow?.[field],
          `Field '${field}' must not be mutated during the claim race`,
        );
      }

      // ── Step 5: Third-claim guard ─────────────────────────────────────────
      // A third claim attempt after the race must return null — the job is
      // already 'generating', so WHERE status='pending' matches 0 rows.
      // This proves the CAS lock held: no second claim slipped through and
      // no concurrent write left the job in an unexpectedly re-claimable state.
      assertEquals(finalRow?.status, "generating", "Job must be in 'generating' state after claim");
      const thirdClaim = await claimGenerationJob(supabase, jobId);
      assertEquals(
        thirdClaim,
        null,
        "A third claim attempt must return null — job is 'generating', CAS lock must hold after the race",
      );
    } finally {
      // No pipeline was run, so no avatar_generation_events rows were created.
      // The job row can be deleted directly without FK interference.
      await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
    }
  },
);

// ── CLAIM-2 helpers ───────────────────────────────────────────────────────────
// Minimal FK dependencies for inserting a 'complete' job row. Validation run
// rows are permanent artifacts (prevent_validation_run_modification blocks DELETE).

async function insertMinimalAssetForClaim(
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
      audit: { created_by: "test-claim-runner", created_at: now },
    },
    created_by: "test-claim-runner",
    last_modified_by: "test-claim-runner",
  });
  if (error) {
    throw new Error(`Test setup (INSERT avatar_assets) failed: ${error.message}`);
  }
}

async function insertMinimalValidationRunForClaim(
  supabase: SupabaseClient,
  runId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_asset_validation_runs").insert({
    id: runId,
    asset_id: assetId,
    triggered_by: "test-claim-runner",
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

// ── CLAIM-2: Job cannot be claimed unless status = 'pending' ─────────────────
// Proves: the WHERE status='pending' guard in claimGenerationJob rejects calls
//         against any non-pending job, returns null, and leaves the DB unchanged.
//
// Each sub-case inserts a job directly in the target status, takes a full
// pre-call snapshot, calls claimGenerationJob, then asserts:
//   1. result === null
//   2. every DB column is identical to the pre-call snapshot — no mutation at all
//
// The snapshot comparison is total (no exemptions): unlike CLAIM-1 where status
// and claimed_at are permitted to change, here NOTHING is permitted to change.
//
// This test FAILS if claimGenerationJob's status guard is removed, because the
// UPDATE would then match and mutate 'generating'/'complete'/'failed_*' rows.

Deno.test(
  "CLAIM-2: job cannot be claimed unless status = 'pending'",
  async (t) => {
    const supabase = getServiceClient();
    const now = new Date().toISOString();

    // Asserts every column is identical between two snapshots.
    // Used where zero mutations are permitted — not even status or claimed_at.
    // Keys are derived dynamically so new schema columns are covered automatically.
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
          `[${label}] Field '${field}' must not be mutated by a rejected claim`,
        );
      }
    }

    // ── Case: generating ──────────────────────────────────────────────────────
    // Realistic state: another worker already holds the claim (claimed_at set).
    await t.step("status='generating' — active claim must block re-claim", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "CLAIM-2 test — generating state",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-claim-runner",
          status: "generating",
          claimed_at: now,
          retry_count: 0,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        const result = await claimGenerationJob(supabase, jobId);
        const after = await readJobRow(supabase, jobId);

        assertEquals(result, null, "Claim on 'generating' job must return null");
        assertNoMutation(before, after, "generating");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── Case: complete ────────────────────────────────────────────────────────
    // Terminal state. Requires FK rows (resulting_asset_id → avatar_assets,
    // onboarding_validation_run_id → avatar_asset_validation_runs).
    // Validation run and asset become permanent artifacts (see file header).
    await t.step("status='complete' — terminal job must not be re-claimed", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      const runId = crypto.randomUUID();
      try {
        await insertMinimalAssetForClaim(supabase, targetAssetId);
        await insertMinimalValidationRunForClaim(supabase, runId, targetAssetId);

        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "CLAIM-2 test — complete state",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-claim-runner",
          status: "complete",
          claimed_at: now,
          completed_at: now,
          resulting_asset_id: targetAssetId,
          onboarding_validation_run_id: runId,
          retry_count: 0,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        const result = await claimGenerationJob(supabase, jobId);
        const after = await readJobRow(supabase, jobId);

        assertEquals(result, null, "Claim on 'complete' job must return null");
        assertNoMutation(before, after, "complete");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
        // Validation run and asset are permanent artifacts — swallow FK errors.
        await supabase.from("avatar_asset_validation_runs").delete().eq("id", runId);
        await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
      }
    });

    // ── Case: failed_retryable ────────────────────────────────────────────────
    // Job failed but is eligible for retry via resetJobForRetry — not by a direct
    // claim. claimGenerationJob must return null without touching any column.
    await t.step("status='failed_retryable' — must not be directly re-claimed", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "CLAIM-2 test — failed_retryable state",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-claim-runner",
          status: "failed_retryable",
          claimed_at: now,
          failure_stage: "test-stage",
          failure_reason: "CLAIM-2 setup — simulated retryable failure",
          retry_count: 1,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        const result = await claimGenerationJob(supabase, jobId);
        const after = await readJobRow(supabase, jobId);

        assertEquals(result, null, "Claim on 'failed_retryable' job must return null");
        assertNoMutation(before, after, "failed_retryable");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });

    // ── Case: failed_permanent ────────────────────────────────────────────────
    // Terminal failure — permanently blocked. No re-claim or retry is ever valid.
    await t.step("status='failed_permanent' — permanently blocked job must not be re-claimed", async () => {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId("hat", jobId);
      try {
        const { error } = await supabase.from("avatar_generation_jobs").insert({
          id: jobId,
          target_asset_id: targetAssetId,
          slot: "hat",
          generation_prompt: "CLAIM-2 test — failed_permanent state",
          policy_prompt: "Test policy",
          model_provider: "test-provider",
          model_version: "test-v1",
          initiated_by: "test-claim-runner",
          status: "failed_permanent",
          claimed_at: now,
          completed_at: now,
          failure_stage: "test-stage",
          failure_reason: "CLAIM-2 setup — simulated permanent failure",
          retry_count: 3,
          manual_review_required: false,
        });
        if (error) throw new Error(`Setup failed: ${error.message}`);

        const before = await readJobRow(supabase, jobId);
        const result = await claimGenerationJob(supabase, jobId);
        const after = await readJobRow(supabase, jobId);

        assertEquals(result, null, "Claim on 'failed_permanent' job must return null");
        assertNoMutation(before, after, "failed_permanent");
      } finally {
        await supabase.from("avatar_generation_jobs").delete().eq("id", jobId);
      }
    });
  },
);
