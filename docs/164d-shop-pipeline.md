# 164D — Scalable Shop Item Pipeline & Slot Template Architecture

_Production model for a 1000+ item shop. **Production model LOCKED by D-034.**
**Canonical slot/z model LOCKED by D-035** (`C2_LAYER_Z`); new-slot z-values **RESERVED**
(8/15/25/100) with **activation DEFERRED** — the slots are not yet built._
_Builds on: D-032 (Master = sole geometry), D-033 (manual base, scoped here), the existing
slot/z model (`js/avatar-layers.js`: `SLOTS`/`SLOT_Z` legacy + `C2_LAYER_Z` 159B), `RARITY_COLORS`,
`equipped_slots`/`shop_items`, the immutable versioned manifest (D-018), full-canvas rule (D-027)._
_No code, assets, migrations, AVATAR_V2 change, or runtime change results from this document._

---

## D-034 (locked production model)
**Scalable item production = slot-constrained transparent overlays; AI allowed for item
overlays only, never for avatar geometry.**

- **Geometry-defining rig layers are manually controlled and AI-FORBIDDEN as production
  geometry:** base body, face/expression, eyes (iris + fixed), blink eyelid, hair luminance
  map, **and** the anchor template, per-slot masks and registration grid. (Scopes D-033.)
- **Shop/cosmetic items are full-canvas, slot-constrained transparent overlays.**
- **AI is allowed for item overlays only.**
- **AI must NEVER define** the avatar body, face, hair, eyes, proportions, anchors or masks.
- **Every AI item must pass the slot-mask + automated QA gates** (below) before entering
  the catalog.
- **Additive only** — reuses the existing slot model, `equipped_slots`, `shop_items`,
  `RARITY_COLORS` and the immutable versioned manifest (D-018). No architecture rewrite.

> D-034 resolves the over-broad reading of D-033: the drift risk that justifies "manual,
> no AI" exists **only** for geometry-defining layers. Slot-constrained overlays cannot
> drift the avatar, so AI is permitted there under gates.

---

## D-035 (locked canonical slot/z model)
**`C2_LAYER_Z` is the canonical slot/z model for all scalable shop/cosmetic overlays.**
- `C2_LAYER_Z` + `C2_BASE_Z=0` + `C2_HAIR_Z=40` (159B/D-008) is canonical for shop overlays.
- **Legacy `SLOT_Z`/`SLOTS` is frozen/deprecated** — retained only for the current live
  legacy render path until the AVATAR_V2 cutover, and **MUST NOT be extended**. New slots
  are C2-only.
- **Slot *names* are the shared contract** across both render z-maps and the DB
  (`shop_items.slot_type`, `equipped_slots` keys, equip/unequip RPCs).
- Cosmetic **`face` slot = masks**, NOT the raster face/expression layer (z3).
- Cosmetic **`eyes` slot = glasses**, NOT the raster eyes layer (z4).
- **`blink` z=5 is an engine/surface layer**, not a shop slot.
- **`hair` is identity/geometry**, not a purchasable shop slot.
- Proposed slots **`shoes`/`bottom`/`hands`/`front_fx` receive RESERVED C2 z-values only**
  (shoes 8 · bottom 15 · hands 25 · front_fx 100) — **their ACTIVATION is DEFERRED**.

**Deferred activation requirements** (ALL must be resolved before activating any new slot):
1. **Product-taxonomy decision** — are `shoes`/`bottom`/`hands`/`front_fx` standalone shop
   products, or folded into existing `body`/`torso` sets?
2. **`shop_items.layer_order` semantics** — the column exists but render z comes from the
   slot map, not `layer_order`; decide whether it is authoritative, vestigial, or future.
3. **DB/RPC slot-validation check** — confirm whether the equip/unequip RPCs whitelist
   `slot_type`; if so, a migration/RPC change is required (out of current scope).
4. **Per-slot mask authoring** (Tier 1, manual) — required before any item batch.
5. **AVATAR_V2 cutover plan** — legacy `SLOT_Z` is still live; "deprecated" only takes
   effect at cutover (no cohort/% mechanism exists, OQ-4).

> D-035 locks the **model + reservations only**. It makes **no code/DB/asset change**
> (`js/avatar-layers.js` is untouched) and **activates no new slot**.

---

## D-036 (locked shop product taxonomy — MVP + post-MVP)
Curates which **existing** slots are MVP shop categories (accessory-first). **No slots are
added or activated; product-architecture decision only.**

**MVP purchasable categories** (generous masks, no base-outfit occlusion):
| Category | Slot | Meaning |
|---|---|---|
| Aura | `aura` | effects behind the avatar |
| Back | `back` | wings / capes (behind) |
| Headwear | `headwear` | hats |
| Masks | `face` | cosmetic **masks only** |
| Glasses | `eyes` | cosmetic **glasses only** |

**Conditional MVP:** `torso` (tops) — activate **only** once the base body + a `torso`
occlusion mask are produced and pass QA (clothing-replacement; medium registration cost).
**Optional / low priority:** `neck` (necklaces).

**Identity / rig only (NOT purchasable overlays):** `hair` — hairstyle + `hair_color` are
identity tokens, not shop overlays.

**Deferred post-MVP:**
| Slot | Why deferred | On activation |
|---|---|---|
| `body` (full-body costume) | highest occlusion/registration risk | event/seasonal pieces |
| `shoes` | clothing-replacement; not core MVP variety | **separate** slot (mix-and-match) |
| `bottom` | clothing system not mature | **separate** slot (mix-and-match) |
| `hands` | low ROI (small, often occluded) | last |
| `front_fx` | front-of-face/eye occlusion risk | once effects catalog justifies it |

**Semantics (must not be conflated):**
- `face` = cosmetic **masks**, **not** the raster Face/Expression layer (z3).
- `eyes` = cosmetic **glasses**, **not** eye-color / rare-eyes (those live in the eye rig
  layer, D-012/D-015).
- `hair` = identity/geometry, **not** a shop overlay.

> D-036 resolves D-035 deferred-activation requirement (1) — product taxonomy. The deferred
> slots still stay deferred for requirements (2)–(5). No code/DB/asset/slot change.

---

## D-037 (locked MVP QA gate framework + mask rules)
Locks **rules only**. Exact pixel mask **assets are Tier-1 work pending the produced
base/rig (164B)**; **no code/tooling/mask/assets are produced here**. Detailed gate list in
§10, rejection criteria in §11, mask-gate rationale in §4.

**Every shop item is a full-canvas transparent overlay** — master **1024×1536** → served
**512×768**; **no crop/trim, no per-item offset math** (pure z-overlay, D-027).

**Automated-first gate (HARD fail → reject queue):**
- transparent background · clean alpha / **no halo**
- **slot-mask compliance — 0 opaque px outside the slot mask**
- **no avatar geometry / skin / face / eyes / hair**
- anchor / registration compliance
- canonical **`C2_LAYER_Z`** slot (no rogue z)
- manifest completeness (unique id, checksum, dims)
- per-item performance budget (≤ ~50 KB served, within the D-019 stack)
- composite smoke test — **eye legibility preserved** (non-eyes/non-mask slots)

**Human review:** style conformance + **content safety** (kids platform — see §6 policy).

**MVP slot mask rules:**
| Slot | z | Mask | Allowed region | Eyes | Notes |
|---|---|---|---|---|---|
| `aura` | −30 | **generous** | full canvas, behind avatar | n/a (behind) | soft-edge glow allowed; fit canvas; weight |
| `back` | −20 | **generous, shoulder-anchored** | back + outward spread | n/a (behind) | wings/capes; no canvas overflow |
| `headwear` | 45 | **moderate, head-anchored** | crown/head region | **must stay legible** | over hair; no body/skin px |
| `face/masks` | 50 | **tight, face-anchored** | face oval | **must stay legible** | masks leave eye-holes / lower-face |
| `eyes/glasses` | 55 | **tight, eye-anchored** | eye band + temples | **approved eye-overlap exception** | the only slot allowed to cover eyes |

**Conditional / optional:**
- **`torso` mask = CONDITIONAL** — only once the base body + a `torso` occlusion mask exist
  and pass QA (clothing-replacement; must fully occlude the base tee, leave forearms/hands to
  base). Stays conditional until then.
- **`neck` = optional / low priority** — small neck/upper-chest band; low risk.

> D-037 locks the **gate framework + mask rules only**. No mask assets, no code, no tooling,
> no DB/RPC, no AVATAR_V2 change, no new slots activated.

---

## 1. Two-tier production model
**Tier 1 — Geometry-locked RIG (one-time, manual, D-032/D-033):** base (per skin tone),
face/expression, eyes (iris+fixed), blink, hair luminance, anchor template, per-slot masks,
style kit. AI forbidden as producer; AI = references only. Produced once and frozen.

**Tier 2 — Slot-constrained item OVERLAYS (scalable, automatable, D-034):** headwear, masks,
glasses, tops, bottoms, shoes, back/wings, neck, aura, etc. Full-canvas transparent overlays
that draw only inside their slot mask and contain **no** avatar geometry/skin. AI allowed,
gated by mask + QA. This is the layer that scales to 1000+.

**Safety contract:** an item is valid only if it has zero opaque pixels outside its slot
mask, registers to the rig anchors, and passes style/weight/alpha QA. The rig is the fixed
datum; items can never alter it.

## 2. Slot model & z-index

### 2a. Existing (authoritative — DO NOT change here)
From `js/avatar-layers.js` `C2_LAYER_Z` (Section 159B / D-008):
`aura −30 · back −20 · base 0 · [expr 3 · blink 5] · body 10 · torso 20 · neck 30 · hair 40 ·
headwear 45 · face(mask) 50 · eyes(glasses) 55`.

> ⚠️ The cosmetic slots `face`/`eyes` (mask z50 / glasses z55) are **distinct** from the
> raster *layers* face/expression (z3) and eyes (z4). The repo also still contains a legacy
> small-z map (`SLOTS`/`SLOT_Z`). **D-035: `C2_LAYER_Z` is canonical; legacy `SLOT_Z` is
> frozen/deprecated and must not be extended.**

### 2b. New slots — **z RESERVED (D-035); ACTIVATION DEFERRED**
z-values are now **reserved** in the canonical `C2_LAYER_Z` gaps (forward-collision-safe).
**Reservation ≠ activation** — none of these slots is built, registered, or rendered yet.

| Slot | Reserved C2 z | Intended position | Status |
|---|---|---|---|
| `shoes` | **8** | above base(0)/blink(5), below `body`(10) | **RESERVED — not activated** |
| `bottom` | **15** | above `body`(10), below `torso`(20) | **RESERVED — not activated** |
| `hands` (gloves/wrist) | **25** | above `torso`(20), below `neck`(30) | **RESERVED — not activated** |
| `front_fx` | **100** | top of stack (above `eyes` 55) | **RESERVED — not activated** |

> **ACTIVATION DEFERRED** pending the five requirements in the D-035 block above
> (product taxonomy · `layer_order` semantics · DB/RPC slot validation · per-slot masks ·
> AVATAR_V2 cutover). Reserving z does **not** add the slot to `SLOTS`/`ALL_SLOTS`/
> `C2_LAYER_Z` in code, nor to the DB/shop — that is the (deferred) activation step.

## 3. Full-canvas transparent overlay rules (D-027)
Every item: **1024×1536 master → 512×768 WebP**, transparent padding, opaque only inside its
slot region, **pure z-overlay** (no per-asset offset math). Composite = rig, then each
equipped item at its slot z.

## 4. Masks / allowed draw regions (the safety gate)
One canonical **mask per slot**, authored once from the rig anchors (e.g. `mask-headwear`,
`mask-torso`, `mask-shoes`). **Rule: 0 opaque pixels outside the slot mask** (small feather
tolerance). This single gate prevents AI items from altering geometry, colliding with other
slots, or painting skin/body. Masks are **Tier 1 (manual, AI-forbidden)**.

## 5. Naming conventions (extend ADR-163D)
`{slot}-{item}[-{variant}]-v{n}.webp` — e.g. `headwear-wizard-hat-v1.webp`,
`torso-knight-armor-gold-v1.webp`. Rarity/price/tint live in the **manifest, not the
filename**. Immutable versioning (D-018): a change = new `-v{n}`.

## 6. Item manifest schema (additive to `avatar-layers` manifest + DB `shop_items`/`equipped_slots`)
```json
{
  "id": "headwear-wizard-hat",
  "slot": "headwear",
  "z": 45,                      // inherited from the slot map; explicit override allowed
  "mask_id": "mask-headwear-v1",
  "file": "headwear/headwear-wizard-hat-v1.webp",
  "res": { "master": "1024x1536", "served": "512x768" },
  "rarity": "rare",             // common | uncommon | rare | legendary (RARITY_COLORS)
  "tintable": false,            // true → luminance-map multiply (D-014 path)
  "palette_tokens": null,       // e.g. ["red","blue",…] when tintable
  "variant_of": null,           // baked color-variant lineage
  "shop": { "price": 250, "currency": "coins", "tags": ["magic"], "available": true },
  "checksum": "sha256:…",
  "version": 1
}
```
Manifest publishes **atomically** (D-018). DB unchanged (reuse `equipped_slots`/`shop_items`).

## 7. Rarity metadata
Reuse `RARITY_COLORS` (common `#757575` · uncommon `#388e3c` · rare `#1565c0` · legendary
`#f57f17`). `rarity` drives the shop frame colour + price tier. No gacha/drop-rate model.

## 8. Color variants (D-026 hybrid)
- **Tintable** (`tintable:true`): one neutral luminance map → N colours free via canvas
  multiply (hair path, D-014). **Preferred** — collapses a colour family into one asset.
- **Baked** (`tintable:false`): a distinct WebP per colour where tint would degrade.
- For 1000+ items, **default to tintable** wherever quality allows (largest asset-count
  reducer) — *policy to confirm*.

## 9. Batch generation workflow (conveyor)
1. **(Tier 1, once)** author slot masks + style kit + pipeline/QA tooling.
2. **(per item)** generate the overlay — AI **or** hand — constrained to the slot mask, in
   the locked style, transparent bg, master canvas.
3. **auto-process:** bg→alpha → full-canvas check → downscale 1024→512 + WebP → clip to slot
   mask (flag overflow) → weight check.
4. **auto-QA gate** (§10).
5. **pass →** write manifest entry + checksum; **fail →** reject queue with reason.
6. **batch publish** assets + manifest (immutable). Humans handle only the reject queue +
   curation/pricing.

## 10. Automated QA checks (per item)
- Canvas 1024×1536 / served 512×768; full-canvas, no crop.
- Alpha: transparent bg, **no white halo**, clean edges.
- **Mask compliance (HARD):** 0 opaque px outside the slot mask.
- **No geometry pixels:** no skin/body/face/eye/hair (mask + skin-region check).
- Anchor registration (hat on head anchor, shoes on foot footprint).
- Slot/z/rarity declared & valid; manifest complete; **unique id**; checksum matches.
- Weight: per-item < budget; equipped stack respects **D-019** (< ~350 KB, decoded < ~15 MB).
- Style conformance: palette within kit; line-weight/finish within tolerance (heuristic /
  classifier + spot human review).
- Composite smoke test: renders over the rig at z; no collision; eyes stay legible.

## 11. Rejection criteria
Any one fails the item: mask overflow · contains avatar geometry/skin · dirty alpha/halo ·
wrong canvas/crop · style drift beyond tolerance · over weight · missing/invalid/duplicate
manifest fields · composite collision / occlusion of the eyes.

## 12. One-time manual vs scalable automation
| One-time manual (Tier 1, D-032/D-033) | Scalable automation (Tier 2, D-034) |
|---|---|
| Base per skin tone; face; eyes; blink; hair | Item overlay generation (AI or hand) |
| Anchor template + per-slot masks | bg→alpha, downscale + WebP encode |
| Style kit / palette / line-weight spec | Mask-clip + overflow detection |
| Pipeline + QA tooling build | Automated QA gate + reject routing |
| Slot/z reconciliation (§2b) | Manifest write + atomic batch publish; tint expansion |

Humans in Tier 2 do **curation, pricing, reject triage** only — never per-item avatar work.

## 13. How this reaches 1000+ items without editing the avatar each time
The rig is produced once and frozen; items are independent overlays that compose by pure
z-order (D-027) against the fixed rig. Adding an item = drop one overlay + one manifest row;
the base/face/eyes/hair are never touched, and the mask gate makes altering the rig
impossible. Throughput is bounded by item generation + automated QA, not avatar editing →
~1000 items/week is realistic.

## 14. Open decisions — REQUIRED before implementation
1. **Slot/z model — RESOLVED by D-035:** `C2_LAYER_Z` is canonical; legacy `SLOT_Z` frozen;
   new-slot z-values reserved (§2b). **Remaining = new-slot ACTIVATION**, deferred pending the
   five requirements in the D-035 block (product taxonomy · `layer_order` semantics · DB/RPC
   slot validation · per-slot masks · AVATAR_V2 cutover).
2. **Style-conformance QA** for AI items (R-6 applied to the catalog): human spot-check rate
   vs. an automated style classifier.
3. **`tintable`-by-default policy (§8)** — confirm.
4. **Mask authoring scope** — produce the per-slot mask set (Tier 1) before any item batch.

> Status: production model (D-034) locked; slot z-values and the items above remain
> **PROPOSED / pending reconciliation**. `AVATAR_V2` stays OFF; no code/assets/migrations.
