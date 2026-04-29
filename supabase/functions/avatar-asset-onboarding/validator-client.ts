import type { ValidatorResponse } from "./types.ts";

export async function callValidator(
  metadata: Record<string, unknown>,
): Promise<ValidatorResponse> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || supabaseUrl.trim() === "") {
    throw new Error("SUPABASE_URL is not set — cannot locate avatar-asset-validator");
  }
  if (!serviceKey || serviceKey.trim() === "") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot call avatar-asset-validator");
  }

  const validatorUrl = `${supabaseUrl}/functions/v1/avatar-asset-validator`;

  let response: Response;
  try {
    response = await fetch(validatorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(metadata),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling avatar-asset-validator: ${message}`);
  }

  // The validator returns 200 for valid payloads and 422 for validation failures.
  // Any other status code indicates an unexpected problem with the validator itself.
  if (response.status !== 200 && response.status !== 422) {
    throw new Error(
      `avatar-asset-validator returned unexpected HTTP ${response.status} — check validator deployment`,
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(
      `avatar-asset-validator returned non-JSON body with HTTP ${response.status}`,
    );
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("avatar-asset-validator returned an unexpected response shape");
  }

  const r = parsed as Record<string, unknown>;

  if (typeof r["valid"] !== "boolean") {
    throw new Error("avatar-asset-validator response is missing required field 'valid'");
  }
  if (!Array.isArray(r["errors"])) {
    throw new Error("avatar-asset-validator response is missing required field 'errors'");
  }
  if (!Array.isArray(r["warnings"])) {
    throw new Error("avatar-asset-validator response is missing required field 'warnings'");
  }
  if (!Array.isArray(r["manual_review_flags"])) {
    throw new Error(
      "avatar-asset-validator response is missing required field 'manual_review_flags'",
    );
  }

  return parsed as ValidatorResponse;
}
