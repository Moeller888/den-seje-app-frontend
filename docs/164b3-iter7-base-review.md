# 164B.3 — Base Prototype Review (FILLED) · iter7 v2-base candidate
`body-neutral-medium-v2-candidate-iter7-shaded.png` · Base-Coherence Gate (Phase-2 Gate 2)

> **🔴 INVALIDATED / SUPERSEDED (2026-07-05, D-043).** This CONDITIONAL PASS is **WITHDRAWN.** A
> corrective visual audit found a structural **skin-colored bust/chest-plate artifact** in the iter7
> base (a wide flat skin oval on the shirt, no real chin→neck→collar) — the earlier §2 "proportions
> PASS" relied on per-row width metrics that missed the shape, and pale-on-white composites camouflaged
> it. iter7 (and the whole iter4→iter7 carve line) is **invalidated as a Phase-2 base**. **Gate 2 is
> reopened**; a new recovery basis (`recovery-base-v1-blankface.png`) is adopted. See
> [`167a-phase2-base-recovery-decision.md`](./167a-phase2-base-recovery-decision.md). This review is
> retained for history only — **do NOT treat it as a Gate-2 pass.**

**Status: ~~CONDITIONAL PASS — OWNER COUNTERSIGNED 2026-07-04~~ → WITHDRAWN / INVALIDATED (2026-07-05, D-043; see above).**
_Filled copy of the reusable [164b3-base-review-worksheet.md](./164b3-base-review-worksheet.md) template
(template NOT overwritten). **iter7 SUPERSEDES [iter6](./164b3-iter6-base-review.md) as the Gate-2 base
review candidate.** Compare against `Northstar Master.png` ONLY (D-032)._
_Candidate produced under **D-042**: masked AI inpaint (iter1→iter3) → deterministic vector-assisted
lower-head correction (iter4→iter6) → **deterministic warm cel-shade touch-up (iter7)**. No unmasked
regeneration._

> **What changed vs iter6:** iter7 clears iter6's main punch-list item by adding a **deterministic warm
> cel-shade ramp** to the front jaw / lower face (`tools/avatar/build-iter7-shading.mjs`). §3 cel-shading
> improves **2 → 3**. Geometry, alpha, silhouette, pose, outfit, hands, shoes and the blank face are
> **unchanged** (only skin pixels below y440 recolored; alpha untouched).

---

## 1. Prototype metadata
| Field | Value |
|---|---|
| Asset name | `body-neutral-medium-v2-candidate-iter7-shaded` (rev: iter7) |
| Reviewer | Claude Code (assistant) → **owner countersigned** |
| Date | 2026-07-04 |
| Candidate path | `tools/avatar/build/phase2/inpaint-v2-base/…-iter7-shaded.png` (gitignored, review-only, NOT promoted) |
| Resolution (must be 1024×1536) | 1024 × 1536  [x] OK |
| Source image (geometry, D-032) | `assets/avatar/reference/Northstar Master.png` (sha `2ca10ef8…`) |
| Production method | **D-042**: masked AI inpaint → deterministic lower-head carve (iter6) → deterministic cel-shade (iter7). No unmasked regeneration. |
| Supersedes | [164b3-iter6-base-review.md](./164b3-iter6-base-review.md) |

## 2. Proportion measurements (unchanged from iter6 — iter7 only recolours skin)
| Metric | Master | iter7 | Tolerance | Pass/Fail |
|---|---|---|---|---|
| Feet baseline | y1508 | y1507 | — | ✓ body height matches |
| Head:body ratio — composed w/ hair | 3.07 | ≈3.07 (hair overlay restores crown) | ±0.15 head | [x] P |
| Head:body ratio — bald base alone | 3.07 | 3.60 (hairless by design) | note | ⚠ hair is a separate z40 layer |
| Symmetry — centroid @y386 / y800 | 517 / 511 | 512 / 510 | — | [x] P |
| Vertical stretch | — | none (deterministic) | none allowed | [x] P |

**§2 result:** ☑ **PASS** (composed head:body ≈ Master; centred; no stretch; body/feet match; hairless-base note).

## 3. Style review (1–5)
_Pass bar: every field ≥4 = PASS · any =3 = CONDITIONAL · any ≤2 = FAIL._

| Criterion | iter6 | **iter7** | Notes |
|---|---|---|---|
| Line-weight consistency | 3 | 3 | unchanged |
| **Cel-shading consistency** | **2** | **3** | **iter7: warm cel-shade ramp on front jaw/lower face — gives form. Objective: lower-face luminance stddev 6.60 → 7.68 (Δ+1.08). Matches Master base→shadow ratio (×0.74 warm).** |
| Shape-language consistency | 3 | 3 | head silhouette matches |
| Clothing-fold consistency | 3 | 3 | unchanged |
| Anime readability @32px | 4 | 4 | — |
| Anime readability @48px | 4 | 4 | — |

**§3 result:** ☑ **CONDITIONAL** (cel-shading now = 3; strict-FAIL cleared). Not yet full PASS (that needs
all style fields ≥4 — the shading is a single under-jaw band, simpler than the Master's multi-zone
cel-modelling). Honest note: the cel-shadow sits slightly low (an under-chin band) — a future refinement
could raise it toward the mid-jaw for closer modelling.

## 4. Skin-tone validation
| Region | Tone | Ramp | Seam | Pass/Fail |
|---|---|---|---|---|
| Face (blank) | warm base + **new warm cel-shadow** on lower jaw | [x] ramp present (jaw) | [x] none | [x] P (improved) |
| Neck / hands / forearms | consistent warm tone | [x] OK | [x] none | [x] P |

**§4 result:** ☑ **PASS** — tone consistent, no seam; the lower-jaw now carries a shade ramp (was flat in iter6).

## 5. Outfit validation
| Item | Check | Pass/Fail |
|---|---|---|
| Neutral outfit (plain grey tee/trousers/low sneakers) | [x] yes | [x] P |
| No logos / symbols / star | [x] none | [x] P |
| No signature elements | [x] none | [x] P |
| D-032 / **D-042** compliance (masked, no unmasked regeneration; silhouette deterministically constrained) | [x] confirmed | [x] P |

**§5 result:** ☑ **PASS.**

## 6. Reconstruction validation
All body regions geometry/tone OK (unchanged from iter6). **Facial skin (front jaw): now cel-shaded**
(was the flat region in iter6). Ears remain small deterministic hints (hair-covered). No "Frankenstein"
regions; defects are localised finish only.

## 7. Base-Coherence Gate summary
- [x] §2 proportions within tolerance (composed ratio ✓, centred, no stretch)
- [ ] §3 every style field ≥4 — **NO** (cel-shading = 3 → CONDITIONAL, not full PASS)
- [x] §4 skin tone consistent, no seam, jaw ramp present
- [x] §5 outfit PASS (neutral + D-032/D-042)
- [x] §6 no "Frankenstein" region
- [x] No forbidden baked elements (face blank; no eyes/brows/nose/mouth/hair/baked blush)
- [x] Full-canvas 1024×1536; clean alpha (unchanged)

**CONDITIONAL-PASS test:** §2 PASS ✓ and §5 D-032 PASS ✓ (non-negotiables met); the only sub-PASS
dimension (§3 cel-shading = 3) is **non-structural and improved from iter6**; a small punch-list remains
(§9). Downstream layers stay blocked until Gate 3/5.

## 8. Final verdict
> **🔴 WITHDRAWN / INVALIDATED (2026-07-05, D-043)** — bust/chest-plate structural failure; not a Gate-2
> pass. The verdict recorded below is historical only.

☐ PASS   ☑ ~~**CONDITIONAL PASS**~~ (WITHDRAWN)   ☐ FAIL

**Mandatory rationale:**
```
Non-negotiable gates PASS: §2 proportions (composed head:body ≈3.07 = Master; centred; no stretch;
body/feet match) and §5 D-032/D-042 geometry. §3 cel-shading improved 2→3 via the deterministic warm
jaw cel-shade (objective form increase +1.08 luminance stddev); geometry/alpha/silhouette/pose/outfit/
blank-face unchanged; no new artifacts. Per the strict rubric a 3 = CONDITIONAL (full PASS needs ≥4 on
all style fields). Accepted as CONDITIONAL PASS for the base because the remaining finish limitations
are local/non-structural and the scalp is hair-covered in composition.
```
Reviewer: **Claude Code (assistant)**  ·  **Owner countersign: ✅ APPROVED — 2026-07-04**  ·  Result: **CONDITIONAL PASS**

## 9. Blocking issues / remaining limitations
**Punch-list (non-blocking for the CONDITIONAL base; address before final polish):**
1. Finish still **simpler than the Master** (single under-jaw cel-band vs multi-zone modelling); optional refinement = raise the cel-shadow toward the mid-jaw + light cheek/temple form.
2. Ear hints are flat placeholders (hair-covered).

**Gate dependencies (still open — NOT part of this base review):**
- A **clean, dedicated hair layer** is still needed for **Gate 3** (the review overlay was contaminated with the Master's brows/eyes).
- **Eyes / face / eyelid** are **future separate layers** (z3/z4/z5) — **Gate 3**.
- **Composed visual sign-off** = **Gate 5**.

---

**Boundaries:** review-only. iter7 is a gitignored, **NOT-promoted** candidate. This review changes no
runtime code, no `assets/avatar-r2/`, no `R2_MANIFEST`; `AVATAR_R2` stays `false`; no Supabase change;
Phase-2 implementation not started. All candidate files (iter1/iter3/iter4/iter5/iter6/iter7) kept.
