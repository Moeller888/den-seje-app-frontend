# 167A Phase-2 Gate 3 — WP2 Eyes Review Worksheet (G3-WP2)

Status: **⏳ PENDING OWNER REVIEW.** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** Gate-3 work package **WP2 (eyes)**, ordered by owner command 2026-07-16.
The WP0 eyes extractor produced a spec-complete **fixed** layer (sclera + lash +
catch-light, D-021) but a Master-brown **iris** — not the *"tintable iris disk
(neutral luminance)"* the Phase-2 cut-list requires. WP2 re-expresses the iris as a
neutral luminance map (the same D-031 multiply model as hair).
Tool: `tools/avatar/build-eyes-wp2-refine.mjs`. Outputs in the gitignored
`tools/avatar/build/phase2/gate3-d057/wp2/`.

## 1. Spec clarification (conflict found and resolved — reported per CLAUDE.md)

Two sources disagreed on the pupil:

- `eyes-report.json` (WP0 tool note): *"iris layer includes the pupil (D-015
  pupil-fixed split = refinement)"* — implying the pupil should MOVE to the fixed layer.
- **`docs/167a-phase2-asset-brief.md` §4.4 (authoritative cut-list):** *"the tintable
  iris disk only (neutral luminance …); **pupil rendered as part of the iris art** …
  pupil stays legible after tint."* D-021/ADR-163B confirm: iris = tintable, fixed =
  sclera + lash + eye shape + highlight — no pupil-move is specified anywhere.

**Resolution: the brief governs.** WP2 keeps the pupil in the iris art and relies on
the multiply model to keep it legible (near-black × any token stays near-black). The
WP0 report note is hereby corrected; no decision was changed.

## 2. Inputs (read-only, verified)

| Input | Integrity |
|---|---|
| `assets/avatar/reference/Northstar Master.png` | sha `2CA10EF8…` (D-032 datum) |
| `assets/avatar/reference/neutral-base-v1-gate2-d053.png` | sha `2CB93EE0…` (D-057) |
| `gate3-d057/eyes-neutral-iris.png` | verified byte-identical to the tracked fixture (hard guard) |
| `gate3-d057/eyes-neutral-fixed.png` | verified byte-identical to the tracked fixture (hard guard); **UNCHANGED by WP2** — already D-021-complete |
| `gate3-d057/pl1/hair-pl1-color.png` | accepted Gate-3 hair candidate (WP1 re-review) — integration view only |

## 3. Measured results (wp2-eyes-report.json)

| Metric | Value | Requirement | Result |
|---|---|---|---|
| Iris px | 4,460 | = WP0 iris (alpha verbatim) | ✔ |
| Iris px outside the 164L eye boxes | 0 | 0 | ✔ |
| Alpha identity vs WP0 iris | 0 mismatched px | 0 (same disk, new values) | ✔ |
| Iris centroid vs 164S `irisCenter` anchors | left 8.2 px · right 1.2 px | ≤ 10 px per eye | ✔ |
| Luminance map | input L 0–107 → band [40,235]; p1 40 · p50 71 · p99 203 | pupil dark / iris body bright | ✔ |
| Fixed layer | byte-untouched | no change (D-021-complete) | ✔ |

Note on the left centroid (8.2 px): the left iris is partially covered by the lash
mass, which pulls the visible-disk centroid toward the 164S **pupilCenter** (439,394)
— the centroid is 2.9 px from that anchor. This is geometry of the Master art, not
drift; the hard guard (≤ 10 px vs `irisCenter`) passes.

## 4. Preview eye-color set (PROPOSAL — not runtime)

There is **no runtime `EYE_COLOR` token set yet** (`js/avatar-layers.js` carries only
`HAIR_COLOR_TOKENS`). The tint sheet uses a **6-color preview proposal**: brown
`#6B4226` · blue `#4A78C8` · green `#3E7D4E` · amber `#B87A33` · gray `#7A8089` ·
violet `#7B5AA6`. **Adopting a runtime eye-color token set is a separate owner/code
decision** — this worksheet only demonstrates that the map tints cleanly.

## 5. Findings

1. **Colour fidelity round-trip holds.** `iris-before-after.png`: the WP2 map ×
   brown preview is visually near-identical to the WP0 Master-brown art — the
   neutral map loses nothing at the default colour.
2. **All 6 preview colours read clearly at full size** (`eyes-tint-sheet.png`);
   the pupil stays dark and legible in every tint; the fixed catch-light is intact.
3. **Small sizes:** brown vs blue distinguishable at 64/48 px (`eyes-tint-small.png`);
   at 32 px eye colour is subtle because the eyes are small — the brief's 32 px
   legibility criterion applies to the fixed layer's eye SHAPE (§4.3), which holds.
4. **Anchors:** `anchor-check.png` shows the 164S crosshairs centred on the iris
   disks (right eye within ~1 px).

## 6. Owner review checklist

- [ ] `iris-before-after.png`: brown tint ≈ original Master eye (no fidelity loss).
- [ ] `eyes-tint-sheet.png`: 6 preview colours all read as their names; pupil
      legible in each; catch-light uncoloured.
- [ ] `anchor-check.png`: crosshairs sit on the iris disks.
- [ ] `composite-full-look(-on-dark).png`: base + accepted hair + eyes reads
      correctly on both backgrounds.
- [ ] Accept `eyes-iris-wp2-luminance.png` (+ unchanged `eyes-neutral-fixed.png`)
      as the **Gate-3 eyes layer candidate (z4 pair)**.
- [ ] Note: the preview colour set is a proposal only; a runtime `EYE_COLOR` token
      set is a separate decision (not ordered by this worksheet).

## 7. Verdict

**Owner verdict: PENDING · (fill in on review).**

## 8. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. `Northstar Master.png`, the D-057 base, `protect-mask-v2.1`,
the WP0/PL-1/PL-2/re-review outputs and the tracked fixtures are all untouched (the
WP2 map is a NEW file; the fixed layer is not rewritten). No AI. Gate 3 stays gated:
accepting the eyes candidate does not promote anything, and the remaining WPs
(face×5, eyelid decision, integration composite) each require their own owner command.
