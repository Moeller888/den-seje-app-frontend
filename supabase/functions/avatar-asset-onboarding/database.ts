import type { SupabaseClient } from "./supabase.ts";
import type {
  AssetRecord,
  AssetStatus,
  ReviewQueueEntry,
  ReviewResolution,
  ValidatorError,
  ValidatorResponse,
  ValidationRunRecord,
} from "./types.ts";

// ── Asset operations ──────────────────────────────────────────────────────────

export async function getAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<AssetRecord | null> {
  const { data, error } = await supabase
    .from("avatar_assets")
    .select("*")
    .eq("asset_id", assetId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch asset "${assetId}": ${error.message}`);
  }
  return data as AssetRecord | null;
}

export async function createAsset(
  supabase: SupabaseClient,
  assetId: string,
  slot: string,
  displayName: string,
  initialStatus: AssetStatus,
  metadata: Record<string, unknown>,
  createdBy: string,
  storagePath: string | null,
): Promise<AssetRecord> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("avatar_assets")
    .insert({
      asset_id: assetId,
      slot,
      display_name: displayName,
      current_status: initialStatus,
      production_enabled: false,
      storage_path: storagePath,
      metadata,
      created_by: createdBy,
      created_at: now,
      last_modified_by: createdBy,
      last_modified_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create asset "${assetId}": ${error.message}`);
  }
  return data as AssetRecord;
}

export async function updateAssetMetadata(
  supabase: SupabaseClient,
  assetId: string,
  displayName: string,
  metadata: Record<string, unknown>,
  modifiedBy: string,
  storagePath: string | null,
): Promise<AssetRecord> {
  const updates: Record<string, unknown> = {
    display_name: displayName,
    metadata,
    last_modified_by: modifiedBy,
    last_modified_at: new Date().toISOString(),
  };

  if (storagePath !== null) {
    updates["storage_path"] = storagePath;
  }

  const { data, error } = await supabase
    .from("avatar_assets")
    .update(updates)
    .eq("asset_id", assetId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update metadata for asset "${assetId}": ${error.message}`);
  }
  return data as AssetRecord;
}

export async function setAssetStatus(
  supabase: SupabaseClient,
  assetId: string,
  newStatus: AssetStatus,
  modifiedBy: string,
): Promise<AssetRecord> {
  const { data, error } = await supabase
    .from("avatar_assets")
    .update({
      current_status: newStatus,
      last_modified_by: modifiedBy,
      last_modified_at: new Date().toISOString(),
    })
    .eq("asset_id", assetId)
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to set status "${newStatus}" on asset "${assetId}": ${error.message}`,
    );
  }
  return data as AssetRecord;
}

export async function setProductionEnabled(
  supabase: SupabaseClient,
  assetId: string,
  promotedBy: string,
): Promise<AssetRecord> {
  const { data, error } = await supabase
    .from("avatar_assets")
    .update({
      production_enabled: true,
      current_status: "production",
      last_modified_by: promotedBy,
      last_modified_at: new Date().toISOString(),
    })
    .eq("asset_id", assetId)
    .select()
    .single();

  if (error) {
    // The DB-level production gate trigger raises a descriptive exception.
    // Surface it verbatim so the caller gets an actionable message.
    throw new Error(
      `Cannot enable production for asset "${assetId}": ${error.message}`,
    );
  }
  return data as AssetRecord;
}

// ── Validation run operations ─────────────────────────────────────────────────

export async function insertValidationRun(
  supabase: SupabaseClient,
  assetId: string,
  triggeredBy: string,
  payload: Record<string, unknown>,
  validatorResponse: ValidatorResponse,
): Promise<ValidationRunRecord> {
  const { data, error } = await supabase
    .from("avatar_asset_validation_runs")
    .insert({
      asset_id: assetId,
      triggered_by: triggeredBy,
      payload,
      response: validatorResponse as unknown as Record<string, unknown>,
      valid: validatorResponse.valid,
      error_count: validatorResponse.errors.length,
      warning_count: validatorResponse.warnings.length,
      manual_review_count: validatorResponse.manual_review_flags.length,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to insert validation run for asset "${assetId}": ${error.message}`,
    );
  }
  return data as ValidationRunRecord;
}

export async function getValidationHistory(
  supabase: SupabaseClient,
  assetId: string,
): Promise<ValidationRunRecord[]> {
  const { data, error } = await supabase
    .from("avatar_asset_validation_runs")
    .select("*")
    .eq("asset_id", assetId)
    .order("run_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to fetch validation history for asset "${assetId}": ${error.message}`,
    );
  }
  return (data ?? []) as ValidationRunRecord[];
}

export async function getLatestPassingRun(
  supabase: SupabaseClient,
  assetId: string,
): Promise<ValidationRunRecord | null> {
  const { data, error } = await supabase
    .from("avatar_asset_validation_runs")
    .select("*")
    .eq("asset_id", assetId)
    .eq("valid", true)
    .order("run_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to fetch latest passing run for asset "${assetId}": ${error.message}`,
    );
  }

  if (!data || data.length === 0) return null;
  return data[0] as ValidationRunRecord;
}

// ── Review queue operations ───────────────────────────────────────────────────

export async function insertReviewQueueItems(
  supabase: SupabaseClient,
  assetId: string,
  validationRunId: string,
  flags: ValidatorError[],
): Promise<ReviewQueueEntry[]> {
  if (flags.length === 0) return [];

  const rows = flags.map((flag) => ({
    asset_id: assetId,
    validation_run_id: validationRunId,
    rule_id: flag.rule_id,
    severity: flag.severity,
    field: flag.field,
    message: flag.message,
    status: "pending",
  }));

  const { data, error } = await supabase
    .from("avatar_asset_review_queue")
    .insert(rows)
    .select();

  if (error) {
    throw new Error(
      `Failed to insert review queue items for asset "${assetId}": ${error.message}`,
    );
  }
  return (data ?? []) as ReviewQueueEntry[];
}

export async function getOpenReviewItems(
  supabase: SupabaseClient,
  assetId: string,
): Promise<ReviewQueueEntry[]> {
  const { data, error } = await supabase
    .from("avatar_asset_review_queue")
    .select("*")
    .eq("asset_id", assetId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to fetch open review items for asset "${assetId}": ${error.message}`,
    );
  }
  return (data ?? []) as ReviewQueueEntry[];
}

export async function getReviewItem(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<ReviewQueueEntry | null> {
  const { data, error } = await supabase
    .from("avatar_asset_review_queue")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch review item "${reviewId}": ${error.message}`);
  }
  return data as ReviewQueueEntry | null;
}

export async function resolveReviewItem(
  supabase: SupabaseClient,
  reviewId: string,
  resolvedBy: string,
  resolution: ReviewResolution,
  notes: string | null,
): Promise<ReviewQueueEntry> {
  const resolvedStatus = resolution === "dismissed" ? "dismissed" : "resolved";

  const { data, error } = await supabase
    .from("avatar_asset_review_queue")
    .update({
      status: resolvedStatus,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution,
      resolution_notes: notes,
    })
    .eq("id", reviewId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to resolve review item "${reviewId}": ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `Review item "${reviewId}" could not be resolved — it may already be resolved or does not exist`,
    );
  }
  return data as ReviewQueueEntry;
}
