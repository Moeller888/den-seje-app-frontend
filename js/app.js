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
  const inputEl = getEl("answer");

  if (!questionEl || !inputEl) {
    console.error("Missing DOM elements");
    return;
  }

  if (currentState === UI_STATES.LOADING_QUESTION) {
    questionEl.innerText = "Indlæser...";
    inputEl.value = "";
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
  const { data, error } = await supabase.functions.invoke("get-next-question");

  if (error) {
    console.error("API ERROR:", error);
    return null;
  }

  return data;
}

async function submitToBackend(answer) {
  const { data, error } = await supabase.functions.invoke("process-event", {
    body: {
      event_type: "answer_submitted",
      question_instance_id: currentQuestion.question_instance_id,
      answer: answer,
    },
  });

  if (error) {
    console.error("SUBMIT ERROR:", error);
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
// SUBMIT
// =====================

async function submitAnswer() {
  const inputEl = getEl("answer");

  if (!inputEl || !currentQuestion) {
    console.error("Missing input or question");
    return;
  }

  const answer = inputEl.value;

  console.log("ANSWER:", answer);

  await submitToBackend(answer);

  await loadAndRenderQuestion();
}

// =====================
// INIT
// =====================

getEl("submit")?.addEventListener("click", submitAnswer);

loadAndRenderQuestion();
