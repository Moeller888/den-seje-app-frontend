# 164Z — Deterministic SVG Re-emit + Asset Promotion for `glasses.round.basic`

**Asset-file promotion + tooling + docs only.** No DB `image_url` update, no shop row creation, no
runtime activation, no `AVATAR_V2` change, no migrations, no Supabase-function changes, no
OpenAI/network. The single new runtime-eligible artifact is one **front-only SVG** placed in `assets/*`
but **not referenced by anything yet** (inert until a future, separately-approved binding step).

Builds on / executes: [`164y-asset-promotion-decision-svg-readiness.md`](164y-asset-promotion-decision-svg-readiness.md)
(D1 SVG, D2 Option A, D3 manual static add), [`164x-asset-promotion-plan.md`](164x-asset-promotion-plan.md)
(promotion plan). Date: 2026-06-23.

---

## A. Section status
- **SVG asset-file promotion + tooling + docs.**
- No DB `image_url` update.
- No runtime activation (`runtimeActivated: false`).
- No shop row creation (`shopActivated: false`).
- No `AVATAR_V2` change (still `false`).
- No migrations, no Supabase-function changes.
- No OpenAI / no network (git fetch/push only).
- No generated build artifacts committed (`tools/avatar/build/*` stays gitignored).

## B. Human review verdict
- **PASS.** The build-only SVG (rendered over `body.svg` at 4× via Playwright) was visually reviewed
  **before** promotion — reads clearly as round glasses, both pupils visible, bridge present,
  front-only (no temples/ear hooks), no clipping, no face/body/hair/skin/eye modification.
- Geometry was **authored directly on the locked live-layer eyes** (cx=68/92, cy=47), **not**
  downscaled from the 1024×1536 Master space (the two coordinate spaces do not share face
  positioning — see 164Y). This corrects the legacy asset's ~2px anchor offset (66/94/46).

## C. Promoted asset
- **Path (tracked, canonical):** `assets/avatar/glasses/glasses-round-basic-v1.svg`
  (appears as `den-seje-app-frontend/assets/avatar/glasses/glasses-round-basic-v1.svg` in the
  frontend/Vercel clone after the frontend ff-pull — same file; the root repo tracks the top-level
  path because `den-seje-app-frontend` is a gitlink, not a tracked directory).
- **viewBox:** `0 0 160 240` (matches the live avatar layer space).
- **Lens centers:** (68, 47) and (92, 47) — exactly the locked eyes.
- **Form:** two round lens rings + translucent tint + raised bridge + tiny front-only side tabs +
  subtle catch-light. **Front-only** — no temples, no ear hooks, no side arms.
- **Pure vector:** no `<image>` tags, no base64, no raster embedding.
- Does **not** modify body / face / hair / skin / eyes / the Northstar Master, and does **not**
  overwrite or alter the existing legacy `assets/avatar/glasses/glasses-round.svg`.

## D. Tooling (deterministic, no AI/network/runtime dependency)
- **`tools/avatar/emit-glasses-svg.mjs`** — generates the front-only SVG purely from the locked
  live-layer anchors (named constants citing `body.svg` / `avatar-layers.js`). Runs local validation
  gates and **fails loud** (exit 1) if any gate is violated; writes the build-only SVG to
  `tools/avatar/build/promote/glasses-round-basic-v1.svg`.
- **`tools/avatar/render-glasses-preview.mjs`** — local review utility; composites the emitted SVG
  over `body.svg` and screenshots it (Playwright/Chromium, local, no network) to
  `tools/avatar/build/promote/glasses-round-basic-v1-preview.png`. Review aid only; not part of
  promotion.
- **Build outputs stay under `tools/avatar/build/*`** (gitignored). The promoted `assets/*` SVG is a
  byte-identical copy of the reviewed build SVG (a deterministic promotion copy, not a separate edit).
- **npm scripts (root `package.json`):** `avatar:emit-glasses-svg`, `avatar:render-glasses-preview`
  (added; no existing scripts removed or changed).

## E. Validation results
**SVG validation (`avatar:emit-glasses-svg`) — all gates pass:**
| Check | Value |
|---|---|
| `viewBox` | `0 0 160 240` ✓ |
| lens centers | (68,47) / (92,47) = locked eyes ✓ |
| surround margin | +3px (x) / +4px (y) over sclera rx7/ry6 ✓ |
| pupil clearance | 6.2px ✓ |
| bridge gap | 1.4px (no lens overlap) ✓ |
| extents | x [53.7, 106.3], y [35.7, 58.3] — inside head edges [50,110], no clipping ✓ |
| `hasTemples` | false ✓ |
| promoted == build SVG | byte-identical (re-emit reproduces it) ✓ |

**PNG candidate QA (unchanged — re-run for safety):** `pass=true`, `pupilFrameIntrusion.total=0`,
`outsideMaskPx=0`, `preClipOverflowPx=0`, `opaquePx=5472`, `lensError L/R=9px` (reported, not gated).
**Manifest:** `create-item-candidate-manifest` → `status: OK`, `candidate`, `humanReviewRequired: true`,
`runtimeActivated/shopActivated/dbRowsCreated/av2Required = false`.

## F. Explicit non-actions (164Z did NOT)
- Did **not** update `shop_items.image_url` (the existing `glasses-round` row is untouched).
- Did **not** create or modify shop rows / catalog entries.
- Did **not** modify runtime / frontend activation logic.
- Did **not** enable or change `AVATAR_V2`.
- Did **not** modify migrations or Supabase functions.
- Did **not** modify the legacy `glasses-round.svg` or any other existing asset.
- Did **not** commit generated build outputs (`tools/avatar/build/*` remains gitignored).
- Did **not** call OpenAI / the network (beyond git fetch/push).

## G. Future section (separately approved — NOT authorized by 164Z)
The promoted SVG is **inert** until a future section binds it. The recommended next step (per 164Y D2
Option A):

- **165A — Bind `glasses-round` shop row to the promoted SVG asset:** update
  `shop_items.image_url` for the existing live `glasses-round` row from `glasses-round.svg` →
  `/assets/avatar/glasses/glasses-round-basic-v1.svg` (an asset upgrade of one item; same id, name,
  price, slot `eyes`, z=7), via a deliberate migration — **only after separate approval**. That step,
  not 164Z, performs the DB change and makes the new asset live.

### Boundaries honored
No OpenAI, no network (git only), no AI/bulk generation. No DB/RPC/migrations, no Supabase-function
changes, no `image_url` update, no shop rows, no runtime activation, no `AVATAR_V2` change, no build
artifacts committed. Asset-file + tooling + docs only.
