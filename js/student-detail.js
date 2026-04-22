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
    .single();

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
// GET STUDENT ID
// ========================

const params = new URLSearchParams(window.location.search);
const studentId = params.get("id");

if (!studentId) {
  document.getElementById("studentInfo").textContent = "Ingen elev angivet.";
  throw new Error("Missing student ID");
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

  renderStudent(overview, mastery);

  await fetchQuestionInstances();
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

function renderStudent(student, mastery) {

  const container = document.getElementById("studentInfo");

  container.innerHTML = `
    <p><strong>Email:</strong> ${student.email}</p>
    <p><strong>XP:</strong> ${student.xp}</p>
    <p><strong>Level:</strong> ${student.level}</p>

    <hr>

    <p><strong>Mastery level:</strong> ${mastery.mastery_level}</p>
    <p><strong>Korrekt svarprocent:</strong> ${mastery.correct_ratio}%</p>
    <p><strong>Total korrekte:</strong> ${mastery.total_correct_answers}</p>
    <p><strong>Forsøg i alt:</strong> ${mastery.total_attempts}</p>
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