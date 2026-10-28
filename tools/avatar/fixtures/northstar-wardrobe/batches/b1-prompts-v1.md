# Batch b1 — de faktiske prompts

Genereret af `tools/avatar/northstar-batch.mjs plan` (D-245). Hver prompt er kontrolleret af `validatePrompt`: kategoriens dækningssætning, kontraktinstruktion og referencearksætning findes præcis én gang, ingen anden kategoris, og intet uløst (`undefined`, `null`, pladsholdere).

## Overdele

Kontraktinstruktion (`modelDraws.top`):

> Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers.

### top-polo-navy

- Tester: a flat collar at the neck seam, under the head stack; dark fabric shading vs the skin-shadow rule
- Scope: the collar lies flat on the neckline the base top already covers (no stand-up part into the protected neck band); buttoned, so no chest shows
- sha256 `7b036f49ca418db63b1cf8ece847c7e1d5605c7ec2206fc1a21e31aaf62d1eb7`, 1594 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a navy-blue cotton polo shirt with a small flat collar lying around the neckline, a short two-button placket buttoned to the top, short sleeves and a straight hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-breton-longsleeve (checkpoint)

- Tester: a regular pattern across the body/sleeve layer split; long sleeves ending above the wrist
- Scope: a crew neck and hip length within the top's envelope; sleeves end at the contract's wrist bars
- sha256 `fedf9713a2e98cc2eebb696485bcd4b10033d9b7c18ebbc92bbb9d8b8cafeaa4`, 1537 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a long-sleeved white top with even horizontal navy-blue stripes all over, a round neck and a straight hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-flannel-check

- Tester: a large check pattern across seams; a flat collar and a button placket; dark red near C's skin hue
- Scope: buttoned to the collar: no opening onto the torso; the collar lies flat on the neckline
- sha256 `2e68a3b975aacfaa0cbad6d6b4f2d66579edb28d2919781000af2421a53d2e32`, 1566 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a long-sleeved red and black buffalo-check flannel shirt with a flat collar, buttoned all the way up to the collar, and a straight hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-cableknit-oat

- Tester: skin-near colour vs C's skin (extraction); a knit texture vs the remnant rules
- Scope: fitted, so the silhouette stays within the top's envelope; crew neck
- sha256 `c502aba40498b4ec42f3ed31ee52a41966d550baec5b15ef76cf8b855d87928e`, 1548 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: an oatmeal-coloured cable-knit sweater that fits close to the body, with long sleeves, ribbed cuffs and a ribbed hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-waist-boxy-peach (checkpoint)

- Tester: a waist-length hem at the contract line; skin-near colour next to bare arms
- Scope: ends exactly where the base top ends (the contract's waist line), so no midriff skin is needed — not a crop top
- sha256 `cc365f072781d25b5b92ffa11f3b10937b9b1e7fdbca6fe0b5f4464d1cef26ef`, 1549 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a boxy peach-coloured t-shirt with short wide sleeves and a straight hem that ends exactly at the waist, where the bottoms begin. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-raglan-colourblock

- Tester: a diagonal raglan seam vs the body/sleeve layer split; two colours on one item
- Scope: the layer split follows C's arms, not the raglan seam; a crew neck, hip length
- sha256 `af6d6ebb873a433dee73069130564c53a5c4489d1466f7038adee7a081ccd9ef`, 1546 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a raglan t-shirt with a heather-grey body and mustard-yellow short raglan sleeves, a round neck and a straight hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-track-jacket-green

- Tester: a zip line down the front; sheen material; stripes along the sleeves
- Scope: zipped closed (one garment, no under-layer or torso showing) and a low round neck instead of a stand-up collar (no part in the protected neck band)
- sha256 `ad62d550e736fe71cfbb3df0b2571a42be15f1f9590d2cae63ed0b05e4569fea`, 1577 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a dark-green track jacket zipped all the way up to a low round neck, with long sleeves with two white stripes down each sleeve and a straight hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

### top-dot-shirt-red

- Tester: a small dense pattern vs the remnant and hole rules; a flat collar near the neck
- Scope: buttoned to the top instead of an open camp collar: an open collar shows chest skin C's runtime body does not have
- sha256 `d2950c5fb386becd9920d779f62ee5e9dd24a487a69328fbb98371c036c1b27c`, 1556 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a short-sleeved dark-red shirt with small white polka dots, a small flat collar, buttoned all the way up, and a straight hip-length hem. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new top replaces the grey sleeveless top completely and covers everything it covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Replace the figure's grey base top completely — no grey left anywhere, also not at the lower side corners at the hips. Either end the hem exactly where the grey base top ends, or as a straight hip-length hem one third to one hand-width below it, the same distance across the whole width, and then at least a finger wider than the shorts at the hips. Long sleeves end just above the wrist and never touch the hand. No shadow on the trousers. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the magenta area is the grey top that the new top must cover completely, its lower side corners included; the cyan line is where a waist-length hem ends; the green band is where a hip-length hem ends and how wide it must be at the hips; the cyan bars at the wrists are where long sleeves end.
```

## Underdele

Kontraktinstruktion (`modelDraws.bottoms`):

> Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides.

### bottom-jeans-straight-indigo (checkpoint)

- Tester: the corrected bottoms instruction on a long square hem (hem–shoe seam); stitching lines vs the waistband rule
- Scope: straight legs within the hem envelope; the hem in the contract's long-hem band
- sha256 `dc12480a7ba3bb379da51d2d7822cf10f912f2660f50080bca56d9e6751bc115`, 1567 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: straight-leg dark indigo denim jeans with visible light stitching and a square hem just below the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-joggers-heather

- Tester: a gathered cuff above the ankle (cropped-hem rule); a soft silhouette at the hips
- Scope: ends clearly above the ankle as the contract's cropped class; no flare
- sha256 `dd88a13c4b2e9262b543ed7039360ad1442666d300de970582772796001558d3`, 1575 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: heather-grey jogging trousers with a soft fleece look and elastic ribbed cuffs that end clearly above the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-cargo-shorts-khaki

- Tester: skin-near colour next to bare legs; flat pockets at the side seam
- Scope: flat pockets keep the side outline within the hip envelope
- sha256 `3a74a204edc15c7a6fa06a15fc2a54dcfdf8456e20fab77e1708ab4827673e82`, 1548 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: knee-length khaki cargo shorts with a flat flap pocket on the outer side of each leg. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-pleated-skirt-tartan (checkpoint)

- Tester: the corrected bottoms instruction on hip width and the waistband zone, with a pattern; a tartan pattern with pleats
- Scope: pleats without flare: as wide at the hem as at the hips, within the envelope
- sha256 `875c6cb51d94b84ce7c01fe96b09a1525ef20ac4dae493c847edef92516d92b5`, 1609 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a knee-length pleated skirt in a green and navy tartan pattern, with narrow pleats that fall close to the legs, as wide at the hem as at the hips. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-cord-trousers-brown

- Tester: dark brown next to dark shoes; fine vertical texture
- Scope: straight legs within the hem envelope; the long-hem band
- sha256 `5656b4f9fbb6bbaf02281e007bbe2974db35b8fd15523a15383eb0324975b8ba`, 1572 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: straight-leg chocolate-brown corduroy trousers with fine vertical ribs and a square hem just below the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-linen-straight-white

- Tester: a light colour against the light page; a soft drape within the envelope
- Scope: relaxed but straight: wide-leg trousers would exceed the hem envelope, so they are not in b1
- sha256 `eed0e272e5b8879f87f66652c4f24b1ad1568d0352b02638d850fe48af17ce88`, 1565 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: relaxed straight-leg off-white linen trousers with a soft drape and a square hem just below the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-denim-skirt-light

- Tester: light denim texture; a straight knee-length hem over bare legs
- Scope: straight (an A-line flare would exceed the envelope)
- sha256 `7aae2335689efb76bd77d569a3bb16ca40b0b91bf32d4bbe4a410cfc8b91536f`, 1540 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: a straight knee-length skirt in light-wash blue denim with visible stitching. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

### bottom-sport-shorts-stripe

- Tester: black fabric vs dark contour lines; a stripe on the outer edge
- Scope: the base shorts' own length and width class
- sha256 `89c46bf9524ea3f5753b226f877014c669f4e9fb4eb0988e07f1056e8d776405`, 1551 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: black mid-thigh sport shorts with a single white stripe down the outer side of each leg. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. The new bottom replaces the dark grey shorts completely and covers everything they covered. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Start exactly where the grey base top ends and draw nothing above it. Keep any waistband seam or belt within a finger-width of the top edge; no other horizontal line across the hips. At the hips stay as wide as the grey base shorts. Either end clearly above the ankle (shorts, skirts, capri: the leg shows above any shoe), or end just below the ankle with a straight, square hem that is wider than the leg on both sides. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan line is where the grey top ends and the bottoms start; the red band is where no waistband seam, belt or other horizontal line may be; the magenta lines show how wide the bottoms may be at the hips; the yellow lines are the lowest a short or cropped hem may end; the green marks show how wide a long hem must be and the band where it ends, square.
```

## Lukket fodtøj

Kontraktinstruktion (`modelDraws.shoes`):

> Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe.

### shoes-hightop-canvas-red (checkpoint)

- Tester: a shaft just above the ankle (shaft limit); laces and toe caps
- Scope: the shaft stays under the contract's limit; a painted outline
- sha256 `7efb6fbe3246569c5bf0cb708e00cd8ef7457e9bb2de1b431233839f280b8476`, 1151 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: red canvas high-top sneakers with white rubber soles, white toe caps and white laces, the top ending just above the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-chelsea-black

- Tester: glossy highlights vs the remnant rules; black next to dark trousers
- Scope: a low heel and a shaft under the limit
- sha256 `541bee48dc7a9e958d172d318b4f951bcf8682f207768115ee157e1787b7ef77`, 1136 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: black leather chelsea boots with elastic side panels and a low heel, the shaft ending just above the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-desert-boots-tan (checkpoint)

- Tester: skin-near suede next to bare ankles (covering + extraction)
- Scope: covers the ankle as closed footwear; a flat sole
- sha256 `24baadf06adffa574b51bc3f372618d4273690b07b39a1fe3d6bbc4fa9ceb01b`, 1113 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: tan suede desert boots that cover the ankle, with two lace eyelets and a crepe sole. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-hiking-boots-grey

- Tester: several materials on one shoe; a treaded sole edge
- Scope: the sole stays within the shoe envelope (no chunky or platform sole)
- sha256 `6b4683cecc5749a983a15c38458d593528d87bb1f2636686c9b38830283db288`, 1139 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: grey and brown hiking boots that cover the ankle, with orange laces and a treaded sole no wider than the boot. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-rain-boots-yellow

- Tester: a saturated light colour; a smooth glossy surface
- Scope: short, so the shaft stays under the limit
- sha256 `c095fb390a29d6eaada9f02b4a4c5adad4f63fc0a48c85775acf391c1e5b0ae1`, 1127 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: short yellow rubber rain boots with a smooth glossy finish, the shaft ending just above the ankle. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-runners-panels

- Tester: multicolour panels; a light sole against the light page
- Scope: a normal sole within the envelope
- sha256 `332f91851ec8e132cb6e412088b1615bfa3321fe691c021d372cf1843627c214`, 1119 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: white running shoes that cover the ankle, with navy and teal side panels and a white sole. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-checker-midtop

- Tester: a high-contrast checkerboard pattern vs the outline rules
- Scope: covers the ankle; a painted outline
- sha256 `e6bef807040364665738bb4146433e8de9c19150eca818f83070422b0376cec3`, 1121 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: black-and-white checkerboard canvas mid-top sneakers that cover the ankle, with white soles. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

### shoes-winter-boots-navy

- Tester: a quilted texture; a knitted cuff next to skin
- Scope: a knitted cuff with a solid edge instead of fur: a soft, see-through fur edge is not separated from C's leg by the extraction
- sha256 `22ee3f868a27e3538bb622ee66bd18b5361d9f2dda044e2d903979854b948c3c`, 1128 bytes

```text
Edit the stylised avatar illustration in Image 1. Keep the character exactly as it is: the same head, hair, face, expression, skin tone, body, pose, arms, hands, legs and feet, in the same position and size. Change only the clothing named here: navy-blue quilted winter boots that end just above the ankle, with a white knitted cuff at the top. Draw it in exactly the same painting style, outline weight and soft shading as Image 1. Keep the grey top and the dark grey shorts unchanged. Do not change anything the new garment does not cover. No text, letters, numbers, logos or patterns unless named. Keep the background transparent. Cover the foot up to at least the ankle. A boot shaft may go up to about one hand-width above the ankle, not higher, and stays close to the leg (no flared shaft). No shadow from trousers on the shoe. Image 2 is Image 1 with coloured guide marks; use it only to place the seams and never draw its colours or marks: the cyan lines are the ankle height the shoes must cover up to; the magenta lines are the highest a boot shaft may go; the green lines show how close to the leg the shoe must stay.
```

