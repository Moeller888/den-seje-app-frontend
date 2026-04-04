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

    if (data) {
      if (data.correct) {
        feedback.textContent = "✅ Korrekt!";
        feedback.style.color = "green";
      } else {
        feedback.textContent = "❌ Forkert – korrekt svar: " + (data.correct_answer ?? "");
        feedback.style.color = "red";
      }
      feedback.style.fontSize = "24px";
      feedback.style.fontWeight = "bold";

      await fetchProgress();
      setState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 500);
    }
  }

  async function getNextQuestion() {
    setState(UI_STATES.LOADING_QUESTION);

    const { data } = await supabase.functions.invoke(
      "get-next-question",
      { body: {} }
    );

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    console.log("RAW RESPONSE:", parsed);

    if (!parsed || !parsed.content) {
      console.error("INVALID RESPONSE FROM BACKEND:", parsed);
      return null;
    }

    currentInstanceId = parsed.question_instance_id ?? null;

    logEvent("QUESTION_RECEIVED", { instance: currentInstanceId });

    return parsed;
  }

  function renderOptions(question) {
    optionsContainer.innerHTML = "";

    if (!question) {
      questionElement.textContent = "Fejl i data";
      return;
    }

    if (question.answer_format === "year") {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Skriv dit svar her...";
      input.maxLength = 4;

      const btn = document.createElement("button");
      btn.textContent = "Svar";

      btn.onclick = () => {
        if (input.value.length === 4) {
          submitAnswer(input.value);
        }
      };

      optionsContainer.appendChild(input);
      optionsContainer.appendChild(btn);
    }

    if (question.answer_format === "mc") {
      const options = question.content.options ?? [];
      for (const option of options) {
        const btn = document.createElement("button");
        btn.textContent = option;
        btn.onclick = () => { submitAnswer(option); };
        optionsContainer.appendChild(btn);
      }
    }
  }

  async function loadAndRenderQuestion() {
    const question = await getNextQuestion();

    if (!question) return;

    questionElement.textContent = question.content.question;

    feedback.textContent = "";

    questionShownAt = Date.now();

    renderOptions(question);

    setState(UI_STATES.AWAITING_ANSWER);
  }

  await fetchProgress();
  await loadAndRenderQuestion();
});
