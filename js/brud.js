// Brud page. Breakout: keep the ball up with the paddle and break the bricks.
// Brud pays no coins and no XP; only the best result is kept, in this browser.
// The game runs in a fixed world (js/brud-logic.js) that is scaled onto the canvas in the
// theme's colours. Steer by dragging or moving over the game, or with the arrow keys / A and D.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import {
  WORLD_W, WORLD_H, ROWS, BALL_R, PAD_W, PAD_Y, PAD_SPEED,
  layoutBricks, clampPaddle, launchVelocity, nextLevelSpeed, stepBall,
} from "./brud-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxGrow, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_brud_best";

const STEP = 1 / 60;
const OVER_MS = 650;

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

function bricksLabel(n) {
  return n === 1 ? "1 klods" : n + " klodser";
}

// Deterministic noise in [0, 1) — no Math.random.
function hash(n) {
  const s = Math.sin(n * 91.7 + 13.2) * 43758.5453;
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
  bricks: [],
  ball: { x: WORLD_W / 2, y: PAD_Y - 12, vx: 0, vy: 0, clean: true },
  launched: false,
  padX: WORLD_W / 2,
  pointerX: null,
  keys: new Set(),
  speed: 1,
  score: 0,
  walls: 0,
  combo: 0,
  perfects: 0,
  seed: 0,
  trauma: 0,
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
  const root = $("brud-root");
  if (root) root.dataset.screen = name;
  for (const id of ["brud-intro", "brud-play", "brud-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "brud-" + name;
  }
}

function paintBest() {
  const best = readBest();
  const text = best > 0 ? "Din bedste runde: " + bricksLabel(best) + "." : "";
  for (const id of ["brud-best", "brud-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintScore() {
  const score = $("brud-score");
  if (score) score.textContent = bricksLabel(state.score);
  const combo = $("brud-combo");
  if (combo) combo.textContent = state.combo >= 2 ? "Perfekt × " + state.combo : "";
}

function paintMute() {
  const btn = $("brud-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

function paintLaunch() {
  const btn = $("brud-drop");
  if (btn) btn.disabled = state.phase !== "play" || state.launched;
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────

// World → canvas: uniform scale, centred.
function view() {
  const scale = Math.min(state.w / WORLD_W, state.h / WORLD_H);
  return { scale, ox: (state.w - WORLD_W * scale) / 2, oy: (state.h - WORLD_H * scale) / 2 };
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
  const pal = state.palette;
  ctx.clearRect(0, 0, state.w, state.h);
  const { scale, ox, oy } = view();

  let sx = 0;
  let sy = 0;
  if (!state.reduced && state.trauma > 0) {
    const mag = state.trauma * state.trauma;
    sx = (hash(state.time * 30) * 2 - 1) * 8 * mag;
    sy = (hash(state.time * 20) * 2 - 1) * 6 * mag;
  }
  ctx.save();
  ctx.translate(ox + sx, oy + sy);
  ctx.scale(scale, scale);

  // the playfield's edge
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = pal.dim;
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

  for (const b of state.bricks) {
    if (!b.alive) continue;
    ctx.globalAlpha = 1 - (b.row / ROWS) * 0.45;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.bright;
  ctx.fillRect(state.padX - PAD_W / 2, PAD_Y, PAD_W, 8);

  ctx.globalAlpha = state.phase === "falling" || state.phase === "over" ? 0.45 : 1;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillRect(p.x, p.y, 3, 3);
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

function stickBall() {
  state.ball.x = state.padX;
  state.ball.y = PAD_Y - 12;
}

function launch() {
  if (state.phase !== "play" || state.launched) return;
  unlockAudio();
  const v = launchVelocity(state.speed, noise());
  state.ball.vx = v.vx;
  state.ball.vy = v.vy;
  state.ball.clean = true;
  state.launched = true;
  paintLaunch();
}

function award(perfect, brick) {
  state.score += 1;
  const cx = brick.x + brick.w / 2;
  const cy = brick.y + brick.h / 2;
  if (perfect) {
    state.perfects += 1;
    state.combo += 1;
    sfxPerfect(state.combo);
    state.floaters.push({ text: state.combo >= 2 ? "× " + state.combo : "Perfekt", x: cx, y: cy - 14, life: 0.7, max: 0.7 });
  } else {
    state.combo = 0;
    sfxPlace(state.score);
  }
  const n = state.reduced ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const a = noise() * Math.PI * 2;
    const life = 0.25 + noise() * 0.25;
    state.particles.push({ x: cx, y: cy, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life, max: life });
  }
  if (state.bricks.every((b) => !b.alive)) {
    state.walls += 1;
    state.speed = nextLevelSpeed(state.speed);
    state.bricks = layoutBricks();
    state.ball.vx *= 1.05;
    state.ball.vy *= 1.05;
    sfxGrow();
    state.floaters.push({ text: "Ny mur!", x: WORLD_W / 2, y: WORLD_H * 0.5, life: 1, max: 1 });
  }
  paintScore();
}

function fail() {
  if (state.phase !== "play") return;
  state.phase = "falling";
  state.combo = 0;
  sfxOver();
  state.trauma = state.reduced ? 0 : 0.7;
  paintScore();
  paintLaunch();
  const record = writeBest(state.score);
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
  const line = $("brud-over-line");
  if (line) {
    const n = state.score;
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt skud." : state.perfects + " perfekte skud.")
      : "";
    const walls = state.walls > 0 ? " og ryddede " + (state.walls === 1 ? "1 mur" : state.walls + " mure") : "";
    const news = record ? " Ny rekord!" : "";
    line.textContent = n === 0
      ? "Bolden slap forbi pladen. Prøv igen."
      : "Du knuste " + bricksLabel(n) + walls + "." + perfect + news;
  }
  setScreen("over");
  $("brud-again")?.focus();
}

function steer(dt) {
  let keyed = false;
  if (state.keys.has("left")) { state.padX -= PAD_SPEED * dt; keyed = true; }
  if (state.keys.has("right")) { state.padX += PAD_SPEED * dt; keyed = true; }
  if (keyed) state.pointerX = null;
  else if (state.pointerX !== null) state.padX = state.pointerX;
  state.padX = clampPaddle(state.padX);
}

function step(dt) {
  state.time += dt;
  state.trauma *= Math.exp(-3 * dt);
  for (const p of state.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) { f.y -= 28 * dt; f.life -= dt; }
  state.floaters = state.floaters.filter((f) => f.life > 0);
  if (state.phase !== "play") return;
  steer(dt);
  if (!state.launched) { stickBall(); return; }
  const result = stepBall(state.ball, state.padX, state.bricks, dt);
  if (result.paddle) sfxPlace(0);
  if (result.brick >= 0) award(result.perfect, state.bricks[result.brick]);
  if (result.lost) fail();
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

function pointerToWorld(event) {
  const canvas = state.canvas;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const { scale, ox } = view();
  if (!(scale > 0)) return null;
  return (event.clientX - rect.left - ox) / scale;
}

function startRound() {
  stopReadAloud();
  unlockAudio();
  clearTimeout(state.overTimer);
  state.overTimer = 0;
  cancelAnimationFrame(state.raf);
  state.reduced = prefersReducedMotion();
  state.palette = readPalette();
  state.bricks = layoutBricks();
  state.padX = WORLD_W / 2;
  state.pointerX = null;
  state.keys.clear();
  state.launched = false;
  state.ball = { x: WORLD_W / 2, y: PAD_Y - 12, vx: 0, vy: 0, clean: true };
  state.speed = 1;
  state.score = 0;
  state.walls = 0;
  state.combo = 0;
  state.perfects = 0;
  state.seed = 0;
  state.trauma = 0;
  state.particles = [];
  state.floaters = [];
  state.time = 0;
  state.acc = 0;
  state.last = 0;
  state.phase = "play";
  setScreen("play");
  resize();
  paintScore();
  paintLaunch();
  state.raf = requestAnimationFrame(frame);
  $("brud-drop")?.focus();
}

const KEY_DIR = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };

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

  const canvas = $("brud-canvas");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !ctx) {
    const note = $("brud-best");
    if (note) note.textContent = "Spillet kan ikke tegnes i denne browser.";
    const start = $("brud-start");
    if (start) start.disabled = true;
    return;
  }
  state.canvas = canvas;
  state.ctx = ctx;
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);

  const lead = $("brud-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("brud-start")?.addEventListener("click", startRound);
  $("brud-again")?.addEventListener("click", startRound);
  $("brud-drop")?.addEventListener("click", launch);
  $("brud-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
  const arena = $("brud-arena");
  if (arena) {
    arena.addEventListener("pointerdown", (event) => {
      if (event.target && event.target.closest && event.target.closest("button")) return;
      const x = pointerToWorld(event);
      if (x !== null && Number.isFinite(x)) state.pointerX = x;
      launch();
    });
    arena.addEventListener("pointermove", (event) => {
      if (state.phase !== "play") return;
      const x = pointerToWorld(event);
      if (x !== null && Number.isFinite(x)) state.pointerX = x;
    });
  }
  window.addEventListener("keydown", (event) => {
    if (state.phase !== "play") return;
    const dir = KEY_DIR[event.key];
    if (dir) {
      event.preventDefault();
      state.keys.add(dir);
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.target && event.target.closest && event.target.closest("button, a")) return;
    event.preventDefault();
    if (event.repeat) return;
    launch();
  });
  window.addEventListener("keyup", (event) => {
    const dir = KEY_DIR[event.key];
    if (dir) state.keys.delete(dir);
  });
  window.addEventListener("blur", () => state.keys.clear());
}

main();
