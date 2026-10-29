// Shared fixture for migration 20261029150000 (D-254): the tables the compensation reads and writes,
// as they are live (student_progress columns, NOT NULLs, CHECKs, FK, RLS policies and table grants
// read from the catalog 2026-10-29), plus the reward tables it must leave alone.
//
// Every id here is SYNTHETIC. The migration names its two attempts only by SHA-256 of the instance
// id; withTargets() swaps those two fingerprints for the fingerprints of the synthetic instances, so
// the tests run the migration's own logic without any real pupil or instance id in the repository.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const MIGRATION_FILE = "20261029150000_mc_grading_compensation.sql";
export const SQL = readFileSync(join(ROOT, "supabase", "migrations", MIGRATION_FILE), "utf8");
export const QUESTION = "57c0e3db-090d-40fd-9a9b-a5609590f09a";
const TARGETS_RE = /\$targets\$([\s\S]*?)\$targets\$/;
export const REAL_TARGETS = JSON.parse(SQL.match(TARGETS_RE)[1]);

export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const id = (p, n) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const PUPIL_A = id("aaaaaaaa", 1);    // target 1
export const PUPIL_B = id("aaaaaaaa", 2);    // target 2
export const PUPIL_C = id("aaaaaaaa", 3);    // answered the same question, not a target
export const TEACHER = id("aaaaaaaa", 9);
export const OTHER_QUESTION = id("bbbbbbbb", 1);
export const INST_A = id("cccccccc", 1);
export const INST_B = id("cccccccc", 2);
export const INST_C = id("cccccccc", 3);
export const INST_A_OTHER = id("cccccccc", 4);

// The migration with its two fingerprints replaced by those of the given synthetic instance ids.
export function withTargets(instanceIds = [INST_A, INST_B]) {
  return SQL.replace(TARGETS_RE, `$targets$${JSON.stringify(instanceIds.map(sha256))}$targets$`);
}

export const EXTRA_SQL = `
  CREATE TABLE public.student_progress (
    student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    xp integer NOT NULL DEFAULT 0, coins integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1,
    correct_answers integer NOT NULL DEFAULT 0, total_correct_answers integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), mastery_level integer NOT NULL DEFAULT 1,
    mastery_balance integer NOT NULL DEFAULT 0, total_attempts integer NOT NULL DEFAULT 0,
    mastery_score numeric DEFAULT 1000, current_streak integer NOT NULL DEFAULT 0,
    longest_streak integer NOT NULL DEFAULT 0, last_activity_date date,
    night_correct boolean NOT NULL DEFAULT false, best_session_streak integer NOT NULL DEFAULT 0,
    prestige_score integer NOT NULL DEFAULT 0,
    CONSTRAINT coins_non_negative CHECK (coins >= 0),
    CONSTRAINT correct_answers_non_negative CHECK (correct_answers >= 0),
    CONSTRAINT level_minimum CHECK (level >= 1),
    CONSTRAINT total_correct_answers_non_negative CHECK (total_correct_answers >= 0),
    CONSTRAINT xp_non_negative CHECK (xp >= 0));
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Students can read own progress" ON public.student_progress FOR SELECT USING (auth.uid() = student_id);

  CREATE TABLE public.student_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    type text CONSTRAINT student_events_type_not_empty CHECK (length(type) > 0),
    payload jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
  ALTER TABLE public.student_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Students can insert own events" ON public.student_events FOR INSERT WITH CHECK (auth.uid() = student_id);
  CREATE POLICY "Students can read own events" ON public.student_events FOR SELECT USING (auth.uid() = student_id);

  CREATE TABLE public.student_quest_progress (student_id uuid, quest_id uuid, quest_date date,
    progress integer, completed boolean, claimed boolean);
  CREATE TABLE public.student_weekly_quest_progress (student_id uuid, quest_id uuid, week_key text,
    progress integer, completed boolean, claimed boolean);
  CREATE TABLE public.user_achievements (student_id uuid, achievement_id text,
    PRIMARY KEY (student_id, achievement_id));
`;

export const SEED_SQL = `
  INSERT INTO auth.users VALUES ('${PUPIL_A}'), ('${PUPIL_B}'), ('${PUPIL_C}'), ('${TEACHER}');
  INSERT INTO public.profiles (id, role, selected_grade) VALUES
    ('${PUPIL_A}', 'student', 8), ('${PUPIL_B}', 'student', 8), ('${PUPIL_C}', 'student', 8), ('${TEACHER}', 'teacher', NULL);
  INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective, answer_format, target_grade, difficulty_band)
  VALUES
    ('${QUESTION}', 'mc_single', '{"question":"Q1?","options":["rigtig","forkert"],"correct":"rigtig"}', 1, true, 'auto', 'industrialisation', 'mc', 8, 3),
    ('${OTHER_QUESTION}', 'mc_single', '{"question":"Q2?","options":["a","b"],"correct":"a"}', 1, true, 'auto', 'industrialisation', 'mc', 8, 3);
  INSERT INTO public.question_instances (id, student_id, question_id, correct_answer, answered, answered_at, user_answer, was_correct, repeat_count) VALUES
    ('${INST_A}', '${PUPIL_A}', '${QUESTION}', 'rigtg', true, '2026-06-09 10:16:21+00', 'rigtig', false, 0),
    ('${INST_B}', '${PUPIL_B}', '${QUESTION}', 'rigtg', true, '2026-10-02 09:14:19+00', 'rigtig', false, 0),
    ('${INST_C}', '${PUPIL_C}', '${QUESTION}', 'rigtg', true, '2026-10-03 08:00:00+00', 'forkert', false, 0),
    ('${INST_A_OTHER}', '${PUPIL_A}', '${OTHER_QUESTION}', 'a', true, '2026-06-09 10:20:00+00', 'a', true, 0);
  INSERT INTO public.student_progress (student_id, xp, coins, level, correct_answers, total_correct_answers, current_streak, longest_streak, best_session_streak, prestige_score) VALUES
    ('${PUPIL_A}', 14290, 340, 89, 544, 542, 2, 2, 0, 50),
    ('${PUPIL_B}', 3970, 1725, 1, 397, 397, 1, 1, 59, 36),
    ('${PUPIL_C}', 500, 20, 1, 50, 50, 0, 0, 0, 0);
  INSERT INTO public.student_events (student_id, type, payload) VALUES ('${PUPIL_A}', 'MC_CORRECT', '{}');
  INSERT INTO public.student_quest_progress VALUES ('${PUPIL_A}', '${OTHER_QUESTION}', '2026-06-09', 114, true, true);
  INSERT INTO public.student_weekly_quest_progress VALUES ('${PUPIL_B}', '${OTHER_QUESTION}', '2026-40', 20, true, true);
  INSERT INTO public.user_achievements VALUES ('${PUPIL_A}', 'correct_100'), ('${PUPIL_B}', 'correct_100');
`;

// Every table the migration must leave byte-identical, dumped in a stable order.
export const UNTOUCHED_TABLES = [
  "auth.users", "public.profiles", "public.questions", "public.question_instances", "public.student_events",
  "public.student_quest_progress", "public.student_weekly_quest_progress", "public.user_achievements",
];
export const dumpSql = (table) => `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM ${table} t`;
export const PROGRESS_SQL = `SELECT * FROM public.student_progress ORDER BY student_id`;
