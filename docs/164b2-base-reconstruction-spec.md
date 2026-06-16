# 164B.2 — Base Reconstruction Specification (`body-neutral-medium-v1.webp`)

_Exactly how the base body layer must be reconstructed from `Northstar Master.png`.
Specification only — no assets, no tooling, no commits, no runtime/AVATAR_V2 changes._
_Governs / builds on: ADR-163F **D-029 clarification** (base is reconstruction-grade, the
single highest-risk MVP asset), **D-032** (Master = sole geometry; reference = outfit
direction only; **never regenerate**), **D-033** (base = **manual paint-over only**; AI
generation/inpaint rejected as a base method — AI outputs are outfit references only),
`docs/164b-asset-production-plan.md` (§0 fundamentals, §1 base, Phase 1 sub-gate D)._

> **The base is RECONSTRUCTED, not cut.** Against the real Master the only true skin is
> face / ears / a small neck triangle / hands; everything else is occluded by clothing and
> the neutral outfit does not exist in the source. This spec defines how to rebuild the
> body + neutral outfit **over Master geometry in the Master's style**.

---

## 1. Exact source regions from Master.png (lift / sample as real pixels)

Work in the locked 1024×1536 space (§0.2/§0.3 of 164B.1; confirm exact dims in Phase 0).
Anchors: head centre ≈ **(512, 320)**, r ≈ **192**; eye centres ≈ **(435, 301)/(589, 301)**.
**Measure exact pixel bounds in Phase 0 — the regions below are anchor-relative, not
fabricated rectangles.**

| Region | What it is | Use |
|---|---|---|
| **Face skin** | forehead (below hairline), cheeks, jaw, chin — the front skin oval | Lift as the head's skin surface (features removed — see §2) |
| **Ears** | partial, at head sides under hair | Lift skin; complete edges where hair occludes |
| **Neck triangle** | small skin area between jaw and the crew collar | Lift; extend downward per the neutral collar (§5) |
| **Hands** | both hands at upper-thigh level, below the sweater cuffs | Lift skin; clean off the cuff/wristband edge |
| **Silhouette / pose / proportions** | full figure outline, limb axes, shoulder/hip/foot positions | **Trace as geometry guide** (not pixels) — the proportion lock (§3) |
| **Skin-tone samples** | clean midtone + shadow + highlight on face/hand | Sample → the `medium` palette (§6) |

**Not lifted as final pixels:** the green sweater, orange star, cuffs/hem, wristbands,
cargo jeans, sneakers (all clothing = reference art / future cosmetics, D-029); and the
face features + eyes (they belong to the face/eye layers, §7).

---

## 2. What must be reconstructed (does not exist as usable source pixels)
1. **The entire neutral default outfit** — invented; *direction* from
   `Northstar Master - reference.png` only (plain tee, plain trousers, plain low sneakers).
2. **Body skin/volume under clothing:** torso, arms, **forearms (100% hidden by the long
   sleeves)**, legs, hips/waist, feet.
3. **Arm↔torso separation** — the arms sit close to the torso in the Master and the
   boundary is merged; rebuild a clean (subtle) separation so cosmetics can register.
4. **Facial skin behind the removed features** — the skin under the eyes, brows and mouth
   must be inpainted as plain, even skin (the base presents a featureless face).
5. **Skin newly exposed by the neutral outfit** — e.g. forearms if the tee is short-sleeve,
   and any neck area below the original collar line.

---

## 3. How to preserve Master proportions EXACTLY
- Place `Northstar Master.png` on a **locked, non-editable reference layer** at 100% under
  the working canvas (same 1024×1536). Never paint on it.
- **Trace a geometry guide** from the Master: figure outline, head/shoulder/hip/knee/ankle
  anchors, limb axes, foot footprint. This guide — not freehand judgement — drives every
  silhouette decision.
- Keep head size/position, shoulder width, arm length + angle, leg length, and foot
  position/size **identical to the Master**. The clothing changes; the underlying skeleton
  does not.
- **Onion-skin / difference-overlay** the reconstruction against the Master continuously.
  The reconstructed body silhouette (minus outfit drape bulk) must register to the Master
  silhouette within a tight tolerance (target: anchor centres within a few px at 1024×1536).
- **Manual paint-over only; do NOT AI-generate, AI-inpaint, or freehand proportions**
  (D-032/D-033 — four regenerations *and* an edit/inpaint attempt all drifted taller/leaner).
  Reconstruct strictly **by hand** over the traced geometry; AI outputs are outfit
  references only.

---

## 4. How to reconstruct torso, arms, forearms, legs, feet
General rule: **clothed parts → reconstruct the OUTFIT silhouette following the Master's
clothed silhouette anchors; exposed parts → reconstruct SKIN in the `medium` palette.**

- **Torso:** define the neutral-tee silhouette following the Master's shoulder line and
  torso anchors. The Master sweater is loose/boxy — the neutral tee should drape on a
  plausible neutral torso, **keeping shoulder width and waist position from the Master**
  (do not inherit the sweater's extra bulk as body shape).
- **Arms:** follow the Master arm axis (shoulder anchor → visible hands at upper thigh).
  Reconstruct sleeves to the chosen length; establish a clean arm/torso separation inside
  the Master silhouette.
- **Forearms:** fully hidden by long sleeves. If the tee is short-sleeve, reconstruct
  forearm **skin** (medium palette) from the elbow (inferred on the arm axis) to the
  **hands** (the real anchor). Wrist width = the Master hand/wrist width.
- **Legs:** the cargo jeans give the leg silhouette; reconstruct neutral trousers following
  that outline, **knee/ankle anchors from the Master**.
- **Feet:** the sneakers define the **foot footprint** (position + size). Reconstruct plain
  neutral low sneakers at exactly that footprint — do not change foot stance or size.

---

## 5. How to apply the neutral outfit WITHOUT drifting geometry
- **Direction vs geometry split (D-032):** take *what neutral clothing looks like* from
  `reference.png` (plain grey tee, plain charcoal trousers, plain low sneakers, no logos /
  star / accent colours / wristbands); take *where everything sits* from the **Master**.
- **Never copy `reference.png` proportions or placement** — it drifted taller/leaner. It is
  an appearance reference only.
- Register outfit edges to Master anchors: collar to the neckline, sleeve hem to the
  arm axis, tee hem to the waist/hip, trouser break to the ankle, shoe to the foot
  footprint.
- **Sleeve-length decision:** recommend short-sleeve tee (matches reference direction) →
  accept forearm-skin reconstruction (§4). If forearm reconstruction is judged too risky,
  a plain long-sleeve neutral top is an acceptable alternative — record the choice.
- **Shade the outfit in the Master's language:** same light direction, same flat cel-shade
  ramp (R1–R5 style), same line weight. The outfit must look like it belongs to the same
  render, not a pasted-in garment.

---

## 6. How to sample and maintain `medium` skin tone
- Sample from clean Master face/hand skin a **3-stop cel ramp**: skin-base (midtone cheek/
  forehead, avoid blush + cast shadow), skin-shadow (jaw/neck shade), skin-highlight.
  Record the hex values — **these sampled values ARE the `medium` token** (D-028; not a
  subjective colour reading, an internal token).
- Apply the **same ramp and the same light direction** to all reconstructed skin (forearms,
  neck, hand cleanup, facial skin behind features) so there is **no tone seam** between
  lifted and reconstructed skin.
- This `medium` ramp is also the reference for the **eyelid** (Asset 5) — keep it recorded
  so the blink layer tone-matches the base.

---

## 7. What the base layer must NOT contain
- **No face features** — no brows, nose or mouth (→ `face-neutral`, z3).
- **No eyes** — no iris / sclera / lash / catchlight (→ eyes layers, z4).
- **No eyelid / blink** (→ `eyelid-medium`, z5).
- **No hair** — the head is rendered as complete skin/scalp, but hair is a separate layer
  (`hair-northstar-v1`, z40). (Keep a full head so hair-edge alpha never reveals a gap.)
- **No blush baked in** — blush is `multiply` on the face layer (D-022); base skin is plain.
- **No signature outfit** — no green sweater, star, cuffs/hem, wristbands, cargo jeans,
  branded sneakers (reference art / future cosmetics, D-029).
- **No background** — transparent; clean bg→alpha, no halo.
- **No cropping / trimming** — full 1024×1536 canvas, transparent padding (D-027).
- **No cosmetics.**

---

## 8. Base-Coherence Gate — acceptance criteria (Phase 1 sub-gate D)
All must pass before the base is finalized:
1. **Proportions/pose/silhouette match the Master** — onion-skin/difference overlay shows
   anchors aligned and silhouette within tolerance; **zero height/leanness drift**.
2. **Same finish** — shading language, light direction, cel ramp and line weight read as
   the **same render** as the Master.
3. **Same character without the signature outfit** — passes vision criterion #1 (a viewer
   recognises the North Star kid in the neutral outfit).
4. **`medium` tone consistent** — face/neck/hands/forearm share one ramp, no seam.
5. **Featureless, composite-ready face** — even skin where eyes/brows/mouth will land; no
   baked features/eyes/hair/blush/cosmetics.
6. **Full-canvas 1024×1536, transparent**, clean bg→alpha at scalp + limb edges (no halo).

---

## 9. Rejection criteria (any one = NO-GO / repaint)
- Any **proportion or height drift** from the Master (the companion-regeneration failure).
- Outfit **geometry/placement copied from `reference.png`** instead of the Master.
- **Style drift** — shading/line-weight/palette differ from the Master (Frankenstein composite).
- **Tone seam** or inconsistent/wrong `medium` skin between lifted and reconstructed areas.
- Any **baked** feature / eye / hair / blush / cosmetic / signature-outfit element present.
- **Cropped** or wrong-dimension canvas; non-full-canvas output.
- **White halo / fringe** at edges.
- **Regeneration used** instead of reconstruction over Master geometry (violates D-032).

---

## 10. GO / NO-GO for producing the base PROTOTYPE
**GO — produce the base _prototype_**, conditioned on:
- Phase 0 prerequisites complete (confirm 1024×1536; trace the geometry guide + anchors §3;
  sample the `medium` ramp §6),
- **manual paint-over** over locked Master geometry — **AI generation/inpaint rejected as
  a base method** (D-032/D-033); AI outputs are outfit references only,
- the prototype is then subject to **Base-Coherence Gate (§8)** before any finished layer.

**NO-GO for the _finished_ base** until sub-gate D (§8) is signed off. Producing finished
downstream layers (face/eyes/blink/hair) remains **blocked** until the base prototype passes
§8, because every other layer registers to the base (D-029 clarification).

> This document is specification only. It produces **no assets, no tooling, no commits**;
> `AVATAR_V2` stays OFF. Asset production begins only after the §8 gate passes.
