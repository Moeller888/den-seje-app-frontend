# 167A Phase-2 Gate 3 — WP1 Re-Review of the Punch-Listed Hair Layer (G3-WP1-RR)

Status: **✅ OWNER-COUNTERSIGNED: PASS (2026-07-16).** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** The WP1 worksheet §5 (countersigned 2026-07-15) made the hair layer
conditional: *"the hair layer is NOT final until both [PL-1 + PL-2] are cleared and
re-reviewed."* PL-1 cleared 2026-07-16 (gap 1,449 → 0, PR #72/#73); PL-2 cleared
2026-07-16 (p50 126 → 200, PR #74/#75). This worksheet is that re-review, ordered by
owner command 2026-07-16. Tool: `tools/avatar/build-hair-wp1-rereview.mjs`. Outputs in
the gitignored `tools/avatar/build/phase2/gate3-d057/rereview/`.

**Candidate pair under review:**

| Layer | File | Role |
|---|---|---|
| Colour/silhouette | `pl1/hair-pl1-color.png` | identity reference (z40 hair) |
| Luminance map | `pl2/hair-pl2-luminance.png` | D-031 runtime map candidate |

## 1. Chain integrity + determinism (verified before review)

The full chain WP0 → PL-1 → PL-2 was re-run from the tracked sources
(`Northstar Master.png` sha `2CA10EF8…`, D-057 sha `2CB93EE0…`) and **all 5 chain
outputs came back byte-identical** (sha-compared: `hair-clean-color.png` =`E3049B2E…`
= the tracked fixture, `hair-northstar-v1-luminance.png`, `hair-pl1-color.png`,
`hair-pl1-luminance.png`, `hair-pl2-luminance.png`). The pipeline is reproducible on a
fresh clone with three commands: `build-hair-clean.mjs` → `build-hair-pl1-gapfix.mjs` →
`build-hair-pl2-remap.mjs`.

## 2. Measured results vs the four WP1 findings (wp1-rereview-report.json)

| WP1 finding | WP1 state | Re-review result | Result |
|---|---|---|---|
| 1. Silhouette & registration | GOOD | onion outlines hug the Master hair mass / sit correctly on the D-057 scalp (`onion-master.png` / `onion-d057.png`) | ✔ |
| 2. Halo | MINOR, 130 px | **130 px** (0.137 % of 95,207 hair px) — did not grow through PL-1/PL-2 | ✔ |
| 3. Hairline coverage gap | **DEFECT, 1,449 px** | **0 px** (WP1 predicate re-run; `coverage-gap-check.png` shows no magenta) | ✔ |
| 4. Tint fidelity (R-7) | **OPEN, p50=126, blonde read olive** | map min 130 · p50 **200** · p99 239 · max 252; blonde reads blonde (`tint-sheet-head.png`); 8 tokens distinct @64/48 px, readable @32 px | ✔ |

**Extra guards:** colour-layer vs runtime-map **alpha identity: 0 mismatched px**
(the D-031 map's silhouette equals the colour layer's exactly) · eye-box contamination
**0 px** · Tool verdict: **PASS** (hard-fails and writes nothing on any breach).

## 3. Findings

1. **Both punch-list defects are gone, with no regression in the other two findings.**
   Gap 0, halo exactly the WP1 baseline 130, silhouette unchanged, map in band.
2. **On-dark composite is clean at the hair.** `composite-color-on-dark.png` (an
   artifact the PL-1 review checklist referenced but never displayed — shown to the
   owner in this re-review): no white fringe at hairline/temples. The pale edge along
   arms/torso/legs on dark is the **owner-accepted inherited §7 alpha/matte halo of the
   D-057 BASE (D-056)** — pre-existing technical debt of the base layer, not a hair
   defect, and out of scope here.
3. **Runtime view verified.** `composite-tint-brown(-on-dark).png` composites the
   actual D-031 pipeline (PL-2 map × brown token) over D-057 — the hair reads
   correctly on both backgrounds at full size.

## 4. Owner review checklist (includes the 2026-07-16 audit follow-ups)

- [x] `composite-color-on-dark.png` + `coverage-gap-check.png` reviewed (the two
      artifacts the PL-1 checklist cited without display — now shown).
- [x] Onion skins: no drift against Master or D-057.
- [x] `tint-sheet-head.png`: all 8 tokens read as their names; blonde reads blonde.
- [x] **Explicit 32 px decision (audit follow-up):** the punch-list acceptance said
      *"all 8 tokens visually distinct at 32/48/64 px"*. At 32 px the pairs
      black/dark_brown and red/auburn are readable but tight — this is a property of
      the locked 155E palette, not of the map. **Owner decision: ACCEPTED as
      sufficient (2026-07-16)** — recorded in §5.
- [x] **D-register decision (audit follow-up):** **Owner decision: WORKSHEET
      PRACTICE CONFIRMED (2026-07-16)** — for the Gate-3 track, countersigned
      worksheets (indexed in `docs/README.md`) are the decision record (WP1
      precedent); no D-xxx entry is created for punch-list clearance or this
      re-review. Recorded in §5.
- [x] Accept `hair-pl1-color.png` + `hair-pl2-luminance.png` as the **Gate-3 hair
      layer candidate (z40)** — the WP1 conditional ("not final until re-reviewed")
      is thereby discharged.

## 5. Verdict

**Owner verdict: PASS · Date: 2026-07-16 · countersigned via owner command.**

**The WP1 conditional is DISCHARGED: `pl1/hair-pl1-color.png` +
`pl2/hair-pl2-luminance.png` are the accepted Gate-3 hair layer candidate (z40).**

Owner decisions recorded with this countersign (verbatim command: *"32 px accepteret,
worksheets-praksis"*):

1. **32 px legibility: ACCEPTED.** The tight-but-readable pairs black/dark_brown and
   red/auburn at 32 px are accepted as a property of the locked 155E palette; no
   palette-spacing work is ordered.
2. **Decision-record practice for Gate 3: WORKSHEETS.** Countersigned worksheets
   indexed in `docs/README.md` are the authoritative decision record for the Gate-3
   track (WP1 precedent). `docs/project-state.md` remains the D-register for the
   decisions it already holds (through D-058); no D-entry is created for PL-1/PL-2/this
   re-review.

Acceptance does NOT promote the layer (see §6). Next Gate-3 work package (eyes)
requires its own owner command.

## 6. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. `Northstar Master.png`, the D-057 base, `protect-mask-v2.1`,
the §7 halo, the WP0/PL-1/PL-2 outputs and the tracked fixture are all untouched. No AI.
Accepting the candidate does NOT promote it: promotion to a runtime asset (WebP encode,
`assets/avatar-r2`, `R2_MANIFEST`) remains a separate owner-gated step per the 167A
plan-of-record, and Gate 3's remaining work packages (eyes, face, eyelid, integration)
each still require their own owner command.
