// ── Long texts for read-aloud: a lossless split into valid TTS requests (D-362 / F-07) ──
// One synthesis request may carry at most TTS_LIMITS.maxChars characters (tts-key.js; the Worker
// enforces the same contract). A longer text — e.g. a source of ~900 characters with word
// explanations — is planned here as a short sequence of ordinary requests ("parts"). Each part is
// a normal canonical request: it is normalised, keyed, cached and synthesised exactly like any
// short text, so the Worker, the cache and the clip identity stay unchanged. A text that fits is
// ONE part, identical to the request it always was (same key, same cached clip).
//
// Split contract (splitTextForTts):
//   - Length is measured the way the contract measures it: normalizeTtsText(piece).length
//     (JavaScript string length = UTF-16 code units, after NFC, blank markers and whitespace
//     collapsing). Every piece satisfies it.
//   - Lossless: pieces.join("") === text.normalize("NFC"). Nothing is dropped, nothing repeated,
//     the order is kept. Whitespace at a cut stays at the end of the earlier piece.
//   - Preferred cuts, in order: a blank line (paragraph), a line break, a sentence end, a clause
//     mark (, ; : – —), any space. Inside the best class the cut nearest an even split is chosen,
//     so a text of ~900 characters becomes two parts of roughly equal length (a shorter first
//     part also starts sooner on a cache miss). Only a text with no space inside the limit is cut
//     inside a word — never inside a surrogate pair, before a combining mark or inside a "__" blank.

import { canonicalTtsRequest, normalizeTtsText, TTS_LIMITS } from "./tts-key.js";

/** Upper bound on parts per text (16 × 800 = 12,800 characters). Longer texts get no player. */
export const TTS_MAX_PARTS = 16;

// Words before a full stop that do NOT end a sentence (Danish and English school texts).
const ABBREVIATIONS = new Set([
  "f.eks", "fx", "bl.a", "dvs", "jf", "ca", "nr", "kr", "pkt", "stk", "mv", "evt", "hhv", "iflg", "ifm", "inkl", "ekskl",
  "e.g", "i.e", "mr", "mrs", "ms", "dr", "vs", "etc",
]);

function normLength(value) {
  return normalizeTtsText(value).length;
}

/** Largest prefix length of `rest` whose normalised length fits `max` (prefix lengths are monotone). */
function fittingPrefix(rest, max) {
  let lo = 1;
  let hi = rest.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (normLength(rest.slice(0, mid)) <= max) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

function isSentenceEnd(window, match) {
  const before = window.slice(Math.max(0, match.index - 24), match.index); // a word before the stop is short
  const word = (/([\p{L}.]+)$/u.exec(before) || [])[1] || "";
  if (ABBREVIATIONS.has(word.toLocaleLowerCase("da-DK"))) return false;
  const next = window.charAt(match.index + match[0].length);
  // A full stop after a number followed by a small letter is a Danish ordinal ("den 5. juni").
  return next === "" || /[\p{Lu}\p{N}"'«»“„(§–—-]/u.test(next);
}

/** Cut positions (end of the separator, whitespace included) inside `window`, per preference class. */
function boundaryClasses(window) {
  const ends = (regex, keep = () => true) => {
    const out = [];
    for (const match of window.matchAll(regex)) if (keep(match)) out.push(match.index + match[0].length);
    return out;
  };
  return [
    ends(/\n[^\S\n]*\n\s*/gu),                                       // paragraph
    ends(/\n\s*/gu),                                                 // line break
    ends(/[.!?…]+["'»”’)\]]*\s+/gu, (m) => isSentenceEnd(window, m)), // sentence end
    ends(/[,;:–—]\s+/gu),                                            // clause
    ends(/\s+/gu),                                                   // word
  ];
}

function safeHardCut(rest, at) {
  let cut = at;
  const bad = (i) => {
    const code = rest.charCodeAt(i);
    return (code >= 0xdc00 && code <= 0xdfff) ||               // low surrogate: keep the pair together
      /\p{M}/u.test(rest.charAt(i)) ||                          // combining mark: keep it with its letter
      (rest.charAt(i - 1) === "_" && rest.charAt(i) === "_");   // a "__" blank must stay one pause
  };
  while (cut > 1 && bad(cut)) cut -= 1;
  return cut;
}

function nextCut(rest, max) {
  const fit = fittingPrefix(rest, max);
  if (fit <= 0) return 0;
  const total = normLength(rest);
  const target = total / Math.ceil(total / max);
  const minimum = Math.max(1, Math.floor(max / 4));
  for (const candidates of boundaryClasses(rest.slice(0, fit))) {
    let best = -1;
    let bestDistance = Infinity;
    for (const cut of candidates) {
      const length = normLength(rest.slice(0, cut));
      if (length < minimum || length > max) continue;
      const distance = Math.abs(length - target);
      if (distance <= bestDistance) { best = cut; bestDistance = distance; }
    }
    if (best > 0) {
      while (best < rest.length && /\s/u.test(rest.charAt(best))) best += 1; // whitespace stays with the earlier piece
      return best;
    }
  }
  return safeHardCut(rest, fit);
}

/**
 * Split one text into pieces whose normalised length fits the TTS limit. Lossless (see header).
 * @param {string} text
 * @param {number} [maxChars]
 * @returns {string[]}  [] for a non-string or a text with nothing to read
 */
export function splitTextForTts(text, maxChars = TTS_LIMITS.maxChars) {
  try {
    if (typeof text !== "string") return [];
    const max = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : TTS_LIMITS.maxChars;
    let rest = text.normalize("NFC");
    if (normLength(rest) === 0) return [];
    const pieces = [];
    while (normLength(rest) > max) {
      const cut = nextCut(rest, max);
      if (cut <= 0 || cut >= rest.length) break; // cannot happen for valid input; the plan re-validates every piece
      pieces.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (normLength(rest) > 0) pieces.push(rest);
    else if (pieces.length > 0) pieces[pieces.length - 1] += rest; // trailing whitespace only
    return pieces;
  } catch (_e) {
    return [];
  }
}

/** Language runs → groups of runs, each group a request that fits. A run that is too long on its own is split. */
function splitRuns(segments) {
  const fits = (runs) => canonicalTtsRequest(undefined, runs).ok === true;
  const groups = [];
  let current = [];
  for (const run of segments) {
    if (!run || typeof run.text !== "string" || normLength(run.text) === 0) continue;
    const candidate = [...current, { text: run.text, lang: run.lang }];
    if (fits(candidate)) { current = candidate; continue; }
    if (current.length > 0) { groups.push(current); current = []; }
    if (fits([run])) { current = [{ text: run.text, lang: run.lang }]; continue; }
    const pieces = splitTextForTts(run.text);
    pieces.forEach((piece, i) => {
      if (i < pieces.length - 1) groups.push([{ text: piece, lang: run.lang }]);
      else current = [{ text: piece, lang: run.lang }];
    });
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Plan the synthesis requests for one read-aloud text: one part when it fits (unchanged from
 * before), otherwise a short sequence of ordinary requests in reading order. Language runs are
 * kept: a part of an English run is still read with the English voice.
 * @param {string} text
 * @param {{text:string, lang:string}[]} [segments]
 * `starts` (plain text only) gives where each part begins in text.normalize("NFC"), so word
 * highlighting of a later part searches from its own place in the shown text.
 * @returns {{ok:true, parts:{v:number, format:string, segments:{lang:string, voice:string, text:string}[]}[],
 *            starts:number[]|null}
 *          | {ok:false, error:string}}
 */
export function planTtsRequests(text, segments) {
  try {
    const whole = canonicalTtsRequest(text, segments);
    if (whole.ok) return { ok: true, parts: [whole.value], starts: [0] };
    if (whole.error !== "text_too_long") return whole;
    const hasRuns = Array.isArray(segments) && segments.length > 0;
    const pieces = hasRuns ? null : splitTextForTts(text);
    const requests = hasRuns
      ? splitRuns(segments).map((runs) => canonicalTtsRequest(undefined, runs))
      : pieces.map((piece) => canonicalTtsRequest(piece));
    if (requests.length === 0 || requests.length > TTS_MAX_PARTS) return { ok: false, error: "text_too_long" };
    const parts = [];
    for (const request of requests) {
      if (!request.ok) return { ok: false, error: request.error };
      parts.push(request.value);
    }
    let starts = null;
    if (pieces) {
      starts = [];
      let at = 0;
      for (const piece of pieces) { starts.push(at); at += piece.length; }
    }
    return { ok: true, parts, starts };
  } catch (_e) {
    return { ok: false, error: "invalid_request" };
  }
}
