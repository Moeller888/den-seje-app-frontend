// ── Analytics (PostHog) — module + consent gate (157D) ───────────────────────
// Privacy-first product analytics for a platform used by MINORS. This module is the
// single analytics boundary; pages emit events via track() (wired in 157E), never by
// calling PostHog directly.
//
// HARD GUARANTEES (docs/PROJECT_VISION.md, docs/AI_GUIDELINES.md privacy, CLAUDE.md):
//   1. DEFAULT OFF. `ENABLE_ANALYTICS=false` / empty key → zero impact: no SDK
//      download, no network, no cookies, no events. The static import only defines
//      functions (no top-level side effects).
//   2. CONSENT-GATED (GDPR). Even when enabled + keyed, NOTHING loads or sends until
//      explicit opt-in via setConsent(true). No tracking before consent — ever.
//   3. DATA-MINIMISED. Autocapture OFF, pageview-capture OFF, session-recording OFF,
//      no PII identify. Event properties are PII-scrubbed before transmission.
//   4. FAIL-SOFT. SDK load / capture failures are swallowed; never throws, never
//      blocks a flow, never shows a UI error.
//   5. EU region by default (GDPR). No student names/emails/answer text/tokens sent.
//
// No secret is used — the PostHog project key is public (like the anon key). Events
// are NOT wired here (that is 157E); this section ships the module + consent gate only.

// Master switch (157D). Flip to true AND set the key to enable (then consent still gates).
export const ENABLE_ANALYTICS = false;

// Public PostHog project key. Empty = disabled. Safe to commit (public by design).
const POSTHOG_KEY = "";

// EU ingestion host (GDPR). Owner may change. Default signals EU-region intent.
const POSTHOG_HOST = "https://eu.i.posthog.com";

const SDK_URL = "https://cdn.jsdelivr.net/npm/posthog-js@1/+esm";
const CONSENT_KEY = "analytics_consent"; // "granted" | "denied" | (absent → unknown)

// Keys whose values are dropped from event properties, and string scrub patterns.
const SENSITIVE_KEYS = [
  "password", "secret", "token", "jwt", "apikey", "api_key", "authorization",
  "auth", "email", "answer", "user_answer", "name", "session", "cookie", "dsn",
];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

let _posthog = null;
let _initStarted = false;

function flagEnabled() {
  return ENABLE_ANALYTICS === true && typeof POSTHOG_KEY === "string" && POSTHOG_KEY.length > 0;
}

function capable() {
  try { return typeof window !== "undefined"; } catch (_e) { return false; }
}

// ── Consent (GDPR) ────────────────────────────────────────────────────────────

/** "granted" | "denied" | "unknown". Never throws. */
export function getConsent() {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : "unknown";
  } catch (_e) {
    return "unknown";
  }
}

/** True only when the user has explicitly opted in. */
export function hasConsent() {
  return getConsent() === "granted";
}

/**
 * Record the user's analytics consent decision. Granting (when enabled) initialises
 * analytics; denying opts out and prevents any loading. Never throws.
 * @param {boolean} granted
 */
export function setConsent(granted) {
  try { localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied"); } catch (_e) { /* ignore */ }
  if (granted) {
    try { initAnalytics(); } catch (_e) { /* fail-soft */ }
  } else {
    try { if (_posthog && typeof _posthog.opt_out_capturing === "function") _posthog.opt_out_capturing(); }
    catch (_e) { /* ignore */ }
  }
}

/** Whether analytics is fully active: enabled + keyed + consented + capable. */
export function isAnalyticsActive() {
  try { return flagEnabled() && capable() && hasConsent(); } catch (_e) { return false; }
}

/**
 * Whether analytics is configured to run at all (enabled + keyed), regardless of
 * consent. Used by the consent banner: show it ONLY when analytics is configured but
 * the user has not yet decided. Default-off → false → no banner. Never throws.
 */
export function isAnalyticsConfigured() {
  try { return flagEnabled() && capable(); } catch (_e) { return false; }
}

// ── PII scrubbing for event properties ───────────────────────────────────────

function scrubString(v) {
  if (typeof v !== "string" || v.length === 0) return v;
  try { return v.replace(JWT_RE, "[redacted-token]").replace(EMAIL_RE, "[redacted-email]"); }
  catch (_e) { return "[redacted]"; }
}

function sanitizeProps(props) {
  try {
    if (!props || typeof props !== "object") return {};
    const out = {};
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length && i < 50; i++) {
      const k = keys[i];
      const lc = String(k).toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lc.indexOf(s) !== -1)) continue; // drop sensitive keys
      const val = props[k];
      const t = typeof val;
      if (t === "string") out[k] = scrubString(val).slice(0, 500);
      else if (t === "number" || t === "boolean") out[k] = val;
      // objects/arrays are intentionally dropped (minimisation)
    }
    return out;
  } catch (_e) {
    return {};
  }
}

// ── Init + track ──────────────────────────────────────────────────────────────

/**
 * Initialise analytics. No-op unless enabled AND consent is already granted — so it
 * is safe to call on page load; it loads NOTHING until the user has opted in. Never throws.
 */
export function initAnalytics() {
  try {
    if (!isAnalyticsActive()) return;   // gate: enabled + keyed + consented
    if (_initStarted) return;
    _initStarted = true;
    loadAndInit().catch(() => { /* fail-soft */ });
  } catch (_e) { /* fail-soft */ }
}

async function loadAndInit() {
  try {
    const mod = await import(SDK_URL);
    const ph = mod && (mod.default || mod.posthog || mod);
    if (!ph || typeof ph.init !== "function") return;
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,            // no automatic DOM capture (avoids answer text)
      capture_pageview: false,       // explicit events only
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "identified_only", // no person profiles unless explicitly identified (we don't)
      persistence: "localStorage",   // no third-party cookies
      mask_all_text: true,
      mask_all_element_attributes: true,
    });
    _posthog = ph;
  } catch (_e) {
    _posthog = null; // fail-soft: stay inactive
  }
}

/**
 * Record an analytics event. No-op unless active (enabled + consented). Properties are
 * PII-scrubbed and minimised before transmission. Never throws. (Events are wired in 157E.)
 * @param {string} event
 * @param {Object} [props]
 */
export function track(event, props) {
  try {
    if (!isAnalyticsActive() || !_posthog || typeof _posthog.capture !== "function") return;
    if (typeof event !== "string" || event.length === 0) return;
    _posthog.capture(event.slice(0, 120), sanitizeProps(props));
  } catch (_e) { /* fail-soft */ }
}
