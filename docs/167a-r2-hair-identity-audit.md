# 167A — R2 hair-identity audit: the seven hairstyles the R2 render ignores, D-102

**Status:** `SUPERSEDED IN PART — see D-114 (2026-08-29)` · was `OWNER_DECIDED_OPTION_D — UI_HONESTY_IMPLEMENTED, OPTION_A_DEFERRED`
(owner, 2026-08-20 — see §10), and before that `DESIGN_READY_AWAITING_OWNER_DECISION`. The defect
this document measures is now closed for **one** of the seven styles; the measurements below stand
unchanged, and re-deriving the document is a separate task.
**Type:** read-only audit + geometric measurement. **The audit itself implements nothing** — the
decision it asked for was taken on 2026-08-20 and is implemented separately (§10). It changes no
runtime, resolver, manifest, asset, z, transform, test, golden, catalog, migration, Edge Function,
Supabase object or flag. It adds one **read-only measurement tool** and this document.
**Related:** D-101 (R2 is the default render; this gap is recorded there as a known, never-pilot-tested
trade-off), D-079 (headwear re-seat), D-080 (eyes re-seat), D-081 (face re-seat), D-082 (the torso
audit that measured reuse to be **impossible** — the opposite outcome to this one), D-083 (whole-avatar
C2 fallback), D-033 (AI **rejected** for base/rig layers — hair is one of them), D-034 (AI permitted for
shop/cosmetic overlays — **not** applicable here), D-057/D-058/D-061 (base decomposition + the accepted
faint alpha residue), D-059 (judge at real render scale, never on the asset composite), D-071 (render
scales), 155D/155F (the C2 hairstyle set and its legacy alias map).
**Render state:** `AVATAR_R2 = true` — R2 is the **default render for every browser** since D-101
(2026-08-08). This is no longer a pilot-gated question: the behaviour described below is what students
see in production today.

---

## 1. The defect, stated precisely

On the C2 render path a student picks one of **seven** hairstyles and sees it. On the R2 render path
the choice is read, validated, stored — and then **discarded at render time**:

> **Historical as of 2026-08-29 (D-114).** The code below is the resolver **as it stood when this
> audit was written**. It is quoted here because the whole document is derived from it; it is no
> longer what ships. `hairSrcForR2` now reads the identity and resolves a per-style asset when one
> is registered, falling back to `northstar` otherwise — so the defect is closed for `afro` and
> still open for the other six styles.

```js
// js/avatar-layers.js:443 — SUPERSEDED, kept for provenance
export function hairSrcForR2(identity) {
  const e = r2Entry(R2_MANIFEST.hair["northstar"]);
  return e ? r2Path("hair", "hair-northstar", e) : null;
}
```

The parameter `identity` is accepted and never read. Every R2 render resolves the single asset
`hair/hair-northstar-v1.webp`, whatever the student chose. For comparison, the C2 resolver two hundred
lines above it does honour the choice (`hairSrcForC2`, `js/avatar-layers.js:212`), across the union of
legacy and C2 keys (`js/avatar-layers.js:191-205`).

**This is not a missing feature — it is an overridden choice.** The avatar page still offers the seven
styles, the RPC still validates and persists them (migration `20260613200133`, whitelist of 11 legacy ∪
C2 values), and `window.__flags()` reports nothing wrong. The student changes their hairstyle, the
change is saved, and the picture does not move. Hair **colour** still works — it is a token tint applied
to whichever asset resolves — so the avatar reacts to one half of the same panel and ignores the other.

Scope of who is affected, **re-measured read-only on 2026-08-20** (counts only, no identifiers):
**28 students**, of whom **23 resolve the `neutral-medium` base and therefore render R2** — so all 23
see the North Star hair. Within those 23 the stored hairstyle is **20 `(unset)`, 2 `default`, 1
`buzzcut`**: **1** had stored an explicitly non-default style, the other 22 stored `default` or
nothing. §3.5 below shows the 22 are **also** not
seeing their default — the single R2 asset is not the visual equivalent of C2's default `short`.

> **Re-measured 2026-08-20.** The figures above are a fresh read-only aggregate — role, stored
> hairstyle and resolved base key, counts only and no identifiers — replacing the D-101 aggregate
> (2026-08-08) this audit was first written against. The headline is unchanged: that aggregate also
> gave **23 on R2**. What the re-measurement adds is the breakdown within those 23, and it confirms
> rather than revises every conclusion below. It is a point-in-time count and moves as students edit
> their identity.

## 2. Why it happens — the mechanism, not the mistake

Hair is a **mandatory** layer of the decomposed R2 stack, not a cosmetic. `r2StackSrcsFor` returns the
whole stack or `null`, and `null` means the complete C2 avatar renders instead
(`js/avatar-layers.js:487-490`):

```js
const hair  = hairSrcForR2(identity);
if (!base || !blush || !face || !eyes || !eyes.iris || !eyes.fixed || !hair) return null;
```

So the resolver could not simply return `null` for an unproduced style without dropping that student's
**entire avatar** to C2 — which is a real option (§4, option C), but a whole-avatar decision, not a
hair decision. The single-asset resolver was correct for the Phase-2 neutral MVP it was written for: one
base, one face, one eye set, one hair. D-101 then made that MVP the default render for everyone without
closing this item, and recorded it as a known trade-off.

## 3. What was measured

New tool, tracked and reproducible on a fresh clone:

```
npm run avatar:r2-hair-fit        # tools/avatar/measure-r2-hair-fit.mjs — read-only, writes NOTHING
```

It is deterministic and uses **no AI**. Both runtime WebP inputs are SHA-pinned, so the numbers below
cannot silently drift away from what ships (`body-neutral-medium-v2.webp` `28765eea…`,
`hair-northstar-v1.webp` `3edc70bc…`). Everything is expressed in the shared **160×240 C2 canvas** so
the two render paths are directly comparable: served 512×768 × 0.3125. Landmarks use an alpha floor of
64 and a minimum run of 4 px, so the accepted faint alpha residue (D-059/D-061) cannot move one. The
seven C2 hair assets are measured from their **path data** — exact line and quadratic-Bézier column
crossings, never from their comments.

### 3.1 The R2 head is dimensionally the C2 head, shifted down

| landmark | R2 measured | C2 contract (`cx=80 cy=50 r=30`) | delta |
|---|---|---|---|
| skull width (widest row) | **60.0** | 60 | **0.0** |
| skull centre x | **80.5** | 80 | **+0.5** |
| bottom (neck / circle bottom) | **81.6** | 80 | **+1.6** |
| **crown (top)** | **31.6** | 20 | **+11.6** |
| head height | 50.0 | 60 | −10.0 |

Width, centre and chin line coincide; the R2 skull is simply **shorter, hanging from the same jaw** —
its crown sits 11.6 C2 units lower. That is the same *kind* of offset the eyes slice already absorbed
(D-080: C2 eye-line 46 → R2 57, a `translateY(4.4%)` wrapper), and it is why the D-079 finding that
C2-canvas **hats align natively** is true and yet says nothing about hair: a hat only has to sit *near*
the crown, while hair has to *meet the hairline*.

### 3.2 The R2 hair layer

Envelope `x 40.6..118.1`, `y 6.3..75.6`, 24 265 drawn px. It rises **25.3 units above the bald skull**
(crown 6.3 vs 31.6) and drops **side locks to y ≈ 75**, just above the neck at 81.6. Its forehead
hairline is irregular by design — per column across the forehead it swings between **33.8 and 50.3** —
because it is painted hair with strands, not an arc.

### 3.3 The vertical offset each C2 style shows (forehead band x 65..95)

Outside that band the two paths stop describing the same feature — a C2 cap ends in a temple point
while the R2 hair drops a side lock past the ear — so edge columns are excluded as non-evidence.
Per style, the tool reports the **mean** column delta and the **spread** between its columns; both are
given here unreduced, because the spread is what says how much the mean can carry.

| style | delta (mean) | mean expressed as translateY | column spread | x-span | lowest y |
|---|---|---|---|---|---|
| `short` | +6.8 | 2.8 % | 18.0 (−1.5…+16.5) | 52..108 | 56 |
| `tousled` | +6.7 | 2.8 % | 18.2 (−1.6…+16.5) | 50..110 | 55 |
| `curly` | +3.9 | 1.6 % | 21.2 (−6.5…+14.7) | 44..113 | 61 |
| `long` | +8.7 | 3.6 % | 18.2 (+0.3…+18.5) | 41..119 | **146 — drapes onto the body** |
| `ponytail` | +3.2 | 1.3 % | 17.8 (−5.2…+12.6) | 52..117 | **123 — drapes onto the body** |
| `buzz` | +6.9 | 2.9 % | 17.4 (−1.4…+16.0) | 53..107 | 47 |
| `afro` | +5.3 | 2.2 % | 17.1 (−3.0…+14.1) | 34..126 | 61 |

Three separate statements, deliberately not merged:

1. **Every style's misfit is primarily vertical.** Lateral extent already matches the R2 skull (§3.1:
   width 60.0 vs 60, centre 80.5 vs 80), and no style needs a scale or horizontal shift to reach it.
2. **A single shared transform of roughly +2.8 % is a candidate**, since the seven means fall between
   +3.2 and +8.7 units. It is a candidate because the means cluster — not because it has been tried.
3. **That candidate is not validated, per style or at all.** The column spread is ~17–21 units in every
   case, wider than the differences between the means it would replace. Most of that spread is the R2
   reference hairline's own strand irregularity (§3.2, swinging 33.8–50.3 across the forehead), which
   is why the numbers can locate the offset only to roughly ±8 units. Whether one shared value, seven
   per-style values, or neither is right is a question for a render-scale visual review with per-style
   residuals — not something this measurement settles, and no such review has been run.

No shared tolerance is proposed here. Inventing one after the fact would turn a spread the measurement
cannot resolve into a pass mark it did not earn.

### 3.4 The base pixels the R2 hair hides are colour-compatible with the visible skin

The decomposed base was cut *under* the North Star hair, so the area that hair permanently hides was
reconstructed, not observed. Any style with less coverage would expose part of it, so what is there
matters. Measured on colour alone:

| region | pixels | mean RGB | sd |
|---|---|---|---|
| hidden under the R2 hair | 4 305 (20.0 % of the head) | 246.0 186.9 126.5 | 28.9 26.3 21.1 |
| visibly painted skin | 17 240 | 245.5 184.5 123.7 | 29.9 28.5 24.8 |

Mean colour distance **3.7** on a 0–441 scale, with comparable variance.

**What this does and does not support.** The hidden base pixels are, *on average*, colour-compatible
with the visible skin. That lowers the suspicion of an obvious colour hole — a flat grey patch, a
transparent gap, a leftover of a different hue. It **cannot approve the exposure**: a mean over 4 305
pixels says nothing about where those pixels sit, so it cannot show that the scalp is finished, that
the hairline and crown carry correct shading, that ear detail exists, or that any particular region a
shorter cut would reveal is presentable. **Spatial inspection and a render-scale visual review are
still outstanding**, and this figure is not a threshold: it is not a pass mark, and no pass/fail
tolerance is defined on it.

### 3.5 The single R2 asset is not the equivalent of C2's default

Envelope width: North Star **77.5**, `long` 78, `curly` 69, `tousled` 60, `short` 56, `buzz` 54.
Lowest drawn y: North Star **75.6**, `buzz` 47, `tousled` 55, `short` 56, `curly`/`afro` 61.
So the asset every R2 student receives is **as wide as `long` and lower than `curly`** — a medium-long
style with side volume. C2's default is `short` (`DEFAULT_HAIRSTYLE_C2`, `js/avatar-layers.js:187`).

**Consequence:** the 22 students who stored `default`/nothing are not seeing "their" hairstyle either.
The gap is not "1 of 23 affected" — it is **23 of 23 shown a style none of them selected**, of whom one
had actively picked something else. This also means there is no style that can honestly be called
"North Star-equivalent", which directly constrains option C below.

## 4. The options, compared

Qualitative trade-offs only. **No time, resource or money estimate was produced** — "what it takes"
below describes the *kind* of work and which gates it must pass, not how long it would run.

| | what | what it takes | what it means for the student |
|---|---|---|---|
| **A** | Produce **6 more North Star hair rasters** (one per remaining C2 style) and register them; `hairSrcForR2` keys on `identity.hairstyle` with the 155F alias map. | **Art production.** Human paint-over — **D-033 rejects AI for base/rig layers, and hair is one**. Six assets, each through Gate-3-style promotion + owner sign-off. | Nothing lost. This is the correct end state. |
| **B** | **Re-seat the existing C2 hair SVGs** onto the R2 figure with a wrapper transform, as headwear/eyes/face were. | Code, not art: one resolver, one transform table, tests, goldens — **plus a render-scale visual review and per-style residuals, which §3.3 leaves open**. §3 found no geometric obstacle; it did not validate a transform. | **Flat two-tone SVG hair on a painted raster head.** For 6 of 7 styles the North Star hair is *replaced* by cheaper-looking art on the **identity** layer — the mixed-stack condition the pilot's §8 gate treated as a defect. Hard to walk back once students have seen it. |
| **C** | Treat a non-produced hairstyle as an **unsupported identity** → whole-avatar C2 (the D-083 pattern; `r2StackSrcsFor` already returns `null` → C2). | One guard, no art, reversible. | The student sees their real hairstyle — on the **older, flatter C2 figure**, losing the painted avatar entirely. And per §3.5 **no style is North Star-equivalent**, so the owner would have to *nominate* one style to keep on R2, or C2 swallows everyone. |
| **D** | Change **nothing about the render**; stop the UI from implying a choice that has no effect (mark the styles as not yet available on the new avatar, or state it on the avatar page). | Frontend copy/state only, fully reversible. The smallest of the four. | The picture stays as it is — but the app stops silently ignoring them. Converts a hidden defect into a stated limitation. |

A and D compose: D is honest now, A is right later. B and C are mutually exclusive with each other.

## 5. Recommendation

**D now, A as the real fix. Not B.**

- **Not B**, even though §3 found **no geometric obstacle** to it: it is the only option that
  permanently degrades the thing the whole 167A track exists to deliver — the painted figure — and it
  does so on the identity layer, for the majority of styles. Because the geometry does not rule it out,
  this is a **product** decision rather than a technical one, and the product answer is that "cheaper
  hair on a better body" is a worse avatar than the one we have. Recording it as *not blocked* matters,
  though: if the owner later prefers coverage over finish, the geometric groundwork is done — the
  per-style transform validation (§3.3) would still be ahead of it.
- **Not C as the immediate step**, because §3.5 removes its footing: with no North Star-equivalent
  style, C either drops nearly everyone to C2 or requires nominating a style that is measurably not
  what the asset shows. Trading the whole painted avatar for a correct haircut is also not obviously a
  win for a child.
- **D now**, because the defect that actually harms a student today is being **ignored**, and D fixes
  exactly that with the smallest change of the four and full reversibility.
- **A as the fix**, because it is the only option where the student both keeps the painted avatar and
  gets the hair they chose. It is art-limited, so it should enter the art queue as itself rather than
  be worked around in code.

If the owner disagrees on the aesthetics, **B needs no new art** — but it is not shovel-ready either:
the shared-transform candidate in §3.3 is unvalidated, and each style would need its own render-scale
review before it could ship.

## 6. What this audit does NOT establish

- **It does not prove B looks acceptable.** Geometry is necessary, never sufficient. Per D-059, fringe
  and fit must be judged at **real render scale on the actual surface** (quiz, hub, avatar page), not
  on a full-res composite — the asset view flatters it. No such review has been done here.
- **No transform is validated.** §3.3 offers the ~2.8 % shared value as a **candidate** only. Neither it
  nor any per-style value has been rendered, reviewed or checked against residuals, and the ±8-unit
  bound is the limit of what the numbers can say, because the R2 reference hairline is itself irregular.
- **`long` and `ponytail` are less settled than the rest.** They drape to y 146 / 123, i.e. onto the
  torso, where C2's body geometry and the painted R2 body are not the same object. §3 measured the head,
  not the shoulders (R2 shoulder onset: y 83.8).
- **§3.4 is an average colour comparison only** — no spatial inspection was performed. It cannot show
  that the area a shorter cut exposes is finished, correctly shaded, or presentable anywhere in
  particular, and it defines no pass/fail tolerance.
- **The live distribution is a point-in-time count (2026-08-20), not a standing fact** (see the note
  in §1). It was re-measured for this audit; it moves as students change their identity.
- **No visual artefact, no user report and no telemetry** informs this document. There is none: D-101
  activated R2 with no telemetry added, and no pilot user ever observed a non-default hairstyle.

## 7. A conflict found while auditing (not fixed here)

Reported rather than silently corrected, per `CLAUDE.md`:

- `docs/project-state.md` §Current Commit still records `origin/main = ad899b6`, which was already
  several merges behind when this audit was written and falls further behind with every merge. The
  fix is for that entry to stop quoting a SHA it cannot keep current — not to re-point it at today's.
- The headers of `167a-r2-torso-asset-production-plan.md`,
  `167a-r2-cosmetic-slot-completion-audit.md` and `167a-r2-torso-a2-art-brief.md` still state
  **`AVATAR_R2 = false` (per-browser opt-in only)** and `PILOT_WAVE_1_IN_PROGRESS`. D-101 superseded
  both. A reader landing on those documents today is told the flag is off when it is on.

Neither is touched by this audit.

## 8. The decision requested (D-102) — ANSWERED, see §10

1. **Which option** — A, B, C or D, or D+A as recommended.
2. If **A**: does hair count as a base/rig layer under D-033 (so: human paint-over only), and is the
   owner's reading the same? This audit assumes yes.
3. If **B**: explicit acceptance that 6 of 7 styles render as flat SVG on the painted figure, pending a
   render-scale visual review with owner sign-off per slice.
4. If **C**: which single style is nominated as the North Star equivalent, knowing §3.5 says none is.

## 9. Boundaries of the audit itself

Added: `docs/167a-r2-hair-identity-audit.md` (this file), `tools/avatar/measure-r2-hair-fit.mjs`
(read-only; writes no file, not even under `tools/avatar/build/`), one `package.json` script entry, and
the register entry D-102 in `docs/project-state.md`.

**Unchanged:** every runtime file, `hairSrcForR2`, `R2_MANIFEST`, every asset, every z and transform
table, every test and golden baseline, the shop, catalog, database, migrations, RLS, Edge Functions,
`AVATAR_R2`, and the D-062 atomic gate / D-083 fallback. No hairstyle is produced, wired or removed;
no student record is read or written by anything this adds.

## 10. Owner decision (2026-08-20)

**Option D now. Option A remains the real fix. B and C are declined.** The recommendation in §5 was
put to the owner and accepted as written.

### What was decided

- **D is implemented now.** On a render path that ignores the stored hairstyle, the avatar page stops
  offering shape controls and states the situation instead. **This changes the UI promise only — it
  changes no render, resolver, manifest, asset, z, transform, database, migration or flag.**
- **A is approved as the visual end state**, and stays **blocked** on what it has always been blocked
  on: six hand-painted North Star hair rasters, each through per-asset promotion and provenance, with
  **D-033 barring AI for base/rig layers — and hair is one**. It enters the art queue as itself.
- **B is declined.** §3 found no geometric obstacle, so this is a product judgement and is recorded as
  one: flat two-tone SVG hair on the painted figure, on the identity layer, for 6 of 7 styles, is a
  worse avatar than the one we have. If coverage is ever preferred over finish, the groundwork stands
  and the unvalidated per-style transform of §3.3 is what remains ahead of it.
- **C is declined**, on §3.5: no style is North Star-equivalent, so C would either drop nearly every
  student to C2 or require nominating a style the asset measurably is not.

### What D preserves

- **Stored hairstyle values are preserved.** Nothing is cleared, reset or migrated — they are simply
  not writable from a path that would not show them, so they stay valid the day A ships.
- **Hair colour keeps working on R2.** The R2 stack still tints the hair map from
  `identity.hair_color`; this decision does not touch that path.
- **A path that honours the choice keeps the full control** — the seven buttons, the active marking
  and the success confirmation are unchanged on C2.

### One finding that changed the wording

The message first proposed for the panel said *“Din hårfarve virker allerede.”* Checking it before
shipping it showed it would have been a **second false promise**: the tint works, but **no hair-colour
picker exists anywhere in the app**. `set_avatar_identity` is called with `p_body_type`, `p_hairstyle`
and `p_skin_tone` only — never `p_hair_color` — which matches the note in `js/avatar-layers.js` that
155E shipped *“the data contract only”*; a read-only count on 2026-08-20 found **all 28 students with
`hair_color` unset**, all rendering the default `brown`. The wording was corrected to say plainly that
hair colour cannot be chosen yet. **Building that picker is 155E's missing UI, not part of D.**

> **Followed up (2026-08-20, separately):** 155E's picker has since been built, so the panel message
> no longer says colour cannot be chosen — it points at the control instead. The shape gap this
> audit is about is unchanged, and option A is still the fix for it.

### Reversibility

**D is fully reversible and self-retiring.** The section is driven by one capability predicate keyed on
the render path actually mounted. When A registers hair assets that honour `identity.hairstyle`, the
R2 path starts serving the choice and the control returns on its own — there is no collection of
special cases to unpick, and no owner decision is embedded in code.
