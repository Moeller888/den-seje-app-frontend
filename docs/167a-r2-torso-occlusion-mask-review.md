# 167A — R2 torso occlusion mask + slot template (A1 of option A): build & review record, D-085

**Status:** `A1_BUILT — OWNER_VISUAL_REVIEW_REQUIRED`.

**Revision 3 (2026-08-01) — the owner caught a semantic inversion at the neckline, and it was real.**
Revision 2 decided ownership by nearest-RGB against three swatches. On the neckline that inverted the
picture in both directions, and the measurement confirmed the owner's read exactly:
**the tee's dark collar ring was pushed OUT** of the mask (its darkness put it nearest the *trousers*
swatch — 809 dark tee-side px outside), while **skin in shadow was pulled IN** (nearest the grey
*garment* swatch — 93 px of anatomy inside). It also confirmed the circularity: the
`base-tee-garment-uncovered = 0` gate only ever measured pixels the same classifier had labelled
garment, so it could not see either error. Ownership is now decided by **hue and line-work ownership**,
and three gates re-derive meaning independently of the object the mask was built from. Result at the
neckline: **skin inside the mask 93 → 0**, **tee's dark edge outside the mask 500 → 8**, contour within
**1 px** of the garment's visible edge.

**Revision 2 (2026-07-31)** — two blockers from revision 1 are closed:
**(1)** the flat "0 px above y=560" rule left **2,740 px of the base tee's collar curve uncovered**, which
breaks D-037's *fully occlude the base tee* requirement. The garment is now identified **topologically**,
the collar is inside the mask, and a binding gate `base-tee-garment-uncovered = 0 px` measures the whole
tee. **(2)** the builder/determinism tests **skipped** when the gitignored decoder was absent, so
reproducibility was never proven; the decoder is now **checksum-pinned** and those tests **fail loudly
instead of skipping**. Status is unchanged and may only become `A1_ACCEPTED` after owner visual review.
**Type:** deterministic, NON-AI tooling + tracked mask template. **No artwork was produced. No slot was
activated.** `D-037` remains **CONDITIONAL** — this document does not discharge it.
**Plan of record:** `docs/167a-r2-torso-asset-production-plan.md` (D-084).
**Related:** D-082 (reuse measured impossible), D-083 (whole-avatar C2 fallback — **still the active
protection**), D-034 (AI permitted for item artwork only), D-040 (torso deferred pending occlusion
masks), D-071 (render-scale convention `alpha >= 128`), D-057/D-058/D-061 (base decomposition + alpha
fringe).
**Pilot status (unchanged):** `PILOT_WAVE_1_IN_PROGRESS`. **`AVATAR_R2 = false`.**

---

## 1. What was built

`tools/avatar/build-r2-torso-occlusion-mask.mjs` — deterministic, no AI, no npm dependency, no new
binary. It decodes the runtime R2 base with the repo's vendored `dwebp`, re-measures the D-084 landmarks
from that base, asserts them against the locked values, derives three masks, runs 28 gates, and writes a
spec. Default mode is **read-only verify**; writing requires `--write`.

```
npm run avatar:r2-torso-mask            # verify (read-only, writes nothing)
npm run avatar:r2-torso-mask -- --write # write the tracked template + review artifacts
```

### 1.1 Input (pinned)

| field | value |
|---|---|
| path | `assets/avatar-r2/base/body-neutral-medium-v2.webp` |
| SHA-256 | `28765eea616dd92beb73273c67d6d603cabd9f92af8057d2d9a5fe50c01032f9` |
| size | 67,174 B · 512×768 |
| why this file | it is the **runtime** base (`R2_MANIFEST` `base: {"neutral-medium": 2}`), the decomposed D-057 asset |

The Phase-1 baked **`body-neutral-medium-v1.png` is not an input** — `R2_MANIFEST` records it as the
historical/rollback asset. A SHA mismatch on the input is a hard failure, not a silent re-fit.

### 1.2 Method

Decode → **nearest-neighbour ×2** into the Master frame 1024×1536 (exact, lossless) → silhouette
`alpha >= 128` (D-071 convention; the AA ramp is excluded) → landmark re-measurement → mask derivation →
gates. Every step is a pure function of the input bytes.

---

## 2. Landmarks: locked (D-084) vs re-measured (this run)

| landmark | locked | measured | delta | tolerance |
|---|---|---|---|---|
| garment shoulder line | 560 | 562 | 2 | 24 |
| sleeve end | 714 | 714 | 0 | 24 |
| tee hem | 902 | 904 | 2 | 24 |
| crotch | 1000 | 1000 | 0 | 24 |
| fingertips | 1054 | 1057 | 3 | 24 |
| corridor left | 372 | 388 | 16 | 24 |
| corridor right | 640 | 627 | 13 | 24 |

**D-084's geometry is confirmed on the runtime base.** The masks are cut on the **locked** values (so the
template is stable), while the measured values are asserted every run — a future base change that moves a
landmark by more than 24 Master px fails the build instead of silently re-fitting the mask.

Two measurement rules had to be made robust, and both are worth recording:

- **The corridor is a median, not a min/max.** On a handful of rows the arm/torso seam carries no alpha
  gap, so a naive "torso run" swallows an arm and the corridor inflates to x 703. The per-row span falls
  back to the median corridor whenever a row is more than 35 % wider than the median.
- **The crotch is found by two runs whose midpoints are inside the corridor.** The first attempt keyed on
  "two runs anywhere", which the arms satisfy immediately below the hem and put the crotch at y 905.

---

## 3. The three masks

| file | meaning | px | bbox (Master) | SHA-256 |
|---|---|---|---|---|
| `torso-occlusion-hard-v1.png` | where a torso replacement **must** be fully opaque | 97,698 | x 328–697, **y 524**–903 | `17baddfaa22b45162dad1940c23e9fee07d524688de136030cd6fc0889f34e7a` |
| `torso-edit-allowed-v1.png` | hard + ≤4 px blend + the optional hem extension | 124,027 | x 328–699, y 524–999 | `84ed7276db084c4a49d3897c0546baa3f7a95a0abc7eead603f4ce2254bae659` |
| `torso-protect-v1.png` | the exact complement of edit — the anatomy/identity lock for A2 | 1,448,837 | full canvas | `b2e2a8cc6a828aca086fa715b3ca05d83f6ec7f7ef93da03d2abf6499d2f53f7` |

The mask starts at **y 524** — the top of the collar ring's own dark stroke (revision 3). The garment
object is **97,702 px**: 95,332 px of fabric plus 2,280 px of owned line work (minus overlap).

Spec: `tools/avatar/fixtures/r2-torso/torso-mask-spec-v1.json`. Optional **hem extension**: 25,468 px,
x 372–639, y 902–999 (corridor only, clipped to the silhouette).

All three are 1024×1536, binary alpha (0 or 255), white RGB, `IHDR`/`IDAT`/`IEND` only — no metadata, no
timestamp, so the bytes depend solely on the pixels. **They live under `tools/avatar/fixtures/r2-torso/`,
not under `assets/`: this is a production template, not a runtime asset.**

### 3.-1 How a pixel's meaning is decided (revision 3)

Nearest-RGB against three swatches is gone. Meaning now comes from properties that survive shading:

| class | rule | why |
|---|---|---|
| **skin** | `R − B ≥ 50` and `R ≥ 110` | skin stays warm in shadow; only its luma drops. `[138,105,87]` and `[194,153,121]` are skin, and revision 2 called both "garment" |
| **outline** | `luma < 100` | the artist's line work, at any hue |
| **fabric** | `chroma ≤ 28` and `luma ≥ 100` | the tee is achromatic mid-grey |
| other | everything else | reported, never assumed |

**Line work is assigned by ownership, never by colour.** A dark stroke belongs to what it bounds: it
joins the garment when it is *thin* (≤12 px run — so the dark trousers, which meet the hem, can never be
adopted as "the shirt's edge") **and** lies within 4 px of the connected fabric. 4 px is deliberate: the
collar rim is 4–6 px thick, and a 2 px reach adopted only its outer half, leaving the half that borders
the neck outside — measurably 500 → 8 px of the tee's own edge left out.

**Skin can never be absorbed.** The band rule that admitted "every solid pixel except bare skin" is
replaced by "fabric **or** owned line work": a pixel is now admitted for what it **is**, not for what it
is not. That single change removed all 93 anatomy pixels from the mask.

### 3.0 The garment is a topological object, not a band (revision 2)

A band rule cannot express either the collar curve (which rises to y 528) or the fact that the two
sleeves end on different rows. So the tee is identified by **connectivity**: garment-classified solid
pixels are 8-connected, and the components touching a seed taken from the middle of the torso are the
garment — **95,799 px, top row 528, bbox x 328–697 / y 528–903**. The shoes are grey too, but they form
their own components and never touch the seed, so they stay out. Two closing passes absorb 1–2 px fold
shadows that classify as "other" and would otherwise punch holes in the collar.

**Everything the mask owns follows from that object.** The band rules below remain as the geometric
floor — they add the garment's own outline and shading inside the torso — but they no longer *define*
the garment.

### 3.1 Band rules actually implemented

- `y < 560` — **only the tee's own collar curve** (gate `above-shoulder-only-tee-collar`); the neck,
  head and hair are untouchable, and the collar zone gets **no feather at all**, because a blend there
  would land on skin.
- `560 … 714` — every solid pixel of the row **except bare skin**. The two sleeves do not end on the same
  row, so a plain "whole row" rule grabbed a few pixels of the arm that is already bare on one side.
- `714 … 902` — pinched to the per-row torso span (bounded by the locked corridor). Deliberately
  independent of the row's run structure, so a row whose seam happens to close cannot leak onto a forearm.
  Fabric that belongs to the tee but lies outboard (the longer sleeve's tail) is covered by the
  topological rule above, and **only** fabric: gate
  `outboard-below-sleeve-end-is-tee-fabric-only` allows 0 non-garment pixels out there.
- `902 … 1000` — optional hem extension, corridor only, clipped to the silhouette.
- `y >= 1000` — nothing. Legs are untouchable.
- The ≤4 px blend never crosses onto transparent canvas, onto locked anatomy, or outboard of the corridor
  below the sleeve end — **including the arm's anti-aliased edge** (alpha 1…127), which the solid-pixel
  anatomy zones do not cover.

---

## 4. Gates — 34/34 pass

### 4.0 The three gates that cannot certify themselves (revision 3)

The owner's objection was that a gate measuring the classifier's own output proves nothing. These three
re-derive meaning from the pixels and compare it against the finished mask:

| gate | result |
|---|---|
| **`no-semantic-skin-in-mask`** — hue-based skin, shadow included | **0 in hard, 0 in edit** (was 93 in hard) |
| **`tee-line-work-covered`** — the garment's own dark strokes | **2,276 / 2,280 = 99.8 %**; the 4 remaining are island-rule casualties and sit inside the edit zone |
| **`neckline-contour-matches-garment`** — mask edge vs visible garment edge, per row | **77 rows, 0 out of tolerance, worst delta 1 px** (tolerance 2) |

Plus `tee-fabric-fully-covered`: **95,332 / 95,332 = 100 %** of garment fabric is mandatory coverage.

### 4.1 Revision-2 gate set (retained, now expressed semantically)

**The binding one (revision 2): `base-tee-garment-uncovered = 0 px`** — of the garment's **95,799 px**,
zero lie outside the hard mask, with a per-zone conflict breakdown (skin/neck 0, forearm/hand 0, leg 0,
other 0). This is the gate that expresses D-037's *fully occlude the base tee*, and it measures the whole
tee — collar curve included — not just the band below the shoulder line.

Also added in revision 2: `above-shoulder-only-tee-collar` · `outboard-below-sleeve-end-is-tee-fabric-only`
· `edit-not-on-bare-skin` · `collar-zone-present-and-connected`.

### 4.1 Revision-1 gate set (retained)

`landmark:` ×7 (drift ≤24 px) · `no-px-above-shoulder` · `no-px-at-or-below-crotch` ·
`no-mask-outboard-below-sleeve-end` · `no-head-or-neck` · `no-forearm-or-hand` · `no-legs` ·
`edit-inside-silhouette` · `hard-inside-solid-figure` · `tee-occlusion-complete` ·
`no-unreachable-garment` · `feather-within-4px` · `protect-is-complement-of-edit` ·
`protect-covers:head-neck` · `protect-covers:forearm-hand` · `protect-covers:leg` ·
`hem-extension-in-corridor` · `fingertip-clearance` · `masks-binary` · `hard-is-single-region` ·
`no-specks` · `hard-not-on-bare-skin`.

Tee occlusion: **93,304 garment pixels in the band, 92,668 mandatory-covered (99.32 %)**; the remainder is
accounted for exactly — 466 px on bare arms and 158 px on the arms' shaded inner edge, where covering is
itself forbidden, plus the fringe below.

---

## 5. Residues — one closed, one bounded

**(a) Collar/shoulder curve — CLOSED.** It was a 2,740 px residue and a genuine D-037 violation. The
mask now carries **3,404 px of collar** (revision 2: 2,657, before the dark ring was recognised as the
shirt's); **0 px of the tee remain uncovered**. Top row 560 → 528 → **524**.

**(a2) The neckline inversion — CLOSED (revision 3).** Measured in the neckline region
(x 400–640, y 496–640), before → after:

| | revision 2 | revision 3 |
|---|---|---|
| skin inside the mask | 93 | **0** |
| tee's outer dark edge outside the mask | 500 | **8** |
| collar rim outside the mask | 309 | 170 → of which only **2 px** sit in the collar band |
| mask edge vs visible garment edge | up to 10 px short | **≤1 px** |

What is left outside is **not the collar**: 18 px are the rim's innermost anti-aliased row, directly
against skin, and 63 px belong to the **jaw/ear contour above the garment entirely** (y < 520, ≥5 px from
the connected fabric — verified by distance, not assumed). Pulling those in would put the mask on the
head.

**(b) Detached sleeve-tip fringe — 6 px, still an accepted, bounded residue.** At x 698–699, y 706–709 the
base carries solid pixels (alpha exactly 128) separated from the sleeve body by a sub-threshold ramp,
4.1–5.7 px away; they form their own 6 px garment component and never touch the tee. Bringing them in
would break one of three locked rules: an island-free mask, the ≤4 px feather, or the `alpha >= 128`
solidity convention. Hard-bounded at ≤16 px and ≤8 px distance. **Scale check:** 6 Master px is ~0.2 px at
the avatar render size (180×270) — below one output pixel.

**(c) Not a residue, but recorded so the numbers reconcile: 96 fabric-coloured NON-garment pixels** in
the collar band (y 500–559) — anti-aliased blends along the jaw/ear/neck contour that read as achromatic
grey. Evidence that they are head, not shirt: at most **1 of 96** abuts the garment and 36 sit more than
10 px away. Covering them would put the mask on the head.

**(d) 4 px of the garment's line work are paintable but not mandatory.** They form components below the
64 px island threshold, so the no-floating-islands rule moves them out of `hard`; the edit zone still
reaches them, so an artist covers them. Listed in the spec as `paintableButNotMandatoryPx`, hard-bounded
at 16.

---

## 5.1 Reproducibility in a clean clone (revision 2)

The decoder `tools/avatar/vendor/dwebp.exe` is **gitignored by repo policy**, so a fresh clone bootstraps
it with the sanctioned script — no new binary and no new npm dependency were introduced:

```
node tools/avatar/fetch-dwebp.mjs      # official libwebp 1.5.0 release, then a CHECKSUM check
npm run avatar:r2-torso-mask           # verify (read-only)
npm run test:unit                      # includes the builder + determinism tests
```

**What changed:** `fetch-dwebp.mjs` pinned only a version and a URL. It now also pins the **SHA-256 of
the extracted executable** (`ee66951d…`, 505,344 bytes) and refuses to install a mismatch, and it exports
`verifyVendoredDwebp()`, which the builder calls before decoding — a decoder that is missing *or not the
pinned one* is an explicit, actionable error. The spec JSON records which decoder produced the template.

**Provenance, stated plainly:** the pinned hash was taken from the binary this repo had already vendored
via that script from the official URL. It is a pin against **silent drift** — a re-cut release, a
truncated download, a swapped file — **not** an independent verification against a signature published by
Google. Anyone re-pinning it should verify the upstream release first.

**The tests no longer skip.** `verify-writes-nothing`, `two-build determinism` and the new
`base tee fully occludable, measured on the decoded base` all call `requireDecoder()`, which fails with
the bootstrap instruction instead of skipping; a further test asserts this file contains no `t.skip(`.

### 5.2 CI gap — reported, deliberately NOT fixed here

**`npm run test:unit` does not run in CI at all.** `.github/workflows/playwright.yml` runs exactly one
unit file (`tests/unit/ci-classify-changes.test.mjs`) plus the Playwright suite. So these tests are a
**local** gate today, and this PR does not change that.

The **minimal** change that would close it — **not made here, because a workflow change needs its own
decision**:

```yaml
    - name: Avatar tooling unit tests
      if: steps.mode.outputs.mode == 'avatar-tool' || steps.mode.outputs.mode == 'full'
      run: |
        node tools/avatar/fetch-dwebp.mjs
        npm run test:unit
```

Two things the owner should weigh before authorising it: the step **downloads a third-party binary in
CI** (mitigated, not eliminated, by the checksum pin), and the runners are Linux while the vendored
`dwebp.exe` is a Windows build — so a Linux CI would need the `linux-x86-64` archive from the same
release, i.e. a second pinned checksum in `fetch-dwebp.mjs`. **That is a design decision, not a
mechanical edit, so it is left to you.**

## 6. Review artifacts (regenerable, gitignored)

`tools/avatar/build/r2-torso-occlusion-mask/` — `hard-mask-over-runtime-base.png`,
`edit-mask-over-runtime-base.png`, `protect-mask-over-runtime-base.png`, `mask-zones-labelled.png`,
`four-scale-review.png` (180×270 · 112×168 · 72×108 · 52×78, the D-071 render sizes), `report.json`.
Regenerate with `npm run avatar:r2-torso-mask -- --write`.

---

## 7. Visual assessment (honest)

Reviewed on the regenerated overlays, an **8× magnified neckline set** (base · binary mask · overlay ·
semantic class map · error map) and the four-scale sheet (revision 3):

- **The dark collar ring is now inside the mask** — both hooks and the arc under the chin — and **no
  green intrudes into the skin** inside the collar opening. Those were the two things the owner saw, and
  both are visibly resolved at 8×.
- What remains dark at the neckline is a **1 px line exactly on the skin boundary** (the rim's
  anti-aliased inner row). It reads as the garment's own neckline edge; pushing the mask past it would
  put it on skin.
- **The grey neckline ring is gone.** The mask closes tightly around the collar at all four render sizes
  — 180×270, 112×168, 72×108 and 52×78.
- **The grey tee is coverable** across the chest, shoulder curve, collar and both short sleeves.
- **Head and neck untouched;** the mask starts cleanly at the collar line.
- **Both forearms and both hands are fully preserved** — this was the failure mode that broke two earlier
  iterations of the tool (1,169 px and then 2 px of arm contact), and it is now enforced by construction
  *and* by an independent gate on the mask's own geometry.
- **The mask follows the seam under the sleeves**, and the hem extension stops at the crotch without
  touching the legs.
- **No floating islands** — the hard mask is a single 8-connected region.
- **All four render sizes read as a coherent torso region**, including 52×78 where the shape is only a
  few pixels wide.

**Uncertainties I cannot settle from geometry alone:** whether an armour silhouette wider than the base
tee would look right when it must stay inside a corridor measured on a slim figure, and whether the
neckline shape the mask now dictates suits the intended artwork. Both belong to the A2 brief and to owner
judgement, not to a mask. The collar question from revision 1 is no longer among them — it was a defect,
and it is fixed.

**A1 is not PASS on automated gates alone.** Status stays `A1_BUILT — OWNER_VISUAL_REVIEW_REQUIRED`.

---

## 8. What this is not

Not A2 (no artwork, no AI, no image generation) · not A3 (no slot wiring, no z, no transform, no
`R2_SUPPORTED_COSMETIC_SLOTS` change) · **D-037 not discharged** · **D-083's whole-avatar C2 fallback
unchanged and still the active protection for the Ridderdragt** · no runtime, shop, catalog, database,
migration, RLS or Edge Function change · no `R2_MANIFEST` write · nothing promoted to `assets/avatar-r2/`
· no change to buy/ownership/`equipped_slots`/equip/unequip · `AVATAR_R2` stays `false` · pilot status and
participant log unchanged.

---

## 9. Owner acceptance

| field | value |
|---|---|
| Reviewed by | _(owner)_ |
| Date | _(pending)_ |
| Verdict | ☐ ACCEPT template (→ `A1_ACCEPTED`) · ☐ ACCEPT with changes · ☐ REJECT |
| Neckline shape the mask dictates (§7) | _(pending)_ |
| Bounded 6 px sleeve-tip residue §5(b) | ☐ accepted · ☐ not accepted |
| CI unit-test step §5.2 | ☐ authorise the workflow change · ☐ leave as a local gate |
| Authorises A2 (artwork) | ☐ yes — requires discharging D-037 · ☐ not yet |

Until this table is filled in, A1 is built but **not accepted**, and no A2 work may start.
`A1_ACCEPTED` additionally requires: full base-tee occlusion proven (**done — gate
`base-tee-garment-uncovered = 0`**), clean-clone reproducibility proven (**done — checksum-pinned
bootstrap, no skipped tests; CI wiring still open per §5.2**), and the regenerated review images shown to
and accepted by the owner (**pending — this table**).
