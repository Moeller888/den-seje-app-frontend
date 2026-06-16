# 164H — Tier-1 Base Rig & Mask Authoring Plan (D-038)

_The practical Tier-1 plan that must be completed before any scalable MVP shop-item
generation. **D-038 locks the plan, deliverables, formats, naming, gates and production
order** — it produces no base, no masks, no assets, no code, no tooling._
_Builds on: D-032 (Master = sole geometry), D-033 (base = manual paint-over, no AI),
D-034 (AI for item overlays only), D-035 (`C2_LAYER_Z` canonical), D-036 (MVP taxonomy),
D-037 (QA gates + mask rules), and the 164B / 164B.2 / 164B.3 base specs._
_`AVATAR_V2` stays OFF. No runtime/DB/RPC/asset change results from this document._

---

## Hard rules (carried into Tier-1)
- **No AI generation/inpaint may define the base rig geometry** (D-033). Master = sole
  geometry (D-032).
- **Exact mask pixel assets must wait until the produced base rig exists** — mask *rules*
  are locked (D-037), pixels are derived from the real rig silhouette + revised eye box.
- **No shop-item batch may start** before ALL of: base rig + anchor template + MVP masks +
  style kit + reference composites + QA thresholds exist.

## Required Tier-1 sequence

### 1. Base rig — `body-neutral-medium-v1`  *(BLOCKING, first)*
- **Method:** manual paint-over from `Northstar Master.png` (D-032/D-033); preserve pose,
  proportions, head/body ratio, hair silhouette, face, eyes, style; full-canvas transparent;
  no baked face/eyes/hair/blush (composition-ready).
- **Format/res/naming:** master 1024×1536 → served WebP 512×768 · `body-neutral-medium-v1.webp`.
- **Gate:** **PASS the 164B.3 base-coherence worksheet** (proportions §2 + D-032/geometry §5
  are non-negotiable).
- **Mode:** manual-only. Produced in 164B per the 164B.2 spec; it is the blocking datum.
- **Production method (D-039, 164I):** primary = outsource to a professional illustrator
  against a locked brief; in-house manual paint-over = budget fallback; vector = geometry
  scaffold only. See `docs/164i-base-rig-production-execution-plan.md`.

### 2. Anchor template
- **Purpose:** the single geometry source all masks derive from.
- **Contents:** head anchor **(512, 320) r≈192**; **revised (enlarged) eye box** (centre + w/h,
  measured from the produced base); shoulder/back anchor (shoulder line); face oval region;
  crown/headwear region.
- **Format/naming:** JSON coordinates + a visual overlay PNG · `avatar-anchor-template-v1.json`
  (+ overlay). Coordinate system: 1024×1536, origin top-left, legacy 160×240 × 6.4.
- **Dependency:** the produced base rig. **Mode:** semi (measured + documented).
- **Rule:** masks reference anchors; if anchors change, masks regenerate.

### 3. Style kit
- **Palette** (sampled from Master: medium skin ramp, hair brown tokens, warm anime palette;
  `RARITY_COLORS` for shop *frames* only); **line weight** (match Master, heavier for 32px);
  **cel-shading** (flat 2–3-stop, single light direction, no gradients/3D); **lighting
  direction** (Master's); **detail density** (readable @48px, no 32px aliasing);
  **forbidden style drift** (gradients, photoreal, off-palette, mismatched line weight,
  different light); **≥2–3 exemplars per MVP slot**.
- **Format/naming:** `style-kit-v1.md` + palette swatch. **Mode:** manual. **Gate:** approval.

### 4. MVP slot masks
- **Slots:** `aura`, `back`, `headwear`, `face/masks`, `eyes/glasses`.
- **Format:** alpha PNG **1024×1536** · `mask-{slot}-v1.png` — **QA/build artifacts, NOT
  runtime avatar assets**.
- **Derived from anchors** (§2) per the D-037 mask rules: aura generous-behind · back generous
  shoulder-anchored · headwear moderate head-anchored (eyes legible) · face tight face-anchored
  (eyes legible) · eyes tight eye-anchored (approved eye-overlap exception).
- **Dependency:** base rig + anchor template. **Mode:** manual (overflow test automated later).

### 5. Reference composites
- **≥ 2 per MVP slot**, rendered over the rig at the slot z.
- **Used as:** style goldens · composite goldens · the **eye-legibility calibration set**.
- **PASS:** correct composite/z-order, mask-compliant, style-matched, eyes legible (non-eyes
  slots), within weight. **NO-GO:** geometry/skin bleed, mask overflow, style drift, eye
  occlusion (non-eyes), over budget.
- **Format/naming:** `ref-{slot}-{item}-v1.webp`. **Dependency:** 1,2,3,4. **Mode:** semi.

### 6. QA checklist / threshold config
- **Calibrates:** eye-legibility threshold · feather tolerances (per slot) · per-item weight
  thresholds · decoded-memory / concurrent-layer cap · mask-overflow thresholds.
- **Format/naming:** `qa-thresholds-v1.json` + checklist. **Dependency:** reference composites.
- **Mode:** manual (set) + automated (run).

## Conditional / optional
- **`torso` mask = CONDITIONAL** — only once the base body + a torso occlusion mask exist and
  pass QA (must fully occlude the base tee; leave forearms/hands to base).
- **`neck` mask = OPTIONAL / low priority** — small neck/upper-chest band; low risk.

## Production order
```
1. BASE RIG (body-neutral-medium) ── manual paint-over, PASS 164B.3   [BLOCKING, first]
2. ANCHOR TEMPLATE  ── derived from base (incl. revised eye box)
3. STYLE KIT        ── start in parallel (sampled from Master), finalize on base
4. MVP MASKS (aura, back, headwear, face, eyes) ── need base + anchors
5. REFERENCE COMPOSITES ── need base + masks + style kit (+ rig layers)
6. QA CHECKLIST / THRESHOLD CONFIG ── calibrated from the composites
   ── only then: AI shop-item batches may begin (D-034/D-037)
```
- **Can wait:** `torso` mask, `neck` mask.
- **Must NOT start yet:** any AI shop-item batch; torso/neck/deferred slots; mask pixels
  before the base exists.

## Remaining risks / missing evidence
1. **Base prototype not produced** — the gating item; blocks anchors/masks/composites/QA.
2. **Revised eye-box dimensions** — unavailable until the base exists.
3. **Decoded-memory headroom** — rig ~9 MB + ~5 cosmetic layers ×1.5 MB may exceed the 15 MB
   D-019 budget → needs a concurrent-layer cap / atlas decision (calibrate in QA).
4. **Eye-legibility threshold** — needs calibration from reference composites at 32/48px.
5. **Style/content classifier** — not built; MVP relies on human review (D-037 §6).
6. **`shop_items.layer_order` semantics** — unresolved (open from D-035).

> D-038 locks the **plan + deliverable formats/naming/gates/order only**. It produces no
> base, no masks, no assets, no code, no tooling; the base rig is the blocking first step.
