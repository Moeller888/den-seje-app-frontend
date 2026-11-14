// Lærligverse F10-B2 — the teacher's separate "Kursusforløb" section on student-detail.html.
//
// LOADED ONLY WHEN THE FLAG IS ON. js/student-detail.js holds ENABLE_COURSE_PROGRESS_VIEW = false and
// imports this module dynamically inside that flag's branch, so with the flag off the page makes no extra
// request and its DOM is unchanged. Turning the flag on needs the owner's product GO, and the read RPC
// (supabase/migrations/20261109120000_laerligverse_course_progress_read.sql) needs its own migration GO.
//
// Contract: docs/laerligverse/kursusvisning-ui-kontrakt.md. The words are never mixed:
//   Gennemført         an answer is registered in a practice step
//   Løst               the first answer was correct
//   Løst selvstændigt  correct first answer in an assessment step with 0 REGISTERED hints and a registered
//                      assessment mode (evidence.ts `independent`, D-330: correct is not learned)
//   Gentaget senere    the delayed revisit step was answered
//   Ikke registreret   the server did not register the fact (legacy path, K1/L5/L3 not active) — never 0
// Counts, never percentages; the denominator is answered assessment steps; first answers only.
//
// Pure functions + one DOM renderer. No network, no storage, no globals, no top-level side effects.

/** Which classifier this mirrors (sha256, first 12 hex, of the TypeScript source; pinned by a unit test). */
export const EVIDENCE_RULES = "evidence.ts@3d4a7c1c269c";
/** The sequence policy nextStepFromHistory() ports (pinned to the TypeScript source by a unit test). */
export const SEQUENCE_POLICY_ID = "laerligverse-test-policy-v0";
export const SEQUENCE_SOURCE = "learning-sequence.ts@ea9ce8880da7";
/** PROPOSAL (LPD §4.3): the revisit is due this long after the transfer was answered (learning-sequence.ts). */
export const REVISIT_AFTER_HOURS = 20;

export const STEP_LABELS = Object.freeze({
  guided_practice: "Vejledt øvelse",
  revision: "Revision",
  independent_application: "Selvstændig kontrol",
  transfer: "Anvendelse (transfer)",
  revisit: "Repetition",
});
const PRACTICE_STEPS = Object.freeze(["guided_practice", "revision"]);
const ASSESSMENT_STEPS = Object.freeze(["independent_application", "transfer", "revisit"]);
const EVIDENCE_MODES = Object.freeze(["check", "review", "application"]);
export const EVIDENCE_VALUES = Object.freeze(["practice", "shown_independently", "not_shown", "unknown"]);

export const TEXT = Object.freeze({
  heading: "Kursusforløb",
  intro: "Kursusopgaver tælles ikke med i elevens almindelige statistik ovenfor. "
    + "”Løst” betyder et rigtigt førstesvar på netop den opgave på det tidspunkt.",
  loading: "Indlæser...",
  fetchError: "Kursusforløbet kunne ikke hentes. Prøv igen senere.",
  unavailable: "Kursusforløbet er ikke tilgængeligt for denne elev.",
  malformed: "Kursusdata har et uventet format og kan ikke vises.",
  empty: "Eleven har ikke påbegyndt et kursusforløb.",
  notRegistered: "Ikke registreret",
});

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const timeOf = (s) => (typeof s === "string" ? Date.parse(s) : NaN);

// ── Evidence (the SQL rule of get_course_progress, both mirroring evidence.ts `independent`) ───────────

/**
 * Classify ONE step from its first-answer facts. Unknown is never read as yes.
 * @param {{step:string|null,status:string,correct:boolean|null,mode:string|null,hintsUsed:number|null}} s
 * @returns {"practice"|"shown_independently"|"not_shown"|"unknown"}
 */
export function classifyStepEvidence(s) {
  const step = s && typeof s.step === "string" ? s.step : "";
  if (PRACTICE_STEPS.includes(step)) return "practice";
  if (!ASSESSMENT_STEPS.includes(step)) return "unknown";
  if (s.status !== "answered") return "not_shown";
  if (s.correct !== true && s.correct !== false) return "unknown";
  if (s.correct === true && EVIDENCE_MODES.includes(s.mode) && s.hintsUsed === 0) return "shown_independently";
  if (s.correct === true && (s.mode === null || s.hintsUsed === null)) return "unknown";
  return "not_shown";
}

// ── Sequence (a port of learning-sequence.ts nextStep, parity-tested against the TypeScript) ──────────

const answeredIn = (h, step) => h.filter((e) => e.step === step && e.answered)
  .sort((a, b) => Date.parse(a.answeredAt ?? "") - Date.parse(b.answeredAt ?? ""));

/**
 * @param {Array<{step:string|null,answered:boolean,wasCorrect:boolean|null,answeredAt:string|null}>} history
 * @param {number} nowMs
 */
export function nextStepFromHistory(history, nowMs) {
  const h = Array.isArray(history) ? history : [];
  const practice = answeredIn(h, "guided_practice");
  if (practice.length === 0) return { state: "step", step: "guided_practice" };
  const latestPractice = practice[practice.length - 1];
  if (latestPractice.wasCorrect === false && answeredIn(h, "revision").length === 0) return { state: "step", step: "revision" };
  if (answeredIn(h, "independent_application").length === 0) return { state: "step", step: "independent_application" };
  const transfer = answeredIn(h, "transfer");
  if (transfer.length === 0) return { state: "step", step: "transfer" };
  if (answeredIn(h, "revisit").length > 0) return { state: "complete" };
  const due = Date.parse(transfer[0].answeredAt ?? "") + REVISIT_AFTER_HOURS * 3_600_000;
  if (!Number.isFinite(due)) return { state: "waiting", step: "revisit", dueAt: "unknown" };
  return nowMs >= due ? { state: "step", step: "revisit" } : { state: "waiting", step: "revisit", dueAt: new Date(due).toISOString() };
}

// ── Normalisation: every field may be missing or wrong ────────────────────────────────────────────────

function normalizeStep(raw) {
  if (!isObj(raw)) return null;
  if (typeof raw.step !== "string" || raw.step.length === 0) return null;
  if (raw.status !== "answered" && raw.status !== "served") return null;
  const seq = isObj(raw.sequence) ? raw.sequence : {};
  const s = {
    step: raw.step,
    status: raw.status,
    correct: typeof raw.correct === "boolean" ? raw.correct : null,
    attemptNo: isInt(raw.attempt_no) && raw.attempt_no >= 1 ? raw.attempt_no : null,
    hintsUsed: isInt(raw.hints_used) && raw.hints_used >= 0 && raw.hints_used <= 3 ? raw.hints_used : null,
    mode: typeof raw.mode === "string" ? raw.mode : null,
    firstAnswerAt: Number.isFinite(timeOf(raw.first_answer_at)) ? raw.first_answer_at : null,
    grading: raw.grading === "auto" || raw.grading === "teacher" ? raw.grading : null,
    source: raw.source === "attempt" || raw.source === "instance" ? raw.source : null,
    sequence: {
      step: raw.step,
      answered: seq.answered === true,
      wasCorrect: typeof seq.was_correct === "boolean" ? seq.was_correct : null,
      answeredAt: typeof seq.answered_at === "string" ? seq.answered_at : null,
    },
  };
  const own = classifyStepEvidence(s);
  // The server's classification is shown only when it is a known value AND the facts support it.
  s.evidence = EVIDENCE_VALUES.includes(raw.evidence) && raw.evidence === own ? raw.evidence : "unknown";
  return s;
}

/**
 * @returns {{ok:true, rules:string|null, objectives:Array, skipped:number} | {ok:false}}
 */
export function normalizeCourseProgress(data) {
  if (!isObj(data) || !Array.isArray(data.objectives)) return { ok: false };
  let skipped = 0;
  const objectives = [];
  for (const o of data.objectives) {
    if (!isObj(o) || typeof o.objective_id !== "string" || o.objective_id.length === 0 || !Array.isArray(o.steps)) {
      skipped++;
      continue;
    }
    const steps = [];
    for (const raw of o.steps) {
      const s = normalizeStep(raw);
      if (s === null) skipped++;
      else steps.push(s);
    }
    objectives.push({
      objectiveId: o.objective_id,
      startedAt: Number.isFinite(timeOf(o.started_at)) ? o.started_at : null,
      steps,
    });
  }
  return { ok: true, rules: typeof data.rules === "string" ? data.rules : null, objectives, skipped };
}

// ── Texts ─────────────────────────────────────────────────────────────────────────────────────────────

let dateFmt = null;
export function formatDate(iso) {
  const t = timeOf(iso);
  if (!Number.isFinite(t)) return "ukendt tidspunkt";
  try {
    if (dateFmt === null) {
      dateFmt = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short", year: "numeric" });
    }
    return dateFmt.format(new Date(t));
  } catch (_e) {
    return new Date(t).toISOString().slice(0, 10);
  }
}

const hintsText = (n) => (n === null ? TEXT.notRegistered : n === 1 ? "1 hint" : `${n} hints`);

function statusText(s) {
  if (s.status !== "answered") return "Ikke besvaret endnu";
  if (!ASSESSMENT_STEPS.includes(s.step)) return "Gennemført";
  if (s.correct === true) return "Løst";
  if (s.correct === false) return s.attemptNo !== null && s.attemptNo >= 2 ? `Løst ved ${s.attemptNo}. forsøg` : "Ikke løst";
  if (s.grading === "teacher") return "Afventer lærerens bedømmelse";
  return "Førstesvar ikke registreret";
}

function evidenceText(s) {
  if (s.evidence === "practice") return "Øvelse (tæller ikke)";
  if (s.status !== "answered") return "—";
  if (s.evidence === "shown_independently") return "Løst selvstændigt";
  if (s.evidence === "not_shown") return "Ikke løst selvstændigt";
  return TEXT.notRegistered;
}

function revisitNote(s, steps) {
  if (s.step !== "revisit" || s.status !== "answered") return null;
  const transferAt = steps.filter((x) => x.step === "transfer" && x.firstAnswerAt !== null)
    .map((x) => timeOf(x.firstAnswerAt)).sort((a, b) => a - b)[0];
  const at = timeOf(s.firstAnswerAt);
  if (!Number.isFinite(transferAt) || !Number.isFinite(at) || at < transferAt) return "Gentaget senere";
  const days = Math.floor((at - transferAt) / 86_400_000);
  return days === 1 ? "Gentaget senere (1 dag efter anvendelsen)" : `Gentaget senere (${days} dage efter anvendelsen)`;
}

function summaryText(steps) {
  const assessed = steps.filter((s) => ASSESSMENT_STEPS.includes(s.step) && s.status === "answered");
  const n = assessed.length;
  if (n === 0) return "Ingen bedømte trin besvaret endnu.";
  const shown = assessed.filter((s) => s.evidence === "shown_independently").length;
  const unknown = assessed.filter((s) => s.evidence === "unknown").length;
  const known = n - unknown;
  const trin = (k) => (k === 1 ? "bedømt trin" : "bedømte trin");
  if (known === 0) return `Løst selvstændigt: ikke registreret (${n} ${trin(n)}).`;
  if (unknown === 0) return `Løst selvstændigt i ${shown} af ${n} ${trin(n)}.`;
  return `Løst selvstændigt i ${shown} af ${known} ${trin(known)} · ikke registreret for ${unknown}.`;
}

/**
 * The whole section as plain data — the thing the unit tests pin.
 * @param {unknown} data   get_course_progress's result (null = refused or unknown pupil)
 * @param {unknown} error  the RPC error, if any
 * @param {number} nowMs
 */
export function buildCourseProgressView(data, error, nowMs) {
  if (error) return { state: "error", message: TEXT.fetchError, objectives: [] };
  if (data === null || data === undefined) return { state: "unavailable", message: TEXT.unavailable, objectives: [] };
  const norm = normalizeCourseProgress(data);
  if (!norm.ok) return { state: "malformed", message: TEXT.malformed, objectives: [] };
  const skippedNote = norm.skipped > 0 ? `${norm.skipped} ${norm.skipped === 1 ? "post" : "poster"} kunne ikke læses og er udeladt.` : null;
  if (norm.objectives.length === 0) {
    return { state: "empty", message: TEXT.empty, objectives: [], skippedNote };
  }
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const objectives = norm.objectives.map((o) => {
    const decision = nextStepFromHistory(o.steps.map((s) => s.sequence), now);
    let completedText = "Ikke gennemført endnu";
    if (decision.state === "complete") {
      const doneAt = o.steps.filter((s) => s.step === "revisit" && s.sequence.answered && s.sequence.answeredAt !== null)
        .map((s) => s.sequence.answeredAt).sort((a, b) => timeOf(a) - timeOf(b))[0];
      completedText = doneAt ? `Gennemført ${formatDate(doneAt)}` : "Gennemført (tidspunkt ikke registreret)";
    }
    const rows = o.steps.map((s) => ({
      step: STEP_LABELS[s.step] ?? `Ukendt trin (${s.step})`,
      note: revisitNote(s, o.steps),
      status: statusText(s),
      help: s.status === "answered" ? hintsText(s.hintsUsed) : "—",
      evidence: evidenceText(s),
      evidenceKey: s.status === "answered" ? s.evidence : "none",
    }));
    let nextText = null;
    if (decision.state === "waiting") {
      rows.push({
        step: STEP_LABELS.revisit, note: null,
        status: decision.dueAt === "unknown" ? "Venter (tidspunkt ikke registreret)" : `Venter til ${formatDate(decision.dueAt)}`,
        help: "—", evidence: "—", evidenceKey: "none",
      });
    } else if (decision.state === "step" && !o.steps.some((s) => s.step === decision.step && s.status === "served")) {
      nextText = `Næste trin: ${STEP_LABELS[decision.step] ?? decision.step}`;
    }
    const registration = o.steps.some((s) => s.source === "attempt")
      ? "Registrering: serverens forsøg (H5)"
      : "Registrering: kun opgaveinstanser (ingen forsøgslog)";
    return {
      title: o.objectiveId,
      startedText: o.startedAt ? `Påbegyndt ${formatDate(o.startedAt)}` : "Påbegyndt (tidspunkt ikke registreret)",
      completedText,
      summary: summaryText(o.steps),
      rows,
      nextText,
      footer: `${registration} · regler: ${norm.rules ?? EVIDENCE_RULES} · sekvens: ${SEQUENCE_POLICY_ID}`,
    };
  });
  return { state: "ok", message: null, objectives, skippedNote };
}

// ── DOM ───────────────────────────────────────────────────────────────────────────────────────────────

function el(doc, tag, className, text) {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

/** Render a view into `container`. Text only (textContent), never markup from data. Never throws on a view. */
export function renderCourseProgress(container, view, doc) {
  if (!container || !doc) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(el(doc, "p", "course-progress-intro", TEXT.intro));
  if (!isObj(view) || view.state !== "ok" || !Array.isArray(view.objectives)) {
    const msg = el(doc, "p", "course-progress-message", isObj(view) && typeof view.message === "string" ? view.message : TEXT.malformed);
    msg.setAttribute("role", "status");
    container.appendChild(msg);
    if (isObj(view) && typeof view.skippedNote === "string") container.appendChild(el(doc, "p", "course-progress-skipped", view.skippedNote));
    return;
  }
  for (const o of view.objectives) {
    const card = el(doc, "article", "course-progress-card");
    card.appendChild(el(doc, "h4", "course-progress-title", o.title));
    card.appendChild(el(doc, "p", "course-progress-meta", `${o.startedText} · ${o.completedText}`));
    card.appendChild(el(doc, "p", "course-progress-summary", o.summary));
    const table = el(doc, "table", "course-progress-table");
    table.appendChild(el(doc, "caption", "course-progress-caption", `Trin i forløbet ${o.title}`));
    const head = el(doc, "thead");
    const hr = el(doc, "tr");
    for (const h of ["Trin", "Status", "Hjælp", "Evidens"]) {
      const th = el(doc, "th", null, h);
      th.setAttribute("scope", "col");
      hr.appendChild(th);
    }
    head.appendChild(hr);
    table.appendChild(head);
    const body = el(doc, "tbody");
    for (const r of o.rows) {
      const tr = el(doc, "tr");
      const stepCell = el(doc, "th", "course-progress-step", r.step);
      stepCell.setAttribute("scope", "row");
      if (r.note) {
        stepCell.appendChild(doc.createElement("br"));
        stepCell.appendChild(el(doc, "span", "course-progress-note", r.note));
      }
      tr.appendChild(stepCell);
      tr.appendChild(el(doc, "td", "course-progress-status", r.status));
      tr.appendChild(el(doc, "td", "course-progress-help", r.help));
      const ev = el(doc, "td", "course-progress-evidence", r.evidence);
      ev.setAttribute("data-evidence", r.evidenceKey);
      tr.appendChild(ev);
      body.appendChild(tr);
    }
    table.appendChild(body);
    card.appendChild(table);
    if (o.nextText) card.appendChild(el(doc, "p", "course-progress-next", o.nextText));
    card.appendChild(el(doc, "p", "course-progress-footer", o.footer));
    container.appendChild(card);
  }
  if (typeof view.skippedNote === "string") container.appendChild(el(doc, "p", "course-progress-skipped", view.skippedNote));
}
