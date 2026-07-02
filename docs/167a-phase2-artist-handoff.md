# 167A Phase-2 — Artist Handoff (Human-Art Deliverable)

Status: **HANDOFF BRIEF — for the human painter. Documentation only.** No runtime code, no runtime
assets, no manifest, no `AVATAR_R2` change is made by this doc, and producing these layers does **not**
start Phase-2 implementation (that is a later, separately-gated code step).
Date: 2026-07-02. Owner: project owner (solo).

Source of the requirements (do not restate — this doc operationalises them for the painter):
[167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) (§4 cut-list, §6 eye-box, §8 WebP) ·
[167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md) (§3 target stack) ·
[167a-phase2-cut-guides-review-worksheet.md](./167a-phase2-cut-guides-review-worksheet.md) (eye-box
sign-off) · [164b3-base-review-worksheet.md](./164b3-base-review-worksheet.md) (the base gate).

---

## 1. The exact goal

Produce the **decomposed North Star raster layers** — the same character, taken apart into stacked
layers so the living engines (expression / blink) can animate it. This is **decomposition, not
redesign**: every layer is hand-painted **from the frozen Master** and must read as the *same* kid.
No new design, no "improvements," no proportion changes, no style drift.

## 2. Source image (the only geometric truth)

- **`assets/avatar/reference/Northstar Master.png`** — 1024×1536, sha
  `2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21` (D-032).
- **AI regeneration / inpainting is FORBIDDEN** for every layer here (D-033/D-034). Four AI
  regenerations already drifted the proportions/identity. AI images may be used **only** as loose
  outfit-colour reference, **never** as geometry. Everything is hand-painted over Master geometry.
- `Northstar Master - reference.png` is **outfit appearance only** — never a geometry source (D-032).

## 3. Cut-guide artifacts to work from

Regenerate anytime (deterministic, non-AI): `node tools/avatar/extract-phase2-cut-guides.mjs`.
Outputs land in the gitignored `tools/avatar/build/phase2/`:
- `cut-guides-overlay-v1.png` — Master with the layer regions + eye opening/iris/pupil crosshairs drawn on.
- `crop-face-region-v1.png`, `crop-eye-left-v1.png`, `crop-eye-right-v1.png`, `crop-headwear-region-v1.png`,
  `crop-back-region-v1.png` — per-zone crops.
- `cut-guides-v1.report.json` — every region + eye centre in master / served (÷2) / engine-160 (÷6.4) space.
- Anchor template: `tools/avatar/build/anchors/avatar-anchor-template-v1.json`.

These are **guides**, not masks to trace — they show *where* each layer lives and where the eyes sit.

## 4. Required layers (author at 1024×1536, full-canvas)

**Author every layer on the full 1024×1536 Master canvas** (transparent padding, no cropping — D-027),
so all layers share one coordinate space and drop straight onto Master geometry. Deliver **PNG** for
review (see §11). MVP identity = **neutral-medium** first.

| # | Layer | z | File stem (PNG for review → WebP later) | Content |
|---|---|---|---|---|
| 1 | **Decomposed base v2** | 0–2 | `body-neutral-medium-v2` | skin + **neutral underlayer** + head; **NO face, NO eyes, NO hair, NO signature outfit** |
| 2 | **Face / expression** ×5 (min) | 3 | `face-{neutral,curious,focused,determined,proud}-v1` | brows + nose + mouth + `multiply` blush; **no skin, no eyes** |
| 2b | Face (optional, full D-024 set) | 3 | `face-happy-v1`, `face-surprised-v1` | as above (positive-only; never `sad`/`angry`) |
| 3 | **Eyes — fixed** | 4 | `eyes-neutral-fixed-v1` | sclera + lash + eye outline/shape + **fixed** catch-light (not tintable) |
| 4 | **Eyes — iris/pupil** | 4 | `eyes-neutral-iris-v1` | tintable **iris disk + pupil**, neutral luminance (the eye-colour token tints this) |
| 5 | **Eyelid / blink** *(optional interim)* | 5 | `eyelid-medium-v1` | eyelid that shows skin (per skin tone). *Interim: the CSS-ellipse blink can bridge — deliver only if producing the full raster set.* |
| 6 | **Hair — luminance map** | 40 | `hair-northstar-v1` | neutral **grayscale luminance map** of the Master hair silhouette (runtime tints it via multiply) |

Runtime folders these map to later (informational — **not** where the painter delivers):
`assets/avatar-r2/{base,face,eyes,eyelid,hair}/…`.

## 5. Filename patterns, dimensions, background

- **Naming** (immutable + versioned, D-018): base `body-{body_type}-{skin_tone}-v{n}` ·
  face `face-{expression}-v{n}` · eyes `eyes-{set}-{iris|fixed}-v{n}` · eyelid `eyelid-{skin_tone}-v{n}` ·
  hair `hair-northstar-v{n}`. For this handoff: body **v2** (v1 = the baked Phase-1 base, never
  overwritten); face/eyes/eyelid/hair **v1**.
- **Authoring size:** 1024×1536 (Master canvas). **Served size later:** 512×768 (integer ÷2 — done by
  the runtime team, not the painter).
- **Background:** fully **transparent**, **no white halo / fringe**, clean alpha at the edges (check at
  32 / 48 / 64 px too — the avatar renders small).
- **Full-canvas:** each layer is the whole 1024×1536 frame with only its own content painted and the
  rest transparent (so layers composite by pure z-stacking, no per-layer offsets).

## 6. What must stay IDENTICAL to the Master

The decomposition must not move or restyle anything:
- Head size, **head : body ratio**, and pose.
- Body/limb proportions, shoulder width, silhouette.
- **Eye size, shape and position** (large expressive eyes are the signature trait).
- Hair **silhouette** (for the hair layer).
- Face structure (feature placement/spacing).
- Cel-shade language: line weight, shading ramp, light direction, palette.
- Overall "reads as the same kid" — childlike + premium anime finish.

## 7. What must be REMOVED from the v2 base (so the layers can animate)

The v2 base is the *static underlayer*; everything that moves or is a separate layer comes **off** it,
and the skin/clothing **behind** those removed parts is reconstructed by hand:
- **Face features** — brows, nose, mouth, and any **baked blush** (these become the z3 face layer).
- **Eyes** — sclera, iris, pupil, catch-light (these become the z4 eyes layers).
- **Eyelid** shading (becomes z5 blink).
- **Hair** — the whole hair mass (becomes the z40 hair layer); reconstruct the scalp/skin/forehead
  the hair covered.
- **Signature outfit** — the sweater, the star, cuffs, cargo pockets, wristbands, branded sneakers →
  replace with a **plain neutral outfit** (plain tee / plain trousers / low sneakers, grey/charcoal,
  **no logos or symbols**, D-029). Reconstruct any skin the removed features exposed (e.g. forehead
  behind hair, facial skin behind removed features), tone-matched with **no seam** between lifted and
  reconstructed skin.

Result: the v2 base is a neutral, feature-less, hair-less, signature-outfit-less body that the other
five layers sit on top of.

## 8. Eye-box — APPROVED values (raster-path only)

The Phase-2 raster eye-box is **owner-countersigned APPROVED (2026-07-01)** — align the eyes / fixed /
iris / eyelid layers to these centres (from the anchor template, human-calibrated 164S/164T):

| Centre | Master px (L / R) | Engine-160 (L / R) | Use for |
|---|---|---|---|
| Eye-opening | 427,386 / 580,386 | 66.7,60.3 / 90.6,60.3 | eye shape + eyelid registration |
| Iris | 432,387 / 577,387 | 67.5,60.5 / 90.2,60.5 | iris/pupil placement |
| Pupil | 439,394 / 570,393 | 68.6,61.6 / 89.1,61.4 | pupil placement (converged nasally) |

Eye box: master `x378 y336 98×100` (L) / `x531 y336 98×100` (R). North Star eyes sit **~13 units lower**
(engine-160 `cy≈60` vs the legacy `cy47`) and larger.

> **Raster-path only.** These values drive the *raster* rig. The **legacy C2 blink/eye anchors
> (`cx68/92 cy47`, `js/avatar-blink-engine.js`) stay frozen** — do not reference them for this art.

## 9. v2 base acceptance — the 164B.3 Base-Coherence Gate

The v2 base is the highest-risk asset and is the datum for every other layer, so it must **pass the
164B.3 gate** ([164b3-base-review-worksheet.md](./164b3-base-review-worksheet.md)) before the other
layers are authored. Summary of what PASS requires:
- **Proportions (non-negotiable):** head:body ratio within **±0.15 head**; shoulder / torso / leg /
  arm within **±3%** (arm angle ±5°); hand centre within **±1%** of figure height; **silhouette IoU
  ≥ 0.95**; **no systematic vertical stretch**.
- **Style:** every field (line-weight, cel-shading, shape-language, folds, readability @32px & @48px)
  scores **≥ 4/5**.
- **Skin tone:** matches the `medium` ramp (ΔE ≤ 5), consistent base/shadow/highlight, **no seam**
  between lifted and reconstructed skin.
- **Outfit:** neutral (plain tee/trousers/low sneakers, grey/charcoal), **no logos/symbols/star**, no
  signature elements; geometry registered to Master anchors (no drift).
- **Reconstruction:** every reconstructed region (torso, arms, forearms, legs, feet, neutral outfit,
  facial skin behind removed features) is style/geometry/tone-coherent — no "Frankenstein" seams.
- **No forbidden baked elements:** no face / eyes / eyelid / hair / baked blush / signature outfit /
  background / cosmetics; **full-canvas 1024×1536**; clean bg→alpha, **no halo**.
- **Non-negotiable:** a fail in proportions (§2) or D-032/geometry (§5) forces overall **FAIL**
  regardless of style scores.

## 10. Painter checklist (per layer, before delivery)

- [ ] Painted **over Master geometry** — no regeneration, no AI, no reference-outfit geometry.
- [ ] **Full-canvas 1024×1536**, transparent background, **no white halo**; clean alpha at 32/48/64px.
- [ ] Nothing moved vs Master (§6): head/body ratio, eye size/shape/position, hair silhouette, pose.
- [ ] Correct **content only** for this layer (§4) — e.g. face layer carries **no skin, no eyes**;
      base carries **no face/eyes/hair/signature-outfit**.
- [ ] Eyes/fixed/iris/eyelid aligned to the **approved eye-box** (§8).
- [ ] Hair layer = **neutral grayscale luminance map**, silhouette matches Master.
- [ ] Face set is **positive-only** (neutral, curious, focused, determined, proud [+happy, surprised]).
- [ ] An **onion-skin overlay vs Master** is included, showing alignment.

## 11. Delivery checklist

For each layer deliver:
- [ ] **Layered source** (the working file) **+** a flattened **review PNG** at 1024×1536.
- [ ] The **onion-skin overlay** (layer/composite vs `Northstar Master.png`).
- [ ] Short **change notes** (what was removed/reconstructed for the base; expression intent per face).
- [ ] For the **v2 base**: a filled [164B.3 worksheet](./164b3-base-review-worksheet.md) (§9).
- [ ] File stems per §5 (`body-neutral-medium-v2`, `face-…-v1`, `eyes-neutral-{fixed,iris}-v1`,
      `eyelid-medium-v1`, `hair-northstar-v1`).
- **Deliver PNG only** — see §12. Do **not** deliver WebP; do not write into `assets/avatar-r2/` or
  touch any code/manifest (that is the runtime team's separate step).

## 12. WebP note (separate, not the painter's job)

Review + delivery is **PNG at 1024×1536**. Converting to the runtime **WebP** (downscale ÷2 → 512×768,
encode) is a **separate step (plan §13 gate 4)** handled by the runtime team — it is **not required for
painter review** and must not block delivery. The encoder now exists (vendored libwebp
`cwebp.exe` + `tools/avatar/encode-webp.mjs`, e.g. `node encode-webp.mjs <in.png> <out.webp> --half`),
so once a layer PNG is delivered the runtime team can encode it directly — still **not the painter's job**.

## 13. Rejection criteria (any one → reject / re-do)

- AI-generated / regenerated / inpainted geometry, or geometry taken from the reference outfit image.
- Any proportion / head:body / eye size / pose drift vs Master; silhouette IoU < 0.95; vertical stretch.
- Style drift (a style field ≤ 2 / "Frankenstein" reconstruction); illegible eyes at 32px.
- Wrong layer content (e.g. skin or eyes baked into the face layer; face/eyes/hair/signature-outfit
  left on the v2 base; hair not a neutral luminance map).
- Eyes/eyelid not aligned to the approved eye-box (§8), or built against the legacy `cy47` box.
- Cropped / wrong dimensions / white halo / opaque background.
- Signature outfit, logos, or the star left on the base; skin seams between lifted/reconstructed regions.

---

## Guardrails (binding)

Producing these layers is an **offline art deliverable**. It does **not** change runtime code, does
**not** touch `AVATAR_R2` (stays `false`), does **not** write runtime assets or the manifest, and does
**not** start Phase-2 implementation. Wiring the delivered art is a later, separately-gated code step
(plan §13 gates 3–6) that also needs the WebP encoder (gate 4) and the final visual sign-off (gate 5).
Gate 1 (the eye-box sign-off) is already satisfied (§8).
