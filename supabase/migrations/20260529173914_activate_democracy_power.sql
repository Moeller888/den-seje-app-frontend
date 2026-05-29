-- Section 75 — is_active Semantics Cleanup
-- Activates all democracy_power questions (70 total).
--
-- Context:
-- get-next-question now filters on is_active=true.
-- D&P questions were staged as is_active=false in S71 — not a quality decision.
-- 122 question_instances already exist for D&P questions (students assigned pre-filter).
-- Keeping is_active=false would orphan those instances and remove all Band 4-5 content.
--
-- After this migration: both domains (democracy_power + world_war_2) are live.

UPDATE public.questions
SET is_active = true
WHERE metadata->>'domain' = 'democracy_power'
  AND is_active = false;
