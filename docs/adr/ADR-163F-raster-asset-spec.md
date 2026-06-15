# ADR-163F — Raster Asset Specification

- **Status:** Accepted (2026-06-15)
- **Decision IDs:** D-020 … D-027
- **Builds on:** D-011 (SVG rejected), D-011b (Hybrid Raster), D-012 / ADR-163B (eye layer), D-013…D-019 / ADR-163D (pipeline)
- **Visual target:** North Star Avatar v1.0 ("C2 Base Avatar Premium")
- **Context docs:** `docs/project-state.md`, `docs/avatar-vision.md`
- **Sections:** 163F (decomposition & spec) + 163G (MVP scope decisions)

## Context
ADR-163D locked the *pipeline* (WebP, hybrid hair/iris tint, per-skin-tone base,
hybrid loading, immutable versioned cache, mobile budget). What remained before any
asset can be produced is the **asset specification**: which files exist, what each
layer is responsible for, how skin tone is partitioned across layers, and how big the
MVP actually is. This ADR locks that specification. It introduces **no new
architecture** — it scopes and itemises the already-decided Hybrid Raster system so
that Section 164A can produce the first real raster layers without guesswork.

`AVATAR_V2` remains **OFF**. This ADR is documentation only — no code, no assets, no
migrations.

## Decisions (D-020 … D-027)

### D-020 — MVP character scope
MVP = **one Neutral North Star character**. The body-type system is **preserved
architecturally** (slots, identity model, manifest) but only the neutral body type is
produced for MVP. Additional body types are additive later (new base WebP, no rewrite).

### D-021 — Eye granularity
The eye layer decomposes into **2 files**:
- `iris` — **tintable** (eye color = a token, free, per D-015),
- `fixed` — sclera, lash line, eye shape and the glossy highlight (never tinted).

This is the MVP granularity. It does **not** remove the eye layer's future
cosmetic/rarity capability (D-012) — rare/magic eyes and eye cosmetics remain a swap or
overlay in the eye slot. See **Layer responsibilities → Eyes** and the
**Consistency note on emotion** below for how this scopes ADR-163B.

### D-022 — Face / Expression layer
The Face/Expression layer is **tone-agnostic**:
- **no opaque skin shading** (it must not paint skin — the base body owns skin),
- **blush is applied as `multiply`** so it reads correctly over every skin tone,
- it carries brows, nose and mouth — i.e. the expression.

Because it paints no skin, **one face set is shared across all skin tones**.

### D-023 — Blink
Blink ships as **WebP eyelid assets, produced per skin tone** (the closed eyelid shows
skin, so the eyelid is a skin-bearing layer like the base body).

### D-024 — Expression MVP (never-negative policy)
MVP ships **only positive expressions**:
`neutral`, `happy`, `curious`, `focused`, `determined`, `surprised`, `proud` (7).
**`sad` and `angry` are excluded.** This is a permanent **never-negative policy**,
consistent with the 151A personality design. (This resolves OQ-6.)

### D-025 — Hair compression
Hair compression (hair reacting to headwear) is **ignored in MVP**. A **contract hook
is reserved** so it can be added later without a schema/asset rename:
`hair_state = full | compressed`. MVP produces only `full`.

### D-026 — Cosmetic recolor
Cosmetic recolor is **hybrid**:
- **MVP = baked assets** (a recolored cosmetic = a distinct WebP),
- **tint = a future opt-in** (the same luminance-map multiply approach as hair, D-014,
  enabled per-cosmetic later). No tint pipeline is built for cosmetics in MVP.

### D-027 — Asset canvas
**All layers use the full canvas.** Every layer (base, face, eyes, blink, hair,
cosmetics) is produced at the same full dimensions with transparent padding — **no
cropped / per-layer-trimmed assets**. This keeps every layer in one shared coordinate
space so composition is a pure z-ordered overlay with no per-asset offset math.

## Layer model (render order — unchanged from ADR-163D)
1. **Base body** (skin + neutral underlayer + head, **no face**) — per skin tone
2. **Face / Expression** (brows, nose, mouth, multiply blush, **no eyes, no skin**) — shared
3. **Eyes** (tintable `iris` + `fixed`) — shared
4. **Blink** (eyelid) — per skin tone
5. **Hair** (luminance map + tint) — shared
6. **Cosmetics** (equipped_slots at `C2_LAYER_Z`)

## Layer responsibilities (who owns skin)
The defining rule that ties D-016, D-022 and D-023 together:

| Layer | Owns skin? | Per skin tone? | Tintable? |
|---|---|---|---|
| Base body | **Yes** (body owns skin, D-016) | **Yes** | No (separate base assets) |
| Face/Expression | No (tone-agnostic, D-022) | **No** (shared) | Blush = multiply only |
| Eyes — `iris` | No | No (shared) | **Yes** (eye color token, D-015) |
| Eyes — `fixed` | No | No (shared) | No (highlight fixed) |
| Blink (eyelid) | **Yes** (eyelid shows skin, D-023) | **Yes** | No |
| Hair | No | No (shared) | **Yes** (luminance-map multiply, D-014) |
| Cosmetics | No | No | MVP no (baked); tint future (D-026) |

**Skin-bearing layers** (must be produced per skin tone): **base body** + **blink**.
**Shared layers** (one set across all skin tones): **face**, **eyes**, **hair**.

## Asset inventory (MVP — Neutral North Star)
Folders follow ADR-163D (`assets/avatar-r2/{slot}/`); the manifest lives in
`avatar-layers`. **MVP = neutral body type, `medium` skin tone (D-020 / D-016).**

**Filename convention** (canonical — supersedes the earlier illustrative naming):
- **Skin-bearing layers** encode the skin tone:
  base = `body-{body_type}-{skin_tone}-v{n}.webp`;
  blink = `eyelid-{skin_tone}-v{n}.webp` (body-type-agnostic head overlay in MVP).
- **Shared layers** use a theme token:
  face = `face-{expression}-v{n}.webp`;
  eyes = `eyes-{set}-{iris|fixed}-v{n}.webp` (MVP set = `neutral`).

| Slot | Files (MVP) | Count | Notes |
|---|---|---|---|
| `base` | `body-neutral-medium-v1.webp` | 1 | per skin tone; MVP = medium only (D-016/D-020) |
| `face` | `face-{neutral,happy,curious,focused,determined,surprised,proud}-v1.webp` | 7 | shared, tone-agnostic, multiply blush (D-022/D-024) |
| `eyes` | `eyes-neutral-iris-v1.webp`, `eyes-neutral-fixed-v1.webp` | 2 | shared; iris tintable, fixed has highlight (D-021/D-015) |
| `blink` | `eyelid-medium-v1.webp` | 1 | per skin tone; MVP = medium only (D-023) |
| `hair` | (existing North Star hairstyle set, luminance maps) | — | shared; `hair_state=full` only in MVP (D-014/D-025) |
| cosmetics | (existing equipped slots, parity first) | — | baked assets, no tint in MVP (D-026/D-009) |

> MVP-core newly-produced raster layers = **11 files** (1 base + 7 face + 2 eyes +
> 1 blink), before hair and cosmetics. Hair and cosmetics reuse the existing slot
> structure and are produced/migrated progressively (parity-first, D-009). Every file
> is full-canvas (D-027).

### Adding a second skin tone later (no rewrite)
Produce a new `body-neutral-{tone}-v1.webp` and `eyelid-{tone}-v1.webp` (the two
skin-bearing layers). `face`, `eyes` and `hair` are unchanged (shared). This is the
additive path guaranteed by D-016 / D-022 / D-023.

## Export resolution rationale (512×768 — expands D-013 / ADR-163D)
D-013 locked the served resolution at **512×768 WebP** from a **1024×1536** master.
The rationale (recorded here because asset production is governed by this ADR):

### Why 512×768 was selected
- **Clean geometry:** 512×768 is 2:3, identical to the 160×240 anchor geometry
  (×3.2) and exactly **½ of the 1024×1536 master**. Integer ÷2 downscale keeps anchors
  (head/eye centres) on sub-pixel-stable positions — no resample drift in the
  layer-alignment contract (D-027).
- **Matches actual display sizes (mobile-first, D-019):** the avatar is shown at
  ~32–64px (hub/quiz/shop chips) up to a few-hundred-px hero view (avatar.html) on a
  phone. 512×768 gives **≥2× linear headroom** over the largest realistic on-screen
  size for HiDPI screens (devicePixelRatio 2–3) without paying for pixels no device
  will ever show.
- **Fits the budgets with margin:** see below — both the **weight** (<~350 KB total,
  D-019) and the **decoded-memory** (<~15 MB, D-019) budgets are met at 512×768 and
  **broken** at any larger served size. Decoded memory is the hard constraint.

### Why larger served resolutions were rejected
Decoded memory = `W × H × 4` bytes per layer (RGBA), independent of file compression.
A full stack is ~6 layers (base, face, eyes×2, blink/hair, cosmetics).

| Served res | Decoded / layer | ~6-layer stack | Weight vs 512 | Verdict |
|---|---|---|---|---|
| **512×768** | 1.5 MB | **~9 MB** | 1× | ✅ within 15 MB / 350 KB |
| 768×1152 | 3.4 MB | ~20 MB | ~2.25× | ❌ exceeds 15 MB memory budget |
| 1024×1536 (serve master) | 6.0 MB | ~36 MB | ~4× | ❌ ~2.4× over memory budget; no visual gain at display sizes; also violates D-018 (master is archived/immutable, served is derived) |

Larger res spends ~2–4× weight and memory for pixels that are downsampled away at the
actual 32–256px display sizes — a pure cost with no perceptible benefit. Rejected.

### Expected file-size budget impact (512×768 WebP, q≈85–90 — to verify in QA)
| Layer | Est. size |
|---|---|
| `body-neutral-medium` (full colour) | ~40–60 KB |
| `face-neutral` (sparse alpha) | ~10–20 KB |
| `eyes-neutral-iris` | ~5–10 KB |
| `eyes-neutral-fixed` | ~10–15 KB |
| `eyelid-medium` | ~10–15 KB |
| **164A 5-layer neutral stack** | **~75–120 KB** |

This leaves headroom under the **~350 KB total-avatar** budget for hair + cosmetics.
Estimates are validated against D-019 in the 164A QA gate (a real measurement, not an
assumption).

### Expected visual quality at 32 / 48 / 64px
The served 512×768 source is far larger than every display size, so the browser
**downsamples** (high-quality area averaging), which is artefact-free:
- **32px:** ~16:1 downscale — crisp; eyes stay **legible** (success criterion #2). Risk:
  single-pixel lash lines / catchlight can alias at 16:1 → mitigated by heavier line
  weight in the master + the 32px legibility check in the 164A QA gate (not a
  resolution problem; a line-art design concern).
- **48px:** ~10.7:1 — eyes read **large and expressive** (criterion #2), full finish.
- **64px:** ~8:1 — excellent. Even at a large hero view (~300–400px) 512–768 still
  provides ≥1.3–2× for HiDPI, so no visible softening.

Upscaling never occurs at the target sizes, so there is no blur risk; the only
resolution-linked risk is fine-line aliasing at 32px, already covered by QA #2.

## Consistency note on emotion (scopes ADR-163B)
ADR-163B / D-012 said the eye layer "carries per-expression eye-shape variants so
emotion lives in the eyes." D-021 scopes the **MVP** eye to **2 files** (iris + fixed),
constant across expressions. Reconciliation:

- In **MVP**, emotion is carried by the **Face/Expression layer** (brows + mouth +
  blush, D-022). The eye layer ships as 2 static files and is the signature feature,
  not the emotion carrier.
- **Per-expression eye-shape variants remain a reserved future capability** of the eye
  layer (the layer is already separate and swappable, so adding eye-shape variants
  later is additive — it does not require a rewrite).

This is a **scoping** of ADR-163B for MVP, not a reversal. D-012's architectural intent
(separate, tintable, cosmetic/rarity-capable eye layer) is fully preserved.

## Consequences
- **+** Section 164A can produce assets against an exact, itemised spec (file list,
  canvas rule, who-owns-skin rule) with no open architecture questions.
- **+** Smallest viable MVP (11 core files + existing hair/cosmetics) while every
  expansion axis (skin tone, body type, eye rarity, cosmetic tint, hair compression,
  negative emotion if ever reversed) stays additive.
- **+** The "skin-bearing vs shared" rule removes the per-skin-tone asset explosion for
  face/eyes/hair.
- **−** Emotion expressiveness in MVP is limited to face-driven expression (eyes are
  static); richer eye-driven emotion is deferred.
- **−** Per-skin-tone duplication is required for base + blink (accepted; D-016/D-023).

## Status of the wider system
`AVATAR_V2` remains **OFF**. No code, assets, migrations or implementation result from
this ADR — documentation only. Next section: **164A — Produce Neutral North Star Base
Assets**.
