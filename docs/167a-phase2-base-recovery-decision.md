# 167A Phase-2 — Base Recovery Decision (iter7 invalidated; recovery-base = registered base-layer source)

**Status: DECISION — recorded 2026-07-05; REVISED 2026-07-06 (falsification-tested analysis).**
_Documentation only. NOT a runtime implementation. No promotion; no `assets/avatar-r2/`; no
`R2_MANIFEST` change; `AVATAR_R2` stays `false`; no runtime/Supabase change; Phase-2 not started._
_Register entry: **D-043** in [`project-state.md`](./project-state.md). Withdraws the Gate-2
CONDITIONAL PASS in [`164b3-iter7-base-review.md`](./164b3-iter7-base-review.md)._

> **🔵 REVISED 2026-07-06 (falsification-tested architecture analysis).** The original wording below
> (recovery-base "adopted as a new base geometry basis", "supersedes D-032", "separate re-rendering /
> not pixel-registered / different scale") was **too strong and partly WRONG**. Corrected, verified facts:
> - **`Northstar Master.png` remains the canonical identity/style/coordinate datum. D-032 is PRESERVED, not superseded.**
> - **recovery-base is NOT a new Master and does NOT replace the Master.** It is a **candidate base-layer
>   source registered to the frozen Master.**
> - recovery-base registers to the Master by a **simple deterministic translation (+25 x, +285 y)** — same
>   figure, **same scale**, NOT non-rigid. Body-silhouette **IoU ≈ 0.9921** after translation; **≈ 84.3 %**
>   of overlapping body pixels are essentially identical to the Master.
> - The prior "different-proportion / non-registrable / separate re-rendering" claim is **withdrawn as an
>   analysis error** (an artifact of the cropped feet + a haired-vs-bald silhouette comparison).
>
> **D-043 is revised: recovery-base is a base-layer source, not a master replacement.** Sections 2–6 are
> re-stated accordingly below. Gate 2 remains **REOPENED / UNDER RECOVERY (not satisfied)**; Gate 3 **PAUSED**.

---

## 1. What happened

The **iter7** base candidate (`body-neutral-medium-v2-candidate-iter7-shaded.png`) — produced under
D-042 (masked AI inpaint iter1→iter3 → deterministic lower-head carve iter4→iter6 → cel-shade iter7)
and given a **164B.3 CONDITIONAL PASS (owner-countersigned 2026-07-04)** — is **visually invalidated**.

A corrective visual audit found a **skin-colored bust / chest-plate artifact**: below the chin, a wide
flat skin-colored oval sits on top of the grey shirt (nearly shoulder-width, hard boundary against the
shirt), with **no proper slim neck into the collar**. It reads as a **severed bust on a body** — a
**structural anatomical failure**, not the "minor finish" issue the earlier review recorded.

Root cause: the deterministic carve only constrained the head *above* the brow line; the lower half kept
the un-fixed iter3 "balloon," so there was never a real chin→neck→collar. The earlier §2 "proportions
PASS" relied on **per-row width metrics** that matched by width but **missed the shape/anatomy failure**,
and the pale-on-white composites **camouflaged** the plate.

## 2. The decision

1. **iter7 is INVALIDATED** as a Phase-2 base. The whole deterministic-carve base line (iter4→iter7) is
   invalidated for the same structural reason.
2. **The Gate-2 CONDITIONAL PASS is WITHDRAWN / SUPERSEDED** (the owner-countersigned iter7 164B.3
   review no longer stands).
3. **`source-master(3).png` is adopted as a CANDIDATE REGISTERED BASE-LAYER SOURCE** (not a new Master).
   Preserved in-repo as a **review/reference artifact** at
   [`assets/avatar/reference/recovery-base-v1-blankface.png`](../assets/avatar/reference/recovery-base-v1-blankface.png)
   (1024×1536 RGBA, clean transparent bg). It is a base-layer source **derived from and registered to the
   frozen Master**, for the **deferred** Phase-2 base path — **not** a runtime asset and **not** promoted.
4. **`Northstar Master.png` remains the canonical identity/style/coordinate datum. D-032 is PRESERVED,
   NOT superseded.** Verified (falsification-tested, 2026-07-06): recovery-base is the **same figure at the
   same scale**, registering to the Master by a **deterministic translation (+25 x, +285 y)** — body
   silhouette **IoU ≈ 0.9921**, **≈ 84.3 %** of overlapping body pixels essentially identical to the Master.
   The earlier "separate re-rendering / different scale / non-registrable / supersedes D-032" statement is
   **withdrawn as an analysis error**.

## 3. Why this base-layer source

`recovery-base-v1-blankface.png` **fixes the exact failure iter7 had** and preserves correct anatomy:
- ✅ correct **rounded bald scalp**
- ✅ **intact ears**
- ✅ proper **head → neck → collar** transition (a real slim neck into the collar)
- ✅ **no bust/chest-plate artifact**
- ✅ **cleanly blank face** (no eyes/brows/nose/mouth)
- ✅ clean transparent background (no white-bg contamination)

## 4. What this base-layer source is NOT (still required before any Gate-2 pass)

- ❌ **NOT a new Master / NOT a datum replacement** — the frozen `Northstar Master.png` remains the
  canonical identity/style/coordinate datum (D-032 preserved).
- ❌ **NOT a runtime asset**; **NOT promoted**; not in `assets/avatar-r2/`; `R2_MANIFEST` untouched.
- ⚠️ **Outfit is NOT neutral** — it is the original green sweater + star + cargo pants + green shoes.
  It must be **neutralized** to plain grey (D-029/D-022) — masked/identity-preserving, not a trivial cut.
- ⚠️ **Not yet registered in-repo** — anchors, eye-box and masks are keyed to the frozen Master.
  Registration is a **known deterministic translation (+25 x, +285 y)** (no re-datum of the register, no
  scale change): existing anchors/eye-box/masks carry over by that constant offset. Not executed here.
- ⚠️ **Lower legs/feet are cropped** at the canvas bottom — to be completed from the frozen Master via the
  same (+25, +285) translation if a full-figure base is required.
- ⚠️ **Still requires validation:** a fresh **164B.3 review** (of the corrected base-layer source) +
  composited visual sign-off before Gate 2 can be considered satisfied.

## 5. Status changes (recorded)

| Item | New status |
|---|---|
| **Gate 2** | **REOPENED / UNDER RECOVERY** (no longer conditionally satisfied) |
| **iter7 base** | **INVALIDATED / SUPERSEDED** (bust/chest-plate structural failure) |
| iter7 164B.3 CONDITIONAL PASS | **WITHDRAWN / SUPERSEDED** |
| **`recovery-base-v1-blankface.png`** | **CANDIDATE registered base-layer source (NOT a Master, NOT promoted) — NOT yet passed** (needs (+25,+285) registration + feet-completion + neutral outfit + 164B.3 + composed sign-off) |
| **Gate 3** | **PAUSED** (face/eyes/eyelid work stopped) |
| Gate-3 hair/eyes/face **tooling** | still useful *as tooling*; but their **outputs are NOT approved layers** against the corrected base-layer path (Master-derived + iter7-composited → re-derive against the registered base-layer source after registration) |
| Gate 1 (eye-box sign-off) | unchanged ✅ (raster-path eye-box; re-check registration — offset (+25,+285) — when the base-layer source is aligned) |
| Gate 4 (WebP encoder) | unchanged ✅ |
| Gate 5 (composed sign-off) | open |

## 6. Recovery sequence (not started here — future, gated)

1. **Deterministic registration:** apply the known **(+25 x, +285 y)** translation to place recovery-base
   in the frozen-Master anchor space (no re-datum, no scale change; existing anchors/eye-box/masks carry
   over by the same constant offset).
2. **Complete the cropped lower legs/feet** from the frozen Master via the same translation, if a
   full-figure base is required.
3. **Neutralize the outfit** (grey tee/trousers/shoes), identity-preserving (masked; D-042).
4. **Fresh 164B.3 review** of the corrected base-layer source + composited visual sign-off.
5. Only then re-derive/validate the Gate-3 layers (hair/eyes/face/eyelid) **against the corrected
   base-layer path** (hair/eyes/face tooling stays useful, but its outputs are **not approved layers** yet).

**No AI generation, no ComfyUI, no new layer extraction, no promotion is authorized by this document —
it records the base-layer-source decision only. The frozen `Northstar Master.png` remains the canonical
identity/style/coordinate datum (D-032 preserved).**
