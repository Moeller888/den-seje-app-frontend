import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getServiceClient } from "./supabase.ts";
import { runGenerationPipeline } from "./pipeline.ts";
import {
  claimGenerationJob,
  createGenerationJob,
  deriveTargetAssetId,
  exhaustRetries,
  getGenerationJob,
  getJobWithEvents,
  insertGenerationEvent,
  MAX_RETRIES,
  recoverStuckJob,
  resetJobForRetry,
  resolveManualReview,
} from "./database.ts";
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
  CopyrightReviewRequest,
  GenerationResponse,
  InitRequest,
  ProcessRequest,
  RetryRequest,
} from "./types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Verifies the caller's JWT and checks that they have the super_admin role
// in the profiles table. Returns null on success, or a Response on failure.
async function requireSuperAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  // Use the service client to read profiles so this check cannot be
  // circumvented by RLS — the service role bypasses all policies.
  const serviceClient = getServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }

  return null;
}

// deno_version = 2 is set in supabase/config.toml — Deno.serve is the correct entry point.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  // All routes require a verified super_admin caller.
  const authDenial = await requireSuperAdmin(req);
  if (authDenial !== null) {
    return authDenial;
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
      const { job, events } = await getJobWithEvents(supabase, jobId);
      if (job === null) {
        return notFoundResponse("status", `Generation job "${jobId}" not found`);
      }
      const body: GenerationResponse = {
        success: true,
        action: "status",
        job_id: jobId,
        message: `Job status: ${job.status}`,
        job,
        events,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: CORS_HEADERS,
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
    const slot = body["slot"];
    const generation_prompt = body["generation_prompt"];
    const negative_prompt = body["negative_prompt"] ?? null;
    const policy_prompt = body["policy_prompt"];
    const model_provider = body["model_provider"];
    const model_version = body["model_version"];
    const initiated_by = body["initiated_by"];
    const concept_image_bucket = body["concept_image_bucket"] ?? null;
    const concept_image_path = body["concept_image_path"] ?? null;

    if (typeof slot !== "string" || slot.trim() === "") {
      return badRequestResponse("init", "slot field is required");
    }
    if (typeof generation_prompt !== "string" || generation_prompt.trim() === "") {
      return badRequestResponse("init", "generation_prompt field is required");
    }
    if (typeof policy_prompt !== "string" || policy_prompt.trim() === "") {
      return badRequestResponse("init", "policy_prompt field is required");
    }
    if (typeof model_provider !== "string" || model_provider.trim() === "") {
      return badRequestResponse("init", "model_provider field is required");
    }
    if (typeof model_version !== "string" || model_version.trim() === "") {
      return badRequestResponse("init", "model_version field is required");
    }
    if (typeof initiated_by !== "string" || initiated_by.trim() === "") {
      return badRequestResponse("init", "initiated_by field is required");
    }
    if (negative_prompt !== null && typeof negative_prompt !== "string") {
      return badRequestResponse("init", "negative_prompt must be a string or null");
    }

    // Concept image fields: must both be set or both null.
    const hasBucket = concept_image_bucket !== null;
    const hasPath = concept_image_path !== null;
    if (hasBucket !== hasPath) {
      return badRequestResponse(
        "init",
        "concept_image_bucket and concept_image_path must both be set or both be null",
      );
    }
    if (hasBucket && typeof concept_image_bucket !== "string") {
      return badRequestResponse("init", "concept_image_bucket must be a string");
    }
    if (hasPath && typeof concept_image_path !== "string") {
      return badRequestResponse("init", "concept_image_path must be a string");
    }

    const request: InitRequest = {
      slot,
      generation_prompt,
      negative_prompt: typeof negative_prompt === "string" ? negative_prompt : null,
      policy_prompt,
      model_provider,
      model_version,
      initiated_by,
      concept_image_bucket: hasBucket ? (concept_image_bucket as string) : null,
      concept_image_path: hasPath ? (concept_image_path as string) : null,
    };

    try {
      const jobId = crypto.randomUUID();
      const targetAssetId = deriveTargetAssetId(request.slot, jobId);

      let job;
      try {
        job = await createGenerationJob(
          supabase,
          jobId,
          request.slot,
          request.generation_prompt,
          request.negative_prompt,
          request.policy_prompt,
          request.model_provider,
          request.model_version,
          request.initiated_by,
          request.concept_image_bucket,
          request.concept_image_path,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return internalErrorResponse("init", msg);
      }

      const responseBody: GenerationResponse = {
        success: true,
        action: "init",
        job_id: job.id,
        message:
          `Generation job created for slot "${request.slot}". ` +
          `target_asset_id="${targetAssetId}". Call POST /process to start generation.`,
        job,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("init", msg);
    }
  }

  // ── POST /process ─────────────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "process") {
    const job_id = body["job_id"];

    if (typeof job_id !== "string" || job_id.trim() === "") {
      return badRequestResponse("process", "job_id field is required");
    }

    const request: ProcessRequest = { job_id };

    try {
      // Fetch the job to validate it exists and is in 'pending' state.
      // The status check here is informational — the real atomicity guard is
      // claimGenerationJob below, which uses a server-side UPDATE WHERE status='pending'.
      const job = await getGenerationJob(supabase, request.job_id);
      if (job === null) {
        return notFoundResponse("process", `Generation job "${request.job_id}" not found`);
      }
      if (job.status !== "pending") {
        return conflictResponse(
          "process",
          `Job "${request.job_id}" cannot be started — current status is "${job.status}" (must be "pending")`,
          request.job_id,
        );
      }

      // Atomically claim the job. Returns null if the job is no longer pending
      // (e.g. claimed concurrently by the worker or another HTTP caller).
      const claimed = await claimGenerationJob(supabase, request.job_id);
      if (claimed === null) {
        return conflictResponse(
          "process",
          `Job "${request.job_id}" could not be claimed — it was taken by a concurrent caller`,
          request.job_id,
        );
      }

      const result = await runGenerationPipeline(supabase, claimed);
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

    // Stale-claim threshold must match STALE_CLAIM_THRESHOLD_MINUTES in database.ts.
    const STALE_THRESHOLD_MS = 10 * 60 * 1000;

    try {
      let job = await getGenerationJob(supabase, request.job_id);
      if (job === null) {
        return notFoundResponse("retry", `Generation job "${request.job_id}" not found`);
      }

      // ── Stale generating recovery ───────────────────────────────────────────
      // A job stuck in 'generating' means the Edge Function that claimed it
      // timed out. If claimed_at is older than the threshold the function is
      // definitely gone; recover to failed_retryable so the retry path can proceed.
      if (job.status === "generating") {
        const claimedAt = job.claimed_at ? new Date(job.claimed_at).getTime() : null;
        const isStale = claimedAt !== null && Date.now() - claimedAt > STALE_THRESHOLD_MS;

        if (!isStale) {
          const claimedAtIso = job.claimed_at ?? "unknown";
          const retryAfter = job.claimed_at
            ? new Date(new Date(job.claimed_at).getTime() + STALE_THRESHOLD_MS).toISOString()
            : "unknown";
          return conflictResponse(
            "retry",
            `Job "${request.job_id}" is currently being processed (claimed at ${claimedAtIso}). ` +
              `If it has not completed, retry after ${retryAfter}.`,
            request.job_id,
          );
        }

        const recovered = await recoverStuckJob(
          supabase,
          request.job_id,
          job.claimed_at!,
        );

        if (recovered === null) {
          const refetched = await getGenerationJob(supabase, request.job_id);
          if (refetched === null) {
            return notFoundResponse(
              "retry",
              `Generation job "${request.job_id}" not found after concurrent recovery`,
            );
          }
          job = refetched;
          if (job.status !== "failed_retryable") {
            return conflictResponse(
              "retry",
              `Job "${request.job_id}" was recovered concurrently and is now "${job.status}"`,
              request.job_id,
            );
          }
        } else {
          job = recovered;
          // Write immutable event proving the timeout recovery.
          // Non-fatal: recovery already succeeded in the DB.
          try {
            await insertGenerationEvent(
              supabase,
              request.job_id,
              "timeout-recovery",
              "warning",
              `Job auto-recovered from stuck generating state by ${request.retried_by}`,
              {
                original_claimed_at: job.claimed_at,
                recovered_at: new Date().toISOString(),
                retried_by: request.retried_by,
              },
            );
          } catch {
            // Event insertion failure must not abort the recovery.
          }
        }
      }

      // ── Standard retry path ───────────────────────────────────────────────
      if (job.status !== "failed_retryable") {
        return conflictResponse(
          "retry",
          `Job "${request.job_id}" cannot be retried — status is "${job.status}" (must be "failed_retryable")`,
          request.job_id,
        );
      }

      if (job.retry_count >= MAX_RETRIES) {
        const exhausted = await exhaustRetries(supabase, request.job_id);
        try {
          await insertGenerationEvent(
            supabase,
            request.job_id,
            "max-retries-exceeded",
            "failed",
            `Job permanently failed after reaching retry limit (${job.retry_count}/${MAX_RETRIES})`,
            { retry_count: job.retry_count, max_retries: MAX_RETRIES, retried_by: request.retried_by },
          );
        } catch {
          // Event insertion failure must not abort the exhaustion.
        }
        const finalJob = exhausted ?? await getGenerationJob(supabase, request.job_id);
        const responseBody: GenerationResponse = {
          success: false,
          action: "retry",
          job_id: request.job_id,
          message: `Job "${request.job_id}" has permanently failed after reaching the maximum retry limit (${job.retry_count}/${MAX_RETRIES})`,
          ...(finalJob !== null ? { job: finalJob } : {}),
        };
        return new Response(JSON.stringify(responseBody), {
          status: 422,
          headers: CORS_HEADERS,
        });
      }

      const reset = await resetJobForRetry(supabase, request.job_id, job.retry_count);
      if (reset === null) {
        return conflictResponse(
          "retry",
          `Job "${request.job_id}" could not be reset — it may have been modified concurrently`,
          request.job_id,
        );
      }

      const responseBody: GenerationResponse = {
        success: true,
        action: "retry",
        job_id: request.job_id,
        message: `Job reset to pending. Retry attempt ${reset.retry_count} of ${MAX_RETRIES}. Call POST /process to continue.`,
        job: reset,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("retry", msg, job_id);
    }
  }

  // ── POST /copyright-review ────────────────────────────────────────────────
  if (segments.length === 1 && segments[0] === "copyright-review") {
    const job_id = body["job_id"];
    const resolution = body["resolution"];
    const resolved_by = body["resolved_by"];
    const notes = body["notes"] ?? null;

    if (typeof job_id !== "string" || job_id.trim() === "") {
      return badRequestResponse("copyright-review", "job_id field is required");
    }
    if (resolution !== "approved" && resolution !== "rejected") {
      return badRequestResponse(
        "copyright-review",
        'resolution must be "approved" or "rejected"',
        job_id,
      );
    }
    if (typeof resolved_by !== "string" || resolved_by.trim() === "") {
      return badRequestResponse("copyright-review", "resolved_by field is required", job_id);
    }
    if (notes !== null && typeof notes !== "string") {
      return badRequestResponse("copyright-review", "notes must be a string or null", job_id);
    }

    const request: CopyrightReviewRequest = {
      job_id,
      resolution: resolution as "approved" | "rejected",
      resolved_by,
      notes: typeof notes === "string" ? notes : null,
    };

    try {
      const job = await getGenerationJob(supabase, request.job_id);
      if (job === null) {
        return notFoundResponse(
          "copyright-review",
          `Generation job "${request.job_id}" not found`,
        );
      }

      if (job.status !== "pending_manual_review") {
        return conflictResponse(
          "copyright-review",
          `Job "${request.job_id}" is not awaiting manual review — status is "${job.status}"`,
          request.job_id,
        );
      }

      const updated = await resolveManualReview(
        supabase,
        request.job_id,
        request.resolution,
        request.resolved_by,
        request.notes,
      );

      if (updated === null) {
        return conflictResponse(
          "copyright-review",
          `Job "${request.job_id}" could not be resolved — it may have been modified concurrently`,
          request.job_id,
        );
      }

      // Write an immutable event recording who made the decision.
      // Non-fatal: the resolution already succeeded in the DB.
      try {
        await insertGenerationEvent(
          supabase,
          request.job_id,
          "manual-review-resolved",
          request.resolution === "approved" ? "passed" : "failed",
          `Manual copyright review ${request.resolution} by ${request.resolved_by}`,
          {
            resolution: request.resolution,
            resolved_by: request.resolved_by,
            notes: request.notes,
          },
        );
      } catch {
        // Event insertion failure must not abort the resolution.
      }

      const nextStep =
        request.resolution === "approved"
          ? "Job is now pending. Call POST /process to continue the pipeline."
          : "Job is permanently failed. No further action required.";

      const responseBody: GenerationResponse = {
        success: true,
        action: "copyright-review",
        job_id: request.job_id,
        message: `Manual review resolved as "${request.resolution}". ${nextStep}`,
        job: updated,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return internalErrorResponse("copyright-review", msg, job_id);
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
    .replace(/^\/(functions\/v1\/)?avatar-generation/, "")
    .split("/")
    .filter(Boolean);
}
