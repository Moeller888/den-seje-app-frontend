# 167A Phase-2 — Gate 2A: Deterministic Registration Plan (recovery-base → Master frame)

**Status: PLAN — Gate 2A DEFINED / PLANNED (2026-07-06). Documentation only.**
_No runtime code, no image generation, no ComfyUI, no build artifacts, no promotion. No
`assets/avatar-r2/` write, no `R2_MANIFEST` change, `AVATAR_R2` stays `false`. Gate 3 stays PAUSED._
_Parent decision: [`167a-phase2-base-recovery-decision.md`](./167a-phase2-base-recovery-decision.md)
(D-043, revised). Register: [`project-state.md`](./project-state.md). Spec: [`adr/ADR-163F-raster-asset-spec.md`](./adr/ADR-163F-raster-asset-spec.md) (D-027 full-canvas, 1024×1536→512×768)._

---

## 1. Purpose & framing

Gate 2 (v2 base) is **REOPENED / UNDER RECOVERY** after the iter7 bust/chest-plate failure (D-043).
The corrected architecture makes the first recovery step **narrow and fully deterministic**, so it is
split out as **Gate 2A**.

**Canonical facts this plan is built on (verified, falsification-tested):**
- **`Northstar Master.png` remains the canonical identity/style/coordinate datum. D-032 is PRESERVED, not superseded.**
- **`recovery-base-v1-blankface.png` is NOT a new Master.** It is a **candidate registered base-layer source**.
- recovery-base registers to the Master by a **known deterministic offset (+25 x, +285 y)**
  (same figure, same scale; body silhouette IoU ≈ 0.9921; ≈ 84.3 % of overlapping body pixels essentially
  identical to the Master).
- **Registration direction (pin this):** the Master is the datum. To place recovery-base **into Master
  coordinate space**, the registration operation is **translate recovery-base by (−25 x, −285 y)**.
  (Equivalently: a Master feature at (x, y) appears in recovery-base at (x+25, y+285).) Because we move the
  image into the existing frame, **anchors / eye-box / masks stay unchanged — no re-datum, no scale change.**

Gate 2A is **review-first**: it produces only deterministic measurements and review-only composites for a
human decision. It **does not** modify the character, the outfit, or any layer.

## 2. Gate 2A scope — INCLUDED (only these)
1. **Deterministic registration** of `recovery-base-v1-blankface.png` into the Master coordinate space via
   the fixed translation **(−25, −285)** (no scale, no rotation, no warp, no re-datum).
2. **Validation of the known offset (+25, +285)**, including **explicit direction clarity** (see §1) — the
   offset is **re-derived** from landmarks, never trusted blindly.
3. **Feet / lower-leg completion audit** — quantify the recovery-base bottom crop and how much of the
   Master's lower legs/feet would be needed to complete a full figure (audit only; no completion produced).
4. **Review-only composites** — overlays/ghosts for the human visual check.
5. **Deterministic validation report** — a machine-checked JSON of every metric in §6.

## 3. Gate 2A scope — EXCLUDED (explicitly out of scope)
Gate 2A **MUST NOT** touch or produce any of:
- neutral outfit finalization / any neutral-outfit output
- face · eyes · eyelid · hair (any layer or its tooling)
- runtime (no `js/*` change; `js/avatar-layers.js` read-only validation only if ever needed)
- promotion of any asset · **WebP promotion**
- `assets/avatar-r2/` writes · `R2_MANIFEST` changes · `AVATAR_R2` changes (stays `false`)
- ComfyUI · image generation
- Gate 3 tooling
- any overwrite of `Northstar Master.png` or `recovery-base-v1-blankface.png` (immutable reference files)

## 4. Output locations & artifacts

**Review-only output directory (gitignored, NEVER runtime, NEVER committed):**
`tools/avatar/build/phase2/gate2a/`

**Allowed future review-only artifacts (produced by a later, separately-approved Gate 2A build step — NOT by this doc):**
- `recovery-base-registered-v1.png` — recovery-base translated (−25, −285) into the Master frame (review).
- `overlay-registered-vs-master.png` — registered recovery-base vs Master silhouette overlay.
- `overlay-registered-vs-master-on-dark.png` — same, on a dark/contrast background (anti-camouflage).
- `feet-completion-audit.png` — Master lower legs/feet shown under the registered recovery-base (audit).
- `gate2a-validation-report.json` — the deterministic metrics (§6).

**Forbidden outputs (hard rule):**
- anything in `assets/avatar-r2/`
- any runtime JS change
- any `R2_MANIFEST` change
- **any committed build artifact** (all Gate 2A artifacts stay gitignored under the dir above)
- any neutral-outfit output
- any face / eyes / eyelid / hair layer
- any overwrite of `Northstar Master.png` or `recovery-base-v1-blankface.png`

## 5. Reusable vs forbidden tooling (for the later build step)

**May be reused (deterministic, non-carve):**
- `tools/avatar/extract-master-base.mjs` — reuse its **PNG decode/encode codec**, the **D-032 sha-guard**
  (`EXPECT_SHA = 2ca10ef8…`), and the box-downscale helper. (The Master must still hash-match D-032.)
- `tools/avatar/extract-anchor-masks.mjs` — to **re-verify** anchors/eye-box are unchanged after registration.
- `tools/avatar/extract-phase2-cut-guides.mjs` — deterministic overlay generation.

**MUST NOT be reused — bound to iter7 / old carve logic / invalidated assumptions (D-043):**
- `build-inpaint-iter4-scalp.mjs`, `build-inpaint-v2-base.mjs`, `build-iter6-lowerhead.mjs`,
  `build-iter7-shading.mjs`, `build-review-iter5-under-hair.mjs`, `-iter6-`, `-iter7-`
  → the whole iter4→iter7 **deterministic-carve line is invalidated** (it hallucinated the occluded lower
  head → the bust/chest-plate). Any base built on it inherits the structural failure.
- **`build-face-clean.mjs` MUST NOT be used now** — it is a Gate-3 face-layer tool, composited against the
  invalidated iter7 base, and is preserved only as WIP on `origin/wip/save-build-face-clean`. Using it would
  resume Gate 3 (which is PAUSED) and re-introduce iter7 dependence.
- `build-eyes-clean.mjs`, `build-hair-clean.mjs` — Gate-3 layer tooling; PAUSED, not part of Gate 2A.

## 6. Deterministic validations (must exist BEFORE any visual judgement)

| # | Validation | Requirement |
|---|---|---|
| V1 | **canvas / dimensions** | both inputs 1024×1536; output canvas 1024×1536 (D-027 full-canvas, no crop/trim) |
| V2 | **alpha integrity** | recovery-base: clean transparent bg, no halo/fringe; registered output: alpha preserved, no new fringe |
| V3 | **offset direction & registration** | operation = translate recovery-base by **(−25, −285)**; direction asserted in code and in the report (no ambiguity) |
| V4 | **landmark re-checks** | re-derive the offset from ≥3 landmarks (neck narrowest, star bbox, sweater bbox); each within ±2 px of (+25, +285) → PASS |
| V5 | **silhouette overlap / IoU** | body-band silhouette IoU after registration **≥ 0.98** (measured ≈ 0.9921) in the shared, unmodified region |
| V6 | **Master-pixel preservation** | report % of overlapping pixels essentially identical to Master; **threshold band (e.g. ≥ 80 %), NOT 100 % byte identity** (≈ 84.3 % measured; ~5–11 % localized edge/finish drift is expected and accepted → decided at visual sign-off, not failed here) |
| V7 | **crop / lower-leg / feet completion audit** | detect recovery-base touching the canvas bottom (cropped); quantify px of Master lower legs/feet below recovery coverage; flag whether completion is needed |
| V8 | **no runtime promotion** | assert nothing is written outside the gitignored `…/gate2a/` dir |
| V9 | **no `assets/avatar-r2/` write** | path guard rejects any `assets/avatar-r2/` target |
| V10 | **no `R2_MANIFEST` change** | `R2_MANIFEST` untouched |
| V11 | **`AVATAR_R2` remains false** | `js/avatar-layers.js` flag unchanged (read-only check) |

**Note on V6 (root-cause guardrail):** the iter7 failure passed a width-only metric while the *shape* was
wrong. Gate 2A therefore validates **shape (IoU, V5)** and **crop (V7)** on a **contrast background**, and
treats pixel-preservation (V6) as an informational band plus a mandatory human visual check — never as the
sole pass condition.

## 7. Why these constraints (rationale)

- **Why iter4→iter7 carve tooling must not be reused:** those scripts only constrained the head *above* the
  brow line and kept the iter3 AI "balloon" below it, producing the skin-colored bust/chest-plate (no real
  chin→neck→collar). The entire line is invalidated (D-043); reusing it re-imports the defect.
- **Why Gate 3 remains paused:** face/eyes/eyelid/hair layers register to the base. Until the base-layer
  source is registered and reviewed (Gate 2), any Gate-3 output would be built on an unconfirmed base and
  would have to be redone. Sequencing Gate 3 after Gate 2 avoids wasted, unverifiable work.
- **Why `build-face-clean.mjs` must not be used now:** it is Gate-3 tooling composited against the
  invalidated iter7 base and is only preserved as WIP; using it resumes Gate 3 and re-introduces iter7.
- **Why Gate 2A does not satisfy Gate 2 by itself:** Gate 2A only establishes *geometric registration* and
  an *audit*. A base is not Gate-2-passable until it is a coherent, neutral, reviewed asset.

**What must happen AFTER Gate 2A before Gate 2 can pass:**
1. **Neutral outfit reconstruction** (masked, identity-preserving; D-029/D-022/D-042).
2. **Fresh 164B.3 review** of the corrected base-layer source
   ([`164b3-base-review-worksheet.md`](./164b3-base-review-worksheet.md) template).
3. **Composed visual sign-off** (Gate 5 input).

## 8. Status (recorded)

| Item | Status |
|---|---|
| **Gate 2A** | **DEFINED / PLANNED** (this doc) — deterministic registration + feet audit + review composites + validation report |
| **Gate 2** | **REOPENED / UNDER RECOVERY** — not satisfied (Gate 2A alone does not satisfy it) |
| **Gate 3** | **PAUSED** (until Gate 2 passes) |
| **Gate 1** (eye-box) | ✅ satisfied (re-check registration is offset-only, +25/+285) |
| **Gate 4** (WebP encoder) | ✅ satisfied (not used in Gate 2A — no promotion) |
| **Gate 5** (composed sign-off) | open |
| **recovery-base-v1-blankface.png** | candidate **registered base-layer source** (NOT a Master, NOT promoted, NOT passed) |
| **`Northstar Master.png`** | canonical identity/style/coordinate datum (D-032 preserved) |
| **`AVATAR_R2`** | `false` (unchanged) |

## 9. Recommended next action after this plan is accepted

Build a **registration-only** deterministic script (its own separately-approved task) that produces the §4
review-only artifacts and the §6 validation report into `tools/avatar/build/phase2/gate2a/` — **no runtime,
no promotion, no `assets/avatar-r2/`, no `R2_MANIFEST`, `AVATAR_R2` stays `false`, Gate 3 stays paused.**

> **Implemented (2026-07-06):** `tools/avatar/build-gate2a-registration.mjs` (npm:
> `avatar:gate2a-registration`). Deterministic, non-AI, pure Node built-ins; reads the frozen Master
> (D-032 sha-guard) + `recovery-base-v1-blankface.png` (read-only), applies the pinned **(−25, −285)**
> translate, and writes the five §4 review-only artifacts + the §6 validation report into the gitignored
> `tools/avatar/build/phase2/gate2a/`. It re-derives the offset from ≥3 landmarks, computes body-band IoU
> and a Master-pixel-preservation band (not 100 % byte identity), audits the feet crop, and asserts the
> guardrails (path-guard to the gate2a dir; no `assets/avatar-r2/` / `R2_MANIFEST` / runtime write;
> `AVATAR_R2` read-only). **Running it does not satisfy Gate 2** (neutral outfit → fresh 164B.3 →
> composed sign-off still required); Gate 3 stays PAUSED.

**Boundaries:** documentation only. This plan changes no runtime code, no `assets/avatar-r2/`, no
`R2_MANIFEST`; `AVATAR_R2` stays `false`; no ComfyUI; no image generation; no build artifacts; Gate 3
remains PAUSED; `wip/save-build-face-clean` is not used.
