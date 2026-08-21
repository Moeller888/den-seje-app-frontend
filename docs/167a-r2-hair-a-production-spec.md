# 167A — Option A production spec: the seven R2 hairstyle rasters

**Status:** `PRODUCTION_AUTHORISED — NOT STARTED` (owner, 2026-08-21 — **D-104**).
Was `SPEC_READY — PRODUCTION_METHOD_UNDECIDED`.
**Type:** specification + a deterministic, non-AI acceptance gate. **This document produces no
artwork, promotes nothing and registers nothing.** It changes no runtime, resolver, manifest,
asset, z, transform, flag, catalog, migration, Edge Function or Supabase object.
The production method **is** now decided (§2, D-104); what remains undone is the artwork itself.
**Related:** D-102 (the audit that measured the gap and recommended A), D-103 (155E hair colour —
the reason §5.1 exists), D-033 (AI banned for base/rig layers), **D-042 (which amended D-033, and
which D-104 extends — §2)**, D-032 (Master = geometry), D-059 (judge at render scale), D-071
(render sizes), D-084/D-085/D-089 (the torso pipeline this reuses), D-090 (the torso garment the
neck line protects), 155D/155F (the C2 hairstyle set and its alias map).

---

## 1. What option A is

D-102 measured that the R2 render resolves one hair asset and ignores `identity.hairstyle`, so
every R2 student sees a style none of them chose. Option D (shipped, D-102/D-103) stopped the UI
promising a choice it could not keep. **Option A is the fix: produce the missing hairstyle
rasters so the R2 figure can honour the stored style.**

The work is art-limited, not code-limited. The resolver change is small and already sketched in
D-102 §4A (`hairSrcForR2` keys on `identity.hairstyle` through the 155F alias map). What does not
exist is the artwork. The authorisation to make it was the open question, and §2 records how it
was answered.

## 2. The production method — decided (D-104)

**Decision (owner, 2026-08-21): D-042 is extended so AI may author hairstyle silhouettes the
Master does not contain.** The finding that made a decision necessary is kept below, because it is
the reason the extension carries a condition rather than being a formality.

### 2.1 The finding — and the correction to the audit

D-102 §4A and the D-103 register entry both state that A requires **human paint-over, because
D-033 bars AI for base/rig layers**. That reading is incomplete: **D-033 was amended by D-042 on
2026-07-02**, precisely because no painter is available.

D-042 permits a narrow thing and forbids a broad one:

> **Allowed:** AI-assisted masked inpainting/outpainting **ON the approved `Northstar Master.png`
> only** — *lifting baked features* to build the decomposed layers (v2 base, face, eyes, eyelid,
> hair) and reconstructing the skin/clothing they hid, provided the output preserves the signed-off
> Master identity.
>
> **Still FORBIDDEN:** full AI regeneration, redesign, "make a new avatar", and any unmasked/broad
> prompt … **no change to** head size, eye shape, **hair silhouette**, pose, outfit style, skin
> tone, line art, lighting, palette or proportions.

The Master contains **one** hairstyle, and that is the one already lifted into
`hair-northstar-v1.webp`. Six *new* styles cannot be lifted from it — they do not exist there —
and producing them necessarily **changes the hair silhouette**, which D-042 names as forbidden.

**So option A was authorised by neither route:** not by D-033 (no painter exists), and not by D-042
(masked decomposition only covers what the Master already contains). The routes that were on the
table, and which one was taken:

| Route | What it would require |
|---|---|
| Human illustrator | The original D-033 method. Blocked on availability, which is why D-042 exists. **Not taken.** |
| **Extend D-042 to new silhouettes** | **TAKEN (D-104).** Permits AI to author hairstyle silhouettes the Master does not contain. Requires an identity-lock that replaces masking — see §2.2. The R-6 drift risk D-032/D-033 measured applies in full and is **accepted, not dissolved**. |
| Derive from the C2 vectors | Converting the authored C2 SVG paths to the R2 painted style: neither pure decomposition nor free generation. Close to option B, which the owner declined on product grounds. **Not taken.** |

### 2.2 The replacement identity-lock: split authority

Masking **was** D-042's identity-lock, and it cannot apply to a shape that is not in the Master. The
hole is closed by splitting the authority instead of pretending one source covers both:

| What | Authority | Enforced by |
|---|---|---|
| **Shape** | the C2 style envelope — the silhouette the student already recognises | `within-style-envelope`, `centred-on-the-skull`, `covers-the-crown`, `clears-the-eye-line`, `respects-the-neck` (§6) |
| **Finish** | the Northstar Master — line art, value structure, palette | `luminance-map`, `alpha-clean-no-halo`, `no-floating-islands` (§6), as far as finish is measurable at all |
| **The residue** | the owner | per-asset visual sign-off at real render scale (D-059). **No measurement replaces this.** |

**This split is the author's reading of the decision, recorded so it can be corrected.** What it
deliberately does not claim: the gates bound geometry and finish, they do **not** detect style drift
or identity drift (§7). The carve-out is **hair only** — free AI regeneration of the base, face or
eyes remains forbidden, and so does any change to the Master's proportions, pose, palette or line-art
convention (D-032).

Everything from §4 onwards is a property of the runtime, not of the hand that draws, and was
unaffected by this decision.

## 3. Scope: seven assets (decided, D-104)

D-102 §4A says "6 more". That assumes the shipped asset is one of the seven selectable styles.
**It measurably is not** (§3.5 of the audit): by envelope it is as wide as `long` (77.5 vs 78) and
lower than `curly` (75.6 vs 61), while C2's default is `short` (56/56). It is a medium-long style
with side volume that matches none of the seven.

**Decision (owner, 2026-08-21): seven assets.** Every selectable style gets its own raster, and
`hair-northstar-v1` stays as the fallback for an unknown or legacy value. That is one more asset
than the audit assumed, and it avoids the nomination problem that removed option C's footing —
no style is declared to be something it measurably is not.

## 4. Geometry targets (measured, frozen)

From `tools/avatar/measure-r2-hair-fit.mjs` against the shipping base
`body-neutral-medium-v2.webp` (`28765eea…`), in the shared **160×240 C2 canvas**:

| Landmark | Value |
|---|---|
| Crown (top of the bald skull) | **31.6** |
| Widest skull | y 61.6, x **50.6 … 110.3**, width **60.0**, centre **80.5** |
| Neck | y **81.6** |
| Shoulder onset (the D-090 garment starts) | y **83.8** |
| Head height | 50.0 |
| R2 eye line (D-080) | ~**57** |

The existing hair layer, for reference: envelope x 40.6…118.1, y 6.3…75.6, 24 265 drawn px, with
a deliberately irregular forehead hairline swinging **33.8…50.3** across the band.

Per-style envelopes, measured from the C2 assets' own path data (audit §3.3) — these are the
silhouettes the student already recognises:

| Style | x-span | Lowest y | Drapes onto the body |
|---|---|---|---|
| `short` | 52…108 | 56 | no |
| `tousled` | 50…110 | 55 | no |
| `curly` | 44…113 | 61 | no |
| `long` | 41…119 | **146** | yes |
| `ponytail` | 52…117 | **123** | yes |
| `buzz` | 53…107 | 47 | no |
| `afro` | 34…126 | 61 | no |

**These are targets for the silhouette, not a transform.** D-102 §3.3 offers a shared
`translateY(~2.8 %)` as a *candidate* only; it has never been rendered, reviewed or
residual-checked, and the per-column spread (17–21 units) is wider than the differences between
the means it would replace. Nothing here validates it.

## 5. The asset contract

### 5.1 It must be a LUMINANCE MAP — the requirement that would break hair colour

The R2 hair layer is **tinted at runtime**: `js/avatar-render-c2.js` sets the wrapper's
`background-color` to the `identity.hair_color` token and composites the asset over it with
`mix-blend-mode: multiply`. **The colour comes from the token; the asset supplies only value and
alpha.**

Measured on the shipping asset: **mean saturation 0.0000, peak 0.0060** over 23 987 opaque pixels.
It is greyscale, and it has to be.

**A hair raster authored in colour would silently disable hair colour for that style** — the
student's choice would be multiplied into artwork that already carries its own hue. Nothing in the
runtime would error; the picture would simply stop obeying. This is the single easiest way to
waste a completed asset, which is why it is the first gate.

### 5.2 Canvas and pipeline

Reused unchanged from the torso path (D-084/D-089), so no new pipeline is invented:

```
1024×1536 RGBA PNG (authoring canvas, SHA-pinned at acceptance)
  → premultiplied 2×2 box downscale ÷2
  → 512×768 RGBA reference PNG
  → cwebp -lossless -exact -z 9 -metadata none
  → assets/avatar-r2/hair/hair-<style>-v1.webp
```

The decoded asset must equal the reference **byte for byte**; that is what proves the encode was
lossless and that no pixel of the accepted artwork moved.

### 5.3 Alpha

`alpha >= 128` is ink (D-071 render-scale convention). Soft pixels with no ink neighbour are halo
and are counted against the candidate — the D-059/D-061 lesson that a matte's residue is judged at
render scale, on the surface, not on the full-res composite.

## 6. The measurable gates

`tools/avatar/check-r2-hair-candidate.mjs` — deterministic, no AI, no network, **writes nothing**.

```
node tools/avatar/check-r2-hair-candidate.mjs <candidate.png> <style>
npm run avatar:r2-hair-check -- <candidate.png> <style>
```

| Gate | Refuses |
|---|---|
| `dimensions` | anything but 1024×1536 RGBA |
| `has-ink` | an empty candidate passing by vacuum |
| `luminance-map` | colour baked into the asset (§5.1) |
| `covers-the-crown` | hair starting below y 31.6, leaving scalp showing |
| `clears-the-eye-line` | hair reaching the eyes |
| `respects-the-neck` | ink below y 81.6, except for `long`/`ponytail` up to their measured extent |
| `within-style-envelope` | a silhouette outside its C2 x-span (±4 units) |
| `centred-on-the-skull` | artwork hanging off the side of the head (centre ±2 of 80.5) |
| `no-floating-islands` | detached specks |
| `alpha-clean-no-halo` | orphan soft pixels above tolerance |
| `legible-at-render-sizes` | a shape that dissolves at the four D-071 sizes |

Each gate is exercised in both directions by `tests/unit/avatar-r2-hair-candidate-check.test.mjs`
(17 tests, CI-safe — no vendored binary): a clean candidate passes, and one deliberate defect trips
exactly the gate it should. A gate that only ever sees good input cannot be shown to work.

## 7. What the gates do NOT establish

- **They do not approve the artwork.** They are a *precondition*. Per D-059, fringe and fit are
  judged at real render scale on the actual surface (quiz, hub, avatar page) by the owner — never
  on the full-res composite, which flatters it.
- **They say nothing about style fidelity.** `within-style-envelope` catches a wrong silhouette,
  not a bad drawing. A `curly` that is geometrically perfect and looks nothing like curly hair
  passes every gate here.
- **They do not validate any transform.** See §4.
- **They do not check identity drift.** That is the R-6 risk D-032/D-033 measured, and whichever
  method §2 selects has to carry its own answer to it.
- **They cannot see `long`/`ponytail` against the torso.** Those two drape past the shoulder onset
  (83.8) onto the D-090 garment; the interaction is a composed visual review, not a measurement on
  the hair alone.

## 8. Open, for the owner

1. Whether `long` and `ponytail` ship in the first slice at all, given §7's last point: both drape
   past the shoulder onset (83.8) onto the D-090 garment, and the hair gates cannot see that
   interaction.
2. Whether §2.2's split-authority reading is the identity-lock the owner intends. It is recorded as
   the author's reading precisely so it can be corrected before artwork exists.

**Closed:** the production method (§2, D-104) and the asset count (§3, D-104).

## 9. Boundaries of this change

Added: this document, `tools/avatar/check-r2-hair-candidate.mjs`, its unit test, and one
`package.json` script.

**Unchanged:** every runtime file, `hairSrcForR2`, `R2_MANIFEST`, every asset, z and transform
table, every golden baseline, the hairstyle picker and the hair-colour picker, the shop, catalog,
Supabase, Edge Functions, migrations, RLS and all student data. **No hairstyle is produced, wired,
registered or removed, and no AI was used or invoked.**
