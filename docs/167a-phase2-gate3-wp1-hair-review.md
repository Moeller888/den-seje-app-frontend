# 167A Phase-2 Gate 3 — WP1 Hair Review Worksheet (G3-WP1)

Status: **✅ OWNER-COUNTERSIGNED: PASS WITH PUNCH-LIST (2026-07-15).** Review-only; nothing promoted.
Date: 2026-07-15. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** Owner-review evidence for the Gate-3 **hair layer candidate** (z40, D-031
luminance-map model) produced by `tools/avatar/build-hair-clean.mjs` on the WP0 input
contract (composite base = tracked D-057). This worksheet is the WP1 stop-condition:
Gate-3 hair work does not proceed past this point without the owner verdict below.

## 1. Inputs (read-only, verified)

| Input | Integrity |
|---|---|
| `assets/avatar/reference/Northstar Master.png` | sha `2CA10EF8…` (D-032 datum) |
| `assets/avatar/reference/neutral-base-v1-gate2-d053.png` | sha `2CB93EE0…` (D-057) |
| `gate3-d057/hair-clean-color.png` | byte-identical to the tracked fixture (WP0 proof) |
| `gate3-d057/hair-northstar-v1-luminance.png` | first-pass D-031 map, band [90,250] |

Tooling: `tools/avatar/build-hair-clean.mjs` (extraction, PR #18/#69) +
`tools/avatar/build-hair-wp1-review.mjs` (this package). Outputs in the gitignored
`tools/avatar/build/phase2/gate3-d057/wp1/`.

## 2. Measured results (wp1-hair-report.json)

| Metric | Value | Reading |
|---|---|---|
| Hair px (dilated mask) | 93,758 | silhouette = Master brown mass + 2 px dilation |
| Near-white halo px | **130 (0.139 %)** | dilation-ring pickup; not visible at 32/48/64 px |
| Hairline coverage gap | **1,449 px** | Master-figure head-zone px covered by neither D-057 nor hair → white shows at hairline/temples in full-size composites |
| Luminance map | min 90 · p50 126 · p99 184 · max 250 | inside the designed [90,250] band |
| Alignment (onion-skins) | in-frame | hair is cut FROM Master; outline hugs the Master hair mass and sits correctly on the D-057 bald scalp |

## 3. Findings (honest first-pass assessment)

1. **Silhouette & registration: GOOD.** The hair mass matches the Master by construction
   (deterministic extraction, same 1024×1536 frame); `onion-master.png` / `onion-d057.png`
   show no offset. Eye-box contamination is 0 px (WP0 chain report).
2. **Halo: MINOR.** 130 near-white px (0.139 %) at strand tips (`halo-audit.png`).
   Invisible in the 64/48/32 px strip (`tint-small-sizes.png`).
3. **Hairline coverage gap: REAL, VISIBLE DEFECT in full-size composites.** 1,449 px of
   white background show through at the hairline/temples (`coverage-gap.png`) — the Master's
   pale highlight strands fail the brown `isHair()` test there, and the bald D-057 scalp
   does not extend under the full hair silhouette. Fix candidates (each a separate bounded
   task — NOT done in WP1): widen the deterministic hair-colour detection to include
   highlight tones, or backfill the gap px from the Master inside the hair silhouette.
4. **Tint fidelity (R-7): THE MAIN OPEN ISSUE.** The D-031 multiply preview
   (`tint-sheet-head.png`) keeps strand shading for all 8 tokens, but with the map's
   p50 = 126 every colour renders ~50 % darker than its token: **`blonde` reads as
   olive/light-brown, not blonde.** The first-pass [90,250] normalisation is
   silhouette-correct but not colour-faithful. Fix candidates (owner choice, separate
   task): brighter luminance remap (p50 → ~200), a gain factor in the tint model, or
   deferring colour variants (default `brown` only) to a later WP.

## 4. Owner review checklist

- [x] Hair silhouette matches the Master (onion-skins) — no drift, no missing mass.
- [x] No visible halo at 32/48/64 px (`tint-small-sizes.png`).
- [x] Hairline gap (finding 3): **bounded fix task ORDERED** (punch-list item PL-1).
- [x] Tint darkness (finding 4): **REMAP chosen** (punch-list item PL-2).
- [x] Face/eye zones stay clean under hair (WP0 chain: contamination 0 px).

## 5. Verdict

**Owner verdict: PASS WITH PUNCH-LIST · Date: 2026-07-15 · countersigned via owner command.**

**Punch-list (each item = its own bounded, review-only task; the hair layer is NOT final
until both are cleared and re-reviewed):**

- **PL-1 — hairline coverage-gap fix (finding 3):** eliminate the 1,449 px of white
  show-through at the hairline/temples. Deterministic, NON-AI; implementation choice
  (widen the highlight-tone hair detection vs. backfill gap px from the Master inside
  the hair silhouette) is decided in the task itself; extraction elsewhere must stay
  byte-stable; new gap metric must be ~0 with no new face/eye contamination.
- **PL-2 — luminance remap (finding 4):** re-normalise `hair-northstar-v1-luminance`
  to a brighter band so the D-031 multiply tints are colour-faithful (acceptance:
  `blonde` reads as blonde in the tint sheet; all 8 tokens visually distinct at
  32/48/64 px). Deterministic remap of the existing map — no re-extraction, no AI.

Recommended reading: `wp1/tint-sheet-head.png`, `wp1/tint-small-sizes.png`,
`wp1/coverage-gap.png`, then `wp1/wp1-hair-report.json`.

## 6. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. `Northstar Master.png`, the D-057 base, `protect-mask-v2.1`
and the §7 halo are untouched. The WP0 hair outputs were read, not modified. No AI.
Gate 3 remains gated: ~~findings 3–4 require owner decisions~~ **[decided 2026-07-15:
PL-1 + PL-2 ordered — see §5]**; each punch-list item runs as its own bounded task, and
**nothing here promotes the hair layer to a runtime asset**.
