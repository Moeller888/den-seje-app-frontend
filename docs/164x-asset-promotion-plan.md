# 164X — Asset Promotion Plan for `glasses.round.basic`

**Plan / spec only. Documentation only.** No commit, no push, nothing staged. Nothing copied into
`assets/*`. No runtime activation, no shop rows, no DB/RPC/migrations, no `AVATAR_V2` change, no bulk
generation. This section defines **how** a build-only candidate could *later* become a real versioned
runtime asset — it does **not** perform any promotion.

Builds on: 164S (strict eye semantics), 164T (eye-box + front-only glasses mask),
164U (candidate manifest pipeline), 164V (human review + promotion-path gate),
164W (recorded **CONDITIONAL PASS** for `glasses.round.basic`).
See: [`164u-first-avatar-item-candidate-pipeline.md`](164u-first-avatar-item-candidate-pipeline.md),
[`164v-avatar-item-human-review-promotion-plan.md`](164v-avatar-item-human-review-promotion-plan.md),
[`164w-glasses-round-basic-human-review-decision.md`](164w-glasses-round-basic-human-review-decision.md),
[`164p-anchor-taxonomy-equipment-production-rules.md`](164p-anchor-taxonomy-equipment-production-rules.md).

---

## A. Section status
- **Plan/spec only** — a written procedure, not an execution.
- No runtime activation (`runtimeActivated: false`).
- No shop activation (`shopActivated: false`).
- No DB rows (`dbRowsCreated: false`).
- No assets promotion — nothing copied into `assets/*`.
- No `AVATAR_V2` change (still `false`, `av2Required: false`).
- The candidate remains a **build-only candidate** with `humanReviewRequired: true`.

## B. Candidate identity (recap — unchanged from 164U/164W)
| Field | Value |
|---|---|
| `itemId` | `glasses.round.basic` |
| `displayName` | Basic Round Glasses |
| `slot` | `eyes` (the avatar layer slot; "glasses" is the colloquial name) |
| `equipmentType` | `glasses.round` |
| generation type | `procedural` (deterministic-local; no AI, no network) |
| source generator | `tools/avatar/generate-procedural-glasses.mjs` |
| candidate manifest | `tools/avatar/build/items/glasses.round.basic/manifest.json` (gitignored, build-only) |
| human review | **CONDITIONAL PASS** (164W) |

> **Slot fact (verified).** In `den-seje-app-frontend/js/avatar-layers.js`, the runtime slot for
> glasses is **`eyes`** (`SLOTS.eyes`, `z: 7`, label "Briller", category "Ansigt"). Any promotion
> metadata MUST use `slot: "eyes"` to match the existing layer system. The `slot: "glasses"` wording
> in earlier candidate docs is a label, not the runtime slot key.

---

## C. Findings + open decisions (post-investigation)
The original 164X draft flagged two suspected mismatches. The **`glasses-round.svg` relationship
investigation** (read-only sweep of runtime, shop seed, gamefeel/demo, golden tests, tooling, docs)
has now resolved the collision question and refined the format question. Updated status below — items
marked **RESOLVED** need no further decision; items marked **DECISION REQUIRED** remain owner gates.

1. **Format — PNG candidate vs. SVG asset convention → resolve toward SVG.**
   Every avatar asset on disk is **SVG** (`base/*.svg`, `hair/*.svg`, and the existing
   `glasses-round.svg`); the only consumers that load the file path (`gamefeel.html`, the c2-golden
   test `c2-cosmetics.html`) both load `.svg`. The 164U/164W candidate is a **procedural PNG raster**.
   The round-glasses geometry is trivially expressible as SVG primitives (the existing
   `glasses-round.svg` is circles + paths), so the procedural geometry can be **re-emitted as SVG**
   with no runtime penalty (the live renderer binds via DB `image_url` and is format-agnostic).
   **Recommendation (strong):** promote as **SVG**, front-only; a PNG, if produced, is a non-shipped
   preview only. Final format choice is still confirmed by the executing section.

2. **Naming collision — `glasses-round.svg` already exists → RESOLVED (no real collision).**
   Investigation classification: the existing `glasses-round.svg` is a **legacy/demo + test asset**,
   **not bound to the live shop render**. The live shop row `glasses-round`
   (`20260511000300_shop_inventory.sql`) has **`image_url = NULL`**, and both runtime render paths
   (`avatar.html:911–913` legacy, `:974` C2) resolve item art from `image_url` — so the SVG file is
   never loaded by the app; only `gamefeel.html` and the golden test reference it (hardcoded).
   The proposed versioned name `glasses-round-basic-v1.svg` is a **distinct filename**, and the
   candidate `itemId` `glasses.round.basic` is a **distinct id** from the shop row `glasses-round`.
   **No overwrite and no id collision — safe by construction.**

3. **⚠ Existing `glasses-round.svg` has temple arms → it MUST NOT be reused as the promoted asset.**
   The existing SVG draws **"Left temple arm" / "Right temple arm"** (side arms). That violates the
   164Q/164T **front-only** production rule and is an explicit **FAIL** criterion in 164V ("Side arms /
   ear hooks appear"). The existing SVG is therefore a **superseded older full-frame design**; the
   front-only `glasses.round.basic` candidate replaces it. Promotion uses the candidate geometry, never
   the legacy SVG.

4. **DECISION REQUIRED (product, not a blocker) — replace vs. new item.**
   Either (a) **bind the candidate to the existing `glasses-round` shop row** by filling its NULL
   `image_url` and retiring the legacy SVG/placeholder, or (b) **introduce a new shop item**
   `glasses.round.basic` alongside it. Both are collision-safe; this is an owner product call made in
   the executing section (see §J), not in 164X.

5. **DECISION REQUIRED — onboarding pipeline ownership.**
   The repo has `avatar-asset-onboarding`, `avatar-asset-validator`, and `avatar-ingestion` edge
   functions plus `2026-04-28` avatar-asset migrations. Does promotion go *through* that existing
   onboarding/validator path (preferred — reuse, do not reinvent), or is it a manual static-asset add?
   The executing section must confirm the validator accepts the SVG format chosen in §C.1.

> Per the 164X guardrail "keep it docs-only unless a mismatch is found": the investigation report's §7
> recommendations are folded in above. Items 1–3 are now settled findings; items 4–5 remain explicit
> owner gates. Nothing here is patched in code — these are documented decisions only.

---

## D. Source-of-truth model (what is canonical vs. derived)
Promotion does **not** change what is source-of-truth. The hierarchy stays:

- **Canonical source-of-truth (committed):** the Master + the deterministic generators/config —
  `tools/avatar/extract-anchor-masks.mjs` (anchors/masks incl. 164S/164T constants),
  `tools/avatar/generate-procedural-glasses.mjs` (item geometry),
  `tools/avatar/ai-test-item.mjs` (QA gate),
  `tools/avatar/create-item-candidate-manifest.mjs` (manifest), and the `docs/164*` records.
- **Derived / regenerable (gitignored, never shipped as-is):** everything under
  `tools/avatar/build/*` — PNGs, the QA report, the candidate manifest.
- **Promoted asset (new, only created by a future section):** a versioned, reviewed,
  format-correct file under `den-seje-app-frontend/assets/avatar/glasses/` plus its runtime metadata.

**Rule:** a promoted asset is a *deliberate, human-reviewed snapshot* of generator output, copied
once into `assets/*` with a frozen version. The generator remains the source-of-truth; the promoted
asset is a frozen, shippable derivative. A promoted asset is never edited in place — a new visual
means a new version (see §E).

## E. Asset naming + versioning scheme (proposed)
Designed to avoid the §C.2 collision and to make versions explicit and immutable.

- **Promoted asset path (proposed):**
  `den-seje-app-frontend/assets/avatar/glasses/glasses-round-basic-v1.svg`
  (or `.png` only if §C.1 decision selects PNG).
- **Naming rule:** `<equipmentTypeKebab>-<variantKebab>-v<N>.<ext>` →
  `glasses-round-basic-v1.svg`. Derived deterministically from `itemId` `glasses.round.basic`
  (`.`→`-`) + an explicit version suffix.
- **Versioning rule:** versions are **immutable and additive**. `-v1` is never edited after promotion;
  a polish pass (the deferred 164W style work) produces `-v2`, and the metadata `assetVersion` is
  bumped to point at it. Old versions stay on disk until a deliberate retirement step.
- **No collision (confirmed):** `glasses-round-basic-v1.svg` is distinct from the pre-existing
  `glasses-round.svg`, so promotion cannot overwrite it. Per §C.2 the existing file is a legacy/demo +
  test asset not bound to the live shop render, so the path is safe by construction.

## F. Runtime / shop / DB metadata shape (proposed, for a FUTURE section)
Proposed only — not written anywhere in 164X. Field names align with the existing layer + rarity
systems in `avatar-layers.js`.

```jsonc
{
  "itemId": "glasses.round.basic",
  "displayName": "Basic Round Glasses",
  "slot": "eyes",                       // MUST match avatar-layers.js SLOTS key (z:7)
  "equipmentType": "glasses.round",
  "assetVersion": "v1",
  "assetPath": "/assets/avatar/glasses/glasses-round-basic-v1.svg",
  "rarity": "common",                   // from RARITY_* in avatar-layers.js; TBD by owner
  "price": null,                        // coins; set only at shop-activation, a later section
  "generationType": "procedural",
  "sourceGenerator": "tools/avatar/generate-procedural-glasses.mjs",
  "provenance": {
    "candidateManifest": "tools/avatar/build/items/glasses.round.basic/manifest.json",
    "humanReview": "164W CONDITIONAL PASS",
    "qa": { "pass": true, "pupilFrameIntrusion": 0, "outsideMaskPx": 0, "preClipOverflowPx": 0 }
  },
  "runtimeActivated": false,
  "shopActivated": false
}
```

- `slot`, `assetPath`, `rarity` are the fields the existing renderer/shop need; everything else is
  provenance/audit.
- **Layering is already solved:** the `eyes` slot z-order (7) exists; promotion does not add a new
  slot or change z-order. No new pattern is introduced.
- Where this metadata physically lives (static JS table vs. DB row) is the §C.5 onboarding decision and
  is NOT chosen here.

## G. Required validation gates BEFORE promotion (all must hold)
A future section may promote **only** when every gate below is green. These extend, not replace, the
164U machine gates and the 164V human gates.

1. **Machine QA (re-run, must reproduce 164W):** `pass=true`, `pupilFrameIntrusion.total=0`,
   `outsideMaskPx=0`, `preClipOverflowPx=0`, `opaquePx>0`, manifest generates OK.
2. **Recorded human PASS / Conditional PASS** exists (✅ 164W = CONDITIONAL PASS). A FAIL blocks
   promotion outright.
3. **§C items settled** — format (C.1, resolve to SVG), collision (C.2, RESOLVED), legacy-asset
   supersession (C.3, do not reuse the temple-armed SVG); and the two owner gates recorded — replace
   vs. new item (C.4) and onboarding path (C.5) each have a recorded human decision.
4. **Format conformance:** the chosen promoted file passes `avatar-asset-validator` (if that path is
   used) and renders in the `eyes` slot without clipping at runtime sizes.
5. **No anatomy leak:** promoted asset alters only the `eyes` slot — face/eyes/skin/hair/body/Master
   unchanged (re-confirm visually post-format-conversion, since SVG re-emit could shift geometry).
6. **Determinism:** the promoted asset is reproducible from the committed generator (no manual pixel
   edits); the promotion is a copy/convert + freeze, not a hand-paint.
7. **Tests green:** existing Playwright suite stays green; add a rendering/layering test for the item
   before shop activation (test added in the executing section, not here).
8. **Boundary check:** the promotion PR touches only `assets/*` + the metadata table/migration it
   declares — no unrelated runtime/DB drift, no `AVATAR_V2` flip unless that is its explicit scope.

## H. Promotion procedure (FUTURE section — none performed in 164X)
Ordered, deliberate, human-gated. Each step is a separate, reviewable change.

1. Record the §C owner decisions still open — replace-vs-new-item (C.4) and onboarding path (C.5);
   findings C.1 (SVG), C.2 (no collision), C.3 (do not reuse the legacy temple-armed SVG) are settled.
2. Produce the format-correct, versioned asset (`glasses-round-basic-v1.*`) deterministically from the
   generator; re-run §G.1 QA on the converted asset.
3. Place the file under `den-seje-app-frontend/assets/avatar/glasses/` — the first and only `assets/*`
   write, done deliberately, reviewed in its own diff.
4. Register runtime metadata (§F) in the chosen location (static table or DB row), `runtimeActivated`
   still gated.
5. Add a rendering/layering test; run the full Playwright suite; require green.
6. Activate in runtime (still **no** shop) behind whatever `AVATAR_V2` decision applies.
7. **Only then**, in a further separate section, create the shop/catalog entry, set `price`/`rarity`,
   and flip `shopActivated`.

Each numbered step is its own commit/PR with its own review — never bundled.

## I. Rollback plan
Promotion is built to be cheaply reversible at every step.

- **Pre-asset-write:** nothing to roll back — build outputs are gitignored and regenerable.
- **After asset write (step 3):** `git revert` the asset-add commit; the versioned filename means no
  pre-existing file was overwritten (§E), so revert is clean and restores the prior tree exactly.
- **After metadata register (step 4):** revert the metadata commit/migration; because `slot:eyes`
  already exists, removing the row/entry leaves the layer system in its prior valid state (item simply
  not offered). For a DB row, the down-migration deletes only that `itemId`.
- **After runtime activation (step 6):** flip `runtimeActivated`/`AVATAR_V2` back; students with the
  item equipped fall back to no-item in the `eyes` slot (no crash — slot is optional).
- **After shop activation (step 7):** `shopActivated:false` hides it from the shop; refunds, if any
  purchases occurred, follow the existing `REFUND` event path in `js/progression.js` — not a new
  mechanism.
- **Invariant:** at no rollback point is the Master, the generators, or any other slot touched.

## J. Which future section actually performs promotion
- **164X (this doc):** plan/spec only. Decides nothing about the §C mismatches; performs no writes.
- **164Y (proposed, not started):** resolve §C mismatches + produce and place the versioned asset
  (steps H.1–H.3) — the first section allowed to write under `assets/*`.
- **164Z (proposed, not started):** runtime metadata + rendering test + runtime activation
  (steps H.4–H.6).
- **A later section (proposed):** shop/DB activation + pricing/rarity (step H.7).

164X does not authorize 164Y/164Z to run — each requires its own explicit go-ahead.

## K. Explicit non-actions (164X does NOT)
- Copy or convert any file into `assets/*`.
- Create or modify runtime metadata, shop rows, DB rows, RPCs, or migrations.
- Change runtime / frontend behavior.
- Enable `AVATAR_V2` or change any flag.
- Generate, bulk-generate, or re-run any generator that writes outside `tools/avatar/build/*`.
- Call OpenAI or the network.
- Overwrite or delete the existing `glasses-round.svg`.
- Commit, push, or stage anything (including this doc) unless explicitly instructed after review.

---

### Boundaries honored
No OpenAI, no network, no AI/bulk generation. No runtime/frontend, no DB/RPC/migrations, no
`assets/*` write, no shop rows, no `AVATAR_V2` change. Plan/spec only. No commit, no push, nothing
staged.
