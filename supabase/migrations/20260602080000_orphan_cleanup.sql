-- Section 117 — Orphan Cleanup Sprint
-- Restores full routing integrity for 43 active orphan questions.
--
-- Constraint analysis:
--   unique_auto_objective_level: UNIQUE (learning_objective, cognitive_level) WHERE question_type='auto'
--   unique_active_objective_level: UNIQUE (learning_objective, cognitive_level) WHERE is_active=true
--   Both enforce one auto/active row per (domain, cognitive_level) for non-NULL cognitive_level values.
--
-- Orphan breakdown:
--   34 orphans have cognitive_level=NULL  → safe to migrate to world_war_2 (NULLs are distinct in btree)
--    9 orphans have cognitive_level='recall' → cannot all migrate to world_war_2 (would produce 9 duplicate
--       (world_war_2, recall) rows). These are legacy simple-recall questions already covered by the
--       138 existing world_war_2 questions. Action: deactivate.
--    1 orphan has NULL difficulty_band and NULL target_grade → patch before migrating.
--
-- No content deleted. Records set to is_active=false are retired, not removed.

-- ─── STEP 1: Fix NULL difficulty_band and target_grade ────────────────────────
-- ww2_military_operation_barbarossa_start_year (ae576bbe)
-- Companion question ww2_military_operation_barbarossa_target_country has difficulty_band=2, target_grade=8.

UPDATE public.questions
SET
  difficulty_band = 2,
  target_grade    = 8
WHERE id = 'ae576bbe-9c7f-465e-929f-5455bef90688';

-- ─── STEP 2: Deactivate the 9 recall-level orphans ────────────────────────────
-- These cannot be migrated as a group: all 9 have cognitive_level='recall' and migrating them
-- to world_war_2 would violate unique_auto_objective_level.

UPDATE public.questions
SET is_active = false
WHERE id IN (
  '5bbc17ae-00ac-4ed2-b773-1f7bc5538095', -- _turning_point
  'c370d20d-fdf3-453d-92d3-dafa10aa8fa9', -- ww2_event_battle_bulge_start_year
  '89396d88-2bd0-4484-b51c-1eeda36672c2', -- ww2_event_d_day_start_year
  '3e6be961-13fe-4d9e-bc36-73cd6c480683', -- ww2_event_kursk_battle_start_year
  '5a1bd120-5df7-4042-8878-7d32b27c3240', -- ww2_event_midway_battle_start_year
  'b46a54e2-221a-49e8-b0c7-23857ac3deb3', -- ww2_event_pearl_harbor_attack_start_year
  'e1441657-8e58-4d7a-be24-0362164a7f58', -- ww2_event_potsdam_conference_start_year
  '28b1ac82-92f6-4baf-b14d-d97180736eb5', -- ww2_event_stalingrad_battle_start_year
  'dac73291-c73c-47a0-8514-b0469d34ddd8'  -- ww2_event_tehran_conference_start_year
);

-- ─── STEP 3: Migrate the 34 NULL-cognitive_level orphans to world_war_2 ───────
-- cognitive_level=NULL rows are not subject to the uniqueness constraint (each NULL is distinct in btree).
-- Remaining active orphans after Step 2 all have cognitive_level=NULL.

UPDATE public.questions
SET learning_objective = 'world_war_2'
WHERE learning_objective NOT IN (
  'prehistoric_denmark','vikings','middle_ages','reformation_monarchy',
  'enlightenment','revolutions_democracy','industrialisation',
  'world_war_1','world_war_2','cold_war','democracy_power'
)
AND learning_objective IS NOT NULL
AND is_active = true;
