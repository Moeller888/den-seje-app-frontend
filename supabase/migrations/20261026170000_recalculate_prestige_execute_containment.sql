-- Temporary containment for public.recalculate_prestige(uuid) (D-220).
-- Only EXECUTE privileges change; authenticated keeps its own direct grant.
-- The function definition and all other database objects remain unchanged.

REVOKE EXECUTE ON FUNCTION public.recalculate_prestige(uuid)
FROM PUBLIC, anon, service_role;
