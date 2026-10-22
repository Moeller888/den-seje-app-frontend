// Length cue in multiple-choice questions: the correct option must not give itself away by being
// clearly longer than every wrong option.
//
// Measured on prod 2026-10-22 (2,099 active mc questions): the correct option was the unique
// longest in 62.1 % of them, against 25 % by chance, and 918 trip the rule below. A pupil who
// always picks the longest option scores well without knowing anything.
//
// The rule needs BOTH a ratio and an absolute gap, so short one-word answers ("been" vs "being")
// are never flagged, while a full explanatory sentence against three short claims always is.
//
// Questions are written as JSON inside SQL migrations, in two shapes:
//   {"question": …, "options": [...], "correct": "…"}   and   {"q": …, "o": [...], "a": "…"}
// extractMcQuestions() reads both from raw migration text.

export const MAX_RATIO = 1.25;
export const MIN_GAP_CHARS = 10;

// Returns null when the question is fine, otherwise a description of the length cue.
// Throws on malformed input — a question the check cannot read must not pass silently.
export function findLengthCue(options, correct) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error("length-cue: options must be an array with at least 2 entries");
  }
  if (typeof correct !== "string" || correct.trim().length === 0) {
    throw new Error("length-cue: correct must be a non-empty string");
  }
  if (!options.every((o) => typeof o === "string")) {
    throw new Error("length-cue: every option must be a string");
  }
  const c = correct.trim();
  const wrong = options.map((o) => o.trim()).filter((o) => o !== c);
  if (wrong.length === options.length) {
    throw new Error(`length-cue: correct answer "${c}" is not among the options`);
  }
  if (wrong.length === 0) {
    throw new Error("length-cue: no wrong options");
  }
  const correctLen = [...c].length;
  const longestWrong = Math.max(...wrong.map((o) => [...o].length));
  const gap = correctLen - longestWrong;
  if (correctLen > MAX_RATIO * longestWrong && gap >= MIN_GAP_CHARS) {
    return { correctLen, longestWrong, gap, ratio: correctLen / longestWrong };
  }
  return null;
}

// Index just past the JSON value that starts with "{" at `start`, or -1 if it never closes.
function matchBrace(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function asMcQuestion(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const options = Array.isArray(obj.options) ? obj.options : Array.isArray(obj.o) ? obj.o : null;
  const correct = typeof obj.correct === "string" ? obj.correct : typeof obj.a === "string" ? obj.a : null;
  if (!options || correct === null) return null;
  const question = typeof obj.question === "string" ? obj.question : typeof obj.q === "string" ? obj.q : "";
  return { question, options, correct };
}

// Every JSON object in `sql` that carries options + a correct answer, in file order.
export function extractMcQuestions(sql) {
  if (typeof sql !== "string") throw new Error("length-cue: sql must be a string");
  const found = [];
  let i = sql.indexOf("{");
  while (i !== -1) {
    const end = matchBrace(sql, i);
    let next = i + 1;
    if (end !== -1) {
      let parsed;
      try {
        parsed = JSON.parse(sql.slice(i, end));
      } catch {
        parsed = undefined;
      }
      const q = asMcQuestion(parsed);
      if (q) {
        found.push(q);
        next = end;
      }
    }
    i = sql.indexOf("{", next);
  }
  return found;
}
