# 167A Phase-2 — Gate 2A Registration Review / Sign-off

**Status: GATE 2A — PASS. ✅ OWNER ACCEPTED / COUNTERSIGNED 2026-07-07.** _(assistant review 2026-07-06)_

> **✅ Owner acceptance / countersign (2026-07-07):** the Gate 2A registration review is **accepted**.
> This acceptance does **NOT** satisfy Gate 2 — **Gate 2 remains REOPENED / UNDER RECOVERY**; **Gate 3
> remains PAUSED**; `AVATAR_R2` = `false`.
_Review of the merged Gate 2A registration tool (`tools/avatar/build-gate2a-registration.mjs`, PR #22).
Documentation only. No runtime change, no promotion, no `assets/avatar-r2/` write, no `R2_MANIFEST`
change, `AVATAR_R2` stays `false`._
_Plan: [`167a-phase2-gate2a-registration-plan.md`](./167a-phase2-gate2a-registration-plan.md). Decision:
[`167a-phase2-base-recovery-decision.md`](./167a-phase2-base-recovery-decision.md) (D-043, revised)._

> **This is a Gate 2A review only. It does NOT satisfy Gate 2.** Gate 2 remains **REOPENED / UNDER
> RECOVERY** and is **NOT satisfied**. Gate 3 remains **PAUSED**.

---

## 1. What was reviewed

The deterministic, non-AI registration tool executed on `main` (at/after the PR #22 merge `3e8168c`) via
`npm run avatar:gate2a-registration` (exit 0). It reads the frozen Master (D-032 sha-guard) and
`recovery-base-v1-blankface.png` (both read-only), places recovery into the Master coordinate frame by the
pinned translation, and writes 5 review-only, gitignored artifacts to `tools/avatar/build/phase2/gate2a/`.

## 2. Report metrics (deterministic)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Applied translation | `registered[x,y] = recovery[x+25, y+285]` (recovery→Master = **−25, −285**) | direction pinned + asserted | ✅ correct |
| Body-band silhouette **IoU** (y540–1240) | **0.9949** | ≥ 0.98 | ✅ PASS |
| Master-pixel preservation (Δ≤5) | **83.9 %** (Δ≤15: 90.4 %, mean Δ 8.95) | band ≥ 80 % (NOT 100 % byte identity) | ✅ PASS |
| Offset landmark re-check (≥3 landmarks) | derived **(25, 287.5)** vs pinned (25, 285); sweater L/R = +25/+25, top = +286, neck = +289 | x ±2, y ±3 | ✅ PASS |
| Crop / feet audit | recovery **cropped** at bottom; registered figure bottom y1250; Master bottom y1508; **feet region y1251–1508 = 59,801 px** to complete | audit only | ✅ clear |
| Crown (Master-only, bald) | 78,425 px | expected (recovery bald) | ✅ expected |

## 3. Visual review (4 artifacts)

- **`recovery-base-registered-v1.png`** — recovery-base correctly placed in the Master frame; bald scalp,
  blank face, green sweater + navy pants; legs end mid-shin (cropped). ✅
- **`overlay-registered-vs-master.png`** and **`-on-dark.png`** — the overlap (dark grey) covers essentially
  the entire figure (matching IoU 0.9949). The only differences are red **Master-only** = the **hair crown**
  (recovery is bald), the **feet/shoes** (recovery cropped), and the **eye/brow features** (recovery is
  blank); blue **recovery-only** is negligible (a few px near the eyes). ✅
- **`feet-completion-audit.png`** — the registered recovery in full colour, with the **lower-legs/feet region
  to complete from the Master highlighted in orange** and the bald-crown Master-only area in grey. The
  missing region is unambiguous. ✅

The visuals and the numeric metrics agree: near-total body registration, expected localized differences,
no deformation, correct direction.

## 4. Gate 2A verdict

**PASS — owner-review-ready.** All Gate 2A PASS criteria are met:
- recovery-base is correctly placed into the Master coordinate frame;
- offset direction is correct (recovery→Master = −25, −285; verified by IoU + landmark re-check);
- the overlay confirms near-total body registration (IoU 0.9949);
- the differences are the **expected** ones — hair crown (bald), face features (blank), lower legs/feet
  (cropped);
- the feet-completion-audit clearly identifies the missing lower-legs/feet region (59,801 px, y1251–1508);
- report metrics are within thresholds and consistent with the visual review;
- all artifacts remain review-only and gitignored;
- no runtime / `assets/avatar-r2` / `R2_MANIFEST` / `AVATAR_R2` change.

No Gate 2A FAIL criteria are present.

## 5. Boundaries & guardrails (confirmed)

- **Gate 2 remains REOPENED / UNDER RECOVERY — NOT satisfied by Gate 2A.**
- **Gate 3 remains PAUSED.**
- `Northstar Master.png` remains the canonical identity/style/coordinate datum; **D-032 preserved**.
- recovery-base remains a **candidate registered base-layer source** (not a Master, not promoted).
- **No runtime promotion. No `assets/avatar-r2/` write. No `R2_MANIFEST` change. `AVATAR_R2` = `false`.**
- No AI / no ComfyUI / no image generation. `build-face-clean.mjs` / `wip/save-build-face-clean` not used.
- Master and recovery-base reference files not modified. Generated artifacts remain gitignored.

## 6. Next step after Gate 2A (NOT started here)

> **Next decision recorded (2026-07-06):** the lower-leg/feet completion decision below is now resolved —
> **Option B (defer into neutral-outfit/base-assembly), guided by Option D (Master body/feet + recovery
> head)**. No completed base is produced. See
> [`167a-phase2-feet-completion-decision.md`](./167a-phase2-feet-completion-decision.md). Gate 2 remains
> REOPENED / UNDER RECOVERY (not satisfied); Gate 3 PAUSED.

1. **Lower-leg/feet completion decision** — decide whether the full-figure base completes the cropped
   lower legs/feet from the Master via the same (−25, −285) translation (feet region y1251–1508), or the
   base is scoped without them. (Deterministic, review-first; separate task.) — **RESOLVED: deferred
   (Option B + D), see the pointer above.**
2. **Then** a **neutral outfit reconstruction plan** (masked, identity-preserving; D-029/D-022/D-042).
3. **Then** a fresh **164B.3 review** + composed visual sign-off — the steps that would let Gate 2 pass.

**Explicitly NOT next:** face / eyes / eyelid / hair (Gate 3 stays PAUSED until Gate 2 passes).
