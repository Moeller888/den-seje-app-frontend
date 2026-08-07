import { supabase } from "./supabase.js";

const loadingSection       = document.getElementById("loading-section");
const invalidSection       = document.getElementById("invalid-section");
const formSection          = document.getElementById("form-section");
const resetForm            = document.getElementById("reset-form");
const newPasswordInput     = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const resetMessage         = document.getElementById("reset-message");
const resetSubmitBtn       = document.getElementById("resetSubmitBtn");

function showInvalid() {
  loadingSection.style.display = "none";
  invalidSection.style.display = "block";
  formSection.style.display    = "none";
}

function showForm() {
  loadingSection.style.display = "none";
  invalidSection.style.display = "none";
  formSection.style.display    = "block";
}

// Forced mode: teacher reset a student's password. The student is already
// signed in with the temporary password — no magic link token needed.
const params = new URLSearchParams(window.location.search);
const forced = params.get("forced") === "1";

const hash  = new URLSearchParams(window.location.hash.slice(1));
const type  = hash.get("type");
const token = hash.get("access_token");

if (forced) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showForm();
  } else {
    showInvalid();
  }
} else if (type !== "recovery" || !token) {
  // No recovery token in URL — invalid or direct navigation.
  showInvalid();
} else {
  // The shared client is created with `detectSessionInUrl: false` (js/supabase.js), so it never
  // parses the recovery fragment and PASSWORD_RECOVERY can therefore never fire. Waiting for that
  // event left the page stuck on the loading section forever, with no console error — verified
  // live on the production Worker. Establish the session explicitly from the hash instead.
  const refreshToken = hash.get("refresh_token");

  if (!refreshToken) {
    // setSession requires BOTH tokens; a recovery link missing one cannot be honoured.
    console.error("[reset-password] recovery hash has no refresh_token");
    showInvalid();
  } else {
    const { data, error } = await supabase.auth.setSession({
      access_token:  token,
      refresh_token: refreshToken,
    });

    if (error || !data || !data.session) {
      console.error("[reset-password] setSession failed:", error ? error.message : "no session returned");
      showInvalid();
    } else {
      showForm();
      // Preserved from the previous implementation: if the session goes away while the user is
      // still on this page, fall back to the invalid state.
      supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          showInvalid();
        }
      });
    }
  }
}

resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newPassword     = newPasswordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  resetMessage.textContent = "";

  if (!newPassword || !confirmPassword) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Udfyld begge felter.";
    return;
  }

  if (newPassword !== confirmPassword) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Adgangskoderne stemmer ikke overens.";
    return;
  }

  if (newPassword.length < 6) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Adgangskoden skal være mindst 6 tegn.";
    return;
  }

  resetSubmitBtn.disabled = true;

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  resetSubmitBtn.disabled = false;

  if (error) {
    resetMessage.style.color = "red";
    resetMessage.textContent = "Fejl: " + error.message;
    return;
  }

  if (forced) {
    // Clear the forced-reset flag now that the student chose a new password.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles")
        .update({ must_reset_password: false })
        .eq("id", session.user.id);
    }
    await supabase.auth.signOut();
  }

  resetMessage.style.color = "green";
  resetMessage.textContent  = "Adgangskode opdateret! Du omstilles til login…";

  setTimeout(() => {
    window.location.href = "login.html";
  }, 2000);
});
