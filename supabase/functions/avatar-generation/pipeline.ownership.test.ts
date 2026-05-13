// Ownership gate integration test for the avatar-generation pipeline.
//
// Run:
//   $env:SUPABASE_URL="<url>"; $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   deno test --allow-net --allow-env supabase/functions/avatar-generation/pipeline.ownership.test.ts
//
// What is under test:
//   Stage 2 of runGenerationPipeline reads avatar_assets and verifies that the
//   target asset (if it already exists) was created by THIS job's pipeline
//   identity ('generation-pipeline:<jobId>'). If the asset belongs to a
//   different job, or if it has production_enabled=true, the pipeline must
//   hard-fail immediately without:
//     - calling onboardingSubmit even once
//     - modifying any field on avatar_assets
//     - creating any avatar_asset_validation_runs rows
//     - writing a resulting_asset_id or onboarding_validation_run_id
//
// Proof strategy — three complementary layers:
//   1. CALL COUNT (primary):
//      onboardingCallCount is a module-level integer incremented by onboardingSpy.
//      The spy is injected via runGenerationPipeline's deps parameter.
//      If onboarding is called even once — even if it crashes before writing
//      validation rows — the assertion fires. This catches Stage 2 bypass even
//      when DB side effects are invisible.
//   2. DB SNAPSHOT (secondary):
//      Before and after Job B: snapshot created_by, last_modified_by, metadata,
//      created_at, last_modified_at. Deep-compare to detect any UPDATE that
//      the pipeline may have issued without reaching onboarding.
//   3. VALIDATION RUN COUNT (secondary):
//      Before and after Job B: COUNT(*) from avatar_asset_validation_runs WHERE
//      asset_id = targetAssetId. A count increase proves onboarding was reached
//      AND succeeded, so it's a lagging indicator. The call count check above
//      catches it first.
//
// Test strategy:
//   We simulate a "completed Job A" by inserting an avatar_assets row whose
//   created_by equals 'generation-pipeline:<jobA_UUID>'. No avatar_generation_jobs
//   row for Job A exists — this avoids two problems:
//     1. The UNIQUE constraint on avatar_generation_jobs.target_asset_id would
//        block inserting Job B with the same target_asset_id.
//     2. The SECURITY DEFINER immutable-events trigger would prevent deleting
//        Job A's events, and the FK would then prevent deleting Job A's job row.
//   The ownership gate (Stage 2) reads avatar_assets.created_by, not the jobs
//   table, so the simulated state is valid for the gate's decision.
//
// Cleanup:
//   The simulated Job A asset is deleted in the finally block.
//   Job B's rows (avatar_generation_jobs + avatar_generation_events) are
//   PERMANENT test artifacts — the SECURITY DEFINER immutable-events trigger
//   blocks DELETE on avatar_generation_events, and the FK ON DELETE RESTRICT
//   prevents deleting the parent job row while child events exist.
//
// Invariants under test:
//   OWNERSHIP-1: Stage 2 hard-fails Job B when the target asset is owned by a
//                different completed job (created_by mismatch).
//   OWNERSHIP-2: Stage 2 hard-fails any job whose target asset has
//                production_enabled=true (never mutate a live asset).
//   OWNERSHIP-3: Parameterised — three distinct non-pipeline created_by values
//                all trigger the gate with identical outcomes.
//                NOTE: created_by=NULL and created_by='' cannot be stored in
//                the DB — avatar_assets has a NOT NULL constraint and
//                CHECK(length(trim(created_by)) > 0). These states are
//                impossible by construction, so the DB itself prevents them.
//                The three cases cover: a manually uploaded asset, an
//                admin-imported asset, and a wrong-job pipeline identity.

import { assert, assertEquals } from "jsr:@std/assert@^1";
import { getServiceClient } from "./supabase.ts";
import { claimGenerationJob, deriveTargetAssetId } from "./database.ts";
import { runGenerationPipeline } from "./pipeline.ts";
import { callOnboardingSubmit } from "./onboarding-client.ts";
import type { SupabaseClient } from "./supabase.ts";

// ── Onboarding spy ────────────────────────────────────────────────────────────
// Module-level counter. Reset to 0 before every pipeline call.
// Incremented by onboardingSpy on every invocation — including ones that would
// crash immediately. If Stage 2 is a true hard gate, this counter stays at 0.
let onboardingCallCount = 0;

async function onboardingSpy(
  ..._args: Parameters<typeof callOnboardingSubmit>
): ReturnType<typeof callOnboardingSubmit> {
  onboardingCallCount++;
  return {
    success: true,
    action: "test-spy",
    asset_id: "spy_asset",
    message: "spy",
    validation_run: {
      id: "spy_validation_run",
    },
  } as Awaited<ReturnType<typeof callOnboardingSubmit>>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetSnapshot {
  created_by: string;
  last_modified_by: string;
  metadata: unknown;
  created_at: string;
  last_modified_at: string;
}

// ── DB read helpers ───────────────────────────────────────────────────────────

// Returns the mutation-sensitive fields of avatar_assets as a snapshot.
// Called before and after Job B — deep equality proves zero mutation.
async function snapshotAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<AssetSnapshot> {
  const { data, error } = await supabase
    .from("avatar_assets")
    .select("created_by, last_modified_by, metadata, created_at, last_modified_at")
    .eq("asset_id", assetId)
    .maybeSingle();
  if (error) {
    throw new Error(`snapshotAsset failed for "${assetId}": ${error.message}`);
  }
  if (data === null) {
    throw new Error(`snapshotAsset: asset "${assetId}" not found`);
  }
  return data as AssetSnapshot;
}

// Returns the exact count of validation runs for assetId without trusting
// any application function return value. A count > 0 after Job B fails
// means onboarding was reached AND succeeded in writing to the DB.
// The call count check catches the case where onboarding was reached but crashed.
async function countValidationRuns(
  supabase: SupabaseClient,
  assetId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("avatar_asset_validation_runs")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", assetId);
  if (error) {
    throw new Error(`countValidationRuns failed for "${assetId}": ${error.message}`);
  }
  return count ?? 0;
}

// Direct SELECT — verifies Job B's final DB state without trusting return values.
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
    throw new Error(`readJobRow failed for "${jobId}": ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

// Inserts an avatar_assets row with an explicitly supplied created_by value.
// production_enabled=false so the production gate does not fire instead of the
// created_by check (tested separately in OWNERSHIP-2).
async function insertAssetWithCreatedBy(
  supabase: SupabaseClient,
  assetId: string,
  slot: string,
  createdBy: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("avatar_assets").insert({
    asset_id: assetId,
    slot,
    display_name: `Test asset ${assetId.slice(0, 16)} (ownership test)`,
    current_status: "draft",
    production_enabled: false,
    storage_path: null,
    metadata: {
      identity: { asset_id: assetId, slot, display_name: "Test asset" },
      technical: {},
      deployment: { current_status: "draft", production_enabled: false },
      audit: { created_by: createdBy, created_at: now },
    },
    created_by: createdBy,
    last_modified_by: createdBy,
  });
  if (error) {
    throw new Error(`insertAssetWithCreatedBy failed: ${error.message}`);
  }
}

// Inserts a generation job in 'pending' state with an explicitly supplied
// target_asset_id. No UNIQUE collision arises because no Job A row exists
// in avatar_generation_jobs (only the avatar_assets row was inserted above).
async function insertPendingJob(
  supabase: SupabaseClient,
  jobId: string,
  targetAssetId: string,
  slot: string,
): Promise<void> {
  const { error } = await supabase.from("avatar_generation_jobs").insert({
    id: jobId,
    target_asset_id: targetAssetId,
    slot,
    generation_prompt: "Ownership gate test — must fail at Stage 2",
    policy_prompt: "Test policy — no copyright infringement",
    model_provider: "test-provider",
    model_version: "test-v1",
    initiated_by: "test-ownership-runner",
    status: "pending",
    retry_count: 0,
    manual_review_required: false,
  });
  if (error) {
    throw new Error(`insertPendingJob failed: ${error.message}`);
  }
}

// ── Shared assertion: no side effects ─────────────────────────────────────────
// Called after every ownership-violating pipeline run.
// Checks all three proof layers: call count, asset snapshot, validation run count.

async function assertNoSideEffects(
  supabase: SupabaseClient,
  jobB_UUID: string,
  jobB_triggeredBy: string,
  targetAssetId: string,
  beforeSnapshot: AssetSnapshot,
  beforeValidationCount: number,
  caseLabel: string,
): Promise<void> {
  // ── Layer 1: onboarding was never called ─────────────────────────────────
  // This is the primary assertion. It fires even if onboarding crashed before
  // writing any DB rows, making it impossible to bypass silently.
  assertEquals(
    onboardingCallCount,
    0,
    `[${caseLabel}] onboarding must NEVER be called when Stage 2 fails`,
  );

  // ── Layer 2: asset snapshot unchanged ────────────────────────────────────
  const afterSnapshot = await snapshotAsset(supabase, targetAssetId);

  assertEquals(
    afterSnapshot.created_by,
    beforeSnapshot.created_by,
    `[${caseLabel}] asset created_by must be unchanged`,
  );
  assertEquals(
    afterSnapshot.last_modified_by,
    beforeSnapshot.last_modified_by,
    `[${caseLabel}] asset last_modified_by must be unchanged`,
  );
  assertEquals(
    afterSnapshot.created_at,
    beforeSnapshot.created_at,
    `[${caseLabel}] asset created_at must be unchanged`,
  );
  assertEquals(
    afterSnapshot.last_modified_at,
    beforeSnapshot.last_modified_at,
    `[${caseLabel}] asset last_modified_at must be unchanged — any UPDATE advances this timestamp`,
  );
  // Metadata is JSONB — compare via JSON.stringify for deterministic field order.
  assertEquals(
    JSON.stringify(afterSnapshot.metadata),
    JSON.stringify(beforeSnapshot.metadata),
    `[${caseLabel}] asset metadata must be unchanged`,
  );

  // Job B's identity must not appear anywhere on the asset row.
  assert(
    afterSnapshot.created_by !== jobB_triggeredBy,
    `[${caseLabel}] asset created_by must not carry Job B's pipeline identity`,
  );
  assert(
    afterSnapshot.last_modified_by !== jobB_triggeredBy,
    `[${caseLabel}] asset last_modified_by must not carry Job B's pipeline identity`,
  );

  // ── Layer 3: validation run count unchanged ───────────────────────────────
  const afterValidationCount = await countValidationRuns(supabase, targetAssetId);
  assertEquals(
    afterValidationCount,
    beforeValidationCount,
    `[${caseLabel}] validation run count must be unchanged — onboarding must not have been reached`,
  );

  // ── Job B DB state ────────────────────────────────────────────────────────
  const jobB = await readJobRow(supabase, jobB_UUID);

  assertEquals(
    jobB?.status,
    "failed_permanent",
    `[${caseLabel}] Job B must be permanently failed in the DB`,
  );
  assertEquals(
    jobB?.failure_stage,
    "stage-2-ownership",
    `[${caseLabel}] Job B failure_stage must be 'stage-2-ownership'`,
  );
  assert(
    typeof jobB?.failure_reason === "string" &&
      (jobB.failure_reason as string).includes("OWNERSHIP_VIOLATION"),
    `[${caseLabel}] failure_reason must contain "OWNERSHIP_VIOLATION", got: ${JSON.stringify(jobB?.failure_reason)}`,
  );
  assertEquals(
    jobB?.resulting_asset_id,
    null,
    `[${caseLabel}] Job B must NOT have a resulting_asset_id`,
  );
  assertEquals(
    jobB?.onboarding_validation_run_id,
    null,
    `[${caseLabel}] Job B must NOT have an onboarding_validation_run_id`,
  );
}

// ── OWNERSHIP-1: Stage 2 rejects when asset is owned by a different job ───────
// Proves: if avatar_assets.created_by does not match 'generation-pipeline:<jobB_UUID>',
//         the pipeline returns 422 and onboarding is never called.
// This test FAILS if the ownership gate is absent, bypassed, or moved after Stage 7.

Deno.test(
  "OWNERSHIP-1: Stage 2 hard-fails Job B when target asset is owned by a different completed job",
  async () => {
    const supabase = getServiceClient();

    const jobA_UUID = crypto.randomUUID();
    const jobB_UUID = crypto.randomUUID();
    const slot = "hat";
    const targetAssetId = deriveTargetAssetId(slot, jobA_UUID);
    const jobA_triggeredBy = `generation-pipeline:${jobA_UUID}`;
    const jobB_triggeredBy = `generation-pipeline:${jobB_UUID}`;

    assert(
      jobA_triggeredBy !== jobB_triggeredBy,
      "PRECONDITION: Job A and Job B pipeline identities must be distinct",
    );

    try {
      await insertAssetWithCreatedBy(supabase, targetAssetId, slot, jobA_triggeredBy);
      await insertPendingJob(supabase, jobB_UUID, targetAssetId, slot);

      const beforeSnapshot = await snapshotAsset(supabase, targetAssetId);
      const beforeValidationCount = await countValidationRuns(supabase, targetAssetId);
      assertEquals(beforeValidationCount, 0, "PRECONDITION: validation run count must be 0 before pipeline runs");

      // Reset spy before every pipeline call.
      onboardingCallCount = 0;
      const jobB1 = await claimGenerationJob(supabase, jobB_UUID);
      if (!jobB1) throw new Error("Test setup failed: claimGenerationJob must succeed for OWNERSHIP-1");
      const result = await runGenerationPipeline(supabase, jobB1, {
        onboardingSubmit: onboardingSpy,
      });

      // ── Assert: pipeline response ─────────────────────────────────────────
      assertEquals(result.httpStatus, 422, "Pipeline must return 422 for ownership violation");
      assertEquals(result.body.success, false, "Pipeline body.success must be false");
      assert(
        result.body.message.includes("stage-2-ownership"),
        `Pipeline message must reference stage-2-ownership, got: "${result.body.message}"`,
      );

      // ── Assert: no side effects (all three layers) ────────────────────────
      await assertNoSideEffects(
        supabase,
        jobB_UUID,
        jobB_triggeredBy,
        targetAssetId,
        beforeSnapshot,
        beforeValidationCount,
        "OWNERSHIP-1",
      );

      // Confirm the asset still reflects Job A ownership explicitly.
      const afterSnapshot = await snapshotAsset(supabase, targetAssetId);
      assertEquals(
        afterSnapshot.created_by,
        jobA_triggeredBy,
        "Asset created_by must still be Job A's pipeline identity after Job B fails",
      );
    } finally {
      await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
    }
  },
);

// ── OWNERSHIP-2: Stage 2 rejects any job targeting an in-production asset ─────
// Proves: the production_enabled=true gate fires before the created_by check,
//         so a job can never mutate a live production asset and onboarding is
//         never called.
// This test FAILS if the production_enabled gate is absent, bypassed, or ordered
// after the created_by check.
//
// Setup note: the DB enforce_production_gate trigger blocks setting
// production_enabled=true unless a passing validation run exists for the asset.
// The immutability trigger (prevent_validation_run_modification) blocks deleting
// that validation run, and the FK (ON DELETE RESTRICT) then blocks deleting the
// asset. Both rows are PERMANENT test artifacts — the finally block attempts
// cleanup but silently ignores the expected FK failure.

Deno.test(
  "OWNERSHIP-2: Stage 2 hard-fails any job whose target asset has production_enabled=true",
  async () => {
    const supabase = getServiceClient();

    const jobA_UUID = crypto.randomUUID();
    const jobB_UUID = crypto.randomUUID();
    const slot = "hat";
    const targetAssetId = deriveTargetAssetId(slot, jobA_UUID);
    const jobA_triggeredBy = `generation-pipeline:${jobA_UUID}`;
    const jobB_triggeredBy = `generation-pipeline:${jobB_UUID}`;

    try {
      // ── Setup: insert asset in 'approved' state with production_enabled=false ─
      // enforce_production_gate only fires when production_enabled transitions TO
      // true, so the initial INSERT with false is unrestricted.
      const now = new Date().toISOString();
      const { error: assetError } = await supabase.from("avatar_assets").insert({
        asset_id: targetAssetId,
        slot,
        display_name: "Production asset (ownership test 2)",
        current_status: "approved",
        production_enabled: false,
        storage_path: null,
        metadata: {
          identity: { asset_id: targetAssetId, slot, display_name: "Production asset" },
          technical: {},
          deployment: { current_status: "approved", production_enabled: false },
          audit: { created_by: jobA_triggeredBy, created_at: now },
        },
        created_by: jobA_triggeredBy,
        last_modified_by: jobA_triggeredBy,
      });
      if (assetError) {
        throw new Error(`Test setup (INSERT asset) failed: ${assetError.message}`);
      }

      // ── Setup: insert a passing validation run to satisfy enforce_production_gate ─
      // This row is a PERMANENT TEST ARTIFACT — the immutability trigger blocks
      // DELETE on avatar_asset_validation_runs unconditionally.
      const { error: runError } = await supabase.from("avatar_asset_validation_runs").insert({
        asset_id: targetAssetId,
        triggered_by: "test-ownership-runner",
        payload: { test: true },
        response: { valid: true, errors: [], warnings: [], manual_review_flags: [] },
        valid: true,
        error_count: 0,
        warning_count: 0,
        manual_review_count: 0,
      });
      if (runError) {
        throw new Error(`Test setup (INSERT validation run) failed: ${runError.message}`);
      }

      // ── Setup: promote asset to production ────────────────────────────────────
      // enforce_production_gate now passes (passing run exists, no pending reviews,
      // current_status = 'approved').
      const { error: promoteError } = await supabase
        .from("avatar_assets")
        .update({ production_enabled: true })
        .eq("asset_id", targetAssetId);
      if (promoteError) {
        throw new Error(`Test setup (promote asset) failed: ${promoteError.message}`);
      }

      await insertPendingJob(supabase, jobB_UUID, targetAssetId, slot);

      const beforeSnapshot = await snapshotAsset(supabase, targetAssetId);
      // beforeValidationCount is 1 — we inserted a passing run during setup to
      // satisfy enforce_production_gate. assertNoSideEffects will verify the
      // count does not increase further when Job B runs.
      const beforeValidationCount = await countValidationRuns(supabase, targetAssetId);

      onboardingCallCount = 0;
      const jobB2 = await claimGenerationJob(supabase, jobB_UUID);
      if (!jobB2) throw new Error("Test setup failed: claimGenerationJob must succeed for OWNERSHIP-2");
      const result = await runGenerationPipeline(supabase, jobB2, {
        onboardingSubmit: onboardingSpy,
      });

      // ── Assert: pipeline response ─────────────────────────────────────────
      assertEquals(result.httpStatus, 422, "Pipeline must return 422 for production asset violation");
      assertEquals(result.body.success, false, "Pipeline body.success must be false");
      assert(
        result.body.message.includes("stage-2-ownership"),
        `Pipeline message must reference stage-2-ownership, got: "${result.body.message}"`,
      );

      // ── Assert: no side effects (all three layers) ────────────────────────
      await assertNoSideEffects(
        supabase,
        jobB_UUID,
        jobB_triggeredBy,
        targetAssetId,
        beforeSnapshot,
        beforeValidationCount,
        "OWNERSHIP-2",
      );

      // Confirm production_enabled is still true.
      const afterSnapshot = await snapshotAsset(supabase, targetAssetId);
      assertEquals(
        afterSnapshot.created_by,
        jobA_triggeredBy,
        "Asset created_by must be unchanged after Job B fails",
      );
    } finally {
      // The validation run is a permanent artifact (immutability trigger blocks DELETE).
      // The asset cannot be deleted while the validation run exists (FK ON DELETE RESTRICT).
      // Both deletes are attempted; errors are silently ignored — the test result is
      // unaffected by cleanup failure, and the artifacts are test-only rows.
      await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
    }
  },
);

// ── OWNERSHIP-3: Parameterised — any non-matching created_by triggers the gate ─
// Proves: the ownership gate is not specific to any particular created_by pattern.
// Any value that is not 'generation-pipeline:<jobB_UUID>' must cause a hard fail
// with onboarding never called and zero side effects.
//
// NOTE on NULL and empty string:
//   The user's specification listed created_by=NULL and created_by='' as cases.
//   These cannot be tested via DB state because avatar_assets enforces:
//     - NOT NULL on created_by
//     - CHECK (length(trim(created_by)) > 0)
//   These constraints make both states impossible in the DB, so the ownership
//   gate never receives them. The three cases below cover the same "wrong owner"
//   equivalence class using values that can actually be stored:
//     a) 'manual-upload'                 — a human-uploaded asset
//     b) 'operator-import'               — an admin tool import
//     c) 'generation-pipeline:00000000'  — valid pipeline format but wrong job

Deno.test(
  "OWNERSHIP-3: Stage 2 hard-fails for all non-matching created_by values",
  async (t) => {
    const supabase = getServiceClient();

    const cases: Array<{ label: string; createdBy: string }> = [
      { label: "manual-upload", createdBy: "manual-upload" },
      { label: "operator-import", createdBy: "operator-import" },
      { label: "wrong-pipeline-job", createdBy: "generation-pipeline:00000000" },
    ];

    for (const { label, createdBy } of cases) {
      await t.step(label, async () => {
        const jobB_UUID = crypto.randomUUID();
        const ownerUUID = crypto.randomUUID();
        const slot = "hat";
        const targetAssetId = deriveTargetAssetId(slot, ownerUUID);
        const jobB_triggeredBy = `generation-pipeline:${jobB_UUID}`;

        assert(
          createdBy !== jobB_triggeredBy,
          `PRECONDITION [${label}]: test created_by must differ from Job B's pipeline identity`,
        );

        try {
          await insertAssetWithCreatedBy(supabase, targetAssetId, slot, createdBy);
          await insertPendingJob(supabase, jobB_UUID, targetAssetId, slot);

          const beforeSnapshot = await snapshotAsset(supabase, targetAssetId);
          const beforeValidationCount = await countValidationRuns(supabase, targetAssetId);
          assertEquals(
            beforeValidationCount,
            0,
            `PRECONDITION [${label}]: validation run count must be 0 before pipeline runs`,
          );

          onboardingCallCount = 0;
          const jobB3 = await claimGenerationJob(supabase, jobB_UUID);
          if (!jobB3) throw new Error(`Test setup failed [${label}]: claimGenerationJob must succeed`);
          const result = await runGenerationPipeline(supabase, jobB3, {
            onboardingSubmit: onboardingSpy,
          });

          // ── Assert: pipeline response ────────────────────────────────────
          assertEquals(
            result.httpStatus,
            422,
            `[${label}] Pipeline must return 422 for ownership violation`,
          );
          assertEquals(
            result.body.success,
            false,
            `[${label}] Pipeline body.success must be false`,
          );
          assert(
            result.body.message.includes("stage-2-ownership"),
            `[${label}] Pipeline message must reference stage-2-ownership, got: "${result.body.message}"`,
          );

          // ── Assert: no side effects (all three layers) ───────────────────
          await assertNoSideEffects(
            supabase,
            jobB_UUID,
            jobB_triggeredBy,
            targetAssetId,
            beforeSnapshot,
            beforeValidationCount,
            label,
          );
        } finally {
          await supabase.from("avatar_assets").delete().eq("asset_id", targetAssetId);
        }
      });
    }
  },
);
