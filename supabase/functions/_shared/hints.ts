// Lærligverse L3 (migration 20261108043500): the hints a round's content offers, read the SAME way the
// database function public.request_question_hint reads them. Pure TypeScript with no Deno or network
// imports: get-next-question uses it for the hint COUNT it may state (LAERLIGVERSE_HINTS=on, a sequence
// step), the Node unit suite tests it against the SQL function.
//
// THE RULE (identical in SQL): content.hints is an array; the levels available are its LEADING non-blank
// strings, at most 3 (MAX_HINT_LEVEL — question_attempts.hints_used is 0..3, K1). Anything else (missing,
// not an array, a non-string or blank element) ends the count there. The text of level n is element n-1,
// trimmed.
//
// The hint TEXT is never part of the public DTO (_shared/question-dto.ts PUBLIC_CONTENT_KEYS has no
// "hints"): it leaves the server only through the request-hint function, one level at a time, after the
// request is logged. Only the count is ever served with a question.
//
// Content status (2026-11-08): no question in the repository has content.hints yet, so every count is 0
// and every request is hint_unavailable until content supplies them.

export const MAX_HINT_LEVEL = 3;

// The SQL function trims with btrim(x, E' \t\n\r'): exactly these four characters, nothing else.
const trimHint = (s: string): string => s.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");

function hintsArray(content: unknown): readonly unknown[] {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return [];
  const hints = (content as Record<string, unknown>).hints;
  return Array.isArray(hints) ? hints : [];
}

/** Number of hint levels the content offers: the leading non-blank strings of content.hints, at most 3. */
export function hintsAvailable(content: unknown): number {
  const hints = hintsArray(content);
  let n = 0;
  while (n < MAX_HINT_LEVEL && n < hints.length) {
    const h = hints[n];
    if (typeof h !== "string" || trimHint(h) === "") break;
    n++;
  }
  return n;
}

/** The trimmed text of hint level 1..3, or null when the content does not offer that level. */
export function hintText(content: unknown, level: number): string | null {
  if (!Number.isInteger(level) || level < 1 || level > hintsAvailable(content)) return null;
  return trimHint(hintsArray(content)[level - 1] as string);
}
