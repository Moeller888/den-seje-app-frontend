# 167A Phase-2 Gate 3 — Integration Composite Worksheet (G3-INTEGRATION)

Status: **✅ OWNER-COUNTERSIGNED: PASS (2026-07-16) — DETERMINISTIC LAYER SET DECLARED COMPLETE.** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** The last deterministic Gate-3 item, ordered by owner command 2026-07-16:
assemble ALL accepted Gate-3 candidates into the complete layered stack and prove,
with measurements, that the decomposition **reassembles into the Master-equivalent
character** — on both the identity path and the D-031 runtime path.
Tool: `tools/avatar/build-gate3-integration-composite.mjs`. Outputs in the gitignored
`tools/avatar/build/phase2/gate3-d057/integration/`.

## 1. The integrated stack (all owner-countersigned candidates)

| z | Layer | Source | Countersign |
|---|---|---|---|
| 0 | base | D-057 `neutral-base-v1-gate2-d053.png` (tracked) | D-056/D-057 |
| 2 | blush (multiply) | `plb/face-blush-multiply-v1.png` | PL-B (#83) |
| 3 | face-neutral | `face-neutral-v1.png` | WP3 (#81) |
| 4 | eyes | `wp2/eyes-iris-wp2-luminance.png` × token + `eyes-neutral-fixed.png` | WP2 (#79) |
| 40 | hair | identity: `pl1/hair-pl1-color.png` · runtime: `pl2/hair-pl2-luminance.png` × token | WP1-RR (#77) |

## 2. Measured results (integration-report.json)

| Metric | Value | Requirement | Result |
|---|---|---|---|
| **Full-stack head-zone coverage gap** | **0 px** (of 160,839 Master-figure px, y<505) | 0 (hard guard; PL-1 metric extended to the whole stack) | ✔ |
| Master fidelity — identity path | mean 5.96 · **p50 0** · p95 30.7 (RGB delta) | reported | ✔ |
| Master fidelity — runtime path | mean 18.0 · p50 14 · p95 56.7 | reported | see §3 |

**p50 = 0 on the identity path** is the decomposition proof: the median head-zone
pixel of the reassembled stack is EXACTLY the Master. The residual mean is edge
anti-aliasing, the reconstructed D-057 scalp boundary and the blush smoothstep edge
(`fidelity-heatmap.png`).

## 3. Finding: the runtime `brown` token renders darker than the Master's hair

`master-vs-stacks.png` (Master | identity | runtime) shows the runtime hair darker
and flatter than the Master's. **This is not a chain defect — it is the multiply
model's ceiling** (`rendered ≤ token`): the Master's actual hair colour sits BETWEEN
the locked 155E tokens (`brown #5A3D28` is darker than the Master's warm brown, and
the Master's highlights are lighter than the token itself, so no multiply can reach
them).

Context that frames the decision: **today's shipped C2 SVG hair is flat token
fill** — the product's "brown" is already `#5A3D28`. The runtime path is therefore
**token-faithful to the shipped 155E identity model**; Master-exact default colouring
was never shippable through tokens. Options if the owner wants the default look
closer to the Master (a later decision, NOT ordered here):
(a) accept token-brown as default (max consistency with current prod),
(b) add a "master_brown" token to the palette (palette change = own decision),
(c) revisit the PL-2 band (would re-open a countersigned worksheet),
(d) hybrid: identity colour layer for default, map for non-default colours.

## 4. Tint-system integration

- `hair-tint-matrix.png`: all 8 hair tokens on the FULL stack — face/eyes/blush stay
  correct under every hair colour.
- `iris-tint-matrix.png`: the 6 preview iris colours on the full stack (the preview
  set remains a proposal — WP2 §4).
- `stack-small-sizes.png`: the default look reads at 64/48/32 px.
- Blink integration was proven in the eyelid worksheet (Option A lid over this same
  stack, no off-eye flash at the measured rx57/ry58).

## 5. Owner review checklist

- [x] `master-vs-stacks.png` + `fidelity-heatmap.png`: identity path ≈ Master
      (p50 = 0); residuals are edges/scalp/blush-smoothstep, not drift.
- [x] §3 decided: **OPTION (a) CHOSEN** — runtime default hair = token-brown,
      accepted as token-faithful to the shipped 155E identity model; options b–d
      remain available as separate palette/band decisions.
- [x] `hair-tint-matrix.png` / `iris-tint-matrix.png` / `stack-small-sizes.png`
      reviewed (shown to the owner in-session 2026-07-16).
- [x] **The Gate-3 deterministic layer set is DECLARED COMPLETE** — recorded in §6.

## 6. Verdict

**Owner verdict: PASS · Date: 2026-07-16 · countersigned via owner command
(verbatim: "countersign integrationskompositten — option a valgt, lagsættet
erklæres komplet").**

**1. §3 decision: OPTION (a).** The runtime default hair renders as the locked
155E `brown` token (darker than the Master's own hair) — accepted as
token-faithful to the shipped identity model. Options b–d (new token, PL-2 band
revisit, hybrid) remain available later as separate, explicitly ordered decisions.

**2. THE GATE-3 DETERMINISTIC LAYER SET IS COMPLETE.** The owner-countersigned
candidate set is:

| z | Layer | File (gitignored candidate; regenerable via the tool chain) |
|---|---|---|
| 0 | base | `assets/avatar/reference/neutral-base-v1-gate2-d053.png` (tracked, D-057) |
| 2 | blush | `plb/face-blush-multiply-v1.png` (multiply component) |
| 3 | face | `face-neutral-v1.png` |
| 4 | eyes | `wp2/eyes-iris-wp2-luminance.png` (× token) + `eyes-neutral-fixed.png` |
| 40 | hair | `pl1/hair-pl1-color.png` (identity ref) · `pl2/hair-pl2-luminance.png` (× token, runtime) |
| blink | eyelid | Option A parameters (eyelid worksheet, countersigned #85) — no asset |

**What "complete" does NOT mean:** no promotion (WebP encode, `assets/avatar-r2`,
`R2_MANIFEST` remain untouched), no runtime wiring (blink re-position included),
`AVATAR_R2` stays `false`, and the D-042 expression variants remain unproduced
(art-producer path, blocked on the separate external-image-API owner decision).
Each of those is its own explicitly gated step.

## 7. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. No AI. Master / D-057 / protect / all chain outputs
untouched. Declaring the layer set complete promotes NOTHING: promotion (WebP,
avatar-r2, manifest) and the blink re-position each remain separately owner-gated
steps per the 167A plan-of-record.
