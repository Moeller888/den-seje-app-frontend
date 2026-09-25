// Stabel page. Click or tap drops the moving plate onto the tower.
// No XP and no coins — a miss is not a wrong answer, and chance must not pay out.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import { placePlate } from "./stabel-logic.js";

const TRACK = 280;
const START_W = 168;
const PLATE_H = 26;
const PLATE_GAP = 6;
const STEP = PLATE_H + PLATE_GAP;
const VISIBLE = 11;
const BEST_KEY = "dsj_stabel_best";

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

function plateCount(plates) {
  return Math.max(0, plates.length - 1);
}

const state = {
  phase: "intro",
  plates: [],
  mover: null,
  dir: 1,
  speed: 150,
  last: 0,
  raf: 0,
};

function setScreen(name) {
  state.phase = name;
  const root = $("stabel-root");
  if (root) root.dataset.screen = name;
  for (const id of ["stabel-intro", "stabel-play", "stabel-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "stabel-" + name;
  }
}

function paintBest() {
  const best = readBest();
  const text = best > 0 ? "Din bedste stabel: " + best + (best === 1 ? " plade." : " plader.") : "";
  for (const id of ["stabel-best", "stabel-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function makePlate(plate, extra) {
  const el = document.createElement("div");
  el.className = "plate" + (extra ? " " + extra : "");
  el.style.left = plate.x + "px";
  el.style.width = plate.w + "px";
  return el;
}

function renderTower() {
  const track = $("stabel-track");
  if (!track || !state.mover) return;
  const shift = Math.max(0, state.plates.length - (VISIBLE - 1)) * STEP;
  track.replaceChildren();
  state.plates.forEach((plate, i) => {
    const el = makePlate(plate, i === 0 ? "is-base" : "");
    el.style.bottom = (12 + i * STEP - shift) + "px";
    track.appendChild(el);
  });
  const mover = makePlate(state.mover, "is-mover");
  mover.style.bottom = (12 + state.plates.length * STEP - shift) + "px";
  track.appendChild(mover);
  const score = $("stabel-score");
  if (score) {
    const n = plateCount(state.plates);
    score.textContent = n === 1 ? "1 plade" : n + " plader";
  }
}

function startRound() {
  stopReadAloud();
  const x = (TRACK - START_W) / 2;
  state.plates = [{ x, w: START_W }];
  state.mover = { x: 8, w: START_W };
  state.dir = 1;
  state.speed = 150;
  state.last = 0;
  setScreen("play");
  renderTower();
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(tick);
  $("stabel-drop")?.focus();
}

function finish(missed) {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  const n = plateCount(state.plates);
  writeBest(n);
  paintBest();
  const title = $("stabel-over-title");
  const line = $("stabel-over-line");
  if (title) title.textContent = n > 0 ? "Tårnet står" : "Bordet er klar";
  if (line) {
    const height = n === 1 ? "1 plade" : n + " plader";
    line.textContent = !missed
      ? "Du nåede " + height + "."
      : n === 0
        ? "Pladen røg forbi. Bordet venter stadig."
        : "Pladen røg forbi. Du nåede " + height + ".";
  }
  setScreen("over");
  $("stabel-again")?.focus();
}

function drop() {
  if (state.phase !== "play" || !state.mover) return;
  const below = state.plates[state.plates.length - 1];
  const placed = placePlate(state.mover, below);
  if (!placed.hit || !placed.plate) {
    finish(true);
    return;
  }
  state.plates.push(placed.plate);
  state.mover = { x: placed.plate.x, w: placed.plate.w };
  state.speed = Math.min(420, state.speed + 16);
  renderTower();
  if (placed.perfect && !prefersReducedMotion()) {
    const plates = $("stabel-track")?.querySelectorAll(".plate");
    const landed = plates?.[state.plates.length - 1];
    if (landed) landed.classList.add("is-perfect");
  }
}

function tick(now) {
  if (state.phase !== "play" || !state.mover) return;
  const dt = state.last ? Math.min(0.032, (now - state.last) / 1000) : 0;
  state.last = now;
  let x = state.mover.x + state.dir * state.speed * dt;
  const max = TRACK - state.mover.w;
  if (x <= 0) { x = 0; state.dir = 1; }
  else if (x >= max) { x = max; state.dir = -1; }
  state.mover.x = x;
  const mover = $("stabel-track")?.querySelector(".is-mover");
  if (mover) mover.style.left = x + "px";
  state.raf = requestAnimationFrame(tick);
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

  const lead = $("stabel-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();

  $("stabel-start")?.addEventListener("click", startRound);
  $("stabel-again")?.addEventListener("click", startRound);
  $("stabel-drop")?.addEventListener("click", drop);
  $("stabel-arena")?.addEventListener("pointerdown", (event) => {
    if (event.target && event.target.closest && event.target.closest("button")) return;
    drop();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (state.phase !== "play") return;
    if (event.target && event.target.id === "stabel-drop") return;
    event.preventDefault();
    drop();
  });
}

main();
