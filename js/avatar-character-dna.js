// Section 60 — Avatar Rebuild Initiative: Core Character Redesign & Appeal
// Design contract: character appeal audit, silhouette principles, hair architecture,
// face appeal standard, clothing integration, compatibility constraints, future work.
//
// NOT a runtime file. Import for documentation, auditing, and design review.

// ── Character Appeal Audit ────────────────────────────────────────────────────

export const CHARACTER_APPEAL_AUDIT = {
  verdict: 'Phase 1 — incremental appeal reconstruction within compatibility constraints.',

  problems_identified: {
    hair_scalp_gap:
      'The hair cap had zero side thickness. The path M 52 44 ... M 108 44 terminates ' +
      'at y=44 on both sides, leaving the head sphere (skin color) fully visible from y=44 ' +
      'downward at the temples. Temple strands (2.8px stroke) did not fill this gap — they ' +
      'were visible as individual strands, not as continuous scalp coverage. At display scale, ' +
      'the skin-colored sphere showed through from under the hair edges, destroying the illusion ' +
      'that hair grows FROM the head rather than sitting ON it.',

    iris_too_small:
      'Iris r=4.5 in an rx=7 sclera = 64% fill ratio. Human eyes and most stylized characters ' +
      'read as more expressive when the iris fills 68–75% of the eye opening. At 52px display, ' +
      'the iris appeared as a small dot in a large white surround. The character read as ' +
      '"empty-eyed" rather than present. r=4.8 brings the fill to 69% — a significant ' +
      'perceptual shift without changing eye anatomy.',

    eyebrow_too_light:
      'Stroke-width 1.9px at 160×240 SVG → 0.62px at 52px display. Sub-pixel brows. ' +
      'The brow is the primary emotional signal at small scale — if it cannot be confidently ' +
      'read, emotional expression collapses. The new 2.2px brow reads at 0.72px display — ' +
      'still subtle but definitively visible and emotionally communicative.',

    eyelid_crease_weak:
      'Stroke-width 1.4px + outer corner only 1.5px below inner corner. At 52px display, ' +
      'the crease was nearly invisible. The eye read as a plain sclera+iris with no lid ' +
      'definition. The upward tail at the outer corner (the "alert warmth" signal) was ' +
      'below perceptible threshold. New: 1.6px stroke, outer corner at 41 (2px below ' +
      'inner at 43). Crease now reads as a design decision, not an artifact.',

    collar_pasted_on:
      'The V-collar was a flat filled triangle on the shirt surface. No depth, no thickness, ' +
      'no evidence that the collar has circumference. The result: clothing reads as a texture ' +
      'painted onto the body, not as a garment wrapped around it. Fix: added collar fold underside ' +
      '(dark inner edge shadow implying thickness) and neckline wrap (curved line implying ' +
      'the collar continues behind the neck). Both are below the "noticeably decorative" ' +
      'threshold but above the "feels physically real" threshold.',
  },

  problems_NOT_fixed_in_phase_1: [
    'Arm silhouette: arms are straight vertical rects (armor-plate compatibility requires ' +
    'preserving rect x=14/120, y=98, w=26, h=68). Cannot taper without breaking armor equipment.',
    'Torso width: shoulder-to-waist ratio barely perceptible at 52px. Aggressive taper creates ' +
    'gap between arm rect edge (x=40) and shirt body — visible break in clothing. Deferred.',
    'Head/body proportion: head r=30 locked (all expressions + all headwear anchored to cx=80 cy=50). ' +
    'Rebuilding would require reauthoring all 5 expressions + all hat/mask coordinates.',
    'Hairstyle variety: the current hair is a single style. Multiple hair options require ' +
    'a hair slot in the equipment system — currently hair is part of body.svg.',
    'Face geometry: eye spacing (cx=68/92), eye size (rx=7/ry=6) locked — ' +
    'hero-mask and glasses SVGs are authored to these exact anchor points.',
    'Full clothing integration: cape/armor overlay logic requires the equipment SVGs to be ' +
    'rebuilt with body-aware attachment points. Equipment items authored independently.',
  ],
};

// ── Silhouette Principles ─────────────────────────────────────────────────────

export const SILHOUETTE_PRINCIPLES = {
  current_silhouette_read:
    'The character silhouette in solid black reads as: rounded-top figure with wide T-pose ' +
    'arms, rectangular legs, and no waist. The hair peak gives slight directional interest. ' +
    'Equipment items (capes, crowns) are the primary silhouette differentiators — this is ' +
    'by design: the base should be a clean canvas for cosmetics.',

  silhouette_strengths: [
    'Hair crown peak at x=75 (slight left of center) — breaks perfect symmetry',
    'Shoulder cap paths add rounded shoulder mass vs. flat rect junction',
    'Belt creates horizontal visual break — waist landmark even without taper',
    'Shoe ellipses give strong anchoring at the bottom',
    'Equipment items (capes, crowns, weapons) dramatically alter silhouette — correct layered approach',
  ],

  silhouette_weaknesses: [
    'Arms extend to x=14/146 (T-pose width = 132px on 160px canvas) — character reads as armless at rest',
    'Leg rects are identical width top-to-bottom — no taper implies no mass or gravity',
    'Torso barely tapers — shoulder and waist read as the same width',
    'Hair has no volume "bump" that would make it read as hair rather than a cap',
  ],

  phase_2_silhouette_targets: [
    'Introduce slight arm angle — arms angled 3–4 degrees inward toward hands suggest natural rest',
    'Add leg taper — ankle width ~16px vs knee width ~20px creates grounded read',
    'More pronounced waist taper — only feasible when equipment compatibility is rebuilt',
    'Hair volume bump — a slight protrusion above the crown line breaks the "perfect cap" read',
  ],
};

// ── Hair Architecture ─────────────────────────────────────────────────────────

export const HAIR_ARCHITECTURE = {
  problem:
    'The hair cap terminated at y=44 on both sides (left x=52, right x=108). The head sphere ' +
    'extends from y=20 to y=80 — from y=44 downward, 100% of the sphere edge was visible skin color. ' +
    'The temple strands (2.8px strokes) covered approximately 2–3px of this gap, leaving 20–30px ' +
    'of uncovered sphere edge below each temple. At 52px display scale, this manifested as skin ' +
    'color "bleeding" out from below the hair edges — the scalp was visible.',

  solution:
    'Side hair panels: two filled bezier shapes that extend from the hair cap bottom edge (y=44) ' +
    'downward to y≈64, with maximum width ~9px SVG (≈3px display) at mid-height. ' +
    'Panels drawn BEFORE the main cap so the cap outer edge remains the dominant silhouette line. ' +
    'Side catch-light highlight added on inner panel edge — creates perception of curved 3D volume ' +
    'rather than flat 2D strip.',

  rendering_order:
    'side panels (fill) → main cap (fill) → specular highlight (stroke) → side highlights (stroke). ' +
    'Each layer adds information: fill establishes mass, specular identifies direction, ' +
    'side highlights confirm the panels are curved surfaces not flat cutouts.',

  compatibility:
    'Hair change applied identically to all 6 files: body.svg + 5 expression SVGs. ' +
    'The hair path geometry in expressions must exactly match body.svg since expressions ' +
    'redraw the head sphere (erasing body.svg\'s face) and then redraw hair on top. ' +
    'Any mismatch creates a visible "ghost" of the old hair at expression transition boundaries.',

  phase_3_hair_target:
    'When expressions are converted to inline SVG (Phase 3), hair becomes a separable layer. ' +
    'Multiple hair styles become possible as equipment slot items. The current hair would ' +
    'become the "default" style, with additional options unlockable via the shop.',
};

// ── Face Appeal Standard ──────────────────────────────────────────────────────

export const FACE_APPEAL_STANDARD = {
  iris_rationale:
    'Iris r=4.5 → r=4.8. Fill ratio: 64% → 69%. The iris IS the face at 52px — ' +
    'the sclera and pupil are supporting elements. A larger iris creates stronger eye contact ' +
    'with the viewer and amplifies all expression changes. The iris color (#6B4226, warm amber-brown) ' +
    'also becomes slightly more prominent, reinforcing the skin palette coherence.',

  pupil_unchanged:
    'Pupil r=2.5 unchanged. Pupil/iris ratio changes from 55% to 52%. The pupil ' +
    'remains the darkest, most attention-pulling element. Keeping it the same prevents ' +
    'the pupil from appearing artificially small relative to the expanded iris.',

  eyebrow_rationale:
    'Stroke-width 1.9 → 2.2. At 160×240 SVG scale, this is a 16% increase. At display: ' +
    '0.62px → 0.72px. The brow arch peak was also deepened by 0.5px (y=36 → y=35.5 neutral/proud) ' +
    'to create marginally more curvature without changing the emotional read. The brow remains ' +
    '"gentle arch" — not expressive overacting, but definitively readable.',

  eyelid_crease_rationale:
    'Outer corner: 41.5 → 41 (neutral/proud), maintaining the inner corner at y=43. ' +
    'The 2px vertical drop from inner to outer creates the slight wing-eye shape that reads ' +
    'as "alert and warm." Stroke: 1.4 → 1.6. Previously: 0.46px at display. Now: 0.52px. ' +
    'The threshold for reliable perception at 52px is approximately 0.4px — both values ' +
    'are above it, but the new value provides clearer rendering on lower-PPI screens.',

  expression_scaling: {
    neutral_proud:   'outer corner y=41.5→41, stroke 1.4→1.6',
    curious:         'outer corner L y=41 (unchanged), R y=41.5→41, stroke 1.4→1.6',
    focused:         'position unchanged (heavier lid reads differently), stroke 1.5→1.7',
    determined:      'position unchanged (resolute requires heavier visual weight), stroke 1.6→1.8',
  },

  face_identity_locked: [
    'Eye center positions: cx=68/92, cy=47 — hero-mask and glasses SVGs anchor here',
    'Eye opening: rx=7, ry=6 sclera — mask lens geometry references this',
    'Eye spacing: 24px between centers — all face accessories authored to this distance',
    'Head sphere: cx=80, cy=50, r=30 — anchor for all headwear and all expressions',
  ],
};

// ── Clothing Integration ──────────────────────────────────────────────────────

export const CLOTHING_INTEGRATION = {
  problem:
    'All clothing items (shirt, armor, cape) render as flat <img> layers on top of body.svg. ' +
    'There is no structural attachment point where clothing "connects" to the body. ' +
    'The V-collar was a flat triangle painted onto the shirt surface with no depth. ' +
    'Result: each clothing item reads as a sticker applied to the avatar rather than a ' +
    'garment worn by a character with physical form.',

  fixes_applied: {
    collar_underside:
      'Dark inner fold line (M 65 93 L 80 112 L 95 93) sits 1–2px inside the outer collar edge. ' +
      'Creates the shadow of the collar folding over its own edge — physical depth illusion.',
    neckline_wrap:
      'Curved line (M 65 91 Q 72 86 80 85 Q 88 86 95 91) at the neckline, above the collar V. ' +
      'Implies the shirt\'s neckline rim continues around the back of the neck. ' +
      'The character now wears a shirt with circumference, not a bib pinned to the front.',
  },

  fixes_deferred: [
    'Sleeve-to-torso junction: arms are rect-positioned for armor plate alignment. ' +
    'Rebuilding this junction requires rebuilding arm geometry AND all armor equipment items.',
    'Waist shirt tuck: shirt path would need to overlap the belt visually. ' +
    'Currently belt renders over shirt — adding shirt-over-belt overlap requires Z-order changes.',
    'Cape attachment: capes attach at the shoulder via the collar clasp (existing on cape SVGs). ' +
    'No body.svg collar attachment anchor exists — the cape wraps around the whole figure.',
    'Armor fitting: armor pieces are authored as independent overlays. Body-aware armor ' +
    'requires re-authoring all armor SVGs with body curvature offsets.',
  ],

  future_integration_architecture:
    'Phase 2 clothing integration requires: ' +
    '(1) Body attachment anchors defined as SVG coordinates in avatar-layers.js, ' +
    '(2) Equipment SVGs authored with body-overlap offsets at those anchors, ' +
    '(3) Possibly a "shirt base" layer separate from body.svg that equipment can reference.',
};

// ── Compatibility Constraints ─────────────────────────────────────────────────

export const COMPATIBILITY_CONSTRAINTS = {
  locked_permanently: {
    head_sphere:
      'cx=80, cy=50, r=30. All 5 expression SVGs, all hat/crown/mask SVGs authored to this anchor. ' +
      'A 1px shift requires rebuilding all 23+ equipment SVGs and all expressions.',
    eye_positions:
      'cx=68/92, cy=47. Hero-mask lens ellipses sit exactly over these coordinates. ' +
      'Glasses-round SVG authored to these positions. Any movement requires equipment reauthoring.',
    hand_positions:
      'cx=27/133, cy=172. Future hand-item equipment slot will anchor here.',
    arm_bounding_rect:
      'Left: x=14, y=98, w=26, h=68. Right: x=120, y=98, w=26, h=68. ' +
      'Armor arm-plate items overlay exactly these rects. Narrowing arms creates visible gaps ' +
      'between arm surface and armor plate edges.',
    leg_bounding_rect:
      'Left: x=48, y=178, w=26, h=56. Right: x=86, y=178, w=26, h=56. ' +
      'Any future leg/boot equipment items will anchor here.',
  },

  incrementally_changeable: {
    hair_geometry:
      'Changeable but requires identical update across body.svg + all 5 expressions. ' +
      'Section 60 changes are an example of a successful incremental hair update.',
    face_features:
      'Iris size, brow weight, crease definition, mouth shape — all incrementally changeable ' +
      'as long as eye centers, sclera dimensions, and nose anchor remain at same positions.',
    torso_silhouette:
      'Shirt path bezier control points changeable for waist taper. Constrained by: ' +
      'shirt shoulders must meet arm rect at x=40/120, belt position at y=174.',
    collar_details:
      'Collar depth, neckline wrap, seam lines — free to change without equipment impact.',
  },
};

// ── Youth Appeal Criteria ─────────────────────────────────────────────────────

export const YOUTH_APPEAL_CRITERIA = {
  target_age: '11–16 years',
  aspiration_model:
    'The character should pass what might be called the "cool older sibling" test: ' +
    'a 13-year-old should look at this character and think "that looks like someone I\'d want to be" ' +
    'without it feeling like the character was designed by marketing to appeal to teens.',

  what_reads_as_premium_to_this_age_group: [
    'Clean design with few unnecessary details — "less is more" reads as confident',
    'Eyes that feel present and aware — large irises, defined lids',
    'Hair that looks like a style choice, not a default',
    'Clothing with visible structure — seams, depth, physical reality',
    'Emotional accessibility — warm without being baby-cute',
    'Aspirational proportion — slightly idealized but not cartoonishly superhuman',
  ],

  what_reads_as_childish_or_cheap: [
    'Mascot proportions (huge head, tiny body)',
    'Permanently wide smile at rest',
    'Saturated candy colors on skin or clothing',
    'Symmetrical features with no asymmetry',
    'Hair with no texture or direction',
    'Visually flat (no shadow, no depth, no material read)',
    'Eyes that are dots rather than irises',
  ],

  section_60_improvements_by_criterion: {
    eyes_present_and_aware: 'Larger iris (r=4.8), stronger eyelid crease — character now has a gaze',
    hair_style_choice: 'Side panels eliminate the "cap on head" read — hair now appears to grow',
    clothing_structure: 'Collar fold underside + neckline wrap — shirt has physical depth',
    emotional_accessibility: 'Stronger brow definition — expressions read more clearly, trust builds faster',
  },

  still_needed_for_full_appeal: [
    'Hairstyle options — the current style is intentionally neutral; variety drives identity',
    'Arm silhouette improvement — T-pose arms read as stiff/lifeless',
    'Torso proportion — current mannequin proportions lack the slight heroic taper of premium characters',
    'Material differentiation between shirt/skin/hair — all currently feel similar in weight',
  ],
};

// ── Future Character DNA Standard ────────────────────────────────────────────

export const FUTURE_CHARACTER_DNA = {
  name: 'Den Seje App Avatar Character DNA Standard — established Section 60',
  principles: [
    'Silhouette first — if the character does not read in black silhouette, the design fails',
    'Hair grows from the head — never a cap placed on top; side coverage is non-negotiable',
    'Eyes carry the character — iris fill >68% of opening; eyelid definition at every scale',
    'Brows are emotional infrastructure — minimum 2px at 160×240 SVG for display readability',
    'Clothing has thickness — every garment edge has a fold shadow; no flat painted surfaces',
    'Garments have circumference — necklines, cuffs, and belts wrap around, not just face forward',
    'Body integration over slot logic — equipment should attach TO the character, not overlay it',
    'Asymmetry signals life — no perfect left/right symmetry in hair crown, brow arch, or gaze',
    'Scale-first design — every decision evaluated at 52×78px display, not 400px preview',
    'Restraint over richness — one well-executed detail outperforms ten decorative ones',
  ],

  quality_test:
    'View the character at 52×78px on a mobile screen. ' +
    'Without squinting: Can you read the hair as hair? Can you see the eyes clearly? ' +
    'Does the clothing look worn rather than painted? ' +
    'If yes to all three: the minimum standard is met.',

  phase_2_targets: [
    'Arm angle: natural fall angle, not T-pose geometry',
    'Leg taper: ankle narrower than knee — mass and gravity',
    'Torso taper: visible waist-to-shoulder ratio',
    'Hair volume: slight crown bump for non-cap silhouette',
    'Material differentiation: distinct visual weight between skin, fabric, and hair',
    'Equipment anchors: defined attachment points in SVG coordinate space',
  ],

  phase_3_targets: [
    'Inline SVG expression layer with addressable pupils (enables gaze)',
    'Hair as equipment slot (enables hairstyle variety)',
    'Body-aware equipment positioning (clothing fits the character, not the canvas)',
    'Skin tone variants (multiple skin gradient sets)',
  ],
};

// ── Design Constraints That Prevent Full Rebuild ──────────────────────────────

export const REBUILD_CONSTRAINTS = {
  why_not_full_rebuild: [
    'All 23 equipment SVGs are authored to current body geometry — a rebuild orphans all equipment',
    'All 5 expression SVGs replicate specific body.svg head/hair geometry — must stay in sync',
    'Blink engine uses cx=68/92, cy=47 eye coordinates — hardcoded in avatar-blink-engine.js',
    'PresenceEngine breathing uses body proportions to set amplitude — geometry affects animation feel',
    'A full rebuild is a separate initiative, not a "pass" — it requires freezing equipment authoring ' +
    'while the base is rebuilt, then re-authoring or converting all equipment to the new geometry',
  ],

  what_phase_1_achieves:
    'Character now has: visible side hair coverage, expressive eyes, readable brows, ' +
    'defined eyelid creases, and a collar with physical depth. ' +
    'The character reads as "more alive" at 52px — not dramatically different in silhouette ' +
    'but noticeably more premium in face quality and hair believability.',

  what_phase_2_requires:
    'A coordinated equipment reauthoring sprint: body.svg + all equipment SVGs updated together. ' +
    'Cannot be incremental. Requires a feature branch, full equipment audit, and coordinated deploy.',
};
