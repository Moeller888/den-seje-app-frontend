# 164V — Avatar Item Candidate Human Review + Promotion Plan (`glasses.round.basic`)

**Documentation only.** No commit, no push, nothing staged. Nothing activated.
Defines the review gate and the promotion path from a build-only candidate to a future
runtime/shop-ready asset — without promoting or activating anything now.

Builds on: 164S (eye semantics), 164T (eye-box + front-only mask), 164U (candidate manifest pipeline).
See also: [`164u-first-avatar-item-candidate-pipeline.md`](164u-first-avatar-item-candidate-pipeline.md),
[`164p-anchor-taxonomy-equipment-production-rules.md`](164p-anchor-taxonomy-equipment-production-rules.md),
[`164q-glasses-fitter-review-worksheet.md`](164q-glasses-fitter-review-worksheet.md).

---

## A. Section status
- **Candidate only** — this is a review instrument, not an activation.
- No runtime activation.
- No shop activation.
- No DB rows.
- No assets promotion (nothing copied into `assets/*`).
- No `AVATAR_V2` change (still `false`).

## B. Item under review
| Field | Value |
|---|---|
| `itemId` | `glasses.round.basic` |
| `displayName` | Basic Round Glasses |
| `slot` | `glasses` (underlying clip mask = `eyes` slot) |
| `equipmentType` | `glasses.round` |
| generation type | `procedural` (deterministic-local; no AI, no network) |
| current status | **build-only candidate** |

## C. Review artifacts (exact files a human should inspect)
All are gitignored, regenerable build outputs — review-only, never shipped as-is:
- `tools/avatar/build/previews/eyes-preview-v1.png` — 6× eyes; pupil/iris/glasses-lens markers + 164T boxes.
- `tools/avatar/build/previews/head-preview-v1.png` — whole-head context (2×).
- `tools/avatar/build/previews/anchor-overlay-v1.png` — full anchor overlay.
- `tools/avatar/build/procedural/glasses-procedural-composite.png` — glasses over Master, **unclipped** (clean placement view).
- `tools/avatar/build/ai-test/previews/glasses-test-composite.png` — glasses through the clip/QA gate.
- `tools/avatar/build/ai-test/reports/glasses-test-qa.json` — machine QA metrics.
- `tools/avatar/build/items/glasses.round.basic/manifest.json` — candidate manifest (status + provenance + QA summary).

> **Source-of-truth vs review-only.** Source-of-truth (committed) = the *generators/config*:
> `tools/avatar/extract-anchor-masks.mjs` (anchors/masks incl. 164S/164T constants),
> `tools/avatar/generate-procedural-glasses.mjs` (item geometry), `tools/avatar/ai-test-item.mjs`
> (QA gate), `tools/avatar/create-item-candidate-manifest.mjs` (manifest), and the `docs/164*`.
> Everything under `tools/avatar/build/*` (PNGs, QA report, manifest) is **review-only / regenerable**
> and is NOT source-of-truth — it is reproduced from the Master + the committed generators.

## D. Machine QA gates (must all hold)
- `pass = true`
- `pupilFrameIntrusion.total = 0`
- `outsideMaskPx = 0`
- `preClipOverflowPx = 0`
- manifest generated successfully (`create-item-candidate-manifest` exits OK)
- all outputs remain under `tools/avatar/build/*`
- no `assets/*` output
- (`lensError` is a coarse half-centroid proxy — reported, not gated, until the 164P typed lens-centre fitter exists.)

_Latest run: `pass=true`, `pupilFrameIntrusion.total=0`, `outsideMaskPx=0`, `preClipOverflowPx=0`, manifest OK._

## E. Human visual PASS criteria
- Glasses read as glasses immediately.
- Both lenses surround the eyes naturally.
- Pupils remain unobstructed.
- No long temples or ear hooks.
- Bridge looks acceptable.
- Glasses do not appear clipped.
- Style is acceptable for an MVP proof.
- Item does NOT alter face, eyes, skin, hair, body, or the Master.
- Item is safe for children.

## F. Conditional PASS criteria (acceptable, non-blocking notes)
- Procedural / SVG-like look.
- Bridge slightly heavy.
- Style polish needed later.
- Line weight could improve.
- Not final premium shop art.

A **conditional PASS** means: accepted as MVP pipeline proof, with the noted polish deferred to a
later (still procedural) iteration — it does NOT authorize promotion to `assets/*` or activation.

## G. FAIL criteria
- Frame crosses a pupil.
- Lenses misalign with the eyes.
- Side arms / ear hooks appear.
- Item looks like goggles/mask instead of glasses.
- Clipping visible.
- Generated item changes avatar anatomy (face/eyes/skin/hair/body).
- Asset leaks outside the intended slot/mask.
- Unsafe / inappropriate item.

Any FAIL → fix the generator/mask/anchors (not the gate), regenerate, re-review. Do not promote.

## H. Promotion path (future steps — NONE done in 164V)
1. **Human PASS recorded** (Decision record below filled in).
2. Promote the reviewed generated overlay to a real **versioned asset path under `assets/*`** — in a
   future section (an explicit, deliberate copy/version step; not automated here).
3. Define the **item metadata format for runtime** (id, slot, asset ref, z-order, etc.).
4. Add a **shop/catalog entry** in code or DB — in a future section.
5. Add **runtime layering** only when the `AVATAR_V2` activation plan is ready.
6. Add **tests** for rendering/layering.
7. **Only then** consider DB/shop activation.

## I. Explicit non-actions (164V does NOT)
- Copy generated files into `assets/*`.
- Create shop rows.
- Change the DB / RPC / migrations.
- Change runtime / frontend.
- Enable `AVATAR_V2`.
- Generate bulk items.
- Call OpenAI / the network.
- Activate the item in any way.

## J. Decision record
- **Human review status:** pending
- **Reviewer:** _______________________
- **Date:** _______________________
- **Decision:** ☐ PASS ☐ Conditional PASS (notes) ☐ FAIL
- **Notes:** _______________________

---

### How to regenerate the review artifacts
```
npm run avatar:extract-masks
npm run avatar:generate-procedural-glasses
npm run avatar:ai-test-item
npm run avatar:create-item-candidate-manifest
```
(Equivalents in `tools/avatar/package.json`: `extract-masks`, `generate-procedural-glasses`,
`ai-test-item`, `create-item-candidate-manifest`.)

### Boundaries honored
No OpenAI, no network, no AI/bulk generation. No runtime/frontend, no DB/RPC/migrations, no
`assets/*`, no shop rows, no `AVATAR_V2` change. No commit, no push, nothing staged.
