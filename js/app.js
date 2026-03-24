import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://tjzbehwfagiwpwodsgwg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc"
);

const UI_STATES = {
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
};

let currentState = UI_STATES.LOADING_QUESTION;
let currentQuestion = null;

// =====================
// STATE
// =====================

function setState(newState) {
  currentState = newState;
  console.log("[STATE]", newState);
  render();
}

// =====================
// DOM
// =====================

function getEl(id) {
  return document.getElementById(id);
}

// =====================
// RENDER
// =====================

function render() {
  const questionEl = getEl("question");

  if (!questionEl) {
    console.error("Missing #question element in HTML");
    return;
  }

  if (currentState === UI_STATES.LOADING_QUESTION) {
    questionEl.innerText = "Indlæser...";
  }

  if (currentState === UI_STATES.AWAITING_ANSWER) {
    if (!currentQuestion) {
      questionEl.innerText = "Ingen data";
      return;
    }

    questionEl.innerText = currentQuestion.content.question;
  }
}

// =====================
// API
// =====================

async function getNextQuestion() {
  const { data, error } = await supabase.functions.invoke(
    "get-next-question"
  );

  if (error) {
    console.error("API ERROR:", error);
    return null;
  }

  return data;
}

// =====================
// FLOW
// =====================

async function loadAndRenderQuestion() {
  setState(UI_STATES.LOADING_QUESTION);

  const question = await getNextQuestion();

  if (!question) {
    console.error("No question returned");
    return;
  }

  currentQuestion = question;

  console.log("INSTANCE_ID:", question.question_instance_id);

  setState(UI_STATES.AWAITING_ANSWER);
}

// =====================
// INIT
// =====================

loadAndRenderQuestion();
