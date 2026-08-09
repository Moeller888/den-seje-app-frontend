-- Section 117 — Orphan Cleanup Sprint

-- STEP 1: Fix NULL difficulty_band and target_grade
UPDATE public.questions
SET
  difficulty_band = 2,
  target_grade    = 8
WHERE id = 'ae576bbe-9c7f-465e-929f-5455bef90688';

-- STEP 2: Deactivate the 9 recall-level orphans (cannot migrate — would violate unique_auto_objective_level)
UPDATE public.questions
SET is_active = false
WHERE id IN (
  '5bbc17ae-00ac-4ed2-b773-1f7bc5538095',
  'c370d20d-fdf3-453d-92d3-dafa10aa8fa9',
  '89396d88-2bd0-4484-b51c-1eeda36672c2',
  '3e6be961-13fe-4d9e-bc36-73cd6c480683',
  '5a1bd120-5df7-4042-8878-7d32b27c3240',
  'b46a54e2-221a-49e8-b0c7-23857ac3deb3',
  'e1441657-8e58-4d7a-be24-0362164a7f58',
  '28b1ac82-92f6-4baf-b14d-d97180736eb5',
  'dac73291-c73c-47a0-8514-b0469d34ddd8'
);

-- STEP 3: Migrate the 34 NULL-cognitive_level orphans to world_war_2
UPDATE public.questions
SET learning_objective = 'world_war_2'
WHERE learning_objective NOT IN (
  'prehistoric_denmark','vikings','middle_ages','reformation_monarchy',
  'enlightenment','revolutions_democracy','industrialisation',
  'world_war_1','world_war_2','cold_war','democracy_power'
)
AND learning_objective IS NOT NULL
AND is_active = true;;
