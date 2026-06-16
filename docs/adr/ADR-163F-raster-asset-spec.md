# ADR-163F — Raster Asset Specification

- **Status:** Accepted (2026-06-15; updated 2026-06-15 with 164A decomposition locks D-028…D-031)
- **Decision IDs:** D-020 … D-031
- **Builds on:** D-011 (SVG rejected), D-011b (Hybrid Raster), D-012 / ADR-163B (eye layer), D-013…D-019 / ADR-163D (pipeline)
- **Visual target:** North Star Avatar v1.0 ("C2 Base Avatar Premium") — Master v1.0 approved & frozen 2026-06-15
- **Context docs:** `docs/project-state.md`, `docs/avatar-vision.md`
- **Sections:** 163F (decomposition & spec) + 163G (MVP scope decisions) + 164A (North Star decomposition — COMPLETE)

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

## Decisions (D-028 … D-031) — 164A North Star decomposition locks
These resolve the four 164A decomposition questions against the **frozen Master v1.0**.

### D-028 — Skin-tone token of Master v1.0
North Star Master v1.0 **represents the `medium` skin-tone token.** `medium` is an
**internal token, not a subjective reading** of the reference image's skin colour. No
new tone tokens are introduced and no rename is performed now. → base = `body-neutral-medium`,
blink = `eyelid-medium`.

### D-029 — Neutral body-underlayer is a derived production asset
The Master v1.0 render (green star sweater + navy cargo jeans + sneakers) is
**reference art**. The **neutral body-underlayer (blank-canvas base) is produced as a
derived production asset** by decomposing the master — it is **not** a separate product
decision and **not** a blocker for the layer architecture. The sweater/jeans/sneakers
are treated as the visual North Star reference (a future cosmetic set), never baked into
the `base` layer.

**Clarification (164B.1 feasibility review, 2026-06-15):** "derived" here is
**reconstruction-grade, not a literal cut.** Against the actual Master (no layered
source), the only real skin is the face, ears, a small neck triangle and the hands; the
torso, arms (forearms fully hidden by the long sleeves), legs and feet are occluded, and
the neutral default outfit does not exist in the master at all. The base body + neutral
outfit must therefore be **largely hand-reconstructed in the master's cel-shade style
over Master geometry (D-032)** — it is the **single highest-risk MVP asset** (highest
reconstruction volume + highest style-drift exposure + foundational: every other layer
and cosmetic registers to it). This changes **no architecture** (layer model,
who-owns-skin and the pipeline are unchanged); it scopes effort/QA correctly and **gates
the base behind a base-coherence check** before any finished layer is produced (see the
164B.1 Asset Production Plan, Phase 1 sub-gate D). Regeneration is **not** an acceptable
substitute for reconstruction (four companion regenerations drifted — D-032).

**Production-method lock (D-033, 164C):** AI generation/inpainting is **rejected as a base
production method** — it repeatedly drifts the base's proportions and identity (confirmed
across four regenerations and an explicit edit/inpaint attempt). `body-neutral-medium-v1`
**must be produced by a manually controlled layered source / manual paint-over over the
Master** (geometry = Master, D-032). AI outputs may be used **only as visual outfit
references**, never as the base asset. This refines the *method* of D-029; it changes no
architecture.

**Scope (D-034, 164D):** D-033 applies to **geometry-defining rig layers only** (base, face,
eyes, blink, hair, anchor template, per-slot masks). It does **not** ban AI for
shop/cosmetic items: those are slot-constrained transparent overlays that define no geometry,
and **AI is permitted for item overlays** subject to the slot-mask + QA gates (full spec:
`docs/164d-shop-pipeline.md`).

### D-030 — Eye layer z-index = 4 (render stack locked)
The eye layer takes **z = 4** (above Face/Expression, below Blink). The render stack is
**locked** (see "Render stack" below). This fills the gap left by the 159B z-model
(D-008), which predated the separate eye layer (D-012).

### D-031 — North Star hairstyle token = `hair-northstar-v1`
There is **one approved North Star hairstyle**; its token/filename is locked to
`hair-northstar-v1`. The asset is produced as a **neutral luminance map** (the master's
dark brown = the default `hair_color` tint via multiply, D-014 — not baked).

## Render stack (locked — D-030)
| z | Layer | Source / asset | Per skin tone? |
|---|---|---|---|
| 0–2 | **Base body** (skin + neutral underlayer + head, **no face**; D-029) | `body-neutral-medium` | yes |
| 3 | **Face / Expression** (brows, nose, mouth, multiply blush, **no eyes, no skin**) | `face-{expression}` | no (shared) |
| **4** | **Eyes** (tintable `iris` + `fixed`) | `eyes-neutral-iris`, `eyes-neutral-fixed` | no (shared) |
| 5 | **Blink** (eyelid) | `eyelid-medium` | yes |
| 40 | **Hair** (luminance map + tint; D-031) | `hair-northstar-v1` | no (shared) |
| `C2_LAYER_Z` | **Cosmetics** (equipped_slots) | per-slot WebP | no |

> **Cosmetics z-model is canonical `C2_LAYER_Z` (D-035, 164E)** — legacy `SLOT_Z` is
> frozen/deprecated and must not be extended. The cosmetic `face` (mask) and `eyes`
> (glasses) slots are **distinct** from the raster Face/Expression (z3) and Eyes (z4)
> layers above; `blink` (z5) is engine/surface, not a shop slot. Slot/z spec:
> `docs/164d-shop-pipeline.md`.

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
| `hair` | `hair-northstar-v1.webp` | 1 | shared; neutral luminance map, `hair_state=full` only (D-014/D-025/D-031) |
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

## Decomposition prerequisites (production, 164B)
- **Geometric source of truth (D-032):** `assets/avatar/reference/Northstar Master.png`
  is the **SOLE** geometric source for the cut — proportions, head/body ratio, pose, hair
  silhouette, face, eyes, rendering style and character identity all derive from it.
  `Northstar Master - reference.png` is an **outfit-direction reference only** (neutral
  tee / plain trousers / plain sneakers) and **must not** drive proportions, body height,
  hair shape, eye size, facial structure or pose. On any conflict, `Northstar Master.png`
  always wins. (Companion regeneration drifted on proportions/hair across four attempts;
  geometry is therefore taken directly from the frozen Master — see project-state D-032.)
- **Background → alpha:** Master v1.0 is delivered as **1024×1536, RGB, opaque white
  background**. Every cut layer must be exported with a **clean alpha channel** (white
  matted to transparent, no white halo/fringe at hair and limb edges). Mandatory.
- **Eye composite:** within the eye, order is base-skin → `iris` (tinted) → `fixed`
  (sclera/outline + fixed catchlight); the catchlight must never tint (D-015). Prove
  sclera ownership (no double-white / iris seam gap) in the prototype.
- **Anchor revision:** North Star eyes are enlarged vs the legacy 160×240 eye box →
  documented anchor-contract revision; blink + future cosmetics register to the revised
  eye box.

## Status of 164A & the wider system
164A (North Star decomposition) is **COMPLETE** — D-028…D-031 lock the four
decomposition questions; the asset inventory, layer responsibilities, eye/face/blink/
hair decomposition, canvas spec and render stack above are production-grade.
`AVATAR_V2` remains **OFF**. No code, assets, migrations or implementation result from
this ADR — documentation only. Next section: **164B — Cut & Export the Neutral Stack**
(produce assets 1–5 + `hair-northstar-v1` against this spec; run the QA gate).
