# D-129 — the binding prompt for the internal authoring fitting base

This file is the ONE tracked prompt for the single fitting-base image call. It follows the pattern
D-121 §4 set: the wrapper is documentation, and **only the fenced block below is transmitted**. Both
the file and the fenced body are byte-pinned in `tools/avatar/openai-generate-fitting-base.mjs`, so
neither can drift without the adapter's preflight failing.

**Nothing in this file authorises a call.** D-129 prepares the request; only a separate, explicit
owner instruction may spend it.

## What the call does

One maskless edit of `assets/avatar/reference/Northstar Master v2.png`, which is the sole API image
input. The head and the arm/hand protect masks are **never** sent — they are local inputs to the
deterministic recomposition that runs after the response, per D-127 §1 and D-128 §8.

## Why the text reads the way it does

It names the subject as a **stylised avatar illustration** and states the technical purpose, because
the task is garment construction, not a study of a body. It asks for **opaque, close-fitting, plain**
garments and forbids anatomical detail, body emphasis, logos, text, patterns and accessories. It
repeats the preserved landmarks explicitly rather than saying "keep everything else", because a
maskless edit redraws the whole figure and the gates in D-126 §8 measure exactly these.

The transmitted text below must remain a single fenced block, and the adapter checks its first line,
its required markers, its byte count and its SHA-256 before it will send.

```
Edit the stylised avatar illustration in Image 1.

This is a flat, cel-shaded character illustration used as an internal technical reference for
constructing avatar clothing. It is not a photograph and not an anatomical study. Keep it a
stylised illustration in exactly the same drawing style, line weight and flat colouring.

KEEP EXACTLY AS THEY ARE IN IMAGE 1:
- The same character identity. Same face, same eyes, same eyebrows, same mouth, same expression.
- The same hair: same shape, same volume, same parting, same colour.
- The same head shape and head size.
- The same skin tone everywhere skin is visible.
- The same front-facing neutral pose, the same centre axis, the same camera angle and the same
  placement and scale on the canvas.
- The same shoulders, arms, hands, fingers, hips, knees, ankles and feet, in the same positions.
- The same outline weight and the same flat, even colour fills.

CHANGE ONLY THE CLOTHING:
- Replace the grey t-shirt with a plain, neutral, opaque, close-fitting sleeveless sports
  undershirt. Plain shoulder straps. No sleeves.
- Replace the blue jeans with plain, neutral, opaque, close-fitting shorts that end at mid-thigh.
- Replace the shoes and socks with bare feet, in the same foot positions.
- The upper arms and shoulders are covered by the t-shirt in Image 1. Draw them as bare skin,
  matching the skin tone and line weight of the forearms already visible in Image 1, and join them
  smoothly to those forearms.

THE GARMENTS MUST BE:
- One single flat neutral colour each, clearly distinct from the skin tone.
- Fully opaque. Nothing may show through them.
- Simple in cut, with plain hems and no visible seams, folds, straps, fastenings or waistbands
  beyond a single plain edge.
- Free of logos, text, numbers, patterns, prints, stripes and any decorative or fashion detail.

DO NOT ADD:
- No shoes, no socks, no hat, no glasses, no bag, no jewellery and no accessories of any kind.
- No background. The background must be fully transparent.
- No shadow, no ground plane, no frame, no border and no watermark.
- No anatomical detail, no muscle definition, no body contouring and no emphasis on the body.
  The figure stays a simple, neutral, stylised shape.

OUTPUT:
- One image only.
- 1024 x 1536 pixels, PNG, with a transparent background.
- The figure occupies exactly the same area of the canvas as in Image 1.
```

## Provenance

- Subject and garment contract: D-126 §4 — sleeveless undershirt, mid-thigh shorts, bare feet,
  transparent background, same canvas and registration as North Star v2 (1024×1536 RGBA).
- Preserved landmarks: D-127 §4 — crown y20, neck y433, ankle y1354, sole y1488, centre axis x511,
  figure height 1469, shoulder width 338.
- Maskless: D-127 §1. Masks never sent: D-127 §3 and D-128 §8.
- The result is an internal authoring artefact, not a runtime asset and not a student-facing avatar
  (D-126 §4, D-127 §4). Where an approved result may be stored is fixed by D-127 §2.
