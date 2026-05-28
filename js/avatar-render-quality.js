// Section 58 — Premium Avatar Presence & Rendering Quality
//
// Goal: evolve the avatar from a philosophically coherent symbolic character
// into a visually premium, emotionally readable, high-presence stylized presence.
//
// This file documents the visual quality standard established in Section 58.
// It is a design contract, not runtime code. Import it for documentation and
// auditing purposes.

// ── Visual Benchmark Audit ────────────────────────────────────────────────────

export const BENCHMARK_FINDINGS = {
  duolingo: {
    strength: 'Silhouette is instantly readable at any size. Strong asymmetric posture. Face dominates the canvas.',
    gap: 'Den Seje App avatar has smaller canvas (52×78px) and less asymmetric posture. Face readability is sufficient but not dominant.',
    applicable_lesson: 'Face-forward posture. Eyes large relative to face. Emotion is immediately readable from thumbnail.',
  },
  riot_ui: {
    strength: 'Layered atmospheric depth. Characters feel lit from a specific direction. Material differentiation (cloth vs metal) is clear.',
    gap: 'Current avatar has flat atmospheric gradient. No directional lighting. No material hierarchy.',
    applicable_lesson: 'Rim light from upper-left. Inner vignette for depth. Contact shadow to ground the character.',
  },
  supercell: {
    strength: 'Silhouette clarity at small sizes. Every character has a shape you can identify in 2 seconds.',
    gap: 'Base avatar silhouette is a symmetric humanoid — readable but generic.',
    applicable_lesson: 'Equipment silhouettes (capes, crowns) break the symmetric read. Accessories are the silhouette differentiators.',
  },
  sky_children: {
    strength: 'Atmospheric depth. Characters feel embedded in a world. Ambient glow creates emotional warmth.',
    gap: 'Current avatar background gradient is functional but not atmospheric.',
    applicable_lesson: 'Dual-gradient background with overhead highlight. Inner vignette for atmospheric depth.',
  },
  premium_mobile_rpg: {
    strength: 'Layer compositing: foreground/background separation. Secondary motion: cloth, accessories animate independently.',
    gap: 'Current avatar has one animation (breathing on the whole container). No secondary motion on individual layers.',
    applicable_lesson: 'Semantic slot classes enable layer-specific animation. Cape drift, aura breath, independent of breathing.',
  },
};

// ── What Made the Avatar Feel Flat ───────────────────────────────────────────

export const FLATNESS_DIAGNOSIS = {
  single_gradient_background: {
    problem: 'One-stop radial gradient — no light direction, no atmospheric depth. Every layer lives in the same visual space.',
    fix: 'Dual gradient: overhead highlight (top 18%, 5% white) + original themed atmosphere. Creates a light source direction.',
  },
  single_box_shadow: {
    problem: 'var(--avatar-ambient) alone — a soft ambient glow with no depth information. No inner vignette, no ground contact.',
    fix: 'Multi-layer box-shadow: ambient glow + inner vignette (inset, depth) + contact shadow (grounding) + near shadow (crisp edge).',
  },
  no_directional_light: {
    problem: 'All surfaces share identical rendering weight. Face, body, and accessories read at the same visual level.',
    fix: '::before rim light overlay: 6% white at upper-left → transparent at center → 5% dark at lower-right. Simulates directional light source.',
  },
  single_animation_all_layers: {
    problem: 'The breathing animation on the container moves ALL layers together. No secondary motion. One rhythm.',
    fix: 'Semantic slot classes (avatar-slot-back, avatar-slot-aura) enable independent layer animations. Cape drifts at 5.3s. Aura breathes at 4.7s. Both are out of phase with the 3.5s character breathing.',
  },
  no_ground_contact: {
    problem: 'Character appears to float at an arbitrary position in the canvas. No visual connection to the world.',
    fix: 'box-shadow: 0 3px 7px rgba(0,0,0,0.40) creates a downward contact shadow. Character feels grounded.',
  },
};

// ── Depth & Layered Rendering System ─────────────────────────────────────────

export const DEPTH_SYSTEM = {
  layer_order: [
    { slot: 'aura',     z: -2, depth_role: 'deepest background — furthest from viewer',      motion: 'avatarAuraBreath 4.7s — slowest, most ambient' },
    { slot: 'back',     z: -1, depth_role: 'behind character — mid background',               motion: 'avatarCapeDrift 5.3s — cloth inertia, asymmetric settle' },
    { slot: 'base',     z:  0, depth_role: 'character body — primary focal plane',            motion: 'avatarBreathe 3.5s — breathing on container (all layers ride together)' },
    { slot: 'torso',    z:  2, depth_role: 'armor/clothing — character surface',              motion: 'rides with container breathing' },
    { slot: 'headwear', z:  5, depth_role: 'hat/crown — uppermost character element',         motion: 'rides with container breathing' },
    { slot: 'face',     z:  6, depth_role: 'expression — the emotional read layer',           motion: 'cross-fade transitions (ExpressionEngine)' },
    { slot: 'eyes',     z:  7, depth_role: 'glasses — topmost detail',                       motion: 'rides with container breathing' },
    { slot: 'rimlight', z:  9, depth_role: '::before overlay — directional light simulation', motion: 'static — lighting is constant' },
  ],
  atmosphere: {
    overhead_highlight: 'radial-gradient at 50% 18% — simulates overhead light source hitting top of canvas',
    chest_atmosphere:   'radial-gradient at 50% 35% — themed ambient color, creates character-specific atmosphere',
    inner_vignette:     'inset 0 0 9px rgba(0,0,0,0.26) — edges darker, center lighter = depth illusion',
    contact_shadow:     '0 3px 7px rgba(0,0,0,0.40) — grounding shadow below the character',
    rim_light:          'linear-gradient 148deg from rgba(255,255,255,0.06) — directional warm highlight from upper-left',
  },
};

// ── Secondary Motion System ───────────────────────────────────────────────────

export const SECONDARY_MOTION = {
  philosophy: 'Secondary motion creates the illusion of physical mass. When a cape continues to drift after the character settles, the viewer\'s brain infers that the cloth has weight. That inference elevates perceived realism without any additional art assets.',

  cape_drift: {
    keyframe: 'avatarCapeDrift',
    duration: '5.3s',
    amplitude_rotation: '±0.35°',
    amplitude_skew: '±0.12°',
    transform_origin: '50% 0% — rotates from shoulder point (top center)',
    cycle_relationship: '5.3s vs 3.5s breathing = 1.51 ratio — creates beat variation, never locks in phase',
    visual_at_52px: 'Bottom of cape drifts ~0.47px horizontally at peak. Imperceptible as rotation, perceptible as cloth movement.',
    easing: 'cubic-bezier(0.37, 0, 0.63, 1) — symmetric ease, reads as natural settling not mechanical oscillation',
  },

  aura_breath: {
    keyframe: 'avatarAuraBreath',
    duration: '4.7s',
    amplitude_opacity: '0.78 → 1.0 — 22% opacity range',
    amplitude_scale: '0.99 → 1.035 — 4.5% size range',
    transform_origin: '50% 38% — scaled from chest level, not canvas center',
    cycle_relationship: '4.7s vs 3.5s vs 5.3s = three independent periods. The aura never fully synchronizes with either breathing or cape.',
    visual_at_52px: 'Scale change of 1.035 = 0.91px radius change on a 26px half-width. Clearly visible as pulsation.',
    purpose: 'Aura is a supernatural atmospheric element. It should not breathe with the character — it breathes with its own rhythm, reinforcing its non-physical nature.',
  },

  reduced_motion: 'Both avatar-slot-back and avatar-slot-aura animations are suppressed under prefers-reduced-motion: reduce.',
};

// ── Face & Emotional Readability ──────────────────────────────────────────────

export const FACE_READABILITY = {
  current_state: 'Five expression SVGs (neutral, curious, focused, determined, proud) — all override the face region of the base body. ExpressionEngine cross-fades between them with asymmetric timing (35% fade-out, 65% fade-in).',
  strengths: [
    'Cross-fade asymmetry creates emotional inertia — old emotion releases faster than new one arrives',
    'Relational delay (35–80ms) before expression changes — face receives the moment before responding',
    'Preload of all expression SVGs eliminates first-use network delay',
    'Reduced motion: instant swaps (no fade) rather than animation suppression',
  ],
  visual_hierarchy: 'Expression layer at z=6, above all equipment except glasses (z=7). Face is always the focal layer.',
  section_58_improvement: 'Rim light overlay (z=9) sits above the expression, applying a unified lighting layer over the entire character including the face. This means the face is lit from the same direction as the body — unified lighting model, not a pasted-on head.',
  future_work: 'Blink animation requires inline SVG (CSS cannot access SVG internals through <img> src). Phase 2: inline SVG for expression layer with addressable pupil coordinates. Not in Section 58 scope — would require ExpressionEngine rewrite.',
};

// ── Lighting & Material Quality ───────────────────────────────────────────────

export const LIGHTING_MODEL = {
  light_direction: 'Upper-left (148° gradient angle) — common "reading light" position. Feels natural for a screen character.',
  rim_light: {
    implementation: '#avatar-display::before pseudo-element with z-index: 9',
    gradient: 'rgba(255,255,255,0.06) at 0% → rgba(255,255,255,0.015) at 28% → transparent at 52% → rgba(0,0,0,0.05) at 100%',
    intensity: '6% white maximum. Visible as a subtle sheen, not an obvious overlay.',
    purpose: 'Creates material differentiation — areas facing the light source catch it slightly, areas turned away are slightly shadowed.',
  },
  inner_vignette: {
    implementation: 'box-shadow: inset 0 0 9px rgba(0,0,0,0.26)',
    purpose: 'Edges of the canvas are slightly darker. Center is relatively brighter. Mimics how lighting falls off toward the periphery in real renders.',
    effect: 'Transforms a flat square canvas into a slightly curved, 3D-feeling space.',
  },
  overhead_highlight: {
    implementation: 'radial-gradient(ellipse at 50% 18%, rgba(255,255,255,0.05) 0%, transparent 52%)',
    purpose: 'Simulates ambient overhead light striking the top of the character canvas. Separates sky from ground in the character\'s environment.',
  },
};

// ── Atmospheric VFX Restraint ─────────────────────────────────────────────────

export const ATMOSPHERIC_VFX = {
  philosophy: 'Atmosphere should be felt before it is seen. If a student notices the atmosphere, it is too loud.',
  implemented: [
    'Aura breath: opacity + scale variation (avatarAuraBreath) — meditative, not flashy',
    'Dual-gradient background atmosphere — overhead light + themed ambient',
    'Inner vignette: edge darkening — atmospheric depth without visible effect',
    'Contact shadow: grounding — environmental embedding, not decoration',
  ],
  not_implemented: [
    'Particle systems — too small to be meaningful at 52×78px, too loud for calm educational context',
    'Glow pulses on container — avatarAuraBreath on the layer already provides this without container-level brightness change',
    'Motion trails — character is stationary, trails would look disconnected',
  ],
  scale_constraint: 'At 52×78px, an effect that would read as "subtle" at 400px reads as "invisible" or "noise". Every atmospheric effect must be calibrated to the actual canvas size.',
};

// ── Compositing & Integration ─────────────────────────────────────────────────

export const COMPOSITING = {
  stacking_context: 'isolation: isolate on #avatar-display creates a clean compositing boundary. All layers, pseudo-elements, and animations are contained within.',
  layer_hierarchy: 'z=-2 to z=9 within the stacking context. Rim light (z=9) is the topmost layer — ensures lighting applies uniformly to all character elements.',
  contact_shadow: 'box-shadow extends outside overflow: visible bounds. Character appears to rest on the surface below rather than floating above it.',
  theme_compatibility: 'All new visual effects use rgba() or var(--avatar-ambient) — no hardcoded theme colors introduced. Effects adapt to all 9 themes.',
};

// ── Premium Character Standard (Permanent) ───────────────────────────────────

export const PREMIUM_CHARACTER_STANDARD = {
  name: 'Den Seje App Avatar Quality Standard — established Section 58',
  principles: [
    'Calm presence over stimulation. Premium is slow, not fast.',
    'Layered depth over flatness. No element should live in the same visual plane as everything else.',
    'Emotional readability over detail. Face reads at 52px. That is the constraint.',
    'Silhouette clarity over decorative noise. Equipment should break the symmetric humanoid read.',
    'Secondary motion creates mass. If cloth doesn\'t drift, the character has no weight.',
    'Atmosphere is felt before seen. If the effect is visible as an effect, reduce it.',
    'Lighting unifies the render. All elements should be lit from the same direction.',
    'Ground the character. A contact shadow turns a floating SVG into a presence.',
    'Independent rhythm creates life. Aura, cape, and breathing must never synchronize.',
    'Educational trust first. Any visual upgrade that creates anxiety fails the standard.',
  ],
  quality_test: 'View the avatar for 10 seconds. Does it feel alive? Does it feel calm? Does it feel premium? If yes to all three: the standard is met.',
  failure_modes: [
    'Animation feels mechanical (synchronized cycles)',
    'Character feels pasted onto the UI (no grounding, no compositing)',
    'Effects compete with the educational content (overstimulation)',
    'Flatness survives (all layers at same visual depth)',
    'Face unreadable at canvas size',
  ],
};
