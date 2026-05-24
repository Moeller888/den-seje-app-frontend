// ── Avatar Validation Pipeline v1 ─────────────────────────────────────────────
// Automated validation for avatar SVG assets.
// Run before any cosmetic reaches production — catches issues before deployment.
//
// Design: pure functions, browser-compatible, tree-shakeable.
// Each rule returns a ValidationResult — never throws.
//
// Usage:
//   import { validateAsset, summarize } from './js/avatar-validator.js';
//   const results = validateAsset(svgElement, 'crown');
//   const summary = summarize(results);
//   if (!summary.pass) { /* block deployment */ }

// ── Severity levels ───────────────────────────────────────────────────────────
// ERROR: blocks deployment — asset must be fixed before shipping
// WARN:  should be fixed — degrades quality or long-term maintainability
// INFO:  informational — no action required
export const SEVERITY = Object.freeze({ ERROR: 'error', WARN: 'warn', INFO: 'info' });

// ── Production standard ───────────────────────────────────────────────────────
export const STANDARD_VIEWBOX   = '0 0 160 240';
export const STANDARD_VIEWBOX_W = 160;
export const STANDARD_VIEWBOX_H = 240;

// ── Slot bounding regions (SVG coordinate space) ──────────────────────────────
// Elements significantly outside these regions trigger silhouette overflow errors.
// Back slot is permissive — wings/capes need the full canvas.
// Aura deliberately bleeds beyond canvas to create ambient field effect.
export const SLOT_BOUNDS = Object.freeze({
  crown:   { x: 20,   y:   0, w: 120, h:  60 },
  mask:    { x: 35,   y:  18, w:  90, h:  70 },
  glasses: { x: 45,   y:  28, w:  70, h:  28 },
  shirt:   { x: 20,   y:  80, w: 120, h: 100 },
  back:    { x:  0,   y:  20, w: 160, h: 200 },
  aura:    { x: -20,  y: -20, w: 200, h: 280 },
});

// ── Per-slot opacity budget ───────────────────────────────────────────────────
// max_single: highest opacity any single layer may carry
// max_stack:  accumulated opacity across all layers (prevents muddiness)
export const OPACITY_BUDGET = Object.freeze({
  crown:   { max_single: 1.0,  max_stack: 2.0 },
  mask:    { max_single: 0.92, max_stack: 1.6 },
  glasses: { max_single: 0.85, max_stack: 1.0 },
  shirt:   { max_single: 1.0,  max_stack: 2.0 },
  back:    { max_single: 0.95, max_stack: 2.4 },
  aura:    { max_single: 0.35, max_stack: 0.60 }, // strictest — aura is ambient only
});

// ── Per-slot gradient budget ──────────────────────────────────────────────────
// More gradients = more GPU texture memory + slower compositing.
// These are hard maximums, not targets — aim for fewer.
export const GRADIENT_BUDGET = Object.freeze({
  crown: 3, mask: 2, glasses: 1, shirt: 3, back: 4, aura: 2,
});

// ── Per-slot element count budget ─────────────────────────────────────────────
// SVG element count drives DOM size and paint cost.
// Each <path>, <circle>, <rect>, <defs>, <stop> is a node.
export const ELEMENT_BUDGET = Object.freeze({
  crown: 45, mask: 40, glasses: 20, shirt: 55, back: 70, aura: 50,
});

// ── Glow safety limit ─────────────────────────────────────────────────────────
// feGaussianBlur stdDeviation above this draws attention away from the character.
export const MAX_BLUR_STD_DEVIATION = 8;

// ── Internal result factory ───────────────────────────────────────────────────
function result(rule, pass, severity, detail) {
  return Object.freeze({ rule, pass, severity, detail });
}

// ── Validation rules ──────────────────────────────────────────────────────────

export function validateViewBox(svgEl) {
  const vb   = svgEl?.getAttribute?.('viewBox') ?? null;
  const pass = vb === STANDARD_VIEWBOX;
  return result(
    'viewbox_standard', pass, SEVERITY.ERROR,
    pass ? `viewBox correct: "${STANDARD_VIEWBOX}"` : `viewBox "${vb}" must be "${STANDARD_VIEWBOX}"`
  );
}

export function validateRequiredAttributes(svgEl) {
  if (!svgEl) return result('required_attributes', false, SEVERITY.ERROR, 'No SVG element');
  const issues = [];
  if (!svgEl.getAttribute('viewBox')) issues.push('missing viewBox');
  const pa = svgEl.getAttribute('preserveAspectRatio');
  if (pa && pa !== 'xMidYMid meet') issues.push(`preserveAspectRatio="${pa}" — use "xMidYMid meet" or omit`);
  const pass = issues.length === 0;
  return result('required_attributes', pass, SEVERITY.ERROR,
    pass ? 'Required attributes valid' : issues.join('; ')
  );
}

export function validateNoDuplicateIds(svgEl) {
  const ids  = svgEl ? [...svgEl.querySelectorAll('[id]')].map(el => el.id) : [];
  const seen = new Set();
  const dupes = new Set();
  ids.forEach(id => { seen.has(id) ? dupes.add(id) : seen.add(id); });
  const pass = dupes.size === 0;
  return result('no_duplicate_ids', pass, SEVERITY.ERROR,
    pass ? 'No duplicate IDs' : `Duplicate IDs: ${[...dupes].join(', ')}`
  );
}

export function validateGradientRefs(svgEl) {
  if (!svgEl) return result('gradient_refs_defined', true, SEVERITY.INFO, 'No element');
  const defs = svgEl.querySelector('defs');
  const definedIds = defs
    ? new Set([...defs.querySelectorAll('[id]')].map(el => el.id))
    : new Set();
  const broken = [];
  svgEl.querySelectorAll('*').forEach(el => {
    for (const attr of ['fill', 'stroke']) {
      const val = el.getAttribute(attr) ?? '';
      const m   = val.match(/^url\(#([^)]+)\)$/);
      if (m && !definedIds.has(m[1])) broken.push(`${attr}:url(#${m[1]})`);
    }
  });
  const pass = broken.length === 0;
  return result('gradient_refs_defined', pass, SEVERITY.ERROR,
    pass ? 'All gradient refs resolve' : `Broken refs: ${broken.join('; ')}`
  );
}

export function validateGradientCount(svgEl, slot) {
  const budget = GRADIENT_BUDGET[slot] ?? null;
  if (budget == null) return result('gradient_count', true, SEVERITY.INFO, `No gradient budget for slot "${slot}"`);
  const defs  = svgEl?.querySelector?.('defs');
  const count = defs ? defs.querySelectorAll('linearGradient, radialGradient').length : 0;
  const pass  = count <= budget;
  return result('gradient_count', pass, SEVERITY.WARN,
    pass ? `Gradients: ${count}/${budget}` : `Gradients: ${count} exceeds budget ${budget} for "${slot}"`
  );
}

export function validateElementCount(svgEl, slot) {
  const budget = ELEMENT_BUDGET[slot] ?? 70;
  const count  = svgEl ? svgEl.querySelectorAll('*').length : 0;
  const pass   = count <= budget;
  return result('element_count', pass, SEVERITY.WARN,
    pass ? `Elements: ${count}/${budget}` : `Elements: ${count} exceeds budget ${budget} for "${slot}" — simplify`
  );
}

export function validateGlowIntensity(svgEl) {
  const violations = [];
  svgEl?.querySelectorAll?.('feGaussianBlur')?.forEach(fe => {
    const sd = parseFloat(fe.getAttribute('stdDeviation') ?? '0');
    if (sd > MAX_BLUR_STD_DEVIATION) violations.push(`stdDeviation=${sd}`);
  });
  const pass = violations.length === 0;
  return result('glow_intensity', pass, SEVERITY.WARN,
    pass
      ? `Glow within limit (max stdDeviation=${MAX_BLUR_STD_DEVIATION})`
      : `Unsafe glow: ${violations.join(', ')} — max is ${MAX_BLUR_STD_DEVIATION}`
  );
}

export function validateAuraOpacity(svgEl) {
  const max        = OPACITY_BUDGET.aura.max_single;
  const violations = [];
  svgEl?.querySelectorAll?.('[opacity], [fill-opacity]')?.forEach(el => {
    const v = parseFloat(el.getAttribute('opacity') ?? el.getAttribute('fill-opacity') ?? '1');
    if (!isNaN(v) && v > max) violations.push(`<${el.tagName}> opacity=${v.toFixed(2)}`);
  });
  const pass = violations.length === 0;
  return result('aura_opacity_budget', pass, SEVERITY.WARN,
    pass ? `Aura opacity within budget (≤${max})` : `Over budget: ${violations.join(', ')}`
  );
}

export function validateIdNaming(svgEl, slot) {
  if (!svgEl || !slot) return result('id_naming', true, SEVERITY.INFO, 'No slot provided');
  const prefix = `${slot}_`;
  const badIds = [...svgEl.querySelectorAll('[id]')]
    .map(el => el.id)
    .filter(id => !id.startsWith(prefix));
  const pass = badIds.length === 0;
  return result('id_naming', pass, SEVERITY.WARN,
    pass
      ? `All IDs follow convention "${prefix}*"`
      : `Non-conforming IDs: ${badIds.join(', ')} (prefix with "${prefix}")`
  );
}

export function validateNoScriptElements(svgEl) {
  const count = svgEl ? svgEl.querySelectorAll('script').length : 0;
  const pass  = count === 0;
  return result('no_script_elements', pass, SEVERITY.ERROR,
    pass ? 'No <script> elements in SVG' : `${count} <script> element(s) found — SVG assets must not contain JS`
  );
}

export function validateNoExternalRefs(svgEl) {
  const violations = [];
  svgEl?.querySelectorAll?.('[href], [xlink\\:href]')?.forEach(el => {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
    if (href.startsWith('http') || href.startsWith('//')) violations.push(href);
  });
  const pass = violations.length === 0;
  return result('no_external_refs', pass, SEVERITY.ERROR,
    pass ? 'No external href references' : `External refs found: ${violations.join(', ')} — assets must be self-contained`
  );
}

// ── Full validation runner ────────────────────────────────────────────────────
export function validateAsset(svgEl, slot) {
  if (!svgEl) return [result('asset_present', false, SEVERITY.ERROR, 'No SVG element provided')];
  const rules = [
    validateViewBox(svgEl),
    validateRequiredAttributes(svgEl),
    validateNoDuplicateIds(svgEl),
    validateGradientRefs(svgEl),
    validateGradientCount(svgEl, slot),
    validateElementCount(svgEl, slot),
    validateGlowIntensity(svgEl),
    validateIdNaming(svgEl, slot),
    validateNoScriptElements(svgEl),
    validateNoExternalRefs(svgEl),
  ];
  if (slot === 'aura') rules.push(validateAuraOpacity(svgEl));
  return rules;
}

// ── Validation summary ────────────────────────────────────────────────────────
export function summarize(results) {
  const errors   = results.filter(r => !r.pass && r.severity === SEVERITY.ERROR).length;
  const warnings = results.filter(r => !r.pass && r.severity === SEVERITY.WARN).length;
  return Object.freeze({ pass: errors === 0, errors, warnings, total: results.length, results });
}

// ── Rule catalogue ────────────────────────────────────────────────────────────
// Human-readable descriptions for tooling/documentation.
export const RULE_CATALOGUE = Object.freeze([
  { id: 'viewbox_standard',      severity: 'error', description: 'viewBox must be exactly "0 0 160 240"' },
  { id: 'required_attributes',   severity: 'error', description: 'Required SVG attributes must be valid' },
  { id: 'no_duplicate_ids',      severity: 'error', description: 'No two elements in one SVG may share an ID' },
  { id: 'gradient_refs_defined', severity: 'error', description: 'All url(#...) references must resolve to defined <defs>' },
  { id: 'no_script_elements',    severity: 'error', description: 'SVG assets must contain no <script> elements' },
  { id: 'no_external_refs',      severity: 'error', description: 'SVG assets must be fully self-contained — no external hrefs' },
  { id: 'gradient_count',        severity: 'warn',  description: 'Gradient count must stay within per-slot budget' },
  { id: 'element_count',         severity: 'warn',  description: 'Total element count must not exceed per-slot complexity budget' },
  { id: 'glow_intensity',        severity: 'warn',  description: `feGaussianBlur stdDeviation must not exceed ${MAX_BLUR_STD_DEVIATION}` },
  { id: 'id_naming',             severity: 'warn',  description: 'All IDs must use the "{slot}_{type}_{index}" convention' },
  { id: 'aura_opacity_budget',   severity: 'warn',  description: `Aura element opacity must not exceed ${OPACITY_BUDGET.aura.max_single}` },
]);
