// D-344: the teacher's approval, bound to the CONTENT it approved.
//
// The decision file (docs/laerligverse/kildekritik-godkendelse.json) says WHO approved WHICH element ids WHEN.
// It does not say WHAT the element said at that time. This register adds that: one SHA-256 fingerprint per
// element, computed from exactly the data the review page showed the teacher. If an approved element's content
// changes later, its fingerprint no longer matches and `check()` reports that the approval may no longer apply.
//
//   node tools/laerligverse/approval-register.mjs validate <export.json>   validate a teacher export (read-only)
//   node tools/laerligverse/approval-register.mjs register <export.json>   validate, copy the export BYTE FOR BYTE to
//                                                                          the decision file, and write the register
//   node tools/laerligverse/approval-register.mjs --check                  exit 1 if approved content has changed
//
// Nothing here approves anything. `register` refuses an export that is not a complete, signed teacher file.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DECISIONS, STATUSES, elements, fingerprintsOf } from "./review-pack.mjs";
export { shownContent, stableJson } from "./review-pack.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
export const REGISTER = join(ROOT, "docs", "laerligverse", "kildekritik-godkendelse-register.json");
const ALLOWED_TOP = new Set(["_om", "laerer", "dato", "elementer", "indhold"]);
const ALLOWED_ELEMENT = new Set(["status", "kommentar", "aendringer"]);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** id → SHA-256 of the content the teacher saw, for every reviewable element in teaching order. */
export async function fingerprints() {
  return fingerprintsOf(await elements());
}

/**
 * Keys that occur twice in the SAME object (JSON.parse silently keeps the last one, so a hidden earlier
 * decision would vanish). A small scanner over already-valid JSON: it tracks one key set per open object.
 * Returns the duplicated keys, e.g. "maal".
 */
export function duplicateKeys(raw) {
  const dups = [];
  const stack = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "{") { stack.push(new Set()); i++; continue; }
    if (c === "[") { stack.push(null); i++; continue; }
    if (c === "}" || c === "]") { stack.pop(); i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') j += raw[j] === "\\" ? 2 : 1;
      const str = JSON.parse(raw.slice(i, j + 1));
      let k = j + 1;
      while (k < raw.length && /\s/.test(raw[k])) k++;
      const top = stack[stack.length - 1];
      if (raw[k] === ":" && top) {
        if (top.has(str)) dups.push(str);
        top.add(str);
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return dups;
}

/**
 * Validate a teacher export. Returns { problems, data, sha256 }. `requireAllApproved` is for registering an
 * approval: every element must be "godkendt" with no comment and no change request.
 */
export function validateExport(raw, expectedIds, { requireAllApproved = false, currentFingerprints = null } = {}) {
  const problems = [];
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw ?? "");
  const hash = sha256(Buffer.isBuffer(raw) ? raw : Buffer.from(text, "utf8"));
  if (text.includes("�") || /Ã[¦¸¥]/.test(text)) problems.push("the file contains mojibake or a replacement character");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    problems.push(`not valid JSON: ${e.message}`);
    return { problems, data: null, sha256: hash };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    problems.push("the top level is not an object");
    return { problems, data: null, sha256: hash };
  }
  for (const k of Object.keys(data)) if (!ALLOWED_TOP.has(k)) problems.push(`unknown top-level field: ${k}`);
  if (typeof data.laerer !== "string" || data.laerer.trim() === "") problems.push("no teacher name");
  if (typeof data.dato !== "string" || data.dato.trim() === "") problems.push("no date");
  const el = data.elementer;
  if (el === null || typeof el !== "object" || Array.isArray(el)) {
    problems.push("`elementer` is missing or not an object");
    return { problems, data, sha256: hash };
  }
  const have = Object.keys(el);
  for (const id of have) if (!expectedIds.includes(id)) problems.push(`unknown element: ${id}`);
  for (const id of expectedIds) if (!have.includes(id)) problems.push(`missing element: ${id}`);
  for (const key of duplicateKeys(text)) problems.push(`appears more than once in the same object: ${key}`);
  for (const [id, v] of Object.entries(el)) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) { problems.push(`${id}: not an object`); continue; }
    for (const k of Object.keys(v)) if (!ALLOWED_ELEMENT.has(k)) problems.push(`${id}: unknown field ${k}`);
    if (!STATUSES.includes(v.status)) problems.push(`${id}: invalid status ${v.status}`);
    for (const k of ["kommentar", "aendringer"]) if (v[k] !== undefined && typeof v[k] !== "string") problems.push(`${id}: ${k} is not text`);
    if (v.status === "skal_rettes" && !String(v.aendringer ?? "").trim()) problems.push(`${id}: "skal_rettes" without a requested change`);
    if (requireAllApproved) {
      if (v.status !== "godkendt") problems.push(`${id}: status is ${v.status}, not godkendt`);
      if (String(v.kommentar ?? "").trim()) problems.push(`${id}: has a comment — read it before registering`);
      if (String(v.aendringer ?? "").trim()) problems.push(`${id}: has a change request`);
    }
  }
  // A newer review page writes the fingerprints it showed; they must equal the content being registered.
  if (data.indhold !== undefined && currentFingerprints) {
    for (const id of expectedIds) {
      if (data.indhold?.[id] !== currentFingerprints[id]) problems.push(`${id}: the content changed between the review and now`);
    }
  }
  return { problems, data, sha256: hash };
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Build the register entry for a validated, fully approved export. */
export function registerEntry({ data, sha256: hash }, fps, { source, contentCommit }) {
  return {
    _om: "D-344: lærerens godkendelse bundet til det indhold, der blev godkendt. Genereret af tools/laerligverse/approval-register.mjs. Ret ikke i hånden. Godkendelsen er faglig og er IKKE et GO til produktion, elevpilot, LP-13 eller merge.",
    godkendelsesfil: "docs/laerligverse/kildekritik-godkendelse.json",
    original_filnavn: source,
    sha256: hash,
    laerer: data.laerer,
    dato: data.dato,
    indholdsversion: contentCommit,
    antal: Object.keys(data.elementer).length,
    fingeraftryk: fps,
  };
}

/** Approved elements whose content has changed since the approval was registered. */
export async function changedSinceApproval() {
  if (!existsSync(REGISTER)) return { problems: ["the approval register is missing"], changed: [] };
  const reg = JSON.parse(readFileSync(REGISTER, "utf8"));
  const problems = [];
  const decisionsBytes = readFileSync(DECISIONS);
  if (sha256(decisionsBytes) !== reg.sha256) problems.push("the decision file is not the registered export (SHA-256 differs)");
  const now = await fingerprints();
  const changed = [];
  for (const [id, fp] of Object.entries(reg.fingeraftryk ?? {})) {
    if (now[id] === undefined) changed.push({ id, why: "the element no longer exists" });
    else if (now[id] !== fp) changed.push({ id, why: "the content changed after the approval" });
  }
  for (const id of Object.keys(now)) if (!(id in (reg.fingeraftryk ?? {}))) changed.push({ id, why: "a new element that has not been reviewed" });
  for (const c of changed) problems.push(`${c.id}: ${c.why} — the approval of ${reg.dato} may no longer apply; a new teacher review is needed`);
  return { problems, changed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "--check") {
    const { problems } = await changedSinceApproval();
    for (const p of problems) console.error(p);
    if (problems.length === 0) console.log("approved content unchanged");
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if ((cmd === "validate" || cmd === "register") && file) {
    const raw = readFileSync(file);
    const fps = await fingerprints();
    const res = validateExport(raw, Object.keys(fps), { requireAllApproved: cmd === "register", currentFingerprints: fps });
    console.log(`sha256 ${res.sha256}`);
    for (const p of res.problems) console.error(p);
    if (res.problems.length > 0) process.exit(1);
    if (cmd === "register") {
      writeFileSync(DECISIONS, raw);
      const entry = registerEntry(res, fps, { source: file.split(/[\\/]/).pop(), contentCommit: gitHead() });
      writeFileSync(REGISTER, JSON.stringify(entry, null, 2) + "\n");
      console.log(`registered ${entry.antal} elements → ${relative(ROOT, DECISIONS)}, ${relative(ROOT, REGISTER)}`);
    } else console.log("valid");
    process.exit(0);
  }
  console.error("usage: approval-register.mjs validate|register <export.json> | --check");
  process.exit(2);
}
