// HTTP client for the avatar-asset-onboarding Edge Function.
// Used by the ingestion pipeline to persist the validated asset record.

export interface OnboardingSubmitResult {
  success: boolean;
  action: string;
  asset_id: string | null;
  message: string;
  asset?: Record<string, unknown>;
  validation_run?: {
    id: string;
    [key: string]: unknown;
  };
  validation_errors?: unknown[];
  validation_warnings?: unknown[];
  validation_manual_review_flags?: unknown[];
}

export async function callOnboardingSubmit(
  metadata: Record<string, unknown>,
  triggeredBy: string,
  storagePath: string | null,
): Promise<OnboardingSubmitResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || supabaseUrl.trim() === "") {
    throw new Error("SUPABASE_URL is not set — cannot locate avatar-asset-onboarding");
  }
  if (!serviceKey || serviceKey.trim() === "") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — cannot call avatar-asset-onboarding",
    );
  }

  const url = `${supabaseUrl}/functions/v1/avatar-asset-onboarding`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        metadata,
        triggered_by: triggeredBy,
        storage_path: storagePath,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling avatar-asset-onboarding: ${message}`);
  }

  // The onboarding function returns 200 (success), 400 (bad request), or 422 (validation failure).
  // 5xx from onboarding is unexpected — treat as a retryable network/infrastructure error.
  if (response.status >= 500) {
    throw new Error(
      `avatar-asset-onboarding returned HTTP ${response.status} — treating as retryable infrastructure error`,
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(
      `avatar-asset-onboarding returned non-JSON body with HTTP ${response.status}`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "avatar-asset-onboarding returned an unexpected response shape (not a JSON object)",
    );
  }

  const r = parsed as Record<string, unknown>;

  if (typeof r["success"] !== "boolean") {
    throw new Error(
      "avatar-asset-onboarding response is missing required field 'success'",
    );
  }

  return parsed as OnboardingSubmitResult;
}
