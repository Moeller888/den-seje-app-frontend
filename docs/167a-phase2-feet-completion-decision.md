# 167A Phase-2 — Feet / Lower-Leg Completion Decision (post Gate 2A)

**Status: DECISION — recorded 2026-07-06. Documentation only.**
_No implementation, no completed base, no neutral-outfit reconstruction, no Gate 3, no runtime, no
promotion. No `assets/avatar-r2/` write, no `R2_MANIFEST` change, `AVATAR_R2` stays `false`._
_Context: [`167a-phase2-gate2a-registration-review.md`](./167a-phase2-gate2a-registration-review.md)
(Gate 2A **PASS / owner-review-ready**), [`167a-phase2-base-recovery-decision.md`](./167a-phase2-base-recovery-decision.md)
(D-043, revised), register [`project-state.md`](./project-state.md)._

> **Gate 2A = PASS / owner-review-ready. Gate 2 remains REOPENED / UNDER RECOVERY and is NOT satisfied.
> Gate 3 remains PAUSED.** This decision produces **no completed base** and changes no runtime.

---

## 1. Executive summary

**Decision: Option B (defer feet/lower-leg completion into the later neutral-outfit / base-assembly step),
guided by Option D (assemble with the Master as the authoritative body/lower-leg/feet source and
recovery-base as the head/blank-face donor).**

The Gate 2A registration is correct, but the missing lower region (y1251–1508, ≈ 59,801 px) is **pure
original outfit** (navy cargo trousers + green/white sneakers) — exactly the material that must be
neutralized anyway (D-029/D-022). Completing it now would (a) bake the original outfit into a premature
candidate artifact, (b) create a **finish seam at the crop line** (recovery's re-rendered trousers vs the
Master's original trousers, the ~5–11 % localized finish drift measured at Gate 2A), and (c) force
**double work**, because 164B.3 requires a **neutral** outfit — a completed-but-non-neutral base cannot
pass. Folding completion into the single masked neutralization pass eliminates the seam, eliminates
outfit-mixing, and reduces technical debt. **No completed base is produced now**; the existing Gate 2A
`feet-completion-audit.png` remains the documenting review artifact.

## 2. Current Gate 2A facts (verified, on `main`)

- recovery → Master translation **(−25, −285)**, rigid, no scale.
- Body-band silhouette **IoU ≈ 0.9949**; **Master-pixel preservation ≈ 83.9 %** (Δ≤5) — the recovery body
  is mostly the Master's own pixels, re-rendered at the edges.
- Missing lower-leg/feet region **y1251–1508 ≈ 59,801 px** (lower shins + feet + shoes).
- The Master's feet/lower legs in that region = **navy cargo + green/white sneakers (original outfit)**.
- recovery-base's outfit is **also original** (green sweater + navy cargo), not yet neutralized.
- Expected diffs confirmed: hair crown (recovery is bald), blank face, cropped feet/lower legs.

## 3. Options considered

**A) Complete now, deterministically from the Master (produce a "completed registered base").**
Deterministic composite (for y ≥ 1251 use Master pixels, already in the Master frame). Technically simple,
but creates a **premature, original-outfit candidate artifact** with a finish seam at y1250/1251.

**B) Defer completion into the neutral-outfit reconstruction.** ✅ **chosen**
Completion + neutralization are the **same masked domain** (both regions carry original outfit that must
become neutral grey). The neutralization pass spans the crop line and **paints the seam away** on a uniform
grey surface. One coherent step, no throwaway artifact.

**C) Review-only composite (Master feet under recovery), no completed base.**
Low marginal value: the Gate 2A `feet-completion-audit.png` **already** shows the missing region (orange).

**D) Master as body source + recovery only as head donor (base-assembly).** ✅ **guides B**
recovery-base's unique contribution is only the **bald scalp + blank face + ears + neck/collar anatomy**.
The body/legs are just a re-render of the Master (≈ 84 % Master pixels). Using the **Master as the complete
body source** and recovery only for the head **dissolves feet-completion entirely** (the Master has feet),
shrinks the re-rendered surface to the head, and moves the only seam to the **neck** — exactly where
recovery-base was made to be clean. This is a base-assembly decision (own review), and it steers the later
assembly.

## 4. Decision: B + D-direction

1. **Do NOT produce a completed registered base now.**
2. **Do NOT composite raw Master lower legs/feet into recovery-base as a candidate artifact now.**
3. **Keep the current Gate 2A feet-completion audit** (`feet-completion-audit.png`) as the review artifact.
4. **Defer lower-leg/feet completion into the later neutral-outfit / base-assembly step.**
5. For later assembly, treat:
   - **`Northstar Master.png`** = canonical identity/style/coordinate datum **and** the authoritative
     body / lower-leg / feet geometry source (D-032 preserved).
   - **`recovery-base-v1-blankface.png`** = candidate registered base-layer source, valuable primarily for
     the **bald scalp, blank face, ears, and neck/collar anatomy**.
6. **Preferred later assembly direction:** Master body/lower-legs/feet + recovery head/blank-face
   contribution, then **neutral outfit reconstruction as one coherent masked pass**.
7. **No Gate 2 pass yet.**
8. **Gate 3 remains PAUSED.**

## 5. Rationale

**Why not complete feet/lower legs now.** The missing region is pure original outfit that must be
neutralized regardless; completing it now produces a non-neutral artifact that cannot pass 164B.3 and would
be redone after neutralization (double work), plus a finish seam at the crop line.

**Why raw Master feet/lower legs should not become a candidate base artifact now.** A raw composite bakes
the **original** green/navy outfit into a "candidate" base, inviting confusion with the future **neutral**
base (outfit-mixing) and creating a seam between two render sources (recovery re-render vs Master original)
before there is any coherent, reviewed base to attach it to.

**Why completion belongs inside neutral-outfit / base-assembly.** Completion and neutralization operate on
the same masked lower-body region. Doing them together means the neutralization pass spans the crop line on
a uniform grey surface, so the seam is painted over rather than butted between two different renders. Under
the D-direction the feet come from the Master directly, so there is no lower-leg seam at all — only the neck.

**Why this reduces seams, outfit-mixing, and technical debt.** One masked pass instead of two; no crop-line
finish discontinuity; no intermediate original-outfit "completed base" to supersede; a single coherent,
neutral base goes to review.

## 6. Impact

- **164B.3:** positive — the base presented to 164B.3 is a single, coherent, **neutral** base (164B.3
  requires neutral outfit and compares geometry against `Northstar Master.png` only, D-032). No non-neutral
  interim base is produced.
- **Neutral outfit reconstruction:** positive — feet/lower-leg completion is **folded into** the same
  masked reconstruction (no separate pre-step, no double work).
- **Gate 3:** none — Gate 3 (face / eyes / eyelid / hair) **remains PAUSED**; this decision does not touch
  or advance it.

## 7. Guardrails (this decision)

- **No completed base now.** No candidate base artifact produced.
- **No runtime promotion. No `assets/avatar-r2/` write. No `R2_MANIFEST` change. `AVATAR_R2` = `false`.**
- No image generation, no ComfyUI, no build artifacts. `build-face-clean.mjs` / `wip/save-build-face-clean`
  not used. Face / eyes / eyelid / hair not continued.
- `Northstar Master.png` and `recovery-base-v1-blankface.png` reference files not modified.
- **Gate 2 remains REOPENED / UNDER RECOVERY — NOT satisfied.** **Gate 3 remains PAUSED.**

## 8. Next step

**Neutral-outfit / base-assembly planning** (a separate, review-first, docs-first task) that records the
assembly (Master body/feet + recovery head, then one masked neutralization pass), the neutral-outfit style
target (the existing `Northstar Master - reference.png` — appearance target only, not geometry, D-032), and
the acceptance path toward Gate 2 (fresh 164B.3 + composed visual sign-off).

> **Recorded (2026-07-07):** this plan now exists —
> [`167a-phase2-neutral-outfit-base-assembly-plan.md`](./167a-phase2-neutral-outfit-base-assembly-plan.md)
> (strategy B; short-sleeve tee ⇒ underarm reconstruction is the highest-risk sub-area). Gate 2 stays
> REOPENED / UNDER RECOVERY (not satisfied); Gate 3 PAUSED.

**Explicitly NOT next:** face / eyes / eyelid / hair (Gate 3 stays PAUSED); no completed base; no runtime;
no promotion.
