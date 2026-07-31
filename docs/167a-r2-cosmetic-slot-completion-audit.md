# 167A — Avatar R2 cosmetic-slot completion audit: the remaining slots (neck / torso / body), D-082

**Status:** `OWNER_DECIDED_B — IMPLEMENTED` (2026-07-31) — was `DESIGN_READY_AWAITING_OWNER_DECISION`. The
audit itself is unchanged; the decision is recorded in §8 and shipped as **D-083** (see
`docs/project-state.md`), which closes the §6 defect. Option A (an R2-specific torso asset) remains open
art work.
**Type:** read-only audit + measurement. **The audit itself implemented nothing** — it changed no runtime,
asset, manifest, test, golden, migration or workflow file, and §1–§7 + §9 below describe that read-only
work exactly as it was carried out. The decision it asked for (option B) was taken and **subsequently
implemented in a separate PR — D-083, PR #134, merged 2026-07-31** (see §8).
**Related:** D-079 (headwear slice), D-080 (eyes slice), D-081 (face slice), D-071 (raster debt accepted),
D-077 (shop uniform C2), D-078 (pilot Wave 1 started), D-034 (AI allowed for shop/cosmetic overlays),
D-033 (AI rejected for base/rig layers).
**Pilot status (unchanged):** `PILOT_WAVE_1_IN_PROGRESS`. **`AVATAR_R2 = false`** (per-browser opt-in only).

---

## 1. Scope & goal

The R2 full-cosmetic-support track wired one slot per slice: aura/back (already supported), **headwear**
(D-079), **eyes** (D-080), **face** (D-081). The recorded plan for the remainder was
**`neck → torso → body`**.

This audit establishes, **read-only**, what those three remaining slices actually consist of — what the
live catalog contains, and whether the assets can be re-seated onto the R2 figure by the same
version-controlled wrapper-transform mechanism the previous three slices used, or whether they need
new art.

---

## 2. Live-catalog preflight (read-only, verified against production `shop_items`)

Read-only `select` against the live project (`den-seje-app`, `ACTIVE_HEALTHY`). No write, no migration, no
schema change. There is **no active/enabled/status column**, so no active-status is claimed — these are all
rows the catalog serves.

| slot_type | items | layer_order | R2 status |
|---|---|---|---|
| `aura` | 4 | −2 | wired (behind figure, unchanged) |
| `back` | 3 | −1 | wired (behind figure, unchanged) |
| `headwear` | 5 | 5 | wired — D-079 (`DIRECT_REUSE`) |
| `face` | 3 | 6 | wired — D-081 (`REUSE_WITH_R2_TRANSFORM`, per item) |
| `eyes` | 1 | 7 | wired — D-080 (`REUSE_WITH_R2_TRANSFORM`) |
| **`neck`** | **0** | — | **no catalog items exist** |
| **`torso`** | **1** | 2 | **this audit** |
| **`body`** | **0** | — | **no catalog items exist** |

**The decisive finding: `neck` and `body` have no items in the live catalog at all.** There is nothing to
wire, nothing to re-seat, and nothing to golden for either slot. A "neck slice" and a "body slice" would
add gate configuration and tests for zero user-visible content.

The single `torso` item is:

| field | value |
|---|---|
| id | `armor-knight` |
| name | Ridderdragt |
| slot_type | `torso` (canonical) |
| image_url | `/assets/avatar/shirt/armor-knight.svg` |
| layer_order | 2 |
| price | 300 coins |

### 2.1 Correction to the recorded plan

The plan `neck → torso → body` (ROADMAP, D-079…D-081) **is not executable as written**. Corrected picture:

- **`neck`** — `NO_CATALOG_ITEMS`: nothing to slice.
- **`torso`** — the only remaining slot with real content (1 item). Analysed in §3–§5.
- **`body`** — `NO_CATALOG_ITEMS`: nothing to slice. (It was additionally classified
  `BLOCKED_BY_RUNTIME_CHANGE` in D-079, since a body item replaces the base rather than overlaying it —
  that classification is unchanged and now also moot for lack of items.)

So the track is **already complete for every slot the catalog actually serves, except `torso`.**

---

## 3. Method — torso geometry measurement (read-only)

Both figures were measured in the **same coordinate space**: the C2 authoring canvas `viewBox 0 0 160 240`,
which every cosmetic SVG is drawn in.

- **R2 figure:** the tracked base raster `assets/avatar-r2/base/body-neutral-medium-v1.png` (512×768) was
  alpha-decoded and normalized to the 160×240 canvas (scale 0.3125). Solid silhouette = `alpha >= 128`
  (the anti-aliasing ramp is excluded, consistent with the D-071 render-scale audit). This is the only R2
  base that exists — R2 eligibility is neutral + medium.
- **C2 figure:** geometry read directly from `assets/avatar/base/body-neutral-medium-c2.svg` (the figure
  `armor-knight.svg` was authored against).
- **The item:** geometry read directly from `assets/avatar/shirt/armor-knight.svg`.

The measurement scripts were **scratch-only** (run from the session scratchpad, nothing written into the
repo, no asset touched, no `tools/avatar/` addition).

### 3.1 R2 silhouette (C2 canvas units)

| landmark | measurement |
|---|---|
| overall bbox | x 40.3–118.4, y 5.6–235.9 |
| neck (narrowest) | y ≈ 83, width 21.9 (x 69.4–90.9) |
| shoulders begin | y ≈ 87 (width 38.8) |
| torso band y 92–160 | x 48.8–110.6 — **one connected run: the arms lie against the body** |
| leg split (crotch) | y ≈ 160 |
| legs at y 178 | x 57.5–101.3 (width 43.8) |

Silhouette edges at the heights the armour paints:

| y | 92 | 106 | 119 | 134 | 150 | 160 | 171 | 178 |
|---|---|---|---|---|---|---|---|---|
| left x | 55.6 | 52.2 | 49.7 | 49.1 | 48.8 | 48.8 | 58.1 | 57.5 |
| right x | 104.4 | 107.8 | 110.3 | 110.0 | 109.7 | 110.6 | 102.2 | 101.3 |
| width | 48.8 | 55.6 | 60.6 | 60.9 | 60.9 | 61.9 | 44.1 | 43.8 |

### 3.2 C2 figure and the item

| element | geometry (C2 canvas) |
|---|---|
| C2 left arm | x 14–40, y 96–168 |
| C2 right arm | x 120–146, y 96–168 |
| C2 hands | cx 27 / cx 133, cy 174, r 9 |
| C2 torso tee | shoulders y ≈ 92 → waist hem y ≈ 168 |
| armour chest plate | x 40–120 (width 80), y 92–180 |
| armour belt | x 40–120, y 174–182 |
| armour pauldrons | cx 29 / 131, cy 106, rx 20 ry 15 → x 9–49 / 111–151 |
| armour arm plates | x 12–34 / 126–148, y 119–171 |
| armour elbow guards | cx 23 / 137, cy 150 |

`armor-knight.svg` tracks the **C2 arm pose precisely** (arm plates x 12–34 / 126–148 against C2 arms
x 14–40 / 120–146). The C2 figure holds its arms **out, clear of the torso**; the R2 Master figure holds
them **down against the body**. That is a pose difference, not an offset.

---

## 4. Alpha probe — does the R2 figure have pixels where the armour paints?

Solid coverage (`alpha >= 128`) of the R2 base raster inside the item's own rectangles:

| region (C2 rect) | R2 solid coverage |
|---|---|
| armour left arm plate — x 12–34, y 119–171 | **0.0 % — fully transparent (0 px)** |
| armour right arm plate — x 126–148, y 119–171 | **0.0 % — fully transparent (0 px)** |
| armour left pauldron — x 9–49, y 91–121 | **0.0 % — fully transparent (0 px)** |
| armour right pauldron — x 111–151, y 91–121 | 0.0 % — 3 px (grazing edge only) |
| armour left elbow guard — x 13–33, y 144–156 | **0.0 % — fully transparent (0 px)** |
| armour right elbow guard — x 127–147, y 144–156 | **0.0 % — fully transparent (0 px)** |
| C2 left hand disc — x 18–36, y 165–183 | 0.0 % — fully transparent |
| C2 right hand disc — x 124–142, y 165–183 | 0.0 % — fully transparent |
| armour chest plate — x 40–120, y 92–180 | 70.1 % (50,633 px) |
| armour belt — x 40–120, y 174–182 | 46.5 % (2,977 px) |
| *reference:* R2 torso band — x 48–111, y 92–160 | 94.7 % (41,504 px) |

**Every arm-side element of the armour — both arm plates, both elbow guards, both pauldrons — lands on
empty canvas on the R2 figure.** Rendered as-is, the R2 avatar would show two detached slabs of metal
floating in mid-air on either side of the body.

---

## 5. Classification: `NEEDS_R2_SPECIFIC_ASSET` (confirmed by measurement)

Unlike eyes (D-080) and masks (D-081) — small head-anchored overlays a vertical re-seat could fix — the
torso item requires **two mutually exclusive transforms**. Taking a uniform horizontal scale about the
canvas centre (x = 80), measured at y = 134:

- To seat the **arm plates** on the R2 arms (outer edge x 12 → R2 edge x 49.1):
  scale ≈ (80 − 49.1) / (80 − 12) = **0.46**
- To fit the **chest plate** to the R2 torso (half-width 40 → R2 half-width 30.5):
  scale ≈ 30.5 / 40 = **0.76**

Neither value works for the other element:

- **At 0.46** the chest plate shrinks to x 61.6–98.4 (width 36.8) on a torso 60.9 wide → **≈ 12 units of
  bare skin exposed down each side** of the armour.
- **At 0.76** the pauldrons reach x 26.0 / 134.0 and the arm plates sit at x 28.3–45.0 / 115.0–131.7 —
  **up to ≈ 21 units outside the silhouette**, i.e. still floating.

Vertically the mismatch is independent and equally structural: the armour's belt (y 174–182) sits **below
the R2 crotch (y ≈ 160)**, and at y 178 the belt (x 40–120, width 80) overhangs the R2 legs (width 43.8)
by **≈ 18 units per side**.

**Conclusion: `armor-knight` cannot be re-seated onto the R2 figure by any wrapper transform.** The
mechanism that carried slices 1–3 does not extend to this slot. A torso cosmetic on R2 needs art drawn
for the R2 silhouette and arm pose. This confirms the original D-079 classification
(`torso: NEEDS_R2_SPECIFIC_ASSET`) as measured fact rather than estimate.

---

## 6. Live pilot defect found while auditing: silent item loss

`composeR2Layers` (`js/avatar-render-c2.js`) gates cosmetics with
`.filter(... isR2SupportedCosmeticSlot(c.slot))`. `torso` is not in `R2_SUPPORTED_COSMETIC_SLOTS`, so an
equipped Ridderdragt is **dropped silently**: no layer, no warning, no fallback.

Consequence for the pilot that is **currently running** (D-078, Wave 1, 1 participant): a student who
bought the Ridderdragt for 300 coins and equipped it sees **the armour on C2 and nothing at all on R2**.
The purchase is not lost in the database (`equipped_slots` is untouched and opting out restores the
armour), but the avatar silently contradicts the shop and the student's inventory.

This is **not** a raster-fidelity issue (D-071) and **not** covered by the shop-preview fix (D-077, which
made the shop grid uniformly C2). It is the first case where the R2 slot-gate is visible to a user as
missing content rather than as an unstyled slot, and it will apply to every future torso item too.

Severity in the D-072 vocabulary: **MAJOR** (a paid item does not render; no data loss, opt-out recovers).

---

## 7. Options

| # | Option | Cost | Assessment |
|---|---|---|---|
| **A** | **Produce an R2-specific torso asset** — re-author the Ridderdragt on the R2 silhouette/arm pose, wire `torso` as slice 4 with its own z + transform. | Art production + visual sign-off, then a runtime PR. AI is **permitted** here (D-034: shop/cosmetic overlays; D-033 only rejects base/rig art). | The only option that puts armour on the R2 figure. Delivers one item. Note the arms are **baked into the R2 base raster**, so the asset must paint over them convincingly at the D-071 render sizes (avatar 180×270 down to quiz 52×78). |
| **B** | **Force C2 for the whole avatar when a torso item is equipped** — extend the existing `forceC2` path; no new art. | Small runtime PR + tests. | Removes the silent loss: the student always sees the armour they paid for, on the proven C2 anchors. Cost: those students see no R2 at all while equipped. Consistent with D-077's "never show a half-dressed figure" reasoning. |
| **C** | **Defer, and document the gap** — leave the gate as is; record that R2 hides torso items. | Docs only. | Cheapest, but knowingly leaves a MAJOR item-visibility defect in a running pilot. |
| **D** | **Retire or re-slot the single torso item** — e.g. withdraw Ridderdragt from the catalog. | Catalog/migration change. | Not recommended: it is an owned, paid item; withdrawing it is a product regression and touches purchase history. |

### Recommendation

**B now, A later if the owner wants armour on R2.** Reasoning:

1. B closes the live defect for the running pilot **without art production and without new asset risk**,
   using a mechanism (`forceC2`) that already exists, is already tested, and already ships.
2. A is a real feature but it is **art work first** — it cannot be scheduled as a wiring slice, and it
   should not block the defect fix.
3. **`neck` and `body` need no slice at all** — they should be closed as `NO_CATALOG_ITEMS` rather than
   carried on the roadmap as pending work.

Under this recommendation the full-cosmetic-support track closes as: aura/back/headwear/eyes/face **wired**;
torso **handled by B, upgradeable by A**; neck/body **closed, no content**.

---

## 8. Owner decision gate

**OWNER DECISION (2026-07-31): option B — force whole-avatar C2 while a torso item is equipped.**
Option A (an R2-specific torso asset) is **not** rejected, but is deferred as separate art work; `neck` and
`body` are closed as `NO_CATALOG_ITEMS`. No code change was part of the audit itself: this section is the
record of the choice, and B was implemented in its own runtime PR.

**IMPLEMENTED AND MERGED (2026-07-31) as D-083, PR #134** — `composeR2Layers` refuses the R2 stack for the
WHOLE avatar when any equipped cosmetic sits in a slot the stack cannot render (`r2RequiresC2Fallback`), so
the complete C2 path renders with the item visible; the fallback is reported with its own observability
reason `unsupported_cosmetic_equipped`. Generic by slot, so `neck`/`body` are covered too if they ever gain
items. The §6 defect is closed. See `docs/project-state.md` (D-083).

The decision gate is therefore **closed**. It held for the implementation as shipped, and holds for option
A should it be taken up later:

- `AVATAR_R2` stayed `false` — none of these options is an activation or a flag-flip.
- Buy / ownership / `equipped_slots` / equip / unequip stayed unchanged (A and B are render-side only).
- The shop stays uniform C2 (D-077).
- The whole-stack-or-C2 contract and the atomic preload gate (D-062) stayed intact.

---

## 9. Boundaries of this audit

Read-only. Verified against the live catalog and the tracked assets; **nothing was executed, changed or
produced.** No runtime, asset, `R2_MANIFEST`, golden, test, migration, RLS, Edge Function or workflow
change; no image generation; no `tools/avatar/` addition (the measurement scripts stayed in the session
scratchpad); Northstar Master untouched; the pilot log and pilot status unchanged; no user onboarded; no
student identifier recorded anywhere in this document. D-071…D-081 are **not** rewritten.
