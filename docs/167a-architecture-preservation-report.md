# 167A — Avatar Architecture Preservation Report (Pre-Migration Guardrail)

Status: **CANONICAL GUARDRAIL — binding on all 167A work.** Documentation only; no code/assets changed.
Date: 2026-06-30. Owner: project owner (solo).
Scope: the architectural review performed **before** the North Star Master raster migration (167A).
Read with: [167a-master-asset-raster-wiring-plan.md](./167a-master-asset-raster-wiring-plan.md) (the
plan of record), [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md), [ARCHITECTURE.md](./ARCHITECTURE.md) §13.x,
[157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md).

---

## Purpose

Lock in, before any raster work begins, that **167A replaces artwork assets only** — it must not
redesign, simplify, replace or refactor the avatar architecture. This report is a **durable
guardrail**: if any 167A step proposes changing a "stable architecture" component below, that step is
to be treated as a **defect** and stopped.

## Verdict (up front)

**167A is an asset migration, not an avatar rewrite.** Every subsystem either stays untouched or
receives an asset-path / render-path update. The only two genuine contract changes are **already
planned** in 167a/164k/ADR-163D, so they are **not defects**. Conceptually 167A remains
`body.svg → body.webp` with the identity / layer / z / cosmetics / engine / ownership / storage
architecture **held constant**.

## The core invariant (binding)

> **167A replaces artwork assets only.** It MUST NOT redesign, simplify, replace or refactor any of:
> avatar identity model · avatar render pipeline · avatar layer system · z-order · cosmetics/equipment
> system · presence engine · blink engine · expression engine · ownership model · avatar state model ·
> storage source-of-truth · rendering entry points · public interfaces.
>
> Any change to one of these during 167A is a **defect** unless a *future, separate* section
> explicitly redesigns it.

## Evidence base

- `js/avatar-layers.js` — the single source of truth: identity model, slots, z-model (`C2_LAYER_Z`,
  `C2_BASE_Z`, `C2_HAIR_Z`), rarity, and asset resolvers (all return *paths*).
- `js/avatar-render-c2.js` — `mountC2Avatar`, the single shared render entry point.
- `js/avatar-presence-engine.js`, `js/avatar-blink-engine.js`, `js/avatar-expression-engine.js` — the
  living engines.
- `docs/167a-master-asset-raster-wiring-plan.md`, `docs/AVATAR_SYSTEM.md`,
  `docs/157f-cloudinary-decision-spec.md`.

## Per-subsystem audit

Classification key: **Preserved unchanged** · **Asset/raster-path update only** · **Genuine
architectural change** (treated as a defect unless already planned).

| Subsystem | Classification | Evidence / note |
|---|---|---|
| **Identity model** (body_type/skin_tone/hairstyle/hair_color) | **Preserved unchanged** | Resolvers (`baseSrcForC2`, `hairSrcForC2`, `skinToneFor`, `hairColorTokensFor`) keep their shape; 167A only *adds* raster resolvers (`baseSrcForR2`, …). Signatures unchanged. |
| **Render pipeline** (`mountC2Avatar`) | **Preserved unchanged** (entry point) | Remains the single shared path; the layer-emit loop is unchanged in structure. |
| **Layer system + z-model** (`C2_LAYER_Z`/`C2_BASE_Z`/`C2_HAIR_Z`, D-030) | **Preserved unchanged** | 167A §B targets the *locked* z-stack; no z values change. |
| **Cosmetics system** (slots, rarity, `equipped_slots`) | **Preserved unchanged**; art modernises progressively (D-009) | Slot/z/equip contract untouched; only asset files update over time (TD-1). |
| **Body / equipment separation** | **Preserved unchanged** | Base owns skin/body; cosmetics are slot-bound overlays. |
| **Presence engine** (breathing) | **Preserved unchanged** | Pure CSS custom properties; **no** `svg/img/src` coupling. Format-agnostic. |
| **Expression engine** | **Preserved** (mechanism) → **asset-path update** | Sets `img.src` from the `EXPRESSIONS` map (`<img>` is format-agnostic). Only the map's paths go SVG→raster (Phase-2). |
| **Blink engine** | **Preserved** (timing/Poisson/CSS-transform) → **raster-path update** to the eyelid layer (Phase-2) | Animates an eyelid layer via `scaleY`; the eyelid asset becomes raster (D-023). Logic unchanged. |
| **Hair layer** | **Identity/token model preserved** → **render-path update** | 167A §F.2 moves hair from inline-SVG `fill=var(--hair-*)` to a **raster luminance-map + `mix-blend-mode:multiply`** tint. `HAIR_COLOR_TOKENS` identity model preserved as the tint source. |
| **Animation contracts** (state→profile maps, reduced-motion) | **Preserved unchanged** | Same state→profile mapping; raster only changes the *layers* the engines drive. |
| **Asset loading** | **Raster-path update only** (additive) | 167A adds an `assets/avatar-r2/` manifest + resolvers + hybrid preload, mirroring the per-layer `src` pattern. |
| **Ownership model** (DB `equipped_slots`/`shop_items`/RPCs) | **Outside 167A scope** | No DB/ownership change; render-only migration. |
| **Avatar state model** (UI state → engines) | **Preserved unchanged** | Same state inputs. |
| **Storage conventions** | **Preserved** | Repo `assets/` + Supabase Storage remain source of truth; `assets/avatar-r2/` is additive. |
| **Rendering entry points** | **Preserved unchanged** | All surfaces keep calling `mountC2Avatar`. |
| **Public interfaces** | **Preserved**; new resolvers added | Existing exports keep signatures; 167A is additive. |

## Components guaranteed unchanged

Identity model · render pipeline entry (`mountC2Avatar`) · layer/z-model (`C2_LAYER_Z`) · cosmetics
slot/rarity/equip model · body/equipment separation · **presence engine** · animation/state contracts ·
ownership (DB) model · storage source-of-truth conventions · rendering entry points · existing public
interfaces.

## Components receiving asset-path updates only

- **Expression engine** — `EXPRESSIONS` map SVG→raster (`<img>.src`, format-agnostic).
- **Blink engine** — eyelid *layer asset* → raster eyelid (Phase-2); engine logic unchanged.
- **Hair** — render *technique* update (inline-SVG-tint → raster luminance-map + blend-mode); token
  identity model preserved.
- **Base body resolvers** — `*-c2.svg` → `*-…webp` via additive r2 resolvers/manifest.
- **Asset loading** — additive r2 manifest + hybrid preload.

## Components explicitly outside the scope of 167A

- **Cloudinary** (`js/cloudinary.js`) — delivery layer only, not avatar architecture.
- **DB ownership** (`equipped_slots`, `shop_items`, equip/unequip RPCs).
- **Legacy SVG render path** + frozen `SLOT_Z`/`SLOTS` (deprecated, separate).
- **Avatar asset *ingestion* Edge pipeline** (`avatar-generation/…`) and the **Tier-2 AI item conveyor**.
- Monitoring / OCR systems (157B/157C/157I).

## Risks discovered — and why none justify an architecture rewrite

These are **validation / golden-test risks**, not reasons to redesign the architecture.

1. **Hair render-technique change (highest risk).** Inline-SVG fill-vars → raster + `mix-blend-mode:
   multiply`. **Planned** (167A §F.2); the identity token model is preserved. *Mitigation:* validate
   tint fidelity against goldens (existing risk **R-7**); re-baseline goldens deliberately. **Render-path
   update, not architecture change.**
2. **Eye-anchor-box revision (genuine contract change — but pre-planned).** North Star eyes are larger
   than the legacy eye box; blink + eye-cosmetics must re-register (167A §D, 164k, ADR-163D). The one
   real *contract* change — **already planned → not a defect**. *Mitigation:* update blink/eye-cosmetic
   anchoring in lockstep; visual + golden verification.
3. **Phase-1 baked-face dormancy (D-040 "Master-as-is").** Phase-1 bakes the face into the base, so
   expression/eyes/blink run **static** temporarily (167A §A/§F.4). **Risk of misreading "dormant" as
   "removable."** *Guardrail:* the engines MUST be **preserved** through Phase-1 and **restored** in
   Phase-2 (163F decomposition). Breathing stays live throughout. **Not an architecture change.**
4. **Cosmetic visual coherence during transition** (legacy pseudo-3D SVG vs new raster — TD-1/R-8).
   Slot/z/equip architecture untouched; this is an **art-coherence** risk, not architectural.
   *Mitigation:* progressive cosmetic redesign (D-009) + golden QA.

> **None of the above is a reason to rewrite, simplify or refactor the avatar architecture.** They are
> handled by careful wiring + deliberate golden re-baselining + human visual sign-off (167A §E/§G).

## Cloudinary relationship — confirmed

```
Source of truth (repo assets/ + Supabase Storage + avatar identity/DB state)
   → raster assets
   → optional Cloudinary fetch mode  (cdnUrl(), raster-only, default-off, fail-soft to origin)
   → browser
```

Verified in code: `cdnUrl()` is applied **only** at the `img.src` seam in `mountC2Avatar`, is
**raster-only** (SVG / inline hair bypass it), holds **no secret**, and **fails soft to the origin
URL**. It never touches identity, cosmetics, storage, ownership, or render logic.

**Cloudinary is a delivery/cache layer only.** It is **not**, and must never become: source of truth ·
avatar logic · identity storage · cosmetics storage · asset registry · rendering controller. The
source of truth remains the **repo `assets/`**, **Supabase Storage**, and the **avatar identity / DB
state**.

## Final confirmation

**167A is an asset migration, not an avatar rewrite.** No subsystem requires a genuine architectural
rewrite. The two real changes (hair render technique; eye-anchor revision) are render-path / contract
updates **already planned** in 167a/164k/ADR-163D — not defects. If any 167A step proposes changing a
"guaranteed unchanged" component, treat it as a **defect** and stop.
