import { supabase } from "./supabase.js";
import { initAnalytics, track } from "./analytics.js";
import { maybeShowConsentBanner } from "./analytics-consent.js";

// Analytics (157D/157E). No-op unless enabled + consented; banner only when configured. Fail-soft.
initAnalytics();
maybeShowConsentBanner();

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

  // Section 173: password help is decided server-side, because this page cannot know the
  // caller's role before they are signed in — and must not be able to find out.
  //
  //   student             -> the teacher they are linked to is notified
  //   teacher/super_admin -> ordinary Supabase recovery mail, unchanged
  //   unknown address     -> nothing happens
  //
  // request-password-help returns the same body for all three, so this page shows one message
  // and never learns which case it was. Do NOT reintroduce a role-dependent branch here.
  const { data, error } = await supabase.functions.invoke("request-password-help", {
    body: { email },
  });

  resetRequestBtn.disabled = false;

  // A transport failure is the only thing worth surfacing: it says nothing about the account,
  // only that the request did not reach us. Everything else is deliberately indistinguishable.
  if (error && !data) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Kunne ikke sende anmodningen. Prøv igen.";
    return;
  }

  resetMessage.style.color = "green";
  resetMessage.textContent =
    (data && typeof data.message === "string" && data.message.length > 0)
      ? data.message
      : "Hvis kontoen findes, har din lærer fået besked.";
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

  // 157E: analytics — login (role only, no PII). No-op unless active.
  track("login", { role: profile.role });

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
