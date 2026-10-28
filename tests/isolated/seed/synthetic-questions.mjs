// Deterministic SYNTHETIC question bank for the isolated E2E database. No real question, no
// production data: every row is generated from its index. Same input → byte-identical output, so a
// run never depends on an earlier run.
//
// Sized and shaped for what the suite checks before it starts (tests/global-setup.ts, Section 133):
// ≥ 450 active questions; per grade 3..9 at least 15/28/25/25/110/100/145; ≥ 35 per history domain
// (learning_objective = the domain); every grade ≥ 2 difficulty bands with ≥ 3 questions each.
// Shapes follow the question contract (packages/question-contract: mc_single, text_input)
// and the questions table's constraints (active ⇒ question_type 'auto'; auto ⇒
// learning_objective and content.correct; mc ⇒ ≥ 2 options; text ⇒ no options; unique question text).

export const DOMAINS = Object.freeze([
  "prehistoric_denmark", "vikings", "middle_ages", "reformation_monarchy", "enlightenment",
  "revolutions_democracy", "industrialisation", "world_war_1", "world_war_2", "cold_war", "democracy_power",
]);
// Per grade: comfortably above the health-check minimum (×1.2, rounded up to a multiple of 11 so
// every domain gets the same share within a grade).
export const PER_GRADE = Object.freeze({ 3: 22, 4: 44, 5: 33, 6: 33, 7: 132, 8: 121, 9: 176 });

// Format mix shaped like production's active pool: multiple choice throughout, plus exactly two
// active typed ("Stav til") questions, both world_war_2 at grade 7 — the state
// 20261011094747_stav_til_first_questions.sql establishes and asserts (it refuses if any other
// active text question exists). Quiz specs click the first answer button and rely on that shape;
// a pupil served a typed question there would wait forever.
export const TEXT_QUESTIONS = Object.freeze({ grade: 7, domain: "world_war_2", count: 2 });
const formatFor = (grade, domain, textSoFar) =>
  grade === TEXT_QUESTIONS.grade && domain === TEXT_QUESTIONS.domain && textSoFar < TEXT_QUESTIONS.count ? "text" : "mc";

// Bands: 1..5 cycled within a grade; difficulty inside the band's range (1..1000 scale).
const band = (i) => (i % 5) + 1;
const difficulty = (b, i) => (b - 1) * 200 + 1 + ((i * 37) % 199);

export function syntheticQuestions() {
  const rows = [];
  let textSoFar = 0;
  for (const [g, count] of Object.entries(PER_GRADE)) {
    const grade = Number(g);
    for (let i = 0; i < count; i++) {
      const domain = DOMAINS[i % DOMAINS.length];
      const b = band(Math.floor(i / DOMAINS.length) + i);
      const format = formatFor(grade, domain, textSoFar);
      if (format === "text") textSoFar++;
      const tag = `G${grade}-${domain}-${String(i).padStart(3, "0")}`;
      let content, type;
      if (format === "mc") {
        const options = [`Svar A ${tag}`, `Svar B ${tag}`, `Svar C ${tag}`, `Svar D ${tag}`];
        const correct = options[i % 4];
        content = { question: `Syntetisk spørgsmål ${tag}: hvilket svar er rigtigt?`, options, correct,
          accepted_answers: [correct], review_text: `Det rigtige svar er ${correct}.` };
        type = "mc_single";
      } else {
        const correct = `ord${i}`;
        content = { question: `Syntetisk stav-til ${tag}: skriv ordet ${correct}`, correct,
          accepted_answers: [correct], review_text: `Ordet staves ${correct}.` };
        type = "text_input";
      }
      rows.push({
        type, content, difficulty: difficulty(b, i), is_active: true, question_type: "auto",
        learning_objective: domain, answer_format: format, answer_type: "short",
        metadata: { domain, concepts: ["syntetisk"], cognitive_skill: "recall", difficulty_type: "factual",
          misconception_type: "surface_association", challenge_role: "reinforcement", insight_type: "conceptual_bridge", synthetic: true },
        target_grade: grade, difficulty_band: b,
      });
    }
  }
  return rows;
}

// INSERT-only by design: no DELETE, TRUNCATE or DROP anywhere in this module (pinned by a unit test).
// Real question rows never land in the isolated database in the first place (the replay runs with
// seed-guard.mjs contentFilterOnSql), and the seed runs only after seed-guard.mjs assertSeedTarget.

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const json = (o) => `${lit(JSON.stringify(o))}::jsonb`;

// One idempotent statement: re-running it changes nothing (unique question text).
export function syntheticQuestionsSql(rows = syntheticQuestions()) {
  const values = rows.map((r) => `(${[lit(r.type), json(r.content), r.difficulty, r.is_active, lit(r.question_type),
    lit(r.learning_objective), lit(r.answer_format), lit(r.answer_type), json(r.metadata), r.target_grade, r.difficulty_band].join(", ")})`);
  return `INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective,
  answer_format, answer_type, metadata, target_grade, difficulty_band) VALUES
${values.join(",\n")}
ON CONFLICT DO NOTHING;
`;
}
