import { supabase } from "./supabaseClient.js";
import { calculateLevelFromXP, getXPProgressInLevel } from "./js/progression.js";
import { playSound } from "./js/audio.js";
import { ALL_SLOTS, SLOT_Z, BASE_SRC } from "./js/avatar-layers.js";
import { ExpressionEngine } from "./js/avatar-expression-engine.js";
import { PresenceEngine } from "./js/avatar-presence-engine.js";
import { BlinkEngine } from "./js/avatar-blink-engine.js";

window.__sb = supabase;

const DEBUG = true;
const GRADE_START_BAND = { 7: 1, 8: 2, 9: 3 };
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
}

const UI_STATES = {
  IDLE: "IDLE",
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
  SUBMITTING_ANSWER: "SUBMITTING_ANSWER",
  REFLECTING: "REFLECTING",
  TRANSITIONING: "TRANSITIONING"
};

function setState(newState) {
  const allowed = {
    IDLE: ["LOADING_QUESTION"],
    LOADING_QUESTION: ["AWAITING_ANSWER"],
    AWAITING_ANSWER: ["SUBMITTING_ANSWER"],
    SUBMITTING_ANSWER: ["TRANSITIONING", "AWAITING_ANSWER", "REFLECTING"],
    REFLECTING: ["TRANSITIONING"],
    TRANSITIONING: ["LOADING_QUESTION"]
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
    REFLECTING: "reflecting"
  };

  const domState = map[newState];
  if (domState) {
    const el = document.getElementById("question");
    if (el) el.dataset.state = domState;
  }
}

let exprEngine    = null;
let presenceEngine = null;
let blinkEngine   = null;

let studentId = null;
let currentInstanceId = null;
let questionShownAt = null;
let lastKnownXp = 0;
let lastKnownCoins = 0;

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

// 🔥 Sikrer altid 4 svar
function ensureFourOptions(options) {
  const pool = ["1939","1940","1941","1942","1943","1944","1945","1946"];

  const unique = new Set(options);

  while (unique.size < 4) {
    const random = pool[Math.floor(Math.random() * pool.length)];
    unique.add(random);
  }

  return Array.from(unique).sort(() => Math.random() - 0.5);
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
  const optionsContainer = document.getElementById("options");
  const feedback = document.getElementById("feedback");
  const reviewFeedback = document.getElementById("review-feedback");
  const reflectionContinue = document.getElementById("reflection-continue");
  const levelEl = document.getElementById("level");
  const xpEl = document.getElementById("xp");
  const coinsEl = document.getElementById("coins");
  const logoutBtn = document.getElementById("logout-btn");

  logoutBtn.onclick = async () => {
    await supabase.auth.signOut();
    window.location.replace("login.html");
  };

  // Hidden achievement tracking — session-scoped, resets on page load.
  let sessionCorrectStreak = 0;
  let bestSessionStreak    = 0;

  // Challenge-wave state machine — session-scoped, drives adaptive sequencing.
  // Resets on page load. No persistent student state — purely local pacing.
  let sessionWavePhase = 'challenge';
  let sessionConsecutiveCorrect = 0;
  let sessionConsecutiveIncorrect = 0;
  let lastMisconceptionType = null;

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
  // Runs once on first login after grade selection. Fetches 10 questions
  // across bands 1-4 directly (no XP, no question_instances created).
  // Saves result as profiles.placement_band to seed starting difficulty.

  async function loadAdaptiveBands() {
    const { data } = await supabase
      .from("profiles")
      .select("placement_band, current_band")
      .eq("id", studentId)
      .maybeSingle();
    placementBand = data?.placement_band ?? null;
    persistedBand = data?.current_band ?? null;
  }

  async function fetchPlacementQuestions(grade) {
    const collected = [];
    // 3 band-1, 3 band-2, 2 band-3, 2 band-4 = 10 total
    const bandTargets = [[1, 3], [2, 3], [3, 2], [4, 2]];

    for (const [band, count] of bandTargets) {
      const { data, error } = await supabase
        .from("questions")
        .select("id, content, difficulty_band")
        .eq("is_active", true)
        .eq("answer_format", "mc")
        .eq("difficulty_band", band)
        .or(`target_grade.lte.${grade},target_grade.is.null`)
        .limit(count * 5);

      if (error || !data || data.length === 0) continue;

      const shuffled = [...data].sort(() => Math.random() - 0.5);
      collected.push(...shuffled.slice(0, Math.min(count, shuffled.length)));
    }

    return collected.sort(() => Math.random() - 0.5);
  }

  // Scoring: correct answer on band N scores N points. Wrong scores 0.
  // Hard correct answers strongly reward; hard wrong answers do not punish.
  // Max = 3×1 + 3×2 + 2×3 + 2×4 = 23
  function calculatePlacementBand(responses) {
    let score = 0;
    for (const r of responses) {
      if (r.correct) score += r.band;
    }
    if (score >= 18) return 4;
    if (score >= 12) return 3;
    if (score >= 6)  return 2;
    return 1;
  }

  async function savePlacementBand(band) {
    try {
      await supabase
        .from("profiles")
        .update({ placement_band: band })
        .eq("id", studentId);
    } catch (e) {
      logError("PLACEMENT_SAVE_ERROR", e);
    }
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

      const questions = await fetchPlacementQuestions(selectedGrade ?? 7);

      if (!questions || questions.length < 5) {
        logEvent("PLACEMENT_SKIPPED", { reason: "insufficient_questions", count: questions?.length ?? 0 });
        resolve();
        return;
      }

      overlay.style.display = "flex";

      const responses = [];
      const total = questions.length;

      for (let i = 0; i < total; i++) {
        const q = questions[i];

        const questionText = q?.content?.question ?? null;
        if (!questionText) continue;

        progressBar.style.width = ((i / total) * 100) + "%";
        countEl.textContent = (i + 1) + " / " + total;
        questionEl.textContent = questionText;

        let options = q?.content?.options ?? [];
        if (!Array.isArray(options) || options.length < 2) continue;

        const correct = q?.content?.correct ?? "";
        options = [...options].sort(() => Math.random() - 0.5);

        optionsEl.innerHTML = "";

        const wasCorrect = await new Promise((resolveAnswer) => {
          options.forEach((opt) => {
            const btn = document.createElement("button");
            btn.className = "placement-option-btn";
            btn.textContent = opt;
            btn.onclick = () => {
              optionsEl.querySelectorAll(".placement-option-btn").forEach((b) => { b.disabled = true; });
              const isCorrect = opt === correct;
              btn.classList.add(isCorrect ? "placement-correct" : "placement-incorrect");
              setTimeout(() => resolveAnswer(isCorrect), 500);
            };
            optionsEl.appendChild(btn);
          });
        });

        responses.push({ correct: wasCorrect, band: q.difficulty_band ?? 1 });
      }

      progressBar.style.width = "100%";

      const band = calculatePlacementBand(responses);
      await savePlacementBand(band);
      placementBand = band;

      logEvent("PLACEMENT_COMPLETE", { score: responses.filter(r => r.correct).reduce((s, r) => s + r.band, 0), band });

      questionEl.textContent = "Klar! Vi starter dig det rigtige sted.";
      optionsEl.innerHTML = "";
      countEl.textContent = "";

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

    if (activeDomains !== null) {
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

    // Base body always visible — render immediately (no network wait)
    const base = document.createElement("img");
    base.className = "quiz-avatar-layer avatar-slot-base";
    base.src = BASE_SRC;
    base.style.zIndex = "0";
    base.alt = "";
    avatarDisplay.appendChild(base);

    // Load equipped slots from profiles
    const { data: profileData } = await supabase
      .from("profiles")
      .select("equipped_slots")
      .eq("id", studentId)
      .maybeSingle();

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

  function enterReflectionState(reviewText) {
    setUIState(UI_STATES.REFLECTING);
    feedback.textContent = "";
    feedback.className = "";
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

  async function submitAnswer(userAnswer, clickedBtn = null) {

    if (uiState !== UI_STATES.AWAITING_ANSWER) return;

    setUIState(UI_STATES.SUBMITTING_ANSWER);

    const buttons = optionsContainer.querySelectorAll("button");
    buttons.forEach(btn => btn.disabled = true);

    console.log("SUBMIT:", { studentId, currentInstanceId, userAnswer });

    const { data, error } = await supabase.functions.invoke(
      "process-event",
      {
        body: {
          student_id: studentId,
          question_instance_id: currentInstanceId,
          answer: userAnswer,
          question_shown_at: questionShownAt
        }
      }
    );

    if (error) {
      logError("SUBMIT_ERROR", error);

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

    const prevXp = lastKnownXp;
    const prevCoins = lastKnownCoins;
    sessionQuestionCount++;
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
        supabase.rpc("update_best_session_streak", { p_count: bestSessionStreak }).catch(() => {});
      }

      // Hidden achievement: night_owl — correct answer between 00:00–03:59 local time
      if (new Date().getHours() < 4) {
        supabase.rpc("set_night_correct").catch(() => {});
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
        setTimeout(() => enterReflectionState(reviewText), 400);
        return;
      }

      if (reviewText) {
        logEvent("REFLECTION_DENSITY_GATE", { sessionConsecutiveReflections, gated: true });
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
      { body: { session_context: sessionContext, selected_grade: selectedGrade, current_difficulty_band: currentDifficultyBand } }
    );

    if (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
      ({ data, error } = await supabase.functions.invoke("get-next-question", { body: {} }));
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

    console.log("INSTANCE ID:", currentInstanceId);

    return parsed;
  }

  function renderOptions(question) {
    optionsContainer.innerHTML = "";

    const format = (question.answer_format || "").toLowerCase();
    const content = question.content;

    let options = content.options;

    if (!Array.isArray(options)) options = [];

    if (content.force_text === true) {
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
      return;
    }

    if (format.includes("mc")) {
      options = ensureFourOptions(options);
    }

    if (format.includes("number")) {
      const input = document.createElement("input");
      input.type = "text";

      const btn = document.createElement("button");
      btn.className = "submit-btn";
      btn.textContent = "Svar";

      btn.onclick = () => {
        const val = Number(input.value);
        if (!Number.isNaN(val)) {
          submitAnswer(String(val), btn);
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btn.onclick();
      });

      optionsContainer.appendChild(input);
      optionsContainer.appendChild(btn);
      return;
    }

    if (format === "text") {
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
      return;
    }

    options.forEach((option) => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.onclick = () => submitAnswer(option, btn);
      optionsContainer.appendChild(btn);
    });
  }

  async function loadAndRenderQuestion() {
    // Clean up reflection state if active from previous question
    optionsContainer.style.display = "";
    reviewFeedback.textContent = "";
    reviewFeedback.classList.remove("visible");
    reflectionContinue.style.display = "none";

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

      if (activeDomains !== null) {
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

    questionElement.textContent = question.content.question;
    feedback.textContent = "";
    feedback.className = "";
    questionShownAt = Date.now();

    renderOptions(question);

    setUIState(UI_STATES.AWAITING_ANSWER);
  }

  await fetchProgress();
  await fetchAvatar();
  await loadGrade();
  if (selectedGrade === null) await showGradeSelector();

  // Load both bands, then resolve starting difficulty.
  // Priority: persistedBand (earned) > placementBand (assessed) > GRADE_START_BAND (default).
  await loadAdaptiveBands();
  if (placementBand === null && selectedGrade !== null) {
    await runPlacementFlow(); // first-time only — sets placementBand
  }
  if (persistedBand !== null) {
    currentDifficultyBand = persistedBand;          // returning student — resume at earned level
  } else if (placementBand !== null) {
    currentDifficultyBand = placementBand;           // post-placement first session
  }
  // else: currentDifficultyBand stays at GRADE_START_BAND[grade] set by loadGrade()

  await loadActiveDomains(); // show domain focus indicator if teacher has assigned domains

  const avatarDisplay = document.getElementById("avatar-display");
  if (avatarDisplay) {
    try { exprEngine    = new ExpressionEngine(avatarDisplay); } catch (e) { /* non-fatal */ }
    try { presenceEngine = new PresenceEngine(avatarDisplay);  } catch (e) { /* non-fatal */ }
    try { blinkEngine   = new BlinkEngine(avatarDisplay);      } catch (e) { /* non-fatal */ }
  }
  await loadAndRenderQuestion();
});

console.log("APP LOADED DEBUG");
