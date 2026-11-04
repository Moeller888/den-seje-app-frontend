// FAIL-CLOSED GUARD FOR THE ISOLATED E2E ENVIRONMENT (proof of concept).
//
// An isolated run must never be able to fall back to production. Every isolated entry point calls
// assertIsolated(process.env) before it does anything, and every browser context it opens installs
// installProdTripwire(), which aborts — and records — any request to a production host.
//
// Refused when ANY of these holds:
//   - a URL the run will use (base URL, Supabase URL) is not loopback http;
//   - any environment value names a production host or the production project ref;
//   - a mail/AI provider key or a production-only secret name is present at all;
//   - a test account address is not on the reserved synthetic domain.
// The checks read names and values but never print a value — only the variable NAME is reported.

export const PROD_PROJECT_REF = "tjzbehwfagiwpwodsgwg";
export const PROD_HOST_PATTERNS = Object.freeze([
  /(^|\.)supabase\.co$/i,
  /(^|\.)supabase\.com$/i,
  /(^|\.)xn--lrlig-sra\.dk$/i,
  /(^|\.)lærlig\.dk$/i,
]);
// Synthetic test accounts live on a reserved, undeliverable domain (RFC 2606 / 6761).
export const SYNTHETIC_EMAIL_DOMAIN = "e2e.invalid";
// Must not exist in an isolated run at all — not even empty-looking.
export const FORBIDDEN_VARS = Object.freeze([
  "RESEND_API_KEY", "SENDGRID_API_KEY", "POSTMARK_API_TOKEN", "SMTP_PASSWORD",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AZURE_SPEECH_KEY", "AZURE_TTS_KEY",
  "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "PROD_BASE_URL",
  "TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD",
]);
// The URLs the isolated run uses. All must be present and loopback.
export const REQUIRED_LOCAL_URLS = Object.freeze(["ISOLATED_BASE_URL", "ISOLATED_SUPABASE_URL"]);

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackHttpUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}

export function isProdHost(hostname) {
  if (typeof hostname !== "string" || hostname === "") return false;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return PROD_HOST_PATTERNS.some((re) => re.test(h));
}

// Does a value mention production anywhere (a URL, a host, a connection string, the project ref)?
export function mentionsProd(value) {
  if (typeof value !== "string" || value === "") return false;
  const v = value.toLowerCase();
  if (v.includes(PROD_PROJECT_REF)) return true;
  if (v.includes("supabase.co") || v.includes("xn--lrlig-sra.dk") || v.includes("lærlig.dk")) return true;
  return false;
}

// Returns a list of violations (variable names and reasons only). Empty = isolated.
export function isolationViolations(env) {
  const out = [];
  if (!env || typeof env !== "object") return ["environment is not readable"];
  if (env.ISOLATED_E2E !== "1") out.push("ISOLATED_E2E must be exactly \"1\"");
  for (const name of REQUIRED_LOCAL_URLS) {
    if (!isLoopbackHttpUrl(env[name])) out.push(`${name} must be a loopback http(s) URL`);
  }
  for (const name of FORBIDDEN_VARS) {
    if (Object.prototype.hasOwnProperty.call(env, name)) out.push(`${name} must not be set in an isolated run`);
  }
  for (const [name, value] of Object.entries(env)) {
    if (mentionsProd(value)) out.push(`${name} refers to a production host or project`);
  }
  for (const [name, value] of Object.entries(env)) {
    if (/^ISOLATED_.*_EMAIL$/.test(name)) {
      const at = typeof value === "string" ? value.lastIndexOf("@") : -1;
      if (at < 1 || value.slice(at + 1).toLowerCase() !== SYNTHETIC_EMAIL_DOMAIN) {
        out.push(`${name} must be an address on @${SYNTHETIC_EMAIL_DOMAIN}`);
      }
    }
  }
  return [...new Set(out)].sort();
}

export function assertIsolated(env) {
  const v = isolationViolations(env);
  if (v.length > 0) {
    throw new Error("REFUSED — not an isolated environment:\n  " + v.join("\n  "));
  }
}

// Browser-side tripwire: abort every request to a production host and record it. The caller
// asserts the record is empty at the end; an aborted request can never reach production.
export async function installProdTripwire(context, hits) {
  await context.route((url) => isProdHost(url.hostname), async (route) => {
    hits.push(new URL(route.request().url()).hostname);
    await route.abort("blockedbyclient");
  });
}
