# 167A — R2 torso asset: production plan + measured occlusion-mask spec (option A of D-082), D-084

**Status:** `DESIGN_READY_AWAITING_OWNER_DECISION`.
**Type:** measurement + specification. **No asset is produced here.** No runtime/asset/manifest/test/
golden/migration/workflow change; no image generation; no catalog change.
**Related:** D-082 (completion audit — measured that reuse is impossible), D-083 (the shipped
whole-avatar C2 fallback that currently protects the item), D-034 (AI allowed for shop/cosmetic
overlays only), D-037 (QA gate framework — **torso mask is CONDITIONAL**), D-040 (torso clothing
deferred pending occlusion masks), D-027 (full-canvas transparent overlay), D-035 (canonical
`C2_LAYER_Z`), D-071 (render-scale artefact debt), D-057/D-058/D-061 (base decomposition + alpha-fringe
constraints).
**Pilot status (unchanged):** `PILOT_WAVE_1_IN_PROGRESS`. **`AVATAR_R2 = false`** (per-browser opt-in only).

---

## 1. What option A is, and why it is not a wiring slice

D-082 established by measurement that the one live torso item (`armor-knight`, "Ridderdragt", 300 coins)
**cannot** be re-seated onto the R2 figure by the wrapper-transform mechanism that carried headwear
(D-079), eyes (D-080) and face (D-081): the item is authored on the C2 wide-arm pose, the R2 figure holds
its arms down against the body, and the two scales required (0.46 to seat the arm plates, 0.76 to fit the
chest) are mutually exclusive. Option B (D-083) closed the resulting *defect* — the item never disappears
— but it does not put armour on the R2 figure. **Only new art does. That is option A.**

Option A is **Tier-1 + Tier-2 work** in the 164D pipeline, not a config change:

| step | what | who/how | gate |
|---|---|---|---|
| **A1** | torso **occlusion mask** derived from the runtime R2 base — **BUILT 2026-07-31 (D-085), owner review pending**; tool `npm run avatar:r2-torso-mask`, template `tools/avatar/fixtures/r2-torso/`, record `docs/167a-r2-torso-occlusion-mask-review.md` | deterministic measurement, **no AI** (mirrors D-041/164K for accessory slots) | owner accepts the mask region |
| **A2** | the torso **overlay artwork** inside that mask | **AI permitted** (D-034/D-040 Tier 2: isolated slot overlays only) | D-037 automated gates + human style/safety review + owner visual sign-off |
| **A3** | **wiring PR** — `torso` into `R2_SUPPORTED_COSMETIC_SLOTS`, z + per-item transform, unit + Playwright tests, goldens | code | tests green, owner sign-off |

### 1.1 The blocking constraint — a locked decision stands in the way

`docs/164d-shop-pipeline.md` **D-037**: the torso mask is **CONDITIONAL** — permitted "only once the base
body **+ a `torso` occlusion mask** exist and pass QA (clothing-replacement; **must fully occlude the base
tee, leave forearms/hands to base**)". **D-040** repeats it: torso/bottom/shoes clothing are additive later
because they "need stronger occlusion masks".

So A1 is not optional groundwork — it is the condition D-037 names. **A2 cannot be QA-approved before A1
exists**, and activating the torso slot at all requires an explicit owner decision to discharge the D-037
condition. That decision is requested in §7.

---

## 2. Measurement basis — and a correction to D-082's basis

**D-082 measured `body-neutral-medium-v1.png`.** That asset is, per `R2_MANIFEST` in `js/avatar-layers.js`,
the **historical/rollback** Phase-1 baked base — *"no longer referenced (D-018)"*. The **runtime** base is
`base: { "neutral-medium": 2 }` → **`body-neutral-medium-v2.webp`** (67,174 B), the **decomposed D-057 base
with no face/eyes/hair**.

Everything in §3–§5 below is therefore measured on **v2.webp**, decoded with the repo's vendored
`tools/avatar/vendor/dwebp.exe`; the measurement scripts were **scratchpad-only — nothing was written into
the repo and no `tools/avatar/` addition was made** (same discipline as D-082).

**What changes versus D-082's numbers, and what does not:**

- **Unchanged conclusion:** the R2 figure holds its arms **down alongside the body**; `armor-knight`'s
  arm-side elements have no figure beneath them. Option A remains necessary.
- **Changed detail:** on v1 the torso band read as *one* connected silhouette run. On **v2 the arms are
  separated from the torso by a 4–6 px seam** (native), i.e. they are adjacent but distinct — a real edge
  the mask can follow. D-082's "one connected run" observation is an artefact of the baked v1 asset and
  should not be used for mask work.
- **Changed frame:** v2 has **no hair/head raster**, so its silhouette bbox starts far lower than v1's.
  Head-relative measurements from D-082 do not transfer.

---

## 3. Measured geometry of the runtime R2 base

Solid silhouette = `alpha >= 128` (AA ramp excluded, the D-071 convention). Native = the served
**512×768**; C2 = the authoring canvas **160×240** every cosmetic SVG uses (scale 0.3125); Master =
**1024×1536** (native ×2), the canvas D-027/D-037 require overlays to be authored on.

| landmark | native y | C2 y | Master y | how it was identified |
|---|---|---|---|---|
| silhouette top (no hair on v2) | 101 | 31.6 | 202 | first solid row |
| garment (tee) shoulder line | 280 | 87.5 | 560 | first row whose centre reads garment |
| sleeve end — bare skin appears outboard while the centre is still garment | 357 | 111.6 | 714 | outer band flips to skin |
| **tee hem** — centre flips garment → trousers | **451** (450 garment / 453 trousers) | **141.0** | **902** | centre class transition |
| crotch / leg split | 500 | 156.3 | 1000 | stable two-run gap from y 500 |
| fingertips — arms/hands end | ~527 | ~164.7 | ~1054 | outer arm runs vanish by y 528 |
| silhouette bottom | 755 | 235.9 | 1510 | last solid row |

Horizontal extents (native x; C2 in brackets):

| native y | C2 y | left edge | right edge | width | structure |
|---|---|---|---|---|---|
| 285 | 89.1 | 186 (58.1) | 328 (102.5) | 143 (44.7) | single run (shoulders) |
| 325 | 101.6 | 170 (53.1) | 342 (106.9) | 173 (54.1) | single run |
| 357 | 111.6 | 167 (52.2) | 349 (109.1) | 183 (57.2) | arm ‖ torso ‖ arm |
| 397 | 124.1 | 162 (50.6) | 348 (108.8) | 187 (58.4) | arm ‖ torso ‖ arm |
| 445 | 139.1 | 158 (49.4) | 351 (109.7) | 194 (60.6) | arm ‖ torso ‖ arm |
| 493 | 154.1 | 156 (48.8) | 354 (110.6) | 199 (62.2) | arm ‖ torso ‖ arm |
| 532 | 166.3 | 186 (58.1) | 321 (100.3) | 136 (42.5) | two legs, arms ended |

**Arm/torso seam columns** (the inner edge of each arm), sampled down the torso band:

| native y | left seam x | right seam x | C2 left | C2 right |
|---|---|---|---|---|
| 355 | 193 | 316 | 60.3 | 98.8 |
| 375 | 191 | 318 | 59.7 | 99.4 |
| 395 | 190 | 319 | 59.4 | 99.7 |
| 415 | 188 | 322 | 58.8 | 100.6 |
| 435 | 184 | 318 | 57.5 | 99.4 |
| 456 | 187 | 319 | 58.4 | 99.7 |
| 476 | 185 | 321 | 57.8 | 100.3 |

The seam is stable at **x ≈ 184–193 (left)** and **x ≈ 316–322 (right)** native — i.e. the torso column is
roughly **x 186–320 native (C2 58.1–100.0)** through the whole garment band.

### 3.1 The decisive fact for the mask

**The arms and hands run alongside the hips down to native y ≈ 527 — well below the tee hem (451) and below
the crotch (500).** D-037 requires forearms/hands to be **left to the base**. So the torso mask is *not* a
rectangle over the trunk: below the sleeve end it must be **pinched inwards to the seam columns**, leaving
the outboard arm bands untouched, and it must stop before the fingertips.

---

## 4. The torso occlusion mask (specification)

Authored on the **Master canvas 1024×1536**, delivered as a 1-bit/alpha mask, downscaled with the asset to
512×768. Coordinates below are Master (native ×2).

**Allowed draw region — the union of:**

1. **Shoulder/chest/trunk band:** from **y 560** (garment shoulder line) down to **y 902** (tee hem),
   bounded left/right by the silhouette edge **plus a 4 px bleed** (Master) to guarantee full occlusion of
   the base tee at the outline.
2. **Sleeve caps:** between **y 560 and y 714** (sleeve end) the region may extend outboard to the full
   silhouette edge — this is where the base's own short sleeve sits and must be covered.
3. **Optional hem extension (tunic/skirt-of-armour):** below **y 902** the region may extend to **y 1000**
   (crotch) but **only within the seam columns x 372–640** (Master; = native 186–320). This lets an item
   read as a longer garment without touching the arms.

**Forbidden — 0 opaque px, hard fail:**

- **Outboard of the seam columns below y 714** (i.e. the bare forearms and hands, down to y ≈ 1054).
- **Anything above y 560** — neck, head, and the (absent-in-v2) face/hair layers own that space.
- **Below y 1000** — legs and trousers; a torso item must never become a bottom.
- Any pixel where the base silhouette is transparent, i.e. **outside the figure** — no floating geometry.
  This is the exact failure mode D-082 measured on `armor-knight` (arm plates on empty canvas).

**Occlusion requirement (D-037, "clothing replacement"):** within region 1+2 the item must be **fully
opaque** (alpha ≥ 250) — the base tee must not read through. A partially transparent torso item is a
rejection, not a style choice.

---

## 5. Asset spec

| property | value | source |
|---|---|---|
| authoring canvas | 1024×1536, transparent, full-canvas overlay (no crop/trim, no per-item offset) | D-027/D-037 |
| served | 512×768 WebP | R2 asset convention, `R2_SERVED` |
| naming | `armor-knight-r2-v1.webp` under `assets/avatar-r2/torso/` (asset-basename keyed, as the transform tables are) | ADR-163D naming + D-079/D-080 basename convention |
| budget | ≤ ~50 KB served, within the D-019 total stack budget | D-037 |
| alpha | clean; **no light halo/fringe** — encode with `-lossless -exact`, verify the alpha plane, and judge the result **at real render scale on the actual surface**, not on the full-res composite | D-058/D-061 lessons |
| z | `R2_COSMETIC_Z.torso` — to be fixed in the A3 wiring PR; must sit **above the base (0) and below the hair (40)**; it is a body layer, not a head layer | D-035 z-model |
| render scales it must read at | avatar 180×270 · hub 112×168 · quiz 72×108 (down to 52×78) | D-071 |

---

## 6. QA gates for A2 (adapted from D-037 §10)

**Automated — hard fail → reject:**

1. 0 opaque px outside the §4 mask (the arm/hand exclusion is the critical one).
2. 0 opaque px outside the base silhouette (no floating geometry).
3. Full occlusion: no base-tee pixel visible through region 1+2 (alpha ≥ 250 there).
4. Transparent background, clean alpha, no halo — measured, not eyeballed.
5. Dimensions/format/budget; unique id; checksum recorded in the manifest.
6. Composite smoke test at all four render scales — the figure still reads as one character.

**Human:** style conformance to the Northstar Master; **content safety** (kids platform); and an explicit
**owner visual sign-off** on the composite, following the Gate-3 pattern used for the face/eyes/hair layers.

---

## 7. Owner decisions required before any production

1. **Discharge the D-037 condition?** Activating a torso mask at all is a locked-decision change
   (D-037 conditional, D-040 deferred). Producing the mask (A1) is measurement and can proceed without it;
   **A2/A3 cannot.**
2. **Scope of the artwork:** re-author *only* `armor-knight` as an R2-native item, or treat this as the
   first item of an R2 torso slot that later takes more items? The mask is the same either way; the brief
   and the catalog impact are not.
3. **Catalog model:** one row with a per-render-path asset (C2 svg + R2 webp), or a separate R2 item id?
   This decides whether the wiring PR touches `shop_items` at all. **Recommendation: per-render-path asset
   on the same row** — the student owns "Ridderdragt", not two products; purchase history stays intact.

Until 1 is answered, **D-083's whole-avatar C2 fallback remains the correct and shipped behaviour** — the
student keeps seeing the armour they paid for.

---

## 8. Boundaries of this document

Specification only; **nothing was produced, generated, or changed.** No runtime, asset, `R2_MANIFEST`,
golden, test, migration, RLS, Edge Function or workflow change; no image generation; no `tools/avatar/`
addition (the measurement scripts stayed in the session scratchpad); Northstar Master untouched;
**`AVATAR_R2` stays `false`**; **pilot status stays `PILOT_WAVE_1_IN_PROGRESS`**; participant log
unchanged; no student identifier recorded. D-071…D-083 are **not** rewritten.
