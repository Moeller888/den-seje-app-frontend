import { getServiceClient } from "./supabase.ts";
import {
  handleApprove,
  handleGetStatus,
  handlePromote,
  handleResolveReview,
  handleSubmit,
} from "./workflow.ts";
import {
  badRequestResponse,
  corsPreflightResponse,
  internalErrorResponse,
  methodNotAllowedResponse,
  notFoundResponse,
  workflowResultToResponse,
} from "./response.ts";
import type {
  ApproveRequest,
  PromoteRequest,
  ResolveReviewRequest,
  SubmitRequest,
} from "./types.ts";

// Parses the path segments after the function prefix.
// /functions/v1/avatar-asset-onboarding/approve → ["approve"]
// /functions/v1/avatar-asset-onboarding         → []
function parsePathSegments(url: URL): string[] {
  return url.pathname
    .replace(/^\/(functions\/v1\/)?avatar-asset-onboarding/, "")
    .split("/")
    .filter(Boolean);
}

// Deno.serve is the canonical entry point in Deno 2.x.
// This project configures deno_version = 2 in supabase/config.toml.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  const url = new URL(req.url);
  const segments = parsePathSegments(url);

  // ── GET /status?asset_id=xxx ─────────────────────────────────────────────
  if (
    req.method === "GET" &&
    segments.length === 1 &&
    segments[0] === "status"
  ) {
    const assetId = url.searchParams.get("asset_id") ?? "";
    if (!assetId) {
      return badRequestResponse("get_status", "asset_id query parameter is required");
    }

    let supabase;
    try {
      supabase = getServiceClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("get_status", msg);
    }

    try {
      const result = await handleGetStatus(supabase, assetId);
      return workflowResultToResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("get_status", msg);
    }
  }

  // All remaining routes require POST.
  if (req.method !== "POST") {
    return methodNotAllowedResponse(req.method);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return badRequestResponse("unknown", "Request body could not be parsed as JSON");
  }

  if (
    rawBody === null ||
    typeof rawBody !== "object" ||
    Array.isArray(rawBody)
  ) {
    return badRequestResponse("unknown", "Request body must be a JSON object");
  }

  const body = rawBody as Record<string, unknown>;

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return internalErrorResponse("unknown", msg);
  }

  // ── POST / — submit asset ─────────────────────────────────────────────────
  if (segments.length === 0) {
    const metadata = body["metadata"];
    if (
      metadata === null ||
      metadata === undefined ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      return badRequestResponse("submit", "metadata field is required and must be a JSON object");
    }

    const triggered_by = body["triggered_by"];
    if (typeof triggered_by !== "string" || triggered_by.trim() === "") {
      return badRequestResponse("submit", "triggered_by field is required");
    }

    const storage_path =
      typeof body["storage_path"] === "string" ? body["storage_path"] : null;

    const request: SubmitRequest = {
      metadata: metadata as Record<string, unknown>,
      triggered_by,
      storage_path,
    };

    try {
      const result = await handleSubmit(supabase, request);
      return workflowResultToResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("submit", msg);
    }
  }

  // ── POST /approve ─────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "approve") {
    const asset_id = body["asset_id"];
    const approved_by = body["approved_by"];

    if (typeof asset_id !== "string" || asset_id.trim() === "") {
      return badRequestResponse("approve", "asset_id field is required");
    }
    if (typeof approved_by !== "string" || approved_by.trim() === "") {
      return badRequestResponse("approve", "approved_by field is required");
    }

    const notes =
      typeof body["notes"] === "string" ? body["notes"] : null;

    const request: ApproveRequest = { asset_id, approved_by, notes };

    try {
      const result = await handleApprove(supabase, request);
      return workflowResultToResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("approve", msg);
    }
  }

  // ── POST /promote ─────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "promote") {
    const asset_id = body["asset_id"];
    const promoted_by = body["promoted_by"];

    if (typeof asset_id !== "string" || asset_id.trim() === "") {
      return badRequestResponse("promote", "asset_id field is required");
    }
    if (typeof promoted_by !== "string" || promoted_by.trim() === "") {
      return badRequestResponse("promote", "promoted_by field is required");
    }

    const request: PromoteRequest = { asset_id, promoted_by };

    try {
      const result = await handlePromote(supabase, request);
      return workflowResultToResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("promote", msg);
    }
  }

  // ── POST /review/resolve ──────────────────────────────────────────────────
  if (
    segments.length === 2 &&
    segments[0] === "review" &&
    segments[1] === "resolve"
  ) {
    const review_id = body["review_id"];
    const resolved_by = body["resolved_by"];
    const resolution = body["resolution"];

    if (typeof review_id !== "string" || review_id.trim() === "") {
      return badRequestResponse("resolve_review", "review_id field is required");
    }
    if (typeof resolved_by !== "string" || resolved_by.trim() === "") {
      return badRequestResponse("resolve_review", "resolved_by field is required");
    }
    if (resolution !== "acknowledged" && resolution !== "dismissed") {
      return badRequestResponse(
        "resolve_review",
        'resolution field must be "acknowledged" or "dismissed"',
      );
    }

    const notes =
      typeof body["notes"] === "string" ? body["notes"] : null;

    const request: ResolveReviewRequest = {
      review_id,
      resolved_by,
      resolution,
      notes,
    };

    try {
      const result = await handleResolveReview(supabase, request);
      return workflowResultToResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("resolve_review", msg);
    }
  }

  // ── No route matched ──────────────────────────────────────────────────────
  return notFoundResponse(
    "unknown",
    `No route matches ${req.method} /${segments.join("/")}`,
  );
});
