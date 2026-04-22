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

  const { data, error } = await supabase
    .from("question_instances")
    .select(`
      id,
      user_answer,
      teacher_score,
      teacher_feedback,
      created_at,
      questions(content)
    `)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  const pending = data.filter(d => d.teacher_score === null);
  const reviewed = data.filter(d => d.teacher_score !== null);

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

    const content = item.questions?.content ?? {};
    const question = content.question ?? "";
    const answer = item.user_answer ?? "";

    const box = document.createElement("div");
    box.className = "box";

    const approveBtn = document.createElement("button");
    approveBtn.textContent = "GODKEND";
    approveBtn.onclick = () => approveAnswer(item.id);

    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "AFVIS";
    rejectBtn.onclick = () => rejectAnswer(item.id);

    box.innerHTML = `
      <strong>SPØRGSMÅL</strong><br>${question}<br><br>
      <strong>SVAR</strong><br>${answer}<br><br>
    `;

    box.appendChild(approveBtn);
    box.appendChild(rejectBtn);

    container.appendChild(box);
  });

  // 🟢 Reviewed
  const reviewedTitle = document.createElement("h3");
  reviewedTitle.textContent = "Vurderede svar";
  container.appendChild(reviewedTitle);

  reviewed.forEach(item => {

    const content = item.questions?.content ?? {};
    const question = content.question ?? "";
    const answer = item.user_answer ?? "";

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
// APPROVE / REJECT (KORREKT)
// ========================

async function approveAnswer(instanceId) {
  await supabase.functions.invoke("review-answer", {
    body: {
      instance_id: instanceId,
      score: 4,
      feedback: "Godt svar"
    }
  });

  await fetchQuestionInstances();
}

async function rejectAnswer(instanceId) {
  await supabase.functions.invoke("review-answer", {
    body: {
      instance_id: instanceId,
      score: 1,
      feedback: "Afvist"
    }
  });

  await fetchQuestionInstances();
}

// ========================
// INIT
// ========================

await fetchStudent();