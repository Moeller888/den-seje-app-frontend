# face-clean fixtures

Tracked input assets for `tools/avatar/build-face-clean.mjs` (167A Phase-2 Gate-3
face-layer extraction, **NON-AI, deterministic, review-only tooling**).

These are the frozen pipeline inputs the tool reads. They live here — a **tracked**
fixtures directory — so the tool runs on a fresh clone. They deliberately do **not**
live under `tools/avatar/build/`, which is gitignored scratch/output space (see
`.gitignore`).

> **WP0 (G3-WP0, 2026-07-15): the composite BASE is no longer read from this directory.**
> The hair/eyes/face tools now composite against the tracked **D-057 Gate-2 neutral base**
> (`assets/avatar/reference/neutral-base-v1-gate2-d053.png`, sha `2CB93EE0…`), and the
> hair/eyes chain inputs are read **primarily from the fresh gitignored output dir**
> (`tools/avatar/build/phase2/gate3-d057/`), with the fixtures below as the tracked
> **fallback** so the face tool still runs on a fresh clone without re-running the chain.

| File | Role |
|------|------|
| `body-neutral-medium-v2-candidate-iter7-shaded.png` | **SUPERSEDED as composite base (D-043 invalidated iter7; replaced by D-057 in WP0).** Kept for historical reference only — no tool reads it any more. |
| `hair-clean-color.png` | hair color layer (z40) — fallback chain input, used in the review composite only (the bangs-mass exclusion is computed from the Master, not from this file) |
| `eyes-neutral-fixed.png` | eyes: sclera + lash + catchlight (z4) — fallback chain input |
| `eyes-neutral-iris.png` | eyes: iris (z4) — fallback chain input |

The remaining tracked inputs, `Northstar Master.png` and
`neutral-base-v1-gate2-d053.png` (D-057), live in `assets/avatar/reference/`.

**Boundaries:** review-only tooling. Writes no runtime assets, no promote, no
`assets/avatar-r2`, no `R2_MANIFEST` change; `AVATAR_R2` stays `false`. Gate 3 remains
PAUSED — this is dormant tooling support, not Gate-3 resumption. Generated outputs are
written to the gitignored `tools/avatar/build/…` dir and must never be committed.
