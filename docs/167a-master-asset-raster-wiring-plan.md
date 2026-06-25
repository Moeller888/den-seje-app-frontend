# 167A — Master Asset Production & Raster Wiring Plan

Status: **PLAN ONLY — not executed.** No code/assets/tests/DB changed by this doc.
Date: 2026-06-25
Builds on: ADR-163D (Hybrid Raster pipeline), ADR-163F (raster asset spec, "164A COMPLETE"),
`docs/164b-asset-production-plan.md` (production method), `docs/project-state.md`,
`docs/166a-avatar-v2-activation-plan.md`.

## Problem
`AVATAR_V2 = true` is **live in production** (commit `52f8365`), but the C2 render path
loads the **flat hand-authored placeholder SVGs** (Section 155B "C2 Base Avatar Premium —
blank-canvas base body"), NOT the approved **Northstar Master** character. The live avatar
therefore still looks procedural/placeholder. The technical C2 pipeline is correct and
reusable; only the **visual source assets** are wrong, and the Master raster layer was
never produced or wired.

## Verified current state
- Master source frozen: `assets/avatar/reference/Northstar Master.png` (1024×1536 RGB,
  opaque white bg) = sole geometric source of truth (D-032). Reference image only.
- 0 `.webp` assets; no `assets/avatar-r2/` folder; render references only `*-c2.svg`.
- `mountC2Avatar` emits the base as an `<img>` (SVG→WebP src swap is trivial); hair is
  inline-SVG token-tint today.
- Spec already locked (ADR-163D/163F). The gap is **production + wiring**, not spec.

## Hard constraint (critical path)
The Master base raster is a **manual paint-over over Master** deliverable (D-033). **AI
generation/inpainting is rejected for base/rig layers** (four regenerations drifted
proportions/identity). AI IS allowed for shop/cosmetic item overlays (D-034). → The base
asset is a **human/design deliverable**; it gates everything. Code/spec/tests can proceed
around it, but the avatar cannot resemble Master until the art exists.

## A. Asset strategy — recommendation: phased hybrid
| Path | What | Effort | Living engines / variants | Look |
|---|---|---|---|---|
| **D-040 "Master-as-is" Tier-0** | base = alpha-cut WebP of `Northstar Master.png` (baked face/eyes/hair/outfit) + cosmetic overlays | Low | LOST (baked face → expression/blink/reactions no-op; no skin/body/hairstyle variants; clothing cosmetics conflict) | ✅ instantly resembles Master |
| **163F full decomposition (MVP)** | 11 core WebP (1 base "skin+underlayer+head, no face" + 7 face + 2 eyes + 1 blink) + `hair-northstar-v1` | High (manual paint-over base = highest-risk asset) | PRESERVED (living face/eyes/blink; variants additive) | ✅ Master + full living system |

**Recommendation:** Phase-1 = D-040 (smallest safe step that makes the live avatar
resemble Master; breathing still works, but expression/blink/reactions go static — accept
as interim). Phase-2 = 163F decomposition (restores living engines + variants + clothing
cosmetics; permanent target). Sequences the look-fix ahead of the heavy reconstruction
without discarding the 151A/151B living-avatar investment.

## B. Target layer model (163F render stack, locked D-030)
| z | Layer | Asset | Per skin tone |
|---|---|---|---|
| 0–2 | Base body (skin + neutral underlayer + head, no face) | `body-neutral-medium-v1.webp` | yes |
| 3 | Face/Expression (brows/nose/mouth, multiply blush; no skin/eyes) | `face-{7 expr}-v1.webp` | shared |
| 4 | Eyes (`iris` tintable + `fixed` highlight) | `eyes-neutral-{iris,fixed}-v1.webp` | shared |
| 5 | Blink (eyelid, shows skin) | `eyelid-medium-v1.webp` | yes |
| 40 | Hair (neutral luminance map + multiply tint) | `hair-northstar-v1.webp` | shared |
| `C2_LAYER_Z` | Cosmetics | per-slot WebP (parity-first) | n/a |

Phase-1 (D-040) collapses 0–40 into one baked base image.

## C. Formats & paths (locked, ADR-163D/163F)
- WebP (PNG fallback only if needed); served **512×768** (integer ÷2 from 1024×1536 →
  anchor-stable); transparent bg (no white halo); **full-canvas every layer** (D-027).
- Folders: `assets/avatar-r2/{slot}/` (new). Manifest in `avatar-layers`.
- Naming: skin-bearing → `body-{body_type}-{skin_tone}-v{n}.webp`, `eyelid-{skin_tone}-v{n}.webp`;
  shared → `face-{expression}-v{n}.webp`, `eyes-{set}-{iris|fixed}-v{n}.webp`, `hair-northstar-v{n}.webp`.
- Cache: immutable, versioned by `-v{n}` filename; never mutate a shipped asset (D-018).
- Loading: hybrid — eager-preload own avatar, lazy-load rest (D-017).
- Budget (mobile-first, D-019): <~350 KB total avatar, <~15 MB decoded, first-paint <100 ms.

## D. Geometry & anchoring
- Master.png is the SOLE geometric source (D-032). No AI geometry; no invented proportions;
  manual paint-over over Master geometry only.
- Keep the 160×240 anchor space; raster maps ×3.2 → 512×768 (×6.4 → 1024 master).
- North Star eyes are larger than the legacy eye box → documented **anchor-contract
  revision**; blink + eye cosmetics re-register to the revised eye box (per 164k/164l).
- Phase-1 D-040: base needs no anchor change (whole image); cosmetic overlays still
  register to existing anchors → expect imperfect alignment vs the baked Master until
  decomposition.

## E. Visual-fidelity gates (human review; auto-pixel is necessary not sufficient)
Onion-skin/overlay rendered avatar vs `Northstar Master.png`:
- head size & head:body ratio match (no drift); body proportion & pose match.
- eyes large/expressive; **legible at 32px** (no lash/catchlight aliasing); read large at 48px.
- hair silhouette matches; face reads as the same character; neutral matches Master.
- childlike + premium anime finish — same cel-shade language/line weight/palette as Master.
- clothing neutral (Phase-2); Phase-1 carries Master's outfit (documented interim).
- overall: reads as the **same character**; **no procedural/placeholder look**.
- **Mandatory human visual sign-off** before activation is "accepted" — green tests alone do not pass this gate.

## F. Wiring plan (code; Phase-2 target, Phase-1 is a subset)
1. `js/avatar-layers.js`: add r2 manifest + resolvers (`baseSrcForR2`, `faceSrcFor`,
   `eyesSrcFor`, `eyelidSrcFor`, `hairSrcForR2`) → `assets/avatar-r2/...webp`; keep the
   C2-SVG resolvers as transition fallback.
2. `js/avatar-render-c2.js` (`mountC2Avatar`): emit the raster stack — base `<img>` (new
   src), face `<img>` z3, eyes `iris`(tint)+`fixed` z4, blink z5 (engine), hair as WebP
   luminance map + CSS `mix-blend-mode: multiply` tint (replaces inline-SVG hair tint),
   cosmetics unchanged. Hybrid preload of own avatar.
3. Surfaces (avatar/hub/index/shop): no structural change (already call `mountC2Avatar`);
   shop mini-preview keeps identity-independent neutral base (raster neutral + static face).
4. Living engines: Phase-2 keeps expression/blink driving z3/z4/z5; Phase-1 sets
   face/eyes/blink static/off (baked base), keeps breathing.
5. Flag: `AVATAR_V2` unchanged; optional sub-switch for a staged SVG→r2 cutover.

## G. Testing & goldens
- Re-baseline existing C2 goldens ONLY after Master assets are wired (current goldens lock
  the placeholder — change deliberately, with visual verification).
- Add a Master-fidelity check beyond "a layer loaded": assert base src is the **r2 WebP**
  (not `*-c2.svg`), correct face/eyes/blink/hair layers present, committed golden from the
  Master render + a recorded human onion-skin-vs-Master review.
- Keep `toHaveScreenshot({animations:"disabled"})` + `retries:1` conventions.

## H. Rollout while Master work proceeds
- **Recommended: leave AVATAR_V2 live.** Rolling back shows legacy (also non-Master) → no
  visual win, just deploy churn. Flat C2 is functional + fully green. Risk: pilot users see
  a non-final avatar during the work window.
- **Rollback option:** `revert 52f8365` (keep `4a6bae5` golden prep + `9a6381c` retries —
  both flag-decoupled, stay green). One-liner, no data impact. Choose only if flat C2 is
  judged worse than legacy for current users.

## I. Execution sections (future, sequenced)
1. Master asset inventory/spec finalize — choose D-040 vs decomposition MVP; scaffold
   `assets/avatar-r2/` + manifest stub; lock the eye-box anchor revision. *(code/docs)*
2. **Master MVP raster base production** — HUMAN art deliverable (D-040 alpha-cut, or 163F
   manual paint-over base + 11-file stack). **Cannot be AI-generated (D-033). Gates all.**
3. Renderer raster wiring — implement F behind the flag; targeted spec validation. *(code)*
4. Visual-fidelity QA — E gates incl. 32/48/64px legibility + human onion-skin sign-off. *(human)*
5. Test/golden re-baseline — regenerate from the Master render; add fidelity assertions. *(code)*
6. Production verification — deploy, full suite vs deployed, manual smoke, sign-off. *(ops)*

## Open decision for the execution phase
- **MVP path:** D-040 "Master-as-is" (fast look, loses living face temporarily) vs 163F
  full decomposition (preserves living system, heavy human art). Recommendation: D-040
  Phase-1 → 163F Phase-2.
