// Spil-menu. Auth guard, plus the two tabs: Fag (the quizzes) and Minigames.
// The open tab is kept in the address as ?fane=minigames, so the games can link straight back to it.

import { supabase } from "../supabaseClient.js";
import { loadTheme } from "./themeManager.js";

const TABS = ["fag", "minigames"];

function tabFromUrl() {
  try {
    const fane = new URLSearchParams(window.location.search).get("fane");
    return TABS.includes(fane) ? fane : "fag";
  } catch { return "fag"; }
}

function showTab(name, { focus = false, remember = false } = {}) {
  const active = TABS.includes(name) ? name : "fag";
  for (const tab of TABS) {
    const btn = document.getElementById("spil-tab-" + tab);
    const panel = document.getElementById("spil-panel-" + tab);
    const on = tab === active;
    if (btn) {
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      if (on && focus) btn.focus();
    }
    if (panel) panel.hidden = !on;
  }
  if (remember) {
    try {
      const url = new URL(window.location.href);
      if (active === "fag") url.searchParams.delete("fane");
      else url.searchParams.set("fane", active);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch { /* fail-soft: the tab still switches */ }
  }
}

function bindTabs() {
  for (const tab of TABS) {
    const btn = document.getElementById("spil-tab-" + tab);
    if (!btn) continue;
    btn.addEventListener("click", () => showTab(tab, { remember: true }));
    btn.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const i = TABS.indexOf(tab);
      const next = TABS[(i + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      showTab(next, { focus: true, remember: true });
    });
  }
  showTab(tabFromUrl());
}

const { data: sessionData } = await supabase.auth.getSession();
if (!sessionData.session) {
  window.location.replace("login.html");
} else {
  loadTheme().catch(() => {});
  bindTabs();

  window.addEventListener("pageshow", async (event) => {
    if (event.persisted) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) window.location.replace("login.html");
    }
  });
}
