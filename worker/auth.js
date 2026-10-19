// ── Who may trigger a synthesis (157P) ───────────────────────────────────────
// A cache miss costs Azure characters, so POST /api/tts requires either
//   - a signed-in user's Supabase access token (ES256, verified locally against the
//     project's public JWKS — no call to Supabase per request), or
//   - the generator's admin token (X-TTS-Admin-Token, a Worker secret) for the offline
//     incremental generator in tools/read-aloud/.
// Only the token's `sub` is used (as the rate-limit key). Nothing about the user is
// forwarded to Azure.

const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_MIN_REFRESH_MS = 60 * 1000;

function base64UrlBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ (i < right.length ? right[i] : 0);
  return diff === 0;
}

/**
 * JWKS-backed verifier for Supabase access tokens.
 * @param {{supabaseUrl:string, fetchImpl?:typeof fetch, now?:() => number}} options
 */
export function createSupabaseVerifier(options) {
  const supabaseUrl = String(options.supabaseUrl || "").replace(/\/+$/, "");
  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : (...args) => fetch(...args);
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const issuer = supabaseUrl + "/auth/v1";
  let keys = new Map();
  let fetchedAt = 0;

  async function refresh() {
    const response = await fetchImpl(issuer + "/.well-known/jwks.json", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("jwks_unavailable");
    const body = await response.json();
    const next = new Map();
    for (const jwk of Array.isArray(body && body.keys) ? body.keys : []) {
      if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.kid !== "string") continue;
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      next.set(jwk.kid, key);
    }
    keys = next;
    fetchedAt = now();
  }

  async function keyFor(kid) {
    if (keys.size === 0 || now() - fetchedAt > JWKS_TTL_MS) await refresh();
    if (!keys.has(kid) && now() - fetchedAt > JWKS_MIN_REFRESH_MS) await refresh();
    return keys.get(kid) || null;
  }

  /** @returns {Promise<{ok:true, sub:string} | {ok:false, error:string}>} */
  return async function verify(token) {
    try {
      if (typeof token !== "string") return { ok: false, error: "missing_token" };
      const parts = token.split(".");
      if (parts.length !== 3) return { ok: false, error: "malformed_token" };
      const header = base64UrlJson(parts[0]);
      if (!header || header.alg !== "ES256" || typeof header.kid !== "string") return { ok: false, error: "unsupported_token" };
      const key = await keyFor(header.kid);
      if (!key) return { ok: false, error: "unknown_key" };
      const valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        base64UrlBytes(parts[2]),
        new TextEncoder().encode(parts[0] + "." + parts[1]),
      );
      if (!valid) return { ok: false, error: "bad_signature" };
      const claims = base64UrlJson(parts[1]);
      const seconds = Math.floor(now() / 1000);
      if (!claims || typeof claims.exp !== "number" || claims.exp <= seconds) return { ok: false, error: "expired_token" };
      if (claims.iss !== issuer) return { ok: false, error: "wrong_issuer" };
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes("authenticated") || claims.role !== "authenticated") return { ok: false, error: "not_authenticated" };
      if (typeof claims.sub !== "string" || claims.sub.length === 0) return { ok: false, error: "missing_subject" };
      return { ok: true, sub: claims.sub };
    } catch (_e) {
      return { ok: false, error: "invalid_token" };
    }
  };
}

/**
 * Authenticate a synthesis request.
 * @returns {Promise<{ok:true, kind:"user"|"admin", subject:string} | {ok:false, error:string}>}
 */
export async function authenticateTtsRequest(request, env, verify) {
  const adminToken = request.headers.get("x-tts-admin-token");
  if (adminToken !== null) {
    const expected = typeof env.TTS_ADMIN_TOKEN === "string" ? env.TTS_ADMIN_TOKEN : "";
    if (expected.length >= 32 && safeEqual(adminToken, expected)) return { ok: true, kind: "admin", subject: "generator" };
    return { ok: false, error: "bad_admin_token" };
  }
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) return { ok: false, error: "missing_token" };
  const result = await verify(match[1]);
  if (!result.ok) return result;
  return { ok: true, kind: "user", subject: result.sub };
}
