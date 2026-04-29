import type { SupabaseClient } from "./supabase.ts";
import type {
  ApproveRequest,
  AssetRecord,
  AssetStatus,
  OnboardingResponse,
  PromoteRequest,
  ResolveReviewRequest,
  SubmitRequest,
  WorkflowResult,
} from "./types.ts";
import { callValidator } from "./validator-client.ts";
import { verifyAssetFileExists } from "./storage.ts";
import {
  createAsset,
  getAsset,
  getLatestPassingRun,
  getOpenReviewItems,
  getReviewItem,
  getValidationHistory,
  insertReviewQueueItems,
  insertValidationRun,
  resolveReviewItem,
  setAssetStatus,
  setProductionEnabled,
  updateAssetMetadata,
} from "./database.ts";

// ── Internal helpers ──────────────────────────────────────────────────────────

function extractStringField(
  obj: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}

function extractAssetId(metadata: Record<string, unknown>): string | null {
  return extractStringField(metadata, ["identity", "asset_id"]);
}

function extractSlot(metadata: Record<string, unknown>): string | null {
  return extractStringField(metadata, ["identity", "slot"]);
}

function extractDisplayName(metadata: Record<string, unknown>): string | null {
  return extractStringField(metadata, ["identity", "display_name"]);
}

function extractStatus(metadata: Record<string, unknown>): AssetStatus | null {
  const s = extractStringField(metadata, ["identity", "status"]);
  const valid: AssetStatus[] = [
    "draft", "review", "approved", "production", "deprecated",
  ];
  return valid.includes(s as AssetStatus) ? (s as AssetStatus) : null;
}

function fail(
  action: string,
  httpStatus: number,
  message: string,
  assetId: string | null,
  extra?: Partial<OnboardingResponse>,
): WorkflowResult {
  return {
    httpStatus,
    body: {
      success: false,
      action,
      asset_id: assetId,
      message,
      ...extra,
    },
  };
}

function ok(
  action: string,
  message: string,
  assetId: string | null,
  extra?: Partial<OnboardingResponse>,
): WorkflowResult {
  return {
    httpStatus: 200,
    body: {
      success: true,
      action,
      asset_id: assetId,
      message,
      ...extra,
    },
  };
}

// ── Submit ────────────────────────────────────────────────────────────────────
// Full onboarding pipeline:
//   1. Optional storage verification
//   2. Validator call
//   3. Schema failure → return immediately, no DB writes
//   4. Hard fail on new asset → return immediately, no DB writes
//   5. Hard fail on existing asset → persist run for history, return 422
//   6. Valid → upsert asset, persist run, create review queue items, return 200

export async function handleSubmit(
  supabase: SupabaseClient,
  request: SubmitRequest,
): Promise<WorkflowResult> {
  const ACTION = "submit";

  const { metadata, triggered_by, storage_path } = request;

  if (!triggered_by || triggered_by.trim() === "") {
    return fail(ACTION, 400, "triggered_by is required", null);
  }
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return fail(ACTION, 400, "metadata must be a JSON object", null);
  }

  // Step 1: verify storage file if a path was provided
  if (storage_path !== null && storage_path !== undefined) {
    const storageResult = await verifyAssetFileExists(supabase, storage_path);
    if (!storageResult.exists) {
      return fail(ACTION, 400, storageResult.error ?? "Storage file not found", null);
    }
  }

  // Step 2: call the validator
  let validatorResponse;
  try {
    validatorResponse = await callValidator(metadata);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `Validator call failed: ${message}`, null);
  }

  const assetId = validatorResponse.asset_id ?? extractAssetId(metadata);

  // Step 3: schema failure — no asset_id can be reliably extracted, abort without DB writes
  if (!validatorResponse.valid && assetId === null) {
    return fail(ACTION, 422, "Metadata failed schema validation — see validation_errors", null, {
      validation_errors: validatorResponse.errors,
      validation_warnings: validatorResponse.warnings,
      validation_manual_review_flags: validatorResponse.manual_review_flags,
    });
  }

  const existingAsset = assetId ? await getAsset(supabase, assetId) : null;

  // Step 4: hard fail on a brand-new asset — nothing to attach history to
  if (!validatorResponse.valid && existingAsset === null) {
    return fail(
      ACTION,
      422,
      "Metadata failed validation — correct all errors before submitting",
      assetId,
      {
        validation_errors: validatorResponse.errors,
        validation_warnings: validatorResponse.warnings,
        validation_manual_review_flags: validatorResponse.manual_review_flags,
      },
    );
  }

  // Step 5: hard fail on an existing asset — persist run for history, return 422
  if (!validatorResponse.valid && existingAsset !== null) {
    let run;
    try {
      run = await insertValidationRun(
        supabase,
        existingAsset.asset_id,
        triggered_by,
        metadata,
        validatorResponse,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(ACTION, 500, `DB error persisting failed validation run: ${message}`, assetId);
    }

    return fail(
      ACTION,
      422,
      "Metadata failed validation — correct all errors and resubmit",
      existingAsset.asset_id,
      {
        validation_run: run,
        validation_errors: validatorResponse.errors,
        validation_warnings: validatorResponse.warnings,
        validation_manual_review_flags: validatorResponse.manual_review_flags,
      },
    );
  }

  // Step 6: validation passed — upsert asset, persist run, create review queue items
  const slot = extractSlot(metadata) ?? "";
  const displayName = extractDisplayName(metadata) ?? assetId ?? "";
  const declaredStatus = extractStatus(metadata) ?? "draft";

  let asset: AssetRecord;
  try {
    if (existingAsset === null) {
      asset = await createAsset(
        supabase,
        assetId!,
        slot,
        displayName,
        declaredStatus,
        metadata,
        triggered_by,
        storage_path ?? null,
      );
    } else {
      asset = await updateAssetMetadata(
        supabase,
        existingAsset.asset_id,
        displayName,
        metadata,
        triggered_by,
        storage_path ?? null,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `DB error upserting asset: ${message}`, assetId);
  }

  let run;
  try {
    run = await insertValidationRun(
      supabase,
      asset.asset_id,
      triggered_by,
      metadata,
      validatorResponse,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `DB error persisting validation run: ${message}`, asset.asset_id);
  }

  let reviewItems;
  try {
    reviewItems = await insertReviewQueueItems(
      supabase,
      asset.asset_id,
      run.id,
      validatorResponse.manual_review_flags,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `DB error creating review queue items: ${message}`, asset.asset_id);
  }

  const openItems = await getOpenReviewItems(supabase, asset.asset_id);

  const hasWarnings = validatorResponse.warnings.length > 0;
  const hasManualReview = validatorResponse.manual_review_flags.length > 0;
  const messageParts: string[] = ["Asset onboarded successfully"];
  if (hasWarnings) {
    messageParts.push(`${validatorResponse.warnings.length} warning(s) recorded`);
  }
  if (hasManualReview) {
    messageParts.push(
      `${validatorResponse.manual_review_flags.length} manual review item(s) created`,
    );
  }

  return ok(ACTION, messageParts.join(" — "), asset.asset_id, {
    asset,
    validation_run: run,
    validation_errors: validatorResponse.errors,
    validation_warnings: validatorResponse.warnings,
    validation_manual_review_flags: validatorResponse.manual_review_flags,
    review_items_created: reviewItems.length,
    open_review_items: openItems,
  });
}

// ── Approve ───────────────────────────────────────────────────────────────────
// Transitions an asset to 'approved' status.
// Requires: at least one passing validation run.
// Requires: no open manual review queue items.
// Does NOT re-run the validator — approval is a human decision
// that confirms the most recent passing validation run is acceptable.

export async function handleApprove(
  supabase: SupabaseClient,
  request: ApproveRequest,
): Promise<WorkflowResult> {
  const ACTION = "approve";

  const { asset_id, approved_by, notes } = request;

  if (!asset_id || asset_id.trim() === "") {
    return fail(ACTION, 400, "asset_id is required", null);
  }
  if (!approved_by || approved_by.trim() === "") {
    return fail(ACTION, 400, "approved_by is required", null);
  }

  const asset = await getAsset(supabase, asset_id);
  if (asset === null) {
    return fail(ACTION, 404, `Asset "${asset_id}" not found`, asset_id);
  }

  if (asset.current_status === "approved" || asset.current_status === "production") {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" is already in status "${asset.current_status}" — no further approval is needed`,
      asset_id,
      { asset },
    );
  }

  if (asset.current_status === "deprecated") {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" is deprecated and cannot be approved`,
      asset_id,
      { asset },
    );
  }

  const latestPassingRun = await getLatestPassingRun(supabase, asset_id);
  if (latestPassingRun === null) {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" has no passing validation run — run validation before approving`,
      asset_id,
      { asset },
    );
  }

  const openItems = await getOpenReviewItems(supabase, asset_id);
  if (openItems.length > 0) {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" has ${openItems.length} open manual review item(s) — resolve all before approving`,
      asset_id,
      { asset, open_review_items: openItems },
    );
  }

  // notes is accepted for audit purposes but not stored on the asset record itself —
  // it belongs in an external approval document or review system.
  void notes;

  let updated: AssetRecord;
  try {
    updated = await setAssetStatus(supabase, asset_id, "approved", approved_by);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `DB error approving asset: ${message}`, asset_id);
  }

  return ok(
    ACTION,
    `Asset "${asset_id}" approved by "${approved_by}"`,
    asset_id,
    { asset: updated, validation_run: latestPassingRun },
  );
}

// ── Promote ───────────────────────────────────────────────────────────────────
// Promotes an 'approved' asset to production.
// Requires: current_status = 'approved'.
// Requires: at least one passing validation run.
// Requires: no open manual review items.
// Re-runs the validator with production_enabled: true set in the metadata.
// The validator enforces all production requirements (texture_embedded,
// rollout_stage, school_safe, whitelist_approved, all validation flags, etc.).
// If the re-validation passes, production_enabled is set in the DB.
// If it fails, the validator errors are returned with no state change.

export async function handlePromote(
  supabase: SupabaseClient,
  request: PromoteRequest,
): Promise<WorkflowResult> {
  const ACTION = "promote";

  const { asset_id, promoted_by } = request;

  if (!asset_id || asset_id.trim() === "") {
    return fail(ACTION, 400, "asset_id is required", null);
  }
  if (!promoted_by || promoted_by.trim() === "") {
    return fail(ACTION, 400, "promoted_by is required", null);
  }

  const asset = await getAsset(supabase, asset_id);
  if (asset === null) {
    return fail(ACTION, 404, `Asset "${asset_id}" not found`, asset_id);
  }

  if (asset.current_status === "production" && asset.production_enabled) {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" is already in production`,
      asset_id,
      { asset },
    );
  }

  if (asset.current_status !== "approved") {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" has status "${asset.current_status}" — only "approved" assets can be promoted to production`,
      asset_id,
      { asset },
    );
  }

  const latestPassingRun = await getLatestPassingRun(supabase, asset_id);
  if (latestPassingRun === null) {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" has no passing validation run — validate before promoting`,
      asset_id,
      { asset },
    );
  }

  const openItems = await getOpenReviewItems(supabase, asset_id);
  if (openItems.length > 0) {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" has ${openItems.length} open manual review item(s) — resolve all before promoting`,
      asset_id,
      { asset, open_review_items: openItems },
    );
  }

  // Build the production promotion payload: take the stored metadata and
  // set production_enabled: true. The validator will enforce all production
  // requirements (RULE-REL-001/002/006, RULE-CMP-001/003/004, etc.).
  const productionMetadata: Record<string, unknown> = JSON.parse(
    JSON.stringify(asset.metadata),
  );

  const deployment = productionMetadata["deployment"];
  if (
    deployment === null ||
    typeof deployment !== "object" ||
    Array.isArray(deployment)
  ) {
    return fail(
      ACTION,
      409,
      `Asset "${asset_id}" metadata has a malformed deployment section — resubmit the asset`,
      asset_id,
      { asset },
    );
  }

  (deployment as Record<string, unknown>)["production_enabled"] = true;

  let validatorResponse;
  try {
    validatorResponse = await callValidator(productionMetadata);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `Validator call failed during promotion: ${message}`, asset_id);
  }

  // Persist the promotion validation run regardless of outcome.
  let run;
  try {
    run = await insertValidationRun(
      supabase,
      asset_id,
      promoted_by,
      productionMetadata,
      validatorResponse,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(
      ACTION,
      500,
      `DB error persisting promotion validation run: ${message}`,
      asset_id,
    );
  }

  // Create review queue items for any new manual review flags raised.
  if (validatorResponse.manual_review_flags.length > 0) {
    try {
      await insertReviewQueueItems(
        supabase,
        asset_id,
        run.id,
        validatorResponse.manual_review_flags,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(
        ACTION,
        500,
        `DB error creating review queue items during promotion: ${message}`,
        asset_id,
      );
    }
  }

  if (!validatorResponse.valid) {
    return fail(
      ACTION,
      422,
      "Asset did not pass production validation — correct all errors and resubmit before promoting",
      asset_id,
      {
        asset,
        validation_run: run,
        validation_errors: validatorResponse.errors,
        validation_warnings: validatorResponse.warnings,
        validation_manual_review_flags: validatorResponse.manual_review_flags,
      },
    );
  }

  // Validator passed with production_enabled: true — commit the promotion.
  let promoted: AssetRecord;
  try {
    promoted = await setProductionEnabled(supabase, asset_id, promoted_by);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The DB-level production gate trigger may also fire here as a second line
    // of defence. Surface its message directly.
    return fail(ACTION, 409, message, asset_id, { asset });
  }

  // Store the production metadata (with production_enabled: true) as the
  // canonical metadata for this asset now that it is in production.
  try {
    await updateAssetMetadata(
      supabase,
      asset_id,
      promoted.display_name,
      productionMetadata,
      promoted_by,
      promoted.storage_path,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(
      ACTION,
      500,
      `Asset promoted but failed to persist production metadata: ${message}`,
      asset_id,
      { asset: promoted, validation_run: run },
    );
  }

  const finalAsset = await getAsset(supabase, asset_id);

  return ok(
    ACTION,
    `Asset "${asset_id}" promoted to production by "${promoted_by}"`,
    asset_id,
    {
      asset: finalAsset ?? promoted,
      validation_run: run,
      validation_warnings: validatorResponse.warnings,
      validation_manual_review_flags: validatorResponse.manual_review_flags,
    },
  );
}

// ── Resolve review ────────────────────────────────────────────────────────────
// Marks a manual review queue item as resolved or dismissed.
// Once all pending items for an asset are cleared, the approve and promote
// workflows become unblocked.

export async function handleResolveReview(
  supabase: SupabaseClient,
  request: ResolveReviewRequest,
): Promise<WorkflowResult> {
  const ACTION = "resolve_review";

  const { review_id, resolved_by, resolution, notes } = request;

  if (!review_id || review_id.trim() === "") {
    return fail(ACTION, 400, "review_id is required", null);
  }
  if (!resolved_by || resolved_by.trim() === "") {
    return fail(ACTION, 400, "resolved_by is required", null);
  }
  if (resolution !== "acknowledged" && resolution !== "dismissed") {
    return fail(
      ACTION,
      400,
      'resolution must be "acknowledged" or "dismissed"',
      null,
    );
  }

  const item = await getReviewItem(supabase, review_id);
  if (item === null) {
    return fail(ACTION, 404, `Review item "${review_id}" not found`, null);
  }

  if (item.status !== "pending") {
    return fail(
      ACTION,
      409,
      `Review item "${review_id}" is already ${item.status} — cannot resolve again`,
      item.asset_id,
    );
  }

  let resolved;
  try {
    resolved = await resolveReviewItem(
      supabase,
      review_id,
      resolved_by,
      resolution,
      notes,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(ACTION, 500, `DB error resolving review item: ${message}`, item.asset_id);
  }

  const remainingOpen = await getOpenReviewItems(supabase, item.asset_id);

  return ok(
    ACTION,
    `Review item "${review_id}" ${resolution === "dismissed" ? "dismissed" : "acknowledged"} by "${resolved_by}" — ${remainingOpen.length} item(s) still open`,
    item.asset_id,
    {
      open_review_items: remainingOpen,
    },
  );
}

// ── Status ────────────────────────────────────────────────────────────────────
// Returns the full current state of an asset:
// the asset record, full validation history, and all open review items.

export async function handleGetStatus(
  supabase: SupabaseClient,
  assetId: string,
): Promise<WorkflowResult> {
  const ACTION = "get_status";

  if (!assetId || assetId.trim() === "") {
    return fail(ACTION, 400, "asset_id query parameter is required", null);
  }

  const asset = await getAsset(supabase, assetId);
  if (asset === null) {
    return fail(ACTION, 404, `Asset "${assetId}" not found`, assetId);
  }

  const [history, openItems] = await Promise.all([
    getValidationHistory(supabase, assetId),
    getOpenReviewItems(supabase, assetId),
  ]);

  return ok(
    ACTION,
    `Status for asset "${assetId}"`,
    assetId,
    {
      asset,
      validation_history: history,
      open_review_items: openItems,
    },
  );
}
