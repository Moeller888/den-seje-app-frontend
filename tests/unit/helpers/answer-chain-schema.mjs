// The production answer chain for the question_attempts tests (20261030211428, D-266 / H5): the
// answer, reopen and release functions with the EXACT bodies production runs, the reward tables they
// write, and the EXECUTE grants production has. Built on prod-base-schema.mjs (tables, constraints,
// RLS, default privileges) and the level-engine migrations (question_is_servable,
// request_repeat_question_servable_for_student, request_repeat_level_question_for_student).
//
// Read from the live catalog on 2026-10-30 (catalog only, no rows):
//   * LIVE_PROSRC_MD5 — md5(prosrc) of every function the chain runs. Each body is taken from the
//     repository migration that holds it byte for byte; update_streak is the one body no repository
//     file holds exactly (later lockdowns changed only its grants, but its live text differs from
//     20260518000100), so its live prosrc is embedded below as base64. The tests assert every hash,
//     so a drifted copy cannot pass for production.
//   * the columns, defaults and constraints of student_progress, streak_milestones, daily_quests,
//     student_quest_progress, weekly_quests and student_weekly_quest_progress.
//   * EXECUTE: the answer and reopen functions service_role only; release_open_question_outside
//     authenticated + service_role; the streak/quest helpers no API role at all.
//
// HONEST LIMITS: only what the answer chain touches is reproduced (no achievements, no leaderboard,
// no profiles triggers). PGlite is PostgreSQL 18.x and runs as superuser; the concurrency suite runs
// the same chain on a real PostgreSQL 17.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROD_BASE_SQL, LEVEL_ENGINE_MIGRATIONS } from "./prod-base-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const readMigration = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");

export const ATTEMPTS_MIGRATION_FILE = "20261030211428_question_attempts_v2.sql";

export const LIVE_PROSRC_MD5 = Object.freeze({
  "public.process_question_attempt(uuid,uuid,text,bigint)": "8f698c5b45ecfe9a1988215dd8849d67",
  "public.process_text_answer(uuid,uuid,text,boolean)": "e80727ea87ffdc64988e5a09dcb20356",
  "public.release_open_question_outside(text[])": "7b7693b3bff869a113e8e97e16bb456a",
  "public.request_repeat_question(smallint,text[])": "54ab9354d309c014e94e902fd6f885f4",
  "public.request_repeat_question_for_student(uuid,smallint,text[])": "b27c917b9225bca58ad756e7952c49db",
  "public.request_repeat_question_servable_for_student(uuid,smallint,text[])": "e31009c5924d0fbe4f11731df7f94290",
  "public.request_repeat_level_question_for_student(uuid,text[])": "ee153327dae5a5686e9c5efd247d27c0",
  "public.question_is_servable(text,text,jsonb)": "1bca7ccb0321f665f3e747fec2599e67",
  "public.update_streak(uuid)": "721d14a51d3065226ad313347d8ac913",
  "public.update_quest_progress_for_answer(uuid,boolean,integer)": "6d511e018f52e687d6e2eb3e55f5ec51",
  "public.update_weekly_quest_progress_for_answer(uuid,boolean,integer)": "4c8b375ffbb6485c9909565e77451684",
});

// The CREATE statement of one function, verbatim from a migration file: from its CREATE to the end
// of its dollar-quoted body and the statement's ';'. A plain CREATE becomes CREATE OR REPLACE so the
// production body replaces whatever an earlier file in the chain left.
export function extractFunction(file, name) {
  const src = readMigration(file);
  const start = src.search(new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, "i"));
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  const as = /\bAS\s+(\$\w*\$)/g;
  as.lastIndex = start;
  const m = as.exec(src);
  if (!m) throw new Error(`${name}: no dollar-quoted body in ${file}`);
  const close = src.indexOf(m[1], m.index + m[0].length);
  const end = src.indexOf(";", close + m[1].length);
  if (close < 0 || end < 0) throw new Error(`${name}: unterminated body in ${file}`);
  return src.slice(start, end + 1).replace(/^CREATE\s+FUNCTION/i, "CREATE OR REPLACE FUNCTION");
}

// update_streak as production runs it (SECURITY DEFINER, search_path public, pg_temp).
const UPDATE_STREAK_PROSRC_B64 =
  "CkRFQ0xBUkUKICB2X3RvZGF5ICAgICAgICAgICBEQVRFICAgIDo9IENVUlJFTlRfREFURTsKICB2" +
  "X2xhc3RfZGF0ZSAgICAgICBEQVRFOwogIHZfY3Vycl9zdHJlYWsgICAgIElOVEVHRVI7CiAgdl9u" +
  "ZXdfc3RyZWFrICAgICAgSU5URUdFUjsKICB2X21pbGVzdG9uZV9jb2lucyBJTlRFR0VSOwogIHZf" +
  "cm93cyAgICAgICAgICAgIElOVEVHRVI7CkJFR0lOCiAgU0VMRUNUIGxhc3RfYWN0aXZpdHlfZGF0" +
  "ZSwgY3VycmVudF9zdHJlYWsKICBJTlRPICAgdl9sYXN0X2RhdGUsIHZfY3Vycl9zdHJlYWsKICBG" +
  "Uk9NICAgcHVibGljLnN0dWRlbnRfcHJvZ3Jlc3MKICBXSEVSRSAgc3R1ZGVudF9pZCA9IHBfc3R1" +
  "ZGVudF9pZDsKCiAgSUYgTk9UIEZPVU5EICAgICBUSEVOIFJFVFVSTjsgRU5EIElGOwogIElGIHZf" +
  "bGFzdF9kYXRlID0gdl90b2RheSBUSEVOIFJFVFVSTjsgRU5EIElGOwoKICB2X25ld19zdHJlYWsg" +
  "Oj0gQ0FTRQogICAgV0hFTiB2X2xhc3RfZGF0ZSA9IHZfdG9kYXkgLSBJTlRFUlZBTCAnMSBkYXkn" +
  "CiAgICAgIFRIRU4gQ09BTEVTQ0Uodl9jdXJyX3N0cmVhaywgMCkgKyAxCiAgICBFTFNFIDEKICBF" +
  "TkQ7CgogIFVQREFURSBwdWJsaWMuc3R1ZGVudF9wcm9ncmVzcwogIFNFVAogICAgY3VycmVudF9z" +
  "dHJlYWsgICAgID0gdl9uZXdfc3RyZWFrLAogICAgbG9uZ2VzdF9zdHJlYWsgICAgID0gR1JFQVRF" +
  "U1QoQ09BTEVTQ0UobG9uZ2VzdF9zdHJlYWssIDApLCB2X25ld19zdHJlYWspLAogICAgbGFzdF9h" +
  "Y3Rpdml0eV9kYXRlID0gdl90b2RheQogIFdIRVJFIHN0dWRlbnRfaWQgPSBwX3N0dWRlbnRfaWQ7" +
  "CgogIElGIHZfbmV3X3N0cmVhayBJTiAoMywgNywgMTQsIDMwKSBUSEVOCiAgICB2X21pbGVzdG9u" +
  "ZV9jb2lucyA6PSBDQVNFIHZfbmV3X3N0cmVhawogICAgICBXSEVOIDMgIFRIRU4gMTAwCiAgICAg" +
  "IFdIRU4gNyAgVEhFTiAyMDAKICAgICAgV0hFTiAxNCBUSEVOIDUwMAogICAgICBXSEVOIDMwIFRI" +
  "RU4gMTAwMAogICAgRU5EOwoKICAgIElOU0VSVCBJTlRPIHB1YmxpYy5zdHJlYWtfbWlsZXN0b25l" +
  "cyAoc3R1ZGVudF9pZCwgbWlsZXN0b25lX2RheSkKICAgIFZBTFVFUyAocF9zdHVkZW50X2lkLCB2" +
  "X25ld19zdHJlYWspCiAgICBPTiBDT05GTElDVCBETyBOT1RISU5HOwoKICAgIEdFVCBESUFHTk9T" +
  "VElDUyB2X3Jvd3MgPSBST1dfQ09VTlQ7CgogICAgSUYgdl9yb3dzID4gMCBUSEVOCiAgICAgIFVQ" +
  "REFURSBwdWJsaWMuc3R1ZGVudF9wcm9ncmVzcwogICAgICBTRVQgICAgY29pbnMgPSBDT0FMRVND" +
  "RShjb2lucywgMCkgKyB2X21pbGVzdG9uZV9jb2lucwogICAgICBXSEVSRSAgc3R1ZGVudF9pZCA9" +
  "IHBfc3R1ZGVudF9pZDsKICAgIEVORCBJRjsKICBFTkQgSUY7CkVORDsK";
const UPDATE_STREAK_SQL =
  "CREATE OR REPLACE FUNCTION public.update_streak(p_student_id uuid) RETURNS void LANGUAGE plpgsql " +
  "SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$" +
  Buffer.from(UPDATE_STREAK_PROSRC_B64, "base64").toString("utf8") + "$function$;";

// The reward tables as production has them (columns, defaults, constraints).
export const REWARD_TABLES_SQL = `
  CREATE TABLE public.student_progress (
    student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    xp integer NOT NULL DEFAULT 0, coins integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1,
    correct_answers integer NOT NULL DEFAULT 0, total_correct_answers integer NOT NULL DEFAULT 0,
    total_attempts integer NOT NULL DEFAULT 0, current_streak integer NOT NULL DEFAULT 0,
    longest_streak integer NOT NULL DEFAULT 0, last_activity_date date,
    best_session_streak integer NOT NULL DEFAULT 0, night_correct boolean NOT NULL DEFAULT false,
    prestige_score integer NOT NULL DEFAULT 0, mastery_balance integer NOT NULL DEFAULT 0,
    mastery_level integer NOT NULL DEFAULT 1, mastery_score numeric DEFAULT 1000,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT coins_non_negative CHECK (coins >= 0),
    CONSTRAINT correct_answers_non_negative CHECK (correct_answers >= 0),
    CONSTRAINT level_minimum CHECK (level >= 1),
    CONSTRAINT total_correct_answers_non_negative CHECK (total_correct_answers >= 0),
    CONSTRAINT xp_non_negative CHECK (xp >= 0));
  CREATE TABLE public.streak_milestones (
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    milestone_day integer NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, milestone_day));
  CREATE TABLE public.daily_quests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quest_key text NOT NULL UNIQUE, label text NOT NULL,
    type text NOT NULL CHECK (type = ANY (ARRAY['answer_count','correct_count','xp_earned'])),
    target integer NOT NULL, reward_coins integer NOT NULL DEFAULT 0, reward_xp integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0);
  CREATE TABLE public.student_quest_progress (
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES public.daily_quests(id) ON DELETE CASCADE,
    quest_date date NOT NULL, progress integer NOT NULL DEFAULT 0,
    completed boolean NOT NULL DEFAULT false, claimed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (student_id, quest_id, quest_date));
  CREATE TABLE public.weekly_quests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quest_key text NOT NULL UNIQUE, label text NOT NULL,
    type text NOT NULL CHECK (type = ANY (ARRAY['answer_count','correct_count','xp_earned'])),
    target integer NOT NULL CHECK (target > 0), reward_coins integer NOT NULL CHECK (reward_coins > 0),
    is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0);
  CREATE TABLE public.student_weekly_quest_progress (
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES public.weekly_quests(id) ON DELETE CASCADE,
    week_key text NOT NULL, progress integer NOT NULL DEFAULT 0,
    completed boolean NOT NULL DEFAULT false, claimed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (student_id, quest_id, week_key));
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.streak_milestones ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.student_quest_progress ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.student_weekly_quest_progress ENABLE ROW LEVEL SECURITY;
`;

// The chain's functions, each from the file that holds production's body.
export const LIVE_FUNCTIONS = Object.freeze([
  ["20260518000100_retention_loops.sql", "update_quest_progress_for_answer"],
  ["20260524000000_weekly_quests.sql", "update_weekly_quest_progress_for_answer"],
  ["20260524000000_weekly_quests.sql", "process_text_answer"],
  ["20261002000000_quiz_repeat_when_pool_exhausted.sql", "request_repeat_question"],
  ["20261002000000_quiz_repeat_when_pool_exhausted.sql", "release_open_question_outside"],
  ["20261016160000_answer_keys_server_side_rpcs.sql", "request_repeat_question_for_student"],
  ["20261027120000_repeat_answer_coin_reward.sql", "process_question_attempt"],
]);

// EXECUTE as production has it (has_function_privilege, 2026-10-30).
export const LIVE_GRANTS_SQL = `
  DO $g$ DECLARE f text; BEGIN
    FOREACH f IN ARRAY ARRAY[
      'public.process_question_attempt(uuid,uuid,text,bigint)', 'public.process_text_answer(uuid,uuid,text,boolean)',
      'public.request_repeat_question(smallint,text[])', 'public.request_repeat_question_for_student(uuid,smallint,text[])',
      'public.request_repeat_question_servable_for_student(uuid,smallint,text[])',
      'public.request_repeat_level_question_for_student(uuid,text[])', 'public.release_open_question_outside(text[])',
      'public.update_streak(uuid)', 'public.update_quest_progress_for_answer(uuid,boolean,integer)',
      'public.update_weekly_quest_progress_for_answer(uuid,boolean,integer)']
    LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f); END LOOP;
  END $g$;
  GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid,uuid,text,bigint) TO service_role;
  GRANT EXECUTE ON FUNCTION public.process_text_answer(uuid,uuid,text,boolean) TO service_role;
  GRANT EXECUTE ON FUNCTION public.request_repeat_question_for_student(uuid,smallint,text[]) TO service_role;
  GRANT EXECUTE ON FUNCTION public.request_repeat_question_servable_for_student(uuid,smallint,text[]) TO service_role;
  GRANT EXECUTE ON FUNCTION public.request_repeat_level_question_for_student(uuid,text[]) TO service_role;
  GRANT EXECUTE ON FUNCTION public.release_open_question_outside(text[]) TO authenticated, service_role;
`;

// The whole chain, in order, as SQL chunks. realServer: roles are cluster-wide on a real PostgreSQL,
// so they are created only if missing (same treatment as difficulty-scale-b-concurrency).
export function answerChainSql({ realServer = false } = {}) {
  const base = realServer
    ? PROD_BASE_SQL.replace(
      "CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;",
      `DO $r$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOBYPASSRLS; END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOBYPASSRLS; END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
       END $r$;`)
    : PROD_BASE_SQL;
  return [
    base,
    ...LEVEL_ENGINE_MIGRATIONS.map(readMigration),
    REWARD_TABLES_SQL,
    UPDATE_STREAK_SQL,
    ...LIVE_FUNCTIONS.map(([file, name]) => extractFunction(file, name)),
    LIVE_GRANTS_SQL,
  ];
}
