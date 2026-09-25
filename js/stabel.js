// Stabel page. Click or tap drops the moving plate onto the tower.
// A finished round pays 1 coin per plate via the claim_stabel_reward RPC. The server caps it at
// 50 coins per day, because the plate count is reported by this page and can be forged. No XP.
// The tower is drawn isometrically on a canvas (PRISMA look): plates slide along
// alternating axes, the overhang falls off, perfect drops chain into a combo.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import { placePlate, grownSize, sweepSpeed, PERFECT_UNIT } from "./stabel-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxGrow, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_stabel_best";

const STEP = 1 / 60;
const TILE_W = 92;
const TILE_H = 46;
const THICK = 16;
const TRAVEL = 1.55;
const FALL_MS = 700;

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
  if (!Number.isFinite(n) || n <= 0) return;
  const prev = readBest();
  if (n <= prev) return;
  try { localStorage.setItem(BEST_KEY, String(Math.floor(n))); } catch { /* fail-soft */ }
}

function platesLabel(n) {
  return n === 1 ? "1 plade" : n + " plader";
}

// Deterministic noise in [0, 1) — no Math.random, so every run of a given input looks the same.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function project(x, z, y) {
  return {
    x: (x - z) * (TILE_W / 2),
    y: (x + z) * (TILE_H / 2) - y * THICK,
  };
}

function hsl(h, s, l, a = 1) {
  return "hsla(" + h + " " + s + "% " + l + "% / " + a + ")";
}

// Hue of a CSS colour (#rgb, #rrggbb or rgb()). Fallback: the default theme's blue.
function hueOf(color) {
  const c = String(color || "").trim();
  let r, g, b;
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) {
    r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
  } else if ((m = /^#([0-9a-f]{6})/i.exec(c))) {
    r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
  } else if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c))) {
    r = Number(m[1]); g = Number(m[2]); b = Number(m[3]);
  } else {
    return 212;
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 212;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  return {
    hue: hueOf(css.getPropertyValue("--accent")),
    bright: css.getPropertyValue("--text-bright").trim() || "#ffffff",
    dim: css.getPropertyValue("--text-dim").trim() || "#9aa0b4",
  };
}

const state = {
  phase: "intro",          // intro | play | falling | over
  slabs: [],
  current: null,
  debris: [],
  particles: [],
  floaters: [],
  axis: 0,
  sweep: 0,
  homeX: 0,
  homeZ: 0,
  plates: 0,
  combo: 0,
  perfects: 0,
  seed: 0,
  hitstop: 0,
  dropLock: 0,
  buffered: 0,
  trauma: 0,
  flash: 0,
  camY: 0,
  zoom: 1,
  time: 0,
  acc: 0,
  last: 0,
  raf: 0,
  fallTimer: 0,
  round: 0,
  reduced: false,
  palette: { hue: 212, bright: "#ffffff", dim: "#9aa0b4" },
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
  const root = $("stabel-root");
  if (root) root.dataset.screen = name;
  for (const id of ["stabel-intro", "stabel-play", "stabel-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "stabel-" + name;
  }
}

function paintBest() {
  const best = readBest();
  const text = best > 0 ? "Din bedste stabel: " + platesLabel(best) + "." : "";
  for (const id of ["stabel-best", "stabel-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintScore() {
  const score = $("stabel-score");
  if (score) score.textContent = platesLabel(state.plates);
  const combo = $("stabel-combo");
  if (combo) combo.textContent = state.combo >= 2 ? "Perfekt × " + state.combo : "";
}

function paintMute() {
  const btn = $("stabel-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────

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

function drawSlab(ctx, s, alpha, moving) {
  const hw = s.w / 2;
  const hd = s.d / 2;
  const top = s.y + 1;
  const bot = s.y;
  const t1 = project(s.x - hw, s.z - hd, top);
  const t2 = project(s.x + hw, s.z - hd, top);
  const t3 = project(s.x + hw, s.z + hd, top);
  const t4 = project(s.x - hw, s.z + hd, top);
  const b2 = project(s.x + hw, s.z - hd, bot);
  const b3 = project(s.x + hw, s.z + hd, bot);
  const b4 = project(s.x - hw, s.z + hd, bot);
  const light = moving ? 8 : 0;

  ctx.beginPath();
  ctx.moveTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b2.x, b2.y);
  ctx.closePath();
  ctx.fillStyle = hsl(s.hue, 42, 28 + light, alpha);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(t4.x, t4.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y);
  ctx.closePath();
  ctx.fillStyle = hsl(s.hue, 46, 38 + light, alpha);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
  ctx.closePath();
  ctx.fillStyle = hsl(s.hue, 50, 62 + light, alpha);
  ctx.fill();

  if (moving) {
    ctx.strokeStyle = hsl(s.hue, 30, 90, 0.85 * alpha);
    ctx.lineWidth = 1.4;
  } else {
    ctx.strokeStyle = hsl(s.hue, 30, 78, 0.3 * alpha);
    ctx.lineWidth = 1;
  }
  ctx.stroke();
}

function drawGround(ctx) {
  const origin = project(0, 0, 0);
  ctx.save();
  ctx.translate(origin.x, origin.y + THICK * 0.15);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, TILE_W * 1.15, TILE_H * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  const a = project(-1.35, -1.35, 0);
  const b = project(1.35, -1.35, 0);
  const c = project(1.35, 1.35, 0);
  const d = project(-1.35, 1.35, 0);
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = state.palette.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Dashed outline of the plate below, drawn at the moving plate's height: where to aim.
function drawGhost(ctx, slab) {
  if (!state.current) return;
  const hw = slab.w / 2;
  const hd = slab.d / 2;
  const y = state.current.y + 1;
  const p1 = project(slab.x - hw, slab.z - hd, y);
  const p2 = project(slab.x + hw, slab.z - hd, y);
  const p3 = project(slab.x + hw, slab.z + hd, y);
  const p4 = project(slab.x - hw, slab.z + hd, y);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.strokeStyle = state.palette.dim;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  const ctx = state.ctx;
  if (!ctx) return;
  const { w, h } = state;
  ctx.clearRect(0, 0, w, h);

  let shakeX = 0;
  let shakeY = 0;
  let shakeA = 0;
  if (!state.reduced && state.trauma > 0) {
    const mag = state.trauma * state.trauma;
    shakeX = (hash(state.time * 37) * 2 - 1) * mag * 10;
    shakeY = (hash(state.time * 53 + 2) * 2 - 1) * mag * 8;
    shakeA = (hash(state.time * 19 + 7) * 2 - 1) * mag * 0.018;
  }

  // The camera offset uses the same scale as the drawing, so the top of the tower stays put on every screen size.
  const scale = state.zoom * (Math.min(w, h) / 420);
  ctx.save();
  ctx.translate(w / 2 + shakeX, h * 0.62 + state.camY * scale + shakeY);
  ctx.rotate(shakeA);
  ctx.scale(scale, scale);

  drawGround(ctx);
  const top = state.slabs.length > 0 ? state.slabs[state.slabs.length - 1] : null;
  if (state.phase === "play" && top) drawGhost(ctx, top);
  for (const s of state.slabs) drawSlab(ctx, s, 1, false);
  for (const d of state.debris) {
    const p = project(d.x, d.z, d.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(d.spin * 0.15);
    ctx.translate(-p.x, -p.y);
    drawSlab(ctx, d, Math.max(0, d.life / d.maxLife), false);
    ctx.restore();
  }
  if (state.current) drawSlab(ctx, state.current, 1, true);

  for (const p of state.particles) {
    ctx.fillStyle = hsl(p.hue, 40, 80, Math.max(0, p.life / p.max));
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillStyle = state.palette.bright;
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillText(f.text, f.sx, f.sy);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (state.flash > 0 && !state.reduced) {
    ctx.save();
    ctx.globalAlpha = state.flash * 0.1;
    ctx.fillStyle = state.palette.bright;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// ── simulation ─────────────────────────────────────────────────────────────────────────────

function hueFor(level) {
  return (state.palette.hue - 24 + ((level * 7) % 48) + 360) % 360;
}

function spawnNext(prev) {
  state.axis = state.axis === 0 ? 1 : 0;
  state.sweep = -Math.PI / 2;
  state.homeX = prev.x;
  state.homeZ = prev.z;
  const level = prev.y + 1;
  state.current = { x: prev.x, z: prev.z, w: prev.w, d: prev.d, y: level, hue: hueFor(level) };
}

function spawnDebris(slab, vx, vz) {
  state.debris.push({
    ...slab, vx, vz, vy: 0.4, life: 1.1, maxLife: 1.1, spin: 0, spinV: (noise() * 2 - 1) * 1.8,
  });
}

function burst(slab, count) {
  if (state.reduced) return;
  const p = project(slab.x, slab.z, slab.y + 1);
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + noise() * 0.4;
    const sp = 40 + noise() * 90;
    state.particles.push({
      sx: p.x, sy: p.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55 - 30,
      life: 0.45 + noise() * 0.25, max: 0.7,
      size: 1.6 + noise() * 2.2, hue: slab.hue,
    });
  }
}

function addFloater(text, slab, dy = 0) {
  const p = project(slab.x, slab.z, slab.y + 1);
  state.floaters.push({ text, sx: p.x, sy: p.y - 12 - dy, life: 0.7, max: 0.7 });
}

function drop() {
  if (state.phase !== "play") return;
  unlockAudio();
  if (state.dropLock > 0 || state.hitstop > 0) {
    state.buffered = 0.14;
    return;
  }
  place();
}

function place() {
  const cur = state.current;
  const prev = state.slabs.length > 0 ? state.slabs[state.slabs.length - 1] : null;
  if (state.phase !== "play" || !cur || !prev) return;

  const movingX = state.axis === 0;
  const curC = movingX ? cur.x : cur.z;
  const curS = movingX ? cur.w : cur.d;
  const prevC = movingX ? prev.x : prev.z;
  const prevS = movingX ? prev.w : prev.d;
  const placed = placePlate({ x: curC - curS / 2, w: curS }, { x: prevC - prevS / 2, w: prevS }, PERFECT_UNIT);
  const dir = Math.sign(curC - prevC) || 1;

  if (!placed.hit || !placed.plate) {
    spawnDebris(cur, movingX ? dir * 1.1 : 0, movingX ? 0 : dir * 1.1);
    fail();
    return;
  }

  const kept = placed.plate;
  if (placed.perfect) {
    state.combo += 1;
    state.perfects += 1;
    if (movingX) cur.x = prevC; else cur.z = prevC;
    state.hitstop = state.reduced ? 0 : 0.045;
    state.trauma = Math.min(1, state.trauma + 0.35);
    state.flash = 0.55;
    sfxPerfect(state.combo);
    burst(cur, 18);
    addFloater(state.combo >= 2 ? "× " + state.combo : "Perfekt", cur);
    const grownW = grownSize(state.combo, cur.w);
    const grownD = grownSize(state.combo, cur.d);
    if (grownW > cur.w || grownD > cur.d) {
      cur.w = grownW;
      cur.d = grownD;
      sfxGrow();
      addFloater("+", cur, 18);
    }
  } else {
    const keptC = kept.x + kept.w / 2;
    const cutS = curS - kept.w;
    const cutC = keptC + dir * (kept.w / 2 + cutS / 2);
    if (cutS > 0) {
      spawnDebris(movingX ? { ...cur, x: cutC, w: cutS } : { ...cur, z: cutC, d: cutS },
        movingX ? dir * 0.9 : 0, movingX ? 0 : dir * 0.9);
    }
    if (movingX) { cur.x = keptC; cur.w = kept.w; } else { cur.z = keptC; cur.d = kept.w; }
    state.combo = 0;
    state.trauma = Math.min(1, state.trauma + 0.18);
    sfxPlace(state.plates);
    burst(cur, 7);
  }

  state.plates += 1;
  state.slabs.push({ ...cur });
  spawnNext(cur);
  state.dropLock = 0.08;
  paintScore();
}

function fail() {
  state.current = null;
  state.combo = 0;
  state.phase = "falling";
  state.trauma = Math.min(1, state.trauma + 0.7);
  sfxOver();
  paintScore();
  writeBest(state.plates);
  paintBest();
  claimCoins(state.plates, state.round);
  clearTimeout(state.fallTimer);
  state.fallTimer = setTimeout(showOver, state.reduced ? 0 : FALL_MS);
}

function showOver() {
  state.fallTimer = 0;
  if (state.phase !== "falling") return;
  state.phase = "over";
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  const n = state.plates;
  const title = $("stabel-over-title");
  const line = $("stabel-over-line");
  if (title) title.textContent = n > 0 ? "Tårnet står" : "Bordet er klar";
  if (line) {
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt slip." : state.perfects + " perfekte slip.")
      : "";
    line.textContent = n === 0
      ? "Pladen røg forbi. Bordet venter stadig."
      : "Pladen røg forbi. Du nåede " + platesLabel(n) + "." + perfect;
  }
  setScreen("over");
  $("stabel-again")?.focus();
}

function step(dt) {
  state.time += dt;
  if (state.dropLock > 0) state.dropLock -= dt;
  if (state.buffered > 0) {
    state.buffered -= dt;
    if (state.buffered > 0 && state.dropLock <= 0 && state.hitstop <= 0 && state.phase === "play") {
      state.buffered = 0;
      place();
    }
  }
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.4);
  state.trauma = Math.max(0, state.trauma - dt * 1.6);

  const c = state.current;
  if (state.phase === "play" && c) {
    state.sweep += sweepSpeed(state.plates) * dt;
    if (state.axis === 0) { c.x = state.homeX + Math.sin(state.sweep) * TRAVEL; c.z = state.homeZ; }
    else { c.x = state.homeX; c.z = state.homeZ + Math.sin(state.sweep) * TRAVEL; }
  }

  const topY = c ? c.y : state.slabs.length > 0 ? state.slabs[state.slabs.length - 1].y : 0;
  state.camY += (topY * THICK - state.camY) * (1 - Math.exp(-5.2 * dt));
  const targetZoom = 1 / (1 + state.slabs.length * 0.011);
  state.zoom += (targetZoom - state.zoom) * (1 - Math.exp(-3 * dt));

  for (const d of state.debris) {
    d.vy -= 14 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.z += d.vz * dt;
    d.spin += d.spinV * dt; d.life -= dt;
  }
  state.debris = state.debris.filter((d) => d.life > 0);
  for (const p of state.particles) {
    p.vy += 70 * dt; p.sx += p.vx * dt; p.sy += p.vy * dt; p.vx *= 0.98; p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) { f.sy -= 28 * dt; f.life -= dt; }
  state.floaters = state.floaters.filter((f) => f.life > 0);
}

function frame(now) {
  if (state.phase !== "play" && state.phase !== "falling") { state.raf = 0; return; }
  const raw = state.last ? Math.min(0.1, (now - state.last) / 1000) : 0;
  state.last = now;
  state.acc += raw;
  let steps = 0;
  while (state.acc >= STEP && steps < 5) {
    if (state.hitstop > 0) state.hitstop -= STEP;
    else step(STEP);
    state.acc -= STEP;
    steps += 1;
  }
  draw();
  state.raf = requestAnimationFrame(frame);
}

// Pays the finished round once. The round number guards against a slow reply
// landing on a newer round's end screen.
async function claimCoins(plates, round) {
  const el = $("stabel-coins");
  const paint = (text) => { if (el && state.round === round) el.textContent = text; };
  if (!Number.isFinite(plates) || plates <= 0) {
    paint("Ingen plader — ingen mønter denne gang.");
    return;
  }
  paint("Gemmer dine mønter …");
  try {
    const { data, error } = await supabase.rpc("claim_stabel_reward", { p_plates: Math.floor(plates) });
    if (error) throw error;
    const result = data && typeof data === "object" ? data : null;
    const coins = Number(result?.coins);
    const today = Number(result?.today);
    const cap = Number(result?.cap);
    if (result?.status !== "ok" || ![coins, today, cap].every(Number.isFinite)) {
      throw new Error("Uventet svar fra claim_stabel_reward");
    }
    if (coins > 0) {
      paint("+" + coins + (coins === 1 ? " mønt" : " mønter") + ". I dag fra Stabel: " + today + " af " + cap + ".");
    } else {
      paint("Dagens " + cap + " mønter fra Stabel er brugt. Kom igen i morgen.");
    }
  } catch (err) {
    console.error("[stabel] claim_stabel_reward failed", err);
    paint("Mønterne kunne ikke gemmes. Prøv igen senere.");
  }
}

function startRound() {
  stopReadAloud();
  state.round += 1;
  unlockAudio();
  clearTimeout(state.fallTimer);
  state.fallTimer = 0;
  cancelAnimationFrame(state.raf);
  state.reduced = prefersReducedMotion();
  state.palette = readPalette();
  const base = { x: 0, z: 0, w: 1, d: 1, y: 0, hue: hueFor(0) };
  state.slabs = [base];
  state.debris = [];
  state.particles = [];
  state.floaters = [];
  state.axis = 0;
  state.plates = 0;
  state.combo = 0;
  state.perfects = 0;
  state.seed = 0;
  state.hitstop = 0;
  state.dropLock = 0.18;
  state.buffered = 0;
  state.trauma = 0;
  state.flash = 0;
  state.camY = 0;
  state.zoom = 1;
  state.time = 0;
  state.acc = 0;
  state.last = 0;
  spawnNext(base);
  state.phase = "play";
  setScreen("play");
  resize();
  paintScore();
  state.raf = requestAnimationFrame(frame);
  $("stabel-drop")?.focus();
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

  const canvas = $("stabel-canvas");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !ctx) {
    const note = $("stabel-best");
    if (note) note.textContent = "Spillet kan ikke tegnes i denne browser.";
    const start = $("stabel-start");
    if (start) start.disabled = true;
    return;
  }
  state.canvas = canvas;
  state.ctx = ctx;
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);

  const lead = $("stabel-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("stabel-start")?.addEventListener("click", startRound);
  $("stabel-again")?.addEventListener("click", startRound);
  $("stabel-drop")?.addEventListener("click", drop);
  $("stabel-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
  $("stabel-arena")?.addEventListener("pointerdown", (event) => {
    if (event.target && event.target.closest && event.target.closest("button")) return;
    drop();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (state.phase !== "play") return;
    if (event.target && event.target.closest && event.target.closest("button, a")) return;
    event.preventDefault();
    if (event.repeat) return;
    drop();
  });
}

main();
