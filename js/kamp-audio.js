// Videnkamp audio — Web Audio only, no extra files.
// Unlocked on the first user gesture (Træd ind). Fail-soft everywhere.

let ctx = null;
let master = null;
let muted = false;

function now() {
  return ctx ? ctx.currentTime : 0;
}

export function unlockKampAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.2;
      master.connect(ctx.destination);
    }
  } catch {
    ctx = null;
    master = null;
  }
}

export function setKampMuted(value) {
  muted = !!value;
  try {
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.2, ctx.currentTime, 0.04);
  } catch { /* fail-soft */ }
}

export function isKampMuted() {
  return muted;
}

function tone(freq, dur, type, gain, at) {
  if (!ctx || !master || muted) return;
  try {
    const t = at ?? now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  } catch { /* fail-soft */ }
}

export function playKamp(name, combo) {
  unlockKampAudio();
  if (!ctx || !master || muted) return;
  const t = now();
  const chain = Number(combo);
  const extra = Number.isFinite(chain) && chain >= 3;

  if (name === "start") {
    tone(262, 0.14, "sine", 0.22, t);
    tone(330, 0.16, "sine", 0.2, t + 0.11);
    tone(392, 0.28, "triangle", 0.22, t + 0.22);
    return;
  }
  if (name === "hit") {
    tone(392, 0.11, "triangle", 0.32, t);
    tone(784, 0.16, "sine", 0.2, t + 0.03);
    if (extra) tone(1176, 0.2, "sine", 0.14, t + 0.07);
    return;
  }
  if (name === "miss") {
    tone(196, 0.2, "sine", 0.18, t);
    tone(147, 0.26, "triangle", 0.12, t + 0.04);
    return;
  }
  if (name === "open") {
    tone(392, 0.18, "sine", 0.22, t);
    tone(494, 0.22, "sine", 0.2, t + 0.1);
    tone(587, 0.36, "triangle", 0.22, t + 0.2);
    return;
  }
  if (name === "end") {
    tone(330, 0.28, "sine", 0.16, t);
    tone(392, 0.36, "sine", 0.12, t + 0.08);
  }
}
