# Project State — Den Seje App (Avatar / C2)

_Authoritative project-state snapshot. Update at the end of each major section._
_Last updated: 2026-06-15_

---

## Current Production State
- **Supabase:** project `den-seje-app` (ref `tjzbehwfagiwpwodsgwg`), region eu-west-1, plan **Pro**.
- **Data:** 31 profiles; 5 with equipped cosmetics; 2 with an explicit legacy hairstyle.
- **Frontend:** Vercel (`den-seje-app-frontend.vercel.app`), auto-deploys from GitHub `main`.
- **Avatar shown to users:** **LEGACY** render. C2 is built but **NOT active**.

## Current Commit
- `origin/main` = **`4029594`** ("docs: eye system ADR + hybrid raster pipeline ADR (D-012..D-019)").
- Frontend clone and ROOT clone both at `4029594` (in sync).
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
- **Direction:** **Hybrid Raster** — produce the North Star character as WebP layers
  in the existing format-agnostic pipeline; reuse DB / identity / slot / z-model /
  AVATAR_V2 (Section 163A). North Star Avatar v1.0 is the permanent visual target.
- **Pipeline LOCKED (ADR-163D / D-013…D-019):** WebP assets · hair color = hybrid
  luminance-map tint · eye color = iris-base tint (fixed highlight) · skin tone =
  separate base assets · hybrid loading · immutable versioned cache · mobile perf
  budget. Architecture (DB/identity/slots/z-model/AVATAR_V2) unchanged.

## Avatar Layer Model (Hybrid Raster — current)
Ordered render layers (reuse the existing z-model):
1. **Base body** (skin + neutral underlayer + head, NO face) — per skin tone — z 0–2
2. **Face/Expression** (brows, nose, mouth, multiply blush — NO eyes, NO skin) — z 3
3. **Eyes** (separate, tintable iris + fixed highlight — see D-012) — **z 4 (D-030)**
4. **Blink** (eyelid, engine) — z 5
5. **Hair** (luminance map + tint; `hair-northstar-v1`, D-031) — z 40
6. **Cosmetics** (equipped_slots at C2_LAYER_Z)

> This model **supersedes Section 163A's "eyes embedded in Face/Expression"** —
> eyes are now their own layer (D-012 / ADR-163B). Render stack locked by D-030;
> full decomposition spec in `docs/adr/ADR-163F-raster-asset-spec.md`.

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
| D-011b | Hybrid Raster architecture: North Star as WebP layers in the existing pipeline; reuse DB/identity/slots/z-model/AVATAR_V2 (163A). North Star v1.0 = permanent visual target. |
| **D-012** | **Eye system = a SEPARATE, tintable, cosmetic-capable layer** (ADR-163B, Option C). Iris is tint-controlled (eye color = token, free); the eye layer supports future eye cosmetics, eye rarity, magic/rare eyes, glasses, masks, blink and the emotion system. **Supersedes 163A's "eyes embedded in Face/Expression".** Rationale: multiple eye colors + eye cosmetics + rarity would otherwise force a combinatorial asset explosion (expression × color × variant) and a future rewrite; a separate tintable layer is the robust, future-proof choice. |
| D-013 | Asset format = **WebP** (PNG fallback only if needed). Canonical 2:3 raster master 1024×1536 → served WebP 512×768; anchors mapped proportionally from the 160×240 geometry. (ADR-163D) |
| D-014 | Hair color = **hybrid**: canvas multiply-tint of a neutral luminance map (8 colors free as tokens) + hand-painted variant override for problem colors. (ADR-163D) |
| D-015 | Eye color = **tint the iris-base only**; sclera/pupil/glossy highlight stay fixed; rare/magic eyes = iris-swap or eye-effect overlay in the eye slot. (ADR-163D) |
| D-016 | Skin tone = **separate base assets** per `body_type × skin_tone` (cel-shaded skin is not reliably runtime-tintable; body owns skin). (ADR-163D) |
| D-017 | Asset loading = **hybrid**: eager preload of the user's own avatar; lazy-load shop catalog + other avatars. (ADR-163D) |
| D-018 | Cache = **immutable, versioned assets + manifest**; invalidation via filename version (never mutate a shipped asset). (ADR-163D) |
| D-019 | **Mobile-first performance budget**: first-paint < 100ms, full composite < 250ms, total avatar < ~350KB, decoded memory < ~15MB. (ADR-163D) |
| D-020 | **MVP = one Neutral North Star character**; body-type system preserved architecturally (additive later, no rewrite). (ADR-163F) |
| D-021 | **Eye granularity = 2 files**: `iris` (tintable) + `fixed` (sclera/lash/shape + fixed highlight). MVP scope; cosmetic/rarity capability (D-012) preserved. (ADR-163F) |
| D-022 | **Face/Expression layer = tone-agnostic**: no opaque skin shading (base owns skin), blush = `multiply`, carries brows/nose/mouth; one face set shared across skin tones. (ADR-163F) |
| D-023 | **Blink = WebP eyelid assets per skin tone** (eyelid shows skin → skin-bearing layer). (ADR-163F) |
| D-024 | **Expression MVP = positive only**: neutral, happy, curious, focused, determined, surprised, proud (7). `sad`/`angry` excluded — permanent **never-negative policy** (resolves OQ-6). (ADR-163F) |
| D-025 | **Hair compression ignored in MVP**; contract hook reserved: `hair_state = full \| compressed` (MVP produces `full`). (ADR-163F) |
| D-026 | **Cosmetic recolor = hybrid**: MVP = baked assets; tint = future opt-in (no cosmetic tint pipeline in MVP). (ADR-163F) |
| D-027 | **Asset canvas = full canvas, all layers**, transparent padding; no cropped/trimmed per-layer assets (one shared coordinate space). (ADR-163F) |
| D-028 | **North Star Master v1.0 = `medium` skin-tone token** (internal token, not a subjective colour reading; no new tone tokens / no rename now). (ADR-163F, 164A) |
| D-029 | **Neutral body-underlayer = a derived production asset** cut from the master; the master's sweater/jeans/sneakers are reference art (future cosmetic set), never baked into `base`. (ADR-163F, 164A) |
| D-030 | **Eye layer z-index = 4**; render stack locked: base z0–2 · face z3 · **eyes z4** · blink z5 · hair z40 · cosmetics `C2_LAYER_Z`. Fills the eyes gap left by D-008. (ADR-163F, 164A) |
| D-031 | **North Star hairstyle token = `hair-northstar-v1`** (one approved hairstyle; produced as a neutral luminance map, brown = default tint). (ADR-163F, 164A) |

## Completed Sections
155A–155I · 156A–156C · [prod-apply 155E/155F] · 157 · 158A–158C · [ROOT sync] ·
159A–159G · [ROOT sync] · 160 · 161A · 161B · 161B.5 (docs baseline committed) ·
161C–161E · 162A–162B (North Star spec + prompt package) ·
163A (Hybrid Raster arch) · 163B (Eye System ADR) · 163C (eye docs) · 163D (pipeline ADR) ·
163F (decomposition & raster asset spec) · 163G (MVP scope decisions D-020…D-027) ·
163H (raster asset spec documentation: ADR-163F + state/vision update + consistency check) ·
164A (North Star Master v1.0 decomposition spec — **COMPLETE**; decomposition locks D-028…D-031).

## Open Questions
- OQ-1: ~~Hybrid vs Full-raster~~ **RESOLVED** — Hybrid Raster + WebP (163A/163D).
- OQ-2: ~~Base redesign vs re-asset~~ **RESOLVED** — raster re-asset from North Star v1.0.
- OQ-3: Onboarding does not expose C2 vocabulary (hair_color picker, C2 hairstyles).
- OQ-4: No cohort / % activation mechanism.
- OQ-5: ~~Neutral, symmetric base POSE must be derived from North Star~~ **RESOLVED**
  (2026-06-15) — Master v1.0 is a near-symmetric front pose; D-029 authorises the
  neutral body-underlayer as a derived production asset (cut in 164B). (164A)
- OQ-6: ~~"Sad / negative" expression vs 151A "never-negative"~~ **RESOLVED** — D-024
  locks a permanent never-negative policy; `sad`/`angry` excluded from MVP (ADR-163F).
- OQ-7: ~~Confirm MVP eye scoping (2 files, face-driven emotion)~~ **RESOLVED**
  (2026-06-15) — D-021 stays locked: MVP eyes = 2 files (`iris.webp` + `fixed.webp`),
  MVP emotion is face-driven. Per-expression eye-shape variants are a **future additive
  capability**, not part of MVP (does not change D-012).

## Current Risks
- R-1 (Medium): Art-direction drift — flat SVG base ≠ North Star (eyes/finish). Being
  resolved by the Hybrid Raster re-asset.
- R-2 (Medium): Onboarding mismatch — users cannot pick C2 vocabulary.
- R-3 (Low): Visual/cosmetics regression — mitigated by goldens + flag OFF.
- R-4 (Low-op): Migration-history drift (ledger) — `db push` blocked; MCP apply only.
- R-5 (Low-op): Two-clone sync discipline (ff-pull after each push).
- R-6 (High, art): AI style drift + decomposition seams across raster assets — mitigate
  by producing all layers from one North Star + style-lock + gatekeeper + golden QA.
- R-7 (Medium, tech): Hair/iris tint quality (canvas multiply + fixed highlight) —
  mitigate via hybrid tint + hand-painted overrides; prototype early.

## Technical Debt
- TD-1: Legacy cosmetic assets are pseudo-3D (clash with flat C2); flat redesign
  pending (armor/cape fit "Needs Adjustment").
- TD-2: Expression assets are legacy-styled (aligned, not flat).
- TD-3: Migration-history drift; repo migration files ≠ DB version ledger.
- TD-4: Gitlink anomaly in ROOT clone (vestigial, not on deploy path).
- TD-5: Local prod-data snapshot `backups/…` kept out of repo (no `.gitignore` yet).
- TD-6: Flat-SVG C2 asset set is **superseded** by the Hybrid Raster pipeline (kept
  for rollback during transition; remove once raster ships).

## Next Recommended Section
**164B — Cut & Export the Neutral Stack** (asset production): decompose frozen Master
v1.0 against the locked 164A spec (ADR-163F) and export the neutral stack as full-canvas
1024×1536 → 512×768 WebP (D-013/D-027) — `body-neutral-medium` (neutral underlayer,
D-029), `face-neutral`, `eyes-neutral-iris` + `eyes-neutral-fixed`, `eyelid-medium`,
`hair-northstar-v1` (luminance map, D-031) — at the locked z-stack (D-030), with clean
background→alpha. Run the QA gate (eyes legible@32px/expressive@48px, face paints no
skin, iris tints with fixed highlight, blink seam, D-019 weight). `AVATAR_V2` stays OFF;
no runtime wiring yet. 164B proves **one** neutral stack; the 6 other expressions +
cosmetics follow (parity-first, D-009).
