# face-clean fixtures

Tracked input assets for `tools/avatar/build-face-clean.mjs` (167A Phase-2 Gate-3
face-layer extraction, **NON-AI, deterministic, review-only tooling**).

These are the frozen pipeline inputs the tool reads. They live here — a **tracked**
fixtures directory — so the tool runs on a fresh clone. They deliberately do **not**
live under `tools/avatar/build/`, which is gitignored scratch/output space (see
`.gitignore`).

| File | Role |
|------|------|
| `body-neutral-medium-v2-candidate-iter7-shaded.png` | base body (iter7 shaded) — composite base layer |
| `hair-clean-color.png` | hair color layer (z40) — used to exclude the bangs mass |
| `eyes-neutral-fixed.png` | eyes: sclera + lash + catchlight (z4) |
| `eyes-neutral-iris.png` | eyes: iris (z4) |

The fifth input, `Northstar Master.png`, already lives (tracked) in
`assets/avatar/reference/`.

**Boundaries:** review-only tooling. Writes no runtime assets, no promote, no
`assets/avatar-r2`, no `R2_MANIFEST` change; `AVATAR_R2` stays `false`. Gate 3 remains
PAUSED — this is dormant tooling support, not Gate-3 resumption. Generated outputs are
written to the gitignored `tools/avatar/build/…` dir and must never be committed.
