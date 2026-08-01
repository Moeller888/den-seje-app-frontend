# 167A — A2 art brief: the Ridderdragt re-authored for the R2 figure, D-086

**Status:** `A2_ACCEPTED` (owner, 2026-08-01, D-088) — candidate 2 accepted; see §7. **Not promoted, not
wired**: nothing under `assets/avatar-r2/`, no `R2_MANIFEST` write, `torso` still absent from
`R2_SUPPORTED_COSMETIC_SLOTS`.
**Type:** production brief + QA contract + per-candidate sign-off record. No runtime, catalog, manifest or
asset change.
**Depends on:** D-085 (`A1_ACCEPTED` — the mask template this brief is measured against), D-086 (the
D-037 discharge that opened A2).
**Related:** D-034 (AI permitted for shop/cosmetic overlays), D-033 (AI rejected for base/rig — not this),
D-071 (render scales), D-058/D-061 (alpha-fringe lessons), D-083 (the C2 fallback that stays live until
A3 ships).
**Pilot status (unchanged):** `PILOT_WAVE_1_IN_PROGRESS`. **`AVATAR_R2 = false`.**

---

## 1. What is being drawn, and why that matters

**The Ridderdragt — the same product the student already owns.** Catalog row `armor-knight`, "Ridderdragt",
300 coins. This is a **re-authoring for a different figure**, not a new product: a student who bought
knight's armour must still see knight's armour. That constrains the design more than a blank brief would:

- It must read as **plate armour** at a glance — breastplate, shoulder line, a belt at the waist.
- It must be recognisably **the same item** as the C2 asset `assets/avatar/shirt/armor-knight.svg`, so a
  student switching between render paths does not think their purchase changed.
- Palette and rendering must sit with the Northstar Master's world: flat-ish shading, clean edges, no
  photoreal metal, no gradients that fight the base's line work.

**Why a re-authoring is needed at all** (D-082, measured): the C2 asset is drawn on a figure holding its
arms *out*; the R2 figure holds them *down against the body*. Every arm-side element of the old artwork
lands on empty canvas. No transform fixes that — only new art does.

## 2. The canvas and the masks

| property | value |
|---|---|
| authoring canvas | **1024×1536**, transparent, full-canvas overlay — no crop, no per-item offset |
| served | 512×768 WebP (encoded in the promotion step, not by the artist) |
| mandatory region | `tools/avatar/fixtures/r2-torso/torso-occlusion-hard-v1.png` — **97,698 px** |
| paintable region | `torso-edit-allowed-v1.png` — **124,027 px** (mandatory + ≤4 px blend + the optional hem extension) |
| forbidden region | `torso-protect-v1.png` — the exact complement of paintable: head, neck, bare arms, hands, legs |

**The rule in one line: every pixel inside `hard` must be fully opaque, and no pixel may fall outside
`edit`.** The masks are the accepted A1 template (D-085) and are not negotiable in A2 — if the art needs a
different silhouette, that is a change request against A1, not a QA exception.

### 2.1 Landmarks the design has to respect (Master coordinates)

| landmark | y |
|---|---|
| top of the collar ring | 524 |
| garment shoulder line | 560 |
| sleeve end (bare arm begins below this, outboard) | 714 |
| tee hem — where the base garment stops | 902 |
| crotch — the optional hem extension may not pass this | 1000 |
| fingertips (never touch) | 1054 |

Torso corridor: **x 372–640**. Below the sleeve end the mask pinches to it; the arms live outside it and
are anatomy, not canvas.

## 3. Design direction

- **Breastplate** across the chest/trunk band, following the mask's outline rather than a rectangle.
- **Shoulder caps** in the 560–714 band, where the base's short sleeves are — this is what sells "armour"
  at small sizes, and it is inside the mask.
- **Collar/neckline:** the mask includes the base tee's collar ring, so the armour must carry its own
  neckline there. Leaving it thin or unpainted re-opens the grey-ring defect A1 was revised to close.
- **Belt** near the hem (y ≈ 860–900), optionally extending into the hem band (902–1000, corridor only)
  as a short skirt of plates.
- **No pauldrons floating beyond the corridor, no arm plates, no gauntlets.** The arms are bare in the
  base and stay bare; that is the difference from the C2 item, and it is the whole reason for A2.

**Legibility target:** the silhouette must still read as armour at **52×78** — the quiz avatar size. That
argues for few, large shapes and one strong value break between breastplate and belt, not fine filigree.

## 4. QA contract — how a candidate is judged

```
npm run avatar:r2-torso-check -- path/to/candidate.png
```

`tools/avatar/check-r2-torso-candidate.mjs` is deterministic and non-AI. Blocking gates:

| gate | rule |
|---|---|
| `canvas-is-master-1024x1536` | exact canvas, RGBA |
| `no-ink-outside-edit-zone` | **0 px** of ink outside `edit` (any alpha ≥ 1) |
| `hard-region-fully-opaque` | **0 px** of `hard` below alpha 250 — a semi-transparent garment is a hole, not a style |
| `alpha-clean-no-halo` | ≤64 semi-transparent pixels that have no opaque neighbour (the D-058/D-061 failure mode) |
| `no-floating-islands` | no opaque component under 64 px |
| `legible-at-render-sizes` | ≥55 % of the mandatory region's mass survives at 180×270, 112×168, 72×108 and **52×78** |
| `budget-advisory` | reported, never blocking — the ≤50 KB budget applies to the encoded WebP |

A `PASS_AUTOMATED` verdict is a **precondition, not an approval**. Human style/safety review (kids
platform) and the owner's visual sign-off follow, exactly as they did for A1.

## 5. Production method

**AI is permitted for this artwork** (D-034: shop/cosmetic overlays; D-040 Tier 2), and equally, a human
illustrator is permitted. The repo's sanctioned adapter `tools/avatar/openai-generate-item.mjs` is
currently **hardcoded for the eyes/glasses slot** — a torso adapter with this brief's prompt is a small
addition, still bound by that file's rules: exactly one image per run, `OPENAI_API_KEY` from the
environment only, output written to the gitignored `tools/avatar/build/` tree, never to `assets/`.

**Whatever produces the pixels, the harness judges them.** That is deliberate: the gate is independent of
the generator, so a rejection is reproducible and arguable rather than a matter of taste.

## 6. Boundaries of A2

Artwork production only. A2 does **not** wire anything: `torso` is still absent from
`R2_SUPPORTED_COSMETIC_SLOTS`, there is no z, no transform, no manifest entry, no catalog change, and
**D-083's whole-avatar C2 fallback stays live** — it is what keeps the Ridderdragt visible for the pilot
student until A3 ships. `AVATAR_R2` stays `false`. Promotion of an accepted candidate into
`assets/avatar-r2/torso/` happens in **A3**, together with the wiring, tests and goldens.

## 7. Owner sign-off (per candidate)

### Candidate 1 — REJECTED (2026-08-01, D-087)

| field | value |
|---|---|
| Candidate file / SHA-256 | `torso-armor-knight-candidate.png` (superseded) · `dc332329…` |
| Harness verdict | **REJECT** — `hard-region-fully-opaque` 88.6 %, `alpha-clean-no-halo` 193 orphan soft px, `no-floating-islands` 3 components |
| Verdict | **☒ REJECT** — recorded as rejected rather than iterated into a pass; the art was on-brief, the faults mechanical |

### Candidate 2 — ACCEPTED (2026-08-01, D-088)

| field | value |
|---|---|
| Candidate file / SHA-256 | `tools/avatar/build/ai-input/torso-armor-knight-candidate.png` · `31f4b2b60737d5801cb115d3bdcac632881b8223ad7107be3a9b0655ebc7cfe0` (raw `83fcff0c…`, overscan 1.05, fit scale 0.438) |
| Harness verdict | **PASS_AUTOMATED** — mandatory region 97,698/97,698 = 100 %, one region, no halo, 0 px outside the edit zone, legible at all four D-071 sizes |
| Adapter-constructed pixels (disclosed) | **8,608 px = 8.81 % of the mandatory region, 8.55 % of visible artwork**; largest contiguous 4,833 px; 734 px touching the outer contour; shoulder 5,990 · torso 2,618 · collar 0 · skirt 0 |
| Style conformance to Master | ACCEPTED (covered by the owner's acceptance of the review set; no separate rating was recorded) |
| Content safety (kids platform) | ACCEPTED (as above) |
| Reads as the Ridderdragt at 52×78 | ACCEPTED — reviewed on `09-four-scale-review.png` |
| Reviewed material | the 12-file set in `Desktop\D087-candidate-2-review\`, incl. `07-BACKFILL-ONLY-map.png` |
| Integrity at acceptance | candidate on disk re-hashes to the accepted SHA; review renders are flattened composites whose **strictly opaque pixels are byte-identical** (deltas confined to 35,826 px at alpha 250–254) |
| Verdict | **☒ ACCEPT → proceed to A3** (owner, 2026-08-01) |

**Acceptance promotes and wires nothing.** A3 must re-verify the SHA above before encoding, so promotion
provably ships the accepted pixels. Risk `R-A2-ARTEFACT`: the accepted artwork and its raw generation are
**gitignored and not reproducible** (the model call is non-deterministic) — the raw is the irreplaceable
file until A3 puts the asset under version control.

### A3.1 — promoted (2026-08-01, D-089)

The SHA above **was** re-verified before encoding, and again after the run. The accepted candidate is now
`assets/avatar-r2/torso/armor-knight-r2-v1.webp` — 512×768, 30,064 B, sha
`78ca7bf5b3e9b2889852b7d4c85c680f28168fe802b0d4956711450a986835f6`, produced by
`tools/avatar/promote-r2-torso-asset.mjs` (premultiplied 2×2 box ÷2 → `cwebp -lossless -exact -z 9
-metadata none`). Full provenance: `tools/avatar/provenance/armor-knight-r2-v1.provenance.json`.

**Risk `R-A2-ARTEFACT` is closed** — the artwork is under version control. The out-of-repo backup is
**kept**: the served asset is a ÷2 derivative, so anything needing authoring scale still depends on the
1024×1536 source and the non-reproducible raw generation, both still gitignored.

### A3.2 — wired (2026-08-01, D-090)

Registered as `R2_MANIFEST.torso = { "armor-knight": 1 }` (manifest version 5) at **z 1**, on the same
`shop_items` row with **no database, migration or catalog change** — C2 keeps the SVG, R2 uses the WebP.
An opted-in student now sees the armour on the R2 figure on avatar, hub and quiz.

Support for this slot is per ITEM: an unregistered torso item still drops the whole avatar to C2, and
the garment is a **mandatory** layer, so a failed load does the same rather than leaving an R2 figure
without the paid item. Shop previews stay C2 (D-077) and **`AVATAR_R2` remains `false`**.

Status **`A3.2_RUNTIME_WIRED — OWNER_VISUAL_REVIEW_REQUIRED`**: the automated gates pass, but no golden
baseline was committed, because that would let the suite bless an appearance the owner has not yet
reviewed. Review set: `_avatar-artefakter\D090-runtime-review\`.
