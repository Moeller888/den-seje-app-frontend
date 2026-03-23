import { supabase } from "./supabase.js";

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

  return true;
}

window.addEventListener("DOMContentLoaded", async () => {
  const authorized = await checkAuthAndRole();
  if (!authorized) return;

  document.body.style.display = "block";

  let currentInstanceId = null;
  let questionShownAt = null;

  async function submitAnswer(userAnswer) {
    setState(UI_STATES.SUBMITTING_ANSWER);

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

      setState(UI_STATES.TRANSITIONING);
    } catch (err) {
      logError("SUBMIT_FAILED", err);
      setState(UI_STATES.AWAITING_ANSWER);
    }
  }

  async function getNextQuestion() {
    const { data } = await supabase.functions.invoke(
      "get-next-question",
      { body: {} }
    );

    currentInstanceId = data.question_instance_id;

    console.log("INSTANCE_ID:", currentInstanceId);

    return data;
  }

  async function loadAndRenderQuestion() {
    setState(UI_STATES.LOADING_QUESTION);

    const question = await getNextQuestion();

    questionShownAt = Date.now();

    setState(UI_STATES.AWAITING_ANSWER);
  }

  await loadAndRenderQuestion();
});
