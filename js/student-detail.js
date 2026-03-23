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

  await fetchEvents();
  await fetchAnswersForReview();
}

// ========================
// FETCH EVENTS
// ========================

async function fetchEvents() {

  const { data } = await supabase
    .from("student_events")
    .select("type, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  renderEvents(data);
}

// ========================
// FETCH ANSWERS FOR REVIEW
// ========================

async function fetchAnswersForReview() {

  const { data } = await supabase
    .from("student_answers")
    .select(`
      id,
      answer_text,
      ai_feedback,
      status,
      questions (
        content
      )
    `)
    .eq("student_id", studentId)
    .eq("status", "pending")
    .limit(5);

  renderReview(data);
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
// RENDER EVENTS
// ========================

function renderEvents(events) {

  const container = document.getElementById("reviewPanel");

  const table = document.createElement("table");

  const header = document.createElement("tr");
  header.innerHTML = `
    <th>Type</th>
    <th>Tidspunkt</th>
  `;

  table.appendChild(header);

  events.forEach(event => {

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${event.type}</td>
      <td>${new Date(event.created_at).toLocaleString()}</td>
    `;

    table.appendChild(row);
  });

  container.innerHTML = "";
  container.appendChild(table);
}

// ========================
// RENDER REVIEW PANEL
// ========================

function renderReview(answers) {

  const container = document.getElementById("reviewPanel");

  answers.forEach(a => {

    const box = document.createElement("div");
    box.className = "box";

    const question = a.questions?.content?.question ?? "Ukendt spørgsmål";

    box.innerHTML = `
      <h3>SPØRGSMÅL</h3>
      <p>${question}</p>

      <h3>ELEVENS SVAR</h3>
      <p>${a.answer_text}</p>

      <h3>FACIT (AI)</h3>
      <p>${a.ai_feedback ?? "Ingen feedback"}</p>

      <button data-id="${a.id}" class="approve">GODKEND</button>
      <button data-id="${a.id}" class="reject">AFVIS</button>
    `;

    container.appendChild(box);
  });

  document.querySelectorAll(".approve").forEach(btn => {
    btn.onclick = () => reviewAnswer(btn.dataset.id, true);
  });

  document.querySelectorAll(".reject").forEach(btn => {
    btn.onclick = () => reviewAnswer(btn.dataset.id, false);
  });
}

// ========================
// REVIEW ACTION
// ========================

async function reviewAnswer(answerId, approve) {

  await supabase
    .from("student_answers")
    .update({
      status: approve ? "approved" : "rejected",
      reviewed_at: new Date(),
      teacher_id: teacherId
    })
    .eq("id", answerId);

  location.reload();
}

// ========================
// INIT
// ========================

await fetchStudent();
