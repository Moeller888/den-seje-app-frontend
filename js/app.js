const UI_STATES = {
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
  SUBMITTING_ANSWER: "SUBMITTING_ANSWER",
  TRANSITIONING: "TRANSITIONING",
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
// RENDER
// =====================

function render() {
  const questionEl = document.getElementById("question");
  const inputEl = document.getElementById("answer");
  const buttonEl = document.getElementById("submit");

  if (!questionEl) return;

  if (currentState === UI_STATES.LOADING_QUESTION) {
    questionEl.innerText = "Indlæser...";
    inputEl.style.display = "none";
    buttonEl.style.display = "none";
  }

  if (currentState === UI_STATES.AWAITING_ANSWER) {
    if (!currentQuestion) {
      questionEl.innerText = "Ingen data";
      return;
    }

    questionEl.innerText = currentQuestion.content.question;
    inputEl.style.display = "block";
    buttonEl.style.display = "block";
  }

  if (currentState === UI_STATES.SUBMITTING_ANSWER) {
    buttonEl.disabled = true;
  }

  if (currentState === UI_STATES.TRANSITIONING) {
    questionEl.innerText = "Næste spørgsmål...";
    inputEl.style.display = "none";
    buttonEl.style.display = "none";
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
    console.error(error);
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
