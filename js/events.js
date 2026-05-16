// ── In-page event bus ─────────────────────────────────────────────────────────
// Lightweight pub/sub for game events within a single page session.
// Fire-and-forget — no persistence, no cross-page state.
//
// Current emitters:
//   "item:purchased"  { itemId, rarity, slotType }
//   "item:equipped"   { itemId, slot, rarity }
//   "item:unequipped" { slot }
//
// Future subscribers: achievements, daily quests, analytics, streak tracking.

const _subs = {};

export function emit(event, payload = {}) {
  const fns = _subs[event] ?? [];
  for (const fn of fns) {
    try { fn(payload); } catch {}
  }
}

// Returns an unsubscribe function.
export function on(event, fn) {
  if (!_subs[event]) _subs[event] = [];
  _subs[event].push(fn);
  return () => { _subs[event] = _subs[event].filter(s => s !== fn); };
}
