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
    .single();

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
  const { data, error } = await supabase
    .from("question_instances")
    .select(`
      student_id,
      created_at,
      user_answer,
      teacher_score,
      profiles!question_instances_student_id_fkey (
        email
      )
    `)
    .is("teacher_score", null)
    .not("user_answer", "is", null);

  if (error) {
    console.error(error);
    return;
  }

  console.log("DATA:", data);

  const grouped = groupByStudent(data || []);
  grouped.sort((a, b) => new Date(a.oldest) - new Date(b.oldest));
  renderStudentList(grouped);
}

/* ========================
   INIT
======================== */

await loadStudentOverview();


