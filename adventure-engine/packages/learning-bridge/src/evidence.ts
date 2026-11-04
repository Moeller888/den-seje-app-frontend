/**
 * D-330 — the evidence chain as a PURE classification. It never writes anything, never pays anything and
 * never sets mastery. It takes OBSERVATIONS (facts with their source) and says, per learning objective,
 * which working-model states they support, which they do not, and why — keeping observation apart from
 * interpretation.
 *
 * WORKING MODEL, NOT A MASTERY MODEL. The seven states below are the F4 brief's working model. They are
 * mapped onto the existing contracts, not added to them:
 *   - evidence eligibility follows the L1 contract K4 (docs/learning-progression-l1-contracts.md):
 *     mode ∈ {check, review, application}, hints_used = 0, evidence-valid (K5), exposure registered;
 *   - a repeat is H5's `is_repeat` (question_attempts, D-273); a round is `round_no` (D-266);
 *   - "documented progression" has NO approved rule (LP-13/K7 are owner decisions) — it is never true here.
 * Everything that is a threshold (e.g. the ≥ 20 h revisit, LPD §4.3) is marked PROPOSAL.
 *
 * WHAT THE SERVER REGISTERS TODAY. question_attempts (H5, applied only in the isolated stack) has
 * was_correct, is_repeat, attempt_no, submission_id, grading, answered_at — but NO mode and NO hints:
 * those are L1 K1 (PR #536, another track, not merged). So from server data alone: "practised" and a
 * correct answer can be observed; "supported" / "independent" / "applied" / "revisited" are UNKNOWN, and
 * nothing is evidence. The test adapter knows mode and hints, so it can SHOW the rules — labelled as such.
 *
 * Never: correct ⇒ mastered; opened a source ⇒ understood; saw feedback ⇒ learned; wrote a reason ⇒
 * reasoned correctly; finished a room ⇒ mastery. There is no field for any of those.
 */

export type Source = "server" | "testadapter" | "local";

export type WorkingState =
  | "introduced"
  | "practised"
  | "supported"
  | "independent"
  | "applied"
  | "revisited"
  | "documentedProgression";

export type Mode = "practice" | "check" | "review" | "application" | "diagnostic" | "quiz_v1";

export interface ExposureObservation {
  readonly kind: "exposure";
  readonly source: Source;
  readonly objective: string;
  readonly at: string;
}

export interface AttemptObservation {
  readonly kind: "attempt";
  readonly source: Source;
  readonly objective: string;
  readonly at: string;
  readonly instanceId: string;
  readonly roundNo: number;
  readonly submissionId: string | null;
  readonly grading: "auto" | "teacher";
  /** null = pending (teacher) or unknown. */
  readonly wasCorrect: boolean | null;
  readonly isRepeat: boolean;
  /** null = NOT REGISTERED by this source (today's server: K1 is not merged). */
  readonly mode: Mode | null;
  /** null = NOT REGISTERED by this source. */
  readonly hintsUsed: number | null;
  /** Which situation (claim, item) the task was — needed to tell application in a NEW situation. null = unknown. */
  readonly situation: string | null;
  /** K5 evidence validity of the task (static validation). null = not established. */
  readonly evidenceValid: boolean | null;
}

export type Observation = ExposureObservation | AttemptObservation;

export type StateStatus = "observed" | "not_observed" | "unknown";

export interface StateVerdict {
  readonly status: StateStatus;
  /** Why — in words a teacher can check. */
  readonly why: readonly string[];
  /** Which observations it rests on (submission ids or instance ids). */
  readonly basis: readonly string[];
}

export interface EvidenceVerdict {
  readonly ref: string;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

export interface ObjectiveAssessment {
  readonly objective: string;
  /** Where the facts came from. A server-only assessment and a test-adapter one are not the same thing. */
  readonly sources: readonly Source[];
  readonly states: Readonly<Record<WorkingState, StateVerdict>>;
  /** Per attempt: may it count as evidence under K4? */
  readonly evidence: readonly EvidenceVerdict[];
  /** Always false in this version: no approved progression rule exists (LP-13/K7). */
  readonly documentedProgression: false;
}

/** PROPOSAL (LPD §4.3, a heuristic, not a finding): a revisit counts only after this many hours. */
export const REVISIT_MIN_HOURS = 20;
const EVIDENCE_MODES: readonly Mode[] = ["check", "review", "application"];

const refOf = (a: AttemptObservation): string => a.submissionId ?? `${a.instanceId}#${a.roundNo}`;
const hoursBetween = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / 3_600_000;

/** K4 for one attempt. Every missing fact is a reason — "unknown" is never read as "yes". */
export function evidenceEligibility(a: AttemptObservation, exposed: boolean): EvidenceVerdict {
  const reasons: string[] = [];
  if (a.source !== "server") reasons.push(`kilden er ${a.source}, ikke serveren`);
  if (a.grading !== "auto") reasons.push("lærerbedømt opgave: afventer bedømmelse og en beslutning om lange svar (D-266 H4)");
  if (a.wasCorrect === null) reasons.push("ingen dom endnu");
  if (a.mode === null) reasons.push("læringstrin (mode) er ikke registreret på serveren (L1 K1, PR #536)");
  else if (!EVIDENCE_MODES.includes(a.mode)) reasons.push(`læringstrinnet ${a.mode} er øvelse, ikke vurdering (K4)`);
  if (a.hintsUsed === null) reasons.push("brugt hjælp er ikke registreret på serveren (L1 K1, PR #536)");
  else if (a.hintsUsed > 0) reasons.push("løst med hjælp (K4)");
  if (a.evidenceValid !== true) reasons.push("opgavens evidensgyldighed er ikke fastslået (K5)");
  if (!exposed) reasons.push("ingen registreret introduktion til målet (LPD §5.3, ikke bygget)");
  return { ref: refOf(a), eligible: reasons.length === 0, reasons };
}

function verdict(status: StateStatus, why: string[], basis: string[] = []): StateVerdict {
  return { status, why, basis };
}

/** Classify every objective that appears in the observations. Pure; order of input does not matter. */
export function assessObjectives(observations: readonly Observation[]): ObjectiveAssessment[] {
  const byObjective = new Map<string, Observation[]>();
  for (const o of observations) {
    const list = byObjective.get(o.objective) ?? [];
    list.push(o);
    byObjective.set(o.objective, list);
  }
  return [...byObjective.keys()].sort().map((objective) => assess(objective, byObjective.get(objective) ?? []));
}

function assess(objective: string, obs: readonly Observation[]): ObjectiveAssessment {
  const exposures = obs.filter((o): o is ExposureObservation => o.kind === "exposure");
  const attempts = obs.filter((o): o is AttemptObservation => o.kind === "attempt").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const serverExposure = exposures.some((e) => e.source === "server");
  const sources = [...new Set(obs.map((o) => o.source))].sort();

  // introduced — only a REGISTERED exposure counts; a local intro is a fact about this screen, not the record.
  const introduced = serverExposure
    ? verdict("observed", ["introduktion registreret"], exposures.filter((e) => e.source === "server").map((e) => e.at))
    : exposures.length > 0
      ? verdict("unknown", ["introduktionen er kun set lokalt; den registreres ikke (LPD §5.3, ikke bygget)"])
      : verdict("not_observed", ["ingen introduktion observeret"]);

  // practised — any answered attempt. An attempt is an observation of work, not of learning.
  const answered = attempts.filter((a) => a.wasCorrect !== null || a.grading === "teacher");
  const practised = answered.length > 0
    ? verdict("observed", [`${answered.length} besvarede opgave(r)`], answered.map(refOf))
    : verdict("not_observed", ["ingen besvarede opgaver"]);

  // supported — correct WITH registered help.
  const correct = attempts.filter((a) => a.wasCorrect === true);
  const helped = correct.filter((a) => a.hintsUsed !== null && a.hintsUsed > 0);
  const helpUnknown = correct.filter((a) => a.hintsUsed === null);
  const supported = helped.length > 0
    ? verdict("observed", ["rigtigt svar med registreret hjælp"], helped.map(refOf))
    : helpUnknown.length > 0
      ? verdict("unknown", ["rigtige svar findes, men hjælp er ikke registreret (L1 K1, PR #536)"], helpUnknown.map(refOf))
      : verdict("not_observed", ["intet rigtigt svar med hjælp"]);

  // independent — correct, in an assessment mode, with registered zero help. Unknown when mode/hints are missing.
  const independentAttempts = correct.filter((a) => a.mode !== null && EVIDENCE_MODES.includes(a.mode) && a.hintsUsed === 0);
  const independentUnknown = correct.filter((a) => a.mode === null || a.hintsUsed === null);
  const independent = independentAttempts.length > 0
    ? verdict("observed", ["rigtigt svar i et vurderingstrin uden registreret hjælp"], independentAttempts.map(refOf))
    : independentUnknown.length > 0
      ? verdict("unknown", ["et rigtigt svar er IKKE det samme som selvstændig præstation: læringstrin og hjælp er ikke registreret (L1 K1, PR #536)"], independentUnknown.map(refOf))
      : verdict("not_observed", ["ingen selvstændig præstation observeret"]);

  // applied — independent in a situation the pupil had not practised before.
  const practisedSituations = new Set(attempts.filter((a) => a.mode === "practice" && a.situation !== null).map((a) => a.situation as string));
  const appliedAttempts = independentAttempts.filter((a) => a.situation !== null && !practisedSituations.has(a.situation));
  const applied = appliedAttempts.length > 0
    ? verdict("observed", ["selvstændigt rigtigt i en situation, eleven ikke har øvet"], appliedAttempts.map(refOf))
    : independentAttempts.length > 0 && independentAttempts.some((a) => a.situation === null)
      ? verdict("unknown", ["situationen er ikke registreret, så en NY situation kan ikke fastslås"])
      : independent.status === "unknown"
        ? verdict("unknown", ["afhænger af selvstændig præstation, som ikke kan fastslås"])
        : verdict("not_observed", ["ingen selvstændig anvendelse i en ny situation"]);

  // revisited — PROPOSAL: an independent correct answer ≥ REVISIT_MIN_HOURS after the first independent one.
  const firstIndependent = independentAttempts[0];
  const later = firstIndependent === undefined ? [] : independentAttempts.filter((a) => hoursBetween(firstIndependent.at, a.at) >= REVISIT_MIN_HOURS);
  const revisited = later.length > 0
    ? verdict("observed", [`FORSLAG: selvstændigt rigtigt igen efter mindst ${REVISIT_MIN_HOURS} timer (LPD §4.3, heuristik)`], later.map(refOf))
    : independent.status === "unknown"
      ? verdict("unknown", ["afhænger af selvstændig præstation, som ikke kan fastslås"])
      : verdict("not_observed", [`intet selvstændigt rigtigt svar efter mindst ${REVISIT_MIN_HOURS} timer (FORSLAG)`]);

  const documented = verdict("not_observed", ["der findes ingen godkendt progressionsregel (LP-13/K7, ejerens beslutning); intet kaldes dokumenteret progression"]);

  return {
    objective,
    sources,
    states: { introduced, practised, supported, independent, applied, revisited, documentedProgression: documented },
    evidence: attempts.map((a) => evidenceEligibility(a, serverExposure)),
    documentedProgression: false,
  };
}

/** A question_attempts row (H5, D-273) joined with its question's learning_objective → an observation. */
export function observationFromAttemptRow(row: {
  question_instance_id: string;
  submission_id: string;
  attempt_no: number;
  grading: "auto" | "teacher";
  was_correct: boolean | null;
  is_repeat: boolean;
  answered_at: string;
  learning_objective: string;
  round_no?: number;
}): AttemptObservation {
  return {
    kind: "attempt",
    source: "server",
    objective: row.learning_objective,
    at: row.answered_at,
    instanceId: row.question_instance_id,
    roundNo: row.round_no ?? row.attempt_no,
    submissionId: row.submission_id,
    grading: row.grading,
    wasCorrect: row.was_correct,
    isRepeat: row.is_repeat,
    // Not in question_attempts until L1 K1 (PR #536): NOT REGISTERED, never guessed.
    mode: null,
    hintsUsed: null,
    situation: null,
    evidenceValid: null,
  };
}
