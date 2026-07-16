# 167A Phase-2 Gate 3 — PL-2 Luminance Remap Worksheet (G3-PL2)

Status: **⏳ PENDING OWNER REVIEW.** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** Punch-list item **PL-2** ordered by the owner countersign of the WP1 hair review
(`docs/167a-phase2-gate3-wp1-hair-review.md` §5, 2026-07-15): re-normalise the hair
luminance map to a brighter band so the D-031 multiply tints are colour-faithful.
WP1 finding 4: with the first-pass band (p50 = 126) every token rendered ~50 % darker
than its colour — `blonde` read as olive/light-brown. Owner-chosen fix candidate:
brighter remap, **p50 → ~200**. Tool: `tools/avatar/build-hair-pl2-remap.mjs`.
Outputs in the gitignored `tools/avatar/build/phase2/gate3-d057/pl2/`.

## 1. Input map (per the PL-1 countersign)

**Input = `pl1/hair-pl1-luminance.png`** — the PL-1 gap-fixed map, so the remap includes
the backfilled hairline px (PL-1 worksheet §6, countersigned 2026-07-16). This is a
**remap of the existing map**: no re-extraction, no silhouette change, no AI. The tool
fails loud with chain instructions if the PL-1 map is missing.

## 2. The curve (deterministic, monotonic)

One fixed LUT applied to the gray value of every hair px (alpha copied verbatim):

```
t  = clamp((g − 90) / 160, 0..1)      # the first-pass band [90,250]
t' = t ^ 0.37                         # brightening curve
g' = round(130 + t' · 122)            # output band [130,252]
```

The LUT is strictly monotonic, so strand-shading ORDER is preserved — dark stays
darkest, highlights stay lightest; only the band is brightened. The output floor 130
keeps line-art/shadow depth; the ceiling 252 puts highlights near the full token colour.

## 3. Measured results (pl2-remap-report.json)

| Metric | Before (PL-1 map) | After (PL-2 map) | Requirement | Result |
|---|---|---|---|---|
| p50 | 126 | **200** | 190–215 (owner: "p50 → ~200") | ✔ |
| min / p1 | 90 / 92 | 130 / 154 | shadow depth kept | ✔ |
| p99 / max | 209 / 250 | 239 / 252 | highlights near-full | ✔ |
| Alpha diffs vs input map | — | 0 | 0 (silhouette unchanged) | ✔ |
| Changed px outside hair alpha | — | 0 | 0 | ✔ |
| LUT monotonicity | — | asserted | required | ✔ |

Blonde at the median strand: before `(99,76,45)` (olive) → after `(158,121,71)`
(sandy blonde) under D-031 multiply with token `#C99A5B`.

Tool verdict: **PASS** (the tool hard-fails and writes nothing on any guard breach,
including a p50 outside the 190–215 corridor).

## 4. Findings

1. **`blonde` now reads as blonde.** `blonde-before-after.png` shows the same head with
   the PL-1 map (olive/brown) vs the PL-2 map (sandy blonde); strand shading is still
   visible — the remap brightens the band without flattening the strand structure.
2. **All 8 tokens legible in the sheet.** `tint-sheet-head.png`: black reads black,
   dark_brown/brown/light_brown form a legible warm ramp, red vs auburn separate,
   fantasy_blue is vividly blue.
3. **Small sizes.** `tint-tokens-small.png` (8 tokens × 64/48/32 px, ×4 upscale):
   all 8 distinct at 64 and 48 px. At 32 px the two closest pairs (black vs dark_brown,
   red vs auburn) remain readable as different colours but are the tightest calls —
   this is a property of the locked 155E palette at 32 px, not of the map.
4. **PL-1 layer untouched.** The PL-2 map is a NEW file; `hair-pl1-color.png` stays the
   colour reference and `hair-pl1-luminance.png` stays on disk as the PL-2 input.
   The pair going into the WP1 re-review is `hair-pl1-color.png` (silhouette/colour) +
   `hair-pl2-luminance.png` (D-031 runtime map candidate).

## 5. Owner review checklist

- [ ] `blonde-before-after.png`: right side reads as blonde; strand shading preserved.
- [ ] `tint-sheet-head.png`: all 8 tokens read as their names; none renders ~50 % dark.
- [ ] `tint-tokens-small.png`: 8 tokens visually distinct at 64/48 px; 32 px readable
      (tightest pairs: black/dark_brown, red/auburn).
- [ ] Accept `hair-pl2-luminance.png` as the Gate-3 D-031 luminance-map candidate,
      clearing punch-list item PL-2 and unlocking the WP1 re-review of the full
      punch-listed hair layer.

## 6. Verdict

**Owner verdict: PENDING · (fill in on review).**

## 7. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. `Northstar Master.png`, the D-057 base, `protect-mask-v2.1`,
the §7 halo, the WP0 outputs, the tracked fixture and the PL-1 outputs are all untouched
(the PL-2 map is a NEW file). No AI. `HAIR_COLOR_TOKENS` in `js/avatar-layers.js` are
mirrored read-only for the preview — the runtime file stays the single source of truth.
Gate 3 remains gated: after PL-2 the punch-listed hair layer still requires the WP1
re-review before it can be considered the Gate-3 hair candidate; **nothing here promotes
the hair layer to a runtime asset**.
