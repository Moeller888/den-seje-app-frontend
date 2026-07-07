# 167A Phase-2 — Base-Assembly + Mask-Proposal Tooling Review / Sign-off

**Status: TOOLING REVIEW — PASS. ✅ OWNER ACCEPTED / COUNTERSIGNED 2026-07-07.** _(assistant review 2026-07-07)_

> **✅ Owner acceptance / countersign (2026-07-07):** the base-assembly + mask-tooling review is
> **accepted**. Tooling artifacts remain **review-only** (gitignored); the mask proposals are **NOT final
> masks** (human refinement required before any masked edit). **No neutral outfit was executed; no
> completed/final base exists.** This acceptance does **NOT** satisfy Gate 2 — **Gate 2 remains REOPENED /
> UNDER RECOVERY**; **Gate 3 remains PAUSED**; `AVATAR_R2` = `false`.
_Review of the merged Strategy-B tool (`tools/avatar/build-base-assembly-masks.mjs`, PR #26), run fresh on
`main` via `npm run avatar:base-assembly-masks` (exit 0). Documentation only._
_Plan: [`167a-phase2-neutral-outfit-base-assembly-plan.md`](./167a-phase2-neutral-outfit-base-assembly-plan.md).
Prior gate: [`167a-phase2-gate2a-registration-review.md`](./167a-phase2-gate2a-registration-review.md)._

> **This is a TOOLING review only. It is NOT a Gate-2 pass.** Gate 2 remains **REOPENED / UNDER RECOVERY**
> and is **NOT satisfied**. Gate 3 remains **PAUSED**. **No neutral outfit was executed. No completed/final
> base exists** — the assembled preview is a review-only, gitignored artifact. No runtime promotion, no
> `assets/avatar-r2/` write, no `R2_MANIFEST` change, `AVATAR_R2` = `false`.

---

## 1. Report metrics (from `base-assembly-report.json`)

| Metric | Value | Assessment |
|---|---|---|
| Registration | `registered[x,y] = recovery[x+25, y+285]` (recovery→Master = **−25, −285**, pinned + asserted) | ✅ correct direction |
| Head contribution (recovery) | **92,337 px**, bounds **x273–706 y201–559** | ✅ localized + bounded (head zone only) |
| Master contribution | **296,520 px** (body, arms, lower legs, **feet**) | ✅ authoritative body source |
| Seam mask | band **y540–580**, 10,239 px, figure-limited | ✅ neck/collar join only |
| Body-below-seam IoU vs Master | **1.0000** | ✅ the body IS the alpha-cut Master (feet included) |
| Full-figure IoU vs Master | **0.8223**, master-only = **hair crown** | ✅ expected — assembled head is bald **by design** |
| Mask proposals (px) | tee 101,363 · underarm 18,277 · trousers 75,479 · shoes 52,779 | ✅ plausible magnitudes, labeled proposals |
| Reference image | `Northstar Master - reference.png` exists; **appearance-only, not geometry datum** | ✅ correctly stated |
| Guardrails in report | path-guard confined; no runtime/`avatar-r2`/`R2_MANIFEST`; `AVATAR_R2` false; Gate 3 untouched | ✅ all confirmed |

## 2. Generated review-only artifacts (gitignored, `tools/avatar/build/phase2/base-assembly/`)

`base-assembled-review-v1.png` · `head-contribution-mask.png` · `neck-collar-seam-mask.png` ·
`base-assembly-seam-audit.png` · `outfit-region-mask.png` · `tee-region-mask-proposal.png` ·
`underarm-region-mask-proposal.png` · `trousers-region-mask-proposal.png` ·
`shoes-region-mask-proposal.png` · `master-vs-assembled-geometry-overlay.png` · `base-assembly-report.json`

## 3. Visual evaluation

- **Assembled preview** — bald + blank recovery head (intact ears, correct neck→collar) on the complete
  Master body **including feet** (the cropped-feet problem is resolved by Strategy B). **No Master
  hair/face leakage** into the head (the tool deliberately uses no Master fallback above the seam). Outfit
  is still the original (green sweater + star + navy cargo + green sneakers) — **as expected**;
  neutralization is the later masked pass. ✅
- **Head contribution localization** — the mask is exactly the head silhouette + ears + neck wedge down to
  the seam; nothing outside the head zone. ✅
- **Neck/collar seam audit** — the highlighted band sits precisely at the collar join (y540–580); in the
  un-highlighted preview the join reads clean. ✅
- **Outfit mask proposals** — tee (sweater), trousers (navy) and shoes zones are sensibly captured;
  **known proposal gaps:** the colour detectors exclude the **orange star**, **cuff stripes**, the **dark
  cargo pocket** and dark line-art from the union. Acceptable for **approximate proposals**, but they
  **must be refined (human-confirmed) before any masked edit** — recorded as a caveat. ⚠️→✅ (as proposals)
- **Underarm proposal** — marks the lower-sleeve/cuff/wristband band on both arms, the zone that becomes
  **reconstructed skin** under the short-sleeve tee. Reasonable first proposal; **underarms remain the
  highest-risk sub-area and need their own later sub-gate.** ✅ (as a proposal)
- **Geometry overlay vs Master** — dark = overlap over the whole body/legs/feet; red = hair crown only
  (bald by design) + minor neck-edge slivers; blue (assembled-only) negligible. Matches the metrics. ✅

## 4. Validation checklist

- [x] `node --check` OK; direct run and npm run exit 0 (an earlier non-zero was PowerShell pipe
      truncation, verified clean without truncation)
- [x] All 11 artifacts exist under `tools/avatar/build/phase2/base-assembly/`
- [x] Artifacts **gitignored and unstaged** (`git status -- tools/avatar/build/` empty)
- [x] Report contains all required fields (inputs/dims, registration + direction, strategy, contribution
      bounds/px, seam + mask summaries, underarm risk note, reference statement, alpha, geometry, guardrails, gate status)
- [x] Master sha-guard enforced (D-032); both inputs validated 1024×1536; reference files unmodified
- [x] No runtime files changed · no `assets/avatar-r2/` · no `R2_MANIFEST` · `AVATAR_R2 = false`
- [x] `build-face-clean.mjs` / `wip/save-build-face-clean` not used; Gate 3 untouched (head stays bald + blank)
- [x] Gate 2 remains REOPENED / UNDER RECOVERY (not satisfied); Gate 3 remains PAUSED

## 5. Verdict

**Tooling review: PASS — owner-review-ready.** The deterministic Strategy-B assembly preview and mask
proposals behave exactly as the plan specifies, metrics and visuals agree, and every guardrail held.

## 6. Risks / caveats

- **Masks are approximate proposals, NOT final** — the star / cuff stripes / cargo-pocket / dark line-art
  gaps in the colour-based proposals must be closed by human-confirmed refinement before any masked edit.
- **Underarm reconstruction stays the highest-risk sub-area** (invented forearm skin under the short-sleeve
  tee) — requires its own sub-gate/review in the later implementation.
- The assembled preview intentionally still wears the **original outfit** — do not mistake it for a
  neutral-outfit candidate.
- The neck/collar seam will be finally judged after the masked neutralization pass spans it.

## 7. Next step (after owner accepts this tooling review)

**AI-assisted masked neutral-outfit candidate planning/execution** (D-042; masked edits only, identity
preserved), starting from the refined masks — including the **underarm sub-gate** — followed by the fresh
**164B.3 review** + **composed visual sign-off** that could let Gate 2 pass. **Not** face/eyes/eyelid/hair
(Gate 3 stays PAUSED until Gate 2 is resolved).
