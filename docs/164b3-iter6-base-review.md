# 164B.3 — Base Prototype Review (FILLED) · iter6 v2-base candidate
`body-neutral-medium-v2-candidate-iter6-lowerhead.png` · Base-Coherence Gate (Phase-2 Gate 2)

**Status: FILLED REVIEW — assistant assessment, pending owner countersign.**
_Filled copy of the reusable [164b3-base-review-worksheet.md](./164b3-base-review-worksheet.md) template
(template NOT overwritten). Reviews a **review-only, gitignored, NOT-promoted** candidate._
_Compare against `Northstar Master.png` ONLY (D-032). Candidate produced under **D-042**
(AI-assisted MASKED inpaint iter1→iter3, then DETERMINISTIC vector-assisted correction iter4→iter6)._

> **Honesty framing:** measurable rows (§2) are computed programmatically; style/skin/finish rows are
> the assistant's visual assessment; the **final verdict is a human-authority gate** and is recorded as
> assistant → **owner countersign pending** (mirrors the cut-guide sign-off).

---

## 1. Prototype metadata
| Field | Value |
|---|---|
| Asset name | `body-neutral-medium-v2-candidate-iter6-lowerhead` (rev: iter6) |
| Reviewer | Claude Code (assistant) — owner countersign pending |
| Date | 2026-07-03 |
| Candidate path | `tools/avatar/build/phase2/inpaint-v2-base/…-iter6-lowerhead.png` (gitignored, review-only) |
| Resolution (must be 1024×1536) | 1024 × 1536  [x] OK |
| Source image (geometry, D-032) | `assets/avatar/reference/Northstar Master.png` |
| Master sha256 | `2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21` |
| Production method | **D-042**: masked AI inpaint (iter1→iter3) + deterministic scalp/lower-head carve (iter4→iter6). No unmasked regeneration. |

## 2. Proportion measurements (measured programmatically)
_Figure/head measured from figure silhouette; neck = narrowest row y470–560._

| Metric | Master | iter6 | Delta | Tolerance | Pass/Fail |
|---|---|---|---|---|---|
| Figure height (px) | 1469 (y40–1508) | 1373 (y135–1507) | −96 (all in hairless crown) | — | — |
| Feet baseline (px) | y1508 | y1507 | −1 | — | ✓ body height matches |
| Head H (top→neck) | 479 (incl. hair) | 381 (bald scalp) | −98 (= missing hair layer) | — | — |
| **Head:body ratio — BASE alone** | 3.07 (w/ hair) | **3.60** (bald) | +0.53 | ±0.15 head | ⚠ see note |
| **Head:body ratio — composed w/ hair** | 3.07 | **≈3.07** (hair overlay restores crown) | ≈0 | ±0.15 head | [x] P |
| Symmetry — centroid @y386 / y800 | 517 / 511 | 512 / 510 | well-centred | — | [x] P |
| Vertical stretch (difference-overlay) | — | none (deterministic carve) | — | none allowed | [x] P |
| Max body width | 486 @y240 (hair) | 410 @y806 (shoulders) | body silhouette aligns | — | [x] P |

**§2 result:** ☑ **PASS (conditional on the hairless-base note).** The bald base reads +0.53 heads
"too small" **only because it has no hair** (correct — hair is a separate z40 layer); once composed with
hair the ratio returns to the Master's 3.07. Body height/feet/centring/no-stretch all pass.

## 3. Style review (1–5; 5 = indistinguishable from Master)
_Pass bar: every field ≥4 = PASS · any =3 = CONDITIONAL · any ≤2 = FAIL._

| Criterion | Score | Reviewer notes |
|---|---|---|
| Line-weight consistency | 3 | Body/outfit line-work OK (AI inpaint); scalp/jaw have soft deterministic edges, no crisp line. |
| **Cel-shading consistency** | **2** | **Deciding defect: the scalp + front jaw are FLAT (single tone), no cel-shade ramp vs the Master's shaded skin.** Localised to the head. |
| Shape-language consistency | 3 | Head silhouette matches (ellipse ≈ Master skull); ear hints are flat. |
| Clothing-fold consistency | 3 | Grey tee/trousers carry some folds from the inpaint; simpler than Master. |
| Anime readability @32px | 4 | Reads as a clean chibi base. |
| Anime readability @48px | 4 | — |

**§3 result:** ☑ **FAIL by the strict rubric** (cel-shading = 2). _Mitigation (context, not a pass):
the flat scalp is **hidden under the hair layer** in composition; only the **front jaw** flat-shading is
visible → a small, localised, non-structural finish gap._

## 4. Skin-tone validation (vs D-028 `medium` ramp)
| Region | Tone | Ramp consistency | Seam | Pass/Fail |
|---|---|---|---|---|
| Face (blank) | warm `#EEC7AF`-ish (sampled 238,199,175) | [ ] flat (no ramp) | [x] none | ⚠ tone OK, ramp missing |
| Neck | same warm tone | [ ] flat | [x] none (0 gap px — verified) | ⚠ |
| Hands | from inpaint, consistent | [x] OK | [x] none | [x] P |
| Forearms | from inpaint | [x] OK | [x] none | [x] P |

**§4 result:** ⚠ **Tone matches (no wrong colour, no seam), but the head skin lacks the shade RAMP** —
same root issue as §3. Not a colour/seam failure; a shading-depth gap.

## 5. Outfit validation
| Item | Check | Pass/Fail |
|---|---|---|
| Neutral outfit (plain grey tee/trousers/low sneakers) | [x] yes | [x] P |
| No logos / symbols / star | [x] none | [x] P |
| No signature elements (sweater, star, cuffs, cargo, wristbands, branded shoes) | [x] none | [x] P |
| D-032 compliance (geometry from Master; **D-042** masked, no *unmasked* regeneration) | [x] confirmed (per D-042) | [x] P |
| Geometry preservation (silhouette deterministically constrained to Master) | [x] confirmed | [x] P |

**§5 result:** ☑ **PASS.**

## 6. Reconstruction validation
| Region | Style | Geometry | Tone | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Torso | [x] | [x] | n/a | [x] P | grey tee, from inpaint |
| Arms / forearms | [x] | [x] | [x] | [x] P | hands/forearms preserved |
| Legs / feet | [x] | [x] | n/a | [x] P | feet baseline matches Master |
| Neutral outfit | [x] | [x] | n/a | [x] P | — |
| **Facial skin behind removed features (scalp/jaw)** | [ ] flat | [x] | [x] | ⚠ **FLAT** | the §3/§4 finish gap lives here |
| Ears | [ ] flat hint | [x] pos. | [x] | ⚠ | small deterministic hints, not modelled |

**§6 result:** ⚠ all regions geometry/tone OK; **scalp/jaw + ears are flat (finish), not "Frankenstein"** — localised, non-structural.

## 7. Base-Coherence Gate summary
- [x] §2 proportions within tolerance (composed ratio ✓, centred, no stretch; hairless-base note)
- [ ] §3 every style field ≥4 — **NO** (cel-shading = 2)
- [ ] §4 all skin ramp-consistent — tone ✓ but ramp flat
- [x] §5 outfit PASS (neutral + D-032/D-042 + no drift)
- [x] §6 no "Frankenstein" region (defects are flat-finish, localised)
- [x] No forbidden baked elements (no eyes / brows / nose / mouth / hair / baked blush — face is blank ✓)
- [x] Full-canvas 1024×1536; clean alpha

**CONDITIONAL-PASS test:** §2 PASS ✓ and §5 D-032 PASS ✓ (non-negotiables met); the only defect
(flat head shading) is **non-structural and fixable WITHOUT re-tracing geometry** (add a shade ramp);
a punch-list is attached (§9) and downstream layers stay blocked until cleared.

## 8. Final verdict
☐ PASS   ☑ **CONDITIONAL PASS** _(assistant; owner countersign pending)_   ☐ FAIL

**Mandatory rationale:**
```
Non-negotiable gates PASS: §2 proportions (composed head:body ≈3.07 = Master; centred; no stretch;
body/feet match) and §5 D-032/geometry (silhouette deterministically constrained; D-042-compliant).
The single failing dimension is §3 cel-shading = 2 (flat scalp/jaw, no shade ramp) — which by the
STRICT rubric is a FAIL, but qualifies for CONDITIONAL because it is localised, non-structural, and
fixable without re-tracing geometry. Context: the flat scalp is hidden under the z40 hair layer; only
the front jaw's flat shading is visible. Face is correctly blank (eyes/face are separate future layers).
Honest bottom line: NOT a clean PASS; CONDITIONAL with a mandatory shading punch-list, pending owner
countersign (human-authority gate).
```
Reviewer: **Claude Code (assistant)**  ·  Owner countersign: **☐ pending**  ·  Date: 2026-07-03

## 9. Blocking issues
**Must-fix (CONDITIONAL punch-list — clear before promotion / before downstream layers):**
1. Add a soft cel-shade ramp to the **front jaw/chin** (the visible flat area) — raises §3 cel-shading ≥3.
2. (Lower priority) light shading on the scalp dome — mostly hidden under hair; optional.
3. Ear hints are flat placeholders — refine or accept as hair-covered.

**Nice-to-have:** subtle cheek blush (multiply) to match Master warmth (belongs to the face layer, not the base).

**Downstream blockers (gated until this base is cleared):** face (z3), eyes (z4), eyelid (z5), and a
**clean, dedicated hair layer** (the review overlay was contaminated with the Master's brows/eyes — a
real hair-only layer is still to be produced).

---

**Boundaries:** review-only. iter6 is a gitignored, **NOT-promoted** candidate. This review changes no
runtime code, no `assets/avatar-r2/`, no `R2_MANIFEST`; `AVATAR_R2` stays `false`; Phase-2 not started.
All candidate files (iter1/iter3/iter4/iter5/iter6) kept.
