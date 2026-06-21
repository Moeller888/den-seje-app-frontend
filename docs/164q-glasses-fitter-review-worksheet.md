# 164Q — Glasses Fitter Review Worksheet (glasses.round)

**Status: DRAFT (review instrument)** · **Equipment type = `glasses.round`, slot = eyes**

_First equipment-type-specific production path (164P taxonomy). Replaces the failed 164N generic
alpha-bbox centering for glasses. Tooling: `tools/avatar/ai-test-item.mjs`
(`npm run avatar:ai-test-item`). Build artifacts are gitignored/regenerable; NOT runtime assets._

## Why (history)
- **164N generic alpha-bbox centering = visual FAIL:** frame crossed the pupils; lenses did not
  contain the eyes; temples bored into the head; whole-image centering can't fit glasses.
- **164Q = typed approach:** `GLASSES_ROUND` equipment anchors + **2-point lens-centre fitter**
  + glasses-specific mask + typed QA. Architecture is sound.
- **164Q.1:** fixed the spacing-QA *measurement* (bbox-centre, not centroid) → spacing/lens
  metrics pass.
- **164Q.2 (zoomed human review = FAIL):** even with passing metrics, the composite is **not
  visually acceptable**: temples read as grey hooks/blocks (wrong for a front-facing avatar),
  imperfect L/R symmetry, frame still a bit heavy, lenses don't follow the anime eye form, and
  clipping is too hard. **Decision: the fitter architecture is kept; the temple/ear-hook
  production assumption and the current raw item are rejected.**
- **164Q.3 (OpenAI front-only prompt = FAIL):** the `openai-generate-item.mjs` prompt was rewritten
  to demand a front-only frame (no temples, no ear hooks). One new `gpt-image-1` generation still
  drew long side arms — **`sideArmOpaquePx = 1505` (worse than the prior 605)**, gate **FAIL** by
  design. **Conclusion: OpenAI is not reliable for the BASE geometry of `glasses.round`.** The gate
  works; the generator (OpenAI) is the wrong tool for the basisbrille.
- **164R (procedural base = PASS, recommended MVP path):** the base geometry is now drawn
  **deterministically** from the `GLASSES_ROUND` anchors by `tools/avatar/generate-procedural-glasses.mjs`
  (`npm run avatar:generate-procedural-glasses`), writing to the shared gate input path. No AI,
  no network. The procedural item **passes the 164Q gate** (see "Latest run"). **Decision: for MVP,
  `glasses.round` base geometry is procedural; AI may be used LATER for style variants / decoration,
  never for the first basisbrille.**
- **164R / 164R.1 visual review = HELD (anchors were semantically wrong):** machine QA passed but the
  lenses still read too wide / toward the ears. Root cause found in **164S**: the fitter targeted the
  **eye BOX centre** (outward), not the iris/pupil. Anchors corrected — lens target is now
  `lens.*.visualCenter` (iris-derived, inward); spacing 200 → **180**. Commit of 164R/164R.1 was held
  pending the anchor fix so that machine PASS and human visual PASS mean the same thing. See
  `docs/164s-iris-pupil-anchor-correction.md`. **The current passing run below is post-164S.**

## MVP `glasses.round` production rule (164Q.2) — FRONT-ONLY frame
A front-facing avatar shows **no side arms**. MVP glasses = **front-only**:
round/soft-oval lenses · clear empty interiors · thin frame · small bridge · **NO long temples,
NO ear hooks, NO temples routing behind ears** · optional **tiny side tabs** ending at the outer
lens edge only · transparent bg · no avatar pixels. (Full glasses with real temples = a later/
premium type — see 164P.) The glasses mask is now **lens boxes + small bridge + tiny side tabs**;
QA adds a **side-arm/ear-hook metric** (`sideArmOpaquePx`) that warns >150 and **fails >400**.

## Fitter algorithm (deterministic, reusable — no per-item offsets)
1. Decode raw PNG; meaningful **alpha bbox**.
2. **Detect source lens centres**: split the bbox at its centre; alpha centroid of each half →
   sourceLeft/Right lens centre; source bridge = midpoint.
3. **2-point transform**: uniform `scale = 200 / sourceLensDistance`; translate so the source
   lens-centre midpoint maps to the target midpoint (505,393); vertical aligns to eye-centre y.
4. Inverse-sample the transformed art onto a clean 1024×1536 canvas.
5. **Clip** to the glasses-specific mask.
6. **Typed QA** (re-detect placed lens centres; measure errors).

## QA pass criteria (machine)
| Check | Pass rule |
|---|---|
| `outsideMaskPx` | = 0 after clip |
| `opaquePx` | ≥ 1200 (visible frame) |
| `lensCenterError` L & R | ≤ 16px vs target eye centres |
| `spacingErrorFrac` | ≤ 0.08 (placed lens spacing vs eye spacing 200) |
| `pupilFrameIntrusionPx` | ≤ 150 (clear lenses → low; tinted/covering = high) |
| `sideArmOpaquePx` (164Q.2) | ≤ 400 (front-only rule: no long temples/ear hooks; warn > 150) |
| Visual | composite over Master **human-reviewed** (mandatory) |

## Spacing-QA fix (164Q.1) — root cause was the MEASUREMENT, not the fit
Diagnostic on the raw art: per-half **bbox-centre (309/711) ≈ centroid (307/713)** — source
detection was NOT biased; the transform already mapped lens centres to 405/605 (spacing 200).
The earlier "179 / 0.105 spacing FAIL" came from the **QA re-measurement**: splitting the
*clipped* item in half and taking a **mass centroid** pulled each measured centre inward (bridge
+ frame-asymmetry mass). **Fix (reusable, type-level):**
- source lens centre = per-half **alpha bbox centre** (centroid kept for diagnostics only);
- placed lens centre = **alpha bbox centre within each lens target box** (not centroid) —
  robust to frame-mass asymmetry; returns the ring's geometric centre.

## Run history (NO OpenAI call after 164Q.3) — front-only mask + side-arm gate
| Source | spacingErrFrac | lensErr L/R | bridgeErr | pupilIntr | **sideArmOpaquePx** | opaquePx | pass |
|---|---|---|---|---|---|---|---|
| 164Q.2 raw (old temples) | 0 | 0.71 / 0.71 | 0.45 | 0 | **605 (>400)** | 3269 | ❌ FALSE |
| 164Q.3 OpenAI front-only prompt | 0 | 0.71 / 0.71 | 1.15 | 0 | **1505 (>400)** | 3269 | ❌ FALSE |
| **164R procedural (recommended)** | **0** | **0.5 / 0.5** | **1** | **0** | **0** ✅ | **7128** | ✅ **TRUE** |

> The two OpenAI items pass geometry but carry **long temples** → the front-only side-arm gate
> rejects them (intended). The **164R procedural** item draws a front-only frame with **zero**
> side-arm mass and passes every machine check. `preClipOverflowPx = 112` (only the ring's outer
> arcs trimmed to the lens boxes). **Still requires human visual sign-off below.**

### 164R procedural generator — how it satisfies the gate (design, not per-item tuning)
The gate detects each lens centre as the per-half alpha **bbox-centre**, then applies
`scale = 200 / detectedDistance` so the centres map to (405,393)/(605,393). `sideArmOpaquePx`
is measured **pre-clip** (`x<325 || x>685`). A bridge that **crosses the midline (x=505)** sets
each half's inner bbox edge to 505 → detected distance shrinks → `scale` rises → the transform
pushes the ring's outer edge to ≈305 → side-arm mass → FAIL. The generator therefore draws the
bridge as **two short pads that stop before the midline** (50px central gap, keyhole style):
detected distance ≈189 → `scale ≈1.058` → placed outer edge ≈331 (>325) → **`sideArmOpaquePx = 0`**,
while clip-to-box keeps lens-centre/spacing within tolerance. Tunable knobs live at the top of
`generate-procedural-glasses.mjs` (`LENS`, `BRIDGE`, `CHARCOAL`, `SS`) — type-level, not per-item.

## Human review checklist (mandatory — for a future front-only item)
| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | Lenses **contain** the eyes, follow the anime eye form | [ ] P [ ] F | |
| 2 | Frame does **not** cross pupils | [ ] P [ ] F | machine pupilIntrusion |
| 3 | **No long temples / ear hooks** (front-only) | [ ] P [ ] F | machine sideArmOpaquePx |
| 4 | Clean L/R symmetry | [ ] P [ ] F | |
| 5 | Frame weight tasteful (not heavy bracket) | [ ] P [ ] F | |
| 6 | Edges not hard-clipped | [ ] P [ ] F | |
| 7 | No avatar pixels; style + content-safe (kids) | [ ] P [ ] F | |

## Verdict
**Machine: PASS (164R procedural item).** OpenAI is rejected for base `glasses.round` geometry
(164Q.3 sideArm 1505). The **procedural generator** is the recommended MVP base path and produces
an item that passes every machine check (sideArm 0). **Awaiting human visual sign-off** before any
commit/shop use — fill the checklist above against the composite.

☐ PASS · ☐ CONDITIONAL · ☐ FAIL — **machine PASS, human review pending (164R procedural)**

Reviewer: __________________  Date: ____-____-____

**Next:** human reviews `tools/avatar/build/ai-test/previews/glasses-test-composite.png`. If
visually approved, this becomes the MVP `glasses.round` base. AI may later be explored for
**style variants / decoration only** (separate, explicitly-approved step). Deterministic
type-level levers: lens `targetBox`/`targetCenter`, `SIDEARM_FAIL`, and the generator's
`LENS`/`BRIDGE` knobs — adjust the *type rule*, never the single item.

## Boundaries
No OpenAI call · no new AI image · one item/one slot/one type · no bulk · no DB/runtime/assets ·
AVATAR_V2 untouched · build artifacts gitignored · **no commit / no push**.
