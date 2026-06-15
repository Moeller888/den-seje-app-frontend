# 164B.3 — Base Prototype Review Worksheet
`body-neutral-medium-v1` · Base-Coherence Gate (Phase 1 sub-gate D)

**Status: DRAFT (review instrument)**

_Authoritative basis: 164B.1 plan (§0/§1/gate D), 164B.2 spec, ADR-163F (D-029 clarification, D-022/D-027), D-028, D-032._
_Compare against `Northstar Master.png` ONLY. `reference.png` = outfit appearance only, never geometry (D-032)._
_Reusable: copy this file per review (or per-prototype rev) and fill in the blanks._

---

## 1. Prototype metadata
| Field | Value |
|---|---|
| Asset name | `body-neutral-medium-v1` (prototype rev: ______) |
| Reviewer | __________________________ |
| Date | ______-______-______ |
| Commit hash (repo state) | __________________________ |
| Prototype file / path | __________________________ |
| Resolution (must be 1024×1536, full-canvas D-027) | __________ × __________  [ ] OK |
| Source image (geometry, D-032) | `assets/avatar/reference/Northstar Master.png` |
| Master file hash/version | __________________________ |

## 2. Proportion measurements
_Measure in the 1024×1536 space. Pass if `|Delta| ≤ Tolerance`. Anchors: head ctr (512,320) r≈192; eyes (435/589,301)._

| Metric | Master value | Prototype value | Delta | Tolerance | Pass/Fail |
|---|---|---|---|---|---|
| Head height (px) | ______ | ______ | ______ | reference for ratio | — |
| Figure height (px) | ______ | ______ | ______ | — | — |
| **Head/body ratio** | ______ | ______ | ______ | **±0.15 head** | [ ] P [ ] F |
| Shoulder width (px) | ______ | ______ | ______ % | **±3%** | [ ] P [ ] F |
| Torso length (shoulder→hip) | ______ | ______ | ______ % | **±3%** | [ ] P [ ] F |
| Leg length (hip→ankle) | ______ | ______ | ______ % | **±3%** | [ ] P [ ] F |
| Arm length (shoulder→wrist) | ______ | ______ | ______ % / ___° | **±3% / ±5°** | [ ] P [ ] F |
| Hand position (centre) | ______ | ______ | ______ | **±1% figure ht** | [ ] P [ ] F |
| **Silhouette IoU** (body minus drape) | 1.00 | ______ | — | **≥ 0.95** | [ ] P [ ] F |
| Difference-overlay: systematic vertical stretch? | — | [ ] none [ ] present | — | none allowed | [ ] P [ ] F |

**§2 result:** all rows Pass → ☐ PASS · any Fail → ☐ FAIL (height/ratio/IoU fail = hard NO-GO).

## 3. Style review (1–5; objective anchors)
_Scale: 5 = indistinguishable from Master · 4 = minor deviation · 3 = noticeable, localized · 2 = clear drift · 1 = different render._
_Pass bar: every field ≥4 = PASS · any field =3 = CONDITIONAL · any field ≤2 = FAIL._

| Criterion | Score (1–5) | Reviewer notes |
|---|---|---|
| Line-weight consistency | ___ | __________________________ |
| Cel-shading consistency (ramp + light dir.) | ___ | __________________________ |
| Shape-language consistency | ___ | __________________________ |
| Clothing-fold consistency | ___ | __________________________ |
| Anime readability @32px | ___ | __________________________ |
| Anime readability @48px | ___ | __________________________ |

**§3 result:** ☐ PASS (all ≥4) · ☐ CONDITIONAL (a 3 present) · ☐ FAIL (a ≤2 present).

## 4. Skin-tone validation (vs D-028 `medium` ramp)
_Tone match = ΔE vs the recorded medium ramp (164B.2 §6); Pass ΔE ≤ 5. Ramp consistency = base/shadow/highlight present & correct. Seam = discontinuity at region borders._

| Region | Tone match (ΔE) | Ramp consistency | Seam check | Pass/Fail |
|---|---|---|---|---|
| Face | ______ | [ ] OK | [ ] none [ ] seam | [ ] P [ ] F |
| Neck | ______ | [ ] OK | [ ] none [ ] seam | [ ] P [ ] F |
| Hands | ______ | [ ] OK | [ ] none [ ] seam | [ ] P [ ] F |
| Forearms (reconstructed) | ______ | [ ] OK | [ ] none [ ] seam | [ ] P [ ] F |

**§4 result:** all Pass + no seam → ☐ PASS · else ☐ FAIL. (Lifted↔reconstructed seam = FAIL.)

## 5. Outfit validation
| Item | Check | Pass/Fail |
|---|---|---|
| Neutral outfit compliance (plain tee/trousers/low sneakers, grey/charcoal) | [ ] yes | [ ] P [ ] F |
| No logos / symbols / star | [ ] none | [ ] P [ ] F |
| No signature-outfit elements (sweater, cuffs, cargo, wristbands, branded shoes) | [ ] none | [ ] P [ ] F |
| D-032 compliance (geometry from Master; no regeneration; reference = appearance only) | [ ] confirmed | [ ] P [ ] F |
| Geometry preservation (outfit edges registered to Master anchors; no silhouette drift) | [ ] confirmed | [ ] P [ ] F |

**§5 result:** all Pass → ☐ PASS · any Fail → ☐ FAIL.

## 6. Reconstruction validation (per region)
| Region | Style match | Geometry match | Tone match | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Torso | [ ] | [ ] | n/a (clothed) | [ ] P [ ] F | __________ |
| Arms (+ arm/torso separation) | [ ] | [ ] | n/a | [ ] P [ ] F | __________ |
| Forearms (skin, fully invented) | [ ] | [ ] | [ ] | [ ] P [ ] F | __________ |
| Legs | [ ] | [ ] | n/a | [ ] P [ ] F | __________ |
| Feet (footprint = Master sneaker) | [ ] | [ ] | n/a | [ ] P [ ] F | __________ |
| Neutral outfit | [ ] | [ ] | n/a | [ ] P [ ] F | __________ |
| Facial skin behind removed features | [ ] | [ ] | [ ] | [ ] P [ ] F | __________ |

**§6 result:** all Pass → ☐ PASS · any "Frankenstein"/style-mismatch region → ☐ FAIL.

## 7. Base-Coherence Gate summary

**PASS — all must be checked:**
- [ ] §2 all proportions within tolerance (incl. IoU ≥0.95, no vertical-stretch drift)
- [ ] §3 every style field ≥4
- [ ] §4 all skin tone-matched, no seams
- [ ] §5 all outfit items Pass (neutral + D-032 + no drift)
- [ ] §6 all reconstructed regions Pass
- [ ] No forbidden content (no features / eyes / eyelid / hair / baked blush / signature outfit / background / crop / cosmetics — 164B.2 §7)
- [ ] Full-canvas 1024×1536; clean bg→alpha (no halo)

**CONDITIONAL PASS — all true:**
- [ ] §2 proportions PASS (non-negotiable) **and** §5 D-032/geometry PASS
- [ ] Only minor, localized, **non-structural** defects (a single style field =3, small alpha fringe, one off fold, minor tone nudge)
- [ ] Every defect is fixable **without re-tracing geometry**
- [ ] A written punch-list (§9 must-fix) is attached; **downstream layers stay blocked** until cleared & re-verified

**FAIL — any one triggers:**
- [ ] Any §2 proportion/height/ratio/IoU fail or systematic stretch
- [ ] Any style field ≤2 (Frankenstein / render drift)
- [ ] Any skin seam or wrong/inconsistent `medium`
- [ ] Outfit geometry from `reference.png` or regeneration used
- [ ] Any baked forbidden element present
- [ ] Cropped / wrong dimensions / white halo

## 8. Final verdict
**Select one:**  ☐ **PASS**   ☐ **CONDITIONAL PASS**   ☐ **FAIL**

**Mandatory rationale** (cite the deciding rows/fields above):
```
__________________________________________________________________
__________________________________________________________________
__________________________________________________________________
```
Reviewer signature: __________________  Date: ____-____-____

## 9. Blocking issues
**Must-fix (block finalization / required for CONDITIONAL punch-list):**
1. __________________________________________________
2. __________________________________________________

**Nice-to-have (non-blocking polish):**
1. __________________________________________________
2. __________________________________________________

**Downstream blockers** (which later layers are gated, and why — e.g., anchor error → face/eyes/blink/hair registration; ramp inconsistency → eyelid tone-match; style incoherence → whole-stack):
1. __________________________________________________
2. __________________________________________________

---

**Notes on use:** the verdict is mechanical — §2 (proportions) and §5 (D-032/geometry) are non-negotiable gates: a fail in either forces overall **FAIL** regardless of style scores. CONDITIONAL PASS is reserved strictly for non-structural, no-re-trace defects and always carries a punch-list with downstream layers held.
