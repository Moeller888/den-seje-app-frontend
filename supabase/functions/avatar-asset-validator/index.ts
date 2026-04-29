import { validateAvatarMetadata } from "./validator.ts";
import type { ValidationResponse } from "./types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: ValidationResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  ruleId: string,
  field: string,
  message: string,
  expected: string,
  actual: string,
  httpStatus: number,
): Response {
  const body: ValidationResponse = {
    valid: false,
    asset_id: null,
    errors: [
      {
        rule_id: ruleId,
        severity: "HARD_FAIL",
        field,
        message,
        expected,
        actual,
      },
    ],
    warnings: [],
    manual_review_flags: [],
  };
  return jsonResponse(body, httpStatus);
}

// Deno.serve is the canonical entry point in Deno 2.x.
// This project configures deno_version = 2 in supabase/config.toml, guaranteeing support.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }

  if (req.method !== "POST") {
    return errorResponse(
      "REQUEST",
      "method",
      "Only POST requests are accepted by this endpoint",
      "POST",
      req.method,
      405,
    );
  }

  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(
      "REQUEST",
      "(request body)",
      "Request body could not be parsed as JSON",
      "Valid JSON object",
      "Unparseable body",
      400,
    );
  }

  if (
    rawBody === null ||
    typeof rawBody !== "object" ||
    Array.isArray(rawBody)
  ) {
    return errorResponse(
      "REQUEST",
      "(request body)",
      "Request body must be a JSON object, not null, array, or primitive",
      "JSON object",
      Array.isArray(rawBody) ? "array" : String(typeof rawBody),
      400,
    );
  }

  try {
    const result = await validateAvatarMetadata(rawBody);
    const httpStatus = result.valid ? 200 : 422;
    return jsonResponse(result, httpStatus);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const body: ValidationResponse = {
      valid: false,
      asset_id: null,
      errors: [
        {
          rule_id: "INTERNAL",
          severity: "HARD_FAIL",
          field: "(validator)",
          message: `Unexpected internal error in validation pipeline: ${message}`,
          expected: "Successful validation run",
          actual: "Unhandled exception",
        },
      ],
      warnings: [],
      manual_review_flags: [],
    };
    return jsonResponse(body, 500);
  }
});
