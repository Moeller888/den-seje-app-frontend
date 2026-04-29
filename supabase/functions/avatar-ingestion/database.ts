import type { SupabaseClient } from "./supabase.ts";
import type {
  ArtifactType,
  EventOutcome,
  IngestionArtifactRecord,
  IngestionEventRecord,
  IngestionJobRecord,
  IngestionJobStatus,
} from "./types.ts";

// ── Job operations ────────────────────────────────────────────────────────────

export async function createIngestionJob(
  supabase: SupabaseClient,
  assetId: string,
  slot: string,
  stagingGlbPath: string,
  stagingThumbnailPath: string,
  initiatedBy: string,
): Promise<IngestionJobRecord> {
  const { data, error } = await supabase
    .from("avatar_ingestion_jobs")
    .insert({
      asset_id: assetId,
      slot,
      status: "pending",
      staging_glb_path: stagingGlbPath,
      staging_thumbnail_path: stagingThumbnailPath,
      initiated_by: initiatedBy,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to create ingestion job for asset "${assetId}": ${error.message}`,
    );
  }
  return data as IngestionJobRecord;
}

// Atomically claims a pending job by setting status = 'validating'.
// Returns the claimed job record, or null if the job was already claimed or does not exist.
export async function claimIngestionJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<IngestionJobRecord | null> {
  const { data, error } = await supabase
    .from("avatar_ingestion_jobs")
    .update({
      status: "validating",
      claimed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim ingestion job "${jobId}": ${error.message}`);
  }
  return data as IngestionJobRecord | null;
}

export async function getIngestionJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<IngestionJobRecord | null> {
  const { data, error } = await supabase
    .from("avatar_ingestion_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch ingestion job "${jobId}": ${error.message}`);
  }
  return data as IngestionJobRecord | null;
}

export async function updateJobMeasuredValues(
  supabase: SupabaseClient,
  jobId: string,
  measured: {
    fileSizeKb: number;
    polyCount: number;
    textureEmbedded: boolean;
    textureFormat: string | null;
    textureResolution: string | null;
    attachmentBones: string[];
  },
): Promise<void> {
  const { error } = await supabase
    .from("avatar_ingestion_jobs")
    .update({
      measured_file_size_kb: measured.fileSizeKb,
      measured_poly_count: measured.polyCount,
      measured_texture_embedded: measured.textureEmbedded,
      measured_texture_format: measured.textureFormat,
      measured_texture_resolution: measured.textureResolution,
      measured_attachment_bones: measured.attachmentBones,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(
      `Failed to update measured values for job "${jobId}": ${error.message}`,
    );
  }
}

export async function completeIngestionJob(
  supabase: SupabaseClient,
  jobId: string,
  onboardingAssetId: string,
  onboardingValidationRunId: string,
): Promise<void> {
  const { error } = await supabase
    .from("avatar_ingestion_jobs")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
      onboarding_asset_id: onboardingAssetId,
      onboarding_validation_run_id: onboardingValidationRunId,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to complete ingestion job "${jobId}": ${error.message}`);
  }
}

export async function failIngestionJob(
  supabase: SupabaseClient,
  jobId: string,
  retryable: boolean,
  failureStage: string,
  failureReason: string,
  failureDetails: Record<string, unknown> | null,
): Promise<void> {
  const newStatus: IngestionJobStatus = retryable
    ? "failed_retryable"
    : "failed_permanent";

  const update: Record<string, unknown> = {
    status: newStatus,
    failure_stage: failureStage,
    failure_reason: failureReason,
    failure_details: failureDetails,
  };

  // completed_at is only required for terminal permanent failures, not retryable ones.
  if (!retryable) {
    update["completed_at"] = new Date().toISOString();
  }

  const { error } = await supabase
    .from("avatar_ingestion_jobs")
    .update(update)
    .eq("id", jobId);

  if (error) {
    throw new Error(
      `Failed to mark ingestion job "${jobId}" as failed: ${error.message}`,
    );
  }
}

// Resets a failed_retryable job back to pending and increments retry_count.
// Returns the updated job, or null if the job could not be reset
// (already reset, not in failed_retryable state, or retry_count >= 3).
export async function resetJobForRetry(
  supabase: SupabaseClient,
  jobId: string,
  currentRetryCount: number,
): Promise<IngestionJobRecord | null> {
  const { data, error } = await supabase
    .from("avatar_ingestion_jobs")
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
    .lt("retry_count", 3)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to reset ingestion job "${jobId}" for retry: ${error.message}`,
    );
  }
  return data as IngestionJobRecord | null;
}

// ── Event operations ──────────────────────────────────────────────────────────

export async function insertIngestionEvent(
  supabase: SupabaseClient,
  jobId: string,
  stage: string,
  outcome: EventOutcome,
  message: string,
  details: Record<string, unknown> | null,
): Promise<IngestionEventRecord> {
  const { data, error } = await supabase
    .from("avatar_ingestion_events")
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
  return data as IngestionEventRecord;
}

// ── Artifact operations ───────────────────────────────────────────────────────

export async function insertIngestionArtifact(
  supabase: SupabaseClient,
  jobId: string,
  artifactType: ArtifactType,
  bucket: string,
  storagePath: string,
  fileSizeBytes: number | null,
  contentHash: string | null,
): Promise<IngestionArtifactRecord> {
  const { data, error } = await supabase
    .from("avatar_ingestion_artifacts")
    .insert({
      job_id: jobId,
      artifact_type: artifactType,
      bucket,
      storage_path: storagePath,
      file_size_bytes: fileSizeBytes,
      content_hash: contentHash,
      status: "staged",
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to insert artifact for job "${jobId}", type "${artifactType}": ${error.message}`,
    );
  }
  return data as IngestionArtifactRecord;
}

export async function promoteArtifact(
  supabase: SupabaseClient,
  artifactId: string,
): Promise<void> {
  const { error } = await supabase
    .from("avatar_ingestion_artifacts")
    .update({
      status: "promoted",
      promoted_at: new Date().toISOString(),
    })
    .eq("id", artifactId);

  if (error) {
    throw new Error(`Failed to promote artifact "${artifactId}": ${error.message}`);
  }
}

// ── Asset storage path ────────────────────────────────────────────────────────

// Sets avatar_assets.storage_path after the production GLB has been confirmed
// in the avatar-assets bucket. Called at the end of Stage 11 so the path is
// written only after the file physically exists.
export async function setAssetStoragePath(
  supabase: SupabaseClient,
  assetId: string,
  storagePath: string,
): Promise<void> {
  const { error } = await supabase
    .from("avatar_assets")
    .update({ storage_path: storagePath })
    .eq("asset_id", assetId);

  if (error) {
    throw new Error(
      `Failed to set storage_path on asset "${assetId}": ${error.message}`,
    );
  }
}

// ── Status query ──────────────────────────────────────────────────────────────

export async function getJobWithEventsAndArtifacts(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{
  job: IngestionJobRecord | null;
  events: IngestionEventRecord[];
  artifacts: IngestionArtifactRecord[];
}> {
  const [jobResult, eventsResult, artifactsResult] = await Promise.all([
    supabase
      .from("avatar_ingestion_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("avatar_ingestion_events")
      .select("*")
      .eq("job_id", jobId)
      .order("event_at", { ascending: true }),
    supabase
      .from("avatar_ingestion_artifacts")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
  ]);

  if (jobResult.error) {
    throw new Error(
      `Failed to fetch ingestion job "${jobId}": ${jobResult.error.message}`,
    );
  }
  if (eventsResult.error) {
    throw new Error(
      `Failed to fetch events for job "${jobId}": ${eventsResult.error.message}`,
    );
  }
  if (artifactsResult.error) {
    throw new Error(
      `Failed to fetch artifacts for job "${jobId}": ${artifactsResult.error.message}`,
    );
  }

  return {
    job: jobResult.data as IngestionJobRecord | null,
    events: (eventsResult.data ?? []) as IngestionEventRecord[],
    artifacts: (artifactsResult.data ?? []) as IngestionArtifactRecord[],
  };
}
