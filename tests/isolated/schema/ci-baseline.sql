-- CI BASELINE (D-110) — the application tables the repository migrations ALTER but never CREATE.
-- FOR THE ISOLATED E2E DATABASE ONLY. Never applied to production (it would fail: the tables exist).
--
-- SOURCE: read-only catalog METADATA of production, read 2026-10-25 (information_schema.columns,
-- pg_constraint, pg_indexes, pg_class.relrowsecurity, pg_policies, role_table_grants, pg_trigger) plus
-- definitions the repository already records verbatim (section B). No table row was read; nothing
-- here is data. Owner decision 2026-10-27: this sanitised DDL is public; production FUNCTION BODIES
-- are not — the three functions production has but the repository does not create are replaced by
-- CI stubs written from the repository's own contracts (tests/isolated/schema/ci-function-stubs.sql).
--
-- Reviewed before commit: no row, e-mail address, user id, name, secret, key, token, URL or function
-- body. Constraint texts are curriculum patterns (ww2_*). Views are production's pg_get_viewdef as
-- already committed in tests/unit/analytics-views-lockdown-migration-run.test.mjs.
--
-- Deliberately NOT here (documented, not guessed):
--   * FK profiles.active_title → titles(id): `titles` is created by a later repository migration.
--   * Policies that call auth_profile_role() (created by a later migration): profiles_select,
--     profiles_self_update, "staff read questions" — the later migrations create them.
--   * Column-level grants: later repository migrations set them (see the note under the grants).

-- ── questions ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  ai_model text,
  ai_prompt_version text,
  ai_generator text,
  answer_type text DEFAULT 'short'::text,
  metadata jsonb,
  target_grade smallint,
  difficulty_band smallint,
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT active_requires_auto CHECK (((NOT is_active) OR (question_type = 'auto'::text))),
  CONSTRAINT auto_questions_require_objective CHECK (((question_type <> 'auto'::text) OR (learning_objective IS NOT NULL))),
  CONSTRAINT auto_requires_correct CHECK (((question_type <> 'auto'::text) OR ((content ->> 'correct'::text) IS NOT NULL))),
  CONSTRAINT content_valid_check CHECK (((jsonb_typeof(content) = 'object'::text) AND (content ? 'question'::text) AND (content ? 'correct'::text) AND ((((content ->> 'type'::text) = 'mc'::text) AND (content ? 'options'::text) AND (jsonb_typeof((content -> 'options'::text)) = 'array'::text) AND (jsonb_array_length((content -> 'options'::text)) > 0)) OR ((content ->> 'type'::text) = ANY (ARRAY['text'::text, 'number'::text]))))),
  CONSTRAINT question_type_valid CHECK ((question_type = ANY (ARRAY['auto'::text, 'open'::text]))),
  CONSTRAINT questions_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 1000))),
  CONSTRAINT ww2_attribute_whitelist_check CHECK (((question_type <> 'auto'::text) OR (learning_objective !~~ 'ww2_%'::text) OR ((learning_objective ~~ '%_start_year'::text) OR (learning_objective ~~ '%_end_year'::text) OR (learning_objective ~~ '%_duration_years'::text) OR (learning_objective ~~ '%_definition'::text) OR (learning_objective ~~ '%_role'::text) OR (learning_objective ~~ '%_country'::text) OR (learning_objective ~~ '%_target_country'::text) OR (learning_objective ~~ '%_location'::text) OR (learning_objective ~~ '%_outcome'::text) OR (learning_objective ~~ '%_impact'::text) OR (learning_objective ~~ '%_turning_point'::text) OR (learning_objective ~~ '%_name'::text) OR (learning_objective ~~ '%_strategy'::text) OR (learning_objective ~~ '%_main_enemy'::text) OR (learning_objective ~~ '%_alliance_status'::text)))),
  CONSTRAINT ww2_objective_format_check CHECK (((question_type <> 'auto'::text) OR (learning_objective !~~ 'ww2_%'::text) OR (learning_objective ~ '^ww2_[a-z0-9]+_[a-z0-9_]+_[a-z0-9_]+$'::text))),
  CONSTRAINT year_answer_must_be_number CHECK (((answer_format <> 'year'::text) OR ((content ->> 'correct'::text) ~ '^[0-9]{4}$'::text)))
);
CREATE INDEX idx_questions_active_difficulty ON public.questions USING btree (is_active, difficulty);
CREATE INDEX questions_active_difficulty_idx ON public.questions USING btree (difficulty) WHERE (is_active = true);
CREATE UNIQUE INDEX questions_content_hash_unique ON public.questions USING btree (content_hash);
CREATE UNIQUE INDEX unique_active_objective_level ON public.questions USING btree (learning_objective, cognitive_level) WHERE (is_active = true);
CREATE UNIQUE INDEX unique_auto_objective_level ON public.questions USING btree (learning_objective, cognitive_level) WHERE (question_type = 'auto'::text);
CREATE UNIQUE INDEX unique_question_text ON public.questions USING btree (((content ->> 'question'::text)));

-- ── profiles ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role text NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  teacher_id uuid,
  active_avatar text,
  equipped_slots jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_theme text NOT NULL DEFAULT 'default'::text,
  active_title text,
  selected_grade smallint,
  placement_band smallint,
  current_band smallint,
  active_domains text[],
  must_reset_password boolean NOT NULL DEFAULT false,
  avatar_gender text NOT NULL DEFAULT 'neutral'::text,
  avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id),
  CONSTRAINT profiles_avatar_gender_check CHECK ((avatar_gender = ANY (ARRAY['boy'::text, 'girl'::text, 'neutral'::text]))),
  CONSTRAINT profiles_current_band_check CHECK (((current_band IS NULL) OR ((current_band >= 1) AND (current_band <= 5)))),
  CONSTRAINT profiles_placement_band_check CHECK (((placement_band IS NULL) OR ((placement_band >= 1) AND (placement_band <= 4)))),
  CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text, 'super_admin'::text])))
);

-- ── question_instances ────────────────────────────────────────────────────────────────────────
-- (production has no column at ordinal 4 — a dropped column; nothing to reproduce)
CREATE TABLE public.question_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid(),
  question_id uuid NOT NULL,
  correct_answer text NOT NULL,
  difficulty_at_time integer NOT NULL,
  mastery_snapshot integer NOT NULL,
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
  reviewed_at timestamp without time zone,
  reviewed_by uuid,
  misconception_signal text,
  repeat_count integer NOT NULL DEFAULT 0,
  CONSTRAINT question_instances_pkey PRIMARY KEY (id),
  CONSTRAINT question_instances_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE,
  CONSTRAINT question_instances_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT difficulty_matches_mastery CHECK ((difficulty_at_time <= mastery_snapshot))
);
CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE (answered = false);
CREATE INDEX idx_qi_question ON public.question_instances USING btree (question_id);
CREATE INDEX idx_qi_student_created ON public.question_instances USING btree (student_id, created_at DESC);
CREATE INDEX idx_question_instances_student_due ON public.question_instances USING btree (student_id, next_review_at);
CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances USING btree (student_id, question_id);

-- ── question_attempt_audit ────────────────────────────────────────────────────────────────────
CREATE TABLE public.question_attempt_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  question_instance_id uuid NOT NULL,
  is_correct boolean,
  xp_awarded integer,
  already_processed boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT question_attempt_audit_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_question_attempt_audit_instance_id ON public.question_attempt_audit USING btree (question_instance_id);

-- ── student_answers ───────────────────────────────────────────────────────────────────────────
CREATE TABLE public.student_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  question_id uuid NOT NULL,
  answer_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  is_correct boolean,
  teacher_id uuid,
  ai_score numeric,
  ai_feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT student_answers_pkey PRIMARY KEY (id),
  CONSTRAINT student_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE
);
CREATE INDEX idx_student_answers_status ON public.student_answers USING btree (status);

-- ── student_progress ──────────────────────────────────────────────────────────────────────────
CREATE TABLE public.student_progress (
  student_id uuid NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  coins integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  correct_answers integer NOT NULL DEFAULT 0,
  total_correct_answers integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  mastery_level integer NOT NULL DEFAULT 1,
  mastery_balance integer NOT NULL DEFAULT 0,
  total_attempts integer NOT NULL DEFAULT 0,
  mastery_score numeric DEFAULT 1000,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_activity_date date,
  night_correct boolean NOT NULL DEFAULT false,
  best_session_streak integer NOT NULL DEFAULT 0,
  prestige_score integer NOT NULL DEFAULT 0,
  CONSTRAINT student_progress_pkey PRIMARY KEY (student_id),
  CONSTRAINT student_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT coins_non_negative CHECK ((coins >= 0)),
  CONSTRAINT correct_answers_non_negative CHECK ((correct_answers >= 0)),
  CONSTRAINT level_minimum CHECK ((level >= 1)),
  CONSTRAINT total_correct_answers_non_negative CHECK ((total_correct_answers >= 0)),
  CONSTRAINT xp_non_negative CHECK ((xp >= 0))
);
CREATE INDEX student_progress_level_idx ON public.student_progress USING btree (level);

-- ── shop_items / user_items ───────────────────────────────────────────────────────────────────
CREATE TABLE public.shop_items (
  id text NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price integer NOT NULL,
  type text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  image_url text,
  rarity text NOT NULL DEFAULT 'common'::text,
  slot_type text,
  layer_order integer,
  CONSTRAINT shop_items_pkey PRIMARY KEY (id),
  CONSTRAINT shop_items_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'legendary'::text])))
);
CREATE TABLE public.user_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  item_id text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT user_items_pkey PRIMARY KEY (id),
  CONSTRAINT user_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.shop_items(id) ON DELETE CASCADE,
  CONSTRAINT user_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX user_item_unique ON public.user_items USING btree (user_id, item_id);

-- ── RLS: enabled on all eight (production) ────────────────────────────────────────────────────
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempt_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;

-- ── Policies that depend only on auth.uid() (production) ─────────────────────────────────────
CREATE POLICY "Student can read own progress" ON public.student_progress AS PERMISSIVE FOR SELECT TO public USING ((student_id = auth.uid()));
CREATE POLICY "Students can read own progress" ON public.student_progress AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = student_id));
CREATE POLICY "Users can read own progress" ON public.student_progress AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = student_id));
-- NOT here (depend on auth_profile_role(), created by a later migration): profiles_select,
-- profiles_self_update, "staff read questions".

-- ── Table grants (production, roles anon / authenticated / service_role) ──────────────────────
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profiles, public.question_attempt_audit, public.question_instances, public.questions, public.shop_items, public.student_answers, public.student_progress, public.user_items TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.profiles TO anon, authenticated;
GRANT DELETE, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.question_instances TO anon, authenticated;
GRANT DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.questions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.questions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.shop_items, public.student_progress, public.user_items TO anon, authenticated;
-- Column grants in production beyond these: authenticated UPDATE (current_band, placement_band) on
-- profiles; authenticated SELECT on every question_instances column EXCEPT correct_answer. Later
-- repository migrations (answer keys server-side, profiles self-update columns) set exactly these;
-- they are not duplicated here.


-- ══ B. Definitions the repository records verbatim (pre-migration state) ═══════════════════════
-- Source: supabase/migrations/20261015120000_question_instances_server_owned_insert.sql (ROLLBACK
-- comment) — the two INSERT policies that migration drops.
CREATE POLICY "Students can insert own instances" ON public.question_instances
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (student_id = auth.uid());
CREATE POLICY "students can insert their own instances" ON public.question_instances
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
-- Source: tests/unit/answer-keys-client-paths-lockdown-migration-run.test.mjs (live state 2026-10-16)
-- — the policy 20261018170000_answer_keys_client_paths_lockdown.sql drops.
CREATE POLICY "allow read questions" ON public.questions AS PERMISSIVE FOR SELECT TO public USING (true);

-- Source: tests/unit/analytics-views-lockdown-migration-run.test.mjs (fixture). student_events is NOT
-- in the approved metadata scope: this is the fixture's test shape (only the columns the views read),
-- flagged for metadata verification before it is relied on beyond the analytics views.
CREATE TABLE public.student_events (id serial PRIMARY KEY, student_id uuid NOT NULL, type text NOT NULL,
    payload jsonb, created_at timestamptz NOT NULL DEFAULT '2026-03-01T00:00:00Z');
ALTER TABLE public.student_events ENABLE ROW LEVEL SECURITY;

-- Source: tests/unit/analytics-views-lockdown-migration-run.test.mjs, LIVE_VIEWS = pg_get_viewdef of
-- production, 2026-10-16, verbatim.
CREATE VIEW public.analytics_question_attempts AS
 SELECT student_id,
    (payload ->> 'question_instance_id'::text) AS question_instance_id,
    (payload ->> 'question_id'::text) AS question_id,
    ((payload ->> 'difficulty'::text))::integer AS difficulty,
    ((payload ->> 'mastery_level'::text))::integer AS mastery_level,
    ((payload ->> 'mastery_balance'::text))::integer AS mastery_balance,
    ((payload ->> 'response_time_ms'::text))::integer AS response_time_ms,
        CASE
            WHEN (type = 'OPEN_CORRECT'::text) THEN true
            WHEN (type = 'OPEN_WRONG'::text) THEN false
            ELSE NULL::boolean
        END AS is_correct,
    created_at
   FROM student_events
  WHERE (type = ANY (ARRAY['OPEN_CORRECT'::text, 'OPEN_WRONG'::text]));

CREATE VIEW public.analytics_student_summary AS
 SELECT student_id,
    count(*) AS total_attempts,
    sum(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_answers,
    sum(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong_answers,
    round(((sum(CASE WHEN is_correct THEN 1 ELSE 0 END))::numeric / (count(*))::numeric), 2) AS success_rate,
    avg(response_time_ms) AS avg_response_time_ms
   FROM analytics_question_attempts
  GROUP BY student_id;

CREATE VIEW public.attempt_stats AS
 SELECT student_id,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE ((is_correct = true) AND (already_processed = false))) AS correct_attempts,
    count(*) FILTER (WHERE ((is_correct = false) AND (already_processed = false))) AS incorrect_attempts,
    count(*) FILTER (WHERE (already_processed = true)) AS retry_attempts,
    sum(xp_awarded) AS total_xp_awarded,
    max(created_at) AS last_attempt_at
   FROM question_attempt_audit
  GROUP BY student_id;

CREATE VIEW public.question_diagnostics AS
 SELECT q.id,
    (q.content ->> 'question'::text) AS question,
    count(qi.id) AS attempts,
    sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END) AS correct,
    round(((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric), 2) AS success_rate,
        CASE
            WHEN (count(qi.id) < 10) THEN 'insufficient_data'::text
            WHEN (((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric) < 0.35) THEN 'likely_bad_question'::text
            WHEN (((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric) < 0.6) THEN 'very_difficult'::text
            WHEN (((sum(CASE WHEN qi.is_correct THEN 1 ELSE 0 END))::numeric / (NULLIF(count(qi.id), 0))::numeric) < 0.85) THEN 'good_difficulty'::text
            ELSE 'too_easy'::text
        END AS quality_flag
   FROM (questions q
     LEFT JOIN question_instances qi ON ((qi.question_id = q.id)))
  GROUP BY q.id, q.content;

CREATE VIEW public.question_performance AS
 SELECT qi.question_id,
    count(*) FILTER (WHERE (a.already_processed = false)) AS total_attempts,
    count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))) AS correct_attempts,
    count(*) FILTER (WHERE ((a.is_correct = false) AND (a.already_processed = false))) AS incorrect_attempts,
    count(*) FILTER (WHERE (a.already_processed = true)) AS retry_attempts,
    round(((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric), 2) AS success_rate_percent,
    sum(a.xp_awarded) AS total_xp_generated,
        CASE
            WHEN ((count(*) FILTER (WHERE (a.already_processed = false)) >= 10) AND (((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric) < (40)::numeric)) THEN 'problem'::text
            WHEN ((count(*) FILTER (WHERE (a.already_processed = false)) >= 5) AND (((100.0 * (count(*) FILTER (WHERE ((a.is_correct = true) AND (a.already_processed = false))))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.already_processed = false)), 0))::numeric) < (60)::numeric)) THEN 'warning'::text
            ELSE 'healthy'::text
        END AS health_status
   FROM (question_attempt_audit a
     JOIN question_instances qi ON ((qi.id = a.question_instance_id)))
  GROUP BY qi.question_id;

CREATE VIEW public.ww2_taxonomy_audit AS
 SELECT id,
    learning_objective,
        CASE
            WHEN (learning_objective ~~ 'ww2_event_%'::text) THEN 'event'::text
            ELSE NULL::text
        END AS entity_type,
    (learning_objective ~ '^ww2_[a-z0-9]+_[a-z0-9_]+_[a-z0-9_]+$'::text) AS structure_ok
   FROM questions
  WHERE ((question_type = 'auto'::text) AND (learning_objective ~~ 'ww2_%'::text));
