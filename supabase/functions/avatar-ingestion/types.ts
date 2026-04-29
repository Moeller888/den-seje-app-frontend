// ── Job status machine ────────────────────────────────────────────────────────

export type IngestionJobStatus =
  | "pending"
  | "validating"
  | "valid"
  | "failed_retryable"
  | "failed_permanent"
  | "complete";

export type EventOutcome = "started" | "passed" | "failed" | "skipped" | "warning";

export type ArtifactType =
  | "glb_staged"
  | "thumbnail_staged"
  | "glb_production"
  | "thumbnail_production";

export type ArtifactStatus = "staged" | "promoted" | "deleted";

// ── Database record shapes ────────────────────────────────────────────────────

export interface IngestionJobRecord {
  id: string;
  asset_id: string;
  slot: string;
  status: IngestionJobStatus;
  retry_count: number;
  initiated_by: string;
  initiated_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  staging_glb_path: string;
  staging_thumbnail_path: string;
  measured_file_size_kb: number | null;
  measured_poly_count: number | null;
  measured_texture_embedded: boolean | null;
  measured_texture_format: string | null;
  measured_texture_resolution: string | null;
  measured_attachment_bones: string[] | null;
  failure_stage: string | null;
  failure_reason: string | null;
  failure_details: Record<string, unknown> | null;
  onboarding_asset_id: string | null;
  onboarding_validation_run_id: string | null;
}

export interface IngestionEventRecord {
  id: string;
  job_id: string;
  event_at: string;
  stage: string;
  outcome: EventOutcome;
  message: string;
  details: Record<string, unknown> | null;
}

export interface IngestionArtifactRecord {
  id: string;
  job_id: string;
  artifact_type: ArtifactType;
  bucket: string;
  storage_path: string;
  file_size_bytes: number | null;
  content_hash: string | null;
  status: ArtifactStatus;
  created_at: string;
  promoted_at: string | null;
  deleted_at: string | null;
}

// ── GLB analysis output ───────────────────────────────────────────────────────
// Returned by glb-validator.ts. These are the measured authority values.
// All technical.* metadata fields must be overwritten with these before validation.

export interface GlbAnalysisResult {
  fileSizeBytes: number;
  polyCount: number;
  textureEmbedded: boolean;
  textureFormat: string | null;
  textureWidth: number | null;
  textureHeight: number | null;
  attachmentBones: string[];
}

// ── Naming validation output ──────────────────────────────────────────────────

export interface NamingValidationError {
  rule_id: string;
  field: string;
  message: string;
}

// ── Inbound request bodies ────────────────────────────────────────────────────

export interface InitRequest {
  asset_id: string;
  slot: string;
  initiated_by: string;
}

export interface AnalyzeRequest {
  job_id: string;
}

export interface ProcessRequest {
  job_id: string;
  metadata: Record<string, unknown>;
}

export interface RetryRequest {
  job_id: string;
  retried_by: string;
}

// ── Pipeline result ───────────────────────────────────────────────────────────

export interface PipelineResult {
  httpStatus: number;
  body: IngestionResponse;
}

// ── Outbound response body ────────────────────────────────────────────────────

export interface IngestionResponse {
  success: boolean;
  action: string;
  job_id: string | null;
  message: string;
  job?: IngestionJobRecord;
  events?: IngestionEventRecord[];
  artifacts?: IngestionArtifactRecord[];
  glb_upload_url?: string;
  thumbnail_upload_url?: string;
  glb_staging_path?: string;
  thumbnail_staging_path?: string;
  analysis?: GlbAnalysisResult;
  suggested_metadata?: Record<string, unknown>;
  validation_errors?: unknown[];
}
