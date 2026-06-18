# 164O — OpenAI Image API Adapter Review Worksheet

**Status: DRAFT (review instrument)** · **Scope = ONE glasses item via OpenAI Image API**

_Backend = OpenAI Image API ONLY (no other vendors). Claude Code remains the repo/tooling/QA
orchestrator; the adapter only produces one raw PNG for the existing 164N gate._
_Tooling: `tools/avatar/openai-generate-item.mjs` (`npm run avatar:generate-openai-item`)._
_All inputs/outputs are **gitignored / regenerable build artifacts — NOT runtime assets**.
The generated PNG is **never committed** and **never** placed under `assets/`._

## Architecture
- **Generation:** OpenAI Image API (`gpt-image-1` default; override via `OPENAI_IMAGE_MODEL`,
  e.g. `gpt-image-2` if available on the account). Request: `size=1024x1536`,
  `background=transparent`, `output_format=png`, `n=1`, `quality=high`.
- **Orchestration / QA / commits:** Claude Code (this repo's tooling). **No Codex.**
- **Secret handling:** `OPENAI_API_KEY` read from env ONLY; never hardcoded, never printed/stored.

## How to run (user action)
1. Set the key (one session):
   - PowerShell: `$env:OPENAI_API_KEY = 'sk-...'`
   - bash: `export OPENAI_API_KEY=sk-...`
2. `npm run avatar:generate-openai-item` → writes `tools/avatar/build/ai-input/glasses-test-raw.png` (one image).
3. `npm run avatar:ai-test-item` → runs the **164N clip/QA gate** (clip to `mask-eyes-v1.png`, QA, composite).
4. Review against this worksheet + the 164N worksheet.

## Prompt (locked in the adapter)
Isolated round eyeglasses, transparent background; **no** face/eyes/skin/hair/head/body/
character/scene/text/logo/drop-shadow; premium anime mobile-game cel-shaded accessory, round
lenses, dark charcoal frame, subtle highlight; centered, usable as a transparent overlay.

## QA gate (machine, from `avatar:ai-test-item`)
| Field | Expectation |
|---|---|
| raw input dimensions | reported (ideally 1024×1536) |
| opaquePx | > 0 after clip |
| preClipOverflowPx | informational |
| **outsideMaskPx** | **= 0 after clipping** |
| pass | true |

## Human review checklist (mandatory)
| # | Item | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | It is **glasses only** — no face/eyes/skin/hair/head/body/scene | [ ] P [ ] F | |
| 2 | Transparent background (alpha present) | [ ] P [ ] F | |
| 3 | Sits correctly on the eyes (composite preview) | [ ] P [ ] F | |
| 4 | outsideMaskPx = 0 (clip gate) | [ ] P [ ] F | machine |
| 5 | Style fits the avatar | [ ] P [ ] F | |
| 6 | **Content safe** (kids platform) | [ ] P [ ] F | |

## Verdict
☐ **PASS** (one OpenAI-generated item validated end-to-end through the gate)
☐ **CONDITIONAL** (re-generate / adjust prompt or model, re-run)
☐ **FAIL** (pipeline or generation issue)

Reviewer: __________________  Date: ____-____-____

## Status (this section)
- **`OPENAI_API_KEY` was NOT set** at implementation time → adapter scaffold built, **no
  generation attempted**, no network call made. Set the key and run the two npm scripts above.

## Boundaries / next step
- **One image only** (`n:1`); **no bulk**. A bulk catalog run remains a separate, later,
  explicitly-approved decision.
- No DB/RPC/migrations · no runtime/frontend wiring · no AVATAR_V2 change · no assets/* change.
- Generated PNG + QA outputs stay **gitignored**; never commit them; never store the API key.
