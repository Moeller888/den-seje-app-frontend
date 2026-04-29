import type { SupabaseClient } from "./supabase.ts";
import type { GlbAnalysisResult, IngestionJobRecord, PipelineResult } from "./types.ts";
import { analyzeGlb, validateThumbnailBytes } from "./glb-validator.ts";
import {
  validateAssetIdNaming,
  validateDisplayNameForForbiddenReferences,
} from "./naming-validator.ts";
import { downloadFileBytes, uploadFileBytes } from "./storage.ts";
import {
  claimIngestionJob,
  completeIngestionJob,
  failIngestionJob,
  getIngestionJob,
  insertIngestionArtifact,
  insertIngestionEvent,
  promoteArtifact,
  setAssetStoragePath,
  updateJobMeasuredValues,
} from "./database.ts";
import { callOnboardingSubmit } from "./onboarding-client.ts";

// ── Storage bucket names ──────────────────────────────────────────────────────
const BUCKET_STAGING = "avatar-staging";
const BUCKET_ASSETS = "avatar-assets";
const BUCKET_THUMBNAILS = "avatar-thumbnails";

// ── Production path convention ────────────────────────────────────────────────
// Paths are deterministic — based on asset_id only — so the onboarding call can
// reference the final storage path before the file is physically promoted.
function productionGlbPath(assetId: string): string {
  return `${assetId}.glb`;
}
function productionThumbnailPath(assetId: string): string {
  return `${assetId}.png`;
}

// ── SHA-256 hex digest (Web Crypto API, available in Deno) ────────────────────
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Stage event logging ───────────────────────────────────────────────────────
// Fire-and-forget wrapper that does not throw if event insertion fails.
// Event loss is acceptable (observability); pipeline continuation is not.
async function logEvent(
  supabase: SupabaseClient,
  jobId: string,
  stage: string,
  outcome: "started" | "passed" | "failed" | "skipped" | "warning",
  message: string,
  details: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await insertIngestionEvent(supabase, jobId, stage, outcome, message, details);
  } catch {
    // Event insertion failure must not abort the pipeline.
  }
}

// ── Metadata override (authority principle) ───────────────────────────────────
// GLB-measured values replace all declared technical.* fields.
// Nothing in metadata.technical may contradict what we physically measured.
function applyMeasuredOverrides(
  inputMetadata: Record<string, unknown>,
  analysis: GlbAnalysisResult,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = JSON.parse(JSON.stringify(inputMetadata));

  let technical = metadata["technical"];
  if (technical === null || typeof technical !== "object" || Array.isArray(technical)) {
    technical = {};
    metadata["technical"] = technical;
  }
  const tech = technical as Record<string, unknown>;

  tech["polycount_actual"] = analysis.polyCount;
  tech["file_size_kb_actual"] = Math.ceil(analysis.fileSizeBytes / 1024);
  tech["texture_embedded"] = analysis.textureEmbedded;
  tech["texture_format"] = analysis.textureFormat ?? "";

  if (analysis.textureWidth !== null && analysis.textureHeight !== null) {
    tech["texture_resolution"] = `${analysis.textureWidth}x${analysis.textureHeight}`;
  } else {
    tech["texture_resolution"] = "";
  }

  return metadata;
}

// ── Extract display_name safely ───────────────────────────────────────────────
function extractDisplayName(metadata: Record<string, unknown>): string {
  const identity = metadata["identity"];
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    return "";
  }
  const id = identity as Record<string, unknown>;
  return typeof id["display_name"] === "string" ? (id["display_name"] as string) : "";
}

// ── Pipeline entry point ──────────────────────────────────────────────────────

export async function runPipeline(
  supabase: SupabaseClient,
  jobId: string,
  inputMetadata: Record<string, unknown>,
): Promise<PipelineResult> {
  // ── Stage 1: Fetch and claim job ──────────────────────────────────────────
  const job = await getIngestionJob(supabase, jobId);
  if (job === null) {
    return {
      httpStatus: 404,
      body: {
        success: false,
        action: "process",
        job_id: jobId,
        message: `Ingestion job "${jobId}" not found`,
      },
    };
  }

  if (job.status !== "pending") {
    return {
      httpStatus: 409,
      body: {
        success: false,
        action: "process",
        job_id: jobId,
        message: `Ingestion job "${jobId}" cannot be processed — current status is "${job.status}"`,
      },
    };
  }

  const claimed = await claimIngestionJob(supabase, jobId);
  if (claimed === null) {
    return {
      httpStatus: 409,
      body: {
        success: false,
        action: "process",
        job_id: jobId,
        message: `Ingestion job "${jobId}" was claimed by another process before this request could acquire it`,
      },
    };
  }

  await logEvent(supabase, jobId, "stage-1-claim", "passed", "Job claimed successfully");

  // From here, all failures must call failIngestionJob before returning.
  return await runStages(supabase, claimed, inputMetadata);
}

async function runStages(
  supabase: SupabaseClient,
  job: IngestionJobRecord,
  inputMetadata: Record<string, unknown>,
): Promise<PipelineResult> {
  const jobId = job.id;
  const assetId = job.asset_id;

  // ── Stage 2: Naming validation ────────────────────────────────────────────
  await logEvent(supabase, jobId, "stage-2-naming", "started", "Validating asset_id naming");

  const namingError = validateAssetIdNaming(assetId, job.slot);
  if (namingError !== null) {
    await logEvent(supabase, jobId, "stage-2-naming", "failed", namingError.message, {
      rule_id: namingError.rule_id,
      field: namingError.field,
    });
    await failIngestionJob(supabase, jobId, false, "stage-2-naming", namingError.message, {
      rule_id: namingError.rule_id,
      field: namingError.field,
    });
    return permanentFailure(jobId, "stage-2-naming", namingError.message);
  }

  await logEvent(supabase, jobId, "stage-2-naming", "passed", "asset_id naming is valid");

  // ── Stage 3: Download GLB from staging ────────────────────────────────────
  await logEvent(
    supabase,
    jobId,
    "stage-3-glb-download",
    "started",
    `Downloading GLB from ${BUCKET_STAGING}/${job.staging_glb_path}`,
  );

  let glbBytes: Uint8Array;
  try {
    glbBytes = await downloadFileBytes(supabase, BUCKET_STAGING, job.staging_glb_path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-3-glb-download", "failed", msg);
    await failIngestionJob(supabase, jobId, true, "stage-3-glb-download", msg, null);
    return retryableFailure(jobId, "stage-3-glb-download", msg);
  }

  await logEvent(
    supabase,
    jobId,
    "stage-3-glb-download",
    "passed",
    `Downloaded GLB: ${glbBytes.length} bytes`,
    { file_size_bytes: glbBytes.length },
  );

  // Record staged GLB artifact
  await insertIngestionArtifact(
    supabase,
    jobId,
    "glb_staged",
    BUCKET_STAGING,
    job.staging_glb_path,
    glbBytes.length,
    null,
  );

  // ── Stage 4: GLB integrity check ──────────────────────────────────────────
  await logEvent(supabase, jobId, "stage-4-glb-integrity", "started", "Checking GLB magic and version");

  let analysis: GlbAnalysisResult;
  try {
    analysis = analyzeGlb(glbBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-4-glb-integrity", "failed", msg);
    await failIngestionJob(supabase, jobId, false, "stage-4-glb-integrity", msg, null);
    return permanentFailure(jobId, "stage-4-glb-integrity", msg);
  }

  await logEvent(
    supabase,
    jobId,
    "stage-4-glb-integrity",
    "passed",
    "GLB header and JSON chunk are valid",
  );

  // ── Stage 5: File size measurement (informational — stored in DB) ─────────
  await logEvent(
    supabase,
    jobId,
    "stage-5-file-size",
    "passed",
    `Measured file size: ${analysis.fileSizeBytes} bytes (${Math.ceil(analysis.fileSizeBytes / 1024)} KB)`,
    { file_size_bytes: analysis.fileSizeBytes },
  );

  // ── Stage 6: GLB deep analysis ────────────────────────────────────────────
  await logEvent(
    supabase,
    jobId,
    "stage-6-glb-analysis",
    "passed",
    `GLB analysis complete: ${analysis.polyCount} triangles, ` +
      `texture_embedded=${analysis.textureEmbedded}, ` +
      `format=${analysis.textureFormat ?? "none"}, ` +
      `resolution=${analysis.textureWidth !== null ? `${analysis.textureWidth}x${analysis.textureHeight}` : "unknown"}, ` +
      `bones=${analysis.attachmentBones.length}`,
    {
      poly_count: analysis.polyCount,
      texture_embedded: analysis.textureEmbedded,
      texture_format: analysis.textureFormat,
      texture_width: analysis.textureWidth,
      texture_height: analysis.textureHeight,
      attachment_bones: analysis.attachmentBones,
    },
  );

  // Persist measured values to the job record. These are the canonical authority values.
  const textureResolution =
    analysis.textureWidth !== null && analysis.textureHeight !== null
      ? `${analysis.textureWidth}x${analysis.textureHeight}`
      : null;

  try {
    await updateJobMeasuredValues(supabase, jobId, {
      fileSizeKb: Math.ceil(analysis.fileSizeBytes / 1024),
      polyCount: analysis.polyCount,
      textureEmbedded: analysis.textureEmbedded,
      textureFormat: analysis.textureFormat,
      textureResolution,
      attachmentBones: analysis.attachmentBones,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-6-glb-analysis", "failed", msg);
    await failIngestionJob(supabase, jobId, true, "stage-6-glb-analysis", msg, null);
    return retryableFailure(jobId, "stage-6-glb-analysis", msg);
  }

  // ── Stage 7: Thumbnail download + validation ──────────────────────────────
  await logEvent(
    supabase,
    jobId,
    "stage-7-thumbnail",
    "started",
    `Downloading thumbnail from ${BUCKET_STAGING}/${job.staging_thumbnail_path}`,
  );

  let thumbBytes: Uint8Array;
  try {
    thumbBytes = await downloadFileBytes(supabase, BUCKET_STAGING, job.staging_thumbnail_path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-7-thumbnail", "failed", msg);
    await failIngestionJob(supabase, jobId, true, "stage-7-thumbnail", msg, null);
    return retryableFailure(jobId, "stage-7-thumbnail", msg);
  }

  const thumbError = validateThumbnailBytes(thumbBytes);
  if (thumbError !== null) {
    await logEvent(supabase, jobId, "stage-7-thumbnail", "failed", thumbError.message, {
      rule_id: thumbError.rule_id,
      field: thumbError.field,
    });
    await failIngestionJob(supabase, jobId, false, "stage-7-thumbnail", thumbError.message, {
      rule_id: thumbError.rule_id,
      field: thumbError.field,
    });
    return permanentFailure(jobId, "stage-7-thumbnail", thumbError.message);
  }

  await logEvent(
    supabase,
    jobId,
    "stage-7-thumbnail",
    "passed",
    `Thumbnail valid: ${thumbBytes.length} bytes`,
    { file_size_bytes: thumbBytes.length },
  );

  await insertIngestionArtifact(
    supabase,
    jobId,
    "thumbnail_staged",
    BUCKET_STAGING,
    job.staging_thumbnail_path,
    thumbBytes.length,
    null,
  );

  // ── Stage 8: Forbidden reference pre-check ────────────────────────────────
  await logEvent(
    supabase,
    jobId,
    "stage-8-forbidden-refs",
    "started",
    "Checking metadata for forbidden references",
  );

  const displayName = extractDisplayName(inputMetadata);
  const refError = validateDisplayNameForForbiddenReferences(displayName, assetId);
  if (refError !== null) {
    await logEvent(supabase, jobId, "stage-8-forbidden-refs", "failed", refError.message, {
      rule_id: refError.rule_id,
      field: refError.field,
    });
    await failIngestionJob(supabase, jobId, false, "stage-8-forbidden-refs", refError.message, {
      rule_id: refError.rule_id,
      field: refError.field,
    });
    return permanentFailure(jobId, "stage-8-forbidden-refs", refError.message);
  }

  await logEvent(
    supabase,
    jobId,
    "stage-8-forbidden-refs",
    "passed",
    "No forbidden references found",
  );

  // ── Stage 9: Apply measured value overrides to metadata ───────────────────
  // GLB-measured values replace all declared technical.* fields.
  // This is the authority principle: what we measured overwrites what the artist claimed.
  const productionMetadata = applyMeasuredOverrides(inputMetadata, analysis);

  await logEvent(
    supabase,
    jobId,
    "stage-9-metadata-override",
    "passed",
    "Measured values applied to metadata (technical.* fields overwritten)",
    {
      polycount_actual: analysis.polyCount,
      file_size_kb_actual: Math.ceil(analysis.fileSizeBytes / 1024),
      texture_embedded: analysis.textureEmbedded,
      texture_format: analysis.textureFormat,
      texture_resolution: textureResolution,
    },
  );

  // ── Stage 10: Call avatar-asset-onboarding/submit ─────────────────────────
  await logEvent(
    supabase,
    jobId,
    "stage-10-onboarding",
    "started",
    "Submitting to avatar-asset-onboarding",
  );

  const glbProductionPath = productionGlbPath(assetId);
  const triggeredBy = `ingestion-pipeline:${jobId}`;

  // storage_path is intentionally null here. The production GLB does not exist
  // yet — it is uploaded in Stage 11. Passing null skips the file-existence
  // check in the onboarding function. avatar_assets.storage_path is set by
  // setAssetStoragePath() after Stage 11 confirms the file is in the bucket.
  let onboardingResult: Awaited<ReturnType<typeof callOnboardingSubmit>>;
  try {
    onboardingResult = await callOnboardingSubmit(
      productionMetadata,
      triggeredBy,
      null,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-10-onboarding", "failed", msg);
    await failIngestionJob(supabase, jobId, true, "stage-10-onboarding", msg, null);
    return retryableFailure(jobId, "stage-10-onboarding", msg);
  }

  if (!onboardingResult.success) {
    const msg = onboardingResult.message;
    await logEvent(supabase, jobId, "stage-10-onboarding", "failed", msg, {
      validation_errors: onboardingResult.validation_errors ?? [],
    });
    await failIngestionJob(supabase, jobId, false, "stage-10-onboarding", msg, {
      validation_errors: onboardingResult.validation_errors ?? [],
    });
    return {
      httpStatus: 422,
      body: {
        success: false,
        action: "process",
        job_id: jobId,
        message: `Onboarding validation failed: ${msg}`,
        validation_errors: onboardingResult.validation_errors ?? [],
      },
    };
  }

  const onboardingAssetId = onboardingResult.asset_id;
  const validationRunId =
    onboardingResult.validation_run?.id ?? null;

  if (onboardingAssetId === null || validationRunId === null) {
    const msg = "avatar-asset-onboarding returned success but did not include asset_id or validation_run.id";
    await logEvent(supabase, jobId, "stage-10-onboarding", "failed", msg);
    await failIngestionJob(supabase, jobId, true, "stage-10-onboarding", msg, null);
    return retryableFailure(jobId, "stage-10-onboarding", msg);
  }

  await logEvent(
    supabase,
    jobId,
    "stage-10-onboarding",
    "passed",
    `Onboarding succeeded: asset_id="${onboardingAssetId}", run_id="${validationRunId}"`,
    { onboarding_asset_id: onboardingAssetId, validation_run_id: validationRunId },
  );

  // ── Stage 11: Promote artifacts to production ─────────────────────────────
  await logEvent(
    supabase,
    jobId,
    "stage-11-promote",
    "started",
    "Promoting artifacts from staging to production buckets",
  );

  // Compute content hash for GLB before upload (for deduplication guard in DB)
  let glbHash: string;
  try {
    glbHash = await sha256Hex(glbBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-11-promote", "failed", `SHA-256 computation failed: ${msg}`);
    await failIngestionJob(supabase, jobId, true, "stage-11-promote", msg, null);
    return retryableFailure(jobId, "stage-11-promote", msg);
  }

  // Upload GLB to production bucket
  try {
    await uploadFileBytes(
      supabase,
      BUCKET_ASSETS,
      glbProductionPath,
      glbBytes,
      "model/gltf-binary",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-11-promote", "failed", `GLB upload failed: ${msg}`);
    await failIngestionJob(supabase, jobId, true, "stage-11-promote", msg, null);
    return retryableFailure(jobId, "stage-11-promote", msg);
  }

  // Record and promote GLB production artifact
  let glbProductionArtifact;
  try {
    glbProductionArtifact = await insertIngestionArtifact(
      supabase,
      jobId,
      "glb_production",
      BUCKET_ASSETS,
      glbProductionPath,
      glbBytes.length,
      glbHash,
    );
    await promoteArtifact(supabase, glbProductionArtifact.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-11-promote", "failed", `GLB artifact record failed: ${msg}`);
    await failIngestionJob(supabase, jobId, true, "stage-11-promote", msg, null);
    return retryableFailure(jobId, "stage-11-promote", msg);
  }

  // GLB is confirmed in the bucket — set storage_path on the asset record now.
  // Failure here is non-fatal: the asset is onboarded and the file is in storage.
  // storage_path is nullable; it can be corrected manually if this write fails.
  try {
    await setAssetStoragePath(supabase, onboardingAssetId, glbProductionPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(
      supabase,
      jobId,
      "stage-11-promote",
      "warning",
      `GLB promoted but failed to set storage_path on asset record: ${msg}`,
      { onboarding_asset_id: onboardingAssetId, expected_storage_path: glbProductionPath },
    );
  }

  // Upload thumbnail to production bucket
  const thumbProductionPath = productionThumbnailPath(assetId);
  try {
    await uploadFileBytes(
      supabase,
      BUCKET_THUMBNAILS,
      thumbProductionPath,
      thumbBytes,
      "image/png",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-11-promote", "failed", `Thumbnail upload failed: ${msg}`);
    await failIngestionJob(supabase, jobId, true, "stage-11-promote", msg, null);
    return retryableFailure(jobId, "stage-11-promote", msg);
  }

  // Record and promote thumbnail production artifact
  try {
    const thumbHash = await sha256Hex(thumbBytes);
    const thumbProductionArtifact = await insertIngestionArtifact(
      supabase,
      jobId,
      "thumbnail_production",
      BUCKET_THUMBNAILS,
      thumbProductionPath,
      thumbBytes.length,
      thumbHash,
    );
    await promoteArtifact(supabase, thumbProductionArtifact.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-11-promote", "failed", `Thumbnail artifact record failed: ${msg}`);
    await failIngestionJob(supabase, jobId, true, "stage-11-promote", msg, null);
    return retryableFailure(jobId, "stage-11-promote", msg);
  }

  await logEvent(
    supabase,
    jobId,
    "stage-11-promote",
    "passed",
    `Artifacts promoted: GLB → ${BUCKET_ASSETS}/${glbProductionPath}, Thumbnail → ${BUCKET_THUMBNAILS}/${thumbProductionPath}`,
  );

  // ── Mark job complete ─────────────────────────────────────────────────────
  try {
    await completeIngestionJob(supabase, jobId, onboardingAssetId, validationRunId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-11-promote", "failed", `Failed to mark job complete: ${msg}`);
    // The asset IS in production — do not retry the whole pipeline.
    // Mark permanent so the operator can investigate.
    await failIngestionJob(supabase, jobId, false, "complete", msg, null);
    return permanentFailure(jobId, "complete", msg);
  }

  await logEvent(
    supabase,
    jobId,
    "pipeline-complete",
    "passed",
    `Ingestion pipeline complete for asset "${assetId}"`,
    { onboarding_asset_id: onboardingAssetId, validation_run_id: validationRunId },
  );

  return {
    httpStatus: 200,
    body: {
      success: true,
      action: "process",
      job_id: jobId,
      message: `Ingestion pipeline complete. Asset "${assetId}" is now in the onboarding workflow.`,
    },
  };
}

// ── Failure helpers ───────────────────────────────────────────────────────────

function permanentFailure(
  jobId: string,
  stage: string,
  reason: string,
): PipelineResult {
  return {
    httpStatus: 422,
    body: {
      success: false,
      action: "process",
      job_id: jobId,
      message: `Ingestion failed permanently at ${stage}: ${reason}`,
    },
  };
}

function retryableFailure(
  jobId: string,
  stage: string,
  reason: string,
): PipelineResult {
  return {
    httpStatus: 503,
    body: {
      success: false,
      action: "process",
      job_id: jobId,
      message: `Ingestion failed at ${stage} (retryable): ${reason}`,
    },
  };
}

// ── Analyze-only (no pipeline, no job state changes) ─────────────────────────

// Used by POST /analyze. Downloads GLB, parses it, and returns pre-filled metadata.
// Does NOT modify the job or log events.
export async function analyzeJobGlb(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{
  result: "ok" | "not_found" | "error";
  analysis: GlbAnalysisResult | null;
  suggestedMetadata: Record<string, unknown> | null;
  message: string;
}> {
  const job = await getIngestionJob(supabase, jobId);
  if (job === null) {
    return {
      result: "not_found",
      analysis: null,
      suggestedMetadata: null,
      message: `Ingestion job "${jobId}" not found`,
    };
  }

  let glbBytes: Uint8Array;
  try {
    glbBytes = await downloadFileBytes(supabase, BUCKET_STAGING, job.staging_glb_path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      result: "error",
      analysis: null,
      suggestedMetadata: null,
      message: `Failed to download GLB for analysis: ${msg}`,
    };
  }

  let analysis: GlbAnalysisResult;
  try {
    analysis = analyzeGlb(glbBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      result: "error",
      analysis: null,
      suggestedMetadata: null,
      message: `GLB analysis failed: ${msg}`,
    };
  }

  const now = new Date().toISOString();
  const textureResolution =
    analysis.textureWidth !== null && analysis.textureHeight !== null
      ? `${analysis.textureWidth}x${analysis.textureHeight}`
      : "";

  const suggestedMetadata: Record<string, unknown> = {
    identity: {
      asset_id: job.asset_id,
      slot: job.slot,
      display_name: "",
    },
    technical: {
      polycount_actual: analysis.polyCount,
      polycount_max: 0,
      file_size_kb_actual: Math.ceil(analysis.fileSizeBytes / 1024),
      file_size_kb_max: 0,
      texture_embedded: analysis.textureEmbedded,
      texture_format: analysis.textureFormat ?? "",
      texture_resolution: textureResolution,
    },
    deployment: {
      current_status: "draft",
      production_enabled: false,
      approved_by: null,
      approved_at: null,
    },
    audit: {
      created_by: job.initiated_by,
      created_at: now,
      last_modified_by: job.initiated_by,
      last_modified_at: now,
    },
  };

  return {
    result: "ok",
    analysis,
    suggestedMetadata,
    message: "GLB analysed successfully",
  };
}
