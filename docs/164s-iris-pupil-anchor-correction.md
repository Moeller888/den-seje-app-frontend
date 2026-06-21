# 164S — Iris / Pupil / Glasses-Lens Anchor Correction

**Status: anchors corrected, build artifacts regenerated — STOPPED for human visual review.**
No commit, no push, nothing staged. Deterministic, non-AI, no network.

_Why: the first 164S attempt drew eye markers that did **not** hit the pupils. Human review = **FAIL**
("markers still do NOT hit the actual pupil centers… too far beside the black pupil center").
This pass reworks the eye anchor semantics strictly and re-verifies against the Master by eye._

---

## 1. The first 164S attempt — why it FAILED human review

The first attempt measured a **broad dark eye-mass / iris-ish centroid** (and/or the eye-box
geometric centre) and then labeled that single value as `irisCenter` / `pupilCenter` / glasses
target. That is semantically wrong:

- A whole-box "dark mass" centroid is pulled toward the **eyelash/outline**, the **eye outline**,
  and away from the small black pupil — it lands on the **sclera, beside the pupil**.
- The eye-box geometric centre (405, 393) / (605, 393) is ~**34px** from the real pupil and is
  also ~22–25px **temporal** of the whole eye (the boxes are mis-centred — see §5).
- `pupilCenter`, `irisCenter`, and the glasses lens target were **conflated** into one point.

Old (failed) values, for the record:

| Marker | Old value (L / R) | Problem |
|---|---|---|
| "irisCenter" = eye-box centre | (405, 393) / (605, 393) | beside the pupil; on the sclera |
| dark-mass centroid (full box) | ≈ (414, 379) / (596, 378) | pulled up/out by lash + outline |

## 2. Corrected, STRICT, distinct anchors (manual visual calibration)

Measured by high-zoom (6×) human-style visual review of `assets/avatar/reference/Northstar Master.png`
(1024×1536). These are **manual semantic constants for the current Master**, not pixel-centroids of
dark mass. They live in `MANUAL_EYE_SEMANTIC_ANCHORS_164S` in `tools/avatar/extract-anchor-masks.mjs`.

| Anchor | Left eye | Right eye | Definition |
|---|---|---|---|
| **pupilCenter** | **(439, 394)** | **(570, 393)** | centre of the **black pupil oval only** |
| **irisCenter** | **(432, 387)** | **(577, 387)** | centre of the **brown iris disk** |
| **glassesLensVisualCenter** | **(427, 386)** | **(580, 386)** | centre of the whole **eye opening** (iris + sclera) |
| oldBoxCenter (diagnostic) | (405, 393) | (605, 393) | eye-box geometric centre — the OLD wrong value |

Derived: pupil spacing **131px**, iris spacing **145px**, lens-visual spacing **153px**,
glasses bridge midpoint **(504, 386)**.

## 3. How each anchor is defined (and why they differ)

- **pupil.center** — the centre of the **black pupil oval**. Isolated by ignoring the eyelash/upper
  outline, the large white catch-light (which overlaps the pupil's top), the brown iris, and the eye
  outline. The two pupils are **converged nasally** and sit **slightly low**, so pupil ≠ iris.
- **iris.center** — the centre of the **brown iris disk**. The pupil is offset nasally + downward
  *within* the iris, so this is a genuinely different point (≈ 7px from the pupil on each eye).
- **glasses.lens.visualCenter** — **not** the pupil. Chosen as the centre of the whole **eye opening**
  so a round lens drawn there is **concentric with the eye and surrounds it naturally**. A
  pupil-centred lens would sit nasal + low and clip the eye. It differs from `irisCenter` by ~3–5px
  (the eye-opening centre is pulled slightly temporal by the sclera crescent). Spacing 153px,
  symmetric about the nose (midpoint x≈504).

> Determinism note: automatic pixel detection is **unreliable** here — the black pupil merges with
> the dark eye outline/lash under any simple threshold (connected-component tests put the "blob"
> centre on the outline, not the pupil). Per the task, these are therefore **explicit manual
> constants grounded in human visual review**, re-verified by drawing the markers back onto a 6× crop.

## 4. Verification & artifacts (regenerated)

`npm run avatar:extract-masks` → markers drawn on the overlay; verify on the 6× eyes preview:

- `tools/avatar/build/previews/eyes-preview-v1.png` — **NEW** 6× crop of both eyes. RED pupil dots
  sit dead-centre in the black pupil ovals; GREEN (iris) and YELLOW (glasses lens) are distinct;
  the WHITE hollow ring (old box centre) is clearly **beside** the pupil on the sclera.
- `tools/avatar/build/previews/head-preview-v1.png` — whole-head context (2×).
- `tools/avatar/build/previews/anchor-overlay-v1.png` — full overlay.
- `tools/avatar/build/anchors/avatar-anchor-template-v1.json` — adds `eyeSemanticAnchors` +
  `equipmentTypeAnchors.glasses`.

`npm run avatar:generate-procedural-glasses` (NEW, deterministic, non-AI) → lenses centred on the
**glasses lens visualCenter (not the pupil)**:

- `tools/avatar/build/procedural/glasses-procedural-composite.png` — clean (unclipped) placement.
- `pupilFrameHitsWithinR12 = 0` (the hollow frame never crosses the pupils).

`npm run avatar:ai-test-item` (consumes the procedural overlay) QA metrics:

| Metric | Value | Meaning |
|---|---|---|
| `pupilFrameIntrusion.total` (r=12) | **0** | frame clears both **pupilCenters** ✅ |
| `lensError` L / R | **3px / 6px** | lens half-centroids match the **glasses visualCenters** ✅ |
| `preClipOverflowPx` | **1324** | legacy `glassesBand` mask (y352–426) **clips** a lens that surrounds the eye ⚠️ |
| `outsideMaskPx` | 0 | (post-clip; pass contract unchanged) |
| `pass` | true | legacy mask-compliance gate |

## 5. Review flag (raised in 164S — ADDRESSED in 164T)

164S found that the eye **boxes** (`eyeLeftBox`/`eyeRightBox`, centres 405/605) and therefore the
`glassesBand` and `mask-eyes-v1.png` were ~**22–25px temporal** of the real eyes, and the band
(y352–426) was **too short** to contain a lens that surrounds the eye (hence `preClipOverflowPx = 1324`).

> **164T follow-up:** semantic centres were corrected **first** (164S), then the eye boxes + glasses
> front-slot mask were **recalibrated** to those centres (164T) — see
> `docs/164t-eye-box-mask-recalibration.md`. Result: boxes re-centred on the eye openings, eyes-mask
> is now a front-only union (lens zones + small bridge + tiny tabs), and **`preClipOverflowPx` went
> 1324 → 0** without loosening QA. The 164S semantic anchor values are unchanged.

## 6. Changed files

- `tools/avatar/extract-anchor-masks.mjs` — `MANUAL_EYE_SEMANTIC_ANCHORS_164S`; distinct
  pupil/iris/glasses-lens/old-box markers; `eyeSemanticAnchors` + `equipmentTypeAnchors.glasses` in
  the template; new `eyes-preview-v1.png`; export of the new constant.
- `tools/avatar/ai-test-item.mjs` — reports `pupilFrameIntrusion` (vs **pupilCenter**) and
  `lensError` (vs **glasses visualCenter**); adds them to the human-review checklist.
- `tools/avatar/generate-procedural-glasses.mjs` — **NEW** deterministic procedural glasses overlay
  (lenses on the glasses visualCenter, not the pupil).
- `tools/avatar/package.json` — `generate-procedural-glasses` script.
- `docs/164s-iris-pupil-anchor-correction.md` — this file.
- `docs/164p-anchor-taxonomy-equipment-production-rules.md` — stricter semantic distinction (§2.1).

## 7. Boundaries honored

No OpenAI, no network, no AI generation. No runtime/frontend, no DB/RPC/migrations, no `assets/*`,
no `AVATAR_V2`, no shop DB rows, no bulk generation. **No commit, no push, nothing staged.**
Build outputs are gitignored QA artifacts. **Stop for human visual review.**
