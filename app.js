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

// 🔥 FETCH FEEDBACK
async function fetchReviewedAnswers() {
  console.log("FETCH REVIEW CALLED");

  const { data, error } = await supabase.functions.invoke("get-reviewed-answers");

  if (error || !data?.data) return;

  const container = document.getElementById("review-feedback");
  if (!container) return;

  container.innerHTML = "<b>Seneste feedback:</b>";

  function scoreToXP(score) {
    if (score === 1) return 0;
    if (score === 2) return 10;
    if (score === 3) return 25;
    if (score === 4) return 50;
    return 0;
  }

  data.data.forEach(item => {
    const xp = scoreToXP(item.teacher_score);

    const div = document.createElement("div");

    div.style.marginTop = "10px";

    div.innerHTML = `
      <div>
        <b>Din besvarelse:</b> ${item.user_answer}<br>
        <b>Feedback:</b> ${item.teacher_feedback || "Ingen kommentar"}<br>
        <b>Score:</b> ${item.teacher_score}
        <div style="
          color: green;
          font-weight: bold;
          font-size: 18px;
          margin-top: 5px;
        ">
          +${xp} XP
        </div>
      </div>
    `;

    container.appendChild(div);

    if (xp > 0) {
      showXPPopup(xp);
    }
  });
}

// 🔐 AUTH
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

// 🎭 AVATAR
async function loadActiveAvatar() {
  const avatarEl = document.getElementById("avatar-display");
  if (!avatarEl) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_avatar")
    .eq("id", studentId)
    .maybeSingle();

  const avatarId = profile?.active_avatar;

  if (!avatarId) {
    avatarEl.textContent = "Ingen avatar";
    return;
  }

  const { data: item } = await supabase
    .from("shop_items")
    .select("name, image_url")
    .eq("id", avatarId)
    .maybeSingle();

  avatarEl.innerHTML = `
    <img src="${item?.image_url || ""}" />
    <div>${item?.name || "Avatar"}</div>
  `;
}

function showXPPopup(amount) {
  const popup = document.getElementById("xp-popup");
  if (!popup) return;

  popup.textContent = `+${amount} XP`;
  popup.classList.remove("xp-show");

  void popup.offsetWidth;

  popup.classList.add("xp-show");
}

// 🔥 FEEDBACK FLASH
function flash(type) {
  const el = document.querySelector(".question-box");
  if (!el) return;

  const className = type === "correct"
    ? "correct-flash"
    : "incorrect-flash";

  el.classList.add(className);

  setTimeout(() => {
    el.classList.remove(className);
  }, 300);
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

    // 🔥 XP BAR (kun progress i nuværende level)
    const xpBar = document.getElementById("xp-bar");

    const xpForNextLevel = 100;
    const progressInLevel = xp % xpForNextLevel;
    const safeProgress = progressInLevel / xpForNextLevel;

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
      return;
    }

    const progress = Array.isArray(data) ? data[0] : null;
    applyProgressToUI(progress);
  }

  async function submitAnswer(userAnswer, btnRef = null) {

    if (uiState !== UI_STATES.AWAITING_ANSWER) return;

    setState(UI_STATES.SUBMITTING_ANSWER);

    if (btnRef) {
      btnRef.disabled = true;
      btnRef.textContent = "…";
    }

    const { data, error } = await supabase.functions.invoke(
      "process-event",
      {
        body: {
          question_instance_id: currentInstanceId,
          answer: userAnswer,
          question_shown_at: questionShownAt
        }
      }
    );

    if (error) {
      feedback.textContent = "⚠️ Fejl ved svar";
      setState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (data?.status === "invalid") {
      feedback.textContent = "⚠️ " + data.error;

      if (btnRef) {
        btnRef.disabled = false;
        btnRef.textContent = "Send svar";
      }

      setState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (data.status === "correct") {
      feedback.textContent = "✅ Korrekt!";
      flash("correct");
    } else if (data.status === "incorrect") {
      feedback.textContent = "❌ Forkert";
      flash("incorrect");
    } else {
      feedback.textContent = "⏳ Afventer vurdering";
    }

    await fetchProgress();
    await fetchReviewedAnswers();

    setState(UI_STATES.TRANSITIONING);

    setTimeout(() => {
      loadAndRenderQuestion();
    }, 900);
  }

  async function getNextQuestion() {
    setState(UI_STATES.LOADING_QUESTION);

    const { data, error } = await supabase.functions.invoke("get-next-question");

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

    const format = (question?.answer_format || "").toLowerCase();
    const answerType = question?.answer_type || "short";
    const content = question?.content;

    if (format === "text") {

      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.autofocus = true;

      const counter = document.createElement("div");

      function countWords(text) {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
      }

      function update() {
        const words = countWords(textarea.value);
        counter.textContent = answerType === "long"
          ? `Min. 20 ord (${words})`
          : `${words} ord`;

        counter.style.color =
          answerType === "long"
            ? (words >= 20 ? "green" : "red")
            : "black";
      }

      update();
      textarea.addEventListener("input", update);

      const btn = document.createElement("button");
      btn.textContent = "Send svar";

      btn.onclick = () => submitAnswer(textarea.value, btn);

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          btn.click();
        }
      });

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(counter);
      optionsContainer.appendChild(btn);

      return;
    }

    if (format === "number") {
      const input = document.createElement("input");
      input.type = "number";

      const btn = document.createElement("button");
      btn.textContent = "Svar";

      btn.onclick = () => {
        const val = Number(input.value);
        if (!Number.isNaN(val)) {
          submitAnswer(String(val), btn);
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btn.click();
      });

      optionsContainer.appendChild(input);
      optionsContainer.appendChild(btn);
      return;
    }

    if (format === "mc") {
      content.options.forEach(option => {
        const btn = document.createElement("button");
        btn.textContent = option;
        btn.onclick = () => submitAnswer(option, btn);
        optionsContainer.appendChild(btn);
      });
    }
  }

  async function loadAndRenderQuestion() {
    const question = await getNextQuestion();

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
  await fetchReviewedAnswers();
  await loadActiveAvatar();
  await loadAndRenderQuestion();
});

console.log("QUIZ PAGE LOADED");
