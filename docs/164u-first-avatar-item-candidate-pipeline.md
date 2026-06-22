# 164U — First Avatar Item Candidate Pipeline (`glasses.round.basic`)

**Status: candidate pipeline only — STOPPED for human review.**
No commit, no push, nothing staged. Deterministic, non-AI, no network. Nothing activated.

_Builds on the approved foundation: 164S strict eye semantics, 164T recalibrated eye boxes +
front-only glasses mask, the deterministic procedural glasses generator, and the passing glasses QA
(`pass=true`, `pupilFrameIntrusion.total=0`, `outsideMaskPx=0`, `preClipOverflowPx=0`)._

---

## Purpose
Turn the procedural glasses *proof* into a structured, reviewable **item candidate** — a named,
QA-gated, build-only artifact set — without touching the app, shop, or database.

## What 164U does
1. Defines the first canonical item-candidate identity (`glasses.round.basic`).
2. Adds a small deterministic tool **`tools/avatar/create-item-candidate-manifest.mjs`** (+ npm
   scripts) that:
   - reads the latest anchor template, eyes mask, procedural overlay, and glasses QA report;
   - **hard-gates** on the approved QA thresholds (see below) and FAILS LOUD if any are missing/failing;
   - writes a candidate **manifest** under `tools/avatar/build/items/glasses.round.basic/manifest.json`.
3. Documents the candidate, its build outputs, and the gates that still stand between a candidate
   and any runtime/shop activation.

## What 164U does NOT do
- Does **not** activate the item in runtime/frontend (`runtimeActivated: false`).
- Does **not** add it to the shop (`shopActivated: false`).
- Does **not** create DB/RPC/migration rows (`dbRowsCreated: false`).
- Does **not** require or change `AVATAR_V2` (`av2Required: false`, still `false`).
- Does **not** write under `assets/*`. Does **not** call OpenAI / the network / bulk generation.

## Item candidate identity
| Field | Value |
|---|---|
| `itemId` | `glasses.round.basic` |
| `displayName` | Basic Round Glasses |
| `slot` | `glasses` (underlying clip mask = `eyes` slot) |
| `equipmentType` | `glasses.round` |
| `generator` / `generationType` | `procedural` / `deterministic-local` |
| `sourceScript` | `tools/avatar/generate-procedural-glasses.mjs` |
| `status` | `candidate` |
| `humanReviewRequired` | `true` |

## Generated build outputs (all under `tools/avatar/build/*`, gitignored, regenerable)
- Anchor template: `tools/avatar/build/anchors/avatar-anchor-template-v1.json`
- Eyes mask: `tools/avatar/build/masks/mask-eyes-v1.png`
- Procedural overlay: `tools/avatar/build/procedural/glasses-procedural-v1.png`
- Procedural composite (clean): `tools/avatar/build/procedural/glasses-procedural-composite.png`
- Gate clipped item: `tools/avatar/build/ai-test/items/glasses-test-clipped.png`
- Gate composite: `tools/avatar/build/ai-test/previews/glasses-test-composite.png`
- QA report: `tools/avatar/build/ai-test/reports/glasses-test-qa.json`
- **Candidate manifest: `tools/avatar/build/items/glasses.round.basic/manifest.json`**

## QA gates (hard — the manifest is NOT written unless ALL pass)
- `pass === true`
- `pupilFrameIntrusion.total === 0` (frame clears the pupils — uses the 164S `pupilCenter`)
- `outsideMaskPx === 0` (item stays inside the 164T front-only eyes mask)
- `preClipOverflowPx === 0` (mask does not clip a correctly-placed front frame)
- `opaquePx > 0` (item is non-empty)
The gates are **not** loosened to pass. (`lensError` is a coarse half-centroid proxy and is reported,
not gated, until the 164P typed lens-centre fitter exists.)

## Human review gates (still required before any activation)
The manifest carries `humanReviewRequired: true` and inherits the QA report's review checklist:
no avatar geometry/skin/hair/eyes copied; reads as a glasses item; style fits; content safe (kids
platform); pupils clear; lenses centred on the eye openings.

## Why outputs stay under `tools/avatar/build/*`
That tree is **gitignored, regenerable QA/build output — not runtime assets**. Keeping candidates
there means nothing can be served, shipped, or shop-listed by accident; the canonical Master and
`assets/*` are never modified; and the whole candidate can be re-derived deterministically from the
Master + anchors at any time.

## Future steps required BEFORE runtime/shop activation (separate, human-gated)
1. Human visual sign-off on the candidate composite + manifest.
2. Polish pass (frame weight / bridge / style) if desired — still procedural.
3. A deliberate promotion step that places an approved, versioned asset where the runtime expects it
   and registers the item — **with** the corresponding shop/DB/RPC and `AVATAR_V2` decisions made
   explicitly. None of that is in 164U.

## Run order
```
npm run avatar:extract-masks
npm run avatar:generate-procedural-glasses
npm run avatar:ai-test-item
npm run avatar:create-item-candidate-manifest
```
(Equivalents exist in `tools/avatar/package.json`: `extract-masks`, `generate-procedural-glasses`,
`ai-test-item`, `create-item-candidate-manifest`.)

## Boundaries honored
No OpenAI, no network, no AI/bulk generation. No runtime/frontend, no DB/RPC/migrations, no
`assets/*`, no shop rows, no `AVATAR_V2` change. No commit, no push, nothing staged.
