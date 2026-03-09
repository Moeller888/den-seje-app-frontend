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
    createMessage.textContent = "Adgangskode skal vÃ¦re mindst 6 tegn.";
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
async function fetchReviewQueue() {

  const { data, error } = await supabase
    .from('student_answers')
    .select('id, answer_text, status, question_id, questions(content)')
    .eq('status', 'pending')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  const container = document.getElementById('reviewPanel');

  if (!data || data.length === 0) {
    container.innerHTML = 'Ingen besvarelser til review.';
    return;
  }

  container.innerHTML = '';

  data.forEach(item => {

    const question = item.questions?.content;

    const criteriaList = (question.criteria || [])
      .map(c => `<li>${c}</li>`)
      .join('');

    const block = document.createElement('div');
    block.style.border = '1px solid #ccc';
    block.style.padding = '15px';
    block.style.marginBottom = '15px';

    block.innerHTML = 
      <strong>SPØRGSMÅL</strong><br>
      <br><br>

      <strong>ELEVENS SVAR</strong><br>
      <br><br>

      <strong>FACIT</strong><br>
      <br><br>

      <strong>KRITERIER</strong>
      <ul>
        
      </ul>

      <button onclick="approveAnswer('')">GODKEND</button>
      <button onclick="rejectAnswer('')">AFVIS</button>
    ;

    container.appendChild(block);

  });
}

fetchReviewQueue();


async function approveAnswer(answerId) {

  const { error } = await supabase
    .from('student_answers')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      teacher_id: teacherId
    })
    .eq('id', answerId);

  if (error) {
    console.error(error);
    alert('Fejl ved godkendelse');
    return;
  }

  fetchReviewQueue();
}

async function rejectAnswer(answerId) {

  const { error } = await supabase
    .from('student_answers')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      teacher_id: teacherId
    })
    .eq('id', answerId);

  if (error) {
    console.error(error);
    alert('Fejl ved afvisning');
    return;
  }

  fetchReviewQueue();
}

