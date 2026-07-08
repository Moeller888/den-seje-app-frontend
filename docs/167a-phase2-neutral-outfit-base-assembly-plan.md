# 167A Phase-2 — Neutral-Outfit / Base-Assembly Plan (post Gate 2A)

**Status: PLAN — recorded 2026-07-07. Documentation only.**
_Not implementation, not tooling, not AI generation, not ComfyUI, not a completed/assembled base, not
neutral-outfit execution, not Gate 3, not runtime, not promotion. No `assets/avatar-r2/` write, no
`R2_MANIFEST` change, `AVATAR_R2` stays `false`._
_Context: [`167a-phase2-feet-completion-decision.md`](./167a-phase2-feet-completion-decision.md) (Option B+D),
[`167a-phase2-gate2a-registration-review.md`](./167a-phase2-gate2a-registration-review.md) (Gate 2A PASS),
[`167a-phase2-base-recovery-decision.md`](./167a-phase2-base-recovery-decision.md) (D-043, revised),
[`164b3-base-review-worksheet.md`](./164b3-base-review-worksheet.md) (the review gate),
[`adr/ADR-163F-raster-asset-spec.md`](./adr/ADR-163F-raster-asset-spec.md) (D-027/D-029/D-022/D-032)._

> **Gate 2A = PASS / owner-review-ready. Gate 2 remains REOPENED / UNDER RECOVERY and is NOT satisfied.
> Gate 3 remains PAUSED.** This plan produces **no assembled/completed base** and changes no runtime.

---

## 1. Executive summary

This plan defines the accepted strategy for producing the **neutral base body** that Gate 2 requires. The
base is assembled from the **frozen Master (authoritative body/lower-legs/feet geometry)** plus the
**recovery-base head contribution (bald scalp + blank face + ears + neck/collar anatomy)**, joined at a
single seam near the neck/collar, followed by **one masked neutral-outfit reconstruction pass**.

**Critical architectural finding:** the neutral target outfit is **short-sleeved** (plain light-grey tee)
while the Master/recovery outfit is a **long-sleeve** green sweater. Neutralization is therefore **not a
recolor** — the short sleeves expose forearms that **do not exist** in the Master (they are hidden by the
long sleeves) and **must be reconstructed as skin**. Underarm reconstruction is the **highest-risk sub-area**
and gets its own sub-gate in the later implementation.

This plan is **docs-only**. Deterministic tooling and AI-assisted masked edits are separate, later,
review-first tasks. Gate 3 (face/eyes/eyelid/hair) stays PAUSED throughout.

## 2. Accepted strategy — B

- **`Northstar Master.png`** remains the **canonical identity/style/coordinate datum** (D-032 preserved)
  **and** the **authoritative body / lower-leg / feet geometry source**.
- **`recovery-base-v1-blankface.png`** contributes the **head / bald scalp / blank face / ears /
  neck-collar anatomy** (registered to the Master by the verified **(−25, −285)** translation).
- **Assembly:** Master body/lower-legs/feet + recovery head contribution → then **one masked
  neutral-outfit reconstruction pass** over the whole outfit.
- **No Gate 3. No face/eyes/eyelid/hair layers. No runtime. No promotion.**

## 3. Options compared

| Option | Description | Seams | Re-rendered surface | Verdict |
|---|---|---|---|---|
| **A** | recovery-base as full body source + neutralize | none (single source) | large — recovery whole body (re-rendered + **cropped feet**) | ❌ loses Master authenticity; feet cropped |
| **B** ✅ | Master body/feet + recovery head + neutralize | **one** (neck/collar, absorbed by the neutralization pass) | small — only the head from recovery | **preferred** |
| **C** | Master full body + only recovery scalp/blank-face patch | **two** (hairline + face-oval, in the high-scrutiny face zone) | smallest | fallback — minimizes reconstruction but adds two face-internal seams |
| **D** | other/fallback | — | — | none better; if B's neck seam proves problematic, fall back to **C** |

### Why B is preferred
- **Preserves Master body/feet geometry** — the authoritative, complete, original lower body (164B.3 §2/§5
  compare geometry against the Master only).
- **Avoids the cropped-feet problem** — the feet come from the Master, which has them (per the feet
  decision); recovery's crop is irrelevant.
- **Localizes the recovery contribution** to the area where it is actually valuable — the **bald scalp +
  blank face** the base layer needs, which the Master cannot provide (occluded by hair/features).
- **Avoids face-internal seams** — recovery's head is one coherent bald+blank product (no hairline or
  face-oval seam inside the face, unlike C).
- **Places the main seam near the neck/collar**, where the masked neutral-outfit pass spans and **absorbs**
  it (grey-on-grey collar), rather than butting two renders in a scrutinized area.
- **Reduces the re-rendered body surface** to just the head; the body stays Master-original.
- **Keeps Gate 3 paused** — the base stays bald + blank; no face/eyes/hair is introduced.

## 4. Neutral outfit requirements

**Target (must):** plain **light-grey short-sleeve t-shirt** · plain **charcoal straight trousers** ·
plain **light-grey low sneakers**.

**Forbidden (must not appear):** hoodie · long-sleeve sweater · front/kangaroo pocket · cargo pockets ·
logo · star · wristbands · straps · text · symbols.

**Reference:** `assets/avatar/reference/Northstar Master - reference.png` is the **visual outfit-appearance
reference ONLY** (it shows this neutral direction with complete feet). **It is NOT a canonical geometry
datum** — on any geometry/proportion/pose question the frozen `Northstar Master.png` always wins (D-032).

**Why this is real reconstruction, not recolor:** the Master wears a **long-sleeve** green sweater; the
neutral target is a **short-sleeve** tee. Short sleeves expose **forearms that do not exist** in the Master
(hidden by the sleeves) and **must be reconstructed as skin** in the Master's cel-shade style, tone-matched
to the visible hands. This is the highest-reconstruction element (echoing D-029 / 164B.1).

## 5. Deterministic vs AI-assisted work split

**Deterministic (non-AI, pure Node built-ins — reuse patterns from `extract-master-base.mjs` /
`extract-anchor-masks.mjs`; later, separately-approved tasks):**
- registration (the verified (−25, −285))
- base-assembly composite (Master body + recovery head via a seam mask)
- seam mask proposal (neck/collar join)
- outfit / underarm region masks (from anchors + colour segmentation, human-confirmed)
- review composites (on-white/on-dark, overlay vs Master, overlay vs reference)
- validation reports (§7)
- alpha / dimension / crop / path guards
- residual colour / symbol detectors (green sweater, orange star, cargo shapes)

**AI-assisted masked edit (D-042, on the frozen Master / registered base only, identity-preserving;
later — NOT in this plan):**
- green long-sleeve sweater → **short-sleeve grey t-shirt**
- **underarm skin reconstruction** (highest risk)
- star removal
- pocket / cuff-stripe / wristband / strap / detail removal
- trousers → plain **charcoal straight trousers** (cargo removal, recolor)
- sneakers → **light-grey low sneakers**
- seam smoothing (neck join, forearm↔tee)
- style matching (line-weight, cel-shade, palette; no geometry/identity/face/hair drift)

## 6. Proposed future review-only artifacts (defined, NOT created here)

All gitignored under `tools/avatar/build/phase2/…`, **review-only, NOT promoted, NOT runtime**:
- `base-assembled-v1.png`
- `base-assembly-seam-audit.png`
- `outfit-region-masks/*.png`
- `underarm-region-mask.png`
- `base-neutral-candidate-v1.png`
- `neutral-vs-reference-overlay.png`
- `neutral-vs-master-geometry-overlay.png`
- `outfit-neutrality-report.json`
- `base-assembly-report.json`

## 7. Validations required before 164B.3

| Check | Requirement |
|---|---|
| canvas / dimensions | 1024×1536 full-canvas (D-027) |
| alpha integrity | clean transparent bg, no halo/fringe |
| Master datum preserved | geometry from the Master; anchors unchanged |
| Master sha guard | Master must still hash-match D-032 (`2ca10ef8…`) where applicable |
| recovery contribution localized + justified | recovery pixels confined to the head region (bald scalp + blank face + ears + neck/collar); body/feet from Master; quantified |
| no geometry drift | proportions within 164B.3 §2 tolerances; no vertical stretch |
| silhouette IoU vs Master | ≥ 0.95 (164B.3 §2) |
| no face / eye / hair drift | forbidden-content check — base stays bald + blank; 0 px facial features / eyes / hair |
| base remains bald + blank | asserted explicitly |
| no original star / logo / cargo remnants | dedicated detectors → 0 px |
| no green sweater remnants | colour/saturation detector → 0 px |
| no wristband / strap / text / symbol remnants | region + pattern checks → 0 px |
| underarm skin tone / style match | reconstructed forearm skin ΔE-matched to hands + Master cel-shade |
| shoe footprint remains Master-compatible | footprint = Master sneaker geometry (164B.3 §6) |
| no runtime promotion | nothing written outside the gitignored build dir |
| no `assets/avatar-r2` write · no `R2_MANIFEST` change · `AVATAR_R2` false | path guards + asserts |

## 8. How 164B.3 is used

- **164B.3 is the review gate** applied **after** a neutral-outfit / base-assembly **candidate exists**
  (fill [`164b3-base-review-worksheet.md`](./164b3-base-review-worksheet.md) per rev).
- Compare geometry/proportions against **`Northstar Master.png` ONLY** (D-032); use
  `Northstar Master - reference.png` for outfit **appearance** only.
- §2 (proportions/IoU) and §5 (D-032/outfit-neutrality) are **non-negotiable** (a fail in either → overall
  FAIL). Extra scrutiny on **§4/§6 forearms** (fully reconstructed skin) and **§6 feet** (footprint = Master
  sneaker).
- **This plan does NOT pass Gate 2.** Gate 2 can pass **only** after: neutral-outfit candidate → **fresh
  164B.3** → **composed visual sign-off (Gate 5)** → **owner countersign**.
- **Gate 3 remains PAUSED** until Gate 2 is properly resolved.

## 9. Highest-risk sub-area — underarm reconstruction (explicit)

- The **short-sleeve tee requires underarm reconstruction** (invented forearm skin).
- This is the **highest-risk sub-area** of the whole neutralization (skin invention + tone/style match +
  no drift into hands or Master geometry).
- In the later implementation it **must have its own sub-gate / review** before the full base is reviewed.
- The provided neutral-outfit reference (`Northstar Master - reference.png`) is a **visual outfit reference
  only, not a canonical geometry datum** (D-032).

## 10. Guardrails (this plan)

- **No assembled/completed base, no neutral-outfit execution, no tooling, no AI, no ComfyUI, no images, no
  build artifacts.**
- **No runtime promotion. No `assets/avatar-r2/` write. No `R2_MANIFEST` change. `AVATAR_R2` = `false`.**
- `build-face-clean.mjs` / `wip/save-build-face-clean` **not used**. Face / eyes / eyelid / hair **not
  continued** (Gate 3 PAUSED).
- `Northstar Master.png` and `recovery-base-v1-blankface.png` reference files **not modified**.
- **Gate 2 remains REOPENED / UNDER RECOVERY — NOT satisfied.**

## 11. Next step (after this plan is accepted)

A separate, review-first task: **deterministic base-assembly + mask tooling** (assembly composite + seam
mask + region masks + validation report as review-only artifacts) — **no AI, no promotion, no runtime,
Gate 3 stays paused**. AI-assisted neutralization and the underarm sub-gate follow after that, each
review-first, before the fresh 164B.3 + composed sign-off that could let Gate 2 pass.

> **Implemented (2026-07-07):** `tools/avatar/build-base-assembly-masks.mjs` (npm:
> `avatar:base-assembly-masks`). Deterministic, non-AI; produces the Strategy-B assembly **preview**
> (Master body/lower-legs/feet alpha-cut + registered recovery head — bald + blank, no Master hair/face
> leakage) plus **approximate review-only mask PROPOSALS** (head contribution, neck/collar seam,
> tee/underarm/trousers/shoes regions), a geometry overlay vs the Master, and
> `base-assembly-report.json` — all gitignored under `tools/avatar/build/phase2/base-assembly/`.
> **NOT a final base, NOT neutral-outfit execution, NOT a Gate-2 pass**; Gate 3 stays PAUSED;
> `AVATAR_R2` false.
> **Tooling reviewed (2026-07-07): PASS / owner-review-ready** —
> [`167a-phase2-base-assembly-masks-review.md`](./167a-phase2-base-assembly-masks-review.md).
>
> **Mask-refinement implemented (2026-07-08):** `tools/avatar/build-neutral-outfit-mask-refinement.mjs`
> (npm: `avatar:mask-refinement`). Deterministic, non-AI; refines the approximate base-assembly proposals
> into **edit-ready** masks (morphological close + hole-fill swallow the star/cuff/pocket/line-art gaps;
> connected-components drop speckles; feather band) plus an explicit **protect mask** (identity-lock, 0-px
> head intrusion asserted) and a per-region **`d042-neutral-outfit-prompt-pack.md`** — all gitignored under
> `tools/avatar/build/phase2/mask-refinement/`. **NOT AI execution, NOT a neutral outfit, NOT a Gate-2 pass;**
> Gate 3 stays PAUSED; `AVATAR_R2` false. **Tooling reviewed (2026-07-08): PASS / owner-review-ready** —
> [`167a-phase2-mask-refinement-review.md`](./167a-phase2-mask-refinement-review.md).
