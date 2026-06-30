// ── Consolidated consent banner (157E → consolidated in 157Q) ────────────────
// One GDPR opt-in banner covering ALL optional third-party flows (analytics +
// error monitoring; AI when activated). It renders ONLY when at least one such flow is
// configured AND its consent is still "unknown". With everything default-off this is a
// complete no-op. Consent is written to the single source of truth (js/consent.js);
// granting re-initialises the consented flows. Fail-soft: never breaks a page.

import { isUndecided, setOptionalConsent } from "./consent.js";
import { isAnalyticsConfigured, initAnalytics } from "./analytics.js";
import { isSentryConfigured, initMonitoring } from "./sentry.js";

const BANNER_ID = "analytics-consent-banner";

function needsDecision() {
  try {
    if (isAnalyticsConfigured() && isUndecided("analytics")) return true;
    if (isSentryConfigured() && isUndecided("error_monitoring")) return true;
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Show the consolidated consent banner if any optional third-party flow is configured
 * and still undecided. No-op otherwise (incl. default-off). Never throws.
 */
export function maybeShowConsentBanner() {
  try {
    if (typeof document === "undefined") return;
    if (!needsDecision()) return;
    if (document.getElementById(BANNER_ID)) return;

    const bar = document.createElement("div");
    bar.id = BANNER_ID;
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-live", "polite");
    bar.style.cssText = [
      "position:fixed", "left:0", "right:0", "bottom:0", "z-index:2147483000",
      "background:#1f2330", "color:#fff", "padding:14px 16px",
      "display:flex", "flex-wrap:wrap", "gap:10px", "align-items:center",
      "justify-content:center", "font-size:14px", "box-shadow:0 -2px 12px rgba(0,0,0,.3)",
    ].join(";");

    const text = document.createElement("span");
    text.style.cssText = "max-width:640px;line-height:1.4";
    text.textContent =
      "Vi vil gerne bruge anonym statistik og fejlrapportering for at forbedre appen. " +
      "Ingen navne, e-mails eller svar gemmes. Må vi det?";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Ja tak";
    accept.style.cssText = "background:#4caf50;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600";

    const deny = document.createElement("button");
    deny.type = "button";
    deny.textContent = "Nej tak";
    deny.style.cssText = "background:#3a3f4d;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer";

    function close() { try { bar.remove(); } catch (_e) { /* ignore */ } }

    accept.addEventListener("click", () => {
      try { setOptionalConsent(true); } catch (_e) { /* ignore */ }
      // Activate the now-consented flows immediately (both are idempotent + fail-soft).
      try { initAnalytics(); } catch (_e) { /* ignore */ }
      try { initMonitoring(); } catch (_e) { /* ignore */ }
      close();
    });
    deny.addEventListener("click", () => {
      try { setOptionalConsent(false); } catch (_e) { /* ignore */ }
      close();
    });

    bar.appendChild(text);
    bar.appendChild(accept);
    bar.appendChild(deny);
    document.body.appendChild(bar);
  } catch (_e) {
    // Fail-soft: never break the page over a consent banner.
  }
}
