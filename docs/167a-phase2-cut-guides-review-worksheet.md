# 167A Phase-2 — Cut-Guide Review Worksheet (P2-0)

**Status: RUN — ✅ PASS (2026-07-01); eye-box APPROVED (raster-path only) — OWNER COUNTERSIGN APPROVED 2026-07-01.**
_Plan §13 **gate 1 (Phase-2-scoped anchor/eye-box sign-off) is now SATISFIED**. Phase-2 runtime code
may pass **gate 1 only** — gates 2–5 (human v2 base + 164B.3, remaining layers, WebP encoder, visual
sign-off) remain OPEN, so Phase-2 implementation is still not started. (Assistant visual review +
owner countersign — see Verdict. Regenerable review instrument.)_

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
| 1 | **Overlay** reads correctly over Master (regions + eye crosshairs land on-figure) | **[x] P** [ ] F | Eye boxes on the eyes, headwear on the crown above the brows, face on the lower face, back generous behind, grey box frames head+hair; eye crosshairs sit on the eyes. |
| 2 | **crop-eye-left / crop-eye-right** fully contain the eye (sclera + iris + pupil + lash/lid) | **[x] P** [ ] F | Both 98×100 crops contain sclera + brown iris + pupil + white catch-light + upper lash, with margin — sufficient for the z4 eyes layer. |
| 3 | **Eye-opening centres** L (66.7,60.3) / R (90.6,60.3) sit on the eye openings | **[x] P** [ ] F | Green crosshairs land on both eye openings; ~13 units below legacy cy47 (North Star eyes lower + larger) — matches the art. |
| 4 | **Iris / pupil centres** distinct + correct (iris ≠ pupil ≠ opening) | **[x] P** [ ] F | Cyan (iris) + magenta (pupil) crosses are distinct and sit on the brown disk / black pupil; converged nasally (164S). |
| 5 | **crop-face-region** covers brows/nose/mouth/chin for the z3 face layer | **[x] P** [ ] F | Covers brow → nose → mouth → chin; the eye zone falls inside the box (painter leaves it transparent — eyes are z4); lower edge reaches the jaw/chin. |
| 6 | **crop-headwear-region** = upper head/crown, **stops above the brows** (eyes clear) | **[x] P** [ ] F | **Snug:** lower edge (master ≈y320) sits just above the brows (eye boxes start y336); forehead visible between the box and the eyes → eyes clear. See condition 1. |
| 7 | **crop-back-region** = generous behind-figure (wings/capes/backpacks room) | **[x] P** [ ] F | Spans shoulders → hips, past both arms, wider than the torso; renders behind base (z −20). |
| 8 | **Alpha edge** — no white halo / dirty fringe on the crops at small sizes | **[x] P** [ ] F | Transparent bg; no white fringe on the crops; `whiteHi=250` gives a clean cut. |
| 9 | **Region usefulness** — each guide is neither too tight nor too loose for its layer | **[x] P** [ ] F | Each region is proportionate to its layer's job (see rows 5–7). |
| 10 | **Boundaries** — output is gitignored review-only; no runtime/manifest/`AVATAR_R2` change | **[x] P** [ ] F | Output only in `tools/avatar/build/phase2/` (gitignored); no runtime asset, no `R2_MANIFEST`, `AVATAR_R2` untouched. Verified against `git status`. |

## Phase-2-scoped eye-box sign-off (plan §13 gate 1)

Separate, explicit sign-off that the **revised raster eye-box (rows 3–4 above)** may drive the
**runtime blink/eye rig** in Phase-2 (beyond the 164L Tier-2 cosmetic conditional pass). Signing this
clears `humanReviewRequired` **for that use** and is a precondition for Phase-2 rig code.

☑ **APPROVED** — the raster eye-box may drive the runtime rig (blink-lid + eyes re-register to the
   opening/iris/pupil centres on the raster path; legacy C2 anchors stay frozen). _Basis: the
   opening/iris/pupil centres (rows 3–4) land correctly on the eyes in the overlay + eye crops; the
   ~13-unit drop vs legacy matches the North Star art. **Raster-path only** — legacy `cx68/92 cy47`
   in `js/avatar-blink-engine.js` stays frozen._ **✅ OWNER COUNTERSIGN APPROVED 2026-07-01** — the
   human-authority gate is satisfied; **plan §13 gate 1 is cleared** (the assistant visual review that
   filled this row is now owner-confirmed). Phase-2 runtime code may pass **gate 1 only**; the
   remaining gates (2–5) stay open.
☐ HOLD — needs re-measurement (edit `MANUAL_ANCHOR_OVERRIDES_164L2` / `…_164S` in
   `tools/avatar/extract-anchor-masks.mjs`, re-run, re-review). ☐ REJECT.

## Verdict

☑ **PASS** — cut guides are correct + useful; painter may proceed against the §4 brief. All 10
   checklist rows PASS; the Phase-2-scoped eye-box is APPROVED (raster-path only, owner countersign
   recommended).
☐ CONDITIONAL PASS — usable with the noted conditions. ☐ FAIL — re-extract/re-measure first.

**Conditions / notes:**
1. **Headwear lower edge is snug to the brow line** (row 6): a hat/headwear item should keep its brim
   at or above master ≈y320; re-verify at composite time against the D-037 eye-legibility gate.
2. **Eye-box approval is raster-path only** — the legacy C2 blink/eye anchors (`cx68/92 cy47`,
   `js/avatar-blink-engine.js`) stay frozen; two eye-box sets coexist, selected by the render branch.
3. **✅ Owner countersign APPROVED (2026-07-01)** — the human-authority sign-off gate (plan §13
   gate 1) is **SATISFIED**. Phase-2 runtime code may now pass **gate 1 only**; gates 2–5 (human v2
   base + 164B.3, remaining face/eyes/eyelid/hair layers, WebP encoder, visual sign-off) remain OPEN,
   so Phase-2 implementation is **still not started**.
4. Review artifacts remain gitignored/regenerable (`node tools/avatar/extract-phase2-cut-guides.mjs`);
   this review did not change runtime code, assets, the manifest, or `AVATAR_R2`, and did not start
   Phase-2 implementation.

Reviewer: **Claude Code — assistant visual review (recorded on owner instruction)**  ·  Date: **2026-07-01**
Owner countersign: **✅ APPROVED — 2026-07-01**
**Result: ✅ PASS · eye-box APPROVED (raster-path only; legacy C2 anchors stay frozen) · plan §13
gate 1 SATISFIED — Phase-2 runtime code may pass gate 1 only (gates 2–5 remain open).**

## Boundaries

Cut guides + crops are **review/build artifacts only** (gitignored `tools/avatar/build/phase2/`),
**never runtime assets**, **never used to alter geometry**; the **Master is unchanged**; **no AI**
defines geometry/anchors; **no Phase-2 code, no `R2_MANIFEST` change, `AVATAR_R2` stays `false`**.
Re-extraction is deterministic (`node tools/avatar/extract-phase2-cut-guides.mjs`); recalibration =
edit the manual anchor overrides in `tools/avatar/extract-anchor-masks.mjs`, then re-run.
