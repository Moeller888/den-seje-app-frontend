# Project State — Den Seje App (Avatar / C2)

_Authoritative project-state snapshot. Update at the end of each major section._
_Last updated: 2026-06-14_

---

## Current Production State
- **Supabase:** project `den-seje-app` (ref `tjzbehwfagiwpwodsgwg`), region eu-west-1, plan **Pro**.
- **Data:** 31 profiles; 5 with equipped cosmetics; 2 with an explicit legacy hairstyle.
- **Frontend:** Vercel (`den-seje-app-frontend.vercel.app`), auto-deploys from GitHub `main`.
- **Avatar shown to users:** **LEGACY** render. C2 is built but **NOT active**.

## Current Commit
- `origin/main` = **`89b8ea3`** ("feat: add C2 cosmetics rendering parity").
- Frontend clone and ROOT clone both at `89b8ea3` (in sync).
- One GitHub repo: `Moeller888/den-seje-app-frontend`. The ROOT clone embeds the
  frontend as a vestigial gitlink that is **not** on the Vercel deploy path.

## Feature Flags
- **`AVATAR_V2 = false` (OFF)** — `js/avatar-layers.js:230`.
- Per-browser test override: `localStorage.avatar_v2='1'`.
- **No cohort / percentage rollout mechanism exists.**

## Current Avatar System
- **Legacy (LIVE):** `body.svg` + hair + equipped cosmetics; pseudo-3D/gradient style.
- **C2 (BUILT, flag-gated, INACTIVE):** flat blank-canvas base (medium/dark) +
  identity hair (7) + hair-color tokens (8, inline) + cosmetics parity + z-model.
  Single shared render module `js/avatar-render-c2.js` (`mountC2Avatar`), wired into
  avatar.html, hub.html, app.js, shop.html — all gated by `isAvatarV2()`.

## C2 Status
- **C2 is technically implemented but NOT activated** (`AVATAR_V2 = OFF`).
- Sections 155B–160 complete. DB migrations 155E (hair_color) + 155F (hairstyle
  alignment) applied to production. Render pipeline + cosmetics parity committed
  and pushed. Goldens in `tests/c2-golden/`.
- Activation status: **YELLOW** — ready for internal test; not for full activation.
- **Known gap:** the implemented flat-SVG C2 base does NOT match the chosen design
  reference on its defining traits (eye size, art finish) — see `avatar-vision.md`.

## Art Direction Decision (NEW)
- **SVG-only is REJECTED as the final art strategy.** Flat SVG cannot deliver the
  desired avatar art quality (large expressive eyes + premium anime-inspired finish).
- **Next direction:** hybrid / raster asset-pipeline assessment (no implementation yet).

## Major Decisions (register)
| ID | Decision |
|---|---|
| D-001 | Avatar direction = **C2 Base Avatar Premium** (human chibi/anime kid), chosen in a bake-off over creature/axolotl, chibi study-hero, geometric mascot, legacy redesign. |
| D-002 | Hair = identity; Hair Color = identity; Companion = not MVP; Badge = not MVP. |
| D-003 | Hair Color = inline SVG + CSS tokens (`--hair-base` / `--hair-shadow`). |
| D-004 | Asset spec: viewBox `0 0 160 240`; LOCKED anchors head `cx80 cy50 r30`, eyes `cx68/92 cy47`; flat (R1–R5, no gradients). |
| D-005 | C2 base reuses the legacy anchors (preserve blink/expression) → C2 shipped as a same-proportion restyle. |
| D-006 | Free staging not recommended (migration drift); use Supabase Branching (Pro) or direct prod apply. |
| D-007 | Direct prod apply of 155E/155F (assessed SAFE, executed, verified). |
| D-008 | Z-model reform (159B): deterministic `C2_LAYER_Z`; expr z=3, blink z=5, hair z=40. |
| D-009 | Cosmetics parity-first (render legacy assets in C2); flat redesign progressive. |
| D-010 | 159D: static neutral expression in C2 shop preview (face parity). |
| **D-011** | **SVG-only rejected as final art direction; move to hybrid/raster pipeline.** |

## Completed Sections
155A–155I · 156A–156C · [prod-apply 155E/155F] · 157 · 158A–158C · [ROOT sync] ·
159A–159G · [ROOT sync] · 160 · 161A.

## Open Questions
- OQ-1: Hybrid vs Full-raster pipeline — exact strategy (resolved at the level of
  "not SVG-only"; sub-strategy TBD).
- OQ-2: Does the C2 base need a redesign to match the reference, or a raster
  re-asset? (Feeds the pipeline assessment.)
- OQ-3: Onboarding does not expose C2 vocabulary (hair_color picker, C2 hairstyles).
- OQ-4: No cohort / % activation mechanism.

## Current Risks
- R-1 (Medium): Art-direction drift — implemented flat base ≠ reference (eyes/finish).
- R-2 (Medium): Onboarding mismatch — users cannot pick C2 vocabulary.
- R-3 (Low): Visual/cosmetics regression — mitigated by goldens + flag OFF.
- R-4 (Low-op): Migration-history drift (ledger) — `db push` blocked; MCP apply only.
- R-5 (Low-op): Two-clone sync discipline (ff-pull after each push).

## Technical Debt
- TD-1: Legacy cosmetic assets are pseudo-3D (clash with flat C2); flat redesign
  pending (armor/cape fit "Needs Adjustment").
- TD-2: Expression assets are legacy-styled (aligned, not flat).
- TD-3: Migration-history drift; repo migration files ≠ DB version ledger.
- TD-4: Gitlink anomaly in ROOT clone (vestigial, not on deploy path).
- TD-5: Local prod-data snapshot `backups/…` kept out of repo (no `.gitignore` yet).
- TD-6: Whole flat-SVG C2 asset set may be superseded by the raster/hybrid pipeline.

## Next Recommended Section
**161C — Hybrid / Raster Pipeline Assessment** (no implementation): compare
hybrid (raster assets + existing slot/identity system) vs full-raster; cost,
maintenance, performance, tooling, and impact on the existing C2 architecture.
