import { supabase } from "./supabase.js";

/* ========================
   AUTH
======================== */

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace("/login.html");
    return null;
  }

  const userId = sessionData.session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.role !== "teacher") {
    await supabase.auth.signOut();
    window.location.replace("/login.html");
    return null;
  }

  return userId;
}

const teacherId = await checkAuthAndRole();
if (!teacherId) throw new Error("Unauthorized");

document.body.style.display = "block";

/* ========================
   BFCache Protection
======================== */

window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.replace("/login.html");
    }
  }
});

/* ========================
   DOM
======================== */

const studentListContainer = document.getElementById("studentList");
const reviewQueueContainer = document.getElementById("reviewQueue");
const studentEmailInput = document.getElementById("studentEmail");
const studentPasswordInput = document.getElementById("studentPassword");
const createStudentBtn = document.getElementById("createStudentBtn");
const createMessage = document.getElementById("createMessage");
const createBox = document.getElementById("createBox");
const firstRunSection = document.getElementById("firstRun");
const firstRunCta = document.getElementById("firstRunCta");
const pageLoading = document.getElementById("pageLoading");
const logoutBtn = document.getElementById("logoutBtn");

/* ========================
   LOGOUT
======================== */

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.replace("/login.html");
  });
}

/* ========================
   SIMPLE EMAIL VALIDATION
======================== */

function isValidEmail(email) {
  return email.includes("@") && email.includes(".");
}

/* ========================
   CREATE STUDENT
======================== */

// The error codes create-student returns (supabase/functions/create-student/handler.ts), in the
// teacher's words. The provider's own text is never shown.
const CREATE_ERROR_TEXT = {
  invalid_email: "Emailen ser ikke rigtig ud. Tjek den, og prøv igen.",
  invalid_password: "Adgangskoden skal være mindst 6 tegn.",
  create_failed: "Eleven kunne ikke oprettes. Tjek emailen – den kan allerede være i brug.",
  unauthorized: "Din session er udløbet. Log ud og ind igen, og prøv så igen.",
  forbidden: "Kun lærere kan oprette elever.",
  profile_failed: "Eleven blev ikke oprettet. Prøv igen om lidt.",
  profile_failed_rollback_failed:
    "Oprettelsen gik galt halvvejs, og emailen kan nu være optaget. " +
    "Skriv til kontakt@lærlig.dk, før du prøver igen med samme email.",
};

const CREATE_ERROR_FALLBACK = "Eleven kunne ikke oprettes. Prøv igen om lidt.";

// supabase.functions.invoke() puts a non-2xx response in error.context (a Response) and leaves
// data null, so the code has to be read from there.
async function readFunctionErrorCode(error, data) {
  if (data && typeof data.error === "string") return data.error;
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await (typeof ctx.clone === "function" ? ctx.clone() : ctx).json();
      if (body && typeof body.error === "string") return body.error;
    } catch (e) {
      console.error("[teacher] create-student error body unreadable", e);
    }
  }
  return null;
}

function showCreateError(text) {
  createMessage.innerHTML = "";
  const p = document.createElement("p");
  p.className = "create-error";
  p.textContent = text;
  createMessage.appendChild(p);
}

// What actually happens next, and nothing more: create-student flags the pupil with
// must_reset_password, js/login.js sends a flagged pupil to the forced reset, and app.js asks for
// the grade and runs the placement questions when neither is set yet.
function showCreateSuccess(email) {
  createMessage.innerHTML = "";
  const box = document.createElement("div");
  box.className = "create-success";
  box.id = "createSuccess";

  const title = document.createElement("strong");
  title.textContent = "Eleven er oprettet.";

  const give = document.createElement("p");
  give.append("Giv eleven emailen ");
  const em = document.createElement("b");
  em.textContent = email;
  give.append(em, " og den midlertidige adgangskode, du lige har valgt.");

  const next = document.createElement("p");
  next.textContent =
    "Ved første login vælger eleven sin egen adgangskode. Derefter vælger eleven klassetrin " +
    "og løser nogle startopgaver, så opgaverne passer til elevens niveau.";

  box.append(title, give, next);
  createMessage.appendChild(box);
}

createStudentBtn.addEventListener("click", async () => {

  const email = studentEmailInput.value.trim();
  const password = studentPasswordInput.value.trim();

  createMessage.innerHTML = "";

  if (!email || !password) {
    showCreateError("Udfyld både email og midlertidig adgangskode.");
    return;
  }

  if (!isValidEmail(email)) {
    showCreateError(CREATE_ERROR_TEXT.invalid_email);
    return;
  }

  if (password.length < 6) {
    showCreateError(CREATE_ERROR_TEXT.invalid_password);
    return;
  }

  createStudentBtn.disabled = true;

  let data = null;
  let error = null;
  try {
    ({ data, error } = await supabase.functions.invoke(
      "create-student",
      { body: { email, password } }
    ));
  } catch (e) {
    error = e;
  }

  if (error || data?.error || data?.success !== true) {
    createStudentBtn.disabled = false;
    const code = await readFunctionErrorCode(error, data);
    console.error("[teacher] create-student failed", code ?? error);
    showCreateError(CREATE_ERROR_TEXT[code] ?? CREATE_ERROR_FALLBACK);
    return;
  }

  studentEmailInput.value = "";
  studentPasswordInput.value = "";

  showCreateSuccess(email);

  // The new pupil changes the roster, so every panel that reads it is reloaded — including the
  // switch from first run to the full dashboard after the very first pupil.
  await refreshAfterRosterChange();

  createStudentBtn.disabled = false;
  createBox?.scrollIntoView({ block: "nearest" });
});

firstRunCta?.addEventListener("click", () => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  createBox?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  studentEmailInput.focus({ preventScroll: true });
});

/* ========================
   DOMAIN MANAGEMENT
======================== */

const ALL_DOMAINS = [
  { key: "prehistoric_denmark",  label: "Forhistorisk Danmark" },
  { key: "vikings",              label: "Vikingerne" },
  { key: "middle_ages",          label: "Middelalderen" },
  { key: "reformation_monarchy", label: "Reformation & Monarki" },
  { key: "enlightenment",        label: "Oplysningstiden" },
  { key: "revolutions_democracy",label: "Revolutioner & Demokrati" },
  { key: "industrialisation",    label: "Industrialisering" },
  { key: "world_war_1",          label: "1. Verdenskrig" },
  { key: "world_war_2",          label: "2. Verdenskrig" },
  { key: "cold_war",             label: "Den Kolde Krig" },
  { key: "democracy_power",      label: "Demokrati & Magt" },
];

const DOMAIN_SHORT = {
  prehistoric_denmark:  "Forhistorie",
  vikings:              "Vikingerne",
  middle_ages:          "Middelalder",
  reformation_monarchy: "Reformation",
  enlightenment:        "Oplysning",
  revolutions_democracy:"Revolutioner",
  industrialisation:    "Industriel",
  world_war_1:          "1. Vkrig",
  world_war_2:          "2. Vkrig",
  cold_war:             "Kold Krig",
  democracy_power:      "Demokrati",
};

const domainStudentSelect = document.getElementById("domainStudentSelect");
const domainCheckboxes    = document.getElementById("domainCheckboxes");
const domainSaveBtn       = document.getElementById("domainSaveBtn");
const domainResetBtn      = document.getElementById("domainResetBtn");
const domainMessage       = document.getElementById("domainMessage");

// Build checkbox list once
if (domainCheckboxes) {
  ALL_DOMAINS.forEach(({ key, label }) => {
    const lbl = document.createElement("label");
    lbl.className = "domain-checkbox-label";
    lbl.innerHTML = `<input type="checkbox" value="${key}"> ${label}`;
    domainCheckboxes.appendChild(lbl);
  });
}

// Track currently selected student's domains
let currentStudentDomains = null;

async function loadDomainPanel() {
  if (!domainStudentSelect) return;

  const { data, error } = await supabase.rpc("get_my_students");
  if (error || !data) return;

  const students = data ?? [];
  domainStudentSelect.innerHTML = '<option value="">&#8212; Vælg elev &#8212;</option>';
  students.forEach(s => {
    const opt = document.createElement("option");
    opt.value       = s.student_id;
    opt.textContent = s.display_name;
    domainStudentSelect.appendChild(opt);
  });
}

domainStudentSelect?.addEventListener("change", async () => {
  const sid = domainStudentSelect.value;
  if (!sid) {
    currentStudentDomains = null;
    syncCheckboxes([]);
    return;
  }

  const { data } = await supabase
    .from("profiles")
    .select("active_domains")
    .eq("id", sid)
    .maybeSingle();

  currentStudentDomains = data?.active_domains ?? null;
  syncCheckboxes(currentStudentDomains ?? []);
});

function syncCheckboxes(selectedKeys) {
  if (!domainCheckboxes) return;
  domainCheckboxes.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.checked = selectedKeys.includes(cb.value);
  });
}

function getCheckedDomains() {
  if (!domainCheckboxes) return [];
  return Array.from(domainCheckboxes.querySelectorAll("input[type=checkbox]:checked"))
    .map(cb => cb.value);
}

domainSaveBtn?.addEventListener("click", async () => {
  const sid = domainStudentSelect?.value ?? "";
  if (!sid) {
    domainMessage.style.color = "red";
    domainMessage.textContent = "Vælg en elev først.";
    return;
  }

  const chosen = getCheckedDomains();
  if (chosen.length === 0) {
    domainMessage.style.color = "red";
    domainMessage.textContent = "Vælg mindst ét domæne, eller brug 'Alle domæner' for at fjerne filtrering.";
    return;
  }

  domainMessage.textContent = "";

  const { error } = await supabase.rpc("set_student_domains", {
    p_student_id: sid,
    p_domains:    chosen,
  });

  if (error) {
    domainMessage.style.color = "red";
    domainMessage.textContent = "Fejl: " + (error.message ?? "Prøv igen.");
    return;
  }

  domainMessage.style.color = "green";
  domainMessage.textContent = "Domæner gemt. Eleven modtager nu kun spørgsmål fra de valgte emner.";

  await loadClassOverview();
});

domainResetBtn?.addEventListener("click", async () => {
  const sid = domainStudentSelect?.value ?? "";
  if (!sid) {
    domainMessage.style.color = "red";
    domainMessage.textContent = "Vælg en elev først.";
    return;
  }

  domainMessage.textContent = "";

  const { error } = await supabase.rpc("set_student_domains", {
    p_student_id: sid,
    p_domains:    null,
  });

  if (error) {
    domainMessage.style.color = "red";
    domainMessage.textContent = "Fejl: " + (error.message ?? "Prøv igen.");
    return;
  }

  domainMessage.style.color = "green";
  domainMessage.textContent = "Nulstillet. Eleven modtager nu spørgsmål fra alle domæner.";
  syncCheckboxes([]);
  currentStudentDomains = null;

  await loadClassOverview();
});

/* ========================
   CLASS OVERVIEW (VISIBILITY)
======================== */

async function loadClassOverview() {
  const container = document.getElementById("classOverview");
  if (!container) return;

  const { data, error } = await supabase.rpc("get_teacher_visibility", {
    p_teacher_id: teacherId
  });

  if (error) {
    container.innerHTML = "<p class=\"overview-empty\">Fejl ved indlæsning af klasseoversigt.</p>";
    return;
  }

  const students = data ?? [];

  if (students.length === 0) {
    container.innerHTML = "<p class=\"overview-empty\">Ingen elever tilknyttet endnu.</p>";
    return;
  }

  const TREND_ICON  = { improving: "↑", stable: "→", struggling: "↓" };
  const TREND_CLASS = { improving: "trend-up", stable: "trend-stable", struggling: "trend-down" };

  const rows = students.map(s => {
    const grade = s.selected_grade != null ? s.selected_grade : "—";

    const placedHtml = s.placement_band != null
      ? '<span class="band-num">Band ' + s.placement_band + "</span>"
      : '<span style="color:var(--text-dim);font-size:11px;font-style:italic">Ikke placeret</span>';

    const currentLabel = s.current_band != null
      ? "Band " + s.current_band
      : null;

    let growthHtml = "";
    if (s.placement_band != null && s.current_band != null) {
      const delta = s.current_band - s.placement_band;
      if (delta > 0)      growthHtml = ` <span class="band-growth-pos">(+${delta})</span>`;
      else if (delta < 0) growthHtml = ` <span class="band-growth-neg">(${delta})</span>`;
    }

    const currentHtml = currentLabel != null
      ? '<span class="band-num">' + currentLabel + "</span>" + growthHtml
      : '<span style="color:var(--text-dim);font-size:11px;font-style:italic">Ingen aktiv session</span>';

    const pct      = s.recent_correct_pct ?? 0;
    const pctClass = pct >= 70 ? "pct-good" : pct >= 50 ? "pct-ok" : "pct-poor";
    const trend    = s.trend ?? "stable";

    // Domain focus cell
    const domains = s.active_domains;
    let domainCell = "";
    if (!Array.isArray(domains) || domains.length === 0) {
      domainCell = '<span class="domain-focus-free">Alle</span>';
    } else {
      domainCell = domains
        .map(function(d) { return '<span class="domain-focus-chip">' + (DOMAIN_SHORT[d] ?? d) + "</span>"; })
        .join(" ");
    }

    return "<tr>" +
      "<td>" + (s.display_name ?? "Elev") + "</td>" +
      "<td>" + (grade !== "—" ? '<span class="grade-chip">' + grade + "</span>" : "—") + "</td>" +
      "<td>" + placedHtml + "</td>" +
      "<td>" + currentHtml + "</td>" +
      "<td>" + (s.total_attempts ?? 0) + "</td>" +
      "<td class=\"" + pctClass + "\">" + pct + "%</td>" +
      "<td class=\"" + (TREND_CLASS[trend] ?? "trend-stable") + "\">" + (TREND_ICON[trend] ?? "→") + "</td>" +
      "<td style=\"max-width:140px;white-space:normal\">" + domainCell + "</td>" +
      "<td><button class=\"go-student-btn\" data-id=\"" + s.student_id + "\">Vis →</button></td>" +
      "</tr>";
  }).join("");

  container.innerHTML =
    '<div class="overview-scroll"><table class="overview-table"><thead><tr>' +
    "<th>Elev</th><th>Kl.</th><th>Start</th><th>Niveau</th>" +
    "<th>Spm.</th><th>Korrekt</th><th>Trend</th><th>Emner</th><th></th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>";

  container.querySelectorAll(".go-student-btn").forEach(btn => {
    btn.onclick = () => {
      window.location.href = `student-detail.html?id=${btn.dataset.id}`;
    };
  });
}

/* ========================
   ENGAGEMENT PANEL (Section 138)
   Live classroom activity view.
   Two queries total — no N+1:
     1. get_teacher_visibility  → student names + bands
     2. question_instances      → last-7-day activity for all students
======================== */

function formatRelativeTime(date, now) {
  const diffMs   = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1)   return "Lige nu";
  if (diffMins < 60)  return diffMins + " min siden";
  if (diffHrs  < 24)  return diffHrs  + " time" + (diffHrs  === 1 ? "" : "r") + " siden";
  if (diffDays === 1) return "I går";
  if (diffDays < 7)   return diffDays + " dage siden";
  return date.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function getActivityDotClass(lastActive, todayStart, now) {
  if (!lastActive) return "gray";
  if (lastActive >= todayStart) return "green";
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (lastActive >= sevenDaysAgo) return "yellow";
  return "red";
}

async function loadEngagementPanel() {
  const summaryEl  = document.getElementById("engagement-summary");
  const tableEl    = document.getElementById("engagement-table");
  const insightsEl = document.getElementById("engagement-insights");
  if (!summaryEl) return;

  // Query 1: students with names + current bands
  const { data: students, error: studErr } = await supabase.rpc("get_teacher_visibility", {
    p_teacher_id: teacherId,
  });

  if (studErr || !students || students.length === 0) {
    summaryEl.innerHTML = "<p class='overview-empty'>Ingen elever tilknyttet endnu.</p>";
    if (tableEl)    tableEl.innerHTML = "";
    if (insightsEl) insightsEl.innerHTML = "";
    return;
  }

  const studentIds    = students.map(s => s.student_id);
  const totalStudents = students.length;

  // Query 2: all answered activity in the last 7 days for this teacher's students
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: activityRows } = await supabase
    .from("question_instances")
    .select("student_id, answered_at")
    .in("student_id", studentIds)
    .eq("answered", true)
    .not("answered_at", "is", null)
    .gte("answered_at", weekAgo.toISOString())
    .limit(5000);

  const rows = activityRows ?? [];

  // Aggregate per student in JS
  const now        = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const actMap = {};
  for (const row of rows) {
    const sid = row.student_id;
    if (!actMap[sid]) actMap[sid] = { today: 0, week: 0, lastActive: null };
    const ts = new Date(row.answered_at);
    actMap[sid].week++;
    if (ts >= todayStart) actMap[sid].today++;
    if (!actMap[sid].lastActive || ts > actMap[sid].lastActive) {
      actMap[sid].lastActive = ts;
    }
  }

  // Summary metrics
  let activeToday = 0;
  let activeWeek  = 0;
  let totalToday  = 0;
  for (const sid of studentIds) {
    const a = actMap[sid];
    if (a && a.today > 0) activeToday++;
    if (a && a.week  > 0) activeWeek++;
    totalToday += a?.today ?? 0;
  }
  const avgWeek = activeWeek > 0
    ? (rows.length / activeWeek).toFixed(1)
    : "0";

  summaryEl.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value" id="eng-active-today">${activeToday}</div>
        <div class="stat-label">Aktive i dag</div>
        <div class="stat-sub">af ${totalStudents} elever</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="eng-active-week">${activeWeek}</div>
        <div class="stat-label">Aktive denne uge</div>
        <div class="stat-sub">af ${totalStudents} elever</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="eng-today-total">${totalToday}</div>
        <div class="stat-label">Spm. i dag</div>
        <div class="stat-sub">besvaret</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="eng-avg-week">${avgWeek}</div>
        <div class="stat-label">Ugentlig gns.</div>
        <div class="stat-sub">pr. aktiv elev</div>
      </div>
    </div>
  `;

  // Per-student table — most active today first, then by week
  if (tableEl) {
    const sorted = [...students].sort((a, b) => {
      const aToday = actMap[a.student_id]?.today ?? 0;
      const bToday = actMap[b.student_id]?.today ?? 0;
      if (bToday !== aToday) return bToday - aToday;
      return (actMap[b.student_id]?.week ?? 0) - (actMap[a.student_id]?.week ?? 0);
    });

    const tableRows = sorted.map(s => {
      const a      = actMap[s.student_id] ?? { today: 0, week: 0, lastActive: null };
      const band   = s.current_band != null ? "Band " + s.current_band : "—";
      const last   = a.lastActive ? formatRelativeTime(a.lastActive, now) : "Aldrig";
      const dotCls = getActivityDotClass(a.lastActive, todayStart, now);
      return `<tr>
        <td>${s.display_name ?? "Elev"}</td>
        <td><span class="band-num">${band}</span></td>
        <td>${a.today}</td>
        <td>${a.week}</td>
        <td style="font-size:13px;color:var(--text-dim)">${last}</td>
        <td><span class="activity-dot ${dotCls}" title="${last}"></span></td>
      </tr>`;
    }).join("");

    tableEl.innerHTML = `
      <div class="overview-scroll">
        <table class="overview-table">
          <thead>
            <tr>
              <th>Elev</th><th>Band</th><th>I dag</th>
              <th>Denne uge</th><th>Sidst aktiv</th><th></th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `;
  }

  // Quick insights
  if (!insightsEl) return;

  const mostActive = students
    .filter(s => (actMap[s.student_id]?.today ?? 0) > 0)
    .sort((a, b) => (actMap[b.student_id]?.today ?? 0) - (actMap[a.student_id]?.today ?? 0))[0];

  const inactive7 = students.filter(s => !(actMap[s.student_id]?.week > 0));

  const band5 = students.filter(s => s.current_band != null && s.current_band >= 5);

  let html = '<div class="engagement-insights">';

  if (mostActive) {
    html += `<div class="insight-item insight-green">
      &#11088; Mest aktiv i dag: <strong>${mostActive.display_name}</strong>
      &mdash; ${actMap[mostActive.student_id]?.today ?? 0} sp&oslash;rgsm&aring;l
    </div>`;
  }

  if (inactive7.length > 0) {
    const names = inactive7.map(s => s.display_name ?? "Elev").join(", ");
    html += `<div class="insight-item insight-yellow">
      &#9888; Inaktiv &gt;7 dage: <strong>${names}</strong>
    </div>`;
  } else if (totalStudents > 0) {
    html += `<div class="insight-item insight-green">
      &#10003; Alle elever har v&aelig;ret aktive inden for 7 dage
    </div>`;
  }

  if (band5.length > 0) {
    const names = band5.map(s => s.display_name ?? "Elev").join(", ");
    html += `<div class="insight-item insight-purple">
      &#127942; Band 5: <strong>${names}</strong>
    </div>`;
  }

  html += "</div>";
  insightsEl.innerHTML = html;
}

/* ========================
   ROSTER: "DINE ELEVER" + FIRST RUN
   Every pupil this teacher owns, from get_teacher_visibility — the same contract the class
   overview uses (scoped by profiles.teacher_id). It also decides between the first-run state
   (roster loaded and empty) and the full dashboard. A load ERROR never shows the first-run
   state: "we could not load your pupils" is not "you have no pupils".
======================== */

let rosterStudents = [];

function setRosterState(state) {
  // state: "loading" | "empty" | "students" | "error"
  if (pageLoading) pageLoading.hidden = state !== "loading";
  if (firstRunSection) firstRunSection.hidden = state !== "empty";
  if (createBox) createBox.hidden = state === "loading";
  document.querySelectorAll("[data-needs-students]").forEach(el => {
    el.hidden = !(state === "students" || state === "error");
  });
  document.body.dataset.teacherState = state;
}

function panelMessage(container, text, isError) {
  container.innerHTML = "";
  const p = document.createElement("p");
  p.className = "panel-state" + (isError ? " is-error" : "");
  p.textContent = text;
  container.appendChild(p);
}

function gradeText(grade) {
  return grade != null ? grade + ". klasse" : "Klassetrin ikke valgt endnu";
}

function levelText(s) {
  // placement_band is set by the placement questions; before that the pupil has no level yet.
  // current_band is then the band of the pupil's recent answers.
  if (s.placement_band == null) return "Niveau ikke fundet endnu";
  const band = s.current_band ?? s.placement_band;
  return "Niveau: band " + band;
}

function renderStudentList(students) {
  if (!studentListContainer) return;
  studentListContainer.innerHTML = "";

  const list = document.createElement("ul");
  list.className = "row-list";
  list.id = "studentRows";

  students.forEach(s => {
    const li = document.createElement("li");
    li.className = "row-item";
    li.dataset.studentId = s.student_id;

    const main = document.createElement("div");
    main.className = "row-main";

    const name = document.createElement("div");
    name.className = "row-name";
    name.textContent = s.display_name ?? "Elev";

    const meta = document.createElement("div");
    meta.className = "row-meta";
    const grade = document.createElement("span");
    grade.className = "row-grade";
    grade.textContent = gradeText(s.selected_grade);
    const level = document.createElement("span");
    level.className = "row-level";
    level.textContent = levelText(s);
    meta.append(grade, level);

    main.append(name, meta);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-action student-open-btn";
    btn.dataset.id = s.student_id;
    btn.textContent = "Vis elev";
    btn.setAttribute("aria-label", "Vis elev: " + (s.display_name ?? "Elev"));
    btn.onclick = () => {
      window.location.href = `student-detail.html?id=${encodeURIComponent(s.student_id)}`;
    };

    li.append(main, btn);
    list.appendChild(li);
  });

  studentListContainer.appendChild(list);
}

async function loadRoster() {
  const { data, error } = await supabase.rpc("get_teacher_visibility", {
    p_teacher_id: teacherId
  });

  if (error || !Array.isArray(data)) {
    console.error("[teacher] roster load failed", error);
    rosterStudents = [];
    setRosterState("error");
    if (studentListContainer) {
      panelMessage(studentListContainer, "Dine elever kunne ikke indlæses. Genindlæs siden for at prøve igen.", true);
    }
    return false;
  }

  rosterStudents = data.filter(s => s && typeof s.student_id === "string");

  if (rosterStudents.length === 0) {
    setRosterState("empty");
    return true;
  }

  setRosterState("students");
  renderStudentList(rosterStudents);
  return true;
}

/* ========================
   "SVAR TIL VURDERING" — the review work queue
   Long answers from this teacher's pupils that have no teacher_score yet. A work queue, not the
   pupil list. Reviewing itself still happens on student-detail.html through review-answer, whose
   ownership checks and XP rules are unchanged.
======================== */

function groupPendingByStudent(rows, namesById) {
  const map = {};

  rows.forEach(row => {
    if (!row.student_id) return;
    if (typeof row.user_answer !== "string" || row.user_answer.trim() === "") return;

    if (!map[row.student_id]) {
      map[row.student_id] = {
        student_id: row.student_id,
        name: namesById[row.student_id] ?? "Elev",
        count: 0,
        oldest: row.created_at
      };
    }

    map[row.student_id].count++;

    if (row.created_at < map[row.student_id].oldest) {
      map[row.student_id].oldest = row.created_at;
    }
  });

  return Object.values(map);
}

function formatOldest(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ukendt tidspunkt";
  return d.toLocaleString("da-DK", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

function renderReviewQueue(groups) {
  if (!reviewQueueContainer) return;

  if (groups.length === 0) {
    panelMessage(reviewQueueContainer, "Ingen svar venter på vurdering.", false);
    return;
  }

  reviewQueueContainer.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "row-list";
  list.id = "reviewRows";

  groups.forEach(g => {
    const li = document.createElement("li");
    li.className = "row-item";
    li.dataset.studentId = g.student_id;

    const main = document.createElement("div");
    main.className = "row-main";

    const name = document.createElement("div");
    name.className = "row-name";
    name.textContent = g.name;

    const meta = document.createElement("div");
    meta.className = "row-meta";
    const count = document.createElement("span");
    count.className = "review-count";
    const chip = document.createElement("span");
    chip.className = "count-chip";
    chip.textContent = String(g.count);
    count.append(chip, " svar venter");
    const oldest = document.createElement("span");
    oldest.className = "review-oldest";
    oldest.textContent = "Ældste: " + formatOldest(g.oldest);
    meta.append(count, oldest);

    main.append(name, meta);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-action review-open-btn";
    btn.dataset.id = g.student_id;
    btn.textContent = "Vurder svar";
    btn.setAttribute("aria-label", "Vurder svar fra " + g.name);
    btn.onclick = () => {
      window.location.href = `student-detail.html?id=${encodeURIComponent(g.student_id)}`;
    };

    li.append(main, btn);
    list.appendChild(li);
  });

  reviewQueueContainer.appendChild(list);
}

async function loadReviewQueue() {
  if (!reviewQueueContainer) return;

  // Step 1: resolve this teacher's own pupils before reading any of their answers. The
  // question_instances policy scopes rows to the caller's pupils as well; this keeps the query
  // honest about what it asks for (tests/unit/question-instances-read-scope.test.mjs).
  const { data: myStudents, error: studentsError } = await supabase
    .from("profiles")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("role", "student");

  if (studentsError) {
    console.error("[teacher] review queue pupil lookup failed", studentsError);
    panelMessage(reviewQueueContainer, "Svarene kunne ikke indlæses. Genindlæs siden for at prøve igen.", true);
    return;
  }

  const studentIds = (myStudents || []).map(s => s.id).filter(Boolean);
  if (studentIds.length === 0) {
    renderReviewQueue([]);
    return;
  }

  const namesById = {};
  rosterStudents.forEach(s => { namesById[s.student_id] = s.display_name ?? "Elev"; });

  // Step 2: unscored answers from those pupils.
  const { data: instancesRaw, error: instancesError } = await supabase
    .from("question_instances")
    .select("student_id, created_at, user_answer, teacher_score, question_id")
    .in("student_id", studentIds)
    .is("teacher_score", null)
    .not("user_answer", "is", null);

  if (instancesError) {
    console.error("[teacher] review queue load failed", instancesError);
    panelMessage(reviewQueueContainer, "Svarene kunne ikke indlæses. Genindlæs siden for at prøve igen.", true);
    return;
  }

  const instances = instancesRaw || [];

  // Step 3: only long answers go to the teacher. Short text is graded automatically.
  const questionIds = [...new Set(instances.map(r => r.question_id).filter(Boolean))];

  if (questionIds.length === 0) {
    renderReviewQueue([]);
    return;
  }

  const { data: longQuestions, error: questionsError } = await supabase
    .from("questions")
    .select("id")
    .in("id", questionIds)
    .eq("answer_type", "long");

  if (questionsError) {
    console.error("[teacher] review queue question lookup failed", questionsError);
    panelMessage(reviewQueueContainer, "Svarene kunne ikke indlæses. Genindlæs siden for at prøve igen.", true);
    return;
  }

  const longQuestionIds = new Set((longQuestions || []).map(q => q.id));

  // Step 4: group per pupil, oldest waiting first.
  const longInstances = instances.filter(r => longQuestionIds.has(r.question_id));
  const grouped = groupPendingByStudent(longInstances, namesById);
  grouped.sort((a, b) => new Date(a.oldest) - new Date(b.oldest));
  renderReviewQueue(grouped);
}

// Everything that reads the roster, reloaded after it changes (a pupil was created).
async function refreshAfterRosterChange() {
  const ok = await loadRoster();
  if (!ok || rosterStudents.length === 0) return;
  await loadReviewQueue();
  await loadEngagementPanel();
  await loadClassOverview();
  await loadDomainPanel();
  await loadSpotlightPanel();
}

/* ========================
   SPOTLIGHT MANAGEMENT
======================== */

const spotlightSelect      = document.getElementById("spotlightStudentSelect");
const spotlightLabelSel    = document.getElementById("spotlightLabel");
const spotlightMsgInput    = document.getElementById("spotlightMessage");
const spotlightSetBtn      = document.getElementById("spotlightSetBtn");
const spotlightRemoveBtn   = document.getElementById("spotlightRemoveBtn");
const spotlightFeedbackEl  = document.getElementById("spotlightMessage2");
const spotlightCurrentList = document.getElementById("spotlightCurrentList");

async function loadSpotlightPanel() {
  if (!spotlightSelect) return;

  const { data, error } = await supabase.rpc("get_my_students");

  if (error || !data) {
    if (spotlightCurrentList) {
      spotlightCurrentList.innerHTML = "<p>Fejl ved indlæsning af elever.</p>";
    }
    return;
  }

  const students = data ?? [];

  // Populate the student dropdown.
  spotlightSelect.innerHTML = '<option value="">— Vælg elev —</option>';
  students.forEach(s => {
    const opt = document.createElement("option");
    opt.value       = s.student_id;
    opt.textContent = s.display_name + " (prestige: " + s.prestige_score + ")";
    spotlightSelect.appendChild(opt);
  });

  // Show currently spotlighted students.
  const spotlighted = students.filter(s => !!s.spotlight_label);
  if (!spotlightCurrentList) return;

  if (spotlighted.length === 0) {
    spotlightCurrentList.innerHTML =
      "<p style='color:#888;font-size:13px'>Ingen elever er fremhævet i øjeblikket.</p>";
    return;
  }

  spotlightCurrentList.innerHTML =
    "<p style='font-weight:bold;font-size:13px;margin-bottom:8px'>Aktive fremhævelser:</p>" +
    spotlighted.map(s =>
      `<div style='padding:6px 10px;background:#f5f5f5;border-radius:4px;margin-bottom:5px;font-size:13px'>` +
        `<strong>${s.display_name}</strong> — ${s.spotlight_label}` +
        (s.spotlight_message ? ` — "${s.spotlight_message}"` : "") +
      `</div>`
    ).join("");
}

if (spotlightSetBtn) {
  spotlightSetBtn.addEventListener("click", async () => {
    const studentId = spotlightSelect?.value ?? "";
    const label     = spotlightLabelSel?.value ?? "Ugens indsats";
    const message   = spotlightMsgInput?.value.trim() || null;

    if (!studentId) {
      spotlightFeedbackEl.style.color = "red";
      spotlightFeedbackEl.textContent = "Vælg en elev først.";
      return;
    }

    spotlightFeedbackEl.textContent = "";

    const { error } = await supabase.rpc("set_spotlight", {
      p_student_id: studentId,
      p_label:      label,
      p_message:    message,
    });

    if (error) {
      spotlightFeedbackEl.style.color = "red";
      spotlightFeedbackEl.textContent = "Fejl: " + (error.message ?? "Prøv igen.");
      return;
    }

    spotlightFeedbackEl.style.color = "green";
    spotlightFeedbackEl.textContent = "Fremhævelse sat!";
    if (spotlightMsgInput) spotlightMsgInput.value = "";

    await loadSpotlightPanel();
  });
}

if (spotlightRemoveBtn) {
  spotlightRemoveBtn.addEventListener("click", async () => {
    const studentId = spotlightSelect?.value ?? "";

    if (!studentId) {
      spotlightFeedbackEl.style.color = "red";
      spotlightFeedbackEl.textContent = "Vælg en elev først.";
      return;
    }

    spotlightFeedbackEl.textContent = "";

    const { error } = await supabase.rpc("remove_spotlight", {
      p_student_id: studentId,
    });

    if (error) {
      spotlightFeedbackEl.style.color = "red";
      spotlightFeedbackEl.textContent = "Fejl: " + (error.message ?? "Prøv igen.");
      return;
    }

    spotlightFeedbackEl.style.color = "green";
    spotlightFeedbackEl.textContent = "Fremhævelse fjernet.";

    await loadSpotlightPanel();
  });
}

/* ========================
   INIT
======================== */

setRosterState("loading");

// The roster decides what this teacher sees first: the first-run guide (no pupils yet) or the
// dashboard. The other panels only load when there is something to show.
const rosterLoaded = await loadRoster();

if (!rosterLoaded || rosterStudents.length > 0) {
  await loadReviewQueue();
  await loadEngagementPanel();
  await loadClassOverview();
  await loadDomainPanel();
  await loadSpotlightPanel();
}
