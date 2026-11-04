#!/usr/bin/env node
// K5 (D-282 / LP-15, D-285): static content validation — which questions can be trusted as evidence
// of what a pupil knows. READ-ONLY by construction: it reads a JSON export of questions and prints a
// report. It has no database client, no network and writes no file unless --out is given.
//
// Usage:
//   node tools/questions/validate-evidence.mjs <questions.json> [--grading legacy|new] [--all] [--out <file>] [--strict]
//
// <questions.json>: an array of { id, is_active, answer_format, answer_type, content, metadata } — e.g. the
// result of a read-only `SELECT id, is_active, answer_format, answer_type, content, metadata FROM questions`.
// --grading: the rule evidence validity is judged against. `legacy` (default) is production today
//   (process_question_attempt: lower(), then drop everything outside [a-z0-9]); `new` is the proposed K3 rule.
// --all: include inactive questions (default: active only).
// --strict: exit 1 when any question is not evidence-valid (for a future CI gate; default exit 0).
//
// The report is deterministic: the same input gives byte-identical output (sorted ids, sorted checks).

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { legacyNormalize, normalizeChoice, normalizeNumber } from "../../supabase/functions/_shared/answer-normalize.ts";

export const VALIDATOR_VERSION = 1;

// Checks that make a question NOT evidence-valid under the given grading rule.
export const BLOCKING = Object.freeze([
  "key_not_an_option",          // the key is not one of the options (exactly)
  "wrong_option_accepted",      // a wrong option normalises to the key → graded correct
  "key_empty_after_normalise",  // the key normalises to "" → anything that also does is "correct"
  "number_key_unparseable",     // a number question whose key is not a number
  "match_pairs_below_4",        // Match par with < 4 pairs carries no mastery evidence in `check` (D-277 §4.2)
]);
// Checks that are reported but do not by themselves block evidence.
export const WARNING = Object.freeze([
  "options_collide",            // two WRONG options normalise to the same string (grading of the key unaffected)
  "option_empty_after_normalise",
  "option_is_key_plus_words",   // an option is the key followed by more words
]);

const norm = (rule) => (rule === "new" ? normalizeChoice : legacyNormalize);

export function checkQuestion(q, rule = "legacy") {
  const out = [];
  const content = q && typeof q.content === "object" && q.content !== null ? q.content : {};
  const format = String(q?.answer_format ?? "");
  const options = Array.isArray(content.options) ? content.options.filter((o) => typeof o === "string") : [];
  const key = typeof content.correct === "string" ? content.correct : null;
  const n = norm(rule);

  if (format.includes("number")) {
    if (normalizeNumber(key) === null) out.push("number_key_unparseable");
  }
  if (format === "match") {
    const pairs = Array.isArray(content.pairs) ? content.pairs.length : 0;
    if (pairs < 4) out.push("match_pairs_below_4");
  }
  if (options.length > 0 && key !== null) {
    if (!options.includes(key)) out.push("key_not_an_option");
    const nk = n(key);
    if (nk === "") out.push("key_empty_after_normalise");
    const wrong = options.filter((o) => o !== key);
    if (nk !== "" && wrong.some((o) => n(o) === nk)) out.push("wrong_option_accepted");
    const nw = wrong.map(n);
    if (nw.some((x, i) => nw.indexOf(x) !== i)) out.push("options_collide");
    if (options.some((o) => n(o) === "")) out.push("option_empty_after_normalise");
    const lk = key.toLowerCase().trim();
    if (wrong.some((o) => o.toLowerCase().trim().startsWith(lk + " "))) out.push("option_is_key_plus_words");
  }
  return [...new Set(out)].sort();
}

export function validate(questions, { rule = "legacy", all = false } = {}) {
  if (!Array.isArray(questions)) throw new Error("input must be a JSON array of questions");
  if (rule !== "legacy" && rule !== "new") throw new Error(`unknown grading rule: ${rule}`);
  const scope = questions.filter((q) => all || q?.is_active === true);
  const findings = [];
  const counts = Object.fromEntries([...BLOCKING, ...WARNING].map((c) => [c, 0]));
  const formats = {};
  for (const q of scope) {
    const f = `${q?.answer_format ?? "null"}/${q?.answer_type ?? "null"}`;
    formats[f] = (formats[f] ?? 0) + 1;
    const checks = checkQuestion(q, rule);
    for (const c of checks) counts[c] += 1;
    if (checks.length > 0) {
      findings.push({ id: String(q?.id ?? ""), evidence_valid: !checks.some((c) => BLOCKING.includes(c)), checks });
    }
  }
  findings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    validator_version: VALIDATOR_VERSION,
    grading_rule: rule,
    scope: all ? "all" : "active",
    questions: scope.length,
    by_format: Object.fromEntries(Object.entries(formats).sort()),
    not_evidence_valid: findings.filter((f) => !f.evidence_valid).length,
    counts,
    findings,
  };
}

export function parseArgs(args) {
  const o = { file: undefined, rule: "legacy", all: false, out: undefined, strict: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--grading") o.rule = args[++i];
    else if (a === "--out") o.out = args[++i];
    else if (a === "--all") o.all = true;
    else if (a === "--strict") o.strict = true;
    else if (a.startsWith("--")) throw new Error(`unknown option: ${a}`);
    else if (o.file === undefined) o.file = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return o;
}

export function main(args) {
  let o;
  try { o = parseArgs(args); } catch (e) { console.error(String(e.message)); return 2; }
  if (!o.file) {
    console.error("usage: validate-evidence.mjs <questions.json> [--grading legacy|new] [--all] [--out <file>] [--strict]");
    return 2;
  }
  const report = validate(JSON.parse(readFileSync(o.file, "utf8")), { rule: o.rule, all: o.all });
  const text = JSON.stringify(report, null, 2) + "\n";
  if (o.out) writeFileSync(o.out, text); else process.stdout.write(text);
  return o.strict && report.not_evidence_valid > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
