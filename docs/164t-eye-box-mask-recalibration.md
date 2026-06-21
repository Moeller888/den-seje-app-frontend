# 164T — Eye Box + Glasses Mask Recalibration

**Status: eye boxes + glasses front-slot recalibrated, artifacts regenerated — STOPPED for human visual review.**
No commit, no push, nothing staged. Deterministic, non-AI, no network.

_Why: 164S corrected the strict eye **semantics** (pupil / iris / glasses-lens visual centre) but left a
standing root cause: the legacy 164L eye **boxes** / `glassesBand` / `mask-eyes-v1` were ~22–25px too
**temporal/outward** and the band was too **short** — it clipped a lens that properly surrounds the eye
(`preClipOverflowPx = 1324`). 164T realigns the boxes + glasses slot to the corrected anchors._

---

## 1. What changed

A new override layer **`MANUAL_ANCHOR_OVERRIDES_164T`** (in `tools/avatar/extract-anchor-masks.mjs`)
overrides **only** `eyeLeftBox`, `eyeRightBox`, and `glassesBand`; everything else stays from 164L2,
and the old 164L values are kept (documented) for comparison. The 164S semantic anchors are unchanged.

The eyes **mask** is no longer a single broad rectangle + long temple arms. It is now a **front-only
union**: `union(left lens zone, right lens zone, small bridge zone, two tiny side tabs)` — where the
two lens zones **are** the recalibrated eye boxes.

## 2. Old vs new values

### Eye boxes
| Box | OLD (164L) | NEW (164T) |
|---|---|---|
| eyeLeftBox | x347 y351 116×84 → centre **(405, 393)** | **x378 y336 98×100 → centre (427, 386)** |
| eyeRightBox | x547 y351 116×84 → centre **(605, 393)** | **x531 y336 98×100 → centre (580, 386)** |

New box centres = the 164S `glassesLensVisualCenter` (eye-opening centres). Each box contains the
full anime eye opening (sclera + iris + pupil + outline) with ~6px margin and room for a front lens
frame, while avoiding brow / ear / hair.

### glassesBand / eyes-mask
| Field | OLD (164L) | NEW (164T) |
|---|---|---|
| bounding band | x338 y352 340×74 (**y352–426**, too short) | x378 y335 251×102 (**y335–437**) |
| side allowance | `templeW 44` (long arms) | `templeW 16` (**tiny tabs only**) |
| bridge | (none; part of broad band) | small zone **x473–535 y368–402** |
| mask shape | one broad rect + long temple arms | **union(2 lens zones + small bridge + 2 tiny tabs)** |

The new slot includes both lens frame zones + a small bridge + tiny side-tab allowance, and excludes
long temples / ear hooks / broad side-arm zones.

## 3. Visual rationale

- The old boxes sat on the **sclera**, ~22–25px temporal of the eyes; the old white box-centre marker
  landed **beside** the pupil. The new boxes are concentric with the eye openings.
- The old band (y352–426) was shorter than the eye (the eye opening runs ~y343–430), so a lens that
  surrounds the eye had its top/bottom **clipped**. The new slot is tall enough (y335–437) to contain
  the lens, so it no longer clips a correctly-placed front frame — while still rejecting long arms.
- Verified on the 6× `eyes-preview-v1.png`: the mask-eyes allowed region covers each whole eye opening,
  connects via a small bridge, and emits only tiny outer tabs.

## 4. preClipOverflow + QA — before / after

| Metric | 164S (old box/mask) | 164T (recalibrated) |
|---|---|---|
| **preClipOverflowPx** | **1324** | **0** |
| outsideMaskPx | 0 | 0 |
| opaquePx (after clip) | 4881 (of 6205) | **5472 (of 5472 — nothing clipped)** |
| pupilFrameIntrusion.total (r=12) | 0 | **0** |
| lensError L / R | 3px / 6px | 9px / 9px* |
| pass | true | **true** |

\* `lensError` rose slightly because the full (now-unclipped) tiny side tabs are included in the coarse
half-image centroid (previously the long temples were partly clipped away). The lens **rings** are
still drawn exactly on the `glassesLensVisualCenter`; this is a documented coarse proxy until the 164P
typed lens-centre fitter exists. The gate was **not** loosened — `preClipOverflowPx` genuinely went to 0.

## 5. Procedural glasses (front-only)

`generate-procedural-glasses.mjs` still centres lenses on `glassesLensVisualCenter` (not the pupil) and
now draws **tiny front-only side tabs** (16px stubs) instead of long temples to the ears, matching the
front-only slot. `pupilFrameHitsWithinR12 = 0` (the hollow frame clears the pupils).

## 6. Generated preview paths (regenerated)

- `tools/avatar/build/previews/eyes-preview-v1.png` — 6× eyes; boxes + front-slot + pupil/iris/lens markers.
- `tools/avatar/build/previews/head-preview-v1.png` — whole-head context (2×).
- `tools/avatar/build/procedural/glasses-procedural-composite.png` — clean (unclipped) front-only glasses.
- `tools/avatar/build/ai-test/previews/glasses-test-composite.png` — through the gate (now identical; nothing clipped).
- `tools/avatar/build/anchors/avatar-anchor-template-v1.json` — reports `recalibration164T` (old vs new).

## 7. Changed files

- `tools/avatar/extract-anchor-masks.mjs` — `MANUAL_ANCHOR_OVERRIDES_164T`; `O = {…164L2, …164T}`;
  front-only union eyes-mask; overlay bridge/tab outlines; wider eyes-preview crop; `recalibration164T`
  in the report; export of `MANUAL_ANCHOR_OVERRIDES_164T`.
- `tools/avatar/ai-test-item.mjs` — raw-centring fallback uses the 164T band (QA metrics unchanged;
  still pupilCenter for intrusion, visualCenter for lensError).
- `tools/avatar/generate-procedural-glasses.mjs` — tiny front-only side tabs instead of long temples.
- `docs/164t-eye-box-mask-recalibration.md` — this file.
- `docs/164s-iris-pupil-anchor-correction.md` — 164T follow-up note.
- `docs/164p-anchor-taxonomy-equipment-production-rules.md` — front-slot shape note.

## 8. Remaining review notes

- The `lensError` proxy includes side-tab mass; a future 164P typed lens-centre fitter would measure
  the actual lens centres instead. Not gated.
- Eye boxes intentionally include a few px of upper lid/lash (outline) but no eyebrow; confirm on review.

## 9. Boundaries honored

No OpenAI, no network, no AI generation. No runtime/frontend, no DB/RPC/migrations, no `assets/*`,
no `AVATAR_V2`, no shop DB rows, no bulk generation. **No commit, no push, nothing staged.**
QA was **not** loosened — the mask/box geometry was fixed. **Stop for human visual review.**
