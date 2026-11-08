// Anti-gætte-pausen (migration 20261105130000_quiz_anti_guess_cooldown.sql, docs/quiz-anti-guess-cooldown.md)
// i process-event: hvordan databasens afvisning bliver et kontrolleret HTTP-svar.
//
// HÅNDHÆVELSEN LIGGER I DATABASEN, IKKE HER
// Triggeren quiz_cooldown_guard på question_instances afviser et bedømt svar under en aktiv pause med
// SQLSTATE LQ429, beskeden 'quiz_cooldown_active' og pausens slut (UTC, ISO 8601) i DETAIL. Fejlen opstår
// inde i svarfunktionens transaktion (process_question_attempt, process_text_answer eller deres _v2),
// så intet er gemt eller betalt, når process-event ser den. Dette modul genkender kun fejlen og former
// svaret; det beslutter intet. En klient, der kalder backend direkte, rammer den samme trigger.
//
// SVARET (stabilt, maskinlæsbart):
//   429 { outcome: "quiz_cooldown", error: "Quiz cooldown", cooldown_until: <ISO|null>, server_now: <ISO> }
// Hverken tærskel, vindue eller antal fejl indgår — eleven må ikke kunne se mekanikken.
//
// Ren TypeScript uden Deno- eller netværksimport, så Node-testene importerer præcis det, funktionen kører
// (samme ordning som ./answer-v2.ts).

export const QUIZ_COOLDOWN_SQLSTATE = "LQ429";
export const QUIZ_COOLDOWN_MESSAGE = "quiz_cooldown_active";

export function isQuizCooldownError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === QUIZ_COOLDOWN_SQLSTATE || message === QUIZ_COOLDOWN_MESSAGE;
}

// The end of the pause from the database's DETAIL (PostgREST passes it on as `details`). Anything that is
// not a valid timestamp becomes null: the browser then asks get_my_quiz_cooldown() for the time.
export function cooldownUntilOf(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "string") return null;
  const ms = Date.parse(details);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function cooldownReply(error: unknown, nowMs: number): { status: number; body: Record<string, unknown> } {
  return {
    status: 429,
    body: {
      outcome: "quiz_cooldown",
      error: "Quiz cooldown",
      cooldown_until: cooldownUntilOf(error),
      server_now: new Date(nowMs).toISOString(),
    },
  };
}
