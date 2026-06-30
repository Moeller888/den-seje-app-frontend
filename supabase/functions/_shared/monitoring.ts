// ── Edge observability foundation (Section 157C) ─────────────────────────────
// The single, shared monitoring layer for EVERY Supabase Edge Function. No Edge
// Function should know Sentry internals — they import only the small surface below.
//
//      Edge Function  →  _shared/monitoring.ts  →  Sentry
//
// Future AI / OCR / Cloudinary / Analytics / Email functions inherit this for free
// by wrapping their handler with withObservability(name, handler).
//
// HARD GUARANTEES (see docs/ARCHITECTURE.md §6/§13, docs/AI_GUIDELINES.md, CLAUDE.md):
//   1. DEFAULT OFF. Enabled only when env ENABLE_SENTRY_EDGE === "true" AND a DSN is
//      configured. When disabled there is ZERO behavioural impact: no SDK import, no
//      network, responses and latency are identical. This module has no top-level
//      side effects (importing it only defines functions).
//   2. FAIL-SOFT. Monitoring never throws into a function, never changes a response,
//      never blocks the request path. Capture + flush are fire-and-forget (via
//      EdgeRuntime.waitUntil when available) so user latency is not meaningfully changed.
//   3. PII-SAFE (fail-closed). Names, emails, answer text, JWTs, cookies, Authorization
//      headers, Supabase keys, request bodies and localStorage are never transmitted.
//      If scrubbing throws, the event is DROPPED rather than risk a leak.
//   4. CONTRACT-PRESERVING. Uncaught errors are captured then RE-THROWN unchanged;
//      handled 5xx responses are captured by status without altering the response.
//
// There is no build step / import map (see ARCHITECTURE.md §6); the Sentry Deno SDK is
// lazy-loaded from a CDN ESM bundle only when monitoring is enabled.

const SDK_URL = "https://esm.sh/@sentry/deno@8";

// Substrings marking a payload KEY as sensitive → its value is redacted wholesale.
const SENSITIVE_KEYS = [
  "password", "secret", "token", "jwt", "apikey", "api_key", "authorization",
  "auth", "access_token", "refresh_token", "service_role", "anon", "email",
  "answer", "session", "cookie", "dsn", "credential", "bearer", "user_answer",
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g; // incl. Supabase keys
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;

const MAX_DEPTH = 6;
const MAX_ARRAY = 100;

// ── Public types ─────────────────────────────────────────────────────────────

export interface EdgeContext {
  functionName: string;
  requestId: string;
  startedAt: number;
  /** Capture a handled error with this request's metadata. No-op when disabled. */
  captureException: (error: unknown, extra?: Record<string, unknown>) => void;
  /** Capture a message with this request's metadata. No-op when disabled. */
  captureMessage: (message: string, level?: string, extra?: Record<string, unknown>) => void;
}

export type EdgeHandler = (req: Request, ctx: EdgeContext) => Promise<Response> | Response;

// ── Module state (per warm isolate) ──────────────────────────────────────────
let _initPromise: Promise<void> | null = null;
// deno-lint-ignore no-explicit-any
let _Sentry: any = null;

// ── Config (env-driven — the established Edge convention, e.g. SKIP_ONBOARDING) ─

function env(key: string): string | undefined {
  try {
    const v = Deno.env.get(key);
    return v && v.length > 0 ? v : undefined;
  } catch (_e) {
    return undefined;
  }
}

function dsn(): string | undefined {
  return env("SENTRY_DSN_EDGE") || env("SENTRY_EDGE_DSN");
}

/** Whether Edge monitoring is configured to run. No side effects. */
export function isEdgeMonitoringEnabled(): boolean {
  try {
    return env("ENABLE_SENTRY_EDGE") === "true" && !!dsn();
  } catch (_e) {
    return false;
  }
}

function environmentTag(): string {
  const explicit = env("SENTRY_ENVIRONMENT");
  if (explicit) return explicit;
  try {
    const url = env("SUPABASE_URL") || "";
    if (url.includes("localhost") || url.includes("127.0.0.1")) return "development";
  } catch (_e) { /* ignore */ }
  return "production";
}

function releaseTag(): string {
  return env("SENTRY_RELEASE") || "den-seje-app-edge@unknown";
}

function regionTag(): string | undefined {
  return env("SB_REGION") || env("SUPABASE_REGION") || env("DENO_REGION") || env("FLY_REGION");
}

function deploymentTag(): string | undefined {
  return env("DENO_DEPLOYMENT_ID") || env("SB_EXECUTION_ID");
}

function runtimeTag(): string {
  try {
    // deno-lint-ignore no-explicit-any
    const v = (Deno as any)?.version?.deno;
    return v ? "deno@" + v : "deno";
  } catch (_e) {
    return "deno";
  }
}

// ── Timing ───────────────────────────────────────────────────────────────────

function nowMs(): number {
  try { return performance.now(); } catch (_e) { return Date.now(); }
}

function sinceMs(start: number): number {
  try { return Math.max(0, Math.round(nowMs() - start)); } catch (_e) { return -1; }
}

// ── Request correlation id ───────────────────────────────────────────────────
// Reuse an inbound x-request-id / x-correlation-id if a caller supplied one (so a
// frontend → edge → db → future-AI chain can share one id); otherwise generate one.
// Sanitised to a safe charset; never surfaced to end users (internal logging only).

function sanitizeId(raw: string): string {
  try {
    const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 200);
    return cleaned.length > 0 ? cleaned : freshId();
  } catch (_e) {
    return freshId();
  }
}

function freshId(): string {
  try { return crypto.randomUUID(); } catch (_e) {
    return "req_" + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2);
  }
}

function getRequestId(req: Request): string {
  try {
    const h = req.headers.get("x-request-id") || req.headers.get("x-correlation-id");
    if (h && h.length > 0) return sanitizeId(h);
  } catch (_e) { /* ignore */ }
  return freshId();
}

// ── PII scrubbing (centralised, fail-closed) ─────────────────────────────────

function scrubString(value: string): string {
  if (typeof value !== "string" || value.length === 0) return value;
  try {
    return value
      .replace(JWT_RE, "[redacted-token]")
      .replace(BEARER_RE, "Bearer [redacted]")
      .replace(EMAIL_RE, "[redacted-email]");
  } catch (_e) {
    return "[redacted]";
  }
}

function isSensitiveKey(key: string): boolean {
  const lc = String(key).toLowerCase();
  for (let i = 0; i < SENSITIVE_KEYS.length; i++) {
    if (lc.indexOf(SENSITIVE_KEYS[i]) !== -1) return true;
  }
  return false;
}

// deno-lint-ignore no-explicit-any
function deepScrub(input: any, depth?: number, seen?: WeakSet<object>): any {
  const d = typeof depth === "number" ? depth : 0;
  const s = seen || new WeakSet<object>();

  if (input === null || input === undefined) return input;

  const t = typeof input;
  if (t === "string") return scrubString(input);
  if (t === "number" || t === "boolean") return input;
  if (t === "bigint" || t === "symbol" || t === "function") return undefined;

  if (d >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(input)) {
    if (s.has(input)) return "[circular]";
    s.add(input);
    // deno-lint-ignore no-explicit-any
    const out: any[] = [];
    const n = Math.min(input.length, MAX_ARRAY);
    for (let i = 0; i < n; i++) out.push(deepScrub(input[i], d + 1, s));
    if (input.length > MAX_ARRAY) out.push("[truncated]");
    return out;
  }

  if (t === "object") {
    if (s.has(input)) return "[circular]";
    s.add(input);
    // deno-lint-ignore no-explicit-any
    const out: Record<string, any> = {};
    let keys: string[];
    try { keys = Object.keys(input); } catch (_e) { return "[unserialisable]"; }
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (isSensitiveKey(k)) { out[k] = "[redacted]"; continue; }
      try { out[k] = deepScrub(input[k], d + 1, s); } catch (_e) { out[k] = "[unserialisable]"; }
    }
    return out;
  }

  return undefined;
}

// deno-lint-ignore no-explicit-any
function beforeSend(event: any): any {
  try {
    if (event && event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
      delete event.request.query_string;
    }
    if (event) delete event.user; // never transmit user identity
    return deepScrub(event);
  } catch (_e) {
    return null; // fail-closed: drop rather than risk leaking PII
  }
}

// deno-lint-ignore no-explicit-any
function beforeBreadcrumb(breadcrumb: any): any {
  try {
    if (!breadcrumb) return null;
    if (breadcrumb.category === "console") return null; // edge functions console.* answer payloads
    if (typeof breadcrumb.message === "string") breadcrumb.message = scrubString(breadcrumb.message);
    if (breadcrumb.data) breadcrumb.data = deepScrub(breadcrumb.data);
    return breadcrumb;
  } catch (_e) {
    return null;
  }
}

// ── Lazy init (once per warm isolate) ────────────────────────────────────────

function ensureInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const mod = await import(SDK_URL);
      const S = mod && typeof mod.init === "function"
        ? mod
        : (mod && mod.default && typeof mod.default.init === "function" ? mod.default : null);
      if (!S) return;

      S.init({
        dsn: dsn(),
        release: releaseTag(),
        environment: environmentTag(),
        sendDefaultPii: false,
        tracesSampleRate: 0, // errors only; no perf/replay (avoids payload PII)
        beforeSend,
        beforeBreadcrumb,
      });

      try {
        S.setTag("runtime", runtimeTag());
        const region = regionTag(); if (region) S.setTag("region", region);
        const dep = deploymentTag(); if (dep) S.setTag("deployment", dep);
      } catch (_e) { /* tags are best-effort */ }

      _Sentry = S;
    } catch (_e) {
      _Sentry = null; // load/init failed → stay disabled, fail-soft
    }
  })();
  return _initPromise;
}

function flushSoon(): void {
  try {
    if (!_Sentry || typeof _Sentry.flush !== "function") return;
    const p = _Sentry.flush(2000);
    // deno-lint-ignore no-explicit-any
    const ER = (globalThis as any).EdgeRuntime;
    if (ER && typeof ER.waitUntil === "function") {
      ER.waitUntil(p.catch(() => {})); // flush after the response is sent → no added latency
    } else if (p && typeof p.catch === "function") {
      p.catch(() => {}); // best-effort, not awaited on the hot path
    }
  } catch (_e) { /* fail-soft */ }
}

// deno-lint-ignore no-explicit-any
function applyMeta(scope: any, meta?: Record<string, unknown>): void {
  try {
    if (!meta) return;
    if (meta.functionName != null) scope.setTag("function_name", String(meta.functionName).slice(0, 120));
    if (meta.requestId != null) scope.setTag("request_id", String(meta.requestId).slice(0, 200));
    if (meta.response_status != null) scope.setTag("response_status", String(meta.response_status));
    scope.setContext("edge", deepScrub({
      function_name: meta.functionName,
      request_id: meta.requestId,
      environment: environmentTag(),
      release: releaseTag(),
      deployment: deploymentTag(),
      region: regionTag(),
      runtime: runtimeTag(),
      duration_ms: meta.duration_ms,
      response_status: meta.response_status,
      phase: meta.phase,
    }));
  } catch (_e) { /* best-effort */ }
}

// ── Public capture API (used by withObservability, ctx, and handleError) ──────

export function captureEdgeException(error: unknown, meta?: Record<string, unknown>): void {
  try {
    if (!isEdgeMonitoringEnabled()) return;
    ensureInit().then(() => {
      try {
        if (!_Sentry) return;
        // deno-lint-ignore no-explicit-any
        _Sentry.withScope((scope: any) => {
          applyMeta(scope, meta);
          if (error instanceof Error) {
            _Sentry.captureException(error);
          } else {
            scope.setExtra("error", deepScrub(error));
            const label = meta && meta.functionName ? String(meta.functionName) : "edge";
            _Sentry.captureMessage("edge error: " + label, "error");
          }
        });
        flushSoon();
      } catch (_e) { /* fail-soft */ }
    }).catch(() => {});
  } catch (_e) { /* fail-soft */ }
}

export function captureEdgeMessage(message: string, level?: string, meta?: Record<string, unknown>): void {
  try {
    if (!isEdgeMonitoringEnabled()) return;
    ensureInit().then(() => {
      try {
        if (!_Sentry) return;
        // deno-lint-ignore no-explicit-any
        _Sentry.withScope((scope: any) => {
          applyMeta(scope, meta);
          _Sentry.captureMessage(scrubString(String(message)).slice(0, 500), level || "info");
        });
        flushSoon();
      } catch (_e) { /* fail-soft */ }
    }).catch(() => {});
  } catch (_e) { /* fail-soft */ }
}

// ── The single integration boundary ──────────────────────────────────────────
// Wrap a function's request handler. Serve-agnostic: the returned value is a plain
// (req) => Promise<Response>, so it works with both `serve(...)` and `Deno.serve(...)`.
//
//   serve(withObservability("my-fn", async (req, ctx) => { ... }))
//
// Captures uncaught exceptions (then re-throws unchanged) and handled 5xx responses
// (by status, without altering the response). Attaches request_id + timing + metadata.
export function withObservability(
  functionName: string,
  handler: EdgeHandler,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startedAt = nowMs();
    const requestId = getRequestId(req);

    const ctx: EdgeContext = {
      functionName,
      requestId,
      startedAt,
      captureException: (error, extra) =>
        captureEdgeException(error, { functionName, requestId, duration_ms: sinceMs(startedAt), ...(extra || {}) }),
      captureMessage: (message, level, extra) =>
        captureEdgeMessage(message, level, { functionName, requestId, duration_ms: sinceMs(startedAt), ...(extra || {}) }),
    };

    try {
      const res = await handler(req, ctx);
      try {
        const status = res && typeof (res as Response).status === "number" ? (res as Response).status : 0;
        if (status >= 500) {
          captureEdgeMessage(`Edge ${functionName} returned ${status}`, "error", {
            functionName, requestId, response_status: status, duration_ms: sinceMs(startedAt),
          });
        }
      } catch (_e) { /* status read is best-effort */ }
      return res;
    } catch (err) {
      // Capture, then RE-THROW unchanged so behaviour/contract is identical to today.
      captureEdgeException(err, { functionName, requestId, phase: "uncaught", duration_ms: sinceMs(startedAt) });
      throw err;
    }
  };
}
