# D-139 — the binding prompt for the R3 technical underlay (head-only edit)

Nothing in this file authorises a call. The prompt below is the text that the ONE call authorised by
D-139 would send, and it is pinned by byte count and SHA-256 so it cannot drift between approval and
transmission. Changing a single byte of the fenced block invalidates the pin and the adapter refuses
to send.

## What the call does

One head-only edit of `fitting-base.H1.png` — the approved authoring base, external under D-127 §2 —
with `assets/avatar/reference/Northstar Master v2.png` as a second image sent as an identity and
style reference only. H1 is Image 1 because the Images edit endpoint applies the mask to the first
image. The result is an internal technical underlay: the bald, featureless head that every later R3
layer is drawn onto. It is not a runtime asset and it is not a character.

The API mask (`r3-underlay-api-mask-v1.png`, derived deterministically from D-133's EDIT region) is
model guidance. The guarantee that nothing outside the head changes comes from D-133's deterministic
recomposition, which copies PROTECT back from H1 byte-identically after the response.

## Why the text reads the way it does

It names the subject as a stylised avatar illustration and states the technical purpose, because the
task is building an internal layer underlay, not a study of a child. It scopes the change to the head
and lists what must survive, because the model sees a whole figure even though only the head region
is kept.

Three deliberate departures from the D-129 fitting-base prompt:

1. **Two image inputs.** D-129 sent exactly one. Here Image 2 is present but fenced to head shape,
   skin tone and line style, and the text forbids copying its hair or its face — the binding recorded
   in the contract's `firstCall.inputs.image2.binding`.
2. **It does NOT ask for the same head size.** D-129 said "the same head shape and head size". Here
   the opposite is required: the bald cranium is smaller than the haired silhouette and the topmost
   pixel moves down. `gates.notCompared` says global top and total height must not be compared with
   H1 for exactly that reason, so the prompt states it as expected rather than letting the model
   preserve the hair volume. The body is still held to 0 differing pixels — by `protectedBody`, not
   by height.
3. **The ears are named as kept.** `gates.hardMachine.headRegion` lists what must be absent and does
   not mention ears; no later R3 layer would restore them, so an earless underlay would mean an
   earless finished avatar. Preserving them is an owner-visual acceptance criterion, NOT a machine
   gate: both ear envelopes were measured read-only and lie 100% inside CORE, the region the model is
   allowed to repaint. See the D-139 register row for the measurement and its consequence.

## The transmitted text

Everything outside this fenced block is documentation and is never sent. The block is transmitted
with LF line endings and exactly one trailing newline.

```
Edit the stylised avatar illustration in Image 1.

This is a flat, cel-shaded character illustration used as an internal technical underlay for
building avatar layers. It is not a photograph and not an anatomical study. Keep it a stylised
illustration in exactly the same drawing style, line weight and flat colouring as Image 1.

Image 2 is a reference for HEAD SHAPE, SKIN TONE and LINE STYLE ONLY. Do not copy its hair. Do
not copy its face. Do not copy anything else from Image 2.

CHANGE ONLY THE HEAD:
- Remove all hair completely. No hair, no fringe, no strands, no hairline, no stubble, no scalp
  shading and no hair colour anywhere on the head.
- The head becomes a smooth, bald cranium with a clean, even outline.
- Remove all facial features. No eyes, no irises, no pupils, no eyebrows, no eyelashes, no nose,
  no mouth, no chin line and no cheek shading.
- The face area becomes one flat, even area of skin in the same skin tone as the neck in Image 1.

KEEP EXACTLY AS THEY ARE IN IMAGE 1:
- The ears, in the same position, shape and size.
- The neck, the shoulders and the whole body below the neck.
- The same front-facing neutral pose, the same centre axis, the same camera angle and the same
  placement and scale on the canvas.
- The same skin tone everywhere skin is visible.
- The same outline weight and the same flat, even colour fills.

THE BALD HEAD MUST BE:
- A credible cranium for this character: the skull the hair in Image 2 would sit on.
- Smaller than the haired silhouette. With the hair gone the top of the head is lower than in
  Image 1. That is correct and expected.
- Joined to the neck smoothly, with no seam, no step and no change of line weight at the jaw or
  the throat.

DO NOT ADD:
- No hat, no headwear, no glasses, no jewellery and no accessories of any kind.
- No texture, pattern, symbol, marking, text or watermark on the head.
- No background. The background must be fully transparent.
- No shadow, no glow, no ground plane, no frame and no border.

OUTPUT:
- One image only.
- 1024 x 1536 pixels, PNG, with a transparent background.
- The body occupies exactly the same area of the canvas as in Image 1.
```

## Provenance

- Owner approval: the text above was approved verbatim on 2026-09-11 and is recorded in the D-139
  register row. No editorial change, line rewrap or rewording has been applied since.
- Scope and inputs: the contract's `firstCall` — HEAD-ONLY EDIT of H1; Image 1 binding for every
  existing pixel, the body geometry and the drawing style; Image 2 for head shape, skin tone and line
  style only.
- What the model may produce: `firstCall.modelMayProduce` — "only the hidden bald, featureless head".
- Absence list: `gates.hardMachine.headRegion`.
- Background rule: `gates.hardMachine.background`.
- Format: `gates.hardMachine.format` — exactly 1024x1536, RGBA, bit depth 8, colour type 6.
- Height deliberately unconstrained: `gates.notCompared`.
- Owner visual criteria the result is judged against: `gates.ownerVisual`, plus the ear criterion
  added by D-139.
