// ── Avatar Performance Budget v1 ──────────────────────────────────────────────
// Production performance constraints for the avatar system.
// These budgets protect rendering performance across low-end mobile hardware.
//
// Baseline device: mid-range Android (2022) at 60fps target.
// Budget values are conservative — not worst-case, not best-case.
// When in doubt, tighter is safer.

// ── DOM budget ────────────────────────────────────────────────────────────────
// SVG elements are full DOM nodes. Each gradient stop, path, and filter adds cost.
export const DOM_BUDGET = Object.freeze({
  avatar_container_children: 8,    // max direct children of #avatar-display (one per slot + expression)
  total_avatar_dom_nodes:    300,   // all SVG internals across all active layers combined
  expression_overlay_nodes:  45,    // expression SVG internal node count
  single_cosmetic_max:       70,    // max nodes for any one cosmetic SVG
  warning_threshold:         0.80,  // warn at 80% of budget — headroom for future cosmetics
  note: 'DOM node count drives layout recalc cost. Keep well below budget.',
});

// ── Animation budget ──────────────────────────────────────────────────────────
// The avatar runs ONE continuous animation at steady state (breathing).
// Event responses use CSS transitions on opacity, not new keyframe animations.
export const ANIMATION_BUDGET = Object.freeze({
  concurrent_keyframe_animations: 1,   // only breathing at steady state
  max_during_event:               2,   // breathing + one expression opacity transition
  css_transition_properties:      3,   // opacity, transform, animation-duration
  keyframe_stops_per_animation:   3,   // 0%, 50%, 100% — no more complex curves
  note: 'One breathing animation + CSS transitions. No additional keyframe animations in the avatar layer.',
});

// ── Gradient budget ───────────────────────────────────────────────────────────
// Gradients are GPU textures. Each gradient (not stop) creates a compositing cost.
export const GRADIENT_BUDGET = Object.freeze({
  total_active_across_all_layers: 12, // sum across all loaded cosmetic SVGs at once
  per_slot: Object.freeze({ crown: 3, mask: 2, glasses: 1, shirt: 3, back: 4, aura: 2 }),
  note: 'Reuse gradient definitions where possible. Each unique gradient is a separate GPU upload.',
});

// ── Layered opacity budget ────────────────────────────────────────────────────
// Stacked translucency triggers expensive compositing passes.
// Each semi-transparent layer is a separate GPU compositing layer.
export const OPACITY_BUDGET = Object.freeze({
  max_stacked_translucent_layers: 4,
  total_opacity_accumulation:     3.0,  // sum of all layer opacity values
  aura_max_opacity:               0.35,
  expression_max_opacity:         1.0,  // expression is always fully opaque or fully transparent
  body_opacity:                   1.0,  // body layer is always fully opaque — never reduce
  note: 'Aura is the most expensive layer because it is translucent AND has a blur filter.',
});

// ── Mobile rendering cost model ───────────────────────────────────────────────
// Normalized relative rendering cost on mid-range Android (2022).
// 1.0 = body SVG only (baseline).
// Values are estimates — actual cost depends on device GPU and screen DPI.
export const MOBILE_RENDERING_COST = Object.freeze({
  body_only:                          1.00,
  body_plus_expression:               1.15,
  body_plus_shirt:                    1.12,
  body_plus_crown:                    1.18,
  body_plus_glasses:                  1.08,
  body_plus_mask:                     1.16,
  body_plus_back_wings:               1.25,
  body_plus_aura:                     1.40,  // aura costs most: blur filter + transparency
  full_loadout_no_aura:               1.80,  // all slots except aura
  full_legendary_with_aura:           2.20,  // all slots — acceptable on target devices
  full_legendary_aura_animated_v2:    3.80,  // future animated aura — approaches limit
  budget_ceiling:                     3.50,  // max acceptable relative cost
  note: 'Full legendary is within budget. Animated aura (v2) must be profiled carefully on low-end devices before shipping.',
});

// ── Memory budget ─────────────────────────────────────────────────────────────
// SVG is text — it compresses very well. These limits are generous but enforced.
export const MEMORY_BUDGET = Object.freeze({
  svg_asset_kb_max:             30,   // per cosmetic SVG (gzip basis)
  total_avatar_assets_kb:      150,   // all cosmetic layers combined
  expression_svgs_total_kb:     40,   // 5 expressions × ~8KB each
  body_svg_kb:                   8,   // body SVG baseline
  note: 'Most cosmetics are 2–8KB gzipped. The 30KB limit allows for rich legendary items.',
});

// ── Timing budget ─────────────────────────────────────────────────────────────
// These are human-perception budgets, not hardware budgets.
// Violating them degrades gamefeel, not FPS.
export const TIMING_BUDGET = Object.freeze({
  expression_crossfade_min_ms:   180,   // below this, transitions feel clipped
  expression_crossfade_max_ms:   300,   // above this, transitions feel sluggish
  breathing_inertia_min_ms:     1000,
  breathing_inertia_max_ms:     3500,
  level_up_overlay_max_ms:      2500,
  coin_popup_max_ms:            1000,
  correct_feedback_delay_ms:     600,   // how fast the next question loads after correct
  incorrect_feedback_delay_ms:  2000,   // time to absorb the incorrect state
});

// ── Budget checker utilities ──────────────────────────────────────────────────

export function checkDOMBudget(container) {
  if (!container) return { pass: false, usage: 0, budget: DOM_BUDGET.total_avatar_dom_nodes, detail: 'No container' };
  const count  = container.querySelectorAll('*').length;
  const budget = DOM_BUDGET.total_avatar_dom_nodes;
  const ratio  = count / budget;
  return {
    pass:   count <= budget,
    warn:   ratio > DOM_BUDGET.warning_threshold && count <= budget,
    usage:  count,
    budget,
    ratio,
    detail: `${count}/${budget} DOM nodes (${Math.round(ratio * 100)}%)`,
  };
}

export function checkAnimationBudget(container) {
  if (!container) return { pass: false, detail: 'No container' };
  const animated = [...container.querySelectorAll('[class]')].filter(el =>
    [...el.classList].some(c => c.includes('flash') || c.includes('animate'))
  ).length;
  const budget = ANIMATION_BUDGET.max_during_event;
  return {
    pass:   animated <= budget,
    usage:  animated,
    budget,
    detail: `${animated} active animation class(es) — budget: ${budget}`,
  };
}

export function checkLayerCount(container) {
  if (!container) return { pass: false, detail: 'No container' };
  const layers = container.querySelectorAll('.quiz-avatar-layer').length;
  const budget = DOM_BUDGET.avatar_container_children;
  return {
    pass:   layers <= budget,
    usage:  layers,
    budget,
    detail: `${layers}/${budget} avatar layers`,
  };
}

// ── Full budget report ────────────────────────────────────────────────────────
export function generateBudgetReport(container) {
  return Object.freeze({
    dom:       checkDOMBudget(container),
    animation: checkAnimationBudget(container),
    layers:    checkLayerCount(container),
    timestamp: Date.now(),
  });
}
