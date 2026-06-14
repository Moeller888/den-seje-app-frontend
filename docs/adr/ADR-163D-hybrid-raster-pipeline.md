# ADR-163D — Hybrid Raster Asset Pipeline

- **Status:** Accepted (2026-06-14)
- **Decision IDs:** D-013 … D-019
- **Builds on:** D-011 (SVG rejected), D-011b (Hybrid Raster), D-012 / ADR-163B (eye layer)
- **Visual target:** North Star Avatar v1.0
- **Context docs:** `docs/project-state.md`, `docs/avatar-vision.md`

## Context
SVG-only is rejected (D-011); the avatar art must reach the North Star v1.0 quality
(premium anime cel-shade, large glossy eyes). The existing render pipeline composes
`<img>` layers by z-index and is format-agnostic, so the art layer can be swapped to
raster while reusing the database model, identity model (body_type / hairstyle /
skin_tone / hair_color), equipped_slots, the z-model, and the `AVATAR_V2` gate. This
ADR locks the asset pipeline for that swap.

## Decision
Adopt a **Hybrid Raster asset pipeline**: produce the North Star character as
**WebP** layers in the existing pipeline. Reuse the whole architecture; change only
the asset format/style + the hair/iris tint step + the blink re-tune.

## Alternatives considered
- **Asset format:** PNG (too heavy) · WebP ✅ · Mixed (two pipelines, rejected).
- **Hair color:** per-color assets (7×8 explosion) · pure tint (quality risk on
  extremes) · **hybrid tint + override** ✅.
- **Skin tone:** **separate base assets** ✅ · runtime tint (degrades cel-shaded skin).
- **Loading:** preload all (heavy) · lazy all (own avatar pops in) · **hybrid** ✅.
- **Full raster rewrite:** rejected — the pipeline is already format-agnostic.

## Chosen architecture (decisions)
- **D-013 — Format:** WebP (PNG fallback only if needed). Canonical 2:3 master
  1024×1536 → served WebP 512×768; anchors mapped from the 160×240 geometry.
- **D-014 — Hair color:** hybrid — canvas multiply-tint of a neutral luminance map
  (8 colors free as tokens) + hand-painted override for problem colors.
- **D-015 — Eye color:** tint the **iris-base only**; sclera / pupil / glossy
  highlight stay fixed; rare/magic eyes = iris-swap or eye-effect overlay in the eye
  slot (per D-012).
- **D-016 — Skin tone:** separate base assets per `body_type × skin_tone` (body owns
  skin; cel-shaded skin is not reliably runtime-tintable).
- **D-017 — Loading:** hybrid — eager preload of the user's own avatar; lazy-load the
  shop catalog and other avatars.
- **D-018 — Cache:** immutable, versioned assets + manifest; invalidation via filename
  version; never mutate a shipped asset.
- **D-019 — Performance budget (mobile-first):** first-paint < 100 ms, full composite
  < 250 ms, total avatar < ~350 KB, decoded memory < ~15 MB; tint ops < 16 ms cached.

### Layer model (render order)
Base body (per skin tone) → Face/Expression (no eyes) → **Eyes (tintable iris)** →
Blink → Hair (luminance map + tint) → Cosmetics (equipped_slots at C2_LAYER_Z).

### Asset structure
`assets/avatar-r2/{base,face,eyes,blink,hair,headwear,face-acc,back,torso,top,bottom,shoes,aura}/`
with `{slot}-{theme}[-{variant}]-v{n}.webp` naming and a manifest in `avatar-layers`.

## Risks
- **Art (High):** AI style drift + decomposition seams across base/face/eyes/hair/
  cosmetics → produce all from one North Star + style-lock + gatekeeper + golden QA.
- **Tech (Medium):** hair/iris tint quality (canvas multiply + fixed highlight) →
  hybrid tint + hand-painted overrides; prototype early.
- **Performance (Medium):** asset weight on slow mobile + many shop previews → WebP +
  lazy-load + virtualized shop + immutable cache + atlas later.

## Consequences
- **+** Premium raster fidelity toward North Star; long life; low technical debt
  (everything additive, no explosion, no rewrite); strong mobile performance.
- **+** Architecture (DB / identity / slots / z-model / AVATAR_V2) unchanged; the only
  code surface is asset srcs (SVG→WebP) + the hair/iris tint branch + blink re-tune.
- **−** Up-front art production volume; an eye anchor revision (bigger eyes) requiring a
  blink re-tune and a documented anchor-contract revision.

## Future expansion
- More skin tones → new base WebP (D-016).
- More hair / eye colors → new tint token, free (D-014 / D-015).
- Eye rarity / magic eyes → new iris asset / effect overlay in the eye slot.
- Seasonal / premium / event cosmetics → new WebP in equipped_slots + shop_items
  (DB unchanged).

## Status of the wider system
`AVATAR_V2` remains **OFF**. No code, assets, migrations or implementation result from
this ADR — documentation only.
