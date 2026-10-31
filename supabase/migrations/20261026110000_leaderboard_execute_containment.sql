-- Temporary containment for public.get_leaderboard().
-- Only EXECUTE privileges change.
-- The function definition and all other database objects remain unchanged.

REVOKE EXECUTE ON FUNCTION public.get_leaderboard()
FROM PUBLIC, anon, authenticated, service_role;
