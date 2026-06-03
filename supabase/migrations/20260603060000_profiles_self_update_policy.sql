-- Section 132: Allow students to update their own adaptive state columns.
-- Previously the profiles table had only a SELECT policy, causing placement_band
-- and current_band writes from the student app to be silently discarded.

-- SECURITY DEFINER function: reads the calling user's current role without
-- triggering RLS recursion (executes as function owner, bypassing row security).
CREATE OR REPLACE FUNCTION public.auth_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- UPDATE policy: authenticated users may update their own profile row.
-- WITH CHECK prevents role escalation: the role column must not change.
CREATE POLICY "profiles_self_update"
ON profiles
FOR UPDATE
TO authenticated
USING  (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = public.auth_profile_role()
);
