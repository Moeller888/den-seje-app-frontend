// D-346 (F9): the teacher's decisions on the TESTS (A, B, T, C) and the rubric, bound to the content they were made on.
//
//   node tools/laerligverse/assessment-register.mjs register <export.json>   validate, copy the export BYTE FOR BYTE to
//                                                                           docs/laerligverse/, and write the register
//   node tools/laerligverse/assessment-register.mjs archive <export.json>    v1.4: validate, copy BYTE FOR BYTE to
//                                                                           docs/laerligverse/, and write a RECEIPT;
//                                                                           never a final registration (see below)
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
//
// RECEIVED vs REGISTERED (v1.4). A teacher file on v1.4 is first ARCHIVED: stored byte for byte with a receipt that
// says whether its decisions agree with the rubric (decisionConflicts). With a conflict, the receipt's status is
// "modtaget_afventer_faglig_afklaring": the file is the teacher's real statement, but it is NOT a final, consistent
// approval, and the v1.2 register (and every item's status) is left exactly as it was.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ITEMS, RECEIVED_FILE, SUPPLEMENTS, contentFingerprints, decisionConflicts, validateReviewExport } from "./assessment-review.mjs";
export { SUPPLEMENTS };

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
export const REGISTER = join(ROOT, "docs", "laerligverse", "proeve-godkendelse-register.json");
export const STORED = join(ROOT, "docs", "laerligverse", "proeve-godkendelse-2026-11-05.json");
export const PENDING = "afventer_fornyet_laerergodkendelse";
export { RECEIVED_FILE };
/** v1.4: the teacher's file on v1.4 (05-11-2026), archived byte for byte. Never overwrites the v1.2 file. */
export const ARCHIVED_V14 = join(ROOT, "docs", "laerligverse", "proeve-godkendelse-2026-11-05-v1.4.json");
export const AWAITING = "modtaget_afventer_faglig_afklaring";
export const READY = "klar_til_registrering";
/** What the teacher confirmed to the developer about a decision in the file (never written into the file). */
export const CONFIRMATIONS = Object.freeze({
  S2: "S2 = 2 bekræftet over for udvikleren 05-11-2026: »Det var meningen.« Ikke en tastefejl; må ikke ændres til 1",
});
/** Earlier decisions the v1.4 file supersedes (the newest, expressly confirmed decision takes precedence). */
export const SUPERSEDES = Object.freeze({ S2: "supplement-2026-11-05 (S2 = 1)" });
/** The one question that settles a conflict, with the consequence of each answer. Shown on the page. */
export const OPEN_QUESTION = Object.freeze({
  S2: {
    tekst: "Du har valgt S2 = 2: afsenderens hensigt nævnt alene (»penge«) giver fuld score. Den rubrik, du godkendte samtidig (v1.4), giver det samme svar 1. Skal S2 = 2 gælde i alle tre prøver, eller kun for svaret »penge« i prætest A?",
    svar: [
      { svar: "I alle prøver (generel regel)", konsekvens: "Rubrikken bliver v1.5: R4 giver 2 for afsenderens hensigt, også i ét ord (»penge«, »penge og korn«, »at advare«, »at begrænse smitten«), 1 kun for en hensigt, der er for vag til at høre til netop denne kilde (»hjælp«, »råd«), og 0 som nu (emne, standardsvar, modtager). Ankersvarene, S2-reglen og S7-eksemplerne rettes. Du skal godkende rubrikken igen og B og C, fordi deres lærertekst i dag siger, at disse svar giver 1. A og T beholder din godkendelse. R4 skelner derefter ikke mellem at kende hensigten og at forklare den. Det er den løsning, der holder A, B og C ens." },
      { svar: "Kun »penge« i prætest A (afgrænset undtagelse)", konsekvens: "Rubrikken får én dokumenteret undtagelse: »penge« i A giver 2, mens tilsvarende svar i B og C (»penge og korn«, »at advare«) fortsat giver 1. Kun rubrikken skal godkendes igen. Men prætesten bliver mildere end posttesten på dette punkt, så fremgangen fra A til B i R4 måles for lavt. Det fraråder jeg." },
    ],
  },
});

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

/** v1.4: the receipt for a teacher file on the current content. Status is NEVER "registreret" here. */
export function receiptEntry(raw, { source, contentCommit }) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  const data = JSON.parse(bytes.toString("utf8"));
  const current = contentFingerprints();
  const konflikter = decisionConflicts(data.tvetydigheder);
  const decided = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, { valg: v.valg, kilde: "fil" }]));
  return {
    _om: "D-346 §16: lærerens fil om v1.4, modtaget og verificeret. Genereret af tools/laerligverse/assessment-register.mjs archive. Ret ikke i hånden. Status »modtaget_afventer_faglig_afklaring« betyder: filen er lærerens ægte udsagn, men den er IKKE registreret som endelig, fagligt konsistent godkendelse. Intet er et GO til elevpilot, produktion, LP-13 eller merge.",
    status: konflikter.length ? AWAITING : READY,
    fil: relative(ROOT, ARCHIVED_V14).split("\\").join("/"),
    original_filnavn: source,
    sha256: sha256(bytes),
    format: data.format,
    version: data.version,
    rubrikversion: data.rubrikversion,
    laerer: data.laerer,
    dato: data.dato,
    bemaerkninger: remarksOn(data),
    indholdsversion: contentCommit,
    fingeraftryk_stemmer: Object.fromEntries(ITEMS.map((id) => [id, data.indhold?.[id] === current[id]])),
    afgoerelser: Object.fromEntries(ITEMS.map((id) => [id, { status: data.proever[id].status, fingeraftryk: data.indhold[id] }])),
    tvetydigheder: decided(data.tvetydigheder),
    rubrikbeslutninger: decided(data.rubrikbeslutninger),
    lp13: decided(data.lp13),
    bekraeftelser: Object.fromEntries(Object.entries(CONFIRMATIONS).filter(([id]) => data.tvetydigheder?.[id])),
    erstatter: Object.fromEntries(Object.entries(SUPERSEDES).filter(([id]) => data.tvetydigheder?.[id])),
    konflikter,
    spoergsmaal: konflikter.length ? OPEN_QUESTION[konflikter[0].id] ?? null : null,
  };
}

export function readReceipt() {
  if (!existsSync(RECEIVED_FILE)) return null;
  return JSON.parse(readFileSync(RECEIVED_FILE, "utf8"));
}

/** Integrity of the v1.4 archive: the bytes, the receipt, and that a conflict can never read as a final approval. */
export function receiptProblems() {
  const rec = readReceipt();
  if (!rec) return [];
  const problems = [];
  if (!existsSync(ARCHIVED_V14)) return ["the archived v1.4 file is missing"];
  const bytes = readFileSync(ARCHIVED_V14);
  if (sha256(bytes) !== rec.sha256) problems.push("the archived v1.4 file is not the received export (SHA-256 differs)");
  const data = JSON.parse(bytes.toString("utf8"));
  for (const id of ITEMS) {
    if (data.indhold?.[id] !== rec.afgoerelser?.[id]?.fingeraftryk) problems.push(`${id}: the receipt's fingerprint is not the file's`);
    if (data.proever?.[id]?.status !== rec.afgoerelser?.[id]?.status) problems.push(`${id}: the receipt's status is not the file's`);
  }
  for (const [id, v] of Object.entries(data.tvetydigheder ?? {})) if (rec.tvetydigheder?.[id]?.valg !== v.valg) problems.push(`${id}: the receipt's decision is not the file's`);
  for (const k of ["laerer", "dato", "version", "rubrikversion"]) if (data[k] !== rec[k]) problems.push(`${k} in the receipt differs from the file`);
  const now = decisionConflicts(data.tvetydigheder).map((c) => c.id).join(",");
  if (now !== (rec.konflikter ?? []).map((c) => c.id).join(",")) problems.push(`the receipt's conflicts (${(rec.konflikter ?? []).map((c) => c.id)}) are not the current ones (${now})`);
  if (now && rec.status !== AWAITING) problems.push(`the receipt says ${rec.status}, but the decisions conflict with the rubric (${now})`);
  if (rec.status === "registreret") problems.push("a receipt is never a final registration");
  // The v1.2 file and its register are history and must be untouched by the archive.
  if (ARCHIVED_V14 === STORED) problems.push("the v1.4 archive would overwrite the v1.2 file");
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "--check") {
    const problems = [...integrityProblems(), ...receiptProblems()];
    for (const p of problems) console.error(p);
    if (problems.length === 0) for (const [id, s] of Object.entries(approvalStatus())) console.log(`${id}: ${s.status}${s.uaendret ? "" : ` (registreret ${s.registreret} på ${s.registreretFingeraftryk.slice(0, 8)}…, nu ${s.nuvaerendeFingeraftryk.slice(0, 8)}…)`}`);
    const rec = readReceipt();
    if (problems.length === 0 && rec) console.log(`v1.4-fil ${rec.sha256.slice(0, 8)}…: ${rec.status}${rec.konflikter.length ? ` (${rec.konflikter.map((c) => c.id).join(", ")})` : ""}`);
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
  if (cmd === "archive" && file) {
    const raw = readFileSync(file);
    const res = validateReviewExport(raw);
    const problems = [...res.problems, ...res.stale.map((id) => `${id}: the content changed between the review and now — cannot archive as a decision on it`)];
    console.log(`sha256 ${sha256(raw)}`);
    for (const p of problems) console.error(p);
    if (problems.length > 0) process.exit(1);
    if (existsSync(ARCHIVED_V14) && sha256(readFileSync(ARCHIVED_V14)) !== sha256(raw)) { console.error("a different v1.4 file is already archived; refusing to overwrite it"); process.exit(1); }
    writeFileSync(ARCHIVED_V14, raw);
    const rec = receiptEntry(raw, { source: basename(file), contentCommit: gitHead() });
    writeFileSync(RECEIVED_FILE, JSON.stringify(rec, null, 2) + "\n");
    console.log(`archived → ${relative(ROOT, ARCHIVED_V14)}, ${relative(ROOT, RECEIVED_FILE)}: ${rec.status}`);
    for (const c of rec.konflikter) console.log(`conflict: ${c.text}`);
    process.exit(0);
  }
  console.error("usage: assessment-register.mjs register <export.json> | archive <export.json> | --check");
  process.exit(2);
}
