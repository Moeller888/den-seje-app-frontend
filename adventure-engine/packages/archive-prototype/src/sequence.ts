/**
 * Arkivskabet v2 — the learning sequence as data (D-322). DOM-free: the headless tests read it.
 *
 * KONSTRUERET UNDERVISNINGSMATERIALE: written for this prototype; a history teacher must review it before
 * any pupil sees it (D-322 §Lærergennemgang). Nothing here is an answer key of a SERVER-graded task:
 * those live only on the host (host-items.ts). The archive-card exercise below is local PRACTICE with
 * explanations; it never counts as evidence and never reaches the server.
 */
import { CONTEXT_KEY, DRAWER_KEY, DRAWER_RESULT_ACTION, RESULT_ACTION, REVISIT_RESULT_ACTION } from "./content.ts";

/** What an activity is, and what it may ever count for. Shown to the pupil as a badge. */
export type ActivityClass = "introduktion" | "udforskning" | "oevelse" | "vurdering" | "refleksion" | "genbesoeg" | "spilverden";

export interface Activity {
  readonly id: string;
  readonly cls: ActivityClass;
  /** Badge text the pupil sees. */
  readonly label: string;
  /** Who decides whether it went well. */
  readonly judgedBy: "ingen" | "lokal forklaring" | "server";
  /** Can it EVER become documented evidence of learning? Only server-judged, unassisted check/review — and only once H4/H5 exist. */
  readonly mayBecomeEvidence: boolean;
}

export const ACTIVITIES: Readonly<Record<string, Activity>> = Object.freeze({
  intro: { id: "intro", cls: "introduktion", label: "Introduktion", judgedBy: "ingen", mayBecomeEvidence: false },
  introCheck: { id: "introCheck", cls: "oevelse", label: "Tjek din forståelse · ingen dom", judgedBy: "ingen", mayBecomeEvidence: false },
  archiveCard: { id: "archiveCard", cls: "oevelse", label: "Øvelse · tæller ikke", judgedBy: "lokal forklaring", mayBecomeEvidence: false },
  flip: { id: "flip", cls: "udforskning", label: "Udforskning", judgedBy: "ingen", mayBecomeEvidence: false },
  hypothesis: { id: "hypothesis", cls: "oevelse", label: "Din vurdering · øvelse med hjælp", judgedBy: "server", mayBecomeEvidence: false },
  revision: { id: "revision", cls: "oevelse", label: "Revision · ny opgave, samme mål", judgedBy: "server", mayBecomeEvidence: false },
  transfer: { id: "transfer", cls: "vurdering", label: "Ny anvendelse · uden hjælp", judgedBy: "server", mayBecomeEvidence: true },
  reflection: { id: "reflection", cls: "refleksion", label: "Refleksion · sendes ikke", judgedBy: "ingen", mayBecomeEvidence: false },
  revisit: { id: "revisit", cls: "genbesoeg", label: "Genbesøg · lokal prototype", judgedBy: "server", mayBecomeEvidence: true },
  worldReaction: { id: "worldReaction", cls: "spilverden", label: "Spilverden", judgedBy: "ingen", mayBecomeEvidence: false },
});

export const REVISION_KEY = "arkivskab-revision";
export const REVISIT_KEY = "genbesoeg";
export { REVISIT_RESULT_ACTION };

/**
 * The world's decision points: what the game asks the host for. ONE objective for the whole sequence
 * (D-330): a revisit or a transfer can only be evidence about the objective it revisits. The id is the
 * PROTOTYPE's; the real ones follow LP-2/LP-13. The host maps it to an existing server objective (D-329).
 */
export const OBJECTIVE_ID = "hist.besaettelsen.h4";
export interface DecisionPoint {
  readonly objectiveId: string;
  readonly purpose: "practice" | "check" | "review";
  readonly resultAction: string;
  readonly activity: Activity;
}
export const DECISION_POINTS: Readonly<Record<string, DecisionPoint>> = Object.freeze({
  [CONTEXT_KEY]: { objectiveId: OBJECTIVE_ID, purpose: "practice", resultAction: RESULT_ACTION, activity: ACTIVITIES.hypothesis as Activity },
  [REVISION_KEY]: { objectiveId: OBJECTIVE_ID, purpose: "practice", resultAction: RESULT_ACTION, activity: ACTIVITIES.revision as Activity },
  [DRAWER_KEY]: { objectiveId: OBJECTIVE_ID, purpose: "check", resultAction: DRAWER_RESULT_ACTION, activity: ACTIVITIES.transfer as Activity },
  [REVISIT_KEY]: { objectiveId: OBJECTIVE_ID, purpose: "review", resultAction: REVISIT_RESULT_ACTION, activity: ACTIVITIES.revisit as Activity },
});

/** The four questions a source is asked, and the fifth thing a historian looks at. */
export const SOURCE_FIELDS = Object.freeze([
  { key: "afsender", label: "Afsender (hvem)" },
  { key: "tid", label: "Tid (hvornår)" },
  { key: "modtager", label: "Modtager (til hvem)" },
  { key: "formaal", label: "Formål (hvorfor)" },
] as const);
export type SourceField = (typeof SOURCE_FIELDS)[number]["key"];

/**
 * "Udfyld arkivkortet" — local PRACTICE (never evidence): sort four facts about ONE source into the four
 * questions. The source is the memoir, not the answer to any server task. Each wrong placement gets its
 * own explanation; the pupil may correct and check again.
 */
export const ARCHIVE_CARD_EXERCISE = Object.freeze({
  source: "Erindring om besættelsen",
  intro: "Arkivaren beder dig udfylde arkivkortet for en erindring, før den lægges på hylden. Hvilket spørgsmål svarer hver oplysning på?",
  facts: [
    { id: "f1", text: "En kvinde, der var 12 år i 1940", field: "afsender", why: "Det fortæller, hvem der har lavet kilden." },
    { id: "f2", text: "Skrevet i 1985", field: "tid", why: "Det fortæller, hvornår kilden blev lavet — 45 år efter begivenheden." },
    { id: "f3", text: "Afleveret til et lokalhistorisk arkiv", field: "modtager", why: "Det fortæller, hvem kilden var til." },
    { id: "f4", text: "At bevare hendes minder for eftertiden", field: "formaal", why: "Det fortæller, hvorfor kilden blev lavet." },
  ] as ReadonlyArray<{ id: string; text: string; field: SourceField; why: string }>,
});

/** Pure check of the archive card: which facts sit in the wrong field, with the explanation to show. */
export function checkArchiveCard(placed: Readonly<Record<string, SourceField | "">>): { allRight: boolean; wrong: Array<{ id: string; why: string }> } {
  const wrong = ARCHIVE_CARD_EXERCISE.facts.filter((f) => placed[f.id] !== f.field).map((f) => ({ id: f.id, why: f.why }));
  return { allRight: wrong.length === 0, wrong };
}

/** Step 7 — reflection. Free text, shown only to the pupil, never sent or graded (teacher-graded long text is H4). */
export const REFLECTION = Object.freeze({
  question: "Hvorfor fortæller en historisk kilde ikke nødvendigvis hele sandheden? Skriv et par sætninger.",
  minChars: 20,
  model:
    "En kilde er lavet af nogen, på et bestemt tidspunkt, til nogen og med et formål. Afsenderen vidste måske ikke alt, havde måske grunde til at fremstille noget på en bestemt måde, eller skrev længe efter. Derfor bruger historikere flere kilder og spørger altid: hvem, hvornår, til hvem og hvorfor?",
  selfCheck: ["Nævnte du, hvem der lavede kilden?", "Nævnte du, hvornår den blev lavet?", "Nævnte du formålet med kilden?"],
});

/** Step 8 — revisit. LOCAL PROTOTYPE: the delay is shown and can be skipped; no mastery is recorded anywhere. */
export const REVISIT = Object.freeze({ dueHours: 20, label: "Genbesøg om 20 timer (lokal prototype — ingen mastery registreres)" });

/** "Afsender: …|Tid: …|…" → ordered fields, or null when the detail is plain text. Presentation only. */
export function parseSourceBack(detail: string): Array<{ field: string; value: string }> | null {
  const parts = detail.split("|").map((p) => p.trim());
  const fields = parts.map((p) => /^([A-ZÆØÅa-zæøå ]{2,20}):\s+(.+)$/.exec(p));
  if (fields.length < 2 || fields.some((m) => m === null)) return null;
  return fields.map((m) => ({ field: (m as RegExpExecArray)[1] as string, value: (m as RegExpExecArray)[2] as string }));
}
