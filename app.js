import { supabase } from "./supabaseClient.js";

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
  TRANSITIONING: "TRANSITIONING"
};

function setState(newState) {
  const allowed = {
    IDLE: ["LOADING_QUESTION"],
    LOADING_QUESTION: ["AWAITING_ANSWER"],
    AWAITING_ANSWER: ["SUBMITTING_ANSWER"],
    SUBMITTING_ANSWER: ["TRANSITIONING", "AWAITING_ANSWER"],
    TRANSITIONING: ["LOADING_QUESTION"]
  };

  if (!allowed[uiState]?.includes(newState)) {
    logError("INVALID_STATE_TRANSITION", { from: uiState, to: newState });
    return;
  }

  uiState = newState;
  logEvent("STATE_CHANGED", { to: newState });
}

let studentId = null;
let currentInstanceId = null;
let questionShownAt = null;

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session) {
    window.location.replace("login.html");
    return false;
  }

  studentId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .limit(1);

  const profile = Array.isArray(data) ? data[0] : null;

  if (error || !profile || profile.role !== "student") {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return false;
  }

  return true;
}

document.addEventListener("DOMContentLoaded", async () => {

  const authorized = await checkAuthAndRole();
  if (!authorized) return;

  const questionElement = document.getElementById("question");
  const optionsContainer = document.getElementById("options");
  const feedback = document.getElementById("feedback");
  const levelEl = document.getElementById("level");
  const xpEl = document.getElementById("xp");
  const coinsEl = document.getElementById("coins");
  const logoutBtn = document.getElementById("logout-btn");

  logoutBtn.onclick = async () => {
    await supabase.auth.signOut();
    window.location.replace("login.html");
  };

  function applyProgressToUI(progress) {
    const xp = Number(progress?.xp ?? 0);
    const coins = Number(progress?.coins ?? 0);
    const level = Number(progress?.level ?? 1);

    xpEl.textContent = xp;
    coinsEl.textContent = coins;
    levelEl.textContent = level;

    const xpBar = document.getElementById("xp-bar");
    const xpForNextLevel = Math.max(level * 100, 1);
    const safeProgress = Math.min((xp % xpForNextLevel) / xpForNextLevel, 1);

    if (xpBar) {
      xpBar.style.width = (safeProgress * 100) + "%";
    }
  }

  async function fetchProgress() {
    const { data, error } = await supabase
      .from("student_progress")
      .select("xp, coins, level")
      .eq("student_id", studentId)
      .limit(1);

    if (error) {
      logError("PROGRESS_FETCH_ERROR", error);
      applyProgressToUI(null);
      return;
    }

    const progress = Array.isArray(data) ? data[0] : null;
    applyProgressToUI(progress);

    logEvent("PROGRESS_FETCHED", progress);
  }

  async function submitAnswer(userAnswer) {

    if (uiState !== UI_STATES.AWAITING_ANSWER) return;

    setState(UI_STATES.SUBMITTING_ANSWER);

    const buttons = optionsContainer.querySelectorAll("button");
    buttons.forEach(btn => btn.disabled = true);

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

    if (error || !data || !data.status) {
      logError("SUBMIT_ERROR", error || data);
      feedback.textContent = "⚠️ Fejl ved svar";
      setState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (data.status === "correct") {
      feedback.textContent = "✅ Korrekt!";
    } else if (data.status === "incorrect") {
      feedback.textContent = "❌ Forkert";
    } else {
      feedback.textContent = "⏳ Afventer";
    }

    await fetchProgress();
    setState(UI_STATES.TRANSITIONING);

    setTimeout(() => {
      loadAndRenderQuestion();
    }, 800);
  }

  async function getNextQuestion() {
    setState(UI_STATES.LOADING_QUESTION);

    const { data, error } = await supabase.functions.invoke(
      "get-next-question",
      { body: {} }
    );

    if (error) {
      logError("GET_QUESTION_ERROR", error);
      return null;
    }

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    if (!parsed || !parsed.content || !parsed.content.question) {
      logError("INVALID_QUESTION", parsed);
      return null;
    }

    currentInstanceId = parsed.question_instance_id ?? null;

    return parsed;
  }

  function renderOptions(question) {
    optionsContainer.innerHTML = "";

    const content = question?.content;

    if (!content || !Array.isArray(content.options) || content.options.length === 0) {
      logError("INVALID_OPTIONS", content);

      const errorMsg = document.createElement("p");
      errorMsg.textContent = "⚠️ Spørgsmål mangler svarmuligheder";
      errorMsg.style.color = "red";

      optionsContainer.appendChild(errorMsg);
      return;
    }

    const options = content.options;

    options.forEach(option => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.onclick = () => submitAnswer(option);
      optionsContainer.appendChild(btn);
    });
  }

  async function loadAndRenderQuestion() {
    const question = await getNextQuestion();

    console.log("RAW QUESTION OBJECT:", question);
    console.log("OPTIONS:", question?.content?.options);
    console.log("FORMAT:", question?.answer_format);

    if (!question) {
      questionElement.textContent = "⚠️ Kunne ikke hente spørgsmål";
      optionsContainer.innerHTML = "";
      return;
    }

    questionElement.textContent = question.content.question;
    feedback.textContent = "";
    questionShownAt = Date.now();

    renderOptions(question);

    setState(UI_STATES.AWAITING_ANSWER);
  }

  await fetchProgress();
  await loadAndRenderQuestion();
});

console.log("QUIZ PAGE LOADED");