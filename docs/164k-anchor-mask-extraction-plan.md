# 164K — Automated Anchor Template + MVP Mask Extraction from Master (D-041)

_Automation-first plan for deriving the anchor template and the 5 MVP QA/build masks
**directly from `Northstar Master.png`** (the Tier-0 base, D-040). **D-041 locks the method
only** — no tooling, masks, assets, or images are produced here._
_Builds on: D-040 (Master = Tier-0 base), D-034 (AI = overlays only, never geometry),
D-035 (`C2_LAYER_Z` canonical), D-036 (accessory-first MVP), D-037 (QA gates + mask rules)._
_`AVATAR_V2` stays OFF. No runtime/DB/RPC change results from this document._

---

## Locked method (D-041)
- **`Northstar Master.png` is the MVP Tier-0 base**, **verified 1024×1536** (PNG IHDR).
- **Anchors and MVP QA/build masks are derived directly from Master** by a **deterministic,
  non-AI image-processing step**.
- **AI must NOT define** geometry, anchors, masks, body, face, hair, eyes or proportions.
- **Outputs are QA/build artifacts only** — never shipped runtime avatar assets, never used
  to alter geometry.
- **Master remains unchanged. No shop items are generated yet.**

## Coordinate system
1024×1536 master → 512×768 served (½); legacy 160×240 × **6.4**.

## Anchor template plan
First-guess values come from the ×6.4 mapping; **eye band + face oval MUST be measured/
human-confirmed on the actual Master** (anime eyes are larger than the legacy box).

| Anchor | First-guess (×6.4) | Derivation | Human-confirm |
|---|---|---|---|
| Head centre / radius | (512, 320), r≈192 | ×6.4; cross-check detected head bbox | confirm |
| Eye anchors / eye band | (435,301)/(589,301) → **revised enlarged box** | ×6.4 first guess; **measure on Master** | **must measure** |
| Shoulder / back anchor line | from silhouette shoulder row | detect shoulder y + L/R x from alpha | confirm |
| Face oval | lower-front of head circle | head circle ∩ below-brow band | confirm |
| Crown / headwear region | head circle dilated up/around, above eye band | dilation clipped at eye-band top | confirm |
| Full avatar silhouette | — | white-matte threshold → figure alpha | spot-check edges |

**Protected zones** (feed the D-037 *no-geometry/no-skin* gate): **face · eyes · hair · body
· hands · skin-like regions** (medium skin-tone color range ∩ silhouette interior, if
detectable). An item with opaque pixels in a protected zone fails.

## MVP mask plan

| Mask | Derivation | Tightness | Allowed px | Forbidden px | Eye-legibility | Feather/overlap | Validation | Likely failure |
|---|---|---|---|---|---|---|---|---|
| **aura** (z−30) | canvas bounds (behind) | **generous** | full canvas | none (renders behind base) | n/a (behind) | wide | fits canvas; behind base | over-bright glow; canvas overflow |
| **back** (z−20) | shoulder anchor + outward dilation | **generous** | behind silhouette + outward spread | front-of-face (moot, behind) | n/a (behind) | wide | shoulder-anchored; in canvas | wings off-shoulder (misreg) |
| **headwear** (z45) | head circle dilated up/around, **clipped above eye band** | **moderate** | crown / upper-head | eye band & below (face), body, skin | **must not enter eye band** | medium | head-anchored; no eye-band px | brim over eyes; bleed into body |
| **face/masks** (z50) | face oval | **tight** | face oval (incl. eye area) | outside head, body, hair-back | mask *region* includes eyes, but **QA enforces eye legibility separately** (eye-holes / lower-face) | narrow | face-anchored; within head | full opaque mask hides eyes |
| **eyes/glasses** (z55) | eye band + temple arms | **tight** | eye band + temples | rest of face, body | **approved eye-overlap exception** | narrow | eye-anchored; within band+temples | glasses off-eyes (misreg) |

> Mask boundary ≠ legibility rule: a mask defines *where* an item may draw; **eye legibility**
> is a separate composite gate (D-037 §11) for non-eyes/non-mask slots.

## What can be automated (deterministic, non-AI)
Read Master dimensions · validate 1024×1536 · detect white/alpha bg · derive silhouette
(white-matte threshold) · anchor-overlay preview · mask preview PNGs from anchor geometry ·
geometric checks (mask ⊆ canvas; protected-zone respect; headwear excludes eye band) · export
anchor JSON · export QA/build mask PNGs. (`sharp`/PIL; **no AI/ML**.)

## What must stay human-reviewed
Final anchor placement (esp. **eye band + face oval**) · crown extent · per-mask generosity/
tightness · style-safety · **whether each mask permits useful item variety** (too tight starves
the catalog; too generous risks collisions). Human signs off the previews.

## Expected future artifacts (the later **164L tooling step**, not produced here)
- `avatar-anchor-template-v1.json` (schema + values)
- anchor-overlay preview PNG (anchors drawn on Master)
- QA/build mask PNG proposals (5 MVP slots)
- mask review worksheet (per-mask PASS/FAIL, 164B.3-style)

## Acceptance gates (before any shop-item batch)
- Master dimensions validated (**done: 1024×1536**)
- anchors human-approved
- mask previews human-approved
- mask-overflow checks defined (AND item alpha against inverse mask, D-037)
- D-037 QA compatibility confirmed
- no runtime change · no AVATAR_V2 change

## Boundaries
QA/build masks are **not runtime assets**; masks **must not alter geometry**; **Master
unchanged**; **no AI full-avatar generation**; **no shop items yet**. D-041 locks the
**method / schema / artifacts / gates only** — no tooling/masks/assets/images produced.

> **Next step = 164L** (approved tooling): a small deterministic, non-AI extraction script
> emitting the anchor JSON + overlay + 5 mask previews for human review. No items until
> anchors + masks are approved.
