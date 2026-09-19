// THE ONE PLACE AN EDGE FUNCTION RESOLVES ITS PRIVILEGED SUPABASE KEY.
//
// WHY. The legacy `service_role` key was exposed and must be deactivated. Supabase replaces it with
// named secret keys (`sb_secret_…`), which the platform injects into every function as the JSON
// object `SUPABASE_SECRET_KEYS` — one entry per key name — alongside the legacy
// `SUPABASE_SERVICE_ROLE_KEY` string.
//
// THE TRANSITION CONTRACT. This resolver PREFERS the new key and FALLS BACK to the legacy one:
//
//   * before the new key exists      → legacy is used, behaviour unchanged;
//   * after it exists                → the new key is used, while legacy still works;
//   * after legacy is deactivated    → the new key is the only one left, and nothing breaks;
//   * if the new key is rolled back  → the fallback picks legacy up again, with no redeploy.
//
// That ordering is what makes the migration reversible at every step. Deactivating the legacy key
// is therefore the LAST action, taken only once every function has been deployed with this file.
//
// This changes only WHICH credential is read. It does not change who may call a function, how a
// caller is authenticated, or what the function is allowed to do: `verify_jwt` and every in-function
// authorisation check are untouched.

/** Name of the secret key to use. Supabase creates the first one as `default`. */
export const DEFAULT_SECRET_KEY_NAME = "default";

/**
 * Pure selection logic, separated from `Deno.env` so it can be tested without a runtime.
 * Returns the chosen key and which source it came from, or null when neither is usable.
 */
export function selectSecretKey(
  secretKeysJson: string | undefined,
  legacyServiceRoleKey: string | undefined,
  keyName: string = DEFAULT_SECRET_KEY_NAME,
): { key: string; source: "secret-keys" | "legacy-service-role" } | null {
  const bundlePresent = typeof secretKeysJson === "string" && secretKeysJson.trim() !== "";

  if (bundlePresent) {
    // A PRESENT bundle is authoritative. If it cannot be parsed, or does not carry the key this
    // function asks for, that is a BROKEN CONFIGURATION — not a reason to quietly use the legacy
    // key that is being retired. Silently falling back there would hide the very misconfiguration
    // the migration must surface, and would keep a deactivated-key deploy looking healthy.
    let parsed: unknown;
    try {
      parsed = JSON.parse(secretKeysJson!);
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS is set but is not valid JSON — refusing to fall back to the legacy key");
    }
    const candidate = (parsed as Record<string, unknown> | null)?.[keyName];
    if (typeof candidate !== "string" || candidate.trim() === "") {
      throw new Error(
        `SUPABASE_SECRET_KEYS is set but has no usable key named "${keyName}" — refusing to fall back to the legacy key`,
      );
    }
    return { key: candidate, source: "secret-keys" };
  }

  // No bundle at all: the pre-migration state, where the legacy key is the only thing configured.
  if (typeof legacyServiceRoleKey === "string" && legacyServiceRoleKey.trim() !== "") {
    return { key: legacyServiceRoleKey, source: "legacy-service-role" };
  }
  return null;
}

// Verification aid. Several functions resolve their key LAZILY, deep inside a handler that runs
// only after the caller has been authenticated — so a rejected probe call proves nothing about
// which key they ended up on. The first resolution in each isolate therefore logs WHICH SOURCE was
// chosen. The line carries a fixed word ("secret-keys" or "legacy-service-role") and never the key,
// the key name's value, or anything from the request, so it is safe in the function logs.
let sourceLogged = false;
function logSourceOnce(source: string): void {
  if (sourceLogged) return;
  sourceLogged = true;
  console.log(`[supabase-keys] source=${source}`);
}

/**
 * The privileged key for this function. Throws when neither source is configured, because a
 * function that silently runs without its key would fail later in a much less obvious way.
 */
export function serviceKey(keyName: string = DEFAULT_SECRET_KEY_NAME): string {
  const chosen = selectSecretKey(
    Deno.env.get("SUPABASE_SECRET_KEYS"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    keyName,
  );
  if (!chosen) {
    throw new Error(
      "No privileged Supabase key available: neither SUPABASE_SECRET_KEYS nor SUPABASE_SERVICE_ROLE_KEY is set",
    );
  }
  logSourceOnce(chosen.source);
  return chosen.key;
}

/**
 * The privileged key, or an empty string when NOTHING is configured. For call sites that already
 * validate the value themselves and raise their own error — using this keeps their existing error
 * text and error ORDERING for the "not configured yet" case.
 *
 * A configuration that is present but BROKEN still throws, exactly as in `serviceKey()`: an
 * unparseable bundle or a missing key name is a deployment fault, and answering it with an empty
 * string would let the call site report a misleading "not set" error instead.
 */
export function optionalServiceKey(keyName: string = DEFAULT_SECRET_KEY_NAME): string {
  const chosen = selectSecretKey(
    Deno.env.get("SUPABASE_SECRET_KEYS"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    keyName,
  );
  if (chosen) logSourceOnce(chosen.source);
  return chosen?.key ?? "";
}

/** Which source the current environment resolves to. For diagnostics; never logs the key itself. */
export function serviceKeySource(keyName: string = DEFAULT_SECRET_KEY_NAME): string {
  try {
    return selectSecretKey(
      Deno.env.get("SUPABASE_SECRET_KEYS"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      keyName,
    )?.source ?? "none";
  } catch {
    return "invalid-configuration";
  }
}
