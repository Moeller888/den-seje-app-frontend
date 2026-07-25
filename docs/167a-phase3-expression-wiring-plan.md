# 167A Phase-3 — Avatar R2 Expression Wiring Plan

Status: **APPROVED 2026-07-25 → core wiring IMPLEMENTED (D-069).** The engine now drives the R2 z3
face layer behind opt-in; **`AVATAR_R2` stays `false`.** The per-surface **expression goldens** are the
finalization follow-up (the `forceExpression` seam is in place). Owner: project owner (solo). Prereq
(done): the four expression face layers are promoted + registered but were dormant (D-068 ·
`167a-phase2-gate3-expression-asset-promotion.md`); D-069 makes them render on the R2 path.

Owner direction (2026-07-24): **plan first**, and **wire all surfaces** (accept a subtle small-size
read). This document is the plan to approve; implementation follows as a separate gated PR.

---

## 1. Context — where we are

- **1:1 mapping (no gap).** `js/avatar-expression-engine.js` emits exactly the five expressions we
  now have layers for: `neutral · curious · focused · determined · proud` (state layer:
  neutral/curious/focused from UI state; event layer: proud/determined held briefly with fade-out).
- **C2 today:** the engine builds a single `<img>` overlay and cross-fades its `src` between the C2
  expression images, falling back to `neutral` on error.
- **R2 today:** the engine is **not created** when the mounted path is R2 (`app.js`:
  `if (!r2Active) new ExpressionEngine(...)`), so the R2 face is the **fixed neutral raster** layer.
  `r2ExpressionOverlayAllowedFor(identity) === !isAvatarR2ActiveFor(identity)`.
- **Layers are drop-in.** The four promoted files are exact decomposed z3 face layers (512×768,
  transparent, brows/nose/mouth only). `faceSrcForR2("proud"|"curious"|"focused"|"determined")`
  already resolves them. The decomposed base (`body-neutral-medium-v2`) carries **no** face, so the
  z3 face layer is the **single** source of brows/nose/mouth — swapping it changes the expression
  cleanly. Blink lids (z4, Option-A) and breathing (base/container) are separate and unaffected (the
  expression write mask excludes the eye boxes).

## 2. Decision — R2 face-layer `src`-swap

When R2 is active, drive the **existing z3 face layer's `src`** between `faceSrcForR2(expr)` values
from the expression engine's current expression, cross-fading with the engine's existing `fade_ms`.

**Why not a standalone overlay (the C2 shape):** the R2 expression assets are *decomposed* layers
(only brows/nose/mouth on transparency). A standalone full-canvas overlay of just those features
would float without the base — it only reads composited at z3 over the base. So the natural fit is to
swap the face layer already in the stack, not to add a separate overlay.

## 3. The face-layer-swap contract

- **Source of truth:** z3 face layer. `neutral` is the default (mandatory, always loaded). An
  expression change sets the face layer `src = faceSrcForR2(expr)` and cross-fades.
- **Transition:** reuse the engine's `fade_ms` (180–260 ms) cross-fade on the face layer opacity —
  subtle, ambient, matching the C2 feel. (Instant swap is the fallback if a cross-fade of the face
  layer proves visually noisy; to be confirmed at review of the first golden.)
- **Independence:** blink (z4 lids) and breathing (base transform) are untouched; the eye region is
  never part of the face layer (write mask excluded the eye boxes), so open eyes + blink keep working
  through every expression.
- **Fallback (aligns with D-062):** a failed/absent expression asset falls back to
  `faceSrcForR2("neutral")` — **not** a stack kill (neutral is the mandatory face and already
  decoded). This mirrors the C2 `onerror → neutral` and the whole-stack-or-C2 contract.

## 4. Engine R2-mode

- Today `app.js` (and `avatar.html`, `hub.html`) skip `ExpressionEngine` on the R2 path. Change:
  create it in an **R2 mode** that **targets the mounted face-layer element** (tagged by the render)
  and swaps *its* `src` via `faceSrcForR2`, instead of creating its own z0 overlay.
- The engine's **state machine is unchanged** — the two-layer model (state + event), priorities,
  hold/fade timings and neutral fallback all stay. Only the render *target* (existing face layer vs a
  new overlay) and the *src source* (`faceSrcForR2` vs the C2 `EXPRESSIONS` map) differ.
- The render (`mountC2Avatar` / `composeR2Layers`) tags the face layer element so the engine can find
  it deterministically (e.g. a stable class/dataset marker on the z3 face `<img>`).

## 5. Surfaces (owner decision: all)

Wire on **every surface where the living engines run** — quiz (`app.js`), `avatar.html`, `hub.html`.
Accept that at small sizes (hub, quiz thumbnail) the brow/mouth change is **subtle** (D-068 note). A
supplementary small-size cue (aura / icon / text / pose) is a **possible separate later track**, not
part of this wiring — recorded so it is a deliberate follow-up, not a silent gap.

## 6. Gating & rollout

- Entirely **behind `AVATAR_R2` opt-in**; this wiring **does not flip `AVATAR_R2`** (stays `false`).
- Broad/global activation remains gated on the **separate shared R2 raster-artefact blocker**
  (eyes/hair/forehead/arms/shoes live in the shared base/eyes/hair stack — not the expression layers)
  and any pilot sign-off. Expression wiring is orthogonal to that blocker and does not resolve it.

## 7. Test & golden plan

- **Unit:** extend `tests/unit/avatar-r2-expressions.test.mjs` (mapping already covered) with an
  engine-R2-mode test using the repo's DOM mock — asserting the engine targets the tagged face-layer
  element and swaps `src` to `faceSrcForR2(expr)` for each of the five expressions, and falls back to
  neutral on error. No browser/backend.
- **Golden (Playwright, chromium; win32 + linux):** a deterministic forced-frame per expression on
  each surface (mirroring the D-063 blink-frame seam): reduced-motion pins the face layer to a chosen
  expression `src`; capture `neutral / curious / focused / determined / proud`. Shares the
  `e2e-shared-supabase` golden concurrency lock; linux baselines via the manual regen workflow.
- **Contract checks:** with the flag off → C2 behaviour byte-for-byte unchanged; with opt-in → the
  face layer swaps, blink still runs (Option-A lids), no eye/hair/base change, missing asset → neutral.

## 8. Boundaries (binding)

- `AVATAR_R2` stays `false`; **no activation**. C2 path unchanged. No eligibility/fallback change
  beyond the expression target. Northstar Master untouched. The six neutral layers + D-057/D-058
  untouched. Shared R2 raster artefacts **not** fixed here.

## 9. Open items for owner approval

1. **Approach** — approve the **face-layer `src`-swap** (§2/§3) over a standalone overlay?
2. **Transition** — approve **cross-fade reuse** of the engine's `fade_ms` (with instant-swap as the
   documented fallback if the first golden looks noisy)?
3. **Surfaces** — confirmed **all surfaces** (quiz + avatar + hub).
4. **Small-size cue** — accept as a **separate later track** (not in this wiring)?
5. **Go-ahead** — on approval, implement as a **single gated PR** (engine R2-mode + render face-layer
   tag + create-engine-on-R2 + unit test + expression goldens), behind `AVATAR_R2` opt-in, `false`.

On approval this plan is registered in `docs/project-state.md` (next free D-number) and implemented;
until then nothing runtime changes.
