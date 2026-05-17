// ── Audio hook ────────────────────────────────────────────────────────────────
// Central registry for UI sounds.
// playSound() is always safe to call — unknown name = graceful no-op.
//
// Strategy: eager singleton per sound name.
// All HTMLAudioElement instances are created and preloaded at module init,
// so play() is never called on an unloaded element.
//
// Why this matters: with lazy init, play() was called on an element in
// readyState=0 (HAVE_NOTHING). The browser deferred the play until the file
// loaded — but that deferred callback fires outside any user-gesture context.
// On the very first page interaction Chrome silences it (autoplay policy).
// Subsequent calls hit a loaded element and play immediately. This is why
// the first equip click was always silent and the second always worked.
//
// Eager preload eliminates the deferral: files start fetching on page load,
// play() is called on a ready element, and no activation timing is consumed.
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

// Eagerly create and preload all elements at module init.
// Files begin fetching immediately; play() will never wait on a cold load.
for (const [name, src] of Object.entries(SOUND_MAP)) {
  const el = new Audio(src);
  el.preload  = "auto";
  el.volume   = _volume;
  _cache[name] = el;
}

export function playSound(name) {
  const el = _cache[name] ?? null;
  if (!el) return;

  const now = Date.now();
  if (now - (_lastPlayed[name] ?? 0) < MIN_INTERVAL_MS) return;
  _lastPlayed[name] = now;

  try {
    el.currentTime = 0;
    el.play().catch(() => {});
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
