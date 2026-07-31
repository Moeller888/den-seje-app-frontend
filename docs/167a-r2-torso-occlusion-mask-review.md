# 167A — R2 torso occlusion mask + slot template (A1 of option A): build & review record, D-085

**Status:** `A1_BUILT — OWNER_VISUAL_REVIEW_REQUIRED`.
**Type:** deterministic, NON-AI tooling + tracked mask template. **No artwork was produced. No slot was
activated.** `D-037` remains **CONDITIONAL** — this document does not discharge it.
**Plan of record:** `docs/167a-r2-torso-asset-production-plan.md` (D-084).
**Related:** D-082 (reuse measured impossible), D-083 (whole-avatar C2 fallback — **still the active
protection**), D-034 (AI permitted for item artwork only), D-040 (torso deferred pending occlusion
masks), D-071 (render-scale convention `alpha >= 128`), D-057/D-058/D-061 (base decomposition + alpha
fringe).
**Pilot status (unchanged):** `PILOT_WAVE_1_IN_PROGRESS`. **`AVATAR_R2 = false`.**

---

## 1. What was built

`tools/avatar/build-r2-torso-occlusion-mask.mjs` — deterministic, no AI, no npm dependency, no new
binary. It decodes the runtime R2 base with the repo's vendored `dwebp`, re-measures the D-084 landmarks
from that base, asserts them against the locked values, derives three masks, runs 28 gates, and writes a
spec. Default mode is **read-only verify**; writing requires `--write`.

```
npm run avatar:r2-torso-mask            # verify (read-only, writes nothing)
npm run avatar:r2-torso-mask -- --write # write the tracked template + review artifacts
```

### 1.1 Input (pinned)

| field | value |
|---|---|
| path | `assets/avatar-r2/base/body-neutral-medium-v2.webp` |
| SHA-256 | `28765eea616dd92beb73273c67d6d603cabd9f92af8057d2d9a5fe50c01032f9` |
| size | 67,174 B · 512×768 |
| why this file | it is the **runtime** base (`R2_MANIFEST` `base: {"neutral-medium": 2}`), the decomposed D-057 asset |

The Phase-1 baked **`body-neutral-medium-v1.png` is not an input** — `R2_MANIFEST` records it as the
historical/rollback asset. A SHA mismatch on the input is a hard failure, not a silent re-fit.

### 1.2 Method

Decode → **nearest-neighbour ×2** into the Master frame 1024×1536 (exact, lossless) → silhouette
`alpha >= 128` (D-071 convention; the AA ramp is excluded) → landmark re-measurement → mask derivation →
gates. Every step is a pure function of the input bytes.

---

## 2. Landmarks: locked (D-084) vs re-measured (this run)

| landmark | locked | measured | delta | tolerance |
|---|---|---|---|---|
| garment shoulder line | 560 | 562 | 2 | 24 |
| sleeve end | 714 | 714 | 0 | 24 |
| tee hem | 902 | 904 | 2 | 24 |
| crotch | 1000 | 1000 | 0 | 24 |
| fingertips | 1054 | 1057 | 3 | 24 |
| corridor left | 372 | 388 | 16 | 24 |
| corridor right | 640 | 627 | 13 | 24 |

**D-084's geometry is confirmed on the runtime base.** The masks are cut on the **locked** values (so the
template is stable), while the measured values are asserted every run — a future base change that moves a
landmark by more than 24 Master px fails the build instead of silently re-fitting the mask.

Two measurement rules had to be made robust, and both are worth recording:

- **The corridor is a median, not a min/max.** On a handful of rows the arm/torso seam carries no alpha
  gap, so a naive "torso run" swallows an arm and the corridor inflates to x 703. The per-row span falls
  back to the median corridor whenever a row is more than 35 % wider than the median.
- **The crotch is found by two runs whose midpoints are inside the corridor.** The first attempt keyed on
  "two runs anywhere", which the arms satisfy immediately below the hem and put the crotch at y 905.

---

## 3. The three masks

| file | meaning | px | bbox (Master) | SHA-256 |
|---|---|---|---|---|
| `torso-occlusion-hard-v1.png` | where a torso replacement **must** be fully opaque | 96,182 | x 328–697, y 560–901 | `761cde77929e45bac1a48cb21ab645524525ed41836d52b2a9ddcb57fd019eba` |
| `torso-edit-allowed-v1.png` | hard + ≤4 px blend + the optional hem extension | 122,344 | x 328–699, y 560–999 | `608eced0c346360071cb6d8c4b3d9e74cacd65d4542ae684b0e84c6d48432318` |
| `torso-protect-v1.png` | the exact complement of edit — the anatomy/identity lock for A2 | 1,450,520 | full canvas | `623379959b3fe60e1f1b6d7d0def5b5011cff8a276b12c05b913c9a69b37fd98` |

Spec: `tools/avatar/fixtures/r2-torso/torso-mask-spec-v1.json`. Optional **hem extension**: 25,468 px,
x 372–639, y 902–999 (corridor only, clipped to the silhouette).

All three are 1024×1536, binary alpha (0 or 255), white RGB, `IHDR`/`IDAT`/`IEND` only — no metadata, no
timestamp, so the bytes depend solely on the pixels. **They live under `tools/avatar/fixtures/r2-torso/`,
not under `assets/`: this is a production template, not a runtime asset.**

### 3.1 Band rules actually implemented

- `y < 560` — nothing. Head and neck are untouchable.
- `560 … 714` — every solid pixel of the row **except bare skin**. The two sleeves do not end on the same
  row, so a plain "whole row" rule grabbed a few pixels of the arm that is already bare on one side.
- `714 … 902` — pinched to the per-row torso span (bounded by the locked corridor). Deliberately
  independent of the row's run structure, so a row whose seam happens to close cannot leak onto a forearm.
- `902 … 1000` — optional hem extension, corridor only, clipped to the silhouette.
- `y >= 1000` — nothing. Legs are untouchable.
- The ≤4 px blend never crosses onto transparent canvas, onto locked anatomy, or outboard of the corridor
  below the sleeve end — **including the arm's anti-aliased edge** (alpha 1…127), which the solid-pixel
  anatomy zones do not cover.

---

## 4. Gates — 28/28 pass

`landmark:` ×7 (drift ≤24 px) · `no-px-above-shoulder` · `no-px-at-or-below-crotch` ·
`no-mask-outboard-below-sleeve-end` · `no-head-or-neck` · `no-forearm-or-hand` · `no-legs` ·
`edit-inside-silhouette` · `hard-inside-solid-figure` · `tee-occlusion-complete` ·
`no-unreachable-garment` · `feather-within-4px` · `protect-is-complement-of-edit` ·
`protect-covers:head-neck` · `protect-covers:forearm-hand` · `protect-covers:leg` ·
`hem-extension-in-corridor` · `fingertip-clearance` · `masks-binary` · `hard-is-single-region` ·
`no-specks` · `hard-not-on-bare-skin`.

Tee occlusion: **93,304 garment pixels in the band, 92,668 mandatory-covered (99.32 %)**; the remainder is
accounted for exactly — 466 px on bare arms and 158 px on the arms' shaded inner edge, where covering is
itself forbidden, plus the fringe below.

---

## 5. Accepted residues — disclosed, bounded, measured

Two things the template does **not** cover. Neither is hidden; both are in the spec JSON.

**(a) Detached sleeve-tip fringe — 6 px.** At x 698–699, y 706–709 the base carries solid pixels
(alpha exactly 128) separated from the sleeve body by a sub-threshold ramp, 4.1–5.7 px from the mask.
Bringing them in would require breaking one of three locked rules: an island-free mask, the ≤4 px
feather, or the `alpha >= 128` solidity convention. Bounded by a hard gate at ≤16 px and ≤8 px distance.
**Scale check:** 6 Master px is ~0.2 px at the avatar render size (180×270) — below one output pixel.

**(b) Collar/shoulder curve above the locked shoulder line — 2,740 px**, x 394–633, y 500–559.
The tee's shoulder seam curves *upward*, and D-084 forbids any mask pixel at `y < 560`, so a thin band of
the base tee sits outside the template. **This is the one residue with visible consequences:** ~2.9 % of
the tee, and at 180×270 it is a thin grey ring at the neckline that an armour item would not occlude.
**Owner decision — two options, both legitimate:** accept it (most torso garments carry their own collar
or neckline, which covers the ring visually), or revise the D-084 `shoulderY` landmark from 560 to ≈540 in
a follow-up so the band becomes maskable. **A1 does not choose;** the mask ships on the locked landmark.

---

## 6. Review artifacts (regenerable, gitignored)

`tools/avatar/build/r2-torso-occlusion-mask/` — `hard-mask-over-runtime-base.png`,
`edit-mask-over-runtime-base.png`, `protect-mask-over-runtime-base.png`, `mask-zones-labelled.png`,
`four-scale-review.png` (180×270 · 112×168 · 72×108 · 52×78, the D-071 render sizes), `report.json`.
Regenerate with `npm run avatar:r2-torso-mask -- --write`.

---

## 7. Visual assessment (honest)

Reviewed on the overlays and the four-scale sheet:

- **The grey tee is coverable** across the chest, back-of-shoulder curve and both short sleeves — apart
  from the collar band in §5(b).
- **Head and neck untouched;** the mask starts cleanly at the collar line.
- **Both forearms and both hands are fully preserved** — this was the failure mode that broke two earlier
  iterations of the tool (1,169 px and then 2 px of arm contact), and it is now enforced by construction
  *and* by an independent gate on the mask's own geometry.
- **The mask follows the seam under the sleeves**, and the hem extension stops at the crotch without
  touching the legs.
- **No floating islands** — the hard mask is a single 8-connected region.
- **All four render sizes read as a coherent torso region**, including 52×78 where the shape is only a
  few pixels wide.

**Uncertainties I cannot settle from geometry alone:** whether the collar residue is acceptable in
practice (it depends on the artwork's neckline), and whether an armour silhouette wider than the base tee
would look right when it must stay inside a corridor measured on a slim figure. Both belong to the A2
brief and to owner judgement, not to a mask.

**A1 is not PASS on automated gates alone.** Status stays `A1_BUILT — OWNER_VISUAL_REVIEW_REQUIRED`.

---

## 8. What this is not

Not A2 (no artwork, no AI, no image generation) · not A3 (no slot wiring, no z, no transform, no
`R2_SUPPORTED_COSMETIC_SLOTS` change) · **D-037 not discharged** · **D-083's whole-avatar C2 fallback
unchanged and still the active protection for the Ridderdragt** · no runtime, shop, catalog, database,
migration, RLS or Edge Function change · no `R2_MANIFEST` write · nothing promoted to `assets/avatar-r2/`
· no change to buy/ownership/`equipped_slots`/equip/unequip · `AVATAR_R2` stays `false` · pilot status and
participant log unchanged.

---

## 9. Owner acceptance

| field | value |
|---|---|
| Reviewed by | _(owner)_ |
| Date | _(pending)_ |
| Verdict | ☐ ACCEPT template as-is · ☐ ACCEPT with the collar landmark revised (D-084 `shoulderY` 560 → ≈540) · ☐ REJECT |
| Notes on the collar residue §5(b) | _(pending)_ |
| Authorises A2 (artwork) | ☐ yes — requires discharging D-037 · ☐ not yet |

Until this table is filled in, A1 is built but **not accepted**, and no A2 work may start.
