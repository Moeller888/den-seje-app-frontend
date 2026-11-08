-- D-365: drop the placement test's two RPCs (owner decision 2026-11-08).
--
-- Pupils stopped taking the placement test in D-356, and D-360 removed its client code, so
-- start_placement() and submit_placement(jsonb) have no caller. This drops exactly those two
-- functions. Nothing else changes:
--   - public.placement_sessions stays. advance_student_band and the level fold seed a pupil's band
--     from a completed session, so pupils who took the test keep their start.
--   - profiles.placement_band stays. app.js and the teacher pages still read it.
--   - No table, column, policy, other function or grant is touched.
--
-- Plain DROP FUNCTION, without IF EXISTS: a second run fails loudly instead of passing silently.
-- Dropping a function also removes its EXECUTE grants.

DROP FUNCTION public.start_placement();
DROP FUNCTION public.submit_placement(jsonb);
