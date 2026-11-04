// The interaction kinds (opgaveformer) the question bank can hold, and which of them the current
// client can show. ONE registry for the server: the format mix (get-next-question/format-mix.ts) reads
// its limits from here, and a new kind is added here — not by rewriting the mix.
//
// WHY A REGISTRY
// A question's kind is spread over three stored fields (answer_format, answer_type, content.force_text),
// and the server and the browser each derived it on their own:
//   * get-next-question mapAnswerFormat() maps ANY unknown answer_format to "mc", so a future
//     "match" (Match par) row would be handed to the browser as multiple choice;
//   * process-event treats answer_type "long" as teacher-graded whatever answer_format says;
//   * js/answer-input.js resolveAnswerRenderer() decides what the pupil actually sees.
// classifyQuestion() names the kind only where those three agree, and returns null otherwise. A null
// (or a kind marked servable: false) is never served as a NEW question by the mix engine.
//
// THE KINDS (renderer = js/answer-input.js ANSWER_RENDERERS value the browser uses for it)
//   choice       answer_format "mc…"                     auto-graded   renderer "choice"
//   short_text   answer_format "text", answer_type short  auto-graded   renderer "short_text" (Stav til)
//   long_text    answer_format "text", answer_type long   TEACHER-graded renderer "long_text"
//                maxShare 0: process-event keeps a long answer OPEN (answered = false) until the teacher
//                grades it, and idx_one_open_question allows one open instance per pupil — so a long
//                question chosen by quota would hold the pupil on that one question until the teacher
//                acts. Long answers are served when the pool holds nothing else, never to fill a share.
//   number       answer_format "…number…"                auto-graded   renderer "number"
//   force_text   content.force_text === true (non-long)   auto-graded   renderer "force_text"
//   match_pairs  answer_format "match" (ROADMAP #13)      auto-graded   renderer "match_pairs" — BUILT, NOT
//                servable: contract, key and answer shape in _shared/match-pairs.ts; graded by
//                process_question_attempt like MC (process-event canonicalises the connections first)
//
// ADDING A KIND (Match par has done steps 1 and 2) — the order matters, each step is its own reviewed
// change:
//   1. add the entry below with servable: false (content may then be authored, inactive or not,
//      and is never served);
//   2. ship the renderer (js/answer-input.js) and the grading path (process-event /
//      process_question_attempt) and extend the public DTO (_shared/question-dto.ts) on purpose;
//   3. flip servable to true in the same PR that ships the renderer, with the parity test in
//      tests/unit/interaction-kinds.test.mjs extended to the new renderer.
// The SQL twin public.question_is_servable (migration 20261019150000) must change in the same PR as
// step 3: it decides what the candidate window and the repeat exhaustion check count as servable, and
// tests/unit/question-format-mix-migration-run.test.mjs fails while the two disagree. The candidate
// window itself needs no change: it stratifies by the stored fields, not by kind names.
// Match par, step 3 also: get-next-question's v1 mapAnswerFormat still maps "match" to "mc" (the row is
// then skipped, because it has no options), so Match par reaches pupils only under QUESTION_MIX_ENGINE=v2
// until v1 is retired or taught "match" in the same reviewed change.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the
// Edge Functions run.

export type InteractionKind =
  | "choice"
  | "short_text"
  | "long_text"
  | "number"
  | "force_text"
  | "match_pairs";

export type InteractionKindSpec = {
  // The answer_format value get-next-question sends to the browser for this kind.
  wireFormat: "mc" | "text" | "number" | "match";
  // js/answer-input.js ANSWER_RENDERERS value, or null when no client renderer exists yet.
  renderer: string | null;
  // May the server hand this kind out as a NEW question to the current client?
  servable: boolean;
  // The base kind fills every slot the mix does not give to another kind. Exactly one kind is base.
  base: boolean;
  // Upper share of NEW questions in the mix window (non-base kinds only; 0 for the base kind).
  // 0 for a non-base kind = never chosen BY QUOTA; it is still served when nothing else is left.
  maxShare: number;
  // Teacher-graded work creates teacher load and waits for a verdict; never repeated automatically.
  teacherGraded: boolean;
};

export const INTERACTION_KINDS: Readonly<Record<InteractionKind, Readonly<InteractionKindSpec>>> = Object.freeze({
  choice:      Object.freeze({ wireFormat: "mc",          renderer: "choice",     servable: true,  base: true,  maxShare: 0,    teacherGraded: false }),
  short_text:  Object.freeze({ wireFormat: "text",        renderer: "short_text", servable: true,  base: false, maxShare: 0.15, teacherGraded: false }),
  long_text:   Object.freeze({ wireFormat: "text",        renderer: "long_text",  servable: true,  base: false, maxShare: 0,    teacherGraded: true  }),
  number:      Object.freeze({ wireFormat: "number",      renderer: "number",     servable: true,  base: false, maxShare: 0.15, teacherGraded: false }),
  force_text:  Object.freeze({ wireFormat: "mc",          renderer: "force_text", servable: true,  base: false, maxShare: 0.15, teacherGraded: false }),
  match_pairs: Object.freeze({ wireFormat: "match",       renderer: "match_pairs", servable: false, base: false, maxShare: 0.15, teacherGraded: false }),
});

// Registry order is the deterministic tie-break wherever two kinds score the same.
export const KIND_ORDER: readonly InteractionKind[] = Object.freeze(
  Object.keys(INTERACTION_KINDS) as InteractionKind[],
);

export const BASE_KIND: InteractionKind = (() => {
  const base = KIND_ORDER.filter((k) => INTERACTION_KINDS[k].base);
  if (base.length !== 1) throw new Error("interaction-kinds: exactly one base kind is required");
  return base[0];
})();

export type StoredFormatFields = {
  answer_format?: unknown;
  answer_type?: unknown;
  content?: unknown;
  // Already-extracted content.force_text, for reads that select only that key.
  force_text?: unknown;
};

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// The kind of one stored question, or null when the stored fields do not name a kind every layer
// agrees on. Never throws.
export function classifyQuestion(row: StoredFormatFields | null | undefined): InteractionKind | null {
  if (!row || typeof row !== "object") return null;

  // The server's mapAnswerFormat is case- and space-sensitive, the browser lower-cases: only a
  // canonical (lower-case, trimmed) stored format means the same thing to both.
  if (typeof row.answer_format !== "string" || row.answer_format !== lower(row.answer_format)) return null;
  const format = row.answer_format;
  // process-event compares answer_type === "long" exactly, the browser trims and lower-cases; a
  // non-canonical value ("Long") would be graded short and shown long. Null/empty is short to both.
  if (row.answer_type !== null && row.answer_type !== undefined
    && (typeof row.answer_type !== "string" || row.answer_type !== lower(row.answer_type))) return null;
  const answerType = (row.answer_type as string | null | undefined) || "short";
  const content = row.content && typeof row.content === "object" && !Array.isArray(row.content)
    ? row.content as Record<string, unknown>
    : null;
  const forceText = row.force_text === true || content?.force_text === true;

  if (format === "") return null;

  if (answerType === "long") {
    // Teacher-graded on the server. Only "text" also renders as a long answer in the browser; any
    // other stored format would be shown one way and graded another.
    return format === "text" && !forceText ? "long_text" : null;
  }
  if (answerType !== "short") return null;

  if (format === "match") return forceText ? null : "match_pairs";

  // mapAnswerFormat (server) tests "mc" first, resolveAnswerRenderer (browser) tests "number" first:
  // a format containing both would be graded as one kind and shown as the other.
  if (format.startsWith("mc") && format.includes("number")) return null;

  if (forceText) {
    // The browser's force_text renderer wins over the format; the server grades by format. Only an
    // MC row is graded as free text against its key today.
    return format.startsWith("mc") ? "force_text" : null;
  }

  if (format.startsWith("mc")) return "choice";
  if (format.includes("number")) return "number";
  if (format === "text") return "short_text";
  return null;
}

export function isServableKind(kind: InteractionKind | null): kind is InteractionKind {
  return kind !== null && INTERACTION_KINDS[kind].servable === true;
}

// The answer_format the browser receives for a stored row — or null when the row must not be served.
// Unlike get-next-question's mapAnswerFormat, an unknown format never falls back to "mc".
export function servableWireFormat(row: StoredFormatFields | null | undefined): string | null {
  const kind = classifyQuestion(row);
  return isServableKind(kind) ? INTERACTION_KINDS[kind].wireFormat : null;
}
