import { supabase } from "./supabase.js";

/* ========================
   DEBUG
======================== */

const DEBUG = true;

function logEvent(event, payload = {}) {
  if (!DEBUG) return;
  console.log("[ADMIN EVENT]", {
    timestamp: new Date().toISOString(),
    event,
    ...payload
  });
}

function logError(event, error) {
  console.error("[ADMIN ERROR]", {
    timestamp: new Date().toISOString(),
    event,
    error
  });
}

/* ========================
   AUTH CHECK (SUPER ADMIN)
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
    .single();

  if (error || !profile || profile.role !== "super_admin") {
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
   CREATE TEACHER
======================== */

const teacherEmailInput = document.getElementById("teacherEmail");
const teacherPasswordInput = document.getElementById("teacherPassword");
const createTeacherBtn = document.getElementById("createTeacherBtn");
const createTeacherMessage = document.getElementById("createTeacherMessage");

if (createTeacherBtn) {
  createTeacherBtn.addEventListener("click", async () => {

    const email = teacherEmailInput.value.trim();
    const password = teacherPasswordInput.value.trim();

    createTeacherMessage.style.color = "red";
    createTeacherMessage.textContent = "";

    if (!email || !password) {
      createTeacherMessage.textContent = "Udfyld begge felter.";
      return;
    }

    logEvent("CREATE_TEACHER_ATTEMPT", { email });

    const { data, error } = await supabase.functions.invoke(
      "create-teacher",
      { body: { email, password } }
    );

    if (error || data?.error) {
      logError("CREATE_TEACHER_FAILED", error || data?.error);
      createTeacherMessage.textContent = error?.message || data?.error;
      return;
    }

    createTeacherMessage.style.color = "green";
    createTeacherMessage.textContent = "Lærer oprettet korrekt.";

    teacherEmailInput.value = "";
    teacherPasswordInput.value = "";

    logEvent("CREATE_TEACHER_SUCCESS", { email });
  });
}

/* ========================
   ATTEMPT STATS
======================== */

const attemptTableBody = document.getElementById("attemptTableBody");

async function loadAttemptStats() {

  if (!attemptTableBody) return;

  logEvent("LOAD_ATTEMPT_STATS");

  const { data, error } = await supabase
    .from("attempt_stats")
    .select("*")
    .order("last_attempt_at", { ascending: false });

  if (error) {
    logError("LOAD_ATTEMPT_STATS_FAILED", error);
    return;
  }

  attemptTableBody.innerHTML = "";

  data.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.student_id}</td>
      <td>${row.total_attempts}</td>
      <td>${row.correct_attempts}</td>
      <td>${row.incorrect_attempts}</td>
      <td>${row.retry_attempts}</td>
      <td>${row.total_xp_awarded}</td>
      <td>${new Date(row.last_attempt_at).toLocaleString()}</td>
    `;

    attemptTableBody.appendChild(tr);
  });

  logEvent("ATTEMPT_STATS_RENDERED", { rows: data.length });
}

/* ========================
   QUESTION PERFORMANCE
======================== */

const questionPerfTableBody = document.getElementById("questionPerfTableBody");

function healthBadge(status) {
  switch (status) {
    case "problem":
      return "🔴 Problem";
    case "warning":
      return "🟡 Warning";
    default:
      return "🟢 Healthy";
  }
}

async function loadQuestionPerformance() {

  if (!questionPerfTableBody) return;

  logEvent("LOAD_QUESTION_PERFORMANCE");

  const { data, error } = await supabase
    .from("question_performance")
    .select("*")
    .order("total_attempts", { ascending: false });

  if (error) {
    logError("LOAD_QUESTION_PERFORMANCE_FAILED", error);
    return;
  }

  questionPerfTableBody.innerHTML = "";

  data.forEach(row => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.question_id}</td>
      <td>${row.total_attempts}</td>
      <td>${row.correct_attempts}</td>
      <td>${row.incorrect_attempts}</td>
      <td>${row.retry_attempts}</td>
      <td>${row.success_rate_percent ?? 0}%</td>
      <td>${row.total_xp_generated ?? 0}</td>
      <td>${healthBadge(row.health_status)}</td>
    `;

    questionPerfTableBody.appendChild(tr);
  });

  logEvent("QUESTION_PERFORMANCE_RENDERED", { rows: data.length });
}

/* ========================
   INIT
======================== */

await loadAttemptStats();
await loadQuestionPerformance();