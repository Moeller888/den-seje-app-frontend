// Centralized theme loader for Den Seje App.
//
// Responsibilities:
//   applyTheme(key)   — immediately sets <html data-theme="key"> + sessionStorage cache
//   loadTheme()       — async: fetches active_theme from server, calls applyTheme()
//   persistTheme(key) — optimistic apply + server persist via set_active_theme RPC;
//                       reverts on server error to keep local/remote in sync
//
// Anti-flicker: each page should include this inline script early in <head>
// (before the CSS link) so the cached theme is applied synchronously:
//
//   <script>
//   (function(){var k='dsj_active_theme',v=['default','ice','inferno','void','forest'];
//   try{var t=sessionStorage.getItem(k);if(t&&v.indexOf(t)!==-1)document.documentElement.dataset.theme=t;}catch{}}());
//   </script>

import { supabase } from "../supabaseClient.js";

export const VALID_THEMES = ["default", "ice", "inferno", "void", "forest"];
const STORAGE_KEY         = "dsj_active_theme";
const FALLBACK            = "default";

// Apply theme immediately: updates <html data-theme> and sessionStorage cache.
export function applyTheme(themeKey) {
  const key = VALID_THEMES.includes(themeKey) ? themeKey : FALLBACK;
  document.documentElement.dataset.theme = key;
  try { sessionStorage.setItem(STORAGE_KEY, key); } catch {}
}

// Fetch the user's active_theme from profiles and apply it.
// Non-fatal: any error is silently swallowed; the cached/default theme stays.
export async function loadTheme() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("active_theme")
      .eq("id", user.id)
      .maybeSingle();
    applyTheme(data?.active_theme ?? FALLBACK);
  } catch {}
}

// Apply themeKey optimistically, persist to server, revert on error.
// Returns { error } — null means success.
export async function persistTheme(themeKey) {
  const key  = VALID_THEMES.includes(themeKey) ? themeKey : FALLBACK;
  const prev = document.documentElement.dataset.theme ?? FALLBACK;
  applyTheme(key);
  const { error } = await supabase.rpc("set_active_theme", { p_theme_key: key });
  if (error) applyTheme(prev);
  return { error: error ?? null };
}
