// D-290 G2 (20261101140000) and the H5 integration (20261101190000 + 20261101190100) in every order
// production or the repository can apply them, for tests/unit/question-attempts-v2-g2-compat*.test.mjs.
//
// The owner's decision (2026-11-01): G2 must be applicable BEFORE H5, so the order of the two must
// not matter. G2 is the whole file, unmodified: its guard trigger and the deactivation of the two
// questions, seeded exactly as production holds them (fixtures/d290-two-questions.json), so its md5
// guards pass.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { H5, D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, PROD_ORDER, REPO_ORDER } from "./h5-integration-chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const G2 = "20261101140000_deactivate_two_misgraded_questions.sql";
export const G2_TRIGGER = "open_round_requires_active_question";
export const G2_FUNCTION = "public.guard_open_round_requires_active_question()";
// md5(prosrc) of G2's guard function as merged in #529 (file SHA-256 801d9ba6…); the bootstrap pins it.
export const G2_GUARD_MD5 = "e5627de108be67869a4615490a6857a2";

export const ORDERS = Object.freeze({
  "production, G2 first (before G1)": [D280_PATHS, D278, G2, G1, BOOTSTRAP, ALIGN],
  "production, G2 after G1, before H5": [D280_PATHS, D278, G1, G2, BOOTSTRAP, ALIGN],
  "production, G2 between bootstrap and alignment": [D280_PATHS, D278, G1, BOOTSTRAP, G2, ALIGN],
  "production, H5 first, then G2": [...PROD_ORDER, G2],
  "repository file order": [H5, D278, D280_PATHS, G2, G1, BOOTSTRAP, ALIGN],
});
export const G2_BEFORE_H5 = ORDERS["production, G2 after G1, before H5"];
export const H5_BEFORE_G2 = ORDERS["production, H5 first, then G2"];

const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "unit", "fixtures", "d290-two-questions.json"), "utf8"));
export const G2_IDS = FIXTURE.map((q) => q.id);
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
export const G2_SEED_SQL = `INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type,
  learning_objective, answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES
  ${FIXTURE.map((q) => `('${q.id}', '${q.type}', ${lit(q.content)}::jsonb, ${lit(q.metadata)}::jsonb, ${q.difficulty}, true,
  '${q.question_type}', '${q.learning_objective}', '${q.answer_format}', '${q.answer_type}', ${q.target_grade},
  ${q.difficulty_band}, ${q.difficulty_level})`).join(",\n  ")};`;

// G2's documented rollback of part 1 (the header of 20261101140000).
export const G2_GUARD_ROLLBACK_SQL = `
  DROP TRIGGER open_round_requires_active_question ON public.question_instances;
  DROP FUNCTION public.guard_open_round_requires_active_question();`;

export { PROD_ORDER, REPO_ORDER };
