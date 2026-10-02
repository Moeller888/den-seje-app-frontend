// Hop page. A figure runs on its own; tap to jump over gaps and blocks.
// Hop pays no coins and no XP; only the best result is kept, in this browser.
// The course is drawn on a canvas in the theme's colours. Rules and physics live in js/hop-logic.js.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import {
  PW, PH, JUMP_SPEED, hash, runSpeed, segment, isEarlyJump, nextHazard, canJump, stepBody,
} from "./hop-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_hop_best";
const ROUNDS_KEY = "dsj_hop_rounds";

const STEP = 1 / 60;
const OVER_MS = 650;
// How far ahead of the figure the course is built, and how far behind it is dropped.
const AHEAD = 16;
const BEHIND = 8;

const $ = (id) => document.getElementById(id);

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

function readCount(key) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

function writeCount(key, n) {
  if (!Number.isFinite(n) || n < 0) return;
  try { localStorage.setItem(key, String(Math.floor(n))); } catch { /* fail-soft */ }
}

function writeBest(n) {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n <= readCount(BEST_KEY)) return false;
  writeCount(BEST_KEY, n);
  return true;
}

function hopsLabel(n) {
  return n === 1 ? "1 forhindring" : n + " forhindringer";
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
  body: { x: 0, y: 0, vy: 0, grounded: true, jumpUsed: false, leftGround: -1 },
  run: 5.1,
  platforms: [],
  gaps: [],
  blocks: [],
  cursor: 0,
  course: 0,
  score: 0,
  combo: 0,
  perfects: 0,
  queuedPerfect: false,
  pn: 0,
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
  state.pn += 1;
  return hash(state.pn * 3.7 + 11);
}

function setScreen(name) {
  const root = $("hop-root");
  if (root) root.dataset.screen = name;
  for (const id of ["hop-intro", "hop-play", "hop-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "hop-" + name;
  }
}

function paintBest() {
  const best = readCount(BEST_KEY);
  const text = best > 0 ? "Din bedste runde: " + hopsLabel(best) + "." : "";
  for (const id of ["hop-best", "hop-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintScore() {
  const score = $("hop-score");
  if (score) score.textContent = hopsLabel(state.score);
  const combo = $("hop-combo");
  if (combo) combo.textContent = state.combo >= 2 ? "Perfekt × " + state.combo : "";
}

function paintMute() {
  const btn = $("hop-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────

function scale() {
  return Math.min(state.w, state.h) / 9;
}

function project(wx, wy) {
  const s = scale();
  return { x: state.w * 0.24 + (wx - state.body.x) * s, y: state.h * 0.68 - wy * s };
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
    ox = (hash(state.time * 30) * 2 - 1) * 8 * mag;
    oy = (hash(state.time * 20) * 2 - 1) * 6 * mag;
  }
  ctx.save();
  ctx.translate(ox, oy);

  const s = scale();
  const thick = Math.max(10, s * 0.28);
  ctx.fillStyle = pal.dim;
  ctx.globalAlpha = 0.4;
  for (const p of state.platforms) {
    const a = project(p.x, 0);
    const width = p.w * s;
    if (a.x + width < -20 || a.x > w + 20) continue;
    ctx.fillRect(a.x, a.y, width, thick);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.accent;
  for (const b of state.blocks) {
    const a = project(b.x, b.h);
    if (a.x > w + 20 || a.x + b.w * s < -20) continue;
    ctx.fillRect(a.x, a.y, b.w * s, b.h * s);
  }

  const body = project(state.body.x, state.body.y + PH);
  ctx.fillStyle = pal.bright;
  ctx.globalAlpha = state.phase === "falling" || state.phase === "over" ? 0.45 : 1;
  ctx.fillRect(body.x, body.y, PW * s, PH * s);
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.bright;
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

function burst(count, speed) {
  const n = state.reduced ? Math.ceil(count * 0.3) : count;
  const p = project(state.body.x + PW / 2, state.body.y);
  for (let i = 0; i < n; i++) {
    const a = noise() * Math.PI * 2;
    const sp = speed * (0.3 + noise() * 0.7);
    const life = 0.25 + noise() * 0.3;
    state.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life });
  }
}

function fillAhead() {
  let guard = 0;
  while (state.cursor < state.body.x + AHEAD && guard < 12) {
    guard += 1;
    const seg = segment(state.cursor, state.course);
    state.gaps.push({ x: state.cursor, w: seg.gapW, scored: false });
    state.cursor += seg.gapW;
    state.platforms.push({ x: state.cursor, w: seg.platW, scored: false });
    if (seg.block) {
      state.blocks.push({ x: state.cursor + seg.block.offset, w: seg.block.w, h: seg.block.h, scored: false });
    }
    state.cursor += seg.platW;
  }
  const behind = state.body.x - BEHIND;
  state.platforms = state.platforms.filter((p) => p.x + p.w > behind);
  state.gaps = state.gaps.filter((g) => g.x + g.w > behind);
  state.blocks = state.blocks.filter((b) => b.x + b.w > behind);
}

function jump() {
  if (state.phase !== "play") return;
  unlockAudio();
  if (!canJump(state.body, state.time)) return;
  state.body.vy = JUMP_SPEED;
  state.body.grounded = false;
  state.body.jumpUsed = true;
  state.queuedPerfect = isEarlyJump(nextHazard(state.body.x, state.gaps, state.blocks));
  sfxPlace(state.combo);
  burst(6, 80);
}

function scoreSpan(span) {
  if (span.scored || state.body.x < span.x + span.w) return;
  span.scored = true;
  state.score += 1;
  if (state.queuedPerfect) {
    state.perfects += 1;
    state.combo += 1;
    sfxPerfect(state.combo);
    state.queuedPerfect = false;
    const at = project(state.body.x + PW / 2, state.body.y + PH);
    state.floaters.push({ text: state.combo >= 2 ? "× " + state.combo : "Perfekt", x: at.x, y: at.y - 14, life: 0.7, max: 0.7 });
  } else {
    state.combo = 0;
  }
  state.run = runSpeed(state.score);
  paintScore();
}

function fail() {
  if (state.phase !== "play") return;
  state.phase = "falling";
  state.combo = 0;
  state.queuedPerfect = false;
  sfxOver();
  state.trauma = state.reduced ? 0 : 0.85;
  burst(18, 160);
  paintScore();
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
  const line = $("hop-over-line");
  if (line) {
    const n = state.score;
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt hop." : state.perfects + " perfekte hop.")
      : "";
    const news = record ? " Ny rekord!" : "";
    line.textContent = n === 0
      ? "Du nåede ikke over den første forhindring. Prøv igen."
      : "Du kom over " + hopsLabel(n) + "." + perfect + news;
  }
  setScreen("over");
  $("hop-again")?.focus();
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

  const result = stepBody(state.body, state.platforms, state.blocks, state.run, state.time, dt);
  fillAhead();
  if (result === "fail") { fail(); return; }
  for (const g of state.gaps) scoreSpan(g);
  for (const b of state.blocks) scoreSpan(b);
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
  // A new course every round, counted in this browser.
  state.course = readCount(ROUNDS_KEY) + 1;
  writeCount(ROUNDS_KEY, state.course);
  state.body = { x: 0, y: 0, vy: 0, grounded: true, jumpUsed: false, leftGround: -1 };
  state.run = runSpeed(0);
  state.platforms = [{ x: -3, w: 8, scored: true }];
  state.gaps = [];
  state.blocks = [];
  state.cursor = 5;
  state.score = 0;
  state.combo = 0;
  state.perfects = 0;
  state.queuedPerfect = false;
  state.pn = 0;
  state.trauma = 0;
  state.particles = [];
  state.floaters = [];
  state.time = 0;
  state.acc = 0;
  state.last = 0;
  fillAhead();
  state.phase = "play";
  setScreen("play");
  resize();
  paintScore();
  state.raf = requestAnimationFrame(frame);
  $("hop-drop")?.focus();
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

  const canvas = $("hop-canvas");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !ctx) {
    const note = $("hop-best");
    if (note) note.textContent = "Spillet kan ikke tegnes i denne browser.";
    const start = $("hop-start");
    if (start) start.disabled = true;
    return;
  }
  state.canvas = canvas;
  state.ctx = ctx;
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);

  const lead = $("hop-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("hop-start")?.addEventListener("click", startRound);
  $("hop-again")?.addEventListener("click", startRound);
  $("hop-drop")?.addEventListener("click", jump);
  $("hop-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
  $("hop-arena")?.addEventListener("pointerdown", (event) => {
    if (event.target && event.target.closest && event.target.closest("button")) return;
    jump();
  });
  window.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key !== " " && key !== "Enter" && key !== "ArrowUp" && key !== "w" && key !== "W") return;
    if (state.phase !== "play") return;
    if ((key === " " || key === "Enter") && event.target && event.target.closest && event.target.closest("button, a")) return;
    event.preventDefault();
    if (event.repeat) return;
    jump();
  });
}

main();
