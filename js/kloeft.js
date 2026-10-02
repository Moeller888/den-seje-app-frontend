// Kløft page. A shard falls down a shaft; tap when it is level with the cleft in the wall.
// Kløft pays no coins and no XP; only the best result is kept, in this browser.
// The shaft is drawn on a canvas in the theme's colours. Rules live in js/kloeft-logic.js.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import { START_Y, FLOOR, PERFECT_FRACTION, difficulty, cleftCenter, inCleft, isPerfect } from "./kloeft-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_kloeft_best";

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

function shardsLabel(n) {
  return n === 1 ? "1 skår" : n + " skår";
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
  shardY: START_Y,
  speed: 0.46,
  cleft: 0.26,
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

function center() {
  return cleftCenter(state.time, state.hits, state.cleft);
}

function setScreen(name) {
  const root = $("kloeft-root");
  if (root) root.dataset.screen = name;
  for (const id of ["kloeft-intro", "kloeft-play", "kloeft-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "kloeft-" + name;
  }
}

function paintBest() {
  const best = readBest();
  const text = best > 0 ? "Din bedste runde: " + shardsLabel(best) + "." : "";
  for (const id of ["kloeft-best", "kloeft-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintScore() {
  const score = $("kloeft-score");
  if (score) score.textContent = shardsLabel(state.hits);
  const combo = $("kloeft-combo");
  if (combo) combo.textContent = state.combo >= 2 ? "Perfekt × " + state.combo : "";
}

function paintMute() {
  const btn = $("kloeft-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────

function layout() {
  const shaftW = Math.min(state.w * 0.5, state.h * 0.4, 240);
  const top = state.h * 0.1;
  const height = state.h * 0.8;
  const left = (state.w - shaftW) / 2;
  const wall = Math.max(12, shaftW * 0.14);
  return { left, top, shaftW, height, wall };
}

function shardPoint() {
  const { left, top, shaftW, height } = layout();
  return { x: left + shaftW / 2, y: top + state.shardY * height };
}

function gapPoint() {
  const { left, top, shaftW, height } = layout();
  return { x: left + shaftW, y: top + center() * height };
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
  const pal = state.palette;
  ctx.clearRect(0, 0, w, h);

  let ox = 0;
  let oy = 0;
  if (!state.reduced && state.trauma > 0) {
    const mag = state.trauma * state.trauma;
    ox = (hash(state.time * 40) * 2 - 1) * 8 * mag;
    oy = (hash(state.time * 37) * 2 - 1) * 8 * mag;
  }
  ctx.save();
  ctx.translate(ox, oy);

  const { left, top, shaftW, height, wall } = layout();
  const mid = center();
  const gapTop = top + (mid - state.cleft / 2) * height;
  const gapBot = top + (mid + state.cleft / 2) * height;
  const bottom = top + height;
  const near = Math.abs(state.shardY - mid) / Math.max(0.08, state.cleft);
  const heat = state.phase === "play" ? Math.max(0, 1 - near) : 0.25;

  // walls; the right one is broken by the cleft
  ctx.fillStyle = pal.dim;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(left, top, wall, height);
  if (gapTop > top) ctx.fillRect(left + shaftW - wall, top, wall, gapTop - top);
  if (bottom > gapBot) ctx.fillRect(left + shaftW - wall, gapBot, wall, bottom - gapBot);
  ctx.globalAlpha = 0.5;
  ctx.fillRect(left, bottom - 2, shaftW, 2);

  // cleft edges, brighter as the shard closes in
  ctx.globalAlpha = 0.5 + heat * 0.5;
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left + shaftW - wall, gapTop);
  ctx.lineTo(left + shaftW + 6, gapTop);
  ctx.moveTo(left + shaftW - wall, gapBot);
  ctx.lineTo(left + shaftW + 6, gapBot);
  ctx.stroke();

  // the perfect band in the middle of the cleft
  const band = (gapBot - gapTop) * PERFECT_FRACTION;
  const bandMid = (gapTop + gapBot) / 2;
  ctx.globalAlpha = 0.35 + state.flash * 0.45;
  ctx.fillStyle = pal.accent;
  ctx.fillRect(left + shaftW - wall, bandMid - band / 2, wall, band);

  // guide line from the cleft across the shaft
  ctx.globalAlpha = 0.18 + heat * 0.25;
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(left + wall, bandMid);
  ctx.lineTo(left + shaftW - wall, bandMid);
  ctx.stroke();
  ctx.setLineDash([]);

  // the shard
  const inner = shaftW - wall * 2;
  const shardH = Math.max(14, height * 0.04);
  const sx = left + wall + inner * 0.18;
  const sy = top + state.shardY * height - shardH / 2;
  ctx.globalAlpha = state.phase === "falling" || state.phase === "over" ? 0.45 : 1;
  ctx.fillStyle = pal.bright;
  ctx.fillRect(sx, sy, inner * 0.64, shardH);
  ctx.globalAlpha = 1;

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
    const a = noise() * Math.PI * 2;
    const sp = speed * (0.35 + noise() * 0.8);
    const life = 0.28 + noise() * 0.32;
    state.particles.push({
      x: origin.x, y: origin.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: 1.2 + noise() * 2.1,
    });
  }
}

function tap() {
  if (state.phase !== "play") return;
  unlockAudio();
  if (state.grace > 0 || state.hitstop > 0) return;
  const mid = center();
  if (inCleft(state.shardY, mid, state.cleft)) hit(mid);
  else fail();
}

function hit(mid) {
  const perfect = isPerfect(state.shardY, mid, state.cleft);
  state.hits += 1;
  const where = gapPoint();
  if (perfect) {
    state.perfects += 1;
    state.combo += 1;
    sfxPerfect(state.combo);
    state.hitstop = state.reduced ? 0 : 0.05;
    state.trauma = Math.min(1, state.trauma + 0.25);
    state.floaters.push({ text: state.combo >= 2 ? "× " + state.combo : "Perfekt", x: where.x - 40, y: where.y - 18, life: 0.7, max: 0.7 });
  } else {
    state.combo = 0;
    sfxPlace(state.hits);
    state.hitstop = state.reduced ? 0 : 0.02;
    state.trauma = Math.min(1, state.trauma + 0.1);
  }
  state.flash = 1;
  burst(where, perfect ? 16 : 9, perfect ? 240 : 150);
  const next = difficulty(state.hits);
  state.cleft = next.cleft;
  state.speed = next.speed;
  state.shardY = START_Y;
  paintScore();
}

function fail() {
  if (state.phase !== "play") return;
  state.phase = "falling";
  state.combo = 0;
  sfxOver();
  state.trauma = state.reduced ? 0 : 0.8;
  state.flash = 1;
  burst(shardPoint(), 24, 160);
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
  const line = $("kloeft-over-line");
  if (line) {
    const n = state.hits;
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt." : state.perfects + " perfekte.")
      : "";
    const news = record ? " Ny rekord!" : "";
    line.textContent = n === 0
      ? "Skåret ramte ikke kløften. Prøv igen."
      : "Du fik " + shardsLabel(n) + " ind i kløften." + perfect + news;
  }
  setScreen("over");
  $("kloeft-again")?.focus();
}

function step(dt) {
  state.time += dt;
  if (state.grace > 0) state.grace = Math.max(0, state.grace - dt);
  state.flash = Math.max(0, state.flash - dt * 3.2);
  state.trauma *= Math.exp(-2.8 * dt);
  for (const p of state.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) { f.y -= 28 * dt; f.life -= dt; }
  state.floaters = state.floaters.filter((f) => f.life > 0);
  if (state.phase !== "play") return;
  if (state.hitstop > 0) { state.hitstop -= dt; return; }
  state.shardY += state.speed * dt;
  if (state.shardY > FLOOR && state.grace === 0) fail();
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
  const start = difficulty(0);
  state.cleft = start.cleft;
  state.speed = start.speed;
  state.shardY = START_Y;
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
  state.phase = "play";
  setScreen("play");
  resize();
  paintScore();
  state.raf = requestAnimationFrame(frame);
  $("kloeft-drop")?.focus();
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

  const canvas = $("kloeft-canvas");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !ctx) {
    const note = $("kloeft-best");
    if (note) note.textContent = "Spillet kan ikke tegnes i denne browser.";
    const start = $("kloeft-start");
    if (start) start.disabled = true;
    return;
  }
  state.canvas = canvas;
  state.ctx = ctx;
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);

  const lead = $("kloeft-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("kloeft-start")?.addEventListener("click", startRound);
  $("kloeft-again")?.addEventListener("click", startRound);
  $("kloeft-drop")?.addEventListener("click", tap);
  $("kloeft-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
  $("kloeft-arena")?.addEventListener("pointerdown", (event) => {
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
