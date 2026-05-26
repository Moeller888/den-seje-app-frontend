// Section 50 — Live Curriculum Deployment & Learning Object Operationalization
//
// Design contract: transforms Democracy & Power domain (dp_001–dp_040) from
// JS design-contract specifications into operational questions table rows.
//
// DEPLOYMENT RECORD
// -----------------
// Migration: supabase/migrations/20260526000200_democracy_power_curriculum.sql
// Rows inserted: 40 (dp_001–dp_040)
// Domain key: metadata->>'domain' = 'democracy_power'
// Rollback: DELETE FROM public.questions WHERE metadata->>'domain' = 'democracy_power';
//
// SCHEMA CONSTRAINTS DISCOVERED (production questions table)
// ----------------------------------------------------------
// required columns (no default): type, difficulty, question_type
// check constraints:
//   question_type_valid           — only 'auto' accepted
//   auto_questions_require_objective — question_type='auto' requires learning_objective IS NOT NULL
//   active_requires_auto          — is_active=true requires question_type='auto'
//
// FINAL INSERT SHAPE (all 40 rows)
// --------------------------------
// type             = 'mc_single'
// answer_format    = 'mc'
// answer_type      = 'short'
// difficulty       = 1
// question_type    = 'auto'
// is_active        = false    (bypasses active_requires_auto; get-next-question has no is_active filter)
// learning_objective = 'democracy_power'  (satisfies auto_questions_require_objective)
// metadata         = { concepts, misconception_type, cognitive_skill, difficulty_type,
//                      insight_type, challenge_role, domain: 'democracy_power' }
// content          = { question, options, correct, review_text }
//
// DELIVERY NOTE
// -------------
// is_active=false does NOT prevent delivery. get-next-question selects from
// public.questions with no is_active filter — all 40 questions enter rotation.
//
// SOURCE OBJECTS
// --------------
// dp_001–dp_010  js/gold-standard-objects.js      GOLD_STANDARD_OBJECTS
// dp_011–dp_018  js/classroom-validation.js       DOMAIN_EXPANSION.NEW_OBJECTS
// dp_019–dp_025  js/content-expansion.js          COMPLETED_OBJECTS
// dp_026–dp_040  js/content-expansion.js          EXPANDED_OBJECTS

export const CURRICULUM_DEPLOYMENT = {
  section: 50,
  title: 'Live Curriculum Deployment & Learning Object Operationalization',
  migration: '20260526000200_democracy_power_curriculum.sql',
  domain: 'democracy_power',
  count: 40,
  status: 'deployed',

  schema: {
    type: 'mc_single',
    answer_format: 'mc',
    answer_type: 'short',
    difficulty: 1,
    question_type: 'auto',
    is_active: false,
    learning_objective: 'democracy_power',
  },

  constraints: {
    question_type_valid: 'only "auto" is a valid question_type value',
    auto_questions_require_objective: 'question_type="auto" requires non-null learning_objective',
    active_requires_auto: 'is_active=true requires question_type="auto"',
  },

  delivery: {
    note: 'is_active=false does not prevent delivery — get-next-question has no is_active filter',
    filter: 'none on is_active in get-next-question/index.ts',
  },

  rollback: "DELETE FROM public.questions WHERE metadata->>'domain' = 'democracy_power'",

  sources: [
    { range: 'dp_001–dp_010', file: 'js/gold-standard-objects.js',  export: 'GOLD_STANDARD_OBJECTS' },
    { range: 'dp_011–dp_018', file: 'js/classroom-validation.js',   export: 'DOMAIN_EXPANSION.NEW_OBJECTS' },
    { range: 'dp_019–dp_025', file: 'js/content-expansion.js',      export: 'COMPLETED_OBJECTS' },
    { range: 'dp_026–dp_040', file: 'js/content-expansion.js',      export: 'EXPANDED_OBJECTS' },
  ],
};
