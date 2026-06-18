# 164M — Tier-2 Test-Item Pilot Review Worksheet

**Status: DRAFT (review instrument)** · **Pilot = synthetic placeholders, NON-AI**

_Proves the Tier-2 item pipeline (full-canvas overlay → clip to slot mask → QA → composite
preview) on a tiny controlled set BEFORE any AI imagery or bulk run._
_Tooling: `tools/avatar/test-items.mjs` (`npm run avatar:test-items`). Reuses the 164L codec/
masks. Artifacts under `tools/avatar/build/test-items/` are **gitignored / regenerable QA/build
outputs — NOT runtime assets**._

## Scope (locked)
- **4 items, 1 per pilot slot** (≤6): `aura`, `back`, `headwear`, `eyes`/glasses.
- **Excluded:** `face`/masks (deferred — not justified yet), `torso`/`bottom`/`shoes`/`body`/
  `hands`/`front_fx`.
- **Synthetic placeholder shapes only** (ring / wings / hat / glasses) — **no AI art**, no DB
  rows, no runtime wiring, AVATAR_V2 untouched, Master read-only.

## QA results (from `qa-report.json`)
| slot | shape | opaquePx | outsideMaskPx | preClipOverflowPx | pass |
|---|---|---|---|---|---|
| aura | ring | (see report) | 0 | (see report) | PASS |
| back | wings | 206099 | **0** | 24384 | PASS |
| headwear | hat | 31091 | **0** | 825 | PASS |
| eyes | glasses | 9431 | **0** | 616 | PASS |

**Key result:** every item had `preClipOverflowPx > 0` (the raw shape deliberately exceeded its
mask) yet `outsideMaskPx = 0` after clipping — **the mask-clip + QA overflow gate works**.
`allPass = true`.

## Pipeline proven by this pilot
- Full-canvas **1024×1536** transparent overlays (no crop/trim, no per-item offset).
- **Clip to the slot QA/build mask** (164L) → overflow removed → 0 outside-mask.
- **QA counting + report** (JSON + markdown).
- **Composite preview over the Master** per item (placement/extent visualization — not a
  runtime z-order render; e.g. `back` is z-behind in real rendering).
- **No avatar geometry/skin/hair/eyes pixels** in items (placeholders are solid synthetic shapes).

## Human review checklist
| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | aura placeholder sits in the aura region | [ ] P [ ] F | full-canvas behind |
| 2 | back wings clipped to backMaskRegion | [ ] P [ ] F | generous behind region |
| 3 | headwear hat on upper head, above eyes | [ ] P [ ] F | |
| 4 | eyes/glasses on the eyes | [ ] P [ ] F | approved eye-overlap |
| 5 | every item is full-canvas, transparent bg | [ ] P [ ] F | |
| 6 | 0 outside-mask pixels (clip works) | [ ] P [ ] F | machine: all 0 |
| 7 | no avatar geometry/skin/hair copied | [ ] P [ ] F | synthetic shapes only |
| 8 | composite previews readable for review | [ ] P [ ] F | |

## Verdict
☐ **PASS** (Tier-2 pipeline proven on synthetic placeholders; ready to consider a tiny AI-item test)
☐ **CONDITIONAL** (adjust pilot/tooling, re-run)
☐ **FAIL** (pipeline issue)

Reviewer: __________________  Date: ____-____-____

## Boundaries / next step
- **No AI generation in 164M.** Whether to proceed to a *tiny* controlled AI-item test (still
  no bulk, still gated by the same clip+QA) is a separate decision **after** this pilot is signed.
- **No bulk shop-item batch.** No DB/RPC/migrations, no runtime/frontend wiring, no AVATAR_V2 change.
- Build/test-item artifacts stay **gitignored / regenerable**; do not commit them.
