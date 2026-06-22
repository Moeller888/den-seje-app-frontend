# 164W — Human Review Decision Record: `glasses.round.basic`

**Human review decision record only.** No commit, no push, nothing staged. Nothing activated.
Applies the 164V review gate to the first avatar item candidate and records a concrete decision.

See: [`164v-avatar-item-human-review-promotion-plan.md`](164v-avatar-item-human-review-promotion-plan.md)
(review gate), [`164u-first-avatar-item-candidate-pipeline.md`](164u-first-avatar-item-candidate-pipeline.md)
(candidate pipeline).

---

## A. Section status
- Human review **decision record only**.
- No runtime activation.
- No shop activation.
- No DB rows.
- No assets promotion (nothing copied into `assets/*`).
- No `AVATAR_V2` change (still `false`).

## B. Candidate identity
| Field | Value |
|---|---|
| `itemId` | `glasses.round.basic` |
| `slot` | `glasses` (underlying clip mask = `eyes` slot) |
| `equipmentType` | `glasses.round` |
| generator | `procedural` (deterministic-local) |
| source | `tools/avatar/generate-procedural-glasses.mjs` |
| manifest | `tools/avatar/build/items/glasses.round.basic/manifest.json` |

## C. Machine QA result (regenerated for this decision)
| Metric | Value | Required |
|---|---|---|
| `pass` | **true** | true ✅ |
| `pupilFrameIntrusion.total` | **0** | 0 ✅ |
| `outsideMaskPx` | **0** | 0 ✅ |
| `preClipOverflowPx` | **0** | 0 ✅ |
| `opaquePx` | **5472** | > 0 ✅ |
| `lensError` L / R | **9px / 9px** | reported, not gated |
| manifest status | **OK** (`status: candidate`, `humanReviewRequired: true`) | generated ✅ |

All outputs under `tools/avatar/build/*` (gitignored, regenerable); **no** outputs under `assets/*`.

## D. Human visual review result

**Human review decision: CONDITIONAL PASS**

**Rationale (PASS criteria met):**
- Glasses read clearly as glasses.
- Both lenses surround the eyes naturally enough for MVP proof.
- Pupils remain unobstructed.
- No long temples / no ear hooks.
- No visible clipping.
- Item does not alter face, eyes, skin, hair, body, or the Master.
- Safe for children.
- Procedural style is acceptable as pipeline proof.

**Conditional polish notes (non-blocking):**
- The glasses still look somewhat procedural / SVG-like.
- Bridge / line weight may need visual polish before final premium shop art.
- Approved as a **pipeline proof and candidate**, not as final premium catalog art.

## E. PASS / FAIL mapping against 164V
- **No hard FAIL criteria observed** — no frame-over-pupil, no lens misalignment, no side arms/ear
  hooks, not goggles/mask-like, no visible clipping, no anatomy change, no slot/mask leak, nothing
  unsafe.
- **Conditional PASS is appropriate**: the item satisfies the alignment, safety, and clipping
  criteria, but still warrants the style-polish notes above before final premium art.

## F. Promotion implications
This CONDITIONAL PASS authorizes a **future section to plan** asset promotion. It does **NOT** itself:
- copy generated files into `assets/*`;
- activate runtime;
- create shop entries;
- create DB rows;
- enable `AVATAR_V2`;
- start bulk generation.

The item remains a **build-only candidate**; the manifest still carries `runtimeActivated: false`,
`shopActivated: false`, `dbRowsCreated: false`, `av2Required: false`.

## G. Next recommended section
**164X — Asset Promotion Plan for `glasses.round.basic`.**
164X should be a **plan/spec first** (how an approved overlay becomes a versioned `assets/*` asset +
runtime metadata + shop/catalog + tests), **not** immediate runtime activation.

## H. Decision record (filled)
- **Human review status:** CONDITIONAL PASS
- **Reviewer:** project owner (solo founder)
- **Date:** 2026-06-22
- **Decision:** ☐ PASS ☑ Conditional PASS (notes) ☐ FAIL
- **Notes:** Approved as MVP pipeline proof + candidate; style polish (procedural/SVG-like look,
  bridge/line weight) deferred to a later still-procedural iteration; not final premium catalog art;
  no promotion/activation authorized by this record.

### Boundaries honored
No OpenAI, no network, no AI/bulk generation. No runtime/frontend, no DB/RPC/migrations, no
`assets/*`, no shop rows, no `AVATAR_V2` change. No commit, no push, nothing staged.
