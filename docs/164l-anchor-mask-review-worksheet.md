# 164L — Anchor + MVP Mask Review Worksheet

**Status: DRAFT (review instrument)**

_Human review of the first-pass artifacts emitted by `tools/avatar/extract-anchor-masks.mjs`
(D-041 / 164K). Deterministic, non-AI. Artifacts are **QA/build only — not runtime assets**._
_Source of truth = `assets/avatar/reference/Northstar Master.png` (Tier-0 base, D-040)._

> **164L.1 calibration applied.** The first-pass ×6.4 eye/eye-band/face-oval anchors sat on
> the **forehead** (too high) and the face oval leaked into the neck. Re-measured on the
> Master via a calibration grid and corrected: **eyes (435,301)/(589,301)→(452,385)/(572,385);
> eye band y272–336→y356–418; face oval c(512,340) ry195→c(512,388) ry152; crown clip
> y272→y356.** Visual re-check: eye band/dots on the irises, face oval chin-bounded, headwear
> excludes the eye band. **Tooling pre-assessment: CONDITIONAL PASS** (minor optional nudges
> below; head-circle anchor still ×6.4 first-pass, out of 164L.1 scope). Human sign-off pending.

## Artifacts under review
- `tools/avatar/build/anchors/avatar-anchor-template-v1.json`
- `tools/avatar/build/previews/anchor-overlay-v1.png`
- `tools/avatar/build/masks/mask-{aura,back,headwear,face,eyes}-v1.png`
  (allowed region = **opaque magenta**; forbidden = transparent)

## First-pass extraction (recorded by the run)
| Field | Value |
|---|---|
| Master dimensions | 1024×1536 ✅ |
| Background | white-matte |
| Source sha256 | `2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21` |
| Silhouette bbox | x 260–757, y 40–1508 |
| Head top y | 40 |
| Shoulder line (derived) | y 394, x 323–706 |
| Skin-like px (heuristic) | 66,835 |

## Review checklist (reviewer fills PASS/FAIL + notes)

| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | **Anchor overlay** reads correctly over Master | [ ] P [ ] F | |
| 2 | **Eye band** — sits on the actual eyes | [ ] P [ ] F | 164L.1: calibrated to y356–418 (eyes ≈y385) — confirm alignment |
| 3 | **Face oval** — covers the face, not body/hair | [ ] P [ ] F | review-required |
| 4 | **Crown region** — upper head, excludes eyes | [ ] P [ ] F | |
| 5 | **Shoulder/back anchor** — on the shoulders | [ ] P [ ] F | derived y=394 |
| 6 | **Head center/radius** — fits the head | [ ] P [ ] F | (512,320) r192 |
| 7 | Mask **aura** — generous behind | [ ] P [ ] F | full canvas |
| 8 | Mask **back** — shoulder/back, behind | [ ] P [ ] F | |
| 9 | Mask **headwear** — crown, **eyes clear** | [ ] P [ ] F | clipped above eye band |
| 10 | Mask **face/masks** — tight face oval | [ ] P [ ] F | eye-legibility gated |
| 11 | Mask **eyes/glasses** — eye band + temples | [ ] P [ ] F | approved eye-overlap |
| 12 | **Mask usefulness** — each permits useful item variety | [ ] P [ ] F | not too tight/too loose |
| 13 | **Mask safety** — no protected-zone leakage allowed | [ ] P [ ] F | face/eyes/hair/body/hands/skin |
| 14 | **D-037 compatibility** — gates can run against these masks | [ ] P [ ] F | overflow = item alpha ∩ inverse mask |

## Verdict
☐ **PASS** (anchors + masks accepted as the MVP baseline)
☐ **CONDITIONAL** (accept after the listed adjustments; re-run + re-review)
☐ **FAIL** (adjust first-pass values in the tool / by hand, re-run)

**Required adjustments (punch-list):**
1. ____________________________________________
2. ____________________________________________

Reviewer: __________________  Date: ____-____-____

> **164L.1 status:** the eye/eye-band/face-oval/crown anchors have been calibrated to the
> Master (see top note); pre-assessment is **CONDITIONAL PASS**, not final PASS. Optional
> remaining nudges: eye-dots ~5–10px to iris-centre; face-oval width slightly off the ears;
> head-circle anchor still ×6.4 first-pass (out of scope). **No shop-item batch may start
> until a human signs this worksheet PASS/CONDITIONAL.**
