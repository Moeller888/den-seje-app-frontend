import { supabase } from "./supabase.js";
import { initMonitoring, captureError } from "./sentry.js";

/* ========================
   DEBUG
======================== */

const DEBUG = true;

// Error monitoring (157B). No-op unless ENABLE_SENTRY + a DSN are configured; fail-soft.
initMonitoring();

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
  // 157B: additively forward to error monitoring. No-op when disabled; never throws.
  captureError(event, error);
}

/* ========================
   AUTH CHECK (SUPER ADMIN)
======================== */

let currentUserId = null;

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace("login.html");
    return false;
  }

  currentUserId = sessionData.session.user.id;

  const userId = sessionData.session.user.id;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

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
   AVATAR GENERATION JOBS
======================== */

const jobsTableBody = document.getElementById("jobsTableBody");
const jobsError = document.getElementById("jobsError");
const jobsLastRefreshed = document.getElementById("jobsLastRefreshed");
const refreshJobsBtn = document.getElementById("refreshJobsBtn");

function statusBadge(status) {
  const map = {
    complete:              ["Complete",           "#2e7d32"],
    generating:            ["Generating…",   "#1565c0"],
    pending:               ["Pending",            "#555555"],
    failed_retryable:      ["Failed (retryable)", "#e65100"],
    failed_permanent:      ["Failed (permanent)", "#b71c1c"],
    pending_manual_review: ["Awaiting review",    "#6a1b9a"],
  };
  const [label, bg] = map[status] ?? [status, "#999999"];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:12px;font-weight:bold;color:#fff;background:${bg}">${label}</span>`;
}

function formatTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

async function loadGenerationJobs() {
  if (!jobsTableBody) return;

  logEvent("LOAD_GENERATION_JOBS");

  const { data, error } = await supabase
    .from("avatar_generation_jobs")
    .select("id, slot, status, retry_count, initiated_at, claimed_at, completed_at, failure_reason")
    .order("initiated_at", { ascending: false })
    .limit(20);

  if (error) {
    logError("LOAD_GENERATION_JOBS_FAILED", error);
    if (jobsError) {
      jobsError.textContent = `Failed to load jobs: ${error.message}`;
      jobsError.style.display = "block";
    }
    return;
  }

  if (jobsError) jobsError.style.display = "none";

  jobsTableBody.innerHTML = "";

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" style="color:#888;text-align:center;padding:20px;">No generation jobs found.</td>`;
    jobsTableBody.appendChild(tr);
  } else {
    data.forEach(row => {
      // Last update: prefer completed_at (terminal state), then claimed_at (active state)
      const lastUpdate = row.completed_at
        ? formatTs(row.completed_at)
        : row.claimed_at
          ? formatTs(row.claimed_at)
          : "—";

      // Action buttons: retry for failed_retryable, process for pending
      let actionHtml = "—";
      if (row.status === "failed_retryable") {
        actionHtml = `<button data-action="retry" data-job-id="${row.id}" style="background:#e65100;color:white;border:none;padding:4px 10px;cursor:pointer;border-radius:3px;">Retry</button>`;
      } else if (row.status === "pending") {
        actionHtml = `<button data-action="process" data-job-id="${row.id}" style="background:#1565c0;color:white;border:none;padding:4px 10px;cursor:pointer;border-radius:3px;">Process</button>`;
      }

      // Truncate long failure reasons; show full text on hover
      let failureHtml = "—";
      if (row.failure_reason) {
        const truncated = row.failure_reason.length > 48
          ? row.failure_reason.slice(0, 48) + "…"
          : row.failure_reason;
        failureHtml = `<span title="${row.failure_reason.replace(/"/g, "&quot;")}" style="color:#b71c1c;font-size:13px;">${truncated}</span>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:13px;" title="${row.id}">${row.id.slice(0, 8)}</td>
        <td>${row.slot ?? "—"}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${row.retry_count} / 5</td>
        <td>${formatTs(row.initiated_at)}</td>
        <td>${lastUpdate}</td>
        <td>${failureHtml}</td>
        <td>${actionHtml}</td>
      `;
      jobsTableBody.appendChild(tr);
    });
  }

  if (jobsLastRefreshed) {
    jobsLastRefreshed.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;
  }

  logEvent("GENERATION_JOBS_RENDERED", { rows: data?.length ?? 0 });
}

// Event delegation: handles Retry and Process buttons for all rows
if (jobsTableBody) {
  jobsTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const jobId = btn.dataset.jobId;
    if (!jobId) return;

    btn.disabled = true;
    btn.textContent = "Working…";

    try {
      if (action === "retry") {
        const { data, error } = await supabase.functions.invoke(
          "avatar-generation/retry",
          { body: { job_id: jobId, retried_by: currentUserId ?? "admin" } }
        );
        if (error) throw new Error(error.message);
        if (data && !data.success) throw new Error(data.message ?? "Retry failed");
        logEvent("JOB_RETRY_SUCCESS", { jobId });

      } else if (action === "process") {
        const { data, error } = await supabase.functions.invoke(
          "avatar-generation/process",
          { body: { job_id: jobId } }
        );
        if (error) throw new Error(error.message);
        if (data && !data.success) throw new Error(data.message ?? "Process failed");
        logEvent("JOB_PROCESS_SUCCESS", { jobId });
      }
    } catch (err) {
      logError("JOB_ACTION_FAILED", err);
      alert(`Action failed: ${err.message}`);
      btn.disabled = false;
      btn.textContent = action === "retry" ? "Retry" : "Process";
      return;
    }

    await loadGenerationJobs();
  });
}

if (refreshJobsBtn) {
  refreshJobsBtn.addEventListener("click", () => loadGenerationJobs());
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

  (data || []).forEach(row => {
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

await loadGenerationJobs();
await loadAttemptStats();
await loadQuestionPerformance();

setInterval(loadGenerationJobs, 5000);
