# C2 Avatar — Golden Baseline (Section 155H)

Permanent visual baseline for the C2 avatar render pipeline. Future sections must
be measured against these images: regenerate after an intended change and diff;
an **unintended** pixel change is a regression.

## Files
| File | Purpose |
|---|---|
| `c2-golden.html` | Render fixture — composes the matrix via the **real** shared module (`/js/avatar-render-c2.js` → `mountC2Avatar`). |
| `c2-golden.run.mjs` | Generator/verifier — serves the frontend root, renders the fixture, writes the three PNGs. |
| `c2-matrix-medium.png` | **Golden** — medium skin × 7 hairstyles (hair_color=brown). |
| `c2-matrix-dark.png` | **Golden** — dark skin × 7 hairstyles (hair_color=brown). |
| `c2-hair-colors.png` | **Golden** — curly hairstyle, medium skin × all 8 hair-color tokens. |

## What is permanent vs spot-check
- **Permanent (committed):** the 2 skin × 7 hairstyle sheets + the 8-color sheet.
  These cover the two structural axes (base geometry/asset alignment and the hair
  silhouettes) plus the color-token axis.
- **Spot-check (not committed):** the full 2 × 7 × 8 = 112 Cartesian combinations.
  Hair-color recolor is a uniform token swap orthogonal to skin/hairstyle, so the
  8-color sheet on one hairstyle fully exercises the color axis — the other 104
  combos add no coverage and are derivable.

## Regenerate
```
node tests/c2-golden/c2-golden.run.mjs
```
Run from the frontend root. Exits non-zero on any console/page error.

## Scope
Base body + identity hair + hair-color tokens only. No cosmetics/headwear/tops/
bottoms/shoes (added in later sections; goldens will be extended then).
