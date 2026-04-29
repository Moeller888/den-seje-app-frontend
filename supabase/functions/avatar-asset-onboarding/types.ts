// ── Shared primitives (mirrored from validator types) ────────────────────────

export type AssetStatus =
  | "draft"
  | "review"
  | "approved"
  | "production"
  | "deprecated";

export type ReviewResolution = "acknowledged" | "dismissed";

export type ReviewStatus = "pending" | "resolved" | "dismissed";

// ── Validator response contract ───────────────────────────────────────────────
// Exact shape returned by the deployed avatar-asset-validator function.

export interface ValidatorError {
  rule_id: string;
  severity: "HARD_FAIL" | "WARNING" | "MANUAL_REVIEW_REQUIRED";
  field: string;
  message: string;
  expected: string;
  actual: string;
}

export interface ValidatorResponse {
  valid: boolean;
  asset_id: string | null;
  errors: ValidatorError[];
  warnings: ValidatorError[];
  manual_review_flags: ValidatorError[];
}

// ── Database record shapes ────────────────────────────────────────────────────

export interface AssetRecord {
  asset_id: string;
  slot: string;
  display_name: string;
  current_status: AssetStatus;
  production_enabled: boolean;
  storage_path: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  last_modified_by: string;
  last_modified_at: string;
}

export interface ValidationRunRecord {
  id: string;
  asset_id: string;
  run_at: string;
  triggered_by: string;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  valid: boolean;
  error_count: number;
  warning_count: number;
  manual_review_count: number;
}

export interface ReviewQueueEntry {
  id: string;
  asset_id: string;
  validation_run_id: string;
  rule_id: string;
  severity: string;
  field: string;
  message: string;
  status: ReviewStatus;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution: ReviewResolution | null;
  resolution_notes: string | null;
}

// ── Inbound request bodies ────────────────────────────────────────────────────

export interface SubmitRequest {
  metadata: Record<string, unknown>;
  triggered_by: string;
  storage_path: string | null;
}

export interface ApproveRequest {
  asset_id: string;
  approved_by: string;
  notes: string | null;
}

export interface PromoteRequest {
  asset_id: string;
  promoted_by: string;
}

export interface ResolveReviewRequest {
  review_id: string;
  resolved_by: string;
  resolution: ReviewResolution;
  notes: string | null;
}

// ── Workflow result ───────────────────────────────────────────────────────────
// Every workflow function returns one of these.
// index.ts reads httpStatus and body to build the HTTP response.

export interface WorkflowResult {
  httpStatus: number;
  body: OnboardingResponse;
}

// ── Outbound response body ────────────────────────────────────────────────────

export interface OnboardingResponse {
  success: boolean;
  action: string;
  asset_id: string | null;
  message: string;
  asset?: AssetRecord;
  validation_run?: ValidationRunRecord;
  validation_errors?: ValidatorError[];
  validation_warnings?: ValidatorError[];
  validation_manual_review_flags?: ValidatorError[];
  review_items_created?: number;
  open_review_items?: ReviewQueueEntry[];
  validation_history?: ValidationRunRecord[];
}
