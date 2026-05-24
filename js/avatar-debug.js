// ── Avatar Debug Panel v1 ─────────────────────────────────────────────────────
// Developer observability tool for the avatar runtime system.
// Shows active expression state, breathing profile, event timers, DOM health,
// loadout composition, and runtime warnings in a floating panel.
//
// Usage:
//   import { AvatarDebugPanel } from './js/avatar-debug.js';
//   const panel = new AvatarDebugPanel({ exprEngine, presenceEngine, container });
//   panel.mount(document.body);
//   panel.destroy();  // cleans up all timers and DOM
//
// Toggle: Alt+D
// This file should NOT be imported in production bundles.
// It is intended for developer builds, gamefeel testing, and QA validation.

export class AvatarDebugPanel {
  constructor({ exprEngine = null, presenceEngine = null, container = null } = {}) {
    this._expr       = exprEngine;
    this._presence   = presenceEngine;
    this._container  = container;
    this._el         = null;
    this._timer      = null;
    this._visible    = false;
    this._startMs    = Date.now();
    this._keyHandler = this._onKey.bind(this);
    window.addEventListener('keydown', this._keyHandler);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  mount(parent = document.body) {
    if (this._el) return;
    this._el = this._buildPanel();
    parent.appendChild(this._el);
    this._timer = setInterval(() => this._refresh(), 200);
  }

  destroy() {
    clearInterval(this._timer);
    this._timer = null;
    this._el?.remove();
    this._el = null;
    window.removeEventListener('keydown', this._keyHandler);
    this._expr      = null;
    this._presence  = null;
    this._container = null;
  }

  show()   { this._visible = true;  if (this._el) this._el.style.display = 'block'; }
  hide()   { this._visible = false; if (this._el) this._el.style.display = 'none'; }
  toggle() { this._visible ? this.hide() : this.show(); }

  // Connect or reconnect to running engines (call after reinit)
  connect({ exprEngine = null, presenceEngine = null, container = null } = {}) {
    if (exprEngine   != null) this._expr      = exprEngine;
    if (presenceEngine != null) this._presence = presenceEngine;
    if (container    != null) this._container  = container;
  }

  // ── Panel construction ────────────────────────────────────────────────────

  _buildPanel() {
    const el = document.createElement('div');
    el.setAttribute('id', 'avatar-debug-panel');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Avatar debug panel');
    Object.assign(el.style, {
      position:   'fixed',
      bottom:     '16px',
      right:      '16px',
      zIndex:     '9999',
      background: '#0d0d0d',
      color:      '#d8d8d8',
      fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
      fontSize:   '11px',
      padding:    '12px 14px',
      borderRadius: '8px',
      border:     '1px solid #2a2a2a',
      minWidth:   '250px',
      maxWidth:   '340px',
      boxShadow:  '0 4px 24px rgba(0,0,0,0.7)',
      display:    'none',
      lineHeight: '1.75',
      userSelect: 'none',
    });

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #222">
        <span style="color:#555;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;font-weight:bold">Avatar Debug</span>
        <span id="_adbp_close" title="Close (Alt+D)" style="cursor:pointer;color:#444;font-size:12px;padding:0 2px">✕</span>
      </div>
      <div id="_adbp_body"></div>
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #1a1a1a;color:#333;font-size:9px;letter-spacing:0.5px">
        Alt+D to toggle · 200ms refresh
      </div>
    `;
    el.querySelector('#_adbp_close').onclick = () => this.hide();
    return el;
  }

  _refresh() {
    if (!this._el || !this._visible) return;
    const body = this._el.querySelector('#_adbp_body');
    if (body) body.innerHTML = this._buildContent();
  }

  _buildContent() {
    const lines   = [];
    const uptime  = ((Date.now() - this._startMs) / 1000).toFixed(1);

    lines.push(this._row('Uptime', `${uptime}s`, '#555'));

    // ── ExpressionEngine ──────────────────────────────────────────────────
    lines.push(this._section('Expression'));
    if (this._expr) {
      const stateExpr   = this._expr._stateExpr   ?? '—';
      const currentExpr = this._expr._currentExpr ?? '—';
      const hasHold     = !!this._expr._holdTimer;
      const priority    = this._expr._priority    ?? '—';
      lines.push(this._row('State',    stateExpr));
      lines.push(this._row('Current',  currentExpr, stateExpr !== currentExpr ? '#f0c040' : '#d8d8d8'));
      lines.push(this._row('Hold',     hasHold ? 'ACTIVE' : 'none', hasHold ? '#f0c040' : '#444'));
      lines.push(this._row('Priority', String(priority)));
    } else {
      lines.push(this._warn('ExpressionEngine not connected'));
    }

    // ── PresenceEngine ────────────────────────────────────────────────────
    lines.push(this._section('Presence'));
    if (this._presence) {
      const stateBreath  = this._presence._stateBreath ?? '—';
      const breathActive = !!this._presence._breathTimer;
      const idleActive   = !!this._presence._idleTimer;
      lines.push(this._row('State breath',  stateBreath));
      lines.push(this._row('Event hold',    breathActive ? 'ACTIVE' : 'none', breathActive ? '#f0c040' : '#444'));
      lines.push(this._row('Idle timer',    idleActive   ? 'set'    : '—',    idleActive   ? '#60c0a0' : '#444'));
      if (this._container) {
        const dur   = this._container.style.animationDuration;
        const shift = this._container.style.getPropertyValue('--breathe-shift');
        const scale = this._container.style.getPropertyValue('--breathe-scale');
        if (dur)   lines.push(this._row('Anim duration', dur));
        if (shift) lines.push(this._row('Shift',  shift));
        if (scale) lines.push(this._row('Scale',  scale));
      }
    } else {
      lines.push(this._warn('PresenceEngine not connected'));
    }

    // ── DOM Health ────────────────────────────────────────────────────────
    lines.push(this._section('DOM'));
    if (this._container) {
      const nodeCount  = this._container.querySelectorAll('*').length;
      const layerCount = this._container.querySelectorAll('.quiz-avatar-layer').length;
      const domBudget  = 300;
      const ratio      = nodeCount / domBudget;
      const domColor   = ratio > 0.90 ? '#f04040' : ratio > 0.75 ? '#f0c040' : '#60c0a0';
      lines.push(this._row('Nodes',   `${nodeCount}/${domBudget}`, domColor));
      lines.push(this._row('Layers',  String(layerCount)));
      const inDoc = document.contains(this._container);
      lines.push(this._row('In DOM',  inDoc ? 'yes' : 'NO', inDoc ? '#60c0a0' : '#f04040'));
    } else {
      lines.push(this._warn('No container connected'));
    }

    // ── Warnings ──────────────────────────────────────────────────────────
    const warnings = this._collectWarnings();
    if (warnings.length > 0) {
      lines.push(this._section('Warnings'));
      warnings.forEach(w => lines.push(this._warn(w)));
    }

    return lines.join('');
  }

  _collectWarnings() {
    const w = [];
    if (this._container) {
      const nodeCount = this._container.querySelectorAll('*').length;
      if (nodeCount > 270) w.push(`DOM nodes ${nodeCount} approaching budget (300)`);
      const layers = this._container.querySelectorAll('.quiz-avatar-layer').length;
      if (layers > 8) w.push(`Layer count ${layers} exceeds budget (8)`);
    }
    if (!this._expr && !this._presence) {
      w.push('No engines connected — debug panel shows limited data');
    }
    return w;
  }

  _section(title) {
    return `<div style="margin-top:8px;margin-bottom:2px;color:#3a3a3a;font-size:9px;text-transform:uppercase;letter-spacing:1px">${title}</div>`;
  }

  _row(label, value, valueColor = '#d8d8d8') {
    return `<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0">
      <span style="color:#555">${this._esc(label)}</span>
      <span style="color:${valueColor};font-weight:600">${this._esc(String(value))}</span>
    </div>`;
  }

  _warn(msg) {
    return `<div style="color:#f04040;font-size:10px;padding:1px 0">⚠ ${this._esc(msg)}</div>`;
  }

  _esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _onKey(e) {
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      this.toggle();
    }
  }
}

// ── Quick-mount helper ────────────────────────────────────────────────────────
// Creates and mounts a debug panel in one call.
// Returns the panel instance — call destroy() when done.
export function mountDebugPanel({ exprEngine, presenceEngine, container, parent } = {}) {
  const panel = new AvatarDebugPanel({ exprEngine, presenceEngine, container });
  panel.mount(parent ?? document.body);
  panel.show();
  return panel;
}
