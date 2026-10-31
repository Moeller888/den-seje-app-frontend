// The D-register: one source of truth for where a decision lives.
//
//   D-001 … D-LEGACY_LAST  rows of the frozen table in docs/project-state.md (append-only, verbatim)
//   D-(LEGACY_LAST+1) …    one file each: docs/decisions/D-NNN.md (append-only: a later change is a new
//                          D-file that names the earlier one under `relates`)
//
// Numbers are reserved before use with an annotated tag `d-number/D-NNN` on origin
// (tools/decisions/reserve.mjs). Every number up to LEGACY_LAST that was reserved before the freeze may
// still be added to the legacy table; nothing above it may.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const LEGACY_LAST = 223;
export const LEGACY_FILE = "docs/project-state.md";
export const DECISIONS_DIR = "docs/decisions";
export const REQUIRED_FIELDS = ["d", "title", "owner", "status", "date", "relates"];
export const REQUIRED_HEADINGS = ["## Beskrivelse", "## Resultater"];

const ROW = /^\|\s*(?:\*\*)?D-(\d{3,})(?:\*\*)?\s*\|/;
const FILE = /^D-(\d{3,})\.md$/;

export const fmt = (n) => `D-${String(n).padStart(3, "0")}`;

// Legacy rows: [{ n, line }] in file order.
export function parseLegacyRows(text) {
  const rows = [];
  for (const line of String(text).split("\n")) {
    const m = ROW.exec(line);
    if (m) rows.push({ n: Number(m[1]), line });
  }
  return rows;
}

// `---` front matter of simple `key: value` lines, then the body. Returns null when absent.
export function parseDecisionFile(text) {
  const src = String(text).replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return null;
  const end = src.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const fields = {};
  for (const line of src.slice(4, end).split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].trim();
  }
  return { fields, body: src.slice(end + 5) };
}

export function relatesList(value) {
  if (!value || value === "none") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// Every problem with one decision file, as strings (empty = valid).
export function validateDecisionFile(name, text) {
  const errors = [];
  const fm = FILE.exec(name);
  if (!fm) return [`${name}: file name must be D-NNN.md`];
  const n = Number(fm[1]);
  if (n <= LEGACY_LAST) errors.push(`${name}: D-numbers up to ${fmt(LEGACY_LAST)} belong to the frozen table in ${LEGACY_FILE}`);
  const doc = parseDecisionFile(text);
  if (!doc) return [...errors, `${name}: missing --- front matter`];
  for (const k of REQUIRED_FIELDS) if (!doc.fields[k]) errors.push(`${name}: missing field "${k}"`);
  if (doc.fields.d && doc.fields.d !== fmt(n)) errors.push(`${name}: field d is ${doc.fields.d}, file is ${fmt(n)}`);
  if (doc.fields.date && !/^\d{4}-\d{2}-\d{2}$/.test(doc.fields.date)) errors.push(`${name}: date must be YYYY-MM-DD`);
  for (const r of relatesList(doc.fields.relates)) {
    if (!/^D-\d{3,}$/.test(r)) errors.push(`${name}: relates entry "${r}" is not a D-number`);
    else if (r === fmt(n)) errors.push(`${name}: relates to itself`);
  }
  for (const h of REQUIRED_HEADINGS) if (!doc.body.split("\n").some((l) => l.trim() === h)) errors.push(`${name}: missing heading "${h}"`);
  if (/�|Ã¦|Ã¸|Ã¥/.test(text)) errors.push(`${name}: mojibake`);
  return errors;
}

export function loadRegister(root) {
  const legacy = parseLegacyRows(readFileSync(join(root, LEGACY_FILE), "utf8"));
  const dir = join(root, DECISIONS_DIR);
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => FILE.test(f)).sort().map((f) => ({ name: f, n: Number(FILE.exec(f)[1]), text: readFileSync(join(dir, f), "utf8") }))
    : [];
  return { legacy, files };
}

// Problems with the register as a whole (empty = valid).
export function validateRegister({ legacy, files }) {
  const errors = [];
  const seen = new Map();
  for (const r of legacy) {
    if (r.n > LEGACY_LAST) errors.push(`${LEGACY_FILE}: ${fmt(r.n)} is above the freeze (${fmt(LEGACY_LAST)}) — new decisions go to ${DECISIONS_DIR}/${fmt(r.n)}.md`);
    if (seen.has(r.n)) errors.push(`${LEGACY_FILE}: ${fmt(r.n)} appears twice`);
    seen.set(r.n, LEGACY_FILE);
  }
  for (const f of files) {
    errors.push(...validateDecisionFile(f.name, f.text));
    if (seen.has(f.n)) errors.push(`${f.name}: ${fmt(f.n)} already exists in ${seen.get(f.n)}`);
    seen.set(f.n, f.name);
  }
  return errors;
}

// The text of one decision, wherever it lives: { source, text } or null.
export function readDecision(root, d) {
  const m = /^D-(\d{3,})$/.exec(String(d));
  if (!m) return null;
  const n = Number(m[1]);
  const { legacy, files } = loadRegister(root);
  const f = files.find((x) => x.n === n);
  if (f) return { source: `${DECISIONS_DIR}/${f.name}`, text: f.text };
  const r = legacy.find((x) => x.n === n);
  return r ? { source: LEGACY_FILE, text: r.line } : null;
}

// Highest D-number known in this tree (legacy rows and files).
export function highestInTree({ legacy, files }) {
  return Math.max(0, ...legacy.map((r) => r.n), ...files.map((f) => f.n));
}
