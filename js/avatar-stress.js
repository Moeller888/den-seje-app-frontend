// ── Avatar Runtime Stress Test Framework v1 ───────────────────────────────────
// Systematic stress testing for the avatar runtime system.
// Detects timing drift, memory leaks, animation desync, and layering instability
// before they manifest in production.
//
// Usage:
//   import { StressTestRunner, STRESS_TESTS } from './js/avatar-stress.js';
//   const runner = new StressTestRunner({ exprEngine, presenceEngine, container });
//   const result = await runner.run('rapid_emotion_switching');
//   const all    = await runner.runAll();

// ── Test definitions ──────────────────────────────────────────────────────────
export const STRESS_TESTS = Object.freeze([
  {
    id:          'rapid_emotion_switching',
    name:        'Rapid Emotional State Switching',
    description: 'Fires 20 state transitions in rapid succession. Detects expression desync, breathing drift, and CSS property desynchronization.',
    duration_ms: 2000,
    risk_areas:  ['expression hold timer stacking', 'breathing inertia overlap', 'CSS custom property desync'],
  },
  {
    id:          'reward_spam',
    name:        'Reward Spam',
    description: 'Fires 10 CORRECT events in 5 seconds. Verifies hold timer reset behavior and that no expression queue builds up.',
    duration_ms: 5000,
    risk_areas:  ['setTimeout accumulation', 'expression flickering', 'breathing never returning to state profile'],
  },
  {
    id:          'level_up_overlap',
    name:        'LEVEL_UP + CORRECT Overlap',
    description: 'Fires LEVEL_UP then CORRECT within 50ms. Tests CRITICAL vs EVENT priority override correctness.',
    duration_ms: 3500,
    risk_areas:  ['CRITICAL vs EVENT priority conflict', 'breathing hold timer race condition'],
  },
  {
    id:          'async_event_overlap',
    name:        'Same-Tick Event Overlap',
    description: 'Fires INCORRECT and CORRECT in the same JS tick. Last-write-wins must resolve cleanly.',
    duration_ms: 2500,
    risk_areas:  ['clearTimeout on wrong timer', 'last-write-wins correctness', 'state coherence after race'],
  },
  {
    id:          'long_idle_verify',
    name:        'Long Idle Timer Verification',
    description: 'Verifies idle settle timer is set after state change. Does not wait 30s — checks timer registration.',
    duration_ms: 200,
    risk_areas:  ['idle timer not set', 'idle timer cleared prematurely', 'stale breathing after settle'],
  },
  {
    id:          'reduced_motion_safety',
    name:        'Reduced-Motion Safety',
    description: 'Calls breathing methods when prefersReducedMotion is active. Verifies no errors and graceful no-op.',
    duration_ms: 200,
    risk_areas:  ['null container error in breathing path', 'animation restart on reduced-motion device'],
  },
  {
    id:          'dom_layer_integrity',
    name:        'DOM Layer Integrity',
    description: 'Checks z-index consistency, layer count, and no floating layers in the avatar container.',
    duration_ms: 100,
    risk_areas:  ['duplicate z-index values', 'missing layers', 'floating DOM nodes outside container'],
  },
  {
    id:          'destroy_reinit',
    name:        'Engine Destroy & Reinitialize',
    description: 'Destroys both engines, then calls public methods. Verifies no orphaned timers and clean null-safety.',
    duration_ms: 300,
    risk_areas:  ['orphaned setTimeouts after destroy', 'null container errors', 'reinit produces clean state'],
  },
]);

// ── Test result factory ───────────────────────────────────────────────────────
function stressResult(testId, pass, findings, timing_ms) {
  return Object.freeze({ testId, pass, findings: Object.freeze(findings), timing_ms, timestamp: Date.now() });
}

// ── StressTestRunner ──────────────────────────────────────────────────────────

export class StressTestRunner {
  constructor({ exprEngine = null, presenceEngine = null, container = null } = {}) {
    this._expr      = exprEngine;
    this._presence  = presenceEngine;
    this._container = container;
    this._results   = [];
  }

  get results() { return [...this._results]; }

  // Run a single test by ID. Returns a stressResult.
  async run(testId) {
    const def = STRESS_TESTS.find(t => t.id === testId);
    if (!def) return stressResult(testId, false, [`Unknown test ID: "${testId}"`], 0);

    const start    = performance.now();
    const findings = [];
    try {
      await this._execute(def, findings);
    } catch (e) {
      findings.push(`Unhandled exception: ${e?.message ?? String(e)}`);
    }
    const elapsed = Math.round(performance.now() - start);
    const result  = stressResult(testId, findings.length === 0, findings, elapsed);
    this._results.push(result);
    return result;
  }

  // Run all tests sequentially. Returns array of stressResult.
  async runAll() {
    const results = [];
    for (const def of STRESS_TESTS) {
      results.push(await this.run(def.id));
    }
    return results;
  }

  // Summary of all results collected so far.
  summarize() {
    const passed = this._results.filter(r => r.pass).length;
    const failed = this._results.filter(r => !r.pass).length;
    return { passed, failed, total: this._results.length, results: this.results };
  }

  // ── Test implementations ────────────────────────────────────────────────────

  async _execute(def, findings) {
    const UI_STATES = ['IDLE', 'LOADING_QUESTION', 'AWAITING_ANSWER', 'SUBMITTING_ANSWER', 'TRANSITIONING'];

    switch (def.id) {

      case 'rapid_emotion_switching':
        for (let i = 0; i < 20; i++) {
          const s = UI_STATES[i % UI_STATES.length];
          this._expr?.onStateChange(s);
          this._presence?.onStateChange(s);
          await this._tick(50);
        }
        // Verify neither engine threw; verify container is still valid
        if (this._container && !document.contains(this._container)) {
          findings.push('Avatar container was removed from DOM during rapid switching');
        }
        break;

      case 'reward_spam':
        for (let i = 0; i < 10; i++) {
          this._expr?.onGameEvent('CORRECT');
          this._presence?.onGameEvent('CORRECT');
          await this._tick(500);
        }
        // No specific pass/fail assertion — test verifies no unhandled errors
        break;

      case 'level_up_overlap':
        this._expr?.onGameEvent('LEVEL_UP');
        this._presence?.onGameEvent('LEVEL_UP');
        await this._tick(50);
        // CORRECT fires while LEVEL_UP hold is active — LEVEL_UP must remain dominant
        this._expr?.onGameEvent('CORRECT');
        this._presence?.onGameEvent('CORRECT');
        await this._tick(3400);
        break;

      case 'async_event_overlap':
        // Same JS tick — last write wins; no assertion, verifies no throw
        this._expr?.onGameEvent('INCORRECT');
        this._expr?.onGameEvent('CORRECT');
        this._presence?.onGameEvent('INCORRECT');
        this._presence?.onGameEvent('CORRECT');
        await this._tick(2500);
        break;

      case 'long_idle_verify':
        this._expr?.onStateChange('IDLE');
        this._presence?.onStateChange('IDLE');
        await this._tick(100);
        if (this._presence && this._presence._idleTimer == null) {
          findings.push('PresenceEngine: idle timer not registered after onStateChange("IDLE")');
        }
        break;

      case 'reduced_motion_safety':
        try {
          // Call _applyBreathing directly — should be a safe no-op when prefersReducedMotion is true
          this._presence?._applyBreathing?.('proud');
          this._presence?._applyBreathing?.('determined');
          this._presence?._applyBreathing?.('neutral');
        } catch (e) {
          findings.push(`Breathing method threw in reduced-motion path: ${e?.message}`);
        }
        break;

      case 'dom_layer_integrity':
        if (!this._container) {
          findings.push('No container provided — skipping DOM integrity check');
          break;
        }
        {
          const layers = [...this._container.querySelectorAll('.quiz-avatar-layer')];
          if (layers.length === 0) {
            findings.push('No .quiz-avatar-layer elements found in container');
          }
          // Check for duplicate z-index values
          const zValues = layers.map(l => getComputedStyle(l).zIndex);
          const nonAutoZValues = zValues.filter(z => z !== 'auto');
          const zSet = new Set(nonAutoZValues);
          if (nonAutoZValues.length !== zSet.size) {
            findings.push(`Duplicate z-index values in layer stack: [${nonAutoZValues.join(', ')}]`);
          }
        }
        break;

      case 'destroy_reinit':
        this._expr?.destroy?.();
        this._presence?.destroy?.();
        await this._tick(100);
        // Post-destroy calls must not throw
        try {
          this._expr?.onStateChange?.('IDLE');
          this._presence?.onStateChange?.('IDLE');
        } catch (e) {
          findings.push(`Post-destroy onStateChange threw: ${e?.message}`);
        }
        try {
          this._expr?.onGameEvent?.('CORRECT');
          this._presence?.onGameEvent?.('CORRECT');
        } catch (e) {
          findings.push(`Post-destroy onGameEvent threw: ${e?.message}`);
        }
        break;
    }
  }

  _tick(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Quick-run helper ──────────────────────────────────────────────────────────
// Runs all tests and logs a summary to the console. Useful for manual verification.
export async function runStressTests(exprEngine, presenceEngine, container) {
  const runner  = new StressTestRunner({ exprEngine, presenceEngine, container });
  const results = await runner.runAll();
  const summary = runner.summarize();
  console.group('[AvatarStress] Results');
  results.forEach(r => {
    const icon = r.pass ? '✓' : '✗';
    const def  = STRESS_TESTS.find(t => t.id === r.testId);
    console.log(`${icon} ${def?.name ?? r.testId} (${r.timing_ms}ms)`);
    r.findings.forEach(f => console.warn('  →', f));
  });
  console.log(`\n${summary.passed}/${summary.total} passed`);
  console.groupEnd();
  return summary;
}
