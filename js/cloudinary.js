// ── Cloudinary image delivery (157G) ─────────────────────────────────────────
// Optional, default-off DELIVERY/optimisation layer for RASTER avatar assets, per
// the 157F decision (fetch/delivery mode — no secret, public cloud name only).
//
// `cdnUrl(src)` wraps a raster image URL in a Cloudinary fetch URL (f_auto/q_auto +
// optional resize) so the browser gets a smaller, format-negotiated image. It is the
// ONLY thing the app calls — callers never build Cloudinary URLs themselves.
//
// GUARANTEES (see docs/157f-cloudinary-decision-spec.md, ARCHITECTURE.md §8/§13):
//   1. DEFAULT OFF. `ENABLE_CLOUDINARY=false` / empty cloud name → returns the input
//      URL unchanged. Zero behavioural change; the origin asset is served as today.
//   2. RASTER ONLY. SVG / data: / non-image URLs pass through untouched (157F: SVG
//      gains nothing). Today every avatar <img> is SVG, so this is inert even if on.
//   3. SOURCE OF TRUTH UNCHANGED. Supabase Storage / repo `assets/` remain canonical;
//      Cloudinary only serves a cached derivative fetched from the origin URL.
//   4. FAIL-SOFT. Any error → return the original URL (never break the avatar render).
//
// No secret is used or stored. The cloud name is public (like the anon key). Signed
// uploads (Boundary B) are intentionally NOT implemented here.

// Master switch (157G). Flip to true AND set the cloud name to activate.
export const ENABLE_CLOUDINARY = false;

// Public Cloudinary cloud name. Empty = disabled (treated like the flag being off).
const CLOUDINARY_CLOUD_NAME = "";

const RASTER_RE = /\.(webp|png|jpe?g)(\?|#|$)/i;
const DEFAULT_TRANSFORMS = "f_auto,q_auto";

/** Whether Cloudinary delivery is configured to run. No side effects. */
export function isCloudinaryEnabled() {
  return ENABLE_CLOUDINARY === true &&
    typeof CLOUDINARY_CLOUD_NAME === "string" &&
    CLOUDINARY_CLOUD_NAME.length > 0;
}

function absoluteOrigin(src) {
  try {
    if (/^https?:\/\//i.test(src)) return src;        // already absolute
    if (src.charAt(0) === "/") {                        // root-absolute → prefix our origin
      if (typeof location !== "undefined" && location.origin) return location.origin + src;
      return null;
    }
    return null;                                        // unexpected relative form → skip
  } catch (_e) {
    return null;
  }
}

function buildTransforms(opts) {
  const parts = [DEFAULT_TRANSFORMS];
  const o = opts && typeof opts === "object" ? opts : {};
  if (typeof o.width === "number" && o.width > 0) parts.push("w_" + Math.round(o.width));
  if (typeof o.height === "number" && o.height > 0) parts.push("h_" + Math.round(o.height));
  if (typeof o.dpr === "number" && o.dpr > 0) parts.push("dpr_" + o.dpr);
  return parts.join(",");
}

/**
 * Return an optimised Cloudinary fetch URL for a raster image, or the original URL
 * unchanged when disabled / not applicable. Never throws.
 * @param {string} src   image URL (root-absolute `/assets/...` or absolute http(s))
 * @param {{width?:number, height?:number, dpr?:number}} [opts]
 * @returns {string}
 */
export function cdnUrl(src, opts) {
  try {
    if (typeof src !== "string" || src.length === 0) return src;
    if (!isCloudinaryEnabled()) return src;            // default-off → origin unchanged
    if (!RASTER_RE.test(src)) return src;              // raster only (SVG/data: pass through)
    if (src.indexOf("res.cloudinary.com") !== -1) return src; // already a Cloudinary URL
    const origin = absoluteOrigin(src);
    if (!origin) return src;                            // can't resolve → serve origin
    const transforms = buildTransforms(opts);
    return "https://res.cloudinary.com/" + CLOUDINARY_CLOUD_NAME + "/image/fetch/" + transforms + "/" + origin;
  } catch (_e) {
    return src;                                         // fail-soft to origin
  }
}
