# 167A Phase-2 — Cut-Guide Review Worksheet (P2-0)

**Status: DRAFT (review instrument).**

_Human review of the review artifacts emitted by `tools/avatar/extract-phase2-cut-guides.mjs`
(P2-0). Deterministic, non-AI. Artifacts are **review/build only — NOT runtime assets, NOT
geometry-altering.** Source of truth = `assets/avatar/reference/Northstar Master.png` (Tier-0 base,
D-032; sha `2ca10ef8…`)._
_Parent: [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) (§4/§6/§11) ·
[167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md) (§6, §13 gate 1). Anchor
source: [164l-anchor-mask-review-worksheet.md](./164l-anchor-mask-review-worksheet.md)._

> **This worksheet has two jobs:** (1) confirm the cut guides are correct + useful for the human
> painter who authors the Phase-2 rig layers; and (2) record the **Phase-2-scoped anchor/eye-box
> sign-off** for the runtime rig — the sign-off the plan §13 gate 1 requires **before** any Phase-2
> code. It is distinct from the 164L pass, which was CONDITIONAL and scoped to the **Tier-2 cosmetic
> tooling baseline only** (2026-06-18); the anchor-template fields remain `humanReviewRequired: true`.

---

## Artifacts under review

Regenerate with `node tools/avatar/extract-phase2-cut-guides.mjs` (gitignored output):
- `tools/avatar/build/phase2/cut-guides-overlay-v1.png` — anchor regions + eye opening/iris/pupil
  crosshairs drawn over the Master (1024×1536).
- `tools/avatar/build/phase2/crop-{face,eye-left,eye-right,headwear,back}-region-v1.png` — per-zone crops.
- `tools/avatar/build/phase2/cut-guides-v1.report.json` — every region + eye centre in master /
  served (÷2) / engine-160 (÷6.4) space.

## Recorded extraction values (from the run)

| Field | Value |
|---|---|
| Master dimensions | 1024×1536 ✅ |
| Master sha256 | `2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21` |
| White-matte threshold | `whiteHi = 250` |
| Coordinate spaces | master · served 512×768 (÷2) · engine-160 (÷6.4) |

**Regions** (top-left x,y + w,h; master / engine-160):

| Region | Master x,y,w,h | Engine-160 x,y,w,h | Drives |
|---|---|---|---|
| faceMaskRegion | 402,308,220×192 (r64) | 62.8,48.1,34.4×30 | Face/expression layer (z3) |
| eyeLeftBox | 378,336,98×100 | 59.1,52.5,15.3×15.6 | Eyes layer (z4) |
| eyeRightBox | 531,336,98×100 | 83.0,52.5,15.3×15.6 | Eyes layer (z4) |
| headwearRegion | 344,120,336×200 (r70) | 53.8,18.8,52.5×31.3 | Headwear cosmetic (un-gate P2-b) |
| backMaskRegion | 210,430,600×500 (r80) | 32.8,67.2,93.8×78.1 | Back cosmetic (already safe) |
| glassesBand | 378,335,251×102 | 59.1,52.3,39.2×15.9 | Eyes/glasses cosmetic (un-gate P2-c) |

**Eye centres** (engine-160; the revised raster eye-box vs the frozen legacy blink box):

| Point | Left | Right |
|---|---|---|
| Opening (blink-lid + eye-cosmetic registration) | 66.7, 60.3 | 90.6, 60.3 |
| Iris (iris-tint placement) | 67.5, 60.5 | 90.2, 60.5 |
| Pupil | 68.6, 61.6 | 89.1, 61.4 |
| **Legacy blink — FROZEN, do NOT move** | 68, 47 | 92, 47 |

> **Net revision:** North Star eye-opening centres sit at engine-160 `cy≈60.3` vs legacy `cy47` →
> **~13 units lower**, same-ish horizontal spacing. The revised box is **raster-path only**; the
> legacy `cx68/92 cy47` in `js/avatar-blink-engine.js` stays frozen (moving it regresses the live C2
> avatar). Two eye-box sets coexist, selected by the render branch.

## Review checklist (reviewer fills PASS/FAIL + notes)

| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | **Overlay** reads correctly over Master (regions + eye crosshairs land on-figure) | [ ] P [ ] F | |
| 2 | **crop-eye-left / crop-eye-right** fully contain the eye (sclera + iris + pupil + lash/lid) | [ ] P [ ] F | 98×100 each; enough margin for the z4 eyes layer |
| 3 | **Eye-opening centres** L (66.7,60.3) / R (90.6,60.3) sit on the eye openings | [ ] P [ ] F | vs legacy cy47 → ~13 units lower |
| 4 | **Iris / pupil centres** distinct + correct (iris ≠ pupil ≠ opening) | [ ] P [ ] F | 164S strict semantics |
| 5 | **crop-face-region** covers brows/nose/mouth/chin for the z3 face layer | [ ] P [ ] F | eyes are z4 → painter leaves eye area transparent |
| 6 | **crop-headwear-region** = upper head/crown, **stops above the brows** (eyes clear) | [ ] P [ ] F | D-037 eye-legibility |
| 7 | **crop-back-region** = generous behind-figure (wings/capes/backpacks room) | [ ] P [ ] F | renders behind base (z −20) |
| 8 | **Alpha edge** — no white halo / dirty fringe on the crops at small sizes | [ ] P [ ] F | whiteHi tunable via `--white` |
| 9 | **Region usefulness** — each guide is neither too tight nor too loose for its layer | [ ] P [ ] F | |
| 10 | **Boundaries** — output is gitignored review-only; no runtime/manifest/`AVATAR_R2` change | [ ] P [ ] F | |

## Phase-2-scoped eye-box sign-off (plan §13 gate 1)

Separate, explicit sign-off that the **revised raster eye-box (rows 3–4 above)** may drive the
**runtime blink/eye rig** in Phase-2 (beyond the 164L Tier-2 cosmetic conditional pass). Signing this
clears `humanReviewRequired` **for that use** and is a precondition for Phase-2 rig code.

☐ **APPROVED** — the raster eye-box may drive the runtime rig (blink-lid + eyes re-register to the
   opening/iris/pupil centres on the raster path; legacy C2 anchors stay frozen).
☐ HOLD — needs re-measurement (edit `MANUAL_ANCHOR_OVERRIDES_164L2` / `…_164S` in
   `tools/avatar/extract-anchor-masks.mjs`, re-run, re-review). ☐ REJECT.

## Verdict

☐ **PASS** — cut guides are correct + useful; painter may proceed against the §4 brief.
☐ CONDITIONAL PASS — usable with the noted conditions. ☐ FAIL — re-extract/re-measure first.

**Conditions / notes:**
1. _(fill in)_

Reviewer: __________________  ·  Date: __________

## Boundaries

Cut guides + crops are **review/build artifacts only** (gitignored `tools/avatar/build/phase2/`),
**never runtime assets**, **never used to alter geometry**; the **Master is unchanged**; **no AI**
defines geometry/anchors; **no Phase-2 code, no `R2_MANIFEST` change, `AVATAR_R2` stays `false`**.
Re-extraction is deterministic (`node tools/avatar/extract-phase2-cut-guides.mjs`); recalibration =
edit the manual anchor overrides in `tools/avatar/extract-anchor-masks.mjs`, then re-run.
