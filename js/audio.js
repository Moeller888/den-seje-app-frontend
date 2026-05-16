// ── Audio hook ────────────────────────────────────────────────────────────────
// Central registry for UI sounds. All entries are null until audio assets are
// placed in /assets/audio/ and the path is set here.
// playSound() is always safe to call — missing assets are graceful no-ops.

const SOUND_MAP = {
  equip: null,  // activate: "/assets/audio/equip.mp3"
  buy:   null,  // activate: "/assets/audio/buy.mp3"
  error: null,  // activate: "/assets/audio/error.mp3"
};

export function playSound(name) {
  const src = SOUND_MAP[name] ?? null;
  if (!src) return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {}
}
