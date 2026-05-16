// ── Audio hook ────────────────────────────────────────────────────────────────
// Central registry for UI sounds.
// playSound() is always safe to call — null src = graceful no-op.
//
// Strategy: lazy singleton per sound name.
// First call creates one HTMLAudioElement and caches it in _cache.
// Subsequent calls reset currentTime and replay the cached element —
// no re-decode, no GC churn, instant response.
//
// Rate limiting: 100ms minimum between plays of the same sound.
// Prevents stacking on rapid taps. No timers, no cleanup.
// _cache and _lastPlayed are bounded by SOUND_MAP key count.

const SOUND_MAP = {
  equip: "/assets/audio/equip.wav",
  buy:   "/assets/audio/buy.wav",
  error: "/assets/audio/error.wav",
};

const MIN_INTERVAL_MS = 100;
const _lastPlayed = {};
const _cache      = {};
let   _volume     = 0.30;
let   _muted      = false;

export function playSound(name) {
  const src = SOUND_MAP[name] ?? null;
  if (!src) return;

  const now = Date.now();
  if (now - (_lastPlayed[name] ?? 0) < MIN_INTERVAL_MS) return;
  _lastPlayed[name] = now;

  try {
    if (!_cache[name]) {
      const el  = new Audio(src);
      el.volume = _muted ? 0 : _volume;
      _cache[name] = el;
    }
    _cache[name].currentTime = 0;
    _cache[name].play().catch(() => {});
  } catch {}
}

export function setVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  for (const name of Object.keys(_cache)) {
    _cache[name].volume = _muted ? 0 : _volume;
  }
}

export function setMuted(b) {
  _muted = !!b;
  for (const name of Object.keys(_cache)) {
    _cache[name].volume = _muted ? 0 : _volume;
  }
}
