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

  await fetchStudents();
});

/* ========================
   FETCH STUDENTS
======================== */

async function fetchStudents() {

  const { data, error } = await supabase
    .from("teacher_student_overview")
    .select("*")
    .eq("teacher_id", teacherId);

  if (error) {
    studentListContainer.textContent = "Fejl ved hentning.";
    return;
  }

  if (!data || data.length === 0) {
    studentListContainer.textContent = "Ingen elever endnu.";
    return;
  }

  renderStudents(data);
}

/* ========================
   RENDER
======================== */

function renderStudents(students) {

  studentListContainer.innerHTML = "";

  const table = document.createElement("table");

  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `
    <th>Email</th>
    <th>XP</th>
    <th>Level</th>
    <th>Mastery</th>
    <th>Total korrekte</th>
  `;
  table.appendChild(headerRow);

  students.forEach(student => {

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <a href="/student-detail.html?id=${student.student_id}">
          ${student.email}
        </a>
      </td>
      <td>${student.xp}</td>
      <td>${student.level}</td>
      <td>${student.mastery_level}</td>
      <td>${student.total_correct_answers}</td>
    `;

    table.appendChild(row);
  });

  studentListContainer.appendChild(table);
}

/* ========================
   INIT
======================== */

await fetchStudents();

/* ========================
   OPTIONAL DEBUG TEST
======================== */

const test = async () => {
  const { data, error } = await supabase.functions.invoke("get-next-question");
  console.log("TEST RESULT:", data, error);
};

test();

/* ========================
   FETCH REVIEW QUEUE
======================== */

async function fetchReviewQueue() {

  const { data, error } = await supabase
    .from("question_instances")
    .select(`
      id,
      user_answer,
      teacher_score,
      teacher_feedback,
      question_id,
      questions(content)
    `)
    .is("teacher_score", null)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("REVIEW DATA:", data);

  if (error) {
    console.error(error);
    return;
  }

  const container = document.getElementById("reviewPanel");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = '<p style="color:green;">Ingen ventende besvarelser</p>';
    return;
  }

  data.forEach(item => {

    const content = item.questions?.content ?? {};
    const questionText = content.question ?? "(intet sporgsmal)";
    const answerText = item.user_answer ?? "(intet svar)";
    const facit = content.answer ?? "";
    const criteriaList = (content.criteria || []).map(c => `<li>${c}</li>`).join("");

    const block = document.createElement("div");
    block.style.border = "1px solid #ccc";
    block.style.padding = "15px";
    block.style.marginBottom = "15px";

    const approveBtn = document.createElement("button");
    approveBtn.textContent = "GODKEND";
    approveBtn.onclick = () => approveAnswer(item.id);

    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "AFVIS";
    rejectBtn.onclick = () => rejectAnswer(item.id);

    block.innerHTML = `
      <strong>SPORGSMAL</strong><br>
      ${questionText}<br><br>

      <strong>ELEVENS SVAR</strong><br>
      ${answerText}<br><br>

      <strong>FACIT</strong><br>
      ${facit}<br><br>

      <strong>KRITERIER</strong>
      <ul>${criteriaList}</ul>
    `;

    block.appendChild(approveBtn);
    block.appendChild(rejectBtn);

    container.appendChild(block);
  });
}

fetchReviewQueue();

/* ========================
   APPROVE ANSWER
======================== */

async function approveAnswer(instanceId, score = 4) {

  const { error } = await supabase.functions.invoke("review-answer", {
    body: {
      instance_id: instanceId,
      score: score,
      feedback: "Godt svar"
    }
  });

  if (error) {
    console.error(error);
    alert("Fejl ved godkendelse");
    return;
  }

  await fetchReviewQueue();
}

/* ========================
   REJECT ANSWER
======================== */

async function rejectAnswer(instanceId) {

  const { error } = await supabase.functions.invoke("review-answer", {
    body: {
      instance_id: instanceId,
      score: 1,
      feedback: "Afvist"
    }
  });

  if (error) {
    console.error(error);
    alert("Fejl ved afvisning");
    return;
  }

  await fetchReviewQueue();
}

/* ========================
   RESET PENDING
======================== */

async function resetPending() {

  const confirmReset = confirm(
    "Er du sikker pa, at du vil afvise ALLE ventende svar?\n\nDette kan ikke fortrydes."
  );
  if (!confirmReset) return;

  const input = prompt("Skriv RESET for at bekraefte");

  if (input !== "RESET") {
    alert("Annulleret - ingen aendringer foretaget.");
    return;
  }

  try {
    const { error } = await supabase.functions.invoke("reset-pending");

    if (error) {
      console.error("RESET ERROR:", error);
      alert("Fejl ved reset. Proev igen.");
      return;
    }

    alert("Alle ventende svar er blevet afvist.");

    await fetchReviewQueue();

  } catch (err) {
    console.error("UNEXPECTED RESET ERROR:", err);
    alert("Uventet fejl.");
  }
}

document.getElementById("reset-btn")?.addEventListener("click", resetPending);
