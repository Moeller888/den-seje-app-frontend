# 167A Phase-2 — Decomposition Audit & Implementation Plan

Status: **PLAN / AUDIT ONLY — not executed. No runtime code, no assets, no manifest, no flag changed
by this document.** Phase-2 code MUST NOT start until the "do-not-start" gates (§13) are met.
Date: 2026-07-01. Owner: project owner (solo).

Builds on (read first):
[167a-master-asset-raster-wiring-plan.md](./167a-master-asset-raster-wiring-plan.md) (plan of record §A/§B/§F),
[167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md) (§5 Phase-2 stack, §6 hair, §7 eye-box),
[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md) (**binding guardrail**),
[164k-anchor-mask-extraction-plan.md](./164k-anchor-mask-extraction-plan.md) (D-041 anchor/mask method),
[AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md) §4/§6/§9, [project-state.md](./project-state.md) (D-012…D-041).

> **Scope discipline.** Phase-2 is still the **167A asset migration** — it swaps *artwork* for a
> decomposed raster stack and re-drives the *existing* engines against it. It is **NOT** an avatar
> rewrite. Everything in the preservation report's "guaranteed unchanged" list stays unchanged; the
> only two contract deltas (hair render technique, raster-only eye-box) are **already pre-approved**
> there and in the step-3 plan, so they are not defects.

---

## 1. Current Phase-1 baseline (what already exists — do not redo)

Verified in code (`js/avatar-layers.js`, `js/avatar-render-c2.js`) and docs:

- **Scaffold + resolvers shipped:** `assets/avatar-r2/` + `R2_MANIFEST` + inert r2 resolvers
  (`baseSrcForR2`, `faceSrcForR2`, `eyesSrcForR2`, `eyelidSrcForR2`, `hairSrcForR2`) alongside the
  untouched C2/SVG resolvers.
- **Phase-1 baked base wired (step 3a):** `assets/avatar-r2/base/body-neutral-medium-v1.png`
  (deterministic alpha-cut of the frozen Master, ÷2 → 512×768, ~244 KB) registered
  `base:{ "neutral-medium":{ v:1, ext:"png" } }`, consumed by `mountC2Avatar` → `composeR2Layers`
  **only when `AVATAR_R2` is true** (default `false`).
- **Engine guard:** when `isAvatarR2ActiveFor(identity)` the callers **skip mounting Expression +
  Blink** (face is baked); **Presence/breathing stays on**. Engine *logic* untouched.
- **Cosmetic slot-gate:** on the raster base, `composeR2Layers` renders only
  `R2_PHASE1_SAFE_SLOTS = ["aura","back"]`. Head/face/eye + clothing slots are gated.
- **Visual sign-off = PASS**, **pilot opt-in live** (`localStorage.avatar_r2='1'`, no cohort/DB),
  first pilot user (test-student) verified. **`AVATAR_R2 = false` by default** → production renders
  the untouched C2/SVG avatar.
- **Locked decisions in force:** D-040 (Master-as-is Tier-0), D-013 (WebP target; PNG interim),
  D-018 (immutable versioned assets), D-030 (z-stack), D-021/D-022/D-023/D-024 (eyes/face/blink/
  expression MVP scope), D-033/D-034 (AI forbidden for geometry; AI only for cosmetic overlays).

**Phase-1 is complete and pilot-ready. Nothing in §1 is re-opened by Phase-2.**

## 2. Non-goals (Phase-2 must NOT do these)

- ❌ Rewrite/redesign the avatar architecture, identity model, z-model, or render pipeline.
- ❌ Change the `mountC2Avatar` public entry point / signature (a tiny backward-compatible predicate
  addition in `js/avatar-layers.js` is the only permitted surface growth — §8).
- ❌ Change `AVATAR_R2`'s `false` default, or the `localStorage.avatar_r2` opt-in mechanism.
- ❌ Remove or mutate the Phase-1 PNG baked base (`…-v1.png`) — it stays as rollback + interim.
- ❌ Touch the C2/SVG fallback path, legacy `SLOT_Z`/`SLOTS`, ownership/shop/inventory (DB), or the
  Tier-2 AI item conveyor.
- ❌ Use AI to generate ANY geometry-defining rig layer (base/face/eyes/eyelid/hair) — D-033/D-034.
- ❌ Enable globally, add cohort/% rollout, or flip the flag.
- ❌ Move the **legacy/C2 eye anchors** (`cx68/92 cy47`) — that would move the current live avatar's
  blink/expression (a regression). The revised eye box is **raster-path only**; two anchor sets coexist.

## 3. Decomposition target stack (permanent target — 163F, locked D-030)

The Phase-1 single baked image is decomposed back into the locked living stack. z-values are
**unchanged** from `C2_LAYER_Z` / `C2_BASE_Z` / `C2_HAIR_Z` (`js/avatar-layers.js:274-286`):

| z | Layer | Per skin tone | Driven by | Source asset |
|---|---|---|---|---|
| 0–2 | Base body (skin + neutral underlayer + head, **no face**) | yes | identity | `body-{type}-{tone}-v2.webp` |
| 3 | Face / expression (brows, nose, mouth, multiply blush; **no skin/eyes**) | shared | **ExpressionEngine** (logic unchanged; asset map → raster) | `face-{expr}-v1.webp` |
| 4 | Eyes (`iris` tintable + `fixed` highlight) | shared | eye-color token (tint iris only) | `eyes-neutral-{iris,fixed}-v1.webp` |
| 5 | Blink (eyelid, shows skin) | yes | **BlinkEngine** (logic unchanged; geometry → revised eye box) | CSS-ellipse (interim) → `eyelid-{tone}-v1.webp` |
| 40 | Hair (neutral luminance map + `mix-blend-mode:multiply` tint) | shared | hair-color token | `hair-northstar-v1.webp` |
| `C2_LAYER_Z` | Cosmetics (equipped slots) | n/a | equipped_slots | existing resolver, staged un-gate (§7) |

**Delta vs Phase-1:** Phase-1 collapsed z0–z40 into one baked image with `["aura","back"]` cosmetics.
Phase-2 restores the six real layers and re-enables the living engines on layers 3/4/5.

## 4. Required assets (Phase-2 MVP — neutral-medium identity first)

All **512×768 served (÷2 from 1024×1536), transparent, full-canvas** (D-013/D-027). WebP is the
production format (D-013); see §9 for the PNG-vs-WebP gate.

| # | Asset | Content | Producer |
|---|---|---|---|
| 1 | `base/body-neutral-medium-v2.webp` | skin + **neutral underlayer** + head, **NO face/eyes/hair/outfit** | **HUMAN paint-over (D-033)** — highest risk; must pass 164B.3 |
| 2 | `face/face-{neutral,curious,focused,determined,proud}-v1.webp` (+ `happy`,`surprised` for the D-024 set of 7) | brows/nose/mouth + `multiply` blush; tone-agnostic; **no skin/eyes** (D-022) | HUMAN |
| 3 | `eyes/eyes-neutral-iris-v1.webp` | tintable iris disk (neutral luminance) (D-015/D-021) | HUMAN |
| 4 | `eyes/eyes-neutral-fixed-v1.webp` | sclera + lash + eye shape + fixed catch-light (D-021) | HUMAN |
| 5 | `eyelid/eyelid-medium-v1.webp` | eyelid showing skin (D-023) — *optional interim* (CSS ellipse can bridge) | HUMAN |
| 6 | `hair/hair-northstar-v1.webp` | neutral **luminance map** for multiply tint (`hair-northstar-v1`, D-031) | HUMAN |

> The face set actually **driven** by the engine today is 5 (`neutral, curious, focused, determined,
> proud` — see `STATE_EXPR_MAP` + `CONFIGS` in `js/avatar-expression-engine.js`). D-024 authorises 7
> (adds `happy`, `surprised`). MVP-minimum = the 5 in use + neutral; producing all 7 future-proofs the
> map with no code change (the map already falls back to `neutral`).

## 5. Generated-vs-human-art split (audit Q1–Q3)

**Deterministic / mechanical (non-AI) — may be produced now as REVIEW/BUILD artifacts only**
(gitignored `tools/avatar/build/`, never runtime, never geometry-altering):
- The Phase-1 baked base (already done — `extract-master-base.mjs`).
- Anchor template + 5 MVP masks (already done — `extract-anchor-masks.mjs`, §6).
- **Candidate cut guides**: region crops of the Master (face-region, eye-boxes, hair silhouette,
  head-oval) using the existing anchor rectangles — as *onion-skin guides for the human painter*, not
  as final layers. A tiny extension of the existing extractors can emit these (review-only).
- Alpha-cut, ÷2 downscale, protected-zone diagnostics, budget/legibility measurement, PNG→WebP encode.

**Human art (AI FORBIDDEN — D-033/D-034; all are geometry-defining rig layers):**
- **All six assets in §4.** The base (#1) is the single highest-risk asset: it requires *reconstructing
  skin + a neutral underlayer behind the baked face/hair/outfit* — that is paint work, not a threshold
  op, and four AI regenerations already drifted proportions/identity (R-6, confirmed by D-033). Face,
  eyes, eyelid and the hair luminance map are likewise hand-authored against the Master + the anchor
  template.

**AI:** **not used anywhere in Phase-2.** AI stays scoped to Tier-2 cosmetic overlays (D-034),
which are **out of scope** for the decomposition and are not required to ship Phase-2.

## 6. Anchor / eye-box plan (audit Q4–Q5)

**Which artifacts are good enough (Q4):** `tools/avatar/build/anchors/avatar-anchor-template-v1.json`
(164L primitive model + 164S eye semantics + 164T eye-box recalibration) is derived from the **same
frozen Master** and is already in **North Star proportions**. It carries, in 1024×1536 master px:
eye boxes, strict pupil/iris/glasses-lens semantic centres, glasses band, face-mask region, headwear
region, shoulder/back anchors, and protected zones (face/eyes/hair/body/skin-like). Together with the
5 QA/build masks (`build/masks/mask-{aura,back,headwear,face,eyes}-v1.png`), **this is a sufficient
anchor/mask SOURCE for Phase-2** — no new extraction is required.
**Caveat — sign-off scope (precise):** the **164L worksheet is CONDITIONAL PASS / human-signed
(2026-06-18)**, but that sign-off covers the **Tier-2 cosmetic mask/tooling baseline only** (explicitly
"NOT approval to start a bulk shop-item batch"), and every anchor field in the JSON still carries
**`humanReviewRequired: true`**. It is **not yet signed for driving the Phase-2 runtime rig eye-box**
(re-registering the live blink/eye rig). So the artifacts are *good enough to build against* but
Phase-2 still requires a **scoped anchor/eye-box sign-off** — confirming the revised eye-box may drive
the runtime rig, clearing `humanReviewRequired` for that use — **before any runtime rig implementation**
(a Phase-2 gate, §13). See [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) §6/§10.

**Which anchors must be revised for North Star (Q5):** the **legacy/C2 engine geometry**, which is
placeholder-era and does **not** match the Master:
- `BlinkEngine` hard-codes `EYES = { L:{cx:68,cy:47…}, R:{cx:92,cy:47…} }` in the 160×240 viewBox
  (`js/avatar-blink-engine.js:35`) — legacy blink centres **cx68 / cx92, cy47**.
- The North Star **eye-opening centres** from the anchor-template artifact (`eyeLeftBox`/`eyeRightBox`
  boxCenter, master `(427,386)` / `(580,386)`) map ÷6.4 into 160×240 as **≈ cx66.7 / cx90.6, cy60.3** —
  i.e. the North Star eye area sits **~13 units lower** than the legacy `cy47` box (roughly the same
  horizontal spacing, in a slightly larger box). Precise per-eye box/iris/pupil values (master ÷2 ÷6.4):
  [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) §6.
- The C2 base geometry contract (head `cx80 cy50 r30`, eyes `cx68/92 cy47`) is likewise legacy.

**Plan:** introduce a **revised eye-box constant used ONLY on the raster path**, sourced from the
anchor template (converted 1024-px → the render coordinate space). Blink + eye-cosmetics re-register
to it **only when `useRaster`**. The legacy/C2 anchors are **left byte-for-byte** so the live SVG
avatar's blink/expression never move (§2). Two anchor sets coexist, selected by the render branch —
exactly as pre-approved in step-3 §7 and the preservation report (risk #2, "pre-planned → not a
defect").

## 7. Blink / expression reactivation plan (audit Q6)

Both engines are already **format/logic-agnostic** (verified): `ExpressionEngine` sets `img.src` from
the `EXPRESSIONS` map and falls back to `neutral` on load error; `BlinkEngine` animates a `scaleY`
ellipse on fixed geometry with Poisson timing + reduced-motion + skin-tone fill. Reactivation is
therefore **asset + geometry rewiring, not an engine rewrite** (preservation report: expression/blink
= "asset-path update only").

Safe re-enable sequence (each step gated on the matching produced asset):
1. **Un-skip the engines on the raster path** — only when a **full living stack** exists for the
   identity (new `hasR2LivingStackFor(identity)` predicate, §8), so a partial set never flashes bare
   layers. Until then Phase-1 static-face behaviour stays.
2. **Face (z3):** point `EXPRESSIONS` (`js/avatar-personality.js`) at the raster `face-{expr}-v1.webp`
   **with the existing C2 map as fallback**. Keep every state→profile mapping, hold/priority/fade,
   relational delays, reduced-motion. No engine code change beyond the asset map.
3. **Eyes (z4):** render `iris`(tinted via eye-color token) + `fixed` as a static pair below blink;
   iris tint reuses the token approach (no per-color asset explosion, D-015).
4. **Blink (z5):** feed `BlinkEngine` the **revised raster eye-box geometry** (§6). MVP-interim: keep
   the CSS-ellipse eyelid (skin-tone fill already tone-aware) re-positioned to the North Star box —
   lowest risk; the `eyelid-{tone}.webp` raster asset (D-023) is a later refinement, not a blocker.
5. **Presence/breathing:** unchanged — it already runs through Phase-1 and Phase-2 (format-agnostic
   CSS custom properties, no `src` coupling).

**QA gate for reactivation:** DOM probe must show expression overlay = 1 and a blink layer positioned
on the North Star eye box (mirror the Phase-1 §7 probe, inverted), eyes legible at 32px, breathing
still active — before widening the pilot.

## 8. Cosmetic un-gating plan (audit Q7 — staged, each stage behind a mask+anchor sign-off)

Phase-1 renders only `["aura","back"]`. Un-gate in stages, extending the safe-slot set **only after**
the matching mask (§6) + revised anchor are human-signed:

| Stage | Add slot(s) | Precondition |
|---|---|---|
| **P2-a** (current) | `aura`, `back` | shipped (behind-figure, anchor-independent) |
| **P2-b** | `headwear` | headwear mask + revised crown/head anchor signed; eyes-legible composite gate |
| **P2-c** | `face` (masks), `eyes` (glasses) | face-mask + revised **eye-box** anchor signed (same work as blink §6/§7) |
| **P2-d** | `torso` (+ later `neck`/`body`) | **decomposed base v2 exists** (baked outfit removed) so clothing no longer clashes; torso mask signed (D-036 conditional) |

Mechanism: promote `R2_PHASE1_SAFE_SLOTS` to a staged `R2_SAFE_SLOTS` (name kept backward-compatible)
that grows per stage. **No z-model/slot-name/shop/ownership change** — this only widens which existing
slots the raster compositor passes through. `torso` stays gated until asset #1 (v2 base) ships, because
Phase-1's base carries the Master's baked outfit (D-040 accepted interim).

## 9. What stays PNG vs future WebP (audit Q9)

- **Phase-1 base (`…-v1.png`): stays PNG.** It is the rollback + interim runtime asset; never mutated
  (D-018). Do not touch it.
- **Phase-2 layers: WebP required.** Six decomposed layers as PNG would blow the D-019 budget
  (<350 KB total avatar); WebP (with alpha) is mandatory here, not optional. **This makes a WebP
  encoder a HARD Phase-2 gate** — currently *absent* (no cwebp/ffmpeg/ImageMagick/sharp in the
  environment; the same blocker that deferred the Phase-1 WebP swap). `extract-master-base.mjs`
  already prints the exact `cwebp` command; Phase-2 reuses that encode path once an encoder exists.
- **Versioning:** the decomposed base ships as **`-v2.webp`** (new version — the baked `-v1` is never
  overwritten, D-018). Face/eyes/eyelid/hair ship as `-v1.webp` (first raster version of those layers).

## 10. Manifest / versioning plan (audit Q8)

`R2_MANIFEST` already has the right shape (`base/face/eyesIris/eyesFixed/eyelid/hair`) and the
normaliser (`r2Entry`) already accepts `{ v, ext }`. Phase-2 only **populates** it — no schema change:

```
R2_MANIFEST = {
  version:  2,                                   // bumped on the atomic Phase-2 cutover
  base:     { "neutral-medium": { v:1, ext:"png" },   // Phase-1 baked (KEEP as rollback)
              // v2 decomposed base added ONLY at the atomic living-stack cutover:
              // "neutral-medium": { v:2, ext:"webp" } },
  face:     { "neutral":1, "curious":1, "focused":1, "determined":1, "proud":1 /*,happy,surprised*/ },
  eyesIris: { "neutral":1 }, eyesFixed:{ "neutral":1 },
  eyelid:   { "medium":1 },  hair:{ "northstar":1 },
}
```

**Atomicity rule (critical):** the base entry must NOT flip `v1→v2` until the *whole* living stack
(v2 base + face + eyes + eyelid/CSS-lid + hair) is present, because the v2 base has **no baked face**
— registering it alone would render a faceless avatar. Gate this with a new
**`hasR2LivingStackFor(identity)`** predicate (additive export; `hasR2BaseFor`/`hasR2StackFor` stay).
Until the cutover, the manifest keeps base `v1` and the raster path stays Phase-1 (baked, static face).

## 11. Test / QA plan

- **Unit** (extend `tests/` / node tests): `composeR2Layers` returns the full six-layer stack when the
  manifest is populated (fixture manifest) and the base-only stack in Phase-1; `hasR2LivingStackFor`
  true only with the complete set; revised eye-box constant maps correctly; C2 stack returned when
  `useRaster` false.
- **Engine probes** (mirror the Phase-1 signoff, inverted): raster active → expression overlay = 1,
  blink layer present **and centred on the North Star eye box**, breathing active.
- **Fidelity/goldens:** re-baseline C2 goldens **only after** human onion-skin-vs-`Northstar Master.png`
  sign-off (goldens currently lock the placeholder/Phase-1 — change deliberately). Keep
  `toHaveScreenshot({ animations:"disabled" })` + `retries:1`. Assert base `src` is the r2 WebP (not
  `-c2.svg` / `-v1.png`), correct face/eyes/blink/hair layers present, eyes legible at 32/48/64px.
- **Budget:** total avatar < ~350 KB, decoded < ~15 MB, first-paint < 100 ms (D-019); hair-tint
  fidelity per hair color (R-7) at 32/48/64px.
- **Fallback:** with `AVATAR_R2=false` (default) every surface renders the untouched C2/SVG avatar;
  full Playwright suite green on all 3 browsers.
- **Human visual sign-off** (167a §E) is mandatory and separate from green tests.

## 12. Rollback plan

- **Instant / production:** `AVATAR_R2 = false` (already the default) → C2/SVG. No data impact.
- **Per-stage manifest rollback:** point `R2_MANIFEST.base` back to `{ v:1, ext:"png" }` (Phase-1
  baked) and/or empty the `face/eyes/hair` entries → resolvers fall back, `hasR2LivingStackFor`
  goes false, engines re-suppress → clean return to Phase-1 static base. No shipped asset is mutated
  (D-018), so rollback is a manifest edit, not an art change.
- **Cosmetic un-gate rollback:** shrink `R2_SAFE_SLOTS` back to `["aura","back"]`.
- **Code:** `git revert` the Phase-2 wiring commit; the scaffold, Phase-1 baked base, and C2 path all
  remain intact.

## 13. Recommended implementation sequence + "DO NOT START until assets exist" gates

**Preparatory step that is safe NOW (doc/tool only — the one permitted prep step):**
- **P2-0 — Phase-2 asset production brief** ([167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md),
  **written**; doc only) + a
  decision-register note in `project-state.md`: the per-layer cut-list (§4), the human paint-over
  brief for the v2 base (D-033 / 164B.3 acceptance), and the North Star eye-box numbers (§6) the
  painter/anchor-signer work against. Optionally a **review-only** extension of the existing
  extractors that emits onion-skin *cut guides* into `tools/avatar/build/` (gitignored, non-runtime).
  **No runtime code, no `AVATAR_R2` change, no runtime assets.** *(Not executed by this document.)*

**Then, strictly gated (do NOT start the next until the gate holds):**

| Step | Work | GATE — do not start until… |
|---|---|---|
| 1 | **Phase-2-scoped anchor/eye-box sign-off** (beyond the existing 164L Tier-2 conditional pass) | the eye-box is signed to drive the runtime rig (`humanReviewRequired` cleared for that use — §6) |
| 2 | **Human art**: v2 decomposed base | passes the **164B.3** base-coherence gate |
| 3 | Human art: face×(5–7), eyes iris/fixed, eyelid, hair map | v2 base signed (shared geometry datum) |
| 4 | ✅ **WebP encoder available** (SATISFIED 2026-07-02) + encode all layers | encoder exists: vendored libwebp `cwebp.exe` + `tools/avatar/encode-webp.mjs` (`fetch-cwebp.mjs` to re-fetch). Was the HARD infra gate (§9); now cleared — encoding the layers waits on the art (gates 2–3) |
| 5 | Code **3b**: raster hair (blend-mode multiply + fallback) | `hair-northstar-v1.webp` exists in manifest |
| 6 | Code **3c**: wire face/eyes + revised eye-box; reactivate engines behind `hasR2LivingStackFor`; base→v2 (atomic) | the **full** living stack (steps 2–4) exists |
| 7 | Staged cosmetic un-gate (P2-b→P2-d, §8) | each stage's mask + anchor signed |
| 8 | Golden re-baseline + human onion-skin sign-off + pilot widen | steps 5–7 green; visual sign-off PASS |

**Explicit do-not-start gates (binding):**
- **No Phase-2 runtime code** until the Phase-2-scoped anchor/eye-box sign-off (step 1) AND the v2 base passes 164B.3 (step 2).
- **No engine reactivation / base v2 cutover** until the whole living stack + WebP encode exist (steps 3–4).
- **No cosmetic un-gate** for a slot until its mask + revised anchor are signed.
- **`AVATAR_R2` stays `false`** and the `localStorage.avatar_r2` pilot path stays intact throughout.
- **AI never produces a rig layer** (D-033/D-034).

## 14. Preservation checklist (must all hold across Phase-2)

- [ ] `mountC2Avatar` signature/entry point unchanged; only additive predicates
  (`hasR2LivingStackFor`) exported from `js/avatar-layers.js`.
- [ ] C2/SVG path byte-for-byte unchanged when `useRaster` false; `[data-c2-layer]` cleanup preserved.
- [ ] z-model (`C2_LAYER_Z`, base z0, hair z40, expr z3, eyes z4, blink z5) unchanged.
- [ ] Expression / Presence / Blink engine **logic** unchanged (asset map + raster-only eye-box only).
- [ ] Legacy/C2 eye anchors (`cx68/92 cy47`) unchanged — revised box is raster-path only.
- [ ] Identity / cosmetics / ownership / shop / inventory / state models unchanged.
- [ ] Phase-1 PNG baked base retained; `AVATAR_R2=false` default + `localStorage.avatar_r2` intact.
- [ ] Assets immutable + versioned (v1 baked never mutated; v2 = new file) — D-018.

## 15. Audit answers (index)

1. **Layers required** — §3 (base z0-2, face z3, eyes z4, blink z5, hair z40; cosmetics).
2. **Mechanically generable** — §5: baked base + anchors + masks (done); onion-skin cut guides; encode/downscale. Not the final rig layers.
3. **Human art required** — §5: all six §4 assets (base highest risk, D-033); AI forbidden.
4. **Anchor artifacts good enough** — §6: the 164L/164S/164T template + 5 masks (North Star proportions). 164L is CONDITIONAL PASS (signed 2026-06-18) for the **Tier-2 cosmetic tooling baseline only**; a **Phase-2-scoped eye-box sign-off** is still required for the runtime rig (fields stay `humanReviewRequired`).
5. **Anchors to revise** — §6: legacy/C2 engine geometry (blink `cy47`, C2 head/eyes) → raster-only revised eye box from the template.
6. **Blink/expression re-enable** — §7: un-skip behind a living-stack predicate; face map → raster + fallback; blink → revised eye box; breathing already on.
7. **Cosmetic un-gate** — §8: staged headwear → face/eyes → torso, each behind a signed mask+anchor.
8. **Manifest/versioning** — §10: populate existing shape; v2 base new version; atomic cutover; new predicate.
9. **PNG vs WebP** — §9: Phase-1 base stays PNG; Phase-2 layers must be WebP (encoder = hard gate).
10. **Smallest first step** — §13 P2-0: the Phase-2 asset brief doc (+ optional review-only cut guides). No runtime code.

---

_This document changes no runtime code, no assets, no manifest, and does not alter `AVATAR_R2`.
Phase-2 remains an asset migration gated on human art + the §13 gates._
