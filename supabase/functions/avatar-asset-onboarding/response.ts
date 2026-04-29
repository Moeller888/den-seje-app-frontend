import type { OnboardingResponse, WorkflowResult } from "./types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: OnboardingResponse, status: number): Response {
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

export function workflowResultToResponse(result: WorkflowResult): Response {
  return jsonResponse(result.body, result.httpStatus);
}

export function internalErrorResponse(action: string, message: string): Response {
  const body: OnboardingResponse = {
    success: false,
    action,
    asset_id: null,
    message: `Internal error: ${message}`,
  };
  return jsonResponse(body, 500);
}

export function badRequestResponse(action: string, message: string): Response {
  const body: OnboardingResponse = {
    success: false,
    action,
    asset_id: null,
    message,
  };
  return jsonResponse(body, 400);
}

export function methodNotAllowedResponse(method: string): Response {
  const body: OnboardingResponse = {
    success: false,
    action: "unknown",
    asset_id: null,
    message: `Method ${method} is not allowed on this endpoint`,
  };
  return jsonResponse(body, 405);
}

export function notFoundResponse(action: string, message: string): Response {
  const body: OnboardingResponse = {
    success: false,
    action,
    asset_id: null,
    message,
  };
  return jsonResponse(body, 404);
}
