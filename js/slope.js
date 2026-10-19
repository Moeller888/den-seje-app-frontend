// Slope page. A ball rolls down a track on its own; steer it through the gaps between the blocks.
// Slope pays no coins and no XP; only the best result is kept, in this browser.
// The track is drawn in perspective on a canvas in the theme's colours. Rules live in js/slope-logic.js.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import {
  R, BLOCK_H, hash, segment, stepBall, clearance, isNearMiss,
} from "./slope-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_slope_best";
const ROUNDS_KEY = "dsj_slope_rounds";

const STEP = 1 / 60;
const OVER_MS = 750;
// How far ahead of the ball the track is built, and how far behind it is dropped.
const AHEAD = 84;
const BEHIND = 6;
// Camera: this far behind the ball and this high above the floor.
const CAM_BACK = 5.4;
const CAM_UP = 2.3;
// The track fades out between these distances from the camera.
const FADE_FROM = 34;
const FADE_TO = 80;
// Cross lines on the floor, this far apart, so the speed shows.
const LINE_EVERY = 3;

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

function metersLabel(n) {
  return n + " meter";
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
  ball: { x: 0, z: 0, vx: 0 },
  drop: 0,                 // how far the ball has sunk below the floor after rolling off
  dropSpeed: 0,
  ending: "fall",          // fall | hit
  segments: [],
  nextIndex: 0,
  seed: 0,
  camX: 0,
  meters: 0,
  rows: 0,
  combo: 0,
  perfects: 0,
  keys: { left: false, right: false },
  hold: { left: false, right: false },
  touch: new Map(),        // pointerId -> -1 | 1, for fingers on the arena
  trauma: 0,
  particles: [],
  floaters: [],
  pn: 0,
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

function steerInput() {
  let left = state.keys.left || state.hold.left;
  let right = state.keys.right || state.hold.right;
  for (const dir of state.touch.values()) {
    if (dir < 0) left = true;
    if (dir > 0) right = true;
  }
  if (left && !right) return -1;
  if (right && !left) return 1;
  return 0;
}

function setScreen(name) {
  const root = $("slope-root");
  if (root) root.dataset.screen = name;
  for (const id of ["slope-intro", "slope-play", "slope-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "slope-" + name;
  }
}

function paintBest() {
  const best = readCount(BEST_KEY);
  const text = best > 0 ? "Din bedste runde: " + metersLabel(best) + "." : "";
  for (const id of ["slope-best", "slope-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintScore() {
  const score = $("slope-score");
  if (score) score.textContent = metersLabel(state.meters);
  const combo = $("slope-combo");
  if (combo) combo.textContent = state.combo >= 2 ? "Perfekt × " + state.combo : "";
}

function paintMute() {
  const btn = $("slope-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

function paintHold() {
  const left = $("slope-left");
  if (left) left.dataset.held = state.hold.left ? "true" : "false";
  const right = $("slope-right");
  if (right) right.dataset.held = state.hold.right ? "true" : "false";
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────

function focal() {
  return state.h * 0.95;
}

function horizon() {
  return state.h * 0.3;
}

function camZ() {
  return state.ball.z - CAM_BACK;
}

// Screen point for a world point, or null when it is behind the camera.
function project(wx, wy, wz) {
  const dz = wz - camZ();
  if (dz < 0.35) return null;
  const s = focal() / dz;
  return { x: state.w / 2 + (wx - state.camX) * s, y: horizon() + (CAM_UP - wy) * s, s };
}

function fade(z) {
  const dz = z - camZ();
  if (dz <= FADE_FROM) return 1;
  if (dz >= FADE_TO) return 0;
  return 1 - (dz - FADE_FROM) / (FADE_TO - FADE_FROM);
}

function quad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
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

function drawFloor(ctx, seg) {
  const pal = state.palette;
  const near = Math.max(seg.z0, camZ() + 0.4);
  const far = seg.z0 + seg.len;
  if (far <= near) return;
  const l = seg.center - seg.w / 2;
  const r = seg.center + seg.w / 2;
  const a = project(l, 0, near);
  const b = project(r, 0, near);
  const c = project(r, 0, far);
  const d = project(l, 0, far);
  if (!a || !b || !c || !d) return;
  const alpha = fade(near);
  if (alpha <= 0) return;

  ctx.globalAlpha = 0.24 * alpha;
  ctx.fillStyle = pal.dim;
  quad(ctx, a, b, c, d);
  ctx.fill();

  ctx.globalAlpha = 0.3 * alpha;
  ctx.strokeStyle = pal.dim;
  ctx.lineWidth = 1;
  const first = Math.ceil(near / LINE_EVERY) * LINE_EVERY;
  for (let z = first; z < far; z += LINE_EVERY) {
    const p = project(l, 0, z);
    const q = project(r, 0, z);
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.95 * alpha;
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(d.x, d.y);
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBlock(ctx, blk) {
  const pal = state.palette;
  const z0 = Math.max(blk.z0, camZ() + 0.4);
  if (blk.z1 <= z0) return;
  const alpha = fade(z0);
  if (alpha <= 0) return;
  const fl = project(blk.x0, 0, z0);
  const fr = project(blk.x1, 0, z0);
  const tl = project(blk.x0, BLOCK_H, z0);
  const tr = project(blk.x1, BLOCK_H, z0);
  const bl = project(blk.x0, BLOCK_H, blk.z1);
  const br = project(blk.x1, BLOCK_H, blk.z1);
  if (!fl || !fr || !tl || !tr || !bl || !br) return;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = pal.accent;
  quad(ctx, tl, tr, br, bl);
  ctx.fill();
  ctx.globalAlpha = 0.35 * alpha;
  ctx.fillStyle = pal.bright;
  ctx.fill();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = pal.accent;
  quad(ctx, fl, fr, tr, tl);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBall(ctx) {
  const pal = state.palette;
  const p = project(state.ball.x, R - state.drop, state.ball.z);
  if (!p) return;
  const radius = Math.max(3, R * p.s);
  ctx.globalAlpha = state.phase === "falling" || state.phase === "over" ? 0.55 : 1;
  if (state.drop <= 0) {
    // A soft shadow on the floor under the ball.
    const floor = project(state.ball.x, 0, state.ball.z);
    if (floor) {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(floor.x, floor.y, radius * 0.95, radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const shade = ctx.createRadialGradient(p.x - radius * 0.35, p.y - radius * 0.4, radius * 0.1, p.x, p.y, radius);
  shade.addColorStop(0, pal.bright);
  shade.addColorStop(1, pal.dim);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  // A stripe that turns with the distance rolled, so the ball reads as rolling.
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = Math.max(1.5, radius * 0.18);
  const turn = state.ball.z / R;
  const y = p.y + Math.cos(turn) * radius * 0.55;
  const half = Math.sqrt(Math.max(0, radius * radius - (y - p.y) * (y - p.y))) * 0.92;
  if (Math.sin(turn) > 0) {
    ctx.beginPath();
    ctx.moveTo(p.x - half, y);
    ctx.lineTo(p.x + half, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  const ctx = state.ctx;
  if (!ctx) return;
  const { w, h } = state;
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

  const sunk = state.drop > 0;
  if (sunk) drawBall(ctx);

  // Far to near, so nearer pieces cover farther ones. The ball goes in where it belongs.
  let ballDrawn = sunk;
  for (let i = state.segments.length - 1; i >= 0; i--) {
    const seg = state.segments[i];
    drawFloor(ctx, seg);
    for (const blk of seg.blocks) {
      if (!ballDrawn && blk.z1 < state.ball.z) { drawBall(ctx); ballDrawn = true; }
      drawBlock(ctx, blk);
    }
    if (!ballDrawn && seg.z0 <= state.ball.z) { drawBall(ctx); ballDrawn = true; }
  }
  if (!ballDrawn) drawBall(ctx);

  ctx.fillStyle = state.palette.bright;
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
  const p = project(state.ball.x, R, state.ball.z);
  if (!p) return;
  for (let i = 0; i < n; i++) {
    const a = noise() * Math.PI * 2;
    const sp = speed * (0.3 + noise() * 0.7);
    const life = 0.25 + noise() * 0.3;
    state.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life });
  }
}

function fillAhead() {
  let guard = 0;
  while (guard < 16) {
    const lastSeg = state.segments.length > 0 ? state.segments[state.segments.length - 1] : null;
    if (lastSeg && lastSeg.z0 + lastSeg.len > state.ball.z + AHEAD) break;
    guard += 1;
    state.segments.push(segment(state.nextIndex, state.seed, lastSeg));
    state.nextIndex += 1;
  }
  const behind = state.ball.z - BEHIND;
  state.segments = state.segments.filter((s) => s.z0 + s.len > behind);
}

function scoreRows() {
  for (const seg of state.segments) {
    if (seg.blocks.length === 0 || seg.scored) continue;
    if (state.ball.z - R <= seg.blocks[0].z1) continue;
    seg.scored = true;
    state.rows += 1;
    if (isNearMiss(clearance(state.ball.x, seg.blocks))) {
      state.perfects += 1;
      state.combo += 1;
      sfxPerfect(state.combo);
      const at = project(state.ball.x, R * 2, state.ball.z);
      if (at) state.floaters.push({ text: state.combo >= 2 ? "× " + state.combo : "Perfekt", x: at.x, y: at.y - 18, life: 0.7, max: 0.7 });
    } else {
      state.combo = 0;
      sfxPlace(state.rows);
    }
    paintScore();
  }
}

function fail(ending) {
  if (state.phase !== "play") return;
  state.phase = "falling";
  state.ending = ending;
  state.combo = 0;
  sfxOver();
  state.trauma = state.reduced ? 0 : ending === "hit" ? 0.9 : 0.5;
  burst(18, 160);
  paintScore();
  const record = writeBest(state.meters);
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
  const title = $("slope-over-title");
  if (title) title.textContent = state.ending === "hit" ? "Ramte en klods" : "Ude af banen";
  const line = $("slope-over-line");
  if (line) {
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt smut." : state.perfects + " perfekte smut.")
      : "";
    const news = record ? " Ny rekord!" : "";
    line.textContent = state.rows === 0
      ? "Du trillede " + metersLabel(state.meters) + ", men kom ikke forbi den første række. Prøv igen."
      : "Du trillede " + metersLabel(state.meters) + " og kom forbi " +
        (state.rows === 1 ? "1 række" : state.rows + " rækker") + "." + perfect + news;
  }
  setScreen("over");
  $("slope-again")?.focus();
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

  if (state.phase === "falling") {
    if (state.ending === "fall") {
      state.dropSpeed += 18 * dt;
      state.drop += state.dropSpeed * dt;
      state.ball.x += state.ball.vx * dt;
      state.ball.z += 6 * dt;
    }
    return;
  }
  if (state.phase !== "play") return;

  const result = stepBall(state.ball, steerInput(), state.segments, dt);
  state.camX += (state.ball.x - state.camX) * Math.min(1, dt * 6);
  fillAhead();
  const meters = Math.floor(state.ball.z);
  if (meters !== state.meters) { state.meters = meters; paintScore(); }
  if (result !== "ok") { fail(result); return; }
  scoreRows();
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

function releaseAll() {
  state.keys.left = false;
  state.keys.right = false;
  state.hold.left = false;
  state.hold.right = false;
  state.touch.clear();
  paintHold();
}

function startRound() {
  stopReadAloud();
  unlockAudio();
  clearTimeout(state.overTimer);
  state.overTimer = 0;
  cancelAnimationFrame(state.raf);
  state.reduced = prefersReducedMotion();
  state.palette = readPalette();
  // A new track every round, counted in this browser.
  state.seed = readCount(ROUNDS_KEY) + 1;
  writeCount(ROUNDS_KEY, state.seed);
  state.ball = { x: 0, z: 0, vx: 0 };
  state.drop = 0;
  state.dropSpeed = 0;
  state.ending = "fall";
  state.segments = [];
  state.nextIndex = 0;
  state.camX = 0;
  state.meters = 0;
  state.rows = 0;
  state.combo = 0;
  state.perfects = 0;
  releaseAll();
  state.trauma = 0;
  state.particles = [];
  state.floaters = [];
  state.pn = 0;
  state.time = 0;
  state.acc = 0;
  state.last = 0;
  fillAhead();
  state.phase = "play";
  setScreen("play");
  resize();
  paintScore();
  state.raf = requestAnimationFrame(frame);
  $("slope-arena")?.focus();
}

function bindHold(id, side) {
  const btn = $(id);
  if (!btn) return;
  const press = (event) => {
    event.preventDefault();
    unlockAudio();
    state.hold[side] = true;
    paintHold();
    if (event.pointerId !== undefined && btn.setPointerCapture) {
      try { btn.setPointerCapture(event.pointerId); } catch { /* fail-soft */ }
    }
  };
  const release = () => {
    state.hold[side] = false;
    paintHold();
  };
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("lostpointercapture", release);
  btn.addEventListener("contextmenu", (event) => event.preventDefault());
}

function sideOf(event, arena) {
  const rect = arena.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? -1 : 1;
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

  const canvas = $("slope-canvas");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !ctx) {
    const note = $("slope-best");
    if (note) note.textContent = "Spillet kan ikke tegnes i denne browser.";
    const start = $("slope-start");
    if (start) start.disabled = true;
    return;
  }
  state.canvas = canvas;
  state.ctx = ctx;
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);

  const lead = $("slope-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("slope-start")?.addEventListener("click", startRound);
  $("slope-again")?.addEventListener("click", startRound);
  $("slope-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
  bindHold("slope-left", "left");
  bindHold("slope-right", "right");

  const arena = $("slope-arena");
  if (arena) {
    arena.tabIndex = 0;
    arena.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      unlockAudio();
      state.touch.set(event.pointerId, sideOf(event, arena));
      if (arena.setPointerCapture) {
        try { arena.setPointerCapture(event.pointerId); } catch { /* fail-soft */ }
      }
    });
    arena.addEventListener("pointermove", (event) => {
      if (state.touch.has(event.pointerId)) state.touch.set(event.pointerId, sideOf(event, arena));
    });
    const lift = (event) => { state.touch.delete(event.pointerId); };
    arena.addEventListener("pointerup", lift);
    arena.addEventListener("pointercancel", lift);
    arena.addEventListener("lostpointercapture", lift);
    arena.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  const keySide = (key) => {
    if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
    if (key === "ArrowRight" || key === "d" || key === "D") return "right";
    return null;
  };
  window.addEventListener("keydown", (event) => {
    const side = keySide(event.key);
    if (!side || state.phase !== "play") return;
    event.preventDefault();
    unlockAudio();
    state.keys[side] = true;
  });
  window.addEventListener("keyup", (event) => {
    const side = keySide(event.key);
    if (side) state.keys[side] = false;
  });
  // A key or finger let go while the window was in the background must not keep steering.
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
}

main();
