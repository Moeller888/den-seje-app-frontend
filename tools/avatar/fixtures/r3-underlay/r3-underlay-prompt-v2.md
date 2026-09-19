# D-141 — the prepared prompt for a possible next R3 underlay call (head-only edit)

Nothing in this file authorises a call. D-141 is PREPARATION: it fixes the text a future call would
send, so it cannot drift between approval and transmission, and it pins it by byte count and
SHA-256. Sending requires a separate, explicit owner decision, a new call id and a new
exclusive-create claim. D-139's prompt is unchanged and stays where it is.

## What this prompt is for

D-139's call produced a credible bald head and credible ears — both owner-approved as candidates in
D-140 — but its output failed `pre.transition-silhouette` with 644 differing pixels across rows
425–445. The generated neck was longer and narrower than H1's and the shoulders began lower.

Two things in the D-139 setup contributed and are corrected together:

1. **The API mask offered the band as editable.** The model was invited to repaint precisely the
   rows the gate requires to be identical. D-141's CORE-only mask
   (`r3-underlay-api-mask-core-v1.png`) no longer does.
2. **The prompt asked for a smaller cranium without saying what stays.** "Smaller than the haired
   silhouette" was unbounded, so the neck shrank with the head.

## What changed from the D-139 prompt

| # | change | why |
|---|---|---|
| 1 | `CHANGE ONLY THE HEAD` → `CHANGE ONLY THE HEAD ABOVE THE NECK` | D-139 never said where the head stops |
| 2 | A new neck line under KEEP: width, outline and both sides identical; not longer, shorter, narrower or wider | D-139 said only "the neck", and the model lengthened and narrowed it anyway |
| 3 | A new section, `WHERE THE HEAD MEETS THE NECK` | D-139 said nothing about the join, which is where the gate failed |
| 4 | `Smaller than the haired silhouette` → `ABOVE THE JAW ONLY`, plus `The neck does not become smaller` | the root cause |

Everything else — the framing, the Image 2 fencing, the ears line, the absence list, the background
rule and the output format — is carried over unchanged from the text the owner approved for D-139.

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

CHANGE ONLY THE HEAD ABOVE THE NECK:
- Remove all hair completely. No hair, no fringe, no strands, no hairline, no stubble, no scalp
  shading and no hair colour anywhere on the head.
- The head becomes a smooth, bald cranium with a clean, even outline.
- Remove all facial features. No eyes, no irises, no pupils, no eyebrows, no eyelashes, no nose,
  no mouth, no chin line and no cheek shading.
- The face area becomes one flat, even area of skin in the same skin tone as the neck in Image 1.

KEEP EXACTLY AS THEY ARE IN IMAGE 1:
- The ears, in the same position, shape and size.
- The neck. Its width, its outline and both of its sides must be identical to Image 1. Do not
  make the neck longer, shorter, narrower or wider.
- The shoulders and the whole body below the neck.
- The same front-facing neutral pose, the same centre axis, the same camera angle and the same
  placement and scale on the canvas.
- The same skin tone everywhere skin is visible.
- The same outline weight and the same flat, even colour fills.

WHERE THE HEAD MEETS THE NECK:
- The jaw must widen out to meet the neck at exactly the width the neck has in Image 1.
- The join must be smooth and continuous, with no step, no notch and no change of width where
  the head reaches the neck.
- Taper the head gradually down into the neck across the whole lower head. Do not put the
  change of width into a single row.

THE BALD HEAD MUST BE:
- A credible cranium for this character: the skull the hair in Image 2 would sit on.
- Smaller than the haired silhouette ABOVE THE JAW ONLY. With the hair gone the top of the head
  is lower than in Image 1. That is correct and expected. The neck does not become smaller.
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

## What this prompt cannot do

It cannot make `pre.join-continuity` or `pre.transition-silhouette` pass. Both gates run on the
returned pixels, after the request is paid for. A mask is guidance and a prompt is guidance: D-139
showed the model regenerating 76.68% of the PROTECT region despite an explicit mask. **A next call
can still fail with a correct mask and a correct prompt.**

It also decides nothing about visual quality. Even with every machine gate green, a recomposition
still requires a separate owner-visual review of the head/neck join — at 1:1, 52×78, 110×165,
100×150 and 180×270, on a light background, on the real dark avatar gradient and on checkerboard,
with H1, the raw output and the recomposed output side by side.

## Provenance

- Owner-approved wording: the D-141 draft, Del B, approved 2026-09-14.
- Carried over unchanged from D-139's approved prompt: framing, Image 2 binding, the ears line, the
  absence list, the background rule, the output format.
- The four changes above are the only differences, and each one names the measured failure it
  addresses.
- `gates.notCompared` still applies: the figure's global top and total height are not compared with
  H1, because removing the hair legitimately lowers the topmost pixel.
