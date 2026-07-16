# 167A Phase-2 Gate 3 — G3-PL-B Blush Extraction Worksheet

Status: **⏳ PENDING OWNER REVIEW.** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** Bounded task **G3-PL-B**, ordered by the WP3 countersign (2026-07-16,
owner command verbatim: *"blush-ekstraktion bestilt"*). WP3 §3 measured a real,
symmetric under-eye blush signal in the Master, clipped by the measurement-zone tops.
This task extracts it as a **multiply component**.
Tool: `tools/avatar/build-face-plb-blush.mjs`. Outputs in the gitignored
`tools/avatar/build/phase2/gate3-d057/plb/`.

## 1. Why a multiply component (not baked pixels)

The face layer is **tone-agnostic** (D-022). Baking the Master's blushed *skin
pixels* into the face file would hard-code the medium tone. The blush is therefore
delivered as per-channel **multiply factors** `m = Master / D-057` (clamped ≤ 1) with
a soft deterministic alpha: over the medium base they reproduce the Master exactly;
over any other skin tone they scale proportionally — the same technique family as the
D-031 hair/iris tints, and exactly what brief §4.2's *"mix-blend-mode:multiply blush"*
describes.

## 2. Method (deterministic, interior-only discipline)

- **Zones extended upward** to y428 (toward the eye-box bottoms), per the WP3 §3
  clipping finding: x 380–480 / 530–630, y 428–505.
- **Inclusion:** base skin ∧ Master skin ∧ 4-px all-skin Master neighbourhood (the
  D-049/D-052 anti-edge rule) ∧ no overlap with the eyes/face layers ∧ redness lift
  ≥ 2 %.
- **Alpha:** smoothstep of the redness lift between 2 % and 8 % — a soft edge from
  the measurement itself, no hand-drawn shapes.
- **Colour:** per-channel multiply factor ×255, clamped ≤ 1 (blush only darkens/warms).

## 3. Measured results (plb-blush-report.json)

| Metric | Value | Requirement | Result |
|---|---|---|---|
| Included px | 2,859 (extended zones vs WP3's clipped 390) | ≥ 200 coherent | ✔ |
| Left / right symmetry | 1,333 / 1,526 = 0.87 | 0.5–2.0 | ✔ |
| Max redness lift | 7.0 % | — (matches WP3's 6.6 % order) | ✔ |
| Multiply factors | all clamped ≤ 1; 0 brighter-than-base px | ≤ 1 every channel | ✔ |
| Overlap with eyes/face layers | 0 px included | 0 | ✔ |

## 4. Findings

1. **The blush reads correctly.** `blush-before-after.png`: soft, symmetric warmth
   on both cheeks under the eyes; the composite matches the Master's own look.
2. **Tone-agnostic proof.** `blush-tone-proof.png`: the same component applied over
   the medium patch and a ×0.62-darkened patch warms both proportionally with no hue
   breakage.
3. **Packaging note (runtime wiring is NOT done here):** the component is a separate
   file (`face-blush-multiply-v1.png`) because a single normal-blend PNG cannot carry
   a multiply region. Wiring it in the C2/raster stack (own element with
   `mix-blend-mode:multiply`, like the hair tint wrapper) is a **later, separately
   gated code step** — this worksheet only produces and reviews the asset candidate.

## 5. Owner review checklist

- [ ] `blush-zones-audit.png`: included px form two coherent cheek patches inside
      the zones; nothing outside.
- [ ] `blush-before-after.png`: the with-blush face reads like the Master (subtle,
      warm, symmetric — not painted-on).
- [ ] `blush-tone-proof.png`: warms both medium and darkened skin without breakage.
- [ ] `composite-stack-blush(-on-dark).png`: full stack + blush reads correctly.
- [ ] Accept `face-blush-multiply-v1.png` as the **Gate-3 blush component candidate**
      (paired with the accepted face-neutral z3 candidate).

## 6. Verdict

**Owner verdict: PENDING · (fill in on review).**

## 7. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. No AI. `Northstar Master.png`, the D-057 base,
`protect-mask-v2.1` and all chain outputs are untouched (the blush component is a NEW
file). Gate 3 stays gated; the remaining queue (eyelid decision → integration
composite; expression variants via the D-042 art-producer path) is unchanged, each
step on its own owner command.
