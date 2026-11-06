// Closing an OFFLINE quiz spec's own browser context without letting a call escape (D-110 tripwire).
//
// The offline quiz specs (tests/offline-specs.mjs) serve the raw checkout, whose supabaseClient.js names
// the PRODUCTION project, and answer every *.supabase.co call from fixtures through ctx.route. Many end
// right after an answer, while the quiz still has calls in flight (the after-answer RPCs — e.g. the
// minigame break check, app.js — and the progress refresh). Closing the context at that moment tears the
// route layer down with those calls pending, and WebKit on Linux then sent one to the real host: the
// isolated suite's tripwire refused it (CI 2026-11-05 16:54 and 2026-11-06 05:22, both within 10 ms of a
// WebKit test ending in `page.context().close()` right after an answer).
//
// So the quiz is stopped FIRST, while every route is still active: navigating to about:blank unloads the
// page, which aborts its fetches and timers. Only then does the context close — with nothing in flight.
// The tripwire is unchanged: anything that still escapes is refused and fails the run.
import type { Page } from "@playwright/test";

export async function closeOfflineQuiz(page: Page): Promise<void> {
  try {
    await page.goto("about:blank");
  } catch {
    // The page is already gone (a crashed or closed page): there is nothing left to stop.
  }
  await page.context().close();
}
