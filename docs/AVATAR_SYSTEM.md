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
- **R3 head underlay — deterministic head/neck drawing without H1 pixels; one review candidate, not production-approved (D-186, as of 2026-10-22).**
  **D-186 (2026-10-22)** chose **method A**: a deterministic drawing with no image call.
  - **Sources.** G1V3 + E2 (rows ≤ 424) and K4 are kept unchanged, and U1 is used only to verify the geometry and read
    the medium skin colour.
  - **Neck.** The neck is self-drawn as a separate geometry **N1** (rows 425–479; choice b), so the asset contains
    **no H1 pixels**.
  - **Never used:** H1, `r3-head-g1v3-v1.png` (its rows 425–445 are H1-derived), Northstar pixels and paint from
    rejected calls.
  - **Method.** Generator `tools/avatar/r3-underlay-headneck.mjs` plus the spec and manifest in
    `tools/avatar/fixtures/r3-underlay-headneck/`.
    - **Layers.** An achromatic luminance layer times a skin token with warm shadows; the medium tone comes first and
      other tones follow from the same luminance. Hair ramp B is not used for skin.
    - **Ink.** K4 plus the drawn chin, neck and ear lines.
    - **Ears.** An inner rim with a helix fold, a C-shaped concha and the ear's front line, all drawn inside the
      existing ear silhouettes.
    - **Jaw and chin.** The chin leaves the jaw corner at the jaw's own slope, closes horizontally at y 442, and has a
      cast shadow under it.
    - **Rebuild.** Deterministic, and verified byte-identical in a separate directory.
  - **Checks.**
    - UN-HEAD, UN-ATTACH (the 424/425 step 4 ≤ the geometry's own 423/424 step 4), UN-SHAPE, UN-EXTENT and
      UN-LUMINANCE pass.
    - `pre.join-continuity` and `pre.transition-silhouette` are **NOT APPLICABLE**, because both compare against
      H1's rows. They are not reported as passed, and their bounds and earlier results are unchanged.
  - **Whole-head review.** The candidate was composed locally with D-185's `r3-hair-hybrid-v2`, the D-165 brows and
    mouth (DRAFT), the nose placeholder and eyes v5 (DRAFT).
    - HP4–HP8 and HP-FRAG pass on the new pixels (HP6/HP7 run locally and are NOT RUN in CI).
    - The hair covers no chin or neck pixel.
    - The nape lock is not introduced.
  - **D-185 correction.** G1V3/U1 already had ear silhouettes; what was missing was the drawn ear detail and a neck.
    D-185's row stays verbatim.
  - **Not production-approved.** The owner's visual review is pending. Only the medium tone exists, the face parts and
    eyes are provisional, the nape lock and the body join are not part of this asset, and nothing is promoted.
    R3 stays default OFF. See `project-state.md` **D-186**.
- **R3 head review pack — one versioned, reproducible review of the whole head; nothing approved (D-187, as of 2026-10-22).**
  **D-187 (2026-10-22)** approves the review **workflow**, not the parts' look.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --out <empty dir> [--render-eyes]` does the following from a
    clean checkout:
    - rebuilds every layer;
    - composes the head in the zModel order base < face < iris < eyes-fixed < hair;
    - runs the checks;
    - writes the review images, `report.html` and `report.json`.

    Two runs in separate directories were byte-identical. `--render-eyes` re-renders the v5 eye SVGs with Chromium
    pixel-identically; the unit CI has no browser, so it verifies the pinned renders.
  - **Parts.**
    - D-186 head/neck;
    - D-185 hybrid hair with a self-drawn **nape lock** (DRAFT; image-right only, hanging from behind the ear and jaw,
      clipped behind the head, merged under the hair in the same hair layer — no new runtime layer);
    - the D-165 brows and mouth (DRAFT anchors) and the authored nose (DESIGNFORSLAG) on the approved D-164 targets;
    - eyes prototype v5 with its separate iris layer.
  - **Sources.** All sources are pinned in `tools/avatar/fixtures/r3-review-pack/`. They are stored byte-exact, and no
    H1 or Northstar pixels are used.
  - **Review mode.** Only the explicit review mode `review-pack` may compose these DRAFT parts. The production compose
    paths keep refusing them (tested), and every part keeps its status.
  - **Assembly fix.** A 22 px enclosed gap between the hair's opening edge and the head silhouette at the image-right
    temple was filled in the hair layer, documented, with FIG-HOLES 0.
  - **Checks.** HP4–HP8 and HP-FRAG pass on the actual review pixels. HP6 and HP7 now run in CI against the pinned review
    parts, so their results hold for this pack only. The H1 gates stay NOT APPLICABLE.
  - **Colours.** The main result uses medium skin. Light and dark are shown as FORSLAG, the brown iris is adopted, blue
    and green are review tints, and all eight hair colours go through ramp B.
  - **Open visual points.**
    - The ears are smaller and end higher than Northstar's.
    - The N1 neck flares at the bottom.
    - The hair is darker and cooler and lacks the side locks below the left ear.
    - The nape lock is on one side only.
    - There is no warm skin shadow under the fringe.
    - The nose is a single stroke.
  - **Later dependency.** The clothing/body join below the neck is a later, separate dependency. Nothing is promoted, the
    active renderer is unchanged, no body is coupled, and R3 stays default OFF. See `project-state.md` **D-187**.
- **R3 review variant "northstar-layers" — Northstar v2's own pixels in separate layers, beside D-187; nothing approved (D-188, as of 2026-10-22).**
  **D-188 (2026-10-22)** lets Northstar v2's pixels be a direct source for this **separate review variant only**. The
  original geometry, colours, sideburns and painted details are kept. The H1 ban is unchanged. Earlier decisions and every
  candidate's status are kept, and D-187 stays the review tool's default.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-layers --out <empty dir>`. Use
    `--variant both` to write `d187/` and `northstar-layers/` side by side. The generator is
    `tools/avatar/r3-northstar-layers.mjs`.
  - **Source.** The tracked `Northstar Master v2.png`, sha256 `3daf32e7…ff50`. Any other bytes are refused.
  - **Tracked files.** `tools/avatar/fixtures/r3-northstar-layers/` (stored binary) holds the spec, the nine compositing
    layers and the six masks as byte copies of the local prototype. `manifest-v1.json` records the move and the
    prototype's file hashes, and the tests prove the generator rebuilds each layer and mask pixel for pixel.
  - **Not tracked, rebuilt on demand.**
    - The comparison-only body: Northstar's body, rebuilt only for the comparison and never an R3 body asset.
    - The `face` helper export: never composed over the four parts.
    - The editable `.ora`: rebuilt deterministically for Krita and GIMP.
  - **Layer order.**
    - skin (with ears and neck);
    - hair shadow;
    - left brow, right brow;
    - nose;
    - mouth;
    - iris;
    - fixed eye parts;
    - hair.
  - **Composite.** The default uses the original colours. Of 391,180 visible pixels, 377,143 are bit-identical and the
    largest difference is 5 out of 255, in both colour and alpha.
    - Most remaining differences are 1–2 levels: the original's alpha is 253–254, and two stacked layers give 255.
    - The largest differences sit on the face contour at the sideburns, which is deliberately in both the skin and hair
      layers.
  - **Not applicable.** These checks presuppose G1V3/E2/K4, R3's hair targets, the D-159 eye envelope or an
    achromatic iris, so they are reported NOT APPLICABLE with the reason: D-186 underlay, D-185 hair, HP4–HP8,
    nape lock, face fits and eye envelope.
  - **Open areas.**
    - Missing:
      - cranium, forehead and head contour under the hair;
      - the hidden brow end and the hair lock's edge over it;
      - the ear tops under the sideburns;
      - the sclera behind the iris.
    - Reconstructed, as a smooth fill: the skin under the features, the iris under the highlight, and the lit skin under
      the hair shadow.
    - Limits:
      - the original line art carries warm rims, which show when the skin under the features changes;
      - the brows do not follow a hair recolouring;
      - 83 opaque light halo pixels sit in the brow, nose and mouth layers.
  - **OKLab recolourings.** The ones in the report are proposals only.
  - **Not evidence.** A good default image does not show that other hairstyles, skin tones or expressions work.
  - **Promotion.** The variant is never promotable by passing checks. See `project-state.md` **D-188**.
- **R3 review variant "northstar-head" — reconstructed head and cleaned feature edges on the D-188 baseline; nothing approved (D-189, as of 2026-10-22).**
  **D-189 (2026-10-22)** builds a second Northstar review variant. The D-188 variant stays byte-identical and is the
  baseline, read through its own pins.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-head --out <empty dir>`. The generator
    is `tools/avatar/r3-northstar-head.mjs`, and the files live in `tools/avatar/fixtures/r3-northstar-head/`
    (spec, seven derived layers, six masks and a manifest, stored binary).
  - **Reconstructed cranium.** The cranium is design, not observed pixels.
    - It is one round head under the hair: an ellipse arc about x = 510 that meets the visible face contour at
      (383, 291) and (637, 291).
    - It is painted as flat lit skin, like Northstar's own face, with a 20 px harmonic transition from the visible skin.
    - It is its own layer under the unchanged skin.
    - Two small ear-root wedges that the sideburns hid are filled and closed with a short stroke.
    - The shape is not forced into G1V3/E2.
    - The hair's cast shadow stays its own layer, so the bare head carries no shadow of the old hairstyle.
  - **Cleaned feature edges.**
    - Brow, nose and mouth edges are re-projected onto the line between the local skin and the nearest core colour of
      the same feature.
    - The light halo goes, warm rims become ink, and the nose shadow and white highlights keep their colour.
    - The hair outline that D-188 had duplicated into the left brow leaves the brow.
    - The opaque light pixels drop from 83 to 0. The eyes are not changed.
  - **Hair-edge residue.** 15 dark pixels the D-188 skin kept next to the hair move to this variant's hair layer.
  - **Measured.**
    - The cranium under the hair shifts the default composite by at most 2/255, because the hair's alpha is 253–254.
    - The feature edges change 1,676 pixels, with a maximum of 46/255 where the halo was brightest.
    - 0 pixels changed under semi-transparent hair edges.
    - 0 pixels changed outside the explicit edit masks, per layer and in the composite.
  - **Open areas.**
    - the hidden brow end;
    - the sclera behind the iris;
    - new expressions;
    - the eye lash edge;
    - the cranium's shape as a design choice;
    - faint tone patches on the forehead.
  - **Illustration.** The report shows an illustrative coverage mask of a shorter haircut. It is not a hairstyle.
  - **Promotion.** The variant is never promotable by passing checks. See `project-state.md` **D-189**.
- **R3 review variant "northstar-brow" — the image-left brow completed by the D-158 mirroring; nothing approved (D-190, as of 2026-10-22).**
  **D-190 (2026-10-22)** completes the brow that the hair lock hid. The D-189 variant is the unchanged baseline.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-brow --out <empty dir>`. The generator is
    `tools/avatar/r3-northstar-brow.mjs`, and the files live in `tools/avatar/fixtures/r3-northstar-brow/`.
  - **Method (D-158).** The visible image-right brow is mirrored about the measured midline x = 509.79, the midpoint
    of the eye components' centroids.
    - The fit is lexicographic: no pixel on safe skin, then the highest IoU where the brow is observable, then the
      smallest deviation.
    - The result is translation only, (-3, +4), with 0 px on safe skin. It is D-158's
      own place within 1 px.
  - **Completion.** The mirror fills only the area the hair hid, and only where the observed brow had no pixel. Every
    observed pixel is kept, and 496 px are reconstructed.
  - **With hair.** The composite changes by at most 2/255, all under opaque hair.
  - **Open areas.**
    - small observed hair-edge remnants at the brow's upper right;
    - the mirrored light direction in the filled part;
    - the sclera behind the iris;
    - new expressions;
    - the D-158 (h) judgements.
  - **Promotion.** The variant is never promotable by passing checks. See `project-state.md` **D-190**.
- **R3 review variant "northstar-hairstyles" — the reconstructed areas finished and reviewed with alternative hairstyles; nothing approved (D-191, as of 2026-10-22).**
  **D-191 (2026-10-22)** works on the unchanged D-190 baseline. D-189 and D-190 stay as historical variants.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-hairstyles --out <empty dir>`. The
    generator is `tools/avatar/r3-northstar-hairstyles.mjs`, and the files live in
    `tools/avatar/fixtures/r3-northstar-hairstyles/`.
  - **D-190 correction.** The 32 hair-lock remnant pixels at the brow move from the brow to the
    Northstar hair, selected by a geometric mask. The D-190 mirror fills under the opaque ones.
  - **Bare head.**
    - 74 sideburn-tip pixels move from the skin to the hair, and the skin under them is refilled.
    - 3966 lit-skin pixels under the hair's cast shadow are refitted with the cranium as a boundary.
    - Northstar's own visible light patches are kept.
  - **Default preserved.** With Northstar's hair the composite changes by at most 4/255, with
    0 px outside the masks.
  - **Short.** R2's short is a review derivative. Its webp is untouched and its native decode is pinned; it is placed
    on the v2 head by one similarity. Both brows stay free, but its edges are softer than Northstar's line art.
  - **Afro.** R2's afro is UNSUITABLE:
    - inside the canvas it covers the brows;
    - the placement that clears the brows clips 50 px off the top;
    - a hairline mask cuts hard edges.
  - **Hair shadow.** It follows Northstar's hair only.
  - **Open areas.**
    - an afro drawn for v2;
    - the sclera behind the iris;
    - expressions.
  - **Promotion.** Nothing is promotable by passing checks. See `project-state.md` **D-191**.
- **R3 review derivative "northstar-afro" — an afro for the Northstar v2 head from the full-resolution R2 original; nothing approved (D-192, as of 2026-10-23).**
  **D-192 (2026-10-23)** works on the unchanged D-191 head. D-191 and its UNSUITABLE afro derivative stay unchanged.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-afro --out <empty dir>`. The generator is
    `tools/avatar/r3-northstar-afro.mjs`, and the files live in `tools/avatar/fixtures/r3-northstar-afro/`.
  - **Source.** `tools/avatar/fixtures/r2-hair/afro-cleaned.png` (D-113), read only. It is a genuine 1024×1536 original;
    the R2 webp is its ÷2 downscale.
  - **Authoring.**
    - One placement at scale 0.86, a downscale, so the painted curls keep their detail.
    - A smooth radial shift (max 28 px) moves the afro's own hairline above the brows. Nothing is cut.
    - 107 px of new back hair close the D-191 head's slit at the ear.
    - No cast shadow.
  - **Measured.**
    - Brows covered: 0 px.
    - Cranium beyond the 8 px scallop band: fully covered. The 8 px band is a review criterion chosen after seeing the
      data (uncovered cranium at most 6 px out), not an independently validated production threshold.
    - 0 px near the canvas edge; top margin 8 px.
    - One component; scallops kept.
  - **Default preserved.** All D-191 situations compose pixel-identically.
  - **Limits.**
    - Compressed curls at the hairline.
    - Ears mostly covered.
    - A few dark D-191 outline pixels under the right ear lobe.
    - No cast shadow.
  - **Finding.** D-191's bald head has a 1–2 px slit between ear and face, visible in its bald and short views.
  - **Promotion.** Nothing is promotable by passing checks. See `project-state.md` **D-192**.
- **R3 review variant "northstar-earfix-quiz" — the shared head's ear slit closed and a reproducible quiz-view review; nothing approved (D-193, as of 2026-10-23).**
  **D-193 (2026-10-23)** is a new version of the shared head underlay. D-191 and D-192 stay unchanged as historical results.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-earfix-quiz --out <empty dir>` (needs
    Playwright's Chromium). The generator is `tools/avatar/r3-northstar-earfix.mjs`; the quiz harness is
    `tools/avatar/r3-review-quiz.mjs`. The files live in `tools/avatar/fixtures/r3-northstar-earfix/` and
    `tools/avatar/fixtures/r3-quiz-review/`.
  - **Ear fix.**
    - 100 px (50 per ear): narrow horizontal gaps between ear and face, plus two pinholes they close in.
    - Reconstructed into the skin layer only.
    - 0 px change outside the mask in bald, short and Northstar.
    - The D-192 afro composes without its back-hair fill, so the fill is not laid twice.
  - **Quiz review.**
    - The page's own avatar-box rules and the whole theme file.
    - 52×78 CSS px at DPR 1/2/3; default, pearl, inferno and forest.
    - Northstar, short and afro in black and blonde.
    - One canvas, placement and scale for every hairstyle.
    - The body is missing, so the final composition is not validated.
  - **Backdrop proposal.**
    - One discreet, theme-tinted ellipse behind the head, in the harness only.
    - It trades dark hair against light hair on the dark themes. All hair edges are dark.
    - The only backdrop that helps every hairstyle is a large pale plate, which is not discreet.
    - **Recommendation:** do not adopt it now; revisit the box with the body.
  - **Production.** The active quiz, theme colours and hair assets are unchanged.
  - **Open.**
    - The owner's visual judgement.
    - The composition with the body.
    - Dark hair on dark themes.
    - Five dark specks outside the head below the ears (reported).
  - **Promotion.** Nothing is promotable by passing checks. See `project-state.md` **D-193**.
- **R3 review composition "northstar-figure" — the R3 head on Northstar v2's own body and clothes as a reference body; nothing approved (D-194, as of 2026-10-23).**
  **D-194 (2026-10-23)** works on the unchanged D-193 head candidates.
  - **Entrypoint.** `node tools/avatar/r3-review-pack.mjs --variant northstar-figure --out <empty dir>` (needs Playwright's
    Chromium). The generator is `tools/avatar/r3-northstar-figure.mjs`; the views are `tools/avatar/r3-review-figure-views.mjs`.
    The files live in `tools/avatar/fixtures/r3-northstar-figure/`.
  - **Body.**
    - Master coordinates, no transform: the master minus the bald head below y 440.
    - Where the head is absent, the master's own pixels are used.
    - Under the opaque head the body is empty, so there is no second neck or collar.
    - Under the head's antialiased edge the body is the exact remainder (the `neck-seam` mask, 163 px).
    - With Northstar's hair the figure is identical to the master below the seam.
  - **Order.** Body, then D-193's head order, then the hair.
  - **Same figure.** Size and head place are the same for every hairstyle.
  - **Residue.** 11 hair-lock pixels below the right ear move from the skin layer to the hair layer.
  - **Views.**
    - quiz 52×78 at DPR 1/2/3 in four themes;
    - hub 110×165, collection 120×180, avatar page 180×270 and shop 130×152 at DPR 2.
    - Each is rendered with the page's own rules and the current background.
    - The afro is not clipped anywhere.
    - In the quiz the head is about 16 CSS px wide, so the face is small at DPR 1.
  - **Framing proposal.**
    - One shared scale of 1.6 about the top centre, in the harness only.
    - The quiz head grows to about 26 px and the afro keeps about 5 % side room.
    - The figure is cut at the hips.
  - **Limit.** Northstar's body and clothes are no evidence that other body shapes or clothing layers fit. They are not an R3
    asset.
  - **Promotion.** Nothing is promotable by passing checks. See `project-state.md` **D-194**.
- **Shared upper-body framing 1.5× behind a flag — quiz and hub; OFF (D-195, as of 2026-10-23).**
  - **Flag.** `AVATAR_FRAMING_UPPER = false` and `isAvatarFramingUpper()` live in `js/avatar-layers.js`. A browser can opt
    in per device only with `localStorage.avatar_framing = "upper"`.
  - **Class.** `app.js` (quiz `#avatar-display`) and `hub.html` (`.profile-avatar`) toggle `avatar-framing-upper` on the
    avatar root before mounting.
  - **Deploy skew.** Both read the flag through a namespace import (`import * as avatarLayersModule`). An older cached
    `avatar-layers.js` without the new exports therefore leaves the framing off; a named import would be a module
    SyntaxError that stops the whole quiz.
  - **CSS, only under the class.**
    - The root clips.
    - Every layer box is `left: -25%; width/height: 150%`: one factor for all layers, hairstyles and render paths.
    - The inline-positioned blink layer gets the same values with `!important`.
  - **Why 1.5 rather than 1.6.** At 1.6 the live R2 afro keeps about 1 CSS px (quiz) and 0.5 px (hub) of side room; at
    1.5 it keeps about 2.5 px and 3.5 px. The head is only about 6 % smaller.
  - **Verified** with `tools/avatar/verify-framing-d195.mjs` (the real renderer in Chromium).
    - Every layer and lid registers to within 0.006 px.
    - With the flag off the view is identical to `origin/main`; only the self-animating aura differs from itself.
    - No other localStorage value enables the framing.
  - **Losses at 1.5.**
    - Hair and headwear: none.
    - Body: cut below the hips, as intended.
    - **Unintended:** about 17 % of an aura in the quiz; wings about 66–72 %; capes about 50–61 %.
  - **Status.** Off by default. Enabling it needs a separate owner decision that weighs the wide back layers. See
    `project-state.md` **D-195**.
- **Equipment-adaptive framing — quiz and hub; still behind the flag, OFF (D-196, as of 2026-10-24).**
  - **Rule.** `avatarFramingOnFor(equippedSlots)` returns true only when the flag (or `localStorage.avatar_framing = "upper"`) is
    on AND no item sits in `AVATAR_FRAMING_WIDE_SLOTS = ["back"]`.
  - **Why the back slot.** Wings and capes are drawn across the whole canvas width or down to the feet, so any zoom cuts them.
  - **What changes.**
    - With a back item, the figure keeps today's whole-canvas view: nothing is lost, and the face is not enlarged.
    - Otherwise it is framed at 1.5×. The face grows 1.5× (R3 quiz head about 16 → 25 CSS px), and hair and headwear lose
      nothing.
    - An aura alone keeps the framing; only its outermost glow at the sides is cut.
  - **Where.** `app.js` and `hub.html` decide from the cosmetics actually mounted, right before `mountC2Avatar`, through the
    namespace guard.
  - **No per-layer changes.** The figure always scales as one; no layer is scaled or moved on its own.
  - **Verified.** `tools/avatar/verify-framing-d195.mjs` covers every layer, lid and tier and checks the flag-off baseline.
  - **Status.** Off by default; enabling it needs a separate owner decision. See `project-state.md` **D-196**.
- **Northstar wardrobe in the renderer — D-242: flag `AVATAR_NORTHSTAR_WARDROBE = false`, local opt-in only; not activated for
  pupils; no calls.**
  - **Path.** `mountC2Avatar` tries the C figure first (quiz, hub, avatar; aura/back only), composing it once at 1024×1536 with
    the pipeline's own arithmetic (`northstarCompose`). Any load failure or other equipped slot → today's avatar, whole.
  - **Assets.** 31 lossless WebP layers in `assets/avatar-northstar/` (owner exception to D-127 §2, public; `manifest.json`).
    All 19 K outfits are byte-identical to the pipeline. With the flag off, 54 browser pages are pixel-identical to main.
  - **Opt-in.** `avatar.html?northstar=1`, then a K outfit in the panel (localStorage only).
  - **Limits.** No blink and neutral expression only; no hair/skin/eye variation; no head items. See `docs/decisions/D-242.md`.
- **Northstar assistant review — D-240: method d240 (the assistant's review, not the owner's approval; no calls).**
  - **Fixed.** The brown ankle boot's arch (K16, K18, K19): what a closed shoe hides is taken from the picture's own opaque
    pixels joined to the shoe (`coverFromPicture`, 40 px). Nothing is painted; open footwear is untouched; the other five
    shoes are byte-identical.
  - **Correct and kept.** K17's ankle triangle and the beige sneakers' collar wedge are C's own skin with the picture's
    shadow. The K01–K03 hem step is not a fault. All K01–K19 await the owner. See `docs/decisions/D-240.md`.
- **Northstar targeted correction — D-239: method d239 (development, not a validation; no calls).**
  - **Corrected diagnoses.** N2's cut was a remnant of the limb's contour below the cuff, removed in the extraction. MF-2 is
    the top's open hip corner, not the trousers. MF-1 was shaded-skin antialias (corrected) plus a real gap between hem and
    shoe (now checked).
  - **Outfit check d239.** Partial-alpha edges are the item's own. COMBO-5 catches skin between a hem and a shoe; COMBO-6
    catches a notch where C's base is left uncovered at the waist. SC-W4 now judges lines by contrast. Manual findings live in
    the review register (F-013 … F-019).
  - **Result.** Every status change was reviewed: 0 false rejections, 0 regressions. Ready (technically OK, no open finding):
    15/48 in D-235, 6/40 in D-228, 0/18 in the pilot — only outfits with the corner-covering tops N1 and V1. Byte identity is
    verified for the pilot only. See `docs/decisions/D-239.md`.
- **Northstar independent validation results — D-238: six new calls sent, decision: targeted correction.**
  - **Result.** Under d232 as frozen, all six new items are technically OK (T 6/6) and 30 of 48 planned outfits pass (K 30;
    missing and rejected stay in the denominator). There are two manual findings, both in the black trousers (skin-coloured
    pieces along the hem; a notch at the hips). Contract v2 is met in full by none (C 0/6).
  - **Rule.** The pre-registered rule gives a targeted correction as a new method version, then a new small independent test.
    The candidates are COMBO-1d without the limb exit (all 12 N2 outfits), dark-outline and hem-antialias extraction, and
    SC-W4 on black fabric. See `docs/decisions/D-238.md`.
- **Northstar independent validation — D-235: six new frozen calls authorised, executed and closed by D-238.**
  - **Why.** D-232's 38/40 re-evaluated pictures that shaped the method. D-235 tests d232 and seam-contract-v2 on six new
    designs: two tops, two bottoms and two closed shoes (three light, skin-near; three dark).
  - **Frozen.** Method d232 is pinned with its definition and code. Image 2 is the v2 sheet; the shoe sheet is D-228's. The
    prompts are D-207's template plus v2's (= v1's) instructions; only the garments are new. A 48-outfit matrix with old d232-OK
    items counts missing and rejected items in the denominator.
  - **Acceptance.** Five axes are kept apart (technical, contract, combination fit, manual findings, visual quality). The
    pre-registered decision is a larger batch, a targeted correction, or a fundamental method change. Adapter:
    `openai-send-northstar-independent-d235.mjs`. Sending needs the owner's separate instruction. See
    `docs/decisions/D-235.md`.
- **Northstar limits corrected — D-232: method d232 and seam-contract-v2 (no calls).**
  - **Limb exit.** A contour line hanging below a hem or a cuff leaves the item, and FIT-6v2 reports a limb leaving a garment at
    its end. D-231's V2 cuff "pass" was the hanging contour.
  - **Colours.** A skin shadow shifts the hue no more than C's own shading, so orange fabric is fabric. G-2 compares chroma, so
    dark olive is not grey.
  - **Hip lanes.** These are re-derived from the outfit check: top ≥ + 6, bottoms ≤ + 6 (v1: + 8 / + 3).
  - **Result.** The pilot's statuses are unchanged; three khaki + boots outfits now pass the check. The D-228 matrix has
    11/11 items technically OK and 38/40 outfits pass (only V1 + V5, as predicted). D-231's verdict stands.

    See `docs/decisions/D-232.md`.
- **Northstar seam validation results — D-231: six calls sent, verdict partial.**
  - **Sent.** V1 … V6 once each, with no stop. D-228 is closed and no further calls follow. Method d225 on the 40-outfit
    matrix; two runs were byte-identical.
  - **Result.** Technically OK: the hip tee V1 (the first top to cover the hip corners) and the ankle boot V6. V2–V5 are
    rejected on FIT-6v2 strips at a hem or cuff corner. Q1 0/6, Q2 1/2, Q3 8/8 available outfits; the frozen rule gives partial.
  - **Reading.** The seams between categories held: one seam fault in 40 diagnostic outfits (V1 + V5 at the hip, which
    SC-W6 predicts). What blocks now:
    - edge corners a few px narrower than C's limbs;
    - extraction of skin-like and dark colours;
    - hip width and long hems; SC-W6 is stricter than needed.

    See `docs/decisions/D-231.md`.
- **Northstar seam validation — D-228: six frozen calls authorised (executed and closed by D-231).**
  - **Request.** One call per item of D-225's plan (V1 … V6), in order, with the model of D-207 and D-218 unchanged. Image 1 is
    C. Image 2 is the category's C-derived reference sheet (seam zones as colour marks, `--seam-reference`, local only). Each
    frozen prompt is D-207's template plus the contract's `modelDraws` plus one sentence explaining the sheet.
  - **Adapter.** `openai-send-northstar-seam-d228.mjs`: one-shot claims and at most 6 calls, with no reserve or retry. Order
    and stop rules are structural: credit, uncertain dispatch, request shape, format, a second moderation block, or a stop file.
  - **Acceptance.** Frozen before sending: technical, contract, combination fit and visual quality are reported apart, with a
    pre-registered verdict (Q1–Q3) and the 40-outfit reuse matrix. Sending needs the owner's separate instruction. See
    `docs/decisions/D-228.md`.
- **Northstar seam contract — D-225: seam-contract-v1 between categories on C (no calls).**
  - **Stations.** Tops end on C's waist line or at a hip station W + [18, 48], cover the hip corners and overhang the hips.
    Bottoms start at C's base shorts, draw no line between W + 12 and W + 54, and are cropped (hem ≤ A − 68) or full
    (A + [6, 12], square, leg ± 10). Shoes cover up to the ankle, with no shaft above A − 56, within leg ± 8. Long sleeves end in
    the cuff band.
  - **Tools.** `contractCheck`, `seamLines`, and TEMPLATE items (`northstar-seam-templates.mjs`). The outfit check's double
    contour now covers 3 px gaps (revision d225); method d225.
  - **Evidence.** 12 of 12 compliant template outfits pass on the stand-in and on C. Of the pilot items only the sneakers comply.
    The contract explains F-006, F-007 and F-010 to F-012.
  - **Next.** A six-item validation plan; authorised as six frozen calls by D-228 (not executed). See `docs/decisions/D-225.md`.
- **Northstar outfits on C — D-223: outfit check at the seams, method d223, findings register (no calls).**
  - **Outfit check.** `outfitCheck` covers background through a seam between two categories, holes, missing overlap, a cut in one
    garment, double contours and order; corners are only reported. It does not require C's base silhouette.
  - **Fix.** The tee + khaki hip slit came from two shared extraction rules (the top's leftover base rim; the bottoms' outline over
    another base). d223 fixes both without masks or painting.
  - **Register.** `findings-register.json` holds 12 findings; an open one keeps an item or outfit from being ready.
  - **Result.** 10 of 18 outfits are technically OK, 3 more are OK with an open finding, and 5 are rejected (khaki + boots and
    sweater + skirt seams). Two runs were byte-identical.
  - See `project-state.md` **D-223**.
- **Northstar item method — D-222: one pipeline, reproducible; method d222 (no calls).**
  - **Entry.** `northstar-item-pilot.mjs --run <manifest>`: layers, skin shadow, body visibility, checks and review pictures
    per item, then every outfit of technically passed items. Method, C, raws and code are pinned in `run.json`; two runs were
    byte-identical.
  - **Check fixes.** FIT-4 is measured against C's own exterior, and FIT-6v2 judges crossings by their shape (compact vs.
    elongated). The skirt now passes; holes, too short bottoms and double contours still fail.
  - **Extraction.** The skin shadow is judged by luminance, and the contour antialias over skin is unmixed. The khaki hem's
    orange specks over boots went from 33 px to 7 px.
  - **Result.** 8 of 9 items pass technically; the sandals are still rejected. 18 outfits are packaged.
  - **Open.** A tee + khaki hip slit was found by manual review; no check runs on combinations yet.
  - See `project-state.md` **D-222**.
- **Northstar item method — D-221: the D-218 covering rule on the original D-207 raws (no calls).**
  - **Sneakers and boots.** Resolved by local composition: under closed-footwear covering + VIS-3 both pass technically.
    The rejections were the body's visibility, not missing shoe material.
  - **Skirt.** The flagged strip is the picture's own thigh contour at the hem corner, not missing fabric. The gates are
    unchanged, so the skirt stays rejected; changing a gate is an owner decision.
  - **Sandals.** Need new image material: the generated foot is narrower than C's, and an open sandal hides nothing.
  - **Records.** Results are recorded under a new method version (`item-method-results-d221.json`); D-207's outcomes are
    unchanged and nothing is approved automatically.
  - See `project-state.md` **D-221**.
- **Northstar item method — D-218 (prepared, no calls): masked edit + controlled composition.**
  - **Masks.** A GPT Image mask is guidance only (OpenAI), so C is preserved by local composition.
  - **Three regions.** API mask, item allowed region and body visibility.
  - **Closed footwear.** It hides the foot from the shoe's solid top down; VIS-2 makes the shoe replace what it hides.
  - **Experiment.** Plan of 3 calls (skirt, sandals, sneakers control), not authorised.
  - See `project-state.md` **D-218**.
- **Northstar clothing pilot — D-217: the sneakers were generated and rejected (an instep arch); the pilot's sending is complete.**
  - **Calls.** 11 of 12 used.
  - **Passed.** Tank, tee, sweater, shorts and khaki trousers.
  - **Rejected.** Sandals, boots, skirt and sneakers. Every rejection sits where the garment ends against the body.
  - See `project-state.md` **D-217**.
- **Northstar clothing pilot — D-216: the boots and the skirt (reserve) were generated and are both TECHNICAL_REJECT.**
  - **Boots.** The heel arch shows C's bare heel.
  - **Skirt.** A thigh contour shows at the hem corner.
  - **Extraction fix.** Enclosed holes of a garment come from the picture unless they show the body (dark boots).
  - **Sneakers.** A reserve is assigned; it needs its own execution message.
  - **Calls.** 10 of 12 used.
  - See `project-state.md` **D-216**.
- **Northstar clothing pilot — D-215: the sneakers' call again got HTTP 429 (no credit) after the owner's confirmation;
  sending stopped.**
  - **Calls.** 8 of 12 used. The boots and the skirt's reserve are unspent and prepared.
  - **Results.** Unchanged from D-214.
  - See `project-state.md` **D-215**.
- **Northstar clothing pilot — D-214: reusable items; skin shadows are their own multiply layer; sandals parked; one
  reserve assigned to the skirt (bounded amendment for HTTP 429 without an image).**
  - **Cross-skin-tone reuse.** Unproven: there is no approved recolouring of C (D-132/D-040). The fabric layers hold
    practically no skin.
  - **Prepared, not sent.** Sneakers, boots and the skirt's reserve wait for confirmed credit.
  - See `project-state.md` **D-214**.
- **Northstar clothing pilot — D-213: post-processing made robust at collars, cuffs and open footwear (no image calls).**
  - **Cuffs.** The hand guard for tops starts at C's own wrist, and G-3 flags paint over the hand.
  - **Collar.** The edge rule respects the head.
  - **Head seam.** The D-201 head seam in the runtime composite removes the pale neck line.
  - **Results.** Five of six items pass technically. The sandals stay rejected: their toe lines are a documented material
    limit.
  - See `project-state.md` **D-213**.
- **Northstar clothing pilot — D-212: stage 2 ran until the API credit was exhausted (as of 2026-10-26).**
  - **Generated.** The red tee (TECHNICAL_REJECT, FIT-6v2 collar notch), the green sweater (cuffs cut by the hand guard,
    a manual finding) and the khaki trousers (clean).
  - **Stopped.** The skirt returned HTTP 429 insufficient_quota. The sneakers and boots were not sent. 7 of 12 calls used,
    no reserves.
  - **Outfits.** 6 of 27 contain only generated items.
  - See `project-state.md` **D-212**.
- **Northstar clothing pilot — D-210: post-processing fixed and verified; stage 1 METHOD_OK; stage 2 open (as of 2026-10-26).**
  - **Extraction.** A shift-tolerant, chroma-aware difference (2 px, tolerance 40). The garment is the paint connected to it,
    and its edge comes from the picture. No thin-stripe filtering.
  - **Checks.** FIT-5v2 (overlap by layer rank and tuck), FIT-6v2 (strips along the edge, crossings reported) and FIT-7v2 (sole
    range) were revised. v3 is kept for D-205's record.
  - **Stage-2 gate.** It opens only on an exact status token.
  - **Stage-1 results.** Tank and shorts are clean. The sandals are TECHNICAL_REJECT (FIT-6v2, the ankle redrawn 3 px off).
  - **Known limit.** In open footwear, redrawn toe lines need manual review.
  - See `project-state.md` **D-210**.
- **Northstar clothing pilot — D-208: stage 1 sent and inspected; stage 2 stays closed (as of 2026-10-26).**
  - **Sent.** Tank, shorts and sandals, one call each. Generation OK. 3 of 12 calls spent, no reserves.
  - **Fixed.** Two systematic extraction faults in our tool. Body contours redrawn 1–2 px off were extracted as
    item, and brown leather was excluded as skin. Fixed with strong-change, opening and closing. The raws were
    reprocessed without new calls.
  - **Open.** FIT-5 (a waistband hidden under the top) and FIT-6 (skin meant to show at open forms) are contract
    findings awaiting the owner.
  - **Not METHOD_OK.** See `project-state.md` **D-208**.
- **Northstar clothing pilot on C — D-207: at most 12 image calls authorised (9 items in two stages, at most 3 reserve
  calls), C sent as the reference for this pilot only, frozen prompts, one-shot claims; not yet attempted (as of
  2026-10-26).** D-206 is security PR #407.
  - **Tools.** `openai-send-northstar-item-pilot-d207.mjs` (send) and `northstar-item-pilot.mjs` (`--process`, `--combine`).
  - See `project-state.md` **D-207**.
- **Northstar base figure — D-205: C frozen as the development candidate (numbers tracked, pixels outside the clones);
  contract v3 with three axes — FIT to C (binding), COMPATIBILITY with old Northstar clothing (a report), QUALITY;
  gate set v3 (BF9v3 waist seam, BF15v3 runtime composition); category templates and fitCheck; a 9-item clothing pilot
  on C prepared, not authorised (12 calls recommended) (as of 2026-10-25).**
  - **Tools.** `northstar-base-figure-c.mjs` (`--freeze`, `templatesC`, `fitCheck`, `legacyReport`) and
    `northstar-base-figure-c-proof.mjs` (`--fit-proof`, stand-in items and fault stimuli only).
  - See `project-state.md` **D-205** and `docs/198-northstar-base-figure-contract.md` §12.
- **Northstar base figure — D-204: runtime layering proof for the D-202 candidate; BF15 had dressed a body that still held
  the base garments; in the runtime model the 1,154 px vanish into background, but the body is up to 3 px wider than
  Northstar's jeans at the hips and upper thighs; BF9v2's 1 px is no coverage problem; nothing adopted (as of 2026-10-25).**
  - **Tools.** `northstar-base-figure.mjs --layers` (`separateBase`, `runtimeBody`, `layerProof`, proposed `bf15r`).
  - See `project-state.md` **D-204** and `docs/198-northstar-base-figure-contract.md` §11.
- **Northstar base figure — D-203: the D-202 call sent once (HTTP 200) and TECHNICALLY REJECTED under gate set v2 at
  BF9v2 (top hem y 785, 1 px above 786–798) and BF15 (the shorts run 6–7 px outside the jeans along the hips); not
  visually reviewed; the budget is spent (2 of 2) (as of 2026-10-25).**
  - **Progress against A.** BF5 54 → 0 px (no flare at the leg openings, crotch at the jeans' height); BF4v2, BF14v2 and the
    neck pass. The hip width did not respond to the prompt (A 4–7 px, v2 6–7 px per side).
  - See `project-state.md` **D-203**.
- **Northstar base figure — D-202: gate set v2 adopted (BF4v2, BF9v2, BF14v2); prompt v2 frozen; D-199's reserve B closed
  unused; ONE new call `D-202-northstar-base-figure-v2`, the last of the budget (2 calls, 1 sent); not yet attempted
  (as of 2026-10-25).**
  - **Adapter.** `tools/avatar/openai-send-northstar-base-figure-d202.mjs`; the D-199 adapter now refuses A and B.
  - **Gates.** v1 stays the record of A's rejection; v2 binds every later candidate. Review: `northstar-base-figure.mjs
    --review <png> --out <dir outside the clones> --compare <A>`.
  - See `project-state.md` **D-202**.
- **Northstar base figure — D-201: A diagnosed; one real image fault (the base shorts are wider than the jeans at the
  hips and thighs, crotch too high) and three mis-constructed measurements (BF4, BF9, BF14); the neck line fixed in the
  recomposition; gate revisions PROPOSED, not adopted; prompt v2 drafted; no call (as of 2026-10-25).**
  - **Seam rule for a generated body.** The candidate owns its neck below y 440; the head stack's leftover collar edge (its
    antialiased pixels and a 3 px band above its lower boundary, no hair) is not composited over it. A: 126 line px → 0;
    every BF verdict unchanged.
  - **Proposals.** P-BF4 (bare soles inside the sneaker outsole band), P-BF9 (the candidate's own torso below the armpits),
    P-BF14 (after the established dust cleanup, interior capped separately), each with Northstar-derived control stimuli.
  - **Tool.** `northstar-base-figure.mjs --diagnose <png> --out <dir outside the clones>`.
  - See `project-state.md` **D-201** and `docs/198-northstar-base-figure-contract.md` §8.
- **Northstar base figure — D-200: call A sent once (HTTP 200, one 1024×1536 image, stored outside the clones) and
  TECHNICALLY REJECTED at BF4, BF5, BF9, BF14 and BF15; not visually reviewed; A closed; reserve B open but not sent
  (as of 2026-10-25).**
  - **Failures.** Feet 7 px above the ground line; base shorts flare beyond the jeans at the hips (envelope, dress-back);
    deep armholes leave skin in the chest band (98.53 % < 99.5 %); 7.91 % semi-transparent pixels (> 6 %). Thresholds
    unchanged.
  - **Tool finding.** The D-194 seam recomposition leaves a faint pale line across the neck of a generated body; the raw
    image has none. Fix before any adoption.
  - See `project-state.md` **D-200**.
- **Northstar base figure — D-199: at most two image calls authorised (A; B only as a reserve after A is recorded as
  rejected); not yet attempted (as of 2026-10-25).**
  - **Calls.** `D-199-northstar-base-figure-a` and `-b`, each with its own one-shot claim; the same frozen D-198 request
    (Northstar v2 as the only image, `base-figure-prompt-v1.txt`, `gpt-image-2.5-sunburst-2026-09-08`, 1024x1536,
    transparent). Authorisation file `tools/avatar/fixtures/northstar-wardrobe/base-figure-calls-v1.json` (separate from the
    R3 budget); adapter `tools/avatar/openai-send-northstar-base-figure-d199.mjs`. Each send needs a separate owner
    instruction after the merge.
  - **Storage.** Output only under `<Documents>/DenSejeApp-artefacts/d-199-northstar-base-figure/` (D-127 §2); the review
    tool `northstar-base-figure.mjs --review` refuses any directory inside the repository.
  - See `project-state.md` **D-199**.
- **Northstar base figure — one shared body in neutral, close-fitting base clothing with arms, legs and feet; contract v2;
  first image attempt prepared, not authorised; no base figure exists (D-198, as of 2026-10-25).**
  - **Why.** D-197's clothed base cannot carry sleeveless tops, short tops, shorts, skirts or sandals, so its rule that every
    item covers Northstar's tee, jeans and sneakers is not the production contract. D-197 stays a documented experiment.
  - **Base.** Northstar v2's body, pose and master coordinates; the existing R3 head stack is kept and recomposed over the
    candidate's body (D-194 seam rule). The base garments (sleeveless top to the natural waist, shorts to mid-thigh, bare
    feet) are authoring material only: they set the minimum every top and bottom must cover, and their region is empty at
    runtime. D-127 §2 applies: a generated base figure is never tracked or placed under `assets/`. The H1 ban stands.
  - **Contract v2.** Layers back · body · shoes · bottoms · shoes-over · top-body · bottoms-over · arms · top-sleeves · hands
    · hands-over · head · hair · headwear; coverage is defined by seams, not by t-shirt or trouser length; shoes cover
    nothing.
  - **Check.** `tools/avatar/northstar-base-figure.mjs`: registration (integer shift ≤ 6 px or reject), recomposition, BF1–BF15
    automatic gates, V1–V8 owner criteria. Shown on Northstar only: it fails exactly the limb and base-garment gates.
  - **Pilot.** `pilot-plan-v2.json`: base figure first (2 image calls requested, not authorised), then a 0-call rig, then a
    clothing pilot with a sleeveless top, shorts, a skirt and sandals.
  - See `docs/198-northstar-base-figure-contract.md` and `project-state.md` **D-198**.
- **Northstar wardrobe — DOCUMENTED EXPERIMENT (superseded as the goal by D-198): fit shown with derivatives of Northstar's own
  clothing and simulated input, not with any GPT-generated item. One fixed body for generated clothing items; contract and local proof of concept; no image call (D-197, as of 2026-10-25).**
  D-195/D-196 framing work is parked with its flag off.
  - **Base.** Northstar Master v2 is one fixed body and pose, but only as a CLOTHED figure: there is no body under its painted
    tee, jeans and sneakers. They become the default items of three mandatory categories (top, pants, shoes).
  - **Rule.** An item replaces its category's default and must cover that default's region completely, so no body ever shows
    and no bare or close-fitting figure exists. The H1 ban and D-127 §2 stand.
  - **Coordinates and order.** Master coordinates, 1024×1536, with fixed anchors. Layer order: shoes · pants · top body · arms
    · top sleeves · hands · head · hair. A top is two layers.
  - **Fit.** Guaranteed by tools (registration, extraction, layer split, gates I1–I8), not by prompts.
  - **Contract.** `docs/197-northstar-wardrobe-contract.md`, with the machine-readable
    `tools/avatar/fixtures/northstar-wardrobe/contract-v1.json` and the pilot batch `pilot-batch-v1.json` (never authorised;
    superseded by `pilot-plan-v2.json`).
  - **Out of scope.** Sleeveless tops, shorts, skirts and sandals: they need limb material first.
  - See `project-state.md` **D-197**.
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
- **R3 hair — method adopted; placement targets approved; colour method B planned but not wired to runtime; the first hair call (D-175) sent once and technically rejected at H2; the second hair call (D-177, explicit margin) sent once, H1–H5 passed, no approved anchors, kept for review; registration v2 adopted for future sheets; the third hair call (D-180, the first under v2) sent once, H1–H5 passed, fit points not identifiable under v2, kept for review; the fourth hair call (D-183, Northstar for style and a geometry guide) sent once, H1–H5 passed, fit points not identifiable under v2, kept for review; hybrid derivation adopted, one review candidate (r3-hair-hybrid-v2), not production-approved; no live permission (D-174 … D-185, as of 2026-10-22).**
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
  **D-183 (2026-10-22)** authorised exactly ONE further hair call, `D-183-r3-hair-northstar-v4`, with a reference pack:
  - **Ear transitions.** Northstar shows sideburns, not the short ear transitions D-179 defines. The owner accepts short ear
    transitions without sideburns as a deliberate R3 design variation; A9 and A10 keep their coordinates and are documented
    as design targets (`methodV2.earTransitionDesign`). Targets, definitions, fit principle and thresholds are unchanged.
  - **Two images, fixed order.** Image 1 Northstar (`3daf32e7…`) controls painting, line weight, shadows and highlights;
    Image 2 the geometry guide `guide-hair-v1.png` (`4779de4a…`) controls fit and lock structure. The guide is drawn by the
    tracked generator `tools/avatar/r3-hair-guide-v1.mjs` (the approved targets as fixed vertices; no Northstar pixels).
  - **Prompt v4, frozen** (`55846029…`): no sideburns, no lock below the ears, no nape lock; never the guide's flat fill or lines.
  - **Capacity.** `assets[8]` 3 → 4, budget 25–26 → 26–27, no reserve; actual use unchanged (hair = 3).
  - **Adapter.** `tools/avatar/openai-send-r3-hair-d183.mjs`, derived from the closed D-180 adapter: both images pinned and
    sent in order, dry run without credentials, one fetch, no retry, only H1–H5. Annotation and placement stay separate.
  - **Status.** UNSPENT and not a run instruction. R3 stays default OFF. See `project-state.md` **D-183**.
  **D-184 (2026-10-22)** recorded that one hair send and closed the mandate:
  - **Send.** HTTP 200, request `req_d7b8bfbbb21b4defb4773bd7c143b5d9`, Northstar and the guide in order, one 1024×1024 sheet
    `7b36e054…`, one fetch, no retry; claim, event log, manifest and raw response verified consistent.
  - **Checks.** **H1–H5 passed**; they prove the technical sheet only. D-179's placement and shape checks were **not evaluated**.
  - **Guide vs sheet.** Northstar's painting is taken over and the silhouette follows the guide's size and position (IoU 0.835),
    but not its geometry where it matters: no V parting, pointed locks instead of short ear transitions, no separate image-right
    temple lock.
  - **Identifiability (review finding, not an approval).** A4 is ambiguous and A9/A10 are missing under D-179's definitions, so
    the sheet cannot be annotated: no reduced fit, no invented coordinate, no DRAFT annotation. No visible halo.
  - **Disposition: kept for review, not visually approved.** Raw files, claim and event log stay byte for byte and untracked.
  - **Accounting.** `callsActuallySentSoFar.hair` = **4** (`underlay` = 5, `faceNeutral` = 4, `eyesFixed` = 2); the planned hair
    capacity (4) is used up and the budget stays 26–27.
  - **Permissions.** 0 live permissions. Nothing is promoted, and R3 stays default OFF. See `project-state.md` **D-184**.
  **D-185 (2026-10-22)** adopted **hybrid derivation** as a new authoring method and recorded one review candidate:
  - **Method.** Generated painting from a technically passed raw sheet plus documented edits only: vector masks
    (`remove`), named paint fields with one grey tone beneath the raw painting (`add`) and self-drawn contours inked only
    on existing hair (`contours`). No Northstar pixels, no H1, no hidden pixel retouching, no change to the raw sheet or
    to earlier check results. Change categories and their extent are recorded; every derivation needs the owner's visual
    review. It is not an after-the-fact approval of the raw sheet's fit.
  - **Three parts kept apart.** The untouched source (`tools/avatar/fixtures/r3-hair/hybrid/source-r3-hair-d183.png`,
    `7b36e054…`, with its original check report), the edit spec + generator (`tools/avatar/r3-hair-hybrid.mjs`), and the
    derived sheet and placed candidate with their own pixel hashes. hybrid-v1 (the prototype) is kept unchanged.
  - **Construction annotation** (`hybrid-annotation-v1`): points are drawn vertices bound to the edit geometry, with
    source hashes, the transform, crops of the rasterised corners and their own review status. They are not readings;
    D-179's hidden second reading still applies to raw sheets. A zero residual is not an independent validation.
  - **Candidate `r3-hair-hybrid-v2`.** H1–H5, HP-LOCK, HP4v2, HP5, HP8 and HP-FRAG pass on the derived pixels; HP6/HP7 pass
    locally with the DRAFT face parts and eyes v5 (reported NOT RUN in CI); ramp B in all eight colours; deterministic
    rebuild. Not production-approved: face parts and eyes are provisional, U1 has no ears or neck, the nape lock is not
    authored and the owner's visual approval is pending. R3 stays default OFF. See `project-state.md` **D-185**.

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
