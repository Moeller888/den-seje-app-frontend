// ── Frontend error monitoring (Sentry) — Section 157B ────────────────────────
// Foundation for production error observability. This module is the single
// integration point; pages route their existing logError() through captureError().
//
// HARD GUARANTEES (see docs/ARCHITECTURE.md §13, docs/AI_GUIDELINES.md, CLAUDE.md):
//  1. DEFAULT OFF. When ENABLE_SENTRY is false (or no DSN is configured) this module
//     has ZERO runtime impact: no SDK download, no listeners, no network. The static
//     import only defines constants/functions — no top-level side effects.
//  2. FAIL-SOFT. Any failure to load the SDK, initialise, scrub, or transmit is
//     swallowed. It never throws into the app, never blocks a flow, never shows UI
//     errors. Existing console logging always continues unchanged.
//  3. NO BEHAVIOURAL CHANGE. The app behaves identically; errors merely become
//     observable when the flag is on.
//  4. PII-SAFE (fail-closed). Names, emails, answer text, auth tokens, Supabase keys,
//     cookies, request headers and localStorage are never transmitted. If scrubbing
//     itself fails, the event is DROPPED rather than risk a leak.
//
// There is no build step (see ARCHITECTURE.md §3), so the SDK is loaded from a CDN
// ESM bundle on demand, and the public DSN is a source constant (the DSN is safe to
// expose; it only permits sending events, like the public anon key).

// ── Configuration ────────────────────────────────────────────────────────────

// Master switch for Section 157B. Flip to `true` (and set SENTRY_DSN) to enable.
export const ENABLE_SENTRY = false;

// Public Sentry DSN. Empty string = disabled (treated the same as the flag being off).
// Fill in the project's browser DSN to activate. Safe to commit (public by design).
const SENTRY_DSN = "";

// Release identifier. No build step → sourced from a <meta name="app-release"> tag if
// present (set per deploy), else this constant. Surfaced as the Sentry "release" tag.
const SENTRY_RELEASE = "den-seje-app@unknown";

// CDN ESM bundle for the official Sentry browser SDK (same CDN style as js/supabase.js).
const SDK_URL = "https://cdn.jsdelivr.net/npm/@sentry/browser@8/+esm";

// Substrings that mark a payload KEY as sensitive → its value is redacted wholesale.
const SENSITIVE_KEYS = [
  "password", "secret", "token", "jwt", "apikey", "api_key", "authorization",
  "auth", "access_token", "refresh_token", "service_role", "anon", "email",
  "answer", "session", "cookie", "dsn", "credential", "bearer",
];

// String redaction patterns (applied to every transmitted string value).
const EMAIL_RE  = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE    = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g; // JWT incl. Supabase keys
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;

const MAX_DEPTH = 6;
const MAX_ARRAY = 100;

// ── Internal state (module singletons) ───────────────────────────────────────
let _Sentry = null;        // loaded SDK namespace
let _ready = false;        // init completed successfully
let _initStarted = false;  // guard against double init
let _listenerBound = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isEnabled() {
  return ENABLE_SENTRY === true && typeof SENTRY_DSN === "string" && SENTRY_DSN.length > 0;
}

function detectEnvironment() {
  try {
    const h = (typeof location !== "undefined" && location.hostname) || "";
    if (h === "localhost" || h === "127.0.0.1" || h === "" || h.endsWith(".local")) {
      return "development";
    }
    return "production";
  } catch (_e) {
    return "unknown";
  }
}

function safeRelease() {
  try {
    const m = document.querySelector('meta[name="app-release"]');
    if (m && typeof m.content === "string" && m.content.trim().length > 0) {
      return m.content.trim();
    }
  } catch (_e) { /* ignore */ }
  return SENTRY_RELEASE;
}

// Page tag = pathname ONLY (never search/hash — those could carry tokens).
function safePage() {
  try {
    return (typeof location !== "undefined" && location.pathname) || "unknown";
  } catch (_e) {
    return "unknown";
  }
}

function safeBrowser() {
  try {
    return ((typeof navigator !== "undefined" && navigator.userAgent) || "unknown").slice(0, 200);
  } catch (_e) {
    return "unknown";
  }
}

function scrubString(value) {
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

function isSensitiveKey(key) {
  const lc = String(key).toLowerCase();
  for (let i = 0; i < SENSITIVE_KEYS.length; i++) {
    if (lc.indexOf(SENSITIVE_KEYS[i]) !== -1) return true;
  }
  return false;
}

// Recursively scrub an arbitrary payload. Defensive: guards depth, array length and
// cyclic references; redacts sensitive keys; scrubs every string value.
function deepScrub(input, depth, seen) {
  const d = typeof depth === "number" ? depth : 0;
  const s = seen || new WeakSet();

  if (input === null || input === undefined) return input;

  const t = typeof input;
  if (t === "string") return scrubString(input);
  if (t === "number" || t === "boolean") return input;
  if (t === "bigint" || t === "symbol" || t === "function") return undefined;

  if (d >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(input)) {
    if (seen && seen.has(input)) return "[circular]";
    s.add(input);
    const out = [];
    const n = Math.min(input.length, MAX_ARRAY);
    for (let i = 0; i < n; i++) out.push(deepScrub(input[i], d + 1, s));
    if (input.length > MAX_ARRAY) out.push("[truncated]");
    return out;
  }

  if (t === "object") {
    if (s.has(input)) return "[circular]";
    s.add(input);
    const out = {};
    let keys;
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

// Drop/scrub breadcrumbs before they are stored. Console breadcrumbs are dropped
// outright because the app logs answer-bearing payloads via console.* (e.g. the
// SUBMIT log in app.js). Other breadcrumbs are scrubbed.
function beforeBreadcrumb(breadcrumb) {
  try {
    if (!breadcrumb) return null;
    if (breadcrumb.category === "console") return null;
    if (typeof breadcrumb.message === "string") breadcrumb.message = scrubString(breadcrumb.message);
    if (breadcrumb.data) breadcrumb.data = deepScrub(breadcrumb.data);
    return breadcrumb;
  } catch (_e) {
    return null; // fail-closed: drop anything we cannot safely scrub
  }
}

// Final guard before transmission. Strips request headers/cookies/body and user
// context outright, then deep-scrubs the remaining event. Fail-closed: if anything
// throws, return null so the event is dropped rather than risk leaking PII.
function beforeSend(event) {
  try {
    if (event && event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
      if (typeof event.request.query_string !== "undefined") delete event.request.query_string;
    }
    if (event) delete event.user; // never transmit user identity
    return deepScrub(event);
  } catch (_e) {
    return null;
  }
}

// Capture-phase global "error" listener for RESOURCE load failures (img/script/link/
// audio/...). These do not bubble and are not JS exceptions, so the SDK's global
// handlers miss them. JS exceptions (target === window) are left to the SDK to avoid
// double reporting.
function onCaptureError(e) {
  try {
    if (!_ready || !_Sentry) return;
    const tgt = e && e.target;
    if (!tgt || tgt === window || !tgt.tagName) return; // JS error → handled by SDK
    const url = scrubString(tgt.src || tgt.href || "");
    _Sentry.withScope(function (scope) {
      scope.setTag("error_kind", "resource");
      scope.setTag("resource_tag", String(tgt.tagName).toLowerCase());
      scope.setContext("resource", { url: url });
      _Sentry.captureMessage("Resource load failed: " + String(tgt.tagName).toLowerCase(), "warning");
    });
  } catch (_err) { /* fail-soft */ }
}

function bindResourceListener() {
  if (_listenerBound) return;
  try {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("error", onCaptureError, true); // capture phase
      _listenerBound = true;
    }
  } catch (_e) { /* fail-soft */ }
}

async function loadAndInit(opts) {
  try {
    const mod = await import(SDK_URL);
    const Sentry = mod && typeof mod.init === "function"
      ? mod
      : (mod && mod.default && typeof mod.default.init === "function" ? mod.default : null);
    if (!Sentry) return; // unexpected shape → stay disabled, fail-soft

    Sentry.init({
      dsn: SENTRY_DSN,
      release: safeRelease(),
      environment: detectEnvironment(),
      sendDefaultPii: false,
      autoSessionTracking: false,
      tracesSampleRate: 0, // errors only in 157B; no performance/replay (avoids DOM PII)
      beforeBreadcrumb: beforeBreadcrumb,
      beforeSend: beforeSend,
    });

    // ── Tags: environment + release are set via init; add page/browser/flags ──
    Sentry.setTag("page", safePage());
    Sentry.setTag("browser", safeBrowser());
    Sentry.setTag("flag_enable_sentry", true);

    const tags = opts && opts.tags;
    if (tags && typeof tags === "object") {
      const keys = Object.keys(tags);
      for (let i = 0; i < keys.length; i++) {
        try { Sentry.setTag("flag_" + keys[i], String(tags[keys[i]])); } catch (_e) { /* ignore */ }
      }
    }

    _Sentry = Sentry;
    _ready = true;
  } catch (_e) {
    // SDK failed to load/init → leave monitoring disabled. Console logging continues.
    _ready = false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

// Initialise monitoring. No-op (zero impact) unless ENABLE_SENTRY && a DSN are set.
// `opts.tags` is an optional flat map of feature flags to surface as `flag_*` tags.
// Safe to call multiple times (idempotent). Never throws.
export function initMonitoring(opts) {
  try {
    if (!isEnabled()) return;
    if (_initStarted) return;
    _initStarted = true;
    bindResourceListener();
    loadAndInit(opts || {});
  } catch (_e) { /* fail-soft */ }
}

// Report an application error. Designed to be called from the existing logError()
// boundary, additively. No-op when disabled or not yet ready. Never throws.
//   event   — short string label (e.g. "SUBMIT_ERROR")
//   error   — Error instance OR a plain object/string (as logError currently passes)
//   context — optional extra detail (scrubbed before transmission)
export function captureError(event, error, context) {
  try {
    if (!isEnabled() || !_ready || !_Sentry) return;
    const label = String(event == null ? "error" : event).slice(0, 120);
    _Sentry.withScope(function (scope) {
      scope.setTag("logged_event", label);
      if (context && typeof context === "object") {
        scope.setContext("detail", deepScrub(context));
      }
      if (error instanceof Error) {
        scope.setExtra("logged_event", label);
        _Sentry.captureException(error);
      } else {
        scope.setExtra("error", deepScrub(error));
        _Sentry.captureMessage("logError: " + label, "error");
      }
    });
  } catch (_e) { /* fail-soft */ }
}

// Test/diagnostic helper: whether monitoring is configured to run. No side effects.
export function isMonitoringEnabled() {
  return isEnabled();
}
