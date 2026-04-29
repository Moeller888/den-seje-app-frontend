import { getServiceClient } from "./supabase.ts";
import { analyzeJobGlb, runPipeline } from "./pipeline.ts";
import {
  createIngestionJob,
  getIngestionJob,
  getJobWithEventsAndArtifacts,
  resetJobForRetry,
} from "./database.ts";
import { createSignedUploadUrl } from "./storage.ts";
import {
  badRequestResponse,
  conflictResponse,
  corsPreflightResponse,
  internalErrorResponse,
  methodNotAllowedResponse,
  notFoundResponse,
  pipelineResultToResponse,
} from "./response.ts";
import type {
  AnalyzeRequest,
  IngestionResponse,
  InitRequest,
  ProcessRequest,
  RetryRequest,
} from "./types.ts";

// deno_version = 2 is set in supabase/config.toml — Deno.serve is the correct entry point.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  const url = new URL(req.url);
  const segments = parsePathSegments(url);

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return internalErrorResponse("unknown", msg);
  }

  // ── GET /status?job_id=xxx ────────────────────────────────────────────────
  if (req.method === "GET" && segments.length === 1 && segments[0] === "status") {
    const jobId = url.searchParams.get("job_id") ?? "";
    if (jobId.trim() === "") {
      return badRequestResponse("status", "job_id query parameter is required");
    }

    try {
      const { job, events, artifacts } = await getJobWithEventsAndArtifacts(supabase, jobId);
      if (job === null) {
        return notFoundResponse("status", `Ingestion job "${jobId}" not found`);
      }
      const body: IngestionResponse = {
        success: true,
        action: "status",
        job_id: jobId,
        message: `Job status: ${job.status}`,
        job,
        events,
        artifacts,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("status", msg, jobId);
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

  if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return badRequestResponse("unknown", "Request body must be a JSON object");
  }

  const body = rawBody as Record<string, unknown>;

  // ── POST /init ────────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "init") {
    const asset_id = body["asset_id"];
    const slot = body["slot"];
    const initiated_by = body["initiated_by"];

    if (typeof asset_id !== "string" || asset_id.trim() === "") {
      return badRequestResponse("init", "asset_id field is required");
    }
    if (typeof slot !== "string" || slot.trim() === "") {
      return badRequestResponse("init", "slot field is required");
    }
    if (typeof initiated_by !== "string" || initiated_by.trim() === "") {
      return badRequestResponse("init", "initiated_by field is required");
    }

    const request: InitRequest = { asset_id, slot, initiated_by };

    try {
      let job;
      try {
        job = await createIngestionJob(
          supabase,
          request.asset_id,
          request.slot,
          "",  // staging paths are set after job creation using the job ID
          "",
          request.initiated_by,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return internalErrorResponse("init", msg);
      }

      // Paths are deterministic: {job_id}/source.glb and {job_id}/thumbnail.png
      const glbPath = `${job.id}/source.glb`;
      const thumbPath = `${job.id}/thumbnail.png`;

      // Update the job record with the staging paths
      // (We create job first so we have the UUID for path construction)
      const { error: updateError } = await supabase
        .from("avatar_ingestion_jobs")
        .update({
          staging_glb_path: glbPath,
          staging_thumbnail_path: thumbPath,
        })
        .eq("id", job.id);

      if (updateError) {
        return internalErrorResponse(
          "init",
          `Failed to set staging paths: ${updateError.message}`,
          job.id,
        );
      }

      const [glbUploadUrl, thumbUploadUrl] = await Promise.all([
        createSignedUploadUrl(supabase, "avatar-staging", glbPath),
        createSignedUploadUrl(supabase, "avatar-staging", thumbPath),
      ]);

      const responseBody: IngestionResponse = {
        success: true,
        action: "init",
        job_id: job.id,
        message: `Ingestion job created. Upload GLB and thumbnail using the signed URLs, then call POST /process.`,
        glb_upload_url: glbUploadUrl,
        thumbnail_upload_url: thumbUploadUrl,
        glb_staging_path: glbPath,
        thumbnail_staging_path: thumbPath,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("init", msg);
    }
  }

  // ── POST /analyze ─────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "analyze") {
    const job_id = body["job_id"];
    if (typeof job_id !== "string" || job_id.trim() === "") {
      return badRequestResponse("analyze", "job_id field is required");
    }

    const request: AnalyzeRequest = { job_id };

    try {
      const { result, analysis, suggestedMetadata, message } = await analyzeJobGlb(
        supabase,
        request.job_id,
      );

      if (result === "not_found") {
        return notFoundResponse("analyze", message);
      }
      if (result === "error") {
        return internalErrorResponse("analyze", message, request.job_id);
      }

      const responseBody: IngestionResponse = {
        success: true,
        action: "analyze",
        job_id: request.job_id,
        message,
        analysis: analysis ?? undefined,
        suggested_metadata: suggestedMetadata ?? undefined,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("analyze", msg, job_id);
    }
  }

  // ── POST /process ─────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "process") {
    const job_id = body["job_id"];
    const metadata = body["metadata"];

    if (typeof job_id !== "string" || job_id.trim() === "") {
      return badRequestResponse("process", "job_id field is required");
    }
    if (
      metadata === null ||
      metadata === undefined ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      return badRequestResponse(
        "process",
        "metadata field is required and must be a JSON object",
        job_id,
      );
    }

    const request: ProcessRequest = {
      job_id,
      metadata: metadata as Record<string, unknown>,
    };

    try {
      const result = await runPipeline(supabase, request.job_id, request.metadata);
      return pipelineResultToResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("process", msg, job_id);
    }
  }

  // ── POST /retry ───────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "retry") {
    const job_id = body["job_id"];
    const retried_by = body["retried_by"];

    if (typeof job_id !== "string" || job_id.trim() === "") {
      return badRequestResponse("retry", "job_id field is required");
    }
    if (typeof retried_by !== "string" || retried_by.trim() === "") {
      return badRequestResponse("retry", "retried_by field is required", job_id);
    }

    const request: RetryRequest = { job_id, retried_by };

    try {
      const job = await getIngestionJob(supabase, request.job_id);
      if (job === null) {
        return notFoundResponse("retry", `Ingestion job "${request.job_id}" not found`);
      }

      if (job.status !== "failed_retryable") {
        return conflictResponse(
          "retry",
          `Job "${request.job_id}" cannot be retried — status is "${job.status}" (must be "failed_retryable")`,
          request.job_id,
        );
      }

      if (job.retry_count >= 3) {
        return conflictResponse(
          "retry",
          `Job "${request.job_id}" has reached the maximum retry limit (${job.retry_count}/3)`,
          request.job_id,
        );
      }

      const reset = await resetJobForRetry(supabase, request.job_id, job.retry_count);
      if (reset === null) {
        return conflictResponse(
          "retry",
          `Job "${request.job_id}" could not be reset — it may have been modified concurrently`,
          request.job_id,
        );
      }

      const responseBody: IngestionResponse = {
        success: true,
        action: "retry",
        job_id: request.job_id,
        message: `Job reset to pending. Retry attempt ${reset.retry_count} of 3. Call POST /process to continue.`,
        job: reset,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("retry", msg, job_id);
    }
  }

  // ── No route matched ──────────────────────────────────────────────────────
  return notFoundResponse(
    "unknown",
    `No route matches ${req.method} /${segments.join("/")}`,
  );
});

function parsePathSegments(url: URL): string[] {
  return url.pathname
    .replace(/^\/(functions\/v1\/)?avatar-ingestion/, "")
    .split("/")
    .filter(Boolean);
}
