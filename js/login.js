import { supabase } from "./supabase.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");

loginBtn.addEventListener("click", async () => {

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
    .select("role")
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
    window.location.href = "hub.html";
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