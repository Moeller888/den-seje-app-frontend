// THE ONE PLACE AN EDGE FUNCTION RESOLVES ITS SUPABASE KEYS — PRIVILEGED AND PUBLIC.
//
// WHY. The legacy `service_role` key was exposed and must be deactivated. Supabase replaces it with
// named secret keys (`sb_secret_…`), which the platform injects into every function as the JSON
// object `SUPABASE_SECRET_KEYS` — one entry per key name — alongside the legacy
// `SUPABASE_SERVICE_ROLE_KEY` string.
//
// The legacy `anon` key goes with it: the Management API deactivates the legacy pair together, with
// a single `enabled` flag. The platform therefore also injects `SUPABASE_PUBLISHABLE_KEYS`, in the
// same shape, whose `default` entry replaces `SUPABASE_ANON_KEY`. Both halves live here, under the
// same rules, so neither can be forgotten when the pair is switched off.
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

/** Name of the publishable key to use. Supabase creates the first one as `default` too. */
export const DEFAULT_PUBLISHABLE_KEY_NAME = "default";

/**
 * The PUBLIC half of the same migration, and a deliberate mirror of `selectSecretKey`.
 *
 * The platform injects `SUPABASE_PUBLISHABLE_KEYS` next to `SUPABASE_SECRET_KEYS`, with the same
 * shape — a JSON object of named keys — and `SUPABASE_PUBLISHABLE_KEYS["default"]` replaces the
 * legacy `SUPABASE_ANON_KEY`. The legacy anon key is deactivated in the SAME operation as the
 * legacy service-role key, so both halves have to move before either can be switched off.
 *
 * Written out in parallel rather than folded into a shared generic: the two are separately
 * unit-tested and separately guarded, and keeping them visibly side by side makes a divergence in
 * the fail-closed rules obvious instead of hiding it behind a parameter.
 */
export function selectPublishableKey(
  publishableKeysJson: string | undefined,
  legacyAnonKey: string | undefined,
  keyName: string = DEFAULT_PUBLISHABLE_KEY_NAME,
): { key: string; source: "publishable-keys" | "legacy-anon" } | null {
  const bundlePresent = typeof publishableKeysJson === "string" && publishableKeysJson.trim() !== "";

  if (bundlePresent) {
    // Identical rule to the secret half: a PRESENT bundle is authoritative, and a broken one is a
    // deployment fault rather than a reason to reach for the key that is being retired.
    let parsed: unknown;
    try {
      parsed = JSON.parse(publishableKeysJson!);
    } catch {
      throw new Error("SUPABASE_PUBLISHABLE_KEYS is set but is not valid JSON — refusing to fall back to the legacy key");
    }
    const candidate = (parsed as Record<string, unknown> | null)?.[keyName];
    if (typeof candidate !== "string" || candidate.trim() === "") {
      throw new Error(
        `SUPABASE_PUBLISHABLE_KEYS is set but has no usable key named "${keyName}" — refusing to fall back to the legacy key`,
      );
    }
    return { key: candidate, source: "publishable-keys" };
  }

  // No bundle at all: the pre-migration state, where the legacy anon key is all there is.
  if (typeof legacyAnonKey === "string" && legacyAnonKey.trim() !== "") {
    return { key: legacyAnonKey, source: "legacy-anon" };
  }
  return null;
}

// Verification aid. Several functions resolve their key LAZILY, deep inside a handler that runs
// only after the caller has been authenticated — so a rejected probe call proves nothing about
// which key they ended up on. The first resolution of each SOURCE in an isolate therefore logs
// which one was chosen. The line carries a fixed word ("secret-keys", "legacy-service-role",
// "publishable-keys" or "legacy-anon") and never the key, the key name's value, or anything from
// the request, so it is safe in the function logs. Tracked per source, not by a single flag: a
// function that resolves BOTH halves must not have its second line swallowed by its first.
const loggedSources = new Set<string>();
function logSourceOnce(source: string): void {
  if (loggedSources.has(source)) return;
  loggedSources.add(source);
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

/**
 * The public key for this function's user-scoped client. Throws when neither source is configured,
 * mirroring `serviceKey()`: a function that runs without it cannot authenticate its caller at all.
 */
export function publishableKey(keyName: string = DEFAULT_PUBLISHABLE_KEY_NAME): string {
  const chosen = selectPublishableKey(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    keyName,
  );
  if (!chosen) {
    throw new Error(
      "No public Supabase key available: neither SUPABASE_PUBLISHABLE_KEYS nor SUPABASE_ANON_KEY is set",
    );
  }
  logSourceOnce(chosen.source);
  return chosen.key;
}

/**
 * The public key, or an empty string when NOTHING is configured — the mirror of
 * `optionalServiceKey()`. For call sites that already check the value and raise their own error,
 * so their existing error text and ORDERING survive the migration.
 *
 * A configuration that is present but BROKEN still throws, so a misconfigured bundle can never be
 * reported as "not set".
 */
export function optionalPublishableKey(keyName: string = DEFAULT_PUBLISHABLE_KEY_NAME): string {
  const chosen = selectPublishableKey(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    keyName,
  );
  if (chosen) logSourceOnce(chosen.source);
  return chosen?.key ?? "";
}

/** Which public source the current environment resolves to. Diagnostics only; never the value. */
export function publishableKeySource(keyName: string = DEFAULT_PUBLISHABLE_KEY_NAME): string {
  try {
    return selectPublishableKey(
      Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      keyName,
    )?.source ?? "none";
  } catch {
    return "invalid-configuration";
  }
}
