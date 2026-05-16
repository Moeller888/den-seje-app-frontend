// ── Audio hook ────────────────────────────────────────────────────────────────
// Central registry for UI sounds. All entries are null until audio assets are
// placed in /assets/audio/ and the path is set here.
// playSound() is always safe to call — missing assets are graceful no-ops.
//
// Rate limiting: minimum 100ms between plays of the same sound.
// Prevents audio stacking on rapid equip/buy taps without affecting single-tap feel.
// No timers, no cleanup — _lastPlayed is bounded by SOUND_MAP key count.

const SOUND_MAP = {
  equip: null,  // activate: "/assets/audio/equip.mp3"
  buy:   null,  // activate: "/assets/audio/buy.mp3"
  error: null,  // activate: "/assets/audio/error.mp3"
};

const MIN_INTERVAL_MS = 100;
const _lastPlayed = {};

export function playSound(name) {
  const src = SOUND_MAP[name] ?? null;
  if (!src) return;

  const now = Date.now();
  if (now - (_lastPlayed[name] ?? 0) < MIN_INTERVAL_MS) return;
  _lastPlayed[name] = now;

  try {
    const audio = new Audio(src);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {}
}
