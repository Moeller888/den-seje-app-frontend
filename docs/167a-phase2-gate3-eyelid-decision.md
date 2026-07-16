# 167A Phase-2 Gate 3 — Eyelid Decision Worksheet (G3-EYELID)

Status: **✅ OWNER-COUNTERSIGNED: OPTION A CHOSEN (2026-07-16).** Review-only; nothing promoted; no runtime change.
Date: 2026-07-16. Producer: deterministic NON-AI tooling (no image generation).

**Purpose.** The eyelid/blink decision for the Gate-3 raster stack, ordered by owner
command 2026-07-16. Brief §4.5 defines the two options and already leans interim:
the raster eyelid is *"a refinement, NOT an MVP blocker"*. This worksheet provides
**measured evidence** for the decision. Tool:
`tools/avatar/build-eyelid-decision-preview.mjs`. Outputs in the gitignored
`tools/avatar/build/phase2/gate3-d057/eyelid/`.

## 1. The options (brief §4.5)

| | Option A — INTERIM (recommended) | Option B — raster eyelid |
|---|---|---|
| What | Keep the existing CSS-ellipse blink (`js/avatar-blink-engine.js`, skin-tone aware, 152E), **re-positioned to the North Star eye box** | New `eyelid-medium-v1` raster layer (skin-bearing → per skin tone, D-023) |
| Producer | wiring-only change, later gated code step | D-042 art-producer scope (masked editing) |
| Risk | lowest (engine already lives in prod on the C2 path) | new asset + per-tone variants + alignment risk |
| Brief's stance | explicitly allowed interim | "a refinement, NOT an MVP blocker" |

## 2. Measured evidence for option A (eyelid-decision-report.json)

- **Coverage ("no off-eye flash") is PROVEN, not assumed:** the tool searched the
  smallest symmetric ellipse that covers **every** eyes-layer px (fixed ∪ WP2 iris,
  10,755 px) at 100 % closure. Base eye-box halves (rx 49/ry 50) leave 800 px of
  lash tips uncovered; **rx 57 / ry 58 (oversize +8) → 0 uncovered px**.
- **Closure strip** (`lid-closure-strip(.png/-on-dark)`): 0/25/50/75/100 % sweep over
  the full Gate-3 stack — the lid reads as a lid at every state, on both backgrounds.
- **Wiring numbers (160-space, for the later gated code step):**
  centres **(66.7, 60.3) / (90.6, 60.3)** (cut-guides eye-opening centres — the
  blink registration value per the cut-guides note) · **rx 8.91 · ry 9.06**
  (= 57/6.4, 58/6.4; the measured no-flash minimum) · vs legacy engine values
  (68/92, cy 47, rx 7.6, ry 6.6).
- **Fill-colour finding (honest):** at full closure the engine's medium fill
  `#EDB888` reads slightly LIGHTER than the surrounding D-057 skin (visible ring in
  the stills; likely imperceptible at 88–132 ms blink speed). Measured raster skin
  around the lids: **`#FEC183`** (12,004-px ring sample). **Recommendation:** when
  wiring the raster stack, derive the lid fill from the raster base (per tone)
  instead of the C2 gradient constants.

## 3. Recommendation

**Option A (interim CSS-ellipse, re-positioned)** — the brief already authorises it,
the engine is production-proven, and the no-flash acceptance is now measured. Option
B stays available later via the D-042 path if full-closure stills (e.g. marketing
shots) make the fill-ring objectionable.

## 4. Owner decision checklist

- [x] `lid-closure-strip(.png/-on-dark)` + `lid-coverage-proof.png` reviewed.
- [x] **DECIDED: Option A (interim, re-positioned CSS-ellipse).**
- [x] The measured wiring numbers (§2) are adopted — centres (66.7,60.3)/(90.6,60.3),
      rx 8.91 / ry 9.06 @160, lid fill derived from the raster base per tone — as
      the binding parameters for the later, separately gated wiring step.
- [x] Acknowledged: no runtime change happens now; `avatar-blink-engine.js` is
      untouched until the wiring step is separately ordered.

## 5. Verdict

**Owner verdict: OPTION A CHOSEN · Date: 2026-07-16 · countersigned via owner
command (verbatim: "countersign eyelid-worksheetet — Option A valgt").**

**The eyelid decision is CLOSED: the Gate-3 raster stack blinks with the interim
CSS-ellipse lid, re-positioned to the North Star eye box.** Binding parameters for
the later, separately gated wiring step (from §2, measured):

- centres **(66.7, 60.3) / (90.6, 60.3)** @160-space (cut-guides eye-opening centres)
- **rx 8.91 · ry 9.06** @160 (= the measured no-flash minimum, 57/58 px in Master space)
- lid fill derived **from the raster base per skin tone** (medium ≈ `#FEC183`
  measured), not the C2 gradient constants

**Option B (raster eyelid, D-023/D-042) remains available later** as a refinement if
full-closure stills make the fill-ring objectionable. No runtime change is made by
this countersign; `avatar-blink-engine.js` stays untouched until the wiring step is
separately ordered.

## 6. Boundaries (binding)

Review-only. No runtime change (the blink engine is read, not modified); no
`assets/avatar-r2` write; no `R2_MANIFEST` change; `AVATAR_R2` stays `false`. No AI.
Master / D-057 / protect / all chain outputs untouched. Gate 3 stays gated; after
this decision the remaining Gate-3 item is the **integration composite** (own owner
command), plus the D-042 expression variants.
