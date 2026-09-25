// Stabel sound. Short synthesized tones, no files.
// Fail-soft: no AudioContext, a suspended context or a mute means silence, never an error.

const MUTE_KEY = "dsj_stabel_muted";

let buses = null;
let muted = readMuted();

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; }
  catch { return false; }
}

function getBuses() {
  if (buses) return buses;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    sfx.connect(master);
    master.connect(ctx.destination);
    master.gain.value = muted ? 0 : 0.7;
    sfx.gain.value = 0.85;
    buses = { ctx, master, sfx };
    return buses;
  } catch {
    return null;
  }
}

export function unlockAudio() {
  const b = getBuses();
  if (b && b.ctx.state === "suspended") b.ctx.resume().catch(() => {});
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next === true;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* fail-soft */ }
  const b = buses;
  if (b) b.master.gain.setTargetAtTime(muted ? 0 : 0.7, b.ctx.currentTime, 0.02);
}

function tone(freq, duration, type, gain, slideTo) {
  if (muted) return;
  const b = getBuses();
  if (!b || b.ctx.state !== "running") return;
  const now = b.ctx.currentTime;
  const osc = b.ctx.createOscillator();
  const g = b.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g);
  g.connect(b.sfx);
  osc.start(now);
  osc.stop(now + duration + 0.02);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

export function sfxPlace(plates) {
  const freq = 196 * Math.pow(2, (Math.max(0, plates) % 12) / 12);
  tone(freq, 0.07, "triangle", 0.18);
  tone(freq * 0.5, 0.09, "sine", 0.1);
}

export function sfxPerfect(combo) {
  const base = 330 * Math.pow(2, Math.min(Math.max(0, combo), 8) / 14);
  tone(base, 0.12, "sine", 0.2);
  tone(base * 1.5, 0.16, "triangle", 0.12);
}

export function sfxGrow() {
  tone(220, 0.18, "sine", 0.16, 440);
}

export function sfxOver() {
  tone(180, 0.35, "sawtooth", 0.12, 70);
  tone(90, 0.4, "sine", 0.16, 40);
}
