# 164B.1 — Asset Production Plan (MVP Neutral North Star Stack)

_Production specification for the six MVP raster assets. Execution plan for the
**cut & export** of the neutral stack. Status: DRAFT (planning) — uncommitted._
_Governs: ADR-163F (asset spec), D-030 (z-stack), D-032 (geometry source), D-013/D-027
(resolution/canvas), D-019 (budget). `AVATAR_V2` stays OFF; no runtime wiring._

---

## 0. Shared fundamentals (apply to every asset)

### 0.1 Source of truth (D-032)
- **`assets/avatar/reference/Northstar Master.png` = SOLE geometric source.** All
  proportions, head/body ratio, pose, hair silhouette, face, eyes, rendering style and
  identity derive from it.
- **`Northstar Master - reference.png` = outfit-direction reference ONLY** (plain tee /
  plain trousers / plain sneakers). It must NOT drive geometry. Master wins on conflict.
- **Base production method (D-033):** the base is produced by **manual layered paint-over
  over Master**. **AI generation/inpainting is rejected as a base production method** (it
  repeatedly drifts proportions/identity); AI outputs may be used **only as outfit
  references**, never as the base asset.

### 0.2 Canvas, resolution, format (D-013 / D-027 / D-018)
- **Working master canvas:** 1024×1536, RGB → RGBA. (Confirm Master.png is exactly
  1024×1536 in Phase 0; if not, document the deviation before cutting.)
- **Full-canvas rule (D-027):** every layer is produced at the **same 1024×1536** with
  transparent padding. No cropped/trimmed per-layer assets. Composition is a pure
  z-overlay — no offset math.
- **Export:** integer ½ downscale → **512×768 WebP**, q≈85–90. High-quality
  (area-average) downsample.
- **Versioning (D-018):** ship as `…-v1.webp`. Never mutate a shipped asset; a change =
  a new `-v{n}`.
- **Output folders (ADR-163D):** `assets/avatar-r2/{base,face,eyes,blink,hair}/`.

### 0.3 Anchor map + eye-box revision
- Legacy geometry (D-004): viewBox `0 0 160 240`; head `cx80 cy50 r30`; eyes
  `cx68/92 cy47`. Scale to the master canvas with **×6.4**:
  - head centre → **(512, 320)**, r ≈ **192**
  - legacy eye centres → **(435, 301)** and **(589, 301)**
- **North Star eyes are enlarged** vs the legacy eye box → produce a **documented
  anchor-contract revision**: derive the actual eye box (centre + width/height) from
  Master.png and record it. Blink (Asset 5) and future eye cosmetics register to the
  **revised** eye box, not the legacy one. This revision is a required 164B deliverable.

### 0.4 Skin-tone token (D-028)
- MVP = **`medium`** (internal token, not a colour reading). **Sample the master's face
  skin** → that sampled tone/shading IS `medium`. Reuse it for **all reconstructed
  skin** (forearms/neck per outfit, eyelid) so skin-bearing layers stay consistent.

### 0.5 Background → alpha (mandatory prerequisite)
- Master is opaque white bg. Every cut layer exports with a **clean alpha channel**:
  white matted to transparent, **no white halo/fringe** at hair spikes and limb edges.

### 0.6 Precondition — Phase 1 gate (all sub-gates BLOCKING)
No finished asset below is produced until **every** Phase 1 sub-gate passes:
- **A — eye composite + iris tint**, **B — blink seam**, **C — hair luminance tint**
  (`tools/164b-prototype/prototype-gate.html`).
- **D — base coherence (added 164B.1; highest-risk asset, D-029 clarification).**
  Produce a **base prototype** — body + neutral default outfit **manually painted over
  Master geometry** in the master's cel-shade style (D-032; **manual paint-over only — AI
  generation/inpaint is rejected as a base method, D-033**) — and approve it before any
  finished layer:
  - **PASS:** (1) proportions/pose/silhouette match Master (verify by onion-skin/overlay
    against `Northstar Master.png` — no drift); (2) shading language, line weight and
    palette read as the **same character/finish** as Master; (3) reads as the **same
    character without the signature outfit** (vision criterion #1); (4) `medium` skin
    tone consistent across face/neck/hands/forearm.
  - **FAIL action:** repaint over Master geometry (regeneration is **not** acceptable —
    it drifted four times, D-032). Do **not** start finished layers until signed off.

---

## 1. `body-neutral-medium-v1.webp` — Base body (z 0–2, per skin tone)
**Role:** skin + neutral default outfit + head, **NO face, NO eyes**. Foundational layer
everything registers to. Skin-bearing (D-016).
**Production method (D-033):** **manual layered source / manual paint-over over Master** —
AI generation/inpaint is **not** an allowed base method (it drifts); AI outputs are outfit
references only.

- **Source (extract directly):** head skin (forehead, cheeks, jaw, ears), neck, hands;
  the full silhouette, pose and proportions; the body geometry under the clothing
  (limb positions). Lift the skin + head **shape** only.
- **Reconstruct (not in source):**
  - the **entire neutral default outfit** — the master's sweater/jeans/sneakers are
    reference art, **never baked into base** (D-029). Outfit *direction* from
    `reference.png` (plain grey tee, plain charcoal trousers, plain low sneakers);
    *geometry* from Master.
  - body **skin/volume hidden under the master's clothing** (torso, arms, legs, feet).
  - **Forearm skin** if the neutral tee is short-sleeved (the master's long sleeves hide
    forearms → short-sleeve exposure must be painted in `medium` tone). *Decision point:*
    match sleeve length to reconstructable exposure, or accept forearm reconstruction.
- **Hidden regions:** all skin under clothing; body shape beneath clothing; feet.
- **Manual paint work:**
  1. Remove master clothing; rebuild the body underneath following the master silhouette.
  2. Paint the neutral default outfit in the **same cel-shade language** as the master.
  3. Paint exposed skin (neck, hands, any forearm) using the sampled `medium` tone.
  4. Leave the **face area blank** (skin only — no brows/nose/mouth/eyes); keep clean,
     even skin where the face + eye layers will composite.
- **Output:** opaque body, transparent elsewhere; full canvas → 512×768 WebP. **~40–60 KB.**
- **QA gate:**
  - silhouette + anchors match Master proportions (no drift — this is the geometry lock).
  - head/eye region leaves clean registration space for face + eyes.
  - `medium` tone consistent across face/neck/hands/forearm.
  - **reads as the same character without the signature outfit** (vision criterion #1).
  - bg→alpha clean at scalp-edge + limb edges; weight in budget.
  - **Phase 1 sub-gate D (base coherence) signed off** before finalization (0.6). This
    is the **single highest-risk MVP asset** (reconstruction-grade, D-029 clarification).
- **Depends on:** Phase 1 PASS incl. **sub-gate D**, anchor map (0.3), sampled `medium`
  tone (0.4). **First finished asset.** Supplies the skin + head/eye geometry all later
  layers register to.

---

## 2. `face-neutral-v1.webp` — Face / Expression (z 3, shared, tone-agnostic)
**Role:** brows, nose, mouth, **multiply** blush — **NO eyes, NO skin** (D-022). Shared
across all skin tones.

- **Source (extract):** brow shapes/positions, nose indication, mouth (neutral slight
  smile), blush location — from the master face.
- **Reconstruct:** **tone-agnostic separation** — cut the features carrying **zero opaque
  skin** (base owns skin). Re-author blush as a `multiply` shape.
- **Hidden regions:** none — this is a *separation* problem, not a missing-region one.
- **Manual paint work:**
  1. Clean every feature edge so **no skin pixels** remain.
  2. Rebuild the nose as a line/soft-shadow that reads over **any** tone (a
     medium-shaded nose patch will fail on dark skin).
  3. Convert blush to a soft `multiply`-able shape.
  4. Confirm **no eye content** is included (eyes are Assets 3/4).
- **Output:** sparse alpha, full canvas → 512×768 WebP. **~10–20 KB.**
- **QA gate:**
  - overlay on a **different-tone** base → **no skin patch / no halo** (the tone-agnostic
    test — the defining check).
  - registers correctly over the base head; neutral expression matches the master.
  - blush reads correctly via `multiply`.
- **Depends on:** Asset 1 (registers to base head geometry).

---

## 3. `eyes-neutral-iris-v1.webp` — Eyes / iris (z 4, shared, **tintable**)
**Role:** the **tintable** iris base only (eye colour = token, D-015). Paired with Asset 4.

- **Source (extract):** iris discs + pupil from the master eyes.
- **Reconstruct:** isolate the **iris base only**; **neutralize** it (flatten/lighten the
  baked brown so a `multiply` tint reads clean across colours); **split off** the
  catchlight and sclera (→ Asset 4).
- **Hidden regions:** iris area beneath the catchlight; any iris under the lower lid.
- **Manual paint work:**
  1. Paint the iris as a tint-ready region: even, neutral-light base (dark enough to read,
     light enough that multiply by the 8 colours isn't muddy).
  2. **Pupil stays in the iris** as the dark centre (multiply keeps dark dark).
  3. Remove the baked highlight entirely (it belongs to Asset 4, fixed).
- **Output:** tiny alpha, full canvas → 512×768 WebP. **~5–10 KB.**
- **QA gate:** tints cleanly across default + test palette (prototype gate A);
  **no catchlight** on this layer; seats under the fixed sclera with **no gap**.
- **Depends on:** Asset 1 (skin behind), revised eye box (0.3), prototype gate A. Produce
  **as a pair** with Asset 4.

---

## 4. `eyes-neutral-fixed-v1.webp` — Eyes / fixed (z 4, shared, **never tinted**)
**Role:** sclera + lash line + eye shape + **fixed catchlight** (D-021). Drawn **above**
the iris in the eye composite (`base-skin → iris(tinted) → fixed`).

- **Source (extract):** sclera, upper lash line, eye outline/shape, catchlight.
- **Reconstruct:** **full sclera ownership** — paint the sclera complete so the tinted
  iris seats on it with **no double-white and no seam gap** (164A prerequisite).
- **Composite contract (critical):** in `fixed`, the **central iris opening is
  transparent** (so the iris layer below shows through); the **sclera (white around the
  iris), lash line/outline, and catchlight are opaque**. The iris opening shape in `fixed`
  defines the visible iris shape. The catchlight sits on top of everything and **never
  tints**.
- **Hidden regions:** sclera occluded by the iris in the master (paint it in full).
- **Manual paint work:**
  1. Extend sclera fully behind/around the iris opening.
  2. Clean the lash line + outline; keep crisp for 32px legibility (heavier line weight).
  3. Place the fixed catchlight as an opaque highlight dot.
- **Output:** sparse alpha, full canvas → 512×768 WebP. **~10–15 KB.**
- **QA gate:** sclera ownership (no double-white, no iris-edge seam); catchlight present
  and **never tints**; lash crisp @32px.
- **Depends on:** Asset 1, revised eye box, prototype gate A. Pair with Asset 3.

---

## 5. `eyelid-medium-v1.webp` — Blink (z 5, per skin tone)
**Role:** closed-eye eyelid. Skin-bearing (the closed lid shows skin, D-023).

- **Source:** **NONE** — the master eyes are open. 100% invented.
- **Reconstruct:** the entire closed-eye state — eyelid skin (`medium`), downward closed
  lash line, subtle crease — registered to the **revised** eye box; must fully cover the
  open-eye region.
- **Hidden regions:** the whole closed-eye appearance.
- **Manual paint work:**
  1. Paint the eyelid covering the full eye box in the sampled `medium` tone.
  2. Add the downward closed lash line + a subtle crease.
  3. Ensure **≥99% coverage** of the open-eye region (no iris/sclera peek).
- **Output:** sparse alpha, full canvas → 512×768 WebP. **~10–15 KB.**
- **QA gate:** blink coverage **≥99%** (prototype gate B); eyelid tone matches base
  `medium` (no seam); lash registration; reads as a natural blink in the composite.
- **Depends on:** Asset 1 (tone match), Assets 3+4 (the eye composite it must cover),
  revised eye box, prototype gate B. **Produced after the eyes.**

---

## 6. `hair-northstar-v1.webp` — Hair (z 40, shared, **tintable luminance map**)
**Role:** the one approved hairstyle (D-031), as a neutral luminance map; default `brown`
tint via `multiply` (D-014). Best-case layer (front-facing, unobstructed).

- **Source (extract):** the full hairstyle silhouette + shading — lifts cleanly.
- **Reconstruct:** convert the brown cel-shaded hair → **neutral grayscale luminance
  map** (preserve light/dark, remove hue) so the default `brown` token (`#5A3D28`)
  multiply ≈ the master; clean the forehead hairline; clean the spike alpha.
- **Hidden regions:** back-of-head / scalp under hair (irrelevant for the front pose).
- **Manual paint work:**
  1. Desaturate → balance the luminance **midpoint** so `multiply` by `#5A3D28`
     reproduces the master brown (target ΔE ≤ 10).
  2. Refine alpha on the wispy spikes (**no white halo**).
  3. Fill any scalp gap at the hairline so no skin shows through at the part.
  4. *Fallback if single-tint can't hit master brown:* duotone model (base on lights /
     shadow on darks) — resolve in the prototype, not here.
- **Output:** full canvas → 512×768 WebP. **~30–50 KB.**
- **QA gate:** default tint **ΔE ≤ 10** vs master (prototype gate C); all 8 colours read
  (no black-crush, no muddy blonde); clean spike alpha; renders correctly at z40 over the
  full stack.
- **Depends on:** Asset 1 (head-top geometry). **Independent of face/eyes** — can run in
  parallel. Prototype gate C.

---

## 7. Dependency order (production sequence)

```
Phase 0  Setup ────────────────────────────────────────────────
         confirm 1024×1536 · anchor map + EYE-BOX REVISION (0.3)
         · sample medium tone (0.4) · bg→alpha working copy (0.5)
                              │
Phase 1  PROTOTYPE GATE (precondition) ── A eye · B blink · C hair
         · D base-coherence (base prototype approved vs Master — D-029)
         all PASS ──────────────┐  (any FAIL → iterate prototype only)
                              ▼
Phase 2  [1] BASE (foundational, HIGHEST-RISK reconstruction; locks skin tone
             + head/eye geometry; finalized from the approved D base prototype)
                              │
            ┌─────────────────┼───────────────────┐
            ▼                 ▼                     ▼   (parallel after base)
Phase 3  [6] HAIR        [2] FACE            [3]+[4] EYES (iris+fixed pair)
            │                 │                     │
            └─────────────────┴──────────┬──────────┘
                                         ▼
Phase 4                            [5] EYELID (needs base tone + eye composite)
                                         │
                                         ▼
Phase 5  FULL-STACK QA GATE + D-019 budget measurement
```

**Rules of the order:**
- **Base is first and blocking** — it defines the `medium` tone and the head/eye geometry
  every other layer registers to.
- **Hair / Face / Eyes** can run in parallel once base exists (independent registrations).
- **Eyelid is last** — it must match the base tone and cover the finished eye composite.
- **Eyes are a pair** (iris + fixed) — never finished independently.

---

## 8. Final 164B QA gate (full-stack, Phase 5)
Render the locked z-stack `base(0–2) → face(3) → eyes(4) → blink(5) → hair(40)` and verify:
- **Eyes:** legible @32px, **expressive @48px** (vision criterion #2).
- **Face:** paints **no skin** (no patch on any tone).
- **Iris:** tints across colours; **catchlight fixed** (never tints).
- **Sclera:** ownership proven (no double-white / seam).
- **Blink:** ≥99% coverage; tone-matched; natural.
- **Hair:** default tint ΔE ≤ 10; 8 colours read; clean spikes.
- **Alpha:** no white halo on any layer.
- **Canvas:** all layers 1024×1536 full-canvas → pure z-overlay alignment (D-027).
- **Budget (D-019, measured not assumed):** 5-layer neutral stack ~75–120 KB; + hair;
  **total avatar < ~350 KB**; **decoded memory < ~15 MB**; first-paint <100ms /
  composite <250ms when later wired.

**Exit:** all pass → 164B produces the proven neutral stack. The 6 other expressions
(D-024) + cosmetics follow parity-first (D-009). `AVATAR_V2` stays OFF until a later
activation section.

---

## 9. Deliverables checklist
- [ ] Phase 1 gate passed: A eye · B blink · C hair · **D base-coherence** (0.6)
- [ ] Eye-box anchor-contract revision (documented; 0.3)
- [ ] `body-neutral-medium-v1.webp`
- [ ] `face-neutral-v1.webp`
- [ ] `eyes-neutral-iris-v1.webp`
- [ ] `eyes-neutral-fixed-v1.webp`
- [ ] `eyelid-medium-v1.webp`
- [ ] `hair-northstar-v1.webp`
- [ ] Full-stack QA gate report (incl. measured D-019 budget)
