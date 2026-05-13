import type { SupabaseClient } from "./supabase.ts";
import type { CopyrightReviewResult, GenerationJobRecord, PipelineResult } from "./types.ts";
import { downloadFileBytes, uploadFileBytes } from "./storage.ts";
import {
  completeGenerationJob,
  failGenerationJob,
  insertGenerationEvent,
  setCopyrightReview,
  setGeneratedFiles,
} from "./database.ts";
import { callOnboardingSubmit } from "./onboarding-client.ts";

// ── Storage bucket names ──────────────────────────────────────────────────────
const BUCKET_STAGING = "avatar-generation-staging";
const BUCKET_ASSETS = "avatar-assets";
const BUCKET_THUMBNAILS = "avatar-thumbnails";

// ── Production path convention ────────────────────────────────────────────────
function productionGlbPath(targetAssetId: string): string {
  return `${targetAssetId}.glb`;
}
function productionThumbnailPath(targetAssetId: string): string {
  return `${targetAssetId}.png`;
}

// ── Fire-and-forget event logger ──────────────────────────────────────────────
async function logEvent(
  supabase: SupabaseClient,
  jobId: string,
  stage: string,
  outcome: "started" | "passed" | "failed" | "skipped" | "warning",
  message: string,
  details: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await insertGenerationEvent(supabase, jobId, stage, outcome, message, details);
  } catch {
    // Event insertion failure must not abort the pipeline.
  }
}

// ── Minimal valid GLB 2.0 (stub placeholder) ──────────────────────────────────
function generateMinimalGlb(): Uint8Array {
  const json = '{"asset":{"version":"2.0"}} ';
  const jsonBytes = new TextEncoder().encode(json);
  const total = 12 + 8 + jsonBytes.length;

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  buf[0] = 0x67; buf[1] = 0x6C; buf[2] = 0x54; buf[3] = 0x46;
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);

  view.setUint32(12, jsonBytes.length, true);
  buf[16] = 0x4A; buf[17] = 0x53; buf[18] = 0x4F; buf[19] = 0x4E;

  buf.set(jsonBytes, 20);

  return buf;
}

// ── Minimal valid PNG (stub placeholder) ──────────────────────────────────────
function generateMinimalPng(): Uint8Array {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ── Copyright check stub ──────────────────────────────────────────────────────
async function checkCopyright(_glbBytes: Uint8Array): Promise<{
  result: CopyrightReviewResult;
  confidence: number;
  flags: Record<string, unknown>;
  notes: string;
  reviewedBy: string;
}> {
  return {
    result: "clear",
    confidence: 1.0,
    flags: {},
    notes: "Stub automated copyright check — replace with real provider",
    reviewedBy: "system",
  };
}

// ── Slot-derived attachment facts ─────────────────────────────────────────────
// Structural properties determined by slot type — not editorial choices.
// The schema allOf conditionals enforce the parented/skinned invariants.
type AttachmentFacts = {
  type: "parented" | "skinned";
  bone: string | null;
  rigRequired: boolean;
};

function attachmentForSlot(slot: string): AttachmentFacts {
  switch (slot) {
    case "hat":       return { type: "parented", bone: "attach_head",   rigRequired: false };
    case "shirt":     return { type: "skinned",  bone: null,             rigRequired: true  };
    case "shoe":      return { type: "parented", bone: "attach_foot_L",  rigRequired: false };
    case "inventory": return { type: "parented", bone: "attach_hand_R",  rigRequired: false };
    default:          return { type: "parented", bone: "attach_head",    rigRequired: false };
  }
}

// ── Build onboarding metadata ─────────────────────────────────────────────────
function buildOnboardingMetadata(
  job: GenerationJobRecord,
  glbSizeBytes: number,
  triggeredBy: string,
): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const attachment = attachmentForSlot(job.slot);

  return {
    // Workflow state
    schema_version: "1.0",

    // Extracted facts: identity from job record
    identity: {
      asset_id: job.target_asset_id,
      slot: job.slot,
      display_name: job.generation_prompt.trim().slice(0, 64),
      version: "1.0",
      status: "draft",
      created_by: triggeredBy,
      created_at: today,
      approved_by: null,
      approved_at: null,
    },

    // Policy defaults: all generated assets start as standard, pending moderation
    // school_safe starts false — RULE-CMP-005 prohibits true without a completed review
    classification: {
      rarity: "standard",
      school_safe: false,
      moderation_required: true,
      whitelist_approved: false,
    },

    // Editorial metadata: not yet characterized by a human
    visual: {
      primary_color: null,
      secondary_color: null,
      accent_color: null,
      silhouette_type: job.slot,
      thumbnail_priority: 5,
    },

    // Technical: constants + clamped measurements + slot-derived attachment facts
    technical: {
      polycount_max: 10000,
      polycount_actual: 1,
      texture_resolution: "256x256",
      texture_format: "png",
      texture_embedded: false,
      export_format: "glb",
      file_size_kb_max: 1024,
      file_size_kb_actual: Math.min(1024, Math.max(1, Math.ceil(glbSizeBytes / 1024))),
      attachment_type: attachment.type,
      attachment_bone: attachment.bone,
      rig_required: attachment.rigRequired,
    },

    // Workflow state: not yet reviewed
    validation: {
      copyright_review_passed: false,
      school_safe_review_passed: false,
      thumbnail_readability_passed: false,
      clipping_test_passed: false,
      browser_validation_passed: false,
      qa_approved: false,
    },

    // Clean initial state: no forbidden references detected
    forbidden_reference_check: {
      fortnite: false,
      roblox: false,
      minecraft: false,
      nike: false,
      adidas: false,
      jordan: false,
      marvel: false,
      disney: false,
      star_wars: false,
      political_symbols: false,
      nazi_symbols: false,
    },

    // Workflow state: not yet deployed
    deployment: {
      production_enabled: false,
      release_group: "v1",
      rollout_stage: "none",
    },

    // Audit trail
    audit: {
      last_modified_by: triggeredBy,
      last_modified_at: today,
      review_notes: null,
    },
  };
}

// ── Pipeline entry point ──────────────────────────────────────────────────────

export async function runGenerationPipeline(
  supabase: SupabaseClient,
  job: GenerationJobRecord,
  deps?: {
    onboardingSubmit?: typeof callOnboardingSubmit;
  },
): Promise<PipelineResult> {
  const jobId = job.id;
  console.log("[PIPELINE] start", jobId);
  try {
    if (job.status !== "generating") {
      return {
        httpStatus: 409,
        body: {
          success: false,
          action: "process",
          job_id: jobId,
          message: `Generation job "${jobId}" cannot be processed — current status is "${job.status}"`,
        },
      };
    }

    await logEvent(supabase, jobId, "stage-1-claim", "passed", "Job claimed successfully");
    console.log("[PIPELINE] stage 1 done — job claimed by worker", jobId);

    console.log("[PIPELINE] calling runStages", jobId);
    return await runStages(supabase, job, deps);
  } catch (err) {
    console.error("[PIPELINE ERROR]", jobId, err);
    if (err instanceof Error) {
      console.error("[PIPELINE ERROR MESSAGE]", err.message);
      console.error("[PIPELINE ERROR STACK]", err.stack);
    }
    throw err;
  }
}

async function runStages(
  supabase: SupabaseClient,
  job: GenerationJobRecord,
  deps?: {
    onboardingSubmit?: typeof callOnboardingSubmit;
  },
): Promise<PipelineResult> {
  const jobId = job.id;
  const targetAssetId = job.target_asset_id;
  const triggeredBy = `generation-pipeline:${jobId}`;
  console.log("[PIPELINE] runStages start", jobId, "targetAssetId:", targetAssetId);

  // ── Stage 2: Ownership gate ───────────────────────────────────────────────
  await logEvent(supabase, jobId, "stage-2-ownership", "started", `Checking ownership of target asset "${targetAssetId}"`);
  console.log("[PIPELINE] stage 2 start — calling avatar_assets ownership query", jobId);

  const { data: existingAsset, error: assetFetchError } = await supabase
    .from("avatar_assets")
    .select("asset_id, created_by, production_enabled")
    .eq("asset_id", targetAssetId)
    .maybeSingle();

  if (assetFetchError) {
    const msg = `Failed to query avatar_assets for ownership check: ${assetFetchError.message}`;
    await logEvent(supabase, jobId, "stage-2-ownership", "failed", msg);
    await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-2-ownership", msg, null);
    return retryableFailure(jobId, "stage-2-ownership", msg);
  }

  if (existingAsset !== null) {
    const asset = existingAsset as {
      asset_id: string;
      created_by: string;
      production_enabled: boolean;
    };

    if (asset.production_enabled === true) {
      const msg =
        `OWNERSHIP_VIOLATION: target asset "${targetAssetId}" has production_enabled=true — ` +
        `generation pipeline must never mutate a live production asset`;
      await logEvent(supabase, jobId, "stage-2-ownership", "failed", msg, {
        target_asset_id: targetAssetId,
        asset_created_by: asset.created_by,
      });
      await failGenerationJob(supabase, jobId, job.claimed_at!,false, "stage-2-ownership", msg, {
        target_asset_id: targetAssetId,
        asset_created_by: asset.created_by,
      });
      return permanentFailure(jobId, "stage-2-ownership", msg);
    }

    if (asset.created_by !== triggeredBy) {
      const msg =
        `OWNERSHIP_VIOLATION: target asset "${targetAssetId}" already exists with created_by="${asset.created_by}" — ` +
        `this job (${triggeredBy}) does not own it`;
      await logEvent(supabase, jobId, "stage-2-ownership", "failed", msg, {
        target_asset_id: targetAssetId,
        expected_created_by: triggeredBy,
        actual_created_by: asset.created_by,
      });
      await failGenerationJob(supabase, jobId, job.claimed_at!,false, "stage-2-ownership", msg, {
        target_asset_id: targetAssetId,
        expected_created_by: triggeredBy,
        actual_created_by: asset.created_by,
      });
      return permanentFailure(jobId, "stage-2-ownership", msg);
    }

    await logEvent(
      supabase,
      jobId,
      "stage-2-ownership",
      "warning",
      `Target asset "${targetAssetId}" already exists and is owned by this job (retry path) — continuing`,
      { target_asset_id: targetAssetId, created_by: asset.created_by },
    );
  } else {
    await logEvent(
      supabase,
      jobId,
      "stage-2-ownership",
      "passed",
      `No existing asset for "${targetAssetId}" — safe to proceed`,
    );
  }

  console.log("[PIPELINE] stage 2 done", jobId);
  // ── Stage 3: AI generation ────────────────────────────────────────────────
  let glbBytes: Uint8Array;
  let thumbnailBytes: Uint8Array;

  if (
    job.generated_files !== null &&
    job.generated_files.glb_path !== null &&
    job.generated_files.thumbnail_path !== null
  ) {
    await logEvent(
      supabase,
      jobId,
      "stage-3-ai-generation",
      "skipped",
      "AI output already in staging from prior run — downloading for subsequent stages",
      {
        generated_files_glb_path: job.generated_files.glb_path,
        generated_files_thumbnail_path: job.generated_files.thumbnail_path,
      },
    );

    console.log("[PIPELINE] stage 3 retry path — calling downloadFileBytes GLB", jobId);
    try {
      glbBytes = await downloadFileBytes(supabase, job.generated_files.glb_bucket, job.generated_files.glb_path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "stage-3-ai-generation", "failed", `Re-download of staged GLB failed: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-3-ai-generation", msg, null);
      return retryableFailure(jobId, "stage-3-ai-generation", msg);
    }

    console.log("[PIPELINE] stage 3 retry path — calling downloadFileBytes thumbnail", jobId);
    try {
      thumbnailBytes = await downloadFileBytes(
        supabase,
        job.generated_files.thumbnail_bucket,
        job.generated_files.thumbnail_path,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "stage-3-ai-generation", "failed", `Re-download of staged thumbnail failed: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-3-ai-generation", msg, null);
      return retryableFailure(jobId, "stage-3-ai-generation", msg);
    }
  } else {
    if (job.provider_job_id !== null) {
      // Branch 2: provider_job_id is set but generated_files are not yet staged.
      // A prior run submitted the request to the AI provider and received a job ID,
      // but was killed before the output files were staged.
      // A real integration would poll the provider here instead of re-submitting:
      //   const result = await pollProviderJob(job.provider_job_id);
      // TODO: call persistProviderJobId() immediately after the provider accepts a new request:
      //   await persistProviderJobId(supabase, jobId, job.claimed_at!, providerJobId);
      await logEvent(
        supabase,
        jobId,
        "stage-3-ai-generation",
        "warning",
        `provider_job_id is set but generated_files are null — resuming via stub generation`,
        { provider_job_id: job.provider_job_id, model_provider: job.model_provider },
      );
    } else {
      await logEvent(
        supabase,
        jobId,
        "stage-3-ai-generation",
        "started",
        `Running AI generation for slot="${job.slot}"`,
        { model_provider: job.model_provider, model_version: job.model_version },
      );
    }

    console.log("[PIPELINE] stage 3 — generating GLB + PNG bytes", jobId);
    glbBytes = generateMinimalGlb();
    thumbnailBytes = generateMinimalPng();
    console.log("[PIPELINE] stage 3 — bytes generated, GLB:", glbBytes.length, "thumb:", thumbnailBytes.length);

    const glbStagingPath = `${jobId}/generated.glb`;
    const thumbnailStagingPath = `${jobId}/thumbnail.png`;

    console.log("[PIPELINE] stage 3 — calling uploadFileBytes GLB staging", jobId, glbStagingPath);
    try {
      await uploadFileBytes(supabase, BUCKET_STAGING, glbStagingPath, glbBytes, "model/gltf-binary");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "stage-3-ai-generation", "failed", `GLB staging upload failed: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-3-ai-generation", msg, null);
      return retryableFailure(jobId, "stage-3-ai-generation", msg);
    }

    console.log("[PIPELINE] stage 3 — calling uploadFileBytes thumbnail staging", jobId, thumbnailStagingPath);
    try {
      await uploadFileBytes(supabase, BUCKET_STAGING, thumbnailStagingPath, thumbnailBytes, "image/png");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "stage-3-ai-generation", "failed", `Thumbnail staging upload failed: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-3-ai-generation", msg, null);
      return retryableFailure(jobId, "stage-3-ai-generation", msg);
    }

    console.log("[PIPELINE] stage 3 — calling setGeneratedFiles", jobId);
    try {
      await setGeneratedFiles(
        supabase,
        jobId,
        BUCKET_STAGING,
        glbStagingPath,
        BUCKET_STAGING,
        thumbnailStagingPath,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "stage-3-ai-generation", "failed", `Failed to record generated file paths: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-3-ai-generation", msg, null);
      return retryableFailure(jobId, "stage-3-ai-generation", msg);
    }

    await logEvent(
      supabase,
      jobId,
      "stage-3-ai-generation",
      "passed",
      `AI generation complete: GLB=${glbBytes.length}B, thumbnail=${thumbnailBytes.length}B`,
      {
        glb_staging_path: glbStagingPath,
        thumbnail_staging_path: thumbnailStagingPath,
        glb_size_bytes: glbBytes.length,
        thumbnail_size_bytes: thumbnailBytes.length,
      },
    );
  }

  console.log("[PIPELINE] stage 3 done", jobId);
  // ── Stage 4: Copyright check ──────────────────────────────────────────────
  if (job.copyright_review_result !== "clear") {
    await logEvent(supabase, jobId, "stage-4-copyright", "started", "Running copyright check");
    console.log("[PIPELINE] stage 4 start — calling checkCopyright", jobId);

    let copyrightVerdict: Awaited<ReturnType<typeof checkCopyright>>;
    try {
      copyrightVerdict = await checkCopyright(glbBytes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "stage-4-copyright", "failed", `Copyright check call failed: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-4-copyright", msg, null);
      return retryableFailure(jobId, "stage-4-copyright", msg);
    }

    console.log("[PIPELINE] stage 4 — calling setCopyrightReview, verdict:", copyrightVerdict.result, jobId);
    let updatedJob: GenerationJobRecord | null;
    try {
      updatedJob = await setCopyrightReview(
        supabase,
        jobId,
        copyrightVerdict.result,
        copyrightVerdict.confidence,
        copyrightVerdict.flags,
        copyrightVerdict.reviewedBy,
        copyrightVerdict.notes,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PIPELINE] stage 4 — setCopyrightReview threw:", msg, jobId);
      if (err instanceof Error) console.error("[PIPELINE] stage 4 — setCopyrightReview stack:", err.stack);
      await logEvent(supabase, jobId, "stage-4-copyright", "failed", `Failed to record copyright verdict: ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-4-copyright", msg, null);
      return retryableFailure(jobId, "stage-4-copyright", msg);
    }
    console.log("[PIPELINE] stage 4 — setCopyrightReview returned, updatedJob:", updatedJob !== null ? "set" : "null (CAS miss)", jobId);
    if (updatedJob === null) {
      await logEvent(supabase, jobId, "stage-4-copyright", "failed", "Copyright verdict write lost CAS race — job modified concurrently");
      return retryableFailure(jobId, "stage-4-copyright", "copyright-verdict-cas-miss");
    }
    console.log("[PIPELINE] stage 4 done — setCopyrightReview CAS passed, result:", copyrightVerdict.result, jobId);

    if (copyrightVerdict.result === "hard_fail") {
      await logEvent(
        supabase,
        jobId,
        "stage-5-copyright-gate",
        "failed",
        "Copyright check hard fail — content is permanently blocked",
        { copyright_flags: copyrightVerdict.flags },
      );
      return permanentFailure(
        jobId,
        "stage-5-copyright-gate",
        "Copyright check resulted in hard fail — content is permanently blocked",
      );
    }

    if (copyrightVerdict.result === "manual_review") {
      await logEvent(
        supabase,
        jobId,
        "stage-5-copyright-gate",
        "warning",
        "Copyright check requires manual review — job is now pending_manual_review",
        { copyright_flags: copyrightVerdict.flags, confidence: copyrightVerdict.confidence },
      );
      return {
        httpStatus: 200,
        body: {
          success: true,
          action: "process",
          job_id: jobId,
          message:
            `Generation job "${jobId}" requires manual copyright review. ` +
            `Call POST /copyright-review once the review is complete.`,
          job: updatedJob,
        },
      };
    }

    await logEvent(
      supabase,
      jobId,
      "stage-4-copyright",
      "passed",
      `Copyright check cleared (confidence=${copyrightVerdict.confidence})`,
      { confidence: copyrightVerdict.confidence },
    );
  } else {
    await logEvent(
      supabase,
      jobId,
      "stage-4-copyright",
      "skipped",
      "Copyright already cleared from prior run — skipping check",
    );
  }

  console.log("[PIPELINE] stage 5 done — copyright gate passed, proceeding to stages 6-8", jobId);

  // ── Stages 6–8: production re-check, onboarding, file promotion ──────────
  const skipOnboarding = Deno.env.get("SKIP_ONBOARDING") === "true";
  console.log("[PIPELINE] stage 5 — SKIP_ONBOARDING:", skipOnboarding, jobId);

  if (skipOnboarding) {
    console.log("[PIPELINE] stage 5 start — completeGenerationJob (SKIP_ONBOARDING path)", jobId);
    try {
      await completeGenerationJob(supabase, jobId, targetAssetId, null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEvent(supabase, jobId, "pipeline-complete", "failed", `Failed to mark job complete (skip-onboarding path): ${msg}`);
      await failGenerationJob(supabase, jobId, job.claimed_at!,false, "complete", msg, null);
      return permanentFailure(jobId, "complete", msg);
    }
    console.log("[PIPELINE] stage 5 done — completeGenerationJob (SKIP_ONBOARDING path)", jobId);
    await logEvent(supabase, jobId, "pipeline-complete", "passed", `Generation pipeline complete (onboarding skipped) for asset "${targetAssetId}"`, { resulting_asset_id: targetAssetId });
    return {
      httpStatus: 200,
      body: {
        success: true,
        action: "process",
        job_id: jobId,
        message: `Generation pipeline complete. Asset "${targetAssetId}" is ready.`,
      },
    };
  }

  // ── Stage 6: Production re-check ─────────────────────────────────────────
  await logEvent(supabase, jobId, "stage-6-production-recheck", "started", `Re-checking production status of "${targetAssetId}" before promotion`);
  console.log("[PIPELINE] stage 6 start — production re-check", jobId);

  {
    console.log("[PIPELINE] stage 6 start — supabase.from(avatar_assets).select(production_enabled)", jobId, targetAssetId);
    const { data: recheckAsset, error: recheckError } = await supabase
      .from("avatar_assets")
      .select("production_enabled")
      .eq("asset_id", targetAssetId)
      .maybeSingle();
    console.log("[PIPELINE] stage 6 — production recheck returned, recheckError:", recheckError?.message ?? "none", "recheckAsset:", recheckAsset !== null ? JSON.stringify(recheckAsset) : "null", jobId);

    if (recheckError) {
      const msg = `Production re-check query failed: ${recheckError.message}`;
      await logEvent(supabase, jobId, "stage-6-production-recheck", "failed", msg);
      await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-6-production-recheck", msg, null);
      return retryableFailure(jobId, "stage-6-production-recheck", msg);
    }

    if (recheckAsset !== null && (recheckAsset as { production_enabled: boolean }).production_enabled === true) {
      const msg = `PROMOTION_BLOCKED: target asset "${targetAssetId}" became production_enabled=true before file promotion`;
      await logEvent(supabase, jobId, "stage-6-production-recheck", "failed", msg, { target_asset_id: targetAssetId });
      await failGenerationJob(supabase, jobId, job.claimed_at!,false, "stage-6-production-recheck", msg, { target_asset_id: targetAssetId });
      return permanentFailure(jobId, "stage-6-production-recheck", msg);
    }
  }

  await logEvent(supabase, jobId, "stage-6-production-recheck", "passed", `Asset "${targetAssetId}" is safe to promote`);
  console.log("[PIPELINE] stage 6 done — production recheck passed", jobId);

  // ── Stage 7: Onboarding ───────────────────────────────────────────────────
  await logEvent(supabase, jobId, "stage-7-onboarding", "started", `Submitting asset "${targetAssetId}" to onboarding`);
  console.log("[PIPELINE] stage 7 start — buildOnboardingMetadata", jobId);

  const onboardingSubmit = deps?.onboardingSubmit ?? callOnboardingSubmit;
  const onboardingMetadata = buildOnboardingMetadata(job, glbBytes.length, triggeredBy);
  const glbStagingStoragePath = `${jobId}/generated.glb`;
  console.log("[PIPELINE] stage 7 — buildOnboardingMetadata done, glbStagingStoragePath:", glbStagingStoragePath, jobId);

  let onboardingValidationRunId: string | null = null;
  let onboardingResult: Awaited<ReturnType<typeof callOnboardingSubmit>>;
  console.log("[PIPELINE] stage 7 — calling onboardingSubmit", jobId, "triggeredBy:", triggeredBy, "glbStagingStoragePath:", glbStagingStoragePath, "onboardingMetadata:", JSON.stringify(onboardingMetadata));
  try {
    onboardingResult = await onboardingSubmit(onboardingMetadata, triggeredBy, glbStagingStoragePath);
    console.log("[PIPELINE] stage 7 — onboardingSubmit returned", jobId);
    console.log("[PIPELINE] stage 7 — onboardingResult raw:", JSON.stringify(onboardingResult), jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PIPELINE] stage 7 — onboardingSubmit threw, jobId:", jobId);
    console.error("[PIPELINE] stage 7 — err:", err);
    console.error("[PIPELINE] stage 7 — err.message:", msg);
    if (err instanceof Error) console.error("[PIPELINE] stage 7 — err.stack:", err.stack);
    console.error("[PIPELINE] stage 7 — onboardingMetadata:", JSON.stringify(onboardingMetadata));
    console.error("[PIPELINE] stage 7 — triggeredBy:", triggeredBy);
    console.error("[PIPELINE] stage 7 — glbStagingStoragePath:", glbStagingStoragePath);
    console.error("[PIPELINE] stage 7 — jobId:", jobId);
    await logEvent(supabase, jobId, "stage-7-onboarding", "failed", `Onboarding call failed: ${msg}`);
    await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-7-onboarding", msg, null);
    return retryableFailure(jobId, "stage-7-onboarding", msg);
  }

  console.log("[PIPELINE] stage 7 — checking onboardingResult.success", jobId);
  if (!onboardingResult.success) {
    const msg = `Onboarding rejected asset: ${onboardingResult.message}`;
    await logEvent(supabase, jobId, "stage-7-onboarding", "failed", msg, { validation_errors: onboardingResult.validation_errors ?? null });
    await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-7-onboarding", msg, { validation_errors: onboardingResult.validation_errors ?? null });
    return retryableFailure(jobId, "stage-7-onboarding", msg);
  }
  console.log("[PIPELINE] stage 7 — success branch entered, success:", onboardingResult.success, jobId);

  console.log("[PIPELINE] stage 7 — assigning onboardingValidationRunId", jobId);
  try {
    onboardingValidationRunId = onboardingResult.validation_run?.id ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PIPELINE] stage 7 — onboardingValidationRunId assignment threw, jobId:", jobId);
    console.error("[PIPELINE] stage 7 — err:", err);
    console.error("[PIPELINE] stage 7 — err.message:", msg);
    if (err instanceof Error) console.error("[PIPELINE] stage 7 — err.stack:", err.stack);
    console.error("[PIPELINE] stage 7 — onboardingResult at assignment throw:", JSON.stringify(onboardingResult), jobId);
    throw err;
  }
  console.log("[PIPELINE] stage 7 — onboardingValidationRunId assigned:", onboardingValidationRunId, jobId);

  console.log("[PIPELINE] stage 7 — calling logEvent passed", jobId);
  try {
    await logEvent(supabase, jobId, "stage-7-onboarding", "passed", `Onboarding accepted asset "${targetAssetId}"`, { validation_run_id: onboardingValidationRunId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PIPELINE] stage 7 — logEvent passed threw, jobId:", jobId);
    console.error("[PIPELINE] stage 7 — err:", err);
    console.error("[PIPELINE] stage 7 — err.message:", msg);
    if (err instanceof Error) console.error("[PIPELINE] stage 7 — err.stack:", err.stack);
    throw err;
  }
  console.log("[PIPELINE] stage 7 done — callOnboardingSubmit accepted, validationRunId:", onboardingValidationRunId, jobId);

  // ── Stage 8: File promotion + completion ──────────────────────────────────
  await logEvent(supabase, jobId, "stage-8-promotion", "started", `Promoting files for asset "${targetAssetId}" to production buckets`);
  const prodGlbPath = productionGlbPath(targetAssetId);
  const prodThumbnailPath = productionThumbnailPath(targetAssetId);
  console.log("[PIPELINE] stage 8 start — uploadFileBytes GLB production", jobId, prodGlbPath);

  try {
    await uploadFileBytes(supabase, BUCKET_ASSETS, prodGlbPath, glbBytes, "model/gltf-binary");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-8-promotion", "failed", `GLB promotion upload failed: ${msg}`);
    await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-8-promotion", msg, null);
    return retryableFailure(jobId, "stage-8-promotion", msg);
  }
  console.log("[PIPELINE] stage 8 done — uploadFileBytes GLB production", jobId);

  console.log("[PIPELINE] stage 8 start — uploadFileBytes thumbnail production", jobId, prodThumbnailPath);
  try {
    await uploadFileBytes(supabase, BUCKET_THUMBNAILS, prodThumbnailPath, thumbnailBytes, "image/png");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-8-promotion", "failed", `Thumbnail promotion upload failed: ${msg}`);
    await failGenerationJob(supabase, jobId, job.claimed_at!,true, "stage-8-promotion", msg, null);
    return retryableFailure(jobId, "stage-8-promotion", msg);
  }
  console.log("[PIPELINE] stage 8 done — uploadFileBytes thumbnail production", jobId);

  console.log("[PIPELINE] stage 8 start — completeGenerationJob", jobId, targetAssetId, "validationRunId:", onboardingValidationRunId);
  try {
    await completeGenerationJob(supabase, jobId, targetAssetId, onboardingValidationRunId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(supabase, jobId, "stage-8-promotion", "failed", `Failed to mark job complete: ${msg}`);
    await failGenerationJob(supabase, jobId, job.claimed_at!,false, "complete", msg, null);
    return permanentFailure(jobId, "complete", msg);
  }
  console.log("[PIPELINE] stage 8 done — completeGenerationJob", jobId);

  await logEvent(supabase, jobId, "stage-8-promotion", "passed", `Promoted GLB and thumbnail for asset "${targetAssetId}" to production buckets`);

  await logEvent(
    supabase,
    jobId,
    "pipeline-complete",
    "passed",
    `Generation pipeline complete for asset "${targetAssetId}"`,
    { resulting_asset_id: targetAssetId, validation_run_id: onboardingValidationRunId },
  );

  return {
    httpStatus: 200,
    body: {
      success: true,
      action: "process",
      job_id: jobId,
      message: `Generation pipeline complete. Asset "${targetAssetId}" is ready.`,
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
      message: `Generation failed permanently at ${stage}: ${reason}`,
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
      message: `Generation failed at ${stage} (retryable): ${reason}`,
    },
  };
}
