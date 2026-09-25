// Spil-menu. Auth guard only — the cards are plain links.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";

const { data: sessionData } = await supabase.auth.getSession();
if (!sessionData.session) {
  window.location.replace("login.html");
} else {
  loadTheme().catch(() => {});

  window.addEventListener("pageshow", async (event) => {
    if (event.persisted) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) window.location.replace("login.html");
    }
  });
}
