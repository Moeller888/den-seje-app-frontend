// The two histories that must end in the same H5 schema (H5 integration, D-266 / D-273 / D-278 /
// D-280 / D-290 G1), for tests/unit/question-attempts-v2-bootstrap*.test.mjs.
//
//   REPO_ORDER   the repository's own order (file names):
//                20261030211428 (H5) → D-278 → D-280 part 1 → G1 → 20261101190000 → 20261101190100
//   PROD_ORDER   what production did and must do: D-280 part 1 (applied 2026-11-01 as
//                20261101101401) → D-278 (20261101101441) → G1 (not applied yet) → 20261101190000
//                → 20261101190100
// The isolated E2E replays only what production has (tests/isolated/schema/replay-plan.mjs): today
// 20261030211428, D-278 and D-280 part 1; G1 and the two H5 integration files once applied there.
//
// Both start from production's answer chain before D-280 (helpers/answer-chain-schema.mjs pins every
// md5) plus the two hidden-achievement functions D-278 replaces, with the EXECUTE production had
// before D-278 (catalog, 2026-10-31). D-280 part 2 (the ten questions) is applied separately where a
// test needs it, on the ten questions exactly as production holds them
// (fixtures/mc-length-cue-top10-before.json).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerChainSql, extractFunction, readMigration, ATTEMPTS_MIGRATION_FILE } from "./answer-chain-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const H5 = ATTEMPTS_MIGRATION_FILE;
export const D278 = "20261031190000_reward_integrity_server_authority.sql";
export const D280_PATHS = "20261031194600_mc_length_cue_answer_paths.sql";
export const D280_TOP10 = "20261031194700_mc_length_cue_top10.sql";
export const G1 = "20261101150000_grading_meaningful_characters.sql";
export const BOOTSTRAP = "20261101190000_question_attempts_v2_bootstrap.sql";
export const ALIGN = "20261101190100_question_attempts_v2_align_grading.sql";
export const REPO_ORDER = Object.freeze([H5, D278, D280_PATHS, G1, BOOTSTRAP, ALIGN]);
export const PROD_ORDER = Object.freeze([D280_PATHS, D278, G1, BOOTSTRAP, ALIGN]);
// D-280 part 2 at its place in either history: just before G1. Its guard requires D-280 part 1's
// process_question_attempt, so it cannot follow G1; production applied it on 2026-11-01 (after D-278),
// and in the repository it sorts before G1 as well.
export function withTop10(order) {
  const i = order.indexOf(G1);
  if (i < 0) throw new Error("withTop10: the order has no G1");
  return [...order.slice(0, i), D280_TOP10, ...order.slice(i)];
}

export const MC_V2 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)";
export const TEXT_V2 = "public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)";
export const PQA = "public.process_question_attempt(uuid,uuid,text,bigint)";
export const MD5 = Object.freeze({
  mcV2Original: "943d03820fe4756f5a72c6f0a5d77d7d",
  mcV2Aligned: "8a7696147df978e250918b2c93e20577",
  textV2: "f880984680d52b20d07c628a9dfae474",
  pqaD280: "328ea8f9a4fd260407b582dcecb7dfdf",
  pqaG1: "2e05e769a102f61ffef0ea4dd550c55b",
  normalizeChoice: "281addc21850a8c6b9f40f6bd8609ad9",
  normalizeNumber: "3dadb6e137855796327637872ee32395",
});
export const NORMALIZE_CHOICE = "public.normalize_choice_answer(text)";
export const NORMALIZE_NUMBER = "public.normalize_number_answer(text)";

const HIDDEN = "20260518000500_hidden_achievements.sql";
// D-278's two functions as production had them before D-278 (= 20260518000500, byte for byte), with
// production's open EXECUTE (PUBLIC, anon, authenticated, service_role).
export const D278_PREREQUISITES_SQL = [
  extractFunction(HIDDEN, "set_night_correct"),
  extractFunction(HIDDEN, "update_best_session_streak"),
  `GRANT EXECUTE ON FUNCTION public.set_night_correct(), public.update_best_session_streak(integer)
     TO PUBLIC, anon, authenticated, service_role;`,
];

// The ten D-280 questions as production holds them, plus quests the answer functions advance.
export const TOP10_BEFORE = JSON.parse(readFileSync(join(ROOT, "tests", "unit", "fixtures", "mc-length-cue-top10-before.json"), "utf8"));
export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const TOP10_ID = TOP10_BEFORE.map((_, i) => uid(9100 + i));
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
export const SEED_SQL = `
  INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
     answer_format, answer_type, target_grade, difficulty_band, difficulty_level) VALUES
  ${TOP10_BEFORE.map((r, i) => `('${TOP10_ID[i]}', '${r.type}', ${lit(r.content)}::jsonb, ${lit(r.metadata)}::jsonb, ${r.difficulty}, true,
     '${r.question_type}', '${r.learning_objective}', '${r.answer_format}', '${r.answer_type}', ${r.target_grade},
     ${r.difficulty_band}, ${r.difficulty_level})`).join(",\n  ")};
  INSERT INTO public.daily_quests (quest_key, label, type, target, reward_coins) VALUES
    ('d_answers', 'Svar', 'answer_count', 5, 10), ('d_correct', 'Rigtige', 'correct_count', 5, 10);
  INSERT INTO public.weekly_quests (quest_key, label, type, target, reward_coins) VALUES
    ('w_answers', 'Svar', 'answer_count', 50, 50), ('w_correct', 'Rigtige', 'correct_count', 50, 50);`;

/** SQL chunks for a database at production's state before D-280, D-278 and H5. */
export function baseSql({ realServer = false } = {}) {
  return [...answerChainSql({ realServer }), ...D278_PREREQUISITES_SQL, SEED_SQL];
}

export const migrationSql = (file) => readMigration(file);

// Everything in schema public that a migration could change, as one JSON value: functions (body md5,
// SECURITY DEFINER, settings, ACL, owner), triggers, constraints, indexes, policies, table ACLs,
// columns and the attempts table's comment. Two databases with the same fingerprint have the same
// public schema.
export const FINGERPRINT_SQL = `
SELECT jsonb_build_object(
  'functions', (SELECT jsonb_object_agg(p.oid::regprocedure::text,
                  jsonb_build_array(md5(p.prosrc), p.prosecdef, p.proconfig, p.proacl::text[], pg_get_userbyid(p.proowner)))
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'),
  'triggers', (SELECT jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text, t.tgname, pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
               FROM pg_trigger t WHERE NOT t.tgisinternal),
  'constraints', (SELECT jsonb_agg(jsonb_build_array(c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid))
                  ORDER BY c.conrelid::regclass::text, c.conname)
                  FROM pg_constraint c WHERE c.connamespace = 'public'::regnamespace),
  'indexes', (SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public'),
  'policies', (SELECT jsonb_agg(jsonb_build_array(tablename, policyname, cmd, roles::text, qual, with_check)
               ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public'),
  'table_acl', (SELECT jsonb_object_agg(relname, relacl::text[]) FROM pg_class
                WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'),
  'rls', (SELECT jsonb_object_agg(relname, relrowsecurity) FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'),
  'columns', (SELECT jsonb_agg(jsonb_build_array(table_name, column_name, data_type, is_nullable, column_default)
              ORDER BY table_name, ordinal_position) FROM information_schema.columns WHERE table_schema = 'public'),
  'attempts_comment', obj_description(to_regclass('public.question_attempts'), 'pg_class')
) AS f`;

// The rollback before activation, as 20261030211428's header states it (20261101190000 refers to it).
export const ROLLBACK_SQL = `
  DROP FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text);
  DROP FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text);
  DROP TRIGGER question_instances_round_guard ON public.question_instances;
  DROP TABLE public.question_attempts;
  DROP FUNCTION public.question_attempts_reject_update();
  DROP FUNCTION public.question_instances_round_guard();
  ALTER TABLE public.question_instances DROP CONSTRAINT question_instances_id_student_id_key;`;
