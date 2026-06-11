-- Section 153: RLS hardening for dormant legacy tables.
--
-- public.student_answers (last write 2026-04-04) and
-- public.question_attempt_audit (last write 2026-03-08) are written and read
-- by NOTHING in the current system: no frontend page, no Edge Function, no
-- DB function, no trigger (verified across repo + pg_proc 2026-06-12).
-- Both carried full default grants to anon/authenticated with RLS disabled —
-- anyone with the public anon key could read, modify, or truncate them.
-- student_answers contains answer text + student ids (personal data, minors).
--
-- Posture: deny-all for client roles.
--   - RLS enabled with deliberately NO policies.
--   - Default grants revoked (defense in depth: a future accidentally
--     permissive policy still exposes nothing without a grant).
--
-- Unaffected by design:
--   - service_role (bypasses RLS by role attribute) — admin fixtures/tests.
--   - attempt_stats / question_performance views (owner-rights views read
--     the base table with the owner's privileges; admin.js keeps working).
--
-- Rollback (lossless, instant):
--   ALTER TABLE public.student_answers        DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.question_attempt_audit DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON public.student_answers        TO anon, authenticated;
--   GRANT ALL ON public.question_attempt_audit TO anon, authenticated;

ALTER TABLE public.student_answers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempt_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.student_answers        FROM anon, authenticated;
REVOKE ALL ON public.question_attempt_audit FROM anon, authenticated;

-- Deliberately no CREATE POLICY statements: no client code path reads or
-- writes these tables. Add scoped policies only when a real consumer exists.
