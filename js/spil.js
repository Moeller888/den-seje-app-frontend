// Spil-menu: the entrance to the quizzes. Auth guard only.
// D-347: the minigames are no longer listed here. They are offered as a spillepause inside the quiz
// after 10 minutes of active quiz time (D-364) (js/minigame-break.js); an old ?fane=minigames address simply
// shows the subjects.

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
