# 164Y — Asset Promotion Decision + SVG Readiness for `glasses.round.basic`

**Decision / spec only. Documentation only.** No commit, no push, nothing staged. No asset promotion,
no runtime activation, no shop activation, no DB rows, no migrations, no `AVATAR_V2` change, no
OpenAI/network, no bulk generation. This section **records owner decisions** for the gates 164X left
open — it performs none of them.

Builds on / resolves: [`164x-asset-promotion-plan.md`](164x-asset-promotion-plan.md) (gates C.4, C.5,
and the format question), [`164w-glasses-round-basic-human-review-decision.md`](164w-glasses-round-basic-human-review-decision.md)
(CONDITIONAL PASS), [`164v-avatar-item-human-review-promotion-plan.md`](164v-avatar-item-human-review-promotion-plan.md)
(review gate). Date: 2026-06-23.

---

> **Executed by [`164z-svg-reemit-glasses-round-basic.md`](164z-svg-reemit-glasses-round-basic.md):**
> the SVG re-emit (D1) and the asset promotion (D3 manual static add) were carried out — the
> reviewed front-only SVG now lives at `assets/avatar/glasses/glasses-round-basic-v1.svg` (inert; no
> DB/runtime/shop binding). The D2 Option A `image_url` binding remains a future, separately-approved
> step (proposed 165A).

## A. Section status
- **Decision/spec only** — records the three owner decisions; executes nothing.
- No asset promotion (nothing written/copied into `assets/*`).
- No runtime activation (`runtimeActivated: false`).
- No shop activation (`shopActivated: false`).
- No DB rows / no migrations (`dbRowsCreated: false`).
- No `AVATAR_V2` change (still `false`, `av2Required: false`).
- Candidate remains **build-only** with `humanReviewRequired: true`.

## B. Current candidate
| Field | Value |
|---|---|
| `itemId` (internal) | `glasses.round.basic` |
| future asset candidate filename | `glasses-round-basic-v1.svg` |
| slot | `eyes` (the runtime layer slot in `js/avatar-layers.js`, z=7, label "Briller"; "glasses" is the colloquial name) |
| `equipmentType` | `glasses.round` |
| review decision | **CONDITIONAL PASS** (164W) |
| candidate status | **build-only** (manifest gitignored, regenerable) |

**QA re-verified for this section** (regenerated build-only artifacts, 2026-06-23):

| Metric | Value | Required |
|---|---|---|
| `pass` | true | true ✅ |
| `pupilFrameIntrusion.total` | 0 | 0 ✅ |
| `outsideMaskPx` | 0 | 0 ✅ |
| `preClipOverflowPx` | 0 | 0 ✅ |
| `opaquePx` | 5472 | > 0 ✅ |
| `lensError` L / R | 9px / 9px | reported, not gated |
| manifest | `status: OK`, `candidate`, `humanReviewRequired: true` | OK ✅ |

All outputs under `tools/avatar/build/*` (gitignored). No `assets/*` output.

---

## ⚠ Correction to a 164X finding (material — read before Decision 2)
164X §C.2 classified the existing `glasses-round.svg` as a **legacy/demo + test asset, "not bound to
the live shop render" with `image_url = NULL`**. **That is incorrect.** 164X only inspected the older
seed migration `20260511000300_shop_inventory.sql` (which inserts the row with `image_url = NULL`) and
the runtime render code. It missed the **later** migration
[`supabase/migrations/20260521000000_avatar_slot_system.sql`](../supabase/migrations/20260521000000_avatar_slot_system.sql)
(lines 41–42), which **binds the row**:

```sql
UPDATE public.shop_items
SET slot_type = 'eyes', image_url = '/assets/avatar/glasses/glasses-round.svg', layer_order = 7
WHERE id = 'glasses-round' AND (slot_type IS NULL OR slot_type IN ('glasses','eyes'));
```

**Corrected status:** `glasses-round` is a **live, DB-bound, runtime-rendered shop item** — "Runde
Briller", 90 coins, common, slot `eyes`, z=7 — whose bound asset is the existing
`/assets/avatar/glasses/glasses-round.svg` (assuming migrations are applied; production DB not queried
per the no-DB-access rule). The earlier "demo/test only, NULL image_url" conclusion is superseded.

**What still holds from 164X:** the existing `glasses-round.svg` **has temple arms** (the SVG draws
"Left/Right temple arm"), which violates the 164Q/164T **front-only** rule and the 164V FAIL criteria.
So the live glasses asset is an **off-spec older full-frame design** — and the front-only
`glasses.round.basic` candidate is its intended **replacement/upgrade**, not a net-new concept.

This correction strengthens Decision 2 (Option A) below.

---

## C. Decision 1 — Format
**Decision: the future promoted asset is SVG. CONFIRMED.**
- Future promoted format = **SVG** (`glasses-round-basic-v1.svg`), front-only.
- The procedural **PNG** (`glasses-procedural-v1.png`) remains **build/review preview only** — never
  shipped as the runtime asset.
- The existing legacy `glasses-round.svg` **must not be reused** as the promoted asset because it has
  **temple arms** (off-spec vs. 164Q/164T front-only).
- The future SVG **must be front-only** (two lens rings + bridge + tiny front-only side tabs; no long
  temples, no ear hooks).

**Rationale:** every live 2D avatar asset on disk is SVG and every bound `shop_items.image_url` points
at `/assets/avatar/**/*.svg` (see the `20260521` migration — hats, masks, capes, the existing
glasses). SVG matches the slot's siblings and the live renderer's expectations exactly.

**⚠ Readiness gap (for 164Z, not now):** the current generator
`tools/avatar/generate-procedural-glasses.mjs` emits a **PNG raster only** (it draws pixels onto a
1024×1536 canvas). **There is no SVG emitter today.** Promotion to SVG therefore requires a new
deterministic SVG re-emit step (same front-only geometry, expressed as SVG primitives:
two lens ellipses/rings + bridge + front tabs, sized to the live avatar coordinate space). This is a
**164Z prerequisite**, documented here, **not built in 164Y**. No tooling is changed in this section.

## D. Decision 2 — Replace existing row vs. create a new item
**Options:**

**Option A — bind the promoted asset to the existing `glasses-round` shop row** (update its
`image_url` from `glasses-round.svg` → `glasses-round-basic-v1.svg`; keep the same row, price, name,
slot).
- **Pros:** the row already exists and is live (Runde Briller, 90 coins, common, slot `eyes`); no
  duplicate glasses item; preserves existing user ownership / equipped state for anyone who already
  owns it; MVP continuity; it is a clean **asset upgrade** (off-spec temple-arm → front-only) of one
  item; minimal surface (one `image_url` update in a future migration).
- **Cons:** changes the appearance of an item users may already own (acceptable: it's a quality
  upgrade of the same concept, same name/price/slot); requires a future DB migration to flip
  `image_url` (a deliberate, separate step — not in 164Y/164Z's asset-only scope).

**Option B — create a new shop item id/row for `glasses.round.basic`.**
- **Pros:** leaves the existing row untouched; clean provenance for a "new" catalog SKU.
- **Cons:** produces **two round-glasses items** (the old off-spec one stays live unless separately
  retired); duplicate/confusing catalog; more DB surface (new row + pricing/rarity decisions);
  no user-ownership continuity; contradicts "one canonical round-glasses item" for MVP.

**Recommended choice: Option A (bind to the existing `glasses-round` row).**
Given the §correction above — the row is already live and bound to an off-spec asset — Option A is the
natural, lowest-surface path: promote the front-only SVG and, in a later DB step, repoint the existing
row's `image_url`. Keep `glasses.round.basic` as the **internal** candidate/manifest/docs id; **do not**
create a new DB row, and **do not** update `image_url` in 164Y/164Z (that DB change is a separately
approved later step). No strong reason against Option A was found; on the contrary, the corrected
DB-binding evidence reinforces it.

## E. Decision 3 — Onboarding / validator path
**Investigation result — the existing `avatar-asset-*` stack does NOT fit a 2D SVG item.**
The repo has `avatar-asset-onboarding`, `avatar-asset-validator`, `avatar-generation`,
`avatar-ingestion` (edge functions + `20260428`/`20260430` migrations). Their
`metadata.schema.json` + `constants.ts` describe a **3D GLB pipeline**:
`export_format: "glb"` (const), `texture_format: "png"` (const), `polycount_*`, `texture_resolution`
(128/256/512), `attachment_bone`/`rig_required`, and slots **`hat | shirt | shoe | inventory`** with
attachment-bone contracts. None of that maps to the **live 2D SVG** avatar (slots incl. **`eyes`**,
flat `/assets/avatar/**/*.svg`, CSS z-layering). The validator's slot enum doesn't even contain
`eyes`. **Strong reason against reuse:** that validator/onboarding path is for a different (3D) asset
model and **cannot validate a 2D SVG eyes-slot glasses item.**

How the live 2D SVG items were actually wired (the real, working pattern): a **static SVG file** under
`assets/avatar/**/` + a **migration** that sets `shop_items.image_url`/`slot_type`/`layer_order`
(exactly `20260521000000_avatar_slot_system.sql`). No 3D onboarding runs for them.

**Recommended choice: manual static asset add** (matching the live 2D SVG pattern), **not** the 3D
`avatar-asset-*` validator/onboarding path.
- Promotion = (1) place the front-only `glasses-round-basic-v1.svg` under
  `den-seje-app-frontend/assets/avatar/glasses/`, then (2) — in a later, separately approved DB step —
  repoint the existing row's `image_url` (Decision 2, Option A).
- **Validation for a 2D SVG item** should reuse the **already-passing 164U/164V/164W gates** (machine
  QA + human review) plus a lightweight SVG sanity check (viewBox/dimensions/front-only/no-clipping),
  **not** the 3D GLB validator.
- The 3D `avatar-asset-validator` is **documented here as not applicable** to this item; if a future
  3D avatar migration ever happens, revisit. This is the **pre-164Z check** 164X asked for — and it
  resolves to "do not block on the 3D validator."

## F. Future 164Z readiness checklist (what 164Z MAY do later — NOT done now)
164Z, when separately approved, would be allowed to:
1. Add a deterministic **SVG re-emit** step (front-only geometry → SVG; no AI/network) — the §C
   readiness gap.
2. Write **one** versioned asset file: `den-seje-app-frontend/assets/avatar/glasses/glasses-round-basic-v1.svg`
   (the first and only `assets/*` write; its own reviewed diff).
3. **Validate the SVG** locally: viewBox/dimensions vs. the live avatar coordinate space, front-only
   (no temples/ear hooks), pupils clear, no clipping in the `eyes` slot — reusing the 164U/164V gates,
   **not** the 3D validator.
4. Update docs (record the SVG promotion + validation results).

164Z **may NOT** (still gated to even-later, separately approved sections): update
`shop_items.image_url`, create/alter DB rows or migrations, change runtime/frontend, enable
`AVATAR_V2`, or activate the shop. Asset-file + local validation only.

## G. Hard non-actions (164Y does NOT)
- Create `den-seje-app-frontend/assets/avatar/glasses/glasses-round-basic-v1.svg` (or any `assets/*` file).
- Copy/convert any `tools/avatar/build/*` artifact into `assets/*`.
- Update `shop_items.image_url` or any DB row.
- Create shop rows or migrations.
- Change runtime / frontend.
- Enable or change `AVATAR_V2`.
- Call OpenAI or the network.
- Bulk generate items.
- Change any tooling (a tooling gap was found — the missing SVG emitter — and is **reported**, not patched).

---

## Decisions recorded (summary)
| Gate | Decision |
|---|---|
| **D1 Format** | SVG, front-only; PNG = build/preview only; do not reuse temple-armed legacy SVG. |
| **D2 Replace vs new** | **Option A** — bind future asset to the existing live `glasses-round` row (asset upgrade); no new row; keep `glasses.round.basic` as internal id; DB `image_url` change deferred. |
| **D3 Onboarding path** | **Manual static asset add** (live 2D SVG pattern); the 3D `avatar-asset-*` validator is **not applicable**; reuse 164U/164V gates for validation. |

### Boundaries honored
No OpenAI, no network, no AI/bulk generation. No runtime/frontend, no DB/RPC/migrations, no `assets/*`
write, no shop rows, no `AVATAR_V2` change, no tooling change. Decision/spec only. No commit, no push,
nothing staged.
