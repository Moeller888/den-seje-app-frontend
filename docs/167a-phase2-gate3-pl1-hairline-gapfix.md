# 167A Phase-2 Gate 3 — PL-1 Hairline Coverage-Gap Fix Worksheet (G3-PL1)

Status: **⏳ PENDING OWNER REVIEW.** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** Punch-list item **PL-1** ordered by the owner countersign of the WP1 hair review
(`docs/167a-phase2-gate3-wp1-hair-review.md` §5, 2026-07-15): eliminate the **1,449 px** of
white show-through at the hairline/temples — Master-figure px in the head zone covered by
neither the D-057 base nor the WP0 hair layer. Tool: `tools/avatar/build-hair-pl1-gapfix.mjs`.
Outputs in the gitignored `tools/avatar/build/phase2/gate3-d057/pl1/`.

## 1. Implementation choice (decided in this task, per the punch-list wording)

**CHOSEN: backfill the gap px from the Master.** The PL-1 hair layer is the WP0 hair layer
plus the Master's own RGBA, copied verbatim, at exactly the WP1 gap set — nothing else.

**REJECTED: widening the `isHair()` highlight-tone detection.** That would change the raw
hair mask globally (re-running brown-detect + connected components with looser thresholds),
risks new face/eyebrow/ear contamination, and cannot honour the punch-list constraint
*"extraction elsewhere must stay byte-stable"*. Backfill honours it by construction: every
pixel outside the gap set is byte-identical to the WP0 outputs (measured, see §3).

## 2. Inputs (read-only, verified)

| Input | Integrity |
|---|---|
| `assets/avatar/reference/Northstar Master.png` | sha `2CA10EF8…` (D-032 datum) |
| `assets/avatar/reference/neutral-base-v1-gate2-d053.png` | sha `2CB93EE0…` (D-057) |
| `gate3-d057/hair-clean-color.png` | verified byte-identical to the tracked fixture `tools/avatar/fixtures/face-clean/hair-clean-color.png` (sha `E3049B2E…`) — hard guard in the tool |
| `gate3-d057/hair-northstar-v1-luminance.png` | WP0 first-pass D-031 map, band [90,250] |

The gap set is computed with the **exact WP1 audit predicate** (`build-hair-wp1-review.mjs`
§3: head zone y < 505, Master-figure px, D-057 alpha ≤ 16, hair alpha = 0), so the metric
being fixed is the same metric that reported 1,449 px in WP1.

## 3. Measured results (pl1-gapfix-report.json)

| Metric | Value | Requirement | Result |
|---|---|---|---|
| Gap before | 1,449 px, bbox (260,40)–(757,485) | matches WP1 exactly | ✔ |
| Gap px inside eye boxes / face-exclude | 0 / 0 | hard-fail if > 0 | ✔ |
| Filled px | 1,449 (Master RGBA verbatim) | = gap set | ✔ |
| **Gap AFTER (WP1 audit re-run on PL-1 layer)** | **0 px** | ~0 | ✔ |
| Eye-box contamination on PL-1 layer | 0 px | 0 | ✔ |
| Byte-diffs outside the gap set (colour / luminance) | 0 / 0 | 0 (byte-stability) | ✔ |
| Near-white halo | 130 → 130 px | must not grow | ✔ |
| Fill luminance mapping | L 0–247 → D-031 first-pass band [90,250] (same mapping as WP0 step 3b, clamped) | deterministic | ✔ |

Tool verdict: **PASS** (the tool hard-fails and writes nothing on any guard breach).

## 4. Findings

1. **The gap is closed by Master art, not invented pixels.** All 1,449 fill px are the
   Master's own hairline/temple strands (pale highlights and dark line-art px that the
   brown `isHair()` test rejects), copied verbatim into the hair layer. The before/after
   strip (`hairline-before-after.png`) shows the white notches at the temples and fringe
   replaced by the Master's strokes; silhouette registration is unchanged.
2. **WP0 outputs untouched.** PL-1 layers are written as NEW files
   (`hair-pl1-color.png`, `hair-pl1-luminance.png`); the WP0 files and the tracked
   fixture are read, never rewritten. The face-clean chain is unaffected.
3. **PL-2 interaction.** The PL-1 luminance map still uses the WP1-criticised first-pass
   band (p50 ≈ 126 → too dark; WP1 finding 4). That is PL-2's scope, not PL-1's:
   **PL-2 should take `hair-pl1-luminance.png` as its input map** so the remap includes
   the backfilled hairline px.

## 5. Owner review checklist

- [ ] `hairline-before-after.png`: white show-through at hairline/temples is gone; the
      new edge reads as the Master's own strands (no smearing, no invented shapes).
- [ ] `gap-fill-overlay.png`: green fill px sit only along the hairline/strand edges.
- [ ] `coverage-gap-after.png`: no magenta anywhere (gap metric 0).
- [ ] `review-d057-pl1-hair.png` / `-on-dark.png`: composite reads correctly on both
      backgrounds.
- [ ] Accept `hair-pl1-color.png` + `hair-pl1-luminance.png` as the Gate-3 hair layer
      candidate going into PL-2.

## 6. Verdict

**Owner verdict: PENDING · (fill in on review).**

## 7. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. `Northstar Master.png`, the D-057 base, `protect-mask-v2.1`,
the §7 halo, the WP0 hair outputs and the tracked fixture are all untouched. No AI.
Gate 3 remains gated: the hair layer is NOT final until PL-2 is also cleared and the
punch-listed layer is re-reviewed; **nothing here promotes the hair layer to a runtime
asset**.
