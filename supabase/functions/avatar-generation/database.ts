import type { SupabaseClient } from "./supabase.ts";

// Thrown by completeGenerationJob when the CAS guard (status + version) matches
// 0 rows — either a concurrent write already advanced version, or the job is no
// longer in 'generating' state. Callers can catch this specifically without matching strings.
export class CasMismatchError extends Error {
  constructor(jobId: string) {
    super(
      `Failed to complete generation job "${jobId}": CAS_MISMATCH — job was modified concurrently (status or version mismatch)`,
    );
    this.name = "CasMismatchError";
  }
}

import type {
  CopyrightReviewResult,
  EventOutcome,
  GenerationEventRecord,
  GenerationJobRecord,
  GenerationJobStatus,
  ManualReviewResolution,
} from "./types.ts";

// ── Ownership derivation ──────────────────────────────────────────────────────
// Derives the target_asset_id for a generation job.
// Format: {slot}_gen_{first_8_hex_chars_of_job_id}
// UUID first 8 chars are always lowercase hex (before the first dash).
// Example: slot='hat', jobId='a1b2c3d4-e5f6-...' → 'hat_gen_a1b2c3d4'
// This function is the single source of truth — pipeline.ts and database.ts
// both import it to guarantee the derived ID is identical at job creation
// and at every subsequent ownership check.
export function deriveTargetAssetId(slot: string, jobId: string): string {
  return `${slot}_gen_${jobId.slice(0, 8)}`;
}

// ── Job operations ────────────────────────────────────────────────────────────

export async function createGenerationJob(
  supabase: SupabaseClient,
  jobId: string,
  slot: string,
  generationPrompt: string,
  negativePrompt: string | null,
  policyPrompt: string,
  modelProvider: string,
  modelVersion: string,
  initiatedBy: string,
  conceptImageBucket: string | null,
  conceptImagePath: string | null,
): Promise<GenerationJobRecord> {
  const targetAssetId = deriveTargetAssetId(slot, jobId);

  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .insert({
      id: jobId,
      target_asset_id: targetAssetId,
      slot,
      generation_prompt: generationPrompt,
      negative_prompt: negativePrompt,
      policy_prompt: policyPrompt,
      model_provider: modelProvider,
      model_version: modelVersion,
      initiated_by: initiatedBy,
      status: "pending",
      concept_image_bucket: conceptImageBucket,
      concept_image_path: conceptImagePath,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to create generation job for slot "${slot}": ${error.message}`,
    );
  }
  return data as unknown as GenerationJobRecord;
}

// Atomically claims a pending job by setting status = 'generating'.
// claimed_at is generated server-side (NOW()) inside the PostgreSQL function —
// never from the client clock — making the token atomic with the write.
// Returns the claimed job record, or null if already claimed or not found.
export async function claimGenerationJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<GenerationJobRecord | null> {
  const { data, error } = await supabase.rpc("claim_generation_job", {
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(`Failed to claim generation job "${jobId}": ${error.message}`);
  }
  return (data as unknown as GenerationJobRecord[])?.[0] ?? null;
}

export async function getGenerationJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<GenerationJobRecord | null> {
  const queryPromise = supabase
    .from("avatar_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  console.log("[DB] query created", jobId);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    queryPromise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), 5000);
    }),
  ]);
  clearTimeout(timeoutId);

  console.log("[DB] query resolved", jobId);

  const res = result as any;

  if (!res || typeof res !== "object") {
    throw new Error("Invalid response from Supabase");
  }

  const data = res.data ?? null;
  const error = res.error ?? null;

  console.log(
    "[DB] parsed result",
    jobId,
    data ? "HAS DATA" : "NO DATA",
    error ? error.message : "NO ERROR",
  );

  if (error) {
    throw new Error(`Failed to fetch generation job "${jobId}": ${error.message}`);
  }
  return data as GenerationJobRecord | null;
}

// Writes generated output file references atomically after AI generation completes.
// If generated_glb_path is already set (retry path), the pipeline MUST skip calling
// this function — it is only called on the first successful generation.
export async function setGeneratedFiles(
  supabase: SupabaseClient,
  jobId: string,
  glbBucket: string,
  glbPath: string,
  thumbnailBucket: string,
  thumbnailPath: string,
): Promise<void> {
  const { data: row, error: selectError } = await supabase
    .from("avatar_generation_jobs")
    .select("version, status, claimed_at")
    .eq("id", jobId)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Failed to set generated files for job "${jobId}": ${selectError.message}`,
    );
  }
  if (row === null) {
    return;
  }

  const r = row as Record<string, unknown>;
  if (r.status !== "generating") {
    return;
  }

  const previousVersion = r.version as number;
  const claimedAt = r.claimed_at as string;

  console.log("[DB] setGeneratedFiles calling RPC", jobId, { previousVersion, claimedAt });
  const { data: affected, error } = await supabase.rpc("set_generated_files_atomic", {
    p_job_id: jobId,
    p_claimed_at: claimedAt,
    p_previous_version: previousVersion,
    p_files: {
      glb_bucket: glbBucket,
      glb_path: glbPath,
      thumbnail_bucket: thumbnailBucket,
      thumbnail_path: thumbnailPath,
    },
  });

  if (error) {
    console.error(`[DB] setGeneratedFiles RPC error for job "${jobId}":`, error.message);
    throw new Error(
      `Failed to set generated files for job "${jobId}": ${error.message}`,
    );
  }
  if (affected === 0) {
    console.warn(`setGeneratedFiles CAS miss for job "${jobId}" — concurrent modification detected`);
    return;
  }
}

// Atomically records the copyright check verdict.
// Handles all three outcomes in a single DB write, satisfying all CHECK constraints:
//
//   'clear'         → copyright fields set, manual_review_required=false, status unchanged
//   'manual_review' → copyright fields set, manual_review_required=true, status='pending_manual_review'
//   'hard_fail'     → copyright fields set, manual_review_required=false,
//                     status='failed_permanent', completed_at=now(), failure fields set
//
// The DB trigger enforce_copyright_result_transition (SECURITY DEFINER) prevents
// this verdict from ever being reversed once set. The caller must not call
// failGenerationJob separately for 'hard_fail' — this function handles it atomically.
export async function setCopyrightReview(
  supabase: SupabaseClient,
  jobId: string,
  result: CopyrightReviewResult,
  confidence: number,
  flags: Record<string, unknown>,
  reviewedBy: string,
  notes: string,
): Promise<GenerationJobRecord | null> {
  const now = new Date().toISOString();

  const { data: row, error: selectError } = await supabase
    .from("avatar_generation_jobs")
    .select("version, status, claimed_at")
    .eq("id", jobId)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Failed to set copyright review for job "${jobId}": ${selectError.message}`,
    );
  }
  if (row === null) {
    return null;
  }

  const r = row as Record<string, unknown>;
  if (r.status !== "generating") {
    return null;
  }

  const previousVersion = r.version as number;
  const claimedAt = r.claimed_at as string;

  const { data: affected, error } = await supabase.rpc("set_copyright_review_atomic", {
    p_job_id: jobId,
    p_claimed_at: claimedAt,
    p_previous_version: previousVersion,
    p_result: result,
    p_confidence: confidence,
    p_flags: flags,
    p_reviewed_by: reviewedBy,
    p_reviewed_at: now,
    p_notes: notes,
  });

  if (error) {
    throw new Error(
      `Failed to set copyright review for job "${jobId}": ${error.message}`,
    );
  }
  if (affected === 0) {
    return null;
  }

  return await getGenerationJob(supabase, jobId);
}

// Atomically marks a generating job as complete.
// Uses version-based CAS: SELECT version → UPDATE WHERE id = jobId AND status = 'generating'
// AND version = previousVersion, SET version = previousVersion + 1.
// A concurrent write (failGenerationJob, another completeGenerationJob) that commits first
// will have advanced version; this UPDATE matches 0 rows → CasMismatchError.
export async function completeGenerationJob(
  supabase: SupabaseClient,
  jobId: string,
  resultingAssetId: string,
  onboardingValidationRunId: string | null,
): Promise<void> {
  const { data: row, error: selectError } = await supabase
    .from("avatar_generation_jobs")
    .select("version, status")
    .eq("id", jobId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to complete generation job "${jobId}": ${selectError.message}`);
  }
  if (row === null) {
    throw new CasMismatchError(jobId);
  }

  const r = row as Record<string, unknown>;
  if (r.status !== "generating") {
    throw new CasMismatchError(jobId);
  }

  const previousVersion = r.version as number;

  const { data: rows, error } = await supabase
    .from("avatar_generation_jobs")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
      resulting_asset_id: resultingAssetId,
      onboarding_validation_run_id: onboardingValidationRunId,
      version: previousVersion + 1,
    })
    .eq("id", jobId)
    .eq("status", "generating")
    .eq("version", previousVersion)
    .select("id");

  if (error) {
    throw new Error(`Failed to complete generation job "${jobId}": ${error.message}`);
  }

  const affected = rows?.length ?? 0;
  console.log("[DB] completion affected rows:", affected);
  if (affected === 0) {
    throw new CasMismatchError(jobId);
  }
}

// Atomically marks a generating job as failed.
// Ownership is enforced solely by claimed_at: each claim cycle sets a fresh token,
// so a zombie from a prior cycle cannot match. The status guard provides race safety:
// once the first writer transitions status away from 'generating', every concurrent
// caller's WHERE predicate returns 0 rows.
// No SELECT is needed — claimed_at + status together cover all failure modes.
// Returns { success: true } if exactly 1 row was updated, { success: false } otherwise.
export async function failGenerationJob(
  supabase: SupabaseClient,
  jobId: string,
  claimedAt: string,
  retryable: boolean,
  failureStage: string,
  failureReason: string,
  failureDetails: Record<string, unknown> | null,
): Promise<{ success: boolean }> {
  const newStatus: GenerationJobStatus = retryable
    ? "failed_retryable"
    : "failed_permanent";

  const completedAt = retryable ? null : new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("avatar_generation_jobs")
    .update({
      status: newStatus,
      failure_stage: failureStage,
      failure_reason: failureReason,
      failure_details: failureDetails,
      completed_at: completedAt,
    })
    .eq("id", jobId)
    .eq("status", "generating")
    .eq("claimed_at", claimedAt)
    .select("id");

  if (error) {
    throw new Error(
      `Failed to mark generation job "${jobId}" as failed: ${error.message}`,
    );
  }

  const affected = rows?.length ?? 0;
  console.log("[DB] failGenerationJob affected rows:", affected);
  return { success: affected > 0 };
}

// Resets a failed_retryable job back to pending and increments retry_count.
// Returns the updated job, or null if the job could not be reset
// (already reset, not in failed_retryable state, or retry_count >= MAX_RETRIES).
export async function resetJobForRetry(
  supabase: SupabaseClient,
  jobId: string,
  currentRetryCount: number,
): Promise<GenerationJobRecord | null> {
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .update({
      status: "pending",
      claimed_at: null,
      retry_count: currentRetryCount + 1,
      failure_stage: null,
      failure_reason: null,
      failure_details: null,
    })
    .eq("id", jobId)
    .eq("status", "failed_retryable")
    .lt("retry_count", MAX_RETRIES)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to reset generation job "${jobId}" for retry: ${error.message}`,
    );
  }
  return data as GenerationJobRecord | null;
}

// Maximum number of retry attempts before a job is permanently failed.
export const MAX_RETRIES = 5;

// A generating job is considered stale if claimed_at is older than this threshold.
const STALE_CLAIM_THRESHOLD_MINUTES = 10;

// Atomically recovers a stale generating job by transitioning it to failed_retryable.
// Only succeeds when status = 'generating' AND claimed_at < now() - 10 minutes.
// Uses version-based CAS — identical pattern to failGenerationJob and completeGenerationJob.
// Returns the recovered job record, or null if the job was not stale or was already recovered.
export async function recoverStuckJob(
  supabase: SupabaseClient,
  jobId: string,
  originalClaimedAt: string,
): Promise<GenerationJobRecord | null> {
  const thresholdTs = new Date(
    Date.now() - STALE_CLAIM_THRESHOLD_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: row, error: selectError } = await supabase
    .from("avatar_generation_jobs")
    .select("version, status")
    .eq("id", jobId)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Failed to recover stuck generation job "${jobId}": ${selectError.message}`,
    );
  }
  if (row === null) {
    return null;
  }

  const r = row as Record<string, unknown>;
  if (r.status !== "generating") {
    return null;
  }

  const previousVersion = r.version as number;
  const recoveredAt = new Date().toISOString();

  const { data: affected, error } = await supabase.rpc("recover_stuck_job_atomic", {
    p_job_id: jobId,
    p_previous_version: previousVersion,
    p_stale_threshold: thresholdTs,
    p_original_claimed_at: originalClaimedAt,
    p_recovered_at: recoveredAt,
  });

  if (error) {
    throw new Error(
      `Failed to recover stuck generation job "${jobId}": ${error.message}`,
    );
  }
  if (affected === 0) {
    return null;
  }

  return await getGenerationJob(supabase, jobId);
}

// Persists the provider's job ID immediately after the provider accepts a generation request.
// Uses claimed_at as a CAS guard — only the current owner (matching claimed_at) can write.
// A CAS miss (0 rows) means a stale worker is writing; warn but do not throw.
export async function persistProviderJobId(
  supabase: SupabaseClient,
  jobId: string,
  claimedAt: string,
  providerJobId: string,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("avatar_generation_jobs")
    .update({ provider_job_id: providerJobId })
    .eq("id", jobId)
    .eq("status", "generating")
    .eq("claimed_at", claimedAt)
    .select("id");

  if (error) {
    throw new Error(
      `Failed to persist provider_job_id for job "${jobId}": ${error.message}`,
    );
  }
  const affected = rows?.length ?? 0;
  if (affected === 0) {
    console.warn(`persistProviderJobId CAS miss for job "${jobId}" — stale worker or concurrent modification`);
  }
}

// Permanently fails a failed_retryable job that has reached the retry ceiling.
// Guards on status='failed_retryable' AND retry_count >= MAX_RETRIES.
// Returns the updated job record, or null if the guard did not match (CAS miss).
export async function exhaustRetries(
  supabase: SupabaseClient,
  jobId: string,
): Promise<GenerationJobRecord | null> {
  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .update({
      status: "failed_permanent",
      completed_at: new Date().toISOString(),
      failure_stage: "max-retries-exceeded",
      failure_reason: "Maximum retry limit reached",
      failure_details: { max_retries: MAX_RETRIES },
    })
    .eq("id", jobId)
    .eq("status", "failed_retryable")
    .gte("retry_count", MAX_RETRIES)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to exhaust retries for job "${jobId}": ${error.message}`,
    );
  }
  return data as GenerationJobRecord | null;
}

// Resolves a pending_manual_review job.
//
//   'approved' → copyright_review_result='clear', status='pending' (ready for re-run)
//                claimed_at=null, failure fields cleared.
//                Pipeline will skip AI generation (generated_glb_path intact) and
//                copyright check (result='clear') on re-run.
//
//   'rejected' → copyright_review_result='hard_fail', status='failed_permanent'
//                completed_at set. Permanently terminal — DB trigger enforces immutability.
//
// Guards on status='pending_manual_review' AND manual_review_required=TRUE.
// Returns null if the guard did not match (concurrent resolution won the race).
export async function resolveManualReview(
  supabase: SupabaseClient,
  jobId: string,
  resolution: ManualReviewResolution,
  resolvedBy: string,
  notes: string | null,
): Promise<GenerationJobRecord | null> {
  const now = new Date().toISOString();

  let update: Record<string, unknown>;

  if (resolution === "approved") {
    update = {
      copyright_review_result: "clear",
      manual_review_required: false,
      manual_review_resolved_by: resolvedBy,
      manual_review_resolved_at: now,
      manual_review_resolution: "approved",
      manual_review_resolution_notes: notes,
      status: "pending",
      claimed_at: null,
      failure_stage: null,
      failure_reason: null,
      failure_details: null,
    };
  } else {
    update = {
      copyright_review_result: "hard_fail",
      manual_review_required: false,
      manual_review_resolved_by: resolvedBy,
      manual_review_resolved_at: now,
      manual_review_resolution: "rejected",
      manual_review_resolution_notes: notes,
      status: "failed_permanent",
      completed_at: now,
      failure_stage: "copyright-manual-review",
      failure_reason: "Copyright manual review rejected by operator",
      failure_details: { resolved_by: resolvedBy, notes },
    };
  }

  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("status", "pending_manual_review")
    .eq("manual_review_required", true)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to resolve manual review for job "${jobId}": ${error.message}`,
    );
  }
  return data as GenerationJobRecord | null;
}

// ── Event operations ──────────────────────────────────────────────────────────

export async function insertGenerationEvent(
  supabase: SupabaseClient,
  jobId: string,
  stage: string,
  outcome: EventOutcome,
  message: string,
  details: Record<string, unknown> | null,
): Promise<GenerationEventRecord> {
  const { data, error } = await supabase
    .from("avatar_generation_events")
    .insert({
      job_id: jobId,
      stage,
      outcome,
      message,
      details,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to insert event for job "${jobId}", stage "${stage}": ${error.message}`,
    );
  }
  return data as unknown as GenerationEventRecord;
}

// ── Status query ──────────────────────────────────────────────────────────────

export async function getJobWithEvents(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{
  job: GenerationJobRecord | null;
  events: GenerationEventRecord[];
}> {
  const [jobResult, eventsResult] = await Promise.all([
    supabase
      .from("avatar_generation_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("avatar_generation_events")
      .select("*")
      .eq("job_id", jobId)
      .order("event_at", { ascending: true }),
  ]);

  if (jobResult.error) {
    throw new Error(
      `Failed to fetch generation job "${jobId}": ${jobResult.error.message}`,
    );
  }
  if (eventsResult.error) {
    throw new Error(
      `Failed to fetch events for job "${jobId}": ${eventsResult.error.message}`,
    );
  }

  return {
    job: jobResult.data as unknown as GenerationJobRecord | null,
    events: (eventsResult.data ?? []) as unknown as GenerationEventRecord[],
  };
}
