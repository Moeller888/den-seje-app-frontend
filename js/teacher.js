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
const studentEmailInput = document.getElementById("studentEmail");
const studentPasswordInput = document.getElementById("studentPassword");
const createStudentBtn = document.getElementById("createStudentBtn");
const createMessage = document.getElementById("createMessage");
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

createStudentBtn.addEventListener("click", async () => {

  const email = studentEmailInput.value.trim();
  const password = studentPasswordInput.value.trim();

  createMessage.textContent = "";
  createMessage.style.color = "red";

  if (!email || !password) {
    createMessage.textContent = "Udfyld begge felter.";
    return;
  }

  if (!isValidEmail(email)) {
    createMessage.textContent = "Ugyldig email-adresse.";
    return;
  }

  if (password.length < 6) {
    createMessage.textContent = "Adgangskode skal vaere mindst 6 tegn.";
    return;
  }

  const { data, error } = await supabase.functions.invoke(
    "create-student",
    { body: { email, password } }
  );

  if (error || data?.error) {
    createMessage.textContent =
      error?.message || data?.error || "Fejl ved oprettelse.";
    return;
  }

  createMessage.style.color = "green";
  createMessage.textContent = "Elev oprettet korrekt.";

  studentEmailInput.value = "";
  studentPasswordInput.value = "";

  await loadStudentOverview();
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
    const grade   = s.selected_grade  != null ? s.selected_grade  : "—";
    const placed  = s.placement_band  != null ? s.placement_band  : "—";
    const current = s.current_band    != null ? s.current_band    : "—";

    let growthHtml = "";
    if (s.placement_band != null && s.current_band != null) {
      const delta = s.current_band - s.placement_band;
      if (delta > 0)      growthHtml = ` <span class="band-growth-pos">(+${delta})</span>`;
      else if (delta < 0) growthHtml = ` <span class="band-growth-neg">(${delta})</span>`;
    }

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
      "<td><span class=\"band-num\">" + placed + "</span></td>" +
      "<td><span class=\"band-num\">" + current + "</span>" + growthHtml + "</td>" +
      "<td>" + (s.total_attempts ?? 0) + "</td>" +
      "<td class=\"" + pctClass + "\">" + pct + "%</td>" +
      "<td class=\"" + (TREND_CLASS[trend] ?? "trend-stable") + "\">" + (TREND_ICON[trend] ?? "→") + "</td>" +
      "<td style=\"max-width:140px;white-space:normal\">" + domainCell + "</td>" +
      "<td><button class=\"go-student-btn\" data-id=\"" + s.student_id + "\">Vis →</button></td>" +
      "</tr>";
  }).join("");

  container.innerHTML =
    '<div class="overview-scroll"><table class="overview-table"><thead><tr>' +
    "<th>Elev</th><th>Kl.</th><th>Start</th><th>Nu</th>" +
    "<th>Spm.</th><th>Korrekt</th><th>Trend</th><th>Emner</th><th></th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>";

  container.querySelectorAll(".go-student-btn").forEach(btn => {
    btn.onclick = () => {
      window.location.href = `student-detail.html?id=${btn.dataset.id}`;
    };
  });
}

/* ========================
   STUDENT OVERVIEW (PENDING)
======================== */

function groupByStudent(rows) {
  const map = {};

  rows.forEach(row => {
    if (!row.student_id) return;
    if (!row.user_answer || row.user_answer.trim() === "") return;

    if (!map[row.student_id]) {
      map[row.student_id] = {
        student_id: row.student_id,
        email: row.profiles?.email ?? "Ukendt",
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

function renderStudentList(students) {
  const container = document.getElementById("studentList");
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = "<p>Ingen ventende svar</p>";
    return;
  }

  students.forEach(s => {
    const div = document.createElement("div");
    div.className = "box";

    div.innerHTML = `
      <strong>${s.email}</strong><br>
      Ventende svar: ${s.count}<br>
      Ældste: ${new Date(s.oldest).toLocaleString()}
      <br><br>
    `;

    const btn = document.createElement("button");
    btn.textContent = "Gå til elev";
    btn.onclick = () => {
      window.location.href = `student-detail.html?id=${s.student_id}`;
    };

    div.appendChild(btn);
    container.appendChild(div);
  });
}

async function loadStudentOverview() {
  // Step 1: Get only students belonging to this teacher.
  const { data: myStudents, error: studentsError } = await supabase
    .from("profiles")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("role", "student");

  if (studentsError) {
    console.error(studentsError);
    studentListContainer.innerHTML = "<p>Fejl ved indlæsning af elever</p>";
    return;
  }

  const studentIds = (myStudents || []).map(s => s.id);

  if (studentIds.length === 0) {
    studentListContainer.innerHTML = "<p>Ingen elever tilknyttet</p>";
    return;
  }

  // Step 2: Pending instances for this teacher's students only.
  const { data: instancesRaw, error: instancesError } = await supabase
    .from("question_instances")
    .select(`
      student_id,
      created_at,
      user_answer,
      teacher_score,
      question_id,
      profiles!question_instances_student_id_fkey (
        email
      )
    `)
    .in("student_id", studentIds)
    .is("teacher_score", null)
    .not("user_answer", "is", null);

  if (instancesError) {
    console.error(instancesError);
    return;
  }

  const instances = instancesRaw || [];

  // Step 3: Identify which of those questions are long-answer type.
  // Short-text is auto-graded; teachers only review long-answer submissions.
  const questionIds = [...new Set(instances.map(r => r.question_id).filter(Boolean))];

  if (questionIds.length === 0) {
    renderStudentList([]);
    return;
  }

  const { data: longQuestions } = await supabase
    .from("questions")
    .select("id")
    .in("id", questionIds)
    .eq("answer_type", "long");

  const longQuestionIds = new Set((longQuestions || []).map(q => q.id));

  // Step 4: Filter instances to long-answer only and group by student.
  const longInstances = instances.filter(r => longQuestionIds.has(r.question_id));

  const grouped = groupByStudent(longInstances);
  grouped.sort((a, b) => new Date(a.oldest) - new Date(b.oldest));
  renderStudentList(grouped);
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

await loadClassOverview();
await loadDomainPanel();
await loadStudentOverview();
await loadSpotlightPanel();
