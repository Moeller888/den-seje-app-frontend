import { supabase } from "./supabase.js";

window.__sb = supabase;

/* ========================
   DEBUG / OBSERVABILITY
======================== */

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

/* ========================
   UI STATE MACHINE
======================== */

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

/* ========================
   AUTH
======================== */

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace("login.html");
    return false;
  }

  const userId = sessionData.session.user.id;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile || profile.role !== "student") {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return false;
  }

  return true;
}

const authorized = await checkAuthAndRole();
if (!authorized) throw new Error("Unauthorized");

document.body.style.display = "block";

/* ========================
   BFCache Protection
======================== */

window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.replace("login.html");
    }
  }
});

/* ========================
   LOGOUT
======================== */

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.replace("login.html");
  });
}

/* ========================
   DOM
======================== */

const questionElement = document.getElementById("question");
const optionsContainer = document.getElementById("options");
const feedback = document.getElementById("feedback");

const profileLevelEl = document.getElementById("profileLevel");
const xpValueEl = document.getElementById("xpValue");
const xpBar = document.getElementById("xpBar");
const coinsEl = document.getElementById("coinsValue");

/* ========================
   GLOBAL STATE
======================== */

let currentProfile = null;
let currentInstanceId = null;
let activeSubmissionToken = null;

/* ========================
   PROFILE
======================== */

async function fetchProgress() {
  const { data, error } = await supabase
    .from("student_progress")
    .select("*")
    .single();

  if (error) {
    logError("FETCH_PROGRESS_FAILED", error);
    throw error;
  }

  currentProfile = data;
  logEvent("PROGRESS_FETCHED", { xp: data.xp });
}

function updateProfileUI() {
  if (!currentProfile) return;

  profileLevelEl.textContent = currentProfile.level;
  xpValueEl.textContent = `${currentProfile.xp} XP`;
  coinsEl.textContent = `${currentProfile.coins} 🪙`;

  const percent =
    (currentProfile.mastery_balance + 3) / 6 * 100;

  xpBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

/* ========================
   TOKEN
======================== */

function generateToken() {
  if (self.crypto && typeof self.crypto.randomUUID === "function") {
    return self.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now();
}

/* ========================
   ANSWER SUBMIT
======================== */

async function submitAnswer(userAnswer) {

  if (uiState !== UI_STATES.AWAITING_ANSWER) return;

  setState(UI_STATES.SUBMITTING_ANSWER);

  lockAllButtons(true);
  feedback.textContent = "Indsender...";

  const token = generateToken();
  activeSubmissionToken = token;

  logEvent("SUBMIT_ANSWER", { instance: currentInstanceId });

  try {

    const { data, error } = await supabase.functions.invoke(
      "process-event",
      {
        body: {
          question_instance_id: currentInstanceId,
          user_answer: userAnswer
        }
      }
    );

    if (activeSubmissionToken !== token) {
      logEvent("STALE_RESPONSE_IGNORED");
      return;
    }

    if (error) throw error;

    if (!data || typeof data.correct !== "boolean") {
      throw new Error("Invalid backend contract");
    }

    currentProfile = data;
    updateProfileUI();

    feedback.textContent = data.correct ? "Korrekt!" : "Forkert.";
    feedback.style.color = data.correct ? "green" : "red";

    logEvent("ANSWER_PROCESSED", { correct: data.correct });

    setState(UI_STATES.TRANSITIONING);

    setTimeout(() => {
      loadAndRenderQuestion();
    }, 450);

  } catch (err) {

    logError("SUBMIT_FAILED", err);

    feedback.textContent = "Netværksfejl. Prøv igen.";
    feedback.style.color = "orange";

    lockAllButtons(false);

    setState(UI_STATES.AWAITING_ANSWER);
  }
}

/* ========================
   QUESTION FETCH
======================== */

async function getNextQuestion() {

  if (uiState !== UI_STATES.LOADING_QUESTION) return null;

  logEvent("REQUEST_NEXT_QUESTION");

  const { data, error } = await supabase.functions.invoke(
    "get-next-question",
    { body: {} }
  );

  if (error) {
    logError("GET_NEXT_QUESTION_FAILED", error);
    throw error;
  }

  if (!data || !data.question_instance_id || !data.content) {
    throw new Error("Invalid backend contract (get-next-question)");
  }

  currentInstanceId = data.question_instance_id;

  logEvent("QUESTION_RECEIVED", { instance: currentInstanceId });

  return data;
}

/* ========================
   RENDER
======================== */

function lockAllButtons(lock) {
  const buttons = optionsContainer.querySelectorAll("button");
  buttons.forEach(btn => {
    btn.disabled = lock;
  });
}

function renderOptions(question) {

  optionsContainer.innerHTML = "";

  // 🔥 NYT: styr rendering via answer_format
  if (question.answer_format === "year") {

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 4;
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 4);
    });

    const btn = document.createElement("button");
    btn.textContent = "Svar";

    btn.onclick = () => {
      if (input.value.length !== 4) return;
      submitAnswer(input.value);
    };

    optionsContainer.appendChild(input);
    optionsContainer.appendChild(btn);
    return;
  }

  if (question.type === "mc_single" && question.content?.options) {
    question.content.options.forEach(option => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.onclick = () => submitAnswer(option);
      optionsContainer.appendChild(btn);
    });
  }

  if (question.type === "text_input") {
    const textarea = document.createElement("textarea");
    const btn = document.createElement("button");
    btn.textContent = "Indsend svar";

    btn.onclick = () => {
      const answer = textarea.value.trim();
      if (!answer) return;
      submitAnswer(answer);
    };

    optionsContainer.appendChild(textarea);
    optionsContainer.appendChild(btn);
  }

  if (question.type === "number_input") {
    const input = document.createElement("input");
    input.type = "number";

    const btn = document.createElement("button");
    btn.textContent = "Svar";

    btn.onclick = () => {
      if (!input.value) return;
      submitAnswer(input.value);
    };

    optionsContainer.appendChild(input);
    optionsContainer.appendChild(btn);
  }
}

async function loadAndRenderQuestion() {

  setState(UI_STATES.LOADING_QUESTION);

  const question = await getNextQuestion();
  if (!question) return;

  questionElement.textContent = question.content.question;
  feedback.textContent = "";
  feedback.style.color = "black";

  renderOptions(question);

  setState(UI_STATES.AWAITING_ANSWER);
}

/* ========================
   INIT
======================== */

await fetchProgress();
updateProfileUI();

await loadAndRenderQuestion();