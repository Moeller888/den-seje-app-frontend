import { supabase } from "./supabase.js";

const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message       = document.getElementById("message");

// ── Forgot password ──────────────────────────────────────────────────────────

const forgotBtn      = document.getElementById("forgotBtn");
const forgotPanel    = document.getElementById("forgot-panel");
const resetEmailInput = document.getElementById("reset-email");
const resetRequestBtn = document.getElementById("resetRequestBtn");
const resetMessage    = document.getElementById("reset-message");

forgotBtn.addEventListener("click", () => {
  forgotPanel.style.display = forgotPanel.style.display === "none" ? "block" : "none";
  resetMessage.textContent = "";
});

resetRequestBtn.addEventListener("click", async () => {
  const email = resetEmailInput.value.trim();
  resetMessage.textContent = "";

  if (!email) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Skriv din email-adresse.";
    return;
  }

  resetRequestBtn.disabled = true;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html",
  });

  resetRequestBtn.disabled = false;

  if (error) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Fejl: " + error.message;
    return;
  }

  resetMessage.style.color = "green";
  resetMessage.textContent =
    "Link sendt! Tjek din email og klik på linket for at oprette en ny adgangskode.";
  resetEmailInput.value = "";
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  message.textContent = "";

  if (!email || !password) {
    message.textContent = "Udfyld begge felter.";
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = error.message;
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session.user.id;

  const { data: profile, error: roleError, status } = await supabase
    .from("profiles")
    .select("role, must_reset_password")
    .eq("id", userId)
    .maybeSingle();

  // 🔒 RLS 406 = ingen profil
  if (status === 406 || !profile) {
    message.textContent = "Rolle ikke fundet.";
    await supabase.auth.signOut();
    return;
  }

  if (roleError) {
    message.textContent = "Login fejl.";
    return;
  }

  if (profile.role === "student") {
    if (profile.must_reset_password) {
      window.location.href = "reset-password.html?forced=1";
      return;
    }
    window.location.href = "index.html";
    return;
  }

  if (profile.role === "teacher") {
    window.location.href = "teacher.html";
    return;
  }

  if (profile.role === "super_admin") {
    window.location.href = "admin.html";
    return;
  }

  message.textContent = "Ukendt rolle.";
});
