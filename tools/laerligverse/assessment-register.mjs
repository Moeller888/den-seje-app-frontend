// D-346 (F9): the teacher's decisions on the TESTS (A, B, T, C) and the rubric, bound to the content they were made on.
//
//   node tools/laerligverse/assessment-register.mjs register <export.json>   validate, copy the export BYTE FOR BYTE to
//                                                                           docs/laerligverse/, and write the register
//   node tools/laerligverse/assessment-register.mjs --check                  print the status of every approval; exit 1
//                                                                           only if the register or the stored file
//                                                                           has been tampered with
//
// THE RULE. An approval applies to exactly the content whose fingerprint it was saved with. When that content changes
// later, the approval is kept as HISTORY, and the item's status becomes "afventer fornyet lærergodkendelse". Nothing
// here can turn changed content into approved content: only a new file saved by the teacher can.
//
// THE SUPPLEMENT. Decisions the teacher made AFTER saving the file (in writing, to the developer) are recorded in
// SUPPLEMENTS, separately and with their origin. They are never written into, or presented as part of, the file.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ITEMS, SUPPLEMENTS, contentFingerprints, validateReviewExport } from "./assessment-review.mjs";
export { SUPPLEMENTS };

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
export const REGISTER = join(ROOT, "docs", "laerligverse", "proeve-godkendelse-register.json");
export const STORED = join(ROOT, "docs", "laerligverse", "proeve-godkendelse-2026-11-05.json");
export const PENDING = "afventer_fornyet_laerergodkendelse";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** Remarks on the stored file's own values. Kept as written; never corrected silently. */
export function remarksOn(data) {
  const out = [];
  if (typeof data?.laerer === "string" && data.laerer.trim().split(/\s+/).length < 2) out.push(`Lærerfeltet er »${data.laerer}« (forkortet). Bevaret uændret. Ved næste registrering bør det fulde navn skrives.`);
  if (typeof data?.dato === "string" && !/^\d{2}-\d{2}-\d{4}$/.test(data.dato.trim())) out.push(`Datofeltet er »${data.dato}« (ikke DD-MM-ÅÅÅÅ). Bevaret uændret. Ved næste registrering bør datoen skrives som 05-11-2026.`);
  return out;
}

function gitHead() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; }
}

/** Build the register for a validated export whose fingerprints equal the current content. */
export function registerEntry(raw, { source, contentCommit }) {
  const data = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw);
  return {
    _om: "D-346: lærerens afgørelser om prøverne, bundet til det indhold, de blev truffet på. Genereret af tools/laerligverse/assessment-register.mjs. Ret ikke i hånden. Godkendelserne er faglige og er IKKE et GO til elevpilot, produktion, LP-13 eller merge.",
    godkendelsesfil: relative(ROOT, STORED).split("\\").join("/"),
    original_filnavn: source,
    sha256: sha256(Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8")),
    format: data.format,
    version: data.version,
    laerer: data.laerer,
    dato: data.dato,
    bemaerkninger: remarksOn(data),
    indholdsversion: contentCommit,
    afgoerelser: Object.fromEntries(ITEMS.map((id) => [id, { status: data.proever[id].status, fingeraftryk: data.indhold[id] }])),
    tvetydigheder: Object.fromEntries(Object.entries(data.tvetydigheder ?? {}).map(([k, v]) => [k, { valg: v.valg, kilde: "fil" }])),
    rubrikbeslutninger: Object.fromEntries(Object.entries(data.rubrikbeslutninger ?? {}).map(([k, v]) => [k, { valg: v.valg, kilde: "fil" }])),
    lp13: Object.fromEntries(Object.entries(data.lp13 ?? {}).map(([k, v]) => [k, { valg: v.valg, kilde: "fil" }])),
  };
}

export function readRegister() {
  if (!existsSync(REGISTER)) throw new Error("the test approval register is missing");
  return JSON.parse(readFileSync(REGISTER, "utf8"));
}

/** The ambiguity decisions in force: from the file, then from the supplements — each with its origin. */
export function ambiguityDecisions(reg = readRegister()) {
  const out = {};
  for (const [id, v] of Object.entries(reg.tvetydigheder)) if (v.valg !== "ikke_besluttet") out[id] = { valg: v.valg, kilde: "fil", dato: reg.dato };
  for (const s of SUPPLEMENTS) for (const [id, v] of Object.entries(s.beslutninger)) {
    if (out[id]) throw new Error(`${id} is decided both in the file and in ${s.id}`);
    out[id] = { valg: v.valg, kilde: s.id, regel: v.regel };
  }
  return out;
}

/**
 * Per item: the registered decision, and whether it still applies. An approval applies only while the current
 * fingerprint equals the one it was saved with; otherwise the item awaits a renewed teacher approval.
 */
export function approvalStatus({ reg = readRegister(), current = contentFingerprints() } = {}) {
  return Object.fromEntries(ITEMS.map((id) => {
    const a = reg.afgoerelser[id];
    const unchanged = current[id] === a.fingeraftryk;
    const status = a.status === "godkendt" ? (unchanged ? "godkendt" : PENDING) : unchanged ? a.status : "ikke_gennemgaaet";
    return [id, { status, registreret: a.status, registreretFingeraftryk: a.fingeraftryk, nuvaerendeFingeraftryk: current[id], uaendret: unchanged }];
  }));
}

/** Integrity of the register and the stored file. Changed content is NOT a problem here; it is a status. */
export function integrityProblems() {
  const problems = [];
  let reg;
  try { reg = readRegister(); } catch (e) { return [e.message]; }
  if (!existsSync(STORED)) return ["the stored decision file is missing"];
  const bytes = readFileSync(STORED);
  if (sha256(bytes) !== reg.sha256) problems.push("the stored decision file is not the registered export (SHA-256 differs)");
  const data = JSON.parse(bytes.toString("utf8"));
  for (const id of ITEMS) {
    if (data.indhold?.[id] !== reg.afgoerelser?.[id]?.fingeraftryk) problems.push(`${id}: the register's fingerprint is not the file's`);
    if (data.proever?.[id]?.status !== reg.afgoerelser?.[id]?.status) problems.push(`${id}: the register's status is not the file's`);
  }
  for (const k of ["laerer", "dato"]) if (data[k] !== reg[k]) problems.push(`${k} in the register differs from the file`);
  try { ambiguityDecisions(reg); } catch (e) { problems.push(e.message); }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "--check") {
    const problems = integrityProblems();
    for (const p of problems) console.error(p);
    if (problems.length === 0) for (const [id, s] of Object.entries(approvalStatus())) console.log(`${id}: ${s.status}${s.uaendret ? "" : ` (registreret ${s.registreret} på ${s.registreretFingeraftryk.slice(0, 8)}…, nu ${s.nuvaerendeFingeraftryk.slice(0, 8)}…)`}`);
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if (cmd === "register" && file) {
    const raw = readFileSync(file);
    const res = validateReviewExport(raw);
    const problems = [...res.problems, ...res.stale.map((id) => `${id}: the content changed between the review and now — cannot register`)];
    console.log(`sha256 ${sha256(raw)}`);
    for (const p of problems) console.error(p);
    if (problems.length > 0) process.exit(1);
    writeFileSync(STORED, raw);
    writeFileSync(REGISTER, JSON.stringify(registerEntry(raw, { source: basename(file), contentCommit: gitHead() }), null, 2) + "\n");
    console.log(`registered → ${relative(ROOT, STORED)}, ${relative(ROOT, REGISTER)}`);
    process.exit(0);
  }
  console.error("usage: assessment-register.mjs register <export.json> | --check");
  process.exit(2);
}
