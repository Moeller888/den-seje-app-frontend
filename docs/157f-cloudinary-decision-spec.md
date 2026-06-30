# 157F — Cloudinary Decision Specification

Status: **SPEC / DECISION — no code, no account, no infra, no runtime change.**
Date: 2026-06-30. Owner: project owner (solo). Gate: **UNGATED** (pure documentation).
Builds on: the 157A audit, [ARCHITECTURE.md](./ARCHITECTURE.md) §8/§13, [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md)
(§7 storage, §10 performance budget), `docs/167a-master-asset-raster-wiring-plan.md`.
Decides the boundary for **157G** (Cloudinary delivery/optimisation), which stays **SOFT-gated**
(buildable default-off; activation needs only a free Cloudinary account, not staging/Supabase Pro).

---

## 1. Purpose

Decide **whether, where and how** Cloudinary (free tier) should sit in the avatar image path, as an
**optional delivery/optimisation (CDN + transform) layer** — without changing the source of truth and
without introducing secrets into the frontend or cost into the pilot.

## 2. Current state (verified)

- **Avatar render assets** are **SVG** files committed in the repo under `/assets/avatar/{slot}/…`
  and served as **static files by Vercel's CDN** (e.g. `js/avatar-layers.js`: `BASE_SRC =
  "/assets/avatar/base/body.svg"`, hair/cosmetic `*-c2.svg`). The live C2 render is a **flat SVG
  placeholder** (see AVATAR_SYSTEM.md §2).
- **Future raster assets** (167a / ADR-163D) will be **WebP** (512×768) at `assets/avatar-r2/{slot}/`;
  the AI item-generation pipeline writes raster artifacts to **Supabase Storage** buckets
  (ARCHITECTURE.md §8).
- **No user-uploaded images exist.** Avatar art is **authored or pipeline-generated**; students do
  not upload pictures. (OCR photo-answers, 157I, are processed **in-browser** and never uploaded.)

**Implication:** Cloudinary's value (format negotiation, quality compression, responsive resizing)
applies to **raster** assets. For **SVG** it adds little — SVG is already tiny, vector, and
CDN-cached by Vercel. So Cloudinary is **premature for today's SVG placeholder** and becomes relevant
**once the 167a raster assets ship**.

## 3. What Cloudinary offers (and where it helps here)

| Capability | Benefit | Relevant to us? |
|---|---|---|
| `f_auto` (WebP/AVIF negotiation) | smaller, modern formats per browser | ✅ raster only |
| `q_auto` (quality compression) | bytes ↓ at equal perceived quality | ✅ raster only |
| `w_/h_/dpr_` (responsive resize) | serve 32/48/64px avatars at exact size | ✅ raster (legibility budget, AVATAR_SYSTEM §10) |
| Global CDN cache | fast delivery | ➖ Vercel already CDN-serves repo assets |
| Storage of derivatives | offload large catalogs | ✅ future Tier-2 shop catalog (1000+ items) |
| On-the-fly transforms | no pre-baking variants | ✅ raster catalog |

## 4. Integration boundaries considered

```
A. FETCH / DELIVERY MODE (no upload, no secret)
   <img src="https://res.cloudinary.com/<cloud>/image/fetch/f_auto,q_auto,w_256/
                https://<source-url>/assets/avatar-r2/base/body-...webp">
   Cloudinary pulls from the existing source (Vercel/Supabase Storage), optimises, caches.
   Needs only the PUBLIC cloud name. Source of truth unchanged.

B. SIGNED UPLOAD (Edge Function holds the API secret)
   pipeline → Edge Function (CLOUDINARY_API_SECRET) → upload/transform → store in Cloudinary
   Needs a secret (Edge only, never frontend). Cloudinary becomes a managed derivative store.

C. UNSIGNED UPLOAD PRESET (frontend uploads directly)
   browser → Cloudinary (unsigned preset, public) → stored asset
   Designed for USER-uploaded content from the client.
```

## 5. Evaluation against the project's constraints

| Criterion | A. Fetch/delivery | B. Signed-Edge upload | C. Unsigned preset |
|---|---|---|---|
| Needs a secret? | **No** (public cloud name) | Yes (Edge env only) | No (public preset) |
| Frontend-secret risk (no build step) | none | none | none |
| Fits our asset origin (authored/generated, no user uploads) | ✅ yes | ✅ yes | ❌ **no use case** (no user uploads) |
| Keeps Supabase Storage / repo as source of truth | ✅ derivative cache | ⚠️ duplicates into Cloudinary | ⚠️ Cloudinary becomes a store |
| Implementation surface | tiny (rewrite `src` builder behind a flag) | new Edge Function + pipeline change | new frontend upload flow (unused) |
| GDPR / minors | low — **avatar art is not student PII** | low | low |
| Free-tier fit (pilot) | ✅ best (cache + transforms) | ✅ | n/a |

## 6. Decision

**Primary: Boundary A — Cloudinary FETCH/DELIVERY mode**, behind a default-off flag, applied to
**raster** avatar assets **only**, **after** the 167a raster assets exist.

- **Rationale:** zero secret, smallest surface, Supabase Storage/repo stays the **single source of
  truth** (Cloudinary is a pure derivative cache), and it delivers exactly the wins we need
  (`f_auto`/`q_auto`/responsive sizing within the mobile legibility budget). It needs only the public
  cloud name — consistent with the no-build-step, no-frontend-secret constraint.
- **Reject Boundary C (unsigned preset):** there is **no user-upload use case**; it would add an
  unused flow.
- **Hold Boundary B (signed-Edge upload) in reserve:** adopt **only if** we later need to *store*
  generated derivatives in Cloudinary (e.g. a very large Tier-2 catalog) or need authenticated
  transforms. The API secret would live in Edge env (`CLOUDINARY_API_SECRET`), never the frontend,
  and would reuse the `_shared/` Edge pattern.

**Timing:** **do not wire Cloudinary for the current SVG placeholder** — no benefit. 157G implements
Boundary A behind a flag and is **activated once raster assets ship (167a)**; until then it stays
inert (or 157G is itself deferred behind the avatar raster work).

## 7. Source-of-truth rule (binding)

Supabase Storage (generated items) and the repo `assets/` (authored layers) remain the **source of
truth**. Cloudinary holds **only derivatives** (cached, optimised copies) and may be purged/rebuilt
at any time. A Cloudinary outage must **fall back to the origin URL** (fail-soft); never let the
avatar fail to render because the optimiser is down.

## 8. Cost (free tier)

Cloudinary free tier ≈ 25 monthly "credits" (~25k transformations / 25 GB storage / 25 GB bandwidth).
At pilot scale (tens of classes, immutable versioned assets cached hard — ADR-163D D-018) this is
**comfortably free**. Immutable filenames + long cache TTL keep transformation counts low. No paid
plan is required for the pilot; revisit only at much larger scale.

## 9. Configuration (for 157G, when activated — documented, not set now)

- **Frontend (public, no secret):** `CLOUDINARY_CLOUD_NAME` (+ a flag `ENABLE_CLOUDINARY`, default
  off, mirroring `ENABLE_SENTRY`). Resolved like other config; the avatar `src` builder wraps raster
  URLs in a Cloudinary fetch URL when enabled, else returns the origin URL.
- **Edge (only if Boundary B is ever adopted):** `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` as
  Supabase secrets — never in the frontend.

## 10. Non-goals / out of scope

- No Cloudinary in the current SVG render path.
- No user-upload flow (Boundary C rejected).
- No change to the avatar identity/slot/z model or the asset pipeline source of truth.
- Routing **student-generated** images (e.g. OCR photos) through Cloudinary is **out of scope and
  discouraged** — those are processed in-browser (157I) and are student data; this spec covers
  **avatar art only**.

## 11. Activation gate & next step

- **157G (implementation)** is **SOFT-gated:** the fetch-URL builder + flag can be built and
  static-validated now (default-off, zero impact). **Activation** needs only a **free Cloudinary
  account** (no Supabase Pro, no staging branch) and is best done **after 167a raster assets exist**.
- **Owner decisions to confirm before 157G activation:** (1) create a free Cloudinary account →
  cloud name; (2) confirm Boundary A (fetch mode) for v1; (3) confirm we wait for raster assets.

## 12. Decision summary

| Question | Answer |
|---|---|
| Use Cloudinary? | Yes, optionally, for **raster** delivery/optimisation — not for SVG. |
| Which boundary? | **A — fetch/delivery (no secret)**; B (signed-Edge) reserved; **C rejected**. |
| Source of truth | Supabase Storage / repo `assets/` — Cloudinary holds derivatives only. |
| When? | After 167a raster assets ship; 157G builds it default-off meanwhile. |
| Cost | Free tier; pilot-safe. |
| Secrets in frontend? | None (public cloud name only). |
