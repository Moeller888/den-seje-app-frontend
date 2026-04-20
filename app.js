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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .limit(1);

  const safeProfile = Array.isArray(profile) ? profile[0] : null;

  if (error || !safeProfile || safeProfile.role !== "student") {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return false;
  }

  return true;
}

function ensureFourOptions(options) {
  const pool = ["1939","1940","1941","1942","1943","1944","1945","1946"];

  const unique = new Set(options);

  while (unique.size < 4) {
    const random = pool[Math.floor(Math.random() * pool.length)];
    unique.add(random);
  }

  return Array.from(unique).sort(() => Math.random() - 0.5);
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

    const safeData = Array.isArray(data) ? data[0] : null;

    if (!safeData) {
      logEvent("NO_PROGRESS_FOUND");
      applyProgressToUI(null);
      return;
    }

    applyProgressToUI(safeData);

    logEvent("PROGRESS_FETCHED", { xp: safeData.xp });
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

    if (error) {
      logError("SUBMIT_ERROR", error);

      feedback.textContent = "⚠️ Fejl ved svar – prøv igen";
      feedback.style.color = "red";

      setState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (!data || !data.status) {
      logError("INVALID_RESPONSE", data);

      feedback.textContent = "⚠️ Ugyldigt svar fra server";
      feedback.style.color = "red";

      setState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (data.status === "pending") {
      feedback.textContent = "⏳ Afventer lærerens vurdering";
      feedback.style.color = "orange";

    } else if (data.status === "correct") {
      feedback.textContent = "✅ Korrekt!";
      feedback.style.color = "green";

    } else if (data.status === "incorrect") {
      feedback.textContent = "❌ Forkert – korrekt svar: " + (data.correct_answer ?? "ukendt");
      feedback.style.color = "red";

    } else {
      logError("UNKNOWN_STATUS", data.status);

      feedback.textContent = "⚠️ Ukendt status fra server";
      feedback.style.color = "red";

      setState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    await fetchProgress();
    setState(UI_STATES.TRANSITIONING);

    let delay = 1000;
    if (data.status === "correct") delay = 600;
    if (data.status === "incorrect") delay = 2000;

    setTimeout(() => { loadAndRenderQuestion(); }, delay);
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

    if (!parsed) return null;

    if (parsed.step === "no_questions") {
      return { step: "no_questions" };
    }

    if (!parsed.content || !parsed.content.question) {
      logError("INVALID_QUESTION_FORMAT", parsed);
      return null;
    }

    currentInstanceId = parsed.question_instance_id ?? null;

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
      btn.textContent = "Send svar";

      btn.onclick = () => {
        submitAnswer(textarea.value);
      };

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
      btn.textContent = "Svar";

      btn.onclick = () => {
        const val = Number(input.value);
        if (!Number.isNaN(val)) {
          submitAnswer(String(val));
        }
      };

      optionsContainer.appendChild(input);
      optionsContainer.appendChild(btn);
      return;
    }

    if (format === "text") {
      const textarea = document.createElement("textarea");

      const btn = document.createElement("button");
      btn.textContent = "Send svar";

      btn.onclick = () => {
        submitAnswer(textarea.value);
      };

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(btn);
      return;
    }

    options.forEach((option) => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.onclick = () => submitAnswer(option);
      optionsContainer.appendChild(btn);
    });
  }

  async function loadAndRenderQuestion() {
    const question = await getNextQuestion();

    if (!question) {
      questionElement.textContent = "⚠️ Kunne ikke hente spørgsmål";
      optionsContainer.innerHTML = "";
      return;
    }

    if (question.step === "no_questions") {
      questionElement.textContent = "🎉 Du har ingen flere spørgsmål lige nu";
      optionsContainer.innerHTML = "";
      feedback.textContent = "";
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

console.log("APP LOADED DEBUG");