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
// GET STUDENT ID FROM URL
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

  const { data: overview, error: overviewError } = await supabase
    .from("teacher_student_overview")
    .select("*")
    .eq("student_id", studentId)
    .eq("teacher_id", teacherId)
    .single();

  if (overviewError || !overview) {
    document.getElementById("studentInfo").textContent = "Adgang nægtet.";
    return;
  }

  const { data: mastery, error: masteryError } = await supabase
    .from("student_mastery_status")
    .select("*")
    .eq("student_id", studentId)
    .single();

  if (masteryError || !mastery) {
    document.getElementById("studentInfo").textContent = "Kunne ikke hente mastery-status.";
    return;
  }

  renderStudent(overview, mastery);
  await fetchEvents();
}

// ========================
// FETCH EVENTS
// ========================

async function fetchEvents() {

  const { data, error } = await supabase
    .from("student_events")
    .select("type, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    document.getElementById("eventList").textContent = "Kunne ikke hente events.";
    return;
  }

  renderEvents(data);
}

// ========================
// RENDER
// ========================

function renderStudent(student, mastery) {

  const container = document.getElementById("studentInfo");

  const balance = mastery.mastery_balance;

  let momentumColor = "#666";
  let momentumLabel = "Stabil";

  if (balance > 0) {
    momentumColor = "green";
    momentumLabel = "På vej op";
  } else if (balance < 0) {
    momentumColor = "red";
    momentumLabel = "På vej ned";
  }

  const momentumDisplay =
    balance > 0 ? `+${balance}` : balance;

  container.innerHTML = `
    <p><strong>Email:</strong> ${student.email}</p>
    <p><strong>XP:</strong> ${student.xp}</p>
    <p><strong>Level:</strong> ${student.level}</p>

    <hr>

    <p><strong>Mastery level:</strong> ${mastery.mastery_level}</p>

    <p>
      <strong>Momentum:</strong>
      <span style="color: ${momentumColor}; font-weight: bold;">
        ${momentumDisplay} (${momentumLabel})
      </span>
    </p>

    <p><strong>Til næste niveau:</strong> ${mastery.distance_up} korrekt(e) svar</p>
    <p><strong>Til niveau ned:</strong> ${mastery.distance_down} forkert(e) svar</p>

    <p><strong>Korrekt svarprocent:</strong> ${mastery.correct_ratio}%</p>
    <p><strong>Total korrekte:</strong> ${mastery.total_correct_answers}</p>
    <p><strong>Forsøg i alt:</strong> ${mastery.total_attempts}</p>
  `;
}

function renderEvents(events) {

  const container = document.getElementById("eventList");

  if (!events || events.length === 0) {
    container.textContent = "Ingen events endnu.";
    return;
  }

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

await fetchStudent();