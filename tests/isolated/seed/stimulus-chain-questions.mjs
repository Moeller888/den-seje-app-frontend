// F-07 stimulus fixture for the isolated E2E database (D-362, "vej B" readiness). Test-only: seeded by
// seed.mjs into the throwaway database this run created, behind the same target check as the synthetic
// bank (seed-guard.mjs). Never production.
//
// WHAT. Two ACTIVE multiple-choice questions that carry content.stimulus, copied from the D-362 pilot
// content migration (20261108090100_stimulus_pilot_content.sql) — not re-typed, but read from that file,
// so the fixture is always the pilot content as it will be applied:
//   * the image row  (pilot_phase "introduktion", the timeline assets/stimulus/grundloven-1849-tidslinje.svg)
//   * the source row (pilot_phase "introduktion", "Hvem måtte stemme i 1849?")
// tests/isolated/f07-stimulus-chain.isolated.spec.mjs drives them through the real get-next-question, the
// real quiz in the browser and the real process-event.
//
// SCOPE. learning_objective = 'pilot_d362', target_grade 7 — exactly as the pilot. get-next-question serves
// a row only when learning_objective is in the pupil's server-derived domains (get-next-question/scope.ts),
// and pilot_d362 is not a fixed history domain, so only a pupil whose profiles.active_domains contains
// 'pilot_d362' can be served these rows. The primary test pupil and every other isolated pupil have
// active_domains null (all fixed history domains) or a fixed domain, so every existing scenario is
// unaffected (pinned by tests/unit/isolated-stimulus-chain-seed.test.mjs on the replayed schema).
//
// DIFFERENCES from the pilot rows, all deliberate and all here:
//   is_active             true (the pilot is written inactive; this test needs a servable row)
//   metadata.synthetic    true (the seed guard admits only synthetic rows into the isolated database)
//   metadata.fixture      "f07-stimulus-chain" (so the rows can be found)
//   metadata.misconception_type  a grading-side tag the browser must never receive (as the synthetic bank
//                         carries); the pilot rows have none, so without it the "no misconception_type
//                         in the payload" assertion would prove nothing
// content, answer_format, type, difficulty_band, difficulty_level and every other metadata field are the
// pilot's, byte for byte.
//
// INSERT-only by design: no DELETE, TRUNCATE or DROP anywhere in this module (pinned by a unit test).
import { readFileSync } from "node:fs";

export const STIMULUS_CHAIN_OBJECTIVE = "pilot_d362";
export const STIMULUS_CHAIN_GRADE = 7;
export const STIMULUS_CHAIN_FIXTURE = "f07-stimulus-chain";
export const STIMULUS_PILOT_MIGRATION = "20261108090100_stimulus_pilot_content.sql";

const MIGRATION_URL = new URL(`../../../supabase/migrations/${STIMULUS_PILOT_MIGRATION}`, import.meta.url);

// The pilot rows exactly as the migration hands them to jsonb_array_elements.
export function pilotStimulusRows(sql = readFileSync(MIGRATION_URL, "utf8")) {
  const m = /\$pilot\$(\[[\s\S]*\])\$pilot\$::jsonb/.exec(String(sql));
  if (!m) throw new Error(`stimulus-chain: the $pilot$ JSON array is missing in ${STIMULUS_PILOT_MIGRATION}`);
  const rows = JSON.parse(m[1]);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`stimulus-chain: ${STIMULUS_PILOT_MIGRATION} has no pilot rows`);
  return rows;
}

// The first multiple-choice pilot row with a stimulus of the given kind. Fails loud if the pilot no
// longer has one (the fixture must then be reconsidered, not silently changed).
function firstMcWith(rows, kind) {
  const row = rows.find((r) => r?.answer_format === "mc" && r?.content?.stimulus?.kind === kind);
  if (!row) throw new Error(`stimulus-chain: ${STIMULUS_PILOT_MIGRATION} has no multiple-choice row with a ${kind} stimulus`);
  return row;
}

export function stimulusChainQuestions(sql) {
  const pilot = pilotStimulusRows(sql);
  return ["image", "source"].map((kind) => {
    const r = firstMcWith(pilot, kind);
    return {
      type: r.type,
      content: r.content,
      difficulty: r.difficulty_band,
      is_active: true,
      question_type: "auto",
      learning_objective: STIMULUS_CHAIN_OBJECTIVE,
      answer_format: r.answer_format,
      answer_type: "short",
      metadata: { ...r.metadata, misconception_type: "surface_association", synthetic: true, fixture: STIMULUS_CHAIN_FIXTURE },
      target_grade: STIMULUS_CHAIN_GRADE,
      difficulty_band: r.difficulty_band,
      difficulty_level: r.difficulty_level,
    };
  });
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const json = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const int = (n) => {
  if (!Number.isInteger(n)) throw new Error(`stimulus-chain: expected an integer, got ${JSON.stringify(n)}`);
  return String(n);
};

// One idempotent statement: re-running it changes nothing (unique question text).
export function stimulusChainQuestionsSql(rows = stimulusChainQuestions()) {
  const values = rows.map((r) => `(${[lit(r.type), json(r.content), int(r.difficulty), r.is_active === true, lit(r.question_type),
    lit(r.learning_objective), lit(r.answer_format), lit(r.answer_type), json(r.metadata), int(r.target_grade),
    int(r.difficulty_band), int(r.difficulty_level)].join(", ")})`);
  return `INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective,
  answer_format, answer_type, metadata, target_grade, difficulty_band, difficulty_level) VALUES
${values.join(",\n")}
ON CONFLICT DO NOTHING;
`;
}
