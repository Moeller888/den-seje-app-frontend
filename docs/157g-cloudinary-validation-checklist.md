# 157G — Cloudinary Delivery: Validation Checklist

_Proof-of-correctness for the optional Cloudinary fetch/delivery layer._
_Module: `js/cloudinary.js` (`cdnUrl`). Wiring: `js/avatar-render-c2.js` (`mountC2Avatar`)._
_Decision: `157f-cloudinary-decision-spec.md`. Owner: project owner. Last reviewed: 2026-06-30._

Ships **default-off** (`ENABLE_CLOUDINARY=false`, empty cloud name). Part A verified now; Part B is
activation (set the cloud name + flag) and is only meaningful **once raster (WebP) avatar assets
exist** (167a) — Cloudinary does nothing useful for the current SVG placeholder.

---

## A. Verified now (flag off)

| # | Check | Method | Result |
|---|---|---|---|
| A1 | `js/cloudinary.js` + `js/avatar-render-c2.js` are valid ESM | `node --check` | ✅ Pass |
| A2 | **Default-off passthrough** | `cdnUrl()` returns input unchanged when `isCloudinaryEnabled()` is false | ✅ Pass (review) |
| A3 | **Raster-only** | SVG / `data:` / non-image URLs pass through even when enabled (regex gate) | ✅ Pass (review) |
| A4 | **Inert today** | every current avatar `<img>` layer is `*.svg` → passthrough regardless of flag | ✅ Pass |
| A5 | **No secret** | only a public cloud name is used; signed uploads not implemented | ✅ Pass |
| A6 | **Fail-soft** | any error in `cdnUrl` → returns original `src` (avatar never breaks) | ✅ Pass (review) |
| A7 | Avatar render unchanged | production smoke (login→quiz renders avatar via `mountC2Avatar`) | ✅ Pass (1 passed) |
| A8 | Source of truth unchanged | Cloudinary is fetch-mode only; Supabase Storage / repo `assets/` remain canonical | ✅ Pass (review) |

## B. Activation acceptance test (after 167a raster + free Cloudinary account)

**Setup:** create a free Cloudinary account → cloud name; set `CLOUDINARY_CLOUD_NAME` and
`ENABLE_CLOUDINARY=true` in `js/cloudinary.js`; deploy a preview with at least one **WebP** avatar
asset present.

| # | Check | Expected |
|---|---|---|
| B1 | Raster layer is optimised | a WebP `<img>` src becomes `https://res.cloudinary.com/<cloud>/image/fetch/f_auto,q_auto/<origin-url>` |
| B2 | SVG layer untouched | any `*.svg` `<img>` keeps its origin URL |
| B3 | Origin resolution | root-absolute `/assets/...` is prefixed with `location.origin`; absolute http(s) used as-is |
| B4 | Optimisation works | Network shows a smaller, format-negotiated image; avatar renders identically |
| B5 | **Cloudinary outage → fail-soft** | block `res.cloudinary.com`; the `<img>` 404s gracefully, or set flag off to fall back to origin; **no render crash** (origin is the source of truth) |
| B6 | Flag off | `ENABLE_CLOUDINARY=false` → all srcs are origin URLs again |
| B7 | No secret in client | confirm only the public cloud name appears; no API key/secret |
| B8 | Resize transforms (optional) | passing `{width}` adds `w_<n>` to the transform string |

## Notes / limitations

- **Scope:** wired into the single shared avatar render seam (`mountC2Avatar`). Other ad-hoc avatar
  `<img>` sites (if any) can adopt `cdnUrl()` the same way — trivial follow-up.
- **Timing:** Cloudinary benefits **raster**; do not expect any change for the current SVG placeholder.
  Real value lands with the 167a Master raster + Tier-2 shop items.
- **Boundary B (signed-Edge upload)** is intentionally **not** implemented — reserved for if/when we
  need to *store* derivatives (157F §6); its secret would live in Edge env only.
- **Cost:** free tier; immutable versioned assets + hard cache keep transformation counts low.
