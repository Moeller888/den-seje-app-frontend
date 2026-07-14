# AVATAR_SYSTEM.md — Den Seje App

_Consolidated overview of the avatar system: philosophy, pipeline, rendering, storage, roadmap._
_Binding design goal: `docs/avatar-vision.md`. Decision register (D-001…D-041) + risks/debt:
`docs/project-state.md`. Locked specs: `docs/adr/`. Master wiring plan: `docs/167a-master-asset-raster-wiring-plan.md`._
_This file is the **map**; it does not restate the decision register or the ADRs — it points to them._
_Accessibility (read-aloud / TTS) is a separate platform-track feature, not avatar-domain — see
[ROADMAP.md](./ROADMAP.md) and [157o-read-aloud.md](./157o-read-aloud.md)._
_Last reviewed: 2026-07-03._

---

## 1. Northstar philosophy

The avatar is the project's identity and retention engine (see
[PROJECT_VISION.md](./PROJECT_VISION.md) → "Role of the Northstar avatar"). The binding visual goal,
locked in `docs/avatar-vision.md`, is the **"C2 Base Avatar Premium"** reference: a warm,
anime-inspired Danish kid (~4 heads, head-dominant), with **large expressive eyes** (the single
most important trait — legible at 32px, "big and alive" at 48px) and a **premium, polished, modern
mobile-game finish**. Non-negotiables: large eyes (not small/generic), one coherent shading
language across base + cosmetics, never-negative expression, immediate recognisability as the
reference character.

**Core architectural principle (D-011b):** _identity/architecture is reusable; art is replaceable._
The slot system, identity model, equipped slots, z-model and the `AVATAR_V2` flag are durable; the
art layer behind them can be upgraded without a rewrite.

## 2. Current state (the honest picture)

- **`AVATAR_V2 = true` is LIVE in production** (`js/avatar-layers.js:230`, commit `52f8365`,
  2026-06-25). The C2 render path is the default for users.
- **But the art is a placeholder.** The live render loads **flat hand-authored SVGs**
  (`*-c2.svg`), **not** the approved Northstar Master raster. The avatar therefore still reads as
  procedural/placeholder. The C2 _pipeline_ is correct and reusable; only the **visual source
  assets** are wrong, and the Master raster layer was never produced or wired.
- **Why:** SVG-only was **rejected** as the final art strategy (D-011) — flat SVG cannot deliver
  the large expressive eyes + premium anime finish. The chosen direction is **Hybrid Raster**
  (D-011b): paint the Northstar character as WebP layers inside the existing format-agnostic
  pipeline, reusing DB/identity/slots/z-model/`AVATAR_V2`.
- **The gap is art production + wiring, not architecture.** Plan of record:
  `docs/167a-master-asset-raster-wiring-plan.md`.
- **✅ Gate 2 (neutral base layer) is CLOSED (2026-07-14, D-056)** — the base-layer recovery that had been
  open since D-043 is finished. Owner-approved candidate: `d042-outfit-candidate-d053-arm-residue.png`
  (sha `2CB93EE0…`); final 164B.3 = **PASS with an owner-accepted inherited §7 alpha/matte exception**
  (a ~1 px white-matte fringe remains, accepted as D-042/D-043 technical debt — **accepted, not fixed**).
  **This changes nothing at runtime:** the candidate is still **gitignored, not promoted**; `assets/avatar-r2`
  and `R2_MANIFEST` are untouched; **`AVATAR_R2` stays `false`**; **Gate 3 stays PAUSED**. Gates 3 and 5
  remain open. See `project-state.md` **D-047 … D-056**.

> The 2026-06-15 "C2 NOT active" line in `docs/project-state.md` was **corrected in Section 157AB**
> (annotated superseded in place). Trust this file for activation state; trust `project-state.md`
> for the decision register and risk/debt log.

## 3. Identity model

A user's avatar identity is defined by:
- **body_type** · **skin_tone** · **hairstyle** · **hair_color** — the durable identity dimensions.
- **equipped_slots** — the map of equipped cosmetic items per slot.

Skin tones medium + dark are shipped; expression overlays are **skin-tone-agnostic** (the base body
owns skin — D-016/D-022), so face/eyes/hair are one shared set across tones. (Agent memory:
`project_skin_tone_152e`.)

> **MVP identity tradeoff (D-040, R-9):** for the MVP the Tier-0 base is **one fixed avatar**
> (`Northstar Master.png`) + accessories; **per-user skin tone / hairstyle / hair-color variation
> is deferred** to the neutral-base upgrade. The identity _architecture_ stays intact and additive.

## 4. Layering & z-model

The render is an ordered stack of full-canvas layers (each produced at full dimensions with
transparent padding — D-027 — so composition is a pure z-overlay). Target raster stack (163F,
locked by D-030):

| z | Layer | Per skin tone | Notes |
|---|---|---|---|
| 0–2 | Base body (skin + neutral underlayer + head, **no face**) | yes | owns skin |
| 3 | Face / Expression (brows, nose, mouth, multiply blush; **no skin, no eyes**) | shared | drives expression engine |
| 4 | **Eyes** (`iris` tintable + `fixed` highlight) | shared | signature feature; separate layer (D-012) |
| 5 | Blink (eyelid, shows skin) | yes | blink engine |
| 40 | Hair (neutral luminance map + multiply tint) | shared | `hair-northstar-v1`; 8 hair colors as tokens |
| `C2_LAYER_Z` | Cosmetics (equipped slots) | n/a | parity-first |

**z-model authority:** `C2_LAYER_Z` (+ `C2_BASE_Z=0`, `C2_HAIR_Z=40`) is the **canonical** slot/z
model for all scalable shop overlays (D-035). Legacy `SLOT_Z`/`SLOTS` is **frozen/deprecated** —
retained only for the legacy render path until the AVATAR_V2 cutover, never extended.

**Eyes are a first-class separate layer** (D-012, ADR-163B): the iris is tint-controlled (eye color
= a free token), the layer supports future eye cosmetics / rarity / glasses / masks / blink /
emotion. Baking eyes into the face would force an expression × color × variant asset explosion.

## 5. Rendering

- **Entry point:** `js/avatar-render-c2.js` → `mountC2Avatar`, gated by `isAvatarV2()`
  (`js/avatar-layers.js`). Wired into `avatar.html`, `hub.html`, `index.html`/`app.js`, `shop.html`
  — all surfaces call the same render module.
- **Living engines** (the "personality system", agent memory `project_personality_system`):
  - **Expression engine** (`js/avatar-expression-engine.js`) — positive-only expression set (D-024).
  - **Presence engine** (`js/avatar-presence-engine.js`, `avatar-facial-presence.js`) — breathing/idle life.
  - **Blink engine** (`js/avatar-blink-engine.js`) — z5 eyelid.
  These run on the C2 default render path (live since 2026-06-25).
- **Determinism for tests:** avatar goldens use `toHaveScreenshot({ animations: "disabled" })`;
  CSS transitions are guarded with `prefers-reduced-motion` (agent memory
  `feedback_golden_screenshot_determinism`). Goldens live in `tests/c2-golden/`.
- **Auth-gated reveal:** avatar surfaces use `style.display = "block"` (not `""`) to reveal body
  from a CSS `display:none` (agent memory `feedback_body_display_reveal`).

## 6. Asset pipeline

**Tier model (D-040 production model — `docs/164d-shop-pipeline.md`):**
- **Tier-0 (base/datum):** `assets/avatar/reference/Northstar Master.png` (1024×1536, frozen) is the
  **sole geometric source of truth** (D-032). MVP uses it as the fixed default base.
- **Tier-1 (rig — Phase-2):** decompose Master into the neutral layer stack
  (base / face / eyes / blink / hair) by **AI-assisted masked decomposition** (D-042, 2026-07-02) —
  masked inpainting/outpainting **on the frozen Master only**, preserving the signed-off identity.
  **Full AI regeneration/redesign is forbidden** (four *unmasked* regenerations drifted
  proportions/identity — the D-033 concern; mitigated by masking + the 164B.3 gate). Amends the
  earlier *manual-paint-over-only* rule (D-033/D-039) — no human painter is available. Gated by the
  164B.3 base-coherence review.
- **Tier-2 (cosmetic items):** scalable shop overlays. **AI is permitted for item overlays only**
  (D-034), never for geometry; every item is a full-canvas transparent overlay bound to a
  slot + slot-mask + z, and must pass the slot-mask + automated QA gates (D-037).

**Edge Function pipeline** (`supabase/functions/`, privileged): `avatar-asset-onboarding` →
`avatar-asset-validator` → `avatar-ingestion` → `avatar-generation`. Job safety uses atomic
claim/recover RPCs (`claim_generation_job`, `recover_stuck_job_atomic`, `set_generated_files_atomic`)
and a stuck-job sweeper. Storage helpers throw on empty/error (no silent failure).

**Anchor / mask extraction (next code step, 164L / D-041):** a deterministic **non-AI**
image-processing step derives anchors + the 5 MVP accessory-slot QA/build masks directly from
Master. Outputs are **QA/build artifacts only** (gitignored under `tools/avatar/build/`), never
runtime assets, never used to alter geometry.

**Phase-2 cut-guide tooling (P2-0, shipped 2026-07-01):** `tools/avatar/extract-phase2-cut-guides.mjs`
(same deterministic, non-AI, read-only-Master pattern) draws the anchor regions + eye
opening/iris/pupil centres over Master and crops each Phase-2 layer zone, into the gitignored
`tools/avatar/build/phase2/`, as guides/masks for the **AI-assisted masked decomposition** (D-042) of the Tier-1 rig layers.
**Review artifacts only** — no runtime asset, no `assets/avatar-r2/` write, no `R2_MANIFEST` change,
`AVATAR_R2` untouched. Spec: [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) §11.

## 7. Storage

Avatar assets and pipeline artifacts live in **Supabase Storage buckets** (read/written by the Edge
pipeline). Asset formats and caching are locked by ADR-163D:
- **WebP** served at **512×768** (integer ÷2 from the 1024×1536 master → anchor-stable); transparent
  background (no white halo); PNG only as a capability fallback.
- **Immutable, versioned assets + manifest** (D-018): never mutate a shipped asset; a new version is
  a new `-v{n}` filename; the manifest publishes atomically; long-lived cache.
- **Hybrid loading** (D-017): eager-preload the user's own avatar; lazy-load shop catalog + others.
- Target runtime folders: `assets/avatar-r2/{slot}/` (new, for the raster wiring — not yet created).

## 8. Cloudinary strategy (audited, not implemented)

Per Section 157A: Cloudinary is an **optional delivery/optimisation (CDN + transform) layer**, not a
replacement for Supabase Storage — **Storage remains the source of truth**. Two possible boundaries:
**signed uploads via an Edge Function** (API secret in `Deno.env`) or a **frontend unsigned upload
preset** for delivery/optimisation only. Decision deferred to Sections 157F/157G
([ROADMAP.md](./ROADMAP.md)). No secret may live in frontend JS.

## 9. Future cosmetics & animation roadmap

- **Cosmetics:** MVP purchasable categories are accessory-first — `aura`, `back`, `headwear`,
  `face` (masks), `eyes` (glasses) (D-036). `torso` is conditional; `body`/`shoes`/`bottom`/`hands`/
  `front_fx` are deferred (occlusion/registration risk). `hair` is **identity, not a purchasable
  slot**. Reserved C2 z-values exist for deferred slots (8/15/25/100, D-035) — activation deferred.
- **Animation:** living expression/presence/blink engines are already live on the placeholder.
  Phase-1 of the Master wiring (D-040 "Master-as-is") temporarily makes face/eyes/blink **static**
  (baked base) while keeping breathing; Phase-2 (163F decomposition) **restores the living engines**
  on the Master art. This sequencing (look-fix first, living-system second) is the 167A recommendation.
  - **Phase-2 status (updated 2026-07-02): PLANNED, not started.** Audit + implementation plan
    ([167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md)) + asset brief
    ([167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md)) are written; the P2-0 cut-guide tool
    (§6) is shipped (review artifacts only). **Gate 1** (Phase-2-scoped anchor/eye-box sign-off) is
    **SATISFIED** — owner-countersigned APPROVED 2026-07-01
    ([167a-phase2-cut-guides-review-worksheet.md](./167a-phase2-cut-guides-review-worksheet.md));
    approval is **raster-path only** (legacy C2 anchors `cx68/92 cy47` stay frozen). The **human-art
    handoff** for gates 2–3 is written
    ([167a-phase2-artist-handoff.md](./167a-phase2-artist-handoff.md)). **Gate 4 (WebP encoder) is
    also SATISFIED (2026-07-02):** vendored libwebp `cwebp.exe` + `encode-webp.mjs`/`fetch-cwebp.mjs`
    (build tooling, gitignored binary, zero deps). Gates 2, 3, 5 remain open.
  - **Base RECOVERY (updated 2026-07-05, D-043):** an interim iter7 base briefly held a Gate-2 CONDITIONAL
    PASS but was **visually INVALIDATED** (structural **bust/chest-plate** artifact); that pass is
    **withdrawn** and the iter4→iter7 line is invalidated. **Gate 2 is REOPENED / under recovery** with a
    **candidate registered base-layer source** (REVISED 2026-07-06; **not a new Master** — the frozen
    `Northstar Master.png` remains the canonical identity/style/coordinate datum, **D-032 preserved, not
    superseded**) — `recovery-base-v1-blankface.png` (`assets/avatar/reference/`), which fixes the anatomy
    (bald scalp, ears, head→neck→collar, no bust-plate, blank face) and registers to the Master by a
    deterministic **(+25 x, +285 y)** translation (body IoU ≈ 0.9921; ≈ 84.3 % pixels identical) but is
    **not passed** (needs (+25,+285) registration + feet-completion + outfit neutralization + a fresh
    164B.3). **Gate 3 is PAUSED**; the hair/eyes/face **tooling** stays useful but its outputs are **not
    approved layers** against the corrected base-layer path. Phase-2 runtime code may pass gates 1 + 4 only; **`AVATAR_R2` stays `false`**;
    nothing promoted. Decision: [167a-phase2-base-recovery-decision.md](./167a-phase2-base-recovery-decision.md);
    register: `project-state.md` (D-043). **Next step = Gate 2A DEFINED / PLANNED (2026-07-06):** narrow
    deterministic registration (translate **(−25, −285)** into the Master frame) + feet-completion audit +
    review-only composites + validation report; **excludes** outfit/face/eyes/eyelid/hair/runtime/promotion;
    **does NOT satisfy Gate 2 by itself.** Plan:
    [167a-phase2-gate2a-registration-plan.md](./167a-phase2-gate2a-registration-plan.md).
    **Progression (2026-07-07):** Gate 2A **EXECUTED = PASS / owner-review-ready**; feet-completion
    **DEFERRED** into neutral-outfit/base-assembly; **neutral-outfit/base-assembly PLAN recorded** (strategy
    B: Master body/feet + recovery head + one masked neutralization pass; short-sleeve tee ⇒ underarm
    reconstruction, highest-risk sub-area). Plan:
    [167a-phase2-neutral-outfit-base-assembly-plan.md](./167a-phase2-neutral-outfit-base-assembly-plan.md).
    **✅ GATE 2 CLOSED (2026-07-14, D-056).** The neutral base-layer recovery is **complete**. The
    owner-approved Gate-2 candidate is **`d042-outfit-candidate-d053-arm-residue.png`** (sha `2CB93EE0…`),
    lineage **D-043 base assembly → D-048 donor lift → D-049 protect-mask-v2.1 → D-050 donor silhouette →
    D-052 collar cleanup → D-053 arm/torso residue cleanup**. **Final 164B.3 verdict: PASS WITH
    OWNER-ACCEPTED INHERITED §7 ALPHA/MATTE EXCEPTION** — §2 PASS (shoulders +0.8 %; hand centroids on the
    Master's; arms match within 1–2 px below y854; owner-confirmed drape-excluded silhouette IoU **0.9594**),
    §3 PASS, **§4 PASS (forearm ΔRGB vs the frozen hands 68 → 1, no seam — the section that had blocked since
    D-045)**, §5 PASS (0 px garment residue, no legible signature elements), §6 PASS. **§7 is an accepted
    exception, NOT a fix:** a **global ~1 px white-antialias/matte fringe (2,011 px)** remains — inherited from
    the D-042/D-043 pipeline (2,461 px pre-lift; the donor process *reduced* it), with **1,557 px inside
    protect**, so clearing it would break protect-diff = 0. It is **accepted as technical debt** and may only
    be revisited via a separate owner-approved alpha/protect decision. **Closing Gate 2 is NOT promotion:** the
    candidate stays in the **gitignored review area**; **no `assets/avatar-r2` write, no `R2_MANIFEST` change,
    `AVATAR_R2` stays `false`, Gate 3 stays PAUSED** until an explicit owner command starts it. Register:
    `project-state.md` (**D-047 … D-056**).

## 10. Performance considerations

Mobile-first budget (D-019): **first-paint < 100 ms**, full composite < 250 ms, **total avatar
< ~350 KB**, decoded memory < ~15 MB. Per-cosmetic-item budget ≤ ~50 KB within the stack (D-037).
Eyes must stay **legible at 32px** through all overlays (a hard gate on every headwear/face/eyes
item). Tint is done via canvas multiply (hair luminance map; iris-base tint) rather than per-color
asset explosion.

## 11. Source of truth (avatar domain)

| Topic | Authoritative source |
|---|---|
| Design goal / visual target | `docs/avatar-vision.md` |
| Decision register D-001…D-041, risks, debt, open questions | `docs/project-state.md` |
| Eye system | `docs/adr/ADR-163B-eye-system.md` |
| Hybrid raster pipeline | `docs/adr/ADR-163D-hybrid-raster-pipeline.md` |
| Raster asset spec / decomposition / MVP scope | `docs/adr/ADR-163F-raster-asset-spec.md` |
| Shop / slot / item pipeline | `docs/164d-shop-pipeline.md` |
| Master raster production + wiring plan | `docs/167a-master-asset-raster-wiring-plan.md` |
| Activation plan | `docs/166a-avatar-v2-activation-plan.md` |
| Render contract (code) | `js/avatar-render-c2.js`, `js/avatar-layers.js` |
| Current activation state | **this file** (§2) — supersedes the stale `project-state.md` status line |

> When these conflict on **art geometry**, `Northstar Master.png` always wins (D-032). When they
> conflict on **activation state**, this file (§2) + the live `AVATAR_V2` value in code win.
