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
    .select("selected_grade, placement_band, active_domains")
    .eq("id", studentId)
    .maybeSingle();

  if (!overview || !mastery) {
    document.getElementById("studentInfo").textContent = "Elev ikke fundet.";
    return;
  }

  renderStudent(overview, mastery, profileData ?? {});

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

  const DOMAIN_LABEL_SD = {
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

  const grade         = profileData?.selected_grade  != null ? profileData.selected_grade + ". klasse" : "Ikke valgt";
  const placementBand = profileData?.placement_band  != null ? "Band " + profileData.placement_band    : "Ikke afsluttet";
  const rawDomains    = profileData?.active_domains;
  const domainText    = Array.isArray(rawDomains) && rawDomains.length > 0
    ? rawDomains.map(d => DOMAIN_LABEL_SD[d] ?? d).join(", ")
    : "Alle domæner (fri udforskning)";

  container.innerHTML = `
    <p><strong>Email:</strong> ${student.email ?? "—"}</p>
    <p><strong>Klassetrin:</strong> ${grade}</p>
    <p><strong>Startband (placeringstest):</strong> ${placementBand}</p>
    <p><strong>Dom&#230;ne-fokus:</strong> ${domainText}</p>
    <p><strong>XP:</strong> ${student.xp ?? 0}</p>
    <p><strong>Level:</strong> ${student.level ?? 1}</p>

    <hr>

    <p><strong>Korrekt svarprocent (seneste):</strong> ${mastery.correct_ratio ?? 0}%</p>
    <p><strong>Total korrekte:</strong> ${mastery.total_correct_answers ?? 0}</p>
    <p><strong>Forsøg i alt:</strong> ${mastery.total_attempts ?? 0}</p>
  `;
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
