import { supabase } from "./supabase.js";

window.__sb = supabase;

/* ========================
   DEBUG
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
   STATE MACHINE
======================== */

const UI_STATES = {
  IDLE: "IDLE",
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
  SUBMITTING_ANSWER: "SUBMITTING_ANSWER",
  TRANSITIONING: "TRANSITIONING"
};

function setState(newState) {
  uiState = newState;
  logEvent("STATE_CHANGED", { to: newState });
}

/* ========================
   AUTH
======================== */

let studentId = null;

async function checkAuthAndRole() {

  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace("login.html");
    return false;
  }

  studentId = sessionData.session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .maybeSingle();

  if (!profile || profile.role !== "student") {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return false;
  }

  return true;
}

window.addEventListener("DOMContentLoaded", async () => {

  const authorized = await checkAuthAndRole();
  if (!authorized) return;

  document.body.style.display = "block";

  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.replace("login.html");
    });
  }

  const questionElement = document.getElementById("question");
  const optionsContainer = document.getElementById("options");
  const feedback = document.getElementById("feedback");

  const profileLevelEl = document.getElementById("profileLevel");
  const xpValueEl = document.getElementById("xpValue");
  const xpBar = document.getElementById("xpBar");
  const coinsEl = document.getElementById("coinsValue");

  coinsEl.textContent = "";

  let currentProfile = null;
  let currentInstanceId = null;
  let questionShownAt = null;

  async function fetchProgress() {

    const { data } = await supabase
      .from("student_progress")
      .select("*")
      .maybeSingle();


    logEvent("PROGRESS_FETCHED", { xp: data?.xp });
  }

  function updateProfileUI() {

    if (!currentProfile) return;

    profileLevelEl.textContent = currentProfile.level;
    xpValueEl.textContent = `${currentProfile.xp} XP`;

    coinsEl.textContent = currentProfile.coins;

    const percent = (currentProfile.mastery_balance + 3) / 6 * 100;

    xpBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  async function submitAnswer(userAnswer) {

    setState(UI_STATES.SUBMITTING_ANSWER);

    feedback.textContent = "Indsender...";
    feedback.style.color = "black";

    try {

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

      if (error) throw error;

      await fetchProgress();
      updateProfileUI();

      if (data.correct) {
        feedback.textContent = "Korrekt!";
        feedback.style.color = "green";
      } else {
        feedback.textContent = "Forkert.";
        feedback.style.color = "red";
      }

      setState(UI_STATES.TRANSITIONING);

      setTimeout(loadAndRenderQuestion, 500);

    } catch (err) {

      logError("SUBMIT_FAILED", err);

      feedback.textContent = "Netværksfejl.";
      feedback.style.color = "orange";

      setState(UI_STATES.AWAITING_ANSWER);
    }
  }

  async function getNextQuestion() {

    logEvent("REQUEST_NEXT_QUESTION");

    const { data, error } = await supabase.functions.invoke(
      "get-next-question",
      { body: {} }
    );

    if (error) throw error;

    currentInstanceId = data.question_instance_id;

    return data;
  }

  function renderOptions(question) {

    optionsContainer.innerHTML = "";

    if (question.answer_format === "year") {

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 4;

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

    if (question.answer_format === "text" || question.type === "open") {

      const input = document.createElement("input");
      input.type = "text";

      const btn = document.createElement("button");
      btn.textContent = "Svar";

      btn.onclick = () => {

        const answer = input.value.trim();
        if (!answer) return;

        submitAnswer(answer);

      };

      optionsContainer.appendChild(input);
      optionsContainer.appendChild(btn);
      return;
    }

  }

  async function loadAndRenderQuestion() {

    setState(UI_STATES.LOADING_QUESTION);

    feedback.textContent = "";
    feedback.style.color = "black";

    const question = await getNextQuestion();

    questionElement.textContent = question.content.question;

    questionShownAt = Date.now();

    renderOptions(question);

    setState(UI_STATES.AWAITING_ANSWER);
  }

  await fetchProgress();
  updateProfileUI();
  await loadAndRenderQuestion();

});
