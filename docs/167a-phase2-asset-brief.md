# 167A Phase-2 — Asset Production Brief (P2-0)

Status: **DOCUMENTATION ONLY — the asset package spec that MUST be delivered before Phase-2 code may
start.** No runtime code, no runtime assets, no manifest edit, no `AVATAR_R2` change, no anchor/mask
change is made by this document. This is step **P2-0** of the Phase-2 plan.
Date: 2026-07-01. Owner: project owner (solo).

Parent: [167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md) (audit + sequence).
Reads with: [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md) (§5–§7),
[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md) (binding guardrail),
[164k-anchor-mask-extraction-plan.md](./164k-anchor-mask-extraction-plan.md) + the 164L worksheet
(anchor/mask source), [project-state.md](./project-state.md) (D-013/D-018/D-021…D-033).

---

## 1. Purpose & relation to the Phase-2 plan

The [Phase-2 decomposition plan](./167a-phase2-decomposition-plan.md) establishes *what* Phase-2 is and
*how* it sequences. It stops at a hard gate: **Phase-2 runtime code cannot start until a specific
package of hand-authored raster layers exists.** This brief **specifies that package exactly** — every
file, its dimensions, z-layer, background rule, producer (generated vs human art), and acceptance
criteria — so the art can be produced (offline) and reviewed against one checklist. It is the concrete
input to plan steps 1–4 (§13 of the plan).

This document does **not** authorise producing runtime assets. It authorises, at most, one optional
**review-only** tooling step (§11) whose output is gitignored build artifacts.

## 2. Phase-1 baseline that MUST remain intact

Phase-2 is additive. None of the following may change while the Phase-2 package is produced or wired:

- **v1 PNG baked base stays the Phase-1 rollback + runtime asset.**
  `assets/avatar-r2/base/body-neutral-medium-v1.png` (deterministic alpha-cut of the Master, 512×768,
  ~244 KB) is **never mutated or removed** (D-018). It remains the render for the Phase-1 baked path.
- **`AVATAR_R2 = false` by default** (`js/avatar-layers.js:313`). Production keeps rendering the
  untouched C2/SVG avatar.
- **`localStorage.avatar_r2 = "1"` per-browser pilot opt-in stays intact** — no cohort/DB, no global
  flip. Existing pilot users keep working.
- **C2/SVG fallback stays intact** — when `useRaster` is false (default, or missing art), the render is
  byte-for-byte the C2/SVG path.
- **Legacy/C2 anchors stay frozen** — the revised eye-box (§6) is raster-path only; the live avatar's
  blink/expression geometry does not move.

## 3. Required Phase-2 layer cut-list (overview)

Decompose the single Phase-1 baked image back into the locked living stack (163F / D-030). MVP identity
scope = **neutral-medium first** (D-040 accepted single-identity tradeoff; other tones/types are a
later additive version, no rewrite).

| Layer | Needed for MVP | Notes |
|---|---|---|
| Decomposed **base v2** (skin + neutral underlayer + head, no face) | ✅ | highest-risk asset (D-033) |
| **Face / expression** ×5 (neutral, curious, focused, determined, proud) [+happy, surprised = 7 per D-024] | ✅ (5 min) | tone-agnostic (D-022) |
| **Eyes — fixed** (sclera + lash + shape + fixed catch-light) | ✅ | D-021 |
| **Eyes — iris/pupil** (tintable iris disk) | ✅ | separate → eye-color token tint (D-015) |
| **Eyelid / blink** | interim optional | CSS-ellipse can bridge; raster `eyelid-{tone}` is the D-023 target |
| **Hair — raster luminance map** | ✅ | multiply-tint (D-031); replaces inline-SVG hair |
| **Masks** (QA/build) | reuse existing | 5 MVP masks already exist; revise per-slot for un-gating (§7) |

## 4. Per-layer specification

Shared rules (ADR-163D / D-027): **served 512×768** (integer ÷2 from the 1024×1536 Master →
anchor-stable), **full-canvas** (no crop/trim — pure z-overlay), **transparent background, no white
halo**. Runtime format = **WebP** (§8). Immutable + versioned by filename (D-018).

### 4.1 Base body — `base/body-neutral-medium-v2.webp`
- **Dimensions / bg:** 512×768, transparent, full-canvas.
- **z-layer:** 0–2 (`C2_BASE_Z = 0`).
- **Content:** skin + **neutral underlayer** (plain t-shirt/trousers/sneakers direction, D-029) + head.
  **NO face, NO eyes, NO hair, NO outfit-cosmetic detail.** The baked face/hair/outfit of v1 are
  removed and the skin/underlayer *reconstructed behind them*.
- **Producer:** **HUMAN paint-over over `Northstar Master.png`** (D-033). **AI forbidden** (four AI
  regenerations drifted proportions/identity — R-6). Master geometry is the sole datum (D-032).
- **Acceptance:** passes the **164B.3 base-coherence gate** (no head-size/ratio/pose/face/eye/hair
  drift; childlike + premium anime finish; reads as the same character); onion-skin vs Master aligns.
- **Version:** ships as **`-v2`** — the v1 baked PNG is never overwritten (§2, D-018).

### 4.2 Face / expression — `face/face-{expression}-v1.webp`
- **Set:** `neutral, curious, focused, determined, proud` (the 5 the engine drives today) — produce
  `happy, surprised` too for the full D-024 set of 7 (map already falls back to `neutral`, no code
  change). **Never-negative:** no `sad`/`angry` (D-024).
- **Dimensions / bg:** 512×768, transparent, full-canvas.
- **z-layer:** 3.
- **Content:** brows, nose, mouth + `mix-blend-mode:multiply` blush. **Tone-agnostic — no skin, no
  eyes** (the base owns skin; eyes are z4) (D-022).
- **Producer:** HUMAN. AI forbidden (geometry-defining rig layer).
- **Acceptance:** each expression registers exactly on the Master face position; positive-only reading;
  legible at 32px; consistent line/cel language with the base; one set works across skin tones.

### 4.3 Eyes — fixed — `eyes/eyes-neutral-fixed-v1.webp`
- **Dimensions / bg:** 512×768, transparent, full-canvas. **z-layer:** 4.
- **Content:** sclera + eyelash + eye outline/shape + the **fixed** catch-light/highlight (D-021).
  Not tintable.
- **Producer:** HUMAN. **Acceptance:** aligns to the North Star **eye box** (§6); large expressive eyes
  legible at 32px; no lash/catchlight aliasing at small sizes.

### 4.4 Eyes — iris / pupil — `eyes/eyes-neutral-iris-v1.webp`
- **Dimensions / bg:** 512×768, transparent, full-canvas. **z-layer:** 4 (paired under the fixed layer).
- **Content:** the **tintable iris disk** only (neutral luminance so the eye-color token tints it);
  pupil rendered as part of the iris art. Separate file so eye-color is a free token, not an asset
  explosion (D-012/D-015). *(“if needed”: it is needed for MVP eye-color — keep it a distinct file.)*
- **Producer:** HUMAN. **Acceptance:** iris centre matches the anchor template's `irisCenter` (§6);
  tints cleanly across the eye-color set; pupil stays legible after tint.

### 4.5 Eyelid / blink — `eyelid/eyelid-medium-v1.webp` *(interim optional)*
- **Dimensions / bg:** 512×768, transparent, full-canvas. **z-layer:** 5.
- **Content:** eyelid that shows skin (skin-bearing → per skin tone, D-023).
- **Producer:** HUMAN. **Interim allowance:** Phase-2 MAY keep the existing **CSS-ellipse blink**
  (already skin-tone-aware) re-positioned to the North Star eye box (§6) — lowest risk; the raster
  eyelid is a refinement, **not** an MVP blocker.
- **Acceptance:** the lid closes over the North Star eye opening (no off-eye flash); tone blends with
  the base skin.

### 4.6 Hair — raster luminance map — `hair/hair-northstar-v1.webp`
- **Dimensions / bg:** 512×768, transparent, full-canvas. **z-layer:** 40 (`C2_HAIR_Z`).
- **Content:** **neutral grayscale luminance map** of `hair-northstar-v1` (D-031), designed to be
  tinted at runtime via a wrapper background = `--hair-base` + `mix-blend-mode:multiply` (step-3 §6).
  Replaces the inline-SVG token-fill technique; the `HAIR_COLOR_TOKENS` identity model is preserved.
- **Producer:** HUMAN. **Acceptance:** silhouette matches Master; all 8 hair-color tokens tint
  acceptably (R-7) at 32/48/64px; a `mix-blend-mode`-unsupported fallback renders the untinted map
  (never fails the render).

### 4.7 Masks (QA/build artifacts — **not runtime**)
- **Existing (reuse):** `tools/avatar/build/masks/mask-{aura,back,headwear,face,eyes}-v1.png`
  (magenta = allowed) from `extract-anchor-masks.mjs`, plus
  `tools/avatar/build/anchors/avatar-anchor-template-v1.json`. These are **not** shipped assets and
  drive only QA gates / cosmetic un-gating, never geometry (D-041).
- **Phase-2 need:** the head/face/eye masks must be **re-validated against the revised eye-box** (§6)
  before the matching cosmetic slot is un-gated (§7). No new masks are required to render the rig.

## 5. Human-art brief (binding on the producer)

- **Preserve the North Star likeness exactly.** `assets/avatar/reference/Northstar Master.png`
  (1024×1536, sha `2ca10ef8…`, D-032) is the sole geometric datum. Head size, head:body ratio, pose,
  hair silhouette, face structure, eye size/shape, cel-shade language, line weight and palette all
  derive from it.
- **No redesign.** This is decomposition of the *existing* character, not a new design. No proportion
  changes, no "improvements," no style drift.
- **No AI regeneration / inpainting for any rig layer** (base/face/eyes/eyelid/hair) — D-033/D-034.
  AI outputs may be used **only** as outfit-style reference, never as production geometry. (AI remains
  allowed for Tier-2 *cosmetic overlays*, which are out of Phase-2 scope.)
- **v2 base must pass the coherence gate** (164B.3) before it becomes the datum for the other layers.
  Produce it **first**; the face/eyes/eyelid/hair are authored against the signed v2 base so all layers
  share one coordinate space.
- **Face / eyes / blink must align to the North Star eye-box** (§6), not the legacy `cy47` box.
- **Deliverables per layer:** layered source + flattened review PNG + (later) served WebP + change
  notes + an onion-skin overlay vs Master.

## 6. Eye-box / anchor numbers

**Legacy blink geometry (frozen — do NOT move).** `js/avatar-blink-engine.js:35`, 160×240 viewBox:

| Eye | cx | cy | rx | ry |
|---|---|---|---|---|
| Left  | 68 | 47 | 7.6 | 6.6 |
| Right | 92 | 47 | 7.6 | 6.6 |

**North Star eye-box (revised — raster path only).** Source =
`tools/avatar/build/anchors/avatar-anchor-template-v1.json` (`anchors.eyeLeftBox`/`eyeRightBox`,
164L.4 geom recalibrated by 164S/164T eye semantics). Master px, with derived served (÷2) and legacy
engine-space (÷6.4) values:

| Field | Master (1024×1536) | Served (512×768, ÷2) | Engine 160×240 (÷6.4) |
|---|---|---|---|
| Left eye box | x378 y336, 98×100 | x189 y168, 49×50 | x59.1 y52.5, 15.3×15.6 |
| Left eye-opening centre | (427, 386) | (213.5, 193) | **(66.7, 60.3)** |
| Left iris centre | (432, 387) | (216, 193.5) | (67.5, 60.5) |
| Left pupil centre | (439, 394) | (219.5, 197) | (68.6, 61.6) |
| Right eye box | x531 y336, 98×100 | x265.5 y168, 49×50 | x83.0 y52.5, 15.3×15.6 |
| Right eye-opening centre | (580, 386) | (290, 193) | **(90.6, 60.3)** |
| Right iris centre | (577, 387) | (288.5, 193.5) | (90.2, 60.5) |
| Right pupil centre | (570, 393) | (285, 196.5) | (89.1, 61.4) |

**Net revision:** the North Star eyes sit **~13 units lower** in the 160-space (cy ≈ **60** vs legacy
**47**) at roughly the same horizontal spacing, in a slightly larger box. The revised **eye-opening
centre** is the value the blink lid + eye-cosmetic registration should use; `iris`/`pupil` centres
(distinct per 164S) drive iris tint placement and glasses bridge. *(These artifact values supersede the
Phase-2 plan's rounded ≈(63,61)/(95,61); use the table above.)*

**Anchor template status — existing but NOT signed for the rig runtime path.**
- The template + 5 masks **exist** and are in North Star proportions.
- The **164L worksheet is CONDITIONAL PASS (human-signed 2026-06-18)** — **but that sign-off covers the
  Tier-2 cosmetic mask/tooling baseline only**, explicitly "NOT approval to start a bulk shop-item
  batch," and every anchor field in the JSON still carries **`humanReviewRequired: true`**.
- **No sign-off yet covers using the eye-box to re-register the runtime blink/eye rig.** A
  **Phase-2-scoped anchor sign-off** (confirming the eye-box drives the living rig) is a Phase-2 gate
  (§10). Until then these numbers are "build against," not "ship against."

## 7. Cosmetic implications

- **Phase-1 keeps headwear / face / eyes / clothing gated.** Only `R2_PHASE1_SAFE_SLOTS = ["aura",
  "back"]` render on the raster base (behind-figure, anchor-independent). This does not change in P2-0
  and is not changed by delivering the asset package.
- **Phase-2 needs the cosmetic anchor revision *before* un-gating.** Head/face/eye cosmetics register to
  the legacy anchors today, so they float on the raster base. Each slot un-gates only after its mask +
  the revised anchor (§6) are signed, staged as in the plan (§8: headwear → face/eyes → torso).
- **Clothing (`torso`/`body`/`neck`) stays gated until the v2 decomposed base exists** — the v1 base
  carries the Master's baked outfit, so clothing overlays clash until the neutral underlayer replaces it.
- **No slot names, z-values, shop, ownership or inventory change** for any of this.

## 8. WebP requirement

- **PNG is acceptable for REVIEW artifacts** (onion-skins, cut guides, flattened review renders) —
  gitignored under `tools/avatar/build/` (§9/§11).
- **WebP is REQUIRED for the runtime Phase-2 asset stack.** Six decomposed layers as PNG would exceed
  the D-019 budget (<~350 KB total avatar); WebP-with-alpha is mandatory here (not optional as it was
  for the single Phase-1 base).
- **✅ Encoder now available (2026-07-02):** vendored libwebp `cwebp.exe` 1.5.0 (`tools/avatar/vendor/`,
  gitignored; reproducible via `tools/avatar/fetch-cwebp.mjs`) + wrapper `tools/avatar/encode-webp.mjs`
  (`node encode-webp.mjs <in.png> <out.webp> [--half]`). Zero npm deps. Proven: Phase-1 base 242 KB PNG
  → 37.7 KB WebP (512×768, alpha preserved, within budget). This clears the former hard encoder gate
  (§10 gate 4) — encoding the Phase-2 layers now waits only on the human art.

## 9. Review artifacts (all gitignored, non-runtime)

Everything produced for *review* (not runtime) lands under `tools/avatar/build/` (gitignored,
regenerable), never in `assets/avatar-r2/`:
- **Onion-skin previews** — each layer / the composite overlaid on `Northstar Master.png`.
- **Cut guides** — the Master with the anchor rectangles (eye boxes, face region, head oval, hair
  silhouette) drawn on, as painter guides.
- **Alpha / mask previews** — alpha-edge checks (no white halo) at 32/48/64px; the existing magenta
  masks for cosmetic-gate validation.
- **Report JSON** — dimensions, alpha %, KB budget, legibility measurements.

These are QA/build artifacts only; they must never be promoted to runtime nor used to alter geometry
(D-041).

## 10. Do-not-start gates (all must hold before Phase-2 code)

1. **Human art delivered** — the full package (§4.1–§4.6) exists and each layer's acceptance criteria pass.
2. **v2 base passes 164B.3** coherence gate (the datum for every other layer).
3. ✅ **Anchor/mask worksheet signed for the Phase-2 rig** — **SATISFIED (owner-countersigned
   2026-07-01):** the revised **eye-box** (§6) is approved to drive the runtime blink/eye rig
   (raster-path only). See [167a-phase2-cut-guides-review-worksheet.md](./167a-phase2-cut-guides-review-worksheet.md).
4. ✅ **WebP encoder available** — **SATISFIED (2026-07-02):** vendored libwebp `cwebp.exe` +
   `encode-webp.mjs` (§8). _Encoding all runtime layers still waits on the art (gate 1)._
5. **Visual review passed** — human onion-skin-vs-Master sign-off (167a §E) on the composed raster
   stack; eyes legible at 32/48/64px; hair tint fidelity across all colors.

Until all five hold: **no Phase-2 runtime code, no manifest cutover, no engine reactivation, no
cosmetic un-gate. `AVATAR_R2` stays `false`; the pilot opt-in and C2/SVG fallback stay intact.**

## 11. First safe next step after this doc

**Optional, review-only:** a small extension of the existing deterministic extractors
(`extract-master-base.mjs` / `extract-anchor-masks.mjs`) that emits **cut guides + onion-skin previews**
(the Master with anchor rectangles + per-region crops) into `tools/avatar/build/` — **gitignored output
only, non-AI, Master read-only, no runtime wiring, no `assets/avatar-r2/` write, no manifest change.**
Its sole purpose is to hand the human painter precise cut guides for §4. This is a build-tool step, not
Phase-2 implementation, and remains optional — the art can also be produced directly against the
numbers in §4/§6.

---

_This document changes no runtime code, no runtime assets, no manifest, no anchors/masks, and does not
alter `AVATAR_R2`. It specifies the asset package and the gates; it does not authorise producing runtime
assets or starting Phase-2 implementation._
