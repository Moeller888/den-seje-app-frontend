# 164P — Anchor Taxonomy & Equipment-Type-Specific Production Rules

**Status: DRAFT (spec/design only)** · no implementation, no images, no API calls, no commit.

_Why: 164N proved the OpenAI item gate technically, but the first real glasses item **visually
FAILED** — frame crossed the pupils, lenses didn't contain the eyes, temples bored into the
head. Root cause: a single broad slot mask (`glassesBand`) + **whole-image alpha-bbox centering**
is not enough for typed equipment. We need **many named, typed, semantic anchors** plus
equipment-type production + QA rules and a type-specific fitter._
_Grounded in the live calibration (164L.4): `eyeLeftBox x347–463,y351–435` (centre 405,393);
`eyeRightBox x547–663,y351–435` (centre 605,393); `glassesBand x338–678,y352–426`;
`faceMaskRegion x402–622,y308–500`; `headHairRegion x270–758,y40–470`. Eye spacing = 200px._
_This document supersedes the 164N "alpha-bbox centre on glassesBand" approach for glasses;
164N v2 is **NOT approved**._

---

## 1. The five anchor layers

| Layer | What it is | Scope | Source |
|---|---|---|---|
| **A. avatarGeometryAnchors** | fixed anatomical landmarks on the Master (eyes, nose, ears, mouth, …) | per-avatar (the rig) | manual calibration (164L-style) |
| **B. slotAnchors** | the slot allowed-draw region(s) / mask | per slot | derived from A |
| **C. equipmentTypeAnchors** | semantic TARGET points/boxes for a given equipment TYPE (glasses, hat, mask, earrings…) | per type | derived from A |
| **D. equipmentTypeProductionRules** | authoring/generation constraints for that type | per type | design |
| **E. equipmentTypeQARules** | measurable acceptance checks for that type | per type | design |

> Key shift: B (broad mask) alone is insufficient. C/D/E make placement + QA **type-aware**, and
> a **type-specific fitter** aligns the item to C (not whole-bbox centering).

### Schema sketch (additive to the existing anchor JSON)
```json
{
  "avatarGeometryAnchors": { "eye": { "left": {...}, "right": {...} }, "nose": {...}, "ear": {...} },
  "slotAnchors": { "eyes": { "mask": "mask-eyes-v1.png", "region": {...} } },
  "equipmentTypeAnchors": { "glasses": { "leftLens": {...}, "rightLens": {...}, "bridge": {...}, "temples": {...} } },
  "equipmentTypeProductionRules": { "glasses": [ ... ] },
  "equipmentTypeQARules": { "glasses": { ...thresholds... } }
}
```
All anchors carry `humanReviewRequired: true` until signed off.

## 2. A. avatarGeometryAnchors — face (proposed, from 164L.4)
| Anchor | Proposed value | Notes |
|---|---|---|
| `eye.left.center` | (405, 393) | from eyeLeftBox |
| `eye.right.center` | (605, 393) | from eyeRightBox |
| `eye.left.box` | x347 y351 116×84 | calibrated |
| `eye.right.box` | x547 y351 116×84 | calibrated |
| `eye.left.innerCorner` | (463, 393) | nasal edge of left box |
| `eye.left.outerCorner` | (347, 393) | temporal edge |
| `eye.right.innerCorner` | (547, 393) | nasal edge of right box |
| `eye.right.outerCorner` | (663, 393) | temporal edge |
| `nose.bridgeTop` | (505, 365) | between inner corners, upper |
| `nose.bridgeCenter` | (505, 393) | eye-line midpoint |
| `ear.left.attachApprox` | (345, 400) | outer head at eye level — REVIEW |
| `ear.right.attachApprox` | (679, 400) | outer head at eye level — REVIEW |

## 3. C. glasses equipmentTypeAnchors (proposed)
| Anchor | Proposed value | Derivation |
|---|---|---|
| `glasses.leftLens.targetCenter` | (405, 393) | = eye.left.center |
| `glasses.rightLens.targetCenter` | (605, 393) | = eye.right.center |
| `glasses.leftLens.targetBox` | x337 y343 136×100 | eye.left.box + ~14px margin (lens must CONTAIN eye) |
| `glasses.rightLens.targetBox` | x537 y343 136×100 | eye.right.box + margin |
| `glasses.bridge.targetPoint` | (505, 388) | = nose.bridgeCenter (slightly above eye line) |
| `glasses.leftTemple.exitPoint` | (345, 395) | toward ear.left.attachApprox |
| `glasses.rightTemple.exitPoint` | (679, 395) | toward ear.right.attachApprox |
| `glasses.leftTemple.maxIntrusionLine` | x = 347 (no opaque inboard of this, below lens) | = eye.left.outerCorner x |
| `glasses.rightTemple.maxIntrusionLine` | x = 663 (no opaque inboard of this) | = eye.right.outerCorner x |

> The **glasses slot mask** (B) should become the **union of the two lens target boxes + two
> thin temple bands** (toward the ears) — replacing the single broad `glassesBand` rectangle.

## 4. The glasses FITTER (the core fix — design)
Instead of centering the whole image bbox, fit by the **two lens centres** (2-point transform):
1. In the generated glasses art, detect the **two lens centres** (e.g., the two largest
   interior holes / ring clusters; left = smaller x, right = larger x).
2. Compute a **similarity transform** (uniform scale + translation; no rotation for the front
   pose) mapping `lensCentreL → glasses.leftLens.targetCenter` and
   `lensCentreR → glasses.rightLens.targetCenter`. This forces lens spacing = eye spacing (200px)
   and lens size to the eyes.
3. Apply the transform to the whole art (lenses, bridge, temples move together).
4. Route/trim temples toward the `exitPoint`s; drop any opaque pixels inboard of the
   `maxIntrusionLine`s (anti-bore-into-face).
5. Clip to the glasses slot mask (lens boxes + temple bands).
Deterministic; no manual per-item offset (everything derives from detected lens centres + the
anchors). If lens centres can't be detected → controlled FAIL (regenerate with a tighter prompt).

## 5. D. glasses production rules
1. **Lenses must surround the eye boxes** — each placed lens bbox contains the corresponding
   `eye.*.box` with margin.
2. **Frame must not cross pupil centres** — no heavy opaque frame within a small radius of
   `eye.*.center`.
3. **Bridge aligns to the nose** — bridge mass centred on `glasses.bridge.targetPoint`.
4. **Temples exit toward the ears** — temple mass trends to `glasses.*Temple.exitPoint`.
5. **Side arms must not bore into head/face** — no opaque pixels inboard of `maxIntrusionLine`
   below the lens line.
6. **Isolated overlay only** — no avatar pixels (skin/eyes/hair/face) in the item.
7. (Generation prompt should request a **front-on, two equal round lenses, symmetric, thin
   bridge, short temples**, transparent bg — to make lens-centre detection reliable.)

## 6. E. glasses QA rules (proposed thresholds)
| Check | Rule (proposed) |
|---|---|
| Lens spacing vs eye spacing | `|lensSpacing − 200| / 200 ≤ 0.08` |
| Lens contains eye box | each `eye.*.box` fully inside placed lens bbox, margin ≥ 6px |
| Frame-crosses-pupil | opaque px within r≤10 of each `eye.*.center` ≈ 0 (≤ a few) |
| Bridge alignment | bridge centroid within ±12px (x) of `bridge.targetPoint` |
| Temple exit alignment | temple mass vector points to `exitPoint` within tolerance |
| Anti-intrusion | opaque px inboard of `maxIntrusionLine` (below lens) = 0 |
| Mask compliance | `outsideMaskPx = 0` after clip to the glasses slot mask |
| Visibility | `opaquePx ≥ MIN_VISIBLE` (e.g. ≥ ~1500 for a real frame) |
| Visual | composite over Master **human-reviewed** (mandatory) |

## 7. Recommended implementation path (when approved — not now)
1. **Lock this anchor taxonomy/spec** (164P).
2. Add **glasses equipmentTypeAnchors** to the anchor template (extract tool), human-reviewed.
3. Build a **glasses-specific fitter + QA** (lens-centre detection → 2-point transform → temple
   routing → type QA), reusing the existing codec/masks.
4. **Only then** re-run **one** OpenAI generation through the new typed fitter/QA.
5. Repeat the taxonomy for the next type (hat/headwear) before its items.

## 8. Boundaries
Spec/design only. **No implementation** of the fitter/anchors yet (separate approved step). No
images generated, no OpenAI/API calls, no runtime/frontend/DB/RPC/migration/assets/AVATAR_V2
changes, no commit, no push. 164N v2 placement is **not approved** and **not committed**.
