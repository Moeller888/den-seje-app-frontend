# 167A — Option A production spec: the seven R2 hairstyle rasters

**Status:** `PRODUCTION_IN_PROGRESS — AFRO_LANDED — GATE_CONTRACT_REVISED_D-115` (2026-08-30).
Was `PRODUCTION_AUTHORISED — NOT STARTED` (owner, 2026-08-21 — **D-104**, identity-lock accepted
**D-105**, first slice = all seven **D-106**); before that `SPEC_READY — PRODUCTION_METHOD_UNDECIDED`.
**§5.2, §5.3 and §6 were revised by D-115:** the visual acceptance gates measure the finished,
decoded 512×768 runtime asset, and `no-floating-islands` uses 8-neighbour connectivity.
**§4 and §6 were revised again by D-116:** every style gains a measured **crown** and
`within-style-envelope` now bounds the top as well as the width. No pre-existing threshold,
envelope or cleanup algorithm changed by either.
> **Reported, not silently fixed:** the `NOT STARTED` half of the old status line was already stale
> before this revision — D-111 produced a first candidate round and D-114 registered the approved
> afro. Re-deriving the rest of this document against that is a separate task; the status line is
> re-pointed here, and §3's "seven assets" scope is unaffected.
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

### 2.2 The replacement identity-lock: split authority — ACCEPTED (D-105)

Masking **was** D-042's identity-lock, and it cannot apply to a shape that is not in the Master. The
hole is closed by splitting the authority instead of pretending one source covers both:

| What | Authority | Enforced by |
|---|---|---|
| **Shape** | the C2 style envelope — the silhouette the student already recognises | `within-style-envelope`, `centred-on-the-skull`, `covers-the-crown`, `clears-the-eye-line`, `respects-the-neck` (§6) |
| **Finish** | the Northstar Master — line art, value structure, palette | `luminance-map`, `alpha-clean-no-halo`, `no-floating-islands` (§6), as far as finish is measurable at all |
| **The residue** | the owner | per-asset visual sign-off at real render scale (D-059). **No measurement replaces this.** |

**Accepted by the owner on 2026-08-21 (D-105).** It was written as the author's reading and flagged
as correctable; it is now the binding identity-lock for option-A hair production, and it replaces
masking for this layer.

What it still deliberately does not claim: the gates bound geometry and finish, they do **not**
detect style drift or identity drift (§7). **Accepting the lock does not weaken that limit — it
makes the owner sign-off row load-bearing**, because it is the only place style fidelity is ever
judged. The carve-out is **hair only**: free AI regeneration of the base, face or eyes remains
forbidden, and so does any change to the Master's proportions, pose, palette or line-art convention
(D-032).

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

| Style | x-span | Crown (highest y) | Lowest y | Drapes onto the body |
|---|---|---|---|---|
| `short` | 52…108 | 20.50 | 56 | no |
| `tousled` | 50…110 | 13.00 | 55 | no |
| `curly` | 44…113 | 14.08 | 61 | no |
| `long` | 41…119 | 18.50 | **146** ⚠ | yes |
| `ponytail` | 52…117 | 19.50 | **123** ⚠ | yes |
| `buzz` | 53…107 | 21.50 | 47 | no |
| `afro` | 34…126 | 6.02 | 61 | no |

**The crown column was added by D-116, and it closes a real hole.** Until then nothing bounded how
HIGH a candidate could reach: `covers-the-crown` is a *minimum*, `respects-the-neck` bounds the
bottom, and `within-style-envelope` bounded only x. A `short` candidate reached y 9.4 against
short's own 20.5 — a spiky cut wearing a neat cut's name — and scored 11/11. All four numbers in
this table come from the same tool and the same exact path crossings
(`measure-r2-hair-fit.measureC2Style`); a test re-derives every one of them for all seven styles
and fails if the table drifts from the artwork.

⚠ **The two draping extents are the weakest numbers in this spec, and D-106 knowingly ships them.**
Every other landmark in this section is measured on the **shipping R2 base**; `long` 146 and
`ponytail` 123 are measured on the **C2 body**, whose shoulders and torso are not the same object
as the R2 figure's (R2 shoulder onset: 83.8). For those two styles the `respects-the-neck` gate is
therefore a **bound, not a fit** — it stops the artwork running off the canvas, and says nothing
about where the hair should actually end. §8 attaches the acceptance condition that follows.

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
  → authoring alpha cleanup          (clean-r2-hair-alpha.mjs, §5.4)
  → premultiplied 2×2 box downscale ÷2
  → served alpha cleanup             (clean-served-alpha.mjs — the SAME rule, coarser grid)
  → 512×768 RGBA reference PNG
  → cwebp -lossless -exact -z 9 -metadata none
  → decode with the pinned dwebp     ← THIS is what the acceptance gates measure (§6, D-115)
  → assets/avatar-r2/hair/hair-<style>-v1.webp
```

The decoded asset must equal the reference **byte for byte**; that is what proves the encode was
lossless and that no pixel of the accepted artwork moved. `tools/avatar/build-r2-hair-runtime-asset.mjs`
runs this chain and returns every intermediate, writing only into gitignored scratch — producing
the bytes that would ship is **not** shipping them.

### 5.3 Alpha

`alpha >= 128` is ink (D-071 render-scale convention). Soft pixels with no ink neighbour are halo
and are counted against the candidate — the D-059/D-061 lesson that a matte's residue is judged at
render scale, on the surface, not on the full-res composite.

#### The budget is TWO numbers, at two scales — and they are enforced in two places (D-115)

| Scale | Budget | Where it is enforced |
|---|---:|---|
| authoring 1024×1536 | **64** | `clean-r2-hair-alpha.mjs` — the `authoringWithinBudget` postcondition, which refuses to *write* a cleaned PNG above it |
| **runtime** 512×768 | **16** | the `alpha-clean-no-halo` **runtime gate**, on the **decoded** asset |

This mirrors the torso path exactly: `check-r2-torso-candidate` allows `MAX_ORPHAN_SOFT_PX = 64`
at authoring scale, and `promote-r2-torso-asset` allows `MAX_ORPHAN_SOFT_PX_SERVED = 16` after the
÷2 downscale — documented there as *"64 authoring px ÷ 4"*.

**Neither number has ever changed.** What changed twice is where they are read. The gate first
declared 16 while citing that convention and applied it to the *authoring* candidate — four times
stricter than the torso gate at the same resolution. That was corrected to measure `downscaleHalf()`
itself. **D-115 then moved it one step further, to the buffer that actually ships:** the downscale
alone is still an intermediate, because the served cleanup pass runs after it. Gating on the
intermediate meant refusing candidates for dust the pipeline was about to remove anyway — measured
on `short`, 25 orphans in the intermediate against 14 in the shipped asset. `clean-r2-hair-alpha.mjs`
renamed its postcondition `servedWithinBudget` → `runtimeWithinBudget` to match, and still reports
the intermediate count so the two can never be confused again.

### 5.4 Orphan-dust removal — permitted, bounded, and not an approval

A generated candidate carries thousands of isolated pixels at 1–3 % opacity: numerical dust from
the image model's encoder. Measured on the afro candidate — 5 938 orphan-soft pixels at authoring
scale, mean alpha **2.4/255**, 97 % of them at alpha ≤ 8. They are invisible, and they were the
only thing standing between a geometrically correct candidate and the alpha gate.

`tools/avatar/clean-r2-hair-alpha.mjs` removes them, deterministically and with no AI, network or
randomness. A pixel is cleared **only if BOTH hold on the ORIGINAL input**:

1. `alpha < 24` — the project's existing **`ALPHA_FLOOR`**, taken unchanged from
   `openai-generate-torso-item.mjs` (*"below this, a pixel is background glow rather than
   artwork"*). It was chosen for the torso work, **before any hair candidate existed**, and was
   deliberately not fitted to the afro's numbers — a threshold picked to make one asset pass
   proves nothing about the next one.
2. it is **orphan-soft by this gate's own definition** — `0 < alpha < 128` and none of its four
   orthogonal neighbours is ink.

A cleared pixel becomes `0,0,0,0`. Every other byte is copied unchanged. Decisions are read from a
snapshot of the original, so clearing one pixel can never orphan its neighbour in the same run:
**no cascade, and the result does not depend on scan order.**

**Geometry cannot move.** Ink is `alpha >= 128`; the tool only ever clears below 24. Ink count,
envelope, components and every geometric gate are therefore identical before and after — and the
sidecar report proves it by measuring both, rather than asserting it.

**It can only write to one directory.** Output must resolve inside
`tools/avatar/build/alpha-cleanup/` — a **positive allowlist**, applied to the PNG and its sidecar
alike. The first version used a blacklist of runtime and protected prefixes instead; that was
wrong, and not marginally so. It permitted `docs/`, `index.html`, `package.json`, and any path
outside the repository entirely. A blacklist has to enumerate everything that must be protected
and is wrong the moment something is added to the tree; an allowlist names the one place writing
is intended and refuses the rest by default. The tool also refuses to overwrite an existing file,
refuses input and output resolving to the same file, and requires a `.png` extension.

**The allowlist is resolved through symlinks, not merely lexically.** `resolve()` + `relative()`
answer a question about strings; the write does not. `tools/avatar/build/` is gitignored scratch
that tools create and delete freely, so a link planted inside it satisfied the string check and
still sent the bytes anywhere on disk — and a **dangling** link was worse, because `existsSync()`
follows it, finds nothing, and reports `false`, so the "already exists" guard waved through exactly
the plant that escapes. The presence guards now use `lstat`, and both files are created with
**`O_EXCL`**, which the kernel refuses to satisfy through a symlink at the final component.
The physical check is anchored on the **repository root**, with the write root re-derived from it
lexically: comparing `realpath(path)` against `realpath(writeRoot)` would be self-defeating, since
a linked write root makes both sides resolve to the same outside directory and the escape would be
accepted precisely when it succeeded.

**The commit is ordered, because two files cannot be published atomically.** Both are staged under
unguessable temporary names in the destination directory, `fsync`ed, and renamed into place — the
**sidecar first**. The two possible crash residues are not equally bad: a report with no image is
obviously incomplete and makes the next run refuse, whereas an image with no report looks exactly
like a validated output while carrying no evidence that anything was checked. The ordering leaves
only the harmless residue reachable.

**It is fail-closed.** Everything is computed and checked *before* anything is written: the
cleaned image is encoded, decoded again, and compared to what was intended, then **nine
postconditions** are evaluated — the authoring and served budgets, geometric identity, no change
at or above `ALPHA_FLOOR`, none at or above ink, none with an ink neighbour, every removed pixel
fully transparent, every non-qualifying byte untouched, and an exact encode round-trip. If any one
of them fails the tool throws and writes **nothing at all** — no PNG, no sidecar, no partial file.
A sidecar carrying `"pass": true` therefore cannot exist unless all nine actually ran and actually
held.

**Cleanup is not approval.** It removes a measurement obstacle, nothing else. Every geometry and
identity requirement in §4 and §6 still applies unchanged, and per-asset owner sign-off at real
render scale (D-059, D-105) is still the only place style fidelity and identity are judged. A
cleaned candidate that passes all eleven gates is a candidate for review — never a promoted
asset.

## 6. The measurable gates

`tools/avatar/check-r2-hair-candidate.mjs` — deterministic, no AI, no network, **writes nothing**.

```
node tools/avatar/check-r2-hair-candidate.mjs <candidate.png> <style>
npm run avatar:r2-hair-check -- <candidate.png> <style>
```

**Eleven named checks, of two kinds (D-115).** The distinction is the whole point and the tool
prints it: a precondition asks whether the delivered file is a usable *input*; an acceptance gate
is the *visual judgement* and therefore measures the decoded 512×768 asset a browser paints.

**Authoring preconditions (2)** — measured on the 1024×1536 source, because no downscale, cleanup
or lossless encode can create or repair either property:

| Precondition | Refuses |
|---|---|
| `dimensions` | anything but 1024×1536 RGBA |
| `luminance-map` | colour baked into the asset (§5.1) |

**Runtime acceptance gates (9)** — measured on the **decoded** asset, after the full §5.2 chain:

| Gate | Refuses |
|---|---|
| `has-ink` | an empty asset passing by vacuum |
| `covers-the-crown` | hair starting below y 31.6, leaving scalp showing |
| `clears-the-eye-line` | hair reaching the eyes |
| `respects-the-neck` | ink below y 81.6, except for `long`/`ponytail` up to their measured extent |
| `within-style-envelope` | a silhouette outside its C2 x-span (±4 units) **or rising more than 4 units above its style's own crown** (D-116) |
| `centred-on-the-skull` | artwork hanging off the side of the head (centre ±2 of 80.5) |
| `no-floating-islands` | detached specks — **8-neighbour connectivity** (see below) |
| `alpha-clean-no-halo` | orphan soft pixels above the served tolerance |
| `legible-at-render-sizes` | a shape that dissolves at the four D-071 sizes |

Before any gate runs, the decoded WebP is compared to the reference the encoder was handed. If
they differ, the measurement basis is not the shipped image and the run is disqualified outright.

#### `no-floating-islands` counts corners (D-115)

A pixel joins the component it touches horizontally, vertically **or diagonally** — all eight
neighbour positions. 4-neighbour connectivity sees only the four sides, so two pixels sharing a
corner are "separate" to the algorithm while being physically joined on screen. After a ÷2 box
downscale that is routine: averaging 2×2 blocks regularly leaves a silhouette's outermost pixel
attached to the mass only at a corner, and calling it a floating island reports a defect no student
can see. Every other component algorithm in the R2 asset contract was already 8-neighbour; the hair
gate was the lone outlier.

**The consequence, stated rather than buried:** an *unbroken diagonal chain* of ink counts as
connected under this rule, however long and however thin. That is a real widening and it is
accepted deliberately — such a chain is continuous ink on screen, and these gates have never
claimed to judge whether a shape is good hair (§7). What the rule still refuses is ink separated by
**at least one whole pixel** of non-ink.

**The orphan-soft definition is a different question and did NOT change.** It still asks whether a
faint pixel is attached to an edge, using the **four** orthogonal neighbours, because it decides
what the cleanup tools may *delete*. Widening it would licence removing more artwork; widening the
island rule only regroups pixels and removes nothing.

Each gate is exercised in both directions by `tests/unit/avatar-r2-hair-candidate-check.test.mjs`
(37 tests, CI-safe — no vendored binary): a clean candidate passes, and one deliberate defect trips
exactly the gate it should. A gate that only ever sees good input cannot be shown to work.

Since D-116 it also pins the crown bound in both directions, per style, and with a counterfactual showing that the pre-D-116 x-only rule accepts the very fixture the two-axis rule refuses. Since D-115 that suite also pins the connectivity contract from both sides, on synthetic fixtures
that reproduce the real `(260,30)` case exactly — alpha 128, one diagonal ink neighbour at 225, no
orthogonal ink. The counterfactual runs the **production flood fill with the old neighbour set**
(and first asserts that, given the production neighbours, it reproduces `countComponents` exactly),
so "it would have failed under 4-neighbour" is a measurement rather than a claim. Genuinely
detached ink — one whole pixel of clearance or more — still fails, singly and in groups.

`avatar-r2-hair-runtime-asset.test.mjs` (16 tests) carries the same proofs on REAL pixels: the
codec round-trip, the shipped afro, and the `short` candidate. It drives the vendored libwebp, so
it is listed in `tests/unit-ci-exclusions.mjs` and runs locally only; its structural claims are
duplicated on the synthetic fixtures above, so CI coverage did not shrink. Its lossy-encode
counterfactual proves the byte-for-byte check can actually fail.

**The served half of the alpha gate was, for a time, not being measured at all.** The test helper
called `downscaleHalf(w, h, rgba)` and then read `.rgba`, `.w` and `.h` off the result — but that
function returns a *raw RGBA `Buffer`*, not an object. Those three properties were `undefined`,
the counting loop ran `y < undefined` zero times, and every served assertion in the file reported
**0 orphans regardless of what the candidate contained**: a gate that could not fail, which is the
exact defect this section claims to guard against. It was caught because 0 contradicted a
measurement of 1 292 taken on the real afro. The helper now passes the dimensions explicitly, and
the served numbers quoted in this document are measured ones. Two further suites cover the cleanup
tool: `avatar-r2-hair-alpha-cleanup.test.mjs` (23 tests) and `avatar-r2-hair-alpha-guards.test.mjs`
(21 tests), the latter including an end-to-end case where **17 served orphans fail the gate and 16
pass** while the authoring budget stays satisfied — so the served bound is proven to be the thing
deciding the outcome, not a number that happens to ride along.

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

## 8. Decisions taken, and the one condition they attach

**Nothing is open.** The production method (§2, D-104), the asset count (§3, D-104), the
identity-lock (§2.2, D-105) and the first slice (D-106) are all decided.

### 8.1 The condition D-106 attaches

`long` and `ponytail` ship in the first slice, so all seven styles are produced together. Those two
drape past the shoulder onset (83.8) onto the D-090 garment, and **the gates measure the hair alone
— they cannot see that composition at all.** The z-model is not the problem: hair renders at z40,
far above the torso garment at z1, so hair falls in front of clothing, which is correct and needs no
change.

The problem is visual, and it lands on the row D-105 made load-bearing. **For `long` and `ponytail`
only, owner acceptance additionally requires a COMPOSED review — the style rendered on the R2 figure
with a torso garment equipped, at real render scale (D-059).** Passing the gates is not sufficient
for these two, and no automated check substitutes for it. See §4's ⚠ for why their targets are the
weakest numbers here.

## 9. Boundaries of this change

Added: this document, `tools/avatar/check-r2-hair-candidate.mjs`,
`tools/avatar/clean-r2-hair-alpha.mjs`, three unit suites
(`avatar-r2-hair-candidate-check.test.mjs`, `avatar-r2-hair-alpha-cleanup.test.mjs`,
`avatar-r2-hair-alpha-guards.test.mjs`), and `package.json` scripts. The two tools share **one**
definition of orphan-soft, exported from the gate and imported by the cleanup tool, so the
threshold that decides what may be removed and the threshold that decides whether the result is
acceptable cannot drift apart.

**Unchanged:** every runtime file, `hairSrcForR2`, `R2_MANIFEST`, every asset, z and transform
table, every golden baseline, the hairstyle picker and the hair-colour picker, the shop, catalog,
Supabase, Edge Functions, migrations, RLS and all student data. **No hairstyle is produced, wired,
registered or removed, and no AI was used or invoked.**
