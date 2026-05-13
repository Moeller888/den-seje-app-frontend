// ── Job status machine ────────────────────────────────────────────────────────

export type GenerationJobStatus =
  | "pending"
  | "generating"
  | "pending_manual_review"
  | "complete"
  | "failed_retryable"
  | "failed_permanent";

export type EventOutcome = "started" | "passed" | "failed" | "skipped" | "warning";

export type CopyrightReviewResult = "clear" | "manual_review" | "hard_fail";

export type ManualReviewResolution = "approved" | "rejected";

// ── Database record shapes ────────────────────────────────────────────────────

export interface GenerationJobRecord {
  id: string;
  target_asset_id: string;
  slot: string;
  generation_prompt: string;
  negative_prompt: string | null;
  policy_prompt: string;
  model_provider: string;
  model_version: string;
  concept_image_bucket: string | null;
  concept_image_path: string | null;
  generated_glb_bucket: string | null;
  generated_glb_path: string | null;
  generated_thumbnail_bucket: string | null;
  generated_thumbnail_path: string | null;
  generated_files: {
    glb_bucket: string;
    glb_path: string;
    thumbnail_bucket: string;
    thumbnail_path: string;
  } | null;
  status: GenerationJobStatus;
  retry_count: number;
  provider_job_id: string | null;
  version: number;
  initiated_by: string;
  initiated_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  copyright_review_result: CopyrightReviewResult | null;
  copyright_confidence: number | null;
  copyright_flags: Record<string, unknown> | null;
  copyright_reviewed_by: string | null;
  copyright_reviewed_at: string | null;
  copyright_review_notes: string | null;
  manual_review_required: boolean;
  manual_review_resolved_by: string | null;
  manual_review_resolved_at: string | null;
  manual_review_resolution: ManualReviewResolution | null;
  manual_review_resolution_notes: string | null;
  failure_stage: string | null;
  failure_reason: string | null;
  failure_details: Record<string, unknown> | null;
  resulting_asset_id: string | null;
  onboarding_validation_run_id: string | null;
}

export interface GenerationEventRecord {
  id: string;
  job_id: string;
  event_at: string;
  stage: string;
  outcome: EventOutcome;
  message: string;
  details: Record<string, unknown> | null;
}

// ── Inbound request bodies ────────────────────────────────────────────────────

export interface InitRequest {
  slot: string;
  generation_prompt: string;
  negative_prompt: string | null;
  policy_prompt: string;
  model_provider: string;
  model_version: string;
  initiated_by: string;
  concept_image_bucket: string | null;
  concept_image_path: string | null;
}

export interface ProcessRequest {
  job_id: string;
}

export interface RetryRequest {
  job_id: string;
  retried_by: string;
}

export interface CopyrightReviewRequest {
  job_id: string;
  resolution: ManualReviewResolution;
  resolved_by: string;
  notes: string | null;
}

// ── Pipeline result ───────────────────────────────────────────────────────────

export interface PipelineResult {
  httpStatus: number;
  body: GenerationResponse;
}

// ── Outbound response body ────────────────────────────────────────────────────

export interface GenerationResponse {
  success: boolean;
  action: string;
  job_id: string | null;
  message: string;
  job?: GenerationJobRecord;
  events?: GenerationEventRecord[];
  validation_errors?: unknown[];
}
