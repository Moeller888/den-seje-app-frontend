// Videnkamp page boot.
// Live rounds go through get-next-question + process-event — same XP/coins as the quiz.
// Local pack is fail-soft fallback only and never writes progression.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";
import { ALL_SLOTS, baseLayersFor, isAvatarV2, blinkConfigFor } from "./avatar-layers.js";
import { mountC2Avatar, c2CosmeticLayers, markAvatarRendered } from "./avatar-render-c2.js";
import { ExpressionEngine } from "./avatar-expression-engine.js";
import { PresenceEngine } from "./avatar-presence-engine.js";
import { BlinkEngine } from "./avatar-blink-engine.js";
import { unlockKampAudio, playKamp, setKampMuted, isKampMuted } from "./kamp-audio.js";
import {
  RAID_SIZE,
  QUESTION_POOL,
  dayKey,
  pickRaidQuestions,
  gradeAnswer,
  raidVerdict,
  bossForTopic,
  normalizeLiveQuestion,
} from "./kamp-raid.js";

const HOLD_CORRECT_MS = 900;
const HOLD_INCORRECT_MS = 1700;
const HOLD_PENDING_MS = 1400;
const BEST_KEY_PREFIX = "dsj_videnkamp_best_";

function $(id) {
  return document.getElementById(id);
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readBest(isoDate) {
  try {
    const raw = localStorage.getItem(BEST_KEY_PREFIX + isoDate);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeBest(isoDate, hits) {
  const n = Number(hits);
  if (!Number.isFinite(n) || n < 0) return;
  const prev = readBest(isoDate);
  if (n <= prev) return;
  try { localStorage.setItem(BEST_KEY_PREFIX + isoDate, String(n)); } catch { /* fail-soft */ }
}

const SPARK_OFFSETS = Object.freeze([
  { x: 14, y: -30 }, { x: -18, y: -22 }, { x: 26, y: 6 },
  { x: -24, y: 10 }, { x: 8, y: -38 }, { x: -10, y: 18 },
]);

function spawnSparks(host, count) {
  if (!host || prefersReducedMotion()) return;
  const n = Math.max(0, Math.min(SPARK_OFFSETS.length, Number(count) || 0));
  for (let i = 0; i < n; i++) {
    const o = SPARK_OFFSETS[i];
    const el = document.createElement("span");
    el.className = "spark";
    el.style.setProperty("--sx", o.x + "px");
    el.style.setProperty("--sy", o.y + "px");
    host.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

function setScreen(name) {
  const root = $("kamp-root");
  if (!root) return;
  root.dataset.screen = name;
  const screens = root.querySelectorAll("[data-screen-panel]");
  for (let i = 0; i < screens.length; i++) {
    const panel = screens[i];
    const on = panel.getAttribute("data-screen-panel") === name;
    panel.hidden = !on;
  }
}

function setBoss(topic) {
  const boss = bossForTopic(topic);
  const gåde = $("kamp-gaade");
  const name = $("kamp-boss-name");
  const arena = $("kamp-arena");
  if (gåde) gåde.dataset.boss = boss.id;
  if (name) name.textContent = boss.name;
  if (arena) arena.dataset.boss = boss.id;
  if (gåde) gåde.setAttribute("aria-label", boss.name);
}

function setFighterHits(hits) {
  const gåde = $("kamp-gaade");
  if (gåde) gåde.dataset.hits = String(Math.max(0, Number(hits) || 0));
}

function flashArena(kind) {
  const arena = $("kamp-arena");
  if (!arena) return;
  arena.classList.remove("is-hit", "is-miss");
  void arena.offsetWidth;
  arena.classList.add(kind === "hit" ? "is-hit" : "is-miss");
  const clear = () => arena.classList.remove("is-hit", "is-miss");
  arena.addEventListener("animationend", clear, { once: true });
  setTimeout(clear, 700);
}

function renderOptions(question, onPick) {
  const box = $("kamp-options");
  if (!box) return;
  box.innerHTML = "";
  if (question.format === "text" || question.format === "number") {
    const input = document.createElement(question.format === "text" ? "textarea" : "input");
    if (question.format === "number") input.type = "text";
    input.className = "kamp-text";
    input.setAttribute("aria-label", "Dit svar");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kamp-option";
    btn.textContent = "Send svar";
    const send = () => {
      const raw = String(input.value ?? "").trim();
      if (!raw) return;
      onPick(raw, btn);
    };
    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (question.format === "number" || !e.shiftKey)) {
        e.preventDefault();
        send();
      }
    });
    box.appendChild(input);
    box.appendChild(btn);
    input.focus();
    return;
  }
  const options = Array.isArray(question?.options) ? question.options : [];
  for (let i = 0; i < options.length; i++) {
    const label = options[i];
    if (typeof label !== "string" || label.length === 0) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kamp-option";
    btn.textContent = label;
    btn.dataset.answer = label;
    btn.addEventListener("click", () => onPick(label, btn));
    box.appendChild(btn);
  }
  const first = box.querySelector("button");
  if (first) first.focus();
}

function disableInputs() {
  const box = $("kamp-options");
  if (!box) return;
  box.querySelectorAll("button, textarea, input").forEach((el) => { el.disabled = true; });
}

async function fetchLiveQuestion(grade, sessionQuestionCount) {
  try {
    const body = {
      session_context: { session_question_count: sessionQuestionCount },
      selected_grade: grade,
      current_difficulty_band: 2,
    };
    let { data, error } = await supabase.functions.invoke("get-next-question", { body });
    if (error) {
      ({ data, error } = await supabase.functions.invoke("get-next-question", { body: {} }));
    }
    if (error) return null;
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    return normalizeLiveQuestion(parsed);
  } catch (e) {
    console.warn("KAMP LIVE FETCH FAILED:", e);
    return null;
  }
}

async function submitLive(studentId, instanceId, answer, shownAt) {
  if (!studentId || !instanceId) return null;
  try {
    const { data, error } = await supabase.functions.invoke("process-event", {
      body: {
        student_id: studentId,
        question_instance_id: instanceId,
        answer,
        question_shown_at: shownAt,
      },
    });
    if (error || !data || !data.status) return null;
    return data;
  } catch (e) {
    console.warn("KAMP LIVE SUBMIT FAILED:", e);
    return null;
  }
}

async function readProgress(userId) {
  try {
    const { data } = await supabase
      .from("student_progress")
      .select("xp, coins")
      .eq("student_id", userId)
      .maybeSingle();
    return { xp: data?.xp ?? 0, coins: data?.coins ?? 0 };
  } catch {
    return { xp: 0, coins: 0 };
  }
}

function paintCoins(coins) {
  const el = $("kamp-coins");
  if (!el) return;
  const n = Number(coins);
  el.textContent = Number.isFinite(n) ? String(n) + " 🪙" : "—";
}

async function mountAvatar(userId) {
  const avatarEl = $("kamp-avatar");
  if (!avatarEl || !userId) return null;

  const [profileResult, shopResult] = await Promise.all([
    supabase.from("profiles").select("equipped_slots, avatar_gender, avatar_identity, selected_grade").eq("id", userId).maybeSingle(),
    supabase.from("shop_items").select("id, image_url, rarity, slot_type"),
  ]);

  const identity = profileResult.data?.avatar_identity ?? null;
  const gender = profileResult.data?.avatar_gender ?? "neutral";
  const equippedSlots = profileResult.data?.equipped_slots ?? {};
  const allShopItems = Array.isArray(shopResult.data) ? shopResult.data : [];
  const showcase = $("kamp-avatar-wrap");
  if (showcase) showcase.dataset.gender = gender;

  let exprEngine = null;
  let presenceEngine = null;

  function initLife(el) {
    if (!el) return;
    const r2Active = el.dataset.avatarRenderPath === "r2";
    try {
      exprEngine = r2Active
        ? new ExpressionEngine(el, { r2: true })
        : new ExpressionEngine(el);
    } catch (e) { console.warn("KAMP EXPR INIT FAILED:", e); }
    try { presenceEngine = new PresenceEngine(el); } catch (e) { console.warn("KAMP PRESENCE INIT FAILED:", e); }
    const blinkCfg = blinkConfigFor(identity, r2Active);
    if (blinkCfg.allowed) {
      try { new BlinkEngine(el, blinkCfg.skinTone, { mode: blinkCfg.mode }); } catch (e) { console.warn("KAMP BLINK INIT FAILED:", e); }
    }
  }

  if (isAvatarV2()) {
    const cosmetics = c2CosmeticLayers(equippedSlots, (id) => allShopItems.find((i) => i.id === id)?.image_url);
    const path = await mountC2Avatar(avatarEl, identity, { layerClass: "quiz-avatar-layer", cosmetics });
    if (path === "aborted") return { exprEngine, presenceEngine, grade: profileResult.data?.selected_grade ?? null };
    initLife(avatarEl);
    await markAvatarRendered(avatarEl);
    return { exprEngine, presenceEngine, grade: profileResult.data?.selected_grade ?? null };
  }

  avatarEl.innerHTML = "";
  const layers = [...baseLayersFor(identity)];
  ALL_SLOTS.forEach((slot) => {
    const itemId = equippedSlots[slot];
    if (!itemId) return;
    const item = allShopItems.find((i) => i.id === itemId);
    if (!item?.image_url) return;
    layers.push({ src: item.image_url, z: slot === "aura" ? -2 : slot === "back" ? -1 : 8, slot });
  });
  layers.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer?.src) continue;
    const img = document.createElement("img");
    img.src = layer.src;
    img.alt = "";
    img.className = "quiz-avatar-layer";
    img.style.zIndex = String(layer.z ?? 1);
    avatarEl.appendChild(img);
  }
  initLife(avatarEl);
  return { exprEngine, presenceEngine, grade: profileResult.data?.selected_grade ?? null };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootRaid(ctx) {
  const iso = dayKey(new Date());
  const localRaid = pickRaidQuestions(iso, QUESTION_POOL, RAID_SIZE);
  let localIndex = 0;
  const state = {
    iso,
    index: 0,
    hits: 0,
    combo: 0,
    comboMax: 0,
    locked: false,
    liveRounds: 0,
    coinsStart: ctx.coins ?? 0,
    coinsNow: ctx.coins ?? 0,
    sessionCorrectStreak: 0,
  };

  unlockKampAudio();
  playKamp("start");
  setScreen("fight");
  setFighterHits(0);

  function nextLocal() {
    if (localIndex >= localRaid.length) return null;
    const q = localRaid[localIndex];
    localIndex += 1;
    return q ? { ...q, live: false, format: "mc" } : null;
  }

  function paintHud(q) {
    const roundEl = $("kamp-round");
    const comboEl = $("kamp-combo");
    const topicEl = $("kamp-topic");
    if (roundEl) roundEl.textContent = "Slag " + Math.min(state.index + 1, RAID_SIZE) + " af " + RAID_SIZE;
    if (comboEl) {
      comboEl.textContent = state.combo > 1 ? "Kæde ×" + state.combo : "Kæde";
      comboEl.hidden = state.combo < 2;
    }
    if (topicEl) topicEl.textContent = q?.topic ?? "";
    setBoss(q?.topic);
    setFighterHits(state.hits);
    paintCoins(state.coinsNow);
  }

  function ask(q) {
    return new Promise((resolve) => {
      const prompt = $("kamp-prompt");
      const feedback = $("kamp-feedback");
      state.locked = false;
      if (prompt) prompt.textContent = q.prompt;
      if (feedback) {
        feedback.textContent = "";
        feedback.className = "kamp-feedback";
      }
      paintHud(q);
      const shownAt = Date.now();
      renderOptions(q, (answer, btn) => {
        if (state.locked) return;
        state.locked = true;
        disableInputs();
        resolve({ answer, btn, shownAt });
      });
    });
  }

  function markCorrect(btn) {
    state.hits += 1;
    state.combo += 1;
    if (state.combo > state.comboMax) state.comboMax = state.combo;
    state.sessionCorrectStreak += 1;
    if (btn) btn.classList.add("is-correct");
    const feedback = $("kamp-feedback");
    if (feedback) {
      feedback.textContent = state.combo >= 3 ? "Kerne ramt. Kæden holder." : "Kerne ramt.";
      feedback.className = "kamp-feedback is-correct";
    }
    playKamp("hit", state.combo);
    ctx.engines?.exprEngine?.onGameEvent("CORRECT");
    ctx.engines?.presenceEngine?.onGameEvent("CORRECT");
    flashArena("hit");
    spawnSparks($("kamp-gaade"), 3 + Math.min(3, state.combo));
  }

  function markWrong(btn, correctLabel) {
    state.combo = 0;
    state.sessionCorrectStreak = 0;
    if (btn) btn.classList.add("is-wrong");
    if (correctLabel) {
      $("kamp-options")?.querySelectorAll("button").forEach((b) => {
        if (b.dataset.answer === correctLabel) b.classList.add("is-reveal");
      });
    }
    const feedback = $("kamp-feedback");
    if (feedback) {
      feedback.textContent = correctLabel
        ? "Næsten. Det rigtige er " + correctLabel + "."
        : "Næsten — husk det til næste gang.";
      feedback.className = "kamp-feedback is-wrong";
    }
    playKamp("miss");
    ctx.engines?.exprEngine?.onGameEvent("INCORRECT");
    ctx.engines?.presenceEngine?.onGameEvent("INCORRECT");
    flashArena("miss");
  }

  for (let i = 0; i < RAID_SIZE; i++) {
    state.index = i;
    let q = await fetchLiveQuestion(ctx.grade, i);
    if (!q || q.step === "no_questions") q = nextLocal();
    if (!q) break;

    const pick = await ask(q);
    let outcome = "incorrect";
    let correctLabel = q.correct;

    if (q.live && q.instanceId) {
      const live = await submitLive(ctx.userId, q.instanceId, pick.answer, pick.shownAt);
      if (live) {
        state.liveRounds += 1;
        outcome = live.status;
        if (typeof live.correct_answer === "string") correctLabel = live.correct_answer;
        const progress = await readProgress(ctx.userId);
        state.coinsNow = progress.coins;
        if (live.status === "correct") {
          if (state.sessionCorrectStreak + 1 >= 5) {
            supabase.rpc("update_best_session_streak", { p_count: state.sessionCorrectStreak + 1 }).then(() => {}, () => {});
          }
          if (new Date().getHours() < 4) {
            supabase.rpc("set_night_correct").then(() => {}, () => {});
          }
        }
      } else {
        outcome = gradeAnswer(q, pick.answer) ? "correct" : "incorrect";
      }
    } else {
      outcome = gradeAnswer(q, pick.answer) ? "correct" : "incorrect";
    }

    if (outcome === "correct") markCorrect(pick.btn);
    else if (outcome === "pending") {
      const feedback = $("kamp-feedback");
      if (feedback) {
        feedback.textContent = "Gåden lytter. Læreren tager den.";
        feedback.className = "kamp-feedback";
      }
      playKamp("end");
    } else {
      markWrong(pick.btn, correctLabel);
    }

    paintHud(q);
    await wait(outcome === "correct" ? HOLD_CORRECT_MS : (outcome === "pending" ? HOLD_PENDING_MS : HOLD_INCORRECT_MS));
  }

  writeBest(state.iso, state.hits);
  const verdict = raidVerdict(state.hits, RAID_SIZE);
  const title = $("kamp-result-title");
  const line = $("kamp-result-line");
  const score = $("kamp-result-score");
  const chain = $("kamp-result-chain");
  const best = $("kamp-result-best");
  const coinsLine = $("kamp-result-coins");
  if (title) title.textContent = verdict.title;
  if (line) line.textContent = verdict.line;
  if (score) score.textContent = state.hits + " / " + RAID_SIZE + " kerner";
  if (chain) {
    chain.textContent = state.comboMax >= 2 ? "Længste kæde: ×" + state.comboMax : "";
    chain.hidden = state.comboMax < 2;
  }
  const bestHits = readBest(state.iso);
  if (best) best.textContent = "Dagens bedste: " + bestHits + " / " + RAID_SIZE;
  const coinDelta = Math.max(0, state.coinsNow - state.coinsStart);
  if (coinsLine) {
    if (state.liveRounds === 0) {
      coinsLine.textContent = "Træning — quizzen var optaget, så dette raid gav ikke mønter.";
    } else if (coinDelta > 0) {
      coinsLine.textContent = "+" + coinDelta + " mønter";
    } else {
      coinsLine.textContent = "Rundene er skrevet i spillet.";
    }
  }
  paintCoins(state.coinsNow);
  setFighterHits(state.hits);
  playKamp(verdict.id === "open" || verdict.id === "yield" ? "open" : "end");
  setScreen("result");
  $("kamp-again")?.focus();
}

async function main() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.replace("login.html");
    return;
  }

  const userId = sessionData.session.user.id;
  loadTheme().catch(() => {});

  window.addEventListener("pageshow", async (event) => {
    if (event.persisted) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) window.location.replace("login.html");
    }
  });

  $("kamp-back")?.addEventListener("click", () => { window.location.href = "spil.html"; });
  $("kamp-to-quiz")?.addEventListener("click", () => { window.location.href = "index.html"; });
  $("kamp-to-hub")?.addEventListener("click", () => { window.location.href = "hub.html"; });

  const muteBtn = $("kamp-mute");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      setKampMuted(!isKampMuted());
      muteBtn.textContent = isKampMuted() ? "Lyd på" : "Lyd fra";
      muteBtn.setAttribute("aria-pressed", isKampMuted() ? "true" : "false");
    });
  }

  const bestEl = $("kamp-intro-best");
  const iso = dayKey(new Date());
  const best = readBest(iso);
  if (bestEl) {
    bestEl.textContent = best > 0 ? "Dagens bedste: " + best + " / " + RAID_SIZE : "Syv slag. Rigtige svar tæller som i spillet.";
  }

  let engines = null;
  let grade = null;
  try {
    const mounted = await mountAvatar(userId);
    engines = mounted;
    grade = mounted?.grade ?? null;
  } catch (e) {
    console.warn("KAMP AVATAR FAILED:", e);
  }

  const progress = await readProgress(userId);
  paintCoins(progress.coins);

  const start = async () => {
    const fresh = await readProgress(userId);
    paintCoins(fresh.coins);
    bootRaid({ engines, userId, grade, coins: fresh.coins }).catch((err) => {
      console.error("KAMP RAID FAILED:", err);
    });
  };
  $("kamp-start")?.addEventListener("click", start);
  $("kamp-again")?.addEventListener("click", start);

  setScreen("intro");
}

if (typeof document !== "undefined" && document.getElementById("kamp-root")) {
  main().catch((err) => {
    console.error("KAMP BOOT FAILED:", err);
    const root = document.getElementById("kamp-root");
    if (root) {
      root.innerHTML = "<p class='kamp-boot-error'>Videnkamp kunne ikke starte. Gå tilbage til hubben.</p>";
    }
  });
}
