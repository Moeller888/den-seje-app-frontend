// A production-faithful base schema for migration tests on PGlite: the tables, constraints, unique
// indexes, RLS, policies, grants and default privileges that the question/level migrations meet in
// production. Read from the live catalog (information_schema, pg_constraint, pg_indexes, pg_policies,
// has_table_privilege, pg_default_acl) on 2026-10-21/22 — catalog only, no rows.
//
// Integration order for the level engine: PROD_BASE_SQL → 20261019150000 (#351) → 20261020120000 (A)
// → 20261029120000 (B). Content migrations can be loaded on top to prove they satisfy the live
// constraints (content_valid_check, questions_answer_format_check, the unique indexes …).
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x (production 17.6) and runs as a superuser, so function
// ownership is not modelled. Only the columns, constraints and policies these migrations can touch
// are reproduced; triggers on unrelated tables, the process_* answer functions and the auth schema
// beyond auth.users/auth.uid() are not.

export const PROD_BASE_SQL = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  -- Live default privileges (pg_default_acl): every new table and function in public is granted to
  -- anon and authenticated. A migration that forgets its REVOKE is therefore caught here.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $f$ SELECT nullif(current_setting('test.uid', true), '')::uuid $f$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid, selected_grade smallint
      CHECK (selected_grade IS NULL OR selected_grade BETWEEN 3 AND 9),
    placement_band smallint, current_band smallint, active_domains text[]);

  CREATE TABLE public.questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    content jsonb NOT NULL,
    difficulty integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    deactivated_at timestamptz,
    deactivation_reason text,
    question_type text NOT NULL,
    learning_objective text,
    answer_format text NOT NULL,
    content_hash text,
    batch_id uuid,
    cognitive_level text,
    ai_model text, ai_prompt_version text, ai_generator text,
    answer_type text DEFAULT 'short'::text,
    metadata jsonb,
    target_grade smallint,
    difficulty_band smallint,
    CONSTRAINT active_requires_auto CHECK (((NOT is_active) OR (question_type = 'auto'::text))),
    CONSTRAINT auto_questions_require_objective CHECK (((question_type <> 'auto'::text) OR (learning_objective IS NOT NULL))),
    CONSTRAINT auto_requires_correct CHECK (((question_type <> 'auto'::text) OR ((content ->> 'correct'::text) IS NOT NULL))),
    CONSTRAINT content_valid_check CHECK (((jsonb_typeof(content) = 'object'::text) AND (content ? 'question'::text) AND (content ? 'correct'::text) AND ((((content ->> 'type'::text) = 'mc'::text) AND (content ? 'options'::text) AND (jsonb_typeof((content -> 'options'::text)) = 'array'::text) AND (jsonb_array_length((content -> 'options'::text)) > 0)) OR ((content ->> 'type'::text) = ANY (ARRAY['text'::text, 'number'::text]))))),
    CONSTRAINT question_type_valid CHECK ((question_type = ANY (ARRAY['auto'::text, 'open'::text]))),
    CONSTRAINT questions_answer_format_check CHECK ((((answer_format = 'mc'::text) AND (content ? 'options'::text) AND (jsonb_typeof((content -> 'options'::text)) = 'array'::text) AND (jsonb_array_length((content -> 'options'::text)) >= 2)) OR ((answer_format = 'number'::text) AND (content ? 'correct'::text)) OR ((answer_format = 'text'::text) AND (NOT (content ? 'options'::text))))),
    CONSTRAINT questions_difficulty_band_check CHECK (((difficulty_band IS NULL) OR ((difficulty_band >= 1) AND (difficulty_band <= 5)))),
    CONSTRAINT questions_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 1000))),
    CONSTRAINT questions_target_grade_check CHECK (((target_grade IS NULL) OR ((target_grade >= 3) AND (target_grade <= 9)))),
    CONSTRAINT year_answer_must_be_number CHECK (((answer_format <> 'year'::text) OR ((content ->> 'correct'::text) ~ '^[0-9]{4}$'::text)))
  );
  CREATE INDEX idx_questions_active_difficulty ON public.questions USING btree (is_active, difficulty);
  CREATE INDEX idx_questions_grade_band ON public.questions USING btree (target_grade, difficulty_band);
  CREATE INDEX questions_active_difficulty_idx ON public.questions USING btree (difficulty) WHERE (is_active = true);
  CREATE UNIQUE INDEX questions_content_hash_unique ON public.questions USING btree (content_hash);
  CREATE UNIQUE INDEX unique_active_objective_level ON public.questions USING btree (learning_objective, cognitive_level) WHERE (is_active = true);
  CREATE UNIQUE INDEX unique_auto_objective_level ON public.questions USING btree (learning_objective, cognitive_level) WHERE (question_type = 'auto'::text);
  CREATE UNIQUE INDEX unique_question_text ON public.questions USING btree (((content ->> 'question'::text)));

  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    correct_answer text NOT NULL DEFAULT '',
    difficulty_at_time integer NOT NULL DEFAULT 1,
    mastery_snapshot integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    answered boolean NOT NULL DEFAULT false,
    answered_at timestamptz,
    is_correct boolean,
    xp_awarded integer DEFAULT 0,
    next_due timestamptz,
    next_review_at timestamptz,
    incorrect_attempts integer DEFAULT 0,
    user_answer text,
    was_correct boolean,
    teacher_feedback text,
    teacher_score integer,
    reviewed_at timestamp,
    reviewed_by uuid,
    misconception_signal text,
    repeat_count integer NOT NULL DEFAULT 0,
    CONSTRAINT difficulty_matches_mastery CHECK ((difficulty_at_time <= mastery_snapshot))
  );
  CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE (answered = false);
  CREATE INDEX idx_qi_question ON public.question_instances USING btree (question_id);
  CREATE INDEX idx_qi_student_created ON public.question_instances USING btree (student_id, created_at DESC);
  CREATE INDEX idx_question_instances_student_due ON public.question_instances USING btree (student_id, next_review_at);
  CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances USING btree (student_id, question_id);

  CREATE TABLE public.placement_sessions (
    student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    question_ids uuid[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    band smallint CONSTRAINT placement_sessions_band_check CHECK (((band >= 1) AND (band <= 4))));

  CREATE FUNCTION public.auth_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS $f$ SELECT role FROM public.profiles WHERE id = auth.uid() $f$;

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.placement_sessions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "staff read questions" ON public.questions FOR SELECT TO authenticated
    USING ((SELECT public.auth_profile_role()) = ANY (ARRAY['teacher', 'super_admin']));
  CREATE POLICY "students read own question_instances" ON public.question_instances FOR SELECT TO authenticated
    USING (student_id = (SELECT auth.uid()));
  CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));

  -- Live table privileges (has_table_privilege, 2026-10-22).
  REVOKE ALL ON public.profiles, public.questions, public.question_instances, public.placement_sessions FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.questions, public.question_instances, public.placement_sessions TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
  GRANT UPDATE, DELETE ON public.question_instances TO authenticated;
  GRANT SELECT (id, student_id, question_id, answered, answered_at, was_correct, user_answer, created_at,
    next_review_at, repeat_count, teacher_score, teacher_feedback) ON public.question_instances TO authenticated;
  GRANT SELECT ON public.profiles TO authenticated;
`;

// The migrations, in production order.
export const LEVEL_ENGINE_MIGRATIONS = Object.freeze([
  "20261019150000_question_format_mix.sql",
  "20261020120000_difficulty_scale_a.sql",
  "20261029120000_difficulty_scale_b.sql",
]);
