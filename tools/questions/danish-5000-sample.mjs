// Deterministic, stratified sample of the 5,000 Danish questions for the E5 review
// (docs/operations/danish-5000-e5.md). Same input, same sample.
//
//   node tools/questions/danish-5000-sample.mjs <out.json> [offset 0-1, default 0]
//
// Every cell portion × concept (10 portions × 6 concepts): 10 % of the cell, at least 6 questions (the
// whole cell if smaller), evenly spaced in level order. Reads the built portions, so the sample shows
// each question with its options in the order pupils will see them.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadItems, portions } from "./build-danish-5000.mjs";
import { CONCEPT_KEYS } from "./danish-5000-quality.mjs";

export function e5Sample(offset = 0) {
  const sample = [];
  portions(loadItems()).forEach((rows, index) => {
    for (const k of CONCEPT_KEYS) {
      const cell = rows.filter((row) => row.k === k);
      const size = Math.min(cell.length, Math.max(6, Math.round(cell.length * 0.1)));
      for (let i = 0; i < size; i++) {
        const row = cell[Math.floor(((i + offset) * cell.length) / size)];
        sample.push({ portion: `danish${index + 1}`, k, level: row.l, grade: row.g, q: row.q, o: row.o, a: row.a, r: row.r });
      }
    }
  });
  return sample;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: danish-5000-sample.mjs <out.json>");
    process.exit(2);
  }
  const sample = e5Sample(Number(process.argv[3] ?? 0));
  writeFileSync(out, JSON.stringify(sample, null, 1) + "\n");
  console.log(`${sample.length} questions`);
}
