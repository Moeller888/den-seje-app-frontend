# AVATAR_SYSTEM.md — Den Seje App

_Consolidated overview of the avatar system: philosophy, pipeline, rendering, storage, roadmap._
_Binding design goal: `docs/avatar-vision.md`. Decision register (D-001…D-041) + risks/debt:
`docs/project-state.md`. Locked specs: `docs/adr/`. Master wiring plan: `docs/167a-master-asset-raster-wiring-plan.md`._
_This file is the **map**; it does not restate the decision register or the ADRs — it points to them._
_Accessibility (read-aloud / TTS) is a separate platform-track feature, not avatar-domain — see
[ROADMAP.md](./ROADMAP.md) and [157o-read-aloud.md](./157o-read-aloud.md)._
_Last reviewed: 2026-10-11._

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
  and `R2_MANIFEST` are untouched; **`AVATAR_R2` stayed `false`** _(at the time — superseded: `AVATAR_R2 = true`
  is live, `js/avatar-layers.js:332`)_. **Gate 3 has since STARTED on explicit
  owner command (2026-07-15, WP0 PR #69), and its deterministic layer set is COMPLETE and
  owner-countersigned (integration composite PASS, PR #86/#87)** — accepted candidates: hair z40, eyes z4,
  face z3 (neutral) + blush; decision record = the owner-countersigned Gate-3 worksheets (register
  unchanged through D-058). **Remaining Gate-3 scope: the four D-042 expression variants** (producer tool
  merged PR #88, never run; running it requires a separate owner decision on external image API: vendor +
  Master upload + budget). Nothing promoted. Gate 5 remains open. See `project-state.md` **D-047 … D-058**.
- **R3 shadow stack — head geometry adopted (D-148, 2026-10-02), still default OFF.** The R3 head is now
  deterministic: **G1V3** base geometry + **E2** ear junctions + **K4** contour, with the **P2** head-edit
  regions and the classified pre-gate `pre.transition-uncovered` as the binding prerequisites for any later
  colour attempt (`tools/avatar/build-r3-head-geometry.mjs`, `tools/avatar/recompose-r3-head-geometry.mjs`,
  fixtures in `tools/avatar/fixtures/r3-head-geometry/`). E4 was built as a control, passed every gate and
  was rejected. Nothing is wired into runtime and no runtime or R2 asset is promoted.
- **R3 head colour — no accepted candidate; no call authorised (D-149 … D-156, as of 2026-10-11).** The
  deterministic preparation was accepted (D-149: U1 underpainting, API_EDIT mask, S1 palette gate, S2
  transition). Two one-shot colour calls were authorised and **spent**: D-151 returned HTTP 400 with no
  image (D-152 prepared the `background: "opaque"` fix); D-153 returned HTTP 200 but the candidate was
  **rejected** by the background-leak gate (5,752 of 66,162 head pixels read as background; D-156 later
  showed the "background" is a painted 16 px checkerboard and the model's own silhouette is smaller than
  the requested one). D-154 found deterministic salvage **not viable**; D-155
  concluded **C — no new image call should be authorised yet**; D-156 found the examined overscan/bleed
  design **not geometrically feasible (B)** at the jaw underside and neck rows. The **jaw/neck transition**
  is the central open design question. Call-id `UNASSIGNED`, claim `NONE`, `callsActuallySentSoFar.underlay`
  = **5**, 0 live permissions. Nothing is promoted and R3 stays shadow and default OFF — any further colour
  call needs a new owner decision, call-id and claim identity. See `project-state.md` **D-149 … D-156**.
- **R3 face-neutral — three attempts spent; parts method adopted and extended; first parts sheet: nose rejected, brows and mouth kept for review; first nose attempt technically rejected; no live permission (D-158 … D-168, as of 2026-10-19).**
  D-159 prepared a direct transparent face layer (two complete brows, nose and mouth) and its output checks; the
  separate send adapter `tools/avatar/openai-send-r3-face-neutral-d160.mjs` was merged inactive (PR #322), and D-160
  authorised exactly one attempt. That attempt was sent once (HTTP 200, one image) and was **rejected** by the
  binding AUTO-5 check: the brow tails and the mouth region reach outside the broad envelope. The owner rejected
  the output's geometry (brows too wide, nose and mouth too low). D-161 closed the mandate: D-160 is SPENT and never
  reused, `callsActuallySentSoFar.faceNeutral` = **1** (separate from `underlay` = **5**), 0 live permissions. No
  candidate, nothing promoted, R3 stays shadow and default OFF; a further attempt needs a new owner decision,
  call-id and claim identity. See `project-state.md` **D-158 … D-161**.
  **D-162 (2026-10-18)** adopted guide B (head only, windows; tracked fixture, no H1 bytes) and a sharper prompt as
  the new preparation basis, and authorised **one** further attempt `D-162-r3-face-neutral-guide-b-v1` through the
  separate adapter `tools/avatar/openai-send-r3-face-neutral-d162.mjs`. That attempt was sent once (HTTP 200, one
  image) and was **rejected** by the binding AUTO-5 check: as with D-160, the brows are too large and sit too far
  out, and the nose and mouth sit too low — guide B did not correct size or vertical placement. **D-163 (2026-10-19)**
  closed the mandate: D-162 is SPENT and never reused, `callsActuallySentSoFar.faceNeutral` = **2** (separate from
  `underlay` = **5**), the planned face capacity (2) is used up, 0 live permissions. No candidate, nothing promoted,
  R3 stays shadow and default OFF; a further attempt needs a new owner decision, new capacity, a new call-id and a
  new claim identity. Final approval of any output still needs the approved underlay, eyes and hair.
  **D-164 (2026-10-19)** made the **parts method** the binding production method for `r3-face-neutral`: the image
  model will author separate transparent parts (both brows, nose, mouth) on a fixed 2×2 sheet, and the pinned tool
  `tools/avatar/r3-face-parts-compose.mjs` places them by **owner-approved point anchors**
  (`tools/avatar/fixtures/r3-face-parts/targets-v1.json`; the image-left brow's points are reconstructed design) with
  one uniform scale and a translation per part — no rotation, reflection or deformation; residuals are review-only —
  and assembles one 1024×1536 layer for the existing face slot (runtime unchanged). The raw sheet has its own checks;
  the composed layer keeps D-159's AUTO-1..5 including the broad envelope. No call, adapter or capacity is authorised:
  a parts attempt needs a separate owner decision. See `project-state.md` **D-164**.
  **D-165 (2026-10-19)** authorised **one** attempt for the first parts sheet, `D-165-r3-face-parts-sheet-v1`, through the
  separate adapter `tools/avatar/openai-send-r3-face-parts-d165.mjs`: Northstar as the only image, D-164's frozen prompt
  unchanged, the established model and parameters with size 1024×1024; the returned sheet is checked with D-164's
  RAW-1..5 (never the face envelope), a RAW pass only opens visual review and DRAFT source annotation. UNSPENT, not yet
  attempted, and not a run instruction. Planned face capacity 3; actually sent unchanged (`faceNeutral` = 2,
  `underlay` = 5). See `project-state.md` **D-165**.
  **D-166 (2026-10-19)** recorded that one send (HTTP 200, one 1024×1024 sheet `d3004660…`, RAW-1..5 passed) and closed
  the mandate: D-165 is SPENT and never reused, `callsActuallySentSoFar.faceNeutral` = **3** (`underlay` = **5**), the
  planned face capacity (3) is used up, 0 live permissions. The owner **rejected the nose** (mirrored orientation and a
  skin-coloured fill) and **kept both brows and the mouth for further review** (not a production approval); their six
  source anchors stay DRAFT. No composition, candidate or promotion; R3 stays shadow and default OFF. A new nose needs a
  new owner decision with its own capacity, call-id and claim. See `project-state.md` **D-166**.
  **D-167 (2026-10-19)** extended the parts method: a **partial nose sheet** (`partial-nose-v1`, the same 2×2 layout with
  only the nose cell; RAW-4′ = content in the nose cell and alpha 0 in the other three cells, while a full sheet keeps
  D-164's RAW-1..5) and **composition from several raw sources** through a source manifest (raw file + full SHA-256,
  sheet type, cell, annotation file + hash, approval status per part; `r3-face-parts-compose.mjs --manifest`). The brows
  and the mouth are planned from the untouched D-165 sheet `d3004660…`; D-165's nose is blocked as a source. Their six
  anchors stay DRAFT, and production needs every used anchor owner-APPROVED. D-167 authorised **one** nose attempt
  `D-167-r3-face-parts-nose-v1` (adapter `tools/avatar/openai-send-r3-face-parts-nose-d167.mjs`, Northstar only,
  prompt `ed73b60a…`, 1024×1024): UNSPENT, not yet attempted, not a run instruction; the shading and highlight are
  reviewed on light, medium and dark skin afterwards. Planned face capacity 4 (budget 22–23); actually sent unchanged
  (`faceNeutral` = 3, `underlay` = 5). See `project-state.md` **D-167**.
  **D-168 (2026-10-19)** recorded that one nose send (HTTP 200, one partial sheet `8e309b67…`) and closed the mandate:
  RAW-1..3 passed, **RAW-4′ rejected** five alpha-1 pixels outside the nose cell (RAW-5 not reached), no tolerance was
  added after the fact, and no nose is visually approved (orientation right, but the contour is too thick, the shading
  too large and saturated, the highlight too big, and both read as light spots on dark skin). D-167 is SPENT,
  `callsActuallySentSoFar.faceNeutral` = **4** (`underlay` = **5**), the planned face capacity (4) is used up, 0 live
  permissions. The six brow and mouth anchors stay DRAFT. See `project-state.md` **D-168**.
- **R3 eyes — method adopted; targets approved; eyes-fixed calls A and A2 each sent once and set aside; no live permission; iris call B not authorised (D-169 … D-173, as of 2026-10-20).**
  D-169 fixed how `assets[5]` (eyes-fixed) and `assets[6]` (iris) will be made: two transparent 1536×1024 sheets with
  shared registration. Sheet A carries both eyes without iris (transparent opening inside the ring, highlight and fold
  kept) and is placed with ONE shared uniform scale + translation from four anchors (ring centres Lc/Rc, outer corners
  Lo/Ro); sheet B carries two achromatic irises whose alpha-weighted centroids are mapped onto A's placed ring centres.
  Clarifications U1–U6 are binding (pupil in the iris map, ring in eyes-fixed, iris call sees only Northstar, chroma
  ≤ 12, tint `round(Y/255 × #A34A0F)`); U7 (folds 0–4 px below D-164's brow lines) is an open review item. Checks
  E1–E5, I1–I5 and P1–P6 and every threshold are fixed before any call (alpha 1–15 reported only). Tool
  `tools/avatar/r3-eyes-tool.mjs` + CLI `tools/avatar/r3-eyes-compose.mjs`; targets
  `tools/avatar/fixtures/r3-eyes/targets-eyes-v1.json` are **DRAFT**, so production refuses until the owner approves a
  version. No call-id, claim or adapter; 1 + 1 planned calls inside 22–23, no room for a retake. See `project-state.md`
  **D-169**.
  **D-170 (2026-10-20)** approved D-169's readings unchanged as a new pinned targets version
  `targets-eyes-v2.json` (`b67c7ade…`; v1 stays the DRAFT record) and authorised exactly ONE eyes-fixed call
  `D-170-r3-eyes-fixed-v1` (adapter `tools/avatar/openai-send-r3-eyes-fixed-d170.mjs`, D-169's frozen prompt `aa2c8efc…`,
  Northstar as the only image, 1536×1024, transparent). The output runs only through E1–E5 with the pre-registered
  thresholds; a pass opens only the owner's visual review and DRAFT annotation. UNSPENT, not a run instruction; inside
  `assets[5]`'s one planned call (budget 22–23, no retake); actually sent unchanged (`faceNeutral` = 4, `underlay` = 5).
  The iris call B is not authorised. See `project-state.md` **D-170**.
  **D-171 (2026-10-20)** recorded that one send (HTTP 200, request `req_0663822323e8423e902d36e822d86de7`, one
  1536×1024 sheet `9d26bce1…`) and closed the mandate: E1–E5 passed (alpha 1–15 reported only), the owner's visual review
  is pending, no source annotation is approved and no candidate exists. D-170 is SPENT; `callsActuallySentSoFar.eyesFixed`
  = **1** (`faceNeutral` = 4, `underlay` = 5 unchanged); the planned eyes-fixed capacity is used up; 0 live permissions.
  See `project-state.md` **D-171**.
  **D-172 (2026-10-20, depends on D-171 / PR #354)**: the owner set the D-170 sheet aside (shape off Northstar; the local
  review placement gave s = 0.1939 because the model drew the eyes at about 5.2x, and would fail P1, P2 and P5). One
  further eyes-fixed call `D-172-r3-eyes-fixed-v2` is authorised with a new prompt v2 (`eb51a3ea…`: tall oval rings with
  their top under the lash line, no white band, no inner flick, short outer flick, short fold over the inner half,
  explicit 4x geometry) and two new binding shape checks fixed before the call — F1 no white band, F2 eye spacing
  compatible with the scale range — after D-169's unchanged E1–E5. Planned eyes-fixed capacity 1 -> 2, budget 23–24;
  actually sent unchanged. Not a run instruction. See `project-state.md` **D-172**.
  **D-173 (2026-10-20)** recorded that one A2 send (HTTP 200, request `req_c12adc8346d54f06984a1b5faace2ab8`, one sheet
  `f061484d…`) and closed the mandate: E1–E5 and F1–F2 passed and the white band is gone, but the ring is a wide opaque
  BROWN iris area in the fixed layer (forbidden by the layer split; no binding check measures it), and the local review
  placement with DRAFT anchors fails P5 (outer flick tips). No candidate. `callsActuallySentSoFar.eyesFixed` = **2**
  (`faceNeutral` = 4, `underlay` = 5); the planned eyes-fixed capacity (2) is used up; 0 live permissions. See
  `project-state.md` **D-173**.
- **R3 hair — method adopted; placement targets approved; colour method B planned but not wired to runtime; the first hair call (D-175) sent once and technically rejected at H2; the second hair call (D-177, explicit margin) sent once, H1–H5 passed, no approved anchors, kept for review; registration v2 adopted for future sheets; the third hair call (D-180, the first under v2) sent once, H1–H5 passed, fit points not identifiable under v2, kept for review; no live permission (D-174 … D-181, as of 2026-10-22).**
  **D-174 (2026-10-21)** made one transparent, achromatic 1024×1024 hair sheet the method for `assets[8]` r3-hair-northstar:
  - **Placement and checks.** The sheet is placed with ONE positive uniform scale and a translation (least squares) from
    four owner-approved source anchors on that sheet onto four of the ten approved targets
    (`tools/avatar/fixtures/r3-hair/targets-hair-v1.json`, a byte-identical copy of the v2 review anchors, roles fit
    A1/A5/A7/A8 and check A2/A3/A4/A6/A9/A10, ±3 px). It is checked with functional checks: HP4 crown, HP5 no scalp hole,
    HP6 complete brows with only the image-left brow's ends covered, HP7 no actual coverage of drawn eye content, and
    HP8 ear tops only inside the v2 area. D-159 zone overlap and a broad (+24 px) envelope are reported only.
  - **Source anchors.** These are unknown until a sheet exists.
  - **Colour method B.** A tonal ramp with integer, 8-bit sRGB code values: ink, token.shadow, token.base and light at
    L 0/80/150/255; alpha unchanged; source-over. It is the planned R3 hair colouring (`layerContract`/`zModel` hair
    blend changed from multiply × token). It is **not wired to any runtime** — R2/C2 hair is unchanged — and the hair
    tokens are unchanged.
  - **Other decisions.** The lock under the image-right ear is part of the design; its connection is judged against an
    underlay with a neck. Hair may be made against D-148's geometry before the underlay is approved; final acceptance
    still needs the finished underlay.
  - **Tools and capacity.** Tool `tools/avatar/r3-hair-tool.mjs` + CLI `r3-hair-compose.mjs`, with a DRAFT prompt and an
    annotation schema. One planned call, no reserve, budget 23–24 unchanged. No call-id, claim, adapter or permission;
    R3 stays default OFF. Depends on D-173 (PR #357). See `project-state.md` **D-174**.
  **D-175 (2026-10-21)** authorised exactly ONE hair call, `D-175-r3-hair-northstar-v1`:
  - **Request.** `images/edits` with the locked model `gpt-image-2.5-sunburst-2026-09-08`, `1024x1024`, one transparent
    PNG, and Northstar as the only image. D-174's prompt v1 is frozen unchanged (`43084da7…`).
  - **Adapter.** A separate inactive adapter, `tools/avatar/openai-send-r3-hair-d175.mjs`. Its dry run reads no
    credentials and makes no network call or claim. A send checks the permission inside the send function, needs a
    clean HEAD equal to origin/main, takes an exclusive claim across clones, makes one fetch with no retry, keeps the raw
    response and every image, and runs only H1–H5.
  - **After the call.** Source anchors are annotated as DRAFT and need owner approval. Placement is done only by
    `r3-hair-compose.mjs`.
  - **Budget and permissions.** It uses the one planned hair call with no reserve. The budget stays 23–24 and actual
    use is unchanged. UNSPENT, not yet attempted, and not a run instruction: the send needs a separate execution message
    after merge. Afro, short and headwear are not authorised. See `project-state.md` **D-175**.
  **D-176 (2026-10-21)** recorded that one hair send and closed the mandate:
  - **Send.** HTTP 200, request `req_06b406050c254e07a172b9c0797ea68e`, one 1024×1024 sheet `24bf9f70…`.
  - **Checks.** H1 passed; **H2 rejected**: 3 px with alpha ≥ 16 in the 16 px safety margin at x = 1008, where a lock
    tip reaches into the margin. The image edge does not cut the hair.
    - H2 is the first binding rejection; it does not prove that every other requirement is met.
    - H3–H5 were not evaluated as binding checks, and HP1–HP8 were not run. Separate diagnostic readings stay
      diagnostics.
  - **Visual status.** The hairstyle is recognisable and the greyscale tones are promising. The fringe and temple locks
    deviate, and the ear transitions and placement are not validated, so final acceptance is not possible on this basis.
  - **Result and accounting.** No candidate and no approved source anchors. `callsActuallySentSoFar.hair` = **1**
    (`underlay` = 5, `faceNeutral` = 4, `eyesFixed` = 2); the planned hair capacity (1) is used up and the budget stays
    23–24.
  - **Permissions.** 0 live permissions. Nothing is promoted, and R3 stays default OFF. See `project-state.md` **D-176**.
  **D-177 (2026-10-21)** authorised exactly ONE further hair call, `D-177-r3-hair-northstar-v2`:
  - **Capacity.** One added planned hair call (`assets[8]` 1 → 2, budget 23–24 → 24–25). Actual use is unchanged
    (hair = 1).
  - **Request.** D-175's locked request: `1024x1024`, one transparent PNG, Northstar as the only image.
  - **Prompt v2 (variant B), frozen (`a9304faf…`).** "large" is removed and an explicit transparent margin of at least
    64 px is required on every side. It also asks for one long central lock, one separate lock at each temple, and side
    edges ending above the ears except the lock below the left ear.
  - **Unchanged.** H2's binding border stays 16 px, and no threshold, target or method changes. A margin in the prompt
    is no guarantee.
  - **Adapter.** A separate inactive adapter, `tools/avatar/openai-send-r3-hair-d177.mjs`, derived from the closed D-175
    adapter. Same rules: dry run without credentials, one fetch, no retry, only H1–H5.
  - **Status.** UNSPENT and not a run instruction: the send needs a separate execution message after merge. See
    `project-state.md` **D-177**.
  **D-178 (2026-10-22)** recorded that one hair send and closed the mandate:
  - **Send.** HTTP 200, request `req_29a5a835789e46ca81c62ca3dc31d552`, one 1024×1024 sheet `9d68b54d…`.
  - **Checks.** **H1–H5 passed**, with a margin of 74–149 px. HP1–HP8 were not run and nothing was placed.
  - **Visual status.** The hairstyle is recognisable and the margin is met. The image-right temple lock is merged into a
    long side lock, both side locks hang to about ear height, and the light streaks are weaker. Ear transitions, eye
    coverage and placement are not validated, and there is no visual approval.
  - **Source anchors.** Only a DRAFT annotation exists; no source anchor is approved. A diagnostic uniform fit to the
    targets is 55.5 px (10.7 px without A8) against HP1's 3.0 px.
  - **Disposition: kept for review.** The raw files, claim, event log and DRAFT annotation stay byte for byte and
    untracked, for a later, separate owner decision.
  - **Accounting.** `callsActuallySentSoFar.hair` = **2** (`underlay` = 5, `faceNeutral` = 4, `eyesFixed` = 2); the
    planned hair capacity (2) is used up and the budget stays 24–25.
  - **Permissions.** 0 live permissions. Nothing is promoted, and R3 stays default OFF. See `project-state.md` **D-178**.
  **D-179 (2026-10-22)** adopted registration v2 for FUTURE hair sheets (`hairMethod.methodV2`); v1 stays unchanged for
  the records of D-174 … D-178:
  - **Seat fit.** ONE positive uniform scale + translation on A4 (top of the parting), A9 and A10 (ear-top junctions),
    with D-174's coordinates unchanged (`targets-hair-v2.json`, roles only; A10 stays a reconstructed design point). A
    missing or unidentifiable fit point rejects; there is no reduced fit. Annotations are sheet px, targets master px.
  - **Reading.** An automatic A4 proposal (alpha < 16, flood fill inside the A9–A10 band) is a review aid only. A9/A10
    are read twice under one point definition, the second time with the first reading hidden, both shown with marked
    crops for owner review; a disagreement over 4 sheet px is investigated and re-read, never averaged. A hidden repeat
    guarantees neither correctness nor independence. Source annotations still need owner approval.
  - **Shape checks.** A7 and A8 are mandatory temple locks (HP-LOCK: identified separate lock with tip, two notches and
    evidence, length ≥ 6 px, tip inside its window). HP-FRAG rejects loose hair pieces on the head. HP4's crown zone is
    rows ≤ 194; HP5–HP8 are unchanged.
  - **Thresholds (approved by the owner).** Seat residual ≤ 6.0 master px, |sx/sy − 1| ≤ 0.08 and scale 0.35–0.85, the
    worst case of the documented noise model over the whole range (the study's 5.5 px / 0.07 did not hold at 0.85). For
    future attempts only; never used to reclassify D-177. HP5 is unchanged (no tolerance for pixel-sized holes).
    Simulated rates are model results, not observed failure rates.
  - **Nape lock.** A later, separate authoring part that waits for an underlay with a neck, merged into the same hair
    layer — no new runtime layer.
  - **Prompt v3** is a DRAFT (ear transitions, both temple locks, no lock below the ears) and authorises no call. Tool
    `r3-hair-tool-v2.mjs` + CLI `r3-hair-compose-v2.mjs`. No call, capacity, claim, adapter or promotion; D-177 keeps
    its status and is never approved under v2; R3 stays default OFF. See `project-state.md` **D-179**.
  **D-180 (2026-10-22)** authorised exactly ONE further hair call, the first under registration v2,
  `D-180-r3-hair-northstar-v3`:
  - **Capacity.** One added planned hair call (`assets[8]` 2 → 3, budget 24–25 → 25–26), no reserve. Actual use is
    unchanged (hair = 2).
  - **Request.** The locked request of D-175 and D-177: `1024x1024`, one transparent PNG, Northstar as the only image
    (`3daf32e7…`); targets v2 (`8c3b24e8…`) pinned, never sent.
  - **Prompt v3, frozen** byte for byte as D-179's draft (`5c80c576…`, 1,537 B): readable ear transitions, two separate
    temple locks, a V-shaped parting, no lock below the ears or at the neck, one connected piece, the 64 px margin.
  - **Adapter.** A separate inactive adapter, `tools/avatar/openai-send-r3-hair-d180.mjs`, derived from the closed D-177
    adapter. Same rules: dry run without credentials, one fetch, no retry, only H1–H5 after receipt.
  - **After the call.** D-179's placement and shape checks need a later, owner-APPROVED v2 source annotation and are
    never reported as passed on the raw sheet alone. The annotation is a DRAFT (A4 proposal as a review aid; A9/A10
    read twice, the second time with the first reading hidden); placement with `r3-hair-compose-v2.mjs` needs a
    separate owner approval.
  - **Unchanged.** No D-179 target, threshold or check changes; D-177 keeps its historical status.
  - **Status.** UNSPENT and not a run instruction: the send needs a separate execution message after merge. R3 stays
    default OFF. See `project-state.md` **D-180**.
  **D-181 (2026-10-22)** recorded that one hair send and closed the mandate:
  - **Send.** HTTP 200, request `req_35b74ddf9bf74236ae703007ff0c9a08`, one 1024×1024 sheet `e310112e…`, one fetch, no
    retry; claim, event log, manifest and raw response verified consistent.
  - **Checks.** **H1–H5 passed** (margin 77–220 px, one connected piece). They prove the technical sheet only. D-179's
    placement and shape checks were **not evaluated**; there is no annotation, placement or candidate.
  - **Identifiability (review finding, not an approval).** Under D-179's exact definitions A4 is ambiguous (a rounded,
    tufted arch, no V apex) and A9/A10 are missing (no short lower edge above the ears; the side hair hangs in pointed
    locks). The image-right temple lock is not a separate form. Under D-179 the sheet therefore cannot be annotated: no
    reduced fit, no invented coordinate, no DRAFT annotation.
  - **Halo.** None visible with correct alpha compositing on light or dark; RGB under alpha 0 is invisible.
  - **Disposition: kept for review, not visually approved.** Raw files, claim and event log stay byte for byte and
    untracked.
  - **Accounting.** `callsActuallySentSoFar.hair` = **3** (`underlay` = 5, `faceNeutral` = 4, `eyesFixed` = 2); the
    planned hair capacity (3) is used up and the budget stays 25–26.
  - **Permissions.** 0 live permissions. Nothing is promoted, and R3 stays default OFF. See `project-state.md` **D-181**.

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
- **North Star v2 (DESIGN reference only — D-124, 2026-09-06):**
  `assets/avatar/reference/Northstar Master v2.png` (1024×1536 RGBA, 761,394 B,
  sha256 `3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50`) is the **design and
  authoring reference** new avatar work is drawn against, adopted on the owner's **visual** approval
  with two documented deviations (narrower shoulders, legs ~3.09 pp short of D — see D-124 §5).
  It is a **single flat figure** with body, face, eyes, hair and clothing baked together, while the
  R2 runtime is a **separate-layer** system, so **the two are not interchangeable**.
  It has **no runtime authority**: not in `R2_MANIFEST`, not in the resolver, not loaded by any app page.
  The public website shows it as a static **brand image** only — on the front page (`landing.html`)
  and on `/for-eleven` — a marketing use that grants it no runtime role (**D-150**, `LANDING.md`).
  Deriving R2 layers from it is separate work needing its own owner decision, PR and gates.

**Three roles, deliberately kept apart — do not collapse them:**

| Artefact | Role | Authority |
| --- | --- | --- |
| `assets/avatar-r2/**` (six-layer stack) | what students actually see | **runtime** — unchanged |
| `Northstar Master v2.png` | what new art is designed against | **design/authoring** (D-124) |
| `Northstar Master.png` | historical datum every tool and gate hash-locks against | **geometry of record** (D-032), preserved byte-identical |
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
  - **Phase-2 status (updated 2026-07-23): SHIPPED under opt-in (`AVATAR_R2` still `false`).** The
    decomposed neutral WebP stack (base v2 + face + eyes + iris + blush + hair) is promoted and wired
    (D-057…D-058 sources, D-059/D-061 base fixes, PR-C/PR-D render + blink). The living engines are
    **restored on the raster stack**: blink LIVE (Option-A lids, D-061/D-063), breathing LIVE; dynamic
    expressions remain off (fixed neutral raster face). Robustness: atomic C2 fallback on any failed R2
    asset (D-062); render-scale + blink open/closed goldens (F4/F5). Activation-readiness audit: F1–F5
    all closed (F2 closed by D-065). Pilot: [167a-phase1-pilot-rollout.md](./167a-phase1-pilot-rollout.md).
  - **Expression layers PROMOTED (2026-07-24, D-068): four owner-approved D-042 face layers are tracked
    but DORMANT.** `proud v1 · curious v1 · focused v2 · determined v2` are encoded to WebP under
    `assets/avatar-r2/face/` and registered in `R2_MANIFEST.face` (v3→4), produced by the D-042
    deterministic Master-composite pipeline (donor = brows/nose/mouth only; Master authoritative outside
    the write mask). **No render change:** `faceSrcForR2` is called only with `"neutral"`, so the entries
    are dormant until a separately gated expression-wiring step; `AVATAR_R2` stays `false`. `focused v1` /
    `determined v1` were owner-rejected and not promoted. Worksheet:
    [167a-phase2-gate3-expression-asset-promotion.md](./167a-phase2-gate3-expression-asset-promotion.md).
    Shared R2 raster artefacts (eyes/hair/arms/shoes) are a separate outstanding blocker, not fixed here.
    _(Superseded 2026-07-26 by D-071: the render-scale audit found these artefacts not user-visible at the
    app's real render sizes; owner accepted the residual for a controlled pilot — no longer a blocker. See the
    current-state bullet below.)_
  - **Expression WIRED on R2 (2026-07-25, D-069): the promoted layers now render via a z3 face-layer
    swap, behind opt-in.** The `ExpressionEngine` drives the existing decomposed face layer
    (`[data-c2-layer="face"]`) via `faceSrcForR2` in an R2 mode (`{ r2: true }`) on quiz + avatar + hub;
    blink/breathing unaffected (eye boxes excluded from the expression mask); missing asset → neutral
    (D-062 contract). **`AVATAR_R2` stays `false`** (no activation). Plan:
    [167a-phase3-expression-wiring-plan.md](./167a-phase3-expression-wiring-plan.md). Per-surface
    expression **goldens** are the finalization follow-up (`forceExpression` seam in place).
  - **Shared R2 raster artefacts — render-scale audit CLOSED, owner-accepted for pilot (2026-07-26, D-071).**
    A read-only audit measured the shared raster stack (base/arms/hair/shoes/eyes) **at the app's real render
    sizes** — avatar `180×270`, hub `110×165` (100×150 mobile), quiz `52×78`, `deviceScaleFactor 1`, R2 vs C2
    under identical conditions on the real render paths. Every area is **`NOT_VISIBLE_AT_REAL_SCALE`**; the
    D-061 arm residual is only a tiny anti-aliasing ramp under heavy diagnostic magnification on an artificial
    dark background, and R2 adds no new user-visible edge over C2 (a clear upgrade). **Binding owner decision:
    `OWNER_ACCEPTED_FOR_PILOT_WITH_DOCUMENTED_RASTER_DEBT`** — no alpha cleanup, no source re-cut, no new image
    production; the residual is accepted for a controlled pilot and the shared raster artefacts are **no longer
    a blocker at the existing render sizes**. This is **not** broad R2 activation — **`AVATAR_R2` stays
    `false`.** Re-open the raster track only on a re-audit trigger (new surface wider than ≈180 px, fullscreen/
    hero avatar, higher display scale, a dark theme where edges show at 100 %, a base/hair/shoe asset change,
    observed fringe in normal pilot use, or a device-pixel/render-strategy change). Small-size expression
    legibility is a **separate** concern, not this raster-fringe track. Register: D-071 in `project-state.md`.
    _The block below is the earlier Gate-progression history and is kept for the record — it is NOT current status._
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
    (build tooling, gitignored binary, zero deps). ~~Gates 2, 3, 5 remain open.~~
    **[Gate 2 CLOSED 2026-07-14, D-056 — see below. Gates 3 and 5 remain open.]**
  - **⏳ HISTORICAL — SUPERSEDED BY D-056.** _Superseded by D-056: Gate 2 SATISFIED / CLOSED on 2026-07-14.
    The paragraph below is kept for the record — it is **NOT current status**._
    **Base RECOVERY (updated 2026-07-05, D-043):** an interim iter7 base briefly held a Gate-2 CONDITIONAL
    PASS but was **visually INVALIDATED** (structural **bust/chest-plate** artifact); that pass is
    **withdrawn** and the iter4→iter7 line is invalidated. **Gate 2 was REOPENED / under recovery** _(at the
    time — now closed, D-056)_ with a
    **candidate registered base-layer source** (REVISED 2026-07-06; **not a new Master** — the frozen
    `Northstar Master.png` remains the canonical identity/style/coordinate datum, **D-032 preserved, not
    superseded**) — `recovery-base-v1-blankface.png` (`assets/avatar/reference/`), which fixes the anatomy
    (bald scalp, ears, head→neck→collar, no bust-plate, blank face) and registers to the Master by a
    deterministic **(+25 x, +285 y)** translation (body IoU ≈ 0.9921; ≈ 84.3 % pixels identical) but is
    **not passed** (needs (+25,+285) registration + feet-completion + outfit neutralization + a fresh
    164B.3). **Gate 3 is PAUSED** _(at the time — since started 2026-07-15, see §2 status)_; the
    hair/eyes/face **tooling** stays useful but its outputs are **not
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
    `AVATAR_R2` stays `false`, Gate 3 stayed PAUSED** _(at the time — the explicit owner start command has
    since been given, 2026-07-15, WP0 PR #69)_. Register: `project-state.md` (**D-047 … D-056**).
  - **📌 TRACKED SOURCE ASSET (D-057, 2026-07-14) — SOURCE-ONLY, NOT RUNTIME ACTIVE.** The Gate-2 base is now
    preserved as a durable, tracked source at **`assets/avatar/reference/neutral-base-v1-gate2-d053.png`**.
    **Integrity lock — SHA-256 `2CB93EE00BE89D16D1B1E9CAE9781B596F931A52FD6F667238C9E9BDA38AFE4B`**
    (1024×1536, alpha preserved, 331,506 bytes; **byte-identical copy**). The gitignored review file is still
    kept, but **this tracked file is now the durable source copy**. **NOT promoted to `assets/avatar-r2` ·
    `R2_MANIFEST` unchanged · `AVATAR_R2` stays `false` · Gate 3 stayed PAUSED / NOT STARTED _(at the
    time — since started 2026-07-15)_ · `Northstar Master.png` remains the canonical datum (D-032).**
  - **📌 TRACKED PROTECT CONTRACT (D-058, 2026-07-14) — SOURCE-ONLY, NOT RUNTIME ACTIVE.** The active
    Gate-2 protect-mask is now also preserved as a tracked source-only contract at
    **`assets/avatar/reference/gate2-protect-mask-v2.1.png`** — **SHA-256
    `302324B7B9C0ACB124C982294D1B85FEB9EDBF467AAAD0F0A52B2C7E96F692F5`**, **byte-identical** to the
    owner-approved D-049 `protect-mask-v2.1` (the gitignored original is preserved untouched). **No
    change to the mask's geometry or semantics** — not a new mask version, no new writable regions.
    **Source-only, not runtime. Gate 3 stayed PAUSED / NOT STARTED _(at the time — since started
    2026-07-15)_ · `AVATAR_R2` stays `false`.**

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
