# C2 Avatar — Golden Baseline (Sections 155H + 159E)

Permanent visual baseline for the C2 avatar render pipeline. Future sections must
be measured against these images: regenerate after an intended change and diff;
an **unintended** pixel change is a regression.

## Files — identity baseline (155H)
| File | Purpose |
|---|---|
| `c2-golden.html` | Render fixture — composes the matrix via the **real** shared module (`/js/avatar-render-c2.js` → `mountC2Avatar`). |
| `c2-golden.run.mjs` | Generator/verifier — serves the frontend root, renders the fixture, writes the three PNGs. |
| `c2-matrix-medium.png` | **Golden** — medium skin × 7 hairstyles (hair_color=brown). |
| `c2-matrix-dark.png` | **Golden** — dark skin × 7 hairstyles (hair_color=brown). |
| `c2-hair-colors.png` | **Golden** — curly hairstyle, medium skin × all 8 hair-color tokens. |

## Files — cosmetic baseline (159E)
| File | Purpose |
|---|---|
| `c2-cosmetics.html` | Render fixture — cosmetics via the **real** `mountC2Avatar` + `c2CosmeticLayers`, with a static neutral expression (mirrors avatar.html + the 159D shop fix). |
| `c2-cosmetics.run.mjs` | Generator/verifier — writes the three cosmetic PNGs. |
| `c2-cosmetics-parity.png` | **Golden** — parity suite: base + one item per slot (hat/glasses/mask/aura/cape/wings/armor). |
| `c2-cosmetics-combos.png` | **Golden** — z-model combinations (hat+glasses, hat+mask, aura+cape, armor+cape, armor+glasses, full stack). Protects the z-model. |
| `c2-cosmetics-shop.png` | **Golden** — shop preview (identity-independent) with the static neutral expression. Protects the 159D face-parity fix (glasses/mask previews). |

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
node tests/c2-golden/c2-golden.run.mjs        # identity baseline (155H)
node tests/c2-golden/c2-cosmetics.run.mjs     # cosmetic baseline (159E)
```
Run from the frontend root. Each exits non-zero on any console/page error or asset
load failure.

## Scope
- **155H:** base body + identity hair + hair-color tokens.
- **159E:** existing equipped cosmetics (headwear, eyes, face, aura, back, torso)
  on the C2 base via the shared pipeline + z-model; plus shop-preview parity.
- **Not yet covered (later sections):** the NEW C2 cosmetic slots (top/bottom/
  shoes/backpack) — no assets exist yet; goldens will be extended when they do.
