# Project State — Den Seje App (Avatar / C2)

_Authoritative project-state snapshot. Update at the end of each major section._
_Last updated: 2026-06-15_
_Status sections corrected 2026-06-30 (Section 157AB): `AVATAR_V2` is now **active** in
production — the 2026-06-15 "C2 not active / flag OFF" statements below are annotated as
**superseded**, not deleted. The **decision register (D-001…D-041), timestamps, risks, debt and
open questions remain historically unchanged.** Canonical current avatar/activation state lives in
[`AVATAR_SYSTEM.md`](./AVATAR_SYSTEM.md); cross-track status in [`ROADMAP.md`](./ROADMAP.md)._
_Platform / Services track completion added 2026-07-01 (Section 157S) — see the section immediately below._

---

## Platform / Services Track (157x) — COMPLETE (zero-cost, default-off)

_Added 2026-07-01. This is the newer **Platform / Services track** (parallel to the Avatar/C2 track
below). Full detail in [`ROADMAP.md`](./ROADMAP.md); ops/privacy specifics in
[`OBSERVABILITY.md`](./OBSERVABILITY.md) and [`157q-consent-gdpr.md`](./157q-consent-gdpr.md)._

**Status: every buildable zero-cost service is DONE — all default-off, fail-soft, PII-safe,
unit-tested. Nothing is activated; production behaviour is unchanged.**

Completed sections (from the 157A audit):
- **Docs foundation:** 157A (audit) · 157AA (PROJECT_VISION/ARCHITECTURE/ROADMAP/AI_GUIDELINES/AVATAR_SYSTEM/CLAUDE_WORKFLOW) · 157AB (consolidation).
- **Observability:** 157B (Sentry frontend) · 157C (Edge `_shared/monitoring.ts`) · 157CA (activation plan + static validation) — **default-off**.
- **Cloudinary:** 157F (decision: fetch-mode, no secret) · 157G (`js/cloudinary.js`, raster-only, inert until 167A) — **default-off**.
- **OCR:** 157H (spec) · 157I (`js/ocr/` browser-only document-recognition service, no image upload) — **default-off**.
- **AI:** 157K (`_shared/ai/` abstraction + advisory `grade-answer`; not wired to the reward path) — **default-off**.
- **Analytics:** 157D (`js/analytics.js` + GDPR consent gate) · 157E (core events + consent banner) — **default-off**.
- **Read-aloud (TTS):** 157N (decision) · 157O (`js/read-aloud/` Piper-clip + on-device Web Speech; clips = offline deliverable) — **default-off**.
- **Cross-cutting:** 157Q (consolidated consent SoT `js/consent.js` + canonical privacy map) · 157R (flag hardening `js/flags.js` + rollback runbook) · 157S (21 default-off/fail-soft unit tests via built-in `node --test` + `deno test`, no new framework).

New feature flags (all **default-off** except where noted; see [`157r-feature-flags.md`](./157r-feature-flags.md)):
- Frontend: `ENABLE_SENTRY`, `ENABLE_OCR`, `ENABLE_CLOUDINARY`, `ENABLE_ANALYTICS`, `ENABLE_READ_ALOUD` — plus the consent SoT (`js/consent.js`).
- Edge (env): `ENABLE_SENTRY_EDGE`, `ENABLE_AI_GRADING`.
- Diagnostics: `window.__flags()` reports live state (all services off; `AVATAR_V2` on).

**Gates on remaining services work (not buildable now):**
- **157CB — dedicated staging environment** (Supabase branch + Vercel preview) is the prerequisite
  for **activating/validating** any external service (Sentry/PostHog/AI). Policy: no external service
  is activated or validated against production. Free interim = local Supabase stack + Vercel preview.
- **Deferred/future infra:** 157L/157M (AI grade wired into `process-event` + teacher UI), 157P
  (Whisper STT), 157T (production-readiness). Piper audio clips + the 167A avatar art are **offline
  deliverables**.

---

## Current Production State
- **Supabase:** project `den-seje-app` (ref `tjzbehwfagiwpwodsgwg`), region eu-west-1, plan **Pro**.
- **Data:** 31 profiles; 5 with equipped cosmetics; 2 with an explicit legacy hairstyle.
- **Frontend:** Vercel (`den-seje-app-frontend.vercel.app`), auto-deploys from GitHub `main`.
- **Avatar shown to users (as of 2026-06-15):** **LEGACY** render. C2 built but not active.
  > **STATUS UPDATE — 2026-06-30 (Section 157AB): SUPERSEDED.** `AVATAR_V2 = true` is now **live in
  > production** (commit `52f8365`, 2026-06-25). The **C2 render path is the default** for users.
  > However it still renders **flat placeholder SVGs**, **not** the Northstar Master raster — Master
  > asset production + wiring remain **future work** (`docs/167a-master-asset-raster-wiring-plan.md`).
  > Canonical: [`AVATAR_SYSTEM.md`](./AVATAR_SYSTEM.md) §2.

## Current Commit
- `origin/main` = **`4029594`** ("docs: eye system ADR + hybrid raster pipeline ADR (D-012..D-019)").
- Frontend clone and ROOT clone both at `4029594` (in sync).
- One GitHub repo: `Moeller888/den-seje-app-frontend`. The ROOT clone embeds the
  frontend as a vestigial gitlink that is **not** on the Vercel deploy path.

## Feature Flags
- **`AVATAR_V2` (as of 2026-06-15): `false` (OFF)** — `js/avatar-layers.js:230`.
  > **STATUS UPDATE — 2026-06-30 (Section 157AB): SUPERSEDED.** `AVATAR_V2` is now **`true` (ON)**
  > (`js/avatar-layers.js:230`; live since commit `52f8365`, 2026-06-25). `isAvatarV2()` returns
  > `true` from the constant, else honours the `localStorage.avatar_v2='1'` override.
- Per-browser test override: `localStorage.avatar_v2='1'`.
- **No cohort / percentage rollout mechanism exists.** (Still true — open question OQ-4.)

## Current Avatar System
- **Legacy (LIVE):** `body.svg` + hair + equipped cosmetics; pseudo-3D/gradient style.
- **C2 (BUILT, flag-gated, INACTIVE):** flat blank-canvas base (medium/dark) +
  identity hair (7) + hair-color tokens (8, inline) + cosmetics parity + z-model.
  Single shared render module `js/avatar-render-c2.js` (`mountC2Avatar`), wired into
  avatar.html, hub.html, app.js, shop.html — all gated by `isAvatarV2()`.

## C2 Status
> **STATUS UPDATE — 2026-06-30 (Section 157AB): C2 IS NOW ACTIVATED.** `AVATAR_V2 = true` shipped to
> production on 2026-06-25 (commit `52f8365`). The bullet below described the **pre-activation**
> (2026-06-15) state and is retained for history. Current state: C2 render is **live and default**,
> but on **flat placeholder SVGs** — the Northstar Master raster is unbuilt/unwired (future work,
> `docs/167a-master-asset-raster-wiring-plan.md`). Canonical: [`AVATAR_SYSTEM.md`](./AVATAR_SYSTEM.md) §2.
- **C2 is technically implemented but NOT activated** (`AVATAR_V2 = OFF`). _(historical — 2026-06-15)_
- Sections 155B–160 complete. DB migrations 155E (hair_color) + 155F (hairstyle
  alignment) applied to production. Render pipeline + cosmetics parity committed
  and pushed. Goldens in `tests/c2-golden/`.
- Activation status: **YELLOW** — ready for internal test; not for full activation.
- **Known gap:** the implemented flat-SVG C2 base does NOT match the chosen design
  reference on its defining traits (eye size, art finish) — see `avatar-vision.md`.

## Art Direction Decision (NEW)
- **SVG-only is REJECTED as the final art strategy.** Flat SVG cannot deliver the
  desired avatar art quality (large expressive eyes + premium anime-inspired finish).
- **Direction:** **Hybrid Raster** — produce the North Star character as WebP layers
  in the existing format-agnostic pipeline; reuse DB / identity / slot / z-model /
  AVATAR_V2 (Section 163A). North Star Avatar v1.0 is the permanent visual target.
- **Pipeline LOCKED (ADR-163D / D-013…D-019):** WebP assets · hair color = hybrid
  luminance-map tint · eye color = iris-base tint (fixed highlight) · skin tone =
  separate base assets · hybrid loading · immutable versioned cache · mobile perf
  budget. Architecture (DB/identity/slots/z-model/AVATAR_V2) unchanged.

## Avatar Layer Model (Hybrid Raster — current)
Ordered render layers (reuse the existing z-model):
1. **Base body** (skin + neutral underlayer + head, NO face) — per skin tone — z 0–2
2. **Face/Expression** (brows, nose, mouth, multiply blush — NO eyes, NO skin) — z 3
3. **Eyes** (separate, tintable iris + fixed highlight — see D-012) — **z 4 (D-030)**
4. **Blink** (eyelid, engine) — z 5
5. **Hair** (luminance map + tint; `hair-northstar-v1`, D-031) — z 40
6. **Cosmetics** (equipped_slots at C2_LAYER_Z)

> This model **supersedes Section 163A's "eyes embedded in Face/Expression"** —
> eyes are now their own layer (D-012 / ADR-163B). Render stack locked by D-030;
> full decomposition spec in `docs/adr/ADR-163F-raster-asset-spec.md`.
>
> **MVP base (D-040):** the layer model above is the **full raster target**, but for MVP
> the **Tier-0 base is `Northstar Master.png` as-is** (fixed default avatar) + accessory
> overlays only. The decomposed neutral base + per-skin-tone/face/eyes/hair layers are a
> **deferred upgrade**, not an MVP blocker.

## Major Decisions (register)
| ID | Decision |
|---|---|
| D-001 | Avatar direction = **C2 Base Avatar Premium** (human chibi/anime kid), chosen in a bake-off over creature/axolotl, chibi study-hero, geometric mascot, legacy redesign. |
| D-002 | Hair = identity; Hair Color = identity; Companion = not MVP; Badge = not MVP. |
| D-003 | Hair Color = inline SVG + CSS tokens (`--hair-base` / `--hair-shadow`). |
| D-004 | Asset spec: viewBox `0 0 160 240`; LOCKED anchors head `cx80 cy50 r30`, eyes `cx68/92 cy47`; flat (R1–R5, no gradients). |
| D-005 | C2 base reuses the legacy anchors (preserve blink/expression) → C2 shipped as a same-proportion restyle. |
| D-006 | Free staging not recommended (migration drift); use Supabase Branching (Pro) or direct prod apply. |
| D-007 | Direct prod apply of 155E/155F (assessed SAFE, executed, verified). |
| D-008 | Z-model reform (159B): deterministic `C2_LAYER_Z`; expr z=3, blink z=5, hair z=40. |
| D-009 | Cosmetics parity-first (render legacy assets in C2); flat redesign progressive. |
| D-010 | 159D: static neutral expression in C2 shop preview (face parity). |
| **D-011** | **SVG-only rejected as final art direction; move to hybrid/raster pipeline.** |
| D-011b | Hybrid Raster architecture: North Star as WebP layers in the existing pipeline; reuse DB/identity/slots/z-model/AVATAR_V2 (163A). North Star v1.0 = permanent visual target. |
| **D-012** | **Eye system = a SEPARATE, tintable, cosmetic-capable layer** (ADR-163B, Option C). Iris is tint-controlled (eye color = token, free); the eye layer supports future eye cosmetics, eye rarity, magic/rare eyes, glasses, masks, blink and the emotion system. **Supersedes 163A's "eyes embedded in Face/Expression".** Rationale: multiple eye colors + eye cosmetics + rarity would otherwise force a combinatorial asset explosion (expression × color × variant) and a future rewrite; a separate tintable layer is the robust, future-proof choice. |
| D-013 | Asset format = **WebP** (PNG fallback only if needed). Canonical 2:3 raster master 1024×1536 → served WebP 512×768; anchors mapped proportionally from the 160×240 geometry. (ADR-163D) |
| D-014 | Hair color = **hybrid**: canvas multiply-tint of a neutral luminance map (8 colors free as tokens) + hand-painted variant override for problem colors. (ADR-163D) |
| D-015 | Eye color = **tint the iris-base only**; sclera/pupil/glossy highlight stay fixed; rare/magic eyes = iris-swap or eye-effect overlay in the eye slot. (ADR-163D) |
| D-016 | Skin tone = **separate base assets** per `body_type × skin_tone` (cel-shaded skin is not reliably runtime-tintable; body owns skin). (ADR-163D) |
| D-017 | Asset loading = **hybrid**: eager preload of the user's own avatar; lazy-load shop catalog + other avatars. (ADR-163D) |
| D-018 | Cache = **immutable, versioned assets + manifest**; invalidation via filename version (never mutate a shipped asset). (ADR-163D) |
| D-019 | **Mobile-first performance budget**: first-paint < 100ms, full composite < 250ms, total avatar < ~350KB, decoded memory < ~15MB. (ADR-163D) |
| D-020 | **MVP = one Neutral North Star character**; body-type system preserved architecturally (additive later, no rewrite). (ADR-163F) |
| D-021 | **Eye granularity = 2 files**: `iris` (tintable) + `fixed` (sclera/lash/shape + fixed highlight). MVP scope; cosmetic/rarity capability (D-012) preserved. (ADR-163F) |
| D-022 | **Face/Expression layer = tone-agnostic**: no opaque skin shading (base owns skin), blush = `multiply`, carries brows/nose/mouth; one face set shared across skin tones. (ADR-163F) |
| D-023 | **Blink = WebP eyelid assets per skin tone** (eyelid shows skin → skin-bearing layer). (ADR-163F) |
| D-024 | **Expression MVP = positive only**: neutral, happy, curious, focused, determined, surprised, proud (7). `sad`/`angry` excluded — permanent **never-negative policy** (resolves OQ-6). (ADR-163F) |
| D-025 | **Hair compression ignored in MVP**; contract hook reserved: `hair_state = full \| compressed` (MVP produces `full`). (ADR-163F) |
| D-026 | **Cosmetic recolor = hybrid**: MVP = baked assets; tint = future opt-in (no cosmetic tint pipeline in MVP). (ADR-163F) |
| D-027 | **Asset canvas = full canvas, all layers**, transparent padding; no cropped/trimmed per-layer assets (one shared coordinate space). (ADR-163F) |
| D-028 | **North Star Master v1.0 = `medium` skin-tone token** (internal token, not a subjective colour reading; no new tone tokens / no rename now). (ADR-163F, 164A) |
| D-029 | **Neutral body-underlayer = a derived production asset** cut from the master; the master's sweater/jeans/sneakers are reference art (future cosmetic set), never baked into `base`. (ADR-163F, 164A) |
| D-030 | **Eye layer z-index = 4**; render stack locked: base z0–2 · face z3 · **eyes z4** · blink z5 · hair z40 · cosmetics `C2_LAYER_Z`. Fills the eyes gap left by D-008. (ADR-163F, 164A) |
| D-031 | **North Star hairstyle token = `hair-northstar-v1`** (one approved hairstyle; produced as a neutral luminance map, brown = default tint). (ADR-163F, 164A) |
| **D-032** | **North Star source-of-truth split (164B-prep).** `assets/avatar/reference/Northstar Master.png` is the **SOLE authoritative geometric source** for 164B decomposition — proportions, head/body ratio, pose, hair silhouette, face, eyes, rendering style and character identity all derive from it. `Northstar Master - reference.png` is **downgraded to an outfit-style reference ONLY** (neutral clothing direction: plain t-shirt / plain trousers / plain sneakers). It **MUST NOT** be used as a source of truth for proportions, body height, hair shape, eye size, facial structure or pose. **On any conflict between the two images, `Northstar Master.png` always wins.** Rationale: four regeneration attempts of the companion all drifted taller/leaner with an altered hair silhouette — proportions cannot be locked via regeneration, so geometry is taken directly from the frozen Master. (164B-prep, 2026-06-15) |
| **D-033** | **Base production method = manual paint-over, NOT AI (164C — Base Production Method Pivot).** AI generation/inpainting **cannot reliably** produce `body-neutral-medium-v1`: it repeatedly introduces **proportion + identity drift** (confirmed across four companion regenerations **and** an explicit edit/inpaint-mode attempt — all drifted taller/leaner with altered hair and face, D-032). **Decision:** AI-generated / AI-inpainted images **MUST NOT** be used as production base assets; they may be used **only as visual outfit references**. `body-neutral-medium-v1` must be produced from a **manually controlled layered source / manual paint-over over `Northstar Master.png`** (Master = geometry, D-032), validated by the 164B.3 base-coherence gate. Sharpens R-6; refines the *method* of D-029 (the base is reconstructed by hand, never AI-derived). **Scope (see D-034):** D-033 applies to **geometry-defining rig layers only** — it does NOT ban AI for shop/cosmetic overlays. (164C, 2026-06-15) **[AMENDED by D-042 (2026-07-02): the human-paint-over-only requirement is impractical (no painter available). AI-assisted MASKED decomposition on the frozen Master is now allowed for Phase-2 rig layers; full AI regeneration/redesign remains forbidden; identity-lock preserved via masking + the 164B.3 gate.]** |
| **D-034** | **Scalable item production = slot-constrained transparent overlays; AI allowed for item overlays only, never for avatar geometry (164D).** Scopes D-033 to **geometry-defining rig layers** (base, face, eyes, blink, hair, anchor template, per-slot masks — manual, AI-forbidden as producer). **Shop/cosmetic items are full-canvas transparent overlays** bound to a slot + slot-mask + z; they contain **no** avatar geometry/skin. **AI is permitted for item overlays only** and must NEVER define body/face/hair/eyes/proportions/anchors/masks; every AI item must pass the **slot-mask + automated QA gates** before entering the catalog. Reuses the existing slot model, `equipped_slots`, `shop_items`, `RARITY_COLORS` and the immutable versioned manifest (D-018) — **additive, no rewrite**. New slots (`shoes`/`bottom`/`hands`/`front_fx`) reconciled in **D-035**. Full spec: `docs/164d-shop-pipeline.md`. (164D, 2026-06-16) **[EXTENDED by D-042 (2026-07-02) for Phase-2: masked AI-assisted decomposition of rig layers on the Master is allowed; the "AI never defines geometry" rule now means never via *unmasked regeneration* — masked edits on the frozen Master that preserve identity are permitted.]** |
| **D-035** | **Canonical slot/z model for scalable shop overlays = `C2_LAYER_Z` (164E).** The C2 z-model (`C2_LAYER_Z` + `C2_BASE_Z=0` + `C2_HAIR_Z=40`, 159B/D-008) is the **canonical** slot/z model for all scalable shop/cosmetic overlays (D-034). **Legacy `SLOT_Z`/`SLOTS` is frozen/deprecated** — retained only for the live legacy render path until the AVATAR_V2 cutover, and **MUST NOT be extended** (new slots are C2-only). **Slot *names* are the shared contract** across both z-maps and the DB (`shop_items.slot_type`, `equipped_slots` keys, equip/unequip RPCs). Cosmetic **`face` = masks** (NOT the raster face/expression layer z3); cosmetic **`eyes` = glasses** (NOT the raster eyes layer z4); **blink z5 = engine/surface** (not a shop slot); **`hair` = identity/geometry** (not a purchasable slot). Proposed slots **`shoes`/`bottom`/`hands`/`front_fx` receive RESERVED C2 z-values only (8 / 15 / 25 / 100)** — **activation DEFERRED** pending: (1) product-taxonomy decision, (2) `shop_items.layer_order` semantics, (3) DB/RPC slot-validation check, (4) per-slot mask authoring, (5) AVATAR_V2 cutover plan. Locks the **model + reservations only — no code/DB/asset change** (js/avatar-layers.js untouched). Spec: `docs/164d-shop-pipeline.md`. (164E, 2026-06-16) |
| **D-036** | **Shop product taxonomy — MVP + post-MVP (164F).** **MVP purchasable categories = `aura`, `back`, `headwear`, `face` (masks only), `eyes` (glasses only)** — accessory-first (generous masks, no base-outfit occlusion). **`torso` (tops) = CONDITIONAL MVP** — activate only once the base body + `torso` mask are produced and pass QA. **`neck` = optional / low priority.** **`hair` = identity/rig only** (hairstyle + `hair_color` tokens; **not** a purchasable overlay). **DEFERRED post-MVP:** `body` (full-body costumes — high occlusion/registration risk), `shoes`, `bottom`, `hands`, `front_fx` (front-of-face/eye occlusion risk). When activated, **`bottom` + `shoes` stay SEPARATE** (mix-and-match); `hands` waits (low ROI); `front_fx` waits. **Semantics:** `face` = cosmetic masks (≠ raster face/expression layer z3); `eyes` = cosmetic glasses (≠ eye-color/rare-eyes in the eye rig layer, D-012/D-015). Resolves D-035 deferred-activation requirement (1). **Product-architecture decision only — adds no slots, no code, no DB/RPC, no assets**; curates which *existing* slots are MVP shop categories. Spec: `docs/164d-shop-pipeline.md`. (164F, 2026-06-16) |
| **D-037** | **MVP shop item QA gates & mask spec (164G).** Every shop item is a **full-canvas transparent overlay** (master **1024×1536** → served **512×768**; no crop/trim, no per-item offset math, pure z-overlay). **Automated-first gate (HARD):** transparent bg · clean alpha/no-halo · **slot-mask compliance (0 opaque px outside mask)** · **no avatar geometry/skin/face/eyes/hair** · anchor/registration · canonical **`C2_LAYER_Z`** slot · manifest completeness · per-item performance budget (≤~50 KB, within D-019 stack) · composite smoke test (eye legibility preserved). **Human review:** style conformance + **content safety** (kids platform). **MVP slot mask rules:** `aura` = generous behind-avatar; `back` = generous shoulder-anchored; `headwear` = moderate head-anchored (**eyes legible**); `face/masks` = tight face-anchored (**eyes legible**); `eyes/glasses` = tight eye-anchored (**approved eye-overlap exception**). **`torso` mask conditional** (needs base body + occlusion mask, QA-passed); **`neck` optional/low priority**. **Locks the gate framework + mask RULES only** — **exact pixel mask assets are Tier-1 work pending the produced base/rig (164B)**; **no code/tooling/mask/assets** produced. Spec: `docs/164d-shop-pipeline.md`. (164G, 2026-06-16) |
| **D-038** | **Tier-1 base rig & mask authoring plan (164H).** Locks the Tier-1 sequence required before any scalable MVP shop-item generation: **(1) base rig `body-neutral-medium-v1`** (manual paint-over from Master, D-032/D-033; PASS 164B.3 — **blocking first step**) → **(2) anchor template** (JSON + overlay: head 512,320 r192, **revised eye box**, shoulder/back, face oval, crown region) → **(3) style kit** (palette/line/cel/light/detail/forbidden-drift; ≥2–3 exemplars/slot) → **(4) MVP slot masks** (aura/back/headwear/face/eyes; **1024×1536 QA/build artifacts, NOT runtime assets**; derived from anchors per D-037) → **(5) reference composites** (≥2/slot; style + composite goldens + eye-legibility calibration set) → **(6) QA threshold config** (eye-legibility, feather, per-item weight, decoded-memory/concurrent-layer cap, mask-overflow). **`torso` mask conditional; `neck` optional.** **No AI may define the base geometry; exact mask pixels wait for the produced base; no shop-item batch starts before all six exist.** Locks **plan/formats/naming/gates/order only — no base, masks, assets, code, or tooling produced.** Spec: `docs/164h-tier1-base-rig-mask-authoring-plan.md`. (164H, 2026-06-16) **[RE-SCOPED by D-040: base rig is no longer the MVP blocking first step — Tier-0 = Master; the next blocking step is automated/semi-automated anchor + mask extraction from Master. This Tier-1 sequence governs the future neutral-base upgrade and the Master-derived masks.]** |
| **D-039** | **Base rig production execution method (164I).** **Primary = Option B — outsource `body-neutral-medium-v1` to a professional illustrator** against a locked brief (the base is the single highest-risk foundational asset and must pass 164B.3). **Fallback = Option A** (in-house manual paint-over, budget only); **Option C** (semi-automated vector/paint-over) is a **geometry scaffold only, never the final finish**. Base rig is **manually controlled, geometry-locked to `Northstar Master.png`**; **AI must not define production geometry** (D-032/D-033). **No anchor template or masks may start until the base passes 164B.3** (D-038 order). **Handoff:** layered source + flattened review PNG + served WebP candidate + change notes + optional onion-skin/overlay vs Master. **Acceptance gate: 164B.3 PASS before becoming the datum.** **NO-GO:** taller/slimmer body, altered head size, altered face/eyes/hair, pose drift, style drift, AI-looking regeneration, cropped canvas, baked background, any unreviewed geometry change. **Planning decision only — no base/image/mask/asset/code/tooling produced.** Spec: `docs/164i-base-rig-production-execution-plan.md`. (164I, 2026-06-16) **[RE-SCOPED by D-040: this illustrator method applies ONLY to the future optional neutral-base upgrade — it is no longer the MVP path or a blocker.]** **[SUPERSEDED for producer by D-042 (2026-07-02): no illustrator available; Phase-2 rig layers are produced by AI-assisted masked decomposition on the Master, not outsourced illustration.]** |
| **D-040** | **Automation-first avatar production (164J).** The avatar shop must be **automatable end-to-end — no illustrator dependency for MVP, no manual per-item avatar editing**. **`Northstar Master.png` is the Tier-0 default base avatar/datum** (already exists, approved geometry, D-032) → **`body-neutral-medium-v1` is NOT an MVP blocker**. **MVP proceeds with accessory overlays only:** `aura`, `back`, `headwear`, `face/masks`, `eyes/glasses` (D-036). The neutral reconstructed base becomes a **future optional quality upgrade**; **D-039's illustrator method is re-scoped to that upgrade only**, and **D-038 is re-scoped** (base rig no longer the blocking step — **automated/semi-automated anchor + mask extraction from Master is now the next blocking step**). **D-033 / 164B.3 still apply if/when the neutral-base upgrade is produced.** **Safety unchanged (D-034 reinforced):** AI must **never** regenerate the full avatar or define body/face/hair/eyes/proportions/anchors/masks; AI may generate **only isolated slot-constrained transparent overlays** for approved slots, each passing the slot-mask + QA gates (D-037). **Accepted tradeoff:** MVP = one fixed avatar (the Master) + accessories; **per-user skin tone / hairstyle / hair-color variation defers** with the neutral-base upgrade. Supersedes the *blocking* status of D-038 and the *primary* status of D-039; preserves D-032/D-034/D-035/D-036/D-037. Production model recorded in `docs/164d-shop-pipeline.md` (Tier-0/Tier-1/Tier-2). (164J, 2026-06-16) |
| **D-041** | **Automated anchor template + MVP mask extraction from Master (164K).** Anchors + the 5 MVP accessory-slot QA/build masks are derived **directly from `Northstar Master.png` (verified 1024×1536)** by a **deterministic, non-AI image-processing step**: silhouette via white-matte threshold; anchors (head/eye-band/shoulder/face-oval/crown) from the ×6.4 mapping **with mandatory human confirmation of the eye band + face oval**; masks per D-037 (aura generous-behind · back generous shoulder-anchored · headwear moderate head-anchored, eyes clear · face tight face-anchored · eyes tight eye-anchored). **Protected zones** (face/eyes/hair/body/hands/skin-like) feed the no-geometry/no-skin gate. **Outputs = QA/build artifacts only** (`avatar-anchor-template-v1.json` + anchor-overlay + mask PNGs), **never runtime assets, never used to alter geometry**; **Master unchanged; no AI defines geometry/anchors/masks** (D-034); **no shop items generated**. **Acceptance before any item batch:** dimensions validated, anchors + mask previews human-approved, mask-overflow checks defined, D-037 compatibility confirmed, no runtime/AVATAR_V2 change. Locks **method/schema/artifacts/gates only — no tooling/masks/assets produced**. Next = **164L** (the non-AI extraction tooling). Spec: `docs/164k-anchor-mask-extraction-plan.md`. (164K, 2026-06-16) |
| **D-042** | **Phase-2 art policy AMENDED — AI-assisted MASKED decomposition allowed (2026-07-02).** The project owner has **no human painter/illustrator**, so the *human-paint-over-only* requirement of **D-033** (and the illustrator method of **D-039**) is **impractical** and is **amended for Phase-2 art production**. **Allowed:** AI-assisted **masked inpainting/outpainting ON the approved `Northstar Master.png` only** — lifting baked features to build the decomposed layers (v2 base, face, eyes, eyelid, hair) and reconstructing the skin/clothing they hid, **provided the output preserves the signed-off Master identity**. **Still FORBIDDEN:** full AI regeneration, redesign, "make a new avatar," and **any unmasked/broad prompt** that lets the model reinterpret the avatar; **no change** to head size, eye shape, hair silhouette, pose, outfit style, skin tone, line art, lighting, palette or proportions (D-032); any result that no longer matches the signed-off Master. **Identity-lock is preserved via masking + the 164B.3 base-coherence gate (unchanged)** — the D-033/R-6 concern (AI *regeneration* drifts identity) is mitigated by constraining AI to *masked edits on the frozen Master*, not free generation. **Gates unchanged:** gate 2 (v2 base) open until the AI-assisted base passes 164B.3; gate 3 (face/eyes/eyelid/hair) open until those pass review; gate 5 (composed visual sign-off) open; gates 1 + 4 satisfied. **No runtime/manifest/`AVATAR_R2` change; Phase-2 implementation NOT started.** Amends D-033 (method) + D-039 (producer); preserves D-032/D-034/D-040. (2026-07-02) |

## Completed Sections
155A–155I · 156A–156C · [prod-apply 155E/155F] · 157 · 158A–158C · [ROOT sync] ·
159A–159G · [ROOT sync] · 160 · 161A · 161B · 161B.5 (docs baseline committed) ·
161C–161E · 162A–162B (North Star spec + prompt package) ·
163A (Hybrid Raster arch) · 163B (Eye System ADR) · 163C (eye docs) · 163D (pipeline ADR) ·
163F (decomposition & raster asset spec) · 163G (MVP scope decisions D-020…D-027) ·
163H (raster asset spec documentation: ADR-163F + state/vision update + consistency check) ·
164A (North Star Master v1.0 decomposition spec — **COMPLETE**; decomposition locks D-028…D-031) ·
164B-prep (D-032 source-of-truth split + reference assets) · 164B.1 (asset production plan) ·
164B.2 (base reconstruction spec) · 164B.3 (base review gate + worksheet) · 164B.4 (base prototype input brief) ·
164C (Base Production Method Pivot — **D-033**: manual paint-over base, AI rejected) ·
164D (Scalable Shop Item Pipeline & Slot Template Architecture — **D-034**: slot-constrained
overlays, AI for items only; spec `docs/164d-shop-pipeline.md`) ·
164E (Slot/Z reconciliation — **D-035**: `C2_LAYER_Z` canonical, legacy `SLOT_Z` frozen;
new-slot z-values **reserved (8/15/25/100), activation deferred**) ·
164F (Shop product taxonomy — **D-036**: accessory-first MVP = aura/back/headwear/face(masks)/
eyes(glasses); torso conditional; body/shoes/bottom/hands/front_fx deferred; hair = identity only) ·
164G (MVP shop QA gates & mask spec — **D-037**: gate framework + per-slot mask rules locked;
mask assets are Tier-1 work pending base/rig from 164B) ·
164H (Tier-1 base rig & mask authoring plan — **D-038**: locks the 6-step Tier-1 sequence
+ formats/gates/order; base rig is the blocking first step; spec `docs/164h-tier1-base-rig-mask-authoring-plan.md`) ·
164I (Base rig production execution method — **D-039**: Option B (outsource to illustrator)
primary, A fallback, C scaffold-only; 164B.3 PASS gate; spec `docs/164i-base-rig-production-execution-plan.md`) ·
164J (Automation-first avatar production — **D-040**: Master = Tier-0 base; MVP = accessory
overlays only; neutral base/illustrator method re-scoped to a deferred upgrade; D-038/D-039 re-scoped) ·
164K (Automated anchor + MVP mask extraction plan — **D-041**: deterministic non-AI derivation
from Master; method/schema/gates locked; spec `docs/164k-anchor-mask-extraction-plan.md`).

## Current Production State (avatar MVP path — D-040)
- **Tier-0 base = `Northstar Master.png`** (fixed default avatar; no reconstruction needed for MVP).
- **MVP shop = accessory overlays only** (aura, back, headwear, face/masks, eyes/glasses).
- **Blocking next step = 164L** (the deterministic non-AI extraction tooling; 164K spec locked by D-041).
- **Deferred upgrades (not MVP blockers):** neutral reconstructed base (164B/164I/D-039),
  per-user skin tone / hairstyle / hair-color, torso/bottom/shoes clothing slots.

### 167A raster migration — execution path LOCKED (2026-07-01)
- **Step 1 scaffold shipped** (commit `8e089af`): `assets/avatar-r2/` + empty `R2_MANIFEST` + inert
  raster resolvers in `js/avatar-layers.js` (`AVATAR_R2=false`; render on C2/SVG). Additive; no
  render/engine/z/identity change.
- **Path LOCKED = D-040 Phase-1 "Master-as-is" FIRST**, then 163F Phase-2 decomposition later
  (**Phase-2 not started**). Step-3 wiring plan: [`167a-step3-render-wiring-plan.md`](./167a-step3-render-wiring-plan.md).
- **Step 3a DONE (2026-07-01):** the Phase-1 baked base is produced + wired. A deterministic extractor
  (`tools/avatar/extract-master-base.mjs`) alpha-cuts + downscales the Master → a **temporary transparent
  PNG preview** `assets/avatar-r2/base/body-neutral-medium-v1.png`, registered in `R2_MANIFEST`
  (`base:{ "neutral-medium":{ v:1, ext:"png" } }`, `version:1`) and consumed by `mountC2Avatar` **only
  when `AVATAR_R2` is true (default false → untouched C2/SVG render)**. Engines/cosmetics/identity
  unchanged; C2 fallback intact. Validated (node --check, unit, smoke).
- **PNG is temporary; WebP is the production target (D-013)** — no image dependency was added (no
  sharp/cwebp). **WebP swap DEFERRED (2026-07-01):** no encoder is available in the environment
  (cwebp/ffmpeg/ImageMagick/sharp all absent) and adding a dep / hand-rolling an encoder was declined
  to avoid new deps. The **PNG (~244 KB, within the <350 KB budget) is the current Phase-1 runtime
  asset**; WebP swap (`{ v:2, ext:"webp" }`) waits until a proper encoder is available.
  > **UPDATE 2026-07-02:** an encoder is now available (vendored libwebp `cwebp.exe`, gate 4 — see
  > the Phase-2 gate list below). The Phase-1 WebP swap is therefore **unblocked**, but remains a
  > separate, deliberate action (encode `body-neutral-medium-v2.webp`, register `{ v:2, ext:"webp" }`);
  > not done here.
- **Phase-1 engine guard DONE (2026-07-01):** when the raster base is active
  (`isAvatarR2ActiveFor(identity)`), expression + blink overlays are **skipped** at the mount sites
  (app.js, avatar.html, hub.html) so they never render over the baked face; **presence/breathing stays
  on**. Engine logic unchanged (caller-side skip only, an already-supported "engine absent" state);
  C2/SVG path untouched. Verified by DOM probe (raster → 0 expr overlays, no blink layer, breathing
  active) + smoke.
- **Phase-1 cosmetic slot-gate DONE (2026-07-01):** on the raster base, `composeR2Layers` renders only
  `R2_PHASE1_SAFE_SLOTS = ["aura","back"]` (behind-figure, anchor-independent). Head/face/eye
  (headwear/face/eyes) + clothing (torso/body/neck) are gated — QA showed they float on the legacy
  anchors / clash with the baked outfit. Raster path only; C2/SVG renders all slots unchanged. No
  z-model/anchor/mask/shop/ownership/identity change. Cosmetic re-anchoring = Phase-2.
- **Phase-1 visual sign-off = PASS (2026-07-01)** — see
  [`167a-phase1-visual-signoff-checklist.md`](./167a-phase1-visual-signoff-checklist.md).
- **Phase-1 pilot opt-in LIVE (2026-07-01, commit `78a8e6d`).** `isAvatarR2()` now honours a
  per-browser override `localStorage.avatar_r2 === "1"` (mirrors `AVATAR_V2`). **`AVATAR_R2` remains
  `false` by default** → non-pilot users still render the untouched **C2/SVG** avatar; only browsers
  that set the key see the raster. **No DB cohorting, no percentage rollout, no global enable.**
  - **Pilot selection:** neutral-medium identity + low/no cosmetics (only aura/back render on the
    baked base; head/face/eye/clothing are slot-gated). Criteria + onboarding:
    [`167a-phase1-pilot-rollout.md`](./167a-phase1-pilot-rollout.md).
  - **Opt-out:** `localStorage.removeItem("avatar_r2")` (reload) → back to C2 instantly.
  - **Still deferred:** WebP swap (no encoder; PNG is the current runtime asset). **Phase-2 163F
    decomposition NOT started.**
- **Remaining (deferred): Phase-2 163F decomposition** (steps 3b/3c — living face/eyes/blink, hair
  raster + eye-box; cosmetic anchor revision) — **not started**; per-layer WebP art required.
- **Phase-2 PLANNING DONE (2026-07-01, PR #1 `5e2e80b`) — implementation NOT started.** Two docs
  merged: the decomposition audit + implementation plan
  [`167a-phase2-decomposition-plan.md`](./167a-phase2-decomposition-plan.md) (target stack, generated-
  vs-human-art split, revised **raster-only** eye-box, blink/expression reactivation, staged cosmetic
  un-gating, manifest/versioning, gates, rollback) and the P2-0 asset production brief
  [`167a-phase2-asset-brief.md`](./167a-phase2-asset-brief.md) (exact per-layer cut-list, dims/z/bg/
  producer/acceptance, North Star eye-box numbers, WebP + sign-off gates). Docs only — no runtime/
  manifest/flag change.
- **P2-0 cut-guide extractor SHIPPED (2026-07-01, PR #2 `bab6a8a`) — review artifacts only.**
  `tools/avatar/extract-phase2-cut-guides.mjs` (deterministic, non-AI, zero-dep; same PNG codec +
  sha256 guard + coordinate conventions as `extract-master-base.mjs`) reads the frozen Master (read-
  only) + the 164L anchor template and emits, to the **gitignored** `tools/avatar/build/phase2/`:
  `cut-guides-overlay-v1.png` (anchor regions + eye opening/iris/pupil crosshairs on the Master),
  `crop-{face,eye-left,eye-right,headwear,back}-region-v1.png` (per-zone crops), and
  `cut-guides-v1.report.json` (regions + eye centres in master / served ÷2 / engine-160 ÷6.4). It is
  the painter's guide for the human-authored Phase-2 layers — **NOT runtime assets, NOT geometry-
  altering; no `assets/avatar-r2/` write, no `R2_MANIFEST` change, `AVATAR_R2` untouched.** Verified:
  eye-opening centres L (66.7, 60.3) / R (90.6, 60.3) in 160-space (≈13 units below the legacy `cy47`
  blink box); output PNGs valid; visual QA of the overlay = regions land correctly on the figure.
- **P2-0 cut-guide review worksheet RUN + PASS (2026-07-01, PR #6 `7fa7560`; countersign PR #7
  `2159d3e`).** [`167a-phase2-cut-guides-review-worksheet.md`](./167a-phase2-cut-guides-review-worksheet.md)
  reviewed the overlay + crops (all 10 checklist rows PASS) and approved the **Phase-2 raster
  eye-box**. **Owner countersign = APPROVED 2026-07-01.** → **Plan §13 GATE 1 (Phase-2-scoped
  anchor/eye-box sign-off) is SATISFIED.** Approval is **raster-path only** — the eye-box drives the
  raster blink/eye rig; the **legacy C2 anchors (`cx68/92 cy47`, `js/avatar-blink-engine.js`) stay
  frozen** (two eye-box sets coexist, selected by the render branch). Docs only; no runtime/manifest/
  flag change.
- **Phase-2 implementation gates — GATES 1 + 4 SATISFIED (2026-07-02); GATES 2, 3, 5 OPEN.**
  (1) ✅ Phase-2-scoped anchor/eye-box sign-off — **SATISFIED** (owner-countersigned, PR #7 `2159d3e`).
  (2) ⛔ **AI-assisted masked decomposition** of the v2 base (D-042) passing **164B.3** — open.
  (3) ⛔ the remaining **face / eyes / eyelid / hair** layers (AI-assisted masked, D-042) passing review — open.
  (4) ✅ a **WebP encoder** — **SATISFIED (2026-07-02):** vendored libwebp `cwebp.exe` 1.5.0
  (`tools/avatar/vendor/`, gitignored; reproducible via `tools/avatar/fetch-cwebp.mjs`) + wrapper
  `tools/avatar/encode-webp.mjs`. Proven: Phase-1 base 242 KB PNG → 37.7 KB WebP (512×768, alpha
  preserved, within the <350 KB budget). Zero npm deps. Build tooling only — no `assets/avatar-r2/`
  write, no `R2_MANIFEST` change, `AVATAR_R2` untouched.
  (5) ⛔ human **visual sign-off** on the composed raster stack — open.
  **Phase-2 runtime code may pass GATES 1 + 4 ONLY.** Until gates 2, 3, 5 are met: **Phase-2
  implementation is still NOT started**; no Phase-2 runtime code; **`AVATAR_R2` stays `false`**; the
  Phase-1 PNG baked base + pilot opt-in + C2/SVG fallback remain intact. **The remaining blocker is now
  purely the human art** (gates 2–3, then the visual sign-off gate 5).
- **Art-production handoff written (2026-07-02, art policy revised D-042) — for gates 2–3.**
  [`167a-phase2-artist-handoff.md`](./167a-phase2-artist-handoff.md) is the practical art-production brief for
  the decomposed layers (v2 base + face/eyes/eyelid/hair): filenames/dims/transparent-bg, what stays
  identical to Master vs what is removed from the v2 base, the approved eye-box (§8), the 164B.3
  acceptance gate, and producer/delivery/rejection checklists. **Policy (D-042): AI-assisted masked
  decomposition allowed; AI regeneration/redesign forbidden.** Doc only — offline art deliverable; no
  runtime/manifest/flag change; Phase-2 not started.

## Open Questions
- OQ-1: ~~Hybrid vs Full-raster~~ **RESOLVED** — Hybrid Raster + WebP (163A/163D).
- OQ-2: ~~Base redesign vs re-asset~~ **RESOLVED** — raster re-asset from North Star v1.0.
- OQ-3: Onboarding does not expose C2 vocabulary (hair_color picker, C2 hairstyles).
- OQ-4: No cohort / % activation mechanism.
- OQ-5: ~~Neutral, symmetric base POSE must be derived from North Star~~ **RESOLVED**
  (2026-06-15) — Master v1.0 is a near-symmetric front pose; D-029 authorises the
  neutral body-underlayer as a derived production asset (cut in 164B). (164A)
- OQ-6: ~~"Sad / negative" expression vs 151A "never-negative"~~ **RESOLVED** — D-024
  locks a permanent never-negative policy; `sad`/`angry` excluded from MVP (ADR-163F).
- OQ-7: ~~Confirm MVP eye scoping (2 files, face-driven emotion)~~ **RESOLVED**
  (2026-06-15) — D-021 stays locked: MVP eyes = 2 files (`iris.webp` + `fixed.webp`),
  MVP emotion is face-driven. Per-expression eye-shape variants are a **future additive
  capability**, not part of MVP (does not change D-012).

## Current Risks
- R-1 (Medium): Art-direction drift — flat SVG base ≠ North Star (eyes/finish). Being
  resolved by the Hybrid Raster re-asset.
- R-2 (Medium): Onboarding mismatch — users cannot pick C2 vocabulary.
- R-3 (Low): Visual/cosmetics regression — mitigated by goldens + flag OFF.
- R-4 (Low-op): Migration-history drift (ledger) — `db push` blocked; MCP apply only.
- R-5 (Low-op): Two-clone sync discipline (ff-pull after each push).
- R-6 (High, art): AI style drift + decomposition seams across raster assets — mitigate
  by producing all layers from one North Star + style-lock + gatekeeper + golden QA.
  **CONFIRMED for the base (164C):** **unmasked** AI generation/regeneration reliably drifts the
  base's proportions/identity. **Mitigation revised (D-042, 2026-07-02):** since no human painter is
  available, the base + rig are produced by **AI-assisted MASKED decomposition on the frozen Master**
  (masked inpainting/outpainting that lifts features + reconstructs what they hid, identity-locked to
  the Master) — **not** free regeneration, which stays forbidden. Residual drift risk is caught by the
  **164B.3 gate** + composed visual sign-off (gate 5). (Old rule: manual paint-over only, D-033.)
- R-7 (Medium, tech): Hair/iris tint quality (canvas multiply + fixed highlight) —
  mitigate via hybrid tint + hand-painted overrides; prototype early.
- R-8 (Medium, art/process): Style coherence across a 1000+ AI-generated item catalog
  (R-6 applied to Tier 2) — mitigate via the locked style kit + per-slot masks + the
  slot-mask/QA gates + style-conformance scoring (D-034 / `docs/164d-shop-pipeline.md`).
- R-9 (Medium, product): MVP identity deferral (D-040) — Tier-0 = Master as a **single
  fixed avatar** + accessories; per-user skin tone / hairstyle / hair-color variation is
  **deferred** with the neutral-base upgrade. Accepted for the pilot MVP; revisit if
  per-user identity at launch becomes a hard requirement.

## Technical Debt
- TD-1: Legacy cosmetic assets are pseudo-3D (clash with flat C2); flat redesign
  pending (armor/cape fit "Needs Adjustment").
- TD-2: Expression assets are legacy-styled (aligned, not flat).
- TD-3: Migration-history drift; repo migration files ≠ DB version ledger.
- TD-4: Gitlink anomaly in ROOT clone (vestigial, not on deploy path).
- TD-5: Local prod-data snapshot `backups/…` kept out of repo (no `.gitignore` yet).
- TD-6: Flat-SVG C2 asset set is **superseded** by the Hybrid Raster pipeline (kept
  for rollback during transition; remove once raster ships).

## Next Recommended Section
**164L — Anchor + MVP mask extraction tooling** (the method is locked by **D-041 / 164K**).
A small **deterministic, non-AI** script reads `Northstar Master.png` (verified 1024×1536) and
emits `avatar-anchor-template-v1.json` + an anchor-overlay preview + QA/build mask PNGs for the
5 MVP accessory slots (`aura`, `back`, `headwear`, `face/masks`, `eyes/glasses`) per the D-037
rules, for human review against the mask worksheet. Then proceed to the Tier-2 AI item-overlay
conveyor. **No illustrator, no manual per-item editing; no AI geometry; `AVATAR_V2` stays OFF.**
This is the first code step and requires explicit approval (no tooling written under 164K).

> **Deferred upgrade (was the old "Next Section", now NOT an MVP blocker — D-040):**
> **164B — Cut & Export the Neutral Stack** — decompose Master into `body-neutral-medium`
> (D-029), `face-neutral`, `eyes-neutral-iris`/`-fixed`, `eyelid-medium`, `hair-northstar-v1`
> at the locked z-stack (D-030), produced by **AI-assisted masked decomposition (D-042)** — masked
> edits on the frozen Master, not regeneration — and passing the 164B.3 gate. This
> is the **future quality upgrade** that enables a neutral default outfit + per-user skin
> tone / hairstyle. Geometry source = `Northstar Master.png` ONLY (D-032); the outfit
> reference never drives geometry. Pursue **after** the MVP accessory shop ships.
