import { supabase } from "./supabase.js";

// ========================
// AUTH CHECK
// ========================

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "login.html";
    return null;
  }

  const teacherId = sessionData.session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", teacherId)
    .maybeSingle();

  if (!profile || profile.role !== "teacher") {
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return null;
  }

  return teacherId;
}

const teacherId = await checkAuthAndRole();
if (!teacherId) throw new Error("Unauthorized");

document.body.style.display = "block";

// ========================
// BFCache Protection
// ========================

window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.href = "login.html";
    }
  }
});

// ========================
// GET STUDENT ID
// ========================

const params = new URLSearchParams(window.location.search);
const studentId = params.get("id");

if (!studentId) {
  document.getElementById("studentInfo").textContent = "Ingen elev angivet.";
  throw new Error("Missing student ID");
}

// ========================
// DOMAIN MAPPING (Section 91)
// ========================

const DOMAIN_LABELS = {
  prehistoric_denmark:   "Forhistorisk Danmark",
  vikings:               "Vikingerne",
  middle_ages:           "Middelalderen",
  reformation_monarchy:  "Reformation & Monarki",
  enlightenment:         "Oplysningstiden",
  revolutions_democracy: "Revolutioner & Demokrati",
  industrialisation:     "Industrialisering",
  world_war_1:           "1. Verdenskrig",
  world_war_2:           "2. Verdenskrig",
  cold_war:              "Den Kolde Krig",
  democracy_power:       "Demokrati & Magt",
};

function objectiveToDomain(lo) {
  if (!lo || typeof lo !== "string") return null;
  if (DOMAIN_LABELS[lo]) return lo;
  if (lo.startsWith("ww2_")) return "world_war_2";
  if (lo.startsWith("ww1_")) return "world_war_1";
  return null;
}

// ========================
// DOMAIN EDITOR (Section 96)
// Canonical order from audit — must match teacher.js ALL_DOMAINS exactly.
// ========================

const SD_DOMAINS = [
  { key: "prehistoric_denmark",   label: "Forhistorisk Danmark"     },
  { key: "vikings",               label: "Vikingerne"               },
  { key: "middle_ages",           label: "Middelalderen"            },
  { key: "reformation_monarchy",  label: "Reformation & Monarki"    },
  { key: "enlightenment",         label: "Oplysningstiden"          },
  { key: "revolutions_democracy", label: "Revolutioner & Demokrati" },
  { key: "industrialisation",     label: "Industrialisering"        },
  { key: "world_war_1",           label: "1. Verdenskrig"           },
  { key: "world_war_2",           label: "2. Verdenskrig"           },
  { key: "cold_war",              label: "Den Kolde Krig"           },
  { key: "democracy_power",       label: "Demokrati & Magt"         },
];

function setupDomainEditor(activeDomains) {
  const container = document.getElementById("domain-editor");
  if (!container) return;

  const checked = Array.isArray(activeDomains) && activeDomains.length > 0
    ? activeDomains
    : [];

  // Checkbox grid
  const grid = document.createElement("div");
  grid.className = "sd-domain-grid";
  grid.id = "sd-domain-grid";

  SD_DOMAINS.forEach(({ key, label }) => {
    const lbl = document.createElement("label");
    lbl.className = "sd-domain-label";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = key;
    cb.checked = checked.includes(key);

    lbl.appendChild(cb);
    lbl.append(` ${label}`);
    grid.appendChild(lbl);
  });

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "sd-domain-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "sd-domain-save";
  saveBtn.textContent = "Gem domæner";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.id = "sd-domain-reset";
  resetBtn.className = "sd-domain-reset";
  resetBtn.textContent = "Alle domæner";

  actions.appendChild(saveBtn);
  actions.appendChild(resetBtn);

  // Status message
  const msgDiv = document.createElement("div");
  msgDiv.className = "sd-domain-msg";
  msgDiv.id = "sd-domain-msg";

  // Wire save
  saveBtn.onclick = async () => {
    const chosen = Array.from(
      grid.querySelectorAll("input[type=checkbox]:checked")
    ).map(cb => cb.value);

    if (chosen.length === 0) {
      msgDiv.style.color = "red";
      msgDiv.textContent = "Vælg mindst ét domæne, eller brug 'Alle domæner' for at fjerne filtrering.";
      return;
    }

    msgDiv.textContent = "";
    saveBtn.disabled = true;

    const { error } = await supabase.rpc("set_student_domains", {
      p_student_id: studentId,
      p_domains:    chosen,
    });

    saveBtn.disabled = false;

    if (error) {
      msgDiv.style.color = "red";
      msgDiv.textContent = "Fejl: " + (error.message ?? "Prøv igen.");
      return;
    }

    msgDiv.style.color = "green";
    msgDiv.textContent = "Domæner gemt. Eleven modtager nu kun spørgsmål fra de valgte emner.";
  };

  // Wire reset
  resetBtn.onclick = async () => {
    msgDiv.textContent = "";
    resetBtn.disabled = true;

    const { error } = await supabase.rpc("set_student_domains", {
      p_student_id: studentId,
      p_domains:    null,
    });

    resetBtn.disabled = false;

    if (error) {
      msgDiv.style.color = "red";
      msgDiv.textContent = "Fejl: " + (error.message ?? "Prøv igen.");
      return;
    }

    grid.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.checked = false;
    });
    msgDiv.style.color = "green";
    msgDiv.textContent = "Nulstillet. Eleven modtager spørgsmål fra alle domæner.";
  };

  container.innerHTML = "";
  container.appendChild(grid);
  container.appendChild(actions);
  container.appendChild(msgDiv);
}

// ========================
// PASSWORD RESET PANEL (Section 137)
// ========================

function setupPasswordResetPanel() {
  const btn    = document.getElementById("resetPasswordBtn");
  const result = document.getElementById("resetPasswordResult");
  if (!btn || !result) return;

  btn.onclick = async () => {
    btn.disabled = true;
    result.innerHTML = "";

    const { data, error } = await supabase.functions.invoke(
      "reset-student-password",
      { body: { student_id: studentId } }
    );

    btn.disabled = false;

    if (error || !data?.temporary_password) {
      result.style.color = "red";
      result.textContent = "Fejl: " + (data?.error ?? error?.message ?? "Prøv igen.");
      return;
    }

    result.innerHTML = `
      <p style="color:var(--accent);font-weight:bold;">Adgangskode nulstillet!</p>
      <p style="margin-top:6px;">Midlertidig adgangskode — giv denne til eleven:</p>
      <div class="temp-password-display">${data.temporary_password}</div>
      <p class="temp-password-note">
        Eleven skal vælge en ny adgangskode ved næste login.
        Koden vises kun én gang.
      </p>
    `;
  };
}

// ========================
// FETCH STUDENT
// ========================

async function fetchStudent() {

  const { data: overview } = await supabase
    .from("teacher_student_overview")
    .select("*")
    .eq("student_id", studentId)
    .eq("teacher_id", teacherId)
    .single();

  const { data: mastery } = await supabase
    .from("student_mastery_status")
    .select("*")
    .eq("student_id", studentId)
    .single();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("selected_grade, placement_band, current_band, active_domains")
    .eq("id", studentId)
    .maybeSingle();

  if (!overview || !mastery) {
    document.getElementById("studentInfo").textContent = "Elev ikke fundet.";
    return;
  }

  renderStudent(overview, mastery, profileData ?? {});
  renderBandPanel(profileData ?? {});
  setupDomainEditor(profileData?.active_domains ?? null);
  setupPasswordResetPanel();

  await fetchBandHistory();
  await fetchDomainProgress();
  await fetchQuestionInstances();
}

// ========================
// FETCH DOMAIN PROGRESS (Section 91)
// ========================

async function fetchDomainProgress() {
  const { data, error } = await supabase
    .from("question_instances")
    .select("is_correct, was_correct, questions(learning_objective)")
    .eq("student_id", studentId)
    .eq("answered", true)
    .limit(1000);

  if (error) {
    console.error("Domain progress fetch error:", error);
    document.getElementById("domainProgressPanel").textContent = "Fejl ved indlæsning af domænedata.";
    return;
  }

  const instances = data ?? [];
  const stats = {};

  for (const inst of instances) {
    const lo = inst.questions?.learning_objective ?? null;
    const domain = objectiveToDomain(lo);
    if (!domain) continue;
    if (!stats[domain]) stats[domain] = { total: 0, correct: 0 };
    stats[domain].total++;
    if (inst.is_correct === true || inst.was_correct === true) {
      stats[domain].correct++;
    }
  }

  const rows = Object.entries(stats)
    .map(([domain, s]) => ({ domain, total: s.total, correct: s.correct }))
    .sort((a, b) => b.total - a.total);

  renderDomainProgress(rows);
}

// ========================
// RENDER DOMAIN PROGRESS (Section 91)
// ========================

function renderDomainProgress(rows) {
  const container = document.getElementById("domainProgressPanel");

  if (rows.length === 0) {
    container.textContent = "Eleven har ikke besvaret nogen spørgsmål endnu.";
    return;
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
    <th>Dom&#230;ne</th>
    <th>Besvaret</th>
    <th>Korrekte</th>
    <th>Pr&#230;cision</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const row of rows) {
    const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
    const label = DOMAIN_LABELS[row.domain] ?? row.domain;
    const color = pct >= 80 ? "#4caf50" : pct >= 50 ? "#ff9800" : "#f44336";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td>${row.total}</td>
      <td>${row.correct}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;background:var(--border);border-radius:4px;height:8px;overflow:hidden;">
            <div style="width:${pct}%;background:${color};height:100%;"></div>
          </div>
          <span style="min-width:36px;font-size:12px;color:${color};font-weight:bold;">${pct}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

// ========================
// FETCH QUESTION INSTANCES (NY SANDHED)
// ========================

async function fetchQuestionInstances() {

  // 🔴 Pending
  const { data: pendingRaw, error: pError } = await supabase
    .from("question_instances")
    .select(`
      id,
      user_answer,
      teacher_score,
      teacher_feedback,
      created_at,
      question_id
    `)
    .eq("student_id", studentId)
    .is("teacher_score", null)
    .not("user_answer", "is", null)
    .neq("user_answer", "")
    .order("created_at", { ascending: true })
    .limit(50);

  if (pError) {
    console.error(pError);
    return;
  }

  // 🟢 Reviewed
  const { data: reviewedRaw, error: rError } = await supabase
    .from("question_instances")
    .select(`
      id,
      user_answer,
      teacher_score,
      teacher_feedback,
      created_at,
      question_id
    `)
    .eq("student_id", studentId)
    .not("teacher_score", "is", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (rError) {
    console.error(rError);
    return;
  }

  const allIds = [
    ...new Set(
      [
        ...(pendingRaw || []).map(p => p.question_id),
        ...(reviewedRaw || []).map(p => p.question_id)
      ].filter(Boolean)
    )
  ];

  const { data: questionsData } = allIds.length
    ? await supabase.from("questions").select("id, content").in("id", allIds)
    : { data: [] };

  const questionMap = Object.fromEntries(
    (questionsData || []).map(q => [q.id, q.content])
  );

  const pending = (pendingRaw || [])
    .filter(item => item.user_answer && item.user_answer.trim() !== "")
    .map(item => ({
      ...item,
      content: questionMap[item.question_id] || {}
    }));

  const reviewed = (reviewedRaw || [])
    .filter(item => item.user_answer && item.user_answer.trim() !== "")
    .map(item => ({
      ...item,
      content: questionMap[item.question_id] || {}
    }));

  renderReview(pending, reviewed);
}

// ========================
// RENDER STUDENT
// ========================

function renderStudent(student, mastery, profileData) {

  const container = document.getElementById("studentInfo");

  const grade         = profileData?.selected_grade != null ? profileData.selected_grade + ". klasse" : "Ikke valgt";
  const placementBand = profileData?.placement_band != null ? "Band " + profileData.placement_band    : "Ikke afsluttet";

  container.innerHTML = `
    <p><strong>Email:</strong> ${student.email ?? "—"}</p>
    <p><strong>Klassetrin:</strong> ${grade}</p>
    <p><strong>Startband (placeringstest):</strong> ${placementBand}</p>
    <p style="margin-bottom:6px;"><strong>Dom&#230;ne-fokus</strong></p>
    <div id="domain-editor"></div>
    <p style="margin-top:12px;"><strong>XP:</strong> ${student.xp ?? 0}</p>
    <p><strong>Level:</strong> ${student.level ?? 1}</p>

    <hr>

    <p><strong>Korrekt svarprocent (seneste):</strong> ${mastery.correct_ratio ?? 0}%</p>
    <p><strong>Total korrekte:</strong> ${mastery.total_correct_answers ?? 0}</p>
    <p><strong>Forsøg i alt:</strong> ${mastery.total_attempts ?? 0}</p>
  `;
}

// ========================
// RENDER BAND PANEL (Section 128)
// ========================

function renderBandPanel(profileData) {
  const container = document.getElementById("sd-band-panel");
  if (!container) return;

  const placement = profileData?.placement_band ?? null;
  const current   = profileData?.current_band   ?? null;

  const placementText = placement != null ? "Band " + placement : "Ikke afsluttet";
  const currentText   = current   != null ? "Band " + current   : "Ingen aktiv session";

  let html = `<p><strong>Placering:</strong> ${placementText}</p>`;
  html    += `<p><strong>Nuværende:</strong> <span id="sd-band-current">${currentText}</span></p>`;

  if (placement != null && current != null) {
    const delta = current - placement;
    const sign  = delta > 0 ? "+" : "";
    const color = delta > 0 ? "#4caf50" : delta < 0 ? "#f44336" : "var(--text-dim)";
    const label = delta === 0 ? "Ingen ændring" : sign + delta + " band";
    html += `<p><strong>Fremgang:</strong> <span id="sd-band-delta" style="color:${color};font-weight:bold;">${label}</span></p>`;
  }

  container.innerHTML = html;
}

// ========================
// FETCH BAND HISTORY (Section 129)
// ========================

async function fetchBandHistory() {
  const container = document.getElementById("sd-band-history");

  const { data, error } = await supabase
    .from("question_instances")
    .select("answered_at, questions(difficulty_band)")
    .eq("student_id", studentId)
    .eq("answered", true)
    .not("answered_at", "is", null)
    .order("answered_at", { ascending: true })
    .limit(500);

  if (error) {
    if (container) container.textContent = "Fejl ved indlæsning af bandhistorik.";
    return;
  }

  // Group by calendar date → highest band on that day
  const dayMap = {};
  for (const row of data ?? []) {
    const band = row.questions?.difficulty_band;
    if (!band || !row.answered_at) continue;
    const day = row.answered_at.slice(0, 10);
    if (!dayMap[day] || dayMap[day] < band) dayMap[day] = band;
  }

  const days = Object.entries(dayMap)
    .map(([day, maxBand]) => ({ day, maxBand }))
    .sort((a, b) => a.day.localeCompare(b.day));

  renderBandHistory(days);
}

// ========================
// RENDER BAND HISTORY (Section 129)
// ========================

const BAND_COLORS = { 1: "#888", 2: "#4caf50", 3: "#2196f3", 4: "#ff9800", 5: "#e91e63" };

function renderBandHistory(days) {
  const container = document.getElementById("sd-band-history");
  if (!container) return;

  if (days.length === 0) {
    container.textContent = "Ingen bandhistorik endnu.";
    return;
  }

  const highestBand = Math.max(...days.map(d => d.maxBand));
  const daysActive  = days.length;
  const firstDay    = days[0].day;
  const accentColor = BAND_COLORS[highestBand] ?? "var(--accent)";

  let html = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;" id="sd-band-summary">
      <div>
        <strong>Højeste band</strong>
        <div style="font-size:20px;font-weight:bold;color:${accentColor};" id="sd-band-highest">Band ${highestBand}</div>
      </div>
      <div>
        <strong>Aktive dage</strong>
        <div style="font-size:20px;font-weight:bold;color:var(--text-bright);">${daysActive}</div>
      </div>
      <div>
        <strong>Aktiv siden</strong>
        <div style="font-size:14px;color:var(--text-main);">${formatHistoryDate(firstDay)}</div>
      </div>
    </div>
    <hr>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;" id="sd-band-timeline">
  `;

  const recent = [...days].reverse().slice(0, 20);
  for (const { day, maxBand } of recent) {
    const color = BAND_COLORS[maxBand] ?? "var(--text-dim)";
    html += `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:12px;color:var(--text-dim);min-width:90px;">${formatHistoryDate(day)}</span>
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="font-size:13px;font-weight:bold;color:${color};">Band ${maxBand}</span>
      </div>
    `;
  }

  html += "</div>";
  container.innerHTML = html;
}

function formatHistoryDate(iso) {
  if (!iso || typeof iso !== "string") return iso ?? "";
  const [y, m, d] = iso.split("-");
  const months = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
  const month = months[parseInt(m, 10) - 1] ?? m;
  return `${parseInt(d, 10)}. ${month} ${y}`;
}

// ========================
// RENDER REVIEW
// ========================

function renderReview(pending, reviewed) {

  const container = document.getElementById("reviewPanel");
  container.innerHTML = "";

  // 🔴 Pending
  const pendingTitle = document.createElement("h3");
  pendingTitle.textContent = "Ventende svar";
  container.appendChild(pendingTitle);

  if (pending.length === 0) {
    container.innerHTML += "<p>Ingen ventende svar</p>";
  }

  pending.forEach(item => {
    console.log("PENDING ITEM:", item);

    const raw = item.content;
    let content = {};
    try {
      content = typeof raw === "string" ? JSON.parse(raw) : raw ?? {};
    } catch {
      console.warn("Invalid content JSON", raw);
    }
    const question =
      content.question ??
      content.text ??
      "(mangler spørgsmål)";
    const answer = item.user_answer ?? "(intet svar)";
    const facit =
      content.answer ??
      content.correct ??
      content.correct_answer ??
      "(intet facit)";

    const box = document.createElement("div");
    box.className = "box";

    box.innerHTML = `
      <strong>SPØRGSMÅL</strong><br>${question}<br><br>
      <strong>SVAR</strong><br>${answer}<br><br>
      <strong>FACIT</strong><br>${facit}<br><br>
    `;

    const scores = [
      { score: 1, label: "1 – Afvist" },
      { score: 2, label: "2 – OK" },
      { score: 3, label: "3 – Godt" },
      { score: 4, label: "4 – Perfekt" }
    ];

    scores.forEach(({ score, label }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.onclick = async () => {
        btn.disabled = true;
        await reviewAnswer(item.id, score);
      };
      box.appendChild(btn);
    });

    container.appendChild(box);
  });

  // 🟢 Reviewed
  const reviewedTitle = document.createElement("h3");
  reviewedTitle.textContent = "Vurderede svar";
  container.appendChild(reviewedTitle);

  reviewed.forEach(item => {
    console.log("REVIEWED ITEM:", item);

    const raw = item.content;
    let content = {};
    try {
      content = typeof raw === "string" ? JSON.parse(raw) : raw ?? {};
    } catch {
      console.warn("Invalid content JSON", raw);
    }
    const question =
      content.question ??
      content.text ??
      "(mangler spørgsmål)";
    const answer = item.user_answer ?? "(intet svar)";

    const box = document.createElement("div");
    box.className = "box";

    box.innerHTML = `
      <strong>SPØRGSMÅL</strong><br>${question}<br><br>
      <strong>SVAR</strong><br>${answer}<br><br>
      <strong>Score:</strong> ${item.teacher_score}<br>
      <strong>Feedback:</strong> ${item.teacher_feedback ?? ""}
    `;

    container.appendChild(box);
  });
}

// ========================
// REVIEW ACTION
// ========================

async function reviewAnswer(instanceId, score) {
  console.log("REVIEW CALLED", instanceId, score);

  const feedbackMap = {
    1: "Afvist",
    2: "OK",
    3: "Godt",
    4: "Perfekt"
  };

  const { error } = await supabase.functions.invoke("review-answer", {
    body: {
      instance_id: instanceId,
      score,
      feedback: feedbackMap[score] ?? ""
    }
  });

  if (error) {
    console.error("Review error:", error);
    alert("Fejl ved vurdering");
    return;
  }

  await fetchQuestionInstances();
}

// ========================
// INIT
// ========================

await fetchStudent();
