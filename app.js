import { supabase } from "./supabaseClient.js";
import { calculateLevelFromXP, getXPProgressInLevel } from "./js/progression.js";
import { playSound } from "./js/audio.js";
import { ALL_SLOTS, SLOT_Z, baseLayersFor, baseSrcFor, hairSrcFor, isAvatarV2, r2ExpressionOverlayAllowedFor, blinkConfigFor } from "./js/avatar-layers.js";
// D-195: the framing flag is read through a NAMESPACE import. A named import of an export the served
// avatar-layers.js lacks (an older cached copy during a deploy) is a module SyntaxError that would stop
// this whole script; through the namespace a missing export is just undefined → framing stays off.
import * as avatarLayersModule from "./js/avatar-layers.js";
import { mountC2Avatar, c2CosmeticLayers, markAvatarRendered } from "./js/avatar-render-c2.js";
import { ExpressionEngine } from "./js/avatar-expression-engine.js";
import { PresenceEngine } from "./js/avatar-presence-engine.js";
import { BlinkEngine } from "./js/avatar-blink-engine.js";
import { initMonitoring, captureError } from "./js/sentry.js";
import { attachOcrControl } from "./js/ocr/adapters/answer-capture.js";
import { prepareChoiceOptions } from "./js/answer-options.js";
import { ANSWER_RENDERERS, resolveAnswerRenderer, buildShortTextAnswer, shortTextCorrection } from "./js/answer-input.js";
import { buildMatchPairsAnswer, matchCorrectionText, readMatchLayout } from "./js/match-pairs.js";
import { buildOrderAnswer, orderCorrectionText, readOrderLayout } from "./js/order-items.js";
import { readStimulus, buildStimulus } from "./js/stimulus.js";
import { buildTrueFalseAnswer, readTrueFalseContent, trueFalseCorrection } from "./js/true-false.js";
import { buildNumberAnswer } from "./js/number-answer.js";
import { initAnalytics, track } from "./js/analytics.js";
import { maybeShowConsentBanner } from "./js/analytics-consent.js";
import { attachReadAloudControl, attachOptionReadAloudControl, stopReadAloud } from "./js/read-aloud/adapters/quiz.js";
import { installFlagDiagnostics } from "./js/flags.js";
// H5 PR 4 (D-266, D-273): OFF by default and not switchable from the browser — see the module header.
import {
  isH5SubmissionsEnabled, isH5Eligible, createSubmission, savePending, persistAndVerify, loadPending, clearPending,
  blockRecord, h5RequestBody, classifyResponse, isClientOutdatedError,
  REFUSAL_TEXT, UNCERTAIN_TEXT, CLIENT_OUTDATED_TEXT, MISSING_ROUND_TEXT, STORAGE_TEXT, INCOMPATIBLE_TEXT,
} from "./js/answer-submission.js";
// Anti-gætte-pause: the server enforces it; this only shows it (js/quiz-cooldown.js).
import {
  COOLDOWN_TEXT, cooldownFromServer, createCountdown, formatRemaining, cooldownFromInvokeError, fetchCooldownStatus,
  openCooldownChannel, announceCooldown,
} from "./js/quiz-cooldown.js";

window.__sb = supabase;

// Feature-flag diagnostics (157R). Read-only; exposes window.__flags() for ops. Fail-soft.
installFlagDiagnostics();

// Error monitoring (157B). No-op unless ENABLE_SENTRY + a DSN are configured; fail-soft.
initMonitoring({ tags: { avatar_v2: isAvatarV2() } });

// Analytics (157D/157E). No-op unless enabled + consented; banner only when configured. Fail-soft.
initAnalytics();
maybeShowConsentBanner();

const DEBUG = true;
const GRADE_START_BAND = { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3 };
let uiState = "IDLE";

function logEvent(event, payload = {}) {
  if (!DEBUG) return;
  console.log("[APP EVENT]", {
    timestamp: new Date().toISOString(),
    state: uiState,
    event,
    ...payload
  });
}

function logError(event, error) {
  console.error("[APP ERROR]", {
    timestamp: new Date().toISOString(),
    state: uiState,
    event,
    error
  });
  // 157B: additively forward to error monitoring. No-op when disabled; never throws.
  captureError(event, error, { state: uiState });
}

const UI_STATES = {
  IDLE: "IDLE",
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
  SUBMITTING_ANSWER: "SUBMITTING_ANSWER",
  REFLECTING: "REFLECTING",
  TRANSITIONING: "TRANSITIONING",
  // Anti-gætte-pause: the server refused answers for a while. Left only by "Fortsæt quizzen"
  // (→ LOADING_QUESTION), which is enabled when the countdown reaches 00:00.
  COOLDOWN: "COOLDOWN"
};

function setState(newState) {
  const allowed = {
    IDLE: ["LOADING_QUESTION", "COOLDOWN"],
    LOADING_QUESTION: ["AWAITING_ANSWER"],
    AWAITING_ANSWER: ["SUBMITTING_ANSWER", "COOLDOWN"],
    SUBMITTING_ANSWER: ["TRANSITIONING", "AWAITING_ANSWER", "REFLECTING", "COOLDOWN"],
    REFLECTING: ["TRANSITIONING"],
    TRANSITIONING: ["LOADING_QUESTION", "COOLDOWN"],
    COOLDOWN: ["LOADING_QUESTION"]
  };

  if (!allowed[uiState]?.includes(newState)) {
    logError("INVALID_STATE_TRANSITION", { from: uiState, to: newState });
    return;
  }

  uiState = newState;
  logEvent("STATE_CHANGED", { to: newState });
  exprEngine?.onStateChange(newState);
  presenceEngine?.onStateChange(newState);
  blinkEngine?.onStateChange(newState);
}

function setUIState(newState) {
  setState(newState);

  const map = {
    LOADING_QUESTION: "loading",
    AWAITING_ANSWER: "ready",
    TRANSITIONING: "loading",
    SUBMITTING_ANSWER: "loading",
    REFLECTING: "reflecting",
    COOLDOWN: "cooldown"
  };

  const domState = map[newState];
  if (domState) {
    const el = document.getElementById("question");
    if (el) el.dataset.state = domState;
  }
}

// D-347 spillepauser: the module is loaded on demand and FAIL-SOFT. If it cannot load (an older
// deployment, a network error), every break check answers "no break" and the quiz runs exactly as before.
let minigameBreakModule = null;
function loadMinigameBreak() {
  if (!minigameBreakModule) {
    minigameBreakModule = import("./js/minigame-break.js").catch((e) => {
      logError("MINIGAME_BREAK_MODULE_UNAVAILABLE", e);
      return null;
    });
  }
  return minigameBreakModule;
}
// How long the quiz waits for the server's break answer before loading the next question anyway. A late
// offer is not lost: the server shows the same waiting offer after the next answer.
const MINIGAME_BREAK_WAIT_MS = 4000;

let exprEngine    = null;
let presenceEngine = null;
let blinkEngine   = null;

let studentId = null;
let currentInstanceId = null;
// H5: the round the server issued with the question on screen, and its answer type (long answers keep
// the teacher path). Only read when H5 is on.
let currentRoundNo = null;
let currentAnswerType = null;
let questionShownAt = null;
let lastKnownXp = 0;
let lastKnownCoins = 0;

// sessionStorage, or null where the browser blocks it (the accessor itself can throw).
function safeSessionStorage() {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch (_e) { return null; }
}

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace("login.html");
    return false;
  }

  studentId = sessionData.session.user.id;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !profile || profile.role !== "student") {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return false;
  }

  return true;
}

window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.replace("login.html");
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {

  const authorized = await checkAuthAndRole();
  if (!authorized) return;

  const questionElement = document.getElementById("question");
  const stimulusElement = document.getElementById("stimulus");
  const optionsContainer = document.getElementById("options");
  const feedback = document.getElementById("feedback");
  const reviewFeedback = document.getElementById("review-feedback");
  const reflectionContinue = document.getElementById("reflection-continue");
  const levelEl = document.getElementById("level");
  const xpEl = document.getElementById("xp");
  const coinsEl = document.getElementById("coins");
  const logoutBtn = document.getElementById("logout-btn");

  logoutBtn.onclick = async () => {
    // H5: a pending submission belongs to this pupil only (a no-op when there is none / H5 is off).
    clearPending(safeSessionStorage());
    await supabase.auth.signOut();
    window.location.replace("login.html");
  };

  // H5: signing out — here or in another tab — or a different pupil signing in drops this tab's
  // pending submission. The pupil binding in loadPending() is the second line of defence.
  try {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== studentId)) {
        clearPending(safeSessionStorage());
      }
    });
  } catch (_e) { /* fail-soft: the pupil binding still applies */ }

  // Hidden achievement tracking — session-scoped, resets on page load.
  let sessionCorrectStreak = 0;
  let bestSessionStreak    = 0;

  // Challenge-wave state machine — session-scoped, drives adaptive sequencing.
  // Resets on page load. No persistent student state — purely local pacing.
  let sessionWavePhase = 'challenge';
  let sessionConsecutiveCorrect = 0;
  let sessionConsecutiveIncorrect = 0;
  let lastMisconceptionType = null;
  // Renderer of the question on screen — "stav til" feedback names the spelling (see submitAnswer).
  let currentRenderer = null;
  // The Match par control on screen, so the graded response can mark its connections.
  let currentMatchControl = null;
  // Rækkefølge: the control on screen, so a wrong answer can be explained in the shown texts.
  let currentOrderControl = null;

  // Session rhythm tracking — Section 55.
  // sessionQuestionCount: total answered this session, passed to get-next-question.
  // sessionConsecutiveReflections: consecutive reflection states entered;
  //   gate fires at >= 2 to prevent reflection fatigue in losing streaks.
  let sessionQuestionCount = 0;
  let sessionConsecutiveReflections = 0;

  // Grade + adaptive difficulty state — Section 70.
  let selectedGrade = null;
  let currentDifficultyBand = 2;
  let placementBand = null;  // one-time assessment result, never overwritten
  let persistedBand = null;  // earned level, updated every 10 questions
  let activeDomains = null;  // teacher-assigned domain filter (null = all domains)

  // Subject (fag) chosen on spil.html via ?fag=historie|engelsk|dansk. Unknown/missing = historie.
  const SUBJECT_LABEL = { engelsk: "Engelsk", dansk: "Dansk" };
  const fagParam = new URLSearchParams(window.location.search).get("fag");
  const currentSubject = fagParam === "engelsk" ? "engelsk"
    : fagParam === "dansk" ? "dansk"
    : "historie";
  let diffConsecutiveCorrect = 0;
  let diffConsecutiveIncorrect = 0;

  function updateWavePhase(wasCorrect) {
    if (wasCorrect) {
      sessionConsecutiveIncorrect = 0;
      sessionConsecutiveCorrect++;
      if (sessionWavePhase === 'recovery' && sessionConsecutiveCorrect >= 3) {
        sessionWavePhase = 'challenge';
        sessionConsecutiveCorrect = 0;
      } else if (sessionWavePhase === 'reinforcement' && sessionConsecutiveCorrect >= 2) {
        sessionWavePhase = 'challenge';
        sessionConsecutiveCorrect = 0;
      } else if (sessionWavePhase === 'challenge' && sessionConsecutiveCorrect >= 4) {
        sessionWavePhase = 'deep_challenge';
      }
    } else {
      sessionConsecutiveCorrect = 0;
      sessionConsecutiveIncorrect++;
      if (sessionConsecutiveIncorrect >= 2) {
        sessionWavePhase = 'recovery';
      } else if (sessionWavePhase === 'deep_challenge' || sessionWavePhase === 'challenge') {
        sessionWavePhase = 'reinforcement';
      }
    }
    logEvent('WAVE_PHASE', { phase: sessionWavePhase, cc: sessionConsecutiveCorrect, ci: sessionConsecutiveIncorrect });
  }

  function adjustDifficultyBand(wasCorrect) {
    if (wasCorrect) {
      diffConsecutiveIncorrect = 0;
      diffConsecutiveCorrect++;
      if (diffConsecutiveCorrect >= 3 && currentDifficultyBand < 5) {
        currentDifficultyBand++;
        diffConsecutiveCorrect = 0;
        logEvent("DIFFICULTY_BAND_UP", { band: currentDifficultyBand });
      }
    } else {
      diffConsecutiveCorrect = 0;
      diffConsecutiveIncorrect++;
      if (diffConsecutiveIncorrect >= 2 && currentDifficultyBand > 1) {
        currentDifficultyBand--;
        diffConsecutiveIncorrect = 0;
        logEvent("DIFFICULTY_BAND_DOWN", { band: currentDifficultyBand });
      }
    }
  }

  // ── Placement assessment system ────────────────────────────────────────
  // NOT STARTED ANY MORE (D-356): a new pupil goes straight to the quiz at GRADE_START_BAND. Only
  // loadAdaptiveBands and persistCurrentBand below are still in use; a band a pupil got from the
  // test earlier is still honoured. runPlacementFlow was: 10 questions across bands 1-4 (no XP, no
  // question_instances created) that seeded the starting difficulty.
  // SERVER-OWNED (answer keys server-side, E1): start_placement() picks the questions and
  // returns display data only — never the answer — and submit_placement() grades the chosen
  // answers once, writes profiles.placement_band and returns only the band. The browser
  // never reads the questions table and never sees or stores a key.

  async function loadAdaptiveBands() {
    const { data } = await supabase
      .from("profiles")
      .select("placement_band, current_band")
      .eq("id", studentId)
      .maybeSingle();
    placementBand = data?.placement_band ?? null;
    persistedBand = data?.current_band ?? null;
  }

  // The placement set for this pupil, chosen server-side (3 band-1, 3 band-2, 2 band-3, 2 band-4;
  // history MC within the pupil's grade). An open session is reused, so a refresh shows the same
  // questions. Each item is { id, question, options, difficulty_band } — display data only.
  async function fetchPlacementQuestions() {
    const { data, error } = await supabase.rpc("start_placement");
    if (error) {
      logError("PLACEMENT_START_ERROR", error);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.filter((q) =>
      q && typeof q.id === "string"
      && typeof q.question === "string" && q.question.trim().length > 0
      && Array.isArray(q.options) && q.options.length >= 2);
  }

  // Grades the chosen answers server-side (once per session) and returns the band 1-4, or null.
  // The old browser-side scoring rule (band N correct = N points; >= 18/12/6 → 4/3/2, else 1)
  // lives unchanged in submit_placement, which also writes profiles.placement_band.
  async function submitPlacement(answers) {
    const { data, error } = await supabase.rpc("submit_placement", { p_answers: answers });
    if (error) {
      logError("PLACEMENT_SUBMIT_ERROR", error);
      return null;
    }
    return Number.isInteger(data) && data >= 1 && data <= 4 ? data : null;
  }

  // Persist the adaptive engine's current band to profiles.current_band.
  // Called every 10 answered questions (fire-and-forget — non-blocking).
  // On next login, current_band takes priority over placement_band so the
  // student resumes at their earned level rather than their initial placement.
  function persistCurrentBand() {
    supabase
      .from("profiles")
      .update({ current_band: currentDifficultyBand })
      .eq("id", studentId)
      .then(({ error }) => {
        if (error) logError("PERSIST_BAND_ERROR", error);
        else logEvent("BAND_PERSISTED", { band: currentDifficultyBand, after_q: sessionQuestionCount });
      });
  }

  async function runPlacementFlow() {
    return new Promise(async (resolve) => {
      const overlay    = document.getElementById("placement-overlay");
      const questionEl = document.getElementById("placement-question");
      const optionsEl  = document.getElementById("placement-options");
      const progressBar = document.getElementById("placement-progress-bar");
      const countEl    = document.getElementById("placement-count");

      if (!overlay || !questionEl || !optionsEl || !progressBar || !countEl) {
        resolve();
        return;
      }

      const questions = await fetchPlacementQuestions();

      if (!questions || questions.length < 5) {
        logEvent("PLACEMENT_SKIPPED", { reason: "insufficient_questions", count: questions?.length ?? 0 });
        resolve();
        return;
      }

      overlay.style.display = "flex";

      // Only what the pupil chose — never a verdict; the server grades.
      const answers = [];
      const total = questions.length;

      for (let i = 0; i < total; i++) {
        const q = questions[i];

        const questionText = q.question;

        progressBar.style.width = ((i / total) * 100) + "%";
        countEl.textContent = (i + 1) + " / " + total;
        stopReadAloud();
        questionEl.textContent = questionText;
        attachReadAloudControl(questionEl, questionText);

        const options = [...q.options].sort(() => Math.random() - 0.5);

        optionsEl.innerHTML = "";

        const chosen = await new Promise((resolveAnswer) => {
          options.forEach((opt) => {
            const row = document.createElement("div");
            row.className = "option-row";
            const btn = document.createElement("button");
            btn.className = "placement-option-btn";
            btn.textContent = opt;
            btn.onclick = () => {
              optionsEl.querySelectorAll(".placement-option-btn").forEach((b) => { b.disabled = true; });
              btn.classList.add("placement-selected");
              setTimeout(() => resolveAnswer(opt), 500);
            };
            row.appendChild(btn);
            attachOptionReadAloudControl(row, typeof opt === "string" ? opt : "");
            optionsEl.appendChild(row);
          });
        });

        answers.push({ question_id: q.id, answer: chosen });
      }

      progressBar.style.width = "100%";

      const band = await submitPlacement(answers);
      stopReadAloud();
      optionsEl.innerHTML = "";
      countEl.textContent = "";

      if (band === null) {
        // Fail loud, not stuck: the pupil starts at the grade's default band and placement is
        // offered again on the next login (the open server session is reused).
        logEvent("PLACEMENT_SUBMIT_FAILED", { answered: answers.length });
        questionEl.textContent = "Vi kunne ikke gemme dit udgangspunkt — du starter på dit klassetrin.";
      } else {
        placementBand = band;
        logEvent("PLACEMENT_COMPLETE", { band, answered: answers.length });
        questionEl.textContent = "Klar! Vi starter dig det rigtige sted.";
      }

      await new Promise((r) => setTimeout(r, 1100));
      overlay.style.display = "none";
      resolve();
    });
  }

  // ── End placement system ───────────────────────────────────────────────

  // Load teacher-assigned domain filter and update the domain focus indicator.
  const DOMAIN_LABEL = {
    prehistoric_denmark:   "Forhistorisk Danmark",
    vikings:               "Vikingerne",
    middle_ages:           "Middelalderen",
    reformation_monarchy:  "Reformation & Monarki",
    enlightenment:         "Oplysningstiden",
    revolutions_democracy: "Revolutioner & Demokrati",
    industrialisation:     "Industrialisering",
    world_war_1:           "1. Verdenskrig",
    world_war_2:           "2. Verdenskrig",
    cold_war:              "Den Kolde Krig",
    democracy_power:       "Demokrati & Magt",
    english:               "Engelsk",
    danish:                "Dansk",
  };

  async function loadActiveDomains() {
    const { data } = await supabase
      .from("profiles")
      .select("active_domains")
      .eq("id", studentId)
      .maybeSingle();

    const raw = data?.active_domains ?? null;
    activeDomains = Array.isArray(raw) && raw.length > 0 ? raw : null;

    const bar  = document.getElementById("domain-focus-bar");
    const text = document.getElementById("domain-focus-text");
    if (!bar || !text) return;

    if (currentSubject === "engelsk" || currentSubject === "dansk") {
      // Teacher's history learning journey does not apply to English or Danish.
      text.textContent = "Fag: " + SUBJECT_LABEL[currentSubject];
      bar.style.display = "block";
    } else if (activeDomains !== null) {
      const names = activeDomains.map(d => DOMAIN_LABEL[d] ?? d).join("  ·  ");
      text.textContent = "Læringsrejse: " + names;
      bar.style.display = "block";
    } else {
      bar.style.display = "none";
    }
  }

  async function fetchProgress() {
    const { data } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle();

    if (data) {
      lastKnownXp = data.xp ?? 0;
      lastKnownCoins = data.coins ?? 0;

      const { level, progress } = getXPProgressInLevel(lastKnownXp);

      xpEl.textContent = lastKnownXp;
      coinsEl.textContent = lastKnownCoins;
      levelEl.textContent = level;

      const xpBar = document.getElementById("xp-bar");
      xpBar.style.width = (progress * 100) + "%";

      logEvent("PROGRESS_FETCHED", { xp: lastKnownXp, level });
    }
  }

  async function fetchAvatar() {
    const avatarDisplay = document.getElementById("avatar-display");
    if (!avatarDisplay) return;

    avatarDisplay.innerHTML = "";

    // Section 155G: C2 render pipeline behind AVATAR_V2 (default OFF). Base + hair
    // via the shared module; cosmetics are deferred to a later C2 section. This
    // function is awaited before the blink engine is created, so the C2 base is
    // present when blink initialises.
    if (isAvatarV2()) {
      const { data: pd } = await supabase
        .from("profiles")
        .select("avatar_identity, equipped_slots")
        .eq("id", studentId)
        .maybeSingle();
      const eqSlots = pd?.equipped_slots ?? {};
      const eqIds = Object.values(eqSlots).filter(Boolean);
      const srcById = {};
      if (eqIds.length > 0) {
        const { data: items } = await supabase
          .from("shop_items")
          .select("id, image_url")
          .in("id", eqIds);
        (items ?? []).forEach(it => { if (it.image_url) srcById[it.id] = it.image_url; });
      }
      const cosmetics = c2CosmeticLayers(eqSlots, id => srcById[id] ?? null);
      // D-195/D-196: shared upper-body framing, only with the flag (default OFF → no class) and only when
      // no wide-slot item (wings, capes) is mounted. Decided from the cosmetics actually mounted, before
      // any layer mounts. Namespace guard: an older avatar-layers.js without the function → no framing.
      if (typeof avatarLayersModule.avatarFramingOnFor === "function") avatarDisplay.classList.toggle(avatarLayersModule.AVATAR_FRAMING_CLASS, avatarLayersModule.avatarFramingOnFor(Object.fromEntries(cosmetics.map((c) => [c.slot, true]))) === true);
      const renderPath = await mountC2Avatar(avatarDisplay, pd?.avatar_identity ?? null, { layerClass: "quiz-avatar-layer", cosmetics, surface: "quiz" });
      if (renderPath === "aborted") return; // a newer render superseded this one
      // PR D: re-apply the full blink profile (mode + tone) so the lids always
      // match the render path this re-render actually took (R2 active vs C2).
      // F1: key off the ACTUAL mounted path, so an R2 asset-load fallback uses C2 lids.
      if (blinkEngine) blinkEngine.setProfile(blinkConfigFor(pd?.avatar_identity ?? null, renderPath === "r2"));
      // On the FIRST load the expression/blink overlays are attached only after this
      // function is awaited (see the life-engine init below), so the first-load signal
      // is set there. On a later re-render the engines already exist, so mark here once
      // the re-rendered composite has decoded.
      if (exprEngine || blinkEngine) await markAvatarRendered(avatarDisplay);
      return;
    }

    // Identity base (body + hair) always visible — render immediately
    // (no network wait). Section 152B: hair is a separate identity layer.
    let base = null;
    let hairImg = null;
    baseLayersFor(null).forEach(layer => {
      const img = document.createElement("img");
      img.className = layer.isBase
        ? "quiz-avatar-layer avatar-slot-base"
        : "quiz-avatar-layer avatar-slot-hair";
      img.src = layer.src;
      img.style.zIndex = String(layer.z);
      img.alt = "";
      avatarDisplay.appendChild(img);
      if (layer.isBase) base = img;
      else hairImg = img;
    });
    if (!base) return;

    // Load equipped slots + identity from profiles
    const { data: profileData } = await supabase
      .from("profiles")
      .select("equipped_slots, avatar_identity")
      .eq("id", studentId)
      .maybeSingle();

    // Section 152A/152B: resolve base + hair per identity once the profile is
    // loaded. Both resolve to the shared files until 152C — no-op today, so
    // the instant render above stays correct.
    base.src = baseSrcFor(profileData?.avatar_identity ?? null);
    if (hairImg) hairImg.src = hairSrcFor(profileData?.avatar_identity ?? null);
    // Section 152E: align the blink eyelid fill with the resolved skin tone
    // (PR D: via the full profile so mode always matches the render path).
    if (blinkEngine) blinkEngine.setProfile(blinkConfigFor(profileData?.avatar_identity ?? null));

    const equippedSlots = profileData?.equipped_slots ?? {};
    const equippedIds = Object.values(equippedSlots).filter(Boolean);

    if (equippedIds.length === 0) return;

    // Load image_url for each equipped item
    const { data: shopItems } = await supabase
      .from("shop_items")
      .select("id, image_url, slot_type")
      .in("id", equippedIds);

    if (!shopItems) return;

    ALL_SLOTS.forEach(slot => {
      const itemId = equippedSlots[slot];
      if (!itemId) return;
      const item = shopItems.find(i => i.id === itemId);
      if (!item || !item.image_url) return;

      const z = SLOT_Z[slot] ?? 1;
      const img = document.createElement("img");
      img.className = `quiz-avatar-layer avatar-slot-${slot}`;
      img.src = item.image_url;
      img.style.zIndex = String(z);
      img.alt = "";
      // Back items (z<0) must appear before body in DOM — paint order determines compositing
      if (z < 0) {
        avatarDisplay.insertBefore(img, base);
      } else {
        avatarDisplay.appendChild(img);
      }
    });
  }

  // ── Identity prompt (Section 152C) ──────────────────────────────────────────
  // Soft prompt: shown to STUDENTS who have never explicitly chosen an avatar
  // identity (chosen_at null/absent). "Vælg senere" dismisses without writing —
  // re-prompts at next login. Choosing calls set_avatar_identity (stamps
  // chosen_at) and never shows again. Teachers/admins never see it.

  async function maybeShowIdentityPrompt() {
    const overlay = document.getElementById("identity-overlay");
    if (!overlay) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, avatar_identity")
      .eq("id", studentId)
      .maybeSingle();

    if (!profile || profile.role !== "student") return;

    const identity = profile.avatar_identity;
    const hasChosen =
      identity && typeof identity === "object" && !!identity.chosen_at;
    if (hasChosen) return;

    await showIdentityPrompt(identity ?? null);
  }

  function showIdentityPrompt(currentIdentity) {
    return new Promise((resolve) => {
      const overlay  = document.getElementById("identity-overlay");
      const statusEl = document.getElementById("identity-status");
      const laterBtn = document.getElementById("identity-later-btn");
      if (!overlay) { resolve(); return; }

      const validBodies = ["male", "female", "neutral"];
      const currentBody =
        (currentIdentity && typeof currentIdentity === "object"
          && validBodies.includes(currentIdentity.body_type))
          ? currentIdentity.body_type
          : "neutral";

      // Mark the student's current body — "Behold" is one tap.
      overlay.querySelectorAll(".identity-card").forEach(card => {
        const isCurrent = card.dataset.bodyType === currentBody;
        card.classList.toggle("identity-card--current", isCurrent);
        const badge = card.querySelector(".identity-card-current-badge");
        if (badge) badge.textContent = isCurrent ? "Nuværende" : "";
      });

      overlay.style.display = "flex";

      const cards = overlay.querySelectorAll(".identity-card");

      const close = () => {
        overlay.style.display = "none";
        resolve();
      };

      // "Vælg senere": no write — chosen_at stays null, re-prompt next login.
      if (laterBtn) {
        laterBtn.disabled = false;
        laterBtn.onclick = close;
      }

      cards.forEach(card => {
        card.disabled = false;
        card.onclick = async () => {
          const bodyType = card.dataset.bodyType;
          if (!bodyType || !validBodies.includes(bodyType)) return;

          cards.forEach(c => c.disabled = true);
          if (laterBtn) laterBtn.disabled = true;
          if (statusEl) { statusEl.textContent = "Gemmer…"; statusEl.style.color = ""; }

          // Race the RPC against an 8-second timeout so a hung network never
          // leaves the student stuck (same pattern as the grade selector).
          const rpcCall     = supabase.rpc("set_avatar_identity", { p_body_type: bodyType });
          const timeoutCall = new Promise(res =>
            setTimeout(() => res({ error: new Error("timeout") }), 8000)
          );

          let rpcError = null;
          try {
            const { error } = await Promise.race([rpcCall, timeoutCall]);
            rpcError = error ?? null;
          } catch (e) {
            rpcError = e;
          }

          if (rpcError) {
            logEvent("IDENTITY_SAVE_FAILED", { bodyType, error: String(rpcError?.message ?? rpcError) });
            if (statusEl) {
              statusEl.textContent = "Kunne ikke gemme – prøv igen";
              statusEl.style.color = "#ef5350";
            }
            cards.forEach(c => c.disabled = false);
            if (laterBtn) laterBtn.disabled = false;
            return;
          }

          logEvent("IDENTITY_CHOSEN", { bodyType });
          // Re-render the identity-strip avatar with the chosen body.
          await fetchAvatar();
          close();
        };
      });
    });
  }

  async function loadGrade() {
    const { data: profile } = await supabase
      .from("profiles")
      .select("selected_grade")
      .eq("id", studentId)
      .maybeSingle();
    const grade = profile?.selected_grade ?? null;
    if (grade !== null) {
      selectedGrade = grade;
      currentDifficultyBand = GRADE_START_BAND[grade] ?? 2;
    }
  }

  async function showGradeSelector() {
    return new Promise((resolve) => {
      const overlay  = document.getElementById("grade-selector-overlay");
      const statusEl = document.getElementById("grade-status");
      if (!overlay) { resolve(); return; }
      overlay.style.display = "flex";
      const buttons = overlay.querySelectorAll(".grade-btn");

      buttons.forEach(btn => {
        btn.onclick = async () => {
          const grade = parseInt(btn.dataset.grade, 10);
          if (!grade) return;

          buttons.forEach(b => b.disabled = true);
          if (statusEl) { statusEl.textContent = "Gemmer…"; statusEl.style.color = ""; }

          // Race the RPC against an 8-second timeout so a hung network
          // never leaves the buttons disabled indefinitely.
          const rpcCall     = supabase.rpc("set_student_grade", { p_grade: grade });
          const timeoutCall = new Promise(res =>
            setTimeout(() => res({ error: new Error("timeout") }), 8000)
          );

          let rpcError = null;
          try {
            const { error } = await Promise.race([rpcCall, timeoutCall]);
            rpcError = error ?? null;
          } catch (e) {
            rpcError = e;
          }

          if (rpcError) {
            logError("SET_GRADE_ERROR", rpcError);
            buttons.forEach(b => b.disabled = false);
            if (statusEl) {
              statusEl.style.color = "#ef4444";
              statusEl.textContent = rpcError.message === "timeout"
                ? "Netværket svarer ikke — prøv igen"
                : "Kunne ikke gemme klassetrin — prøv igen";
            }
            return; // stay on overlay so student can retry
          }

          if (statusEl) statusEl.textContent = "";
          selectedGrade = grade;
          currentDifficultyBand = GRADE_START_BAND[grade] ?? 2;
          overlay.style.display = "none";
          resolve();
        };
      });
    });
  }

  function showCoinPopup(amount) {
    const popup = document.getElementById("xp-popup");
    if (!popup) return;
    popup.textContent = `+${amount} mønter`;
    popup.classList.remove("xp-show");
    void popup.offsetWidth;
    popup.classList.add("xp-show");
    popup.addEventListener("animationend", () => popup.classList.remove("xp-show"), { once: true });
  }

  function showLevelUpOverlay(newLevel) {
    const overlay = document.getElementById("level-up-overlay");
    const text = document.getElementById("level-up-text");
    if (!overlay || !text) return;
    text.textContent = `Niveau ${newLevel} — nyt territorium åbner sig.`;
    overlay.style.display = "flex";
    overlay.style.opacity = "0";
    void overlay.offsetWidth;
    overlay.style.opacity = "1";
    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.style.display = "none"; overlay.style.opacity = ""; }, 250);
    }, 2250);
  }

  // leadText: a line kept above the explanation (only "stav til": the correct spelling).
  function enterReflectionState(reviewText, leadText = null) {
    setUIState(UI_STATES.REFLECTING);
    feedback.textContent = leadText ?? "";
    feedback.className = leadText ? "feedback-error" : "";
    reviewFeedback.textContent = reviewText;
    reviewFeedback.classList.add("visible");
    optionsContainer.style.display = "none";
    reflectionContinue.style.display = "block";
    setTimeout(() => reflectionContinue.focus(), 200);
  }

  reflectionContinue.onclick = () => {
    if (uiState !== UI_STATES.REFLECTING) return;
    setUIState(UI_STATES.TRANSITIONING);
    loadAndRenderQuestion();
  };

  // ── D-347 spillepauser ────────────────────────────────────────────────────────────────────────────
  // breakCheck: the server's answer about a break, for the LAST REGISTERED answer only. It is started the
  // moment the graded reply arrives and awaited in loadAndRenderQuestion(), i.e. after that answer's
  // feedback (and reflection) and BEFORE the next question is fetched — so no question loads behind the
  // dialog and the quiz never continues while the pupil plays. It never touches the answer itself.
  let breakCheck = null;
  let leftForBreak = false;
  let questionVisibleTimer = null;
  loadMinigameBreak().then((m) => {
    try { if (m) questionVisibleTimer = m.createVisibleTimer(); } catch (e) { logError("MINIGAME_BREAK_TIMER", e); }
  });

  function requestBreakCheck(instanceId) {
    const visible = questionVisibleTimer ? questionVisibleTimer.seconds() : null;
    const check = loadMinigameBreak()
      .then((m) => (m ? m.checkBreakAfterAnswer(supabase, instanceId, visible) : null))
      .then((r) => {
        if (r?.error) logEvent("MINIGAME_BREAK_CHECK_FAILED", { error: r.error });
        return r?.offer ?? null;
      }, () => null);
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), MINIGAME_BREAK_WAIT_MS));
    breakCheck = Promise.race([check, timeout]);
  }

  // An offer earned by the answer that also started an anti-gætte-pause (D-350) is held here until the
  // pause is over, then shown by offerBreakIfDue() exactly as it would have been (owner 2026-11-05:
  // the pause comes first, the offer is kept). Only this page's memory: after a reload the server
  // shows the same open offer again at the next registered answer (minigame_break_after_answer).
  let heldBreakOffer = null;

  // The server's answer for the last registered answer (null: no offer, or none asked for).
  async function takeBreakOffer() {
    if (!breakCheck) return null;
    const pending = breakCheck;
    breakCheck = null;
    return await pending;
  }

  // Returns true when the pupil left for the game (the quiz must load nothing more).
  async function offerBreakIfDue() {
    const offer = heldBreakOffer ?? await takeBreakOffer();
    heldBreakOffer = null;
    if (!offer) return false;
    const m = await loadMinigameBreak();
    if (!m) return false;
    const outcome = await m.runBreakOffer({
      client: supabase,
      offer,
      subject: currentSubject,
      doc: document,
      track,
      attachReadAloud: attachReadAloudControl,
      navigate: (url) => { leftForBreak = true; window.location.href = url; },
      showNotice: (text) => { import("./js/toast.js").then((t) => t.showToast(text, "info", 4000), () => {}); },
    });
    stopReadAloud();   // the dialog's heading may still be speaking
    return outcome === "navigated";
  }

  // Back from a game via the browser's back button: a page restored from the back/forward cache would
  // still be in the middle of the transition. Load it fresh instead — the quiz state lives on the server.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && leftForBreak) window.location.reload();
  });

  // ── H5 (D-266, D-273): locked submissions — used only when isH5SubmissionsEnabled() ──────────────
  // pendingSubmission is the one submission of the question on screen whose result is not settled. It
  // is locked: a retry sends exactly it (same submission_id, round, instance and answer), and no new
  // question is fetched while it exists. handledSubmissions makes sure a result is applied to the
  // session (counters, wave, band, sounds, analytics) at most once per page.
  let pendingSubmission = null;
  const handledSubmissions = new Set();
  // Submissions that have left this page at least once (or came back from storage after a reload): the
  // server may have them, so they are never dropped without a confirmed answer.
  const sentSubmissions = new Set();

  function setAnswerControlsDisabled(disabled) {
    optionsContainer.querySelectorAll("button, input, textarea").forEach(el => { el.disabled = disabled; });
  }

  function settleSubmission() {
    pendingSubmission = null;
    clearPending(safeSessionStorage());
  }

  function showClientOutdated() {
    feedback.textContent = CLIENT_OUTDATED_TEXT;
    feedback.className = "feedback-error";
    setAnswerControlsDisabled(true);
    document.getElementById("reload-page-btn")?.remove();
    const reloadBtn = document.createElement("button");
    reloadBtn.id = "reload-page-btn";
    reloadBtn.className = "submit-btn";
    reloadBtn.textContent = "Genindlæs";
    reloadBtn.onclick = () => window.location.reload();
    optionsContainer.appendChild(reloadBtn);
    if (uiState === UI_STATES.SUBMITTING_ANSWER) setUIState(UI_STATES.AWAITING_ANSWER);
  }

  // The reply was lost or unreadable: the answer may or may not be registered. The answer controls stay
  // locked; the only way on is to send the SAME submission again.
  function showUncertain(onRetry) {
    feedback.textContent = UNCERTAIN_TEXT;
    feedback.className = "feedback-error";
    setAnswerControlsDisabled(true);
    document.getElementById("h5-retry-btn")?.remove();
    const retryBtn = document.createElement("button");
    retryBtn.id = "h5-retry-btn";
    retryBtn.className = "submit-btn";
    retryBtn.textContent = "Send igen";
    retryBtn.onclick = () => { retryBtn.remove(); onRetry(); };
    optionsContainer.appendChild(retryBtn);
    if (uiState === UI_STATES.SUBMITTING_ANSWER) setUIState(UI_STATES.AWAITING_ANSWER);
  }

  // ── Anti-gætte-pause (docs/quiz-anti-guess-cooldown.md) ──────────────────────────────────────────
  // The database refuses answers during a pause; this shows the approved text and a countdown built on
  // the server's own end time, measured with performance.now() (js/quiz-cooldown.js). The pupil is never
  // told why in numbers. Other tabs learn of it over BroadcastChannel and ask the server themselves.
  let cooldownTimer = null;
  let cooldownCountdown = null;
  let lastAnswerWasWrong = false;
  const monoNow = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
  const cooldownChannel = openCooldownChannel(() => { syncCooldownFromServer(); });

  function cooldownPanel() {
    let panel = document.getElementById("quiz-cooldown");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "quiz-cooldown";
    panel.setAttribute("aria-labelledby", "quiz-cooldown-title");
    panel.setAttribute("aria-describedby", "quiz-cooldown-body quiz-cooldown-note");
    const title = document.createElement("h2");
    title.id = "quiz-cooldown-title";
    title.tabIndex = -1;
    title.textContent = COOLDOWN_TEXT.title;
    const body = document.createElement("p");
    body.id = "quiz-cooldown-body";
    body.textContent = COOLDOWN_TEXT.body;
    const timer = document.createElement("div");
    timer.id = "quiz-cooldown-timer";
    timer.setAttribute("role", "timer");
    timer.setAttribute("aria-live", "off");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "quiz-cooldown-continue";
    btn.className = "submit-btn";
    btn.textContent = COOLDOWN_TEXT.button;
    btn.onclick = () => { exitCooldown(); };
    const note = document.createElement("p");
    note.id = "quiz-cooldown-note";
    note.textContent = COOLDOWN_TEXT.note;
    panel.append(title, body, timer, btn, note);
    document.getElementById("game-card")?.appendChild(panel);
    return panel;
  }

  function renderCooldownTick() {
    const panel = document.getElementById("quiz-cooldown");
    if (!panel || !cooldownCountdown) return;
    const remaining = cooldownCountdown.remainingMs();
    const timer = panel.querySelector("#quiz-cooldown-timer");
    const text = formatRemaining(remaining);
    if (timer && timer.textContent !== text) timer.textContent = text;
    const btn = panel.querySelector("#quiz-cooldown-continue");
    if (remaining > 0) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      return;
    }
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    // At 00:00 ask the server once (it is the authority; this tab's clock may have drifted or slept).
    fetchCooldownStatus(supabase, { force: true }).then((s) => {
      if (uiState !== UI_STATES.COOLDOWN) return;
      if (s && s.active) { startCooldownCountdown(cooldownFromServer(s.endsAt, s.serverNow)); return; }
      btn.disabled = false;
      btn.removeAttribute("aria-disabled");
      btn.focus();
    });
  }

  function startCooldownCountdown(info) {
    cooldownCountdown = createCountdown(info.remainingMs, monoNow);
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(renderCooldownTick, 250);
    renderCooldownTick();
  }

  // Shows the pause. info = { endsAt, serverNow } from the server (either may be null: then the server
  // is asked, and only if that fails too is the presentational fallback used).
  async function enterCooldown(info, { announce = true } = {}) {
    let timing = cooldownFromServer(info?.endsAt ?? null, info?.serverNow ?? null);
    if (!timing.verified) {
      const s = await fetchCooldownStatus(supabase, { force: true });
      if (s && s.active) timing = cooldownFromServer(s.endsAt, s.serverNow);
      else if (s && !s.active) timing = { remainingMs: 0, verified: true };
    }
    logEvent("QUIZ_COOLDOWN", { verified: timing.verified });
    stopReadAloud();
    if (uiState !== UI_STATES.COOLDOWN) setUIState(UI_STATES.COOLDOWN);
    if (uiState !== UI_STATES.COOLDOWN) {
      // Not reachable from REFLECTING / TRANSITIONING / LOADING_QUESTION: the next answer is refused by the
      // server and enters the pause from SUBMITTING_ANSWER instead.
      return;
    }
    questionElement.style.display = "none";
    optionsContainer.style.display = "none";
    clearStimulus();   // F-07: a source, image or audio clip belongs to the question; it comes back with it
    reviewFeedback.classList.remove("visible");
    reflectionContinue.style.display = "none";
    feedback.textContent = `${COOLDOWN_TEXT.title} ${COOLDOWN_TEXT.body}`;
    feedback.className = "feedback-pending sr-only-cooldown";
    const panel = cooldownPanel();
    panel.hidden = false;
    startCooldownCountdown(timing);
    panel.querySelector("#quiz-cooldown-title")?.focus({ preventScroll: true });
    if (announce) announceCooldown(cooldownChannel);
  }

  // "Fortsæt quizzen": loadAndRenderQuestion asks the server once more (COOLDOWN start) and either keeps
  // the pause (with the server's remaining time) or leaves it through leaveCooldownView().
  let cooldownExiting = false;
  async function exitCooldown() {
    if (uiState !== UI_STATES.COOLDOWN || cooldownExiting) return;
    if (cooldownCountdown && cooldownCountdown.remainingMs() > 0) return;
    cooldownExiting = true;
    const btn = document.getElementById("quiz-cooldown-continue");
    if (btn) btn.disabled = true;
    try { await loadAndRenderQuestion(); } finally { cooldownExiting = false; }
  }

  function leaveCooldownView() {
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = null;
    cooldownCountdown = null;
    const panel = document.getElementById("quiz-cooldown");
    if (panel) panel.hidden = true;
    questionElement.style.display = "";
    optionsContainer.style.display = "";
    feedback.textContent = "";
    feedback.className = "";
  }

  // Asks the server whether a pause is running: another tab reported one, this page starts, the pupil
  // returns to the tab, or — afterWrongAnswer — this tab's last answer was wrong and may have been the one
  // that started the pause (the answer itself is shown normally first; the pause follows at the transition).
  async function syncCooldownFromServer({ afterWrongAnswer = false } = {}) {
    const from = [UI_STATES.AWAITING_ANSWER, UI_STATES.IDLE, UI_STATES.COOLDOWN];
    if (afterWrongAnswer) from.push(UI_STATES.TRANSITIONING);
    if (!from.includes(uiState)) return false;
    const s = await fetchCooldownStatus(supabase);
    if (!s || !s.active) return false;
    if (uiState === UI_STATES.COOLDOWN) { startCooldownCountdown(cooldownFromServer(s.endsAt, s.serverNow)); return true; }
    if (!from.includes(uiState)) return false;
    await enterCooldown({ endsAt: s.endsAt, serverNow: s.serverNow }, { announce: afterWrongAnswer });
    return true;
  }

  // Back on a tab that shows a pause (the monotonic clock may have stood still while the device slept).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && uiState === UI_STATES.COOLDOWN) syncCooldownFromServer();
  });

  // A backend that answered outside H5's contract (classifyResponse "incompatible_backend"): the
  // submission is kept, marked blocked in storage, and never sent again from this tab — not by a retry
  // and not after a reload. The pupil is told plainly and sent to the hub; nothing is graded here.
  function showIncompatible() {
    feedback.textContent = INCOMPATIBLE_TEXT;
    feedback.className = "feedback-error";
    setAnswerControlsDisabled(true);
    document.getElementById("h5-retry-btn")?.remove();
    if (!document.getElementById("go-hub-btn")) {
      const hubBtn = document.createElement("button");
      hubBtn.id = "go-hub-btn";
      hubBtn.textContent = "Gå til hub";
      hubBtn.className = "submit-btn";
      hubBtn.onclick = () => { window.location.href = "hub.html"; };
      optionsContainer.appendChild(hubBtn);
    }
    if (uiState === UI_STATES.SUBMITTING_ANSWER) setUIState(UI_STATES.AWAITING_ANSWER);
  }

  function enterIncompatible(record, reason) {
    const blocked = blockRecord(record);
    pendingSubmission = blocked;
    const saved = savePending(safeSessionStorage(), blocked);
    logError("H5_INCOMPATIBLE_BACKEND", { reason, submission_id: record.submission_id, marker_stored: saved.ok });
    showIncompatible();
  }

  // "same" | "other" (a different pupil is signed in: the submission is not theirs) | "none".
  async function sessionOwner() {
    try {
      const { data } = await supabase.auth.getSession();
      const id = data?.session?.user?.id;
      return !id ? "none" : id === studentId ? "same" : "other";
    } catch (_e) {
      return "none";
    }
  }

  async function sendSubmission(record) {
    try {
      const result = await supabase.functions.invoke("process-event", { body: h5RequestBody(record, questionShownAt) });
      return await classifyResponse(result, record);
    } catch (e) {
      logError("H5_SUBMIT_THREW", e);
      return { kind: "uncertain", reason: "threw" };
    }
  }

  // Before every send the locked submission is stored and read back.
  //   * FIRST send: if that fails, nothing is sent — the pupil is told, the answer stays editable.
  //   * a submission that has already left this page (or came back from storage after a reload): it is
  //     sent anyway. The server may have it, and resending the SAME submission_id is the only way to
  //     settle it and can never register it twice. Refusing would leave a "Send igen" that never sends
  //     — for as long as the storage fails, once the stored copy is older than PENDING_MAX_AGE_MS, or
  //     on the recovery screen, where submitAnswer() is not reachable. Only reload recovery is lost,
  //     and that went with the storage.
  function readyToSend(record) {
    const persisted = persistAndVerify(safeSessionStorage(), record);
    if (persisted.ok) return true;
    const sentBefore = sentSubmissions.has(record.submission_id);
    logError("H5_STORAGE_UNAVAILABLE", { error: persisted.error, sent_before: sentBefore });
    if (sentBefore) return true;
    // Never sent: there is nothing to settle. The answer stays in the controls, unlocked.
    pendingSubmission = null;
    clearPending(safeSessionStorage());
    feedback.textContent = STORAGE_TEXT;
    feedback.className = "feedback-error";
    setAnswerControlsDisabled(false);
    if (uiState === UI_STATES.SUBMITTING_ANSWER) setUIState(UI_STATES.AWAITING_ANSWER);
    return false;
  }

  // Sends the locked submission of the question on screen. Returns { handled: true } when the reply has
  // been dealt with here, or { handled: false, data } with a graded result for submitAnswer to show.
  async function submitH5(userAnswer) {
    const owner = await sessionOwner();
    if (owner !== "same") {
      // Another pupil: the submission is not theirs. No session: the login page clears it.
      if (owner === "other") settleSubmission();
      window.location.replace("login.html");
      return { handled: true };
    }

    if (pendingSubmission && pendingSubmission.blocked) {
      showIncompatible();
      return { handled: true };
    }

    let record = pendingSubmission;
    if (record && record.question_instance_id !== currentInstanceId) {
      // Not reachable: no question is loaded while a submission is unsettled. Never dropped — sent.
      logError("H5_PENDING_OTHER_INSTANCE", { pending: record.question_instance_id, current: currentInstanceId });
    }
    if (!record) {
      // round_no comes only from the server's question. Without a valid one there is no submission
      // and no legacy fallback.
      const created = createSubmission({ studentId, instanceId: currentInstanceId, roundNo: currentRoundNo, answer: userAnswer });
      if (!created.ok) {
        logError("H5_SUBMISSION_NOT_CREATED", { reason: created.reason });
        feedback.textContent = created.reason === "answer_too_long" ? "⚠️ Svaret er for langt."
          : created.reason === "empty_answer" ? "⚠️ Skriv et svar først."
          : MISSING_ROUND_TEXT;
        feedback.className = "feedback-error";
        optionsContainer.querySelectorAll("button").forEach(btn => btn.disabled = false);
        setUIState(UI_STATES.AWAITING_ANSWER);
        return { handled: true };
      }
      record = created.record;
      pendingSubmission = record;
    }

    // Not one byte leaves before the submission can be found again after a reload.
    if (!readyToSend(record)) return { handled: true };
    sentSubmissions.add(record.submission_id);

    setAnswerControlsDisabled(true);
    const outcome = await sendSubmission(record);

    if (outcome.kind === "graded") {
      if (outcome.replay) logEvent("H5_REPLAY", { submission_id: record.submission_id });
      settleSubmission();
      if (handledSubmissions.has(record.submission_id)) {
        setUIState(UI_STATES.TRANSITIONING);
        loadAndRenderQuestion();
        return { handled: true };
      }
      handledSubmissions.add(record.submission_id);
      return { handled: false, data: outcome.data };
    }

    if (outcome.kind === "refused") {
      // Not registered, not graded: never shown as right or wrong.
      settleSubmission();
      logEvent("H5_REFUSED", { outcome: outcome.outcome, reason: outcome.reason });
      feedback.textContent = REFUSAL_TEXT[outcome.outcome] ?? REFUSAL_TEXT.invalid_request;
      feedback.className = "feedback-pending";
      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 2500);
      return { handled: true };
    }

    if (outcome.kind === "invalid_answer") {
      // Definitively refused before anything was recorded (e.g. an incomplete Match par): the pupil
      // may change the answer, which then becomes a new submission.
      settleSubmission();
      feedback.textContent = "⚠️ " + (outcome.message ?? "Svaret kunne ikke bruges — prøv igen.");
      feedback.className = "feedback-error";
      setAnswerControlsDisabled(false);
      setUIState(UI_STATES.AWAITING_ANSWER);
      return { handled: true };
    }

    if (outcome.kind === "client_outdated") {
      settleSubmission();
      showClientOutdated();
      return { handled: true };
    }

    if (outcome.kind === "quiz_cooldown") {
      // Refused in the database before anything was registered: not graded, not paid. The question stays
      // open and is answered again after the pause, as a new submission.
      settleSubmission();
      await enterCooldown({ endsAt: outcome.endsAt, serverNow: outcome.serverNow });
      return { handled: true };
    }

    if (outcome.kind === "unauthorized") {
      // Nothing was processed. Kept until the login page clears it.
      window.location.replace("login.html");
      return { handled: true };
    }

    if (outcome.kind === "incompatible_backend") {
      enterIncompatible(record, outcome.reason);
      return { handled: true };
    }

    logError("H5_SUBMIT_UNCERTAIN", { reason: outcome.reason, submission_id: record.submission_id });
    showUncertain(() => { submitAnswer(record.answer); });
    return { handled: true };
  }

  // Before the first question is fetched: settle a submission this tab left unresolved (sent, the reply
  // lost, the page reloaded). Until it is settled nothing new is loaded, so it cannot be overwritten or
  // forgotten. The result is shown, but it is NOT applied to this session's counters, wave or band —
  // the page that sent it may already have. Returns true when the quiz may load its next question.
  async function recoverPendingSubmission() {
    const { record, discarded } = loadPending(safeSessionStorage(), studentId);
    if (discarded) logEvent("H5_PENDING_DISCARDED", { reason: discarded });
    if (!record) return true;

    pendingSubmission = record;
    // It came back from storage: it may have reached the server before the reload.
    sentSubmissions.add(record.submission_id);
    optionsContainer.innerHTML = "";
    feedback.textContent = "";
    feedback.className = "";

    if (record.blocked) {
      // The backend already answered outside H5's contract: shown again, never sent again.
      questionElement.textContent = "Dit sidste svar kunne ikke registreres sikkert.";
      showIncompatible();
      return false;
    }

    questionElement.textContent = "Vi afslutter dit sidste svar …";
    const owner = await sessionOwner();
    if (owner !== "same") {
      if (owner === "other") settleSubmission();
      window.location.replace("login.html");
      return false;
    }
    if (!readyToSend(record)) {
      questionElement.textContent = "Dit sidste svar er ikke afsluttet endnu.";
      return false;
    }
    const outcome = await sendSubmission(record);

    if (outcome.kind === "graded") {
      settleSubmission();
      handledSubmissions.add(record.submission_id);
      const d = outcome.data;
      const key = typeof d.correct_answer === "string" && !/^\d:\d(,\d:\d)+$/.test(d.correct_answer) ? d.correct_answer : null;
      questionElement.textContent = d.status === "correct" ? "Dit sidste svar er registreret: rigtigt! 🎯"
        : d.status === "incorrect" ? "Dit sidste svar er registreret: ikke helt rigtigt." + (key ? " Svaret er " + key + "." : "")
        : "Dit sidste svar er gemt.";
      await fetchProgress();
      const nextBtn = document.createElement("button");
      nextBtn.id = "h5-continue-btn";
      nextBtn.className = "submit-btn";
      nextBtn.textContent = "Næste spørgsmål";
      nextBtn.onclick = () => { nextBtn.remove(); loadAndRenderQuestion(); };
      optionsContainer.appendChild(nextBtn);
      return false;
    }

    if (outcome.kind === "client_outdated") {
      settleSubmission();
      questionElement.textContent = "";
      showClientOutdated();
      return false;
    }

    if (outcome.kind === "unauthorized") {
      window.location.replace("login.html");
      return false;
    }

    if (outcome.kind === "incompatible_backend") {
      questionElement.textContent = "Dit sidste svar kunne ikke registreres sikkert.";
      enterIncompatible(record, outcome.reason);
      return false;
    }

    if (outcome.kind === "refused" || outcome.kind === "invalid_answer") {
      // Settled: nothing was registered. The next question may load.
      settleSubmission();
      logEvent("H5_RECOVERY_REFUSED", { kind: outcome.kind, outcome: outcome.outcome ?? null });
      return true;
    }

    logError("H5_RECOVERY_UNCERTAIN", { reason: outcome.reason, submission_id: record.submission_id });
    questionElement.textContent = "Dit sidste svar er ikke afsluttet endnu.";
    showUncertain(async () => {
      if (await recoverPendingSubmission()) loadAndRenderQuestion();
    });
    return false;
  }

  async function submitAnswer(userAnswer, clickedBtn = null) {

    if (uiState !== UI_STATES.AWAITING_ANSWER) return;

    setUIState(UI_STATES.SUBMITTING_ANSWER);

    const buttons = optionsContainer.querySelectorAll("button");
    buttons.forEach(btn => btn.disabled = true);

    console.log("SUBMIT:", { studentId, currentInstanceId, userAnswer });

    let data;
    let error;
    if (isH5SubmissionsEnabled() && isH5Eligible(currentAnswerType)) {
      const h5 = await submitH5(userAnswer);
      if (h5.handled) return;
      data = h5.data;
      error = null;
    } else {
      // H5 off (the default), or a long answer: exactly the request this page always sent.
      ({ data, error } = await supabase.functions.invoke(
        "process-event",
        {
          body: {
            student_id: studentId,
            question_instance_id: currentInstanceId,
            answer: userAnswer,
            question_shown_at: questionShownAt
          }
        }
      ));
    }

    if (error) {
      logError("SUBMIT_ERROR", error);

      // M2 (H5): once the legacy answer path is closed, process-event answers an old request with 426
      // client_outdated. Only that exact reply is handled here; every other error is unchanged.
      if (await isClientOutdatedError(error)) {
        showClientOutdated();
        return;
      }

      // Anti-gætte-pause: refused in the database before anything was registered (429 from process-event,
      // or version 34's 500 carrying the database's exact message).
      const cooldown = await cooldownFromInvokeError(error);
      if (cooldown) {
        await enterCooldown(cooldown);
        return;
      }

      feedback.textContent = "⚠️ Fejl ved svar – prøv igen";
      feedback.className = "feedback-error";

      buttons.forEach(btn => btn.disabled = false);
      setUIState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (!data || !data.status) {
      logError("INVALID_RESPONSE", data);

      feedback.textContent = "⚠️ Ugyldigt svar fra server";
      feedback.className = "feedback-error";

      buttons.forEach(btn => btn.disabled = false);
      setUIState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    // D-347: the answer is registered (the server graded it, or queued it for the teacher). Only now may
    // a break be considered — right or wrong alike; an unknown status is not a registration.
    if (data.status === "correct" || data.status === "incorrect" || data.status === "pending") {
      requestBreakCheck(currentInstanceId);
    }

    const prevXp = lastKnownXp;
    const prevCoins = lastKnownCoins;
    sessionQuestionCount++;
    // 157E: analytics — answer result (status only, no answer text). No-op unless active.
    track("question_answered", { status: data.status });
    // Persist earned band every 10 questions — fire-and-forget, never blocks the quiz.
    if (sessionQuestionCount % 10 === 0) {
      persistCurrentBand();
    }

    if (data.status === "pending") {
      feedback.textContent = "⏳ Afventer lærerens vurdering";
      feedback.className = "feedback-pending";
      sessionCorrectStreak = 0;
      sessionConsecutiveReflections = 0;

      await fetchProgress();
      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 1000);
      return;
    }

    if (data.status === "correct") {
      // Match par: mark the connections green before the next question replaces them.
      if (currentRenderer === ANSWER_RENDERERS.MATCH_PAIRS && currentMatchControl) {
        currentMatchControl.showResult(data.correct_answer);
      }
      feedback.textContent = "Ja! 🎯";
      feedback.className = "feedback-correct";
      playSound("equip");
      exprEngine?.onGameEvent("CORRECT");
      presenceEngine?.onGameEvent("CORRECT");
      if (clickedBtn) {
        clickedBtn.classList.add("correct-flash");
        clickedBtn.addEventListener("animationend", () => clickedBtn.classList.remove("correct-flash"), { once: true });
      }

      // Hidden achievement: perfect_five — track consecutive correct per session
      sessionCorrectStreak++;
      sessionConsecutiveReflections = 0;
      updateWavePhase(true);
      adjustDifficultyBand(true);
      if (sessionCorrectStreak >= 5 && sessionCorrectStreak > bestSessionStreak) {
        bestSessionStreak = sessionCorrectStreak;
        // supabase.rpc() returns a PostgrestFilterBuilder — a thenable WITHOUT .catch().
        // Calling .catch() on it threw a synchronous TypeError that aborted submitAnswer and
        // froze the state machine in SUBMITTING_ANSWER. then(onOk, onErr) both executes the
        // request and swallows failures, which is the fire-and-forget behaviour intended here.
        supabase.rpc("update_best_session_streak", { p_count: bestSessionStreak }).then(() => {}, () => {});
      }

      // Hidden achievement: night_owl — correct answer between 00:00–03:59 local time
      if (new Date().getHours() < 4) {
        // Same PostgrestFilterBuilder caveat as update_best_session_streak above.
        supabase.rpc("set_night_correct").then(() => {}, () => {});
      }

      await fetchProgress();

      const coinDelta = lastKnownCoins - prevCoins;
      if (coinDelta > 0) showCoinPopup(coinDelta);

      const prevLevel = calculateLevelFromXP(prevXp);
      const newLevel = calculateLevelFromXP(lastKnownXp);
      if (newLevel > prevLevel) {
        showLevelUpOverlay(newLevel);
        exprEngine?.onGameEvent("LEVEL_UP");
        presenceEngine?.onGameEvent("LEVEL_UP");
      }

      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 600);
      return;
    }

    if (data.status === "incorrect") {
      const reviewText = data.review_text ?? null;
      lastAnswerWasWrong = true;   // anti-gætte-pause: checked at the next transition (loadAndRenderQuestion)

      playSound("error");
      exprEngine?.onGameEvent("INCORRECT");
      presenceEngine?.onGameEvent("INCORRECT");
      if (clickedBtn) {
        clickedBtn.classList.add("incorrect-flash");
        clickedBtn.addEventListener("animationend", () => clickedBtn.classList.remove("incorrect-flash"), { once: true });
      }
      sessionCorrectStreak = 0;
      lastMisconceptionType = data.misconception_type ?? null;
      updateWavePhase(false);
      adjustDifficultyBand(false);

      await fetchProgress();

      // Reflection density gate (Section 55):
      // Enter reflection state only for the first 2 consecutive incorrect+reviewText answers.
      // After 2 back-to-back reflections, auto-advance — prevents reflection fatigue in losing streaks.
      if (reviewText && sessionConsecutiveReflections < 2) {
        sessionConsecutiveReflections++;
        feedback.textContent = "Ikke helt —";
        feedback.className = "feedback-error";
        // "Stav til": the explanation alone does not state the spelling, so keep it on screen.
        // Match par: the panel hides the columns, so the correct pairs are stated in words.
        // Sandt/falsk: the explanation says why, the lead says which judgement was right.
        const correction = currentRenderer === ANSWER_RENDERERS.SHORT_TEXT
          ? shortTextCorrection(data.correct_answer, userAnswer)
          : currentRenderer === ANSWER_RENDERERS.MATCH_PAIRS && currentMatchControl
            ? matchCorrectionText(currentMatchControl.layout, data.correct_answer)
            : currentRenderer === ANSWER_RENDERERS.TRUE_FALSE
              ? trueFalseCorrection(data.correct_answer)
              : currentRenderer === ANSWER_RENDERERS.ORDER_ITEMS && currentOrderControl
                ? orderCorrectionText(currentOrderControl.layout, data.correct_answer)
                : null;
        setTimeout(() => enterReflectionState(reviewText, correction), 400);
        return;
      }

      if (reviewText) {
        logEvent("REFLECTION_DENSITY_GATE", { sessionConsecutiveReflections, gated: true });
      }

      // Match par: the key is positions, not words — mark the connections and list the right pairs
      // under them instead, and leave a little longer to read them.
      if (currentRenderer === ANSWER_RENDERERS.MATCH_PAIRS && currentMatchControl
        && currentMatchControl.showResult(data.correct_answer)) {
        feedback.textContent = "Ikke helt — se de rigtige par.";
        feedback.className = "feedback-error";
        setUIState(UI_STATES.TRANSITIONING);
        setTimeout(() => { loadAndRenderQuestion(); }, 4000);
        return;
      }

      // Rækkefølge: the key is display positions, not words — state the correct order in the shown texts
      // and leave a little longer to read it.
      if (currentRenderer === ANSWER_RENDERERS.ORDER_ITEMS && currentOrderControl) {
        const correctOrder = orderCorrectionText(currentOrderControl.layout, data.correct_answer);
        if (correctOrder) {
          feedback.textContent = "Ikke helt. " + correctOrder;
          feedback.className = "feedback-error";
          setUIState(UI_STATES.TRANSITIONING);
          setTimeout(() => { loadAndRenderQuestion(); }, 5000);
          return;
        }
      }

      feedback.textContent = "Svaret er " + (data.correct_answer ?? "ukendt") + " — husk det nu.";
      feedback.className = "feedback-error";
      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 2000);
      return;
    }

    logError("UNKNOWN_STATUS", data.status);

    feedback.textContent = "⚠️ Ukendt status fra server";
    feedback.className = "feedback-error";

    buttons.forEach(btn => btn.disabled = false);
    setUIState(UI_STATES.AWAITING_ANSWER);
  }

  async function getNextQuestion() {
    setUIState(UI_STATES.LOADING_QUESTION);

    const sessionContext = {
      wave_phase: sessionWavePhase,
      consecutive_incorrect: sessionConsecutiveIncorrect,
      last_misconception_type: lastMisconceptionType,
      session_question_count: sessionQuestionCount,
    };

    let { data, error } = await supabase.functions.invoke(
      "get-next-question",
      { body: { session_context: sessionContext, selected_grade: selectedGrade, current_difficulty_band: currentDifficultyBand, subject: currentSubject } }
    );

    if (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
      ({ data, error } = await supabase.functions.invoke("get-next-question", { body: { subject: currentSubject } }));
    }

    console.log("RAW RESPONSE:", data, error);

    if (error) {
      console.error("GET QUESTION ERROR:", error);
      return null;
    }

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    console.log("QUESTION RAW:", parsed);

    if (!parsed) return null;

    if (parsed.step === "no_questions") {
      return { step: "no_questions" };
    }

    if (!parsed.content || !parsed.content.question) {
      console.error("INVALID QUESTION:", parsed);
      return null;
    }

    currentInstanceId = parsed.question_instance_id ?? null;
    currentRoundNo = parsed.round_no ?? null;
    currentAnswerType = parsed.answer_type ?? null;

    console.log("INSTANCE ID:", currentInstanceId);

    return parsed;
  }

  // Returns true when an answer control was rendered, false for an interaction type this client
  // cannot show (loadAndRenderQuestion then leaves the question in a visible error state).
  function renderOptions(question) {
    optionsContainer.innerHTML = "";

    const format = (question.answer_format || "").toLowerCase();
    const content = question.content;
    // One renderer per interaction type — see js/answer-input.js for the selection order.
    const renderer = resolveAnswerRenderer(question);
    currentRenderer = renderer;
    currentMatchControl = null;
    currentOrderControl = null;

    // 157E: analytics — question shown (format only, no content). No-op unless active.
    track("question_shown", { format });

    let options = content.options;

    if (!Array.isArray(options)) options = [];

    if (renderer === ANSWER_RENDERERS.FORCE_TEXT) {
      const textarea = document.createElement("textarea");

      const btn = document.createElement("button");
      btn.className = "submit-btn";
      btn.textContent = "Send svar";

      btn.onclick = () => {
        submitAnswer(textarea.value, btn);
      };

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          btn.onclick();
        }
      });

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(btn);
      // 157I: optional OCR "scan text" control — no-op when ENABLE_OCR is off; fail-soft.
      attachOcrControl(textarea, optionsContainer);
      return true;
    }

    if (format.includes("mc")) {
      // Padding to four options applies to answer_format "mc" only — a two-choice format
      // (true/false) must never get random years added. See js/answer-options.js.
      options = prepareChoiceOptions(options, format);
    }

    if (renderer === ANSWER_RENDERERS.NUMBER) {
      // F-01b (js/number-answer.js): a whole number only. Empty, decimals, a plus sign and letters are
      // refused with a visible Danish message and nothing is sent; a valid answer is sent as the
      // canonical integer ("1 849" / "1.849" → "1849"). Enter and the button share one submit path,
      // and submitAnswer's state machine refuses a second send.
      const { input, button, hint } = buildNumberAnswer(document, {
        onSubmit: submitAnswer,
        describedBy: questionElement.id,
      });
      optionsContainer.appendChild(input);
      optionsContainer.appendChild(hint);
      optionsContainer.appendChild(button);
      input.focus();
      return true;
    }

    if (renderer === ANSWER_RENDERERS.SHORT_TEXT) {
      // "Stav til": one-line input with spellcheck/autocorrect/autocapitalize/autocomplete off.
      // The raw text goes to submitAnswer unchanged; the server evaluator decides correctness.
      const { input, button, hint } = buildShortTextAnswer(document, {
        onSubmit: submitAnswer,
        describedBy: questionElement.id,
      });
      optionsContainer.appendChild(input);
      optionsContainer.appendChild(hint);
      optionsContainer.appendChild(button);
      input.focus();
      return true;
    }

    if (renderer === ANSWER_RENDERERS.MATCH_PAIRS) {
      // Match par (js/match-pairs.js): the server sent two lists of texts, the right one shuffled.
      // A payload that is not a valid layout falls through to the visible "unsupported" error below.
      const layout = readMatchLayout(content);
      if (layout) {
        currentMatchControl = buildMatchPairsAnswer(document, {
          layout,
          onSubmit: submitAnswer,
          describedBy: questionElement.id,
        });
        optionsContainer.appendChild(currentMatchControl.root);
        return true;
      }
      logError("INVALID_MATCH_LAYOUT", { format });
    }

    if (renderer === ANSWER_RENDERERS.TRUE_FALSE) {
      // Sandt/falsk (js/true-false.js): the server sent only the statement, already shown above with its
      // read-aloud player; the two answers are fixed. Feedback is the normal choice feedback below.
      // A payload that breaks the contract falls through to the visible "unsupported" error below.
      if (readTrueFalseContent(content)) {
        const control = buildTrueFalseAnswer(document, {
          onSubmit: submitAnswer,
          describedBy: questionElement.id,
        });
        optionsContainer.appendChild(control.root);
        return true;
      }
      logError("INVALID_TRUE_FALSE_CONTENT", { format });
    }

    if (renderer === ANSWER_RENDERERS.ORDER_ITEMS) {
      // Rækkefølge (js/order-items.js): the server sent the item texts in a shuffled order; the correct
      // order is never in the payload. A payload that is not a valid layout falls through to the visible
      // "unsupported" error below.
      const layout = readOrderLayout(content);
      if (layout) {
        const control = buildOrderAnswer(document, {
          layout,
          onSubmit: submitAnswer,
          describedBy: questionElement.id,
          attachReadAloud: attachOptionReadAloudControl,
          readAloudContext: { subject: currentSubject, question: content.question, options: layout.items },
        });
        currentOrderControl = { ...control, layout };
        optionsContainer.appendChild(control.root);
        return true;
      }
      logError("INVALID_ORDER_LAYOUT", { format });
    }

    if (renderer === ANSWER_RENDERERS.LONG_TEXT) {
      const textarea = document.createElement("textarea");

      const btn = document.createElement("button");
      btn.className = "submit-btn";
      btn.textContent = "Send svar";

      btn.onclick = () => {
        submitAnswer(textarea.value, btn);
      };

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          btn.onclick();
        }
      });

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(btn);
      // 157I: optional OCR "scan text" control — no-op when ENABLE_OCR is off; fail-soft.
      attachOcrControl(textarea, optionsContainer);
      return true;
    }

    if (renderer === ANSWER_RENDERERS.UNSUPPORTED || renderer === ANSWER_RENDERERS.MATCH_PAIRS
      || renderer === ANSWER_RENDERERS.TRUE_FALSE
      || renderer === ANSWER_RENDERERS.ORDER_ITEMS) {
      // An interaction type this client has no renderer for must fail loud — never fall through
      // to option buttons (ARCHITECTURE.md → Question Interaction model, rule 2).
      logError("UNSUPPORTED_ANSWER_FORMAT", { format, answer_type: question.answer_type ?? null });
      const msg = document.createElement("p");
      msg.id = "unsupported-format";
      msg.className = "feedback-error";
      msg.setAttribute("role", "alert");
      msg.textContent = "⚠️ Denne opgavetype kan ikke vises endnu.";
      optionsContainer.appendChild(msg);

      const hubBtn = document.createElement("button");
      hubBtn.id = "go-hub-btn";
      hubBtn.textContent = "Gå til hub";
      hubBtn.className = "submit-btn";
      hubBtn.onclick = () => { window.location.href = "hub.html"; };
      optionsContainer.appendChild(hubBtn);
      return false;
    }

    const isMc = format.includes("mc");
    options.forEach((option) => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.onclick = () => submitAnswer(option, btn);

      if (isMc) {
        // 157O: MC options render as a row [answer button][🔊] so the read-aloud
        // control is a SEPARATE sibling — clicking 🔊 never submits the answer.
        // No-op / fail-soft when read-aloud is unavailable (no 🔊 rendered).
        const row = document.createElement("div");
        row.className = "option-row";
        row.appendChild(btn);
        attachOptionReadAloudControl(row, option, { subject: currentSubject, question: content.question, options });
        optionsContainer.appendChild(row);
      } else {
        optionsContainer.appendChild(btn);
      }
    });
    return true;
  }

  // F-07: the stimulus (source, image or audio clip) of the question on screen. Cleared for every new
  // question, so a question without one shows nothing extra — exactly as before.
  function clearStimulus() {
    if (!stimulusElement) return;
    stimulusElement.textContent = "";
    stimulusElement.hidden = true;
  }

  // Shows the question's stimulus above it. True when there is none or it was shown; false when the
  // payload carries a stimulus that breaks the contract (the caller then fails loud).
  function renderStimulus(content) {
    clearStimulus();
    const stimulus = readStimulus(content);
    if (stimulus === null) return true;
    if (stimulus.invalid || !stimulusElement) {
      logError("INVALID_STIMULUS", { kind: content?.stimulus?.kind ?? null });
      return false;
    }
    stimulusElement.appendChild(buildStimulus(document, stimulus, {
      attachReadAloud: attachReadAloudControl,
      readAloudContext: { subject: currentSubject, target: "source" },
    }));
    stimulusElement.hidden = false;
    return true;
  }

  async function loadAndRenderQuestion() {
    // Anti-gætte-pause: at start-up (IDLE — a reload, a new tab or another device) and on leaving a pause
    // (COOLDOWN), ask the server first. From TRANSITIONING (the normal flow) nothing is asked.
    if (uiState === UI_STATES.IDLE || uiState === UI_STATES.COOLDOWN) {
      if (await syncCooldownFromServer()) return;
    }
    if (uiState === UI_STATES.COOLDOWN) leaveCooldownView();

    // Clean up reflection state if active from previous question
    stopReadAloud();
    clearStimulus();
    optionsContainer.style.display = "";
    reviewFeedback.textContent = "";
    reviewFeedback.classList.remove("visible");
    reflectionContinue.style.display = "none";

    // Anti-gætte-pause FIRST (owner 2026-11-05): after a wrong answer, ask once whether it started a
    // pause. If it did, the pupil takes the whole pause, and a spillepause earned by the same answer is
    // held (heldBreakOffer) and offered when the pause is over — never lost, never shown during it.
    if (lastAnswerWasWrong) {
      lastAnswerWasWrong = false;
      if (await syncCooldownFromServer({ afterWrongAnswer: true })) {
        const earned = await takeBreakOffer();
        if (earned) heldBreakOffer = earned;
        return;
      }
    }

    // D-347: a spillepause due after the answer just registered (or held through a pause) is offered
    // here, at the transition, before the next question is fetched.
    if (await offerBreakIfDue()) return;

    const question = await getNextQuestion();

    if (!question) {
      // The state machine is stuck at LOADING_QUESTION with no valid exit.
      // Direct reset to IDLE is the only way to allow a legal retry transition.
      uiState = "IDLE";
      questionElement.textContent = "⚠️ Kunne ikke hente spørgsmål";
      questionElement.dataset.state = "error";
      optionsContainer.innerHTML = "";
      const retryBtn = document.createElement("button");
      retryBtn.id = "retry-question-btn";
      retryBtn.textContent = "Prøv igen";
      retryBtn.className = "submit-btn";
      retryBtn.onclick = () => { loadAndRenderQuestion(); };
      optionsContainer.appendChild(retryBtn);
      return;
    }

    if (question.step === "no_questions") {
      uiState = "IDLE"; // unblock state machine so retry button can re-enter LOADING_QUESTION
      questionElement.dataset.state = "empty";
      feedback.textContent = "";
      feedback.className = "";
      optionsContainer.innerHTML = "";

      if (currentSubject === "engelsk") {
        questionElement.textContent = "🎉 Du har klaret alle engelskopgaverne lige nu";
        const sub = document.createElement("p");
        sub.id = "no-questions-sub";
        sub.textContent = "Prøv historie på Spil-siden, eller kom tilbage senere.";
        optionsContainer.appendChild(sub);
      } else if (currentSubject === "dansk") {
        questionElement.textContent = "🎉 Du har klaret alle danskopgaverne lige nu";
        const sub = document.createElement("p");
        sub.id = "no-questions-sub";
        sub.textContent = "Prøv historie på Spil-siden, eller kom tilbage senere.";
        optionsContainer.appendChild(sub);
      } else if (activeDomains !== null) {
        const domainNames = activeDomains.map(d => DOMAIN_LABEL[d] ?? d).join(", ");
        questionElement.textContent = "Du har ingen flere spørgsmål i det tildelte emne.";
        const sub = document.createElement("p");
        sub.id = "no-questions-sub";
        sub.textContent = "Spørg din lærer om at tildele flere emner.  ·  Tildelt: " + domainNames;
        optionsContainer.appendChild(sub);
      } else {
        questionElement.textContent = "🎉 Du har ingen flere spørgsmål lige nu";
      }

      const hubBtn = document.createElement("button");
      hubBtn.id = "go-hub-btn";
      hubBtn.textContent = "Gå til hub";
      hubBtn.className = "submit-btn";
      hubBtn.onclick = () => { window.location.href = "hub.html"; };
      optionsContainer.appendChild(hubBtn);

      const retryBtn = document.createElement("button");
      retryBtn.id = "retry-question-btn";
      retryBtn.textContent = "Prøv igen";
      retryBtn.className = "submit-btn";
      retryBtn.onclick = () => { loadAndRenderQuestion(); };
      optionsContainer.appendChild(retryBtn);

      return;
    }

    if (!renderStimulus(question.content)) {
      // The material the question is about could not be shown: never ask the question without it.
      // Same exit as an unsupported interaction type below — visible error, a way out, no dead state.
      uiState = "IDLE";
      questionElement.textContent = "";
      questionElement.dataset.state = "error";
      optionsContainer.innerHTML = "";
      const msg = document.createElement("p");
      msg.id = "unsupported-format";
      msg.className = "feedback-error";
      msg.setAttribute("role", "alert");
      msg.textContent = "⚠️ Denne opgavetype kan ikke vises endnu.";
      optionsContainer.appendChild(msg);
      const hubBtn = document.createElement("button");
      hubBtn.id = "go-hub-btn";
      hubBtn.textContent = "Gå til hub";
      hubBtn.className = "submit-btn";
      hubBtn.onclick = () => { window.location.href = "hub.html"; };
      optionsContainer.appendChild(hubBtn);
      return;
    }

    questionElement.textContent = question.content.question;
    // 157O: optional read-aloud control — no-op when ENABLE_READ_ALOUD is off; fail-soft.
    attachReadAloudControl(questionElement, question.content.question, { subject: currentSubject });
    feedback.textContent = "";
    feedback.className = "";
    questionShownAt = Date.now();
    questionVisibleTimer?.restart();

    if (!renderOptions(question)) {
      // Unsupported interaction type: same exit as the load-error path above — the state machine
      // is reset to IDLE (no answer control means AWAITING_ANSWER would be a dead state), the
      // question is marked as an error, and the pupil has a visible way out.
      uiState = "IDLE";
      questionElement.dataset.state = "error";
      return;
    }

    setUIState(UI_STATES.AWAITING_ANSWER);
  }

  await fetchProgress();
  await fetchAvatar();
  await maybeShowIdentityPrompt();   // Section 152C — soft prompt, before grade
  await loadGrade();
  if (selectedGrade === null) await showGradeSelector();

  // Load both bands, then resolve starting difficulty.
  // Priority: persistedBand (earned) > placementBand (assessed before D-356) > GRADE_START_BAND (default).
  await loadAdaptiveBands();
  if (persistedBand !== null) {
    currentDifficultyBand = persistedBand;          // returning student — resume at earned level
  } else if (placementBand !== null) {
    currentDifficultyBand = placementBand;           // placed before D-356, no earned level yet
  }
  // else: currentDifficultyBand stays at GRADE_START_BAND[grade] set by loadGrade()

  await loadActiveDomains(); // show domain focus indicator if teacher has assigned domains

  const avatarDisplay = document.getElementById("avatar-display");
  if (avatarDisplay) {
    // 167A Phase-1 guard: when the raster baked base is active for this student, SKIP the
    // expression + blink overlays (the face is baked into the base). Presence/breathing
    // stays. C2/SVG path unchanged (r2 off/absent → engines mount as before). Engines are
    // already optional (try/catch → null) and every consumer null-guards, so skipping is a
    // supported state. Identity fetched here since it isn't known until the avatar renders.
    let quizIdentity = null;
    try {
      const { data } = await supabase.from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
      quizIdentity = data?.avatar_identity ?? null;
    } catch (e) { /* non-fatal */ }
    // Granular R2 engine gate (PR C, blink completed by PR D): expression overlay
    // stays OFF on the raster stack (the neutral raster face is in the stack);
    // blink runs on BOTH paths with the profile matching the active render path
    // (Option-A geometry/fill on active R2, unchanged C2 profile otherwise).
    // F1: key the engines off the ACTUAL mounted path (dataset.avatarRenderPath set
    // by mountC2Avatar's atomic gate) so an R2 asset-load fallback follows the C2
    // living contract (expression ON, C2 lids), not the manifest-only guess.
    const r2Active = avatarDisplay.dataset.avatarRenderPath === "r2";
    try { presenceEngine = new PresenceEngine(avatarDisplay);  } catch (e) { /* non-fatal */ }
    // D-069: expression runs on BOTH paths — C2 via its own overlay, R2 via a swap of the
    // decomposed z3 face layer (`{ r2: true }`). Blink/breathing are unaffected.
    try {
      exprEngine = r2Active
        ? new ExpressionEngine(avatarDisplay, { r2: true })
        : new ExpressionEngine(avatarDisplay);
    } catch (e) { /* non-fatal */ }
    const blinkCfg = blinkConfigFor(quizIdentity, r2Active);
    if (blinkCfg.allowed) {
      try { blinkEngine = new BlinkEngine(avatarDisplay, blinkCfg.skinTone, { mode: blinkCfg.mode }); } catch (e) { /* non-fatal */ }
    }
    // First-load render-complete signal: fetchAvatar() (awaited above) painted the
    // base/cosmetics and the expression engine has now attached its neutral overlay,
    // so the composite is final. Deterministic wait point for golden screenshots.
    await markAvatarRendered(avatarDisplay);
  }
  // H5 (off by default): an unresolved submission is settled before anything new is fetched.
  if (isH5SubmissionsEnabled() && !(await recoverPendingSubmission())) return;
  await loadAndRenderQuestion();
});

console.log("APP LOADED DEBUG");
