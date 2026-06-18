# 164N — Single Controlled AI Test-Item Review Worksheet

**Status: DRAFT (review instrument)** · **Scope = exactly ONE AI item, slot = eyes/glasses**

_Validates one real (AI-generated) overlay through the same clip + QA gate proven in 164M,
to show generated item art can be validated safely — BEFORE any bulk run._
_Tooling: `tools/avatar/ai-test-item.mjs` (`npm run avatar:ai-test-item`). All inputs/outputs
are **gitignored / regenerable build artifacts — NOT runtime assets**; no AI art is generated
inside the repo._

## Scope (locked)
- **One item, one slot:** `eyes`/glasses (smallest region, lowest geometry risk).
- **Excluded:** face/masks, torso, bottom, shoes, body, hands, front_fx, multiple slots, >1 item.
- No bulk · no DB rows · no runtime wiring · AVATAR_V2 untouched · Master read-only · no commit.

## How to run (user action required)
1. Generate **one** glasses overlay externally (transparent background; ideally 1024×1536,
   smaller is OK — it is centred on the `glassesBand` anchor, no manual offset).
2. Place it at **`tools/avatar/build/ai-input/glasses-test-raw.png`** (gitignored).
3. Run `npm run avatar:ai-test-item`.
4. Review the outputs below.

## Pipeline (what the script does)
- Reads the raw PNG; validates dimensions + alpha (warns if no alpha channel).
- Places it full-canvas **1024×1536** (as-is if already that size; else centred on `glassesBand`
  — anchor-derived, no per-item manual offset).
- **Clips to `mask-eyes-v1.png`**; counts `opaquePx`, `preClipOverflowPx`, `outsideMaskPx`.
- Writes clipped overlay + composite-over-Master preview + a JSON QA report (all gitignored).

## Outputs (gitignored)
- `tools/avatar/build/ai-test/items/glasses-test-clipped.png`
- `tools/avatar/build/ai-test/previews/glasses-test-composite.png`
- `tools/avatar/build/ai-test/reports/glasses-test-qa.json`

## QA gate (machine)
| Check | Pass rule |
|---|---|
| Canvas | 1024×1536 full-canvas |
| Alpha | raw has transparent background (RGBA) |
| **outsideMaskPx** | **= 0 after clipping** |
| opaquePx | > 0 (item not empty after clip) |

## Human review checklist (mandatory — machine can't judge these)
| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | Reads as a **glasses** item | [ ] P [ ] F | |
| 2 | **No avatar geometry/skin/hair/eyes** pixels copied | [ ] P [ ] F | overlay only |
| 3 | Sits correctly on the eyes (composite preview) | [ ] P [ ] F | |
| 4 | Style fits the avatar | [ ] P [ ] F | |
| 5 | **Content safe** (kids platform) | [ ] P [ ] F | |
| 6 | outsideMaskPx = 0 (from report) | [ ] P [ ] F | machine |

## Verdict
☐ **PASS** (one AI item validated through the gate; proves generated art can be QA'd safely)
☐ **CONDITIONAL** (re-generate/adjust raw item, re-run)
☐ **FAIL** (pipeline or item issue)

Reviewer: __________________  Date: ____-____-____

## Boundaries / next step
- **Still NOT a bulk run.** A bulk catalog batch remains a separate, later, explicitly-approved
  decision — only after this single-item gate is accepted.
- No DB/RPC/migrations · no runtime/frontend wiring · no AVATAR_V2 change · no assets/* change.
- Raw input + generated outputs stay **gitignored**; do not commit them.
