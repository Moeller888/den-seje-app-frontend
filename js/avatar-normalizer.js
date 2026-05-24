// ── Avatar Asset Normalizer v1 ────────────────────────────────────────────────
// In-browser tooling for detecting and correcting SVG asset inconsistencies.
// Designed to run against SVG DOM elements — no build step, no Node.js required.
//
// Philosophy: prevent long-term asset entropy.
// As the cosmetic library grows, small inconsistencies compound.
// The normalizer catches them before they accumulate.
//
// Usage:
//   import { normalizeAsset, auditAsset } from './js/avatar-normalizer.js';
//
//   // Non-destructive audit:
//   const report = auditAsset(svgElement, 'crown');
//
//   // Normalize a clone (never mutate original directly):
//   const { element, changes, summary } = normalizeAsset(svgElement.cloneNode(true), 'crown');

// ── Change record factory ─────────────────────────────────────────────────────
function norm(changed, description) {
  return Object.freeze({ changed, description });
}

// ── Normalization rules ───────────────────────────────────────────────────────

// Enforce viewBox="0 0 160 240"
export function normalizeViewBox(svgEl) {
  const current = svgEl.getAttribute('viewBox');
  const target  = '0 0 160 240';
  if (current === target) return norm(false, 'viewBox already correct');
  svgEl.setAttribute('viewBox', target);
  return norm(true, `viewBox: "${current}" → "${target}"`);
}

// Enforce preserveAspectRatio if present and incorrect
export function normalizePreserveAspectRatio(svgEl) {
  const current = svgEl.getAttribute('preserveAspectRatio');
  if (!current || current === 'xMidYMid meet') return norm(false, 'preserveAspectRatio correct or absent');
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return norm(true, `preserveAspectRatio: "${current}" → "xMidYMid meet"`);
}

// Ensure a <defs> block exists as the first child
export function normalizeDefs(svgEl) {
  if (svgEl.querySelector('defs')) return norm(false, '<defs> already present');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svgEl.insertBefore(defs, svgEl.firstChild);
  return norm(true, 'Added empty <defs> as first child');
}

// Move gradient/pattern elements into <defs> if they are defined outside it
export function normalizeDefsContents(svgEl) {
  const defs = svgEl.querySelector('defs');
  if (!defs) return norm(false, 'No <defs> found — run normalizeDefs first');
  const orphans = [...svgEl.querySelectorAll(
    'linearGradient, radialGradient, pattern, filter, marker, symbol, clipPath'
  )].filter(el => el.parentElement !== defs);
  if (orphans.length === 0) return norm(false, 'All reusable elements already in <defs>');
  orphans.forEach(el => defs.appendChild(el));
  return norm(true, `Moved ${orphans.length} element(s) into <defs>`);
}

// Prefix all IDs with the slot name if not already prefixed.
// Also updates all url(#...) references to match the new IDs.
export function normalizeIdNaming(svgEl, slot) {
  if (!slot) return norm(false, 'No slot provided — skipping ID normalization');
  const prefix   = `${slot}_`;
  const elements = svgEl.querySelectorAll('[id]');
  const idMap    = new Map();
  let changed    = 0;

  elements.forEach(el => {
    if (!el.id.startsWith(prefix)) {
      const oldId = el.id;
      const newId = prefix + el.id;
      idMap.set(oldId, newId);
      el.id = newId;
      changed++;
    }
  });

  if (changed === 0) return norm(false, `All IDs already prefixed with "${prefix}"`);

  // Update all url(#...) paint references to use the new IDs
  svgEl.querySelectorAll('*').forEach(el => {
    for (const attr of el.attributes) {
      if (attr.value.includes('url(#')) {
        let val = attr.value;
        idMap.forEach((newId, oldId) => {
          val = val.replaceAll(`url(#${oldId})`, `url(#${newId})`);
        });
        if (val !== attr.value) el.setAttribute(attr.name, val);
      }
    }
  });

  return norm(true, `Prefixed ${changed} ID(s) with "${prefix}" — updated all url(#...) references`);
}

// Remove any <script> elements (security + pipeline requirement)
export function normalizeRemoveScripts(svgEl) {
  const scripts = svgEl.querySelectorAll('script');
  if (scripts.length === 0) return norm(false, 'No <script> elements to remove');
  scripts.forEach(s => s.remove());
  return norm(true, `Removed ${scripts.length} <script> element(s)`);
}

// Remove event handler attributes (onclick, onmouseover, etc.)
export function normalizeRemoveEventHandlers(svgEl) {
  const eventAttrs = ['onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
                      'onfocus', 'onblur', 'onload', 'onerror', 'onkeydown', 'onkeyup'];
  let removed = 0;
  svgEl.querySelectorAll('*').forEach(el => {
    eventAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) { el.removeAttribute(attr); removed++; }
    });
  });
  if (removed === 0) return norm(false, 'No event handler attributes found');
  return norm(true, `Removed ${removed} event handler attribute(s)`);
}

// ── Audit-only functions ──────────────────────────────────────────────────────
// These read-only queries report issues without mutating the element.

export function auditDuplicateIds(svgEl) {
  const ids  = svgEl ? [...svgEl.querySelectorAll('[id]')].map(el => el.id) : [];
  const seen = new Set();
  const dupes = new Set();
  ids.forEach(id => { seen.has(id) ? dupes.add(id) : seen.add(id); });
  return {
    hasDuplicates: dupes.size > 0,
    duplicates:    [...dupes],
    description:   dupes.size === 0 ? 'No duplicate IDs' : `Duplicates: ${[...dupes].join(', ')}`,
  };
}

export function auditIdNaming(svgEl, slot) {
  if (!slot) return { conforming: true, violations: [], description: 'No slot provided' };
  const prefix     = `${slot}_`;
  const violations = svgEl
    ? [...svgEl.querySelectorAll('[id]')].map(el => el.id).filter(id => !id.startsWith(prefix))
    : [];
  return {
    conforming:  violations.length === 0,
    violations,
    description: violations.length === 0
      ? `All IDs conform to "${prefix}*" convention`
      : `Non-conforming: ${violations.join(', ')}`,
  };
}

export function auditGradientCount(svgEl, slot) {
  const BUDGETS  = { crown: 3, mask: 2, glasses: 1, shirt: 3, back: 4, aura: 2 };
  const budget   = BUDGETS[slot] ?? null;
  const defs     = svgEl?.querySelector?.('defs');
  const count    = defs ? defs.querySelectorAll('linearGradient, radialGradient').length : 0;
  const withinBudget = budget == null || count <= budget;
  return {
    count,
    budget:      budget ?? 'no budget defined',
    withinBudget,
    description: budget == null
      ? `${count} gradient(s) (no budget for slot "${slot}")`
      : `${count}/${budget} gradients${withinBudget ? '' : ' — OVER BUDGET'}`,
  };
}

export function auditElementCount(svgEl, slot) {
  const BUDGETS  = { crown: 45, mask: 40, glasses: 20, shirt: 55, back: 70, aura: 50 };
  const budget   = BUDGETS[slot] ?? 70;
  const count    = svgEl ? svgEl.querySelectorAll('*').length : 0;
  const withinBudget = count <= budget;
  return {
    count,
    budget,
    withinBudget,
    description: `${count}/${budget} elements${withinBudget ? '' : ' — OVER BUDGET'}`,
  };
}

export function auditViewBox(svgEl) {
  const vb    = svgEl?.getAttribute?.('viewBox') ?? null;
  const valid = vb === '0 0 160 240';
  return { valid, current: vb, description: valid ? 'viewBox correct' : `viewBox is "${vb}" (expected "0 0 160 240")` };
}

// ── Full audit report ─────────────────────────────────────────────────────────
export function auditAsset(svgEl, slot) {
  return {
    viewBox:        auditViewBox(svgEl),
    duplicateIds:   auditDuplicateIds(svgEl),
    idNaming:       auditIdNaming(svgEl, slot),
    gradientCount:  auditGradientCount(svgEl, slot),
    elementCount:   auditElementCount(svgEl, slot),
    defsPresent:    !!svgEl?.querySelector?.('defs'),
    hasScripts:     (svgEl?.querySelectorAll?.('script').length ?? 0) > 0,
  };
}

// ── Full normalization pass ───────────────────────────────────────────────────
// ALWAYS pass a clone — normalizeAsset does NOT clone for you.
// Pattern: normalizeAsset(svgElement.cloneNode(true), 'crown')
export function normalizeAsset(svgEl, slot) {
  const allChanges = [
    normalizeViewBox(svgEl),
    normalizePreserveAspectRatio(svgEl),
    normalizeDefs(svgEl),
    normalizeDefsContents(svgEl),
    normalizeRemoveScripts(svgEl),
    normalizeRemoveEventHandlers(svgEl),
    normalizeIdNaming(svgEl, slot),
  ];
  const applied  = allChanges.filter(c => c.changed);
  const skipped  = allChanges.filter(c => !c.changed);
  return {
    element: svgEl,
    applied,
    skipped,
    summary: applied.length === 0
      ? 'Asset already conforms — no changes needed'
      : `${applied.length} normalization(s) applied`,
  };
}
