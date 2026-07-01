# 167A Phase-1 — Visual Sign-Off Checklist (AVATAR_R2)

Purpose: a repeatable human visual QA to sign off the **Phase-1 "Master-as-is" raster avatar**
before any wider preview/rollout. Local-only; **default stays `AVATAR_R2=false`** (production unaffected).
Owner: project owner. Date: 2026-07-01.

> **STATUS: ✅ PASS — recorded 2026-07-01.** Run against avatar.html / hub.html / index.html (raster)
> + a no-DB cosmetics harness; see §13 for the recorded result. Authorises a **flagged** preview only
> (`AVATAR_R2` stays `false` by default) — not production activation, not Phase-2.
Related: [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md),
[167a-master-base-extractor.md](./167a-master-base-extractor.md),
[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md).

> **Guardrails while doing this QA:** do **not** commit the `AVATAR_R2=true` flip or any temporary QA
> harness/screenshots; do **not** implement Phase-2; revert to `AVATAR_R2=false` when done.

---

## 0. Preconditions

- Phase-1 is wired: PNG base (`assets/avatar-r2/base/body-neutral-medium-v1.png`) registered in
  `R2_MANIFEST.base` as `{ v:1, ext:"png" }`; engine guard + cosmetic slot-gate committed.
- **Identity note:** the raster base only resolves for a **neutral / medium** identity (the sole
  manifest entry). A student whose `avatar_identity` is `male`/`female` or `dark` will correctly fall
  back to C2 (no raster to inspect). Use a neutral-medium test student, or the local harness (§3b).

## 1. Enable AVATAR_R2 locally

1. In `js/avatar-layers.js`, set `export const AVATAR_R2 = true;` (do **not** commit).
2. Serve the repo locally (the pages are auth-gated and hit prod Supabase, so run on `localhost` and
   log in there so your **local** code runs), e.g. a minimal static server on the repo root + open
   `http://localhost:<port>/…`. Log in with the test student.
   - Alternatively (§3b) use a local harness for cosmetics (no auth/DB needed).
3. When finished: set `AVATAR_R2 = false` again (§10) and delete any temp harness/screenshots.

## 2. Pages to inspect

| Surface | URL | Container |
|---|---|---|
| Avatar page | `avatar.html` | large preview panel |
| Hub | `hub.html` | profile avatar (medium) |
| Quiz | `index.html` | level/XP header (small square) |

## 3. Screenshot list

**3a. Real surfaces (base, no cosmetics):** `qa-avatar-r2.png`, `qa-hub-r2.png`, `qa-quiz-r2.png`
(and the same with `AVATAR_R2=false` → `-c2.png` for the comparison in §12).

**3b. Cosmetics (local harness — test student usually has none equipped):** mount `mountC2Avatar` with
`c2CosmeticLayers(equipped, resolveSrc)` for representative items across slots (aura, back, headwear,
face, eyes, torso) → one grid screenshot `qa-cosmetics-r2.png`. This injects cosmetics **without**
changing production data.

## 4. Alpha edge / white halo — check

- [ ] No white/grey **halo** or fringe around the figure on the dark surfaces.
- [ ] Clean alpha edge at **32 / 48 / 64 px** (small quiz/hub sizes) — no aliasing crust.
- [ ] Transparent background (figure sits cleanly on each panel; no opaque box).
- _If a halo appears:_ note it; the extractor's `--white <n>` threshold can be re-tuned (review only).

## 5. Size & centering — check

- [ ] Figure is **centered** and correctly scaled in each container (avatar/hub/quiz).
- [ ] Not clipped, not too small, not overflowing.
- [ ] **Parity** with the C2 placement (compare to the `-c2` shots) — no large jump in position/scale.
- [ ] Eyes/face remain **legible at 32 px** (small quiz avatar).

## 6. Breathing / presence — check

- [ ] The avatar shows the subtle **breathing** idle motion (PresenceEngine remains active under raster).
- [ ] Optional DOM probe (should be non-empty): container/`#avatarWrap` computed
  `--breathe-scale` is set (e.g. `~1.006`).

## 7. Expression / blink suppression — check

- [ ] **No expression overlay** on the baked face (no misaligned face image).
- [ ] **No blink** eyelid flashing over the baked eyes (watch ≥3 s).
- [ ] Optional DOM probe (raster active): **0** engine-injected expression `<img>` (an `<img>` in the
  avatar container **without** `data-c2-layer`), and **no** `#avatar-blink-layer` element.
- _Reference:_ with `AVATAR_R2=false` the same probe shows **1** expression overlay + a blink layer.

## 8. Cosmetic slot-gate — check (raster active)

- [ ] **Headwear, face, eyes** items do **not** render on the baked base (no floating hats/masks/glasses).
- [ ] **Clothing** (torso / body / neck) does **not** render (no overlay covering/clashing the baked outfit).
- [ ] Only `R2_PHASE1_SAFE_SLOTS = ["aura","back"]` pass through.

## 9. Aura / back cosmetics only — check

- [ ] **Aura** renders **behind** the figure and looks acceptable (glow, correct layering, no clip).
- [ ] **Back** items (if any) render behind and align acceptably.
- [ ] The combo case (aura + gated items) shows **only** the aura.

## 10. Rollback to AVATAR_R2=false — check

- [ ] Set `AVATAR_R2 = false`; reload each surface.
- [ ] Base renders via **C2/SVG** again (base `<img>` src ends `-c2.svg`; inline hair returns).
- [ ] Expression + blink + all cosmetic slots behave **exactly as before**.
- [ ] Working tree clean: no committed flag flip, no temp harness/screenshots.

## 11. Comparison vs North Star Master — check

Onion-skin / side-by-side of the raster render against `assets/avatar/reference/Northstar Master.png`:
- [ ] Reads unmistakably as the **same character** (silhouette, hair, outfit).
- [ ] **Large expressive eyes** preserved and legible.
- [ ] Head : body ratio and pose match (no drift from the ÷2 downscale/alpha-cut).
- [ ] Premium/anime finish preserved; no procedural/placeholder look.

## 12. Comparison vs current C2 avatar — check

Side-by-side of `-r2` vs `-c2` on the same surface:
- [ ] Raster is a clear **quality improvement** over the flat C2 placeholder.
- [ ] No regression in **position/scale** vs C2.
- [ ] No new clipping/artifacts introduced by the raster path.

## 13. PASS / FAIL criteria (gate before any wider preview)

**PASS — ready for wider (still-flagged) preview only if ALL hold:**
- Alpha edge clean (no halo) at 32/48/64 px (§4).
- Size/centering correct on avatar/hub/quiz; eyes legible at 32 px (§5).
- Breathing active; expression/blink fully suppressed on the baked face (§6–§7).
- Slot-gate correct: head/face/eye + clothing gated; only aura/back render, acceptably (§8–§9).
- Recognisably the North Star Master; clear improvement over C2; no positional regression (§11–§12).
- Rollback to `AVATAR_R2=false` restores C2 exactly; tree clean (§10).

**FAIL (do not widen; keep default-off) if ANY hold:**
- Visible white halo / dirty alpha edge; illegible eyes at small size.
- Wrong size/centering or a clear regression vs C2.
- Expression/blink overlays visible on the baked face; breathing broken.
- Any gated cosmetic (hat/mask/glasses/clothing) renders, or aura/back look broken.
- Doesn't read as the Master, or looks worse than C2.
- Rollback doesn't cleanly restore C2.

**Notes / defects found:** None failing. Clean alpha edge / no white halo at 32/48/64 px; centered &
correctly scaled on avatar/hub/quiz (eyes legible at 32 px); **exact likeness** to `Northstar Master.png`
(render is a pixel-faithful alpha-cut); **suppression verified by DOM probe** (0 expression overlays, no
`#avatar-blink-layer` on all raster surfaces) with breathing still active (`--breathe-scale` ≈1.006);
**slot-gate verified** (headwear/face/eyes/clothing gated — only aura/back render); **clean rollback** to
C2 at `AVATAR_R2=false` (base → `…-c2.svg`, expression overlay = 1, blink present). Known Phase-1
limitations are **by design, not failures:** PNG (not WebP) runtime asset; head/face/eye + clothing
cosmetics gated; single fixed neutral-medium base.

**Reviewer / date:** QA run 2026-07-01 (recorded on owner instruction)   **Result: ✅ PASS**

> A PASS here authorises only a **flagged** preview (still `AVATAR_R2=false` by default; enabled
> deliberately per audience). It is **not** production activation and **not** Phase-2. Known Phase-1
> limitations by design: PNG (not WebP) runtime asset; head/face/eye + clothing cosmetics gated;
> single fixed neutral-medium base. These are expected — do not fail the sign-off for them.
