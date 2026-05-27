import { supabase } from "./supabaseClient.js";
import { calculateLevelFromXP, getXPProgressInLevel } from "./js/progression.js";
import { playSound } from "./js/audio.js";
import { ALL_SLOTS, SLOT_Z, BASE_SRC } from "./js/avatar-layers.js";
import { ExpressionEngine } from "./js/avatar-expression-engine.js";
import { PresenceEngine } from "./js/avatar-presence-engine.js";

window.__sb = supabase;

const DEBUG = true;
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

let exprEngine = null;
let presenceEngine = null;

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
    base.className = "quiz-avatar-layer";
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
      img.className = "quiz-avatar-layer";
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
    text.textContent = `Du er nu level ${newLevel}!`;
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
      feedback.textContent = "✅ Korrekt!";
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

      await fetchProgress();

      // Reflection density gate (Section 55):
      // Enter reflection state only for the first 2 consecutive incorrect+reviewText answers.
      // After 2 back-to-back reflections, auto-advance — prevents reflection fatigue in losing streaks.
      if (reviewText && sessionConsecutiveReflections < 2) {
        sessionConsecutiveReflections++;
        feedback.textContent = "❌ Forkert";
        feedback.className = "feedback-error";
        setTimeout(() => enterReflectionState(reviewText), 400);
        return;
      }

      if (reviewText) {
        logEvent("REFLECTION_DENSITY_GATE", { sessionConsecutiveReflections, gated: true });
      }

      feedback.textContent = "❌ Forkert – korrekt svar: " + (data.correct_answer ?? "ukendt");
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
      { body: { session_context: sessionContext } }
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
      questionElement.textContent = "⚠️ Kunne ikke hente spørgsmål – genindlæs siden";
      questionElement.dataset.state = "error";
      optionsContainer.innerHTML = "";
      return;
    }

    if (question.step === "no_questions") {
      questionElement.textContent = "🎉 Du har ingen flere spørgsmål lige nu";
      questionElement.dataset.state = "empty";
      optionsContainer.innerHTML = "";
      feedback.textContent = "";
      feedback.className = "";
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
  const avatarDisplay = document.getElementById("avatar-display");
  if (avatarDisplay) {
    try { exprEngine = new ExpressionEngine(avatarDisplay); } catch (e) { /* non-fatal */ }
    try { presenceEngine = new PresenceEngine(avatarDisplay); } catch (e) { /* non-fatal */ }
  }
  await loadAndRenderQuestion();
});

console.log("APP LOADED DEBUG");
