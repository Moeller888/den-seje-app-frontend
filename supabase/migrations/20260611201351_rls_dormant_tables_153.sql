-- Section 153: RLS hardening for dormant legacy tables.
-- Deny-all posture: RLS enabled with NO policies + default grants revoked.
-- service_role and owner-rights views (attempt_stats, question_performance)
-- are unaffected by design. Rollback: DISABLE ROW LEVEL SECURITY + GRANT ALL.

ALTER TABLE public.student_answers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempt_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.student_answers        FROM anon, authenticated;
REVOKE ALL ON public.question_attempt_audit FROM anon, authenticated;;
