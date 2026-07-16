# 167A Phase-2 Gate 3 — WP3 Face×5 Review Worksheet (G3-WP3)

Status: **⏳ PENDING OWNER REVIEW.** Review-only; nothing promoted.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** Gate-3 work package **WP3 (face×5)**, ordered by owner command 2026-07-16.
The Master carries exactly ONE face (neutral). Per the D-042 handoff
(`docs/167a-phase2-artist-handoff.md`), the four expression variants (`curious,
focused, determined, proud` [+`happy, surprised` for the D-024 set of 7]) are produced
by the **art producer via AI-assisted MASKED editing on the Master** — outside this
NON-AI tool chain. WP3 therefore delivers the three things that CAN be produced
deterministically:

1. the **face-neutral candidate**, audited against the brief §4.2 acceptance,
2. an **evidence-based answer to the blush question** (§4.2 requires multiply blush;
   WP0 skipped it as "optional"),
3. the **deterministic acceptance harness** that will gate the incoming expression
   files (`tools/avatar/validate-face-expression.mjs`).

Tools: `tools/avatar/build-face-wp3-neutral.mjs` + `validate-face-expression.mjs`.
Outputs in the gitignored `tools/avatar/build/phase2/gate3-d057/wp3/`.

## 1. Inputs (read-only, verified)

| Input | Integrity |
|---|---|
| `assets/avatar/reference/Northstar Master.png` | sha `2CA10EF8…` (D-032 datum) |
| `assets/avatar/reference/neutral-base-v1-gate2-d053.png` | sha `2CB93EE0…` (D-057) |
| `gate3-d057/face-neutral-v1.png` | WP0 output, regenerated this session (deterministic) |
| `gate3-d057/eyes-neutral-fixed.png` + `wp2/eyes-iris-wp2-luminance.png` | eyes pair (WP2, pending its own countersign) |
| `gate3-d057/pl1/hair-pl1-color.png` | accepted Gate-3 hair candidate |

## 2. face-neutral audit vs brief §4.2 (wp3-face-report.json)

| Check | Value | Requirement | Result |
|---|---|---|---|
| Face px | 2,600 (brows 2,514 · nose 32 · mouth 140 + kept strays) | line-work only | ✔ |
| Px outside the §4.2 feature regions | 0 | 0 (registers on Master position) | ✔ |
| Px inside the eye boxes | 0 | 0 | ✔ |
| **Alpha overlap with the eyes layers (fixed ∪ iris)** | **0** | 0 (stronger than the box test) | ✔ |
| Skin-toned px | 0 | 0 (tone-agnostic, D-022) | ✔ |
| Registration | extracted in-place from the Master | exact by construction | ✔ |

**Audit-method note (recorded honestly):** a first audit run reported 98 px of
"eye-box contamination". That was a **constants mismatch in the audit, not
contamination**: the audit had borrowed the hair tool's eye boxes (y0=330) while
`build-face-clean.mjs` uses the eyes tool's boxes (y0=332) — the 98 px are brow
line-work in rows y330–331, legitimately face content. The audit was corrected to
the face tool's own boxes and additionally given the stronger eyes-layer
alpha-overlap check (0 px).

## 3. The blush question — measured, not assumed

Brief §4.2 lists `multiply` blush as face-layer content; WP0 skipped it. Measurement
(Master cheek chroma vs the D-057 blank skin, redness = R vs (G+B)/2):

- **A real, symmetric blush signal EXISTS**: 390 interior px with ≥4 % redness lift
  (max 6.6 %), forming two mirrored patches high on both cheeks just under the eyes
  (`blush-analysis.png`) — consistent with intentional under-eye anime blush, not noise.
- **Method integrity:** the first pass flagged 417 px including edge gradients; the
  measurement was tightened to **interior-only skin** (4 px all-skin neighbourhood,
  the D-049/D-052 anti-misclassification rule), which removed 27 edge px and kept
  the symmetric interior patches.
- The patches hug the top edge of the measurement zones, so the blush region likely
  extends slightly toward the eye boxes.

**Decision needed (owner):** order a bounded follow-up task to extract the blush as
a multiply component (with zones extended upward), or accept the neutral face
without extracted blush and leave blush to the D-042 expression art. **Not decided
here** — the §4.2 content spec vs WP0's "optional" note is a real gap the owner
must close one way or the other.

## 4. First complete Gate-3 stack

`composite-stack(-on-dark).png`: D-057 base + face-neutral + WP2 iris (× brown
preview) + eyes-fixed + PL-1 hair — the character reads as the Master kid. The
white sclera wedges at the eye corners match the Master's own art (verified against
the Master crop). `stack-small-sizes.png`: the face reads at 64/48 px; at 32 px the
smile+brows still register (§4.2 "legible at 32px").

## 5. Acceptance harness for the expression variants (delivered)

`tools/avatar/validate-face-expression.mjs <file> [name]` — the objective gate for
each incoming D-042-produced expression file: dims/RGBA · tone-agnostic (0 skin px)
· 0 eye-box px · 0 eyes-layer alpha overlap · all px within the §4.2 regions ±12 px
expression margin · ≥500 px. Emits full-stack composites + 32/48/64 strip + report
per candidate. **Proven both ways:** face-neutral → PASS; hair layer as a deliberate
negative test → FAIL with exact reasons. Owner identity review remains on top —
the harness gates geometry/contract, not art quality.

## 6. Owner review checklist

- [ ] `face-audit-overlay.png`: features sit inside the region boxes; eye boxes clean.
- [ ] `composite-stack(-on-dark).png` + `stack-small-sizes.png`: the full stack reads
      as the Master kid on both backgrounds and at 32 px.
- [ ] `blush-analysis.png` reviewed → **decide the blush question (§3):** bounded
      extraction follow-up ORDERED / blush left to the D-042 expression art.
- [ ] Accept `face-neutral-v1.png` as the **Gate-3 face-neutral candidate (z3)**.
- [ ] Acknowledge the expression-variant path: 4 files produced via D-042 masked
      editing (art-producer scope, AI-assisted, outside this NON-AI chain), each
      gated by `validate-face-expression.mjs` + owner identity review.

## 7. Verdict

**Owner verdict: PENDING · (fill in on review).**

## 8. Boundaries (binding)

Review-only. No runtime change; no `assets/avatar-r2` write; no `R2_MANIFEST` change;
`AVATAR_R2` stays `false`. `Northstar Master.png`, the D-057 base, `protect-mask-v2.1`
and all chain outputs are untouched. **No AI was used by these tools**, and this
worksheet does NOT start the D-042 expression production — that requires the owner to
run the art-producer process per the handoff. Gate 3 stays gated; the remaining WPs
(eyelid decision, integration composite) each require their own owner command.
