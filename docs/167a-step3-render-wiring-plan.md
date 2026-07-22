# 167A Step 3 — Renderer Raster Wiring Plan

> **ADDITIVE NOTE (2026-07-22, D-062):** `mountC2Avatar` now applies an **atomic
> asset-load gate** — when R2 is chosen it preloads + decodes every MANDATORY layer
> (base/blush/face/iris/eyes/hair) off-DOM before the stack is shown; ANY mandatory
> failure (404, decode reject, zero-width, missing entry) drops the WHOLE avatar to
> the complete C2 path (never a partial R2 stack). Optional safe overlays (aura/back)
> drop individually without collapsing the base. A per-element mount generation makes
> a stale/aborted load unable to overwrite a newer render. `mountC2Avatar` returns the
> actually-mounted path (`"r2"|"c2"|"aborted"`) and stamps `rootEl.dataset.avatarRenderPath`;
> surfaces key the expression + blink profile off that ACTUAL path (`blinkConfigFor(id, r2Active)`),
> so a fallback follows the C2 living contract. `AVATAR_R2` stays `false`. Closes
> activation-audit F1; see D-062 in `docs/project-state.md`.

Status: **PLAN — not executed.** No code changed by this doc. Gated on the produced WebP art (step 2).
Date: 2026-07-01. Owner: project owner (solo).
Builds on: [167a-master-asset-raster-wiring-plan.md](./167a-master-asset-raster-wiring-plan.md) (§F/§I),
[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md) (binding guardrail),
[AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md). Extends the **step-1 scaffold** already in `js/avatar-layers.js`
(`R2_MANIFEST`, `baseSrcForR2`/`faceSrcForR2`/`eyesSrcForR2`/`eyelidSrcForR2`/`hairSrcForR2`, `hasR2StackFor`,
`AVATAR_R2`, `isAvatarR2`).

---

> **LOCKED PATH (2026-07-01): D-040 Phase-1 "Master-as-is" first.**
>
> **✅ Step 3a DONE (2026-07-01):** the baked base is wired behind `AVATAR_R2` (default **false** →
> C2/SVG). Shipped as a **temporary transparent PNG preview** (`assets/avatar-r2/base/body-neutral-medium-v1.png`,
> registered `{ v:1, ext:"png" }`) — **WebP remains the production target** (§6/§15). `mountC2Avatar`
> branches to `composeR2Layers` (base + cosmetics, no hair — face/hair baked) only when `AVATAR_R2` is
> on.
>
> **✅ Phase-1 engine guard DONE (2026-07-01):** expression + blink overlays are **skipped at the mount
> sites** (app.js, avatar.html, hub.html) when `isAvatarR2ActiveFor(identity)` is true — so they never
> render over the baked face. **Presence/breathing stays on.** Engine LOGIC is unchanged (only the
> caller skips construction — an already-supported "engine absent" state); C2/SVG path unmodified.
> Verified by DOM probe: raster → 0 expression overlays, no blink layer, breathing still active. Full
> engine re-alignment to a decomposed raster face is Phase-2 (steps 3b/3c), **not started**.
>
> **✅ Phase-1 cosmetic slot-gate DONE (2026-07-01):** `composeR2Layers` renders **only the safe slot
> set `R2_PHASE1_SAFE_SLOTS = ["aura","back"]`** (behind-figure, anchor-independent). Head/face/eye
> items (headwear/face/eyes) and clothing (torso/body/neck) are **gated** on the raster base — QA
> showed they float on the legacy anchors / clash with the baked outfit. **Raster path only**; the
> C2/SVG cosmetic path renders all slots unchanged. Slot names/z, anchors, masks, shop, ownership,
> identity unchanged. Cosmetic re-anchoring to North Star proportions is Phase-2. Verified: raster
> keeps only aura/back (functional + visual); C2 keeps all; unit + smoke green.

## 1. Scope & guardrail

Step 3 = **wire the render path to consume the r2 raster resolvers, behind a flag, with C2/SVG
fallback** — nothing more. Per the preservation report this is an **asset migration**: the identity
model, z-model, cosmetics/equipment, **engine logic** (expression/presence/blink), ownership, state
model, `mountC2Avatar` entry point and public interfaces stay **unchanged**. Only asset *sources*, the
**hair render technique**, and the **eye-box anchors (raster path only)** change.

**Default-off + reversible:** wiring lands with `AVATAR_R2 = false`; even if flipped, an empty
`R2_MANIFEST` makes every resolver return `null` → C2/SVG. So the render never breaks on missing art.

## 2. Current render seams (verified)

- `mountC2Avatar(container, identity, { layerClass, cosmetics, animate })` (`js/avatar-render-c2.js`)
  composes `composeC2Layers()` = base `<img>` (z0) + cosmetics `<img>` + hair **inline `<svg>`** (z40,
  token-tinted via `--hair-base/--hair-shadow`). It removes `[data-c2-layer]` then appends layers.
- **Engines are caller-mounted** on the same container: `new ExpressionEngine(el)` (inserts the
  expression overlay `<img>` at **z3**), `new PresenceEngine(el)` (CSS breathing), `new BlinkEngine(el
  [, skinTone])` (eyelid layer `#avatar-blink-layer` at **z5**). `mountC2Avatar` does **not** own these.
- Cloudinary `cdnUrl()` (157G) already wraps every raster `<img>.src` at the mount seam.

## 3. The raster-vs-C2 switch (single decision point)

Add one branch in the compose/mount path:

```
useRaster(identity) := isAvatarR2() && hasR2StackFor(identity)     // false today (empty manifest)
```
- **true** → build the raster stack (§4/§5).
- **false** → existing C2/SVG path, byte-for-byte unchanged (the fallback).

Recommended shape: a new `composeR2Layers(identity, cosmetics)` in `js/avatar-layers.js` (mirrors
`composeC2Layers`), and a top-of-function branch in `mountC2Avatar` that calls it when `useRaster`.
The C2 code path is left intact.

## 4. Phase-1 — D-040 "Master-as-is" (smallest visual win)

Produce/register the **baked base** only (`body-neutral-medium-v1.webp`; baked face/eyes/hair/outfit).

- **Render:** base `<img>` (z0) via `baseSrcForR2(identity)` → `cdnUrl()`; cosmetics unchanged; **no**
  separate face/eyes/hair layers.
- **Engines:** breathing (presence) stays; **expression + blink go static** (the face is baked into the
  base). Concretely: the caller skips mounting `ExpressionEngine`/`BlinkEngine` (or they detect the
  raster path and no-op) so no z3/z4/z5 overlays appear over a baked face. **Engine classes are
  preserved, just not driven** — restored in Phase-2.
- **Accepted interim:** static face/eyes; documented in 167a §A. Fast, low-risk, resembles Master.

## 5. Phase-2 — 163F decomposition (living stack, permanent target)

Produce the full stack; wire the locked z-model (D-030):

| z | Layer | Source | Driven by |
|---|---|---|---|
| 0–2 | Base body (skin+underlayer+head, **no face**) | `baseSrcForR2` → `<img>` (+ `cdnUrl`) | identity |
| 3 | Face/expression (brows/nose/mouth, multiply blush) | `faceSrcForR2(expr)` | **ExpressionEngine** (unchanged logic; asset map → raster) |
| 4 | Eyes (`iris` tint + `fixed`) | `eyesSrcForR2(set)` → `{iris,fixed}` | eye-color token (tint iris only) |
| 5 | Blink (eyelid, per skin tone) | `eyelidSrcForR2(identity)` | **BlinkEngine** (unchanged logic; asset → raster) |
| 40 | Hair (luminance map + multiply tint) | `hairSrcForR2(identity)` → `<img>` | hair-color token (§6) |
| `C2_LAYER_Z` | Cosmetics | existing resolver | equipped_slots |

- **Engines unchanged in logic** — only their *target assets* swap: point `EXPRESSIONS`
  (`js/avatar-personality.js`) at raster face paths **with a C2 fallback map**; give `BlinkEngine` the
  raster eyelid; keep the state→profile mappings, Poisson timing, reduced-motion, etc.

## 6. Hair render-technique change (highest-risk item — R-A)

Hair moves from **inline-SVG `fill=var(--hair-*)`** to a **raster luminance-map `<img>` + CSS
`mix-blend-mode: multiply`** tinted by `--hair-base` (167a §F.2). The **hair-color identity/token model
is preserved** (`HAIR_COLOR_TOKENS`, `hairColorTokensFor`) — only the compositing technique changes.

- Raster path: emit hair as `<img src=hairSrcForR2 (cdnUrl)>` at z40 inside a wrapper whose background
  = `--hair-base`, with `mix-blend-mode: multiply` so the luminance map tints to the chosen color.
- **Fallback:** if `mix-blend-mode` is unsupported (feature-detect) → render the untinted raster hair
  (acceptable) or keep the inline-SVG hair for that session. Never fail the render.
- **Validate hard** against goldens (existing risk R-7): tint fidelity per hair color, at 32/48/64px.

## 7. Eye-box anchor revision (raster path only)

North Star eyes are larger than the legacy eye box (cx68/92 cy47). The revised box lives in
`tools/avatar/build/anchors/avatar-anchor-template-v1.json` (eyeLeft/Right boxes, pupil/iris centers).
Introduce a **revised eye-box constant used ONLY on the raster path**; blink + eye-cosmetics
re-register to it. **Do not change the live SVG path's anchors** (that would move the current avatar's
blink/expression — a behavioural regression). Two anchor sets coexist: legacy (C2/SVG) + revised (r2).

## 8. Preservation checklist (must all hold)

- [ ] `mountC2Avatar` signature + entry point unchanged; C2/SVG path unchanged when `useRaster` false.
- [ ] `[data-c2-layer]` cleanup markers preserved.
- [ ] z-model (`C2_LAYER_Z`, base z0, hair z40, expr z3, blink z5) unchanged.
- [ ] Expression/Presence/Blink engine **logic** unchanged (only asset targets + eye-box).
- [ ] Cosmetics/equipment/ownership/identity/state models unchanged.
- [ ] Existing C2/SVG resolvers untouched; r2 resolvers additive.
- [ ] `cdnUrl()` applied to raster `<img>` srcs; fail-soft to origin.

## 9. Feature flag & activation

- `AVATAR_R2` gates the raster path; per-identity `hasR2StackFor(identity)` gates per user (so a
  partially-produced set never half-renders). Optional `localStorage.avatar_r2='1'` override for staged
  testing (mirror `AVATAR_V2`). **Default OFF** until art + visual QA + human sign-off (167a §E).
- Activation is **not** a code change once wired: produce the WebP, register it in `R2_MANIFEST`, flip
  `AVATAR_R2` (or the override) — resolvers go live.

## 10. Testing & goldens

- **Re-baseline C2 goldens ONLY after** the raster is wired **and** human onion-skin-vs-Master sign-off
  (goldens currently lock the placeholder — change deliberately). Keep `toHaveScreenshot({ animations:
  "disabled" })` + `retries:1`.
- Add fidelity assertions beyond "a layer loaded": base `src` is the **r2 WebP** (not `*-c2.svg`);
  correct face/eyes/blink/hair layers present for the active phase; eyes legible at 32/48/64px.
- Unit: `composeR2Layers(identity)` returns the expected descriptors when the manifest is populated (a
  fixture manifest), and returns the C2 stack when `useRaster` is false.

## 11. Rollback

- **Instant:** `AVATAR_R2 = false` (or empty `R2_MANIFEST`) → C2/SVG render. No data impact.
- **Code:** `git revert` the wiring commit; the step-1 scaffold + C2 path remain.

## 12. Sequencing (each sub-step gated on the matching produced asset)

1. **3a — switch + Phase-1 base** (needs `body-neutral-medium-v1.webp`): add `useRaster`,
   `composeR2Layers` (base only), branch in `mountC2Avatar`, engines static. Flag off; validate.
2. **3b — hair raster** (needs `hair-northstar-v1.webp`): raster hair + blend-mode tint + fallback.
3. **3c — Phase-2 face/eyes/blink** (needs face×7 + eyes iris/fixed + eyelid): wire engines to raster
   assets + revised eye-box; restore living face.

## 13. Decision — LOCKED (2026-07-01): D-040 Phase-1 first, then 163F Phase-2

**The execution path is D-040 "Master-as-is" (Phase-1) first; 163F full decomposition (Phase-2) is
deferred and NOT started yet.** So the **next implementation step is 3a** (switch + Phase-1 baked
base), which needs **one** baked WebP — not the full 11-file stack. Phase-2 (steps 3b/3c) follows
later. Sequencing therefore collapses to: **3a now (Phase-1)** → 3b/3c (Phase-2) deferred.

## 14. Definition of Done (step 3)

- Raster path renders the Master stack for a produced identity, behind `AVATAR_R2`; C2/SVG fallback
  intact and default.
- Preservation checklist (§8) all green; engines/z/identity unchanged.
- `node --check` + unit + Playwright smoke green; goldens re-baselined with human sign-off; onion-skin
  vs `Northstar Master.png` passes.
- Rollback verified (flag flip → C2). Then step 4 (visual QA) / step 6 (production sign-off) proceed.

## 15. Required first asset (Phase-1 / step 3a)

**Exactly one WebP is required to start implementation:**

| Field | Value |
|---|---|
| **File** | `assets/avatar-r2/base/body-neutral-medium-v1.webp` |
| **Manifest entry** | `R2_MANIFEST.base = { "neutral-medium": 1 }`, `R2_MANIFEST.version = 1` |
| **Resolver it activates** | `baseSrcForR2({ body_type:"neutral", skin_tone:"medium" })` |
| **Content** | The **full Master avatar baked** — skin + body + face + eyes + hair + outfit (Phase-1 = Master-as-is; no decomposition) |
| **Source** | `assets/avatar/reference/Northstar Master.png` (1024×1536, frozen — D-032), **alpha-cut** (white matte → transparent) → resized to **512×768** (÷2, anchor-stable) → WebP |
| **Background** | Transparent (no white halo) |
| **Budget** | Within ADR-163D: total avatar < ~350 KB, first-paint < 100 ms |

**Nature of the deliverable (important):** this is a **mechanical, geometry-preserving alpha-cut of the
existing frozen Master** — not an AI regeneration and **not** the deferred manual paint-over that D-033
governs (that applies to the Phase-2 *decomposed* neutral base). It can plausibly be produced by a
**deterministic script** (white-matte threshold, like the 164K extractor) with optional human alpha-edge
cleanup. Low effort; no new avatar art.

**Naming/versioning note (D-018, avoids collision with Phase-2):** `…-v1.webp` = the Phase-1 **baked**
base (full avatar). Phase-2's *decomposed* neutral base (skin+underlayer+head, **no** face) will ship
later as a **new version** (e.g. `body-neutral-medium-v2.webp`) alongside the face/eyes/eyelid/hair
layers — never by mutating v1.
