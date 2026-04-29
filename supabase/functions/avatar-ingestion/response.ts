import type { IngestionResponse, PipelineResult } from "./types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: IngestionResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

export function corsPreflightResponse(): Response {
  return new Response("ok", { headers: CORS_HEADERS, status: 200 });
}

export function pipelineResultToResponse(result: PipelineResult): Response {
  return jsonResponse(result.body, result.httpStatus);
}

export function internalErrorResponse(
  action: string,
  message: string,
  jobId: string | null = null,
): Response {
  const body: IngestionResponse = {
    success: false,
    action,
    job_id: jobId,
    message: `Internal error: ${message}`,
  };
  return jsonResponse(body, 500);
}

export function badRequestResponse(
  action: string,
  message: string,
  jobId: string | null = null,
): Response {
  const body: IngestionResponse = {
    success: false,
    action,
    job_id: jobId,
    message,
  };
  return jsonResponse(body, 400);
}

export function methodNotAllowedResponse(method: string): Response {
  const body: IngestionResponse = {
    success: false,
    action: "unknown",
    job_id: null,
    message: `Method ${method} is not allowed on this endpoint`,
  };
  return jsonResponse(body, 405);
}

export function notFoundResponse(action: string, message: string): Response {
  const body: IngestionResponse = {
    success: false,
    action,
    job_id: null,
    message,
  };
  return jsonResponse(body, 404);
}

export function conflictResponse(action: string, message: string, jobId: string): Response {
  const body: IngestionResponse = {
    success: false,
    action,
    job_id: jobId,
    message,
  };
  return jsonResponse(body, 409);
}
