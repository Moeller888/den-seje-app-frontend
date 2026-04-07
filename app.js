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

  let currentInstanceId = null;
  let questionShownAt = null;

  async function fetchProgress() {
    const { data } = await supabase
      .from("student_progress")
      .select("*")
      .maybeSingle();

    if (data) {
      xpEl.textContent = data.xp ?? 0;
      coinsEl.textContent = data.coins ?? 0;
      levelEl.textContent = data.level ?? 1;

      const xpBar = document.getElementById("xp-bar");
      const xp = data.xp ?? 0;
      const level = data.level ?? 1;
      const xpForNextLevel = level * 100;
      const progress = Math.min((xp % xpForNextLevel) / xpForNextLevel, 1);
      xpBar.style.width = (progress * 100) + "%";

      logEvent("PROGRESS_FETCHED", { xp: data.xp });
    }
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
      return;
    }

    console.log("FUNCTION RESPONSE:", data);

    if (!data || !data.status) {
      logError("INVALID_RESPONSE", data);
      return;
    }

    // ?? ÉN sandhed: status
    if (data.status === "pending") {
      feedback.textContent = "? Afventer lærerens vurdering";
      feedback.style.color = "orange";

    } else if (data.status === "correct") {
      feedback.textContent = "? Korrekt!";
      feedback.style.color = "green";

    } else if (data.status === "incorrect") {
      feedback.textContent = "? Forkert – korrekt svar: " + (data.correct_answer ?? "ukendt");
      feedback.style.color = "red";

    } else {
      logError("UNKNOWN_STATUS", data.status);
      return;
    }

    await fetchProgress();
    setState(UI_STATES.TRANSITIONING);

    // ?? deterministisk delay
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

  console.log("RAW QUESTION RESPONSE:", parsed);

  if (!parsed) return null;

  if (parsed.step === "no_questions") {
    console.warn("NO QUESTIONS FROM BACKEND");
    return { step: "no_questions" };
  }

  if (!parsed.content || !parsed.content.question) {
    logError("INVALID_QUESTION_FORMAT", parsed);
    return null;
  }

  currentInstanceId = parsed.question_instance_id ?? null;

  return parsed;
} = await supabase.functions.invoke(
      "get-next-question",
      { body: {} }
    );

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    if (!parsed || !parsed.content) {
      return null;
    }

    currentInstanceId = parsed.question_instance_id ?? null;

    return parsed;
  }

  function renderOptions(question) {
    optionsContainer.innerHTML = "";

    if (!question || !question.content) {
      console.error("INVALID QUESTION:", question);
      return;
    }

    const format = (question.answer_format || "").toLowerCase();
    let options = question.content.options;

    // ?? DEFENSIVE FIXES
    if (!Array.isArray(options)) {
      console.warn("OPTIONS NOT ARRAY ? fallback");
      options = [];
    }

    if (options.length === 0 && format.includes("mc")) {
      console.warn("EMPTY OPTIONS ? injecting fallback");
      options = ["A", "B", "C", "D"];
    }

    // NUMBER
    if (format.includes("number")) {
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 4;

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

    // TEXT
    if (format === "text") {
      const textarea = document.createElement("textarea");

      const btn = document.createElement("button");
      btn.textContent = "Send svar";

      btn.onclick = () => {
        if (textarea.value.trim()) {
          submitAnswer(textarea.value);
        }
      };

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(btn);
      return;
    }

    // MC
    if (format.includes("mc")) {
      options.forEach((option) => {
        const btn = document.createElement("button");
        btn.textContent = option;
        btn.onclick = () => submitAnswer(option);
        optionsContainer.appendChild(btn);
      });
      return;
    }

    console.error("UNKNOWN FORMAT:", format);
  }

  async function loadAndRenderQuestion() {
  const question = await getNextQuestion();

  if (!question) {
    questionElement.textContent = "?? Kunne ikke hente spørgsmål";
    optionsContainer.innerHTML = "";
    return;
  }

  if (question.step === "no_questions") {
    questionElement.textContent = "?? Du har ingen flere spørgsmål lige nu";
    optionsContainer.innerHTML = "";
    feedback.textContent = "";
    return;
  }

  questionElement.textContent = question.content.question;
  feedback.textContent = "";
  questionShownAt = Date.now();

  console.log("FULL QUESTION:", question);
  renderOptions(question);

  setState(UI_STATES.AWAITING_ANSWER);
}

  await fetchProgress();
  await loadAndRenderQuestion();
});

console.log('APP LOADED DEBUG');
