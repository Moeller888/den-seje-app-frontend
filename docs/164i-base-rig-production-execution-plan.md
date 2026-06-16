# 164I — Base Rig Production Execution Plan (D-039)

> **⚠️ RE-SCOPED by D-040 (164J, automation-first pivot).** This illustrator/manual
> production method is **no longer the MVP path and no longer a blocker**. MVP uses
> `Northstar Master.png` directly as the **Tier-0 base** + accessory overlays only. This
> plan now applies **only to the future, optional neutral-base quality upgrade** (`body-
> neutral-medium-v1`). The 164B.3 gate, D-033 and this brief apply **if/when** that upgrade
> is produced — not to MVP. See `docs/164d-shop-pipeline.md` (Tier-0) and project-state D-040.

_Concrete execution plan for producing the base rig `body-neutral-medium-v1`.
**D-039 locks the production method, brief, deliverables, gates, NO-GO and handoff.**
No asset/image/mask/code/tooling is produced by this document._
_Builds on: D-032 (Master = sole geometry), D-033 (manual base, no AI geometry),
D-038 (Tier-1 sequence; base rig is the blocking first step), 164B.2 (base reconstruction
spec), 164B.3 (base-coherence gate)._
_`AVATAR_V2` stays OFF. No runtime/DB/RPC change results from this document._

---

## Decision (D-039)
**Primary method = Option B — outsource `body-neutral-medium-v1` to a professional
illustrator using a locked production brief.**
- **Fallback = Option A** (in-house manual paint-over) — allowed **only** as a budget fallback.
- **Option C** (semi-automated vector/paint-over) — allowed **only as a geometry scaffold,
  never as the final production finish**.

**Why B is primary:** the base rig is the **single highest-risk, foundational, one-time
asset** — everything registers to it, AI failed it repeatedly (D-032), and it must clear
the **164B.3 base-coherence gate** against the Master's premium anime cel finish. A
professional most reliably passes that gate; it is a one-time, high-leverage spend.

## Hard rules
- The base rig is **manually controlled and geometry-locked to `Northstar Master.png`** (D-032).
- **AI generation/inpaint must NOT define production geometry** (D-033).
- **No anchor template or masks may start until the base rig passes 164B.3** (D-038 order).

## 1. Scope — include / exclude
**Include:** full body silhouette from Master geometry; neutral default outfit (grey tee /
charcoal trousers / plain low sneakers — appearance from the outfit reference only); `medium`
composition skin (face area, neck, hands, forearms if short-sleeve); same pose, proportions,
head/body ratio, style language, canvas/framing (1024×1536); composition-ready head.
**Exclude:** alternative/generated geometry; AI regeneration; changed face/eyes/hair
silhouette; baked shop items/signature outfit; background; runtime/code changes.

> **Layer model:** ship `base` with **no baked face/eyes/hair** (separate rig layers). Keep
> body / face / eyes / hair on **separate layers** in the source — enables the full-composite
> 164B.3 review and a clean `base` export.

## 2. Source files
`Northstar Master.png` (sole geometry, D-032) · `Northstar Master - reference.png` (outfit
appearance only) · `docs/164b2-base-reconstruction-spec.md` · `docs/164b3-base-review-worksheet.md`
· `docs/164h-tier1-base-rig-mask-authoring-plan.md` (D-038).

## 3. Method options (evaluated)
| | A — manual (us) | **B — illustrator (PRIMARY)** | C — vector/paint-over |
|---|---|---|---|
| Feasibility | High | High | Medium |
| Quality risk | Med–High (our skill) | **Low (pro)** | Med–High (loses cel finish) |
| Cost / time | Low $ / high time | **$ one-time / turnaround** | Low–med $ |
| Repeatability | High | Med–High | High |
| Supports automation | Yes | Yes | Yes |
| Pass 164B.3? | If skill matches | **Most reliably yes** | Risky |

→ **B primary; A budget fallback; C scaffold-only.**

## 4. Production brief (locked)
> Produce the neutral base rig over the attached `Northstar Master.png`.
> - **Geometry:** trace/preserve Master **exactly** — pose, proportions, head/body ratio,
>   shoulder width, limb lengths, hand/foot positions, silhouette. No reinterpretation,
>   resize, or regeneration. **No AI geometry.**
> - **Outfit:** replace sweater/cargo jeans/sneakers/wristbands with a **plain neutral
>   default outfit** (light-grey crew tee, charcoal straight trousers, plain low sneakers) —
>   appearance from the outfit reference; **geometry from Master**. Short sleeves → paint
>   `medium` forearm skin (no seam).
> - **Layering:** body / face / eyes / hair on **separate layers**.
> - **Style:** match Master's anime **cel-shade**, line weight, lighting direction — no
>   gradients/photoreal/3D, no stylistic drift.
> - **Canvas:** full-canvas **1024×1536**, transparent, **no crop**. Served 512×768 later.

## 5. Expected deliverables (handoff)
1. **Layered source file** (PSD/ORA — body/face/eyes/hair separated).
2. **Flattened review PNG** (full composite, transparent, 1024×1536).
3. **Served WebP candidate** (512×768).
4. **Change notes** (what was reconstructed).
5. **Optional onion-skin / overlay comparison** against Master.

## 6. Acceptance gate
- **164B.3 worksheet PASS is required before the base becomes the datum** (§2 proportions +
  §5 D-032/geometry are non-negotiable).
- Visual overlay/onion-skin vs Master · no geometry drift · no face/eye/hair drift · no hidden
  background · alpha clean · correct canvas · style match.

## 7. NO-GO conditions (any one = reject, re-do)
Taller/slimmer body · altered head size · altered face/eyes/hair · pose drift · style drift ·
AI-looking regeneration · cropped canvas · baked background · any unreviewed geometry change.

## 8. Handoff protocol
1. **You/artist send back** the deliverables (§5).
2. **Claude reviews** the flattened PNG through the **164B.3 worksheet** — visual
   onion-skin/overlay vs Master (proportion/silhouette/hair/face drift) + canvas/alpha/
   background/style. *Limit:* a strong **visual/structural** verdict; numeric fields (IoU,
   ΔE) need measurement tooling or careful manual measurement — flagged if not computable.
3. **Before any commit:** base must return **164B.3 = PASS** (or CONDITIONAL + punch-list).
4. **Proceed gate:** only after PASS → begin **anchor template → masks** (D-038 steps 2→4);
   the layered file enables anchor measurement (revised eye box) + mask derivation.

## 9. Open input (does not block D-039)
- **A vs B pick** hinges on **founder budget + own illustration capability** — D-039 sets B
  primary / A fallback so it holds regardless.
- Layered-source format (PSD vs ORA) — pick one for the brief.
- Numeric 164B.3 thresholds (IoU/ΔE) — visual gate for MVP if no tooling.
- Eye-box dims, mask pixels, QA calibrations — **downstream of the produced base**.

> D-039 locks the **method + brief + deliverables + gates + handoff only**. No base, image,
> mask, asset, code, or tooling is produced; `AVATAR_V2` stays OFF.
