// Husk page. A memory game: flip two tiles, keep the pairs, remember where the rest lay.
// Every cleared board deals a bigger one (12 → 16 → 20 tiles). Too many misses on one board ends
// the round. Husk pays no coins and no XP; only the best result is kept, in this browser.
// The board is plain buttons, so it works with a keyboard and a screen reader as it is.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { attachReadAloudControl, stopReadAloud } from "./read-aloud/adapters/quiz.js";
import { boardFor, missLimit, deal, flipTile, closePair } from "./husk-logic.js";
import { unlockAudio, isMuted, setMuted, sfxPlace, sfxPerfect, sfxGrow, sfxOver } from "./stabel-audio.js";

const BEST_KEY = "dsj_husk_best";
const ROUNDS_KEY = "dsj_husk_rounds";

// How long a missed pair stays up before it turns back, and the pause after a cleared board.
const MISS_SHOW_MS = 650;
const OVER_DELAY_MS = 450;
const NEXT_BOARD_MS = 700;

const $ = (id) => document.getElementById(id);

const SVG_NS = "http://www.w3.org/2000/svg";

// Ten marks, one per pair on the biggest board. Each has a Danish name for the screen reader.
const GLYPHS = [
  { name: "cirkel", shapes: [["circle", { cx: 24, cy: 24, r: 11 }]] },
  { name: "firkant", shapes: [["rect", { x: 13, y: 13, width: 22, height: 22 }]] },
  { name: "trekant", shapes: [["path", { d: "M24 12 L37 34 H11 Z" }]] },
  { name: "rombe", shapes: [["path", { d: "M24 10 L36 24 L24 38 L12 24 Z" }]] },
  { name: "plus", shapes: [["path", { d: "M24 12 V36 M12 24 H36" }]] },
  { name: "sekskant", shapes: [["path", { d: "M24 12 L34.4 18 V30 L24 36 L13.6 30 V18 Z" }]] },
  { name: "stjerne", shapes: [["path", { d: "M24 12 L27.2 20.6 L36.4 21 L29.2 26.7 L31.6 35.5 L24 30.5 L16.4 35.5 L18.8 26.7 L11.6 21 L20.8 20.6 Z" }]] },
  { name: "kryds", shapes: [["path", { d: "M14 14 L34 34 M34 14 L14 34" }]] },
  { name: "bølge", shapes: [["path", { d: "M10 24 Q17 14 24 24 T38 24" }]] },
  { name: "halvmåne", shapes: [["path", { d: "M30 13.6 A12 12 0 1 0 30 34.4 A11 11 0 0 1 30 13.6 Z" }]] },
];

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

function pairsLabel(n) {
  return n === 1 ? "1 par" : n + " par";
}

function boardsLabel(n) {
  return n === 1 ? "1 bræt" : n + " bræt";
}

const state = {
  phase: "intro",          // intro | play | over
  tiles: [],
  open: null,
  lock: false,
  level: 0,
  score: 0,
  perfects: 0,
  combo: 0,
  misses: 0,
  boards: 0,
  round: 0,
  seed: 0,
  timers: [],
  buttons: [],
};

function later(fn, ms) {
  const round = state.round;
  const id = setTimeout(() => {
    state.timers = state.timers.filter((t) => t !== id);
    if (state.round !== round) return;
    fn();
  }, ms);
  state.timers.push(id);
}

function clearTimers() {
  for (const id of state.timers) clearTimeout(id);
  state.timers = [];
}

function setScreen(name) {
  const root = $("husk-root");
  if (root) root.dataset.screen = name;
  for (const id of ["husk-intro", "husk-play", "husk-over"]) {
    const el = $(id);
    if (el) el.hidden = id !== "husk-" + name;
  }
}

function paintBest() {
  const best = readCount(BEST_KEY);
  const text = best > 0 ? "Din bedste runde: " + pairsLabel(best) + "." : "";
  for (const id of ["husk-best", "husk-best-over"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function paintMute() {
  const btn = $("husk-mute");
  if (!btn) return;
  const muted = isMuted();
  btn.textContent = muted ? "Lyd fra" : "Lyd til";
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.setAttribute("aria-label", muted ? "Slå lyden til" : "Slå lyden fra");
}

function setStatus(text) {
  const el = $("husk-status");
  if (el) el.textContent = text;
}

function paintHud() {
  const score = $("husk-score");
  if (score) {
    score.textContent = pairsLabel(state.score) + (state.combo >= 2 ? " · Perfekt × " + state.combo : "");
  }
  const misses = $("husk-misses");
  if (misses) {
    const limit = missLimit(state.level);
    misses.textContent = "Fejl " + state.misses + "/" + limit;
    misses.dataset.warn = state.misses >= limit - 1 && state.misses > 0 ? "true" : "false";
  }
}

// ── board ──────────────────────────────────────────────────────────────────────────────────

function glyphSvg(glyph) {
  const def = GLYPHS[glyph];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");
  if (!def) return svg;
  for (const [tag, attrs] of def.shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "2.5");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("stroke-linecap", "round");
    svg.appendChild(el);
  }
  return svg;
}

function backMark() {
  const span = document.createElement("span");
  span.className = "husk-back-mark";
  span.setAttribute("aria-hidden", "true");
  return span;
}

// Builds one button per tile. Called once per board; later changes only update the buttons,
// so keyboard focus stays where it is.
function buildBoard() {
  const board = $("husk-board");
  if (!board) return;
  const { cols, pairs } = boardFor(state.level);
  board.style.setProperty("--cols", String(cols));
  board.setAttribute("aria-label", "Husk-brættet, " + pairs * 2 + " felter");
  board.replaceChildren();
  state.buttons = state.tiles.map((_, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "husk-tile";
    btn.dataset.index = String(i);
    btn.addEventListener("click", () => onFlip(i));
    board.appendChild(btn);
    return btn;
  });
  paintBoard();
}

function paintBoard() {
  const board = $("husk-board");
  if (board) board.dataset.locked = state.lock ? "true" : "false";
  const { cols } = boardFor(state.level);
  state.tiles.forEach((tile, i) => {
    const btn = state.buttons[i];
    if (!btn || !tile) return;
    const view = tile.matched ? "matched" : tile.open ? "open" : "closed";
    const row = Math.floor(i / cols) + 1;
    const col = (i % cols) + 1;
    const where = "række " + row + ", plads " + col;
    const name = GLYPHS[tile.glyph] ? GLYPHS[tile.glyph].name : "ukendt";
    if (btn.dataset.state !== view) {
      btn.dataset.state = view;
      btn.replaceChildren(view === "closed" ? backMark() : glyphSvg(tile.glyph));
    }
    if (view === "matched") btn.setAttribute("aria-label", name + ", fundet, " + where);
    else if (view === "open") btn.setAttribute("aria-label", name + ", vendt, " + where);
    else btn.setAttribute("aria-label", "Skjult felt, " + where);
    btn.setAttribute("aria-disabled", view === "closed" && !state.lock ? "false" : "true");
  });
}

// ── play ───────────────────────────────────────────────────────────────────────────────────

function onFlip(index) {
  if (state.phase !== "play" || state.lock) return;
  unlockAudio();
  const result = flipTile(state.tiles, state.open, index);
  if (result.kind === "invalid") return;
  state.tiles = result.tiles;

  if (result.kind === "first") {
    state.open = index;
    sfxPlace(0);
    setStatus("");
    paintBoard();
    return;
  }

  const first = state.open;
  state.open = null;

  if (result.kind === "match") {
    state.score += 1;
    const clean = state.misses === 0;
    if (clean) {
      state.perfects += 1;
      state.combo += 1;
      sfxPerfect(state.combo);
      setStatus(state.combo >= 2 ? "Perfekt × " + state.combo + "!" : "Perfekt par!");
    } else {
      state.combo = 0;
      sfxPlace(state.score);
      setStatus("Et par!");
    }
    if (result.solved) {
      clearBoard();
      return;
    }
    paintBoard();
    paintHud();
    return;
  }

  // miss
  state.misses += 1;
  state.combo = 0;
  state.lock = true;
  paintBoard();
  paintHud();
  if (state.misses >= missLimit(state.level)) {
    setStatus("Ikke ens. Det var den sidste fejl.");
    later(endRound, OVER_DELAY_MS);
    return;
  }
  setStatus("Ikke ens. Husk hvor de lå.");
  later(() => {
    state.tiles = closePair(state.tiles, first, index);
    state.lock = false;
    paintBoard();
  }, MISS_SHOW_MS);
}

function clearBoard() {
  state.boards += 1;
  state.lock = true;
  sfxGrow();
  paintBoard();
  paintHud();
  const nextLevel = state.level + 1;
  const nextTiles = boardFor(nextLevel).pairs * 2;
  setStatus("Alle par fundet! Næste bræt har " + nextTiles + " felter.");
  later(() => {
    state.level = nextLevel;
    state.tiles = deal(state.level, state.seed);
    state.open = null;
    state.misses = 0;
    state.lock = false;
    buildBoard();
    paintHud();
    const firstBtn = state.buttons.length > 0 ? state.buttons[0] : null;
    if (firstBtn && document.activeElement && document.activeElement.classList
      && document.activeElement.classList.contains("husk-tile")) {
      firstBtn.focus();
    }
  }, NEXT_BOARD_MS);
}

function endRound() {
  if (state.phase !== "play") return;
  state.phase = "over";
  state.lock = true;
  clearTimers();
  sfxOver();
  const record = writeBest(state.score);
  paintBest();
  const title = $("husk-over-title");
  if (title) title.textContent = "For mange fejl";
  const line = $("husk-over-line");
  if (line) {
    const perfect = state.perfects > 0
      ? " " + (state.perfects === 1 ? "1 perfekt par." : state.perfects + " perfekte par.")
      : "";
    const boards = state.boards > 0 ? " og klarede " + boardsLabel(state.boards) : "";
    const news = record ? " Ny rekord!" : "";
    line.textContent = state.score === 0
      ? "Ingen par denne gang. Prøv igen — nu ved du lidt om, hvor de ligger."
      : "Du fandt " + pairsLabel(state.score) + boards + "." + perfect + news;
  }
  setScreen("over");
  $("husk-again")?.focus();
}

function startRound() {
  stopReadAloud();
  unlockAudio();
  clearTimers();
  state.round += 1;
  // A new seed every round, counted in this browser, so the board is not the same each time.
  state.seed = readCount(ROUNDS_KEY) + 1;
  writeCount(ROUNDS_KEY, state.seed);
  state.phase = "play";
  state.level = 0;
  state.tiles = deal(0, state.seed);
  state.open = null;
  state.lock = false;
  state.score = 0;
  state.perfects = 0;
  state.combo = 0;
  state.misses = 0;
  state.boards = 0;
  setScreen("play");
  setStatus("");
  buildBoard();
  paintHud();
  const firstBtn = state.buttons.length > 0 ? state.buttons[0] : null;
  if (firstBtn) firstBtn.focus();
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

  const lead = $("husk-lead");
  if (lead) attachReadAloudControl(lead, lead.textContent || "");
  paintBest();
  paintMute();

  $("husk-start")?.addEventListener("click", startRound);
  $("husk-again")?.addEventListener("click", startRound);
  $("husk-mute")?.addEventListener("click", () => {
    setMuted(!isMuted());
    unlockAudio();
    paintMute();
  });
}

main();
