# ROADMAP.md — Den Seje App

_Schedule, status and section ordering. Single source of truth for "where are we / what's next."_
_Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md). Avatar specifics: [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md)._
_Last reviewed: 2026-07-01._

> **Two parallel tracks.** The project runs an **Avatar / art track** (numeric sections 155–167+,
> decisions D-001…D-041) and a newer **Platform / services track** (Section 157A audit → 157B+).
> They share the same one-section-at-a-time discipline ([CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md)).
> The avatar decision register lives in `docs/project-state.md`; this file gives the cross-track view.

---

## Current status (2026-06-30)

- **Production:** Supabase project `den-seje-app` (`tjzbehwfagiwpwodsgwg`, eu-west-1, Pro);
  frontend live on Vercel, auto-deploy from `main`.
- **Avatar:** `AVATAR_V2 = true` is **live** (commit `52f8365`, 2026-06-25) — but rendering **flat
  placeholder SVGs**, not the Northstar Master raster. Master production + wiring is planned
  (`docs/167a-master-asset-raster-wiring-plan.md`), not executed.
  **✅ Gate 2 (neutral base layer) CLOSED (2026-07-14, D-056)** — owner-approved candidate
  `d042-outfit-candidate-d053-arm-residue.png` (sha `2CB93EE0…`); final 164B.3 = **PASS with an
  owner-accepted inherited §7 alpha/matte exception**. **Not a promotion:** the candidate is still
  gitignored; **`assets/avatar-r2` / `R2_MANIFEST` untouched, `AVATAR_R2` stays `false`.**
  **Gate 3 has since STARTED on explicit owner command (2026-07-15, WP0 PR #69), and its deterministic
  layer set is COMPLETE and owner-countersigned (integration composite PASS, PR #86/#87)** — remaining
  Gate-3 scope is the four D-042 expression variants (producer tool merged PR #88, never run). Nothing
  promoted. Gate 5 remains open.
  **✅ R2 activation-readiness audit CLOSED — VERIFIED & COMPLETE on main (2026-07-23, `9d27df5`).**
  All findings **F1–F5 closed** (D-062 runtime asset-load-failure→C2 fallback · D-065 idempotent
  arm-fringe reproducer · D-064 Phase-2 pilot-doc refresh · F4 R2 goldens · D-063 blink open/closed
  goldens); **F6** = accepted debt (D-061 faint arm residual); **F7/F8** = LOW. Green main CI
  (365 passed). **`AVATAR_R2` stays `false`** — audit closure is verification only, **no pilot,
  no flag-flip.** See `docs/project-state.md` (D-062…D-065) + `docs/167a-phase1-pilot-rollout.md`.
  **✅ Shared R2 raster-artefact question CLOSED for pilot (2026-07-26, D-071).** A read-only
  render-scale audit measured the shared raster stack at the app's **real** render sizes (avatar
  `180×270`, hub `110×165`/`100×150`, quiz `52×78`) and found every area `NOT_VISIBLE_AT_REAL_SCALE`;
  the D-061 arm residual shows only under heavy diagnostic zoom. **Binding owner decision D —
  `OWNER_ACCEPTED_FOR_PILOT_WITH_DOCUMENTED_RASTER_DEBT`:** no alpha cleanup / no source re-cut; the
  shared raster artefacts are **no longer an active blocker** at the current render sizes (F6-style debt
  accepted for a controlled pilot). Re-audit if a surface wider than ≈180 px, a fullscreen/hero avatar,
  a higher display scale, or a base/hair/shoe asset change is introduced. **`AVATAR_R2` stays `false`**
  (no activation). Remaining separate tracks: controlled R2 pilot · broad R2 activation · optional
  small-size supplementary cue (distinct from raster fringe) · pilot findings. See `docs/project-state.md`
  (D-071) + `docs/AVATAR_SYSTEM.md`.
  **▶ Controlled R2 pilot — operationally planned, `AUTHORIZED_BUT_NOT_STARTED` (2026-07-26, D-072).**
  R2 has been **live-verified technically** on production (avatar/hub/quiz `renderPath=r2`, no C2 fallback),
  but that check ran in an **ephemeral automated browser** — **no persistent pilot user is onboarded yet**.
  The next concrete gate is **manual onboarding in a persistent browser profile** (close → reopen → opt-in
  still present → `renderPath=r2`), per the finalized protocol in `docs/167a-phase1-pilot-rollout.md`
  (§7–§15: Wave 1 target 3 / max 5, 7 days & ≥3 sessions, feedback+severity, abort + PASS/PASS_WITH_DEBT/
  PAUSED/FAILED). **Observability and allowlist enablement remain later separate tracks; no broad
  activation.** **`AVATAR_R2` stays `false`.** See `docs/project-state.md` (D-072).
  **▶ Manual onboarding kit READY (2026-07-26, D-073).** `docs/167a-persistent-browser-onboarding-kit.md`
  is the copy-ready, manual procedure for the persistent-browser gate (Fase A → close/reopen persistence
  gate → opt-out demo → `ONBOARDED` decision box, with data-minimal log + error table). The **next manual
  gate** is running it for the **test-student in a real persistent browser profile**; **no user is onboarded
  yet**. **C (observability)** and **B (allowlist)** remain separate later tracks; **no broad activation**;
  **`AVATAR_R2` stays `false`.** See `docs/project-state.md` (D-073).
  **▶ C-track (observability) AUDITED + DESIGNED, not implemented (2026-07-26, D-074).**
  `docs/167a-r2-pilot-observability-design.md` designs a privacy-safe, **console-only, pilot-gated** render
  signal (r2 / c2_fallback / render_failed) with a single central emission point in `mountC2Avatar`, fail-soft
  + WeakSet dedup, **no backend / no database / no identifier / no persistence**. **✅ Owner decision
  CONFIRMED (2026-07-26): `CONSOLE_ONLY_PILOT_OBSERVABILITY`** (design-doc status `OWNER_DECISION_CONFIRMED`).
  Implementation is a **separate future runtime PR** the owner triggers when desired; the confirmation
  authorises the **design, not activation**. Observability is **advisory** — manual onboarding (D-073) works
  without it. **B (allowlist)** remains a separate later track; **no broad activation**; **`AVATAR_R2` stays
  `false`.** See `docs/project-state.md` (D-074).
  **▶ C-track (observability) IMPLEMENTED — console-only (2026-07-27, D-076).** First runtime PR of the pilot
  arc: `js/avatar-r2-observability.js` + one central emission in `mountC2Avatar` (r2 / c2_fallback /
  render_failed), pilot-gated on `localStorage.avatar_r2==="1"`, fail-soft, WeakSet-deduped, **no
  backend/network/database/persistence/PII**; unit + self-served fixture-intercepted Playwright coverage.
  Advisory — never gates rendering; C2-default functionally/visually/DOM unchanged; existing goldens
  unchanged. **`AVATAR_R2` stays `false`;** pilot status unchanged. See `docs/project-state.md` (D-076).
  **▶ Shop-preview grid forced to C2 (2026-07-27, D-077).** `FORCE_ALL_SHOP_PREVIEWS_TO_C2`: the shop
  previously mixed R2 (aura/back) and C2 (all other slots) card-to-card; `shopPreviewModeFor` now returns
  `"c2"` for every slot so every product card renders the whole C2 preview with the item visible — no
  per-card R2, no inconsistent grid. Shop-preview-only; avatar/hub/quiz/R2-runtime/manifest/buy/equip
  untouched; **`AVATAR_R2` stays `false`.** See `docs/project-state.md` (D-077).
  **▶ Controlled R2 pilot STARTED — `PILOT_WAVE_1_IN_PROGRESS` (2026-07-27, D-078).** The test-student was
  manually `ONBOARDED` through the persistent-browser gate (D-073 kit; owner-witnessed, Chrome/desktop): opt-in
  survived a real browser close-and-reopen, `renderPath=r2` on avatar/hub/quiz with no mixed stack, opt-out
  demonstrated. Pilot status moves `AUTHORIZED_BUT_NOT_STARTED` → **`PILOT_WAVE_1_IN_PROGRESS`** (1 of target
  3, max 5). Docs-only; **no code/runtime/user-data change; `AVATAR_R2` stays `false`** (per-browser opt-in
  only, no global flag-flip). See `docs/project-state.md` (D-078).
  **▶ R2 full-cosmetic-support track — slice 1: HEADWEAR (2026-07-28, D-079).** First item-equipment slice
  from the equipment audit: `headwear` now renders on the R2 stack (dedicated R2 z above hair + a
  version-controlled wrapper transform; source assets untouched; all five current hats align natively). aura/
  back were already supported; **eyes/face/neck/torso/body stay gated** (need R2-specific assets / runtime).
  Shop stays uniform C2 (D-077); buy/equip/ownership untouched; whole-stack-or-C2 preserved; **`AVATAR_R2`
  stays `false`**; pilot status unchanged. Next slices: eyes → face → neck → torso → body. See
  `docs/project-state.md` (D-079).
  **▶ R2 full-cosmetic-support track — slice 2: EYES/GLASSES (2026-07-28, D-080; live-catalog-corrected
  2026-07-29).** The `eyes` slot now renders on the R2 stack as a DISTINCT cosmetic layer
  (`data-c2-layer="eyes-cosmetic"`, z6 — above the internal eye stack + blink lid, under the hair)
  re-seated onto the R2 eye-line by a version-controlled wrapper transform. The one live eyes item
  (catalog id `glasses-round`, image_url the front-only **`glasses-round-basic-v1.svg`** per migration
  `20260623000000`) uses the **standard `translateY(4.4%)` — no scale** (its lens spacing already matches
  the R2 eyes); the per-item override table stays as the mechanism for a future asset but is empty. Source
  SVG untouched. Blink and expressions leave the glasses in place; headwear shows simultaneously with the
  correct z-order. aura/back/headwear were already supported; **face/neck/torso/body stay gated.**
  **▶ R2 full-cosmetic-support track — slice 3: FACE/MASKS (2026-07-29, D-081).** The `face` slot now
  renders on the R2 stack as a DISTINCT cosmetic layer (`data-c2-layer="face-cosmetic"`). The three live
  masks are heterogeneous, so each gets a per-item transform + z: `ninja-mask` (lower-face) `translateY(6.5%)`
  z8 under hair; `hero-mask` (eye-domino) `translateY(5%)` z8 under hair; `panda-mask` (full-face)
  `translateY(6%) scale(1.1)` z41 ABOVE hair (a hat still sits on top). Masks that cover the eyes hide
  blink/expression underneath (intentional); ninja leaves the eyes visible. Source SVGs untouched.
  aura/back/headwear/eyes were already supported; **neck/torso/body stay gated.** Shop stays uniform C2
  (D-077); buy/equip/ownership untouched; whole-stack-or-C2 preserved; **`AVATAR_R2` stays `false`**;
  pilot status unchanged. ~~Next slices: neck → torso → body.~~ **Superseded by D-082** — see below. See
  `docs/project-state.md` (D-081).
  **▶ R2 full-cosmetic-support track — REMAINING-SLOT AUDIT: the plan is not executable as recorded
  (2026-07-30, D-082).** Read-only live-catalog + geometry audit of the three remaining slots.
  **`neck` and `body` have NO catalog items at all** (0 rows each) → nothing to wire; closed as
  `NO_CATALOG_ITEMS`, not carried as pending slices. The only remaining slot with content is **`torso`**
  (1 item: `armor-knight` / "Ridderdragt", 300 coins), and it **cannot be re-seated by a wrapper
  transform**: the item is authored on the C2 wide-arm pose, while the R2 Master figure holds its arms
  down against the body, so **all six arm-side elements (both arm plates, both elbow guards, both
  pauldrons) land on fully transparent canvas — 0 px of R2 figure beneath them**. Seating the arms needs
  scale 0.46, fitting the chest needs 0.76: mutually exclusive. `NEEDS_R2_SPECIFIC_ASSET` is therefore
  **confirmed as measured fact**, and torso is an **art-production** item, not a wiring slice.
  **Also found — MAJOR live pilot defect:** the slot-gate drops an equipped torso item **silently**, so a
  pilot student who paid 300 coins sees the armour on C2 and **nothing on R2** (no data loss; opt-out
  restores it). **Recommendation: fix the silent loss first via whole-avatar `forceC2` while a torso item
  is equipped (option B), and treat an R2-specific torso asset (option A, AI permitted per D-034) as
  separate later art work.** Read-only: no runtime/asset/test/golden/catalog change; **`AVATAR_R2` stays
  `false`**; pilot status stays `PILOT_WAVE_1_IN_PROGRESS`. **OWNER DECISION (2026-07-31): option B** —
  whole-avatar `forceC2` while a torso item is equipped, implemented in a **separate runtime PR**; option A
  (R2-specific torso asset) deferred as separate art work, not rejected; neck/body closed as
  `NO_CATALOG_ITEMS`. See `docs/167a-r2-cosmetic-slot-completion-audit.md`, `docs/project-state.md` (D-082).
  **▶ R2 full-cosmetic-support track — DEFECT CLOSED, option B shipped (2026-07-31, D-083).** An equipped
  cosmetic in a slot the R2 stack cannot render (neck/torso/body) no longer disappears: `composeR2Layers`
  refuses the R2 stack for the **whole avatar**, so the complete C2 path renders **with the item visible**.
  Generic by slot (new pure helpers `r2UnrenderableCosmeticSlots` / `r2RequiresC2Fallback`), so a future
  neck/body item is covered too; `R2_SUPPORTED_COSMETIC_SLOTS` unchanged; C2 path byte-unchanged;
  buy/equip/ownership untouched and the fallback reverses on unequip. Reported with its own observability
  reason `unsupported_cosmetic_equipped` (event schema/version unchanged). No golden added/re-baselined.
  Unit 215/215, torso spec 8/8, full suite 503 passed / exit 0. **`AVATAR_R2` stays `false`**; pilot status
  unchanged. **Track status:** aura/back/headwear/eyes/face **wired** · torso **handled by B** (option A —
  an R2-specific asset — still open art work) · neck/body **closed, `NO_CATALOG_ITEMS`**. See
  `docs/project-state.md` (D-083).
  Shop stays uniform C2 (D-077); buy/equip/ownership untouched; whole-stack-or-C2 preserved; **`AVATAR_R2`
  stays `false`**; pilot status unchanged. See `docs/project-state.md` (D-080).
  **▶ R2 full-cosmetic-support track — CURRENT STATUS (2026-07-31, after D-083).** Supersedes every earlier
  "next slices" plan in this section: **aura/back/headwear/eyes/face wired** · **torso handled by the
  whole-avatar C2 fallback (D-083)** — an equipped Ridderdragt always renders, on the C2 path, and never
  disappears · **neck/body closed as `NO_CATALOG_ITEMS`** (no catalog content to wire). **No further wiring
  slices are planned.** **Optional future work:** an R2-specific torso asset (option A of the D-082 audit,
  AI permitted per D-034) — the only way to show armour ON the R2 figure; art production first, not
  scheduled and not blocking. **`AVATAR_R2` stays `false`**; pilot status stays `PILOT_WAVE_1_IN_PROGRESS`.
  **▶ Option A SPECIFIED — R2 torso asset production plan + measured mask spec (2026-07-31, D-084).**
  Docs-only; **no asset produced**. Option A is **Tier-1 + Tier-2** work (A1 occlusion mask → A2 artwork →
  A3 wiring), because **D-037 keeps the `torso` mask CONDITIONAL** until a mask exists that fully occludes
  the base tee and leaves forearms/hands to the base — so **A2/A3 need an explicit owner decision** to
  discharge that condition. Geometry re-measured on the **runtime** base `body-neutral-medium-v2.webp`
  (D-082 had measured the historical v1 PNG): arms are seam-separated from the torso, and **arms/hands run
  alongside the hips BELOW both the tee hem and the crotch**, so the mask must pinch to the seam columns
  and stop before the fingertips. **`AVATAR_R2` stays `false`**; pilot status unchanged; until the owner
  decides, **D-083's C2 fallback stays the shipped behaviour**. See
  `docs/167a-r2-torso-asset-production-plan.md`, `docs/project-state.md` (D-084).
  **▶ Option A — step A1 BUILT: torso occlusion mask + slot template (2026-07-31, D-085).**
  Deterministic, NON-AI tool (`npm run avatar:r2-torso-mask`, read-only by default) derives three masks —
  hard / edit-allowed / protect — from the **runtime** base `body-neutral-medium-v2.webp` (pinned SHA) on
  the Master canvas 1024×1536, re-measuring and asserting the D-084 landmarks on every run. Tracked as a
  **production template** under `tools/avatar/fixtures/r2-torso/` — **not** a runtime asset; nothing was
  promoted to `assets/`. 28/28 gates, byte-identical across independent builds, unit 236/236. **Two
  disclosed residues:** a 6 px detached sleeve-tip fringe (bounded, sub-pixel at render size) and
  2,740 px of the tee's collar curve above the locked shoulder line — **the latter was a D-037 violation
  and is CLOSED in revision 2 (same PR): the garment is now identified topologically (95,799 px, top row
  528), a binding gate `base-tee-garment-uncovered = 0 px` covers the whole tee including the collar, and
  the grey neckline ring is gone at all four render sizes. Revision 2 also closed the reproducibility
  gap: the vendored decoder is CHECKSUM-pinned in `fetch-dwebp.mjs`, the builder refuses an unpinned
  binary, and the determinism tests fail loudly instead of skipping (unit 241/241, 0 skipped). CI still
  does not run `npm run test:unit` at all — the minimal workflow step is written out in the review doc
  §5.2 but deliberately NOT made, since it downloads a third-party binary in CI and the runners are Linux
  while the pinned binary is a Windows build.** **Revision 3 (2026-08-01): the owner spotted a SEMANTIC
  INVERSION at the neckline and was right — nearest-RGB classification pushed the tee's dark collar ring
  OUT of the mask (809 px) and pulled shadowed skin IN (93 px), and the coverage gate was circular
  because it measured only what that same classifier had called garment. Meaning now comes from hue,
  dark line work is assigned by OWNERSHIP (thin stroke within 4 px of the connected fabric, so the dark
  trousers can never be adopted), and the band rule admits a pixel for what it IS rather than what it is
  not. Three non-circular gates were added: skin-in-mask 0, line-work coverage 99.8 %, contour within
  1 px of the garment's visible edge. Gates 34/34, unit 245/245, 0 skipped.**
  **▶ A1 ACCEPTED by the owner (2026-08-01).** Reviewed on the revision-3 images incl. an 8× neckline set;
  the bounded 6 px sleeve-tip residue and 4 px paintable-but-not-mandatory line work are accepted with it.
  **Two decisions deliberately left open: `D-037` stays CONDITIONAL (so A2 is NOT authorised), and the CI
  unit-test step is NOT authorised — the builder/determinism tests stay a local gate.** Acceptance changes
  no flag and no runtime.
  **▶ D-037 DISCHARGED for `torso`; A2 OPENED (2026-08-01, D-086).** The condition D-037 set — a torso
  occlusion mask that fully occludes the base tee and leaves forearms/hands to the base — is met and
  verified by the accepted A1 template, and is discharged **for `torso` only** (D-037's framework and
  D-040's deferral of bottom/shoes are untouched). **Scope: re-author the EXISTING `armor-knight`
  Ridderdragt** for the R2 figure — same product, same catalog row, purchase history untouched. Built in
  the same PR: a deterministic **NON-AI QA harness** (`npm run avatar:r2-torso-check`) that judges one
  candidate against the accepted masks (0 px outside `edit`, 0 px of `hard` under alpha 250, halo, island
  and four-scale legibility incl. 52×78) and self-tests on five synthetic candidates, plus the art brief
  `docs/167a-r2-torso-a2-art-brief.md`. **No artwork produced, no AI called.** `torso` is still absent
  from `R2_SUPPORTED_COSMETIC_SLOTS`, **D-083's C2 fallback stays live**, `AVATAR_R2` stays `false`.
  Unit 257/257. See `docs/project-state.md` (D-086).
  **▶ A2 first candidate generated and REJECTED (2026-08-01, D-087).** Torso adapter built
  (`npm run avatar:generate-openai-torso`, one image per run, key from env only, output gitignored) with
  two deterministic non-AI steps after generation — **fit** (scale to COVER the mandatory region) and
  **clip** (multiply by the edit mask) — because a raw generation cannot otherwise be judged. First
  candidate: harness verdict **REJECT** on `hard-region-fully-opaque` (88.6 % — the armour tapers at the
  waist and is notched at the neck while the mask is the wider tee shape), `alpha-clean-no-halo`
  (193 orphan soft px — the API baked in a dark vignette despite `background: transparent`) and
  `no-floating-islands`. **The art itself is on-brief**; the faults are mechanical and addressable.
  **No fix applied and nothing promoted — the candidate is recorded as rejected, not iterated into a
  pass.** Unit 264/264. See `docs/project-state.md` (D-087).
  **▶ A2 candidate 2 PASSES the automated gates — still not accepted (2026-08-01, D-087 revision).**
  Adapter fixes: alpha floor (the model baked a vignette into the "transparent" background), speck
  threshold aligned with the judge's own definition, `--overscan`, `--no-backfill`, and **backfill** —
  a deterministic fill of the mandatory region with the nearest garment-body colour, never over drawn
  artwork and never sampling the outline stroke. **Two moments where the number lied and the picture
  told the truth:** overscan 1.6 reached 99.86 % coverage while cropping the armour into a grey tunic,
  and the first backfill passed every gate while dragging dark wedges into the shoulder corners. Both
  were rejected on sight. Final candidate `31f4b2b6…`: 100 % mandatory coverage, one region, legible at
  all four sizes, **8.55 % of visible artwork adapter-constructed and fully disclosed** in the report,
  the sidecar and a magenta backfill map. Owner review set on the Desktop. Unit 279/279. **Not
  accepted, not promoted, not wired** — `AVATAR_R2` `false`, D-083 fallback untouched. See
  `docs/project-state.md` (D-087).
  **▶ A2 ACCEPTED by the owner — the artwork gate is cleared (2026-08-01, D-088).** Candidate
  `31f4b2b6…` reviewed on the 12-file set and accepted, **including the disclosure that 8,608 px
  (8.81 % of the mandatory region, 8.55 % of the visible artwork) were constructed by the adapter rather
  than drawn by the model** — the owner reviewed the magenta backfill-only map that isolates exactly
  those pixels. Integrity checked at acceptance: the candidate on disk re-hashes to the accepted SHA, and
  the review renders are flattened composites in which **every strictly opaque pixel is byte-identical**
  (the deltas are 35,826 px at alpha 250–254 blending into the flat background). **Recorded risk
  `R-A2-ARTEFACT`: the accepted artwork is gitignored and NOT reproducible** — the model call is not
  deterministic, so the raw generation is the irreplaceable file until promotion puts it under version
  control. Status **`A2_ACCEPTED`**. **Acceptance promotes and wires NOTHING:** nothing under
  `assets/avatar-r2/`, no `R2_MANIFEST` write, `torso` still absent from `R2_SUPPORTED_COSMETIC_SLOTS`,
  **`js/` byte-unchanged**, **D-083's C2 fallback remains the live protection for the Ridderdragt**,
  `AVATAR_R2` stays `false`, pilot status unchanged. **A3 (promotion + wiring + tests + goldens) is
  unstarted** and must re-verify the candidate SHA before encoding, so it provably ships the accepted
  pixels; the catalog model (D-084 §7c) is decided there. See `docs/project-state.md` (D-088).
  **▶ A3.1 — the accepted armour is a TRACKED ASSET; still nothing wired (2026-08-01, D-089).**
  `assets/avatar-r2/torso/armor-knight-r2-v1.webp` — 512×768, **30,064 B**, sha `78ca7bf5…`, encoded
  from the D-088 source `31f4b2b6…` through the **existing** runtime-asset pipeline: premultiplied
  2×2 box ÷2 (as `extract-master-base.mjs` produced the base) → **`cwebp -lossless -exact -z 9
  -metadata none`** (as base v2 in D-061, as D-084 §5 mandates). No new encoder, no new dependency.
  The lossy `encode-webp.mjs` q90 wrapper is the *overlay* lane and deliberately not used here: a
  garment that must fully occlude the base tee cannot afford a lossy alpha edge. **Every gate is
  measured on the DECODED WebP** — 0 px outside the edit zone, 0 px on protect, served mandatory
  region **24,406/24,406 = 100 %**, one component, halo 4/16, legible at all four D-071 sizes, and
  **`decoded-matches-reference-exactly` = 0 differing bytes**, which is what actually proves the
  encode was lossless rather than asking cwebp to vouch for itself. **`R2_MANIFEST` was NOT updated:**
  it lives inside `js/avatar-layers.js`, which this PR must not touch — registration moves to A3.2,
  matching the precedent that left the D-042 expression layers promoted-but-dormant. Risk
  `R-A2-ARTEFACT` is **closed** (the artwork is in version control); the out-of-repo backup is kept,
  since the served asset is a ÷2 derivative. **No runtime effect, verified by test:** `js/`
  byte-unchanged, `torso` still absent from `R2_SUPPORTED_COSMETIC_SLOTS`, no runtime file
  references the asset, **D-083's C2 fallback untouched**, `AVATAR_R2` `false`, pilot status
  unchanged. Unit **303/303**. **A3.2 outstanding:** manifest, wiring, render-path mapping, catalog
  model, tests, goldens, shop/avatar/quiz verification. See `docs/project-state.md` (D-089).
  **▶ A3.2 — the armour RENDERS on the R2 figure (2026-08-01, D-090).** Status
  **`A3.2_RUNTIME_WIRED — OWNER_VISUAL_REVIEW_REQUIRED`**. Catalog model as recommended in D-084 §7c
  and with **zero data change**: same `shop_items` row, same item id, same purchase — C2 keeps the
  SVG, R2 uses the D-089 WebP. `R2_MANIFEST.torso = { "armor-knight": 1 }` (version 4 → 5), resolved
  by `torsoSrcForR2()`; z = **1** (above the base it replaces, below every face layer and the hair).
  **The architectural change is that support is now per ITEM, not per slot:** every other cosmetic
  re-seats the same asset C2 uses, so slot support implied item support; a torso item needs its own
  artwork, so **a second torso item added tomorrow still falls back to C2** — the registration is the
  renderability contract. The garment is the one **mandatory** cosmetic layer: if it fails to load
  the WHOLE avatar drops to C2 with the armour visible, because dropping just the overlay would
  reproduce D-082 (proven by 404-ing the asset in Playwright). **D-083 is narrowed, not replaced** —
  its suites were repointed at an unwired torso item so the protection is still exercised in full.
  Observability needed **no new reason and no schema change**. Shop previews stay C2 (D-077),
  `AVATAR_R2` stays `false`, the C2 path is byte-unchanged, no DB/migration/RLS/Edge-Function change.
  Unit **328/328**, torso spec **14/14**, classifier `full`. **No golden added on purpose:** baking a
  baseline before the owner has looked would let the suite bless an unreviewed appearance. Review set
  in `_avatar-artefakter\D090-runtime-review\`. See `docs/project-state.md` (D-090).
  **▶ A3.2 ACCEPTED — option A is COMPLETE (2026-08-02, D-091).** Status **`A3.2_ACCEPTED`**. The
  owner reviewed the 11-file runtime set and accepted it: the collar covers the base tee's ring, no
  skin is painted over, the arms stay bare, no dark shoulder wedges, belt at the waist, skirt above
  the legs, and the garment tracks the body at all four D-071 sizes. **One observation was put to
  the owner first and the acceptance covers it:** at the smallest sizes the armour's silhouette is
  close to the base tee's — the `legible-at-render-sizes` gate measures **coverage**, not
  **distinguishability from wearing nothing**, so this was a product judgement no gate could make.
  A read-only consistency audit ran before the acceptance and **corrected a wording error, not a
  defect**: D-090's "the C2 render path is byte-unchanged" was imprecise — `git diff` contains no
  hunk touching `composeC2Layers`, `c2CosmeticLayers` or `baseLayersForC2`, so **those functions are
  byte-identical**; the module changed only because the import line and R2-only code share the file.
  Re-proved with existing tests only (unit 39/39, torso Playwright 14/14) plus green main CI on
  `aa1b8e9`. **The track is done: A1 (D-085) → A2 (D-087/D-088) → A3.1 (D-089) → A3.2 (D-090/D-091).**
  **Acceptance activates nothing:** `AVATAR_R2` stays `false`, pilot status unchanged, no wave
  widened, and **no golden baseline yet** — now unblocked, but its own PR under the regen → gallery →
  owner-approval flow, since it changes what CI enforces. See `docs/project-state.md` (D-091).
  **▶ B-track (allowlist) AUDITED + DESIGNED, recommend DEFER (2026-07-26, D-075).**
  `docs/167a-r2-pilot-allowlist-design.md`: the activation gate has no uid today, and a client-side
  student-UID allowlist would ship children's identifiers to the public bundle (GDPR) — **rejected**.
  Recommended decision **`NO_ALLOWLIST_FOR_PILOT`**: Wave 1 (3–5) is already enabled per-browser via the
  D-073 kit; if central enablement is ever needed at scale, use a **server-side eligibility flag** (RLS,
  own-account-only), never a client UID list. **✅ Owner decision CONFIRMED (2026-07-27):
  `NO_ALLOWLIST_FOR_PILOT`** (design-doc status `OWNER_DECISION_CONFIRMED`) — no allowlist built; Wave 1 stays
  per-browser (D-073); a server-side flag would be its own future audited runtime+migration PR if scale ever
  demands it. No code, no migration; **no broad activation**; **`AVATAR_R2` stays `false`.** See
  `docs/project-state.md` (D-075).
- **Platform services:** Section **157A audit complete** (AI / OCR / STT / TTS / image / error /
  analytics boundaries decided). **No service implemented yet.**
- **Read-aloud (157O):** **LIVE in production** (Web Speech; commit `52e7a04`, 2026-07-03) — quiz
  "🔊 Læs op", on-device, no consent, fail-soft; Danish voice preferred. First platform service
  activated for students; Piper clips remain an offline deliverable.
- **Docs:** this foundation set (Section 157AA) being established.
- **CI (D-066):** the Playwright workflow is **path-aware** — docs-only and standalone
  avatar-tool-only PRs skip the full browser suite (fast checks only); **push to main and any
  runtime/test/asset/workflow change always run the full suite** (fail-closed). The required
  `test` check is preserved in every mode. Live-backend/concurrency split deferred.
  **Live on main since `17d0574` (2026-07-23).** The two fast paths are **docs** (only `docs/**`)
  and **avatar-tool** (only `tools/avatar/**` + `docs/**`); everything else stays full.
  **Fully proven end-to-end (2026-07-24):** docs-mode (PR #107, required `test` green in ~8 s,
  Playwright skipped) · avatar-tool-mode (PR #108, real `node --check` of 1 file, Playwright
  skipped) · full-mode (PR #106/#109, whole Playwright suite, 365 passed) · every push to main ran
  forced-full · the required `test` check stayed green in all modes. A missing-trailing-newline bug
  that made the avatar-tool `node --check` a no-op was fixed first (D-066 follow-up, PR #109).
  **D-067 (2026-07-24):** fast modes now run **outside** the shared `e2e-shared-supabase` lock — a
  `classify` job routes docs/avatar-tool to an isolated `ci-fast-<run_id>` group, so they no longer
  queue behind full runs; full-mode and every fail-closed case keep the shared lock (a full suite can
  never run unlocked), and full stays serialized with `update-avatar-goldens.yml`.
  **D-067 merged to main (`44701e0`); lock-bypass PROVEN live (PR #112).** While the forced-full main
  run (`30103292846`, `push`, `e2e-shared-supabase`) was still **in_progress** (started 14:58:33Z), the
  docs-only proof run (`30103516035`) took mode **docs** → isolated group **`ci-fast-30103516035`** and
  its `test` job **started 15:01:48Z and completed `success` 15:01:57Z (~9 s)** — Playwright, browser
  install and `npm ci` all skipped, required `test` green — i.e. docs-mode **finished before** the main
  run, never queuing behind the shared lock.

## Completed sections

**Avatar / art track** (condensed — full register in `docs/project-state.md`):
- 155A–155I, 156A–156C, 157, 158A–158C, 159A–159G, 160, 161A–161E, 162A–162B — C2 pipeline,
  z-model, cosmetics parity, personality engines, North Star spec.
- 163A–163H — Hybrid Raster architecture + Eye System ADR + pipeline/asset-spec ADRs (D-011…D-027).
- 164A–164K — North Star Master decomposition spec, base production method pivot (manual paint-over,
  AI rejected), scalable shop-item pipeline, slot/z reconciliation, taxonomy, QA/mask spec,
  automation-first production (D-028…D-041).
- 166A — AVATAR_V2 activation plan → **activated** (commit `52f8365`).

**Platform / progression features shipped** (via migrations / `js/`):
- Themes, streak system, retention loops, daily/weekly quests, achievements (+ hidden/rewards),
  titles, leaderboard, social, shop economy + atomic purchase, RLS hardening, learning-engine
  metadata + concept state, multiple curriculum content sprints.

**Documentation:**
- 157A — Zero-cost service integration audit (boundaries + first-service recommendation).
- 167A — Master asset raster wiring **plan** (plan only, not executed).

## Current section

- **157CC — Roadmap rebase after staging review** ✅ (this update). **Decision (owner, 2026-06-30):**
  a dedicated staging environment is the correct long-term architecture, but **recurring paid
  infrastructure (Supabase Pro branch) is deferred**. Therefore **157CB is not cancelled** — it is
  **reclassified from an immediate blocker to a FUTURE INFRASTRUCTURE milestone**. Implementation of
  most remaining sections may proceed now (default-off, static-validated); only **live
  activation/validation against a third party** waits for a non-production target. See the
  reclassification table below.

## Staging (future infrastructure milestone — no longer an immediate blocker)

- **157CB — Dedicated staging environment** 🗓️ **future infrastructure.** Plan of record stays valid:
  **[157cb-staging-environment-plan.md](./157cb-staging-environment-plan.md)**. It is needed **only
  for live activation/validation** (turning flags on, sending real data), not to *build* the
  remaining sections. Privileged/paid steps are owner-only.
  - **Zero-cost interim (recommended, not required now):** much live validation can later run on a
    **free local Supabase stack** (`supabase start`, Docker — no Pro) + a **free Vercel preview**,
    deferring the **paid hosted branch** to pre-production rollout. This keeps staging on the roadmap
    without recurring cost until launch.

## Staging dependency reclassification (157CC — Task 1/2)

Every prior "requires 157CB" dependency, re-examined. **Category meanings:** **HARD GATE** = cannot be
*implemented* without staging · **SOFT GATE** = implement now (default-off), activate later ·
**FUTURE INFRASTRUCTURE** = only the *production rollout / live activation* needs staging ·
**UNGATED** = pure spec/decision, no dependency.

| Item | Old dependency | Real dependency | Category | Justification |
|---|---|---|---|---|
| 157B/157C/157CA **foundations** | — | none | **UNGATED** (done) | Default-off code; production-safe and inert without staging (§ Status). |
| **Live** observability validation (157B/157C/157CA Part B) | requires 157CB | needs a running non-prod backend with flags ON + real-ish data | **HARD GATE** | PII-against-real-events + edge deploy + flags-on cannot be done on production; needs a non-prod target. |
| 157D PostHog **module** (+ consent gate) | requires 157CB | none to build | **SOFT GATE** | Same pattern as 157B — a flagged `js/analytics.js` builds + static-validates with no infra. |
| 157E analytics **events** | requires 157CB | 157D module | **SOFT GATE** | Code instrumentation, default-off. |
| 157F Cloudinary **spec** | — | none | **UNGATED** | Pure specification. |
| 157G Cloudinary **integration** | — | a (free) Cloudinary account for go-live | **SOFT GATE** | Build read-path/transform behind a flag; needs no Supabase Pro branch (frontend/Vercel-preview testable). |
| 157H OCR **spec** | — | none | **UNGATED** | Pure specification. |
| 157I OCR **implementation** | requires 157CB (implied) | none | **SOFT GATE** | In-browser Tesseract wasm; no secret/server/backend — even activation is zero-cost client-side. |
| 157J Ollama reachability **decision** | gate | none | **UNGATED** | A decision/spec. |
| 157K `grade-answer` **contract** + AI **abstraction layer** | — | none | **SOFT GATE** | `_shared/ai/` scaffolding + contract build without infra; advisory-only, default-off. |
| 157L Ollama AI-grade **wiring** into `process-event` | requires 157CB | non-prod env (reward path) + reachable model | **FUTURE INFRASTRUCTURE** | Touches the reward path → must validate in non-prod before any rollout. |
| 157M AI-grade in teacher review | requires 157CB | 157L | **FUTURE INFRASTRUCTURE** | Activation follows 157L. |
| 157N Piper TTS **strategy** | — | none | **UNGATED** | Decision/spec. |
| 157O Read-aloud (Web Speech + Piper) | — | none | **LIVE** | Web Speech path **activated in prod** (`52e7a04`, 2026-07-03); Piper clips still an offline deliverable. |
| 157P Whisper STT feasibility | — | none | **UNGATED** | Decision (likely defer). |
| 157Q GDPR/consent consolidation | — | none | **SOFT GATE** | Consent mechanism is buildable code/docs. |
| 157R Rollback / flag hardening | — | none | **SOFT GATE** | Cross-cutting code; no infra. |
| 157S Playwright coverage (fail-soft paths) | — | none | **SOFT GATE** | Tests for default-off behaviour run against prod today. |
| 157T Production-readiness review | requires 157CB | the above + staging for sign-off | **FUTURE INFRASTRUCTURE** | Final go-live gate. |
| Avatar track (167A, 164L) | never | none | **UNGATED** | Independent; only gated on the AI-assisted masked-decomposition art (D-042, amends D-033). |

**Net:** the **only HARD GATE is live monitoring validation.** Everything else is SOFT GATE (build
now, default-off), UNGATED (spec/decision/avatar — do today), or FUTURE INFRASTRUCTURE (activation only).

_Prior:_ **157AA** (docs foundation) · **157AB** (consolidation) · **157B** (Sentry frontend) ·
**157C** (Edge observability foundation) · **157CA** (observability docs + static validation) ·
**157CC** (this rebase) — complete (foundations; default-off; production-safe).

## Future sections

### Platform / services track (from the 157A audit)

Each is one controlled section; all integrations behind a default-off flag, fail-soft. The **Gate**
column is the 157CC reclassification (UNGATED = do today · SOFT = build now/activate later · HARD =
needs staging to implement · FUTURE = activation/rollout only needs staging).

| Section | Work | Boundary | Gate |
|---|---|---|---|
| **157B** ✅ | Sentry error reporting — frontend wiring (`js/sentry.js`) — **done, default-off** | frontend-only | done |
| **157C** ✅ | Sentry — Edge observability foundation (`_shared/monitoring.ts`) — **done, default-off** | Edge | done |
| **157CA** ✅ | Observability docs + static validation; 2 Sentry projects decided | docs | done |
| **157CB** 🗓️ | Dedicated staging environment (Supabase branch + Vercel preview) | infra | **FUTURE INFRA** (not a blocker) |
| **Live obs. validation** | 157B/157C/157CA Part B checklists incl. PII-against-real-events | staging | **HARD GATE** |
| **157D** ✅ | PostHog `js/analytics.js` module + GDPR consent gate — **done, default-off, consent-gated, unwired** | frontend-only | **SOFT** (done) |
| **157E** ✅ | Core analytics events (login, question shown/answered, item purchased) + GDPR consent banner — **done, default-off, double-gated** | frontend-only | **SOFT** (done) |
| **157F** ✅ | Cloudinary decision spec — **decided: fetch/delivery mode (no secret)** ([157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md)) | spec | **UNGATED** (done) |
| **157G** ✅ | Cloudinary **fetch-mode** delivery (`js/cloudinary.js` `cdnUrl`), wired into `mountC2Avatar` — **done, default-off, raster-only**; activate after 167a + free account | frontend | **SOFT** (done) |
| **157H** ✅ | OCR spec — **generic reusable browser-only document-recognition service** ([157h-ocr-document-recognition-spec.md](./157h-ocr-document-recognition-spec.md)) | spec | **UNGATED** (done) |
| **157I** ✅ | `js/ocr/` service (strict provider abstraction, structured `OCRResult`, Tesseract first impl) + answer-capture adapter — **done, default-off, browser-only, no upload** | frontend-only | **SOFT** (done) |
| 157J | Ollama reachability decision (tunnel vs endpoint vs defer) | decision | **UNGATED** |
| **157K** ✅ | AI **abstraction layer** (`_shared/ai/`) + `grade-answer` advisory endpoint — **done, default-off, no reward-path wiring** | Edge | **SOFT** (done) |
| 157L | Ollama advisory AI-grade in `process-event` PATH 1 | Edge | **FUTURE INFRA** |
| 157M | AI-grade surfaced in teacher review (`review-answer`) | Edge + frontend | **FUTURE INFRA** |
| **157N** ✅ | Piper TTS strategy — **decided: pre-gen clips primary + on-device Web Speech fallback, no live service** | decision | **UNGATED** (done) |
| **157O** ✅ | Read-aloud service `js/read-aloud/` (provider-abstracted) + quiz control — **LIVE in prod** (Web Speech, `52e7a04`, 2026-07-03); Piper clips remain an offline deliverable | frontend | **SOFT** (live) |
| 157P | Whisper STT feasibility (wasm vs server) — likely defer | decision | **UNGATED** |
| **157Q** ✅ | GDPR consent consolidation — single SoT (`js/consent.js`) + consolidated banner + canonical privacy map — **done, default-off** | cross-cutting | **SOFT** (done) |
| **157R** ✅ | Feature-flag hardening — registry `js/flags.js` (`window.__flags()`) + canonical rollback runbook — **done** | cross-cutting | **SOFT** (done) |
| **157S** ✅ | Default-off/fail-soft unit tests via built-in `node --test` + `deno test` (21 tests, no new framework) — **done** | tests | **SOFT** (done) |
| 157T | Production-readiness review + secret-rotation checklist | ops | **FUTURE INFRA** |

### Avatar / art track (from 167A)

> **Guardrail (binding):** **167A replaces artwork assets only — it is NOT an avatar rewrite.** The
> stable architecture (identity, render pipeline, layer/z-model, cosmetics, presence/blink/expression
> engines, ownership, storage source-of-truth, entry points, public interfaces) **must remain
> unchanged**; any change to those during 167A is a defect. See
> **[167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md)** (pre-167A
> preservation report) before starting.

1. **✅ Scaffold done (167A-START, 2026-07-01)** + **path LOCKED (2026-07-01): D-040 Phase-1
   "Master-as-is" first, then 163F Phase-2 later.** `assets/avatar-r2/` + empty `R2_MANIFEST` + inert
   raster resolvers (`baseSrcForR2`/…/`hairSrcForR2`, `AVATAR_R2=false`) added **alongside** the C2/SVG
   resolvers in `js/avatar-layers.js` (additive; all resolvers return `null` → C2/SVG fallback; render
   untouched). Readiness = **PARTIAL** (Master `.png` 1024×1536 + anchors/masks present; **WebP absent**).
2. **⛔ Phase-1 base production (D-040) — the one blocker.** Required first asset:
   `assets/avatar-r2/base/body-neutral-medium-v1.webp` = **alpha-cut of `Northstar Master.png`** (white
   matte → transparent, resized 512×768, WebP; full avatar baked). This is a **mechanical,
   geometry-preserving** op on the frozen Master — **not** an AI regeneration and **not** the D-033
   manual paint-over (that governs the deferred Phase-2 decomposed base). Then step 3a wires it (§15 of
   [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md)). **163F Phase-2 decomposition
   is deferred — do not start yet.**
3. Renderer raster wiring (behind `AVATAR_R2`) —
   [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md). **✅ Step 3a done
   (2026-07-01):** Phase-1 baked base wired behind `AVATAR_R2` (default-off, C2/SVG fallback intact),
   shipped as a **temporary PNG preview** (`body-neutral-medium-v1.png`; **WebP = production target**).
   **Phase-1 engine guard done (2026-07-01):** expression + blink overlays skipped when the raster base
   is active (`isAvatarR2ActiveFor`); presence/breathing stays; engine logic + C2 path untouched.
   **Phase-1 cosmetic slot-gate done (2026-07-01):** only aura/back render on the baked base.
   **✅ Phase-1 visual sign-off = PASS (2026-07-01)** —
   [167a-phase1-visual-signoff-checklist.md](./167a-phase1-visual-signoff-checklist.md) (clean alpha,
   exact Master likeness, suppression + slot-gate verified, clean C2 rollback). Authorises a **flagged
   preview only** — production stays `AVATAR_R2=false`, **not** Phase-2.
   **✅ Phase-1 pilot opt-in live (2026-07-01):** `isAvatarR2()` honours a per-browser
   `localStorage.avatar_r2='1'` override (no cohort/DB, no global flip). Onboard carefully-chosen
   neutral-medium, low-cosmetic users — [167a-phase1-pilot-rollout.md](./167a-phase1-pilot-rollout.md).
   **Steps 3b/3c (Phase-2 decomposition) not started** — audit + implementation plan now written:
   [167a-phase2-decomposition-plan.md](./167a-phase2-decomposition-plan.md) + asset brief P2-0
   [167a-phase2-asset-brief.md](./167a-phase2-asset-brief.md) (gated on human art + a WebP encoder;
   `AVATAR_R2` stays `false`). **P2-0 cut-guide tool shipped (2026-07-01):**
   `tools/avatar/extract-phase2-cut-guides.mjs` (deterministic, non-AI) emits anchor-overlay +
   per-zone crops to the gitignored `tools/avatar/build/phase2/` as painter guides — **review
   artifacts only** (no runtime asset, no `R2_MANIFEST` change, `AVATAR_R2` untouched).
   **✅ Phase-2 GATE 1 SATISFIED (2026-07-01, PR #7 `2159d3e`):** the cut-guide review worksheet
   ([167a-phase2-cut-guides-review-worksheet.md](./167a-phase2-cut-guides-review-worksheet.md)) is
   PASS and the **Phase-2 raster eye-box is owner-countersigned APPROVED** — the plan §13 gate 1
   (Phase-2-scoped anchor/eye-box sign-off) is cleared. Approval is **raster-path only**; the **legacy
   C2 anchors (`cx68/92 cy47`) stay frozen**. **Phase-2 runtime code may pass gate 1 only** — ~~gates
   2, 3, 5 remain OPEN~~ **[Gate 2 CLOSED 2026-07-14, D-056 — see below; gates 3 and 5 remain OPEN]**
   (remaining face/eyes/eyelid/hair layers, visual sign-off), so **Phase-2 implementation is still not
   started** and `AVATAR_R2` stays `false`.
   **✅ Gate 4 (WebP encoder) SATISFIED (2026-07-02):** vendored libwebp `cwebp.exe` 1.5.0
   (`tools/avatar/vendor/`, gitignored; reproducible via `fetch-cwebp.mjs`) + wrapper `encode-webp.mjs`;
   proven Phase-1 base 242 KB PNG → 37.7 KB WebP (alpha preserved, within budget); zero npm deps; build
   tooling only (no `assets/avatar-r2/`/manifest/`AVATAR_R2` change). Remaining blocker = the
   AI-assisted masked-decomposition art. **Art policy revised (D-042, 2026-07-02): AI-assisted masked
   decomposition allowed; AI regeneration/redesign forbidden** (no human painter available).
   **Art-production handoff written (2026-07-02) for gates 2–3:**
   [167a-phase2-artist-handoff.md](./167a-phase2-artist-handoff.md) — practical producer brief
   (layers, filenames/dims, keep-vs-remove, approved eye-box, 164B.3 gate, checklists; masked AI on the
   Master, no regeneration). Offline art deliverable; doc only.
   **⏳ HISTORICAL — SUPERSEDED BY D-056.** _Superseded by D-056: Gate 2 SATISFIED / CLOSED on 2026-07-14.
   The paragraph below records why Gate 2 was reopened in July 2026 — it is **NOT current status**._
   **Gate 2 REOPENED / UNDER RECOVERY (2026-07-05) — iter7 INVALIDATED (D-043)** _(historical)_**:** the iter7 base was
   found to have a structural **bust/chest-plate artifact**, so its owner-countersigned 164B.3
   CONDITIONAL PASS is **WITHDRAWN/SUPERSEDED** and the iter4→iter7 line is invalidated. A **candidate
   registered base-layer source is adopted** (REVISED 2026-07-06; **not a new Master** — the frozen Master
   remains the canonical identity/style/coordinate datum, **D-032 preserved**) —
   `recovery-base-v1-blankface.png` (`assets/avatar/reference/`), which fixes the anatomy (correct bald
   scalp, ears, head→neck→collar, no bust-plate, blank face) and registers to the Master by a deterministic
   translation **(+25 x, +285 y)** (body IoU ≈ 0.9921; ≈ 84.3 % pixels identical). It is **NOT passed:**
   needs (+25,+285) registration, feet-completion from the Master if needed, outfit neutralization (still
   non-neutral), and a fresh 164B.3 review. **Gate 3 PAUSED** _(at the time — since started 2026-07-15,
   see the Gate-3 status entry below)_ (hair/eyes/face **tooling** stays useful, but
   its **outputs are not approved layers** against the corrected base-layer path); Gate 5 open. **NOT promoted; no
   `assets/avatar-r2/`; no `R2_MANIFEST`; `AVATAR_R2` `false`;** Phase-2 not started. Decision:
   [167a-phase2-base-recovery-decision.md](./167a-phase2-base-recovery-decision.md).
   **Next step = Gate 2A DEFINED / PLANNED (2026-07-06):** narrow deterministic registration
   (translate **(−25, −285)** into the Master frame) + feet-completion audit + review-only composites +
   validation report; **excludes** outfit/face/eyes/eyelid/hair/runtime/promotion; **does NOT satisfy Gate 2
   by itself.** Plan: [167a-phase2-gate2a-registration-plan.md](./167a-phase2-gate2a-registration-plan.md).
   **Progression (2026-07-07):** Gate 2A **EXECUTED = PASS / owner-review-ready**; feet-completion
   **DEFERRED** into neutral-outfit/base-assembly; **neutral-outfit/base-assembly PLAN recorded** (strategy
   B: Master body/feet + recovery head, then one masked neutralization pass; short-sleeve tee ⇒ underarm
   reconstruction). Plan: [167a-phase2-neutral-outfit-base-assembly-plan.md](./167a-phase2-neutral-outfit-base-assembly-plan.md).
   **✅ GATE 2 CLOSED (2026-07-14, D-056).** The base-layer recovery reopened at D-043 is **complete**.
   Owner-approved Gate-2 candidate: **`d042-outfit-candidate-d053-arm-residue.png`** (sha `2CB93EE0…`);
   lineage **D-043 → D-048 donor lift → D-049 protect-mask-v2.1 → D-050 donor silhouette → D-052 collar
   cleanup → D-053 arm/torso residue cleanup**. **Final 164B.3: PASS WITH OWNER-ACCEPTED INHERITED §7
   ALPHA/MATTE EXCEPTION** — §2/§3/§4/§5/§6 all PASS (notably **§4: forearm ΔRGB vs the frozen hands 68 → 1**,
   the section that had blocked since D-045). **§7 is accepted, NOT fixed:** a global ~1 px white-matte fringe
   (**2,011 px**, of which **1,557 sit inside protect**) is inherited from the D-042/D-043 pipeline and is
   recorded as technical debt. **Closing Gate 2 is NOT promotion:** candidate stays gitignored; **no
   `assets/avatar-r2` write; no `R2_MANIFEST` change; `AVATAR_R2` stays `false`; Gate 3 stayed PAUSED
   _(at the time)_**; Gate 5 open. Register: `project-state.md` (**D-047 … D-056**).
   **▶ GATE 3 — CURRENT STATUS: STARTED (2026-07-15, explicit owner command, WP0 PR #69) —
   DETERMINISTIC LAYER SET COMPLETE & OWNER-COUNTERSIGNED (integration composite PASS, PR #86/#87).**
   Accepted Gate-3 candidates (gitignored build outputs, regenerable from the tracked D-057/D-058
   sources): hair z40 (`pl1/hair-pl1-color.png` + `pl2/hair-pl2-luminance.png`), eyes z4
   (`wp2/eyes-iris-wp2-luminance.png` + `eyes-neutral-fixed.png`), face z3 (neutral) + blush component.
   Decision record = the owner-countersigned Gate-3 worksheets (no new D-entries; register unchanged
   through D-058). **Remaining Gate-3 scope: the four D-042 expression variants** — producer tool
   `tools/avatar/build-face-expr-d042.mjs` is merged (PR #88) but has NEVER run; running it requires a
   separate owner decision (external image API: vendor + Master upload + budget). **D-053 remains
   gitignored and unpromoted**, and **`AVATAR_R2` remains `false`**, until promotion is separately
   authorised.
4. Visual-fidelity QA (32/48/64px legibility + human onion-skin sign-off) — **✅ done (Phase-1 PASS).**
5. Test/golden re-baseline from the Master render.
6. Production verification + sign-off.

Plus, on the automation side: **164L** — deterministic (non-AI) anchor + MVP mask extraction
tooling from Master (method locked by D-041); then the Tier-2 AI item-overlay conveyor.

## Long-term milestones

- **M1 — Avatar resembles Northstar Master** (167A Phase-1 D-040 shipped behind `AVATAR_V2`).
- **M2 — Living decomposed avatar** (167A Phase-2 / 163F: living face/eyes/blink + skin/hair variants).
- **M3 — Scalable cosmetics shop** (automatable AI item-overlay pipeline, D-034/D-040; QA-gated).
- **M4 — Observability** (Sentry + PostHog live, GDPR-compliant) → real production visibility.
- **M5 — Advisory AI** (OCR photo answers, then advisory AI grading + draft teacher feedback),
  all fail-soft and teacher-authoritative.
- **M6 — Accessibility** (TTS read-aloud; STT voice answers) where feasible at zero cost.

## Version roadmap

| Version | Theme | Contents (target) |
|---|---|---|
| **v1.0 (MVP launch)** | Solid core + Master avatar | Live quiz loop, teacher review, shop, retention/achievements, Northstar Master avatar (D-040), Sentry + PostHog, OCR photo answers. |
| v1.1 | Living avatar + advisory AI | 163F decomposed avatar, advisory AI grading/feedback (teacher-confirmed). |
| v1.2 | Scale & accessibility | Automatable cosmetics shop, TTS/STT where viable, cohort/% rollout mechanism (OQ-4). |

## Revised implementation order (157CC — zero-cost-first, no paid infra)

Goal: keep delivering value with **no recurring subscription cost**. Do all UNGATED + SOFT work now
(default-off); delay only what truly needs staging. **No external service is activated against
production**; activation waits for a staging target (free local stack at first; paid branch at launch).

1. ~~**157F — Cloudinary decision spec**~~ ✅ done — decided **fetch/delivery mode (no secret)**, for
   raster only, after 167a; see [157f-cloudinary-decision-spec.md](./157f-cloudinary-decision-spec.md).
2. ~~**157H — OCR client spec**~~ ✅ done — generic browser-only **document-recognition service**
   (reusable beyond answers); see [157h-ocr-document-recognition-spec.md](./157h-ocr-document-recognition-spec.md).
3. ~~**157I — OCR implementation**~~ ✅ done — `js/ocr/` browser-only service (strict provider
   abstraction, structured `OCRResult`, Tesseract first impl) + answer-capture adapter, default-off,
   no image upload; see [157i-ocr-validation-checklist.md](./157i-ocr-validation-checklist.md).
4. ~~**157G — Cloudinary integration**~~ ✅ done — fetch-mode `cdnUrl()` wired into `mountC2Avatar`,
   default-off/raster-only; see [157g-cloudinary-validation-checklist.md](./157g-cloudinary-validation-checklist.md).
5. ~~**157K — AI abstraction layer + `grade-answer` contract**~~ ✅ done — `_shared/ai/` + advisory
   `grade-answer`, default-off, no reward-path wiring; see [157k-ai-grading-contract.md](./157k-ai-grading-contract.md).
6. **Avatar M1 / 164L** — Master raster wiring + non-AI mask tooling (UNGATED; parallel track; gated
   only on the AI-assisted masked-decomposition art deliverable, D-042 (amends D-033) — see [167a-architecture-preservation-report.md](./167a-architecture-preservation-report.md)).
7. **157D ✅ / 157E ✅ — PostHog**: module + GDPR consent gate (157D) and core events
   (login/question_shown/question_answered/item_purchased) + consent banner (157E) — **done,
   default-off, double-gated, no sending until activated** ([157d-posthog-analytics.md](./157d-posthog-analytics.md)).
8. **157N ✅ / 157O ✅ — read-aloud** decided + built + **LIVE in prod** (Web Speech, `52e7a04`,
   2026-07-03; Piper clips = offline deliverable; [157o-read-aloud.md](./157o-read-aloud.md)).
   **157P** STT feasibility = UNGATED decision.
9. **157Q ✅ / 157R ✅ / 157S ✅** — consent consolidation (`js/consent.js`), flag hardening
   (`js/flags.js`), and default-off/fail-soft unit tests (`node --test` + `deno test`, 21 tests,
   [157s-test-coverage.md](./157s-test-coverage.md)) — **all done**. **Zero-cost services track
   complete**; remaining work is gated on staging (157CB) or the avatar art deliverable (167A).
10. **FUTURE INFRASTRUCTURE (deferred until staging exists):** 157CB itself, live observability
    validation (HARD GATE), 157L/157M AI-grade activation, 157T production-readiness sign-off.

> Activation of anything built above happens **after** a staging target exists — first the free local
> Supabase stack + Vercel preview, then a paid hosted branch only at pre-launch. Building now does not
> incur cost; only running a hosted non-prod backend does.

## Status table

| Item | Status | Notes |
|---|---|---|
| Quiz core loop | ✅ Live | `app.js` state machine + `process-event`. |
| Teacher open-answer review | ✅ Live | `review-answer` + `student-detail.js`. |
| Shop / economy | ✅ Live | atomic purchase + RLS. |
| Retention / achievements / quests | ✅ Live | shipped via migrations + `js/`. |
| Avatar pipeline + engines | ✅ Live | `AVATAR_V2=true`. |
| Avatar art = Northstar Master | 🟡 Planned | 167A; flat placeholder live; needs AI-assisted masked-decomposition art (D-042). |
| Cohort / % rollout | ❌ None | OQ-4; only constant + localStorage override. |
| Error reporting (Sentry) — frontend | ✅ Foundation (157B), default-off | `js/sentry.js`; routes `logError`; set `ENABLE_SENTRY=true` + DSN to activate. |
| Error reporting (Sentry) — Edge | ✅ Foundation (157C), default-off | `_shared/monitoring.ts` `withObservability`; set `ENABLE_SENTRY_EDGE=true` + `SENTRY_DSN_EDGE`. 1 reference fn wired, 15 to migrate. |
| Observability — live validation | 🟡 HARD GATE (staging) | Static-validated; live (Part B) needs a non-prod target. Foundations production-safe meanwhile. |
| Staging environment (157CB) | 🗓️ Future infra | Reclassified (157CC): long-term plan, **not** an immediate blocker. Free local stack interim; paid branch at launch. |
| Analytics (PostHog) | ✅ Module + events (157D/157E), default-off | `js/analytics.js` + consent gate + banner; core events wired (login/question/purchase), double-gated. Activation needs key + consent + staging. |
| OCR / document recognition | ✅ Foundation (157I), default-off | `js/ocr/` generic service (answers + future worksheets/sources/teacher material); browser-only wasm, **no image upload**, zero-cost. Set `ENABLE_OCR=true` to activate. |
| AI abstraction / grading (Ollama) | ✅ Layer (157K), default-off / FUTURE (activation) | `_shared/ai/` + advisory `grade-answer` shipped, default-off, no reward-path wiring. 157L process-event wiring + activation need staging + 157J reachability. |
| TTS (read-aloud) | ✅ **LIVE in prod** (157N/157O, Web Speech, `52e7a04`; per-option 🔊 `eb6d5fc`) | `js/read-aloud/` on-device Web Speech (Danish voice preferred) + pre-gen Piper (clips = offline deliverable); quiz "🔊 Læs op" **+ per-MC-option 🔊** (reads one option, never submits). `ENABLE_READ_ALOUD=true`. |
| STT (Whisper) | ⏸ Deferred | 157P feasibility decision. |
| Image CDN (Cloudinary) | ✅ Foundation (157G), default-off | `js/cloudinary.js` fetch-mode, no secret, raster-only, fail-soft to origin; Storage stays source of truth. Set `ENABLE_CLOUDINARY=true` + cloud name (after 167a raster). |

Legend: ✅ live · 🟡 planned/audited · ⏸ deferred · ❌ not present.
