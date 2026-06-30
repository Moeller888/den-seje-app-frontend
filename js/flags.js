// ── Feature-flag registry / diagnostics (157R) ───────────────────────────────
// A single READ-ONLY view of every frontend feature flag, for ops/debugging and to
// document the consolidated flag posture in one place. It does NOT change how any flag
// is consumed — each module keeps its own default-off constant and gate. Importing this
// is side-effect-free (the imported modules have no top-level side effects).
//
// Hardening invariant (see docs/157r-feature-flags.md): every external-integration flag
// is DEFAULT-OFF and FAIL-SOFT; AVATAR_V2 is the one intentional default-on (with a
// documented one-commit rollback). Edge flags (ENABLE_SENTRY_EDGE, ENABLE_AI_GRADING)
// are env-side and not visible here — see the doc.

import { isAvatarV2, AVATAR_V2 } from "./avatar-layers.js";
import { isMonitoringEnabled, isSentryConfigured } from "./sentry.js";
import { isOcrEnabled } from "./ocr/index.js";
import { isCloudinaryEnabled } from "./cloudinary.js";
import { isAnalyticsConfigured, isAnalyticsActive } from "./analytics.js";
import { isReadAloudEnabled } from "./read-aloud/index.js";
import { getAllConsent } from "./consent.js";

function safe(fn, fallback) {
  try { const v = fn(); return v === undefined ? fallback : v; } catch (_e) { return fallback; }
}

/**
 * A plain, read-only snapshot of current frontend flag/consent state. Never throws.
 * Useful in the console: `window.__flags()`.
 * @returns {Object}
 */
export function flagSnapshot() {
  return {
    avatar_v2: { default_on: AVATAR_V2 === true, active: safe(isAvatarV2, false) },
    sentry:    { configured: safe(isSentryConfigured, false), active: safe(isMonitoringEnabled, false) },
    ocr:       { active: safe(isOcrEnabled, false) },
    cloudinary:{ active: safe(isCloudinaryEnabled, false) },
    analytics: { configured: safe(isAnalyticsConfigured, false), active: safe(isAnalyticsActive, false) },
    read_aloud:{ active: safe(isReadAloudEnabled, false) },
    consent:   safe(getAllConsent, {}),
    // Edge flags are env-side (not visible to the browser): ENABLE_SENTRY_EDGE, ENABLE_AI_GRADING.
  };
}

/**
 * Expose flagSnapshot() on window for ops/debugging (`window.__flags()`). No-op off-DOM.
 * Read-only; never throws.
 */
export function installFlagDiagnostics() {
  try {
    if (typeof window !== "undefined") window.__flags = flagSnapshot;
  } catch (_e) { /* fail-soft */ }
}
