// ── Consent source of truth (157Q) ───────────────────────────────────────────
// One store, consulted by EVERY third-party data flow that could send data off the
// device — so consent is consolidated, not duplicated per feature. Pure module: no
// side effects, no network. Used by js/analytics.js (analytics), js/sentry.js
// (error_monitoring) and, when activated, the AI flow (ai_features).
//
// GDPR posture (platform serves MINORS): optional third-party egress is OPT-IN. Until
// the user decides, every optional category is "unknown" → its flow stays off. On-device
// features (OCR, read-aloud Web Speech) send nothing and are NOT consent-gated here.
// Canonical privacy mapping: docs/157q-consent-gdpr.md.

export const CONSENT_CATEGORIES = ["analytics", "error_monitoring", "ai_features"];

// Categories that are OPTIONAL third-party egress → require opt-in consent.
const OPTIONAL_CATEGORIES = ["analytics", "error_monitoring", "ai_features"];

const CONSENT_KEY = "consent_v1";              // { analytics: "granted"|"denied", ... }
const LEGACY_ANALYTICS_KEY = "analytics_consent"; // 157D/157E single-category store

function normalize(v) {
  return v === "granted" || v === "denied" ? v : "unknown";
}

function readStore() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") return o;
    }
  } catch (_e) { /* fall through to legacy/empty */ }
  // One-time migration of the 157D/157E analytics consent into the unified store shape.
  try {
    const legacy = localStorage.getItem(LEGACY_ANALYTICS_KEY);
    if (legacy === "granted" || legacy === "denied") return { analytics: legacy };
  } catch (_e) { /* ignore */ }
  return {};
}

function writeStore(store) {
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(store)); } catch (_e) { /* ignore */ }
}

/** "granted" | "denied" | "unknown" for a category. Never throws. */
export function getConsent(category) {
  try { return normalize(readStore()[category]); } catch (_e) { return "unknown"; }
}

/** True only when the user explicitly opted in to a category. */
export function hasConsent(category) {
  return getConsent(category) === "granted";
}

/** Whether a category is still undecided. */
export function isUndecided(category) {
  return getConsent(category) === "unknown";
}

/** Record a decision for one category. Unknown categories are ignored. Never throws. */
export function setConsent(category, granted) {
  try {
    if (CONSENT_CATEGORIES.indexOf(category) === -1) return;
    const store = readStore();
    store[category] = granted ? "granted" : "denied";
    writeStore(store);
  } catch (_e) { /* ignore */ }
}

/** Set ALL optional third-party categories at once (the consolidated banner decision). */
export function setOptionalConsent(granted) {
  try {
    const store = readStore();
    for (let i = 0; i < OPTIONAL_CATEGORIES.length; i++) {
      store[OPTIONAL_CATEGORIES[i]] = granted ? "granted" : "denied";
    }
    writeStore(store);
  } catch (_e) { /* ignore */ }
}

/** Snapshot of every category's status. */
export function getAllConsent() {
  try {
    const s = readStore();
    const out = {};
    for (let i = 0; i < CONSENT_CATEGORIES.length; i++) out[CONSENT_CATEGORIES[i]] = normalize(s[CONSENT_CATEGORIES[i]]);
    return out;
  } catch (_e) {
    return {};
  }
}
