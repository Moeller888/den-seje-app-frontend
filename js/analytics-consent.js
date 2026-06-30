// ── Analytics consent banner (157E) ──────────────────────────────────────────
// Minimal GDPR opt-in banner for the analytics module (157D). It renders ONLY when
// analytics is configured (enabled + keyed) AND the user has not yet decided. With
// analytics default-off this is a complete no-op — nothing renders, nothing changes.
//
// Separation of concerns: js/analytics.js is the data layer (no DOM); this is the UI.
// Fail-soft: it can never break a page.

import { isAnalyticsConfigured, getConsent, setConsent } from "./analytics.js";

const BANNER_ID = "analytics-consent-banner";

/**
 * Show the consent banner if (and only if) analytics is configured and consent is
 * still "unknown". No-op otherwise (incl. default-off). Never throws.
 */
export function maybeShowConsentBanner() {
  try {
    if (typeof document === "undefined") return;
    if (!isAnalyticsConfigured()) return;        // default-off → no banner
    if (getConsent() !== "unknown") return;       // already decided
    if (document.getElementById(BANNER_ID)) return; // already shown

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
      "Vi vil gerne bruge anonym statistik for at forbedre appen. Ingen navne, " +
      "e-mails eller svar gemmes. Må vi det?";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Ja tak";
    accept.style.cssText = "background:#4caf50;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600";

    const deny = document.createElement("button");
    deny.type = "button";
    deny.textContent = "Nej tak";
    deny.style.cssText = "background:#3a3f4d;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer";

    function close() { try { bar.remove(); } catch (_e) { /* ignore */ } }
    accept.addEventListener("click", () => { try { setConsent(true); } catch (_e) {} close(); });
    deny.addEventListener("click", () => { try { setConsent(false); } catch (_e) {} close(); });

    bar.appendChild(text);
    bar.appendChild(accept);
    bar.appendChild(deny);
    document.body.appendChild(bar);
  } catch (_e) {
    // Fail-soft: never break the page over a consent banner.
  }
}
