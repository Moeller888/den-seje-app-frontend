// Deterministic, stratified sample of the 5,000 new English questions for the documented manual
// review (design §10, E5). Prints a Markdown table: for every CEFR level and every source
// (reused = pilot/batch2-batch6/grade6_9, reverse_meaning, authored) the questions at evenly spaced
// positions in level order. Same input → same sample.
//
//   node tools/questions/english-5000-sample.mjs [per-stratum, default 4]

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMcQuestions } from "../question-quality/length-cue.mjs";
import { CEFR_ORDER, cefrForLevel } from "./english-5000-quality.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "supabase", "migrations");
const NEW_FILE = /^20261020(125000_english_grade6_9|1[3-9]000[1-3]_english_level_|2[0-2]000[1-3]_english_level_)/;

export function allNewQuestions() {
  const items = [];
  for (const file of readdirSync(DIR).filter((f) => NEW_FILE.test(f)).sort()) {
    const sql = readFileSync(join(DIR, file), "utf8");
    const array = /jsonb_array_elements\(\$\$(\[.*?\])\$\$/s.exec(sql);
    if (array) {
      for (const e of JSON.parse(array[1])) {
        items.push({ file, source: e.variant ?? "reused", l: e.l, cefr: e.cefr, q: e.q, o: e.o, a: e.a });
      }
      continue;
    }
    // grade6_9: one INSERT per row; the level is the last value of the row.
    const levels = [...sql.matchAll(/'english',\s*\d,\s*\d,\s*(\d+)\s*\);/g)].map((m) => Number(m[1]));
    extractMcQuestions(sql).forEach((question, index) => {
      const l = levels[index];
      items.push({ file, source: "reused", l, cefr: cefrForLevel(l), q: question.question, o: question.options, a: question.correct });
    });
  }
  return items;
}

export function sample(perStratum = 4) {
  const items = allNewQuestions().sort((left, right) => left.l - right.l || left.q.localeCompare(right.q, "da"));
  const picked = [];
  for (const cefr of CEFR_ORDER) {
    for (const source of ["reused", "reverse_meaning", "authored"]) {
      const stratum = items.filter((item) => item.cefr === cefr && item.source === source);
      for (let i = 0; i < Math.min(perStratum, stratum.length); i++) {
        picked.push(stratum[Math.floor(((i + 0.5) * stratum.length) / perStratum)]);
      }
    }
  }
  return picked;
}

export function levelBatch(file) {
  return file.includes("grade6_9") ? "grade6_9" : /_level_(\w+?)_\d\.sql$/.exec(file)[1];
}

// E5 (design §10): every portion × CEFR cell, 10 % of the cell but at least 6 questions (or the
// whole cell when it is smaller), evenly spaced in level order.
export const E5_RATE = 0.1;
export const E5_MIN = 6;
export function e5Sample() {
  const items = allNewQuestions().sort((left, right) => left.l - right.l || left.q.localeCompare(right.q, "da"));
  const cells = new Map();
  for (const item of items) {
    const key = `${levelBatch(item.file)}|${item.cefr}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
  }
  const picked = [];
  for (const [key, stratum] of [...cells].sort(([left], [right]) => left.localeCompare(right))) {
    const n = Math.min(stratum.length, Math.max(E5_MIN, Math.ceil(stratum.length * E5_RATE)));
    for (let i = 0; i < n; i++) {
      const item = stratum[Math.floor(((i + 0.5) * stratum.length) / n)];
      picked.push({ ...item, batch: key.split("|")[0] });
    }
  }
  return picked;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]) && process.argv[2] === "--e5") {
  console.log(JSON.stringify(e5Sample().map(({ batch, cefr, l, source, q, o, a, file }, index) =>
    ({ id: index + 1, batch, cefr, l, source, q, o, a, file })), null, 1));
} else if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const per = Number(process.argv[2] ?? 4);
  const cell = (text) => String(text).replaceAll("|", "\\|");
  console.log("| # | CEFR | Niveau | Kilde | Spørgsmål | Svarmuligheder | Facit |");
  console.log("|---|---|---|---|---|---|---|");
  sample(per).forEach((item, index) => {
    console.log(`| ${index + 1} | ${item.cefr} | ${item.l} | ${item.source} | ${cell(item.q)} | ${cell(item.o.join(" · "))} | ${cell(item.a)} |`);
  });
}
