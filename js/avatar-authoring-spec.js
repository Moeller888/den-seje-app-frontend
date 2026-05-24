// ── Avatar Cosmetic Authoring Spec v1 ─────────────────────────────────────────
// The official production standard for all avatar cosmetic assets.
// All cosmetics shipped to production MUST conform to this specification.
//
// This is a contract, not guidance. Assets that violate this spec are pipeline-rejected.
//
// AUTHORED: 2026-05-24 | STATUS: v1 Production

// ── Coordinate System ─────────────────────────────────────────────────────────
// All assets share a coordinate space defined by the body SVG.
// The body SVG is the reference frame — all cosmetics align to it.
export const COORDINATE_STANDARD = Object.freeze({
  canvas:       { w: 160, h: 240 },
  viewBox:      '0 0 160 240',
  // Key body landmarks in SVG coordinate space
  head_center:  { x: 80,  y: 50  },
  head_radius:  30,
  face_center:  { x: 80,  y: 50  },
  torso_top:    { x: 80,  y: 85  },
  torso_mid:    { x: 80,  y: 130 },
  torso_bottom: { x: 80,  y: 175 },
  shoulder_L:   { x: 40,  y: 95  },
  shoulder_R:   { x: 120, y: 95  },
  hip_L:        { x: 50,  y: 170 },
  hip_R:        { x: 110, y: 170 },
  note: 'All coordinates are SVG user units within the 160×240 canvas. Y increases downward.',
});

// ── Slot Attachment Philosophy ─────────────────────────────────────────────────
// Each slot has a primary attachment anchor — where the cosmetic "hooks" to the body.
// Designers build outward from this anchor. The anchor is a contract, not a suggestion.
export const SLOT_ATTACHMENT = Object.freeze({
  crown: {
    anchor:           { x: 80, y: 20 },
    grows:            'upward — crown extends above head center',
    max_height_above: 40,
    base_contact_y:   22,
    note:             'Crown base must overlap the head top (y ≤ 22). Floating crowns are a defect.',
  },
  mask: {
    anchor:           { x: 80, y: 50 },
    grows:            'around face — centered on head_center',
    max_spread:       42,
    lower_limit_y:    85,
    note:             'Must not extend below y=85 (torso_top). Mask is a face item, not a chest item.',
  },
  glasses: {
    anchor:           { x: 80, y: 47 },
    grows:            'horizontally across the eye line',
    max_width:        65,
    note:             'Thin horizontal elements only. Max 1 gradient. Never overlaps mask slot. Eye-line only.',
  },
  shirt: {
    anchor:           { x: 80, y: 130 },
    grows:            'fills torso zone (y=85 to y=175)',
    max_horiz_spread: 55,
    note:             'Never extend into head zone (y<80). Shirt is torso only. Arms may be lightly implied.',
  },
  back: {
    anchor:           { x: 80, y: 100 },
    grows:            'behind and beside body — symmetric preferred',
    note:             'Wings/capes. May fill full canvas laterally. z=-1: always behind body. Symmetric unless intentionally asymmetric.',
  },
  aura: {
    anchor:           { x: 80, y: 120 },
    grows:            'ambient — surrounds full silhouette',
    note:             'Static SVG in v1. Opacity max 0.35/layer. The aura must never visually dominate the character.',
  },
});

// ── Silhouette Limits per Rarity ──────────────────────────────────────────────
// Visual mass scales with rarity. Common items must not feel Legendary.
// Legendary items must still preserve full body readability.
export const RARITY_SILHOUETTE = Object.freeze({
  common: {
    tier:           1,
    gradient_max:   1,
    element_max:    20,
    opacity_range:  [0.7,  1.0],
    description:    'Simple, clean shape. Single color or one gradient. Minimal internal detail.',
  },
  rare: {
    tier:           2,
    gradient_max:   2,
    element_max:    35,
    opacity_range:  [0.75, 1.0],
    description:    'Moderate detail. Two-tone palette. Subtle texture allowed.',
  },
  epic: {
    tier:           3,
    gradient_max:   3,
    element_max:    50,
    opacity_range:  [0.8,  1.0],
    description:    'Rich detail. Multi-gradient. Internal shading and highlights allowed.',
  },
  legendary: {
    tier:           4,
    gradient_max:   4,
    element_max:    70,
    opacity_range:  [0.85, 1.0],
    description:    'Full silhouette presence. Maximum allowed detail. Body must remain readable.',
  },
});

// ── Material Rules ────────────────────────────────────────────────────────────
// All cosmetics share the same ambient light model. Consistency is a contract.
export const MATERIAL_RULES = Object.freeze({
  light_direction:      'top-left at 30° — highlight top-left, shadow bottom-right',
  highlight_opacity:    [0.15, 0.40],  // never blown-out white
  shadow_opacity:       [0.10, 0.30],  // never pure black
  specular_allowed:     false,         // no sharp specular — educational calm aesthetic
  metallic_effect:      'achieved through gradient angle and stop contrast, not opacity spikes',
  transparency:         'decorative use only — never to thin the silhouette unintentionally',
  forbidden_techniques: [
    'bevel_and_emboss',
    'hard_drop_shadow',
    'saturated_outer_glow',
    'chromatic_aberration',
    'bloom',
  ],
});

// ── Gradient Naming Convention ────────────────────────────────────────────────
// IDs must be unique per SVG and follow this scheme.
// Format: {slot}_{type}_{index}
// Examples: crown_fill_0, crown_highlight_1, aura_ambient_0
export const GRADIENT_NAMING = Object.freeze({
  format:    '{slot}_{type}_{index}',
  types:     ['fill', 'highlight', 'shadow', 'ambient', 'rim', 'base'],
  examples:  ['crown_fill_0', 'mask_highlight_1', 'aura_ambient_0', 'back_rim_0', 'shirt_base_0'],
  forbidden: ['gradient1', 'linearGradient1', 'g1', 'grad', 'myGradient', 'color1'],
  reason:    'Generic names cause cross-SVG ID collisions when multiple assets are loaded simultaneously in the same DOM.',
});

// ── SVG Structure Requirements ────────────────────────────────────────────────
export const SVG_STRUCTURE = Object.freeze({
  required: [
    'viewBox="0 0 160 240"',
    '<defs> block present — even if empty, signals structural awareness',
    'All IDs prefixed with slot name: "{slot}_{type}_{index}"',
    'All gradient IDs unique and defined inside <defs>',
  ],
  recommended: [
    'preserveAspectRatio="xMidYMid meet"',
    'Semantic grouping: <g id="{slot}_base">, <g id="{slot}_detail">, <g id="{slot}_highlight">',
    'Comments marking primary attachment anchor coordinates',
  ],
  forbidden: [
    '<script> elements — no inline JS in SVG assets',
    'External href/xlink:href references — all assets must be self-contained',
    'Event handlers: onclick, onmouseover, onfocus, etc.',
    'CSS animation / SMIL animation within the SVG — cosmetics animate via breathing container only',
    'style="" with animation, transition, or transform properties',
  ],
});

// ── Layer Assignment Contract ─────────────────────────────────────────────────
// z-index values for the avatar DOM layer stack.
// All cosmetics MUST use their defined z-index. No exceptions.
// Applied as CSS z-index on .quiz-avatar-layer elements.
export const LAYER_ASSIGNMENTS = Object.freeze({
  aura:       -2,  // furthest back — ambient field
  back:       -1,  // wings/capes — behind body
  body:        0,  // base body SVG — the reference layer
  expression:  0,  // expression overlay — DOM-after body; appears above via stacking context
  shirt:       1,
  glasses:     2,
  mask:        3,
  crown:       4,
  note:        'z-index is set via CSS on .quiz-avatar-layer. Never set z-index directly on SVG elements or attributes.',
});

// ── Motion Budget ─────────────────────────────────────────────────────────────
// Breathing is the only active animation in v1.
// Cosmetics must not self-animate — they ride the breathing container as a unit.
export const MOTION_BUDGET = Object.freeze({
  independent_css_animations:  0,   // cosmetics must NOT self-animate
  independent_smil_animations: 0,   // no SMIL animation within SVG assets
  breathing_amplitude_max_px:  1.4, // max translateY during breathing
  breathing_scale_max_delta:   0.009, // max scale(1 + delta) during breathing
  future_aura_opacity_delta:   0.06, // reserved for v2 animated aura
  rule: 'Cosmetics animate as a unit via the breathing container transform. No cosmetic may introduce its own motion.',
});

// ── Aura Rendering Budget ─────────────────────────────────────────────────────
export const AURA_BUDGET = Object.freeze({
  opacity_max:     0.35,   // per layer
  blur_max:        6,      // feGaussianBlur stdDeviation
  layer_max:       3,      // max stacked semi-transparent layers
  colors:          1,      // aura uses single hue — tint is thematic, not multicolor
  scale_delta_max: 0.03,   // future: scale pulse around breathing cycle
  must_not: [
    'attract attention away from the character face',
    'pulse faster than the current breathing profile',
    'change color based on emotional state',
    'flash, strobe, or flicker at any frequency',
  ],
});

// ── Authoring Checklist ───────────────────────────────────────────────────────
// Ordered checklist for any new cosmetic asset.
// All items must be checked before submitting to the pipeline.
export const AUTHORING_CHECKLIST = Object.freeze([
  { step:  1, item: 'Set viewBox="0 0 160 240"' },
  { step:  2, item: 'Add <defs> block — place all gradients inside it' },
  { step:  3, item: 'Name all IDs as {slot}_{type}_{index}' },
  { step:  4, item: 'Align primary anchor to SLOT_ATTACHMENT coordinates' },
  { step:  5, item: 'Verify slot bounds — no unintended silhouette overflow' },
  { step:  6, item: 'Match rarity tier — visual weight must match tier budget' },
  { step:  7, item: 'Apply material rules — highlight top-left, shadow bottom-right' },
  { step:  8, item: 'Verify gradient count is within RARITY_SILHOUETTE.gradient_max' },
  { step:  9, item: 'Verify element count is within RARITY_SILHOUETTE.element_max' },
  { step: 10, item: 'Remove all <script>, event handlers, and external references' },
  { step: 11, item: 'Run validateAsset() — zero errors required, zero warnings preferred' },
  { step: 12, item: 'Test in gamefeel.html with full legendary loadout on all themes' },
  { step: 13, item: 'Verify breathing safety — silhouette reads at peak and trough of all breathing profiles' },
  { step: 14, item: 'Verify classroom appropriateness — no intense, distracting, or distressing imagery' },
]);
