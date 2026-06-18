# 164L — Anchor + MVP Mask Review Worksheet

**Status: DRAFT (review instrument)**

_Human review of the first-pass artifacts emitted by `tools/avatar/extract-anchor-masks.mjs`
(D-041 / 164K). Deterministic, non-AI. Artifacts are **QA/build only — not runtime assets**._
_Source of truth = `assets/avatar/reference/Northstar Master.png` (Tier-0 base, D-040)._

> **164L.1 = FAIL.** Eye/face/crown anchors sat on the forehead; face oval leaked into neck.
>
> **164L.2 = FAIL (human review).** Still rejected as a production baseline: glasses band too
> broad vertically (cheek/nose); eye centres shifted inward/high; face oval too large/coarse
> (included hair/ears); crown/headHair still broad generic ellipses; single shoulder line too weak.
>
> **164L.3 = FAIL (direction correct).** Primitive model accepted as the right approach, but
> constants needed a nudge: eye boxes too narrow (iris-only); glasses band too low/narrow; face
> region too rectangular/large (too much lower face); headwear region slightly too low.
>
> **164L.4 = PARTIAL / FAIL overall.** **Head-region primitives = CONDITIONAL PASS** (eye boxes,
> glassesBand, faceMaskRegion, headwearRegion good enough for the MVP review baseline). **Back/
> shoulder = FAIL:** the backAttachBox was too torso-bound/narrow for a back slot (wings/capes/
> backpacks).
>
> **164L.5 = BACK MASK SPLIT (current) — AWAITING USER REVIEW.** Split the back system:
> **shoulderBackAnchors** = anchor metadata (left/right points + a small `backAttachBox` reference,
> overlay only); **backMaskRegion** = a NEW generous behind-avatar region that drives the back mask
> — rounded-rect **x210–810, y430–930** (wider than torso, starts upper-back, extends outward + down
> for wings/capes/backpacks). `mask-back-v1.png` now uses `backMaskRegion`. Head primitives unchanged
> (still CONDITIONAL PASS). Review artifacts: `anchor-overlay-v1.png` + `head-preview-v1.png`.
>
> **164L.5 = CONDITIONAL PASS (human-signed, 2026-06-18).** Head primitives (eyeLeftBox/
> eyeRightBox, glassesBand, faceMaskRegion, headwearRegion), `shoulderBackAnchors` (metadata/
> reference), and `backMaskRegion` (generous behind-avatar back slot) are **accepted as the MVP
> tooling baseline**. `backAttachBox` stays reference-only; `mask-back-v1.png` continues to use
> `backMaskRegion`. **This is CONDITIONAL — it is the tooling baseline, NOT approval to start a
> bulk shop-item batch.** Next step: a **small controlled Tier-2 test-item generation / QA pilot**,
> not bulk catalog generation. **No bulk shop-item batch may start yet.**

## Artifacts under review
- `tools/avatar/build/anchors/avatar-anchor-template-v1.json`
- `tools/avatar/build/previews/anchor-overlay-v1.png`
- `tools/avatar/build/previews/head-preview-v1.png` (2× zoomed head crop)
- `tools/avatar/build/masks/mask-{aura,back,headwear,face,eyes}-v1.png`
  (allowed region = **opaque magenta**; forbidden = transparent)

## First-pass extraction (recorded by the run)
| Field | Value |
|---|---|
| Master dimensions | 1024×1536 ✅ |
| Background | white-matte |
| Source sha256 | `2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21` |
| Silhouette bbox | x 260–757, y 40–1508 (DIAGNOSTIC) |
| Head top y | 40 |
| Skin-like px (heuristic, DIAGNOSTIC) | 66,835 |
| *(shoulder is now a manual constant, not derived)* | — |

## Review checklist (reviewer fills PASS/FAIL + notes)

| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | **Anchor overlay** reads correctly over Master | [ ] P [ ] F | |
| 2 | **eyeLeftBox / eyeRightBox** — cover the full eye | [ ] P [ ] F | 164L.4: x347/547, y351, **116×84** (iris ≈405/605, 393) |
| 3 | **glassesBand** — frame room, on the eyes (not cheek/nose) | [ ] P [ ] F | 164L.4: x338 y352 w340 h74 + temples |
| 4 | **faceMaskRegion** — tight face, excl hair/ears, not neck | [ ] P [ ] F | 164L.4: rounded-rect x402 y308 w220 h192 r64 |
| 5 | **headwearRegion** — upper head only, above eyebrows | [ ] P [ ] F | 164L.4: rounded-rect x344 y120 w336 h200 r70 (y→320) |
| 6 | **shoulderBackAnchors** — anchor metadata (points + ref box) | [ ] P [ ] F | L(340,568) R(684,568); backAttachBox x330 y540 364×320 (reference only) |
| 6b | **backMaskRegion** — GENEROUS back region (wings/capes/backpacks) | [ ] P [ ] F | **164L.5: rounded-rect x210–810, y430–930** — needs full-overlay review |
| 7 | **headHairRegion** — diagnostic only (not a mask) | [ ] P [ ] F | box x270–758 y40–470 (unchanged) |
| 8 | Mask **aura** — generous behind | [ ] P [ ] F | full canvas |
| 9 | Mask **back** — generous behind, wings/capes room | [ ] P [ ] F | **uses backMaskRegion** (not backAttachBox) |
| 10 | Mask **headwear** — upper head, **eyes clear** | [ ] P [ ] F | rounded-rect, above eyebrows |
| 11 | Mask **face/masks** — tight face region | [ ] P [ ] F | rounded-rect; eye-legibility gated |
| 12 | Mask **eyes/glasses** — glasses band + temples | [ ] P [ ] F | approved eye-overlap |
| 13 | **Mask usefulness** — each permits useful item variety | [ ] P [ ] F | not too tight/too loose |
| 14 | **Mask safety** — no protected-zone leakage allowed | [ ] P [ ] F | face/eyes/hair/body/hands/skin |
| 15 | **D-037 compatibility** — gates can run against these masks | [ ] P [ ] F | overflow = item alpha ∩ inverse mask |

## Verdict
**164L.5 = CONDITIONAL PASS (human-signed 2026-06-18).** The 164L tooling baseline (head
primitives + `shoulderBackAnchors` metadata + generous `backMaskRegion`) is accepted as the **MVP
tooling baseline**.

☑ **CONDITIONAL PASS** — accepted as the MVP tooling baseline. **NOT unrestricted approval:**
   no bulk shop-item batch; next step = a small controlled Tier-2 test-item / QA pilot.
☐ PASS (unrestricted) · ☐ FAIL

**Conditions / scope of this pass:**
1. `mask-back-v1.png` must continue to use `backMaskRegion` (NOT `backAttachBox`).
2. `backAttachBox` stays metadata/reference only.
3. **No bulk shop-item batch may start yet** — pilot first.

Reviewer: **human review** · Date: **2026-06-18**

> **164L.5 status:** CONDITIONAL PASS. Head primitives, `shoulderBackAnchors` (metadata) and the
> generous `backMaskRegion` are the accepted MVP tooling baseline; `mask-back-v1.png` uses
> `backMaskRegion`. **This is the tooling baseline, not approval for a bulk catalog run.** Next
> section = a **small controlled Tier-2 test-item generation / QA pilot**. Build artifacts under
> `tools/avatar/build/` stay gitignored / regenerable. Recalibration = edit
> `MANUAL_ANCHOR_OVERRIDES_164L2` only, then re-run.
