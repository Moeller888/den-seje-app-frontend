// Nål page. A needle sweeps around a dial; tap while it is inside the bright arc.
// Nål pays no coins and no XP; only the best result is kept, in this browser.
// The dial is drawn on a canvas in the theme's colours. Rules live in js/naal-logic.js.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import { TAU, norm, angDist, inArc, isPerfect, difficulty, flipsAfter, nextArcStart, PERFECT_FRACTION } from "./naal-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_naal_best";

const STEP = 1 / 60;
const OVER_MS = 650;
// Taps right after the start are ignored, so the start click is not read as a miss.
const START_GRACE = 0.28;

const $ = (id) => document.getElementById(id);

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

function readBest() {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

function writeBest(n) {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n <= readBest()) return false;
  try { localStorage.setItem(BEST_KEY, String(Math.floor(n))); } catch { /* fail-soft */ }
  return true;
}

function arcsLabel(n) {
  return n === 1 ? "1 bue" : n + " buer";
}

// Deterministic noise in [0, 1) — no Math.random.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  return {
    accent: css.getPropertyValue("--accent").trim() || "#4f8cff",
    bright: css.getPropertyValue("--text-bright").trim() || "#ffffff",
    dim: css.getPropertyValue("--text-dim").trim() || "#9aa0b4",
  };
}

const state = {
  phase: "intro",          // intro | play | falling | over
  angle: -1.2,
  dir: 1,
  speed: 1.35,
  arcStart: 0,
  arcWidth: 0.78,
  armed: false,
  hits: 0,
  combo: 0,
  perfects: 0,
  seed: 0,
  grace: 0,
  hitstop: 0,
  trauma: 0,
  flash: 0,
  particles: [],
  floaters: [],
  time: 0,
  acc: 0,
  last: 0,
  raf: 0,
  overTimer: 0,
  reduced: false,
  palette: { accent: "#4f8cff", bright: "#ffffff", dim: "#9aa0b4" },
  canvas: null,
  ctx: null,
  w: 1,
  h: 1,
};

function noise() {
  state.seed += 1;
  return hash(state.seed);
}

function setScreen(name) {
  const root = $("naal-root");
  if (root) root.dataset.screen = name;
  for (const id of ["naal-intro", "naal-play", "naal-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "naal-" + name;
  }
}

function paintBest() {
  const best = readBest();
  const text = best > 0 ? "Din bedste runde: " + arcsLabel(best) + "." : "";
  for (const id of ["naal-best", "naal-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintScore() {
  const score = $("naal-score");
  if (score) score.textContent = arcsLabel(state.hits);
  const combo = $("naal-combo");
  if (combo) combo.textContent = state.combo >= 2 ? "Perfekt × " + state.combo : "";
}

function paintMute() {
  const btn = $("naal-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────

function layout() {
  return { cx: state.w / 2, cy: state.h * 0.5, radius: Math.min(state.w, state.h) * 0.34 };
}

function tip() {
  const { cx, cy, radius } = layout();
  return { x: cx + Math.cos(state.angle) * radius, y: cy + Math.sin(state.angle) * radius };
}

function resize() {
  const canvas = state.canvas;
  if (!canvas || !state.ctx) return;
  const parent = canvas.parentElement || canvas;
  const rect = parent.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.w = Math.max(1, Math.floor(rect.width));
  state.h = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(state.w * dpr);
  canvas.height = Math.floor(state.h * dpr);
  canvas.style.width = state.w + "px";
  canvas.style.height = state.h + "px";
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  const ctx = state.ctx;
  if (!ctx) return;
  const { w, h } = state;
  const { cx, cy, radius } = layout();
  const pal = state.palette;
  ctx.clearRect(0, 0, w, h);

  let ox = 0;
  let oy = 0;
  if (!state.reduced && state.trauma > 0) {
    const mag = state.trauma * state.trauma;
    ox = (hash(state.time * 40) * 2 - 1) * 10 * mag;
    oy = (hash(state.time * 40 + 3) * 2 - 1) * 10 * mag;
  }

  ctx.save();
  ctx.translate(cx + ox, cy + oy);

  // ticks and ring
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = pal.dim;
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (radius - 10), Math.sin(a) * (radius - 10));
    ctx.lineTo(Math.cos(a) * (radius + 8), Math.sin(a) * (radius + 8));
    ctx.stroke();
  }
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // the arc: brighter as the needle closes in
  const mid = state.arcStart + state.arcWidth / 2;
  const near = angDist(state.angle, mid);
  const heat = state.phase === "play" ? Math.max(0, 1 - near / 0.9) : 0.35;
  ctx.beginPath();
  ctx.arc(0, 0, radius, state.arcStart, state.arcStart + state.arcWidth);
  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = 0.55 + heat * 0.45;
  ctx.lineWidth = 10;
  ctx.lineCap = "butt";
  ctx.stroke();

  // the perfect centre
  const inner = state.arcWidth * PERFECT_FRACTION;
  ctx.beginPath();
  ctx.arc(0, 0, radius, mid - inner, mid + inner);
  ctx.strokeStyle = pal.bright;
  ctx.globalAlpha = 0.7 + state.flash * 0.3;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // the needle
  const a = state.angle;
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
  ctx.lineTo(Math.cos(a) * (radius + 16), Math.sin(a) * (radius + 16));
  ctx.strokeStyle = pal.bright;
  ctx.globalAlpha = state.phase === "falling" || state.phase === "over" ? 0.45 : 1;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, TAU);
  ctx.fillStyle = pal.accent;
  ctx.fill();

  if (state.flash > 0 && !state.reduced) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.strokeStyle = pal.bright;
    ctx.globalAlpha = state.flash * 0.35;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = pal.bright;
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 14px Arial, sans-serif";
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── simulation ─────────────────────────────────────────────────────────────────────────────

function burst(origin, count, speed) {
  const n = state.reduced ? Math.ceil(count * 0.35) : count;
  for (let i = 0; i < n; i++) {
    const a = noise() * TAU;
    const sp = speed * (0.35 + noise() * 0.85);
    const life = 0.35 + noise() * 0.35;
    state.particles.push({
      x: origin.x, y: origin.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: 1.2 + noise() * 2.2,
    });
  }
}

function placeArc() {
  const lead = 1.05 + noise() * 1.15;
  state.arcStart = nextArcStart(state.angle, state.dir, lead, state.arcWidth);
  state.armed = false;
}

function tap() {
  if (state.phase !== "play") return;
  unlockAudio();
  if (state.grace > 0) return;
  if (inArc(state.angle, state.arcStart, state.arcWidth)) hit();
  else fail();
}

function hit() {
  const perfect = isPerfect(state.angle, state.arcStart, state.arcWidth);
  state.hits += 1;
  const where = tip();
  if (perfect) {
    state.perfects += 1;
    state.combo += 1;
    sfxPerfect(state.combo);
    state.hitstop = state.reduced ? 0 : 0.045;
    state.trauma = Math.min(1, state.trauma + 0.28);
    state.floaters.push({ text: state.combo >= 2 ? "× " + state.combo : "Perfekt", x: where.x, y: where.y - 16, life: 0.7, max: 0.7 });
  } else {
    state.combo = 0;
    sfxPlace(state.hits);
    state.hitstop = state.reduced ? 0 : 0.02;
    state.trauma = Math.min(1, state.trauma + 0.12);
  }
  state.flash = 1;
  burst(where, perfect ? 18 : 10, perfect ? 220 : 140);
  const next = difficulty(state.hits);
  state.arcWidth = next.width;
  state.speed = next.speed;
  if (flipsAfter(state.hits)) state.dir *= -1;
  placeArc();
  paintScore();
}

function fail() {
  if (state.phase !== "play") return;
  state.phase = "falling";
  state.combo = 0;
  sfxOver();
  state.trauma = state.reduced ? 0 : 0.85;
  state.flash = 1;
  burst(tip(), 26, 90);
  paintScore();
  const record = writeBest(state.hits);
  paintBest();
  clearTimeout(state.overTimer);
  state.overTimer = setTimeout(() => showOver(record), state.reduced ? 0 : OVER_MS);
}

function showOver(record) {
  state.overTimer = 0;
  if (state.phase !== "falling") return;
  state.phase = "over";
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  const line = $("naal-over-line");
  if (line) {
    const n = state.hits;
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt stik." : state.perfects + " perfekte stik.")
      : "";
    const news = record ? " Ny rekord!" : "";
    line.textContent = n === 0
      ? "Nålen slap forbi den første bue. Prøv igen."
      : "Du ramte " + arcsLabel(n) + "." + perfect + news;
  }
  setScreen("over");
  $("naal-again")?.focus();
}

// Moves the needle in small slices, so a fast needle can never jump over an arc unseen.
function sweep(dAngle) {
  const slices = Math.max(1, Math.ceil(Math.abs(dAngle) / 0.03));
  const slice = dAngle / slices;
  for (let i = 0; i < slices; i++) {
    const prev = state.angle;
    state.angle = norm(state.angle + slice);
    if (state.phase !== "play" || state.grace > 0) continue;
    const was = inArc(prev, state.arcStart, state.arcWidth);
    const now = inArc(state.angle, state.arcStart, state.arcWidth);
    if (!was && now) state.armed = true;
    if (was && !now) {
      if (state.armed) { fail(); return; }
      state.armed = false;
    }
  }
}

function step(dt) {
  state.time += dt;
  if (state.grace > 0) state.grace = Math.max(0, state.grace - dt);
  state.flash = Math.max(0, state.flash - dt * 3.2);
  state.trauma *= Math.exp(-2.8 * dt);
  for (const p of state.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) { f.y -= 28 * dt; f.life -= dt; }
  state.floaters = state.floaters.filter((f) => f.life > 0);
  if (state.hitstop > 0) { state.hitstop -= dt; return; }
  const rate = state.phase === "play" ? state.speed : 0.15;
  sweep(rate * state.dir * dt);
}

function frame(now) {
  if (state.phase !== "play" && state.phase !== "falling") { state.raf = 0; return; }
  const raw = state.last ? Math.min(0.1, (now - state.last) / 1000) : 0;
  state.last = now;
  state.acc += raw;
  let steps = 0;
  while (state.acc >= STEP && steps < 6) {
    step(STEP);
    state.acc -= STEP;
    steps += 1;
  }
  draw();
  state.raf = requestAnimationFrame(frame);
}

function startRound() {
  stopReadAloud();
  unlockAudio();
  clearTimeout(state.overTimer);
  state.overTimer = 0;
  cancelAnimationFrame(state.raf);
  state.reduced = prefersReducedMotion();
  state.palette = readPalette();
  state.angle = -Math.PI / 2;
  state.dir = 1;
  const start = difficulty(0);
  state.arcWidth = start.width;
  state.speed = start.speed;
  state.hits = 0;
  state.combo = 0;
  state.perfects = 0;
  state.seed = 0;
  state.grace = START_GRACE;
  state.hitstop = 0;
  state.trauma = 0;
  state.flash = 0;
  state.particles = [];
  state.floaters = [];
  state.time = 0;
  state.acc = 0;
  state.last = 0;
  state.arcStart = nextArcStart(state.angle, state.dir, 1.35 + noise() * 0.7, state.arcWidth);
  state.armed = false;
  state.phase = "play";
  setScreen("play");
  resize();
  paintScore();
  state.raf = requestAnimationFrame(frame);
  $("naal-drop")?.focus();
}

async function main() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.replace("login.html");
    return;
  }
  loadTheme().catch(() => {});
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) window.location.replace("login.html");
  });

  const canvas = $("naal-canvas");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !ctx) {
    const note = $("naal-best");
    if (note) note.textContent = "Spillet kan ikke tegnes i denne browser.";
    const start = $("naal-start");
    if (start) start.disabled = true;
    return;
  }
  state.canvas = canvas;
  state.ctx = ctx;
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);

  const lead = $("naal-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("naal-start")?.addEventListener("click", startRound);
  $("naal-again")?.addEventListener("click", startRound);
  $("naal-drop")?.addEventListener("click", tap);
  $("naal-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
  $("naal-arena")?.addEventListener("pointerdown", (event) => {
    if (event.target && event.target.closest && event.target.closest("button")) return;
    tap();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (state.phase !== "play") return;
    if (event.target && event.target.closest && event.target.closest("button, a")) return;
    event.preventDefault();
    if (event.repeat) return;
    tap();
  });
}

main();
